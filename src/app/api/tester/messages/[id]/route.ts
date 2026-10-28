import { NextResponse } from 'next/server';
import { rateLimited } from '@/lib/beta';
import { FlowError, testerAnswer } from '@/lib/betaFlow';
import { requireTester } from '@/lib/testerHttp';

export const dynamic = 'force-dynamic';

/** The tester answers a message the team put on their page: { answer } */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const r = await requireTester(req);
  if ('error' in r) return r.error;
  if (await rateLimited(`answer:${r.tester.id}`, 60, 3600_000)) return NextResponse.json({ error: 'Too many messages — wait a moment.' }, { status: 429 });
  const b = await req.json().catch(() => ({}));
  try {
    await testerAnswer(r.tester.id, id, String(b?.answer ?? ''));
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof FlowError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[beta] answer failed', e);
    return NextResponse.json({ error: 'Something went wrong on our side.' }, { status: 500 });
  }
}
