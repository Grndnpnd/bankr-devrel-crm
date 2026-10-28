'use client';
import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ExternalLink, Plus, Trash2 } from 'lucide-react';
import { LABEL } from '@/lib/betaModel';
import { api, card, Chips, type Ctx, day, Empty, faint, Field, field, grid, ink, label, line, linkBtn, localDateTime, Modal, muted, primaryBtn, STATUS_COLOR } from './ui';

interface Call {
  id: string; title: string; date: string; summary: string | null; recordingUrl: string | null;
  testers: { id: string; name: string }[];
  reports: { id: string; title: string; kind: string; status: string }[];
  outreach: { id: string; title: string; status: string }[];
}

export default function Calls({ ctx }: { ctx: Ctx }) {
  const [calls, setCalls] = useState<Call[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<Call | 'new' | null>(null);
  const load = useCallback(async () => {
    const d = await fetch(`/api/beta/programs/${ctx.programId}/calls`).then((r) => r.json()).catch(() => ({}));
    setCalls(d.calls ?? []);
  }, [ctx.programId]);
  useEffect(() => { load(); }, [load, ctx.ver]);

  async function remove(c: Call) {
    if (!window.confirm(`Delete the call “${c.title}”? Its reports and outreach stay.`)) return;
    if (await api(`/api/beta/calls/${c.id}`, 'DELETE')) { load(); }
  }

  if (!calls) return <div style={{ color: faint, fontSize: 13 }}>Loading…</div>;
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2" style={{ marginBottom: 12 }}>
        <p style={{ fontSize: 12.5, color: muted, flex: 1 }}>Live calls with testers, newest first. Log what came out of a call as reports (pick the call on the report) and outreach.</p>
        <button onClick={() => setEditing('new')} className="inline-flex items-center gap-1.5" style={primaryBtn}><Plus size={14} /> Log a call</button>
      </div>
      {calls.length === 0 ? <Empty>No calls yet.</Empty> : (
        <div className="flex flex-col gap-2" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          {calls.map((c) => (
            <div key={c.id} style={{ ...card, padding: 14 }}>
              <button onClick={() => setOpen(open === c.id ? null : c.id)} className="w-full text-left flex flex-wrap items-center gap-3">
                <span style={{ fontSize: 12, color: faint, minWidth: 64 }}>{day(c.date)}</span>
                <span style={{ fontSize: 14, color: ink, flex: 1, minWidth: 0 }}>{c.title}</span>
                <span style={{ fontSize: 12, color: muted }}>{c.testers.length} tester{c.testers.length === 1 ? '' : 's'} · {c.reports.length} report{c.reports.length === 1 ? '' : 's'} · {c.outreach.length} outreach</span>
              </button>
              {open === c.id && (
                <div className="flex flex-col gap-3" style={{ marginTop: 12, borderTop: `1px solid ${line}`, paddingTop: 12 }}>
                  {c.testers.length > 0 && <div style={{ fontSize: 12.5, color: muted }}>With {c.testers.map((t) => t.name).join(', ')}</div>}
                  {c.recordingUrl && <a href={c.recordingUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1" style={linkBtn}>Recording <ExternalLink size={12} /></a>}
                  {c.summary && <p style={{ fontSize: 13, color: ink, whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>{c.summary}</p>}
                  {c.reports.length > 0 && (
                    <div><span style={label}>Reports</span>
                      {c.reports.map((r) => (
                        <button key={r.id} onClick={() => ctx.openReport(r.id)} className="flex w-full gap-2 text-left" style={{ fontSize: 12.5, padding: '2px 0' }}>
                          <span style={{ color: STATUS_COLOR[r.status] ?? muted, minWidth: 90 }}>{LABEL.status[r.status]}</span><span style={{ color: ink }}>{r.title}</span><span style={{ color: faint }}>· {LABEL.kind[r.kind]}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {c.outreach.length > 0 && (
                    <div><span style={label}>Outreach</span>
                      {c.outreach.map((o) => (
                        <button key={o.id} onClick={() => ctx.goTab('outreach', { view: 'all', o: o.id })} className="flex w-full gap-2 text-left" style={{ fontSize: 12.5, padding: '2px 0' }}>
                          <span style={{ color: STATUS_COLOR[o.status] ?? muted, minWidth: 90 }}>{LABEL.outreachStatus[o.status]}</span><span style={{ color: ink }}>{o.title}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-3">
                    <button onClick={() => ctx.logReport({ callId: c.id, testerId: c.testers[0]?.id })} style={linkBtn}>Log a report from this call</button>
                    <button onClick={() => setEditing(c)} style={linkBtn}>Edit</button>
                    <span style={{ flex: 1 }} />
                    {ctx.data.canManage && <button onClick={() => remove(c)} className="inline-flex items-center gap-1" style={{ fontSize: 12.5, color: faint }}><Trash2 size={13} /> Delete</button>}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {editing && <CallForm ctx={ctx} call={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); load(); ctx.reload(); }} />}
    </div>
  );
}

function CallForm({ ctx, call, onClose, onDone }: { ctx: Ctx; call: Call | null; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({
    title: call?.title ?? '', date: localDateTime(call?.date ?? new Date()), summary: call?.summary ?? '', recordingUrl: call?.recordingUrl ?? '',
    testerIds: call?.testers.map((t) => t.id) ?? ([] as string[]),
  });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f, v: any) => setF((x) => ({ ...x, [k]: v }));
  async function save() {
    setBusy(true);
    const body = { ...f, date: new Date(f.date).toISOString(), recordingUrl: f.recordingUrl.trim() || null, summary: f.summary || null };
    const ok = call ? await api(`/api/beta/calls/${call.id}`, 'PATCH', body) : await api(`/api/beta/programs/${ctx.programId}/calls`, 'POST', body);
    setBusy(false);
    if (ok) { toast.success(call ? 'Call saved' : 'Call logged'); onDone(); }
  }
  const testerOpts = ctx.testers.filter((t) => t.status === 'active' || f.testerIds.includes(t.id)).map((t) => [t.id, t.name] as const);
  return (
    <Modal title={call ? 'Edit call' : 'Log a call'} onClose={onClose} width={620}>
      <div style={grid(200)}>
        <Field name="Title"><input value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="Onboarding feedback, week 2" style={field} /></Field>
        <Field name="When"><input type="datetime-local" value={f.date} onChange={(e) => set('date', e.target.value)} style={{ ...field, colorScheme: 'dark' }} /></Field>
        <Field name="Recording (https link)" span><input value={f.recordingUrl} onChange={(e) => set('recordingUrl', e.target.value)} placeholder="https://…" style={field} /></Field>
        <Field name="Testers on the call" span>{testerOpts.length ? <Chips opts={testerOpts} value={f.testerIds} onChange={(v) => set('testerIds', v)} /> : <span style={{ fontSize: 12.5, color: faint }}>No testers yet.</span>}</Field>
        <Field name="Summary" span><textarea value={f.summary} onChange={(e) => set('summary', e.target.value)} rows={7} placeholder="What came up, decisions, follow-ups. Paste a transcript summary here." style={{ ...field, resize: 'vertical' }} /></Field>
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={onClose} style={{ color: muted, fontSize: 13, padding: '8px 12px' }}>Cancel</button>
        <button onClick={save} disabled={busy || !f.title.trim()} style={{ ...primaryBtn, opacity: busy || !f.title.trim() ? 0.5 : 1 }}>{busy ? 'Saving…' : call ? 'Save call' : 'Log call'}</button>
      </div>
    </Modal>
  );
}
