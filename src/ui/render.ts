import type { CaseInstance, GameState, Outcome, Staff } from "../engine/types.ts";
import { successChance } from "../engine/jobs.ts";
import { SKILL_AXES, SKILL_LABELS, type SkillAxis } from "../data/skills.ts";

// UI-only state, kept separate from the game state. Selection-driven, the way
// 4X / squad-management games work: pick a case on the board, then staff it in
// the briefing panel.
export interface UiState {
  selectedCaseId: string | null;
  selectedStaff: Set<string>; // staff toggled into the briefing's team
  showSummary: boolean;
}

export interface Handlers {
  selectCase: (id: string) => void;
  toggleStaff: (id: string) => void;
  assign: () => void;
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

function chanceBand(chance: number): string {
  if (chance >= 0.66) return "good";
  if (chance >= 0.4) return "warn";
  return "bad";
}

function selectedStaffList(game: GameState, ui: UiState): Staff[] {
  return game.staff.filter((s) => ui.selectedStaff.has(s.id));
}

function skillTags(axes: SkillAxis[]): string {
  return axes.map((a) => `<span class="tag">${SKILL_LABELS[a]}</span>`).join("");
}

function staffSkillSummary(s: Staff): string {
  // Two strongest axes — enough to staff sensibly at a glance.
  return SKILL_AXES.map((a) => ({ a, v: s.skills[a] }))
    .sort((x, y) => y.v - x.v)
    .slice(0, 2)
    .map(({ a, v }) => `${SKILL_LABELS[a]} ${v}`)
    .join(" · ");
}

function jobWeeks(game: GameState, jobId: string | null): number {
  const job = game.activeJobs.find((j) => j.id === jobId);
  return job ? job.weeksRemaining : 0;
}

// ---- Top HUD (Civ / Master of Orion style persistent resource bar) ----
function hud(game: GameState): string {
  const idle = game.staff.filter((s) => s.status === "idle").length;
  return `
    <header class="hud">
      <div class="brand">FIRM</div>
      <div class="hud-stats">
        <div class="hud-stat">
          <span class="hud-label">Week</span>
          <span class="hud-value">${game.week}</span>
        </div>
        <div class="hud-stat">
          <span class="hud-label">Cash</span>
          <span class="hud-value ${game.money < 0 ? "bad" : "good"}">${money(
            game.money,
          )}</span>
        </div>
        <div class="hud-stat">
          <span class="hud-label">Idle Staff</span>
          <span class="hud-value ${idle > 0 ? "warn" : ""}">${idle}/${
            game.staff.length
          }</span>
        </div>
      </div>
      <button id="new-game" class="ghost">New Game</button>
    </header>`;
}

// ---- Left: personnel roster (Football Manager / XCOM barracks) ----
function rosterPanel(game: GameState): string {
  const rows = game.staff
    .map((s) => {
      const idle = s.status === "idle";
      const dot = idle ? "dot-idle" : "dot-busy";
      const status = idle
        ? "Available"
        : `Assigned · ${jobWeeks(game, s.jobId)}w`;
      return `
        <li class="roster-row">
          <span class="dot ${dot}"></span>
          <div class="roster-main">
            <div class="roster-top">
              <strong>${s.name}</strong>
              <span class="role">${s.role}</span>
            </div>
            <div class="muted small">${staffSkillSummary(s)}</div>
            <div class="roster-bottom small">
              <span class="${idle ? "good" : "warn"}">${status}</span>
              <span class="muted">${money(s.salary)}/wk</span>
            </div>
          </div>
        </li>`;
    })
    .join("");
  return `
    <aside class="panel roster">
      <h2>Personnel</h2>
      <ul class="roster-list">${rows}</ul>
    </aside>`;
}

// ---- Center: the case board + in-progress tray ----
function progressBar(done: number, total: number): string {
  const fill = Math.round((done / total) * 100);
  return `<div class="progress"><div class="progress-fill" style="width:${fill}%"></div></div>`;
}

function activeTray(game: GameState): string {
  if (game.activeJobs.length === 0) return "";
  const rows = game.activeJobs
    .map((j) => {
      const names = j.staffIds
        .map((id) => game.staff.find((s) => s.id === id)?.name ?? "?")
        .join(", ");
      const done = j.case.durationWeeks - j.weeksRemaining;
      return `
        <div class="active-card">
          <div class="active-top">
            <strong>${j.case.title}</strong>
            <span class="warn small">${j.weeksRemaining}w left</span>
          </div>
          ${progressBar(done, j.case.durationWeeks)}
          <div class="muted small">${names}</div>
        </div>`;
    })
    .join("");
  return `
    <div class="tray">
      <h3>In Progress</h3>
      <div class="active-grid">${rows}</div>
    </div>`;
}

function caseBoardCard(ui: UiState, c: CaseInstance): string {
  const selected = ui.selectedCaseId === c.id;
  return `
    <button class="board-case ${selected ? "selected" : ""}" data-case="${c.id}">
      <div class="board-top">
        <strong>${c.title}</strong>
        <span class="payoff good">${money(c.payoff)}</span>
      </div>
      <div class="tags">${skillTags(c.requiredSkills)}</div>
      <div class="board-meta muted small">
        Difficulty ${c.difficulty} · ${c.durationWeeks}w
      </div>
    </button>`;
}

function boardPanel(game: GameState, ui: UiState): string {
  const cards = game.availableCases.map((c) => caseBoardCard(ui, c)).join("");
  return `
    <section class="panel board">
      <h2>Caseload</h2>
      <p class="muted small">Pick a case to staff it. Idle staff cost you every week.</p>
      ${activeTray(game)}
      <div class="board-grid">
        ${cards || '<p class="muted">No cases on offer.</p>'}
      </div>
    </section>`;
}

// ---- Right: briefing / assignment panel (XCOM squad-select pattern) ----
function firmOverview(game: GameState): string {
  const payroll = game.staff.reduce((sum, s) => sum + s.salary, 0);
  const idle = game.staff.filter((s) => s.status === "idle").length;
  return `
    <div class="briefing-empty">
      <p class="muted">Select a case from the board to assemble a team.</p>
      <div class="overview">
        <div class="ov-row"><span class="muted">Weekly payroll</span><span class="bad">-${money(
          payroll,
        )}</span></div>
        <div class="ov-row"><span class="muted">Active cases</span><span>${
          game.activeJobs.length
        }</span></div>
        <div class="ov-row"><span class="muted">Idle staff</span><span class="${
          idle ? "warn" : ""
        }">${idle}</span></div>
      </div>
      <p class="hint small">Tip: press <kbd>E</kbd> or <kbd>Enter</kbd> to end the week.</p>
    </div>`;
}

function teamRow(game: GameState, ui: UiState, s: Staff): string {
  const idle = s.status === "idle";
  const checked = ui.selectedStaff.has(s.id);
  const cls = ["team-row", idle ? "" : "busy", checked ? "checked" : ""]
    .filter(Boolean)
    .join(" ");
  const status = idle
    ? staffSkillSummary(s)
    : `Busy · ${jobWeeks(game, s.jobId)}w left`;
  return `
    <button class="${cls}" data-team="${s.id}" ${
      idle ? "" : "disabled"
    }>
      <span class="checkbox">${checked ? "✓" : ""}</span>
      <span class="team-main">
        <span class="team-top"><strong>${s.name}</strong><span class="role">${
          s.role
        }</span></span>
        <span class="muted small">${status}</span>
      </span>
    </button>`;
}

function briefingPanel(game: GameState, ui: UiState): string {
  const c = game.availableCases.find((x) => x.id === ui.selectedCaseId);
  if (!c) {
    return `<aside class="panel briefing"><h2>Briefing</h2>${firmOverview(
      game,
    )}</aside>`;
  }

  const team = selectedStaffList(game, ui);
  const chance = team.length > 0 ? successChance(c, team) : null;
  const band = chance !== null ? chanceBand(chance) : "muted";
  const oddsBlock =
    chance === null
      ? `<div class="odds-empty muted small">Add staff to see success odds.</div>`
      : `<div class="odds-wrap">
           <div class="odds-top"><span>Success chance</span><span class="${band}">${pct(
             chance,
           )}</span></div>
           <div class="odds-bar"><div class="odds-fill ${band}" style="width:${Math.round(
             chance * 100,
           )}%"></div></div>
         </div>`;

  const rows = game.staff.map((s) => teamRow(game, ui, s)).join("");

  return `
    <aside class="panel briefing">
      <h2>Briefing</h2>
      <div class="brief-head">
        <strong class="brief-title">${c.title}</strong>
        <span class="payoff good">${money(c.payoff)}</span>
      </div>
      <p class="flavor">${c.flavor}</p>
      <div class="tags">${skillTags(c.requiredSkills)}</div>
      <div class="brief-meta muted small">
        Difficulty ${c.difficulty} · ${c.durationWeeks} week${
          c.durationWeeks > 1 ? "s" : ""
        } · risk ${money(c.riskCost)} on a loss
      </div>
      <h3 class="assign-h">Assign Team</h3>
      <div class="team-list">${rows}</div>
      ${oddsBlock}
      <button id="confirm-assign" class="primary-wide" ${
        team.length === 0 ? "disabled" : ""
      }>Assign ${team.length || ""} → Open Case</button>
    </aside>`;
}

// ---- Bottom action bar: primary End Turn pinned bottom-right (Civ/MoO) ----
function actionBar(game: GameState): string {
  const payroll = game.staff.reduce((sum, s) => sum + s.salary, 0);
  return `
    <footer class="actionbar">
      <span class="muted small">Ending the week pays <span class="bad">-${money(
        payroll,
      )}</span> in salaries and resolves active cases.</span>
      <button id="end-turn" class="end-turn">End Turn ▸ <kbd>E</kbd></button>
    </footer>`;
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
    ${hud(game)}
    <main class="layout">
      ${rosterPanel(game)}
      ${boardPanel(game, ui)}
      ${briefingPanel(game, ui)}
    </main>
    ${actionBar(game)}
    ${ui.showSummary ? summaryModal(game) : ""}
  `;

  root
    .querySelectorAll<HTMLButtonElement>("[data-case]")
    .forEach((el) =>
      el.addEventListener("click", () => handlers.selectCase(el.dataset.case!)),
    );

  root
    .querySelectorAll<HTMLButtonElement>("[data-team]")
    .forEach((el) =>
      el.addEventListener("click", () => handlers.toggleStaff(el.dataset.team!)),
    );

  const confirm = root.querySelector<HTMLButtonElement>("#confirm-assign");
  if (confirm) confirm.addEventListener("click", handlers.assign);

  root
    .querySelector<HTMLButtonElement>("#end-turn")!
    .addEventListener("click", handlers.endTurn);
  root
    .querySelector<HTMLButtonElement>("#new-game")!
    .addEventListener("click", handlers.newGame);

  const close = root.querySelector<HTMLButtonElement>("#close-summary");
  if (close) close.addEventListener("click", handlers.closeSummary);
}
