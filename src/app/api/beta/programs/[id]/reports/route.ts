import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { getSession } from '@/lib/auth';
import { can } from '@/lib/access';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/** Reports for triage. ?status=new,triaged &kind=bug &q=text */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await getSession();
  if (!session || !can(session.role, 'tasks.use')) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const url = new URL(req.url);
  const where: Prisma.TesterReportWhereInput = { programId: id };
  const status = url.searchParams.get('status');
  if (status) where.status = { in: status.split(',') };
  const kind = url.searchParams.get('kind');
  if (kind) where.kind = kind;
  const q = url.searchParams.get('q');
  if (q) where.OR = [{ title: { contains: q, mode: 'insensitive' } }, { body: { contains: q, mode: 'insensitive' } }];
  const reports = await prisma.testerReport.findMany({
    where, orderBy: { createdAt: 'desc' }, take: 500,
    include: {
      tester: { select: { id: true, name: true, email: true } },
      task: { select: { id: true, status: true, assignee: { select: { name: true, email: true } } } },
      _count: { select: { replies: true, attachments: true } },
      replies: { orderBy: { createdAt: 'desc' }, take: 1, select: { authorType: true, createdAt: true } },
    },
  });
  return NextResponse.json({
    reports: reports.map(({ replies, ...r }) => ({ ...r, lastReplyBy: replies[0]?.authorType ?? null, lastReplyAt: replies[0]?.createdAt ?? null })),
  });
}
