import { NextResponse } from 'next/server';
import { rateLimited } from '@/lib/beta';
import { FlowError, testerRetest } from '@/lib/betaFlow';
import { requireTester } from '@/lib/testerHttp';

export const dynamic = 'force-dynamic';

/** The tester tried the fix: { works: boolean, note? }. Verifies the bug, or sends it back to the team. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const r = await requireTester(req);
  if ('error' in r) return r.error;
  if (await rateLimited(`retest:${r.tester.id}`, 30, 3600_000)) return NextResponse.json({ error: 'Too many tries — wait a moment.' }, { status: 429 });
  const b = await req.json().catch(() => ({}));
  if (typeof b?.works !== 'boolean') return NextResponse.json({ error: 'Say whether it works now.' }, { status: 400 });
  try {
    await testerRetest(r.tester.id, id, b.works, typeof b.note === 'string' ? b.note.trim().slice(0, 2000) || null : null);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof FlowError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[beta] retest failed', e);
    return NextResponse.json({ error: 'Something went wrong on our side.' }, { status: 500 });
  }
}
