'use client';
import React, { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import '@/components/settings/settings.css';
import SettingsTabs from '@/components/settings/SettingsTabs';
import AccountTab from '@/components/settings/AccountTab';
import ScoringTab from '@/components/settings/ScoringTab';
import SourcesTab from '@/components/settings/SourcesTab';
import UsersTab from '@/components/settings/UsersTab';
import ImportLogTab from '@/components/settings/ImportLogTab';
import type { SettingsTab as TabType } from '@/components/settings/SettingsTabs';

/* ------------------------------------------------------------------ */
/*  Main Settings Page                                                */
/* ------------------------------------------------------------------ */
const Settings: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('scoring');
  const [unsavedTabs, setUnsavedTabs] = useState<Set<string>>(new Set());

  const handleTabChange = useCallback((tab: TabType) => {
    setActiveTab(tab);
  }, []);

  // Track unsaved changes — currently just for scoring tab demo
  // In a real app this would come from each tab's state
  const handleUnsavedChange = useCallback((tab: string, hasUnsaved: boolean) => {
    setUnsavedTabs((prev) => {
      if (hasUnsaved === prev.has(tab)) return prev; // no change -> no re-render
      const next = new Set(prev);
      if (hasUnsaved) {
        next.add(tab);
      } else {
        next.delete(tab);
      }
      return next;
    });
  }, []);

  // Stable per-tab callback so child effects don't re-fire every render.
  const scoringUnsaved = useCallback(
    (v: boolean) => handleUnsavedChange('scoring', v),
    [handleUnsavedChange]
  );

  return (
    <div>
      {/* Tabs */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
      >
        <SettingsTabs
          active={activeTab}
          onChange={handleTabChange}
          unsavedTabs={unsavedTabs}
        />
      </motion.div>

      {/* Tab Content */}
      <motion.div
        key={activeTab}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.15 }}
      >
        {activeTab === 'account' && <AccountTab />}
        {activeTab === 'scoring' && <ScoringTab onUnsavedChange={scoringUnsaved} />}
        {activeTab === 'sources' && <SourcesTab />}
        {activeTab === 'users' && <UsersTab />}
        {activeTab === 'import-log' && <ImportLogTab />}
      </motion.div>
    </div>
  );
};

export default Settings;
