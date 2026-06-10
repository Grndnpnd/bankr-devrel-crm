export type SourceKind = "GOOGLE_FORM" | "PLAIN";

export interface Founder {
  name: string;
  x: string;
  email: string;
}

export interface ScoreBreakdown {
  volume: number;
  launched: number;
  traction: number;
  founder: number;
  completeness: number;
}

/** A normalized submission, source-agnostic. Adapters emit this shape. */
export interface CanonicalSubmission {
  externalId: string;
  source: SourceKind;
  submittedAt: string; // ISO
  project: string;
  projectX: string;
  website: string;
  oneLiner: string;
  founders: Founder[];
  location: string;
  accomplishments: string;
  problem: string;
  solution: string;
  traction: string;
  funding: string;
  plan: string;
  needsHelp: string[];
  whyBankr: string;
  links: string;
  notesField: string;
  wallet: string;
  token: string;
  matchedVia: string;
  fees24h: number | null;
  vol24h: number | null;
  lowEffort: boolean;
}

export interface ScoredSubmission extends CanonicalSubmission {
  score: number;
  scoreBreakdown: ScoreBreakdown;
}
