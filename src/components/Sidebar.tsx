'use client';
import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutDashboard, Inbox, BarChart3, Settings, Shield, ClipboardCheck, ChevronLeft, ChevronRight, TerminalSquare, LayoutGrid, Plus } from 'lucide-react';
import Logo from './icons/Logo';
import { useSubmissionStore } from '@/store/useSubmissionStore';
import { can } from '@/lib/access';

interface NavItem { to: string; label: string; icon: React.ElementType; adminOnly?: boolean }

const navItems: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/submissions', label: 'Submissions', icon: Inbox },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/terminal', label: 'Terminal', icon: TerminalSquare },
  { to: '/review', label: 'Review', icon: ClipboardCheck },
  { to: '/settings', label: 'Settings', icon: Settings },
  { to: '/admin', label: 'Admin', icon: Shield, adminOnly: true },
];

const Sidebar: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const me = useSubmissionStore((st) => st.me);
  const pendingCount = useSubmissionStore((st) => st.proposals.length);
  const dashboardLayouts = useSubmissionStore((st) => st.dashboardLayouts);
  const activeLayoutId = useSubmissionStore((st) => st.activeLayoutId);
  const switchLayout = useSubmissionStore((st) => st.switchLayout);
  const router = useRouter();
  // "Admin" capability proxy: anyone who can manage users (ADMIN) sees the Admin page.
  const items = navItems.filter((i) => !i.adminOnly || can(me?.role, 'users.manage'));

  const isActiveFor = (to: string) =>
    to === '/' ? pathname === '/' : pathname.startsWith(to);

  return (
    <aside
      className="fixed left-0 top-0 h-full flex flex-col transition-all duration-300"
      style={{
        width: collapsed ? '56px' : '220px',
        backgroundColor: '#1A1A1A',
        borderRight: '1px solid rgba(255,255,255,0.06)',
        zIndex: 100,
      }}
    >
      <div
        className="flex items-center"
        style={{
          height: '48px',
          padding: collapsed ? '0 16px' : '0 24px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          background: collapsed
            ? 'transparent'
            : 'linear-gradient(90deg, rgba(124,58,237,0.22) 0%, rgba(124,58,237,0.08) 70%, transparent 100%)',
        }}
      >
        <Logo collapsed={collapsed} />
      </div>

      <nav className="flex-1 py-3 flex flex-col gap-0.5 px-2">
        {items.map((item) => {
          const active = isActiveFor(item.to);
          const link = (
            <Link
              key={item.to}
              href={item.to}
              className={`flex items-center gap-3 rounded-md transition-all duration-200 relative ${
                collapsed ? 'justify-center w-10 h-10 mx-auto' : 'px-4 h-10'
              }`}
              style={{
                backgroundColor: active ? '#222' : 'transparent',
                color: active ? '#F0F0F0' : '#8A8A8A',
                borderLeft: active ? '3px solid #F5A623' : '3px solid transparent',
                fontFamily: "'Inter', sans-serif",
                fontSize: '13px',
                fontWeight: 500,
                lineHeight: 1,
                textDecoration: 'none',
              }}
              onMouseEnter={(e) => {
                if (!active) {
                  e.currentTarget.style.backgroundColor = '#222';
                  e.currentTarget.style.color = '#F0F0F0';
                }
              }}
              onMouseLeave={(e) => {
                if (!active) {
                  e.currentTarget.style.backgroundColor = 'transparent';
                  e.currentTarget.style.color = '#8A8A8A';
                }
              }}
            >
              <item.icon size={20} style={{ color: active ? '#F5A623' : '#525252', flexShrink: 0 }} />
              {!collapsed && <span>{item.label}</span>}
              {item.to === '/review' && pendingCount > 0 && (
                <span style={{
                  marginLeft: collapsed ? 0 : 'auto',
                  position: collapsed ? 'absolute' : 'static',
                  top: collapsed ? 4 : undefined, right: collapsed ? 4 : undefined,
                  minWidth: 18, height: 18, padding: '0 5px', borderRadius: 9,
                  backgroundColor: '#F5A623', color: '#0D0D0D',
                  fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {pendingCount}
                </span>
              )}
            </Link>
          );
          // Named dashboard layouts render directly beneath the Dashboard item.
          if (item.to === '/' && !collapsed && dashboardLayouts.length > 0) {
            return (
              <React.Fragment key="dashboard-with-layouts">
                {link}
                <div style={{ marginTop: 2, marginBottom: 4 }}>
                  {dashboardLayouts.map((l) => {
                    const isActive = pathname === '/' && activeLayoutId === l.id;
                    return (
                      <button
                        key={l.id}
                        onClick={() => { switchLayout(l.id); if (pathname !== '/') router.push('/'); }}
                        className="flex items-center gap-2.5 rounded-md w-full transition-all duration-200"
                        style={{
                          padding: '0 4px 0 26px', height: 32, marginLeft: 8,
                          backgroundColor: isActive ? '#222' : 'transparent',
                          color: isActive ? '#F0F0F0' : '#8A8A8A',
                          fontFamily: "'Inter', sans-serif", fontSize: 12.5, fontWeight: 500,
                          border: 'none', cursor: 'pointer', textAlign: 'left',
                        }}
                        onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.backgroundColor = '#1f1f1f'; }}
                        onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.backgroundColor = 'transparent'; }}
                      >
                        <LayoutGrid size={14} style={{ color: isActive ? '#F5A623' : '#525252', flexShrink: 0 }} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.name}</span>
                      </button>
                    );
                  })}
                </div>
              </React.Fragment>
            );
          }
          return link;
        })}
      </nav>

      <div className="px-2 pb-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center justify-center w-10 h-10 rounded-md transition-all duration-200 mx-auto mt-2"
          style={{ color: '#525252', backgroundColor: 'transparent' }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#222'; e.currentTarget.style.color = '#F0F0F0'; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#525252'; }}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
