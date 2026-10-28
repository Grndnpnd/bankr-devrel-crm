import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logPayout } from '@/lib/betaFlow';
import { body, run, staffProgram } from '@/lib/betaHttp';
import { txUrl } from '@/lib/betaModel';

export const dynamic = 'force-dynamic';

/** Payouts, plus the funding queue: testers who said yes to funds and haven't had test funds yet. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const s = await staffProgram(id);
  if ('error' in s) return s.error;
  const [payouts, queue] = await Promise.all([
    prisma.betaPayout.findMany({
      where: { programId: id }, orderBy: { sentAt: 'desc' }, take: 1000,
      include: { tester: { select: { id: true, name: true } }, report: { select: { id: true, title: true } } },
    }),
    prisma.tester.findMany({
      where: { programId: id, status: 'active', sendFunds: 'yes', payouts: { none: { reason: 'test_funds' } } },
      select: { id: true, name: true, walletAddress: true, channel: true, handle: true },
      orderBy: { name: 'asc' },
    }),
  ]);
  const ids = [...new Set(payouts.map((x) => x.sentById).filter(Boolean))] as string[];
  const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, email: true } });
  const name = Object.fromEntries(users.map((u) => [u.id, u.name || u.email]));
  return NextResponse.json({
    payouts: payouts.map((x) => ({ ...x, txUrl: txUrl(x.tx), sentBy: x.sentById ? name[x.sentById] ?? null : null })),
    queue: queue.sort((a, b) => Number(!a.walletAddress) - Number(!b.walletAddress) || a.name.localeCompare(b.name)),
  });
}

/** Log a payout: { testerId, amount, token?, reason?, tx?, reportId?, notes?, sentAt? } */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const s = await staffProgram(id, 'beta.manage');
  if ('error' in s) return s.error;
  const b = await body(req);
  return run(async () => ({ payout: await logPayout(s.session, s.p, b) }), 201);
}
