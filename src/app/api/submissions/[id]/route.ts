import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { serialize, INCLUDE } from "@/lib/serialize";
import { LABEL_TO_STAGE, STAGE_TO_LABEL } from "@/lib/labels";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const row = await prisma.submission.findUnique({ where: { id: params.id }, include: INCLUDE });
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(serialize(row));
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || session.role === "VIEWER") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  let stageChangedTo: string | null = null;

  if (typeof body.stage === "string") {
    // accept either a label ("In Convo") or an enum ("IN_CONVO")
    const enumStage = LABEL_TO_STAGE[body.stage] ?? (STAGE_TO_LABEL[body.stage] ? body.stage : null);
    if (!enumStage) return NextResponse.json({ error: "invalid stage" }, { status: 400 });
    data.stage = enumStage;
    stageChangedTo = STAGE_TO_LABEL[enumStage];
  }

  if ("owner" in body) {
    data.owner = body.owner ? String(body.owner) : null;
  }

  // Editable content fields (admin/devrel). Triggers a rescore.
  const EDITABLE = [
    "project", "projectX", "website", "location", "oneLiner", "problem", "solution",
    "traction", "funding", "plan", "whyBankr", "accomplishments", "links", "notesField",
  ] as const;
  let contentChanged = false;
  for (const f of EDITABLE) {
    if (f in body) {
      const v = body[f] === null ? null : String(body[f]).trim();
      data[f] = v || null;
      contentChanged = true;
    }
  }
  if ("needsHelp" in body && Array.isArray(body.needsHelp)) {
    data.needsHelp = body.needsHelp.map((t: unknown) => String(t).trim()).filter(Boolean);
    contentChanged = true;
  }

  if (stageChangedTo) {
    await prisma.outreachActivity.create({
      data: {
        submissionId: params.id,
        authorId: session.id,
        body: `Moved to ${stageChangedTo}`,
        kind: "stage_change",
      },
    });
  }

  let row = await prisma.submission.update({
    where: { id: params.id },
    data: data as unknown as Prisma.SubmissionUpdateInput,
    include: INCLUDE,
  });

  if (contentChanged) {
    const { rescoreSubmission } = await import("@/lib/enrich");
    await rescoreSubmission(params.id);
    row = (await prisma.submission.findUnique({ where: { id: params.id }, include: INCLUDE }))!;
  }
  return NextResponse.json(serialize(row));
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (session?.role !== "ADMIN") {
    return NextResponse.json({ error: "admin only" }, { status: 403 });
  }
  try {
    // TokenMatch + OutreachActivity cascade automatically (onDelete: Cascade).
    await prisma.submission.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "delete failed" }, { status: 400 });
  }
}
