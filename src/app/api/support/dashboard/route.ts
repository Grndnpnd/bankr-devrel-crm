import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/access";
import { computeSupportDashboard } from "@/lib/supportAnalytics";

export const dynamic = "force-dynamic";

/** Support dashboard data for a date range. Gated on support.view.
 *  GET /api/support/dashboard?from=ISO&to=ISO  (defaults: last 30 days) */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session || !can(session.role, "support.view")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const url = new URL(req.url);
  const now = new Date();
  const defFrom = new Date(now.getTime() - 30 * 24 * 3600 * 1000);
  const from = url.searchParams.get("from") ? new Date(url.searchParams.get("from")!) : defFrom;
  const to = url.searchParams.get("to") ? new Date(url.searchParams.get("to")!) : now;
  if (isNaN(from.getTime()) || isNaN(to.getTime()) || from > to) {
    return NextResponse.json({ error: "invalid date range" }, { status: 400 });
  }
  try {
    const data = await computeSupportDashboard({ from, to });
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "dashboard error" }, { status: 500 });
  }
}
