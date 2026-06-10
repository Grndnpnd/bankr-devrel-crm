'use client';
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ScoreBreakdown } from '@/types';
import { breakdownLabels } from '@/data/stats';

interface ScoreBadgeProps {
  score: number;
  breakdown?: ScoreBreakdown;
  small?: boolean;
  showTooltip?: boolean;
}

const getScoreColor = (score: number): string => {
  if (score <= 30) return '#EF4444';
  if (score <= 60) return '#F59E0B';
  if (score <= 80) return '#10B981';
  return '#34D399';
};

const ScoreBadge: React.FC<ScoreBadgeProps> = ({
  score,
  breakdown,
  small = false,
  showTooltip = true,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const color = getScoreColor(score);

  return (
    <div
      className="relative inline-flex items-center"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <span
        className="inline-flex items-center justify-center rounded-full text-white"
        style={{
          backgroundColor: color,
          padding: small ? '3px 8px' : '4px 10px',
          fontFamily: "'Manrope', sans-serif",
          fontSize: small ? '12px' : '14px',
          fontWeight: 700,
          lineHeight: 1,
        }}
      >
        {score}
      </span>
      <AnimatePresence>
        {showTooltip && isHovered && breakdown && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.96 }}
            transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
            className="absolute bottom-full left-1/2 mb-2 -translate-x-1/2 z-20"
            style={{
              backgroundColor: '#1A1A1A',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '8px',
              padding: '10px 14px',
              boxShadow: '0 4px 16px rgba(0,0,0,0.4), 0 0 1px rgba(255,255,255,0.06)',
              minWidth: '180px',
            }}
          >
            <div className="text-xs font-medium mb-2" style={{ color: '#F0F0F0', fontFamily: "'Inter', sans-serif" }}>
              Score Breakdown
            </div>
            {Object.entries(breakdown).map(([key, value]) => (
              <div key={key} className="flex items-center gap-2 mb-1 last:mb-0">
                <span className="text-xs w-24 truncate" style={{ color: '#8A8A8A', fontFamily: "'Inter', sans-serif", fontSize: '11px' }}>
                  {breakdownLabels[key] || key}
                </span>
                <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}>
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${(value / 40) * 100}%` }}
                    transition={{ duration: 0.3, ease: 'easeOut' }}
                    className="h-full rounded-full"
                    style={{ backgroundColor: getScoreColor(value * 4) }}
                  />
                </div>
                <span className="text-xs w-6 text-right" style={{ color: '#F0F0F0', fontFamily: "'Inter', sans-serif", fontSize: '11px', fontWeight: 500 }}>
                  {value}
                </span>
              </div>
            ))}
            <div
              className="absolute bottom-[-4px] left-1/2 -translate-x-1/2 w-2 h-2 rotate-45"
              style={{ backgroundColor: '#1A1A1A', borderRight: '1px solid rgba(255,255,255,0.1)', borderBottom: '1px solid rgba(255,255,255,0.1)' }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ScoreBadge;
