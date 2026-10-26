import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { can } from '@/lib/access';
import { slackConfigured, slackManifest } from '@/lib/slackApp';

export const dynamic = 'force-dynamic';

/** Is the Slack app connected, plus the manifest to create it with (URLs filled in for this deployment). */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const appUrl = (process.env.APP_URL || new URL(req.url).origin).replace(/\/$/, '');
  return NextResponse.json({
    configured: slackConfigured(),
    canSetUp: can(session.role, 'users.manage'),
    manifest: slackManifest(appUrl),
  });
}
