import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/** My latest notifications and how many are unread. ?limit=30 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const limit = Math.min(100, Number(new URL(req.url).searchParams.get('limit')) || 30);
  const [items, unread] = await Promise.all([
    prisma.notification.findMany({ where: { userId: session.id }, orderBy: { createdAt: 'desc' }, take: limit }),
    prisma.notification.count({ where: { userId: session.id, readAt: null } }),
  ]);
  return NextResponse.json({ items, unread });
}

/** Mark read: { ids: [...] } or { all: true } */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const where = body?.all
    ? { userId: session.id, readAt: null }
    : { userId: session.id, readAt: null, id: { in: (Array.isArray(body?.ids) ? body.ids : []).map(String) } };
  const r = await prisma.notification.updateMany({ where, data: { readAt: new Date() } });
  return NextResponse.json({ ok: true, marked: r.count });
}
