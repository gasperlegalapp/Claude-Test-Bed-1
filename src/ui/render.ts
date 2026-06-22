import type { GameState, Matter, Outcome, Staff, TurnEvent } from "../engine/types.ts";
import { successChance, canStaffMatter } from "../engine/matters.ts";
import { computeValuation, evaluateGoals } from "../engine/scoring.ts";
import { xpForLevel, MAX_SKILL } from "../engine/growth.ts";
import {
  officeStats,
  seatKind,
  hasFreeSeat,
  staffLoad,
  roleCapacity,
  spareCapacity,
  roleCount,
} from "../engine/office.ts";
import {
  maxActiveMatters,
  weeklyOverhead,
  weeklyExpenses,
  weeklyInterest,
  marketingTier,
  availableCredit,
  MARKETING_TIERS,
  LOAN_CHUNK,
} from "../engine/state.ts";
import { SKILL_AXES, SKILL_LABELS, type SkillAxis } from "../data/skills.ts";
import { LAW_AREAS, lawArea } from "../data/areas.ts";
import { ROLE_DEFS } from "../data/staff.ts";
import { FLOOR } from "../data/floor.ts";
import { FLOORPLAN } from "../data/floorplan.ts";
import type { GoalMetric } from "../data/goals.ts";

const SKILL_SHORT: Record<SkillAxis, string> = {
  litigation: "Lit",
  research: "Res",
  negotiation: "Neg",
  diligence: "Dil",
  networking: "Net",
};

export interface UiState {
  setupAreas: Set<string>;
  selectedMatterId: string | null;
  selectedStaff: Set<string>;
  showSummary: boolean;
  showHiring: boolean;
}

export interface Handlers {
  toggleSetupArea: (id: string) => void;
  startGame: () => void;
  selectMatter: (id: string) => void;
  toggleStaff: (id: string) => void;
  spendSkillPoint: (staffId: string, axis: SkillAxis) => void;
  takeMatter: () => void;
  setMarketing: (level: number) => void;
  takeLoan: () => void;
  repayLoan: () => void;
  openHiring: () => void;
  closeHiring: () => void;
  hire: (candidateId: string) => void;
  endTurn: () => void;
  closeSummary: () => void;
  newGame: () => void;
}

const money = (n: number): string =>
  (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US");
const pct = (n: number): string => `${Math.round(n * 100)}%`;

function durLabel(days: number): string {
  if (days <= 0) return "due";
  if (days < 14) return `${days} days`;
  if (days < 60) return `${Math.round(days / 7)} weeks`;
  return `${Math.round(days / 30)} months`;
}

const OUTCOME_LABEL: Record<Outcome, string> = {
  critical: "Big win",
  success: "Won",
  partial: "Settled",
  failure: "Lost",
};
function chanceBand(c: number): string {
  if (c >= 0.66) return "good";
  if (c >= 0.4) return "warn";
  return "bad";
}
function areaName(id: string): string {
  return lawArea(id)?.name ?? id;
}
function skillTags(axes: SkillAxis[]): string {
  return axes.map((a) => `<span class="tag">${SKILL_LABELS[a]}</span>`).join("");
}
function areaTags(ids: string[]): string {
  return ids.map((a) => `<span class="tag area">${areaName(a)}</span>`).join("");
}
function selectedStaffList(game: GameState, ui: UiState): Staff[] {
  return game.staff.filter((s) => ui.selectedStaff.has(s.id));
}
function allSkillsLine(s: Staff, spendable = false): string {
  return SKILL_AXES.map((a) => {
    const v = s.skills[a];
    const canRaise = spendable && s.skillPoints > 0 && v < MAX_SKILL;
    if (canRaise)
      return `<button class="sk sk-spend" data-spend="${s.id}|${a}">${SKILL_SHORT[a]} ${v} <span class="plus">+</span></button>`;
    return `<span class="sk ${v === 0 ? "sk-zero" : ""}">${SKILL_SHORT[a]} ${v}</span>`;
  }).join("");
}

// ---- Setup screen ----
function setupScreen(ui: UiState): string {
  const cards = LAW_AREAS.map((a) => {
    const sel = ui.setupAreas.has(a.id);
    return `
      <button class="area-pick ${sel ? "selected" : ""}" data-setup-area="${a.id}">
        <div class="area-name">${a.name}</div>
        <div class="area-blurb small muted">${a.blurb}</div>
      </button>`;
  }).join("");
  const n = ui.setupAreas.size;
  return `
    <div class="setup">
      <div class="setup-card">
        <h1>Open Your Satellite Office</h1>
        <p class="muted">The partners back at HQ are sending you to open a new office in a new town. Pick the area${
          n === 1 ? "" : "s"
        } of law you'll focus on (1–2). Your founding team and your incoming work will match.</p>
        <div class="area-grid">${cards}</div>
        <div class="setup-foot">
          <span class="muted small">${n}/2 selected</span>
          <button id="start-game" ${n === 0 ? "disabled" : ""}>Open for Business ▸</button>
        </div>
      </div>
    </div>`;
}

// ---- Top HUD ----
function hud(game: GameState): string {
  const available = game.staff.filter(
    (s) => ROLE_DEFS[s.role].casework && spareCapacity(game, s.id) > 0,
  ).length;
  return `
    <header class="hud">
      <div class="brand">FIRM</div>
      <div class="hud-stats">
        <div class="hud-stat"><span class="hud-label">Week</span><span class="hud-value">${game.week}</span></div>
        <div class="hud-stat"><span class="hud-label">Cash</span><span class="hud-value ${
          game.money < 0 ? "bad" : "good"
        }">${money(game.money)}</span></div>
        ${
          game.debt > 0
            ? `<div class="hud-stat"><span class="hud-label">Debt</span><span class="hud-value bad">${money(
                game.debt,
              )}</span></div>`
            : ""
        }
        <div class="hud-stat"><span class="hud-label">Reputation</span><span class="hud-value ${
          game.reputation <= 3 ? "bad" : ""
        }">${game.reputation}</span></div>
        <div class="hud-stat"><span class="hud-label">Valuation</span><span class="hud-value accent">${money(
          computeValuation(game),
        )}</span></div>
        <div class="hud-stat"><span class="hud-label">Staff</span><span class="hud-value">${
          game.staff.length
        }</span></div>
        <div class="hud-stat"><span class="hud-label">Free</span><span class="hud-value ${
          available > 0 ? "warn" : ""
        }">${available}</span></div>
      </div>
      <button id="open-hiring" class="ghost">Hire Staff</button>
      <button id="new-game" class="ghost">New Game</button>
    </header>`;
}

// ---- Left: roster + goals ----
function rosterPanel(game: GameState): string {
  const rows = game.staff
    .map((s) => {
      const def = ROLE_DEFS[s.role];
      const load = staffLoad(game, s.id);
      const cap = roleCapacity(s.role);
      const xpPct = Math.min(100, Math.round((s.xp / xpForLevel(s.level)) * 100));
      const points =
        s.skillPoints > 0
          ? `<span class="sp-badge">${s.skillPoints} pt${s.skillPoints > 1 ? "s" : ""}</span>`
          : "";
      const work = def.casework ? `${load}/${cap} matters` : "front desk";
      const free = def.casework && load < cap;
      return `
        <li class="roster-row">
          <span class="dot ${free ? "dot-idle" : "dot-busy"}"></span>
          <div class="roster-main">
            <div class="roster-top"><strong>${s.name}</strong><span class="role">${s.role}</span></div>
            <div class="lvl-line">
              <span class="lvl">Lv ${s.level}</span>
              <div class="xp-bar" title="${s.xp}/${xpForLevel(s.level)} XP"><div class="xp-fill" style="width:${xpPct}%"></div></div>
              ${points}
            </div>
            <div class="tags">${areaTags(s.practiceAreas)}</div>
            <div class="skill-line">${allSkillsLine(s, true)}</div>
            <div class="roster-bottom small"><span class="${
              free ? "good" : "muted"
            }">${work}</span><span class="muted">${money(s.salary)}/wk</span></div>
          </div>
        </li>`;
    })
    .join("");
  return `<aside class="panel roster"><h2>Personnel</h2><ul class="roster-list">${rows}</ul></aside>`;
}

// ---- Left: finances ----
function financesPanel(game: GameState): string {
  const salaries = game.staff.reduce((sum, s) => sum + s.salary, 0);
  const overhead = weeklyOverhead(game);
  const mkt = marketingTier(game);
  const interest = weeklyInterest(game);
  const total = weeklyExpenses(game);
  const avail = availableCredit(game);

  const expense = (label: string, val: number, cls = "") =>
    `<div class="fin-row"><span class="muted small">${label}</span><span class="small ${cls}">-${money(val)}</span></div>`;

  const tiers = MARKETING_TIERS.map((t, i) => {
    const on = i === game.marketingLevel;
    return `<button class="mkt-opt ${on ? "on" : ""}" data-marketing="${i}">
      <span class="mkt-name">${t.label}</span>
      <span class="mkt-cost muted small">${t.weeklyCost === 0 ? "free" : `${money(t.weeklyCost)}/wk`}</span>
    </button>`;
  }).join("");

  return `
    <aside class="panel finances">
      <h2>Finances</h2>
      <div class="fin-block">
        <div class="fin-sub muted small">Weekly expenses</div>
        ${expense("Salaries", salaries)}
        ${expense("Rent & utilities", overhead)}
        ${mkt.weeklyCost > 0 ? expense("Marketing", mkt.weeklyCost) : ""}
        ${interest > 0 ? expense("Loan interest", interest, "bad") : ""}
        <div class="fin-row total"><span>Total / week</span><span class="bad">-${money(total)}</span></div>
      </div>
      <div class="fin-block">
        <div class="fin-sub muted small">Marketing budget</div>
        <div class="mkt-opts">${tiers}</div>
        <div class="muted small">More budget brings in more — and likelier — leads.</div>
      </div>
      <div class="fin-block">
        <div class="fin-sub muted small">Line of credit</div>
        <div class="fin-row"><span class="muted small">Debt</span><span class="small ${
          game.debt > 0 ? "bad" : ""
        }">${money(game.debt)}</span></div>
        <div class="fin-row"><span class="muted small">Available</span><span class="small">${money(avail)}</span></div>
        <div class="fin-actions">
          <button id="take-loan" class="mini" ${avail < 1 ? "disabled" : ""}>Borrow ${money(LOAN_CHUNK)}</button>
          <button id="repay-loan" class="mini" ${
            game.debt <= 0 || game.money <= 0 ? "disabled" : ""
          }>Repay ${money(LOAN_CHUNK)}</button>
        </div>
        ${game.debt > 0 ? `<div class="muted small">Interest accrues at 4%/week on the balance.</div>` : ""}
      </div>
    </aside>`;
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
          <div class="goal-bar"><div class="goal-fill ${done ? "good" : ""}" style="width:${p}%"></div></div>
          <div class="goal-meta muted small">${goalMetricFormat(goal.metric, current)} / ${goalMetricFormat(
            goal.metric,
            goal.target,
          )}</div>
        </li>`;
    })
    .join("");
  return `<section class="panel goals"><h2>Goals</h2><ul class="goal-list">${rows}</ul></section>`;
}

// ---- Center: floor plan ----
function initials(name: string): string {
  return name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}
function staffToken(game: GameState, s: Staff, seat: { x: number; y: number }): string {
  const free = ROLE_DEFS[s.role].casework && spareCapacity(game, s.id) > 0;
  return `<span class="fp-token ${free ? "free" : "busy"}" style="left:${seat.x}%;top:${seat.y}%" title="${s.name} — ${s.role}">${initials(
    s.name,
  )}</span>`;
}

// The office: the floor-plan artwork with each employee drawn as a round token
// at their desk. The whole floor is always in use; tokens grow as you hire.
function floorPlanGraphic(game: GameState): string {
  const stats = officeStats(game);
  const attorneys = game.staff.filter((s) => seatKind(s.role) === "office");
  const support = game.staff.filter((s) => seatKind(s.role) === "bullpen");
  const reception = game.staff.filter((s) => seatKind(s.role) === "reception");
  let ai = 0;
  let si = 0;
  let ri = 0;

  let tokens = "";
  for (const f of FLOOR) {
    const z = FLOORPLAN.zones[f.id];
    if (!z) continue;
    const occ: Staff[] = [];
    if (f.typeId === "office" && ai < attorneys.length) occ.push(attorneys[ai++]);
    if (f.typeId === "openwork")
      for (let k = 0; k < z.seats.length && si < support.length; k++) occ.push(support[si++]);
    if (f.typeId === "lobby" && ri < reception.length) occ.push(reception[ri++]);
    occ.forEach((s, i) => {
      if (z.seats[i]) tokens += staffToken(game, s, z.seats[i]);
    });
  }

  return `
    <section class="panel office-panel">
      <div class="office-head"><h2>The Office</h2><span class="muted small">${game.staff.length} on staff</span></div>
      <div class="office-summary small muted">
        Attorneys ${stats.attorneysHoused}/${stats.attorneySeats} ·
        Support ${stats.supportHoused}/${stats.supportSeats} ·
        Reception ${stats.receptionHoused}/${stats.receptionSeats} ·
        Case odds +${stats.caseBonus}
      </div>
      <div class="fp-graphic" style="aspect-ratio:${FLOORPLAN.aspect}">
        <img class="fp-img" src="${FLOORPLAN.image}" alt="office floor plan" />
        ${tokens}
      </div>
    </section>`;
}

// ---- Matters ----
function categoryBadge(m: Matter): string {
  return m.category === "litigation"
    ? `<span class="cat-badge lit">Litigation</span>`
    : `<span class="cat-badge txn">Transactional</span>`;
}
function leadsPanel(game: GameState, ui: UiState): string {
  const offered = game.matters.filter((m) => m.status === "offered");
  if (offered.length === 0) {
    return `<section class="panel"><h2>Leads</h2><p class="muted small">No new work this week. Some weeks are quiet — keep the lights on.</p></section>`;
  }
  const cards = offered
    .map((m) => {
      const sel = ui.selectedMatterId === m.id;
      return `
        <button class="board-case ${sel ? "selected" : ""}" data-matter="${m.id}">
          <div class="board-top"><strong>${m.title}</strong><span class="payoff good">${money(m.payoff)}</span></div>
          <div class="case-sub small">${categoryBadge(m)} <span class="muted">${areaName(m.area)}</span></div>
          <div class="board-meta muted small">~${durLabel(m.totalDays)} · lead expires in ${m.expiresInWeeks}w</div>
        </button>`;
    })
    .join("");
  return `<section class="panel"><h2>Leads</h2><div class="board-grid">${cards}</div></section>`;
}
function activePanel(game: GameState, ui: UiState): string {
  const active = game.matters.filter((m) => m.status === "active");
  if (active.length === 0) {
    return `<section class="panel"><h2>Open Matters</h2><p class="muted small">Nothing on the docket. Take a lead to get the firm billing.</p></section>`;
  }
  const rows = active
    .map((m) => {
      const sel = ui.selectedMatterId === m.id;
      const names = m.staffIds.map((id) => game.staff.find((s) => s.id === id)?.name ?? "?").join(", ");
      const fill = Math.round(((m.totalDays - m.daysRemaining) / m.totalDays) * 100);
      return `
        <button class="active-card ${sel ? "selected" : ""}" data-matter="${m.id}">
          <div class="active-top"><strong>${m.title}</strong><span class="warn small">${durLabel(
            m.daysRemaining,
          )}</span></div>
          <div class="case-sub small">${categoryBadge(m)} <span class="muted">${areaName(m.area)}</span></div>
          <div class="progress"><div class="progress-fill" style="width:${fill}%"></div></div>
          <div class="muted small">${names}</div>
        </button>`;
    })
    .join("");
  return `<section class="panel"><h2>Open Matters (${active.length}/${maxActiveMatters(
    game,
  )})</h2><div class="active-grid">${rows}</div></section>`;
}

// ---- Right: context panel ----
function teamPicker(game: GameState, ui: UiState, area: string): string {
  const rows = game.staff
    .filter((s) => ROLE_DEFS[s.role].casework)
    .map((s) => {
      const free = spareCapacity(game, s.id) > 0;
      const checked = ui.selectedStaff.has(s.id);
      const knows = ROLE_DEFS[s.role].attorney && s.practiceAreas.includes(area);
      const cls = ["team-row", free ? "" : "busy", checked ? "checked" : ""].filter(Boolean).join(" ");
      return `
        <button class="${cls}" data-team="${s.id}" ${free ? "" : "disabled"}>
          <span class="checkbox">${checked ? "✓" : ""}</span>
          <span class="team-main">
            <span class="team-top"><strong>${s.name}</strong><span class="role">${s.role}${
              knows ? " · covers area" : ""
            }</span></span>
            <span class="muted small">${staffLoad(game, s.id)}/${roleCapacity(s.role)} matters · ${allSkillsLineCompact(
              s,
            )}</span>
          </span>
        </button>`;
    })
    .join("");
  return `<h3 class="assign-h">Assign Team</h3><div class="team-list">${rows}</div>`;
}
function allSkillsLineCompact(s: Staff): string {
  return SKILL_AXES.map((a) => `${SKILL_SHORT[a]} ${s.skills[a]}`).join(" ");
}
function oddsBlock(chance: number | null): string {
  if (chance === null) return `<div class="odds-empty muted small">Add a qualified attorney to see odds.</div>`;
  const band = chanceBand(chance);
  return `<div class="odds-wrap"><div class="odds-top"><span>Odds of winning</span><span class="${band}">${pct(
    chance,
  )}</span></div><div class="odds-bar"><div class="odds-fill ${band}" style="width:${Math.round(
    chance * 100,
  )}%"></div></div></div>`;
}
function matterPanel(game: GameState, ui: UiState): string {
  const m = game.matters.find((x) => x.id === ui.selectedMatterId)!;
  const team = selectedStaffList(game, ui);

  if (m.status === "active") {
    const names = m.staffIds.map((id) => game.staff.find((s) => s.id === id)?.name ?? "?").join(", ");
    const assigned = m.staffIds.map((id) => game.staff.find((s) => s.id === id)).filter((s): s is Staff => !!s);
    const odds =
      m.category === "litigation" ? oddsBlock(successChance(m, assigned, officeStats(game).caseBonus)) : "";
    return `
      <aside class="panel briefing">
        <h2>Open Matter</h2>
        <div class="brief-head"><strong class="brief-title">${m.title}</strong><span class="payoff good">${money(
          m.payoff,
        )}</span></div>
        <div class="case-sub small">${categoryBadge(m)} <span class="muted">${areaName(m.area)}</span></div>
        <p class="flavor">${m.flavor}</p>
        <div class="brief-meta muted small">${durLabel(m.daysRemaining)} remaining · worked by ${names}</div>
        ${odds}
        ${
          m.category === "transactional"
            ? `<p class="muted small">Client has signed — completing the work pays the fee.</p>`
            : ""
        }
      </aside>`;
  }

  // Offered matter -> staffing panel.
  const valid = canStaffMatter(game, m, [...ui.selectedStaff]);
  const odds = m.category === "litigation" && valid ? successChance(m, team, officeStats(game).caseBonus) : null;
  const atCap = game.matters.filter((x) => x.status === "active").length >= maxActiveMatters(game);
  return `
    <aside class="panel briefing">
      <h2>New Lead</h2>
      <div class="brief-head"><strong class="brief-title">${m.title}</strong><span class="payoff good">${money(
        m.payoff,
      )}</span></div>
      <div class="case-sub small">${categoryBadge(m)} <span class="muted">${areaName(m.area)}</span></div>
      <p class="flavor">${m.flavor}</p>
      <div class="brief-meta muted small">~${durLabel(m.totalDays)} of work · ${
        m.category === "litigation" ? `risk ${money(m.riskCost)} if lost` : "guaranteed fee on completion"
      }</div>
      <div class="tags">${skillTags(m.requiredSkills)}</div>
      ${teamPicker(game, ui, m.area)}
      ${m.category === "litigation" ? oddsBlock(odds) : ""}
      ${atCap ? `<div class="muted small">At matter capacity — wrap up an open matter to free up the docket.</div>` : ""}
      <button id="take-matter" class="primary-wide" ${valid && !atCap ? "" : "disabled"}>${
        valid ? "Take the Matter ▸" : "Needs an attorney in this area"
      }</button>
    </aside>`;
}
function contextPanel(game: GameState, ui: UiState): string {
  if (ui.selectedMatterId && game.matters.some((m) => m.id === ui.selectedMatterId)) return matterPanel(game, ui);
  return `<aside class="panel briefing"><h2>The Firm</h2><p class="muted">Pick a lead to staff it, or an open matter to check on it. Hire from the top bar — new staff appear at their desks on the floor plan.</p><p class="hint small">Press <kbd>E</kbd> or <kbd>Enter</kbd> to end the week.</p></aside>`;
}

function actionBar(game: GameState): string {
  const total = weeklyExpenses(game);
  return `<footer class="actionbar"><span class="muted small">Ending the week pays <span class="bad">-${money(
    total,
  )}</span> in salaries &amp; overhead and advances every open matter by a week.</span><button id="end-turn" class="end-turn">End Week ▸ <kbd>E</kbd></button></footer>`;
}

// ---- Modals ----
function eventLine(e: TurnEvent): string {
  if (e.kind === "matter") {
    const rep =
      e.repDelta && e.repDelta !== 0
        ? `<span class="o-rep ${e.repDelta > 0 ? "good" : "bad"}">${e.repDelta > 0 ? "+" : ""}${e.repDelta} rep</span>`
        : "";
    const label = e.category === "transactional" ? "Closed" : OUTCOME_LABEL[e.outcome!];
    return `<li class="resolve-line ${e.outcome}"><span class="o-tag">${label}</span><span class="o-title">${
      e.title
    }</span><span class="o-deltas"><span class="o-money ${(e.moneyDelta ?? 0) >= 0 ? "good" : "bad"}">${
      (e.moneyDelta ?? 0) >= 0 ? "+" : ""
    }${money(e.moneyDelta ?? 0)}</span>${rep}</span></li>`;
  }
  if (e.kind === "lead") {
    return `<li class="resolve-line lead"><span class="o-tag accent">New lead</span><span class="o-title">${e.title}</span><span class="o-deltas muted small">in the queue</span></li>`;
  }
  return `<li class="resolve-line growth"><span class="o-tag good">Leveled</span><span class="o-title">${e.title}</span><span class="o-deltas good small">${
    e.detail ?? ""
  }</span></li>`;
}
function summaryModal(game: GameState): string {
  const log = game.lastTurn;
  if (!log) return "";
  const lines =
    log.events.length === 0 ? `<li class="muted">A quiet week. Nothing resolved.</li>` : log.events.map(eventLine).join("");
  const expenses = log.salariesPaid + log.overheadPaid + log.marketingPaid + log.interestPaid;
  const part = (label: string, val: number) =>
    val > 0 ? `<span class="muted">${label} <span class="bad">-${money(val)}</span></span>` : "";
  const breakdown = [
    part("Salaries", log.salariesPaid),
    part("Overhead", log.overheadPaid),
    part("Marketing", log.marketingPaid),
    part("Interest", log.interestPaid),
  ]
    .filter(Boolean)
    .join('<span class="recap-dot">·</span>');
  return `<div class="modal-backdrop"><div class="modal"><h2>Week ${
    log.week
  } — Recap</h2><ul class="resolve-list">${lines}</ul><div class="recap-expenses small">${breakdown}</div><div class="recap-foot"><span class="muted">Total expenses: <span class="bad">-${money(
    expenses,
  )}</span></span><button id="close-summary">Continue ▸</button></div></div></div>`;
}
function hiringModal(game: GameState): string {
  const stats = officeStats(game);
  const cards = game.candidates
    .map((c) => {
      const def = ROLE_DEFS[c.role];
      const seatOk = hasFreeSeat(game, c.role);
      const max = def.max;
      const capped = max !== undefined && roleCount(game, c.role) >= max;
      const afford = game.money >= c.signingCost;
      const seatName = def.seat === "office" ? "attorney office" : def.seat === "bullpen" ? "bullpen desk" : "front desk";
      let note = "";
      if (capped) note = `<div class="muted small">The firm can only have one ${c.role}.</div>`;
      else if (!seatOk) note = `<div class="muted small">No ${seatName} free — build the room first.</div>`;
      return `
        <div class="cand-card">
          <div class="cand-head"><strong>${c.name}</strong><span class="role">${c.role}</span></div>
          <div class="tags">${areaTags(c.practiceAreas)}</div>
          <div class="skill-line">${SKILL_AXES.map(
            (a) => `<span class="sk ${c.skills[a] === 0 ? "sk-zero" : ""}">${SKILL_SHORT[a]} ${c.skills[a]}</span>`,
          ).join("")}</div>
          <div class="cand-meta muted small">${def.blurb} · ${money(c.salary)}/wk · signing ${money(c.signingCost)}</div>
          ${note}
          <button class="cand-hire" data-hire="${c.id}" ${seatOk && afford && !capped ? "" : "disabled"}>Hire</button>
        </div>`;
    })
    .join("");
  return `<div class="modal-backdrop"><div class="modal hiring-modal"><div class="pm-head"><h2>Hire Staff</h2><button id="close-hiring" class="ghost">Close</button></div><p class="muted small">Attorneys ${
    stats.attorneysHoused
  }/${stats.attorneySeats} · Bullpen ${stats.supportHoused}/${stats.supportSeats} · Reception ${
    stats.receptionHoused
  }/${stats.receptionSeats}. Attorneys need an office; support need a bullpen desk.</p><div class="cand-grid">${cards}</div></div></div>`;
}
function endOverlay(game: GameState): string {
  if (game.status === "playing") return "";
  const won = game.status === "won";
  return `<div class="modal-backdrop"><div class="modal end-modal ${game.status}"><h2>${
    won ? "The Firm Prevails" : "The Firm Folds"
  }</h2><p class="end-reason">${game.statusReason}</p><div class="end-stats"><div><span class="muted">Weeks</span><strong>${
    game.week
  }</strong></div><div><span class="muted">Staff</span><strong>${
    game.staff.length
  }</strong></div><div><span class="muted">Reputation</span><strong>${
    game.reputation
  }</strong></div><div><span class="muted">Valuation</span><strong class="accent">${money(
    computeValuation(game),
  )}</strong></div></div><button id="overlay-newgame" class="primary-wide">Open a New Office</button></div></div>`;
}

export function renderApp(root: HTMLElement, game: GameState, ui: UiState, handlers: Handlers): void {
  if (game.phase === "setup") {
    root.innerHTML = setupScreen(ui);
    root
      .querySelectorAll<HTMLElement>("[data-setup-area]")
      .forEach((el) => el.addEventListener("click", () => handlers.toggleSetupArea(el.dataset.setupArea!)));
    const start = root.querySelector<HTMLButtonElement>("#start-game");
    if (start) start.addEventListener("click", handlers.startGame);
    return;
  }

  const overlay =
    game.status !== "playing"
      ? endOverlay(game)
      : ui.showHiring
        ? hiringModal(game)
        : ui.showSummary
          ? summaryModal(game)
          : "";

  root.innerHTML = `
    ${hud(game)}
    <main class="layout">
      <div class="col">${rosterPanel(game)}${financesPanel(game)}${goalsPanel(game)}</div>
      <div class="col">${floorPlanGraphic(game)}${leadsPanel(game, ui)}${activePanel(game, ui)}</div>
      ${contextPanel(game, ui)}
    </main>
    ${actionBar(game)}
    ${overlay}
  `;

  const all = (sel: string, fn: (el: HTMLElement) => void) =>
    root.querySelectorAll<HTMLElement>(sel).forEach(fn);
  const bind = (sel: string, fn: () => void) => {
    const el = root.querySelector<HTMLButtonElement>(sel);
    if (el) el.addEventListener("click", fn);
  };

  all("[data-matter]", (el) => el.addEventListener("click", () => handlers.selectMatter(el.dataset.matter!)));
  all("[data-team]", (el) => el.addEventListener("click", () => handlers.toggleStaff(el.dataset.team!)));
  all("[data-hire]", (el) => el.addEventListener("click", () => handlers.hire(el.dataset.hire!)));
  all("[data-spend]", (el) =>
    el.addEventListener("click", () => {
      const [id, axis] = el.dataset.spend!.split("|");
      handlers.spendSkillPoint(id, axis as SkillAxis);
    }),
  );

  all("[data-marketing]", (el) =>
    el.addEventListener("click", () => handlers.setMarketing(Number(el.dataset.marketing))),
  );
  bind("#take-matter", handlers.takeMatter);
  bind("#take-loan", handlers.takeLoan);
  bind("#repay-loan", handlers.repayLoan);
  bind("#open-hiring", handlers.openHiring);
  bind("#close-hiring", handlers.closeHiring);
  bind("#end-turn", handlers.endTurn);
  bind("#new-game", handlers.newGame);
  bind("#close-summary", handlers.closeSummary);
  bind("#overlay-newgame", handlers.newGame);
}
