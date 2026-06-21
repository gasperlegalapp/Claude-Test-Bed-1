import { createRng } from "./rng.ts";
import type { GameState, Room, Skills, Staff } from "./types.ts";
import { SKILL_AXES } from "../data/skills.ts";
import { STARTING_STAFF, type StaffSeed } from "../data/staff.ts";
import { rollNewCase } from "./jobs.ts";
import { generateCandidate } from "./recruit.ts";
import { officeStats } from "./office.ts";

const STARTING_MONEY = 15000;
const STARTING_REPUTATION = 10;

// ---- Balance constants ----
export const REP_VALUE = 1500; // firm valuation per reputation point
export const PRACTICE_VALUE = 12000; // valuation per unlocked practice area
export const DEBT_WEEKS_TO_BANKRUPTCY = 4;
export const BASE_CASE_POOL = 3; // open cases before any room capacity
export const CANDIDATE_POOL = 3; // hireable candidates on offer

// Where the firm starts: a small walk-up with a lobby, two lawyer offices,
// and a bullpen — enough to house the three founders with room to grow.
const STARTING_ROOMS: Array<Room["typeId"]> = ["lobby", "office", "office", "bullpen"];

// How many open cases to keep on offer: a base plus room-provided capacity.
export function casePoolTarget(state: GameState): number {
  return BASE_CASE_POOL + officeStats(state).caseCapacity;
}

function buildSkills(partial: StaffSeed["skills"]): Skills {
  const skills = {} as Skills;
  for (const axis of SKILL_AXES) {
    skills[axis] = partial[axis] ?? 0;
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
    xp: 0,
    level: 1,
    skillPoints: 0,
    salary: seed.salary,
    status: "idle",
    jobId: null,
  }));

  const rooms: Room[] = STARTING_ROOMS.map((typeId, slot) => ({
    id: `room-${nextId++}`,
    typeId,
    slot,
  }));

  const unlockedPractices: string[] = [];

  const candidates = [];
  for (let i = 0; i < CANDIDATE_POOL; i++) {
    const c = generateCandidate(`cand-${nextId++}`, rng);
    rng = c.rng;
    candidates.push(c.candidate);
  }

  const state: GameState = {
    week: 0,
    rng,
    money: STARTING_MONEY,
    reputation: STARTING_REPUTATION,
    staff,
    rooms,
    buildingTier: 0,
    candidates,
    availableCases: [],
    activeJobs: [],
    unlockedPractices,
    lastTurn: null,
    nextId,
    weeksInDebt: 0,
    status: "playing",
    statusReason: "",
  };

  const target = casePoolTarget(state);
  for (let i = 0; i < target; i++) {
    const rolled = rollNewCase(unlockedPractices, `case-${state.nextId++}`, state.rng);
    state.rng = rolled.rng;
    state.availableCases.push(rolled.caseInst);
  }

  return state;
}
