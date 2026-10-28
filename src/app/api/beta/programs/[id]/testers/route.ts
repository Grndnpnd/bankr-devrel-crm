import { NextResponse } from 'next/server';
import { can } from '@/lib/access';
import { prisma } from '@/lib/prisma';
import { cleanQuestions } from '@/lib/beta';
import { addTester } from '@/lib/betaFlow';
import { body, run, staffProgram } from '@/lib/betaHttp';
import { LABEL } from '@/lib/betaModel';

export const dynamic = 'force-dynamic';

const paidText = (ps: { amount: number; token: string }[]) => {
  const by: Record<string, number> = {};
  for (const x of ps) by[x.token] = (by[x.token] ?? 0) + x.amount;
  return Object.entries(by).map(([t, a]) => `${+a.toFixed(4)} ${t}`).join(' + ');
};

const csvCell = (v: unknown) => {
  const s = v == null ? '' : String(v);
  // Neutralise spreadsheet formulas and quote everything.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
};

/** Testers with their report counts. ?format=csv downloads them (with sign-up answers). */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const s = await staffProgram(id);
  if ('error' in s) return s.error;
  const program = await prisma.betaProgram.findUnique({ where: { id }, select: { slug: true, questions: true } });
  if (!program) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const testers = await prisma.tester.findMany({
    where: { programId: id }, orderBy: { createdAt: 'asc' },
    select: { id: true, name: true, email: true, contact: true, platform: true, answers: true, status: true, stage: true, types: true, usage: true, sendFunds: true, channel: true, handle: true, walletAddress: true, testAreas: true, wave: true, notes: true, invitedAt: true, lastCheckInAt: true, lastSeenAt: true, emailVerifiedAt: true, notionPageId: true, createdAt: true, _count: { select: { reports: true } }, payouts: { select: { amount: true, token: true, reason: true } } },
  });
  if (new URL(req.url).searchParams.get('format') === 'csv') {
    const qs = cleanQuestions(program.questions);
    const head = ['name', 'email', 'email_verified', 'stage', 'type', 'usage', 'send_funds', 'channel', 'handle', 'wallet', 'test_areas', 'contact', 'platform', 'status', 'reports', 'paid', 'joined', 'last_check_in', 'last_seen', ...qs.map((q) => q.label)];
    const rows = testers.map((t) => [t.name, t.email, t.emailVerifiedAt ? 'yes' : 'no', LABEL.stage[t.stage], t.types.map((x) => LABEL.type[x]).join('; '), LABEL.usage[t.usage], LABEL.sendFunds[t.sendFunds], t.channel ? LABEL.channel[t.channel] : '', t.handle, t.walletAddress, t.testAreas.join('; '), t.contact, t.platform, t.status, t._count.reports, paidText(t.payouts), t.createdAt.toISOString(), t.lastCheckInAt?.toISOString() ?? '', t.lastSeenAt?.toISOString() ?? '',
      ...qs.map((q) => ((t.answers as Record<string, string> | null) ?? {})[q.id] ?? '')]);
    const csv = [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
    return new Response(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${program.slug}-testers.csv"` } });
  }
  return NextResponse.json({
    questions: cleanQuestions(program.questions),
    testers: testers.map(({ _count, payouts, ...t }) => ({ ...t, reports: _count.reports, paid: paidText(payouts), funded: payouts.some((x) => x.reason === 'test_funds') })),
  });
}

/** The team adds a tester (no email needed): { name, email?, stage?, types?, usage?, sendFunds?, channel?, handle?, walletAddress?, testAreas? } */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const s = await staffProgram(id, 'beta.manage');
  if ('error' in s) return s.error;
  const b = await body(req);
  return run(async () => ({ tester: await addTester(s.p, b) }), 201);
}
