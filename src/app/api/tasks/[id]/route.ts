import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { can } from '@/lib/access';
import { deleteTask, getTask, updateTask } from '@/lib/tasks';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await getSession();
  if (!session || !can(session.role, 'tasks.use')) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const task = await getTask(id);
  if (!task) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ task });
}

/** Change any of: title, body, status, priority, dueAt, assigneeId, teamId, sourceUrl, position */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await getSession();
  if (!session || !can(session.role, 'tasks.use')) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  delete body.source; delete body.sourceRef;
  try {
    return NextResponse.json({ task: await updateTask(session, id, body) });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'update failed' }, { status: 400 });
  }
}

/** Delete: the creator or an admin. */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await getSession();
  if (!session || !can(session.role, 'tasks.use')) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const task = await getTask(id);
  if (!task) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (task.createdById !== session.id && !can(session.role, 'users.manage')) {
    return NextResponse.json({ error: 'only the person who created it (or an admin) can delete it' }, { status: 403 });
  }
  await deleteTask(id);
  return NextResponse.json({ ok: true });
}
