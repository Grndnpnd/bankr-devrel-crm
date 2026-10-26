/**
 * Tasks: one board for every source (the app, Slack, Claude, Telegram, Gmail, tester
 * reports, Plain). Creating or changing a task notifies the people it concerns:
 *   - a new assignee (task.assigned)
 *   - a team's members when it lands on the team with no owner (task.team)
 *   - the creator when someone else finishes it (task.done)
 * and the cron's due-soon pass reminds the assignee once (task.due).
 */
import type { Prisma, TaskStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { notify, teamMemberIds } from '@/lib/notify';

export const TASK_STATUSES: TaskStatus[] = ['TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE'];
export const STATUS_LABEL: Record<TaskStatus, string> = { TODO: 'To do', IN_PROGRESS: 'In progress', BLOCKED: 'Blocked', DONE: 'Done' };
export const PRIORITY_LABEL = ['Urgent', 'High', 'Normal', 'Low'];

const TASK_INCLUDE = {
  assignee: { select: { id: true, name: true, email: true } },
  createdBy: { select: { id: true, name: true, email: true } },
  team: { select: { id: true, name: true, color: true } },
} satisfies Prisma.TaskInclude;

export type TaskRow = Prisma.TaskGetPayload<{ include: typeof TASK_INCLUDE }>;

export interface Actor { id: string; name?: string | null; email?: string }
/** Automations (wallet watch, integrations) act as this; it's never a real user. */
export const SYSTEM: Actor = { id: 'system', name: 'CRM automation' };
const who = (a: Actor) => a.name || a.email || 'Someone';

export interface TaskInput {
  title?: string;
  body?: string | null;
  status?: TaskStatus;
  priority?: number;
  dueAt?: string | Date | null;
  assigneeId?: string | null;
  teamId?: string | null;
  source?: string;
  sourceUrl?: string | null;
  sourceRef?: string | null;
  position?: number;
}

function clean(input: TaskInput) {
  const data: Record<string, unknown> = {};
  if (input.title !== undefined) {
    const t = String(input.title).trim().slice(0, 300);
    if (!t) throw new Error('a task needs a title');
    data.title = t;
  }
  if (input.body !== undefined) data.body = input.body ? String(input.body).slice(0, 20_000) : null;
  if (input.status !== undefined) {
    if (!TASK_STATUSES.includes(input.status)) throw new Error(`unknown status ${input.status}`);
    data.status = input.status;
  }
  if (input.priority !== undefined) data.priority = Math.min(3, Math.max(0, Math.round(Number(input.priority)) || 0));
  if (input.dueAt !== undefined) {
    const d = input.dueAt ? new Date(input.dueAt) : null;
    if (d && isNaN(d.getTime())) throw new Error('dueAt is not a date');
    data.dueAt = d;
    data.remindedAt = null;
  }
  if (input.assigneeId !== undefined) data.assigneeId = input.assigneeId || null;
  if (input.teamId !== undefined) data.teamId = input.teamId || null;
  if (input.sourceUrl !== undefined) data.sourceUrl = input.sourceUrl || null;
  if (input.position !== undefined) data.position = Number(input.position) || 0;
  return data;
}

export async function listTasks(filter: { assigneeId?: string; teamId?: string; teamIds?: string[]; status?: TaskStatus[]; q?: string; includeDoneDays?: number } = {}) {
  const where: Prisma.TaskWhereInput = {};
  if (filter.assigneeId) where.assigneeId = filter.assigneeId;
  if (filter.teamId) where.teamId = filter.teamId;
  if (filter.teamIds) where.teamId = { in: filter.teamIds };
  if (filter.status?.length) where.status = { in: filter.status };
  if (filter.q) where.OR = [{ title: { contains: filter.q, mode: 'insensitive' } }, { body: { contains: filter.q, mode: 'insensitive' } }];
  // Done tasks fade off the board after a while (default 14 days).
  const days = filter.includeDoneDays ?? 14;
  const doneSince = new Date(Date.now() - days * 86400_000);
  const and: Prisma.TaskWhereInput[] = [where, { OR: [{ status: { not: 'DONE' } }, { completedAt: { gte: doneSince } }] }];
  return prisma.task.findMany({
    where: { AND: and },
    include: TASK_INCLUDE,
    orderBy: [{ position: 'asc' }, { createdAt: 'desc' }],
    take: 500,
  });
}

export async function getTask(id: string) {
  return prisma.task.findUnique({ where: { id }, include: TASK_INCLUDE });
}

export async function createTask(actor: Actor, input: TaskInput, opts: { silent?: boolean } = {}): Promise<{ task: TaskRow; existed: boolean }> {
  if (!input.title) throw new Error('a task needs a title');
  const source = (input.source || 'app').slice(0, 30);
  if (input.sourceRef) {
    const existing = await prisma.task.findUnique({ where: { source_sourceRef: { source, sourceRef: input.sourceRef } }, include: TASK_INCLUDE });
    if (existing) return { task: existing, existed: true };
  }
  const data = clean(input);
  // New tasks go to the top of their column.
  const first = await prisma.task.findFirst({ where: { status: (data.status as TaskStatus) ?? 'TODO' }, orderBy: { position: 'asc' }, select: { position: true } });
  const task = await prisma.task.create({
    data: {
      ...(data as Prisma.TaskUncheckedCreateInput),
      title: data.title as string,
      source,
      sourceRef: input.sourceRef || null,
      createdById: actor.id === SYSTEM.id ? null : actor.id,
      position: input.position ?? (first ? first.position - 1 : 0),
      completedAt: data.status === 'DONE' ? new Date() : null,
    },
    include: TASK_INCLUDE,
  });
  if (!opts.silent) await announce(actor, null, task);
  return { task, existed: false };
}

export async function updateTask(actor: Actor, id: string, input: TaskInput): Promise<TaskRow> {
  const before = await prisma.task.findUnique({ where: { id } });
  if (!before) throw new Error('task not found');
  const data = clean(input);
  if (data.status && data.status !== before.status) data.completedAt = data.status === 'DONE' ? new Date() : null;
  const task = await prisma.task.update({ where: { id }, data: data as Prisma.TaskUncheckedUpdateInput, include: TASK_INCLUDE });
  await announce(actor, before, task);
  return task;
}

export async function deleteTask(id: string) {
  await prisma.task.delete({ where: { id } });
}

const taskUrl = (id: string) => `/tasks?task=${id}`;

/** Notify the people a create/update concerns. */
async function announce(actor: Actor, before: { assigneeId: string | null; teamId: string | null; status: TaskStatus } | null, task: TaskRow) {
  const url = taskUrl(task.id);
  if (task.assigneeId && task.assigneeId !== before?.assigneeId) {
    await notify({
      userIds: [task.assigneeId], actorId: actor.id, kind: 'task.assigned', url,
      title: `${who(actor)} assigned you: ${task.title}`,
      body: [task.team?.name, task.dueAt ? `due ${task.dueAt.toISOString().slice(0, 10)}` : null].filter(Boolean).join(' · ') || null,
    });
  }
  if (task.teamId && !task.assigneeId && (task.teamId !== before?.teamId || (before?.assigneeId && !task.assigneeId))) {
    await notify({
      userIds: await teamMemberIds(task.teamId), actorId: actor.id, kind: 'task.team', url,
      title: `New for ${task.team?.name ?? 'your team'}: ${task.title}`,
      body: `From ${who(actor)} · nobody owns it yet`,
    });
  }
  if (before && before.status !== 'DONE' && task.status === 'DONE' && task.createdById) {
    await notify({
      userIds: [task.createdById], actorId: actor.id, kind: 'task.done', url,
      title: `Done: ${task.title}`, body: `Finished by ${who(actor)}`,
    });
  }
}

/** Cron: remind each assignee once about open tasks due within the next 24 hours. */
export async function remindDueTasks(now = new Date()) {
  const soon = new Date(now.getTime() + 24 * 3600_000);
  const due = await prisma.task.findMany({
    where: { status: { not: 'DONE' }, assigneeId: { not: null }, dueAt: { lte: soon }, remindedAt: null },
    select: { id: true, title: true, assigneeId: true, dueAt: true },
    take: 200,
  });
  for (const t of due) {
    const overdue = t.dueAt! < now;
    await notify({
      userIds: [t.assigneeId!], kind: 'task.due', url: taskUrl(t.id),
      title: `${overdue ? 'Overdue' : 'Due soon'}: ${t.title}`,
      body: `Due ${t.dueAt!.toISOString().slice(0, 16).replace('T', ' ')} UTC`,
    });
    await prisma.task.update({ where: { id: t.id }, data: { remindedAt: now } });
  }
  return { reminded: due.length };
}
