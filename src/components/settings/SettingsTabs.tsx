'use client';
import React from 'react';
import { SlidersHorizontal, Database, Users, History, UserCircle, Clock, RefreshCw } from 'lucide-react';

export type SettingsTab = 'account' | 'scoring' | 'sources' | 'core-refresh' | 'users' | 'automation' | 'import-log';

const tabs: { id: SettingsTab; label: string; icon: React.ElementType }[] = [
  { id: 'account', label: 'Account', icon: UserCircle },
  { id: 'scoring', label: 'Scoring', icon: SlidersHorizontal },
  { id: 'sources', label: 'Sources', icon: Database },
  { id: 'core-refresh', label: 'Core Refresh', icon: RefreshCw },
  { id: 'users', label: 'Users', icon: Users },
  { id: 'automation', label: 'Automation', icon: Clock },
  { id: 'import-log', label: 'Import Log', icon: History },
];

interface SettingsTabsProps {
  active: SettingsTab;
  onChange: (tab: SettingsTab) => void;
  unsavedTabs?: Set<string>;
  visibleTabs?: SettingsTab[];
}

const SettingsTabs: React.FC<SettingsTabsProps> = ({ active, onChange, unsavedTabs, visibleTabs }) => {
  const shown = visibleTabs ? tabs.filter((t) => visibleTabs.includes(t.id)) : tabs;
  return (
    <div
      className="flex items-center gap-1 mb-6"
      style={{
        backgroundColor: '#1A1A1A',
        borderRadius: '8px',
        padding: '2px',
      }}
    >
      {shown.map((tab) => {
        const isActive = active === tab.id;
        const hasUnsaved = unsavedTabs?.has(tab.id);
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className="relative flex items-center gap-2 px-5 py-2.5 text-sm font-medium transition-all duration-200"
            style={{
              borderRadius: '6px',
              backgroundColor: isActive ? '#2A2A2A' : 'transparent',
              color: isActive ? '#F0F0F0' : '#525252',
              borderBottom: isActive ? '2px solid #F5A623' : '2px solid transparent',
              fontFamily: "'Inter', sans-serif",
              fontSize: '13px',
              fontWeight: 500,
              lineHeight: 1,
            }}
            onMouseEnter={(e) => {
              if (!isActive) {
                e.currentTarget.style.backgroundColor = '#222222';
                e.currentTarget.style.color = '#8A8A8A';
              }
            }}
            onMouseLeave={(e) => {
              if (!isActive) {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = '#525252';
              }
            }}
          >
            <tab.icon size={16} />
            <span>{tab.label}</span>
            {hasUnsaved && (
              <span
                className="absolute top-1.5 right-1.5 block rounded-full"
                style={{
                  width: '6px',
                  height: '6px',
                  backgroundColor: '#F5A623',
                }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
};

export default SettingsTabs;
