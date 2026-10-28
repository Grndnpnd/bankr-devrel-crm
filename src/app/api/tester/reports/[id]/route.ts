import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { STATUS_LABEL } from '@/lib/beta';
import { TESTER_TONE } from '@/lib/betaModel';
import { requireTester } from '@/lib/testerHttp';
import { testerReportDetail } from '@/lib/betaPortal';

export const dynamic = 'force-dynamic';

/** One of the tester's own reports, with the conversation and attachments. Marks team replies seen. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const r = await requireTester(req);
  if ('error' in r) return r.error;
  const report = await testerReportDetail(r.tester.id, id);
  if (!report) return NextResponse.json({ error: 'This report was withdrawn.', gone: true }, { status: 404 });
  return NextResponse.json({ report });
}

/** The tester withdraws one of their reports: it's deleted with its conversation, files and task. */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const r = await requireTester(req);
  if ('error' in r) return r.error;
  const report = await prisma.testerReport.findFirst({ where: { id, testerId: r.tester.id }, select: { id: true, taskId: true, notionPageId: true } });
  if (!report) return NextResponse.json({ error: 'This report was withdrawn.', gone: true }, { status: 404 });
  await prisma.testerReport.deleteMany({ where: { id } });
  if (report.taskId) await prisma.task.delete({ where: { id: report.taskId } }).catch(() => {});
  if (report.notionPageId && !report.notionPageId.startsWith('gone:')) {
    const { notionConfigured, trashPage } = await import('@/lib/notion');
    if (notionConfigured()) await trashPage(report.notionPageId).catch(() => {});
  }
  return NextResponse.json({ ok: true });
}
