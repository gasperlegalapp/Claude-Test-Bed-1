import { createInitialState } from "./engine/state.ts";
import { reduce } from "./engine/reducer.ts";
import type { GameState } from "./engine/types.ts";
import { renderApp, type UiState } from "./ui/render.ts";
import "./styles.css";

let game: GameState = createInitialState(Date.now() >>> 0);
let ui: UiState = { selectedStaff: new Set(), showSummary: false };

const root = document.querySelector<HTMLDivElement>("#app")!;

function render(): void {
  renderApp(root, game, ui, {
    toggleStaff(id) {
      if (ui.selectedStaff.has(id)) ui.selectedStaff.delete(id);
      else ui.selectedStaff.add(id);
      render();
    },
    assign(caseId) {
      const staffIds = [...ui.selectedStaff];
      game = reduce(game, { type: "ASSIGN", caseId, staffIds });
      ui.selectedStaff.clear();
      render();
    },
    endTurn() {
      game = reduce(game, { type: "END_TURN" });
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
      ui = { selectedStaff: new Set(), showSummary: false };
      render();
    },
  });
}

render();
