import { NextResponse } from 'next/server';
import type { TaskStatus } from '@prisma/client';
import { getSession } from '@/lib/auth';
import { can } from '@/lib/access';
import { prisma } from '@/lib/prisma';
import { createTask, listTasks, TASK_STATUSES } from '@/lib/tasks';

export const dynamic = 'force-dynamic';

/**
 * The board. ?scope=mine (assigned to me) | teams (my teams) | all, &team=<id>, &q=, &status=TODO,BLOCKED
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session || !can(session.role, 'tasks.use')) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const url = new URL(req.url);
  const scope = url.searchParams.get('scope') || 'mine';
  const team = url.searchParams.get('team') || undefined;
  const status = (url.searchParams.get('status') || '').split(',').filter((s): s is TaskStatus => TASK_STATUSES.includes(s as TaskStatus));
  let teamIds: string[] | undefined;
  if (scope === 'teams' && !team) {
    teamIds = (await prisma.teamMember.findMany({ where: { userId: session.id }, select: { teamId: true } })).map((m) => m.teamId);
  }
  const tasks = await listTasks({
    assigneeId: scope === 'mine' && !team ? session.id : undefined,
    teamId: team,
    teamIds,
    status,
    q: url.searchParams.get('q') || undefined,
  });
  return NextResponse.json({ tasks });
}

/** Create: { title, body?, status?, priority?, dueAt?, assigneeId?, teamId?, sourceUrl? } */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session || !can(session.role, 'tasks.use')) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  try {
    const { task } = await createTask(session, { ...body, source: 'app', sourceRef: undefined });
    return NextResponse.json({ task }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'create failed' }, { status: 400 });
  }
}
