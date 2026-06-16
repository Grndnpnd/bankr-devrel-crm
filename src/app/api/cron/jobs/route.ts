import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { validateSchedule, nextRunFrom, JOB_HANDLERS, jobTypeList } from "@/lib/scheduler";

export const dynamic = "force-dynamic";

function canManage(role?: string) { return role === "ADMIN" || role === "DEVREL"; }

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const jobs = await prisma.cronJob.findMany({ orderBy: { createdAt: "asc" } });
  return NextResponse.json({ jobs, types: jobTypeList() });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session || !canManage(session.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const name = String(b?.name || "").trim();
  const type = String(b?.type || "").trim();
  const schedule = String(b?.schedule || "").trim();
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
  if (!JOB_HANDLERS[type]) return NextResponse.json({ error: "unknown job type" }, { status: 400 });
  const sched = validateSchedule(schedule);
  if (!sched.ok) return NextResponse.json({ error: sched.error }, { status: 400 });

  const job = await prisma.cronJob.create({
    data: {
      name, type, schedule,
      enabled: b?.enabled !== false,
      nextRunAt: nextRunFrom(schedule),
      createdBy: session.email,
    },
  });
  return NextResponse.json(job, { status: 201 });
}
