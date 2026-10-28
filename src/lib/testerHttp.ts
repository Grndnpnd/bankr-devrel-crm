import { NextResponse } from 'next/server';
import { cookieName, testerFromRequest } from '@/lib/beta';

/** Set the tester's portal cookie (httpOnly; the raw token never reaches page JS). */
export function withTesterCookie(res: NextResponse, slug: string, portalToken: string) {
  res.cookies.set(cookieName(slug), portalToken, {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 180 * 86400,
  });
  return res;
}

/** The tester for ?slug=… or a 401 response. */
export async function requireTester(req: Request) {
  const slug = new URL(req.url).searchParams.get('slug') || '';
  const tester = slug ? await testerFromRequest(req, slug) : null;
  if (!tester) {
    const { portalProblem } = await import('@/lib/betaPortal');
    const reason = slug ? await portalProblem(slug) : 'ended';
    const error = reason === 'ended' ? 'This beta has ended.' : 'This browser isn’t signed in to your beta page. Open the personal link you saved when you joined.';
    return { error: NextResponse.json({ error, reason }, { status: 401 }) } as const;
  }
  return { tester, slug } as const;
}
