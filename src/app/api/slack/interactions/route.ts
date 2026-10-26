import { NextResponse, after } from 'next/server';
import { openAddTaskModal, slackConfigured, submitAddTaskModal, verifySlack } from '@/lib/slackApp';

export const dynamic = 'force-dynamic';

/**
 * Slack interactivity: the "Add to tasks" message shortcut and its modal. Slack wants an
 * answer within 3 seconds; slower follow-ups (the confirmation) run after the response.
 */
export async function POST(req: Request) {
  if (!slackConfigured()) return new Response('slack not configured', { status: 503 });
  const raw = await req.text();
  if (!verifySlack(raw, req.headers)) return new Response('bad signature', { status: 401 });
  const payload = JSON.parse(new URLSearchParams(raw).get('payload') || '{}');

  if (payload.type === 'message_action' && payload.callback_id === 'add_to_tasks') {
    await openAddTaskModal(payload);
    return new Response(null, { status: 200 });
  }
  if (payload.type === 'view_submission' && payload.view?.callback_id === 'add_task') {
    try {
      const { response, after: later } = await submitAddTaskModal(payload);
      if (later) after(later);
      return NextResponse.json(response);
    } catch (e: any) {
      console.error('[slack] add task failed', e);
      return NextResponse.json({ response_action: 'errors', errors: { title: `Couldn’t add it: ${e?.message ?? 'error'}` } });
    }
  }
  return new Response(null, { status: 200 });
}
