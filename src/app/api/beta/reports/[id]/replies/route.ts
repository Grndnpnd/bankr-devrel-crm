import { NextResponse, after } from 'next/server';
import { staffRecord } from '@/lib/betaHttp';
import { prisma } from '@/lib/prisma';
import { pushReplyToPlain } from '@/lib/plainBeta';

export const dynamic = 'force-dynamic';

/** Reply to the tester: { body }. A first reply moves a new report to "Seen"; answering a question marks it answered. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const s = await staffRecord('report', id);
  if ('error' in s) return s.error;
  const session = s.session;
  const body = String((await req.json().catch(() => ({})))?.body ?? '').trim().slice(0, 5000);
  if (!body) return NextResponse.json({ error: 'write a reply first' }, { status: 400 });
  const report = await prisma.testerReport.findUnique({ where: { id }, select: { status: true, kind: true } });
  if (!report) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const reply = await prisma.testerReply.create({ data: { reportId: id, authorType: 'team', userId: session.id, body } });
  if (report.status === 'new') {
    await prisma.testerReport.update({ where: { id }, data: { status: report.kind === 'question' ? 'answered' : 'triaged' } });
  }
  after(() => pushReplyToPlain(reply.id).catch(() => {})); // the tester also gets it by email from Plain
  return NextResponse.json({ reply: { ...reply, author: session.name || session.email } }, { status: 201 });
}
