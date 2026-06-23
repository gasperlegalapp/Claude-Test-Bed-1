import { describe, it, expect, beforeEach } from "vitest";
import { createInitialState } from "../state.ts";
import { reduce } from "../reducer.ts";
import { saveGame, loadGame, clearSave, savedSummary, recordBest, loadBest } from "../save.ts";

// The save module talks to window.localStorage; the node test env has neither,
// so we install a tiny in-memory stand-in.
class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string) {
    return this.m.has(k) ? this.m.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}

beforeEach(() => {
  (globalThis as { window?: unknown }).window = { localStorage: new MemStorage() };
});

function playing(seed = 5) {
  return reduce(createInitialState(seed), { type: "START_GAME", areas: ["criminal", "family"] });
}

describe("save & resume", () => {
  it("round-trips an in-progress run", () => {
    const s = playing();
    saveGame(s);
    const loaded = loadGame();
    expect(loaded).not.toBeNull();
    expect(loaded!.week).toBe(s.week);
    expect(loaded!.staff.length).toBe(s.staff.length);
    expect(loaded!.focusAreas).toEqual(s.focusAreas);
  });

  it("surfaces a summary for the Continue button", () => {
    const s = { ...playing(), money: 42000 };
    saveGame(s);
    expect(savedSummary()).toEqual({ week: s.week, money: 42000 });
  });

  it("won't resume a run that isn't in progress", () => {
    saveGame(createInitialState(1)); // still in setup
    expect(loadGame()).toBeNull();
    const ended = { ...playing(), status: "won" as const };
    saveGame(ended);
    expect(loadGame()).toBeNull();
  });

  it("clearSave drops the saved run", () => {
    saveGame(playing());
    clearSave();
    expect(loadGame()).toBeNull();
  });
});

describe("high score", () => {
  it("keeps only the best score and reports new records", () => {
    expect(loadBest()).toBe(0);
    expect(recordBest(100000)).toBe(true);
    expect(loadBest()).toBe(100000);
    expect(recordBest(80000)).toBe(false); // not an improvement
    expect(loadBest()).toBe(100000);
    expect(recordBest(250000)).toBe(true);
    expect(loadBest()).toBe(250000);
  });
});
