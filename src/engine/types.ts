import type { RngState } from "./rng.ts";
import type { SkillAxis } from "../data/skills.ts";
import type { StaffRole } from "../data/staff.ts";

// ---------------------------------------------------------------------------
// Game state (through Milestone 3).
//
// One flat, JSON-serializable object. All game rules read and return this via
// pure reducer functions — no DOM, no globals, no hidden mutation.
// ---------------------------------------------------------------------------

export type Skills = Record<SkillAxis, number>;

export type StaffStatus = "idle" | "assigned";

export interface Staff {
  id: string;
  name: string;
  role: StaffRole;
  skills: Skills;
  xp: Skills; // experience banked toward the next point in each skill
  salary: number; // weekly upkeep
  status: StaffStatus;
  jobId: string | null; // the active job this staffer is working, if any
}

// A district on the city map. Starts fogged unless it's home.
export interface District {
  id: string;
  name: string;
  x: number;
  y: number;
  wealth: number; // 1–3
  dominantSkill: SkillAxis;
  isHome: boolean;
  discovered: boolean; // revealed by scouting (or home)
  hasOffice: boolean; // built office: success bonus + more caseload here
}

// A concrete, offered case (instantiated from a CaseTemplate for a district).
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
  districtId: string;
  districtName: string;
}

// In-progress assignments. Three kinds of work share the staff/timer shape.
export type JobKind = "case" | "scout" | "build";

interface JobBase {
  id: string;
  staffIds: string[];
  weeksRemaining: number;
}
export interface CaseJob extends JobBase {
  kind: "case";
  case: CaseInstance;
}
export interface ScoutJob extends JobBase {
  kind: "scout";
  districtId: string;
  districtName: string;
}
export interface BuildJob extends JobBase {
  kind: "build";
  districtId: string;
  districtName: string;
}
export type Job = CaseJob | ScoutJob | BuildJob;

export type Outcome = "critical" | "success" | "partial" | "failure";

// One thing that happened during end-of-turn processing, for the recap.
export type TurnEventKind = JobKind | "growth";

export interface TurnEvent {
  kind: TurnEventKind;
  title: string; // case title, district name, or staff name (growth)
  outcome?: Outcome; // cases only
  moneyDelta?: number;
  repDelta?: number;
  detail?: string; // e.g. "District revealed", "Litigation -> 7"
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
  districts: District[];
  availableCases: CaseInstance[];
  activeJobs: Job[];
  unlockedPractices: string[]; // ids of unlocked practice areas
  lastTurn: TurnLog | null;
  nextId: number; // deterministic counter for unique ids
  weeksInDebt: number; // consecutive end-of-week with negative cash
  status: GameStatus;
  statusReason: string;
}
