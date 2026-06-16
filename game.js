/*
 * REROUTE — a spaceship game about routing power under fire.
 *
 * Signature mechanic: the reactor has a fixed number of power cells. They are
 * shared across SHIELDS, WEAPONS, ENGINES and the MINING laser. You can only
 * make one thing strong by starving another, and you redistribute live during
 * combat. Mining funds upgrades; upgrades raise the ceiling; the threat keeps
 * climbing. Vanilla canvas, no dependencies.
 */
(() => {
  'use strict';

  // ---------------------------------------------------------------- canvas
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0;
  function resize() { W = canvas.width = window.innerWidth; H = canvas.height = window.innerHeight; }
  window.addEventListener('resize', resize);
  resize();

  // ---------------------------------------------------------------- helpers
  const TAU = Math.PI * 2;
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const len = (x, y) => Math.hypot(x, y);

  // ---------------------------------------------------------------- input
  const keys = {};
  const mouse = { x: 0, y: 0, down: false };

  canvas.addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; });
  canvas.addEventListener('mousedown', () => { mouse.down = true; });
  window.addEventListener('mouseup', () => { mouse.down = false; });

  window.addEventListener('keydown', e => {
    if (e.repeat) { return; }
    const k = e.key;
    keys[k.toLowerCase()] = true;

    if (state !== 'play') { return; }

    // Power routing: 1-4 add a cell, Shift+1-4 pull one back.
    // Use e.code (Digit1..Digit4) so Shift's symbol remapping (!@#$) doesn't break it.
    const sysByCode = { Digit1: 'shields', Digit2: 'weapons', Digit3: 'engines', Digit4: 'mining' };
    if (sysByCode[e.code]) {
      e.preventDefault();
      if (e.shiftKey) { removePower(sysByCode[e.code]); }
      else { addPower(sysByCode[e.code]); }
    }
    if (k === 'Tab') { e.preventDefault(); openDock(); }
  });
  window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

  // ---------------------------------------------------------------- state
  let state = 'title'; // title | play | dock | dead
  let game = null;
  let last = performance.now();

  const SYSTEMS = ['shields', 'weapons', 'engines', 'mining'];
  const SYS_COLOR = { shields: '#4fb0ff', weapons: '#ff6a6a', engines: '#ffd24a', mining: '#5be0a0' };
  const SYS_LABEL = { shields: 'SHIELDS', weapons: 'WEAPONS', engines: 'ENGINES', mining: 'MINING' };

  function newGame() {
    return {
      t: 0,
      reactor: { capacity: 8, max: 6, alloc: { shields: 2, weapons: 3, engines: 2, mining: 0 } },
      up: { dmg: 1, shieldEff: 1, engineEff: 1, miningEff: 1,
            lvl: { reactor: 0, hull: 0, weapon: 0, shield: 0, engine: 0, mining: 0 } },
      player: {
        x: W / 2, y: H / 2, vx: 0, vy: 0, angle: 0,
        hullMax: 100, hull: 100, shield: 0, fireCd: 0, hitFlash: 0, thrusting: false,
      },
      bullets: [], ebullets: [], enemies: [], asteroids: [], particles: [], floaters: [], stars: [],
      salvage: 0, totalSalvage: 0, kills: 0, score: 0,
      spawnTimer: 1.5, astTimer: 0, beamTarget: null, routeHintT: 6,
    };
  }

  function freeCells(g) {
    const a = g.reactor.alloc;
    return g.reactor.capacity - (a.shields + a.weapons + a.engines + a.mining);
  }
  function addPower(sys) {
    const g = game;
    if (freeCells(g) > 0 && g.reactor.alloc[sys] < g.reactor.max) {
      g.reactor.alloc[sys]++;
      g.routeHintT = 0;
      pip(sys, +1);
    }
  }
  function removePower(sys) {
    const g = game;
    if (g.reactor.alloc[sys] > 0) {
      g.reactor.alloc[sys]--;
      g.routeHintT = 0;
      pip(sys, -1);
    }
  }
  function pip(sys, dir) {
    // little feedback flash near the reactor bar
    game.floaters.push({ x: 90, y: H - 120 - SYSTEMS.indexOf(sys) * 26,
      text: dir > 0 ? '+' : '-', color: SYS_COLOR[sys], life: 0.5, vy: -20, sm: true });
  }

  // ---------------------------------------------------------------- derived stats
  function stats(g) {
    const a = g.reactor.alloc, u = g.up;
    return {
      shieldMax: a.shields > 0 ? (30 + a.shields * 25) * u.shieldEff : 0,
      shieldRegen: a.shields * 7 * u.shieldEff,
      canFire: a.weapons > 0,
      fireInterval: a.weapons > 0 ? 0.55 / a.weapons : Infinity,
      weaponDmg: (6 + a.weapons * 2) * u.dmg,
      accel: (55 + a.engines * 95) * u.engineEff,
      maxSpeed: (80 + a.engines * 70) * u.engineEff,
      miningRange: a.mining > 0 ? 70 + a.mining * 45 : 0,
      miningRate: a.mining * 18 * u.miningEff,
    };
  }

  // ---------------------------------------------------------------- spawning
  function spawnStars(g) {
    g.stars = [];
    for (let i = 0; i < 160; i++) {
      g.stars.push({ x: rand(0, W), y: rand(0, H), z: rand(0.2, 1), s: rand(0.4, 1.6) });
    }
  }
  function spawnAsteroid(g) {
    const edge = Math.floor(rand(0, 4));
    let x, y;
    if (edge === 0) { x = rand(0, W); y = -40; }
    else if (edge === 1) { x = W + 40; y = rand(0, H); }
    else if (edge === 2) { x = rand(0, W); y = H + 40; }
    else { x = -40; y = rand(0, H); }
    const rich = Math.random() < 0.3;
    const r = rand(16, 34) * (rich ? 1.15 : 1);
    const verts = [];
    const n = Math.floor(rand(7, 11));
    for (let i = 0; i < n; i++) { verts.push(rand(0.72, 1.12)); }
    g.asteroids.push({
      x, y, vx: rand(-22, 22), vy: rand(-22, 22), r,
      hp: r * 2.4 * (rich ? 1.6 : 1), hpMax: r * 2.4 * (rich ? 1.6 : 1),
      rich, spin: rand(-0.6, 0.6), rot: rand(0, TAU), verts,
    });
  }
  function spawnEnemy(g) {
    const edge = Math.floor(rand(0, 4));
    let x, y;
    if (edge === 0) { x = rand(0, W); y = -30; }
    else if (edge === 1) { x = W + 30; y = rand(0, H); }
    else if (edge === 2) { x = rand(0, W); y = H + 30; }
    else { x = -30; y = rand(0, H); }
    const heavy = g.t > 45 && Math.random() < clamp((g.t - 45) / 220, 0, 0.45);
    const tier = g.t / 60;
    g.enemies.push({
      x, y, vx: 0, vy: 0,
      heavy,
      r: heavy ? 20 : 13,
      hp: (heavy ? 46 : 16) + tier * 9,
      hpMax: (heavy ? 46 : 16) + tier * 9,
      speed: (heavy ? 60 : 95) + tier * 6,
      fireCd: rand(0.5, 1.8),
      fireRate: heavy ? 1.5 : 1.05,
      dmg: heavy ? 16 : 9,
      hit: 0,
      orbit: rand(140, 230),
    });
  }

  // ---------------------------------------------------------------- effects
  function burst(g, x, y, color, n, spd) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), s = rand(spd * 0.3, spd);
      g.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.3, 0.7), color, r: rand(1, 3) });
    }
  }
  function floater(g, x, y, text, color) {
    g.floaters.push({ x, y, text, color, life: 0.9, vy: -34 });
  }

  // ---------------------------------------------------------------- update
  function update(dt) {
    const g = game;
    g.t += dt;
    g.routeHintT += dt;
    const s = stats(g);
    const p = g.player;

    // -- player movement (twin-stick: WASD thrust, mouse aim) --
    let ax = 0, ay = 0;
    if (keys['w'] || keys['arrowup']) { ay -= 1; }
    if (keys['s'] || keys['arrowdown']) { ay += 1; }
    if (keys['a'] || keys['arrowleft']) { ax -= 1; }
    if (keys['d'] || keys['arrowright']) { ax += 1; }
    p.thrusting = (ax !== 0 || ay !== 0);
    if (p.thrusting) {
      const m = len(ax, ay);
      p.vx += (ax / m) * s.accel * dt;
      p.vy += (ay / m) * s.accel * dt;
    } else {
      // gentle drag when idle
      p.vx *= (1 - 1.4 * dt);
      p.vy *= (1 - 1.4 * dt);
    }
    const sp = len(p.vx, p.vy);
    if (sp > s.maxSpeed) { p.vx = (p.vx / sp) * s.maxSpeed; p.vy = (p.vy / sp) * s.maxSpeed; }
    p.x = clamp(p.x + p.vx * dt, 16, W - 16);
    p.y = clamp(p.y + p.vy * dt, 16, H - 16);
    p.angle = Math.atan2(mouse.y - p.y, mouse.x - p.x);

    // -- shields regen --
    if (s.shieldMax > 0) { p.shield = Math.min(s.shieldMax, p.shield + s.shieldRegen * dt); }
    else { p.shield = Math.min(p.shield, 0); }
    if (p.shield > s.shieldMax) { p.shield = s.shieldMax; }
    if (p.hitFlash > 0) { p.hitFlash -= dt; }

    // -- firing --
    p.fireCd -= dt;
    if (mouse.down && s.canFire && p.fireCd <= 0) {
      p.fireCd = s.fireInterval;
      const a = p.angle;
      const muzzle = 16;
      g.bullets.push({
        x: p.x + Math.cos(a) * muzzle, y: p.y + Math.sin(a) * muzzle,
        vx: Math.cos(a) * 560 + p.vx, vy: Math.sin(a) * 560 + p.vy,
        life: 1.1, dmg: s.weaponDmg,
      });
      burst(g, p.x + Math.cos(a) * muzzle, p.y + Math.sin(a) * muzzle, '#ffd9a0', 3, 60);
    }

    // -- mining laser: auto-locks nearest asteroid in range --
    g.beamTarget = null;
    if (s.miningRange > 0) {
      let best = null, bd = s.miningRange * s.miningRange;
      for (const a of g.asteroids) {
        const d = (a.x - p.x) ** 2 + (a.y - p.y) ** 2;
        if (d < bd) { bd = d; best = a; }
      }
      if (best) {
        g.beamTarget = best;
        best.hp -= s.miningRate * dt;
        if (Math.random() < 0.5) {
          burst(g, best.x, best.y, best.rich ? '#9ff7c8' : '#cfd6e6', 1, 40);
        }
        if (best.hp <= 0) {
          const yield_ = Math.round(best.r * (best.rich ? 1.6 : 0.8));
          g.salvage += yield_; g.totalSalvage += yield_;
          floater(g, best.x, best.y, '+' + yield_, best.rich ? '#9ff7c8' : '#cfe0ff');
          burst(g, best.x, best.y, best.rich ? '#9ff7c8' : '#aab6cc', 18, 130);
          g.asteroids.splice(g.asteroids.indexOf(best), 1);
        }
      }
    }

    // -- asteroids drift --
    for (let i = g.asteroids.length - 1; i >= 0; i--) {
      const a = g.asteroids[i];
      a.x += a.vx * dt; a.y += a.vy * dt; a.rot += a.spin * dt;
      if (a.x < -70 || a.x > W + 70 || a.y < -70 || a.y > H + 70) { g.asteroids.splice(i, 1); }
    }
    g.astTimer -= dt;
    if (g.astTimer <= 0 && g.asteroids.length < 9) {
      g.astTimer = rand(1.2, 2.6);
      spawnAsteroid(g);
    }

    // -- enemies --
    g.spawnTimer -= dt;
    if (g.spawnTimer <= 0) {
      g.spawnTimer = Math.max(0.75, 2.8 - g.t * 0.012);
      spawnEnemy(g);
    }
    for (let i = g.enemies.length - 1; i >= 0; i--) {
      const e = g.enemies[i];
      const dx = p.x - e.x, dy = p.y - e.y, d = len(dx, dy) || 1;
      // approach to orbit distance, then strafe
      const want = e.orbit;
      const dir = d > want ? 1 : -0.5;
      e.vx = lerp(e.vx, (dx / d) * e.speed * dir, 2 * dt);
      e.vy = lerp(e.vy, (dy / d) * e.speed * dir, 2 * dt);
      // tangential drift so they circle rather than line up
      e.vx += (-dy / d) * e.speed * 0.4 * dt * 6;
      e.vy += (dx / d) * e.speed * 0.4 * dt * 6;
      e.x += e.vx * dt; e.y += e.vy * dt;
      if (e.hit > 0) { e.hit -= dt; }

      // enemy fire
      e.fireCd -= dt;
      if (e.fireCd <= 0 && d < 520) {
        e.fireCd = e.fireRate * rand(0.8, 1.2);
        const a = Math.atan2(dy, dx);
        g.ebullets.push({ x: e.x + Math.cos(a) * e.r, y: e.y + Math.sin(a) * e.r,
          vx: Math.cos(a) * 230, vy: Math.sin(a) * 230, life: 2.4, dmg: e.dmg });
      }

      // contact damage
      if (d < e.r + 13) {
        damagePlayer(g, e.heavy ? 22 : 14);
        // knockback
        p.vx -= (dx / d) * 120; p.vy -= (dy / d) * 120;
        e.hp -= 8;
        burst(g, e.x, e.y, '#ff9a6a', 8, 120);
      }
      if (e.hp <= 0) { killEnemy(g, e, i); }
    }

    // -- player bullets --
    for (let i = g.bullets.length - 1; i >= 0; i--) {
      const b = g.bullets[i];
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      let dead = b.life <= 0 || b.x < -20 || b.x > W + 20 || b.y < -20 || b.y > H + 20;
      if (!dead) {
        for (let j = g.enemies.length - 1; j >= 0; j--) {
          const e = g.enemies[j];
          if ((b.x - e.x) ** 2 + (b.y - e.y) ** 2 < e.r * e.r) {
            e.hp -= b.dmg; e.hit = 0.12;
            burst(g, b.x, b.y, '#ffd9a0', 4, 90);
            dead = true;
            if (e.hp <= 0) { killEnemy(g, e, j); }
            break;
          }
        }
      }
      if (dead) { g.bullets.splice(i, 1); }
    }

    // -- enemy bullets --
    for (let i = g.ebullets.length - 1; i >= 0; i--) {
      const b = g.ebullets[i];
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      let dead = b.life <= 0;
      if (!dead && (b.x - p.x) ** 2 + (b.y - p.y) ** 2 < 13 * 13) {
        damagePlayer(g, b.dmg);
        dead = true;
      }
      if (dead || b.x < -20 || b.x > W + 20 || b.y < -20 || b.y > H + 20) { g.ebullets.splice(i, 1); }
    }

    // -- particles & floaters --
    for (let i = g.particles.length - 1; i >= 0; i--) {
      const q = g.particles[i];
      q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 0.94; q.vy *= 0.94; q.life -= dt;
      if (q.life <= 0) { g.particles.splice(i, 1); }
    }
    for (let i = g.floaters.length - 1; i >= 0; i--) {
      const f = g.floaters[i];
      f.y += f.vy * dt; f.life -= dt;
      if (f.life <= 0) { g.floaters.splice(i, 1); }
    }

    g.score = Math.floor(g.t * 10 + g.totalSalvage * 2 + g.kills * 5);
    if (p.hull <= 0) { gameOver(); }
  }

  function damagePlayer(g, amount) {
    const p = g.player;
    p.hitFlash = 0.18;
    if (p.shield > 0) {
      const absorbed = Math.min(p.shield, amount);
      p.shield -= absorbed;
      amount -= absorbed;
      burst(g, p.x, p.y, '#7fd0ff', 6, 110);
    }
    if (amount > 0) {
      p.hull -= amount;
      burst(g, p.x, p.y, '#ff7a7a', 6, 110);
    }
  }

  function killEnemy(g, e, index) {
    g.enemies.splice(index, 1);
    g.kills++;
    const reward = e.heavy ? 14 : 6;
    g.salvage += reward; g.totalSalvage += reward;
    floater(g, e.x, e.y, '+' + reward, '#ffd9a0');
    burst(g, e.x, e.y, e.heavy ? '#ffb86a' : '#ff8a6a', e.heavy ? 28 : 16, 180);
  }

  // ---------------------------------------------------------------- render
  function render() {
    const g = game;
    ctx.fillStyle = '#05060d';
    ctx.fillRect(0, 0, W, H);

    // starfield
    for (const st of g.stars) {
      ctx.globalAlpha = 0.35 + st.z * 0.55;
      ctx.fillStyle = '#9fc0ff';
      ctx.fillRect(st.x, st.y, st.s, st.s);
    }
    ctx.globalAlpha = 1;

    // asteroids
    for (const a of g.asteroids) {
      ctx.save();
      ctx.translate(a.x, a.y); ctx.rotate(a.rot);
      ctx.beginPath();
      for (let i = 0; i < a.verts.length; i++) {
        const ang = (i / a.verts.length) * TAU;
        const rr = a.r * a.verts[i];
        const px = Math.cos(ang) * rr, py = Math.sin(ang) * rr;
        if (i === 0) { ctx.moveTo(px, py); } else { ctx.lineTo(px, py); }
      }
      ctx.closePath();
      ctx.fillStyle = a.rich ? '#1d3a30' : '#23283a';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = a.rich ? '#5be0a0' : '#465070';
      ctx.stroke();
      if (a.rich) {
        ctx.globalAlpha = 0.5 + 0.5 * Math.sin(g.t * 4 + a.x);
        ctx.fillStyle = '#5be0a0';
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.arc(Math.cos(i * 2.1) * a.r * 0.4, Math.sin(i * 2.1) * a.r * 0.4, 2.2, 0, TAU);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      ctx.restore();
      // health while mining
      if (g.beamTarget === a) {
        ctx.strokeStyle = 'rgba(91,224,160,0.9)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(a.x, a.y, a.r + 5, -Math.PI / 2, -Math.PI / 2 + TAU * (a.hp / a.hpMax));
        ctx.stroke();
      }
    }

    // mining beam
    if (g.beamTarget) {
      const p = g.player, a = g.beamTarget;
      ctx.strokeStyle = 'rgba(91,224,160,0.85)';
      ctx.lineWidth = 2 + Math.sin(g.t * 30) * 0.8;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(a.x, a.y); ctx.stroke();
    }

    // enemy bullets
    ctx.fillStyle = '#ff7a6a';
    for (const b of g.ebullets) {
      ctx.beginPath(); ctx.arc(b.x, b.y, 3.5, 0, TAU); ctx.fill();
    }
    // player bullets
    ctx.fillStyle = '#ffe6a0';
    for (const b of g.bullets) {
      ctx.beginPath(); ctx.arc(b.x, b.y, 2.6, 0, TAU); ctx.fill();
    }

    // enemies
    for (const e of g.enemies) {
      const ang = Math.atan2(g.player.y - e.y, g.player.x - e.x);
      ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(ang);
      ctx.fillStyle = e.hit > 0 ? '#ffffff' : (e.heavy ? '#b65a7a' : '#c8617a');
      ctx.strokeStyle = e.heavy ? '#ff9ac0' : '#ff8aa6';
      ctx.lineWidth = 2;
      ctx.beginPath();
      if (e.heavy) {
        ctx.moveTo(e.r, 0); ctx.lineTo(-e.r * 0.6, -e.r * 0.8);
        ctx.lineTo(-e.r, 0); ctx.lineTo(-e.r * 0.6, e.r * 0.8);
      } else {
        ctx.moveTo(e.r, 0); ctx.lineTo(-e.r * 0.7, -e.r * 0.7); ctx.lineTo(-e.r * 0.7, e.r * 0.7);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
      // hp bar
      if (e.hp < e.hpMax) {
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(e.x - e.r, e.y - e.r - 9, e.r * 2, 3);
        ctx.fillStyle = '#ff7a7a';
        ctx.fillRect(e.x - e.r, e.y - e.r - 9, e.r * 2 * (e.hp / e.hpMax), 3);
      }
    }

    // particles
    for (const q of g.particles) {
      ctx.globalAlpha = clamp(q.life * 1.6, 0, 1);
      ctx.fillStyle = q.color;
      ctx.fillRect(q.x - q.r / 2, q.y - q.r / 2, q.r, q.r);
    }
    ctx.globalAlpha = 1;

    // player ship
    drawShip(g);

    // floaters
    ctx.textAlign = 'center';
    for (const f of g.floaters) {
      ctx.globalAlpha = clamp(f.life * 1.3, 0, 1);
      ctx.fillStyle = f.color;
      ctx.font = (f.sm ? 'bold 16px ' : 'bold 15px ') + 'ui-monospace, monospace';
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';

    drawHUD(g);
  }

  function drawShip(g) {
    const p = g.player, s = stats(g);
    // shield bubble
    if (s.shieldMax > 0 && p.shield > 0) {
      ctx.globalAlpha = 0.18 + 0.22 * (p.shield / s.shieldMax);
      ctx.strokeStyle = '#5fb6ff';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(p.x, p.y, 22, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.save();
    ctx.translate(p.x, p.y); ctx.rotate(p.angle);
    // thruster
    if (p.thrusting) {
      ctx.fillStyle = 'rgba(255,200,90,' + (0.5 + Math.random() * 0.4) + ')';
      ctx.beginPath();
      ctx.moveTo(-9, -4); ctx.lineTo(-9, 4); ctx.lineTo(-16 - Math.random() * 8, 0);
      ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = p.hitFlash > 0 ? '#ffffff' : '#cfe8ff';
    ctx.strokeStyle = '#7fb6ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(15, 0); ctx.lineTo(-10, -9); ctx.lineTo(-5, 0); ctx.lineTo(-10, 9);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  function drawHUD(g) {
    const s = stats(g), p = g.player;

    // top-left: hull + shield bars
    barLabeled(20, 22, 240, 'HULL', p.hull, p.hullMax, '#ff6a6a', '#3a1820');
    barLabeled(20, 46, 240, 'SHIELD', p.shield, Math.max(1, s.shieldMax), '#4fb0ff', '#13283f');

    // top-right: salvage / threat / score
    ctx.textAlign = 'right';
    ctx.font = 'bold 18px ui-monospace, monospace';
    ctx.fillStyle = '#9ff7c8';
    ctx.fillText('SALVAGE ' + g.salvage, W - 20, 30);
    ctx.fillStyle = '#cfe0ff';
    ctx.font = '13px ui-monospace, monospace';
    ctx.fillText('SCORE ' + g.score, W - 20, 52);
    const threat = Math.floor(g.t / 30) + 1;
    ctx.fillStyle = '#ff9a9a';
    ctx.fillText('THREAT ' + threat, W - 20, 72);
    ctx.textAlign = 'left';

    // reactor panel bottom-left
    const baseY = H - 120;
    const free = freeCells(g);
    ctx.font = 'bold 13px ui-monospace, monospace';
    ctx.fillStyle = '#9fb8d8';
    ctx.fillText('REACTOR', 20, baseY - 36);
    ctx.fillStyle = free > 0 ? '#ffe27a' : '#5e7398';
    ctx.fillText('FREE ' + free, 110, baseY - 36);

    for (let i = 0; i < SYSTEMS.length; i++) {
      const sys = SYSTEMS[i];
      const y = baseY + i * 26;
      const v = g.reactor.alloc[sys];
      ctx.fillStyle = SYS_COLOR[sys];
      ctx.font = 'bold 12px ui-monospace, monospace';
      ctx.fillText((i + 1) + ' ' + SYS_LABEL[sys], 20, y + 4);
      // pips
      for (let c = 0; c < g.reactor.max; c++) {
        const px = 150 + c * 18, py = y - 9;
        if (c < v) { ctx.fillStyle = SYS_COLOR[sys]; ctx.fillRect(px, py, 14, 13); }
        else {
          ctx.strokeStyle = 'rgba(120,150,200,0.35)'; ctx.lineWidth = 1;
          ctx.strokeRect(px + 0.5, py + 0.5, 13, 12);
        }
      }
    }

    // contextual hints
    ctx.font = '12px ui-monospace, monospace';
    if (g.reactor.alloc.weapons === 0) {
      flashHint(g, 'WEAPONS OFFLINE — press 2 to route power', '#ff8a8a');
    } else if (g.reactor.alloc.mining > 0 && g.beamTarget === null && g.asteroids.length > 0) {
      // mining powered but nothing in range — nudge to approach
    }
    if (g.routeHintT < 6 && g.t < 14) {
      ctx.fillStyle = 'rgba(255,226,122,' + clamp(6 - g.routeHintT, 0, 1) * 0.9 + ')';
      ctx.textAlign = 'center';
      ctx.fillText('Route power with 1-4 (Shift to pull back). You only have so many cells.', W / 2, H - 28);
      ctx.textAlign = 'left';
    }
  }

  function flashHint(g, text, color) {
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.globalAlpha = 0.6 + 0.4 * Math.sin(g.t * 6);
    ctx.fillText(text, W / 2, H - 28);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  }

  function barLabeled(x, y, w, label, val, max, color, bg) {
    ctx.fillStyle = bg;
    ctx.fillRect(x, y, w, 14);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w * clamp(val / max, 0, 1), 14);
    ctx.strokeStyle = 'rgba(160,190,230,0.3)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, 13);
    ctx.fillStyle = '#dfeaff';
    ctx.font = 'bold 10px ui-monospace, monospace';
    ctx.fillText(label + '  ' + Math.max(0, Math.ceil(val)) + '/' + Math.ceil(max), x + 6, y + 11);
  }

  // ---------------------------------------------------------------- upgrades / dock
  const UPGRADES = [
    { id: 'reactor', name: 'Reactor Capacity', max: 4,
      desc: 'Add a power cell to the reactor. More to route everywhere.',
      cost: l => 60 + l * 70,
      apply: g => { g.reactor.capacity++; g.up.lvl.reactor++; } },
    { id: 'hull', name: 'Hull Plating', max: 6,
      desc: '+30 max hull, fully repaired on purchase.',
      cost: l => 40 + l * 35,
      apply: g => { g.player.hullMax += 30; g.player.hull = g.player.hullMax; g.up.lvl.hull++; } },
    { id: 'weapon', name: 'Weapon Calibration', max: 6,
      desc: '+25% weapon damage per cell routed to weapons.',
      cost: l => 50 + l * 45,
      apply: g => { g.up.dmg += 0.25; g.up.lvl.weapon++; } },
    { id: 'shield', name: 'Shield Emitters', max: 6,
      desc: '+25% shield strength and regen per cell.',
      cost: l => 50 + l * 45,
      apply: g => { g.up.shieldEff += 0.25; g.up.lvl.shield++; } },
    { id: 'engine', name: 'Engine Tuning', max: 6,
      desc: '+20% thrust and top speed per cell.',
      cost: l => 45 + l * 40,
      apply: g => { g.up.engineEff += 0.2; g.up.lvl.engine++; } },
    { id: 'mining', name: 'Mining Optics', max: 6,
      desc: '+30% mining yield rate per cell.',
      cost: l => 45 + l * 40,
      apply: g => { g.up.miningEff += 0.3; g.up.lvl.mining++; } },
  ];

  const dockEl = document.getElementById('dock');
  const upgradeListEl = document.getElementById('upgradeList');
  const dockSalvageEl = document.getElementById('dockSalvage');

  function renderDock() {
    const g = game;
    dockSalvageEl.textContent = g.salvage;
    upgradeListEl.innerHTML = '';
    for (const up of UPGRADES) {
      const lvl = g.up.lvl[up.id];
      const maxed = lvl >= up.max;
      const cost = up.cost(lvl);
      const row = document.createElement('div');
      row.className = 'upg' + (maxed ? ' maxed' : '');
      row.innerHTML =
        '<div class="info">' +
          '<div class="name">' + up.name + '</div>' +
          '<div class="desc">' + up.desc + '</div>' +
          '<div class="lvl">LVL ' + lvl + ' / ' + up.max + '</div>' +
        '</div>';
      const btn = document.createElement('button');
      if (maxed) { btn.textContent = 'MAX'; btn.disabled = true; }
      else {
        btn.textContent = cost + ' ⬡';
        btn.disabled = g.salvage < cost;
        btn.onclick = () => {
          if (g.salvage >= cost) {
            g.salvage -= cost;
            up.apply(g);
            renderDock();
          }
        };
      }
      row.appendChild(btn);
      upgradeListEl.appendChild(row);
    }
  }
  function openDock() { if (state !== 'play') { return; } state = 'dock'; renderDock(); dockEl.classList.remove('hidden'); }
  function closeDock() { if (state !== 'dock') { return; } state = 'play'; dockEl.classList.add('hidden'); last = performance.now(); }
  document.getElementById('resumeBtn').onclick = closeDock;
  window.addEventListener('keydown', e => {
    if (state === 'dock' && (e.key === 'Tab' || e.key === 'Escape')) { e.preventDefault(); closeDock(); }
  });

  // ---------------------------------------------------------------- flow
  function start() {
    game = newGame();
    spawnStars(game);
    document.getElementById('title').classList.add('hidden');
    document.getElementById('dead').classList.add('hidden');
    state = 'play';
    last = performance.now();
  }
  function gameOver() {
    state = 'dead';
    document.getElementById('deadStats').innerHTML =
      'Survived ' + Math.floor(game.t) + 's &middot; ' + game.kills + ' kills &middot; ' +
      game.totalSalvage + ' salvage &middot; SCORE ' + game.score;
    document.getElementById('dead').classList.remove('hidden');
  }
  document.getElementById('startBtn').onclick = start;
  document.getElementById('retryBtn').onclick = start;

  // ---------------------------------------------------------------- loop
  function frame(now) {
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.05) { dt = 0.05; } // clamp big gaps (tab switches)
    if (state === 'play') {
      update(dt);
      render();
    } else if ((state === 'dock' || state === 'dead') && game) {
      render(); // keep the frozen scene visible behind overlays
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
