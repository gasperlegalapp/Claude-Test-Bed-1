import { createRng } from "./rng.ts";
import type { GameState } from "./types.ts";
import { generateCandidate } from "./people.ts";

const STARTING_MONEY = 35000;
const STARTING_REPUTATION = 10;

// ---- Balance constants ----
export const REP_VALUE = 1500; // valuation per reputation point
export const DEBT_WEEKS_TO_BANKRUPTCY = 4;
export const CANDIDATE_POOL = 4; // hireable candidates on offer
export const MAX_OFFERED = 6; // leads waiting to be taken
export const LEAD_CHANCE = 0.55; // weekly chance an intake attempt lands work
export const WEEK_DAYS = 7;

// ---- Finances ----
// Costs are deliberately light: a young firm should be able to find its feet.
export const OFFICE_RENT = 1200; // weekly rent for the office
export const WEEKLY_INSURANCE = 300; // weekly malpractice / liability insurance
export const WEEKLY_INTEREST = 0.03; // interest charged weekly on outstanding debt
export const LOAN_CHUNK = 10000; // borrow / repay in this increment
export const CREDIT_BASE = 25000; // base borrowing limit
export const CREDIT_PER_REP = 1500; // extra borrowing limit per reputation point

// ---- Billing ----
export const RETAINER_PCT = 0.3; // share of the fee collected up front on intake

export interface MarketingTier {
  label: string;
  weeklyCost: number;
  extraAttempts: number; // additional lead-intake attempts per week
  chanceBonus: number; // added to each attempt's chance of landing a lead
}

export const MARKETING_TIERS: MarketingTier[] = [
  { label: "None", weeklyCost: 0, extraAttempts: 0, chanceBonus: 0 },
  { label: "Modest", weeklyCost: 600, extraAttempts: 1, chanceBonus: 0.05 },
  { label: "Aggressive", weeklyCost: 1500, extraAttempts: 2, chanceBonus: 0.12 },
];

// Weekly rent + insurance the firm owes regardless of casework.
export function weeklyOverhead(state: GameState): number {
  void state;
  return OFFICE_RENT + WEEKLY_INSURANCE;
}
export function marketingTier(state: GameState): MarketingTier {
  return MARKETING_TIERS[state.marketingLevel] ?? MARKETING_TIERS[0];
}
export function weeklyInterest(state: GameState): number {
  return Math.round(state.debt * WEEKLY_INTEREST);
}
export function creditLimit(state: GameState): number {
  return CREDIT_BASE + state.reputation * CREDIT_PER_REP;
}
export function availableCredit(state: GameState): number {
  return Math.max(0, creditLimit(state) - state.debt);
}
// Total cash the firm will pay out at the end of the week.
export function weeklyExpenses(state: GameState): number {
  const salaries = state.staff.reduce((sum, s) => sum + s.salary, 0);
  return salaries + weeklyOverhead(state) + marketingTier(state).weeklyCost + weeklyInterest(state);
}

export function createInitialState(seed = 1): GameState {
  let rng = createRng(seed);
  let nextId = 1;

  const candidates = [];
  for (let i = 0; i < CANDIDATE_POOL; i++) {
    const c = generateCandidate(`cand-${nextId++}`, [], rng);
    rng = c.rng;
    candidates.push(c.candidate);
  }

  return {
    phase: "setup",
    focusAreas: [],
    week: 0,
    rng,
    money: STARTING_MONEY,
    reputation: STARTING_REPUTATION,
    debt: 0,
    marketingLevel: 0,
    staff: [],
    candidates,
    matters: [],
    lastTurn: null,
    nextId,
    weeksInDebt: 0,
    status: "playing",
    statusReason: "",
  };
}
