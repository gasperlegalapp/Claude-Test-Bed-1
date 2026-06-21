import { describe, it, expect } from "vitest";
import { teamScore, successChance, resolveLitigation, resolveTransactional } from "../matters.ts";
import { createRng } from "../rng.ts";
import type { Matter, Staff } from "../types.ts";

let seq = 0;
function staff(skills: Partial<Staff["skills"]>): Staff {
  return {
    id: `s${seq++}`,
    name: "Test",
    role: "Associate",
    practiceAreas: ["criminal"],
    skills: { litigation: 0, research: 0, negotiation: 0, diligence: 0, networking: 0, ...skills },
    xp: 0,
    level: 1,
    skillPoints: 0,
    salary: 1000,
  };
}
function matter(over: Partial<Matter> = {}): Matter {
  return {
    id: "m",
    templateId: "t",
    area: "criminal",
    category: "litigation",
    title: "Case",
    flavor: "",
    requiredSkills: ["litigation"],
    difficulty: 8,
    totalDays: 60,
    daysRemaining: 60,
    payoff: 12000,
    riskCost: 3000,
    reputation: 5,
    staffIds: [],
    status: "active",
    expiresInWeeks: 3,
    ...over,
  };
}

describe("teamScore", () => {
  it("rises with more people, even unskilled ones", () => {
    const solo = teamScore(["litigation"], [staff({ litigation: 6 })]);
    const pair = teamScore(["litigation"], [staff({ litigation: 6 }), staff({ litigation: 0 })]);
    expect(pair).toBeGreaterThan(solo);
  });
});

describe("successChance", () => {
  it("is 50% when score meets difficulty and shifts with the office bonus", () => {
    const m = matter({ requiredSkills: ["litigation"], difficulty: 5 });
    expect(successChance(m, [staff({ litigation: 5 })])).toBeCloseTo(0.5);
    expect(successChance(m, [staff({ litigation: 5 })], 3)).toBeGreaterThan(0.5);
  });
});

describe("resolveLitigation", () => {
  it("pays out on a strong case and can lose on a hopeless one", () => {
    const easy = matter({ difficulty: 1 });
    const win = resolveLitigation(easy, [staff({ litigation: 20 })], createRng(1));
    expect(win.moneyDelta).toBeGreaterThan(0);

    const hard = matter({ difficulty: 99 });
    let rng = createRng(2);
    let res = resolveLitigation(hard, [staff({ litigation: 0 })], rng);
    for (let i = 0; i < 50 && res.outcome !== "failure"; i++) {
      rng = res.rng;
      res = resolveLitigation(hard, [staff({ litigation: 0 })], rng);
    }
    expect(res.outcome).toBe("failure");
    expect(res.moneyDelta).toBe(-hard.riskCost);
  });
});

describe("resolveTransactional", () => {
  it("always pays the fee — no losing", () => {
    const m = matter({ category: "transactional", payoff: 5000, reputation: 2 });
    const res = resolveTransactional(m);
    expect(res.moneyDelta).toBe(5000);
    expect(res.repDelta).toBe(2);
  });
});
