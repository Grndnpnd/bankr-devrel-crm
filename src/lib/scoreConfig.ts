import { prisma } from "./prisma";
import { score, DEFAULT_WEIGHTS, type ScoreWeights } from "./scoring";
import type { Prisma } from "@prisma/client";
import type { CanonicalSubmission } from "./types";

const CONFIG_ID = "default";

/** Read the active weights, creating the default row on first access. */
export async function getWeights(): Promise<ScoreWeights> {
  const row = await prisma.scoreConfig.upsert({
    where: { id: CONFIG_ID },
    update: {},
    create: { id: CONFIG_ID, ...DEFAULT_WEIGHTS },
  });
  return {
    fees: row.fees,
    launched: row.launched,
    traction: row.traction,
    founder: row.founder,
    completeness: row.completeness,
  };
}

export function clampWeights(w: Partial<ScoreWeights>): ScoreWeights {
  const keys: (keyof ScoreWeights)[] = ["fees", "launched", "traction", "founder", "completeness"];
  const out = { ...DEFAULT_WEIGHTS };
  for (const k of keys) {
    const v = Number(w[k]);
    if (Number.isFinite(v)) out[k] = Math.max(0, Math.min(100, Math.round(v)));
  }
  return out;
}

type ScoringRow = {
  id: string;
  project: string;
  score: number;
  oneLiner: string | null;
  accomplishments: string | null;
  problem: string | null;
  solution: string | null;
  traction: string | null;
  funding: string | null;
  plan: string | null;
  whyBankr: string | null;
  links: string | null;
  notesField: string | null;
  tokenMatch: { token: string | null; fees24h: number | null } | null;
};

const SCORING_SELECT = {
  id: true,
  project: true,
  score: true,
  oneLiner: true,
  accomplishments: true,
  problem: true,
  solution: true,
  traction: true,
  funding: true,
  plan: true,
  whyBankr: true,
  links: true,
  notesField: true,
  tokenMatch: { select: { token: true, fees24h: true } },
} as const;

function toCanonical(r: ScoringRow): CanonicalSubmission {
  return {
    oneLiner: r.oneLiner ?? "",
    accomplishments: r.accomplishments ?? "",
    problem: r.problem ?? "",
    solution: r.solution ?? "",
    traction: r.traction ?? "",
    funding: r.funding ?? "",
    plan: r.plan ?? "",
    whyBankr: r.whyBankr ?? "",
    links: r.links ?? "",
    notesField: r.notesField ?? "",
    token: r.tokenMatch?.token ?? null,
    fees24h: r.tokenMatch?.fees24h ?? null,
  } as CanonicalSubmission;
}

export interface PreviewRow {
  id: string;
  project: string;
  current: number;
  next: number;
  delta: number;
}

export interface PreviewResult {
  rows: PreviewRow[]; // sorted by |delta| desc
  summary: { total: number; changed: number; avgAbsDelta: number; maxUp: number; maxDown: number };
}

/** Compute scores under proposed weights without persisting. */
export async function previewWeights(weights: ScoreWeights): Promise<PreviewResult> {
  const rows = (await prisma.submission.findMany({ select: SCORING_SELECT })) as unknown as ScoringRow[];
  const out: PreviewRow[] = rows.map((r) => {
    const next = score(toCanonical(r), weights).score;
    return { id: r.id, project: r.project, current: r.score, next, delta: next - r.score };
  });
  const changed = out.filter((r) => r.delta !== 0);
  const avgAbsDelta = changed.length
    ? Math.round((changed.reduce((a, r) => a + Math.abs(r.delta), 0) / changed.length) * 10) / 10
    : 0;
  const deltas = out.map((r) => r.delta);
  out.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || b.next - a.next);
  return {
    rows: out,
    summary: {
      total: out.length,
      changed: changed.length,
      avgAbsDelta,
      maxUp: Math.max(0, ...deltas),
      maxDown: Math.min(0, ...deltas),
    },
  };
}

/** Persist weights and re-score every submission in the DB. */
export async function applyWeights(weights: ScoreWeights, updatedBy?: string) {
  await prisma.scoreConfig.upsert({
    where: { id: CONFIG_ID },
    update: { ...weights, updatedBy: updatedBy ?? null },
    create: { id: CONFIG_ID, ...weights, updatedBy: updatedBy ?? null },
  });

  const rows = (await prisma.submission.findMany({ select: SCORING_SELECT })) as unknown as ScoringRow[];
  let changed = 0;
  await prisma.$transaction(
    rows.map((r) => {
      const { score: sc, breakdown } = score(toCanonical(r), weights);
      if (sc !== r.score) changed++;
      return prisma.submission.update({
        where: { id: r.id },
        data: { score: sc, scoreBreakdown: breakdown as unknown as Prisma.InputJsonValue },
      });
    })
  );
  return { total: rows.length, changed };
}
