import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { logOutreach } from "@/lib/outreach";

export const dynamic = "force-dynamic";

/**
 * Bearer-authed endpoint for the teammate's Telegram bot to log a typed outreach
 * entry on a project (e.g. "Telegram Group Chat" when a project posts in a group).
 *   POST /api/outreach
 *   Authorization: Bearer <INGEST_API_KEY>
 *   { "project": "Solvr", "type": "Telegram Group Chat", "detail"?: "...", "telegramTarget"?: "..." }
 * Resolves the project by name (or by telegramTarget if provided). Custom types are
 * created + persisted if new (same as everywhere else).
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

export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid JSON body" }, { status: 400 }); }

  const type = typeof body?.type === "string" ? body.type.trim() : "";
  if (!type) return NextResponse.json({ error: "type required" }, { status: 400 });

  // Resolve the project: by telegramTarget first (most reliable for a bot), then name.
  let submissionId: string | null = null;
  const tgt = typeof body?.telegramTarget === "string" ? body.telegramTarget.trim() : "";
  if (tgt) {
    const byTarget = await prisma.submission.findFirst({ where: { telegramTarget: tgt }, select: { id: true } });
    if (byTarget) submissionId = byTarget.id;
  }
  if (!submissionId && typeof body?.project === "string" && body.project.trim()) {
    const byName = await prisma.submission.findFirst({
      where: { project: { equals: body.project.trim(), mode: "insensitive" } },
      select: { id: true },
    });
    if (byName) submissionId = byName.id;
  }
  if (!submissionId) return NextResponse.json({ error: "project not found (by telegramTarget or name)" }, { status: 404 });

  const out = await logOutreach({
    submissionId,
    type,
    detail: typeof body?.detail === "string" ? body.detail : null,
    createdBy: "telegram",
  });
  if (!out.ok) return NextResponse.json({ error: out.error }, { status: 400 });
  return NextResponse.json({ ok: true, type: out.type });
}
