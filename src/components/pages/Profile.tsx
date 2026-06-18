'use client';
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { sourceDisplayName } from '@/lib/labels';
import { can } from '@/lib/access';
import { useParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  X,
  Copy,
  CheckCircle2,
  ExternalLink,
  Mail,
  MessageSquare,
  Phone,
  Send,
  Trash2,
  Pencil,
  Sparkles,
} from 'lucide-react';
import { formatDistanceToNow, parseISO } from 'date-fns';
import SubmissionFormModal, { valuesFromSubmission, type SubmissionFormValues } from '@/components/SubmissionFormModal';
import type { TokenCandidate } from '@/store/useSubmissionStore';
import { formatUsd } from '@/data/stats';
import { toast } from 'sonner';
import { useSubmissionStore, useOwnerNames } from '@/store/useSubmissionStore';
import ScoreBadge from '@/components/ScoreBadge';
import StagePill from '@/components/StagePill';
import OnchainBadge from '@/components/OnchainBadge';
import { formatFees } from '@/data/stats';
import type { Activity } from '@/types';

const EASE = [0.16, 1, 0.3, 1] as [number, number, number, number];

/* ─── Constants ─── */
const STAGE_OPTIONS = ['New', 'Reviewing', 'Contacted', 'In Convo', 'Onboarding', 'Won', 'Passed'];
const ACTIVITY_TYPES: { type: Activity['type']; label: string; icon: React.ElementType; color: string }[] = [
  { type: 'note', label: 'Note', icon: MessageSquare, color: '#525252' },
  { type: 'dm', label: 'DM', icon: Send, color: '#F5A623' },
  { type: 'email', label: 'Email', icon: Mail, color: '#3B82F6' },
  { type: 'call', label: 'Call', icon: Phone, color: '#8B5CF6' },
];

/* ─── Truncated text with expand ─── */
const ExpandableText: React.FC<{ text: string; maxLines?: number }> = ({ text, maxLines = 4 }) => {
  const [expanded, setExpanded] = useState(false);
  if (!text) return <span style={{ color: '#525252', fontStyle: 'italic' }}>—</span>;
  return (
    <div>
      <div
        style={{
          fontSize: '13px',
          lineHeight: 1.6,
          color: '#F0F0F0',
          fontFamily: "'Inter', sans-serif",
          display: expanded ? 'block' : '-webkit-box',
          WebkitLineClamp: maxLines,
          WebkitBoxOrient: 'vertical',
          overflow: expanded ? 'visible' : 'hidden',
          whiteSpace: 'pre-wrap',
        }}
      >
        {text}
      </div>
      {text.length > 200 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-1 transition-colors duration-150"
          style={{ fontSize: '11px', color: '#F5A623', fontWeight: 500 }}
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  );
};

/* ─── Copy Button ─── */
const CopyButton: React.FC<{ text: string; label?: string }> = ({ text, label }) => {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="inline-flex items-center gap-1.5 rounded-md transition-all duration-150"
      style={{
        padding: '4px 10px',
        backgroundColor: '#222',
        color: copied ? '#10B981' : '#8A8A8A',
        fontSize: '11px',
        fontFamily: "'JetBrains Mono', monospace",
      }}
      onMouseEnter={(e) => { if (!copied) e.currentTarget.style.color = '#F0F0F0'; }}
      onMouseLeave={(e) => { if (!copied) e.currentTarget.style.color = '#8A8A8A'; }}
    >
      {copied ? <CheckCircle2 size={12} /> : <Copy size={12} />}
      {label || text.slice(0, 6) + '...' + text.slice(-4)}
    </button>
  );
};

/* ─── Link Chip ─── */
const LinkChip: React.FC<{ label: string; href: string; icon?: React.ReactNode }> = ({ label, href, icon }) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    className="inline-flex items-center gap-1.5 rounded-md transition-all duration-150"
    style={{
      padding: '4px 10px',
      backgroundColor: '#222',
      color: '#8A8A8A',
      fontSize: '12px',
      fontFamily: "'Inter', sans-serif",
      textDecoration: 'none',
    }}
    onMouseEnter={(e) => {
      e.currentTarget.style.color = '#F5A623';
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.color = '#8A8A8A';
    }}
  >
    {icon}
    {label}
    <ExternalLink size={10} />
  </a>
);

/* ─── Dropdown component ─── */
const SimpleDropdown: React.FC<{
  trigger: React.ReactNode;
  children: React.ReactNode;
  open: boolean;
  onClose: () => void;
}> = ({ trigger, children, open, onClose }) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, onClose]);

  return (
    <div ref={ref} className="relative inline-block">
      {trigger}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.1 }}
            className="absolute left-0 top-full z-20 mt-1 overflow-hidden"
            style={{
              minWidth: 160,
              backgroundColor: '#1A1A1A',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '8px',
              boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
            }}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

/* ─── Activity Timeline Entry ─── */
const TimelineEntry: React.FC<{ activity: Activity }> = ({ activity }) => {
  const dotColor =
    activity.type === 'stage_change'
      ? '#10B981'
      : activity.type === 'call'
        ? '#F5A623'
        : activity.type === 'email'
          ? '#3B82F6'
          : activity.type === 'meeting'
            ? '#10B981'
            : activity.type === 'system'
              ? '#525252'
              : '#525252';

  return (
    <div className="flex gap-3">
      {/* Timeline dot */}
      <div className="relative flex flex-col items-center">
        <div className="absolute left-1/2 -translate-x-1/2 top-1" style={{
          width: 2,
          height: 'calc(100% + 16px)',
          backgroundColor: 'rgba(255,255,255,0.06)',
          top: 8,
        }} />
        <div className="rounded-full" style={{
          width: 8,
          height: 8,
          backgroundColor: dotColor,
          flexShrink: 0,
        }} />
      </div>

      {/* Content */}
      <div className="flex-1 pb-4">
        <div className="flex items-center gap-2 mb-1">
          <span
            title={activity.timestamp}
            style={{ fontSize: '11px', color: '#525252', fontFamily: "'Inter', sans-serif" }}
          >
            {formatDistanceToNow(parseISO(activity.timestamp), { addSuffix: true })}
          </span>
          <span style={{ fontSize: '12px', fontWeight: 500, color: '#8A8A8A', fontFamily: "'Inter', sans-serif" }}>
            {activity.author}
          </span>
          <span
            className="rounded-full"
            style={{
              padding: '2px 8px',
              backgroundColor: 'rgba(255,255,255,0.04)',
              fontSize: '10px',
              fontWeight: 500,
              color: '#525252',
              textTransform: 'capitalize',
            }}
          >
            {activity.type.replace('_', ' ')}
          </span>
        </div>
        <div style={{ fontSize: '13px', color: '#F0F0F0', lineHeight: 1.5, fontFamily: "'Inter', sans-serif", whiteSpace: 'pre-wrap' }}>
          {activity.content}
        </div>
      </div>
    </div>
  );
};

/* ─── Profile Page ─── */
const Profile: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { getSubmissionById, updateStage, updateOwner, addActivity, setContractAddress, clearContractAddress, findToken, deleteSubmission, updateSubmissionFields, me } = useSubmissionStore();
  const OWNER_OPTIONS = useOwnerNames();

  const submission = useMemo(() => (id ? getSubmissionById(id) : undefined), [id, getSubmissionById]);

  const [dropdownOpen, setDropdownOpen] = useState<string | null>(null);

  // Activity log
  const [noteText, setNoteText] = useState('');
  const [activityType, setActivityType] = useState<Activity['type']>('note');

  // Generate sample activity from outreach + seed entries
  const activities = useMemo((): Activity[] => {
    if (!submission) return [];
    const base: Activity[] = [
      {
        id: `seed_${submission.id}_1`,
        type: 'system',
        author: 'System',
        timestamp: submission.submitted_at,
        content: 'Imported from ' + sourceDisplayName(submission.source),
      },
    ];
    if (submission.outreach && submission.outreach.length > 0) {
      return [...base, ...submission.outreach];
    }
    return base;
  }, [submission]);

  const handleAddActivity = useCallback(() => {
    if (!submission || !noteText.trim()) return;
    const activity: Activity = {
      id: `act_${Date.now()}`,
      type: activityType,
      author: 'You',
      timestamp: new Date().toISOString(),
      content: noteText.trim(),
    };
    addActivity(submission.id, activity);
    setNoteText('');
  }, [submission, noteText, activityType, addActivity]);

  // ── Token enrichment + delete ──
  const [caInput, setCaInput] = useState('');
  const [enriching, setEnriching] = useState(false);
  const [finding, setFinding] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [candidates, setCandidates] = useState<TokenCandidate[]>([]);

  // Pre-populate the picker from candidates stored during the last bulk review pass.
  useEffect(() => {
    if (submission?.needs_review && submission.review_candidates?.length) {
      setCandidates(submission.review_candidates);
    }
  }, [submission?.id, submission?.needs_review, submission?.review_candidates]);

  const handleFindToken = useCallback(async () => {
    if (!submission || finding) return;
    setFinding(true);
    setCandidates([]);
    const r = await findToken(submission.id);
    setFinding(false);
    if (r.ok) {
      toast.success('Token found', { description: r.via ? `Matched via ${r.via}` : 'Live token data pulled.' });
    } else if (r.ambiguous && r.candidates?.length) {
      setCandidates(r.candidates);
      toast('Multiple tokens match this name', { description: 'Pick the right one below.' });
    } else {
      toast.error('No token found', { description: r.error });
    }
  }, [submission, finding, findToken]);

  const handlePickCandidate = useCallback(async (ca: string) => {
    if (!submission) return;
    setCandidates([]);
    setEnriching(true);
    const r = await setContractAddress(submission.id, ca);
    setEnriching(false);
    if (r.ok) toast.success('Token data pulled');
    else toast.error('Could not fetch token', { description: r.error });
  }, [submission, setContractAddress]);

  const [clearing, setClearing] = useState(false);
  const handleClearToken = useCallback(async () => {
    if (!submission || clearing) return;
    if (!window.confirm('Clear this token match? The onchain data and its score contribution will be removed.')) return;
    setClearing(true);
    setCandidates([]);
    setCaInput('');
    const r = await clearContractAddress(submission.id);
    setClearing(false);
    if (r.ok) toast.success('Token cleared');
    else toast.error('Could not clear token', { description: r.error });
  }, [submission, clearing, clearContractAddress]);

  const handleEdit = useCallback(async (v: SubmissionFormValues): Promise<string | null> => {
    if (!submission) return 'no submission';
    const { founderName, founderEmail, founderX, ...fields } = v;
    const r = await updateSubmissionFields(submission.id, fields as unknown as Record<string, unknown>);
    if (r.ok) toast.success('Submission updated', { description: 'Score recomputed.' });
    return r.ok ? null : (r.error || 'failed');
  }, [submission, updateSubmissionFields]);

  useEffect(() => {
    if (submission?.contract_address) setCaInput(submission.contract_address);
  }, [submission?.contract_address]);

  const hasOnchain =
    !!submission &&
    (submission.vol_24h != null ||
      submission.market_cap != null ||
      !!submission.token || !!submission.contract_address);

  const fmtUsd = (v?: number | null) => {
    if (v === null || v === undefined) return '—';
    if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
    if (v >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
    return `$${Math.round(v)}`;
  };

  const handleEnrich = useCallback(async () => {
    if (!submission || !caInput.trim()) return;
    setEnriching(true);
    const r = await setContractAddress(submission.id, caInput.trim());
    setEnriching(false);
    if (r.ok) toast.success('Token data pulled', { description: 'Live volume, market cap, and price updated.' });
    else toast.error('Could not fetch token', { description: r.error });
  }, [submission, caInput, setContractAddress]);

  const handleDelete = useCallback(async () => {
    if (!submission) return;
    if (!window.confirm(`Delete "${submission.project}"? This removes the submission, its token match, and all activity. This cannot be undone.`)) return;
    const ok = await deleteSubmission(submission.id);
    if (ok) {
      toast.success('Submission deleted');
      router.push('/submissions');
    } else {
      toast.error('Delete failed');
    }
  }, [submission, deleteSubmission, router]);

  // Keyboard: Escape closes panel
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') router.push('/submissions');
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [router]);

  if (!submission) {
    return (
      <div className="flex flex-col items-center justify-center" style={{ padding: '80px 0' }}>
        <h3 style={{ fontFamily: "'Manrope', sans-serif", fontSize: '18px', fontWeight: 600, color: '#F0F0F0', marginBottom: 12 }}>
          Submission not found
        </h3>
        <button
          onClick={() => router.push('/submissions')}
          className="rounded-md transition-all duration-150"
          style={{
            padding: '8px 16px',
            backgroundColor: '#F5A623',
            color: '#0D0D0D',
            fontSize: '13px',
            fontWeight: 600,
          }}
        >
          Back to submissions
        </button>
      </div>
    );
  }

  return (
    <div
      className="fixed top-0 right-0 bottom-0 z-50 flex"
      style={{ left: '220px', top: '48px' }}
    >
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="flex-1"
        style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
        onClick={() => router.push('/submissions')}
      />

      {/* Panel */}
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ duration: 0.3, ease: EASE }}
        className="flex flex-col overflow-hidden"
        style={{
          width: 640,
          backgroundColor: '#1A1A1A',
          borderLeft: '1px solid rgba(255,255,255,0.06)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 0 1px rgba(255,255,255,0.08)',
        }}
      >
        {/* ─── Header (sticky) ─── */}
        <div
          className="flex items-center justify-between shrink-0"
          style={{
            height: 56,
            padding: '0 20px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            position: 'sticky',
            top: 0,
            zIndex: 10,
            backgroundColor: '#1A1A1A',
          }}
        >
          <button
            onClick={() => router.push('/submissions')}
            className="inline-flex items-center justify-center rounded-full transition-colors duration-150"
            style={{ width: 32, height: 32 }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#222'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
            title="Back to list"
          >
            <ArrowLeft size={20} style={{ color: '#8A8A8A' }} />
          </button>

          <div className="flex flex-col items-center flex-1 min-w-0 mx-4">
            <span
              className="truncate"
              style={{
                fontFamily: "'Manrope', sans-serif",
                fontSize: '16px',
                fontWeight: 600,
                color: '#F0F0F0',
              }}
            >
              {submission.project}
            </span>
            <span style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '11px',
              color: '#525252',
            }}>
              {submission.id}
            </span>
          </div>

          {me && can(me.role, 'submissions.edit') && (
            <button
              onClick={() => setEditOpen(true)}
              className="inline-flex items-center justify-center rounded-full transition-colors duration-150 mr-1"
              style={{ width: 32, height: 32 }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#222'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
              title="Edit submission"
            >
              <Pencil size={16} style={{ color: '#8A8A8A' }} />
            </button>
          )}
          {me?.role === 'ADMIN' && (
            <button
              onClick={handleDelete}
              className="inline-flex items-center justify-center rounded-full transition-colors duration-150 mr-1"
              style={{ width: 32, height: 32 }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(239,68,68,0.12)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
              title="Delete submission"
            >
              <Trash2 size={18} style={{ color: '#EF4444' }} />
            </button>
          )}

          <button
            onClick={() => router.push('/submissions')}
            className="inline-flex items-center justify-center rounded-full transition-colors duration-150"
            style={{ width: 32, height: 32 }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#222'; e.currentTarget.style.color = '#EF4444'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#8A8A8A'; }}
          >
            <X size={20} style={{ color: '#8A8A8A' }} />
          </button>
        </div>

        {/* ─── Scrollable Content ─── */}
        <div className="flex-1 overflow-y-auto" style={{ padding: '24px 20px 32px' }}>

          {/* ── Section 1: Project Identity ── */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: EASE }}
            style={{ marginBottom: 24, borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: 24 }}
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1 min-w-0">
                <h1 style={{
                  fontFamily: "'Manrope', sans-serif",
                  fontSize: '24px',
                  fontWeight: 700,
                  color: '#F0F0F0',
                  lineHeight: 1.2,
                  marginBottom: 8,
                }}>
                  {submission.project}
                </h1>
                <p style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: '14px',
                  color: '#8A8A8A',
                  lineHeight: 1.4,
                  maxWidth: 400,
                }}>
                  {submission.one_liner}
                </p>
              </div>
              <div className="flex flex-col items-end gap-2 shrink-0 ml-4">
                <ScoreBadge
                  score={submission.score}
                  breakdown={submission.score_breakdown}
                  showTooltip
                />
                <SimpleDropdown
                  open={dropdownOpen === 'stage'}
                  onClose={() => setDropdownOpen(null)}
                  trigger={
                    <span
                      className="cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDropdownOpen(dropdownOpen === 'stage' ? null : 'stage');
                      }}
                    >
                      <StagePill stage={submission.stage} />
                    </span>
                  }
                >
                  {STAGE_OPTIONS.map((s) => (
                    <button
                      key={s}
                      className="block w-full text-left px-3 py-2 transition-colors duration-100"
                      style={{
                        fontSize: '12px',
                        color: '#F0F0F0',
                        fontFamily: "'Inter', sans-serif",
                      }}
                      onClick={() => {
                        updateStage(submission.id, s);
                        setDropdownOpen(null);
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#222'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                    >
                      <span className="inline-block rounded-full mr-2" style={{
                        width: 8,
                        height: 8,
                        backgroundColor: s === 'New' ? '#64748B' : s === 'Reviewing' ? '#3B82F6' : s === 'Contacted' ? '#F59E0B' : s === 'In Convo' ? '#8B5CF6' : s === 'Onboarding' ? '#14B8A6' : s === 'Won' ? '#10B981' : '#6B7280',
                      }} />
                      {s}
                    </button>
                  ))}
                </SimpleDropdown>
              </div>
            </div>

            {/* Links Row */}
            <div className="flex flex-wrap gap-2 mb-3">
              {submission.project_x && (
                <LinkChip
                  label={submission.project_x}
                  href={`https://x.com/${submission.project_x.replace('@', '')}`}
                  icon={<ExternalLink size={12} />}
                />
              )}
              {submission.website && (
                <LinkChip
                  label={submission.website.replace(/^https?:\/\//, '')}
                  href={submission.website.startsWith('http') ? submission.website : `https://${submission.website}`}
                />
              )}
              {submission.wallet && (
                <CopyButton text={submission.wallet} />
              )}
            </div>

            {/* Meta Row */}
            <div className="flex flex-wrap items-center gap-3">
              <span
                className="rounded-full"
                style={{
                  padding: '3px 10px',
                  backgroundColor: '#222',
                  fontSize: '11px',
                  color: '#525252',
                }}
              >
                {sourceDisplayName(submission.source)}
              </span>
              <span style={{ fontSize: '12px', color: '#525252', fontFamily: "'Inter', sans-serif" }}>
                Submitted {submission.submitted_at ? formatDistanceToNow(parseISO(submission.submitted_at.split('.')[0].replace(' ', 'T')), { addSuffix: true }) : ''}
              </span>
              {(!!submission.token || !!submission.contract_address) && <OnchainBadge />}
            </div>

            {/* Owner + Claim */}
            <div className="flex items-center gap-3 mt-4">
              <SimpleDropdown
                open={dropdownOpen === 'owner'}
                onClose={() => setDropdownOpen(null)}
                trigger={
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDropdownOpen(dropdownOpen === 'owner' ? null : 'owner');
                    }}
                    className="inline-flex items-center gap-2 rounded-md transition-all duration-150"
                    style={{
                      padding: '6px 12px',
                      backgroundColor: '#222',
                      color: submission.owner ? '#F0F0F0' : '#525252',
                      fontSize: '12px',
                      fontFamily: "'Inter', sans-serif",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.14)'; }}
                  >
                    {submission.owner ? (
                      <>
                        <span className="rounded-full" style={{
                          width: 20,
                          height: 20,
                          backgroundColor: '#2A2A2A',
                          border: '1px solid rgba(255,255,255,0.06)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '9px',
                          color: '#8A8A8A',
                        }}>
                          {submission.owner[0]}
                        </span>
                        {submission.owner}
                      </>
                    ) : (
                      'Assign owner...'
                    )}
                  </button>
                }
              >
                {OWNER_OPTIONS.map((o) => (
                  <button
                    key={o}
                    className="block w-full text-left px-3 py-2 transition-colors duration-100"
                    style={{
                      fontSize: '12px',
                      color: '#F0F0F0',
                      fontFamily: "'Inter', sans-serif",
                    }}
                    onClick={() => {
                      updateOwner(submission.id, o);
                      setDropdownOpen(null);
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#222'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                  >
                    <span className="rounded-full mr-2" style={{
                      width: 16,
                      height: 16,
                      backgroundColor: '#222',
                      border: '1px solid rgba(255,255,255,0.1)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '8px',
                      color: '#8A8A8A',
                    }}>
                      {o[0]}
                    </span>
                    {o}
                  </button>
                ))}
              </SimpleDropdown>

              {!submission.owner && (
                <button
                  onClick={() => updateOwner(submission.id, useSubmissionStore.getState().me?.name || 'You')}
                  className="rounded-md transition-all duration-150"
                  style={{
                    padding: '6px 14px',
                    backgroundColor: '#F5A623',
                    color: '#0D0D0D',
                    fontSize: '12px',
                    fontWeight: 600,
                    fontFamily: "'Inter', sans-serif",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#E8941A';
                    e.currentTarget.style.boxShadow = '0 0 20px rgba(245,166,35,0.15)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#F5A623';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  Claim
                </button>
              )}
            </div>
          </motion.div>

          {/* ── Section 2: Onchain Signal + token enrichment ── */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: 0.1, ease: EASE }}
            style={{
              marginBottom: 24,
              padding: 20,
              backgroundColor: '#1A1A1A',
              borderRadius: 12,
              border: hasOnchain ? '1px solid rgba(16,185,129,0.2)' : '1px solid rgba(255,255,255,0.06)',
              backgroundImage: hasOnchain ? 'linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0) 100%)' : 'none',
              boxShadow: hasOnchain ? '0 0 12px rgba(16,185,129,0.2)' : 'none',
            }}
          >
            <div className="flex items-center gap-2 mb-4">
              <OnchainBadge />
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#10B981', fontFamily: "'Inter', sans-serif" }}>
                Onchain Signal
              </span>
            </div>

            {/* Contract address input → pulls live data from discover */}
            <div className="mb-4">
              <label style={{ fontSize: '11px', fontWeight: 600, color: '#525252', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                Token Contract Address
              </label>
              <div className="flex items-center gap-2 mt-1.5">
                <input
                  value={caInput}
                  onChange={(e) => setCaInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleEnrich(); }}
                  placeholder="0x…"
                  spellCheck={false}
                  className="flex-1 rounded-md outline-none"
                  style={{ height: 36, backgroundColor: '#141414', border: '1px solid rgba(255,255,255,0.1)', color: '#F0F0F0', fontFamily: "'JetBrains Mono', monospace", fontSize: '12px', padding: '0 12px' }}
                />
                <button
                  onClick={handleFindToken}
                  disabled={finding}
                  className="inline-flex items-center gap-1.5 px-3 rounded-md transition-all duration-150"
                  title="Search Bankr token launches by founder X, project X, or wallet"
                  style={{ height: 36, backgroundColor: 'transparent', border: '1px solid rgba(16,185,129,0.4)', color: '#10B981', fontSize: '13px', fontWeight: 600, opacity: finding ? 0.5 : 1, cursor: finding ? 'wait' : 'pointer', flexShrink: 0 }}
                >
                  <Sparkles size={14} />
                  {finding ? 'Searching…' : 'Find'}
                </button>
                <button
                  onClick={handleEnrich}
                  disabled={enriching || !caInput.trim()}
                  className="inline-flex items-center gap-1.5 px-3 rounded-md transition-all duration-150"
                  style={{ height: 36, backgroundColor: '#10B981', color: '#06231A', fontSize: '13px', fontWeight: 600, opacity: enriching || !caInput.trim() ? 0.5 : 1, cursor: enriching || !caInput.trim() ? 'not-allowed' : 'pointer' }}
                >
                  {enriching ? 'Fetching…' : 'Fetch'}
                </button>
              </div>

              {candidates.length > 0 && (
                <div className="mt-3 rounded-md" style={{ border: '1px solid rgba(245,166,35,0.25)', backgroundColor: 'rgba(245,166,35,0.04)', padding: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#F5A623', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 8 }}>
                    {submission.needs_review ? 'Flagged for review' : 'Multiple matches'} · {candidates.length} candidate tokens — choose the primary
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {candidates.map((c, i) => (
                      <div key={c.tokenAddress} className="flex items-center gap-3" style={{ backgroundColor: '#141414', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, padding: '8px 10px' }}>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span style={{ fontSize: 13, fontWeight: 600, color: '#F0F0F0' }}>${c.symbol || c.name || '—'}</span>
                            {(c.vol24h ?? 0) > 0 && i === 0 && (
                              <span style={{ fontSize: 10, fontWeight: 700, color: '#10B981', backgroundColor: 'rgba(16,185,129,0.15)', borderRadius: 4, padding: '1px 6px' }}>● Live</span>
                            )}
                            {c.bankrDeployed && (
                              <span style={{ fontSize: 10, fontWeight: 600, color: '#F5A623', backgroundColor: 'rgba(245,166,35,0.12)', borderRadius: 4, padding: '1px 6px' }}>Bankr</span>
                            )}
                          </div>
                          <div style={{ fontSize: 11, color: '#8A8A8A', marginTop: 2 }}>
                            {(c.vol24h ?? 0) > 0 || (c.marketCapUsd ?? 0) > 0 ? (
                              <span style={{ color: '#10B981' }}>
                                {formatUsd(c.vol24h ?? 0)} vol · {formatUsd(c.marketCapUsd ?? 0)} mcap · {' '}
                              </span>
                            ) : (
                              <span style={{ color: '#525252' }}>no volume · </span>
                            )}
                            <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{c.tokenAddress.slice(0, 8)}…{c.tokenAddress.slice(-4)}</span>
                          </div>
                        </div>
                        <button
                          onClick={() => handlePickCandidate(c.tokenAddress)}
                          className="rounded-md"
                          style={{ height: 30, padding: '0 12px', fontSize: 12, fontWeight: 600, backgroundColor: '#10B981', color: '#06231A', flexShrink: 0, cursor: 'pointer' }}
                        >
                          Use
                        </button>
                      </div>
                    ))}
                  </div>
                  <button onClick={() => setCandidates([])} style={{ fontSize: 11, color: '#525252', marginTop: 8 }}>Dismiss</button>
                </div>
              )}
            </div>

            {hasOnchain ? (
              <>
                <div className="grid grid-cols-3 gap-4">
                  {submission.token && (
                    <div>
                      <div className="flex items-center gap-2">
                        {submission.token_image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={submission.token_image} alt="" width={20} height={20} style={{ borderRadius: '50%' }} />
                        ) : null}
                        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '16px', fontWeight: 600, color: '#10B981' }}>
                          ${submission.token}
                        </span>
                      </div>
                      <div style={{ fontSize: '11px', color: '#525252', marginTop: 4 }}>{submission.token_name || 'Token'}</div>
                    </div>
                  )}
                  <div>
                    <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: '20px', fontWeight: 700, color: '#10B981' }}>
                      {fmtUsd(submission.market_cap)}
                    </div>
                    <div style={{ fontSize: '11px', color: '#525252', marginTop: 4 }}>Market Cap</div>
                  </div>
                  <div>
                    <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: '20px', fontWeight: 700, color: '#10B981' }}>
                      {submission.vol_24h != null ? fmtUsd(submission.vol_24h) : formatFees(submission.fees_24h)}
                    </div>
                    <div style={{ fontSize: '11px', color: '#525252', marginTop: 4 }}>{submission.vol_24h != null ? '24h Volume' : '24h Fees'}</div>
                  </div>
                </div>

                {(submission.price_change_24h != null || submission.wallet) && (
                  <div className="grid grid-cols-3 gap-4 mt-4">
                    {submission.price_change_24h != null && (
                      <div>
                        <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: '16px', fontWeight: 600, color: submission.price_change_24h >= 0 ? '#10B981' : '#EF4444' }}>
                          {submission.price_change_24h >= 0 ? '+' : ''}{submission.price_change_24h.toFixed(1)}%
                        </div>
                        <div style={{ fontSize: '11px', color: '#525252', marginTop: 4 }}>24h Price</div>
                      </div>
                    )}
                    {submission.wallet && (
                      <div>
                        <CopyButton text={submission.wallet} />
                        <div style={{ fontSize: '11px', color: '#525252', marginTop: 4 }}>Fee Recipient</div>
                      </div>
                    )}
                  </div>
                )}

                <div className="mt-3 pt-3 flex items-center justify-between" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  <span style={{ fontSize: '12px', color: '#8A8A8A' }}>
                    {submission.matched_via ? `Matched via: ${submission.matched_via}` : ''}
                  </span>
                  {me && can(me.role, 'submissions.edit') && (
                    <button
                      onClick={handleClearToken}
                      disabled={clearing}
                      className="inline-flex items-center gap-1.5 rounded-md"
                      title="Clear this token match"
                      style={{ height: 28, padding: '0 10px', fontSize: 12, fontWeight: 600, backgroundColor: 'transparent', border: '1px solid rgba(239,68,68,0.3)', color: '#EF4444', cursor: clearing ? 'wait' : 'pointer', opacity: clearing ? 0.5 : 1, flexShrink: 0 }}
                    >
                      <Trash2 size={13} />
                      {clearing ? 'Clearing…' : 'Clear token'}
                    </button>
                  )}
                </div>
              </>
            ) : (
              <p style={{ fontSize: '12px', color: '#525252' }}>
                Enter a contract address to pull live volume, market cap, and price data from Bankr.
              </p>
            )}
          </motion.div>

          {/* ── Section 3: Submission Content ── */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.15, ease: EASE }}
          >
            <div className="mb-4" style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: '12px',
              fontWeight: 600,
              color: '#525252',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}>
              Submission Content
            </div>

            {[
              { label: 'Problem Statement', value: submission.problem },
              { label: 'Solution', value: submission.solution },
              { label: 'Traction', value: submission.traction },
              { label: 'Funding Status', value: submission.funding },
              { label: 'Plan', value: submission.plan },
              { label: 'Why Bankr', value: submission.why_bankr },
              { label: 'Accomplishments', value: submission.accomplishments },
            ].map((section, i, arr) => (
              <div
                key={section.label}
                className="pb-4 mb-4"
                style={{ borderBottom: i < arr.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}
              >
                <div style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: '11px',
                  fontWeight: 600,
                  color: '#525252',
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  marginBottom: 8,
                }}>
                  {section.label}
                </div>
                <ExpandableText text={section.value} maxLines={4} />
              </div>
            ))}

            {/* Links */}
            {submission.links && (
              <div className="pb-4 mb-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: '11px',
                  fontWeight: 600,
                  color: '#525252',
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  marginBottom: 8,
                }}>
                  Links
                </div>
                <div className="flex flex-wrap gap-2">
                  {submission.links.split(/\s+/).filter((l) => l.length > 4).map((link, i) => {
                    const clean = link.replace(/^-/, '').trim();
                    if (!clean.startsWith('http')) return null;
                    return (
                      <LinkChip
                        key={i}
                        label={clean.replace(/^https?:\/\//, '').slice(0, 40)}
                        href={clean}
                      />
                    );
                  })}
                </div>
              </div>
            )}
          </motion.div>

          {/* ── Section 4: Founders ── */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.2, ease: EASE }}
            style={{
              marginTop: 16,
              paddingTop: 20,
              borderTop: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <div className="flex items-center gap-2 mb-4">
              <span style={{
                fontFamily: "'Manrope', sans-serif",
                fontSize: '16px',
                fontWeight: 600,
                color: '#F0F0F0',
              }}>
                Founders
              </span>
              <span
                className="rounded-full"
                style={{
                  padding: '2px 8px',
                  backgroundColor: 'rgba(245,166,35,0.15)',
                  fontSize: '11px',
                  fontWeight: 600,
                  color: '#F5A623',
                }}
              >
                {submission.founders.length}
              </span>
            </div>

            <div className="flex flex-col gap-3">
              {submission.founders.map((founder, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: 0.25 + i * 0.06, ease: EASE }}
                  className="rounded-lg"
                  style={{
                    padding: '14px 16px',
                    backgroundColor: '#222',
                    borderLeft: '3px solid #F5A623',
                  }}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <span className="rounded-full flex-shrink-0" style={{
                      width: 36,
                      height: 36,
                      backgroundColor: '#2A2A2A',
                      border: '1px solid rgba(255,255,255,0.06)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '14px',
                      fontWeight: 600,
                      color: '#F5A623',
                      fontFamily: "'Manrope', sans-serif",
                    }}>
                      {founder.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                    </span>
                    <div>
                      <div style={{
                        fontFamily: "'Inter', sans-serif",
                        fontSize: '14px',
                        fontWeight: 600,
                        color: '#F0F0F0',
                      }}>
                        {founder.name}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 ml-12">
                    {founder.x && (
                      <LinkChip
                        label={founder.x}
                        href={`https://x.com/${founder.x.replace('@', '')}`}
                        icon={<ExternalLink size={10} />}
                      />
                    )}
                    {founder.email && (
                      <a
                        href={`mailto:${founder.email}`}
                        className="inline-flex items-center gap-1.5 rounded-md transition-all duration-150"
                        style={{
                          padding: '4px 10px',
                          backgroundColor: '#2A2A2A',
                          color: '#8A8A8A',
                          fontSize: '12px',
                          fontFamily: "'Inter', sans-serif",
                          textDecoration: 'none',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = '#F5A623'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = '#8A8A8A'; }}
                      >
                        <Mail size={10} />
                        {founder.email}
                      </a>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* ── Section 5: Needs-Help Tags ── */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.25, ease: EASE }}
            style={{
              marginTop: 20,
              paddingTop: 20,
              borderTop: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <div style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: '12px',
              fontWeight: 600,
              color: '#525252',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              marginBottom: 12,
            }}>
              Needs Help With
            </div>
            <div className="flex flex-wrap gap-2">
              {submission.needs_help.map((tag) => (
                <span
                  key={tag}
                  className="inline-block rounded-md transition-all duration-150"
                  style={{
                    padding: '4px 10px',
                    backgroundColor: '#222',
                    color: '#8A8A8A',
                    fontFamily: "'Inter', sans-serif",
                    fontSize: '11px',
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.border = '1px solid rgba(255,255,255,0.1)';
                    e.currentTarget.style.color = '#F0F0F0';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.border = '1px solid transparent';
                    e.currentTarget.style.color = '#8A8A8A';
                  }}
                  onClick={() => {
                    router.push(`/submissions?tag=${encodeURIComponent(tag)}`);
                  }}
                >
                  {tag}
                </span>
              ))}
            </div>
          </motion.div>

          {/* ── Section 6: Activity Log ── */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.3, ease: EASE }}
            style={{
              marginTop: 20,
              paddingTop: 20,
              borderTop: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span style={{
                  fontFamily: "'Manrope', sans-serif",
                  fontSize: '16px',
                  fontWeight: 600,
                  color: '#F0F0F0',
                }}>
                  Activity Log
                </span>
                <span
                  className="rounded-full"
                  style={{
                    padding: '2px 8px',
                    backgroundColor: 'rgba(245,166,35,0.15)',
                    fontSize: '11px',
                    fontWeight: 600,
                    color: '#F5A623',
                  }}
                >
                  {activities.length}
                </span>
              </div>
            </div>

            {/* Timeline */}
            <div className="pl-1">
              {activities.map((activity) => (
                <TimelineEntry key={activity.id} activity={activity} />
              ))}
            </div>

            {/* Quick-add note */}
            <div
              className="mt-4 pt-4"
              style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
            >
              {/* Activity type selector */}
              <div className="flex items-center gap-1 mb-3">
                {ACTIVITY_TYPES.map((t) => (
                  <button
                    key={t.type}
                    onClick={() => setActivityType(t.type)}
                    className="inline-flex items-center gap-1.5 rounded-md transition-all duration-150"
                    style={{
                      padding: '6px 12px',
                      backgroundColor: activityType === t.type ? '#2A2A2A' : 'transparent',
                      color: activityType === t.type ? t.color : '#525252',
                      fontSize: '12px',
                      fontFamily: "'Inter', sans-serif",
                    }}
                  >
                    <t.icon size={14} />
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Textarea */}
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Add a note..."
                className="w-full rounded-md outline-none resize-none transition-all duration-150"
                style={{
                  minHeight: 60,
                  maxHeight: 200,
                  padding: 12,
                  backgroundColor: '#141414',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: '#F0F0F0',
                  fontFamily: "'Inter', sans-serif",
                  fontSize: '13px',
                  lineHeight: 1.5,
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = '#F5A623';
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(245,166,35,0.15)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              />

              {/* Submit */}
              <div className="flex justify-end mt-2">
                <button
                  onClick={handleAddActivity}
                  disabled={!noteText.trim()}
                  className="rounded-md transition-all duration-150 disabled:opacity-40"
                  style={{
                    padding: '8px 16px',
                    backgroundColor: '#F5A623',
                    color: '#0D0D0D',
                    fontSize: '13px',
                    fontWeight: 600,
                    fontFamily: "'Inter', sans-serif",
                  }}
                  onMouseEnter={(e) => {
                    if (noteText.trim()) {
                      e.currentTarget.style.backgroundColor = '#E8941A';
                      e.currentTarget.style.boxShadow = '0 0 20px rgba(245,166,35,0.15)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#F5A623';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  Log Activity
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      </motion.div>
      <SubmissionFormModal
        open={editOpen}
        mode="edit"
        initial={submission ? valuesFromSubmission(submission) : undefined}
        onClose={() => setEditOpen(false)}
        onSubmit={handleEdit}
      />
    </div>
  );
};

export default Profile;
