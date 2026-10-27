import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { can } from '@/lib/access';
import { prisma } from '@/lib/prisma';
import { CARD_KEYS, PLAIN_PERMISSIONS, plainChatConfigured, plainConfigured, plainHmacSecret, plainWorkspace } from '@/lib/plain';
import { slaSummary } from '@/lib/plainSupport';

export const dynamic = 'force-dynamic';

const APP_URL = () => (process.env.APP_URL || '').replace(/\/$/, '');

/** What's connected, the URLs to paste into Plain, the routing rules and SLA numbers. */
export async function GET() {
  const session = await getSession();
  if (!session || !can(session.role, 'support.view')) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const [routes, teams, sla, pending] = await Promise.all([
    prisma.plainRoute.findMany({ orderBy: [{ position: 'asc' }, { createdAt: 'asc' }], include: { team: { select: { id: true, name: true, color: true } } } }),
    prisma.team.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, color: true } }),
    slaSummary(30),
    prisma.testerReport.count({ where: { plainThreadId: null, program: { plainEnabled: true }, createdAt: { gte: new Date(Date.now() - 14 * 86_400_000) } } }),
  ]);
  return NextResponse.json({
    configured: { apiKey: plainConfigured(), signing: !!plainHmacSecret(), chat: plainChatConfigured(), workspaceId: !!process.env.PLAIN_WORKSPACE_ID },
    urls: { webhook: `${APP_URL()}/api/plain-webhook`, cards: `${APP_URL()}/api/plain/cards` },
    cardKeys: CARD_KEYS, permissions: PLAIN_PERMISSIONS, webhookVersion: '2026-10-06',
    routes, teams, sla, betaReportsWaiting: plainConfigured() ? pending : 0,
    canManage: can(session.role, 'support.manage'),
  });
}

/** { action: 'test' } → checks the API key against Plain. */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session || !can(session.role, 'support.manage')) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  if (b?.action !== 'test') return NextResponse.json({ error: 'unknown action' }, { status: 400 });
  try {
    const ws = await plainWorkspace();
    return NextResponse.json({ ok: true, workspace: ws });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'failed' });
  }
}
