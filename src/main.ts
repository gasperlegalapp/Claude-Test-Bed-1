import { createInitialState } from "./engine/state.ts";
import { reduce } from "./engine/reducer.ts";
import type { GameState } from "./engine/types.ts";
import { renderApp, type UiState } from "./ui/render.ts";
import "./styles.css";

function freshUi(game: GameState): UiState {
  // Start focused on the home district so there's something to do immediately.
  const home = game.districts.find((d) => d.isHome);
  return {
    selectedDistrictId: home ? home.id : null,
    selectedCaseId: null,
    selectedStaff: new Set(),
    showSummary: false,
    showPractices: false,
  };
}

let game: GameState = createInitialState(Date.now() >>> 0);
let ui: UiState = freshUi(game);

const root = document.querySelector<HTMLDivElement>("#app")!;

function render(): void {
  renderApp(root, game, ui, {
    selectDistrict(id) {
      ui.selectedDistrictId = ui.selectedDistrictId === id ? null : id;
      ui.selectedCaseId = null;
      ui.selectedStaff.clear();
      render();
    },
    selectCase(id) {
      ui.selectedCaseId = ui.selectedCaseId === id ? null : id;
      render();
    },
    toggleStaff(id) {
      if (ui.selectedStaff.has(id)) ui.selectedStaff.delete(id);
      else ui.selectedStaff.add(id);
      render();
    },
    assignCase() {
      if (!ui.selectedCaseId || ui.selectedStaff.size === 0) return;
      game = reduce(game, {
        type: "ASSIGN_CASE",
        caseId: ui.selectedCaseId,
        staffIds: [...ui.selectedStaff],
      });
      ui.selectedCaseId = null;
      ui.selectedStaff.clear();
      render();
    },
    scout() {
      if (!ui.selectedDistrictId || ui.selectedStaff.size === 0) return;
      game = reduce(game, {
        type: "SCOUT",
        districtId: ui.selectedDistrictId,
        staffIds: [...ui.selectedStaff],
      });
      ui.selectedStaff.clear();
      render();
    },
    buildOffice() {
      if (!ui.selectedDistrictId || ui.selectedStaff.size === 0) return;
      game = reduce(game, {
        type: "BUILD_OFFICE",
        districtId: ui.selectedDistrictId,
        staffIds: [...ui.selectedStaff],
      });
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
    openPractices() {
      ui.showPractices = true;
      render();
    },
    closePractices() {
      ui.showPractices = false;
      render();
    },
    unlockPractice(id) {
      game = reduce(game, { type: "UNLOCK_PRACTICE", practiceId: id });
      render();
    },
    closeSummary() {
      ui.showSummary = false;
      render();
    },
    newGame() {
      game = createInitialState(Date.now() >>> 0);
      ui = freshUi(game);
      render();
    },
  });
}

// Keyboard shortcuts: End Turn on E / Enter, dismiss overlays on Escape.
window.addEventListener("keydown", (e) => {
  const tag = (e.target as HTMLElement)?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return;
  if (game.status !== "playing") return;

  if (ui.showPractices) {
    if (e.key === "Escape") {
      ui.showPractices = false;
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
  if (e.key === "Escape" && ui.selectedCaseId) {
    ui.selectedCaseId = null;
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
