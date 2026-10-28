'use client';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Bug, HelpCircle, Lightbulb, MessageSquare, Paperclip, Plus, ThumbsUp } from 'lucide-react';
import { BUG_OPEN, effectiveSeverity, KINDS, LABEL, SEVERITY, SEVERITY_RANK, STATUS_HELP, statusesFor, values } from '@/lib/betaModel';
import { ago, type Ctx, Empty, faint, field, ink, line, muted, personName, primaryBtn, SectionHead, SEV_COLOR, STATUS_COLOR } from './ui';

const KIND_ICON: Record<string, React.ElementType> = { bug: Bug, feedback: MessageSquare, idea: Lightbulb, question: HelpCircle, praise: ThumbsUp };
const BUG_ORDER = [...values(BUG_OPEN), 'verified', 'duplicate', 'already_known', 'wont_fix'];

export interface ReportRow {
  id: string; kind: string; title: string; severity: string | null; claimedSeverity: string | null; status: string; createdAt: string;
  testArea: string | null; waitingOnId: string | null; duplicateOfId: string | null; nextActionDue: string | null; plainTicket: string | null;
  tester: { id: string; name: string; email: string | null }; task: { id: string; status: string; assignee: { name: string | null; email: string } | null } | null;
  _count: { replies: number; attachments: number; duplicates: number }; lastReplyBy: string | null;
}

export default function Reports({ ctx, initial }: { ctx: Ctx; initial: Record<string, string> }) {
  const [rows, setRows] = useState<ReportRow[] | null>(null);
  const [status, setStatus] = useState(initial.status ?? 'open');
  const [kind, setKind] = useState(initial.kind ?? '');
  const [area, setArea] = useState(initial.area ?? '');
  const [sev, setSev] = useState(initial.severity ?? '');
  const [mine, setMine] = useState(initial.waiting === 'me');
  const [q, setQ] = useState('');
  const [only, setOnly] = useState(initial.tester ?? '');
  const [legend, setLegend] = useState(false);
  const load = useCallback(async () => {
    const sp = new URLSearchParams();
    if (status === 'open') sp.set('status', values(BUG_OPEN).join(','));
    else if (status !== 'all') sp.set('status', status);
    if (kind) sp.set('kind', kind);
    if (area) sp.set('area', area);
    if (sev) sp.set('severity', sev);
    if (mine) sp.set('waiting', 'me');
    if (only) sp.set('tester', only);
    if (q.trim()) sp.set('q', q.trim());
    const d = await fetch(`/api/beta/programs/${ctx.programId}/reports?${sp}`).then((r) => r.json()).catch(() => ({}));
    setRows(d.reports ?? []);
  }, [ctx.programId, status, kind, area, sev, mine, q, only]);
  useEffect(() => { const t = setTimeout(load, q ? 250 : 0); return () => clearTimeout(t); }, [load, q, ctx.ver]);
  useEffect(() => { const on = () => load(); window.addEventListener('hub:notification', on); return () => window.removeEventListener('hub:notification', on); }, [load]);

  const [bugs, notes] = useMemo(() => {
    const list = rows ?? [];
    const b = list.filter((r) => r.kind === 'bug').sort((x, y) =>
      BUG_ORDER.indexOf(x.status) - BUG_ORDER.indexOf(y.status)
      || (SEVERITY_RANK[effectiveSeverity(x) ?? 'medium'] ?? 2) - (SEVERITY_RANK[effectiveSeverity(y) ?? 'medium'] ?? 2)
      || +new Date(y.createdAt) - +new Date(x.createdAt));
    return [b, list.filter((r) => r.kind !== 'bug')];
  }, [rows]);

  const filters = (
    <div className="flex flex-wrap items-center gap-2" style={{ marginBottom: 12 }}>
      <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status" style={{ ...field, width: 'auto' }}>
        <option value="open">Open</option><option value="all">All</option>
        <optgroup label="Bugs">{statusesFor('bug').map(([v, l]) => <option key={v} value={v}>{l}</option>)}</optgroup>
        <optgroup label="Feedback & requests">{statusesFor('feedback').filter(([v]) => v !== 'new' && v !== 'duplicate').map(([v, l]) => <option key={v} value={v}>{l}</option>)}</optgroup>
      </select>
      <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Kind" style={{ ...field, width: 'auto' }}>
        <option value="">Every kind</option>{KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      <select value={sev} onChange={(e) => setSev(e.target.value)} aria-label="Severity" style={{ ...field, width: 'auto' }}>
        <option value="">Any severity</option>{SEVERITY.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      {ctx.data.program.testAreas.length > 0 && (
        <select value={area} onChange={(e) => setArea(e.target.value)} aria-label="Test area" style={{ ...field, width: 'auto' }}>
          <option value="">Every area</option>{ctx.data.program.testAreas.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      )}
      {only && <button onClick={() => setOnly('')} style={{ fontSize: 12.5, color: muted, border: `1px solid ${line}`, borderRadius: 999, padding: '4px 10px' }}>Only {ctx.testers.find((t) => t.id === only)?.name ?? 'one tester'} ✕</button>}
      <label className="bp-tap inline-flex items-center gap-1.5" style={{ fontSize: 12.5, color: muted }}><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} style={{ width: 18, height: 18 }} /> Needs me</label>
      <button onClick={() => setLegend((x) => !x)} aria-expanded={legend} className="bp-tap" style={{ fontSize: 12.5, color: muted }}>{legend ? 'Hide' : 'What the statuses mean'}</button>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title, tester, ticket, transaction" aria-label="Search reports" style={{ ...field, width: 'min(260px, 100%)' }} />
      <span style={{ flex: 1 }} />
      <button onClick={() => ctx.logReport()} className="inline-flex items-center gap-1.5" style={primaryBtn}><Plus size={14} /> Log a report</button>
    </div>
  );

  const legendBox = legend && (
    <div className="rounded-xl" style={{ border: `1px solid ${line}`, padding: '10px 14px', marginBottom: 12, fontSize: 12.5 }}>
      {([['Bugs', statusesFor('bug')], ['Feedback, ideas and questions', statusesFor('feedback').filter(([v]) => v !== 'new' && v !== 'duplicate')]] as const).map(([group, list]) => (
        <div key={group} style={{ marginBottom: 6 }}>
          <div style={{ color: faint, fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', margin: '4px 0' }}>{group}</div>
          <dl style={{ display: 'grid', gridTemplateColumns: 'max-content minmax(0, 1fr)', gap: '3px 12px', margin: 0 }}>
            {list.map(([v, l]) => <React.Fragment key={v}><dt style={{ color: STATUS_COLOR[v] ?? ink, fontWeight: 600 }}>{l}</dt><dd style={{ color: muted, margin: 0 }}>{STATUS_HELP[v] ?? ''}</dd></React.Fragment>)}
          </dl>
        </div>
      ))}
    </div>
  );
  if (rows === null) return <div>{filters}{legendBox}<div style={{ color: faint, fontSize: 13 }}>Loading…</div></div>;
  return (
    <div>
      {filters}
      {legendBox}
      {rows.length === 0 ? <Empty>No reports match.{status === 'open' ? ' No open reports.' : ''}</Empty> : (
        <div className="flex flex-col gap-4">
          {bugs.length > 0 && (
            <div>
              <SectionHead title="Bugs" count={bugs.length} hint="For the engineers, worst first" />
              <List rows={bugs} ctx={ctx} />
            </div>
          )}
          {notes.length > 0 && (
            <div>
              <SectionHead title="Feedback, ideas, questions and praise" count={notes.length} hint="Read them, then mark them noted, passed on or shipped" />
              <List rows={notes} ctx={ctx} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function List({ rows, ctx }: { rows: ReportRow[]; ctx: Ctx }) {
  return (
    <div className="rounded-xl" style={{ border: `1px solid ${line}`, overflow: 'hidden' }}>
      <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
        {rows.map((r) => {
          const Icon = KIND_ICON[r.kind] ?? MessageSquare;
          const sev = effectiveSeverity(r);
          const waiting = personName(ctx.people, r.waitingOnId);
          return (
            <button key={r.id} onClick={() => ctx.openReport(r.id)} className="bp-row w-full text-left" style={{ padding: '10px 14px', borderBottom: `1px solid ${line}`, background: r.status === 'new' ? 'rgba(245,166,35,0.04)' : 'transparent' }}>
              <Icon size={16} style={{ color: r.kind === 'bug' ? SEV_COLOR[sev ?? 'medium'] : muted, flexShrink: 0, marginTop: 2 }} />
              <span className="bp-row-title">
                <span style={{ display: 'block', fontSize: 13.5, color: ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</span>
                <span style={{ fontSize: 12, color: faint }}>
                  {r.tester.name}
                  {r.kind === 'bug' && sev ? <> · <span style={{ color: SEV_COLOR[sev] }}>{LABEL.severity[sev]}</span>{!r.severity && <span title="As the tester reported it — not reviewed yet"> (tester’s guess)</span>}</> : r.kind !== 'bug' ? ` · ${LABEL.kind[r.kind]}` : ''}
                  {r.testArea ? ` · ${r.testArea}` : ''}
                  {r._count.duplicates ? ` · ${r._count.duplicates + 1} reports` : ''}
                  {r.duplicateOfId ? ' · duplicate' : ''}
                  {r._count.attachments ? <> · <Paperclip size={11} style={{ display: 'inline', verticalAlign: '-1px' }} />{r._count.attachments}</> : ''}
                  {r.lastReplyBy === 'tester' ? ' · tester replied' : ''}
                </span>
              </span>
              <span className="bp-row-meta">
                {waiting && <span title="Who has to do the next thing" style={{ fontSize: 12, color: muted, whiteSpace: 'nowrap' }}>→ {waiting}</span>}
                <span style={{ fontSize: 11.5, fontWeight: 600, color: STATUS_COLOR[r.status] ?? muted, whiteSpace: 'nowrap' }}>{LABEL.status[r.status] ?? r.status}</span>
                <span style={{ fontSize: 11.5, color: faint, whiteSpace: 'nowrap' }}>{ago(r.createdAt)} ago</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

