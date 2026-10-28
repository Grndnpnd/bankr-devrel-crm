'use client';
import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ExternalLink, RefreshCw, AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';

const ink = '#F0F0F0', muted = '#8A8A8A', faint = '#525252', line = 'rgba(255,255,255,0.07)', accent = '#F5A623';
const field: React.CSSProperties = { background: '#0D0D0D', border: `1px solid ${line}`, borderRadius: 8, color: ink, fontSize: 13, padding: '7px 9px', width: '100%', outline: 'none' };
const ago = (iso: string | null) => {
  if (!iso) return 'never';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  return s < 90 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : `${Math.round(s / 86400)} d ago`;
};

interface FieldDef { key: string; label: string; canon: string; types: string[]; options: [string, string][] | null; pushOnly: boolean; target: string | null }
interface Board { kind: string; title: string | null; url: string | null; enabled: boolean; mapping: Record<string, { property: string; type: string; options?: Record<string, string> }>; scope: { property: string; value: string } | null; lastPullAt: string | null; lastPushAt: string | null; lastError: string | null }
interface Data {
  configured: boolean; kinds: { kind: string; label: string }[]; boards: Board[]; fields: Record<string, FieldDef[]>;
  counts: Record<string, { linked: number; waiting: number; failing: number }>;
}
const HINT: Record<string, string> = {
  testers: 'One row per tester. Status, type, usage, funds, channel and handles, wallet, test areas, check-ins.',
  reports: 'Every report a tester files lands here automatically; triage edits made in Notion come back.',
  outreach: 'Messages to testers and their answers. A shared board is fine: pick this program’s value of its Program column.',
  payouts: 'Funds and rewards sent to testers. Shared boards work the same way as outreach.',
  calls: 'Feedback calls and who was on them.',
};

/** Settings → Notion: connect a board per kind, see sync health, adjust the field mapping. */
export default function NotionBoards({ programId, canManage }: { programId: string; canManage: boolean }) {
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const load = useCallback(async () => {
    const res = await fetch(`/api/beta/programs/${programId}/notion`).catch(() => null);
    const j = await res?.json().catch(() => null);
    if (!res?.ok) { setErr(j?.error ?? 'Couldn’t load Notion settings.'); return; }
    setD(j); setErr(null);
  }, [programId]);
  useEffect(() => { load(); }, [load]);

  async function syncNow() {
    setSyncing(true);
    const res = await fetch(`/api/beta/programs/${programId}/notion/sync`, { method: 'POST' }).catch(() => null);
    const j = await res?.json().catch(() => ({}));
    setSyncing(false);
    if (!res?.ok) { toast.error(j?.error ?? 'Sync failed'); return; }
    if (j.skipped) toast.message(`Not synced: ${j.skipped}`);
    else toast.success(`Synced — ${j.imported} imported, ${j.pulled} updated from Notion, ${j.created + j.pushed} written to Notion${j.errors?.length ? `, ${j.errors.length} problem(s)` : ''}`);
    load();
  }

  if (err) return <p style={{ fontSize: 12.5, color: faint }}>{err}</p>;
  if (!d) return <p style={{ fontSize: 12.5, color: faint }}>Loading…</p>;
  if (!d.configured) {
    return (
      <div style={{ fontSize: 13, color: muted, lineHeight: 1.6 }}>
        <p style={{ margin: '0 0 6px' }}>Notion isn’t connected yet. To connect it:</p>
        <ol style={{ margin: 0, paddingLeft: 18 }}>
          <li>In Notion, go to Settings → Connections → Develop or manage integrations, and create an <b style={{ color: ink }}>internal</b> integration for the workspace.</li>
          <li>Give it Read, Update and Insert content, and “Read user information including email addresses” (so “Waiting on” and other people fields line up with CRM users).</li>
          <li>On each board (Testers, Feedback, Outreach, Payouts, Calls): “…” → Connections → add the integration.</li>
          <li>Send the integration’s secret to whoever runs the CRM, to set as NOTION_TOKEN.</li>
        </ol>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span style={{ fontSize: 12.5, color: muted, flex: 1, minWidth: 220 }}>Changes flow both ways every 5 minutes (new reports right away). If both sides change the same field in between, Notion’s edit wins.</span>
        <button onClick={syncNow} disabled={syncing || !d.boards.length} className="inline-flex items-center gap-1.5 rounded-lg" style={{ fontSize: 12.5, color: ink, border: `1px solid ${line}`, padding: '6px 10px', opacity: syncing || !d.boards.length ? 0.5 : 1 }}>
          <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} /> {syncing ? 'Syncing…' : 'Sync now'}
        </button>
      </div>
      {d.kinds.map(({ kind, label }) => {
        const b = d.boards.find((x) => x.kind === kind);
        const c = d.counts[kind];
        return (
          <div key={kind} className="rounded-lg" style={{ border: `1px solid ${line}`, padding: '10px 12px' }}>
            <div className="flex flex-wrap items-center gap-2">
              <span style={{ fontSize: 13.5, fontWeight: 600, color: ink, minWidth: 120 }}>{label}</span>
              {b ? (
                <>
                  <a href={b.url ?? '#'} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1" style={{ fontSize: 12.5, color: accent }}>{b.title ?? 'Notion board'} <ExternalLink size={11} /></a>
                  {b.scope && <span style={{ fontSize: 12, color: faint }}>· only “{b.scope.value}” rows ({b.scope.property})</span>}
                  {!b.enabled && <span style={{ fontSize: 12, color: faint }}>· paused</span>}
                  {b.lastError && <span title={b.lastError} style={{ color: '#EF4444', display: 'inline-flex' }} aria-label="Sync problem"><AlertTriangle size={14} /></span>}
                  <span style={{ flex: 1 }} />
                  <span title={`Last pulled ${ago(b.lastPullAt)}, last pushed ${ago(b.lastPushAt)}${c?.failing ? ` · ${c.failing} record(s) failing` : ''}`} style={{ fontSize: 12, color: faint }}>
                    {c?.linked ?? 0} linked{c?.waiting ? ` · ${c.waiting} to send` : ''} · {ago(b.lastPullAt)}
                  </span>
                  <button onClick={() => setOpen(open === kind ? null : kind)} className="inline-flex items-center gap-1" style={{ fontSize: 12.5, color: muted }}>
                    {open === kind ? <ChevronDown size={13} /> : <ChevronRight size={13} />} Fields
                  </button>
                  {canManage && <button onClick={async () => {
                    if (!window.confirm(`Disconnect the ${label} board? Nothing is deleted in Notion or here; they just stop updating each other.`)) return;
                    await fetch(`/api/beta/programs/${programId}/notion?kind=${kind}`, { method: 'DELETE' }); toast.success('Disconnected'); load();
                  }} style={{ fontSize: 12.5, color: faint }}>Disconnect</button>}
                </>
              ) : canManage ? <Connect programId={programId} kind={kind} onDone={load} /> : <span style={{ fontSize: 12.5, color: faint }}>Not connected</span>}
            </div>
            {!b && <p style={{ fontSize: 12, color: faint, margin: '6px 0 0' }}>{HINT[kind]}</p>}
            {b && open === kind && <MappingEditor programId={programId} board={b} fields={d.fields[kind]} canManage={canManage} onSaved={load} />}
          </div>
        );
      })}
    </div>
  );
}

function Connect({ programId, kind, onDone }: { programId: string; kind: string; onDone: () => void }) {
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function go() {
    if (busy) return;
    if (!link.trim()) { setErr('Paste the board’s link from Notion first (Share → Copy link).'); return; }
    setBusy(true); setErr(null);
    const res = await fetch(`/api/beta/programs/${programId}/notion`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, link }) }).catch(() => null);
    const j = await res?.json().catch(() => ({}));
    setBusy(false);
    if (!res?.ok) { setErr(j?.error ?? 'Couldn’t reach the server — check your connection.'); return; }
    toast.success(j.unmapped?.length ? `Connected. Not on this board: ${j.unmapped.join(', ')}. Importing its rows now.` : 'Connected — importing its rows now');
    setLink(''); onDone();
  }
  return (
    <div className="flex flex-col gap-1" style={{ flex: '1 1 260px', minWidth: 0 }}>
      <div className="flex items-center gap-2">
        <input value={link} onChange={(e) => { setLink(e.target.value); setErr(null); }} placeholder="Paste the board’s Notion link" aria-label={`Notion link for ${kind}`} style={field} />
        <button onClick={go} disabled={busy} className="rounded-lg" style={{ background: accent, color: '#0D0D0D', fontSize: 12.5, fontWeight: 600, padding: '7px 12px', whiteSpace: 'nowrap', opacity: busy ? 0.6 : 1 }}>{busy ? 'Connecting…' : 'Connect'}</button>
      </div>
      {err && <div role="alert" style={{ fontSize: 12, color: '#EF4444', overflowWrap: 'anywhere' }}>{err}</div>}
    </div>
  );
}

function MappingEditor({ programId, board, fields, canManage, onSaved }: { programId: string; board: Board; fields: FieldDef[]; canManage: boolean; onSaved: () => void }) {
  const [schema, setSchema] = useState<{ name: string; type: string; options: string[] | null }[] | null>(null);
  const [map, setMap] = useState(board.mapping);
  const [scope, setScope] = useState(board.scope ?? { property: '', value: '' });
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    fetch(`/api/beta/programs/${programId}/notion?schema=${board.kind}`).then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error); setSchema(j.schema ?? []); }).catch((e) => setErr(e.message));
  }, [programId, board.kind]);
  if (err) return <p style={{ fontSize: 12, color: '#EF4444', marginTop: 8 }}>{err}</p>;
  if (!schema) return <p style={{ fontSize: 12, color: faint, marginTop: 8 }}>Reading the board…</p>;
  const dis = !canManage;
  async function save() {
    const res = await fetch(`/api/beta/programs/${programId}/notion`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: board.kind, mapping: map, scope: scope.property && scope.value ? scope : null }) });
    if (res.ok) { toast.success('Mapping saved'); onSaved(); } else toast.error('Could not save');
  }
  const selects = schema.filter((p) => ['select', 'status', 'multi_select'].includes(p.type));
  return (
    <div className="flex flex-col gap-2" style={{ marginTop: 10 }}>
      <div style={{ maxHeight: 420, overflow: 'auto', border: `1px solid ${line}`, borderRadius: 8 }}>
        <table style={{ width: '100%', minWidth: 520, borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead><tr style={{ position: 'sticky', top: 0, background: '#1A1A1A' }}>
            {['CRM field', 'Notion property', ''].map((h) => <th key={h} style={{ textAlign: 'left', padding: '7px 10px', color: faint, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: `1px solid ${line}` }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {fields.map((f) => {
              const m = map[f.key];
              const prop = schema.find((p) => p.name === m?.property);
              const choices = schema.filter((p) => f.types.includes(p.type));
              return (
                <tr key={f.key}>
                  <td style={{ padding: '6px 10px', color: ink, borderBottom: `1px solid ${line}`, verticalAlign: 'top' }}>{f.label}{f.pushOnly && <span style={{ color: faint }} title="Written by the CRM; not read back"> · out</span>}</td>
                  <td style={{ padding: '6px 10px', borderBottom: `1px solid ${line}`, verticalAlign: 'top' }}>
                    <select disabled={dis} value={m?.property ?? ''} onChange={(e) => {
                      const p = schema.find((x) => x.name === e.target.value);
                      setMap((x) => { const n = { ...x }; if (!p) delete n[f.key]; else n[f.key] = { property: p.name, type: p.type, ...(f.options && p.options ? { options: Object.fromEntries(f.options.map(([v, l]) => [v, p.options!.find((o) => o.toLowerCase() === l.toLowerCase()) ?? l])) } : {}) }; return n; });
                    }} style={field}>
                      <option value="">Not synced</option>
                      {choices.map((p) => <option key={p.name} value={p.name}>{p.name} ({p.type.replace('_', ' ')})</option>)}
                    </select>
                    {f.options && m?.options && prop?.options && (
                      <div className="grid gap-1" style={{ gridTemplateColumns: 'max-content 1fr', marginTop: 6, alignItems: 'center' }}>
                        {f.options.map(([v, l]) => (
                          <React.Fragment key={v}>
                            <span style={{ color: muted, paddingRight: 8 }}>{l}</span>
                            <select disabled={dis} value={m.options?.[v] ?? ''} onChange={(e) => setMap((x) => ({ ...x, [f.key]: { ...x[f.key], options: { ...x[f.key].options, [v]: e.target.value } } }))} style={{ ...field, padding: '4px 6px' }}>
                              {prop.type !== 'status' && !prop.options!.includes(l) && <option value={l}>Create “{l}”</option>}
                              <option value="">Leave blank</option>
                              {prop.options!.map((o) => <option key={o} value={o}>{o}</option>)}
                            </select>
                          </React.Fragment>
                        ))}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '6px 10px', borderBottom: `1px solid ${line}`, color: faint, fontSize: 11.5, verticalAlign: 'top' }}>{f.target ? `→ ${f.target} board` : ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {(board.kind === 'outreach' || board.kind === 'payouts') && (
        <div className="flex flex-wrap items-center gap-2" style={{ fontSize: 12.5, color: muted }}>
          Shared board — only rows where
          <select disabled={dis} value={scope.property} onChange={(e) => setScope({ property: e.target.value, value: '' })} style={{ ...field, width: 'auto' }}>
            <option value="">(not shared)</option>
            {selects.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
          </select>
          {scope.property && <>is
            <select disabled={dis} value={scope.value} onChange={(e) => setScope((x) => ({ ...x, value: e.target.value }))} style={{ ...field, width: 'auto' }}>
              <option value="">pick…</option>
              {(selects.find((p) => p.name === scope.property)?.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
            </select></>}
        </div>
      )}
      {canManage && <div className="flex justify-end"><button onClick={save} className="rounded-lg" style={{ background: accent, color: '#0D0D0D', fontSize: 12.5, fontWeight: 600, padding: '7px 14px' }}>Save mapping</button></div>}
    </div>
  );
}
