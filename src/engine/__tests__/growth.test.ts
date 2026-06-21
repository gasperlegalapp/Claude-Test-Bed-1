import { describe, it, expect } from "vitest";
import {
  gainXp,
  spendSkillPoint,
  xpForLevel,
  caseXp,
  MAX_SKILL,
} from "../growth.ts";
import type { Staff } from "../types.ts";

function staff(over: Partial<Staff> = {}): Staff {
  return {
    id: "s",
    name: "Test",
    role: "Associate",
    skills: { litigation: 3, research: 0, negotiation: 0, diligence: 0, networking: 0 },
    xp: 0,
    level: 1,
    skillPoints: 0,
    salary: 1000,
    status: "idle",
    jobId: null,
    ...over,
  };
}

describe("caseXp", () => {
  it("rewards better outcomes and harder cases with more xp", () => {
    expect(caseXp("success", 10)).toBeGreaterThan(caseXp("failure", 10));
    expect(caseXp("success", 16)).toBeGreaterThan(caseXp("success", 6));
  });
});

describe("gainXp", () => {
  it("banks xp from any case without necessarily leveling", () => {
    const r = gainXp(staff(), "failure", 5);
    expect(r.staff.xp).toBeGreaterThan(0);
    expect(r.levels).toBe(0);
  });

  it("levels up and grants a skill point when xp crosses the threshold", () => {
    const r = gainXp(staff({ xp: xpForLevel(1) - 1 }), "success", 10);
    expect(r.staff.level).toBe(2);
    expect(r.staff.skillPoints).toBe(1);
    expect(r.levels).toBe(1);
  });
});

describe("spendSkillPoint", () => {
  it("raises the chosen skill and consumes a point", () => {
    const s = staff({ skillPoints: 1 });
    const next = spendSkillPoint(s, "networking")!;
    expect(next.skills.networking).toBe(1);
    expect(next.skillPoints).toBe(0);
  });

  it("returns null with no points to spend", () => {
    expect(spendSkillPoint(staff({ skillPoints: 0 }), "litigation")).toBeNull();
  });

  it("won't push a skill past the cap", () => {
    const s = staff({ skillPoints: 1, skills: { ...staff().skills, litigation: MAX_SKILL } });
    expect(spendSkillPoint(s, "litigation")).toBeNull();
  });
});
