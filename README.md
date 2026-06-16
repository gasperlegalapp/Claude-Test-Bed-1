# REROUTE

*A spaceship game about routing power under fire.*

> Eight cells. Four systems. Never enough.

## The hook

Most spaceship games keep mining, combat, and upgrading in separate menus.
REROUTE ties them together with one live decision: your **reactor has a fixed
number of power cells**, shared across four systems. You can only make one
thing strong by starving another — and you redistribute *during* the fight.

- **Shields** — bigger bubble, faster regen.
- **Weapons** — faster fire, more damage. At zero cells your guns are offline.
- **Engines** — thrust and top speed.
- **Mining** — the salvage laser's range and yield.

Want to mine that glowing asteroid? Pour cells into mining — and accept that
your shields and guns just went soft while raiders close in. Incoming missile?
Dump engines into shields *now*. That constant triage is the game.

## Play

Open `index.html` in any modern browser. No build step, no dependencies.

| Input | Action |
|---|---|
| `W` `A` `S` `D` / arrows | Thrust |
| Mouse | Aim |
| Click (hold) | Fire |
| `1` `2` `3` `4` | Add a power cell to a system |
| `Shift` + `1`–`4` | Pull a cell back |
| `Tab` | Dry dock — spend salvage on upgrades (pauses) |

Mining fires automatically when a powered laser has an asteroid in range.
Green asteroids are rich (more minerals). The threat level climbs over time;
survive, bank resources, and upgrade between fights.

## Two currencies, two upgrade trees

The two halves of the loop pay out in different resources, so you can't tunnel
one and ignore the other:

- **Minerals ◇** (from mining) fund **building, moving, harvesting**: Hull
  Plating, Engine Tuning, Mining Optics.
- **Scrap ◆** (from kills) funds **fighting**: Weapon Calibration, Shield
  Emitters.
- **Reactor Capacity** — the meta-pivot that eases the power triage — costs
  *both*, so growing your ship means engaging combat *and* mining.

## Project layout

| File | Purpose |
|---|---|
| `index.html` | Markup + title/dock/game-over overlays |
| `style.css` | HUD and overlay styling |
| `game.js` | Whole game: loop, physics, combat, mining, upgrades, render |

## Where it could go next

- A second currency split (raw minerals vs. combat scrap) so each loop funds
  different upgrade trees.
- Power *presets* you can snap to with a key (combat / mining / flee).
- Persistent wrecks: leave a defeated enemy's hull to salvage for its modules.
- Bosses that force a specific routing puzzle to beat.
