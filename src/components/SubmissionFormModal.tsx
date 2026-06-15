'use client';
import React, { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import type { Submission } from '@/types';

const NEEDS_HELP_OPTIONS = [
  'Community growth', 'Partnerships', 'GTM / distribution', 'Fundraising',
  'Product strategy', 'Token launch strategy', 'Technical architecture', 'Security', 'Hiring', 'Other',
];

const inputStyle: React.CSSProperties = {
  height: 36, width: '100%', backgroundColor: '#141414', border: '1px solid rgba(255,255,255,0.1)',
  color: '#F0F0F0', fontFamily: "'Inter', sans-serif", fontSize: 13, padding: '0 12px', borderRadius: 6, outline: 'none',
};
const areaStyle: React.CSSProperties = { ...inputStyle, height: 72, padding: '8px 12px', resize: 'vertical' as const };
const labelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: '#525252', letterSpacing: '0.04em',
  textTransform: 'uppercase' as const, display: 'block', marginBottom: 6,
};

export interface SubmissionFormValues {
  project: string; founderName: string; founderEmail: string; founderX: string;
  projectX: string; website: string; location: string; oneLiner: string;
  problem: string; solution: string; traction: string; funding: string;
  plan: string; whyBankr: string; accomplishments: string; links: string; notesField: string;
  needsHelp: string[];
}

const emptyValues: SubmissionFormValues = {
  project: '', founderName: '', founderEmail: '', founderX: '', projectX: '', website: '', location: '',
  oneLiner: '', problem: '', solution: '', traction: '', funding: '', plan: '', whyBankr: '',
  accomplishments: '', links: '', notesField: '', needsHelp: [],
};

export function valuesFromSubmission(s: Submission): SubmissionFormValues {
  const f = (s.founders && s.founders[0]) || { name: '', x: '', email: '' };
  return {
    project: s.project || '', founderName: f.name || '', founderEmail: f.email || '', founderX: f.x || '',
    projectX: s.project_x || '', website: s.website || '', location: s.location || '',
    oneLiner: s.one_liner || '', problem: s.problem || '', solution: s.solution || '',
    traction: s.traction || '', funding: s.funding || '', plan: s.plan || '', whyBankr: s.why_bankr || '',
    accomplishments: s.accomplishments || '', links: s.links || '', notesField: s.notes_field || '',
    needsHelp: s.needs_help || [],
  };
}

interface Props {
  open: boolean;
  mode: 'create' | 'edit';
  initial?: SubmissionFormValues;
  onClose: () => void;
  /** Returns an error string, or null on success. */
  onSubmit: (values: SubmissionFormValues) => Promise<string | null>;
}

const SubmissionFormModal: React.FC<Props> = ({ open, mode, initial, onClose, onSubmit }) => {
  const [v, setV] = useState<SubmissionFormValues>(initial ?? emptyValues);
  const [busy, setBusy] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (open) setV(initial ?? emptyValues);
  }, [open, initial]);

  const set = (k: keyof SubmissionFormValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setV((p) => ({ ...p, [k]: e.target.value }));
  const toggleTag = (tag: string) =>
    setV((p) => ({ ...p, needsHelp: p.needsHelp.includes(tag) ? p.needsHelp.filter((t) => t !== tag) : [...p.needsHelp, tag] }));

  const valid = v.project.trim() && (mode === 'edit' || v.founderName.trim());

  const submit = useCallback(async () => {
    if (!valid || busy) return;
    setBusy(true);
    const err = await onSubmit(v);
    setBusy(false);
    if (err) { toast.error(mode === 'create' ? 'Could not add submission' : 'Could not save changes', { description: err }); return; }
    onClose();
  }, [v, valid, busy, mode, onSubmit, onClose]);

  if (!mounted) return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}
            className="fixed inset-0 z-40" style={{ backgroundColor: 'rgba(0,0,0,0.55)' }} onClick={onClose} />
          <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
            className="fixed z-50" role="dialog" aria-modal
            style={{
              top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '100%', maxWidth: 720,
              maxHeight: '85vh', overflowY: 'auto', backgroundColor: '#1A1A1A',
              border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12,
              boxShadow: '0 8px 32px rgba(0,0,0,0.5)', padding: 24,
            }}>
            <div className="flex items-center justify-between mb-5">
              <h3 style={{ fontFamily: "'Manrope', sans-serif", fontSize: 18, fontWeight: 700, color: '#F0F0F0' }}>
                {mode === 'create' ? 'Add Submission' : 'Edit Submission'}
              </h3>
              <button onClick={onClose} className="flex items-center justify-center w-8 h-8 rounded-md" style={{ color: '#525252' }}>
                <X size={18} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 md:col-span-1">
                <label style={labelStyle}>Project *</label>
                <input style={inputStyle} value={v.project} onChange={set('project')} placeholder="Project name" />
              </div>
              <div className="col-span-2 md:col-span-1">
                <label style={labelStyle}>Project X Handle</label>
                <input style={inputStyle} value={v.projectX} onChange={set('projectX')} placeholder="@project" />
              </div>

              {mode === 'create' && (
                <>
                  <div className="col-span-2 md:col-span-1">
                    <label style={labelStyle}>Founder Name *</label>
                    <input style={inputStyle} value={v.founderName} onChange={set('founderName')} placeholder="Jane Doe" />
                  </div>
                  <div className="col-span-2 md:col-span-1">
                    <label style={labelStyle}>Founder X</label>
                    <input style={inputStyle} value={v.founderX} onChange={set('founderX')} placeholder="@janedoe" />
                  </div>
                  <div className="col-span-2 md:col-span-1">
                    <label style={labelStyle}>Founder Email</label>
                    <input style={inputStyle} value={v.founderEmail} onChange={set('founderEmail')} placeholder="jane@project.xyz" />
                  </div>
                </>
              )}

              <div className="col-span-2 md:col-span-1">
                <label style={labelStyle}>Website</label>
                <input style={inputStyle} value={v.website} onChange={set('website')} placeholder="https://…" />
              </div>
              <div className="col-span-2 md:col-span-1">
                <label style={labelStyle}>Location</label>
                <input style={inputStyle} value={v.location} onChange={set('location')} placeholder="City / remote" />
              </div>
              <div className="col-span-2">
                <label style={labelStyle}>One-liner</label>
                <input style={inputStyle} value={v.oneLiner} onChange={set('oneLiner')} placeholder="What the project does, in a sentence" />
              </div>

              <div className="col-span-2">
                <label style={labelStyle}>Needs Help With</label>
                <div className="flex flex-wrap gap-1.5">
                  {NEEDS_HELP_OPTIONS.map((tag) => {
                    const on = v.needsHelp.includes(tag);
                    return (
                      <button key={tag} onClick={() => toggleTag(tag)} type="button"
                        className="px-2.5 py-1 rounded-full transition-all duration-100"
                        style={{
                          fontSize: 11, fontWeight: 500,
                          backgroundColor: on ? 'rgba(245,166,35,0.15)' : '#141414',
                          color: on ? '#F5A623' : '#8A8A8A',
                          border: on ? '1px solid rgba(245,166,35,0.4)' : '1px solid rgba(255,255,255,0.1)',
                        }}>
                        {tag}
                      </button>
                    );
                  })}
                </div>
              </div>

              {([
                ['problem', 'Problem'], ['solution', 'Solution'], ['traction', 'Traction'], ['funding', 'Funding Status'],
                ['plan', 'Plan'], ['whyBankr', 'Why Bankr'], ['accomplishments', 'Accomplishments'], ['links', 'Links'], ['notesField', 'Notes'],
              ] as [keyof SubmissionFormValues, string][]).map(([key, label]) => (
                <div className="col-span-2" key={key}>
                  <label style={labelStyle}>{label}</label>
                  <textarea style={areaStyle} value={v[key] as string} onChange={set(key)} />
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2 mt-5">
              <button onClick={onClose} className="px-4 py-2 rounded-md"
                style={{ backgroundColor: 'transparent', color: '#8A8A8A', border: '1px solid rgba(255,255,255,0.1)', fontSize: 13, fontWeight: 600 }}>
                Cancel
              </button>
              <button onClick={submit} disabled={!valid || busy} className="px-4 py-2 rounded-md"
                style={{
                  backgroundColor: valid ? '#F5A623' : '#2A2A2A', color: valid ? '#0D0D0D' : '#525252',
                  fontSize: 13, fontWeight: 600, cursor: valid && !busy ? 'pointer' : 'not-allowed', opacity: busy ? 0.6 : 1,
                }}>
                {busy ? 'Saving…' : mode === 'create' ? 'Add Submission' : 'Save Changes'}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
};

export default SubmissionFormModal;
