import type { Candidate, Skills, Staff } from "./types.ts";
import type { RngState } from "./rng.ts";
import { nextFloat, nextInt, pick } from "./rng.ts";
import { SKILL_AXES, type SkillAxis } from "../data/skills.ts";
import { ROLE_DEFS, type StaffRole } from "../data/staff.ts";
import { HIREABLE_ROLES, FIRST_NAMES, LAST_NAMES } from "../data/recruits.ts";
import { LAW_AREAS } from "../data/areas.ts";

// Which skills each role leans on, for generating believable people.
const ROLE_PRIMARY: Record<StaffRole, SkillAxis[]> = {
  "Managing Attorney": ["litigation", "negotiation", "research"],
  Partner: ["litigation", "negotiation", "research"],
  Associate: ["litigation", "research"],
  "Of Counsel": ["research", "negotiation"],
  Paralegal: ["research", "diligence"],
  "Legal Assistant": ["diligence", "networking"],
  Receptionist: ["networking", "negotiation"],
};
const SENIOR: StaffRole[] = ["Managing Attorney", "Partner"];

function name(rng: RngState): { value: string; rng: RngState } {
  const fn = pick(rng, FIRST_NAMES);
  const ln = pick(fn.rng, LAST_NAMES);
  return { value: `${fn.value} ${ln.value}`, rng: ln.rng };
}

function rollSkills(role: StaffRole, rng: RngState): { skills: Skills; sum: number; rng: RngState } {
  const primary = ROLE_PRIMARY[role];
  const hi = SENIOR.includes(role) ? [4, 8] : [3, 7];
  const skills = {} as Skills;
  let sum = 0;
  let r = rng;
  for (const axis of SKILL_AXES) {
    const range = primary.includes(axis) ? hi : [0, 3];
    const roll = nextInt(r, range[0], range[1]);
    r = roll.rng;
    skills[axis] = roll.value;
    sum += roll.value;
  }
  return { skills, sum, rng: r };
}

// Pick 1–2 areas of law for an attorney, biased toward the firm's focus so
// useful people actually turn up. Non-attorneys get areas for flavour only.
function rollAreas(focusAreas: string[], rng: RngState): { areas: string[]; rng: RngState } {
  const areas = new Set<string>();
  let r = rng;
  if (focusAreas.length > 0) {
    const inc = nextFloat(r);
    r = inc.rng;
    if (inc.value < 0.7) {
      const f = pick(r, focusAreas);
      r = f.rng;
      areas.add(f.value);
    }
  }
  const extra = nextInt(r, areas.size === 0 ? 1 : 0, 1);
  r = extra.rng;
  for (let i = 0; i < extra.value + (areas.size === 0 ? 1 : 0); i++) {
    const a = pick(r, LAW_AREAS);
    r = a.rng;
    areas.add(a.value.id);
  }
  return { areas: [...areas], rng: r };
}

export function generateCandidate(
  id: string,
  focusAreas: string[],
  rng: RngState,
): { candidate: Candidate; rng: RngState } {
  const roleP = pick(rng, HIREABLE_ROLES);
  const role = roleP.value;
  const nm = name(roleP.rng);
  const sk = rollSkills(role, nm.rng);
  const ar = rollAreas(focusAreas, sk.rng);
  const def = ROLE_DEFS[role];
  const salary = Math.round((def.baseSalary + sk.sum * 110) / 10) * 10;
  return {
    candidate: {
      id,
      name: nm.value,
      role,
      practiceAreas: def.attorney ? ar.areas : ar.areas,
      skills: sk.skills,
      salary,
      signingCost: salary * 4,
    },
    rng: ar.rng,
  };
}

// The founding satellite team: a managing attorney, an associate, and a
// paralegal, all practising the chosen focus areas.
export function generateStartingStaff(
  focusAreas: string[],
  startId: number,
  rng: RngState,
): { staff: Staff[]; nextId: number; rng: RngState } {
  const roles: StaffRole[] = ["Managing Attorney", "Associate", "Paralegal"];
  const staff: Staff[] = [];
  let id = startId;
  let r = rng;
  for (const role of roles) {
    const nm = name(r);
    const sk = rollSkills(role, nm.rng);
    r = sk.rng;
    staff.push({
      id: `staff-${id++}`,
      name: nm.value,
      role,
      practiceAreas: [...focusAreas],
      skills: sk.skills,
      xp: 0,
      level: 1,
      skillPoints: 0,
      salary: ROLE_DEFS[role].baseSalary,
    });
  }
  return { staff, nextId: id, rng: r };
}
