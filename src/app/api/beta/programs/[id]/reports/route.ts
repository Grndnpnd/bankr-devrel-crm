import { NextResponse, after } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { isInputError, submitReport } from '@/lib/beta';
import { body, staffProgram } from '@/lib/betaHttp';
import { pushReportToPlain } from '@/lib/plainBeta';
import { pushSoon } from '@/lib/notionSync';

export const dynamic = 'force-dynamic';

/** Reports for triage. ?status=new,triaged &kind=bug &q=text &area=… &severity=high &waiting=me */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const s = await staffProgram(id);
  if ('error' in s) return s.error;
  const url = new URL(req.url);
  const where: Prisma.TesterReportWhereInput = { programId: id };
  const status = url.searchParams.get('status');
  if (status) where.status = { in: status.split(',') };
  const kind = url.searchParams.get('kind');
  if (kind) where.kind = { in: kind.split(',') };
  const area = url.searchParams.get('area');
  if (area) where.testArea = area;
  const severity = url.searchParams.get('severity');
  if (severity) where.OR = [{ severity }, { severity: null, claimedSeverity: severity }];
  if (url.searchParams.get('waiting') === 'me') where.waitingOnId = s.session.id;
  const tester = url.searchParams.get('tester');
  if (tester) where.testerId = tester;
  const q = url.searchParams.get('q')?.trim();
  if (q) {
    where.AND = [{ OR: [
      { title: { contains: q, mode: 'insensitive' } }, { body: { contains: q, mode: 'insensitive' } },
      { plainTicket: { contains: q, mode: 'insensitive' } }, { txHash: { contains: q, mode: 'insensitive' } },
      { tester: { name: { contains: q, mode: 'insensitive' } } },
    ] }];
  }
  const reports = await prisma.testerReport.findMany({
    where, orderBy: { createdAt: 'desc' }, take: 1000,
    include: {
      tester: { select: { id: true, name: true, email: true } },
      task: { select: { id: true, status: true, assignee: { select: { name: true, email: true } } } },
      _count: { select: { replies: true, attachments: true, duplicates: true } },
      replies: { orderBy: { createdAt: 'desc' }, take: 1, select: { authorType: true, createdAt: true } },
    },
  });
  return NextResponse.json({
    reports: reports.map(({ replies, ...r }) => ({ ...r, lastReplyBy: replies[0]?.authorType ?? null, lastReplyAt: replies[0]?.createdAt ?? null })),
  });
}

/** The team logs a report for a tester (from a call, a DM, …): { testerId, kind, title, body, … }. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const s = await staffProgram(id);
  if ('error' in s) return s.error;
  const b = await body(req);
  const tester = await prisma.tester.findFirst({ where: { id: String(b.testerId ?? ''), programId: id }, include: { program: true } });
  if (!tester) return NextResponse.json({ error: 'Pick a tester in this program.' }, { status: 400 });
  try {
    const report = await submitReport(tester, b, { id: s.session.id, name: s.session.name || s.session.email });
    after(async () => { await pushReportToPlain(report.id).catch(() => {}); await pushSoon(id); });
    return NextResponse.json({ id: report.id }, { status: 201 });
  } catch (e) {
    if (isInputError(e)) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error('[beta] staff report failed', e);
    return NextResponse.json({ error: 'Something went wrong on our side.' }, { status: 500 });
  }
}
