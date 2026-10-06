import * as THREE from 'three';
import { Planet } from './planet.js';
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
import { Highlights } from './highlights.js';
import { LOCATIONS } from './locations.js';
import { clamp, pick, mulberry32 } from './rng.js';
import { SUN, dirFromAngles, darkness, arcDist, tangent } from './geo.js';

const SAVE_KEY = 'moonrunner-save-v1';
const SHOP = [
  { key: 'capacitor', name: 'Flux Capacitor', desc: '+25 thruster energy', cost: 400, max: 3 },
  { key: 'armor', name: 'Ablative Suit Plating', desc: '+25 max health', cost: 350, max: 3 },
  { key: 'dampers', name: 'Mag-Cushion Dampers', desc: 'Safer hard landings, less cargo jostle', cost: 450, max: 3 },
  { key: 'spinner', name: 'Pulse Spinner Mk+', desc: '+30% Pulse Spinner damage', cost: 500, max: 3 },
];
const TIPS = [
  'Hold <b>SPACE</b> to engage the Quantum-Lock skates — they grip the ground and glide without friction.',
  'Dive <b>DOWN</b> into craters with skates on, then launch off the far rim.',
  'Hold <b>E</b> / <b>RIGHT MOUSE</b> for DIVE THRUSTERS: they shove you into downslopes for speed. <b>SHIFT</b> mag-jumps.',
  'In the air, hold <b>Q</b> + <b>W/S</b> to flip, <b>Q</b> + <b>A/D</b> to spin, <b>SHIFT</b> for a Superman. Land upright!',
  'The Moon is round — keep going and you\'ll reach the <b>DARK SIDE</b>. Bring your lamp (<b>L</b>). Pirates live there.',
  'Press <b>F</b> in a hub for the Job Board. Your best action shots end up on the <b>Hall of Highlights</b> at the ILMB.',
];
const CAMP_NAMES = ['Grimtooth Camp', "Vandal's Rest", 'Ashfall Hideout', 'Cutthroat Crater', 'The Junkpile'];

const sleep = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();

function buildLocations() {
  const locs = LOCATIONS.map((l) => ({ ...l, dir: dirFromAngles(l.theta, l.phi) }));
  // a few unmarked pirate camps scattered across the dark side
  const rr = mulberry32(777);
  let k = 0;
  for (let tries = 0; tries < 400 && k < CAMP_NAMES.length; tries++) {
    const d = dirFromAngles(105 + rr() * 70, rr() * 360 - 180);
    if (locs.some((l) => arcDist(d, l.dir) < 900)) continue;
    locs.push({ id: 'camp' + k, name: CAMP_NAMES[k], short: 'CAMP', type: 'pirate', faction: 'pirate', camp: true, r: 55, hostile: true, dark: true, dir: d, blurb: 'A pirate camp. Lights off, guns on.' });
    k++;
  }
  return locs;
}

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

    this.sun = new THREE.DirectionalLight(0xfff1d6, 1.6);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -160; sc.right = 160; sc.top = 160; sc.bottom = -160; sc.near = 10; sc.far = 1400;
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.6;
    this.scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0x9a8cff, 0x40305a, 0.85);
    this.scene.add(this.hemi);
    this.earthLight = new THREE.DirectionalLight(0x6fb8ff, 0.3);
    this.scene.add(this.earthLight, this.earthLight.target);

    this.locations = buildLocations();
    await step('Pouring regolith…');
    this.planet = new Planet(this.scene, this.locations);
    this.colliders = new Colliders();
    this.planet.colliders = this.colliders;
    await step('Building settlements…');
    this.world = new World(this.scene, this.planet, this.colliders, this.locations);
    this.earthLight.position.copy(this.world.earthDir).multiplyScalar(1000);

    this.input = new Input(this.renderer.domElement);
    this.audio = new Audio();
    this.fx = new FX(this.scene, this.camera);
    this.hud = new HUD(this);

    const hub = this.locations[0];
    this.hub = hub;
    this.spawnPoint = this.world.toWorld(hub, 0, 0.5, 108);
    this.spawnFacing = tangent(hub.pos.clone().sub(this.spawnPoint), this.spawnPoint.clone().normalize()).normalize();
    this.cam = {
      fwd: this.spawnFacing.clone(), right: new THREE.Vector3(), look: new THREE.Vector3(), up: this.spawnPoint.clone().normalize(),
      pitch: -0.1, position: new THREE.Vector3(), dist: 8, shake: 0, fov: 72,
    };
    this.player = new Player(this, this.spawnPoint);
    this.player.heading.copy(this.spawnFacing);
    this.missions = new Missions(this);
    this.projectiles = new Projectiles(this);
    await step('Carving craters…');
    this.planet.update(this.spawnPoint, { budgetMs: 1e9 });
    await step('Waking up the pirates…');
    this.enemies = new Enemies(this);
    this.post = new ComicPost(this.renderer, this.camera);
    this.highlights = new Highlights(this);

    this.credits = 250;
    this.rep = {};
    this.stats = { deliveries: 0, bestTrick: 0 };
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
    this.boardCooldown = 0;
    this.lampMode = 'auto';
    this.lastCapture = -999;
    this.wasDark = false;

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
      this.hud.banner(this.hub);
    };
    document.getElementById('start-btn').addEventListener('click', start);
    document.getElementById('pause').addEventListener('click', () => {
      this.hud.show('pause', false);
      this.state = 'play';
      this.input.lock();
    });
    document.getElementById('death').addEventListener('click', () => this.respawn());
    // clicking the game while mouse-look is released just recaptures it
    this.renderer.domElement.addEventListener('click', () => {
      if (this.state === 'play' && !this.input.locked) this.input.lock();
    });
    document.addEventListener('pointerlockchange', () => {
      if (this.input.locked) { this.hud.show('clickhint', false); return; }
      // only an Escape during gameplay pauses; menus release the mouse on purpose
      if (this.state === 'play' && !this.releasing) {
        this.state = 'paused';
        this.hud.show('pause', true);
      }
      this.releasing = false;
    });
    document.addEventListener('pointerlockerror', () => {
      if (this.state === 'play') this.hud.show('clickhint', true);
    });
    this.input.onKey = (code) => {
      if (this.state === 'board') {
        if (code === 'Escape' || code === 'KeyF') { this.closeBoard(code === 'Escape'); return; }
        const n = parseInt(code.replace('Digit', ''), 10);
        if (n >= 1 && n <= 9) {
          const offers = this.missions.offersFor(this.boardLoc);
          if (offers[n - 1] && !this.missions.active) this.acceptOffer(offers[n - 1]);
        }
      } else if (this.state === 'play') {
        if (code === 'KeyM') this.toggleMap();
        if (code === 'KeyH') document.getElementById('help').classList.toggle('hidden');
        if (code === 'KeyT') {
          const p = this.player.params;
          p.thrustMode = p.thrustMode === 'down' ? 'up' : 'down';
          this.hud.toast(p.thrustMode === 'down' ? 'THRUSTERS: DIVE (DOWNWARD)' : 'THRUSTERS: JETPACK (UPWARD)');
        }
        if (code === 'KeyL') {
          this.lampMode = this.lampMode === 'auto' ? 'off' : this.lampMode === 'off' ? 'on' : 'auto';
          this.hud.toast(`HELMET LAMP: ${this.lampMode.toUpperCase()}`);
        }
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

  zoneAt(v, scale = 1) {
    for (const l of this.locations) if (arcDist(v, l.dir) < l.r * scale) return l;
    return null;
  }

  addCredits(n, label) {
    this.credits += n;
    if (label) this.fx.pop(`+₵${n} ${label}`, null, { color: '#7dff6a', size: 40, life: 1.4, rot: -4 });
  }

  style(points, label) {
    if (this.missions.active) this.missions.stylePool += points;
    else this.credits += Math.round(points * 0.5);
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
    this.fx.pop('K.O.!', P.center.clone().addScaledVector(P.up, 3), { color: '#ff2a4a', size: 110, life: 2 });
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
    this.releasing = true;
    this.input.unlock();
    this.save();
  }

  respawn() {
    if (this.state !== 'dead') return;
    this.hud.show('death', false);
    this.enemies.clearPirates();
    this.projectiles.clear();
    this.player.respawn(this.spawnPoint, this.spawnFacing);
    this.cam.fwd.copy(this.spawnFacing);
    this.state = 'play';
    this.input.lock();
  }

  explode(pos, radius, damage, owner, knock = 1) {
    const big = radius > 10;
    const up = pos.clone().normalize();
    this.fx.explosion(pos, radius * 0.7, big);
    const P = this.player;
    const dCam = pos.distanceTo(this.camera.position);
    if (dCam < 600) this.audio.boom(big);
    if (big && dCam < 200) this.cam.shake = Math.min(1.5, this.cam.shake + (1 - dCam / 200));
    if (owner !== 'player' && Math.random() < 0.5 && dCam < 150) this.fx.pop(pick(['BLAM!', 'ZAKK!', 'FWOOM!']), pos.clone().addScaledVector(up, 2), { color: '#ff4f2e', size: 46, life: 0.7 });
    if (!P.dead) {
      const d = pos.distanceTo(P.center);
      if (d < radius + 1) {
        const f = 1 - d / (radius + 1);
        const dmg = damage * f * (owner === 'player' ? 0.3 : 1);
        const dir = P.center.clone().sub(pos);
        if (dir.lengthSq() < 0.01) dir.copy(up);
        dir.normalize();
        // disc-jumping: blasts push you around
        P.vel.addScaledVector(dir, knock * f * 14);
        P.body.grounded = false;
        P.body.sinceContact = 1;
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
        if (owner === 'player' && !t.dead) this.fx.pop('BLAM!', t.center.clone().addScaledVector(up, 2.5), { color: '#ffd23f', size: 48, life: 0.7 });
      }
    }
  }

  actionPanel(kind, subject, caption) {
    if (this.panel && this.panel.t > 0.5 && kind === 'launch') return;
    const captions = {
      launch: ['MEANWHILE, FORTY METRES UP…', 'NO BRAKES. NO REGRETS.', 'GRAVITY? NEVER HEARD OF IT.', 'THE CRATER COULDN\'T HOLD HER!'],
      stolen: ['THE SCRAPJAW GANG STRIKES!', 'HEY! THAT\'S MY PACKAGE!'],
      delivered: ['SIGNED, SEALED, DELIVERED!', 'ANOTHER HAPPY CUSTOMER!'],
      trick: ['STYLE FOR MILES!'],
    };
    const text = caption || pick(captions[kind]);
    // big moments get pinned to the Hall of Highlights
    const worthy = kind === 'trick' || kind === 'delivered' || kind === 'stolen' || (kind === 'launch' && this.player.speed > 55);
    this.panel = { kind, subject, t: 2.6, text, capture: worthy && this.time - this.lastCapture > 15 ? 0.45 : -1 };
    document.getElementById('panel-caption').textContent = text;
    const el = document.getElementById('action-panel');
    el.classList.remove('hidden');
    el.classList.remove('slam'); void el.offsetWidth; el.classList.add('slam');
  }

  // ---------- job board ----------
  openBoard(loc) {
    this.state = 'board';
    this.boardLoc = loc;
    this.releasing = true;
    this.input.unlock();
    this.audio.click();
    this.refreshBoard();
  }

  refreshBoard() {
    const loc = this.boardLoc;
    this.hud.openBoard(loc, this.missions.offersFor(loc), {
      onAccept: (o) => this.acceptOffer(o),
      onClose: () => this.closeBoard(false),
      shop: loc.shop ? SHOP : null,
      onBuy: (k) => this.buy(k),
      upgrades: this.upgrades,
      credits: this.credits,
      active: this.missions.active,
      onAbandon: () => { this.missions.abandon(); this.refreshBoard(); },
      highlights: loc.id === 'ilmb' ? this.highlights.items : null,
    });
  }

  acceptOffer(o) {
    if (this.missions.accept(o)) {
      this.audio.pickup();
      this.closeBoard(false);
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

  closeBoard(viaEscape) {
    this.hud.closeBoard();
    this.state = 'play';
    // swallow the key that closed the board so it can't immediately reopen it
    this.input.justPressed.clear();
    this.boardCooldown = 0.4;
    // Escape can't re-grab the mouse (browser rule), so show a hint instead of pausing
    if (viaEscape) this.hud.show('clickhint', true);
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

    this.updateCamera(dt);
    this.world.update(dt, this.time, this.camera.position);
    this.fx.update(dt);
    this.hud.update(dt);
    this.updateLighting(dt);
    const P = this.player;
    this.audio.update(P.dead ? 0 : P.speed, P.body.skating, P.body.grounded, P.body.thrusting && playing);

    const dark = darkness(P.up);
    this.planet.update(this.camera.position, { budgetMs: 4, maxDist: dark > 0.7 ? 1500 : 3200 });

    const u = this.post.material.uniforms;
    u.time.value = this.time;
    u.speed.value = clamp((P.speed - 28) / 60, 0, 1);
    u.boost.value = P.body.thrusting ? 1 : 0;
    this.damageFlash = Math.max(0, this.damageFlash - dt * 1.5);
    u.damage.value = this.damageFlash * 0.8 + (P.health / P.maxHealth < 0.25 && !P.dead ? 0.25 : 0);
    u.alert.value = this.enemies.bases.some((b) => b.inside && !this.missions.hasClearance(b.loc.id)) ? 1 : 0;

    this.renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
    this.post.render(this.scene, this.camera);
    this.renderPanel(dt);
    this.input.endFrame();
  }

  // Sun, sky fill and the helmet lamp all depend on where you stand on the sphere.
  updateLighting() {
    const P = this.player;
    const up = P.up;
    const e = up.dot(SUN);
    const day = THREE.MathUtils.smoothstep(e, -0.06, 0.12);
    const dark = darkness(up);
    this.sun.intensity = 1.6 * day;
    this.hemi.position.copy(up);
    this.hemi.intensity = 0.06 + 0.8 * THREE.MathUtils.smoothstep(e, -0.25, 0.15);
    this.earthLight.intensity = 0.3 * THREE.MathUtils.smoothstep(up.dot(this.world.earthDir), -0.1, 0.3);
    // shadows only matter where the sun is up
    this.renderer.shadowMap.autoUpdate = day > 0.01;
    const snap = 320 / 2048;
    const p = P.pos;
    _v.set(Math.round(p.x / snap) * snap, Math.round(p.y / snap) * snap, Math.round(p.z / snap) * snap);
    this.sun.target.position.copy(_v);
    this.sun.position.copy(_v).addScaledVector(SUN, 600);
    this.earthLight.target.position.copy(_v);
    this.earthLight.position.copy(_v).addScaledVector(this.world.earthDir, 600);
    const lampOn = this.lampMode === 'on' || (this.lampMode === 'auto' && dark > 0.35);
    const k = P.dead ? 0 : lampOn ? 1 : 0;
    P.lamp.intensity += (k * 9 - P.lamp.intensity) * 0.2;
    P.glowLight.intensity += (k * 1.2 - P.glowLight.intensity) * 0.2;
    const isDark = dark > 0.6;
    if (isDark !== this.wasDark && this.state === 'play') {
      this.wasDark = isDark;
      if (isDark) this.hud.alert('☾ ENTERING THE DARK SIDE ☾', '#3a2b6f', 3.5);
      else this.hud.alert('☀ BACK IN THE LIGHT', '#ff9f1c', 2.5);
    }
    document.getElementById('darkchip').classList.toggle('hidden', !isDark);
  }

  updatePlay(dt) {
    const [mx, my] = this.input.consumeMouse();
    const c = this.cam;
    const P = this.player;
    // parallel-transport the camera heading as you move around the sphere
    c.up.copy(P.pos).normalize();
    c.fwd.addScaledVector(c.up, -c.fwd.dot(c.up));
    if (c.fwd.lengthSq() < 1e-6) c.fwd.copy(P.heading);
    c.fwd.normalize();
    c.fwd.applyQuaternion(_q.setFromAxisAngle(c.up, -mx * 0.0022));
    c.pitch = clamp(c.pitch - my * 0.0022, -1.25, 0.95);
    c.right.crossVectors(c.fwd, c.up).normalize();
    c.look.copy(c.fwd).multiplyScalar(Math.cos(c.pitch)).addScaledVector(c.up, Math.sin(c.pitch));
    this.hurtCd -= dt;
    this.boardCooldown -= dt;

    P.update(dt, this.input, c);
    this.missions.update(dt);
    this.enemies.update(dt, this.time);
    this.projectiles.update(dt);

    for (let i = this.timers.length - 1; i >= 0; i--) {
      const t = this.timers[i];
      t.t -= dt;
      if (t.t <= 0) { this.timers.splice(i, 1); t.fn(); }
    }

    for (const v of this.world.vehicles) if (v.root.visible) this.trafficHit(v.pos, v.radius, v.vel);
    for (const cr of this.world.crawlers) if (cr.root.visible) this.trafficHit(cr.pos.clone().addScaledVector(cr.pos.clone().normalize(), 2), 4, cr.vel);
    const rk = this.world.rocket;
    if (rk && rk.worldPos && rk.root.visible && rk.loc.active) {
      this.trafficHit(rk.worldPos, 8, _v.set(0, 0, 0));
      if (rk.firing && rk.worldPos.distanceTo(P.pos) < 90) this.cam.shake = Math.max(this.cam.shake, 0.4);
    }

    const z = this.zoneAt(P.pos);
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
      if (this.input.pressed('KeyF') && this.boardCooldown <= 0) this.openBoard(z);
    } else this.hud.prompt(null);

    if (this.input.pressed('KeyR')) {
      if (this.missions.active) this.missions.fail('Emergency recall — contract forfeited.');
      P.respawn(this.spawnPoint, this.spawnFacing);
      c.fwd.copy(this.spawnFacing);
      this.fx.pop('RECALLED!', null, { color: '#2ee6ff' });
    }

    if (this.tipIndex < TIPS.length) {
      this.tipTimer -= dt;
      if (this.tipTimer <= 0) {
        const el = document.getElementById('tip');
        el.innerHTML = TIPS[this.tipIndex++];
        el.classList.remove('hidden');
        this.tipTimer = 8;
        clearTimeout(this._tipHide);
        this._tipHide = setTimeout(() => el.classList.add('hidden'), 7000);
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
    const up = c.up.copy(P.pos).normalize();
    if (snap) {
      c.right.crossVectors(c.fwd, up).normalize();
      c.look.copy(c.fwd).multiplyScalar(Math.cos(c.pitch)).addScaledVector(up, Math.sin(c.pitch));
    }
    const sp = P.speed;
    const targetDist = 7.5 + Math.min(7, sp * 0.06);
    c.dist += (targetDist - c.dist) * Math.min(1, dt * 3);
    const target = P.pos.clone().addScaledVector(up, 2.3);
    const want = target.clone().addScaledVector(c.look, -c.dist).addScaledVector(up, 0.8);
    const alt = this.planet.altitude(want);
    if (alt < 1.2) want.addScaledVector(want.clone().normalize(), 1.2 - alt);
    if (snap) c.position.copy(want);
    else c.position.lerp(want, Math.min(1, dt * 18));
    this.camera.position.copy(c.position);
    if (c.shake > 0) {
      c.shake = Math.max(0, c.shake - dt * 2.5);
      this.camera.position.x += (Math.random() - 0.5) * c.shake;
      this.camera.position.y += (Math.random() - 0.5) * c.shake;
      this.camera.position.z += (Math.random() - 0.5) * c.shake;
    }
    this.camera.up.copy(up);
    this.camera.lookAt(target.addScaledVector(c.look, 30));
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
    const up = P.up;
    const side = (f) => new THREE.Vector3().crossVectors(f, up).normalize();
    let focus, from;
    if (p.kind === 'stolen' && p.subject && !p.subject.dead) {
      focus = p.subject.center.clone();
      const hv = tangent(p.subject.body.vel, up);
      if (hv.lengthSq() < 1) hv.copy(this.cam.fwd);
      from = focus.clone().addScaledVector(side(hv.normalize()), 9).addScaledVector(up, 3);
    } else if (p.kind === 'delivered' || p.kind === 'trick') {
      focus = P.center.clone().addScaledVector(up, 0.4);
      const fwd = P.heading;
      from = focus.clone().addScaledVector(fwd, p.kind === 'trick' ? 7 : 4.5).addScaledVector(up, p.kind === 'trick' ? 1.5 : -0.3).addScaledVector(side(fwd), 2);
    } else {
      focus = P.center.clone();
      const hv = tangent(P.vel, up);
      if (hv.lengthSq() < 1) hv.copy(P.heading);
      hv.normalize();
      from = focus.clone().addScaledVector(hv, 10).addScaledVector(up, -5).addScaledVector(side(hv), 5);
    }
    const alt = this.planet.altitude(from);
    if (alt < 0.8) from.addScaledVector(from.clone().normalize(), 0.8 - alt);
    this.panelCam.position.copy(from);
    this.panelCam.up.copy(up);
    this.panelCam.lookAt(focus);
    if (p.capture > 0) {
      p.capture -= dt;
      if (p.capture <= 0) {
        this.lastCapture = this.time;
        this.highlights.capture(this.panelCam, p.text);
      }
    }
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
