import { NextResponse } from 'next/server';
import { can } from '@/lib/access';
import { prisma } from '@/lib/prisma';
import { newTesterLink, portalUrl, resetTesterLinks } from '@/lib/beta';
import { loadProgram, updateTester } from '@/lib/betaFlow';
import { run, staffRecord } from '@/lib/betaHttp';
import { eraseTester } from '@/lib/betaErase';

export const dynamic = 'force-dynamic';

const findTester = (id: string) => prisma.tester.findUnique({ where: { id }, include: { program: { select: { slug: true } } } });

/**
 * Change a tester: { status: 'removed' | 'active' } removes or restores them (a removed tester's links
 * stop working); anything else edits their record ({ stage, types, usage, sendFunds, channel, handle,
 * walletAddress, testAreas, name, email, notes, wave }, or { checkIn: true } to log today's check-in).
 */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const s = await staffRecord('tester', id);
  if ('error' in s) return s.error;
  const session = s.session;
  const b = await req.json().catch(() => ({}));
  const t = await findTester(id);
  if (!t) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (b?.status !== undefined) {
    if (!can(session.role, 'beta.manage')) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    if (b.status !== 'removed' && b.status !== 'active') return NextResponse.json({ error: 'status must be removed or active' }, { status: 400 });
    await prisma.tester.update({ where: { id }, data: { status: b.status } });
    return NextResponse.json({ ok: true });
  }
  const p = (await loadProgram(t.programId))!;
  return run(async () => ({ tester: await updateTester(p, id, b) }));
}

/**
 * Sign-in links for a tester who lost theirs: { action: 'link' } makes one more link (their others
 * keep working); { action: 'reset' } signs them out everywhere and returns their only new link.
 * Send it to them yourself — anyone with it can post as them.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const s = await staffRecord('tester', id, 'beta.manage');
  if ('error' in s) return s.error;
  const session = s.session;
  const action = (await req.json().catch(() => ({})))?.action;
  const t = await findTester(id);
  if (!t) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (t.status !== 'active') return NextResponse.json({ error: 'restore this tester first' }, { status: 400 });
  if (action === 'link') return NextResponse.json({ url: portalUrl(t.program.slug, await newTesterLink(t.id, 'team', session.id)) });
  if (action === 'reset') return NextResponse.json({ url: portalUrl(t.program.slug, await resetTesterLinks(t.id)) });
  return NextResponse.json({ error: 'action must be link or reset' }, { status: 400 });
}

/** Delete a tester and all their data (see eraseTester). For a tester who asks the team to erase them. */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const s = await staffRecord('tester', id, 'beta.manage');
  if ('error' in s) return s.error;
  const session = s.session;
  if (!(await eraseTester(id))) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
