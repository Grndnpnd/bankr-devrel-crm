'use client';
import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Copy, Plus } from 'lucide-react';
import { CHANNELS, LABEL, outcomesFor, OUTREACH_TYPE_HELP } from '@/lib/betaModel';
import { accent, api, card, copy, type Ctx, danger, day, Empty, faint, field, Help, ink, line, linkBtn, muted, overdue, primaryBtn, SectionHead, STATUS_COLOR } from './ui';

interface Item {
  id: string; type: string; status: string; outcome: string | null; title: string; message: string | null; answer: string | null; auto: boolean;
  nextActionDue: string | null; sentAt: string | null; answeredAt: string | null; createdAt: string; sentVia: string | null;
  requestedBy: string | null; approvedBy: string | null; waitingOn: string | null; waitingOnId: string | null;
  tester: { id: string; name: string; channel: string | null; handle: string | null; email: string | null };
  report: { id: string; title: string; status: string; kind: string } | null;
}

const ghost: React.CSSProperties = { fontSize: 12.5, color: ink, border: `1px solid ${line}`, borderRadius: 8, padding: '6px 11px' };

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
    // On a conflict (e.g. another tab already sent it the other way) the error is shown and the list refreshed.
    if (await api(`/api/beta/outreach/${o.id}`, 'POST', { action, ...extra })) { if (msg) toast.success(msg); ctx.reload(); }
    load();
  }

  const head = (
    <div className="flex flex-col gap-2" style={{ marginBottom: 12 }}>
      <Help style={{ marginTop: 0 }}>{ctx.data.program.leadId
        ? 'Messages the team needs to send to testers. Anyone can suggest one; the program’s lead approves it; then it goes to the tester’s beta page, or someone sends it on their chat app (Telegram, Discord, X…) and marks it sent.'
        : 'Messages the team needs to send to testers. No lead is set, so new messages go straight to the send list. Put each one on the tester’s beta page, or send it on their chat app (Telegram, Discord, X…) and mark it sent.'}</Help>
      <div className="flex flex-wrap items-center gap-2">
        {([['open', 'Open'], ['mine', 'Needs me'], ['all', 'Everything']] as const).map(([v, l]) => (
          <button key={v} onClick={() => setView(v)} className="bp-tap" style={{ fontSize: 12.5, padding: '6px 11px', borderRadius: 999, border: `1px solid ${view === v ? accent : line}`, color: view === v ? accent : muted }}>{l}</button>
        ))}
        <span style={{ flex: 1 }} />
        <button onClick={() => ctx.newOutreach()} className="inline-flex items-center gap-1.5" style={primaryBtn}><Plus size={14} /> New message</button>
      </div>
    </div>
  );
  if (!items) return <div>{head}<div style={{ color: faint, fontSize: 13 }}>Loading…</div></div>;

  const by = (s: string) => items.filter((o) => o.status === s);
  const toSend = by('approved');
  const channels = [...CHANNELS.map(([v]) => v), ''];
  const groups: [string, string, Item[]][] = [
    ['Needs approval', ctx.data.me.canApprove ? 'You can approve these.' : `Waiting for ${ctx.people.find((x) => x.id === ctx.data.program.leadId)?.name ?? 'the program’s lead'} to approve.`, by('suggested')],
  ];
  for (const ch of channels) {
    const list = toSend.filter((o) => (o.tester.channel ?? '') === ch);
    if (list.length) groups.push([ch ? `To send on ${LABEL.channel[ch]}` : 'To send — no chat app set (Telegram, Discord, X…)', ch ? 'Copy the message, send it to them there, then mark it sent. Or put it on their beta page.' : 'Put it on their beta page, or send it some other way and mark it sent.', list]);
  }
  groups.push(['Sent — waiting for the tester', 'Remind them, or paste their answer when it comes.', by('sent')]);
  groups.push(['Answered', 'Read the answer and close it with what happened.', by('answered')]);
  if (view === 'all') { groups.push(['Closed', '', by('closed')]); groups.push(['Cancelled', '', by('cancelled')]); }
  const shown = groups.filter(([, , l]) => l.length);

  return (
    <div>
      {head}
      {shown.length === 0 ? <Empty>{view === 'mine' ? 'Nothing needs you right now.' : 'No open messages. When a bug is sent to engineering or its fix is released, the CRM drafts messages to the testers who reported it.'}</Empty> : (
        <div className="flex flex-col gap-5">
          {shown.map(([title, hint, list]) => (
            <div key={title}>
              <SectionHead title={title} count={list.length} hint={hint || undefined} />
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
  const outcomes = outcomesFor(o.type);
  const [outcome, setOutcome] = useState(outcomes[0]?.[0] ?? 'not_needed');
  const [busy, setBusy] = useState(false);
  const open = ['suggested', 'approved', 'sent', 'answered'].includes(o.status);
  const editable = o.status === 'suggested' || o.status === 'approved'; // once sent, the text is what they got
  const late = open && o.status !== 'suggested' && overdue(o.nextActionDue);
  const dirty = msg !== (o.message ?? '');
  const handle = o.tester.handle || (o.tester.channel === 'email' ? o.tester.email : null);
  const where = o.tester.channel ? `${LABEL.channel[o.tester.channel]}${handle ? `: ${handle}` : ' (no handle saved)'}` : null;
  const run = async (action: string, extra: Record<string, unknown> = {}, m?: string) => { setBusy(true); await act(o, action, extra, m); setBusy(false); };
  const noLead = !ctx.data.program.leadId;
  return (
    <div id={`o-${o.id}`} style={{ ...card, padding: 14, display: 'flex', flexDirection: 'column', gap: 8, borderColor: hot ? accent : late ? 'rgba(239,68,68,0.45)' : line, minWidth: 0 }}>
      <div className="flex flex-wrap items-center gap-2" style={{ fontSize: 12.5 }}>
        <b style={{ color: ink, fontSize: 13.5 }}>{o.tester.name}</b>
        <span style={{ color: faint }}>· {LABEL.outreachType[o.type]}{o.auto ? ' (drafted by the CRM)' : ''}</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontWeight: 600, color: STATUS_COLOR[o.status] ?? muted }}>{LABEL.outreachStatus[o.status]}{o.outcome ? ` · ${LABEL.outcome[o.outcome]}` : ''}</span>
      </div>
      <div style={{ fontSize: 13.5, color: ink, overflowWrap: 'anywhere' }}>{o.title}</div>
      {o.report && <button onClick={() => ctx.openReport(o.report!.id)} style={{ ...linkBtn, fontSize: 12, textAlign: 'left' }}>About: {o.report.title} ({LABEL.status[o.report.status]})</button>}
      {open && (o.status === 'suggested' || o.status === 'approved') && (
        <div style={{ fontSize: 12.5, color: muted }}>
          {where ? <>Send on <b style={{ color: ink }}>{where}</b>{handle && <button onClick={() => copy(handle, 'Handle copied')} aria-label="Copy handle" className="bp-sq" style={{ color: faint, marginLeft: 6, verticalAlign: '-2px' }}><Copy size={12} /></button>}</> : 'No chat app saved for this tester — send it on their beta page.'}
        </div>
      )}
      {editable ? (
        <textarea value={msg} onChange={(e) => setMsg(e.target.value)} rows={Math.min(8, Math.max(4, Math.ceil(msg.length / 60)))} placeholder="The message to send" aria-label="Message" style={{ ...field, resize: 'vertical', width: '100%' }} />
      ) : o.message ? <div style={{ fontSize: 13, color: muted, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{o.message}</div> : null}
      {o.answer && <div style={{ fontSize: 13, color: ink, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', borderLeft: `2px solid ${accent}`, paddingLeft: 10 }}><span style={{ color: faint, fontSize: 11.5 }}>Their answer{o.sentVia === 'portal' ? ' (on their beta page)' : ''}{o.answeredAt ? ` · ${day(o.answeredAt)}` : ''}</span><br />{o.answer}</div>}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1" style={{ fontSize: 11.5, color: faint }}>
        {o.auto ? <span>Suggested by the CRM</span> : o.requestedBy && <span>Requested by {o.requestedBy}</span>}
        {o.approvedBy && <span>Approved by {o.approvedBy}</span>}
        {o.waitingOn && open && <span>Next step: {o.waitingOn}</span>}
        {o.sentAt && <span>Sent {day(o.sentAt)}{o.sentVia === 'portal' ? ' on their beta page' : o.sentVia === 'manual' ? ' by hand' : ''}</span>}
        {o.nextActionDue && open && <span style={{ color: late ? danger : faint }}>
          {o.status === 'approved' || o.status === 'suggested' ? `Send by ${day(o.nextActionDue)}` : o.status === 'sent' ? `Follow up by ${day(o.nextActionDue)} — 3 days after sending; moves to 2 days after they answer` : `Close by ${day(o.nextActionDue)} — 2 days after they answered`}
          {late ? ' — late' : ''}
        </span>}
      </div>
      {o.status === 'suggested' && noLead && <Help style={{ marginTop: 0 }}>No lead is set, so anyone who runs betas can approve this. Set a lead in Settings to have one person approve messages.</Help>}
      {editable && OUTREACH_TYPE_HELP[o.type] && <Help style={{ marginTop: 0 }}>{LABEL.outreachType[o.type]}: {OUTREACH_TYPE_HELP[o.type]}</Help>}
      {open && (
        <div className="flex flex-wrap items-center gap-2" style={{ borderTop: `1px solid ${line}`, paddingTop: 8 }}>
          {dirty && editable && <button disabled={busy} onClick={() => run('edit', { message: msg }, 'Message saved')} className="bp-tap" style={linkBtn}>Save message</button>}
          {o.status === 'suggested' && ctx.data.me.canApprove && <button disabled={busy} onClick={() => run('approve', dirty ? { message: msg } : {}, 'Approved — ready to send')} className="bp-tap" style={{ ...primaryBtn, padding: '6px 12px' }}>Approve</button>}
          {o.status === 'approved' && <>
            <button disabled={busy || !msg.trim()} title={!msg.trim() ? 'Write the message first' : undefined} onClick={() => run('send_portal', { message: msg }, 'On their beta page — they can answer there')} className="bp-tap" style={{ ...(where ? ghost : { ...primaryBtn, padding: '6px 12px' }), opacity: msg.trim() ? 1 : 0.5 }}>Send on their beta page</button>
            {msg && where && <button onClick={() => copy(msg, 'Message copied — paste it to them, then mark it sent')} className="bp-tap inline-flex items-center gap-1" style={linkBtn}><Copy size={12} /> Copy message</button>}
            <button disabled={busy} onClick={() => run('sent', dirty ? { message: msg } : {}, 'Marked sent — follow up in 3 days')} className="bp-tap" style={where ? { ...primaryBtn, padding: '6px 12px' } : ghost}>Mark sent (I sent it myself)</button>
          </>}
          {o.status === 'sent' && <>
            <input value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Paste their answer" aria-label="Their answer" className="bp-tap-sel" style={{ ...field, flex: '1 1 220px', width: 'auto' }} />
            <button disabled={busy} onClick={() => { if (!answer.trim()) { toast.error('Paste their answer first'); return; } run('answer', { answer }, 'Answer saved'); }} className="bp-tap" style={{ ...primaryBtn, padding: '6px 12px' }}>Save answer</button>
            <button disabled={busy} onClick={() => run('nudged', {}, 'Noted — follow up again in 3 days')} className="bp-tap" style={linkBtn}>I reminded them</button>
            <button disabled={busy} onClick={() => run('no_reply', {}, 'Closed — they never answered')} className="bp-tap" style={{ fontSize: 12.5, color: muted }}>Close — they never answered</button>
          </>}
          {o.status === 'answered' && <>
            <select value={outcome} onChange={(e) => setOutcome(e.target.value)} aria-label="What happened" className="bp-tap-sel" style={{ ...field, width: 'auto', maxWidth: '100%' }}>
              {outcomes.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <button disabled={busy} onClick={() => run('close', { outcome }, outcome === 'retest_passed' ? 'Closed — bug marked fixed' : outcome === 'retest_failed' ? 'Closed — bug sent back to engineering' : 'Closed')} className="bp-tap" style={{ ...primaryBtn, padding: '6px 12px' }}>Close</button>
          </>}
          <span style={{ flex: 1 }} />
          <button disabled={busy} onClick={() => { if (window.confirm('Cancel this message? It won’t be sent.')) run('cancel', {}, 'Cancelled'); }} className="bp-tap" style={{ fontSize: 12, color: faint }}>Cancel message</button>
        </div>
      )}
    </div>
  );
}
