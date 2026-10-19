'use client';
import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Copy, KeyRound, Trash2 } from 'lucide-react';
import DataCard from '@/components/DataCard';

interface Token { id: string; name: string; prefix: string; lastUsedAt: string | null; createdAt: string }

const fieldStyle: React.CSSProperties = {
  height: 36, width: '100%', maxWidth: 260, backgroundColor: '#141414', border: '1px solid rgba(255,255,255,0.1)',
  color: '#F0F0F0', fontSize: 13, padding: '0 10px', borderRadius: 6, outline: 'none',
};
const code: React.CSSProperties = {
  display: 'block', background: '#0D0D0D', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8,
  padding: '10px 12px', fontFamily: 'ui-monospace, monospace', fontSize: 12, color: '#F0F0F0', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
};

function copy(text: string) {
  navigator.clipboard.writeText(text).then(() => toast.success('Copied'), () => toast.error('Copy failed'));
}

export default function ClaudeTab() {
  const [tokens, setTokens] = useState<Token[] | null>(null);
  const [name, setName] = useState('Claude Code');
  const [fresh, setFresh] = useState<string | null>(null);
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const mcpUrl = `${origin}/api/mcp`;

  const load = useCallback(async () => {
    const res = await fetch('/api/tokens');
    const d = await res.json().catch(() => ({}));
    setTokens(d.tokens ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function create() {
    const res = await fetch('/api/tokens', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(d.error ?? 'Could not create a token'); return; }
    setFresh(d.token);
    load();
  }

  async function revoke(t: Token) {
    if (!window.confirm(`Revoke "${t.name}"? Anything using it stops working.`)) return;
    const res = await fetch(`/api/tokens/${t.id}`, { method: 'DELETE' });
    if (res.ok) { toast.success('Revoked'); load(); } else toast.error('Could not revoke');
  }

  const token = fresh ?? '<your token>';
  const claudeCode = `claude mcp add --transport http artifact-hub ${mcpUrl} --header "Authorization: Bearer ${token}"`;
  // The header value rides in env: Claude Desktop on Windows doesn't escape spaces inside args.
  const desktopJson = JSON.stringify({
    mcpServers: {
      'artifact-hub': {
        command: 'npx',
        args: ['-y', 'mcp-remote', mcpUrl, '--header', 'Authorization:${AUTH_HEADER}'],
        env: { AUTH_HEADER: `Bearer ${token}` },
      },
    },
  }, null, 2);

  return (
    <div className="flex flex-col gap-5" style={{ maxWidth: 760 }}>
      <DataCard title="Connect your Claude" delay={0}>
        <p style={{ fontSize: 13, color: '#8A8A8A', lineHeight: 1.6, marginBottom: 14 }}>
          Your Claude can then read and change things here as you: list artifacts you made or that were shared with you,
          pull one into a session, publish or import pages, share them, read their data, and query the pipeline —
          without opening the dashboard. It has exactly your access.
        </p>
        <div className="flex flex-wrap items-end gap-2" style={{ marginBottom: 12 }}>
          <div>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#525252', letterSpacing: '0.04em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Token name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} style={fieldStyle} />
          </div>
          <button onClick={create} className="flex items-center gap-2"
            style={{ height: 36, padding: '0 14px', borderRadius: 6, fontSize: 13, fontWeight: 600, background: '#F5A623', color: '#0D0D0D' }}>
            <KeyRound size={15} /> Create token
          </button>
        </div>
        {fresh && (
          <div className="rounded-lg" style={{ background: '#2A2210', border: '1px solid rgba(245,166,35,0.3)', padding: 12, marginBottom: 12 }}>
            <div style={{ fontSize: 12.5, color: '#F5A623', marginBottom: 6 }}>Copy it now — it won’t be shown again.</div>
            <div className="flex items-center gap-2">
              <code style={{ ...code, flex: 1 }}>{fresh}</code>
              <button onClick={() => copy(fresh)} aria-label="Copy token" style={{ color: '#F0F0F0' }}><Copy size={16} /></button>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-3">
          <div>
            <div style={{ fontSize: 13, color: '#F0F0F0', fontWeight: 600, marginBottom: 6 }}>Claude Code</div>
            <div className="flex items-start gap-2">
              <code style={{ ...code, flex: 1 }}>{claudeCode}</code>
              <button onClick={() => copy(claudeCode)} aria-label="Copy Claude Code command" style={{ color: '#8A8A8A', marginTop: 8 }}><Copy size={16} /></button>
            </div>
          </div>
          <div>
            <div style={{ fontSize: 13, color: '#F0F0F0', fontWeight: 600, marginBottom: 6 }}>Claude Desktop (claude_desktop_config.json)</div>
            <div className="flex items-start gap-2">
              <code style={{ ...code, flex: 1 }}>{desktopJson}</code>
              <button onClick={() => copy(desktopJson)} aria-label="Copy Desktop config" style={{ color: '#8A8A8A', marginTop: 8 }}><Copy size={16} /></button>
            </div>
          </div>
          <div style={{ fontSize: 12.5, color: '#525252', lineHeight: 1.6 }}>
            Endpoint: <code>{mcpUrl}</code>. Then try: “list artifacts shared with me”, “import my claude.ai dashboards into the artifact hub”,
            or “which projects in the pipeline haven’t been contacted this month?”
          </div>
        </div>
      </DataCard>

      <DataCard title="Your tokens" delay={0.05}>
        {tokens === null ? (
          <div style={{ color: '#525252', fontSize: 13 }}>Loading…</div>
        ) : tokens.length === 0 ? (
          <div style={{ color: '#525252', fontSize: 13 }}>No tokens yet.</div>
        ) : (
          <div className="flex flex-col gap-2" style={{ maxHeight: 320, overflow: 'auto' }}>
            {tokens.map((t) => (
              <div key={t.id} className="flex items-center gap-3 rounded-lg" style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.06)', padding: '8px 12px' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: '#F0F0F0' }}>{t.name} <span style={{ color: '#525252', fontFamily: 'ui-monospace, monospace', fontSize: 12 }}>{t.prefix}…</span></div>
                  <div style={{ fontSize: 12, color: '#525252' }}>
                    Created {new Date(t.createdAt).toLocaleDateString()} · {t.lastUsedAt ? `last used ${new Date(t.lastUsedAt).toLocaleString()}` : 'never used'}
                  </div>
                </div>
                <button onClick={() => revoke(t)} aria-label={`Revoke ${t.name}`} title="Revoke" style={{ color: '#8A8A8A' }}><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
        )}
      </DataCard>
    </div>
  );
}
