'use client';
import React, { useEffect, useState } from 'react';
import { Trash2, X } from 'lucide-react';
import NotionBoards from '@/components/beta/NotionBoards';
import { card, type Ctx, faint, Field, field, grid, ink, label, muted, primaryBtn, Select } from './ui';

interface Team { id: string; name: string }

export default function Settings({ ctx, teams, onSave, onDelete }: { ctx: Ctx; teams: Team[]; onSave: (b: object) => Promise<boolean>; onDelete: () => void }) {
  const p = ctx.data.program;
  const canManage = ctx.data.canManage;
  const [f, setF] = useState({
    name: p.name, product: p.product ?? '', description: p.description ?? '', welcome: p.welcome ?? '',
    teamId: p.teamId ?? '', bugTeamId: p.bugTeamId ?? '', maxTesters: p.maxTesters ? String(p.maxTesters) : '', endsAt: p.endsAt ? p.endsAt.slice(0, 10) : '',
    leadId: p.leadId ?? '', senderId: p.senderId ?? '',
  });
  const [questions, setQuestions] = useState(p.questions);
  const [areas, setAreas] = useState<string[]>(p.testAreas);
  const [newArea, setNewArea] = useState('');
  const [plain, setPlain] = useState({ enabled: p.plainEnabled, labelTypeId: p.plainLabelTypeId ?? '' });
  const [labels, setLabels] = useState<{ configured: boolean; labels: { id: string; name: string }[]; error?: string } | null>(null);
  useEffect(() => { fetch('/api/plain/labels').then((r) => r.json()).then(setLabels).catch(() => {}); }, []);
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  const dis = !canManage;
  const people = ctx.people.map((x) => [x.id, x.name || x.email] as const);
  const addArea = () => { const a = newArea.trim(); if (a && !areas.includes(a) && areas.length < 30) setAreas([...areas, a]); setNewArea(''); };

  return (
    <div className="flex flex-col gap-4" style={{ maxWidth: 760 }}>
      <div className="flex flex-col gap-4" style={{ ...card, padding: 18 }}>
        <div style={grid(220)}>
          <Field name="Program name"><input disabled={dis} value={f.name} onChange={(e) => set('name', e.target.value)} style={field} /></Field>
          <Field name="Product"><input disabled={dis} value={f.product} onChange={(e) => set('product', e.target.value)} style={field} /></Field>
        </div>
        <Field name="Join page text"><textarea disabled={dis} rows={4} value={f.description} onChange={(e) => set('description', e.target.value)} style={{ ...field, resize: 'vertical' }} /></Field>
        <Field name="Welcome note (after joining)"><textarea disabled={dis} rows={3} value={f.welcome} onChange={(e) => set('welcome', e.target.value)} placeholder="What to test first, where to find the build, how long the beta runs." style={{ ...field, resize: 'vertical' }} /></Field>
        <div style={grid(150)}>
          <Field name="Reports go to"><Select disabled={dis} value={f.teamId} onChange={(v) => set('teamId', v)} opts={teams.map((t) => [t.id, t.name] as const)} empty="No team" /></Field>
          <Field name="Bugs go to"><Select disabled={dis} value={f.bugTeamId} onChange={(v) => set('bugTeamId', v)} opts={teams.map((t) => [t.id, t.name] as const)} empty="Same team" /></Field>
          <Field name="Max testers"><input disabled={dis} inputMode="numeric" value={f.maxTesters} onChange={(e) => set('maxTesters', e.target.value.replace(/\D/g, ''))} placeholder="No cap" style={field} /></Field>
          <Field name="Ends"><input disabled={dis} type="date" value={f.endsAt} onChange={(e) => set('endsAt', e.target.value)} style={{ ...field, colorScheme: 'dark' }} /></Field>
        </div>

        <div>
          <span style={label}>People</span>
          <div style={grid(220)}>
            <Field name="Feature lead"><Select disabled={dis} value={f.leadId} onChange={(v) => set('leadId', v)} opts={people} empty="Nobody yet" /></Field>
            <Field name="Sends outreach"><Select disabled={dis} value={f.senderId} onChange={(v) => set('senderId', v)} opts={people} empty="Nobody yet" /></Field>
          </div>
          <p style={{ fontSize: 12, color: faint, marginTop: 6 }}>The lead approves messages to testers and owns new and fixed-live reports; the sender sends approved messages and runs retests. Their own requests skip approval.</p>
        </div>

        <div>
          <span style={label}>Test areas</span>
          <div className="flex flex-wrap gap-1.5" style={{ marginBottom: 8 }}>
            {areas.map((a) => (
              <span key={a} className="inline-flex items-center gap-1" style={{ fontSize: 12.5, padding: '4px 6px 4px 10px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.12)', color: ink }}>
                {a}{!dis && <button onClick={() => setAreas(areas.filter((x) => x !== a))} aria-label={`Remove ${a}`} style={{ color: faint }}><X size={12} /></button>}
              </span>
            ))}
            {areas.length === 0 && <span style={{ fontSize: 12.5, color: faint }}>None — add the parts of the product testers should cover.</span>}
          </div>
          {!dis && (
            <div className="flex gap-2" style={{ maxWidth: 420 }}>
              <input value={newArea} onChange={(e) => setNewArea(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addArea(); } }} placeholder="e.g. Onboarding, Send to Phone" style={field} />
              <button onClick={addArea} style={{ fontSize: 12.5, color: muted, whiteSpace: 'nowrap' }}>Add area</button>
            </div>
          )}
        </div>

        <div>
          <span style={label}>Sign-up questions</span>
          <div className="flex flex-col gap-2">
            {questions.map((q, i) => (
              <div key={q.id} className="flex items-center gap-2">
                <input disabled={dis} value={q.label} onChange={(e) => setQuestions((qs) => qs.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} style={field} />
                <label className="flex items-center gap-1" style={{ fontSize: 12, color: muted, whiteSpace: 'nowrap' }}><input disabled={dis} type="checkbox" checked={!!q.required} onChange={(e) => setQuestions((qs) => qs.map((x, j) => (j === i ? { ...x, required: e.target.checked } : x)))} /> required</label>
                {!dis && <button onClick={() => setQuestions((qs) => qs.filter((_, j) => j !== i))} aria-label="Remove question" style={{ color: faint }}><X size={15} /></button>}
              </div>
            ))}
            {!dis && questions.length < 10 && (
              <button onClick={() => setQuestions((qs) => [...qs, { id: `q${Date.now().toString(36)}`, label: '', required: false }])} style={{ fontSize: 12.5, color: muted, alignSelf: 'flex-start' }}>+ Add a question (e.g. “How often do you trade?”)</button>
            )}
          </div>
        </div>

        <div>
          <span style={label}>Plain</span>
          <label className="flex items-start gap-2" style={{ fontSize: 13, color: ink }}>
            <input disabled={dis} type="checkbox" checked={plain.enabled} onChange={(e) => setPlain((x) => ({ ...x, enabled: e.target.checked }))} style={{ marginTop: 3 }} />
            <span>Each report opens a thread in Plain, replies go both ways (Plain emails your replies to the tester), and testers get live chat on their page.
              {labels && !labels.configured && <span style={{ color: faint }}> Plain isn’t connected yet; this starts working once it is.</span>}</span>
          </label>
          {plain.enabled && labels?.configured && (
            <div className="flex items-center gap-2" style={{ marginTop: 8, maxWidth: 360 }}>
              <span style={{ fontSize: 12.5, color: muted, whiteSpace: 'nowrap' }}>Label in Plain</span>
              <Select disabled={dis} value={plain.labelTypeId} onChange={(v) => setPlain((x) => ({ ...x, labelTypeId: v }))} opts={labels.labels.map((l) => [l.id, l.name] as const)} empty="None" ariaLabel="Plain label for this program" />
            </div>
          )}
          {labels?.error && <p style={{ fontSize: 12, color: faint, marginTop: 6 }}>Couldn’t load Plain labels: {labels.error}</p>}
        </div>

        {canManage && (
          <div className="flex items-center gap-2">
            <button onClick={onDelete} className="inline-flex items-center gap-1.5" style={{ fontSize: 12.5, color: faint }}><Trash2 size={14} /> Delete program</button>
            <span style={{ flex: 1 }} />
            <button onClick={() => onSave({
              ...f, leadId: f.leadId || null, senderId: f.senderId || null, testAreas: areas,
              endsAt: f.endsAt ? `${f.endsAt}T23:59:00Z` : null, questions: questions.filter((q) => q.label.trim()), plainEnabled: plain.enabled, plainLabelTypeId: plain.labelTypeId || null,
            })} style={primaryBtn}>Save settings</button>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3" style={{ ...card, padding: 18 }}>
        <span style={{ ...label, marginBottom: 0 }}>Notion</span>
        <NotionBoards programId={ctx.programId} canManage={canManage} />
      </div>
    </div>
  );
}
