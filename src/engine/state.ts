import { createRng } from "./rng.ts";
import type { GameState } from "./types.ts";
import { generateCandidate } from "./people.ts";
import { officeStats } from "./office.ts";

const STARTING_MONEY = 35000;
const STARTING_REPUTATION = 10;

// ---- Balance constants ----
export const REP_VALUE = 1500; // valuation per reputation point
export const DEBT_WEEKS_TO_BANKRUPTCY = 4;
export const CANDIDATE_POOL = 4; // hireable candidates on offer
export const BASE_ACTIVE_MATTERS = 3; // active matters before room capacity
export const MAX_OFFERED = 6; // leads waiting to be taken
export const LEAD_CHANCE = 0.55; // weekly chance an intake attempt lands work
export const WEEK_DAYS = 7;

// How many matters the firm can actively work at once.
export function maxActiveMatters(state: GameState): number {
  return BASE_ACTIVE_MATTERS + officeStats(state).caseCapacity;
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
