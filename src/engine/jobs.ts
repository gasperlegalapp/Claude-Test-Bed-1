import type { CaseInstance, District, Outcome, Staff } from "./types.ts";
import type { RngState } from "./rng.ts";
import { nextFloat, nextInt, pick } from "./rng.ts";
import { CASE_TEMPLATES, type CaseTemplate } from "../data/cases.ts";

// How strongly each point of skill advantage over difficulty shifts the odds.
const SKILL_WEIGHT = 0.07;
const MIN_CHANCE = 0.05;
const MAX_CHANCE = 0.95;

// A built office adds this much to the team's effective score on cases run in
// that district — the concrete payoff for expanding and putting down roots.
export const OFFICE_SCORE_BONUS = 3;

// Payoff/difficulty scaling by district wealth (index by wealth 1–3).
const WEALTH_PAYOFF: Record<number, number> = { 1: 0.8, 2: 1.0, 3: 1.3 };

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

// Each extra staffer's skill in a required axis counts at this diminishing
// weight (best counts fully, the next at 40%, then 16%, ...). Skilled help
// stacks, but the strongest specialist still matters most.
const SUPPORT_WEIGHT = 0.4;
// Flat bonus per *additional* body on the job, regardless of their skills —
// more hands always help a little (research, errands, moral support).
const TEAMWORK_BONUS = 0.5;

// The team's effective score for a case. For each required skill axis, the
// best assigned staffer counts fully and each additional staffer adds a
// diminishing share of their own rating. On top of that, every extra body
// adds a flat teamwork bonus — so piling on more people always raises the
// odds, and a second person who *also* has the skill raises them more.
export function teamScore(
  caseInst: Pick<CaseInstance, "requiredSkills">,
  assigned: Staff[],
): number {
  let total = 0;
  for (const axis of caseInst.requiredSkills) {
    const vals = assigned
      .map((s) => s.skills[axis] ?? 0)
      .sort((a, b) => b - a);
    let weight = 1;
    for (const v of vals) {
      total += v * weight;
      weight *= SUPPORT_WEIGHT;
    }
  }
  total += Math.max(0, assigned.length - 1) * TEAMWORK_BONUS;
  return total;
}

// Probability of a success, before the roll. `scoreBonus` covers things like
// an office in the district. Always clamped into [0.05, 0.95].
export function successChance(
  caseInst: Pick<CaseInstance, "requiredSkills" | "difficulty">,
  assigned: Staff[],
  scoreBonus = 0,
): number {
  const score = teamScore(caseInst, assigned) + scoreBonus;
  const raw = 0.5 + (score - caseInst.difficulty) * SKILL_WEIGHT;
  return clamp(raw, MIN_CHANCE, MAX_CHANCE);
}

export interface Resolution {
  outcome: Outcome;
  moneyDelta: number;
  repDelta: number;
  rng: RngState;
}

// Resolve a case against the assigned team. Outcome tiers come from the margin
// between the success chance and the roll.
export function resolveCase(
  caseInst: CaseInstance,
  assigned: Staff[],
  rng: RngState,
  scoreBonus = 0,
): Resolution {
  const chance = successChance(caseInst, assigned, scoreBonus);
  const r = nextFloat(rng);
  const margin = chance - r.value;

  let outcome: Outcome;
  let moneyDelta: number;
  let repDelta: number;

  if (margin >= 0.3) {
    outcome = "critical";
    moneyDelta = Math.round(caseInst.payoff * 1.5);
    repDelta = Math.round(caseInst.reputation * 1.5);
  } else if (margin >= 0) {
    outcome = "success";
    moneyDelta = caseInst.payoff;
    repDelta = caseInst.reputation;
  } else if (margin >= -0.15) {
    outcome = "partial";
    moneyDelta = Math.round(caseInst.payoff * 0.4);
    repDelta = 0;
  } else {
    outcome = "failure";
    moneyDelta = -caseInst.riskCost;
    repDelta = -Math.max(1, Math.round(caseInst.reputation * 0.5));
  }

  return { outcome, moneyDelta, repDelta, rng: r.rng };
}

// Templates the firm can currently be offered: always-available base work
// plus anything unlocked through a practice area.
export function availableTemplates(unlockedPractices: string[]): CaseTemplate[] {
  return CASE_TEMPLATES.filter(
    (t) => !t.practiceArea || unlockedPractices.includes(t.practiceArea),
  );
}

// Instantiate a concrete case for a district from a candidate template pool:
// bias toward the district's specialty, then scale payoff/difficulty by wealth.
export function makeCaseForDistrict(
  district: District,
  templates: CaseTemplate[],
  id: string,
  rng: RngState,
): { caseInst: CaseInstance; rng: RngState } {
  // Prefer templates that exercise the district's dominant skill.
  const matching = templates.filter((t) =>
    t.requiredSkills.includes(district.dominantSkill),
  );
  const pool = matching.length > 0 ? matching : templates;
  const picked = pick(rng, pool);
  const template: CaseTemplate = picked.value;

  // +/-15% payoff swing, +/-1 difficulty swing, then wealth scaling.
  const payRoll = nextInt(picked.rng, 85, 115);
  const diffRoll = nextInt(payRoll.rng, -1, 1);
  const wealthMult = WEALTH_PAYOFF[district.wealth] ?? 1;
  const payoff =
    Math.round((template.payoff * payRoll.value * wealthMult) / 100 / 100) * 100;
  const difficulty = Math.max(
    1,
    template.difficulty + diffRoll.value + (district.wealth - 2),
  );

  return {
    caseInst: {
      id,
      templateId: template.templateId,
      title: template.title,
      flavor: template.flavor,
      requiredSkills: [...template.requiredSkills],
      difficulty,
      durationWeeks: template.durationWeeks,
      payoff,
      riskCost: template.riskCost,
      reputation: template.reputation,
      districtId: district.id,
      districtName: district.name,
    },
    rng: diffRoll.rng,
  };
}

// Pick a random discovered district to host a new case, then instantiate one
// from the currently-available templates.
export function rollNewCase(
  districts: District[],
  unlockedPractices: string[],
  id: string,
  rng: RngState,
): { caseInst: CaseInstance; rng: RngState } {
  const hosts = districts.filter((d) => d.discovered);
  const chosen = pick(rng, hosts);
  const templates = availableTemplates(unlockedPractices);
  return makeCaseForDistrict(chosen.value, templates, id, chosen.rng);
}
