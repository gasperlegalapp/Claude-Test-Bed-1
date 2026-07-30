import { addMonths, addYears, todayIso } from "./dates.ts";
import { defaultSettings, snapToRoute } from "./config.ts";
import { suggestedExtraordinary, computeFee } from "./fees.ts";
import { advanceTo } from "./pipeline.ts";
import type {
  ApprovalRoute,
  AppState,
  BillingEvent,
  FeeType,
  Matter,
  MatterType,
  Party,
  Settings,
  Stage,
} from "./types.ts";

export const STATE_VERSION = 1;
const STORAGE_KEY = "proforma.state.v1";

let idCounter = 0;

export function newId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}${idCounter.toString(36)}`;
}

export function emptyState(): AppState {
  return { version: STATE_VERSION, settings: defaultSettings(), matters: [], events: [] };
}

export function blankMatter(matterType: MatterType = "guardianship"): Matter {
  return {
    id: newId("m"),
    fileNumber: "",
    clientName: "",
    matterType,
    county: "",
    openedOn: todayIso(),
    weAreFiduciary: false,
    guardianshipOfEstate: matterType === "guardianship",
    parties: [],
    status: "open",
    notes: "",
  };
}

export function blankParty(): Party {
  return { id: newId("p"), name: "", sharePct: 0 };
}

/**
 * A new request starts in WIP on the route its matter type normally takes:
 * probate gathers waivers, guardianship files an application per fee type.
 */
export function blankEvent(matter: Matter, settings: Settings): BillingEvent {
  const feeType: FeeType = matter.matterType === "guardianship" ? "guardian" : "attorney";
  const route: ApprovalRoute = matter.matterType === "probate" ? "waivers" : "hearing";
  return {
    id: newId("e"),
    matterId: matter.id,
    label: "",
    trigger: matter.matterType === "probate" ? "estate_closing" : "inventory_filed",
    triggerOn: todayIso(),
    feeType,
    feeBasis:
      matter.guardianshipOfEstate && feeType !== "attorney" ? "fiduciary_vs_hourly" : "hourly",
    route,
    hours: 0,
    rate: settings.defaultRate,
    costs: 0,
    extraordinary: 0,
    stage: "wip",
    history: [{ stage: "wip", enteredOn: todayIso() }],
    waivers: [],
    notes: "",
  };
}

/**
 * The anniversary billing dates a guardianship owes but has no event for yet.
 * Annual fees run from the date of appointment, so these are knowable years in
 * advance — which is exactly what an invoice list can't tell you.
 */
export function missingAnniversaries(
  matter: Matter,
  events: BillingEvent[],
  today: string,
  monthsAhead = 18,
): string[] {
  if (matter.matterType !== "guardianship" || !matter.appointmentDate) return [];
  if (matter.status === "closed") return [];

  const limit = addMonths(today, monthsAhead);
  const covered = new Set(
    events
      .filter((e) => e.matterId === matter.id && e.trigger === "appointment_anniversary")
      .map((e) => e.triggerOn),
  );

  const out: string[] = [];
  for (let year = 1; year <= 40; year++) {
    const date = addYears(matter.appointmentDate, year);
    if (date > limit) break;
    if (date < matter.openedOn) continue;
    if (!covered.has(date)) out.push(date);
  }
  return out;
}

export type Action =
  | { type: "ADD_MATTER"; matter: Matter }
  | { type: "UPDATE_MATTER"; id: string; patch: Partial<Matter> }
  | { type: "DELETE_MATTER"; id: string }
  | { type: "ADD_PARTY"; matterId: string; party: Party }
  | { type: "UPDATE_PARTY"; matterId: string; partyId: string; patch: Partial<Party> }
  | { type: "REMOVE_PARTY"; matterId: string; partyId: string }
  | { type: "ADD_EVENT"; event: BillingEvent }
  | { type: "UPDATE_EVENT"; id: string; patch: Partial<BillingEvent> }
  | { type: "DELETE_EVENT"; id: string }
  | { type: "SET_STAGE"; id: string; stage: Stage; on: string }
  | { type: "SET_WAIVER"; eventId: string; partyId: string; patch: Partial<WaiverPatch> }
  | { type: "RECEIVE"; id: string; on: string; amount: number }
  | { type: "SYNC_EXTRAORDINARY"; id: string }
  | { type: "UPDATE_SETTINGS"; patch: Partial<Settings> }
  | { type: "REPLACE_STATE"; state: AppState };

interface WaiverPatch {
  sentOn: string | undefined;
  consentedOn: string | undefined;
  objected: boolean;
}

export function reduce(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "ADD_MATTER":
      return { ...state, matters: [...state.matters, action.matter] };

    case "UPDATE_MATTER":
      return {
        ...state,
        matters: state.matters.map((m) =>
          m.id === action.id ? { ...m, ...action.patch } : m,
        ),
      };

    case "DELETE_MATTER":
      return {
        ...state,
        matters: state.matters.filter((m) => m.id !== action.id),
        events: state.events.filter((e) => e.matterId !== action.id),
      };

    case "ADD_PARTY":
      return mapMatter(state, action.matterId, (m) => ({
        ...m,
        parties: [...m.parties, action.party],
      }));

    case "UPDATE_PARTY":
      return mapMatter(state, action.matterId, (m) => ({
        ...m,
        parties: m.parties.map((p) =>
          p.id === action.partyId ? { ...p, ...action.patch } : p,
        ),
      }));

    case "REMOVE_PARTY":
      return {
        ...mapMatter(state, action.matterId, (m) => ({
          ...m,
          parties: m.parties.filter((p) => p.id !== action.partyId),
        })),
        events: state.events.map((e) => ({
          ...e,
          waivers: e.waivers.filter((w) => w.partyId !== action.partyId),
        })),
      };

    case "ADD_EVENT":
      return { ...state, events: [...state.events, action.event] };

    case "UPDATE_EVENT":
      return mapEvent(state, action.id, (e) => {
        const next = { ...e, ...action.patch };
        return action.patch.route && action.patch.route !== e.route
          ? { ...next, stage: snapToRoute(e.stage, action.patch.route) }
          : next;
      });

    case "DELETE_EVENT":
      return { ...state, events: state.events.filter((e) => e.id !== action.id) };

    case "SET_STAGE":
      return mapEvent(state, action.id, (e) => advanceTo(e, action.stage, action.on));

    case "SET_WAIVER":
      return mapEvent(state, action.eventId, (e) => {
        const existing = e.waivers.find((w) => w.partyId === action.partyId);
        const waivers = existing
          ? e.waivers.map((w) =>
              w.partyId === action.partyId ? { ...w, ...action.patch } : w,
            )
          : [...e.waivers, { partyId: action.partyId, objected: false, ...action.patch }];
        return { ...e, waivers };
      });

    case "RECEIVE":
      return mapEvent(state, action.id, (e) => ({
        ...advanceTo(e, "received", action.on),
        receivedAmount: action.amount,
      }));

    case "SYNC_EXTRAORDINARY":
      return mapEvent(state, action.id, (e) => {
        const matter = state.matters.find((m) => m.id === e.matterId);
        if (!matter || e.feeBasis !== "fiduciary_vs_hourly") return e;
        const { hourly, fiduciary } = computeFee(e, matter, state.settings);
        return { ...e, extraordinary: suggestedExtraordinary(hourly, fiduciary ?? 0) };
      });

    case "UPDATE_SETTINGS":
      return { ...state, settings: { ...state.settings, ...action.patch } };

    case "REPLACE_STATE":
      return action.state;
  }
}

function mapMatter(
  state: AppState,
  id: string,
  fn: (m: Matter) => Matter,
): AppState {
  return { ...state, matters: state.matters.map((m) => (m.id === id ? fn(m) : m)) };
}

function mapEvent(
  state: AppState,
  id: string,
  fn: (e: BillingEvent) => BillingEvent,
): AppState {
  return { ...state, events: state.events.map((e) => (e.id === id ? fn(e) : e)) };
}

// ---- Persistence ----
// Everything lives in this browser. Nothing is sent anywhere, and the export
// below is the backup: keep a copy somewhere the firm actually backs up.

export function save(state: AppState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Out of quota or storage disabled — the in-memory state still works, and
    // export is the real safety net.
  }
}

export function load(): AppState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return migrate(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** Fills in anything a stored file predates, so old exports keep opening. */
export function migrate(raw: unknown): AppState {
  const input = (raw ?? {}) as Partial<AppState>;
  const base = emptyState();
  return {
    version: STATE_VERSION,
    settings: { ...base.settings, ...(input.settings ?? {}) },
    matters: (input.matters ?? []).map((m) => ({ ...m, parties: m.parties ?? [] })),
    events: (input.events ?? []).map((e) => ({
      ...e,
      waivers: e.waivers ?? [],
      history: e.history ?? [{ stage: e.stage, enteredOn: e.triggerOn }],
    })),
  };
}
