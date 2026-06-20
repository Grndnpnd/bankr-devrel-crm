'use client';
import React, { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { Loader2, RotateCcw, Save, Lock } from 'lucide-react';

type Capability = string;
type Role = string;
interface CapMeta { key: Capability; label: string; group: string; note?: string }

interface PermUser { id: string; email: string; name: string | null; role: string }
interface UserOverride { grant?: Capability[]; revoke?: Capability[] }

interface PermData {
  matrix: Record<Capability, Role[]>;
  defaults: Record<Capability, Role[]>;
  capabilities: CapMeta[];
  roles: Role[];
  roleLabels: Record<Role, string>;
  users: PermUser[];
  userOverrides: Record<string, UserOverride>;
}

const PermissionsTab: React.FC = () => {
  const [data, setData] = useState<PermData | null>(null);
  const [matrix, setMatrix] = useState<Record<Capability, Role[]>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  // Per-user overrides editor
  const [userOverrides, setUserOverrides] = useState<Record<string, UserOverride>>({});
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [userDirty, setUserDirty] = useState(false);
  const [savingUser, setSavingUser] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/permissions');
      if (!res.ok) { toast.error('Could not load permissions'); return; }
      const d: PermData = await res.json();
      setData(d);
      setMatrix(d.matrix);
      setUserOverrides(d.userOverrides || {});
      setDirty(false);
      setUserDirty(false);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const has = (cap: Capability, role: Role) => (matrix[cap] || []).includes(role);

  const toggle = (cap: Capability, role: Role) => {
    if (role === 'ADMIN') return; // hard-locked
    setMatrix((prev) => {
      const cur = new Set(prev[cap] || []);
      if (cur.has(role)) cur.delete(role); else cur.add(role);
      cur.add('ADMIN'); // always
      return { ...prev, [cap]: Array.from(cur) };
    });
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/permissions', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matrix }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(d?.error || 'Save failed'); return; }
      setMatrix(d.matrix);
      setDirty(false);
      toast.success('Permissions saved', { description: 'Changes take effect within a few seconds.' });
      // Refresh client-side can() so this admin's own UI updates immediately.
      try { const { setCapabilityOverrides } = await import('@/lib/access'); setCapabilityOverrides(d.matrix); } catch { /* noop */ }
    } finally { setSaving(false); }
  };

  const resetDefaults = async () => {
    if (!window.confirm('Reset all role permissions to the built-in defaults?')) return;
    setSaving(true);
    try {
      const res = await fetch('/api/permissions', { method: 'DELETE' });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(d?.error || 'Reset failed'); return; }
      setMatrix(d.matrix);
      setDirty(false);
      toast.success('Reset to defaults');
      try { const { setCapabilityOverrides } = await import('@/lib/access'); setCapabilityOverrides(d.matrix); } catch { /* noop */ }
    } finally { setSaving(false); }
  };

  if (loading) {
    return <div className="flex items-center gap-2" style={{ color: '#8A8A8A', fontSize: 13 }}><Loader2 size={14} className="animate-spin" /> Loading permissions…</div>;
  }

  // ── Per-user override helpers ──
  // A user's effective state for a cap: 'role' (default), 'grant', or 'revoke'.
  const selectedUser = data?.users.find((u) => u.id === selectedUserId);
  const roleHasCap = (cap: Capability, role: string) =>
    role === 'ADMIN' || (matrix[cap] || []).includes(role);
  const userState = (cap: Capability): 'grant' | 'revoke' | 'role' => {
    const ov = userOverrides[selectedUserId];
    if (ov?.grant?.includes(cap)) return 'grant';
    if (ov?.revoke?.includes(cap)) return 'revoke';
    return 'role';
  };
  // Cycle: role-default → grant → revoke → role-default
  const cycleUserCap = (cap: Capability) => {
    if (!selectedUserId || !selectedUser) return;
    if (selectedUser.role === 'ADMIN') return; // admin is absolute
    setUserOverrides((prev) => {
      const ov: UserOverride = { grant: [...(prev[selectedUserId]?.grant || [])], revoke: [...(prev[selectedUserId]?.revoke || [])] };
      const inGrant = ov.grant!.includes(cap);
      const inRevoke = ov.revoke!.includes(cap);
      // remove from both first
      ov.grant = ov.grant!.filter((c) => c !== cap);
      ov.revoke = ov.revoke!.filter((c) => c !== cap);
      if (!inGrant && !inRevoke) ov.grant!.push(cap);        // role → grant
      else if (inGrant) ov.revoke!.push(cap);                 // grant → revoke
      // else (was revoke) → role-default (already removed)
      return { ...prev, [selectedUserId]: ov };
    });
    setUserDirty(true);
  };
  const saveUserOverrides = async () => {
    setSavingUser(true);
    try {
      const res = await fetch('/api/permissions', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userOverrides }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(d?.error || 'Save failed'); return; }
      setUserOverrides(d.userOverrides || {});
      setUserDirty(false);
      toast.success('Per-user permissions saved', { description: 'Changes take effect within a few seconds.' });
    } finally { setSavingUser(false); }
  };
  const clearUserOverrides = () => {
    if (!selectedUserId) return;
    setUserOverrides((prev) => { const n = { ...prev }; delete n[selectedUserId]; return n; });
    setUserDirty(true);
  };
  if (!data) return <div style={{ color: '#8A8A8A', fontSize: 13 }}>Couldn’t load permissions.</div>;

  // Group capabilities by their section for readability.
  const groups: string[] = Array.from(new Set(data.capabilities.map((c) => c.group)));

  return (
    <div>
      <div className="flex items-start justify-between mb-4" style={{ gap: 16 }}>
        <div>
          <p style={{ fontSize: 13, color: '#8A8A8A' }}>
            Control what each role can do. Toggle a capability for a role to grant or revoke it.
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 8, color: '#7c3aed' }}>
              <Lock size={12} /> Admin always has every capability.
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={resetDefaults} disabled={saving} className="inline-flex items-center gap-1.5 rounded-md" style={{ height: 34, padding: '0 12px', fontSize: 13, fontWeight: 600, backgroundColor: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#8A8A8A' }}>
            <RotateCcw size={14} /> Reset to defaults
          </button>
          <button onClick={save} disabled={saving || !dirty} className="inline-flex items-center gap-1.5 rounded-md" style={{ height: 34, padding: '0 14px', fontSize: 13, fontWeight: 600, backgroundColor: dirty ? '#7c3aed' : '#1A1A1A', color: dirty ? '#F0F0F0' : '#525252', border: '1px solid rgba(255,255,255,0.1)' }}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save changes
          </button>
        </div>
      </div>

      <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid rgba(255,255,255,0.07)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ backgroundColor: '#141414' }}>
              <th style={{ textAlign: 'left', padding: '12px 16px', color: '#8A8A8A', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Capability</th>
              {data.roles.map((r) => (
                <th key={r} style={{ textAlign: 'center', padding: '12px 16px', color: r === 'ADMIN' ? '#7c3aed' : '#F0F0F0', fontWeight: 700, minWidth: 96 }}>
                  {data.roleLabels[r] || r}
                  {r === 'ADMIN' && <Lock size={11} style={{ marginLeft: 4, verticalAlign: 'middle', color: '#7c3aed' }} />}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => (
              <React.Fragment key={group}>
                <tr>
                  <td colSpan={data.roles.length + 1} style={{ padding: '10px 16px 4px', color: '#525252', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{group}</td>
                </tr>
                {data.capabilities.filter((c) => c.group === group).map((cap) => (
                  <tr key={cap.key} style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: '10px 16px', color: '#F0F0F0' }}>
                      {cap.label}
                      {cap.note && <span style={{ display: 'block', fontSize: 11, color: '#525252', marginTop: 1 }}>{cap.note}</span>}
                    </td>
                    {data.roles.map((r) => {
                      const on = has(cap.key, r);
                      const locked = r === 'ADMIN';
                      return (
                        <td key={r} style={{ textAlign: 'center', padding: '8px 16px' }}>
                          <button
                            onClick={() => toggle(cap.key, r)}
                            disabled={locked}
                            aria-label={`${on ? 'Revoke' : 'Grant'} ${cap.label} for ${r}`}
                            style={{
                              width: 22, height: 22, borderRadius: 6,
                              backgroundColor: on ? (locked ? 'rgba(124,58,237,0.5)' : '#7c3aed') : 'transparent',
                              border: on ? 'none' : '1px solid rgba(255,255,255,0.18)',
                              cursor: locked ? 'not-allowed' : 'pointer',
                              color: '#F0F0F0', fontSize: 13, lineHeight: 1,
                              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                              opacity: locked ? 0.7 : 1,
                            }}
                          >
                            {on ? '✓' : ''}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Per-user overrides ── */}
      <div style={{ marginTop: 28 }}>
        <div className="flex items-center justify-between flex-wrap gap-2" style={{ marginBottom: 6 }}>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: '#F0F0F0' }}>Per-user overrides</h3>
            <p style={{ fontSize: 12.5, color: '#8A8A8A', marginTop: 2 }}>
              Grant or revoke individual capabilities for one person, on top of their role. Click a cell to cycle: role default → <span style={{ color: '#10b981' }}>grant</span> → <span style={{ color: '#ef4444' }}>revoke</span>.
            </p>
          </div>
          {userDirty && (
            <div className="flex items-center gap-2">
              <button onClick={saveUserOverrides} disabled={savingUser}
                className="inline-flex items-center gap-1.5 rounded-md"
                style={{ height: 32, padding: '0 12px', fontSize: 13, fontWeight: 600, backgroundColor: '#F5A623', color: '#1A1A1A', border: 'none', cursor: 'pointer', opacity: savingUser ? 0.6 : 1 }}>
                {savingUser ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2" style={{ margin: '12px 0' }}>
          <select value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)}
            style={{ height: 34, padding: '0 10px', fontSize: 13, backgroundColor: '#1A1A1A', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: '#F0F0F0', minWidth: 240 }}>
            <option value="">Select a user…</option>
            {data?.users.map((u) => (
              <option key={u.id} value={u.id}>{u.name ? `${u.name} (${u.email})` : u.email} · {data.roleLabels[u.role] ?? u.role}</option>
            ))}
          </select>
          {selectedUserId && userOverrides[selectedUserId] && (
            <button onClick={clearUserOverrides}
              style={{ height: 34, padding: '0 10px', fontSize: 12.5, fontWeight: 600, backgroundColor: 'transparent', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, color: '#ef4444', cursor: 'pointer' }}>
              Clear all overrides for this user
            </button>
          )}
        </div>

        {selectedUser ? (
          selectedUser.role === 'ADMIN' ? (
            <div style={{ fontSize: 13, color: '#8A8A8A', padding: '16px 0' }}>
              Admins have every capability and can’t be overridden.
            </div>
          ) : (
            <div style={{ borderRadius: 10, border: '1px solid rgba(255,255,255,0.07)', overflow: 'hidden' }}>
              {(data?.capabilities || []).map((meta) => {
                const st = userState(meta.key);
                const roleDefault = roleHasCap(meta.key, selectedUser.role);
                const effective = st === 'grant' ? true : st === 'revoke' ? false : roleDefault;
                return (
                  <div key={meta.key} className="flex items-center justify-between"
                    style={{ padding: '9px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)', backgroundColor: st !== 'role' ? 'rgba(245,166,35,0.04)' : 'transparent' }}>
                    <div style={{ minWidth: 0 }}>
                      <span style={{ fontSize: 13, color: '#F0F0F0' }}>{meta.label}</span>
                      <span style={{ fontSize: 11, color: '#525252', marginLeft: 8 }}>
                        role default: {roleDefault ? 'allowed' : 'denied'}
                      </span>
                    </div>
                    <button onClick={() => cycleUserCap(meta.key)}
                      style={{
                        fontSize: 11.5, fontWeight: 700, padding: '3px 10px', borderRadius: 6, cursor: 'pointer', border: '1px solid',
                        ...(st === 'grant'
                          ? { color: '#10b981', borderColor: 'rgba(16,185,129,0.4)', backgroundColor: 'rgba(16,185,129,0.1)' }
                          : st === 'revoke'
                          ? { color: '#ef4444', borderColor: 'rgba(239,68,68,0.4)', backgroundColor: 'rgba(239,68,68,0.1)' }
                          : { color: '#8A8A8A', borderColor: 'rgba(255,255,255,0.12)', backgroundColor: 'transparent' }),
                      }}>
                      {st === 'grant' ? '✓ Granted' : st === 'revoke' ? '✕ Revoked' : `Role (${effective ? 'on' : 'off'})`}
                    </button>
                  </div>
                );
              })}
            </div>
          )
        ) : (
          <div style={{ fontSize: 13, color: '#525252', padding: '16px 0' }}>Select a user to grant or revoke their individual capabilities.</div>
        )}
      </div>
    </div>
  );
};

export default PermissionsTab;
