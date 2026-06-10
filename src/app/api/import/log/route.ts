import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const rows = await prisma.importLog.findMany({ orderBy: { createdAt: "desc" }, take: 25 });
  return NextResponse.json(
    rows.map((r: any) => ({
      id: r.id,
      at: r.createdAt.toISOString(),
      source: r.source,
      pulled: r.pulled,
      created: r.created,
      updated: r.updated,
      ok: r.ok,
      message: r.message,
      by: r.by,
    }))
  );
}
