import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/access";
import { CORE_JOBS, runCoreJobNow } from "@/lib/scheduler";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Admin-only: core data refreshes are infrastructure, surfaced for visibility.
function gate(role?: string) { return can(role, "settings.sources"); }

export async function GET() {
  const session = await getSession();
  if (!session || !gate(session.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const states = await prisma.coreJobState.findMany();
  const byType = new Map((states as any[]).map((s: any) => [s.type, s]));
  const jobs = CORE_JOBS.map((c) => {
    const st = byType.get(c.type);
    return {
      type: c.type,
      name: c.name,
      intervalLabel: c.intervalMs % (60 * 60_000) === 0 ? `${c.intervalMs / (60 * 60_000)}h` : `${c.intervalMs / 60_000}m`,
      lastRunAt: st?.lastRunAt ?? null,
      lastStatus: st?.lastStatus ?? null,
      lastError: st?.lastError ?? null,
    };
  });
  return NextResponse.json({ jobs });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session || !gate(session.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const type = String(b?.type || "");
  const r = await runCoreJobNow(type);
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
}
