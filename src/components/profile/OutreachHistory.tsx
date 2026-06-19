'use client';
import React, { useEffect, useState, useCallback } from 'react';
import { Plus, X, Megaphone } from 'lucide-react';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { toast } from 'sonner';

interface OutreachEntry { id: string; type: string; detail: string; occurredAt: string; createdBy: string }
interface OutreachType { key: string; label: string; core?: boolean }

const labelFor = (key: string, types: OutreachType[]) =>
  types.find((t) => t.key === key)?.label ?? key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const OutreachHistory: React.FC<{ submissionId: string; canEdit: boolean }> = ({ submissionId, canEdit }) => {
  const [entries, setEntries] = useState<OutreachEntry[]>([]);
  const [types, setTypes] = useState<OutreachType[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newType, setNewType] = useState('');
  const [newDetail, setNewDetail] = useState('');
  const [customLabel, setCustomLabel] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/submissions/${submissionId}/outreach`);
      if (!res.ok) return;
      const d = await res.json();
      setEntries(d.entries || []);
      setTypes(d.types || []);
      if (!newType && d.types?.length) setNewType(d.types[0].key);
    } finally { setLoading(false); }
  }, [submissionId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  const add = async () => {
    let typeToSend = newType;
    if (newType === '__custom__') {
      if (!customLabel.trim()) { toast.error('Enter a name for the custom type'); return; }
      typeToSend = customLabel.trim();
    }
    const res = await fetch(`/api/submissions/${submissionId}/outreach`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: typeToSend, detail: newDetail.trim() || undefined }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(d?.error || 'Could not log outreach'); return; }
    setNewDetail(''); setCustomLabel(''); setAdding(false);
    await load();
    toast.success('Outreach logged');
  };

  const remove = async (entryId: string) => {
    if (!window.confirm('Delete this outreach entry?')) return;
    const res = await fetch(`/api/submissions/${submissionId}/outreach/${entryId}`, { method: 'DELETE' });
    if (res.ok) { setEntries((e) => e.filter((x) => x.id !== entryId)); }
  };

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
        <div className="flex items-center gap-2">
          <Megaphone size={14} style={{ color: '#7c3aed' }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: '#8A8A8A', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Outreach History</span>
        </div>
        {canEdit && !adding && (
          <button onClick={() => setAdding(true)} className="inline-flex items-center gap-1 rounded-md"
            style={{ padding: '4px 10px', fontSize: 12, fontWeight: 600, color: '#7c3aed', background: 'transparent', border: '1px solid rgba(124,58,237,0.4)' }}>
            <Plus size={12} /> Log outreach
          </button>
        )}
      </div>

      {adding && (
        <div className="mb-3 rounded-lg" style={{ padding: 12, border: '1px solid rgba(124,58,237,0.25)', backgroundColor: 'rgba(124,58,237,0.05)' }}>
          <div className="flex flex-col gap-2">
            <select value={newType} onChange={(e) => setNewType(e.target.value)}
              className="rounded-md" style={{ padding: '8px 10px', fontSize: 13, backgroundColor: '#0D0D0D', border: '1px solid rgba(255,255,255,0.12)', color: '#F0F0F0' }}>
              {types.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
              <option value="__custom__">+ Custom type…</option>
            </select>
            {newType === '__custom__' && (
              <input value={customLabel} onChange={(e) => setCustomLabel(e.target.value)} placeholder="Custom type name (e.g. Hackathon)"
                className="rounded-md" style={{ padding: '8px 10px', fontSize: 13, backgroundColor: '#0D0D0D', border: '1px solid rgba(255,255,255,0.12)', color: '#F0F0F0' }} />
            )}
            <input value={newDetail} onChange={(e) => setNewDetail(e.target.value)} placeholder="Detail (optional) — e.g. link, who, context"
              className="rounded-md" style={{ padding: '8px 10px', fontSize: 13, backgroundColor: '#0D0D0D', border: '1px solid rgba(255,255,255,0.12)', color: '#F0F0F0' }} />
            <div className="flex items-center gap-2">
              <button onClick={add} className="rounded-md" style={{ padding: '6px 14px', fontSize: 12, fontWeight: 600, backgroundColor: '#7c3aed', color: '#F0F0F0', border: 'none' }}>Save</button>
              <button onClick={() => { setAdding(false); setNewDetail(''); setCustomLabel(''); }} className="rounded-md" style={{ padding: '6px 14px', fontSize: 12, fontWeight: 600, background: 'transparent', color: '#8A8A8A', border: '1px solid rgba(255,255,255,0.1)' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ fontSize: 13, color: '#525252' }}>Loading…</div>
      ) : entries.length === 0 ? (
        <div style={{ fontSize: 13, color: '#525252' }}>No outreach logged yet.</div>
      ) : (
        <div className="flex flex-col gap-2">
          {entries.map((e, i) => (
            <div key={e.id} className="flex items-start justify-between rounded-lg"
              style={{ padding: '10px 12px', backgroundColor: i === 0 ? 'rgba(124,58,237,0.08)' : '#1A1A1A', border: i === 0 ? '1px solid rgba(124,58,237,0.3)' : '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ minWidth: 0 }}>
                <div className="flex items-center gap-2">
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#F0F0F0' }}>{labelFor(e.type, types)}</span>
                  {i === 0 && <span style={{ fontSize: 10, fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Latest</span>}
                </div>
                {e.detail && <div style={{ fontSize: 12.5, color: '#A8A8A8', marginTop: 2, wordBreak: 'break-word' }}>{e.detail}</div>}
                <div style={{ fontSize: 11, color: '#525252', marginTop: 3 }}>
                  {formatDistanceToNow(parseISO(e.occurredAt), { addSuffix: true })}{e.createdBy ? ` · ${e.createdBy}` : ''}
                </div>
              </div>
              {canEdit && (
                <button onClick={() => remove(e.id)} title="Delete" style={{ color: '#525252', background: 'transparent', border: 'none', cursor: 'pointer', padding: 2, flexShrink: 0 }}>
                  <X size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default OutreachHistory;
