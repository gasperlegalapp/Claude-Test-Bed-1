import { createInitialState } from "./engine/state.ts";
import { reduce } from "./engine/reducer.ts";
import { computeValuation } from "./engine/scoring.ts";
import {
  saveGame,
  loadGame,
  clearSave,
  loadBest,
  recordBest,
} from "./engine/save.ts";
import type { GameState } from "./engine/types.ts";
import { renderApp, type UiState } from "./ui/render.ts";
import "./styles.css";

function freshUi(): UiState {
  return {
    setupAreas: new Set(),
    selectedMatterId: null,
    selectedStaff: new Set(),
    showSummary: false,
    showHiring: false,
    showHelp: false,
    endBest: 0,
    endIsNew: false,
  };
}

let game: GameState = createInitialState(Date.now() >>> 0);
let ui: UiState = freshUi();

const root = document.querySelector<HTMLDivElement>("#app")!;

function clearSelection(): void {
  ui.selectedMatterId = null;
  ui.selectedStaff.clear();
}

// Autosave the active run; on a finished run, bank the score and drop the save
// so the next launch opens fresh. Runs once per state change.
let lastPersisted: GameState | null = null;
let endHandled = false;
function persist(): void {
  if (game === lastPersisted) return;
  lastPersisted = game;
  if (game.phase !== "playing") return;
  if (game.status === "playing") {
    saveGame(game);
    return;
  }
  if (!endHandled) {
    endHandled = true;
    const peak = Math.max(computeValuation(game), ...game.history.map((h) => h.valuation));
    ui.endIsNew = recordBest(peak);
    ui.endBest = loadBest();
    clearSave();
  }
}

function startFresh(): void {
  clearSave();
  endHandled = false;
  game = createInitialState(Date.now() >>> 0);
  ui = freshUi();
  render();
}

function render(): void {
  persist();
  renderApp(root, game, ui, {
    toggleSetupArea(id) {
      if (ui.setupAreas.has(id)) ui.setupAreas.delete(id);
      else if (ui.setupAreas.size < 2) ui.setupAreas.add(id);
      render();
    },
    startGame() {
      if (ui.setupAreas.size === 0) return;
      endHandled = false;
      game = reduce(game, { type: "START_GAME", areas: [...ui.setupAreas] });
      render();
    },
    continueGame() {
      const saved = loadGame();
      if (!saved) return;
      endHandled = false;
      game = saved;
      ui = freshUi();
      render();
    },
    selectMatter(id) {
      const same = ui.selectedMatterId === id;
      clearSelection();
      ui.selectedMatterId = same ? null : id;
      render();
    },
    toggleStaff(id) {
      if (ui.selectedStaff.has(id)) ui.selectedStaff.delete(id);
      else ui.selectedStaff.add(id);
      render();
    },
    spendSkillPoint(staffId, axis) {
      game = reduce(game, { type: "SPEND_SKILL_POINT", staffId, axis });
      render();
    },
    takeMatter() {
      if (!ui.selectedMatterId || ui.selectedStaff.size === 0) return;
      game = reduce(game, {
        type: "TAKE_MATTER",
        matterId: ui.selectedMatterId,
        staffIds: [...ui.selectedStaff],
      });
      clearSelection();
      render();
    },
    dismissLead(id) {
      game = reduce(game, { type: "DISMISS_LEAD", matterId: id });
      if (ui.selectedMatterId === id) clearSelection();
      render();
    },
    setMarketing(level) {
      game = reduce(game, { type: "SET_MARKETING", level });
      render();
    },
    takeLoan() {
      game = reduce(game, { type: "TAKE_LOAN" });
      render();
    },
    repayLoan() {
      game = reduce(game, { type: "REPAY_LOAN" });
      render();
    },
    openHiring() {
      ui.showHiring = true;
      render();
    },
    closeHiring() {
      ui.showHiring = false;
      render();
    },
    hire(candidateId) {
      game = reduce(game, { type: "HIRE", candidateId });
      render();
    },
    toggleHelp() {
      ui.showHelp = !ui.showHelp;
      render();
    },
    endTurn() {
      game = reduce(game, { type: "END_TURN" });
      clearSelection();
      ui.showSummary = true;
      render();
    },
    closeSummary() {
      ui.showSummary = false;
      render();
    },
    newGame() {
      startFresh();
    },
  });
}

window.addEventListener("keydown", (e) => {
  const tag = (e.target as HTMLElement)?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return;
  if (game.phase !== "playing" || game.status !== "playing") return;

  // The help overlay can be toggled from anywhere in play.
  if (e.key === "?") {
    ui.showHelp = !ui.showHelp;
    render();
    return;
  }
  if (ui.showHelp) {
    if (e.key === "Escape") {
      ui.showHelp = false;
      render();
    }
    return;
  }
  if (ui.showHiring) {
    if (e.key === "Escape") {
      ui.showHiring = false;
      render();
    }
    return;
  }
  if (ui.showSummary) {
    if (e.key === "Enter" || e.key === "Escape" || e.key.toLowerCase() === "e") {
      ui.showSummary = false;
      render();
    }
    return;
  }
  if (e.key === "Escape") {
    clearSelection();
    render();
  } else if (e.key.toLowerCase() === "h") {
    ui.showHiring = true;
    render();
  } else if (e.key === "Enter" || e.key.toLowerCase() === "e") {
    game = reduce(game, { type: "END_TURN" });
    clearSelection();
    ui.showSummary = true;
    render();
  }
});

render();
