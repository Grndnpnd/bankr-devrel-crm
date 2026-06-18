// Maps between Prisma enums (UPPER_SNAKE) and the UI's display strings.

export const STAGE_TO_LABEL: Record<string, string> = {
  NEW: "New",
  REVIEWING: "Reviewing",
  CONTACTED: "Contacted",
  IN_CONVO: "In Convo",
  ONBOARDING: "Onboarding",
  WON: "Won",
  PASSED: "Passed",
};

export const LABEL_TO_STAGE: Record<string, string> = Object.fromEntries(
  Object.entries(STAGE_TO_LABEL).map(([k, v]) => [v, k])
);

export const SOURCE_TO_LABEL: Record<string, "google_form" | "plain" | "manual" | "agent" | "slack" | "telegram"> = {
  GOOGLE_FORM: "google_form",
  PLAIN: "plain",
  MANUAL: "manual",
  AGENT: "agent",
  SLACK: "slack",
  TELEGRAM: "telegram",
};

/** Human-friendly display name for a serialized (lowercased) source value. */
export function sourceDisplayName(source: string): string {
  switch (source) {
    case 'google_form': return 'Google Form';
    case 'plain': return 'Plain';
    case 'manual': return 'Manual';
    case 'agent': return 'Agent';
    case 'slack': return 'Slack';
    case 'telegram': return 'Telegram';
    default: return 'Unknown';
  }
}

export const ACTIVITY_KINDS = ["note", "dm", "email", "call", "meeting", "stage_change", "system"] as const;
