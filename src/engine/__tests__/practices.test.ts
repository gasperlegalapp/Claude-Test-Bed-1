import { describe, it, expect } from "vitest";
import { createInitialState, PRACTICE_VALUE } from "../state.ts";
import { reduce } from "../reducer.ts";
import { computeValuation } from "../scoring.ts";
import { availableTemplates } from "../jobs.ts";
import { PRACTICE_AREAS } from "../../data/practices.ts";

describe("practice areas", () => {
  it("only offers gated templates once their practice is unlocked", () => {
    const before = availableTemplates([]);
    const after = availableTemplates(["estate"]);
    expect(before.some((t) => t.practiceArea === "estate")).toBe(false);
    expect(after.some((t) => t.practiceArea === "estate")).toBe(true);
  });

  it("unlocks an area when prereqs, money, and reputation are met", () => {
    const estate = PRACTICE_AREAS.find((a) => a.id === "estate")!;
    let s = createInitialState(3);
    s = { ...s, money: 50000, reputation: 30 };
    s = reduce(s, { type: "UNLOCK_PRACTICE", practiceId: "estate" });
    expect(s.unlockedPractices).toContain("estate");
    expect(s.money).toBe(50000 - estate.costMoney);
    expect(s.reputation).toBe(30 - estate.costRep);
  });

  it("refuses to unlock without the prerequisite", () => {
    let s = createInitialState(3);
    s = { ...s, money: 100000, reputation: 100 };
    // corporate requires estate first
    s = reduce(s, { type: "UNLOCK_PRACTICE", practiceId: "corporate" });
    expect(s.unlockedPractices).not.toContain("corporate");
  });

  it("refuses to unlock when it can't be afforded", () => {
    let s = createInitialState(3);
    s = { ...s, money: 100, reputation: 1 };
    s = reduce(s, { type: "UNLOCK_PRACTICE", practiceId: "estate" });
    expect(s.unlockedPractices).not.toContain("estate");
  });

  it("counts unlocked practices toward valuation", () => {
    let s = createInitialState(3);
    s = { ...s, money: 50000, reputation: 30 };
    const before = computeValuation(s);
    s = reduce(s, { type: "UNLOCK_PRACTICE", practiceId: "estate" });
    const estate = PRACTICE_AREAS.find((a) => a.id === "estate")!;
    // valuation gains PRACTICE_VALUE but loses the money + rep spent
    const expected =
      before - estate.costMoney - estate.costRep * 1500 + PRACTICE_VALUE;
    expect(computeValuation(s)).toBe(expected);
  });
});
