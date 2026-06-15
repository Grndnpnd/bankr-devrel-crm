import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { enrichAndBackfillAll } from "@/lib/enrich";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Refresh live token data for rows with a CA, and attempt to discover a CA
 * (via token-launches search on founder X / project X / wallet) for rows without one.
 * Admin only.
 */
export async function POST() {
  const session = await getSession();
  if (session?.role !== "ADMIN") {
    return NextResponse.json({ error: "admin only" }, { status: 403 });
  }
  try {
    const result = await enrichAndBackfillAll();
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "enrichment failed" }, { status: 500 });
  }
}
