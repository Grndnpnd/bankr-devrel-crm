import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, verifyPassword, hashPassword } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Change your own password. Body: { currentPassword, newPassword }. */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { currentPassword, newPassword } = await req.json().catch(() => ({}));
  if (!currentPassword || !newPassword) {
    return NextResponse.json({ error: "current and new password required" }, { status: 400 });
  }
  if (String(newPassword).length < 8) {
    return NextResponse.json({ error: "new password must be at least 8 characters" }, { status: 400 });
  }
  const user = await prisma.user.findUnique({ where: { id: session.id } });
  if (!user || !(await verifyPassword(String(currentPassword), user.passwordHash))) {
    return NextResponse.json({ error: "current password is incorrect" }, { status: 400 });
  }
  await prisma.user.update({
    where: { id: session.id },
    data: { passwordHash: await hashPassword(String(newPassword)) },
  });
  return NextResponse.json({ ok: true });
}
