import { createRng } from "./rng.ts";
import type { GameState, Skills, Staff } from "./types.ts";
import { SKILL_AXES } from "../data/skills.ts";
import { STARTING_STAFF, type StaffSeed } from "../data/staff.ts";
import { rollNewCase } from "./jobs.ts";

const STARTING_MONEY = 15000;
const STARTING_REPUTATION = 10;
export const CASE_POOL_TARGET = 5; // how many open cases to keep on offer

// ---- Balance constants used by scoring / win-loss ----
// Each reputation point this much firm valuation (prestige is worth money).
export const REP_VALUE = 1500;
// Lose if the firm can't make payroll (negative cash) this many weeks running.
export const DEBT_WEEKS_TO_BANKRUPTCY = 4;

// Expand a sparse staff seed into a full skill record (unset axes default to 1).
function buildSkills(partial: StaffSeed["skills"]): Skills {
  const skills = {} as Skills;
  for (const axis of SKILL_AXES) {
    skills[axis] = partial[axis] ?? 1;
  }
  return skills;
}

// Builds a fresh game. Pass a seed for reproducible runs.
export function createInitialState(seed = 1): GameState {
  let rng = createRng(seed);
  let nextId = 1;

  const staff: Staff[] = STARTING_STAFF.map((seed) => ({
    id: `staff-${nextId++}`,
    name: seed.name,
    role: seed.role,
    skills: buildSkills(seed.skills),
    salary: seed.salary,
    status: "idle",
    jobId: null,
  }));

  const availableCases = [];
  for (let i = 0; i < CASE_POOL_TARGET; i++) {
    const rolled = rollNewCase(`case-${nextId++}`, rng);
    rng = rolled.rng;
    availableCases.push(rolled.caseInst);
  }

  return {
    week: 0,
    rng,
    money: STARTING_MONEY,
    reputation: STARTING_REPUTATION,
    staff,
    availableCases,
    activeJobs: [],
    lastTurn: null,
    nextId,
    weeksInDebt: 0,
    status: "playing",
    statusReason: "",
  };
}
