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
 * The access matrix. SUPPORT and ENGINEERING currently mirror DEVREL — they share
 * the same operational access. Peel them apart later by flipping cells here.
 */
const MATRIX: Record<Capability, Role[]> = {
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
  const allowed = MATRIX[capability];
  return !!allowed && (allowed as string[]).includes(role);
}

/** All capabilities a role has — handy for sending to the client. */
export function capabilitiesFor(role: string | null | undefined): Capability[] {
  if (!role) return [];
  return (Object.keys(MATRIX) as Capability[]).filter((c) => can(role, c));
}

export const isValidRole = (r: string): r is Role => (ROLES as string[]).includes(r);
