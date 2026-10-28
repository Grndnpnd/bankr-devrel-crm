/**
 * What the public beta pages show, built once and used both by the API (client refreshes) and by
 * the server-rendered pages (so a tester on a slow phone sees the page without a second round trip).
 */
import type { BetaProgram, Tester } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { cleanQuestions, programOpen, STATUS_LABEL, testerForToken, turnstileSiteKey, cookieName } from '@/lib/beta';
import { TESTER_TONE } from '@/lib/betaModel';
import { chatSignature, plainChatConfigured } from '@/lib/plain';

/** Who runs the beta and how to reach a person — shown on every tester page. */
export const programAbout = (p: BetaProgram) => ({
  name: p.name, product: p.product, description: p.description, welcome: p.welcome,
  runBy: p.runBy, contactEmail: p.contactEmail, privacyUrl: p.privacyUrl,
  plain: p.plainEnabled && !!process.env.PLAIN_API_KEY, // replies are also emailed through Plain
});

export type JoinInfo = Awaited<ReturnType<typeof joinInfo>>;

/** The join page for /b/<slug>?k=<token>, or why it can't be shown. */
export async function joinInfo(slug: string, k: string, signedIn: Tester | null) {
  const p = await prisma.betaProgram.findUnique({ where: { slug } });
  if (!p || p.status === 'draft' || (p.joinToken !== k && !signedIn)) {
    if (p && signedIn) return { ok: false as const, error: null, contactEmail: null as string | null, runBy: null as string | null, privacyUrl: null as string | null };
    return {
      ok: false as const,
      error: !p ? 'This beta doesn’t exist, or it has ended.' : p.status === 'draft' ? 'This beta hasn’t opened yet.' : 'This invite link doesn’t work. It may be incomplete (copy the whole link) or replaced by a newer one.',
      contactEmail: p?.contactEmail ?? null, runBy: p?.runBy ?? null, privacyUrl: p?.privacyUrl ?? null,
    };
  }
  const full = p.maxTesters ? (await prisma.tester.count({ where: { programId: p.id, status: 'active' } })) >= p.maxTesters : false;
  return {
    ok: true as const,
    ...programAbout(p),
    open: programOpen(p), ended: !!p.endsAt && p.endsAt < new Date(), full, alreadyJoined: !!signedIn,
    questions: cleanQuestions(p.questions), turnstileSiteKey: turnstileSiteKey(),
  };
}

export type PortalData = Awaited<ReturnType<typeof portalData>>;

/** The tester's own page: who they are, the program, their reports and messages from the team. */
export async function portalData(tester: Tester & { program: BetaProgram }) {
  const p = tester.program;
  const [reports, messages] = await Promise.all([
    prisma.testerReport.findMany({
      where: { testerId: tester.id }, orderBy: { createdAt: 'desc' },
      include: { replies: { where: { authorType: 'team' }, select: { createdAt: true } } },
    }),
    prisma.betaOutreach.findMany({
      where: { testerId: tester.id, sentVia: 'portal', status: { in: ['sent', 'answered', 'closed'] } },
      orderBy: { sentAt: 'desc' }, take: 20,
      select: { id: true, title: true, message: true, status: true, answer: true, sentAt: true, report: { select: { id: true, title: true } } },
    }),
  ]);
  // Plain live chat. A signature tells Plain the email is verified, so we only sign addresses the
  // tester has proved they own; otherwise Plain's widget asks for the email and checks it with a code.
  const chat = plainChatConfigured() && p.plainEnabled ? {
    appId: process.env.PLAIN_CHAT_APP_ID!,
    ...(tester.emailVerifiedAt && tester.email ? {
      customerDetails: { email: tester.email, fullName: tester.name, shortName: tester.name.split(' ')[0] },
      customerDetailsSignature: chatSignature(tester.email),
    } : { requireAuthentication: true }),
    threadDetails: p.plainLabelTypeId ? { labelTypeIds: [p.plainLabelTypeId] } : undefined,
    title: p.name,
  } : null;
  return {
    chat,
    tester: { name: tester.name, email: tester.email, platform: tester.platform },
    program: { ...programAbout(p), open: programOpen(p), ended: !!p.endsAt && p.endsAt < new Date(), testAreas: p.testAreas },
    messages: messages.map((m) => ({ ...m, canAnswer: m.status === 'sent' || m.status === 'answered' })),
    reports: reports.map(({ replies, ...x }) => ({
      id: x.id, kind: x.kind, title: x.title, severity: x.claimedSeverity, status: x.status, statusLabel: STATUS_LABEL[x.status] ?? x.status, tone: TESTER_TONE[x.status] ?? 'info',
      retest: x.kind === 'bug' && ['fix_live', 'retest_needed'].includes(x.status),
      createdAt: x.createdAt, teamReplies: replies.length,
      unread: replies.filter((rp) => !x.testerSeenAt || rp.createdAt > x.testerSeenAt).length,
    })),
  };
}

/** One of the tester's own reports as they see it (no triage notes), and mark the team's replies seen. */
export async function testerReportDetail(testerId: string, id: string) {
  const x = await prisma.testerReport.findFirst({
    where: { id, testerId },
    include: {
      replies: { orderBy: { createdAt: 'asc' }, select: { id: true, authorType: true, body: true, createdAt: true } },
      attachments: { select: { id: true, filename: true, contentType: true, size: true } },
    },
  });
  if (!x) return null;
  await prisma.testerReport.update({ where: { id }, data: { testerSeenAt: new Date() } });
  return {
    id: x.id, kind: x.kind, title: x.title, body: x.body, severity: x.claimedSeverity, steps: x.steps, expected: x.expected, actual: x.actual,
    platform: x.platform, pageUrl: x.pageUrl, device: x.device, browser: x.browser, testArea: x.testArea, status: x.status, createdAt: x.createdAt,
    statusLabel: STATUS_LABEL[x.status] ?? x.status, tone: TESTER_TONE[x.status] ?? 'info',
    retest: x.kind === 'bug' && ['fix_live', 'retest_needed'].includes(x.status),
    replies: x.replies, attachments: x.attachments,
  };
}

/** Why a tester page can't open: the beta is gone, or this browser isn't signed in. */
export async function portalProblem(slug: string): Promise<'ended' | 'signed_out'> {
  const p = await prisma.betaProgram.findUnique({ where: { slug }, select: { id: true } });
  return p ? 'signed_out' : 'ended';
}

/** The signed-in tester for a server-rendered page (reads the program's cookie). */
export async function testerFromCookies(slug: string, cookies: { get: (n: string) => { value: string } | undefined }) {
  return testerForToken(slug, cookies.get(cookieName(slug))?.value ?? null);
}

/** Contact line for error pages. */
export async function programContact(slug: string) {
  const p = await prisma.betaProgram.findUnique({ where: { slug }, select: { name: true, contactEmail: true, runBy: true, privacyUrl: true } });
  return p ? { name: p.name, contactEmail: p.contactEmail, runBy: p.runBy, privacyUrl: p.privacyUrl } : null;
}
