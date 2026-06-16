import { NextResponse } from "next/server";
import crypto from "crypto";
import { runDueJobs } from "@/lib/scheduler";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // not configured → refuse (fail closed)
  const url = new URL(req.url);
  const provided =
    url.searchParams.get("secret") ||
    (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function handle(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const summary = await runDueJobs();
  return NextResponse.json({ ok: true, ...summary, at: new Date().toISOString() });
}

// Support both GET (simple pingers) and POST.
export async function GET(req: Request) { return handle(req); }
export async function POST(req: Request) { return handle(req); }
