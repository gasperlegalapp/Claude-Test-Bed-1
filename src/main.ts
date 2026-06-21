import { createInitialState } from "./engine/state.ts";
import { reduce } from "./engine/reducer.ts";
import type { GameState } from "./engine/types.ts";
import { renderApp, type UiState } from "./ui/render.ts";
import "./styles.css";

let game: GameState = createInitialState(Date.now() >>> 0);
let ui: UiState = {
  selectedCaseId: null,
  selectedStaff: new Set(),
  showSummary: false,
};

const root = document.querySelector<HTMLDivElement>("#app")!;

function render(): void {
  renderApp(root, game, ui, {
    selectCase(id) {
      // Toggle selection; switching cases clears the in-progress team pick.
      ui.selectedCaseId = ui.selectedCaseId === id ? null : id;
      ui.selectedStaff.clear();
      render();
    },
    toggleStaff(id) {
      if (ui.selectedStaff.has(id)) ui.selectedStaff.delete(id);
      else ui.selectedStaff.add(id);
      render();
    },
    assign() {
      if (!ui.selectedCaseId || ui.selectedStaff.size === 0) return;
      game = reduce(game, {
        type: "ASSIGN",
        caseId: ui.selectedCaseId,
        staffIds: [...ui.selectedStaff],
      });
      ui.selectedCaseId = null;
      ui.selectedStaff.clear();
      render();
    },
    endTurn() {
      game = reduce(game, { type: "END_TURN" });
      ui.selectedCaseId = null;
      ui.selectedStaff.clear();
      ui.showSummary = true;
      render();
    },
    closeSummary() {
      ui.showSummary = false;
      render();
    },
    newGame() {
      game = createInitialState(Date.now() >>> 0);
      ui = { selectedCaseId: null, selectedStaff: new Set(), showSummary: false };
      render();
    },
  });
}

// Keyboard shortcuts — the genre standard: End Turn on E / Enter, dismiss
// overlays on Escape.
window.addEventListener("keydown", (e) => {
  const tag = (e.target as HTMLElement)?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return;

  if (ui.showSummary) {
    if (e.key === "Enter" || e.key === "Escape" || e.key.toLowerCase() === "e") {
      ui.showSummary = false;
      render();
    }
    return;
  }
  if (e.key === "Escape" && ui.selectedCaseId) {
    ui.selectedCaseId = null;
    ui.selectedStaff.clear();
    render();
  } else if (e.key === "Enter" || e.key.toLowerCase() === "e") {
    game = reduce(game, { type: "END_TURN" });
    ui.selectedCaseId = null;
    ui.selectedStaff.clear();
    ui.showSummary = true;
    render();
  }
});

render();
