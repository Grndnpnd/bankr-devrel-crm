import { NextResponse } from 'next/server';
import { testerForToken, testerFromRequest } from '@/lib/beta';
import { withTesterCookie } from '@/lib/testerHttp';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/** A tester's personal link: remember them on this device and open their portal. */
export async function GET(req: Request, ctx: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await ctx.params;
  const base = new URL(req.url);
  const portal = () => NextResponse.redirect(new URL(`/b/${encodeURIComponent(slug)}/portal`, base));
  const fromLink = await testerForToken(slug, token, { opening: true });
  // A wrong or old link from a browser that's already signed in just opens their page.
  const res = fromLink
    ? withTesterCookie(portal(), slug, token)
    : (await testerFromRequest(req, slug))
      ? portal()
      : (await prisma.betaProgram.findUnique({ where: { slug }, select: { id: true } }))
        ? NextResponse.redirect(new URL(`/b/${encodeURIComponent(slug)}/portal?expired=1`, base))
        : portal(); // the beta itself is gone: the page says so
  res.headers.set('Referrer-Policy', 'no-referrer');
  res.headers.set('Cache-Control', 'no-store');
  return res;
}
