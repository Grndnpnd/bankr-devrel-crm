import { prisma } from '@/lib/prisma';
import { can } from '@/lib/access';
import type { SessionUser } from '@/lib/auth';
import { notify } from '@/lib/notify';

export async function listTeams() {
  return prisma.team.findMany({
    orderBy: { name: 'asc' },
    include: {
      members: { include: { user: { select: { id: true, name: true, email: true } } }, orderBy: { createdAt: 'asc' } },
      _count: { select: { tasks: { where: { status: { not: 'DONE' } } } } },
    },
  });
}

/** Admins (teams.manage) manage every team; a team's leads manage their own. */
export async function canManageTeam(user: SessionUser, teamId?: string) {
  if (can(user.role, 'teams.manage')) return true;
  if (!teamId) return false;
  const m = await prisma.teamMember.findUnique({ where: { teamId_userId: { teamId, userId: user.id } } });
  return m?.role === 'lead';
}

export async function setMembers(actor: SessionUser, teamId: string, members: { userId: string; role?: string }[]) {
  const team = await prisma.team.findUniqueOrThrow({ where: { id: teamId }, include: { members: true } });
  const wanted = new Map(members.filter((m) => m.userId).map((m) => [m.userId, m.role === 'lead' ? 'lead' : 'member']));
  const before = new Set(team.members.map((m) => m.userId));
  await prisma.$transaction([
    prisma.teamMember.deleteMany({ where: { teamId, userId: { notIn: [...wanted.keys()] } } }),
    ...[...wanted].map(([userId, role]) => prisma.teamMember.upsert({
      where: { teamId_userId: { teamId, userId } },
      update: { role },
      create: { teamId, userId, role },
    })),
  ]);
  const added = [...wanted.keys()].filter((id) => !before.has(id));
  if (added.length) {
    await notify({
      userIds: added, actorId: actor.id, kind: 'team.added', url: `/tasks?team=${teamId}`,
      title: `You were added to ${team.name}`, body: `By ${actor.name || actor.email}`,
    });
  }
}

export async function activePeople() {
  return prisma.user.findMany({ where: { active: true }, select: { id: true, name: true, email: true }, orderBy: { name: 'asc' } });
}
