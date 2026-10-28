'use client';
import React from 'react';
import { accent, card, type Ctx, danger, Empty, faint, Help, ink, line, muted, plural, SectionHead } from './ui';

function Tile({ label, value, sub, tone, onClick }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: 'bad' | 'warn'; onClick?: () => void }) {
  return (
    <button onClick={onClick} disabled={!onClick} style={{ ...card, padding: 16, textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 4, borderColor: tone === 'bad' ? 'rgba(239,68,68,0.45)' : line, cursor: onClick ? 'pointer' : 'default' }}>
      <span style={{ fontSize: 11.5, color: faint, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{label}</span>
      <span style={{ fontSize: 26, fontFamily: 'ui-monospace, monospace', color: tone === 'bad' ? danger : tone === 'warn' ? accent : ink, lineHeight: 1.1 }}>{value}</span>
      {sub && <span style={{ fontSize: 12, color: muted }}>{sub}</span>}
    </button>
  );
}

const money = (byToken: Record<string, number>) => {
  const e = Object.entries(byToken).filter(([, v]) => v > 0);
  if (!e.length) return '0';
  return e.map(([t, v]) => `${t === 'USDC' || t === 'USD' ? '$' : ''}${(+v.toFixed(2)).toLocaleString()}${t === 'USDC' || t === 'USD' ? '' : ` ${t}`}`).join(' + ');
};

export default function Overview({ ctx }: { ctx: Ctx }) {
  const o = ctx.data.overview;
  if (!o) return <Empty>Couldn’t load the overview.</Empty>;
  const max = Math.max(1, ...o.coverage.map((c) => c.testers));
  const mine = o.waitingOnMe.outreach + o.waitingOnMe.reports;
  const p = ctx.data.program;
  // Funding tiles only matter once someone asked for test funds or was paid.
  const funding = o.funds.waiting > 0 || o.paid.testers > 0;
  return (
    <div className="flex flex-col gap-5">
      {!p.description?.trim() ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl" style={{ border: '1px dashed rgba(245,166,35,0.4)', padding: '10px 14px', fontSize: 13, color: ink }}>
          <span style={{ flex: '1 1 240px' }}>Testers see an almost empty join page — only the program name. Add a short description: what it is, what to try, how long the beta runs.</span>
          <button onClick={() => ctx.goTab('settings')} className="bp-tap" style={{ color: accent }}>Add it in Settings</button>
        </div>
      ) : !p.welcome?.trim() ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl" style={{ border: `1px dashed ${line}`, padding: '10px 14px', fontSize: 12.5, color: muted }}>
          <span style={{ flex: '1 1 240px' }}>Tip: a welcome note tells new testers what to try first (and where to get the app).</span>
          <button onClick={() => ctx.goTab('settings')} className="bp-tap" style={{ color: accent }}>Write one</button>
        </div>
      ) : null}
      {mine > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl" style={{ background: 'rgba(245,166,35,0.07)', border: '1px solid rgba(245,166,35,0.25)', padding: '10px 14px', fontSize: 13, color: ink }}>
          <b>Needs you:</b>
          {o.waitingOnMe.reports > 0 && <button onClick={() => ctx.goTab('reports', { waiting: 'me' })} className="bp-tap" style={{ color: accent }}>{plural(o.waitingOnMe.reports, 'report')}</button>}
          {o.waitingOnMe.outreach > 0 && <button onClick={() => ctx.goTab('outreach', { view: 'mine' })} className="bp-tap" style={{ color: accent }}>{plural(o.waitingOnMe.outreach, 'message to a tester', 'messages to testers')}</button>}
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 170px), 1fr))', gap: 12 }}>
        <Tile label="Testers" value={o.testers.total} sub={<>{o.testers.testingNow} testing now{o.testers.staleCheckIns ? <> · <span style={{ color: accent }}>{plural(o.testers.staleCheckIns, 'tester')} not heard from in 5+ days</span></> : null}</>} onClick={() => ctx.goTab('testers')} />
        <Tile label="Messages to send" value={o.outreach.toSend} tone={o.outreach.overdue ? 'bad' : undefined}
          sub={<>Approved, not sent yet · {o.outreach.awaitingApproval} need approval{o.outreach.overdue ? <> · <span style={{ color: danger }}>{o.outreach.overdue} late</span></> : null}</>} onClick={() => ctx.goTab('outreach')} />
        <Tile label="Open bugs" value={o.bugs.open} tone={o.bugs.urgent ? 'warn' : undefined} sub={<>{o.bugs.urgent} critical or high · {o.bugs.unreviewed} nobody has looked at</>} onClick={() => ctx.goTab('reports')} />
        {funding && <>
          <Tile label="Waiting for test funds" value={o.funds.waiting} sub={<>Said yes to funds, not paid yet{o.funds.missingWallet ? <> · <span style={{ color: accent }}>{o.funds.missingWallet} without a wallet</span></> : null}</>} onClick={() => ctx.goTab('payouts')} />
          <Tile label="Total paid" value={money(o.paid.byToken)} sub={`to ${plural(o.paid.testers, 'tester')}`} onClick={() => ctx.goTab('payouts')} />
        </>}
      </div>
      {!funding && <div style={{ fontSize: 12.5, color: faint, marginTop: -8 }}>Funding: nobody has asked for test funds yet, and nothing has been paid.</div>}

      <div style={{ ...card, padding: 16 }}>
        <SectionHead title="Who is testing what" hint="Testers who are onboarding, active or have given feedback, counted by the test areas they’re assigned. A dashed bar means nobody covers that area yet." />
        {o.coverage.length === 0 ? <div style={{ fontSize: 13, color: muted }}>No test areas yet — add them in Settings.</div> : (
          <div className="flex flex-col gap-2">
            {o.coverage.map((c) => (
              <div key={c.area} className="flex items-center gap-3" style={{ fontSize: 13 }}>
                <span style={{ width: 'min(160px, 38%)', color: ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.area}>{c.area}</span>
                <span style={{ flex: 1, height: 18, borderRadius: 6, position: 'relative', border: c.testers ? 'none' : `1px dashed ${faint}` }}>
                  {c.testers > 0 && <span style={{ position: 'absolute', inset: 0, width: `${(c.testers / max) * 100}%`, background: 'rgba(245,166,35,0.55)', borderRadius: 6 }} />}
                  {!c.testers && <span style={{ position: 'absolute', left: 8, top: 1, fontSize: 11.5, color: faint }}>No one yet</span>}
                </span>
                <span style={{ width: 28, textAlign: 'right', fontFamily: 'ui-monospace, monospace', color: c.testers ? ink : faint }}>{c.testers}</span>
              </div>
            ))}
            {o.testers.total > 0 && o.coverage.every((c) => !c.testers) && (
              <Help>Assign areas to testers on the Testers tab (reports filed under an area add it automatically).</Help>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
