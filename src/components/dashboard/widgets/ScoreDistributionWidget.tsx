'use client';
import React, { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import DataCard from '@/components/DataCard';
import { computeStats } from '@/data/stats';
import { useSubmissionStore, applyDrilldownFilter } from '@/store/useSubmissionStore';

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


export default ScoreDistributionChart;
