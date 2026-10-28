import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { can } from '@/lib/access';
import { prisma } from '@/lib/prisma';
import { newTesterLink, portalUrl, resetTesterLinks } from '@/lib/beta';

export const dynamic = 'force-dynamic';

const findTester = (id: string) => prisma.tester.findUnique({ where: { id }, include: { program: { select: { slug: true } } } });

/** Remove (or restore) a tester: { status: 'removed' | 'active' }. A removed tester's links stop working. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await getSession();
  if (!session || !can(session.role, 'beta.manage')) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const status = (await req.json().catch(() => ({})))?.status;
  if (status !== 'removed' && status !== 'active') return NextResponse.json({ error: 'status must be removed or active' }, { status: 400 });
  if (!(await findTester(id))) return NextResponse.json({ error: 'not found' }, { status: 404 });
  await prisma.tester.update({ where: { id }, data: { status } });
  return NextResponse.json({ ok: true });
}

/**
 * Sign-in links for a tester who lost theirs: { action: 'link' } makes one more link (their others
 * keep working); { action: 'reset' } signs them out everywhere and returns their only new link.
 * Send it to them yourself — anyone with it can post as them.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await getSession();
  if (!session || !can(session.role, 'beta.manage')) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const action = (await req.json().catch(() => ({})))?.action;
  const t = await findTester(id);
  if (!t) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (t.status !== 'active') return NextResponse.json({ error: 'restore this tester first' }, { status: 400 });
  if (action === 'link') return NextResponse.json({ url: portalUrl(t.program.slug, await newTesterLink(t.id, 'team', session.id)) });
  if (action === 'reset') return NextResponse.json({ url: portalUrl(t.program.slug, await resetTesterLinks(t.id)) });
  return NextResponse.json({ error: 'action must be link or reset' }, { status: 400 });
}
