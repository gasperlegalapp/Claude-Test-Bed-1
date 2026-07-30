import {
  FEE_TYPE_LABELS,
  ROUTE_LABELS,
  STAGE_LABELS,
  STAGE_SHORT,
  TRIGGER_LABELS,
  UNTIMED_STAGES,
  confidenceOf,
  stageControl,
  stagesFor,
} from "../engine/config.ts";
import { formatDate, formatMonth, todayIso } from "../engine/dates.ts";
import { computeFee, suggestedExtraordinary } from "../engine/fees.ts";
import {
  advanceBlockedBy,
  consentPct,
  daysInStage,
  expectationIsMeasured,
  expectedStageDays,
  nextStage,
  overdueDays,
  stageEnteredOn,
  targetDays,
} from "../engine/pipeline.ts";
import { PAYMENT_THEIRS, measureWaits, targetPerformance } from "../engine/cycletime.ts";
import {
  monthBuckets,
  project,
  totals,
  weekBuckets,
  worklist,
  type Bucket,
  type Projection,
  type WorkItem,
} from "../engine/forecast.ts";
import { missingAnniversaries } from "../engine/store.ts";
import type { AppState, BillingEvent, Matter, Stage } from "../engine/types.ts";
import { esc, money, moneyShort } from "./format.ts";

export type Tab = "forecast" | "worklist" | "matters" | "timing" | "settings";

export interface UiState {
  tab: Tab;
  selectedMatterId: string | null;
  selectedEventId: string | null;
  showClosed: boolean;
}

export function freshUi(): UiState {
  return { tab: "forecast", selectedMatterId: null, selectedEventId: null, showClosed: false };
}

const TABS: [Tab, string][] = [
  ["forecast", "Forecast"],
  ["worklist", "This week"],
  ["matters", "Matters"],
  ["timing", "Timing"],
  ["settings", "Settings"],
];

const ALL_STAGES: Stage[] = [
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

export function renderApp(root: HTMLElement, state: AppState, ui: UiState): void {
  const today = todayIso();
  root.innerHTML = `
    <header class="topbar">
      <div class="brand">Cash flow proforma</div>
      <nav class="tabs">
        ${TABS.map(
          ([tab, label]) =>
            `<button class="tab${ui.tab === tab ? " on" : ""}" data-act="tab" data-tab="${tab}">${label}</button>`,
        ).join("")}
      </nav>
      <div class="today">${formatDate(today)}</div>
    </header>
    ${banners(state)}
    <main>${body(state, ui, today)}</main>
  `;
}

function banners(state: AppState): string {
  const out: string[] = [];
  if (!state.settings.fiduciaryScheduleConfirmed) {
    const inUse = state.events.some((e) => e.feeBasis === "fiduciary_vs_hourly");
    out.push(
      `<div class="banner${inUse ? " warn" : ""}">
        The fiduciary fee schedule is a placeholder, not your jurisdiction's statute.
        <button class="link" data-act="tab" data-tab="settings">Set the brackets</button>
        before relying on a guardianship-of-the-estate number.
      </div>`,
    );
  }
  return out.join("");
}

function body(state: AppState, ui: UiState, today: string): string {
  switch (ui.tab) {
    case "forecast":
      return forecastTab(state, today);
    case "worklist":
      return worklistTab(state, today);
    case "matters":
      return mattersTab(state, ui, today);
    case "timing":
      return timingTab(state);
    case "settings":
      return settingsTab(state);
  }
}

// ---- Forecast ----

function forecastTab(state: AppState, today: string): string {
  if (state.matters.length === 0) return emptyState();

  const projections = project(state, today);
  const t = totals(state, today);
  const weeks = weekBuckets(projections, today);
  const months = monthBuckets(projections, today);

  return `
    <section class="stats">
      ${stat("Pipeline", money(t.pipeline), "everything not yet collected")}
      ${stat("Ordered", money(t.committed), "a judge has signed")}
      ${stat("Filed, awaiting", money(t.probable), "in front of the court")}
      ${stat("Not yet filed", money(t.early), "still ours to move")}
      ${stat("Collected this year", money(t.collectedYtd), "cash in the door")}
      ${stat("Needs attention", String(t.overdueCount), "items on this week's list")}
    </section>

    <section class="panel">
      <h2>Next 13 weeks</h2>
      <p class="hint">Operating horizon. Anything already past its expected date is pulled into this week.</p>
      ${bucketChart(weeks, (b) => formatDate(b.start))}
    </section>

    <section class="panel">
      <h2>Next 12 months</h2>
      <p class="hint">Planning horizon. Guardianship anniversaries land here long before they hit the CMS.</p>
      ${bucketChart(months, (b) => formatMonth(b.key))}
    </section>

    <section class="panel">
      <h2>Every open request</h2>
      ${projectionTable(state, projections, today)}
    </section>
  `;
}

function stat(label: string, value: string, hint: string): string {
  return `<div class="stat"><div class="stat-v">${esc(value)}</div>
    <div class="stat-l">${esc(label)}</div><div class="stat-h">${esc(hint)}</div></div>`;
}

function bucketChart(buckets: Bucket[], label: (b: Bucket) => string): string {
  const peak = Math.max(1, ...buckets.map((b) => b.total));
  const rows = buckets
    .map((b) => {
      const seg = (amount: number, cls: string) =>
        amount > 0
          ? `<span class="seg ${cls}" style="width:${(amount / peak) * 100}%"></span>`
          : "";
      return `<tr>
        <td class="k">${esc(label(b))}</td>
        <td class="bar">
          ${seg(b.byConfidence.committed, "committed")}
          ${seg(b.byConfidence.probable, "probable")}
          ${seg(b.byConfidence.early, "early")}
        </td>
        <td class="n">${b.total > 0 ? moneyShort(b.total) : "—"}</td>
        <td class="c">${b.count || ""}</td>
      </tr>`;
    })
    .join("");

  const total = buckets.reduce((s, b) => s + b.total, 0);
  return `
    <table class="chart">
      <tbody>${rows}</tbody>
      <tfoot><tr><td class="k">Total</td><td></td><td class="n">${money(total)}</td><td></td></tr></tfoot>
    </table>
    <div class="legend">
      <span><i class="committed"></i>Ordered</span>
      <span><i class="probable"></i>Filed, awaiting</span>
      <span><i class="early"></i>Not yet filed</span>
    </div>
  `;
}

function projectionTable(state: AppState, projections: Projection[], today: string): string {
  if (projections.length === 0) return `<p class="hint">Nothing open.</p>`;
  const measured = measureWaits(state.events, state.matters);
  const rows = projections
    .map((p) => {
      const learned = expectationIsMeasured(p.event.stage, p.matter, state.settings, measured);
      const late = overdueDays(p.event, p.matter, state.settings, today);
      return `<tr class="click" data-act="open-event" data-matter="${p.matter.id}" data-event="${p.event.id}">
        <td>${esc(p.matter.fileNumber || "(no file no.)")}</td>
        <td>${esc(p.event.label || TRIGGER_LABELS[p.event.trigger])}</td>
        <td><span class="pill ${p.confidence}">${esc(STAGE_SHORT[p.event.stage])}</span>
          ${late > 0 ? `<span class="pill late">${late}d late</span>` : ""}</td>
        <td>${formatDate(p.expectedOn)}<span class="sub">${p.daysOut}d${learned ? ", measured" : ""}</span></td>
        <td class="n">${money(p.amount)}</td>
      </tr>`;
    })
    .join("");
  return `<table class="grid">
    <thead><tr><th>File</th><th>Request</th><th>Stage</th><th>Expected</th><th class="n">Amount</th></tr></thead>
    <tbody>${rows}</tbody></table>`;
}

function emptyState(): string {
  return `<section class="panel empty">
    <h2>No matters yet</h2>
    <p>Add a matter, then add the fee requests it will throw off. A guardianship with a
    date of appointment will suggest its own annual billing dates.</p>
    <button class="primary" data-act="add-matter">Add the first matter</button>
  </section>`;
}

// ---- This week ----

const WORK_GROUPS: [string, string, WorkItem["kind"][]][] = [
  ["Ours to move", "Nothing outside the firm is holding these up.", ["trigger_met", "past_target"]],
  ["Chase someone", "The delay is not ours, but the follow-up is.", ["chase_waivers", "stalled"]],
  ["Coming up", "Billable soon. Nothing to do yet.", ["upcoming"]],
];

function worklistTab(state: AppState, today: string): string {
  const items = worklist(state, today);
  if (items.length === 0) {
    return `<section class="panel empty"><h2>Nothing waiting on anyone</h2>
      <p>No request is past its target and no wait has run long.</p></section>`;
  }

  return WORK_GROUPS.map(([title, hint, kinds]) => {
    const group = items.filter((i) => kinds.includes(i.kind));
    if (group.length === 0) return "";
    const total = group.reduce((s, i) => s + i.amount, 0);
    return `<section class="panel">
      <h2>${esc(title)} <span class="count">${group.length} · ${moneyShort(total)}</span></h2>
      <p class="hint">${esc(hint)}</p>
      <table class="grid">
        <tbody>${group.map((i) => workRow(i, state)).join("")}</tbody>
      </table>
    </section>`;
  }).join("");
}

function workRow(item: WorkItem, state: AppState): string {
  const next = nextStage(item.event);
  const blocked = advanceBlockedBy(item.event, item.matter, state.settings);
  const action =
    next && !blocked
      ? `<button class="small" data-act="advance" data-event="${item.event.id}">→ ${esc(STAGE_SHORT[next])}</button>`
      : blocked
        ? `<span class="sub">${esc(blocked)}</span>`
        : "";
  return `<tr>
    <td class="click" data-act="open-event" data-matter="${item.matter.id}" data-event="${item.event.id}">
      <strong>${esc(item.matter.fileNumber || "(no file no.)")}</strong>
      <span class="sub">${esc(item.event.label || TRIGGER_LABELS[item.event.trigger])}</span>
    </td>
    <td>${esc(STAGE_LABELS[item.event.stage])}
      <span class="sub">${esc(item.detail)}</span></td>
    <td class="n">${money(item.amount)}</td>
    <td class="a">${action}</td>
  </tr>`;
}

// ---- Matters ----

function mattersTab(state: AppState, ui: UiState, today: string): string {
  const visible = state.matters.filter((m) => ui.showClosed || m.status === "open");
  const selected = state.matters.find((m) => m.id === ui.selectedMatterId) ?? null;

  return `
    <section class="panel">
      <h2>Matters <span class="count">${visible.length}</span></h2>
      <div class="row">
        <button class="primary" data-act="add-matter">Add matter</button>
        <label class="check"><input type="checkbox" data-act="toggle-closed"
          ${ui.showClosed ? "checked" : ""}> show closed</label>
      </div>
      ${
        visible.length === 0
          ? `<p class="hint">No matters yet.</p>`
          : `<table class="grid">
              <thead><tr><th>File</th><th>Type</th><th>Requests</th><th class="n">Open value</th><th></th></tr></thead>
              <tbody>${visible.map((m) => matterRow(state, m, ui, today)).join("")}</tbody>
            </table>`
      }
    </section>
    ${selected ? matterPanel(state, selected, ui, today) : ""}
  `;
}

function matterRow(state: AppState, matter: Matter, ui: UiState, today: string): string {
  const events = state.events.filter((e) => e.matterId === matter.id);
  const open = events.filter((e) => e.stage !== "received");
  const value = project(state, today)
    .filter((p) => p.matter.id === matter.id)
    .reduce((s, p) => s + p.amount, 0);
  const missing = missingAnniversaries(matter, events, today).length;
  return `<tr class="click${ui.selectedMatterId === matter.id ? " on" : ""}"
      data-act="select-matter" data-matter="${matter.id}">
    <td><strong>${esc(matter.fileNumber || "(no file no.)")}</strong>
      ${matter.clientName ? `<span class="sub">${esc(matter.clientName)}</span>` : ""}</td>
    <td>${esc(matterTypeLabel(matter))}
      ${matter.weAreFiduciary ? `<span class="pill">we are fiduciary</span>` : ""}</td>
    <td>${open.length} open / ${events.length}
      ${missing > 0 ? `<span class="pill late">${missing} unbilled anniversary</span>` : ""}</td>
    <td class="n">${money(value)}</td>
    <td class="a">${matter.status === "closed" ? `<span class="sub">closed</span>` : ""}</td>
  </tr>`;
}

function matterTypeLabel(matter: Matter): string {
  if (matter.matterType === "guardianship") {
    return matter.guardianshipOfEstate ? "Guardianship of estate" : "Guardianship";
  }
  return matter.matterType === "probate" ? "Probate estate" : "Other";
}

function matterPanel(state: AppState, matter: Matter, ui: UiState, today: string): string {
  const events = state.events.filter((e) => e.matterId === matter.id);
  const selectedEvent = events.find((e) => e.id === ui.selectedEventId) ?? null;
  const missing = missingAnniversaries(matter, events, today);
  const f = (field: string, label: string, value: string, type = "text") =>
    `<label class="field"><span>${esc(label)}</span>
      <input type="${type}" value="${esc(value)}" data-act="matter-field"
        data-matter="${matter.id}" data-field="${field}"></label>`;

  return `
    <section class="panel">
      <h2>${esc(matter.fileNumber || "New matter")}</h2>
      <div class="fields">
        ${f("fileNumber", "File number", matter.fileNumber)}
        ${f("clientName", "Client / estate name", matter.clientName)}
        ${f("county", "County", matter.county)}
        <label class="field"><span>Matter type</span>
          <select data-act="matter-field" data-matter="${matter.id}" data-field="matterType">
            ${option("probate", "Probate estate", matter.matterType)}
            ${option("guardianship", "Guardianship", matter.matterType)}
            ${option("other", "Other", matter.matterType)}
          </select></label>
        ${f("openedOn", "Opened", matter.openedOn, "date")}
        ${f("appointmentDate", "Date of appointment", matter.appointmentDate ?? "", "date")}
        ${f("inventoryFiledOn", "Inventory filed", matter.inventoryFiledOn ?? "", "date")}
        ${f("estateValue", "Estate value", String(matter.estateValue ?? ""), "number")}
        <label class="check"><input type="checkbox" data-act="matter-flag" data-matter="${matter.id}"
          data-field="guardianshipOfEstate" ${matter.guardianshipOfEstate ? "checked" : ""}>
          Guardianship of the estate — run the percentage calc</label>
        <label class="check"><input type="checkbox" data-act="matter-flag" data-matter="${matter.id}"
          data-field="weAreFiduciary" ${matter.weAreFiduciary ? "checked" : ""}>
          We hold the appointment — we write our own check</label>
        <label class="check"><input type="checkbox" data-act="matter-closed" data-matter="${matter.id}"
          ${matter.status === "closed" ? "checked" : ""}> Closed</label>
      </div>
      ${partiesBlock(matter)}
      <div class="row end">
        <button class="danger" data-act="delete-matter" data-matter="${matter.id}">Delete matter</button>
      </div>
    </section>

    ${
      missing.length > 0
        ? `<section class="panel">
            <h2>Anniversary billing not on the books</h2>
            <p class="hint">Annual fees run from the date of appointment, so these dates are already knowable.</p>
            <ul class="plain">${missing
              .map(
                (d) =>
                  `<li>${formatDate(d)}${d < today ? ` <span class="pill late">passed</span>` : ""}
                    <button class="small" data-act="create-annual" data-matter="${matter.id}"
                      data-date="${d}">Create request</button></li>`,
              )
              .join("")}</ul>
          </section>`
        : ""
    }

    <section class="panel">
      <h2>Fee requests <span class="count">${events.length}</span></h2>
      <button class="primary" data-act="add-event" data-matter="${matter.id}">Add request</button>
      ${
        events.length === 0
          ? `<p class="hint">No fee requests yet.</p>`
          : `<table class="grid">
              <thead><tr><th>Request</th><th>Stage</th><th>Trigger</th><th class="n">Requested</th></tr></thead>
              <tbody>${events
                .map(
                  (e) => `<tr class="click${e.id === ui.selectedEventId ? " on" : ""}"
                    data-act="select-event" data-event="${e.id}">
                    <td>${esc(e.label || TRIGGER_LABELS[e.trigger])}
                      <span class="sub">${esc(FEE_TYPE_LABELS[e.feeType])}</span></td>
                    <td><span class="pill ${confidenceOf(e.stage)}">${esc(STAGE_SHORT[e.stage])}</span></td>
                    <td>${formatDate(e.triggerOn)}</td>
                    <td class="n">${money(computeFee(e, matter, state.settings).requested)}</td>
                  </tr>`,
                )
                .join("")}</tbody>
            </table>`
      }
    </section>

    ${selectedEvent ? eventPanel(state, matter, selectedEvent, today) : ""}
  `;
}

function partiesBlock(matter: Matter): string {
  return `<div class="sub-panel">
    <h3>Next of kin</h3>
    <p class="hint">Waivers go to these people. Leave shares at 0 to count heads instead of shares.</p>
    ${
      matter.parties.length === 0
        ? `<p class="hint">None on file.</p>`
        : `<table class="grid tight"><tbody>${matter.parties
            .map(
              (p) => `<tr>
                <td><input value="${esc(p.name)}" data-act="party-field" data-matter="${matter.id}"
                  data-party="${p.id}" data-field="name" placeholder="Name"></td>
                <td class="n"><input type="number" value="${p.sharePct || ""}" class="tiny"
                  data-act="party-field" data-matter="${matter.id}" data-party="${p.id}"
                  data-field="sharePct" placeholder="0"> %</td>
                <td class="a"><button class="small danger" data-act="remove-party"
                  data-matter="${matter.id}" data-party="${p.id}">remove</button></td>
              </tr>`,
            )
            .join("")}</tbody></table>`
    }
    <button class="small" data-act="add-party" data-matter="${matter.id}">Add person</button>
  </div>`;
}

function eventPanel(
  state: AppState,
  matter: Matter,
  event: BillingEvent,
  today: string,
): string {
  const fee = computeFee(event, matter, state.settings);
  const measured = measureWaits(state.events, state.matters);
  const next = nextStage(event);
  const blocked = advanceBlockedBy(event, matter, state.settings);
  const late = overdueDays(event, matter, state.settings, today);
  const target = targetDays(event.stage, matter, state.settings);
  const control = stageControl(event.stage, matter);
  const expected = expectedStageDays(event.stage, matter, state.settings, measured);
  const inStage = daysInStage(event, today);

  const f = (field: string, label: string, value: string, type = "text") =>
    `<label class="field"><span>${esc(label)}</span>
      <input type="${type}" value="${esc(value)}" data-act="event-field"
        data-event="${event.id}" data-field="${field}"></label>`;

  return `
    <section class="panel accent">
      <h2>${esc(event.label || TRIGGER_LABELS[event.trigger])}</h2>

      <div class="stage-strip">
        ${stagesFor(event.route)
          .map((s) => {
            const at = s === event.stage;
            const passed = stagesFor(event.route).indexOf(s) < stagesFor(event.route).indexOf(event.stage);
            const who = stageControl(s, matter);
            return `<button class="step${at ? " at" : ""}${passed ? " done" : ""} ${who}"
              data-act="set-stage" data-event="${event.id}" data-stage="${s}"
              title="${esc(STAGE_LABELS[s])} — ${who === "ours" ? "our clock" : "someone else's"}">
              ${esc(STAGE_SHORT[s])}</button>`;
          })
          .join("")}
      </div>
      <p class="hint">
        In <strong>${esc(STAGE_LABELS[event.stage])}</strong> since ${formatDate(stageEnteredOn(event))}
        (${inStage}d).
        ${
          control === "ours"
            ? target === null
              ? "No target on this stage."
              : `Our target is ${target}d${late > 0 ? ` — <strong class="bad">${late}d over</strong>` : ""}.`
            : `Typical wait ${expected}d${
                expectationIsMeasured(event.stage, matter, state.settings, measured)
                  ? " (measured from your own history)"
                  : " (placeholder until there is history)"
              }.`
        }
      </p>
      <div class="row">
        ${
          next
            ? `<button class="primary" data-act="advance" data-event="${event.id}"
                ${blocked ? "disabled" : ""}>Advance to ${esc(STAGE_SHORT[next])}</button>`
            : ""
        }
        ${blocked ? `<span class="bad">${esc(blocked)}</span>` : ""}
        ${
          event.stage !== "received"
            ? `<button data-act="receive" data-event="${event.id}">Mark received</button>`
            : `<span class="sub">Received ${formatDate(event.receivedOn ?? "")} — ${money(event.receivedAmount ?? 0)}</span>`
        }
      </div>

      <div class="fields">
        ${f("label", "Label", event.label)}
        <label class="field"><span>Trigger</span>
          <select data-act="event-field" data-event="${event.id}" data-field="trigger">
            ${Object.entries(TRIGGER_LABELS)
              .map(([k, v]) => option(k, v, event.trigger))
              .join("")}
          </select></label>
        ${f("triggerOn", "Trigger date", event.triggerOn, "date")}
        <label class="field"><span>Fee type</span>
          <select data-act="event-field" data-event="${event.id}" data-field="feeType">
            ${Object.entries(FEE_TYPE_LABELS)
              .map(([k, v]) => option(k, v, event.feeType))
              .join("")}
          </select></label>
        <label class="field"><span>Approval route</span>
          <select data-act="event-field" data-event="${event.id}" data-field="route">
            ${Object.entries(ROUTE_LABELS)
              .map(([k, v]) => option(k, v, event.route))
              .join("")}
          </select></label>
        <label class="field"><span>Fee basis</span>
          <select data-act="event-field" data-event="${event.id}" data-field="feeBasis">
            ${option("hourly", "Hourly", event.feeBasis)}
            ${option("fiduciary_vs_hourly", "Percentage vs hourly", event.feeBasis)}
          </select></label>
        ${f("hours", "Hours", String(event.hours), "number")}
        ${f("rate", "Rate", String(event.rate), "number")}
        ${f("costs", "Costs advanced", String(event.costs), "number")}
        ${
          event.feeBasis === "fiduciary_vs_hourly"
            ? `${f("estateValueOverride", "Estate value for this request", String(event.estateValueOverride ?? ""), "number")}
               ${f("extraordinary", "Extraordinary component", String(event.extraordinary), "number")}`
            : ""
        }
        ${f("requestedOverride", "Override total request", String(event.requestedOverride ?? ""), "number")}
        ${f("approvedAmount", "Amount awarded", String(event.approvedAmount ?? ""), "number")}
      </div>

      <div class="sub-panel">
        <h3>What we are asking for</h3>
        <table class="grid tight"><tbody>
          <tr><td>Time (${event.hours}h × ${money(event.rate)})</td><td class="n">${money(fee.hourly)}</td></tr>
          ${
            fee.fiduciary !== null
              ? `<tr><td>Ordinary fiduciary fee</td><td class="n">${money(fee.fiduciary)}</td></tr>
                 <tr><td>Extraordinary
                   <button class="small" data-act="sync-extraordinary" data-event="${event.id}">
                     use ${money(suggestedExtraordinary(fee.hourly, fee.fiduciary))}</button></td>
                   <td class="n">${money(fee.extraordinary)}</td></tr>`
              : ""
          }
          <tr><td>Costs advanced</td><td class="n">${money(fee.costs)}</td></tr>
          <tr class="total"><td>Request${fee.overridden ? " (overridden)" : ""}</td>
            <td class="n">${money(fee.requested)}</td></tr>
        </tbody></table>
      </div>

      ${event.route === "waivers" ? waiversBlock(state, matter, event) : ""}
      ${historyBlock(event)}

      <div class="row end">
        <button class="danger" data-act="delete-event" data-event="${event.id}">Delete request</button>
      </div>
    </section>
  `;
}

function waiversBlock(state: AppState, matter: Matter, event: BillingEvent): string {
  const pct = consentPct(event, matter);
  const need = state.settings.waiverThresholdPct;
  if (matter.parties.length === 0) {
    return `<div class="sub-panel"><h3>Waivers</h3>
      <p class="hint">Add next of kin to the matter before tracking consents.</p></div>`;
  }
  const rows = matter.parties
    .map((p) => {
      const w = event.waivers.find((x) => x.partyId === p.id);
      return `<tr>
        <td>${esc(p.name || "(unnamed)")}${p.sharePct ? `<span class="sub">${p.sharePct}%</span>` : ""}</td>
        <td><input type="date" value="${esc(w?.sentOn ?? "")}" data-act="waiver-field"
          data-event="${event.id}" data-party="${p.id}" data-field="sentOn"></td>
        <td><input type="date" value="${esc(w?.consentedOn ?? "")}" data-act="waiver-field"
          data-event="${event.id}" data-party="${p.id}" data-field="consentedOn"></td>
        <td class="a"><label class="check"><input type="checkbox" data-act="waiver-objected"
          data-event="${event.id}" data-party="${p.id}" ${w?.objected ? "checked" : ""}> objected</label></td>
      </tr>`;
    })
    .join("");
  return `<div class="sub-panel">
    <h3>Waivers — ${Math.round(pct)}% of ${need}% needed</h3>
    <div class="meter"><span style="width:${Math.min(100, pct)}%"
      class="${pct >= need ? "ok" : "short"}"></span></div>
    <table class="grid tight">
      <thead><tr><th>Party</th><th>Sent</th><th>Consented</th><th></th></tr></thead>
      <tbody>${rows}</tbody></table>
  </div>`;
}

function historyBlock(event: BillingEvent): string {
  if (event.history.length === 0) return "";
  const rows = event.history
    .map(
      (h) => `<tr><td>${esc(STAGE_LABELS[h.stage])}</td><td>${formatDate(h.enteredOn)}</td>
        <td>${h.exitedOn ? formatDate(h.exitedOn) : "—"}</td></tr>`,
    )
    .join("");
  return `<div class="sub-panel"><h3>History</h3>
    <table class="grid tight"><thead><tr><th>Stage</th><th>In</th><th>Out</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
}

// ---- Timing ----

function timingTab(state: AppState): string {
  const measured = measureWaits(state.events, state.matters);
  const performance = targetPerformance(state.events, state.matters, state.settings.targets);

  // The payment wait splits in two: when we hold the appointment the delay is
  // ours and belongs under our targets, so only the client-guardian cohort is
  // an outside wait.
  const waited: [string, Stage][] = ALL_STAGES.filter(
    (s) => state.settings.assumedWaits[s] > 0,
  ).map((s) =>
    s === "payment_requested"
      ? [PAYMENT_THEIRS, s]
      : [s as string, s],
  );

  const waitRows = waited
    .map(([key, stage]) => {
      const m = measured[key];
      const enough = m && m.samples >= state.settings.minSamplesToLearn;
      const label =
        key === PAYMENT_THEIRS
          ? "Payment requested — client is guardian"
          : STAGE_LABELS[stage];
      return `<tr>
        <td>${esc(label)}</td>
        <td class="n">${state.settings.assumedWaits[stage]}d</td>
        <td class="n">${m ? `${Math.round(m.meanDays)}d` : "—"}</td>
        <td class="n">${m ? `${m.medianDays}d` : "—"}</td>
        <td class="n">${m ? `${m.minDays}–${m.maxDays}d` : "—"}</td>
        <td class="n">${m?.samples ?? 0}</td>
        <td>${enough ? `<span class="pill committed">driving forecast</span>` : `<span class="sub">using placeholder</span>`}</td>
      </tr>`;
    })
    .join("");

  const perfRows =
    performance.length === 0
      ? `<tr><td colspan="5" class="sub">Nothing has passed through a timed stage yet.</td></tr>`
      : performance
          .map(
            (p) => `<tr>
              <td>${esc(
                p.stage === "payment_requested"
                  ? "Payment requested — we are fiduciary"
                  : STAGE_LABELS[p.stage],
              )}</td>
              <td class="n">${p.targetDays}d</td>
              <td class="n ${p.meanDays > p.targetDays ? "bad" : "good"}">${p.meanDays.toFixed(1)}d</td>
              <td class="n">${p.withinTarget}/${p.samples}</td>
              <td class="n">${Math.round((p.withinTarget / p.samples) * 100)}%</td>
            </tr>`,
          )
          .join("");

  return `
    <section class="panel">
      <h2>Waits we do not control</h2>
      <p class="hint">Measured from completed passes. Once a stage has
        ${state.settings.minSamplesToLearn} of them, the real number replaces the placeholder in the forecast.</p>
      <table class="grid">
        <thead><tr><th>Stage</th><th class="n">Assumed</th><th class="n">Mean</th><th class="n">Median</th>
          <th class="n">Range</th><th class="n">n</th><th></th></tr></thead>
        <tbody>${waitRows}</tbody>
      </table>
    </section>

    <section class="panel">
      <h2>Targets we set ourselves</h2>
      <p class="hint">The half of the process the firm actually controls.</p>
      <table class="grid">
        <thead><tr><th>Stage</th><th class="n">Target</th><th class="n">Actual mean</th>
          <th class="n">On time</th><th class="n">Hit rate</th></tr></thead>
        <tbody>${perfRows}</tbody>
      </table>
    </section>
  `;
}

// ---- Settings ----

function settingsTab(state: AppState): string {
  const s = state.settings;
  const targetRows = ALL_STAGES.filter((st) => !UNTIMED_STAGES.has(st))
    .map(
      (st) => `<tr><td>${esc(STAGE_LABELS[st])}</td>
        <td class="n"><input type="number" class="tiny" value="${s.targets[st]}"
          data-act="target" data-stage="${st}"> d</td>
        <td class="n"><input type="number" class="tiny" value="${s.assumedWaits[st]}"
          data-act="assumed" data-stage="${st}"> d</td></tr>`,
    )
    .join("");

  const tierRows = s.fiduciaryTiers
    .map(
      (t, i) => `<tr>
        <td><input type="number" class="mid" value="${t.upTo ?? ""}" placeholder="no cap"
          data-act="tier-upto" data-index="${i}"></td>
        <td><input type="number" class="tiny" step="0.001" value="${t.rate * 100}"
          data-act="tier-rate" data-index="${i}"> %</td>
        <td class="a"><button class="small danger" data-act="remove-tier" data-index="${i}">remove</button></td>
      </tr>`,
    )
    .join("");

  return `
    <section class="panel">
      <h2>Firm defaults</h2>
      <div class="fields">
        <label class="field"><span>Default hourly rate</span>
          <input type="number" value="${s.defaultRate}" data-act="setting" data-field="defaultRate"></label>
        <label class="field"><span>Consent threshold to skip a hearing</span>
          <input type="number" value="${s.waiverThresholdPct}" data-act="setting" data-field="waiverThresholdPct"> </label>
        <label class="field"><span>Passes before a measured wait is trusted</span>
          <input type="number" value="${s.minSamplesToLearn}" data-act="setting" data-field="minSamplesToLearn"></label>
        <label class="field"><span>Haircut on unapproved requests (%)</span>
          <input type="number" value="${s.approvalHaircutPct}" data-act="setting" data-field="approvalHaircutPct"></label>
      </div>
      <p class="hint">Leave the haircut at 0 until you know how much courts actually cut. Guessing
        a number here quietly changes every forecast.</p>
    </section>

    <section class="panel">
      <h2>Stage timing</h2>
      <p class="hint"><strong>Target</strong> is the clock we hold ourselves to — going over puts the
        request on this week's list. <strong>Assumed wait</strong> is the placeholder for stages we
        don't control, used only until enough history accumulates.</p>
      <table class="grid">
        <thead><tr><th>Stage</th><th class="n">Our target</th><th class="n">Assumed wait</th></tr></thead>
        <tbody>${targetRows}</tbody>
      </table>
    </section>

    <section class="panel">
      <h2>Fiduciary fee schedule</h2>
      <p class="hint">Marginal brackets: each rate applies only to the portion of the estate inside it.
        These are placeholders — replace them with your jurisdiction's statute.</p>
      <table class="grid">
        <thead><tr><th>Up to</th><th>Rate</th><th></th></tr></thead>
        <tbody>${tierRows}</tbody>
      </table>
      <div class="row">
        <button class="small" data-act="add-tier">Add bracket</button>
        <label class="check"><input type="checkbox" data-act="confirm-schedule"
          ${s.fiduciaryScheduleConfirmed ? "checked" : ""}>
          These are my jurisdiction's real brackets</label>
      </div>
    </section>

    <section class="panel">
      <h2>Your data</h2>
      <p class="hint">Everything stays in this browser. Nothing is sent anywhere, which also means
        nothing is backed up until you export it.</p>
      <div class="row">
        <button data-act="export">Export JSON</button>
        <button data-act="import">Import JSON</button>
        <button class="danger" data-act="reset">Erase everything</button>
      </div>
    </section>
  `;
}

function option(value: string, label: string, current: string): string {
  return `<option value="${esc(value)}"${value === current ? " selected" : ""}>${esc(label)}</option>`;
}
