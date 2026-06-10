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

  const row = await prisma.submission.update({
    where: { id: params.id },
    data: data as unknown as Prisma.SubmissionUpdateInput,
    include: INCLUDE,
  });
  return NextResponse.json(serialize(row));
}
