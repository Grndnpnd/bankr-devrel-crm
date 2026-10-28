'use client';
import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Copy, Plus } from 'lucide-react';
import { CHANNELS, LABEL, OUTCOMES } from '@/lib/betaModel';
import { accent, api, card, copy, type Ctx, danger, day, Empty, faint, field, ink, line, linkBtn, muted, overdue, primaryBtn, SectionHead, STATUS_COLOR } from './ui';

interface Item {
  id: string; type: string; status: string; outcome: string | null; title: string; message: string | null; answer: string | null; auto: boolean;
  nextActionDue: string | null; sentAt: string | null; answeredAt: string | null; createdAt: string;
  requestedBy: string | null; approvedBy: string | null; waitingOn: string | null; waitingOnId: string | null;
  tester: { id: string; name: string; channel: string | null; handle: string | null; email: string | null };
  report: { id: string; title: string; status: string; kind: string } | null;
}

export default function Outreach({ ctx, initial }: { ctx: Ctx; initial: Record<string, string> }) {
  const [view, setView] = useState(initial.view ?? 'open');
  const [items, setItems] = useState<Item[] | null>(null);
  const [focus, setFocus] = useState<string | null>(initial.o ?? null);
  const load = useCallback(async () => {
    const d = await fetch(`/api/beta/programs/${ctx.programId}/outreach?view=${view}`).then((r) => r.json()).catch(() => ({}));
    setItems(d.items ?? []);
  }, [ctx.programId, view]);
  useEffect(() => { load(); }, [load, ctx.ver]);
  useEffect(() => {
    if (!focus || !items) return;
    const el = document.getElementById(`o-${focus}`);
    if (el) { el.scrollIntoView({ block: 'center' }); setTimeout(() => setFocus(null), 2500); }
  }, [focus, items]);

  async function act(o: Item, action: string, extra: Record<string, unknown> = {}, msg?: string) {
    if (await api(`/api/beta/outreach/${o.id}`, 'POST', { action, ...extra })) { if (msg) toast.success(msg); load(); ctx.reload(); }
  }

  const head = (
    <div className="flex flex-wrap items-center gap-2" style={{ marginBottom: 12 }}>
      {([['open', 'Open'], ['mine', 'Waiting on me'], ['all', 'Everything']] as const).map(([v, l]) => (
        <button key={v} onClick={() => setView(v)} style={{ fontSize: 12.5, padding: '6px 11px', borderRadius: 999, border: `1px solid ${view === v ? accent : line}`, color: view === v ? accent : muted }}>{l}</button>
      ))}
      <span style={{ flex: 1 }} />
      <button onClick={() => ctx.newOutreach()} className="inline-flex items-center gap-1.5" style={primaryBtn}><Plus size={14} /> New request</button>
    </div>
  );
  if (!items) return <div>{head}<div style={{ color: faint, fontSize: 13 }}>Loading…</div></div>;

  const by = (s: string) => items.filter((o) => o.status === s);
  const toSend = by('approved');
  const channels = [...CHANNELS.map(([v]) => v), ''];
  const groups: [string, string, Item[]][] = [
    ['Needs approval', ctx.data.me.canApprove ? 'You can approve these' : 'Waiting for the program’s lead', by('suggested')],
  ];
  for (const ch of channels) {
    const list = toSend.filter((o) => (o.tester.channel ?? '') === ch);
    if (list.length) groups.push([`Send on ${ch ? LABEL.channel[ch] : '— no channel set'}`, 'Approved — send these, then mark them sent', list]);
  }
  groups.push(['Waiting on a reply', 'Sent; nudge or log their answer', by('sent')]);
  groups.push(['Answered', 'Close with an outcome', by('answered')]);
  if (view === 'all') { groups.push(['Closed', '', by('closed')]); groups.push(['Cancelled', '', by('cancelled')]); }
  const shown = groups.filter(([, , l]) => l.length);

  return (
    <div>
      {head}
      {!ctx.data.program.leadId && <p style={{ fontSize: 12.5, color: muted, marginBottom: 10 }}>No lead is set for this program, so anyone who runs beta programs can approve. Set a lead and a sender in Settings.</p>}
      {shown.length === 0 ? <Empty>{view === 'mine' ? 'Nothing is waiting on you.' : 'No open outreach. Escalating a bug or putting its fix live suggests messages automatically.'}</Empty> : (
        <div className="flex flex-col gap-5">
          {shown.map(([title, hint, list]) => (
            <div key={title}>
              <SectionHead title={title} count={list.length} hint={hint} />
              <div className="flex flex-col gap-2">{list.map((o) => <Card key={o.id} o={o} ctx={ctx} act={act} hot={focus === o.id} />)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Card({ o, ctx, act, hot }: { o: Item; ctx: Ctx; act: (o: Item, a: string, x?: Record<string, unknown>, m?: string) => Promise<void>; hot: boolean }) {
  const [msg, setMsg] = useState(o.message ?? '');
  const [answer, setAnswer] = useState('');
  const [outcome, setOutcome] = useState(o.report?.kind === 'bug' && o.type === 'fix_live_retest' ? 'retest_passed' : 'report_updated');
  const open = ['suggested', 'approved', 'sent', 'answered'].includes(o.status);
  const late = open && o.status !== 'suggested' && overdue(o.nextActionDue);
  const dirty = msg !== (o.message ?? '');
  const handle = o.tester.handle || (o.tester.channel === 'email' ? o.tester.email : null);
  return (
    <div id={`o-${o.id}`} style={{ ...card, padding: 14, display: 'flex', flexDirection: 'column', gap: 8, borderColor: hot ? accent : late ? 'rgba(239,68,68,0.45)' : line }}>
      <div className="flex flex-wrap items-center gap-2" style={{ fontSize: 12.5 }}>
        <b style={{ color: ink, fontSize: 13.5 }}>{o.tester.name}</b>
        {o.tester.channel && <span style={{ color: muted }}>{LABEL.channel[o.tester.channel]}{handle ? ` · ${handle}` : ''}</span>}
        {handle && <button onClick={() => copy(handle, 'Handle copied')} aria-label="Copy handle" style={{ color: faint }}><Copy size={12} /></button>}
        <span style={{ color: faint }}>· {LABEL.outreachType[o.type]}{o.auto ? ' (suggested by the CRM)' : ''}</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontWeight: 600, color: STATUS_COLOR[o.status] ?? muted }}>{LABEL.outreachStatus[o.status]}{o.outcome ? ` · ${LABEL.outcome[o.outcome]}` : ''}</span>
      </div>
      <div style={{ fontSize: 13.5, color: ink }}>{o.title}</div>
      {o.report && <button onClick={() => ctx.openReport(o.report!.id)} style={{ ...linkBtn, fontSize: 12, textAlign: 'left' }}>About: {o.report.title} ({LABEL.status[o.report.status]})</button>}
      {open ? (
        <textarea value={msg} onChange={(e) => setMsg(e.target.value)} rows={Math.min(6, Math.max(2, Math.ceil(msg.length / 80)))} placeholder="Message to send" style={{ ...field, resize: 'vertical' }} />
      ) : o.message ? <div style={{ fontSize: 13, color: muted, whiteSpace: 'pre-wrap' }}>{o.message}</div> : null}
      {o.answer && <div style={{ fontSize: 13, color: ink, whiteSpace: 'pre-wrap', borderLeft: `2px solid ${accent}`, paddingLeft: 10 }}><span style={{ color: faint, fontSize: 11.5 }}>Their answer{o.answeredAt ? ` · ${day(o.answeredAt)}` : ''}</span><br />{o.answer}</div>}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1" style={{ fontSize: 11.5, color: faint }}>
        {o.requestedBy && <span>Requested by {o.requestedBy}</span>}
        {o.approvedBy && <span>Approved by {o.approvedBy}</span>}
        {o.waitingOn && open && <span>Waiting on {o.waitingOn}</span>}
        {o.sentAt && <span>Sent {day(o.sentAt)}</span>}
        {o.nextActionDue && open && <span style={{ color: late ? danger : faint }}>{o.status === 'approved' || o.status === 'suggested' ? 'Send by' : 'Follow up'} {day(o.nextActionDue)}{late ? ' — overdue' : ''}</span>}
      </div>
      {open && (
        <div className="flex flex-wrap items-center gap-2" style={{ borderTop: `1px solid ${line}`, paddingTop: 8 }}>
          {dirty && <button onClick={() => act(o, 'edit', { message: msg }, 'Message saved')} style={linkBtn}>Save message</button>}
          {o.status === 'suggested' && ctx.data.me.canApprove && <button onClick={() => act(o, 'approve', dirty ? { message: msg } : {}, 'Approved — on the send list')} style={{ ...primaryBtn, padding: '6px 12px' }}>Approve</button>}
          {o.status === 'approved' && <>
            {msg && <button onClick={() => copy(msg, 'Message copied')} className="inline-flex items-center gap-1" style={linkBtn}><Copy size={12} /> Copy message</button>}
            <button onClick={() => act(o, 'sent', {}, 'Marked sent — follow up in 3 days')} style={{ ...primaryBtn, padding: '6px 12px' }}>Mark sent</button>
          </>}
          {o.status === 'sent' && <>
            <input value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Paste their answer" style={{ ...field, flex: '1 1 220px', width: 'auto' }} />
            <button onClick={() => act(o, 'answer', { answer }, 'Answer saved')} disabled={!answer.trim()} style={{ ...primaryBtn, padding: '6px 12px', opacity: answer.trim() ? 1 : 0.5 }}>Save answer</button>
            <button onClick={() => act(o, 'nudged', {}, 'Nudged — follow up in 3 days')} style={linkBtn}>Nudged</button>
            <button onClick={() => act(o, 'no_reply', {}, 'Closed: no reply')} style={{ fontSize: 12.5, color: muted }}>Close: no reply</button>
          </>}
          {o.status === 'answered' && <>
            <select value={outcome} onChange={(e) => setOutcome(e.target.value)} aria-label="Outcome" style={{ ...field, width: 'auto' }}>
              {OUTCOMES.filter(([v]) => v !== 'no_reply').map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <button onClick={() => act(o, 'close', { outcome }, outcome === 'retest_passed' ? 'Closed — bug verified' : outcome === 'retest_failed' ? 'Closed — bug escalated again' : 'Closed')} style={{ ...primaryBtn, padding: '6px 12px' }}>Close</button>
          </>}
          <span style={{ flex: 1 }} />
          <button onClick={() => { if (window.confirm('Cancel this outreach?')) act(o, 'cancel', {}, 'Cancelled'); }} style={{ fontSize: 12, color: faint }}>Cancel</button>
        </div>
      )}
    </div>
  );
}
