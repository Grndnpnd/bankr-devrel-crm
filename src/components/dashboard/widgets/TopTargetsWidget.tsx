'use client';
import React, { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Target, ExternalLink } from 'lucide-react';
import DataCard from '@/components/DataCard';
import ScoreBadge from '@/components/ScoreBadge';
import StagePill from '@/components/StagePill';
import OnchainBadge from '@/components/OnchainBadge';
import { formatUsd, computeStats } from '@/data/stats';
import { useSubmissionStore } from '@/store/useSubmissionStore';
import { EASE } from './_shared';

const TopTargetsTable: React.FC = () => {
  const router = useRouter();
  const subs = useSubmissionStore((st) => st.submissions);
  const { topTargets } = useMemo(() => computeStats(subs), [subs]);

  return (
    <DataCard delay={0.7}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2
            style={{
              fontFamily: "'Manrope', sans-serif",
              fontSize: '16px',
              fontWeight: 600,
              color: '#F0F0F0',
              lineHeight: 1.3,
            }}
          >
            Top Targets
          </h2>
          <p
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: '12px',
              color: '#525252',
              marginTop: '2px',
            }}
          >
            Highest-scored uncontacted projects
          </p>
        </div>
        <button
          onClick={() => router.push('/submissions?sort=score&stage=New,Reviewing')}
          className="rounded-md px-3 py-1.5 transition-all duration-150"
          style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: '13px',
            fontWeight: 600,
            color: '#F0F0F0',
            border: '1px solid rgba(255,255,255,0.1)',
            backgroundColor: 'transparent',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#222';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
        >
          View All
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr
              style={{
                height: '40px',
                borderBottom: '1px solid rgba(255,255,255,0.1)',
              }}
            >
              {['Project', 'Score', 'Stage', '24h Vol', 'Needs Help', 'Action'].map(
                (h) => (
                  <th
                    key={h}
                    className="text-left uppercase"
                    style={{
                      fontFamily: "'Inter', sans-serif",
                      fontSize: '11px',
                      fontWeight: 600,
                      color: '#525252',
                      letterSpacing: '0.04em',
                      padding: '0 16px',
                    }}
                  >
                    {h}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {topTargets.map((t, i) => (
              <motion.tr
                key={t.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 1.0 + i * 0.05, duration: 0.3, ease: EASE }}
                className="transition-colors duration-150 cursor-pointer group"
                style={{
                  height: '52px',
                  borderBottom: '1px solid rgba(255,255,255,0.04)',
                  backgroundColor:
                    i % 2 === 0 ? '#141414' : '#1A1A1A',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#222';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor =
                    i % 2 === 0 ? '#141414' : '#1A1A1A';
                }}
                onClick={() => router.push(`/submissions/${t.id}`)}
              >
                {/* Project */}
                <td style={{ padding: '0 16px' }}>
                  <div className="flex flex-col">
                    <span
                      style={{
                        fontFamily: "'Inter', sans-serif",
                        fontSize: '13px',
                        fontWeight: 600,
                        color: '#F0F0F0',
                      }}
                    >
                      {t.project}
                    </span>
                    {t.project_x && (
                      <a
                        href={`https://x.com/${t.project_x.replace('@', '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-0.5 transition-colors duration-150"
                        style={{
                          fontFamily: "'Inter', sans-serif",
                          fontSize: '12px',
                          color: '#525252',
                          textDecoration: 'none',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.color = '#F5A623';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.color = '#525252';
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {t.project_x}
                        <ExternalLink size={10} />
                      </a>
                    )}
                  </div>
                </td>

                {/* Score */}
                <td style={{ padding: '0 16px' }}>
                  <ScoreBadge
                    score={t.score}
                    breakdown={t.score_breakdown}
                    small
                  />
                </td>

                {/* Stage */}
                <td style={{ padding: '0 16px' }}>
                  <StagePill stage={t.stage} />
                </td>

                {/* 24h Volume */}
                <td style={{ padding: '0 16px' }}>
                  <div className="flex items-center gap-2">
                    {(!!t.token || !!t.contract_address) && <OnchainBadge />}
                    <span
                      style={{
                        fontFamily: "'Inter', sans-serif",
                        fontSize: '13px',
                        color: t.vol_24h != null ? '#F0F0F0' : '#525252',
                      }}
                    >
                      {formatUsd(t.vol_24h)}
                    </span>
                  </div>
                </td>

                {/* Needs Help */}
                <td style={{ padding: '0 16px' }}>
                  <div className="flex items-center gap-1 flex-wrap">
                    {t.needs_help.slice(0, 3).map((tag) => (
                      <span
                        key={tag}
                        className="rounded-md transition-all duration-150"
                        style={{
                          fontFamily: "'Inter', sans-serif",
                          fontSize: '11px',
                          fontWeight: 500,
                          color: '#8A8A8A',
                          backgroundColor: '#222',
                          padding: '3px 8px',
                          border: '1px solid transparent',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor =
                            'rgba(255,255,255,0.1)';
                          e.currentTarget.style.color = '#F0F0F0';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = 'transparent';
                          e.currentTarget.style.color = '#8A8A8A';
                        }}
                      >
                        {tag}
                      </span>
                    ))}
                    {t.needs_help.length > 3 && (
                      <span
                        style={{
                          fontFamily: "'Inter', sans-serif",
                          fontSize: '11px',
                          color: '#525252',
                          fontWeight: 500,
                        }}
                      >
                        +{t.needs_help.length - 3} more
                      </span>
                    )}
                  </div>
                </td>

                {/* Action */}
                <td style={{ padding: '0 16px' }}>
                  <button
                    className="rounded-md px-3 py-1.5 opacity-0 group-hover:opacity-100 transition-all duration-150"
                    style={{
                      fontFamily: "'Inter', sans-serif",
                      fontSize: '12px',
                      fontWeight: 500,
                      color: '#8A8A8A',
                      backgroundColor: 'transparent',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#222';
                      e.currentTarget.style.color = '#F0F0F0';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                      e.currentTarget.style.color = '#8A8A8A';
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      router.push(`/submissions/${t.id}`);
                    }}
                  >
                    View Profile
                  </button>
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </DataCard>
  );
};


export default TopTargetsTable;
