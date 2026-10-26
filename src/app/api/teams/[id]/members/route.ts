import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { canManageTeam, setMembers } from '@/lib/teams';

export const dynamic = 'force-dynamic';

/** Replace the member list: { members: [{ userId, role: 'lead' | 'member' }] }. New members are notified. */
export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await canManageTeam(session, id))) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  if (!Array.isArray(body?.members)) return NextResponse.json({ error: 'members must be a list' }, { status: 400 });
  try {
    await setMembers(session, id, body.members);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'update failed' }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
