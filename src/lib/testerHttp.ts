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
  if (!tester) return { error: NextResponse.json({ error: 'Your tester link has expired or was replaced. Open the newest link from the team, or join again.' }, { status: 401 }) } as const;
  return { tester, slug } as const;
}
