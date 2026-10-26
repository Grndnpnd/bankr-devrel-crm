import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { can } from '@/lib/access';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/** Remove (or restore) a tester: { status: 'removed' | 'active' }. A removed tester's link stops working. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await getSession();
  if (!session || !can(session.role, 'beta.manage')) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const status = (await req.json().catch(() => ({})))?.status;
  if (status !== 'removed' && status !== 'active') return NextResponse.json({ error: 'status must be removed or active' }, { status: 400 });
  await prisma.tester.update({ where: { id }, data: { status } });
  return NextResponse.json({ ok: true });
}
