import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { clampWeights, previewWeights } from "@/lib/scoreConfig";

export const dynamic = "force-dynamic";

// Dry-run: compute scores under proposed weights without persisting. Admin only.
export async function POST(req: Request) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const weights = clampWeights(body?.weights ?? {});
  return NextResponse.json({ weights, ...(await previewWeights(weights)) });
}
