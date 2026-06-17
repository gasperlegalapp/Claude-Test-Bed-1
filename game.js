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
  const TOTAL_SECURITY = 4;         // pool of security personnel (saboteurs, boarders)
  const TRAVEL_TIME = 4;            // sim-seconds for crew to reach a compartment
  const THREAT_LABEL = ['STANDBY', 'LOW', 'GUARDED', 'ELEVATED', 'SEVERE', 'HORDE'];

  // power systems (reactor is the generator; the rest draw from it)
  const SYS_DEFS = [
    { key: 'reactor', label: 'REACTOR',      icon: '⚛', base: 0,  power: 120, min: 60, max: 153 },
    { key: 'shields', label: 'SHIELDS',      icon: '⛨', base: 30, power: 145, min: 0,  max: 150 },
    { key: 'engines', label: 'ENGINES',      icon: '⏚', base: 21, power: 110, min: 0,  max: 150 },
    { key: 'weapons', label: 'WEAPONS',      icon: '⚔', base: 17, power: 95,  min: 0,  max: 150 },
    { key: 'sensors', label: 'SENSORS',      icon: '◉', base: 11, power: 85,  min: 0,  max: 150 },
    { key: 'life',    label: 'LIFE SUPPORT', icon: '❂', base: 14, power: 100, min: 0,  max: 150 },
  ];

  // ship compartments on a 6x3 deck grid. Each has crew stations that, when
  // manned, boost that compartment's function — pull crew away and it sags.
  const ROOM_DEFS = [
    { key: 'engines',  label: 'ENGINES',          gc: '1',     gr: '1 / 4', sys: 'engines', stations: 2, fn: 'THRUST CONTROL', fdesc: 'evasion vs incoming fire' },
    { key: 'reactor',  label: 'REACTOR',          gc: '2',     gr: '1 / 3', sys: 'reactor', stations: 2, fn: 'REACTOR CONTROL', fdesc: 'safe output & cooling' },
    { key: 'life',     label: 'LIFE SUPPORT',     gc: '3',     gr: '1',     sys: 'life',    stations: 2, fn: 'ATMOSPHERICS',    fdesc: 'keeps crew & passengers alive' },
    { key: 'pax',      label: 'PASSENGER DECK',   gc: '4 / 6', gr: '1',     sys: null,      stations: 2, fn: 'STEWARDS',       fdesc: 'calms passenger panic', pax: true },
    { key: 'bridge',   label: 'BRIDGE',           gc: '6',     gr: '1 / 4', sys: null,      stations: 3, fn: 'COMMAND',        fdesc: 'ship-wide coordination bonus' },
    { key: 'shieldgen',label: 'SHIELD GENERATOR', gc: '3 / 6', gr: '2',     sys: 'shields', stations: 2, fn: 'SHIELD OPS',     fdesc: 'shield strength & regen' },
    { key: 'weapons',  label: 'WEAPONS DECK',     gc: '2',     gr: '3',     sys: 'weapons', stations: 2, fn: 'GUNNERY',        fdesc: 'raider kill rate' },
    { key: 'sensors',  label: 'SENSORS ARRAY',    gc: '3',     gr: '3',     sys: 'sensors', stations: 1, fn: 'SENSOR OPS',     fdesc: 'point-defense accuracy' },
    { key: 'medbay',   label: 'MED BAY',          gc: '4 / 6', gr: '3',     sys: null,      stations: 2, fn: 'MEDICAL',        fdesc: 'heals injured, prevents deaths', med: true },
  ];
  // each hardpoint becomes its own pod compartment (built per mission from the
  // loadout); these render in the pod strip below the deck grid, not in it.
  const POD_DEFS = {
    cargo:     { label: 'CARGO POD',     fn: 'CARGO HOLD', fdesc: 'houses freight — repair the pod to protect its cargo', role: 'cargo',     stations: 1, flex: 1.4 },
    passenger: { label: 'PASSENGER POD', fn: 'BERTHS',     fdesc: 'passenger berths bolted to the hull',                  role: 'passenger', stations: 0, flex: 1.2 },
    military:  { label: 'TURRET POD',    fn: 'GUNNERY',    fdesc: 'serves the guns — keep it intact for full firepower',  role: 'turret',    stations: 1, flex: 1.1 },
    shield:    { label: 'SHIELD POD',    fn: 'EMITTERS',   fdesc: 'aux shield emitters — keep it intact for full shields', role: 'shield',    stations: 1, flex: 1.0 },
  };
  // staffing priority when auto-distributing scarce crew at mission start
  // (lower = filled first); pods and anything unlisted come last
  const STAFF_PRIO = { reactor: 1, life: 2, engines: 3, shieldgen: 4, weapons: 5, sensors: 6, bridge: 7, medbay: 8, pax: 9 };

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

  // Helm flight postures — each is a tradeoff, read by the sim
  const POSTURE_DEFS = [
    { key: 'steady',  name: 'STEADY BURN',     desc: 'Balanced. Stable systems, steady arrival.' },
    { key: 'evasive', name: 'EVASIVE PATTERN', desc: '+25% to dodge incoming fire, but repairs are slower and passengers rattle.' },
    { key: 'silent',  name: 'SILENT RUNNING',  desc: 'Raiders find you less often, but shields & sensors run weak.' },
    { key: 'burn',    name: 'EMERGENCY BURN',  desc: 'Arrive sooner, but reactor heat climbs fast and cargo takes a beating.' },
  ];
  // Executive (captain-level) orders — irreversible, heavy. Each returns a result.
  const EXEC_DEFS = [
    { key: 'jettison', name: 'JETTISON CARGO',     ico: '📦', danger: true,  desc: 'Dump all freight to lighten the ship and break missile locks.', confirm: 'All cargo is jettisoned. Contract cargo value is lost, but the ship lightens and incoming missiles lose their lock.' },
    { key: 'seal',     name: 'SEAL COMPARTMENTS',  ico: '🔒', danger: false, desc: 'Seal every burning or breached compartment to contain the damage.', confirm: 'All damaged compartments are sealed. Fires and breaches stop spreading, but crew inside are locked in.' },
    { key: 'overload', name: 'OVERLOAD REACTOR',   ico: '⚛', danger: true,  desc: 'Force maximum output for a burst of power. Risks reactor damage.', confirm: 'Reactor forced to maximum. +30 MW and a big shield surge for 25s — but reactor heat spikes and the core may be damaged.' },
    { key: 'distress', name: 'BROADCAST DISTRESS', ico: '📡', danger: false, desc: 'Call for help. May ease the assault — or draw more attention.', confirm: 'A distress call goes out. It may thin the current raiders — but it also broadcasts your position.' },
    { key: 'divert',   name: 'CHANGE DESTINATION', ico: '⛯', danger: false, desc: 'Divert to the nearest port. Arrive much sooner at a reduced payout.', confirm: 'Divert to the nearest port. You arrive far sooner, but the contract bonus is cut.' },
    { key: 'surrender',name: 'SURRENDER',          ico: '🏳', danger: true,  desc: 'Stand down. Pirates take the cargo; crew and passengers likely survive.', confirm: 'You surrender. Raiders strip the cargo and leave. The run ends here — crew and passengers survive, but you forfeit the contract.' },
  ];

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
      coachTips: true,
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
  let station = 'captain';   // active command station (mission view)
  let execPending = null;    // executive order awaiting confirmation
  function newState(cfg) {
    cfg = cfg || {};
    const bonus = cfg.bonus || { weapon: 1, shield: 1, engine: 1, hull: 1, pdef: 0, reactorCap: 153 };
    const crewBonus = cfg.crewBonus || 0; // extra crew per department from tier
    const sys = {};
    SYS_DEFS.forEach(d => { sys[d.key] = { ...d, power: d.power, max: d.key === 'reactor' ? bonus.reactorCap : d.max }; });
    const rooms = ROOM_DEFS.map(d => ({
      ...d, status: 'normal', health: 100, fire: false, breach: false, sealed: false,
      crew: 0, crewMax: d.stations,
      repairTechs: 0, repairState: 'idle', repairEta: 0, // idle | enroute | working
      securityTechs: 0, secState: 'idle', secEta: 0, sweep: 0,
      leak: 0, boarders: false, juryCd: 0,
      inactive: false, bayRole: null,
    }));
    // one pod compartment per hardpoint, typed from the loadout
    const loadout = cfg.loadout || [];
    const seen = {};
    loadout.forEach((type, i) => {
      const pd = type ? POD_DEFS[type] : null;
      seen[type] = (seen[type] || 0) + 1;
      const dupes = loadout.filter(x => x === type).length;
      const suffix = (pd && dupes > 1) ? ' ' + String.fromCharCode(64 + seen[type]) : '';
      rooms.push({
        key: 'pod' + i, hardpoint: true, podIndex: i,
        label: pd ? pd.label + suffix : 'HARDPOINT ' + (i + 1),
        fn: pd ? pd.fn : 'EMPTY MOUNT',
        fdesc: pd ? pd.fdesc : 'no pod installed on this mount',
        bayRole: pd ? pd.role : 'empty',
        cargoBay: type === 'cargo',
        podType: type || null,
        flex: pd ? pd.flex : 0.7,
        sys: null, stations: pd ? pd.stations : 0,
        status: 'normal', health: 100, fire: false, breach: false, sealed: false,
        crew: 0, crewMax: pd ? pd.stations : 0,
        repairTechs: 0, repairState: 'idle', repairEta: 0,
        securityTechs: 0, secState: 'idle', secEta: 0, sweep: 0,
        leak: 0, boarders: false, juryCd: 0, inactive: !pd,
      });
    });
    // ---- scarce crew: ~75% of stations are staffed; player triages the rest ----
    const opRooms = rooms.filter(r => r.stations > 0);
    const totalStations = opRooms.reduce((a, r) => a + r.stations, 0);
    const crewBudget = Math.max(opRooms.length, Math.round(totalStations * 0.75) + crewBonus);
    const staffOrder = opRooms.slice().sort((a, b) => (STAFF_PRIO[a.key] || 20) - (STAFF_PRIO[b.key] || 20));
    let pool = crewBudget;
    const idleReserve = Math.min(2, pool); pool -= idleReserve; // keep a small flex pool spare
    let progressed = true;
    while (pool > 0 && progressed) {
      progressed = false;
      for (const r of staffOrder) { if (pool <= 0) { break; } if (r.crew < r.stations) { r.crew++; pool--; progressed = true; } }
    }
    const startIdle = idleReserve + pool; // leftover (if every station somehow filled)
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
      bonus, pods: cfg.pods || { weapon: 0, shield: 0, pdef: 0 },
      crewSkill: cfg.crewSkill || 1, contract: cfg.contract || null,
      cargoValue: cargo.reduce((a, c) => a + c.value, 0),
      milPods: cfg.milPods || 0,
      hull: 100,
      shieldPool: 0,
      pressure: 0,
      threat: 0,
      attackers: 0,
      reserve: 0, brownout: false,
      captain: { name: 'LT. K. DRAVEN', role: 'CAPTAIN', health: 100, morale: 'High' },
      crewIdle: startIdle, crewCap: crewBudget, openRoom: null,
      repairPool: TOTAL_TECHS, securityPool: TOTAL_SECURITY,
      sabotage: null, field: null, radiation: 0, eventTimer: INTRO + rand(8, 14),
      nudged: {}, coach: null, posture: 'steady', heat: 20,
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
  function secIcons(n) { let s = '<span class="techicons">'; for (let i = 0; i < n; i++) { s += '<i class="secic">🛡</i>'; } return s + '</span>'; }

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
      if (b) { releaseRoom(b.getAttribute('data-release')); return; }
      const s = e.target.closest('[data-srelease]');
      if (s) { releaseSecurity(s.getAttribute('data-srelease')); }
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
    S.rooms.filter(rm => !rm.hardpoint).forEach(rm => {
      const el = document.createElement('div');
      el.className = 'room ' + rm.status;
      el.style.gridColumn = rm.gc; el.style.gridRow = rm.gr;
      el.innerHTML =
        '<div><div class="room-name">' + rm.label + '</div>' +
        '<div class="room-stat"></div></div>' +
        '<div class="crewdots"></div><div class="badge"></div>';
      el.addEventListener('click', () => openRoom(rm.key));
      sc.appendChild(el);
      R.rooms[rm.key] = { el, stat: el.querySelector('.room-stat'), name: el.querySelector('.room-name'),
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
    $('coachDismiss').onclick = () => { if (S) { S.coach = null; } };

    // station tabs + hotkeys
    document.querySelectorAll('#stationTabs button').forEach(b => { b.onclick = () => setStation(b.getAttribute('data-station')); });
    window.addEventListener('keydown', e => {
      if (screen !== 'mission') { return; }
      const map = { F1: 'captain', F2: 'tactical', F3: 'helm', F4: 'engineering', F5: 'operations', F6: 'executive' };
      if (map[e.key]) { e.preventDefault(); setStation(map[e.key]); }
    });
    buildStations();

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
      else if (act === 'jury') { juryRig(key); }
      else if (act === 'sec+') { assignSecurity(key, +1); }
      else if (act === 'sec-') { assignSecurity(key, -1); }
      else if (act === 'secrelease') { releaseSecurity(key); }
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
  function mannedBoost(rm) {
    if (!rm || !rm.stations) { return 1; }            // no stations needed → no penalty
    return 0.35 + 0.65 * Math.sqrt(mannedFrac(rm));   // empty 0.35x, 1 person ~most of the way, full 1x
  }
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
      if (key === 'shields') { e *= S.bonus.shield + (S.pods ? S.pods.shield * bayCond('shield') : 0); }
      else if (key === 'weapons') { e *= S.bonus.weapon + (S.pods ? S.pods.weapon * bayCond('turret') : 0); }
      else if (key === 'engines') { e *= S.bonus.engine; }
    }
    if (S.radiation > 0 && (key === 'shields' || key === 'sensors')) { e *= 0.7; } // ion surge scrambles them
    if (S.posture === 'silent' && (key === 'shields' || key === 'sensors')) { e *= 0.7; } // running dark
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
  // condition of the pod bays of a given role (0..1) — drives cargo integrity
  // and the firepower/shield contributed by military/shield pods
  function bayCond(role) {
    const bays = S.rooms.filter(r => r.bayRole === role && !r.inactive);
    if (!bays.length) { return 1; }
    return clamp(bays.reduce((a, b) => a + b.health, 0) / bays.length / 100, 0, 1);
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
  function assignSecurity(roomKey, d) {
    if (S.over) { return; }
    const rm = roomByKey(roomKey);
    if (d > 0) {
      if (S.securityPool <= 0) { return; }
      S.securityPool--; rm.securityTechs++;
      if (rm.secState === 'idle') { rm.secState = 'enroute'; rm.secEta = TRAVEL_TIME; rm.sweep = 0; }
      if (rm.securityTechs === 1) { logEvent('info', 'Security detail dispatched to ' + rm.label + ' (en route)'); comms('info', 'SECURITY → ' + rm.label); }
    } else {
      if (rm.securityTechs <= 0) { return; }
      rm.securityTechs--; S.securityPool++;
      if (rm.securityTechs === 0) { rm.secState = 'idle'; rm.secEta = 0; rm.sweep = 0; }
    }
  }
  function releaseSecurity(roomKey) {
    const rm = roomByKey(roomKey);
    if (rm.securityTechs > 0) {
      S.securityPool += rm.securityTechs; rm.securityTechs = 0; rm.secState = 'idle'; rm.secEta = 0; rm.sweep = 0;
      logEvent('info', 'Security detail released from ' + rm.label);
    }
  }
  function juryRig(roomKey) {
    if (S.over) { return; }
    const rm = roomByKey(roomKey);
    if (rm.juryCd > 0 || (rm.health >= 80 && rm.leak <= 0)) { return; }
    rm.health = clamp(Math.max(rm.health, rm.health + 45), 0, 80); // fast stopgap, never full
    rm.leak = 0; rm.juryCd = 22;
    logEvent('good', 'Jury-rigged ' + rm.label + ' — temporary patch holding'); comms('warn', 'JURY-RIG — ' + rm.label);
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

  // ---------------------------------------------------------------- command stations
  function setStation(name) {
    station = name;
    document.querySelectorAll('#stationTabs button').forEach(b => b.classList.toggle('active', b.getAttribute('data-station') === name));
    document.querySelectorAll('#stations .station').forEach(s => s.classList.toggle('hidden', s.getAttribute('data-station') !== name));
    if (S && screen === 'mission') { renderStation(); }
  }
  function setPosture(key) {
    if (!S || S.over || S.posture === key) { return; }
    S.posture = key;
    const def = POSTURE_DEFS.find(p => p.key === key);
    logEvent('info', 'Helm posture: ' + def.name); comms('info', 'HELM — ' + def.name);
  }
  function execOrder(key) {
    if (!S || S.over) { return; }
    const def = EXEC_DEFS.find(d => d.key === key); if (!def) { return; }
    execPending = key;
    $('execConfirmTitle').textContent = 'EXECUTIVE ORDER: ' + def.name;
    $('execConfirmBody').textContent = def.confirm;
    $('execConfirm').classList.remove('hidden');
  }
  function execCommit() {
    const key = execPending; execPending = null;
    $('execConfirm').classList.add('hidden');
    if (!S || S.over || !key) { return; }
    if (key === 'jettison') {
      S.cargo = []; S.cargoValue = 0; buildCargo(); S.attackers = Math.max(0, S.attackers - 2);
      logEvent('bad', 'Cargo jettisoned — holds blown clear'); comms('bad', '⚠ CARGO JETTISONED');
    } else if (key === 'seal') {
      let n = 0; S.rooms.forEach(r => { if ((r.fire || r.breach) && !r.sealed) { r.sealed = true; n++; } });
      logEvent('good', 'Sealed ' + n + ' compartment(s) — damage contained'); comms('warn', 'COMPARTMENTS SEALED');
    } else if (key === 'overload') {
      S.buffs.power = 25; S.sys.reactor.power = S.sys.reactor.max; S.shieldPool += 60; S.heat = clamp(S.heat + 35, 0, 100);
      logEvent('good', 'REACTOR OVERLOAD — power surging'); comms('bad', '⚛ REACTOR OVERLOAD');
    } else if (key === 'distress') {
      S.attackers = Math.max(0, Math.round(S.attackers * 0.5));
      logEvent('info', 'Distress beacon broadcast'); comms('warn', '📡 DISTRESS BEACON');
    } else if (key === 'divert') {
      S.divert = true; S.duration = Math.min(S.duration, S.t + 25);
      logEvent('warn', 'Diverting to nearest port — payout reduced'); comms('warn', 'DIVERTING TO NEAREST PORT');
    } else if (key === 'surrender') {
      endGame(false, 'SURRENDERED', 'You stood down. Raiders stripped the hold and withdrew — crew and passengers survived, but the contract is forfeit.');
    }
  }
  function buildStations() {
    const eg = $('execGrid'); eg.innerHTML = '';
    EXEC_DEFS.forEach(d => {
      const b = document.createElement('button');
      b.className = 'exec-card' + (d.danger ? ' danger' : '');
      b.innerHTML = '<span class="ec-ico">' + d.ico + '</span><b>' + d.name + '</b><span class="ec-desc">' + d.desc + '</span>';
      b.onclick = () => execOrder(d.key);
      eg.appendChild(b);
    });
    $('execCancel').onclick = () => { execPending = null; $('execConfirm').classList.add('hidden'); };
    $('execGo').onclick = execCommit;
    const hp = $('helmPostures'); hp.innerHTML = ''; R.postures = {};
    POSTURE_DEFS.forEach(p => {
      const b = document.createElement('button');
      b.className = 'posture'; b.innerHTML = '<b>' + p.name + '</b><span>' + p.desc + '</span>';
      b.onclick = () => setPosture(p.key);
      hp.appendChild(b); R.postures[p.key] = b;
    });
    R.cmd = [];
    const mk = (containerId, key, name) => {
      const def = ACTION_DEFS.find(a => a.key === key);
      const b = document.createElement('button');
      b.className = 'stn-act'; b.innerHTML = '<b>' + name + '</b><span class="sa-sub">' + def.sub + '</span><span class="sa-cd"></span>';
      b.onclick = () => triggerAction(key);
      $(containerId).appendChild(b); R.cmd.push({ btn: b, key: key, cd: b.querySelector('.sa-cd') });
    };
    mk('tacCommands', 'shields', 'PRIORITIZE SHIELDS'); mk('tacCommands', 'power', 'EMERGENCY POWER');
    mk('engActions', 'power', 'EMERGENCY POWER'); mk('engActions', 'damage', 'DAMAGE CONTROL');
    mk('opsCommands', 'evac', 'EVACUATE PASSENGERS'); mk('opsCommands', 'damage', 'DAMAGE CONTROL');
  }

  // ---- station render helpers ----
  const statRow = (l, v) => '<div class="stat-row"><span>' + l + '</span><b>' + v + '</b></div>';
  function busRow(label, pct, mw) {
    return '<div class="bus"><span class="bus-l">' + label + '</span><div class="seg-mini"><i style="width:' + (clamp(pct, 0, 150) / 150 * 100) + '%"></i></div><b>' + mw + ' MW</b></div>';
  }
  function sysRowEng(r) {
    const cls = r.health < 33 ? 'bad' : r.health < 75 ? 'warn' : '';
    return '<div class="sys-row"><span class="sys-n">' + r.label + '</span><div class="seg-mini"><i class="' + cls + '" style="width:' + clamp(r.health, 0, 100) + '%"></i></div><b class="' + cls + '">' + Math.round(r.health) + '%</b></div>';
  }
  function issueRow(r) {
    const what = r.fire ? 'FIRE' : r.breach ? 'BREACH' : r.leak > 0 ? 'COOLANT LEAK' : r.status.toUpperCase();
    return '<div class="issue-row ' + (r.fire || r.breach ? 'bad' : 'warn') + '"><b>' + r.label + '</b><span>' + what + ' · ' + Math.round(r.health) + '%</span></div>';
  }
  function contactCard(ico, name, dist, action, timer, danger) {
    return '<div class="contact' + (danger ? ' danger' : '') + '"><span class="ct-ico">' + ico + '</span><div class="ct-info"><b>' + name + '</b>' +
      (dist ? '<span class="ct-dist">' + dist + '</span>' : '') + '<span>' + action + '</span><span class="ct-timer">' + timer + '</span></div></div>';
  }

  function renderStation() {
    if (!S) { return; }
    if (R.cmd) { R.cmd.forEach(c => { const t = S.actions[c.key] || 0; c.btn.classList.toggle('cooling', t > 0); c.cd.textContent = t > 0 ? Math.ceil(t) + 's' : 'READY'; }); }
    if (station === 'tactical') { renderTactical(); }
    else if (station === 'helm') { renderHelm(); }
    else if (station === 'engineering') { renderEngineering(); }
    else if (station === 'operations') { renderOperations(); }
  }
  function renderTactical() {
    $('tacThreat').textContent = 'THREAT ' + THREAT_LABEL[clamp(Math.round(S.threat), 0, 5)];
    let html = '';
    if (S.attackers > 0) {
      html += contactCard('⚔', 'RAIDER WING ×' + S.attackers, (1.0 + S.threat * 0.4).toFixed(1) + ' km', 'Closing — laser & missile', 'Next volley ' + Math.max(0, Math.ceil(S.combatTimer)) + 's', true);
    }
    S.rooms.forEach(r => { if (r.boarders) { html += contactCard('🚪', 'BOARDERS', '0.0 km', 'Aboard at ' + r.label, 'Repel with security', true); } });
    if (S.field) { html += contactCard('☄', 'DEBRIS FIELD', '', S.field.warn > 0 ? 'Impacts imminent' : 'Bombarding hull', S.field.warn > 0 ? 'Impact in ' + Math.ceil(S.field.warn) + 's' : 'Taking hits', true); }
    $('tacContacts').innerHTML = html || '<div class="contact-empty">✓ No contacts — sky is clear</div>';
    const shMax = 120 * sysEff('shields'); const sf = shMax > 0 ? clamp(S.shieldPool / shMax, 0, 1) : 0;
    $('tacShield').innerHTML = '<div class="seg-mini big"><i style="width:' + (sf * 100) + '%"></i></div>' +
      statRow('SHIELD POOL', Math.round(S.shieldPool) + ' / ' + Math.round(shMax)) + statRow('SHIELD OUTPUT', Math.round(sysEff('shields') * 100) + '%');
    $('tacWeapons').innerHTML = statRow('WEAPON OUTPUT', Math.round(sysEff('weapons') * 100) + '%') +
      statRow('SENSOR LOCK', Math.round(sysEff('sensors') * 100) + '%') +
      statRow('TURRET PODS', Math.round(bayCond('turret') * 100) + '%');
  }
  function renderHelm() {
    const eta = Math.max(0, Math.ceil(S.duration - S.t));
    $('helmDest').textContent = (S.contract ? S.contract.to : 'PORT').toUpperCase() + ' · ' + eta + 's';
    $('helmReadout').innerHTML =
      statRow('DESTINATION', S.contract ? S.contract.to : 'Port') + statRow('ARRIVAL IN', eta + 's') +
      statRow('ENGINE OUTPUT', Math.round(sysEff('engines') * 100) + '%') +
      statRow('REACTOR HEAT', Math.round(S.heat) + '%' + (S.heat > 85 ? ' ⚠' : '')) +
      statRow('THREAT LEVEL', THREAT_LABEL[clamp(Math.round(S.threat), 0, 5)]) +
      statRow('RAIDERS ON SCOPE', S.attackers);
    if (R.postures) { Object.keys(R.postures).forEach(k => R.postures[k].classList.toggle('active', S.posture === k)); }
  }
  function renderEngineering() {
    $('engReactor').textContent = Math.round(S.sys.reactor.power) + ' / ' + S.sys.reactor.max + ' MW';
    let ph = '';
    SYS_DEFS.forEach(d => { if (d.key === 'reactor') { return; } ph += busRow(d.label, S.sys[d.key].power, Math.round(d.base * S.sys[d.key].power / 100)); });
    $('engPower').innerHTML = ph + '<div class="bus res"><span class="bus-l">RESERVE</span><b class="' + (S.reserve < 0 ? 'bad' : '') + '">' + Math.round(S.reserve) + ' MW</b></div>';
    $('engReactorStat').innerHTML = statRow('HEAT', Math.round(S.heat) + '%') +
      statRow('STATUS', S.heat > 85 ? '<span class="bad">UNSTABLE</span>' : S.brownout ? '<span class="warnt">BROWNOUT</span>' : '<span style="color:var(--green)">STABLE</span>');
    $('engSystems').innerHTML = S.rooms.filter(r => r.sys).map(sysRowEng).join('');
    const issues = S.rooms.filter(r => r.fire || r.breach || r.leak > 0 || r.status !== 'normal');
    $('engIssues').innerHTML = issues.length ? issues.slice(0, 6).map(issueRow).join('') : '<div class="contact-empty">✓ All systems nominal</div>';
  }
  function renderOperations() {
    $('opsCargoVal').textContent = fmt(S.cargoValue) + ' CR';
    if (!S.cargo.length) { $('opsCargo').innerHTML = '<div class="contact-empty">No cargo aboard</div>'; }
    else {
      const holds = S.rooms.filter(r => r.bayRole === 'cargo');
      const cond = holds.length ? Math.round(holds.reduce((a, b) => a + b.health, 0) / holds.length) : 100;
      $('opsCargo').innerHTML = S.cargo.map(c => '<div class="ops-cargo-row"><div class="ocr-info"><b>' + c.name + '</b><span>' + fmt(c.value) + ' CR</span></div><div class="ocr-cond ' + (cond < 50 ? 'bad' : cond < 80 ? 'warn' : '') + '">' + cond + '%</div></div>').join('');
    }
    const alive = S.pax.filter(p => p !== 'dead').length, panic = S.pax.filter(p => p === 'panic').length;
    $('opsPaxTot').textContent = alive + ' ABOARD';
    $('opsPax').innerHTML = statRow('CALM', (alive - panic)) + statRow('PANICKING', panic) + statRow('MORALE', Math.round(S.paxMorale) + '%');
    $('opsPods').innerHTML = S.rooms.filter(r => r.hardpoint).map(r => '<div class="ops-pod ' + (r.bayRole === 'empty' ? 'empty' : '') + '"><b>' + r.label + '</b><span>' + (r.bayRole === 'empty' ? 'NOT IN USE' : Math.round(r.health) + '%') + '</span></div>').join('');
    $('opsStatus').innerHTML = statRow('LIFE SUPPORT', Math.round(sysEff('life') * 100) + '%') + statRow('HULL', Math.round(S.hull) + '%') + statRow('POWER', S.brownout ? '<span class="bad">BROWNOUT</span>' : '<span style="color:var(--green)">NOMINAL</span>');
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
  // first-time coaching nudges — one per incident type per run, only if enabled
  const COACH_TIPS = {
    raiders: ['HOSTILES INBOUND', 'Raiders are attacking. Shields soak the hits, weapons thin them out, and engines help you evade — route power to whatever you need most.'],
    failure: ['SYSTEM FAILURE', 'A compartment is losing integrity. Send repair crew to fix it, or hit JURY-RIG in the compartment panel for a fast temporary patch.'],
    debris: ['DEBRIS FIELD', 'Impacts are incoming. Pour power into SHIELDS now to soak the hits before they land.'],
    ion: ['ION SURGE', 'Your shields and sensors are degraded until this passes. Ride it out — lean on repair crew and keep an eye on the hull.'],
    sabotage: ['SABOTAGE ABOARD', 'A stowaway is tampering with systems. The damage clusters near where they hide — open a compartment and send a SECURITY DETAIL to sweep until you catch them.'],
    boarders: ['BOARDERS', 'Hostiles have made it aboard. Open that compartment and send a SECURITY DETAIL to repel them.'],
  };
  function coach(type) {
    if (!META.coachTips || S.nudged[type] || !COACH_TIPS[type]) { return; }
    S.nudged[type] = true;
    S.coach = { title: COACH_TIPS[type][0], body: COACH_TIPS[type][1], ttl: 13 };
  }

  // ---------------------------------------------------------------- simulation
  function sim(dt) {
    if (!S.running || S.over) { return; }
    // EMERGENCY BURN closes the distance faster — the run effectively ends sooner
    const burnAdvance = S.posture === 'burn' ? dt * 0.8 : 0;
    S.t += dt + burnAdvance; S.clock += dt; S.cycle += dt * 0.0007;

    // cooldowns & buffs
    for (const k in S.actions) { if (S.actions[k] > 0) { S.actions[k] = Math.max(0, S.actions[k] - dt); } }
    for (const k in S.buffs) { S.buffs[k] -= dt; if (S.buffs[k] <= 0) { delete S.buffs[k]; } }
    if (S.coach) { S.coach.ttl -= dt; if (S.coach.ttl <= 0) { S.coach = null; } }
    // reactor heat: rises with overclock and emergency burn, bleeds off otherwise;
    // a glowing-hot core slowly cooks the reactor compartment
    const heatLoad = (S.sys.reactor.power - 105) * 0.06 + (S.posture === 'burn' ? 4.5 : 0) - 2.2;
    S.heat = clamp(S.heat + heatLoad * dt, 0, 100);
    if (S.heat > 92 && chance(0.15 * dt)) {
      const rc = roomBySys('reactor'); if (rc) { rc.health = clamp(rc.health - 4, 0, 100); }
      logEvent('warn', 'Reactor overheating — core stress damage');
    }
    // per-room leaks drain health; jury-rig cooldowns tick down
    S.rooms.forEach(rm => {
      if (rm.juryCd > 0) { rm.juryCd = Math.max(0, rm.juryCd - dt); }
      if (rm.leak > 0) { rm.health = clamp(rm.health - rm.leak * dt, 0, 100); }
    });
    // posture side-effects: evasive rattles passengers, burn jostles cargo loose
    if (S.posture === 'evasive') { S.paxMorale = clamp(S.paxMorale - 1.0 * dt, 0, 100); }
    if (S.posture === 'burn') { S.rooms.forEach(rm => { if (rm.bayRole === 'cargo') { rm.health = clamp(rm.health - 1.4 * dt, 0, 100); } }); }

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
        const dmul = (0.6 + S.danger * 0.25) * (S.posture === 'silent' ? 0.55 : 1); // silent running draws fewer raiders
        const size = Math.max(1, Math.round((2 + intensity * 0.02 + S.threat * 0.6 + rand(0, 2)) * dmul));
        S.attackers = Math.min(18 + S.danger * 4, S.attackers + size);
        S.batchTimer = clamp(18 - intensity * 0.04 - S.threat * 1.5 - S.danger * 1.5, 4, 18) * rand(0.85, 1.15) * (S.posture === 'silent' ? 1.5 : 1);
        logEvent('bad', size + ' raiders closing to attack range'); comms('bad', 'HOSTILE CONTACTS ×' + size); coach('raiders');
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
      // station crew keep their own compartment patched to a limp-along level
      // (full repair still needs the repair-tech pool); more hands = faster
      if (rm.crew > 0 && rm.repairTechs === 0 && !rm.breach && rm.leak <= 0 && rm.health < 65) {
        rm.health = clamp(rm.health + 0.45 * rm.crew * dt, 0, 65);
      }
      rm.status = rm.health < 33 ? 'critical' : rm.health < 75 ? 'damaged' : 'normal';
    });

    // ---- cargo integrity tracks the structural health of the cargo holds ----
    // (so repairing a hold restores its cargo; an intact hold keeps cargo safe)
    if (S.cargo.length) {
      const holds = S.rooms.filter(r => r.bayRole === 'cargo' && !r.inactive);
      const cond = holds.length ? holds.reduce((a, b) => a + b.health, 0) / holds.length : 100;
      S.cargo.forEach(c => { c.integrity = cond; });
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
      // working: ~18s per tech to fully repair from zero; techs also fight hazards.
      // Station crew already on hand help — a well-manned room is repaired faster.
      const manAssist = 0.8 + 0.4 * mannedFrac(rm);
      const postureFx = S.posture === 'evasive' ? 0.7 : 1; // hard maneuvering hampers repair work
      const rate = (5.5 * rm.repairTechs * engFactor * S.crewSkill * manAssist * postureFx) * (S.brownout ? 0.6 : 1);
      if (rm.leak > 0) { rm.leak = Math.max(0, rm.leak - 1.6 * dt); if (rm.leak === 0) { logEvent('good', 'Repair crew sealed the leak in ' + rm.label); } }
      if (rm.fire && chance(0.35 * rm.repairTechs * dt)) { rm.fire = false; logEvent('good', 'Repair crew suppressed fire in ' + rm.label); }
      if (rm.breach && rm.health > 25 && chance(0.3 * rm.repairTechs * dt)) { rm.breach = false; logEvent('good', 'Repair crew sealed breach in ' + rm.label); }
      if (rm.health < 100 || rm.fire || rm.breach) { rm.health = clamp(rm.health + rate * dt, 0, 100); }
    });

    // ---- security crew (sweep for saboteurs, repel boarders) ----
    S.rooms.forEach(rm => {
      if (rm.securityTechs <= 0) { return; }
      if (rm.secState === 'enroute') {
        rm.secEta -= dt;
        if (rm.secEta <= 0) { rm.secState = 'working'; logEvent('good', 'Security detail sweeping ' + rm.label); }
        return;
      }
      // sweeping: catch a saboteur hiding here, or repel boarders here
      if (S.sabotage && !S.sabotage.caught && S.sabotage.room === rm.key) {
        rm.sweep += rm.securityTechs * dt;
        if (rm.sweep >= 6) { S.sabotage.caught = true; logEvent('good', 'Saboteur apprehended in ' + rm.label + '!'); comms('good', 'SABOTEUR CAUGHT — ' + rm.label); }
      } else if (rm.boarders) {
        rm.sweep += rm.securityTechs * dt;
        if (rm.sweep >= 5) { rm.boarders = false; rm.sweep = 0; logEvent('good', 'Boarders repelled in ' + rm.label); comms('good', 'DECK SECURED — ' + rm.label); }
      } else { rm.sweep = 0; } // nothing here — just standing guard
    });

    // ---- incident scheduler: trouble strikes unpredictably (even with no raiders) ----
    if (S.t > INTRO) {
      S.eventTimer -= dt;
      if (S.eventTimer <= 0) {
        S.eventTimer = clamp(26 - S.danger * 3 - (S.t - INTRO) * 0.02, 11, 28) * rand(0.8, 1.2);
        triggerIncident();
      }
    }
    // active space hazard: debris field
    if (S.field) {
      if (S.field.warn > 0) { S.field.warn -= dt; }
      else {
        S.field.dur -= dt; S.field.hitT -= dt;
        if (S.field.hitT <= 0) { S.field.hitT = rand(1.0, 2.2); debrisImpact(); }
        if (S.field.dur <= 0) { S.field = null; logEvent('good', 'Cleared the debris field'); comms('good', 'DEBRIS FIELD CLEARED'); }
      }
    }
    // active ion surge
    if (S.radiation > 0) {
      S.radiation -= dt;
      S.paxMorale = clamp(S.paxMorale - 1.2 * dt, 0, 100);
      if (S.radiation <= 0) { logEvent('good', 'Ion surge has passed'); comms('good', 'ION SURGE CLEARED'); }
    }
    // active sabotage: periodic tampering until the saboteur is caught
    if (S.sabotage && !S.sabotage.caught) {
      S.sabotage.tamperT -= dt;
      if (S.sabotage.tamperT <= 0) { S.sabotage.tamperT = rand(7, 12); sabotageStrike(); }
    }
    // boarders harass the compartments they hold
    S.rooms.forEach(rm => {
      if (rm.boarders) {
        rm.health = clamp(rm.health - 1.1 * dt, 0, 100);
        if (rm.crew > 0 && chance(0.04 * dt)) { hurtRoom(rm, 'boarders'); }
      }
    });

    // injured recover faster with medical dept AND a manned med bay
    const medMan = mannedBoost(roomByKey('medbay'));
    if (S.injured > 0 && chance(0.04 * S.depts.medical.count / S.depts.medical.max * medMan * S.crewSkill * dt * 4)) {
      S.injured--; logEvent('good', 'Crew member recovered in Med Bay');
    }

    // ---- win / lose ----
    if (S.hull <= 0) { endGame(false, 'HULL FAILURE', 'The Wayfarer broke apart under fire.'); }
    else if (S.cargo.length && cargoIntegrity() < CARGO_FAIL) { endGame(false, 'CARGO LOST', 'Cargo integrity fell below the contract minimum.'); }
    else if (aliveCrew() <= 0) { endGame(false, 'ALL HANDS LOST', 'No crew remain to command the ship.'); }
    else if (S.t >= S.duration) { endGame(true, 'CONTRACT COMPLETE', 'You brought the Wayfarer in to ' + (S.contract ? S.contract.to : 'port') + '.'); }
  }

  function volley() {
    const evasion = sysEff('engines') * 0.35 + (S.posture === 'evasive' ? 0.25 : 0);
    const pointDef = sysEff('sensors') * 0.3 + sysEff('weapons') * 0.15 + (S.pods ? S.pods.pdef * bayCond('turret') : 0);
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
    if (S.hull < 45 && leak > 20 && chance(0.35)) {
      rm.breach = true; logEvent('bad', 'HULL BREACH — ' + rm.label);
      // a breach under heavy fire can let boarders aboard — security must repel them
      if (S.danger >= 2 && !rm.boarders && chance(0.5)) { rm.boarders = true; logEvent('bad', 'Boarders coming through the breach — ' + rm.label); comms('bad', 'BOARDERS — ' + rm.label); coach('boarders'); }
    }
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

  // ---- incidents: the unpredictable things that go wrong ----
  function activeTrouble() {
    return S.rooms.filter(r => r.fire || r.breach || r.leak > 0 || r.boarders).length +
      (S.field ? 1 : 0) + (S.radiation > 0 ? 1 : 0) + (S.sabotage && !S.sabotage.caught ? 1 : 0);
  }
  function triggerIncident() {
    if (activeTrouble() >= 3) { return; } // easy mode: never pile on too much at once
    const pool = ['failure', 'failure', 'hazard'];
    if (!S.sabotage && S.pax.length > 0) { pool.push('sabotage'); } // a stowaway needs passengers aboard
    const kind = pick(pool);
    if (kind === 'failure') { startFailure(); }
    else if (kind === 'hazard') { startHazard(); }
    else { startSabotage(); }
  }
  function startFailure() {
    const cands = S.rooms.filter(r => r.sys && r.leak <= 0 && r.health > 40);
    const rm = pick(cands.length ? cands : S.rooms.filter(r => r.sys));
    if (!rm) { return; }
    if (chance(0.5)) {
      rm.leak = 2.0; logEvent('warn', 'Coolant leak — ' + rm.label + ' losing integrity'); comms('warn', 'COOLANT LEAK — ' + rm.label);
    } else {
      rm.health = clamp(rm.health - 20, 0, 100); rm.leak = 1.0;
      logEvent('bad', 'Power surge — ' + rm.label + ' damaged'); comms('bad', 'POWER SURGE — ' + rm.label);
    }
    coach('failure');
  }
  function startHazard() {
    if (chance(0.55)) {
      S.field = { warn: 5, dur: 13, hitT: 0 };
      logEvent('warn', 'Debris field ahead — impacts imminent'); comms('bad', 'DEBRIS FIELD AHEAD'); coach('debris');
    } else {
      S.radiation = 15;
      logEvent('warn', 'Ion surge — shields and sensors disrupted'); comms('warn', 'ION SURGE'); coach('ion');
    }
  }
  function debrisImpact() {
    let dmg = rand(10, 22);
    const absorbed = Math.min(S.shieldPool, dmg); S.shieldPool -= absorbed; const leak = dmg - absorbed;
    if (absorbed > 0) { comms('warn', 'SHIELDS DEFLECT DEBRIS ' + Math.round(absorbed)); }
    if (leak <= 0) { return; }
    const rm = pick(S.rooms);
    rm.health = clamp(rm.health - leak * 0.9, 0, 100);
    S.hull = clamp(S.hull - leak * 0.1 * S.bonus.hull, 0, 100);
    logEvent('bad', 'Debris strike — ' + rm.label); comms('bad', 'IMPACT — ' + rm.label);
    if (leak > 14 && chance(0.4)) { rm.fire = true; }
  }
  function startSabotage() {
    const cands = S.rooms.filter(r => !r.cargoBay);
    const rm = pick(cands);
    S.sabotage = { room: rm.key, tamperT: rand(5, 9), caught: false };
    logEvent('bad', 'Sabotage detected aboard — source unknown'); comms('bad', '⚠ SABOTAGE ABOARD'); coach('sabotage');
  }
  function sabotageStrike() {
    const home = roomByKey(S.sabotage.room);
    const target = chance(0.65) ? home : pick(S.rooms); // mostly near the saboteur — a clue
    if (chance(0.5)) { target.fire = true; }
    else { target.health = clamp(target.health - 16, 0, 100); target.leak = Math.max(target.leak, 1.4); }
    logEvent('bad', 'Systems tampered with — ' + target.label); comms('bad', 'TAMPERING — ' + target.label);
  }

  // ---------------------------------------------------------------- render
  function render() {
    if (!S) { return; }
    // coach tip toast
    const ct = $('coachToast');
    if (S.coach) {
      $('coachTitle').textContent = S.coach.title;
      $('coachBody').textContent = S.coach.body;
      ct.classList.remove('hidden');
    } else { ct.classList.add('hidden'); }

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
    $('crewCount').textContent = aliveCrew() + ' / ' + S.crewCap + ' · ' + S.crewIdle + ' IDLE';

    // repair crew (tech pool + active jobs)
    $('repairPool').textContent = 'REPAIR ' + S.repairPool + ' · SEC ' + S.securityPool;
    const repJobs = S.rooms.filter(r => r.repairTechs > 0);
    const secJobs = S.rooms.filter(r => r.securityTechs > 0);
    let rhtml = '<div class="repair-pool"><span class="rp-label">IDLE</span>' +
      techIcons(S.repairPool) + secIcons(S.securityPool) +
      (S.repairPool + S.securityPool === 0 ? '<span class="rp-none">none</span>' : '') + '</div>';
    if (repJobs.length === 0 && secJobs.length === 0) {
      rhtml += '<div class="repair-empty">No crews deployed. Click a compartment to send repair techs or security.</div>';
    }
    repJobs.forEach(rm => {
      const done = rm.health >= 99.9 && !rm.fire && !rm.breach && rm.leak <= 0;
      const state = rm.repairState === 'enroute'
        ? '<span class="rj-state enroute">EN ROUTE ' + Math.ceil(rm.repairEta) + 's</span>'
        : done ? '<span class="rj-state done">ON STATION</span>'
          : '<span class="rj-state">REPAIRING ' + Math.round(rm.health) + '%</span>';
      rhtml += '<div class="repair-job"><div class="rj-top"><span class="rj-name">' + rm.label + '</span>' +
        '<button class="rj-release" data-release="' + rm.key + '">release</button></div>' +
        '<div class="rj-mid">' + techIcons(rm.repairTechs) + state + '</div></div>';
    });
    secJobs.forEach(rm => {
      const busy = (S.sabotage && !S.sabotage.caught && S.sabotage.room === rm.key) || rm.boarders;
      const state = rm.secState === 'enroute'
        ? '<span class="rj-state enroute">EN ROUTE ' + Math.ceil(rm.secEta) + 's</span>'
        : busy ? '<span class="rj-state sweep">⚔ ENGAGING</span>'
          : '<span class="rj-state done">SWEPT — CLEAR</span>';
      rhtml += '<div class="repair-job sec"><div class="rj-top"><span class="rj-name">' + rm.label + '</span>' +
        '<button class="rj-release" data-srelease="' + rm.key + '">release</button></div>' +
        '<div class="rj-mid">' + secIcons(rm.securityTechs) + state + '</div></div>';
    });
    R.repairBody.innerHTML = rhtml;

    // casualties
    R.casK.textContent = S.killed; R.casI.textContent = S.injured; R.casM.textContent = S.missing;

    // cargo
    S.cargo.forEach((c, i) => {
      R.cargo[i].pct.textContent = Math.round(c.integrity) + '%';
      R.cargo[i].row.classList.toggle('atrisk', c.integrity < 70);
    });

    // schematic rooms + pod hardpoints (same data, different markup base class)
    S.rooms.forEach(rm => {
      const ref = R.rooms[rm.key]; if (!ref) { return; }
      const base = ref.podbay ? 'podbay' : 'room';
      let cls = base + ' ' + rm.status;
      if (rm.bayRole === 'empty') { cls += ' empty'; }
      if (rm.fire) { cls += ' fire'; }
      if (rm.breach) { cls += ' breach'; }
      if (rm.boarders) { cls += ' critical'; }
      ref.el.className = cls;
      let statTxt;
      if (rm.bayRole === 'empty') { statTxt = 'NOT IN USE'; }
      else if (rm.bayRole === 'cargo') { statTxt = S.cargo.length ? Math.round(rm.health) + '%' : 'NO CARGO'; }
      else if (rm.pax) { statTxt = S.pax.length ? S.pax.filter(p => p !== 'dead').length + ' aboard' : 'EMPTY'; }
      else if (rm.med || rm.key === 'bridge') { statTxt = rm.crew + ' / ' + rm.crewMax; }
      else { statTxt = Math.round(rm.health) + '%'; }
      ref.stat.textContent = statTxt;
      ref.badge.textContent = rm.boarders ? '⚔' : rm.fire ? '🔥' : rm.breach ? '✷' : rm.leak > 0 ? '💧' : rm.securityTechs > 0 ? '🛡' : rm.sealed ? '🔒' : rm.repairTechs > 0 ? '🛠' : '';
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

    // active hazards (symptoms only — the player works out the response)
    const haz = [];
    if (S.sabotage && !S.sabotage.caught) { haz.push({ cls: 'breach', ico: '⚠', name: 'SABOTAGE ABOARD', desc: 'Systems being tampered with — source unknown' }); }
    if (S.field) { haz.push({ cls: '', ico: '☄', name: S.field.warn > 0 ? 'DEBRIS FIELD — IMPACTS IMMINENT' : 'DEBRIS FIELD — TAKING HITS', desc: S.field.warn > 0 ? 'Impacts in ' + Math.ceil(S.field.warn) + 's' : 'Hull under bombardment' }); }
    if (S.radiation > 0) { haz.push({ cls: 'warn', ico: '☢', name: 'ION SURGE', desc: 'Shields & sensors disrupted (' + Math.ceil(S.radiation) + 's)' }); }
    S.rooms.forEach(rm => {
      if (rm.boarders) { haz.push({ cls: 'breach', ico: '⚔', name: 'BOARDERS — ' + rm.label, desc: 'Hostiles aboard, taking the deck' }); }
      else if (rm.fire) { haz.push({ cls: '', ico: '🔥', name: 'FIRE — ' + rm.label, desc: 'Spreading · structure falling' }); }
      else if (rm.breach) { haz.push({ cls: 'breach', ico: '✷', name: 'HULL BREACH — ' + rm.label, desc: 'Decompression risk' }); }
      else if (rm.leak > 0) { haz.push({ cls: 'warn', ico: '💧', name: 'LEAK — ' + rm.label, desc: 'Integrity bleeding at ' + Math.round(rm.health) + '%' }); }
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
        '<div class="rm-fns"><button class="rm-fn rm-release" data-act="release">RELEASE CREW</button>' +
        '<button class="rm-fn" data-act="jury">🔧 JURY-RIG (FAST PATCH)</button></div>' +
      '</div>' +
      '<div class="rm-sec"><div class="rm-sec-h">SECURITY DETAIL</div>' +
        '<div class="rm-stationrow"><div class="rm-sectechs"></div>' +
          '<div class="rm-crewctl"><button class="pbtn" data-act="sec-">−</button>' +
          '<span class="rm-sectechn"></span>' +
          '<button class="pbtn" data-act="sec+">+</button></div></div>' +
        '<div class="rm-secstate"></div>' +
        '<button class="rm-fn rm-release" data-act="secrelease">RELEASE SECURITY</button>' +
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
      jury: panel.querySelector('[data-act="jury"]'),
      sectechs: panel.querySelector('.rm-sectechs'), sectechn: panel.querySelector('.rm-sectechn'),
      secstate: panel.querySelector('.rm-secstate'), secPlus: panel.querySelector('[data-act="sec+"]'),
      secMinus: panel.querySelector('[data-act="sec-"]'), secrelease: panel.querySelector('[data-act="secrelease"]'),
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
    if (rm.bayRole === 'empty') { metric = 'OPEN HARDPOINT — no pod installed on this mount'; }
    else if (rm.bayRole === 'cargo') { metric = (S.cargo.length ? 'CARGO ' + Math.round(rm.health) + '%' : 'NO CARGO') + ' · pod structure'; }
    else if (rm.bayRole === 'turret') { metric = 'TURRET POD · ' + Math.round(rm.health) + '% structure · firepower ' + Math.round(bayCond('turret') * 100) + '%'; }
    else if (rm.bayRole === 'shield') { metric = 'SHIELD POD · ' + Math.round(rm.health) + '% structure · output ' + Math.round(bayCond('shield') * 100) + '%'; }
    else if (rm.bayRole === 'passenger') { metric = 'PASSENGER POD · ' + Math.round(rm.health) + '% structure'; }
    else if (rm.pax) { metric = (S.pax.length ? S.pax.filter(p => p !== 'dead').length + ' passengers' : 'NO PASSENGERS') + ' · ' + Math.round(rm.health) + '% structure'; }
    else { metric = 'STRUCTURE ' + Math.round(rm.health) + '%'; }
    m.sub.textContent = metric;
    m.crewn.textContent = rm.crew + ' / ' + rm.stations;
    for (let i = 0; i < m.pips.children.length; i++) { m.pips.children[i].classList.toggle('on', i < rm.crew); }
    m.eff.innerHTML = 'Manning <b>' + Math.round(mannedBoost(rm) * 100) + '%</b>' +
      (rm.sys ? ' &middot; system output <b>' + Math.round(sysEff(rm.sys) * 100) + '%</b>' : '') +
      ' &middot; ' + rm.fdesc +
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
    const done = rm.health >= 99.9 && !rm.fire && !rm.breach && rm.leak <= 0;
    let rs;
    if (rm.repairTechs === 0) { rs = (S.repairPool > 0 ? S.repairPool + ' techs idle in the pool — press + to send them here' : 'No idle techs — release some from another job'); }
    else if (rm.repairState === 'enroute') { rs = '<b class="warnt">EN ROUTE</b> — arriving in ' + Math.ceil(rm.repairEta) + 's'; }
    else if (done) { rs = '<b style="color:var(--green)">ON STATION</b> — fully repaired, standing by for new damage'; }
    else if (rm.leak > 0) { rs = '<b style="color:var(--amber)">SEALING LEAK</b> & repairing — ' + (Math.floor(rm.health * 10) / 10) + '%'; }
    else { rs = '<b style="color:var(--cyan)">REPAIRING</b> — structure ' + (Math.floor(rm.health * 10) / 10) + '%'; }
    m.rstate.innerHTML = rs;
    m.release.style.display = rm.repairTechs > 0 ? '' : 'none';
    m.jury.disabled = rm.juryCd > 0 || (rm.health >= 80 && rm.leak <= 0);
    m.jury.textContent = rm.juryCd > 0 ? '🔧 JURY-RIG (READY ' + Math.ceil(rm.juryCd) + 's)' : '🔧 JURY-RIG (FAST PATCH)';
    // security controls
    m.sectechs.innerHTML = rm.securityTechs > 0 ? secIcons(rm.securityTechs) : '<span class="rp-none">none assigned</span>';
    m.sectechn.textContent = rm.securityTechs;
    m.secPlus.disabled = S.securityPool <= 0;
    m.secMinus.disabled = rm.securityTechs <= 0;
    const threatHere = (S.sabotage && !S.sabotage.caught && S.sabotage.room === rm.key) || rm.boarders;
    let ss;
    if (rm.securityTechs === 0) { ss = (S.securityPool > 0 ? S.securityPool + ' security idle — send them to sweep a compartment' : 'No security available'); }
    else if (rm.secState === 'enroute') { ss = '<b class="warnt">EN ROUTE</b> — arriving in ' + Math.ceil(rm.secEta) + 's'; }
    else if (rm.boarders) { ss = '<b style="color:var(--red)">REPELLING BOARDERS</b>'; }
    else if (threatHere) { ss = '<b style="color:var(--red)">INTRUDER CORNERED — sweeping</b>'; }
    else { ss = '<b style="color:var(--green)">SWEPT — clear here</b>'; }
    m.secstate.innerHTML = ss;
    m.secrelease.style.display = rm.securityTechs > 0 ? '' : 'none';
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
  // ---- 16-bit pixel-art rendering: draw tiny, scale up nearest-neighbour ----
  let _pxCanvas = null, _pxCtx = null;
  function pxBuf(pw, ph) {
    if (!_pxCanvas) { _pxCanvas = document.createElement('canvas'); _pxCtx = _pxCanvas.getContext ? _pxCanvas.getContext('2d') : null; }
    _pxCanvas.width = pw; _pxCanvas.height = ph;
    if (_pxCtx) { _pxCtx.imageSmoothingEnabled = false; }
    return _pxCtx;
  }
  function blitPx(ctx, pw, ph, w, h) {
    if (!ctx || !_pxCanvas) { return; }
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(_pxCanvas, 0, 0, pw, ph, 0, 0, w, h);
  }
  function px(ctx, x, y, w, h, c) {
    ctx.fillStyle = c;
    ctx.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
  }
  // a flat panel with a 1px lit top/left edge and dark bottom/right edge
  function panel(ctx, x, y, w, h, base, hi, sh) {
    px(ctx, x, y, w, h, base);
    px(ctx, x, y, w, 1, hi); px(ctx, x, y, 1, h, hi);
    px(ctx, x, y + h - 1, w, 1, sh); px(ctx, x + w - 1, y, 1, h, sh);
  }
  // banded retro starfield
  function paintSpace(ctx, w, h, dt, speed, redTint) {
    px(ctx, 0, 0, w, h, '#070a16');
    px(ctx, 0, Math.round(h * 0.5), w, Math.ceil(h * 0.5), '#0a1020');
    px(ctx, 0, Math.round(h * 0.8), w, Math.ceil(h * 0.2), '#0c1428');
    if (redTint) { ctx.globalAlpha = 0.16; px(ctx, 0, Math.round(h * 0.3), w, Math.round(h * 0.4), '#5a1414'); ctx.globalAlpha = 1; }
    stars.forEach(s => {
      s.x -= s.z * speed * dt; if (s.x < 0) { s.x += 1; s.y = Math.random(); }
      const c = s.z > 0.8 ? '#d6e6ff' : s.z > 0.55 ? '#8fb2e2' : '#4f6a96';
      const sz = s.z > 0.8 ? 2 : 1;
      px(ctx, s.x * w, s.y * h, sz, sz, c);
    });
  }
  function drawRaider(ctx, x, y, faceLeft) {
    const d = faceLeft ? -1 : 1;
    px(ctx, x - 2, y - 1, 4, 2, '#c8536a');                 // hull
    px(ctx, x + d * 2, y, 2, 1, '#ff9aa9');                 // nose
    px(ctx, x - d, y - 2, 1, 1, '#9c3a4e'); px(ctx, x - d, y + 1, 1, 1, '#9c3a4e'); // wings
    px(ctx, x - d * 3, y, 1, 1, 'rgba(255,150,90,0.95)');   // thruster
  }

  function drawExt(dt) {
    const ctx = R.extCtx; if (!ctx) { return; }
    const w = R.ext.width = R.ext.clientWidth || 300;
    const h = R.ext.height = 150;
    const PX = 3;
    const pw = Math.max(1, Math.round(w / PX)), ph = Math.max(1, Math.round(h / PX));
    const p = pxBuf(pw, ph); if (!p) { return; }
    const under = S && S.attackers > 0;
    const hull = S ? S.hull : 100;
    const fires = S ? S.rooms.filter(r => r.fire).length : 0;
    const u = Math.min(pw * 0.085, (ph * 0.5 - 3) / 2.9);
    const cx = pw * 0.5, cy = ph * 0.52, L = u * 9.5;

    paintSpace(p, pw, ph, dt, 0.05, under);
    drawShip(p, cx, cy, u, S ? S.loadout : META.loadout, S ? S.t : 0, { hull: hull, fires: fires });

    // shield bubble — a stippled pixel ring
    if (S) {
      const shMax = 120 * sysEff('shields');
      const sf = shMax > 0 ? clamp(S.shieldPool / shMax, 0, 1) : 0;
      if (sf > 0.04) {
        const rx = L * 0.62, ry = ph * 0.44, segs = 72;
        p.fillStyle = 'rgba(110,195,255,' + (0.3 + sf * 0.45) + ')';
        for (let i = 0; i < segs; i++) {
          if ((i % 2) && !under) { continue; }
          const a = (i / segs) * TAU;
          p.fillRect(Math.round(cx + Math.cos(a) * rx), Math.round(cy + Math.sin(a) * ry), 1, 1);
        }
      }
    }

    // raiders (motion stays in screen space; draw converted into the buffer)
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
        if (r.fireCd <= 0) { r.fireCd = rand(1.0, 3.0); bolts.push({ x0: r.x, y0: r.y, tx: cx * PX, ty: cy * PX, t: 0 }); }
      }
      drawRaider(p, r.x / PX, r.y / PX, r.x > cx * PX);
    });
    // bolts — dashed pixel lasers
    for (let i = bolts.length - 1; i >= 0; i--) {
      const b = bolts[i]; b.t += dt * 2.2;
      const hx = (b.x0 + (b.tx - b.x0) * Math.min(1, b.t)) / PX;
      const hy = (b.y0 + (b.ty - b.y0) * Math.min(1, b.t)) / PX;
      const ang = Math.atan2(b.ty - b.y0, b.tx - b.x0);
      for (let k = 0; k < 4; k++) { px(p, hx - Math.cos(ang) * k * 1.5, hy - Math.sin(ang) * k * 1.5, k ? 1 : 2, k ? 1 : 2, k === 0 ? '#ffe0b0' : '#ff5a46'); }
      if (b.t >= 1) {
        const ia = Math.atan2(hy - cy, hx - cx);
        flashes.push({ x: cx + Math.cos(ia) * L * 0.62, y: cy + Math.sin(ia) * ph * 0.44, life: 0.3 });
        bolts.splice(i, 1);
      }
    }
    for (let i = flashes.length - 1; i >= 0; i--) {
      const f = flashes[i]; f.life -= dt;
      if (f.life <= 0) { flashes.splice(i, 1); continue; }
      p.globalAlpha = clamp(f.life * 3.3, 0, 1);
      px(p, f.x - 2, f.y, 5, 1, '#bfe6ff'); px(p, f.x, f.y - 2, 1, 5, '#bfe6ff'); px(p, f.x, f.y, 1, 1, '#ffffff');
      p.globalAlpha = 1;
    }
    blitPx(ctx, pw, ph, w, h);
  }

  // The freighter as pixel-art: engine block (rear/left), spine, slant-nosed
  // command module (front/right), and pods on hardpoints. The pods drawn
  // reflect the player's actual loadout. Everything is flat-shaded blocks with
  // 1px highlight/shadow edges, drawn into the low-res buffer.
  // Draw a pod filling the cell (x0,y0,w,h). `top` = which side of the spine it
  // is on (so barrels/emitters point outward). Each pod paints its own framed
  // edges, so flush neighbours still read as separate units.
  function drawPod(ctx, x0, y0, w, h, type, top, t) {
    x0 = Math.round(x0); y0 = Math.round(y0); w = Math.max(4, Math.round(w)); h = Math.max(3, Math.round(h));
    const mx = x0 + Math.round(w / 2), my = y0 + Math.round(h / 2), u = h / 1.45;
    if (!type) {
      // empty hardpoint — a clearly visible recessed slot
      px(ctx, x0, y0, w, h, '#0d1524');
      px(ctx, x0, y0, w, 1, '#32425a'); px(ctx, x0, y0 + h - 1, w, 1, '#1b2636');
      px(ctx, x0, y0, 1, h, '#32425a'); px(ctx, x0 + w - 1, y0, 1, h, '#1b2636');
      px(ctx, mx - 2, my, 5, 1, '#2a3a52'); px(ctx, mx, my - 2, 1, 5, '#2a3a52');
      return;
    }
    if (type === 'cargo') {
      px(ctx, x0, y0, w, h, '#241a10'); // dark backing reads as container seams
      const cols = 3, rows = 2, gw = (w - 1) / cols, gh = (h - 1) / rows;
      for (let c = 0; c < cols; c++) { for (let r = 0; r < rows; r++) {
        px(ctx, x0 + 1 + c * gw, y0 + 1 + r * gh, gw - 1, gh - 1, (c + r) % 2 ? '#a06f3f' : '#7d5230');
      } }
      px(ctx, x0, y0, w, 1, '#c69050');
    } else if (type === 'passenger') {
      panel(ctx, x0, y0, w, h, '#33485e', '#54718f', '#1f2c3a');
      const lit = 0.5 + 0.45 * Math.sin(t * 3 + x0);
      const ww = Math.max(1, Math.round(w / 6));
      for (let i = 0; i < 3; i++) { px(ctx, x0 + Math.round(w * 0.16) + i * Math.round(w / 4), my - 1, ww, 2, 'rgba(150,225,255,' + lit + ')'); }
    } else if (type === 'military') {
      panel(ctx, x0, y0, w, h, '#3a4554', '#586a7e', '#222b36');
      px(ctx, x0, my - 1, w, Math.max(1, Math.round(h * 0.18)), '#c0563a');
      const bl = Math.max(2, Math.round(u * 0.5));
      px(ctx, mx - 1, top ? y0 - bl : y0 + h, 2, bl, '#222c3a'); // barrel points outward
    } else if (type === 'shield') {
      panel(ctx, x0, y0, w, h, '#25405c', '#3f6a92', '#16293c');
      px(ctx, mx - 1, top ? y0 - 1 : y0 + h - 1, 2, 2, '#7fd0ff'); // emitter on outer edge
      for (let i = 0; i < 5; i++) { const a = t * 2 + i * 0.5; px(ctx, mx + Math.cos(a) * w * 0.3, my + Math.sin(a) * h * 0.3, 1, 1, 'rgba(120,200,255,0.9)'); }
    }
  }
  function drawShip(ctx, cx, cy, u, loadout, t, opts) {
    opts = opts || {}; loadout = loadout || [];
    const hull = opts.hull == null ? 100 : opts.hull, fires = opts.fires || 0;
    cx = Math.round(cx); cy = Math.round(cy);
    const xEng = Math.round(cx - u * 4.3), xCmd = Math.round(cx + u * 2.9);

    // ---- spine ----
    const sH = Math.max(2, Math.round(u * 0.5));
    panel(ctx, xEng + Math.round(u * 0.6), cy - Math.round(sH / 2), xCmd - xEng, sH, '#46546c', '#6e84a6', '#28313f');

    // ---- hardpoint pods: tiled flush along the spine, top & bottom rows ----
    // Columns pack edge-to-edge between the engine block and command module,
    // each pod tucked directly against the spine (no pylons, no gaps).
    const n = loadout.length || 6, pairs = Math.ceil(n / 2);
    const startX = Math.round(xEng + u * 1.6); // engine block's right edge
    const endX = Math.round(xCmd);             // command module's left edge
    const cellW = Math.max(4, Math.floor((endX - startX) / pairs));
    const podH = Math.max(3, Math.round(u * 1.45));
    const spineTop = cy - Math.round(sH / 2), spineBot = cy + Math.round(sH / 2);
    for (let i = 0; i < n; i++) {
      const col = Math.floor(i / 2), top = (i % 2) === 0;
      const x0 = startX + col * cellW;
      const y0 = top ? spineTop - podH : spineBot;
      drawPod(ctx, x0, y0, cellW, podH, loadout[i], top, t);
    }

    // ---- engine block + blocky exhaust plumes ----
    // Engine block is the same height as the command module up front; the pods
    // tucked on the spine stick out past it, which is fine.
    const coreH = Math.max(4, Math.round(u * 2.4));
    const ebX = Math.round(xEng - u * 0.6), ebY = cy - Math.round(coreH / 2), ebW = Math.round(u * 2.2), ebH = coreH;
    panel(ctx, ebX, ebY, ebW, ebH, '#39465a', '#5a6e8c', '#222b3a');
    px(ctx, ebX + 1, Math.round(cy - u * 0.75), ebW - 2, 1, '#222b3a');
    px(ctx, ebX + 1, Math.round(cy + u * 0.75), ebW - 2, 1, '#222b3a');
    const eg = 0.55 + 0.45 * Math.sin(t * 9);
    for (let k = -1; k <= 1; k++) {
      const ey = Math.round(cy + k * u * 0.78);
      px(ctx, ebX - u * 0.6, ey - u * 0.28, u * 0.7, u * 0.56, '#10161f'); // nozzle
      const fl = u * (1.0 + 0.7 * eg);
      px(ctx, ebX - u * 0.6 - fl, ey - 1, fl, 3, 'rgba(90,170,255,0.85)');
      px(ctx, ebX - u * 0.6 - fl * 0.6, ey - 1, fl * 0.6, 3, 'rgba(150,215,255,0.95)');
      px(ctx, ebX - u * 0.6 - fl * 0.3, ey, fl * 0.3 + 1, 1, '#ffffff');
    }

    // ---- command module with stepped slant nose ----
    const ch = coreH, cTop = cy - Math.round(ch / 2), bodyW = Math.max(4, Math.round(u * 1.9));
    panel(ctx, xCmd, cTop, bodyW, ch, '#515f73', '#7c8da3', '#313b49');
    px(ctx, xCmd + 1, cTop + Math.round(u * 0.5), bodyW - 2, Math.max(1, Math.round(u * 0.25)), '#4fb8ff'); // viewport
    const wl = 0.55 + 0.45 * Math.sin(t * 3);
    for (let i = 0; i < 3; i++) { px(ctx, xCmd + 2 + i * Math.round(u * 0.55), cTop + ch - Math.round(u * 0.75), Math.max(1, Math.round(u * 0.3)), Math.max(1, Math.round(u * 0.3)), 'rgba(150,220,255,' + wl + ')'); }
    const noseX = xCmd + bodyW, noseW = Math.max(3, Math.round(u * 1.4)), segs = Math.max(3, Math.round(u));
    for (let i = 0; i < segs; i++) {
      const fx = noseX + Math.round(i * noseW / segs);
      const inset = Math.round((i / segs) * (ch * 0.5));
      panel(ctx, fx, cTop + inset, Math.ceil(noseW / segs) + 1, ch - 2 * inset, '#5a6a7e', '#7c8da3', '#313b49');
    }
    px(ctx, noseX + noseW, cy - 1, 2, 2, (Math.sin(t * 4) > 0) ? '#ff6a6a' : 'rgba(255,120,120,0.3)'); // nose light

    // ---- damage: blocky fire + smoke ----
    const burn = fires + (hull < 60 ? 1 : 0) + (hull < 35 ? 1 : 0);
    for (let i = 0; i < burn; i++) {
      const fx = startX + (endX - startX) * ((i * 0.37) % 1), fy = cy + (i % 2 ? 1 : -1) * u * 0.5;
      const fk = 0.5 + 0.5 * Math.sin(t * 16 + i * 2);
      px(ctx, fx - 1, fy - u * 0.8 - fk * 2, 2, 2, 'rgba(120,130,150,0.5)');
      px(ctx, fx - 1, fy, 2, 2, '#ffcf3a'); px(ctx, fx, fy - 1, 1, 1, '#ff7a1e');
    }
  }

  function drawPreviewScene(canvas, dt) {
    const ctx = canvas.getContext ? canvas.getContext('2d') : null; if (!ctx) { return; }
    const w = canvas.width = canvas.clientWidth || 600, h = canvas.height = canvas.clientHeight || 320;
    const PX = 4;
    const pw = Math.max(1, Math.round(w / PX)), ph = Math.max(1, Math.round(h / PX));
    const p = pxBuf(pw, ph); if (!p) { return; }
    paintSpace(p, pw, ph, dt, 0.02, false);
    const u = Math.min(pw * 0.072, (ph * 0.5 - 5) / 2.9);
    drawShip(p, pw * 0.5, ph * 0.5, u, META.loadout, previewT, { hull: 100, fires: 0 });
    blitPx(ctx, pw, ph, w, h);
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
    renderCoachToggle();
  }
  function renderCoachToggle() {
    const btn = $('coachToggle'); if (!btn) { return; }
    btn.classList.toggle('on', !!META.coachTips);
    btn.querySelector('.ct-state').textContent = META.coachTips ? 'ON' : 'OFF';
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
  // The three mid-deck mounts become whatever pods are installed: cargo holds,
  // Build the pod strip: one clickable section per hardpoint, sized by pod
  // type, rebuilt each mission. Empty mounts read "NOT IN USE".
  function buildPods() {
    const strip = $('podStrip'); if (!strip) { return; }
    strip.innerHTML = '';
    S.rooms.filter(r => r.hardpoint).forEach(rm => {
      const el = document.createElement('div');
      el.className = 'podbay' + (rm.bayRole === 'empty' ? ' empty' : '');
      el.style.flexGrow = rm.flex;
      el.innerHTML = '<div class="pb-name"></div><div class="pb-stat"></div>' +
        '<div class="crewdots"></div><div class="badge"></div>';
      el.addEventListener('click', () => openRoom(rm.key));
      strip.appendChild(el);
      R.rooms[rm.key] = { el, podbay: true, stat: el.querySelector('.pb-stat'),
        name: el.querySelector('.pb-name'), dots: el.querySelector('.crewdots'), badge: el.querySelector('.badge') };
      R.rooms[rm.key].name.textContent = rm.label;
    });
  }

  function launchMission() {
    const contract = currentContract(); if (!contract) { return; }
    normalizeMeta();
    const counts = loadoutCounts(), up = META.upgrades;
    const cargo = [];
    for (let i = 0; i < counts.cargo; i++) {
      const g = CARGO_DEFS[i % CARGO_DEFS.length];
      cargo.push({ ico: g.ico, name: g.name, value: Math.round(MODULES.cargo.value * rand(0.85, 1.15)) });
    }
    // base ship bonuses come from hull upgrades; the firepower/shield from
    // military & shield pods is gated on those pods' bay condition (see bayCond)
    const bonus = {
      weapon: 1 + up.weapon * 0.12,
      shield: 1 + up.shield * 0.12,
      engine: 1 + up.engine * 0.12,
      hull: 1 / (1 + up.hull * 0.12),
      pdef: 0,
      reactorCap: 153 + up.reactor * 12,
    };
    const pods = {
      weapon: counts.military * MODULES.military.weapon,
      shield: counts.shield * MODULES.shield.shield,
      pdef: counts.military * MODULES.military.pdef,
    };
    const cfg = {
      duration: contract.duration, danger: contract.danger, cargo,
      paxCount: counts.passenger * MODULES.passenger.pax, bonus, pods,
      crewSkill: 0.85 + META.crewTier * 0.08, crewBonus: Math.floor(META.crewTier / 2),
      milPods: counts.military, contract, loadout: META.loadout.slice(),
    };
    S = newState(cfg);
    S.loadout = META.loadout.slice();
    logEvent('good', 'All systems nominal'); logEvent('info', 'Departed Zhen-9 — bound for ' + contract.to);
    logEvent('info', counts.cargo + ' cargo · ' + counts.passenger + ' passenger · ' + counts.military + ' military pods aboard');
    logEvent('warn', 'Route danger: ' + DANGER_LABEL[contract.danger] + ' — pirates likely');
    comms('info', 'DEPARTING ZHEN-9 → ' + contract.to.toUpperCase()); comms('good', 'ALL SYSTEMS NOMINAL'); comms('warn', 'ROUTE DANGER: ' + DANGER_LABEL[contract.danger]);
    if (!R.captain) { buildUI(); } else { buildCargo(); buildPax(); }
    buildPods();
    setStation('captain');
    showScreen('mission');
    last = performance.now(); simAcc = 0;
  }

  function endGame(win, title, sub) {
    if (S.over) { return; }
    S.over = true; S.running = false;
    const ci = cargoIntegrity(), paxAlive = S.pax.filter(p => p !== 'dead').length, c = S.contract;
    const lines = [];
    const fee = Math.round(c.reward * (win ? (S.divert ? 0.5 : 1) : 0.25));
    let pay = fee; lines.push(['Contract fee' + (S.divert && win ? ' (diverted)' : win ? '' : ' (partial)'), fee]);
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
      renderStation();
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
    $('coachToggle').onclick = () => { META.coachTips = !META.coachTips; saveMeta(); renderCoachToggle(); };
    $('debriefHome').onclick = () => { genContracts(); showScreen('home'); };
    if (META.seenIntro) { showScreen('home'); }
    else { screen = 'intro'; $('intro').classList.remove('hidden'); }
    last = performance.now();
    requestAnimationFrame(frame);
  }
  boot();
})();
