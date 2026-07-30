import { describe, expect, it } from "vitest";
import { computeFee, fiduciaryFee, forecastAmount, suggestedExtraordinary } from "../fees.ts";
import { defaultSettings } from "../config.ts";
import { blankEvent, blankMatter } from "../store.ts";
import type { BillingEvent, Matter } from "../types.ts";

const settings = defaultSettings();
const tiers = [
  { upTo: 100_000, rate: 0.03 },
  { upTo: 500_000, rate: 0.02 },
  { upTo: null, rate: 0.01 },
];

function guardianship(estateValue: number): Matter {
  return {
    ...blankMatter("guardianship"),
    guardianshipOfEstate: true,
    estateValue,
  };
}

function event(matter: Matter, patch: Partial<BillingEvent> = {}): BillingEvent {
  return { ...blankEvent(matter, settings), ...patch };
}

describe("fiduciaryFee", () => {
  it("applies each bracket only to the value inside it", () => {
    // 100k at 3% = 3,000; the next 100k at 2% = 2,000.
    expect(fiduciaryFee(200_000, tiers)).toBeCloseTo(5_000);
  });

  it("stops at the value, not the bracket", () => {
    expect(fiduciaryFee(50_000, tiers)).toBeCloseTo(1_500);
  });

  it("runs the open top bracket on everything above it", () => {
    // 3,000 + 8,000 (400k at 2%) + 5,000 (500k at 1%).
    expect(fiduciaryFee(1_000_000, tiers)).toBeCloseTo(16_000);
  });

  it("is zero for an empty or negative estate", () => {
    expect(fiduciaryFee(0, tiers)).toBe(0);
    expect(fiduciaryFee(-5_000, tiers)).toBe(0);
  });
});

describe("computeFee on the hourly basis", () => {
  it("bills time plus advanced costs", () => {
    const matter = blankMatter("probate");
    const fee = computeFee(
      event(matter, { feeBasis: "hourly", hours: 10, rate: 300, costs: 450 }),
      matter,
      settings,
    );
    expect(fee.hourly).toBe(3_000);
    expect(fee.fiduciary).toBeNull();
    expect(fee.requested).toBe(3_450);
  });

  it("honours a typed-in figure over the computed one", () => {
    const matter = blankMatter("probate");
    const fee = computeFee(
      event(matter, { feeBasis: "hourly", hours: 10, rate: 300, requestedOverride: 2_000 }),
      matter,
      settings,
    );
    expect(fee.requested).toBe(2_000);
    expect(fee.overridden).toBe(true);
  });
});

describe("computeFee on the fiduciary basis", () => {
  const local = { ...settings, fiduciaryTiers: tiers };

  it("asks for the percentage alone when hourly comes in under it", () => {
    const matter = guardianship(200_000); // percentage fee is 5,000
    const fee = computeFee(
      event(matter, { feeBasis: "fiduciary_vs_hourly", hours: 10, rate: 300 }),
      matter,
      local,
    );
    expect(fee.fiduciary).toBeCloseTo(5_000);
    expect(fee.extraordinary).toBe(0);
    expect(fee.requested).toBeCloseTo(5_000);
  });

  it("adds the extraordinary component when hourly runs past the percentage", () => {
    const matter = guardianship(200_000);
    const hours = 30;
    const rate = 300; // 9,000 of time against a 5,000 percentage fee
    const extraordinary = suggestedExtraordinary(hours * rate, 5_000);
    expect(extraordinary).toBeCloseTo(4_000);

    const fee = computeFee(
      event(matter, { feeBasis: "fiduciary_vs_hourly", hours, rate, extraordinary }),
      matter,
      local,
    );
    expect(fee.requested).toBeCloseTo(9_000);
  });

  it("drops the extraordinary component if time no longer justifies it", () => {
    const matter = guardianship(200_000);
    const fee = computeFee(
      event(matter, {
        feeBasis: "fiduciary_vs_hourly",
        hours: 5,
        rate: 300,
        extraordinary: 4_000,
      }),
      matter,
      local,
    );
    expect(fee.extraordinary).toBe(0);
    expect(fee.requested).toBeCloseTo(5_000);
  });

  it("prefers a per-request estate value over the matter's", () => {
    const matter = guardianship(200_000);
    const fee = computeFee(
      event(matter, { feeBasis: "fiduciary_vs_hourly", estateValueOverride: 50_000 }),
      matter,
      local,
    );
    expect(fee.fiduciary).toBeCloseTo(1_500);
  });
});

describe("forecastAmount", () => {
  const matter = blankMatter("probate");
  const base = event(matter, { feeBasis: "hourly", hours: 10, rate: 400 });

  it("uses cash actually received above all else", () => {
    const e = { ...base, approvedAmount: 3_500, receivedAmount: 3_400 };
    expect(forecastAmount(e, matter, settings)).toBe(3_400);
  });

  it("uses the award once a court has set one", () => {
    expect(forecastAmount({ ...base, approvedAmount: 3_500 }, matter, settings)).toBe(3_500);
  });

  it("discounts an unapproved request by the configured haircut", () => {
    const haircut = { ...settings, approvalHaircutPct: 10 };
    expect(forecastAmount(base, matter, haircut)).toBeCloseTo(3_600);
  });
});
