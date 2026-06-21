import { describe, it, expect } from "vitest";
import { createInitialState, casePoolTarget } from "../state.ts";
import { reduce } from "../reducer.ts";
import { officeStats } from "../office.ts";
import { ROOM_TYPES } from "../../data/rooms.ts";
import { BUILDINGS } from "../../data/buildings.ts";

function firstEmptySlot(state = createInitialState(1)): number {
  const used = new Set(state.rooms.map((r) => r.slot));
  for (let i = 0; i < officeStats(state).slotsTotal; i++) {
    if (!used.has(i)) return i;
  }
  return -1;
}

describe("initial state — office model", () => {
  it("starts with a small staffed office and a full case pool", () => {
    const s = createInitialState();
    expect(s.staff.length).toBe(3);
    expect(s.rooms.length).toBeGreaterThan(0);
    expect(s.candidates.length).toBeGreaterThan(0);
    expect(s.availableCases.length).toBe(casePoolTarget(s));
  });

  it("houses the founders within the starting seats", () => {
    const stats = officeStats(createInitialState());
    expect(stats.lawyersHoused).toBeLessThanOrEqual(stats.lawyerSeats);
    expect(stats.supportHoused).toBeLessThanOrEqual(stats.supportSeats);
  });
});

describe("ASSIGN_CASE", () => {
  it("moves a case into an active job and marks staff busy", () => {
    const s0 = createInitialState(5);
    const s1 = reduce(s0, {
      type: "ASSIGN_CASE",
      caseId: s0.availableCases[0].id,
      staffIds: [s0.staff[0].id],
    });
    expect(s1.activeJobs.length).toBe(1);
    expect(s1.staff.find((x) => x.id === s0.staff[0].id)!.status).toBe("assigned");
  });
});

describe("BUILD_ROOM", () => {
  it("builds a room into an empty slot for cash", () => {
    let s = createInitialState(5);
    s = { ...s, money: 50000 };
    const slot = firstEmptySlot(s);
    const conf = ROOM_TYPES.find((r) => r.id === "conference")!;
    const before = s.money;
    s = reduce(s, { type: "BUILD_ROOM", slot, roomTypeId: "conference" });
    expect(s.rooms.some((r) => r.slot === slot && r.typeId === "conference")).toBe(true);
    expect(s.money).toBe(before - conf.buildCost);
  });

  it("a conference room raises the firm-wide case bonus", () => {
    let s = createInitialState(5);
    s = { ...s, money: 50000 };
    const before = officeStats(s).caseBonus;
    s = reduce(s, { type: "BUILD_ROOM", slot: firstEmptySlot(s), roomTypeId: "conference" });
    expect(officeStats(s).caseBonus).toBeGreaterThan(before);
  });

  it("won't build on an occupied slot", () => {
    let s = createInitialState(5);
    s = { ...s, money: 50000 };
    const occupied = s.rooms[0].slot;
    const count = s.rooms.length;
    s = reduce(s, { type: "BUILD_ROOM", slot: occupied, roomTypeId: "kitchen" });
    expect(s.rooms.length).toBe(count);
  });

  it("won't build when it can't be afforded", () => {
    let s = createInitialState(5);
    s = { ...s, money: 100 };
    const count = s.rooms.length;
    s = reduce(s, { type: "BUILD_ROOM", slot: firstEmptySlot(s), roomTypeId: "conference" });
    expect(s.rooms.length).toBe(count);
  });
});

describe("UPGRADE_BUILDING", () => {
  it("moves to a bigger building for cash, keeping rooms", () => {
    let s = createInitialState(5);
    s = { ...s, money: 100000 };
    const rooms = s.rooms.length;
    const before = officeStats(s).slotsTotal;
    s = reduce(s, { type: "UPGRADE_BUILDING" });
    expect(s.buildingTier).toBe(1);
    expect(officeStats(s).slotsTotal).toBeGreaterThan(before);
    expect(s.rooms.length).toBe(rooms);
    expect(s.money).toBe(100000 - BUILDINGS[1].upgradeCost);
  });

  it("won't upgrade past the top tier", () => {
    let s = createInitialState(5);
    s = { ...s, money: 10000000, buildingTier: BUILDINGS.length - 1 };
    s = reduce(s, { type: "UPGRADE_BUILDING" });
    expect(s.buildingTier).toBe(BUILDINGS.length - 1);
  });
});

describe("HIRE", () => {
  it("hires a candidate into a free seat for the signing fee", () => {
    let s = createInitialState(5);
    s = { ...s, money: 200000 };
    // Make sure there's a seat for whoever we hire by adding both room types.
    s = reduce(s, { type: "BUILD_ROOM", slot: firstEmptySlot(s), roomTypeId: "office" });
    s = reduce(s, { type: "BUILD_ROOM", slot: firstEmptySlot(s), roomTypeId: "bullpen" });
    const cand = s.candidates[0];
    const before = s.money;
    const count = s.staff.length;
    s = reduce(s, { type: "HIRE", candidateId: cand.id });
    expect(s.staff.length).toBe(count + 1);
    expect(s.candidates.find((c) => c.id === cand.id)).toBeUndefined();
    expect(s.money).toBe(before - cand.signingCost);
  });

  it("won't hire with no free seat of the right type", () => {
    // Fresh office: lawyer seats are exactly filled by the two founders.
    let s = createInitialState(5);
    s = { ...s, money: 200000 };
    const lawyerCand = s.candidates.find(
      (c) => c.role === "Associate" || c.role === "Rainmaker",
    );
    if (!lawyerCand) return;
    const count = s.staff.length;
    s = reduce(s, { type: "HIRE", candidateId: lawyerCand.id });
    expect(s.staff.length).toBe(count);
  });
});

describe("END_TURN", () => {
  it("advances the week and pays salaries", () => {
    const s0 = createInitialState(5);
    const payroll = s0.staff.reduce((sum, x) => sum + x.salary, 0);
    const s1 = reduce(s0, { type: "END_TURN" });
    expect(s1.week).toBe(1);
    expect(s1.money).toBe(s0.money - payroll);
  });

  it("resolves a finished case and refills the pool", () => {
    let s = createInitialState(5);
    const job = s.availableCases[0];
    s = reduce(s, { type: "ASSIGN_CASE", caseId: job.id, staffIds: [s.staff[0].id] });
    for (let i = 0; i < job.durationWeeks; i++) {
      s = reduce(s, { type: "END_TURN" });
    }
    expect(s.activeJobs.length).toBe(0);
    expect(s.lastTurn!.events.some((e) => e.kind === "case")).toBe(true);
    expect(s.availableCases.length).toBe(casePoolTarget(s));
  });

  it("keeps the candidate pool topped up", () => {
    const s = reduce(createInitialState(5), { type: "END_TURN" });
    expect(s.candidates.length).toBeGreaterThan(0);
  });

  it("ends the run in a win once valuation clears the target", () => {
    let s = createInitialState(5);
    s = { ...s, money: 300000 };
    s = reduce(s, { type: "END_TURN" });
    expect(s.status).toBe("won");
  });

  it("freezes the board once the game is over", () => {
    const over = { ...createInitialState(5), status: "won" as const };
    expect(reduce(over, { type: "END_TURN" })).toBe(over);
  });
});

describe("SPEND_SKILL_POINT", () => {
  it("raises a skill when a point is banked", () => {
    let s = createInitialState(5);
    const id = s.staff[0].id;
    s = { ...s, staff: s.staff.map((x) => (x.id === id ? { ...x, skillPoints: 1 } : x)) };
    const before = s.staff.find((x) => x.id === id)!.skills.networking;
    s = reduce(s, { type: "SPEND_SKILL_POINT", staffId: id, axis: "networking" });
    expect(s.staff.find((x) => x.id === id)!.skills.networking).toBe(before + 1);
  });
});
