'use client';
import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Wallet as WalletIcon, Plus, RefreshCw, ExternalLink, Copy, X, Pencil, Trash2 } from 'lucide-react';

interface Point { at: string; eth: number | null; usdc: number | null }
interface W {
  id: string; label: string; chain: string; address: string; explorer: string; active: boolean;
  team: { id: string; name: string; color: string } | null; teamId: string | null;
  ethAlert: number | null; ethClear: number | null; usdcAlert: number | null; usdcClear: number | null;
  ethState: string; usdcState: string; lastEth: number | null; lastUsdc: number | null;
  lastCheckedAt: string | null; lastError: string | null; history: Point[];
}
interface Team { id: string; name: string }

const ink = '#F0F0F0', muted = '#8A8A8A', faint = '#525252', panel = '#1A1A1A', line = 'rgba(255,255,255,0.07)', accent = '#F5A623';
const fmt = (asset: 'eth' | 'usdc', v: number | null) =>
  v == null ? '—' : asset === 'eth' ? v.toFixed(4) : v.toLocaleString('en-US', { maximumFractionDigits: 2 });
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const ago = (iso: string | null) => {
  if (!iso) return 'never';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  return s < 90 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : `${Math.round(s / 3600)} h ago`;
};

/** A 7-day line with the alert level dashed. */
function Spark({ points, asset, alert, color }: { points: Point[]; asset: 'eth' | 'usdc'; alert: number | null; color: string }) {
  const vals = points.map((p) => p[asset]).filter((v): v is number => v != null);
  if (vals.length < 2) return <div style={{ height: 44, fontSize: 11, color: faint, display: 'flex', alignItems: 'center' }}>History builds up every 5 minutes</div>;
  const lo = Math.min(...vals, alert ?? Infinity), hi = Math.max(...vals, alert ?? -Infinity);
  const span = hi - lo || 1, W = 240, H = 44;
  const y = (v: number) => H - 3 - ((v - lo) / span) * (H - 6);
  const d = vals.map((v, i) => `${i ? 'L' : 'M'}${((i / (vals.length - 1)) * W).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" role="img" aria-label={`${asset.toUpperCase()} over 7 days`}>
      {alert != null && <line x1={0} x2={W} y1={y(alert)} y2={y(alert)} stroke="#EF4444" strokeOpacity={0.5} strokeDasharray="4 4" strokeWidth={1} />}
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function AssetBlock({ w, asset }: { w: W; asset: 'eth' | 'usdc' }) {
  const alert = w[`${asset}Alert`], value = asset === 'eth' ? w.lastEth : w.lastUsdc;
  const low = w[`${asset}State`] === 'low';
  return (
    <div style={{ flex: '1 1 220px', minWidth: 0 }}>
      <div className="flex items-baseline gap-2">
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', color: faint }}>{asset.toUpperCase()}</span>
        {alert != null && (
          <span style={{ fontSize: 10.5, fontWeight: 700, padding: '1px 7px', borderRadius: 999, color: low ? '#EF4444' : '#10B981', background: low ? 'rgba(239,68,68,0.12)' : 'rgba(16,185,129,0.12)' }}>
            {low ? 'LOW' : 'OK'}
          </span>
        )}
      </div>
      <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 22, color: low ? '#EF4444' : ink, margin: '2px 0 4px', fontVariantNumeric: 'tabular-nums' }}>{fmt(asset, value)}</div>
      <Spark points={w.history} asset={asset} alert={alert} color={asset === 'eth' ? '#8B5CF6' : '#3B82F6'} />
      <div style={{ fontSize: 11.5, color: faint, marginTop: 2 }}>
        {alert == null ? 'Not watched' : `Alert below ${fmt(asset, alert)} · clears at ${fmt(asset, w[`${asset}Clear`] ?? alert * 1.25)}`}
      </div>
    </div>
  );
}

export default function Wallets() {
  const [wallets, setWallets] = useState<W[] | null>(null);
  const [chains, setChains] = useState<{ id: string; label: string }[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [editing, setEditing] = useState<W | 'new' | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const d = await fetch('/api/wallets').then((r) => r.json());
    setWallets(d.wallets ?? []); setChains(d.chains ?? []); setCanManage(!!d.canManage);
  }, []);
  useEffect(() => {
    load();
    fetch('/api/teams').then((r) => r.json()).then((d) => setTeams(d.teams ?? []));
    const iv = setInterval(() => { if (!document.hidden) load(); }, 60_000);
    return () => clearInterval(iv);
  }, [load]);

  async function checkNow(w: W) {
    setBusy(w.id);
    const res = await fetch(`/api/wallets/${w.id}/check`, { method: 'POST' });
    const d = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) toast.error('Could not read the balance', { description: d.error });
    load();
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <WalletIcon size={22} style={{ color: accent }} />
        <div style={{ flex: '1 1 260px' }}>
          <h1 style={{ fontFamily: "'Manrope', sans-serif", fontSize: 22, fontWeight: 700, color: ink }}>Wallets</h1>
          <p style={{ fontSize: 13, color: muted, marginTop: 2 }}>Balances checked every 5 minutes. A low balance alerts the wallet’s team and puts a top-up task on the board.</p>
        </div>
        {canManage && (
          <button onClick={() => setEditing('new')} className="flex items-center gap-2 rounded-lg" style={{ background: accent, color: '#0D0D0D', fontSize: 13, fontWeight: 600, padding: '9px 14px' }}>
            <Plus size={16} /> Watch a wallet
          </button>
        )}
      </div>

      {wallets === null ? <div style={{ color: faint, fontSize: 13, padding: 20 }}>Loading…</div> : wallets.length === 0 ? (
        <div className="rounded-xl" style={{ border: '1px dashed rgba(255,255,255,0.12)', padding: 40, textAlign: 'center', fontSize: 13.5, color: muted }}>
          No wallets watched yet.{canManage ? ' Add the reimbursement wallet to start getting low-balance alerts.' : ' An admin can add them.'}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {wallets.map((w) => (
            <section key={w.id} className="rounded-xl" style={{ background: panel, border: `1px solid ${w.ethState === 'low' || w.usdcState === 'low' ? 'rgba(239,68,68,0.35)' : line}`, padding: 18, opacity: w.active ? 1 : 0.6 }}>
              <div className="flex flex-wrap items-center gap-2" style={{ marginBottom: 14 }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: ink }}>{w.label}</span>
                <span style={{ fontSize: 11.5, color: muted, border: `1px solid ${line}`, borderRadius: 999, padding: '1px 8px' }}>{chains.find((c) => c.id === w.chain)?.label ?? w.chain}</span>
                {w.team && <span style={{ fontSize: 11.5, color: w.team.color, border: `1px solid ${w.team.color}55`, borderRadius: 999, padding: '1px 8px' }}>{w.team.name}</span>}
                {!w.active && <span style={{ fontSize: 11.5, color: faint }}>paused</span>}
                <span className="inline-flex items-center gap-1.5" style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12, color: muted }}>
                  {short(w.address)}
                  <button onClick={() => navigator.clipboard.writeText(w.address).then(() => toast.success('Address copied'))} aria-label="Copy address" style={{ color: faint }}><Copy size={12} /></button>
                  <a href={w.explorer} target="_blank" rel="noreferrer" aria-label="Open in block explorer" style={{ color: faint }}><ExternalLink size={12} /></a>
                </span>
                <span style={{ flex: 1 }} />
                <span title={w.lastError ?? undefined} style={{ fontSize: 12, color: w.lastError ? '#EF4444' : faint }}>
                  {w.lastError ? 'last read failed · ' : ''}checked {ago(w.lastCheckedAt)}
                </span>
                <button onClick={() => checkNow(w)} disabled={busy === w.id} aria-label="Check now" title="Check now" style={{ color: muted }}>
                  <RefreshCw size={14} className={busy === w.id ? 'animate-spin' : ''} />
                </button>
                {canManage && <button onClick={() => setEditing(w)} aria-label="Edit wallet" title="Edit" style={{ color: muted }}><Pencil size={14} /></button>}
              </div>
              <div className="flex flex-wrap gap-6">
                <AssetBlock w={w} asset="eth" />
                <AssetBlock w={w} asset="usdc" />
              </div>
            </section>
          ))}
        </div>
      )}

      {editing && (
        <WalletDialog wallet={editing === 'new' ? null : editing} chains={chains} teams={teams}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
      )}
    </div>
  );
}

function WalletDialog({ wallet, chains, teams, onClose, onSaved }: { wallet: W | null; chains: { id: string; label: string }[]; teams: Team[]; onClose: () => void; onSaved: () => void }) {
  const isNew = !wallet;
  const s = (v: number | null | undefined) => (v == null ? '' : String(v));
  const [f, setF] = useState({
    label: wallet?.label ?? 'Reimbursement wallet', chain: wallet?.chain ?? 'base', address: wallet?.address ?? '',
    teamId: wallet?.teamId ?? '', ethAlert: s(wallet?.ethAlert), ethClear: s(wallet?.ethClear),
    usdcAlert: s(wallet?.usdcAlert), usdcClear: s(wallet?.usdcClear), active: wallet?.active ?? true,
  });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f, v: string | boolean) => setF((x) => ({ ...x, [k]: v }));

  async function save() {
    setBusy(true);
    const res = await fetch(isNew ? '/api/wallets' : `/api/wallets/${wallet!.id}`, {
      method: isNew ? 'POST' : 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { toast.error(d.error ?? 'Could not save'); return; }
    if (isNew && d.check?.error) toast.warning('Saved, but the first balance read failed', { description: d.check.error });
    else toast.success(isNew ? 'Wallet added' : 'Saved');
    onSaved();
  }
  async function remove() {
    if (!window.confirm(`Stop watching ${wallet!.label}? Its balance history is deleted.`)) return;
    await fetch(`/api/wallets/${wallet!.id}`, { method: 'DELETE' });
    toast.success('Wallet removed'); onSaved();
  }

  const field: React.CSSProperties = { background: '#0D0D0D', border: `1px solid ${line}`, borderRadius: 8, color: ink, fontSize: 13, padding: '8px 10px', width: '100%', outline: 'none' };
  const label: React.CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: faint, marginBottom: 5, display: 'block' };
  return (
    <div role="dialog" aria-modal="true" aria-label={isNew ? 'Watch a wallet' : 'Edit wallet'} onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200, display: 'grid', placeItems: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} className="rounded-xl" style={{ background: panel, border: `1px solid ${line}`, width: 'min(520px, 100%)', maxHeight: '90vh', overflow: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="flex items-center">
          <h2 style={{ fontSize: 16, fontWeight: 700, color: ink, flex: 1 }}>{isNew ? 'Watch a wallet' : `Edit ${wallet!.label}`}</h2>
          {!isNew && <button onClick={remove} aria-label="Remove wallet" style={{ color: faint, marginRight: 10 }}><Trash2 size={16} /></button>}
          <button onClick={onClose} aria-label="Close" style={{ color: faint }}><X size={18} /></button>
        </div>
        <div><span style={label}>Name</span><input value={f.label} onChange={(e) => set('label', e.target.value)} style={field} /></div>
        {isNew && (
          <div className="grid gap-3" style={{ gridTemplateColumns: '140px 1fr' }}>
            <div>
              <span style={label}>Chain</span>
              <select value={f.chain} onChange={(e) => set('chain', e.target.value)} style={field}>{chains.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select>
            </div>
            <div><span style={label}>Address</span><input value={f.address} onChange={(e) => set('address', e.target.value.trim())} placeholder="0x…" style={{ ...field, fontFamily: 'ui-monospace, monospace' }} /></div>
          </div>
        )}
        <div>
          <span style={label}>Team to alert</span>
          <select value={f.teamId} onChange={(e) => set('teamId', e.target.value)} style={field}>
            <option value="">Just me</option>
            {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <div><span style={label}>ETH alert below</span><input inputMode="decimal" value={f.ethAlert} onChange={(e) => set('ethAlert', e.target.value)} placeholder="e.g. 0.05 (blank = off)" style={field} /></div>
          <div><span style={label}>ETH clears at</span><input inputMode="decimal" value={f.ethClear} onChange={(e) => set('ethClear', e.target.value)} placeholder="default 1.25 × alert" style={field} /></div>
          <div><span style={label}>USDC alert below</span><input inputMode="decimal" value={f.usdcAlert} onChange={(e) => set('usdcAlert', e.target.value)} placeholder="e.g. 500 (blank = off)" style={field} /></div>
          <div><span style={label}>USDC clears at</span><input inputMode="decimal" value={f.usdcClear} onChange={(e) => set('usdcClear', e.target.value)} placeholder="default 1.25 × alert" style={field} /></div>
        </div>
        {!isNew && (
          <label className="flex items-center gap-2" style={{ fontSize: 13, color: muted }}>
            <input type="checkbox" checked={f.active} onChange={(e) => set('active', e.target.checked)} /> Watching (untick to pause checks)
          </label>
        )}
        <p style={{ fontSize: 12, color: faint, lineHeight: 1.5 }}>An alert fires after two readings in a row below the line (10 minutes), and clears only once the balance is back at the clear level, so a wobble around the line doesn’t spam anyone.</p>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg" style={{ color: muted, fontSize: 13, padding: '8px 14px' }}>Cancel</button>
          <button onClick={save} disabled={busy} className="rounded-lg" style={{ background: accent, color: '#0D0D0D', fontSize: 13, fontWeight: 600, padding: '8px 16px', opacity: busy ? 0.5 : 1 }}>
            {busy ? 'Saving…' : isNew ? 'Watch wallet' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
