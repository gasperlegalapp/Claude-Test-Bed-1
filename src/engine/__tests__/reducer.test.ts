import { describe, it, expect } from "vitest";
import { createInitialState, casePoolTarget, BUILD_COST } from "../state.ts";
import { reduce } from "../reducer.ts";
import type { GameState } from "../types.ts";

// Reveal and build out a named district by fast-forwarding the right jobs.
function scoutAndBuild(start: GameState, districtId: string): GameState {
  let s = start;
  s = reduce(s, { type: "SCOUT", districtId, staffIds: [s.staff[0].id] });
  // Scout takes 2 weeks.
  s = reduce(s, { type: "END_TURN" });
  s = reduce(s, { type: "END_TURN" });
  s = { ...s, money: 50000 }; // ensure the firm can afford the build
  s = reduce(s, {
    type: "BUILD_OFFICE",
    districtId,
    staffIds: [s.staff[0].id],
  });
  s = reduce(s, { type: "END_TURN" });
  s = reduce(s, { type: "END_TURN" });
  return s;
}

describe("initial state — milestone 3", () => {
  it("starts with one discovered home office and the rest fogged", () => {
    const s = createInitialState();
    const home = s.districts.find((d) => d.isHome)!;
    expect(home.discovered).toBe(true);
    expect(home.hasOffice).toBe(true);
    expect(s.districts.filter((d) => d.discovered).length).toBe(1);
  });

  it("offers a full case pool, all in the home district", () => {
    const s = createInitialState();
    expect(s.availableCases.length).toBe(casePoolTarget(s.districts));
    const home = s.districts.find((d) => d.isHome)!;
    expect(s.availableCases.every((c) => c.districtId === home.id)).toBe(true);
  });
});

describe("ASSIGN_CASE", () => {
  it("moves a case into an active job and marks staff busy", () => {
    const s0 = createInitialState(5);
    const caseId = s0.availableCases[0].id;
    const staffId = s0.staff[0].id;
    const s1 = reduce(s0, { type: "ASSIGN_CASE", caseId, staffIds: [staffId] });

    expect(s1.activeJobs.length).toBe(1);
    expect(s1.activeJobs[0].kind).toBe("case");
    expect(s1.staff.find((x) => x.id === staffId)!.status).toBe("assigned");
  });

  it("ignores assignment of already-busy staff", () => {
    const s0 = createInitialState(5);
    const staffId = s0.staff[0].id;
    const s1 = reduce(s0, {
      type: "ASSIGN_CASE",
      caseId: s0.availableCases[0].id,
      staffIds: [staffId],
    });
    const s2 = reduce(s1, {
      type: "ASSIGN_CASE",
      caseId: s1.availableCases[0].id,
      staffIds: [staffId],
    });
    expect(s2.activeJobs.length).toBe(1);
  });
});

describe("SCOUT", () => {
  it("reveals a fogged district after the scout completes", () => {
    let s = createInitialState(5);
    const target = s.districts.find((d) => !d.discovered)!;
    s = reduce(s, {
      type: "SCOUT",
      districtId: target.id,
      staffIds: [s.staff[0].id],
    });
    expect(s.activeJobs[0].kind).toBe("scout");
    // Not revealed mid-job.
    s = reduce(s, { type: "END_TURN" });
    expect(s.districts.find((d) => d.id === target.id)!.discovered).toBe(false);
    // Revealed once the 2-week scout finishes.
    s = reduce(s, { type: "END_TURN" });
    expect(s.districts.find((d) => d.id === target.id)!.discovered).toBe(true);
  });

  it("won't scout an already-discovered district", () => {
    const s = createInitialState(5);
    const home = s.districts.find((d) => d.isHome)!;
    const after = reduce(s, {
      type: "SCOUT",
      districtId: home.id,
      staffIds: [s.staff[0].id],
    });
    expect(after.activeJobs.length).toBe(0);
  });
});

describe("BUILD_OFFICE", () => {
  it("charges upfront and opens an office on completion", () => {
    let s = createInitialState(5);
    const target = s.districts.find((d) => !d.discovered)!;
    // Reveal it first.
    s = reduce(s, {
      type: "SCOUT",
      districtId: target.id,
      staffIds: [s.staff[0].id],
    });
    s = reduce(s, { type: "END_TURN" });
    s = reduce(s, { type: "END_TURN" });

    s = { ...s, money: 50000 };
    const before = s.money;
    s = reduce(s, {
      type: "BUILD_OFFICE",
      districtId: target.id,
      staffIds: [s.staff[0].id],
    });
    expect(s.money).toBe(before - BUILD_COST); // charged at start
    expect(s.activeJobs[0].kind).toBe("build");

    s = reduce(s, { type: "END_TURN" });
    s = reduce(s, { type: "END_TURN" });
    expect(s.districts.find((d) => d.id === target.id)!.hasOffice).toBe(true);
  });

  it("won't build in a fogged district", () => {
    const s = createInitialState(5);
    const fogged = s.districts.find((d) => !d.discovered)!;
    const after = reduce(s, {
      type: "BUILD_OFFICE",
      districtId: fogged.id,
      staffIds: [s.staff[0].id],
    });
    expect(after.activeJobs.length).toBe(0);
  });

  it("a new office widens the case pool and hosts local cases", () => {
    const start = createInitialState(7);
    const target = start.districts.find((d) => !d.discovered)!;
    const before = casePoolTarget(start.districts);
    const s = scoutAndBuild(start, target.id);
    expect(casePoolTarget(s.districts)).toBeGreaterThan(before);
    expect(s.availableCases.length).toBe(casePoolTarget(s.districts));
    // Cases now appear in the newly built district too.
    expect(s.availableCases.some((c) => c.districtId === target.id)).toBe(true);
  });
});

describe("END_TURN", () => {
  it("advances the week and pays salaries", () => {
    const s0 = createInitialState(5);
    const payroll = s0.staff.reduce((sum, x) => sum + x.salary, 0);
    const s1 = reduce(s0, { type: "END_TURN" });
    expect(s1.week).toBe(1);
    expect(s1.money).toBe(s0.money - payroll);
    expect(s1.lastTurn!.salariesPaid).toBe(payroll);
  });

  it("resolves a finished case and frees staff", () => {
    let s = createInitialState(5);
    const quick = s.availableCases.find((c) => c.durationWeeks === 1)!;
    s = reduce(s, {
      type: "ASSIGN_CASE",
      caseId: quick.id,
      staffIds: [s.staff[0].id, s.staff[1].id],
    });
    s = reduce(s, { type: "END_TURN" });

    expect(s.activeJobs.length).toBe(0);
    expect(s.lastTurn!.events.some((e) => e.kind === "case")).toBe(true);
    expect(s.staff.every((x) => x.status === "idle")).toBe(true);
  });

  it("ends the run in a win once valuation clears the target", () => {
    let s = createInitialState(5);
    s = { ...s, money: 300000 };
    s = reduce(s, { type: "END_TURN" });
    expect(s.status).toBe("won");
    expect(s.statusReason).not.toBe("");
  });

  it("freezes the board once the game is over", () => {
    const over = { ...createInitialState(5), status: "won" as const };
    expect(reduce(over, { type: "END_TURN" })).toBe(over);
  });

  it("does not mutate the input state", () => {
    const s0 = createInitialState(5);
    const week = s0.week;
    reduce(s0, { type: "END_TURN" });
    expect(s0.week).toBe(week);
  });
});
