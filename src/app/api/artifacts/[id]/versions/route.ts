import { NextResponse } from 'next/server';
import { requestUser } from '@/lib/apiTokens';
import { prisma } from '@/lib/prisma';
import { openArtifact } from '@/lib/artifacts';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params;
  const user = await requestUser(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await openArtifact(params.id, user))) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const versions = await prisma.artifactVersion.findMany({
    where: { artifactId: params.id },
    orderBy: { version: 'desc' },
    select: { version: true, note: true, createdAt: true, createdById: true },
  });
  const ids = Array.from(new Set(versions.map((v) => v.createdById).filter(Boolean))) as string[];
  const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, email: true } });
  const byId = Object.fromEntries(users.map((u) => [u.id, u.name || u.email]));
  return NextResponse.json({ versions: versions.map((v) => ({ ...v, by: v.createdById ? byId[v.createdById] ?? null : null })) });
}
