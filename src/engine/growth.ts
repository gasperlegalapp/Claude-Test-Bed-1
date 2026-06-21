import type { Outcome, Skills, Staff } from "./types.ts";
import { SKILL_AXES, type SkillAxis } from "../data/skills.ts";

// Staff leveling. Working a case banks experience in the skills it exercised;
// enough experience raises that skill by a point. You learn even from losses,
// just slower.

export const LEVEL_XP = 100; // experience per skill point
export const MAX_SKILL = 10;
const BASE_XP = 35; // per required skill, per completed case
const OUTCOME_MULT: Record<Outcome, number> = {
  critical: 1.5,
  success: 1.0,
  partial: 0.6,
  failure: 0.3,
};

export function emptyXp(): Skills {
  const xp = {} as Skills;
  for (const axis of SKILL_AXES) xp[axis] = 0;
  return xp;
}

export interface LevelUp {
  axis: SkillAxis;
  newLevel: number;
}

// Award experience to a staffer for the axes a case exercised, applying any
// resulting level-ups. Pure: returns a new staff object plus the level-ups.
export function trainStaff(
  staff: Staff,
  axes: SkillAxis[],
  outcome: Outcome,
): { staff: Staff; levelUps: LevelUp[] } {
  const mult = OUTCOME_MULT[outcome];
  const skills: Skills = { ...staff.skills };
  const xp: Skills = { ...staff.xp };
  const levelUps: LevelUp[] = [];

  for (const axis of axes) {
    if (skills[axis] >= MAX_SKILL) continue;
    xp[axis] += BASE_XP * mult;
    while (xp[axis] >= LEVEL_XP && skills[axis] < MAX_SKILL) {
      xp[axis] -= LEVEL_XP;
      skills[axis] += 1;
      levelUps.push({ axis, newLevel: skills[axis] });
    }
    if (skills[axis] >= MAX_SKILL) xp[axis] = 0;
  }

  return { staff: { ...staff, skills, xp }, levelUps };
}
