// The general lawyering skill axes staff are rated on. Distinct from areas of
// law (which gate *what* a staffer can work); skills drive *how well*.

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
