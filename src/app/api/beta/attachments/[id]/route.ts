import { staffRecord } from '@/lib/betaHttp';
import { prisma } from '@/lib/prisma';
import { attachmentResponse } from '@/lib/attachmentResponse';

export const dynamic = 'force-dynamic';

/** A tester's uploaded file, for the team. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const s = await staffRecord('attachment', id);
  if ('error' in s) return s.error;
  const a = await prisma.testerAttachment.findUnique({ where: { id } });
  if (!a) return new Response('not found', { status: 404 });
  return attachmentResponse(a, { thumb: new URL(req.url).searchParams.get('thumb') === '1' });
}
