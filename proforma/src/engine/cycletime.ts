import { daysBetween } from "./dates.ts";
import { stageControl } from "./config.ts";
import type { BillingEvent, Matter, Stage } from "./types.ts";

export interface StageSample {
  meanDays: number;
  medianDays: number;
  minDays: number;
  maxDays: number;
  samples: number;
}

export type MeasuredWaits = Record<string, StageSample | undefined>;

/**
 * Waiting on a check we write ourselves and waiting on a client's guardian to
 * write one are two different processes, so they are measured apart. Averaging
 * them would flatter the slow one and slander the fast one.
 */
export function waitKey(stage: Stage, matter: Matter): string {
  if (stage !== "payment_requested") return stage;
  return matter.weAreFiduciary ? "payment_requested:ours" : "payment_requested:theirs";
}

export const PAYMENT_OURS = "payment_requested:ours";
export const PAYMENT_THEIRS = "payment_requested:theirs";

function summarise(days: number[]): StageSample {
  const sorted = [...days].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return {
    meanDays: sorted.reduce((a, b) => a + b, 0) / sorted.length,
    medianDays: sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2,
    minDays: sorted[0],
    maxDays: sorted[sorted.length - 1],
    samples: sorted.length,
  };
}

function collect(
  events: BillingEvent[],
  matters: Matter[],
  keep: (stage: Stage, matter: Matter) => boolean,
  key: (stage: Stage, matter: Matter) => string,
): Map<string, number[]> {
  const byId = new Map(matters.map((m) => [m.id, m]));
  const buckets = new Map<string, number[]>();

  for (const event of events) {
    const matter = byId.get(event.matterId);
    if (!matter) continue;
    for (const entry of event.history) {
      if (!entry.exitedOn || !keep(entry.stage, matter)) continue;
      const days = daysBetween(entry.enteredOn, entry.exitedOn);
      if (days < 0) continue;
      const bucket = key(entry.stage, matter);
      buckets.set(bucket, [...(buckets.get(bucket) ?? []), days]);
    }
  }
  return buckets;
}

/**
 * What the waits outside our control actually ran, drawn from completed passes.
 * We can't make a court rule faster, but we can stop guessing how long it takes.
 */
export function measureWaits(events: BillingEvent[], matters: Matter[]): MeasuredWaits {
  const buckets = collect(
    events,
    matters,
    (stage, matter) => stageControl(stage, matter) === "theirs",
    waitKey,
  );
  const out: MeasuredWaits = {};
  for (const [key, days] of buckets) out[key] = summarise(days);
  return out;
}

export interface TargetPerformance {
  stage: Stage;
  meanDays: number;
  targetDays: number;
  withinTarget: number;
  samples: number;
}

/**
 * How well we held to our own targets. Separate from the waits above on
 * purpose: these are the only numbers we can actually move.
 */
export function targetPerformance(
  events: BillingEvent[],
  matters: Matter[],
  targets: Record<Stage, number>,
): TargetPerformance[] {
  const buckets = collect(
    events,
    matters,
    (stage, matter) => stageControl(stage, matter) === "ours" && targets[stage] > 0,
    (stage) => stage,
  );

  const rows: TargetPerformance[] = [];
  for (const [key, days] of buckets) {
    const stage = key as Stage;
    const summary = summarise(days);
    rows.push({
      stage,
      meanDays: summary.meanDays,
      targetDays: targets[stage],
      withinTarget: days.filter((d) => d <= targets[stage]).length,
      samples: summary.samples,
    });
  }
  return rows;
}
