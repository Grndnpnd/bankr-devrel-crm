'use client';
import React, { useEffect, useState } from 'react';
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
  if (pathname.startsWith('/tasks')) return 'Tasks';
  if (pathname.startsWith('/wallets')) return 'Wallets';
  if (pathname.startsWith('/beta')) return 'Beta programs';
  if (pathname.startsWith('/artifacts')) return 'Artifacts';
  return 'Bankr';
}

const SHELL_CSS = `
.hub-main{margin-left:var(--side-w);padding-top:48px;min-height:100vh;transition:margin-left .3s;min-width:0}
.hub-pad{padding:32px 32px 112px}
.hub-side{width:var(--side-w)}
.hub-top{left:var(--side-w)}
.hub-burger,.hub-backdrop{display:none}
/* Beta pages: keep the right edge clear of the assistant bubble (56px + 24px margin) so the last controls stay tappable. */
@media (min-width:768px){[data-beta="true"] .hub-pad{padding-right:104px}}
@media (max-width:767px){
  .hub-main{margin-left:0}
  .hub-pad{padding:16px 16px 104px}
  .hub-side{width:240px !important;transform:translateX(-100%);transition:transform .25s}
  .hub-side.open{transform:none;box-shadow:0 0 40px rgba(0,0,0,.6)}
  .hub-side .hub-collapse{display:none}
  .hub-top{left:0 !important;padding:0 12px !important;gap:8px}
  .hub-burger{display:inline-flex}
  .hub-search{display:none !important}
  .hub-backdrop{display:block;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:99}
  /* On a phone the bubble covered beta buttons; the beta pages hide it. */
  [data-beta="true"] .hub-bubble{display:none !important}
}
`;

export default function AppShell({ me, children }: { me: SessionUser; children: React.ReactNode }) {
  const pathname = usePathname();
  // Desktop: the sidebar can collapse to icons. Phones (<768px): it slides in over the page from the menu button.
  const [collapsed, setCollapsed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => { setMenuOpen(false); }, [pathname]);
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
    <div className="min-h-full" data-beta={pathname.startsWith('/beta') ? 'true' : 'false'} style={{ backgroundColor: '#0D0D0D', fontFamily: "'Inter', sans-serif", fontSize: '13px', color: '#F0F0F0', ['--side-w' as string]: collapsed ? '56px' : '220px' }}>
      <style>{SHELL_CSS}</style>
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} open={menuOpen} onClose={() => setMenuOpen(false)} />
      {menuOpen && <div className="hub-backdrop" onClick={() => setMenuOpen(false)} aria-hidden="true" />}
      <TopBar title={titleFor(pathname)} onMenu={() => setMenuOpen(true)} me={me} />
      <main className="hub-main">
        <div className="hub-pad">{children}</div>
      </main>
      {/* Bottom-left on desktop: drawers open on the right and the top bar holds the bell, so this corner covers nothing.
          Phones: full width at the bottom, lifted above the assistant bubble. Short-lived, two at most, closable. */}
      <Toaster theme="dark" position="bottom-left" offset={24} mobileOffset={{ bottom: 88, left: 16, right: 16 }} richColors visibleToasts={2} duration={3000} closeButton toastOptions={{ style: { maxWidth: 'calc(100vw - 32px)' } }} />
      <AgentBubble />
    </div>
  );
}
