import { useMemo } from 'react';
import { create } from 'zustand';
import type { Submission, FilterState, SortConfig, Activity } from '@/types';

interface TeamUser { email: string; name: string | null; role: string }
interface Me { email: string; name: string | null; role: string }
export interface TokenCandidate { tokenAddress: string; symbol: string | null; name: string | null; status: string | null; deployerX: string | null; feeX: string | null; identityMatch: boolean; projectMatch?: boolean; bankrDeployed: boolean; vol24h?: number | null; marketCapUsd?: number | null }
export interface DashboardWidget { id: string; visible: boolean; span: number; order: number; height?: number | null }
export interface NamedLayout { id: string; name: string; layout: DashboardWidget[] }
export interface SavedPanel { id: string; spec: any; title: string; isPublic: boolean; mine: boolean; ownerName: string; createdAt: string }
export interface ProposedEditDTO { id: string; submissionId: string; changes: any[]; rationale: string | null; status: string; source: string; proposedBy: string | null; createdAt: string; submission?: { id: string; project: string } }

interface SubmissionStore {
  submissions: Submission[];
  users: TeamUser[];
  me: Me | null;
  dashboardLayout: DashboardWidget[] | null;
  dashboardDefault: DashboardWidget[] | null;
  dashboardLayouts: NamedLayout[];
  activeLayoutId: string | null;
  savedPanels: SavedPanel[];
  proposals: ProposedEditDTO[];
  loaded: boolean;
  loading: boolean;
  searchQuery: string;
  filters: FilterState;
  sort: SortConfig;

  setMe: (me: Me | null) => void;
  loadDashboardLayout: () => Promise<void>;
  saveDashboardLayout: (layout: DashboardWidget[]) => Promise<void>;
  setDashboardLayout: (layout: DashboardWidget[]) => void;
  saveDashboardDefault: (layout: DashboardWidget[]) => Promise<void>;
  saveNamedLayout: (name: string, layout: DashboardWidget[], id?: string) => Promise<NamedLayout | null>;
  switchLayout: (id: string) => Promise<void>;
  renameLayout: (id: string, name: string) => Promise<void>;
  deleteLayout: (id: string) => Promise<void>;
  loadProposals: () => Promise<void>;
  resolveProposal: (id: string, action: 'approve' | 'reject') => Promise<boolean>;
  loadSavedPanels: () => Promise<void>;
  addSavedPanel: (spec: any, isPublic?: boolean) => Promise<SavedPanel | null>;
  removeSavedPanel: (id: string) => Promise<void>;
  togglePanelVisibility: (id: string, isPublic: boolean) => Promise<void>;
  load: () => Promise<void>;
  loadUsers: () => Promise<void>;
  importNow: (source?: string) => Promise<any>;
  refreshOnchain: () => Promise<any>;

  setSearch: (query: string) => void;
  setFilters: (filters: Partial<FilterState>) => void;
  setSort: (sort: SortConfig) => void;

  updateStage: (id: string, stage: string) => Promise<void>;
  updateOwner: (id: string, owner: string) => Promise<void>;
  addActivity: (id: string, activity: Activity) => Promise<void>;
  setContractAddress: (id: string, contractAddress: string) => Promise<{ ok: boolean; error?: string }>;
  clearContractAddress: (id: string) => Promise<{ ok: boolean; error?: string }>;
  findToken: (id: string) => Promise<{ ok: boolean; error?: string; via?: string; ambiguous?: boolean; candidates?: TokenCandidate[] }>;
  deleteSubmission: (id: string) => Promise<boolean>;
  createSubmission: (payload: Record<string, unknown>) => Promise<{ ok: boolean; error?: string; id?: string }>;
  updateSubmissionFields: (id: string, fields: Record<string, unknown>) => Promise<{ ok: boolean; error?: string }>;

  filteredSubmissions: () => Submission[];
  getSubmissionById: (id: string) => Submission | undefined;
}

const buildRegex = (query: string): RegExp | null => {
  try {
    return new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  } catch {
    return null;
  }
};

const replaceRow = (set: any) => (row: Submission) =>
  set((state: SubmissionStore) => ({
    submissions: state.submissions.map((s) => (s.id === row.id ? row : s)),
  }));

export const useSubmissionStore = create<SubmissionStore>((set, get) => ({
  submissions: [],
  users: [],
  me: null,
  dashboardLayout: null,
  dashboardDefault: null,
  dashboardLayouts: [],
  activeLayoutId: null,
  savedPanels: [],
  proposals: [],
  loaded: false,
  loading: false,
  searchQuery: '',
  filters: {
    stage: [],
    tags: [],
    owner: null,
    source: null,
    liveOnly: false,
    reviewOnly: false,
    hideLowEffort: false,
    scoreMin: 0,
    scoreMax: 100,
  },
  sort: { key: 'score', direction: 'desc' as const },

  setMe: (me) => set({ me }),
  setDashboardLayout: (layout) => set({ dashboardLayout: layout }),
  loadDashboardLayout: async () => {
    try {
      const res = await fetch('/api/me');
      if (!res.ok) return;
      const data = await res.json();
      const layout = Array.isArray(data?.dashboardLayout) ? (data.dashboardLayout as DashboardWidget[]) : null;
      const dflt = Array.isArray(data?.dashboardDefault) ? (data.dashboardDefault as DashboardWidget[]) : null;
      const layouts = Array.isArray(data?.dashboardLayouts) ? (data.dashboardLayouts as NamedLayout[]) : [];
      const activeId = typeof data?.activeLayoutId === 'string' ? data.activeLayoutId : null;
      // If a named layout is active, prefer its layout as the working layout.
      const active = layouts.find((l) => l.id === activeId);
      set({
        dashboardLayout: active ? active.layout : layout,
        dashboardDefault: dflt,
        dashboardLayouts: layouts,
        activeLayoutId: activeId,
      });
      // Panels now live in their own table; load them separately.
      await get().loadSavedPanels();
    } catch { /* keep defaults */ }
  },
  loadProposals: async () => {
    try {
      const res = await fetch('/api/proposed-edits?status=pending');
      if (!res.ok) return;
      const data = await res.json();
      set({ proposals: Array.isArray(data?.proposals) ? data.proposals : [] });
    } catch { /* keep */ }
  },
  resolveProposal: async (id, action) => {
    try {
      const res = await fetch(`/api/proposed-edits/${id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) return false;
      set({ proposals: get().proposals.filter((p) => p.id !== id) });
      if (action === 'approve') get().load(); // refresh submissions to show applied change
      return true;
    } catch { return false; }
  },
  loadSavedPanels: async () => {
    try {
      const res = await fetch('/api/panels');
      if (!res.ok) return;
      const data = await res.json();
      set({ savedPanels: Array.isArray(data) ? (data as SavedPanel[]) : [] });
    } catch { /* keep */ }
  },
  addSavedPanel: async (spec, isPublic = false) => {
    try {
      const res = await fetch('/api/panels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spec, title: spec?.title, isPublic }),
      });
      if (!res.ok) return null;
      const panel = (await res.json()) as SavedPanel;
      set({ savedPanels: [...get().savedPanels, panel] });
      return panel;
    } catch { return null; }
  },
  removeSavedPanel: async (id) => {
    const prev = get().savedPanels;
    set({ savedPanels: prev.filter((p) => p.id !== id) });
    try {
      const res = await fetch(`/api/panels/${id}`, { method: 'DELETE' });
      if (!res.ok) set({ savedPanels: prev }); // rollback (e.g. not your panel)
    } catch { set({ savedPanels: prev }); }
  },
  togglePanelVisibility: async (id, isPublic) => {
    const prev = get().savedPanels;
    set({ savedPanels: prev.map((p) => (p.id === id ? { ...p, isPublic } : p)) });
    try {
      const res = await fetch(`/api/panels/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPublic }),
      });
      if (!res.ok) set({ savedPanels: prev });
    } catch { set({ savedPanels: prev }); }
  },
  saveDashboardLayout: async (layout) => {
    set({ dashboardLayout: layout });
    try {
      await fetch('/api/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dashboardLayout: layout }),
      });
    } catch { /* optimistic; ignore network error */ }
  },
  saveDashboardDefault: async (layout) => {
    set({ dashboardDefault: layout });
    try {
      await fetch('/api/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dashboardDefault: layout }),
      });
    } catch { /* optimistic */ }
  },

  saveNamedLayout: async (name, layout, id) => {
    const layouts = [...get().dashboardLayouts];
    let entry: NamedLayout;
    if (id) {
      const i = layouts.findIndex((l) => l.id === id);
      if (i === -1) return null;
      entry = { ...layouts[i], name: name.trim() || layouts[i].name, layout };
      layouts[i] = entry;
    } else {
      entry = { id: `layout_${Date.now().toString(36)}`, name: name.trim() || 'Untitled', layout };
      layouts.push(entry);
    }
    set({ dashboardLayouts: layouts, activeLayoutId: entry.id, dashboardLayout: layout });
    try {
      await fetch('/api/me', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dashboardLayouts: layouts, activeLayoutId: entry.id }),
      });
    } catch { /* keep optimistic */ }
    return entry;
  },
  switchLayout: async (id) => {
    const target = get().dashboardLayouts.find((l) => l.id === id);
    if (!target) return;
    set({ activeLayoutId: id, dashboardLayout: target.layout });
    try {
      await fetch('/api/me', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activeLayoutId: id }),
      });
    } catch { /* keep optimistic */ }
  },
  renameLayout: async (id, name) => {
    const layouts = get().dashboardLayouts.map((l) => (l.id === id ? { ...l, name: name.trim() || l.name } : l));
    set({ dashboardLayouts: layouts });
    try {
      await fetch('/api/me', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dashboardLayouts: layouts }),
      });
    } catch { /* keep optimistic */ }
  },
  deleteLayout: async (id) => {
    const layouts = get().dashboardLayouts.filter((l) => l.id !== id);
    const wasActive = get().activeLayoutId === id;
    const nextActive = wasActive ? (layouts[0]?.id ?? null) : get().activeLayoutId;
    const nextLayout = wasActive ? (layouts[0]?.layout ?? get().dashboardLayout) : get().dashboardLayout;
    set({ dashboardLayouts: layouts, activeLayoutId: nextActive, dashboardLayout: nextLayout });
    try {
      await fetch('/api/me', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dashboardLayouts: layouts, activeLayoutId: nextActive }),
      });
    } catch { /* keep optimistic */ }
  },

  load: async () => {
    if (get().loading) return;
    set({ loading: true });
    try {
      const res = await fetch('/api/submissions');
      if (res.ok) {
        const data = (await res.json()) as Submission[];
        set({ submissions: data, loaded: true });
      }
    } finally {
      set({ loading: false });
    }
  },

  loadUsers: async () => {
    const res = await fetch('/api/users');
    if (res.ok) set({ users: await res.json() });
  },

  importNow: async (source) => {
    const res = await fetch('/api/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(source ? { source } : {}),
    });
    const result = await res.json().catch(() => ({}));
    await get().load();
    return result;
  },

  refreshOnchain: async () => {
    const res = await fetch('/api/enrich', { method: 'POST' });
    const result = await res.json().catch(() => ({}));
    await get().load();
    return result;
  },

  setSearch: (query) => set({ searchQuery: query }),
  setFilters: (partial) => set((state) => ({ filters: { ...state.filters, ...partial } })),
  setSort: (sort) => set({ sort }),

  updateStage: async (id, stage) => {
    const res = await fetch(`/api/submissions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage }),
    });
    if (res.ok) replaceRow(set)(await res.json());
  },

  updateOwner: async (id, owner) => {
    const res = await fetch(`/api/submissions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ owner }),
    });
    if (res.ok) replaceRow(set)(await res.json());
  },

  addActivity: async (id, activity) => {
    const res = await fetch(`/api/submissions/${id}/activity`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: activity.content, kind: activity.type }),
    });
    if (res.ok) replaceRow(set)(await res.json());
  },

  setContractAddress: async (id, contractAddress) => {
    const res = await fetch(`/api/submissions/${id}/enrich`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contractAddress }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      replaceRow(set)(data);
      return { ok: true };
    }
    return { ok: false, error: data?.error || `HTTP ${res.status}` };
  },

  clearContractAddress: async (id) => {
    const res = await fetch(`/api/submissions/${id}/enrich`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      replaceRow(set)(data);
      return { ok: true };
    }
    return { ok: false, error: data?.error || `HTTP ${res.status}` };
  },

  findToken: async (id) => {
    const res = await fetch(`/api/submissions/${id}/enrich`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ auto: true }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data?.ambiguous) {
      return { ok: false, ambiguous: true, candidates: data.candidates ?? [] };
    }
    if (res.ok) {
      const { _found_via, ...row } = data;
      replaceRow(set)(row);
      return { ok: true, via: _found_via || undefined };
    }
    return { ok: false, error: data?.error || `HTTP ${res.status}` };
  },

  createSubmission: async (payload) => {
    const res = await fetch('/api/submissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      set((state) => ({ submissions: [data, ...state.submissions] }));
      return { ok: true, id: data.id };
    }
    return { ok: false, error: data?.error || `HTTP ${res.status}` };
  },

  updateSubmissionFields: async (id, fields) => {
    const res = await fetch(`/api/submissions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) { replaceRow(set)(data); return { ok: true }; }
    return { ok: false, error: data?.error || `HTTP ${res.status}` };
  },

  deleteSubmission: async (id) => {
    const res = await fetch(`/api/submissions/${id}`, { method: 'DELETE' });
    if (res.ok) {
      set((state) => ({ submissions: state.submissions.filter((s) => s.id !== id) }));
    }
    return res.ok;
  },

  getSubmissionById: (id) => get().submissions.find((s) => s.id === id),

  filteredSubmissions: () => {
    const state = get();
    let filtered = [...state.submissions];

    if (state.searchQuery) {
      const rx = buildRegex(state.searchQuery);
      if (rx) {
        filtered = filtered.filter(
          (s) =>
            rx.test(s.project) ||
            rx.test(s.one_liner) ||
            s.founders.some((f) => rx.test(f.name) || rx.test(f.x))
        );
      }
    }
    if (state.filters.stage.length > 0) {
      filtered = filtered.filter((s) => state.filters.stage.includes(s.stage));
    }
    if (state.filters.tags.length > 0) {
      filtered = filtered.filter((s) => state.filters.tags.some((t) => s.needs_help.includes(t)));
    }
    if (state.filters.owner) {
      filtered = filtered.filter((s) => s.owner === state.filters.owner);
    }
    if (state.filters.source) {
      filtered = filtered.filter((s) => s.source === state.filters.source);
    }
    if (state.filters.liveOnly) {
      filtered = filtered.filter((s) => (!!s.token && s.token.trim() !== '') || !!s.contract_address);
    }
    if (state.filters.reviewOnly) {
      filtered = filtered.filter((s) => !!s.needs_review);
    }
    if (state.filters.hideLowEffort) {
      filtered = filtered.filter((s) => !s.low_effort);
    }
    if (state.filters.scoreMin !== undefined) {
      filtered = filtered.filter((s) => s.score >= (state.filters.scoreMin ?? 0));
    }
    if (state.filters.scoreMax !== undefined) {
      filtered = filtered.filter((s) => s.score <= (state.filters.scoreMax ?? 100));
    }

    const { key, direction } = state.sort;
    filtered.sort((a, b) => {
      const av = (a as any)[key] ?? 0;
      const bv = (b as any)[key] ?? 0;
      if (av < bv) return direction === 'asc' ? -1 : 1;
      if (av > bv) return direction === 'asc' ? 1 : -1;
      return 0;
    });
    return filtered;
  },
}));

/** Owner display names derived from the real team list (name, falling back to email). */
export const useOwnerNames = (): string[] => {
  // Select the stable `users` reference (changes only when the list reloads),
  // then derive names via useMemo. Returning a fresh array straight from the
  // selector would loop renders under zustand's Object.is equality (React #185).
  const users = useSubmissionStore((state) => state.users);
  return useMemo(
    () => users.map((u) => (u.name && u.name.trim()) || u.email).filter(Boolean),
    [users]
  );
};

/** Reset all filters to defaults, then apply a partial — used by chart drill-downs
 *  so a click lands on the submissions list showing exactly that slice. */
export const applyDrilldownFilter = (partial: Partial<FilterState>) => {
  useSubmissionStore.getState().setSearch('');
  useSubmissionStore.getState().setFilters({
    stage: [], tags: [], owner: null, source: null,
    liveOnly: false, reviewOnly: false, hideLowEffort: false,
    scoreMin: 0, scoreMax: 100,
    ...partial,
  });
};
