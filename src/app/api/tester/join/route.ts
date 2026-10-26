import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { clientIp, joinProgram, portalUrl, programOpen, rateLimited, turnstileOk } from '@/lib/beta';
import { withTesterCookie } from '@/lib/testerHttp';

export const dynamic = 'force-dynamic';

/** Join: { slug, k, email, name, contact?, platform?, answers?, turnstile? } → sets the portal cookie, returns the personal link. */
export async function POST(req: Request) {
  const ip = clientIp(req);
  if (rateLimited(`join:${ip}`, 10, 3600_000)) return NextResponse.json({ error: 'Too many tries from here — wait a bit and try again.' }, { status: 429 });
  const body = await req.json().catch(() => ({}));
  const p = await prisma.betaProgram.findUnique({ where: { slug: String(body?.slug ?? '') } });
  if (!p || p.joinToken !== body?.k) return NextResponse.json({ error: 'This invite link isn’t valid any more.' }, { status: 404 });
  if (!programOpen(p)) return NextResponse.json({ error: 'This beta isn’t taking new testers right now.' }, { status: 403 });
  if (!(await turnstileOk(body?.turnstile, ip))) return NextResponse.json({ error: 'Please complete the check and try again.' }, { status: 400 });
  try {
    const { portalToken, rejoined } = await joinProgram(p, body);
    const res = NextResponse.json({ ok: true, rejoined, portalUrl: portalUrl(p.slug, portalToken), welcome: p.welcome });
    return withTesterCookie(res, p.slug, portalToken);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Could not join' }, { status: 400 });
  }
}
