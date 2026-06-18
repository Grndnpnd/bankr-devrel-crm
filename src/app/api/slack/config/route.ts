import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/access";
import { sendSlackWebhook } from "@/lib/slack";

export const dynamic = "force-dynamic";

// GET: the caller's own webhook + (for admins) the team webhook.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const me = await prisma.user.findUnique({ where: { email: session.email }, select: { slackWebhook: true } });
  const isAdmin = can(session.role, "users.manage");
  const cfg = isAdmin
    ? await prisma.appConfig.findUnique({ where: { id: "default" }, select: { teamSlackWebhook: true } })
    : null;
  return NextResponse.json({
    userWebhook: me?.slackWebhook || null,
    teamWebhook: cfg?.teamSlackWebhook || null,
    isAdmin,
  });
}

// POST: set the caller's own webhook, or (admin) the team webhook.
// Body: { userWebhook?: string|null, teamWebhook?: string|null, test?: boolean }
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = await req.json().catch(() => ({}));

  // Optional: test a webhook before saving.
  if (b.test && typeof b.test === "string") {
    const r = await sendSlackWebhook(b.test, { text: "✅ Bankr CRM test message — your Slack webhook works." });
    return NextResponse.json(r, { status: r.ok ? 200 : 400 });
  }

  // Set own webhook.
  if ("userWebhook" in b) {
    const url = b.userWebhook ? String(b.userWebhook).trim() : null;
    if (url && !/^https:\/\/hooks\.slack\.com\//.test(url)) {
      return NextResponse.json({ error: "That doesn't look like a Slack incoming-webhook URL." }, { status: 400 });
    }
    await prisma.user.update({ where: { email: session.email }, data: { slackWebhook: url } });
  }

  // Set team webhook (admin only).
  if ("teamWebhook" in b) {
    if (!can(session.role, "users.manage")) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    const url = b.teamWebhook ? String(b.teamWebhook).trim() : null;
    if (url && !/^https:\/\/hooks\.slack\.com\//.test(url)) {
      return NextResponse.json({ error: "That doesn't look like a Slack incoming-webhook URL." }, { status: 400 });
    }
    await prisma.appConfig.upsert({
      where: { id: "default" },
      update: { teamSlackWebhook: url, updatedBy: session.email },
      create: { id: "default", teamSlackWebhook: url, updatedBy: session.email },
    });
  }

  return NextResponse.json({ ok: true });
}
