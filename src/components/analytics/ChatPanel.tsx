'use client';
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Send, Loader2, Info } from 'lucide-react';
import { useSubmissionStore } from '@/store/useSubmissionStore';
import { toChatRows, capRows } from '@/lib/chatData';

interface Turn { role: 'user' | 'assistant'; content: string; }

const SUGGESTIONS = [
  'Which 5 projects should I reach out to today?',
  'Who has been contacted this week?',
  'Which high-scoring projects have no owner?',
  'Summarize the pipeline right now',
];

const ChatPanel: React.FC = () => {
  const subs = useSubmissionStore((st) => st.submissions);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [turns, busy]);

  const send = useCallback(async (q?: string) => {
    const question = (q ?? input).trim();
    if (!question || busy) return;
    setError(null);
    const history = turns.map((t) => ({ role: t.role, content: t.content }));
    setTurns((prev) => [...prev, { role: 'user', content: question }]);
    setInput('');
    setBusy(true);
    try {
      const rows = capRows(toChatRows(subs));
      const res = await fetch('/api/analytics/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, history, rows }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data?.error || `Error ${res.status}`); return; }
      setTurns((prev) => [...prev, { role: 'assistant', content: data.answer }]);
    } catch (e: any) {
      setError(e?.message ?? 'request failed');
    } finally {
      setBusy(false);
    }
  }, [input, busy, turns, subs]);

  return (
    <div>
      {/* Transcript */}
      <div ref={scrollRef} style={{ maxHeight: 360, overflowY: 'auto', marginBottom: 12 }}>
        {turns.length === 0 && !busy && (
          <div className="flex flex-wrap gap-2" style={{ paddingTop: 4 }}>
            {SUGGESTIONS.map((q) => (
              <button key={q} onClick={() => send(q)}
                className="rounded-full" style={{ fontSize: 12, padding: '5px 12px', backgroundColor: '#141414', border: '1px solid rgba(255,255,255,0.08)', color: '#8A8A8A' }}>
                {q}
              </button>
            ))}
          </div>
        )}
        {turns.map((t, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: t.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: 10 }}>
            <div style={{
              maxWidth: '85%', padding: '10px 14px', borderRadius: 12, fontSize: 13, lineHeight: 1.55, whiteSpace: 'pre-wrap',
              backgroundColor: t.role === 'user' ? 'rgba(245,166,35,0.14)' : '#141414',
              border: t.role === 'user' ? '1px solid rgba(245,166,35,0.25)' : '1px solid rgba(255,255,255,0.08)',
              color: t.role === 'user' ? '#F0F0F0' : '#C9C9C9',
            }}>
              {t.content}
            </div>
          </div>
        ))}
        {busy && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#8A8A8A', fontSize: 13, padding: '4px 2px' }}>
            <Loader2 size={14} className="animate-spin" /> Thinking…
          </div>
        )}
      </div>

      {error && <div style={{ fontSize: 13, color: '#EF4444', marginBottom: 8 }}>{error}</div>}

      {/* Input */}
      <div className="flex items-center rounded-xl" style={{ height: 48, backgroundColor: '#141414', border: '1px solid rgba(255,255,255,0.1)', padding: '0 14px', gap: 10 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
          placeholder="Ask about your pipeline… e.g. who should I prioritize this week?"
          className="flex-1 bg-transparent outline-none"
          style={{ fontSize: 13, color: '#F0F0F0' }}
        />
        <button onClick={() => send()} disabled={busy || !input.trim()} className="flex items-center justify-center rounded-lg"
          style={{ width: 32, height: 32, backgroundColor: input.trim() && !busy ? '#F5A623' : 'rgba(245,166,35,0.2)', cursor: input.trim() && !busy ? 'pointer' : 'not-allowed' }}>
          {busy ? <Loader2 size={15} className="animate-spin" style={{ color: '#0D0D0D' }} /> : <Send size={14} style={{ color: input.trim() ? '#0D0D0D' : '#525252' }} />}
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: 11, color: '#525252' }}>
        <Info size={12} /> AI judgment based on current pipeline data — not an audited report. Founder details and wallets are never sent.
      </div>
    </div>
  );
};

export default ChatPanel;
