'use client';
import React, { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import DataCard from '@/components/DataCard';
import StagePill from '@/components/StagePill';
import { computeStats } from '@/data/stats';
import { useSubmissionStore, applyDrilldownFilter } from '@/store/useSubmissionStore';
import { EASE } from './_shared';

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


export default PipelineFunnel;
