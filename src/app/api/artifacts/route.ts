import { NextResponse } from 'next/server';
import { requestUser } from '@/lib/apiTokens';
import { createArtifact, listArtifacts, type ListScope } from '@/lib/artifacts';

export const dynamic = 'force-dynamic';

/** Artifacts the caller can open. ?scope=all|mine|shared|team&q=&tag= */
export async function GET(req: Request) {
  const user = await requestUser(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const url = new URL(req.url);
  const artifacts = await listArtifacts(user, {
    scope: (url.searchParams.get('scope') as ListScope) || 'all',
    q: url.searchParams.get('q') || undefined,
    tag: url.searchParams.get('tag') || undefined,
  });
  return NextResponse.json({ artifacts });
}

/** Create an artifact: { title?, html, description?, kind?, tags?, sourceUrl?, capabilities?, visibility? } */
export async function POST(req: Request) {
  const user = await requestUser(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body || typeof body.html !== 'string') return NextResponse.json({ error: 'html is required' }, { status: 400 });
  try {
    const a = await createArtifact(user, body);
    return NextResponse.json({ id: a.id, title: a.title, version: a.currentVersion }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'create failed' }, { status: 400 });
  }
}
