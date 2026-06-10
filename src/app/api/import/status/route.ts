import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

function maskId(id?: string) {
  if (!id) return "";
  if (id.length <= 8) return id;
  return `${id.slice(0, 4)}…${id.slice(-4)}`;
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const configured = Boolean(process.env.GOOGLE_SERVICE_ACCOUNT && process.env.GOOGLE_SHEET_ID);
  const [rowCount, lastSync] = await Promise.all([
    prisma.submission.count(),
    prisma.importLog.findFirst({ orderBy: { createdAt: "desc" } }),
  ]);

  return NextResponse.json({
    google: {
      configured,
      sheetIdMasked: maskId(process.env.GOOGLE_SHEET_ID),
      range: process.env.GOOGLE_SHEET_RANGE || "Form Responses 1",
    },
    rowCount,
    lastSync: lastSync
      ? {
          at: lastSync.createdAt.toISOString(),
          source: lastSync.source,
          pulled: lastSync.pulled,
          created: lastSync.created,
          updated: lastSync.updated,
          ok: lastSync.ok,
          message: lastSync.message,
        }
      : null,
  });
}
