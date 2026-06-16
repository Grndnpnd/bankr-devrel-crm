'use client';
import React, { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  Inbox,
  Zap,
  TrendingUp,
  Target,
  Download,
  Link,
  Plus,
  ExternalLink,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import DataCard from '@/components/DataCard';
import ScoreBadge from '@/components/ScoreBadge';
import StagePill from '@/components/StagePill';
import OnchainBadge from '@/components/OnchainBadge';
import { scoreColor, formatUsd, computeStats } from '@/data/stats';
import { useSubmissionStore, applyDrilldownFilter } from '@/store/useSubmissionStore';

const EASE = [0.16, 1, 0.3, 1] as [number, number, number, number];

/* ─── Count-up number ─── */
const AnimatedNumber: React.FC<{
  value: number;
  duration?: number;
  delay?: number;
  prefix?: string;
  suffix?: string;
  color?: string;
}> = ({ value, duration = 800, delay = 0, prefix = '', suffix = '', color }) => {
  const [display, setDisplay] = React.useState(0);

  React.useEffect(() => {
    const start = performance.now() + delay;
    const animate = (now: number) => {
      const elapsed = now - start;
      if (elapsed < 0) {
        requestAnimationFrame(animate);
        return;
      }
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(eased * value));
      if (progress < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, [value, duration, delay]);

  return (
    <span style={{ color }}>
      {prefix}
      {display.toLocaleString()}
      {suffix}
    </span>
  );
};

/* ─── KPI Strip ─── */
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

/* ─── Score Distribution Bar Chart ─── */
const ScoreDistributionChart: React.FC = () => {
  const subs = useSubmissionStore((st) => st.submissions);
  const { scoreDistribution, totalCount } = useMemo(() => computeStats(subs), [subs]);
  const router = useRouter();
  const drillScore = (min: number, max: number) => {
    applyDrilldownFilter({ scoreMin: min, scoreMax: max });
    router.push('/submissions');
  };
  const data = useMemo(() => {
    return scoreDistribution.map((bucket) => ({
      ...bucket,
      percentage: totalCount ? ((bucket.count / totalCount) * 100).toFixed(1) : '0',
    }));
  }, [scoreDistribution, totalCount]);

  return (
    <DataCard title="Score Distribution" delay={0.5}>
      <div style={{ width: '100%', height: '320px' }}>
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(255,255,255,0.04)"
              vertical={false}
            />
            <XAxis
              dataKey="label"
              tick={{ fill: '#525252', fontSize: 11, fontFamily: "'Inter', sans-serif" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: '#525252', fontSize: 11, fontFamily: "'Inter', sans-serif" }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1A1A1A',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: '8px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.3), 0 0 1px rgba(255,255,255,0.04)',
                fontFamily: "'Inter', sans-serif",
                fontSize: '12px',
                color: '#F0F0F0',
              }}
              formatter={(value: number, _name: string, props: any) => [
                `${value} submissions (${props.payload.percentage}%)`,
                'Count',
              ]}
              labelFormatter={(label: string) => `Score range: ${label}`}
            />
            <Bar dataKey="count" radius={[4, 4, 0, 0]}>
              {data.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill="#F5A623"
                  cursor="pointer"
                  onClick={() => drillScore(entry.min, entry.max)}
                  style={{
                    filter:
                      entry.label === '61–80' || entry.label === '81–100'
                        ? 'drop-shadow(0 0 6px rgba(245,166,35,0.3))'
                        : 'none',
                    transition: 'all 200ms ease',
                  }}
                  onMouseEnter={(e: any) => {
                    e.target.style.fill = '#E8941A';
                  }}
                  onMouseLeave={(e: any) => {
                    e.target.style.fill = '#F5A623';
                  }}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </DataCard>
  );
};

/* ─── Pipeline Funnel (Donut + List) ─── */
const PipelineFunnel: React.FC = () => {
  const subs = useSubmissionStore((st) => st.submissions);
  const { pipelineStages } = useMemo(() => computeStats(subs), [subs]);
  const total = pipelineStages.reduce((sum, s) => sum + s.count, 0);
  const maxCount = Math.max(...pipelineStages.map((s) => s.count), 1);
  const router = useRouter();
  const drillStage = (stage: string) => {
    applyDrilldownFilter({ stage: [stage] });
    router.push('/submissions');
  };

  return (
    <DataCard title="Pipeline" delay={0.58}>
      {/* Donut chart */}
      <div style={{ width: '100%', height: '160px' }} className="relative">
        <ResponsiveContainer>
          <PieChart>
            <Pie
              data={pipelineStages}
              cx="50%"
              cy="50%"
              innerRadius="55%"
              outerRadius="80%"
              dataKey="count"
              nameKey="stage"
              animationBegin={700}
              animationDuration={800}
              animationEasing="ease-out"
              stroke="none"
            >
              {pipelineStages.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} cursor="pointer" onClick={() => drillStage(entry.stage)} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: '#1A1A1A',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: '8px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                fontFamily: "'Inter', sans-serif",
                fontSize: '12px',
                color: '#F0F0F0',
              }}
              formatter={(value: number, name: string) => {
                const pct = total ? ((value / total) * 100).toFixed(1) : '0';
                return [`${value} (${pct}%)`, name];
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        {/* Center text */}
        <div
          className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"
        >
          <span
            style={{
              fontFamily: "'Manrope', sans-serif",
              fontSize: '24px',
              fontWeight: 700,
              color: '#F0F0F0',
              lineHeight: 1,
            }}
          >
            {total}
          </span>
          <span
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: '11px',
              color: '#525252',
              marginTop: '2px',
            }}
          >
            submissions
          </span>
        </div>
      </div>

      {/* Stage list */}
      <div className="flex flex-col gap-1 mt-3">
        {pipelineStages.map((stage, i) => (
          <motion.div
            key={stage.stage}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 1.0 + i * 0.05, duration: 0.3, ease: EASE }}
            className="flex items-center gap-3"
            style={{ height: '36px', cursor: 'pointer' }}
            onClick={() => drillStage(stage.stage)}
            title={`View ${stage.count} ${stage.stage} projects`}
          >
            <StagePill stage={stage.stage} />
            <div
              className="flex-1 rounded-full overflow-hidden"
              style={{
                height: '4px',
                backgroundColor: 'rgba(255,255,255,0.04)',
              }}
            >
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${(stage.count / maxCount) * 100}%` }}
                transition={{ delay: 1.1 + i * 0.05, duration: 0.4, ease: EASE }}
                className="h-full rounded-full"
                style={{ backgroundColor: stage.color }}
              />
            </div>
            <span
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: '13px',
                color: '#F0F0F0',
                minWidth: '28px',
                textAlign: 'right',
              }}
            >
              {stage.count}
            </span>
          </motion.div>
        ))}
      </div>
    </DataCard>
  );
};

/* ─── Top Targets Table ─── */
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

/* ─── Quick Actions ─── */
const QuickActions: React.FC = () => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 1.2, duration: 0.3, ease: EASE }}
      className="flex items-center justify-center gap-3"
      style={{ height: '48px', marginTop: '24px' }}
    >
      <button
        className="flex items-center gap-2 rounded-md px-4 py-2 transition-all duration-150"
        style={{
          fontFamily: "'Inter', sans-serif",
          fontSize: '13px',
          fontWeight: 600,
          color: '#0D0D0D',
          backgroundColor: '#F5A623',
          letterSpacing: '0.01em',
          border: 'none',
          cursor: 'pointer',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = '#E8941A';
          e.currentTarget.style.boxShadow = '0 0 20px rgba(245,166,35,0.15)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = '#F5A623';
          e.currentTarget.style.boxShadow = 'none';
        }}
        title="Import from Google Sheets"
      >
        <Download size={16} />
        Import from Google Sheets
      </button>

      <button
        className="flex items-center gap-2 rounded-md px-4 py-2 transition-all duration-150"
        style={{
          fontFamily: "'Inter', sans-serif",
          fontSize: '13px',
          fontWeight: 600,
          color: '#F0F0F0',
          backgroundColor: 'transparent',
          letterSpacing: '0.01em',
          border: '1px solid rgba(255,255,255,0.1)',
          cursor: 'not-allowed',
          opacity: 0.5,
        }}
        title="Coming soon — Plain form expansion in progress"
        disabled
      >
        <Link size={16} />
        Connect Plain API
      </button>

      <button
        className="flex items-center gap-2 rounded-md px-4 py-2 transition-all duration-150"
        style={{
          fontFamily: "'Inter', sans-serif",
          fontSize: '13px',
          fontWeight: 600,
          color: '#F0F0F0',
          backgroundColor: 'transparent',
          letterSpacing: '0.01em',
          border: '1px solid rgba(255,255,255,0.1)',
          cursor: 'pointer',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = '#222';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'transparent';
        }}
        title="Add Submission Manually"
      >
        <Plus size={16} />
        Add Submission Manually
      </button>
    </motion.div>
  );
};

/* ─── Dashboard Page ─── */
const Dashboard: React.FC = () => {
  return (
    <div>
      <KPIStrip />

      {/* Charts Row */}
      <div
        className="grid gap-4 mb-6"
        style={{ gridTemplateColumns: '55% 45%' }}
      >
        <ScoreDistributionChart />
        <PipelineFunnel />
      </div>

      {/* Top Targets Table */}
      <TopTargetsTable />

      {/* Quick Actions */}
      <QuickActions />
    </div>
  );
};

export default Dashboard;
