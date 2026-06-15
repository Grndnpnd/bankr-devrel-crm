'use client';
import React, { useState, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { User, Lock, Shield } from 'lucide-react';
import DataCard from '@/components/DataCard';
import { useSubmissionStore } from '@/store/useSubmissionStore';

const ROLE_LABEL: Record<string, string> = { ADMIN: 'Admin', DEVREL: 'DevRel', VIEWER: 'Viewer' };
const ROLE_STYLE: Record<string, { bg: string; text: string }> = {
  ADMIN: { bg: 'rgba(245,166,35,0.15)', text: '#F5A623' },
  DEVREL: { bg: 'rgba(59,130,246,0.15)', text: '#3B82F6' },
  VIEWER: { bg: 'rgba(82,82,82,0.25)', text: '#8A8A8A' },
};

const inputStyle: React.CSSProperties = {
  height: 36, width: '100%', maxWidth: 360, backgroundColor: '#141414',
  border: '1px solid rgba(255,255,255,0.1)', color: '#F0F0F0',
  fontFamily: "'Inter', sans-serif", fontSize: 13, padding: '0 12px', borderRadius: 6, outline: 'none',
};
const labelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: '#525252', letterSpacing: '0.04em',
  textTransform: 'uppercase' as const, display: 'block', marginBottom: 6,
};
const btn = (enabled: boolean): React.CSSProperties => ({
  height: 36, padding: '0 16px', borderRadius: 6, fontSize: 13, fontWeight: 600,
  backgroundColor: enabled ? '#F5A623' : '#2A2A2A', color: enabled ? '#0D0D0D' : '#525252',
  cursor: enabled ? 'pointer' : 'not-allowed', border: 'none',
});

const AccountTab: React.FC = () => {
  const { me, setMe } = useSubmissionStore();
  const [name, setName] = useState(me?.name ?? '');
  const [savingName, setSavingName] = useState(false);

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [savingPw, setSavingPw] = useState(false);

  useEffect(() => { setName(me?.name ?? ''); }, [me?.name]);

  const nameChanged = (me?.name ?? '') !== name.trim();

  const saveName = useCallback(async () => {
    if (!nameChanged || savingName) return;
    setSavingName(true);
    const res = await fetch('/api/me', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim() }),
    });
    const data = await res.json().catch(() => ({}));
    setSavingName(false);
    if (!res.ok) { toast.error('Could not save', { description: data?.error }); return; }
    setMe({ email: data.email, name: data.name, role: data.role });
    toast.success('Profile updated');
  }, [name, nameChanged, savingName, setMe]);

  const pwValid = current && next.length >= 8 && next === confirm;

  const changePassword = useCallback(async () => {
    if (!pwValid || savingPw) return;
    setSavingPw(true);
    const res = await fetch('/api/me/password', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: current, newPassword: next }),
    });
    const data = await res.json().catch(() => ({}));
    setSavingPw(false);
    if (!res.ok) { toast.error('Could not change password', { description: data?.error }); return; }
    setCurrent(''); setNext(''); setConfirm('');
    toast.success('Password changed');
  }, [current, next, pwValid, savingPw]);

  const role = me?.role ?? 'VIEWER';

  return (
    <div className="flex flex-col gap-6" style={{ maxWidth: 640 }}>
      <DataCard title="Profile" delay={0}>
        <div className="flex items-center gap-3 mb-5">
          <div className="flex items-center justify-center rounded-full"
            style={{ width: 44, height: 44, backgroundColor: 'rgba(245,166,35,0.15)', color: '#F5A623', fontWeight: 700, fontSize: 16 }}>
            {(me?.name || me?.email || '?').slice(0, 2).toUpperCase()}
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#F0F0F0' }}>{me?.name || '—'}</div>
            <div style={{ fontSize: 12, color: '#525252' }}>{me?.email}</div>
          </div>
          <span className="ml-auto inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full"
            style={{ backgroundColor: ROLE_STYLE[role].bg, color: ROLE_STYLE[role].text, fontSize: 11, fontWeight: 600 }}>
            <Shield size={12} /> {ROLE_LABEL[role]}
          </span>
        </div>

        <div className="mb-4">
          <label style={labelStyle}><User size={11} style={{ display: 'inline', marginRight: 4 }} />Display Name</label>
          <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
        </div>
        <div className="mb-1">
          <label style={labelStyle}>Email</label>
          <input style={{ ...inputStyle, color: '#8A8A8A', cursor: 'not-allowed' }} value={me?.email ?? ''} readOnly />
          <p style={{ fontSize: 11, color: '#525252', marginTop: 6 }}>Email and role are managed by an admin.</p>
        </div>
        <button onClick={saveName} disabled={!nameChanged || savingName} style={btn(nameChanged && !savingName)} className="mt-2">
          {savingName ? 'Saving…' : 'Save Profile'}
        </button>
      </DataCard>

      <DataCard title="Change Password" delay={0.08}>
        <div className="flex flex-col gap-4">
          <div>
            <label style={labelStyle}><Lock size={11} style={{ display: 'inline', marginRight: 4 }} />Current Password</label>
            <input type="password" style={inputStyle} value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
          </div>
          <div>
            <label style={labelStyle}>New Password</label>
            <input type="password" style={inputStyle} value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
            {next.length > 0 && next.length < 8 && <p style={{ fontSize: 11, color: '#EF4444', marginTop: 4 }}>At least 8 characters.</p>}
          </div>
          <div>
            <label style={labelStyle}>Confirm New Password</label>
            <input type="password" style={inputStyle} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
            {confirm.length > 0 && next !== confirm && <p style={{ fontSize: 11, color: '#EF4444', marginTop: 4 }}>Passwords don&apos;t match.</p>}
          </div>
          <button onClick={changePassword} disabled={!pwValid || savingPw} style={btn(!!pwValid && !savingPw)} className="self-start">
            {savingPw ? 'Updating…' : 'Update Password'}
          </button>
        </div>
      </DataCard>
    </div>
  );
};

export default AccountTab;
