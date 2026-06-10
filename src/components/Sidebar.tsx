'use client';
import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Inbox, BarChart3, Settings, ChevronLeft, ChevronRight } from 'lucide-react';
import Logo from './icons/Logo';

interface NavItem { to: string; label: string; icon: React.ElementType }

const navItems: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/submissions', label: 'Submissions', icon: Inbox },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/settings', label: 'Settings', icon: Settings },
];

const Sidebar: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();

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
        }}
      >
        <Logo collapsed={collapsed} />
      </div>

      <nav className="flex-1 py-3 flex flex-col gap-0.5 px-2">
        {navItems.map((item) => {
          const active = isActiveFor(item.to);
          return (
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
            </Link>
          );
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
