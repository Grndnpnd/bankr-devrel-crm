'use client';
import React, { useEffect, useRef, useState } from 'react';

const READ_OPS = new Set(['init', 'db.get', 'db.query', 'user.profiles', 'user.search']);

interface Props {
  artifactId: string;
  /** Render an older version; the data store stays live. */
  version?: number;
  /** Bumping this reloads the page (after a new version is saved elsewhere). */
  reloadKey?: number;
  /** Called after the page saves itself as a new version. */
  onPublished?: (version: number) => void;
  className?: string;
  style?: React.CSSProperties;
  title?: string;
  /** Thumbnails: reads are relayed, writes, saves and model calls are refused. */
  readOnly?: boolean;
}

/**
 * Renders an artifact in an iframe sandboxed by its CSP header (opaque origin, no cookies) and relays its
 * window.claude calls to /api/artifacts/:id/bridge with the viewer's session. Only
 * messages from this frame's own window are answered, and every call is scoped to
 * this artifact by the URL — the page cannot name another one.
 */
export default function ArtifactFrame({ artifactId, version, reloadKey = 0, onPublished, className, style, title, readOnly }: Props) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [selfReload, setSelfReload] = useState(0);

  useEffect(() => {
    async function onMessage(e: MessageEvent) {
      const frame = ref.current?.contentWindow;
      if (!frame || e.source !== frame) return;
      const d = e.data;
      if (!d || d.__hub !== 1 || typeof d.id !== 'number' || typeof d.op !== 'string') return;
      const reply = (msg: object) => frame.postMessage({ __hub: 1, id: d.id, ...msg }, '*');
      if (readOnly && !READ_OPS.has(d.op)) {
        return reply({ ok: false, error: { code: 'not_granted', message: 'open the artifact to use this' } });
      }

      if (d.op === 'downloads.save') {
        const name = String(d.args?.filename || 'download').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 120);
        if (/\.(exe|bat|cmd|com|msi|ps1|scr|js|vbs|jar|sh)$/i.test(name)) {
          return reply({ ok: false, error: { code: 'rejected_extension', message: 'that file type is not allowed' } });
        }
        if (!window.confirm(`This page wants to save "${name}". Download it?`)) {
          return reply({ ok: false, error: { code: 'declined', message: 'the viewer declined' } });
        }
        const blob = d.args?.base64 !== undefined
          ? new Blob([Uint8Array.from(atob(d.args.base64), (c) => c.charCodeAt(0))], { type: d.args.type || 'application/octet-stream' })
          : new Blob([String(d.args?.text ?? '')], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = name; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        return reply({ ok: true, result: { status: 'saved' } });
      }

      try {
        const res = await fetch(`/api/artifacts/${artifactId}/bridge`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ op: d.op, args: d.args ?? {} }),
        });
        const out = await res.json().catch(() => ({ ok: false, error: { code: 'unavailable', message: 'bad response' } }));
        reply(out);
        if (d.op === 'artifact.publish' && out.ok) {
          onPublished?.(Number(out.result?.version));
          setSelfReload((n) => n + 1);
        }
      } catch {
        reply({ ok: false, error: { code: 'unavailable', message: 'network error' } });
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [artifactId, readOnly, onPublished]);

  const src = `/api/artifacts/${artifactId}/render${version ? `?v=${version}` : ''}`;
  return (
    <iframe
      ref={ref}
      key={`${src}#${reloadKey}#${selfReload}`}
      src={src}
      title={title ?? 'Artifact'}
      // No sandbox attribute: the render route sends `Content-Security-Policy: sandbox …`,
      // which gives the page the same opaque origin and is enforced on the response itself.
      // (Some embedded browsers refuse to load attribute-sandboxed frames at all.)
      loading="lazy"
      referrerPolicy="no-referrer"
      className={className}
      style={{ border: 0, width: '100%', height: '100%', background: '#fff', ...style }}
    />
  );
}
