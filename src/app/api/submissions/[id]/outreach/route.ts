import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/access";
import { logOutreach, listOutreachTypes } from "@/lib/outreach";

export const dynamic = "force-dynamic";

/** List a project's outreach history, most-recent first. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || !can(session.role, "submissions.view")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const [rows, types] = await Promise.all([
    prisma.outreachLog.findMany({ where: { submissionId: params.id }, orderBy: { occurredAt: "desc" } }),
    listOutreachTypes(),
  ]);
  return NextResponse.json({ entries: rows, types });
}

/** Add an outreach entry. Body: { type, detail?, occurredAt? } */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || !can(session.role, "submissions.edit")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const type = body?.type ? String(body.type) : "";
  if (!type) return NextResponse.json({ error: "type required" }, { status: 400 });
  const occurredAt = body?.occurredAt ? new Date(body.occurredAt) : undefined;
  const out = await logOutreach({
    submissionId: params.id,
    type,
    detail: typeof body?.detail === "string" ? body.detail : null,
    occurredAt: occurredAt && !isNaN(occurredAt.getTime()) ? occurredAt : undefined,
    createdBy: session.email,
  });
  if (!out.ok) return NextResponse.json({ error: out.error }, { status: 400 });
  return NextResponse.json({ ok: true, id: out.id, type: out.type });
}
