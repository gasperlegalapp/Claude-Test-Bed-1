import { describe, expect, it } from "vitest";
import {
  advanceBlockedBy,
  advanceTo,
  consentPct,
  daysInStage,
  daysToCash,
  expectationIsMeasured,
  expectedStageDays,
  nextStage,
  overdueDays,
  targetDays,
} from "../pipeline.ts";
import { measureWaits } from "../cycletime.ts";
import { defaultSettings, stagesFor } from "../config.ts";
import { blankEvent, blankMatter } from "../store.ts";
import type { BillingEvent, Matter, Party } from "../types.ts";

const settings = defaultSettings();

function party(id: string, sharePct = 0): Party {
  return { id, name: id, sharePct };
}

function probateMatter(parties: Party[]): Matter {
  return { ...blankMatter("probate"), parties };
}

function eventFor(matter: Matter, patch: Partial<BillingEvent> = {}): BillingEvent {
  return { ...blankEvent(matter, settings), ...patch };
}

describe("consentPct", () => {
  it("counts heads when no shares are entered", () => {
    const matter = probateMatter([party("a"), party("b"), party("c"), party("d")]);
    const event = eventFor(matter, {
      waivers: [
        { partyId: "a", consentedOn: "2026-01-05", objected: false },
        { partyId: "b", consentedOn: "2026-01-06", objected: false },
      ],
    });
    expect(consentPct(event, matter)).toBeCloseTo(50);
  });

  it("weights by share when shares are entered", () => {
    const matter = probateMatter([party("a", 60), party("b", 20), party("c", 20)]);
    const event = eventFor(matter, {
      waivers: [{ partyId: "a", consentedOn: "2026-01-05", objected: false }],
    });
    expect(consentPct(event, matter)).toBeCloseTo(60);
  });

  it("does not count an objection as a consent", () => {
    const matter = probateMatter([party("a"), party("b")]);
    const event = eventFor(matter, {
      waivers: [{ partyId: "a", consentedOn: "2026-01-05", objected: true }],
    });
    expect(consentPct(event, matter)).toBe(0);
  });

  it("is zero with no next of kin on file", () => {
    const matter = probateMatter([]);
    expect(consentPct(eventFor(matter), matter)).toBe(0);
  });
});

describe("the waiver gate", () => {
  const matter = probateMatter([party("a"), party("b"), party("c")]);

  it("blocks filing below the threshold", () => {
    const event = eventFor(matter, {
      route: "waivers",
      stage: "waivers_out",
      waivers: [{ partyId: "a", consentedOn: "2026-01-05", objected: false }],
    });
    expect(advanceBlockedBy(event, matter, settings)).toBe("33% consented, need 51%");
  });

  it("clears once a majority has signed", () => {
    const event = eventFor(matter, {
      route: "waivers",
      stage: "waivers_out",
      waivers: [
        { partyId: "a", consentedOn: "2026-01-05", objected: false },
        { partyId: "b", consentedOn: "2026-01-06", objected: false },
      ],
    });
    expect(advanceBlockedBy(event, matter, settings)).toBeNull();
  });

  it("does not gate any other stage", () => {
    const event = eventFor(matter, { route: "waivers", stage: "billing_prep" });
    expect(advanceBlockedBy(event, matter, settings)).toBeNull();
  });
});

describe("routes", () => {
  it("gathers consents before filing on the waiver route", () => {
    const stages = stagesFor("waivers");
    expect(stages.indexOf("waivers_out")).toBeLessThan(stages.indexOf("filed"));
    expect(stages).not.toContain("hearing_set");
  });

  it("files first and waits to be heard on the hearing route", () => {
    const stages = stagesFor("hearing");
    expect(stages).toContain("hearing_set");
    expect(stages).not.toContain("waivers_out");
  });

  it("walks the route in order", () => {
    const matter = blankMatter("guardianship");
    const event = eventFor(matter, { route: "hearing", stage: "filed" });
    expect(nextStage(event)).toBe("awaiting_court");
  });

  it("has nowhere to go once received", () => {
    const matter = blankMatter("guardianship");
    expect(nextStage(eventFor(matter, { stage: "received" }))).toBeNull();
  });
});

describe("advanceTo", () => {
  it("closes the stage it leaves and opens the one it enters", () => {
    const matter = blankMatter("guardianship");
    const event = eventFor(matter, {
      stage: "filed",
      history: [
        { stage: "wip", enteredOn: "2026-01-01", exitedOn: "2026-02-01" },
        { stage: "filed", enteredOn: "2026-02-01" },
      ],
    });
    const moved = advanceTo(event, "awaiting_court", "2026-02-10");
    expect(moved.history.find((h) => h.stage === "filed")?.exitedOn).toBe("2026-02-10");
    expect(moved.history[moved.history.length - 1]).toEqual({
      stage: "awaiting_court",
      enteredOn: "2026-02-10",
    });
    expect(moved.stage).toBe("awaiting_court");
  });

  it("leaves the original untouched", () => {
    const matter = blankMatter("guardianship");
    const event = eventFor(matter, { stage: "filed" });
    advanceTo(event, "awaiting_court", "2026-02-10");
    expect(event.stage).toBe("filed");
  });

  it("stamps the received date on the way in", () => {
    const matter = blankMatter("guardianship");
    const moved = advanceTo(eventFor(matter, { stage: "order_entered" }), "received", "2026-03-01");
    expect(moved.receivedOn).toBe("2026-03-01");
  });
});

describe("targets and overdue", () => {
  const matter = blankMatter("guardianship");

  it("sets a clock on the stages we control", () => {
    expect(targetDays("billing_prep", matter, settings)).toBe(settings.targets.billing_prep);
  });

  it("sets no clock on a court's stage", () => {
    expect(targetDays("awaiting_court", matter, settings)).toBeNull();
  });

  it("sets no clock on work in progress", () => {
    expect(targetDays("wip", matter, settings)).toBeNull();
  });

  it("counts days past our own target", () => {
    const event = eventFor(matter, {
      stage: "billing_prep",
      history: [{ stage: "billing_prep", enteredOn: "2026-03-01" }],
    });
    expect(daysInStage(event, "2026-03-15")).toBe(14);
    expect(overdueDays(event, matter, settings, "2026-03-15")).toBe(
      14 - settings.targets.billing_prep,
    );
  });

  it("reports nothing overdue while inside the target", () => {
    const event = eventFor(matter, {
      stage: "billing_prep",
      history: [{ stage: "billing_prep", enteredOn: "2026-03-01" }],
    });
    expect(overdueDays(event, matter, settings, "2026-03-03")).toBe(0);
  });

  it("puts the payment wait on us when we hold the appointment", () => {
    const ours = { ...matter, weAreFiduciary: true };
    const theirs = { ...matter, weAreFiduciary: false };
    expect(targetDays("payment_requested", ours, settings)).toBe(
      settings.targets.payment_requested,
    );
    expect(targetDays("payment_requested", theirs, settings)).toBeNull();
  });
});

describe("expected stage duration", () => {
  const matter = blankMatter("guardianship");

  it("uses our target for stages we control", () => {
    expect(expectedStageDays("filed", matter, settings, {})).toBe(settings.targets.filed);
  });

  it("falls back to the placeholder until there is history", () => {
    expect(expectedStageDays("awaiting_court", matter, settings, {})).toBe(
      settings.assumedWaits.awaiting_court,
    );
    expect(expectationIsMeasured("awaiting_court", matter, settings, {})).toBe(false);
  });

  it("switches to the measured wait once enough passes are recorded", () => {
    const history = [
      { stage: "awaiting_court" as const, enteredOn: "2026-01-01", exitedOn: "2026-01-11" },
      { stage: "awaiting_court" as const, enteredOn: "2026-02-01", exitedOn: "2026-02-11" },
      { stage: "awaiting_court" as const, enteredOn: "2026-03-01", exitedOn: "2026-03-11" },
    ];
    const measured = measureWaits([eventFor(matter, { history })], [matter]);
    expect(measured.awaiting_court?.samples).toBe(3);
    expect(expectedStageDays("awaiting_court", matter, settings, measured)).toBe(10);
    expect(expectationIsMeasured("awaiting_court", matter, settings, measured)).toBe(true);
  });

  it("keeps the placeholder while the sample is too thin", () => {
    const measured = measureWaits(
      [
        eventFor(matter, {
          history: [
            { stage: "awaiting_court", enteredOn: "2026-01-01", exitedOn: "2026-01-11" },
          ],
        }),
      ],
      [matter],
    );
    expect(expectedStageDays("awaiting_court", matter, settings, measured)).toBe(
      settings.assumedWaits.awaiting_court,
    );
  });
});

describe("daysToCash", () => {
  const matter = blankMatter("guardianship");

  it("is zero for money already in the door", () => {
    expect(daysToCash(eventFor(matter, { stage: "received" }), matter, settings, {}, "2026-03-01")).toBe(0);
  });

  it("adds what is left of this stage to the full run of the rest", () => {
    const event = eventFor(matter, {
      route: "hearing",
      stage: "order_entered",
      history: [{ stage: "order_entered", enteredOn: "2026-03-01" }],
    });
    // 3 days of the order stage remain, then the whole payment wait.
    const remaining = settings.targets.order_entered - 1;
    expect(daysToCash(event, matter, settings, {}, "2026-03-02")).toBe(
      remaining + settings.assumedWaits.payment_requested,
    );
  });

  it("never counts a blown deadline as time still in hand", () => {
    const event = eventFor(matter, {
      route: "hearing",
      stage: "order_entered",
      history: [{ stage: "order_entered", enteredOn: "2026-01-01" }],
    });
    expect(daysToCash(event, matter, settings, {}, "2026-06-01")).toBe(
      settings.assumedWaits.payment_requested,
    );
  });

  it("is shorter when we can write our own check", () => {
    const base: Partial<BillingEvent> = {
      route: "hearing",
      stage: "order_entered",
      history: [{ stage: "order_entered", enteredOn: "2026-03-01" }],
    };
    const ours = { ...matter, weAreFiduciary: true };
    const theirs = { ...matter, weAreFiduciary: false };
    const oursDays = daysToCash(eventFor(ours, base), ours, settings, {}, "2026-03-01");
    const theirsDays = daysToCash(eventFor(theirs, base), theirs, settings, {}, "2026-03-01");
    expect(oursDays).toBeLessThan(theirsDays);
  });
});
