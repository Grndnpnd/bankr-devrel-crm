import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getWeights, clampWeights, applyWeights } from "@/lib/scoreConfig";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ weights: await getWeights() });
}

// Apply: persist weights + re-score all submissions. Admin only.
export async function PUT(req: Request) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const weights = clampWeights(body?.weights ?? {});
  const result = await applyWeights(weights, session.email);
  return NextResponse.json({ applied: true, weights, ...result });
}
