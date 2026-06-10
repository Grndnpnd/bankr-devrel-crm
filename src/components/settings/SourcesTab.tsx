'use client';
import React, { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  FormInput,
  PlusCircle,
  RefreshCw,
  TestTube2,
  Settings2,
  Unlink,
  Clock,
  ExternalLink,
  Upload,
  Download,
  FileSpreadsheet,
} from 'lucide-react';
import DataCard from '@/components/DataCard';

/* ------------------------------------------------------------------ */
/*  Google Sheets Card                                                 */
/* ------------------------------------------------------------------ */
const GoogleSheetsCard: React.FC = () => {
  const [syncing, setSyncing] = useState(false);
  const [sheetId, setSheetId] = useState('1A2B3C4D5E6F7G8H9I0J');
  const [syncFreq, setSyncFreq] = useState('15min');

  const handleSync = useCallback(() => {
    setSyncing(true);
    setTimeout(() => setSyncing(false), 2500);
  }, []);

  return (
    <DataCard delay={0}>
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div
            className="flex items-center justify-center rounded-lg"
            style={{
              width: '40px',
              height: '40px',
              backgroundColor: 'rgba(16,185,129,0.12)',
            }}
          >
            <FileSpreadsheet size={24} style={{ color: '#10B981' }} />
          </div>
          <div>
            <h3
              style={{
                fontFamily: "'Manrope', sans-serif",
                fontSize: '16px',
                fontWeight: 600,
                color: '#F0F0F0',
              }}
            >
              Google Sheets
            </h3>
            <p style={{ fontSize: '13px', color: '#8A8A8A', marginTop: '2px' }}>
              Primary data source. Imports submissions from connected spreadsheet.
            </p>
          </div>
        </div>
        {/* Status badge */}
        <div
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full"
          style={{ backgroundColor: 'rgba(16,185,129,0.12)' }}
        >
          <span
            className="block rounded-full"
            style={{
              width: '8px',
              height: '8px',
              backgroundColor: '#10B981',
              boxShadow: '0 0 8px rgba(16,185,129,0.4)',
            }}
          />
          <span style={{ fontSize: '11px', fontWeight: 600, color: '#10B981' }}>Connected</span>
        </div>
      </div>

      {/* Connection details */}
      <div
        className="rounded-md p-4 mb-4"
        style={{ backgroundColor: '#141414', border: '1px solid rgba(255,255,255,0.06)' }}
      >
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span style={{ fontSize: '12px', color: '#525252' }}>Spreadsheet</span>
            <span style={{ fontSize: '13px', color: '#F0F0F0', fontWeight: 500 }}>Bankr DevRel Intake</span>
          </div>
          <div className="flex items-center justify-between">
            <span style={{ fontSize: '12px', color: '#525252' }}>Last synced</span>
            <span style={{ fontSize: '12px', color: '#525252' }}>Jun 8, 2026 at 3:42 PM</span>
          </div>
          <div className="flex items-center justify-between">
            <span style={{ fontSize: '12px', color: '#525252' }}>Rows imported</span>
            <span style={{ fontSize: '13px', color: '#8A8A8A' }}>81 submissions</span>
          </div>
        </div>
      </div>

      {/* Sheet ID input */}
      <div className="mb-4">
        <label style={{ fontSize: '11px', fontWeight: 600, color: '#525252', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          Sheet ID
        </label>
        <input
          type="text"
          value={sheetId}
          onChange={(e) => setSheetId(e.target.value)}
          className="w-full mt-1.5 rounded-md outline-none transition-all duration-150"
          style={{
            height: '36px',
            backgroundColor: '#141414',
            border: '1px solid rgba(255,255,255,0.1)',
            color: '#F0F0F0',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '12px',
            padding: '0 12px',
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
      </div>

      {/* Sync frequency */}
      <div className="mb-4">
        <label style={{ fontSize: '11px', fontWeight: 600, color: '#525252', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          Sync Frequency
        </label>
        <select
          value={syncFreq}
          onChange={(e) => setSyncFreq(e.target.value)}
          className="w-full mt-1.5 rounded-md outline-none transition-all duration-150"
          style={{
            height: '36px',
            backgroundColor: '#141414',
            border: '1px solid rgba(255,255,255,0.1)',
            color: '#F0F0F0',
            fontFamily: "'Inter', sans-serif",
            fontSize: '13px',
            padding: '0 12px',
            appearance: 'none',
          }}
        >
          <option value="15min">Every 15 minutes</option>
          <option value="1hour">Every hour</option>
          <option value="manual">Manual only</option>
        </select>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={handleSync}
          disabled={syncing}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-md transition-all duration-150"
          style={{
            backgroundColor: '#F5A623',
            color: '#0D0D0D',
            fontFamily: "'Inter', sans-serif",
            fontSize: '13px',
            fontWeight: 600,
            opacity: syncing ? 0.7 : 1,
            cursor: syncing ? 'wait' : 'pointer',
          }}
          onMouseEnter={(e) => {
            if (!syncing) {
              e.currentTarget.style.backgroundColor = '#E8941A';
              e.currentTarget.style.boxShadow = '0 0 20px rgba(245,166,35,0.15)';
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#F5A623';
            e.currentTarget.style.boxShadow = 'none';
          }}
        >
          <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
          {syncing ? 'Syncing...' : 'Sync Now'}
        </button>
        <button
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
          <TestTube2 size={14} />
          Test Connection
        </button>
        <button
          className="inline-flex items-center gap-2 px-3 py-2 rounded-md transition-all duration-150 ml-auto"
          style={{
            backgroundColor: 'transparent',
            color: '#EF4444',
            border: '1px solid rgba(239,68,68,0.3)',
            fontFamily: "'Inter', sans-serif",
            fontSize: '13px',
            fontWeight: 600,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(239,68,68,0.1)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
        >
          <Unlink size={14} />
          Disconnect
        </button>
      </div>
    </DataCard>
  );
};

/* ------------------------------------------------------------------ */
/*  Plain Card                                                         */
/* ------------------------------------------------------------------ */
const PlainCard: React.FC = () => {
  return (
    <DataCard delay={0.08}>
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div
            className="flex items-center justify-center rounded-lg"
            style={{
              width: '40px',
              height: '40px',
              backgroundColor: 'rgba(245,158,11,0.12)',
            }}
          >
            <FormInput size={24} style={{ color: '#F59E0B' }} />
          </div>
          <div>
            <h3
              style={{
                fontFamily: "'Manrope', sans-serif",
                fontSize: '16px',
                fontWeight: 600,
                color: '#F0F0F0',
              }}
            >
              Plain
            </h3>
            <p style={{ fontSize: '13px', color: '#8A8A8A', marginTop: '2px' }}>
              Form submission API integration.
            </p>
          </div>
        </div>
        {/* Coming soon badge */}
        <span
          className="px-2.5 py-1 rounded-full"
          style={{
            backgroundColor: 'rgba(245,166,35,0.15)',
            color: '#F5A623',
            fontSize: '11px',
            fontWeight: 600,
          }}
        >
          Coming Soon
        </span>
      </div>

      {/* Status banner */}
      <motion.div
        animate={{ opacity: [0.3, 0.6, 0.3] }}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        className="flex items-start gap-3 rounded-md p-4 mb-4"
        style={{
          backgroundColor: '#222222',
          border: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <Clock size={18} style={{ color: '#8A8A8A', flexShrink: 0, marginTop: '1px' }} />
        <div>
          <p style={{ fontSize: '13px', color: '#8A8A8A', lineHeight: 1.5 }}>
            Plain form expansion is in progress. This integration will be available once multi-form support is released.
          </p>
          <p style={{ fontSize: '12px', color: '#525252', marginTop: '4px' }}>
            Currently limited to single-form support on Plain&apos;s end.
          </p>
        </div>
      </motion.div>

      {/* API Key input (masked) */}
      <div className="mb-4">
        <label style={{ fontSize: '11px', fontWeight: 600, color: '#525252', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          API Key
        </label>
        <input
          type="password"
          placeholder="Enter Plain API key..."
          disabled
          className="w-full mt-1.5 rounded-md outline-none transition-all duration-150"
          style={{
            height: '36px',
            backgroundColor: '#141414',
            border: '1px solid rgba(255,255,255,0.1)',
            color: '#525252',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '12px',
            padding: '0 12px',
            cursor: 'not-allowed',
            opacity: 0.6,
          }}
        />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          disabled
          className="inline-flex items-center gap-2 px-3 py-2 rounded-md transition-all duration-150"
          style={{
            backgroundColor: 'transparent',
            color: '#525252',
            border: '1px solid rgba(255,255,255,0.1)',
            fontFamily: "'Inter', sans-serif",
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'not-allowed',
            opacity: 0.5,
          }}
          title="Multi-form support coming soon"
        >
          <Settings2 size={14} />
          Set Up
        </button>
        <a
          href="https://www.plain.com/docs"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-3 py-2 rounded-md transition-all duration-150"
          style={{
            backgroundColor: 'transparent',
            color: '#8A8A8A',
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
          <ExternalLink size={14} />
          View API Docs
        </a>
      </div>
    </DataCard>
  );
};

/* ------------------------------------------------------------------ */
/*  Manual Entry Card                                                  */
/* ------------------------------------------------------------------ */
const ManualEntryCard: React.FC = () => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [recentImports] = useState([
    { filename: 'submissions_batch_12.csv', date: 'Jun 7, 2026', count: 8 },
    { filename: 'devrel_intake.json', date: 'Jun 5, 2026', count: 3 },
    { filename: 'hackathon_projects.csv', date: 'Jun 1, 2026', count: 15 },
  ]);

  return (
    <DataCard delay={0.16}>
      <div className="flex items-start gap-3 mb-4">
        <div
          className="flex items-center justify-center rounded-lg"
          style={{
            width: '40px',
            height: '40px',
            backgroundColor: 'rgba(245,166,35,0.12)',
          }}
        >
          <PlusCircle size={24} style={{ color: '#F5A623' }} />
        </div>
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <h3
              style={{
                fontFamily: "'Manrope', sans-serif",
                fontSize: '16px',
                fontWeight: 600,
                color: '#F0F0F0',
              }}
            >
              Manual Import
            </h3>
            <div
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full"
              style={{ backgroundColor: 'rgba(16,185,129,0.12)' }}
            >
              <span className="block rounded-full" style={{ width: '8px', height: '8px', backgroundColor: '#10B981' }} />
              <span style={{ fontSize: '11px', fontWeight: 600, color: '#10B981' }}>Enabled</span>
            </div>
          </div>
          <p style={{ fontSize: '13px', color: '#8A8A8A', marginTop: '2px' }}>
            Upload CSV or JSON files to import submissions in bulk.
          </p>
        </div>
      </div>

      {/* Dropzone */}
      <div
        className="flex flex-col items-center justify-center gap-3 rounded-lg mb-4 transition-all duration-200"
        style={{
          padding: '28px 16px',
          backgroundColor: isDragOver ? '#222222' : '#141414',
          border: isDragOver ? '2px dashed #F5A623' : '2px dashed rgba(255,255,255,0.1)',
          cursor: 'pointer',
        }}
        onDragEnter={() => setIsDragOver(true)}
        onDragLeave={() => setIsDragOver(false)}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragOver(false);
        }}
      >
        <Upload size={24} style={{ color: isDragOver ? '#F5A623' : '#525252' }} />
        <div className="text-center">
          <p style={{ fontSize: '13px', color: '#8A8A8A' }}>
            <span style={{ color: '#F5A623', fontWeight: 500 }}>Click to upload</span> or drag and drop
          </p>
          <p style={{ fontSize: '11px', color: '#525252', marginTop: '4px' }}>CSV, JSON — Max 10MB</p>
        </div>
      </div>

      {/* Download template link */}
      <div className="flex items-center gap-2 mb-4">
        <a
          href="#"
          className="inline-flex items-center gap-1.5 transition-colors duration-150"
          style={{ fontSize: '12px', color: '#F5A623', fontWeight: 500 }}
          onMouseEnter={(e) => {
            e.currentTarget.style.textDecoration = 'underline';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.textDecoration = 'none';
          }}
        >
          <Download size={12} />
          Download Template
        </a>
      </div>

      {/* Recent imports */}
      {recentImports.length > 0 && (
        <div>
          <h4
            className="mb-2"
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: '11px',
              fontWeight: 600,
              color: '#525252',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}
          >
            Recent Imports
          </h4>
          <div className="flex flex-col gap-1">
            {recentImports.map((imp) => (
              <div
                key={imp.filename}
                className="flex items-center justify-between py-2 px-3 rounded-md"
                style={{ backgroundColor: '#141414' }}
              >
                <div className="flex items-center gap-2">
                  <FileSpreadsheet size={14} style={{ color: '#525252' }} />
                  <span style={{ fontSize: '12px', color: '#8A8A8A' }}>{imp.filename}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span style={{ fontSize: '11px', color: '#525252' }}>{imp.count} rows</span>
                  <span style={{ fontSize: '11px', color: '#525252' }}>{imp.date}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </DataCard>
  );
};

/* ------------------------------------------------------------------ */
/*  Sources Tab                                                        */
/* ------------------------------------------------------------------ */
const SourcesTab: React.FC = () => {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="lg:col-span-2">
        <GoogleSheetsCard />
      </div>
      <PlainCard />
      <ManualEntryCard />
    </div>
  );
};

export default SourcesTab;
