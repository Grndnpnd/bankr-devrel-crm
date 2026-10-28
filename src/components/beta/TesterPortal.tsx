'use client';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { TesterShell } from '@/components/beta/testerStyles';
import { LABEL } from '@/lib/betaModel';
import {
  AboutFooter, ChatButton, checkFiles, clearDrafts, draftKey, FILE_TYPES, MAX_FILES, mb, uploadFiles, UploadProgress,
  useHydrated, useKeepTyped, visible, When, type About, type Chat, type UploadState,
} from '@/components/beta/tester/common';

interface Message { id: string; title: string; message: string | null; status: string; answer: string | null; sentAt: string | null; report: { id: string; title: string } | null; canAnswer: boolean }
interface Me {
  chat: Chat | null;
  tester: { name: string; email: string | null; platform: string | null };
  program: About & { open: boolean; ended: boolean; testAreas?: string[] };
  messages: Message[];
  reports: { id: string; kind: string; title: string; severity: string | null; status: string; statusLabel: string; tone?: string; retest?: boolean; createdAt: string; teamReplies: number; unread: number }[];
}
interface Detail {
  id: string; kind: string; title: string; body: string; severity: string | null; steps: string | null; expected: string | null; actual: string | null;
  platform: string | null; pageUrl: string | null; device?: string | null; browser?: string | null; testArea?: string | null;
  status: string; statusLabel: string; tone?: string; retest?: boolean; createdAt: string;
  replies: { id: string; authorType: 'team' | 'tester'; body: string; createdAt: string }[];
  attachments: { id: string; filename: string; contentType: string; size: number }[];
}
type Problem = 'bad_link' | 'signed_out' | 'ended' | 'left' | 'logged_out';
interface Contact { name: string; contactEmail: string | null; runBy: string | null; privacyUrl?: string | null }

const KINDS = [
  { id: 'bug', label: 'Bug', hint: 'Something is broken or looks wrong' },
  { id: 'feedback', label: 'Feedback', hint: 'How something felt to use' },
  { id: 'idea', label: 'Idea', hint: 'Something you want it to do' },
  { id: 'question', label: 'Question', hint: 'You are not sure how something works' },
  { id: 'praise', label: 'Praise', hint: 'Something you liked' },
];
const SEVERITY = [
  { id: 'critical', label: 'Critical', hint: 'I can’t use it at all, or money is at risk' },
  { id: 'high', label: 'High', hint: 'A main feature is broken' },
  { id: 'medium', label: 'Medium', hint: 'Annoying, but it still works' },
  { id: 'low', label: 'Low', hint: 'Looks wrong or is small' },
];
/** Device choices in the tester's words (stored as the team's values). */
const TESTER_DEVICES: [string, string][] = [
  ['desktop_web', 'Computer (web browser)'], ['mobile_web', 'Phone (web browser)'], ['ios', 'iPhone app'], ['android', 'Android app'],
];
const deviceLabel = (v: string | null | undefined) => (v ? TESTER_DEVICES.find(([d]) => d === v)?.[1] ?? LABEL.device[v] ?? v : '');
/** What each status means, in plain words (shown under "Your reports"). */
const STATUS_MEANING: [string, string][] = [
  ['Received by the team', 'The team has your report. Nobody has looked at it yet.'],
  ['Seen', 'Someone on the team read it.'],
  ['Being worked on', 'The team is fixing it.'],
  ['Fix in progress', 'A fix is ready and is being checked.'],
  ['Fixed — please retest', 'The fix is released. Please try again and tell us if it works.'],
  ['Fixed', 'The fix works. Thank you!'],
  ['Already reported / Already known', 'Someone else reported the same thing, or the team knew about it.'],
  ['Won’t fix', 'The team decided not to change this.'],
  ['Noted / Passed to the team / Shipped / Answered', 'The team read your feedback, idea or question and acted on it.'],
];
const KIND_LABEL: Record<string, string> = { bug: 'Bug', feedback: 'Feedback', idea: 'Idea', question: 'Question', praise: 'Praise' };
const sevLabel = (s: string | null) => (s ? LABEL.severity[s] ?? s : '');
const pill = (r: { tone?: string }) => `pill ${r.tone ?? 'info'}`;
const api = (slug: string, path: string, init?: RequestInit) =>
  fetch(`${path}${path.includes('?') ? '&' : '?'}slug=${encodeURIComponent(slug)}`, init).catch(() => null);
/** A link that works before the page's script loads (slow phones), and navigates in place after. */
const go = (fn: () => void) => (e: React.MouseEvent) => {
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
  e.preventDefault(); fn();
};

export default function TesterPortal({ slug, initial, problem: initialProblem, contact, initialView, initialReport }: {
  slug: string; initial: Me | null; problem: Problem | null; contact: Contact | null; initialView?: string; initialReport?: Detail | null;
}) {
  const [me, setMe] = useState<Me | null>(initial);
  const [problem, setProblem] = useState<Problem | null>(initialProblem);
  // The server rendered the view in the URL (?r=<id> / ?new=1), so a tap on a slow phone doesn't flash the list first.
  const [view, setViewState] = useState<'list' | 'new' | string>(initialView || 'list');
  const [notice, setNotice] = useState<string | null>(null);
  const [listNotice, setListNotice] = useState<string | null>(null);
  const base = `/b/${slug}/portal`;
  // The open report lives in the URL (?r=<id>, ?new=1), so refresh and the Back button work.
  const setView = useCallback((v: string, replace = false) => {
    const url = v === 'list' ? location.pathname : v === 'new' ? `${location.pathname}?new=1` : `${location.pathname}?r=${encodeURIComponent(v)}`;
    if (replace) history.replaceState(null, '', url); else history.pushState(null, '', url);
    if (v !== 'list') setListNotice(null);
    setViewState(v); window.scrollTo(0, 0);
  }, []);
  useEffect(() => {
    const read = () => { const sp = new URLSearchParams(location.search); setViewState(sp.get('r') || (sp.get('new') ? 'new' : 'list')); };
    read(); window.addEventListener('popstate', read); return () => window.removeEventListener('popstate', read);
  }, []);
  const load = useCallback(async () => {
    const r = await api(slug, '/api/tester/me');
    if (!r) return; // offline: keep what's on screen
    const d = await r.json().catch(() => ({}));
    if (r.status === 401) { setProblem(d.reason === 'ended' ? 'ended' : 'signed_out'); return; }
    if (r.ok) setMe(d);
  }, [slug]);
  useEffect(() => { if (!initialProblem) load(); }, [load, initialProblem]);
  /** Back to the list with a short message (e.g. after a withdraw, or a report withdrawn in another tab). */
  const backToList = useCallback((msg: string | null) => { setView('list', true); setListNotice(msg); load(); }, [setView, load]);
  const toList = useCallback(() => backToList(null), [backToList]);

  if (problem) return <ProblemScreen problem={problem} contact={contact ?? (me ? { name: me.program.name, contactEmail: me.program.contactEmail, runBy: me.program.runBy, privacyUrl: me.program.privacyUrl } : null)} />;
  if (!me) {
    return <TesterShell><div className="card" aria-busy="true" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}><div className="skeleton" style={{ width: '40%' }} /><div className="skeleton" /><div className="skeleton" style={{ width: '70%' }} /></div></TesterShell>;
  }
  const retests = me.reports.filter((r) => r.retest);
  const who = me.tester.email || me.tester.name;

  return (
    <TesterShell>
      <header className="row" style={{ justifyContent: 'space-between', padding: '8px 4px', alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <div className="eyebrow"><bdi>{me.program.name}</bdi></div>
          <h1>Hi <bdi>{me.tester.name.split(' ')[0]}</bdi></h1>
        </div>
        <div className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
          {view === 'list'
            ? me.program.open && <a className="btn primary" href={`${base}?new=1`} onClick={go(() => setView('new'))}>New report</a>
            : <a className="btn" href={base} onClick={go(() => { setView('list'); load(); })}>All my reports</a>}
        </div>
      </header>

      {view === 'list' && (
        <>
          {listNotice && <div className="ok" role="status">{listNotice}</div>}
          {me.messages.length > 0 && <Messages slug={slug} base={base} messages={me.messages} onChanged={load} onOpenReport={setView} />}
          {retests.length > 0 && (
            <div className="card ask" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <b>We fixed {retests.length === 1 ? 'something you reported' : `${retests.length} things you reported`}. Could you try again?</b>
              {retests.map((r) => <a key={r.id} className="linkish wrap-text" href={`${base}?r=${r.id}`} onClick={go(() => setView(r.id))}><bdi>{r.title}</bdi> →</a>)}
            </div>
          )}
          <div className="card">
            <h2 style={{ marginBottom: 6 }}>Your reports</h2>
            {me.reports.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>You have not sent a report yet. {me.program.open ? 'Found a problem or have an idea? Choose “New report”.' : ''}</p>
            ) : (
              <div className="list">
                {me.reports.map((r) => (
                  <a key={r.id} className="item" href={`${base}?r=${r.id}`} onClick={go(() => setView(r.id))}>
                    {r.unread > 0 ? <span className="dot" aria-label="New reply" /> : <span style={{ width: 8, flexShrink: 0 }} />}
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <b style={{ display: 'block' }}><bdi>{r.title}</bdi></b>
                      <span className="faint">{KIND_LABEL[r.kind]}{r.severity ? ` · ${sevLabel(r.severity)}` : ''} · <When iso={r.createdAt} />{r.teamReplies ? ` · ${r.teamReplies} ${r.teamReplies === 1 ? 'reply' : 'replies'} from the team` : ''}</span>
                    </span>
                    <span className={pill(r)}>{r.retest ? 'Please retest' : r.statusLabel}</span>
                  </a>
                ))}
              </div>
            )}
            <details style={{ marginTop: 12 }}>
              <summary>What the statuses mean</summary>
              <dl style={{ display: 'grid', gridTemplateColumns: 'minmax(0,max-content) 1fr', gap: '6px 12px', margin: 0, fontSize: 14 }}>
                {STATUS_MEANING.map(([k, v]) => <React.Fragment key={k}><dt style={{ fontWeight: 600 }}>{k}</dt><dd style={{ margin: 0 }} className="muted">{v}</dd></React.Fragment>)}
              </dl>
            </details>
          </div>
          {(me.program.description || me.program.welcome) && (
            <div className="card">
              <details open={me.reports.length === 0}>
                <summary>About this beta</summary>
                {me.program.description && <p className="muted" style={{ whiteSpace: 'pre-wrap', margin: '0 0 8px' }}>{me.program.description}</p>}
                {me.program.welcome && <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{me.program.welcome}</p>}
              </details>
            </div>
          )}
          {me.chat && <div className="row"><ChatButton slug={slug} chat={me.chat} contactEmail={me.program.contactEmail} /></div>}
          {!me.program.open && <p className="faint" style={{ padding: '0 4px' }}>{me.program.ended ? 'This beta has ended.' : 'This beta isn’t taking new reports right now.'} You can still read your reports and reply to the team.</p>}
          <Account slug={slug} me={me} onLeft={() => { clearDrafts(slug); setProblem('left'); }} onLoggedOut={() => { clearDrafts(slug); setProblem('logged_out'); }} />
        </>
      )}

      {view === 'new' && (me.program.open
        ? <NewReport slug={slug} who={who} platform={me.tester.platform ?? ''} areas={me.program.testAreas ?? []} onDone={(id, problemText) => { setNotice(problemText); setView(id, true); load(); }} />
        : <div className="card"><p className="muted" style={{ margin: 0 }}>This beta isn’t taking new reports right now.</p></div>)}
      {view !== 'list' && view !== 'new' && (
        <ReportView slug={slug} id={view} initial={initialReport && initialReport.id === view ? initialReport : null} canAttach={me.program.open} notice={notice} onNotice={setNotice}
          onGone={(msg) => backToList(msg)} onChanged={load} />
      )}
      <AboutFooter about={me.program} />
    </TesterShell>
  );
}

/** A page that can't show the tester's reports, with a way forward every time. */
function ProblemScreen({ problem, contact }: { problem: Problem; contact: Contact | null }) {
  const copy: Record<Problem, [string, string]> = {
    ended: ['This beta has ended', 'Thank you for taking part.'],
    signed_out: ['Open your personal link', 'To see your reports on this device, open the personal link you got when you joined. If this beta sends email, we also emailed it to you.'],
    bad_link: ['That personal link doesn’t work', 'That personal link doesn’t work any more. It may be mistyped, replaced by a newer link, or the account was deleted.'],
    logged_out: ['You are signed out on this device', 'To come back, open your personal link again.'],
    left: ['You have left the beta', 'Your account, reports, files and messages were deleted. Thank you for testing.'],
  };
  const [title, text] = copy[problem];
  return (
    <TesterShell>
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {contact?.name && <div className="eyebrow"><bdi>{contact.name}</bdi></div>}
        <h1>{title}</h1>
        <p className="muted" style={{ margin: 0 }}>{text}</p>
      </div>
      <AboutFooter about={{ runBy: contact?.runBy, contactEmail: contact?.contactEmail, privacyUrl: contact?.privacyUrl }} />
    </TesterShell>
  );
}

function Messages({ slug, base, messages, onChanged, onOpenReport }: { slug: string; base: string; messages: Message[]; onChanged: () => void; onOpenReport: (id: string) => void }) {
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <h2>Messages from the team</h2>
      {messages.map((m) => <MessageItem key={m.id} slug={slug} base={base} m={m} onChanged={onChanged} onOpenReport={onOpenReport} />)}
    </div>
  );
}

function MessageItem({ slug, base, m, onChanged, onOpenReport }: { slug: string; base: string; m: Message; onChanged: () => void; onOpenReport: (id: string) => void }) {
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useKeepTyped(`answer:${m.id}`, (_k, v) => setAnswer(v));
  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!visible(answer) || busy) return;
    setBusy(true); setErr(null);
    const res = await api(slug, `/api/tester/messages/${m.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answer }) });
    setBusy(false);
    if (res?.ok) { setAnswer(''); onChanged(); return; }
    const d = await res?.json().catch(() => ({}));
    setErr(d?.error ?? 'Couldn’t send. Check your connection and try again. Your answer is still here.');
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, borderTop: '1px solid var(--line)', paddingTop: 12 }}>
      <span className="faint"><When iso={m.sentAt} />{m.report ? <> · about <a className="linkish" href={`${base}?r=${m.report.id}`} onClick={go(() => onOpenReport(m.report!.id))}><bdi>{m.report.title}</bdi></a></> : null}</span>
      <div className="bubble team" style={{ maxWidth: '100%' }}>{m.message || m.title}</div>
      {m.answer && <div className="bubble tester" style={{ maxWidth: '100%' }}><div className="faint" style={{ marginBottom: 2 }}>Your answer</div>{m.answer}</div>}
      {m.canAnswer && (
        <form onSubmit={send} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label htmlFor={`ans-${m.id}`} style={{ marginBottom: 0 }}>{m.answer ? 'Add to your answer' : 'Your answer'}</label>
          <textarea id={`ans-${m.id}`} data-keep={`answer:${m.id}`} rows={2} maxLength={4000} style={{ minHeight: 56 }} value={answer} onChange={(e) => setAnswer(e.target.value)} />
          {err && <div className="err" role="alert">{err}</div>}
          <div><button className="btn primary" type="submit" disabled={busy || !visible(answer)}>{busy ? 'Sending…' : 'Send answer'}</button></div>
        </form>
      )}
    </div>
  );
}

/** Another-device link, turn off all links, sign out, leave and delete. */
function Account({ slug, me, onLeft, onLoggedOut }: { slug: string; me: Me; onLeft: () => void; onLoggedOut: () => void }) {
  const [link, setLink] = useState<{ url: string; reset: boolean } | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function newLink(reset: boolean) {
    if (reset && !window.confirm('Turn off all your personal links?\n\nEvery link you have (the first one, and any you made for other devices) stops working. You get one new link to save. This browser stays signed in.')) return;
    setBusy(true); setErr(null); setCopied(false);
    const res = await api(slug, '/api/tester/link', { method: 'POST', ...(reset ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reset: true }) } : {}) });
    const d = await res?.json().catch(() => ({}));
    setBusy(false);
    if (res?.ok) setLink({ url: d.url, reset }); else setErr(d?.error ?? 'Couldn’t make a link. Try again.');
  }
  async function logout() {
    await api(slug, '/api/tester/logout', { method: 'POST' });
    onLoggedOut();
  }
  async function leave() {
    const product = me.program.product || me.program.name;
    const ok = window.confirm(
      `Leave the ${product} beta and delete your data?\n\n` +
      'This deletes your account, all your reports, your files, your conversations with the team and your messages. It can’t be undone.' +
      (me.program.plain ? '\n\nCopies the team already has in Plain (your contact details, your reports and messages) stay there until the team deletes them.' : ''),
    );
    if (!ok) return;
    setBusy(true); setErr(null);
    const res = await api(slug, '/api/tester/me', { method: 'DELETE' });
    setBusy(false);
    if (res?.ok) { onLeft(); return; }
    const d = await res?.json().catch(() => ({}));
    setErr(d?.error ?? 'Couldn’t delete your data. Try again, or contact the team.');
  }
  return (
    <div className="card acct" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <h2>Your account</h2>
      <span className="faint">Signed in as <bdi>{me.tester.name}</bdi>{me.tester.email ? <> (<bdi>{me.tester.email}</bdi>)</> : ''}.</span>
      {link ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span>{link.reset ? 'Your old links no longer work. This is your new personal link. Save it:' : 'Open this link on your other device:'}</span>
          <code className="link">{link.url}</code>
          <span className="faint">{link.reset ? '' : 'This is an extra link. Your first link keeps working too. '}Keep it private: anyone who has it can see your reports and send reports in your name.</span>
          <div><button className="btn" type="button" onClick={() => navigator.clipboard.writeText(link.url).then(() => setCopied(true)).catch(() => {})}>{copied ? 'Copied' : 'Copy link'}</button></div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div><button className="btn" type="button" onClick={() => newLink(false)} disabled={busy}>Open this page on another device</button></div>
          <span className="faint">This makes an extra link. Your first link keeps working too.</span>
        </div>
      )}
      {err && <div className="err" role="alert">{err}</div>}
      <div className="row acct-actions">
        <button className="linkish" type="button" onClick={() => newLink(true)} disabled={busy}>My link may have been shared — turn off all my links</button>
        <button className="linkish" type="button" onClick={logout}>Sign out on this device</button>
        <button className="linkish danger" type="button" onClick={leave} disabled={busy}>Leave the beta and delete my data</button>
      </div>
    </div>
  );
}

/** A first guess at the device; the tester can change it. */
function guessDevice() {
  if (typeof navigator === 'undefined') return 'desktop_web';
  return /iPhone|iPad|Android|Mobi/.test(navigator.userAgent) ? 'mobile_web' : 'desktop_web';
}
/** "Safari 18" / "Chrome 130" from the browser, as a starting point for the version field. */
function guessBrowser() {
  if (typeof navigator === 'undefined') return '';
  const ua = navigator.userAgent;
  const m = ua.match(/Edg\/(\d+)/) ? ['Edge', ua.match(/Edg\/(\d+)/)![1]] : ua.match(/Firefox\/(\d+)/) ? ['Firefox', ua.match(/Firefox\/(\d+)/)![1]]
    : ua.match(/Chrome\/(\d+)/) ? ['Chrome', ua.match(/Chrome\/(\d+)/)![1]] : ua.match(/Version\/(\d+).*Safari/) ? ['Safari', ua.match(/Version\/(\d+)/)![1]] : null;
  return m ? `${m[0]} ${m[1]}` : '';
}

const EMPTY = { kind: 'bug', claimedSeverity: 'medium', title: '', body: '', steps: '', expected: '', pageUrl: '', testArea: '', device: '', browser: '' };
type Draft = typeof EMPTY;
const hasText = (f: Draft) => !!(visible(f.title) || visible(f.body) || visible(f.steps) || visible(f.expected));

function NewReport({ slug, who, platform, areas, onDone }: { slug: string; who: string; platform: string; areas: string[]; onDone: (id: string, problem: string | null) => void }) {
  const [f, setF] = useState<Draft>(EMPTY);
  const [restored, setRestored] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<UploadState | null>(null);
  const [phase, setPhase] = useState<'idle' | 'sending' | 'uploading'>('idle');
  const [err, setErr] = useState<string | null>(null);
  const hydrated = useHydrated();
  const sent = useRef(false);
  // The device and version we guessed; the version is cleared if they pick another device (unless they typed one).
  const guessed = useRef({ device: '', browser: '' });
  const key = draftKey(slug, who);
  const set = (k: keyof Draft, v: string) => setF((x) => ({ ...x, [k]: v }));
  const fileInput = useRef<HTMLInputElement>(null);
  // Typed into the server-rendered form before the script loaded: keep it (it beats a restored draft).
  const typed = useRef<Partial<Draft>>({});
  useKeepTyped('report:', (k, v) => { if (k in EMPTY) { typed.current[k as keyof Draft] = v; set(k as keyof Draft, v); } });
  const bug = f.kind === 'bug';

  // Restore this tester's draft (a Back swipe or a reload shouldn't lose what they typed); otherwise prefill the device.
  useEffect(() => {
    let draft: Draft | null = null;
    try { draft = JSON.parse(localStorage.getItem(key) || 'null'); } catch {}
    const device = guessDevice(), browser = guessBrowser() || platform;
    guessed.current = { device, browser };
    const early = typed.current;
    if (draft && hasText(draft)) { setF({ ...EMPTY, ...draft, device: draft.device || device, browser: draft.browser ?? browser, ...early }); setRestored(true); }
    else setF((x) => ({ ...x, device: x.device || device, browser: x.browser || browser }));
  }, [key, platform]);
  useEffect(() => {
    if (sent.current) return;
    try { if (hasText(f)) localStorage.setItem(key, JSON.stringify(f)); } catch {}
  }, [f, key]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (hasText(f) && !sent.current) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [f]);
  function discard() {
    try { localStorage.removeItem(key); } catch {}
    setF({ ...EMPTY, ...guessed.current }); setRestored(false);
  }
  function pickDevice(v: string) {
    setF((x) => ({ ...x, device: v, browser: v !== guessed.current.device && x.browser === guessed.current.browser ? '' : x.browser }));
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!visible(f.title)) { setErr('Give your report a short title.'); return; }
    if (!visible(f.body)) { setErr(bug ? 'Tell us what happened.' : 'Tell us a bit more.'); return; }
    setBusy(true); setErr(null); setPhase('sending');
    const body = { ...f, claimedSeverity: bug ? f.claimedSeverity : null, platform: f.browser };
    const res = await fetch(`/api/tester/reports?slug=${encodeURIComponent(slug)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
    const d = await res?.json().catch(() => ({}));
    if (!res?.ok) { setBusy(false); setPhase('idle'); setErr(d?.error ?? 'Couldn’t send it. Check your connection and try again. What you typed is saved.'); return; }
    sent.current = true;
    clearDrafts(slug);
    setPhase('uploading');
    const { failed } = files.length ? await uploadFiles(slug, d.id, files, setProgress) : { failed: [] as string[] };
    setBusy(false);
    onDone(d.id, failed.length ? `Your report was sent, but some files didn’t attach. ${failed.join(' ')} You can add files below.` : null);
  }
  async function pick(input: HTMLInputElement) {
    const { keep, problems } = await checkFiles(Array.from(input.files ?? []), MAX_FILES - files.length);
    // The browser's own "N files" label would disagree with what attaches, so clear it and show our list.
    input.value = '';
    setFiles((x) => [...x, ...keep].slice(0, MAX_FILES));
    setErr(problems.length ? `Not attached: ${problems.join(' ')}` : null);
  }

  return (
    <form className="card" onSubmit={send} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h2>New report</h2>
      {restored && <div className="note row" style={{ justifyContent: 'space-between' }}><span>We restored what you typed before.</span><button type="button" className="linkish" onClick={discard}>Discard</button></div>}
      <div className="field">
        <label id="kind">What kind of report is it?</label>
        <div className="seg" role="group" aria-labelledby="kind">
          {KINDS.map((k) => (
            <button type="button" key={k.id} aria-pressed={f.kind === k.id} aria-label={`${k.label}: ${k.hint}`} onClick={() => set('kind', k.id)}><b>{k.label}</b><span>{k.hint}</span></button>
          ))}
        </div>
      </div>
      <div className="field"><label htmlFor="title">Short title</label><input id="title" data-keep="report:title" required maxLength={200} value={f.title} onChange={(e) => set('title', e.target.value)} placeholder={bug ? 'e.g. Send does nothing' : 'In a few words'} /></div>
      <div className="field"><label htmlFor="body">{bug ? 'What happened?' : 'Tell us more'}</label><textarea id="body" data-keep="report:body" required maxLength={10000} value={f.body} onChange={(e) => set('body', e.target.value)} /></div>
      {bug && (
        <>
          <div className="field">
            <label id="sev">How bad is it?</label>
            <div className="seg" role="group" aria-labelledby="sev">
              {SEVERITY.map((s) => <button type="button" key={s.id} aria-pressed={f.claimedSeverity === s.id} aria-label={`${s.label}: ${s.hint}`} onClick={() => set('claimedSeverity', s.id)}><b>{s.label}</b><span>{s.hint}</span></button>)}
            </div>
          </div>
          <div className="field"><label htmlFor="steps">Steps to make it happen again <span className="req">(optional)</span></label><textarea id="steps" data-keep="report:steps" rows={3} maxLength={4000} value={f.steps} onChange={(e) => set('steps', e.target.value)} placeholder={'1. Open …\n2. Choose …'} /></div>
          <div className="field"><label htmlFor="exp">What did you expect to happen? <span className="req">(optional)</span></label><input id="exp" data-keep="report:expected" maxLength={2000} value={f.expected} onChange={(e) => set('expected', e.target.value)} /></div>
        </>
      )}
      <div className="grid2">
        {areas.length > 0 && (
          <div className="field"><label htmlFor="area">Which part of the product <span className="req">(optional)</span></label>
            <select id="area" value={f.testArea} onChange={(e) => set('testArea', e.target.value)}><option value="">I’m not sure</option>{areas.map((a) => <option key={a} value={a}>{a}</option>)}</select>
          </div>
        )}
        <div className="field"><label htmlFor="where">Screen or link where it happened <span className="req">(optional)</span></label><input id="where" data-keep="report:pageUrl" maxLength={500} value={f.pageUrl} onChange={(e) => set('pageUrl', e.target.value)} /></div>
        <div className="field"><label htmlFor="dev">What were you using? <span className="req">(optional)</span></label>
          <select id="dev" value={f.device} onChange={(e) => pickDevice(e.target.value)}><option value="">I’m not sure</option>{TESTER_DEVICES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        </div>
        <div className="field"><label htmlFor="br">Browser or app version <span className="req">(optional)</span></label><input id="br" data-keep="report:browser" maxLength={120} value={f.browser} onChange={(e) => set('browser', e.target.value)} placeholder="e.g. Safari 18, app 2.4.1" /></div>
      </div>
      <div className="field">
        <label htmlFor="files">Screenshots or a screen recording <span className="req">(optional · up to 5 files, 10 MB each)</span></label>
        <div className="row tap-row">
          <button type="button" className="btn" disabled={files.length >= MAX_FILES} onClick={() => fileInput.current?.click()}>{files.length ? 'Add more files' : 'Choose files'}</button>
          {files.length > 0 && <button type="button" className="linkish" onClick={() => setFiles([])}>Remove all</button>}
        </div>
        <input id="files" ref={fileInput} type="file" multiple hidden accept={FILE_TYPES.join(',')} onChange={(e) => pick(e.currentTarget)} />
        <span className="faint" style={{ marginTop: 6 }}>Hide seed phrases, private keys and balances before you upload.</span>
        <span className="faint wrap-text" style={{ marginTop: 6 }} role="status">
          {files.length === 0 ? 'No files chosen.' : `${files.length} ${files.length === 1 ? 'file' : 'files'} will attach: ${files.map((x) => `${x.name} (${mb(x.size)})`).join(', ')}`}
        </span>
      </div>
      {err && <div className="err" role="alert">{err}</div>}
      {phase === 'uploading' && <div className="note">Report sent. Uploading your files…</div>}
      {progress && <UploadProgress s={progress} />}
      <div className="row actionbar"><button className="btn primary" type="submit" disabled={busy || !hydrated}>{!hydrated ? 'Loading…' : phase === 'sending' ? 'Sending…' : phase === 'uploading' ? 'Uploading files…' : 'Send report'}</button></div>
    </form>
  );
}

const WITHDRAWN = 'This report was withdrawn.';

function ReportView({ slug, id, initial, canAttach, notice, onNotice, onGone, onChanged }: { slug: string; id: string; initial: Detail | null; canAttach: boolean; notice: string | null; onNotice: (m: string | null) => void; onGone: (msg: string | null) => void; onChanged: () => void }) {
  const [r, setR] = useState<Detail | null>(initial);
  const seeded = useRef(!!initial);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<UploadState | null>(null);
  const [replyErr, setReplyErr] = useState<string | null>(null);
  const [retestNote, setRetestNote] = useState('');
  const [retestBusy, setRetestBusy] = useState(false);
  const [retestErr, setRetestErr] = useState<string | null>(null);
  const [retestDone, setRetestDone] = useState<string | null>(null);
  const [withdrawing, setWithdrawing] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const sendBtn = useRef<HTMLButtonElement>(null);
  useKeepTyped(`note:${id}`, (_k, v) => setReply(v));
  const q = `slug=${encodeURIComponent(slug)}`;
  const load = useCallback(async () => {
    const res = await fetch(`/api/tester/reports/${id}?${q}`).catch(() => null);
    if (res?.ok) setR((await res.json()).report);
    else if (res?.status === 404) { const d = await res.json().catch(() => ({})); onGone(d?.gone ? WITHDRAWN : null); }
  }, [id, q, onGone]);
  useEffect(() => {
    // Rendered with the report already (server): skip the first fetch, keep refreshing after.
    if (seeded.current) seeded.current = false; else load();
    const iv = setInterval(() => { if (!document.hidden) load(); }, 30_000);
    return () => clearInterval(iv);
  }, [load]);
  useEffect(() => () => onNotice(null), [onNotice]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!visible(reply) || busy) return;
    setBusy(true); setReplyErr(null);
    const res = await fetch(`/api/tester/reports/${id}/replies?${q}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: reply }) }).catch(() => null);
    setBusy(false);
    if (res?.ok) { setReply(''); load(); return; }
    const d = await res?.json().catch(() => ({}));
    if (d?.gone) { onGone(WITHDRAWN); return; }
    setReplyErr(d?.error ?? 'Couldn’t send. Check your connection and try again. Your message is still here.');
  }
  async function retest(works: boolean) {
    setRetestBusy(true); setRetestErr(null);
    const res = await fetch(`/api/tester/reports/${id}/retest?${q}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ works, note: retestNote }) }).catch(() => null);
    setRetestBusy(false);
    if (!res?.ok) { const d = await res?.json().catch(() => ({})); setRetestErr(d?.error ?? 'Couldn’t send. Try again.'); return; }
    setRetestNote(''); setRetestDone(works ? 'Thank you! We marked it as fixed.' : 'Thank you. We sent it back to the team.');
    load(); onChanged();
  }
  async function addFiles(input: HTMLInputElement) {
    if (!r) return;
    const { keep, problems } = await checkFiles(Array.from(input.files ?? []), MAX_FILES - r.attachments.length);
    input.value = '';
    const { failed, gone } = await uploadFiles(slug, id, keep, setProgress);
    if (gone) { onGone(WITHDRAWN); return; }
    const all = [...problems, ...failed];
    onNotice(all.length ? `Not attached: ${all.join(' ')}` : null);
    load();
  }
  async function removeFile(fileId: string, name: string) {
    if (!window.confirm(`Remove ${name} from this report?`)) return;
    const res = await fetch(`/api/tester/attachments/${fileId}?${q}`, { method: 'DELETE' }).catch(() => null);
    if (!res?.ok) { const d = await res?.json().catch(() => ({})); onNotice(d?.error ?? 'Couldn’t remove the file. Try again.'); return; }
    load();
  }
  async function withdraw() {
    if (withdrawing) return; // a double click opens one confirm, sends one request
    setWithdrawing(true);
    try {
      if (!window.confirm('Withdraw this report? It is deleted with its conversation and files, and the team won’t see it any more. This can’t be undone.')) return;
      const res = await fetch(`/api/tester/reports/${id}?${q}`, { method: 'DELETE' }).catch(() => null);
      const d = res && !res.ok ? await res.json().catch(() => ({})) : null;
      if (res?.ok || d?.gone) { onChanged(); onGone('Report withdrawn.'); return; }
      onNotice(d?.error ?? 'Couldn’t withdraw the report. Try again.');
    } finally {
      setWithdrawing(false);
    }
  }

  if (!r) return <div className="card" aria-busy="true" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}><div className="skeleton" style={{ width: '50%' }} /><div className="skeleton" /></div>;
  const facts = [
    r.severity && ['How bad', sevLabel(r.severity)], r.testArea && ['Part', r.testArea],
    (r.device || r.browser) && ['Device', [deviceLabel(r.device), r.browser].filter(Boolean).join(' · ')],
    r.pageUrl && ['Where', r.pageUrl], r.expected && ['Expected', r.expected], r.actual && ['Actual', r.actual],
  ].filter(Boolean) as [string, string][];
  const fileUrl = (aid: string, thumb = false) => `/api/tester/attachments/${aid}?${q}${thumb ? '&thumb=1' : ''}`;
  return (
    <>
      {(r.retest || retestDone) && (
        <div className="card ask" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {retestDone ? <b>{retestDone}</b> : <>
            <h2>The fix is released. Does it work now?</h2>
            <p className="muted" style={{ margin: 0 }}>Please try what you reported again and tell us. If it is still broken, a short note about what you saw helps.</p>
            <textarea rows={2} style={{ minHeight: 56 }} maxLength={2000} value={retestNote} onChange={(e) => setRetestNote(e.target.value)} placeholder="Note (optional)" aria-label="Note about the retest (optional)" />
            {retestErr && <div className="err" role="alert">{retestErr}</div>}
            <div className="row tap-row">
              <button className="btn primary" type="button" disabled={retestBusy} onClick={() => retest(true)}>Works now</button>
              <button className="btn" type="button" disabled={retestBusy} onClick={() => retest(false)}>Still broken</button>
            </div>
          </>}
        </div>
      )}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span className="faint">{KIND_LABEL[r.kind]} · sent <When iso={r.createdAt} /></span>
          <span className={pill(r)}>{r.statusLabel}</span>
        </div>
        <h2><bdi>{r.title}</bdi></h2>
        <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{r.body}</p>
        {r.steps && <div className="wrap-text"><b style={{ fontSize: 13 }}>Steps</b><p style={{ whiteSpace: 'pre-wrap', margin: '4px 0 0' }}>{r.steps}</p></div>}
        {facts.length > 0 && (
          <dl style={{ display: 'grid', gridTemplateColumns: 'max-content minmax(0,1fr)', gap: '4px 12px', margin: 0, fontSize: 14 }}>
            {facts.map(([k, v]) => <React.Fragment key={k}><dt className="muted">{k}</dt><dd style={{ margin: 0 }}>{v}</dd></React.Fragment>)}
          </dl>
        )}
        {r.attachments.length > 0 && (
          <div className="row" style={{ gap: 14 }}>
            {r.attachments.map((a) => (
              <span key={a.id} className="thumb-wrap">
                {a.contentType.startsWith('image/') ? (
                  <a href={fileUrl(a.id)} target="_blank" rel="noreferrer" title={a.filename}>
                    <img className="thumb" src={fileUrl(a.id, true)} alt={a.filename} loading="lazy" />
                  </a>
                ) : (
                  <a className="btn file-chip wrap-text" href={fileUrl(a.id)} target="_blank" rel="noreferrer">{a.filename}</a>
                )}
                {canAttach && <button type="button" className="thumb-x" aria-label={`Remove ${a.filename}`} title="Remove this file" onClick={() => removeFile(a.id, a.filename)}>×</button>}
              </span>
            ))}
          </div>
        )}
        {notice && <div className="err" role="alert">{notice}</div>}
        {progress && <UploadProgress s={progress} />}
        {canAttach && r.attachments.length < MAX_FILES && (
          <div className="row tap-row">
            <button type="button" className="btn" disabled={!!progress} onClick={() => fileInput.current?.click()}>
              {progress ? 'Uploading…' : r.attachments.length ? 'Add another file' : 'Add a screenshot or file'}
            </button>
            <input ref={fileInput} type="file" multiple hidden accept={FILE_TYPES.join(',')} aria-label="Choose files to add" onChange={(e) => addFiles(e.currentTarget)} />
            <span className="faint">Hide seed phrases, private keys and balances before you upload.</span>
          </div>
        )}
      </div>
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <h2>Conversation</h2>
        {r.replies.length === 0 && <p className="muted" style={{ margin: 0 }}>No replies yet. The team reads every report. Their answers will show here.</p>}
        {r.replies.map((m) => (
          <div key={m.id} className={`bubble ${m.authorType}`}>
            <div className="faint" style={{ marginBottom: 2 }}>{m.authorType === 'team' ? 'Team' : 'You'} · <When iso={m.createdAt} /></div>
            {m.body}
          </div>
        ))}
        <form onSubmit={send} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
          <label htmlFor="reply" style={{ marginBottom: 0 }}>Add a note, or answer the team</label>
          <textarea id="reply" data-keep={`note:${id}`} rows={3} maxLength={5000} style={{ minHeight: 72 }} value={reply} onChange={(e) => setReply(e.target.value)}
            onFocus={() => setTimeout(() => sendBtn.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 300)} />
          {replyErr && <div className="err" role="alert">{replyErr}</div>}
          <div className="row actionbar"><button ref={sendBtn} className="btn primary" type="submit" disabled={busy || !visible(reply)}>{busy ? 'Sending…' : 'Send'}</button></div>
        </form>
      </div>
      <div className="tap-row" style={{ padding: '0 4px' }}>
        <button type="button" className="linkish danger" onClick={withdraw} disabled={withdrawing}>{withdrawing ? 'Withdrawing…' : 'Withdraw this report'}</button>
      </div>
    </>
  );
}
