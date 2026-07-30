import { describe, expect, it } from "vitest";
import { monthBuckets, project, totals, weekBuckets, worklist } from "../forecast.ts";
import { defaultSettings } from "../config.ts";
import { blankEvent, blankMatter, emptyState } from "../store.ts";
import type { AppState, BillingEvent, Matter } from "../types.ts";

const TODAY = "2026-03-02"; // a Monday
const settings = defaultSettings();

function stateWith(matters: Matter[], events: BillingEvent[]): AppState {
  return { ...emptyState(), matters, events };
}

function guardianship(patch: Partial<Matter> = {}): Matter {
  return { ...blankMatter("guardianship"), fileNumber: "G-1", ...patch };
}

function eventFor(matter: Matter, patch: Partial<BillingEvent> = {}): BillingEvent {
  return { ...blankEvent(matter, settings), hours: 20, rate: 300, feeBasis: "hourly", ...patch };
}

describe("project", () => {
  it("dates the cash from the pipeline still ahead of the request", () => {
    const matter = guardianship({ weAreFiduciary: true });
    const event = eventFor(matter, {
      route: "hearing",
      stage: "order_entered",
      history: [{ stage: "order_entered", enteredOn: TODAY }],
    });
    const [p] = project(stateWith([matter], [event]), TODAY);
    // Our 3-day order target plus our 7-day payment target.
    expect(p.daysOut).toBe(settings.targets.order_entered + settings.targets.payment_requested);
    expect(p.amount).toBe(6_000);
    expect(p.confidence).toBe("committed");
  });

  it("waits for the trigger before starting the clock on a future request", () => {
    const matter = guardianship({ appointmentDate: "2025-09-15" });
    const event = eventFor(matter, {
      trigger: "appointment_anniversary",
      triggerOn: "2026-09-15",
      stage: "wip",
    });
    const [p] = project(stateWith([matter], [event]), TODAY);
    expect(p.expectedOn > "2026-09-15").toBe(true);
  });

  it("leaves out money already received", () => {
    const matter = guardianship();
    const event = eventFor(matter, { stage: "received", receivedOn: TODAY, receivedAmount: 5_000 });
    expect(project(stateWith([matter], [event]), TODAY)).toHaveLength(0);
  });

  it("leaves out closed matters", () => {
    const matter = guardianship({ status: "closed" });
    expect(project(stateWith([matter], [eventFor(matter)]), TODAY)).toHaveLength(0);
  });

  it("orders the pipeline by when the cash lands", () => {
    const matter = guardianship({ weAreFiduciary: true });
    const near = eventFor(matter, {
      stage: "order_entered",
      history: [{ stage: "order_entered", enteredOn: TODAY }],
    });
    const far = eventFor(matter, { stage: "wip", triggerOn: "2027-01-01" });
    const projections = project(stateWith([matter], [far, near]), TODAY);
    expect(projections.map((p) => p.event.id)).toEqual([near.id, far.id]);
  });
});

describe("weekBuckets", () => {
  const matter = guardianship({ weAreFiduciary: true });

  it("opens on the Monday of the current week", () => {
    const buckets = weekBuckets([], TODAY);
    expect(buckets[0].start).toBe("2026-03-02");
    expect(buckets[0].end).toBe("2026-03-08");
    expect(buckets).toHaveLength(13);
  });

  it("drops the cash into the week it is expected", () => {
    const event = eventFor(matter, {
      stage: "order_entered",
      history: [{ stage: "order_entered", enteredOn: TODAY }],
    });
    const buckets = weekBuckets(project(stateWith([matter], [event]), TODAY), TODAY);
    const funded = buckets.filter((b) => b.total > 0);
    expect(funded).toHaveLength(1);
    expect(funded[0].total).toBe(6_000);
    expect(funded[0].byConfidence.committed).toBe(6_000);
  });

  it("pulls anything already past due into the current week", () => {
    // A request whose whole expected pipeline elapsed months ago.
    const event = eventFor(matter, {
      stage: "payment_requested",
      history: [{ stage: "payment_requested", enteredOn: "2025-11-01" }],
    });
    const buckets = weekBuckets(project(stateWith([matter], [event]), TODAY), TODAY);
    expect(buckets[0].total).toBe(6_000);
  });

  it("ignores cash landing past the horizon", () => {
    const event = eventFor(matter, { stage: "wip", triggerOn: "2029-01-01" });
    const buckets = weekBuckets(project(stateWith([matter], [event]), TODAY), TODAY);
    expect(buckets.every((b) => b.total === 0)).toBe(true);
  });
});

describe("monthBuckets", () => {
  it("covers twelve months from this one", () => {
    const buckets = monthBuckets([], TODAY);
    expect(buckets[0].key).toBe("2026-03");
    expect(buckets[buckets.length - 1].key).toBe("2027-02");
  });

  it("catches a request the weekly horizon is too short for", () => {
    const matter = guardianship();
    const event = eventFor(matter, { stage: "wip", triggerOn: "2026-11-01" });
    const buckets = monthBuckets(project(stateWith([matter], [event]), TODAY), TODAY);
    expect(buckets.some((b) => b.total > 0)).toBe(true);
  });
});

describe("totals", () => {
  it("splits the pipeline by how firm the money is", () => {
    const matter = guardianship({ weAreFiduciary: true });
    const ordered = eventFor(matter, {
      stage: "order_entered",
      history: [{ stage: "order_entered", enteredOn: TODAY }],
    });
    const early = eventFor(matter, { stage: "billing_prep", hours: 10 });
    const t = totals(stateWith([matter], [ordered, early]), TODAY);
    expect(t.committed).toBe(6_000);
    expect(t.early).toBe(3_000);
    expect(t.pipeline).toBe(9_000);
  });

  it("counts what came in this calendar year", () => {
    const matter = guardianship();
    const events = [
      eventFor(matter, { stage: "received", receivedOn: "2026-01-15", receivedAmount: 4_000 }),
      eventFor(matter, { stage: "received", receivedOn: "2025-12-15", receivedAmount: 9_000 }),
    ];
    expect(totals(stateWith([matter], events), TODAY).collectedYtd).toBe(4_000);
  });
});

describe("worklist", () => {
  it("flags a request that became billable and never moved", () => {
    const matter = guardianship();
    const event = eventFor(matter, { stage: "wip", triggerOn: "2026-02-01" });
    const [item] = worklist(stateWith([matter], [event]), TODAY);
    expect(item.kind).toBe("trigger_met");
    expect(item.days).toBe(29);
  });

  it("marks a trigger that has not arrived as nothing to do yet", () => {
    const matter = guardianship();
    const event = eventFor(matter, { stage: "wip", triggerOn: "2026-06-01" });
    const [item] = worklist(stateWith([matter], [event]), TODAY);
    expect(item.kind).toBe("upcoming");
  });

  it("flags our own blown deadline", () => {
    const matter = guardianship();
    const event = eventFor(matter, {
      stage: "billing_prep",
      history: [{ stage: "billing_prep", enteredOn: "2026-02-01" }],
    });
    const [item] = worklist(stateWith([matter], [event]), TODAY);
    expect(item.kind).toBe("past_target");
    expect(item.detail).toContain("past our");
  });

  it("tells us to chase consents that have been out too long", () => {
    const matter = { ...blankMatter("probate"), parties: [{ id: "a", name: "A", sharePct: 0 }] };
    const event = eventFor(matter, {
      route: "waivers",
      stage: "waivers_out",
      history: [{ stage: "waivers_out", enteredOn: "2026-01-01" }],
    });
    const [item] = worklist(stateWith([matter], [event]), TODAY);
    expect(item.kind).toBe("chase_waivers");
    expect(item.detail).toContain("0% consented");
  });

  it("flags a court that has gone quiet past its usual wait", () => {
    const matter = guardianship();
    const event = eventFor(matter, {
      route: "hearing",
      stage: "awaiting_court",
      history: [{ stage: "awaiting_court", enteredOn: "2025-10-01" }],
    });
    const [item] = worklist(stateWith([matter], [event]), TODAY);
    expect(item.kind).toBe("stalled");
  });

  it("stays quiet about a court still inside its usual wait", () => {
    const matter = guardianship();
    const event = eventFor(matter, {
      route: "hearing",
      stage: "awaiting_court",
      history: [{ stage: "awaiting_court", enteredOn: "2026-02-25" }],
    });
    expect(worklist(stateWith([matter], [event]), TODAY)).toHaveLength(0);
  });

  it("puts our own delays above other people's", () => {
    const matter = guardianship();
    const stalled = eventFor(matter, {
      route: "hearing",
      stage: "awaiting_court",
      history: [{ stage: "awaiting_court", enteredOn: "2025-10-01" }],
    });
    const ours = eventFor(matter, {
      stage: "billing_prep",
      history: [{ stage: "billing_prep", enteredOn: "2026-02-20" }],
    });
    const kinds = worklist(stateWith([matter], [stalled, ours]), TODAY).map((i) => i.kind);
    expect(kinds).toEqual(["past_target", "stalled"]);
  });
});
