/**
 * Erase a tester and everything about them here: reports (with replies and files), their tasks,
 * messages and payout records, the team's notifications that name them, and their rows on the
 * program's Notion boards (moved to Notion's trash). Copies in Plain stay until the team deletes them.
 */
import { prisma } from '@/lib/prisma';

export async function eraseTester(testerId: string) {
  const t = await prisma.tester.findUnique({ where: { id: testerId }, select: { id: true, notionPageId: true, programId: true } });
  if (!t) return false;
  const reports = await prisma.testerReport.findMany({ where: { testerId }, select: { id: true, taskId: true, notionPageId: true } });
  const [outreach, payouts] = await Promise.all([
    prisma.betaOutreach.findMany({ where: { testerId }, select: { id: true, notionPageId: true } }),
    prisma.betaPayout.findMany({ where: { testerId }, select: { notionPageId: true } }),
  ]);
  const pages = [t.notionPageId, ...reports.map((x) => x.notionPageId), ...outreach.map((x) => x.notionPageId), ...payouts.map((x) => x.notionPageId)]
    .filter((x): x is string => !!x && !x.startsWith('gone:'));
  await prisma.tester.delete({ where: { id: testerId } }); // cascades to reports, replies, files, links, messages, payouts
  const taskIds = reports.map((x) => x.taskId).filter((x): x is string => !!x);
  if (taskIds.length) await prisma.task.deleteMany({ where: { id: { in: taskIds } } });
  // Notifications point at /beta/<program>?report=<id> or ?o=<id>; drop the ones about this tester.
  const refs = [...reports.map((x) => `report=${x.id}`), ...outreach.map((x) => `o=${x.id}`)];
  for (let i = 0; i < refs.length; i += 50) {
    await prisma.notification.deleteMany({ where: { OR: refs.slice(i, i + 50).map((r) => ({ url: { contains: r } })) } });
  }
  if (pages.length) {
    const { notionConfigured, trashPage } = await import('@/lib/notion');
    if (notionConfigured()) for (const id of pages) await trashPage(id).catch(() => {});
  }
  return true;
}
