import { describe, it, expect } from "vitest";
import { trainStaff, emptyXp, LEVEL_XP, MAX_SKILL } from "../growth.ts";
import type { Staff } from "../types.ts";

function staff(litigation: number, xp = 0): Staff {
  return {
    id: "s",
    name: "Test",
    role: "Associate",
    skills: { litigation, research: 0, negotiation: 0, diligence: 0, networking: 0 },
    xp: { ...emptyXp(), litigation: xp },
    salary: 1000,
    status: "idle",
    jobId: null,
  };
}

describe("trainStaff", () => {
  it("banks experience without leveling on a single case", () => {
    const r = trainStaff(staff(3), ["litigation"], "success");
    expect(r.staff.skills.litigation).toBe(3);
    expect(r.staff.xp.litigation).toBeGreaterThan(0);
    expect(r.levelUps).toHaveLength(0);
  });

  it("levels a skill once enough experience accumulates", () => {
    const r = trainStaff(staff(3, LEVEL_XP - 1), ["litigation"], "success");
    expect(r.staff.skills.litigation).toBe(4);
    expect(r.levelUps).toEqual([{ axis: "litigation", newLevel: 4 }]);
  });

  it("learns more slowly from a loss than a win", () => {
    const win = trainStaff(staff(3), ["litigation"], "success");
    const loss = trainStaff(staff(3), ["litigation"], "failure");
    expect(loss.staff.xp.litigation).toBeLessThan(win.staff.xp.litigation);
  });

  it("never trains a skill past the cap", () => {
    const r = trainStaff(staff(MAX_SKILL, LEVEL_XP - 1), ["litigation"], "critical");
    expect(r.staff.skills.litigation).toBe(MAX_SKILL);
    expect(r.levelUps).toHaveLength(0);
  });
});
