import type { SkillAxis } from "./skills.ts";

// Case templates — the bread and butter of the firm. The engine instantiates
// these into concrete cases (with unique ids and slight variation) and offers
// them to the player. Pure content: never reference engine code here.

export interface CaseTemplate {
  templateId: string;
  title: string;
  flavor: string;
  requiredSkills: SkillAxis[]; // axes that determine success
  difficulty: number; // target the team's combined relevant skill must beat
  durationWeeks: number;
  payoff: number; // money on a clean success
  riskCost: number; // money lost on outright failure (court costs, refunds)
  reputation: number; // reputation gained on a clean success
}

export const CASE_TEMPLATES: CaseTemplate[] = [
  {
    templateId: "noisy-neighbor",
    title: "The Noisy Neighbor",
    flavor:
      "A man is suing the duplex next door over a wind chime he calls 'psychological warfare.'",
    requiredSkills: ["negotiation"],
    difficulty: 5,
    durationWeeks: 1,
    payoff: 4000,
    riskCost: 500,
    reputation: 2,
  },
  {
    templateId: "fender-bender",
    title: "Fender-Bender Fiasco",
    flavor:
      "Two drivers, three insurance companies, and one disputed parking lot. Nobody is at fault, allegedly.",
    requiredSkills: ["litigation", "diligence"],
    difficulty: 9,
    durationWeeks: 2,
    payoff: 9000,
    riskCost: 1500,
    reputation: 3,
  },
  {
    templateId: "will-they-wont-they",
    title: "Will They, Won't They",
    flavor:
      "An estate with seven heirs, one antique spoon collection, and zero goodwill at Thanksgiving.",
    requiredSkills: ["research", "diligence"],
    difficulty: 11,
    durationWeeks: 2,
    payoff: 12000,
    riskCost: 2000,
    reputation: 4,
  },
  {
    templateId: "handshake-deal",
    title: "The Handshake Deal",
    flavor:
      "A startup founder did a six-figure deal on a napkin. The napkin is now Exhibit A.",
    requiredSkills: ["negotiation", "networking"],
    difficulty: 12,
    durationWeeks: 3,
    payoff: 16000,
    riskCost: 3000,
    reputation: 6,
  },
  {
    templateId: "small-claims-saga",
    title: "Small Claims, Big Feelings",
    flavor:
      "A $400 dispute over a used lawnmower has escalated into a personal vendetta. Billable hours, however, are real.",
    requiredSkills: ["litigation"],
    difficulty: 7,
    durationWeeks: 1,
    payoff: 5500,
    riskCost: 800,
    reputation: 2,
  },
  {
    templateId: "boilerplate-blowup",
    title: "Boilerplate Blowup",
    flavor:
      "Someone copy-pasted a contract from the internet. The 'internet' was a 2003 GeoCities page.",
    requiredSkills: ["research", "negotiation"],
    difficulty: 10,
    durationWeeks: 2,
    payoff: 10500,
    riskCost: 1800,
    reputation: 4,
  },
  {
    templateId: "rainmaker-gala",
    title: "The Rainmaker's Gala",
    flavor:
      "A $300-a-plate charity dinner that is, legally speaking, entirely about getting three general counsels to like you.",
    requiredSkills: ["networking"],
    difficulty: 6,
    durationWeeks: 1,
    payoff: 6000,
    riskCost: 700,
    reputation: 3,
  },
  {
    templateId: "paper-trail",
    title: "The Paper Trail",
    flavor:
      "Forty bankers' boxes of documents and one paralegal with a deeply personal vendetta against poor indexing.",
    requiredSkills: ["research"],
    difficulty: 8,
    durationWeeks: 2,
    payoff: 8000,
    riskCost: 1200,
    reputation: 3,
  },
  {
    templateId: "lease-of-problems",
    title: "Lease of Our Problems",
    flavor:
      "A commercial tenant, a flooded basement, and a lease drafted by the landlord's nephew over a long weekend.",
    requiredSkills: ["diligence", "litigation"],
    difficulty: 10,
    durationWeeks: 2,
    payoff: 9500,
    riskCost: 1600,
    reputation: 3,
  },
];
