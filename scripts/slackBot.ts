/**
 * Bankr CRM Slack bot — an always-on Socket Mode worker (a THIRD Railway
 * service, separate from web + cron). Holds a WebSocket to Slack, listens for
 * @-mentions and DMs, resolves the Slack user to a CRM user by email, runs the
 * SHARED agent brain (agentRun), and posts the answer back. No public HTTP
 * endpoint, no signature dance — Socket Mode fits the slow agent loop.
 *
 * Run: tsx scripts/slackBot.ts   (wired as `npm run slack:bot`)
 * Needs env: SLACK_APP_TOKEN (xapp-…, socket) + SLACK_BOT_TOKEN (xoxb-…, posting).
 */
import { SocketModeClient } from '@slack/socket-mode';
import { WebClient } from '@slack/web-api';
import { prisma } from '../src/lib/prisma';
import { agentRun } from '../src/lib/agentRun';
import { llmConfigured, type ToolMessage } from '../src/lib/llm';

const APP_TOKEN = process.env.SLACK_APP_TOKEN || '';
const BOT_TOKEN = process.env.SLACK_BOT_TOKEN || '';

if (!APP_TOKEN || !BOT_TOKEN) {
  console.error('[slackbot] missing SLACK_APP_TOKEN or SLACK_BOT_TOKEN — set them as Railway shared vars.');
  process.exit(1);
}
if (!llmConfigured()) {
  console.error('[slackbot] LLM not configured (BANKR_LLM_* env) — the agent cannot run.');
  process.exit(1);
}

const web = new WebClient(BOT_TOKEN);
const socket = new SocketModeClient({ appToken: APP_TOKEN });

// Cache the bot's own user id so we can strip the mention + ignore self-messages.
let botUserId: string | null = null;

// Resolve a Slack user → CRM identity by email. Unmapped → read-only GUEST.
async function resolveIdentity(slackUserId: string): Promise<{ userId: string; userEmail?: string; role: string; mapped: boolean }> {
  try {
    const info = await web.users.info({ user: slackUserId });
    const email = (info as any)?.user?.profile?.email as string | undefined;
    if (email) {
      const user = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true, role: true, active: true } });
      if (user && user.active) {
        return { userId: user.id, userEmail: user.email, role: user.role, mapped: true };
      }
    }
  } catch (e: any) {
    console.error('[slackbot] identity lookup failed:', e?.message ?? e);
  }
  // Unmapped: a sentinel role that fails every can() check → reads work, writes blocked.
  return { userId: `slack:${slackUserId}`, userEmail: undefined, role: 'GUEST', mapped: false };
}

// Strip the leading bot mention from a message ("<@U123> hello" → "hello").
function stripMention(text: string): string {
  return text.replace(/<@[A-Z0-9]+>/g, '').trim();
}

// Turn the agent's plain-text answer into Slack-friendly text. The answer may
// already contain mrkdwn code blocks (e.g. report tables) — leave those intact.
function toSlackText(answer: string, capped?: boolean): string {
  const body = answer || "I didn't get a usable answer — try rephrasing?";
  return capped ? `${body}\n\n_(I cut this off to stay responsive — ask for a narrower slice if needed.)_` : body;
}

async function handleQuestion(channel: string, threadTs: string | undefined, slackUserId: string, rawText: string) {
  const question = stripMention(rawText);
  if (!question) {
    await web.chat.postMessage({ channel, thread_ts: threadTs, text: 'Ask me about the pipeline — e.g. "who should I reach out to?" or "how many projects are in onboarding?"' });
    return;
  }

  const id = await resolveIdentity(slackUserId);
  const history: ToolMessage[] = [{ role: 'user', content: question }];

  try {
    const result = await agentRun({
      history,
      submissions: [], // the bot has no client-side slice; tools read from the DB directly
      ctx: { userId: id.userId, userEmail: id.userEmail, role: id.role },
      budgetMs: 60_000,
    });

    let text = toSlackText(result.answer, result.capped);
    if (result.error) text = `Sorry — the assistant hit an error: ${result.error}`;
    // If an unmapped guest tried a write, the tool already returned a permission
    // message in the answer; add a gentle hint the first time.
    if (!id.mapped && result.toolTrace.some((t) => ['propose_edit', 'create_submission', 'ingest_project', 'create_slack_report', 'create_scheduled_job'].includes(t.name))) {
      text += `\n\n_I can answer questions for anyone, but making changes needs a CRM account. Ask an admin to add you (matched by your Slack email)._`;
    }
    await web.chat.postMessage({ channel, thread_ts: threadTs, text });
  } catch (e: any) {
    console.error('[slackbot] agentRun failed:', e?.message ?? e);
    await web.chat.postMessage({ channel, thread_ts: threadTs, text: 'Something went wrong handling that — try again in a moment.' });
  }
}

// app_mention: someone @-mentioned the bot in a channel.
socket.on('app_mention', async ({ event, ack }: any) => {
  await ack();
  if (!event || event.bot_id || event.user === botUserId) return;
  await handleQuestion(event.channel, event.thread_ts || event.ts, event.user, event.text || '');
});

// message: DMs to the bot (channel_type === 'im'), ignore the bot's own + non-DMs.
socket.on('message', async ({ event, ack }: any) => {
  await ack();
  if (!event || event.bot_id || event.user === botUserId) return;
  if (event.channel_type !== 'im') return; // only DMs here; channels go via app_mention
  if (event.subtype) return; // ignore edits/joins/etc.
  await handleQuestion(event.channel, event.thread_ts, event.user, event.text || '');
});

async function main() {
  const auth = await web.auth.test();
  botUserId = (auth as any).user_id || null;
  console.log(`[slackbot] authed as ${(auth as any).user} (${botUserId}) in team ${(auth as any).team}`);
  await socket.start();
  console.log('[slackbot] socket mode connected — listening for mentions + DMs.');
}

main().catch((e) => {
  console.error('[slackbot] fatal:', e?.message ?? e);
  process.exit(1);
});
