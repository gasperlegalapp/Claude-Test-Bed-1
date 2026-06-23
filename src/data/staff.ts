import type { SkillAxis } from "./skills.ts";

// The satellite office's staff. The owners stay back at HQ and don't work
// matters — you're building out a new team in a new town.

export type StaffRole =
  | "Of Counsel" // part-time attorney
  | "Associate"
  | "Partner"
  | "Managing Attorney"
  | "Paralegal"
  | "Legal Assistant"
  | "Receptionist";

export type SeatKind = "office" | "bullpen" | "reception";

export interface RoleDef {
  role: StaffRole;
  seat: SeatKind;
  attorney: boolean; // can be the responsible attorney on a matter
  casework: boolean; // can be assigned to matters at all
  capacity: number; // how many matters they can juggle at once
  baseSalary: number; // weekly
  max?: number; // hard cap on how many the firm may employ
  blurb: string;
}

export const ROLE_DEFS: Record<StaffRole, RoleDef> = {
  "Managing Attorney": {
    role: "Managing Attorney",
    seat: "office",
    attorney: true,
    casework: true,
    capacity: 10,
    baseSalary: 1400,
    max: 1,
    blurb: "Runs the office and can supervise many matters at once.",
  },
  Partner: {
    role: "Partner",
    seat: "office",
    attorney: true,
    casework: true,
    capacity: 10,
    baseSalary: 1300,
    blurb: "Senior attorney. Strong on the toughest matters.",
  },
  Associate: {
    role: "Associate",
    seat: "office",
    attorney: true,
    casework: true,
    capacity: 10,
    baseSalary: 900,
    blurb: "The workhorse attorney of the firm.",
  },
  "Of Counsel": {
    role: "Of Counsel",
    seat: "office",
    attorney: true,
    casework: true,
    capacity: 6,
    baseSalary: 700,
    blurb: "Part-time attorney. Cheaper, but takes on fewer matters.",
  },
  Paralegal: {
    role: "Paralegal",
    seat: "bullpen",
    attorney: false,
    casework: true,
    capacity: 8,
    baseSalary: 600,
    blurb: "Drafts, files, and keeps matters moving. Boosts the team.",
  },
  "Legal Assistant": {
    role: "Legal Assistant",
    seat: "bullpen",
    attorney: false,
    casework: true,
    capacity: 6,
    baseSalary: 500,
    blurb: "Handles scheduling and support work across matters.",
  },
  Receptionist: {
    role: "Receptionist",
    seat: "reception",
    attorney: false,
    casework: false,
    capacity: 0,
    baseSalary: 450,
    blurb: "Answers calls and wins clients over — but doesn't work matters.",
  },
};

export interface StaffSeed {
  name: string;
  role: StaffRole;
  practiceAreas: string[];
  skills: Partial<Record<SkillAxis, number>>;
}
