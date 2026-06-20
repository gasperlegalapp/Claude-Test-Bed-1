import { describe, it, expect } from "vitest";
import { createInitialState } from "../state.ts";
import { reduce } from "../reducer.ts";

describe("reducer — milestone 0", () => {
  it("starts at week 0", () => {
    expect(createInitialState().week).toBe(0);
  });

  it("END_TURN advances the week", () => {
    let s = createInitialState();
    s = reduce(s, { type: "END_TURN" });
    expect(s.week).toBe(1);
    s = reduce(s, { type: "END_TURN" });
    expect(s.week).toBe(2);
  });

  it("does not mutate the input state", () => {
    const s = createInitialState();
    reduce(s, { type: "END_TURN" });
    expect(s.week).toBe(0);
  });
});
