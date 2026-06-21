import { createRng } from "./rng.ts";
import type { District, GameState, Skills, Staff } from "./types.ts";
import { SKILL_AXES } from "../data/skills.ts";
import { STARTING_STAFF, type StaffSeed } from "../data/staff.ts";
import { CITY } from "../data/city.ts";
import { rollNewCase } from "./jobs.ts";
import { emptyXp } from "./growth.ts";

const STARTING_MONEY = 15000;
const STARTING_REPUTATION = 10;

// ---- Balance constants ----
export const REP_VALUE = 1500; // firm valuation per reputation point
export const OFFICE_VALUE = 10000; // firm valuation per office (asset value)
export const PRACTICE_VALUE = 12000; // firm valuation per unlocked practice area
export const DEBT_WEEKS_TO_BANKRUPTCY = 4;
export const SCOUT_WEEKS = 2;
export const BUILD_WEEKS = 2;
export const BUILD_COST = 8000;

// How many open cases to keep on offer: a base, plus capacity for each
// district you've revealed and each office you've built. Expanding the firm
// literally widens the funnel of work.
export function casePoolTarget(districts: District[]): number {
  const discovered = districts.filter((d) => d.discovered).length;
  const offices = districts.filter((d) => d.hasOffice).length;
  return 5 + (discovered - 1) + (offices - 1);
}

function buildSkills(partial: StaffSeed["skills"]): Skills {
  const skills = {} as Skills;
  for (const axis of SKILL_AXES) {
    // Unset axes start at 0 — staff can train them up over time.
    skills[axis] = partial[axis] ?? 0;
  }
  return skills;
}

function buildDistricts(): District[] {
  return CITY.map((seed) => ({
    id: seed.id,
    name: seed.name,
    x: seed.x,
    y: seed.y,
    wealth: seed.wealth,
    dominantSkill: seed.dominantSkill,
    isHome: !!seed.isHome,
    discovered: !!seed.isHome, // only home starts revealed
    hasOffice: !!seed.isHome, // ...with an office
  }));
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
    xp: emptyXp(),
    salary: seed.salary,
    status: "idle",
    jobId: null,
  }));

  const districts = buildDistricts();
  const unlockedPractices: string[] = [];

  const availableCases = [];
  const target = casePoolTarget(districts);
  for (let i = 0; i < target; i++) {
    const rolled = rollNewCase(districts, unlockedPractices, `case-${nextId++}`, rng);
    rng = rolled.rng;
    availableCases.push(rolled.caseInst);
  }

  return {
    week: 0,
    rng,
    money: STARTING_MONEY,
    reputation: STARTING_REPUTATION,
    staff,
    districts,
    availableCases,
    activeJobs: [],
    unlockedPractices,
    lastTurn: null,
    nextId,
    weeksInDebt: 0,
    status: "playing",
    statusReason: "",
  };
}
