'use client';
import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle2,
  XCircle,
  Loader2,
  FileSpreadsheet,
  FormInput,
  Hand,
  Download,
  ChevronDown,
  Filter,
} from 'lucide-react';
import DataCard from '@/components/DataCard';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
type ImportSource = 'Google Sheets' | 'Plain' | 'Manual';
type ImportType = 'Full sync' | 'Incremental' | 'Manual add';
type ImportStatus = 'Success' | 'Failed' | 'In Progress';

interface ImportLogEntry {
  id: string;
  date: string;
  source: ImportSource;
  type: ImportType;
  recordsImported: number;
  newRecords: number;
  updatedRecords: number;
  errors: number;
  duration: string;
  status: ImportStatus;
  details: string;
}


const sourceIcons: Record<ImportSource, React.ElementType> = {
  'Google Sheets': FileSpreadsheet,
  Plain: FormInput,
  Manual: Hand,
};

const sourceColors: Record<ImportSource, string> = {
  'Google Sheets': '#10B981',
  Plain: '#F59E0B',
  Manual: '#F5A623',
};

const statusConfig: Record<ImportStatus, { icon: React.ElementType; color: string }> = {
  Success: { icon: CheckCircle2, color: '#10B981' },
  Failed: { icon: XCircle, color: '#EF4444' },
  'In Progress': { icon: Loader2, color: '#3B82F6' },
};

const typeBadgeStyles: Record<ImportType, { bg: string; text: string }> = {
  'Full sync': { bg: 'rgba(59,130,246,0.12)', text: '#3B82F6' },
  Incremental: { bg: 'rgba(139,92,246,0.12)', text: '#8B5CF6' },
  'Manual add': { bg: 'rgba(245,166,35,0.12)', text: '#F5A623' },
};

/* ------------------------------------------------------------------ */
/*  Import Log Tab                                                     */
/* ------------------------------------------------------------------ */
const ImportLogTab: React.FC = () => {
  const [filterStatus, setFilterStatus] = useState<'All' | 'Successful' | 'Failed'>('All');
  const [filterOpen, setFilterOpen] = useState(false);
  const [logs, setLogs] = useState<ImportLogEntry[]>([]);

  useEffect(() => {
    fetch('/api/import/log')
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: any[]) => {
        setLogs(
          rows.map((r): ImportLogEntry => {
            const source: ImportSource =
              r.source === 'google' ? 'Google Sheets' : r.source === 'plain' ? 'Plain' : 'Manual';
            return {
              id: r.id,
              date: new Date(r.at).toLocaleString(undefined, {
                month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
              }),
              source,
              type: source === 'Google Sheets' ? 'Full sync' : 'Manual add',
              recordsImported: r.pulled ?? 0,
              newRecords: r.created ?? 0,
              updatedRecords: r.updated ?? 0,
              errors: r.ok ? 0 : 1,
              duration: '—',
              status: r.ok ? 'Success' : 'Failed',
              details: r.message || (r.by ? `Triggered by ${r.by}` : `${source} import`),
            };
          })
        );
      })
      .catch(() => {});
  }, []);

  const filteredData = useMemo(() => {
    if (filterStatus === 'Successful') return logs.filter((d) => d.status === 'Success');
    if (filterStatus === 'Failed') return logs.filter((d) => d.status === 'Failed');
    return logs;
  }, [filterStatus, logs]);

  const handleExport = () => {
    const csv = [
      ['Date', 'Source', 'Type', 'Records', 'New', 'Updated', 'Errors', 'Duration', 'Status', 'Details'].join(','),
      ...filteredData.map((row) =>
        [
          row.date,
          row.source,
          row.type,
          row.recordsImported,
          row.newRecords,
          row.updatedRecords,
          row.errors,
          row.duration,
          row.status,
          `"${row.details}"`,
        ].join(',')
      ),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'import-log.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <DataCard delay={0}>
      {/* Header with filter + export */}
      <div className="flex items-center justify-between mb-4">
        <div className="relative">
          <button
            onClick={() => setFilterOpen(!filterOpen)}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-md transition-all duration-150"
            style={{
              backgroundColor: '#141414',
              border: '1px solid rgba(255,255,255,0.1)',
              color: '#8A8A8A',
              fontFamily: "'Inter', sans-serif",
              fontSize: '13px',
              fontWeight: 500,
            }}
          >
            <Filter size={14} />
            {filterStatus}
            <ChevronDown size={12} />
          </button>
          <AnimatePresence>
            {filterOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setFilterOpen(false)} />
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.1 }}
                  className="absolute z-20 mt-1"
                  style={{
                    backgroundColor: '#1A1A1A',
                    border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: '8px',
                    boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
                    overflow: 'hidden',
                    minWidth: '140px',
                  }}
                >
                  {(['All', 'Successful', 'Failed'] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => {
                        setFilterStatus(f);
                        setFilterOpen(false);
                      }}
                      className="w-full text-left px-3 py-2 transition-colors duration-100"
                      style={{
                        fontSize: '12px',
                        color: f === filterStatus ? '#F5A623' : '#F0F0F0',
                        backgroundColor: f === filterStatus ? 'rgba(245,166,35,0.1)' : 'transparent',
                        fontWeight: f === filterStatus ? 600 : 400,
                      }}
                      onMouseEnter={(e) => {
                        if (f !== filterStatus) e.currentTarget.style.backgroundColor = '#222222';
                      }}
                      onMouseLeave={(e) => {
                        if (f !== filterStatus) e.currentTarget.style.backgroundColor = 'transparent';
                      }}
                    >
                      {f}
                    </button>
                  ))}
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>

        <button
          onClick={handleExport}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-md transition-all duration-150"
          style={{
            backgroundColor: 'transparent',
            color: '#8A8A8A',
            border: '1px solid rgba(255,255,255,0.1)',
            fontFamily: "'Inter', sans-serif",
            fontSize: '13px',
            fontWeight: 600,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#222222';
            e.currentTarget.style.color = '#F0F0F0';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
            e.currentTarget.style.color = '#8A8A8A';
          }}
        >
          <Download size={14} />
          Export Log
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
              {['Date', 'Source', 'Type', 'Records', 'New', 'Updated', 'Errors', 'Duration', 'Status', 'Details'].map((h) => (
                <th
                  key={h}
                  className="text-left py-2.5 px-3"
                  style={{
                    fontFamily: "'Inter', sans-serif",
                    fontSize: '11px',
                    fontWeight: 600,
                    color: '#525252',
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredData.map((entry, i) => {
              const StatusIcon = statusConfig[entry.status].icon;
              const SourceIcon = sourceIcons[entry.source];
              const isInProgress = entry.status === 'In Progress';

              return (
                <motion.tr
                  key={entry.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.25,
                    delay: i * 0.04,
                    ease: [0.16, 1, 0.3, 1] as [number, number, number, number],
                  }}
                  className="transition-colors duration-150"
                  style={{
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                    backgroundColor: i % 2 === 0 ? '#141414' : '#1A1A1A',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#222222';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = i % 2 === 0 ? '#141414' : '#1A1A1A';
                  }}
                >
                  {/* Date */}
                  <td
                    className="py-3 px-3 whitespace-nowrap"
                    style={{ fontSize: '12px', color: '#8A8A8A' }}
                  >
                    {entry.date}
                  </td>

                  {/* Source */}
                  <td className="py-3 px-3">
                    <div className="flex items-center gap-2">
                      <SourceIcon size={16} style={{ color: sourceColors[entry.source] }} />
                      <span style={{ fontSize: '13px', color: '#F0F0F0' }}>{entry.source}</span>
                    </div>
                  </td>

                  {/* Type */}
                  <td className="py-3 px-3">
                    <span
                      className="inline-block rounded-full px-2.5 py-0.5"
                      style={{
                        backgroundColor: typeBadgeStyles[entry.type].bg,
                        color: typeBadgeStyles[entry.type].text,
                        fontSize: '11px',
                        fontWeight: 600,
                      }}
                    >
                      {entry.type}
                    </span>
                  </td>

                  {/* Records imported */}
                  <td
                    className="py-3 px-3 text-center"
                    style={{
                      fontFamily: "'Manrope', sans-serif",
                      fontSize: '13px',
                      fontWeight: 600,
                      color: '#F0F0F0',
                    }}
                  >
                    {entry.recordsImported}
                  </td>

                  {/* New */}
                  <td
                    className="py-3 px-3 text-center"
                    style={{ fontSize: '12px', color: '#10B981', fontWeight: 500 }}
                  >
                    +{entry.newRecords}
                  </td>

                  {/* Updated */}
                  <td
                    className="py-3 px-3 text-center"
                    style={{ fontSize: '12px', color: '#3B82F6', fontWeight: 500 }}
                  >
                    {entry.updatedRecords > 0 ? `+${entry.updatedRecords}` : '-'}
                  </td>

                  {/* Errors */}
                  <td
                    className="py-3 px-3 text-center"
                    style={{
                      fontSize: '12px',
                      color: entry.errors > 0 ? '#EF4444' : '#525252',
                      fontWeight: entry.errors > 0 ? 600 : 400,
                    }}
                  >
                    {entry.errors > 0 ? entry.errors : '-'}
                  </td>

                  {/* Duration */}
                  <td
                    className="py-3 px-3 text-center"
                    style={{ fontSize: '12px', color: '#525252', fontFamily: "'JetBrains Mono', monospace" }}
                  >
                    {isInProgress ? (
                      <span className="inline-flex items-center gap-1" style={{ color: '#3B82F6' }}>
                        <Loader2 size={12} className="animate-spin" />
                        ...
                      </span>
                    ) : (
                      entry.duration
                    )}
                  </td>

                  {/* Status */}
                  <td className="py-3 px-3">
                    <div className="flex items-center gap-1.5">
                      <StatusIcon
                        size={16}
                        style={{ color: statusConfig[entry.status].color }}
                        className={isInProgress ? 'animate-spin' : ''}
                      />
                      <span
                        style={{
                          fontSize: '12px',
                          fontWeight: 500,
                          color: statusConfig[entry.status].color,
                        }}
                      >
                        {entry.status}
                      </span>
                    </div>
                  </td>

                  {/* Details */}
                  <td
                    className="py-3 px-3"
                    style={{ fontSize: '12px', color: '#8A8A8A', maxWidth: '240px' }}
                  >
                    {entry.details}
                  </td>
                </motion.tr>
              );
            })}
            {filteredData.length === 0 && (
              <tr>
                <td colSpan={10} className="py-8 text-center" style={{ color: '#525252', fontSize: '13px' }}>
                  No import records match the selected filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </DataCard>
  );
};

export default ImportLogTab;
