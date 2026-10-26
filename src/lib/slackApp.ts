/**
 * The Slack app (inbound): "see something in Slack → add it to my tasks".
 *   - Message shortcut "Add to tasks" → a modal prefilled from the message → a task.
 *   - @mention, e.g. "@CRM add this to my tasks" (in a thread: the thread's first message
 *     becomes the task; otherwise the mention text does).
 * HTTP Events API + interactivity on the web service: no separate worker. Requests are
 * verified with the signing secret. Slack users map to CRM users by email.
 *
 * Env: SLACK_BOT_TOKEN (xoxb-…), SLACK_SIGNING_SECRET.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { createTask, PRIORITY_LABEL, type TaskRow } from '@/lib/tasks';

export const slackConfigured = () => !!(process.env.SLACK_BOT_TOKEN && process.env.SLACK_SIGNING_SECRET);
const APP_URL = () => (process.env.APP_URL || '').replace(/\/$/, '');

/** Slack's v0 request signature over the raw body; rejects anything older than 5 minutes. */
export function verifySlack(raw: string, headers: Headers): boolean {
  const secret = process.env.SLACK_SIGNING_SECRET;
  const ts = headers.get('x-slack-request-timestamp');
  const sig = headers.get('x-slack-signature');
  if (!secret || !ts || !sig) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  const want = 'v0=' + createHmac('sha256', secret).update(`v0:${ts}:${raw}`).digest('hex');
  const a = Buffer.from(sig), b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function slack(method: string, body: Record<string, unknown>): Promise<any> {
  // SLACK_API_URL only exists so tests can point at a mock.
  const res = await fetch(`${process.env.SLACK_API_URL || 'https://slack.com/api'}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8', Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8_000),
  });
  const d = await res.json().catch(() => ({ ok: false, error: `http ${res.status}` }));
  if (!d.ok) console.error('[slack]', method, d.error, d.response_metadata?.messages ?? '');
  return d;
}

// Slack user → CRM user, by email (cached 10 minutes).
const userCache = new Map<string, { at: number; user: { id: string; name: string | null; email: string } | null }>();
export async function crmUserForSlack(slackUserId: string) {
  const hit = userCache.get(slackUserId);
  if (hit && Date.now() - hit.at < 600_000) return hit.user;
  const info = await slack('users.info', { user: slackUserId });
  const email = info?.user?.profile?.email as string | undefined;
  const user = email
    ? await prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' }, active: true }, select: { id: true, name: true, email: true } })
    : null;
  userCache.set(slackUserId, { at: Date.now(), user });
  return user;
}

export async function permalink(channel: string, ts: string): Promise<string | null> {
  const d = await slack('chat.getPermalink', { channel, message_ts: ts });
  return d?.permalink ?? null;
}

const firstLine = (text: string) => {
  const clean = text.replace(/<@[A-Z0-9]+>/g, '').replace(/<(https?:[^|>]+)\|([^>]+)>/g, '$2').replace(/<(https?:[^>]+)>/g, '$1').trim();
  const line = clean.split('\n').find((l) => l.trim()) ?? '';
  return line.length > 140 ? `${line.slice(0, 137)}…` : line || 'Task from Slack';
};

// ───────── Message shortcut → modal ─────────

export async function openAddTaskModal(payload: any) {
  const msg = payload.message ?? {};
  const teams = await prisma.team.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } });
  const meta = JSON.stringify({ channel: payload.channel?.id, ts: msg.ts, thread_ts: msg.thread_ts ?? null });
  const opt = (text: string, value: string) => ({ text: { type: 'plain_text', text: text.slice(0, 75) }, value });
  const blocks: any[] = [
    { type: 'input', block_id: 'title', label: { type: 'plain_text', text: 'Task' },
      element: { type: 'plain_text_input', action_id: 'v', initial_value: firstLine(msg.text ?? ''), max_length: 300 } },
    { type: 'input', block_id: 'details', optional: true, label: { type: 'plain_text', text: 'Details' },
      element: { type: 'plain_text_input', action_id: 'v', multiline: true, initial_value: (msg.text ?? '').slice(0, 2900) } },
    { type: 'input', block_id: 'owner', optional: true, label: { type: 'plain_text', text: 'Owner' },
      element: { type: 'users_select', action_id: 'v', initial_user: payload.user?.id } },
  ];
  if (teams.length) {
    blocks.push({ type: 'input', block_id: 'team', optional: true, label: { type: 'plain_text', text: 'Team' },
      element: { type: 'static_select', action_id: 'v', placeholder: { type: 'plain_text', text: 'No team' }, options: teams.slice(0, 100).map((t) => opt(t.name, t.id)) } });
  }
  blocks.push(
    { type: 'input', block_id: 'due', optional: true, label: { type: 'plain_text', text: 'Due' }, element: { type: 'datepicker', action_id: 'v' } },
    { type: 'input', block_id: 'priority', optional: true, label: { type: 'plain_text', text: 'Priority' },
      element: { type: 'static_select', action_id: 'v', initial_option: opt('Normal', '2'), options: PRIORITY_LABEL.map((l, i) => opt(l, String(i))) } },
  );
  return slack('views.open', {
    trigger_id: payload.trigger_id,
    view: { type: 'modal', callback_id: 'add_task', private_metadata: meta, title: { type: 'plain_text', text: 'Add to tasks' },
      submit: { type: 'plain_text', text: 'Add task' }, close: { type: 'plain_text', text: 'Cancel' }, blocks },
  });
}

/** Modal submitted. Returns a Slack response_action body, or null to just close. */
export async function submitAddTaskModal(payload: any): Promise<{ response: any; after?: () => Promise<void> }> {
  const v = payload.view?.state?.values ?? {};
  const meta = JSON.parse(payload.view?.private_metadata || '{}');
  const requester = await crmUserForSlack(payload.user?.id);
  if (!requester) {
    return { response: { response_action: 'errors', errors: { title: 'Your Slack email doesn’t match a CRM account. Ask an admin to add you.' } } };
  }
  const ownerSlack = v.owner?.v?.selected_user as string | undefined;
  const owner = ownerSlack ? (ownerSlack === payload.user?.id ? requester : await crmUserForSlack(ownerSlack)) : null;
  if (ownerSlack && !owner) {
    return { response: { response_action: 'errors', errors: { owner: 'That person has no CRM account (matched by email).' } } };
  }
  const link = meta.channel && meta.ts ? await permalink(meta.channel, meta.ts) : null;
  const due = v.due?.v?.selected_date as string | undefined;
  const { task, existed } = await createTask(requester, {
    title: v.title?.v?.value ?? 'Task from Slack',
    body: v.details?.v?.value ?? null,
    assigneeId: owner?.id ?? null,
    teamId: v.team?.v?.selected_option?.value ?? null,
    dueAt: due ? `${due}T17:00:00Z` : null,
    priority: Number(v.priority?.v?.selected_option?.value ?? 2),
    source: 'slack',
    sourceRef: meta.channel && meta.ts ? `${meta.channel}:${meta.ts}` : undefined,
    sourceUrl: link,
  });
  return {
    response: { response_action: 'clear' },
    after: async () => {
      await slack('chat.postEphemeral', {
        channel: meta.channel, user: payload.user?.id,
        text: existed ? `That message is already a task: ${taskLink(task)}` : `Added to tasks: ${taskLink(task)}${task.assignee ? ` · owner ${task.assignee.name || task.assignee.email}` : ''}${task.team ? ` · ${task.team.name}` : ''}`,
      });
    },
  };
}

const taskLink = (t: TaskRow) => `<${APP_URL()}/tasks?task=${t.id}|${t.title.replace(/[<>|]/g, '')}>`;

// ───────── @mention ─────────

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
export function parseDue(text: string, now = new Date()): string | null {
  const t = text.toLowerCase();
  const iso = t.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (iso) return `${iso[1]}T17:00:00Z`;
  const day = (offset: number) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offset, 17)).toISOString();
  if (/\btoday\b|\beod\b/.test(t)) return day(0);
  if (/\btomorrow\b/.test(t)) return day(1);
  if (/\bnext week\b/.test(t)) return day(7);
  const wd = WEEKDAYS.findIndex((d) => new RegExp(`\\b(by |on |due )?${d}\\b`).test(t));
  if (wd >= 0) return day(((wd - now.getUTCDay() + 7) % 7) || 7);
  return null;
}

const FILLER = /\b(please|pls|hey|can you|could you|add|adding|track|remind( me)?|make|create|put|this|that|it|these|to|on|onto|in|into|my|our|the|a|task|tasks|todo|to-do|list|board|ticket|follow ?up|for|me|by|due|today|tomorrow|eod|next week|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{4}-\d{2}-\d{2})\b/gi;
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The mention minus mentions, team names and command words; '' when nothing of substance is left. */
export function commandLeftover(said: string, teamNames: string[]): string {
  let t = said.replace(/<@[A-Z0-9]+>/g, ' ').replace(/^\s*[:\-–—]+/, ' ');
  for (const n of teamNames) t = t.replace(new RegExp(`\\b${escapeRe(n)}\\b`, 'gi'), ' ');
  // Text after "add task:" / "todo -" is the task itself, so keep it verbatim.
  const colon = said.match(/^(?:<@[A-Z0-9]+>\s*)?(?:add|track|todo|task)[^:]*:\s*(.+)$/is);
  if (colon) return colon[1].replace(/<@[A-Z0-9]+>/g, '').trim();
  const words = t.replace(FILLER, ' ').replace(/[^\p{L}\p{N}'’-]+/gu, ' ').trim().split(/\s+/).filter(Boolean);
  if (words.length < 3) return '';
  // "please remind me to send the recap" → "send the recap"
  return t.replace(/\s+/g, ' ').trim()
    .replace(/^(please|pls|hey|can you|could you)\s+/i, '')
    .replace(/^(remind me to|remind me|add a task to|add|track|create|make)\s+/i, '');
}

const WANTS_TASK = /\b(add|task|todo|to-do|track|remind|ticket|follow ?up)\b/i;

export async function handleMention(ev: any) {
  const botMention = /^<@[A-Z0-9]+>\s*/;
  const said = String(ev.text ?? '').replace(botMention, '');
  const threadTs = ev.thread_ts && ev.thread_ts !== ev.ts ? ev.thread_ts : null;
  const reply = (text: string) => slack('chat.postMessage', { channel: ev.channel, thread_ts: ev.thread_ts ?? ev.ts, text });

  if (!WANTS_TASK.test(said)) {
    return reply('I can turn things into tasks. Mention me in a thread with “add this to my tasks” (or “… for @someone”, “… for Support”, “… by friday”), or use the *Add to tasks* shortcut on any message.');
  }
  const requester = await crmUserForSlack(ev.user);
  if (!requester) return reply('Your Slack email doesn’t match a CRM account, so I can’t add tasks for you yet.');

  const teamsForText = await prisma.team.findMany({ select: { id: true, name: true } });
  // What's left once the command words are gone ("add this to my tasks for @x by friday").
  const leftover = commandLeftover(said, teamsForText.map((t) => t.name));
  // Real words left → they are the task. Just a command → "this/that" is the thread's first
  // message (in a thread) or the message right above (in a channel).
  let source = { text: leftover || said, ts: ev.ts as string };
  if (!leftover) {
    const r = threadTs
      ? await slack('conversations.replies', { channel: ev.channel, ts: threadTs, limit: 1, inclusive: true })
      : await slack('conversations.history', { channel: ev.channel, latest: ev.ts, inclusive: false, limit: 1 });
    const target = r?.messages?.[0];
    if (!target?.text) {
      return reply('I couldn’t read the message you mean. Mention me in that message’s thread (“add this to my tasks”), use the *Add to tasks* shortcut on it, or say the task after a colon: “add task: …”.');
    }
    source = { text: target.text, ts: target.ts ?? threadTs ?? ev.ts };
  }

  // Who and which team: another @person in the mention, team names, else me.
  const others = [...said.matchAll(/<@([A-Z0-9]+)>/g)].map((m) => m[1]).filter((id) => id !== ev.user);
  let assigneeId: string | null = requester.id;
  if (others.length) {
    const u = await crmUserForSlack(others[0]);
    if (!u) return reply(`<@${others[0]}> doesn’t have a CRM account (matched by email).`);
    assigneeId = u.id;
  }
  const team = teamsForText.find((t) => new RegExp(`\\b${escapeRe(t.name)}\\b`, 'i').test(said));
  if (team && !others.length && !/\bmy\b/i.test(said)) assigneeId = null; // "for Support" → the team owns it

  const link = await permalink(ev.channel, source.ts);
  const { task, existed } = await createTask(requester, {
    title: firstLine(source.text),
    body: source.text.slice(0, 5000),
    assigneeId, teamId: team?.id ?? null,
    dueAt: parseDue(said),
    source: 'slack', sourceRef: `${ev.channel}:${source.ts}`, sourceUrl: link,
  });
  const owner = task.assignee ? (task.assignee.id === requester.id ? 'you' : task.assignee.name || task.assignee.email) : null;
  return reply(existed
    ? `That’s already a task: ${taskLink(task)}`
    : `Added ${taskLink(task)}${owner ? ` for ${owner}` : ''}${task.team ? ` · ${task.team.name}` : ''}${task.dueAt ? ` · due ${task.dueAt.toISOString().slice(0, 10)}` : ''}`);
}

/** The app manifest to paste into api.slack.com → Create New App → From a manifest. */
export function slackManifest(appUrl: string, name = 'CRM') {
  return {
    display_information: { name, description: 'Turn Slack messages into tasks on the team board.', background_color: '#1a1a1a' },
    features: {
      bot_user: { display_name: name, always_online: true },
      shortcuts: [{ name: 'Add to tasks', type: 'message', callback_id: 'add_to_tasks', description: 'Make this message a task on the board' }],
    },
    oauth_config: {
      scopes: {
        bot: ['commands', 'chat:write', 'app_mentions:read', 'users:read', 'users:read.email', 'channels:history', 'groups:history', 'im:history', 'mpim:history'],
      },
    },
    settings: {
      event_subscriptions: { request_url: `${appUrl}/api/slack/events`, bot_events: ['app_mention'] },
      interactivity: { is_enabled: true, request_url: `${appUrl}/api/slack/interactions` },
      org_deploy_enabled: false,
      socket_mode_enabled: false,
      token_rotation_enabled: false,
    },
  };
}
