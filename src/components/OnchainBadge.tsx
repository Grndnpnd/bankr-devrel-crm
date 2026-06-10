'use client';
import React from 'react';

const OnchainBadge: React.FC = () => {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full"
      style={{
        backgroundColor: 'rgba(16,185,129,0.12)',
        padding: '4px 10px',
      }}
    >
      <span
        className="inline-block rounded-full animate-pulse"
        style={{
          width: '8px',
          height: '8px',
          backgroundColor: '#10B981',
        }}
      />
      <span
        style={{
          fontFamily: "'Inter', sans-serif",
          fontSize: '11px',
          fontWeight: 600,
          color: '#10B981',
          lineHeight: 1,
          letterSpacing: '0.02em',
        }}
      >
        Live
      </span>
    </span>
  );
};

export default OnchainBadge;
