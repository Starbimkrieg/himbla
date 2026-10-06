import * as THREE from 'three';
import { Terrain } from './terrain.js';
import { Colliders } from './physics.js';
import { World } from './world.js';
import { Player } from './player.js';
import { Enemies } from './enemies.js';
import { Projectiles } from './projectiles.js';
import { Missions } from './missions.js';
import { FX } from './fx.js';
import { HUD } from './hud.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { ComicPost } from './post.js';
import { LOCATIONS } from './locations.js';
import { clamp, pick } from './rng.js';

const UP = new THREE.Vector3(0, 1, 0);
const SAVE_KEY = 'moonrunner-save-v1';
const SHOP = [
  { key: 'capacitor', name: 'Flux Capacitor', desc: '+25 thruster energy', cost: 400, max: 3 },
  { key: 'armor', name: 'Ablative Suit Plating', desc: '+25 max health', cost: 350, max: 3 },
  { key: 'dampers', name: 'Mag-Cushion Dampers', desc: 'Safer hard landings, less cargo jostle', cost: 450, max: 3 },
  { key: 'spinner', name: 'Pulse Spinner Mk+', desc: '+30% Pulse Spinner damage', cost: 500, max: 3 },
];
const TIPS = [
  'Hold <b>SPACE</b> to engage the Quantum-Lock skates — frictionless gliding!',
  'Dive <b>DOWN</b> into craters with skates on, then launch off the far rim.',
  'Release SPACE to drop into boots and brake hard. Land too fast in boots and you\'ll get hurt.',
  'Hold <b>E</b> or <b>RIGHT MOUSE</b> to fire your thruster. <b>SHIFT</b> mag-jumps.',
  'Press <b>F</b> inside the hub to open the Job Board. <b>LEFT MOUSE</b> fires the Pulse Spinner.',
];

const sleep = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

class Game {
  async init() {
    const status = document.getElementById('load-status');
    const step = async (t) => { status.textContent = t; await sleep(); };

    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    document.getElementById('game').appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x05030c);
    this.camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.5, 9000);
    this.panelCam = new THREE.PerspectiveCamera(50, 1.6, 0.3, 9000);

    this.sunDir = new THREE.Vector3(-4200, 2300, 3600).normalize();
    this.sun = new THREE.DirectionalLight(0xfff1d6, 1.6);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -160; sc.right = 160; sc.top = 160; sc.bottom = -160; sc.near = 10; sc.far = 1400;
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.6;
    this.scene.add(this.sun, this.sun.target);
    this.scene.add(new THREE.HemisphereLight(0x9a8cff, 0x40305a, 0.85));
    const earthLight = new THREE.DirectionalLight(0x6fb8ff, 0.35);
    earthLight.position.set(2600, 2400, -5200);
    this.scene.add(earthLight);

    this.locations = LOCATIONS.map((l) => ({ ...l }));
    await step('Pouring regolith…');
    this.terrain = new Terrain(this.locations);
    await step('Carving craters…');
    this.terrain.buildMeshes(this.scene);
    this.colliders = new Colliders();
    await step('Building settlements…');
    this.world = new World(this.scene, this.terrain, this.colliders, this.locations);

    this.input = new Input(this.renderer.domElement);
    this.audio = new Audio();
    this.fx = new FX(this.scene, this.camera);
    this.hud = new HUD(this);
    this.cam = { yaw: 0, pitch: -0.12, forward: new THREE.Vector3(0, 0, 1), position: new THREE.Vector3(), dist: 8, shake: 0, fov: 72 };

    const hub = this.locations[0];
    this.spawnPoint = new THREE.Vector3(hub.x, hub.h + 0.5, hub.z + 100);
    this.player = new Player(this, this.spawnPoint);
    this.missions = new Missions(this);
    this.projectiles = new Projectiles(this);
    await step('Waking up the pirates…');
    this.enemies = new Enemies(this);
    this.post = new ComicPost(this.renderer, this.camera);

    this.credits = 250;
    this.rep = {};
    this.stats = { deliveries: 0 };
    this.upgrades = { capacitor: 0, armor: 0, dampers: 0, spinner: 0 };
    this.load();
    this.player.applyUpgrades(this.upgrades);
    this.player.health = this.player.maxHealth;

    this.timers = [];
    this.time = 0;
    this.state = 'title';
    this.damageFlash = 0;
    this.currentZone = null;
    this.panel = null;
    this.tipIndex = 0;
    this.tipTimer = 2;
    this.hurtCd = 0;

    this.bindUI();
    window.addEventListener('resize', () => this.resize());
    this.resize();
    status.textContent = 'Ready.';
    document.getElementById('start-btn').classList.remove('hidden');
    this.updateCamera(0.016, true);
    this.last = performance.now();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  bindUI() {
    const start = () => {
      this.audio.init();
      document.getElementById('title').classList.add('hidden');
      this.state = 'play';
      this.input.lock();
      this.hud.banner(this.locations[0]);
    };
    document.getElementById('start-btn').addEventListener('click', start);
    document.getElementById('pause').addEventListener('click', () => {
      this.hud.show('pause', false);
      this.state = 'play';
      this.input.lock();
    });
    document.getElementById('death').addEventListener('click', () => this.respawn());
    document.addEventListener('pointerlockchange', () => {
      if (!this.input.locked && this.state === 'play') {
        this.state = 'paused';
        this.hud.show('pause', true);
      }
    });
    this.input.onKey = (code) => {
      if (this.state === 'board') {
        if (code === 'Escape' || code === 'KeyF') this.closeBoard();
        const n = parseInt(code.replace('Digit', ''), 10);
        if (n >= 1 && n <= 9) {
          const offers = this.missions.offersFor(this.boardLoc);
          if (offers[n - 1] && !this.missions.active) this.acceptOffer(offers[n - 1]);
        }
      } else if (this.state === 'play') {
        if (code === 'KeyM') this.toggleMap();
        if (code === 'KeyH') document.getElementById('help').classList.toggle('hidden');
      } else if (this.state === 'dead' && code === 'Enter') this.respawn();
    };
  }

  toggleMap() {
    this.hud.bigMap = !this.hud.bigMap;
    const m = document.getElementById('minimap');
    m.classList.toggle('big', this.hud.bigMap);
    const size = this.hud.bigMap ? 560 : 210;
    m.width = m.height = size;
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.post.setSize();
  }

  // ---------- services used by other systems ----------
  schedule(t, fn) { this.timers.push({ t, fn }); }

  zoneAt(x, z, scale = 1) {
    for (const l of this.locations) if (Math.hypot(x - l.x, z - l.z) < l.r * scale) return l;
    return null;
  }

  addCredits(n, label) {
    this.credits += n;
    if (label) this.fx.pop(`+₵${n} ${label}`, null, { color: '#7dff6a', size: 40, life: 1.4, rot: -4 });
  }

  style(points, label) {
    if (this.missions.active) this.missions.stylePool += points;
    if (label) this.fx.pop(`${label}! +${points}`, null, { color: '#ff7ad9', size: 44, life: 1.3 });
  }

  damagePlayer(amount, cause) {
    const P = this.player;
    if (P.dead || amount <= 0) return;
    P.health -= amount;
    this.damageFlash = Math.min(1, this.damageFlash + 0.25 + amount / 40);
    this.cam.shake = Math.min(1.5, this.cam.shake + amount / 25);
    this.missions.onDamage(amount);
    if (this.hurtCd <= 0 && amount > 4) { this.audio.hurt(); this.hurtCd = 0.3; }
    if (P.health <= 0) this.die(cause);
  }

  die(cause) {
    const P = this.player;
    P.health = 0;
    P.dead = true;
    P.model.root.visible = false;
    this.fx.explosion(P.center, 8, true);
    this.fx.pop('K.O.!', P.center.clone().add(UP.clone().multiplyScalar(3)), { color: '#ff2a4a', size: 110, life: 2 });
    this.audio.boom(true);
    if (this.missions.active) this.missions.fail('You went down — the cargo is lost.');
    const fee = Math.min(this.credits, 100);
    this.credits -= fee;
    const causes = {
      impact: 'You hit the ground way too hard with your skates off.',
      ram: 'Rammed into oblivion.',
      pirate: 'Scrapjaw pirates blasted you off your skates.',
      mil: 'Military defences turned you into a crater.',
      player: 'Your own Pulse Spinner. Classic.',
    };
    this.hud.death(`${causes[cause] || 'Knocked out.'} Med-evac fee: ₵${fee}`);
    this.state = 'dead';
    this.input.unlock();
    this.save();
  }

  respawn() {
    if (this.state !== 'dead') return;
    this.hud.show('death', false);
    this.enemies.clearPirates();
    this.projectiles.clear();
    this.player.respawn(this.spawnPoint);
    this.cam.yaw = 0;
    this.state = 'play';
    this.input.lock();
  }

  explode(pos, radius, damage, owner, knock = 1, color) {
    const big = radius > 10;
    this.fx.explosion(pos, radius * 0.7, big);
    const P = this.player;
    const dCam = pos.distanceTo(this.camera.position);
    if (dCam < 600) this.audio.boom(big);
    if (big && dCam < 200) this.cam.shake = Math.min(1.5, this.cam.shake + (1 - dCam / 200));
    if (owner !== 'player' && Math.random() < 0.5 && dCam < 150) this.fx.pop(pick(['BLAM!', 'ZAKK!', 'FWOOM!']), pos.clone().add(UP.clone().multiplyScalar(2)), { color: '#ff4f2e', size: 46, life: 0.7 });
    if (!P.dead) {
      const d = pos.distanceTo(P.center);
      if (d < radius + 1) {
        const f = 1 - d / (radius + 1);
        const dmg = damage * f * (owner === 'player' ? 0.3 : 1);
        const dir = P.center.clone().sub(pos);
        if (dir.lengthSq() < 0.01) dir.copy(UP);
        dir.normalize();
        // disc-jumping: blasts push you around
        P.vel.addScaledVector(dir, knock * f * 14);
        P.body.grounded = false;
        this.damagePlayer(dmg, owner);
      }
    }
    for (const t of this.enemies.targets()) {
      if (owner === t.faction) continue;
      const d = pos.distanceTo(t.center);
      if (d < radius + t.radius) {
        const f = 1 - Math.max(0, d - t.radius) / radius;
        this.enemies.damage(t, damage * Math.max(0.25, f), owner === 'player');
        if (t.body) t.body.vel.addScaledVector(t.center.clone().sub(pos).normalize(), knock * f * 8);
        if (owner === 'player' && !t.dead) this.fx.pop('BLAM!', t.center.clone().add(UP.clone().multiplyScalar(2.5)), { color: '#ffd23f', size: 48, life: 0.7 });
      }
    }
  }

  actionPanel(kind, subject) {
    if (this.panel && this.panel.t > 0.5 && kind === 'launch') return;
    const captions = {
      launch: ['MEANWHILE, FORTY METRES UP…', 'NO BRAKES. NO REGRETS.', 'GRAVITY? NEVER HEARD OF IT.', 'THE CRATER COULDN\'T HOLD HER!'],
      stolen: ['THE SCRAPJAW GANG STRIKES!', 'HEY! THAT\'S MY PACKAGE!'],
      delivered: ['SIGNED, SEALED, DELIVERED!', 'ANOTHER HAPPY CUSTOMER!'],
    };
    this.panel = { kind, subject, t: 2.6 };
    document.getElementById('panel-caption').textContent = pick(captions[kind]);
    const el = document.getElementById('action-panel');
    el.classList.remove('hidden');
    el.classList.remove('slam'); void el.offsetWidth; el.classList.add('slam');
  }

  // ---------- job board ----------
  openBoard(loc) {
    this.state = 'board';
    this.boardLoc = loc;
    this.input.unlock();
    this.audio.click();
    this.refreshBoard();
  }

  refreshBoard() {
    const loc = this.boardLoc;
    this.hud.openBoard(loc, this.missions.offersFor(loc), {
      onAccept: (o) => this.acceptOffer(o),
      onClose: () => this.closeBoard(),
      shop: loc.shop ? SHOP : null,
      onBuy: (k) => this.buy(k),
      upgrades: this.upgrades,
      credits: this.credits,
      active: this.missions.active,
      onAbandon: () => { this.missions.abandon(); this.refreshBoard(); },
    });
  }

  acceptOffer(o) {
    if (this.missions.accept(o)) {
      this.audio.pickup();
      this.closeBoard();
    }
  }

  buy(key) {
    const u = SHOP.find((s) => s.key === key);
    const lvl = this.upgrades[key];
    const cost = u.cost * (lvl + 1);
    if (lvl >= u.max || this.credits < cost) return;
    this.credits -= cost;
    this.upgrades[key]++;
    this.player.applyUpgrades(this.upgrades);
    this.audio.cash();
    this.save();
    this.refreshBoard();
  }

  closeBoard() {
    this.hud.closeBoard();
    this.state = 'play';
    this.input.lock();
  }

  save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ credits: this.credits, rep: this.rep, stats: this.stats, upgrades: this.upgrades }));
    } catch { /* storage unavailable */ }
  }

  load() {
    try {
      const d = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
      if (!d) return;
      this.credits = d.credits ?? this.credits;
      this.rep = d.rep || {};
      this.stats = { ...this.stats, ...(d.stats || {}) };
      this.upgrades = { ...this.upgrades, ...(d.upgrades || {}) };
    } catch { /* corrupt or unavailable */ }
  }

  // ---------- main loop ----------
  frame() {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.time += dt;

    const playing = this.state === 'play';
    if (playing) this.updatePlay(dt);
    else this.input.consumeMouse();
    if (this.state === 'dead') {
      this.enemies.update(dt, this.time);
      this.projectiles.update(dt);
    }

    this.world.update(dt, this.time, this.camera.position);
    this.fx.update(dt);
    this.updateCamera(dt);
    this.hud.update(dt);
    this.audio.update(this.player.dead ? 0 : this.player.speed, this.player.body.skating, this.player.body.grounded, this.player.body.thrusting && playing);

    // sun shadow follows the player, snapped to texels to avoid shimmer
    const P = this.player.pos;
    const snap = 320 / 2048;
    const tx = Math.round(P.x / snap) * snap, tz = Math.round(P.z / snap) * snap;
    this.sun.target.position.set(tx, P.y, tz);
    this.sun.position.set(tx, P.y, tz).addScaledVector(this.sunDir, 600);

    const u = this.post.material.uniforms;
    u.time.value = this.time;
    u.speed.value = clamp((this.player.speed - 28) / 60, 0, 1);
    u.boost.value = this.player.body.thrusting ? 1 : 0;
    this.damageFlash = Math.max(0, this.damageFlash - dt * 1.5);
    u.damage.value = this.damageFlash * 0.8 + (this.player.health / this.player.maxHealth < 0.25 && !this.player.dead ? 0.25 : 0);
    u.alert.value = this.enemies.bases.some((b) => b.inside && !this.missions.hasClearance(b.loc.id)) ? 1 : 0;

    this.renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
    this.post.render(this.scene, this.camera);
    this.renderPanel(dt);
    this.input.endFrame();
  }

  updatePlay(dt) {
    const [mx, my] = this.input.consumeMouse();
    this.cam.yaw -= mx * 0.0022;
    this.cam.pitch = clamp(this.cam.pitch - my * 0.0022, -1.25, 0.95);
    this.hurtCd -= dt;

    this.player.update(dt, this.input, this.cam);
    this.missions.update(dt);
    this.enemies.update(dt, this.time);
    this.projectiles.update(dt);

    for (let i = this.timers.length - 1; i >= 0; i--) {
      const t = this.timers[i];
      t.t -= dt;
      if (t.t <= 0) { this.timers.splice(i, 1); t.fn(); }
    }

    // traffic collisions
    const P = this.player;
    for (const s of this.world.shuttles) this.trafficHit(s.pos, 5.5, s.vel);
    for (const c of this.world.crawlers) this.trafficHit(c.pos.clone().add(new THREE.Vector3(0, 2, 0)), 4, c.vel);

    // zones
    const z = this.zoneAt(P.pos.x, P.pos.z);
    if (z !== this.currentZone) {
      if (z) this.hud.banner(z);
      this.currentZone = z;
    }
    const zw = document.getElementById('zonewarn');
    const base = this.enemies.bases.find((b) => b.inside);
    if (base && !this.missions.hasClearance(base.loc.id)) {
      zw.classList.remove('hidden');
      const left = Math.max(0, 4 - base.time);
      zw.innerHTML = base.hostile
        ? `⚠ ${base.loc.name.toUpperCase()}: WEAPONS FREE${base.time > 9 ? ' — ARTILLERY INBOUND' : ''} ⚠`
        : `⚠ RESTRICTED ZONE — ${base.loc.name.toUpperCase()} — LEAVE IN ${left.toFixed(1)}s ⚠`;
    } else if (base) {
      zw.classList.remove('hidden');
      zw.innerHTML = `✔ CLEARANCE ACCEPTED — ${base.loc.name.toUpperCase()}`;
    } else zw.classList.add('hidden');

    if (z && z.safe && !P.dead) P.health = Math.min(P.maxHealth, P.health + (z.repair || 4) * dt);
    if (z && z.jobs) {
      this.hud.prompt(`<b>F</b> — ${z.short} JOB BOARD${z.shop ? ' &amp; UPGRADES' : ''}`);
      if (this.input.pressed('KeyF')) this.openBoard(z);
    } else this.hud.prompt(null);

    if (this.input.pressed('KeyR')) {
      if (this.missions.active) this.missions.fail('Emergency recall — contract forfeited.');
      this.player.respawn(this.spawnPoint);
      this.fx.pop('RECALLED!', null, { color: '#2ee6ff' });
    }

    // tutorial tips
    if (this.tipIndex < TIPS.length) {
      this.tipTimer -= dt;
      if (this.tipTimer <= 0) {
        const el = document.getElementById('tip');
        el.innerHTML = TIPS[this.tipIndex++];
        el.classList.remove('hidden');
        this.tipTimer = 7;
        clearTimeout(this._tipHide);
        this._tipHide = setTimeout(() => el.classList.add('hidden'), 6000);
      }
    }
  }

  trafficHit(pos, r, vel) {
    const P = this.player;
    if (P.dead) return;
    const d = pos.distanceTo(P.center);
    if (d > r + 1) return;
    const n = P.center.clone().sub(pos).normalize();
    const rel = P.vel.clone().sub(vel).dot(n);
    P.body.pos.addScaledVector(n, r + 1 - d);
    if (rel < 0) {
      P.vel.addScaledVector(n, -rel * 1.5);
      if (-rel > 12) {
        this.damagePlayer((-rel - 12) * 2, 'ram');
        this.fx.pop('BONK!', P.center.clone(), { color: '#ffd23f', size: 60 });
        this.audio.thud(-rel);
      }
    }
  }

  updateCamera(dt, snap = false) {
    const P = this.player;
    const c = this.cam;
    const cp = Math.cos(c.pitch);
    c.forward.set(Math.sin(c.yaw) * cp, Math.sin(c.pitch), Math.cos(c.yaw) * cp);
    const sp = P.speed;
    const targetDist = 7.5 + Math.min(7, sp * 0.06);
    c.dist += (targetDist - c.dist) * Math.min(1, dt * 3);
    const target = P.pos.clone().addScaledVector(UP, 2.3);
    const want = target.clone().addScaledVector(c.forward, -c.dist).addScaledVector(UP, 0.8);
    const gh = this.terrain.height(want.x, want.z) + 1.2;
    if (want.y < gh) want.y = gh;
    if (snap) c.position.copy(want);
    else c.position.lerp(want, Math.min(1, dt * 18));
    this.camera.position.copy(c.position);
    if (c.shake > 0) {
      c.shake = Math.max(0, c.shake - dt * 2.5);
      this.camera.position.x += (Math.random() - 0.5) * c.shake;
      this.camera.position.y += (Math.random() - 0.5) * c.shake;
    }
    this.camera.lookAt(target.clone().addScaledVector(c.forward, 30));
    const fov = 72 + Math.min(30, Math.max(0, sp - 15) * 0.3);
    c.fov += (fov - c.fov) * Math.min(1, dt * 3);
    if (Math.abs(this.camera.fov - c.fov) > 0.01) {
      this.camera.fov = c.fov;
      this.camera.updateProjectionMatrix();
    }
  }

  renderPanel(dt) {
    const p = this.panel;
    const el = document.getElementById('action-panel');
    if (!p) return;
    p.t -= dt;
    if (p.t <= 0) {
      el.classList.add('hidden');
      this.panel = null;
      return;
    }
    const P = this.player;
    let focus, from;
    if (p.kind === 'stolen' && p.subject && !p.subject.dead) {
      focus = p.subject.center.clone();
      const side = new THREE.Vector3(-p.subject.body.vel.z, 0, p.subject.body.vel.x).normalize();
      from = focus.clone().addScaledVector(side, 9).addScaledVector(UP, 3);
    } else if (p.kind === 'delivered') {
      focus = P.center.clone().addScaledVector(UP, 0.4);
      const fwd = new THREE.Vector3(Math.sin(P.heading), 0, Math.cos(P.heading));
      from = focus.clone().addScaledVector(fwd, 4.5).addScaledVector(UP, -0.3).addScaledVector(new THREE.Vector3(-fwd.z, 0, fwd.x), 1.5);
    } else {
      focus = P.center.clone();
      const hv = new THREE.Vector3(P.vel.x, 0, P.vel.z);
      if (hv.lengthSq() < 1) hv.set(0, 0, 1);
      hv.normalize();
      from = focus.clone().addScaledVector(hv, 10).addScaledVector(UP, -5).addScaledVector(new THREE.Vector3(-hv.z, 0, hv.x), 5);
      const gh = this.terrain.height(from.x, from.z) + 0.8;
      if (from.y < gh) from.y = gh;
    }
    this.panelCam.position.copy(from);
    this.panelCam.lookAt(focus);
    const r = el.getBoundingClientRect();
    const inset = 6;
    const x = r.left + inset, w = r.width - inset * 2, h = r.height - inset * 2;
    const y = window.innerHeight - r.bottom + inset;
    this.panelCam.aspect = w / h;
    this.panelCam.updateProjectionMatrix();
    const R = this.renderer;
    R.setScissorTest(true);
    R.setScissor(x, y, w, h);
    R.setViewport(x, y, w, h);
    R.render(this.scene, this.panelCam);
    R.setScissorTest(false);
    R.setViewport(0, 0, window.innerWidth, window.innerHeight);
  }
}

const game = new Game();
window.game = game;
const ready = document.fonts && document.fonts.ready ? Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 2500))]) : Promise.resolve();
ready.then(() => game.init()).catch((e) => {
  console.error(e);
  document.getElementById('load-status').textContent = 'Failed to start: ' + e.message;
});
