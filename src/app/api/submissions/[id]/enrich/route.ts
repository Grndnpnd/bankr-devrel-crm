import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { enrichSubmission } from "@/lib/enrich";
import { serialize, INCLUDE } from "@/lib/serialize";

export const dynamic = "force-dynamic";

/** Attach a contract address and pull live token data from the discover API. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || session.role === "VIEWER") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { contractAddress } = await req.json().catch(() => ({}));
  if (!contractAddress || !String(contractAddress).trim()) {
    return NextResponse.json({ error: "contractAddress required" }, { status: 400 });
  }
  try {
    await enrichSubmission(params.id, String(contractAddress).trim());
    const row = await prisma.submission.findUnique({ where: { id: params.id }, include: INCLUDE });
    return NextResponse.json(row ? serialize(row) : { ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "enrichment failed" }, { status: 400 });
  }
}
