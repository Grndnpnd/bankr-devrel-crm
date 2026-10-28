'use client';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Bug, HelpCircle, Lightbulb, MessageSquare, Paperclip, Plus, ThumbsUp } from 'lucide-react';
import { BUG_OPEN, effectiveSeverity, KINDS, LABEL, SEVERITY, SEVERITY_RANK, statusesFor, values } from '@/lib/betaModel';
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
      <label className="inline-flex items-center gap-1.5" style={{ fontSize: 12.5, color: muted }}><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> Waiting on me</label>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title, tester, ticket, tx" aria-label="Search reports" style={{ ...field, width: 'min(260px, 100%)' }} />
      <span style={{ flex: 1 }} />
      <button onClick={() => ctx.logReport()} className="inline-flex items-center gap-1.5" style={primaryBtn}><Plus size={14} /> Log a report</button>
    </div>
  );

  if (rows === null) return <div>{filters}<div style={{ color: faint, fontSize: 13 }}>Loading…</div></div>;
  return (
    <div>
      {filters}
      {rows.length === 0 ? <Empty>No reports match.{status === 'open' ? ' Nothing open — nice.' : ''}</Empty> : (
        <div className="flex flex-col gap-4">
          {bugs.length > 0 && (
            <div>
              <SectionHead title="Bugs" count={bugs.length} hint="For engineering, worst first" />
              <List rows={bugs} ctx={ctx} />
            </div>
          )}
          {notes.length > 0 && (
            <div>
              <SectionHead title="Feedback, ideas, questions and praise" count={notes.length} hint="For reading; note, pass on or ship them" />
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
            <button key={r.id} onClick={() => ctx.openReport(r.id)} className="w-full text-left flex items-center gap-3" style={{ padding: '10px 14px', borderBottom: `1px solid ${line}`, background: r.status === 'new' ? 'rgba(245,166,35,0.04)' : 'transparent' }}>
              <Icon size={16} style={{ color: r.kind === 'bug' ? SEV_COLOR[sev ?? 'medium'] : muted, flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 13.5, color: ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</span>
                <span style={{ fontSize: 12, color: faint }}>
                  {r.tester.name}
                  {r.kind === 'bug' && sev ? <> · <span style={{ color: SEV_COLOR[sev] }}>{LABEL.severity[sev]}</span>{!r.severity && <span title="As the tester reported it — not reviewed yet"> (claimed)</span>}</> : r.kind !== 'bug' ? ` · ${LABEL.kind[r.kind]}` : ''}
                  {r.testArea ? ` · ${r.testArea}` : ''}
                  {r._count.duplicates ? ` · ${r._count.duplicates + 1} reports` : ''}
                  {r.duplicateOfId ? ' · duplicate' : ''}
                  {r._count.attachments ? <> · <Paperclip size={11} style={{ display: 'inline', verticalAlign: '-1px' }} />{r._count.attachments}</> : ''}
                  {r.lastReplyBy === 'tester' ? ' · tester replied' : ''}
                </span>
              </span>
              {waiting && <span className="hidden sm:inline" title="Waiting on" style={{ fontSize: 12, color: muted, whiteSpace: 'nowrap' }}>→ {waiting}</span>}
              <span style={{ fontSize: 11.5, fontWeight: 600, color: STATUS_COLOR[r.status] ?? muted, minWidth: 70, textAlign: 'right' }}>{LABEL.status[r.status] ?? r.status}</span>
              <span style={{ fontSize: 11.5, color: faint, minWidth: 28, textAlign: 'right' }}>{ago(r.createdAt)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

