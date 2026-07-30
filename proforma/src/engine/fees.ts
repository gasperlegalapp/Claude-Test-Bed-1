import type { BillingEvent, FiduciaryTier, Matter, Settings } from "./types.ts";

/**
 * Tiered fiduciary fee on a value, applied marginally: each bracket's rate
 * covers only the portion of the value that falls inside it.
 */
export function fiduciaryFee(value: number, tiers: FiduciaryTier[]): number {
  let remaining = Math.max(0, value);
  let floor = 0;
  let fee = 0;
  for (const tier of tiers) {
    if (remaining <= 0) break;
    const width = tier.upTo === null ? remaining : Math.max(0, tier.upTo - floor);
    const slice = Math.min(remaining, width);
    fee += slice * tier.rate;
    remaining -= slice;
    if (tier.upTo !== null) floor = tier.upTo;
  }
  return fee;
}

export interface FeeBreakdown {
  /** Time value: hours at the rate. */
  hourly: number;
  /** Ordinary fiduciary fee from the percentage schedule, if it applies. */
  fiduciary: number | null;
  /** Extraordinary component petitioned on top of the ordinary fee. */
  extraordinary: number;
  /** Fees only, before expenses. */
  fees: number;
  costs: number;
  /** What we are asking for, all in. */
  requested: number;
  /** True when the number was typed in rather than computed. */
  overridden: boolean;
}

/**
 * On the fiduciary basis, hourly is a floor rather than the bill: the ordinary
 * percentage fee goes in the petition, and where hourly runs past it the excess
 * is claimed as extraordinary. Below the percentage, the percentage stands.
 */
export function suggestedExtraordinary(hourly: number, fiduciary: number): number {
  return Math.max(0, hourly - fiduciary);
}

export function computeFee(
  event: BillingEvent,
  matter: Matter,
  settings: Settings,
): FeeBreakdown {
  const hourly = event.hours * event.rate;
  const costs = event.costs;

  if (event.feeBasis === "hourly") {
    const requested = event.requestedOverride ?? hourly + costs;
    return {
      hourly,
      fiduciary: null,
      extraordinary: 0,
      fees: requested - costs,
      costs,
      requested,
      overridden: event.requestedOverride !== undefined,
    };
  }

  const basis = event.estateValueOverride ?? matter.estateValue ?? 0;
  const fiduciary = fiduciaryFee(basis, settings.fiduciaryTiers);
  const extraordinary = hourly > fiduciary ? event.extraordinary : 0;
  const fees = fiduciary + extraordinary;
  const requested = event.requestedOverride ?? fees + costs;
  return {
    hourly,
    fiduciary,
    extraordinary,
    fees: requested - costs,
    costs,
    requested,
    overridden: event.requestedOverride !== undefined,
  };
}

/**
 * What to put in the forecast. Cash already received is fact; an award is the
 * court's number; anything earlier is our ask, optionally discounted.
 */
export function forecastAmount(
  event: BillingEvent,
  matter: Matter,
  settings: Settings,
): number {
  if (event.receivedAmount !== undefined) return event.receivedAmount;
  if (event.approvedAmount !== undefined) return event.approvedAmount;
  const requested = computeFee(event, matter, settings).requested;
  return requested * (1 - settings.approvalHaircutPct / 100);
}
