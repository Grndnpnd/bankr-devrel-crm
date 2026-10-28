'use client';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { ChevronDown, ChevronRight, ExternalLink, Paperclip, Trash2, X } from 'lucide-react';
import { DEVICES, ENVIRONMENTS, KINDS, LABEL, SEVERITY, SEVERITY_HELP, STATUS_HELP, statusesFor, TESTER_STATUS, txUrl } from '@/lib/betaModel';
import { accent, api, type Ctx, danger, day, Drawer, Field, faint, field, grid, Help, ink, label, line, linkBtn, localDateTime, isoDay, muted, ok, peopleOpts, primaryBtn, Select, SEV_COLOR, STATUS_COLOR } from './ui';

/** The triage fields. Each one saves on its own the moment it changes (no Save button to miss). */
const FIELDS = ['status', 'severity', 'kind', 'testArea', 'device', 'environment', 'browser', 'occurredAt', 'tokenContract', 'txHash', 'wallet', 'plainTicket', 'trackedIn', 'fixPr', 'nextStep', 'waitingOnId', 'nextActionDue', 'duplicateOfId', 'callId'] as const;
type Key = (typeof FIELDS)[number];
type Form = Record<Key, string>;

const toForm = (r: any): Form => ({
  status: r.status ?? '', severity: r.severity ?? '', kind: r.kind ?? '', testArea: r.testArea ?? '', device: r.device ?? '', environment: r.environment ?? '',
  browser: r.browser ?? '', occurredAt: localDateTime(r.occurredAt), tokenContract: r.tokenContract ?? '', txHash: r.txHash ?? '', wallet: r.wallet ?? '',
  plainTicket: r.plainTicket ?? '', trackedIn: r.trackedIn ?? '', fixPr: r.fixPr ?? '', nextStep: r.nextStep ?? '', waitingOnId: r.waitingOnId ?? '',
  nextActionDue: isoDay(r.nextActionDue), duplicateOfId: r.duplicateOfId ?? '', callId: r.callId ?? '',
});
const toApi = (k: Key, v: string) => (v === '' ? null : k === 'occurredAt' ? new Date(v).toISOString() : v);

/** Where a reply goes, said honestly (an unverified address is still emailed by Plain). */
const replyNote = (r: any) => !r?.plainUrl ? 'They see it on their beta page.'
  : r.tester?.email && !r.tester?.emailVerifiedAt ? 'They see it on their beta page. Plain also emails it to the address they gave (not verified yet).'
  : 'They see it on their beta page, and Plain emails it to them.';

type SaveState = { state: 'idle' | 'saving' | 'saved' | 'error' | 'conflict'; key?: Key; error?: string };

export default function ReportDrawer({ ctx, id, onClose }: { ctx: Ctx; id: string; onClose: () => void }) {
  const [r, setR] = useState<any>(null);
  const [f, setF] = useState<Form | null>(null);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [save, setSave] = useState<SaveState>({ state: 'idle' });
  const [more, setMore] = useState(false);
  const [calls, setCalls] = useState<{ id: string; title: string; date: string }[]>([]);
  // Text fields being typed in and not saved yet: a reload after another field's save mustn't overwrite them.
  const editing = useRef(new Set<Key>());
  // The report as the server last sent it: each save says what it expected the field to be, so a stale tab
  // can't silently overwrite a teammate's change.
  const server = useRef<any>(null);
  const canManage = ctx.data.canManage;

  const load = useCallback(async () => {
    const res = await fetch(`/api/beta/reports/${id}`).catch(() => null);
    if (!res?.ok) { toast.error(res?.status === 404 ? 'That report was deleted' : 'Could not load the report'); onClose(); return; }
    const d = (await res.json()).report;
    server.current = d;
    setR(d);
    setF((prev) => {
      const fresh = toForm(d);
      if (!prev) return fresh;
      const merged = { ...fresh };
      editing.current.forEach((k) => { merged[k] = prev[k]; });
      return merged;
    });
  }, [id, onClose]);
  // Loads on open and whenever the program view reloads (e.g. a message or payout made from this drawer).
  useEffect(() => { load(); }, [load, ctx.ver]);
  useEffect(() => { fetch(`/api/beta/programs/${ctx.programId}/calls`).then((x) => x.json()).then((d) => setCalls(d.calls ?? [])).catch(() => {}); }, [ctx.programId]);

  /** A new edit after a conflict: the conflict message has done its job. */
  const clearConflict = useCallback(() => { setSave((s) => (s.state === 'conflict' ? { state: 'idle' } : s)); toast.dismiss('triage-conflict'); }, []);

  /** Save one field now. Selects and dates call this on change; text fields on blur or Enter. */
  const saveField = useCallback(async (k: Key, v: string) => {
    setF((x) => (x ? { ...x, [k]: v } : x));
    toast.dismiss('triage-conflict');
    setSave({ state: 'saving', key: k });
    const expect = { [k]: server.current?.[k] ?? null };
    const res = await fetch(`/api/beta/reports/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [k]: toApi(k, v), expect }) }).catch(() => null);
    const d = await res?.json().catch(() => ({}));
    if (res?.status === 409) {
      // Someone else changed this field meanwhile: show their value instead of overwriting it.
      editing.current.delete(k);
      const why = String(d?.error ?? 'Someone else changed this just now.').replace(/\s*Reload to see their change\.?$/, '');
      setSave({ state: 'conflict', key: k, error: why });
      toast.error(why, { id: 'triage-conflict' });
      await load();
      return false;
    }
    if (!res?.ok) { setSave({ state: 'error', key: k, error: d?.error ?? 'Couldn’t reach the server.' }); return false; }
    editing.current.delete(k);
    setSave({ state: 'saved', key: k });
    ctx.reload(); // reloads this drawer too (see the effect above)
    return true;
  }, [id, load, ctx]);

  // Text fields: type freely, save when leaving the field (or pressing Enter in a one-line field).
  const type = (k: Key, v: string) => { editing.current.add(k); clearConflict(); setF((x) => (x ? { ...x, [k]: v } : x)); };
  const commit = (k: Key) => { if (f && r && f[k] !== toForm(r)[k]) saveField(k, f[k]); else editing.current.delete(k); };
  const text = (k: Key, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <input value={f?.[k] ?? ''} onChange={(e) => type(k, e.target.value)} onBlur={() => commit(k)} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} style={field} {...extra} />
  );

  async function remove() {
    if (!window.confirm('Delete this report with its conversation, files and task? The tester won’t see it any more. Its row on a connected Notion board moves to Notion’s trash. Plain keeps its copy (the tester’s contact details, the report and the messages) until someone deletes it there. This can’t be undone.')) return;
    if (await api(`/api/beta/reports/${id}`, 'DELETE')) { toast.success('Report deleted'); ctx.reload(); onClose(); }
  }
  async function send() {
    if (!reply.trim()) return;
    setBusy(true);
    const okSent = await api(`/api/beta/reports/${id}/replies`, 'POST', { body: reply });
    setBusy(false);
    if (okSent) { setReply(''); toast.success(replyNote(r)); load(); }
  }

  if (!r || !f) return <Drawer label="Report" onClose={onClose}><div style={{ color: faint }}>Loading…</div></Drawer>;
  const kind = f.kind || r.kind;
  const kindStatuses = statusesFor(kind);
  const dupOptions = ctx.reports.filter((x) => x.id !== r.id && !x.duplicateOfId).map((x) => [x.id, `${x.title} · ${x.tester.name}`] as const);
  const tx = txUrl(r.txHash);
  const people = peopleOpts(ctx.people);
  const nextBug: Record<string, [string, string] | undefined> = {
    new: ['triaged', 'Mark triaged (confirmed)'], triaged: ['escalated', 'Send to engineering'], escalated: ['fix_in_review', 'Fix is being checked'],
    fix_in_review: ['fix_live', 'Fix is released'], fix_live: ['retest_needed', 'Ask the tester to try again'], retest_needed: ['verified', 'Fix confirmed'],
  };
  const next = r.kind === 'bug' ? nextBug[r.status] : r.status === 'new' ? (['noted', 'Mark noted'] as [string, string]) : undefined;
  const sev = f.severity || r.claimedSeverity || '';
  const saveLine = save.state === 'saving' ? <span style={{ color: muted }}>Saving…</span>
    : save.state === 'saved' ? <span style={{ color: ok }}>Saved ✓</span>
    : save.state === 'conflict' ? <span style={{ color: danger }}>Not saved — {save.error} The report now shows their value.</span>
    : save.state === 'error' ? <span style={{ color: danger }}>Couldn’t save: {save.error} <button onClick={() => save.key && saveField(save.key, f[save.key])} style={{ ...linkBtn, fontSize: 12 }}>Retry</button></span>
    : <span style={{ color: faint }}>Changes save as you make them</span>;

  return (
    <Drawer label="Report" onClose={onClose} width={640}>
      <div className="bp-head flex items-start gap-2">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11.5, color: faint, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>
            {LABEL.kind[r.kind]} · from {r.tester.name}{r.loggedBy ? ` · logged by ${r.loggedBy}` : ''} · {day(r.createdAt)}
          </div>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: ink, lineHeight: 1.3 }}>{r.title}</h2>
        </div>
        <button onClick={onClose} aria-label="Close" className="bp-close" style={{ color: faint }}><X size={18} /></button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span style={{ fontSize: 12, fontWeight: 700, color: STATUS_COLOR[r.status] ?? muted }}>{LABEL.status[r.status] ?? r.status}</span>
        {r.waitingOn && <span style={{ fontSize: 12, color: muted }}>· waiting on {r.waitingOn}</span>}
        {next && <button onClick={() => saveField('status', next[0])} className="bp-tap" style={{ ...linkBtn, marginLeft: 6 }}>{next[1]} →</button>}
        <span style={{ flex: 1 }} />
        {r.task && <Link href={`/tasks?task=${r.task.id}`} style={{ fontSize: 12.5, color: accent }}>Task · {r.task.status.replace('_', ' ').toLowerCase()}</Link>}
        {r.plainUrl && <a href={r.plainUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1" style={{ fontSize: 12.5, color: accent }}>Plain <ExternalLink size={12} /></a>}
        {!r.plainUrl && r.plainError && <span title={r.plainError} style={{ fontSize: 12, color: faint }}>Not in Plain yet (retrying)</span>}
      </div>

      <p style={{ fontSize: 13.5, color: ink, whiteSpace: 'pre-wrap', lineHeight: 1.55, overflowWrap: 'anywhere' }}>{r.body}</p>
      {r.steps && <div><span style={label}>Steps to reproduce</span><p style={{ fontSize: 13, color: ink, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{r.steps}</p></div>}
      <dl style={{ display: 'grid', gridTemplateColumns: 'max-content minmax(0, 1fr)', gap: '4px 12px', fontSize: 12.5 }}>
        {([
          ['Tester', `${r.tester.name}${r.tester.email ? ` <${r.tester.email}>` : ''}${r.tester.email && !r.tester.emailVerifiedAt ? ' (email not verified)' : ''}${r.tester.channel ? ` · ${LABEL.channel[r.tester.channel]}${r.tester.handle ? ` ${r.tester.handle}` : ''}` : ''}${r.tester.status !== 'active' ? ' · removed' : ''}`],
          r.claimedSeverity && ['Severity they reported', LABEL.severity[r.claimedSeverity]],
          r.expected && ['Expected', r.expected], r.actual && ['Actual', r.actual],
          r.platform && ['Device (from the tester)', r.platform], r.pageUrl && ['Where', r.pageUrl],
        ].filter(Boolean) as [string, string][]).map(([k, v]) => <React.Fragment key={k}><dt style={{ color: faint }}>{k}</dt><dd style={{ color: muted, overflowWrap: 'anywhere' }}>{v}</dd></React.Fragment>)}
      </dl>

      {r.attachments.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {r.attachments.map((a: any) => a.contentType.startsWith('image/') ? (
            <a key={a.id} href={`/api/beta/attachments/${a.id}`} target="_blank" rel="noreferrer" title={`${a.filename} — open full size`}>
              <img src={`/api/beta/attachments/${a.id}?thumb=1`} alt={a.filename} loading="lazy" style={{ width: 120, height: 80, objectFit: 'cover', borderRadius: 8, border: `1px solid ${line}`, background: '#0D0D0D' }} />
            </a>
          ) : (
            <a key={a.id} href={`/api/beta/attachments/${a.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg" style={{ fontSize: 12.5, color: muted, border: `1px solid ${line}`, padding: '6px 10px', maxWidth: '100%', overflowWrap: 'anywhere' }}><Paperclip size={13} /> {a.filename}</a>
          ))}
        </div>
      )}

      {/* Conversation first: answering the tester is the most common thing to do here. */}
      <div style={{ borderTop: `1px solid ${line}`, paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={label}>Conversation with the tester</span>
        {r.replies.length === 0 && <div style={{ fontSize: 12.5, color: faint }}>No messages yet.</div>}
        <div className="flex flex-col gap-2" style={{ maxHeight: 280, overflowY: 'auto' }}>
          {r.replies.map((m: any) => (
            <div key={m.id} className="rounded-lg" style={{ padding: '8px 10px', background: m.authorType === 'team' ? 'rgba(59,130,246,0.1)' : '#0D0D0D', border: `1px solid ${line}`, alignSelf: m.authorType === 'team' ? 'flex-end' : 'flex-start', maxWidth: '92%' }}>
              <div style={{ fontSize: 11.5, color: faint, marginBottom: 2 }}>{m.author} · {day(m.createdAt)} {new Date(m.createdAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</div>
              <div style={{ fontSize: 13, color: ink, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{m.body}</div>
            </div>
          ))}
        </div>
        {r.tester.status === 'active' ? (
          <>
            <textarea value={reply} onChange={(e) => setReply(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send(); }} maxLength={5000} rows={3}
              placeholder={`Write to the tester. ${replyNote(r)}`} style={{ ...field, resize: 'vertical' }} />
            <div className="flex items-center justify-end gap-3">
              <button onClick={send} disabled={busy || !reply.trim()} title={!reply.trim() ? 'Write a message first' : undefined} style={{ ...primaryBtn, opacity: busy || !reply.trim() ? 0.5 : 1 }}>{busy ? 'Sending…' : 'Send reply'}</button>
            </div>
          </>
        ) : <div style={{ fontSize: 12.5, color: faint }}>This tester was removed, so they can’t see replies.</div>}
      </div>

      <div style={{ borderTop: `1px solid ${line}`, paddingTop: 14 }}>
        <div className="flex flex-wrap items-center gap-2" style={{ marginBottom: 8 }}>
          <span style={{ ...label, marginBottom: 0 }}>Triage</span>
          <span style={{ fontSize: 12 }} aria-live="polite">{saveLine}</span>
        </div>
        <div style={grid(170)}>
          <Field name="Status">
            <Select value={f.status} onChange={(v) => saveField('status', v)} opts={kindStatuses} ariaLabel="Status" />
            <Help>{STATUS_HELP[f.status] ?? ''} <span style={{ color: faint }}>The tester sees: “{TESTER_STATUS[f.status] ?? f.status}”.</span></Help>
          </Field>
          {kind === 'bug' && (
            <Field name="Severity (set by the team)">
              <Select value={f.severity} onChange={(v) => saveField('severity', v)} opts={SEVERITY} ariaLabel="Severity" empty={r.claimedSeverity ? `Not set yet (tester said ${LABEL.severity[r.claimedSeverity]})` : 'Not set yet'} style={{ color: SEV_COLOR[sev] ?? ink }} />
              {sev && <Help>{LABEL.severity[sev]}: {SEVERITY_HELP[sev]}</Help>}
            </Field>
          )}
          <Field name="Type"><Select value={f.kind} onChange={(v) => saveField('kind', v)} opts={KINDS} ariaLabel="Type" /></Field>
          <Field name="Test area"><Select value={f.testArea} onChange={(v) => saveField('testArea', v)} opts={ctx.data.program.testAreas.map((a) => [a, a] as const)} empty="—" ariaLabel="Test area" /></Field>
          <Field name="Waiting on">
            <Select value={f.waitingOnId} onChange={(v) => saveField('waitingOnId', v)} opts={people} empty="Nobody" ariaLabel="Waiting on" />
            <Help>Who has to do the next thing. Changes by itself when the status changes.</Help>
          </Field>
          <Field name="Next action due"><input type="date" value={f.nextActionDue} onChange={(e) => saveField('nextActionDue', e.target.value)} aria-label="Next action due" style={{ ...field, colorScheme: 'dark' }} /></Field>
          <Field name="Duplicate of" span>
            <Select value={f.duplicateOfId} onChange={(v) => saveField('duplicateOfId', v)} opts={dupOptions} empty="Not a duplicate" ariaLabel="Duplicate of" />
            {r.duplicateOf && <button onClick={() => ctx.openReport(r.duplicateOf.id)} style={{ ...linkBtn, fontSize: 12 }}>Open the first report: {r.duplicateOf.title}</button>}
          </Field>
          <Field name="Next step" span>
            <textarea value={f.nextStep} onChange={(e) => type('nextStep', e.target.value)} onBlur={() => commit('nextStep')} rows={2} placeholder="e.g. Waiting for the 2.4.2 build" style={{ ...field, resize: 'vertical' }} />
          </Field>
        </div>

        <button onClick={() => setMore((m) => !m)} className="inline-flex items-center gap-1" style={{ fontSize: 12.5, color: muted, marginTop: 12 }} aria-expanded={more}>
          {more ? <ChevronDown size={14} /> : <ChevronRight size={14} />} More details (device, transaction, links)
        </button>
        {more && (
          <div style={{ ...grid(170), marginTop: 10 }}>
            <Field name="Device"><Select value={f.device} onChange={(v) => saveField('device', v)} opts={DEVICES} empty="—" ariaLabel="Device" /></Field>
            <Field name="Environment"><Select value={f.environment} onChange={(v) => saveField('environment', v)} opts={ENVIRONMENTS} empty="—" ariaLabel="Environment" /></Field>
            <Field name="Browser / app version">{text('browser', { placeholder: 'e.g. Safari 18.1' })}</Field>
            <Field name="Happened at (your time)"><input type="datetime-local" value={f.occurredAt} onChange={(e) => saveField('occurredAt', e.target.value)} aria-label="Happened at" style={{ ...field, colorScheme: 'dark' }} /></Field>
            <Field name="Token / contract">{text('tokenContract', { placeholder: 'e.g. 0x… or USDC' })}</Field>
            <Field name="Transaction hash">
              {text('txHash', { placeholder: 'e.g. 0x…', style: { ...field, fontFamily: 'ui-monospace, monospace' } })}
              {tx && <a href={tx} target="_blank" rel="noreferrer" style={{ ...linkBtn, fontSize: 12 }}>Open in explorer</a>}
            </Field>
            <Field name="Wallet">{text('wallet', { placeholder: 'e.g. 0x…', style: { ...field, fontFamily: 'ui-monospace, monospace' } })}</Field>
            <Field name="Plain ticket">{text('plainTicket', { placeholder: 'e.g. T-123' })}</Field>
            <Field name="Tracked in (issue link)">
              {text('trackedIn', { placeholder: 'e.g. https://github.com/…/issues/12' })}
              {r.trackedIn && <a href={r.trackedIn} target="_blank" rel="noreferrer" style={{ ...linkBtn, fontSize: 12 }}>Open</a>}
            </Field>
            <Field name="Fix pull request">{text('fixPr', { placeholder: 'e.g. https://github.com/…/pull/34' })}</Field>
            <Field name="From a call"><Select value={f.callId} onChange={(v) => saveField('callId', v)} opts={calls.map((c) => [c.id, `${c.title} · ${day(c.date)}`] as const)} empty="—" ariaLabel="Call" /></Field>
          </div>
        )}
      </div>

      {r.duplicates.length > 0 && (
        <div>
          <span style={label}>Also reported by ({r.duplicates.length})</span>
          <div className="flex flex-col gap-1">{r.duplicates.map((x: any) => <button key={x.id} onClick={() => ctx.openReport(x.id)} style={{ ...linkBtn, textAlign: 'left' }}>{x.tester.name}: {x.title}</button>)}</div>
        </div>
      )}

      <div>
        <div className="flex flex-wrap items-center gap-3">
          <span style={{ ...label, marginBottom: 0 }}>Messages and payouts</span>
          <span style={{ flex: 1 }} />
          <button onClick={() => ctx.newOutreach({ testerId: r.tester.id, reportId: r.id })} className="bp-tap" style={linkBtn}>Message the tester</button>
          {canManage && <button onClick={() => ctx.newPayout({ testerId: r.tester.id, reportId: r.id, reason: 'bug_reward' })} className="bp-tap" style={linkBtn}>Log a payout</button>}
        </div>
        {r.outreach.length === 0 && r.payouts.length === 0 ? <div style={{ fontSize: 12.5, color: faint, marginTop: 4 }}>None yet.</div> : (
          <div className="flex flex-col gap-1" style={{ marginTop: 6, fontSize: 12.5 }}>
            {r.outreach.map((o: any) => (
              <button key={o.id} onClick={() => ctx.goTab('outreach', { view: 'all', o: o.id })} className="flex flex-wrap gap-x-2 text-left" style={{ color: muted }}>
                <span style={{ color: STATUS_COLOR[o.status] ?? muted, minWidth: 70 }}>{LABEL.outreachStatus[o.status]}</span>
                <span style={{ color: ink }}>{o.title}</span><span>· {o.tester.name}{o.outcome ? ` · ${LABEL.outcome[o.outcome]}` : ''}</span>
              </button>
            ))}
            {r.payouts.map((x: any) => (
              <div key={x.id} className="flex flex-wrap gap-x-2" style={{ color: muted }}>
                <span style={{ color: ok, minWidth: 70 }}>Paid</span>
                <span style={{ color: ink }}>{x.amount} {x.token}</span><span>· {LABEL.reason[x.reason]} · {x.tester.name}</span>
                {x.txUrl && <a href={x.txUrl} target="_blank" rel="noreferrer" style={{ color: accent }}>transaction</a>}
              </div>
            ))}
          </div>
        )}
      </div>

      {canManage && (
        <div style={{ borderTop: `1px solid ${line}`, paddingTop: 12 }}>
          <button onClick={remove} className="bp-tap inline-flex items-center gap-1.5" style={{ fontSize: 12.5, color: faint }}><Trash2 size={14} /> Delete report</button>
        </div>
      )}
    </Drawer>
  );
}
