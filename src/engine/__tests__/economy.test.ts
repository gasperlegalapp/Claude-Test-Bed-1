import { describe, it, expect } from "vitest";
import { createInitialState } from "../state.ts";
import { reduce } from "../reducer.ts";
import { ROLE_DEFS } from "../../data/staff.ts";

function started(seed = 5) {
  return reduce(createInitialState(seed), { type: "START_GAME", areas: ["criminal", "family"] });
}
function attorneyOf(s: ReturnType<typeof started>) {
  return s.staff.find((x) => ROLE_DEFS[x.role].attorney)!;
}
function revenueOf(log: NonNullable<ReturnType<typeof started>["lastTurn"]>) {
  return log.retainersCollected + log.billingsCollected + log.caseProceeds;
}
function costsOf(log: NonNullable<ReturnType<typeof started>["lastTurn"]>) {
  return log.salariesPaid + log.overheadPaid + log.marketingPaid + log.interestPaid + log.caseLosses;
}

describe("run history", () => {
  it("seeds a week-0 baseline when the game starts", () => {
    const s = started();
    expect(s.history.length).toBe(1);
    expect(s.history[0].week).toBe(0);
    expect(s.history[0].cash).toBe(s.money);
  });

  it("appends one weekly stat per END_TURN", () => {
    let s = { ...started(), money: 80000 };
    s = reduce(s, { type: "END_TURN" });
    s = reduce(s, { type: "END_TURN" });
    expect(s.history.length).toBe(3); // week 0 baseline + two closed weeks
    expect(s.history[s.history.length - 1].week).toBe(s.week);
  });
});

describe("weekly P&L", () => {
  it("a quiet week is a pure loss equal to fixed costs", () => {
    const s0 = { ...started(), money: 80000 };
    const s1 = reduce(s0, { type: "END_TURN" });
    const log = s1.lastTurn!;
    expect(revenueOf(log)).toBe(0);
    const profit = revenueOf(log) - costsOf(log);
    expect(profit).toBeLessThan(0);
    expect(s1.history[s1.history.length - 1].profit).toBe(profit);
  });

  it("records a retainer as revenue the week a matter is taken", () => {
    let s = { ...started(), money: 80000 };
    const att = attorneyOf(s);
    const m = s.matters.find((x) => x.status === "offered")!;
    s = reduce(s, { type: "TAKE_MATTER", matterId: m.id, staffIds: [att.id] });
    expect(s.weekRetainers).toBe(m.retainer);
    s = reduce(s, { type: "END_TURN" });
    expect(s.lastTurn!.retainersCollected).toBe(m.retainer);
    expect(s.weekRetainers).toBe(0); // resets for the new week
  });

  it("profit reconciles with the cash the week actually moved", () => {
    let s = { ...started(), money: 80000 };
    const att = attorneyOf(s);
    const m = s.matters.find((x) => x.status === "offered")!;
    s = reduce(s, { type: "TAKE_MATTER", matterId: m.id, staffIds: [att.id] });
    const before = s.money; // already includes the retainer
    s = reduce(s, { type: "END_TURN" });
    const log = s.lastTurn!;
    const profit = revenueOf(log) - costsOf(log);
    // No loans this week, so end-turn cash movement plus the earlier retainer is the profit.
    expect(profit).toBe(s.money - before + log.retainersCollected);
    expect(s.history[s.history.length - 1].profit).toBe(profit);
  });
});

describe("DISMISS_LEAD", () => {
  it("removes an offered lead", () => {
    let s = started();
    const lead = s.matters.find((m) => m.status === "offered")!;
    s = reduce(s, { type: "DISMISS_LEAD", matterId: lead.id });
    expect(s.matters.some((m) => m.id === lead.id)).toBe(false);
  });

  it("won't drop a matter that's already active", () => {
    let s = started();
    const att = attorneyOf(s);
    const m = s.matters.find((x) => x.status === "offered")!;
    s = reduce(s, { type: "TAKE_MATTER", matterId: m.id, staffIds: [att.id] });
    s = reduce(s, { type: "DISMISS_LEAD", matterId: m.id });
    const still = s.matters.find((x) => x.id === m.id);
    expect(still?.status).toBe("active");
  });
});
