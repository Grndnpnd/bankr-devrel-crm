'use client';
import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, CircleDashed, Copy, Trash2 } from 'lucide-react';
import DataCard from '@/components/DataCard';

interface Route { id: string; labelName: string | null; teamId: string; notifyNew: boolean; notifySla: boolean; team: { name: string; color: string } }
interface Status {
  configured: { apiKey: boolean; signing: boolean; chat: boolean; workspaceId: boolean };
  urls: { webhook: string; cards: string }; cardKeys: string[]; permissions: string[]; webhookVersion: string;
  routes: Route[]; teams: { id: string; name: string; color: string }[];
  sla: { days: number; met: number; missed: number; compliance: number | null; atRisk: number; breaching: number; byType: { type: string; label: string; met: number; missed: number }[] };
  betaReportsWaiting: number; canManage: boolean;
}

const ink = '#F0F0F0', muted = '#8A8A8A', faint = '#525252', line = 'rgba(255,255,255,0.08)', accent = '#F5A623';
const h3: React.CSSProperties = { fontFamily: "'Manrope', sans-serif", fontSize: 16, fontWeight: 600, color: ink };
const field: React.CSSProperties = { background: '#0D0D0D', border: `1px solid ${line}`, borderRadius: 8, color: ink, fontSize: 13, padding: '7px 9px', outline: 'none' };
const code: React.CSSProperties = { background: '#0D0D0D', border: `1px solid ${line}`, borderRadius: 6, padding: '2px 6px', fontSize: 12, color: ink };

function Copyable({ value, label }: { value: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5" style={{ maxWidth: '100%' }}>
      <code style={{ ...code, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</code>
      <button onClick={() => navigator.clipboard.writeText(value).then(() => toast.success(`${label} copied`))} aria-label={`Copy ${label}`} style={{ color: muted }}><Copy size={14} /></button>
    </span>
  );
}

function Check({ ok, children, note }: { ok: boolean; children: React.ReactNode; note?: string }) {
  return (
    <div className="flex items-start gap-2" style={{ fontSize: 13, color: ok ? ink : muted }}>
      {ok ? <CheckCircle2 size={16} style={{ color: '#10B981', marginTop: 2, flexShrink: 0 }} /> : <CircleDashed size={16} style={{ color: faint, marginTop: 2, flexShrink: 0 }} />}
      <span>{children}{note && <span style={{ color: faint }}> — {note}</span>}</span>
    </div>
  );
}

export default function PlainTab() {
  const [s, setS] = useState<Status | null>(null);
  const [labels, setLabels] = useState<{ id: string; name: string }[]>([]);
  const [testing, setTesting] = useState(false);
  const [draft, setDraft] = useState({ labelName: '', teamId: '', notifyNew: false, notifySla: true });

  const load = useCallback(async () => {
    const r = await fetch('/api/plain');
    if (r.ok) setS(await r.json());
  }, []);
  useEffect(() => {
    load();
    fetch('/api/plain/labels').then((r) => r.json()).then((d) => setLabels(d.labels ?? [])).catch(() => {});
  }, [load]);

  async function test() {
    setTesting(true);
    const d = await fetch('/api/plain', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'test' }) }).then((r) => r.json()).catch(() => ({ ok: false, error: 'request failed' }));
    setTesting(false);
    if (d.ok) toast.success(`Connected to ${d.workspace?.name ?? 'Plain'}`); else toast.error(d.error ?? 'Could not reach Plain');
  }
  async function addRoute() {
    const res = await fetch('/api/plain/routes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft) });
    if (!res.ok) { toast.error((await res.json().catch(() => ({}))).error ?? 'Could not add'); return; }
    setDraft({ labelName: '', teamId: '', notifyNew: false, notifySla: true }); load();
  }
  async function patchRoute(id: string, b: Partial<Route>) {
    await fetch('/api/plain/routes', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...b }) });
    load();
  }
  async function deleteRoute(id: string) {
    await fetch(`/api/plain/routes?id=${id}`, { method: 'DELETE' });
    load();
  }

  if (!s) return <div style={{ color: faint, fontSize: 13 }}>Loading…</div>;
  const c = s.configured;
  const ready = c.apiKey && c.signing;
  const pct = s.sla.compliance === null ? '—' : `${Math.round(s.sla.compliance * 100)}%`;

  return (
    <div className="flex flex-col gap-4" style={{ maxWidth: 860 }}>
      <DataCard delay={0}>
        <div className="flex items-center gap-2.5 mb-3">
          <h3 style={h3}>Plain {ready ? 'connected' : 'not fully connected'}</h3>
          <span style={{ flex: 1 }} />
          {c.apiKey && s.canManage && <button onClick={test} disabled={testing} className="rounded-lg" style={{ fontSize: 12.5, color: ink, border: `1px solid ${line}`, padding: '6px 12px' }}>{testing ? 'Testing…' : 'Test connection'}</button>}
        </div>
        <div className="flex flex-col gap-1.5">
          <Check ok={c.apiKey} note={c.apiKey ? undefined : 'beta reports can’t open threads'}>API key (PLAIN_API_KEY)</Check>
          <Check ok={c.signing} note={c.signing ? undefined : 'webhooks and customer cards are refused'}>Request signing secret (PLAIN_HMAC_SECRET)</Check>
          <Check ok={c.chat} note={c.chat ? undefined : 'optional: live chat on the tester page'}>Chat app (PLAIN_CHAT_APP_ID + PLAIN_CHAT_SECRET)</Check>
          <Check ok={c.workspaceId} note={c.workspaceId ? undefined : 'optional: makes thread links open the right workspace'}>Workspace id (PLAIN_WORKSPACE_ID)</Check>
        </div>
        {s.betaReportsWaiting > 0 && <p style={{ fontSize: 12.5, color: accent, marginTop: 10 }}>{s.betaReportsWaiting} beta report(s) haven’t reached Plain yet; they’re retried every 5 minutes.</p>}
      </DataCard>

      <DataCard delay={0.03}>
        <h3 style={{ ...h3, marginBottom: 10 }}>Set up in Plain</h3>
        <ol style={{ paddingLeft: 18, listStyle: 'decimal', fontSize: 13, color: muted, lineHeight: 1.75 }}>
          <li><b style={{ color: ink }}>Settings → Machine users</b>: add one called “CRM”, then an API key with these permissions:{' '}
            <span style={{ color: ink }}>{s.permissions.join(', ')}</span>. Put the key on the server as PLAIN_API_KEY.</li>
          <li><b style={{ color: ink }}>Settings → Request signing</b>: generate the secret and put it on the server as PLAIN_HMAC_SECRET.</li>
          <li><b style={{ color: ink }}>Settings → Webhooks</b>: add a target at <Copyable value={s.urls.webhook} label="Webhook URL" />, version <code style={code}>{s.webhookVersion}</code>, with every thread event.</li>
          <li><b style={{ color: ink }}>Settings → Customer cards</b>: add one card per key, all with the URL <Copyable value={s.urls.cards} label="Card URL" />:{' '}
            {s.cardKeys.map((k) => <code key={k} style={{ ...code, marginRight: 6 }}>{k}</code>)} and set Request format to <code style={code}>2026-10-19</code>.</li>
          <li>Optional, for tester live chat: <b style={{ color: ink }}>Settings → Chat</b>, create a chat app, generate its secret, and put the app id and secret on the server as PLAIN_CHAT_APP_ID and PLAIN_CHAT_SECRET.</li>
        </ol>
      </DataCard>

      <DataCard delay={0.06}>
        <h3 style={{ ...h3, marginBottom: 4 }}>SLAs, last {s.sla.days} days</h3>
        <div className="flex flex-wrap gap-8" style={{ marginTop: 10 }}>
          {[['Met', pct, ink], ['Missed', String(s.sla.missed), ink], ['About to breach', String(s.sla.atRisk), s.sla.atRisk ? accent : ink], ['Breaching now', String(s.sla.breaching), s.sla.breaching ? '#EF4444' : ink]].map(([k, v, col]) => (
            <div key={k}><div style={{ fontSize: 24, fontFamily: 'ui-monospace, monospace', color: col }}>{v}</div><div style={{ fontSize: 11.5, color: faint }}>{k}</div></div>
          ))}
        </div>
        {s.sla.byType.length > 0 && (
          <div style={{ fontSize: 12.5, color: muted, marginTop: 10 }}>
            {s.sla.byType.map((t) => `${t.label}: ${t.met}/${t.met + t.missed} met`).join(' · ')}
          </div>
        )}
        {s.sla.met + s.sla.missed === 0 && <p style={{ fontSize: 12.5, color: faint, marginTop: 8 }}>No SLA results yet. They arrive with the webhook once SLA policies are set in Plain.</p>}
      </DataCard>

      <DataCard delay={0.09}>
        <h3 style={{ ...h3, marginBottom: 4 }}>Which team hears about a thread</h3>
        <p style={{ fontSize: 12.5, color: muted, marginBottom: 12 }}>A thread goes to every rule whose label it carries; threads with none of those labels go to the “any thread” rules. SLA alerts go to the team’s members, and a breach puts an urgent task on the first matching team’s board.</p>
        <div style={{ maxHeight: 320, overflowY: 'auto', border: `1px solid ${line}`, borderRadius: 8 }}>
          <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
            <thead><tr style={{ color: faint, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'left' }}>
              <th style={{ padding: '8px 10px' }}>Label</th><th style={{ padding: '8px 10px' }}>Team</th><th style={{ padding: '8px 10px' }}>New threads</th><th style={{ padding: '8px 10px' }}>SLA alerts</th><th />
            </tr></thead>
            <tbody>
              {s.routes.length === 0 && <tr><td colSpan={5} style={{ padding: '10px', color: faint }}>No rules yet, so nobody is told about SLAs. Add an “any thread” rule for your support team.</td></tr>}
              {s.routes.map((r) => (
                <tr key={r.id} style={{ borderTop: `1px solid ${line}` }}>
                  <td style={{ padding: '8px 10px', color: r.labelName ? ink : muted }}>{r.labelName ?? 'Any thread'}</td>
                  <td style={{ padding: '8px 10px', color: r.team.color }}>{r.team.name}</td>
                  <td style={{ padding: '8px 10px' }}><input type="checkbox" disabled={!s.canManage} checked={r.notifyNew} onChange={(e) => patchRoute(r.id, { notifyNew: e.target.checked })} aria-label={`Notify ${r.team.name} of new threads`} /></td>
                  <td style={{ padding: '8px 10px' }}><input type="checkbox" disabled={!s.canManage} checked={r.notifySla} onChange={(e) => patchRoute(r.id, { notifySla: e.target.checked })} aria-label={`Send ${r.team.name} SLA alerts`} /></td>
                  <td style={{ padding: '8px 10px', textAlign: 'right' }}>{s.canManage && <button onClick={() => deleteRoute(r.id)} aria-label="Remove rule" style={{ color: faint }}><Trash2 size={14} /></button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {s.canManage && (
          <div className="flex flex-wrap items-center gap-2" style={{ marginTop: 12 }}>
            {labels.length > 0 ? (
              <select value={draft.labelName} onChange={(e) => setDraft((d) => ({ ...d, labelName: e.target.value }))} style={field} aria-label="Label">
                <option value="">Any thread</option>
                {labels.map((l) => <option key={l.id} value={l.name}>{l.name}</option>)}
              </select>
            ) : (
              <input value={draft.labelName} onChange={(e) => setDraft((d) => ({ ...d, labelName: e.target.value }))} placeholder="Label (blank = any thread)" style={field} aria-label="Label" />
            )}
            <select value={draft.teamId} onChange={(e) => setDraft((d) => ({ ...d, teamId: e.target.value }))} style={field} aria-label="Team">
              <option value="">Team…</option>
              {s.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <label className="flex items-center gap-1" style={{ fontSize: 12.5, color: muted }}><input type="checkbox" checked={draft.notifyNew} onChange={(e) => setDraft((d) => ({ ...d, notifyNew: e.target.checked }))} /> new threads</label>
            <label className="flex items-center gap-1" style={{ fontSize: 12.5, color: muted }}><input type="checkbox" checked={draft.notifySla} onChange={(e) => setDraft((d) => ({ ...d, notifySla: e.target.checked }))} /> SLA alerts</label>
            <button onClick={addRoute} disabled={!draft.teamId} className="rounded-lg" style={{ background: accent, color: '#0D0D0D', fontSize: 12.5, fontWeight: 600, padding: '7px 14px', opacity: draft.teamId ? 1 : 0.5 }}>Add rule</button>
          </div>
        )}
      </DataCard>
    </div>
  );
}
