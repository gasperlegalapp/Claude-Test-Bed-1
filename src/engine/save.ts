// Local persistence: autosave the current run so a refresh doesn't wipe the
// firm, and keep a best-valuation high score across runs. All access is wrapped
// in try/catch because localStorage can be unavailable (private mode, quota).

import type { GameState } from "./types.ts";

const SAVE_KEY = "firm.save.v1";
const BEST_KEY = "firm.best.v1";

export interface SaveSummary {
  week: number;
  money: number;
}

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

// Persist an in-progress run. Finished runs aren't saved (see clearSave on end).
export function saveGame(state: GameState): void {
  const s = storage();
  if (!s) return;
  try {
    s.setItem(SAVE_KEY, JSON.stringify(state));
  } catch {
    /* out of quota or blocked — nothing we can do, play on */
  }
}

export function loadGame(): GameState | null {
  const s = storage();
  if (!s) return null;
  try {
    const raw = s.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as GameState;
    // Minimal shape check: only resume a real, in-progress run.
    if (!data || data.phase !== "playing" || data.status !== "playing") return null;
    if (!Array.isArray(data.staff) || !Array.isArray(data.matters)) return null;
    return data;
  } catch {
    return null;
  }
}

// A light summary for the "Continue" button without committing to a full load.
export function savedSummary(): SaveSummary | null {
  const g = loadGame();
  if (!g) return null;
  return { week: g.week, money: g.money };
}

export function clearSave(): void {
  const s = storage();
  if (!s) return;
  try {
    s.removeItem(SAVE_KEY);
  } catch {
    /* ignore */
  }
}

export function loadBest(): number {
  const s = storage();
  if (!s) return 0;
  try {
    const raw = s.getItem(BEST_KEY);
    const n = raw ? Number(raw) : 0;
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

// Record a finished run's score; returns true if it set a new best.
export function recordBest(score: number): boolean {
  const s = storage();
  if (!s) return false;
  const prev = loadBest();
  if (score <= prev) return false;
  try {
    s.setItem(BEST_KEY, String(Math.round(score)));
    return true;
  } catch {
    return false;
  }
}
