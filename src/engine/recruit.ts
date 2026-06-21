import type { Candidate, Skills } from "./types.ts";
import type { RngState } from "./rng.ts";
import { nextInt, pick } from "./rng.ts";
import { SKILL_AXES } from "../data/skills.ts";
import { ROLE_PROFILES } from "../data/recruits.ts";
import { FIRST_NAMES, LAST_NAMES } from "../data/recruits.ts";

// Generate a hireable candidate: a role, skills weighted toward that role's
// specialties, and a salary/signing fee scaled by how good they are.
export function generateCandidate(
  id: string,
  rng: RngState,
): { candidate: Candidate; rng: RngState } {
  const roleP = pick(rng, ROLE_PROFILES);
  let r = roleP.rng;

  const fn = pick(r, FIRST_NAMES);
  r = fn.rng;
  const ln = pick(r, LAST_NAMES);
  r = ln.rng;

  const skills = {} as Skills;
  let skillSum = 0;
  for (const axis of SKILL_AXES) {
    const primary = roleP.value.primarySkills.includes(axis);
    const roll = primary ? nextInt(r, 3, 7) : nextInt(r, 0, 3);
    r = roll.rng;
    skills[axis] = roll.value;
    skillSum += roll.value;
  }

  const salary = Math.round((roleP.value.baseSalary + skillSum * 120) / 10) * 10;
  const signingCost = salary * 4;

  return {
    candidate: {
      id,
      name: `${fn.value} ${ln.value}`,
      role: roleP.value.role,
      skills,
      salary,
      signingCost,
    },
    rng: r,
  };
}
