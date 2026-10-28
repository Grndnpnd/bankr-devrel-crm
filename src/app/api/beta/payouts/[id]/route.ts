import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { body, staff } from '@/lib/betaHttp';

export const dynamic = 'force-dynamic';

/** Add the tx later, or fix notes / amount: { tx?, notes?, amount? } */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const s = await staff('beta.manage');
  if ('error' in s) return s.error;
  const b = await body(req);
  if (!(await prisma.betaPayout.findUnique({ where: { id }, select: { id: true } }))) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const data: Record<string, unknown> = {};
  if (b.tx !== undefined) data.tx = b.tx ? String(b.tx).trim().slice(0, 300) : null;
  if (b.notes !== undefined) data.notes = b.notes ? String(b.notes).slice(0, 2000) : null;
  if (b.amount !== undefined) {
    const n = Number(b.amount);
    if (!Number.isFinite(n) || n <= 0) return NextResponse.json({ error: 'Enter the amount sent.' }, { status: 400 });
    data.amount = n;
  }
  await prisma.betaPayout.update({ where: { id }, data });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const s = await staff('beta.manage');
  if ('error' in s) return s.error;
  await prisma.betaPayout.delete({ where: { id } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
