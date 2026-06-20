'use client';
import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const search = useSearchParams();

  useEffect(() => {
    const code = search.get('error');
    if (!code) return;
    const messages: Record<string, string> = {
      not_invited: "That Google account isn't on the team yet. Ask an admin to add it.",
      deactivated: 'That account has been deactivated.',
      oauth_domain: 'Please sign in with your Bankr Workspace account.',
      oauth_unverified: "Your Google email isn't verified.",
      oauth_state: 'Sign-in expired — please try again.',
      oauth_exchange: 'Google sign-in failed — please try again.',
      oauth_profile: 'Could not read your Google profile — please try again.',
      oauth_config: 'Google sign-in is not configured.',
    };
    setErr(messages[code] || 'Google sign-in failed.');
  }, [search]);

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
        <div style={{ fontSize: 12, color: '#525252', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 22 }}>BANKRcrm</div>

        <label style={lab}>Email</label>
        <input style={field} value={email} autoComplete="username" onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
        <label style={lab}>Password</label>
        <input style={field} type="password" value={password} autoComplete="current-password" onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />

        <button disabled={busy || !email || !password} onClick={submit}
          style={{ width: '100%', marginTop: 22, height: 42, backgroundColor: '#F5A623', color: '#0D0D0D', border: 'none', borderRadius: 8, fontWeight: 800, fontSize: 14, fontFamily: "'Inter', sans-serif", cursor: busy ? 'default' : 'pointer', opacity: busy || !email || !password ? 0.5 : 1 }}>
          {busy ? '…' : 'Sign in'}
        </button>

        <div className="flex items-center gap-3" style={{ margin: '18px 0 14px' }}>
          <div style={{ flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.08)' }} />
          <span style={{ fontSize: 11, color: '#525252', letterSpacing: '0.08em' }}>OR</span>
          <div style={{ flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.08)' }} />
        </div>

        <a href="/api/auth/google"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, width: '100%', height: 42, backgroundColor: '#FFFFFF', color: '#1F1F1F', borderRadius: 8, fontWeight: 600, fontSize: 14, fontFamily: "'Inter', sans-serif", textDecoration: 'none' }}>
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
            <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"/>
            <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"/>
            <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z"/>
            <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"/>
          </svg>
          Continue with Google
        </a>

        {err && <div style={{ color: '#EF4444', fontSize: 12, marginTop: 14, textAlign: 'center' }}>{err}</div>}
      </div>
    </div>
  );
}

export default function Login() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', backgroundColor: '#0D0D0D' }} />}>
      <LoginForm />
    </Suspense>
  );
}
