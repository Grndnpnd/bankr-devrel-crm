import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { serialize, INCLUDE } from "@/lib/serialize";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || session.role === "VIEWER") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { body, kind } = await req.json().catch(() => ({}));
  if (!body || !String(body).trim()) {
    return NextResponse.json({ error: "body required" }, { status: 400 });
  }
  await prisma.outreachActivity.create({
    data: { submissionId: params.id, authorId: session.id, body: String(body).trim(), kind: kind || "note" },
  });
  const row = await prisma.submission.findUnique({ where: { id: params.id }, include: INCLUDE });
  return NextResponse.json(row ? serialize(row) : { ok: true });
}
