'use client';
import React from 'react';
import { useRouter } from 'next/navigation';
import { Search, LogOut, Menu } from 'lucide-react';
import { useSubmissionStore } from '@/store/useSubmissionStore';
import NotificationBell from '@/components/NotificationBell';

interface TopBarProps { title: string; onMenu: () => void; me?: { name: string | null; email: string } }

const TopBar: React.FC<TopBarProps> = ({ title, onMenu, me: sessionMe }) => {
  const router = useRouter();
  const { searchQuery, setSearch, me } = useSubmissionStore();

  // The server session is known on first paint; the store copy arrives a moment later.
  const who = me ?? sessionMe;
  const initials = (who?.name || who?.email || '').slice(0, 2).toUpperCase();

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  };

  return (
    <header
      className="hub-top fixed top-0 right-0 flex items-center justify-between"
      style={{
        zIndex: 90,
        height: '48px',
        backgroundColor: '#1A1A1A',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        padding: '0 24px',
      }}
    >
      <button onClick={onMenu} className="hub-burger items-center justify-center rounded-md" aria-label="Open menu" style={{ width: 36, height: 36, color: '#F0F0F0', flexShrink: 0 }}>
        <Menu size={20} />
      </button>
      <h1 style={{ fontFamily: "'Manrope', sans-serif", fontSize: '16px', fontWeight: 600, color: '#F0F0F0', lineHeight: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: '0 1 auto', minWidth: 0 }}>
        {title}
      </h1>

      <div className="hub-search relative flex-1 flex justify-center" style={{ maxWidth: '320px', margin: '0 auto' }}>
        <div className="relative w-full">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#525252' }} />
          <input
            type="text"
            placeholder="Search projects, founders..."
            value={searchQuery}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-md outline-none transition-all duration-150"
            style={{
              height: '32px',
              backgroundColor: '#141414',
              border: '1px solid rgba(255,255,255,0.1)',
              color: '#F0F0F0',
              fontFamily: "'Inter', sans-serif",
              fontSize: '13px',
              padding: '0 12px 0 36px',
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = '#F5A623'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(245,166,35,0.15)'; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; e.currentTarget.style.boxShadow = 'none'; }}
          />
        </div>
      </div>

      <div className="flex items-center gap-2" style={{ marginLeft: 'auto', flexShrink: 0 }}>
        {/* Sheets import and onchain refresh moved to Settings → Core Refresh (paused since the pivot). */}
        <NotificationBell />
        <button
          onClick={logout}
          className="inline-flex items-center justify-center rounded-md transition-all duration-150"
          style={{ width: 30, height: 30, backgroundColor: 'transparent', border: '1px solid rgba(255,255,255,0.06)', color: '#8A8A8A' }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#222'; e.currentTarget.style.color = '#F0F0F0'; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#8A8A8A'; }}
          title="Sign out"
        >
          <LogOut size={14} />
        </button>
        <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: '#222', border: '1px solid rgba(255,255,255,0.06)' }} title={who?.email || ''}>
          <span style={{ fontFamily: "'Inter', sans-serif", fontSize: '12px', fontWeight: 600, color: '#F5A623' }}>{initials}</span>
        </div>
      </div>
    </header>
  );
};

export default TopBar;
