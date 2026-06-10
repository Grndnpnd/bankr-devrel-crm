'use client';
import React, { useState, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { toast, Toaster } from 'sonner';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip as ReTooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  AreaChart,
  Area,
} from 'recharts';
import {
  Sparkles,
  Send,
  StickyNote,
  Mail,
  Phone,
  ArrowRightLeft,
  Search,
} from 'lucide-react';
import DataCard from '@/components/DataCard';
import { activityTypeConfig, computeAnalytics } from '@/data/analytics';
import { stageColors } from '@/data/stats';
import type { ActivityType } from '@/data/analytics';
import { useSubmissionStore } from '@/store/useSubmissionStore';

// ── Animation ─────────────────────────────────────────────────────
const ease = [0.16, 1, 0.3, 1] as [number, number, number, number];

const cardVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, delay: i * 0.08, ease },
  }),
};

// ── Count-up hook ─────────────────────────────────────────────────
function useCountUp(target: number, duration = 1200) {
  const [value, setValue] = useState(0);
  React.useEffect(() => {
    let start = 0;
    const startTime = performance.now();
    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      start = eased * target;
      setValue(start);
      if (progress < 1) requestAnimationFrame(animate);
      else setValue(target);
    };
    requestAnimationFrame(animate);
  }, [target, duration]);
  return value;
}

// ── KPI Card ──────────────────────────────────────────────────────
interface KPICardProps {
  label: string;
  value: string;
  delay: number;
}

const KPICard: React.FC<KPICardProps> = ({ label, value, delay }) => {
  return (
    <motion.div
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      custom={delay}
    >
      <DataCard style={{ padding: '20px 24px' }}>
        <div
          style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: '12px',
            fontWeight: 500,
            color: '#525252',
            letterSpacing: '0.02em',
            marginBottom: '8px',
          }}
        >
          {label}
        </div>
        <div
          style={{
            fontFamily: "'Manrope', sans-serif",
            fontSize: '32px',
            fontWeight: 700,
            color: '#F0F0F0',
            lineHeight: 1.1,
            letterSpacing: '-0.02em',
          }}
        >
          {value}
        </div>
      </DataCard>
    </motion.div>
  );
};

// ── Animated KPI Card with count-up ───────────────────────────────
interface AnimatedKPICardProps {
  label: string;
  numericValue: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  delay: number;
}

const AnimatedKPICard: React.FC<AnimatedKPICardProps> = ({
  label,
  numericValue,
  prefix = '',
  suffix = '',
  decimals = 0,
  delay,
}) => {
  const animated = useCountUp(numericValue);
  const formatted =
    decimals > 0 ? animated.toFixed(decimals) : Math.round(animated).toLocaleString();
  return <KPICard label={label} value={`${prefix}${formatted}${suffix}`} delay={delay} />;
};

// ── Chart Tooltip ─────────────────────────────────────────────────
const ChartTooltipStyle = {
  backgroundColor: '#1A1A1A',
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: '8px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.3), 0 0 1px rgba(255,255,255,0.04)',
  padding: '8px 12px',
  fontFamily: "'Inter', sans-serif",
  fontSize: '12px',
  color: '#F0F0F0',
};

// ── Custom Tooltip Components ─────────────────────────────────────
const TagTooltip: React.FC<{
  active?: boolean;
  payload?: Array<{ name: string; value: number; payload: { tag: string; count: number } }>;
}> = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  const subs = useSubmissionStore((st) => st.submissions);
  const { tagDistribution } = useMemo(() => computeAnalytics(subs), [subs]);
  const total = tagDistribution.reduce((s, t) => s + t.count, 0);
  const pct = ((p.count / total) * 100).toFixed(1);
  return (
    <div style={ChartTooltipStyle}>
      <div style={{ fontWeight: 600 }}>{p.tag}</div>
      <div style={{ color: '#8A8A8A' }}>
        {p.count} submissions ({pct}%)
      </div>
    </div>
  );
};

const FeeTooltip: React.FC<{
  active?: boolean;
  payload?: Array<{ payload: { project: string; fees_24h: number } }>;
}> = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  const subs = useSubmissionStore((st) => st.submissions);
  const { feeLeaders } = useMemo(() => computeAnalytics(subs), [subs]);
  const totalFees = feeLeaders.reduce((s, f) => s + f.fees_24h, 0);
  const pct = ((p.fees_24h / totalFees) * 100).toFixed(1);
  return (
    <div style={ChartTooltipStyle}>
      <div style={{ fontWeight: 600 }}>{p.project}</div>
      <div style={{ color: '#8A8A8A' }}>
        ${Math.round(p.fees_24h).toLocaleString()} ({pct}% of top 10)
      </div>
    </div>
  );
};

const ScoreTooltip: React.FC<{
  active?: boolean;
  payload?: Array<{ payload: { range: string; count: number } }>;
  label?: string;
}> = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={ChartTooltipStyle}>
      <div style={{ fontWeight: 600 }}>Score: {label}</div>
      <div style={{ color: '#8A8A8A' }}>{payload[0].payload.count} projects</div>
    </div>
  );
};

const TimelineTooltip: React.FC<{
  active?: boolean;
  payload?: Array<{ payload: { displayDate: string; count: number; cumulative: number } }>;
  label?: string;
}> = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div style={ChartTooltipStyle}>
      <div style={{ fontWeight: 600 }}>{p.displayDate}</div>
      <div style={{ color: '#8A8A8A' }}>+{p.count} that day</div>
      <div style={{ color: '#F5A623' }}>{p.cumulative} cumulative</div>
    </div>
  );
};

// ── Tag Distribution Donut ────────────────────────────────────────
const DonutChart: React.FC = () => {
  const subs = useSubmissionStore((st) => st.submissions);
  const { tagDistribution } = useMemo(() => computeAnalytics(subs), [subs]);
  return (
    <DataCard title="Needs-Help Tag Distribution" delay={0.1}>
      <ResponsiveContainer width="100%" height={280}>
        <PieChart>
          <Pie
            data={tagDistribution}
            cx="50%"
            cy="45%"
            innerRadius="55%"
            outerRadius="80%"
            paddingAngle={2}
            dataKey="count"
            nameKey="tag"
            stroke="none"
            animationBegin={300}
            animationDuration={800}
            animationEasing="ease-out"
          >
            {tagDistribution.map((entry, i) => (
              <Cell key={i} fill={entry.color} />
            ))}
          </Pie>
          <ReTooltip content={<TagTooltip />} />
        </PieChart>
      </ResponsiveContainer>
      {/* Center text */}
      <div
        className="flex flex-col items-center"
        style={{ marginTop: '-160px', marginBottom: '100px', pointerEvents: 'none' }}
      >
        <span
          style={{
            fontFamily: "'Manrope', sans-serif",
            fontSize: '20px',
            fontWeight: 700,
            color: '#F0F0F0',
          }}
        >
          {tagDistribution.length}
        </span>
        <span style={{ fontSize: '11px', color: '#525252' }}>categories</span>
      </div>
      {/* Legend */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '6px 16px',
          marginTop: '8px',
        }}
      >
        {tagDistribution.map((item) => (
          <div key={item.tag} className="flex items-center gap-2">
            <div
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '2px',
                backgroundColor: item.color,
                flexShrink: 0,
              }}
            />
            <span
              style={{
                fontSize: '12px',
                color: '#8A8A8A',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                flex: 1,
              }}
            >
              {item.tag}
            </span>
            <span
              style={{
                fontSize: '12px',
                color: '#F0F0F0',
                fontWeight: 600,
                flexShrink: 0,
              }}
            >
              {item.count}
            </span>
          </div>
        ))}
      </div>
    </DataCard>
  );
};

// ── Fee Leaders Horizontal Bar ────────────────────────────────────
const FeeLeadersChart: React.FC = () => {
  const subs = useSubmissionStore((st) => st.submissions);
  const { feeLeaders } = useMemo(() => computeAnalytics(subs), [subs]);
  return (
    <DataCard title="Top Projects by 24h Creator Fees" delay={0.18}>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart
          data={feeLeaders}
          layout="vertical"
          margin={{ top: 4, right: 16, bottom: 4, left: 0 }}
          barCategoryGap="20%"
        >
          <CartesianGrid
            strokeDasharray="3 3"
            horizontal={false}
            stroke="rgba(255,255,255,0.06)"
          />
          <XAxis
            type="number"
            tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
            tick={{ fontSize: 11, fill: '#525252', fontFamily: "'Inter', sans-serif" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="project"
            width={100}
            tick={{ fontSize: 12, fill: '#F0F0F0', fontFamily: "'Inter', sans-serif", fontWeight: 500 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: string) => (v.length > 12 ? v.slice(0, 12) + '…' : v)}
          />
          <ReTooltip content={<FeeTooltip />} />
          <Bar
            dataKey="fees_24h"
            fill="#10B981"
            radius={[0, 4, 4, 0]}
            animationBegin={400}
            animationDuration={500}
            animationEasing="ease-out"
          />
        </BarChart>
      </ResponsiveContainer>
    </DataCard>
  );
};

// ── Score Distribution Bar ────────────────────────────────────────
const ScoreDistChart: React.FC = () => {
  const subs = useSubmissionStore((st) => st.submissions);
  const { scoreBuckets } = useMemo(() => computeAnalytics(subs), [subs]);
  return (
    <DataCard title="Score Distribution" delay={0.35}>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart
          data={scoreBuckets}
          margin={{ top: 8, right: 16, bottom: 4, left: 0 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            vertical={false}
            stroke="rgba(255,255,255,0.06)"
          />
          <XAxis
            dataKey="range"
            tick={{ fontSize: 11, fill: '#525252', fontFamily: "'Inter', sans-serif" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: '#525252', fontFamily: "'Inter', sans-serif" }}
            axisLine={false}
            tickLine={false}
          />
          <ReTooltip content={<ScoreTooltip />} />
          <Bar
            dataKey="count"
            fill="#F5A623"
            radius={[4, 4, 0, 0]}
            animationBegin={600}
            animationDuration={500}
            animationEasing="ease-out"
          />
        </BarChart>
      </ResponsiveContainer>
    </DataCard>
  );
};

// ── Submission Trend Area ─────────────────────────────────────────
const SubmissionTrendChart: React.FC = () => {
  const subs = useSubmissionStore((st) => st.submissions);
  const { submissionTimeline } = useMemo(() => computeAnalytics(subs), [subs]);
  return (
    <DataCard title="Submissions Over Time" delay={0.43}>
      <ResponsiveContainer width="100%" height={280}>
        <AreaChart
          data={submissionTimeline}
          margin={{ top: 8, right: 16, bottom: 4, left: 0 }}
        >
          <defs>
            <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#F5A623" stopOpacity={0.25} />
              <stop offset="100%" stopColor="#F5A623" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            vertical={false}
            stroke="rgba(255,255,255,0.06)"
          />
          <XAxis
            dataKey="displayDate"
            tick={{ fontSize: 11, fill: '#525252', fontFamily: "'Inter', sans-serif" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: '#525252', fontFamily: "'Inter', sans-serif" }}
            axisLine={false}
            tickLine={false}
            domain={[0, 'auto']}
          />
          <ReTooltip content={<TimelineTooltip />} />
          <Area
            type="monotone"
            dataKey="cumulative"
            stroke="#F5A623"
            strokeWidth={2}
            fill="url(#areaFill)"
            dot={{ r: 3, fill: '#F5A623', stroke: 'none' }}
            activeDot={{ r: 5, fill: '#F5A623' }}
            animationBegin={700}
            animationDuration={800}
            animationEasing="ease-out"
          />
        </AreaChart>
      </ResponsiveContainer>
    </DataCard>
  );
};

// ── Activity Type Icon ────────────────────────────────────────────
const ActivityIcon: React.FC<{ type: ActivityType }> = ({ type }) => {
  const config = activityTypeConfig[type];
  const iconProps = { size: 12, style: { color: config.color } };
  return (
    <div
      className="flex items-center justify-center rounded-full"
      style={{
        width: '24px',
        height: '24px',
        backgroundColor: config.bg,
      }}
    >
      {type === 'note' && <StickyNote {...iconProps} />}
      {type === 'email' && <Mail {...iconProps} />}
      {type === 'call' && <Phone {...iconProps} />}
      {type === 'stage_change' && <ArrowRightLeft {...iconProps} />}
    </div>
  );
};

// ── Relative Time ─────────────────────────────────────────────────
function relativeTime(dateStr: string): string {
  const now = new Date('2026-06-08T15:00:00');
  const d = new Date(dateStr);
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── Outreach Activity Table ───────────────────────────────────────
const OutreachTable: React.FC = () => {
  const subs = useSubmissionStore((st) => st.submissions);
  const { outreachActivity } = useMemo(() => computeAnalytics(subs), [subs]);
  return (
    <DataCard title="Recent Outreach Activity" delay={0.55}>
      <div style={{ overflowX: 'auto' }}>
        <table className="w-full" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr
              style={{
                height: '40px',
                borderBottom: '1px solid rgba(255,255,255,0.1)',
              }}
            >
              {['Project', 'Type', 'Author', 'Content', 'Date'].map((h) => (
                <th
                  key={h}
                  style={{
                    fontFamily: "'Inter', sans-serif",
                    fontSize: '11px',
                    fontWeight: 600,
                    color: '#525252',
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase' as const,
                    textAlign: 'left',
                    padding: '0 12px',
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {outreachActivity.map((act, i) => (
              <motion.tr
                key={act.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: 0.6 + i * 0.04, ease }}
                className="transition-colors duration-150"
                style={{
                  height: '52px',
                  borderBottom: '1px solid rgba(255,255,255,0.04)',
                  backgroundColor: i % 2 === 0 ? '#141414' : '#1A1A1A',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#222';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor =
                    i % 2 === 0 ? '#141414' : '#1A1A1A';
                }}
              >
                {/* Project */}
                <td style={{ padding: '0 12px' }}>
                  <Link
                    href={`/submissions/${act.submissionId}`}
                    className="block"
                  >
                    <span
                      style={{
                        fontSize: '13px',
                        fontWeight: 500,
                        color: '#F0F0F0',
                      }}
                    >
                      {act.project}
                    </span>
                  </Link>
                </td>
                {/* Type */}
                <td style={{ padding: '0 12px' }}>
                  <div className="flex items-center gap-2">
                    <ActivityIcon type={act.type} />
                    <span
                      style={{
                        fontSize: '12px',
                        color: activityTypeConfig[act.type].color,
                        fontWeight: 500,
                      }}
                    >
                      {activityTypeConfig[act.type].label}
                    </span>
                  </div>
                </td>
                {/* Author */}
                <td style={{ padding: '0 12px' }}>
                  <div className="flex items-center gap-2">
                    <div
                      className="flex items-center justify-center rounded-full"
                      style={{
                        width: '20px',
                        height: '20px',
                        backgroundColor: '#222',
                        border: '1px solid rgba(255,255,255,0.06)',
                        fontSize: '9px',
                        fontWeight: 600,
                        color: '#F5A623',
                      }}
                    >
                      {act.authorInitials}
                    </div>
                    <span style={{ fontSize: '12px', color: '#8A8A8A' }}>
                      {act.author}
                    </span>
                  </div>
                </td>
                {/* Content */}
                <td style={{ padding: '0 12px', maxWidth: '360px' }}>
                  {act.type === 'stage_change' && act.stageFrom && act.stageTo ? (
                    <div className="flex items-center gap-2">
                      <span
                        className="rounded-full"
                        style={{
                          padding: '2px 10px',
                          fontSize: '11px',
                          fontWeight: 600,
                          color: stageColors[act.stageFrom] || '#8A8A8A',
                          backgroundColor: `${stageColors[act.stageFrom]}1F`,
                        }}
                      >
                        {act.stageFrom}
                      </span>
                      <span style={{ color: '#525252', fontSize: '11px' }}>→</span>
                      <span
                        className="rounded-full"
                        style={{
                          padding: '2px 10px',
                          fontSize: '11px',
                          fontWeight: 600,
                          color: stageColors[act.stageTo] || '#8A8A8A',
                          backgroundColor: `${stageColors[act.stageTo]}1F`,
                        }}
                      >
                        {act.stageTo}
                      </span>
                    </div>
                  ) : (
                    <span
                      style={{
                        fontSize: '13px',
                        color: '#8A8A8A',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical' as const,
                        overflow: 'hidden',
                        lineHeight: 1.4,
                      }}
                    >
                      {act.summary}
                    </span>
                  )}
                </td>
                {/* Date */}
                <td style={{ padding: '0 12px' }}>
                  <span
                    style={{
                      fontSize: '12px',
                      color: '#525252',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {relativeTime(act.date)}
                  </span>
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </DataCard>
  );
};

// ── Agent Query Bar ───────────────────────────────────────────────
const exampleQueries = [
  'Top 10 uncontacted by score',
  'Live projects needing fundraising help',
  'Avg score of projects with token launch needs',
];

const AgentQueryBar: React.FC = () => {
  const handleQueryClick = useCallback(() => {
    toast.info('Analytics agent coming in Phase 2', {
      duration: 3000,
      style: {
        backgroundColor: '#1A1A1A',
        border: '1px solid rgba(255,255,255,0.06)',
        color: '#F0F0F0',
      },
    });
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.7, ease }}
      className="rounded-2xl"
      style={{
        background:
          'linear-gradient(135deg, #1A1A1A 0%, #0D0D0D 50%, #1A1A1A 100%)',
        border: '1px solid rgba(245,166,35,0.10)',
        padding: '24px',
      }}
    >
      {/* Header */}
      <div className="flex flex-col items-center text-center mb-5">
        <div
          className="flex items-center justify-center rounded-full mb-3"
          style={{
            width: '40px',
            height: '40px',
            backgroundColor: 'rgba(245,166,35,0.12)',
          }}
        >
          <Sparkles size={24} style={{ color: '#F5A623' }} />
        </div>
        <h3
          style={{
            fontFamily: "'Manrope', sans-serif",
            fontSize: '18px',
            fontWeight: 600,
            color: '#F0F0F0',
            marginBottom: '4px',
          }}
        >
          Ask Your Data
        </h3>
        <p style={{ fontSize: '13px', color: '#8A8A8A' }}>
          Coming soon — Chat with your CRM data using natural language
        </p>
      </div>

      {/* Input */}
      <div className="relative mb-4">
        <div
          className="flex items-center rounded-xl"
          style={{
            height: '48px',
            backgroundColor: '#141414',
            border: '1px solid rgba(255,255,255,0.1)',
            padding: '0 16px',
            gap: '12px',
          }}
        >
          <Search size={16} style={{ color: '#525252', flexShrink: 0 }} />
          <input
            type="text"
            placeholder="Ask questions about your data... (e.g., 'Top uncontacted targets with community growth needs')"
            disabled
            className="flex-1 bg-transparent outline-none"
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: '13px',
              color: '#F0F0F0',
              cursor: 'not-allowed',
            }}
          />
          <button
            disabled
            className="flex items-center justify-center rounded-lg"
            style={{
              width: '32px',
              height: '32px',
              backgroundColor: 'rgba(245,166,35,0.2)',
              cursor: 'not-allowed',
            }}
          >
            <Send size={14} style={{ color: '#525252' }} />
          </button>
        </div>
        {/* Coming soon badge */}
        <div
          className="absolute rounded-full"
          style={{
            top: '-8px',
            right: '12px',
            padding: '1px 8px',
            fontSize: '10px',
            fontWeight: 600,
            color: '#F5A623',
            backgroundColor: '#1A1A1A',
            border: '1px solid rgba(245,166,35,0.2)',
            letterSpacing: '0.02em',
          }}
        >
          Coming soon
        </div>
      </div>

      {/* Example queries */}
      <div className="flex flex-wrap justify-center gap-2">
        {exampleQueries.map((q) => (
          <button
            key={q}
            onClick={handleQueryClick}
            className="rounded-full transition-all duration-200"
            style={{
              padding: '6px 14px',
              fontSize: '12px',
              color: '#8A8A8A',
              backgroundColor: '#222',
              border: '1px solid transparent',
              fontFamily: "'Inter', sans-serif",
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
              e.currentTarget.style.color = '#F0F0F0';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'transparent';
              e.currentTarget.style.color = '#8A8A8A';
            }}
          >
            {q}
          </button>
        ))}
      </div>
    </motion.div>
  );
};

// ── Main Analytics Page ───────────────────────────────────────────
const Analytics: React.FC = () => {
  const subs = useSubmissionStore((st) => st.submissions);
  const { analyticsStats } = useMemo(() => computeAnalytics(subs), [subs]);
  return (
    <div className="flex flex-col gap-6">
      {/* KPI Cards Row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '16px',
        }}
      >
        <AnimatedKPICard
          label="Total Submissions"
          numericValue={analyticsStats.totalSubmissions}
          delay={0}
        />
        <AnimatedKPICard
          label="Live Projects"
          numericValue={analyticsStats.liveProjects}
          delay={0.06}
        />
        <AnimatedKPICard
          label="Total 24h Fees"
          numericValue={analyticsStats.totalFees24h}
          prefix="$"
          delay={0.12}
        />
        <AnimatedKPICard
          label="Avg Score"
          numericValue={analyticsStats.avgScore}
          decimals={1}
          delay={0.18}
        />
      </div>

      {/* Charts Row 1: Donut + Fee Leaders */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '16px',
        }}
      >
        <DonutChart />
        <FeeLeadersChart />
      </div>

      {/* Charts Row 2: Score Dist + Trend */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '16px',
        }}
      >
        <ScoreDistChart />
        <SubmissionTrendChart />
      </div>

      {/* Outreach Activity Table */}
      <OutreachTable />

      {/* Agent Query Bar */}
      <AgentQueryBar />

      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: '#1A1A1A',
            border: '1px solid rgba(255,255,255,0.06)',
            color: '#F0F0F0',
          },
        }}
      />
    </div>
  );
};

export default Analytics;
