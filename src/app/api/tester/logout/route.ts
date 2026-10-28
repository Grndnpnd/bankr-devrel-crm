import { NextResponse } from 'next/server';
import { cookieName } from '@/lib/beta';

export const dynamic = 'force-dynamic';

/** Sign this browser out of the beta page (?slug=). The personal link still works to come back. */
export async function POST(req: Request) {
  const slug = new URL(req.url).searchParams.get('slug') || '';
  const res = NextResponse.json({ ok: true });
  if (slug) res.cookies.set(cookieName(slug), '', { path: '/', maxAge: 0 });
  return res;
}
