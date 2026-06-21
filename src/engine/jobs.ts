import type { CaseInstance, Outcome, Staff } from "./types.ts";
import type { RngState } from "./rng.ts";
import { nextFloat, nextInt, pick } from "./rng.ts";
import { CASE_TEMPLATES, type CaseTemplate } from "../data/cases.ts";

// How strongly each point of skill advantage over difficulty shifts the odds.
const SKILL_WEIGHT = 0.07;
const MIN_CHANCE = 0.05;
const MAX_CHANCE = 0.95;

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

// The team's effective score for a case: for each required skill axis, take
// the best assigned staffer's rating in that axis, then sum across axes.
// This rewards skill-matched assignments and lets a strong specialist carry
// an axis without needing every staffer to be good at everything.
export function teamScore(
  caseInst: Pick<CaseInstance, "requiredSkills">,
  assigned: Staff[],
): number {
  let total = 0;
  for (const axis of caseInst.requiredSkills) {
    let best = 0;
    for (const s of assigned) {
      const v = s.skills[axis] ?? 0;
      if (v > best) best = v;
    }
    total += best;
  }
  return total;
}

// Probability of a (full) success, before the roll. Always in [0.05, 0.95]
// so nothing is ever a sure thing or hopeless.
export function successChance(
  caseInst: Pick<CaseInstance, "requiredSkills" | "difficulty">,
  assigned: Staff[],
): number {
  const score = teamScore(caseInst, assigned);
  const raw = 0.5 + (score - caseInst.difficulty) * SKILL_WEIGHT;
  return clamp(raw, MIN_CHANCE, MAX_CHANCE);
}

export interface Resolution {
  outcome: Outcome;
  moneyDelta: number;
  rng: RngState;
}

// Resolve a case against the assigned team. Outcome tiers come from the margin
// between the success chance and the roll, so a big skill edge isn't just more
// likely to win — it's more likely to win *big*.
export function resolveCase(
  caseInst: CaseInstance,
  assigned: Staff[],
  rng: RngState,
): Resolution {
  const chance = successChance(caseInst, assigned);
  const r = nextFloat(rng);
  const margin = chance - r.value; // positive = success, by how much

  let outcome: Outcome;
  let moneyDelta: number;

  if (margin >= 0.3) {
    outcome = "critical";
    moneyDelta = Math.round(caseInst.payoff * 1.5);
  } else if (margin >= 0) {
    outcome = "success";
    moneyDelta = caseInst.payoff;
  } else if (margin >= -0.15) {
    outcome = "partial";
    moneyDelta = Math.round(caseInst.payoff * 0.4);
  } else {
    outcome = "failure";
    moneyDelta = -caseInst.riskCost;
  }

  return { outcome, moneyDelta, rng: r.rng };
}

// Instantiate a concrete, offered case from a template, with a unique id and
// mild randomized variation so repeat offers don't feel identical.
export function makeCaseFromTemplate(
  template: CaseTemplate,
  id: string,
  rng: RngState,
): { caseInst: CaseInstance; rng: RngState } {
  // +/-15% payoff swing, +/-1 difficulty swing.
  const payRoll = nextInt(rng, 85, 115);
  const diffRoll = nextInt(payRoll.rng, -1, 1);
  const payoff = Math.round((template.payoff * payRoll.value) / 100 / 100) * 100;
  const difficulty = Math.max(1, template.difficulty + diffRoll.value);

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
    },
    rng: diffRoll.rng,
  };
}

// Draw a random case template and instantiate it.
export function rollNewCase(
  id: string,
  rng: RngState,
): { caseInst: CaseInstance; rng: RngState } {
  const picked = pick(rng, CASE_TEMPLATES);
  return makeCaseFromTemplate(picked.value, id, picked.rng);
}
