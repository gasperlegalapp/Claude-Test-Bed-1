import { createInitialState } from "./engine/state.ts";
import { reduce } from "./engine/reducer.ts";
import type { GameState } from "./engine/types.ts";
import { renderApp, type UiState } from "./ui/render.ts";
import "./styles.css";

function freshUi(): UiState {
  return {
    setupAreas: new Set(),
    selectedMatterId: null,
    selectedFloorId: null,
    selectedStaff: new Set(),
    showSummary: false,
    showHiring: false,
  };
}

let game: GameState = createInitialState(Date.now() >>> 0);
let ui: UiState = freshUi();

const root = document.querySelector<HTMLDivElement>("#app")!;

function clearSelection(): void {
  ui.selectedMatterId = null;
  ui.selectedFloorId = null;
  ui.selectedStaff.clear();
}

function render(): void {
  renderApp(root, game, ui, {
    toggleSetupArea(id) {
      if (ui.setupAreas.has(id)) ui.setupAreas.delete(id);
      else if (ui.setupAreas.size < 2) ui.setupAreas.add(id);
      render();
    },
    startGame() {
      if (ui.setupAreas.size === 0) return;
      game = reduce(game, { type: "START_GAME", areas: [...ui.setupAreas] });
      render();
    },
    selectMatter(id) {
      const same = ui.selectedMatterId === id;
      clearSelection();
      ui.selectedMatterId = same ? null : id;
      render();
    },
    selectFloor(id) {
      const same = ui.selectedFloorId === id;
      clearSelection();
      ui.selectedFloorId = same ? null : id;
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
    buildRoom(floorId) {
      if (!floorId) return;
      game = reduce(game, { type: "BUILD_ROOM", floorId });
      clearSelection();
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

window.addEventListener("keydown", (e) => {
  const tag = (e.target as HTMLElement)?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return;
  if (game.phase !== "playing" || game.status !== "playing") return;

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
  } else if (e.key === "Enter" || e.key.toLowerCase() === "e") {
    game = reduce(game, { type: "END_TURN" });
    clearSelection();
    ui.showSummary = true;
    render();
  }
});

render();
