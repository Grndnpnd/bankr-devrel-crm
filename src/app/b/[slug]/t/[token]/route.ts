import { NextResponse } from 'next/server';
import { testerForToken } from '@/lib/beta';
import { withTesterCookie } from '@/lib/testerHttp';

export const dynamic = 'force-dynamic';

/** A tester's personal link: remember them on this device and open their portal. */
export async function GET(req: Request, ctx: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await ctx.params;
  const base = new URL(req.url);
  const tester = await testerForToken(slug, token);
  if (!tester) return NextResponse.redirect(new URL(`/b/${slug}/portal?expired=1`, base));
  return withTesterCookie(NextResponse.redirect(new URL(`/b/${slug}/portal`, base)), slug, token);
}
