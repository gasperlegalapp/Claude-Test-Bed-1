import type { GameState } from "./types.ts";

// All game actions flow through this reducer: (state, action) -> new state.
// Reducers are pure — they never mutate the input state and never touch the
// DOM. This is what makes the engine unit-testable and the game extensible.

export type Action = { type: "END_TURN" };

export function reduce(state: GameState, action: Action): GameState {
  switch (action.type) {
    case "END_TURN":
      return { ...state, week: state.week + 1 };
    default:
      return state;
  }
}
