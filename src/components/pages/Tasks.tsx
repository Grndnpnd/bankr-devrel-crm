'use client';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { CheckSquare, Plus, Search, X, ExternalLink, Trash2, Calendar, MessageSquare, Bot, Send, Mail, FlaskConical, LifeBuoy, Sparkles } from 'lucide-react';

type Status = 'TODO' | 'IN_PROGRESS' | 'BLOCKED' | 'DONE';
interface Person { id: string; name: string | null; email: string }
interface Team { id: string; name: string; color: string; members: { userId: string; role: string }[] }
interface Task {
  id: string; title: string; body: string | null; status: Status; priority: number; dueAt: string | null;
  assigneeId: string | null; teamId: string | null; createdById: string | null;
  source: string; sourceUrl: string | null; position: number; createdAt: string; completedAt: string | null;
  assignee: Person | null; createdBy: Person | null; team: { id: string; name: string; color: string } | null;
}

const COLUMNS: { status: Status; label: string; tint: string }[] = [
  { status: 'TODO', label: 'To do', tint: '#8A8A8A' },
  { status: 'IN_PROGRESS', label: 'In progress', tint: '#3B82F6' },
  { status: 'BLOCKED', label: 'Blocked', tint: '#EF4444' },
  { status: 'DONE', label: 'Done', tint: '#10B981' },
];
const PRIORITIES = [
  { v: 0, label: 'Urgent', color: '#EF4444' }, { v: 1, label: 'High', color: '#F5A623' },
  { v: 2, label: 'Normal', color: '#525252' }, { v: 3, label: 'Low', color: '#3A3A3A' },
];
const SOURCE_ICON: Record<string, React.ElementType> = {
  slack: MessageSquare, claude: Bot, telegram: Send, gmail: Mail, beta: FlaskConical, plain: LifeBuoy, agent: Sparkles,
};

const ink = '#F0F0F0', muted = '#8A8A8A', faint = '#525252', panel = '#1A1A1A', line = 'rgba(255,255,255,0.07)', accent = '#F5A623';
const initials = (p: Person | null) => (p?.name || p?.email || '?').split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join('');
const shortDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

export default function Tasks() {
  const router = useRouter();
  const params = useSearchParams();
  const [scope, setScope] = useState<'mine' | 'teams' | 'all'>('mine');
  const [teamFilter, setTeamFilter] = useState<string>(params.get('team') || '');
  const [q, setQ] = useState('');
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [me, setMe] = useState<string>('');
  const [open, setOpen] = useState<Task | 'new' | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const sp = new URLSearchParams({ scope: teamFilter ? 'all' : scope });
    if (teamFilter) sp.set('team', teamFilter);
    if (q.trim()) sp.set('q', q.trim());
    const res = await fetch(`/api/tasks?${sp}`);
    if (res.ok) setTasks((await res.json()).tasks);
  }, [scope, teamFilter, q]);

  useEffect(() => {
    fetch('/api/teams').then((r) => r.json()).then((d) => { setTeams(d.teams ?? []); setPeople(d.people ?? []); setMe(d.me ?? ''); });
  }, []);
  useEffect(() => { const t = setTimeout(load, q ? 250 : 0); return () => clearTimeout(t); }, [load, q]);
  // Live: refresh when a notification arrives, and every 30 s while open.
  useEffect(() => {
    const on = () => load();
    window.addEventListener('hub:notification', on);
    const iv = setInterval(() => { if (!document.hidden) load(); }, 30_000);
    return () => { window.removeEventListener('hub:notification', on); clearInterval(iv); };
  }, [load]);

  // ?task=<id> (from a notification) opens that task.
  const taskParam = params.get('task');
  useEffect(() => {
    if (!taskParam) return;
    fetch(`/api/tasks/${taskParam}`).then((r) => (r.ok ? r.json() : null)).then((d) => { if (d?.task) setOpen(d.task); });
  }, [taskParam]);

  const closeDrawer = () => {
    setOpen(null);
    if (taskParam) router.replace('/tasks');
  };

  const byStatus = useMemo(() => {
    const m: Record<Status, Task[]> = { TODO: [], IN_PROGRESS: [], BLOCKED: [], DONE: [] };
    for (const t of tasks ?? []) m[t.status].push(t);
    for (const k of Object.keys(m) as Status[]) m[k].sort((a, b) => a.position - b.position);
    return m;
  }, [tasks]);

  async function move(id: string, status: Status, beforeId: string | null) {
    const col = byStatus[status].filter((t) => t.id !== id);
    const idx = beforeId ? col.findIndex((t) => t.id === beforeId) : col.length;
    const prev = col[idx - 1]?.position, next = col[idx]?.position;
    const position = prev === undefined && next === undefined ? 0 : prev === undefined ? next! - 1 : next === undefined ? prev + 1 : (prev + next) / 2;
    setTasks((ts) => ts?.map((t) => (t.id === id ? { ...t, status, position } : t)) ?? null);
    const res = await fetch(`/api/tasks/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status, position }) });
    if (!res.ok) { toast.error('Could not move the task'); load(); }
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <CheckSquare size={22} style={{ color: accent }} />
        <div style={{ flex: '1 1 260px' }}>
          <h1 style={{ fontFamily: "'Manrope', sans-serif", fontSize: 22, fontWeight: 700, color: ink }}>Tasks</h1>
          <p style={{ fontSize: 13, color: muted, marginTop: 2 }}>One board for everything that needs doing — from the app, Slack, Claude, testers and email.</p>
        </div>
        <button onClick={() => setOpen('new')} className="flex items-center gap-2 rounded-lg" style={{ background: accent, color: '#0D0D0D', fontSize: 13, fontWeight: 600, padding: '9px 14px' }}>
          <Plus size={16} /> New task
        </button>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-lg" style={{ background: panel, padding: 2, opacity: teamFilter ? 0.5 : 1 }}>
          {([['mine', 'Assigned to me'], ['teams', 'My teams'], ['all', 'Everything']] as const).map(([id, label]) => (
            <button key={id} onClick={() => { setScope(id); setTeamFilter(''); }} aria-pressed={!teamFilter && scope === id} className="rounded-md"
              style={{ padding: '7px 12px', fontSize: 13, fontWeight: 500, background: !teamFilter && scope === id ? '#2A2A2A' : 'transparent', color: !teamFilter && scope === id ? ink : faint }}>
              {label}
            </button>
          ))}
        </div>
        <select value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)} aria-label="Filter by team"
          style={{ background: panel, border: `1px solid ${line}`, color: teamFilter ? ink : muted, fontSize: 13, borderRadius: 8, padding: '8px 10px' }}>
          <option value="">Any team</option>
          {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <label className="flex items-center gap-2 rounded-lg" style={{ background: panel, border: `1px solid ${line}`, padding: '0 10px', flex: '1 1 200px', maxWidth: 320 }}>
          <Search size={15} style={{ color: faint }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tasks" aria-label="Search tasks"
            style={{ background: 'transparent', border: 0, outline: 'none', color: ink, fontSize: 13, padding: '8px 0', width: '100%' }} />
        </label>
      </div>

      {tasks === null ? (
        <div style={{ color: faint, fontSize: 13, padding: 20 }}>Loading…</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(240px, 1fr))', gap: 14, overflowX: 'auto', paddingBottom: 8 }}>
          {COLUMNS.map((col) => (
            <section key={col.status} aria-label={col.label}
              onDragOver={(e) => { if (dragId) e.preventDefault(); }}
              onDrop={(e) => { e.preventDefault(); if (dragId) move(dragId, col.status, null); setDragId(null); }}
              className="rounded-xl" style={{ background: '#141414', border: `1px solid ${line}`, padding: 10, minHeight: 320, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className="flex items-center gap-2" style={{ padding: '2px 4px 6px' }}>
                <span style={{ width: 8, height: 8, borderRadius: 4, background: col.tint }} />
                <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: muted }}>{col.label}</span>
                <span style={{ fontSize: 12, color: faint, marginLeft: 'auto' }}>{byStatus[col.status].length}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '68vh', overflowY: 'auto' }}>
                {byStatus[col.status].map((t) => (
                  <TaskCard key={t.id} t={t} me={me} onOpen={() => setOpen(t)}
                    onDragStart={() => setDragId(t.id)} onDragEnd={() => setDragId(null)}
                    onDropBefore={() => { if (dragId && dragId !== t.id) move(dragId, col.status, t.id); setDragId(null); }} />
                ))}
                {byStatus[col.status].length === 0 && (
                  <div style={{ fontSize: 12, color: '#3A3A3A', textAlign: 'center', padding: '24px 0' }}>
                    {col.status === 'TODO' && !q ? 'Nothing here — add a task or drop one in' : 'Empty'}
                  </div>
                )}
              </div>
            </section>
          ))}
        </div>
      )}

      {open && (
        <TaskDrawer
          task={open === 'new' ? null : open}
          defaults={{ teamId: teamFilter || null, assigneeId: open === 'new' && !teamFilter && scope === 'mine' ? me : null }}
          teams={teams} people={people} me={me}
          onClose={closeDrawer}
          onSaved={(t) => { setOpen(t); load(); }}
          onDeleted={() => { closeDrawer(); load(); }}
        />
      )}
    </div>
  );
}

function TaskCard({ t, me, onOpen, onDragStart, onDragEnd, onDropBefore }: {
  t: Task; me: string; onOpen: () => void; onDragStart: () => void; onDragEnd: () => void; onDropBefore: () => void;
}) {
  const overdue = t.dueAt && t.status !== 'DONE' && new Date(t.dueAt) < new Date();
  const Src = SOURCE_ICON[t.source];
  const pr = PRIORITIES[t.priority] ?? PRIORITIES[2];
  return (
    <div draggable onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; onDragStart(); }} onDragEnd={onDragEnd}
      onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); e.stopPropagation(); onDropBefore(); }}
      onClick={onOpen} onKeyDown={(e) => { if (e.key === 'Enter') onOpen(); }} role="button" tabIndex={0}
      className="rounded-lg" style={{ background: panel, border: `1px solid ${line}`, padding: '10px 11px', cursor: 'pointer', opacity: t.status === 'DONE' ? 0.65 : 1 }}>
      <div className="flex items-start gap-2">
        {t.priority < 2 && <span title={pr.label} style={{ width: 6, height: 6, borderRadius: 3, background: pr.color, marginTop: 6, flexShrink: 0 }} />}
        <span style={{ fontSize: 13, color: ink, lineHeight: 1.4, flex: 1, textDecoration: t.status === 'DONE' ? 'line-through' : 'none' }}>{t.title}</span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5" style={{ marginTop: 8 }}>
        {t.team && <span style={{ fontSize: 11, color: t.team.color, border: `1px solid ${t.team.color}55`, borderRadius: 999, padding: '1px 7px' }}>{t.team.name}</span>}
        {t.dueAt && (
          <span className="inline-flex items-center gap-1" style={{ fontSize: 11, color: overdue ? '#EF4444' : muted }}>
            <Calendar size={11} /> {shortDate(t.dueAt)}
          </span>
        )}
        {Src && <span title={`From ${t.source}`}><Src size={12} style={{ color: faint }} /></span>}
        <span style={{ marginLeft: 'auto' }} />
        {t.assignee ? (
          <span title={t.assignee.name || t.assignee.email} className="inline-flex items-center justify-center"
            style={{ width: 22, height: 22, borderRadius: 11, fontSize: 10, fontWeight: 700, background: t.assigneeId === me ? 'rgba(245,166,35,0.2)' : '#2A2A2A', color: t.assigneeId === me ? accent : muted }}>
            {initials(t.assignee)}
          </span>
        ) : <span style={{ fontSize: 11, color: faint }}>Unassigned</span>}
      </div>
    </div>
  );
}

function TaskDrawer({ task, defaults, teams, people, me, onClose, onSaved, onDeleted }: {
  task: Task | null; defaults: { teamId: string | null; assigneeId: string | null }; teams: Team[]; people: Person[]; me: string;
  onClose: () => void; onSaved: (t: Task) => void; onDeleted: () => void;
}) {
  const isNew = !task;
  const [f, setF] = useState(() => ({
    title: task?.title ?? '', body: task?.body ?? '', status: task?.status ?? ('TODO' as Status), priority: task?.priority ?? 2,
    dueAt: task?.dueAt ? task.dueAt.slice(0, 10) : '', assigneeId: task?.assigneeId ?? defaults.assigneeId ?? '',
    teamId: task?.teamId ?? defaults.teamId ?? '', sourceUrl: task?.sourceUrl ?? '',
  }));
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  // People on the chosen team first.
  const teamPeople = useMemo(() => {
    const ids = new Set(teams.find((t) => t.id === f.teamId)?.members.map((m) => m.userId) ?? []);
    return [...people].sort((a, b) => Number(ids.has(b.id)) - Number(ids.has(a.id)));
  }, [people, teams, f.teamId]);

  async function save() {
    if (!f.title.trim()) { toast.error('Give the task a title'); return; }
    setBusy(true);
    const payload = {
      title: f.title, body: f.body || null, status: f.status, priority: f.priority,
      dueAt: f.dueAt ? new Date(`${f.dueAt}T17:00:00`).toISOString() : null,
      assigneeId: f.assigneeId || null, teamId: f.teamId || null, sourceUrl: f.sourceUrl || null,
    };
    const res = await fetch(isNew ? '/api/tasks' : `/api/tasks/${task!.id}`, {
      method: isNew ? 'POST' : 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    setBusy(false);
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(d.error ?? 'Could not save'); return; }
    toast.success(isNew ? 'Task created' : 'Saved');
    onSaved(d.task);
  }

  async function remove() {
    if (!window.confirm('Delete this task?')) return;
    const res = await fetch(`/api/tasks/${task!.id}`, { method: 'DELETE' });
    const d = await res.json().catch(() => ({}));
    if (res.ok) { toast.success('Deleted'); onDeleted(); } else toast.error(d.error ?? 'Could not delete');
  }

  const field: React.CSSProperties = { background: '#0D0D0D', border: `1px solid ${line}`, borderRadius: 8, color: ink, fontSize: 13, padding: '8px 10px', width: '100%', outline: 'none' };
  const label: React.CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: faint, marginBottom: 5, display: 'block' };

  return (
    <div role="dialog" aria-modal="true" aria-label={isNew ? 'New task' : 'Task'} onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(460px, 100%)', height: '100%', background: panel, borderLeft: `1px solid ${line}`, padding: 20, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="flex items-center">
          <h2 style={{ fontSize: 15, fontWeight: 700, color: ink, flex: 1 }}>{isNew ? 'New task' : 'Task'}</h2>
          {!isNew && (task!.createdById === me) && (
            <button onClick={remove} aria-label="Delete task" title="Delete" style={{ color: faint, marginRight: 10 }}><Trash2 size={16} /></button>
          )}
          <button onClick={onClose} aria-label="Close" style={{ color: faint }}><X size={18} /></button>
        </div>
        <div><span style={label}>Title</span><input autoFocus={isNew} value={f.title} onChange={(e) => set('title', e.target.value)} style={field} /></div>
        <div><span style={label}>Details</span><textarea value={f.body} onChange={(e) => set('body', e.target.value)} rows={5} style={{ ...field, resize: 'vertical' }} /></div>
        <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <div>
            <span style={label}>Status</span>
            <select value={f.status} onChange={(e) => set('status', e.target.value as Status)} style={field}>
              {COLUMNS.map((c) => <option key={c.status} value={c.status}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <span style={label}>Priority</span>
            <select value={f.priority} onChange={(e) => set('priority', Number(e.target.value))} style={field}>
              {PRIORITIES.map((p) => <option key={p.v} value={p.v}>{p.label}</option>)}
            </select>
          </div>
          <div>
            <span style={label}>Team</span>
            <select value={f.teamId} onChange={(e) => set('teamId', e.target.value)} style={field}>
              <option value="">No team</option>
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <span style={label}>Owner</span>
            <select value={f.assigneeId} onChange={(e) => set('assigneeId', e.target.value)} style={field}>
              <option value="">Unassigned</option>
              {teamPeople.map((p) => <option key={p.id} value={p.id}>{p.id === me ? 'Me' : p.name || p.email}</option>)}
            </select>
          </div>
          <div>
            <span style={label}>Due</span>
            <input type="date" value={f.dueAt} onChange={(e) => set('dueAt', e.target.value)} style={{ ...field, colorScheme: 'dark' }} />
          </div>
          <div>
            <span style={label}>Link</span>
            <input value={f.sourceUrl} onChange={(e) => set('sourceUrl', e.target.value)} placeholder="https://…" style={field} />
          </div>
        </div>
        {f.sourceUrl && /^https?:\/\//.test(f.sourceUrl) && (
          <a href={f.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5" style={{ fontSize: 12.5, color: accent }}>
            Open the source <ExternalLink size={12} />
          </a>
        )}
        {!isNew && (
          <div style={{ fontSize: 12, color: faint, lineHeight: 1.6 }}>
            Created {new Date(task!.createdAt).toLocaleString()} by {task!.createdBy?.name || task!.createdBy?.email || 'someone'}
            {task!.source !== 'app' ? ` · from ${task!.source}` : ''}
            {task!.completedAt ? ` · done ${new Date(task!.completedAt).toLocaleString()}` : ''}
          </div>
        )}
        <div className="flex justify-end gap-2" style={{ marginTop: 'auto' }}>
          <button onClick={onClose} className="rounded-lg" style={{ color: muted, fontSize: 13, padding: '8px 14px' }}>Cancel</button>
          <button onClick={save} disabled={busy} className="rounded-lg" style={{ background: accent, color: '#0D0D0D', fontSize: 13, fontWeight: 600, padding: '8px 16px', opacity: busy ? 0.5 : 1 }}>
            {busy ? 'Saving…' : isNew ? 'Create task' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
