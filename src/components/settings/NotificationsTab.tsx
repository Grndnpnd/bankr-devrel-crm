'use client';
import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { BellRing, Smartphone } from 'lucide-react';
import DataCard from '@/components/DataCard';

interface Kind { kind: string; label: string; push: boolean }
type DeviceState = 'unsupported' | 'ios-needs-install' | 'blocked' | 'off' | 'on' | 'server-off';

const btn = (primary: boolean): React.CSSProperties => ({
  height: 36, padding: '0 14px', borderRadius: 6, fontSize: 13, fontWeight: 600, border: 'none',
  background: primary ? '#F5A623' : '#222', color: primary ? '#0D0D0D' : '#F0F0F0',
});

function urlB64(key: string) {
  const pad = '='.repeat((4 - (key.length % 4)) % 4);
  const raw = atob((key + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true;

export default function NotificationsTab() {
  const [kinds, setKinds] = useState<Kind[]>([]);
  const [state, setState] = useState<DeviceState>('off');
  const [devices, setDevices] = useState(0);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const [p, k] = await Promise.all([fetch('/api/push').then((r) => r.json()), fetch('/api/notifications/prefs').then((r) => r.json())]);
    setKinds(k.kinds ?? []);
    setDevices(p.devices ?? 0);
    setPublicKey(p.publicKey ?? null);
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setState(isIos() && !isStandalone() ? 'ios-needs-install' : 'unsupported');
      return;
    }
    if (!p.configured) { setState('server-off'); return; }
    if (Notification.permission === 'denied') { setState('blocked'); return; }
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    setState(sub ? 'on' : 'off');
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  async function enable() {
    if (!publicKey) return;
    setBusy(true);
    try {
      // Must be called straight from the tap (iOS only shows the prompt then).
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { toast.error('Notifications were not allowed'); await refresh(); return; }
      const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register('/sw.js'));
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64(publicKey) });
      const res = await fetch('/api/push', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subscription: sub.toJSON() }) });
      if (!res.ok) throw new Error('save failed');
      toast.success('This device will get notifications');
    } catch (e: any) {
      toast.error('Could not turn on notifications', { description: e?.message });
    } finally {
      setBusy(false); refresh();
    }
  }

  async function disable() {
    setBusy(true);
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await fetch('/api/push', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }) });
      await sub.unsubscribe();
    }
    setBusy(false); toast.success('Notifications off on this device'); refresh();
  }

  async function test() {
    const res = await fetch('/api/push/test', { method: 'POST' });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) toast.error(d.error ?? 'Test failed');
    else toast.success(`Sent to ${d.delivered} of ${d.devices} device${d.devices === 1 ? '' : 's'}`);
  }

  async function toggleKind(kind: string, push: boolean) {
    const next = kinds.map((k) => (k.kind === kind ? { ...k, push } : k));
    setKinds(next);
    await fetch('/api/notifications/prefs', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ push: Object.fromEntries(next.map((k) => [k.kind, k.push])) }),
    });
  }

  const message: Record<DeviceState, string> = {
    'unsupported': 'This browser can’t receive push notifications. You still get everything in the bell.',
    'ios-needs-install': 'On iPhone: tap Share → Add to Home Screen, open the app from your home screen, then come back here to turn notifications on.',
    'blocked': 'Notifications are blocked for this site in your browser settings. Allow them there, then reload.',
    'off': 'Get task and team alerts on this device, even when the app is closed.',
    'on': 'This device gets notifications.',
    'server-off': 'Push isn’t set up on the server yet (VAPID keys). Everything still shows in the bell.',
  };

  return (
    <div className="flex flex-col gap-5" style={{ maxWidth: 720 }}>
      <DataCard title="This device" delay={0}>
        <div className="flex items-start gap-3">
          <div className="flex items-center justify-center rounded-lg" style={{ width: 40, height: 40, backgroundColor: 'rgba(245,166,35,0.12)', flexShrink: 0 }}>
            {state === 'on' ? <BellRing size={20} style={{ color: '#F5A623' }} /> : <Smartphone size={20} style={{ color: '#F5A623' }} />}
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 13, color: '#8A8A8A', lineHeight: 1.6 }}>{message[state]}</p>
            <div className="flex flex-wrap gap-2" style={{ marginTop: 12 }}>
              {state === 'off' && <button onClick={enable} disabled={busy} style={btn(true)}>Turn on notifications</button>}
              {state === 'on' && <button onClick={disable} disabled={busy} style={btn(false)}>Turn off on this device</button>}
              {devices > 0 && <button onClick={test} style={btn(false)}>Send a test</button>}
            </div>
            <p style={{ fontSize: 12, color: '#525252', marginTop: 10 }}>{devices} device{devices === 1 ? '' : 's'} on your account.</p>
          </div>
        </div>
      </DataCard>

      <DataCard title="What reaches your devices" delay={0.05}>
        <p style={{ fontSize: 12.5, color: '#525252', marginBottom: 10 }}>Everything always lands in the bell. These choose what also pushes to your phone and desktop.</p>
        <div className="flex flex-col gap-1">
          {kinds.map((k) => (
            <label key={k.kind} className="flex items-center gap-3" style={{ padding: '7px 0', fontSize: 13, color: '#F0F0F0', cursor: 'pointer' }}>
              <input type="checkbox" checked={k.push} onChange={(e) => toggleKind(k.kind, e.target.checked)} />
              {k.label}
            </label>
          ))}
        </div>
      </DataCard>
    </div>
  );
}
