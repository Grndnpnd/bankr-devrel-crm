import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { can } from '@/lib/access';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/** Change name, team, alert/clear levels or pause: { label?, teamId?, ethAlert?, ethClear?, usdcAlert?, usdcClear?, active? } */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await getSession();
  if (!session || !can(session.role, 'wallets.manage')) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (typeof body?.label === 'string' && body.label.trim()) data.label = body.label.trim().slice(0, 80);
  if (body?.teamId !== undefined) data.teamId = body.teamId || null;
  if (typeof body?.active === 'boolean') data.active = body.active;
  for (const k of ['ethAlert', 'ethClear', 'usdcAlert', 'usdcClear']) {
    if (body?.[k] === undefined) continue;
    const v = body[k] === '' || body[k] === null ? null : Number(body[k]);
    if (v !== null && (!Number.isFinite(v) || v < 0)) return NextResponse.json({ error: `${k} must be a number ≥ 0` }, { status: 400 });
    data[k] = v;
    // A changed level starts the state machine fresh for that asset.
    const asset = k.startsWith('eth') ? 'eth' : 'usdc';
    data[`${asset}Below`] = 0;
  }
  await prisma.wallet.update({ where: { id }, data });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await getSession();
  if (!session || !can(session.role, 'wallets.manage')) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  await prisma.wallet.delete({ where: { id } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
