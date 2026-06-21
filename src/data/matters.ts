import type { SkillAxis } from "./skills.ts";

// Matter templates, grouped by area of law. Two kinds:
//  - "litigation": worked over weeks/months, then won or lost on the merits.
//  - "transactional": client signs, you do the work, you get paid. No losing.
// The engine instantiates these with concrete day-counts and fees.

export type MatterCategory = "litigation" | "transactional";

export interface MatterTemplate {
  id: string;
  area: string;
  category: MatterCategory;
  title: string;
  flavor: string;
  requiredSkills: SkillAxis[];
  difficulty: number; // litigation: vs team score; transactional: complexity
  minDays: number;
  maxDays: number;
  payoffMin: number;
  payoffMax: number;
  riskCost: number; // money lost on a litigation loss (0 for transactional)
  reputation: number; // rep on a win / clean transactional close
}

export const MATTER_TEMPLATES: MatterTemplate[] = [
  // ---- Criminal ----
  { id: "dui", area: "criminal", category: "litigation", title: "DUI Defense", flavor: "A blown taillight, a failed field sobriety test, and a client who 'only had two.'", requiredSkills: ["litigation", "negotiation"], difficulty: 9, minDays: 30, maxDays: 60, payoffMin: 6000, payoffMax: 10000, riskCost: 1500, reputation: 3 },
  { id: "assault", area: "criminal", category: "litigation", title: "Assault Charge", flavor: "A bar fight with seven eyewitnesses and seven different stories.", requiredSkills: ["litigation", "research"], difficulty: 12, minDays: 60, maxDays: 120, payoffMin: 12000, payoffMax: 20000, riskCost: 3000, reputation: 5 },
  { id: "felony-trial", area: "criminal", category: "litigation", title: "Felony Trial", flavor: "Front-page coverage and a prosecutor with something to prove.", requiredSkills: ["litigation", "research"], difficulty: 16, minDays: 120, maxDays: 210, payoffMin: 26000, payoffMax: 40000, riskCost: 6000, reputation: 10 },

  // ---- Family ----
  { id: "contested-divorce", area: "family", category: "litigation", title: "Contested Divorce", flavor: "Two spouses, one lake house, and a stubborn disagreement about a dog.", requiredSkills: ["negotiation", "litigation"], difficulty: 11, minDays: 60, maxDays: 150, payoffMin: 10000, payoffMax: 18000, riskCost: 2500, reputation: 5 },
  { id: "custody", area: "family", category: "litigation", title: "Custody Battle", flavor: "A calendar dispute that has metastasized into a courtroom war.", requiredSkills: ["litigation", "diligence"], difficulty: 13, minDays: 90, maxDays: 180, payoffMin: 14000, payoffMax: 22000, riskCost: 3000, reputation: 6 },
  { id: "prenup", area: "family", category: "transactional", title: "Prenuptial Agreement", flavor: "Romance, but make it enforceable in all fifty states.", requiredSkills: ["negotiation", "diligence"], difficulty: 7, minDays: 14, maxDays: 30, payoffMin: 4000, payoffMax: 7000, riskCost: 0, reputation: 2 },

  // ---- Civil Litigation ----
  { id: "breach", area: "civil", category: "litigation", title: "Breach of Contract Suit", flavor: "A handshake deal, a missing signature, and $80k on the line.", requiredSkills: ["litigation", "research"], difficulty: 12, minDays: 75, maxDays: 165, payoffMin: 14000, payoffMax: 24000, riskCost: 3500, reputation: 5 },
  { id: "pi-claim", area: "civil", category: "litigation", title: "Personal Injury Claim", flavor: "A grocery-store banana peel and a very photogenic limp.", requiredSkills: ["negotiation", "litigation"], difficulty: 10, minDays: 60, maxDays: 150, payoffMin: 12000, payoffMax: 22000, riskCost: 2500, reputation: 4 },

  // ---- Probate & Estate ----
  { id: "will", area: "probate", category: "transactional", title: "Will Drafting", flavor: "Last wishes, two witnesses, and one suspiciously favored nephew.", requiredSkills: ["diligence", "research"], difficulty: 6, minDays: 7, maxDays: 21, payoffMin: 2500, payoffMax: 4500, riskCost: 0, reputation: 2 },
  { id: "estate-plan", area: "probate", category: "transactional", title: "Estate Plan", flavor: "Trusts, powers of attorney, and a client who keeps adding pets.", requiredSkills: ["diligence", "negotiation"], difficulty: 8, minDays: 21, maxDays: 45, payoffMin: 6000, payoffMax: 10000, riskCost: 0, reputation: 3 },
  { id: "probate-admin", area: "probate", category: "transactional", title: "Probate Administration", flavor: "Seven heirs, one antique spoon collection, zero goodwill.", requiredSkills: ["diligence", "research"], difficulty: 9, minDays: 45, maxDays: 120, payoffMin: 8000, payoffMax: 14000, riskCost: 0, reputation: 3 },

  // ---- Malpractice ----
  { id: "med-mal", area: "malpractice", category: "litigation", title: "Medical Malpractice Suit", flavor: "Expert witnesses, a foot-high stack of records, and a very long road.", requiredSkills: ["research", "litigation"], difficulty: 15, minDays: 120, maxDays: 240, payoffMin: 28000, payoffMax: 48000, riskCost: 7000, reputation: 9 },
  { id: "legal-mal", area: "malpractice", category: "litigation", title: "Legal Malpractice", flavor: "Suing another lawyer. Awkward at the bar association mixer.", requiredSkills: ["research", "diligence"], difficulty: 14, minDays: 90, maxDays: 180, payoffMin: 20000, payoffMax: 34000, riskCost: 5000, reputation: 7 },

  // ---- Employment ----
  { id: "wrongful-term", area: "employment", category: "litigation", title: "Wrongful Termination", flavor: "An HR file that reads like a confession and a CEO who 'did nothing wrong.'", requiredSkills: ["litigation", "negotiation"], difficulty: 12, minDays: 60, maxDays: 150, payoffMin: 14000, payoffMax: 24000, riskCost: 3000, reputation: 5 },
  { id: "handbook", area: "employment", category: "transactional", title: "Employee Handbook", flavor: "Forty pages of policy nobody will read until they sue.", requiredSkills: ["diligence", "research"], difficulty: 7, minDays: 14, maxDays: 30, payoffMin: 4000, payoffMax: 7000, riskCost: 0, reputation: 2 },
  { id: "severance", area: "employment", category: "transactional", title: "Severance Agreement", flavor: "A quiet exit, generously papered over.", requiredSkills: ["negotiation", "diligence"], difficulty: 7, minDays: 7, maxDays: 21, payoffMin: 3500, payoffMax: 6000, riskCost: 0, reputation: 2 },

  // ---- Bankruptcy ----
  { id: "ch7", area: "bankruptcy", category: "transactional", title: "Chapter 7 Filing", flavor: "A fresh start, a means test, and a mountain of schedules.", requiredSkills: ["diligence", "research"], difficulty: 8, minDays: 30, maxDays: 90, payoffMin: 4500, payoffMax: 8000, riskCost: 0, reputation: 2 },
  { id: "ch13", area: "bankruptcy", category: "transactional", title: "Chapter 13 Plan", flavor: "A three-to-five-year repayment plan and a very patient trustee.", requiredSkills: ["diligence", "negotiation"], difficulty: 10, minDays: 60, maxDays: 150, payoffMin: 7000, payoffMax: 12000, riskCost: 0, reputation: 3 },

  // ---- Business ----
  { id: "llc", area: "business", category: "transactional", title: "LLC Formation", flavor: "An operating agreement for three friends who haven't argued yet.", requiredSkills: ["diligence", "negotiation"], difficulty: 6, minDays: 7, maxDays: 21, payoffMin: 3000, payoffMax: 5500, riskCost: 0, reputation: 2 },
  { id: "lease-review", area: "business", category: "transactional", title: "Commercial Lease Review", flavor: "A flooded basement clause buried on page nine.", requiredSkills: ["research", "diligence"], difficulty: 8, minDays: 14, maxDays: 30, payoffMin: 4500, payoffMax: 8000, riskCost: 0, reputation: 2 },
  { id: "merger", area: "business", category: "transactional", title: "Small Acquisition", flavor: "Two mid-cap egos and a due-diligence binder you could stop a door with.", requiredSkills: ["negotiation", "networking"], difficulty: 13, minDays: 60, maxDays: 150, payoffMin: 22000, payoffMax: 38000, riskCost: 0, reputation: 7 },
  { id: "partnership-dispute", area: "business", category: "litigation", title: "Partnership Dispute", flavor: "A friendship, a business, and which one survives the lawsuit.", requiredSkills: ["litigation", "negotiation"], difficulty: 13, minDays: 90, maxDays: 180, payoffMin: 18000, payoffMax: 30000, riskCost: 4000, reputation: 6 },
];

export function templatesForAreas(areaIds: string[]): MatterTemplate[] {
  return MATTER_TEMPLATES.filter((t) => areaIds.includes(t.area));
}
