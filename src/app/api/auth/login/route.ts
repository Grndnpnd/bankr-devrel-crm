import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword, createToken, setSessionCookie } from "@/lib/auth";

export async function POST(req: Request) {
  const { email, password } = await req.json().catch(() => ({}));
  if (!email || !password) {
    return NextResponse.json({ error: "email and password required" }, { status: 400 });
  }
  const user = await prisma.user.findUnique({ where: { email: String(email).toLowerCase() } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return NextResponse.json({ error: "invalid credentials" }, { status: 401 });
  }
  const token = await createToken({ id: user.id, email: user.email, name: user.name, role: user.role });
  await setSessionCookie(token);
  return NextResponse.json({ id: user.id, email: user.email, name: user.name, role: user.role });
}
