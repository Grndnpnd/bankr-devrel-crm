'use client';
import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { FlaskConical, Plus, Copy, X } from 'lucide-react';

interface Program {
  id: string; name: string; product: string | null; slug: string; status: string; joinUrl: string;
  team: { name: string; color: string } | null; bugTeam: { name: string; color: string } | null;
  testers: number; reports: number; openReports: number; newReports: number; maxTesters: number | null; endsAt: string | null; createdAt: string;
}
interface Team { id: string; name: string }

const ink = '#F0F0F0', muted = '#8A8A8A', faint = '#525252', panel = '#1A1A1A', line = 'rgba(255,255,255,0.07)', accent = '#F5A623';
const STATUS_TINT: Record<string, string> = { open: '#10B981', draft: '#8A8A8A', closed: '#525252' };

export default function Beta() {
  const router = useRouter();
  const [programs, setPrograms] = useState<Program[] | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [creating, setCreating] = useState(false);
  const [teams, setTeams] = useState<Team[]>([]);

  const load = useCallback(async () => {
    const d = await fetch('/api/beta/programs').then((r) => r.json());
    setPrograms(d.programs ?? []); setCanManage(!!d.canManage);
  }, []);
  useEffect(() => { load(); fetch('/api/teams').then((r) => r.json()).then((d) => setTeams(d.teams ?? [])); }, [load]);

  return (
    <div>
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

      {programs === null ? <div style={{ color: faint, fontSize: 13, padding: 20 }}>Loading…</div> : programs.length === 0 ? (
        <div className="rounded-xl" style={{ border: '1px dashed rgba(255,255,255,0.12)', padding: 40, textAlign: 'center', fontSize: 13.5, color: muted }}>
          No beta programs yet. Create one for your next launch and share its link with testers.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 340px), 1fr))', gap: 14 }}>
          {programs.map((p) => (
            <Link key={p.id} href={`/beta/${p.id}`} className="rounded-xl" style={{ background: panel, border: `1px solid ${line}`, padding: 18, textDecoration: 'none', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="flex items-center gap-2">
                <span style={{ fontSize: 15, fontWeight: 700, color: ink, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: STATUS_TINT[p.status] }}>{p.status}</span>
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
                  className="inline-flex items-center gap-1" style={{ color: muted }} aria-label="Copy join link"><Copy size={13} /> Join link</button>
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
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  async function create() {
    setBusy(true);
    const res = await fetch('/api/beta/programs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f) });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { toast.error(d.error ?? 'Could not create'); return; }
    toast.success('Program created'); onCreated(d.id);
  }
  const field: React.CSSProperties = { background: '#0D0D0D', border: `1px solid ${line}`, borderRadius: 8, color: ink, fontSize: 13, padding: '8px 10px', width: '100%', outline: 'none' };
  const label: React.CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: faint, marginBottom: 5, display: 'block' };
  return (
    <div role="dialog" aria-modal="true" aria-label="New beta program" onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200, display: 'grid', placeItems: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} className="rounded-xl" style={{ background: panel, border: `1px solid ${line}`, width: 'min(560px, 100%)', maxHeight: '90vh', overflow: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="flex items-center"><h2 style={{ fontSize: 16, fontWeight: 700, color: ink, flex: 1 }}>New beta program</h2><button onClick={onClose} aria-label="Close" style={{ color: faint }}><X size={18} /></button></div>
        <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <div><span style={label}>Program name</span><input value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="Wallet v2 beta" style={field} autoFocus /></div>
          <div><span style={label}>Product</span><input value={f.product} onChange={(e) => set('product', e.target.value)} placeholder="Wallet v2" style={field} /></div>
        </div>
        <div><span style={label}>What testers see when they join</span><textarea value={f.description} onChange={(e) => set('description', e.target.value)} rows={4} placeholder="What it is, what to try, how long the beta runs." style={{ ...field, resize: 'vertical' }} /></div>
        <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 1fr 110px' }}>
          <div><span style={label}>Reports go to</span><select value={f.teamId} onChange={(e) => set('teamId', e.target.value)} style={field}><option value="">No team</option>{teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
          <div><span style={label}>Bugs go to</span><select value={f.bugTeamId} onChange={(e) => set('bugTeamId', e.target.value)} style={field}><option value="">Same team</option>{teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
          <div><span style={label}>Max testers</span><input inputMode="numeric" value={f.maxTesters} onChange={(e) => set('maxTesters', e.target.value)} placeholder="No cap" style={field} /></div>
        </div>
        <p style={{ fontSize: 12, color: faint }}>You can add sign-up questions, a welcome note and an end date on the next page.</p>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg" style={{ color: muted, fontSize: 13, padding: '8px 14px' }}>Cancel</button>
          <button onClick={create} disabled={busy || !f.name.trim()} className="rounded-lg" style={{ background: accent, color: '#0D0D0D', fontSize: 13, fontWeight: 600, padding: '8px 16px', opacity: busy || !f.name.trim() ? 0.5 : 1 }}>{busy ? 'Creating…' : 'Create program'}</button>
        </div>
      </div>
    </div>
  );
}
