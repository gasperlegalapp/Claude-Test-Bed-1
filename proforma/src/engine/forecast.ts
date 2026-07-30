import { addDays, addMonths, daysBetween, monthKey, startOfMonth, startOfWeek } from "./dates.ts";
import { confidenceOf, stageControl } from "./config.ts";
import { forecastAmount } from "./fees.ts";
import {
  consentPct,
  daysInStage,
  daysToCash,
  expectedStageDays,
  overdueDays,
  targetDays,
} from "./pipeline.ts";
import { measureWaits, type MeasuredWaits } from "./cycletime.ts";
import type { AppState, BillingEvent, Confidence, Matter } from "./types.ts";

export interface Projection {
  event: BillingEvent;
  matter: Matter;
  amount: number;
  expectedOn: string;
  confidence: Confidence;
  daysOut: number;
}

function matterOf(state: AppState, event: BillingEvent): Matter | undefined {
  return state.matters.find((m) => m.id === event.matterId);
}

/**
 * When we expect the cash. An event whose trigger hasn't arrived yet — next
 * year's annual guardianship fee, say — can't start moving until it does, so
 * the pipeline clock starts at the trigger date rather than today.
 */
export function expectedCashDate(
  event: BillingEvent,
  matter: Matter,
  state: AppState,
  measured: MeasuredWaits,
  today: string,
): string {
  const start = event.stage === "wip" && event.triggerOn > today ? event.triggerOn : today;
  return addDays(start, daysToCash(event, matter, state.settings, measured, today));
}

export function project(state: AppState, today: string): Projection[] {
  const measured = measureWaits(state.events, state.matters);
  const out: Projection[] = [];
  for (const event of state.events) {
    if (event.stage === "received") continue;
    const matter = matterOf(state, event);
    if (!matter || matter.status === "closed") continue;
    const expectedOn = expectedCashDate(event, matter, state, measured, today);
    out.push({
      event,
      matter,
      amount: forecastAmount(event, matter, state.settings),
      expectedOn,
      confidence: confidenceOf(event.stage),
      daysOut: daysBetween(today, expectedOn),
    });
  }
  return out.sort((a, b) => a.expectedOn.localeCompare(b.expectedOn));
}

export interface Bucket {
  key: string;
  start: string;
  end: string;
  total: number;
  byConfidence: Record<Confidence, number>;
  count: number;
}

function emptyBucket(key: string, start: string, end: string): Bucket {
  return {
    key,
    start,
    end,
    total: 0,
    byConfidence: { committed: 0, probable: 0, early: 0 },
    count: 0,
  };
}

/** Rolling weekly buckets from the Monday of this week. Operating horizon. */
export function weekBuckets(
  projections: Projection[],
  today: string,
  weeks = 13,
): Bucket[] {
  const first = startOfWeek(today);
  const buckets: Bucket[] = [];
  for (let i = 0; i < weeks; i++) {
    const start = addDays(first, i * 7);
    buckets.push(emptyBucket(start, start, addDays(start, 6)));
  }
  const horizonEnd = addDays(first, weeks * 7 - 1);
  for (const p of projections) {
    // Anything already overdue is money we are owed now, not last week's news.
    const landing = p.expectedOn < first ? first : p.expectedOn;
    if (landing > horizonEnd) continue;
    const index = Math.floor(daysBetween(first, landing) / 7);
    add(buckets[index], p);
  }
  return buckets;
}

/** Monthly buckets from this month. Planning horizon. */
export function monthBuckets(
  projections: Projection[],
  today: string,
  months = 12,
): Bucket[] {
  const first = startOfMonth(today);
  const buckets: Bucket[] = [];
  const index = new Map<string, Bucket>();
  for (let i = 0; i < months; i++) {
    const start = addMonths(first, i);
    const end = addDays(addMonths(start, 1), -1);
    const bucket = emptyBucket(monthKey(start), start, end);
    buckets.push(bucket);
    index.set(bucket.key, bucket);
  }
  for (const p of projections) {
    const landing = p.expectedOn < first ? first : p.expectedOn;
    const bucket = index.get(monthKey(landing));
    if (bucket) add(bucket, p);
  }
  return buckets;
}

function add(bucket: Bucket, p: Projection): void {
  bucket.total += p.amount;
  bucket.byConfidence[p.confidence] += p.amount;
  bucket.count += 1;
}

export interface Totals {
  pipeline: number;
  committed: number;
  probable: number;
  early: number;
  collectedYtd: number;
  overdueCount: number;
}

export function totals(state: AppState, today: string): Totals {
  const projections = project(state, today);
  const year = today.slice(0, 4);
  const collectedYtd = state.events
    .filter((e) => e.receivedOn?.startsWith(year))
    .reduce((sum, e) => sum + (e.receivedAmount ?? 0), 0);

  return {
    pipeline: projections.reduce((s, p) => s + p.amount, 0),
    committed: sum(projections, "committed"),
    probable: sum(projections, "probable"),
    early: sum(projections, "early"),
    collectedYtd,
    overdueCount: worklist(state, today).filter((i) => i.kind !== "upcoming").length,
  };
}

function sum(projections: Projection[], confidence: Confidence): number {
  return projections
    .filter((p) => p.confidence === confidence)
    .reduce((s, p) => s + p.amount, 0);
}

export type WorkKind =
  | "trigger_met" // billable and nobody has started the package
  | "past_target" // sitting past the clock we set ourselves
  | "chase_waivers" // consents out longer than they should be
  | "stalled" // the court or the client has gone quiet
  | "upcoming"; // trigger is coming, nothing to do yet

export interface WorkItem {
  event: BillingEvent;
  matter: Matter;
  kind: WorkKind;
  days: number;
  detail: string;
  amount: number;
}

const WORK_ORDER: WorkKind[] = [
  "trigger_met",
  "past_target",
  "chase_waivers",
  "stalled",
  "upcoming",
];

/**
 * What to do this week to pull cash forward, split by whether the delay is ours
 * to fix or someone else's to be chased about.
 */
export function worklist(state: AppState, today: string): WorkItem[] {
  const measured = measureWaits(state.events, state.matters);
  const items: WorkItem[] = [];

  for (const event of state.events) {
    if (event.stage === "received") continue;
    const matter = matterOf(state, event);
    if (!matter || matter.status === "closed") continue;

    const amount = forecastAmount(event, matter, state.settings);
    const push = (kind: WorkKind, days: number, detail: string) =>
      items.push({ event, matter, kind, days, detail, amount });

    if (event.stage === "wip") {
      const since = daysBetween(event.triggerOn, today);
      if (since >= 0) {
        push("trigger_met", since, `Billable ${since} day${since === 1 ? "" : "s"} ago`);
      } else {
        push("upcoming", -since, `Trigger in ${-since} days`);
      }
      continue;
    }

    const late = overdueDays(event, matter, state.settings, today);
    if (late > 0) {
      const target = targetDays(event.stage, matter, state.settings);
      push("past_target", late, `${late}d past our ${target}d target`);
      continue;
    }

    if (stageControl(event.stage, matter) === "theirs") {
      const waited = daysInStage(event, today);
      const expected = expectedStageDays(event.stage, matter, state.settings, measured);
      if (expected > 0 && waited > expected) {
        const over = waited - expected;
        if (event.stage === "waivers_out") {
          const have = Math.round(consentPct(event, matter));
          push("chase_waivers", over, `${have}% consented after ${waited}d`);
        } else {
          push("stalled", over, `${waited}d waiting, ${expected}d typical`);
        }
      }
    }
  }

  return items.sort((a, b) => {
    const byKind = WORK_ORDER.indexOf(a.kind) - WORK_ORDER.indexOf(b.kind);
    return byKind !== 0 ? byKind : b.days - a.days;
  });
}
