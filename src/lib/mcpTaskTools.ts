/**
 * Task, team and notification tools for the MCP connector, so people can work their
 * board from Claude Code / Desktop: "what's on my plate", "add a task for Support to
 * reply to the vendor by Friday", "mark the AMA task done". Acts as the token's owner.
 */
import type { TaskStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import type { SessionUser } from '@/lib/auth';
import { createTask, getTask, listTasks, updateTask, TASK_STATUSES, type TaskInput, type TaskRow } from '@/lib/tasks';

const APP_URL = () => (process.env.APP_URL || '').replace(/\/$/, '');
const PRIORITY: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
const PRIORITY_NAME = ['urgent', 'high', 'normal', 'low'];

const statusProp = { type: 'string', enum: TASK_STATUSES, description: 'TODO, IN_PROGRESS, BLOCKED or DONE' };
const editableProps = {
  details: { type: 'string', description: 'Longer description' },
  assignee: { type: 'string', description: 'Email of the owner, or "me". Empty string to unassign.' },
  team: { type: 'string', description: 'Team name (see list_teams). Empty string to clear.' },
  due: { type: 'string', description: 'Due date, YYYY-MM-DD (end of day) or an ISO timestamp. Empty string to clear.' },
  priority: { type: 'string', enum: Object.keys(PRIORITY) },
  link: { type: 'string', description: 'URL of the source (Slack message, email thread, PR …)' },
};

export const TASK_TOOLS = [
  {
    name: 'my_tasks',
    description: 'Open tasks assigned to me, overdue and due-soon first. Pass include_done for recently finished ones too.',
    inputSchema: { type: 'object', properties: { include_done: { type: 'boolean' } } },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'list_tasks',
    description: 'Tasks on the board. scope: mine (assigned to me), teams (my teams), all. Filter by team name, status or text.',
    inputSchema: {
      type: 'object',
      properties: {
        scope: { type: 'string', enum: ['mine', 'teams', 'all'] },
        team: { type: 'string' },
        status: { type: 'array', items: statusProp },
        query: { type: 'string' },
      },
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_task',
    description: 'One task with all its fields.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'create_task',
    description: 'Add a task to the board. Defaults: assigned to me unless a team or assignee is given; status TODO. The owner (or the team, if nobody owns it) is notified.',
    inputSchema: { type: 'object', properties: { title: { type: 'string' }, ...editableProps, status: statusProp }, required: ['title'] },
  },
  {
    name: 'update_task',
    description: 'Change a task: status (e.g. DONE), title, details, owner, team, due date, priority or link. Only the fields given change.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' }, title: { type: 'string' }, status: statusProp, ...editableProps }, required: ['id'] },
  },
  {
    name: 'list_teams',
    description: 'Teams with their members and open-task counts.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'my_notifications',
    description: 'My latest notifications (task assignments, due dates, alerts). unread_only to see just the new ones.',
    inputSchema: { type: 'object', properties: { unread_only: { type: 'boolean' }, limit: { type: 'number' } } },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'mark_notifications_read',
    description: 'Mark notifications read: ids, or all=true.',
    inputSchema: { type: 'object', properties: { ids: { type: 'array', items: { type: 'string' } }, all: { type: 'boolean' } } },
  },
];

export const TASK_TOOL_NAMES = new Set(TASK_TOOLS.map((t) => t.name));

const text = (value: unknown) => ({ content: [{ type: 'text' as const, text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }] });
const failure = (message: string) => ({ content: [{ type: 'text' as const, text: message }], isError: true });

function shape(t: TaskRow) {
  return {
    id: t.id, title: t.title, details: t.body, status: t.status, priority: PRIORITY_NAME[t.priority] ?? 'normal',
    due: t.dueAt, owner: t.assignee ? (t.assignee.name || t.assignee.email) : null, owner_email: t.assignee?.email ?? null,
    team: t.team?.name ?? null, source: t.source, link: t.sourceUrl,
    created_by: t.createdBy ? (t.createdBy.name || t.createdBy.email) : null, created: t.createdAt, completed: t.completedAt,
    url: `${APP_URL()}/tasks?task=${t.id}`,
  };
}

async function resolveTeam(name: unknown): Promise<string | null | undefined> {
  if (name === undefined) return undefined;
  const s = String(name).trim();
  if (!s) return null;
  const team = await prisma.team.findFirst({ where: { OR: [{ id: s }, { name: { equals: s, mode: 'insensitive' } }] } });
  if (!team) throw new Error(`No team called "${s}". Use list_teams.`);
  return team.id;
}

async function resolveUser(user: SessionUser, who: unknown): Promise<string | null | undefined> {
  if (who === undefined) return undefined;
  const s = String(who).trim();
  if (!s) return null;
  if (s.toLowerCase() === 'me') return user.id;
  const u = await prisma.user.findFirst({ where: { email: { equals: s, mode: 'insensitive' }, active: true } });
  if (!u) throw new Error(`No active user with email ${s}. Use list_teams to see people.`);
  return u.id;
}

function parseDue(due: unknown): string | null | undefined {
  if (due === undefined) return undefined;
  const s = String(due).trim();
  if (!s) return null;
  // A bare date means the end of that working day (17:00 UTC).
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T17:00:00Z`) : new Date(s);
  if (isNaN(d.getTime())) throw new Error(`"${s}" is not a date — use YYYY-MM-DD.`);
  return d.toISOString();
}

async function edits(user: SessionUser, args: any): Promise<TaskInput> {
  const input: TaskInput = {};
  if (args.title !== undefined) input.title = String(args.title);
  if (args.details !== undefined) input.body = args.details ? String(args.details) : null;
  if (args.status !== undefined) input.status = args.status as TaskStatus;
  if (args.priority !== undefined) {
    if (!(String(args.priority) in PRIORITY)) throw new Error('priority must be urgent, high, normal or low');
    input.priority = PRIORITY[String(args.priority)];
  }
  if (args.link !== undefined) input.sourceUrl = args.link ? String(args.link) : null;
  const assigneeId = await resolveUser(user, args.assignee);
  if (assigneeId !== undefined) input.assigneeId = assigneeId;
  const teamId = await resolveTeam(args.team);
  if (teamId !== undefined) input.teamId = teamId;
  const due = parseDue(args.due);
  if (due !== undefined) input.dueAt = due;
  return input;
}

export async function callTaskTool(user: SessionUser, name: string, args: any) {
  switch (name) {
    case 'my_tasks': {
      const rows = await listTasks({ assigneeId: user.id, status: args.include_done ? undefined : ['TODO', 'IN_PROGRESS', 'BLOCKED'] });
      const now = Date.now();
      rows.sort((a, b) => (a.dueAt?.getTime() ?? Infinity) - (b.dueAt?.getTime() ?? Infinity) || a.priority - b.priority);
      return text({ count: rows.length, overdue: rows.filter((t) => t.dueAt && t.dueAt.getTime() < now && t.status !== 'DONE').length, tasks: rows.map(shape) });
    }
    case 'list_tasks': {
      const teamId = await resolveTeam(args.team);
      const scope = String(args.scope || (teamId ? 'all' : 'mine'));
      let teamIds: string[] | undefined;
      if (scope === 'teams' && !teamId) teamIds = (await prisma.teamMember.findMany({ where: { userId: user.id }, select: { teamId: true } })).map((m) => m.teamId);
      const rows = await listTasks({
        assigneeId: scope === 'mine' && !teamId ? user.id : undefined,
        teamId: teamId ?? undefined, teamIds,
        status: Array.isArray(args.status) ? args.status.filter((s: string) => TASK_STATUSES.includes(s as TaskStatus)) : undefined,
        q: args.query ? String(args.query) : undefined,
      });
      return text({ count: rows.length, tasks: rows.map(shape) });
    }
    case 'get_task': {
      const t = await getTask(String(args.id));
      return t ? text(shape(t)) : failure('No task with that id.');
    }
    case 'create_task': {
      const input = await edits(user, args);
      // Nobody named and no team: it's mine.
      if (input.assigneeId === undefined && !input.teamId) input.assigneeId = user.id;
      const { task } = await createTask(user, { ...input, title: String(args.title ?? ''), source: 'claude' });
      return text({ created: shape(task) });
    }
    case 'update_task': {
      const input = await edits(user, args);
      if (!Object.keys(input).length) return failure('Nothing to change — pass at least one field.');
      const task = await updateTask(user, String(args.id), input);
      return text({ updated: shape(task) });
    }
    case 'list_teams': {
      const teams = await prisma.team.findMany({
        orderBy: { name: 'asc' },
        include: { members: { include: { user: { select: { name: true, email: true } } } }, _count: { select: { tasks: { where: { status: { not: 'DONE' } } } } } },
      });
      return text(teams.map((t) => ({
        name: t.name, description: t.description, open_tasks: t._count.tasks,
        members: t.members.map((m) => ({ name: m.user.name, email: m.user.email, role: m.role })),
      })));
    }
    case 'my_notifications': {
      const rows = await prisma.notification.findMany({
        where: { userId: user.id, ...(args.unread_only ? { readAt: null } : {}) },
        orderBy: { createdAt: 'desc' }, take: Math.min(Number(args.limit) || 20, 100),
      });
      return text(rows.map((n) => ({ id: n.id, kind: n.kind, title: n.title, body: n.body, read: !!n.readAt, at: n.createdAt, url: n.url ? `${APP_URL()}${n.url}` : null })));
    }
    case 'mark_notifications_read': {
      const ids = Array.isArray(args.ids) ? args.ids.map(String) : [];
      if (!args.all && !ids.length) return failure('Pass ids or all=true.');
      const r = await prisma.notification.updateMany({
        where: { userId: user.id, readAt: null, ...(args.all ? {} : { id: { in: ids } }) },
        data: { readAt: new Date() },
      });
      return text({ marked: r.count });
    }
  }
  return failure(`Unknown tool ${name}`);
}
