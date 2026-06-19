import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/access";
import { listOutreachTypes, addCustomOutreachType } from "@/lib/outreach";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ types: await listOutreachTypes() });
}

/** Add a custom type. Body: { label } */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session || !can(session.role, "submissions.edit")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const label = body?.label ? String(body.label) : "";
  if (!label.trim()) return NextResponse.json({ error: "label required" }, { status: 400 });
  const t = await addCustomOutreachType(label);
  return NextResponse.json({ ok: true, type: t, types: await listOutreachTypes() });
}
