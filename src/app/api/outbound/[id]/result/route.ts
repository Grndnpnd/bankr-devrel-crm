import { NextResponse } from "next/server";
import crypto from "crypto";
import { recordOutboundResult } from "@/lib/outbound";

export const dynamic = "force-dynamic";

/**
 * The teammate's bot reports delivery for one outbound message.
 *   POST /api/outbound/{id}/result
 *   Authorization: Bearer <INGEST_API_KEY>
 *   { "status": "sent" | "failed", "error"?: "..." }
 * On "sent" the CRM auto-tracks the outreach (NEW -> CONTACTED + logs an activity).
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

export async function POST(req: Request, { params }: { params: { id: string } }) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid JSON body" }, { status: 400 }); }
  const status = body?.status === "sent" ? "sent" : body?.status === "failed" ? "failed" : null;
  if (!status) return NextResponse.json({ error: "status must be 'sent' or 'failed'" }, { status: 400 });
  try {
    const res = await recordOutboundResult(params.id, status, typeof body?.error === "string" ? body.error : null);
    if (!res.ok) return NextResponse.json({ error: res.error ?? "failed" }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "failed to record result" }, { status: 500 });
  }
}
