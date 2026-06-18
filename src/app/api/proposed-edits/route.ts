import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/access";

export const dynamic = "force-dynamic";

// GET: pending proposals (optionally filtered by submissionId for card badges).
// Anyone who can edit submissions can review the queue.
export async function GET(req: Request) {
  const session = await getSession();
  if (!session || !can(session.role, "submissions.edit")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const url = new URL(req.url);
  const submissionId = url.searchParams.get("submissionId") || undefined;
  const status = url.searchParams.get("status") || "pending";

  const rows = await prisma.proposedEdit.findMany({
    where: { status, ...(submissionId ? { submissionId } : {}) },
    include: { submission: { select: { id: true, project: true } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ proposals: rows });
}
