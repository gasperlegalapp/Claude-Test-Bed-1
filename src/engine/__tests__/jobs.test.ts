import { describe, it, expect } from "vitest";
import { teamScore, successChance, resolveCase } from "../jobs.ts";
import { createRng } from "../rng.ts";
import type { CaseInstance, Staff } from "../types.ts";

let staffSeq = 0;
function staff(partial: Partial<Staff["skills"]>): Staff {
  return {
    id: `s${staffSeq++}`,
    name: "Test",
    role: "Associate",
    skills: {
      litigation: 1,
      research: 1,
      negotiation: 1,
      diligence: 1,
      networking: 1,
      ...partial,
    },
    xp: {
      litigation: 0,
      research: 0,
      negotiation: 0,
      diligence: 0,
      networking: 0,
    },
    salary: 1000,
    status: "idle",
    jobId: null,
  };
}

function makeCase(over: Partial<CaseInstance> = {}): CaseInstance {
  return {
    id: "c",
    templateId: "t",
    title: "Case",
    flavor: "",
    requiredSkills: ["litigation", "research"],
    difficulty: 10,
    durationWeeks: 1,
    payoff: 10000,
    riskCost: 1000,
    reputation: 4,
    districtId: "downtown",
    districtName: "Old Downtown",
    ...over,
  };
}

describe("teamScore", () => {
  it("counts the best per axis fully and support staff at a discount", () => {
    const a = staff({ litigation: 6, research: 2 });
    const b = staff({ litigation: 3, research: 5 });
    // litigation: 6 + 3*0.4 = 7.2 ; research: 5 + 2*0.4 = 5.8
    // plus teamwork (2-1)*0.5 = 0.5 -> 13.5
    expect(teamScore(makeCase(), [a, b])).toBeCloseTo(13.5);
  });

  it("is zero with no staff", () => {
    expect(teamScore(makeCase(), [])).toBe(0);
  });

  it("rises when a second skilled person joins", () => {
    const c = makeCase({ requiredSkills: ["litigation"] });
    const solo = teamScore(c, [staff({ litigation: 6 })]);
    const pair = teamScore(c, [
      staff({ litigation: 6 }),
      staff({ litigation: 6 }),
    ]);
    expect(pair).toBeGreaterThan(solo);
  });

  it("rises even when the extra body has no relevant skill", () => {
    const c = makeCase({ requiredSkills: ["litigation"] });
    const solo = teamScore(c, [staff({ litigation: 6 })]);
    const helped = teamScore(c, [
      staff({ litigation: 6 }),
      staff({ litigation: 0 }),
    ]);
    expect(helped).toBeGreaterThan(solo);
  });
});

describe("successChance", () => {
  it("is 50% when team score exactly meets difficulty", () => {
    const c = makeCase({ requiredSkills: ["litigation"], difficulty: 5 });
    expect(successChance(c, [staff({ litigation: 5 })])).toBeCloseTo(0.5);
  });

  it("rises with skill advantage and falls with disadvantage", () => {
    const c = makeCase({ requiredSkills: ["litigation"], difficulty: 5 });
    const strong = successChance(c, [staff({ litigation: 9 })]);
    const weak = successChance(c, [staff({ litigation: 1 })]);
    expect(strong).toBeGreaterThan(0.5);
    expect(weak).toBeLessThan(0.5);
  });

  it("an office score bonus raises the odds", () => {
    const c = makeCase({ requiredSkills: ["litigation"], difficulty: 8 });
    const team = [staff({ litigation: 5 })];
    const without = successChance(c, team, 0);
    const withOffice = successChance(c, team, 3);
    expect(withOffice).toBeGreaterThan(without);
  });

  it("never leaves the [0.05, 0.95] band", () => {
    const c = makeCase({ requiredSkills: ["litigation"], difficulty: 5 });
    expect(successChance(c, [staff({ litigation: 99 })])).toBeLessThanOrEqual(
      0.95,
    );
    const hard = makeCase({ requiredSkills: ["litigation"], difficulty: 99 });
    expect(successChance(hard, [staff({ litigation: 1 })])).toBeGreaterThanOrEqual(
      0.05,
    );
  });
});

describe("resolveCase", () => {
  it("pays the full payoff on a success", () => {
    // Overwhelming skill -> 95% chance -> almost any roll succeeds.
    const c = makeCase({ requiredSkills: ["litigation"], difficulty: 1 });
    const res = resolveCase(c, [staff({ litigation: 20 })], createRng(1));
    expect(["success", "critical"]).toContain(res.outcome);
    expect(res.moneyDelta).toBeGreaterThanOrEqual(c.payoff);
    expect(res.repDelta).toBeGreaterThanOrEqual(c.reputation);
  });

  it("loses the risk cost on a failure", () => {
    // Hopeless odds -> 5% chance -> almost any roll fails.
    const c = makeCase({ requiredSkills: ["litigation"], difficulty: 99 });
    let rng = createRng(2);
    // Find a seed-step that produces an outright failure.
    let res = resolveCase(c, [staff({ litigation: 1 })], rng);
    for (let i = 0; i < 50 && res.outcome !== "failure"; i++) {
      rng = res.rng;
      res = resolveCase(c, [staff({ litigation: 1 })], rng);
    }
    expect(res.outcome).toBe("failure");
    expect(res.moneyDelta).toBe(-c.riskCost);
    expect(res.repDelta).toBeLessThan(0);
  });

  it("is deterministic for a given rng state", () => {
    const c = makeCase();
    const team = [staff({ litigation: 5, research: 5 })];
    const a = resolveCase(c, team, createRng(7));
    const b = resolveCase(c, team, createRng(7));
    expect(a.outcome).toBe(b.outcome);
    expect(a.moneyDelta).toBe(b.moneyDelta);
  });
});
