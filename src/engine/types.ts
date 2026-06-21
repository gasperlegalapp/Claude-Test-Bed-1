import type { RngState } from "./rng.ts";
import type { SkillAxis } from "../data/skills.ts";
import type { StaffRole } from "../data/staff.ts";

// ---------------------------------------------------------------------------
// Game state (Milestone 1).
//
// One flat, JSON-serializable object. All game rules read and return this via
// pure reducer functions — no DOM, no globals, no hidden mutation. It grows
// milestone by milestone.
// ---------------------------------------------------------------------------

export type Skills = Record<SkillAxis, number>;

export type StaffStatus = "idle" | "assigned";

export interface Staff {
  id: string;
  name: string;
  role: StaffRole;
  skills: Skills;
  salary: number; // weekly upkeep
  status: StaffStatus;
  jobId: string | null; // the active job this staffer is working, if any
}

// A concrete, offered case (instantiated from a CaseTemplate).
export interface CaseInstance {
  id: string;
  templateId: string;
  title: string;
  flavor: string;
  requiredSkills: SkillAxis[];
  difficulty: number;
  durationWeeks: number;
  payoff: number;
  riskCost: number;
  reputation: number; // reputation gained on a clean success
}

// An in-progress assignment of staff to a case.
export interface Job {
  id: string;
  case: CaseInstance;
  staffIds: string[];
  weeksRemaining: number;
}

export type Outcome = "critical" | "success" | "partial" | "failure";

// Record of one case resolving during end-of-turn processing.
export interface ResolvedJob {
  caseTitle: string;
  outcome: Outcome;
  moneyDelta: number;
  repDelta: number;
  staffNames: string[];
}

// Summary of everything that happened on the most recent End Turn, for the UI.
export interface TurnLog {
  week: number;
  salariesPaid: number;
  resolved: ResolvedJob[];
}

// Whether the run is ongoing, won, or lost.
export type GameStatus = "playing" | "won" | "lost";

export interface GameState {
  week: number;
  rng: RngState;
  money: number;
  reputation: number;
  staff: Staff[];
  availableCases: CaseInstance[];
  activeJobs: Job[];
  lastTurn: TurnLog | null;
  nextId: number; // deterministic counter for unique ids
  weeksInDebt: number; // consecutive end-of-week with negative cash
  status: GameStatus;
  statusReason: string; // human-readable win/loss explanation
}
