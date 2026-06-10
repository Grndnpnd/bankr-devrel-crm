'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true); setErr('');
    const res = await fetch('/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    setBusy(false);
    if (res.ok) { router.push('/'); router.refresh(); }
    else { const d = await res.json().catch(() => ({})); setErr(d.error || 'login failed'); }
  }

  const field: React.CSSProperties = {
    width: '100%', height: 40, backgroundColor: '#141414',
    border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#F0F0F0',
    fontFamily: "'Inter', sans-serif", fontSize: 14, padding: '0 12px', outline: 'none',
  };
  const lab: React.CSSProperties = {
    display: 'block', fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase',
    color: '#525252', margin: '14px 0 6px',
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ backgroundColor: '#0D0D0D', color: '#F0F0F0' }}>
      <div style={{ width: '100%', maxWidth: 360, backgroundColor: '#1A1A1A', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, padding: 32, boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
        <div className="flex items-center gap-2 mb-1">
          <svg width="22" height="22" viewBox="0 0 28 28" fill="none">
            <circle cx="4" cy="14" r="3" fill="#F5A623" />
            <path d="M10 5h5.5c3.5 0 5.5 1.8 5.5 4.5 0 2-1.2 3.5-3 4.2v.1c2.2.5 3.8 2.2 3.8 4.8 0 3.2-2.3 5.4-6 5.4H10V5z" fill="#F0F0F0" />
          </svg>
          <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: 22, fontWeight: 800, letterSpacing: '-0.03em' }}>Bankr</span>
        </div>
        <div style={{ fontSize: 12, color: '#525252', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 22 }}>DevRel · Intake</div>

        <label style={lab}>Email</label>
        <input style={field} value={email} autoComplete="username" onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
        <label style={lab}>Password</label>
        <input style={field} type="password" value={password} autoComplete="current-password" onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />

        <button disabled={busy || !email || !password} onClick={submit}
          style={{ width: '100%', marginTop: 22, height: 42, backgroundColor: '#F5A623', color: '#0D0D0D', border: 'none', borderRadius: 8, fontWeight: 800, fontSize: 14, fontFamily: "'Inter', sans-serif", cursor: busy ? 'default' : 'pointer', opacity: busy || !email || !password ? 0.5 : 1 }}>
          {busy ? '…' : 'Sign in'}
        </button>
        {err && <div style={{ color: '#EF4444', fontSize: 12, marginTop: 14, textAlign: 'center' }}>{err}</div>}
      </div>
    </div>
  );
}
