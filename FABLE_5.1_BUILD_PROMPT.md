# Build Prompt — “CSS WAYFARER: Hauler Command” (for Fable 5.1)

Copy everything below the line into Fable 5.1 as a single prompt. It is written to
be built in one pass: a complete, self-contained, polished browser game.

---

## ROLE & GOAL

You are building a **AAA-quality spaceship BRIDGE-COMMAND simulator** called
**CSS Wayfarer: Hauler Command**. Build it as a single, self-contained web game
(no backend, no build step) that runs by opening one HTML file, and that saves
progress to `localStorage`. Ship it **finished, tuned, and bug-free**, not a
prototype. Test it yourself in a headless browser before you finish and fix every
runtime error.

This is a **rebuild and major upgrade** of an existing vanilla-JS prototype. You
are free to re-architect from scratch. Keep the good ideas below; raise the
production quality dramatically (graphics, audio, game feel, UX, balance).

## THE FANTASY (the one thing that must come through)

> *“I am the captain of an under-armed independent cargo hauler, 50 seconds from
> safety, pirates on my tail, coolant leaking from the engines, passengers
> panicking, and half a million credits of cargo about to burn. I cannot save
> everything. What do I sacrifice to survive the next 30 seconds?”*

The fun is **command under pressure and competing priorities**, not twitch
combat. Emphasize **being on the bridge, operating stations, and giving orders** —
NOT a third-person dogfighter. The player commands; the ship and crew execute.

## DESIGN PILLARS (non-negotiable)

1. **Command, not micro-twitch.** The player switches between bridge stations and
   makes decisions. No manual aim-and-shoot arcade combat. Combat is a
   **prioritization puzzle** (which threat, which facing, which power tradeoff).
2. **Every system pulls against every other.** Power is finite: more shields
   means slower engines or blind sensors or failing life support. A good crisis
   never has a clean answer. Energy always comes from somewhere.
3. **Timers, targets, consequences, costs.** Every button answers at least one of:
   *What am I saving? What am I sacrificing? How long will it take? What happens if
   I ignore this?* If a control answers none of those, cut it.
4. **Readable escalation.** Interlocking problems that stack and are legible at a
   glance. The drama is the disaster map, not particle effects.
5. **Forgiving by default, deep on demand.** A new player on a calm contract can
   win and feel smart; hard contracts punish bad triage. Provide difficulty
   options and first-time “coach” tips that can be toggled off.

## TECH & STRUCTURE

- **Single deployable web app.** One `index.html` + CSS + JS (you may split files;
  keep it openable locally, no server). Saves to `localStorage`.
- **Rendering:** DOM/CSS for the console/station UI (crisp, data-dense, theme-aware
  dark sci-fi). Use **Canvas2D or WebGL** for the *viewscreens* — the external
  camera and especially the **piloting POV cockpit**. You may load **three.js from
  a CDN** for the POV 3D starfield/cockpit if it improves quality; otherwise a
  well-crafted 2.5D canvas is acceptable. Keep it smooth (target 60fps) and
  performant on a laptop.
- **Art direction:** modern “used-future” naval-sci-fi bridge console — deep navy/
  black, cyan/amber/red status language, glass panels, subtle scanlines/glow,
  crisp monospace numerics. Think FTL + Bridge Crew + Elite Dangerous cockpit UI,
  but 2D-console-first. Ship art can be stylized (clean vector or tasteful
  pixel/16-bit) — pick ONE cohesive style and execute it fully. Everything must be
  legible; never sacrifice readability for effect.
- **Audio:** generative or small embedded SFX + ambient bridge hum, alarm klaxons,
  weapon/shield/impact cues, UI clicks, officer voice “blips”. Include a mute
  toggle. Audio is core to game feel — do not skip it.
- **Quality bar:** no runtime/console errors; responsive layout that never
  horizontally scrolls the body; controls that work with rapid clicking (never
  rebuild interactive DOM every frame — build once, update values in place);
  keyboard shortcuts; a pause and fast-forward control.

## CORE LOOP

**Base (Zhen-9 Station)** → **Outfit ship** (modules, weapons, upgrades, hire crew)
→ **Accept a contract** (route with length + pirate danger + pay) → **Fly the run**
(the live command sim) → **Debrief & get paid** (cargo delivered %, passenger &
crew survival, time, reputation, penalties) → **spend credits, grow, repeat.**
Longer/more dangerous routes pay more. Make the economy meaningful (real choices,
gear you save up for).

## THE BRIDGE — COMMAND STATIONS (tabs + hotkeys F1–F6)

A top tab bar switches stations; hotkeys F1–F6. A persistent top bar shows ship
name, destination/ETA, threat level, alert state, credits/money-at-risk, clock,
pause/fast-forward. A comms ticker + event log run along the bottom.

1. **CAPTAIN (overview / triage).** The “where do I look next” screen. A **living
   ship schematic** (compartments with crew, fire spread, breaches, power outages,
   passenger panic clusters, repair ETAs) + a **CURRENT CRISES stack** (each crisis
   = icon, name, **countdown timer**, target, consequence-if-ignored, and 2–4
   response buttons that deep-link to the relevant station) + a **THREAT TIMELINE**
   (a single row: “8s missile impact · 17s laser volley · 31s engine failure · 52s
   arrive”) + officer status/recommendations. Captain does not do the work; Captain
   decides which fire matters most.
2. **TACTICAL.** Combat as a board, not a shooter. **Individual enemy contacts**
   (type, HP, distance, which facing they’ll hit, a “fires in Xs” timer; click to
   hard-lock). **Targeting controls that stay static on top**: FIRE-AT-WILL
   authorization (default HOLD FIRE), target-priority modes (closest/strongest/
   weakest), plus commands. **Four weapon mounts** (see Weapons). **Four-facing
   shields over four-facing hull plating** with per-axis power allocation (see
   Shields & Hull). The classic dilemma: the missile boat hits cargo in 22s but the
   boarding skiff reaches the passenger deck in 36s and your guns can only kill one
   fast — which matters more?
3. **HELM / PILOTING (active POV cockpit — headline new feature, see below).**
4. **ENGINEERING.** The power heart. **Per-system power routing (+/−)** for reactor,
   shields, engines, weapons, sensors, life support, with live MW and a power
   reserve that browns out when overdrawn. Reactor **heat/stability** (overclock and
   emergency burn raise heat; high heat damages the reactor). Systems status,
   active faults list, and actions: Emergency Power, Damage Control, Vent Heat,
   Dispatch Repair Team, Emergency Bypass/jury-rig. This is where painful
   power-vs-power calls live.
5. **OPERATIONS.** Cargo & people. **Cargo manifest** with per-hold condition and
   **traits** (fragile, refrigerated, volatile, hazardous, high-value, humanitarian,
   corporate-priority) that create decisions. **Passenger decks** (count, panic,
   morale, food/air). **Pod hardpoints**. Commands: seal/lock-down compartments,
   evacuate/calm passengers, jettison a specific hold, prioritize cooling, convert
   a hold to a shelter. A warship game is about winning the fight; a **cargo** game
   is about *arriving with something worth delivering* — lean into that identity.
6. **EXECUTIVE (irreversible captain orders).** The “oh no” screen. A grid of heavy,
   confirmed decisions with explicit consequences: Jettison All Cargo, Seal
   Compartments, Overload Reactor, Broadcast Distress, Change Destination (divert,
   reduced pay), All Power to Shields, Brace for Boarding, Surrender, Abandon Ship,
   Arm Cargo Pods (volatile cargo as mines). Each shows outcome + a confirm gate,
   and where fitting an **officer’s opinion** (“Ops: Pod B is expendable — dump it
   and save the passengers”).

## ★ THE PILOTING POV COCKPIT (build this as a standout feature)

The HELM station is an **active, first-person pilot’s view out the cockpit
canopy**, with a HUD — the player actually flies.

- **View:** a POV out the forward canopy into space: parallax starfield, the
  destination station/waypoint ahead growing closer, drifting debris/asteroids,
  and enemy contacts rendered as ships/blips with lead indicators and range. Use
  3D (three.js) or convincing 2.5D. Cockpit frame/dashboard around the edges.
- **HUD overlays on the glass:** velocity/throttle, heading & a target reticle,
  a **nav bracket to the destination with distance & ETA**, contact markers with
  range and lock brackets, incoming-fire warnings (directional threat arcs tied to
  the 4 shield facings), reactor heat, shield-facing pips, a minimap/radar, and
  master-caution/warning lights.
- **Active piloting (readable, not a sim-cockpit chore):**
  - **Throttle** (keys/slider): speed vs fuel/heat; faster = shorter ETA but hotter
    reactor and jostled cargo.
  - **Evasive maneuvering:** steer/roll (WASD or arrows) to **present a healthy
    shield facing toward incoming fire** and to dodge — this ties piloting directly
    to the shield/hull model. Point your strong side at the threat.
  - **Boost / afterburner** (short window: +evasion & speed, big heat cost).
  - **Line up for jump/arrival**, thread asteroid fields, hold a heading through an
    interdiction zone.
  - **Flight postures** as selectable modes: Steady, Evasive, Silent Running,
    Emergency Burn, Drift/Power-Down — each a real tradeoff (evasion vs repair
    speed vs detection vs heat vs progress).
- **The point:** piloting is a *tension amplifier*, not a dogfight. “Can I hold
  this ship together and keep my good side to the enemy for 50 more seconds until
  we reach the gate?” Keep it approachable: auto-assist toggle so less-confident
  players can set a posture and let the ship mostly fly itself while they command.
- Piloting must integrate with the sim: heading/facing affects which shield takes
  hits; throttle affects ETA/heat; postures affect detection and repair.

## ★ AI / NPC CREW AUTOMATION (build this)

Let the player **delegate** so they can focus on command:

- **AI Repair Crews / Damage-Control AI:** a toggle (global and per-team) that lets
  NPC engineering teams **auto-dispatch to the worst faults** — travel to fires/
  breaches/leaks, repair by priority, then hold station. Show them as crew moving on
  the schematic with ETAs. Player can still override/hand-place.
- **Automation levels** the player sets per station: e.g. Tactical “auto-fire at
  will on closest,” Engineering “auto-balance power,” Ops “auto-calm panic,” Helm
  “auto-evade / hold posture.” Each automation is *competent but not optimal* — good
  enough to survive calm stretches, but a smart human beats it in a crisis. This is
  how the game stays playable across 6 stations solo: **delegate the routine, seize
  the wheel when it matters.**
- Give crews/officers light **personality** (names, a portrait, one-line voice
  reactions and recommendations) so delegation feels like commanding a crew.

## CORE SYSTEMS (keep & polish these mechanics)

- **Finite power / reactor.** Reactor output (upgradable) feeds all systems; going
  over reserve browns everything out. `sysEff = power × room-health × crew-manning ×
  brownout × buffs`. Reactor heat rises with overclock/burn; high heat damages the
  core. Everything meaningful trades against power.
- **Scarce station crew.** You start with ~75% of the hands needed to fully staff
  every station, so you triage. Manning has diminishing returns: 1 person gets a
  system mostly running, a full crew reaches 100%, an empty station limps at ~35%.
  Extra hands fight that room’s fires and speed repairs. Show each system’s live
  **output %** so importance is visible. (This is separate from the repair-tech pool
  and from AI auto-repair.)
- **Directional shields + directional, PERMANENT hull.** Four facings (fore/port/
  stbd/aft). Each facing has a **shield** (regenerates from allocated power; power is
  balanced on two opposite-pair axes — boosting one facing pulls from its opposite)
  over **hull plating that is permanent in flight** (only falls, never regens —
  nobody goes EVA mid-fight). When a facing’s shield drops, hits chew its plate;
  once a plate is breached that side is exposed (amplified internal damage, likely
  breaches/boarders). You harden hull only at base (ship Hull Plating upgrade), and
  separately buy Pod Plating/redundancy for the pods. Piloting lets you keep a
  strong facing to the threat.
- **Weapons: four fixed mounts by TYPE.** Forward (Type 2), Port & Starboard wings
  (Type 3), Dorsal/rear (Type 1). Bigger guns need bigger mounts. Weapon kinds with
  real tradeoffs: **ballistic & missiles = limited rounds; lasers = infinite ammo
  but heavy power; railguns = limited rounds AND huge power.** Energy/rail output
  scales with weapons power (brownouts sputter them). Swap weapons at base (gated by
  mount type). Targeting: fire-at-will authorization, priority modes, hard-lock.
- **Enemy contacts** with stats (type, HP, distance, facing, fire timer, size).
  Threat scales with contract danger and how long the fight drags (a horde builds if
  you can’t thin them). Boarders can come through breaches — repelled by Security.
- **Unpredictable incidents** (the fun engine — see Crisis Design): raider attacks,
  system failures (coolant leaks, power surges), space hazards (debris fields you
  brace for by pumping shields; ion surges that scramble shields/sensors), sabotage
  (a stowaway you find by deducing where damage clusters and sweeping with Security),
  boarders. Show symptoms, not solutions (with an optional coach-tips toggle for
  first-timers).
- **Cargo & passengers as decisions, not readouts.** Cargo traits and per-hold
  condition; passengers panic, riot, need life support; both create sacrifice
  choices. Cargo integrity tracks its hold’s structural health (repairable);
  delivering intact = the payday.
- **Repair model:** internal compartments/pods = repairable in flight (repair-tech
  pool, station crew, jury-rig for fast temp patches, AI auto-repair). External hull
  plating = permanent until base.

## CRISIS DESIGN (make it fun)

Every major threat is an active **crisis card** with: a **timer**, a **target**, a
**consequence if ignored**, and **2–4 counters each with a cost**. Example:

> **INCOMING MISSILE SALVO — impact in 18s** · Target: Cargo Pod B · If ignored:
> cargo damage, possible breach · Counters: **Tactical** point-defense · **Engineering**
> reroute power to shields · **Helm** evasive burn · **Ops** lock down the pod ·
> **Executive** jettison decoy cargo.

Layer independent, interlocking problems so the player is always choosing what to
sacrifice. Add light **command latency** (repair crews must physically arrive;
retargeting/evasive burns take a few seconds to align) so the player must
anticipate — showing “engine failure in 18s / repair ETA 11s / repair time 24s”
tells them it won’t finish in time and forces a workaround. That tension, not
graphics, is the game.

## META PROGRESSION & ECONOMY

- **Modules on hardpoints:** cargo, passenger, military (adds firepower/point-defense
  via turret pods), shield pods. More hardpoints (upgrade) = more capacity but more
  to defend.
- **Weapons** swapped per mount (by type) at base; **limited ammo** — consider an
  ammo resupply cost between runs.
- **Ship upgrades:** reactor cap, hull plating, pod plating/redundancy, shield
  booster, weapon array, engine tuning, more hardpoints.
- **Crew:** hire better crew tiers (faster repair/fighting/piloting/healing);
  optionally hire specialist officers.
- **Contracts:** short/medium/long × calm/risky/hostile, with cargo/passenger
  manifests, time bonuses, reputation with employers, and penalties. Payout reflects
  cargo delivered %, passengers & crew survived, time, reputation, and any executive
  choices (surrender/jettison/divert cut pay). Insurance/illegal-cargo hooks
  optional. Make growth feel earned and the risk/reward of routes real.

## UX, FEEL & ACCESSIBILITY

- Bridge tabs + F1–F6; pause/fast-forward; ESC closes modals. Clear focus/hover
  states, tooltips that state cost/benefit, confirm gates on irreversible orders.
- **Coach tips:** first time each new threat type appears, a short one-time tip
  explains how to respond; a menu toggle turns it off for pure discovery. Remember
  the setting.
- Officer voices/recommendations add drama without heavy art.
- Difficulty options (forgiving → punishing); auto-assist/AI toggles so a solo
  player can run all six stations. Never let the console UI feel like homework —
  it’s a command chair, not a spreadsheet.
- Theme-aware dark UI; audio mute; smooth 60fps; no console errors.

## ACCEPTANCE CRITERIA (verify before finishing)

1. Full loop works: base → outfit → contract → fly → debrief → back to base, saving
   to `localStorage`, with real economic progression.
2. All six stations exist and are **functional** (real controls with real effects,
   nothing decorative), switchable by tab and F1–F6.
3. **Piloting POV cockpit** is real and fun: POV view + HUD, throttle, steer/evade
   to present shield facings, boost, postures, nav-to-destination, and it drives the
   sim (facing→shield hits, throttle→ETA/heat).
4. **AI/NPC automation** works: auto-repair crews and per-station automation toggles
   that keep the ship alive during calm stretches and can be overridden.
5. Combat is a readable prioritization puzzle with individual contacts, 4 weapon
   mounts (typed, ammo/power tradeoffs), directional shields over **permanent**
   directional hull, and targeting controls.
6. Crisis cards with timers/targets/consequences/counters drive the tension; power,
   crew, shields, cargo and passengers all pull against each other.
7. Polished: cohesive art, audio with mute, game feel (impact shake/flash, alarms),
   coach tips, difficulty & assist options, no runtime errors, 60fps.
8. Balanced so a calm contract is winnable by a new player and a hostile one demands
   good triage.

Build it complete, test it, fix every error, and make it genuinely fun.
