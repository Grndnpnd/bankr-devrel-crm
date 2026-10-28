/**
 * Beta reports ↔ Plain. Each report opens an API thread in Plain (externalId beta_report_<id>),
 * so the support team can work testers in their normal inbox. The conversation stays in step
 * both ways:
 *   CRM team reply   → replyToThread (Plain emails it to the tester)
 *   tester (portal)  → a thread event + the thread back to Todo
 *   Plain team reply → mirrored into the report (webhook email/chat sent)
 *   tester (email)   → mirrored into the report as the tester's reply
 * Pushes are retried by the plain_beta_sync job, so a Plain outage never loses a report.
 */
import { prisma } from '@/lib/prisma';
import {
  addPlainThreadEvent, badge, md, createPlainThread, divider, linkButton, markPlainThreadTodo, plainConfigured,
  plainText, PlainError, replyOnPlainThread, row, spacer, text, upsertPlainCustomer, type PlainComponent,
} from '@/lib/plain';

const APP_URL = () => (process.env.APP_URL || '').replace(/\/$/, '');
const MAX_TRIES = 8;
export const reportExternalId = (id: string) => `beta_report_${id}`;
export const isBetaThread = (thread: any) => typeof thread?.externalId === 'string' && thread.externalId.startsWith('beta_report_');

const KIND = (kind: string, severity: string | null) =>
  kind === 'bug' ? `Bug · ${severity ?? 'minor'}` : kind[0].toUpperCase() + kind.slice(1);
const PRIORITY: Record<string, number> = { blocker: 0, major: 1, minor: 2 };
const SEVERITY_COLOR: Record<string, 'RED' | 'YELLOW' | 'GREY'> = { blocker: 'RED', major: 'YELLOW', minor: 'GREY' };

function reportComponents(r: any): PlainComponent[] {
  const c: PlainComponent[] = [
    row([text(`**${KIND(r.kind, r.severity)}** from ${md(r.tester.name)} in ${md(r.program.name)}`)],
      [...(r.severity ? [badge(r.severity, SEVERITY_COLOR[r.severity] ?? 'GREY')] : []), ...(r.tester.emailVerifiedAt ? [] : [badge('email not verified', 'GREY')])]),
    spacer('S'),
    plainText(r.body),
  ];
  if (r.steps) c.push(spacer('S'), text('**Steps**'), plainText(r.steps));
  if (r.expected) c.push(spacer('S'), text('**Expected**'), plainText(r.expected));
  if (r.actual) c.push(spacer('S'), text('**Actual**'), plainText(r.actual));
  const meta = [r.platform && `Platform: ${r.platform}`, r.pageUrl && `Where: ${r.pageUrl}`, r._count?.attachments && `${r._count.attachments} attachment(s) in the CRM`].filter(Boolean);
  if (meta.length) c.push(spacer('S'), plainText(meta.join('\n'), 'MUTED'));
  c.push(divider(), linkButton('Open in the CRM', `${APP_URL()}/beta/${r.programId}?report=${r.id}`));
  return c;
}

const recordError = (where: 'report' | 'reply', id: string, e: unknown) => {
  const message = e instanceof Error ? e.message : String(e);
  const giveUp = e instanceof PlainError && !e.retriable;
  const data = { plainTries: { increment: giveUp ? MAX_TRIES : 1 } };
  return where === 'report'
    ? prisma.testerReport.update({ where: { id }, data: { ...data, plainError: message.slice(0, 500) } })
    : prisma.testerReply.update({ where: { id }, data });
};

/** Open the report's Plain thread. Returns the thread id, or null when Plain is off for it. */
export async function pushReportToPlain(reportId: string): Promise<string | null> {
  if (!plainConfigured()) return null;
  const r = await prisma.testerReport.findUnique({
    where: { id: reportId },
    include: { tester: true, program: true, _count: { select: { attachments: true } } },
  });
  if (!r || !r.program.plainEnabled) return null;
  if (r.plainThreadId) return r.plainThreadId;
  try {
    const customerId = await upsertPlainCustomer({ email: r.tester.email, fullName: r.tester.name });
    const threadId = await createPlainThread({
      customerId, externalId: reportExternalId(r.id),
      title: `[${r.program.name}] ${KIND(r.kind, r.severity)}: ${r.title}`,
      description: r.body.slice(0, 300),
      priority: r.kind === 'bug' ? PRIORITY[r.severity ?? 'minor'] ?? 2 : r.kind === 'idea' ? 3 : 2,
      labelTypeIds: r.program.plainLabelTypeId ? [r.program.plainLabelTypeId] : [],
      components: reportComponents(r),
    });
    await prisma.testerReport.update({ where: { id: r.id }, data: { plainThreadId: threadId, plainSyncedAt: new Date(), plainError: null } });
    return threadId;
  } catch (e) {
    await recordError('report', r.id, e);
    throw e;
  }
}

const portalLine = (slug: string) => `\n\n—\nYou can also see this report and reply in your beta portal: ${APP_URL()}/b/${slug}/portal`;

/** Send a CRM-side reply (team or tester) to the report's Plain thread. */
export async function pushReplyToPlain(replyId: string): Promise<boolean> {
  if (!plainConfigured()) return false;
  const reply = await prisma.testerReply.findUnique({ where: { id: replyId }, include: { report: { include: { program: true, tester: true } } } });
  if (!reply || reply.via !== 'crm' || reply.plainSyncedAt) return false;
  const threadId = reply.report.plainThreadId;
  if (!threadId || !reply.report.program.plainEnabled) return false;
  // A team reply from well before the thread existed (Plain was connected later, or was down
  // for a while) was already read in the portal; don't email it to the tester now.
  const openedAt = reply.report.plainSyncedAt;
  if (reply.authorType === 'team' && openedAt && openedAt.getTime() - reply.createdAt.getTime() > 10 * 60_000) {
    await prisma.testerReply.update({ where: { id: reply.id }, data: { plainSyncedAt: new Date() } });
    return false;
  }
  try {
    let entryId: string | null = null;
    if (reply.authorType === 'team') {
      await replyOnPlainThread(threadId, reply.body + portalLine(reply.report.program.slug));
    } else {
      entryId = await addPlainThreadEvent(threadId, `${reply.report.tester.name} replied in the beta portal`, [plainText(reply.body)], `beta_reply_${reply.id}`);
      await markPlainThreadTodo(threadId).catch(() => {});
    }
    await prisma.testerReply.update({ where: { id: reply.id }, data: { plainSyncedAt: new Date(), ...(entryId ? { plainEntryId: entryId } : {}) } });
    return true;
  } catch (e) {
    await recordError('reply', reply.id, e);
    throw e;
  }
}

/** A file added after the thread was opened: say so on the thread (the file itself stays in the CRM). */
export async function noteAttachmentInPlain(reportId: string, filename: string) {
  const r = await prisma.testerReport.findUnique({ where: { id: reportId }, select: { plainThreadId: true, programId: true, program: { select: { plainEnabled: true } } } });
  if (!plainConfigured() || !r?.plainThreadId || !r.program.plainEnabled) return;
  await addPlainThreadEvent(r.plainThreadId, `Tester attached ${filename}`, [linkButton('View in the CRM', `${APP_URL()}/beta/${r.programId}?report=${reportId}`)]);
}

/** Retry whatever didn't reach Plain (job: plain_beta_sync). */
export async function syncBetaToPlain() {
  if (!plainConfigured()) return { skipped: 'PLAIN_API_KEY not set' };
  const since = new Date(Date.now() - 14 * 86_400_000);
  const reports = await prisma.testerReport.findMany({
    where: { plainThreadId: null, plainTries: { lt: MAX_TRIES }, createdAt: { gte: since }, program: { plainEnabled: true } },
    orderBy: { createdAt: 'asc' }, take: 25, select: { id: true },
  });
  let threads = 0, replies = 0, failed = 0;
  for (const r of reports) {
    try { if (await pushReportToPlain(r.id)) threads++; } catch { failed++; }
  }
  const pending = await prisma.testerReply.findMany({
    where: { via: 'crm', plainSyncedAt: null, plainTries: { lt: MAX_TRIES }, createdAt: { gte: new Date(Date.now() - 2 * 86_400_000) }, report: { plainThreadId: { not: null }, program: { plainEnabled: true } } },
    orderBy: { createdAt: 'asc' }, take: 50, select: { id: true },
  });
  for (const r of pending) {
    try { if (await pushReplyToPlain(r.id)) replies++; } catch { failed++; }
  }
  return { threads, replies, failed };
}

// ───────── Plain → CRM ─────────

const squash = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();

/** Drop the quoted history an email client appends under a reply. */
export function stripQuoted(body: string) {
  const lines = body.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  for (const line of lines) {
    if (/^\s*>/.test(line)) break;
    if (/^On .{4,200}wrote:\s*$/.test(line.trim())) break;
    if (/^-{2,}\s*Original Message\s*-{2,}/i.test(line.trim())) break;
    if (/^From:\s.+/.test(line.trim()) && out.length) break;
    out.push(line);
  }
  return out.join('\n').replace(/\n—\nYou can also see this report.*$/s, '').trim();
}

/** A message on a beta thread in Plain: mirror it into the report's conversation. */
export async function mirrorPlainMessage(eventType: string, payload: any): Promise<'mirrored' | 'echo' | 'ignored'> {
  const thread = payload?.thread;
  if (!isBetaThread(thread)) return 'ignored';
  const report = await prisma.testerReport.findFirst({
    where: { OR: [{ plainThreadId: thread.id }, { id: thread.externalId.slice('beta_report_'.length) }] },
    include: { tester: true },
  });
  if (!report) return 'ignored';
  if (!report.plainThreadId) await prisma.testerReport.update({ where: { id: report.id }, data: { plainThreadId: thread.id, plainSyncedAt: new Date() } }).catch(() => {});

  const msg = payload.email ?? payload.chat;
  if (!msg?.timelineEntryId) return 'ignored';
  if (await prisma.testerReply.findUnique({ where: { plainEntryId: msg.timelineEntryId } })) return 'echo';
  const raw: string = msg.markdownContent ?? msg.textContent ?? msg.text ?? '';
  const body = stripQuoted(raw).slice(0, 5000);
  if (!body) return 'ignored';
  const inbound = eventType === 'thread.email_received' || eventType === 'thread.chat_received';

  if (inbound) {
    // An emailed answer from their own address proves they own it (chat is signed from then on).
    const from = String(payload.email?.from?.email ?? '').toLowerCase();
    if (from && from === report.tester.email && !report.tester.emailVerifiedAt) {
      await prisma.tester.update({ where: { id: report.testerId }, data: { emailVerifiedAt: new Date() } });
    }
    await prisma.testerReply.create({ data: { reportId: report.id, authorType: 'tester', testerId: report.testerId, body, via: 'plain', plainEntryId: msg.timelineEntryId } });
    const { notifyTesterReply } = await import('@/lib/beta');
    await notifyTesterReply(report.id, report.tester.name, body);
    return 'mirrored';
  }
  // Outbound: our own replyToThread comes back as an email_sent. Match it to the CRM reply it was.
  const recent = await prisma.testerReply.findMany({
    where: { reportId: report.id, authorType: 'team', via: 'crm', plainEntryId: null, createdAt: { gte: new Date(Date.now() - 3 * 86_400_000) } },
    orderBy: { createdAt: 'desc' }, take: 20,
  });
  const said = squash(body);
  const mine = recent.find((r) => { const s = squash(r.body).slice(0, 200); return said.startsWith(s) || s.startsWith(said.slice(0, 200)); });
  if (mine) {
    await prisma.testerReply.update({ where: { id: mine.id }, data: { plainEntryId: msg.timelineEntryId, plainSyncedAt: mine.plainSyncedAt ?? new Date() } });
    return 'echo';
  }
  await prisma.testerReply.create({ data: { reportId: report.id, authorType: 'team', body, via: 'plain', plainEntryId: msg.timelineEntryId } });
  if (report.status === 'new') await prisma.testerReport.update({ where: { id: report.id }, data: { status: report.kind === 'question' ? 'answered' : 'triaged' } });
  return 'mirrored';
}
