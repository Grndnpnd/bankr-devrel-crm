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
