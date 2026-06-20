import crypto from "crypto";
import { prisma } from "@/lib/prisma";

/**
 * Maps Plain webhook payloads into our SupportThread / SupportCustomer / SupportMessage
 * tables. Every Plain event embeds the full `thread`, so each event is a complete upsert
 * of the thread's current state; message events additionally append a SupportMessage.
 *
 * Dedup (ported from Gamal's hard-won lessons): Plain retries with the SAME event id, and
 * its AI agent double-fires logically-identical messages ~6s apart with DIFFERENT event
 * ids. So we guard on BOTH the event id and a content hash within a short window.
 */

const CONTENT_DEDUP_WINDOW_MS = 60_000;

// ── Verification ──────────────────────────────────────────────────────────────
// Plain signs the raw body with HMAC-SHA256 and sends it in `plain-request-signature`.
// Verify against the RAW body before parsing. (Inline impl — no SDK dep.)
export function verifyPlainSignature(rawBody: string, signatureHeader: string | null, secret: string): boolean {
  if (!signatureHeader || !secret) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  // Header may be just the hex, or "hexsig" — normalize by taking the last hex token.
  const provided = signatureHeader.trim().split(/[\s,=]/).filter(Boolean).pop() || "";
  if (provided.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
  } catch {
    return false;
  }
}

// ── Helpers to read Plain's actor/assignee/label shapes ───────────────────────
function assigneeFields(assignee: any): { assigneeId: string | null; assigneeType: string | null; assigneeName: string | null } {
  if (!assignee || typeof assignee !== "object") return { assigneeId: null, assigneeType: null, assigneeName: null };
  // user shape has id + fullName/publicName; machineUser likewise; bare {id} also possible.
  if (assignee.userId) return { assigneeId: assignee.userId, assigneeType: "user", assigneeName: null };
  if (assignee.machineUserId) return { assigneeId: assignee.machineUserId, assigneeType: "machineUser", assigneeName: null };
  if (assignee.id) {
    const type = "publicName" in assignee || "fullName" in assignee ? (assignee.description !== undefined ? "machineUser" : "user") : "user";
    return { assigneeId: assignee.id, assigneeType: type, assigneeName: assignee.publicName ?? assignee.fullName ?? null };
  }
  return { assigneeId: null, assigneeType: null, assigneeName: null };
}

function labelNames(labels: any): string[] {
  if (!Array.isArray(labels)) return [];
  return labels.map((l: any) => l?.labelType?.name).filter((n: any): n is string => typeof n === "string");
}

function iso(d: any): Date | null {
  if (!d) return null;
  const v = typeof d === "object" && d.iso8601 ? d.iso8601 : d;
  const dt = new Date(v);
  return isNaN(dt.getTime()) ? null : dt;
}

// channel inference from the message-info or event type
function channelFromThread(thread: any): string | null {
  return (
    thread?.lastInboundMessageInfo?.messageSource ||
    thread?.firstInboundMessageInfo?.messageSource ||
    thread?.lastOutboundMessageInfo?.messageSource ||
    null
  );
}

// ── Customer upsert ───────────────────────────────────────────────────────────
async function upsertCustomer(customer: any): Promise<string | null> {
  if (!customer?.id) return null;
  const email = customer.email?.email ?? (typeof customer.email === "string" ? customer.email : null);
  await prisma.supportCustomer.upsert({
    where: { id: customer.id },
    create: {
      id: customer.id,
      email,
      externalId: customer.externalId ?? null,
      fullName: customer.fullName ?? null,
      shortName: customer.shortName ?? null,
    },
    update: {
      email,
      externalId: customer.externalId ?? null,
      fullName: customer.fullName ?? null,
      shortName: customer.shortName ?? null,
    },
  });
  return customer.id;
}

// ── Thread upsert (the heart of it) ───────────────────────────────────────────
export async function upsertThreadFromPayload(thread: any): Promise<void> {
  if (!thread?.id) return;
  const customerId = await upsertCustomer(thread.customer);
  const { assigneeId, assigneeType, assigneeName } = assigneeFields(thread.assignee);
  const statusDetailType = thread.statusDetail?.type ?? null;

  const data = {
    externalId: thread.externalId ?? null,
    title: thread.title ?? null,
    previewText: thread.previewText ?? null,
    status: thread.status ?? "UNKNOWN_THREAD_STATUS",
    statusDetail: statusDetailType,
    priority: typeof thread.priority === "number" ? thread.priority : 2,
    assigneeId,
    assigneeType,
    assigneeName,
    labelNames: labelNames(thread.labels),
    channel: channelFromThread(thread),
    firstInboundAt: iso(thread.firstInboundMessageInfo?.timestamp),
    firstOutboundAt: iso(thread.firstOutboundMessageInfo?.timestamp),
    lastInboundAt: iso(thread.lastInboundMessageInfo?.timestamp),
    lastOutboundAt: iso(thread.lastOutboundMessageInfo?.timestamp),
    statusChangedAt: iso(thread.statusChangedAt),
    plainCreatedAt: iso(thread.createdAt),
    customerId,
  };

  await prisma.supportThread.upsert({
    where: { id: thread.id },
    create: { id: thread.id, ...data },
    update: data,
  });
}

// ── Message append (S2 stores bodies; S1 wires the path) ──────────────────────
const INBOUND_EVENTS = new Set(["thread.email_received", "thread.chat_received", "thread.slack_message_received", "thread.discord_message_received", "thread.ms_teams_message_received"]);
const OUTBOUND_EVENTS = new Set(["thread.email_sent", "thread.chat_sent", "thread.slack_message_sent", "thread.discord_message_sent", "thread.ms_teams_message_sent"]);

export async function appendMessageFromPayload(eventType: string, payload: any): Promise<void> {
  const thread = payload?.thread;
  if (!thread?.id) return;

  let direction: string | null = null;
  if (INBOUND_EVENTS.has(eventType)) direction = "inbound";
  else if (OUTBOUND_EVENTS.has(eventType)) direction = "outbound";
  else if (eventType === "thread.note_created") direction = "note";
  if (!direction) return;

  // The message body lives under different keys depending on channel.
  const msg = payload.email || payload.chat || payload.slackMessage || payload.discordMessage || payload.msTeamsMessage || payload.note;
  if (!msg) return;

  const timelineEntryId = msg.timelineEntryId || msg.id;
  if (!timelineEntryId) return;

  const body =
    msg.markdownContent ?? msg.textContent ?? msg.text ?? msg.resolvedText ?? msg.textContent ?? msg.markdown ?? null;
  const channel = channelFromThread(thread) || (payload.email ? "EMAIL" : payload.slackMessage ? "SLACK" : payload.chat ? "CHAT" : payload.discordMessage ? "DISCORD" : null);
  const createdBy = msg.createdBy;
  const authorType = createdBy?.actorType ?? null;
  const authorId = createdBy?.userId ?? createdBy?.machineUserId ?? createdBy?.customerId ?? null;
  const occurredAt = iso(msg.sentAt) || iso(msg.receivedAt) || iso(msg.createdAt) || new Date();

  await prisma.supportMessage.upsert({
    where: { id: timelineEntryId },
    create: { id: timelineEntryId, threadId: thread.id, direction, channel, authorType, authorId, body, occurredAt },
    update: { body, direction, channel, authorType, authorId, occurredAt },
  });
}

// ── Dedup ─────────────────────────────────────────────────────────────────────
/**
 * Dedup. Two modes:
 *  - record=false: read-only check. Returns true if this event was already seen (by id,
 *    or by content hash within the window).
 *  - record=true: marks the event as processed (call only AFTER successful handling, so a
 *    failed handler lets Plain's retry reprocess cleanly).
 */
export async function isDuplicateEvent(eventId: string, contentHash: string | null, eventType: string, record: boolean): Promise<boolean> {
  if (record) {
    await prisma.supportWebhookEvent.upsert({
      where: { id: eventId },
      create: { id: eventId, contentHash, eventType },
      update: { contentHash, eventType },
    }).catch(() => {});
    return false;
  }

  // 1) event-id dedup (Plain retries reuse the id)
  try {
    const existing = await prisma.supportWebhookEvent.findUnique({ where: { id: eventId } });
    if (existing) return true;
  } catch { /* fall through */ }

  // 2) content-hash dedup within a short window (AI agent double-fires with new ids)
  if (contentHash) {
    const since = new Date(Date.now() - CONTENT_DEDUP_WINDOW_MS);
    const recent = await prisma.supportWebhookEvent.findFirst({
      where: { contentHash, receivedAt: { gte: since } },
    });
    if (recent) return true;
  }

  return false;
}

export function contentHashFor(payload: any): string | null {
  const thread = payload?.thread;
  const msg = payload?.email || payload?.chat || payload?.slackMessage || payload?.discordMessage || payload?.msTeamsMessage || payload?.note;
  const text = msg?.markdownContent ?? msg?.textContent ?? msg?.text ?? msg?.markdown ?? null;
  if (!thread?.id || !text) return null;
  return crypto.createHash("sha256").update(`${thread.id}:${text}`).digest("hex");
}
