'use client';
import React, { useCallback, useEffect, useState } from 'react';
import { TesterShell } from '@/components/beta/testerStyles';

interface Chat {
  appId: string; title: string;
  customerDetails: { email: string; fullName: string; shortName: string };
  customerDetailsSignature: string;
  threadDetails?: { labelTypeIds: string[] };
}
interface Me {
  chat: Chat | null;
  tester: { name: string; email: string; platform: string | null };
  program: { name: string; product: string | null; welcome: string | null; open: boolean };
  reports: { id: string; kind: string; title: string; severity: string | null; status: string; statusLabel: string; createdAt: string; teamReplies: number; unread: number }[];
}
interface Detail {
  id: string; kind: string; title: string; body: string; severity: string | null; steps: string | null; expected: string | null; actual: string | null;
  platform: string | null; pageUrl: string | null; status: string; statusLabel: string; createdAt: string;
  replies: { id: string; authorType: 'team' | 'tester'; body: string; createdAt: string }[];
  attachments: { id: string; filename: string; contentType: string; size: number }[];
}

const KINDS = [
  { id: 'bug', label: 'Bug', hint: 'Something broke or looks wrong' },
  { id: 'feedback', label: 'Feedback', hint: 'How something felt to use' },
  { id: 'idea', label: 'Idea', hint: 'Something you wish it did' },
  { id: 'question', label: 'Question', hint: 'Not sure how something works' },
];
const SEVERITY = [
  { id: 'blocker', label: 'Blocker', hint: 'I can’t continue' },
  { id: 'major', label: 'Major', hint: 'Works badly, there’s a workaround' },
  { id: 'minor', label: 'Minor', hint: 'Cosmetic or small' },
];
const KIND_LABEL: Record<string, string> = { bug: 'Bug', feedback: 'Feedback', idea: 'Idea', question: 'Question' };
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export default function TesterPortal({ slug, expired }: { slug: string; expired: boolean }) {
  const [me, setMe] = useState<Me | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [view, setView] = useState<'list' | 'new' | string>('list');
  const q = `slug=${encodeURIComponent(slug)}`;

  const load = useCallback(async () => {
    const r = await fetch(`/api/tester/me?${q}`);
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(d.error ?? 'Your link has expired.'); return; }
    setMe(d);
  }, [q]);
  useEffect(() => { load(); }, [load]);

  if (err || expired) {
    return (
      <TesterShell>
        <div className="card">
          <h1>Your tester link has expired</h1>
          <p className="muted" style={{ marginTop: 8 }}>Open the most recent personal link you saved, or use the invite link from the team again with the same email — that gives you a fresh link and keeps your reports.</p>
        </div>
      </TesterShell>
    );
  }
  if (!me) return <TesterShell><p className="muted">Loading…</p></TesterShell>;

  return (
    <TesterShell>
      <header className="row" style={{ justifyContent: 'space-between', padding: '8px 4px' }}>
        <div>
          <div className="eyebrow">{me.program.name}</div>
          <h1>Hi {me.tester.name.split(' ')[0]}</h1>
        </div>
        <div className="row" style={{ gap: 8 }}>
          {me.chat && view === 'list' && <button className="btn" onClick={() => (window as any).Plain?.open()}>Chat with the team</button>}
          {view === 'list'
            ? me.program.open && <button className="btn primary" onClick={() => setView('new')}>New report</button>
            : <button className="btn" onClick={() => { setView('list'); load(); }}>All my reports</button>}
        </div>
      </header>

      {view === 'list' && (
        <>
          {me.program.welcome && me.reports.length === 0 && <div className="card" style={{ whiteSpace: 'pre-wrap' }}>{me.program.welcome}</div>}
          <div className="card">
            <h2 style={{ marginBottom: 6 }}>Your reports</h2>
            {me.reports.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>Nothing yet. Found a bug, or have an idea? {me.program.open ? 'Tap “New report”.' : ''}</p>
            ) : (
              <div className="list">
                {me.reports.map((r) => (
                  <button key={r.id} className="item" onClick={() => setView(r.id)}>
                    {r.unread > 0 ? <span className="dot" aria-label="New reply" /> : <span style={{ width: 8, flexShrink: 0 }} />}
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <b style={{ display: 'block' }}>{r.title}</b>
                      <span className="faint">{KIND_LABEL[r.kind]}{r.severity ? ` · ${r.severity}` : ''} · {when(r.createdAt)}{r.teamReplies ? ` · ${r.teamReplies} repl${r.teamReplies === 1 ? 'y' : 'ies'} from the team` : ''}</span>
                    </span>
                    <span className={`pill ${r.status}`}>{r.statusLabel}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {!me.program.open && <p className="faint" style={{ padding: '0 4px' }}>This beta isn’t taking new reports right now. You can still read and reply on yours.</p>}
        </>
      )}

      {me.chat && <PlainChat chat={me.chat} />}
      {view === 'new' && <NewReport slug={slug} platform={me.tester.platform ?? ''} onDone={(id) => { setView(id); load(); }} />}
      {view !== 'list' && view !== 'new' && <ReportView slug={slug} id={view} />}
    </TesterShell>
  );
}

/** Plain's chat widget, signed in as this tester (the signature comes from our server). */
function PlainChat({ chat }: { chat: Chat }) {
  useEffect(() => {
    const w = window as any;
    const init = () => w.Plain?.init({
      appId: chat.appId,
      customerDetails: chat.customerDetails,
      customerDetailsSignature: chat.customerDetailsSignature,
      ...(chat.threadDetails ? { threadDetails: chat.threadDetails } : {}),
      theme: 'auto',
      style: { brandColor: { light: '#c4620d', dark: '#f0913f' }, launcherBackgroundColor: { light: '#c4620d', dark: '#f0913f' }, launcherIconColor: '#ffffff' },
      links: [],
    });
    if (w.Plain) { init(); return; }
    if (document.getElementById('plain-chat')) return;
    const s = document.createElement('script');
    s.id = 'plain-chat'; s.async = true; s.src = 'https://chat.cdn-plain.com/index.js'; s.onload = init;
    document.head.appendChild(s);
  }, [chat]);
  return null;
}

function NewReport({ slug, platform, onDone }: { slug: string; platform: string; onDone: (id: string) => void }) {
  const [f, setF] = useState({ kind: 'bug', severity: 'minor', title: '', body: '', steps: '', expected: '', actual: '', platform, pageUrl: '' });
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  const bug = f.kind === 'bug';

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    const res = await fetch(`/api/tester/reports?slug=${encodeURIComponent(slug)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { setBusy(false); setErr(d.error ?? 'Couldn’t send it. Try again.'); return; }
    for (const file of files) {
      const fd = new FormData(); fd.append('file', file);
      const up = await fetch(`/api/tester/reports/${d.id}/attachments?slug=${encodeURIComponent(slug)}`, { method: 'POST', body: fd });
      if (!up.ok) { const u = await up.json().catch(() => ({})); setErr(`Report sent, but ${file.name} didn’t upload: ${u.error ?? 'error'}`); }
    }
    setBusy(false);
    onDone(d.id);
  }

  return (
    <form className="card" onSubmit={send} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h2>New report</h2>
      <div className="seg" role="group" aria-label="Kind of report">
        {KINDS.map((k) => (
          <button type="button" key={k.id} aria-pressed={f.kind === k.id} aria-label={`${k.label}: ${k.hint}`} onClick={() => set('kind', k.id)}><b>{k.label}</b><span>{k.hint}</span></button>
        ))}
      </div>
      <div className="field"><label htmlFor="title">Short title</label><input id="title" required maxLength={200} value={f.title} onChange={(e) => set('title', e.target.value)} placeholder={bug ? 'e.g. Checkout button does nothing on iPhone' : 'In a few words'} /></div>
      <div className="field"><label htmlFor="body">{bug ? 'What happened?' : 'Tell us more'}</label><textarea id="body" required value={f.body} onChange={(e) => set('body', e.target.value)} /></div>
      {bug && (
        <>
          <div className="field">
            <label id="sev">How bad is it?</label>
            <div className="seg" role="group" aria-labelledby="sev">
              {SEVERITY.map((s) => <button type="button" key={s.id} aria-pressed={f.severity === s.id} aria-label={`${s.label}: ${s.hint}`} onClick={() => set('severity', s.id)}><b>{s.label}</b><span>{s.hint}</span></button>)}
            </div>
          </div>
          <div className="field"><label htmlFor="steps">Steps to make it happen <span className="faint">(optional)</span></label><textarea id="steps" rows={3} value={f.steps} onChange={(e) => set('steps', e.target.value)} placeholder={'1. Open …\n2. Tap …'} /></div>
          <div className="grid2">
            <div className="field"><label htmlFor="exp">What you expected</label><input id="exp" value={f.expected} onChange={(e) => set('expected', e.target.value)} /></div>
            <div className="field"><label htmlFor="act">What actually happened</label><input id="act" value={f.actual} onChange={(e) => set('actual', e.target.value)} /></div>
          </div>
        </>
      )}
      <div className="grid2">
        <div className="field"><label htmlFor="plat">Device / browser</label><input id="plat" value={f.platform} onChange={(e) => set('platform', e.target.value)} /></div>
        <div className="field"><label htmlFor="where">Where in the product <span className="faint">(screen or link)</span></label><input id="where" value={f.pageUrl} onChange={(e) => set('pageUrl', e.target.value)} /></div>
      </div>
      <div className="field">
        <label htmlFor="files">Screenshots or a recording <span className="faint">(up to 5, 10 MB each)</span></label>
        <input id="files" type="file" multiple accept="image/png,image/jpeg,image/gif,image/webp,video/mp4,video/webm,video/quicktime,application/pdf,text/plain"
          onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 5))} />
      </div>
      {err && <div className="err" role="alert">{err}</div>}
      <div className="row"><button className="btn primary" type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send report'}</button></div>
    </form>
  );
}

function ReportView({ slug, id }: { slug: string; id: string }) {
  const [r, setR] = useState<Detail | null>(null);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const q = `slug=${encodeURIComponent(slug)}`;
  const load = useCallback(async () => {
    const res = await fetch(`/api/tester/reports/${id}?${q}`);
    if (res.ok) setR((await res.json()).report);
  }, [id, q]);
  useEffect(() => { load(); const iv = setInterval(load, 30_000); return () => clearInterval(iv); }, [load]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!reply.trim()) return;
    setBusy(true);
    const res = await fetch(`/api/tester/reports/${id}/replies?${q}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: reply }) });
    setBusy(false);
    if (res.ok) { setReply(''); load(); }
  }

  if (!r) return <p className="muted">Loading…</p>;
  const facts = [
    r.severity && ['Severity', r.severity], r.platform && ['Device', r.platform], r.pageUrl && ['Where', r.pageUrl],
    r.expected && ['Expected', r.expected], r.actual && ['Actual', r.actual],
  ].filter(Boolean) as [string, string][];
  return (
    <>
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span className="faint">{KIND_LABEL[r.kind]} · sent {when(r.createdAt)}</span>
          <span className={`pill ${r.status}`}>{r.statusLabel}</span>
        </div>
        <h2>{r.title}</h2>
        <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{r.body}</p>
        {r.steps && <div><b style={{ fontSize: 13 }}>Steps</b><p style={{ whiteSpace: 'pre-wrap', margin: '4px 0 0' }}>{r.steps}</p></div>}
        {facts.length > 0 && (
          <dl style={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '4px 12px', margin: 0, fontSize: 14 }}>
            {facts.map(([k, v]) => <React.Fragment key={k}><dt className="muted">{k}</dt><dd style={{ margin: 0, wordBreak: 'break-word' }}>{v}</dd></React.Fragment>)}
          </dl>
        )}
        {r.attachments.length > 0 && (
          <div className="row">
            {r.attachments.map((a) => (
              <a key={a.id} className="btn" href={`/api/tester/attachments/${a.id}?${q}`} target="_blank" rel="noreferrer">{a.filename}</a>
            ))}
          </div>
        )}
      </div>
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <h2>Conversation</h2>
        {r.replies.length === 0 && <p className="muted" style={{ margin: 0 }}>No replies yet. The team gets every report — you’ll see their answers here.</p>}
        {r.replies.map((m) => (
          <div key={m.id} className={`bubble ${m.authorType}`}>
            <div className="faint" style={{ marginBottom: 2 }}>{m.authorType === 'team' ? 'Team' : 'You'} · {when(m.createdAt)}</div>
            {m.body}
          </div>
        ))}
        <form onSubmit={send} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
          <label htmlFor="reply" style={{ marginBottom: 0 }}>Add a note or answer the team</label>
          <textarea id="reply" rows={3} style={{ minHeight: 72 }} value={reply} onChange={(e) => setReply(e.target.value)} />
          <div><button className="btn primary" type="submit" disabled={busy || !reply.trim()}>{busy ? 'Sending…' : 'Send'}</button></div>
        </form>
      </div>
    </>
  );
}
