import { getSession } from '@/lib/auth';
import { can } from '@/lib/access';
import { prisma } from '@/lib/prisma';
import { attachmentResponse } from '@/lib/attachmentResponse';

export const dynamic = 'force-dynamic';

/** A tester's uploaded file, for the team. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await getSession();
  if (!session || !can(session.role, 'tasks.use')) return new Response('forbidden', { status: 403 });
  const a = await prisma.testerAttachment.findUnique({ where: { id } });
  if (!a) return new Response('not found', { status: 404 });
  return attachmentResponse(a);
}
