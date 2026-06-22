import { describe, it, expect } from "vitest";
import { createInitialState, maxActiveMatters } from "../state.ts";
import { reduce } from "../reducer.ts";
import { officeStats, spareCapacity, staffLoad } from "../office.ts";
import { ROLE_DEFS } from "../../data/staff.ts";

// Start a game focused on criminal + family law.
function started(seed = 5) {
  return reduce(createInitialState(seed), { type: "START_GAME", areas: ["criminal", "family"] });
}
function attorneyOf(s: ReturnType<typeof started>) {
  return s.staff.find((x) => ROLE_DEFS[x.role].attorney)!;
}

describe("setup", () => {
  it("starts in setup with no staff or matters", () => {
    const s = createInitialState();
    expect(s.phase).toBe("setup");
    expect(s.staff.length).toBe(0);
    expect(s.matters.length).toBe(0);
  });

  it("START_GAME seeds a founding team in the chosen areas and some leads", () => {
    const s = started();
    expect(s.phase).toBe("playing");
    expect(s.staff.length).toBe(3);
    expect(s.staff.some((x) => x.role === "Managing Attorney")).toBe(true);
    expect(s.staff.every((x) => x.practiceAreas.includes("criminal"))).toBe(true);
    expect(s.matters.length).toBeGreaterThan(0);
    expect(s.matters.every((m) => ["criminal", "family"].includes(m.area))).toBe(true);
  });
});

describe("TAKE_MATTER", () => {
  it("activates an offered matter with a qualified attorney", () => {
    const s0 = started();
    const m = s0.matters[0];
    const att = attorneyOf(s0);
    const s1 = reduce(s0, { type: "TAKE_MATTER", matterId: m.id, staffIds: [att.id] });
    const taken = s1.matters.find((x) => x.id === m.id)!;
    expect(taken.status).toBe("active");
    expect(staffLoad(s1, att.id)).toBe(1);
  });

  it("lets one attorney juggle several matters (capacity)", () => {
    let s = started();
    const att = attorneyOf(s);
    const cap = ROLE_DEFS[att.role].capacity;
    const offered = s.matters.filter((m) => m.status === "offered");
    let taken = 0;
    for (const m of offered) {
      if (spareCapacity(s, att.id) <= 0) break;
      if (s.matters.filter((x) => x.status === "active").length >= maxActiveMatters(s)) break;
      s = reduce(s, { type: "TAKE_MATTER", matterId: m.id, staffIds: [att.id] });
      taken++;
    }
    expect(taken).toBeGreaterThan(1);
    expect(staffLoad(s, att.id)).toBeLessThanOrEqual(cap);
  });

  it("won't staff a matter with no qualified attorney", () => {
    const s0 = started();
    const para = s0.staff.find((x) => x.role === "Paralegal")!;
    const m = s0.matters[0];
    const s1 = reduce(s0, { type: "TAKE_MATTER", matterId: m.id, staffIds: [para.id] });
    expect(s1.matters.find((x) => x.id === m.id)!.status).toBe("offered");
  });
});

describe("END_TURN", () => {
  it("advances a week, pays salaries, and can complete a matter", () => {
    // Runway to outlast a long case, but below the win threshold.
    let s = { ...started(), money: 120000 };
    const att = attorneyOf(s);
    const m = s.matters.find((x) => x.status === "offered")!;
    s = reduce(s, { type: "TAKE_MATTER", matterId: m.id, staffIds: [att.id] });
    const weeks = Math.ceil(m.totalDays / 7) + 1;
    let resolved = false;
    for (let i = 0; i < weeks && !resolved; i++) {
      s = reduce(s, { type: "END_TURN" });
      if (!s.matters.some((x) => x.id === m.id)) resolved = true;
    }
    expect(resolved).toBe(true);
    expect(s.lastTurn!.events.some((e) => e.kind === "matter")).toBe(true);
  });

  it("ends in a win once valuation clears the target", () => {
    let s = { ...started(), money: 300000 };
    s = reduce(s, { type: "END_TURN" });
    expect(s.status).toBe("won");
  });
});

describe("office capacity", () => {
  it("counts the whole floor's seats from the start", () => {
    const s = started();
    const stats = officeStats(s);
    // The fixed floor: 4 attorney offices, a 6-desk open work area, one front desk.
    expect(stats.attorneySeats).toBe(4);
    expect(stats.supportSeats).toBe(6);
    expect(stats.receptionSeats).toBe(1);
    // Amenities (conference, storage, bathroom) contribute bonuses.
    expect(stats.caseBonus).toBeGreaterThan(0);
    expect(stats.caseCapacity).toBeGreaterThan(0);
  });
});

describe("HIRE", () => {
  it("hires a candidate into an open seat", () => {
    let s = { ...started(), money: 200000 };
    const before = s.staff.length;
    const cand = s.candidates.find((c) => {
      const stats = officeStats(s);
      const k = ROLE_DEFS[c.role].seat;
      if (k === "office") return stats.attorneysHoused < stats.attorneySeats;
      if (k === "bullpen") return stats.supportHoused < stats.supportSeats;
      return stats.receptionHoused < stats.receptionSeats;
    });
    if (cand) {
      s = reduce(s, { type: "HIRE", candidateId: cand.id });
      expect(s.staff.length).toBe(before + 1);
    }
  });

  it("enforces the single Managing Attorney cap", () => {
    let s = { ...started(), money: 500000 };
    const mgrCand = s.candidates.find((c) => c.role === "Managing Attorney");
    if (mgrCand) {
      const before = s.staff.filter((x) => x.role === "Managing Attorney").length;
      s = reduce(s, { type: "HIRE", candidateId: mgrCand.id });
      expect(s.staff.filter((x) => x.role === "Managing Attorney").length).toBe(before);
    }
  });
});
