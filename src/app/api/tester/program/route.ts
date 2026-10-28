import { NextResponse } from 'next/server';
import { testerFromRequest } from '@/lib/beta';
import { joinInfo } from '@/lib/betaPortal';

export const dynamic = 'force-dynamic';

/** What the join page shows: ?slug=…&k=<join token>. Wrong or revoked link → 404. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const slug = url.searchParams.get('slug') || '';
  const info = await joinInfo(slug, url.searchParams.get('k') || '', await testerFromRequest(req, slug));
  if (!info.ok) return NextResponse.json({ error: info.error ?? 'This invite link isn’t valid any more. Ask the team for a new one.' }, { status: 404 });
  return NextResponse.json(info);
}
