'use client';
import React from 'react';

interface LogoProps {
  collapsed?: boolean;
  className?: string;
}

/**
 * Bankr CRM brand mark. Expanded → the full BANKR CRM banner. Collapsed → the
 * retro-TV monitor glyph alone (kept as SVG so it stays crisp at small size).
 */
const Logo: React.FC<LogoProps> = ({ collapsed = false, className = '' }) => {
  if (collapsed) {
    return (
      <div className={`flex items-center justify-center ${className}`}>
        {/* Retro TV monitor mark (echoes the banner's icon) */}
        <svg width="26" height="26" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="2.5" y="4.5" width="23" height="19" rx="2.5" fill="#ECE6D6" stroke="#0D0D0D" strokeWidth="1.5" />
          <rect x="5" y="7" width="13" height="11" rx="1.5" fill="#F5613C" stroke="#0D0D0D" strokeWidth="1" />
          {/* simple smiley echo */}
          <rect x="8" y="10" width="1.8" height="1.8" fill="#F5C84B" />
          <rect x="13.4" y="10" width="1.8" height="1.8" fill="#F5C84B" />
          <path d="M8 13.6c1.6 1.6 4 1.6 5.6 0" stroke="#F5C84B" strokeWidth="1.2" fill="none" strokeLinecap="round" />
          {/* sliders */}
          <line x1="21" y1="8" x2="21" y2="16" stroke="#0D0D0D" strokeWidth="1.2" />
          <line x1="23.5" y1="8" x2="23.5" y2="16" stroke="#0D0D0D" strokeWidth="1.2" />
        </svg>
      </div>
    );
  }
  return (
    <div className={`flex items-center ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/bankr-crm-banner.png"
        alt="Bankr CRM"
        style={{ height: 30, width: 'auto', display: 'block' }}
      />
    </div>
  );
};

export default Logo;
