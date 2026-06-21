import type { SkillAxis } from "./skills.ts";
import type { StaffRole } from "./staff.ts";

// Content used to generate hireable candidates: name pools and, per role, the
// skills the role leans on, a base salary, and which seat type it needs.

export type SeatCategory = "lawyer" | "support";

export interface RoleProfile {
  role: StaffRole;
  category: SeatCategory;
  primarySkills: SkillAxis[];
  baseSalary: number;
}

export const ROLE_PROFILES: RoleProfile[] = [
  { role: "Associate", category: "lawyer", primarySkills: ["litigation", "research"], baseSalary: 1400 },
  { role: "Rainmaker", category: "lawyer", primarySkills: ["networking", "negotiation"], baseSalary: 1500 },
  { role: "Paralegal", category: "support", primarySkills: ["research", "diligence"], baseSalary: 1000 },
  { role: "Investigator", category: "support", primarySkills: ["diligence", "networking"], baseSalary: 1100 },
  { role: "Process Server", category: "support", primarySkills: ["diligence", "litigation"], baseSalary: 900 },
];

export const FIRST_NAMES = [
  "Alex", "Jordan", "Sam", "Casey", "Morgan", "Riley", "Taylor", "Jamie",
  "Avery", "Quinn", "Devon", "Harper", "Rowan", "Sasha", "Noor", "Diego",
  "Mei", "Omar", "Yuki", "Ingrid",
];

export const LAST_NAMES = [
  "Okafor", "Bianchi", "Nguyen", "Calderon", "Hjalmarsson", "Kowalski",
  "Abara", "Delgado", "Schmidt", "Park", "Rossi", "Fontaine", "Mwangi",
  "Petrov", "Castillo", "Yamamoto", "Bauer", "Haddad", "Lindqvist", "Cruz",
];
