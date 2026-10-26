import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { can } from '@/lib/access';
import { prisma } from '@/lib/prisma';
import { checkWallet } from '@/lib/wallets';

export const dynamic = 'force-dynamic';

/** Read the balance now (instead of waiting for the 5-minute cron). */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await getSession();
  if (!session || !can(session.role, 'tasks.use')) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const w = await prisma.wallet.findUnique({ where: { id } });
  if (!w) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const r = await checkWallet(w);
  return NextResponse.json(r, { status: 'error' in r && r.error ? 502 : 200 });
}
