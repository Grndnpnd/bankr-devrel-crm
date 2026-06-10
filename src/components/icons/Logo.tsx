'use client';
import React from 'react';

interface LogoProps {
  collapsed?: boolean;
  className?: string;
}

const Logo: React.FC<LogoProps> = ({ collapsed = false, className = '' }) => {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <svg width="24" height="24" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Amber dot */}
        <circle cx="4" cy="14" r="3" fill="#F5A623" />
        {/* B monogram */}
        <path
          d="M10 5h5.5c3.5 0 5.5 1.8 5.5 4.5 0 2-1.2 3.5-3 4.2v.1c2.2.5 3.8 2.2 3.8 4.8 0 3.2-2.3 5.4-6 5.4H10V5zm5 7.5c2 0 3.2-1 3.2-2.8 0-1.8-1.2-2.7-3.2-2.7H13.8v5.5H15zm.5 8.2c2.2 0 3.5-1.2 3.5-3.2 0-1.8-1.3-3-3.5-3H13.8v6.2H15.5z"
          fill="#F0F0F0"
        />
      </svg>
      {!collapsed && (
        <span
          style={{
            fontFamily: "'Manrope', sans-serif",
            fontSize: '22px',
            fontWeight: 800,
            lineHeight: 1,
            letterSpacing: '-0.03em',
            color: '#F0F0F0',
          }}
        >
          Bankr
        </span>
      )}
    </div>
  );
};

export default Logo;
