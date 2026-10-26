import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { can } from '@/lib/access';
import { prisma } from '@/lib/prisma';
import { activePeople, listTeams, setMembers } from '@/lib/teams';

export const dynamic = 'force-dynamic';

/** Teams with members and open-task counts, plus everyone who can be added or assigned. */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const [teams, people] = await Promise.all([listTeams(), activePeople()]);
  return NextResponse.json({
    teams: teams.map((t) => ({
      id: t.id, name: t.name, description: t.description, color: t.color, openTasks: t._count.tasks,
      members: t.members.map((m) => ({ userId: m.userId, role: m.role, name: m.user.name, email: m.user.email })),
    })),
    people,
    me: session.id,
    canManageAll: can(session.role, 'teams.manage'),
  });
}

/** Create a team: { name, description?, color?, members?: [{ userId, role }] } */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!can(session.role, 'teams.manage')) return NextResponse.json({ error: 'only admins can create teams' }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const name = String(body?.name ?? '').trim().slice(0, 60);
  if (!name) return NextResponse.json({ error: 'a team needs a name' }, { status: 400 });
  if (await prisma.team.findUnique({ where: { name } })) return NextResponse.json({ error: 'a team with that name exists' }, { status: 409 });
  const team = await prisma.team.create({
    data: {
      name,
      description: body?.description ? String(body.description).slice(0, 500) : null,
      ...(typeof body?.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(body.color) ? { color: body.color } : {}),
    },
  });
  if (Array.isArray(body?.members)) await setMembers(session, team.id, body.members);
  return NextResponse.json({ id: team.id }, { status: 201 });
}
