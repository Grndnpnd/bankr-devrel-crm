import { NextResponse } from 'next/server';
import { getSession, type SessionUser } from '@/lib/auth';
import { can, type Capability } from '@/lib/access';
import { FlowError, loadProgram, type Program } from '@/lib/betaFlow';

type Ok<T> = { session: SessionUser } & T;
type Err = { error: NextResponse };

/** The signed-in team member, if they hold `cap` (triage needs tasks.use; settings need beta.manage). */
export async function staff(cap: Capability = 'tasks.use'): Promise<Ok<{}> | Err> {
  const session = await getSession();
  if (!session || !can(session.role, cap)) return { error: NextResponse.json({ error: 'forbidden' }, { status: 403 }) };
  return { session };
}

/** staff() plus the program in the route, or a 404. */
export async function staffProgram(id: string, cap: Capability = 'tasks.use'): Promise<Ok<{ p: Program }> | Err> {
  const s = await staff(cap);
  if ('error' in s) return s;
  const p = await loadProgram(id);
  if (!p) return { error: NextResponse.json({ error: 'not found' }, { status: 404 }) };
  return { session: s.session, p };
}

/** Run a workflow step; its FlowErrors become their status, anything else a logged 500. */
export async function run<T>(fn: () => Promise<T>, status = 200) {
  try {
    return NextResponse.json(await fn(), { status });
  } catch (e) {
    if (e instanceof FlowError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[beta]', e);
    return NextResponse.json({ error: 'Something went wrong on our side.' }, { status: 500 });
  }
}

export const body = (req: Request) => req.json().catch(() => ({})) as Promise<any>;
