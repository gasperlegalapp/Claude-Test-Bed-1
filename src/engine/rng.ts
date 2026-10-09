// Deterministic, seedable RNG so runs are reproducible for testing.
// Uses mulberry32 — small, fast, good enough for a game.
//
// The RNG state is a single 32-bit integer. We keep it inside the game
// state and thread it through pure functions, so the same seed + same
// actions always produce the same outcomes.

export interface RngState {
  seed: number;
}

export function createRng(seed: number): RngState {
  // Force into a uint32.
  return { seed: seed >>> 0 };
}

// Returns the next float in [0, 1) and the advanced RNG state.
// Pure: never mutates the input.
export function nextFloat(rng: RngState): { value: number; rng: RngState } {
  let t = (rng.seed + 0x6d2b79f5) >>> 0;
  let x = t;
  x = Math.imul(x ^ (x >>> 15), x | 1);
  x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
  const value = ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  return { value, rng: { seed: t } };
}

// Integer in [min, max] inclusive.
export function nextInt(
  rng: RngState,
  min: number,
  max: number,
): { value: number; rng: RngState } {
  const r = nextFloat(rng);
  const span = max - min + 1;
  return { value: min + Math.floor(r.value * span), rng: r.rng };
}

// Pick a random element from a non-empty array.
export function pick<T>(
  rng: RngState,
  items: readonly T[],
): { value: T; rng: RngState } {
  const r = nextInt(rng, 0, items.length - 1);
  return { value: items[r.value], rng: r.rng };
}
