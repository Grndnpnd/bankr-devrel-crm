import { prisma } from '@/lib/prisma';
import { requireTester } from '@/lib/testerHttp';
import { attachmentResponse } from '@/lib/attachmentResponse';

export const dynamic = 'force-dynamic';

/** A file on one of the tester's own reports. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const r = await requireTester(req);
  if ('error' in r) return r.error;
  const a = await prisma.testerAttachment.findFirst({ where: { id, report: { testerId: r.tester.id } } });
  if (!a) return new Response('not found', { status: 404 });
  return attachmentResponse(a);
}
