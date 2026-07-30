// The unit of forecasting is not the invoice — it is the billing event: a future
// amount of cash attached to a matter, sitting at a known stage in an approval
// pipeline. A matter throws off one or more of these over its life.

export type MatterType = "probate" | "guardianship" | "other";

/** Guardianship files a separate application per fee type. */
export type FeeType = "attorney" | "guardian" | "extraordinary";

/**
 * How the fee amount is derived. Probate and everything else is straight
 * hourly. Guardianship of the estate runs the statutory fiduciary percentage
 * and compares it to hourly.
 */
export type FeeBasis = "hourly" | "fiduciary_vs_hourly";

/** How this particular fee request gets approved. */
export type ApprovalRoute = "waivers" | "hearing" | "final_accounting";

export type Stage =
  | "wip" // work being performed, not yet billable
  | "ripe" // trigger met, fee package not started
  | "billing_prep" // invoices and expenses being assembled
  | "waivers_drafted" // consents drafted, not yet out the door
  | "waivers_out" // waiting on next of kin to return consents
  | "filed" // petition or application filed with the court
  | "awaiting_court" // waiting on an order or on a hearing being set
  | "hearing_set" // hearing on the calendar
  | "order_entered" // fees awarded
  | "payment_requested" // waiting on the check
  | "received"; // cash in the door

/**
 * Who controls the clock. Stages we own get an enforced target and go overdue.
 * Stages we don't own get measured, so the forecast learns the real wait
 * instead of guessing forever.
 */
export type Control = "ours" | "theirs";

export type TriggerKind =
  | "inventory_filed" // guardianship: first fees
  | "appointment_anniversary" // guardianship: annual, from date of appointment
  | "estate_closing" // probate: the estate is wrapping up
  | "other";

export interface Matter {
  id: string;
  fileNumber: string;
  /** Optional — the file number is the identifier if you'd rather not store names. */
  clientName: string;
  matterType: MatterType;
  county: string;
  openedOn: string;
  /** Guardianship: date of appointment. Drives the annual billing anniversary. */
  appointmentDate?: string;
  inventoryFiledOn?: string;
  /** We are the guardian or personal representative, so we cut our own check. */
  weAreFiduciary: boolean;
  /** Guardianship of the estate — the fiduciary percentage calc applies. */
  guardianshipOfEstate: boolean;
  /** Basis for the fiduciary percentage calc. */
  estateValue?: number;
  /** Next of kin. Waivers are sent to these people, per fee request. */
  parties: Party[];
  status: "open" | "closed";
  notes: string;
}

export interface Party {
  id: string;
  name: string;
  /** Share of the estate. Left at 0 for everyone means equal shares. */
  sharePct: number;
}

/** A consent solicited from one party for one fee request. */
export interface Waiver {
  partyId: string;
  sentOn?: string;
  consentedOn?: string;
  objected: boolean;
}

export interface StageEntry {
  stage: Stage;
  enteredOn: string;
  /** Absent while this is the current stage. */
  exitedOn?: string;
}

export interface BillingEvent {
  id: string;
  matterId: string;
  label: string;
  trigger: TriggerKind;
  /** When the trigger is or was met. May be in the future. */
  triggerOn: string;
  feeType: FeeType;
  feeBasis: FeeBasis;
  route: ApprovalRoute;
  hours: number;
  rate: number;
  /** Expenses advanced, reimbursed on the same order. */
  costs: number;
  /**
   * The extraordinary component petitioned on top of the ordinary fiduciary
   * fee. Defaults to the amount by which hourly exceeds the percentage.
   */
  extraordinary: number;
  /** Overrides the matter's estate value for this request only. */
  estateValueOverride?: number;
  /** Overrides the computed fee. Set when the number comes from elsewhere. */
  requestedOverride?: number;
  /** What the court actually awarded. Replaces the request in the forecast. */
  approvedAmount?: number;
  stage: Stage;
  history: StageEntry[];
  waivers: Waiver[];
  receivedOn?: string;
  receivedAmount?: number;
  notes: string;
}

export interface FiduciaryTier {
  /** Top of this bracket. `null` means everything above the previous tier. */
  upTo: number | null;
  rate: number;
}

export interface Settings {
  defaultRate: number;
  /** Days we allow ourselves for each stage we control. */
  targets: Record<Stage, number>;
  /**
   * Placeholder waits for stages outside our control, used until enough
   * history accumulates to measure the real thing.
   */
  assumedWaits: Record<Stage, number>;
  fiduciaryTiers: FiduciaryTier[];
  /** False until the schedule has been set to this jurisdiction's numbers. */
  fiduciaryScheduleConfirmed: boolean;
  /** Share of consents needed to get paid without a hearing. */
  waiverThresholdPct: number;
  /** Completed passes through a stage before its measured wait is trusted. */
  minSamplesToLearn: number;
  /** Optional discount applied to requests no court has approved yet. */
  approvalHaircutPct: number;
}

export interface AppState {
  version: number;
  settings: Settings;
  matters: Matter[];
  events: BillingEvent[];
}

/** How much of the amount to believe, based on how far along the request is. */
export type Confidence = "committed" | "probable" | "early";
