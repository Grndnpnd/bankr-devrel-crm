import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { can } from '@/lib/access';
import { runSpec, DataError } from '@/lib/dataSources';

export const dynamic = 'force-dynamic';

const STATUS = { forbidden: 403, no_access: 403, not_found: 404, invalid: 400 } as const;

/** POST { spec }: run a panel on the server as the person viewing it (beta and artifact sources). */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session || !can(session.role, 'analytics.use')) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  try {
    const { result, programName } = await runSpec(b?.spec, session);
    return NextResponse.json({ result, programName: programName ?? null });
  } catch (e) {
    if (e instanceof DataError) return NextResponse.json({ error: e.message, reason: e.code }, { status: STATUS[e.code] });
    console.error('[panels/run]', e);
    return NextResponse.json({ error: 'Something went wrong on our side.' }, { status: 500 });
  }
}
