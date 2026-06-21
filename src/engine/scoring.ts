import type { GameState, GameStatus } from "./types.ts";
import { REP_VALUE, DEBT_WEEKS_TO_BANKRUPTCY } from "./state.ts";
import { GOALS, type Goal, type GoalMetric } from "../data/goals.ts";

// Firm valuation: cash plus the prestige value of reputation. This is the
// number the player is ultimately trying to grow, and the win condition.
export function computeValuation(state: GameState): number {
  return state.money + state.reputation * REP_VALUE;
}

// The current value of a goal's tracked metric.
export function metricValue(state: GameState, metric: GoalMetric): number {
  switch (metric) {
    case "cash":
      return state.money;
    case "reputation":
      return state.reputation;
    case "valuation":
      return computeValuation(state);
  }
}

export interface GoalProgress {
  goal: Goal;
  current: number;
  done: boolean;
}

// Progress for every active goal, for display and win detection.
export function evaluateGoals(state: GameState): GoalProgress[] {
  return GOALS.map((goal) => {
    const current = metricValue(state, goal.metric);
    return { goal, current, done: current >= goal.target };
  });
}

export interface StatusResult {
  status: GameStatus;
  reason: string;
}

// Decide whether the run is won, lost, or still going. Win takes precedence so
// a final big payday isn't undercut by a salary dip in the same week.
export function checkStatus(state: GameState): StatusResult {
  const victory = GOALS.find((g) => g.isVictory);
  if (victory && metricValue(state, victory.metric) >= victory.target) {
    return {
      status: "won",
      reason: `Your firm reached a $${victory.target.toLocaleString(
        "en-US",
      )} valuation. You run the city now.`,
    };
  }

  if (state.reputation <= 0) {
    return {
      status: "lost",
      reason:
        "The firm's reputation hit zero. Clients flee, the phone stops ringing, the lights go out.",
    };
  }

  if (state.weeksInDebt >= DEBT_WEEKS_TO_BANKRUPTCY) {
    return {
      status: "lost",
      reason: `The firm couldn't make payroll for ${DEBT_WEEKS_TO_BANKRUPTCY} weeks running. Bankrupt.`,
    };
  }

  return { status: "playing", reason: "" };
}
