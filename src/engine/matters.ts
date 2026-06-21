import type { GameState, Matter, Outcome, Staff } from "./types.ts";
import type { RngState } from "./rng.ts";
import { nextFloat, nextInt, pick } from "./rng.ts";
import { spareCapacity } from "./office.ts";
import { ROLE_DEFS } from "../data/staff.ts";
import {
  MATTER_TEMPLATES,
  templatesForAreas,
  type MatterTemplate,
} from "../data/matters.ts";

const SKILL_WEIGHT = 0.07;
const SUPPORT_WEIGHT = 0.4;
const TEAMWORK_BONUS = 0.5;
const MIN_CHANCE = 0.05;
const MAX_CHANCE = 0.95;

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

// Team effectiveness: best assigned staffer per required skill counts fully,
// extra staff add a diminishing share, plus a flat per-head teamwork bonus.
export function teamScore(requiredSkills: string[], assigned: Staff[]): number {
  let total = 0;
  for (const axis of requiredSkills) {
    const vals = assigned
      .map((s) => (s.skills as Record<string, number>)[axis] ?? 0)
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

export function successChance(
  matter: Pick<Matter, "requiredSkills" | "difficulty">,
  assigned: Staff[],
  scoreBonus = 0,
): number {
  const score = teamScore(matter.requiredSkills, assigned) + scoreBonus;
  return clamp(0.5 + (score - matter.difficulty) * SKILL_WEIGHT, MIN_CHANCE, MAX_CHANCE);
}

export interface Resolution {
  outcome: Outcome;
  moneyDelta: number;
  repDelta: number;
  rng: RngState;
}

// Litigation resolves on the merits: win big, settle, or lose.
export function resolveLitigation(
  matter: Matter,
  assigned: Staff[],
  rng: RngState,
  scoreBonus = 0,
): Resolution {
  const chance = successChance(matter, assigned, scoreBonus);
  const r = nextFloat(rng);
  const margin = chance - r.value;
  let outcome: Outcome;
  let moneyDelta: number;
  let repDelta: number;
  if (margin >= 0.3) {
    outcome = "critical";
    moneyDelta = Math.round(matter.payoff * 1.25);
    repDelta = Math.round(matter.reputation * 1.5);
  } else if (margin >= 0) {
    outcome = "success";
    moneyDelta = matter.payoff;
    repDelta = matter.reputation;
  } else if (margin >= -0.15) {
    outcome = "partial";
    moneyDelta = Math.round(matter.payoff * 0.45); // a settlement
    repDelta = 0;
  } else {
    outcome = "failure";
    moneyDelta = -matter.riskCost;
    repDelta = -Math.max(1, Math.round(matter.reputation * 0.5));
  }
  return { outcome, moneyDelta, repDelta, rng: r.rng };
}

// Transactional work: the client signed, so completing it pays out. No loss.
export function resolveTransactional(matter: Matter): {
  outcome: Outcome;
  moneyDelta: number;
  repDelta: number;
} {
  return { outcome: "success", moneyDelta: matter.payoff, repDelta: matter.reputation };
}

// Instantiate an offered matter from a template (random days/fee/expiry).
export function makeMatter(
  template: MatterTemplate,
  id: string,
  rng: RngState,
): { matter: Matter; rng: RngState } {
  const d = nextInt(rng, template.minDays, template.maxDays);
  const pay = nextInt(d.rng, template.payoffMin, template.payoffMax);
  const exp = nextInt(pay.rng, 2, 4);
  const payoff = Math.round(pay.value / 100) * 100;
  return {
    matter: {
      id,
      templateId: template.id,
      area: template.area,
      category: template.category,
      title: template.title,
      flavor: template.flavor,
      requiredSkills: [...template.requiredSkills],
      difficulty: template.difficulty,
      totalDays: d.value,
      daysRemaining: d.value,
      payoff,
      riskCost: template.riskCost,
      reputation: template.reputation,
      staffIds: [],
      status: "offered",
      expiresInWeeks: exp.value,
    },
    rng: exp.rng,
  };
}

// The areas the firm can take work in: its focus, plus any area an attorney
// on staff practices (hiring into a new area opens it up).
export function practicedAreas(state: GameState): string[] {
  const set = new Set(state.focusAreas);
  for (const s of state.staff) {
    if (ROLE_DEFS[s.role].attorney) for (const a of s.practiceAreas) set.add(a);
  }
  return [...set];
}

// Generate a fresh lead in one of the firm's practiced areas (or null if none).
export function rollLead(
  state: GameState,
  id: string,
  rng: RngState,
): { matter: Matter; rng: RngState } | null {
  const areas = practicedAreas(state);
  const templates = templatesForAreas(areas);
  if (templates.length === 0) return null;
  const picked = pick(rng, templates);
  return makeMatter(picked.value, id, picked.rng);
}

// Can these staff take on this matter? Everyone must be able to do casework and
// have spare capacity, and at least one must be an attorney who practices the
// matter's area.
export function canStaffMatter(
  state: GameState,
  matter: Matter,
  staffIds: string[],
): boolean {
  if (staffIds.length === 0) return false;
  const chosen = staffIds.map((id) => state.staff.find((s) => s.id === id));
  if (chosen.some((s) => !s)) return false;
  const staff = chosen as Staff[];
  if (staff.some((s) => !ROLE_DEFS[s.role].casework)) return false;
  if (staff.some((s) => spareCapacity(state, s.id) <= 0)) return false;
  const hasAttorney = staff.some(
    (s) => ROLE_DEFS[s.role].attorney && s.practiceAreas.includes(matter.area),
  );
  return hasAttorney;
}

export { MATTER_TEMPLATES };
