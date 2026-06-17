'use client';
import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { can } from '@/lib/access';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  List,
  Check,
  ExternalLink,
  Plus,
  AlertTriangle,
} from 'lucide-react';
import { useSubmissionStore, useOwnerNames } from '@/store/useSubmissionStore';
import SubmissionFormModal, { type SubmissionFormValues } from '@/components/SubmissionFormModal';
import { toast } from 'sonner';
import ScoreBadge from '@/components/ScoreBadge';
import StagePill from '@/components/StagePill';
import OnchainBadge from '@/components/OnchainBadge';
import { formatUsd } from '@/data/stats';
import { formatDistanceToNow, parseISO } from 'date-fns';

const EASE = [0.16, 1, 0.3, 1] as [number, number, number, number];

/* ─── Constants ─── */
const STAGE_OPTIONS = ['New', 'Reviewing', 'Contacted', 'In Convo', 'Onboarding', 'Won', 'Passed'];
const TAG_OPTIONS = [
  'Community growth',
  'Partnerships',
  'GTM / distribution',
  'Fundraising',
  'Product strategy',
  'Token launch strategy',
  'Technical architecture',
  'Security',
  'Hiring',
  'Other',
];
const SOURCE_OPTIONS = ['google_form', 'plain'];
const SORT_OPTIONS = [
  { key: 'score', label: 'Score' },
  { key: 'submitted_at', label: 'Date submitted' },
  { key: 'project', label: 'Project name' },
  { key: 'vol_24h', label: '24h vol' },
  { key: 'stage', label: 'Stage' },
];
const ROWS_PER_PAGE_OPTIONS = [25, 50, 100];

/* ─── Simple dropdown component ─── */
interface DropdownProps {
  trigger: React.ReactNode;
  children: React.ReactNode;
  open: boolean;
  onClose: () => void;
  width?: number;
}

const Dropdown: React.FC<DropdownProps> = ({ trigger, children, open, onClose, width = 200 }) => {
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
              width,
              backgroundColor: '#1A1A1A',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: '8px',
              boxShadow: '0 4px 16px rgba(0,0,0,0.4), 0 0 1px rgba(255,255,255,0.06)',
            }}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

/* ─── Checkbox ─── */
const Checkbox: React.FC<{ checked: boolean; onChange: () => void; size?: number }> = ({
  checked,
  onChange,
  size = 16,
}) => (
  <div
    className="inline-flex items-center justify-center flex-shrink-0 cursor-pointer rounded transition-all duration-150"
    style={{
      width: size,
      height: size,
      border: checked ? 'none' : '1px solid rgba(255,255,255,0.14)',
      backgroundColor: checked ? '#F5A623' : 'transparent',
    }}
    onClick={(e) => {
      e.stopPropagation();
      onChange();
    }}
  >
    {checked && <Check size={10} color="#0D0D0D" strokeWidth={3} />}
  </div>
);

/* ─── Toggle Switch ─── */
const Toggle: React.FC<{ checked: boolean; onChange: () => void; label?: string }> = ({
  checked,
  onChange,
  label,
}) => (
  <button
    onClick={onChange}
    className="inline-flex items-center gap-2 transition-all duration-150"
  >
    <span
      className="relative inline-block rounded-full transition-colors duration-150"
      style={{
        width: 32,
        height: 18,
        backgroundColor: checked ? '#F5A623' : '#222',
      }}
    >
      <span
        className="absolute top-0.5 rounded-full transition-transform duration-150"
        style={{
          width: 14,
          height: 14,
          backgroundColor: '#fff',
          left: checked ? 15 : 3,
        }}
      />
    </span>
    {label && (
      <span style={{ fontFamily: "'Inter', sans-serif", fontSize: '12px', color: '#8A8A8A' }}>
        {label}
      </span>
    )}
  </button>
);

/* ─── Score Range Slider ─── */
const ScoreRangeSlider: React.FC<{
  min: number;
  max: number;
  onChange: (min: number, max: number) => void;
}> = ({ min, max, onChange }) => {
  const minRef = useRef<HTMLInputElement>(null);
  const maxRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex items-center gap-2">
      <span style={{ fontSize: '12px', color: '#8A8A8A', whiteSpace: 'nowrap' }}>
        Score: {min}-{max}
      </span>
      <div className="relative flex items-center" style={{ width: 100, height: 16 }}>
        <div className="absolute w-full rounded-full" style={{ height: 4, backgroundColor: '#222' }} />
        <div
          className="absolute rounded-full"
          style={{
            height: 4,
            backgroundColor: '#F5A623',
            left: `${(min / 100) * 100}%`,
            right: `${100 - (max / 100) * 100}%`,
          }}
        />
        <input
          ref={minRef}
          type="range"
          min={0}
          max={100}
          value={min}
          onChange={(e) => {
            const v = Math.min(Number(e.target.value), max - 1);
            onChange(v, max);
          }}
          className="absolute w-full opacity-0 cursor-pointer"
          style={{ height: 16, zIndex: 2, pointerEvents: 'auto' }}
        />
        <input
          ref={maxRef}
          type="range"
          min={0}
          max={100}
          value={max}
          onChange={(e) => {
            const v = Math.max(Number(e.target.value), min + 1);
            onChange(min, v);
          }}
          className="absolute w-full opacity-0 cursor-pointer"
          style={{ height: 16, zIndex: 2, pointerEvents: 'auto' }}
        />
        <div
          className="absolute rounded-full"
          style={{
            width: 14,
            height: 14,
            backgroundColor: '#1A1A1A',
            border: '2px solid rgba(255,255,255,0.14)',
            left: `calc(${(min / 100) * 100}% - 7px)`,
          }}
        />
        <div
          className="absolute rounded-full"
          style={{
            width: 14,
            height: 14,
            backgroundColor: '#1A1A1A',
            border: '2px solid rgba(255,255,255,0.14)',
            left: `calc(${(max / 100) * 100}% - 7px)`,
          }}
        />
      </div>
    </div>
  );
};

/* ─── Inline Stage Editor ─── */
const InlineStageEditor: React.FC<{
  stage: string;
  onChange: (stage: string) => void;
}> = ({ stage, onChange }) => {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <div className="relative">
        <div
          className="absolute z-20 overflow-hidden"
          style={{
            backgroundColor: '#1A1A1A',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '8px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
            minWidth: 140,
          }}
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
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#222';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
              onClick={(e) => {
                e.stopPropagation();
                onChange(s);
                setEditing(false);
              }}
            >
              <span className="inline-block rounded-full mr-2" style={{
                width: 8,
                height: 8,
                backgroundColor: s === 'New' ? '#64748B' : s === 'Reviewing' ? '#3B82F6' : s === 'Contacted' ? '#F59E0B' : s === 'In Convo' ? '#8B5CF6' : s === 'Onboarding' ? '#14B8A6' : s === 'Won' ? '#10B981' : '#6B7280',
              }} />
              {s}
            </button>
          ))}
        </div>
        <div className="fixed inset-0 z-10" onClick={() => setEditing(false)} />
      </div>
    );
  }

  return (
    <span className="cursor-pointer" onClick={(e) => {
      e.stopPropagation();
      setEditing(true);
    }}>
      <StagePill stage={stage} />
    </span>
  );
};

/* ─── Inline Owner Editor ─── */
const InlineOwnerEditor: React.FC<{
  owner: string;
  onChange: (owner: string) => void;
}> = ({ owner, onChange }) => {
  const [editing, setEditing] = useState(false);
  const ownerNames = useOwnerNames();
  const OWNER_OPTIONS = [...ownerNames, 'Unassigned'];
  const display = owner || '\u2014';

  if (editing) {
    return (
      <div className="relative">
        <div
          className="absolute z-20 overflow-hidden"
          style={{
            backgroundColor: '#1A1A1A',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '8px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
            minWidth: 140,
          }}
        >
          {OWNER_OPTIONS.map((o) => (
            <button
              key={o}
              className="block w-full text-left px-3 py-2 transition-colors duration-100"
              style={{
                fontSize: '12px',
                color: o === (owner || 'Unassigned') ? '#F5A623' : '#F0F0F0',
                fontFamily: "'Inter', sans-serif",
                backgroundColor: o === (owner || 'Unassigned') ? 'rgba(245,166,35,0.1)' : 'transparent',
              }}
              onMouseEnter={(e) => {
                if (o !== (owner || 'Unassigned')) e.currentTarget.style.backgroundColor = '#222';
              }}
              onMouseLeave={(e) => {
                if (o !== (owner || 'Unassigned')) e.currentTarget.style.backgroundColor = 'transparent';
              }}
              onClick={(e) => {
                e.stopPropagation();
                onChange(o === 'Unassigned' ? '' : o);
                setEditing(false);
              }}
            >
              <span className="inline-block rounded-full mr-2" style={{
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
        </div>
        <div className="fixed inset-0 z-10" onClick={() => setEditing(false)} />
      </div>
    );
  }

  return (
    <button
      className="inline-flex items-center gap-1.5 transition-colors duration-150"
      style={{ fontSize: '13px', color: owner ? '#F0F0F0' : '#525252', fontFamily: "'Inter', sans-serif" }}
      onClick={(e) => {
        e.stopPropagation();
        setEditing(true);
      }}
    >
      {owner && (
        <span className="rounded-full flex-shrink-0" style={{
          width: 20,
          height: 20,
          backgroundColor: '#222',
          border: '1px solid rgba(255,255,255,0.06)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '9px',
          color: '#8A8A8A',
        }}>
          {owner[0]}
        </span>
      )}
      {display}
    </button>
  );
};

/* ─── Needs Help Tag Inline ─── */
const NeedsHelpTag: React.FC<{ tag: string }> = ({ tag }) => (
  <span
    className="inline-block rounded-md transition-all duration-150 cursor-default"
    style={{
      padding: '3px 8px',
      backgroundColor: '#222',
      color: '#8A8A8A',
      fontFamily: "'Inter', sans-serif",
      fontSize: '11px',
      fontWeight: 500,
      lineHeight: 1,
    }}
    onMouseEnter={(e) => {
      e.currentTarget.style.border = '1px solid rgba(255,255,255,0.1)';
      e.currentTarget.style.color = '#F0F0F0';
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.border = '1px solid transparent';
      e.currentTarget.style.color = '#8A8A8A';
    }}
  >
    {tag}
  </span>
);

/* ─── Grid Card ─── */
const SubmissionGridCard: React.FC<{
  submission: import('@/types').Submission;
  onClick: () => void;
}> = ({ submission, onClick }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: EASE }}
      className="cursor-pointer rounded-xl transition-all duration-200"
      style={{
        backgroundColor: '#1A1A1A',
        backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0) 100%)',
        border: '1px solid rgba(255,255,255,0.06)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.3), 0 0 1px rgba(255,255,255,0.04)',
        padding: '16px',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
        e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.4), 0 0 1px rgba(255,255,255,0.06)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)';
        e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.3), 0 0 1px rgba(255,255,255,0.04)';
      }}
      onClick={onClick}
    >
      <div className="flex items-start justify-between mb-3">
        <StagePill stage={submission.stage} />
        <ScoreBadge score={submission.score} breakdown={submission.score_breakdown} small showTooltip />
      </div>

      <h3
        className="mb-1"
        style={{
          fontFamily: "'Manrope', sans-serif",
          fontSize: '14px',
          fontWeight: 600,
          color: submission.low_effort ? '#525252' : '#F0F0F0',
          lineHeight: 1.3,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
      >
        {submission.project}
      </h3>

      {submission.project_x && (
        <a
          href={`https://x.com/${submission.project_x.replace('@', '')}`}
          target="_blank"
          rel="noopener noreferrer"
          className="block mb-2 transition-colors duration-150"
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '11px',
            color: '#525252',
            textDecoration: 'none',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#F5A623'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = '#525252'; }}
          onClick={(e) => e.stopPropagation()}
        >
          {submission.project_x}
        </a>
      )}

      {(!!submission.token || !!submission.contract_address) && (
        <div className="mb-2">
          <OnchainBadge />
        </div>
      )}

      {submission.needs_review ? (
        <div className="mb-3 inline-flex items-center gap-1.5" style={{ backgroundColor: 'rgba(245,166,35,0.12)', border: '1px solid rgba(245,166,35,0.3)', borderRadius: 6, padding: '3px 8px' }}>
          <AlertTriangle size={12} style={{ color: '#F5A623' }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: '#F5A623' }}>
            Needs review · {(submission.review_candidates?.length ?? 0)} tokens
          </span>
        </div>
      ) : (
        <div
          className="mb-3"
          style={{ fontFamily: "'Inter', sans-serif", fontSize: '12px', color: submission.vol_24h != null ? '#10B981' : '#525252' }}
        >
          24h: {formatUsd(submission.vol_24h)}
        </div>
      )}

      <div className="flex flex-wrap gap-1 mb-3">
        {submission.needs_help.slice(0, 2).map((tag) => (
          <NeedsHelpTag key={tag} tag={tag} />
        ))}
        {submission.needs_help.length > 2 && (
          <span style={{ fontSize: '11px', color: '#525252' }}>+{submission.needs_help.length - 2}</span>
        )}
      </div>

      <div className="flex items-center justify-between pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-1.5">
          {submission.owner ? (
            <>
              <span className="rounded-full" style={{
                width: 20,
                height: 20,
                backgroundColor: '#222',
                border: '1px solid rgba(255,255,255,0.06)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '9px',
                color: '#8A8A8A',
              }}>
                {submission.owner[0]}
              </span>
              <span style={{ fontSize: '12px', color: '#8A8A8A' }}>{submission.owner}</span>
            </>
          ) : (
            <span style={{ fontSize: '12px', color: '#525252' }}>Unassigned</span>
          )}
        </div>
        <span style={{ fontFamily: "'Inter', sans-serif", fontSize: '12px', color: '#525252' }}>
          {submission.submitted_at ? formatDistanceToNow(parseISO(submission.submitted_at.split('.')[0].replace(' ', 'T')), { addSuffix: false }) : ''}
        </span>
      </div>
    </motion.div>
  );
};

/* ─── Main Submissions Page ─── */
const Submissions: React.FC = () => {
  const router = useRouter();
  const {
    submissions: allSubs,
    filters,
    sort,
    setFilters,
    setSort,
    updateStage,
    updateOwner,
    filteredSubmissions,
    me,
    createSubmission,
  } = useSubmissionStore();
  const ownerNames = useOwnerNames();
  const OWNER_OPTIONS = [...ownerNames, 'Unassigned'];

  const [addOpen, setAddOpen] = useState(false);
  const handleCreate = useCallback(async (v: SubmissionFormValues): Promise<string | null> => {
    const r = await createSubmission(v as unknown as Record<string, unknown>);
    if (r.ok) toast.success('Submission added', { description: v.project });
    return r.ok ? null : (r.error || 'failed');
  }, [createSubmission]);

  const results = useMemo(() => filteredSubmissions(), [allSubs, filters, sort, filteredSubmissions]);

  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [localSearch, setLocalSearch] = useState('');

  // Dropdown open states
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  // Debounce local search into store
  useEffect(() => {
    const timer = setTimeout(() => {
      useSubmissionStore.getState().setSearch(localSearch);
    }, 200);
    return () => clearTimeout(timer);
  }, [localSearch]);

  const totalPages = Math.max(1, Math.ceil(results.length / rowsPerPage));
  const startIdx = (currentPage - 1) * rowsPerPage;
  const paginated = results.slice(startIdx, startIdx + rowsPerPage);

  const allSelected = paginated.length > 0 && paginated.every((s) => selectedIds.has(s.id));

  const toggleSelectAll = useCallback(() => {
    if (allSelected) {
      const next = new Set(selectedIds);
      paginated.forEach((s) => next.delete(s.id));
      setSelectedIds(next);
    } else {
      const next = new Set(selectedIds);
      paginated.forEach((s) => next.add(s.id));
      setSelectedIds(next);
    }
  }, [allSelected, paginated, selectedIds]);

  const toggleSelectRow = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearAll = useCallback(() => setSelectedIds(new Set()), []);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.stage.length > 0) count++;
    if (filters.tags.length > 0) count++;
    if (filters.owner) count++;
    if (filters.source) count++;
    if (filters.liveOnly) count++;
    if (filters.reviewOnly) count++;
    if (filters.hideLowEffort) count++;
    if ((filters.scoreMin ?? 0) > 0 || (filters.scoreMax ?? 100) < 100) count++;
    return count;
  }, [filters]);

  const hasActiveFilters = activeFilterCount > 0 || localSearch;

  const clearAllFilters = useCallback(() => {
    setFilters({
      stage: [],
      tags: [],
      owner: null,
      source: null,
      liveOnly: false,
      reviewOnly: false,
      hideLowEffort: false,
      scoreMin: 0,
      scoreMax: 100,
    });
    setLocalSearch('');
    useSubmissionStore.getState().setSearch('');
  }, [setFilters]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [filters, localSearch]);

  const handleSort = useCallback(
    (key: string) => {
      if (sort.key === key) {
        setSort({ key, direction: sort.direction === 'asc' ? 'desc' : 'asc' });
      } else {
        setSort({ key, direction: 'desc' });
      }
    },
    [sort, setSort]
  );

  // Bulk actions
  // Selected submissions for bulk actions
  useMemo(
    () => allSubs.filter((s) => selectedIds.has(s.id)),
    [allSubs, selectedIds]
  );

  const handleBulkStage = useCallback(
    (stage: string) => {
      selectedIds.forEach((id) => updateStage(id, stage));
      clearAll();
    },
    [selectedIds, updateStage, clearAll]
  );

  const handleBulkOwner = useCallback(
    (owner: string) => {
      selectedIds.forEach((id) => updateOwner(id, owner === 'Unassigned' ? '' : owner));
      clearAll();
    },
    [selectedIds, updateOwner, clearAll]
  );

  /* ─── Render ─── */
  return (
    <div>
      {/* Filter Bar */}
      <div
        className="sticky flex items-center gap-2 flex-wrap"
        style={{
          top: 48,
          zIndex: 10,
          minHeight: 48,
          backgroundColor: '#141414',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          padding: '8px 32px',
          margin: '0 -32px 16px -32px',
        }}
      >
        {me && can(me.role, 'submissions.edit') && (
          <button
            onClick={() => setAddOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 rounded-md transition-all duration-150"
            style={{ height: 32, backgroundColor: '#F5A623', color: '#0D0D0D', fontSize: 12, fontWeight: 600, flexShrink: 0 }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#E8941A'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#F5A623'; }}
          >
            <Plus size={14} />
            Add
          </button>
        )}
        {/* Stage Dropdown */}
        <Dropdown
          open={openDropdown === 'stage'}
          onClose={() => setOpenDropdown(null)}
          width={180}
          trigger={
            <button
              onClick={() => setOpenDropdown(openDropdown === 'stage' ? null : 'stage')}
              className="inline-flex items-center gap-1.5 rounded-md transition-all duration-150 shrink-0"
              style={{
                height: 32,
                padding: '0 12px',
                backgroundColor: filters.stage.length > 0 ? 'rgba(245,166,35,0.15)' : '#222',
                border: filters.stage.length > 0 ? '1px solid rgba(245,166,35,0.4)' : '1px solid transparent',
                color: filters.stage.length > 0 ? '#F5A623' : '#8A8A8A',
                fontSize: '12px',
                fontFamily: "'Inter', sans-serif",
                fontWeight: 500,
              }}
            >
              Stage{filters.stage.length > 0 ? `: ${filters.stage.length}` : ''}
              <ChevronDown size={12} />
            </button>
          }
        >
          <div style={{ maxHeight: 280, overflowY: 'auto' }}>
            <button
              className="block w-full text-left px-3 py-2 transition-colors duration-100"
              style={{ fontSize: '12px', color: '#F0F0F0', fontFamily: "'Inter', sans-serif" }}
              onClick={() => setFilters({ stage: [] })}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#222'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
            >
              All
            </button>
            {STAGE_OPTIONS.map((s) => (
              <button
                key={s}
                className="flex items-center gap-2 w-full text-left px-3 py-2 transition-colors duration-100"
                style={{
                  fontSize: '12px',
                  color: filters.stage.includes(s) ? '#F5A623' : '#F0F0F0',
                  fontFamily: "'Inter', sans-serif",
                  backgroundColor: filters.stage.includes(s) ? 'rgba(245,166,35,0.1)' : 'transparent',
                }}
                onClick={() => {
                  setFilters({
                    stage: filters.stage.includes(s)
                      ? filters.stage.filter((x) => x !== s)
                      : [...filters.stage, s],
                  });
                }}
                onMouseEnter={(e) => { if (!filters.stage.includes(s)) e.currentTarget.style.backgroundColor = '#222'; }}
                onMouseLeave={(e) => { if (!filters.stage.includes(s)) e.currentTarget.style.backgroundColor = 'transparent'; }}
              >
                <Checkbox
                  checked={filters.stage.includes(s)}
                  onChange={() => {}}
                  size={14}
                />
                <span className="inline-block rounded-full" style={{
                  width: 8,
                  height: 8,
                  backgroundColor: s === 'New' ? '#64748B' : s === 'Reviewing' ? '#3B82F6' : s === 'Contacted' ? '#F59E0B' : s === 'In Convo' ? '#8B5CF6' : s === 'Onboarding' ? '#14B8A6' : s === 'Won' ? '#10B981' : '#6B7280',
                }} />
                {s}
              </button>
            ))}
          </div>
        </Dropdown>

        {/* Tags Dropdown */}
        <Dropdown
          open={openDropdown === 'tags'}
          onClose={() => setOpenDropdown(null)}
          width={200}
          trigger={
            <button
              onClick={() => setOpenDropdown(openDropdown === 'tags' ? null : 'tags')}
              className="inline-flex items-center gap-1.5 rounded-md transition-all duration-150 shrink-0"
              style={{
                height: 32,
                padding: '0 12px',
                backgroundColor: filters.tags.length > 0 ? 'rgba(245,166,35,0.15)' : '#222',
                border: filters.tags.length > 0 ? '1px solid rgba(245,166,35,0.4)' : '1px solid transparent',
                color: filters.tags.length > 0 ? '#F5A623' : '#8A8A8A',
                fontSize: '12px',
                fontFamily: "'Inter', sans-serif",
                fontWeight: 500,
              }}
            >
              Needs Help{filters.tags.length > 0 ? `: ${filters.tags.length}` : ''}
              <ChevronDown size={12} />
            </button>
          }
        >
          <div style={{ maxHeight: 280, overflowY: 'auto' }}>
            {TAG_OPTIONS.map((t) => (
              <button
                key={t}
                className="flex items-center gap-2 w-full text-left px-3 py-2 transition-colors duration-100"
                style={{
                  fontSize: '12px',
                  color: filters.tags.includes(t) ? '#F5A623' : '#F0F0F0',
                  fontFamily: "'Inter', sans-serif",
                  backgroundColor: filters.tags.includes(t) ? 'rgba(245,166,35,0.1)' : 'transparent',
                }}
                onClick={() => {
                  setFilters({
                    tags: filters.tags.includes(t)
                      ? filters.tags.filter((x) => x !== t)
                      : [...filters.tags, t],
                  });
                }}
                onMouseEnter={(e) => { if (!filters.tags.includes(t)) e.currentTarget.style.backgroundColor = '#222'; }}
                onMouseLeave={(e) => { if (!filters.tags.includes(t)) e.currentTarget.style.backgroundColor = 'transparent'; }}
              >
                <Checkbox checked={filters.tags.includes(t)} onChange={() => {}} size={14} />
                <span
                  className="rounded-md"
                  style={{ padding: '2px 6px', backgroundColor: '#222', color: '#8A8A8A', fontSize: '10px' }}
                >
                  {t}
                </span>
              </button>
            ))}
          </div>
        </Dropdown>

        {/* Owner Dropdown */}
        <Dropdown
          open={openDropdown === 'owner'}
          onClose={() => setOpenDropdown(null)}
          width={160}
          trigger={
            <button
              onClick={() => setOpenDropdown(openDropdown === 'owner' ? null : 'owner')}
              className="inline-flex items-center gap-1.5 rounded-md transition-all duration-150 shrink-0"
              style={{
                height: 32,
                padding: '0 12px',
                backgroundColor: filters.owner ? 'rgba(245,166,35,0.15)' : '#222',
                border: filters.owner ? '1px solid rgba(245,166,35,0.4)' : '1px solid transparent',
                color: filters.owner ? '#F5A623' : '#8A8A8A',
                fontSize: '12px',
                fontFamily: "'Inter', sans-serif",
                fontWeight: 500,
              }}
            >
              {filters.owner || 'All Owners'}
              <ChevronDown size={12} />
            </button>
          }
        >
          <div>
            <button
              className="block w-full text-left px-3 py-2 transition-colors duration-100"
              style={{
                fontSize: '12px',
                color: !filters.owner ? '#F5A623' : '#F0F0F0',
                fontFamily: "'Inter', sans-serif",
                backgroundColor: !filters.owner ? 'rgba(245,166,35,0.1)' : 'transparent',
              }}
              onClick={() => setFilters({ owner: null })}
              onMouseEnter={(e) => { if (filters.owner) e.currentTarget.style.backgroundColor = '#222'; }}
              onMouseLeave={(e) => { if (filters.owner) e.currentTarget.style.backgroundColor = 'transparent'; }}
            >
              All Owners
            </button>
            {OWNER_OPTIONS.map((o) => (
              <button
                key={o}
                className="flex items-center gap-2 w-full text-left px-3 py-2 transition-colors duration-100"
                style={{
                  fontSize: '12px',
                  color: filters.owner === (o === 'Unassigned' ? '' : o) ? '#F5A623' : '#F0F0F0',
                  fontFamily: "'Inter', sans-serif",
                  backgroundColor: filters.owner === (o === 'Unassigned' ? '' : o) ? 'rgba(245,166,35,0.1)' : 'transparent',
                }}
                onClick={() => setFilters({ owner: o === 'Unassigned' ? null : o })}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#222'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
              >
                <span className="rounded-full" style={{
                  width: 16, height: 16, backgroundColor: '#222', border: '1px solid rgba(255,255,255,0.1)',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '8px', color: '#8A8A8A',
                }}>
                  {o[0]}
                </span>
                {o}
              </button>
            ))}
          </div>
        </Dropdown>

        {/* Source Dropdown */}
        <Dropdown
          open={openDropdown === 'source'}
          onClose={() => setOpenDropdown(null)}
          width={160}
          trigger={
            <button
              onClick={() => setOpenDropdown(openDropdown === 'source' ? null : 'source')}
              className="inline-flex items-center gap-1.5 rounded-md transition-all duration-150 shrink-0"
              style={{
                height: 32,
                padding: '0 12px',
                backgroundColor: filters.source ? 'rgba(245,166,35,0.15)' : '#222',
                border: filters.source ? '1px solid rgba(245,166,35,0.4)' : '1px solid transparent',
                color: filters.source ? '#F5A623' : '#8A8A8A',
                fontSize: '12px',
                fontFamily: "'Inter', sans-serif",
                fontWeight: 500,
              }}
            >
              {filters.source === 'google_form' ? 'Google Form' : filters.source === 'plain' ? 'Plain' : 'All Sources'}
              <ChevronDown size={12} />
            </button>
          }
        >
          <div>
            <button
              className="block w-full text-left px-3 py-2 transition-colors duration-100"
              style={{
                fontSize: '12px',
                color: !filters.source ? '#F5A623' : '#F0F0F0',
                fontFamily: "'Inter', sans-serif",
                backgroundColor: !filters.source ? 'rgba(245,166,35,0.1)' : 'transparent',
              }}
              onClick={() => setFilters({ source: null })}
              onMouseEnter={(e) => { if (filters.source) e.currentTarget.style.backgroundColor = '#222'; }}
              onMouseLeave={(e) => { if (filters.source) e.currentTarget.style.backgroundColor = 'transparent'; }}
            >
              All Sources
            </button>
            {SOURCE_OPTIONS.map((s) => (
              <button
                key={s}
                className="flex items-center gap-2 w-full text-left px-3 py-2 transition-colors duration-100"
                style={{
                  fontSize: '12px',
                  color: filters.source === s ? '#F5A623' : '#F0F0F0',
                  fontFamily: "'Inter', sans-serif",
                  backgroundColor: filters.source === s ? 'rgba(245,166,35,0.1)' : 'transparent',
                }}
                onClick={() => setFilters({ source: s })}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#222'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
              >
                <Checkbox checked={filters.source === s} onChange={() => {}} size={14} />
                {s === 'google_form' ? 'Google Form' : 'Plain'}
              </button>
            ))}
          </div>
        </Dropdown>

        {/* Score Range */}
        <div className="shrink-0">
          <ScoreRangeSlider
            min={filters.scoreMin ?? 0}
            max={filters.scoreMax ?? 100}
            onChange={(min, max) => setFilters({ scoreMin: min, scoreMax: max })}
          />
        </div>

        {/* Toggles */}
        <div className="shrink-0">
          <Toggle
            checked={filters.liveOnly}
            onChange={() => setFilters({ liveOnly: !filters.liveOnly })}
            label="Live only"
          />
        </div>
        <div className="shrink-0">
          <Toggle
            checked={filters.reviewOnly}
            onChange={() => setFilters({ reviewOnly: !filters.reviewOnly })}
            label="Needs review"
          />
        </div>
        <div className="shrink-0">
          <Toggle
            checked={filters.hideLowEffort}
            onChange={() => setFilters({ hideLowEffort: !filters.hideLowEffort })}
            label="Hide low-effort"
          />
        </div>

        {/* Search */}
        <div className="relative flex-shrink-0" style={{ width: 180 }}>
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: '#525252' }} />
          <input
            type="text"
            placeholder="Search..."
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            className="w-full rounded-md outline-none"
            style={{
              height: 32,
              backgroundColor: '#222',
              border: '1px solid transparent',
              color: '#F0F0F0',
              fontFamily: "'Inter', sans-serif",
              fontSize: '12px',
              padding: '0 8px 0 30px',
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(245,166,35,0.4)'; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = 'transparent'; }}
          />
        </div>

        {/* Right side: active filter count, clear, view toggle */}
        <div className="flex items-center gap-2 ml-auto shrink-0">
          {activeFilterCount > 0 && (
            <span
              className="rounded-full px-2 py-0.5"
              style={{
                backgroundColor: 'rgba(245,166,35,0.15)',
                color: '#F5A623',
                fontSize: '11px',
                fontWeight: 600,
              }}
            >
              {activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''}
            </span>
          )}
          {hasActiveFilters && (
            <button
              onClick={clearAllFilters}
              className="transition-colors duration-150"
              style={{ fontSize: '12px', color: '#525252', fontFamily: "'Inter', sans-serif" }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#F5A623'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = '#525252'; }}
            >
              Clear all
            </button>
          )}

          {/* View toggle */}
          <div className="inline-flex rounded-md overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.1)' }}>
            <button
              onClick={() => setViewMode('table')}
              className="inline-flex items-center justify-center transition-colors duration-150"
              style={{
                width: 32,
                height: 32,
                backgroundColor: viewMode === 'table' ? '#222' : 'transparent',
                color: viewMode === 'table' ? '#F0F0F0' : '#525252',
              }}
            >
              <List size={16} />
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className="inline-flex items-center justify-center transition-colors duration-150"
              style={{
                width: 32,
                height: 32,
                backgroundColor: viewMode === 'grid' ? '#222' : 'transparent',
                color: viewMode === 'grid' ? '#F0F0F0' : '#525252',
              }}
            >
              <LayoutGrid size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Results Summary */}
      <div
        className="flex items-center justify-between mb-4"
        style={{ height: 36 }}
      >
        <div style={{ fontFamily: "'Inter', sans-serif", fontSize: '14px', fontWeight: 500, color: '#F0F0F0' }}>
          {results.length === allSubs.length ? (
            <span>{results.length} submissions</span>
          ) : (
            <span>
              {results.length} <span style={{ color: '#F5A623' }}>of {allSubs.length}</span> submissions
            </span>
          )}
        </div>

        {/* Sort dropdown */}
        <Dropdown
          open={openDropdown === 'sort'}
          onClose={() => setOpenDropdown(null)}
          width={180}
          trigger={
            <button
              onClick={() => setOpenDropdown(openDropdown === 'sort' ? null : 'sort')}
              className="inline-flex items-center gap-1.5 rounded-md transition-all duration-150"
              style={{
                height: 32,
                padding: '0 12px',
                backgroundColor: '#222',
                color: '#8A8A8A',
                fontSize: '12px',
                fontFamily: "'Inter', sans-serif",
                fontWeight: 500,
              }}
            >
              Sort: {SORT_OPTIONS.find((o) => o.key === sort.key)?.label || 'Score'}
              <ChevronDown size={12} />
            </button>
          }
        >
          <div>
            {SORT_OPTIONS.map((o) => (
              <button
                key={o.key}
                className="flex items-center justify-between w-full text-left px-3 py-2 transition-colors duration-100"
                style={{
                  fontSize: '12px',
                  color: sort.key === o.key ? '#F5A623' : '#F0F0F0',
                  fontFamily: "'Inter', sans-serif",
                  backgroundColor: sort.key === o.key ? 'rgba(245,166,35,0.1)' : 'transparent',
                }}
                onClick={() => handleSort(o.key)}
                onMouseEnter={(e) => { if (sort.key !== o.key) e.currentTarget.style.backgroundColor = '#222'; }}
                onMouseLeave={(e) => { if (sort.key !== o.key) e.currentTarget.style.backgroundColor = 'transparent'; }}
              >
                {o.label}
                {sort.key === o.key && (
                  <span style={{ fontSize: '10px', color: '#F5A623' }}>
                    {sort.direction === 'asc' ? '\u2191' : '\u2193'}
                  </span>
                )}
              </button>
            ))}
          </div>
        </Dropdown>
      </div>

      {/* Table View */}
      {viewMode === 'table' && (
        <div>
          {results.length === 0 ? (
            /* Empty state */
            <div className="flex flex-col items-center justify-center" style={{ padding: '80px 0' }}>
              <svg width="120" height="120" viewBox="0 0 120 120" fill="none" style={{ marginBottom: 24 }}>
                <rect x="20" y="30" width="80" height="60" rx="8" stroke="#525252" strokeWidth="2" strokeDasharray="4 4" />
                <path d="M40 55h40M40 65h30" stroke="#525252" strokeWidth="2" strokeLinecap="round" />
                <circle cx="85" cy="35" r="12" fill="#222" stroke="#525252" strokeWidth="2" />
                <path d="M80 35l3.5 3.5L92 30" stroke="#525252" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <h3 style={{ fontFamily: "'Manrope', sans-serif", fontSize: '16px', fontWeight: 600, color: '#F0F0F0', marginBottom: 8 }}>
                {hasActiveFilters ? 'No submissions match your filters' : 'No submissions yet'}
              </h3>
              <p style={{ fontFamily: "'Inter', sans-serif", fontSize: '13px', color: '#8A8A8A', marginBottom: 16 }}>
                {hasActiveFilters ? 'Try adjusting your filters to see more results' : 'Import from Google Sheets to get started'}
              </p>
              {hasActiveFilters && (
                <button
                  onClick={clearAllFilters}
                  className="rounded-md transition-all duration-150"
                  style={{
                    padding: '8px 16px',
                    backgroundColor: 'transparent',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: '#F0F0F0',
                    fontSize: '13px',
                    fontWeight: 600,
                    fontFamily: "'Inter', sans-serif",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#F5A623';
                    e.currentTarget.style.borderColor = '#F5A623';
                    e.currentTarget.style.color = '#0D0D0D';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
                    e.currentTarget.style.color = '#F0F0F0';
                  }}
                >
                  Clear all filters
                </button>
              )}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr
                    style={{
                      height: 40,
                      backgroundColor: '#1A1A1A',
                      borderBottom: '1px solid rgba(255,255,255,0.1)',
                    }}
                  >
                    <th style={{ width: 40, padding: '0 8px', textAlign: 'left' }}>
                      <div className="flex justify-center">
                        <Checkbox checked={allSelected} onChange={toggleSelectAll} size={16} />
                      </div>
                    </th>
                    <th style={{ width: '22%', padding: '0 16px', textAlign: 'left' }}>
                      <span style={{
                        fontFamily: "'Inter', sans-serif",
                        fontSize: '11px',
                        fontWeight: 600,
                        color: '#525252',
                        letterSpacing: '0.04em',
                        textTransform: 'uppercase',
                      }}>
                        Project
                      </span>
                    </th>
                    <th style={{ width: 70, padding: '0 8px', textAlign: 'left' }}>
                      <button
                        className="inline-flex items-center gap-1 transition-colors duration-150"
                        onClick={() => handleSort('score')}
                        style={{ cursor: 'pointer' }}
                      >
                        <span style={{
                          fontFamily: "'Inter', sans-serif",
                          fontSize: '11px',
                          fontWeight: 600,
                          color: sort.key === 'score' ? '#F5A623' : '#525252',
                          letterSpacing: '0.04em',
                          textTransform: 'uppercase',
                        }}>
                          Score
                        </span>
                        {sort.key === 'score' && (
                          <span style={{ fontSize: '10px', color: '#F5A623' }}>{sort.direction === 'asc' ? '\u2191' : '\u2193'}</span>
                        )}
                      </button>
                    </th>
                    <th style={{ width: 110, padding: '0 8px', textAlign: 'left' }}>
                      <button
                        className="inline-flex items-center gap-1 transition-colors duration-150"
                        onClick={() => handleSort('stage')}
                        style={{ cursor: 'pointer' }}
                      >
                        <span style={{
                          fontFamily: "'Inter', sans-serif",
                          fontSize: '11px',
                          fontWeight: 600,
                          color: sort.key === 'stage' ? '#F5A623' : '#525252',
                          letterSpacing: '0.04em',
                          textTransform: 'uppercase',
                        }}>
                          Stage
                        </span>
                        {sort.key === 'stage' && (
                          <span style={{ fontSize: '10px', color: '#F5A623' }}>{sort.direction === 'asc' ? '\u2191' : '\u2193'}</span>
                        )}
                      </button>
                    </th>
                    <th style={{ width: 110, padding: '0 16px', textAlign: 'right' }}>
                      <button
                        className="inline-flex items-center gap-1 ml-auto transition-colors duration-150"
                        onClick={() => handleSort('vol_24h')}
                        style={{ cursor: 'pointer' }}
                      >
                        <span style={{
                          fontFamily: "'Inter', sans-serif",
                          fontSize: '11px',
                          fontWeight: 600,
                          color: sort.key === 'vol_24h' ? '#F5A623' : '#525252',
                          letterSpacing: '0.04em',
                          textTransform: 'uppercase',
                        }}>
                          24h Vol
                        </span>
                        {sort.key === 'vol_24h' && (
                          <span style={{ fontSize: '10px', color: '#F5A623' }}>{sort.direction === 'asc' ? '\u2191' : '\u2193'}</span>
                        )}
                      </button>
                    </th>
                    <th style={{ width: '22%', padding: '0 8px', textAlign: 'left' }}>
                      <span style={{
                        fontFamily: "'Inter', sans-serif",
                        fontSize: '11px',
                        fontWeight: 600,
                        color: '#525252',
                        letterSpacing: '0.04em',
                        textTransform: 'uppercase',
                      }}>
                        Needs Help
                      </span>
                    </th>
                    <th style={{ width: 90, padding: '0 8px', textAlign: 'left' }}>
                      <button
                        className="inline-flex items-center gap-1 transition-colors duration-150"
                        onClick={() => handleSort('owner')}
                        style={{ cursor: 'pointer' }}
                      >
                        <span style={{
                          fontFamily: "'Inter', sans-serif",
                          fontSize: '11px',
                          fontWeight: 600,
                          color: sort.key === 'owner' ? '#F5A623' : '#525252',
                          letterSpacing: '0.04em',
                          textTransform: 'uppercase',
                        }}>
                          Owner
                        </span>
                        {sort.key === 'owner' && (
                          <span style={{ fontSize: '10px', color: '#F5A623' }}>{sort.direction === 'asc' ? '\u2191' : '\u2193'}</span>
                        )}
                      </button>
                    </th>
                    <th style={{ width: 80, padding: '0 8px', textAlign: 'left' }}>
                      <button
                        className="inline-flex items-center gap-1 transition-colors duration-150"
                        onClick={() => handleSort('source')}
                        style={{ cursor: 'pointer' }}
                      >
                        <span style={{
                          fontFamily: "'Inter', sans-serif",
                          fontSize: '11px',
                          fontWeight: 600,
                          color: sort.key === 'source' ? '#F5A623' : '#525252',
                          letterSpacing: '0.04em',
                          textTransform: 'uppercase',
                        }}>
                          Source
                        </span>
                        {sort.key === 'source' && (
                          <span style={{ fontSize: '10px', color: '#F5A623' }}>{sort.direction === 'asc' ? '\u2191' : '\u2193'}</span>
                        )}
                      </button>
                    </th>
                    <th style={{ width: 90, padding: '0 8px', textAlign: 'left' }}>
                      <button
                        className="inline-flex items-center gap-1 transition-colors duration-150"
                        onClick={() => handleSort('submitted_at')}
                        style={{ cursor: 'pointer' }}
                      >
                        <span style={{
                          fontFamily: "'Inter', sans-serif",
                          fontSize: '11px',
                          fontWeight: 600,
                          color: sort.key === 'submitted_at' ? '#F5A623' : '#525252',
                          letterSpacing: '0.04em',
                          textTransform: 'uppercase',
                        }}>
                          Date
                        </span>
                        {sort.key === 'submitted_at' && (
                          <span style={{ fontSize: '10px', color: '#F5A623' }}>{sort.direction === 'asc' ? '\u2191' : '\u2193'}</span>
                        )}
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((sub, i) => {
                    const isSelected = selectedIds.has(sub.id);
                    return (
                      <motion.tr
                        key={sub.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.2, delay: i * 0.03 }}
                        className="cursor-pointer transition-colors duration-150"
                        style={{
                          height: 52,
                          backgroundColor: isSelected ? '#222' : i % 2 === 0 ? '#141414' : 'rgba(255,255,255,0.02)',
                          borderLeft: isSelected ? '3px solid #F5A623' : '3px solid transparent',
                          opacity: sub.low_effort ? 0.6 : 1,
                        }}
                        onMouseEnter={(e) => {
                          if (!isSelected) e.currentTarget.style.backgroundColor = '#222';
                        }}
                        onMouseLeave={(e) => {
                          if (!isSelected) e.currentTarget.style.backgroundColor = i % 2 === 0 ? '#141414' : 'rgba(255,255,255,0.02)';
                        }}
                        onClick={() => router.push(`/submissions/${sub.id}`)}
                      >
                        {/* Checkbox */}
                        <td style={{ padding: '0 8px' }} onClick={(e) => e.stopPropagation()}>
                          <div className="flex justify-center">
                            <Checkbox checked={isSelected} onChange={() => toggleSelectRow(sub.id)} size={16} />
                          </div>
                        </td>

                        {/* Project */}
                        <td style={{ padding: '0 16px' }}>
                          <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                              {(!!sub.token || !!sub.contract_address) && <OnchainBadge />}
                              <span style={{
                                fontFamily: "'Inter', sans-serif",
                                fontSize: '13px',
                                fontWeight: 600,
                                color: sub.low_effort ? '#525252' : '#F0F0F0',
                              }}>
                                {sub.project}
                              </span>
                            </div>
                            <span style={{
                              fontFamily: "'Inter', sans-serif",
                              fontSize: '12px',
                              color: '#525252',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              maxWidth: 200,
                            }}>
                              {sub.one_liner}
                            </span>
                            {sub.project_x && (
                              <a
                                href={`https://x.com/${sub.project_x.replace('@', '')}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 transition-colors duration-150"
                                style={{
                                  fontFamily: "'JetBrains Mono', monospace",
                                  fontSize: '12px',
                                  color: '#525252',
                                  textDecoration: 'none',
                                }}
                                onMouseEnter={(e) => { e.currentTarget.style.color = '#F5A623'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.color = '#525252'; }}
                                onClick={(e) => e.stopPropagation()}
                              >
                                {sub.project_x}
                                <ExternalLink size={10} />
                              </a>
                            )}
                          </div>
                        </td>

                        {/* Score */}
                        <td style={{ padding: '0 8px' }} onClick={(e) => e.stopPropagation()}>
                          <ScoreBadge score={sub.score} breakdown={sub.score_breakdown} small showTooltip />
                        </td>

                        {/* Stage */}
                        <td style={{ padding: '0 8px' }} onClick={(e) => e.stopPropagation()}>
                          <InlineStageEditor stage={sub.stage} onChange={(s) => updateStage(sub.id, s)} />
                        </td>

                        {/* 24h Volume / review flag */}
                        <td style={{ padding: '0 16px', textAlign: 'right' }}>
                          {sub.needs_review ? (
                            <span className="inline-flex items-center gap-1" style={{ backgroundColor: 'rgba(245,166,35,0.12)', border: '1px solid rgba(245,166,35,0.3)', borderRadius: 5, padding: '2px 7px', fontSize: 11, fontWeight: 600, color: '#F5A623', whiteSpace: 'nowrap' }} title={`${sub.review_candidates?.length ?? 0} candidate tokens — open to choose`}>
                              <AlertTriangle size={11} /> Review
                            </span>
                          ) : (
                            <span style={{
                              fontFamily: "'Inter', sans-serif", fontSize: '13px', fontWeight: 500,
                              color: sub.vol_24h != null ? '#10B981' : '#525252',
                              textShadow: sub.vol_24h != null ? '0 0 12px rgba(16,185,129,0.2)' : 'none',
                            }}>
                              {formatUsd(sub.vol_24h)}
                            </span>
                          )}
                        </td>

                        {/* Needs Help */}
                        <td style={{ padding: '0 8px' }}>
                          <div className="flex flex-wrap gap-1">
                            {sub.needs_help.slice(0, 3).map((tag) => (
                              <NeedsHelpTag key={tag} tag={tag} />
                            ))}
                            {sub.needs_help.length > 3 && (
                              <span style={{ fontSize: '11px', color: '#525252', padding: '3px 0' }}>
                                +{sub.needs_help.length - 3}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Owner */}
                        <td style={{ padding: '0 8px' }} onClick={(e) => e.stopPropagation()}>
                          <InlineOwnerEditor owner={sub.owner} onChange={(o) => updateOwner(sub.id, o)} />
                        </td>

                        {/* Source */}
                        <td style={{ padding: '0 8px' }}>
                          <span style={{
                            fontFamily: "'Inter', sans-serif",
                            fontSize: '11px',
                            color: '#525252',
                          }}>
                            {sub.source === 'google_form' ? 'Google Form' : 'Plain'}
                          </span>
                        </td>

                        {/* Date */}
                        <td style={{ padding: '0 8px' }}>
                          <span
                            className="transition-colors duration-150"
                            style={{
                              fontFamily: "'Inter', sans-serif",
                              fontSize: '12px',
                              color: '#525252',
                            }}
                            title={sub.submitted_at}
                          >
                            {sub.submitted_at
                              ? formatDistanceToNow(parseISO(sub.submitted_at.split('.')[0].replace(' ', 'T')), { addSuffix: false })
                              : ''}
                          </span>
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Grid View */}
      {viewMode === 'grid' && (
        <div
          className="grid gap-4"
          style={{
            gridTemplateColumns: 'repeat(3, 1fr)',
          }}
        >
          {results.length === 0 ? (
            <div className="col-span-full flex flex-col items-center justify-center" style={{ padding: '80px 0' }}>
              <svg width="120" height="120" viewBox="0 0 120 120" fill="none" style={{ marginBottom: 24 }}>
                <rect x="20" y="30" width="80" height="60" rx="8" stroke="#525252" strokeWidth="2" strokeDasharray="4 4" />
                <path d="M40 55h40M40 65h30" stroke="#525252" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <h3 style={{ fontFamily: "'Manrope', sans-serif", fontSize: '16px', fontWeight: 600, color: '#F0F0F0', marginBottom: 8 }}>
                {hasActiveFilters ? 'No submissions match your filters' : 'No submissions yet'}
              </h3>
              {hasActiveFilters && (
                <button
                  onClick={clearAllFilters}
                  className="rounded-md transition-all duration-150"
                  style={{
                    padding: '8px 16px',
                    backgroundColor: 'transparent',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: '#F0F0F0',
                    fontSize: '13px',
                    fontWeight: 600,
                  }}
                >
                  Clear all filters
                </button>
              )}
            </div>
          ) : (
            paginated.map((sub) => (
              <SubmissionGridCard
                key={sub.id}
                submission={sub}
                onClick={() => router.push(`/submissions/${sub.id}`)}
              />
            ))
          )}
        </div>
      )}

      {/* Pagination */}
      {results.length > 0 && (
        <div
          className="flex items-center justify-center gap-2 mt-4"
          style={{ height: 48 }}
        >
          <button
            onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
            className="inline-flex items-center justify-center rounded-md transition-all duration-150 disabled:opacity-30"
            style={{ width: 32, height: 32, color: '#8A8A8A' }}
            onMouseEnter={(e) => { if (currentPage > 1) e.currentTarget.style.backgroundColor = '#222'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
          >
            <ChevronLeft size={16} />
          </button>

          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              onClick={() => setCurrentPage(p)}
              className="inline-flex items-center justify-center rounded-md transition-all duration-150"
              style={{
                width: 32,
                height: 32,
                backgroundColor: currentPage === p ? '#222' : 'transparent',
                color: currentPage === p ? '#F0F0F0' : '#525252',
                fontSize: '13px',
                fontWeight: 500,
                fontFamily: "'Inter', sans-serif",
              }}
              onMouseEnter={(e) => { if (currentPage !== p) e.currentTarget.style.backgroundColor = '#1A1A1A'; }}
              onMouseLeave={(e) => { if (currentPage !== p) e.currentTarget.style.backgroundColor = 'transparent'; }}
            >
              {p}
            </button>
          ))}

          <button
            onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage === totalPages}
            className="inline-flex items-center justify-center rounded-md transition-all duration-150 disabled:opacity-30"
            style={{ width: 32, height: 32, color: '#8A8A8A' }}
            onMouseEnter={(e) => { if (currentPage < totalPages) e.currentTarget.style.backgroundColor = '#222'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
          >
            <ChevronRight size={16} />
          </button>

          <div className="flex items-center gap-2 ml-4">
            <span style={{ fontSize: '12px', color: '#525252' }}>
              {startIdx + 1}-{Math.min(startIdx + rowsPerPage, results.length)} of {results.length}
            </span>
            <select
              value={rowsPerPage}
              onChange={(e) => { setRowsPerPage(Number(e.target.value)); setCurrentPage(1); }}
              className="rounded-md outline-none cursor-pointer"
              style={{
                height: 28,
                padding: '0 8px',
                backgroundColor: '#222',
                color: '#8A8A8A',
                border: '1px solid rgba(255,255,255,0.06)',
                fontSize: '12px',
                fontFamily: "'Inter', sans-serif",
              }}
            >
              {ROWS_PER_PAGE_OPTIONS.map((n) => (
                <option key={n} value={n}>{n} / page</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Bulk Actions Bar */}
      <AnimatePresence>
        {selectedIds.size > 0 && (
          <motion.div
            initial={{ y: 56, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 56, opacity: 0 }}
            transition={{ duration: 0.2, ease: EASE }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-30 flex items-center gap-4 rounded-lg"
            style={{
              height: 56,
              backgroundColor: '#1A1A1A',
              boxShadow: '0 4px 16px rgba(0,0,0,0.4), 0 0 1px rgba(255,255,255,0.06)',
              padding: '0 20px',
            }}
          >
            <span style={{ fontSize: '13px', fontWeight: 500, color: '#F0F0F0', whiteSpace: 'nowrap' }}>
              {selectedIds.size} selected
            </span>

            <div className="w-px h-6" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }} />

            {/* Change Stage */}
            <Dropdown
              open={openDropdown === 'bulk-stage'}
              onClose={() => setOpenDropdown(null)}
              width={160}
              trigger={
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenDropdown(openDropdown === 'bulk-stage' ? null : 'bulk-stage');
                  }}
                  className="inline-flex items-center gap-1.5 rounded-md transition-all duration-150"
                  style={{
                    height: 32,
                    padding: '0 12px',
                    backgroundColor: '#222',
                    color: '#F0F0F0',
                    fontSize: '12px',
                    fontWeight: 600,
                    fontFamily: "'Inter', sans-serif",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#2A2A2A'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#222'; }}
                >
                  Change stage <ChevronDown size={12} />
                </button>
              }
            >
              {STAGE_OPTIONS.map((s) => (
                <button
                  key={s}
                  className="block w-full text-left px-3 py-2 transition-colors duration-100"
                  style={{ fontSize: '12px', color: '#F0F0F0', fontFamily: "'Inter', sans-serif" }}
                  onClick={() => handleBulkStage(s)}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#222'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                >
                  {s}
                </button>
              ))}
            </Dropdown>

            {/* Assign Owner */}
            <Dropdown
              open={openDropdown === 'bulk-owner'}
              onClose={() => setOpenDropdown(null)}
              width={160}
              trigger={
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenDropdown(openDropdown === 'bulk-owner' ? null : 'bulk-owner');
                  }}
                  className="inline-flex items-center gap-1.5 rounded-md transition-all duration-150"
                  style={{
                    height: 32,
                    padding: '0 12px',
                    backgroundColor: '#222',
                    color: '#F0F0F0',
                    fontSize: '12px',
                    fontWeight: 600,
                    fontFamily: "'Inter', sans-serif",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#2A2A2A'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#222'; }}
                >
                  Assign owner <ChevronDown size={12} />
                </button>
              }
            >
              {OWNER_OPTIONS.map((o) => (
                <button
                  key={o}
                  className="block w-full text-left px-3 py-2 transition-colors duration-100"
                  style={{ fontSize: '12px', color: '#F0F0F0', fontFamily: "'Inter', sans-serif" }}
                  onClick={() => handleBulkOwner(o)}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#222'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                >
                  {o}
                </button>
              ))}
            </Dropdown>

            <div className="w-px h-6" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }} />

            <button
              onClick={clearAll}
              className="transition-colors duration-150"
              style={{ fontSize: '12px', color: '#525252', fontFamily: "'Inter', sans-serif", fontWeight: 500 }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#F0F0F0'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = '#525252'; }}
            >
              Deselect all
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      <SubmissionFormModal open={addOpen} mode="create" onClose={() => setAddOpen(false)} onSubmit={handleCreate} />
    </div>
  );
};

export default Submissions;
