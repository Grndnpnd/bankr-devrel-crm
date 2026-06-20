'use client';
import React, { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { Toaster } from 'sonner';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import { useSubmissionStore } from '@/store/useSubmissionStore';
import AgentBubble from '@/components/agent/AgentBubble';
import type { SessionUser } from '@/lib/auth';

function titleFor(pathname: string): string {
  if (pathname === '/') return 'Dashboard';
  if (pathname.startsWith('/submissions')) return 'Submissions';
  if (pathname.startsWith('/analytics')) return 'Analytics';
  if (pathname.startsWith('/terminal')) return 'Terminal';
  if (pathname.startsWith('/settings')) return 'Settings';
  if (pathname.startsWith('/admin')) return 'Admin';
  if (pathname.startsWith('/review')) return 'Review Inbox';
  return 'Bankr';
}

export default function AppShell({ me, children }: { me: SessionUser; children: React.ReactNode }) {
  const pathname = usePathname();
  const { setMe, load, loadUsers, loadProposals } = useSubmissionStore();

  useEffect(() => {
    setMe(me);
    load();
    loadUsers();
    loadProposals();
    // Sync client-side can() with the admin-edited capability matrix (app-wide,
    // so gated UI on every page reflects current permissions).
    (async () => {
      try {
        const res = await fetch('/api/me');
        if (!res.ok) return;
        const data = await res.json();
        if (data?.capabilityMatrix) {
          const { setCapabilityOverrides } = await import('@/lib/access');
          setCapabilityOverrides(data.capabilityMatrix);
        }
        if (Array.isArray(data?.capabilities)) {
          useSubmissionStore.getState().setUserCapabilities(data.capabilities);
        }
      } catch { /* non-fatal — falls back to code defaults */ }
    })();
  }, [me, setMe, load, loadUsers, loadProposals]);

  return (
    <div className="min-h-full" style={{ backgroundColor: '#0D0D0D', fontFamily: "'Inter', sans-serif", fontSize: '13px', color: '#F0F0F0' }}>
      <Sidebar />
      <TopBar title={titleFor(pathname)} />
      <main style={{ marginLeft: '220px', paddingTop: '48px', minHeight: '100vh' }}>
        <div className="p-8">{children}</div>
      </main>
      <Toaster theme="dark" position="bottom-right" richColors />
      <AgentBubble />
    </div>
  );
}
