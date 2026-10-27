/**
 * Notifications: one row per person per event (the in-app bell and live stream read
 * these), then Web Push to each of that person's devices unless they turned that kind off.
 *
 * Web Push needs VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT (a mailto: or https:
 * URL). Without them notifications still land in the app; push is simply skipped.
 */
import webpush from 'web-push';
import { prisma } from '@/lib/prisma';

export const NOTIFICATION_KINDS: { kind: string; label: string }[] = [
  { kind: 'task.assigned', label: 'A task is assigned to me' },
  { kind: 'task.team', label: 'A task lands on one of my teams with no owner' },
  { kind: 'task.done', label: 'A task I created is done' },
  { kind: 'task.due', label: 'One of my tasks is due within a day' },
  { kind: 'team.added', label: 'I am added to a team' },
  { kind: 'wallet.low', label: 'A watched wallet runs low (or recovers)' },
  { kind: 'beta.reply', label: 'A beta tester replies on a report' },
  { kind: 'support.sla', label: 'A Plain thread routed to my team is about to breach (or breaches) its SLA' },
  { kind: 'support.new', label: 'A new Plain thread arrives for my team (if the route asks for it)' },
];

export interface NotifyInput {
  userIds: string[];
  kind: string;
  title: string;
  body?: string | null;
  url?: string | null;
  /** The person who caused it; never notified about their own action. */
  actorId?: string | null;
}

let vapidReady: boolean | null = null;
export function pushConfigured(): boolean {
  if (vapidReady !== null) return vapidReady;
  const pub = process.env.VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return (vapidReady = false);
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@example.com', pub, priv);
  return (vapidReady = true);
}

export const vapidPublicKey = () => process.env.VAPID_PUBLIC_KEY || null;

function pushWanted(prefs: unknown, kind: string): boolean {
  const p = (prefs as { push?: Record<string, boolean> } | null)?.push;
  return p?.[kind] !== false;
}

/** Create the notifications and push them. Never throws: a failed push must not fail the caller. */
export async function notify(input: NotifyInput): Promise<number> {
  const ids = Array.from(new Set(input.userIds.filter((id) => id && id !== input.actorId)));
  if (!ids.length) return 0;
  try {
    const users = await prisma.user.findMany({
      where: { id: { in: ids }, active: true },
      select: { id: true, notificationPrefs: true, pushSubscriptions: true },
    });
    if (!users.length) return 0;
    await prisma.notification.createMany({
      data: users.map((u) => ({ userId: u.id, kind: input.kind, title: input.title, body: input.body ?? null, url: input.url ?? null })),
    });
    if (pushConfigured()) {
      const payload = JSON.stringify({ title: input.title, body: input.body ?? '', url: input.url ?? '/', tag: input.kind });
      const sends = users
        .filter((u) => pushWanted(u.notificationPrefs, input.kind))
        .flatMap((u) => u.pushSubscriptions)
        .map((s) => sendPush(s, payload));
      await Promise.allSettled(sends);
    }
    return users.length;
  } catch (e) {
    console.error('[notify]', input.kind, e);
    return 0;
  }
}

export async function sendPush(sub: { id: string; endpoint: string; p256dh: string; auth: string }, payload: string) {
  try {
    await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, { TTL: 24 * 3600, timeout: 10_000 });
    await prisma.pushSubscription.update({ where: { id: sub.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
    return true;
  } catch (e: any) {
    // 404/410: the browser dropped this subscription — forget it.
    if (e?.statusCode === 404 || e?.statusCode === 410) {
      await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
    } else {
      console.error('[push]', e?.statusCode ?? '', e?.body ?? e?.message);
    }
    return false;
  }
}

/** Everyone on a team (optionally leaving someone out). */
export async function teamMemberIds(teamId: string): Promise<string[]> {
  const rows = await prisma.teamMember.findMany({ where: { teamId }, select: { userId: true } });
  return rows.map((r) => r.userId);
}
