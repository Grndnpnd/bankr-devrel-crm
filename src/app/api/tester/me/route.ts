import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { programOpen, STATUS_LABEL } from '@/lib/beta';
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
  // Plain live chat, signed as this tester so the team sees who they're talking to.
  const chat = plainChatConfigured() && p.plainEnabled ? {
    appId: process.env.PLAIN_CHAT_APP_ID,
    customerDetails: { email: tester.email, fullName: tester.name, shortName: tester.name.split(' ')[0] },
    customerDetailsSignature: chatSignature(tester.email),
    threadDetails: p.plainLabelTypeId ? { labelTypeIds: [p.plainLabelTypeId] } : undefined,
    title: p.name,
  } : null;
  return NextResponse.json({
    chat,
    tester: { name: tester.name, email: tester.email, platform: tester.platform },
    program: { name: tester.program.name, product: tester.program.product, welcome: tester.program.welcome, open: programOpen(tester.program) },
    reports: reports.map(({ replies, ...x }) => ({
      id: x.id, kind: x.kind, title: x.title, severity: x.severity, status: x.status, statusLabel: STATUS_LABEL[x.status] ?? x.status,
      createdAt: x.createdAt, teamReplies: replies.length,
      unread: replies.filter((rp) => !x.testerSeenAt || rp.createdAt > x.testerSeenAt).length,
    })),
  });
}
