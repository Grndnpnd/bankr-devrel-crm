import { prisma } from "@/lib/prisma";

/**
 * Outbound message queue. The CRM writes pending messages; a teammate's Telegram
 * bot polls + delivers + reports back. See prisma OutboundMessage model.
 */

const CLAIM_TIMEOUT_MS = 5 * 60_000; // claimed-but-unreported rows revert to pending after 5 min

export interface EnqueueArgs {
  submissionId: string;
  body: string;
  target?: string | null;   // explicit target; falls back to the submission's telegramTarget
  createdBy?: string;
}

/** Queue an outbound message for a project. Returns the row, or an error reason. */
export async function enqueueOutbound(args: EnqueueArgs): Promise<
  { ok: true; id: string; target: string } | { ok: false; error: string }
> {
  const sub = await prisma.submission.findUnique({
    where: { id: args.submissionId },
    select: { id: true, project: true, telegramTarget: true },
  });
  if (!sub) return { ok: false, error: "submission not found" };

  const target = (args.target || sub.telegramTarget || "").trim();
  if (!target) {
    return { ok: false, error: `no Telegram target on "${sub.project}" — set one on the card first (or capture it via inbound).` };
  }
  const body = (args.body || "").trim();
  if (!body) return { ok: false, error: "empty message body" };

  const row = await prisma.outboundMessage.create({
    data: {
      submissionId: sub.id,
      channel: "telegram",
      target,
      body,
      status: "pending",
      createdBy: args.createdBy ?? "agent",
    },
  });
  return { ok: true, id: row.id, target };
}

/**
 * Claim up to `limit` pending messages for delivery. Atomically marks them claimed
 * so a second poll won't re-serve them (no double-send). Also reverts any stale
 * claims (claimed > CLAIM_TIMEOUT_MS ago with no result) back to pending first, so a
 * crashed bot doesn't strand messages.
 */
export async function claimPendingOutbound(limit = 20): Promise<
  { id: string; submissionId: string; channel: string; target: string; body: string; createdAt: Date }[]
> {
  // 1) Revert stale claims.
  const staleBefore = new Date(Date.now() - CLAIM_TIMEOUT_MS);
  await prisma.outboundMessage.updateMany({
    where: { status: "claimed", claimedAt: { lt: staleBefore } },
    data: { status: "pending", claimedAt: null },
  });

  // 2) Grab pending ids (oldest first), then claim them.
  const pending = await prisma.outboundMessage.findMany({
    where: { status: "pending" },
    orderBy: { createdAt: "asc" },
    take: Math.min(Math.max(limit, 1), 50),
    select: { id: true },
  });
  if (!pending.length) return [];

  const ids = pending.map((p: { id: string }) => p.id);
  await prisma.outboundMessage.updateMany({
    where: { id: { in: ids }, status: "pending" },
    data: { status: "claimed", claimedAt: new Date() },
  });

  const claimed = await prisma.outboundMessage.findMany({
    where: { id: { in: ids } },
    select: { id: true, submissionId: true, channel: true, target: true, body: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  return claimed;
}

/**
 * Record a delivery result reported by the bot. On `sent`, auto-track the outreach:
 * flip the project NEW → CONTACTED (never downgrades a further-along project) and log
 * an outreach activity. Idempotent-ish: a result on an already-finalized row is ignored.
 */
export async function recordOutboundResult(
  id: string,
  result: "sent" | "failed",
  error?: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const row = await prisma.outboundMessage.findUnique({ where: { id } });
  if (!row) return { ok: false, error: "message not found" };
  if (row.status === "sent" || row.status === "failed") {
    return { ok: true }; // already finalized — ignore duplicate callback
  }

  if (result === "failed") {
    await prisma.outboundMessage.update({
      where: { id },
      data: { status: "failed", error: error?.slice(0, 500) ?? "delivery failed" },
    });
    return { ok: true };
  }

  // result === 'sent' → mark sent + auto-track
  await prisma.outboundMessage.update({
    where: { id },
    data: { status: "sent", sentAt: new Date(), error: null },
  });

  try {
    const sub = await prisma.submission.findUnique({
      where: { id: row.submissionId },
      select: { id: true, stage: true },
    });
    if (sub) {
      // Only advance from NEW → CONTACTED; never move a further-along project backward.
      if (sub.stage === "NEW") {
        await prisma.submission.update({ where: { id: sub.id }, data: { stage: "CONTACTED" } });
      }
      // Log the outreach. OutreachActivity needs a real User author; if the queuer
      // wasn't a mapped user (e.g. 'agent'), fall back to any admin so the log isn't lost.
      let authorId: string | null = null;
      if (row.createdBy && row.createdBy.includes("@")) {
        const u = await prisma.user.findUnique({ where: { email: row.createdBy }, select: { id: true } });
        authorId = u?.id ?? null;
      }
      if (!authorId) {
        const admin = await prisma.user.findFirst({ where: { role: "ADMIN", active: true }, select: { id: true } });
        authorId = admin?.id ?? null;
      }
      if (authorId) {
        await prisma.outreachActivity.create({
          data: {
            submissionId: row.submissionId,
            authorId,
            kind: "outreach",
            body: `Telegram message sent: ${row.body.slice(0, 280)}`,
          },
        });
      }
    }
  } catch {
    // Auto-track is best-effort; the message is already marked sent.
  }
  return { ok: true };
}
