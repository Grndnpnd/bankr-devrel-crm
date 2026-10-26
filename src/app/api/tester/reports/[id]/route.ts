import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { STATUS_LABEL } from '@/lib/beta';
import { requireTester } from '@/lib/testerHttp';

export const dynamic = 'force-dynamic';

/** One of the tester's own reports, with the conversation and attachments. Marks team replies seen. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const r = await requireTester(req);
  if ('error' in r) return r.error;
  const report = await prisma.testerReport.findFirst({
    where: { id, testerId: r.tester.id },
    include: {
      replies: { orderBy: { createdAt: 'asc' }, select: { id: true, authorType: true, body: true, createdAt: true } },
      attachments: { select: { id: true, filename: true, contentType: true, size: true } },
    },
  });
  if (!report) return NextResponse.json({ error: 'not found' }, { status: 404 });
  await prisma.testerReport.update({ where: { id }, data: { testerSeenAt: new Date() } });
  const { taskId, testerId, programId, testerSeenAt, ...rest } = report;
  return NextResponse.json({ report: { ...rest, statusLabel: STATUS_LABEL[report.status] ?? report.status } });
}
