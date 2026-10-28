import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { getSession } from '@/lib/auth';
import { can } from '@/lib/access';
import { prisma } from '@/lib/prisma';
import { checkProgramInput, cleanQuestions, joinUrl, token, uniqueSlug } from '@/lib/beta';
import { BUG_OPEN, values } from '@/lib/betaModel';

export const dynamic = 'force-dynamic';

/** Programs with tester and report counts. */
export async function GET() {
  const session = await getSession();
  if (!session || !can(session.role, 'tasks.use')) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const programs = await prisma.betaProgram.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      team: { select: { id: true, name: true, color: true } },
      bugTeam: { select: { id: true, name: true, color: true } },
      _count: { select: { testers: { where: { status: 'active' } }, reports: true } },
    },
  });
  const open = await prisma.testerReport.groupBy({ by: ['programId'], where: { OR: [{ kind: 'bug', status: { in: values(BUG_OPEN) } }, { kind: { not: 'bug' }, status: 'new' }] }, _count: true });
  const fresh = await prisma.testerReport.groupBy({ by: ['programId'], where: { status: 'new' }, _count: true });
  const o = new Map(open.map((x) => [x.programId, x._count])), n = new Map(fresh.map((x) => [x.programId, x._count]));
  return NextResponse.json({
    programs: programs.map(({ joinToken, ...p }) => ({
      ...p, joinUrl: joinUrl({ slug: p.slug, joinToken }), testers: p._count.testers, reports: p._count.reports,
      openReports: o.get(p.id) ?? 0, newReports: n.get(p.id) ?? 0,
    })),
    canManage: can(session.role, 'beta.manage'),
  });
}

/** Create: { name, product?, description?, welcome?, teamId?, bugTeamId?, maxTesters?, endsAt?, questions?, status? } */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session || !can(session.role, 'beta.manage')) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const name = String(b?.name ?? '').trim().slice(0, 100);
  if (!name) return NextResponse.json({ error: 'name the program (e.g. “Wallet v2 beta”)' }, { status: 400 });
  const bad = await checkProgramInput(b);
  if (bad) return NextResponse.json({ error: bad }, { status: 400 });
  const p = await prisma.betaProgram.create({
    data: {
      name, slug: await uniqueSlug(b?.slug || name), joinToken: token(18),
      product: b?.product ? String(b.product).slice(0, 100) : null,
      description: b?.description ? String(b.description).slice(0, 4000) : null,
      welcome: b?.welcome ? String(b.welcome).slice(0, 4000) : null,
      status: ['draft', 'open', 'closed'].includes(b?.status) ? b.status : 'open',
      teamId: b?.teamId || null, bugTeamId: b?.bugTeamId || null,
      maxTesters: Number(b?.maxTesters) > 0 ? Math.floor(Number(b.maxTesters)) : null,
      endsAt: b?.endsAt ? new Date(b.endsAt) : null,
      questions: cleanQuestions(b?.questions) as unknown as Prisma.InputJsonValue,
      createdById: session.id,
    },
  });
  return NextResponse.json({ id: p.id, slug: p.slug, joinUrl: joinUrl(p) }, { status: 201 });
}
