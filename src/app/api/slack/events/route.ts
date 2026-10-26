import { NextResponse, after } from 'next/server';
import { handleMention, slackConfigured, verifySlack } from '@/lib/slackApp';

export const dynamic = 'force-dynamic';

// Slack redelivers events it thinks we missed; remember recent ids (one web instance).
const seen = new Map<string, number>();

/** Slack Events API: URL verification and app_mention. Acks at once, works after the response. */
export async function POST(req: Request) {
  const raw = await req.text();
  const body = JSON.parse(raw || '{}');
  // The URL check when the app is created is signed too; verify it like everything else.
  if (!slackConfigured()) return new Response('slack not configured', { status: 503 });
  if (!verifySlack(raw, req.headers)) return new Response('bad signature', { status: 401 });
  if (body.type === 'url_verification') return NextResponse.json({ challenge: body.challenge });

  if (body.type === 'event_callback' && body.event?.type === 'app_mention' && !body.event.bot_id) {
    const id = body.event_id as string;
    const now = Date.now();
    for (const [k, t] of seen) if (now - t > 3_600_000) seen.delete(k);
    if (!seen.has(id)) {
      seen.set(id, now);
      after(async () => {
        try { await handleMention(body.event); } catch (e) { console.error('[slack] mention failed', e); }
      });
    }
  }
  return new Response(null, { status: 200 });
}
