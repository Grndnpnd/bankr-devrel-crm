'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Play, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import DataCard from '@/components/DataCard';

interface CoreJob {
  type: string;
  name: string;
  intervalLabel: string;
  lastRunAt: string | null;
  lastStatus: string | null;
  lastError: string | null;
}

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : 'never');

const CoreRefreshTab: React.FC = () => {
  const [jobs, setJobs] = useState<CoreJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyType, setBusyType] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/cron/core');
      if (!res.ok) return;
      const data = await res.json();
      setJobs(data.jobs || []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const runNow = async (job: CoreJob) => {
    setBusyType(job.type);
    try {
      const res = await fetch('/api/cron/core', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: job.type }),
      });
      const data = await res.json();
      if (data.ok) toast.success(`${job.name} ran`, { description: 'Data refreshed.' });
      else toast.error(`${job.name} failed`, { description: data?.error });
      load();
    } finally { setBusyType(null); }
  };

  if (loading) return <div style={{ color: '#525252', fontSize: 13, padding: 20 }}>Loading…</div>;

  return (
    <div style={{ maxWidth: 720 }}>
      <DataCard delay={0}>
        <div className="flex items-center gap-3 mb-1">
          <div className="flex items-center justify-center rounded-lg" style={{ width: 40, height: 40, backgroundColor: 'rgba(245,166,35,0.12)' }}>
            <RefreshCw size={20} style={{ color: '#F5A623' }} />
          </div>
          <div>
            <h3 style={{ fontFamily: "'Manrope', sans-serif", fontSize: 16, fontWeight: 600, color: '#F0F0F0' }}>Core Data Refresh</h3>
            <p style={{ fontSize: 12, color: '#8A8A8A' }}>Always-on system jobs that keep the CRM fed. Run on fixed schedules — not editable or deletable.</p>
          </div>
        </div>

        <div className="flex flex-col gap-2.5" style={{ marginTop: 16 }}>
          {jobs.map((job) => (
            <div key={job.type} className="rounded-lg" style={{ backgroundColor: '#141414', border: '1px solid rgba(255,255,255,0.06)', padding: 14 }}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span style={{ fontSize: 14, fontWeight: 600, color: '#F0F0F0' }}>{job.name}</span>
                    {job.lastStatus === 'ok' && <CheckCircle2 size={14} style={{ color: '#10B981' }} />}
                    {job.lastStatus === 'error' && <AlertCircle size={14} style={{ color: '#EF4444' }} />}
                    {job.lastStatus === 'running' && <Loader2 size={14} className="animate-spin" style={{ color: '#F5A623' }} />}
                  </div>
                  <div style={{ fontSize: 11.5, color: '#8A8A8A', marginTop: 4 }}>
                    every {job.intervalLabel} · last run {fmt(job.lastRunAt)}
                    {job.lastError ? ` · error: ${job.lastError}` : ''}
                  </div>
                </div>
                <button onClick={() => runNow(job)} disabled={busyType === job.type}
                  className="inline-flex items-center gap-1.5 rounded-md" style={{ height: 32, padding: '0 12px', fontSize: 12.5, fontWeight: 600, color: '#F5A623', border: '1px solid rgba(245,166,35,0.3)' }}>
                  {busyType === job.type ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />} Run now
                </button>
              </div>
            </div>
          ))}
        </div>
      </DataCard>
    </div>
  );
};

export default CoreRefreshTab;
