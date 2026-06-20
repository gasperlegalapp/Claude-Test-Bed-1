import type { RngState } from "./rng.ts";

// ---------------------------------------------------------------------------
// Milestone 0 game state.
//
// Everything the game needs to know lives in this single plain object so it
// can be serialized to localStorage and fed through pure reducer functions.
// It will grow milestone by milestone; keep it a flat, JSON-friendly shape.
// ---------------------------------------------------------------------------

export interface GameState {
  week: number;
  rng: RngState;
}
