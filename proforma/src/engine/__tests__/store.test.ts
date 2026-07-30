import { describe, expect, it } from "vitest";
import {
  blankEvent,
  blankMatter,
  emptyState,
  migrate,
  missingAnniversaries,
  reduce,
} from "../store.ts";
import {
  PAYMENT_OURS,
  PAYMENT_THEIRS,
  measureWaits,
  targetPerformance,
} from "../cycletime.ts";
import { defaultSettings } from "../config.ts";
import type { AppState, BillingEvent, Matter } from "../types.ts";

const TODAY = "2026-03-02";
const settings = defaultSettings();

function withMatter(matter: Matter, events: BillingEvent[] = []): AppState {
  return { ...emptyState(), matters: [matter], events };
}

describe("blankEvent", () => {
  it("sends probate down the waiver route", () => {
    const matter = blankMatter("probate");
    const event = blankEvent(matter, settings);
    expect(event.route).toBe("waivers");
    expect(event.feeBasis).toBe("hourly");
    expect(event.trigger).toBe("estate_closing");
  });

  it("puts a guardianship of the estate on the percentage comparison", () => {
    const matter = { ...blankMatter("guardianship"), guardianshipOfEstate: true };
    const event = blankEvent(matter, settings);
    expect(event.route).toBe("hearing");
    expect(event.feeBasis).toBe("fiduciary_vs_hourly");
    expect(event.trigger).toBe("inventory_filed");
  });

  it("starts in WIP with an open history entry", () => {
    const event = blankEvent(blankMatter("probate"), settings);
    expect(event.stage).toBe("wip");
    expect(event.history).toHaveLength(1);
    expect(event.history[0].exitedOn).toBeUndefined();
  });
});

describe("missingAnniversaries", () => {
  const matter = {
    ...blankMatter("guardianship"),
    openedOn: "2024-01-01",
    appointmentDate: "2025-09-15",
  };

  it("lists the anniversary billing dates inside the horizon", () => {
    expect(missingAnniversaries(matter, [], TODAY, 18)).toEqual(["2026-09-15"]);
  });

  it("reaches further out when asked", () => {
    expect(missingAnniversaries(matter, [], TODAY, 36)).toEqual([
      "2026-09-15",
      "2027-09-15",
      "2028-09-15",
    ]);
  });

  it("surfaces anniversaries that already passed unbilled", () => {
    const old = { ...matter, appointmentDate: "2023-05-10" };
    expect(missingAnniversaries(old, [], TODAY, 18)).toEqual([
      "2024-05-10",
      "2025-05-10",
      "2026-05-10",
      "2027-05-10",
    ]);
  });

  it("skips anniversaries already on the books", () => {
    const existing: BillingEvent = {
      ...blankEvent(matter, settings),
      trigger: "appointment_anniversary",
      triggerOn: "2026-09-15",
    };
    expect(missingAnniversaries(matter, [existing], TODAY, 18)).toEqual([]);
  });

  it("says nothing about a matter with no appointment date", () => {
    const noDate = { ...matter, appointmentDate: undefined };
    expect(missingAnniversaries(noDate, [], TODAY, 36)).toEqual([]);
  });

  it("says nothing about a probate estate", () => {
    const probate = { ...matter, matterType: "probate" as const };
    expect(missingAnniversaries(probate, [], TODAY, 36)).toEqual([]);
  });

  it("says nothing about a closed guardianship", () => {
    const closed = { ...matter, status: "closed" as const };
    expect(missingAnniversaries(closed, [], TODAY, 36)).toEqual([]);
  });
});

describe("reduce", () => {
  it("takes a matter's events with it when the matter goes", () => {
    const matter = blankMatter("probate");
    const state = withMatter(matter, [blankEvent(matter, settings)]);
    const next = reduce(state, { type: "DELETE_MATTER", id: matter.id });
    expect(next.matters).toHaveLength(0);
    expect(next.events).toHaveLength(0);
  });

  it("records a consent against a party with no waiver row yet", () => {
    const matter = { ...blankMatter("probate"), parties: [{ id: "a", name: "A", sharePct: 0 }] };
    const event = blankEvent(matter, settings);
    const next = reduce(withMatter(matter, [event]), {
      type: "SET_WAIVER",
      eventId: event.id,
      partyId: "a",
      patch: { consentedOn: "2026-03-01" },
    });
    expect(next.events[0].waivers).toEqual([
      { partyId: "a", objected: false, consentedOn: "2026-03-01" },
    ]);
  });

  it("updates a waiver row that already exists", () => {
    const matter = { ...blankMatter("probate"), parties: [{ id: "a", name: "A", sharePct: 0 }] };
    const event = {
      ...blankEvent(matter, settings),
      waivers: [{ partyId: "a", sentOn: "2026-02-01", objected: false }],
    };
    const next = reduce(withMatter(matter, [event]), {
      type: "SET_WAIVER",
      eventId: event.id,
      partyId: "a",
      patch: { consentedOn: "2026-03-01" },
    });
    expect(next.events[0].waivers[0]).toEqual({
      partyId: "a",
      sentOn: "2026-02-01",
      objected: false,
      consentedOn: "2026-03-01",
    });
  });

  it("clears a removed party's waivers off every request", () => {
    const matter = { ...blankMatter("probate"), parties: [{ id: "a", name: "A", sharePct: 0 }] };
    const event = {
      ...blankEvent(matter, settings),
      waivers: [{ partyId: "a", objected: false, consentedOn: "2026-03-01" }],
    };
    const next = reduce(withMatter(matter, [event]), {
      type: "REMOVE_PARTY",
      matterId: matter.id,
      partyId: "a",
    });
    expect(next.matters[0].parties).toHaveLength(0);
    expect(next.events[0].waivers).toHaveLength(0);
  });

  it("closes out the pipeline when the money arrives", () => {
    const matter = blankMatter("guardianship");
    const event = { ...blankEvent(matter, settings), stage: "order_entered" as const };
    const next = reduce(withMatter(matter, [event]), {
      type: "RECEIVE",
      id: event.id,
      on: "2026-03-02",
      amount: 4_250,
    });
    expect(next.events[0].stage).toBe("received");
    expect(next.events[0].receivedOn).toBe("2026-03-02");
    expect(next.events[0].receivedAmount).toBe(4_250);
  });

  it("recomputes the extraordinary component from the time actually billed", () => {
    const matter = {
      ...blankMatter("guardianship"),
      guardianshipOfEstate: true,
      estateValue: 200_000,
    };
    const state: AppState = {
      ...withMatter(matter, []),
      settings: { ...settings, fiduciaryTiers: [{ upTo: null, rate: 0.025 }] },
    };
    const event = {
      ...blankEvent(matter, settings),
      feeBasis: "fiduciary_vs_hourly" as const,
      hours: 30,
      rate: 300,
    };
    const next = reduce(
      { ...state, events: [event] },
      { type: "SYNC_EXTRAORDINARY", id: event.id },
    );
    // 9,000 of time against a 5,000 percentage fee leaves 4,000 extraordinary.
    expect(next.events[0].extraordinary).toBeCloseTo(4_000);
  });
});

describe("migrate", () => {
  it("gives an empty state back for junk", () => {
    const state = migrate(null);
    expect(state.matters).toEqual([]);
    expect(state.settings.waiverThresholdPct).toBe(51);
  });

  it("backfills settings added after a file was saved", () => {
    const state = migrate({ version: 1, matters: [], events: [], settings: { defaultRate: 400 } });
    expect(state.settings.defaultRate).toBe(400);
    expect(state.settings.minSamplesToLearn).toBe(3);
  });

  it("gives a stage-less event a history to start from", () => {
    const state = migrate({
      matters: [],
      events: [{ id: "e1", stage: "filed", triggerOn: "2026-01-01" }],
    });
    expect(state.events[0].history).toEqual([{ stage: "filed", enteredOn: "2026-01-01" }]);
    expect(state.events[0].waivers).toEqual([]);
  });
});

describe("cycle time reporting", () => {
  const matter = blankMatter("guardianship");

  it("summarises completed passes through a stage", () => {
    const event: BillingEvent = {
      ...blankEvent(matter, settings),
      history: [
        { stage: "awaiting_court", enteredOn: "2026-01-01", exitedOn: "2026-01-11" },
        { stage: "awaiting_court", enteredOn: "2026-02-01", exitedOn: "2026-02-21" },
        { stage: "awaiting_court", enteredOn: "2026-03-01" },
      ],
    };
    const measured = measureWaits([event], [matter]);
    expect(measured.awaiting_court).toMatchObject({
      samples: 2,
      meanDays: 15,
      minDays: 10,
      maxDays: 20,
    });
  });

  it("keeps our own payment wait out of the outside waits", () => {
    const ours = { ...blankMatter("guardianship"), id: "m-ours", weAreFiduciary: true };
    const theirs = { ...blankMatter("guardianship"), id: "m-theirs", weAreFiduciary: false };
    const pay = (matter: Matter, enteredOn: string, exitedOn: string): BillingEvent => ({
      ...blankEvent(matter, settings),
      matterId: matter.id,
      history: [{ stage: "payment_requested", enteredOn, exitedOn }],
    });
    const measured = measureWaits(
      [pay(ours, "2026-01-01", "2026-01-04"), pay(theirs, "2026-01-01", "2026-03-01")],
      [ours, theirs],
    );
    // The 3-day self-written check must not drag the client cohort's average down.
    expect(measured[PAYMENT_THEIRS]).toMatchObject({ samples: 1, meanDays: 59 });
    expect(measured[PAYMENT_OURS]).toBeUndefined();
    expect(measured.payment_requested).toBeUndefined();
  });

  it("scores our own payment wait against our target instead", () => {
    const ours = { ...blankMatter("guardianship"), weAreFiduciary: true };
    const event: BillingEvent = {
      ...blankEvent(ours, settings),
      history: [{ stage: "payment_requested", enteredOn: "2026-01-01", exitedOn: "2026-01-04" }],
    };
    const [row] = targetPerformance([event], [ours], settings.targets);
    expect(row).toMatchObject({ stage: "payment_requested", samples: 1, withinTarget: 1 });
  });

  it("scores us against our own targets", () => {
    const event: BillingEvent = {
      ...blankEvent(matter, settings),
      history: [
        { stage: "billing_prep", enteredOn: "2026-01-01", exitedOn: "2026-01-04" },
        { stage: "billing_prep", enteredOn: "2026-02-01", exitedOn: "2026-02-25" },
      ],
    };
    const [row] = targetPerformance([event], [matter], settings.targets);
    expect(row).toMatchObject({ samples: 2, withinTarget: 1, targetDays: 7 });
  });
});
