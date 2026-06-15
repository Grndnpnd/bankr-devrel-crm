import { create } from 'zustand';
import type { Submission, FilterState, SortConfig, Activity } from '@/types';

interface TeamUser { email: string; name: string | null; role: string }
interface Me { email: string; name: string | null; role: string }

interface SubmissionStore {
  submissions: Submission[];
  users: TeamUser[];
  me: Me | null;
  loaded: boolean;
  loading: boolean;
  searchQuery: string;
  filters: FilterState;
  sort: SortConfig;

  setMe: (me: Me | null) => void;
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
  findToken: (id: string) => Promise<{ ok: boolean; error?: string; via?: string }>;
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
  loaded: false,
  loading: false,
  searchQuery: '',
  filters: {
    stage: [],
    tags: [],
    owner: null,
    source: null,
    liveOnly: false,
    hideLowEffort: false,
    scoreMin: 0,
    scoreMax: 100,
  },
  sort: { key: 'score', direction: 'desc' as const },

  setMe: (me) => set({ me }),

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

  findToken: async (id) => {
    const res = await fetch(`/api/submissions/${id}/enrich`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ auto: true }),
    });
    const data = await res.json().catch(() => ({}));
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
