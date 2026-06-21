// The skill axes staff are rated on and cases are judged against.
// Content-only: adding or renaming an axis here should never require
// touching engine logic (the engine iterates these generically).

export const SKILL_AXES = [
  "litigation",
  "research",
  "negotiation",
  "diligence",
  "networking",
] as const;

export type SkillAxis = (typeof SKILL_AXES)[number];

export const SKILL_LABELS: Record<SkillAxis, string> = {
  litigation: "Litigation",
  research: "Research",
  negotiation: "Negotiation",
  diligence: "Diligence",
  networking: "Networking",
};
