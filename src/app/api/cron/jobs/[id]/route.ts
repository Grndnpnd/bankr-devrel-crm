import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/access";
import { validateSchedule, nextRunFrom, JOB_HANDLERS } from "@/lib/scheduler";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Non-admins may only act on ad-hoc jobs they created; admins on any.
function ownsOrAdmin(session: any, job: { createdBy: string | null }) {
  return can(session.role, "users.manage") || job.createdBy === session.email;
}


export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || !can(session.role, "cron.manage")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const job = await prisma.cronJob.findUnique({ where: { id: params.id } });
  if (!job) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!ownsOrAdmin(session, job)) return NextResponse.json({ error: "not your job" }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if ("name" in b) data.name = String(b.name).trim();
  if ("enabled" in b) data.enabled = !!b.enabled;
  if ("schedule" in b) {
    const sched = validateSchedule(String(b.schedule));
    if (!sched.ok) return NextResponse.json({ error: sched.error }, { status: 400 });
    data.schedule = String(b.schedule);
    data.nextRunAt = nextRunFrom(String(b.schedule));
  }
  if ("type" in b) {
    if (!JOB_HANDLERS[String(b.type)]) return NextResponse.json({ error: "unknown job type" }, { status: 400 });
    data.type = String(b.type);
  }
  const updated = await prisma.cronJob.update({ where: { id: params.id }, data });
  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || !can(session.role, "cron.manage")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const job = await prisma.cronJob.findUnique({ where: { id: params.id } });
  if (!job) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!ownsOrAdmin(session, job)) return NextResponse.json({ error: "not your job" }, { status: 403 });
  await prisma.cronJob.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}

// Run a job immediately (manual trigger from the UI).
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || !can(session.role, "cron.manage")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const job = await prisma.cronJob.findUnique({ where: { id: params.id } });
  if (!job) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!ownsOrAdmin(session, job)) return NextResponse.json({ error: "not your job" }, { status: 403 });
  const handler = JOB_HANDLERS[job.type];
  if (!handler) return NextResponse.json({ error: "unknown job type" }, { status: 400 });
  try {
    const result = await handler.run((job as any).config);
    const updated = await prisma.cronJob.update({
      where: { id: job.id },
      data: { lastStatus: "ok", lastResult: result ?? {}, lastError: null, lastRunAt: new Date() },
    });
    return NextResponse.json({ ok: true, job: updated, result });
  } catch (e: any) {
    const updated = await prisma.cronJob.update({
      where: { id: job.id },
      data: { lastStatus: "error", lastError: e?.message ?? "job failed", lastRunAt: new Date() },
    });
    return NextResponse.json({ ok: false, job: updated, error: e?.message }, { status: 500 });
  }
}
