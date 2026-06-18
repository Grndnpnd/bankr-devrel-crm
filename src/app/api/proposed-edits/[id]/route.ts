import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/access";
import { applyChangesToSubmission, type Change } from "@/lib/proposedEdits";

export const dynamic = "force-dynamic";

// POST: approve or reject a pending proposal. Body: { action: 'approve' | 'reject' }.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || !can(session.role, "submissions.edit")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const b = await req.json().catch(() => ({}));
  const action = b?.action;
  const pe = await prisma.proposedEdit.findUnique({ where: { id: params.id } });
  if (!pe) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (pe.status !== "pending") return NextResponse.json({ error: "already resolved" }, { status: 400 });

  if (action === "approve") {
    const changes = (pe.changes as unknown as Change[]) || [];
    try {
      await applyChangesToSubmission(pe.submissionId, changes);
    } catch (e: any) {
      return NextResponse.json({ error: e?.message ?? "apply failed" }, { status: 500 });
    }
    const updated = await prisma.proposedEdit.update({
      where: { id: params.id },
      data: { status: "approved", reviewedBy: session.email, reviewedAt: new Date() },
    });
    return NextResponse.json({ ok: true, proposal: updated });
  }

  if (action === "reject") {
    const updated = await prisma.proposedEdit.update({
      where: { id: params.id },
      data: { status: "rejected", reviewedBy: session.email, reviewedAt: new Date() },
    });
    return NextResponse.json({ ok: true, proposal: updated });
  }

  return NextResponse.json({ error: "action must be approve or reject" }, { status: 400 });
}
