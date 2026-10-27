import { NextResponse } from "next/server";
import { upsertThreadFromPayload, appendMessageFromPayload, isDuplicateEvent, contentHashFor } from "@/lib/plainSync";
import { plainHmacSecret, verifyPlainRequest } from "@/lib/plain";
import { onSlaTransition, onThreadCreated } from "@/lib/plainSupport";
import { mirrorPlainMessage } from "@/lib/plainBeta";

export const dynamic = "force-dynamic";

/**
 * Plain → CRM. Plain posts every event of the webhook target here (pin the target to version
 * 2026-10-06 or later). We verify Plain-Request-Signature over the RAW body, dedup (event id +
 * content hash), keep the support tables current, then:
 *   - SLA transitions → notify the routed teams; a breach opens a task
 *   - new threads    → notify teams whose route asks for every new thread
 *   - messages on beta-report threads → mirrored into the report's conversation
 * A 500 makes Plain retry (for ~5 days); the event is only recorded as seen after success.
 *
 * Public in src/proxy.ts; the signature is the auth. Without PLAIN_HMAC_SECRET it accepts
 * unsigned requests only outside production.
 */

const MESSAGE_EVENTS = new Set([
  "thread.email_received", "thread.email_sent",
  "thread.chat_received", "thread.chat_sent",
  "thread.slack_message_received", "thread.slack_message_sent",
  "thread.discord_message_received", "thread.discord_message_sent",
  "thread.ms_teams_message_received", "thread.ms_teams_message_sent",
  "thread.note_created",
]);
const BETA_MIRROR = new Set(["thread.email_received", "thread.email_sent", "thread.chat_received", "thread.chat_sent"]);

export async function POST(req: Request) {
  const rawBody = await req.text();
  const secret = plainHmacSecret();
  if (secret) {
    if (!verifyPlainRequest(rawBody, req.headers.get("plain-request-signature"), secret)) {
      return NextResponse.json({ error: "invalid signature" }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    console.error("[plain-webhook] PLAIN_HMAC_SECRET not set — refusing unsigned webhooks");
    return NextResponse.json({ error: "webhook signing not configured" }, { status: 503 });
  }

  let event: any;
  try { event = JSON.parse(rawBody); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const eventId: string = event?.id;
  const eventType: string = event?.type || req.headers.get("plain-event-type") || event?.payload?.eventType || "";
  const payload = event?.payload;
  if (!eventId || !payload) return NextResponse.json({ ok: true, skipped: "missing id/payload" });

  try {
    const hash = contentHashFor(payload);
    if (await isDuplicateEvent(eventId, hash, eventType, false)) return NextResponse.json({ ok: true, deduped: true });

    if (payload.thread) await upsertThreadFromPayload(payload.thread, eventType);
    if (MESSAGE_EVENTS.has(eventType)) await appendMessageFromPayload(eventType, payload);

    const ws = event.workspaceId ?? req.headers.get("plain-workspace-id");
    if (eventType === "thread.service_level_agreement_status_transitioned") await onSlaTransition(payload, ws);
    else if (eventType === "thread.thread_created") await onThreadCreated(payload.thread, ws);
    if (BETA_MIRROR.has(eventType)) await mirrorPlainMessage(eventType, payload);

    await isDuplicateEvent(eventId, hash, eventType, true);
    return NextResponse.json({ ok: true, eventType });
  } catch (e: any) {
    console.error("[plain-webhook] handler error:", e?.message ?? e, "event:", eventType);
    return NextResponse.json({ ok: false, error: "handler error" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, service: "plain-webhook" });
}
