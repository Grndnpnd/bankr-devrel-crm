import type { Prisma } from "@prisma/client";
import { STAGE_TO_LABEL, SOURCE_TO_LABEL } from "./labels";

export type SubmissionWithRelations = Prisma.SubmissionGetPayload<{
  include: {
    tokenMatch: true;
    activities: { include: { author: { select: { name: true; email: true } } } };
  };
}>;

/** Flatten a Prisma submission into the exact shape the UI's Submission type expects. */
export function serialize(s: SubmissionWithRelations) {
  return {
    id: s.id,
    source: SOURCE_TO_LABEL[s.source] ?? "google_form",
    submitted_at: s.submittedAt.toISOString(),
    project: s.project,
    project_x: s.projectX ?? "",
    website: s.website ?? "",
    one_liner: s.oneLiner ?? "",
    founders: (s.founders as any) ?? [],
    location: s.location ?? "",
    telegram_target: s.telegramTarget ?? "",
    accomplishments: s.accomplishments ?? "",
    problem: s.problem ?? "",
    solution: s.solution ?? "",
    traction: s.traction ?? "",
    funding: s.funding ?? "",
    plan: s.plan ?? "",
    needs_help: s.needsHelp ?? [],
    why_bankr: s.whyBankr ?? "",
    links: s.links ?? "",
    notes_field: s.notesField ?? "",
    wallet: s.tokenMatch?.wallet ?? "",
    token: s.tokenMatch?.token ?? "",
    matched_via: s.tokenMatch?.matchedVia ?? "",
    fees_24h: s.tokenMatch?.fees24h ?? null,
    contract_address: s.tokenMatch?.contractAddress ?? "",
    token_name: s.tokenMatch?.name ?? "",
    vol_24h: s.tokenMatch?.vol24h ?? null,
    market_cap: s.tokenMatch?.marketCapUsd ?? null,
    price_change_24h: s.tokenMatch?.priceChange24h ?? null,
    token_image: s.tokenMatch?.imageUri ?? "",
    score: s.score,
    score_breakdown: s.scoreBreakdown as any,
    low_effort: s.lowEffort,
    needs_review: (s as any).needsReview ?? false,
    review_candidates: ((s as any).reviewCandidates as any) ?? [],
    stage: STAGE_TO_LABEL[s.stage] ?? "New",
    owner: s.owner ?? "",
    outreach: [...s.activities]
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((a) => ({
        id: a.id,
        type: a.kind,
        author: a.author?.name || a.author?.email || "?",
        timestamp: a.createdAt.toISOString(),
        content: a.body,
      })),
  };
}

export const INCLUDE = {
  tokenMatch: true,
  activities: { include: { author: { select: { name: true, email: true } } } },
} as const;
