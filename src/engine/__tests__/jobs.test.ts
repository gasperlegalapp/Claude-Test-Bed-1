import { describe, it, expect } from "vitest";
import { teamScore, successChance, resolveCase } from "../jobs.ts";
import { createRng } from "../rng.ts";
import type { CaseInstance, Staff } from "../types.ts";

function staff(partial: Partial<Staff["skills"]>): Staff {
  return {
    id: "s",
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
    ...over,
  };
}

describe("teamScore", () => {
  it("sums the best assigned skill per required axis", () => {
    const a = staff({ litigation: 6, research: 2 });
    const b = staff({ litigation: 3, research: 5 });
    // best litigation (6) + best research (5) = 11
    expect(teamScore(makeCase(), [a, b])).toBe(11);
  });

  it("is zero with no staff", () => {
    expect(teamScore(makeCase(), [])).toBe(0);
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
