import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { getSession } from '@/lib/auth';
import { can } from '@/lib/access';
import { prisma } from '@/lib/prisma';
import { checkProgramInput, cleanQuestions, joinUrl, token } from '@/lib/beta';
import { canApprove, programOverview } from '@/lib/betaFlow';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await getSession();
  if (!session || !can(session.role, 'tasks.use')) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const p = await prisma.betaProgram.findUnique({
    where: { id },
    include: { team: { select: { id: true, name: true, color: true } }, bugTeam: { select: { id: true, name: true, color: true } } },
  });
  if (!p) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const counts = await prisma.testerReport.groupBy({ by: ['status'], where: { programId: id }, _count: true });
  const testers = await prisma.tester.count({ where: { programId: id, status: 'active' } });
  const { joinToken, ...rest } = p;
  const [overview, people, boards] = await Promise.all([
    programOverview(id, session.id, canApprove(p, session)),
    prisma.user.findMany({ where: { active: true }, select: { id: true, name: true, email: true }, orderBy: { name: 'asc' } }),
    prisma.notionBoard.findMany({ where: { programId: id }, select: { kind: true, title: true, url: true, enabled: true, lastPullAt: true, lastPushAt: true, lastError: true } }),
  ]);
  return NextResponse.json({
    program: { ...rest, joinUrl: joinUrl(p), questions: cleanQuestions(p.questions) },
    counts: Object.fromEntries(counts.map((c) => [c.status, c._count])), testers, overview, people, notionBoards: boards,
    me: { id: session.id, canApprove: canApprove(p, session), isLead: p.leadId === session.id, isSender: p.senderId === session.id },
    canManage: can(session.role, 'beta.manage'),
  });
}

/** Change settings; { regenerateLink: true } issues a new join link (the old one stops working). */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await getSession();
  if (!session || !can(session.role, 'beta.manage')) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  if (!(await prisma.betaProgram.findUnique({ where: { id }, select: { id: true } }))) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const bad = await checkProgramInput(b);
  if (bad) return NextResponse.json({ error: bad }, { status: 400 });
  const data: Prisma.BetaProgramUncheckedUpdateInput = {};
  if (typeof b?.name === 'string' && b.name.trim()) data.name = b.name.trim().slice(0, 100);
  for (const k of ['product', 'description', 'welcome'] as const) if (b?.[k] !== undefined) data[k] = b[k] ? String(b[k]).slice(0, k === 'product' ? 100 : 4000) : null;
  for (const k of ['runBy', 'contactEmail', 'privacyUrl'] as const) if (b?.[k] !== undefined) data[k] = b[k] ? String(b[k]).trim().slice(0, k === 'runBy' ? 100 : 300) : null;
  if (['draft', 'open', 'closed'].includes(b?.status)) data.status = b.status;
  if (b?.teamId !== undefined) data.teamId = b.teamId || null;
  if (b?.bugTeamId !== undefined) data.bugTeamId = b.bugTeamId || null;
  if (b?.maxTesters !== undefined) data.maxTesters = Number(b.maxTesters) > 0 ? Math.floor(Number(b.maxTesters)) : null;
  if (b?.endsAt !== undefined) data.endsAt = b.endsAt ? new Date(b.endsAt) : null;
  if (b?.questions !== undefined) data.questions = cleanQuestions(b.questions) as unknown as Prisma.InputJsonValue;
  if (b?.plainEnabled !== undefined) data.plainEnabled = !!b.plainEnabled;
  if (b?.plainLabelTypeId !== undefined) data.plainLabelTypeId = b.plainLabelTypeId ? String(b.plainLabelTypeId).slice(0, 60) : null;
  if (b?.regenerateLink) data.joinToken = token(18);
  for (const k of ['leadId', 'senderId'] as const) {
    if (b?.[k] === undefined) continue;
    if (b[k] && !(await prisma.user.findFirst({ where: { id: String(b[k]), active: true }, select: { id: true } }))) return NextResponse.json({ error: 'Pick someone on the team.' }, { status: 400 });
    data[k] = b[k] ? String(b[k]) : null;
  }
  if (b?.testAreas !== undefined) {
    if (!Array.isArray(b.testAreas)) return NextResponse.json({ error: 'testAreas must be a list' }, { status: 400 });
    data.testAreas = [...new Set(b.testAreas.map((x: unknown) => String(x).trim().slice(0, 60)).filter(Boolean))].slice(0, 30) as string[];
  }
  const prev = await prisma.betaProgram.findUnique({ where: { id }, select: { leadId: true } });
  const p = await prisma.betaProgram.update({ where: { id }, data });
  if (data.leadId !== undefined && prev?.leadId !== p.leadId) {
    // What was waiting on the old lead (or on nobody, for approvals) now waits on the new one.
    await prisma.betaOutreach.updateMany({ where: { programId: id, status: 'suggested', waitingOnId: prev?.leadId ?? null }, data: { waitingOnId: p.leadId } });
    if (prev?.leadId) await prisma.testerReport.updateMany({ where: { programId: id, waitingOnId: prev.leadId }, data: { waitingOnId: p.leadId } });
  }
  // An end date in the past closes sign-ups right away; say so instead of leaving it silent.
  const warning = p.endsAt && p.endsAt < new Date() && p.status === 'open' ? 'The end date has passed, so sign-ups and new reports are closed. Clear or move the date to reopen.' : null;
  return NextResponse.json({ ok: true, joinUrl: joinUrl(p), warning });
}

/** Delete the program with its testers and reports (their tasks stay on the board). */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await getSession();
  if (!session || !can(session.role, 'beta.manage')) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const tasks = (await prisma.testerReport.findMany({ where: { programId: id, taskId: { not: null } }, select: { taskId: true } })).map((x) => x.taskId!);
  await prisma.betaProgram.delete({ where: { id } }).catch(() => {});
  if (tasks.length) await prisma.task.deleteMany({ where: { id: { in: tasks } } });
  await prisma.notification.deleteMany({ where: { url: { startsWith: `/beta/${id}` } } });
  return NextResponse.json({ ok: true });
}
