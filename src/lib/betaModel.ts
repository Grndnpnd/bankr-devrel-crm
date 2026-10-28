/**
 * Beta program vocabulary, shared by the server and the pages (no database imports here).
 * Labels match the option names on the team's Notion boards, so a connected board maps itself.
 */
export type Opt = readonly [value: string, label: string];
const labels = (opts: readonly Opt[]) => Object.fromEntries(opts) as Record<string, string>;
export const values = (opts: readonly Opt[]) => opts.map(([v]) => v);

// ───────── testers ─────────
export const STAGES: Opt[] = [
  ['to_contact', 'To Contact'], ['invited', 'Invited'], ['onboarding', 'Onboarding'], ['active', 'Active'],
  ['feedback_in', 'Feedback In'], ['completed', 'Completed'], ['dropped', 'Dropped'],
];
/** Stages that count as "testing" (coverage, stale check-ins). */
export const TESTING_STAGES = ['onboarding', 'active', 'feedback_in'];
export const TESTER_TYPES: Opt[] = [
  ['internal_team', 'Internal Team'], ['builder_partner', 'Builder / Partner'], ['power_trader', 'Power Trader'], ['agent_user', 'Agent User'],
  ['founder', 'Founder'], ['community_member', 'Community Member'], ['new_user', 'New User'], ['friends_family', 'Friends & Family'],
];
export const USAGE: Opt[] = [['daily', 'Daily'], ['weekly', 'Weekly'], ['low', 'Low'], ['none', 'None'], ['unknown', 'Unknown']];
export const SEND_FUNDS: Opt[] = [['yes', 'Yes'], ['no', 'No'], ['not_asked', 'Not Asked']];
export const CHANNELS: Opt[] = [['x', 'X'], ['discord', 'Discord'], ['telegram', 'Telegram'], ['phone', 'Phone'], ['email', 'Email']];

// ───────── reports ─────────
export const KINDS: Opt[] = [['bug', 'Bug'], ['feedback', 'UX Feedback'], ['idea', 'Feature Request'], ['question', 'Question'], ['praise', 'Praise']];
export const SEVERITY: Opt[] = [['critical', 'Critical'], ['high', 'High'], ['medium', 'Medium'], ['low', 'Low']];
export const SEVERITY_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
export const BUG_OPEN: Opt[] = [
  ['new', 'New'], ['triaged', 'Triaged'], ['escalated', 'Escalated'], ['fix_in_review', 'Fix in Review'], ['fix_live', 'Fix Live'], ['retest_needed', 'Retest Needed'],
];
export const BUG_CLOSED: Opt[] = [['verified', 'Verified'], ['duplicate', 'Duplicate'], ['already_known', 'Already Known'], ['wont_fix', 'Won’t Fix']];
export const NOTE_STATUSES: Opt[] = [['new', 'New'], ['noted', 'Noted'], ['passed_on', 'Passed On'], ['shipped', 'Shipped'], ['answered', 'Answered'], ['duplicate', 'Duplicate']];
export const ALL_STATUSES: Opt[] = [...BUG_OPEN, ...BUG_CLOSED, ...NOTE_STATUSES.filter(([v]) => !['new', 'duplicate'].includes(v))];
export const statusesFor = (kind: string): Opt[] => (kind === 'bug' ? [...BUG_OPEN, ...BUG_CLOSED] : NOTE_STATUSES);
export const isOpen = (kind: string, status: string) => (kind === 'bug' ? values(BUG_OPEN).includes(status) : status === 'new');
export const DEVICES: Opt[] = [['desktop_web', 'Desktop Web'], ['mobile_web', 'Mobile Web'], ['ios', 'iOS'], ['android', 'Android']];
export const ENVIRONMENTS: Opt[] = [['production', 'Production'], ['staging', 'Staging'], ['local', 'Local / Fork']];
export const effectiveSeverity = (r: { severity?: string | null; claimedSeverity?: string | null }) => r.severity ?? r.claimedSeverity ?? null;
/** Task priority (0 urgent … 3 low) for a report. */
export const priorityFor = (kind: string, severity: string | null) => (kind === 'bug' ? SEVERITY_RANK[severity ?? 'medium'] ?? 2 : kind === 'idea' || kind === 'praise' ? 3 : 2);

/** What the tester sees for each status (warmer than the team's words). */
export const TESTER_STATUS: Record<string, string> = {
  new: 'Received', triaged: 'Seen', escalated: 'Being worked on', fix_in_review: 'Fix in progress', fix_live: 'Fixed — please retest',
  retest_needed: 'Please retest', verified: 'Fixed', duplicate: 'Already reported', already_known: 'Already known', wont_fix: 'Won’t fix',
  noted: 'Noted', passed_on: 'Passed to the team', shipped: 'Shipped', answered: 'Answered',
};
/** Pill tone per status for the tester page: info | warn | ok | muted | ask */
export const TESTER_TONE: Record<string, string> = {
  new: 'info', triaged: 'info', escalated: 'warn', fix_in_review: 'warn', fix_live: 'ask', retest_needed: 'ask', verified: 'ok',
  duplicate: 'muted', already_known: 'muted', wont_fix: 'muted', noted: 'ok', passed_on: 'ok', shipped: 'ok', answered: 'ok',
};

// ───────── outreach ─────────
export const OUTREACH_TYPES: Opt[] = [
  ['need_info', 'Need Info'], ['question', 'Question'], ['bug_logged', 'Bug Logged'], ['fix_live_retest', 'Fix Live - Retest'], ['funds', 'Funds'], ['other', 'Other'],
];
export const OUTREACH_STATUSES: Opt[] = [['suggested', 'Suggested'], ['approved', 'Approved'], ['sent', 'Sent'], ['answered', 'Answered'], ['closed', 'Closed'], ['cancelled', 'Cancelled']];
export const OUTREACH_OPEN = ['suggested', 'approved', 'sent', 'answered'];
export const OUTCOMES: Opt[] = [['report_updated', 'Report updated'], ['retest_passed', 'Retest passed'], ['retest_failed', 'Retest failed'], ['not_needed', 'Not needed'], ['no_reply', 'No reply']];

// ───────── payouts ─────────
export const PAYOUT_REASONS: Opt[] = [['test_funds', 'Test funds'], ['bug_reward', 'Bug reward'], ['thank_you', 'Thank you'], ['other', 'Other']];

export const LABEL = {
  stage: labels(STAGES), type: labels(TESTER_TYPES), usage: labels(USAGE), sendFunds: labels(SEND_FUNDS), channel: labels(CHANNELS),
  kind: labels(KINDS), severity: labels(SEVERITY), status: labels([...BUG_OPEN, ...BUG_CLOSED, ...NOTE_STATUSES]), device: labels(DEVICES),
  environment: labels(ENVIRONMENTS), outreachType: labels(OUTREACH_TYPES), outreachStatus: labels(OUTREACH_STATUSES), outcome: labels(OUTCOMES),
  reason: labels(PAYOUT_REASONS),
};

/** A tx hash becomes an explorer link (Base by default); links pass through. */
export const txUrl = (tx: string | null | undefined, explorer = 'https://basescan.org/tx/') =>
  !tx ? null : /^https?:\/\//.test(tx) ? tx : /^0x[0-9a-fA-F]{64}$/.test(tx) ? explorer + tx : null;
