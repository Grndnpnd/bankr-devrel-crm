import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { can } from '@/lib/access';
import { prisma } from '@/lib/prisma';
import { cleanQuestions } from '@/lib/beta';

export const dynamic = 'force-dynamic';

const csvCell = (v: unknown) => {
  const s = v == null ? '' : String(v);
  // Neutralise spreadsheet formulas and quote everything.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
};

/** Testers with their report counts. ?format=csv downloads them (with sign-up answers). */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await getSession();
  if (!session || !can(session.role, 'tasks.use')) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const program = await prisma.betaProgram.findUnique({ where: { id }, select: { slug: true, questions: true } });
  if (!program) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const testers = await prisma.tester.findMany({
    where: { programId: id }, orderBy: { createdAt: 'asc' },
    select: { id: true, name: true, email: true, contact: true, platform: true, answers: true, status: true, lastSeenAt: true, createdAt: true, _count: { select: { reports: true } } },
  });
  if (new URL(req.url).searchParams.get('format') === 'csv') {
    const qs = cleanQuestions(program.questions);
    const head = ['name', 'email', 'contact', 'platform', 'status', 'reports', 'joined', 'last_seen', ...qs.map((q) => q.label)];
    const rows = testers.map((t) => [t.name, t.email, t.contact, t.platform, t.status, t._count.reports, t.createdAt.toISOString(), t.lastSeenAt?.toISOString() ?? '',
      ...qs.map((q) => ((t.answers as Record<string, string> | null) ?? {})[q.id] ?? '')]);
    const csv = [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
    return new Response(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${program.slug}-testers.csv"` } });
  }
  return NextResponse.json({ testers: testers.map(({ _count, ...t }) => ({ ...t, reports: _count.reports })) });
}
