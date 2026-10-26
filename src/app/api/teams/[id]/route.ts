import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { can } from '@/lib/access';
import { prisma } from '@/lib/prisma';
import { canManageTeam } from '@/lib/teams';

export const dynamic = 'force-dynamic';

/** Rename / describe / recolor: { name?, description?, color? } */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await canManageTeam(session, id))) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const data: Record<string, string | null> = {};
  if (typeof body?.name === 'string' && body.name.trim()) data.name = body.name.trim().slice(0, 60);
  if (body?.description !== undefined) data.description = body.description ? String(body.description).slice(0, 500) : null;
  if (typeof body?.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(body.color)) data.color = body.color;
  try {
    await prisma.team.update({ where: { id }, data });
  } catch {
    return NextResponse.json({ error: 'could not update (name taken?)' }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

/** Delete a team. Its tasks stay, unassigned from the team. */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!can(session.role, 'teams.manage')) return NextResponse.json({ error: 'only admins can delete teams' }, { status: 403 });
  await prisma.team.delete({ where: { id } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
