import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, hashPassword } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Update a team member (admin). Body: { role?, active?, name?, password? }. */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (session?.role !== "ADMIN") return NextResponse.json({ error: "admin only" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (b.role && ["ADMIN", "DEVREL", "VIEWER"].includes(b.role)) data.role = b.role;
  if (typeof b.active === "boolean") data.active = b.active;
  if ("name" in b) data.name = b.name ? String(b.name).trim() : null;
  if (b.password) {
    if (String(b.password).length < 8) return NextResponse.json({ error: "password must be at least 8 characters" }, { status: 400 });
    data.passwordHash = await hashPassword(String(b.password));
  }
  if (!Object.keys(data).length) return NextResponse.json({ error: "nothing to update" }, { status: 400 });

  // Safety: an admin cannot deactivate or demote themselves.
  const target = await prisma.user.findUnique({ where: { id: params.id } });
  if (!target) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (target.email === session.email && (data.active === false || (data.role && data.role !== "ADMIN"))) {
    return NextResponse.json({ error: "you can't deactivate or demote your own account" }, { status: 400 });
  }

  const user = await prisma.user.update({
    where: { id: params.id },
    data: data as any,
    select: { id: true, email: true, name: true, role: true, active: true, createdAt: true },
  });
  return NextResponse.json(user);
}
