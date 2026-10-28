import { NextResponse } from 'next/server';
import { newTesterLink, portalUrl, rateLimited, resetTesterLinks } from '@/lib/beta';
import { withTesterCookie } from '@/lib/testerHttp';
import { requireTester } from '@/lib/testerHttp';

export const dynamic = 'force-dynamic';

/**
 * A personal link for another device (the old ones keep working). { reset: true } instead turns off every
 * link the tester has (a shared or leaked one too) and returns the single new one; this browser stays signed in.
 */
export async function POST(req: Request) {
  const r = await requireTester(req);
  if ('error' in r) return r.error;
  if (await rateLimited(`selflink:${r.tester.id}`, 10, 3600_000)) return NextResponse.json({ error: 'Too many links — try again later.' }, { status: 429 });
  const b = await req.json().catch(() => ({}));
  if (b?.reset) {
    const t = await resetTesterLinks(r.tester.id);
    return withTesterCookie(NextResponse.json({ url: portalUrl(r.slug, t), reset: true }), r.slug, t);
  }
  return NextResponse.json({ url: portalUrl(r.slug, await newTesterLink(r.tester.id, 'self')) });
}
