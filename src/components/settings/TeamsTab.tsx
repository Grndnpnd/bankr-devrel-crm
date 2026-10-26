'use client';
import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Users, Plus, Trash2 } from 'lucide-react';
import DataCard from '@/components/DataCard';

interface Person { id: string; name: string | null; email: string }
interface Member { userId: string; role: string; name: string | null; email: string }
interface Team { id: string; name: string; description: string | null; color: string; openTasks: number; members: Member[] }

const field: React.CSSProperties = { height: 34, backgroundColor: '#141414', border: '1px solid rgba(255,255,255,0.1)', color: '#F0F0F0', fontSize: 13, padding: '0 10px', borderRadius: 6, outline: 'none' };
const COLORS = ['#F5A623', '#3B82F6', '#10B981', '#8B5CF6', '#EF4444', '#EC4899', '#14B8A6', '#A3A3A3'];

export default function TeamsTab() {
  const [teams, setTeams] = useState<Team[] | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [me, setMe] = useState('');
  const [canAll, setCanAll] = useState(false);
  const [name, setName] = useState('');

  const load = useCallback(async () => {
    const d = await fetch('/api/teams').then((r) => r.json());
    setTeams(d.teams ?? []); setPeople(d.people ?? []); setMe(d.me ?? ''); setCanAll(!!d.canManageAll);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function create() {
    const n = name.trim();
    if (!n) return;
    const res = await fetch('/api/teams', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: n, members: [{ userId: me, role: 'lead' }] }) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(d.error ?? 'Could not create the team'); return; }
    setName(''); toast.success(`${n} created`); load();
  }

  if (!teams) return <div style={{ color: '#525252', fontSize: 13 }}>Loading…</div>;

  return (
    <div className="flex flex-col gap-5" style={{ maxWidth: 820 }}>
      <DataCard delay={0}>
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center rounded-lg" style={{ width: 40, height: 40, backgroundColor: 'rgba(245,166,35,0.12)' }}>
            <Users size={20} style={{ color: '#F5A623' }} />
          </div>
          <div style={{ flex: 1 }}>
            <h3 style={{ fontFamily: "'Manrope', sans-serif", fontSize: 16, fontWeight: 600, color: '#F0F0F0' }}>Teams</h3>
            <p style={{ fontSize: 12, color: '#8A8A8A' }}>Departments that tasks, tester reports and alerts get routed to. Leads can change their own team.</p>
          </div>
        </div>
        {canAll && (
          <div className="flex flex-wrap gap-2" style={{ marginTop: 14 }}>
            <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') create(); }}
              placeholder="New team, e.g. Support" aria-label="New team name" style={{ ...field, flex: '1 1 220px', maxWidth: 320 }} />
            <button onClick={create} className="inline-flex items-center gap-1.5" style={{ height: 34, padding: '0 14px', borderRadius: 6, fontSize: 13, fontWeight: 600, background: '#F5A623', color: '#0D0D0D' }}>
              <Plus size={14} /> Create team
            </button>
          </div>
        )}
      </DataCard>

      {teams.length === 0 && <div style={{ fontSize: 13, color: '#525252' }}>No teams yet.{canAll ? ' Create the first one above.' : ' An admin can create them.'}</div>}
      {teams.map((t, i) => (
        <TeamCard key={t.id} team={t} people={people} me={me} canAll={canAll} delay={0.03 * (i + 1)} onChanged={load} />
      ))}
    </div>
  );
}

function TeamCard({ team, people, me, canAll, delay, onChanged }: { team: Team; people: Person[]; me: string; canAll: boolean; delay: number; onChanged: () => void }) {
  const canEdit = canAll || team.members.some((m) => m.userId === me && m.role === 'lead');
  const [members, setMembers] = useState<{ userId: string; role: string }[]>(team.members.map((m) => ({ userId: m.userId, role: m.role })));
  const [adding, setAdding] = useState('');
  const dirty = JSON.stringify(members) !== JSON.stringify(team.members.map((m) => ({ userId: m.userId, role: m.role })));
  const byId = new Map(people.map((p) => [p.id, p]));

  async function saveMembers() {
    const res = await fetch(`/api/teams/${team.id}/members`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ members }) });
    if (res.ok) { toast.success(`${team.name} updated`); onChanged(); } else toast.error('Could not update members');
  }
  async function patch(body: object) {
    const res = await fetch(`/api/teams/${team.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (res.ok) onChanged(); else toast.error('Could not update the team');
  }
  async function remove() {
    if (!window.confirm(`Delete ${team.name}? Its tasks stay, without a team.`)) return;
    const res = await fetch(`/api/teams/${team.id}`, { method: 'DELETE' });
    if (res.ok) { toast.success('Team deleted'); onChanged(); }
  }

  return (
    <DataCard delay={delay}>
      <div className="flex flex-wrap items-center gap-2" style={{ marginBottom: 10 }}>
        <span style={{ width: 10, height: 10, borderRadius: 5, background: team.color }} />
        <span style={{ fontSize: 15, fontWeight: 700, color: '#F0F0F0' }}>{team.name}</span>
        <a href={`/tasks?team=${team.id}`} style={{ fontSize: 12, color: '#8A8A8A' }}>{team.openTasks} open task{team.openTasks === 1 ? '' : 's'}</a>
        <span style={{ flex: 1 }} />
        {canEdit && (
          <div className="flex gap-1" role="group" aria-label="Team color">
            {COLORS.map((c) => (
              <button key={c} onClick={() => patch({ color: c })} aria-label={`Color ${c}`}
                style={{ width: 14, height: 14, borderRadius: 7, background: c, outline: c === team.color ? '2px solid #F0F0F0' : 'none', outlineOffset: 1 }} />
            ))}
          </div>
        )}
        {canAll && <button onClick={remove} aria-label={`Delete ${team.name}`} style={{ color: '#525252', marginLeft: 8 }}><Trash2 size={15} /></button>}
      </div>
      <div className="flex flex-col gap-1" style={{ maxHeight: 260, overflowY: 'auto' }}>
        {members.length === 0 && <div style={{ fontSize: 12.5, color: '#525252' }}>No members yet.</div>}
        {members.map((m) => {
          const p = byId.get(m.userId);
          return (
            <div key={m.userId} className="flex items-center gap-2" style={{ padding: '5px 0', fontSize: 13 }}>
              <span style={{ color: '#F0F0F0', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {p?.name || p?.email || 'Former user'}{m.userId === me ? ' (you)' : ''}
              </span>
              {canEdit ? (
                <>
                  <select value={m.role} onChange={(e) => setMembers((ms) => ms.map((x) => (x.userId === m.userId ? { ...x, role: e.target.value } : x)))}
                    aria-label="Role" style={{ ...field, height: 28, fontSize: 12 }}>
                    <option value="member">Member</option><option value="lead">Lead</option>
                  </select>
                  <button onClick={() => setMembers((ms) => ms.filter((x) => x.userId !== m.userId))} style={{ fontSize: 12, color: '#8A8A8A' }}>Remove</button>
                </>
              ) : <span style={{ fontSize: 12, color: '#8A8A8A' }}>{m.role === 'lead' ? 'Lead' : 'Member'}</span>}
            </div>
          );
        })}
      </div>
      {canEdit && (
        <div className="flex flex-wrap items-center gap-2" style={{ marginTop: 10 }}>
          <select value={adding} onChange={(e) => setAdding(e.target.value)} aria-label="Add a member" style={{ ...field, flex: '1 1 220px', maxWidth: 320 }}>
            <option value="">Add someone…</option>
            {people.filter((p) => !members.some((m) => m.userId === p.id)).map((p) => <option key={p.id} value={p.id}>{p.name || p.email}</option>)}
          </select>
          <button disabled={!adding} onClick={() => { setMembers((ms) => [...ms, { userId: adding, role: 'member' }]); setAdding(''); }}
            style={{ height: 34, padding: '0 12px', borderRadius: 6, fontSize: 12.5, background: '#222', color: adding ? '#F0F0F0' : '#525252' }}>Add</button>
          {dirty && (
            <button onClick={saveMembers} style={{ height: 34, padding: '0 14px', borderRadius: 6, fontSize: 13, fontWeight: 600, background: '#F5A623', color: '#0D0D0D', marginLeft: 'auto' }}>
              Save members
            </button>
          )}
        </div>
      )}
    </DataCard>
  );
}
