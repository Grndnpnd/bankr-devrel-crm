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

export const SOURCE_TO_LABEL: Record<string, "google_form" | "plain"> = {
  GOOGLE_FORM: "google_form",
  PLAIN: "plain",
};

export const ACTIVITY_KINDS = ["note", "dm", "email", "call", "meeting", "stage_change", "system"] as const;
