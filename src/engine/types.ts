import type { RngState } from "./rng.ts";
import type { SkillAxis } from "../data/skills.ts";
import type { StaffRole } from "../data/staff.ts";
import type { MatterCategory } from "../data/matters.ts";

export type Skills = Record<SkillAxis, number>;

export interface Staff {
  id: string;
  name: string;
  role: StaffRole;
  practiceAreas: string[]; // areas of law this person can work
  skills: Skills;
  xp: number;
  level: number;
  skillPoints: number;
  salary: number; // weekly upkeep
}

export interface Candidate {
  id: string;
  name: string;
  role: StaffRole;
  practiceAreas: string[];
  skills: Skills;
  salary: number;
  signingCost: number;
}

// A client matter. Offered matters are leads; active matters are being worked.
export interface Matter {
  id: string;
  templateId: string;
  area: string;
  category: MatterCategory;
  title: string;
  flavor: string;
  requiredSkills: SkillAxis[];
  difficulty: number;
  totalDays: number;
  daysRemaining: number;
  payoff: number;
  riskCost: number;
  reputation: number;
  staffIds: string[]; // who's working it (active matters)
  status: "offered" | "active";
  expiresInWeeks: number; // offered leads go cold if ignored
}

export type Outcome = "critical" | "success" | "partial" | "failure";

export type TurnEventKind = "matter" | "growth" | "lead";

export interface TurnEvent {
  kind: TurnEventKind;
  title: string;
  category?: MatterCategory;
  outcome?: Outcome; // litigation only
  moneyDelta?: number;
  repDelta?: number;
  detail?: string;
}

export interface TurnLog {
  week: number;
  salariesPaid: number;
  events: TurnEvent[];
}

export type GameStatus = "playing" | "won" | "lost";
export type GamePhase = "setup" | "playing";

export interface GameState {
  phase: GamePhase;
  focusAreas: string[]; // areas chosen at setup
  week: number;
  rng: RngState;
  money: number;
  reputation: number;
  staff: Staff[];
  candidates: Candidate[];
  matters: Matter[];
  lastTurn: TurnLog | null;
  nextId: number;
  weeksInDebt: number;
  status: GameStatus;
  statusReason: string;
}
