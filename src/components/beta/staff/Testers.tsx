'use client';
import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Copy, Download, Plus } from 'lucide-react';
import { CHANNELS, LABEL, SEND_FUNDS, STAGES, TESTER_TYPES, TESTING_STAGES, USAGE } from '@/lib/betaModel';
import { accent, api, Chips, copy, type Ctx, day, Empty, faint, Field, field, grid, ink, line, linkBtn, Modal, muted, panel, primaryBtn, Select, short, td, th } from './ui';

const STALE_DAYS = 5;

export default function Testers({ ctx }: { ctx: Ctx }) {
  const [rows, setRows] = useState<any[] | null>(null);
  const [questions, setQuestions] = useState<{ id: string; label: string }[]>([]);
  const [q, setQ] = useState('');
  const [stage, setStage] = useState('');
  const [showRemoved, setShowRemoved] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const canManage = ctx.data.canManage;
  const load = useCallback(async () => {
    const d = await fetch(`/api/beta/programs/${ctx.programId}/testers`).then((r) => r.json()).catch(() => ({}));
    setRows(d.testers ?? []); setQuestions(d.questions ?? []);
  }, [ctx.programId]);
  useEffect(() => { load(); }, [load, ctx.ver]);

  async function patch(t: any, body: Record<string, unknown>, msg?: string) {
    setRows((rs) => rs?.map((x) => (x.id === t.id ? { ...x, ...body, ...(body.checkIn ? { lastCheckInAt: new Date().toISOString() } : {}) } : x)) ?? rs);
    if (await api(`/api/beta/testers/${t.id}`, 'PATCH', body)) { if (msg) toast.success(msg); ctx.reload(); } else load();
  }
  async function setStatus(t: any, status: string) {
    if (status === 'removed' && !window.confirm(`Remove ${t.name}? They’re marked Declined, their links stop working, and their reports stay.`)) return;
    if (await api(`/api/beta/testers/${t.id}`, 'PATCH', { status })) { load(); ctx.reload(); }
  }
  async function link(t: any, action: 'link' | 'reset') {
    if (action === 'reset' && !window.confirm(`Sign ${t.name} out on every device? Their saved link and any others stop working; you get one new link to send them.`)) return;
    const d = await api<{ url: string }>(`/api/beta/testers/${t.id}`, 'POST', { action });
    if (!d) return;
    await navigator.clipboard.writeText(d.url).catch(() => {});
    window.prompt(`New sign-in link for ${t.name} (copied). Send it to them directly — anyone with it can post as them.`, d.url);
  }

  if (!rows) return <div style={{ color: faint, fontSize: 13 }}>Loading…</div>;
  const needle = q.trim().toLowerCase();
  const order = STAGES.map(([v]) => v);
  const shown = rows
    .filter((t) => showRemoved || t.status === 'active')
    .filter((t) => !stage || t.stage === stage)
    .filter((t) => !needle || `${t.name} ${t.email ?? ''} ${t.handle ?? ''} ${t.walletAddress ?? ''} ${t.platform ?? ''}`.toLowerCase().includes(needle))
    .sort((a, b) => Number(a.status !== 'active') - Number(b.status !== 'active') || order.indexOf(a.stage) - order.indexOf(b.stage) || a.name.localeCompare(b.name));
  const removed = rows.filter((t) => t.status !== 'active').length;
  const inline: React.CSSProperties = { ...field, padding: '4px 6px', fontSize: 12.5, width: 'auto', maxWidth: 140 };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2" style={{ marginBottom: 10 }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email, handle, wallet" aria-label="Search testers" style={{ ...field, width: 'min(260px, 100%)' }} />
        <select value={stage} onChange={(e) => setStage(e.target.value)} aria-label="Stage" style={{ ...field, width: 'auto' }}><option value="">Every stage</option>{STAGES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        {removed > 0 && <label className="inline-flex items-center gap-1.5" style={{ fontSize: 12.5, color: muted }}><input type="checkbox" checked={showRemoved} onChange={(e) => setShowRemoved(e.target.checked)} /> Show declined ({removed})</label>}
        <span style={{ flex: 1 }} />
        <a href={`/api/beta/programs/${ctx.programId}/testers?format=csv`} className="inline-flex items-center gap-1.5 rounded-lg" style={{ fontSize: 12.5, color: muted, border: `1px solid ${line}`, padding: '6px 10px' }}><Download size={13} /> CSV</a>
        {canManage && <button onClick={() => setAdding(true)} className="inline-flex items-center gap-1.5" style={primaryBtn}><Plus size={14} /> Add a tester</button>}
      </div>
      {rows.length === 0 ? <Empty>No testers yet. Share the join link above, or add people yourself.</Empty> : shown.length === 0 ? <div style={{ fontSize: 13, color: muted }}>Nobody matches.</div> : (
        <div className="rounded-xl" style={{ border: `1px solid ${line}`, maxHeight: '66vh', overflow: 'auto' }}>
          <table style={{ width: '100%', minWidth: 1080, borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ position: 'sticky', top: 0, background: panel, zIndex: 1 }}>
              {['Tester', 'Stage', 'Type', 'Reach them on', 'Usage', 'Send funds', 'Paid', 'Wallet', 'Last check-in', 'Reports', ''].map((h) => <th key={h} style={th}>{h}</th>)}
            </tr></thead>
            <tbody>
              {shown.map((t) => {
                const stale = t.status === 'active' && TESTING_STAGES.includes(t.stage) && (!t.lastCheckInAt || Date.now() - new Date(t.lastCheckInAt).getTime() > STALE_DAYS * 86400000);
                const declined = t.status !== 'active';
                return (
                  <React.Fragment key={t.id}>
                    <tr style={{ opacity: declined ? 0.5 : 1 }}>
                      <td style={{ ...td, color: ink, cursor: 'pointer' }} onClick={() => setOpen(open === t.id ? null : t.id)}>
                        <div style={{ fontWeight: 600 }}>{t.name}</div>
                        <div style={{ fontSize: 11.5, color: faint }}>{t.email ?? 'no email'}{t.email && !t.emailVerifiedAt ? <span title="They haven’t proved they own this address yet (opening a link we emailed, or answering an email from Plain does)"> · unverified</span> : ''}</div>
                      </td>
                      <td style={td}>{declined ? <span style={{ color: faint }}>Declined</span> : <select value={t.stage} onChange={(e) => patch(t, { stage: e.target.value })} aria-label="Stage" style={inline}>{STAGES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>}</td>
                      <td style={{ ...td, color: muted, fontSize: 12, maxWidth: 170 }} title={t.types.map((x: string) => LABEL.type[x]).join(', ')}>{t.types.length ? t.types.map((x: string) => LABEL.type[x]).join(', ') : <span style={{ color: faint }}>—</span>}</td>
                      <td style={{ ...td, color: muted, fontSize: 12.5, whiteSpace: 'nowrap' }}>
                        {t.channel ? <>{LABEL.channel[t.channel]}{t.handle ? <span style={{ color: ink }}> {t.handle}</span> : ''}</> : <span style={{ color: faint }}>{t.contact ?? '—'}</span>}
                        {t.handle && <button onClick={() => copy(t.handle, 'Handle copied')} aria-label="Copy handle" style={{ color: faint, marginLeft: 4 }}><Copy size={11} /></button>}
                      </td>
                      <td style={td}><select value={t.usage} onChange={(e) => patch(t, { usage: e.target.value })} disabled={declined} aria-label="Usage" style={inline}>{USAGE.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></td>
                      <td style={td}><select value={t.sendFunds} onChange={(e) => patch(t, { sendFunds: e.target.value })} disabled={declined} aria-label="Send funds" style={{ ...inline, color: t.sendFunds === 'yes' && !t.funded ? accent : ink }}>{SEND_FUNDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></td>
                      <td style={{ ...td, color: t.paid ? ink : faint, whiteSpace: 'nowrap', fontFamily: 'ui-monospace, monospace', fontSize: 12 }}>{t.paid || '—'}</td>
                      <td style={{ ...td, whiteSpace: 'nowrap', fontFamily: 'ui-monospace, monospace', fontSize: 12 }}>
                        {t.walletAddress ? <button onClick={() => copy(t.walletAddress, 'Wallet copied')} title={t.walletAddress} style={{ color: muted }}>{short(t.walletAddress)}</button> : <span style={{ color: t.sendFunds === 'yes' ? accent : faint }}>{t.sendFunds === 'yes' ? 'needed' : '—'}</span>}
                      </td>
                      <td style={{ ...td, whiteSpace: 'nowrap', fontSize: 12.5 }}>
                        <span style={{ color: stale ? accent : muted }} title={stale ? `No check-in for ${STALE_DAYS}+ days` : undefined}>{t.lastCheckInAt ? day(t.lastCheckInAt) : '—'}</span>
                        {!declined && <button onClick={() => patch(t, { checkIn: true }, `Checked in with ${t.name}`)} style={{ ...linkBtn, fontSize: 12, marginLeft: 6 }}>Log today</button>}
                      </td>
                      <td style={{ ...td, color: ink, fontFamily: 'ui-monospace, monospace' }}>{t.reports}</td>
                      <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button onClick={() => setOpen(open === t.id ? null : t.id)} style={{ fontSize: 12, color: muted }}>{open === t.id ? 'Close' : 'Edit'}</button>
                      </td>
                    </tr>
                    {open === t.id && (
                      <tr><td colSpan={11} style={{ ...td, background: 'rgba(255,255,255,0.02)' }}>
                        <TesterEditor ctx={ctx} t={t} questions={questions} onSaved={() => { load(); ctx.reload(); }} />
                        <div className="flex flex-wrap items-center gap-3" style={{ marginTop: 10, fontSize: 12.5 }}>
                          <button onClick={() => ctx.goTab('reports', { tester: t.id, status: 'all' })} style={linkBtn}>Their reports</button>
                          <button onClick={() => ctx.newOutreach({ testerId: t.id })} style={linkBtn}>Message them</button>
                          {canManage && <button onClick={() => ctx.newPayout({ testerId: t.id, reason: t.sendFunds === 'yes' && !t.funded ? 'test_funds' : 'bug_reward' })} style={linkBtn}>Log payout</button>}
                          <button onClick={() => ctx.logReport({ testerId: t.id })} style={linkBtn}>Log a report for them</button>
                          <span style={{ flex: 1 }} />
                          {canManage && !declined && <>
                            <button onClick={() => link(t, 'link')} style={{ color: muted }} title="For a tester who lost their link. Send it to them yourself.">Make a sign-in link</button>
                            <button onClick={() => link(t, 'reset')} style={{ color: muted }}>Sign out everywhere</button>
                          </>}
                          {canManage && (declined ? <button onClick={() => setStatus(t, 'active')} style={{ color: muted }}>Restore</button> : <button onClick={() => setStatus(t, 'removed')} style={{ color: faint }}>Remove (decline)</button>)}
                        </div>
                      </td></tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {adding && <AddTester ctx={ctx} onClose={() => setAdding(false)} onDone={() => { setAdding(false); load(); ctx.reload(); }} />}
    </div>
  );
}

const editable = (t: any) => ({
  name: t.name ?? '', email: t.email ?? '', types: t.types ?? [], channel: t.channel ?? '', handle: t.handle ?? '', walletAddress: t.walletAddress ?? '',
  testAreas: t.testAreas ?? [], wave: t.wave ?? '', notes: t.notes ?? '',
});

function TesterEditor({ ctx, t, questions, onSaved }: { ctx: Ctx; t: any; questions: { id: string; label: string }[]; onSaved: () => void }) {
  const [f, setF] = useState(editable(t));
  const [busy, setBusy] = useState(false);
  const base = editable(t);
  const dirty = JSON.stringify(f) !== JSON.stringify(base);
  const set = (k: keyof typeof f, v: any) => setF((x) => ({ ...x, [k]: v }));
  async function save() {
    setBusy(true);
    const body = Object.fromEntries(Object.entries(f).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify((base as any)[k])).map(([k, v]) => [k, v === '' ? null : v]));
    const ok = await api(`/api/beta/testers/${t.id}`, 'PATCH', body);
    setBusy(false);
    if (ok) { toast.success('Saved'); onSaved(); }
  }
  return (
    <div className="flex flex-col gap-3">
      <div style={grid(190)}>
        <Field name="Name"><input value={f.name} onChange={(e) => set('name', e.target.value)} style={field} /></Field>
        <Field name="Email"><input value={f.email} onChange={(e) => set('email', e.target.value)} style={field} /></Field>
        <Field name="Reach them on"><Select value={f.channel} onChange={(v) => set('channel', v)} opts={CHANNELS} empty="—" /></Field>
        <Field name="Their handle there"><input value={f.handle} onChange={(e) => set('handle', e.target.value)} placeholder="@handle" style={field} /></Field>
        <Field name="Wallet address"><input value={f.walletAddress} onChange={(e) => set('walletAddress', e.target.value.trim())} style={{ ...field, fontFamily: 'ui-monospace, monospace' }} /></Field>
        <Field name="Wave"><input value={f.wave} onChange={(e) => set('wave', e.target.value)} style={field} /></Field>
        <Field name="Type" span><Chips opts={TESTER_TYPES} value={f.types} onChange={(v) => set('types', v)} /></Field>
        {ctx.data.program.testAreas.length > 0 && <Field name="Test areas" span><Chips opts={ctx.data.program.testAreas.map((a) => [a, a] as const)} value={f.testAreas} onChange={(v) => set('testAreas', v)} /></Field>}
        <Field name="Notes" span><textarea value={f.notes} onChange={(e) => set('notes', e.target.value)} rows={2} style={{ ...field, resize: 'vertical' }} /></Field>
      </div>
      {(questions.length > 0 || t.platform || t.invitedAt) && (
        <dl style={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '4px 12px', fontSize: 12.5, margin: 0 }}>
          {t.platform && <><dt style={{ color: faint }}>Tests on</dt><dd style={{ color: muted }}>{t.platform}</dd></>}
          {t.invitedAt && <><dt style={{ color: faint }}>Invited</dt><dd style={{ color: muted }}>{day(t.invitedAt)}</dd></>}
          <dt style={{ color: faint }}>Joined</dt><dd style={{ color: muted }}>{day(t.createdAt)}{t.lastSeenAt ? ` · last on their page ${day(t.lastSeenAt)}` : ''}</dd>
          {questions.map((qq) => <React.Fragment key={qq.id}><dt style={{ color: faint }}>{qq.label}</dt><dd style={{ color: muted, whiteSpace: 'pre-wrap' }}>{t.answers?.[qq.id] || '—'}</dd></React.Fragment>)}
        </dl>
      )}
      {dirty && (
        <div className="flex justify-end gap-2">
          <button onClick={() => setF(base)} style={{ color: muted, fontSize: 12.5 }}>Discard</button>
          <button onClick={save} disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.5 : 1 }}>{busy ? 'Saving…' : 'Save tester'}</button>
        </div>
      )}
    </div>
  );
}

function AddTester({ ctx, onClose, onDone }: { ctx: Ctx; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ name: '', email: '', stage: 'invited', types: ['agent_user'] as string[], usage: 'unknown', sendFunds: 'not_asked', channel: '', handle: '', walletAddress: '', testAreas: [] as string[] });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f, v: any) => setF((x) => ({ ...x, [k]: v }));
  async function save() {
    setBusy(true);
    const d = await api(`/api/beta/programs/${ctx.programId}/testers`, 'POST', { ...f, email: f.email || null, channel: f.channel || null });
    setBusy(false);
    if (d) { toast.success(`${f.name} added`); onDone(); }
  }
  return (
    <Modal title="Add a tester" onClose={onClose}>
      <p style={{ fontSize: 12.5, color: muted }}>For someone you invite yourself. They don’t need an email; make them a sign-in link later if they should file reports on their own.</p>
      <div style={grid(190)}>
        <Field name="Name"><input value={f.name} onChange={(e) => set('name', e.target.value)} autoFocus style={field} /></Field>
        <Field name="Email (optional)"><input value={f.email} onChange={(e) => set('email', e.target.value)} style={field} /></Field>
        <Field name="Stage"><Select value={f.stage} onChange={(v) => set('stage', v)} opts={STAGES} /></Field>
        <Field name="Usage"><Select value={f.usage} onChange={(v) => set('usage', v)} opts={USAGE} /></Field>
        <Field name="Send funds"><Select value={f.sendFunds} onChange={(v) => set('sendFunds', v)} opts={SEND_FUNDS} /></Field>
        <Field name="Reach them on"><Select value={f.channel} onChange={(v) => set('channel', v)} opts={CHANNELS} empty="—" /></Field>
        <Field name="Their handle there"><input value={f.handle} onChange={(e) => set('handle', e.target.value)} placeholder="@handle" style={field} /></Field>
        <Field name="Wallet address"><input value={f.walletAddress} onChange={(e) => set('walletAddress', e.target.value.trim())} style={{ ...field, fontFamily: 'ui-monospace, monospace' }} /></Field>
        <Field name="Type" span><Chips opts={TESTER_TYPES} value={f.types} onChange={(v) => set('types', v)} /></Field>
        {ctx.data.program.testAreas.length > 0 && <Field name="Test areas" span><Chips opts={ctx.data.program.testAreas.map((a) => [a, a] as const)} value={f.testAreas} onChange={(v) => set('testAreas', v)} /></Field>}
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={onClose} style={{ color: muted, fontSize: 13, padding: '8px 12px' }}>Cancel</button>
        <button onClick={save} disabled={busy || !f.name.trim()} style={{ ...primaryBtn, opacity: busy || !f.name.trim() ? 0.5 : 1 }}>{busy ? 'Adding…' : 'Add tester'}</button>
      </div>
    </Modal>
  );
}
