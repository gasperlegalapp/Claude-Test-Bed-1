# CSS WAYFARER — Cargo Command

*A bridge-officer dashboard sim. Command a deep-space cargo hauler under raider
attack: route power, fight fires, and keep crew, passengers and cargo alive.*

You don't fly the ship — you **command** it. The entire game is the information
and the triage: a live HTML/CSS command dashboard driven by a simulation tick.

## The core tension

The reactor can't power everything. Every cell you give to shields is a cell
you take from life support — and:

- **Shields up, life support down** → the hull holds but crew suffocate.
- **Life support up, shields down** → everyone breathes but the hull caves in.
- **Ignore the cargo bays** → fires and breaches destroy your payload and you
  fail the contract even if the ship survives.

So you constantly re-balance the reactor, dispatch repair teams, and spend
emergency actions while raiders keep coming.

## Play

Open `index.html` in any modern browser. No build step, no dependencies.
Click **ASSUME COMMAND**.

- **Power management (right panel):** use `+ / −` on each system
  (Reactor, Shields, Engines, Weapons, Sensors, Life Support, Cargo Bay).
  Watch **Power Reserve** — go negative and you brown out, weakening everything.
- **Ship schematic (center):** click any compartment to dispatch a repair team.
  Rooms show status (normal/damaged/critical), fire, breach, and crew.
- **Emergency Actions:** Prioritize Shields, Emergency Power, Damage Control
  (suppress fires & seal breaches), Evacuate Passengers. Each has a cooldown.
- **Top bar:** pause `❚❚` and fast-forward `▶▶`.

### Win / lose

- **Survive the raid** (~210s) with cargo integrity above **30%** → win.
- **Lose** if hull hits 0%, cargo integrity falls below 30%, or all crew die.

A passive player loses to a cargo-bay fire; an active commander pulls through.

## What each system actually does

| System | Effect | Neglect it and… |
|---|---|---|
| Reactor | Total power budget (overclock = heat) | Everything browns out |
| Shields | Absorb incoming volleys | Hits leak into rooms, start fires |
| Engines | Evade volleys | More hits land |
| Weapons | Destroy raiders | The raid never thins out |
| Sensors | Point defense | Missiles hit harder |
| Life Support | Keeps crew/passengers alive | Casualties, panic, deaths |
| Cargo Bay | Cargo environmental control | Cargo integrity decays |

## Project layout

| File | Purpose |
|---|---|
| `index.html` | Dashboard markup (all panels) + title/result overlays |
| `style.css` | Sci-fi command-deck theme, segmented bars, grid layout |
| `game.js` | State, UI builders, simulation tick, interactions, external-cam canvas |

## Not yet built (deliberately)

- Rendered ship-combat animation. The external cam is lightweight ambiance
  (drifting stars, laser bolts, a hull silhouette) — full battle rendering is a
  later/optional step.
- Multi-leg campaign, sector navigation map, and the trade/economy meta-layer
  seen in the wider concept art.
