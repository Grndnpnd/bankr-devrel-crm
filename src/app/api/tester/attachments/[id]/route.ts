import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { programOpen } from '@/lib/beta';
import { requireTester } from '@/lib/testerHttp';
import { attachmentResponse } from '@/lib/attachmentResponse';

export const dynamic = 'force-dynamic';

/** A file on one of the tester's own reports (?thumb=1 for a small preview of an image). */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const r = await requireTester(req);
  if ('error' in r) return r.error;
  const a = await prisma.testerAttachment.findFirst({ where: { id, report: { testerId: r.tester.id } } });
  if (!a) return new Response('not found', { status: 404 });
  return attachmentResponse(a, { thumb: new URL(req.url).searchParams.get('thumb') === '1' });
}

/** The tester removes one of their files (while the beta is open). */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const r = await requireTester(req);
  if ('error' in r) return r.error;
  if (!programOpen(r.tester.program)) return NextResponse.json({ error: 'This beta has ended, so files can’t be changed.' }, { status: 403 });
  const a = await prisma.testerAttachment.findFirst({ where: { id, report: { testerId: r.tester.id } }, select: { id: true } });
  if (!a) return NextResponse.json({ error: 'not found' }, { status: 404 });
  await prisma.testerAttachment.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
