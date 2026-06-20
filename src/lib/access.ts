/**
 * Role → capability map. The single source of truth for access control.
 *
 * To change what a role can do: edit the matrix below — nothing else.
 * To add a role: add it to Role + give it a column here.
 * Checks everywhere call `can(role, 'capability')` instead of comparing role strings,
 * so expanding/contracting a role is a one-line change here, not a code hunt.
 */

export type Role = 'ADMIN' | 'DEVREL' | 'SUPPORT' | 'ENGINEERING';

export const ROLES: Role[] = ['ADMIN', 'DEVREL', 'SUPPORT', 'ENGINEERING'];

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Admin',
  DEVREL: 'DevRel',
  SUPPORT: 'Support',
  ENGINEERING: 'Engineering',
};

/** Every gated action in the app. Group by area for readability. */
export type Capability =
  // Pillar visibility (which sections a role can see at all)
  | 'devrel.view'           // see the DevRel pipeline pillar (dashboard, submissions, etc.)
  | 'support.view'          // see the Support pillar (support dashboard, threads)
  | 'support.manage'        // act on support threads (assign, status, notes) — for later
  // Submissions / pipeline
  | 'submissions.view'
  | 'submissions.edit'      // create/edit/delete submissions, add activity
  | 'submissions.enrich'    // run token enrichment / find contract
  // Analytics & dashboard
  | 'analytics.use'         // use the agent / build panels
  | 'panels.create'
  // Automation
  | 'cron.manage'           // create/edit/run/delete scheduled jobs
  // Administration
  | 'users.manage'          // invite users, change roles, deactivate
  | 'settings.scoring'      // edit scoring weights
  | 'settings.sources'      // manage import sources, run imports
  | 'import.run';

/**
 * The access matrix. Pillar visibility is the new separation: DEVREL sees the DevRel
 * pillar, SUPPORT sees the Support pillar, ADMIN + ENGINEERING see both (adjust in the
 * Admin → Permissions UI as the team shakes out). The operational caps below still
 * mostly mirror across roles; tighten per-cell later as needed.
 */
const MATRIX: Record<Capability, Role[]> = {
  // Pillar visibility
  'devrel.view':       ['ADMIN', 'DEVREL', 'ENGINEERING'],
  'support.view':      ['ADMIN', 'SUPPORT', 'ENGINEERING'],
  'support.manage':    ['ADMIN', 'SUPPORT'],
  // Submissions / pipeline (DevRel operational)
  'submissions.view':  ['ADMIN', 'DEVREL', 'SUPPORT', 'ENGINEERING'],
  'submissions.edit':  ['ADMIN', 'DEVREL', 'SUPPORT', 'ENGINEERING'],
  'submissions.enrich':['ADMIN', 'DEVREL', 'SUPPORT', 'ENGINEERING'],
  'analytics.use':     ['ADMIN', 'DEVREL', 'SUPPORT', 'ENGINEERING'],
  'panels.create':     ['ADMIN', 'DEVREL', 'SUPPORT', 'ENGINEERING'],
  'cron.manage':       ['ADMIN', 'DEVREL', 'SUPPORT', 'ENGINEERING'],
  'users.manage':      ['ADMIN'],
  'settings.scoring':  ['ADMIN'],
  'settings.sources':  ['ADMIN'],
  'import.run':        ['ADMIN', 'DEVREL', 'SUPPORT', 'ENGINEERING'],
};

/** Does this role have this capability? Unknown role → false (fail closed). */
export function can(role: string | null | undefined, capability: Capability): boolean {
  if (!role) return false;
  // ADMIN is hard-locked to every capability and can never be edited away — this
  // prevents an admin from accidentally revoking users.manage and locking everyone
  // out of the Admin page with no way to grant it back.
  if (role === 'ADMIN') return true;
  const allowed = effectiveMatrix()[capability];
  return !!allowed && (allowed as string[]).includes(role);
}

// ─── Per-user overrides ───────────────────────────────────────────────────────
// Layered ON TOP of the role result: a user can be GRANTED a capability their role
// lacks, or REVOKED one their role has. Stored per-user and cached in-memory so the
// check stays synchronous. ADMIN is still always all-true (can't be revoked).
export interface UserOverride { grant?: Capability[]; revoke?: Capability[] }
let USER_OVERRIDES: Record<string, UserOverride> = {};

export function setUserCapabilityOverrides(overrides: Record<string, UserOverride> | null): void {
  USER_OVERRIDES = overrides && typeof overrides === 'object' ? overrides : {};
}
export function getUserCapabilityOverrides(): Record<string, UserOverride> {
  return USER_OVERRIDES;
}

/**
 * Capability check that respects per-user grants/revokes layered over the role default.
 * Use this wherever a userId is available; can(role, cap) remains for role-only checks.
 */
export function canUser(role: string | null | undefined, userId: string | null | undefined, capability: Capability): boolean {
  if (role === 'ADMIN') return true;  // admin is absolute, never revocable
  const base = can(role, capability);
  if (!userId) return base;
  const ov = USER_OVERRIDES[userId];
  if (!ov) return base;
  if (ov.revoke?.includes(capability)) return false;  // revoke wins over everything (except ADMIN)
  if (ov.grant?.includes(capability)) return true;
  return base;
}

/** All capabilities a specific user effectively has (role + their overrides). */
export function capabilitiesForUser(role: string | null | undefined, userId: string | null | undefined): Capability[] {
  return (Object.keys(MATRIX) as Capability[]).filter((c) => canUser(role, userId, c));
}

/** All capabilities a role has — handy for sending to the client. */
export function capabilitiesFor(role: string | null | undefined): Capability[] {
  if (!role) return [];
  return (Object.keys(MATRIX) as Capability[]).filter((c) => can(role, c));
}

// ─── Runtime overrides ────────────────────────────────────────────────────────
// The MATRIX above is the DEFAULT. An admin can override it from the Admin page;
// overrides are stored in the DB and loaded into this in-memory cache so can()
// stays synchronous (it's called from ~30 places, server + client). A null/empty
// override means "use the default". ADMIN is always all-true regardless (see can()).

let OVERRIDES: Partial<Record<Capability, Role[]>> | null = null;

/** Replace the active overrides (call after loading from DB or receiving on the client). */
export function setCapabilityOverrides(overrides: Partial<Record<Capability, Role[]>> | null): void {
  OVERRIDES = overrides && typeof overrides === 'object' ? overrides : null;
}

/** The matrix actually in effect: defaults with any admin overrides applied per-capability. */
export function effectiveMatrix(): Record<Capability, Role[]> {
  if (!OVERRIDES) return MATRIX;
  const merged = {} as Record<Capability, Role[]>;
  for (const cap of Object.keys(MATRIX) as Capability[]) {
    const ov = OVERRIDES[cap];
    let roles = Array.isArray(ov) ? ov.filter((r): r is Role => (ROLES as string[]).includes(r)) : MATRIX[cap];
    // ADMIN always present in every cell (hard-lock, mirrors can()).
    if (!roles.includes('ADMIN')) roles = ['ADMIN', ...roles];
    merged[cap] = roles;
  }
  return merged;
}

/** The default matrix (for the Admin UI's "reset to defaults"). */
export function defaultMatrix(): Record<Capability, Role[]> {
  return MATRIX;
}

export const isValidRole = (r: string): r is Role => (ROLES as string[]).includes(r);

/** Human-readable labels + grouping for the Admin permissions editor. */
export const CAPABILITY_META: { key: Capability; label: string; group: string; note?: string }[] = [
  { key: 'devrel.view',        label: 'View DevRel pillar',      group: 'Pillars', note: 'the project pipeline, dashboard, submissions' },
  { key: 'support.view',       label: 'View Support pillar',     group: 'Pillars', note: 'support dashboard & threads' },
  { key: 'support.manage',     label: 'Manage support threads',  group: 'Pillars', note: 'assign / status / notes' },
  { key: 'submissions.view',   label: 'View submissions',        group: 'Pipeline' },
  { key: 'submissions.edit',   label: 'Edit / create / delete',  group: 'Pipeline', note: 'includes bulk delete & adding notes' },
  { key: 'submissions.enrich', label: 'Enrich (set contract / fetch token)', group: 'Pipeline' },
  { key: 'analytics.use',      label: 'Use analytics & agent',   group: 'Analytics' },
  { key: 'panels.create',      label: 'Create dashboard panels', group: 'Analytics' },
  { key: 'cron.manage',        label: 'Manage scheduled jobs',   group: 'Automation' },
  { key: 'import.run',         label: 'Run imports',             group: 'Data' },
  { key: 'users.manage',       label: 'Manage users & roles',    group: 'Administration' },
  { key: 'settings.scoring',   label: 'Edit scoring weights',    group: 'Administration' },
  { key: 'settings.sources',   label: 'Manage import sources',   group: 'Administration' },
];
