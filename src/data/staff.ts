import type { SkillAxis } from "./skills.ts";

export type StaffRole =
  | "Associate"
  | "Paralegal"
  | "Investigator"
  | "Process Server"
  | "Rainmaker";

export interface StaffSeed {
  name: string;
  role: StaffRole;
  salary: number; // weekly upkeep
  skills: Partial<Record<SkillAxis, number>>; // unset axes default to 1
}

// The starting roster. Three staff with complementary skill spreads so the
// player immediately has interesting assignment tradeoffs.
export const STARTING_STAFF: StaffSeed[] = [
  {
    name: "Dana Reyes",
    role: "Associate",
    salary: 1800,
    skills: { litigation: 6, research: 4, negotiation: 3 },
  },
  {
    name: "Marcus Webb",
    role: "Paralegal",
    salary: 1100,
    skills: { research: 6, diligence: 5, litigation: 2 },
  },
  {
    name: "Priya Anand",
    role: "Rainmaker",
    salary: 1500,
    skills: { networking: 6, negotiation: 5, diligence: 2 },
  },
];
