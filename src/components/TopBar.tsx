'use client';
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Search, Download, LogOut, RefreshCw } from 'lucide-react';
import { useSubmissionStore } from '@/store/useSubmissionStore';

interface TopBarProps { title: string }

const TopBar: React.FC<TopBarProps> = ({ title }) => {
  const router = useRouter();
  const { searchQuery, setSearch, me, importNow, refreshOnchain } = useSubmissionStore();
  const [importing, setImporting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const initials = (me?.name || me?.email || 'BK').slice(0, 2).toUpperCase();

  const doImport = async () => {
    setImporting(true);
    try {
      const r = await importNow();
      if (r?.error) {
        toast.error('Import failed', { description: r.error });
      } else {
        toast.success('Import complete', {
          description: `Pulled ${r?.pulled ?? 0} · ${r?.created ?? 0} new · ${r?.updated ?? 0} updated`,
        });
      }
    } catch (e: any) {
      toast.error('Import failed', { description: e?.message ?? 'unexpected error' });
    } finally {
      setImporting(false);
    }
  };

  const doRefresh = async () => {
    setRefreshing(true);
    try {
      const r = await refreshOnchain();
      if (r?.error) toast.error('Refresh failed', { description: r.error });
      else {
        const parts = [`${r?.refreshed ?? 0} refreshed`];
        if (r?.backfilled) parts.push(`${r.backfilled} newly matched`);
        if (r?.noMatch) parts.push(`${r.noMatch} no match`);
        if (r?.failed) parts.push(`${r.failed} failed`);
        toast.success('Onchain refresh complete', { description: parts.join(' \u00b7 ') });
      }
    } catch (e: any) {
      toast.error('Refresh failed', { description: e?.message ?? 'unexpected error' });
    } finally {
      setRefreshing(false);
    }
  };

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  };

  return (
    <header
      className="fixed top-0 right-0 flex items-center justify-between"
      style={{
        left: '220px',
        zIndex: 90,
        height: '48px',
        backgroundColor: '#1A1A1A',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        padding: '0 24px',
      }}
    >
      <h1 style={{ fontFamily: "'Manrope', sans-serif", fontSize: '16px', fontWeight: 600, color: '#F0F0F0', lineHeight: 1 }}>
        {title}
      </h1>

      <div className="relative flex-1 flex justify-center" style={{ maxWidth: '320px', margin: '0 auto' }}>
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

      <div className="flex items-center gap-2">
        {me?.role === 'ADMIN' && (
          <button
            onClick={doRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 rounded-md transition-all duration-150"
            style={{ height: 30, padding: '0 10px', backgroundColor: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#8A8A8A', fontSize: 12, fontFamily: "'Inter', sans-serif", cursor: refreshing ? 'default' : 'pointer' }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#222'; e.currentTarget.style.color = '#F0F0F0'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#8A8A8A'; }}
            title="Refresh live onchain data for all submissions with a contract address"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
            {refreshing ? 'Refreshing…' : 'Refresh Onchain'}
          </button>
        )}
        {me?.role === 'ADMIN' && (
          <button
            onClick={doImport}
            disabled={importing}
            className="inline-flex items-center gap-1.5 rounded-md transition-all duration-150"
            style={{ height: 30, padding: '0 10px', backgroundColor: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#8A8A8A', fontSize: 12, fontFamily: "'Inter', sans-serif", cursor: importing ? 'default' : 'pointer' }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#222'; e.currentTarget.style.color = '#F0F0F0'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#8A8A8A'; }}
            title="Import from source"
          >
            <Download size={14} />
            {importing ? 'Importing…' : 'Import'}
          </button>
        )}
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
        <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: '#222', border: '1px solid rgba(255,255,255,0.06)' }} title={me?.email || ''}>
          <span style={{ fontFamily: "'Inter', sans-serif", fontSize: '12px', fontWeight: 600, color: '#F5A623' }}>{initials}</span>
        </div>
      </div>
    </header>
  );
};

export default TopBar;
