import type { Submission } from '@/types';

/**
 * Build a compact, privacy-trimmed view of submissions for the chat LLM.
 * EXCLUDED: founders (PII), wallet, contract_address, token addresses, and the
 * long narrative fields (problem/solution/traction/funding/plan/why_bankr/etc.).
 * INCLUDED: the operational fields needed to answer pipeline/outreach questions.
 *
 * Outreach is summarized (type + author + date), not full note bodies, to keep
 * payloads small and avoid leaking sensitive note content.
 */
export interface ChatRow {
  project: string;
  stage: string;
  owner: string;
  score: number;
  needs_help: string[];
  source: string;
  submitted_at: string;
  vol_24h: number | null;
  market_cap: number | null;
  has_token: boolean;
  needs_review: boolean;
  low_effort: boolean;
  last_contact: string | null;          // ISO date of most recent outreach
  contact_count: number;                 // total outreach events
  recent_outreach: { type: string; by: string; date: string }[]; // last few, no bodies
}

export function toChatRows(subs: Submission[], maxOutreachPerRow = 5): ChatRow[] {
  return subs.map((s) => {
    const outreach = (s.outreach ?? [])
      .filter((a) => a.type !== 'system')
      .map((a) => ({ type: a.type, by: a.author, date: a.timestamp }));
    const sorted = [...outreach].sort((a, b) => (a.date < b.date ? 1 : -1));
    return {
      project: s.project,
      stage: s.stage,
      owner: s.owner || '(unassigned)',
      score: s.score,
      needs_help: s.needs_help ?? [],
      source: s.source,
      submitted_at: s.submitted_at,
      vol_24h: s.vol_24h ?? null,
      market_cap: s.market_cap ?? null,
      has_token: !!(s.token || s.contract_address),
      needs_review: !!s.needs_review,
      low_effort: !!s.low_effort,
      last_contact: sorted[0]?.date ?? null,
      contact_count: outreach.length,
      recent_outreach: sorted.slice(0, maxOutreachPerRow),
    };
  });
}

/** Rough token budget guard — cap how many rows we send so we stay well within context. */
export function capRows(rows: ChatRow[], max = 300): ChatRow[] {
  if (rows.length <= max) return rows;
  // Prioritize the most decision-relevant: higher score first.
  return [...rows].sort((a, b) => b.score - a.score).slice(0, max);
}
