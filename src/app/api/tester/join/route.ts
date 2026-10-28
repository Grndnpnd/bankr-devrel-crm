import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { clientIp, isInputError, joinProgram, portalUrl, programOpen, rateLimited, testerFromRequest, turnstileOk } from '@/lib/beta';
import { withTesterCookie } from '@/lib/testerHttp';

export const dynamic = 'force-dynamic';

/**
 * Join: { slug, k, email, name, contact?, platform?, answers?, turnstile? }.
 * New tester → signed in here (cookie) and shown their personal link.
 * An email that already joined → its owner is emailed a link (status "emailed"), or told to use
 * the link they saved (status "exists"); nobody gets signed in as someone else from here.
 */
export async function POST(req: Request) {
  const ip = clientIp(req);
  if (await rateLimited(`join:${ip}`, 10, 3600_000)) return NextResponse.json({ error: 'Too many tries from here — wait a bit and try again.' }, { status: 429 });
  const body = await req.json().catch(() => null);
  const p = await prisma.betaProgram.findUnique({ where: { slug: String(body?.slug ?? '') } });
  if (!p || typeof body?.k !== 'string' || p.joinToken !== body.k) return NextResponse.json({ error: 'This invite link isn’t valid any more.' }, { status: 404 });
  if (!programOpen(p)) return NextResponse.json({ error: 'This beta isn’t taking new testers right now.' }, { status: 403 });
  if (!(await turnstileOk(body?.turnstile, ip))) return NextResponse.json({ error: 'Please complete the check and try again.' }, { status: 400 });
  try {
    const r = await joinProgram(p, body, await testerFromRequest(req, p.slug));
    if (r.status === 'joined') {
      const res = NextResponse.json({ status: r.status, portalUrl: portalUrl(p.slug, r.portalToken), emailed: r.emailed, welcome: p.welcome });
      return withTesterCookie(res, p.slug, r.portalToken);
    }
    return NextResponse.json({ status: r.status, welcome: r.status === 'updated' ? p.welcome : null });
  } catch (e) {
    if (isInputError(e)) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error('[beta] join failed', e);
    return NextResponse.json({ error: 'Something went wrong on our side. Try again in a minute.' }, { status: 500 });
  }
}
