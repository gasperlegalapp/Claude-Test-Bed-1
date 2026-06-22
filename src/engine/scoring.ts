import type { GameState, GameStatus } from "./types.ts";
import { REP_VALUE, DEBT_WEEKS_TO_BANKRUPTCY } from "./state.ts";
import { officeStats } from "./office.ts";
import { GOALS, type Goal, type GoalMetric } from "../data/goals.ts";

// Firm valuation: cash, the prestige value of reputation, and the invested
// value of the office, less any outstanding debt. The number the player grows.
export function computeValuation(state: GameState): number {
  return state.money + state.reputation * REP_VALUE + officeStats(state).assetValue - state.debt;
}

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

export function checkStatus(state: GameState): StatusResult {
  const victory = GOALS.find((g) => g.isVictory);
  if (victory && metricValue(state, victory.metric) >= victory.target) {
    return {
      status: "won",
      reason: `Your firm reached a $${victory.target.toLocaleString(
        "en-US",
      )} valuation. The satellite office is a runaway success.`,
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
