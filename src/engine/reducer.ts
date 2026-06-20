import type { GameState, Job, ResolvedJob, Staff } from "./types.ts";
import { resolveCase, rollNewCase } from "./jobs.ts";
import { CASE_POOL_TARGET } from "./state.ts";

// All game actions flow through this reducer: (state, action) -> new state.
// Pure — never mutates the input, never touches the DOM. This is the entire
// rules surface of the game and is fully unit-testable.

export type Action =
  | { type: "ASSIGN"; caseId: string; staffIds: string[] }
  | { type: "END_TURN" };

export function reduce(state: GameState, action: Action): GameState {
  switch (action.type) {
    case "ASSIGN":
      return assign(state, action.caseId, action.staffIds);
    case "END_TURN":
      return endTurn(state);
    default:
      return state;
  }
}

// Assign a set of idle staff to an available case, creating an active job.
// Invalid requests (missing case, busy or unknown staff, empty team) return
// the state unchanged so the UI can stay simple.
function assign(state: GameState, caseId: string, staffIds: string[]): GameState {
  const caseInst = state.availableCases.find((c) => c.id === caseId);
  if (!caseInst || staffIds.length === 0) return state;

  const chosen = staffIds
    .map((id) => state.staff.find((s) => s.id === id))
    .filter((s): s is Staff => !!s && s.status === "idle");
  if (chosen.length !== staffIds.length) return state;

  const jobId = `job-${state.nextId}`;
  const chosenIds = new Set(chosen.map((s) => s.id));

  const job: Job = {
    id: jobId,
    case: caseInst,
    staffIds: chosen.map((s) => s.id),
    weeksRemaining: caseInst.durationWeeks,
  };

  return {
    ...state,
    nextId: state.nextId + 1,
    availableCases: state.availableCases.filter((c) => c.id !== caseId),
    activeJobs: [...state.activeJobs, job],
    staff: state.staff.map((s) =>
      chosenIds.has(s.id) ? { ...s, status: "assigned", jobId } : s,
    ),
  };
}

// Advance one week: pay salaries, tick jobs, resolve any that finish, free
// their staff, refill the case pool, and record a summary for the UI.
function endTurn(state: GameState): GameState {
  let rng = state.rng;
  let nextId = state.nextId;
  let money = state.money;

  // 1. Weekly salary drain — idle staff bleed money, creating pressure.
  const salariesPaid = state.staff.reduce((sum, s) => sum + s.salary, 0);
  money -= salariesPaid;

  // 2. Tick every active job; resolve the ones that complete this week.
  const stillActive: Job[] = [];
  const resolved: ResolvedJob[] = [];
  const freedStaff = new Set<string>();

  for (const job of state.activeJobs) {
    const weeksRemaining = job.weeksRemaining - 1;
    if (weeksRemaining > 0) {
      stillActive.push({ ...job, weeksRemaining });
      continue;
    }

    const assigned = job.staffIds
      .map((id) => state.staff.find((s) => s.id === id))
      .filter((s): s is Staff => !!s);

    const res = resolveCase(job.case, assigned, rng);
    rng = res.rng;
    money += res.moneyDelta;

    resolved.push({
      caseTitle: job.case.title,
      outcome: res.outcome,
      moneyDelta: res.moneyDelta,
      staffNames: assigned.map((s) => s.name),
    });

    for (const id of job.staffIds) freedStaff.add(id);
  }

  // 3. Free the staff whose jobs finished.
  const staff = state.staff.map((s) =>
    freedStaff.has(s.id) ? { ...s, status: "idle" as const, jobId: null } : s,
  );

  // 4. Refill the open-case pool back up to target.
  const availableCases = [...state.availableCases];
  while (availableCases.length < CASE_POOL_TARGET) {
    const rolled = rollNewCase(`case-${nextId++}`, rng);
    rng = rolled.rng;
    availableCases.push(rolled.caseInst);
  }

  return {
    ...state,
    week: state.week + 1,
    rng,
    nextId,
    money,
    staff,
    activeJobs: stillActive,
    availableCases,
    lastTurn: { week: state.week + 1, salariesPaid, resolved },
  };
}
