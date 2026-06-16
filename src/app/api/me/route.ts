import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, createToken, setSessionCookie } from "@/lib/auth";
import { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const user = await prisma.user.findUnique({
    where: { id: session.id },
    select: { id: true, email: true, name: true, role: true, dashboardLayout: true },
  });
  if (!user) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(user);
}

/** Update your own profile (name). Re-issues the session cookie so the new name shows immediately. */
export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if ("name" in b) data.name = b.name ? String(b.name).trim() : null;
  // Dashboard layout: store the widget array as JSON (or clear it to reset to defaults).
  if ("dashboardLayout" in b) {
    data.dashboardLayout =
      b.dashboardLayout === null
        ? Prisma.DbNull
        : (b.dashboardLayout as unknown as Prisma.InputJsonValue);
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }
  const user = await prisma.user.update({
    where: { id: session.id },
    data: data as any,
    select: { id: true, email: true, name: true, role: true, dashboardLayout: true },
  });
  // Re-issue the cookie only when identity fields changed (layout isn't in the token).
  if ("name" in b) await setSessionCookie(await createToken({ id: user.id, email: user.email, name: user.name, role: user.role }));
  return NextResponse.json(user);
}
