'use client';
/** Pieces shared by the public tester pages: who runs the beta, the data note, dates, chat, uploads. */
import React, { useEffect, useLayoutEffect, useState } from 'react';

export interface About {
  name: string; product: string | null; description: string | null; welcome: string | null;
  runBy: string | null; contactEmail: string | null; privacyUrl: string | null; plain: boolean;
}

/**
 * Keep what someone typed before the page's script loaded (a slow phone shows the server-rendered form
 * seconds before it becomes interactive). TesterShell records input events on fields marked
 * data-keep="<key>" until hydration; each form adopts the values under its own key prefix on mount.
 */
export const KEEP_TYPED_SCRIPT = `(function(){if(window.__btKeep)return;window.__btKeep=1;var t=window.__betaTyped=window.__betaTyped||{};document.addEventListener('input',function(e){if(window.__betaHydrated)return;var el=e.target;if(!el||!el.getAttribute)return;var k=el.getAttribute('data-keep');if(k)t[k]=el.value;},true);})();`;
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;
export function useKeepTyped(prefix: string, adopt: (key: string, value: string) => void) {
  useIsoLayoutEffect(() => {
    const w = window as any;
    const typed: Record<string, string> = w.__betaTyped || {};
    // Values the early recorder caught, and anything still in the DOM (if React didn't reset it).
    document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(`[data-keep^="${prefix}"]`).forEach((el) => {
      const k = el.getAttribute('data-keep')!;
      if (el.value && !typed[k]) typed[k] = el.value;
    });
    for (const k of Object.keys(typed)) {
      if (!k.startsWith(prefix)) continue;
      if (typed[k]) adopt(k.slice(prefix.length), typed[k]);
      delete typed[k];
    }
    // Every form adopts in this same commit; after that, normal React handlers own the fields.
    setTimeout(() => { w.__betaHydrated = true; }, 0);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}

/** False on the server and during the first render, true once the page's script is running. */
export function useHydrated() {
  const [on, setOn] = useState(false);
  useEffect(() => { setOn(true); }, []);
  return on;
}

// Dates are written in English (the page's language) in the viewer's own time zone. They are filled in
// only in the browser: the server doesn't know the viewer's zone, and a different text there would
// make React throw away the page (hydration mismatch).
const DATE_FMT: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' };
export const formatWhen = (iso: string | Date) => new Intl.DateTimeFormat('en', DATE_FMT).format(new Date(iso));

export function When({ iso }: { iso: string | Date | null | undefined }) {
  const [text, setText] = useState('');
  useEffect(() => { setText(iso ? formatWhen(iso) : ''); }, [iso]);
  if (!iso) return null;
  return <time dateTime={new Date(iso).toISOString()}>{text}</time>;
}

/** Invisible characters (zero-width spaces, text-direction marks) don't count as text. */
export const visible = (s: string) => s.replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/g, '').trim();

/** What happens to the tester's data, in plain words (matches what the app actually does). */
export function DataNote({ about }: { about: About }) {
  const who = about.runBy ? `The ${about.runBy} team` : 'The team running this beta';
  return (
    <p className="faint" style={{ margin: 0 }}>
      {who} sees your name, email, the details you send and your files. They use them only to follow up on your reports.
      {about.plain ? ' Replies are also emailed to you through Plain (plain.com), the support tool the team uses.' : ''} You can leave the beta and delete your data from your beta page at any time.
    </p>
  );
}

/** "Questions? Email …" — or a fallback, so a page is never a dead end. */
export function ContactLine({ email }: { email: string | null | undefined }) {
  return email
    ? <span>Questions? Email <a className="mail" href={`mailto:${email}`}>{email}</a></span>
    : <span>Questions? Ask the team that invited you.</span>;
}

export interface FooterInfo { runBy?: string | null; contactEmail?: string | null; privacyUrl?: string | null }

/** Footer for every tester page (error and status pages too): who runs this, how to reach them, privacy. */
export function AboutFooter({ about }: { about: FooterInfo }) {
  return (
    <footer className="foot">
      {about.runBy && <span>Run by <bdi>{about.runBy}</bdi></span>}
      <ContactLine email={about.contactEmail} />
      {about.privacyUrl && <a href={about.privacyUrl} target="_blank" rel="noreferrer">Privacy policy</a>}
    </footer>
  );
}

// ───────── chat (Plain), loaded only when the tester asks for it ─────────

export interface Chat {
  appId: string; title: string;
  // Signed when the tester's email is verified; otherwise Plain asks for it and checks it with a code.
  customerDetails?: { email: string; fullName: string; shortName: string };
  customerDetailsSignature?: string;
  requireAuthentication?: boolean;
  threadDetails?: { labelTypeIds: string[] };
}

let chatReady: Promise<void> | null = null; // one load + init per page, however many clicks

function loadChat(chat: Chat): Promise<void> {
  if (chatReady) return chatReady;
  chatReady = new Promise<void>((resolve, reject) => {
    const w = window as any;
    const init = () => {
      try {
        if (!w.Plain) throw new Error('chat script missing');
        w.Plain.init({
          appId: chat.appId,
          ...(chat.customerDetails ? { customerDetails: chat.customerDetails, customerDetailsSignature: chat.customerDetailsSignature } : { requireAuthentication: true }),
          ...(chat.threadDetails ? { threadDetails: chat.threadDetails } : {}),
          theme: 'auto',
          style: { brandColor: { light: '#c4620d', dark: '#f0913f' }, launcherBackgroundColor: { light: '#c4620d', dark: '#f0913f' }, launcherIconColor: '#ffffff' },
          links: [],
        });
        resolve();
      } catch (e) { reject(e); }
    };
    if (w.Plain) { init(); return; }
    const s = document.createElement('script');
    s.async = true; s.src = 'https://chat.cdn-plain.com/index.js';
    s.onload = init; s.onerror = () => reject(new Error('chat script failed to load'));
    document.head.appendChild(s);
  });
  chatReady.catch(() => { chatReady = null; });
  return chatReady;
}

/** Once chat failed, the page keeps saying so for the rest of the visit (not a button that fails again). */
const chatOffKey = (slug: string) => `beta-chat-off:${slug}`;
const chatIsOff = (slug: string) => { try { return sessionStorage.getItem(chatOffKey(slug)) === '1'; } catch { return false; } };
const markChatOff = (slug: string) => { try { sessionStorage.setItem(chatOffKey(slug), '1'); } catch {} };

/** "Chat with the team": loads Plain on click; if chat can't open, says so and offers the alternatives. */
export function ChatButton({ slug, chat, contactEmail }: { slug: string; chat: Chat; contactEmail: string | null }) {
  const hydrated = useHydrated();
  const [state, setState] = useState<'idle' | 'opening' | 'failed'>('idle');
  useEffect(() => { if (chatIsOff(slug)) setState('failed'); }, [slug]);
  async function open() {
    setState('opening');
    // Plain reports a bad setup (e.g. an invalid app id) only in the console, so watch for it.
    const origError = console.error;
    let broken = false;
    console.error = (...args: unknown[]) => { if (args.some((a) => /plain|chat app/i.test(String(a)))) broken = true; origError(...args); };
    try {
      await Promise.race([loadChat(chat), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000))]);
      const w = window as any;
      w.Plain.open();
      await new Promise((r) => setTimeout(r, 1500));
      if (broken) throw new Error('chat did not open');
      setState('idle');
    } catch {
      markChatOff(slug);
      setState('failed');
    } finally {
      console.error = origError;
    }
  }
  if (state === 'failed') {
    return (
      <div className="note" role="status" style={{ flexBasis: '100%' }}>
        Chat isn’t available right now. Add a note to one of your reports{contactEmail ? <>, or email <a className="mail" href={`mailto:${contactEmail}`}>{contactEmail}</a></> : ''}.
      </div>
    );
  }
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 2 }}>
      <button className="btn" type="button" onClick={open} disabled={!hydrated || state === 'opening'}>
        {!hydrated ? 'Chat (loading…)' : state === 'opening' ? 'Opening chat…' : 'Chat with the team'}
      </button>
      <span className="faint" style={{ fontSize: 11.5 }}>Chat is run by Plain (plain.com), the support tool the team uses.</span>
    </span>
  );
}

// ───────── files ─────────

export const MAX_FILES = 5, MAX_BYTES = 10 * 1024 * 1024;
export const FILE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime', 'application/pdf', 'text/plain'];
const TYPE_NAME: Record<string, string> = {
  'image/png': 'PNG', 'image/jpeg': 'JPEG', 'image/gif': 'GIF', 'image/webp': 'WebP', 'video/mp4': 'MP4', 'video/webm': 'WebM',
  'video/quicktime': 'MOV', 'application/pdf': 'PDF', 'text/plain': 'text',
};
/** Why a file can't be attached (a full sentence), or null. */
export const fileProblem = (f: File) =>
  f.size === 0 ? `${f.name} is empty.` : f.size > MAX_BYTES ? `${f.name} is over 10 MB.` : !FILE_TYPES.includes(f.type) ? `${f.name} isn’t an image, video, PDF or text file.` : null;
export const mb = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

/** Does the file's content match its type? Checked when it's picked, so a renamed file is caught before sending. */
export async function contentProblem(f: File): Promise<string | null> {
  try {
    const b = new Uint8Array(await f.slice(0, 4096).arrayBuffer());
    const at = (off: number, ...bytes: number[]) => bytes.every((x, i) => b[off + i] === x);
    const ascii = (off: number, s: string) => at(off, ...[...s].map((c) => c.charCodeAt(0)));
    const ok = (() => {
      switch (f.type) {
        case 'image/png': return at(0, 0x89, 0x50, 0x4e, 0x47);
        case 'image/jpeg': return at(0, 0xff, 0xd8, 0xff);
        case 'image/gif': return ascii(0, 'GIF8');
        case 'image/webp': return ascii(0, 'RIFF') && ascii(8, 'WEBP');
        case 'application/pdf': return ascii(0, '%PDF');
        case 'video/mp4': case 'video/quicktime': return ['ftyp', 'moov', 'wide', 'mdat', 'free', 'skip'].some((x) => ascii(4, x));
        case 'video/webm': return at(0, 0x1a, 0x45, 0xdf, 0xa3);
        case 'text/plain': return !b.includes(0);
        default: return false;
      }
    })();
    return ok ? null : `${f.name} isn’t really a ${TYPE_NAME[f.type] ?? 'supported'} file. It may be renamed or damaged.`;
  } catch {
    return null; // can't read it here; the server checks again
  }
}

/** Split picked files into ones to keep and sentences about the rest. */
export async function checkFiles(chosen: File[], room: number) {
  const problems: string[] = [];
  const keep: File[] = [];
  for (const f of chosen) {
    const p = fileProblem(f) ?? (await contentProblem(f));
    if (p) problems.push(p); else keep.push(f);
  }
  if (keep.length > room) problems.push(`A report holds up to ${MAX_FILES} files, so only the first ${room} were kept.`);
  return { keep: keep.slice(0, Math.max(0, room)), problems };
}

/** Big photos are shrunk in the browser before upload (a phone on a slow line sends far less). */
export async function shrinkImage(f: File): Promise<File> {
  if (!/^image\/(png|jpeg|webp)$/.test(f.type) || f.size <= 1.5 * 1024 * 1024) return f;
  try {
    const bmp = await createImageBitmap(f);
    const scale = Math.min(1, 2400 / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    if (!ctx) return f;
    ctx.drawImage(bmp, 0, 0, w, h);
    const blob: Blob | null = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.85));
    if (!blob || blob.size >= f.size) return f;
    return new File([blob], f.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    return f;
  }
}

const sentence = (s: string) => (/[.!?]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`);

/** Upload one file with progress (fetch can't report upload progress). Resolves to an error sentence or null. */
export function uploadOne(slug: string, reportId: string, file: File, onProgress: (fraction: number) => void): Promise<{ error: string; gone?: boolean } | null> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/tester/reports/${reportId}/attachments?slug=${encodeURIComponent(slug)}`);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) { onProgress(1); resolve(null); return; }
      let msg = 'The upload failed', gone = false;
      try { const d = JSON.parse(xhr.responseText); msg = d.error ?? msg; gone = !!d.gone; } catch {}
      resolve({ error: msg, gone });
    };
    xhr.onerror = () => resolve({ error: 'The connection dropped' });
    const fd = new FormData();
    fd.append('file', file);
    xhr.send(fd);
  });
}

export interface UploadState { index: number; total: number; fraction: number }

/** Shrink and upload files one by one, reporting progress; returns sentences about the failures. */
export async function uploadFiles(slug: string, reportId: string, files: File[], onState: (s: UploadState | null) => void) {
  const failed: string[] = [];
  let gone = false;
  for (let i = 0; i < files.length && !gone; i++) {
    onState({ index: i, total: files.length, fraction: 0 });
    const file = await shrinkImage(files[i]);
    const r = await uploadOne(slug, reportId, file, (fraction) => onState({ index: i, total: files.length, fraction }));
    if (r) {
      gone = !!r.gone;
      failed.push(r.error.includes(files[i].name) ? sentence(r.error) : `${files[i].name}: ${sentence(r.error)}`);
    }
  }
  onState(null);
  return { failed, gone };
}

export function UploadProgress({ s }: { s: UploadState }) {
  const pct = Math.round(s.fraction * 100);
  return (
    <div role="status" aria-live="polite" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span className="faint">Uploading {s.index + 1} of {s.total} — {pct}%</span>
      <div className="progress"><span style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

// ───────── drafts ─────────

/** A New-report draft belongs to one tester on one beta; never shown to anyone else on this browser. */
export const draftKey = (slug: string, who: string) => `beta-draft:${slug}:${who.toLowerCase()}`;
/** Forget every draft for this beta on this browser (sign out, leave, sent). */
export function clearDrafts(slug: string) {
  try {
    const prefix = `beta-draft:${slug}`;
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && (k === prefix || k.startsWith(`${prefix}:`))) localStorage.removeItem(k);
    }
  } catch {}
}
