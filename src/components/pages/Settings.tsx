'use client';
import React, { useState, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { UserCircle, SlidersHorizontal, Clock, History, Slack } from 'lucide-react';
import '@/components/settings/settings.css';
import AccountTab from '@/components/settings/AccountTab';
import ScoringTab from '@/components/settings/ScoringTab';
import CronTab from '@/components/settings/CronTab';
import ImportLogTab from '@/components/settings/ImportLogTab';
import SlackTab from '@/components/settings/SlackTab';
import { useSubmissionStore } from '@/store/useSubmissionStore';
import { can } from '@/lib/access';

type Tab = 'account' | 'scoring' | 'slack' | 'automation' | 'import-log';

const Settings: React.FC = () => {
  const me = useSubmissionStore((st) => st.me);
  const role = me?.role;
  const canEditScoring = can(role, 'settings.scoring');

  const tabs = useMemo(() => {
    const t: { id: Tab; label: string; icon: React.ElementType }[] = [
      { id: 'account', label: 'Account', icon: UserCircle },
      { id: 'scoring', label: 'Scoring', icon: SlidersHorizontal },
      { id: 'slack', label: 'Slack', icon: Slack },
    ];
    if (can(role, 'cron.manage')) t.push({ id: 'automation', label: 'Automation', icon: Clock });
    if (can(role, 'import.run')) t.push({ id: 'import-log', label: 'Import Log', icon: History });
    return t;
  }, [role]);

  const [activeTab, setActiveTab] = useState<Tab>('account');
  const safeActive = tabs.some((t) => t.id === activeTab) ? activeTab : 'account';
  const [scoringUnsavedFlag, setScoringUnsavedFlag] = useState(false);
  const scoringUnsaved = useCallback((v: boolean) => setScoringUnsavedFlag(v), []);

  return (
    <div>
      <div className="mb-6">
        <h1 style={{ fontFamily: "'Manrope', sans-serif", fontSize: 22, fontWeight: 700, color: '#F0F0F0' }}>Settings</h1>
      </div>

      <div className="settings-tabs" style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '1px solid rgba(255,255,255,0.06)', flexWrap: 'wrap' }}>
        {tabs.map((tab) => {
          const isActive = tab.id === safeActive;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
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
              {tab.id === 'scoring' && scoringUnsavedFlag && (
                <span style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#F5A623' }} />
              )}
            </button>
          );
        })}
      </div>

      <motion.div key={safeActive} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15 }}>
        {safeActive === 'account' && <AccountTab />}
        {safeActive === 'scoring' && <ScoringTab onUnsavedChange={scoringUnsaved} readOnly={!canEditScoring} />}
        {safeActive === 'slack' && <SlackTab />}
        {safeActive === 'automation' && <CronTab />}
        {safeActive === 'import-log' && <ImportLogTab />}
      </motion.div>
    </div>
  );
};

export default Settings;
