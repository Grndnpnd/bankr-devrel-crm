'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { Slack, Check, Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';
import DataCard from '@/components/DataCard';

const isWebhook = (s: string) => /^https:\/\/hooks\.slack\.com\//.test(s.trim());

const SlackTab: React.FC = () => {
  const [userWebhook, setUserWebhook] = useState('');
  const [teamWebhook, setTeamWebhook] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<'user' | 'team' | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/slack/config');
      if (!res.ok) return;
      const d = await res.json();
      setUserWebhook(d.userWebhook || '');
      setTeamWebhook(d.teamWebhook || '');
      setIsAdmin(!!d.isAdmin);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async (payload: Record<string, unknown>, label: string) => {
    setSaving(true);
    try {
      const res = await fetch('/api/slack/config', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const d = await res.json();
      if (res.ok) toast.success(`${label} saved`);
      else toast.error(d?.error || 'Could not save');
    } finally { setSaving(false); }
  };

  const test = async (url: string, which: 'user' | 'team') => {
    if (!isWebhook(url)) { toast.error('Enter a valid Slack webhook URL first'); return; }
    setTesting(which);
    try {
      const res = await fetch('/api/slack/config', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ test: url }),
      });
      const d = await res.json();
      if (res.ok && d.ok) toast.success('Test message sent — check Slack');
      else toast.error(d?.error || 'Test failed');
    } finally { setTesting(null); }
  };

  if (loading) return <div style={{ color: '#525252', fontSize: 13, padding: 20 }}>Loading…</div>;

  const field = (value: string, set: (v: string) => void, placeholder: string) => (
    <input
      type="text" value={value} onChange={(e) => set(e.target.value)} placeholder={placeholder}
      className="w-full rounded-md"
      style={{ height: 38, padding: '0 12px', fontSize: 13, backgroundColor: '#0D0D0D', border: '1px solid rgba(255,255,255,0.1)', color: '#F0F0F0' }}
    />
  );

  return (
    <div style={{ maxWidth: 640 }} className="flex flex-col gap-5">
      <DataCard delay={0}>
        <div className="flex items-center gap-2.5 mb-1">
          <Slack size={18} style={{ color: '#F5A623' }} />
          <h3 style={{ fontFamily: "'Manrope', sans-serif", fontSize: 16, fontWeight: 600, color: '#F0F0F0' }}>Your Slack channel</h3>
        </div>
        <p style={{ fontSize: 12.5, color: '#8A8A8A', marginBottom: 14 }}>
          Paste an incoming-webhook URL for the channel where you want your reports + notifications delivered.
          Create one at <span style={{ color: '#C99A5B' }}>api.slack.com/apps → Incoming Webhooks</span>.
        </p>
        {field(userWebhook, setUserWebhook, 'https://hooks.slack.com/services/...')}
        <div className="flex items-center gap-2" style={{ marginTop: 12 }}>
          <button onClick={() => save({ userWebhook: userWebhook || null }, 'Webhook')} disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-md" style={{ height: 34, padding: '0 14px', fontSize: 13, fontWeight: 600, backgroundColor: '#F5A623', color: '#0D0D0D' }}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Save
          </button>
          <button onClick={() => test(userWebhook, 'user')} disabled={testing === 'user'}
            className="inline-flex items-center gap-1.5 rounded-md" style={{ height: 34, padding: '0 14px', fontSize: 13, fontWeight: 600, backgroundColor: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: '#8A8A8A' }}>
            {testing === 'user' ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Send test
          </button>
        </div>
      </DataCard>

      {isAdmin && (
        <DataCard delay={0.05}>
          <div className="flex items-center gap-2.5 mb-1">
            <Slack size={18} style={{ color: '#10B981' }} />
            <h3 style={{ fontFamily: "'Manrope', sans-serif", fontSize: 16, fontWeight: 600, color: '#F0F0F0' }}>Team channel (admin)</h3>
          </div>
          <p style={{ fontSize: 12.5, color: '#8A8A8A', marginBottom: 14 }}>
            A shared channel used as the fallback when a user hasn’t set their own, and for team-wide notifications.
          </p>
          {field(teamWebhook, setTeamWebhook, 'https://hooks.slack.com/services/...')}
          <div className="flex items-center gap-2" style={{ marginTop: 12 }}>
            <button onClick={() => save({ teamWebhook: teamWebhook || null }, 'Team webhook')} disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-md" style={{ height: 34, padding: '0 14px', fontSize: 13, fontWeight: 600, backgroundColor: '#F5A623', color: '#0D0D0D' }}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Save
            </button>
            <button onClick={() => test(teamWebhook, 'team')} disabled={testing === 'team'}
              className="inline-flex items-center gap-1.5 rounded-md" style={{ height: 34, padding: '0 14px', fontSize: 13, fontWeight: 600, backgroundColor: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: '#8A8A8A' }}>
              {testing === 'team' ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Send test
            </button>
          </div>
        </DataCard>
      )}
    </div>
  );
};

export default SlackTab;
