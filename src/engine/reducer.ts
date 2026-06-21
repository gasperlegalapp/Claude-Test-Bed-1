import type { GameState, Job, Outcome, Room, Staff, TurnEvent } from "./types.ts";
import { resolveCase, rollNewCase } from "./jobs.ts";
import { casePoolTarget, CANDIDATE_POOL } from "./state.ts";
import { checkStatus } from "./scoring.ts";
import { gainXp, spendSkillPoint } from "./growth.ts";
import { officeStats, roomType, hasFreeSeat } from "./office.ts";
import { generateCandidate } from "./recruit.ts";
import { type SkillAxis } from "../data/skills.ts";
import { PRACTICE_AREAS } from "../data/practices.ts";
import { BUILDINGS } from "../data/buildings.ts";

// All game actions flow through this reducer: (state, action) -> new state.
// Pure — never mutates the input, never touches the DOM.

export type Action =
  | { type: "ASSIGN_CASE"; caseId: string; staffIds: string[] }
  | { type: "BUILD_ROOM"; slot: number; roomTypeId: string }
  | { type: "UPGRADE_BUILDING" }
  | { type: "HIRE"; candidateId: string }
  | { type: "UNLOCK_PRACTICE"; practiceId: string }
  | { type: "SPEND_SKILL_POINT"; staffId: string; axis: SkillAxis }
  | { type: "END_TURN" };

export function reduce(state: GameState, action: Action): GameState {
  if (state.status !== "playing") return state;

  switch (action.type) {
    case "ASSIGN_CASE":
      return assignCase(state, action.caseId, action.staffIds);
    case "BUILD_ROOM":
      return buildRoom(state, action.slot, action.roomTypeId);
    case "UPGRADE_BUILDING":
      return upgradeBuilding(state);
    case "HIRE":
      return hire(state, action.candidateId);
    case "UNLOCK_PRACTICE":
      return unlockPractice(state, action.practiceId);
    case "SPEND_SKILL_POINT":
      return spendPoint(state, action.staffId, action.axis);
    case "END_TURN":
      return endTurn(state);
    default:
      return state;
  }
}

function assignCase(
  state: GameState,
  caseId: string,
  staffIds: string[],
): GameState {
  const caseInst = state.availableCases.find((c) => c.id === caseId);
  if (!caseInst || staffIds.length === 0) return state;

  const chosen = staffIds
    .map((id) => state.staff.find((s) => s.id === id))
    .filter((s): s is Staff => !!s && s.status === "idle");
  if (chosen.length !== staffIds.length) return state;

  const jobId = `job-${state.nextId}`;
  const ids = new Set(chosen.map((s) => s.id));
  const job: Job = {
    id: jobId,
    case: caseInst,
    staffIds: [...ids],
    weeksRemaining: caseInst.durationWeeks,
  };
  return {
    ...state,
    nextId: state.nextId + 1,
    availableCases: state.availableCases.filter((c) => c.id !== caseId),
    activeJobs: [...state.activeJobs, job],
    staff: state.staff.map((s) =>
      ids.has(s.id) ? { ...s, status: "assigned", jobId } : s,
    ),
  };
}

// Build a room into an empty, in-bounds slot for cash. Instant.
function buildRoom(
  state: GameState,
  slot: number,
  roomTypeId: string,
): GameState {
  const stats = officeStats(state);
  if (slot < 0 || slot >= stats.slotsTotal) return state;
  if (state.rooms.some((r) => r.slot === slot)) return state;
  const t = roomType(roomTypeId);
  if (!t || state.money < t.buildCost) return state;

  const room: Room = { id: `room-${state.nextId}`, typeId: roomTypeId, slot };
  return {
    ...state,
    nextId: state.nextId + 1,
    money: state.money - t.buildCost,
    rooms: [...state.rooms, room],
  };
}

// Move up to the next, larger building tier for cash. Rooms carry over.
function upgradeBuilding(state: GameState): GameState {
  const next = state.buildingTier + 1;
  if (next >= BUILDINGS.length) return state;
  const cost = BUILDINGS[next].upgradeCost;
  if (state.money < cost) return state;
  return { ...state, money: state.money - cost, buildingTier: next };
}

// Hire a candidate: needs a free seat of their type and the signing fee.
function hire(state: GameState, candidateId: string): GameState {
  const cand = state.candidates.find((c) => c.id === candidateId);
  if (!cand) return state;
  if (state.money < cand.signingCost) return state;
  if (!hasFreeSeat(state, cand.role)) return state;

  const newHire: Staff = {
    id: `staff-${state.nextId}`,
    name: cand.name,
    role: cand.role,
    skills: cand.skills,
    xp: 0,
    level: 1,
    skillPoints: 0,
    salary: cand.salary,
    status: "idle",
    jobId: null,
  };
  return {
    ...state,
    nextId: state.nextId + 1,
    money: state.money - cand.signingCost,
    staff: [...state.staff, newHire],
    candidates: state.candidates.filter((c) => c.id !== candidateId),
  };
}

function unlockPractice(state: GameState, practiceId: string): GameState {
  const area = PRACTICE_AREAS.find((a) => a.id === practiceId);
  if (!area || state.unlockedPractices.includes(practiceId)) return state;
  if (!area.prereqs.every((p) => state.unlockedPractices.includes(p))) {
    return state;
  }
  if (state.money < area.costMoney || state.reputation < area.costRep) {
    return state;
  }
  return {
    ...state,
    money: state.money - area.costMoney,
    reputation: state.reputation - area.costRep,
    unlockedPractices: [...state.unlockedPractices, practiceId],
  };
}

function spendPoint(
  state: GameState,
  staffId: string,
  axis: SkillAxis,
): GameState {
  let changed = false;
  const staff = state.staff.map((s) => {
    if (s.id !== staffId) return s;
    const next = spendSkillPoint(s, axis);
    if (next) changed = true;
    return next ?? s;
  });
  return changed ? { ...state, staff } : state;
}

// Advance one week: pay salaries, resolve finished cases (firm-wide office
// bonus applies), train staff, refill cases + candidates, record a recap.
function endTurn(state: GameState): GameState {
  let rng = state.rng;
  let nextId = state.nextId;
  let money = state.money;
  let reputation = state.reputation;

  const salariesPaid = state.staff.reduce((sum, s) => sum + s.salary, 0);
  money -= salariesPaid;

  const officeBonus = officeStats(state).caseBonus;

  const stillActive: Job[] = [];
  const events: TurnEvent[] = [];
  const freedStaff = new Set<string>();
  const training = new Map<string, { outcome: Outcome; difficulty: number }>();

  for (const job of state.activeJobs) {
    const weeksRemaining = job.weeksRemaining - 1;
    if (weeksRemaining > 0) {
      stillActive.push({ ...job, weeksRemaining });
      continue;
    }

    const assigned = job.staffIds
      .map((id) => state.staff.find((s) => s.id === id))
      .filter((s): s is Staff => !!s);

    const res = resolveCase(job.case, assigned, rng, officeBonus);
    rng = res.rng;
    money += res.moneyDelta;
    reputation += res.repDelta;
    events.push({
      kind: "case",
      title: job.case.title,
      outcome: res.outcome,
      moneyDelta: res.moneyDelta,
      repDelta: res.repDelta,
      staffNames: assigned.map((s) => s.name),
    });
    for (const s of assigned) {
      training.set(s.id, { outcome: res.outcome, difficulty: job.case.difficulty });
    }
    for (const id of job.staffIds) freedStaff.add(id);
  }

  const staff = state.staff.map((s) => {
    let ns = freedStaff.has(s.id)
      ? { ...s, status: "idle" as const, jobId: null }
      : s;
    const t = training.get(s.id);
    if (t) {
      const trained = gainXp(ns, t.outcome, t.difficulty);
      ns = trained.staff;
      if (trained.levels > 0) {
        const pts = trained.levels;
        events.push({
          kind: "growth",
          title: ns.name,
          detail: `Reached level ${ns.level} — +${pts} skill point${
            pts > 1 ? "s" : ""
          }`,
          staffNames: [],
        });
      }
    }
    return ns;
  });

  const next: GameState = {
    ...state,
    week: state.week + 1,
    rng,
    nextId,
    money,
    reputation,
    staff,
    activeJobs: stillActive,
    lastTurn: { week: state.week + 1, salariesPaid, events },
  };

  // Refill open cases to capacity.
  const target = casePoolTarget(next);
  while (next.availableCases.length < target) {
    const rolled = rollNewCase(next.unlockedPractices, `case-${next.nextId++}`, next.rng);
    next.rng = rolled.rng;
    next.availableCases.push(rolled.caseInst);
  }

  // Refresh the candidate pool.
  while (next.candidates.length < CANDIDATE_POOL) {
    const c = generateCandidate(`cand-${next.nextId++}`, next.rng);
    next.rng = c.rng;
    next.candidates.push(c.candidate);
  }

  next.weeksInDebt = money < 0 ? state.weeksInDebt + 1 : 0;

  const { status, reason } = checkStatus(next);
  next.status = status;
  next.statusReason = reason;
  return next;
}
