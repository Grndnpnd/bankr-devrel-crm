/**
 * Wallet balance watch. Every cron tick (5 min) reads native ETH + USDC for each active
 * wallet over JSON-RPC, stores a reading, and runs a small state machine per asset:
 *   - below the alert level for 2 readings in a row → "low": notify the wallet's team
 *     (and whoever added it) and open an urgent "Top up" task;
 *   - back at or above the clear level (default 1.25 × alert) → "ok": notify, close the task.
 * An RPC error is "unknown", never zero: it records the error and changes no state.
 *
 * RPC: BASE_RPC_URL / ETH_RPC_URL if set, else Alchemy when ALCHEMY_API_KEY is set, else
 * the chain's free public endpoint (fine for a few wallets every 5 minutes).
 */
import { prisma } from '@/lib/prisma';
import { notify, teamMemberIds } from '@/lib/notify';
import { createTask, updateTask, SYSTEM } from '@/lib/tasks';

export interface ChainDef { id: string; label: string; usdc: string; explorer: string; rpc: () => string }

const alchemy = (net: string) => (process.env.ALCHEMY_API_KEY ? `https://${net}.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}` : null);

export const CHAINS: Record<string, ChainDef> = {
  base: {
    id: 'base', label: 'Base', explorer: 'https://basescan.org/address/',
    usdc: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
    rpc: () => process.env.BASE_RPC_URL || alchemy('base-mainnet') || 'https://mainnet.base.org',
  },
  ethereum: {
    id: 'ethereum', label: 'Ethereum', explorer: 'https://etherscan.io/address/',
    usdc: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
    rpc: () => process.env.ETH_RPC_URL || alchemy('eth-mainnet') || 'https://ethereum-rpc.publicnode.com',
  },
};

export const isAddress = (a: string) => /^0x[0-9a-fA-F]{40}$/.test(a);

async function rpc(url: string, method: string, params: unknown[]) {
  const res = await fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`RPC ${res.status}`);
  const d = await res.json();
  if (d.error) throw new Error(`RPC ${d.error.code}: ${d.error.message}`);
  if (typeof d.result !== 'string') throw new Error('RPC returned no result');
  return d.result as string;
}

const toUnits = (hex: string, decimals: number) => {
  const v = BigInt(hex === '0x' ? '0x0' : hex);
  const base = 10n ** BigInt(decimals);
  return Number(v / base) + Number(v % base) / Number(base);
};

/** Read ETH and USDC balances. Throws on any RPC failure. */
export async function readBalances(chain: string, address: string): Promise<{ eth: number; usdc: number }> {
  const c = CHAINS[chain];
  if (!c) throw new Error(`unknown chain ${chain}`);
  const url = c.rpc();
  const data = '0x70a08231' + address.toLowerCase().replace(/^0x/, '').padStart(64, '0'); // balanceOf(address)
  const [eth, usdc] = await Promise.all([
    rpc(url, 'eth_getBalance', [address, 'latest']),
    rpc(url, 'eth_call', [{ to: c.usdc, data }, 'latest']),
  ]);
  return { eth: toUnits(eth, 18), usdc: toUnits(usdc, 6) };
}

export const fmtAsset = (asset: 'eth' | 'usdc', v: number | null | undefined) =>
  v == null ? '—' : asset === 'eth' ? `${v.toFixed(4)} ETH` : `${v.toLocaleString('en-US', { maximumFractionDigits: 2 })} USDC`;

type Asset = 'eth' | 'usdc';
type WalletRow = NonNullable<Awaited<ReturnType<typeof prisma.wallet.findUnique>>>;

/** Check one wallet: read, store, step the alert state machine. */
export async function checkWallet(w: WalletRow) {
  let reading: { eth: number; usdc: number };
  try {
    reading = await readBalances(w.chain, w.address);
  } catch (e: any) {
    await prisma.wallet.update({ where: { id: w.id }, data: { lastError: String(e?.message ?? e).slice(0, 300), lastCheckedAt: new Date() } });
    return { id: w.id, error: e?.message };
  }
  await prisma.walletReading.create({ data: { walletId: w.id, eth: reading.eth, usdc: reading.usdc } });

  const update: Record<string, unknown> = { lastEth: reading.eth, lastUsdc: reading.usdc, lastError: null, lastCheckedAt: new Date() };
  const events: { asset: Asset; to: 'low' | 'ok'; value: number; alert: number }[] = [];
  for (const asset of ['eth', 'usdc'] as Asset[]) {
    const alert = w[`${asset}Alert`];
    if (alert == null) continue;
    const clear = w[`${asset}Clear`] ?? alert * 1.25;
    const value = reading[asset];
    const state = w[`${asset}State`];
    const below = w[`${asset}Below`];
    if (value < alert) {
      update[`${asset}Below`] = below + 1;
      if (state === 'ok' && below + 1 >= 2) { update[`${asset}State`] = 'low'; events.push({ asset, to: 'low', value, alert }); }
    } else {
      update[`${asset}Below`] = 0;
      if (state === 'low' && value >= clear) { update[`${asset}State`] = 'ok'; events.push({ asset, to: 'ok', value, alert }); }
    }
  }
  await prisma.wallet.update({ where: { id: w.id }, data: update });
  for (const ev of events) await announce(w, ev);
  return { id: w.id, eth: reading.eth, usdc: reading.usdc, events: events.map((e) => `${e.asset}:${e.to}`) };
}

async function announce(w: WalletRow, ev: { asset: Asset; to: 'low' | 'ok'; value: number; alert: number }) {
  const who = new Set<string>(w.teamId ? await teamMemberIds(w.teamId) : []);
  if (w.createdById) who.add(w.createdById);
  const name = ev.asset.toUpperCase();
  const ref = `${w.id}:${ev.asset}`;
  if (ev.to === 'low') {
    const { task } = await createTask(SYSTEM, {
      title: `Top up ${w.label}: ${name} at ${fmtAsset(ev.asset, ev.value)}`,
      body: `${w.label} (${CHAINS[w.chain]?.label ?? w.chain} ${w.address}) is below its ${fmtAsset(ev.asset, ev.alert)} alert level.\n${CHAINS[w.chain]?.explorer ?? ''}${w.address}`,
      teamId: w.teamId, priority: 0, source: 'wallet', sourceRef: `${ref}:${Date.now()}`,
      sourceUrl: `${CHAINS[w.chain]?.explorer ?? ''}${w.address}`,
    }, { silent: true });
    await notify({
      userIds: [...who], kind: 'wallet.low', url: `/tasks?task=${task.id}`,
      title: `${w.label} is low on ${name}: ${fmtAsset(ev.asset, ev.value)}`,
      body: `Alert level ${fmtAsset(ev.asset, ev.alert)} · a top-up task is on the board`,
    });
  } else {
    // Close the open top-up task(s) for this asset.
    const open = await prisma.task.findMany({ where: { source: 'wallet', sourceRef: { startsWith: `${ref}:` }, status: { not: 'DONE' } }, select: { id: true } });
    for (const t of open) await updateTask(SYSTEM, t.id, { status: 'DONE' });
    await notify({
      userIds: [...who], kind: 'wallet.low', url: '/wallets',
      title: `${w.label} ${name} is back to ${fmtAsset(ev.asset, ev.value)}`,
      body: open.length ? 'The top-up task was closed.' : null,
    });
  }
}

/** Cron: check every active wallet, then drop readings older than 30 days. */
export async function checkAllWallets() {
  const wallets = await prisma.wallet.findMany({ where: { active: true } });
  const results = [];
  for (const w of wallets) results.push(await checkWallet(w));
  await prisma.walletReading.deleteMany({ where: { at: { lt: new Date(Date.now() - 30 * 86400_000) } } });
  return { checked: wallets.length, results };
}
