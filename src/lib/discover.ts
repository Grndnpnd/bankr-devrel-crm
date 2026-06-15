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
  return (data?.groups?.tokens?.results ?? []) as LaunchResult[];
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
