'use client';
import React from 'react';

interface StagePillProps {
  stage: string;
}

const stageColors: Record<string, string> = {
  New: '#64748B',
  Reviewing: '#3B82F6',
  Contacted: '#F59E0B',
  'In Convo': '#8B5CF6',
  Onboarding: '#14B8A6',
  Won: '#10B981',
  Passed: '#6B7280',
};

const StagePill: React.FC<StagePillProps> = ({ stage }) => {
  const color = stageColors[stage] || '#6B7280';

  return (
    <span
      className="inline-flex items-center rounded-full"
      style={{
        backgroundColor: `${color}12`,
        color: color,
        padding: '4px 12px',
        fontFamily: "'Inter', sans-serif",
        fontSize: '11px',
        fontWeight: 600,
        lineHeight: 1,
        letterSpacing: '0.02em',
      }}
    >
      {stage}
    </span>
  );
};

export default StagePill;
