import { createInitialState } from "./engine/state.ts";
import { reduce } from "./engine/reducer.ts";
import type { GameState } from "./engine/types.ts";
import "./styles.css";

let state: GameState = createInitialState(Date.now() >>> 0);

const app = document.querySelector<HTMLDivElement>("#app")!;

function render(): void {
  app.innerHTML = `
    <header class="topbar">
      <h1>FIRM</h1>
      <span class="stat">Week ${state.week}</span>
      <button id="end-turn">End Turn</button>
    </header>
  `;

  app.querySelector<HTMLButtonElement>("#end-turn")!.addEventListener(
    "click",
    () => {
      state = reduce(state, { type: "END_TURN" });
      render();
    },
  );
}

render();
