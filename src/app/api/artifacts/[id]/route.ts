import { NextResponse } from 'next/server';
import { requestUser } from '@/lib/apiTokens';
import { prisma } from '@/lib/prisma';
import { atLeast, openArtifact, restoreVersion, updateArtifact } from '@/lib/artifacts';

export const dynamic = 'force-dynamic';

/** Metadata (+ html with ?html=1) and the caller's level. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params;
  const user = await requestUser(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const found = await openArtifact(params.id, user);
  if (!found) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const { artifact, level } = found;
  const withHtml = new URL(req.url).searchParams.get('html') === '1';
  const owner = await prisma.user.findUnique({ where: { id: artifact.ownerId }, select: { id: true, name: true, email: true } });
  const { html, ...meta } = artifact;
  return NextResponse.json({ artifact: { ...meta, owner, ...(withHtml ? { html } : {}) }, level });
}

/** Update metadata and/or html (html makes a new version). { restoreVersion: n } restores. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params;
  const user = await requestUser(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const found = await openArtifact(params.id, user);
  if (!found) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  try {
    const a = typeof body?.restoreVersion === 'number'
      ? await restoreVersion(params.id, user, found.level, body.restoreVersion)
      : await updateArtifact(params.id, user, found.level, body);
    return NextResponse.json({ id: a.id, version: a.currentVersion, title: a.title });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'update failed' }, { status: 400 });
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params;
  const user = await requestUser(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const found = await openArtifact(params.id, user);
  if (!found) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (!atLeast(found.level, 'owner')) return NextResponse.json({ error: 'only the owner can delete' }, { status: 403 });
  await prisma.artifact.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
