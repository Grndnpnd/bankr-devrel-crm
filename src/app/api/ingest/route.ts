import { NextResponse } from "next/server";
import crypto from "crypto";
import { ingestText } from "@/lib/ingest";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * External ingest endpoint. Lets a separate service (e.g. the Telegram bot,
 * owned by another teammate in its own repo) feed unstructured project text
 * into the same two-stage ingest pipeline the agent + Slack use.
 *
 * Auth: shared bearer token (INGEST_API_KEY), constant-time compared, HTTPS,
 * header-only (never a query param, to avoid leaking in logs). Fails closed.
 *
 *   POST /api/ingest
 *   Authorization: Bearer <INGEST_API_KEY>
 *   Content-Type: application/json
 *   { "text": "<raw unstructured project info>", "source"?: "TELEGRAM", "submittedBy"?: "tg:@user" }
 *
 * Returns the full IngestOutcome so the caller can reply to its user.
 */

function authorized(req: Request): boolean {
  const secret = process.env.INGEST_API_KEY;
  if (!secret) return false; // not configured → refuse
  const provided = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// TEMP DIAGNOSTIC — reveals whether the env var is present + length info, WITHOUT
// leaking the secret itself. Remove after debugging.
//   GET /api/ingest  with header  Authorization: Bearer <whatever you're testing>
export async function GET(req: Request) {
  const secret = process.env.INGEST_API_KEY;
  const provided = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  return NextResponse.json({
    envKeyPresent: !!secret,
    envKeyLength: secret ? secret.length : 0,
    envKeyLastChar: secret ? secret.slice(-1) : null,
    providedLength: provided.length,
    providedLastChar: provided ? provided.slice(-1) : null,
    lengthsMatch: !!secret && secret.length === provided.length,
    exactMatch: !!secret && secret === provided,
  });
}

const ALLOWED_SOURCES = ["TELEGRAM", "SLACK", "AGENT"] as const;
type AllowedSource = (typeof ALLOWED_SOURCES)[number];

export async function POST(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) {
    return NextResponse.json({ error: "missing 'text'" }, { status: 400 });
  }
  if (text.length > 8000) {
    return NextResponse.json({ error: "'text' too long (max 8000 chars)" }, { status: 400 });
  }

  const source: AllowedSource = ALLOWED_SOURCES.includes(body?.source) ? body.source : "TELEGRAM";
  const submittedBy = typeof body?.submittedBy === "string" ? body.submittedBy.slice(0, 120) : "telegram";

  try {
    const outcome = await ingestText(text, source, submittedBy);
    // outcome.status ∈ created | updated | queued | needs_clarification | error
    const httpStatus = outcome.status === "error" ? 502 : 200;
    return NextResponse.json(outcome, { status: httpStatus });
  } catch (e: any) {
    console.error("[ingest-api] failed:", e?.message ?? e);
    return NextResponse.json({ status: "error", message: e?.message ?? "ingest failed" }, { status: 500 });
  }
}
