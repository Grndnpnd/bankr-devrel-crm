'use client';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Layers, Plus, Search, Upload, Users, Lock, Globe2, X, Bot } from 'lucide-react';
import ArtifactFrame from '@/components/artifacts/ArtifactFrame';

type Scope = 'all' | 'mine' | 'shared' | 'team';

interface Row {
  id: string;
  title: string;
  description: string | null;
  kind: string;
  tags: string[];
  currentVersion: number;
  sourceUrl: string | null;
  visibility: 'PRIVATE' | 'TEAM';
  updatedAt: string;
  owner: { id: string; name: string | null; email: string };
  level: 'view' | 'interact' | 'admin' | 'owner';
  relation: 'mine' | 'shared' | 'team';
}

const SCOPES: { id: Scope; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'mine', label: 'Mine' },
  { id: 'shared', label: 'Shared with me' },
  { id: 'team', label: 'Team' },
];

const muted = '#8A8A8A';
const faint = '#525252';
const ink = '#F0F0F0';
const accent = '#F5A623';
const panel = '#1A1A1A';
const line = 'rgba(255,255,255,0.07)';

function ago(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

/** A live, read-only miniature of the page: rendered at desktop width and scaled down. */
function Thumb({ id, title }: { id: string; title: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.25);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(el.clientWidth / 1280));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={box} style={{ position: 'relative', width: '100%', aspectRatio: '16 / 10', overflow: 'hidden', background: '#fff', borderBottom: `1px solid ${line}` }}>
      <div style={{ width: 1280, height: 800, transform: `scale(${scale})`, transformOrigin: '0 0', pointerEvents: 'none' }}>
        <ArtifactFrame artifactId={id} title={`${title} preview`} readOnly />
      </div>
    </div>
  );
}

export default function Artifacts() {
  const router = useRouter();
  const [scope, setScope] = useState<Scope>('all');
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [showNew, setShowNew] = useState(false);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ scope });
    if (q.trim()) params.set('q', q.trim());
    const res = await fetch(`/api/artifacts?${params}`);
    const data = await res.json().catch(() => ({}));
    setRows(data.artifacts ?? []);
  }, [scope, q]);

  useEffect(() => {
    const t = setTimeout(load, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Layers size={22} style={{ color: accent }} />
        <div style={{ flex: '1 1 280px' }}>
          <h1 style={{ fontFamily: "'Manrope', sans-serif", fontSize: 22, fontWeight: 700, color: ink }}>Artifacts</h1>
          <p style={{ fontSize: 13, color: muted, marginTop: 2 }}>
            Pages, dashboards and docs from Claude — versioned, shared, and live with their own data.
          </p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-2 rounded-lg"
          style={{ background: accent, color: '#0D0D0D', fontSize: 13, fontWeight: 600, padding: '9px 14px' }}
        >
          <Plus size={16} /> New artifact
        </button>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-lg" style={{ background: panel, padding: 2 }}>
          {SCOPES.map((s) => (
            <button
              key={s.id}
              onClick={() => setScope(s.id)}
              aria-pressed={scope === s.id}
              className="rounded-md"
              style={{
                padding: '7px 12px', fontSize: 13, fontWeight: 500,
                background: scope === s.id ? '#2A2A2A' : 'transparent',
                color: scope === s.id ? ink : faint,
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 rounded-lg" style={{ background: panel, border: `1px solid ${line}`, padding: '0 10px', flex: '1 1 220px', maxWidth: 360 }}>
          <Search size={15} style={{ color: faint }} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search titles, descriptions, tags"
            aria-label="Search artifacts"
            style={{ background: 'transparent', border: 0, outline: 'none', color: ink, fontSize: 13, padding: '8px 0', width: '100%' }}
          />
        </label>
      </div>

      {rows === null ? (
        <div style={{ color: faint, fontSize: 13, padding: 20 }}>Loading…</div>
      ) : rows.length === 0 ? (
        <EmptyState scope={scope} searching={!!q} onNew={() => setShowNew(true)} />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))', gap: 16 }}>
          {rows.map((r) => (
            <Link
              key={r.id}
              href={`/artifacts/${r.id}`}
              className="rounded-xl overflow-hidden flex flex-col"
              style={{ background: panel, border: `1px solid ${line}`, textDecoration: 'none' }}
            >
              <Thumb id={r.id} title={r.title} />
              <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div className="flex items-center gap-2">
                  <span style={{ fontSize: 14, fontWeight: 600, color: ink, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</span>
                  {r.visibility === 'TEAM'
                    ? <span title="Everyone on the team can view"><Globe2 size={14} style={{ color: faint }} /></span>
                    : r.relation === 'shared'
                      ? <span title={`Shared with you (${r.level === 'admin' ? 'edit' : r.level})`}><Users size={14} style={{ color: faint }} /></span>
                      : <span title="Private"><Lock size={14} style={{ color: faint }} /></span>}
                </div>
                <div style={{ fontSize: 12, color: faint }}>
                  {r.relation === 'mine' ? 'You' : (r.owner.name || r.owner.email)} · v{r.currentVersion} · {ago(r.updatedAt)}
                </div>
                {r.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {r.tags.slice(0, 4).map((t) => (
                      <span key={t} style={{ fontSize: 11, color: muted, background: '#222', borderRadius: 999, padding: '2px 8px' }}>{t}</span>
                    ))}
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}

      {showNew && (
        <NewArtifactDialog
          onClose={() => setShowNew(false)}
          onCreated={(id) => { setShowNew(false); router.push(`/artifacts/${id}`); }}
        />
      )}
    </div>
  );
}

function EmptyState({ scope, searching, onNew }: { scope: Scope; searching: boolean; onNew: () => void }) {
  const text = searching ? 'No artifacts match that search.'
    : scope === 'shared' ? 'Nothing has been shared with you yet.'
    : scope === 'team' ? 'No one has shared an artifact with the whole team yet.'
    : 'No artifacts yet.';
  return (
    <div className="rounded-xl" style={{ border: '1px dashed rgba(255,255,255,0.12)', padding: 40, textAlign: 'center' }}>
      <Layers size={28} style={{ color: '#3A3A3A', margin: '0 auto 10px' }} />
      <div style={{ fontSize: 14, color: muted }}>{text}</div>
      {!searching && scope !== 'shared' && scope !== 'team' && (
        <div style={{ fontSize: 12.5, color: faint, marginTop: 8, maxWidth: 520, marginInline: 'auto', lineHeight: 1.6 }}>
          Paste or upload an HTML page, or connect your Claude (Settings → Claude) and ask it to publish or import your artifacts here.
          <div style={{ marginTop: 12 }}>
            <button onClick={onNew} className="rounded-lg" style={{ background: '#222', color: ink, fontSize: 13, padding: '8px 14px', border: `1px solid ${line}` }}>
              New artifact
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function NewArtifactDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [title, setTitle] = useState('');
  const [html, setHtml] = useState('');
  const [tags, setTags] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  async function onFile(f: File | undefined) {
    if (!f) return;
    const text = await f.text();
    setHtml(text);
    if (!title) setTitle(f.name.replace(/\.html?$/i, ''));
  }

  async function create() {
    setBusy(true);
    const res = await fetch('/api/artifacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: title.trim() || undefined,
        html,
        tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
        sourceUrl: sourceUrl.trim() || undefined,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { toast.error(data.error ?? 'Could not create the artifact'); return; }
    toast.success('Artifact created');
    onCreated(data.id);
  }

  const field: React.CSSProperties = { background: '#0D0D0D', border: `1px solid ${line}`, borderRadius: 8, color: ink, fontSize: 13, padding: '8px 10px', width: '100%', outline: 'none' };
  const label: React.CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: faint, marginBottom: 6, display: 'block' };

  return (
    <div role="dialog" aria-modal="true" aria-label="New artifact" onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200, display: 'grid', placeItems: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} className="rounded-xl"
        style={{ background: panel, border: `1px solid ${line}`, width: 'min(640px, 100%)', maxHeight: '90vh', overflow: 'auto', padding: 20 }}>
        <div className="flex items-center" style={{ marginBottom: 16 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: ink, flex: 1 }}>New artifact</h2>
          <button onClick={onClose} aria-label="Close" style={{ color: faint }}><X size={18} /></button>
        </div>
        <div className="flex flex-col gap-4">
          <div>
            <span style={label}>HTML</span>
            <textarea value={html} onChange={(e) => setHtml(e.target.value)} placeholder="<!doctype html>…" rows={9}
              style={{ ...field, fontFamily: 'ui-monospace, monospace', fontSize: 12, resize: 'vertical' }} />
            <div className="flex items-center gap-2" style={{ marginTop: 8 }}>
              <button onClick={() => file.current?.click()} className="flex items-center gap-2 rounded-lg"
                style={{ background: '#222', color: ink, fontSize: 12.5, padding: '6px 10px', border: `1px solid ${line}` }}>
                <Upload size={14} /> Upload .html
              </button>
              <input ref={file} type="file" accept=".html,.htm,text/html" hidden onChange={(e) => onFile(e.target.files?.[0])} />
              <span style={{ fontSize: 12, color: faint }}>{html ? `${(new Blob([html]).size / 1024).toFixed(1)} KB` : ''}</span>
            </div>
          </div>
          <div>
            <span style={label}>Title</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Taken from the page's <title> if blank" style={field} />
          </div>
          <div>
            <span style={label}>Tags</span>
            <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="dashboard, pokemon" style={field} />
          </div>
          <div>
            <span style={label}>Source link</span>
            <input value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://claude.ai/artifact/…" style={field} />
          </div>
          <div className="flex items-start gap-2 rounded-lg" style={{ background: '#0D0D0D', border: `1px solid ${line}`, padding: 12, fontSize: 12.5, color: muted, lineHeight: 1.5 }}>
            <Bot size={16} style={{ color: accent, flexShrink: 0, marginTop: 1 }} />
            <span>Faster from Claude: connect it in Settings → Claude, then ask “publish this to the artifact hub” or “import my claude.ai artifacts”.</span>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="rounded-lg" style={{ color: muted, fontSize: 13, padding: '8px 14px' }}>Cancel</button>
            <button onClick={create} disabled={!html.trim() || busy} className="rounded-lg"
              style={{ background: accent, color: '#0D0D0D', fontSize: 13, fontWeight: 600, padding: '8px 14px', opacity: !html.trim() || busy ? 0.5 : 1 }}>
              {busy ? 'Creating…' : 'Create'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
