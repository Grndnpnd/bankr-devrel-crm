'use client';
import React, { useEffect, useState } from 'react';
import { Inbox, Check, X, Loader2, FileEdit } from 'lucide-react';
import { toast } from 'sonner';
import { useSubmissionStore } from '@/store/useSubmissionStore';
import { EDITABLE_FIELDS } from '@/lib/proposedEdits';

const opLabel: Record<string, string> = {
  replace: 'Replace', append: 'Add to', add: 'Add flag(s)', remove: 'Remove',
};

const fieldLabel = (f: string) => EDITABLE_FIELDS[f]?.label ?? f;

const valStr = (v: any) => {
  if (v == null || v === '') return '(empty)';
  if (Array.isArray(v)) return v.length ? v.join(', ') : '(none)';
  return String(v);
};

const ReviewInbox: React.FC = () => {
  const { proposals, loadProposals, resolveProposal } = useSubmissionStore();
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => { loadProposals().finally(() => setLoading(false)); }, [loadProposals]);

  const act = async (id: string, action: 'approve' | 'reject') => {
    setBusyId(id);
    const ok = await resolveProposal(id, action);
    setBusyId(null);
    if (ok) toast.success(action === 'approve' ? 'Edit applied' : 'Proposal rejected');
    else toast.error('Could not complete that');
  };

  return (
    <div style={{ maxWidth: 820 }}>
      <div className="mb-6 flex items-center gap-2.5">
        <Inbox size={22} style={{ color: '#F5A623' }} />
        <div>
          <h1 style={{ fontFamily: "'Manrope', sans-serif", fontSize: 22, fontWeight: 700, color: '#F0F0F0' }}>Review Inbox</h1>
          <p style={{ fontSize: 13, color: '#8A8A8A', marginTop: 2 }}>Proposed edits awaiting approval. Additive edits apply automatically and don’t appear here.</p>
        </div>
      </div>

      {loading ? (
        <div style={{ color: '#525252', fontSize: 13, padding: 20 }}>Loading…</div>
      ) : proposals.length === 0 ? (
        <div className="rounded-xl" style={{ border: '1px dashed rgba(255,255,255,0.12)', padding: 40, textAlign: 'center' }}>
          <FileEdit size={28} style={{ color: '#3A3A3A', margin: '0 auto 10px' }} />
          <div style={{ fontSize: 14, color: '#8A8A8A' }}>Nothing to review</div>
          <div style={{ fontSize: 12, color: '#525252', marginTop: 4 }}>Proposed edits that need approval will show up here.</div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {proposals.map((p) => (
            <div key={p.id} className="rounded-xl" style={{ backgroundColor: '#1A1A1A', border: '1px solid rgba(255,255,255,0.07)', padding: 18 }}>
              <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
                <div>
                  <span style={{ fontSize: 15, fontWeight: 700, color: '#F0F0F0' }}>{p.submission?.project ?? 'Project'}</span>
                  <span style={{ fontSize: 11.5, color: '#525252', marginLeft: 8 }}>
                    proposed by {p.proposedBy ?? 'agent'} · {new Date(p.createdAt).toLocaleString()}
                  </span>
                </div>
              </div>

              {p.rationale && (
                <div style={{ fontSize: 12.5, color: '#8A8A8A', fontStyle: 'italic', marginBottom: 12 }}>“{p.rationale}”</div>
              )}

              <div className="flex flex-col gap-2" style={{ marginBottom: 14 }}>
                {(p.changes || []).map((c: any, i: number) => (
                  <div key={i} className="rounded-lg" style={{ backgroundColor: '#0D0D0D', border: '1px solid rgba(255,255,255,0.06)', padding: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.03em', textTransform: 'uppercase', color: '#F5A623', marginBottom: 6 }}>
                      {opLabel[c.op] ?? c.op} · {fieldLabel(c.field)}
                    </div>
                    <div className="flex flex-col gap-1" style={{ fontSize: 13 }}>
                      <div style={{ color: '#8A8A8A' }}>
                        <span style={{ color: '#525252', fontSize: 11 }}>NOW: </span>{valStr(c.currentValue)}
                      </div>
                      <div style={{ color: '#10B981' }}>
                        <span style={{ color: '#525252', fontSize: 11 }}>{c.op === 'remove' ? 'REMOVE: ' : 'NEW: '}</span>{valStr(c.value)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <button onClick={() => act(p.id, 'approve')} disabled={busyId === p.id}
                  className="inline-flex items-center gap-1.5 rounded-md" style={{ height: 34, padding: '0 14px', fontSize: 13, fontWeight: 600, backgroundColor: '#10B981', color: '#0D0D0D' }}>
                  {busyId === p.id ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Approve
                </button>
                <button onClick={() => act(p.id, 'reject')} disabled={busyId === p.id}
                  className="inline-flex items-center gap-1.5 rounded-md" style={{ height: 34, padding: '0 14px', fontSize: 13, fontWeight: 600, backgroundColor: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: '#8A8A8A' }}>
                  <X size={14} /> Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ReviewInbox;
