'use client';
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Loader2 } from 'lucide-react';
import { useSubmissionStore } from '@/store/useSubmissionStore';
import { toChatRows, capRows } from '@/lib/chatData';
import AnalyticsPanel from '@/components/analytics/AnalyticsPanel';
import type { AnalyticsSpec } from '@/lib/analyticsSpec';

interface Turn {
  role: 'user' | 'assistant';
  content: string;
  panelSpec?: AnalyticsSpec | null;
}

const SUGGESTIONS = [
  'Who are my top 5 outreach candidates right now?',
  'How many projects are in each stage?',
  'Build a chart of submissions by source',
  'Which projects have the highest 24h volume?',
];

const Terminal: React.FC = () => {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { submissions, load } = useSubmissionStore();

  useEffect(() => { if (!submissions.length) load(); }, [submissions.length, load]);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }); }, [turns, loading]);

  const send = useCallback(async (text: string) => {
    const q = text.trim();
    if (!q || loading) return;
    setError(null);
    setInput('');
    setTurns((prev) => [...prev, { role: 'user', content: q }]);
    setLoading(true);
    try {
      const priorMsgs = turns.map((t) => ({ role: t.role, content: t.content }));
      const rows = capRows(toChatRows(submissions));
      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [...priorMsgs, { role: 'user', content: q }], submissions: rows }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data?.error || `Error ${res.status}`); return; }
      setTurns((prev) => [...prev, { role: 'assistant', content: data.answer || '', panelSpec: data.panelSpec ?? null }]);

      const ranTools: string[] = Array.isArray(data.toolTrace) ? data.toolTrace.map((t: any) => t?.name) : [];
      const WRITE = ['create_submission', 'propose_edit', 'ingest_project', 'create_slack_report', 'create_scheduled_job', 'resolve_proposal', 'add_note', 'set_contract_address', 'send_telegram'];
      if (ranTools.some((n) => WRITE.includes(n))) {
        const st = useSubmissionStore.getState();
        st.load();
        st.loadProposals();
      }
    } catch {
      setError('Something went wrong — try again.');
    } finally {
      setLoading(false);
    }
  }, [loading, turns, submissions]);

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 112px)' }}>
      {/* Header */}
      <div className="flex items-center gap-3" style={{ padding: '16px 28px', borderBottom: '1px solid rgba(255,255,255,0.07)', background: 'linear-gradient(90deg, rgba(124,58,237,0.16) 0%, rgba(124,58,237,0.04) 40%, transparent 100%)' }}>
        <div className="rounded-full overflow-hidden" style={{ width: 38, height: 38, backgroundColor: 'rgba(124,58,237,0.18)' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/agent-avatar.gif" alt="" style={{ width: 38, height: 38, objectFit: 'cover' }} />
        </div>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#F0F0F0', fontFamily: "'Manrope', sans-serif" }}>Terminal</div>
          <div style={{ fontSize: 12.5, color: '#8A8A8A' }}>Full-screen workspace for the CRM assistant — ask, analyze, create, ingest.</div>
        </div>
      </div>

      {/* Conversation */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto" style={{ padding: '24px 28px' }}>
        {turns.length === 0 && !loading && (
          <div style={{ maxWidth: 720, margin: '0 auto', paddingTop: 32 }}>
            <div style={{ fontSize: 14, color: '#8A8A8A', marginBottom: 14 }}>Ask me anything about the pipeline. For example:</div>
            <div className="flex flex-col gap-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => send(s)}
                  className="text-left rounded-lg"
                  style={{ padding: '12px 16px', fontSize: 14, backgroundColor: '#1A1A1A', border: '1px solid rgba(255,255,255,0.08)', color: '#C9C9C9' }}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        <div style={{ maxWidth: 820, margin: '0 auto' }}>
          {turns.map((t, i) => (
            <div key={i} style={{ marginBottom: 18 }}>
              <div className="flex items-start gap-3" style={{ flexDirection: t.role === 'user' ? 'row-reverse' : 'row' }}>
                {t.role === 'assistant' && (
                  <div className="rounded-full overflow-hidden shrink-0" style={{ width: 30, height: 30, backgroundColor: 'rgba(124,58,237,0.18)', marginTop: 2 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/brand/agent-avatar.gif" alt="" style={{ width: 30, height: 30, objectFit: 'cover' }} />
                  </div>
                )}
                <div className="rounded-xl" style={{
                  maxWidth: '80%',
                  padding: '11px 15px',
                  fontSize: 14,
                  lineHeight: 1.55,
                  whiteSpace: 'pre-wrap',
                  backgroundColor: t.role === 'user' ? 'rgba(124,58,237,0.16)' : '#1A1A1A',
                  border: t.role === 'user' ? '1px solid rgba(124,58,237,0.28)' : '1px solid rgba(255,255,255,0.07)',
                  color: t.role === 'user' ? '#F0F0F0' : '#C9C9C9',
                }}>
                  {t.content}
                  {t.panelSpec && (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#F0F0F0', marginBottom: 8 }}>{t.panelSpec.title}</div>
                      <AnalyticsPanel spec={t.panelSpec} compact />
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex items-center gap-2" style={{ color: '#8A8A8A', fontSize: 13, padding: '4px 0 0 42px' }}>
              <Loader2 size={14} className="animate-spin" /> Thinking…
            </div>
          )}
          {error && <div style={{ color: '#E5544B', fontSize: 13, marginTop: 8 }}>{error}</div>}
        </div>
      </div>

      {/* Input */}
      <div style={{ padding: '16px 28px', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
        <div style={{ maxWidth: 820, margin: '0 auto' }} className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }}
            placeholder="Ask the assistant…  (Enter to send, Shift+Enter for a new line)"
            rows={1}
            className="flex-1 rounded-lg resize-none"
            style={{ padding: '11px 14px', fontSize: 14, backgroundColor: '#0D0D0D', border: '1px solid rgba(255,255,255,0.1)', color: '#F0F0F0', maxHeight: 160, fontFamily: 'inherit' }}
          />
          <button onClick={() => send(input)} disabled={loading || !input.trim()}
            className="inline-flex items-center justify-center rounded-lg shrink-0"
            style={{ height: 44, width: 44, backgroundColor: input.trim() ? '#7c3aed' : '#1A1A1A', color: input.trim() ? '#F0F0F0' : '#525252', border: '1px solid rgba(255,255,255,0.1)' }}>
            {loading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Terminal;
