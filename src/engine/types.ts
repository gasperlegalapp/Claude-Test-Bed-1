import type { RngState } from "./rng.ts";
import type { SkillAxis } from "../data/skills.ts";
import type { StaffRole } from "../data/staff.ts";

// ---------------------------------------------------------------------------
// Game state. One flat, JSON-serializable object driven by pure reducers.
// ---------------------------------------------------------------------------

export type Skills = Record<SkillAxis, number>;

export type StaffStatus = "idle" | "assigned";

export interface Staff {
  id: string;
  name: string;
  role: StaffRole;
  skills: Skills;
  xp: number; // experience toward the next level (any case earns it)
  level: number;
  skillPoints: number; // unspent points the player allocates to any skill
  salary: number; // weekly upkeep
  status: StaffStatus;
  jobId: string | null;
}

// A hireable candidate. Becomes a Staff member once hired.
export interface Candidate {
  id: string;
  name: string;
  role: StaffRole;
  skills: Skills;
  salary: number;
  signingCost: number; // one-time fee to hire
}

// A built room occupying one slot of the office floor plan.
export interface Room {
  id: string;
  typeId: string; // references a RoomType in data
  slot: number; // index into the floor-plan grid
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
  reputation: number;
}

// An in-progress case assignment. (Building and hiring are instant, so cases
// are the only timed jobs.)
export interface Job {
  id: string;
  case: CaseInstance;
  staffIds: string[];
  weeksRemaining: number;
}

export type Outcome = "critical" | "success" | "partial" | "failure";

export type TurnEventKind = "case" | "growth";

// One thing that happened during end-of-turn processing, for the recap.
export interface TurnEvent {
  kind: TurnEventKind;
  title: string; // case title, or staff name for growth
  outcome?: Outcome;
  moneyDelta?: number;
  repDelta?: number;
  detail?: string;
  staffNames: string[];
}

export interface TurnLog {
  week: number;
  salariesPaid: number;
  events: TurnEvent[];
}

export type GameStatus = "playing" | "won" | "lost";

export interface GameState {
  week: number;
  rng: RngState;
  money: number;
  reputation: number;
  staff: Staff[];
  rooms: Room[];
  buildingTier: number; // index into BUILDINGS
  candidates: Candidate[];
  availableCases: CaseInstance[];
  activeJobs: Job[];
  unlockedPractices: string[];
  lastTurn: TurnLog | null;
  nextId: number;
  weeksInDebt: number;
  status: GameStatus;
  statusReason: string;
}
