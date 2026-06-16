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

  // ---------------------------------------------------------------- config
  const RAID_DURATION = 210;        // sim-seconds to survive
  const CARGO_FAIL = 30;            // lose if cargo integrity drops below this
  const SEGMENTS = 14;              // segments per bar

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

  // ship compartments laid out on a 6x3 deck grid; some link to a power system
  const ROOM_DEFS = [
    { key: 'engines',  label: 'ENGINES',          gc: '1',     gr: '1 / 4', sys: 'engines', crew: 4 },
    { key: 'reactor',  label: 'REACTOR',          gc: '2',     gr: '1 / 3', sys: 'reactor', crew: 3 },
    { key: 'life',     label: 'LIFE SUPPORT',     gc: '3',     gr: '1',     sys: 'life',    crew: 2 },
    { key: 'pax',      label: 'PASSENGER DECK',   gc: '4 / 6', gr: '1',     sys: null,      crew: 2, pax: true },
    { key: 'bridge',   label: 'BRIDGE',           gc: '6',     gr: '1 / 3', sys: null,      crew: 3 },
    { key: 'cargoA',   label: 'CARGO BAY A',      gc: '3',     gr: '2',     sys: null,      crew: 1, cargo: 0 },
    { key: 'cargoB',   label: 'CARGO BAY B',      gc: '4',     gr: '2',     sys: null,      crew: 1, cargo: 1 },
    { key: 'cargoC',   label: 'CARGO BAY C',      gc: '5',     gr: '2',     sys: null,      crew: 1, cargo: 2 },
    { key: 'weapons',  label: 'WEAPONS DECK',     gc: '2',     gr: '3',     sys: 'weapons', crew: 2 },
    { key: 'shieldgen',label: 'SHIELD GENERATOR', gc: '3 / 5', gr: '3',     sys: 'shields', crew: 2 },
    { key: 'sensors',  label: 'SENSORS ARRAY',    gc: '5',     gr: '3',     sys: 'sensors', crew: 1 },
    { key: 'medbay',   label: 'MED BAY',          gc: '6',     gr: '3',     sys: null,      crew: 2, med: true },
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

  // ---------------------------------------------------------------- state
  let S = null;
  function newState() {
    const sys = {};
    SYS_DEFS.forEach(d => { sys[d.key] = { ...d, power: d.power }; });
    const rooms = ROOM_DEFS.map(d => ({
      ...d, status: 'normal', health: 100, fire: false, breach: false,
      crew: d.crew, crewMax: d.crew,
    }));
    const depts = {};
    DEPT_DEFS.forEach(d => { depts[d.key] = { ...d, count: d.max, health: rand(88, 100), morale: rand(70, 95) }; });
    const cargo = CARGO_DEFS.map(d => ({ ...d, integrity: 100 }));
    // a couple of rooms start already hurt, matching the "mid-raid" feel
    rooms.find(r => r.key === 'cargoA').fire = true;
    rooms.find(r => r.key === 'cargoA').health = 72;
    rooms.find(r => r.key === 'cargoA').status = 'damaged';
    rooms.find(r => r.key === 'shieldgen').health = 45;
    rooms.find(r => r.key === 'shieldgen').status = 'critical';
    rooms.find(r => r.key === 'cargoC').health = 58;
    rooms.find(r => r.key === 'cargoC').status = 'damaged';

    return {
      running: true, speed: 1, over: false,
      t: 0, clock: 22 * 3600 + 41 * 60 + 7, cycle: 1467.11,
      credits: 1247350,
      sys, rooms, depts, cargo,
      hull: 72,
      shieldPool: 60,                 // current absorbed-able shield HP
      pressure: 1.0,                  // raid intensity (drops as you kill raiders)
      attackers: 12,
      reserve: 0, brownout: false,
      captain: { name: 'LT. K. DRAVEN', role: 'CAPTAIN', health: 87, morale: 'High' },
      killed: 4, injured: 10, missing: 0,
      pax: Array.from({ length: 48 }, (_, i) => (i < 38 ? 'safe' : (i < 44 ? 'panic' : 'dead'))),
      paxMorale: 68,
      repair: REPAIR_NAMES.map((n, i) => ({ name: n, target: null, progress: 0 })),
      actions: {}, // key -> cooldown remaining
      buffs: {},   // key -> time remaining
      events: [], comms: [],
      combatTimer: 0, hazardTimer: rand(3, 6), killProg: 0, waveTimer: rand(12, 18),
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

    // repair teams
    R.repair = [];
    const rl = $('repairList');
    S.repair.forEach((t, i) => {
      const row = document.createElement('div'); row.className = 'rteam';
      row.innerHTML =
        '<span class="rt-ico">🛠</span><div class="rt-main">' +
        '<div class="rt-name">' + t.name + '</div>' +
        '<div class="rt-task"></div></div><span class="rt-pct"></span>';
      const bar = seg(6); row.querySelector('.rt-main').appendChild(bar);
      rl.appendChild(row);
      R.repair.push({ row, task: row.querySelector('.rt-task'), pct: row.querySelector('.rt-pct'), bar });
    });

    // casualties
    $('casualties').innerHTML =
      '<div class="cas killed"><div class="n" id="casK">0</div><div class="l">KILLED</div></div>' +
      '<div class="cas injured"><div class="n" id="casI">0</div><div class="l">INJURED</div></div>' +
      '<div class="cas missing"><div class="n" id="casM">0</div><div class="l">MISSING</div></div>';
    R.casK = $('casK'); R.casI = $('casI'); R.casM = $('casM');

    // cargo manifest
    R.cargo = [];
    const cl = $('cargoList');
    S.cargo.forEach((c, i) => {
      const row = document.createElement('div'); row.className = 'cargo-item';
      row.innerHTML =
        '<span class="cargo-ico">' + c.ico + '</span>' +
        '<span class="cargo-nm">' + c.name + '</span>' +
        '<span class="cargo-pct"></span>' +
        '<span class="cargo-val">' + fmt(c.value) + '</span>';
      cl.appendChild(row);
      R.cargo.push({ row, pct: row.querySelector('.cargo-pct') });
    });
    R.cargoSpaceBar = fillSeg($('cargoSpaceBar'), SEGMENTS, '');
    setSeg(R.cargoSpaceBar, 1456 / 2000, '');
    $('cargoSpaceTxt').textContent = '1,456 / 2,000 m³';
    $('cargoValue').textContent = fmt(1823450) + ' CR';

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
      el.addEventListener('click', () => dispatchRepair(rm.key));
      sc.appendChild(el);
      R.rooms[rm.key] = { el, stat: el.querySelector('.room-stat'),
        dots: el.querySelector('.crewdots'), badge: el.querySelector('.badge') };
    });
    R.hullBar = fillSeg($('hullBar'), 20, 'hull');

    // passengers
    R.paxGrid = $('paxGrid');
    R.pax = [];
    S.pax.forEach(() => {
      const sp = document.createElement('span'); sp.className = 'pax'; sp.textContent = '☻';
      R.paxGrid.appendChild(sp); R.pax.push(sp);
    });
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
  }

  // ---------------------------------------------------------------- helpers (model)
  function roomBySys(key) { return S.rooms.find(r => r.sys === key); }
  function sysEff(key) {
    // effectiveness = power level * linked-room health * brownout penalty
    const sy = S.sys[key];
    if (!sy) { return 1; }
    let e = sy.power / 100;
    const rm = roomBySys(key);
    if (rm) { e *= rm.health / 100; }
    if (S.brownout && key !== 'reactor') { e *= clamp(S.reserve >= 0 ? 1 : (S.sys.reactor.power / usedPower()), 0.45, 1); }
    if (S.buffs.shields && key === 'shields') { e *= 1.25; }
    return clamp(e, 0, 2);
  }
  function usedPower() {
    let u = 0;
    SYS_DEFS.forEach(d => { if (d.key !== 'reactor') { u += d.base * S.sys[d.key].power / 100; } });
    return u;
  }
  function aliveCrew() { return S.rooms.reduce((n, r) => n + r.crew, 0); }
  function cargoIntegrity() {
    const t = S.cargo.reduce((a, c) => a + c.value, 0);
    return S.cargo.reduce((a, c) => a + c.integrity * c.value, 0) / t;
  }

  // ---------------------------------------------------------------- interactions
  function adjustPower(key, d) {
    if (S.over) { return; }
    const sy = S.sys[key];
    sy.power = clamp(sy.power + d, sy.min, sy.max);
  }
  function dispatchRepair(roomKey) {
    if (S.over) { return; }
    const rm = S.rooms.find(r => r.key === roomKey);
    if (rm.health >= 99 && !rm.fire && !rm.breach) { logEvent('info', rm.label + ' nominal — no repair needed'); return; }
    // free a team (prefer idle, else the one with most-healthy target) and send it
    let team = S.repair.find(t => t.target === null);
    if (!team) { team = S.repair.find(t => t.target === roomKey) || S.repair[0]; }
    team.target = roomKey; team.progress = 0;
    logEvent('info', team.name + ' dispatched to ' + rm.label);
    comms('info', team.name + ' → ' + rm.label);
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

    // ---- combat volleys ----
    S.combatTimer -= dt;
    if (S.combatTimer <= 0 && S.attackers > 0) {
      S.combatTimer = rand(1.6, 2.8) / S.pressure;
      volley();
    }
    // weapons whittle down attackers (steady grind, scaled by power + tactical crew)
    const wpEff = sysEff('weapons') * (0.6 + 0.4 * S.depts.tactical.count / S.depts.tactical.max);
    S.killProg += wpEff * 0.22 * dt;
    while (S.killProg >= 1 && S.attackers > 0) {
      S.killProg -= 1; S.attackers--;
      logEvent('good', 'Raider destroyed (' + S.attackers + ' remaining)'); comms('good', 'RAIDER DESTROYED');
    }
    S.pressure = clamp(0.45 + S.attackers / 14, 0.3, 1.7);

    // reinforcement waves keep the raid alive until it starts to break near the end
    S.waveTimer -= dt;
    if (S.waveTimer <= 0 && S.t < RAID_DURATION - 35) {
      S.waveTimer = rand(14, 22);
      const n = Math.round(rand(2, 4));
      S.attackers = Math.min(16, S.attackers + n);
      logEvent('warn', n + ' raiders entering weapons range'); comms('bad', 'RAIDER WING INBOUND ×' + n);
    }

    // ---- fires spread & damage rooms ----
    S.rooms.forEach(rm => {
      if (rm.fire) {
        const ctrl = sysEff('life') * 0.4; // life support helps suppress
        rm.health = clamp(rm.health - (3.2 - ctrl) * dt, 0, 100);
        // casualties from fire
        if (rm.crew > 0 && chance(0.04 * dt * 60 / 60 * dt * 0)) { /* placeholder */ }
        if (rm.crew > 0 && chance(0.02 * dt)) { hurtRoom(rm, 'fire'); }
        // fire can spread to neighbor cargo
        if (chance(0.01 * dt) && rm.cargo === undefined) { /* keep simple */ }
        if (chance(0.02 * dt)) { logEvent('bad', 'Fire spreading in ' + rm.label); }
      }
      if (rm.breach) {
        rm.health = clamp(rm.health - 2.5 * dt, 0, 100);
        if (rm.crew > 0 && chance(0.03 * dt)) { hurtRoom(rm, 'breach'); }
      }
      // life support failure damages crew morale & causes slow casualties everywhere
      if (sysEff('life') < 0.5 && rm.crew > 0 && chance(0.012 * (0.5 - sysEff('life')) * dt * 4)) {
        hurtRoom(rm, 'life support');
      }
      // recompute status from health
      rm.status = rm.health < 33 ? 'critical' : rm.health < 75 ? 'damaged' : 'normal';
    });

    // ---- cargo integrity ----
    S.cargo.forEach((c, i) => {
      const bay = S.rooms.find(r => r.cargo === i);
      let decay = 0;
      if (bay) {
        if (bay.fire) { decay += 6; }
        if (bay.breach) { decay += 8; }
        if (bay.status === 'critical') { decay += 2; }
      }
      decay += (1 - sysEff('cargo')) * 1.5; // poor cargo-bay env
      c.integrity = clamp(c.integrity - decay * dt, 0, 100);
    });

    // ---- hull from average room health + direct combat handled in volley ----
    const avg = S.rooms.reduce((a, r) => a + r.health, 0) / S.rooms.length;
    S.hull = clamp(S.hull + (avg - S.hull) * 0.05 * dt, 0, 100);

    // ---- passengers panic / morale ----
    const hazardCount = S.rooms.filter(r => r.fire || r.breach).length;
    S.paxMorale = clamp(S.paxMorale + (hazardCount > 0 ? -2.5 : 1.2) * dt - (sysEff('life') < 0.6 ? 3 * dt : 0), 0, 100);
    if (hazardCount > 0 && chance(0.05 * hazardCount * dt)) {
      const idx = S.pax.findIndex(p => p === 'safe');
      if (idx >= 0) { S.pax[idx] = 'panic'; }
    }
    if (sysEff('life') < 0.4 && chance(0.03 * dt)) {
      const idx = S.pax.findIndex(p => p === 'panic');
      if (idx >= 0) { S.pax[idx] = 'dead'; logEvent('bad', 'Passenger lost — life support failure'); }
    }

    // ---- repair teams ----
    const engFactor = 0.5 + 0.5 * S.depts.engineering.count / S.depts.engineering.max;
    S.repair.forEach(t => {
      if (t.target === null) {
        // auto-assign worst room
        const worst = S.rooms.filter(r => r.health < 90 || r.fire || r.breach)
          .sort((a, b) => a.health - b.health)[0];
        if (worst) { t.target = worst.key; t.progress = 0; }
        return;
      }
      const rm = S.rooms.find(r => r.key === t.target);
      const rate = (14 * engFactor) * (S.brownout ? 0.6 : 1);
      if (rm.fire && chance(0.5 * dt)) { rm.fire = false; logEvent('good', t.name + ' suppressed fire in ' + rm.label); }
      if (rm.breach && rm.health > 30 && chance(0.4 * dt)) { rm.breach = false; logEvent('good', t.name + ' sealed breach in ' + rm.label); }
      rm.health = clamp(rm.health + rate * dt, 0, 100);
      t.progress = rm.health;
      if (rm.health >= 99 && !rm.fire && !rm.breach) { t.target = null; t.progress = 0; }
    });

    // injured slowly recover with medical
    if (S.injured > 0 && chance(0.04 * S.depts.medical.count / S.depts.medical.max * dt * 4)) {
      S.injured--; logEvent('good', 'Crew member recovered in Med Bay');
    }

    // ---- random hazards ----
    S.hazardTimer -= dt;
    if (S.hazardTimer <= 0) {
      S.hazardTimer = rand(5, 11) / S.pressure;
      spawnHazard();
    }

    // ---- crew count from rooms; departments lose people on death ----
    S.killed += 0; // updated in hurtRoom

    // ---- win / lose ----
    if (S.hull <= 0) { endGame(false, 'HULL FAILURE', 'The Wayfarer broke apart under fire.'); }
    else if (cargoIntegrity() < CARGO_FAIL) { endGame(false, 'CARGO LOST', 'Cargo integrity fell below the contract minimum.'); }
    else if (aliveCrew() <= 0) { endGame(false, 'ALL HANDS LOST', 'No crew remain to command the ship.'); }
    else if (S.t >= RAID_DURATION) { endGame(true, 'RAID SURVIVED', 'You held the Wayfarer together and reached Gateway Station.'); }
  }

  function volley() {
    const evasion = sysEff('engines') * 0.35;
    const pointDef = sysEff('sensors') * 0.3 + sysEff('weapons') * 0.15;
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
    S.hull = clamp(S.hull - leak * 0.12, 0, 100);
    logEvent('bad', rm.label + ' hit (' + Math.round(leak) + ' dmg)'); comms('bad', rm.label + ' HIT');
    if (leak > 16 && chance(0.5)) { rm.fire = true; logEvent('bad', 'Fire started in ' + rm.label); }
    if (S.hull < 45 && leak > 20 && chance(0.35)) { rm.breach = true; logEvent('bad', 'HULL BREACH — ' + rm.label); }
    if (rm.crew > 0 && chance(0.3)) { hurtRoom(rm, 'impact'); }
  }

  function hurtRoom(rm, cause) {
    // kill or injure someone in the room; reflect in departments
    if (chance(0.45)) {
      if (rm.crew > 0) { rm.crew--; S.killed++; logEvent('bad', 'Crew lost in ' + rm.label + ' (' + cause + ')'); }
      // drop a department headcount to match
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
    const threat = S.attackers > 8 ? 'CRITICAL' : S.attackers > 3 ? 'SEVERE' : S.attackers > 0 ? 'ELEVATED' : 'CLEAR';
    $('tbThreat').textContent = threat;
    $('tbAlert').textContent = S.attackers > 0 ? 'UNDER ATTACK' : 'ALL CLEAR';
    $('tbThreatBox').classList.toggle('flash', S.attackers > 8);
    $('tbObjective').textContent = 'SURVIVE ' + Math.max(0, Math.ceil(RAID_DURATION - S.t)) + 'S';
    let tb = ''; for (let i = 0; i < 5; i++) { tb += i < Math.ceil(S.pressure * 3) ? '<i></i>' : ''; }
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
    $('crewCount').textContent = aliveCrew() + ' / 28 CREW';

    // repair teams
    let active = 0;
    S.repair.forEach((t, i) => {
      const ref = R.repair[i];
      if (t.target) {
        active++;
        const rm = S.rooms.find(r => r.key === t.target);
        ref.row.classList.remove('idle');
        ref.task.innerHTML = 'Repairing: <b>' + rm.label + '</b>';
        ref.pct.textContent = Math.round(t.progress) + '%';
        ref.pct.style.color = colorFor(t.progress) === 'red' ? 'var(--red)' : colorFor(t.progress) === 'amber' ? 'var(--amber)' : 'var(--green)';
        setSeg(ref.bar, t.progress / 100, colorFor(t.progress));
      } else {
        ref.row.classList.add('idle');
        ref.task.innerHTML = 'Standing by';
        ref.pct.textContent = '—';
        setSeg(ref.bar, 0, '');
      }
    });
    $('repairActive').textContent = active + ' / 3 ACTIVE';

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
      if (rm.cargo !== undefined) { statTxt = Math.round(S.cargo[rm.cargo].integrity) + '%'; }
      else if (rm.pax) { statTxt = S.pax.filter(p => p !== 'dead').length + ' aboard'; }
      else if (rm.med || rm.key === 'bridge') { statTxt = rm.crew + ' / ' + rm.crewMax; }
      else { statTxt = Math.round(rm.health) + '%'; }
      ref.stat.textContent = statTxt;
      ref.badge.textContent = rm.fire ? '🔥' : rm.breach ? '✷' : '';
      // crew dots
      const dn = Math.min(rm.crew, 6);
      if (ref.dots.children.length !== dn) {
        ref.dots.innerHTML = '';
        for (let i = 0; i < dn; i++) { const d = document.createElement('span'); d.className = 'cd'; d.style.animationDelay = (i * 0.2) + 's'; ref.dots.appendChild(d); }
      }
    });
    $('hullPct').textContent = Math.round(S.hull) + '%';
    setSeg(R.hullBar, S.hull / 100, ('hull ' + colorFor(S.hull)).trim());
    const dmgCount = S.rooms.filter(r => r.status !== 'normal' || r.fire || r.breach).length;
    $('hullWarn').textContent = dmgCount > 0 ? '⚠ ' + dmgCount + ' SYSTEMS DAMAGED' : '✓ ALL SYSTEMS NOMINAL';
    $('hullWarn').style.color = dmgCount > 0 ? 'var(--amber)' : 'var(--green)';

    // passengers
    const safe = S.pax.filter(p => p === 'safe').length;
    $('paxSafe').textContent = safe + ' / 48 SAFE';
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
      const frac = sy.power / (d.key === 'reactor' ? 153 : 150);
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
    $('reactorOut').textContent = 'REACTOR ' + Math.round(S.sys.reactor.power) + ' / 153 MW';
    setSeg(R.reserveBar, clamp(S.reserve / 30, 0, 1), 'reserve ' + (S.reserve < 0 ? 'red' : S.reserve < 5 ? 'amber' : 'green'));
    $('reserveTxt').textContent = (S.reserve < 0 ? 'OVER ' : '') + Math.round(Math.abs(S.reserve)) + ' / 153 MW';
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
  }

  // ---------------------------------------------------------------- external cam (ambiance)
  let stars = [], bolts = [];
  function initStars() {
    stars = [];
    for (let i = 0; i < 70; i++) { stars.push({ x: Math.random(), y: Math.random(), z: rand(0.3, 1), }); }
  }
  function drawExt(dt) {
    const ctx = R.extCtx; if (!ctx) { return; }
    const w = R.ext.width = R.ext.clientWidth || 300;
    const h = R.ext.height = 150;
    ctx.fillStyle = '#02040a'; ctx.fillRect(0, 0, w, h);
    // nebula tint when under attack
    if (S.attackers > 0) {
      const g = ctx.createRadialGradient(w * 0.5, h * 0.5, 0, w * 0.5, h * 0.5, w * 0.6);
      g.addColorStop(0, 'rgba(80,20,20,0.25)'); g.addColorStop(1, 'transparent');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    }
    // stars drifting
    ctx.fillStyle = '#9fc0ff';
    stars.forEach(s => {
      s.x -= s.z * 0.04 * dt; if (s.x < 0) { s.x += 1; s.y = Math.random(); }
      ctx.globalAlpha = 0.3 + s.z * 0.6;
      ctx.fillRect(s.x * w, s.y * h, s.z * 1.6, s.z * 1.6);
    });
    ctx.globalAlpha = 1;
    // occasional laser bolts when under attack
    if (S.running && S.attackers > 0 && Math.random() < 0.06) {
      bolts.push({ x: Math.random() * w, y: Math.random() * h, life: 0.4, vertical: Math.random() < 0.5 });
    }
    bolts = bolts.filter(b => (b.life -= dt) > 0);
    bolts.forEach(b => {
      ctx.strokeStyle = 'rgba(255,90,70,' + clamp(b.life * 2.4, 0, 1) + ')';
      ctx.lineWidth = 1.6; ctx.beginPath();
      if (b.vertical) { ctx.moveTo(b.x, 0); ctx.lineTo(b.x + 20, h); }
      else { ctx.moveTo(0, b.y); ctx.lineTo(w, b.y + 14); }
      ctx.stroke();
    });
    // a faint silhouette block to imply the hull, no detailed art
    ctx.fillStyle = 'rgba(40,60,95,0.55)';
    ctx.fillRect(w * 0.28, h * 0.42, w * 0.46, h * 0.18);
    ctx.fillStyle = 'rgba(60,90,140,0.5)';
    ctx.fillRect(w * 0.30, h * 0.45, w * 0.10, h * 0.05);
    // engine glow
    ctx.fillStyle = 'rgba(80,160,255,' + (0.5 + 0.3 * Math.sin(S.t * 6)) + ')';
    ctx.fillRect(w * 0.74, h * 0.49, 4, h * 0.04);
  }

  // ---------------------------------------------------------------- end game
  function endGame(win, title, sub) {
    if (S.over) { return; }
    S.over = true; S.running = false;
    $('resultTitle').textContent = title;
    $('resultTitle').style.color = win ? 'var(--green)' : 'var(--red)';
    $('resultSub').textContent = sub;
    const ci = Math.round(cargoIntegrity());
    const cargoSaved = Math.round(1823450 * ci / 100);
    $('resultStats').innerHTML =
      row('Time survived', Math.floor(S.t) + 's / ' + RAID_DURATION + 's') +
      row('Hull integrity', Math.round(S.hull) + '%') +
      row('Cargo integrity', ci + '% (' + fmt(cargoSaved) + ' CR delivered)') +
      row('Raiders destroyed', (12 - S.attackers) + ' / 12') +
      row('Crew lost', S.killed + ' killed, ' + S.injured + ' injured') +
      row('Passengers safe', S.pax.filter(p => p !== 'dead').length + ' / 48');
    $('result').classList.remove('hidden');
    function row(k, v) { return '<div class="rs"><span>' + k + '</span><b>' + v + '</b></div>'; }
  }

  // ---------------------------------------------------------------- loop
  let last = 0, simAcc = 0;
  function frame(now) {
    if (!S) { requestAnimationFrame(frame); return; }
    const realDt = Math.min(0.05, (now - last) / 1000) || 0;
    last = now;
    const dt = realDt * S.speed;
    // step sim in fixed 0.1s slices for stability
    simAcc += dt;
    while (simAcc >= 0.1) { sim(0.1); simAcc -= 0.1; }
    drawExt(realDt * (S.running ? S.speed : 0.3));
    render();
    requestAnimationFrame(frame);
  }

  // ---------------------------------------------------------------- boot
  function start() {
    S = newState();
    // seed a few log/comms lines
    logEvent('bad', 'Shield generator hit'); logEvent('bad', 'Fire started in Cargo Bay A');
    logEvent('warn', 'Enemy torpedo inbound'); logEvent('info', 'Bravo team deployed');
    logEvent('warn', 'Passengers report panic');
    comms('bad', 'ENEMY TORPEDO INBOUND'); comms('info', 'BRAVO TEAM DEPLOYED'); comms('warn', 'HULL INTEGRITY 72%');
    if (!R.captain) { buildUI(); }
    $('title').classList.add('hidden');
    $('result').classList.add('hidden');
    $('app').classList.remove('hidden');
    last = performance.now();
  }

  $('startBtn').onclick = start;
  $('retryBtn').onclick = start;
  requestAnimationFrame(frame);
})();
