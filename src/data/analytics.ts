import type { Submission } from '@/types';

export interface TagDistributionItem { tag: string; count: number; color: string }
export interface VolumeLeader { project: string; vol_24h: number }
export interface ScoreBucket { range: string; count: number }
export interface TimelinePoint { date: string; displayDate: string; count: number; cumulative: number }

export type ActivityType = 'note' | 'email' | 'call' | 'stage_change';

export interface OutreachActivity {
  id: string;
  type: ActivityType;
  submissionId: string;
  project: string;
  author: string;
  authorInitials: string;
  date: string;
  summary: string;
  stageFrom?: string;
  stageTo?: string;
}

const TAG_COLORS: Record<string, string> = {
  'Community growth': '#F5A623',
  'Partnerships': '#3B82F6',
  'GTM / distribution': '#8B5CF6',
  'Fundraising': '#14B8A6',
  'Product strategy': '#F59E0B',
  'Token launch strategy': '#EC4899',
  'Technical architecture': '#10B981',
  'Security': '#EF4444',
  'Other': '#6B7280',
  'Hiring': '#525252',
};

export const activityTypeConfig: Record<string, { label: string; color: string; bg: string }> = {
  note: { label: 'Note', color: '#8B5CF6', bg: 'rgba(139,92,246,0.12)' },
  dm: { label: 'DM', color: '#8B5CF6', bg: 'rgba(139,92,246,0.12)' },
  email: { label: 'Email', color: '#3B82F6', bg: 'rgba(59,130,246,0.12)' },
  call: { label: 'Call', color: '#10B981', bg: 'rgba(16,185,129,0.12)' },
  meeting: { label: 'Meeting', color: '#10B981', bg: 'rgba(16,185,129,0.12)' },
  stage_change: { label: 'Stage Change', color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
  system: { label: 'System', color: '#6B7280', bg: 'rgba(107,114,128,0.12)' },
};

const initialsOf = (name: string) =>
  name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '?';

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[d.getMonth()]} ${d.getDate()}`;
}

export interface AnalyticsBundle {
  tagDistribution: TagDistributionItem[];
  volumeLeaders: VolumeLeader[];
  scoreBuckets: ScoreBucket[];
  submissionTimeline: TimelinePoint[];
  outreachActivity: OutreachActivity[];
  analyticsStats: { totalSubmissions: number; liveProjects: number; totalVolume24h: number; avgScore: number };
}

export function computeAnalytics(submissions: Submission[]): AnalyticsBundle {
  const tagCounts: Record<string, number> = {};
  submissions.forEach((s) => s.needs_help.forEach((tag) => { tagCounts[tag] = (tagCounts[tag] || 0) + 1; }));
  const tagDistribution = Object.entries(tagCounts)
    .map(([tag, count]) => ({ tag, count, color: TAG_COLORS[tag] || '#6B7280' }))
    .sort((a, b) => b.count - a.count);

  const volumeLeaders = submissions
    .filter((s) => s.vol_24h != null)
    .sort((a, b) => (b.vol_24h || 0) - (a.vol_24h || 0))
    .slice(0, 10)
    .map((s) => ({ project: s.project, vol_24h: s.vol_24h || 0 }));

  const scoreBuckets: ScoreBucket[] = [
    { range: '0–20', count: 0 }, { range: '21–40', count: 0 }, { range: '41–60', count: 0 },
    { range: '61–80', count: 0 }, { range: '81–100', count: 0 },
  ];
  submissions.forEach((s) => {
    if (s.score <= 20) scoreBuckets[0].count++;
    else if (s.score <= 40) scoreBuckets[1].count++;
    else if (s.score <= 60) scoreBuckets[2].count++;
    else if (s.score <= 80) scoreBuckets[3].count++;
    else scoreBuckets[4].count++;
  });

  const dateCounts: Record<string, number> = {};
  const allDates: string[] = [];
  submissions.forEach((s) => {
    const datePart = (s.submitted_at || '').split(' ')[0].split('T')[0];
    if (!datePart) return;
    if (!(datePart in dateCounts)) { dateCounts[datePart] = 0; allDates.push(datePart); }
    dateCounts[datePart]++;
  });
  allDates.sort();
  let submissionTimeline: TimelinePoint[] = [];
  if (allDates.length) {
    const firstDate = new Date(allDates[0]);
    const lastDate = new Date(allDates[allDates.length - 1]);
    const dateRange: string[] = [];
    for (let d = new Date(firstDate); d <= lastDate; d.setDate(d.getDate() + 1)) {
      dateRange.push(d.toISOString().split('T')[0]);
    }
    let cumulative = 0;
    submissionTimeline = dateRange.map((date) => {
      const count = dateCounts[date] || 0;
      cumulative += count;
      return { date, displayDate: formatDateLabel(date), count, cumulative };
    });
  }

  // Recent outreach feed derived from real activity logs (empty until the team logs outreach).
  const outreachActivity: OutreachActivity[] = submissions
    .flatMap((s) =>
      (s.outreach || [])
        .filter((a) => a.type !== 'system')
        .map((a) => ({
          id: a.id,
          type: (['note', 'email', 'call', 'stage_change'].includes(a.type) ? a.type : 'note') as ActivityType,
          submissionId: s.id,
          project: s.project,
          author: a.author,
          authorInitials: initialsOf(a.author),
          date: a.timestamp,
          summary: a.content,
        }))
    )
    .sort((a, b) => +new Date(b.date) - +new Date(a.date))
    .slice(0, 12);

  const analyticsStats = {
    totalSubmissions: submissions.length,
    liveProjects: submissions.filter((s) => (!!s.token && s.token.trim() !== '') || !!s.contract_address).length,
    totalVolume24h: Math.round(submissions.reduce((sum, s) => sum + (s.vol_24h || 0), 0)),
    avgScore: submissions.length
      ? Math.round((submissions.reduce((sum, s) => sum + s.score, 0) / submissions.length) * 10) / 10
      : 0,
  };

  return { tagDistribution, volumeLeaders, scoreBuckets, submissionTimeline, outreachActivity, analyticsStats };
}
