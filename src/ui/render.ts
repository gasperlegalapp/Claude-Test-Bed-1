import type {
  Candidate,
  GameState,
  Outcome,
  Room,
  Staff,
  TurnEvent,
} from "../engine/types.ts";
import { successChance } from "../engine/jobs.ts";
import { computeValuation, evaluateGoals } from "../engine/scoring.ts";
import { xpForLevel, MAX_SKILL } from "../engine/growth.ts";
import {
  officeStats,
  roomType,
  seatCategory,
  hasFreeSeat,
} from "../engine/office.ts";
import { SKILL_AXES, SKILL_LABELS, type SkillAxis } from "../data/skills.ts";
import type { GoalMetric } from "../data/goals.ts";
import { ROOM_TYPES, type RoomType } from "../data/rooms.ts";
import { BUILDINGS } from "../data/buildings.ts";
import { PRACTICE_AREAS, type PracticeArea } from "../data/practices.ts";
import { CASE_TEMPLATES } from "../data/cases.ts";

const SKILL_SHORT: Record<SkillAxis, string> = {
  litigation: "Lit",
  research: "Res",
  negotiation: "Neg",
  diligence: "Dil",
  networking: "Net",
};

export interface UiState {
  selectedCaseId: string | null;
  selectedSlot: number | null;
  selectedRoomId: string | null;
  selectedStaff: Set<string>;
  showSummary: boolean;
  showPractices: boolean;
  showHiring: boolean;
}

export interface Handlers {
  selectCase: (id: string) => void;
  selectSlot: (slot: number) => void;
  selectRoom: (id: string) => void;
  toggleStaff: (id: string) => void;
  spendSkillPoint: (staffId: string, axis: SkillAxis) => void;
  assignCase: () => void;
  buildRoom: (roomTypeId: string) => void;
  upgradeBuilding: () => void;
  openHiring: () => void;
  closeHiring: () => void;
  hire: (candidateId: string) => void;
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

const OUTCOME_LABEL: Record<Outcome, string> = {
  critical: "Critical win",
  success: "Won",
  partial: "Partial",
  failure: "Lost",
};

function chanceBand(c: number): string {
  if (c >= 0.66) return "good";
  if (c >= 0.4) return "warn";
  return "bad";
}

function selectedStaffList(game: GameState, ui: UiState): Staff[] {
  return game.staff.filter((s) => ui.selectedStaff.has(s.id));
}
function skillTags(axes: SkillAxis[]): string {
  return axes.map((a) => `<span class="tag">${SKILL_LABELS[a]}</span>`).join("");
}
function jobWeeks(game: GameState, jobId: string | null): number {
  const j = game.activeJobs.find((x) => x.id === jobId);
  return j ? j.weeksRemaining : 0;
}

// All five skills, always shown. When points are available, raisable skills
// become spend buttons.
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

function candidateSkillsLine(c: Candidate): string {
  return SKILL_AXES.map(
    (a) =>
      `<span class="sk ${c.skills[a] === 0 ? "sk-zero" : ""}">${SKILL_SHORT[a]} ${
        c.skills[a]
      }</span>`,
  ).join("");
}

// ---- Top HUD ----
function hud(game: GameState): string {
  const idle = game.staff.filter((s) => s.status === "idle").length;
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
        <div class="hud-stat"><span class="hud-label">Staff</span><span class="hud-value">${
          game.staff.length
        }</span></div>
        <div class="hud-stat"><span class="hud-label">Idle</span><span class="hud-value ${
          idle > 0 ? "warn" : ""
        }">${idle}</span></div>
      </div>
      <button id="open-hiring" class="ghost">Hire Staff</button>
      <button id="open-practices" class="ghost">Practice Areas</button>
      <button id="new-game" class="ghost">New Game</button>
    </header>`;
}

// ---- Left: roster + goals ----
function rosterPanel(game: GameState): string {
  const rows = game.staff
    .map((s) => {
      const idle = s.status === "idle";
      const status = idle ? "Available" : `Assigned · ${jobWeeks(game, s.jobId)}w`;
      const xpPct = Math.min(100, Math.round((s.xp / xpForLevel(s.level)) * 100));
      const points =
        s.skillPoints > 0
          ? `<span class="sp-badge">${s.skillPoints} pt${
              s.skillPoints > 1 ? "s" : ""
            }</span>`
          : "";
      const seat = seatCategory(s.role) === "lawyer" ? "Office" : "Bullpen";
      return `
        <li class="roster-row">
          <span class="dot ${idle ? "dot-idle" : "dot-busy"}"></span>
          <div class="roster-main">
            <div class="roster-top"><strong>${s.name}</strong><span class="role">${
              s.role
            }</span></div>
            <div class="lvl-line">
              <span class="lvl">Lv ${s.level}</span>
              <div class="xp-bar" title="${s.xp}/${xpForLevel(
                s.level,
              )} XP"><div class="xp-fill" style="width:${xpPct}%"></div></div>
              ${points}
            </div>
            <div class="skill-line">${allSkillsLine(s, true)}</div>
            <div class="roster-bottom small"><span class="${
              idle ? "good" : "warn"
            }">${status}</span><span class="muted">${seat} · ${money(
              s.salary,
            )}/wk</span></div>
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

// ---- Center: office floor plan ----
function roomEffect(t: RoomType): string {
  const parts: string[] = [];
  if (t.lawyerSeats) parts.push(`${t.lawyerSeats} office seat${t.lawyerSeats > 1 ? "s" : ""}`);
  if (t.supportSeats) parts.push(`${t.supportSeats} desks`);
  if (t.caseBonus) parts.push(`+${t.caseBonus} case odds`);
  if (t.caseCapacity) parts.push(`+${t.caseCapacity} open cases`);
  return parts.join(" · ") || "Amenity";
}

// A seated person, viewed from above: a chair with a coloured "head" when
// occupied. Colour signals whether the staffer is idle or out on a case.
function personHead(s: Staff | undefined): string {
  if (!s)
    return `<span class="chair"></span>`;
  const cls = s.status === "idle" ? "idle" : "busy";
  return `<span class="chair occupied" title="${s.name} — ${s.role} (${
    s.status === "idle" ? "available" : "on a case"
  })"><span class="phead ${cls}"></span></span>`;
}

// A single workstation: a desktop with a chair tucked under it.
function workstation(occupant?: Staff): string {
  return `<span class="ws"><span class="desk"></span>${personHead(occupant)}</span>`;
}

// Top-down furniture for a room, plus any staff seated in it.
function furniture(typeId: string, occupants: Staff[]): string {
  switch (typeId) {
    case "office":
      return `<div class="furn furn-office">${workstation(occupants[0])}</div>`;
    case "bullpen": {
      let cells = "";
      for (let i = 0; i < 4; i++) cells += workstation(occupants[i]);
      return `<div class="furn furn-bullpen">${cells}</div>`;
    }
    case "conference":
      return `<div class="furn furn-conf">
        <div class="chrow"><span class="chair sm"></span><span class="chair sm"></span><span class="chair sm"></span></div>
        <div class="boardtable"></div>
        <div class="chrow"><span class="chair sm"></span><span class="chair sm"></span><span class="chair sm"></span></div>
      </div>`;
    case "lobby":
      return `<div class="furn furn-lobby"><span class="reception"></span><span class="sofa"></span><span class="plant"></span></div>`;
    case "kitchen":
      return `<div class="furn furn-kitchen"><span class="counter"></span><span class="fridge"></span></div>`;
    case "breakroom":
      return `<div class="furn furn-break"><span class="sofa"></span><span class="rtable"></span></div>`;
    case "storage":
      return `<div class="furn furn-storage"><span class="box"></span><span class="box"></span><span class="box"></span><span class="box"></span></div>`;
    default:
      return "";
  }
}

function floorPlan(game: GameState, ui: UiState): string {
  const stats = officeStats(game);
  const cols = Math.ceil(Math.sqrt(stats.slotsTotal));
  const rows = Math.ceil(stats.slotsTotal / cols);
  const bySlot = new Map<number, Room>();
  for (const r of game.rooms) bySlot.set(r.slot, r);

  // Seat staff into their rooms: lawyers fill offices, support fill bullpens.
  const lawyers = game.staff.filter((s) => seatCategory(s.role) === "lawyer");
  const support = game.staff.filter((s) => seatCategory(s.role) === "support");
  let li = 0;
  let si = 0;

  let cells = "";
  for (let slot = 0; slot < stats.slotsTotal; slot++) {
    const col = slot % cols;
    const row = Math.floor(slot / cols);
    const ext = {
      top: row === 0,
      bottom: row === rows - 1,
      left: col === 0,
      right: col === cols - 1,
    };
    // Windows on exterior walls; a door on an interior wall when possible.
    let windows = "";
    if (ext.top) windows += '<span class="win win-top"></span>';
    if (ext.bottom) windows += '<span class="win win-bottom"></span>';
    if (ext.left) windows += '<span class="win win-left"></span>';
    if (ext.right) windows += '<span class="win win-right"></span>';
    const doorEdge = !ext.bottom
      ? "door-bottom"
      : !ext.top
        ? "door-top"
        : !ext.right
          ? "door-right"
          : "door-left";
    const extClass = [
      ext.top ? "ext-top" : "",
      ext.bottom ? "ext-bottom" : "",
      ext.left ? "ext-left" : "",
      ext.right ? "ext-right" : "",
    ]
      .filter(Boolean)
      .join(" ");

    const room = bySlot.get(slot);
    if (room) {
      const t = roomType(room.typeId)!;
      const occupants: Staff[] = [];
      if (t.id === "office" && li < lawyers.length) occupants.push(lawyers[li++]);
      if (t.id === "bullpen") {
        for (let k = 0; k < 4 && si < support.length; k++) occupants.push(support[si++]);
      }
      const selected = ui.selectedRoomId === room.id;
      cells += `
        <button class="room ${t.id} ${extClass} ${selected ? "selected" : ""}" data-room="${room.id}">
          ${windows}
          <span class="door ${doorEdge}"></span>
          <span class="room-label">${t.name}</span>
          ${furniture(t.id, occupants)}
        </button>`;
    } else {
      const selected = ui.selectedSlot === slot;
      cells += `
        <button class="room empty ${extClass} ${selected ? "selected" : ""}" data-slot="${slot}">
          ${windows}
          <span class="plus-big">+</span>
          <span class="small">Build</span>
        </button>`;
    }
  }

  const next = BUILDINGS[game.buildingTier + 1];
  const upgrade = next
    ? `<button id="upgrade-building" class="mini" ${
        game.money < next.upgradeCost ? "disabled" : ""
      }>Lease ${next.name} — ${money(next.upgradeCost)}</button>`
    : `<span class="muted small">Top-tier building</span>`;

  return `
    <section class="panel office-panel">
      <div class="office-head">
        <h2>${BUILDINGS[game.buildingTier].name}</h2>
        ${upgrade}
      </div>
      <div class="office-summary small muted">
        Rooms ${stats.slotsUsed}/${stats.slotsTotal} ·
        Lawyer offices ${stats.lawyersHoused}/${stats.lawyerSeats} ·
        Bullpen ${stats.supportHoused}/${stats.supportSeats} ·
        Case odds +${stats.caseBonus}
      </div>
      <div class="floor-plan" style="--cols:${cols}">${cells}</div>
    </section>`;
}

function caseBoard(game: GameState, ui: UiState): string {
  const cards = game.availableCases
    .map((c) => {
      const selected = ui.selectedCaseId === c.id;
      return `
        <button class="board-case ${selected ? "selected" : ""}" data-case="${c.id}">
          <div class="board-top"><strong>${c.title}</strong><span class="payoff good">${money(
            c.payoff,
          )}</span></div>
          <div class="tags">${skillTags(c.requiredSkills)}</div>
          <div class="board-meta muted small">Difficulty ${c.difficulty} · ${
            c.durationWeeks
          }w · risk ${money(c.riskCost)}</div>
        </button>`;
    })
    .join("");
  return `
    <section class="panel">
      <h2>Caseload</h2>
      <div class="board-grid">${cards || '<p class="muted">No cases on offer.</p>'}</div>
    </section>`;
}

function activeTray(game: GameState): string {
  if (game.activeJobs.length === 0) {
    return `<section class="panel"><h2>In Progress</h2><p class="muted small">No active cases. Idle staff still draw salary — put them to work.</p></section>`;
  }
  const rows = game.activeJobs
    .map((j) => {
      const names = j.staffIds
        .map((id) => game.staff.find((s) => s.id === id)?.name ?? "?")
        .join(", ");
      const total = j.case.durationWeeks;
      const fill = Math.round(((total - j.weeksRemaining) / total) * 100);
      return `
        <div class="active-card">
          <div class="active-top"><strong>${j.case.title}</strong><span class="warn small">${
            j.weeksRemaining
          }w</span></div>
          <div class="progress"><div class="progress-fill" style="width:${fill}%"></div></div>
          <div class="muted small">${names}</div>
        </div>`;
    })
    .join("");
  return `<section class="panel"><h2>In Progress</h2><div class="active-grid">${rows}</div></section>`;
}

// ---- Right: context panel ----
function teamPicker(game: GameState, ui: UiState): string {
  const rows = game.staff
    .map((s) => {
      const idle = s.status === "idle";
      const checked = ui.selectedStaff.has(s.id);
      const cls = ["team-row", idle ? "" : "busy", checked ? "checked" : ""]
        .filter(Boolean)
        .join(" ");
      const info = idle
        ? `<span class="skill-line">${allSkillsLine(s)}</span>`
        : `<span class="muted small">Busy · ${jobWeeks(game, s.jobId)}w left</span>`;
      return `
        <button class="${cls}" data-team="${s.id}" ${idle ? "" : "disabled"}>
          <span class="checkbox">${checked ? "✓" : ""}</span>
          <span class="team-main">
            <span class="team-top"><strong>${s.name}</strong><span class="role">${
              s.role
            }</span></span>
            ${info}
          </span>
        </button>`;
    })
    .join("");
  return `<h3 class="assign-h">Assign Team</h3><div class="team-list">${rows}</div>`;
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

function caseBriefing(game: GameState, ui: UiState): string {
  const c = game.availableCases.find((x) => x.id === ui.selectedCaseId)!;
  const team = selectedStaffList(game, ui);
  const bonus = officeStats(game).caseBonus;
  const chance = team.length > 0 ? successChance(c, team, bonus) : null;
  return `
    <aside class="panel briefing">
      <h2>Case Briefing</h2>
      <div class="brief-head"><strong class="brief-title">${c.title}</strong><span class="payoff good">${money(
        c.payoff,
      )}</span></div>
      <p class="flavor">${c.flavor}</p>
      <div class="tags">${skillTags(c.requiredSkills)}</div>
      <div class="brief-meta muted small">Difficulty ${c.difficulty} · ${
        c.durationWeeks
      } week${c.durationWeeks > 1 ? "s" : ""} · risk ${money(
        c.riskCost,
      )} · office bonus +${bonus}</div>
      ${teamPicker(game, ui)}
      ${oddsBlock(chance)}
      <button id="confirm-assign" class="primary-wide" ${
        team.length === 0 ? "disabled" : ""
      }>Assign ${team.length || ""} → Take Case</button>
    </aside>`;
}

function buildMenu(game: GameState, ui: UiState): string {
  const rows = ROOM_TYPES.map((t) => {
    const afford = game.money >= t.buildCost;
    return `
      <div class="build-row">
        <div class="build-info">
          <div class="build-top"><strong>${t.name}</strong><span class="muted small">${money(
            t.buildCost,
          )}</span></div>
          <div class="muted small">${t.description}</div>
          <div class="build-eff small">${roomEffect(t)}</div>
        </div>
        <button class="build-pick" data-build="${t.id}" ${
          afford ? "" : "disabled"
        }>Build</button>
      </div>`;
  }).join("");
  return `
    <aside class="panel briefing">
      <h2>Build a Room</h2>
      <p class="muted small">Slot ${ui.selectedSlot! + 1} · pick what to put here.</p>
      <div class="build-list">${rows}</div>
    </aside>`;
}

function roomInfo(game: GameState, ui: UiState): string {
  const room = game.rooms.find((r) => r.id === ui.selectedRoomId)!;
  const t = roomType(room.typeId)!;
  return `
    <aside class="panel briefing">
      <h2>${t.name}</h2>
      <p class="flavor">${t.description}</p>
      <div class="brief-meta small">${roomEffect(t)}</div>
      <p class="muted small">Built value: ${money(t.buildCost)}.</p>
    </aside>`;
}

function contextPanel(game: GameState, ui: UiState): string {
  if (ui.selectedCaseId && game.availableCases.some((c) => c.id === ui.selectedCaseId))
    return caseBriefing(game, ui);
  if (ui.selectedSlot !== null) return buildMenu(game, ui);
  if (ui.selectedRoomId && game.rooms.some((r) => r.id === ui.selectedRoomId))
    return roomInfo(game, ui);
  return `
    <aside class="panel briefing">
      <h2>The Firm</h2>
      <p class="muted">Pick a case to staff it, an empty slot to build a room, or a room to inspect it.</p>
      <p class="hint small">Tip: press <kbd>E</kbd> or <kbd>Enter</kbd> to end the week.</p>
    </aside>`;
}

// ---- Bottom bar ----
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

// ---- Modals ----
function eventLine(e: TurnEvent): string {
  if (e.kind === "case") {
    const rep =
      e.repDelta && e.repDelta !== 0
        ? `<span class="o-rep ${e.repDelta > 0 ? "good" : "bad"}">${
            e.repDelta > 0 ? "+" : ""
          }${e.repDelta} rep</span>`
        : "";
    return `
      <li class="resolve-line ${e.outcome}">
        <span class="o-tag">${OUTCOME_LABEL[e.outcome!]}</span>
        <span class="o-title">${e.title}</span>
        <span class="o-deltas">
          <span class="o-money ${(e.moneyDelta ?? 0) >= 0 ? "good" : "bad"}">${
            (e.moneyDelta ?? 0) >= 0 ? "+" : ""
          }${money(e.moneyDelta ?? 0)}</span>
          ${rep}
        </span>
      </li>`;
  }
  return `
    <li class="resolve-line growth">
      <span class="o-tag good">Leveled</span>
      <span class="o-title">${e.title}</span>
      <span class="o-deltas good small">${e.detail ?? ""}</span>
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

function hiringModal(game: GameState): string {
  const stats = officeStats(game);
  const cards = game.candidates
    .map((c) => {
      const seatOk = hasFreeSeat(game, c.role);
      const afford = game.money >= c.signingCost;
      const cat = seatCategory(c.role);
      const note = !seatOk
        ? `<div class="muted small">No ${
            cat === "lawyer" ? "office" : "bullpen"
          } seat free — build a ${cat === "lawyer" ? "Lawyer's Office" : "Bullpen"}.</div>`
        : "";
      return `
        <div class="cand-card">
          <div class="cand-head"><strong>${c.name}</strong><span class="role">${c.role}</span></div>
          <div class="skill-line">${candidateSkillsLine(c)}</div>
          <div class="cand-meta muted small">${money(c.salary)}/wk · signing ${money(
            c.signingCost,
          )}</div>
          ${note}
          <button class="cand-hire" data-hire="${c.id}" ${
            seatOk && afford ? "" : "disabled"
          }>Hire</button>
        </div>`;
    })
    .join("");
  return `
    <div class="modal-backdrop">
      <div class="modal hiring-modal">
        <div class="pm-head"><h2>Hire Staff</h2><button id="close-hiring" class="ghost">Close</button></div>
        <p class="muted small">Lawyer seats ${stats.lawyersHoused}/${
          stats.lawyerSeats
        } · Bullpen ${stats.supportHoused}/${
          stats.supportSeats
        }. Build offices and bullpens for more room.</p>
        <div class="cand-grid">${cards}</div>
      </div>
    </div>`;
}

function practiceCard(game: GameState, area: PracticeArea): string {
  const unlocked = game.unlockedPractices.includes(area.id);
  const prereqsMet = area.prereqs.every((p) => game.unlockedPractices.includes(p));
  const affordable = game.money >= area.costMoney && game.reputation >= area.costRep;
  const unlocks = CASE_TEMPLATES.filter((t) => t.practiceArea === area.id)
    .map((t) => t.title)
    .join(", ");
  const prereqNames = area.prereqs
    .map((p) => PRACTICE_AREAS.find((a) => a.id === p)?.name ?? p)
    .join(", ");

  let tag: string;
  let action: string;
  if (unlocked) {
    tag = `<span class="pa-tag good">Unlocked</span>`;
    action = `<div class="muted small">Active</div>`;
  } else if (!prereqsMet) {
    tag = `<span class="pa-tag bad">Locked</span>`;
    action = `<div class="muted small">Requires ${prereqNames}</div>`;
  } else {
    tag = `<span class="pa-tag warn">Available</span>`;
    action = `<button class="pa-unlock" data-unlock="${area.id}" ${
      affordable ? "" : "disabled"
    }>Unlock — ${money(area.costMoney)} · ${area.costRep} rep</button>`;
  }
  return `
    <div class="pa-card ${unlocked ? "done" : ""}">
      <div class="pa-head"><strong>${area.name}</strong>${tag}</div>
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
        <div class="pm-head"><h2>Practice Areas</h2><button id="close-practices" class="ghost">Close</button></div>
        <p class="muted small">Spend cash and reputation to open new kinds of work. Each area adds prestige to your valuation.</p>
        <div class="pa-grid">${cards}</div>
      </div>
    </div>`;
}

function endOverlay(game: GameState): string {
  if (game.status === "playing") return "";
  const won = game.status === "won";
  return `
    <div class="modal-backdrop">
      <div class="modal end-modal ${game.status}">
        <h2>${won ? "The Firm Prevails" : "The Firm Folds"}</h2>
        <p class="end-reason">${game.statusReason}</p>
        <div class="end-stats">
          <div><span class="muted">Weeks survived</span><strong>${game.week}</strong></div>
          <div><span class="muted">Staff</span><strong>${game.staff.length}</strong></div>
          <div><span class="muted">Reputation</span><strong>${game.reputation}</strong></div>
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
      : ui.showHiring
        ? hiringModal(game)
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
        ${floorPlan(game, ui)}
        ${caseBoard(game, ui)}
        ${activeTray(game)}
      </div>
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

  all("[data-case]", (el) =>
    el.addEventListener("click", () => handlers.selectCase(el.dataset.case!)),
  );
  all("[data-slot]", (el) =>
    el.addEventListener("click", () =>
      handlers.selectSlot(Number(el.dataset.slot)),
    ),
  );
  all("[data-room]", (el) =>
    el.addEventListener("click", () => handlers.selectRoom(el.dataset.room!)),
  );
  all("[data-team]", (el) =>
    el.addEventListener("click", () => handlers.toggleStaff(el.dataset.team!)),
  );
  all("[data-build]", (el) =>
    el.addEventListener("click", () => handlers.buildRoom(el.dataset.build!)),
  );
  all("[data-hire]", (el) =>
    el.addEventListener("click", () => handlers.hire(el.dataset.hire!)),
  );
  all("[data-unlock]", (el) =>
    el.addEventListener("click", () => handlers.unlockPractice(el.dataset.unlock!)),
  );
  all("[data-spend]", (el) =>
    el.addEventListener("click", () => {
      const [id, axis] = el.dataset.spend!.split("|");
      handlers.spendSkillPoint(id, axis as SkillAxis);
    }),
  );

  bind("#confirm-assign", handlers.assignCase);
  bind("#upgrade-building", handlers.upgradeBuilding);
  bind("#open-hiring", handlers.openHiring);
  bind("#close-hiring", handlers.closeHiring);
  bind("#open-practices", handlers.openPractices);
  bind("#close-practices", handlers.closePractices);
  bind("#end-turn", handlers.endTurn);
  bind("#new-game", handlers.newGame);
  bind("#close-summary", handlers.closeSummary);
  bind("#overlay-newgame", handlers.newGame);
}
