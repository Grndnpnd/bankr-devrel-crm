/**
 * Bankr discover API client. Looks up live token data by contract address.
 *   GET https://api.bankr.bot/discover/{contractAddress}  ->  { token: {...} } | { token: null }
 */
export interface DiscoverToken {
  tokenAddress: string;
  name?: string | null;
  symbol?: string | null;
  decimals?: number | null;
  deployerAddress?: string | null;
  deployerXUsername?: string | null;
  feeRecipientAddress?: string | null;
  feeRecipientXUsername?: string | null;
  imageUri?: string | null;
  lastPriceUsd?: number | null;
  marketCapUsd?: number | null;
  priceChange24h?: number | null;
  txCount24h?: number | null;
  vol24h?: number | null;
  websiteUrl?: string | null;
}

const CA_RE = /^0x[a-fA-F0-9]{40}$/;
export function isContractAddress(ca: string): boolean {
  return CA_RE.test(ca.trim());
}

/** Fetch token data for a contract address. Returns null if no token is found. Throws on bad input / API error. */
export async function fetchTokenData(ca: string): Promise<DiscoverToken | null> {
  const addr = ca.trim();
  if (!isContractAddress(addr)) {
    throw new Error("Invalid contract address (expected 0x + 40 hex chars).");
  }
  const res = await fetch(`https://api.bankr.bot/discover/${addr}`, {
    headers: { accept: "application/json" },
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Discover API error (HTTP ${res.status}).`);
  const data = await res.json().catch(() => null);
  const t = data?.token;
  if (!t || !t.tokenAddress) return null;
  return t as DiscoverToken;
}

/* ── token-launches search: resolve a CA from an X username or wallet ── */
export interface LaunchResult {
  status?: string | null;
  tokenName?: string | null;
  tokenSymbol?: string | null;
  chain?: string | null;
  tokenAddress?: string | null;
  timestamp?: number | null;
  deployer?: { walletAddress?: string | null; xUsername?: string | null } | null;
  feeRecipient?: { walletAddress?: string | null; xUsername?: string | null } | null;
}

/** GET /token-launches/search?q=... — q can be an X username (no @) or a wallet address. */
export async function searchTokenLaunches(q: string): Promise<LaunchResult[]> {
  const query = q.trim().replace(/^@/, "");
  if (!query) return [];
  const res = await fetch(
    `https://api.bankr.bot/token-launches/search?q=${encodeURIComponent(query)}`,
    { headers: { accept: "application/json" }, cache: "no-store" }
  );
  if (!res.ok) throw new Error(`Token search error (HTTP ${res.status}).`);
  const data = await res.json().catch(() => null);
  const groups = data?.groups ?? {};
  // The endpoint splits matches across groups: `tokens` (name/symbol), `byDeployer`,
  // and `byFeeRecipient`. Identity matches (our seeded wallet/handle) live in the
  // latter two, so merge all groups, then dedupe by token address.
  const merged: LaunchResult[] = [
    ...(groups.byFeeRecipient?.results ?? []),
    ...(groups.byDeployer?.results ?? []),
    ...(groups.tokens?.results ?? []),
  ];
  const seen = new Set<string>();
  const out: LaunchResult[] = [];
  for (const r of merged as LaunchResult[]) {
    const ca = r?.tokenAddress;
    if (!ca || seen.has(ca)) continue;
    seen.add(ca);
    out.push(r);
  }
  return out;
}

const norm = (v?: string | null) => (v ?? "").trim().replace(/^@/, "").toLowerCase();

/**
 * Pick the launch that actually belongs to the queried identity: deployer or
 * feeRecipient must match the handle/wallet. Prefers deployed + most recent.
 */
export function pickLaunch(results: LaunchResult[], query: string): LaunchResult | null {
  const q = norm(query);
  if (!q) return null;
  const owned = results.filter((r) => {
    const ids = [
      r.deployer?.xUsername, r.feeRecipient?.xUsername,
      r.deployer?.walletAddress, r.feeRecipient?.walletAddress,
    ].map(norm);
    return ids.includes(q);
  });
  const pool = owned.length ? owned : [];
  if (!pool.length) return null;
  pool.sort((a, b) => {
    const dep = Number(b.status === "deployed") - Number(a.status === "deployed");
    if (dep) return dep;
    return (b.timestamp ?? 0) - (a.timestamp ?? 0);
  });
  return pool[0]?.tokenAddress ? pool[0] : null;
}

/** Compact view of a launch result for diagnostics. */
export function launchSummary(r: LaunchResult) {
  return {
    symbol: r.tokenSymbol ?? null,
    name: r.tokenName ?? null,
    status: r.status ?? null,
    tokenAddress: r.tokenAddress ?? null,
    deployerX: r.deployer?.xUsername ?? null,
    deployerWallet: r.deployer?.walletAddress ?? null,
    feeX: r.feeRecipient?.xUsername ?? null,
    feeWallet: r.feeRecipient?.walletAddress ?? null,
  };
}

/* ── candidate ranking for the disambiguation picker ── */
export interface RankedCandidate {
  tokenAddress: string;
  symbol: string | null;
  name: string | null;
  status: string | null;
  deployerX: string | null;
  feeX: string | null;
  identityMatch: boolean;   // deployer/fee handle or wallet equals one of the queried identities
  projectMatch: boolean;    // token name/symbol equals the project name or X handle
  bankrDeployed: boolean;   // launched via Bankr (deployer = bankrlabs)
  vol24h?: number | null;       // live volume, filled in for the picker so the active token is obvious
  marketCapUsd?: number | null;
}

/**
 * Dedupe + rank launch results.
 *  - identityMatch: deployer/fee handle or wallet equals one of the queried identities
 *  - projectMatch: token name/symbol equals the project name or project X handle
 * A single token that matches BOTH is a confident auto-pick; multiple → user disambiguates.
 */
export function rankCandidates(
  results: LaunchResult[],
  identities: string[],
  projectNames: string[] = []
): RankedCandidate[] {
  const qset = new Set(identities.map(norm).filter(Boolean));
  const pset = new Set(projectNames.map(norm).filter(Boolean));
  const seen = new Set<string>();
  const out: RankedCandidate[] = [];
  for (const r of results) {
    const ca = r.tokenAddress;
    if (!ca || seen.has(ca)) continue;
    seen.add(ca);
    const ids = [
      r.deployer?.xUsername, r.feeRecipient?.xUsername,
      r.deployer?.walletAddress, r.feeRecipient?.walletAddress,
    ].map(norm);
    const identityMatch = ids.some((id) => !!id && qset.has(id));
    const nameTokens = [r.tokenSymbol, r.tokenName].map(norm);
    const projectMatch = nameTokens.some((n) => !!n && pset.has(n));
    out.push({
      tokenAddress: ca,
      symbol: r.tokenSymbol ?? null,
      name: r.tokenName ?? null,
      status: r.status ?? null,
      deployerX: r.deployer?.xUsername ?? null,
      feeX: r.feeRecipient?.xUsername ?? null,
      identityMatch,
      projectMatch,
      bankrDeployed: norm(r.deployer?.xUsername) === "bankrlabs",
    });
  }
  out.sort((a, b) =>
    Number(b.identityMatch && b.projectMatch) - Number(a.identityMatch && a.projectMatch) ||
    Number(b.identityMatch) - Number(a.identityMatch) ||
    Number(b.projectMatch) - Number(a.projectMatch) ||
    Number(b.status === "deployed") - Number(a.status === "deployed") ||
    Number(b.bankrDeployed) - Number(a.bankrDeployed)
  );
  return out;
}

// ── Creator fees (Bankr public Doppler fees API) ──────────────────────────────
// GET /public/doppler/token-fees/{addr}?days=N → daily WETH earnings + lifetime
// totals + claimable/claimed. Unauthenticated, cached 2 min server-side. This is
// the ONLY source of fee data + any multi-day window — the discover API is 24h only.

export interface TokenFees {
  tokenAddress: string;
  symbol: string | null;
  windowDays: number;
  feesWindowWeth: number;        // summed dailyEarnings over the requested window
  lifetimeEarnedWeth: number | null;
  claimableWeth: number | null;
  claimedWeth: number | null;
  dailyEarnings: { date: string; weth: number }[];
  bestDay: { date: string; weth: number } | null;
}

export async function fetchTokenFees(ca: string, days = 7): Promise<TokenFees | null> {
  const addr = ca.trim();
  if (!isContractAddress(addr)) throw new Error("Invalid contract address (expected 0x + 40 hex chars).");
  const d = Math.min(Math.max(Math.round(days), 1), 90);
  const res = await fetch(`https://api.bankr.bot/public/doppler/token-fees/${addr}?days=${d}`, {
    headers: { accept: "application/json" },
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Fees API error (HTTP ${res.status}).`);
  const data = await res.json().catch(() => null);
  if (!data) return null;

  const num = (v: any): number => { const n = parseFloat(String(v)); return isNaN(n) ? 0 : n; };
  const daily: { date: string; weth: number }[] = Array.isArray(data.dailyEarnings)
    ? data.dailyEarnings.map((e: any) => ({ date: String(e.date), weth: num(e.weth) }))
    : [];
  const feesWindowWeth = daily.reduce((sum, e) => sum + e.weth, 0);
  const tok = Array.isArray(data.tokens) ? data.tokens[0] : null;
  const bestDay = data.lifetimeBestDay && data.lifetimeBestDay.date
    ? { date: String(data.lifetimeBestDay.date), weth: num(data.lifetimeBestDay.weth) }
    : null;

  return {
    tokenAddress: addr,
    symbol: tok?.symbol ?? null,
    windowDays: d,
    feesWindowWeth,
    lifetimeEarnedWeth: data.lifetimeEarnedWeth != null ? num(data.lifetimeEarnedWeth) : null,
    claimableWeth: data.totals?.claimableWeth != null ? num(data.totals.claimableWeth) : null,
    claimedWeth: data.totals?.claimedWeth != null ? num(data.totals.claimedWeth) : null,
    dailyEarnings: daily,
    bestDay,
  };
}
