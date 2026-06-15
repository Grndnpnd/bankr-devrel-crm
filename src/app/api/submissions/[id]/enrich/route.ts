import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { enrichSubmission, findContractAddressDebug, clearTokenMatch } from "@/lib/enrich";
import { serialize, INCLUDE } from "@/lib/serialize";

export const dynamic = "force-dynamic";

/**
 * Enrich one submission with live token data.
 * Body: { contractAddress: "0x..." } to set/refresh a known CA,
 *   or  { auto: true } to discover the CA via token-launches search
 *       (founder X handle, project X handle, then known wallet).
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || session.role === "VIEWER") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  try {
    let ca = body?.contractAddress ? String(body.contractAddress).trim() : "";
    let via: string | null = null;
    if (!ca && body?.auto) {
      const { found, candidates, trace } = await findContractAddressDebug(params.id, true);
      if (!found) {
        if (candidates.length) {
          // Name-matches with no confident identity match — let the user choose.
          return NextResponse.json({ ambiguous: true, candidates, trace });
        }
        return NextResponse.json(
          { error: "No token found for this project's founder X, project X, or wallet.", trace },
          { status: 404 }
        );
      }
      ca = found.ca;
      via = found.via;
    }
    if (!ca) return NextResponse.json({ error: "contractAddress or auto required" }, { status: 400 });
    await enrichSubmission(params.id, ca);
    const row = await prisma.submission.findUnique({ where: { id: params.id }, include: INCLUDE });
    return NextResponse.json({ ...(row ? serialize(row) : {}), _found_via: via });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "enrichment failed" }, { status: 400 });
  }
}

/** Clear a submission's token contract address / onchain match. */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || session.role === "VIEWER") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  try {
    await clearTokenMatch(params.id);
    const row = await prisma.submission.findUnique({ where: { id: params.id }, include: INCLUDE });
    return NextResponse.json(row ? serialize(row) : { ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "could not clear token" }, { status: 400 });
  }
}
