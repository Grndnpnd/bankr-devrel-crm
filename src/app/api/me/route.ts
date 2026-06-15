import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, createToken, setSessionCookie } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const user = await prisma.user.findUnique({
    where: { id: session.id },
    select: { id: true, email: true, name: true, role: true },
  });
  if (!user) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(user);
}

/** Update your own profile (name). Re-issues the session cookie so the new name shows immediately. */
export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  if (!("name" in b)) return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  const name = b.name ? String(b.name).trim() : null;
  const user = await prisma.user.update({
    where: { id: session.id },
    data: { name },
    select: { id: true, email: true, name: true, role: true },
  });
  await setSessionCookie(await createToken(user));
  return NextResponse.json(user);
}
