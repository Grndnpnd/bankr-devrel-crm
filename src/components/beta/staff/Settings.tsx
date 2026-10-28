'use client';
import React, { useEffect, useState } from 'react';
import { ExternalLink, Trash2, X } from 'lucide-react';
import NotionBoards from '@/components/beta/NotionBoards';
import { card, type Ctx, faint, Field, field, FormError, grid, Help, ink, label, muted, peopleOpts, primaryBtn, Select } from './ui';

interface Team { id: string; name: string }
type SaveResult = { ok: boolean; error?: string; warning?: string | null };

const MAX_AREAS = 30;
/** Which field a server error is about, so it shows next to that field. */
const errorField = (e: string) =>
  /name/i.test(e) && !/team/i.test(e) ? 'name' : /max testers/i.test(e) ? 'maxTesters' : /test areas?/i.test(e) ? 'areas'
    : /contact email/i.test(e) ? 'contactEmail' : /privacy/i.test(e) ? 'privacyUrl' : /end date/i.test(e) ? 'endsAt' : /team/i.test(e) ? 'teamId' : 'form';

/** Program settings. Re-mounted (keyed on the program's updatedAt) after every save, so it always shows what was saved. */
export default function Settings({ ctx, teams, onSave, onDelete }: { ctx: Ctx; teams: Team[]; onSave: (b: object) => Promise<SaveResult>; onDelete: () => void }) {
  const p = ctx.data.program;
  const canManage = ctx.data.canManage;
  const [f, setF] = useState({
    name: p.name, product: p.product ?? '', description: p.description ?? '', welcome: p.welcome ?? '',
    teamId: p.teamId ?? '', bugTeamId: p.bugTeamId ?? '', maxTesters: p.maxTesters ? String(p.maxTesters) : '', endsAt: p.endsAt ? p.endsAt.slice(0, 10) : '',
    leadId: p.leadId ?? '', senderId: p.senderId ?? '', runBy: p.runBy ?? '', contactEmail: p.contactEmail ?? '', privacyUrl: p.privacyUrl ?? '',
  });
  const [questions, setQuestions] = useState(p.questions);
  const [areas, setAreas] = useState<string[]>(p.testAreas);
  const [newArea, setNewArea] = useState('');
  const [areaMsg, setAreaMsg] = useState<string | null>(null);
  const [plain, setPlain] = useState({ enabled: p.plainEnabled, labelTypeId: p.plainLabelTypeId ?? '' });
  const [labels, setLabels] = useState<{ configured: boolean; labels: { id: string; name: string }[]; error?: string } | null>(null);
  const [saving, setSaving] = useState(false);
  // Every problem at once, each next to its field (server errors land on the field they're about).
  const [errs, setErrs] = useState<Record<string, string>>({});
  useEffect(() => { fetch('/api/plain/labels').then((r) => r.json()).then(setLabels).catch(() => {}); }, []);
  const set = (k: keyof typeof f, v: string) => { setF((x) => ({ ...x, [k]: v })); if (errs[k]) setErrs(({ [k]: _drop, ...rest }) => rest); };
  const dis = !canManage || saving;
  const people = peopleOpts(ctx.people);
  const errFor = (k: string) => (errs[k] ? <FormError text={errs[k]} /> : null);
  const pastEnd = !!f.endsAt && f.endsAt < new Date().toISOString().slice(0, 10);

  function addArea() {
    const a = newArea.trim();
    if (!a) return;
    if (areas.includes(a)) { setAreaMsg(`“${a}” is already there.`); return; }
    if (areas.length >= MAX_AREAS) { setAreaMsg(`Up to ${MAX_AREAS} test areas. Remove one to add another.`); return; }
    setAreas([...areas, a]); setNewArea(''); setAreaMsg(null);
  }
  async function save() {
    if (saving) return;
    const found: Record<string, string> = {};
    if (!f.name.trim()) found.name = 'Give the program a name.';
    if (f.maxTesters.trim() && !/^\d+$/.test(f.maxTesters.trim())) found.maxTesters = 'Use a whole number, like 50 (or leave it empty for no limit).';
    else if (f.maxTesters.trim() && (Number(f.maxTesters) < 1 || Number(f.maxTesters) > 100_000)) found.maxTesters = 'Use a number from 1 to 100,000.';
    if (f.contactEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.contactEmail.trim())) found.contactEmail = 'That email doesn’t look right.';
    if (f.privacyUrl.trim() && !/^https:\/\/\S+$/.test(f.privacyUrl.trim())) found.privacyUrl = 'Use a link that starts with https://';
    if (Object.keys(found).length) { setErrs(found); return; }
    setSaving(true); setErrs({});
    const r = await onSave({
      ...f, maxTesters: f.maxTesters.trim(), leadId: f.leadId || null, senderId: f.senderId || null, testAreas: areas,
      runBy: f.runBy.trim() || null, contactEmail: f.contactEmail.trim() || null, privacyUrl: f.privacyUrl.trim() || null,
      endsAt: f.endsAt ? `${f.endsAt}T23:59:00Z` : null, questions: questions.filter((q) => q.label.trim()), plainEnabled: plain.enabled, plainLabelTypeId: plain.labelTypeId || null,
    });
    // On success this component is re-mounted with the saved program; only failures land here.
    if (!r.ok && r.error) setErrs({ [errorField(r.error)]: r.error }); // the inputs keep what was typed
    setSaving(false);
  }

  return (
    <div className="flex flex-col gap-4" style={{ maxWidth: 760, minWidth: 0 }}>
      <div className="flex flex-col gap-4" style={{ ...card, padding: 16 }}>
        <div className="flex flex-wrap items-center gap-2">
          <span style={{ ...label, marginBottom: 0, flex: 1 }}>What testers see</span>
          <a href={p.joinUrl} target="_blank" rel="noreferrer" className="bp-tap inline-flex items-center gap-1" style={{ fontSize: 12.5, color: muted }}>Preview the tester page <ExternalLink size={12} /></a>
        </div>
        <div style={grid(220)}>
          <Field name="Program name">
            <input disabled={dis} value={f.name} maxLength={100} onChange={(e) => set('name', e.target.value)} style={field} />
            {f.name.length > 80 && <Help>{100 - f.name.length} characters left</Help>}
            {errFor('name')}
          </Field>
          <Field name="Product (optional)"><input disabled={dis} value={f.product} maxLength={100} onChange={(e) => set('product', e.target.value)} placeholder="e.g. Wallet v2" style={field} /></Field>
        </div>
        <Field name="Join page text (shown before they join)">
          <textarea disabled={dis} rows={4} value={f.description} onChange={(e) => set('description', e.target.value)} placeholder="e.g. What it is, what to try, how long the beta runs." style={{ ...field, resize: 'vertical' }} />
          <Help>Shown above the sign-up form. Without it, testers only see the program name.</Help>
        </Field>
        <Field name="Welcome note (after joining)">
          <textarea disabled={dis} rows={3} value={f.welcome} onChange={(e) => set('welcome', e.target.value)} placeholder="e.g. Install the app from this link, then try sending $1 to a friend." style={{ ...field, resize: 'vertical' }} />
          <Help>Testers see this right after joining and can open it again from their page. Include every link or number it mentions.</Help>
        </Field>
        <div style={grid(220)}>
          <Field name="Run by (shown to testers)">
            <input disabled={dis} value={f.runBy} maxLength={100} onChange={(e) => set('runBy', e.target.value)} placeholder="e.g. Bankr Inc." style={field} />
            {errFor('runBy')}
          </Field>
          <Field name="Contact email for testers">
            <input disabled={dis} type="email" value={f.contactEmail} onChange={(e) => set('contactEmail', e.target.value)} placeholder="e.g. beta@yourcompany.com" style={field} />
            {errFor('contactEmail')}
          </Field>
          <Field name="Privacy policy link" span>
            <input disabled={dis} value={f.privacyUrl} onChange={(e) => set('privacyUrl', e.target.value)} placeholder="e.g. https://yourcompany.com/privacy" style={field} />
            <Help>Testers see who runs the beta, how to reach you and this link before they give their email.</Help>
            {errFor('privacyUrl')}
          </Field>
        </div>
      </div>

      <div className="flex flex-col gap-4" style={{ ...card, padding: 16 }}>
        <span style={{ ...label, marginBottom: 0 }}>Running the beta</span>
        <p style={{ fontSize: 12.5, color: muted, margin: 0 }}>
          Who can see this program (its testers, reports, messages, payouts and export): admins, members of the two teams below, the lead, the sender and the person who created it. To let someone else in, add them to one of those teams.
        </p>
        <div style={grid(160)}>
          <Field name="Feedback, ideas and questions go to">
            <Select disabled={dis} value={f.teamId} onChange={(v) => set('teamId', v)} opts={teams.map((t) => [t.id, t.name] as const)} empty="No team (nobody is told)" />
            {errFor('teamId')}
          </Field>
          <Field name="Bugs go to"><Select disabled={dis} value={f.bugTeamId} onChange={(v) => set('bugTeamId', v)} opts={teams.map((t) => [t.id, t.name] as const)} empty="The same team" /></Field>
          <Field name="Most testers allowed">
            <input disabled={dis} type="number" min={1} step={1} inputMode="numeric" value={f.maxTesters} onChange={(e) => set('maxTesters', e.target.value)} placeholder="Empty = no limit" style={field} />
            {errFor('maxTesters')}
          </Field>
          <Field name="Last day">
            <input disabled={dis} type="date" value={f.endsAt} onChange={(e) => set('endsAt', e.target.value)} style={{ ...field, colorScheme: 'dark' }} />
            {pastEnd && <Help style={{ color: '#EF4444' }}>This day has passed — once saved, sign-ups and new reports are closed.</Help>}
            {errFor('endsAt')}
          </Field>
        </div>

        <div>
          <span style={label}>People</span>
          <div style={grid(220)}>
            <Field name="Lead">
              <Select disabled={dis} value={f.leadId} onChange={(v) => set('leadId', v)} opts={people} empty="Nobody yet" />
              <Help>Approves messages to testers and is told about every new report.</Help>
            </Field>
            <Field name="Sender">
              <Select disabled={dis} value={f.senderId} onChange={(v) => set('senderId', v)} opts={people} empty="Nobody yet" />
              <Help>Sends approved messages to testers and asks them to try fixes again.</Help>
            </Field>
          </div>
          <Help>Messages the lead or the sender write themselves don’t need approval.</Help>
        </div>

        <div>
          <span style={label}>Test areas</span>
          <div className="flex flex-wrap gap-1.5" style={{ marginBottom: 8 }}>
            {areas.map((a) => (
              <span key={a} className="inline-flex items-center gap-1" style={{ fontSize: 12.5, padding: '4px 6px 4px 10px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.12)', color: ink, maxWidth: '100%', overflowWrap: 'anywhere' }}>
                {a}{!dis && <button onClick={() => { setAreas(areas.filter((x) => x !== a)); setAreaMsg(null); }} aria-label={`Remove ${a}`} className="bp-sq" style={{ color: faint }}><X size={12} /></button>}
              </span>
            ))}
            {areas.length === 0 && <span style={{ fontSize: 12.5, color: faint }}>None — add the parts of the product testers should cover.</span>}
          </div>
          {!dis && (
            <div className="flex gap-2" style={{ maxWidth: 420 }}>
              <input value={newArea} maxLength={60} onChange={(e) => setNewArea(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addArea(); } }} placeholder="e.g. Onboarding" style={field} aria-label="New test area" />
              <button onClick={addArea} className="bp-tap" style={{ fontSize: 12.5, color: muted, whiteSpace: 'nowrap' }}>Add area</button>
            </div>
          )}
          <Help>{areas.length}/{MAX_AREAS} areas. Testers pick one when they report; the overview shows who covers what.</Help>
          <FormError text={areaMsg} />
          {errFor('areas')}
        </div>

        <div>
          <span style={label}>Sign-up questions</span>
          <div className="flex flex-col gap-2">
            {questions.map((q, i) => (
              <div key={q.id} className="flex items-center gap-2">
                <input disabled={dis} value={q.label} onChange={(e) => setQuestions((qs) => qs.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} style={field} aria-label={`Question ${i + 1}`} />
                <label className="flex items-center gap-1" style={{ fontSize: 12, color: muted, whiteSpace: 'nowrap' }}><input disabled={dis} type="checkbox" checked={!!q.required} onChange={(e) => setQuestions((qs) => qs.map((x, j) => (j === i ? { ...x, required: e.target.checked } : x)))} /> required</label>
                {!dis && <button onClick={() => setQuestions((qs) => qs.filter((_, j) => j !== i))} aria-label="Remove question" className="bp-sq" style={{ color: faint }}><X size={15} /></button>}
              </div>
            ))}
            {!dis && questions.length < 10 && (
              <button onClick={() => setQuestions((qs) => [...qs, { id: `q${Date.now().toString(36)}`, label: '', required: false }])} className="bp-tap" style={{ fontSize: 12.5, color: muted, alignSelf: 'flex-start' }}>+ Add a question (e.g. “How often do you trade?”)</button>
            )}
          </div>
        </div>

        <div>
          <span style={label}>Plain (support inbox)</span>
          <label className="flex items-start gap-2" style={{ fontSize: 13, color: ink }}>
            <input disabled={dis} type="checkbox" checked={plain.enabled} onChange={(e) => setPlain((x) => ({ ...x, enabled: e.target.checked }))} style={{ marginTop: 3 }} />
            <span>Each report also opens a conversation in Plain, your replies are emailed to the tester from there, and testers get live chat on their page.
              {labels && !labels.configured && <span style={{ color: faint }}> Plain isn’t connected yet; this starts working once it is.</span>}</span>
          </label>
          {plain.enabled && labels?.configured && (
            <div className="flex items-center gap-2" style={{ marginTop: 8, maxWidth: 360 }}>
              <span style={{ fontSize: 12.5, color: muted, whiteSpace: 'nowrap' }}>Plain label (tags this program’s threads)</span>
              <Select disabled={dis} value={plain.labelTypeId} onChange={(v) => setPlain((x) => ({ ...x, labelTypeId: v }))} opts={labels.labels.map((l) => [l.id, l.name] as const)} empty="None" ariaLabel="Plain label for this program" />
            </div>
          )}
          {labels?.error && <p style={{ fontSize: 12, color: faint, marginTop: 6 }}>Couldn’t load Plain labels: {labels.error}</p>}
        </div>

        {canManage && (
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={onDelete} disabled={saving} className="bp-tap inline-flex items-center gap-1.5" style={{ fontSize: 12.5, color: faint }}><Trash2 size={14} /> Delete program</button>
            <span style={{ flex: 1 }} />
            {errs.form && <FormError text={errs.form} />}
            {Object.keys(errs).some((k) => k !== 'form') && <FormError text="Fix the fields marked above, then save." />}
            <button onClick={save} disabled={saving} className="bp-tap" style={{ ...primaryBtn, opacity: saving ? 0.6 : 1 }}>{saving ? 'Saving…' : 'Save settings'}</button>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3" style={{ ...card, padding: 16 }}>
        <span style={{ ...label, marginBottom: 0 }}>Notion</span>
        <NotionBoards programId={ctx.programId} canManage={canManage} />
      </div>
    </div>
  );
}
