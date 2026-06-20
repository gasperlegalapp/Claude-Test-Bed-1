import { describe, it, expect } from "vitest";
import { createInitialState, CASE_POOL_TARGET } from "../state.ts";
import { reduce } from "../reducer.ts";

describe("initial state — milestone 1", () => {
  it("starts at week 0 with starting cash, staff, and a full case pool", () => {
    const s = createInitialState();
    expect(s.week).toBe(0);
    expect(s.money).toBeGreaterThan(0);
    expect(s.staff.length).toBe(3);
    expect(s.availableCases.length).toBe(CASE_POOL_TARGET);
    expect(s.activeJobs.length).toBe(0);
  });

  it("is deterministic for a given seed", () => {
    const a = createInitialState(123);
    const b = createInitialState(123);
    expect(a.availableCases.map((c) => c.id)).toEqual(
      b.availableCases.map((c) => c.id),
    );
    expect(a.availableCases[0].difficulty).toBe(b.availableCases[0].difficulty);
  });
});

describe("ASSIGN", () => {
  it("moves a case into an active job and marks staff busy", () => {
    const s0 = createInitialState(5);
    const caseId = s0.availableCases[0].id;
    const staffId = s0.staff[0].id;
    const s1 = reduce(s0, { type: "ASSIGN", caseId, staffIds: [staffId] });

    expect(s1.activeJobs.length).toBe(1);
    expect(s1.availableCases.find((c) => c.id === caseId)).toBeUndefined();
    expect(s1.staff.find((x) => x.id === staffId)!.status).toBe("assigned");
  });

  it("ignores assignment of already-busy staff", () => {
    const s0 = createInitialState(5);
    const staffId = s0.staff[0].id;
    const s1 = reduce(s0, {
      type: "ASSIGN",
      caseId: s0.availableCases[0].id,
      staffIds: [staffId],
    });
    // Try to assign the same (now busy) staffer to another case.
    const s2 = reduce(s1, {
      type: "ASSIGN",
      caseId: s1.availableCases[0].id,
      staffIds: [staffId],
    });
    expect(s2.activeJobs.length).toBe(1); // unchanged
  });

  it("does not mutate the input state", () => {
    const s0 = createInitialState(5);
    const before = s0.availableCases.length;
    reduce(s0, {
      type: "ASSIGN",
      caseId: s0.availableCases[0].id,
      staffIds: [s0.staff[0].id],
    });
    expect(s0.availableCases.length).toBe(before);
    expect(s0.activeJobs.length).toBe(0);
  });
});

describe("END_TURN", () => {
  it("advances the week and pays salaries", () => {
    const s0 = createInitialState(5);
    const payroll = s0.staff.reduce((sum, x) => sum + x.salary, 0);
    const s1 = reduce(s0, { type: "END_TURN" });
    expect(s1.week).toBe(1);
    // No jobs resolved, so cash drops by exactly payroll.
    expect(s1.money).toBe(s0.money - payroll);
    expect(s1.lastTurn!.salariesPaid).toBe(payroll);
  });

  it("resolves a finished job, frees staff, and refills the pool", () => {
    let s = createInitialState(5);
    // Find a 1-week case so it resolves after a single end turn.
    const quick = s.availableCases.find((c) => c.durationWeeks === 1)!;
    s = reduce(s, {
      type: "ASSIGN",
      caseId: quick.id,
      staffIds: [s.staff[0].id, s.staff[1].id],
    });
    s = reduce(s, { type: "END_TURN" });

    expect(s.activeJobs.length).toBe(0);
    expect(s.lastTurn!.resolved.length).toBe(1);
    expect(s.staff.every((x) => x.status === "idle")).toBe(true);
    expect(s.availableCases.length).toBe(CASE_POOL_TARGET);
  });

  it("keeps multi-week jobs running across turns", () => {
    let s = createInitialState(5);
    const long = s.availableCases.find((c) => c.durationWeeks >= 2);
    if (!long) return; // pool may not contain one at this seed
    s = reduce(s, {
      type: "ASSIGN",
      caseId: long.id,
      staffIds: [s.staff[0].id],
    });
    s = reduce(s, { type: "END_TURN" });
    expect(s.activeJobs.length).toBe(1);
    expect(s.activeJobs[0].weeksRemaining).toBe(long.durationWeeks - 1);
  });
});
