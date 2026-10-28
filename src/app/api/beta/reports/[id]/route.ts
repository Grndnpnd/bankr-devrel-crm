import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { updateReport } from '@/lib/betaFlow';
import { body, run, staffRecord } from '@/lib/betaHttp';
import { threadUrl } from '@/lib/plainSupport';
import { txUrl } from '@/lib/betaModel';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const s = await staffRecord('report', id);
  if ('error' in s) return s.error;
  const report = await prisma.testerReport.findUnique({
    where: { id },
    include: {
      tester: { select: { id: true, name: true, email: true, contact: true, platform: true, status: true, emailVerifiedAt: true, channel: true, handle: true, walletAddress: true } },
      task: { select: { id: true, status: true, assignee: { select: { name: true, email: true } }, team: { select: { name: true } } } },
      replies: { orderBy: { createdAt: 'asc' } },
      attachments: { select: { id: true, filename: true, contentType: true, size: true } },
      duplicateOf: { select: { id: true, title: true, status: true } },
      duplicates: { select: { id: true, title: true, tester: { select: { name: true } } } },
      call: { select: { id: true, title: true, date: true } },
      outreach: { orderBy: { createdAt: 'desc' }, select: { id: true, type: true, status: true, title: true, outcome: true, tester: { select: { name: true } } } },
      payouts: { select: { id: true, amount: true, token: true, reason: true, tx: true, tester: { select: { name: true } } } },
    },
  });
  if (!report) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const authorIds = [...new Set([...report.replies.map((r) => r.userId), report.waitingOnId, report.loggedById].filter(Boolean))] as string[];
  const authors = await prisma.user.findMany({ where: { id: { in: authorIds } }, select: { id: true, name: true, email: true } });
  const byId = Object.fromEntries(authors.map((a) => [a.id, a.name || a.email]));
  return NextResponse.json({
    report: {
      ...report,
      plainUrl: report.plainThreadId ? threadUrl(null, report.plainThreadId) : null,
      waitingOn: report.waitingOnId ? byId[report.waitingOnId] ?? null : null,
      loggedBy: report.loggedById ? byId[report.loggedById] ?? null : null,
      payouts: report.payouts.map((x) => ({ ...x, txUrl: txUrl(x.tx) })),
      replies: report.replies.map((r) => ({ ...r, author: r.authorType === 'team' ? byId[r.userId ?? ''] ?? (r.via === 'plain' ? 'Team (in Plain)' : 'Team') : `${report.tester.name}${r.via === 'plain' ? ' (by email)' : ''}` })),
    },
  });
}

/** Triage: status, official severity, area, device, links, waiting on, duplicate of, … (see betaFlow). */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const s = await staffRecord('report', id);
  if ('error' in s) return s.error;
  const b = await body(req);
  return run(async () => { await updateReport(s.session, id, b); return { ok: true }; });
}

/** Delete a report (spam, a test, a mistake) with its replies, files and task. */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const s = await staffRecord('report', id, 'beta.manage');
  if ('error' in s) return s.error;
  const r = await prisma.testerReport.findUnique({ where: { id }, select: { taskId: true, notionPageId: true } });
  if (!r) return NextResponse.json({ error: 'not found' }, { status: 404 });
  await prisma.testerReport.delete({ where: { id } });
  if (r.taskId) await prisma.task.delete({ where: { id: r.taskId } }).catch(() => {});
  if (r.notionPageId && !r.notionPageId.startsWith('gone:')) {
    const { notionConfigured, trashPage } = await import('@/lib/notion');
    if (notionConfigured()) await trashPage(r.notionPageId).catch(() => {});
  }
  return NextResponse.json({ ok: true });
}
