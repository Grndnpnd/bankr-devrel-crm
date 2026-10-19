import { NextResponse } from 'next/server';
import { requestUser } from '@/lib/apiTokens';
import { prisma } from '@/lib/prisma';
import { atLeast, openArtifact, setShares } from '@/lib/artifacts';

export const dynamic = 'force-dynamic';

/** Who has access, plus the people it could be shared with. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params;
  const user = await requestUser(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const found = await openArtifact(params.id, user);
  if (!found) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const [shares, people] = await Promise.all([
    prisma.artifactShare.findMany({ where: { artifactId: params.id }, include: { user: { select: { id: true, name: true, email: true } } } }),
    prisma.user.findMany({ where: { active: true }, select: { id: true, name: true, email: true }, orderBy: { name: 'asc' } }),
  ]);
  return NextResponse.json({
    visibility: found.artifact.visibility,
    ownerId: found.artifact.ownerId,
    level: found.level,
    shares: shares.map((s) => ({ userId: s.userId, level: s.level, name: s.user.name, email: s.user.email })),
    people,
  });
}

/** Replace the share list: { shares: [{ userId, level: VIEW|INTERACT|EDIT }], visibility? } */
export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params;
  const user = await requestUser(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const found = await openArtifact(params.id, user);
  if (!found) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (!atLeast(found.level, 'admin')) return NextResponse.json({ error: 'only editors can share' }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const shares = Array.isArray(body?.shares) ? body.shares : [];
  const valid = shares.filter((s: any) => typeof s?.userId === 'string' && ['VIEW', 'INTERACT', 'EDIT'].includes(s?.level));
  // Editors can share, but only the owner hands out edit access.
  if (found.level !== 'owner' && valid.some((s: any) => s.level === 'EDIT')) {
    return NextResponse.json({ error: 'only the owner can grant edit access' }, { status: 403 });
  }
  if (body?.visibility !== undefined && found.level !== 'owner') {
    return NextResponse.json({ error: 'only the owner can change visibility' }, { status: 403 });
  }
  await setShares(params.id, valid);
  if (body?.visibility === 'TEAM' || body?.visibility === 'PRIVATE') {
    await prisma.artifact.update({ where: { id: params.id }, data: { visibility: body.visibility } });
  }
  return NextResponse.json({ ok: true });
}
