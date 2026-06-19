import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/access";
import { enqueueOutbound } from "@/lib/outbound";

export const dynamic = "force-dynamic";

/** Set/clear a project's Telegram target. Body: { target: string | null } */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || !can(session.role, "submissions.edit")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const target = body?.target ? String(body.target).trim() : null;
  await prisma.submission.update({ where: { id: params.id }, data: { telegramTarget: target } });
  return NextResponse.json({ ok: true, telegram_target: target ?? "" });
}

/** Queue an outbound Telegram message to this project. Body: { message: string } */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || !can(session.role, "submissions.edit")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const message = body?.message ? String(body.message) : "";
  const out = await enqueueOutbound({ submissionId: params.id, body: message, createdBy: session.email });
  if (!out.ok) return NextResponse.json({ error: out.error }, { status: 400 });
  return NextResponse.json({ ok: true, id: out.id });
}
