/*
 * CSS WAYFARER — Cargo Command
 *
 * A bridge-officer dashboard sim. You don't fly the ship; you command it under
 * fire: route a finite reactor budget across systems, fight off raiders, fight
 * fires and breaches, and keep crew, passengers and cargo alive. The whole game
 * is the information and the triage — built as a live HTML/CSS dashboard driven
 * by a simulation tick. (No rendered ship battle; the external cam is ambiance.)
 */
(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const rand = (a, b) => a + Math.random() * (b - a);
  const chance = p => Math.random() < p;
  const pick = arr => arr[(Math.random() * arr.length) | 0];
  const fmt = n => Math.round(n).toLocaleString('en-US');
  const TAU = Math.PI * 2;

  // ---------------------------------------------------------------- config
  const INTRO = 22;                 // calm sim-seconds before the first contact
  const CARGO_FAIL = 30;            // lose if cargo integrity drops below this
  const SEGMENTS = 14;              // segments per bar
  const TOTAL_TECHS = 6;            // pool of reassignable repair technicians
  const TRAVEL_TIME = 4;            // sim-seconds for techs to reach a compartment
  const THREAT_LABEL = ['STANDBY', 'LOW', 'GUARDED', 'ELEVATED', 'SEVERE', 'HORDE'];

  // power systems (reactor is the generator; the rest draw from it)
  const SYS_DEFS = [
    { key: 'reactor', label: 'REACTOR',      icon: '⚛', base: 0,  power: 120, min: 60, max: 153 },
    { key: 'shields', label: 'SHIELDS',      icon: '⛨', base: 30, power: 145, min: 0,  max: 150 },
    { key: 'engines', label: 'ENGINES',      icon: '⏚', base: 21, power: 110, min: 0,  max: 150 },
    { key: 'weapons', label: 'WEAPONS',      icon: '⚔', base: 17, power: 95,  min: 0,  max: 150 },
    { key: 'sensors', label: 'SENSORS',      icon: '◉', base: 11, power: 85,  min: 0,  max: 150 },
    { key: 'life',    label: 'LIFE SUPPORT', icon: '❂', base: 14, power: 100, min: 0,  max: 150 },
    { key: 'cargo',   label: 'CARGO BAY',    icon: '▤', base: 10, power: 70,  min: 0,  max: 150 },
  ];

  // ship compartments on a 6x3 deck grid. Each has crew stations that, when
  // manned, boost that compartment's function — pull crew away and it sags.
  const ROOM_DEFS = [
    { key: 'engines',  label: 'ENGINES',          gc: '1',     gr: '1 / 4', sys: 'engines', stations: 2, fn: 'THRUST CONTROL', fdesc: 'evasion vs incoming fire' },
    { key: 'reactor',  label: 'REACTOR',          gc: '2',     gr: '1 / 3', sys: 'reactor', stations: 2, fn: 'REACTOR CONTROL', fdesc: 'safe output & cooling' },
    { key: 'life',     label: 'LIFE SUPPORT',     gc: '3',     gr: '1',     sys: 'life',    stations: 2, fn: 'ATMOSPHERICS',    fdesc: 'keeps crew & passengers alive' },
    { key: 'pax',      label: 'PASSENGER DECK',   gc: '4 / 6', gr: '1',     sys: null,      stations: 2, fn: 'STEWARDS',       fdesc: 'calms passenger panic', pax: true },
    { key: 'bridge',   label: 'BRIDGE',           gc: '6',     gr: '1 / 3', sys: null,      stations: 3, fn: 'COMMAND',        fdesc: 'ship-wide coordination bonus' },
    { key: 'cargoA',   label: 'CARGO BAY A',      gc: '3',     gr: '2',     sys: null,      stations: 1, fn: 'CARGO CONTROL',  fdesc: 'protects the cargo hold', cargoBay: true },
    { key: 'cargoB',   label: 'CARGO BAY B',      gc: '4',     gr: '2',     sys: null,      stations: 1, fn: 'CARGO CONTROL',  fdesc: 'protects the cargo hold', cargoBay: true },
    { key: 'cargoC',   label: 'CARGO BAY C',      gc: '5',     gr: '2',     sys: null,      stations: 1, fn: 'CARGO CONTROL',  fdesc: 'protects the cargo hold', cargoBay: true },
    { key: 'weapons',  label: 'WEAPONS DECK',     gc: '2',     gr: '3',     sys: 'weapons', stations: 2, fn: 'GUNNERY',        fdesc: 'raider kill rate' },
    { key: 'shieldgen',label: 'SHIELD GENERATOR', gc: '3 / 5', gr: '3',     sys: 'shields', stations: 2, fn: 'SHIELD OPS',     fdesc: 'shield strength & regen' },
    { key: 'sensors',  label: 'SENSORS ARRAY',    gc: '5',     gr: '3',     sys: 'sensors', stations: 1, fn: 'SENSOR OPS',     fdesc: 'point-defense accuracy' },
    { key: 'medbay',   label: 'MED BAY',          gc: '6',     gr: '3',     sys: null,      stations: 2, fn: 'MEDICAL',        fdesc: 'heals injured, prevents deaths', med: true },
  ];

  const DEPT_DEFS = [
    { key: 'engineering', name: 'ENGINEERING', role: 'CHIEF ENGINEER',        max: 6, init: 'TM' },
    { key: 'tactical',    name: 'TACTICAL',    role: 'TACTICAL OFFICER',      max: 4, init: 'RV' },
    { key: 'operations',  name: 'OPERATIONS',  role: 'OPERATIONS OFFICER',    max: 4, init: 'JH' },
    { key: 'medical',     name: 'MEDICAL',     role: 'CHIEF MEDICAL OFFICER', max: 3, init: 'LN' },
    { key: 'science',     name: 'SCIENCE',     role: 'CHIEF SCIENTIST',       max: 3, init: 'AP' },
  ];

  const CARGO_DEFS = [
    { ico: '◈', name: 'LUXURY GOODS',     value: 587650 },
    { ico: '⚙', name: 'INDUSTRIAL PARTS', value: 498200 },
    { ico: '✚', name: 'MEDICAL SUPPLIES', value: 321000 },
    { ico: '◆', name: 'RARE ORE',         value: 238600 },
    { ico: '▢', name: 'HIGH-TECH DEVICES',value: 178000 },
  ];

  const ACTION_DEFS = [
    { key: 'shields',  ico: '⛨', name: 'PRIORITIZE SHIELDS', sub: '+25% shields for 30s', cd: 45 },
    { key: 'power',    ico: '⚡', name: 'EMERGENCY POWER',    sub: 'Max power to critical systems', cd: 60, hot: true },
    { key: 'damage',   ico: '🛠', name: 'DAMAGE CONTROL',     sub: 'Seal breaches & suppress fires', cd: 40 },
    { key: 'evac',     ico: '🏃', name: 'EVACUATE PASSENGERS',sub: 'Move passengers to safe zones', cd: 30 },
    { key: 'abandon',  ico: '🔒', name: 'ABANDON SHIP',       sub: 'Not available', cd: 0, disabled: true },
  ];

  const REPAIR_NAMES = ['ALPHA TEAM', 'BRAVO TEAM', 'CHARLIE TEAM'];

  // ================================================================ META LAYER
  // Modules you bolt onto the ship's hardpoints. Each shapes the run.
  const MODULES = {
    cargo:     { key: 'cargo',     name: 'CARGO POD',     ico: '▦', color: '#b07a3a', cost: 8000,  value: 150000, desc: 'Bulk freight. Pays on delivery — but it burns.' },
    passenger: { key: 'passenger', name: 'PASSENGER POD', ico: '☻', color: '#3fa7ff', cost: 13000, pax: 12,       desc: '12 fare-paying souls. They panic, and they die.' },
    military:  { key: 'military',  name: 'MILITARY POD',  ico: '⚔', color: '#c0563a', cost: 16000, value: 70000, weapon: 0.14, pdef: 0.06, desc: 'Troops & guns. +weapons, +point defense.' },
    shield:    { key: 'shield',    name: 'SHIELD POD',    ico: '⛨', color: '#4fb0ff', cost: 15000, shield: 0.22,  desc: 'Aux emitters. +shield strength & regen.' },
  };
  const MODULE_ORDER = ['cargo', 'passenger', 'military', 'shield'];

  const UPGRADE_DEFS = [
    { key: 'hardpoint', name: 'Hardpoint Mount', ico: '⊞', desc: '+1 module slot', max: 4, cost: l => 22000 + l * 16000 },
    { key: 'reactor',   name: 'Reactor Core',    ico: '⚛', desc: '+12 MW reactor cap', max: 5, cost: l => 12000 + l * 10000 },
    { key: 'hull',      name: 'Reinforced Hull', ico: '⛨', desc: '-12% hull damage taken', max: 5, cost: l => 10000 + l * 9000 },
    { key: 'shield',    name: 'Shield Booster',  ico: '◈', desc: '+12% shield strength', max: 5, cost: l => 11000 + l * 9000 },
    { key: 'weapon',    name: 'Weapon Array',    ico: '⚔', desc: '+12% weapon power', max: 5, cost: l => 11000 + l * 9000 },
    { key: 'engine',    name: 'Engine Tuning',   ico: '⏚', desc: '+12% thrust & evasion', max: 5, cost: l => 9000 + l * 8000 },
  ];
  const CREW_TIERS = ['GREEN', 'STEADY', 'SEASONED', 'VETERAN', 'ELITE'];
  const crewCost = tier => 14000 + tier * 14000;       // cost to reach next tier
  const DEST_NAMES = ['Relay 7', 'Gateway Station', 'Kessler Reach', 'Tannhäuser Yards', 'Cygnus Depot', 'Bao Verge'];

  const SAVE_KEY = 'wayfarer_save_v2';
  function defaultMeta() {
    return {
      credits: 45000,
      upgrades: { hardpoint: 0, reactor: 0, hull: 0, shield: 0, weapon: 0, engine: 0 },
      crewTier: 0,
      inventory: { cargo: 3, passenger: 1, military: 1, shield: 0 },
      loadout: ['cargo', 'cargo', 'passenger', 'military', null, null],
      contractId: null, contracts: null,
      seenIntro: false,
      stats: { runs: 0, wins: 0, earned: 0 },
    };
  }
  let META = defaultMeta();
  function hardpoints() { return 6 + META.upgrades.hardpoint; }
  function loadMeta() {
    try {
      const raw = window.localStorage && localStorage.getItem(SAVE_KEY);
      if (raw) { META = Object.assign(defaultMeta(), JSON.parse(raw)); }
    } catch (e) { /* fresh start */ }
    normalizeMeta();
  }
  function saveMeta() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(META)); } catch (e) { /* ignore */ }
  }
  function normalizeMeta() {
    const hp = hardpoints();
    if (!Array.isArray(META.loadout)) { META.loadout = []; }
    while (META.loadout.length < hp) { META.loadout.push(null); }
    META.loadout.length = hp;
    // can't have more installed than owned
    const need = {};
    META.loadout = META.loadout.map(m => {
      if (!m) { return null; }
      need[m] = (need[m] || 0) + 1;
      if (need[m] > (META.inventory[m] || 0)) { need[m]--; return null; }
      return m;
    });
  }
  function loadoutCounts() {
    const c = { cargo: 0, passenger: 0, military: 0, shield: 0 };
    META.loadout.forEach(m => { if (m) { c[m]++; } });
    return c;
  }
  function installedCount(type) { return META.loadout.filter(m => m === type).length; }
  function currentContract() { return (META.contracts || []).find(c => c.id === META.contractId) || null; }

  function genContracts() {
    const tiers = [
      { dist: 'SHORT',  duration: 110, danger: 1 },
      { dist: 'MEDIUM', duration: 180, danger: 2 },
      { dist: 'LONG',   duration: 260, danger: 3 },
    ];
    // shuffle danger a little so it isn't always dist==danger
    META.contracts = tiers.map((t, i) => {
      const danger = clamp(t.danger + (chance(0.4) ? pick([-1, 1]) : 0), 1, 3);
      const dest = pick(DEST_NAMES);
      const reward = Math.round((t.duration * (4 + danger * 4)) / 10) * 100 + danger * 6000;
      return {
        id: 'c' + Date.now() + '_' + i, from: 'ZHEN-9', to: dest,
        dist: t.dist, duration: t.duration, danger, reward,
      };
    });
    META.contractId = null;
  }

  const DANGER_LABEL = { 1: 'CALM', 2: 'RISKY', 3: 'HOSTILE' };

  // ---------------------------------------------------------------- state
  let S = null;
  let screen = 'intro';
  function newState(cfg) {
    cfg = cfg || {};
    const bonus = cfg.bonus || { weapon: 1, shield: 1, engine: 1, hull: 1, pdef: 0, reactorCap: 153 };
    const crewBonus = cfg.crewBonus || 0; // extra crew per department from tier
    const sys = {};
    SYS_DEFS.forEach(d => { sys[d.key] = { ...d, power: d.power, max: d.key === 'reactor' ? bonus.reactorCap : d.max }; });
    const rooms = ROOM_DEFS.map(d => ({
      ...d, status: 'normal', health: 100, fire: false, breach: false, sealed: false,
      crew: d.stations, crewMax: d.stations,
      repairTechs: 0, repairState: 'idle', repairEta: 0, // idle | enroute | working
    }));
    const depts = {};
    DEPT_DEFS.forEach(d => { depts[d.key] = { ...d, count: Math.min(d.max, d.max + crewBonus), health: rand(88, 100), morale: rand(78, 96) }; });
    const cargo = (cfg.cargo || []).map(c => ({ ...c, integrity: 100 }));
    const paxCount = cfg.paxCount || 0;

    return {
      running: true, speed: 1, over: false,
      t: 0, clock: 22 * 3600 + 41 * 60 + 7, cycle: 1467.11,
      credits: META.credits,
      sys, rooms, depts, cargo,
      duration: cfg.duration || 200,
      danger: cfg.danger || 1,
      bonus, crewSkill: cfg.crewSkill || 1, contract: cfg.contract || null,
      cargoValue: cargo.reduce((a, c) => a + c.value, 0),
      milPods: cfg.milPods || 0,
      hull: 100,
      shieldPool: 0,
      pressure: 0,
      threat: 0,
      attackers: 0,
      reserve: 0, brownout: false,
      captain: { name: 'LT. K. DRAVEN', role: 'CAPTAIN', health: 100, morale: 'High' },
      crewIdle: 3, openRoom: null,
      repairPool: TOTAL_TECHS,
      killed: 0, injured: 0, missing: 0,
      pax: Array.from({ length: paxCount }, () => 'safe'),
      paxMorale: 92,
      actions: {}, buffs: {},
      events: [], comms: [],
      combatTimer: 0, hazardTimer: 0, killProg: 0, batchTimer: INTRO + rand(3, 6),
      _commsScroll: 0,
    };
  }

  // ---------------------------------------------------------------- refs
  const R = {}; // cached element references built once

  function seg(n, cls) {
    const el = document.createElement('div');
    el.className = 'seg' + (cls ? ' ' + cls : '');
    for (let i = 0; i < n; i++) { el.appendChild(document.createElement('i')); }
    return el;
  }
  // turn an existing element (already in the HTML with the right class) into a segmented bar
  function fillSeg(el, n, baseCls) {
    el.innerHTML = '';
    if (baseCls) { el.className = 'seg ' + baseCls; }
    for (let i = 0; i < n; i++) { el.appendChild(document.createElement('i')); }
    return el;
  }
  function setSeg(el, frac, colorClass) {
    if (!el) { return; }
    if (colorClass !== undefined) { el.className = 'seg' + (colorClass ? ' ' + colorClass : ''); }
    const on = Math.round(clamp(frac, 0, 1) * el.children.length);
    for (let i = 0; i < el.children.length; i++) {
      el.children[i].classList.toggle('on', i < on);
    }
  }
  const colorFor = pct => (pct >= 66 ? '' : pct >= 33 ? 'amber' : 'red');
  function techIcons(n) { let s = '<span class="techicons">'; for (let i = 0; i < n; i++) { s += '<i class="techic">⛏</i>'; } return s + '</span>'; }

  // (re)build the cargo manifest + passenger grid to match the current mission
  function buildCargo() {
    R.cargo = [];
    const cl = $('cargoList'); cl.innerHTML = '';
    S.cargo.forEach(c => {
      const row = document.createElement('div'); row.className = 'cargo-item';
      row.innerHTML =
        '<span class="cargo-ico">' + c.ico + '</span>' +
        '<span class="cargo-nm">' + c.name + '</span>' +
        '<span class="cargo-pct"></span>' +
        '<span class="cargo-val">' + fmt(c.value) + '</span>';
      cl.appendChild(row);
      R.cargo.push({ row, pct: row.querySelector('.cargo-pct') });
    });
    if (!S.cargo.length) { cl.innerHTML = '<div class="cargo-item"><span class="cargo-nm" style="color:var(--ink-faint)">No cargo pods installed</span></div>'; }
    const pods = S.cargo.length;
    setSeg(R.cargoSpaceBar, pods / hardpoints(), '');
    $('cargoSpaceTxt').textContent = pods + ' / ' + hardpoints() + ' pods';
    $('cargoValue').textContent = fmt(S.cargoValue) + ' CR';
  }
  function buildPax() {
    R.pax = [];
    R.paxGrid.innerHTML = '';
    S.pax.forEach(() => {
      const sp = document.createElement('span'); sp.className = 'pax'; sp.textContent = '☻';
      R.paxGrid.appendChild(sp); R.pax.push(sp);
    });
    if (!S.pax.length) { R.paxGrid.innerHTML = '<span style="color:var(--ink-faint);font-size:11px">No passenger pods installed</span>'; }
  }

  // ---------------------------------------------------------------- build UI
  function buildUI() {
    // captain
    R.captain = $('captainCard');
    R.captain.innerHTML =
      '<div class="avatar">KD</div><div class="cap-info">' +
      '<div class="cap-name">' + S.captain.name + '</div>' +
      '<div class="cap-role">' + S.captain.role + '</div>' +
      '<div class="kv"><span>HEALTH</span><b id="capHp"></b></div>' +
      '<div class="kv"><span>MORALE</span><b id="capMr"></b></div></div>';
    R.capHp = $('capHp'); R.capMr = $('capMr');

    // departments
    R.depts = {};
    const dl = $('deptList');
    DEPT_DEFS.forEach(d => {
      const row = document.createElement('div'); row.className = 'dept';
      row.innerHTML =
        '<div class="avatar">' + d.init + '</div><div class="dept-main">' +
        '<div class="dept-name"><span>' + d.name + '</span><span class="pct"></span></div>' +
        '<div class="dept-role">' + d.role + '</div></div>';
      const bar = seg(8); row.querySelector('.dept-main').appendChild(bar);
      dl.appendChild(row);
      R.depts[d.key] = { pct: row.querySelector('.pct'), bar };
    });

    // repair crew panel (dynamic) + release delegation
    R.repairBody = $('repairBody');
    R.repairBody.addEventListener('click', e => {
      const b = e.target.closest('[data-release]');
      if (b) { releaseRoom(b.getAttribute('data-release')); }
    });

    // casualties
    $('casualties').innerHTML =
      '<div class="cas killed"><div class="n" id="casK">0</div><div class="l">KILLED</div></div>' +
      '<div class="cas injured"><div class="n" id="casI">0</div><div class="l">INJURED</div></div>' +
      '<div class="cas missing"><div class="n" id="casM">0</div><div class="l">MISSING</div></div>';
    R.casK = $('casK'); R.casI = $('casI'); R.casM = $('casM');

    // cargo manifest (rebuilt per mission from the loadout)
    R.cargoSpaceBar = fillSeg($('cargoSpaceBar'), SEGMENTS, '');
    buildCargo();

    // schematic rooms
    R.rooms = {};
    const sc = $('schematic');
    S.rooms.forEach(rm => {
      const el = document.createElement('div');
      el.className = 'room ' + rm.status;
      el.style.gridColumn = rm.gc; el.style.gridRow = rm.gr;
      el.innerHTML =
        '<div><div class="room-name">' + rm.label + '</div>' +
        '<div class="room-stat"></div></div>' +
        '<div class="crewdots"></div><div class="badge"></div>';
      el.addEventListener('click', () => openRoom(rm.key));
      sc.appendChild(el);
      R.rooms[rm.key] = { el, stat: el.querySelector('.room-stat'),
        dots: el.querySelector('.crewdots'), badge: el.querySelector('.badge') };
    });
    R.hullBar = fillSeg($('hullBar'), 20, 'hull');

    // passengers (rebuilt per mission)
    R.paxGrid = $('paxGrid');
    buildPax();
    R.paxMoraleBar = fillSeg($('paxMoraleBar'), SEGMENTS, '');

    // power systems
    R.sys = {};
    const pl = $('powerList');
    SYS_DEFS.forEach(d => {
      const row = document.createElement('div'); row.className = 'pwr';
      row.innerHTML =
        '<span class="pwr-ico">' + d.icon + '</span><div class="pwr-main">' +
        '<div class="pwr-top"><span class="pwr-name">' + d.label + '</span>' +
        '<span class="pwr-pct"></span></div>' +
        '<div class="pwr-ctl"></div></div>';
      const ctl = row.querySelector('.pwr-ctl');
      const bar = seg(SEGMENTS);
      const minus = document.createElement('button'); minus.className = 'pbtn'; minus.textContent = '−';
      const plus = document.createElement('button'); plus.className = 'pbtn'; plus.textContent = '+';
      const net = document.createElement('span'); net.className = 'pwr-net';
      const step = d.key === 'reactor' ? 3 : 5;
      minus.onclick = () => adjustPower(d.key, -step);
      plus.onclick = () => adjustPower(d.key, +step);
      const btns = document.createElement('span'); btns.className = 'pwr-btns';
      btns.append(minus, plus);
      ctl.append(bar, net, btns);
      pl.appendChild(row);
      R.sys[d.key] = { pct: row.querySelector('.pwr-pct'), bar, net };
    });
    R.reserveBar = fillSeg($('reserveBar'), SEGMENTS, 'reserve');

    // emergency actions
    R.actions = {};
    const al = $('actionList');
    ACTION_DEFS.forEach(a => {
      const btn = document.createElement('button');
      btn.className = 'act' + (a.hot ? ' hot' : '') + (a.disabled ? ' disabled' : '');
      btn.innerHTML = '<span class="act-ico">' + a.ico + '</span><b>' + a.name + '</b>' +
        '<span class="act-sub">' + a.sub + '</span>';
      if (!a.disabled) { btn.onclick = () => triggerAction(a.key); }
      al.appendChild(btn);
      R.actions[a.key] = btn;
    });

    R.eventLog = $('eventLog');
    R.commsTrack = $('commsTrack');

    // external cam
    R.ext = $('extCanvas');
    R.extCtx = R.ext.getContext ? R.ext.getContext('2d') : null;
    initStars();

    // top controls
    $('btnPause').onclick = togglePause;
    $('btnFast').onclick = toggleFast;

    // room inspector: one delegated handler (innerHTML is rebuilt each frame)
    const modal = $('roomModal');
    modal.addEventListener('click', e => {
      if (e.target === modal) { closeRoom(); return; }
      const b = e.target.closest('[data-act]');
      if (!b || b.disabled) { return; }
      const act = b.getAttribute('data-act');
      if (act === 'close') { closeRoom(); return; }
      const key = S.openRoom; if (!key) { return; }
      const rm = roomByKey(key);
      if (act === 'crew+') { moveCrew(key, +1); }
      else if (act === 'crew-') { moveCrew(key, -1); }
      else if (act === 'seal') { toggleSeal(key); }
      else if (act === 'vent') { ventRoom(key); }
      else if (act === 'rtech+') { assignTech(key, +1); }
      else if (act === 'rtech-') { assignTech(key, -1); }
      else if (act === 'release') { releaseRoom(key); }
      else if (act === 'pow+' && rm.sys) { adjustPower(rm.sys, rm.sys === 'reactor' ? 3 : 5); }
      else if (act === 'pow-' && rm.sys) { adjustPower(rm.sys, rm.sys === 'reactor' ? -3 : -5); }
      if (S.openRoom) { updateModal(roomByKey(S.openRoom)); }
    });
    window.addEventListener('keydown', e => { if (e.key === 'Escape' && S.openRoom) { closeRoom(); } });
  }

  // ---------------------------------------------------------------- helpers (model)
  function roomByKey(key) { return S.rooms.find(r => r.key === key); }
  function roomBySys(key) { return S.rooms.find(r => r.sys === key); }
  function mannedFrac(rm) { return rm && rm.stations ? clamp(rm.crew / rm.stations, 0, 1) : 1; }
  function mannedBoost(rm) { return 0.5 + 0.5 * mannedFrac(rm); } // unmanned 0.5x, fully manned 1x
  function sysEff(key) {
    // effectiveness = power * linked-room health * crew manning * brownout penalty
    const sy = S.sys[key];
    if (!sy) { return 1; }
    let e = sy.power / 100;
    const rm = roomBySys(key);
    if (rm) { e *= rm.health / 100; e *= mannedBoost(rm); }
    if (S.brownout && key !== 'reactor') { e *= clamp(S.reserve >= 0 ? 1 : (S.sys.reactor.power / usedPower()), 0.45, 1); }
    if (S.buffs.shields && key === 'shields') { e *= 1.25; }
    if (S.bonus) {
      if (key === 'shields') { e *= S.bonus.shield; }
      else if (key === 'weapons') { e *= S.bonus.weapon; }
      else if (key === 'engines') { e *= S.bonus.engine; }
    }
    return clamp(e, 0, 2.5);
  }
  function usedPower() {
    let u = 0;
    SYS_DEFS.forEach(d => { if (d.key !== 'reactor') { u += d.base * S.sys[d.key].power / 100; } });
    return u;
  }
  function aliveCrew() { return S.rooms.reduce((n, r) => n + r.crew, 0) + S.crewIdle; }
  function cargoIntegrity() {
    if (!S.cargo.length) { return 100; }
    const t = S.cargo.reduce((a, c) => a + c.value, 0);
    return S.cargo.reduce((a, c) => a + c.integrity * c.value, 0) / t;
  }
  function avgBayManned() {
    const bays = S.rooms.filter(r => r.cargoBay);
    return bays.length ? bays.reduce((a, b) => a + mannedFrac(b), 0) / bays.length : 0;
  }

  // ---------------------------------------------------------------- interactions
  function adjustPower(key, d) {
    if (S.over) { return; }
    const sy = S.sys[key];
    sy.power = clamp(sy.power + d, sy.min, sy.max);
  }
  function moveCrew(roomKey, d) {
    if (S.over) { return; }
    const rm = roomByKey(roomKey);
    if (rm.sealed) { return; } // bulkhead locked — crew can't transit
    if (d > 0 && S.crewIdle > 0 && rm.crew < rm.stations) { rm.crew++; S.crewIdle--; }
    else if (d < 0 && rm.crew > 0) { rm.crew--; S.crewIdle++; }
  }
  function toggleSeal(roomKey) {
    if (S.over) { return; }
    const rm = roomByKey(roomKey);
    rm.sealed = !rm.sealed;
    logEvent('warn', (rm.sealed ? 'Bulkhead sealed: ' : 'Bulkhead opened: ') + rm.label);
    comms(rm.sealed ? 'warn' : 'info', (rm.sealed ? 'SEALED ' : 'OPENED ') + rm.label);
  }
  function ventRoom(roomKey) {
    if (S.over) { return; }
    const rm = roomByKey(roomKey);
    if (!rm.fire) { return; }
    rm.fire = false;
    S.crewIdle += rm.crew; rm.crew = 0; // crew auto-evacuate to safety
    logEvent('good', 'Atmosphere vented in ' + rm.label + ' — fire out, crew evacuated');
    comms('good', 'VENTED ' + rm.label + ' — FIRE OUT');
  }
  function openRoom(key) { S.openRoom = key; $('roomModal').classList.remove('hidden'); buildModal(roomByKey(key)); }
  function closeRoom() { S.openRoom = null; R.modal = null; $('roomModal').classList.add('hidden'); }

  function assignTech(roomKey, d) {
    if (S.over) { return; }
    const rm = roomByKey(roomKey);
    if (d > 0) {
      if (S.repairPool <= 0) { return; }
      S.repairPool--; rm.repairTechs++;
      if (rm.repairState === 'idle') { rm.repairState = 'enroute'; rm.repairEta = TRAVEL_TIME; }
      if (rm.repairTechs === 1) { logEvent('info', 'Repair tech dispatched to ' + rm.label + ' (en route)'); comms('info', 'REPAIR → ' + rm.label); }
    } else {
      if (rm.repairTechs <= 0) { return; }
      rm.repairTechs--; S.repairPool++;
      if (rm.repairTechs === 0) { rm.repairState = 'idle'; rm.repairEta = 0; }
    }
  }
  function releaseRoom(roomKey) {
    const rm = roomByKey(roomKey);
    if (rm.repairTechs > 0) {
      S.repairPool += rm.repairTechs; rm.repairTechs = 0; rm.repairState = 'idle'; rm.repairEta = 0;
      logEvent('info', 'Repair crew released from ' + rm.label);
    }
  }
  function triggerAction(key) {
    if (S.over || S.actions[key] > 0) { return; }
    const def = ACTION_DEFS.find(a => a.key === key);
    S.actions[key] = def.cd;
    if (key === 'shields') {
      S.buffs.shields = 30; logEvent('good', 'Shields prioritized (+25%, 30s)'); comms('warn', 'PRIORITIZING SHIELDS');
    } else if (key === 'power') {
      S.buffs.power = 20; S.sys.reactor.power = clamp(S.sys.reactor.power + 20, 60, 153);
      S.sys.shields.power = clamp(S.sys.shields.power + 15, 0, 150);
      S.sys.life.power = clamp(S.sys.life.power + 10, 0, 150);
      logEvent('good', 'EMERGENCY POWER — critical systems boosted'); comms('warn', 'EMERGENCY POWER ENGAGED');
    } else if (key === 'damage') {
      let n = 0;
      S.rooms.forEach(r => { if (r.fire) { r.fire = false; n++; } if (r.breach) { r.breach = false; r.health = Math.max(r.health, 25); n++; } });
      logEvent('good', 'Damage control: ' + n + ' hazard(s) contained'); comms('good', 'DAMAGE CONTROL — ' + n + ' CONTAINED');
    } else if (key === 'evac') {
      let n = 0;
      S.pax = S.pax.map(p => { if (p === 'panic') { n++; return 'safe'; } return p; });
      S.paxMorale = clamp(S.paxMorale + 8, 0, 100);
      logEvent('good', 'Evacuation: ' + n + ' passengers moved to safe zones'); comms('good', 'PASSENGERS EVACUATING');
    }
  }
  function togglePause() {
    S.running = !S.running;
    $('btnPause').classList.toggle('on', !S.running);
    logEvent('info', S.running ? 'Simulation resumed' : 'Simulation paused');
  }
  function toggleFast() {
    S.speed = S.speed === 1 ? 2 : 1;
    $('btnFast').classList.toggle('on', S.speed === 2);
  }

  // ---------------------------------------------------------------- logs
  function clockStr() {
    const s = S.clock % 86400;
    const h = (s / 3600) | 0, m = ((s % 3600) / 60) | 0, sec = (s % 60) | 0;
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0');
  }
  function logEvent(kind, msg) {
    S.events.unshift({ t: clockStr(), kind, msg });
    if (S.events.length > 60) { S.events.pop(); }
  }
  function comms(kind, msg) {
    S.comms.unshift({ t: clockStr(), kind, msg });
    if (S.comms.length > 14) { S.comms.pop(); }
  }

  // ---------------------------------------------------------------- simulation
  function sim(dt) {
    if (!S.running || S.over) { return; }
    S.t += dt; S.clock += dt; S.cycle += dt * 0.0007;

    // cooldowns & buffs
    for (const k in S.actions) { if (S.actions[k] > 0) { S.actions[k] = Math.max(0, S.actions[k] - dt); } }
    for (const k in S.buffs) { S.buffs[k] -= dt; if (S.buffs[k] <= 0) { delete S.buffs[k]; } }

    // power balance
    const used = usedPower();
    S.reserve = S.sys.reactor.power - used;
    S.brownout = S.reserve < 0;

    // reactor overclock heat -> occasional hazard
    if (S.sys.reactor.power > 135 && chance(0.02 * dt * 60)) {
      logEvent('warn', 'Reactor temperature rising — overclock stress');
    }

    // ---- shields regen ----
    const shEff = sysEff('shields');
    const shieldMax = 120 * shEff;
    S.shieldPool = clamp(S.shieldPool + (12 * shEff) * dt, 0, shieldMax);

    // ---- threat & raider batches ----
    // Calm intro, then contacts arrive in batches. A batch that lands while
    // raiders are still alive stacks the pressure and pushes threat up toward 5
    // (endless horde). Clear the sky and threat eases back down.
    if (S.t > INTRO) {
      S.batchTimer -= dt;
      if (S.batchTimer <= 0) {
        // batches get bigger and more frequent the longer the run goes — so even
        // if you clear each one early, the tempo eventually outpaces your guns
        // and raiders pile up, dragging threat toward 5 (horde).
        const intensity = S.t - INTRO;
        const dmul = 0.6 + S.danger * 0.25;
        const size = Math.max(1, Math.round((2 + intensity * 0.02 + S.threat * 0.6 + rand(0, 2)) * dmul));
        S.attackers = Math.min(18 + S.danger * 4, S.attackers + size);
        S.batchTimer = clamp(18 - intensity * 0.04 - S.threat * 1.5 - S.danger * 1.5, 4, 18) * rand(0.85, 1.15);
        logEvent('bad', size + ' raiders closing to attack range'); comms('bad', 'HOSTILE CONTACTS ×' + size);
      }
    }
    // threat tracks the live raider backlog: rises fast as they pile up, eases
    // down (more slowly) when you thin them out. Clear the sky and it settles.
    const threatTarget = clamp(S.attackers / 3.2, 0, 5);
    S.threat = clamp(S.threat + (threatTarget - S.threat) * (threatTarget > S.threat ? 0.5 : 0.15) * dt, 0, 5);
    S.pressure = S.attackers > 0 ? clamp(0.4 + S.threat * 0.28 + S.attackers * 0.03, 0.35, 2.4) : 0;

    // ---- combat volleys ----
    if (S.attackers > 0) {
      S.combatTimer -= dt;
      if (S.combatTimer <= 0) { S.combatTimer = rand(1.5, 2.6) / Math.max(0.4, S.pressure); volley(); }
    }
    // weapons whittle down attackers (power + tactical crew + bridge coordination)
    const cmd = 0.8 + 0.2 * mannedFrac(roomByKey('bridge'));
    const wpEff = sysEff('weapons') * (0.6 + 0.4 * S.depts.tactical.count / S.depts.tactical.max);
    if (S.attackers > 0) {
      S.killProg += wpEff * 0.3 * cmd * S.crewSkill * dt;
      while (S.killProg >= 1 && S.attackers > 0) {
        S.killProg -= 1; S.attackers--;
        logEvent('good', 'Raider destroyed (' + S.attackers + ' remaining)'); comms('good', 'RAIDER DESTROYED');
      }
      if (S.attackers === 0) { logEvent('good', 'Sky clear — all contacts down'); comms('good', 'ALL CONTACTS CLEAR'); }
    }

    // ---- fires & breaches damage rooms (sealing contains them; crew fight them) ----
    const lifeEff = sysEff('life');
    S.rooms.forEach(rm => {
      const sealFx = rm.sealed ? 0.45 : 1;       // sealed bulkhead contains the hazard
      if (rm.fire) {
        const ctrl = lifeEff * 0.4;
        rm.health = clamp(rm.health - (3.2 - ctrl) * sealFx * dt, 0, 100);
        // crew on station fight the fire and can put it out
        if (rm.crew > 0 && !rm.sealed && chance(0.10 * rm.crew * dt)) { rm.fire = false; logEvent('good', 'Crew suppressed fire in ' + rm.label); }
        if (rm.crew > 0 && chance(0.02 * dt)) { hurtRoom(rm, 'fire'); }
        if (chance(0.02 * dt)) { logEvent('bad', 'Fire spreading in ' + rm.label); }
      }
      if (rm.breach) {
        rm.health = clamp(rm.health - 2.5 * sealFx * dt, 0, 100);
        if (rm.crew > 0 && !rm.sealed && chance(0.03 * dt)) { hurtRoom(rm, 'breach'); }
      }
      // life-support failure causes slow casualties everywhere there is crew
      if (lifeEff < 0.5 && rm.crew > 0 && chance(0.012 * (0.5 - lifeEff) * dt * 4)) {
        hurtRoom(rm, 'life support');
      }
      rm.status = rm.health < 33 ? 'critical' : rm.health < 75 ? 'damaged' : 'normal';
    });

    // ---- cargo integrity (hold-wide: bay fires/breaches + env + cargo crew) ----
    if (S.cargo.length) {
      const bays = S.rooms.filter(r => r.cargoBay);
      let bayHaz = 0;
      bays.forEach(b => { if (b.fire) { bayHaz += 6; } if (b.breach) { bayHaz += 8; } if (b.status === 'critical') { bayHaz += 2; } });
      bayHaz /= Math.max(1, bays.length);
      let decay = bayHaz + (1 - sysEff('cargo')) * 1.5;
      decay *= (1 - 0.4 * avgBayManned());
      if (decay > 0) { S.cargo.forEach(c => { c.integrity = clamp(c.integrity - decay * dt, 0, 100); }); }
    }

    // ---- hull from average room health + direct combat handled in volley ----
    const avg = S.rooms.reduce((a, r) => a + r.health, 0) / S.rooms.length;
    S.hull = clamp(S.hull + (avg - S.hull) * 0.05 * dt, 0, 100);

    // ---- passengers panic / morale ----
    const hazardCount = S.rooms.filter(r => r.fire || r.breach).length;
    S.paxMorale = clamp(S.paxMorale + (hazardCount > 0 ? -2.5 : 1.2) * dt - (sysEff('life') < 0.6 ? 3 * dt : 0), 0, 100);
    const stewards = mannedFrac(roomByKey('pax'));
    if (hazardCount > 0 && chance(0.05 * hazardCount * (1 - 0.5 * stewards) * dt)) {
      const idx = S.pax.findIndex(p => p === 'safe');
      if (idx >= 0) { S.pax[idx] = 'panic'; }
    }
    if (sysEff('life') < 0.4 && chance(0.03 * dt)) {
      const idx = S.pax.findIndex(p => p === 'panic');
      if (idx >= 0) { S.pax[idx] = 'dead'; logEvent('bad', 'Passenger lost — life support failure'); }
    }

    // ---- repair crew (player-assigned techs; travel, then work) ----
    const engFactor = 0.5 + 0.5 * S.depts.engineering.count / S.depts.engineering.max;
    S.rooms.forEach(rm => {
      if (rm.repairTechs <= 0) { return; }
      if (rm.repairState === 'enroute') {
        rm.repairEta -= dt;
        if (rm.repairEta <= 0) { rm.repairState = 'working'; logEvent('good', rm.repairTechs + ' repair tech(s) on station at ' + rm.label); }
        return;
      }
      // working: ~18s per tech to fully repair from zero; techs also fight hazards
      const rate = (5.5 * rm.repairTechs * engFactor * S.crewSkill) * (S.brownout ? 0.6 : 1);
      if (rm.fire && chance(0.35 * rm.repairTechs * dt)) { rm.fire = false; logEvent('good', 'Repair crew suppressed fire in ' + rm.label); }
      if (rm.breach && rm.health > 25 && chance(0.3 * rm.repairTechs * dt)) { rm.breach = false; logEvent('good', 'Repair crew sealed breach in ' + rm.label); }
      if (rm.health < 100 || rm.fire || rm.breach) { rm.health = clamp(rm.health + rate * dt, 0, 100); }
    });

    // injured recover faster with medical dept AND a manned med bay
    const medMan = mannedBoost(roomByKey('medbay'));
    if (S.injured > 0 && chance(0.04 * S.depts.medical.count / S.depts.medical.max * medMan * S.crewSkill * dt * 4)) {
      S.injured--; logEvent('good', 'Crew member recovered in Med Bay');
    }

    // ---- random hazards (only while under fire) ----
    if (S.attackers > 0) {
      S.hazardTimer -= dt;
      if (S.hazardTimer <= 0) { S.hazardTimer = rand(6, 13) / Math.max(0.5, S.pressure); spawnHazard(); }
    }

    // ---- crew count from rooms; departments lose people on death ----
    S.killed += 0; // updated in hurtRoom

    // ---- win / lose ----
    if (S.hull <= 0) { endGame(false, 'HULL FAILURE', 'The Wayfarer broke apart under fire.'); }
    else if (S.cargo.length && cargoIntegrity() < CARGO_FAIL) { endGame(false, 'CARGO LOST', 'Cargo integrity fell below the contract minimum.'); }
    else if (aliveCrew() <= 0) { endGame(false, 'ALL HANDS LOST', 'No crew remain to command the ship.'); }
    else if (S.t >= S.duration) { endGame(true, 'CONTRACT COMPLETE', 'You brought the Wayfarer in to ' + (S.contract ? S.contract.to : 'port') + '.'); }
  }

  function volley() {
    const evasion = sysEff('engines') * 0.35;
    const pointDef = sysEff('sensors') * 0.3 + sysEff('weapons') * 0.15 + (S.bonus.pdef || 0);
    if (chance(evasion)) { comms('info', 'EVASIVE MANEUVER — VOLLEY MISSED'); return; }
    let dmg = rand(18, 34) * S.pressure;
    if (chance(pointDef)) { dmg *= 0.4; comms('good', 'POINT DEFENSE ENGAGED'); }
    // shields absorb
    const absorbed = Math.min(S.shieldPool, dmg);
    S.shieldPool -= absorbed;
    let leak = dmg - absorbed;
    if (absorbed > 0) { comms('warn', 'SHIELDS ABSORB ' + Math.round(absorbed)); }
    if (leak <= 0) { return; }
    // leak hits a random room
    const rm = pick(S.rooms);
    rm.health = clamp(rm.health - leak * 0.9, 0, 100);
    S.hull = clamp(S.hull - leak * 0.12 * S.bonus.hull, 0, 100);
    logEvent('bad', rm.label + ' hit (' + Math.round(leak) + ' dmg)'); comms('bad', rm.label + ' HIT');
    if (leak > 16 && chance(0.5)) { rm.fire = true; logEvent('bad', 'Fire started in ' + rm.label); }
    if (S.hull < 45 && leak > 20 && chance(0.35)) { rm.breach = true; logEvent('bad', 'HULL BREACH — ' + rm.label); }
    if (rm.crew > 0 && chance(0.3)) { hurtRoom(rm, 'impact'); }
  }

  function hurtRoom(rm, cause) {
    // kill or injure someone in the room; a manned med bay saves lives
    const pDeath = 0.45 * (1 - 0.4 * mannedFrac(roomByKey('medbay')));
    if (chance(pDeath)) {
      if (rm.crew > 0) { rm.crew--; S.killed++; logEvent('bad', 'Crew lost in ' + rm.label + ' (' + cause + ')'); }
      else if (S.crewIdle > 0) { S.crewIdle--; S.killed++; }
      const d = pick(Object.values(S.depts));
      if (d.count > 0 && chance(0.6)) { d.count--; }
    } else {
      S.injured++;
    }
  }

  function spawnHazard() {
    const kinds = [
      () => { const r = pick(S.rooms.filter(x => !x.fire)); if (r) { r.fire = true; logEvent('bad', 'Fire detected — ' + r.label); comms('bad', 'FIRE — ' + r.label); } },
      () => { logEvent('warn', 'Coolant leak detected — Engine Room'); comms('warn', 'COOLANT LEAK'); const r = S.rooms.find(x => x.key === 'engines'); r.health = clamp(r.health - 12, 0, 100); },
      () => { logEvent('warn', 'Incoming missile swarm detected'); comms('bad', 'MISSILE SWARM INBOUND'); S.combatTimer = 0; },
      () => { const r = pick(S.rooms); if (S.hull < 55) { r.breach = true; logEvent('bad', 'Decompression — ' + r.label); } else { logEvent('warn', 'Micro-fracture — ' + r.label); r.health = clamp(r.health - 8, 0, 100); } },
    ];
    pick(kinds)();
  }

  // ---------------------------------------------------------------- render
  function render() {
    if (!S) { return; }
    // top bar
    $('tbClock').textContent = clockStr();
    $('tbCycle').textContent = 'CYCLE ' + S.cycle.toFixed(2);
    $('tbCredits').textContent = fmt(S.credits) + ' ◎';
    const lvl = Math.round(S.threat);
    $('tbThreat').textContent = 'LVL ' + lvl + ' · ' + THREAT_LABEL[clamp(lvl, 0, 5)];
    $('tbThreatBox').classList.toggle('alarm', S.threat >= 1);
    $('tbThreatBox').classList.toggle('flash', S.threat >= 4);
    const underAttack = S.attackers > 0;
    $('tbAlert').textContent = underAttack ? 'UNDER ATTACK' : (S.t < INTRO ? 'STANDBY' : 'ALL CLEAR');
    $('tbAlertBox').classList.toggle('alarm', underAttack);
    $('tbObjective').textContent = S.t < INTRO ? 'STANDBY · CONTACTS INBOUND' : 'ARRIVE IN ' + Math.max(0, Math.ceil(S.duration - S.t)) + 'S';
    let tb = ''; for (let i = 0; i < 5; i++) { tb += '<i class="' + (i < lvl ? 'on' : '') + '"></i>'; }
    $('tbThreatBars').innerHTML = tb;

    // captain + departments
    R.capHp.textContent = S.captain.health + '%';
    R.capMr.textContent = S.captain.morale;
    let crewTotal = 0;
    DEPT_DEFS.forEach(d => {
      const st = S.depts[d.key], ref = R.depts[d.key];
      ref.pct.textContent = st.count + ' / ' + d.max;
      setSeg(ref.bar, st.health / 100, colorFor(st.health));
      crewTotal += st.count;
    });
    $('crewCount').textContent = aliveCrew() + ' / 28 · ' + S.crewIdle + ' IDLE';

    // repair crew (tech pool + active jobs)
    $('repairPool').textContent = S.repairPool + ' / ' + TOTAL_TECHS + ' IDLE';
    const jobs = S.rooms.filter(r => r.repairTechs > 0);
    let rhtml = '<div class="repair-pool"><span class="rp-label">IDLE TECHS</span>' + techIcons(S.repairPool) +
      (S.repairPool === 0 ? '<span class="rp-none">none</span>' : '') + '</div>';
    if (jobs.length === 0) {
      rhtml += '<div class="repair-empty">No active repairs. Click a compartment on the schematic to send techs.</div>';
    } else {
      jobs.forEach(rm => {
        const done = rm.health >= 99 && !rm.fire && !rm.breach;
        const state = rm.repairState === 'enroute'
          ? '<span class="rj-state enroute">EN ROUTE ' + Math.ceil(rm.repairEta) + 's</span>'
          : done ? '<span class="rj-state done">ON STATION</span>'
            : '<span class="rj-state">REPAIRING ' + Math.round(rm.health) + '%</span>';
        rhtml += '<div class="repair-job"><div class="rj-top"><span class="rj-name">' + rm.label + '</span>' +
          '<button class="rj-release" data-release="' + rm.key + '">release</button></div>' +
          '<div class="rj-mid">' + techIcons(rm.repairTechs) + state + '</div></div>';
      });
    }
    R.repairBody.innerHTML = rhtml;

    // casualties
    R.casK.textContent = S.killed; R.casI.textContent = S.injured; R.casM.textContent = S.missing;

    // cargo
    S.cargo.forEach((c, i) => {
      R.cargo[i].pct.textContent = Math.round(c.integrity) + '%';
      R.cargo[i].row.classList.toggle('atrisk', c.integrity < 70);
    });

    // schematic rooms
    S.rooms.forEach(rm => {
      const ref = R.rooms[rm.key];
      let cls = 'room ' + rm.status;
      if (rm.fire) { cls += ' fire'; }
      if (rm.breach) { cls += ' breach'; }
      ref.el.className = cls;
      let statTxt;
      if (rm.cargoBay) { statTxt = S.cargo.length ? Math.round(cargoIntegrity()) + '%' : 'EMPTY'; }
      else if (rm.pax) { statTxt = S.pax.length ? S.pax.filter(p => p !== 'dead').length + ' aboard' : 'EMPTY'; }
      else if (rm.med || rm.key === 'bridge') { statTxt = rm.crew + ' / ' + rm.crewMax; }
      else { statTxt = Math.round(rm.health) + '%'; }
      ref.stat.textContent = statTxt;
      ref.badge.textContent = rm.fire ? '🔥' : rm.breach ? '✷' : rm.sealed ? '🔒' : rm.repairTechs > 0 ? '🛠' : '';
      // station pips: filled = manned, hollow = empty station
      let pips = '';
      for (let i = 0; i < rm.stations; i++) { pips += '<i class="pip' + (i < rm.crew ? ' on' : '') + '"></i>'; }
      ref.dots.innerHTML = pips;
    });
    $('hullPct').textContent = Math.round(S.hull) + '%';
    setSeg(R.hullBar, S.hull / 100, ('hull ' + colorFor(S.hull)).trim());
    const dmgCount = S.rooms.filter(r => r.status !== 'normal' || r.fire || r.breach).length;
    $('hullWarn').textContent = dmgCount > 0 ? '⚠ ' + dmgCount + ' SYSTEMS DAMAGED' : '✓ ALL SYSTEMS NOMINAL';
    $('hullWarn').style.color = dmgCount > 0 ? 'var(--amber)' : 'var(--green)';

    // passengers
    const safe = S.pax.filter(p => p === 'safe').length;
    $('paxSafe').textContent = safe + ' / ' + S.pax.length + ' SAFE';
    S.pax.forEach((p, i) => {
      const sp = R.pax[i];
      sp.className = 'pax' + (p === 'panic' ? ' panic' : p === 'dead' ? ' dead' : '');
      sp.textContent = p === 'dead' ? '☠' : '☻';
    });
    $('paxMoraleTxt').textContent = Math.round(S.paxMorale) + '%';
    setSeg(R.paxMoraleBar, S.paxMorale / 100, colorFor(S.paxMorale));
    const panicEl = $('paxPanic');
    const panicN = S.pax.filter(p => p === 'panic').length;
    panicEl.textContent = panicN > 6 ? 'HIGH' : panicN > 2 ? 'MEDIUM' : 'LOW';
    panicEl.className = panicN > 6 ? 'risk-high' : panicN > 2 ? 'risk-med' : 'risk-low';

    // power
    SYS_DEFS.forEach(d => {
      const sy = S.sys[d.key], ref = R.sys[d.key];
      ref.pct.textContent = Math.round(sy.power) + (d.key === 'reactor' ? '%' : '%');
      const frac = sy.power / (d.key === 'reactor' ? S.sys.reactor.max : 150);
      let cc = '';
      if (d.key === 'reactor') { cc = sy.power > 135 ? 'red' : sy.power > 120 ? 'amber' : ''; }
      else { cc = sy.power >= 100 ? '' : sy.power >= 50 ? 'amber' : 'red'; }
      setSeg(ref.bar, frac, cc);
      ref.pct.style.color = cc === 'red' ? 'var(--red)' : cc === 'amber' ? 'var(--amber)' : 'var(--cyan)';
      // net
      let net;
      if (d.key === 'reactor') { net = Math.round(sy.power - 108); }
      else { net = Math.round(d.base * (sy.power - 100) / 100); }
      ref.net.textContent = (net > 0 ? '+' : '') + net;
      ref.net.className = 'pwr-net ' + (net > 0 ? 'net-pos' : net < 0 ? 'net-neg' : 'net-zero');
    });
    $('reactorOut').textContent = 'REACTOR ' + Math.round(S.sys.reactor.power) + ' / ' + S.sys.reactor.max + ' MW';
    setSeg(R.reserveBar, clamp(S.reserve / 30, 0, 1), 'reserve ' + (S.reserve < 0 ? 'red' : S.reserve < 5 ? 'amber' : 'green'));
    $('reserveTxt').textContent = (S.reserve < 0 ? 'OVER ' : '') + Math.round(Math.abs(S.reserve)) + ' / ' + S.sys.reactor.max + ' MW';
    document.querySelector('.reserve-row').classList.toggle('over', S.reserve < 0);

    // active hazards (derived live from ship state)
    const haz = [];
    S.rooms.forEach(rm => {
      if (rm.fire) { haz.push({ cls: '', ico: '🔥', name: 'FIRE — ' + rm.label, desc: 'Spread risk · suppress now' }); }
      else if (rm.breach) { haz.push({ cls: 'breach', ico: '✷', name: 'HULL BREACH — ' + rm.label, desc: 'Decompression risk' }); }
      else if (rm.status === 'critical') { haz.push({ cls: '', ico: '⚠', name: rm.label + ' CRITICAL', desc: Math.round(rm.health) + '% integrity' }); }
    });
    if (sysEff('life') < 0.6) { haz.push({ cls: 'warn', ico: '❂', name: 'LIFE SUPPORT STRAINED', desc: 'Crew at risk if it fails' }); }
    if (S.sys.reactor.power > 135) { haz.push({ cls: 'warn', ico: '⚛', name: 'REACTOR OVERHEATING', desc: 'Reduce output to cool down' }); }
    if (S.brownout) { haz.push({ cls: 'warn', ico: '⚡', name: 'POWER BROWNOUT', desc: 'Draw exceeds reactor output' }); }
    S.cargo.forEach((c, i) => { if (c.integrity < 50) { haz.push({ cls: 'warn', ico: '▤', name: 'CARGO AT RISK — ' + c.name, desc: Math.round(c.integrity) + '% integrity' }); } });
    R.hazardList = R.hazardList || $('hazardList');
    if (haz.length === 0) {
      R.hazardList.innerHTML = '<div class="hazard none">✓ All hazards contained</div>';
    } else {
      R.hazardList.innerHTML = haz.slice(0, 7).map(h =>
        '<div class="hazard ' + h.cls + '"><span class="hz-ico">' + h.ico + '</span>' +
        '<div><div class="hz-name">' + h.name + '</div><div class="hz-desc">' + h.desc + '</div></div></div>').join('');
    }

    // actions cooldowns
    ACTION_DEFS.forEach(a => {
      if (a.disabled) { return; }
      const cd = S.actions[a.key] || 0;
      const btn = R.actions[a.key];
      btn.classList.toggle('cooldown', cd > 0);
      const sub = btn.querySelector('.act-sub');
      sub.textContent = cd > 0 ? 'READY IN ' + Math.ceil(cd) + 's' : a.sub;
    });

    // event log
    R.eventLog.innerHTML = S.events.slice(0, 40).map(e =>
      '<div class="elog ' + e.kind + '"><span class="et">' + e.t + '</span><span class="em">' + e.msg + '</span></div>').join('');

    // comms ticker
    R.commsTrack.innerHTML = S.comms.map(c =>
      '<span class="ct">' + c.t + ' <b>' + c.msg + '</b></span>').join('');
    $('autosave').textContent = '◌ AUTOSAVE ' + clockStr();

    if (S.openRoom) { updateModal(roomByKey(S.openRoom)); }
  }

  // ---------------------------------------------------------------- room inspector
  // Built once per open so the buttons persist; only values update each frame.
  // (Rebuilding innerHTML every frame would destroy a button mid-click.)
  function buildModal(rm) {
    const panel = $('roomModalPanel');
    panel.innerHTML =
      '<div class="rm-head">' +
        '<div><div class="rm-title">' + rm.label + '</div><div class="rm-sub"></div></div>' +
        '<span class="rm-chip"></span>' +
        '<button class="rm-close" data-act="close" title="Close (Esc)">✕</button></div>' +
      '<div class="rm-sec"><div class="rm-sec-h">' + rm.fn + ' — CREW STATIONS</div>' +
        '<div class="rm-stationrow"><div class="rm-pips"></div>' +
          '<div class="rm-crewctl"><button class="pbtn" data-act="crew-">−</button>' +
          '<span class="rm-crewn"></span>' +
          '<button class="pbtn" data-act="crew+">+</button></div></div>' +
        '<div class="rm-eff"></div>' +
        '<div class="rm-idle">IDLE CREW AVAILABLE: <b class="rm-idleN"></b> — send people where the fight is</div>' +
      '</div>' +
      (rm.sys ?
        '<div class="rm-sec"><div class="rm-sec-h">POWER — ' + S.sys[rm.sys].label + '</div>' +
          '<div class="rm-pwrrow"><button class="pbtn" data-act="pow-">−</button>' +
          '<div class="rm-bar"><i></i></div><span class="rm-pwrn"></span>' +
          '<button class="pbtn" data-act="pow+">+</button></div></div>' : '') +
      '<div class="rm-sec"><div class="rm-sec-h">REPAIR CREW</div>' +
        '<div class="rm-stationrow"><div class="rm-techs"></div>' +
          '<div class="rm-crewctl"><button class="pbtn" data-act="rtech-">−</button>' +
          '<span class="rm-rtechn"></span>' +
          '<button class="pbtn" data-act="rtech+">+</button></div></div>' +
        '<div class="rm-rstate"></div>' +
        '<button class="rm-fn rm-release" data-act="release">RELEASE CREW TO POOL</button>' +
      '</div>' +
      '<div class="rm-sec"><div class="rm-sec-h">FUNCTIONS</div><div class="rm-fns">' +
        '<button class="rm-fn" data-act="seal">🔒 SEAL BULKHEAD</button>' +
        '<button class="rm-fn" data-act="vent">🌀 VENT ATMOSPHERE</button>' +
      '</div></div>';
    const pips = panel.querySelector('.rm-pips');
    for (let i = 0; i < rm.stations; i++) { const e = document.createElement('i'); e.className = 'bigpip'; e.textContent = '☻'; pips.appendChild(e); }
    R.modal = {
      key: rm.key,
      chip: panel.querySelector('.rm-chip'), sub: panel.querySelector('.rm-sub'),
      pips, crewn: panel.querySelector('.rm-crewn'), eff: panel.querySelector('.rm-eff'),
      idleN: panel.querySelector('.rm-idleN'), powBar: panel.querySelector('.rm-bar i'),
      powN: panel.querySelector('.rm-pwrn'),
      techs: panel.querySelector('.rm-techs'), rtechn: panel.querySelector('.rm-rtechn'),
      rstate: panel.querySelector('.rm-rstate'), rtechPlus: panel.querySelector('[data-act="rtech+"]'),
      rtechMinus: panel.querySelector('[data-act="rtech-"]'), release: panel.querySelector('[data-act="release"]'),
      seal: panel.querySelector('[data-act="seal"]'), vent: panel.querySelector('[data-act="vent"]'),
    };
    updateModal(rm);
  }
  function updateModal(rm) {
    const m = R.modal;
    if (!m || m.key !== rm.key) { buildModal(rm); return; }
    const statusTxt = rm.fire ? 'FIRE' : rm.breach ? 'BREACH' : rm.status.toUpperCase();
    m.chip.textContent = statusTxt;
    m.chip.className = 'rm-chip ' + (rm.fire ? 'critical' : rm.breach ? 'breach' : rm.status);
    let metric;
    if (rm.cargoBay) { metric = (S.cargo.length ? 'CARGO ' + Math.round(cargoIntegrity()) + '%' : 'NO CARGO') + ' · ' + Math.round(rm.health) + '% structure'; }
    else if (rm.pax) { metric = (S.pax.length ? S.pax.filter(p => p !== 'dead').length + ' passengers' : 'NO PASSENGERS') + ' · ' + Math.round(rm.health) + '% structure'; }
    else { metric = 'STRUCTURE ' + Math.round(rm.health) + '%'; }
    m.sub.textContent = metric;
    m.crewn.textContent = rm.crew + ' / ' + rm.stations;
    for (let i = 0; i < m.pips.children.length; i++) { m.pips.children[i].classList.toggle('on', i < rm.crew); }
    m.eff.innerHTML = 'Station output <b>' + Math.round(mannedBoost(rm) * 100) + '%</b> &middot; ' + rm.fdesc +
      (rm.sealed ? ' &middot; <b class="warnt">crew locked in (sealed)</b>' : '');
    m.idleN.textContent = S.crewIdle;
    if (m.powBar) {
      const sy = S.sys[rm.sys], max = rm.sys === 'reactor' ? 153 : 150;
      m.powBar.style.width = (clamp(sy.power / max, 0, 1) * 100).toFixed(0) + '%';
      m.powN.textContent = Math.round(sy.power) + (rm.sys === 'reactor' ? ' MW' : '%');
    }
    // repair crew controls
    m.techs.innerHTML = rm.repairTechs > 0 ? techIcons(rm.repairTechs) : '<span class="rp-none">none assigned</span>';
    m.rtechn.textContent = rm.repairTechs;
    m.rtechPlus.disabled = S.repairPool <= 0;
    m.rtechMinus.disabled = rm.repairTechs <= 0;
    const done = rm.health >= 99 && !rm.fire && !rm.breach;
    let rs;
    if (rm.repairTechs === 0) { rs = (S.repairPool > 0 ? S.repairPool + ' techs idle in the pool — press + to send them here' : 'No idle techs — release some from another job'); }
    else if (rm.repairState === 'enroute') { rs = '<b class="warnt">EN ROUTE</b> — arriving in ' + Math.ceil(rm.repairEta) + 's'; }
    else if (done) { rs = '<b style="color:var(--green)">ON STATION</b> — standing by (release if needed elsewhere)'; }
    else { rs = '<b style="color:var(--cyan)">REPAIRING</b> — structure ' + Math.round(rm.health) + '%'; }
    m.rstate.innerHTML = rs;
    m.release.style.display = rm.repairTechs > 0 ? 'block' : 'none';
    m.seal.classList.toggle('on', rm.sealed);
    m.seal.textContent = rm.sealed ? '🔒 OPEN BULKHEAD' : '🔒 SEAL BULKHEAD';
    m.vent.disabled = !rm.fire;
  }

  // ---------------------------------------------------------------- external cam
  // A stylised 2D freighter (no photoreal art): hull + cargo containers + glowing
  // engines, a shimmering shield bubble and raiders/laser fire when under attack,
  // and hull fires when the ship is damaged.
  let stars = [], bolts = [], raiders = [], flashes = [];
  const CONTAINER_COLS = ['#8a5a38', '#39607f', '#3a7d57', '#6a6a74', '#8a4646', '#5a6e34'];
  function initStars() {
    stars = [];
    for (let i = 0; i < 80; i++) { stars.push({ x: Math.random(), y: Math.random(), z: rand(0.3, 1) }); }
    raiders = []; bolts = []; flashes = [];
  }
  function spawnRaider(w, h) {
    const edge = Math.random();
    return {
      x: edge < 0.5 ? rand(-20, w * 0.2) : rand(w * 0.8, w + 20),
      y: rand(8, h - 8), vx: rand(-6, 6), vy: rand(-5, 5), fireCd: rand(0.6, 2.4),
    };
  }
  function drawExt(dt) {
    const ctx = R.extCtx; if (!ctx) { return; }
    const w = R.ext.width = R.ext.clientWidth || 300;
    const h = R.ext.height = 150;
    const unit = Math.min(w * 0.085, (h * 0.5 - 8) / 2.9);
    const cx = w * 0.5, cy = h * 0.52, L = unit * 9.5;
    const under = S && S.attackers > 0;
    const hull = S ? S.hull : 100;
    const fires = S ? S.rooms.filter(r => r.fire).length : 0;

    // backdrop
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#04060f'); bg.addColorStop(1, '#080c1a');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    if (under) {
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, w * 0.6);
      g.addColorStop(0, 'rgba(90,22,22,0.25)'); g.addColorStop(1, 'transparent');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    }
    // parallax stars
    stars.forEach(s => {
      s.x -= s.z * 0.05 * dt; if (s.x < 0) { s.x += 1; s.y = Math.random(); }
      ctx.globalAlpha = 0.25 + s.z * 0.6; ctx.fillStyle = '#9fc0ff';
      ctx.fillRect(s.x * w, s.y * h, s.z * 1.6, s.z * 1.6);
    });
    ctx.globalAlpha = 1;

    drawShip(ctx, cx, cy, unit, S ? S.loadout : META.loadout, S ? S.t : 0, { hull: hull, fires: fires });

    // shield bubble
    if (S) {
      const shMax = 120 * sysEff('shields');
      const sf = shMax > 0 ? clamp(S.shieldPool / shMax, 0, 1) : 0;
      if (sf > 0.04) {
        ctx.save();
        ctx.strokeStyle = 'rgba(90,180,255,' + (0.10 + sf * 0.30 + (under ? 0.06 * Math.sin(S.t * 8) : 0)) + ')';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.ellipse(cx, cy, unit * 6.6, unit * 2.7, 0, 0, TAU); ctx.stroke();
        ctx.restore();
      }
    }

    // raiders + their fire
    if (S) {
      const want = Math.min(S.attackers, 7);
      while (raiders.length < want) { raiders.push(spawnRaider(w, h)); }
      while (raiders.length > want) { raiders.pop(); }
    }
    raiders.forEach(r => {
      if (S && S.running) {
        r.x += r.vx * dt; r.y += r.vy * dt;
        if (r.x < -24) { r.x = -24; r.vx = Math.abs(r.vx); }
        if (r.x > w + 24) { r.x = w + 24; r.vx = -Math.abs(r.vx); }
        if (r.y < 6 || r.y > h - 6) { r.vy = -r.vy; }
        r.fireCd -= dt;
        if (r.fireCd <= 0) { r.fireCd = rand(1.0, 3.0); bolts.push({ x0: r.x, y0: r.y, x: r.x, y: r.y, tx: cx, ty: cy, t: 0 }); }
      }
      // little arrow raider pointing at the ship
      const ang = Math.atan2(cy - r.y, cx - r.x);
      ctx.save(); ctx.translate(r.x, r.y); ctx.rotate(ang);
      ctx.fillStyle = '#c46'; ctx.strokeStyle = '#f8a'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(-4, -3); ctx.lineTo(-4, 3); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,120,90,0.9)'; ctx.fillRect(-6, -1, 2, 2);
      ctx.restore();
    });
    // bolts travel to the shield/hull then flash
    for (let i = bolts.length - 1; i >= 0; i--) {
      const b = bolts[i];
      b.t += dt * 2.2;
      const px = b.x0 + (b.tx - b.x0) * Math.min(1, b.t);
      const py = b.y0 + (b.ty - b.y0) * Math.min(1, b.t);
      ctx.strokeStyle = 'rgba(255,90,70,0.9)'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(b.x0 + (px - b.x0) * 0.7, b.y0 + (py - b.y0) * 0.7); ctx.lineTo(px, py); ctx.stroke();
      if (b.t >= 1) {
        // impact on the shield perimeter
        const ia = Math.atan2(py - cy, px - cx);
        flashes.push({ x: cx + Math.cos(ia) * unit * 6.6, y: cy + Math.sin(ia) * unit * 2.7, life: 0.35 });
        bolts.splice(i, 1);
      }
    }
    for (let i = flashes.length - 1; i >= 0; i--) {
      const f = flashes[i]; f.life -= dt;
      if (f.life <= 0) { flashes.splice(i, 1); continue; }
      ctx.globalAlpha = clamp(f.life * 3, 0, 1);
      ctx.fillStyle = '#bfe0ff';
      ctx.beginPath(); ctx.arc(f.x, f.y, 3.5, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  // The ship: engine cluster (rear/left), thin spine, big command module
  // (front/right), and pods bolted to hardpoints along the spine. The pods
  // drawn reflect the player's actual loadout.
  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  const CARGO_PALETTE = ['#b1462f', '#3f7fb0', '#c98a3a', '#bdb6aa', '#3f9e74', '#8a6fae'];
  // a container/module sitting on top of the hull, drawn per loadout type
  function drawPod(ctx, px, hullTop, slotW, u, type, idx, t) {
    const cw = Math.min(slotW * 0.9, u * 1.5), ch = u * 1.25, x0 = px - cw / 2, y0 = hullTop - ch;
    if (!type) { ctx.fillStyle = '#2f3a48'; ctx.fillRect(px - cw * 0.4, hullTop - u * 0.26, cw * 0.8, u * 0.26); return; }
    if (type === 'cargo') {
      ctx.fillStyle = CARGO_PALETTE[idx % CARGO_PALETTE.length]; ctx.fillRect(x0, y0, cw, ch);
      ctx.strokeStyle = 'rgba(0,0,0,0.28)'; ctx.lineWidth = 1;
      for (let r = 1; r < 4; r++) { const rx = x0 + cw * r / 4; ctx.beginPath(); ctx.moveTo(rx, y0 + 1); ctx.lineTo(rx, y0 + ch - 1); ctx.stroke(); }
      ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fillRect(x0, y0 + ch * 0.44, cw, u * 0.1);
      ctx.strokeStyle = 'rgba(255,255,255,0.16)'; ctx.strokeRect(x0 + 0.5, y0 + 0.5, cw - 1, ch - 1);
    } else if (type === 'passenger') {
      ctx.fillStyle = '#33485e'; roundRect(ctx, x0, y0, cw, ch, u * 0.18); ctx.fill();
      ctx.strokeStyle = '#5fb6ff'; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = 'rgba(150,220,255,' + (0.5 + 0.4 * Math.sin(t * 3 + px)) + ')';
      for (let r = 0; r < 2; r++) { for (let c = 0; c < 3; c++) { ctx.fillRect(x0 + cw * 0.16 + c * cw * 0.26, y0 + ch * 0.22 + r * ch * 0.34, cw * 0.17, ch * 0.2); } }
    } else if (type === 'military') {
      ctx.fillStyle = '#39434f'; ctx.fillRect(x0, y0, cw, ch);
      ctx.fillStyle = '#c0563a'; ctx.fillRect(x0, y0 + ch * 0.34, cw, u * 0.16);
      ctx.strokeStyle = '#7a8ba0'; ctx.lineWidth = 1; ctx.strokeRect(x0, y0, cw, ch);
      ctx.fillStyle = '#1c242f'; ctx.fillRect(px - u * 0.13, y0 - u * 0.4, u * 0.26, u * 0.4);
    } else if (type === 'shield') {
      ctx.fillStyle = '#25405c'; roundRect(ctx, x0, y0, cw, ch, u * 0.18); ctx.fill();
      ctx.strokeStyle = '#4fb0ff'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.strokeStyle = 'rgba(90,180,255,' + (0.4 + 0.3 * Math.sin(t * 4 + px)) + ')';
      ctx.beginPath(); ctx.arc(px, y0 + ch * 0.45, u * 0.5, Math.PI, 0); ctx.stroke();
    }
  }
  function drawEngines(ctx, hx0, cy, u, t) {
    ctx.fillStyle = '#2b3340'; roundRect(ctx, hx0 - u * 1.7, cy - u * 1.45, u * 2.0, u * 2.9, u * 0.35); ctx.fill();
    ctx.strokeStyle = '#46566c'; ctx.lineWidth = 1; ctx.stroke();
    const eg = 0.5 + 0.4 * Math.sin(t * 9);
    for (let k = -1; k <= 1; k++) {
      const ey = cy + k * u * 0.92;
      ctx.fillStyle = '#11161f'; roundRect(ctx, hx0 - u * 2.0, ey - u * 0.3, u * 0.55, u * 0.6, u * 0.18); ctx.fill();
      const g = ctx.createRadialGradient(hx0 - u * 2.1, ey, 0, hx0 - u * 2.1, ey, u * 1.4);
      g.addColorStop(0, 'rgba(120,190,255,' + eg + ')'); g.addColorStop(1, 'transparent');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(hx0 - u * 2.2, ey, u * 1.3, 0, TAU); ctx.fill();
    }
  }
  function drawBridge(ctx, hx1, cy, u, t) {
    const bx = hx1 - u * 0.2, bw = u * 1.9, bh = u * 1.7;
    const bg = ctx.createLinearGradient(0, cy - bh, 0, cy + bh);
    bg.addColorStop(0, '#9aa6b4'); bg.addColorStop(1, '#3f4a58');
    ctx.fillStyle = bg; roundRect(ctx, bx, cy - bh / 2, bw, bh, u * 0.3); ctx.fill();
    ctx.strokeStyle = '#b9c4d0'; ctx.lineWidth = 1; ctx.stroke();
    // forward nose taper
    ctx.fillStyle = bg; ctx.beginPath(); ctx.moveTo(bx + bw - 1, cy - bh * 0.34); ctx.lineTo(bx + bw + u * 1.7, cy); ctx.lineTo(bx + bw - 1, cy + bh * 0.34); ctx.closePath(); ctx.fill(); ctx.stroke();
    // raised bridge tower
    ctx.fillStyle = '#828e9c'; roundRect(ctx, bx + u * 0.45, cy - bh / 2 - u * 0.9, u * 1.0, u * 1.0, u * 0.18); ctx.fill();
    ctx.strokeStyle = '#aab4c0'; ctx.stroke();
    // blue trim + windows
    ctx.fillStyle = '#3fa7ff'; ctx.fillRect(bx, cy - bh * 0.16, bw + u * 1.3, u * 0.13);
    ctx.fillStyle = 'rgba(150,220,255,' + (0.6 + 0.4 * Math.sin(t * 3)) + ')';
    for (let i = 0; i < 3; i++) { ctx.fillRect(bx + u * 0.55 + i * u * 0.38, cy - bh / 2 - u * 0.55, u * 0.24, u * 0.4); }
    // nose light
    ctx.fillStyle = (Math.sin(t * 4) > 0) ? '#ff7a7a' : 'rgba(255,120,120,0.3)';
    ctx.beginPath(); ctx.arc(bx + bw + u * 1.55, cy, u * 0.16, 0, TAU); ctx.fill();
  }
  function drawShip(ctx, cx, cy, u, loadout, t, opts) {
    opts = opts || {}; loadout = loadout || [];
    const hull = opts.hull == null ? 100 : opts.hull, fires = opts.fires || 0;
    const hh = u * 1.05, top = cy - hh, bot = cy + hh;
    const hx0 = cx - u * 3.8, hx1 = cx + u * 3.4;
    drawEngines(ctx, hx0, cy, u, t);
    // hull body
    const hg = ctx.createLinearGradient(0, top, 0, bot);
    hg.addColorStop(0, '#aab4c0'); hg.addColorStop(0.45, '#7a8696'); hg.addColorStop(1, '#3f4956');
    ctx.fillStyle = hg; roundRect(ctx, hx0, top, hx1 - hx0, hh * 2, u * 0.32); ctx.fill();
    ctx.strokeStyle = '#b9c4d0'; ctx.lineWidth = 1; ctx.stroke();
    ctx.strokeStyle = 'rgba(38,50,66,0.4)'; ctx.lineWidth = 1;
    for (let i = 1; i < 8; i++) { const px = hx0 + (hx1 - hx0) * i / 8; ctx.beginPath(); ctx.moveTo(px, top + 2); ctx.lineTo(px, bot - 2); ctx.stroke(); }
    ctx.fillStyle = 'rgba(38,50,66,0.45)'; ctx.fillRect(hx0 + u * 0.2, cy + hh * 0.4, hx1 - hx0 - u * 0.4, u * 0.16);
    ctx.fillStyle = '#2c3542'; ctx.fillRect(cx - u * 1.2, bot - 1, u * 0.5, u * 0.7); ctx.fillRect(cx + u * 0.9, bot - 1, u * 0.5, u * 0.7);
    // container row on top of the hull
    const n = loadout.length || 6, cx0 = hx0 + u * 0.5, cx1 = hx1 - u * 0.5, slotW = (cx1 - cx0) / n;
    for (let i = 0; i < n; i++) { drawPod(ctx, cx0 + slotW * (i + 0.5), top, slotW, u, loadout[i], i, t); }
    drawBridge(ctx, hx1, cy, u, t);
    // damage fire/smoke
    const burn = fires + (hull < 60 ? 1 : 0) + (hull < 35 ? 1 : 0);
    for (let i = 0; i < burn; i++) {
      const fx = cx0 + (cx1 - cx0) * ((i * 0.37) % 1), fy = cy + (i % 2 ? 1 : -1) * u * 0.5;
      const fl = 0.5 + 0.5 * Math.sin(t * 18 + i * 2);
      ctx.fillStyle = 'rgba(120,130,150,0.4)'; ctx.beginPath(); ctx.arc(fx, fy - u * 0.6, u * 0.4 + fl * u * 0.2, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,' + (120 + fl * 80 | 0) + ',40,' + (0.6 + fl * 0.3) + ')';
      ctx.beginPath(); ctx.arc(fx, fy, u * 0.3 + fl * u * 0.25, 0, TAU); ctx.fill();
    }
  }

  function drawPreviewScene(canvas, dt) {
    const ctx = canvas.getContext ? canvas.getContext('2d') : null; if (!ctx) { return; }
    const w = canvas.width = canvas.clientWidth || 600, h = canvas.height = canvas.clientHeight || 320;
    const bg = ctx.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, '#070d1c'); bg.addColorStop(1, '#04060f');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#9fc0ff';
    stars.forEach(s => { s.x -= s.z * 0.02 * dt; if (s.x < 0) { s.x += 1; s.y = Math.random(); } ctx.globalAlpha = 0.25 + s.z * 0.6; ctx.fillRect(s.x * w, s.y * h, s.z * 1.7, s.z * 1.7); });
    ctx.globalAlpha = 1;
    const u = Math.min(w * 0.072, (h * 0.5 - 16) / 2.9);
    drawShip(ctx, w * 0.5, h * 0.5, u, META.loadout, previewT, { hull: 100, fires: 0 });
  }

  // ================================================================ screens
  function showScreen(name) {
    screen = name;
    ['intro', 'home', 'contracts', 'outfit', 'shipyard', 'debrief'].forEach(s => $(s).classList.toggle('hidden', s !== name));
    $('app').classList.toggle('hidden', name !== 'mission');
    if (name === 'home') { renderHome(); }
    else if (name === 'contracts') { renderContracts(); }
    else if (name === 'outfit') { renderOutfit(); }
    else if (name === 'shipyard') { renderShipyard(); }
  }
  function updateCreditsUI() {
    if ($('homeCredits')) { $('homeCredits').textContent = fmt(META.credits); }
    document.querySelectorAll('.creditsTxt').forEach(e => { e.textContent = fmt(META.credits); });
  }
  function renderHome() {
    updateCreditsUI();
    const c = loadoutCounts();
    $('homeLoadout').innerHTML = MODULE_ORDER.map(t => {
      const m = MODULES[t];
      return '<div class="lo-chip"><span class="lo-ico" style="color:' + m.color + '">' + m.ico + '</span>' + m.name.replace(' POD', '') + ' <span class="lo-n">×' + c[t] + '</span></div>';
    }).join('') + '<div class="lo-chip">HARDPOINTS <span class="lo-n">' + META.loadout.filter(Boolean).length + ' / ' + hardpoints() + '</span></div>';
    const ct = currentContract();
    $('homeContract').innerHTML = ct ?
      '<div class="hc-route">ZHEN-9 → ' + ct.to + '</div>' +
      '<div class="hc-meta"><span>' + ct.dist + ' HAUL</span><span class="ct-danger dg' + ct.danger + '">' + DANGER_LABEL[ct.danger] + '</span><span>~' + ct.duration + 's</span></div>' +
      '<div class="hc-reward">' + fmt(ct.reward) + ' ◎ <span style="font-size:11px;color:var(--ink-faint)">fee</span></div>'
      : '<div class="none">No contract selected — visit the Contract Board.</div>';
    $('homeStats').innerHTML =
      '<div class="hs"><span>Crew rating</span><b>' + CREW_TIERS[META.crewTier] + '</b></div>' +
      '<div class="hs"><span>Runs completed</span><b>' + META.stats.wins + ' / ' + META.stats.runs + '</b></div>' +
      '<div class="hs"><span>Total earned</span><b>' + fmt(META.stats.earned) + ' ◎</b></div>';
    $('homeLaunch').disabled = !ct;
  }
  function renderContracts() {
    updateCreditsUI();
    if (!META.contracts) { genContracts(); }
    $('contractList').innerHTML = META.contracts.map(c => {
      const sel = c.id === META.contractId;
      return '<div class="contract' + (sel ? ' selected' : '') + '" data-cid="' + c.id + '">' +
        '<div class="ct-route">ZHEN-9 → ' + c.to + '</div>' +
        '<div class="ct-dist">' + c.dist + ' HAUL · ~' + c.duration + 's run</div>' +
        '<div class="ct-row"><span>Pirate danger</span><span class="ct-danger dg' + c.danger + '">' + DANGER_LABEL[c.danger] + '</span></div>' +
        '<div class="ct-row"><span>Contract fee</span><span class="ct-reward">' + fmt(c.reward) + ' ◎</span></div>' +
        '<div class="ct-pick">' + (sel ? '✓ SELECTED' : 'CLICK TO SELECT') + '</div></div>';
    }).join('');
    $('contractList').querySelectorAll('.contract').forEach(el => {
      el.onclick = () => { META.contractId = el.getAttribute('data-cid'); saveMeta(); renderContracts(); };
    });
  }
  function renderOutfit() {
    updateCreditsUI(); normalizeMeta();
    $('outfitSlotsTxt').textContent = META.loadout.filter(Boolean).length + ' / ' + hardpoints() + ' USED';
    $('hardpointList').innerHTML = META.loadout.map((m, i) => {
      const mod = m ? MODULES[m] : null;
      return '<div class="hp-slot" data-slot="' + i + '"><span class="hp-n">' + (i + 1) + '</span>' +
        '<span class="hp-ico" style="color:' + (mod ? mod.color : '#5a7090') + '">' + (mod ? mod.ico : '○') + '</span>' +
        '<span class="hp-name' + (mod ? '' : ' hp-empty') + '">' + (mod ? mod.name : '— empty —') + '</span>' +
        '<span class="hp-n">⟲</span></div>';
    }).join('');
    $('hardpointList').querySelectorAll('.hp-slot').forEach(el => { el.onclick = () => cycleSlot(+el.getAttribute('data-slot')); });
    $('inventoryList').innerHTML = MODULE_ORDER.map(t => {
      const m = MODULES[t], owned = META.inventory[t] || 0, used = installedCount(t);
      return '<div class="inv-row"><span class="iv-ico" style="color:' + m.color + '">' + m.ico + '</span>' +
        '<span class="iv-name">' + m.name + '</span><span class="iv-n"><b>' + (owned - used) + '</b> free / ' + owned + ' owned</span></div>';
    }).join('');
  }
  function cycleSlot(i) {
    const cur = META.loadout[i];
    const avail = MODULE_ORDER.filter(t => (META.inventory[t] || 0) - installedCount(t) > 0 || t === cur);
    const opts = [null, ...avail];
    let idx = opts.indexOf(cur); idx = (idx + 1) % opts.length;
    META.loadout[i] = opts[idx]; saveMeta(); renderOutfit();
  }
  function shopRow(ico, name, desc, lvl, price, enabled, act, maxed) {
    return '<div class="shop-item' + (maxed ? ' maxed' : '') + '"><span class="si-ico">' + ico + '</span>' +
      '<div class="si-main"><div class="si-name">' + name + '</div><div class="si-desc">' + desc + '</div><div class="si-lvl">' + lvl + '</div></div>' +
      (maxed ? '<button disabled>' + price + '</button>' : '<button data-shop="' + act + '"' + (enabled ? '' : ' disabled') + '>' + price + '</button>') + '</div>';
  }
  function renderShipyard() {
    updateCreditsUI();
    $('shopModules').innerHTML = MODULE_ORDER.map(t => {
      const m = MODULES[t];
      return shopRow(m.ico, m.name, m.desc, 'OWN ' + (META.inventory[t] || 0), fmt(m.cost) + ' ◎', META.credits >= m.cost, 'buymod:' + t, false);
    }).join('');
    $('shopUpgrades').innerHTML = UPGRADE_DEFS.map(u => {
      const lvl = META.upgrades[u.key], maxed = lvl >= u.max, cost = u.cost(lvl);
      return shopRow(u.ico, u.name, u.desc, 'LVL ' + lvl + ' / ' + u.max, maxed ? 'MAX' : fmt(cost) + ' ◎', META.credits >= cost, 'buyupg:' + u.key, maxed);
    }).join('');
    const tier = META.crewTier, maxed = tier >= CREW_TIERS.length - 1, cost = crewCost(tier);
    $('shopCrew').innerHTML = shopRow('★', 'Crew Rating: ' + CREW_TIERS[tier],
      'Faster repair, fighting and healing.', 'TIER ' + (tier + 1) + ' / ' + CREW_TIERS.length,
      maxed ? 'MAX' : fmt(cost) + ' ◎', META.credits >= cost, 'hirecrew', maxed);
    document.querySelectorAll('#shipyard [data-shop]').forEach(btn => { btn.onclick = () => buyAction(btn.getAttribute('data-shop')); });
  }
  function buyAction(a) {
    if (a === 'hirecrew') {
      const cost = crewCost(META.crewTier);
      if (META.credits >= cost && META.crewTier < CREW_TIERS.length - 1) { META.credits -= cost; META.crewTier++; }
    } else if (a.indexOf('buymod:') === 0) {
      const t = a.split(':')[1], cost = MODULES[t].cost;
      if (META.credits >= cost) { META.credits -= cost; META.inventory[t] = (META.inventory[t] || 0) + 1; }
    } else if (a.indexOf('buyupg:') === 0) {
      const k = a.split(':')[1], u = UPGRADE_DEFS.find(x => x.key === k), lvl = META.upgrades[k];
      if (lvl < u.max) { const cost = u.cost(lvl); if (META.credits >= cost) { META.credits -= cost; META.upgrades[k]++; if (k === 'hardpoint') { normalizeMeta(); } } }
    }
    saveMeta(); renderShipyard();
  }

  // ---------------------------------------------------------------- launch / debrief
  function launchMission() {
    const contract = currentContract(); if (!contract) { return; }
    normalizeMeta();
    const counts = loadoutCounts(), up = META.upgrades;
    const cargo = [];
    for (let i = 0; i < counts.cargo; i++) {
      const g = CARGO_DEFS[i % CARGO_DEFS.length];
      cargo.push({ ico: g.ico, name: g.name, value: Math.round(MODULES.cargo.value * rand(0.85, 1.15)) });
    }
    const bonus = {
      weapon: 1 + up.weapon * 0.12 + counts.military * MODULES.military.weapon,
      shield: 1 + up.shield * 0.12 + counts.shield * MODULES.shield.shield,
      engine: 1 + up.engine * 0.12,
      hull: 1 / (1 + up.hull * 0.12),
      pdef: counts.military * MODULES.military.pdef,
      reactorCap: 153 + up.reactor * 12,
    };
    const cfg = {
      duration: contract.duration, danger: contract.danger, cargo,
      paxCount: counts.passenger * MODULES.passenger.pax, bonus,
      crewSkill: 0.85 + META.crewTier * 0.08, crewBonus: Math.floor(META.crewTier / 2),
      milPods: counts.military, contract,
    };
    S = newState(cfg);
    S.loadout = META.loadout.slice();
    logEvent('good', 'All systems nominal'); logEvent('info', 'Departed Zhen-9 — bound for ' + contract.to);
    logEvent('info', counts.cargo + ' cargo · ' + counts.passenger + ' passenger · ' + counts.military + ' military pods aboard');
    logEvent('warn', 'Route danger: ' + DANGER_LABEL[contract.danger] + ' — pirates likely');
    comms('info', 'DEPARTING ZHEN-9 → ' + contract.to.toUpperCase()); comms('good', 'ALL SYSTEMS NOMINAL'); comms('warn', 'ROUTE DANGER: ' + DANGER_LABEL[contract.danger]);
    if (!R.captain) { buildUI(); } else { buildCargo(); buildPax(); }
    showScreen('mission');
    last = performance.now(); simAcc = 0;
  }

  function endGame(win, title, sub) {
    if (S.over) { return; }
    S.over = true; S.running = false;
    const ci = cargoIntegrity(), paxAlive = S.pax.filter(p => p !== 'dead').length, c = S.contract;
    const lines = [];
    const fee = Math.round(c.reward * (win ? 1 : 0.25));
    let pay = fee; lines.push(['Contract fee' + (win ? '' : ' (partial)'), fee]);
    if (S.cargo.length) { const cb = Math.round(S.cargoValue * ci / 100 * 0.05); pay += cb; lines.push(['Cargo delivered (' + Math.round(ci) + '%)', cb]); }
    if (S.pax.length) { const pb = paxAlive * 450; pay += pb; lines.push(['Passenger fares (' + paxAlive + ')', pb]); }
    if (S.milPods && win) { const mb = S.milPods * 9000; pay += mb; lines.push(['Military escort bonus', mb]); }
    if (S.killed) { const pen = S.killed * 1200; pay -= pen; lines.push(['Crew benefits paid', -pen]); }
    pay = Math.max(0, pay);
    META.credits += pay; META.stats.runs++; if (win) { META.stats.wins++; } META.stats.earned += pay;
    saveMeta();
    $('debriefTitle').textContent = title; $('debriefTitle').style.color = win ? 'var(--green)' : 'var(--red)';
    $('debriefSub').textContent = sub;
    $('debriefStats').innerHTML =
      lines.map(l => row(l[0], (l[1] < 0 ? '−' : '+') + fmt(Math.abs(l[1])) + ' ◎')).join('') +
      '<div class="rs" style="border-top:1px solid rgba(120,160,220,.3);margin-top:4px;padding-top:6px"><span>NET PAYOUT</span><b style="color:var(--green)">+' + fmt(pay) + ' ◎</b></div>' +
      row('Hull integrity', Math.round(S.hull) + '%') +
      row('Crew lost', S.killed + ' killed, ' + S.injured + ' injured') +
      (S.pax.length ? row('Passengers', paxAlive + ' / ' + S.pax.length + ' survived') : '');
    showScreen('debrief');
    function row(k, v) { return '<div class="rs"><span>' + k + '</span><b>' + v + '</b></div>'; }
  }

  // ---------------------------------------------------------------- loop
  let last = 0, simAcc = 0, previewT = 0;
  function frame(now) {
    const realDt = Math.min(0.05, (now - last) / 1000) || 0;
    last = now; previewT += realDt;
    if (screen === 'mission' && S) {
      const dt = realDt * S.speed;
      simAcc += dt;
      while (simAcc >= 0.1) { sim(0.1); simAcc -= 0.1; }
      drawExt(realDt * (S.running ? S.speed : 0.3));
      render();
    } else if (screen === 'home') { drawPreviewScene($('homeShip'), realDt); }
    else if (screen === 'outfit') { drawPreviewScene($('outfitShip'), realDt); }
    requestAnimationFrame(frame);
  }

  // ---------------------------------------------------------------- boot
  function boot() {
    loadMeta();
    initStars();
    document.querySelectorAll('[data-screen]').forEach(b => { b.onclick = () => showScreen(b.getAttribute('data-screen')); });
    $('introBtn').onclick = () => { META.seenIntro = true; saveMeta(); showScreen('home'); };
    $('homeLaunch').onclick = launchMission;
    $('debriefHome').onclick = () => { genContracts(); showScreen('home'); };
    if (META.seenIntro) { showScreen('home'); }
    else { screen = 'intro'; $('intro').classList.remove('hidden'); }
    last = performance.now();
    requestAnimationFrame(frame);
  }
  boot();
})();
