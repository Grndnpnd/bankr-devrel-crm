import { NextResponse } from 'next/server';
import { testerForToken } from '@/lib/beta';
import { withTesterCookie } from '@/lib/testerHttp';

export const dynamic = 'force-dynamic';

/** A tester's personal link: remember them on this device and open their portal. */
export async function GET(req: Request, ctx: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await ctx.params;
  const base = new URL(req.url);
  const tester = await testerForToken(slug, token, { opening: true });
  const res = tester
    ? withTesterCookie(NextResponse.redirect(new URL(`/b/${encodeURIComponent(slug)}/portal`, base)), slug, token)
    : NextResponse.redirect(new URL(`/b/${encodeURIComponent(slug)}/portal?expired=1`, base));
  res.headers.set('Referrer-Policy', 'no-referrer');
  res.headers.set('Cache-Control', 'no-store');
  return res;
}
