import { createInitialState } from "./engine/state.ts";
import { reduce } from "./engine/reducer.ts";
import type { GameState } from "./engine/types.ts";
import { renderApp, type UiState } from "./ui/render.ts";
import "./styles.css";

function freshUi(): UiState {
  return {
    selectedCaseId: null,
    selectedSlot: null,
    selectedRoomId: null,
    selectedStaff: new Set(),
    showSummary: false,
    showPractices: false,
    showHiring: false,
  };
}

let game: GameState = createInitialState(Date.now() >>> 0);
let ui: UiState = freshUi();

const root = document.querySelector<HTMLDivElement>("#app")!;

function clearSelection(): void {
  ui.selectedCaseId = null;
  ui.selectedSlot = null;
  ui.selectedRoomId = null;
  ui.selectedStaff.clear();
}

function render(): void {
  renderApp(root, game, ui, {
    selectCase(id) {
      const same = ui.selectedCaseId === id;
      clearSelection();
      ui.selectedCaseId = same ? null : id;
      render();
    },
    selectSlot(slot) {
      const same = ui.selectedSlot === slot;
      clearSelection();
      ui.selectedSlot = same ? null : slot;
      render();
    },
    selectRoom(id) {
      const same = ui.selectedRoomId === id;
      clearSelection();
      ui.selectedRoomId = same ? null : id;
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
    assignCase() {
      if (!ui.selectedCaseId || ui.selectedStaff.size === 0) return;
      game = reduce(game, {
        type: "ASSIGN_CASE",
        caseId: ui.selectedCaseId,
        staffIds: [...ui.selectedStaff],
      });
      clearSelection();
      render();
    },
    buildRoom(roomTypeId) {
      if (ui.selectedSlot === null) return;
      game = reduce(game, {
        type: "BUILD_ROOM",
        slot: ui.selectedSlot,
        roomTypeId,
      });
      clearSelection();
      render();
    },
    upgradeBuilding() {
      game = reduce(game, { type: "UPGRADE_BUILDING" });
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
      game = createInitialState(Date.now() >>> 0);
      ui = freshUi();
      render();
    },
  });
}

// Keyboard: End Turn on E / Enter, dismiss overlays on Escape.
window.addEventListener("keydown", (e) => {
  const tag = (e.target as HTMLElement)?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return;
  if (game.status !== "playing") return;

  if (ui.showHiring || ui.showPractices) {
    if (e.key === "Escape") {
      ui.showHiring = false;
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
  if (e.key === "Escape") {
    clearSelection();
    render();
  } else if (e.key === "Enter" || e.key.toLowerCase() === "e") {
    game = reduce(game, { type: "END_TURN" });
    clearSelection();
    ui.showSummary = true;
    render();
  }
});

render();
