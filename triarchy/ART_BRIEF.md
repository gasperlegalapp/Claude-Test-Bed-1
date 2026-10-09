# Triarchy — AAA Visual Overhaul Brief

**For:** the model doing the art/UI work (Fable 5.1)
**Prepared by:** Opus 5, after a full codebase survey. Everything below is verified against the actual file — trust it and skip re-discovery.

---

## 1. Mission

Take `index.html` (Triarchy, a 1v1 turn-based strategy duel) from "competent hobby project" to something that **reads as a premium, shipped game**. The gameplay is finished and balance-tested. This is a **look-and-feel job**, plus new *interface* features that raise production value.

The owner's exact words: *"I want to make the game look more like a AAA or better game than what it looks like."* He also said the game is **"not more fun, but more dynamic"** — so presentation, feedback, and juice are where the remaining value is.

---

## 2. Decisions already made (do not re-ask)

| Decision | Answer |
|---|---|
| Art direction | **Premium dark tycoon** — deep charcoal/navy, glass panels, gold/amber accents, crisp typography, subtle glow and depth. Reference feel: Frostpunk, Football Manager, Two Point Hospital. |
| Scope | **Full overhaul including new UI features** — free to restructure layout, information hierarchy, transitions, and add new interface affordances. |
| Tech latitude | **Everything permitted**: web fonts, npm packages, generated image assets, CSS/SVG. (See §6 for a strong recommendation on this.) |
| Engine/balance | **Off limits.** See §4. |

---

## 3. Architecture — read this before editing

**One self-contained file, no build step, no dependencies.** Open `index.html` in a browser and it runs. 1494 lines.

| Region | Lines |
|---|---|
| `<style>` | 7–263 |
| HTML body | 265–433 |
| `<script>` | 434–1492 |

### How the game art actually works
There are **no image assets**. Every visual is either CSS or **inline SVG generated as strings in JS** and injected via `innerHTML`.

- `buildScene()` (720) composes a full battlefield SVG per side → injected into `#you-scene` / `#enemy-scene`.
- Scene canvas is `viewBox="0 0 300 150"`, ground line `GROUND_Y = 92` (const at 578).
- **The enemy scene is mirrored** with `transform="translate(300,0) scale(-1,1)"` (line ~826). Any asymmetric art (text, faces, lighting direction) must be counter-mirrored or it will read backwards on the right-hand board.

### Visual function map
| Function | Line | Draws |
|---|---|---|
| `drawScene(key,p)` | 581 | Entry point + repaint cache (see §4 warning) |
| `buildScene()` | 720 | Castle, gate, battlements, flags, damage cracks, composes all below |
| `troopBody()` | 600 | One soldier's shapes (infantry/archer/knight; armour & weapons scale with research) |
| `troopGlyph()` | 633 | Positions + animates a soldier |
| `skyLayer()` | 640 | Sun, clouds, hill ranges |
| `cloudGlyph()` / `hillRange()` | 655 / 659 | Backdrop pieces |
| `forgeGlyph()` | 672 | Attack-research building (grows per level) |
| `academyGlyph()` | 693 | Defense-research building (grows per level) |
| `smokeGroup()` | 709 | Damage smoke from a battered keep |
| **Battle cinematic** | | |
| `playBattle()` | 1059 | Drives the clash modal + timing |
| `battleStageSVG()` | 1029 | The battle stage (separate canvas, `viewBox="0 0 320 150"`) |
| `miniCastle()` | 1014 | Castle in the battle modal |
| `lineUpBattle()` | 993 | Ranks the two armies for the clash |
| `battleResultText()` | 1049 | Result banner text + win/lose colour |
| **UI** | | |
| `render()` | 830 | **Writes every dynamic value into the DOM.** All text/number/disabled-state updates live here. |
| `log()` | 564 | Battle-log entries |
| `showEnd()` / `showHandoff()` | 1125 / 1147 | Victory-defeat and hotseat pass-the-device modals |

### CSS animation already present (lines ~80–100, ~230–250)
`troopRise`, `baseGrow`, `smokeDrift`, `chargeRight`, `braceLeft`, `battleFall`, `sparkPop`, `keepShake`, `fadeIn`. Replace or extend freely.

---

## 4. Hard constraints — breaking these breaks the game

1. **Do not change `CFG` (line 437) values.** Every number was tuned through thousands of simulated games (economy caps, siege damage 3, siege income cut 25–50%, research cap 5, army cap 15, attack unlock turn 2, boost 1.4×). Changing them silently destroys a balanced meta.

2. **Do not touch game logic.** Specifically: `income`, `atkPower`, `defPower`, `atkVs`, `defVs`, `dominantType`, `canAttack`, `canSiege`, `resolveAttack`, `startTurn`, `endTurn`, `checkEnd`, all `do*` actions, `requestAttack`, `aiTrain`, `aiCanEcon`, `aiDoEcon`, `aiTurn`. Restyle what they *display*, never what they *compute*.

3. **Element IDs are a hard contract.** `render()` and the wiring block (1434+) look up ~50 IDs via `getElementById`. If you restructure the HTML you must keep every ID (or update every reference). **Verify with the check in §7** — it catches this instantly.

4. **⚠ The repaint cache.** `drawScene()` (581) builds a `sig` string (line ~586) of everything visually meaningful and **returns early if `sig` is unchanged**, to avoid killing running animations. **If you make the scene depend on any new state, you must add it to `sig`** or the scene will silently stop updating. This is the single easiest way to introduce a baffling bug.

5. **Mirroring** — see §3.

---

## 5. Art direction spec — "Premium dark tycoon"

Current tokens live at `:root` (line 8). Treat these as a starting point to replace, not preserve.

**Palette direction.** Move from flat navy to a layered, lit environment:
- Base: near-black desaturated blue (`#0a0e17`-ish), with a subtle radial/vignette so the page has a light source.
- Surfaces: 3 elevation tiers, each slightly lighter + a 1px top inner-highlight stroke (the trick that makes panels read as physical).
- Primary accent: **gold/amber** (`#e8b455`/`#ffce5c`) for value, currency, and importance.
- Factions: keep blue (`#3aa6ff`) vs red (`#ff5d5d`) but enrich them — deeper shadow tones, brighter rim highlights.
- Semantic: eco green, research violet, military orange, siege bronze (`#c98b3a`) already exist; keep the *meanings*, upgrade the *tones*.

**Typography** is the cheapest, highest-impact upgrade. Currently system-ui throughout — the biggest single "hobby project" tell.
- A display face for the title/headings with character (regal serif or a strong condensed grotesque).
- A clean UI face for body (Inter / Manrope / Sora).
- **Use tabular figures for all stat numbers** so they don't jitter as they change.

**Materials & depth.** Layered shadows, inner strokes, glass/blur on overlays, a very subtle noise/grain overlay to kill flat-digital banding, and a vignette. Gold foil / embossed treatment for the title.

**Lighting.** Rim-light the active player's panel. Glow on affordable actions, dim the unaffordable. The battlefield should have a consistent sun direction (remember the mirror).

**Motion.** Everything should ease, nothing should snap. Number roll-ups on gold/income, HP bar damage flash + shake, troop muster animations, a proper turn-transition beat, and real weight in the battle cinematic.

---

## 6. Technical recommendation (read before adding dependencies)

You are *permitted* npm packages and image assets. **My strong recommendation: don't need them.**

The file's superpower is that it's **one self-contained HTML file with zero dependencies that runs offline by double-clicking it**. Adding npm packages means introducing a build system (Vite/bundler), which changes how the owner runs and shares the game.

- **Web fonts:** worth it. Prefer embedding as base64 `@font-face` (keeps offline/self-contained) over a CDN link, which breaks on `file://` when offline.
- **Raster assets:** prefer generated inline SVG + CSS. If you must add PNGs, keep them small and optimized — the sibling project in this repo shipped a 1.9 MB PNG, don't repeat that.
- **Libraries:** CSS animations + SVG + `requestAnimationFrame` can deliver everything in §5. Reach for a library only if you hit a real wall.

If you *do* decide a build step is worth it, say so explicitly in your summary so the owner knows how to run it afterwards.

---

## 7. Verification recipe (use this — it's already proven)

```bash
cd /home/user/Claude-Test-Bed-1

# 1. Extract JS, syntax check, and verify every referenced ID exists
python3 -c "
import re
h=open('index.html').read()
js=re.search(r'<script>(.*?)</script>',h,re.S).group(1); open('/tmp/game.js','w').write(js)
ids=set(re.findall(r'id=\"([^\"]+)\"',h)); refs=set(re.findall(r'getElementById\(\"([^\"]+)\"\)',h))
print('MISSING IDS:', sorted(r for r in refs if r not in ids) or 'none')
for t in ['div','button','span']:
    o=len(re.findall(r'<'+t+r'[ >]',h)); c=len(re.findall(r'</'+t+r'>',h))
    print(t,o,c,'OK' if o==c else 'TAG MISMATCH')"
node --check /tmp/game.js && echo SYNTAX_OK
```

```bash
# 2. Real-browser smoke test + screenshot (Playwright is installed globally)
export NODE_PATH=/opt/node22/lib/node_modules
node -e "
const {chromium}=require('playwright');(async()=>{
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const p=await b.newPage(); const errs=[];
p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
await p.goto('file://'+process.cwd()+'/index.html'); await p.waitForTimeout(400);
await p.screenshot({path:'/tmp/shot.png',fullPage:true});
console.log('ERRORS:',errs.length?errs:'NONE'); await b.close();})()"
```
Then `Read /tmp/shot.png` to actually look at your work. **Do this often — iterate visually, don't fly blind.**

Play-test interactions by clicking `#btn-farm`, `#btn-train`, `#btn-attack`, `#btn-siege` and screenshotting the battle modal and victory overlay — those are the highest-drama moments and most worth polishing.

---

## 8. Suggested order of attack (ranked by impact per credit)

Work top-down and **commit after each** — if credits run out, the most valuable work is already banked.

1. **Global chrome** — palette, typography, elevation, grain, vignette, title treatment. Biggest perceived jump for the least risk.
2. **The two battlefield scenes** — richer castles (silhouette, materials, banners), better terrain and sky, atmosphere (depth haze, god rays), improved troop sprites. This is "the game."
3. **The battle cinematic** (`playBattle`) — impact frames, screen shake, dust, weight. Currently the most exciting moment and the most under-served.
4. **Stat panels & HP bars** — animated number roll-ups, damage flashes, segmented/erode HP bars.
5. **Action cards** — affordability states, hover/press feel, clearer cost/benefit hierarchy.
6. **Overlays** — victory/defeat and hotseat handoff deserve a real "moment."
7. **New feedback features** — floating damage numbers, turn-transition beat, tooltips explaining the counter triangle, siege/besieged visual state on the battlefield itself.

---

## 9. Operational warning

**This container has already lost work once.** The repo was re-cloned mid-session and the entire game vanished from the working tree; it was only recoverable because it had been pushed. 

**Commit and push after every meaningful step:**
```bash
git add -A && git commit -m "..." && git push -u origin claude/vigilant-ritchie-w8ottr
```
Branch: `claude/vigilant-ritchie-w8ottr`. Do not work for a long stretch without pushing.

---

## 10. Open choices — you decide, don't block on asking

Defaults if you're unsure: keep the single-file architecture; keep the current screen layout's broad shape (two facing boards, grouped controls, log below) but restyle it completely; keep all existing copy unless it's actively unclear; keep the three grouped control sections (Upgrade / Build & Recruit / Engage) — that grouping was a deliberate, recent usability fix.

Only stop to ask if you want to make a genuinely irreversible product decision (e.g. dropping a game mode or introducing a build system).
