'use client';
import React, { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { DEVICES, ENVIRONMENTS, KINDS, OUTREACH_TYPES, PAYOUT_REASONS, SEVERITY } from '@/lib/betaModel';
import { api, type Ctx, Field, faint, field, grid, ink, linkBtn, Modal, muted, primaryBtn, Select } from './ui';

const testerOpts = (ctx: Ctx) => ctx.testers.filter((t) => t.status === 'active').map((t) => [t.id, t.name] as const);
const reportOpts = (ctx: Ctx, testerId?: string) =>
  ctx.reports.filter((r) => !testerId || r.testerId === testerId).map((r) => [r.id, `${r.title} · ${r.tester.name}`] as const);

/** New outreach request. The lead's and the sender's own requests go straight to the send list. */
export function OutreachForm({ ctx, prefill, onClose }: { ctx: Ctx; prefill: Record<string, unknown>; onClose: () => void }) {
  const [f, setF] = useState({
    testerId: String(prefill.testerId ?? ''), type: String(prefill.type ?? 'need_info'), reportId: String(prefill.reportId ?? ''),
    title: String(prefill.title ?? ''), message: String(prefill.message ?? ''), nextActionDue: '',
  });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  const trusted = ctx.data.me.isLead || ctx.data.me.isSender;
  const tester = ctx.testers.find((t) => t.id === f.testerId);
  async function save() {
    setBusy(true);
    const d = await api(`/api/beta/programs/${ctx.programId}/outreach`, 'POST', { ...f, reportId: f.reportId || null, nextActionDue: f.nextActionDue || null });
    setBusy(false);
    if (!d) return;
    toast.success(trusted ? 'Added to the send list' : 'Suggested — waiting for the lead to approve');
    ctx.reload(); onClose();
  }
  return (
    <Modal title="New outreach request" onClose={onClose}>
      <p style={{ fontSize: 12.5, color: muted }}>
        {trusted ? 'You’re the program’s lead or sender, so this goes straight to the send list.' : 'This waits for the program’s lead to approve before anyone sends it.'}
      </p>
      <div style={grid(200)}>
        <Field name="Tester"><Select value={f.testerId} onChange={(v) => set('testerId', v)} opts={testerOpts(ctx)} empty="Pick a tester" /></Field>
        <Field name="Type"><Select value={f.type} onChange={(v) => set('type', v)} opts={OUTREACH_TYPES} /></Field>
        <Field name="About report (optional)" span><Select value={f.reportId} onChange={(v) => set('reportId', v)} opts={reportOpts(ctx, f.testerId || undefined)} empty="None" /></Field>
        <Field name="What we need" span><input value={f.title} onChange={(e) => set('title', e.target.value)} maxLength={200} placeholder="e.g. Which app version were they on?" style={field} /></Field>
        <Field name="Message to send" span><textarea value={f.message} onChange={(e) => set('message', e.target.value)} rows={4} maxLength={4000} placeholder={tester ? `Hi ${tester.name.split(' ')[0]}! …` : 'What the sender will paste to them'} style={{ ...field, resize: 'vertical' }} /></Field>
        <Field name="Send by"><input type="date" value={f.nextActionDue} onChange={(e) => set('nextActionDue', e.target.value)} style={{ ...field, colorScheme: 'dark' }} /></Field>
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={onClose} style={{ color: muted, fontSize: 13, padding: '8px 12px' }}>Cancel</button>
        <button onClick={save} disabled={busy || !f.testerId || !f.title.trim()} style={{ ...primaryBtn, opacity: busy || !f.testerId || !f.title.trim() ? 0.5 : 1 }}>{busy ? 'Saving…' : 'Add to outreach'}</button>
      </div>
    </Modal>
  );
}

export function PayoutForm({ ctx, prefill, onClose }: { ctx: Ctx; prefill: Record<string, unknown>; onClose: () => void }) {
  const [f, setF] = useState({
    testerId: String(prefill.testerId ?? ''), reason: String(prefill.reason ?? 'bug_reward'), amount: String(prefill.amount ?? ''),
    token: String(prefill.token ?? 'USDC'), tx: '', reportId: String(prefill.reportId ?? ''), notes: '', sentAt: new Date().toISOString().slice(0, 10),
  });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  const tester = ctx.testers.find((t) => t.id === f.testerId);
  async function save() {
    setBusy(true);
    const d = await api(`/api/beta/programs/${ctx.programId}/payouts`, 'POST', { ...f, reportId: f.reportId || null, tx: f.tx || null, notes: f.notes || null });
    setBusy(false);
    if (!d) return;
    toast.success('Payout logged'); ctx.reload(); onClose();
  }
  return (
    <Modal title="Log a payout" onClose={onClose}>
      <p style={{ fontSize: 12.5, color: muted }}>Send the funds from your wallet first, then log it here. The tx can be added later.</p>
      <div style={grid(170)}>
        <Field name="Tester"><Select value={f.testerId} onChange={(v) => set('testerId', v)} opts={testerOpts(ctx)} empty="Pick a tester" /></Field>
        <Field name="Reason"><Select value={f.reason} onChange={(v) => set('reason', v)} opts={PAYOUT_REASONS} /></Field>
        <Field name="Amount"><input inputMode="decimal" value={f.amount} onChange={(e) => set('amount', e.target.value.replace(/[^\d.]/g, ''))} placeholder="25" style={field} /></Field>
        <Field name="Token"><input value={f.token} onChange={(e) => set('token', e.target.value.toUpperCase())} maxLength={20} style={field} /></Field>
        <Field name="Sent on"><input type="date" value={f.sentAt} onChange={(e) => set('sentAt', e.target.value)} style={{ ...field, colorScheme: 'dark' }} /></Field>
        <Field name="For report (optional)"><Select value={f.reportId} onChange={(v) => set('reportId', v)} opts={reportOpts(ctx, f.testerId || undefined)} empty="None" /></Field>
        <Field name="Tx hash or link (optional)" span><input value={f.tx} onChange={(e) => set('tx', e.target.value.trim())} placeholder="0x…" style={{ ...field, fontFamily: 'ui-monospace, monospace' }} /></Field>
        <Field name="Notes" span><input value={f.notes} onChange={(e) => set('notes', e.target.value)} maxLength={2000} style={field} /></Field>
      </div>
      {tester && <p style={{ fontSize: 12, color: tester.walletAddress ? faint : '#EF4444' }}>{tester.walletAddress ? <>Wallet on file: <code style={{ color: ink }}>{tester.walletAddress}</code></> : 'No wallet on file for this tester yet.'}</p>}
      <div className="flex justify-end gap-2">
        <button onClick={onClose} style={{ color: muted, fontSize: 13, padding: '8px 12px' }}>Cancel</button>
        <button onClick={save} disabled={busy || !f.testerId || !Number(f.amount)} style={{ ...primaryBtn, opacity: busy || !f.testerId || !Number(f.amount) ? 0.5 : 1 }}>{busy ? 'Saving…' : 'Log payout'}</button>
      </div>
    </Modal>
  );
}

const words = (s: string) => new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2));

/** The team files a report for a tester (from a call, a DM…), checking for duplicates as they type. */
export function LogReportForm({ ctx, prefill, onClose }: { ctx: Ctx; prefill: Record<string, unknown>; onClose: () => void }) {
  const p = ctx.data.program;
  const [f, setF] = useState({
    testerId: String(prefill.testerId ?? ''), kind: 'bug', claimedSeverity: 'medium', testArea: '', title: '', body: '', duplicateOfId: '',
    steps: '', expected: '', actual: '', environment: 'production', device: '', browser: '', occurredAt: '',
    tokenContract: '', txHash: '', plainTicket: '', pageUrl: '', callId: String(prefill.callId ?? ''),
  });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  const bug = f.kind === 'bug';
  const similar = useMemo(() => {
    const w = words(f.title);
    if (w.size < 2 || f.duplicateOfId) return [];
    return ctx.reports.filter((r) => !r.duplicateOfId)
      .map((r) => { const rw = words(r.title); let n = 0; w.forEach((x) => { if (rw.has(x)) n++; }); return { r, n }; })
      .filter((x) => x.n >= 2 || (x.n >= 1 && w.size <= 3)).sort((a, b) => b.n - a.n).slice(0, 3).map((x) => x.r);
  }, [f.title, f.duplicateOfId, ctx.reports]);
  const dup = ctx.reports.find((r) => r.id === f.duplicateOfId);
  async function save() {
    setBusy(true);
    const body = Object.fromEntries(Object.entries(f).filter(([, v]) => v !== ''));
    if (f.occurredAt) body.occurredAt = new Date(f.occurredAt).toISOString();
    const d = await api<{ id: string }>(`/api/beta/programs/${ctx.programId}/reports`, 'POST', body);
    setBusy(false);
    if (!d) return;
    toast.success(dup ? 'Logged as a duplicate' : 'Report logged'); ctx.reload(); onClose(); ctx.openReport(d.id);
  }
  return (
    <Modal title="Log a report for a tester" onClose={onClose} width={680}>
      <div style={grid(170)}>
        <Field name="Tester"><Select value={f.testerId} onChange={(v) => set('testerId', v)} opts={testerOpts(ctx)} empty="Pick a tester" /></Field>
        <Field name="Type"><Select value={f.kind} onChange={(v) => set('kind', v)} opts={KINDS} /></Field>
        {bug && <Field name="Severity they claim"><Select value={f.claimedSeverity} onChange={(v) => set('claimedSeverity', v)} opts={SEVERITY} /></Field>}
        <Field name="Test area"><Select value={f.testArea} onChange={(v) => set('testArea', v)} opts={p.testAreas.map((a) => [a, a] as const)} empty="—" /></Field>
        <Field name="Summary" span>
          <input value={f.title} onChange={(e) => set('title', e.target.value)} maxLength={200} placeholder="Short title" style={field} />
          {similar.length > 0 && (
            <div style={{ marginTop: 6, fontSize: 12.5, color: muted }}>
              Looks like it might be one of these:
              {similar.map((r) => <button key={r.id} type="button" onClick={() => set('duplicateOfId', r.id)} style={{ ...linkBtn, display: 'block', textAlign: 'left', marginTop: 3 }}>{r.title} · {r.tester.name} — mark as duplicate</button>)}
            </div>
          )}
          {dup && <div style={{ marginTop: 6, fontSize: 12.5, color: muted }}>Duplicate of “{dup.title}” <button type="button" onClick={() => set('duplicateOfId', '')} style={{ color: faint, marginLeft: 6 }}>undo</button></div>}
        </Field>
        <Field name="Details" span><textarea value={f.body} onChange={(e) => set('body', e.target.value)} rows={3} maxLength={10000} style={{ ...field, resize: 'vertical' }} /></Field>
        {bug && <>
          <Field name="Steps to reproduce" span><textarea value={f.steps} onChange={(e) => set('steps', e.target.value)} rows={3} style={{ ...field, resize: 'vertical' }} /></Field>
          <Field name="Expected"><input value={f.expected} onChange={(e) => set('expected', e.target.value)} style={field} /></Field>
          <Field name="Actual"><input value={f.actual} onChange={(e) => set('actual', e.target.value)} style={field} /></Field>
          <Field name="Environment"><Select value={f.environment} onChange={(v) => set('environment', v)} opts={ENVIRONMENTS} /></Field>
          <Field name="Occurred at (your time)"><input type="datetime-local" value={f.occurredAt} onChange={(e) => set('occurredAt', e.target.value)} style={{ ...field, colorScheme: 'dark' }} /></Field>
          <Field name="Token / contract"><input value={f.tokenContract} onChange={(e) => set('tokenContract', e.target.value)} style={field} /></Field>
          <Field name="Tx hash"><input value={f.txHash} onChange={(e) => set('txHash', e.target.value.trim())} style={{ ...field, fontFamily: 'ui-monospace, monospace' }} /></Field>
        </>}
        <Field name="Device"><Select value={f.device} onChange={(v) => set('device', v)} opts={DEVICES} empty="—" /></Field>
        <Field name="Browser / version"><input value={f.browser} onChange={(e) => set('browser', e.target.value)} style={field} /></Field>
        <Field name="Source link"><input value={f.pageUrl} onChange={(e) => set('pageUrl', e.target.value)} placeholder="Where it came from" style={field} /></Field>
        <Field name="Plain ticket"><input value={f.plainTicket} onChange={(e) => set('plainTicket', e.target.value)} placeholder="T-123" style={field} /></Field>
      </div>
      <p style={{ fontSize: 12, color: faint }}>The team sets the official bug severity after review. Screenshots can be added by the tester from their page.</p>
      <div className="flex justify-end gap-2">
        <button onClick={onClose} style={{ color: muted, fontSize: 13, padding: '8px 12px' }}>Cancel</button>
        <button onClick={save} disabled={busy || !f.testerId || !f.title.trim() || !f.body.trim()} style={{ ...primaryBtn, opacity: busy || !f.testerId || !f.title.trim() || !f.body.trim() ? 0.5 : 1 }}>{busy ? 'Saving…' : 'Log report'}</button>
      </div>
    </Modal>
  );
}
