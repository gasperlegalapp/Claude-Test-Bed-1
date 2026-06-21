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
  practiceArea?: string; // if set, only offered once that practice is unlocked
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

  // ---- Estate Planning ----
  {
    templateId: "trust-tussle",
    title: "Trust Issues",
    flavor:
      "A revocable trust, an irrevocable grudge, and a golden retriever named as a primary beneficiary.",
    requiredSkills: ["research", "diligence"],
    difficulty: 12,
    durationWeeks: 3,
    payoff: 13000,
    riskCost: 2200,
    reputation: 5,
    practiceArea: "estate",
  },
  {
    templateId: "the-reading",
    title: "The Reading of the Will",
    flavor:
      "Six heirs, one sealed envelope, and a clause everyone swears was added under duress.",
    requiredSkills: ["diligence"],
    difficulty: 9,
    durationWeeks: 2,
    payoff: 9000,
    riskCost: 1500,
    reputation: 4,
    practiceArea: "estate",
  },

  // ---- Personal Injury ----
  {
    templateId: "slip-and-fall",
    title: "Slip, Fall & Associates",
    flavor:
      "A grocery-store banana peel that may or may not have been there for the regulation fourteen minutes.",
    requiredSkills: ["litigation", "negotiation"],
    difficulty: 11,
    durationWeeks: 2,
    payoff: 14000,
    riskCost: 2500,
    reputation: 5,
    practiceArea: "personal-injury",
  },
  {
    templateId: "whiplash-windfall",
    title: "The Whiplash Windfall",
    flavor:
      "A three-mile-per-hour parking-lot tap that has somehow generated a foot-high stack of MRI bills.",
    requiredSkills: ["negotiation"],
    difficulty: 9,
    durationWeeks: 2,
    payoff: 11000,
    riskCost: 1800,
    reputation: 4,
    practiceArea: "personal-injury",
  },

  // ---- Real Estate ----
  {
    templateId: "zoning-zugzwang",
    title: "Zoning Zugzwang",
    flavor:
      "A taqueria, a historical-preservation board, and a variance request the size of a phone book.",
    requiredSkills: ["diligence", "negotiation"],
    difficulty: 11,
    durationWeeks: 2,
    payoff: 12000,
    riskCost: 2000,
    reputation: 4,
    practiceArea: "real-estate",
  },
  {
    templateId: "the-closing",
    title: "The Closing From Hell",
    flavor:
      "Forty-one signatures, one missing notary, and a wire transfer that's 'definitely on its way.'",
    requiredSkills: ["diligence"],
    difficulty: 8,
    durationWeeks: 1,
    payoff: 9500,
    riskCost: 1400,
    reputation: 3,
    practiceArea: "real-estate",
  },

  // ---- Corporate ----
  {
    templateId: "merger-mayhem",
    title: "Merger Mayhem",
    flavor:
      "Two mid-cap egos, one term sheet, and a due-diligence binder you could stop a door with.",
    requiredSkills: ["negotiation", "networking"],
    difficulty: 16,
    durationWeeks: 3,
    payoff: 28000,
    riskCost: 5000,
    reputation: 9,
    practiceArea: "corporate",
  },
  {
    templateId: "boardroom-brawl",
    title: "Boardroom Brawl",
    flavor:
      "A proxy fight so bitter the catering order has been entered into evidence.",
    requiredSkills: ["litigation", "negotiation"],
    difficulty: 15,
    durationWeeks: 3,
    payoff: 24000,
    riskCost: 4500,
    reputation: 8,
    practiceArea: "corporate",
  },

  // ---- Criminal Defense ----
  {
    templateId: "the-big-trial",
    title: "The Big Trial",
    flavor:
      "Front-page coverage, a sequestered jury, and a prosecutor who clearly wants your job next.",
    requiredSkills: ["litigation", "research"],
    difficulty: 15,
    durationWeeks: 3,
    payoff: 26000,
    riskCost: 5000,
    reputation: 10,
    practiceArea: "criminal",
  },
  {
    templateId: "reasonable-doubt",
    title: "Reasonable Doubt",
    flavor:
      "The whole case hinges on a gas-station receipt and the precise definition of 'allegedly.'",
    requiredSkills: ["litigation"],
    difficulty: 13,
    durationWeeks: 2,
    payoff: 18000,
    riskCost: 3500,
    reputation: 7,
    practiceArea: "criminal",
  },
];
