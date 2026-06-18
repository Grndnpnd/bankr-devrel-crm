'use client';
import React, { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { UserCircle, SlidersHorizontal } from 'lucide-react';
import '@/components/settings/settings.css';
import AccountTab from '@/components/settings/AccountTab';
import ScoringTab from '@/components/settings/ScoringTab';
import { useSubmissionStore } from '@/store/useSubmissionStore';
import { can } from '@/lib/access';

type Tab = 'account' | 'scoring';

const Settings: React.FC = () => {
  const me = useSubmissionStore((st) => st.me);
  const role = me?.role;
  const canEditScoring = can(role, 'settings.scoring');

  const [activeTab, setActiveTab] = useState<Tab>('account');
  const [scoringUnsavedFlag, setScoringUnsavedFlag] = useState(false);
  const scoringUnsaved = useCallback((v: boolean) => setScoringUnsavedFlag(v), []);

  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: 'account', label: 'Account', icon: UserCircle },
    { id: 'scoring', label: 'Scoring', icon: SlidersHorizontal },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 style={{ fontFamily: "'Manrope', sans-serif", fontSize: 22, fontWeight: 700, color: '#F0F0F0' }}>Settings</h1>
      </div>

      <div className="settings-tabs" style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab;
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

      <motion.div key={activeTab} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15 }}>
        {activeTab === 'account' && <AccountTab />}
        {activeTab === 'scoring' && <ScoringTab onUnsavedChange={scoringUnsaved} readOnly={!canEditScoring} />}
      </motion.div>
    </div>
  );
};

export default Settings;
