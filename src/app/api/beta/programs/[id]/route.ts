import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { getSession } from '@/lib/auth';
import { can } from '@/lib/access';
import { prisma } from '@/lib/prisma';
import { cleanQuestions, joinUrl, token } from '@/lib/beta';

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
  return NextResponse.json({
    program: { ...rest, joinUrl: joinUrl(p), questions: cleanQuestions(p.questions) },
    counts: Object.fromEntries(counts.map((c) => [c.status, c._count])), testers,
    canManage: can(session.role, 'beta.manage'),
  });
}

/** Change settings; { regenerateLink: true } issues a new join link (the old one stops working). */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await getSession();
  if (!session || !can(session.role, 'beta.manage')) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const data: Prisma.BetaProgramUncheckedUpdateInput = {};
  if (typeof b?.name === 'string' && b.name.trim()) data.name = b.name.trim().slice(0, 100);
  for (const k of ['product', 'description', 'welcome'] as const) if (b?.[k] !== undefined) data[k] = b[k] ? String(b[k]).slice(0, k === 'product' ? 100 : 4000) : null;
  if (['draft', 'open', 'closed'].includes(b?.status)) data.status = b.status;
  if (b?.teamId !== undefined) data.teamId = b.teamId || null;
  if (b?.bugTeamId !== undefined) data.bugTeamId = b.bugTeamId || null;
  if (b?.maxTesters !== undefined) data.maxTesters = Number(b.maxTesters) > 0 ? Math.floor(Number(b.maxTesters)) : null;
  if (b?.endsAt !== undefined) data.endsAt = b.endsAt ? new Date(b.endsAt) : null;
  if (b?.questions !== undefined) data.questions = cleanQuestions(b.questions) as unknown as Prisma.InputJsonValue;
  if (b?.plainEnabled !== undefined) data.plainEnabled = !!b.plainEnabled;
  if (b?.plainLabelTypeId !== undefined) data.plainLabelTypeId = b.plainLabelTypeId ? String(b.plainLabelTypeId).slice(0, 60) : null;
  if (b?.regenerateLink) data.joinToken = token(18);
  const p = await prisma.betaProgram.update({ where: { id }, data });
  return NextResponse.json({ ok: true, joinUrl: joinUrl(p) });
}

/** Delete the program with its testers and reports (their tasks stay on the board). */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await getSession();
  if (!session || !can(session.role, 'beta.manage')) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  await prisma.betaProgram.delete({ where: { id } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
