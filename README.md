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
- **Ignore the cargo holds** → fires and breaches eat into their structure and
  your payload degrades with them; repair the holds to bring the cargo back.

So you constantly re-balance the reactor, dispatch repair teams, and spend
emergency actions while raiders keep coming.

## The loop

It's a roguelite-ish hauler operation that persists between runs
(saved to `localStorage`):

1. **HOME BASE** — your ship (a modular hauler: engine cluster, spine, command
   module, and pods on hardpoints), credits, crew rating, and the run you've
   lined up. The ship preview reflects your actual loadout.
2. **CONTRACTS** — pick a route. Short/medium/long hauls with CALM/RISKY/HOSTILE
   pirate danger; longer and more dangerous pays more.
3. **OUTFIT** — bolt modules onto your hardpoints: **cargo**, **passenger**,
   **military** (+weapons/point-defense), **shield** pods. You can only install
   what you own; more hardpoints = more capacity but more to defend.
4. **SHIPYARD** — spend credits: buy modules, upgrade the ship (hardpoints,
   reactor, hull, shields, weapons, engines), and hire better crew.
5. **LAUNCH** — fly the run (the command sim below). Your loadout sets the cargo,
   passengers and combat bonuses; the contract sets the length and danger.
6. **DEBRIEF** — get paid for the contract fee, cargo delivered, and surviving
   passengers (minus crew losses), then return to base to grow your operation.

## Play

Open `index.html` in any modern browser. No build step, no dependencies.

- **Power management (right panel):** use `+ / −` on each system
  (Reactor, Shields, Engines, Weapons, Sensors, Life Support).
  Watch **Power Reserve** — go negative and you brown out, weakening everything.
- **Ship schematic (center):** click any compartment to open its **inspector**.
  Each compartment is a station you operate:
  - **Assign crew** to its stations (± moves people to/from the idle pool).
    **Crew is scarce** — you start with only ~75% of the hands needed to fully
    staff every station, so you must pick what runs at full power. Manning has
    diminishing returns: one person gets a system *mostly* going, a full crew
    takes it to 100%, and an empty station limps along at ~35%. Extra hands also
    fight that room's fires, self-patch light damage, and speed repairs. The
    inspector shows each system's live **output %** (manning × power × damage),
    so you can see which compartments are carrying the ship — and which you've
    starved.
  - **Reroute power** to that compartment's system right from the inspector.
  - **Repair crew:** a shared pool of repair technicians. Assign techs to a
    compartment (− / +); they go **EN ROUTE** (travel time), then **REPAIRING**
    (more techs = faster), then **ON STATION** when fully repaired (and they
    stay, auto-working if it takes new damage). **Release** them back to the pool.
    **Jury-rig** is a fast temporary patch that buys time until the crew finishes.
  - **Security detail:** a separate pool. Send security to **sweep a compartment**
    for a saboteur, or to **repel boarders** if raiders breach the hull.
  - **Functions:** *Seal Bulkhead* (contains fire/breach damage but locks the
    crew inside) and *Vent Atmosphere* (instantly kills a fire and
    auto-evacuates the crew — you lose their manning).

## What can go wrong (the fun part)

The voyage is never quiet for long. Trouble strikes unpredictably — even with no
raiders in sight — and the game **never tells you the fix**: you read the
symptoms and work it out.

- **Raider attacks** — pirates/aliens; absorb with shields, thin them with
  weapons, evade with engines.
- **System failures** — coolant leaks and power surges that bleed a system's
  integrity. Repair crew seal them; jury-rig buys time.
- **Space hazards** — debris fields (brace by pumping shields before impact) and
  ion surges (scramble shields/sensors until they pass).
- **Sabotage** — a stowaway tampers with systems from a hidden compartment.
  The tampering clusters near them — deduce where and send security to sweep.
- **Boarders** — a breach under heavy fire can let hostiles aboard; security
  clears the deck.

The same small toolkit solves all of it: route power, dispatch repair crew,
sweep with security, seal/vent, jury-rig, and the emergency actions.

**Coach tips** (toggle in the main menu, on by default): the first time each new
kind of threat appears in a run, a short tip explains how to respond. Turn it off
for the pure figure-it-out experience. The setting is remembered between runs.
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
- **Pod hardpoints (strip below the deck grid):** one clickable section per
  hardpoint, sized by pod type and matching what's bolted to the ship —
  **cargo pods** (house freight; repair the pod to protect its cargo),
  **turret pods** (military → firepower, gated on the pod's condition),
  **shield pods** (aux shields, likewise), **passenger pods** (berths), or
  empty mounts shown as **NOT IN USE**. Damaged pods are repaired like any
  compartment.
- **Emergency Actions:** Prioritize Shields, Emergency Power, Damage Control
  (suppress fires & seal breaches), Evacuate Passengers. Each has a cooldown.
- **Top bar:** pause `❚❚` and fast-forward `▶▶`.

### Win / lose

- **Survive the run** (~240s) with cargo integrity above **30%** → win.
- **Lose** if hull hits 0%, cargo integrity falls below 30%, or all crew die.

### Threat (0 → 5)

The run **starts calm** — no contacts during the opening minute, so you can set
up power and crew. Then raiders arrive in batches. **Threat level tracks how many
raiders are alive**: clear each batch quickly and it stays low; let them pile up
(or get overwhelmed as batches grow bigger and more frequent later in the run)
and it climbs toward **5 — endless horde**. It eases back down when you clear the
sky. Keeping threat low is itself the moment-to-moment game.

## What each system actually does

| System | Effect | Neglect it and… |
|---|---|---|
| Reactor | Total power budget (overclock = heat) | Everything browns out |
| Shields | Absorb incoming volleys | Hits leak into rooms, start fires |
| Engines | Evade volleys | More hits land |
| Weapons | Destroy raiders | The raid never thins out |
| Sensors | Point defense | Missiles hit harder |
| Life Support | Keeps crew/passengers alive | Casualties, panic, deaths |

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
