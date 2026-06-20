import { createRng } from "./rng.ts";
import type { GameState } from "./types.ts";

// Builds a fresh game at week 0. Pass a seed for reproducible runs.
export function createInitialState(seed = 1): GameState {
  return {
    week: 0,
    rng: createRng(seed),
  };
}
