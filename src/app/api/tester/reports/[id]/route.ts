import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { STATUS_LABEL } from '@/lib/beta';
import { TESTER_TONE } from '@/lib/betaModel';
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
  // Only what the tester wrote and what they should see — not the team's triage notes.
  const x = report;
  return NextResponse.json({ report: {
    id: x.id, kind: x.kind, title: x.title, body: x.body, severity: x.claimedSeverity, steps: x.steps, expected: x.expected, actual: x.actual,
    platform: x.platform, pageUrl: x.pageUrl, device: x.device, browser: x.browser, testArea: x.testArea, status: x.status, createdAt: x.createdAt,
    statusLabel: STATUS_LABEL[x.status] ?? x.status, tone: TESTER_TONE[x.status] ?? 'info',
    retest: x.kind === 'bug' && ['fix_live', 'retest_needed'].includes(x.status),
    replies: x.replies, attachments: x.attachments,
  } });
}
