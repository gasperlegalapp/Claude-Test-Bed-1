// Active goals shown to the player. Declarative content: each goal names a
// firm metric and a target value; the engine computes current progress and
// completion. One goal is the victory condition.

export type GoalMetric = "cash" | "reputation" | "valuation";

export interface Goal {
  id: string;
  label: string;
  metric: GoalMetric;
  target: number;
  isVictory?: boolean; // reaching this ends the run in a win
}

export const GOALS: Goal[] = [
  {
    id: "cash-50k",
    label: "Bank $50,000 in cash",
    metric: "cash",
    target: 50000,
  },
  {
    id: "rep-25",
    label: "Build the firm's reputation to 25",
    metric: "reputation",
    target: 25,
  },
  {
    id: "valuation-250k",
    label: "Reach a $250,000 firm valuation",
    metric: "valuation",
    target: 250000,
    isVictory: true,
  },
];
