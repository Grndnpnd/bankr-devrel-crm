import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serialize, INCLUDE } from "@/lib/serialize";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await prisma.submission.findMany({
    include: INCLUDE,
    orderBy: { score: "desc" },
  });
  return NextResponse.json(rows.map(serialize));
}
