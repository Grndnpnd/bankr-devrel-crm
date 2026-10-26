import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const maxDuration = 900;

/**
 * Live notifications over Server-Sent Events. Checks for new rows every 4 s (works no
 * matter which service created them — web, cron, webhooks) and sends a heartbeat every
 * 25 s, since Railway closes HTTP connections idle for 5 minutes. Railway also caps a
 * connection at 15 minutes; EventSource reconnects on its own and resumes from Last-Event-ID.
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return new Response('unauthorized', { status: 401 });
  const userId = session.id;
  const lastId = req.headers.get('last-event-id');
  let since = new Date();
  if (lastId) {
    const last = await prisma.notification.findFirst({ where: { id: lastId, userId }, select: { createdAt: true } });
    if (last) since = last.createdAt;
  }

  const enc = new TextEncoder();
  let closed = false;
  const stream = new ReadableStream({
    start(controller) {
      const send = (s: string) => { if (!closed) controller.enqueue(enc.encode(s)); };
      send('retry: 5000\n: connected\n\n');
      let beat = 0;
      const tick = async () => {
        if (closed) return;
        try {
          const rows = await prisma.notification.findMany({
            where: { userId, createdAt: { gt: since } }, orderBy: { createdAt: 'asc' }, take: 50,
          });
          for (const n of rows) {
            send(`id: ${n.id}\nevent: notification\ndata: ${JSON.stringify(n)}\n\n`);
            since = n.createdAt;
          }
          if (++beat % 6 === 0) send(': ping\n\n');
        } catch { /* transient DB error: try again next tick */ }
        if (!closed) setTimeout(tick, 4000);
      };
      setTimeout(tick, 1000);
      req.signal.addEventListener('abort', () => { closed = true; try { controller.close(); } catch {} });
    },
    cancel() { closed = true; },
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
