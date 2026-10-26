import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { pushConfigured, vapidPublicKey } from '@/lib/notify';

export const dynamic = 'force-dynamic';

/** The VAPID public key the browser subscribes with, and how many devices I have. */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const devices = await prisma.pushSubscription.count({ where: { userId: session.id } });
  return NextResponse.json({ configured: pushConfigured(), publicKey: vapidPublicKey(), devices });
}

/** Save this browser's subscription: { subscription: PushSubscriptionJSON } */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const s = body?.subscription;
  const endpoint = typeof s?.endpoint === 'string' ? s.endpoint : '';
  if (!/^https:\/\//.test(endpoint) || !s?.keys?.p256dh || !s?.keys?.auth) {
    return NextResponse.json({ error: 'not a push subscription' }, { status: 400 });
  }
  const userAgent = (req.headers.get('user-agent') || '').slice(0, 200);
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    update: { userId: session.id, p256dh: s.keys.p256dh, auth: s.keys.auth, userAgent },
    create: { userId: session.id, endpoint, p256dh: s.keys.p256dh, auth: s.keys.auth, userAgent },
  });
  return NextResponse.json({ ok: true });
}

/** Forget this browser: { endpoint } */
export async function DELETE(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  await prisma.pushSubscription.deleteMany({ where: { userId: session.id, endpoint: String(body?.endpoint ?? '') } });
  return NextResponse.json({ ok: true });
}
