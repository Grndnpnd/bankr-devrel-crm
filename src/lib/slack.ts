import { prisma } from '@/lib/prisma';

/**
 * Slack OUTBOUND. We send via incoming webhooks (a URL per destination) rather
 * than the Web API — chosen for flexibility: each user configures their own
 * channel by pasting a webhook, and an admin sets a team-wide one. No OAuth, no
 * channel-ID juggling. (Inbound is separate — that's the Socket Mode worker.)
 */

export interface SlackMessage {
  text: string;                 // fallback / notification text (required by Slack)
  blocks?: any[];               // optional Block Kit blocks for rich formatting
}

/** Low-level: POST a message to a specific incoming-webhook URL. */
export async function sendSlackWebhook(webhookUrl: string, msg: SlackMessage): Promise<{ ok: boolean; error?: string }> {
  if (!webhookUrl) return { ok: false, error: 'no webhook url' };
  const ctl = new AbortController();
  const timeout = setTimeout(() => ctl.abort(), 10_000);
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: ctl.signal,
      body: JSON.stringify(msg.blocks ? { text: msg.text, blocks: msg.blocks } : { text: msg.text }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { ok: false, error: `slack ${res.status}${body ? `: ${body.slice(0, 120)}` : ''}` };
    }
    return { ok: true };
  } catch (e: any) {
    if (e?.name === 'AbortError') return { ok: false, error: 'slack webhook timed out' };
    return { ok: false, error: e?.message ?? 'slack send failed' };
  } finally {
    clearTimeout(timeout);
  }
}

/** Resolve a user's configured webhook (by email), falling back to the team webhook. */
export async function resolveUserWebhook(email?: string): Promise<string | null> {
  if (email) {
    const user = await prisma.user.findUnique({ where: { email }, select: { slackWebhook: true } });
    if (user?.slackWebhook) return user.slackWebhook;
  }
  return getTeamWebhook();
}

/** The admin-set team-wide webhook (from the AppConfig singleton). */
export async function getTeamWebhook(): Promise<string | null> {
  const cfg = await prisma.appConfig.findUnique({ where: { id: 'default' }, select: { teamSlackWebhook: true } });
  return cfg?.teamSlackWebhook || null;
}

/** Convenience: send to a user (their webhook or team fallback). */
export async function sendSlackToUser(email: string | undefined, msg: SlackMessage): Promise<{ ok: boolean; error?: string }> {
  const url = await resolveUserWebhook(email);
  if (!url) return { ok: false, error: 'no webhook configured for this user or team' };
  return sendSlackWebhook(url, msg);
}

/** Build simple Block Kit blocks from a markdown-ish report string + title. */
export function reportBlocks(title: string, body: string): any[] {
  return [
    { type: 'header', text: { type: 'plain_text', text: title.slice(0, 150), emoji: true } },
    { type: 'section', text: { type: 'mrkdwn', text: body.slice(0, 2900) } },
    { type: 'context', elements: [{ type: 'mrkdwn', text: `Bankr DevRel CRM · ${new Date().toLocaleString()}` }] },
  ];
}
