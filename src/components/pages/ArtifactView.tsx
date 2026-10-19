'use client';
import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, History, Share2, Pencil, Download, Trash2, Maximize2, Minimize2, ExternalLink, X } from 'lucide-react';
import ArtifactFrame from '@/components/artifacts/ArtifactFrame';

type Level = 'view' | 'interact' | 'admin' | 'owner';
interface Meta {
  id: string; title: string; description: string | null; kind: string; tags: string[];
  currentVersion: number; sourceUrl: string | null; visibility: 'PRIVATE' | 'TEAM';
  updatedAt: string; owner: { id: string; name: string | null; email: string } | null;
}
interface Version { version: number; note: string | null; createdAt: string; by: string | null }

const muted = '#8A8A8A', faint = '#525252', ink = '#F0F0F0', accent = '#F5A623', panel = '#1A1A1A', line = 'rgba(255,255,255,0.07)';
const LEVEL_LABEL: Record<Level, string> = { view: 'Can view', interact: 'Can use', admin: 'Can edit', owner: 'Owner' };

function IconButton({ onClick, label, children, active }: { onClick: () => void; label: string; children: React.ReactNode; active?: boolean }) {
  return (
    <button onClick={onClick} aria-label={label} title={label} className="flex items-center gap-1.5 rounded-lg"
      style={{ background: active ? '#2A2A2A' : '#222', color: active ? ink : muted, border: `1px solid ${line}`, fontSize: 12.5, padding: '6px 10px' }}>
      {children}
    </button>
  );
}

export default function ArtifactView({ id }: { id: string }) {
  const router = useRouter();
  const [meta, setMeta] = useState<Meta | null>(null);
  const [level, setLevel] = useState<Level>('view');
  const [missing, setMissing] = useState(false);
  const [version, setVersion] = useState<number | undefined>();
  const [reloadKey, setReloadKey] = useState(0);
  const [panelOpen, setPanelOpen] = useState<'versions' | 'share' | 'edit' | null>(null);
  const [full, setFull] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/artifacts/${id}`);
    if (!res.ok) { setMissing(true); return; }
    const data = await res.json();
    setMeta(data.artifact); setLevel(data.level);
  }, [id]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFull(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [full]);

  if (missing) {
    return (
      <div style={{ color: muted, fontSize: 14, padding: 20 }}>
        This artifact doesn’t exist or hasn’t been shared with you. <Link href="/artifacts" style={{ color: accent }}>Back to artifacts</Link>
      </div>
    );
  }
  if (!meta) return <div style={{ color: faint, fontSize: 13, padding: 20 }}>Loading…</div>;

  const canEdit = level === 'admin' || level === 'owner';
  const viewingOld = version !== undefined && version !== meta.currentVersion;

  async function downloadHtml() {
    const res = await fetch(`/api/artifacts/${id}?html=1`);
    const data = await res.json();
    const blob = new Blob([data.artifact.html], { type: 'text/html' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${meta!.title.replace(/[^\w\- ]+/g, '').trim() || 'artifact'}.html`;
    a.click();
  }

  async function remove() {
    if (!window.confirm(`Delete "${meta!.title}" and all its versions and data? This can't be undone.`)) return;
    const res = await fetch(`/api/artifacts/${id}`, { method: 'DELETE' });
    if (res.ok) { toast.success('Deleted'); router.push('/artifacts'); } else toast.error('Could not delete');
  }

  const frame = (
    <ArtifactFrame
      artifactId={id}
      version={viewingOld ? version : undefined}
      reloadKey={reloadKey}
      title={meta.title}
      onPublished={() => { load(); toast.success('Saved a new version'); }}
    />
  );

  if (full) {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: '#fff' }}>
        {frame}
        <button onClick={() => setFull(false)} aria-label="Exit full screen"
          style={{ position: 'fixed', top: 10, right: 10, zIndex: 301, background: 'rgba(13,13,13,0.75)', color: ink, borderRadius: 8, padding: 6 }}>
          <Minimize2 size={16} />
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 96px)', minHeight: 480 }}>
      <div className="flex flex-wrap items-center gap-2" style={{ marginBottom: 12 }}>
        <Link href="/artifacts" aria-label="Back to artifacts" style={{ color: faint, display: 'flex' }}><ArrowLeft size={18} /></Link>
        <div style={{ flex: '1 1 240px', minWidth: 0 }}>
          <h1 style={{ fontFamily: "'Manrope', sans-serif", fontSize: 18, fontWeight: 700, color: ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{meta.title}</h1>
          <div style={{ fontSize: 12, color: faint }}>
            {meta.owner?.name || meta.owner?.email} · v{meta.currentVersion} · {LEVEL_LABEL[level]}
            {meta.visibility === 'TEAM' ? ' · Team can view' : ''}
            {meta.sourceUrl && (
              <> · <a href={meta.sourceUrl} target="_blank" rel="noreferrer" style={{ color: muted }}>source <ExternalLink size={11} style={{ display: 'inline' }} /></a></>
            )}
          </div>
        </div>
        <IconButton onClick={() => setPanelOpen(panelOpen === 'versions' ? null : 'versions')} label="Versions" active={panelOpen === 'versions'}><History size={14} /> Versions</IconButton>
        {canEdit && <IconButton onClick={() => setPanelOpen(panelOpen === 'share' ? null : 'share')} label="Share" active={panelOpen === 'share'}><Share2 size={14} /> Share</IconButton>}
        {canEdit && <IconButton onClick={() => setPanelOpen(panelOpen === 'edit' ? null : 'edit')} label="Edit details" active={panelOpen === 'edit'}><Pencil size={14} /></IconButton>}
        <IconButton onClick={downloadHtml} label="Download HTML"><Download size={14} /></IconButton>
        <IconButton onClick={() => setFull(true)} label="Full screen"><Maximize2 size={14} /></IconButton>
        {level === 'owner' && <IconButton onClick={remove} label="Delete"><Trash2 size={14} /></IconButton>}
      </div>

      {viewingOld && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg" style={{ background: '#2A2210', border: '1px solid rgba(245,166,35,0.3)', color: accent, fontSize: 12.5, padding: '8px 12px', marginBottom: 10 }}>
          <span style={{ flex: 1 }}>Viewing version {version}. Its data is the live data, not a copy from then.</span>
          {canEdit && (
            <button onClick={async () => {
              const res = await fetch(`/api/artifacts/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ restoreVersion: version }) });
              if (res.ok) { toast.success(`Restored version ${version}`); setVersion(undefined); load(); setReloadKey((k) => k + 1); }
              else toast.error('Could not restore');
            }} style={{ fontWeight: 600 }}>Restore this version</button>
          )}
          <button onClick={() => setVersion(undefined)} style={{ color: muted }}>Back to latest</button>
        </div>
      )}

      <div className="flex gap-3" style={{ flex: 1, minHeight: 0 }}>
        <div className="rounded-xl overflow-hidden" style={{ flex: 1, minWidth: 0, border: `1px solid ${line}` }}>{frame}</div>
        {panelOpen && (
          <aside className="rounded-xl" style={{ width: 'min(340px, 100%)', flexShrink: 0, background: panel, border: `1px solid ${line}`, padding: 16, overflow: 'auto' }}>
            <div className="flex items-center" style={{ marginBottom: 12 }}>
              <h2 style={{ fontSize: 14, fontWeight: 700, color: ink, flex: 1 }}>
                {panelOpen === 'versions' ? 'Versions' : panelOpen === 'share' ? 'Share' : 'Details'}
              </h2>
              <button onClick={() => setPanelOpen(null)} aria-label="Close panel" style={{ color: faint }}><X size={16} /></button>
            </div>
            {panelOpen === 'versions' && <VersionsPanel id={id} current={meta.currentVersion} selected={version ?? meta.currentVersion} onSelect={(v) => setVersion(v === meta.currentVersion ? undefined : v)} />}
            {panelOpen === 'share' && <SharePanel id={id} isOwner={level === 'owner'} onSaved={load} />}
            {panelOpen === 'edit' && <EditPanel meta={meta} onSaved={() => { load(); setPanelOpen(null); }} />}
          </aside>
        )}
      </div>
    </div>
  );
}

function VersionsPanel({ id, current, selected, onSelect }: { id: string; current: number; selected: number; onSelect: (v: number) => void }) {
  const [versions, setVersions] = useState<Version[] | null>(null);
  useEffect(() => { fetch(`/api/artifacts/${id}/versions`).then((r) => r.json()).then((d) => setVersions(d.versions ?? [])); }, [id, current]);
  if (!versions) return <div style={{ color: faint, fontSize: 13 }}>Loading…</div>;
  return (
    <div className="flex flex-col gap-1" style={{ maxHeight: '60vh', overflow: 'auto' }}>
      {versions.map((v) => (
        <button key={v.version} onClick={() => onSelect(v.version)} className="rounded-lg text-left"
          style={{ background: v.version === selected ? '#2A2A2A' : 'transparent', border: `1px solid ${v.version === selected ? 'rgba(245,166,35,0.35)' : 'transparent'}`, padding: '8px 10px' }}>
          <div style={{ fontSize: 13, color: ink, fontWeight: 600 }}>v{v.version}{v.version === current ? ' · current' : ''}</div>
          <div style={{ fontSize: 12, color: faint }}>{new Date(v.createdAt).toLocaleString()}{v.by ? ` · ${v.by}` : ''}</div>
          {v.note && <div style={{ fontSize: 12, color: muted, marginTop: 2 }}>{v.note}</div>}
        </button>
      ))}
    </div>
  );
}

interface Person { id: string; name: string | null; email: string }
type ShareLevel = 'VIEW' | 'INTERACT' | 'EDIT';

function SharePanel({ id, isOwner, onSaved }: { id: string; isOwner: boolean; onSaved: () => void }) {
  const [data, setData] = useState<{ visibility: 'PRIVATE' | 'TEAM'; ownerId: string; people: Person[] } | null>(null);
  const [shares, setShares] = useState<Record<string, ShareLevel>>({});
  const [visibility, setVisibility] = useState<'PRIVATE' | 'TEAM'>('PRIVATE');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`/api/artifacts/${id}/shares`).then((r) => r.json()).then((d) => {
      setData(d); setVisibility(d.visibility);
      setShares(Object.fromEntries((d.shares ?? []).map((s: any) => [s.userId, s.level])));
    });
  }, [id]);
  if (!data) return <div style={{ color: faint, fontSize: 13 }}>Loading…</div>;

  async function save() {
    setBusy(true);
    const res = await fetch(`/api/artifacts/${id}/shares`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shares: Object.entries(shares).map(([userId, level]) => ({ userId, level })), ...(isOwner ? { visibility } : {}) }),
    });
    setBusy(false);
    const out = await res.json().catch(() => ({}));
    if (res.ok) { toast.success('Sharing updated'); onSaved(); } else toast.error(out.error ?? 'Could not update sharing');
  }

  const select: React.CSSProperties = { background: '#0D0D0D', border: `1px solid ${line}`, borderRadius: 6, color: ink, fontSize: 12, padding: '4px 6px' };
  const others = data.people.filter((p) => p.id !== data.ownerId);
  return (
    <div className="flex flex-col gap-3">
      {isOwner && (
        <label className="flex items-center gap-2" style={{ fontSize: 13, color: muted }}>
          <input type="checkbox" checked={visibility === 'TEAM'} onChange={(e) => setVisibility(e.target.checked ? 'TEAM' : 'PRIVATE')} />
          Everyone on the team can view
        </label>
      )}
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: faint }}>People</div>
      <div className="flex flex-col gap-1" style={{ maxHeight: '45vh', overflow: 'auto' }}>
        {others.length === 0 && <div style={{ fontSize: 12.5, color: faint }}>No other users yet.</div>}
        {others.map((p) => (
          <div key={p.id} className="flex items-center gap-2" style={{ padding: '4px 0' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, color: ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name || p.email}</div>
              {p.name && <div style={{ fontSize: 11.5, color: faint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.email}</div>}
            </div>
            <select aria-label={`Access for ${p.name || p.email}`} value={shares[p.id] ?? ''} style={select}
              onChange={(e) => setShares((s) => { const n = { ...s }; if (e.target.value) n[p.id] = e.target.value as ShareLevel; else delete n[p.id]; return n; })}>
              <option value="">No access</option>
              <option value="VIEW">Can view</option>
              <option value="INTERACT">Can use</option>
              {(isOwner || shares[p.id] === 'EDIT') && <option value="EDIT">Can edit</option>}
            </select>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 12, color: faint, lineHeight: 1.5 }}>“Can use” lets someone change the page’s shared data (votes, checklists). “Can edit” also lets them save new versions.</div>
      <button onClick={save} disabled={busy} className="rounded-lg" style={{ background: accent, color: '#0D0D0D', fontSize: 13, fontWeight: 600, padding: '8px 14px', opacity: busy ? 0.5 : 1 }}>
        {busy ? 'Saving…' : 'Save'}
      </button>
    </div>
  );
}

function EditPanel({ meta, onSaved }: { meta: Meta; onSaved: () => void }) {
  const [title, setTitle] = useState(meta.title);
  const [description, setDescription] = useState(meta.description ?? '');
  const [tags, setTags] = useState(meta.tags.join(', '));
  const [kind, setKind] = useState(meta.kind);
  const [html, setHtml] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    const res = await fetch(`/api/artifacts/${meta.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, description: description || null, kind, tags: tags.split(',').map((t) => t.trim()).filter(Boolean), ...(html !== null ? { html, note: 'Edited HTML' } : {}) }),
    });
    setBusy(false);
    const out = await res.json().catch(() => ({}));
    if (res.ok) { toast.success('Saved'); onSaved(); } else toast.error(out.error ?? 'Could not save');
  }

  const field: React.CSSProperties = { background: '#0D0D0D', border: `1px solid ${line}`, borderRadius: 8, color: ink, fontSize: 13, padding: '7px 9px', width: '100%', outline: 'none' };
  const label: React.CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: faint, marginBottom: 5, display: 'block' };
  return (
    <div className="flex flex-col gap-3">
      <div><span style={label}>Title</span><input value={title} onChange={(e) => setTitle(e.target.value)} style={field} /></div>
      <div><span style={label}>Description</span><textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} style={{ ...field, resize: 'vertical' }} /></div>
      <div><span style={label}>Tags</span><input value={tags} onChange={(e) => setTags(e.target.value)} style={field} /></div>
      <div>
        <span style={label}>Kind</span>
        <select value={kind} onChange={(e) => setKind(e.target.value)} style={field}>
          {['page', 'dashboard', 'doc', 'deck', 'tool'].map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
      </div>
      <div>
        <span style={label}>HTML</span>
        {html === null ? (
          <button onClick={async () => { const r = await fetch(`/api/artifacts/${meta.id}?html=1`); const d = await r.json(); setHtml(d.artifact.html); }}
            className="rounded-lg" style={{ background: '#222', color: muted, fontSize: 12.5, padding: '6px 10px', border: `1px solid ${line}` }}>
            Edit HTML (saves as a new version)
          </button>
        ) : (
          <textarea value={html} onChange={(e) => setHtml(e.target.value)} rows={12} style={{ ...field, fontFamily: 'ui-monospace, monospace', fontSize: 11.5, resize: 'vertical' }} />
        )}
      </div>
      <button onClick={save} disabled={busy} className="rounded-lg" style={{ background: accent, color: '#0D0D0D', fontSize: 13, fontWeight: 600, padding: '8px 14px', opacity: busy ? 0.5 : 1 }}>
        {busy ? 'Saving…' : 'Save'}
      </button>
    </div>
  );
}
