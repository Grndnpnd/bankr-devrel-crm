import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { can } from '@/lib/access';
import { prisma } from '@/lib/prisma';
import { REPORT_STATUSES } from '@/lib/beta';
import { updateTask } from '@/lib/tasks';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await getSession();
  if (!session || !can(session.role, 'tasks.use')) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const report = await prisma.testerReport.findUnique({
    where: { id },
    include: {
      tester: { select: { id: true, name: true, email: true, contact: true, platform: true, status: true } },
      task: { select: { id: true, status: true, assignee: { select: { name: true, email: true } }, team: { select: { name: true } } } },
      replies: { orderBy: { createdAt: 'asc' } },
      attachments: { select: { id: true, filename: true, contentType: true, size: true } },
    },
  });
  if (!report) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const authorIds = [...new Set(report.replies.map((r) => r.userId).filter(Boolean))] as string[];
  const authors = await prisma.user.findMany({ where: { id: { in: authorIds } }, select: { id: true, name: true, email: true } });
  const byId = Object.fromEntries(authors.map((a) => [a.id, a.name || a.email]));
  return NextResponse.json({ report: { ...report, replies: report.replies.map((r) => ({ ...r, author: r.authorType === 'team' ? byId[r.userId ?? ''] ?? 'Team' : report.tester.name })) } });
}

/** Set the status the tester sees. Closing statuses also finish the linked task. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await getSession();
  if (!session || !can(session.role, 'tasks.use')) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const status = (await req.json().catch(() => ({})))?.status;
  if (!(REPORT_STATUSES as readonly string[]).includes(status)) return NextResponse.json({ error: 'unknown status' }, { status: 400 });
  const r = await prisma.testerReport.update({ where: { id }, data: { status } });
  if (r.taskId) {
    const closing = ['fixed', 'wont_fix', 'duplicate', 'answered'].includes(status);
    const task = await prisma.task.findUnique({ where: { id: r.taskId }, select: { status: true } });
    if (task && closing && task.status !== 'DONE') await updateTask(session, r.taskId, { status: 'DONE' });
    if (task && status === 'in_progress' && task.status === 'TODO') await updateTask(session, r.taskId, { status: 'IN_PROGRESS' });
    // Finishing the task may have marked the report "fixed"; keep the status that was chosen.
    await prisma.testerReport.update({ where: { id }, data: { status } });
  }
  return NextResponse.json({ ok: true });
}
