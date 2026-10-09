import type { GameState, Matter, Staff, TurnEvent } from "./types.ts";
import {
  resolveLitigation,
  resolveTransactional,
  rollLead,
  canStaffMatter,
  interimBill,
} from "./matters.ts";
import {
  CANDIDATE_POOL,
  MAX_OFFERED,
  LEAD_CHANCE,
  WEEK_DAYS,
  MARKETING_TIERS,
  LOAN_CHUNK,
  weeklyOverhead,
  marketingTier,
  weeklyInterest,
  availableCredit,
} from "./state.ts";
import { checkStatus } from "./scoring.ts";
import { gainXp, spendSkillPoint } from "./growth.ts";
import { officeStats, hasFreeSeat, roleCount } from "./office.ts";
import { generateCandidate, generateStartingStaff } from "./people.ts";
import { nextFloat } from "./rng.ts";
import { type SkillAxis } from "../data/skills.ts";
import { ROLE_DEFS } from "../data/staff.ts";

export type Action =
  | { type: "START_GAME"; areas: string[] }
  | { type: "TAKE_MATTER"; matterId: string; staffIds: string[] }
  | { type: "HIRE"; candidateId: string }
  | { type: "SPEND_SKILL_POINT"; staffId: string; axis: SkillAxis }
  | { type: "SET_MARKETING"; level: number }
  | { type: "TAKE_LOAN" }
  | { type: "REPAY_LOAN" }
  | { type: "END_TURN" };

export function reduce(state: GameState, action: Action): GameState {
  if (action.type === "START_GAME") return startGame(state, action.areas);
  if (state.phase !== "playing" || state.status !== "playing") return state;

  switch (action.type) {
    case "TAKE_MATTER":
      return takeMatter(state, action.matterId, action.staffIds);
    case "HIRE":
      return hire(state, action.candidateId);
    case "SPEND_SKILL_POINT":
      return spendPoint(state, action.staffId, action.axis);
    case "SET_MARKETING":
      return setMarketing(state, action.level);
    case "TAKE_LOAN":
      return takeLoan(state);
    case "REPAY_LOAN":
      return repayLoan(state);
    case "END_TURN":
      return endTurn(state);
    default:
      return state;
  }
}

// Choose focus areas, seed the founding team and first leads, begin play.
function startGame(state: GameState, areas: string[]): GameState {
  if (state.phase !== "setup" || areas.length === 0) return state;

  const seeded = generateStartingStaff(areas, state.nextId, state.rng);
  let rng = seeded.rng;
  let nextId = seeded.nextId;

  const next: GameState = {
    ...state,
    phase: "playing",
    focusAreas: areas,
    staff: seeded.staff,
    rng,
    nextId,
  };

  // A few initial leads to get going.
  const matters: Matter[] = [];
  for (let i = 0; i < 3; i++) {
    const lead = rollLead(next, `matter-${nextId++}`, rng);
    if (!lead) break;
    rng = lead.rng;
    matters.push(lead.matter);
  }

  // Refresh candidates now that we know the focus.
  const candidates = [];
  for (let i = 0; i < CANDIDATE_POOL; i++) {
    const c = generateCandidate(`cand-${nextId++}`, areas, rng);
    rng = c.rng;
    candidates.push(c.candidate);
  }

  return { ...next, matters, candidates, rng, nextId };
}

function takeMatter(
  state: GameState,
  matterId: string,
  staffIds: string[],
): GameState {
  const matter = state.matters.find((m) => m.id === matterId);
  if (!matter || matter.status !== "offered") return state;
  if (!canStaffMatter(state, matter, staffIds)) return state;

  // Collect the retainer up front when the client signs.
  return {
    ...state,
    money: state.money + matter.retainer,
    matters: state.matters.map((m) =>
      m.id === matterId
        ? { ...m, status: "active", staffIds: [...staffIds], collected: m.retainer }
        : m,
    ),
  };
}

function hire(state: GameState, candidateId: string): GameState {
  const cand = state.candidates.find((c) => c.id === candidateId);
  if (!cand) return state;
  if (state.money < cand.signingCost) return state;
  if (!hasFreeSeat(state, cand.role)) return state;
  const max = ROLE_DEFS[cand.role].max;
  if (max !== undefined && roleCount(state, cand.role) >= max) return state;

  const newHire: Staff = {
    id: `staff-${state.nextId}`,
    name: cand.name,
    role: cand.role,
    practiceAreas: cand.practiceAreas,
    skills: cand.skills,
    xp: 0,
    level: 1,
    skillPoints: 0,
    salary: cand.salary,
  };
  return {
    ...state,
    nextId: state.nextId + 1,
    money: state.money - cand.signingCost,
    staff: [...state.staff, newHire],
    candidates: state.candidates.filter((c) => c.id !== candidateId),
  };
}

function spendPoint(state: GameState, staffId: string, axis: SkillAxis): GameState {
  let changed = false;
  const staff = state.staff.map((s) => {
    if (s.id !== staffId) return s;
    const next = spendSkillPoint(s, axis);
    if (next) changed = true;
    return next ?? s;
  });
  return changed ? { ...state, staff } : state;
}

// Set the weekly marketing budget tier. The cost applies at end of week.
function setMarketing(state: GameState, level: number): GameState {
  if (level < 0 || level >= MARKETING_TIERS.length) return state;
  if (level === state.marketingLevel) return state;
  return { ...state, marketingLevel: level };
}

// Draw down the line of credit in fixed increments, up to the credit limit.
function takeLoan(state: GameState): GameState {
  const amount = Math.min(LOAN_CHUNK, availableCredit(state));
  if (amount <= 0) return state;
  return { ...state, money: state.money + amount, debt: state.debt + amount };
}

// Pay down principal in fixed increments (limited by debt and cash on hand).
function repayLoan(state: GameState): GameState {
  const amount = Math.min(LOAN_CHUNK, state.debt, state.money);
  if (amount <= 0) return state;
  return { ...state, money: state.money - amount, debt: state.debt - amount };
}

function endTurn(state: GameState): GameState {
  let rng = state.rng;
  let nextId = state.nextId;
  let money = state.money;
  let reputation = state.reputation;
  const events: TurnEvent[] = [];

  const salariesPaid = state.staff.reduce((sum, s) => sum + s.salary, 0);
  const overheadPaid = weeklyOverhead(state);
  const marketingPaid = marketingTier(state).weeklyCost;
  const interestPaid = weeklyInterest(state);
  money -= salariesPaid + overheadPaid + marketingPaid + interestPaid;

  const officeBonus = officeStats(state).caseBonus;
  const staffById = new Map(state.staff.map((s) => [s.id, s]));
  let billingsCollected = 0;

  // Progress and resolve active matters.
  const remaining: Matter[] = [];
  for (const m of state.matters) {
    if (m.status !== "active") {
      remaining.push(m);
      continue;
    }
    const daysRemaining = m.daysRemaining - WEEK_DAYS;
    if (daysRemaining > 0) {
      // Still in progress: bill the client for this week's work.
      const bill = interimBill(m);
      money += bill;
      billingsCollected += bill;
      remaining.push({ ...m, daysRemaining, collected: m.collected + bill });
      continue;
    }

    const assigned = m.staffIds
      .map((id) => staffById.get(id))
      .filter((s): s is Staff => !!s);

    let outcome: TurnEvent["outcome"];
    let moneyDelta: number;
    let repDelta: number;
    let detail: string | undefined;
    if (m.category === "litigation") {
      const res = resolveLitigation(m, assigned, rng, officeBonus);
      rng = res.rng;
      outcome = res.outcome;
      moneyDelta = res.moneyDelta;
      repDelta = res.repDelta;
      detail = res.detail;
    } else {
      const res = resolveTransactional(m, rng);
      rng = res.rng;
      outcome = res.outcome;
      moneyDelta = res.moneyDelta;
      repDelta = res.repDelta;
      detail = res.detail;
    }
    money += moneyDelta;
    reputation += repDelta;
    events.push({
      kind: "matter",
      title: m.title,
      category: m.category,
      outcome,
      moneyDelta,
      repDelta,
      detail,
    });

    // Everyone on the matter earns experience.
    for (const s of assigned) {
      const trained = gainXp(staffById.get(s.id)!, outcome!, m.difficulty);
      staffById.set(s.id, trained.staff);
      if (trained.levels > 0) {
        events.push({
          kind: "growth",
          title: trained.staff.name,
          detail: `Reached level ${trained.staff.level} — +${trained.levels} skill point${
            trained.levels > 1 ? "s" : ""
          }`,
        });
      }
    }
  }

  // Age out stale leads.
  const kept: Matter[] = [];
  for (const m of remaining) {
    if (m.status === "offered") {
      const expiresInWeeks = m.expiresInWeeks - 1;
      if (expiresInWeeks <= 0) continue; // lead went cold
      kept.push({ ...m, expiresInWeeks });
    } else {
      kept.push(m);
    }
  }

  const next: GameState = {
    ...state,
    week: state.week + 1,
    money,
    reputation,
    staff: [...staffById.values()],
    matters: kept,
    rng,
    nextId,
  };

  // New leads come in intermittently. A receptionist works the phones; a
  // marketing budget adds extra intake attempts and improves each one's odds.
  const mkt = marketingTier(state);
  const attempts = 1 + officeStats(next).receptionHoused + mkt.extraAttempts;
  for (let i = 0; i < attempts; i++) {
    if (next.matters.filter((m) => m.status === "offered").length >= MAX_OFFERED) break;
    const roll = nextFloat(next.rng);
    next.rng = roll.rng;
    if (roll.value > LEAD_CHANCE + mkt.chanceBonus) continue;
    const lead = rollLead(next, `matter-${next.nextId++}`, next.rng);
    if (!lead) break;
    next.rng = lead.rng;
    next.matters.push(lead.matter);
    events.push({ kind: "lead", title: lead.matter.title, detail: "New lead" });
  }

  // Top up the candidate pool.
  while (next.candidates.length < CANDIDATE_POOL) {
    const c = generateCandidate(`cand-${next.nextId++}`, next.focusAreas, next.rng);
    next.rng = c.rng;
    next.candidates.push(c.candidate);
  }

  next.weeksInDebt = money < 0 ? state.weeksInDebt + 1 : 0;
  next.lastTurn = {
    week: state.week + 1,
    salariesPaid,
    overheadPaid,
    marketingPaid,
    interestPaid,
    billingsCollected,
    events,
  };

  const { status, reason } = checkStatus(next);
  next.status = status;
  next.statusReason = reason;
  return next;
}
