import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const users = await prisma.user.findMany({
    select: { email: true, name: true, role: true },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(users);
}
