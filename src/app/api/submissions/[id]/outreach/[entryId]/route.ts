import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/access";

export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, { params }: { params: { id: string; entryId: string } }) {
  const session = await getSession();
  if (!session || !can(session.role, "submissions.edit")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  try {
    await prisma.outreachLog.delete({ where: { id: params.entryId } });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "delete failed" }, { status: 400 });
  }
}
