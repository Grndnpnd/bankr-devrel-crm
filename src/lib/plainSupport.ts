/**
 * Plain → teams. Routing rules (PlainRoute) pick which teams hear about a thread by its labels;
 * SLA transitions notify those teams, and a breach opens an urgent task that closes itself
 * once the SLA resolves.
 */
import { prisma } from '@/lib/prisma';
import { notify, teamMemberIds } from '@/lib/notify';
import { createTask, updateTask, SYSTEM } from '@/lib/tasks';
import { isBetaThread } from '@/lib/plainBeta';

export const SLA_LABEL: Record<string, string> = {
  FIRST_RESPONSE_TIME: 'First response',
  NEXT_RESPONSE_TIME: 'Next response',
  FIRST_RESOLUTION_TIME: 'First resolution',
  TOTAL_RESOLUTION_TIME: 'Resolution',
};
const OPEN_SLA = ['PENDING', 'IMMINENT_BREACH', 'BREACHING'];

export const threadUrl = (workspaceId: string | null | undefined, threadId: string) =>
  `https://app.plain.com/workspace/${workspaceId || process.env.PLAIN_WORKSPACE_ID || '_'}/thread/${threadId}`;

const labelsOf = (thread: any): string[] =>
  (Array.isArray(thread?.labels) ? thread.labels : []).map((l: any) => l?.labelType?.name).filter((n: unknown): n is string => typeof n === 'string');

/** Rules that match the thread: every label rule that matches, or else the catch-all rules. */
export async function routesFor(labelNames: string[]) {
  const rules = await prisma.plainRoute.findMany({ orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] });
  const wanted = new Set(labelNames.map((l) => l.toLowerCase()));
  const byLabel = rules.filter((r) => r.labelName && wanted.has(r.labelName.toLowerCase()));
  return byLabel.length ? byLabel : rules.filter((r) => !r.labelName);
}

async function membersOf(teamIds: string[]) {
  const ids = await Promise.all(Array.from(new Set(teamIds)).map((t) => teamMemberIds(t)));
  return Array.from(new Set(ids.flat()));
}

const iso = (v: unknown) => {
  const d = typeof v === 'string' ? new Date(v) : v && typeof v === 'object' && 'iso8601' in (v as any) ? new Date((v as any).iso8601) : null;
  return d && !isNaN(d.getTime()) ? d : null;
};
const clock = (d: Date | null) => (d ? d.toISOString().slice(11, 16) + ' UTC' : '');
const customerName = (t: any) => t?.customer?.fullName || t?.customer?.email?.email || 'a customer';

/** thread.thread_created: tell the teams that asked to hear about every new thread. */
export async function onThreadCreated(thread: any, workspaceId?: string | null) {
  if (!thread?.id || isBetaThread(thread)) return; // beta reports already arrive as tasks
  const routes = (await routesFor(labelsOf(thread))).filter((r) => r.notifyNew);
  if (!routes.length) return;
  await notify({
    userIds: await membersOf(routes.map((r) => r.teamId)), kind: 'support.new', url: threadUrl(workspaceId, thread.id),
    title: `New support thread from ${customerName(thread)}`, body: (thread.title || thread.previewText || '').slice(0, 140),
  });
}

/** thread.service_level_agreement_status_transitioned */
export async function onSlaTransition(payload: any, workspaceId?: string | null) {
  const thread = payload?.thread;
  const sla = payload?.serviceLevelAgreement;
  const detail = payload?.serviceLevelAgreementStatusDetail;
  if (!thread?.id || !sla?.type || sla.type === 'UNKNOWN' || !detail?.status || detail.status === 'UNKNOWN') return;
  const type: string = sla.type, status: string = detail.status;
  const prev = await prisma.supportSla.findUnique({ where: { threadId_type: { threadId: thread.id, type } } });
  const data = {
    slaId: sla.id ?? null, status,
    breachTime: iso(detail.breachTime) ?? prev?.breachTime ?? null,
    achievedAt: iso(detail.achievedAt), breachedAt: iso(detail.breachedAt) ?? prev?.breachedAt ?? null,
    doneAt: iso(detail.completedAt) ?? iso(detail.cancelledAt) ?? iso(detail.achievedAt),
    policyName: sla.policy?.name ?? sla.tier?.name ?? null,
  };
  const row = await prisma.supportSla.upsert({
    where: { threadId_type: { threadId: thread.id, type } },
    create: { threadId: thread.id, type, ...data },
    update: data,
  });
  if (prev?.status === status) return; // a retry or a replay; nothing new to say

  const what = SLA_LABEL[type] ?? 'SLA';
  const url = threadUrl(workspaceId, thread.id);
  const subject = thread.title || thread.previewText || 'Untitled thread';
  const routes = (await routesFor(labelsOf(thread))).filter((r) => r.notifySla);
  const userIds = await membersOf(routes.map((r) => r.teamId));

  if (status === 'IMMINENT_BREACH') {
    await notify({ userIds, kind: 'support.sla', url, title: `${what} SLA about to breach: ${subject}`.slice(0, 200), body: `${customerName(thread)} · due ${clock(row.breachTime)}` });
  } else if (status === 'BREACHING') {
    await notify({ userIds, kind: 'support.sla', url, title: `${what} SLA breached: ${subject}`.slice(0, 200), body: `${customerName(thread)} · breached ${clock(row.breachedAt)}` });
    const { task } = await createTask(SYSTEM, {
      title: `Reply to ${customerName(thread)}: ${what.toLowerCase()} SLA breached`.slice(0, 300),
      body: [`Plain thread: ${subject}`, data.policyName ? `Policy: ${data.policyName}` : null, 'This task closes itself once the SLA is met or the thread is done.'].filter(Boolean).join('\n'),
      priority: 0, teamId: routes[0]?.teamId ?? null,
      source: 'plain', sourceRef: `sla:${thread.id}:${type}:${(row.breachedAt ?? new Date()).getTime()}`, sourceUrl: url,
    });
    await prisma.supportSla.update({ where: { id: row.id }, data: { taskId: task.id } });
  } else if (!OPEN_SLA.includes(status) && row.taskId) {
    const task = await prisma.task.findUnique({ where: { id: row.taskId }, select: { status: true } });
    if (task && task.status !== 'DONE') await updateTask(SYSTEM, row.taskId, { status: 'DONE' }).catch(() => {});
  }
}

/** SLA numbers for the support dashboard: share met over the last `days`, and what's at risk now. */
export async function slaSummary(days = 30) {
  const since = new Date(Date.now() - days * 86_400_000);
  const [done, open] = await Promise.all([
    prisma.supportSla.groupBy({ by: ['type', 'status'], where: { status: { in: ['ACHIEVED', 'BREACHED'] }, updatedAt: { gte: since } }, _count: true }),
    prisma.supportSla.groupBy({ by: ['status'], where: { status: { in: ['IMMINENT_BREACH', 'BREACHING'] } }, _count: true }),
  ]);
  const byType: Record<string, { met: number; missed: number }> = {};
  for (const g of done) {
    const t = (byType[g.type] ||= { met: 0, missed: 0 });
    if (g.status === 'ACHIEVED') t.met += g._count; else t.missed += g._count;
  }
  const met = Object.values(byType).reduce((n, t) => n + t.met, 0);
  const missed = Object.values(byType).reduce((n, t) => n + t.missed, 0);
  return {
    days, met, missed, compliance: met + missed ? met / (met + missed) : null,
    byType: Object.entries(byType).map(([type, v]) => ({ type, label: SLA_LABEL[type] ?? type, ...v })),
    atRisk: open.find((g) => g.status === 'IMMINENT_BREACH')?._count ?? 0,
    breaching: open.find((g) => g.status === 'BREACHING')?._count ?? 0,
  };
}
