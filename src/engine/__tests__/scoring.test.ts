import { describe, it, expect } from "vitest";
import { createInitialState, REP_VALUE } from "../state.ts";
import { computeValuation, evaluateGoals, checkStatus } from "../scoring.ts";
import { officeStats } from "../office.ts";
import type { GameState } from "../types.ts";

function withState(over: Partial<GameState>): GameState {
  return { ...createInitialState(1), ...over };
}

describe("computeValuation", () => {
  it("is cash plus reputation prestige plus the office's asset value", () => {
    const s = withState({ money: 20000, reputation: 5 });
    expect(computeValuation(s)).toBe(
      20000 + 5 * REP_VALUE + officeStats(s).assetValue,
    );
  });
});

describe("evaluateGoals", () => {
  it("marks a goal done once its metric reaches the target", () => {
    const s = withState({ money: 60000 });
    const cash = evaluateGoals(s).find((g) => g.goal.metric === "cash")!;
    expect(cash.done).toBe(true);
  });

  it("leaves an unmet goal incomplete", () => {
    const s = withState({ money: 100, reputation: 1 });
    const rep = evaluateGoals(s).find((g) => g.goal.metric === "reputation")!;
    expect(rep.done).toBe(false);
  });
});

describe("checkStatus", () => {
  it("keeps a healthy firm playing", () => {
    const s = withState({ money: 10000, reputation: 10, weeksInDebt: 0 });
    expect(checkStatus(s).status).toBe("playing");
  });

  it("wins when valuation reaches the victory target", () => {
    const s = withState({ money: 300000, reputation: 10 });
    expect(checkStatus(s).status).toBe("won");
  });

  it("loses when reputation bottoms out", () => {
    const s = withState({ reputation: 0 });
    expect(checkStatus(s).status).toBe("lost");
  });

  it("loses after too many weeks unable to make payroll", () => {
    const s = withState({ reputation: 5, weeksInDebt: 4 });
    expect(checkStatus(s).status).toBe("lost");
  });
});
