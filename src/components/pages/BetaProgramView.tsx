'use client';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, Copy, RefreshCw, X, Download, Paperclip, ExternalLink, Bug, MessageSquare, Lightbulb, HelpCircle, Trash2 } from 'lucide-react';

interface Program {
  id: string; name: string; product: string | null; slug: string; status: string; joinUrl: string; description: string | null; welcome: string | null;
  teamId: string | null; bugTeamId: string | null; maxTesters: number | null; endsAt: string | null;
  questions: { id: string; label: string; required?: boolean }[];
}
interface ReportRow {
  id: string; kind: string; title: string; severity: string | null; status: string; createdAt: string; platform: string | null;
  tester: { name: string; email: string }; task: { id: string; status: string; assignee: { name: string | null; email: string } | null } | null;
  _count: { replies: number; attachments: number }; lastReplyBy: string | null;
}
interface Team { id: string; name: string }

const ink = '#F0F0F0', muted = '#8A8A8A', faint = '#525252', panel = '#1A1A1A', line = 'rgba(255,255,255,0.07)', accent = '#F5A623';
const STATUSES = [
  ['new', 'New'], ['triaged', 'Seen'], ['in_progress', 'Being worked on'], ['fixed', 'Fixed'], ['answered', 'Answered'], ['wont_fix', 'Won’t fix'], ['duplicate', 'Duplicate'],
] as const;
const STATUS_COLOR: Record<string, string> = { new: '#F5A623', triaged: '#3B82F6', in_progress: '#8B5CF6', fixed: '#10B981', answered: '#10B981', wont_fix: '#525252', duplicate: '#525252' };
const KIND_ICON: Record<string, React.ElementType> = { bug: Bug, feedback: MessageSquare, idea: Lightbulb, question: HelpCircle };
const SEV_COLOR: Record<string, string> = { blocker: '#EF4444', major: '#F5A623', minor: '#8A8A8A' };
const ago = (iso: string) => { const s = (Date.now() - new Date(iso).getTime()) / 1000; return s < 3600 ? `${Math.max(1, Math.round(s / 60))}m` : s < 86400 ? `${Math.round(s / 3600)}h` : `${Math.round(s / 86400)}d`; };
const field: React.CSSProperties = { background: '#0D0D0D', border: `1px solid ${line}`, borderRadius: 8, color: ink, fontSize: 13, padding: '8px 10px', width: '100%', outline: 'none' };
const label: React.CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: faint, marginBottom: 5, display: 'block' };

export default function BetaProgramView({ id, initialReport }: { id: string; initialReport: string | null }) {
  const router = useRouter();
  const [p, setP] = useState<Program | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [testerCount, setTesterCount] = useState(0);
  const [canManage, setCanManage] = useState(false);
  const [tab, setTab] = useState<'reports' | 'testers' | 'settings'>('reports');
  const [teams, setTeams] = useState<Team[]>([]);
  const [openReport, setOpenReport] = useState<string | null>(initialReport);

  const load = useCallback(async () => {
    const res = await fetch(`/api/beta/programs/${id}`);
    if (!res.ok) { toast.error('Program not found'); router.push('/beta'); return; }
    const d = await res.json();
    setP(d.program); setCounts(d.counts ?? {}); setTesterCount(d.testers ?? 0); setCanManage(!!d.canManage);
  }, [id, router]);
  useEffect(() => { load(); fetch('/api/teams').then((r) => r.json()).then((d) => setTeams(d.teams ?? [])); }, [load]);

  async function patch(body: object, msg?: string) {
    const res = await fetch(`/api/beta/programs/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) { toast.error('Could not save'); return false; }
    if (msg) toast.success(msg);
    load(); return true;
  }

  if (!p) return <div style={{ color: faint, fontSize: 13, padding: 20 }}>Loading…</div>;
  const open = (counts.new ?? 0) + (counts.triaged ?? 0) + (counts.in_progress ?? 0);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Link href="/beta" aria-label="All programs" style={{ color: faint, display: 'flex' }}><ArrowLeft size={18} /></Link>
        <div style={{ flex: '1 1 260px', minWidth: 0 }}>
          <h1 style={{ fontFamily: "'Manrope', sans-serif", fontSize: 20, fontWeight: 700, color: ink }}>{p.name}</h1>
          <div style={{ fontSize: 12.5, color: faint }}>{testerCount}{p.maxTesters ? `/${p.maxTesters}` : ''} testers · {open} open report{open === 1 ? '' : 's'} · {counts.new ?? 0} new</div>
        </div>
        {canManage ? (
          <select value={p.status} onChange={(e) => patch({ status: e.target.value }, 'Status changed')} aria-label="Program status" style={{ ...field, width: 'auto' }}>
            <option value="open">Open — taking testers and reports</option>
            <option value="closed">Closed — no new joins or reports</option>
            <option value="draft">Draft — link doesn’t work yet</option>
          </select>
        ) : <span style={{ fontSize: 12, color: muted, textTransform: 'uppercase' }}>{p.status}</span>}
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl" style={{ background: panel, border: `1px solid ${line}`, padding: '10px 14px', marginBottom: 16 }}>
        <span style={{ fontSize: 12, color: faint, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Join link</span>
        <code style={{ fontSize: 12.5, color: ink, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.joinUrl}</code>
        <button onClick={() => navigator.clipboard.writeText(p.joinUrl).then(() => toast.success('Copied'))} className="inline-flex items-center gap-1" style={{ fontSize: 12.5, color: muted }}><Copy size={13} /> Copy</button>
        <a href={p.joinUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1" style={{ fontSize: 12.5, color: muted }}><ExternalLink size={13} /> Open</a>
        {canManage && (
          <button onClick={() => { if (window.confirm('Make a new join link? The current link stops working for people who haven’t joined yet. Testers who joined keep their access.')) patch({ regenerateLink: true }, 'New link made'); }}
            className="inline-flex items-center gap-1" style={{ fontSize: 12.5, color: muted }}><RefreshCw size={13} /> New link</button>
        )}
      </div>

      <div className="flex gap-1" style={{ borderBottom: `1px solid ${line}`, marginBottom: 16 }}>
        {([['reports', `Reports${counts.new ? ` (${counts.new} new)` : ''}`], ['testers', `Testers (${testerCount})`], ['settings', 'Settings']] as const).map(([t, l]) => (
          <button key={t} onClick={() => setTab(t)} style={{ padding: '9px 14px', fontSize: 13, fontWeight: 600, color: tab === t ? accent : muted, borderBottom: tab === t ? `2px solid ${accent}` : '2px solid transparent' }}>{l}</button>
        ))}
      </div>

      {tab === 'reports' && <Reports programId={id} onOpen={setOpenReport} refreshKey={openReport} />}
      {tab === 'testers' && <Testers programId={id} canManage={canManage} />}
      {tab === 'settings' && <Settings p={p} teams={teams} canManage={canManage} onSave={(b) => patch(b, 'Saved')} onDelete={async () => {
        if (!window.confirm(`Delete ${p.name} with all its testers and reports? Their tasks stay on the board.`)) return;
        await fetch(`/api/beta/programs/${id}`, { method: 'DELETE' }); toast.success('Program deleted'); router.push('/beta');
      }} />}

      {openReport && <ReportDrawer id={openReport} onClose={() => { setOpenReport(null); load(); if (initialReport) router.replace(`/beta/${id}`); }} />}
    </div>
  );
}

function Reports({ programId, onOpen, refreshKey }: { programId: string; onOpen: (id: string) => void; refreshKey: string | null }) {
  const [rows, setRows] = useState<ReportRow[] | null>(null);
  const [status, setStatus] = useState<'open' | 'all' | string>('open');
  const [kind, setKind] = useState('');
  const [q, setQ] = useState('');
  const load = useCallback(async () => {
    const sp = new URLSearchParams();
    if (status === 'open') sp.set('status', 'new,triaged,in_progress'); else if (status !== 'all') sp.set('status', status);
    if (kind) sp.set('kind', kind);
    if (q.trim()) sp.set('q', q.trim());
    const d = await fetch(`/api/beta/programs/${programId}/reports?${sp}`).then((r) => r.json());
    setRows(d.reports ?? []);
  }, [programId, status, kind, q]);
  useEffect(() => { const t = setTimeout(load, q ? 250 : 0); return () => clearTimeout(t); }, [load, q, refreshKey]);
  useEffect(() => { const on = () => load(); window.addEventListener('hub:notification', on); return () => window.removeEventListener('hub:notification', on); }, [load]);

  return (
    <div>
      <div className="flex flex-wrap gap-2" style={{ marginBottom: 12 }}>
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status" style={{ ...field, width: 'auto' }}>
          <option value="open">Open (new, seen, in progress)</option><option value="all">All</option>
          {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Kind" style={{ ...field, width: 'auto' }}>
          <option value="">Every kind</option><option value="bug">Bugs</option><option value="feedback">Feedback</option><option value="idea">Ideas</option><option value="question">Questions</option>
        </select>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search reports" aria-label="Search reports" style={{ ...field, width: 'min(280px, 100%)' }} />
      </div>
      {rows === null ? <div style={{ color: faint, fontSize: 13 }}>Loading…</div> : rows.length === 0 ? (
        <div className="rounded-xl" style={{ border: '1px dashed rgba(255,255,255,0.12)', padding: 32, textAlign: 'center', fontSize: 13, color: muted }}>No reports match. Share the join link to get testers in.</div>
      ) : (
        <div className="rounded-xl" style={{ border: `1px solid ${line}`, overflow: 'hidden' }}>
          <div style={{ maxHeight: '64vh', overflowY: 'auto' }}>
            {rows.map((r) => {
              const Icon = KIND_ICON[r.kind] ?? MessageSquare;
              return (
                <button key={r.id} onClick={() => onOpen(r.id)} className="w-full text-left flex items-center gap-3" style={{ padding: '11px 14px', borderBottom: `1px solid ${line}`, background: r.status === 'new' ? 'rgba(245,166,35,0.04)' : 'transparent' }}>
                  <Icon size={16} style={{ color: r.kind === 'bug' ? SEV_COLOR[r.severity ?? 'minor'] : muted, flexShrink: 0 }} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 13.5, color: ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</span>
                    <span style={{ fontSize: 12, color: faint }}>
                      {r.tester.name}{r.severity ? ` · ${r.severity}` : ''}{r.platform ? ` · ${r.platform}` : ''}
                      {r._count.attachments ? ` · ${r._count.attachments} file${r._count.attachments === 1 ? '' : 's'}` : ''}
                      {r.lastReplyBy === 'tester' ? ' · tester replied' : ''}
                    </span>
                  </span>
                  <span style={{ fontSize: 12, color: muted, whiteSpace: 'nowrap' }}>{r.task?.assignee ? (r.task.assignee.name || r.task.assignee.email) : 'Unassigned'}</span>
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: STATUS_COLOR[r.status], minWidth: 90, textAlign: 'right' }}>{STATUSES.find(([v]) => v === r.status)?.[1] ?? r.status}</span>
                  <span style={{ fontSize: 11.5, color: faint, minWidth: 28, textAlign: 'right' }}>{ago(r.createdAt)}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function ReportDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const [r, setR] = useState<any>(null);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { const res = await fetch(`/api/beta/reports/${id}`); if (res.ok) setR((await res.json()).report); }, [id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);

  async function setStatus(status: string) {
    const res = await fetch(`/api/beta/reports/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
    if (res.ok) { toast.success('Status updated — the tester sees it'); load(); } else toast.error('Could not update');
  }
  async function send() {
    if (!reply.trim()) return;
    setBusy(true);
    const res = await fetch(`/api/beta/reports/${id}/replies`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: reply }) });
    setBusy(false);
    if (res.ok) { setReply(''); toast.success('Sent — the tester sees it in their portal'); load(); } else toast.error('Could not send');
  }

  const facts = useMemo(() => r ? ([
    ['From', `${r.tester.name} <${r.tester.email}>${r.tester.contact ? ` · ${r.tester.contact}` : ''}`],
    r.severity && ['Severity', r.severity], r.platform && ['Device', r.platform], r.pageUrl && ['Where', r.pageUrl],
    r.expected && ['Expected', r.expected], r.actual && ['Actual', r.actual],
  ].filter(Boolean) as [string, string][]) : [], [r]);

  return (
    <div role="dialog" aria-modal="true" aria-label="Report" onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(560px, 100%)', height: '100%', background: panel, borderLeft: `1px solid ${line}`, padding: 20, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {!r ? <div style={{ color: faint }}>Loading…</div> : (
          <>
            <div className="flex items-start gap-2">
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11.5, color: faint, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>{r.kind}</div>
                <h2 style={{ fontSize: 17, fontWeight: 700, color: ink, lineHeight: 1.3 }}>{r.title}</h2>
              </div>
              <button onClick={onClose} aria-label="Close" style={{ color: faint }}><X size={18} /></button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select value={r.status} onChange={(e) => setStatus(e.target.value)} aria-label="Status" style={{ ...field, width: 'auto' }}>
                {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              {r.task && (
                <Link href={`/tasks?task=${r.task.id}`} style={{ fontSize: 12.5, color: accent }}>
                  Task · {r.task.status.replace('_', ' ').toLowerCase()} · {r.task.assignee ? (r.task.assignee.name || r.task.assignee.email) : r.task.team?.name ?? 'unassigned'}
                </Link>
              )}
            </div>
            <p style={{ fontSize: 13.5, color: ink, whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>{r.body}</p>
            {r.steps && <div><span style={label}>Steps</span><p style={{ fontSize: 13, color: ink, whiteSpace: 'pre-wrap' }}>{r.steps}</p></div>}
            <dl style={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '4px 12px', fontSize: 12.5 }}>
              {facts.map(([k, v]) => <React.Fragment key={k}><dt style={{ color: faint }}>{k}</dt><dd style={{ color: muted, wordBreak: 'break-word' }}>{v}</dd></React.Fragment>)}
            </dl>
            {r.attachments.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {r.attachments.map((a: any) => a.contentType.startsWith('image/') ? (
                  <a key={a.id} href={`/api/beta/attachments/${a.id}`} target="_blank" rel="noreferrer" title={a.filename}>
                    <img src={`/api/beta/attachments/${a.id}`} alt={a.filename} style={{ width: 120, height: 80, objectFit: 'cover', borderRadius: 8, border: `1px solid ${line}` }} />
                  </a>
                ) : (
                  <a key={a.id} href={`/api/beta/attachments/${a.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg" style={{ fontSize: 12.5, color: muted, border: `1px solid ${line}`, padding: '6px 10px' }}>
                    <Paperclip size={13} /> {a.filename}
                  </a>
                ))}
              </div>
            )}
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
              <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={3} placeholder="Reply to the tester — they see it on their beta page" style={{ ...field, resize: 'vertical' }} />
              <div className="flex justify-end">
                <button onClick={send} disabled={busy || !reply.trim()} className="rounded-lg" style={{ background: accent, color: '#0D0D0D', fontSize: 13, fontWeight: 600, padding: '8px 16px', opacity: busy || !reply.trim() ? 0.5 : 1 }}>{busy ? 'Sending…' : 'Send reply'}</button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Testers({ programId, canManage }: { programId: string; canManage: boolean }) {
  const [rows, setRows] = useState<any[] | null>(null);
  const load = useCallback(async () => { const d = await fetch(`/api/beta/programs/${programId}/testers`).then((r) => r.json()); setRows(d.testers ?? []); }, [programId]);
  useEffect(() => { load(); }, [load]);
  async function setStatus(t: any, status: string) {
    if (status === 'removed' && !window.confirm(`Remove ${t.name}? Their personal link stops working; their reports stay.`)) return;
    const res = await fetch(`/api/beta/testers/${t.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
    if (res.ok) load();
  }
  if (!rows) return <div style={{ color: faint, fontSize: 13 }}>Loading…</div>;
  return (
    <div>
      <div className="flex justify-end" style={{ marginBottom: 10 }}>
        <a href={`/api/beta/programs/${programId}/testers?format=csv`} className="inline-flex items-center gap-1.5 rounded-lg" style={{ fontSize: 12.5, color: muted, border: `1px solid ${line}`, padding: '6px 10px' }}><Download size={13} /> Download CSV</a>
      </div>
      {rows.length === 0 ? <div style={{ fontSize: 13, color: muted }}>No testers yet.</div> : (
        <div className="rounded-xl" style={{ border: `1px solid ${line}`, maxHeight: '64vh', overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ position: 'sticky', top: 0, background: panel }}>
              {['Name', 'Email', 'Contact', 'Device', 'Reports', 'Joined', ''].map((h) => <th key={h} style={{ textAlign: 'left', padding: '9px 12px', color: faint, fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: `1px solid ${line}` }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id} style={{ opacity: t.status === 'active' ? 1 : 0.5 }}>
                  <td style={{ padding: '8px 12px', color: ink, borderBottom: `1px solid ${line}` }}>{t.name}</td>
                  <td style={{ padding: '8px 12px', color: muted, borderBottom: `1px solid ${line}` }}>{t.email}</td>
                  <td style={{ padding: '8px 12px', color: muted, borderBottom: `1px solid ${line}` }}>{t.contact ?? ''}</td>
                  <td style={{ padding: '8px 12px', color: muted, borderBottom: `1px solid ${line}` }}>{t.platform ?? ''}</td>
                  <td style={{ padding: '8px 12px', color: ink, borderBottom: `1px solid ${line}`, fontFamily: 'ui-monospace, monospace' }}>{t.reports}</td>
                  <td style={{ padding: '8px 12px', color: faint, borderBottom: `1px solid ${line}` }}>{new Date(t.createdAt).toLocaleDateString()}</td>
                  <td style={{ padding: '8px 12px', borderBottom: `1px solid ${line}`, textAlign: 'right' }}>
                    {canManage && (t.status === 'active'
                      ? <button onClick={() => setStatus(t, 'removed')} style={{ fontSize: 12, color: faint }}>Remove</button>
                      : <button onClick={() => setStatus(t, 'active')} style={{ fontSize: 12, color: muted }}>Restore</button>)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Settings({ p, teams, canManage, onSave, onDelete }: { p: Program; teams: Team[]; canManage: boolean; onSave: (b: object) => Promise<boolean>; onDelete: () => void }) {
  const [f, setF] = useState({
    name: p.name, product: p.product ?? '', description: p.description ?? '', welcome: p.welcome ?? '',
    teamId: p.teamId ?? '', bugTeamId: p.bugTeamId ?? '', maxTesters: p.maxTesters ? String(p.maxTesters) : '', endsAt: p.endsAt ? p.endsAt.slice(0, 10) : '',
  });
  const [questions, setQuestions] = useState(p.questions);
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  const dis = !canManage;
  return (
    <div className="flex flex-col gap-4 rounded-xl" style={{ background: panel, border: `1px solid ${line}`, padding: 18, maxWidth: 720 }}>
      <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div><span style={label}>Program name</span><input disabled={dis} value={f.name} onChange={(e) => set('name', e.target.value)} style={field} /></div>
        <div><span style={label}>Product</span><input disabled={dis} value={f.product} onChange={(e) => set('product', e.target.value)} style={field} /></div>
      </div>
      <div><span style={label}>Join page text</span><textarea disabled={dis} rows={4} value={f.description} onChange={(e) => set('description', e.target.value)} style={{ ...field, resize: 'vertical' }} /></div>
      <div><span style={label}>Welcome note (after joining)</span><textarea disabled={dis} rows={3} value={f.welcome} onChange={(e) => set('welcome', e.target.value)} placeholder="What to test first, where to find the build, how long the beta runs." style={{ ...field, resize: 'vertical' }} /></div>
      <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 1fr 110px 150px' }}>
        <div><span style={label}>Reports go to</span><select disabled={dis} value={f.teamId} onChange={(e) => set('teamId', e.target.value)} style={field}><option value="">No team</option>{teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
        <div><span style={label}>Bugs go to</span><select disabled={dis} value={f.bugTeamId} onChange={(e) => set('bugTeamId', e.target.value)} style={field}><option value="">Same team</option>{teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
        <div><span style={label}>Max testers</span><input disabled={dis} inputMode="numeric" value={f.maxTesters} onChange={(e) => set('maxTesters', e.target.value)} placeholder="No cap" style={field} /></div>
        <div><span style={label}>Ends</span><input disabled={dis} type="date" value={f.endsAt} onChange={(e) => set('endsAt', e.target.value)} style={{ ...field, colorScheme: 'dark' }} /></div>
      </div>
      <div>
        <span style={label}>Sign-up questions</span>
        <div className="flex flex-col gap-2">
          {questions.map((q, i) => (
            <div key={q.id} className="flex items-center gap-2">
              <input disabled={dis} value={q.label} onChange={(e) => setQuestions((qs) => qs.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} style={field} />
              <label className="flex items-center gap-1" style={{ fontSize: 12, color: muted, whiteSpace: 'nowrap' }}><input disabled={dis} type="checkbox" checked={!!q.required} onChange={(e) => setQuestions((qs) => qs.map((x, j) => (j === i ? { ...x, required: e.target.checked } : x)))} /> required</label>
              {!dis && <button onClick={() => setQuestions((qs) => qs.filter((_, j) => j !== i))} aria-label="Remove question" style={{ color: faint }}><X size={15} /></button>}
            </div>
          ))}
          {!dis && questions.length < 10 && (
            <button onClick={() => setQuestions((qs) => [...qs, { id: `q${Date.now().toString(36)}`, label: '', required: false }])} style={{ fontSize: 12.5, color: muted, alignSelf: 'flex-start' }}>+ Add a question (e.g. “How often do you trade?”)</button>
          )}
        </div>
      </div>
      {canManage && (
        <div className="flex items-center gap-2">
          <button onClick={onDelete} className="inline-flex items-center gap-1.5" style={{ fontSize: 12.5, color: faint }}><Trash2 size={14} /> Delete program</button>
          <span style={{ flex: 1 }} />
          <button onClick={() => onSave({ ...f, endsAt: f.endsAt ? `${f.endsAt}T23:59:00Z` : null, questions: questions.filter((q) => q.label.trim()) })}
            className="rounded-lg" style={{ background: accent, color: '#0D0D0D', fontSize: 13, fontWeight: 600, padding: '8px 16px' }}>Save settings</button>
        </div>
      )}
    </div>
  );
}
