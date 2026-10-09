#!/usr/bin/env node
"use strict";
// Triarchy balance simulator.
//
// Runs the real game script from index.html headlessly and plays scripted strategies against each other and
// against the built-in AI. Use it before and after any rules or AI change to see whether the meta moved.
//
//   node triarchy/tools/balance-sim.cjs                      all reports, 300 games per matchup, seed 1
//   node triarchy/tools/balance-sim.cjs --games 500 --seed 7
//   node triarchy/tools/balance-sim.cjs --report mirror      one of: mirror, wizard, ai, ai-wizard, all
//   node triarchy/tools/balance-sim.cjs --file other.html
//
// Reading the output:
//   mirror     Four strategies (Greed, Rush, Balanced, Turtle) play each other. A healthy meta has no strategy
//              running away; before the Wizard this read about 48/47/63/42.
//   wizard     A's share of decisive games vs B, without the Wizard -> with it. Shows when the Wizard pays off.
//   ai         How often each scripted strategy beats the AI on Normal and Hard.
//   ai-wizard  How often the AI recruits its Wizard and casts each spell.
// The run fails (exit 1) if any game breaks a rule: negative gold, army/income/research over its cap, or a crash.
const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf("--" + name); return i >= 0 ? args[i + 1] : dflt; };
const FILE = path.resolve(opt("file", path.join(__dirname, "..", "index.html")));
const G = parseInt(opt("games", "300"), 10);
const REPORT = opt("report", "all");

// Seeded RNG shared by the game and the scripted players, so a run is reproducible.
let seed = parseInt(opt("seed", "1"), 10) >>> 0;
function random() {
  seed = (seed + 0x6d2b79f5) >>> 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const SeededMath = Object.create(Math, { random: { value: random } });

// Load the game with a minimal DOM stand-in. Timers queue up and run when drained, so animations finish instantly.
function loadGame() {
  const html = fs.readFileSync(FILE, "utf8");
  const match = html.match(/<script id="game">([\s\S]*?)<\/script>/);
  if (!match) throw new Error('no <script id="game"> found in ' + FILE);
  const store = {};
  const mkEl = () => ({
    style: {}, textContent: "", innerHTML: "", disabled: false, className: "", offsetWidth: 0, firstChild: null,
    classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
      toggle(c, v) { if (v === undefined) v = !this._s.has(c); v ? this._s.add(c) : this._s.delete(c); }, contains(c) { return this._s.has(c); } },
    appendChild(c) { c.parentNode = this; }, removeChild() {}, addEventListener() {}, querySelector() { return null; },
  });
  const document = { getElementById: (id) => store[id] || (store[id] = mkEl()), createElement: mkEl, addEventListener() {}, querySelector: () => null };
  const timers = new Map();
  let tid = 0;
  const setTimeout = (fn) => { timers.set(++tid, fn); return tid; };
  const clearTimeout = (id) => { timers.delete(id); };
  const drain = () => {
    for (let n = 0; timers.size && n < 100000; n++) { const [id, fn] = timers.entries().next().value; timers.delete(id); fn(); }
  };
  const src = match[1] + `
battleFX = false;
__out.api = {
  get you() { return you; }, get enemy() { return enemy; }, get current() { return current; }, get busy() { return busy; },
  get turnNo() { return turnNo; }, set mode(v) { mode = v; }, set diff(v) { difficulty = v; },
  set q(v) { trainQty = v; }, set st(v) { selectedType = v; },
  CFG, TROOPS, COUNTER_OF, income, totalTroops, atkVs, defVs, dominantType, canAttack, canSiege, spellReady,
  playerAction, requestAttack, reset,
  doFarm, doUpgrade, doResearchAtk, doResearchDef, doTrain, doSkip, doSiege, doBoost, doRecruit, doFireball, doWard,
  ready() { document.getElementById("handoff-overlay").classList.remove("show"); busy = false; render(); },
};`;
  const out = {};
  new Function("document", "window", "localStorage", "setTimeout", "clearTimeout", "Math", "__out", src)(
    document, {}, { getItem: () => null, setItem() {} }, setTimeout, clearTimeout, SeededMath, out);
  return { A: out.api, el: document.getElementById, drain };
}

// Scripted strategies. "wiz" says whether the player recruits and casts with the Wizard.
const ARCH = {
  GREED:    { ecoTarget: 15, edge: 1.6,  minDiff: 6, aggro: false, siege: false, defends: true,  tech: true,  pref: "arc" },
  RUSH:     { ecoTarget: 3,  edge: 1.05, minDiff: 2, aggro: true,  siege: true,  defends: false, tech: false, pref: "arc" },
  BALANCED: { ecoTarget: 7,  edge: 1.3,  minDiff: 4, aggro: false, siege: true,  defends: true,  tech: true,  pref: null },
  TURTLE:   { ecoTarget: 6,  edge: 1.7,  minDiff: 7, aggro: false, siege: false, defends: true,  tech: true,  pref: "kni" },
};
const NAMES = Object.keys(ARCH);

function decide(A, me, foe, P) {
  const CFG = A.CFG, T = A.TROOPS, turn = A.turnNo;
  const myA = Math.round(A.atkVs(me, foe) * (foe.ward ? CFG.wardAtkMult : 1));
  const myD = A.defVs(me, foe), foeA = A.atkVs(foe, me), foeD = A.defVs(foe, me);
  const myTot = A.totalTroops(me), foeTot = A.totalTroops(foe);
  const econ = () => me.farms < CFG.farmMax && me.gold >= CFG.farmCost ? "farm"
    : me.farmLevel < CFG.farmLevelMax && me.gold >= CFG.farmUpg(me.farmLevel) ? "upgrade" : null;
  const counter = () => { const d = A.dominantType(foe); return (d && A.COUNTER_OF[d]) || P.pref || "arc"; };
  const casts = P.wiz && me.wizard;

  if (A.canAttack(me)) { const dmg = foeD === 0 ? myA : (myA > foeD ? myA - foeD : 0); if (dmg >= foe.hp && (foeD === 0 || myA > foeD)) return "attack"; }
  if (foe.sieging && A.canAttack(me) && (foeD === 0 ? myA > 0 : (myA > foeD && myA - foeD >= 2))) return "attack";
  if (casts) {
    // Ward only when it blocks something: they're besieging us, or they can afford to overrun us next turn.
    const threat = foeTot > 0 && foeA > myD * 1.15 && foe.gold + A.income(foe) >= CFG.attackCost;
    if (A.spellReady(me, "ward") && me.gold >= CFG.wardCost && (foe.sieging || threat)) return "ward";
    // Fireball only when it changes the fight: our next assault breaks through, or their threat goes away.
    if (A.spellReady(me, "fireball") && turn >= CFG.attackUnlockTurn && me.gold >= CFG.fireballCost && foeTot >= 4) {
      const after = { ...foe, units: {} };
      for (const t of Object.keys(T)) after.units[t] = Math.round(foe.units[t] * CFG.fireballKeep);
      const unlocks = myA <= foeD * P.edge && myA > A.defVs(after, me) * P.edge && me.gold - CFG.fireballCost + A.income(me) >= CFG.attackCost;
      const defuses = foeA > myD && A.atkVs(after, me) <= myD;
      if (unlocks || defuses) return "fireball";
    }
  }
  if (P.siege && A.canSiege(me)) {
    const greedy = foeTot <= CFG.siegeMinArmy && A.income(foe) >= 5, stale = foeD > 0 && myA <= foeD * 1.15;
    if (foe.hp <= CFG.siegeDmg || greedy || (stale && random() < 0.7)) return "siege";
  }
  if (casts && !me.boostUsed && me.gold >= CFG.boostCost && myTot >= 5 && foeD > 0 && myA * CFG.boostMult > foeD * 1.15 && myA <= foeD * P.edge) return "blessing";
  if (A.canAttack(me)) {
    if (foeD === 0) { if (myA > 0 && (P.aggro || myTot >= 4)) return "attack"; }
    else if (myA > foeD * P.edge && myA - foeD >= P.minDiff) return "attack";
  }
  if (P.defends && foeTot > 0 && foeA > myD) {
    if (P.tech && me.atkTech + me.defTech < CFG.techCap && me.gold >= CFG.techCost(me.defTech) && random() < 0.5) return "rdef";
    const dt = P.pref === "kni" ? "kni" : "inf";
    if (myTot < CFG.armyCap && me.gold >= T[dt].cost) return "train:" + dt;
  }
  if (A.income(me) < P.ecoTarget && econ()) return econ();
  if (P.wiz && !me.wizard && me.gold >= CFG.wizardCost && myTot >= 3 && !(foeA > myD && foeTot > 0)) return "recruit";
  if (myTot < CFG.armyCap && me.gold >= T.inf.cost) return "train:" + counter();
  if (P.tech && myTot >= 3 && me.atkTech + me.defTech < CFG.techCap) {
    const c = Math.min(CFG.techCost(me.atkTech), CFG.techCost(me.defTech));
    if (me.gold >= c) return me.atkTech <= me.defTech ? "ratk" : "rdef";
  }
  return econ() || "save";
}

function act(A, d) {
  if (d === "attack") return A.requestAttack();
  if (d.startsWith("train:")) { A.st = d.slice(6); A.q = 99; return A.playerAction(A.doTrain); }
  const map = { farm: A.doFarm, upgrade: A.doUpgrade, ratk: A.doResearchAtk, rdef: A.doResearchDef, siege: A.doSiege,
    save: A.doSkip, recruit: A.doRecruit, fireball: A.doFireball, ward: A.doWard, blessing: A.doBoost };
  A.playerAction(map[d]);
}

const broken = { negativeGold: 0, armyOverCap: 0, incomeOverCap: 0, researchOverCap: 0, crashes: 0, stuck: 0 };
function checkRules(A) {
  for (const p of [A.you, A.enemy]) {
    if (p.gold < 0) broken.negativeGold++;
    if (A.totalTroops(p) > A.CFG.armyCap) broken.armyOverCap++;
    if (A.income(p) > A.CFG.ecoCap) broken.incomeOverCap++;
    if (p.atkTech + p.defTech > A.CFG.techCap) broken.researchOverCap++;
  }
}

// Play one game. PX drives Player 1; PY drives Player 2, or the built-in AI does when PY is null.
// Returns "X" if Player 1 won, "Y" if Player 2 won, or "draw".
function play(g, PX, PY, difficulty) {
  const { A, el, drain } = g;
  A.mode = PY ? "pvp" : "ai";
  if (difficulty) A.diff = difficulty;
  A.reset();
  for (let step = 0; step < 4000; step++) {
    if (el("overlay").classList.contains("show")) return A.enemy.hp <= 0 ? "X" : "Y";
    if (el("handoff-overlay").classList.contains("show")) { A.ready(); continue; }
    if (!A.busy && (PY || A.current === "you")) {
      const me = A.current === "you" ? A.you : A.enemy, foe = me === A.you ? A.enemy : A.you;
      try {
        const before = JSON.stringify([me.gold, me.units, A.turnNo, A.current]);
        act(A, decide(A, me, foe, A.current === "you" ? PX : PY));
        if (!A.busy && JSON.stringify([me.gold, me.units, A.turnNo, A.current]) === before) broken.stuck++;
      } catch (e) {
        if (broken.crashes++ < 3) console.error(e.stack);
        return "draw";
      }
    }
    checkRules(A);
    drain();
  }
  return "draw";
}

const g = loadGame();
const pct = (n, d) => (d ? Math.round(100 * n / d) : 0) + "%";
const strat = (name, wiz) => ({ ...ARCH[name], wiz });
const want = (r) => REPORT === "all" || REPORT === r;
console.log("Triarchy balance sim: " + path.relative(process.cwd(), FILE) + ", " + G + " games per matchup, seed " + opt("seed", "1"));

if (want("mirror")) {
  const rec = {};
  for (const n of NAMES) rec[n] = { w: 0, d: 0, g: 0 };
  for (let i = 0; i < NAMES.length; i++) for (let j = i + 1; j < NAMES.length; j++) for (let k = 0; k < G; k++) {
    const [a, b] = k % 2 === 0 ? [NAMES[i], NAMES[j]] : [NAMES[j], NAMES[i]];
    const r = play(g, strat(a, true), strat(b, true));
    rec[a].g++; rec[b].g++;
    if (r === "draw") { rec[a].d++; rec[b].d++; } else rec[r === "X" ? a : b].w++;
  }
  console.log("\nStrategy vs strategy (win rate, all using the Wizard sensibly)");
  for (const n of NAMES) console.log("  " + n.padEnd(9) + pct(rec[n].w, rec[n].g).padStart(5) + "   draws " + pct(rec[n].d, rec[n].g));
}

if (want("wizard")) {
  // A's share of decisive games against B (B uses the Wizard), with A playing without it -> with it.
  const share = (PA, PB) => {
    let w = 0, l = 0;
    for (let k = 0; k < G; k++) {
      const aFirst = k % 2 === 0, r = aFirst ? play(g, PA, PB) : play(g, PB, PA);
      if (r !== "draw") { if ((r === "X") === aFirst) w++; else l++; }
    }
    return pct(w, w + l);
  };
  console.log("\nWizard value: A's share of decisive games vs B, without the Wizard -> with it");
  for (const a of NAMES) {
    const cells = NAMES.filter((b) => b !== a).map((b) => "vs " + b + " " + share(strat(a, false), strat(b, true)) + " -> " + share(strat(a, true), strat(b, true)));
    console.log("  " + a.padEnd(9) + cells.join("   "));
  }
}

if (want("ai")) {
  console.log("\nScripted player's win rate vs the built-in AI");
  for (const diff of ["normal", "hard"]) {
    const row = NAMES.map((n) => { let w = 0; for (let k = 0; k < G; k++) if (play(g, strat(n, true), null, diff) === "X") w++; return n + " " + pct(w, G); });
    console.log("  " + diff.padEnd(7) + row.join("   "));
  }
}

if (want("ai-wizard")) {
  console.log("\nHow often the AI uses its Wizard (share of games)");
  for (const diff of ["easy", "normal", "hard"]) {
    const c = { recruited: 0, fireball: 0, ward: 0, blessing: 0 };
    let games = 0;
    for (const n of NAMES) for (let k = 0; k < Math.ceil(G / 3); k++) {
      play(g, strat(n, true), null, diff);
      const e = g.A.enemy;
      games++;
      if (e.wizard) c.recruited++;
      if (e.cd.fireball > 0) c.fireball++;
      if (e.cd.ward > 0) c.ward++;
      if (e.boostUsed) c.blessing++;
    }
    console.log("  " + diff.padEnd(7) + "recruits " + pct(c.recruited, games) + "   Fireball " + pct(c.fireball, games) +
      "   Ward " + pct(c.ward, games) + "   Blessing " + pct(c.blessing, games));
  }
}

const problems = Object.entries(broken).filter(([, v]) => v > 0);
console.log("\nRule checks: " + (problems.length ? "FAILED " + JSON.stringify(Object.fromEntries(problems)) : "all passed"));
process.exit(problems.length ? 1 : 0);
