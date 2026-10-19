import { NextResponse } from 'next/server';
import { requestUser } from '@/lib/apiTokens';
import { prisma } from '@/lib/prisma';
import { atLeast, openArtifact } from '@/lib/artifacts';
import { cleanPath, MAX_FILE_BYTES, sha256, typeFor } from '@/lib/artifactFiles';

export const dynamic = 'force-dynamic';

/** The artifact's supporting files (no bytes). */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const user = await requestUser(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await openArtifact(id, user))) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const files = await prisma.artifactFile.findMany({
    where: { artifactId: id }, orderBy: { path: 'asc' },
    select: { path: true, contentType: true, size: true, sha256: true, updatedAt: true },
  });
  return NextResponse.json({ files });
}

/** Upload or replace one file: PUT ?path=gray/s01.jpg with the raw bytes as the body. Needs edit access. */
export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const user = await requestUser(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const found = await openArtifact(id, user);
  if (!found) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (!atLeast(found.level, 'admin')) return NextResponse.json({ error: 'needs edit access' }, { status: 403 });
  const rel = cleanPath(new URL(req.url).searchParams.get('path') ?? '');
  if (!rel) return NextResponse.json({ error: 'a relative path is required (not index.html)' }, { status: 400 });
  const buf = Buffer.from(await req.arrayBuffer());
  if (!buf.length) return NextResponse.json({ error: 'empty body' }, { status: 400 });
  if (buf.length > MAX_FILE_BYTES) return NextResponse.json({ error: 'file over 15 MB' }, { status: 413 });
  const contentType = typeFor(rel, req.headers.get('content-type'));
  const hash = sha256(buf);
  await prisma.artifactFile.upsert({
    where: { artifactId_path: { artifactId: id, path: rel } },
    update: { data: buf, size: buf.length, sha256: hash, contentType },
    create: { artifactId: id, path: rel, data: buf, size: buf.length, sha256: hash, contentType },
  });
  await prisma.artifact.update({ where: { id }, data: { updatedAt: new Date() } });
  return NextResponse.json({ path: rel, size: buf.length, sha256: hash, contentType });
}

/** Remove one file: DELETE ?path=… */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const user = await requestUser(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const found = await openArtifact(id, user);
  if (!found) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (!atLeast(found.level, 'admin')) return NextResponse.json({ error: 'needs edit access' }, { status: 403 });
  const rel = cleanPath(new URL(req.url).searchParams.get('path') ?? '');
  if (!rel) return NextResponse.json({ error: 'path is required' }, { status: 400 });
  await prisma.artifactFile.deleteMany({ where: { artifactId: id, path: rel } });
  return NextResponse.json({ ok: true });
}
