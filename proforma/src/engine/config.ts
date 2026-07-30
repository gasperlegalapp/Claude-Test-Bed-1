import type {
  ApprovalRoute,
  Control,
  FeeType,
  Matter,
  Settings,
  Stage,
  TriggerKind,
} from "./types.ts";

export const STAGE_LABELS: Record<Stage, string> = {
  wip: "Work in progress",
  ripe: "Ripe — package not started",
  billing_prep: "Invoices & expenses",
  waivers_drafted: "Waivers drafted",
  waivers_out: "Waivers out to next of kin",
  filed: "Filed",
  awaiting_court: "Awaiting court",
  hearing_set: "Hearing set",
  order_entered: "Order entered",
  payment_requested: "Payment requested",
  received: "Received",
};

export const STAGE_SHORT: Record<Stage, string> = {
  wip: "WIP",
  ripe: "Ripe",
  billing_prep: "Billing",
  waivers_drafted: "Draft waivers",
  waivers_out: "Waivers out",
  filed: "Filed",
  awaiting_court: "At court",
  hearing_set: "Hearing",
  order_entered: "Ordered",
  payment_requested: "Awaiting check",
  received: "Received",
};

export const ROUTE_LABELS: Record<ApprovalRoute, string> = {
  waivers: "Waivers from next of kin",
  hearing: "Application, order or hearing",
  final_accounting: "Wait for final accounting",
};

export const TRIGGER_LABELS: Record<TriggerKind, string> = {
  inventory_filed: "Inventory filed (first fees)",
  appointment_anniversary: "Anniversary of appointment",
  estate_closing: "Estate wrapping up",
  other: "Other",
};

export const FEE_TYPE_LABELS: Record<FeeType, string> = {
  attorney: "Attorney fee",
  guardian: "Guardian fee",
  extraordinary: "Extraordinary fee",
};

/**
 * The stages a request passes through, in order, for each approval route.
 * Probate on the waiver route gathers consents before filing; the hearing
 * route files first and waits to be heard. Guardianship uses the hearing
 * route — an application per fee type, then an order or a hearing.
 */
const ROUTE_STAGES: Record<ApprovalRoute, Stage[]> = {
  waivers: [
    "wip",
    "ripe",
    "billing_prep",
    "waivers_drafted",
    "waivers_out",
    "filed",
    "awaiting_court",
    "order_entered",
    "payment_requested",
    "received",
  ],
  hearing: [
    "wip",
    "ripe",
    "billing_prep",
    "filed",
    "awaiting_court",
    "hearing_set",
    "order_entered",
    "payment_requested",
    "received",
  ],
  final_accounting: [
    "wip",
    "ripe",
    "billing_prep",
    "filed",
    "awaiting_court",
    "order_entered",
    "payment_requested",
    "received",
  ],
};

export function stagesFor(route: ApprovalRoute): Stage[] {
  return ROUTE_STAGES[route];
}

/** Every stage in life-cycle order, across all routes. */
export const STAGE_ORDER: Stage[] = [
  "wip",
  "ripe",
  "billing_prep",
  "waivers_drafted",
  "waivers_out",
  "filed",
  "awaiting_court",
  "hearing_set",
  "order_entered",
  "payment_requested",
  "received",
];

/**
 * The stage a request lands on when its route changes under it — the furthest
 * point on the new route it has demonstrably already reached. Switching from
 * waivers to a hearing shouldn't rewind a petition that is already filed.
 */
export function snapToRoute(stage: Stage, route: ApprovalRoute): Stage {
  const stages = stagesFor(route);
  if (stages.includes(stage)) return stage;
  const reached = STAGE_ORDER.indexOf(stage);
  let best: Stage = stages[0];
  for (const candidate of stages) {
    if (STAGE_ORDER.indexOf(candidate) <= reached) best = candidate;
  }
  return best;
}

const OURS = new Set<Stage>([
  "wip",
  "ripe",
  "billing_prep",
  "waivers_drafted",
  "filed",
  "order_entered",
]);

/**
 * Who owns the clock in this stage. `payment_requested` is the one that swings:
 * when we hold the fiduciary appointment we write the check ourselves, so the
 * delay is on us. When the client is guardian we are asking and waiting.
 */
export function stageControl(stage: Stage, matter: Matter): Control {
  if (stage === "payment_requested") {
    return matter.weAreFiduciary ? "ours" : "theirs";
  }
  return OURS.has(stage) ? "ours" : "theirs";
}

/**
 * `wip` has no target — the work takes as long as the matter takes. Every other
 * stage we own is on a clock we set for ourselves.
 */
export const UNTIMED_STAGES = new Set<Stage>(["wip", "received"]);

const DEFAULT_TARGETS: Record<Stage, number> = {
  wip: 0,
  ripe: 7,
  billing_prep: 7,
  waivers_drafted: 3,
  waivers_out: 0,
  filed: 3,
  awaiting_court: 0,
  hearing_set: 0,
  order_entered: 3,
  payment_requested: 7,
  received: 0,
};

// Placeholders only. These exist so the forecast has a number on day one; they
// are replaced per stage as soon as enough real passes have been recorded.
const DEFAULT_ASSUMED_WAITS: Record<Stage, number> = {
  wip: 0,
  ripe: 0,
  billing_prep: 0,
  waivers_drafted: 0,
  waivers_out: 21,
  filed: 0,
  awaiting_court: 45,
  hearing_set: 30,
  order_entered: 0,
  payment_requested: 21,
  received: 0,
};

/**
 * Placeholder schedule, NOT a jurisdiction's statute. Set these to the real
 * brackets before relying on a guardianship-of-the-estate number.
 */
const PLACEHOLDER_FIDUCIARY_TIERS = [
  { upTo: 1_000_000, rate: 0.03 },
  { upTo: 5_000_000, rate: 0.025 },
  { upTo: 10_000_000, rate: 0.02 },
  { upTo: null, rate: 0.015 },
];

export function defaultSettings(): Settings {
  return {
    defaultRate: 350,
    targets: { ...DEFAULT_TARGETS },
    assumedWaits: { ...DEFAULT_ASSUMED_WAITS },
    fiduciaryTiers: PLACEHOLDER_FIDUCIARY_TIERS.map((t) => ({ ...t })),
    fiduciaryScheduleConfirmed: false,
    waiverThresholdPct: 51,
    minSamplesToLearn: 3,
    approvalHaircutPct: 0,
  };
}

/** Fees are only certain once a judge has signed something. */
export function confidenceOf(stage: Stage): "committed" | "probable" | "early" {
  if (stage === "received" || stage === "order_entered" || stage === "payment_requested") {
    return "committed";
  }
  if (stage === "wip" || stage === "ripe" || stage === "billing_prep") return "early";
  return "probable";
}
