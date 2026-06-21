import type {
  District,
  GameState,
  Job,
  Outcome,
  Staff,
  TurnEvent,
} from "../engine/types.ts";
import { successChance, OFFICE_SCORE_BONUS } from "../engine/jobs.ts";
import { computeValuation, evaluateGoals } from "../engine/scoring.ts";
import { xpForLevel, MAX_SKILL } from "../engine/growth.ts";
import { BUILD_COST, BUILD_WEEKS, SCOUT_WEEKS } from "../engine/state.ts";
import { SKILL_AXES, SKILL_LABELS, type SkillAxis } from "../data/skills.ts";
import type { GoalMetric } from "../data/goals.ts";
import { CITY_COLS } from "../data/city.ts";
import { PRACTICE_AREAS, type PracticeArea } from "../data/practices.ts";
import { CASE_TEMPLATES } from "../data/cases.ts";

const SKILL_SHORT: Record<SkillAxis, string> = {
  litigation: "Lit",
  research: "Res",
  negotiation: "Neg",
  diligence: "Dil",
  networking: "Net",
};

// UI-only state. Selection-driven, like a 4X map: pick a district, then act on
// it (scout it, build there, or staff one of its cases).
export interface UiState {
  selectedDistrictId: string | null;
  selectedCaseId: string | null;
  selectedStaff: Set<string>;
  showSummary: boolean;
  showPractices: boolean;
}

export interface Handlers {
  selectDistrict: (id: string) => void;
  selectCase: (id: string) => void;
  toggleStaff: (id: string) => void;
  spendSkillPoint: (staffId: string, axis: SkillAxis) => void;
  assignCase: () => void;
  scout: () => void;
  buildOffice: () => void;
  openPractices: () => void;
  closePractices: () => void;
  unlockPractice: (id: string) => void;
  endTurn: () => void;
  closeSummary: () => void;
  newGame: () => void;
}

const money = (n: number): string =>
  (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US");
const pct = (n: number): string => `${Math.round(n * 100)}%`;
const stars = (wealth: number): string =>
  "●".repeat(wealth) + "○".repeat(Math.max(0, 3 - wealth));

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
// All five skills, always shown (even at 0) so growth is visible. When the
// staffer has skill points to spend, each raisable skill becomes a button.
function allSkillsLine(s: Staff, spendable = false): string {
  return SKILL_AXES.map((a) => {
    const v = s.skills[a];
    const canRaise = spendable && s.skillPoints > 0 && v < MAX_SKILL;
    if (canRaise) {
      return `<button class="sk sk-spend" data-spend="${s.id}|${a}">${SKILL_SHORT[a]} ${v} <span class="plus">+</span></button>`;
    }
    return `<span class="sk ${v === 0 ? "sk-zero" : ""}">${SKILL_SHORT[a]} ${v}</span>`;
  }).join("");
}
function jobWeeks(game: GameState, jobId: string | null): number {
  const job = game.activeJobs.find((j) => j.id === jobId);
  return job ? job.weeksRemaining : 0;
}
function districtOf(game: GameState, id: string | null): District | undefined {
  return game.districts.find((d) => d.id === id) ?? undefined;
}

// ---- Top HUD ----
function hud(game: GameState): string {
  const idle = game.staff.filter((s) => s.status === "idle").length;
  const offices = game.districts.filter((d) => d.hasOffice).length;
  return `
    <header class="hud">
      <div class="brand">FIRM</div>
      <div class="hud-stats">
        <div class="hud-stat"><span class="hud-label">Week</span><span class="hud-value">${
          game.week
        }</span></div>
        <div class="hud-stat"><span class="hud-label">Cash</span><span class="hud-value ${
          game.money < 0 ? "bad" : "good"
        }">${money(game.money)}</span></div>
        <div class="hud-stat"><span class="hud-label">Reputation</span><span class="hud-value ${
          game.reputation <= 3 ? "bad" : ""
        }">${game.reputation}</span></div>
        <div class="hud-stat"><span class="hud-label">Valuation</span><span class="hud-value accent">${money(
          computeValuation(game),
        )}</span></div>
        <div class="hud-stat"><span class="hud-label">Offices</span><span class="hud-value">${offices}</span></div>
        <div class="hud-stat"><span class="hud-label">Practices</span><span class="hud-value">${
          game.unlockedPractices.length
        }</span></div>
        <div class="hud-stat"><span class="hud-label">Idle</span><span class="hud-value ${
          idle > 0 ? "warn" : ""
        }">${idle}/${game.staff.length}</span></div>
      </div>
      <button id="open-practices" class="ghost">Practice Areas</button>
      <button id="new-game" class="ghost">New Game</button>
    </header>`;
}

// ---- Left: roster + goals ----
function rosterPanel(game: GameState): string {
  const rows = game.staff
    .map((s) => {
      const idle = s.status === "idle";
      const status = idle
        ? "Available"
        : `Assigned · ${jobWeeks(game, s.jobId)}w`;
      const xpPct = Math.min(100, Math.round((s.xp / xpForLevel(s.level)) * 100));
      const points =
        s.skillPoints > 0
          ? `<span class="sp-badge">${s.skillPoints} pt${
              s.skillPoints > 1 ? "s" : ""
            } to spend</span>`
          : "";
      return `
        <li class="roster-row">
          <span class="dot ${idle ? "dot-idle" : "dot-busy"}"></span>
          <div class="roster-main">
            <div class="roster-top"><strong>${s.name}</strong><span class="role">${
              s.role
            }</span></div>
            <div class="lvl-line">
              <span class="lvl">Lv ${s.level}</span>
              <div class="xp-bar" title="${s.xp} / ${xpForLevel(
                s.level,
              )} XP"><div class="xp-fill" style="width:${xpPct}%"></div></div>
              ${points}
            </div>
            <div class="skill-line">${allSkillsLine(s, true)}</div>
            <div class="roster-bottom small"><span class="${
              idle ? "good" : "warn"
            }">${status}</span><span class="muted">${money(s.salary)}/wk</span></div>
          </div>
        </li>`;
    })
    .join("");
  return `<aside class="panel roster"><h2>Personnel</h2><ul class="roster-list">${rows}</ul></aside>`;
}

function goalMetricFormat(metric: GoalMetric, value: number): string {
  return metric === "reputation" ? `${value}` : money(value);
}
function goalsPanel(game: GameState): string {
  const rows = evaluateGoals(game)
    .map(({ goal, current, done }) => {
      const p = Math.min(100, Math.round((current / goal.target) * 100));
      return `
        <li class="goal ${done ? "done" : ""}">
          <div class="goal-top">${done ? "✓ " : ""}${goal.label}${
            goal.isVictory ? ' <span class="crown">★</span>' : ""
          }</div>
          <div class="goal-bar"><div class="goal-fill ${
            done ? "good" : ""
          }" style="width:${p}%"></div></div>
          <div class="goal-meta muted small">${goalMetricFormat(
            goal.metric,
            current,
          )} / ${goalMetricFormat(goal.metric, goal.target)}</div>
        </li>`;
    })
    .join("");
  return `<section class="panel goals"><h2>Goals</h2><ul class="goal-list">${rows}</ul></section>`;
}

// ---- Center: city map + in-progress tray ----
function cellJobLabel(game: GameState, d: District): string {
  const job = game.activeJobs.find(
    (j) => j.kind !== "case" && j.districtId === d.id,
  );
  if (job)
    return `<div class="cell-job warn small">${
      job.kind === "scout" ? "Scouting" : "Building"
    } · ${job.weeksRemaining}w</div>`;
  return "";
}

// Cheap deterministic hash so each district's skyline is stable across renders.
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// A little CSS skyline: more and taller buildings for wealthier districts.
function skyline(d: District): string {
  const count = 4 + d.wealth * 2; // 6–10 buildings
  let bars = "";
  for (let i = 0; i < count; i++) {
    const r = hashStr(`${d.id}:${i}`) % 100;
    const h = Math.min(96, Math.round(28 + (r / 100) * 40 + d.wealth * 9));
    bars += `<span class="bldg" style="height:${h}%"></span>`;
  }
  const kind = d.isHome ? "home" : d.hasOffice ? "office" : "";
  return `<div class="skyline ${kind}">${bars}</div>`;
}

function mapCell(game: GameState, ui: UiState, d: District): string {
  const selected = ui.selectedDistrictId === d.id;
  const caseCount = game.availableCases.filter(
    (c) => c.districtId === d.id,
  ).length;
  const classes = [
    "cell",
    d.discovered ? "discovered" : "fogged",
    d.hasOffice ? "office" : "",
    d.isHome ? "home" : "",
    selected ? "selected" : "",
  ]
    .filter(Boolean)
    .join(" ");

  if (!d.discovered) {
    return `
      <button class="${classes}" data-district="${d.id}">
        <div class="cell-fog">?</div>
        <div class="cell-fog-label">Unscouted</div>
        ${cellJobLabel(game, d)}
      </button>`;
  }

  const marker = d.isHome
    ? '<span class="hq">HQ</span>'
    : d.hasOffice
      ? '<span class="hq office-tag">Office</span>'
      : caseCount > 0
        ? `<span class="case-pip">${caseCount}</span>`
        : "";

  return `
    <button class="${classes}" data-district="${d.id}">
      <div class="cell-top">
        <strong>${d.name}</strong>
        ${marker}
      </div>
      <div class="cell-meta muted small">${SKILL_LABELS[d.dominantSkill]} · <span class="wealth">${stars(
        d.wealth,
      )}</span></div>
      ${skyline(d)}
      ${cellJobLabel(game, d)}
    </button>`;
}

function cityMap(game: GameState, ui: UiState): string {
  const cells = [...game.districts]
    .sort((a, b) => a.y * CITY_COLS + a.x - (b.y * CITY_COLS + b.x))
    .map((d) => mapCell(game, ui, d))
    .join("");
  return `
    <section class="panel map-panel">
      <h2>The City</h2>
      <p class="muted small">Click a district. Scout the fog, open offices, take local cases.</p>
      <div class="city-grid">${cells}</div>
    </section>`;
}

function jobTitle(j: Job): string {
  if (j.kind === "case") return j.case.title;
  if (j.kind === "scout") return `Scout ${j.districtName}`;
  return `Build office · ${j.districtName}`;
}
function jobDuration(j: Job): number {
  if (j.kind === "case") return j.case.durationWeeks;
  return j.kind === "scout" ? SCOUT_WEEKS : BUILD_WEEKS;
}

function activeTray(game: GameState): string {
  if (game.activeJobs.length === 0) {
    return `<section class="panel"><h2>In Progress</h2><p class="muted small">Nothing underway. Idle staff still draw salary — put them to work.</p></section>`;
  }
  const rows = game.activeJobs
    .map((j) => {
      const names = j.staffIds
        .map((id) => game.staff.find((s) => s.id === id)?.name ?? "?")
        .join(", ");
      const total = jobDuration(j);
      const fill = Math.round(((total - j.weeksRemaining) / total) * 100);
      return `
        <div class="active-card">
          <div class="active-top"><strong>${jobTitle(
            j,
          )}</strong><span class="warn small">${j.weeksRemaining}w</span></div>
          <div class="progress"><div class="progress-fill" style="width:${fill}%"></div></div>
          <div class="muted small">${names}</div>
        </div>`;
    })
    .join("");
  return `<section class="panel"><h2>In Progress</h2><div class="active-grid">${rows}</div></section>`;
}

// ---- Right: context-sensitive district panel ----
function teamPicker(game: GameState, ui: UiState): string {
  const rows = game.staff
    .map((s) => {
      const idle = s.status === "idle";
      const checked = ui.selectedStaff.has(s.id);
      const cls = ["team-row", idle ? "" : "busy", checked ? "checked" : ""]
        .filter(Boolean)
        .join(" ");
      const status = idle
        ? `<span class="skill-line">${allSkillsLine(s)}</span>`
        : `<span class="muted small">Busy · ${jobWeeks(game, s.jobId)}w left</span>`;
      return `
        <button class="${cls}" data-team="${s.id}" ${idle ? "" : "disabled"}>
          <span class="checkbox">${checked ? "✓" : ""}</span>
          <span class="team-main">
            <span class="team-top"><strong>${s.name}</strong><span class="role">${
              s.role
            }</span></span>
            ${status}
          </span>
        </button>`;
    })
    .join("");
  return `<h3 class="assign-h">Assign Team</h3><div class="team-list">${rows}</div>`;
}

function districtCaseRows(game: GameState, ui: UiState, d: District): string {
  const cases = game.availableCases.filter((c) => c.districtId === d.id);
  if (cases.length === 0)
    return `<p class="muted small">No open cases here right now.</p>`;
  return cases
    .map((c) => {
      const selected = ui.selectedCaseId === c.id;
      return `
        <button class="dcase ${selected ? "selected" : ""}" data-case="${c.id}">
          <div class="dcase-top"><strong>${c.title}</strong><span class="payoff good">${money(
            c.payoff,
          )}</span></div>
          <div class="tags">${skillTags(c.requiredSkills)}</div>
          <div class="muted small">Difficulty ${c.difficulty} · ${
            c.durationWeeks
          }w · risk ${money(c.riskCost)}</div>
        </button>`;
    })
    .join("");
}

function oddsBlock(chance: number | null): string {
  if (chance === null)
    return `<div class="odds-empty muted small">Add staff to see success odds.</div>`;
  const band = chanceBand(chance);
  return `<div class="odds-wrap">
      <div class="odds-top"><span>Success chance</span><span class="${band}">${pct(
        chance,
      )}</span></div>
      <div class="odds-bar"><div class="odds-fill ${band}" style="width:${Math.round(
        chance * 100,
      )}%"></div></div>
    </div>`;
}

function districtPanel(game: GameState, ui: UiState): string {
  const d = districtOf(game, ui.selectedDistrictId);
  if (!d) {
    return `<aside class="panel briefing"><h2>District</h2><p class="muted">Select a district on the map to act on it.</p></aside>`;
  }

  const team = selectedStaffList(game, ui);
  const teamCount = team.length;

  // Fogged: only option is to scout.
  if (!d.discovered) {
    return `
      <aside class="panel briefing">
        <h2>District</h2>
        <div class="brief-head"><strong class="brief-title">Unknown District</strong></div>
        <p class="flavor">Fog still covers this part of the city. Send staff to scout it — you'll learn its wealth, its specialty, and the work on offer.</p>
        ${teamPicker(game, ui)}
        <button id="scout-btn" class="primary-wide" ${
          teamCount === 0 ? "disabled" : ""
        }>Scout District ▸ (${SCOUT_WEEKS}w)</button>
      </aside>`;
  }

  // Discovered: stats, local cases, build option.
  const selectedCase = game.availableCases.find(
    (c) => c.id === ui.selectedCaseId && c.districtId === d.id,
  );
  const bonus = d.hasOffice ? OFFICE_SCORE_BONUS : 0;
  const chance =
    selectedCase && teamCount > 0
      ? successChance(selectedCase, team, bonus)
      : null;

  const statusBadge = d.isHome
    ? '<span class="hq">HQ</span>'
    : d.hasOffice
      ? '<span class="hq office-tag">Office</span>'
      : '<span class="muted small">No office</span>';

  const assignBlock = selectedCase
    ? `${oddsBlock(chance)}
       <button id="confirm-assign" class="primary-wide" ${
         teamCount === 0 ? "disabled" : ""
       }>Assign ${teamCount || ""} → ${selectedCase.title}</button>`
    : `<p class="muted small">Pick a case below, then assign a team.</p>`;

  const buildBlock = d.hasOffice
    ? `<div class="office-note good small">✓ Office active — +${OFFICE_SCORE_BONUS} to case odds here.</div>`
    : `<button id="build-btn" class="secondary-wide" ${
        teamCount === 0 || game.money < BUILD_COST ? "disabled" : ""
      }>Build Office — ${money(BUILD_COST)}, ${BUILD_WEEKS}w</button>
       ${
         game.money < BUILD_COST
           ? `<div class="muted small">Need ${money(BUILD_COST)} to build.</div>`
           : ""
       }`;

  return `
    <aside class="panel briefing">
      <h2>District</h2>
      <div class="brief-head">
        <strong class="brief-title">${d.name}</strong>
        ${statusBadge}
      </div>
      <div class="brief-meta muted small">
        Wealth <span class="wealth">${stars(d.wealth)}</span> · Specialty ${
          SKILL_LABELS[d.dominantSkill]
        }
      </div>
      ${teamPicker(game, ui)}
      <h3 class="assign-h">Cases in ${d.name}</h3>
      <div class="dcase-list">${districtCaseRows(game, ui, d)}</div>
      ${assignBlock}
      <div class="build-block">${buildBlock}</div>
    </aside>`;
}

// ---- Bottom bar ----
function actionBar(game: GameState): string {
  const payroll = game.staff.reduce((sum, s) => sum + s.salary, 0);
  return `
    <footer class="actionbar">
      <span class="muted small">Ending the week pays <span class="bad">-${money(
        payroll,
      )}</span> in salaries and resolves all active work.</span>
      <button id="end-turn" class="end-turn">End Turn ▸ <kbd>E</kbd></button>
    </footer>`;
}

// ---- Recap modal ----
function repBadge(rep: number | undefined): string {
  if (!rep) return "";
  const cls = rep > 0 ? "good" : "bad";
  return `<span class="o-rep ${cls}">${rep > 0 ? "+" : ""}${rep} rep</span>`;
}
function eventLine(e: TurnEvent): string {
  if (e.kind === "case") {
    return `
      <li class="resolve-line ${e.outcome}">
        <span class="o-tag">${OUTCOME_LABEL[e.outcome!]}</span>
        <span class="o-title">${e.title}</span>
        <span class="o-deltas">
          <span class="o-money ${
            (e.moneyDelta ?? 0) >= 0 ? "good" : "bad"
          }">${(e.moneyDelta ?? 0) >= 0 ? "+" : ""}${money(e.moneyDelta ?? 0)}</span>
          ${repBadge(e.repDelta)}
        </span>
      </li>`;
  }
  if (e.kind === "growth") {
    return `
      <li class="resolve-line growth">
        <span class="o-tag good">Trained</span>
        <span class="o-title">${e.title}</span>
        <span class="o-deltas good small">${e.detail ?? ""}</span>
      </li>`;
  }
  return `
    <li class="resolve-line ${e.kind}">
      <span class="o-tag accent">${e.kind === "scout" ? "Scouted" : "Office"}</span>
      <span class="o-title">${e.title}</span>
      <span class="o-deltas muted small">${e.detail ?? ""}</span>
    </li>`;
}
function summaryModal(game: GameState): string {
  const log = game.lastTurn;
  if (!log) return "";
  const lines =
    log.events.length === 0
      ? `<li class="muted">A quiet week. Nothing resolved.</li>`
      : log.events.map(eventLine).join("");
  return `
    <div class="modal-backdrop">
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

// ---- Practice-area tech tree ----
function practiceCard(game: GameState, area: PracticeArea): string {
  const unlocked = game.unlockedPractices.includes(area.id);
  const prereqsMet = area.prereqs.every((p) =>
    game.unlockedPractices.includes(p),
  );
  const affordable =
    game.money >= area.costMoney && game.reputation >= area.costRep;

  const unlocks = CASE_TEMPLATES.filter((t) => t.practiceArea === area.id)
    .map((t) => t.title)
    .join(", ");
  const prereqNames = area.prereqs
    .map((p) => PRACTICE_AREAS.find((a) => a.id === p)?.name ?? p)
    .join(", ");

  let stateTag: string;
  let action: string;
  if (unlocked) {
    stateTag = `<span class="pa-tag good">Unlocked</span>`;
    action = `<div class="muted small">Active</div>`;
  } else if (!prereqsMet) {
    stateTag = `<span class="pa-tag bad">Locked</span>`;
    action = `<div class="muted small">Requires ${prereqNames}</div>`;
  } else {
    stateTag = `<span class="pa-tag warn">Available</span>`;
    action = `<button class="pa-unlock" data-unlock="${area.id}" ${
      affordable ? "" : "disabled"
    }>Unlock — ${money(area.costMoney)} · ${area.costRep} rep</button>`;
  }

  return `
    <div class="pa-card ${unlocked ? "done" : ""}">
      <div class="pa-head"><strong>${area.name}</strong>${stateTag}</div>
      <p class="flavor">${area.description}</p>
      <div class="muted small">Opens: ${unlocks}</div>
      <div class="pa-action">${action}</div>
    </div>`;
}

function practicesModal(game: GameState): string {
  const cards = PRACTICE_AREAS.map((a) => practiceCard(game, a)).join("");
  return `
    <div class="modal-backdrop">
      <div class="modal practices-modal">
        <div class="pm-head">
          <h2>Practice Areas</h2>
          <button id="close-practices" class="ghost">Close</button>
        </div>
        <p class="muted small">Spend cash and reputation to open new kinds of work. Each area adds prestige to your firm's valuation.</p>
        <div class="pa-grid">${cards}</div>
      </div>
    </div>`;
}

// ---- End-of-game overlay ----
function endOverlay(game: GameState): string {
  if (game.status === "playing") return "";
  const won = game.status === "won";
  const offices = game.districts.filter((d) => d.hasOffice).length;
  return `
    <div class="modal-backdrop">
      <div class="modal end-modal ${game.status}">
        <h2>${won ? "The Firm Prevails" : "The Firm Folds"}</h2>
        <p class="end-reason">${game.statusReason}</p>
        <div class="end-stats">
          <div><span class="muted">Weeks survived</span><strong>${
            game.week
          }</strong></div>
          <div><span class="muted">Offices</span><strong>${offices}</strong></div>
          <div><span class="muted">Reputation</span><strong>${
            game.reputation
          }</strong></div>
          <div><span class="muted">Valuation</span><strong class="accent">${money(
            computeValuation(game),
          )}</strong></div>
        </div>
        <button id="overlay-newgame" class="primary-wide">Start a New Firm</button>
      </div>
    </div>`;
}

export function renderApp(
  root: HTMLElement,
  game: GameState,
  ui: UiState,
  handlers: Handlers,
): void {
  const overlay =
    game.status !== "playing"
      ? endOverlay(game)
      : ui.showPractices
        ? practicesModal(game)
        : ui.showSummary
          ? summaryModal(game)
          : "";

  root.innerHTML = `
    ${hud(game)}
    <main class="layout">
      <div class="col">
        ${rosterPanel(game)}
        ${goalsPanel(game)}
      </div>
      <div class="col">
        ${cityMap(game, ui)}
        ${activeTray(game)}
      </div>
      ${districtPanel(game, ui)}
    </main>
    ${actionBar(game)}
    ${overlay}
  `;

  root
    .querySelectorAll<HTMLButtonElement>("[data-district]")
    .forEach((el) =>
      el.addEventListener("click", () =>
        handlers.selectDistrict(el.dataset.district!),
      ),
    );
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

  const bind = (sel: string, fn: () => void) => {
    const el = root.querySelector<HTMLButtonElement>(sel);
    if (el) el.addEventListener("click", fn);
  };
  root
    .querySelectorAll<HTMLButtonElement>("[data-unlock]")
    .forEach((el) =>
      el.addEventListener("click", () =>
        handlers.unlockPractice(el.dataset.unlock!),
      ),
    );
  root
    .querySelectorAll<HTMLButtonElement>("[data-spend]")
    .forEach((el) =>
      el.addEventListener("click", () => {
        const [id, axis] = el.dataset.spend!.split("|");
        handlers.spendSkillPoint(id, axis as SkillAxis);
      }),
    );

  bind("#confirm-assign", handlers.assignCase);
  bind("#scout-btn", handlers.scout);
  bind("#build-btn", handlers.buildOffice);
  bind("#open-practices", handlers.openPractices);
  bind("#close-practices", handlers.closePractices);
  bind("#end-turn", handlers.endTurn);
  bind("#new-game", handlers.newGame);
  bind("#close-summary", handlers.closeSummary);
  bind("#overlay-newgame", handlers.newGame);
}
