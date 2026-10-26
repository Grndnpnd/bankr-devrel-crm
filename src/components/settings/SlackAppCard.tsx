'use client';
import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Copy, CheckCircle2, CircleDashed } from 'lucide-react';
import DataCard from '@/components/DataCard';

/** Slack app status, and for admins the steps + manifest to create it. */
export default function SlackAppCard() {
  const [d, setD] = useState<{ configured: boolean; canSetUp: boolean; manifest: unknown } | null>(null);
  useEffect(() => { fetch('/api/slack/app').then((r) => r.json()).then(setD).catch(() => {}); }, []);
  if (!d) return null;
  const manifest = JSON.stringify(d.manifest, null, 2);
  return (
    <DataCard delay={0}>
      <div className="flex items-center gap-2.5 mb-2">
        {d.configured ? <CheckCircle2 size={18} style={{ color: '#10B981' }} /> : <CircleDashed size={18} style={{ color: '#8A8A8A' }} />}
        <h3 style={{ fontFamily: "'Manrope', sans-serif", fontSize: 16, fontWeight: 600, color: '#F0F0F0' }}>
          Slack app {d.configured ? 'connected' : 'not connected yet'}
        </h3>
      </div>
      <p style={{ fontSize: 13, color: '#8A8A8A', lineHeight: 1.6 }}>
        On any Slack message: <b style={{ color: '#F0F0F0' }}>⋯ → Add to tasks</b>. Or in a thread: <b style={{ color: '#F0F0F0' }}>@CRM add this to my tasks</b>
        {' '}(also “for @someone”, “for Support”, “by friday”). Your Slack email has to match your account here.
      </p>
      {!d.configured && d.canSetUp && (
        <div style={{ marginTop: 14, fontSize: 13, color: '#8A8A8A', lineHeight: 1.7 }}>
          <ol style={{ paddingLeft: 18, listStyle: 'decimal' }}>
            <li>At <a href="https://api.slack.com/apps?new_app=1" target="_blank" rel="noreferrer" style={{ color: '#F5A623' }}>api.slack.com/apps</a>: Create New App → From a manifest → pick your workspace → paste the manifest below.</li>
            <li>Install it to the workspace.</li>
            <li>Copy the <b style={{ color: '#F0F0F0' }}>Bot User OAuth Token</b> (xoxb-…) and the <b style={{ color: '#F0F0F0' }}>Signing Secret</b> (Basic Information) to the server as SLACK_BOT_TOKEN and SLACK_SIGNING_SECRET.</li>
            <li>Invite the bot to the channels where you want @mentions: <code>/invite @CRM</code>.</li>
          </ol>
          <div className="flex items-start gap-2" style={{ marginTop: 10 }}>
            <pre style={{ flex: 1, maxHeight: 220, overflow: 'auto', background: '#0D0D0D', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: 10, fontSize: 11.5, color: '#F0F0F0' }}>{manifest}</pre>
            <button onClick={() => navigator.clipboard.writeText(manifest).then(() => toast.success('Manifest copied'))} aria-label="Copy manifest" style={{ color: '#8A8A8A', marginTop: 6 }}><Copy size={16} /></button>
          </div>
        </div>
      )}
    </DataCard>
  );
}
