import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { can } from '@/lib/access';
import { prisma } from '@/lib/prisma';
import { CHAINS, checkWallet, isAddress } from '@/lib/wallets';

export const dynamic = 'force-dynamic';

/** Watched wallets with their latest balance and 7 days of hourly history. */
export async function GET() {
  const session = await getSession();
  if (!session || !can(session.role, 'tasks.use')) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const since = new Date(Date.now() - 7 * 86400_000);
  const wallets = await prisma.wallet.findMany({
    orderBy: { createdAt: 'asc' },
    include: { team: { select: { id: true, name: true, color: true } }, readings: { where: { at: { gte: since } }, orderBy: { at: 'asc' } } },
  });
  // Thin the history to one point per hour for the sparklines.
  const out = wallets.map(({ readings, ...w }) => {
    const byHour = new Map<string, { at: string; eth: number | null; usdc: number | null }>();
    for (const r of readings) byHour.set(r.at.toISOString().slice(0, 13), { at: r.at.toISOString(), eth: r.eth, usdc: r.usdc });
    return { ...w, explorer: (CHAINS[w.chain]?.explorer ?? '') + w.address, history: [...byHour.values()] };
  });
  return NextResponse.json({ wallets: out, chains: Object.values(CHAINS).map((c) => ({ id: c.id, label: c.label })), canManage: can(session.role, 'wallets.manage') });
}

function levels(body: any) {
  const num = (v: unknown) => (v === '' || v == null ? null : Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : NaN);
  const out = { ethAlert: num(body?.ethAlert), ethClear: num(body?.ethClear), usdcAlert: num(body?.usdcAlert), usdcClear: num(body?.usdcClear) };
  if (Object.values(out).some((v) => Number.isNaN(v))) throw new Error('alert levels must be numbers ≥ 0');
  for (const a of ['eth', 'usdc'] as const) {
    const al = out[`${a}Alert`], cl = out[`${a}Clear`];
    if (al != null && cl != null && cl < al) throw new Error(`${a.toUpperCase()}: the clear level must be at or above the alert level`);
  }
  return out;
}

/** Watch a wallet: { label, chain, address, teamId?, ethAlert?, ethClear?, usdcAlert?, usdcClear? } — checks it right away. */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session || !can(session.role, 'wallets.manage')) return NextResponse.json({ error: 'only admins can add wallets' }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const address = String(body?.address ?? '').trim();
  const chain = String(body?.chain ?? 'base');
  const label = String(body?.label ?? '').trim().slice(0, 80);
  if (!label) return NextResponse.json({ error: 'give the wallet a name' }, { status: 400 });
  if (!CHAINS[chain]) return NextResponse.json({ error: 'unknown chain' }, { status: 400 });
  if (!isAddress(address)) return NextResponse.json({ error: 'that is not a 0x… address' }, { status: 400 });
  try {
    const w = await prisma.wallet.create({
      data: { label, chain, address: address.toLowerCase(), teamId: body?.teamId || null, createdById: session.id, ...levels(body) },
    });
    const check = await checkWallet(w);
    return NextResponse.json({ id: w.id, check }, { status: 201 });
  } catch (e: any) {
    const msg = e?.code === 'P2002' ? 'that wallet is already watched' : e?.message ?? 'could not add the wallet';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
