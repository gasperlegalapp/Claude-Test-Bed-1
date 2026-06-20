import type { CaseInstance, GameState, Outcome, Staff } from "../engine/types.ts";
import { successChance } from "../engine/jobs.ts";
import { SKILL_AXES, SKILL_LABELS, type SkillAxis } from "../data/skills.ts";

export interface UiState {
  selectedStaff: Set<string>;
  showSummary: boolean;
}

export interface Handlers {
  toggleStaff: (id: string) => void;
  assign: (caseId: string) => void;
  endTurn: () => void;
  closeSummary: () => void;
  newGame: () => void;
}

const money = (n: number): string =>
  (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US");

const pct = (n: number): string => `${Math.round(n * 100)}%`;

const OUTCOME_LABEL: Record<Outcome, string> = {
  critical: "Critical win",
  success: "Won",
  partial: "Partial",
  failure: "Lost",
};

function selectedStaffList(game: GameState, ui: UiState): Staff[] {
  return game.staff.filter((s) => ui.selectedStaff.has(s.id));
}

function staffSkillSummary(s: Staff): string {
  // Show the staffer's two strongest axes — enough to assign sensibly.
  return SKILL_AXES.map((a) => ({ a, v: s.skills[a] }))
    .sort((x, y) => y.v - x.v)
    .slice(0, 2)
    .map(({ a, v }) => `${SKILL_LABELS[a]} ${v}`)
    .join(" · ");
}

function staffPanel(game: GameState, ui: UiState): string {
  const rows = game.staff
    .map((s) => {
      const idle = s.status === "idle";
      const selected = ui.selectedStaff.has(s.id);
      const cls = ["staff-card", idle ? "" : "busy", selected ? "selected" : ""]
        .filter(Boolean)
        .join(" ");
      const status = idle
        ? "Idle"
        : `On assignment · ${jobWeeks(game, s.jobId)}w left`;
      return `
        <div class="${cls}" data-staff="${s.id}" ${
          idle ? "" : 'aria-disabled="true"'
        }>
          <div class="staff-head">
            <strong>${s.name}</strong>
            <span class="role">${s.role}</span>
          </div>
          <div class="muted">${staffSkillSummary(s)}</div>
          <div class="staff-foot">
            <span class="${idle ? "good" : "warn"}">${status}</span>
            <span class="muted">${money(s.salary)}/wk</span>
          </div>
        </div>`;
    })
    .join("");

  return `
    <section class="panel">
      <h2>Staff</h2>
      <p class="muted small">Select idle staff, then assign them to a case.</p>
      ${rows}
    </section>`;
}

function jobWeeks(game: GameState, jobId: string | null): number {
  const job = game.activeJobs.find((j) => j.id === jobId);
  return job ? job.weeksRemaining : 0;
}

function skillTags(axes: SkillAxis[]): string {
  return axes.map((a) => `<span class="tag">${SKILL_LABELS[a]}</span>`).join("");
}

function caseCard(game: GameState, ui: UiState, c: CaseInstance): string {
  const team = selectedStaffList(game, ui);
  const chance = team.length > 0 ? successChance(c, team) : null;
  const canAssign = team.length > 0;
  const chanceLine =
    chance === null
      ? `<span class="muted small">select staff to preview odds</span>`
      : `<span class="odds ${chanceBand(chance)}">${pct(chance)} success</span>`;

  return `
    <div class="case-card">
      <div class="case-head">
        <strong>${c.title}</strong>
        <span class="payoff good">${money(c.payoff)}</span>
      </div>
      <p class="flavor">${c.flavor}</p>
      <div class="tags">${skillTags(c.requiredSkills)}</div>
      <div class="case-meta muted small">
        Difficulty ${c.difficulty} · ${c.durationWeeks}w · risk ${money(
          c.riskCost,
        )}
      </div>
      <div class="case-foot">
        ${chanceLine}
        <button class="assign-btn" data-assign="${c.id}" ${
          canAssign ? "" : "disabled"
        }>Assign${team.length ? ` (${team.length})` : ""}</button>
      </div>
    </div>`;
}

function chanceBand(chance: number): string {
  if (chance >= 0.66) return "good";
  if (chance >= 0.4) return "warn";
  return "bad";
}

function casePanel(game: GameState, ui: UiState): string {
  const cards = game.availableCases.map((c) => caseCard(game, ui, c)).join("");
  return `
    <section class="panel">
      <h2>Available Cases</h2>
      ${cards || '<p class="muted">No cases on offer.</p>'}
    </section>`;
}

function activePanel(game: GameState): string {
  if (game.activeJobs.length === 0) {
    return `
      <section class="panel">
        <h2>In Progress</h2>
        <p class="muted">No active cases. Idle staff still draw salary — put them to work.</p>
      </section>`;
  }
  const rows = game.activeJobs
    .map((j) => {
      const names = j.staffIds
        .map((id) => game.staff.find((s) => s.id === id)?.name ?? "?")
        .join(", ");
      return `
        <div class="job-card">
          <div class="case-head">
            <strong>${j.case.title}</strong>
            <span class="warn">${j.weeksRemaining}w left</span>
          </div>
          <div class="muted small">${names}</div>
        </div>`;
    })
    .join("");
  return `
    <section class="panel">
      <h2>In Progress</h2>
      ${rows}
    </section>`;
}

function topbar(game: GameState): string {
  return `
    <header class="topbar">
      <h1>FIRM</h1>
      <span class="stat">Week <strong>${game.week}</strong></span>
      <span class="stat">Cash <strong class="${
        game.money < 0 ? "bad" : "good"
      }">${money(game.money)}</strong></span>
      <span class="spacer"></span>
      <button id="new-game" class="ghost">New Game</button>
      <button id="end-turn">End Turn ▸</button>
    </header>`;
}

function summaryModal(game: GameState): string {
  const log = game.lastTurn;
  if (!log) return "";
  const lines =
    log.resolved.length === 0
      ? `<li class="muted">No cases resolved this week.</li>`
      : log.resolved
          .map(
            (r) => `
            <li class="resolve-line ${r.outcome}">
              <span class="o-tag">${OUTCOME_LABEL[r.outcome]}</span>
              <span class="o-title">${r.caseTitle}</span>
              <span class="o-money ${r.moneyDelta >= 0 ? "good" : "bad"}">${
                r.moneyDelta >= 0 ? "+" : ""
              }${money(r.moneyDelta)}</span>
            </li>`,
          )
          .join("");

  return `
    <div class="modal-backdrop" id="summary-backdrop">
      <div class="modal">
        <h2>Week ${log.week} — Recap</h2>
        <ul class="resolve-list">${lines}</ul>
        <div class="recap-foot">
          <span class="muted">Salaries paid: <span class="bad">-${money(
            log.salariesPaid,
          )}</span></span>
          <button id="close-summary">Continue ▸</button>
        </div>
      </div>
    </div>`;
}

export function renderApp(
  root: HTMLElement,
  game: GameState,
  ui: UiState,
  handlers: Handlers,
): void {
  root.innerHTML = `
    ${topbar(game)}
    <main class="layout">
      ${staffPanel(game, ui)}
      ${activePanel(game)}
      ${casePanel(game, ui)}
    </main>
    ${ui.showSummary ? summaryModal(game) : ""}
  `;

  root
    .querySelectorAll<HTMLElement>("[data-staff]")
    .forEach((el) =>
      el.addEventListener("click", () => {
        if (el.getAttribute("aria-disabled") === "true") return;
        handlers.toggleStaff(el.dataset.staff!);
      }),
    );

  root
    .querySelectorAll<HTMLButtonElement>("[data-assign]")
    .forEach((el) =>
      el.addEventListener("click", () => handlers.assign(el.dataset.assign!)),
    );

  root
    .querySelector<HTMLButtonElement>("#end-turn")!
    .addEventListener("click", handlers.endTurn);
  root
    .querySelector<HTMLButtonElement>("#new-game")!
    .addEventListener("click", handlers.newGame);

  const close = root.querySelector<HTMLButtonElement>("#close-summary");
  if (close) close.addEventListener("click", handlers.closeSummary);
}
