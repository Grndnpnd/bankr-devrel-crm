import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/access";
import { resolveProposal } from "@/lib/proposedEdits";

export const dynamic = "force-dynamic";

// POST: approve or reject a pending proposal. Body: { action: 'approve' | 'reject' }.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || !can(session.role, "submissions.edit")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const b = await req.json().catch(() => ({}));
  const action = b?.action;
  if (action !== "approve" && action !== "reject") {
    return NextResponse.json({ error: "action must be approve or reject" }, { status: 400 });
  }
  const res = await resolveProposal(params.id, action, session.email);
  if (!res.ok) {
    const code = res.error === "proposal not found" ? 404 : 400;
    return NextResponse.json({ error: res.error }, { status: code });
  }
  return NextResponse.json({ ok: true, status: res.status });
}
