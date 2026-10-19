'use client';
import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import DataCard from '@/components/DataCard';

type Task = 'agent' | 'extract' | 'report';
interface Provider { id: string; label: string; ready: boolean; defaults: Record<Task, string> }
interface Data {
  providers: Provider[];
  config: { provider?: string; models?: Partial<Record<Task, string>> };
  resolved: Record<Task, { provider: string; model: string } | null>;
  models: { provider: string | null; list: string[] };
  canEdit: boolean;
}

const TASK_INFO: Record<Task, { label: string; hint: string }> = {
  agent: { label: 'Agent', hint: 'Terminal, chat bubble and Slack bot. Needs reliable tool calls.' },
  extract: { label: 'Extraction', hint: 'Turns pasted text into CRM fields. Needs strict JSON.' },
  report: { label: 'Reports & pages', hint: 'Summaries, and sample() calls from artifacts.' },
};

const fieldStyle: React.CSSProperties = {
  height: 36, width: '100%', maxWidth: 360, backgroundColor: '#141414', border: '1px solid rgba(255,255,255,0.1)',
  color: '#F0F0F0', fontSize: 13, padding: '0 10px', borderRadius: 6, outline: 'none',
};
const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: '#525252', letterSpacing: '0.04em', textTransform: 'uppercase', display: 'block', marginBottom: 6 };
const btn = (primary: boolean, enabled = true): React.CSSProperties => ({
  height: 36, padding: '0 16px', borderRadius: 6, fontSize: 13, fontWeight: 600, border: 'none',
  backgroundColor: primary ? (enabled ? '#F5A623' : '#2A2A2A') : '#222', color: primary ? (enabled ? '#0D0D0D' : '#525252') : '#F0F0F0',
  cursor: enabled ? 'pointer' : 'not-allowed',
});

export default function ModelsTab() {
  const [data, setData] = useState<Data | null>(null);
  const [provider, setProvider] = useState('');
  const [models, setModels] = useState<Partial<Record<Task, string>>>({});
  const [list, setList] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [test, setTest] = useState<string | null>(null);

  const load = useCallback(async (p?: string) => {
    const res = await fetch(`/api/settings/models${p ? `?provider=${p}` : ''}`);
    const d: Data = await res.json();
    setData(d);
    setList(d.models.list);
    if (!p) {
      setProvider(d.config.provider || d.resolved.agent?.provider || '');
      setModels(d.config.models ?? {});
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (!data) return <div style={{ color: '#525252', fontSize: 13 }}>Loading…</div>;
  const chosen = data.providers.find((p) => p.id === provider);

  async function save() {
    setBusy(true);
    const res = await fetch('/api/settings/models', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider, models }) });
    setBusy(false);
    if (res.ok) { toast.success('Models saved'); load(); } else toast.error('Could not save');
  }

  async function runTest() {
    setTest('Testing…');
    const res = await fetch('/api/settings/models', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ test: true }) });
    const d = await res.json().catch(() => ({}));
    setTest(d.ok ? `Agent model answered “${d.reply}” in ${(d.ms / 1000).toFixed(1)} s` : `Failed: ${d.error ?? 'no answer'}`);
  }

  const none = data.providers.every((p) => !p.ready);
  return (
    <div className="flex flex-col gap-5" style={{ maxWidth: 760 }}>
      <DataCard title="Provider" delay={0}>
        {none ? (
          <p style={{ fontSize: 13, color: '#8A8A8A', lineHeight: 1.6 }}>
            No provider has a key yet. Set <code>OLLAMA_API_KEY</code> (Ollama Cloud), <code>BANKR_LLM_KEY</code>, or <code>OPENAI_BASE_URL</code> + <code>OPENAI_API_KEY</code> on the server.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            <div>
              <span style={labelStyle}>Use</span>
              <select value={provider} disabled={!data.canEdit} style={fieldStyle}
                onChange={(e) => { setProvider(e.target.value); setModels({}); load(e.target.value); }}>
                {data.providers.map((p) => (
                  <option key={p.id} value={p.id} disabled={!p.ready}>{p.label}{p.ready ? '' : ' (no key)'}</option>
                ))}
              </select>
            </div>
            <p style={{ fontSize: 12.5, color: '#525252' }}>
              Only providers with a key on the server can be picked. Keys stay server-side.
            </p>
          </div>
        )}
      </DataCard>

      {!none && (
        <DataCard title="Model per task" delay={0.05}>
          <datalist id="model-list">{list.map((m) => <option key={m} value={m} />)}</datalist>
          <div className="flex flex-col gap-4">
            {(Object.keys(TASK_INFO) as Task[]).map((t) => (
              <div key={t}>
                <span style={labelStyle}>{TASK_INFO[t].label}</span>
                <input list="model-list" value={models[t] ?? ''} disabled={!data.canEdit}
                  placeholder={chosen?.defaults[t] ? `Default: ${chosen.defaults[t]}` : 'Model name'}
                  onChange={(e) => setModels((m) => ({ ...m, [t]: e.target.value }))} style={fieldStyle} />
                <div style={{ fontSize: 12, color: '#525252', marginTop: 4 }}>
                  {TASK_INFO[t].hint} Now: {data.resolved[t] ? `${data.resolved[t]!.model}` : 'not configured'}
                </div>
              </div>
            ))}
            <div style={{ fontSize: 12, color: '#525252' }}>{list.length ? `${list.length} models available from ${chosen?.label}.` : 'Could not list models; type a name.'}</div>
            {data.canEdit ? (
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={save} disabled={busy} style={btn(true, !busy)}>{busy ? 'Saving…' : 'Save'}</button>
                <button onClick={runTest} style={btn(false)}>Test agent model</button>
                {test && <span style={{ fontSize: 12.5, color: '#8A8A8A' }}>{test}</span>}
              </div>
            ) : (
              <div style={{ fontSize: 12.5, color: '#525252' }}>Only admins can change models.</div>
            )}
          </div>
        </DataCard>
      )}
    </div>
  );
}
