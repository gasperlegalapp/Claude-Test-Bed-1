import { todayIso } from "./engine/dates.ts";
import { computeFee } from "./engine/fees.ts";
import { advanceBlockedBy, nextStage } from "./engine/pipeline.ts";
import {
  blankEvent,
  blankMatter,
  blankParty,
  emptyState,
  load,
  migrate,
  reduce,
  save,
  type Action,
} from "./engine/store.ts";
import type { AppState, BillingEvent, Matter, Settings, Stage } from "./engine/types.ts";
import { freshUi, renderApp, type Tab, type UiState } from "./ui/render.ts";
import { money, num } from "./ui/format.ts";
import "./styles.css";

let state: AppState = load() ?? emptyState();
let ui: UiState = freshUi();

const root = document.querySelector<HTMLDivElement>("#app")!;

function dispatch(action: Action): void {
  state = reduce(state, action);
  save(state);
  render();
}

/**
 * Same, but for a value typed into a field. Rebuilding the DOM under someone
 * who is still working through the form eats keystrokes, so the edit is saved
 * immediately and the redraw waits until they are done editing.
 */
function commit(action: Action): void {
  state = reduce(state, action);
  save(state);
  renderSoon();
}

let renderPending = false;
let renderDeferred = false;

function editing(): boolean {
  const active = document.activeElement;
  const isField =
    active instanceof HTMLSelectElement ||
    (active instanceof HTMLInputElement && active.type !== "checkbox");
  return isField && root.contains(active);
}

function renderSoon(): void {
  if (renderPending) return;
  renderPending = true;
  requestAnimationFrame(() => {
    renderPending = false;
    if (editing()) {
      renderDeferred = true;
      return;
    }
    render();
  });
}

// Focus leaving the form is the cue that a postponed redraw can safely run.
root.addEventListener("focusout", () => {
  requestAnimationFrame(() => {
    if (renderDeferred && !editing()) render();
  });
});

// Re-rendering replaces every node, so the caret and the scroll position have to
// be carried across by hand. Without this, tabbing between fields drops focus.
const SELECTABLE = new Set(["text", "search", "url", "tel", "password"]);
const IDENTIFYING = ["act", "field", "matter", "party", "event", "stage", "index"] as const;

function focusSelector(el: HTMLElement): string | null {
  if (!el.dataset.act) return null;
  return IDENTIFYING.filter((key) => el.dataset[key] !== undefined)
    .map((key) => `[data-${key}="${CSS.escape(el.dataset[key]!)}"]`)
    .join("");
}

function render(): void {
  renderDeferred = false;
  const active = document.activeElement as HTMLElement | null;
  const selector = active && root.contains(active) ? focusSelector(active) : null;
  const caret =
    active instanceof HTMLInputElement && SELECTABLE.has(active.type)
      ? active.selectionStart
      : null;
  const scroll = window.scrollY;

  renderApp(root, state, ui);

  window.scrollTo(0, scroll);
  if (!selector) return;
  const restored = root.querySelector<HTMLElement>(selector);
  if (!restored) return;
  restored.focus();
  if (caret !== null && restored instanceof HTMLInputElement) {
    restored.setSelectionRange(caret, caret);
  }
}

function eventById(id: string): BillingEvent | undefined {
  return state.events.find((e) => e.id === id);
}

function matterById(id: string): Matter | undefined {
  return state.matters.find((m) => m.id === id);
}

/** Blank means "not set" for every optional field, numeric or date alike. */
function optional(value: string): string | undefined {
  return value.trim() === "" ? undefined : value;
}

function optionalNum(value: string): number | undefined {
  return value.trim() === "" ? undefined : num(value);
}

// ---- Matter and party edits ----

const MATTER_TEXT = new Set(["fileNumber", "clientName", "county", "openedOn"]);
const MATTER_OPTIONAL_DATE = new Set(["appointmentDate", "inventoryFiledOn"]);

function matterPatch(field: string, value: string): Partial<Matter> {
  if (MATTER_TEXT.has(field)) return { [field]: value } as Partial<Matter>;
  if (MATTER_OPTIONAL_DATE.has(field)) return { [field]: optional(value) } as Partial<Matter>;
  if (field === "estateValue") return { estateValue: optionalNum(value) };
  if (field === "matterType") {
    const matterType = value as Matter["matterType"];
    return { matterType, guardianshipOfEstate: matterType === "guardianship" };
  }
  return {};
}

// ---- Event edits ----

const EVENT_NUMBERS = new Set(["hours", "rate", "costs", "extraordinary"]);
const EVENT_OPTIONAL_NUMBERS = new Set([
  "estateValueOverride",
  "requestedOverride",
  "approvedAmount",
]);

function eventPatch(field: string, value: string): Partial<BillingEvent> {
  if (EVENT_NUMBERS.has(field)) return { [field]: num(value) } as Partial<BillingEvent>;
  if (EVENT_OPTIONAL_NUMBERS.has(field)) {
    return { [field]: optionalNum(value) } as Partial<BillingEvent>;
  }
  return { [field]: value } as Partial<BillingEvent>;
}

// ---- Actions ----

function advance(eventId: string): void {
  const event = eventById(eventId);
  const matter = event && matterById(event.matterId);
  if (!event || !matter) return;
  const next = nextStage(event);
  if (!next || advanceBlockedBy(event, matter, state.settings)) return;
  if (next === "received") {
    receive(eventId);
    return;
  }
  dispatch({ type: "SET_STAGE", id: eventId, stage: next, on: todayIso() });
}

function receive(eventId: string): void {
  const event = eventById(eventId);
  const matter = event && matterById(event.matterId);
  if (!event || !matter) return;
  const suggested =
    event.approvedAmount ?? computeFee(event, matter, state.settings).requested;
  const entered = window.prompt(
    `Amount received (suggested ${money(suggested)}):`,
    String(Math.round(suggested)),
  );
  if (entered === null) return;
  dispatch({ type: "RECEIVE", id: eventId, on: todayIso(), amount: num(entered) });
}

function createAnnual(matterId: string, date: string): void {
  const matter = matterById(matterId);
  if (!matter) return;
  const year = Number(date.slice(0, 4)) - Number((matter.appointmentDate ?? date).slice(0, 4));
  const event = {
    ...blankEvent(matter, state.settings),
    label: `Annual fees — year ${year}`,
    trigger: "appointment_anniversary" as const,
    triggerOn: date,
  };
  ui.selectedEventId = event.id;
  dispatch({ type: "ADD_EVENT", event });
}

function exportJson(): void {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `proforma-${todayIso()}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function importJson(): void {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/json,.json";
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const imported = migrate(JSON.parse(await file.text()));
      if (
        state.matters.length > 0 &&
        !window.confirm(
          `Replace the ${state.matters.length} matter(s) in this browser with the ${imported.matters.length} in the file?`,
        )
      ) {
        return;
      }
      ui = freshUi();
      dispatch({ type: "REPLACE_STATE", state: imported });
    } catch {
      window.alert("That file could not be read as proforma data.");
    }
  });
  input.click();
}

// ---- Event delegation ----
// One listener per event kind, dispatching on the data-act of the closest
// element that carries one.

interface Target {
  act: string;
  el: HTMLElement;
  data: DOMStringMap;
}

function target(raw: EventTarget | null): Target | null {
  const el = (raw as HTMLElement | null)?.closest<HTMLElement>("[data-act]");
  return el?.dataset.act ? { act: el.dataset.act, el, data: el.dataset } : null;
}

root.addEventListener("click", (e) => {
  const t = target(e.target);
  if (!t) return;
  const { act, data } = t;

  // Checkboxes and text inputs are handled on change, not on click.
  if (t.el instanceof HTMLInputElement || t.el instanceof HTMLSelectElement) return;

  switch (act) {
    case "tab":
      ui.tab = data.tab as Tab;
      return render();

    case "add-matter": {
      const matter = blankMatter();
      ui.tab = "matters";
      ui.selectedMatterId = matter.id;
      ui.selectedEventId = null;
      return dispatch({ type: "ADD_MATTER", matter });
    }

    case "select-matter":
      ui.selectedMatterId = ui.selectedMatterId === data.matter ? null : data.matter!;
      ui.selectedEventId = null;
      return render();

    case "delete-matter": {
      const matter = matterById(data.matter!);
      const count = state.events.filter((ev) => ev.matterId === data.matter).length;
      if (
        !window.confirm(
          `Delete ${matter?.fileNumber || "this matter"} and its ${count} fee request(s)? This cannot be undone.`,
        )
      ) {
        return;
      }
      ui.selectedMatterId = null;
      ui.selectedEventId = null;
      return dispatch({ type: "DELETE_MATTER", id: data.matter! });
    }

    case "add-party":
      return dispatch({ type: "ADD_PARTY", matterId: data.matter!, party: blankParty() });

    case "remove-party":
      return dispatch({
        type: "REMOVE_PARTY",
        matterId: data.matter!,
        partyId: data.party!,
      });

    case "create-annual":
      return createAnnual(data.matter!, data.date!);

    case "add-event": {
      const matter = matterById(data.matter!);
      if (!matter) return;
      const event = blankEvent(matter, state.settings);
      ui.selectedEventId = event.id;
      return dispatch({ type: "ADD_EVENT", event });
    }

    case "select-event":
      ui.selectedEventId = ui.selectedEventId === data.event ? null : data.event!;
      return render();

    case "open-event":
      ui.tab = "matters";
      ui.selectedMatterId = data.matter!;
      ui.selectedEventId = data.event!;
      return render();

    case "delete-event":
      if (!window.confirm("Delete this fee request?")) return;
      ui.selectedEventId = null;
      return dispatch({ type: "DELETE_EVENT", id: data.event! });

    case "set-stage":
      return dispatch({
        type: "SET_STAGE",
        id: data.event!,
        stage: data.stage as Stage,
        on: todayIso(),
      });

    case "advance":
      return advance(data.event!);

    case "receive":
      return receive(data.event!);

    case "sync-extraordinary":
      return dispatch({ type: "SYNC_EXTRAORDINARY", id: data.event! });

    case "add-tier":
      return dispatch({
        type: "UPDATE_SETTINGS",
        patch: { fiduciaryTiers: [...state.settings.fiduciaryTiers, { upTo: null, rate: 0 }] },
      });

    case "remove-tier":
      return dispatch({
        type: "UPDATE_SETTINGS",
        patch: {
          fiduciaryTiers: state.settings.fiduciaryTiers.filter(
            (_, i) => i !== Number(data.index),
          ),
        },
      });

    case "export":
      return exportJson();

    case "import":
      return importJson();

    case "reset":
      if (!window.confirm("Erase every matter and request in this browser? Export first.")) return;
      ui = freshUi();
      return dispatch({ type: "REPLACE_STATE", state: emptyState() });
  }
});

root.addEventListener("change", (e) => {
  const t = target(e.target);
  if (!t) return;
  const { act, el, data } = t;
  const input = el as HTMLInputElement | HTMLSelectElement;
  const value = input.value;
  const checked = input instanceof HTMLInputElement && input.checked;

  // A dropdown or a checkbox is a finished decision, and it can change which
  // fields belong on screen, so it redraws now. A typed value waits.
  const toggled = input instanceof HTMLSelectElement || input.type === "checkbox";
  const apply = toggled ? dispatch : commit;

  switch (act) {
    case "toggle-closed":
      ui.showClosed = checked;
      return render();

    case "matter-field":
      return apply({
        type: "UPDATE_MATTER",
        id: data.matter!,
        patch: matterPatch(data.field!, value),
      });

    case "matter-flag":
      return apply({
        type: "UPDATE_MATTER",
        id: data.matter!,
        patch: { [data.field!]: checked } as Partial<Matter>,
      });

    case "matter-closed":
      return apply({
        type: "UPDATE_MATTER",
        id: data.matter!,
        patch: { status: checked ? "closed" : "open" },
      });

    case "party-field":
      return apply({
        type: "UPDATE_PARTY",
        matterId: data.matter!,
        partyId: data.party!,
        patch: data.field === "sharePct" ? { sharePct: num(value) } : { name: value },
      });

    case "event-field":
      return apply({
        type: "UPDATE_EVENT",
        id: data.event!,
        patch: eventPatch(data.field!, value),
      });

    case "waiver-field":
      return apply({
        type: "SET_WAIVER",
        eventId: data.event!,
        partyId: data.party!,
        patch: { [data.field!]: optional(value) },
      });

    case "waiver-objected":
      return apply({
        type: "SET_WAIVER",
        eventId: data.event!,
        partyId: data.party!,
        patch: { objected: checked },
      });

    case "target":
      return apply({
        type: "UPDATE_SETTINGS",
        patch: {
          targets: { ...state.settings.targets, [data.stage as Stage]: num(value) },
        },
      });

    case "assumed":
      return apply({
        type: "UPDATE_SETTINGS",
        patch: {
          assumedWaits: { ...state.settings.assumedWaits, [data.stage as Stage]: num(value) },
        },
      });

    case "setting":
      return apply({
        type: "UPDATE_SETTINGS",
        patch: { [data.field!]: num(value) } as Partial<Settings>,
      });

    case "tier-upto":
    case "tier-rate": {
      const index = Number(data.index);
      const tiers = state.settings.fiduciaryTiers.map((tier, i) => {
        if (i !== index) return tier;
        return act === "tier-upto"
          ? { ...tier, upTo: value.trim() === "" ? null : num(value) }
          : { ...tier, rate: num(value) / 100 };
      });
      return apply({ type: "UPDATE_SETTINGS", patch: { fiduciaryTiers: tiers } });
    }

    case "confirm-schedule":
      return apply({
        type: "UPDATE_SETTINGS",
        patch: { fiduciaryScheduleConfirmed: checked },
      });
  }
});

render();
