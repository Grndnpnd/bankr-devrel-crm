import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { NOTIFICATION_KINDS } from '@/lib/notify';

export const dynamic = 'force-dynamic';

/** Which kinds reach my devices by push (all on unless turned off). */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const u = await prisma.user.findUnique({ where: { id: session.id }, select: { notificationPrefs: true } });
  const push = ((u?.notificationPrefs as any)?.push ?? {}) as Record<string, boolean>;
  return NextResponse.json({ kinds: NOTIFICATION_KINDS.map((k) => ({ ...k, push: push[k.kind] !== false })) });
}

/** { push: { [kind]: boolean } } */
export async function PUT(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const push: Record<string, boolean> = {};
  for (const k of NOTIFICATION_KINDS) if (typeof body?.push?.[k.kind] === 'boolean') push[k.kind] = body.push[k.kind];
  await prisma.user.update({ where: { id: session.id }, data: { notificationPrefs: { push } as Prisma.InputJsonValue } });
  return NextResponse.json({ ok: true });
}
