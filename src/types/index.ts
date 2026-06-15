export interface TokenCandidate {
  tokenAddress: string;
  symbol: string | null;
  name: string | null;
  status: string | null;
  deployerX: string | null;
  feeX: string | null;
  identityMatch: boolean;
  projectMatch?: boolean;
  bankrDeployed: boolean;
  vol24h?: number | null;
  marketCapUsd?: number | null;
}

export interface Founder {
  name: string;
  x: string;
  email: string;
}

export interface ScoreBreakdown {
  volume?: number;
  fees?: number; // legacy rows scored before the volume rename
  launched: number;
  traction: number;
  founder: number;
  completeness: number;
}

export interface Activity {
  id: string;
  type: 'note' | 'dm' | 'email' | 'call' | 'meeting' | 'stage_change' | 'system';
  author: string;
  timestamp: string;
  content: string;
  fromStage?: string;
  toStage?: string;
}

export interface Submission {
  id: string;
  source: 'google_form' | 'plain' | 'manual';
  submitted_at: string;
  project: string;
  project_x: string;
  website: string;
  one_liner: string;
  founders: Founder[];
  location: string;
  accomplishments: string;
  problem: string;
  solution: string;
  traction: string;
  funding: string;
  plan: string;
  needs_help: string[];
  why_bankr: string;
  links: string;
  notes_field: string;
  wallet: string;
  token: string;
  matched_via: string;
  fees_24h: number | null;
  contract_address?: string;
  token_name?: string;
  vol_24h?: number | null;
  market_cap?: number | null;
  price_change_24h?: number | null;
  token_image?: string;
  score: number;
  score_breakdown: ScoreBreakdown;
  low_effort: boolean;
  needs_review?: boolean;
  review_candidates?: TokenCandidate[];
  stage: string;
  owner: string;
  outreach: Activity[];
}

export interface FilterState {
  stage: string[];
  tags: string[];
  owner: string | null;
  source: string | null;
  liveOnly: boolean;
  reviewOnly: boolean;
  hideLowEffort: boolean;
  scoreMin?: number;
  scoreMax?: number;
}

export interface SortConfig {
  key: string;
  direction: 'asc' | 'desc';
}

export type Stage = 'New' | 'Reviewing' | 'Contacted' | 'In Convo' | 'Onboarding' | 'Won' | 'Passed';
