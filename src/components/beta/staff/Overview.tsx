'use client';
import React from 'react';
import { accent, card, type Ctx, danger, Empty, faint, ink, line, muted, SectionHead } from './ui';

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
  return (
    <div className="flex flex-col gap-5">
      {mine > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl" style={{ background: 'rgba(245,166,35,0.07)', border: '1px solid rgba(245,166,35,0.25)', padding: '10px 14px', fontSize: 13, color: ink }}>
          <b>Waiting on you:</b>
          {o.waitingOnMe.reports > 0 && <button onClick={() => ctx.goTab('reports', { waiting: 'me' })} style={{ color: accent }}>{o.waitingOnMe.reports} report{o.waitingOnMe.reports === 1 ? '' : 's'}</button>}
          {o.waitingOnMe.outreach > 0 && <button onClick={() => ctx.goTab('outreach', { view: 'mine' })} style={{ color: accent }}>{o.waitingOnMe.outreach} outreach item{o.waitingOnMe.outreach === 1 ? '' : 's'}</button>}
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 170px), 1fr))', gap: 12 }}>
        <Tile label="Testers" value={o.testers.total} sub={<>{o.testers.testingNow} testing now{o.testers.staleCheckIns ? <> · <span style={{ color: accent }}>{o.testers.staleCheckIns} check-in{o.testers.staleCheckIns === 1 ? '' : 's'} due</span></> : null}</>} onClick={() => ctx.goTab('testers')} />
        <Tile label="Outreach to send" value={o.outreach.toSend} tone={o.outreach.overdue ? 'bad' : undefined}
          sub={<>{o.outreach.awaitingApproval} waiting on approval{o.outreach.overdue ? <> · <span style={{ color: danger }}>{o.outreach.overdue} overdue</span></> : null}</>} onClick={() => ctx.goTab('outreach')} />
        <Tile label="Open bugs" value={o.bugs.open} tone={o.bugs.urgent ? 'warn' : undefined} sub={<>{o.bugs.urgent} critical or high · {o.bugs.unreviewed} unreviewed</>} onClick={() => ctx.goTab('reports')} />
        <Tile label="Waiting on funds" value={o.funds.waiting} sub={o.funds.missingWallet ? <span style={{ color: accent }}>{o.funds.missingWallet} missing a wallet</span> : 'everyone has a wallet'} onClick={() => ctx.goTab('payouts')} />
        <Tile label="Total paid" value={money(o.paid.byToken)} sub={`to ${o.paid.testers} tester${o.paid.testers === 1 ? '' : 's'}`} onClick={() => ctx.goTab('payouts')} />
      </div>

      <div style={{ ...card, padding: 16 }}>
        <SectionHead title="Test area coverage" hint="Testers who are onboarding, active or have feedback in, by the areas they're assigned" right={<span style={{ fontSize: 12, color: faint }}>Onboarding, Active and Feedback In testers</span>} />
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
          </div>
        )}
      </div>
    </div>
  );
}
