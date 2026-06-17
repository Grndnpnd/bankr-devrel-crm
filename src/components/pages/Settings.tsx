'use client';
import React, { useState, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import '@/components/settings/settings.css';
import SettingsTabs from '@/components/settings/SettingsTabs';
import AccountTab from '@/components/settings/AccountTab';
import ScoringTab from '@/components/settings/ScoringTab';
import SourcesTab from '@/components/settings/SourcesTab';
import UsersTab from '@/components/settings/UsersTab';
import CronTab from '@/components/settings/CronTab';
import ImportLogTab from '@/components/settings/ImportLogTab';
import type { SettingsTab as TabType } from '@/components/settings/SettingsTabs';
import { useSubmissionStore } from '@/store/useSubmissionStore';
import { can } from '@/lib/access';

const Settings: React.FC = () => {
  const me = useSubmissionStore((st) => st.me);
  const role = me?.role;

  // Capability-driven tab visibility. Account + Scoring always show (Scoring is
  // read-only for non-admins). Sources/Users/Automation/Import-Log are gated.
  const visibleTabs = useMemo<TabType[]>(() => {
    const tabs: TabType[] = ['account', 'scoring'];
    if (can(role, 'settings.sources')) tabs.push('sources');
    if (can(role, 'users.manage')) tabs.push('users');
    if (can(role, 'cron.manage')) tabs.push('automation');
    if (can(role, 'import.run')) tabs.push('import-log');
    return tabs;
  }, [role]);

  // Default to the Account tab.
  const [activeTab, setActiveTab] = useState<TabType>('account');
  const [unsavedTabs, setUnsavedTabs] = useState<Set<string>>(new Set());

  // If the active tab isn't visible to this role, fall back to account.
  const safeActive = visibleTabs.includes(activeTab) ? activeTab : 'account';

  const handleTabChange = useCallback((tab: TabType) => { setActiveTab(tab); }, []);

  const handleUnsavedChange = useCallback((tab: string, hasUnsaved: boolean) => {
    setUnsavedTabs((prev) => {
      if (hasUnsaved === prev.has(tab)) return prev;
      const next = new Set(prev);
      if (hasUnsaved) next.add(tab); else next.delete(tab);
      return next;
    });
  }, []);

  const scoringUnsaved = useCallback(
    (v: boolean) => handleUnsavedChange('scoring', v),
    [handleUnsavedChange]
  );

  const canEditScoring = can(role, 'settings.scoring');

  return (
    <div>
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
      >
        <SettingsTabs
          active={safeActive}
          onChange={handleTabChange}
          unsavedTabs={unsavedTabs}
          visibleTabs={visibleTabs}
        />
      </motion.div>

      <motion.div
        key={safeActive}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.15 }}
      >
        {safeActive === 'account' && <AccountTab />}
        {safeActive === 'scoring' && <ScoringTab onUnsavedChange={scoringUnsaved} readOnly={!canEditScoring} />}
        {safeActive === 'sources' && <SourcesTab />}
        {safeActive === 'users' && <UsersTab />}
        {safeActive === 'automation' && <CronTab />}
        {safeActive === 'import-log' && <ImportLogTab />}
      </motion.div>
    </div>
  );
};

export default Settings;
