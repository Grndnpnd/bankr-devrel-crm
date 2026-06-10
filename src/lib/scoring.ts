import type { CanonicalSubmission, ScoreBreakdown } from "./types";

/**
 * Outreach-target scoring. Transparent and weighted; max 100.
 * Weights are tunable at runtime (persisted in the ScoreConfig table) and passed
 * in by callers. DEFAULT_WEIGHTS mirrors the Phase 0 model so seeded scores stay
 * stable when no custom config exists.
 */
export type ScoreWeights = {
  fees: number;
  launched: number;
  traction: number;
  founder: number;
  completeness: number;
};

export const DEFAULT_WEIGHTS: ScoreWeights = {
  fees: 40,
  launched: 15,
  traction: 15,
  founder: 15,
  completeness: 15,
};

/** @deprecated use DEFAULT_WEIGHTS — kept as an alias for back-compat. */
export const WEIGHTS = DEFAULT_WEIGHTS;

const TRACTION_KEYWORDS = [
  "users", "revenue", "mrr", "arr", "volume", "tvl", "waitlist", "stars",
  "signups", "sign ups", "partnership", "holders", "downloads", "transacting", "active",
];

const FOUNDER_KEYWORDS = [
  "acquired", "exited", "founding engineer", "ex-", "raised", "yc ", "y combinator",
  "coinbase", "a16z", "paradigm", "github.com", "cto", "phd", "forbes", "shipped", "sold",
];

const NUM_SIGNAL_RE =
  /\d[\d,.]*\s*(?:k|m|users|signups|sign ups|holders|stars|%|x|months|weeks)/g;

const COMPLETENESS_FIELDS: (keyof CanonicalSubmission)[] = [
  "oneLiner", "accomplishments", "problem", "solution", "traction",
  "funding", "plan", "whyBankr", "links", "notesField",
];

function countNumSignals(text: string): number {
  const m = text.toLowerCase().match(NUM_SIGNAL_RE);
  return m ? m.length : 0;
}

export function score(
  s: CanonicalSubmission,
  w: ScoreWeights = DEFAULT_WEIGHTS
): { score: number; breakdown: ScoreBreakdown } {
  // Onchain signal: prefer live 24h volume (from discover); fall back to legacy fees so
  // seeded rows keep their score until they're enriched with a contract address.
  const f = s.vol24h ?? s.fees24h ?? 0;
  const volume = f > 0 ? Math.min(w.fees, Math.round(12 * Math.log10(f + 1))) : 0;

  const launched = s.token ? w.launched : 0;

  const tracLower = (s.traction || "").toLowerCase();
  const traction = Math.min(
    w.traction,
    countNumSignals(s.traction || "") * 3 +
      TRACTION_KEYWORDS.reduce((a, k) => a + (tracLower.includes(k) ? 2 : 0), 0)
  );

  const accLower = (s.accomplishments || "").toLowerCase();
  const founder = Math.min(
    w.founder,
    FOUNDER_KEYWORDS.reduce((a, k) => a + (accLower.includes(k) ? 3 : 0), 0)
  );

  const filled = COMPLETENESS_FIELDS.filter((k) => String(s[k] ?? "").trim()).length;
  const textLen = COMPLETENESS_FIELDS.reduce((a, k) => a + String(s[k] ?? "").length, 0);
  const completeness = Math.min(
    w.completeness,
    Math.round((filled / COMPLETENESS_FIELDS.length) * 8) + Math.min(7, Math.floor(textLen / 400))
  );

  const breakdown: ScoreBreakdown = { volume, launched, traction, founder, completeness };
  const total = Math.min(100, volume + launched + traction + founder + completeness);
  return { score: total, breakdown };
}
