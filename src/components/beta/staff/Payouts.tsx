'use client';
import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Copy, Plus, Trash2 } from 'lucide-react';
import { LABEL, txUrl } from '@/lib/betaModel';
import { accent, api, card, copy, type Ctx, day, Empty, faint, field, ink, line, linkBtn, muted, panel, primaryBtn, SectionHead, short, td, th } from './ui';

export default function Payouts({ ctx }: { ctx: Ctx }) {
  const [data, setData] = useState<{ payouts: any[]; queue: any[] } | null>(null);
  const canManage = ctx.data.canManage;
  const load = useCallback(async () => {
    const d = await fetch(`/api/beta/programs/${ctx.programId}/payouts`).then((r) => r.json()).catch(() => ({}));
    setData({ payouts: d.payouts ?? [], queue: d.queue ?? [] });
  }, [ctx.programId]);
  useEffect(() => { load(); }, [load, ctx.ver]);

  if (!data) return <div style={{ color: faint, fontSize: 13 }}>Loading…</div>;
  const totals: Record<string, number> = {};
  for (const x of data.payouts) totals[x.token] = (totals[x.token] ?? 0) + x.amount;

  return (
    <div className="flex flex-col gap-5">
      <div style={{ ...card, padding: 16 }}>
        <SectionHead title="Waiting for test funds" count={data.queue.length} hint="Testers who said yes to test funds and haven’t been sent them yet. Send from your wallet, then log it here." />
        {data.queue.length === 0 ? <div style={{ fontSize: 13, color: muted }}>Nobody is waiting on test funds.</div> : (
          <div className="flex flex-col" style={{ maxHeight: 300, overflowY: 'auto' }}>
            {data.queue.map((t) => (
              <div key={t.id} className="flex flex-wrap items-center gap-3" style={{ padding: '8px 0', borderTop: `1px solid ${line}`, fontSize: 13 }}>
                <span style={{ color: ink, minWidth: 140 }}>{t.name}</span>
                {t.walletAddress
                  ? <button onClick={() => copy(t.walletAddress, 'Wallet copied')} className="bp-tap inline-flex items-center gap-1" title={t.walletAddress} style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12, color: muted }}>{short(t.walletAddress, 8)} <Copy size={11} /></button>
                  : <span style={{ fontSize: 12, color: accent }}>No wallet yet{t.channel ? ` — ask on ${LABEL.channel[t.channel]}` : ''}</span>}
                <span style={{ flex: 1 }} />
                {!t.walletAddress && <button className="bp-tap" onClick={() => ctx.newOutreach({ testerId: t.id, type: 'funds', title: `Get ${t.name}'s wallet address`, message: `Hi ${t.name.split(' ')[0]}! To send your test funds we need a wallet address — which one should we use?` })} style={linkBtn}>Ask for wallet</button>}
                {canManage && t.walletAddress && <button className="bp-tap" onClick={() => ctx.newPayout({ testerId: t.id, reason: 'test_funds' })} style={linkBtn}>I sent their funds</button>}
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <SectionHead title="Payouts" count={data.payouts.length}
          right={<>
            {Object.keys(totals).length > 0 && <span style={{ fontSize: 12.5, color: muted }}>Total: {Object.entries(totals).map(([t, a]) => `${+a.toFixed(4)} ${t}`).join(' + ')}</span>}
            {canManage && <button onClick={() => ctx.newPayout()} className="bp-tap inline-flex items-center gap-1.5" style={primaryBtn}><Plus size={14} /> Log a payout</button>}
          </>} />
        {data.payouts.length === 0 ? <Empty>No payouts logged yet. Bug rewards, thank-yous and test funds all go here.</Empty> : (
          <div className="rounded-xl" style={{ border: `1px solid ${line}`, maxHeight: '60vh', overflow: 'auto' }}>
            <table style={{ width: '100%', minWidth: 820, borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr style={{ position: 'sticky', top: 0, background: panel }}>{['Sent', 'Tester', 'Reason', 'Amount', 'Transaction', 'Report', 'By', ''].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
              <tbody>{data.payouts.map((x) => <Row key={x.id} x={x} ctx={ctx} canManage={canManage} onChange={load} />)}</tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ x, ctx, canManage, onChange }: { x: any; ctx: Ctx; canManage: boolean; onChange: () => void }) {
  const [tx, setTx] = useState('');
  const [editing, setEditing] = useState(false);
  async function saveTx() {
    if (await api(`/api/beta/payouts/${x.id}`, 'PATCH', { tx: tx.trim() || null })) { toast.success('Tx saved'); setEditing(false); onChange(); }
  }
  async function remove() {
    if (!window.confirm(`Delete this ${x.amount} ${x.token} payout to ${x.tester.name}? Only the record goes — nothing is sent or returned.`)) return;
    if (await api(`/api/beta/payouts/${x.id}`, 'DELETE')) { onChange(); ctx.reload(); }
  }
  const link = x.txUrl ?? txUrl(x.tx);
  return (
    <tr>
      <td style={{ ...td, color: faint, whiteSpace: 'nowrap' }}>{day(x.sentAt)}</td>
      <td style={{ ...td, color: ink }}>{x.tester.name}</td>
      <td style={{ ...td, color: muted }} title={x.notes ?? undefined}>{LABEL.reason[x.reason]}{x.notes ? ' ·' : ''}{x.notes && <span style={{ color: faint }}> {x.notes.slice(0, 40)}{x.notes.length > 40 ? '…' : ''}</span>}</td>
      <td style={{ ...td, color: ink, fontFamily: 'ui-monospace, monospace', whiteSpace: 'nowrap' }}>{+x.amount.toFixed(6)} {x.token}</td>
      <td style={{ ...td, whiteSpace: 'nowrap' }}>
        {editing ? (
          <span className="inline-flex items-center gap-1">
            <input value={tx} onChange={(e) => setTx(e.target.value)} placeholder="e.g. 0x… or explorer link" autoFocus aria-label="Transaction" style={{ ...field, padding: '4px 6px', width: 200, fontFamily: 'ui-monospace, monospace', fontSize: 12 }} />
            <button className="bp-tap" onClick={saveTx} style={linkBtn}>Save</button>
          </span>
        ) : link ? <a href={link} target="_blank" rel="noreferrer" style={{ color: accent, fontFamily: 'ui-monospace, monospace', fontSize: 12 }}>{short(x.tx, 6)}</a>
          : x.tx ? <span title={x.tx} style={{ color: muted, fontSize: 12 }}>{short(x.tx, 6)}</span>
          : canManage ? <button className="bp-tap" onClick={() => setEditing(true)} style={{ ...linkBtn, fontSize: 12 }}>Add transaction</button> : <span style={{ color: faint }}>—</span>}
      </td>
      <td style={{ ...td, maxWidth: 200 }}>{x.report ? <button className="bp-tap" onClick={() => ctx.openReport(x.report.id)} style={{ ...linkBtn, fontSize: 12, textAlign: 'left' }}>{x.report.title}</button> : <span style={{ color: faint }}>—</span>}</td>
      <td style={{ ...td, color: faint }}>{x.sentBy ?? '—'}</td>
      <td style={{ ...td, textAlign: 'right' }}>{canManage && <button className="bp-tap" onClick={remove} aria-label="Delete payout" style={{ color: faint }}><Trash2 size={13} /></button>}</td>
    </tr>
  );
}
