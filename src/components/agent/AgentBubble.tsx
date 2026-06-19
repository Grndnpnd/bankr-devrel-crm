'use client';
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { MessageSquare, X, Send, Loader2, Plus, Users, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { useSubmissionStore } from '@/store/useSubmissionStore';
import { toChatRows, capRows } from '@/lib/chatData';
import type { AnalyticsSpec } from '@/lib/analyticsSpec';
import AnalyticsPanel from '@/components/analytics/AnalyticsPanel';

interface Turn {
  role: 'user' | 'assistant';
  content: string;
  panelSpec?: AnalyticsSpec | null;
}

const SUGGESTIONS = [
  'Which 5 projects should I reach out to today?',
  'How many projects are in each stage?',
  'Build a chart of average score by owner',
  'Who has been contacted this week?',
];

const AgentBubble: React.FC = () => {
  const subs = useSubmissionStore((st) => st.submissions);
  const addSavedPanel = useSubmissionStore((st) => st.addSavedPanel);
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [turns, busy, open]);

  const send = useCallback(async (q?: string) => {
    const question = (q ?? input).trim();
    if (!question || busy) return;
    setError(null);
    const priorMsgs = turns.map((t) => ({ role: t.role, content: t.content }));
    setTurns((prev) => [...prev, { role: 'user', content: question }]);
    setInput('');
    setBusy(true);
    try {
      const submissions = capRows(toChatRows(subs)); // trimmed slice; raw never leaves
      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...priorMsgs, { role: 'user', content: question }],
          submissions,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data?.error || `Error ${res.status}`); return; }
      setTurns((prev) => [...prev, { role: 'assistant', content: data.answer || '', panelSpec: data.panelSpec ?? null }]);

      // If the agent ran any write tool, refresh the relevant data so the UI
      // reflects the change without a manual page reload.
      const ranTools: string[] = Array.isArray(data.toolTrace) ? data.toolTrace.map((t: any) => t?.name) : [];
      const WRITE = ['create_submission', 'propose_edit', 'ingest_project', 'create_slack_report', 'create_scheduled_job', 'add_note', 'resolve_proposal', 'set_contract_address', 'send_telegram'];
      if (ranTools.some((n) => WRITE.includes(n))) {
        const st = useSubmissionStore.getState();
        st.load();              // submissions (covers create/edit/ingest)
        st.loadProposals();     // review queue (covers queued edits + badges)
      }
    } catch (e: any) {
      setError(e?.message ?? 'request failed');
    } finally {
      setBusy(false);
    }
  }, [input, busy, turns, subs]);

  const savePanel = useCallback(async (spec: AnalyticsSpec, share: boolean) => {
    const res = await addSavedPanel(spec, share);
    if (!res) { toast.error('Could not save panel'); return; }
    toast.success('Panel saved', {
      description: share ? 'Shared with the team — add it from Customize → Add container.' : 'Saved — add it from Customize → Add container.',
    });
  }, [addSavedPanel]);

  return (
    <>
      {/* Launcher */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Open assistant"
          style={{
            position: 'fixed', bottom: 24, right: 24, zIndex: 50,
            width: 56, height: 56, borderRadius: 28,
            backgroundColor: '#7c3aed', color: '#F0F0F0',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 6px 24px rgba(0,0,0,0.4), 0 0 0 1px rgba(124,58,237,0.4)',
            cursor: 'pointer',
          }}
        >
          <MessageSquare size={24} />
        </button>
      )}

      {/* Panel */}
      {open && (
        <div
          style={{
            position: 'fixed', bottom: 24, right: 24, zIndex: 50,
            width: 420, maxWidth: 'calc(100vw - 32px)', height: 600, maxHeight: 'calc(100vh - 48px)',
            backgroundColor: '#141414', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16,
            boxShadow: '0 12px 48px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between" style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="flex items-center gap-2.5">
              <div className="flex items-center justify-center rounded-full overflow-hidden" style={{ width: 30, height: 30, backgroundColor: 'rgba(124,58,237,0.18)' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/brand/agent-avatar.gif" alt="" style={{ width: 30, height: 30, objectFit: 'cover' }} />
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#F0F0F0', fontFamily: "'Manrope', sans-serif" }}>CRM Assistant</div>
                <div style={{ fontSize: 11, color: '#525252' }}>Ask, analyze, build panels</div>
              </div>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Close" style={{ color: '#8A8A8A', display: 'flex' }}>
              <X size={18} />
            </button>
          </div>

          {/* Transcript */}
          <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
            {turns.length === 0 && !busy && (
              <div className="flex flex-col gap-2" style={{ paddingTop: 8 }}>
                <div style={{ fontSize: 12, color: '#8A8A8A', marginBottom: 4 }}>Try asking:</div>
                {SUGGESTIONS.map((q) => (
                  <button key={q} onClick={() => send(q)}
                    className="text-left rounded-lg" style={{ fontSize: 12.5, padding: '8px 11px', backgroundColor: '#1A1A1A', border: '1px solid rgba(255,255,255,0.07)', color: '#C9C9C9' }}>
                    {q}
                  </button>
                ))}
              </div>
            )}
            {turns.map((t, i) => (
              <div key={i} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: t.role === 'user' ? 'flex-end' : 'flex-start' }}>
                  <div style={{
                    maxWidth: '88%', padding: '9px 12px', borderRadius: 12, fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap',
                    backgroundColor: t.role === 'user' ? 'rgba(124,58,237,0.16)' : '#1A1A1A',
                    border: t.role === 'user' ? '1px solid rgba(124,58,237,0.28)' : '1px solid rgba(255,255,255,0.07)',
                    color: t.role === 'user' ? '#F0F0F0' : '#C9C9C9',
                  }}>
                    {t.content}
                  </div>
                </div>
                {t.panelSpec && (
                  <div className="rounded-xl mt-2" style={{ border: '1px solid rgba(255,255,255,0.08)', backgroundColor: '#1A1A1A', padding: 12 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#F0F0F0', marginBottom: 8 }}>{t.panelSpec.title}</div>
                    <AnalyticsPanel spec={t.panelSpec} compact />
                    <div className="flex items-center gap-2" style={{ marginTop: 10 }}>
                      <button onClick={() => savePanel(t.panelSpec!, false)} className="inline-flex items-center gap-1.5 rounded-md"
                        style={{ height: 28, padding: '0 10px', fontSize: 12, fontWeight: 600, backgroundColor: '#7c3aed', color: '#F0F0F0' }}>
                        <Plus size={12} /> Save
                      </button>
                      <button onClick={() => savePanel(t.panelSpec!, true)} className="inline-flex items-center gap-1.5 rounded-md"
                        style={{ height: 28, padding: '0 10px', fontSize: 12, fontWeight: 600, backgroundColor: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: '#8A8A8A' }}>
                        <Users size={12} /> Save & share
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {busy && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#8A8A8A', fontSize: 13 }}>
                <Loader2 size={14} className="animate-spin" /> Working…
              </div>
            )}
            {error && <div style={{ fontSize: 13, color: '#EF4444', marginTop: 4 }}>{error}</div>}
          </div>

          {/* Input */}
          <div style={{ padding: 12, borderTop: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="flex items-center rounded-xl" style={{ height: 44, backgroundColor: '#0D0D0D', border: '1px solid rgba(255,255,255,0.1)', padding: '0 12px', gap: 8 }}>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
                placeholder="Ask about your pipeline…"
                className="flex-1 bg-transparent outline-none"
                style={{ fontSize: 13, color: '#F0F0F0' }}
              />
              <button onClick={() => send()} disabled={busy || !input.trim()} className="flex items-center justify-center rounded-lg"
                style={{ width: 30, height: 30, backgroundColor: input.trim() && !busy ? '#7c3aed' : 'rgba(124,58,237,0.25)', cursor: input.trim() && !busy ? 'pointer' : 'not-allowed' }}>
                {busy ? <Loader2 size={14} className="animate-spin" style={{ color: '#0D0D0D' }} /> : <Send size={13} style={{ color: input.trim() ? '#0D0D0D' : '#525252' }} />}
              </button>
            </div>
            <div style={{ fontSize: 10.5, color: '#525252', marginTop: 7, textAlign: 'center' }}>
              Read-only · AI analysis on trimmed data, no founder PII or wallets sent
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default AgentBubble;
