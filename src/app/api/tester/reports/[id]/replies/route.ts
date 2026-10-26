import { NextResponse, after } from 'next/server';
import { prisma } from '@/lib/prisma';
import { notifyTesterReply, rateLimited } from '@/lib/beta';
import { requireTester } from '@/lib/testerHttp';

export const dynamic = 'force-dynamic';

/** The tester adds to the conversation on their report: { body } */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const r = await requireTester(req);
  if ('error' in r) return r.error;
  if (rateLimited(`reply:${r.tester.id}`, 60, 3600_000)) return NextResponse.json({ error: 'Too many messages — wait a moment.' }, { status: 429 });
  const report = await prisma.testerReport.findFirst({ where: { id, testerId: r.tester.id }, select: { id: true } });
  if (!report) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const body = String((await req.json().catch(() => ({})))?.body ?? '').trim().slice(0, 5000);
  if (!body) return NextResponse.json({ error: 'Write something first.' }, { status: 400 });
  const reply = await prisma.testerReply.create({ data: { reportId: id, authorType: 'tester', testerId: r.tester.id, body } });
  after(() => notifyTesterReply(id, r.tester.name, body));
  return NextResponse.json({ reply: { id: reply.id, authorType: 'tester', body, createdAt: reply.createdAt } }, { status: 201 });
}
