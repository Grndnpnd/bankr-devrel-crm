import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { can } from '@/lib/access';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

async function manager() {
  const session = await getSession();
  return session && can(session.role, 'support.manage') ? session : null;
}

const fields = (b: any) => {
  const data: Record<string, unknown> = {};
  if (b?.labelName !== undefined) data.labelName = String(b.labelName ?? '').trim().slice(0, 100) || null;
  if (b?.teamId !== undefined) data.teamId = String(b.teamId);
  if (b?.notifyNew !== undefined) data.notifyNew = !!b.notifyNew;
  if (b?.notifySla !== undefined) data.notifySla = !!b.notifySla;
  if (b?.position !== undefined) data.position = Number(b.position) || 0;
  return data;
};

/** Add a rule: { teamId, labelName?, notifyNew?, notifySla? } (no label = every thread). */
export async function POST(req: Request) {
  if (!(await manager())) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const data = fields(await req.json().catch(() => ({})));
  if (!data.teamId || !(await prisma.team.findUnique({ where: { id: data.teamId as string } }))) return NextResponse.json({ error: 'pick a team' }, { status: 400 });
  const last = await prisma.plainRoute.findFirst({ orderBy: { position: 'desc' }, select: { position: true } });
  const route = await prisma.plainRoute.create({ data: { position: (last?.position ?? 0) + 1, ...data, teamId: data.teamId as string } });
  return NextResponse.json({ route }, { status: 201 });
}

/** Change a rule: { id, ...fields } */
export async function PATCH(req: Request) {
  if (!(await manager())) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  if (!b?.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const route = await prisma.plainRoute.update({ where: { id: String(b.id) }, data: fields(b) }).catch(() => null);
  return route ? NextResponse.json({ route }) : NextResponse.json({ error: 'not found' }, { status: 404 });
}

export async function DELETE(req: Request) {
  if (!(await manager())) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  await prisma.plainRoute.delete({ where: { id } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
