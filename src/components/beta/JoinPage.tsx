'use client';
import React, { useEffect, useRef, useState } from 'react';
import { TesterShell } from '@/components/beta/testerStyles';
import { AboutFooter, DataNote, useHydrated, useKeepTyped, visible, type About } from '@/components/beta/tester/common';

interface Info extends About {
  ok: true; open: boolean; ended: boolean; full: boolean; alreadyJoined: boolean;
  questions: { id: string; label: string; required?: boolean }[]; turnstileSiteKey: string | null;
}
type Initial = Info | { ok: false; error: string | null; contactEmail?: string | null; runBy?: string | null; privacyUrl?: string | null } | null | undefined;

declare global { interface Window { turnstile?: { render: (el: HTMLElement, o: Record<string, unknown>) => string } } }

export default function JoinPage({ slug, k, initial }: { slug: string; k: string; initial?: Initial }) {
  const [info, setInfo] = useState<Info | null>(initial && initial.ok ? initial : null);
  const [loadErr, setLoadErr] = useState<string | null>(initial && !initial.ok ? initial.error : null);
  const [f, setF] = useState({ name: '', email: '', contact: '' });
  const hydrated = useHydrated();
  const errAbout = initial && !initial.ok ? { runBy: initial.runBy ?? null, contactEmail: initial.contactEmail ?? null, privacyUrl: initial.privacyUrl ?? null } : {};
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [ts, setTs] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<{ status: 'joined' | 'updated' | 'emailed' | 'exists'; portalUrl?: string; emailed?: boolean; welcome: string | null } | null>(null);
  const [copied, setCopied] = useState(false);
  const [joinAnother, setJoinAnother] = useState(false);
  const tsBox = useRef<HTMLDivElement>(null);
  // What someone typed into the server-rendered form before the page's script loaded is kept.
  useKeepTyped('join:', (k, v) => {
    if (k === 'name' || k === 'email' || k === 'contact') setF((x) => ({ ...x, [k]: v }));
    else if (k.startsWith('q:')) setAnswers((a) => ({ ...a, [k.slice(2)]: v }));
  });

  useEffect(() => {
    // Signed in already, but this invite link is old: their page is what they want.
    if (initial && !initial.ok && initial.error === null) { location.replace(`/b/${slug}/portal`); return; }
    // Rendered with its data on the server; fetch only if that didn't happen.
    if (!initial) {
      fetch(`/api/tester/program?slug=${encodeURIComponent(slug)}&k=${encodeURIComponent(k)}`)
        .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error); setInfo(d); })
        .catch((e) => setLoadErr(e.message || 'This invite link isn’t valid.'));
    }
  }, [slug, k, initial]);

  // Cloudflare Turnstile, only when the server has keys.
  useEffect(() => {
    const key = info?.turnstileSiteKey;
    if (!key || !tsBox.current) return;
    const render = () => window.turnstile?.render(tsBox.current!, { sitekey: key, callback: (t: string) => setTs(t), 'expired-callback': () => setTs('') });
    if (window.turnstile) { render(); return; }
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js'; s.async = true; s.onload = render;
    document.head.appendChild(s);
  }, [info?.turnstileSiteKey, joinAnother]);

  async function join(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!visible(f.name)) { setErr('Enter your name.'); return; }
    setBusy(true); setErr(null);
    const res = await fetch('/api/tester/join', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug, k, ...f, answers, turnstile: ts }),
    }).catch(() => null);
    const d = await res?.json().catch(() => ({}));
    setBusy(false);
    if (!res?.ok) { setErr(d?.error ?? 'We couldn’t reach the server. Check your connection and try again.'); return; }
    if (d.status === 'updated') { location.href = `/b/${slug}/portal`; return; }
    setDone(d);
  }

  if (loadErr !== null && !info) {
    return (
      <TesterShell>
        <div className="card">
          <h1>This invite link doesn’t work</h1>
          <p className="muted" style={{ margin: '8px 0 0' }}>{loadErr && !/^This invite link doesn’t work\.?$/.test(loadErr) ? loadErr.replace(/^This invite link doesn’t work\. /, '') : 'It may be incomplete (copy the whole link) or replaced by a newer one.'}</p>
        </div>
        <AboutFooter about={errAbout} />
      </TesterShell>
    );
  }
  if (!info) {
    return <TesterShell><div className="card" aria-busy="true" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}><div className="skeleton" style={{ width: '40%' }} /><div className="skeleton" /><div className="skeleton" style={{ width: '70%' }} /></div></TesterShell>;
  }
  const product = info.product || info.name;

  if (done && done.status !== 'joined') {
    return (
      <TesterShell>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {done.status === 'emailed' ? (
            <>
              <h1>Check your email</h1>
              <p className="muted" style={{ margin: 0 }}>This email address already joined the {product} beta. We sent a link to {f.email}. Open it to see your reports. The email can take a minute to arrive. Check your spam folder too.</p>
            </>
          ) : (
            <>
              <h1>This email already joined</h1>
              <p className="muted" style={{ margin: 0 }}>This email address is already in the {product} beta. Open the personal link you got when you joined. It works on any device. If you lost it, ask the team for a new one.</p>
            </>
          )}
        </div>
        <AboutFooter about={info} />
      </TesterShell>
    );
  }

  if (done?.portalUrl) {
    const portalLink = done.portalUrl;
    return (
      <TesterShell>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="eyebrow">You have joined</div>
          <h1>Thank you for testing {product}!</h1>
          {done.welcome && <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{done.welcome}</p>}
          <p className="muted" style={{ margin: 0 }}>
            This is your personal link{done.emailed ? ' (we also emailed it to you)' : ''}. Save it. You need it to see your reports and the team’s answers on another device. Keep this link private. Anyone who has it can send reports in your name.
          </p>
          <code className="link">{portalLink}</code>
          <div className="row">
            <button className="btn" type="button" onClick={() => navigator.clipboard.writeText(portalLink).then(() => setCopied(true)).catch(() => {})}>{copied ? 'Copied' : 'Copy link'}</button>
            <a className="btn primary" href={`/b/${slug}/portal`}>Go to my beta page</a>
          </div>
        </div>
        <AboutFooter about={info} />
      </TesterShell>
    );
  }

  const closed = !info.open || info.full;
  const showForm = !closed && (!info.alreadyJoined || joinAnother);
  const waitingForCheck = !!info.turnstileSiteKey && !ts;
  return (
    <TesterShell>
      <header style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '8px 4px' }}>
        <div className="eyebrow">Beta program{info.runBy ? ` · ${info.runBy}` : ''}</div>
        <h1>{info.name}</h1>
        <p className="muted" style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{info.description || `You are invited to test ${product}. Join to send bug reports, ideas and questions to the team.`}</p>
      </header>

      {info.alreadyJoined && !joinAnother && (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h2>You already joined this beta on this device</h2>
          <div className="row">
            <a className="btn primary" href={`/b/${slug}/portal`}>Go to my beta page</a>
            {!closed && <button type="button" className="linkish" onClick={() => setJoinAnother(true)}>Join with a different email</button>}
          </div>
        </div>
      )}

      {closed && !info.alreadyJoined && (
        <div className="card">
          <h2>{info.full ? 'This beta is full' : info.ended ? 'This beta has ended' : 'Sign-ups are closed'}</h2>
          <p className="muted" style={{ marginTop: 6 }}>Thank you for your interest.</p>
        </div>
      )}

      {showForm && (
        <form className="card" onSubmit={join} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <h2>Join the beta</h2>
          <div className="grid2">
            <div className="field"><label htmlFor="name">Your name <span className="req">(required)</span></label><input id="name" data-keep="join:name" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoComplete="name" /></div>
            <div className="field"><label htmlFor="email">Email <span className="req">(required)</span></label><input id="email" data-keep="join:email" type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="email" inputMode="email" /></div>
            <div className="field"><label htmlFor="contact">Telegram or Discord username <span className="req">(optional)</span></label><input id="contact" data-keep="join:contact" value={f.contact} onChange={(e) => setF({ ...f, contact: e.target.value })} placeholder="e.g. @maria" /></div>
          </div>
          {info.questions.map((q) => (
            <div className="field" key={q.id}>
              <label htmlFor={`q-${q.id}`}>{q.label} <span className="req">{q.required ? '(required)' : '(optional)'}</span></label>
              <textarea id={`q-${q.id}`} data-keep={`join:q:${q.id}`} required={q.required} rows={2} style={{ minHeight: 64 }} value={answers[q.id] ?? ''} onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })} />
            </div>
          ))}
          {info.turnstileSiteKey && <div ref={tsBox} />}
          {err && <div className="err" role="alert">{err}</div>}
          <DataNote about={info} />
          <div className="row actionbar">
            <button className="btn primary" type="submit" disabled={!hydrated || busy || waitingForCheck}>{!hydrated ? 'Loading…' : busy ? 'Joining…' : 'Join the beta'}</button>
            {hydrated && waitingForCheck && <span className="faint">Complete the check above first.</span>}
          </div>
        </form>
      )}
      <AboutFooter about={info} />
    </TesterShell>
  );
}
