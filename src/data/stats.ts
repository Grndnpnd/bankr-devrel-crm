import type { Submission } from '@/types';

/* ── Pure helpers (no data dependency) ── */
export const scoreColor = (score: number): string => {
  if (score <= 30) return '#EF4444';
  if (score <= 60) return '#F59E0B';
  if (score <= 80) return '#10B981';
  return '#34D399';
};

export const formatFees = (fees: number | null): string => {
  if (fees === null || fees === undefined) return '\u2014';
  return `$${Math.round(fees).toLocaleString()}`;
};

export const breakdownLabels: Record<string, string> = {
  fees: 'Onchain',
  launched: 'Launched',
  traction: 'Traction',
  founder: 'Founder',
  completeness: 'Effort',
};

export const stageOrder = ['New', 'Reviewing', 'Contacted', 'In Convo', 'Onboarding', 'Won', 'Passed'];

export const stageColors: Record<string, string> = {
  New: '#64748B',
  Reviewing: '#3B82F6',
  Contacted: '#F59E0B',
  'In Convo': '#8B5CF6',
  Onboarding: '#14B8A6',
  Won: '#10B981',
  Passed: '#6B7280',
};

/* ── Derived stats computed from live submissions ── */
export interface DashboardStats {
  totalCount: number;
  liveCount: number;
  totalFees: number;
  averageScore: number;
  newThisWeek: number;
  scoreDistribution: { range: string; label: string; min: number; max: number; count: number }[];
  pipelineStages: { stage: string; count: number; color: string }[];
  topTargets: Submission[];
  needsHelpDistribution: Record<string, number>;
}

export function computeStats(submissions: Submission[]): DashboardStats {
  const totalCount = submissions.length;
  const liveCount = submissions.filter((s) => s.fees_24h !== null).length;
  const totalFees = Math.round(submissions.reduce((sum, s) => sum + (s.fees_24h || 0), 0));
  const averageScore = totalCount
    ? Math.round((submissions.reduce((sum, s) => sum + s.score, 0) / totalCount) * 10) / 10
    : 0;

  const weekAgo = Date.now() - 7 * 86400000;
  const newThisWeek = submissions.filter((s) => {
    const t = Date.parse((s.submitted_at || '').split('.')[0].replace(' ', 'T'));
    return Number.isFinite(t) && t >= weekAgo;
  }).length;

  const scoreDistribution = [
    { range: '0–20', label: '0–20', min: 0, max: 20, count: 0 },
    { range: '21–40', label: '21–40', min: 21, max: 40, count: 0 },
    { range: '41–60', label: '41–60', min: 41, max: 60, count: 0 },
    { range: '61–80', label: '61–80', min: 61, max: 80, count: 0 },
    { range: '81–100', label: '81–100', min: 81, max: 100, count: 0 },
  ];
  submissions.forEach((s) => {
    const bucket = scoreDistribution.find((b) => s.score >= b.min && s.score <= b.max);
    if (bucket) bucket.count++;
  });

  const pipelineStages = stageOrder.map((stage) => ({
    stage,
    count: submissions.filter((s) => s.stage === stage).length,
    color: stageColors[stage],
  }));

  const topTargets = submissions
    .filter((s) => ['New', 'Reviewing'].includes(s.stage))
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  const needsHelpDistribution: Record<string, number> = {};
  submissions.forEach((s) => {
    s.needs_help.forEach((tag) => {
      needsHelpDistribution[tag] = (needsHelpDistribution[tag] || 0) + 1;
    });
  });

  return { totalCount, liveCount, totalFees, averageScore, newThisWeek, scoreDistribution, pipelineStages, topTargets, needsHelpDistribution };
}
