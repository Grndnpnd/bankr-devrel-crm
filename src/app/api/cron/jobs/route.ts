import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/access";
import { validateSchedule, nextRunFrom, JOB_HANDLERS, jobTypeList, CORE_TYPES } from "@/lib/scheduler";

export const dynamic = "force-dynamic";


export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // Admins see all ad-hoc jobs; everyone else sees only the ones they created.
  const isAdmin = can(session.role, "users.manage");
  const jobs = await prisma.cronJob.findMany({
    where: isAdmin ? {} : { createdBy: session.email },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ jobs, types: jobTypeList().filter((t) => !CORE_TYPES.includes(t.type)) });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session || !can(session.role, "cron.manage")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const name = String(b?.name || "").trim();
  const type = String(b?.type || "").trim();
  const schedule = String(b?.schedule || "").trim();
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
  if (!JOB_HANDLERS[type]) return NextResponse.json({ error: "unknown job type" }, { status: 400 });
  if (CORE_TYPES.includes(type)) return NextResponse.json({ error: "That refresh runs automatically as a core system job." }, { status: 400 });
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
