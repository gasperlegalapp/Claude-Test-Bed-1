import type {
  District,
  GameState,
  Job,
  Staff,
  TurnEvent,
} from "./types.ts";
import { resolveCase, rollNewCase, OFFICE_SCORE_BONUS } from "./jobs.ts";
import {
  casePoolTarget,
  BUILD_COST,
  BUILD_WEEKS,
  SCOUT_WEEKS,
} from "./state.ts";
import { checkStatus } from "./scoring.ts";

// All game actions flow through this reducer: (state, action) -> new state.
// Pure — never mutates the input, never touches the DOM.

export type Action =
  | { type: "ASSIGN_CASE"; caseId: string; staffIds: string[] }
  | { type: "SCOUT"; districtId: string; staffIds: string[] }
  | { type: "BUILD_OFFICE"; districtId: string; staffIds: string[] }
  | { type: "END_TURN" };

export function reduce(state: GameState, action: Action): GameState {
  if (state.status !== "playing") return state;

  switch (action.type) {
    case "ASSIGN_CASE":
      return assignCase(state, action.caseId, action.staffIds);
    case "SCOUT":
      return scout(state, action.districtId, action.staffIds);
    case "BUILD_OFFICE":
      return buildOffice(state, action.districtId, action.staffIds);
    case "END_TURN":
      return endTurn(state);
    default:
      return state;
  }
}

// Validate a requested team: every id must exist and be idle. Returns the
// staff objects, or null if the request is invalid.
function takeIdleStaff(state: GameState, staffIds: string[]): Staff[] | null {
  if (staffIds.length === 0) return null;
  const chosen = staffIds
    .map((id) => state.staff.find((s) => s.id === id))
    .filter((s): s is Staff => !!s && s.status === "idle");
  return chosen.length === staffIds.length ? chosen : null;
}

// Mark a set of staff as working a job.
function occupy(staff: Staff[], ids: Set<string>, jobId: string): Staff[] {
  return staff.map((s) =>
    ids.has(s.id) ? { ...s, status: "assigned", jobId } : s,
  );
}

function assignCase(
  state: GameState,
  caseId: string,
  staffIds: string[],
): GameState {
  const caseInst = state.availableCases.find((c) => c.id === caseId);
  const chosen = takeIdleStaff(state, staffIds);
  if (!caseInst || !chosen) return state;

  const jobId = `job-${state.nextId}`;
  const ids = new Set(chosen.map((s) => s.id));
  const job: Job = {
    kind: "case",
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
    staff: occupy(state.staff, ids, jobId),
  };
}

function scout(
  state: GameState,
  districtId: string,
  staffIds: string[],
): GameState {
  const district = state.districts.find((d) => d.id === districtId);
  const chosen = takeIdleStaff(state, staffIds);
  if (!district || district.discovered || !chosen) return state;

  const jobId = `job-${state.nextId}`;
  const ids = new Set(chosen.map((s) => s.id));
  const job: Job = {
    kind: "scout",
    id: jobId,
    districtId,
    districtName: district.name,
    staffIds: [...ids],
    weeksRemaining: SCOUT_WEEKS,
  };
  return {
    ...state,
    nextId: state.nextId + 1,
    activeJobs: [...state.activeJobs, job],
    staff: occupy(state.staff, ids, jobId),
  };
}

function buildOffice(
  state: GameState,
  districtId: string,
  staffIds: string[],
): GameState {
  const district = state.districts.find((d) => d.id === districtId);
  const chosen = takeIdleStaff(state, staffIds);
  if (!district || !district.discovered || district.hasOffice || !chosen) {
    return state;
  }
  // Building has an upfront cost; can't start one you can't pay for.
  if (state.money < BUILD_COST) return state;
  // Don't double-build: a build already in progress here blocks another.
  if (
    state.activeJobs.some(
      (j) => j.kind === "build" && j.districtId === districtId,
    )
  ) {
    return state;
  }

  const jobId = `job-${state.nextId}`;
  const ids = new Set(chosen.map((s) => s.id));
  const job: Job = {
    kind: "build",
    id: jobId,
    districtId,
    districtName: district.name,
    staffIds: [...ids],
    weeksRemaining: BUILD_WEEKS,
  };
  return {
    ...state,
    nextId: state.nextId + 1,
    money: state.money - BUILD_COST,
    activeJobs: [...state.activeJobs, job],
    staff: occupy(state.staff, ids, jobId),
  };
}

// Advance one week: pay salaries, tick jobs, resolve any that finish (cases
// roll outcomes; scouts reveal districts; builds open offices), free their
// staff, refill the case pool, and record a recap.
function endTurn(state: GameState): GameState {
  let rng = state.rng;
  let nextId = state.nextId;
  let money = state.money;
  let reputation = state.reputation;

  const salariesPaid = state.staff.reduce((sum, s) => sum + s.salary, 0);
  money -= salariesPaid;

  const stillActive: Job[] = [];
  const events: TurnEvent[] = [];
  const freedStaff = new Set<string>();
  const revealed = new Set<string>();
  const builtOffices = new Set<string>();

  const staffNamesOf = (ids: string[]) =>
    ids.map((id) => state.staff.find((s) => s.id === id)?.name ?? "?");

  for (const job of state.activeJobs) {
    const weeksRemaining = job.weeksRemaining - 1;
    if (weeksRemaining > 0) {
      stillActive.push({ ...job, weeksRemaining });
      continue;
    }

    if (job.kind === "case") {
      const assigned = job.staffIds
        .map((id) => state.staff.find((s) => s.id === id))
        .filter((s): s is Staff => !!s);
      const district = state.districts.find(
        (d) => d.id === job.case.districtId,
      );
      const bonus = district?.hasOffice ? OFFICE_SCORE_BONUS : 0;

      const res = resolveCase(job.case, assigned, rng, bonus);
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
    } else if (job.kind === "scout") {
      revealed.add(job.districtId);
      events.push({
        kind: "scout",
        title: job.districtName,
        detail: "District revealed",
        staffNames: staffNamesOf(job.staffIds),
      });
    } else {
      builtOffices.add(job.districtId);
      events.push({
        kind: "build",
        title: job.districtName,
        detail: "Office opened",
        staffNames: staffNamesOf(job.staffIds),
      });
    }

    for (const id of job.staffIds) freedStaff.add(id);
  }

  const staff = state.staff.map((s) =>
    freedStaff.has(s.id) ? { ...s, status: "idle" as const, jobId: null } : s,
  );

  // Apply map changes from completed scout/build jobs.
  const districts: District[] = state.districts.map((d) => {
    if (builtOffices.has(d.id)) return { ...d, discovered: true, hasOffice: true };
    if (revealed.has(d.id)) return { ...d, discovered: true };
    return d;
  });

  // Refill the open-case pool up to the (now possibly larger) target.
  const availableCases = [...state.availableCases];
  const target = casePoolTarget(districts);
  while (availableCases.length < target) {
    const rolled = rollNewCase(districts, `case-${nextId++}`, rng);
    rng = rolled.rng;
    availableCases.push(rolled.caseInst);
  }

  const weeksInDebt = money < 0 ? state.weeksInDebt + 1 : 0;

  const next: GameState = {
    ...state,
    week: state.week + 1,
    rng,
    nextId,
    money,
    reputation,
    staff,
    districts,
    activeJobs: stillActive,
    availableCases,
    weeksInDebt,
    lastTurn: { week: state.week + 1, salariesPaid, events },
  };

  const { status, reason } = checkStatus(next);
  return { ...next, status, statusReason: reason };
}
