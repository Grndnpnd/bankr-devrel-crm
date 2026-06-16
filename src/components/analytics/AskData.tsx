'use client';
import React, { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Send, Plus, X, Loader2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useSubmissionStore } from '@/store/useSubmissionStore';
import type { AnalyticsSpec } from '@/lib/analyticsSpec';
import AnalyticsPanel from './AnalyticsPanel';
import ChatPanel from './ChatPanel';

const EXAMPLES = [
  'How many projects are in each stage?',
  'Average score by owner',
  'Live projects needing fundraising help',
  'Top 10 projects by 24h volume',
  'Count of submissions needing partnerships',
];

const AskData: React.FC = () => {
  const addSavedPanel = useSubmissionStore((st) => st.addSavedPanel);
  const [mode, setMode] = useState<'panel' | 'chat'>('panel');
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<AnalyticsSpec | null>(null);
  const [sharePublic, setSharePublic] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ask = useCallback(async (q?: string) => {
    const query = (q ?? question).trim();
    if (!query || busy) return;
    setBusy(true);
    setError(null);
    setPreview(null);
    try {
      const res = await fetch('/api/analytics/panel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: query }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data?.error || `Error ${res.status}`); return; }
      setPreview(data.spec as AnalyticsSpec);
    } catch (e: any) {
      setError(e?.message ?? 'request failed');
    } finally {
      setBusy(false);
    }
  }, [question, busy]);

  const save = useCallback(async () => {
    if (!preview) return;
    const res = await addSavedPanel(preview, sharePublic);
    if (!res) { toast.error('Could not save panel'); return; }
    toast.success('Panel saved', {
      description: sharePublic
        ? 'Shared with the team — add it from Customize → Add container.'
        : 'Saved to your panels — add it from Customize → Add container.',
    });
    setPreview(null);
    setQuestion('');
    setSharePublic(false);
  }, [preview, addSavedPanel, sharePublic]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
      className="rounded-2xl"
      style={{ background: 'linear-gradient(135deg, #1A1A1A 0%, #0D0D0D 50%, #1A1A1A 100%)', border: '1px solid rgba(245,166,35,0.10)', padding: 24 }}
    >
      <div className="flex items-center gap-3 mb-4">
        <div className="flex items-center justify-center rounded-full" style={{ width: 36, height: 36, backgroundColor: 'rgba(245,166,35,0.12)' }}>
          <Sparkles size={20} style={{ color: '#F5A623' }} />
        </div>
        <div style={{ flex: 1 }}>
          <h3 style={{ fontFamily: "'Manrope', sans-serif", fontSize: 17, fontWeight: 600, color: '#F0F0F0' }}>Ask Your Data</h3>
          <p style={{ fontSize: 12, color: '#8A8A8A' }}>
            {mode === 'panel' ? 'Build a chart or stat and pin it to your dashboard.' : 'Have a conversation about your pipeline.'}
          </p>
        </div>
        <div className="flex items-center rounded-lg" style={{ padding: 2, backgroundColor: '#141414', border: '1px solid rgba(255,255,255,0.1)', gap: 2 }}>
          {(['panel', 'chat'] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)}
              style={{ fontSize: 12, fontWeight: 600, padding: '5px 12px', borderRadius: 6, cursor: 'pointer',
                backgroundColor: mode === m ? 'rgba(245,166,35,0.18)' : 'transparent',
                color: mode === m ? '#F5A623' : '#8A8A8A' }}>
              {m === 'panel' ? 'Build a panel' : 'Ask a question'}
            </button>
          ))}
        </div>
      </div>

      {mode === 'chat' ? <ChatPanel /> : (<>

      <div className="flex items-center rounded-xl mb-3" style={{ height: 48, backgroundColor: '#141414', border: '1px solid rgba(255,255,255,0.1)', padding: '0 14px', gap: 10 }}>
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') ask(); }}
          placeholder="e.g. average score by stage, or list live projects needing partnerships"
          className="flex-1 bg-transparent outline-none"
          style={{ fontSize: 13, color: '#F0F0F0' }}
        />
        <button onClick={() => ask()} disabled={busy || !question.trim()} className="flex items-center justify-center rounded-lg"
          style={{ width: 32, height: 32, backgroundColor: question.trim() && !busy ? '#F5A623' : 'rgba(245,166,35,0.2)', cursor: question.trim() && !busy ? 'pointer' : 'not-allowed' }}>
          {busy ? <Loader2 size={15} className="animate-spin" style={{ color: '#0D0D0D' }} /> : <Send size={14} style={{ color: question.trim() ? '#0D0D0D' : '#525252' }} />}
        </button>
      </div>

      {!preview && !error && (
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((q) => (
            <button key={q} onClick={() => { setQuestion(q); ask(q); }}
              className="rounded-full" style={{ fontSize: 12, padding: '5px 12px', backgroundColor: '#141414', border: '1px solid rgba(255,255,255,0.08)', color: '#8A8A8A' }}>
              {q}
            </button>
          ))}
        </div>
      )}

      {error && (
        <div style={{ fontSize: 13, color: '#EF4444', padding: '8px 0' }}>{error}</div>
      )}

      {preview && (
        <div className="rounded-xl mt-2" style={{ border: '1px solid rgba(255,255,255,0.08)', backgroundColor: '#141414', padding: 16 }}>
          <div className="flex items-center justify-between mb-3">
            <span style={{ fontSize: 14, fontWeight: 600, color: '#F0F0F0' }}>{preview.title}</span>
            <div className="flex items-center gap-2">
              <button onClick={() => setSharePublic((v) => !v)} title="Make this panel available to the whole team"
                className="inline-flex items-center gap-1.5 rounded-md" style={{ height: 30, padding: '0 10px', fontSize: 12, fontWeight: 600,
                  backgroundColor: sharePublic ? 'rgba(245,166,35,0.18)' : 'transparent',
                  border: sharePublic ? '1px solid rgba(245,166,35,0.4)' : '1px solid rgba(255,255,255,0.12)',
                  color: sharePublic ? '#F5A623' : '#8A8A8A' }}>
                <Users size={13} /> {sharePublic ? 'Shared with team' : 'Share with team'}
              </button>
              <button onClick={save} className="inline-flex items-center gap-1.5 rounded-md" style={{ height: 30, padding: '0 12px', fontSize: 12, fontWeight: 600, backgroundColor: '#F5A623', color: '#0D0D0D' }}>
                <Plus size={13} /> Save panel
              </button>
              <button onClick={() => setPreview(null)} className="flex items-center justify-center rounded-md" style={{ width: 30, height: 30, color: '#525252', border: '1px solid rgba(255,255,255,0.1)' }}>
                <X size={15} />
              </button>
            </div>
          </div>
          <AnalyticsPanel spec={preview} />
        </div>
      )}
      </>)}
    </motion.div>
  );
};

export default AskData;
