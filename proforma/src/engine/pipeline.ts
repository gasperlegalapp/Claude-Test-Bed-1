import { daysBetween } from "./dates.ts";
import { UNTIMED_STAGES, stageControl, stagesFor } from "./config.ts";
import type { BillingEvent, Matter, Settings, Stage } from "./types.ts";
import { waitKey, type MeasuredWaits } from "./cycletime.ts";

/**
 * Share of the estate that has consented. Parties left at a 0 share are
 * treated as equal shares, so a plain headcount threshold works without
 * anyone having to type percentages.
 */
export function consentPct(event: BillingEvent, matter: Matter): number {
  const parties = matter.parties;
  if (parties.length === 0) return 0;
  const declared = parties.reduce((sum, p) => sum + p.sharePct, 0);
  const consented = new Set(
    event.waivers.filter((w) => w.consentedOn && !w.objected).map((w) => w.partyId),
  );
  if (declared <= 0) {
    const hits = parties.filter((p) => consented.has(p.id)).length;
    return (hits / parties.length) * 100;
  }
  const share = parties
    .filter((p) => consented.has(p.id))
    .reduce((sum, p) => sum + p.sharePct, 0);
  return (share / declared) * 100;
}

/** Enough consents in hand to be paid without a hearing. */
export function waiverGateMet(
  event: BillingEvent,
  matter: Matter,
  settings: Settings,
): boolean {
  return consentPct(event, matter) >= settings.waiverThresholdPct;
}

export function stageIndex(event: BillingEvent): number {
  return stagesFor(event.route).indexOf(event.stage);
}

export function nextStage(event: BillingEvent): Stage | null {
  const stages = stagesFor(event.route);
  const i = stages.indexOf(event.stage);
  return i >= 0 && i < stages.length - 1 ? stages[i + 1] : null;
}

/**
 * Why the event cannot move on yet, or null if it can. The only hard gate is
 * the consent threshold: filing on the waiver route without 51% is the mistake
 * worth catching.
 */
export function advanceBlockedBy(
  event: BillingEvent,
  matter: Matter,
  settings: Settings,
): string | null {
  if (event.stage === "waivers_out" && !waiverGateMet(event, matter, settings)) {
    const have = Math.round(consentPct(event, matter));
    return `${have}% consented, need ${settings.waiverThresholdPct}%`;
  }
  return null;
}

export function advanceTo(event: BillingEvent, stage: Stage, on: string): BillingEvent {
  const history = event.history.map((h) =>
    h.stage === event.stage && !h.exitedOn ? { ...h, exitedOn: on } : h,
  );
  history.push({ stage, enteredOn: on });
  return {
    ...event,
    stage,
    history,
    receivedOn: stage === "received" ? on : undefined,
  };
}

export function stageEnteredOn(event: BillingEvent): string {
  for (let i = event.history.length - 1; i >= 0; i--) {
    if (event.history[i].stage === event.stage) return event.history[i].enteredOn;
  }
  return event.triggerOn;
}

export function daysInStage(event: BillingEvent, today: string): number {
  return Math.max(0, daysBetween(stageEnteredOn(event), today));
}

/** The clock we hold ourselves to, or null where we don't set the pace. */
export function targetDays(
  stage: Stage,
  matter: Matter,
  settings: Settings,
): number | null {
  if (UNTIMED_STAGES.has(stage)) return null;
  if (stageControl(stage, matter) !== "ours") return null;
  const days = settings.targets[stage];
  return days > 0 ? days : null;
}

/** Days past our own deadline. 0 when on time or when the wait isn't ours. */
export function overdueDays(
  event: BillingEvent,
  matter: Matter,
  settings: Settings,
  today: string,
): number {
  const target = targetDays(event.stage, matter, settings);
  if (target === null) return 0;
  return Math.max(0, daysInStage(event, today) - target);
}

/**
 * How long this stage should take. Ours: the target we set. Theirs: what we've
 * actually measured, once there's enough history to believe it, otherwise the
 * placeholder assumption.
 */
export function expectedStageDays(
  stage: Stage,
  matter: Matter,
  settings: Settings,
  measured: MeasuredWaits,
): number {
  if (UNTIMED_STAGES.has(stage)) return 0;
  if (stageControl(stage, matter) === "ours") return settings.targets[stage];
  const sample = measured[waitKey(stage, matter)];
  if (sample && sample.samples >= settings.minSamplesToLearn) {
    return Math.round(sample.meanDays);
  }
  return settings.assumedWaits[stage];
}

/** True when the expected wait came from our own recorded history. */
export function expectationIsMeasured(
  stage: Stage,
  matter: Matter,
  settings: Settings,
  measured: MeasuredWaits,
): boolean {
  if (stageControl(stage, matter) === "ours") return false;
  const sample = measured[waitKey(stage, matter)];
  return !!sample && sample.samples >= settings.minSamplesToLearn;
}

/**
 * Days from today until the cash lands: whatever is left of the current stage,
 * plus the full expected run of every stage after it.
 */
export function daysToCash(
  event: BillingEvent,
  matter: Matter,
  settings: Settings,
  measured: MeasuredWaits,
  today: string,
): number {
  if (event.stage === "received") return 0;
  const stages = stagesFor(event.route);
  const i = stages.indexOf(event.stage);
  if (i < 0) return 0;

  const currentExpected = expectedStageDays(event.stage, matter, settings, measured);
  let total = Math.max(0, currentExpected - daysInStage(event, today));

  for (let j = i + 1; j < stages.length; j++) {
    total += expectedStageDays(stages[j], matter, settings, measured);
  }
  return total;
}
