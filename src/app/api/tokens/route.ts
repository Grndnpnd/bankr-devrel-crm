import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { createApiToken } from '@/lib/apiTokens';

export const dynamic = 'force-dynamic';

/** The signed-in user's tokens (never the secrets). */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const tokens = await prisma.apiToken.findMany({
    where: { userId: session.id, revokedAt: null },
    orderBy: { createdAt: 'desc' },
    select: { id: true, name: true, prefix: true, lastUsedAt: true, createdAt: true },
  });
  return NextResponse.json({ tokens });
}

/** Create a token. The full token is returned once. */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const count = await prisma.apiToken.count({ where: { userId: session.id, revokedAt: null } });
  if (count >= 20) return NextResponse.json({ error: 'too many tokens — revoke one first' }, { status: 400 });
  const created = await createApiToken(session.id, String(body?.name ?? 'Claude'));
  return NextResponse.json(created);
}
