import { NextResponse } from 'next/server';
import { requireTester } from '@/lib/testerHttp';
import { portalData } from '@/lib/betaPortal';
import { cookieName, rateLimited } from '@/lib/beta';
import { eraseTester } from '@/lib/betaErase';

export const dynamic = 'force-dynamic';

/** The tester's page: who they are, the program, their reports (with new-reply counts) and messages. */
export async function GET(req: Request) {
  const r = await requireTester(req);
  if ('error' in r) return r.error;
  return NextResponse.json(await portalData(r.tester));
}

/**
 * Leave the beta and delete my data: the tester, their reports (with replies, files and tasks), their
 * messages and payout records here, and their rows on the program's Notion boards. Copies already in
 * the team's support inbox (Plain) stay until the team deletes them; the page says so before asking.
 */
export async function DELETE(req: Request) {
  const r = await requireTester(req);
  if ('error' in r) return r.error;
  if (await rateLimited(`leave:${r.tester.id}`, 5, 3600_000)) return NextResponse.json({ error: 'Try again in a moment.' }, { status: 429 });
  await eraseTester(r.tester.id);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(cookieName(r.slug), '', { path: '/', maxAge: 0 });
  return res;
}
