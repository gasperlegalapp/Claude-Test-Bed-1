import type { Outcome, Staff } from "./types.ts";
import type { SkillAxis } from "../data/skills.ts";

// Staff leveling. Working *any* case earns general experience (more for harder
// cases and better outcomes; you learn from losses too, just slower). Enough
// experience grants a level and a skill point, which the player spends on
// whichever skill they like.

export const MAX_SKILL = 10;
const XP_BASE = 40;
const OUTCOME_MULT: Record<Outcome, number> = {
  critical: 1.5,
  success: 1.0,
  partial: 0.6,
  failure: 0.3,
};

// Experience required to go from `level` to the next. Later levels cost more.
export function xpForLevel(level: number): number {
  return 100 + (level - 1) * 50;
}

// XP earned for completing one case.
export function caseXp(outcome: Outcome, difficulty: number): number {
  return Math.round(XP_BASE * OUTCOME_MULT[outcome] * (1 + difficulty / 20));
}

// Award experience for a completed case, applying any level-ups (each grants a
// skill point). Pure: returns a new staff object plus how many levels gained.
export function gainXp(
  staff: Staff,
  outcome: Outcome,
  difficulty: number,
): { staff: Staff; levels: number } {
  let xp = staff.xp + caseXp(outcome, difficulty);
  let level = staff.level;
  let skillPoints = staff.skillPoints;
  let levels = 0;

  while (xp >= xpForLevel(level)) {
    xp -= xpForLevel(level);
    level += 1;
    skillPoints += 1;
    levels += 1;
  }

  return { staff: { ...staff, xp, level, skillPoints }, levels };
}

// Spend one banked skill point to raise a skill. Returns null if there's no
// point to spend or the skill is already maxed.
export function spendSkillPoint(staff: Staff, axis: SkillAxis): Staff | null {
  if (staff.skillPoints <= 0) return null;
  if (staff.skills[axis] >= MAX_SKILL) return null;
  return {
    ...staff,
    skillPoints: staff.skillPoints - 1,
    skills: { ...staff.skills, [axis]: staff.skills[axis] + 1 },
  };
}
