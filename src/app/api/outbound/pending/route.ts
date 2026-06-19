import { NextResponse } from "next/server";
import crypto from "crypto";
import { claimPendingOutbound } from "@/lib/outbound";

export const dynamic = "force-dynamic";

/**
 * Polled by the teammate's Telegram bot to fetch messages to send.
 * Claims the returned rows (claim-with-timeout) so a repeat poll won't double-serve.
 *   GET /api/outbound/pending?limit=20
 *   Authorization: Bearer <INGEST_API_KEY>
 * Returns: { messages: [{ id, submissionId, channel, target, body, createdAt }] }
 * The bot must report delivery for each via POST /api/outbound/{id}/result.
 */
function authorized(req: Request): boolean {
  const secret = process.env.INGEST_API_KEY;
  if (!secret) return false;
  const provided = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "20", 10) || 20, 1), 50);
  try {
    const messages = await claimPendingOutbound(limit);
    return NextResponse.json({ messages });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "failed to fetch pending" }, { status: 500 });
  }
}
