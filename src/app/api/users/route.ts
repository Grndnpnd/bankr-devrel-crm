import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, hashPassword } from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import { inviteEmail } from "@/lib/emailTemplates";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const users = await prisma.user.findMany({
    select: { id: true, email: true, name: true, role: true, active: true, createdAt: true },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(users);
}

/** Create a team member (admin). Body: { email, name, role, password }. */
export async function POST(req: Request) {
  const session = await getSession();
  if (session?.role !== "ADMIN") return NextResponse.json({ error: "admin only" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const email = String(b.email ?? "").trim().toLowerCase();
  const name = String(b.name ?? "").trim();
  const role = ["ADMIN", "DEVREL", "VIEWER"].includes(b.role) ? b.role : "DEVREL";
  const password = String(b.password ?? "");
  if (!email || !email.includes("@")) return NextResponse.json({ error: "valid email required" }, { status: 400 });
  if (password.length < 8) return NextResponse.json({ error: "password must be at least 8 characters" }, { status: 400 });
  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) return NextResponse.json({ error: "a user with that email already exists" }, { status: 409 });
  const user = await prisma.user.create({
    data: { email, name: name || null, role, passwordHash: await hashPassword(password) },
    select: { id: true, email: true, name: true, role: true, active: true, createdAt: true },
  });

  // Send the invite email. The user is already created — email is best-effort,
  // so a failure here never fails the invite; we just report it to the caller.
  const base = process.env.APP_URL || new URL(req.url).origin;
  const tmpl = inviteEmail({
    name: user.name,
    email: user.email,
    tempPassword: password,
    role: user.role,
    loginUrl: `${base}/login`,
    invitedBy: session.name || session.email,
  });
  const mail = await sendEmail({ to: user.email, subject: tmpl.subject, html: tmpl.html, text: tmpl.text });

  return NextResponse.json(
    { ...user, _email: { sent: mail.ok, skipped: mail.skipped ?? false, error: mail.error } },
    { status: 201 }
  );
}
