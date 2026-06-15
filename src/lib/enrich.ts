import { prisma } from "./prisma";
import { fetchTokenData } from "./discover";
import { score } from "./scoring";
import { getWeights } from "./scoreConfig";
import type { CanonicalSubmission } from "./types";
import type { Prisma } from "@prisma/client";

const RESCORE_SELECT = {
  oneLiner: true, accomplishments: true, problem: true, solution: true, traction: true,
  funding: true, plan: true, whyBankr: true, links: true, notesField: true,
  tokenMatch: { select: { token: true, fees24h: true, vol24h: true } },
} as const;

/** Recompute and persist the score for a single submission using current weights. */
export async function rescoreSubmission(id: string) {
  const r: any = await prisma.submission.findUnique({ where: { id }, select: RESCORE_SELECT });
  if (!r) return;
  const canonical = {
    oneLiner: r.oneLiner ?? "", accomplishments: r.accomplishments ?? "", problem: r.problem ?? "",
    solution: r.solution ?? "", traction: r.traction ?? "", funding: r.funding ?? "", plan: r.plan ?? "",
    whyBankr: r.whyBankr ?? "", links: r.links ?? "", notesField: r.notesField ?? "",
    token: r.tokenMatch?.token ?? null, fees24h: r.tokenMatch?.fees24h ?? null,
    vol24h: r.tokenMatch?.vol24h ?? null,
  } as unknown as CanonicalSubmission;
  const { score: sc, breakdown } = score(canonical, await getWeights());
  await prisma.submission.update({
    where: { id },
    data: { score: sc, scoreBreakdown: breakdown as unknown as Prisma.InputJsonValue },
  });
}

/** Look up a contract address on the discover API and persist the live token data, then rescore. */
export async function enrichSubmission(id: string, contractAddress: string) {
  const token = await fetchTokenData(contractAddress);
  if (!token) throw new Error("No token found for that contract address.");

  const ca = contractAddress.trim();
  const symbol = token.symbol || token.name || "";
  const wallet = token.feeRecipientAddress || null;
  const matchedVia =
    token.feeRecipientXUsername ? `@${token.feeRecipientXUsername} (fee recipient)`
    : token.deployerXUsername ? `@${token.deployerXUsername} (deployer)`
    : null;

  const fields = {
    token: symbol,
    name: token.name ?? null,
    wallet,
    matchedVia,
    contractAddress: ca,
    vol24h: token.vol24h ?? null,
    marketCapUsd: token.marketCapUsd ?? null,
    priceChange24h: token.priceChange24h ?? null,
    imageUri: token.imageUri ?? null,
    refreshedAt: new Date(),
  };

  await prisma.tokenMatch.upsert({
    where: { submissionId: id },
    update: fields,
    create: { submissionId: id, ...fields },
  });

  await rescoreSubmission(id);
}

/** Re-fetch live data for EVERY submission that already has a contract address. */
export async function enrichAll(): Promise<{ enriched: number; failed: number }> {
  const rows: any[] = await prisma.tokenMatch.findMany({
    where: { contractAddress: { not: null } },
    select: { submissionId: true, contractAddress: true },
  });
  let enriched = 0, failed = 0;
  for (const r of rows) {
    try {
      await enrichSubmission(r.submissionId, r.contractAddress as string);
      enriched++;
    } catch {
      failed++;
    }
  }
  return { enriched, failed };
}

/* ── CA backfill via token-launches search ── */
import { searchTokenLaunches, pickLaunch, launchSummary } from "./discover";

/** Identity candidates to search, in priority order: founder X, project X, known wallet. */
function identityCandidates(row: {
  projectX: string | null;
  founders: unknown;
  tokenMatch: { wallet: string | null; contractAddress: string | null } | null;
}): string[] {
  const out: string[] = [];
  const founders = Array.isArray(row.founders) ? (row.founders as any[]) : [];
  for (const f of founders) if (f?.x) out.push(String(f.x));
  if (row.projectX) out.push(row.projectX);
  if (row.tokenMatch?.wallet) out.push(row.tokenMatch.wallet);
  return Array.from(new Set(out.map((s) => s.trim()).filter(Boolean)));
}

export interface FindTrace {
  candidates: string[];
  steps: { q: string; count: number; error?: string; results: ReturnType<typeof launchSummary>[] }[];
}

/** Try to find a submission's token CA by founder/project X handle or wallet, with a trace of what was searched. */
export async function findContractAddressDebug(
  submissionId: string
): Promise<{ found: { ca: string; via: string } | null; trace: FindTrace }> {
  const row: any = await prisma.submission.findUnique({
    where: { id: submissionId },
    select: {
      projectX: true,
      founders: true,
      tokenMatch: { select: { wallet: true, contractAddress: true } },
    },
  });
  const candidates = row ? identityCandidates(row) : [];
  const trace: FindTrace = { candidates, steps: [] };
  if (!row) return { found: null, trace };

  for (const q of candidates) {
    try {
      const results = await searchTokenLaunches(q);
      trace.steps.push({ q, count: results.length, results: results.slice(0, 8).map(launchSummary) });
      const hit = pickLaunch(results, q);
      if (hit?.tokenAddress) return { found: { ca: hit.tokenAddress, via: q }, trace };
    } catch (e: any) {
      trace.steps.push({ q, count: 0, error: e?.message ?? "search error", results: [] });
    }
  }
  return { found: null, trace };
}

/** Convenience wrapper used by the bulk pass. */
export async function findContractAddress(
  submissionId: string
): Promise<{ ca: string; via: string } | null> {
  return (await findContractAddressDebug(submissionId)).found;
}

/**
 * Full onchain pass:
 *  - rows WITH a CA: refresh live discover data
 *  - rows WITHOUT a CA: attempt backfill via token-launches search, then enrich
 */
export async function enrichAndBackfillAll(): Promise<{
  refreshed: number; backfilled: number; failed: number; noMatch: number;
}> {
  const all: any[] = await prisma.submission.findMany({
    select: { id: true, tokenMatch: { select: { contractAddress: true } } },
  });
  let refreshed = 0, backfilled = 0, failed = 0, noMatch = 0;
  for (const r of all) {
    const existingCa = r.tokenMatch?.contractAddress;
    try {
      if (existingCa) {
        await enrichSubmission(r.id, existingCa);
        refreshed++;
      } else {
        const found = await findContractAddress(r.id);
        if (!found) { noMatch++; continue; }
        await enrichSubmission(r.id, found.ca);
        backfilled++;
      }
    } catch {
      failed++;
    }
  }
  return { refreshed, backfilled, failed, noMatch };
}
