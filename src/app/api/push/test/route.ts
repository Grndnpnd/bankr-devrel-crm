import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { pushConfigured, sendPush } from '@/lib/notify';

export const dynamic = 'force-dynamic';

/** Send a test notification to every device I've turned push on for. */
export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!pushConfigured()) return NextResponse.json({ error: 'push is not set up on the server (VAPID keys missing)' }, { status: 503 });
  const subs = await prisma.pushSubscription.findMany({ where: { userId: session.id } });
  const payload = JSON.stringify({ title: 'Notifications are on', body: 'This device will get task and team alerts.', url: '/tasks', tag: 'test' });
  const results = await Promise.all(subs.map((s) => sendPush(s, payload)));
  return NextResponse.json({ devices: subs.length, delivered: results.filter(Boolean).length });
}
