'use client';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { ExternalLink, Paperclip, Trash2, X } from 'lucide-react';
import { DEVICES, ENVIRONMENTS, KINDS, LABEL, SEVERITY, statusesFor, txUrl } from '@/lib/betaModel';
import { accent, api, type Ctx, day, Drawer, Field, faint, field, grid, ink, label, line, linkBtn, localDateTime, isoDay, muted, primaryBtn, Select, SEV_COLOR, STATUS_COLOR } from './ui';

/** The triage fields, in the order the drawer shows them. */
const FIELDS = ['status', 'severity', 'kind', 'testArea', 'device', 'environment', 'browser', 'occurredAt', 'tokenContract', 'txHash', 'wallet', 'plainTicket', 'trackedIn', 'fixPr', 'nextStep', 'waitingOnId', 'nextActionDue', 'duplicateOfId', 'callId'] as const;
type Form = Record<(typeof FIELDS)[number], string>;

const toForm = (r: any): Form => ({
  status: r.status ?? '', severity: r.severity ?? '', kind: r.kind ?? '', testArea: r.testArea ?? '', device: r.device ?? '', environment: r.environment ?? '',
  browser: r.browser ?? '', occurredAt: localDateTime(r.occurredAt), tokenContract: r.tokenContract ?? '', txHash: r.txHash ?? '', wallet: r.wallet ?? '',
  plainTicket: r.plainTicket ?? '', trackedIn: r.trackedIn ?? '', fixPr: r.fixPr ?? '', nextStep: r.nextStep ?? '', waitingOnId: r.waitingOnId ?? '',
  nextActionDue: isoDay(r.nextActionDue), duplicateOfId: r.duplicateOfId ?? '', callId: r.callId ?? '',
});

export default function ReportDrawer({ ctx, id, onClose }: { ctx: Ctx; id: string; onClose: () => void }) {
  const [r, setR] = useState<any>(null);
  const [f, setF] = useState<Form | null>(null);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [calls, setCalls] = useState<{ id: string; title: string; date: string }[]>([]);
  const canManage = ctx.data.canManage;

  const load = useCallback(async () => {
    const res = await fetch(`/api/beta/reports/${id}`);
    if (!res.ok) { toast.error(res.status === 404 ? 'That report was deleted' : 'Could not load the report'); onClose(); return; }
    const d = (await res.json()).report;
    setR(d); setF(toForm(d));
  }, [id, onClose]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { fetch(`/api/beta/programs/${ctx.programId}/calls`).then((x) => x.json()).then((d) => setCalls(d.calls ?? [])).catch(() => {}); }, [ctx.programId]);

  const base = useMemo(() => (r ? toForm(r) : null), [r]);
  const changed = useMemo(() => (f && base ? FIELDS.filter((k) => f[k] !== base[k]) : []), [f, base]);
  const set = (k: keyof Form, v: string) => setF((x) => (x ? { ...x, [k]: v } : x));

  async function save() {
    if (!f || !changed.length) return;
    setSaving(true);
    const body: Record<string, unknown> = {};
    for (const k of changed) {
      const v = f[k];
      body[k] = v === '' ? null : k === 'occurredAt' ? new Date(v).toISOString() : v;
    }
    const ok = await api(`/api/beta/reports/${id}`, 'PATCH', body);
    setSaving(false);
    if (ok) { toast.success('Saved'); load(); ctx.reload(); }
  }
  async function quickStatus(status: string) {
    if (await api(`/api/beta/reports/${id}`, 'PATCH', { status })) { toast.success(`Now ${LABEL.status[status]}`); load(); ctx.reload(); }
  }
  async function remove() {
    if (!window.confirm('Delete this report with its conversation, files and task? The tester won’t see it any more. This can’t be undone.')) return;
    if (await api(`/api/beta/reports/${id}`, 'DELETE')) { toast.success('Report deleted'); ctx.reload(); onClose(); }
  }
  async function send() {
    if (!reply.trim()) return;
    setBusy(true);
    const ok = await api(`/api/beta/reports/${id}/replies`, 'POST', { body: reply });
    setBusy(false);
    if (ok) { setReply(''); toast.success(r?.plainUrl ? 'Sent — the tester sees it on their page and by email' : 'Sent — the tester sees it on their page'); load(); }
  }

  if (!r || !f) return <Drawer label="Report" onClose={onClose}><div style={{ color: faint }}>Loading…</div></Drawer>;
  const kindStatuses = statusesFor(f.kind || r.kind);
  const dupOptions = ctx.reports.filter((x) => x.id !== r.id && !x.duplicateOfId).map((x) => [x.id, `${x.title} · ${x.tester.name}`] as const);
  const tx = txUrl(r.txHash);
  const people = ctx.people.map((p) => [p.id, p.name || p.email] as const);
  const nextBug: Record<string, [string, string] | undefined> = {
    new: ['triaged', 'Mark triaged'], triaged: ['escalated', 'Escalate to engineering'], escalated: ['fix_in_review', 'Fix in review'],
    fix_in_review: ['fix_live', 'Fix is live'], fix_live: ['retest_needed', 'Ask for a retest'], retest_needed: ['verified', 'Verified'],
  };
  const next = r.kind === 'bug' ? nextBug[r.status] : r.status === 'new' ? (['noted', 'Mark noted'] as [string, string]) : undefined;

  return (
    <Drawer label="Report" onClose={onClose} width={640}>
      <div className="flex items-start gap-2">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11.5, color: faint, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>
            {LABEL.kind[r.kind]} · from {r.tester.name}{r.loggedBy ? ` · logged by ${r.loggedBy}` : ''} · {day(r.createdAt)}
          </div>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: ink, lineHeight: 1.3 }}>{r.title}</h2>
        </div>
        <button onClick={onClose} aria-label="Close" style={{ color: faint }}><X size={18} /></button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span style={{ fontSize: 12, fontWeight: 700, color: STATUS_COLOR[r.status] ?? muted }}>{LABEL.status[r.status] ?? r.status}</span>
        {r.waitingOn && <span style={{ fontSize: 12, color: muted }}>· waiting on {r.waitingOn}</span>}
        {next && <button onClick={() => quickStatus(next[0])} style={{ ...linkBtn, marginLeft: 6 }}>{next[1]} →</button>}
        <span style={{ flex: 1 }} />
        {r.task && <Link href={`/tasks?task=${r.task.id}`} style={{ fontSize: 12.5, color: accent }}>Task · {r.task.status.replace('_', ' ').toLowerCase()}</Link>}
        {r.plainUrl && <a href={r.plainUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1" style={{ fontSize: 12.5, color: accent }}>Plain <ExternalLink size={12} /></a>}
        {!r.plainUrl && r.plainError && <span title={r.plainError} style={{ fontSize: 12, color: faint }}>Not in Plain yet (retrying)</span>}
      </div>

      <p style={{ fontSize: 13.5, color: ink, whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>{r.body}</p>
      {r.steps && <div><span style={label}>Steps to reproduce</span><p style={{ fontSize: 13, color: ink, whiteSpace: 'pre-wrap' }}>{r.steps}</p></div>}
      <dl style={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '4px 12px', fontSize: 12.5 }}>
        {([
          ['Tester', `${r.tester.name}${r.tester.email ? ` <${r.tester.email}>` : ''}${r.tester.email && !r.tester.emailVerifiedAt ? ' (email not verified)' : ''}${r.tester.channel ? ` · ${LABEL.channel[r.tester.channel]}${r.tester.handle ? ` ${r.tester.handle}` : ''}` : ''}${r.tester.status !== 'active' ? ' · removed' : ''}`],
          r.claimedSeverity && ['Claimed severity', LABEL.severity[r.claimedSeverity]],
          r.expected && ['Expected', r.expected], r.actual && ['Actual', r.actual],
          r.platform && ['Their device line', r.platform], r.pageUrl && ['Where', r.pageUrl],
        ].filter(Boolean) as [string, string][]).map(([k, v]) => <React.Fragment key={k}><dt style={{ color: faint }}>{k}</dt><dd style={{ color: muted, wordBreak: 'break-word' }}>{v}</dd></React.Fragment>)}
      </dl>

      {r.attachments.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {r.attachments.map((a: any) => a.contentType.startsWith('image/') ? (
            <a key={a.id} href={`/api/beta/attachments/${a.id}`} target="_blank" rel="noreferrer" title={a.filename}>
              <img src={`/api/beta/attachments/${a.id}`} alt={a.filename} style={{ width: 120, height: 80, objectFit: 'cover', borderRadius: 8, border: `1px solid ${line}` }} />
            </a>
          ) : (
            <a key={a.id} href={`/api/beta/attachments/${a.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg" style={{ fontSize: 12.5, color: muted, border: `1px solid ${line}`, padding: '6px 10px' }}><Paperclip size={13} /> {a.filename}</a>
          ))}
        </div>
      )}

      <div style={{ borderTop: `1px solid ${line}`, paddingTop: 14 }}>
        <span style={label}>Triage</span>
        <div style={grid(170)}>
          <Field name="Status"><Select value={f.status} onChange={(v) => set('status', v)} opts={kindStatuses} /></Field>
          {(f.kind || r.kind) === 'bug' && (
            <Field name="Severity (official)">
              <Select value={f.severity} onChange={(v) => set('severity', v)} opts={SEVERITY} empty={r.claimedSeverity ? `Not set (claimed ${LABEL.severity[r.claimedSeverity]})` : 'Not set'} style={{ color: SEV_COLOR[f.severity || r.claimedSeverity || ''] ?? ink }} />
            </Field>
          )}
          <Field name="Type"><Select value={f.kind} onChange={(v) => set('kind', v)} opts={KINDS} /></Field>
          <Field name="Test area"><Select value={f.testArea} onChange={(v) => set('testArea', v)} opts={ctx.data.program.testAreas.map((a) => [a, a] as const)} empty="—" /></Field>
          <Field name="Waiting on"><Select value={f.waitingOnId} onChange={(v) => set('waitingOnId', v)} opts={people} empty="Nobody" /></Field>
          <Field name="Next action due"><input type="date" value={f.nextActionDue} onChange={(e) => set('nextActionDue', e.target.value)} style={{ ...field, colorScheme: 'dark' }} /></Field>
          <Field name="Device"><Select value={f.device} onChange={(v) => set('device', v)} opts={DEVICES} empty="—" /></Field>
          <Field name="Environment"><Select value={f.environment} onChange={(v) => set('environment', v)} opts={ENVIRONMENTS} empty="—" /></Field>
          <Field name="Browser / version"><input value={f.browser} onChange={(e) => set('browser', e.target.value)} style={field} /></Field>
          <Field name="Occurred at"><input type="datetime-local" value={f.occurredAt} onChange={(e) => set('occurredAt', e.target.value)} style={{ ...field, colorScheme: 'dark' }} /></Field>
          <Field name="Token / contract"><input value={f.tokenContract} onChange={(e) => set('tokenContract', e.target.value)} style={field} /></Field>
          <Field name="Tx hash">
            <input value={f.txHash} onChange={(e) => set('txHash', e.target.value.trim())} style={{ ...field, fontFamily: 'ui-monospace, monospace' }} />
            {tx && <a href={tx} target="_blank" rel="noreferrer" style={{ ...linkBtn, fontSize: 12 }}>Open in explorer</a>}
          </Field>
          <Field name="Wallet"><input value={f.wallet} onChange={(e) => set('wallet', e.target.value.trim())} style={{ ...field, fontFamily: 'ui-monospace, monospace' }} /></Field>
          <Field name="Plain ticket"><input value={f.plainTicket} onChange={(e) => set('plainTicket', e.target.value)} placeholder="T-123" style={field} /></Field>
          <Field name="Tracked in">
            <input value={f.trackedIn} onChange={(e) => set('trackedIn', e.target.value.trim())} placeholder="https://…" style={field} />
            {r.trackedIn && <a href={r.trackedIn} target="_blank" rel="noreferrer" style={{ ...linkBtn, fontSize: 12 }}>Open</a>}
          </Field>
          <Field name="Fix PR"><input value={f.fixPr} onChange={(e) => set('fixPr', e.target.value)} style={field} /></Field>
          <Field name="Duplicate of" span>
            <Select value={f.duplicateOfId} onChange={(v) => set('duplicateOfId', v)} opts={dupOptions} empty="Not a duplicate" />
            {r.duplicateOf && <button onClick={() => ctx.openReport(r.duplicateOf.id)} style={{ ...linkBtn, fontSize: 12 }}>Open the original: {r.duplicateOf.title}</button>}
          </Field>
          <Field name="Call"><Select value={f.callId} onChange={(v) => set('callId', v)} opts={calls.map((c) => [c.id, `${c.title} · ${day(c.date)}`] as const)} empty="—" /></Field>
          <Field name="Next step" span><textarea value={f.nextStep} onChange={(e) => set('nextStep', e.target.value)} rows={2} style={{ ...field, resize: 'vertical' }} /></Field>
        </div>
        <div className="flex items-center justify-end gap-2" style={{ marginTop: 10 }}>
          {changed.length > 0 && <button onClick={() => setF(base)} style={{ color: muted, fontSize: 12.5 }}>Discard</button>}
          <button onClick={save} disabled={saving || !changed.length} style={{ ...primaryBtn, opacity: saving || !changed.length ? 0.5 : 1 }}>{saving ? 'Saving…' : changed.length ? `Save ${changed.length} change${changed.length === 1 ? '' : 's'}` : 'Saved'}</button>
        </div>
      </div>

      {r.duplicates.length > 0 && (
        <div>
          <span style={label}>Also reported by ({r.duplicates.length})</span>
          <div className="flex flex-col gap-1">{r.duplicates.map((x: any) => <button key={x.id} onClick={() => ctx.openReport(x.id)} style={{ ...linkBtn, textAlign: 'left' }}>{x.tester.name}: {x.title}</button>)}</div>
        </div>
      )}

      <div>
        <div className="flex flex-wrap items-center gap-3">
          <span style={{ ...label, marginBottom: 0 }}>Outreach and payouts</span>
          <span style={{ flex: 1 }} />
          <button onClick={() => ctx.newOutreach({ testerId: r.tester.id, reportId: r.id })} style={linkBtn}>Message tester</button>
          {canManage && <button onClick={() => ctx.newPayout({ testerId: r.tester.id, reportId: r.id, reason: 'bug_reward' })} style={linkBtn}>Log payout</button>}
        </div>
        {r.outreach.length === 0 && r.payouts.length === 0 ? <div style={{ fontSize: 12.5, color: faint, marginTop: 4 }}>None yet.</div> : (
          <div className="flex flex-col gap-1" style={{ marginTop: 6, fontSize: 12.5 }}>
            {r.outreach.map((o: any) => (
              <button key={o.id} onClick={() => ctx.goTab('outreach', { view: 'all', o: o.id })} className="flex gap-2 text-left" style={{ color: muted }}>
                <span style={{ color: STATUS_COLOR[o.status] ?? muted, minWidth: 70 }}>{LABEL.outreachStatus[o.status]}</span>
                <span style={{ color: ink }}>{o.title}</span><span>· {o.tester.name}{o.outcome ? ` · ${LABEL.outcome[o.outcome]}` : ''}</span>
              </button>
            ))}
            {r.payouts.map((x: any) => (
              <div key={x.id} className="flex gap-2" style={{ color: muted }}>
                <span style={{ color: '#10B981', minWidth: 70 }}>Paid</span>
                <span style={{ color: ink }}>{x.amount} {x.token}</span><span>· {LABEL.reason[x.reason]} · {x.tester.name}</span>
                {x.txUrl && <a href={x.txUrl} target="_blank" rel="noreferrer" style={{ color: accent }}>tx</a>}
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ borderTop: `1px solid ${line}`, paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={label}>Conversation with the tester</span>
        {r.replies.length === 0 && <div style={{ fontSize: 12.5, color: faint }}>No messages yet.</div>}
        <div className="flex flex-col gap-2" style={{ maxHeight: 280, overflowY: 'auto' }}>
          {r.replies.map((m: any) => (
            <div key={m.id} className="rounded-lg" style={{ padding: '8px 10px', background: m.authorType === 'team' ? 'rgba(59,130,246,0.1)' : '#0D0D0D', border: `1px solid ${line}`, alignSelf: m.authorType === 'team' ? 'flex-end' : 'flex-start', maxWidth: '92%' }}>
              <div style={{ fontSize: 11.5, color: faint, marginBottom: 2 }}>{m.author} · {new Date(m.createdAt).toLocaleString()}</div>
              <div style={{ fontSize: 13, color: ink, whiteSpace: 'pre-wrap' }}>{m.body}</div>
            </div>
          ))}
        </div>
        {r.tester.status === 'active' ? (
          <>
            <textarea value={reply} onChange={(e) => setReply(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send(); }} maxLength={5000} rows={3}
              placeholder={r.plainUrl ? 'Reply to the tester — they see it on their beta page and get it by email from Plain' : 'Reply to the tester — they see it on their beta page'} style={{ ...field, resize: 'vertical' }} />
            <div className="flex items-center justify-end gap-3">
              {canManage && <button onClick={remove} className="inline-flex items-center gap-1.5" style={{ fontSize: 12.5, color: faint, marginRight: 'auto' }}><Trash2 size={14} /> Delete report</button>}
              <button onClick={send} disabled={busy || !reply.trim()} style={{ ...primaryBtn, opacity: busy || !reply.trim() ? 0.5 : 1 }}>{busy ? 'Sending…' : 'Send reply'}</button>
            </div>
          </>
        ) : (
          <div className="flex items-center gap-3" style={{ fontSize: 12.5, color: faint }}>
            This tester was removed, so they can’t see replies.
            {canManage && <button onClick={remove} className="inline-flex items-center gap-1.5" style={{ fontSize: 12.5, color: faint, marginLeft: 'auto' }}><Trash2 size={14} /> Delete report</button>}
          </div>
        )}
      </div>
    </Drawer>
  );
}
