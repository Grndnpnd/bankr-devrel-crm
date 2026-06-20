import { NextResponse } from "next/server";
import {
  verifyPlainSignature,
  upsertThreadFromPayload,
  appendMessageFromPayload,
  isDuplicateEvent,
  contentHashFor,
} from "@/lib/plainSync";

export const dynamic = "force-dynamic";

/**
 * Plain → BANKRcrm support ingest. Plain pushes webhooks here (independent subscription,
 * separate from Gamal's Discord relay). We verify the HMAC over the RAW body, dedup
 * (event id + content hash), upsert the thread on every event, and append messages on
 * message events. Ack fast; tolerate unknown event types.
 *
 * Must be in middleware PUBLIC (no session cookie) — auth is the HMAC signature.
 */

const MESSAGE_EVENTS = new Set([
  "thread.email_received", "thread.email_sent",
  "thread.chat_received", "thread.chat_sent",
  "thread.slack_message_received", "thread.slack_message_sent",
  "thread.discord_message_received", "thread.discord_message_sent",
  "thread.ms_teams_message_received", "thread.ms_teams_message_sent",
  "thread.note_created",
]);

// Thread-shaped events whose payload carries a full `thread` we should upsert.
const THREAD_EVENTS = new Set([
  "thread.thread_created",
  "thread.thread_status_transitioned",
  "thread.thread_assignment_transitioned",
  "thread.thread_labels_changed",
  "thread.thread_priority_changed",
  "thread.service_level_agreement_status_transitioned",
  "thread.thread_field_created",
  "thread.thread_field_updated",
  "thread.thread_field_deleted",
]);

export async function POST(req: Request) {
  const secret = process.env.PLAIN_WEBHOOK_SECRET;
  // Read the RAW body for signature verification (must not be parsed first).
  const rawBody = await req.text();
  const sig = req.headers.get("plain-request-signature") || req.headers.get("plain-webhook-signature");

  if (secret) {
    if (!verifyPlainSignature(rawBody, sig, secret)) {
      return NextResponse.json({ error: "invalid signature" }, { status: 401 });
    }
  }
  // If no secret is configured yet, accept (lets you wire the endpoint before the secret
  // lands) — but log it so it's visible. Set PLAIN_WEBHOOK_SECRET to enforce.
  else {
    console.warn("[plain-webhook] PLAIN_WEBHOOK_SECRET not set — accepting unverified payload");
  }

  let event: any;
  try { event = JSON.parse(rawBody); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const eventId: string = event?.id;
  const eventType: string = event?.type || event?.payload?.eventType || "";
  const payload = event?.payload;
  if (!eventId || !payload) {
    // Ack anyway so Plain doesn't retry a malformed delivery forever.
    return NextResponse.json({ ok: true, skipped: "missing id/payload" });
  }

  try {
    // Dedup check (event id + content hash for AI double-fires) — read-only here.
    const hash = contentHashFor(payload);
    if (await isDuplicateEvent(eventId, hash, eventType, false)) {
      return NextResponse.json({ ok: true, deduped: true });
    }

    // Upsert the thread state from any event that carries a thread.
    if (payload.thread) {
      await upsertThreadFromPayload(payload.thread);
    }

    // Append the message on message events.
    if (MESSAGE_EVENTS.has(eventType)) {
      await appendMessageFromPayload(eventType, payload);
    }

    // Record as processed ONLY after success, so a failure (below) lets Plain retry.
    await isDuplicateEvent(eventId, hash, eventType, true);

    return NextResponse.json({ ok: true, eventType });
  } catch (e: any) {
    console.error("[plain-webhook] handler error:", e?.message ?? e, "event:", eventType);
    // 500 → Plain retries. The event was NOT recorded as seen (we record only on success),
    // so the retry will reprocess cleanly.
    return NextResponse.json({ ok: false, error: "handler error" }, { status: 500 });
  }
}

// Plain may send a GET to verify the endpoint exists.
export async function GET() {
  return NextResponse.json({ ok: true, service: "plain-webhook" });
}
