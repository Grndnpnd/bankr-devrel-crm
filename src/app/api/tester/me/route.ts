import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { programOpen, STATUS_LABEL } from '@/lib/beta';
import { requireTester } from '@/lib/testerHttp';

export const dynamic = 'force-dynamic';

/** The tester's portal: who they are, the program, and their reports with new-reply counts. */
export async function GET(req: Request) {
  const r = await requireTester(req);
  if ('error' in r) return r.error;
  const { tester } = r;
  const reports = await prisma.testerReport.findMany({
    where: { testerId: tester.id },
    orderBy: { createdAt: 'desc' },
    include: { replies: { where: { authorType: 'team' }, select: { createdAt: true } } },
  });
  return NextResponse.json({
    tester: { name: tester.name, email: tester.email, platform: tester.platform },
    program: { name: tester.program.name, product: tester.program.product, welcome: tester.program.welcome, open: programOpen(tester.program) },
    reports: reports.map(({ replies, ...x }) => ({
      id: x.id, kind: x.kind, title: x.title, severity: x.severity, status: x.status, statusLabel: STATUS_LABEL[x.status] ?? x.status,
      createdAt: x.createdAt, teamReplies: replies.length,
      unread: replies.filter((rp) => !x.testerSeenAt || rp.createdAt > x.testerSeenAt).length,
    })),
  });
}
