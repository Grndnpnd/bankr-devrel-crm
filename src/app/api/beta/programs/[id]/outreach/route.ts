import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { canApprove, createOutreach } from '@/lib/betaFlow';
import { body, run, staffProgram } from '@/lib/betaHttp';
import { OUTREACH_OPEN } from '@/lib/betaModel';

export const dynamic = 'force-dynamic';

/** Outreach for the program. ?view=open (default) | all | mine (waiting on me) */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const s = await staffProgram(id);
  if ('error' in s) return s.error;
  const view = new URL(req.url).searchParams.get('view') || 'open';
  const where: Prisma.BetaOutreachWhereInput = { programId: id };
  if (view === 'open') where.status = { in: OUTREACH_OPEN };
  if (view === 'mine') {
    where.status = { in: OUTREACH_OPEN };
    where.OR = [{ waitingOnId: s.session.id }, ...(canApprove(s.p, s.session) ? [{ status: 'suggested', waitingOnId: null }] : [])];
  }
  const items = await prisma.betaOutreach.findMany({
    where, orderBy: [{ nextActionDue: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }], take: 500,
    include: {
      tester: { select: { id: true, name: true, channel: true, handle: true, email: true } },
      report: { select: { id: true, title: true, status: true, kind: true } },
    },
  });
  const ids = [...new Set(items.flatMap((o) => [o.requestedById, o.approvedById, o.waitingOnId]).filter(Boolean))] as string[];
  const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, email: true } });
  const name = Object.fromEntries(users.map((u) => [u.id, u.name || u.email]));
  return NextResponse.json({
    items: items.map((o) => ({
      ...o,
      requestedBy: o.requestedById ? name[o.requestedById] ?? null : o.auto ? 'CRM' : null,
      approvedBy: o.approvedById ? name[o.approvedById] ?? null : null,
      waitingOn: o.waitingOnId ? name[o.waitingOnId] ?? null : null,
    })),
  });
}

/** Suggest (or, as the lead/sender, queue) a message: { testerId, type, title, message?, reportId?, nextActionDue? } */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const s = await staffProgram(id);
  if ('error' in s) return s.error;
  const b = await body(req);
  return run(async () => ({ outreach: await createOutreach(s.session, s.p, { ...b, auto: false }) }), 201);
}
