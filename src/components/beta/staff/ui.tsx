'use client';
/** Shared look and small helpers for the staff beta-program pages. */
import React, { useEffect } from 'react';
import { toast } from 'sonner';
import { X } from 'lucide-react';
import type { Opt } from '@/lib/betaModel';

export const ink = '#F0F0F0', muted = '#8A8A8A', faint = '#525252', panel = '#1A1A1A', line = 'rgba(255,255,255,0.07)', accent = '#F5A623';
export const danger = '#EF4444', ok = '#10B981', info = '#3B82F6', violet = '#8B5CF6';
export const field: React.CSSProperties = { background: '#0D0D0D', border: `1px solid ${line}`, borderRadius: 8, color: ink, fontSize: 13, padding: '8px 10px', width: '100%', outline: 'none' };
export const label: React.CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: faint, marginBottom: 5, display: 'block' };
export const card: React.CSSProperties = { background: panel, border: `1px solid ${line}`, borderRadius: 12 };
export const primaryBtn: React.CSSProperties = { background: accent, color: '#0D0D0D', fontSize: 13, fontWeight: 600, padding: '8px 14px', borderRadius: 8 };
export const ghostBtn: React.CSSProperties = { color: muted, fontSize: 12.5, border: `1px solid ${line}`, padding: '6px 10px', borderRadius: 8 };
export const linkBtn: React.CSSProperties = { fontSize: 12.5, color: accent };
export const th: React.CSSProperties = { textAlign: 'left', padding: '9px 12px', color: faint, fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: `1px solid ${line}`, whiteSpace: 'nowrap' };
export const td: React.CSSProperties = { padding: '8px 12px', borderBottom: `1px solid ${line}`, verticalAlign: 'top' };

export const STATUS_COLOR: Record<string, string> = {
  new: accent, triaged: info, escalated: violet, fix_in_review: violet, fix_live: ok, retest_needed: accent, verified: ok,
  duplicate: faint, already_known: faint, wont_fix: faint, noted: ok, passed_on: ok, shipped: ok, answered: ok,
  suggested: accent, approved: info, sent: violet, closed: faint, cancelled: faint,
};
export const SEV_COLOR: Record<string, string> = { critical: danger, high: accent, medium: muted, low: faint };

export const ago = (iso: string | Date) => {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  return s < 3600 ? `${Math.max(1, Math.round(s / 60))}m` : s < 86400 ? `${Math.round(s / 3600)}h` : `${Math.round(s / 86400)}d`;
};
export const day = (iso: string | Date | null | undefined) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: new Date(iso).getFullYear() === new Date().getFullYear() ? undefined : 'numeric' }) : '');
export const isoDay = (iso: string | Date | null | undefined) => (iso ? new Date(iso).toISOString().slice(0, 10) : '');
export const localDateTime = (iso: string | Date | null | undefined) => {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
export const overdue = (iso: string | Date | null | undefined) => !!iso && new Date(iso).getTime() < new Date(new Date().toISOString().slice(0, 10)).getTime();
export const short = (s: string | null | undefined, n = 6) => (!s ? '' : s.length <= n * 2 + 1 ? s : `${s.slice(0, n)}…${s.slice(-4)}`);
export const copy = (text: string, what = 'Copied') => navigator.clipboard.writeText(text).then(() => toast.success(what)).catch(() => toast.error('Could not copy'));

/** fetch JSON; on failure toasts the API's error and returns null. */
export async function api<T = any>(url: string, method = 'GET', body?: unknown, quiet = false): Promise<T | null> {
  const res = await fetch(url, { method, ...(body !== undefined ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) }).catch(() => null);
  const d = await res?.json().catch(() => ({}));
  if (!res?.ok) { if (!quiet) toast.error(d?.error ?? 'Something went wrong'); return null; }
  return d as T;
}

export function Select({ value, onChange, opts, empty, disabled, style, ariaLabel }: { value: string | null | undefined; onChange: (v: string) => void; opts: readonly Opt[] | readonly (readonly [string, string])[]; empty?: string; disabled?: boolean; style?: React.CSSProperties; ariaLabel?: string }) {
  return (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value)} disabled={disabled} aria-label={ariaLabel} style={{ ...field, ...style }}>
      {empty !== undefined && <option value="">{empty}</option>}
      {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
}

export function Field({ name, children, span }: { name: string; children: React.ReactNode; span?: boolean }) {
  return <div style={span ? { gridColumn: '1 / -1' } : undefined}><span style={label}>{name}</span>{children}</div>;
}

export const grid = (min = 180): React.CSSProperties => ({ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${min}px), 1fr))`, gap: 12 });

export function Chips({ opts, value, onChange, disabled }: { opts: readonly (readonly [string, string])[]; value: string[]; onChange: (v: string[]) => void; disabled?: boolean }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {opts.map(([v, l]) => {
        const on = value.includes(v);
        return (
          <button key={v} type="button" disabled={disabled} onClick={() => onChange(on ? value.filter((x) => x !== v) : [...value, v])}
            style={{ fontSize: 12, padding: '4px 9px', borderRadius: 999, border: `1px solid ${on ? accent : line}`, color: on ? accent : muted, background: on ? 'rgba(245,166,35,0.08)' : 'transparent' }}>{l}</button>
        );
      })}
    </div>
  );
}

export function Pill({ text, color }: { text: string; color?: string }) {
  return <span style={{ fontSize: 11.5, fontWeight: 600, color: color ?? muted, whiteSpace: 'nowrap' }}>{text}</span>;
}

/** Centered dialog. */
export function Modal({ title, onClose, children, width = 560 }: { title: string; onClose: () => void; children: React.ReactNode; width?: number }) {
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  return (
    <div role="dialog" aria-modal="true" aria-label={title} onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 210, display: 'grid', placeItems: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...card, width: `min(${width}px, 100%)`, maxHeight: '90vh', overflow: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="flex items-center"><h2 style={{ fontSize: 16, fontWeight: 700, color: ink, flex: 1 }}>{title}</h2><button onClick={onClose} aria-label="Close" style={{ color: faint }}><X size={18} /></button></div>
        {children}
      </div>
    </div>
  );
}

/** Right-hand drawer. */
export function Drawer({ label: name, onClose, children, width = 600 }: { label: string; onClose: () => void; children: React.ReactNode; width?: number }) {
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  return (
    <div role="dialog" aria-modal="true" aria-label={name} onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: `min(${width}px, 100%)`, height: '100%', background: panel, borderLeft: `1px solid ${line}`, padding: 20, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {children}
      </div>
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl" style={{ border: '1px dashed rgba(255,255,255,0.12)', padding: 28, textAlign: 'center', fontSize: 13, color: muted }}>{children}</div>;
}

export function SectionHead({ title, count, right, hint }: { title: string; count?: number; right?: React.ReactNode; hint?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2" style={{ margin: '4px 0 8px' }}>
      <h3 title={hint} style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: muted }}>{title}{count !== undefined && <span style={{ color: faint }}> · {count}</span>}</h3>
      <span style={{ flex: 1 }} />
      {right}
    </div>
  );
}

export interface Person { id: string; name: string | null; email: string }
export const personName = (people: Person[], id: string | null | undefined) => { const p = people.find((x) => x.id === id); return p ? p.name || p.email : null; };

export interface ProgramData {
  program: {
    id: string; name: string; product: string | null; slug: string; status: string; joinUrl: string; description: string | null; welcome: string | null;
    teamId: string | null; bugTeamId: string | null; maxTesters: number | null; endsAt: string | null;
    plainEnabled: boolean; plainLabelTypeId: string | null; leadId: string | null; senderId: string | null; testAreas: string[];
    questions: { id: string; label: string; required?: boolean }[];
  };
  counts: Record<string, number>;
  testers: number;
  overview: Overview | null;
  people: Person[];
  me: { id: string; canApprove: boolean; isLead: boolean; isSender: boolean };
  notionBoards: { kind: string; title: string | null; url: string | null; enabled: boolean; lastPullAt: string | null; lastPushAt: string | null; lastError: string | null }[];
  canManage: boolean;
}
export interface Overview {
  testers: { total: number; testingNow: number; staleCheckIns: number };
  outreach: { toSend: number; awaitingApproval: number; overdue: number };
  bugs: { open: number; urgent: number; unreviewed: number };
  funds: { waiting: number; missingWallet: number };
  paid: { byToken: Record<string, number>; testers: number };
  coverage: { area: string; testers: number }[];
  waitingOnMe: { outreach: number; reports: number };
}

/** Light tester list for pickers, loaded once per program view. */
export interface TesterLite { id: string; name: string; status: string; email: string | null; channel: string | null; handle: string | null; walletAddress: string | null }

/** What every tab gets from the program view. */
export interface Ctx {
  programId: string;
  data: ProgramData;
  people: Person[];
  testers: TesterLite[];
  reports: ReportLite[];
  ver: number;
  reload: () => void;
  openReport: (id: string) => void;
  newOutreach: (prefill?: Record<string, unknown>) => void;
  newPayout: (prefill?: Record<string, unknown>) => void;
  logReport: (prefill?: Record<string, unknown>) => void;
  goTab: (tab: string, params?: Record<string, string>) => void;
}
export interface ReportLite { id: string; title: string; kind: string; status: string; duplicateOfId: string | null; testerId: string; tester: { name: string } }
