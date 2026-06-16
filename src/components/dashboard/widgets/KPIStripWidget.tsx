'use client';
import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Inbox, Zap, TrendingUp, Target } from 'lucide-react';
import { scoreColor, formatUsd, computeStats } from '@/data/stats';
import DataCard from '@/components/DataCard';
import { useSubmissionStore } from '@/store/useSubmissionStore';
import { AnimatedNumber, EASE } from './_shared';

const KPIStrip: React.FC = () => {
  const subs = useSubmissionStore((st) => st.submissions);
  const { totalCount, liveCount, totalVolume, totalMarketCap, averageScore, newThisWeek } = useMemo(() => computeStats(subs), [subs]);
  return (
    <div className="grid grid-cols-4 gap-4 mb-6">
      {/* Total Submissions */}
      <DataCard delay={0.1}>
        <div className="flex items-start justify-between mb-2">
          <div>
            <div
              style={{
                fontFamily: "'Manrope', sans-serif",
                fontSize: '32px',
                fontWeight: 700,
                lineHeight: 1.1,
                letterSpacing: '-0.02em',
                color: '#F0F0F0',
              }}
            >
              <AnimatedNumber value={totalCount} delay={200} />
            </div>
            <div
              className="mt-1 uppercase"
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: '12px',
                fontWeight: 500,
                color: '#525252',
                letterSpacing: '0.04em',
              }}
            >
              Total Submissions
            </div>
          </div>
          <Inbox size={20} style={{ color: '#525252' }} />
        </div>
        <div
          className="flex items-center gap-1"
          style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: '11px',
            color: '#10B981',
            fontWeight: 500,
          }}
        >
          <span>+{newThisWeek} this week</span>
        </div>
      </DataCard>

      {/* Live on Bankr */}
      <DataCard delay={0.18}>
        <div className="flex items-start justify-between mb-2">
          <div>
            <div
              style={{
                fontFamily: "'Manrope', sans-serif",
                fontSize: '32px',
                fontWeight: 700,
                lineHeight: 1.1,
                letterSpacing: '-0.02em',
                color: '#10B981',
              }}
            >
              <AnimatedNumber value={liveCount} delay={280} />
            </div>
            <div
              className="mt-1 uppercase"
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: '12px',
                fontWeight: 500,
                color: '#525252',
                letterSpacing: '0.04em',
              }}
            >
              Live on Bankr
            </div>
          </div>
          <Zap
            size={20}
            style={{ color: '#10B981' }}
            className="animate-pulse"
          />
        </div>
        <div
          style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: '12px',
            color: '#525252',
          }}
        >
          {totalCount ? ((liveCount / totalCount) * 100).toFixed(1) : '0'}% of submissions
        </div>
      </DataCard>

      {/* 24h Volume + Market Cap */}
      <DataCard delay={0.26}>
        <div className="flex items-start justify-between mb-2">
          <div>
            <div
              style={{
                fontFamily: "'Manrope', sans-serif",
                fontSize: '32px',
                fontWeight: 700,
                lineHeight: 1.1,
                letterSpacing: '-0.02em',
                color: '#F5A623',
              }}
            >
              {formatUsd(totalVolume)}
            </div>
            <div
              className="mt-1 uppercase"
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: '12px',
                fontWeight: 500,
                color: '#525252',
                letterSpacing: '0.04em',
              }}
            >
              24h Volume
            </div>
          </div>
          <TrendingUp size={20} style={{ color: '#F5A623' }} />
        </div>
        <div
          style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: '12px',
            color: '#525252',
          }}
        >
          Market cap {formatUsd(totalMarketCap)}
        </div>
      </DataCard>

      {/* Avg Score */}
      <DataCard delay={0.34}>
        <div className="flex items-start justify-between mb-2">
          <div>
            <div
              style={{
                fontFamily: "'Manrope', sans-serif",
                fontSize: '32px',
                fontWeight: 700,
                lineHeight: 1.1,
                letterSpacing: '-0.02em',
                color: scoreColor(Math.round(averageScore)),
              }}
            >
              {averageScore}
            </div>
            <div
              className="mt-1 uppercase"
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: '12px',
                fontWeight: 500,
                color: '#525252',
                letterSpacing: '0.04em',
              }}
            >
              Avg. Outreach Score
            </div>
          </div>
          <Target size={20} style={{ color: '#525252' }} />
        </div>
        {/* Mini score bar */}
        <div className="flex items-center gap-1 mt-1">
          {[
            { key: 'volume', color: '#3B82F6' },
            { key: 'launched', color: '#8B5CF6' },
            { key: 'traction', color: '#F59E0B' },
            { key: 'founder', color: '#10B981' },
            { key: 'completeness', color: '#14B8A6' },
          ].map((seg) => (
            <div
              key={seg.key}
              className="rounded-full"
              style={{
                width: '24px',
                height: '4px',
                backgroundColor: seg.color,
                opacity: 0.8,
              }}
            />
          ))}
        </div>
      </DataCard>
    </div>
  );
};


export default KPIStrip;
