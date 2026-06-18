'use client';
import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Database, RefreshCw, Users } from 'lucide-react';
import '@/components/settings/settings.css';
import SourcesTab from '@/components/settings/SourcesTab';
import CoreRefreshTab from '@/components/settings/CoreRefreshTab';
import UsersTab from '@/components/settings/UsersTab';
import { useSubmissionStore } from '@/store/useSubmissionStore';
import { can } from '@/lib/access';

type AdminTab = 'sources' | 'core-refresh' | 'users';

const TABS: { id: AdminTab; label: string; icon: React.ElementType; cap: Parameters<typeof can>[1] }[] = [
  { id: 'sources', label: 'Sources', icon: Database, cap: 'settings.sources' },
  { id: 'core-refresh', label: 'Core Refresh', icon: RefreshCw, cap: 'settings.sources' },
  { id: 'users', label: 'Users', icon: Users, cap: 'users.manage' },
];

const AdminPage: React.FC = () => {
  const me = useSubmissionStore((st) => st.me);
  const role = me?.role;

  const tabs = useMemo(() => TABS.filter((t) => can(role, t.cap)), [role]);
  const [active, setActive] = useState<AdminTab>('sources');
  const safeActive = tabs.some((t) => t.id === active) ? active : (tabs[0]?.id ?? 'sources');

  // Non-admins shouldn't land here at all (sidebar hides it), but fail safe.
  if (!can(role, 'users.manage') && !can(role, 'settings.sources') && !can(role, 'cron.manage')) {
    return <div style={{ color: '#8A8A8A', fontSize: 14, padding: 32 }}>You don’t have access to this page.</div>;
  }

  return (
    <div>
      <div className="mb-6">
        <h1 style={{ fontFamily: "'Manrope', sans-serif", fontSize: 22, fontWeight: 700, color: '#F0F0F0' }}>Admin</h1>
        <p style={{ fontSize: 13, color: '#8A8A8A', marginTop: 2 }}>System configuration, data sources, users, and automation.</p>
      </div>

      <div className="settings-tabs" style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: 0, flexWrap: 'wrap' }}>
        {tabs.map((tab) => {
          const isActive = tab.id === safeActive;
          return (
            <button
              key={tab.id}
              onClick={() => setActive(tab.id)}
              className="flex items-center gap-2 transition-all duration-150"
              style={{
                padding: '10px 14px', fontSize: 13, fontWeight: 600,
                color: isActive ? '#F5A623' : '#8A8A8A',
                borderBottom: isActive ? '2px solid #F5A623' : '2px solid transparent',
                background: 'transparent',
              }}
            >
              <tab.icon size={15} />
              {tab.label}
            </button>
          );
        })}
      </div>

      <motion.div key={safeActive} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15 }}>
        {safeActive === 'sources' && <SourcesTab />}
        {safeActive === 'core-refresh' && <CoreRefreshTab />}
        {safeActive === 'users' && <UsersTab />}
      </motion.div>
    </div>
  );
};

export default AdminPage;
