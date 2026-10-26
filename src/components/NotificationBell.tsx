'use client';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Bell, CheckCheck } from 'lucide-react';

interface Item { id: string; kind: string; title: string; body: string | null; url: string | null; readAt: string | null; createdAt: string }

function ago(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

/**
 * The bell: unread count, the latest 30, live over /api/notifications/stream. Each new one
 * also fires a `hub:notification` window event so open pages (the task board) refresh.
 */
export default function NotificationBell() {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/notifications?limit=30');
    if (!res.ok) return;
    const d = await res.json();
    setItems(d.items); setUnread(d.unread);
  }, []);

  useEffect(() => {
    load();
    // Register the service worker that shows push notifications (the app is installable too).
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
    const es = new EventSource('/api/notifications/stream');
    es.addEventListener('notification', (e) => {
      const n: Item = JSON.parse((e as MessageEvent).data);
      setItems((xs) => (xs.some((x) => x.id === n.id) ? xs : [n, ...xs].slice(0, 30)));
      setUnread((u) => u + 1);
      window.dispatchEvent(new CustomEvent('hub:notification', { detail: n }));
      toast(n.title, { description: n.body ?? undefined, action: n.url ? { label: 'Open', onClick: () => router.push(n.url!) } : undefined });
    });
    return () => es.close();
  }, [load, router]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey); };
  }, [open]);

  async function markRead(body: object) {
    await fetch('/api/notifications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  }

  async function openItem(n: Item) {
    setOpen(false);
    if (!n.readAt) {
      setItems((xs) => xs.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)));
      setUnread((u) => Math.max(0, u - 1));
      markRead({ ids: [n.id] });
    }
    if (n.url) router.push(n.url);
  }

  async function readAll() {
    setItems((xs) => xs.map((x) => ({ ...x, readAt: x.readAt ?? new Date().toISOString() })));
    setUnread(0);
    await markRead({ all: true });
  }

  return (
    <div ref={box} style={{ position: 'relative' }}>
      <button onClick={() => setOpen((o) => !o)} aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`} aria-expanded={open}
        className="relative flex items-center justify-center rounded-md" style={{ width: 32, height: 32, color: unread ? '#F0F0F0' : '#8A8A8A' }}>
        <Bell size={17} />
        {unread > 0 && (
          <span style={{ position: 'absolute', top: 2, right: 1, minWidth: 16, height: 16, padding: '0 4px', borderRadius: 8, background: '#F5A623', color: '#0D0D0D', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div role="menu" style={{ position: 'absolute', right: 0, top: 38, width: 'min(360px, 92vw)', background: '#1A1A1A', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, boxShadow: '0 12px 32px rgba(0,0,0,0.5)', zIndex: 150 }}>
          <div className="flex items-center" style={{ padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#F0F0F0', flex: 1 }}>Notifications</span>
            {unread > 0 && (
              <button onClick={readAll} className="inline-flex items-center gap-1" style={{ fontSize: 12, color: '#8A8A8A' }}>
                <CheckCheck size={14} /> Mark all read
              </button>
            )}
          </div>
          <div style={{ maxHeight: 420, overflowY: 'auto' }}>
            {items.length === 0 && <div style={{ padding: 20, fontSize: 13, color: '#525252', textAlign: 'center' }}>Nothing yet. Task and team updates show up here.</div>}
            {items.map((n) => (
              <button key={n.id} role="menuitem" onClick={() => openItem(n)} className="w-full text-left flex gap-2.5"
                style={{ padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.04)', background: n.readAt ? 'transparent' : 'rgba(245,166,35,0.05)' }}>
                <span style={{ width: 7, height: 7, borderRadius: 4, marginTop: 6, flexShrink: 0, background: n.readAt ? 'transparent' : '#F5A623' }} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 13, color: '#F0F0F0', lineHeight: 1.35 }}>{n.title}</span>
                  {n.body && <span style={{ display: 'block', fontSize: 12, color: '#8A8A8A', marginTop: 2 }}>{n.body}</span>}
                </span>
                <span style={{ fontSize: 11, color: '#525252', flexShrink: 0 }}>{ago(n.createdAt)}</span>
              </button>
            ))}
          </div>
          <div style={{ padding: '8px 12px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <button onClick={() => { setOpen(false); router.push('/settings?tab=notifications'); }} style={{ fontSize: 12, color: '#8A8A8A' }}>
              Notification settings and phone alerts
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
