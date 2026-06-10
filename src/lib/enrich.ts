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
async function rescoreOne(id: string) {
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

  await rescoreOne(id);
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
