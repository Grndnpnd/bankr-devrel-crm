'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  FormInput, RefreshCw, TestTube2, Unlink, Clock, ExternalLink,
  Upload, FileSpreadsheet, Settings2, History,
} from 'lucide-react';
import DataCard from '@/components/DataCard';
import { useSubmissionStore } from '@/store/useSubmissionStore';

interface ImportLogRow {
  id: string; at: string; source: string; pulled: number; created: number;
  updated: number; ok: boolean; message: string | null; by: string | null;
}
interface Status {
  google: { configured: boolean; sheetIdMasked: string; range: string };
  rowCount: number;
  lastSync: { at: string; source: string; pulled: number; created: number; updated: number; ok: boolean; message: string | null } | null;
}

const fmtDate = (iso?: string) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
};
const sourceLabel = (s: string) =>
  s === 'google' ? 'Google Sheets' : s === 'plain' ? 'Plain' : s === 'seed' ? 'Seed file' : 'Manual';

/* ── Google Sheets ── */
const GoogleSheetsCard: React.FC<{ status: Status | null; refresh: () => void }> = ({ status, refresh }) => {
  const reloadSubs = useSubmissionStore((s) => s.load);
  const [syncing, setSyncing] = useState(false);
  const [testing, setTesting] = useState(false);

  const configured = status?.google.configured;
  const last = status?.lastSync;

  const handleSync = useCallback(async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source: 'google' }) });
      const r = await res.json().catch(() => ({}));
      if (!res.ok || r.error) toast.error('Sync failed', { description: r.error || `HTTP ${res.status}` });
      else toast.success('Sync complete', { description: `Pulled ${r.pulled} · ${r.created} new · ${r.updated} updated` });
    } catch (e: any) {
      toast.error('Sync failed', { description: e?.message ?? 'network error' });
    } finally {
      setSyncing(false);
      await reloadSubs();
      refresh();
    }
  }, [reloadSubs, refresh]);

  const handleTest = useCallback(async () => {
    setTesting(true);
    try {
      const res = await fetch('/api/import/test', { method: 'POST' });
      const r = await res.json().catch(() => ({}));
      if (r.ok) toast.success('Connection OK', { description: `${r.rows} data rows visible in the sheet` });
      else toast.error('Connection failed', { description: r.error || `HTTP ${res.status}` });
    } catch (e: any) {
      toast.error('Connection failed', { description: e?.message ?? 'network error' });
    } finally {
      setTesting(false);
    }
  }, []);

  return (
    <DataCard delay={0}>
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center rounded-lg" style={{ width: 40, height: 40, backgroundColor: 'rgba(16,185,129,0.12)' }}>
            <FileSpreadsheet size={24} style={{ color: '#10B981' }} />
          </div>
          <div>
            <h3 style={{ fontFamily: "'Manrope', sans-serif", fontSize: 16, fontWeight: 600, color: '#F0F0F0' }}>Google Sheets</h3>
            <p style={{ fontSize: 13, color: '#8A8A8A', marginTop: 2 }}>Primary data source. Imports submissions from the connected responses sheet.</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full" style={{ backgroundColor: configured ? 'rgba(16,185,129,0.12)' : 'rgba(138,138,138,0.12)' }}>
          <span className="block rounded-full" style={{ width: 8, height: 8, backgroundColor: configured ? '#10B981' : '#8A8A8A', boxShadow: configured ? '0 0 8px rgba(16,185,129,0.4)' : 'none' }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: configured ? '#10B981' : '#8A8A8A' }}>{configured ? 'Connected' : 'Not configured'}</span>
        </div>
      </div>

      <div className="rounded-md p-4 mb-4" style={{ backgroundColor: '#141414', border: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span style={{ fontSize: 12, color: '#525252' }}>Sheet tab</span>
            <span style={{ fontSize: 13, color: '#F0F0F0', fontWeight: 500 }}>{status?.google.range || '—'}</span>
          </div>
          <div className="flex items-center justify-between">
            <span style={{ fontSize: 12, color: '#525252' }}>Last import</span>
            <span style={{ fontSize: 12, color: last?.ok === false ? '#EF4444' : '#525252' }}>
              {last ? `${fmtDate(last.at)} · ${sourceLabel(last.source)}${last.ok ? '' : ' (failed)'}` : 'never'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span style={{ fontSize: 12, color: '#525252' }}>Submissions in DB</span>
            <span style={{ fontSize: 13, color: '#8A8A8A' }}>{status?.rowCount ?? '—'}</span>
          </div>
        </div>
      </div>

      <div className="mb-4">
        <label style={{ fontSize: 11, fontWeight: 600, color: '#525252', letterSpacing: '0.04em', textTransform: 'uppercase' }}>Sheet ID</label>
        <input
          type="text" readOnly value={status?.google.sheetIdMasked || 'not set'}
          className="w-full mt-1.5 rounded-md outline-none"
          style={{ height: 36, backgroundColor: '#141414', border: '1px solid rgba(255,255,255,0.1)', color: '#8A8A8A', fontFamily: "'JetBrains Mono', monospace", fontSize: 12, padding: '0 12px' }}
        />
        <p style={{ fontSize: 11, color: '#525252', marginTop: 6 }}>Managed via the <code style={{ color: '#8A8A8A' }}>GOOGLE_SHEET_ID</code> server variable.</p>
      </div>

      <div className="mb-4 flex items-center gap-2 rounded-md p-3" style={{ backgroundColor: '#141414', border: '1px solid rgba(255,255,255,0.06)' }}>
        <Clock size={14} style={{ color: '#525252' }} />
        <span style={{ fontSize: 12, color: '#8A8A8A' }}>Manual sync. Scheduled auto-sync is not enabled yet.</span>
      </div>

      <div className="flex items-center gap-2">
        <button onClick={handleSync} disabled={syncing || !configured}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-md transition-all duration-150"
          style={{ backgroundColor: '#F5A623', color: '#0D0D0D', fontSize: 13, fontWeight: 600, opacity: syncing || !configured ? 0.5 : 1, cursor: syncing || !configured ? 'not-allowed' : 'pointer' }}>
          <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
          {syncing ? 'Syncing…' : 'Sync Now'}
        </button>
        <button onClick={handleTest} disabled={testing || !configured}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-md transition-all duration-150"
          style={{ backgroundColor: 'transparent', color: '#8A8A8A', border: '1px solid rgba(255,255,255,0.1)', fontSize: 13, fontWeight: 600, opacity: testing || !configured ? 0.5 : 1, cursor: testing || !configured ? 'not-allowed' : 'pointer' }}>
          <TestTube2 size={14} />
          {testing ? 'Testing…' : 'Test Connection'}
        </button>
        <button onClick={() => toast.info('Managed on the server', { description: 'The connection is configured via environment variables; edit them in Railway to disconnect.' })}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-md transition-all duration-150 ml-auto"
          style={{ backgroundColor: 'transparent', color: '#8A8A8A', border: '1px solid rgba(255,255,255,0.1)', fontSize: 13, fontWeight: 600 }}>
          <Unlink size={14} />
          Disconnect
        </button>
      </div>
    </DataCard>
  );
};

/* ── Plain (genuinely not live yet) ── */
const PlainCard: React.FC = () => (
  <DataCard delay={0.08}>
    <div className="flex items-start justify-between mb-4">
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center rounded-lg" style={{ width: 40, height: 40, backgroundColor: 'rgba(245,158,11,0.12)' }}>
          <FormInput size={24} style={{ color: '#F59E0B' }} />
        </div>
        <div>
          <h3 style={{ fontFamily: "'Manrope', sans-serif", fontSize: 16, fontWeight: 600, color: '#F0F0F0' }}>Plain</h3>
          <p style={{ fontSize: 13, color: '#8A8A8A', marginTop: 2 }}>Form submission API integration.</p>
        </div>
      </div>
      <span className="px-2.5 py-1 rounded-full" style={{ backgroundColor: 'rgba(245,166,35,0.15)', color: '#F5A623', fontSize: 11, fontWeight: 600 }}>Coming Soon</span>
    </div>
    <motion.div animate={{ opacity: [0.4, 0.7, 0.4] }} transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
      className="flex items-start gap-3 rounded-md p-4" style={{ backgroundColor: '#222', border: '1px solid rgba(255,255,255,0.06)' }}>
      <Clock size={18} style={{ color: '#8A8A8A', flexShrink: 0, marginTop: 1 }} />
      <div>
        <p style={{ fontSize: 13, color: '#8A8A8A', lineHeight: 1.5 }}>The Plain adapter is stubbed and will be enabled once multi-form support ships on Plain&apos;s end.</p>
        <a href="https://www.plain.com/docs" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 mt-2" style={{ fontSize: 12, color: '#F5A623', fontWeight: 500 }}>
          <ExternalLink size={12} /> View API Docs
        </a>
      </div>
    </motion.div>
  </DataCard>
);

/* ── Recent imports (real log) ── */
const RecentImportsCard: React.FC<{ log: ImportLogRow[] }> = ({ log }) => (
  <DataCard delay={0.16}>
    <div className="flex items-start gap-3 mb-4">
      <div className="flex items-center justify-center rounded-lg" style={{ width: 40, height: 40, backgroundColor: 'rgba(245,166,35,0.12)' }}>
        <History size={24} style={{ color: '#F5A623' }} />
      </div>
      <div className="flex-1">
        <h3 style={{ fontFamily: "'Manrope', sans-serif", fontSize: 16, fontWeight: 600, color: '#F0F0F0' }}>Recent Imports</h3>
        <p style={{ fontSize: 13, color: '#8A8A8A', marginTop: 2 }}>The latest sync runs and their results.</p>
      </div>
    </div>
    {log.length === 0 ? (
      <div className="flex flex-col items-center justify-center gap-2 rounded-lg" style={{ padding: '28px 16px', backgroundColor: '#141414', border: '1px dashed rgba(255,255,255,0.1)' }}>
        <Upload size={22} style={{ color: '#525252' }} />
        <p style={{ fontSize: 13, color: '#8A8A8A' }}>No imports yet — run a sync to get started.</p>
      </div>
    ) : (
      <div className="flex flex-col gap-1">
        {log.slice(0, 6).map((r) => (
          <div key={r.id} className="flex items-center justify-between py-2 px-3 rounded-md" style={{ backgroundColor: '#141414' }}>
            <div className="flex items-center gap-2">
              <span className="block rounded-full" style={{ width: 7, height: 7, backgroundColor: r.ok ? '#10B981' : '#EF4444' }} />
              <span style={{ fontSize: 12, color: '#8A8A8A' }}>{sourceLabel(r.source)}</span>
            </div>
            <div className="flex items-center gap-3">
              <span style={{ fontSize: 11, color: '#525252' }}>{r.ok ? `${r.created} new · ${r.updated} upd` : (r.message || 'failed')}</span>
              <span style={{ fontSize: 11, color: '#525252' }}>{fmtDate(r.at)}</span>
            </div>
          </div>
        ))}
      </div>
    )}
  </DataCard>
);

/* ── Sources Tab ── */
const SourcesTab: React.FC = () => {
  const [status, setStatus] = useState<Status | null>(null);
  const [log, setLog] = useState<ImportLogRow[]>([]);

  const refresh = useCallback(() => {
    fetch('/api/import/status').then((r) => (r.ok ? r.json() : null)).then(setStatus).catch(() => {});
    fetch('/api/import/log').then((r) => (r.ok ? r.json() : [])).then(setLog).catch(() => {});
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="lg:col-span-2">
        <GoogleSheetsCard status={status} refresh={refresh} />
      </div>
      <PlainCard />
      <RecentImportsCard log={log} />
    </div>
  );
};

export default SourcesTab;
