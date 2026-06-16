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
- **Ship schematic (center):** click any compartment to open its **inspector**.
  Each compartment is a station you operate:
  - **Assign crew** to its stations (± moves people to/from the idle pool). A
    manned station runs at 100%; an empty one drops to ~50% — so pulling gunners
    over to fight a fire really does weaken your guns.
  - **Reroute power** to that compartment's system right from the inspector.
  - **Functions:** *Dispatch Repair Team*, *Seal Bulkhead* (contains fire/breach
    damage but locks the crew inside), *Vent Atmosphere* (instantly kills a fire
    and auto-evacuates the crew — you lose their manning).
  - Tiles show station pips (manned/empty) and badges for fire/breach/sealed/repair.

### What manning each station does

| Compartment | Station | Manned effect |
|---|---|---|
| Shield Generator | Shield Ops | Shield strength & regen |
| Weapons Deck | Gunnery | Raider kill rate |
| Engines | Thrust Control | Evasion vs incoming fire |
| Sensors Array | Sensor Ops | Point-defense accuracy |
| Reactor | Reactor Control | Safe output & cooling |
| Life Support | Atmospherics | Keeps crew & passengers alive |
| Med Bay | Medical | Heals injured, prevents deaths |
| Bridge | Command | Ship-wide coordination bonus |
| Passenger Deck | Stewards | Calms passenger panic |
| Cargo Bay A/B/C | Cargo Control | Protects that cargo |
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
