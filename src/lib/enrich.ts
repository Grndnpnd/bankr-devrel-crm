import { prisma } from "./prisma";
import { fetchTokenData } from "./discover";
import { score } from "./scoring";
import { getWeights } from "./scoreConfig";
import type { CanonicalSubmission } from "./types";
import { Prisma } from "@prisma/client";

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
import { searchTokenLaunches, launchSummary, rankCandidates, type RankedCandidate } from "./discover";

/** Identity candidates to search, in priority order: founder X, project X, known wallet. */
function identityCandidates(row: {
  projectX: string | null;
  founders: unknown;
  tokenMatch: { wallet: string | null; contractAddress: string | null } | null;
}): string[] {
  const raw: string[] = [];
  const founders = Array.isArray(row.founders) ? (row.founders as any[]) : [];
  for (const f of founders) if (f?.x) raw.push(String(f.x));
  if (row.projectX) raw.push(row.projectX);
  if (row.tokenMatch?.wallet) raw.push(row.tokenMatch.wallet);
  // A single field may hold several handles ("@a & @b", "@a, @b") — split them out.
  const out: string[] = [];
  for (const item of raw) {
    for (const piece of String(item).split(/[&,/\s]+/)) {
      const t = piece.trim();
      if (t) out.push(t);
    }
  }
  return Array.from(new Set(out.filter(Boolean)));
}

export interface FindTrace {
  candidates: string[];
  steps: { q: string; count: number; error?: string; results: ReturnType<typeof launchSummary>[] }[];
}

/** Try to find a submission's token CA by founder/project X handle or wallet, with a trace of what was searched. */
/** Attach live volume / market cap to candidates so the picker shows the active token. */
async function withLiveStats(candidates: RankedCandidate[]): Promise<RankedCandidate[]> {
  const enriched = await Promise.all(
    candidates.map(async (c) => {
      try {
        const t = await fetchTokenData(c.tokenAddress);
        return { ...c, vol24h: t?.vol24h ?? null, marketCapUsd: t?.marketCapUsd ?? null };
      } catch {
        return { ...c, vol24h: null, marketCapUsd: null };
      }
    })
  );
  // Surface the actively-trading token first; ties keep their prior order.
  enriched.sort((a, b) => (b.vol24h ?? -1) - (a.vol24h ?? -1));
  return enriched;
}

export async function findContractAddressDebug(
  submissionId: string,
  enrichCandidates = false
): Promise<{
  found: { ca: string; via: string } | null;
  candidates: RankedCandidate[];
  trace: FindTrace;
}> {
  const row: any = await prisma.submission.findUnique({
    where: { id: submissionId },
    select: {
      project: true,
      projectX: true,
      founders: true,
      tokenMatch: { select: { wallet: true, contractAddress: true } },
    },
  });
  const identities = row ? identityCandidates(row) : [];
  const trace: FindTrace = { candidates: identities, steps: [] };
  if (!row) return { found: null, candidates: [], trace };

  const projectNames = [row.project, row.projectX].filter(Boolean) as string[];

  // Gather every result across all identity queries (search splits matches across
  // name / deployer / fee-recipient groups, all merged inside searchTokenLaunches).
  const all: import("./discover").LaunchResult[] = [];
  for (const q of identities) {
    try {
      const results = await searchTokenLaunches(q);
      trace.steps.push({ q, count: results.length, results: results.slice(0, 8).map(launchSummary) });
      all.push(...results);
    } catch (e: any) {
      trace.steps.push({ q, count: 0, error: e?.message ?? "search error", results: [] });
    }
  }

  const ranked = rankCandidates(all, identities, projectNames);

  // Confident = identity AND project name both match. One such token → auto-pick.
  const confident = ranked.filter((c) => c.identityMatch && c.projectMatch);
  if (confident.length === 1) {
    return { found: { ca: confident[0].tokenAddress, via: "identity + project match" }, candidates: [], trace };
  }
  if (confident.length > 1) {
    const cands = confident.slice(0, 6);
    return { found: null, candidates: enrichCandidates ? await withLiveStats(cands) : cands, trace };
  }

  // Fallback: identity matches only. A single one is very likely correct (the
  // founder's fee-recipient wallet funded exactly one token); multiple → disambiguate.
  const idOnly = ranked.filter((c) => c.identityMatch);
  if (idOnly.length === 1) {
    return { found: { ca: idOnly[0].tokenAddress, via: "identity match" }, candidates: [], trace };
  }
  if (idOnly.length > 1) {
    const cands = idOnly.slice(0, 6);
    return { found: null, candidates: enrichCandidates ? await withLiveStats(cands) : cands, trace };
  }

  // Last resort: name/symbol matches with no identity tie — let the user choose.
  if (ranked.length) {
    const cands = ranked.slice(0, 6);
    return { found: null, candidates: enrichCandidates ? await withLiveStats(cands) : cands, trace };
  }
  return { found: null, candidates: [], trace };
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
  refreshed: number; backfilled: number; failed: number; noMatch: number; review: number;
}> {
  const all: any[] = await prisma.submission.findMany({
    select: { id: true, tokenMatch: { select: { contractAddress: true } } },
  });
  let refreshed = 0, backfilled = 0, failed = 0, noMatch = 0, review = 0;
  for (const r of all) {
    const existingCa = r.tokenMatch?.contractAddress;
    try {
      if (existingCa) {
        await enrichSubmission(r.id, existingCa);
        refreshed++;
        continue;
      }
      // No CA yet — try to discover one. Enrich candidates so the review queue has volume.
      const { found, candidates } = await findContractAddressDebug(r.id, true);
      if (found) {
        await enrichSubmission(r.id, found.ca);
        await prisma.submission.update({
          where: { id: r.id },
          data: { needsReview: false, reviewCandidates: Prisma.DbNull },
        });
        backfilled++;
      } else if (candidates.length) {
        await prisma.submission.update({
          where: { id: r.id },
          data: {
            needsReview: true,
            reviewCandidates: candidates as unknown as Prisma.InputJsonValue,
          },
        });
        review++;
      } else {
        noMatch++;
      }
    } catch {
      failed++;
    }
  }
  return { refreshed, backfilled, failed, noMatch, review };
}

/** Remove a submission's token match (clear the CA) and rescore without onchain signal. */
export async function clearTokenMatch(id: string) {
  await prisma.tokenMatch.deleteMany({ where: { submissionId: id } });
  await prisma.submission.update({
    where: { id },
    data: { needsReview: false, reviewCandidates: Prisma.DbNull },
  }).catch(() => {});
  await rescoreSubmission(id);
}
