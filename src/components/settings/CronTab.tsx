'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { Clock, Play, Trash2, Plus, Loader2, CheckCircle2, AlertCircle, Copy } from 'lucide-react';
import { toast } from 'sonner';

interface CronJob {
  id: string;
  name: string;
  type: string;
  schedule: string;
  enabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastStatus: string | null;
  lastError: string | null;
  protected?: boolean;
}
interface JobType { type: string; label: string; description: string }

const PRESETS = [
  { value: '15m', label: 'Every 15 minutes' },
  { value: '30m', label: 'Every 30 minutes' },
  { value: 'hourly', label: 'Hourly' },
  { value: '6h', label: 'Every 6 hours' },
  { value: '12h', label: 'Every 12 hours' },
  { value: 'daily', label: 'Daily' },
  { value: '__cron__', label: 'Custom cron expression…' },
];

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : '—');

const CronTab: React.FC = () => {
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [types, setTypes] = useState<JobType[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  // create form
  const [name, setName] = useState('');
  const [type, setType] = useState('');
  const [preset, setPreset] = useState('hourly');
  const [cronExpr, setCronExpr] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/cron/jobs');
      if (!res.ok) return;
      const data = await res.json();
      setJobs(data.jobs || []);
      setTypes(data.types || []);
      if (!type && data.types?.[0]) setType(data.types[0].type);
    } finally { setLoading(false); }
  }, [type]);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!name.trim() || !type) { toast.error('Name and type required'); return; }
    const schedule = preset === '__cron__' ? cronExpr.trim() : preset;
    if (!schedule) { toast.error('Enter a schedule'); return; }
    setCreating(true);
    try {
      const res = await fetch('/api/cron/jobs', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), type, schedule }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data?.error || 'Could not create job'); return; }
      toast.success('Job created');
      setName(''); setCronExpr('');
      load();
    } finally { setCreating(false); }
  };

  const toggle = async (job: CronJob) => {
    await fetch(`/api/cron/jobs/${job.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !job.enabled }),
    });
    load();
  };

  const runNow = async (job: CronJob) => {
    setBusyId(job.id);
    try {
      const res = await fetch(`/api/cron/jobs/${job.id}`, { method: 'POST' });
      const data = await res.json();
      if (data.ok) toast.success(`${job.name} ran`, { description: 'See last result below.' });
      else toast.error(`${job.name} failed`, { description: data?.error });
      load();
    } finally { setBusyId(null); }
  };

  const remove = async (job: CronJob) => {
    await fetch(`/api/cron/jobs/${job.id}`, { method: 'DELETE' });
    load();
  };

  const tickUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/api/cron/tick?secret=YOUR_CRON_SECRET`
    : '/api/cron/tick?secret=YOUR_CRON_SECRET';

  if (loading) return <div style={{ color: '#525252', fontSize: 13, padding: 20 }}>Loading…</div>;

  return (
    <div style={{ maxWidth: 760 }}>
      <h2 style={{ fontFamily: "'Manrope', sans-serif", fontSize: 18, fontWeight: 700, color: '#F0F0F0', marginBottom: 4 }}>Automation</h2>
      <p style={{ fontSize: 13, color: '#8A8A8A', marginBottom: 20 }}>
        Scheduled jobs that keep data fresh. An external pinger calls the tick endpoint on a heartbeat; due jobs run automatically.
      </p>

      {/* Create */}
      <div className="rounded-xl" style={{ backgroundColor: '#1A1A1A', border: '1px solid rgba(255,255,255,0.06)', padding: 18, marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#F0F0F0', marginBottom: 12 }}>New job</div>
        <div className="flex flex-col gap-2.5">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Job name (e.g. Hourly onchain refresh)"
            style={inputStyle} />
          <select value={type} onChange={(e) => setType(e.target.value)} style={inputStyle}>
            {types.map((t) => <option key={t.type} value={t.type}>{t.label}</option>)}
          </select>
          {types.find((t) => t.type === type) && (
            <p style={{ fontSize: 11, color: '#525252', marginTop: -4 }}>{types.find((t) => t.type === type)!.description}</p>
          )}
          <select value={preset} onChange={(e) => setPreset(e.target.value)} style={inputStyle}>
            {PRESETS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          {preset === '__cron__' && (
            <input value={cronExpr} onChange={(e) => setCronExpr(e.target.value)} placeholder="Cron expression, e.g. 0 */2 * * *"
              style={{ ...inputStyle, fontFamily: 'ui-monospace, monospace' }} />
          )}
          <button onClick={create} disabled={creating} className="inline-flex items-center justify-center gap-1.5 rounded-md"
            style={{ height: 38, fontSize: 13, fontWeight: 600, backgroundColor: '#F5A623', color: '#0D0D0D', marginTop: 4 }}>
            {creating ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} Create job
          </button>
        </div>
      </div>

      {/* Jobs list */}
      {jobs.length === 0 ? (
        <div style={{ color: '#525252', fontSize: 13, padding: '12px 0' }}>No jobs yet. Create one above.</div>
      ) : (
        <div className="flex flex-col gap-2.5" style={{ marginBottom: 20 }}>
          {jobs.map((job) => (
            <div key={job.id} className="rounded-xl" style={{ backgroundColor: '#1A1A1A', border: '1px solid rgba(255,255,255,0.06)', padding: 16 }}>
              <div className="flex items-start justify-between">
                <div style={{ flex: 1 }}>
                  <div className="flex items-center gap-2">
                    <span style={{ fontSize: 14, fontWeight: 600, color: '#F0F0F0' }}>{job.name}</span>
                    {job.protected && (
                      <span title="Core system job — always running, can't be deleted"
                        style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', padding: '2px 6px', borderRadius: 4, backgroundColor: 'rgba(245,166,35,0.14)', color: '#F5A623' }}>
                        Core
                      </span>
                    )}
                    {job.lastStatus === 'ok' && <CheckCircle2 size={14} style={{ color: '#10B981' }} />}
                    {job.lastStatus === 'error' && <AlertCircle size={14} style={{ color: '#EF4444' }} />}
                    {job.lastStatus === 'running' && <Loader2 size={14} className="animate-spin" style={{ color: '#F5A623' }} />}
                  </div>
                  <div style={{ fontSize: 11.5, color: '#8A8A8A', marginTop: 4 }}>
                    {job.type} · <code style={{ color: '#C9C9C9' }}>{job.schedule}</code> · next {fmt(job.nextRunAt)}
                  </div>
                  <div style={{ fontSize: 11, color: '#525252', marginTop: 2 }}>
                    last run {fmt(job.lastRunAt)}{job.lastError ? ` · error: ${job.lastError}` : ''}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => runNow(job)} disabled={busyId === job.id} title="Run now"
                    className="flex items-center justify-center rounded-md" style={{ width: 30, height: 30, color: '#F5A623', border: '1px solid rgba(245,166,35,0.3)' }}>
                    {busyId === job.id ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                  </button>
                  <button onClick={() => toggle(job)} title={job.enabled ? 'Disable' : 'Enable'}
                    className="rounded-md" style={{ height: 30, padding: '0 10px', fontSize: 11.5, fontWeight: 600,
                      backgroundColor: job.enabled ? 'rgba(16,185,129,0.14)' : 'transparent',
                      border: job.enabled ? '1px solid rgba(16,185,129,0.35)' : '1px solid rgba(255,255,255,0.12)',
                      color: job.enabled ? '#10B981' : '#8A8A8A' }}>
                    {job.enabled ? 'Enabled' : 'Disabled'}
                  </button>
                  {!job.protected && (
                    <button onClick={() => remove(job)} title="Delete"
                      className="flex items-center justify-center rounded-md" style={{ width: 30, height: 30, color: '#525252', border: '1px solid rgba(255,255,255,0.1)' }}>
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pinger setup */}
      <div className="rounded-xl" style={{ backgroundColor: '#141414', border: '1px dashed rgba(255,255,255,0.12)', padding: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#C9C9C9', marginBottom: 6 }}>Heartbeat setup</div>
        <p style={{ fontSize: 12, color: '#8A8A8A', lineHeight: 1.5, marginBottom: 10 }}>
          Point an external scheduler (cron-job.org, a GitHub Actions schedule, Upstash QStash, etc.) at this URL every 5 minutes. It triggers any jobs that are due. Set <code style={{ color: '#C9C9C9' }}>CRON_SECRET</code> in your environment and use it below.
        </p>
        <div className="flex items-center gap-2 rounded-md" style={{ backgroundColor: '#0D0D0D', border: '1px solid rgba(255,255,255,0.08)', padding: '8px 10px' }}>
          <code style={{ flex: 1, fontSize: 11.5, color: '#C9C9C9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tickUrl}</code>
          <button onClick={() => { navigator.clipboard?.writeText(tickUrl); toast.success('Copied'); }}
            className="flex items-center justify-center rounded" style={{ width: 26, height: 26, color: '#8A8A8A' }}>
            <Copy size={13} />
          </button>
        </div>
      </div>
    </div>
  );
};

const inputStyle: React.CSSProperties = {
  height: 38, padding: '0 12px', fontSize: 13, color: '#F0F0F0',
  backgroundColor: '#0D0D0D', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, outline: 'none', width: '100%',
};

export default CronTab;
