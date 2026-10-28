import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { programOpen, STATUS_LABEL } from '@/lib/beta';
import { TESTER_TONE } from '@/lib/betaModel';
import { requireTester } from '@/lib/testerHttp';
import { chatSignature, plainChatConfigured } from '@/lib/plain';

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
  const p = tester.program;
  // Plain live chat. A signature tells Plain the email is verified, so we only sign addresses the
  // tester has proved they own; otherwise Plain's widget asks for the email and checks it with a code.
  const chat = plainChatConfigured() && p.plainEnabled ? {
    appId: process.env.PLAIN_CHAT_APP_ID,
    ...(tester.emailVerifiedAt && tester.email ? {
      customerDetails: { email: tester.email, fullName: tester.name, shortName: tester.name.split(' ')[0] },
      customerDetailsSignature: chatSignature(tester.email),
    } : { requireAuthentication: true }),
    threadDetails: p.plainLabelTypeId ? { labelTypeIds: [p.plainLabelTypeId] } : undefined,
    title: p.name,
  } : null;
  return NextResponse.json({
    chat,
    tester: { name: tester.name, email: tester.email, platform: tester.platform },
    program: { name: tester.program.name, product: tester.program.product, welcome: tester.program.welcome, open: programOpen(tester.program), testAreas: tester.program.testAreas },
    reports: reports.map(({ replies, ...x }) => ({
      id: x.id, kind: x.kind, title: x.title, severity: x.claimedSeverity, status: x.status, statusLabel: STATUS_LABEL[x.status] ?? x.status, tone: TESTER_TONE[x.status] ?? 'info',
      retest: x.kind === 'bug' && ['fix_live', 'retest_needed'].includes(x.status),
      createdAt: x.createdAt, teamReplies: replies.length,
      unread: replies.filter((rp) => !x.testerSeenAt || rp.createdAt > x.testerSeenAt).length,
    })),
  });
}
