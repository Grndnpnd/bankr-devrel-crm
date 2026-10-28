'use client';
import React, { useEffect, useRef, useState } from 'react';
import { TesterShell } from '@/components/beta/testerStyles';

interface Info {
  name: string; product: string | null; description: string | null; open: boolean; full: boolean; alreadyJoined: boolean;
  questions: { id: string; label: string; required?: boolean }[]; turnstileSiteKey: string | null;
}

declare global { interface Window { turnstile?: { render: (el: HTMLElement, o: Record<string, unknown>) => string } } }

export default function JoinPage({ slug, k }: { slug: string; k: string }) {
  const [info, setInfo] = useState<Info | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [f, setF] = useState({ name: '', email: '', contact: '', platform: '' });
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [ts, setTs] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<{ status: 'joined' | 'updated' | 'emailed' | 'exists'; portalUrl?: string; emailed?: boolean; welcome: string | null } | null>(null);
  const [copied, setCopied] = useState(false);
  const tsBox = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`/api/tester/program?slug=${encodeURIComponent(slug)}&k=${encodeURIComponent(k)}`)
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error); setInfo(d); })
      .catch((e) => setLoadErr(e.message || 'This invite link isn’t valid.'));
    // Prefill the device line for convenience.
    const ua = navigator.userAgent;
    const os = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : '';
    const br = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : '';
    setF((x) => ({ ...x, platform: [os, br].filter(Boolean).join(' · ') }));
  }, [slug, k]);

  // Cloudflare Turnstile, only when the server has keys.
  useEffect(() => {
    const key = info?.turnstileSiteKey;
    if (!key || !tsBox.current) return;
    const render = () => window.turnstile?.render(tsBox.current!, { sitekey: key, callback: (t: string) => setTs(t), 'expired-callback': () => setTs('') });
    if (window.turnstile) { render(); return; }
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js'; s.async = true; s.onload = render;
    document.head.appendChild(s);
  }, [info?.turnstileSiteKey]);

  async function join(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    const res = await fetch('/api/tester/join', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug, k, ...f, answers, turnstile: ts }),
    }).catch(() => null);
    const d = await res?.json().catch(() => ({}));
    setBusy(false);
    if (!res?.ok) { setErr(d?.error ?? 'Couldn’t reach us — check your connection and try again.'); return; }
    if (d.status === 'updated') { location.href = `/b/${slug}/portal`; return; }
    setDone(d);
  }

  if (loadErr) return <TesterShell><div className="card"><h1>Invite not found</h1><p className="muted" style={{ marginTop: 8 }}>{loadErr}</p></div></TesterShell>;
  if (!info) return <TesterShell><p className="muted">Loading…</p></TesterShell>;

  if (done && done.status !== 'joined') {
    return (
      <TesterShell>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="eyebrow">Welcome back</div>
          {done.status === 'emailed' ? (
            <>
              <h1>Check your email</h1>
              <p className="muted" style={{ margin: 0 }}>This email has already joined {info.product || info.name}. We’ve sent a link to {f.email} — open it to get back to your reports. It can take a minute; check spam too.</p>
            </>
          ) : (
            <>
              <h1>You’ve already joined</h1>
              <p className="muted" style={{ margin: 0 }}>This email is already in the {info.product || info.name} beta. Open the personal link you saved when you joined — it works on any device. Lost it? Ask the team for a new one; your reports are kept.</p>
            </>
          )}
        </div>
      </TesterShell>
    );
  }

  if (done?.portalUrl) {
    const portalLink = done.portalUrl;
    return (
      <TesterShell>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="eyebrow">You’re in</div>
          <h1>Thanks for testing {info.product || info.name}!</h1>
          {done.welcome && <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{done.welcome}</p>}
          <p className="muted" style={{ margin: 0 }}>
            This is your personal link{done.emailed ? ' (we’ve also emailed it to you)' : ''}. Save it somewhere — it’s how you get back to your reports and our replies on another device. Don’t share it: anyone with it can post as you.
          </p>
          <code className="link">{portalLink}</code>
          <div className="row">
            <button className="btn" type="button" onClick={() => navigator.clipboard.writeText(portalLink).then(() => setCopied(true)).catch(() => {})}>{copied ? 'Copied' : 'Copy link'}</button>
            <a className="btn primary" href={`/b/${slug}/portal`}>Report a bug or idea</a>
          </div>
        </div>
      </TesterShell>
    );
  }

  const closed = !info.open || info.full;
  return (
    <TesterShell>
      <header style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '8px 4px' }}>
        <div className="eyebrow">Beta program</div>
        <h1>{info.name}</h1>
        {info.description && <p className="muted" style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{info.description}</p>}
      </header>

      {info.alreadyJoined && (
        <div className="card row" style={{ justifyContent: 'space-between' }}>
          <span>You’ve already joined on this device.</span>
          <a className="btn primary" href={`/b/${slug}/portal`}>Go to your reports</a>
        </div>
      )}

      {closed ? (
        <div className="card"><h2>{info.full ? 'This beta is full' : 'Sign-ups are closed'}</h2><p className="muted" style={{ marginTop: 6 }}>Thanks for your interest — keep an eye out for the next round.</p></div>
      ) : (
        <form className="card" onSubmit={join} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <h2>Join the beta</h2>
          <div className="grid2">
            <div className="field"><label htmlFor="name">Your name</label><input id="name" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoComplete="name" /></div>
            <div className="field"><label htmlFor="email">Email</label><input id="email" type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="email" /></div>
            <div className="field"><label htmlFor="contact">Telegram or Discord <span className="faint">(optional)</span></label><input id="contact" value={f.contact} onChange={(e) => setF({ ...f, contact: e.target.value })} placeholder="@handle" /></div>
            <div className="field"><label htmlFor="platform">What you’ll test on</label><input id="platform" value={f.platform} onChange={(e) => setF({ ...f, platform: e.target.value })} placeholder="e.g. iPhone 15 · Safari" /></div>
          </div>
          {info.questions.map((q) => (
            <div className="field" key={q.id}>
              <label htmlFor={`q-${q.id}`}>{q.label}{!q.required && <span className="faint"> (optional)</span>}</label>
              <textarea id={`q-${q.id}`} required={q.required} rows={2} style={{ minHeight: 64 }} value={answers[q.id] ?? ''} onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })} />
            </div>
          ))}
          {info.turnstileSiteKey && <div ref={tsBox} />}
          {err && <div className="err" role="alert">{err}</div>}
          <div className="row">
            <button className="btn primary" type="submit" disabled={busy || (!!info.turnstileSiteKey && !ts)}>{busy ? 'Joining…' : 'Join the beta'}</button>
            <span className="faint">We only use your details to follow up on your reports.</span>
          </div>
        </form>
      )}
    </TesterShell>
  );
}
