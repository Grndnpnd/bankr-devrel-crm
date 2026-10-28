'use client';
import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { FlaskConical, Plus, Copy, X } from 'lucide-react';

interface Program {
  id: string; name: string; product: string | null; slug: string; status: string; joinUrl: string;
  team: { name: string; color: string } | null; bugTeam: { name: string; color: string } | null;
  testers: number; reports: number; openReports: number; newReports: number; maxTesters: number | null; endsAt: string | null; createdAt: string; ended?: boolean;
}
interface Team { id: string; name: string }

const ink = '#F0F0F0', muted = '#8A8A8A', faint = '#525252', panel = '#1A1A1A', line = 'rgba(255,255,255,0.07)', accent = '#F5A623';
const STATUS_TINT: Record<string, string> = { open: '#10B981', draft: '#8A8A8A', closed: '#525252' };

export default function Beta() {
  const router = useRouter();
  const [programs, setPrograms] = useState<Program[] | null>(null);
  const [loadErr, setLoadErr] = useState(false);
  const [canManage, setCanManage] = useState(false);
  const [creating, setCreating] = useState(false);
  const [teams, setTeams] = useState<Team[]>([]);

  const load = useCallback(async () => {
    const res = await fetch('/api/beta/programs').catch(() => null);
    if (!res?.ok) { setLoadErr(true); return; }
    const d = await res.json();
    setPrograms(d.programs ?? []); setCanManage(!!d.canManage); setLoadErr(false);
  }, []);
  useEffect(() => { load(); fetch('/api/teams').then((r) => r.json()).then((d) => setTeams(d.teams ?? [])); }, [load]);

  return (
    <div>
      <style>{'@media (max-width:767px){.beta-tap{min-height:40px;min-width:40px;display:inline-flex !important;align-items:center;padding:0 8px}}'}</style>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <FlaskConical size={22} style={{ color: accent }} />
        <div style={{ flex: '1 1 260px' }}>
          <h1 style={{ fontFamily: "'Manrope', sans-serif", fontSize: 22, fontWeight: 700, color: ink }}>Beta programs</h1>
          <p style={{ fontSize: 13, color: muted, marginTop: 2 }}>One program per launch. Share its join link; testers file bugs and ideas that land as tasks for the right team.</p>
        </div>
        {canManage && (
          <button onClick={() => setCreating(true)} className="flex items-center gap-2 rounded-lg" style={{ background: accent, color: '#0D0D0D', fontSize: 13, fontWeight: 600, padding: '9px 14px' }}>
            <Plus size={16} /> New program
          </button>
        )}
      </div>

      {loadErr ? <div style={{ color: muted, fontSize: 13, padding: 20 }}>Couldn’t load programs. <button onClick={load} style={{ color: accent }}>Try again</button></div> : programs === null ? <ListSkeleton /> : programs.length === 0 ? (
        <div className="rounded-xl flex flex-col items-center gap-3" style={{ border: '1px dashed rgba(255,255,255,0.12)', padding: '32px 20px', textAlign: 'center', fontSize: 13.5, color: muted }}>
          <b style={{ color: ink, fontSize: 15 }}>No beta programs yet</b>
          <span style={{ maxWidth: 460 }}>A beta program is a group of outside testers for one launch. You get a link to share; people join with their email, report bugs and ideas with screenshots, and you answer them here. Each report becomes a task for your team.</span>
          {canManage && <button onClick={() => setCreating(true)} className="flex items-center gap-2 rounded-lg" style={{ background: accent, color: '#0D0D0D', fontSize: 13, fontWeight: 600, padding: '9px 14px' }}><Plus size={16} /> New program</button>}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 340px), 1fr))', gap: 14 }}>
          {programs.map((p) => (
            <Link key={p.id} href={`/beta/${p.id}`} className="rounded-xl" style={{ background: panel, border: `1px solid ${line}`, padding: 18, textDecoration: 'none', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="flex items-center gap-2">
                <span style={{ fontSize: 15, fontWeight: 700, color: ink, flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{p.name}</span>
                <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: p.ended && p.status === 'open' ? '#EF4444' : STATUS_TINT[p.status], flexShrink: 0 }}>{p.ended && p.status === 'open' ? 'Ended' : p.status}</span>
              </div>
              <div className="flex gap-6">
                {[['Testers', p.maxTesters ? `${p.testers}/${p.maxTesters}` : p.testers], ['Open reports', p.openReports], ['New', p.newReports]].map(([k, v]) => (
                  <div key={k as string}>
                    <div style={{ fontSize: 22, fontFamily: 'ui-monospace, monospace', color: k === 'New' && Number(v) > 0 ? accent : ink }}>{v}</div>
                    <div style={{ fontSize: 11.5, color: faint }}>{k}</div>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2" style={{ fontSize: 12, color: muted }}>
                {p.team && <span style={{ color: p.team.color }}>{p.team.name}</span>}
                {p.bugTeam && p.bugTeam.name !== p.team?.name && <span style={{ color: p.bugTeam.color }}>bugs → {p.bugTeam.name}</span>}
                <span style={{ flex: 1 }} />
                <button onClick={(e) => { e.preventDefault(); navigator.clipboard.writeText(p.joinUrl).then(() => toast.success('Join link copied')); }}
                  className="beta-tap inline-flex items-center gap-1" style={{ color: muted }} aria-label="Copy join link"><Copy size={13} /> Copy join link</button>
              </div>
            </Link>
          ))}
        </div>
      )}

      {creating && <NewProgram teams={teams} onClose={() => setCreating(false)} onCreated={(id) => router.push(`/beta/${id}`)} />}
    </div>
  );
}

function NewProgram({ teams, onClose, onCreated }: { teams: Team[]; onClose: () => void; onCreated: (id: string) => void }) {
  const [f, setF] = useState({ name: '', product: '', description: '', teamId: teams[0]?.id ?? '', bugTeamId: '', maxTesters: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof f, v: string) => { setF((x) => ({ ...x, [k]: v })); setErr(null); };
  async function create() {
    if (busy) return;
    if (!f.name.trim()) { setErr('Add a program name to continue.'); return; }
    setBusy(true);
    const res = await fetch('/api/beta/programs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...f, maxTesters: f.maxTesters.trim() }) }).catch(() => null);
    const d = await res?.json().catch(() => ({}));
    if (!res?.ok) { setBusy(false); setErr(d?.error ?? 'Couldn’t reach the server — check your connection.'); return; }
    toast.success('Program created'); onCreated(d.id); // stays "Creating…" while the program page opens
  }
  const field: React.CSSProperties = { background: '#0D0D0D', border: `1px solid ${line}`, borderRadius: 8, color: ink, fontSize: 13, padding: '8px 10px', width: '100%', outline: 'none' };
  const label: React.CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: faint, marginBottom: 5, display: 'block' };
  return (
    <div role="dialog" aria-modal="true" aria-label="New beta program" onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200, display: 'grid', placeItems: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} className="rounded-xl" style={{ background: panel, border: `1px solid ${line}`, width: 'min(560px, 100%)', maxHeight: '90vh', overflow: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="flex items-center"><h2 style={{ fontSize: 16, fontWeight: 700, color: ink, flex: 1 }}>New beta program</h2><button onClick={onClose} aria-label="Close" className="beta-tap" style={{ color: faint, justifyContent: 'center' }}><X size={18} /></button></div>
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))' }}>
          <div><span style={label}>Program name</span><input value={f.name} maxLength={100} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Wallet v2 beta" style={field} autoFocus /></div>
          <div><span style={label}>Product (optional)</span><input value={f.product} maxLength={100} onChange={(e) => set('product', e.target.value)} placeholder="e.g. Wallet v2" style={field} /></div>
        </div>
        <div><span style={label}>Join page text (shown before they join)</span><textarea value={f.description} onChange={(e) => set('description', e.target.value)} rows={4} placeholder="e.g. What it is, what to try, how long the beta runs." style={{ ...field, resize: 'vertical' }} /></div>
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 140px), 1fr))' }}>
          <div><span style={label}>Feedback, ideas and questions go to</span><select value={f.teamId} onChange={(e) => set('teamId', e.target.value)} style={field}><option value="">No team (nobody is told)</option>{teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
          <div><span style={label}>Bugs go to</span><select value={f.bugTeamId} onChange={(e) => set('bugTeamId', e.target.value)} style={field}><option value="">The same team</option>{teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
          <div><span style={label}>Most testers allowed</span><input type="number" min={1} step={1} inputMode="numeric" value={f.maxTesters} onChange={(e) => set('maxTesters', e.target.value)} placeholder="Empty = no limit" style={field} /></div>
        </div>
        <p style={{ fontSize: 12, color: faint }}>Each report becomes a task for the team you pick. You can add sign-up questions, a welcome note, contact details and an end date on the next page.</p>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {err && <span role="alert" style={{ fontSize: 12.5, color: '#EF4444' }}>{err}</span>}
          <button onClick={onClose} className="beta-tap rounded-lg" style={{ color: muted, fontSize: 13, padding: '8px 14px' }}>Cancel</button>
          <button onClick={create} disabled={busy} className="rounded-lg" style={{ background: accent, color: '#0D0D0D', fontSize: 13, fontWeight: 600, padding: '8px 16px', opacity: busy ? 0.6 : 1 }}>{busy ? 'Creating…' : 'Create program'}</button>
        </div>
      </div>
    </div>
  );
}

/** First load: the shape of the program cards right away (slow connections take seconds). */
function ListSkeleton() {
  const bar = (w: string | number, h = 12): React.CSSProperties => ({ width: w, height: h, borderRadius: 6, background: 'rgba(255,255,255,0.06)' });
  return (
    <div aria-busy="true" aria-label="Loading beta programs" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 340px), 1fr))', gap: 14 }}>
      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded-xl" style={{ background: panel, border: `1px solid ${line}`, padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={bar('60%', 15)} />
          <div className="flex gap-6">{[0, 1, 2].map((j) => <div key={j} style={bar(48, 26)} />)}</div>
          <div style={bar('40%')} />
        </div>
      ))}
    </div>
  );
}
