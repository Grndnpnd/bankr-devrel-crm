import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { enrichAll } from "@/lib/enrich";

export const dynamic = "force-dynamic";

/** Refresh live token data for every submission that has a contract address. Admin only. */
export async function POST() {
  const session = await getSession();
  if (session?.role !== "ADMIN") {
    return NextResponse.json({ error: "admin only" }, { status: 403 });
  }
  try {
    const result = await enrichAll();
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "enrichment failed" }, { status: 500 });
  }
}
