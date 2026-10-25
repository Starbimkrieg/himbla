// the trailer director (?trailer) first: it sandboxes storage before any module reads a save
import { Trailer, TRAILER } from './trailer.js';
import { HomeTown } from './hometown.js';
import { Spindle } from './spindle.js';
import { loadWorldState, applyWorldState, saveWorldState } from './worldstate.js';
// bundled fonts so the desktop build works offline (fonts.js)
import { loadFonts } from './fonts.js';
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { Planet } from './planet.js';
import { Colliders } from './physics.js';
import { World } from './world.js';
import { Player } from './player.js';
import { loadRunnerParts, loadShipParts } from './models.js';
import { preloadChimeras } from './chimerabuild.js';
import { loadOutpostParts } from './outpostGlb.js';
import { Enemies } from './enemies.js';
import { Projectiles } from './projectiles.js';
import { Missions } from './missions.js';
import { FX } from './fx.js';
import { HUD } from './hud.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { ComicPost } from './post.js';
import { LOCATIONS, SHOPS, FACTIONS } from './locations.js';
import { Reputation } from './reputation.js';
import { Events } from './events.js';
import { GlobeMap } from './mapview.js';
import { Alchemy, MUTATIONS } from './alchemy.js';
import { Race } from './race.js';
import { Rides } from './rides.js';
import { Meteors } from './meteors.js';
import { Grinder } from './rails.js';
import { Gamepad } from './gamepad.js';
import { Haptics } from './haptics.js';
import { DILATE_RATE } from './monolith.js';
import { Cosmetics } from './cosmetics.js';
import { Cheats, DEV_TOOLS, loadDevTools } from './devtools.js';
import { Territory, locationAnchors, holderOf } from './territory.js';
import { Civilians } from './civilians.js';
import { Story } from './story.js';
import { Garage } from './vehicles.js';
import { Winch } from './winch.js';
import { Powers } from './powers.js';
import { Tutorial } from './tutorial.js';
import { Recall } from './recall.js';
import { Respawn } from './respawn.js';
import { Chamber } from './chamber.js';
import { Secrets } from './secrets.js';
import { Settings } from './settings.js'; // settings
import { Casino } from './casino.js'; // casino
import { HALL as CASINO_HALL, inHall as inCasinoHall } from './casinoWorld.js'; // casino
import { SaveSlots } from './saves.js'; // save slots
import { MainMenu } from './menu.js'; // main menu
import { WEAPONS } from './weapons.js';
import { clamp, pick, mulberry32 } from './rng.js';
import { inkMat } from './toon.js';
import { ShadowCache } from './shadowcache.js';
import { SUN, dirFromAngles, darkness, arcDist, tangent, upAt, greatCircle } from './geo.js';

// package.json version (injected by vite.config.js), bottom right on the title and pause screens
for (const el of document.querySelectorAll('.app-ver')) el.textContent = `v${__APP_VERSION__}`;

const SAVE_KEY = 'moonrunner-save-v1';
const CAMP_NAMES = ['Grimtooth Camp', "Vandal's Rest", 'Ashfall Hideout', 'Cutthroat Crater', 'The Junkpile'];

// yield between loading steps so the status line paints; the timer keeps loading going in a hidden tab (no rAF there)
const sleep = () => new Promise((r) => {
  let done = false;
  const go = () => { if (!done) { done = true; setTimeout(r, 0); } };
  requestAnimationFrame(go);
  setTimeout(go, 50);
});
const _v = new THREE.Vector3();
const _ahead = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const JAR_HOLD = 1; // s to hold X to empty the jar
const FROZEN_STATES = new Set(['paused', 'map', 'dialog', 'board', 'log', 'wardrobe', 'dawn']);
const BOARD_TABS = [{ id: 'jobs', label: 'CONTRACTS' }, { id: 'town', label: 'COUNCIL HALL' }]; // your own town's board has the second tab (hometown.js boardPane)
const _sightN = new THREE.Vector3();
const _sightNear = [];
// Threat outline: each enemy's ink shells redrawn in red, pushed out a fixed number of SCREEN pixels so it's equally
// thick at any range and on merged models. Welded corners (smooth normals) keep it unbroken round boxes; it pulses.
const SCAN_INK = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  uniforms: { px: { value: 5 }, res: { value: new THREE.Vector2(1920, 1080) }, color: { value: new THREE.Color(0xff1a2e) } },
  vertexShader: `uniform float px; uniform vec2 res;
    void main() {
      vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      vec3 n = normalize(normalMatrix * normal);
      vec2 d = (projectionMatrix * vec4(n, 0.0)).xy;
      float l = length(d);
      if (l > 1e-5) p.xy += (d / l) * px * 2.0 / res * p.w;
      gl_Position = p;
    }`,
  fragmentShader: 'uniform vec3 color; void main() { gl_FragColor = vec4(color, 1.0); }',
});
const SCAN_GEO = new WeakMap();
function scanGeo(g0) {
  let g = SCAN_GEO.get(g0);
  if (!g) {
    g = new THREE.BufferGeometry();
    g.setAttribute('position', g0.attributes.position.clone());
    if (g0.index) g.setIndex(g0.index.clone());
    g = mergeVertices(g, 1e-3);
    g.computeVertexNormals();
    SCAN_GEO.set(g0, g);
  }
  return g;
}
const _q = new THREE.Quaternion();

// Pirate camps belong on Rustmoon ground. One in another faction's land (or near its border) moves to the closest
// dark-side spot well inside Rustmoon's, clear of every settlement and camp.
const CAMP_KEEP = 1.03, CAMP_DEPTH = 1.6; // depth into Rustmoon ground (rival dist / own dist) to stay, and to land when moved
function keepCampsInRustmoonGround(locs) {
  const anchors = locationAnchors(locs);
  const camps = locs.filter((l) => l.camp);
  const ok = (d, self, depth) => {
    if (darkness(d) < 0.6) return false;
    const h = holderOf(d, anchors);
    if (h.faction !== 'rustmoon' || h.depth < depth) return false;
    return !locs.some((l) => l !== self && arcDist(d, l.dir) < 900);
  };
  const t = new THREE.Vector3();
  for (const c of camps) {
    if (ok(c.dir, c, CAMP_KEEP)) continue;
    const rr = mulberry32(31337 + camps.indexOf(c));
    let moved = false;
    for (let r = 60; r <= 4000 && !moved; r += 60) {
      for (let k = 0; k < 36 && !moved; k++) {
        const a = ((k + rr()) / 36) * Math.PI * 2;
        tangent(t.set(Math.cos(a), 0.3, Math.sin(a)), c.dir).normalize();
        const d = greatCircle(c.dir, t, r);
        if (ok(d, c, CAMP_DEPTH)) { c.dir = d; moved = true; }
      }
    }
  }
}

function buildLocations() {
  const locs = LOCATIONS.map((l) => ({ ...l, dir: dirFromAngles(l.theta, l.phi) }));
  // unmarked pirate camps across the dark side
  const rr = mulberry32(777);
  let k = 0;
  for (let tries = 0; tries < 400 && k < CAMP_NAMES.length; tries++) {
    const d = dirFromAngles(105 + rr() * 70, rr() * 360 - 180);
    if (locs.some((l) => arcDist(d, l.dir) < 900)) continue;
    locs.push({ id: 'camp' + k, name: CAMP_NAMES[k], short: 'CAMP', type: 'pirate', faction: 'rustmoon', camp: true, r: 55, hostile: true, dark: true, dir: d, blurb: 'A pirate camp. Lights off, guns on.' });
    k++;
  }
  keepCampsInRustmoonGround(locs);
  return locs;
}

class Game {
  async init() {
    const status = document.getElementById('load-status');
    const step = async (t) => { status.textContent = t; await sleep(); };
    // save slots first: picking one rewrites the live keys every module below reads
    this.saves = new SaveSlots();
    this.started = false;
    this.menu = new MainMenu(this);
    this.settings = new Settings(); // settings
    this.settings.attach(this); // settings

    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', reversedDepthBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this._frameMs = 16; // smoothed frame time (updateLighting uses it to throttle the shadow map)
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    document.getElementById('game').appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x05030c);
    this.camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.5, 9000);

    this.sun = new THREE.DirectionalLight(0xfff1d6, 1.6);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -160; sc.right = 160; sc.top = 160; sc.bottom = -160; sc.near = 10; sc.far = 1400;
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.6;
    this.sun.shadow.radius = 2.5; // soft PCF edges so they don't step along the terrain grid
    this.scene.add(this.sun, this.sun.target);
    this.shadowCache = new ShadowCache(this); // static casters drawn once (shadowcache.js)
    this.shadowCache.install();
    this.hemi = new THREE.HemisphereLight(0x9a8cff, 0x40305a, 0.85);
    this.scene.add(this.hemi);
    this.earthLight = new THREE.DirectionalLight(0x6fb8ff, 0.3);
    this.scene.add(this.earthLight, this.earthLight.target);

    this.locations = buildLocations();
    // permanent story finale changes (conquered HQ, pirates gone, ILMB fallen)
    this.ws = loadWorldState();
    applyWorldState(this.ws, this.locations);
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
    this.fx.ground = (p, out, lift) => this.planet.ground(p, out, lift); // whichever world you're on
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
    this.rep = new Reputation(this);
    if (this.rep.aligned()) this.rep.outlaw(); // Rustmoon members are outlaws
    this.events = new Events(this);
    this.enemies = new Enemies(this);
    this.globe = new GlobeMap(this);
    this.alchemy = new Alchemy(this);
    this.civilians = this.world.civilians = new Civilians(this); // civilians can be hurt (blast hook + ragdolls)
    this.post = new ComicPost(this.renderer, this.camera);

    this.credits = 250;
    this.stats = { deliveries: 0, bestTrick: 0 };
    this.upgrades = { capacitor: 0, armor: 0, dampers: 0, spinner: 0, seeker: 0, gyro: 0, cradle: 0, flak: 0, overcharge: 0, shadow: 0, jar: 0, scatter: 0, rail: 0, mortar: 0, uplink: 0, twin: 0, winch: 0, cloak: 0 };
    this.load();
    this.race = new Race(this);
    this.rides = new Rides(this);
    this.meteors = new Meteors(this);
    this.grind = new Grinder(this);
    this.pad = new Gamepad(this); // controller support
    this.haptics = new Haptics(this); // ...and its rumble
    if (this.settings) this.haptics.configure(this.settings.v.rumble, this.settings.v.rumbleLevel, this.settings.v.padLight, this.settings.v.padTriggers);
    this.audio.onSfx = (k) => this.haptics.play(k); // sfx rumble too
    this.cosmetics = new Cosmetics(this);
    this.cosmetics.apply();
    this.cheats = new Cheats(this);
    this.devOverlay = this.cheats.overlay; // F3 overlay: frame() and updatePlay() time their stages through it
    this.casino = new Casino(this); // casino
    this.territory = new Territory(this);
    this.story = new Story(this);
    this.town = new HomeTown(this); // your town and the Moon Council (Kepler story)
    this.respawnPt = new Respawn(this); // K.O. respawn: your clinic HQ, else the nearest clinic, else home
    this.spindle = new Spindle(this); // Meridian finale asteroid (the Moon is frozen while you're there)
    this.assetRow = null; // dev showroom, made on first use (cheats.js, assetRow.js; not in release)
    this.garage = new Garage(this);
    this.winch = new Winch(this); // Kepler Hitch-Line Winch
    this.powers = new Powers(this); // E uses the selected power; wheel picks
    this.tutorial = new Tutorial(this);
    this.recall = new Recall(this);
    this.chamber = new Chamber(this); // Moon Council vote cutscene (set built on first use)
    this.secrets = new Secrets(this);
    // pirates start at Rustmoon Hold
    if (this.rep.aligned()) { const h = this.home(); this.player.respawn(h.point, h.facing); this.cam.fwd.copy(h.facing); }
    this.slowmo = 0;
    this.decoys = []; // the Monolith's echo holograms (monolith.js)
    this.alchemy.start();
    this.player.applyUpgrades(this.upgrades);
    this.player.health = this.player.maxHealth;

    // compile every shader now (all settlements, hidden props included) so new materials don't hitch mid-ride
    await step('Warming up shaders…');
    {
      const added = [], forced = [];
      for (const l of this.locations) if (l.group && !l.group.parent) { this.scene.add(l.group); added.push(l); }
      this.scene.traverse((o) => { if (!o.visible) { o.visible = true; forced.push(o); } });
      // into the post target like every frame: its colour space is part of the program key, so canvas-compiled
      // programs would be useless
      this.renderer.setRenderTarget(this.post.target);
      try { await this.renderer.compileAsync(this.scene, this.camera); } catch (e) { console.warn('[shaders] precompile failed', e); }
      // again with helmet lamp, glow and reactor light off (their usual state, syncLocalLights): a second program set
      const idle = [this.player.lamp, this.player.glowLight, this.world.reactorLight].filter(Boolean);
      for (const l of idle) l.visible = false;
      try { await this.renderer.compileAsync(this.scene, this.camera); } catch (e) { console.warn('[shaders] precompile (idle lights) failed', e); }
      this.renderer.setRenderTarget(null);
      for (const l of idle) l.visible = true;
      for (const o of forced) o.visible = false;
      for (const l of added) if (!l.shown) this.scene.remove(l.group); // unless it came into view meanwhile
    }
    this.timers = [];
    this.time = 0;
    this.state = 'title';
    // audio needs a gesture: the first key or click on the title starts the menu track
    const wake = () => {
      if (this.state !== 'title') return;
      this.audio.init();
      this.audio.setMenu(true);
      window.removeEventListener('pointerdown', wake, true);
      window.removeEventListener('keydown', wake, true);
    };
    window.addEventListener('pointerdown', wake, true);
    window.addEventListener('keydown', wake, true);
    this.damageFlash = 0;
    this.currentZone = null;
    this.hurtCd = 0;
    this.boardCooldown = 0;
    this.wasDark = false;

    this.settings.autoDetect(this.renderer); // settings: first launch picks a quality preset
    this.settings.apply(this, true); // settings
    this.bindUI();
    window.addEventListener('resize', () => this.resize());
    this.resize();
    status.textContent = '';
    status.classList.add('hidden');
    this.menu.setReady();
    this.bindSlots();
    this.updateCamera(0.016, true);
    this.last = performance.now();
    this.renderer.setAnimationLoop(() => this.frame());
    if (TRAILER) { this.trailer = new Trailer(this); this.trailer.begin(); }
  }

  bindUI() {
    document.getElementById('quit-btn-pause').addEventListener('click', (e) => {
      e.stopPropagation();
      this.quitToMenu();
    });
    // pause card HELP: the controls panel over a dim backdrop; BACK, Esc or pad B returns. No in-play key for it.
    document.getElementById('help-btn-pause').addEventListener('click', (e) => { e.stopPropagation(); this.openHelp(); });
    document.getElementById('help-back').addEventListener('click', (e) => { e.stopPropagation(); this.closeHelp(); });
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'Escape' || document.getElementById('help').classList.contains('hidden')) return;
      e.preventDefault(); e.stopImmediatePropagation();
      this.closeHelp();
    }, true);
    // dev menu pause entry (shown once F8 / the controller combo has opened it)
    if (DEV_TOOLS) document.getElementById('dev-btn-pause').addEventListener('click', (e) => {
      e.stopPropagation();
      this.hud.show('pause', false);
      this.state = this.resumeState || 'play';
      this.resumeState = null;
      this.cheats.dev();
    });
    document.getElementById('pause').addEventListener('click', () => {
      this.hud.show('pause', false);
      this.state = this.resumeState || 'play';
      this.resumeState = null;
      this.input.lock();
    });
    document.getElementById('death').addEventListener('click', () => this.respawn());
    // clicking the game while released recaptures the mouse
    this.renderer.domElement.addEventListener('click', () => {
      if (this.state === 'play' && !this.input.locked) this.input.lock();     // (a race is watched with a free cursor: race.js setView)
    });
    document.addEventListener('pointerlockchange', () => {
      if (this.input.ptrLocked) {
        // a lock requested when a dialog closed can land after the next dialog opened (chained
        // menus): hand the mouse straight back to the menu
        if (this.state !== 'play' && this.state !== 'cutscene') { this.releasing = true; this.input.unlock(); return; }
        this.hud.show('clickhint', false);
        return;
      }
      // only an Escape during gameplay pauses; menus release the mouse on purpose
      if ((this.state === 'play' || this.state === 'derby') && !this.releasing) {
        this.resumeState = this.state;
        this.state = 'paused';
        this.hud.show('pause', true);
      }
      this.releasing = false;
    });
    document.addEventListener('pointerlockerror', () => {
      if (this.state === 'play' && !this.input.padActive) this.hud.show('clickhint', true);
    });
    this.input.onKey = (code, e) => {
      if (code === 'F3' && this.cheats.unlocked) { e.preventDefault?.(); this.devOverlay.toggle(); return; } // dev overlay (any screen)
      const esc = code === 'Escape';
      if (this.state === 'board') {
        if (esc || code === 'KeyF') { this.closeModal(esc); return; }
        if (this.townBoard(this.boardLoc)) {
          const step = code === 'KeyE' || (code === 'Tab' && !(e && e.shiftKey)) ? 1 : code === 'KeyQ' || code === 'Tab' ? -1 : 0;
          if (step) { if (!(e && e.repeat)) this.setBoardTab(step); return; }
          if (this.boardTab === 'town') { if (!(e && e.repeat)) this.town.boardKey(code); return; } // digits are the page's buttons here; contracts only on CONTRACTS
        }
        const n = parseInt(code.replace('Digit', ''), 10);
        if (n >= 1 && n <= 9) {
          const offers = this.missions.offersFor(this.boardLoc);
          if (offers[n - 1] && this.missions.canTake()) this.acceptOffer(offers[n - 1]);
        }
      } else if (this.state === 'map') {
        if (esc || code === 'KeyM') this.closeModal(esc);
        else if (this.globe.mode === 'radio' && code === 'KeyX' && !(e && e.repeat)) this.globe.radioToggle(); // stop / resume the sweep
      } else if (this.state === 'log') {
        if (esc || code === 'KeyJ') this.closeModal(esc);
      } else if (this.state === 'dialog') {
        if (this.dialogKey) { if (e && e.repeat) return; if (this.dialogKey(code)) return; }
        if (code === 'F8' && this.dialogButtons.dev) { this.pickDialog(this.dialogButtons.length - 1, true); return; }
        const n = parseInt(code.replace('Digit', ''), 10);
        if (code === 'Enter') this.pickDialog(0);
        else if (n >= 1 && n <= this.dialogButtons.length) this.pickDialog(n - 1);
        else if (esc) this.pickDialog(this.dialogButtons.length - 1, esc);
      } else if (this.state === 'derby') {
        if (esc) { this.resumeState = 'derby'; this.state = 'paused'; this.hud.show('pause', true); return; }   // (no pointer lock to lose: Esc pauses here)
        this.race.onKey(code);
      } else if (this.state === 'casino') { // casino
        if (esc) this.casino.close(true); else this.casino.onKey(code);
      } else if (this.state === 'wardrobe') { // wardrobe
        if (esc || code === 'KeyC') this.cosmetics.ui.close(esc); else this.cosmetics.ui.onKey(code);
      } else if (this.state === 'play') {
        if (code === 'KeyM') this.openMap();
        if (code === 'KeyJ') this.openLog();
        if (DEV_TOOLS && code === 'F8') this.cheats.dev(); // hidden dev menu (B, B, X, Y on a controller)
        // hidden testing menu: = and ` together
        if (DEV_TOOLS && ((code === 'Backquote' && this.input.down('Equal')) || (code === 'Equal' && this.input.down('Backquote')))) this.cheats.open();
      } else if (this.state === 'dead' && code === 'Enter') this.respawn();
    };
  }

  // ---------- modal screens (board / map / log / dialog) ----------
  openModal(kind) {
    this.state = kind;
    this.releasing = true;
    this.input.unlock();
    this.audio.click();
  }

  closeModal(viaEscape) {
    this.dialogKey = null;
    this.hud.closeBoard();
    this.hud.closeDialog();
    document.getElementById('globe-wrap').classList.add('hidden');
    document.getElementById('globe-tip').classList.add('hidden');
    document.getElementById('replog').classList.add('hidden');
    if (this.globe.mode) this.globe.setMode(null);
    this.state = 'play';
    // swallow the key that closed it so it can't immediately reopen anything
    this.input.justPressed.clear();
    this.boardCooldown = 0.4;
    // Escape can't re-grab the mouse (browser rule): show a hint instead of pausing
    if (viaEscape && !this.input.padActive) this.hud.show('clickhint', true);
    this.input.lock();
  }

  // opts.radio: opened from the Radio Tower; a click in the fog sends a sweep (mapview.js)
  openMap(opts = {}) {
    this.tutorial.on('map');
    this.openModal('map');
    document.getElementById('globe-wrap').classList.remove('hidden');
    this.globe.center();
    this.globe.setMode(opts.radio ? 'radio' : null);
    this.globe.draw();
  }

  openLog() {
    this.openModal('log');
    this.hud.openRepLog(this);
  }

  // opts: raw / cls (hud.dialog); stay (repaint the open dialog in place: no unlock, no click); onKey(code) -> true if the
  // page used the key (arrows, Enter on a terminal page; digits and Escape still pick buttons); quiet (ms, below)
  dialog(title, text, buttons, opts = {}) {
    if (!(opts.stay && this.state === 'dialog')) this.openModal('dialog');
    this.dialogButtons = buttons;
    this.dialogKey = opts.onKey || null;
    this.dialogQuiet = opts.quiet ? performance.now() + opts.quiet : 0; // until then only the last choice (CLOSE) and Escape act
    this.hud.dialog(title, text, buttons, (i) => this.pickDialog(i), opts);
  }

  pickDialog(i, esc = false) {
    // the page just repainted in place: ignore the second half of a double-click or double-tap
    if (!esc && this.dialogQuiet > performance.now() && i < this.dialogButtons.length - 1) return;
    const b = this.dialogButtons && this.dialogButtons[i];
    if (b && b.keep) { if (b.fn) b.fn(); return; } // keep: the choice repaints its page instead of closing
    this.closeModal(esc);
    if (b && b.fn) b.fn();
  }

  // After saving the wrecked pirate: join Rustmoon?
  wreckChoice() {
    const swear = () => {
      this.rep.rustmoon = 'aligned';
      this.rep.add('rustmoon', 15, 'Saved a Rustmoon smuggler');
      this.rep.add('spacecom', -10, 'Joined the pirates');
      this.rep.outlaw();
      this.hud.toast('The upright factions want you dead now: their towns and patrols shoot on sight. Rustmoon jobs (and smuggling runs) are yours.', 6);
      this.hud.alert('YOU RIDE WITH RUSTMOON NOW', '#7dff3a', 4);
      for (const l of this.locations) if (l.faction === 'rustmoon' && !l.camp) this.globe.discover(l, true);
    };
    const decline = () => {
      this.rep.rustmoon = 'known';
      this.rep.add('rustmoon', 8, 'Saved a Rustmoon smuggler');
      this.hud.toast('Rustmoon owes you one. You can swear in later at Rustmoon Hold.', 5);
      this.globe.discover(this.locations.find((l) => l.id === 'rustmoon'), true);
    };
    this.dialog('RUSTMOON', '"You came back. Nobody comes back for a pirate." She coughs, grins. "Rustmoon looks after its own, Runner. Want to be one of us? Pirates won\'t touch you — but SPACECOM will notice."', [
      { label: '1 · SWEAR IN WITH RUSTMOON', fn: swear },
      { label: '2 · NOT TODAY', fn: decline },
    ]);
  }

  // Dr. Zbornak sells jars and explains the reactor.
  talkScientist() {
    const lvl = this.upgrades.jar || 0;
    const buttons = [];
    const back = () => this.talkScientist(); // answers lead back to the conversation
    if (lvl === 0) buttons.push({ label: '1 · GIVE ME A JAR — ₵400', fn: () => this.buyJar(400, back) });
    else if (lvl < 3) buttons.push({ label: `1 · BIGGER JAR (+1 SLOT) — ₵${500 * lvl}`, fn: () => this.buyJar(500 * lvl) });
    const muts = this.alchemy.mutations.length;
    if (muts) buttons.push({ label: `${buttons.length + 1} · CURE MY MUTATIONS — ₵${200 * muts}`, fn: () => {
      if (this.credits < 200 * muts) { this.hud.toast(`Not enough credits (need ₵${200 * muts}).`, 2); return; }
      this.credits -= 200 * muts; this.audio.cash(); this.alchemy.cure(); this.save();
      this.dialog('DR. ZBORNAK', '"There. Back to boring. I kept the extra arms in a jar, for science."', [{ label: 'THANKS…?' }]);
    } });
    if (!this.upgrades.penlink) buttons.push({ label: `${buttons.length + 1} · REMOTE PEN LINK — ₵1200`, fn: () => {
      if (this.credits < 1200) { this.hud.toast('Not enough credits (need ₵1200).', 2); return; }
      this.credits -= 1200; this.upgrades.penlink = 1; this.audio.cash(); this.save();
      this.dialog('DR. ZBORNAK', '"A quantum tether to the holding pen. Press <b>P</b> anywhere and your creatures will be… relocated. Don\'t think about how. I don\'t."', [{ label: 'NEAT' }]);
    } });
    // three of a salvage kind for a permanent upgrade
    const trade = (kind, key, max, label, done) => {
      const have = this.alchemy.jar.filter((i) => i.kind === kind).length;
      const lv = this.upgrades[key] || 0;
      if (have < 3 || lv >= max) return;
      buttons.push({ label: `${buttons.length + 1} · ${label} (${lv + 1}/${max})`, fn: () => {
        let n = 0;
        this.alchemy.jar = this.alchemy.jar.filter((i) => !(i.kind === kind && n++ < 3));
        this.alchemy.refreshJarMesh();
        this.upgrades[key] = lv + 1;
        this.player.applyUpgrades(this.upgrades);
        this.audio.cash();
        this.save();
        this.dialog('DR. ZBORNAK', done(lv + 1), [{ label: 'NICE' }]);
      } });
    };
    trade('transponder', 'radar', 1, 'HAND OVER 3 TRANSPONDERS — EVENT RADAR', () => '"I have tuned your helmet to their frequencies. Faction events up to two and a half kilometres away now show on the edge of your minimap. You are welcome."');
    trade('plating', 'plating', 3, 'HAND OVER 3 SCRAP PLATES — BOLT-ON ARMOUR', (lv) => `"Riveted to your suit and to every vehicle you own. Ten more hull for you and fifteen percent more for your rides (armour ${lv}/3). Do not ask what holds it on."`);
    const wires = this.alchemy.jar.filter((i) => i.kind === 'wiring').length;
    const gw = this.upgrades.gripwire || 0;
    if (wires >= 3 && gw < 1) buttons.push({ label: `${buttons.length + 1} · HAND OVER 3 ELECTRICAL WIRING — SKATE GRIP TUNE`, fn: () => {
      let n = 0;
      this.alchemy.jar = this.alchemy.jar.filter((i) => !(i.kind === 'wiring' && n++ < 3));
      this.alchemy.refreshJarMesh();
      this.upgrades.gripwire = gw + 1;
      this.player.applyUpgrades(this.upgrades);
      this.audio.cash();
      this.save();
      this.fx.pop('GRIP TUNED!', null, { color: '#ffd23f', size: 50 });
      this.dialog('DR. ZBORNAK', `"Copper! Lovely, stolen copper. I have rewound the magnetic coils in your skates. They will hug the ground a little harder now, and steer a touch sharper. Any tighter and you would be welded to the Moon."`, [{ label: 'STICKY!' }]);
    } });
    else if (wires >= 3) buttons.push({ label: `${buttons.length + 1} · MORE WIRING?`, fn: () => this.dialog('DR. ZBORNAK', '"Your coils are already wound as tight as physics allows. Throw the wire in the reactor if you must."', [{ label: 'OK' }]) });
    const chims = this.alchemy.chimeras.length;
    if (chims) buttons.push({ label: `${buttons.length + 1} · HOLDING PEN (${chims})`, fn: () => this.alchemy.penMenu() });
    buttons.push({ label: `${buttons.length + 1} · HEARD ANY RUMOURS?`, fn: () => this.dialog('DR. ZBORNAK', '"Rumours? Science does not deal in rumours. But… <br><br>• <b>Moon Mites</b> herd together in the sunny craters, well away from settlements. Green dots on your minimap, if you\'re close.<br>• That old satellite, <b>SAT-7 \"Lantern\"</b>, swoops low over the ground just past the ILMB once a lap. Something on its deck glows. You would have to match its speed exactly to land on it. Ha!<br>• Bring me <b>three lengths of electrical wiring</b> from a supply depot, in your jar, and I will rewind your skate coils for extra grip.<br>• Saplings from the farm domes are alive, technically. They splice beautifully.<br>• On the twilight side there is a trench nobody dug: the <b>Whispering Fissure</b>. My instruments go strange near it. Something down there wants a key."', [{ label: 'SPOOKY', fn: back }]) });
    buttons.push({ label: `${buttons.length + 1} · HOW DOES THIS WORK?`, fn: () => this.dialog('DR. ZBORNAK', `"Press <b>G</b> to scoop: rock samples (the glowing crystals on the sunny side), moon dirt (anywhere), black water (stand on a black lake), people, wild moon mites, a dazed pirate, even a whole hover-car if it fits. Things left together in a jar start to react. Bring the jar here and press <b>X</b> to throw everything into my reactor. <b>Two living things make a CHIMERA</b> — race it at Chimera Downs! One thing alone does… other things. Three different non-living things: don\'t. And the splice pod in the corner puts the jar into <i>you</i>."${lvl ? '' : '<br><br>"You don\'t have a jar yet, I notice. I happen to sell them."'}`, lvl ? [{ label: 'GOT IT', fn: back }] : [{ label: '1 · GIVE ME A JAR — ₵400', fn: () => this.buyJar(400, back) }, { label: '2 · GOT IT', fn: back }]) });
    buttons.push({ label: `${buttons.length + 1} · LEAVE` });
    const greet = lvl ? `"Back already? Your jar holds ${2 + lvl}. What have you brought me?"` : '"Ah, a runner! Want to help science? You will need a containment jar. Everything goes in the jar. EVERYTHING."';
    this.dialog('DR. ZBORNAK', greet, buttons);
  }

  // Every hostile in line of sight (terrain and buildings block it) gets a red outline. The Threat Scanner (ILMB
  // upgrade) extends range, holds marks after they duck out of view, and counts squads closing in.
  updateScanner(dt) {
    const lvl = this.upgrades.scanner || 0;
    const chip = document.getElementById('scanchip');
    const range = (lvl > 1 ? 800 : lvl ? 520 : 380) * (this.alchemy && this.alchemy.mutations.includes('hawk') ? 1.5 : 1);
    const cone = Math.cos(lvl > 1 ? 0.3 : 0.18);
    const hold = lvl > 1 ? 20 : 10;
    const P = this.player;
    const cam = this.camera.position;
    const look = this.cam.look;
    let inbound = 0;
    for (const e of this.enemies.list) {
      const threat = !e.dead && e.model && e.center && (e.kind === 'megamite' || (e.faction === 'pirate' && e.kind !== 'core' && !this.enemies.friendly(e)) || (e.base && e.base.hostile) || (e.roam && this.enemies.isHostileTarget(e)));
      let seen = false;
      if (threat) {
        const d = e.center.distanceTo(P.pos);
        if (d < range) {
          if (lvl && (e.state === 'chase' || e.kind === 'megamite')) inbound++;
          // LOS throttled per enemy; the outline holds between checks
          e.losT = (e.losT || 0) - dt;
          if (e.losT <= 0) {
            e.losT = 0.12 + Math.random() * 0.06;
            const psi = this.alchemy && this.alchemy.mutations.includes('psi');
            e.los = this.planet.visible(cam, e.center) && (psi || this.clearSight(cam, e.center, e.radius || 1.5));
          }
          seen = !!e.los;
          if (seen && lvl) {
            _v.copy(e.center).sub(cam).normalize();
            if (_v.dot(look) > cone) {
              if (!(e.scanned > 0)) { this.fx.pop('MARKED', e.center.clone().addScaledVector(e.center.clone().normalize(), 3), { color: '#ff2a4a', size: 30, life: 0.7 }); this.audio.tone(1320, 0.06, 'square', 0.05); }
              e.scanned = hold;
            }
          }
        } else e.los = false;
      }
      const on = threat && (seen || e.scanned > 0);
      if (e.scanned > 0) e.scanned -= dt;
      if (on !== !!e.scanOn && e.model) {
        e.scanOn = on;
        if (!e.inkHulls) { e.inkHulls = []; e.model.root.traverse((o) => { if (o.userData.isInk) e.inkHulls.push(o); }); }
        for (const h of e.inkHulls) {
          if (on) {
            if (!h.userData.geo0) h.userData.geo0 = h.geometry;
            h.geometry = scanGeo(h.userData.inkGeo ? h.userData.inkGeo.scan || h.userData.inkGeo.thin : h.userData.geo0);
            h.material = SCAN_INK;
          } else {
            h.geometry = h.userData.inkGeo ? h.userData.inkGeo.thin : h.userData.geo0 || h.geometry;
            h.material = h.userData.inkMat || inkMat;
          }
        }
      }
    }
    // outline thickness in px, scaled to the screen, slow pulse
    const H = this.renderer.domElement.height;
    SCAN_INK.uniforms.res.value.set(this.renderer.domElement.width, H);
    SCAN_INK.uniforms.px.value = (H / 1080) * (5.5 + Math.sin(this.time * 6) * 1.2);
    chip.classList.toggle('hidden', !inbound);
    if (inbound) chip.textContent = `⚠ SCANNER: ${inbound} HOSTILE${inbound > 1 ? 'S' : ''} INBOUND`;
  }

  // Is the line a-b free of building colliders? (terrain checked separately)
  clearSight(a, b, endR = 1.5) {
    const d = a.distanceTo(b);
    const n = Math.min(48, Math.max(2, Math.ceil(d / 5)));
    for (let i = 1; i < n; i++) {
      const t = i / n;
      if (t * d > d - endR - 1) break;
      _v2.lerpVectors(a, b, t);
      for (const c of this.colliders.query(_v2, 0.4, _sightNear)) {
        if (c.platform) continue;
        if (this.colliders.contact(c, _v2, 0.2, _sightN) > 0) return false;
      }
    }
    return true;
  }

  // The splice pod: put yourself in with the jar.
  usePod() {
    const A = this.alchemy;
    // no recipe list on purpose: players find out
    const mine = A.mutations.length ? `<br><br>Currently spliced into you: <b>${A.mutations.map((k) => MUTATIONS[k].name).join(', ')}</b>` : '';
    const buttons = A.jar.length ? [{ label: '1 · SPLICE ME WITH THE JAR', fn: () => A.spliceSelf() }, { label: '2 · ABSOLUTELY NOT' }] : [{ label: 'OK' }];
    this.dialog('SPLICE POD', `A humming glass pod, warm to the touch. The label reads: <i>"INSERT JAR. INSERT SELF. RESULTS NOT GUARANTEED, REVERSIBLE, OR EXPLAINED."</i>${mine}`, buttons);
  }

  buyJar(cost, then) {
    if (this.credits < cost) { this.hud.toast(`Not enough credits (need ₵${cost}).`, 2); return; }
    this.credits -= cost;
    const first = !(this.upgrades.jar || 0);
    this.upgrades.jar = (this.upgrades.jar || 0) + 1;
    this.alchemy.refreshJarMesh();
    this.audio.cash();
    this.save();
    // clipped to your pack from now on
    this.dialog('DR. ZBORNAK', first
      ? `"One containment jar, clipped to your pack. See? Right there. It holds ${this.alchemy.slots}. Press <b>G</b> to scoop something, <b>X</b> here to feed it to my reactor."`
      : `"A bigger jar. It holds ${this.alchemy.slots} now. Same rules: <b>G</b> scoops, <b>X</b> feeds the reactor."`, [{ label: 'THANKS, DOC', fn: then }]);
  }

  jobsAt(loc) {
    if (!loc) return [];
    if (loc.type === 'pirate') return this.rep.aligned() && !loc.camp ? ['rustmoon', 'rustmoon'] : [];
    return loc.jobs || [];
  }

  isSafe(loc) {
    if (!loc) return false;
    if (loc.type === 'pirate') return this.rep.aligned() && !(loc.destroyedUntil && this.time < loc.destroyedUntil);
    return !!loc.safe && !this.rep.hostile(loc.faction);
  }

  // Home (deploy, respawn, recall): the ILMB, or the HQ of your story faction (Rustmoon Hold once sworn in).
  home() {
    const f = this.rep && this.rep.aligned() ? 'rustmoon' : (this.story && this.story.faction);
    // your town is home once it has a shuttle pad (always, as Kepler's Councillor)
    const town = this.locations.find((l) => l.id === 'hometown');
    const loc = town && (f === 'kepler' || (this.town && this.town.has('pad'))) ? town
      : f && f !== 'spacecom' ? this.locations.find((l) => l.hq && l.faction === f) : null;
    if (!loc) return { point: this.spawnPoint, facing: this.spawnFacing, loc: this.hub };
    return this.spotNear(loc);
  }

  // a clear patch just inside a place and the facing from it (cached)
  spotNear(loc) {
    this._homes = this._homes || {};
    if (!this._homes[loc.id]) {
      let point = null;
      for (let rad = loc.r * 0.45; rad < loc.r * 0.9 && !point; rad += 8) {
        for (let k = 0; k < 16 && !point; k++) {
          const a = Math.PI + (k % 2 ? 1 : -1) * Math.floor((k + 1) / 2) * 0.4;
          const p = this.world.toWorld(loc, Math.sin(a) * rad, 1.2, Math.cos(a) * rad);
          if (!this.colliders.query(p, 6, []).some((c) => this.colliders.contact(c, p, 5, _v) > 0)) point = this.world.toWorld(loc, Math.sin(a) * rad, 0.5, Math.cos(a) * rad);
        }
      }
      point = point || this.world.toWorld(loc, 0, 0.5, loc.r * 0.55);
      const facing = tangent(loc.pos.clone().sub(point), point.clone().normalize()).normalize();
      this._homes[loc.id] = { point, facing, loc };
    }
    return this._homes[loc.id];
  }

  // Off the Moon: on the Spindle (Meridian finale) or in the dev-only Asset Row. The Moon is hidden and frozen then.
  away() { return this.spindle.active || (this.assetRow !== null && this.assetRow.active); }

  // nearest settlement that would let you in (null when away or none is safe)
  nearestSettlement() {
    if (!this.player || this.away()) return null;
    const d = this.player.pos.clone().normalize();
    let best = null, bd = Infinity;
    for (const l of this.locations) {
      if (!this.isSafe(l)) continue;
      const a = arcDist(d, l.dir);
      if (a < bd) { bd = a; best = l; }
    }
    return best;
  }

  // where a loaded save puts you: by the settlement nearest your saved spot (home if none, or it's closed to you)
  resumeSpot() {
    const l = this.savedNear && this.locations.find((x) => x.id === this.savedNear);
    return l && this.isSafe(l) ? this.spotNear(l) : this.home();
  }

  objective() {
    return this.tutorial.objective() || this.story.objective() || (this.events.active && this.events.objective()) || this.missions.objective();
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
    // style only pays during a delivery (pools into the job bonus); +points only shown then
    if (this.missions.active) this.missions.stylePool += points;
    if (label) this.fx.pop(this.missions.active ? `${label}! +${points}` : `${label}!`, null, { color: '#ff7ad9', size: 44, life: 1.3, prio: 1 });
  }

  damagePlayer(amount, cause, from = null) {
    const P = this.player;
    if (P.dead || amount <= 0 || this.cheats.god) return;
    if (this.assetRow !== null && this.assetRow.active) return; // Asset Row is harmless
    if (this.story.absorb(from)) return;
    if (cause === 'ram' && this.grind) this.grind.knockOff(P);
    // vehicles soak hits (and can be wrecked); sniper rounds go through the glass
    if (P.vehicle && cause !== 'sniper') { amount = this.garage.hit(amount); if (amount <= 0) return; }
    P.health -= amount;
    this.haptics.hit(amount);
    this.damageFlash = Math.min(1, this.damageFlash + 0.25 + amount / 40);
    this.cam.shake = Math.min(1.5, this.cam.shake + amount / 25);
    if (!(P.vehicle && P.vehicle.def.cargoSafe)) this.missions.onDamage(amount);
    if (this.hurtCd <= 0 && amount > 4) { this.audio.hurt(); this.hurtCd = 0.3; }
    if (P.health <= 0) this.die(cause);
  }

  die(cause) {
    const P = this.player;
    if (this.assetRow !== null && this.assetRow.active) { this.assetRow.respawnAt(); return; } // no K.O. in the Asset Row
    P.health = 0;
    P.dead = true;
    P.model.root.visible = false;
    this.fx.explosion(P.center, 8, true);
    this.haptics.play('death');
    this.fx.pop('K.O.!', P.center.clone().addScaledVector(P.up, 3), { color: '#ff2a4a', size: 110, life: 2, prio: 2 });
    this.audio.boom(true);
    if (this.missions.active) this.missions.failAll('You went down — the cargo is lost.');
    this.story.onDeath();
    if (this.events.active) this.events.fail(this.events.active, 'You went down. Event failed.');
    if (P.vehicle) this.garage.exit();
    const fee = Math.min(this.credits, 100);
    this.credits -= fee;
    const causes = {
      impact: 'You hit the ground way too hard with your skates off.',
      ram: 'Rammed into oblivion.',
      crash: 'You wrapped your vehicle round something solid.',
      pirate: 'Scrapjaw pirates blasted you off your skates.',
      mil: 'Military defences turned you into a crater.',
      player: 'Your own Pulse Spinner. Classic.',
      kade: "Shredded by Captain Kade's gun truck. Should've stayed low.",
      anomaly: 'Vaporised by a phase anomaly. For science.',
      meteor: 'Flattened by a meteor. The sky literally fell on you.',
      alien: 'Vaporised by the mothership. It does not want you to have that core.',
      void: 'You fell off the Spindle into the dark.',
    };
    const spin = this.spindle && this.spindle.active;
    const plan = spin ? null : this.respawnPt.plan(P.pos.clone().normalize()); // the card says where you'll wake up
    this.hud.death(`${causes[cause] || 'Knocked out.'} Med-evac fee: ₵${fee}`, spin ? 'Click or press ENTER to call the recovery transit.' : `Click or press ENTER to redeploy at ${plan.name}.${plan.note ? ' ' + plan.note : ''}`);
    this.state = 'dead';
    this.releasing = true;
    this.input.unlock();
    this.save();
  }

  respawn() {
    if (this.state !== 'dead') return;
    if (this.spindle && this.spindle.active) {
      // on the Spindle: a recovery transit cutscene back to the Monolith
      this.hud.show('death', false);
      this.projectiles.clear();
      this.input.lock(); // now, on the click: pointer lock needs a gesture
      this.spindle.recover();
      return;
    }
    this.hud.show('death', false);
    this.enemies.clearPirates();
    this.enemies.forgive();
    this.projectiles.clear();
    // your clinic HQ, else the nearest clinic, else home (respawn.js)
    this.respawnPt.deploy(this.respawnPt.plan(this.player.pos.clone().normalize()));
    this.state = 'play';
    this.input.lock();
  }

  explode(pos, radius, damage, owner, knock = 1, spare = false) {
    const big = radius > 10;
    const up = upAt(pos);
    this.fx.explosion(pos, radius * 0.7, big);
    const P = this.player;
    const dCam = pos.distanceTo(this.camera.position);
    if (dCam < 600) this.audio.boom(big);
    this.haptics.boom(dCam, big);
    if (big && dCam < 200) this.cam.shake = Math.min(1.5, this.cam.shake + (1 - dCam / 200));
    if (owner !== 'player' && Math.random() < 0.5 && dCam < 150) this.fx.pop(pick(['BLAM!', 'ZAKK!', 'FWOOM!']), pos.clone().addScaledVector(up, 2), { color: '#ff4f2e', size: 46, life: 0.7 });
    if (!P.dead && !spare) {
      const d = pos.distanceTo(P.center);
      if (d < radius + 1) {
        const f = 1 - d / (radius + 1);
        const dmg = damage * f * (owner === 'player' ? 0.3 : 1);
        const dir = P.center.clone().sub(pos);
        if (dir.lengthSq() < 0.01) dir.copy(up);
        dir.normalize();
        // disc-jumping: blasts push you around
        P.vel.addScaledVector(dir, knock * f * 14 * (owner === 'player' ? 1 : P.knockResist || 1));
        P.body.grounded = false;
        P.body.sinceContact = 1;
        this.damagePlayer(dmg, owner);
      }
    }
    if (owner !== 'player' && owner !== 'ally') {
      for (const o of this.events.protect) {
        if (o.dead) continue;
        const d = pos.distanceTo(o.center);
        if (d < radius + o.radius) {
          o.hp -= damage * Math.max(0.3, 1 - d / (radius + o.radius));
          if (o.hp <= 0) { o.dead = true; this.fx.explosion(o.center, 9, true); }
        }
      }
    }
    // other blastables (outposts, road traffic) register here: fn(pos, radius, damage, owner).
    // Meteor landings hurt NPCs on their own terms (meteors.js calls meteorBlast on enemies, civilians and traffic).
    if (owner !== 'meteor') for (const fn of this.blastHooks || []) fn(pos, radius, damage, owner);
    for (const t of owner === 'meteor' ? [] : this.enemies.targets()) {
      if (owner === t.faction) continue;
      // allies take no harm from you and only hurt their targets; base guns don't shell their own defenders
      if (t.faction === 'ally' && owner === 'player') continue;
      if (owner === 'ally' && !this.enemies.allyTarget(t)) continue;
      if (owner === 'mil' && t.foe && t.foe !== 'rustmoon') continue;
      if (owner === 'alien' && t.faction === 'beast') continue;
      const d = pos.distanceTo(t.center);
      if (d < radius + t.radius) {
        const f = 1 - Math.max(0, d - t.radius) / radius;
        this.enemies.damage(t, damage * Math.max(0.25, f), owner === 'player');
        if (t.body) t.body.vel.addScaledVector(t.center.clone().sub(pos).normalize(), knock * f * 8);
        if (owner === 'player' && !t.dead) this.fx.pop('BLAM!', t.center.clone().addScaledVector(up, 2.5), { color: '#ffd23f', size: 48, life: 0.7 });
      }
    }
  }

  // ---------- job board ----------
  // your town's board has a second tab, the council hall (F opens on CONTRACTS; screens from the hall page reopen on it)
  townBoard(loc) { return !!(loc && loc.id === 'hometown' && this.town && this.town.loc === loc && this.town.state); }

  openBoard(loc, tab = 'jobs') {
    this.tutorial.on('board');
    this.boardLoc = loc;
    this.boardTab = this.townBoard(loc) ? tab : 'jobs';
    this.openModal('board');
    this.refreshBoard();
  }

  // to: a tab id, or +1 / -1
  setBoardTab(to) {
    if (!this.townBoard(this.boardLoc)) return;
    const ids = BOARD_TABS.map((t) => t.id), i = ids.indexOf(this.boardTab);
    const id = typeof to === 'number' ? ids[(i + to + ids.length) % ids.length] : to;
    if (id === this.boardTab || !ids.includes(id)) return;
    this.audio.click();
    this.boardTab = id;
    this.refreshBoard();
  }

  refreshBoard() {
    const loc = this.boardLoc;
    const town = this.townBoard(loc);
    this.hud.openBoard(loc, this.missions.offersFor(loc), {
      tabs: town ? BOARD_TABS : null,
      tab: this.boardTab,
      onTab: (id) => this.setBoardTab(id),
      pane: town && this.boardTab === 'town' ? this.town.boardPane() : null,
      onAccept: (o) => this.acceptOffer(o),
      onClose: () => this.closeModal(false),
      shop: SHOPS[loc.id] || null,
      rep: this.rep,
      event: this.events.active,
      onEventAbandon: () => { this.events.abandon(); this.refreshBoard(); },
      onBuy: (k) => this.buy(k),
      upgrades: this.upgrades,
      credits: this.credits,
      active: this.missions.active,
      extra: this.missions.extra && this.missions.extra.a,
      canTake: this.missions.canTake(),
      onAbandon: () => { this.missions.abandon(); this.refreshBoard(); },
    });
  }

  acceptOffer(o) {
    if (this.missions.accept(o)) {
      this.audio.pickup();
      this.closeModal(false);
    }
  }

  buy(key) {
    const u = (SHOPS[this.boardLoc.id] || []).find((s) => s.key === key);
    if (!u) return;
    const lvl = this.upgrades[key] || 0;
    const cost = u.cost * (lvl + 1);
    if (lvl >= u.max || this.credits < cost || !this.rep.canBuy(u, lvl)) return;
    this.credits -= cost;
    this.upgrades[key] = lvl + 1;
    this.player.applyUpgrades(this.upgrades);
    // Moon Council stock: vehicles and story tech
    if (u.vehicle && !this.story.vehicles.includes(u.vehicle)) { this.story.vehicles.push(u.vehicle); this.story.save(); this.hud.toast(`${u.name} is yours. Press V (hold V to choose).`, 3); }
    if (u.tech && !this.story.tech.includes(u.tech)) { this.story.tech.push(u.tech); this.story.save(); this.hud.toast(`${u.name} fitted.`, 3); }
    // new clothes go on at once
    if (key.startsWith('outfit_')) { this.cosmetics.outfit = key.slice(7); this.cosmetics.apply(); this.hud.toast('Looking sharp. Change outfits any time with C.', 3); }
    if (key.startsWith('skates_')) { this.cosmetics.skates = key.slice(7); this.cosmetics.apply(); this.hud.toast('New skate finish fitted. Change it any time with C.', 3); }
    this.audio.cash();
    this.save();
    this.refreshBoard();
  }

  save() {
    try {
      // near: the closest settlement, so a load puts you beside it
      if (this.started && this.state !== 'title') { const n = this.nearestSettlement(); if (n) this.savedNear = n.id; }
      const row = this.assetRow !== null && this.assetRow.active ? this.assetRow.keep : null; // in the Asset Row: save the Moon's values from when you left
      localStorage.setItem(SAVE_KEY, JSON.stringify({ credits: row ? row.credits : this.credits, stats: row ? row.stats : this.stats, upgrades: this.upgrades, near: this.savedNear || null }));
    } catch { /* storage unavailable */ }
    if (this.started && this.saves) this.saves.snapshot(this.slotMeta()); // save slots
  }

  // ---------- save slots / main menu ----------
  // Behind the title screen: a slow orbit round one sunlit place after another.
  updateTitleTour(dt) {
    const P = this.player;
    if (!this.tour) {
      const want = ['ilmb', 'meridian', 'kepler', 'casino', 'downs', 'tranq', 'vostok', 'shackleton', 'aldrin', 'rustmoon'];
      const list = want.map((id) => this.locations.find((l) => l.id === id)).filter((l) => l && darkness(l.dir) < 0.35);
      this.tour = { list: list.length ? list : [this.hub], i: -1, t: 1e9, fade: document.getElementById('tourfade') };
      if (!this.tour.fade) {
        const f = document.createElement('div');
        f.id = 'tourfade';
        const title = document.getElementById('title'); // under the menu, over the 3D view
        title.parentNode.insertBefore(f, title);
        this.tour.fade = f;
      }
    }
    const T = this.tour;
    const SHOT = 24;
    T.t += dt;
    if (T.t > SHOT) {
      T.i = (T.i + 1) % T.list.length;
      T.t = 0;
      T.a0 = Math.random() * Math.PI * 2;
      const loc = T.list[T.i];
      // park the hidden runner there so terrain, shadows and life build round the shot
      P.respawn(this.world.toWorld(loc, 0, 1, 0), null);
      P.model.root.visible = false;
      this.planet.update(this.world.toWorld(loc, loc.r, 60, 0), { budgetMs: 1e9 });
    }
    const loc = T.list[T.i];
    const R = loc.r * 1.15 + 70, h = 38 + loc.r * 0.18;
    const a = T.a0 + T.t * 0.045;
    const cam = this.camera;
    cam.position.copy(this.world.toWorld(loc, Math.cos(a) * R, h, Math.sin(a) * R));
    cam.up.copy(loc.dir);
    cam.lookAt(this.world.toWorld(loc, 0, 8, 0));
    this.cam.position.copy(cam.position);
    if (Math.abs(cam.fov - 60) > 0.01) { cam.fov = 60; cam.updateProjectionMatrix(); }
    // fade to black between places
    const edge = Math.min(T.t, SHOT - T.t);
    T.fade.style.opacity = String(Math.max(0, 1 - edge / 0.9));
  }

  // After a story finale: title card, rebuild what changed behind it, back up a week later at home (no reload;
  // the bulletin explains).
  newDawn(title, bulletin) {
    this.ws.bulletin = null; // shown here, not on the next load
    saveWorldState(this.ws);
    const el = document.createElement('div');
    el.id = 'dawn';
    el.innerHTML = `<div class="dw-t">${title}</div><div class="dw-s">ONE WEEK LATER…</div>`;
    document.body.appendChild(el);
    this.state = 'dawn';
    this.audio.boom(true);
    // once the card is black: rebuild, go home
    setTimeout(() => {
      this.chamber.reveal(0); // the card now covers a council vote's black. First, so a throw below can't leave the Moon black with no HUD
      try { this.applyWorldLive(); } catch (e) { console.error(e); }
      if (this.player.vehicle) this.garage.exit();
      this.enemies.clearPirates();
      this.projectiles.clear();
      const h = this.home();
      this.player.respawn(h.point, h.facing);
      this.cam.fwd.copy(h.facing);
      this.cam.pitch = -0.1;
      this.updateCamera(0.016, true);
      this.story.save();
      this.save();
    }, 1400);
    setTimeout(() => {
      el.classList.add('out');
      this.state = 'play';
      setTimeout(() => { el.remove(); this.dialog('MOON NEWS BULLETIN', bulletin, [{ label: 'WHOA' }]); }, 1100);
    }, 4200);
  }

  // Re-apply the world state to the live Moon and rebuild every place it changed.
  applyWorldLive() {
    const sig = (l) => JSON.stringify([l.type, l.faction, !!l.hostile, !!l.lawless, l.conqueredFrom || '', !!l.restricted, l.defense || null, !!l.launchPad, !!l.blackSun, l.r, l.name]);
    const before = new Map(this.locations.map((l) => [l, sig(l)]));
    applyWorldState(this.ws, this.locations);
    const added = this.locations.filter((l) => !before.has(l));
    const changed = this.locations.filter((l) => before.has(l) && before.get(l) !== sig(l));
    // the town replaces your outpost: its flat goes with the new plateau (look it up before refreshWorld forgets it)
    const rep = this.ws.town && this.territory.outposts.find((o) => o.built && o.id === this.ws.town.replaces);
    for (const l of added) {
      this.planet.addZone(l, l.id === 'hometown' && rep ? [rep.dir] : []);
      // re-ground crystals in the new plateau's blend ring
      const cosNear = Math.cos((l.r * 2.2) / this.planet.R);
      for (const cr of this.world.crystals || []) {
        if (cr.pos.clone().normalize().dot(l.dir) <= cosNear) continue;
        this.planet.ground(cr.pos, cr.pos);
        cr.mesh.position.copy(cr.pos);
      }
      this.world.buildLocation(l); this.world.prepCulling(l);
    }
    for (const l of changed) this.world.rebuildLocation(l);
    const all = [...changed, ...added];
    for (const l of all) delete this.missions.offers[l.id];
    this.enemies.refreshLocations(all);
    this.territory.refreshWorld();
    if (added.some((l) => l.id === 'hometown')) {
      this.town = new HomeTown(this);
      this.world.traffic.registerLocation(this.town.loc); // traffic was built without it
      this.globe.discover(this.town.loc, true);
    }
    this._homes = {};
  }

  // called by the main menu (from a click or key, so pointer lock is allowed)
  startPlay() {
    if (this.started) return;
    this.started = true;
    this.audio.init();
    this.audio.setMenu(false);
    // back from the title tour: runner home, camera behind
    if (this.tour) {
      if (this.tour.fade) this.tour.fade.style.opacity = '0';
      const h = this.ws.bulletin ? this.home() : this.resumeSpot(); // a finale's new dawn starts at home
      this.player.respawn(h.point, h.facing);
      this.player.model.root.visible = true;
      this.cam.fwd.copy(h.facing);
      this.cam.pitch = -0.1;
      this.camera.fov = 72; this.camera.updateProjectionMatrix();
      this.updateCamera(0.016, true);
      this.tour = null;
    } else if (this.savedNear && !this.ws.bulletin) {
      // no title tour (straight into play after a reload)
      const h = this.resumeSpot();
      this.player.respawn(h.point, h.facing);
      this.cam.fwd.copy(h.facing);
      this.cam.pitch = -0.1;
      this.updateCamera(0.016, true);
    }
    document.getElementById('title').classList.add('hidden');
    this.state = 'play';
    this.input.lock();
    this.enterPlace(this.hub);
    // first load after a finale: the bulletin
    if (this.ws.bulletin) {
      const news = this.ws.bulletin;
      this.ws.bulletin = null;
      saveWorldState(this.ws);
      this.schedule(1.5, () => this.dialog('MOON NEWS BULLETIN', news, [{ label: 'WHOA' }]));
    }
    // new runners get the training shift offer
    if (!this.tutorial.done && !this.tutorial.active) this.schedule(1.2, () => this.tutorial.offer());
    this.save();
  }

  slotMeta() {
    return { credits: this.credits, deliveries: (this.stats && this.stats.deliveries) || 0, faction: (this.story && this.story.faction) || null };
  }

  // Play-time clock and periodic snapshots into the active slot.
  bindSlots() {
    let n = 0;
    setInterval(() => {
      if (!this.started || this.saves.switching) return;
      if (!document.hidden && this.state !== 'paused') this.saves.sessionPlay += 1;
      if (++n % 10 === 0) this.save();
    }, 1000);
    window.addEventListener('beforeunload', () => { if (this.started && !this.saves.switching) this.save(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.started && !this.saves.switching) this.save(); });
  }

  quitToMenu() {
    if (this.assetRow !== null && this.assetRow.active) this.assetRow.exit(); // back on the Moon before saving
    this.save();
    this.saves.toMenu(this.slotMeta());
  }

  load() {
    try {
      const d = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
      if (!d) return;
      this.credits = d.credits ?? this.credits;
      this.stats = { ...this.stats, ...(d.stats || {}) };
      if (this.stats.smuggled && !this.stats.blackMarket) this.stats.blackMarket = (SHOPS.rustmoon || []).filter((u) => u.unlock && u.unlock.smuggle && u.unlock.n <= this.stats.smuggled).map((u) => u.key);
      this.upgrades = { ...this.upgrades, ...(d.upgrades || {}) };
      this.savedNear = d.near || null;
    } catch { /* corrupt or unavailable */ }
  }

  // ---------- main loop ----------
  frame() {
    const now = performance.now();
    if (this.settings && this.settings.skip(now)) return; // settings: frame-rate cap
    const dbg = this.devOverlay;
    dbg.begin(); // dev overlay timing
    if (this.settings) this.settings.perfSample(now - this.last, this.state === 'play'); // first launch: is the preset too much?
    let rdt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (this.trailer) rdt = this.trailer.pre(rdt); // trailer: shot clock, staged input
    // FROZEN_STATES freeze the whole world (traffic, satellite, particles, clocks)
    if (this.pad) { this.pad.update(rdt); this.pad.crosshair(rdt); } // before anything reads input
    dbg.lap('pad');
    dbg.updateInput(); // dev overlay: controller map, held keys
    dbg.lap('debug');
    this.cheats.freeCam.takeInput(rdt); // free cam: while on, it owns keys and mouse; the game gets blank input until giveBack()
    const frozen = FROZEN_STATES.has(this.state);
    const dt = frozen ? 0 : rdt;
    this.time += dt;
    // the Radio Tower sweep runs on real time in play and on the map; pause, dialog or K.O. hold it
    if (this.town && this.town.radio && (this.state === 'play' || this.state === 'map') && !this.away()) this.town.radio.tick(rdt, this.state === 'map');

    const playing = this.state === 'play';
    if (!playing) { if (this.garage && this.garage.radial) this.garage.closeRadial(false); this.vHold = 0; } // the vehicle wheel and a pending V / Y tap end with the play screen
    if (playing && !this.world.mergeDone) this.world.finishMerges(); // static geometry (world.mergeLocation)
    if (playing) this.updatePlay(dt);
    else if (this.state === 'derby' || (this.state === 'dialog' && this.race.holdsCamera())) this.race.watch(dt); // watching your chimera race (and the podium behind the result): the race drives the camera
    else this.input.consumeMouse();
    if (this.state === 'dead') {
      this.enemies.update(dt, this.time);
      this.projectiles.update(dt);
    }

    this.recall.update(dt);
    this.chamber.update(dt, rdt); // real time too: its fade keeps easing under a dialog
    this.spindle.updateRecovery(dt);
    if (this.state === 'title') this.updateTitleTour(rdt);
    else if (this.state !== 'cutscene' && this.state !== 'derby' && !(this.state === 'dialog' && this.race.holdsCamera())) this.updateCamera(dt);
    this.cheats.freeCam.view(); // free cam view, so world and terrain build round it
    if (this.trailer) this.trailer.camera(rdt); // trailer: the shot owns the camera
    dbg.lap('other');
    // the Monolith's time dilation: the world crawls, you don't
    const wdt = playing && this.alchemy.buffs.dilate > 0 ? dt * DILATE_RATE : dt;
    if (!this.away()) this.world.update(wdt, this.time, this.camera.position);
    if (playing && !this.away()) this.player.rideCarry(); // carried by a moving deck (you, model, camera)
    this.fx.update(wdt, rdt); // popups on real time (not frozen or dilated)
    dbg.lap('world');
    this.hud.update(rdt);
    if (!this.away()) this.updateLighting(dt);
    const P = this.player;
    this.audio.setZone(this.musicZone());
    this.audio.update(P.dead ? 0 : P.speed, P.body.skating, P.body.grounded, P.body.thrusting && playing, frozen); // frozen: no wind, skate hum or thrusters
    this.haptics.update(rdt);
    dbg.lap('hud');

    const dark = darkness(P.up);
    // build-ahead: terrain workers start where you'll be in ~1.5 s
    _ahead.copy(this.player.body.vel).clampLength(0, 200).multiplyScalar(1.5).add(this.camera.position);
    this.planet.update(this.camera.position, { budgetMs: 4, ahead: _ahead, maxDist: (dark > 0.7 ? 1500 : 3200) * (this.settings ? this.settings.v.viewDist : 1) }); // settings
    dbg.lap('terrain');

    const u = this.post.material.uniforms;
    u.time.value = this.time;
    u.speed.value = clamp((P.speed - 38) / 90, 0, 1) * 0.55; // speed lines only once you're really moving
    u.boost.value = P.body.thrusting ? 1 : 0;
    u.invert.value += ((this.alchemy && this.alchemy.buffs.invert > 0 ? 1 : 0) - u.invert.value) * 0.1;
    this.damageFlash = Math.max(0, this.damageFlash - dt * 1.5);
    u.damage.value = (this.damageFlash * 0.8 + (P.health / P.maxHealth < 0.25 && !P.dead ? 0.25 : 0)) * (this.settings ? this.settings.v.damageFlash : 1); // settings
    u.alert.value = this.enemies.bases.some((b) => b.inside && ((b.restricted && !b.authorized) || b.hostile)) ? 1 : 0;
    u.fade.value = this.chamber.fade;
    if (this.chamber.on) u.speed.value = u.boost.value = u.damage.value = u.alert.value = 0; // no Moon effects in the chamber

    if (this.trailer) this.trailer.post(u);
    this.renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
    this.syncLocalLights();
    dbg.renderStart();
    if (this.cheats.debugView) this.cheats.renderDebug(); // dev menu: polygon / draw-call views
    else if (this.chamber.on) this.post.render(this.chamber.scene, this.chamber.camera); // council cutscene draws its own set
    else this.post.render(this.scene, this.camera);
    dbg.renderEnd();
    this.cheats.freeCam.giveBack();
    this.input.endFrame();
    dbg.end();
  }

  openHelp() {
    this.refreshHelp();
    this.hud.show('help', true);
    this.hud.show('pause', false);
  }

  closeHelp() {
    if (document.getElementById('help').classList.contains('hidden')) return;
    this.hud.show('help', false);
    // back to the pause card, unless resumed meanwhile
    if (this.state === 'paused') this.hud.show('pause', true);
  }

  // The controls panel (pause → HELP) lists only what you can do yet: data-req rows appear as features unlock.
  refreshHelp() {
    const st = this.story, up = this.upgrades || {};
    const has = {
      weapons: WEAPONS.some((w) => w.unlock && (up[w.unlock] || 0) > 0),
      vehicle: !!(st && st.vehicles && st.vehicles.length),
      power: !!(this.powers && this.powers.owned().length),
      teleport: !!(st && st.tech && st.tech.includes('teleport')),
      pen: !!up.penlink,
      jar: !!(this.alchemy && this.alchemy.owned),
    };
    let hidden = 0;
    for (const tr of document.querySelectorAll('#help tr[data-req]')) {
      const on = !!has[tr.dataset.req];
      tr.style.display = on ? '' : 'none';
      if (!on) hidden++;
    }
    const more = document.getElementById('help-more');
    if (more) more.style.display = hidden ? '' : 'none';
  }

  // Music for where you are: casino, Chimera Downs and the lab have their own, as does the dark side; else the
  // speed-driven roaming groove.
  musicZone() {
    if (this.trailer && this.trailer.zone) return this.trailer.zone; // trailer: the shot picks the track
    if (this.state === 'derby') return 'downs';
    if (this.state === 'casino') return 'casino';
    if (this.spindle && this.spindle.active) return 'dark'; // Meridian finale, on the Spindle
    if (this.assetRow !== null && this.assetRow.active) return 'dark'; // dev Asset Row
    const P = this.player;
    // the Monolith shares the lab's track
    this._musicLocs ||= ['casino', 'downs', 'antimatter', 'monolith'].map((id) => this.locations.find((l) => l.id === id)).filter(Boolean);
    for (const l of this._musicLocs) {
      if (arcDist(P.pos, l.dir) < l.r * 1.5) return l.id === 'antimatter' || l.id === 'monolith' ? 'lab' : l.id;
    }
    return darkness(P.up) > 0.6 ? 'dark' : 'free';
  }

  // A settlement's banner shows only on the first visit (saved); after that the name sits under the territory chip
  // (territory.js setPlace).
  enterPlace(loc) {
    const seen = this.stats.seenPlaces || (this.stats.seenPlaces = []);
    if (seen.includes(loc.id)) return;
    seen.push(loc.id);
    this.hud.banner(loc);
  }

  // 'casino' or 'lab' inside the casino hall or Dr. Zbornak's lab, else null. Indoors the HUD hides (casino only)
  // and wipeouts don't ragdoll you.
  updateIndoors() {
    const p = this.player.pos, w = this.world;
    let where = null;
    const cas = w.casino;
    if (cas && cas.loc.active) {
      const l = cas.toLocal(p, _v);
      if (l.y > -3 && l.y < CASINO_HALL.H && inCasinoHall(l.x, l.z)) where = 'casino';
    }
    const lab = w.lab;
    if (!where && lab && lab.loc.active) {
      const l = lab.loc.group.worldToLocal(_v.copy(p));
      if (l.y > -3 && l.y < lab.half.h && Math.abs(l.x) < lab.half.w && Math.abs(l.z) < lab.half.d) where = 'lab';
    }
    this.indoors = where;
    document.body.classList.toggle('in-casino', where === 'casino'); // style.css hides the HUD
  }

  // Helmet lamp, its glow and the reactor light are at intensity 0 nearly always, but every lit pixel still loops
  // over them. While all three are idle they're hidden, removing them from the shaders (same picture, cheaper). They
  // toggle together, so only two light set-ups exist (both warmed up in init). Call once a frame, after anything that
  // sets their intensity.
  syncLocalLights() {
    const L = this._localLights || (this._localLights = []);
    const P = this.player, rl = this.world.reactorLight;
    if (L[0] !== P.lamp || L[1] !== P.glowLight || L[2] !== rl) { L[0] = P.lamp; L[1] = P.glowLight; L[2] = rl; this._localLit = undefined; } // a rebuilt lab brings a new reactor light
    const lit = L.some((l) => l && l.intensity > 0);
    if (lit === this._localLit) return;
    this._localLit = lit;
    for (const l of L) if (l) l.visible = lit;
  }

  // dev Asset Row: you, your shots and the row. Story, powers, missions, events and timers wait on the Moon.
  updateRow(dt, c) {
    this.cheats.tick();
    this.player.update(dt, this.input, c);
    this.assetRow.update(dt);
    this.projectiles.update(dt, dt);
  }

  // on the Spindle: you, your shots, the story step and the asteroid; the Moon waits
  updateAway(dt, c) {
    const P = this.player;
    this.cheats.tick();
    P.update(dt, this.input, c);
    this.story.update(dt);
    this.spindle.update(dt);
    this.hud.eventPanel(this.story.panel());
    this.powers.update(dt);
    this.projectiles.update(dt, dt);
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const t = this.timers[i];
      t.t -= dt;
      if (t.t <= 0) { this.timers.splice(i, 1); t.fn(); }
    }
  }

  // sun, sky fill and helmet lamp all depend on where you stand on the sphere
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
    // shadows only where the sun is up. The shadow map is the heaviest pass (casters within 160 m into 2048²), so at
    // 50+ fps while moving slowly it refreshes every other frame (the old map stays valid; a frame-old shadow is
    // invisible at that speed). Fast skating, a teleport or a slow frame rate redraw it every frame.
    const sm = this.renderer.shadowMap;
    const now = performance.now();
    if (this._shT) this._frameMs += (Math.min(100, now - this._shT) - this._frameMs) * 0.1;
    this._shT = now;
    const moved = this._shPos ? P.pos.distanceTo(this._shPos) : 1e9;
    const calm = this._frameMs < 20 && P.speed < 25 && moved < 6;
    const refresh = !calm || (this._shFlip = !this._shFlip);
    sm.autoUpdate = false;
    sm.needsUpdate = day > 0.01 && refresh;
    if (day > 0.01 && refresh) { if (!this._shPos) this._shPos = new THREE.Vector3(); this._shPos.copy(P.pos); }
    // The shadow box follows you in whole texels along the light's axes, so shadows don't swim; stepping is also what
    // lets static casters' shadows be kept between refreshes (shadowcache.js).
    this.shadowCache.centre(P.pos, _v);
    this.sun.target.position.copy(_v);
    this.sun.position.copy(_v).addScaledVector(SUN, 600);
    this.earthLight.target.position.copy(_v);
    this.earthLight.position.copy(_v).addScaledVector(this.world.earthDir, 600);
    // helmet lamp: on in the dark and underground, off in the sun (the trailer can force it: lampForce)
    const lampOn = this.lampForce != null ? this.lampForce : dark > 0.35 || (this.secrets && this.secrets.isUnder(P.pos));
    const k = P.dead ? 0 : lampOn ? 1 : 0;
    P.lamp.intensity += (k * 9 - P.lamp.intensity) * 0.2;
    if (!k && P.lamp.intensity < 0.01) P.lamp.intensity = 0; // snap to exactly 0 so syncLocalLights can switch it off
    // void skin: a wide violet glow in the dark, no lamp
    const voidSight = this.alchemy.mutations.includes('void') && dark > 0.35 && !P.dead;
    P.glowLight.distance = voidSight ? 140 : 26;
    P.glowLight.color.setHex(voidSight ? 0xb69cff : 0x9be7ff);
    const glowK = voidSight ? 4 : k * 1.2;
    P.glowLight.intensity += (glowK - P.glowLight.intensity) * 0.2;
    if (!glowK && P.glowLight.intensity < 0.005) P.glowLight.intensity = 0;
    // The banner and minimap tint follow the terminator itself (sun-dot = 0, as on the globe map) with ~22 m of
    // hysteresis. darkness() ramps further in and would fire ~390 m late.
    const isDark = this.wasDark ? e < 0.006 : e < -0.006;
    if (isDark !== this.wasDark && this.state === 'play') {
      this.wasDark = isDark;
      if (isDark) this.hud.alert('☾ ENTERING THE DARK SIDE ☾', '#3a2b6f', 3.5);
      else this.hud.alert('☀ BACK IN THE LIGHT', '#ff9f1c', 2.5);
    }
    document.getElementById('minimap').classList.toggle('dark', isDark); document.body.classList.toggle('dark-side', isDark); // minimap glows purple on the dark side
  }

  updatePlay(dt) {
    // slow-motion (villain entrances)
    if (this.slowmo > 0) { this.slowmo -= dt; dt *= 0.3; }
    let [mx, my] = this.input.consumeMouse();
    // the vehicle radial (hold V) takes the mouse while open
    if (this.garage && this.garage.radial) { this.garage.radialMove(mx, my); mx = my = 0; }
    const c = this.cam;
    const P = this.player;
    const dbg = this.devOverlay;
    // parallel-transport the camera heading round the sphere
    upAt(P.pos, c.up);
    c.fwd.addScaledVector(c.up, -c.fwd.dot(c.up));
    if (c.fwd.lengthSq() < 1e-6) c.fwd.copy(P.heading);
    c.fwd.normalize();
    const sv = this.settings ? this.settings.v : null; // settings
    const sens = 0.0022 * (sv ? sv.sensitivity : 1) * (P.scoped ? 0.28 : 1); // settings; slower aim while scoped
    c.fwd.applyQuaternion(_q.setFromAxisAngle(c.up, -mx * sens));
    c.pitch = clamp(c.pitch - my * sens * (sv && sv.invertY ? -1 : 1), -1.25, 1.48); // nearly straight up, to shoot things overhead
    c.right.crossVectors(c.fwd, c.up).normalize();
    c.look.copy(c.fwd).multiplyScalar(Math.cos(c.pitch)).addScaledVector(c.up, Math.sin(c.pitch));
    this.hurtCd -= dt;
    this.boardCooldown -= dt;

    if (this.assetRow !== null && this.assetRow.active) { this.updateRow(dt, c); return; } // before secrets.preUpdate: the Moon's satellite must not run
    this.secrets.preUpdate(dt);
    if (this.spindle.active) { this.updateAway(dt, c); return; }
    this.cheats.tick();
    this.updateIndoors();
    dbg.lap('indoors');
    P.update(dt, this.input, c); // player.js times its own parts
    this.secrets.update(dt);
    dbg.lap('secrets');
    this.missions.update(dt);
    dbg.lap('missions');
    this.events.update(dt);
    if (!this.events.active) this.hud.eventPanel(this.story.panel());
    dbg.lap('events');
    this.globe.update(dt);
    dbg.lap('globe');
    this.territory.update(dt);
    dbg.lap('territory');
    this.story.update(dt);
    dbg.lap('story');
    this.town.update(dt);
    dbg.lap('town');
    this.tutorial.update(dt);
    dbg.lap('tutorial');
    this.garage.update(dt);
    dbg.lap('garage');
    const tech = this.story.hudTech();
    if (tech !== this.lastTech) { document.getElementById('techchip').innerHTML = tech; this.lastTech = tech; }
    dbg.lap('techchip');
    this.alchemy.update(dt);
    dbg.lap('alchemy');
    this.race.update(dt);
    dbg.lap('race');
    this.rides.update();
    dbg.lap('rides');
    const wdt = this.alchemy.buffs.dilate > 0 ? dt * DILATE_RATE : dt; // the Monolith's time dilation
    this.meteors.update(wdt);
    dbg.lap('meteors');
    if (this.input.pressed('KeyG')) this.alchemy.scoop();
    // X is a hold so a stray tap never throws away a stewing jar; a tap on an empty jar still says so
    const A = this.alchemy;
    if (this.input.down('KeyX') && A.jar.length && !this.player.dead && !this.jarHoldDone) {
      const force = this.input.down('ShiftLeft') || this.input.down('ShiftRight');
      const lab = this.world.lab;
      const feed = !force && lab && this.player.pos.distanceTo(lab.reactor) < 11;
      this.jarHold = (this.jarHold || 0) + dt;
      this.hud.recallHold(this.jarHold / JAR_HOLD, null, `HOLD ${this.settings ? this.settings.label('KeyX') : 'X'} · ${feed ? 'FEED THE JAR TO THE REACTOR' : 'DUMP THE JAR'}`);
      if (this.jarHold >= JAR_HOLD) { this.jarHold = 0; this.jarHoldDone = true; this.hud.recallHold(0); A.empty(force); }
    } else if (this.jarHold) { this.jarHold = 0; this.hud.recallHold(0); }
    if (!this.input.down('KeyX')) this.jarHoldDone = false;
    if (this.input.pressed('KeyX') && !A.jar.length) A.empty();
    if (this.input.pressed('KeyC') && this.boardCooldown <= 0) this.cosmetics.wardrobe();
    if (this.input.pressed('KeyP') && this.boardCooldown <= 0 && !this.player.rag) {
      if (this.upgrades.penlink) this.alchemy.penMenu();
      else this.hud.toast('No pen link. Dr. Zbornak sells a remote holding-pen link at the Antimatter Lab.', 3);
    }
    // V: tap to call / board / leave; hold (2+ vehicles) for the radial. Not while ragdolled or on the Hitch-Line.
    if (this.player.rag || this.winch.on) {
      if (this.garage.radial) this.garage.closeRadial(false);
      if (this.winch.on && this.input.pressed('KeyV')) this.hud.toast('Let go of the Hitch-Line first.', 1.5);
      this.vHold = 0;
    }
    else if (this.input.pressed('KeyV') && this.boardCooldown <= 0 && !this.rides.ride) this.vHold = 1e-4;
    if (this.vHold) {
      if (this.input.down('KeyV')) {
        this.vHold += dt;
        if (this.vHold > 0.22 && !this.garage.radial && !this.player.vehicle && this.garage.owned().length > 1) this.garage.openRadial();
      } else {
        if (this.garage.radial) this.garage.closeRadial(true); else this.garage.toggle();
        this.vHold = 0;
      }
    }
    dbg.lap('keys');
    this.powers.update(dt);
    dbg.lap('powers');
    if (this.input.pressed('KeyT') && this.boardCooldown <= 0 && !this.player.rag) this.story.useTech('teleport');
    if (this.input.pressed('KeyN')) { const on = this.audio.toggleMusic(); this.hud.toast(this.audio.muted ? `Music ${on ? 'on' : 'off'} (all audio is muted: Settings → Audio)` : on ? '♪ Music on' : 'Music off', this.audio.muted ? 3 : 1.5); }
    this.cosmetics.update(dt);
    dbg.lap('cosmetics');
    this.updateScanner(dt);
    dbg.lap('scanner');
    this.enemies.update(wdt, this.time);
    this.projectiles.update(dt, wdt);
    dbg.lap('enemies');

    for (let i = this.timers.length - 1; i >= 0; i--) {
      const t = this.timers[i];
      t.t -= dt;
      if (t.t <= 0) { this.timers.splice(i, 1); t.fn(); }
    }

    for (const cr of this.world.crawlers) if (cr.root.visible) this.trafficHit(cr.pos.clone().addScaledVector(cr.pos.clone().normalize(), 2), 4, cr.vel);
    const rk = this.world.rocket;
    if (rk && rk.worldPos && rk.root.visible && rk.loc.active) {
      this.trafficHit(rk.worldPos, 8, _v.set(0, 0, 0));
      if (rk.firing && rk.worldPos.distanceTo(P.pos) < 90) this.cam.shake = Math.max(this.cam.shake, 0.4);
    }

    const z = this.zoneAt(P.pos);
    if (z !== this.currentZone) {
      if (z) this.enterPlace(z);
      this.territory.setPlace(z ? z.name : null); // name under the territory chip while inside
      this.currentZone = z;
    }
    const zw = document.getElementById('zonewarn');
    const base = this.enemies.bases.find((b) => b.inside && (b.restricted || b.hostile));
    let zwText = '';
    if (base && !base.restricted) {
      zwText = `⚠ ${FACTIONS[base.faction].name.toUpperCase()} DEFENSES ARE FIRING ON YOU ⚠`;
    } else if (base && !base.authorized) {
      const left = Math.max(0, 4 - base.time);
      zwText = base.hostile
        ? `⚠ ${base.loc.name.toUpperCase()}: WEAPONS FREE${base.time > 9 ? ' — ARTILLERY INBOUND' : ''} ⚠`
        : `⚠ RESTRICTED ZONE — ${base.loc.name.toUpperCase()} — LEAVE IN ${left.toFixed(1)}s ⚠`;
    } else if (base) {
      zwText = base.grace ? `✔ ${(base.graceWhy || 'delivery signed for').toUpperCase()} — ${base.loc.name.toUpperCase()} · CLEARED UNTIL YOU LEAVE` : `✔ CLEARANCE ACCEPTED — ${base.loc.name.toUpperCase()}`;
    }
    if (zwText) {
      zw.classList.remove('hidden');
      if (zwText !== this.lastZoneWarn) { zw.innerHTML = zwText; this.lastZoneWarn = zwText; }
    } else zw.classList.add('hidden');

    // settlements heal you, unless their defences are shooting at you
    const zBase = z && this.enemies.bases.find((b) => b.loc === z);
    const engaged = zBase && (zBase.hostile || zBase.aggro > 0);
    if (this.isSafe(z) && !P.dead && !engaged) P.health = Math.min(P.maxHealth, P.health + (z.repair || 6) * dt);
    // Flak Weave regen: P.regen HP every 3 s while hurt
    if (P.regen && !P.dead && P.health < P.maxHealth) {
      P.regenT = (P.regenT || 0) + dt;
      if (P.regenT >= 3) { P.regenT -= 3; P.health = Math.min(P.maxHealth, P.health + P.regen); }
    } else P.regenT = 0;
    const canBoard = z && (this.jobsAt(z).length || (SHOPS[z.id] && (z.type !== 'pirate' || this.rep.aligned())));
    const canSwear = z && z.id === 'rustmoon' && z.type === 'pirate' && this.rep.rustmoon === 'known' && !FACTIONS.rustmoon.gone && !(this.story && this.story.kade.captured);
    const lab = this.world.lab;
    const nearDoc = lab && z === lab.loc && P.pos.distanceTo(lab.scientist) < 8;
    const nearReactor = lab && z === lab.loc && P.pos.distanceTo(lab.reactor) < 11;
    const nearPod = lab && z === lab.loc && P.pos.distanceTo(lab.pod) < 4;
    const nearPen = lab && z === lab.loc && P.pos.distanceTo(lab.penTerm) < 5;
    const nearBooth = this.race.near(P.pos);
    const nearYard = this.race.nearYard(P.pos);
    if (this.rides.interact()) {
      // aboard (or next to) a ship or fairground ride
    } else if (this.events.interact()) {
      // an event's start prop
    } else if (this.secrets.interact()) {
      // satellite artifact, alien gate, shrine
    } else if (this.story.interact(P)) {
      // a leader or one of your outposts' terminals
    } else if (this.town.interact(P)) {
      // your town's council hall
    } else if (this.casino.interact()) { // casino: walk-in game stations
    } else if (this.territory.interact()) { // raid a farm dome or supply depot
    } else if (nearPen) {
      this.hud.prompt(`<b>F</b> — HOLDING PEN (${this.alchemy.chimeras.length} chimeras)`);
      if (this.input.pressed('KeyF') && this.boardCooldown <= 0) this.alchemy.penMenu();
    } else if (nearPod) {
      this.hud.prompt(this.alchemy.jar.length ? '<b>F</b> — STEP INTO THE SPLICE POD (with your jar)' : 'SPLICE POD — BRING A FULL JAR. (<b>F</b> to read the label)');
      if (this.input.pressed('KeyF') && this.boardCooldown <= 0) this.usePod();
    } else if (nearBooth) {
      this.hud.prompt('<b>F</b> — CHIMERA DOWNS: RACE CARD &amp; BETS');
      if (this.input.pressed('KeyF') && this.boardCooldown <= 0) this.race.open();
    } else if (nearYard) {
      this.hud.prompt('<b>F</b> — TRAINING YARD (spend your chimeras\' banked sessions)');
      if (this.input.pressed('KeyF') && this.boardCooldown <= 0) this.race.trainMenu();
    } else if (nearDoc) {
      this.hud.prompt('<b>F</b> — TALK TO DR. ZBORNAK');
      if (this.input.pressed('KeyF') && this.boardCooldown <= 0) this.talkScientist();
    } else if (nearReactor) {
      this.hud.prompt(this.alchemy.jar.length ? '<b>X</b> — THROW THE JAR\'S CONTENTS INTO THE REACTOR' : 'THE REACTOR HUNGERS. FILL A JAR (<b>G</b>) AND BRING IT HERE.');
    } else if (canSwear) {
      this.hud.prompt('<b>F</b> — SWEAR IN WITH RUSTMOON');
      if (this.input.pressed('KeyF') && this.boardCooldown <= 0) this.wreckChoice();
    } else if (canBoard) {
      this.hud.prompt(`<b>F</b> — ${z.short} ${z.hq ? 'HQ · ' : ''}JOB BOARD${SHOPS[z.id] ? ' &amp; GEAR' : ''}${this.townBoard(z) ? ' &amp; COUNCIL HALL' : ''}`);
      if (this.input.pressed('KeyF') && this.boardCooldown <= 0) this.openBoard(z);
    } else this.hud.prompt(null);

    // emergency recall: hold R 1.5 s (no accidental presses)
    if (this.input.down('KeyR') && !this.recall.active && !this.player.dead) {
      this.recallHold = (this.recallHold || 0) + dt;
      const loc = this.home().loc;
      this.hud.recallHold(this.recallHold / 1.5, loc, this.recall.activeWork().length ? `HOLD R · RECALL TO ${loc.short || loc.name.toUpperCase()} · 100 CR · FAILS YOUR JOBS${this.events.active && this.events.active.type === 'wreck' ? ' · LOSES RUSTMOON FOR GOOD' : ''}` : null);
      if (this.recallHold >= 1.5) { this.recallHold = 0; this.hud.recallHold(0); this.recall.request(); }
    } else if (this.recallHold) { this.recallHold = 0; this.hud.recallHold(0); }
  }

  trafficHit(pos, r, vel) {
    const P = this.player;
    if (P.dead) return;
    const d = pos.distanceTo(P.center);
    if (d > r + 1) return;
    const n = P.center.clone().sub(pos).normalize();
    const rel = P.vel.clone().sub(vel).dot(n);
    P.body.pos.addScaledVector(n, r + 1 - d);
    if (rel < 0 && this.grind) this.grind.knockOff(P, n);
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
    const focus = P.rag ? P.rag.cam : P.pos; // ragdoll's smoothed focus (the raw pelvis shakes)
    const up = upAt(focus, c.up);
    if (snap) {
      c.right.crossVectors(c.fwd, up).normalize();
      c.look.copy(c.fwd).multiplyScalar(Math.cos(c.pitch)).addScaledVector(up, Math.sin(c.pitch));
    }
    const sp = P.speed;
    const sv = this.settings ? this.settings.v : null; // settings
    const scoped = !!P.scoped;
    const targetDist = scoped ? 0.2 : P.seat && P.seat.camDist ? P.seat.camDist : (7.5 + Math.min(7, sp * 0.06)) * (sv ? sv.camDist : 1); // settings
    c.dist += (targetDist - c.dist) * Math.min(1, dt * (scoped ? 14 : 3));
    const target = focus.clone().addScaledVector(up, 2.3);
    // past ~30° up the camera stops swinging lower and just tilts, so it doesn't bury itself in the ground
    const pp = Math.min(c.pitch, 0.55);
    const place = scoped || pp === c.pitch ? c.look : _v2.copy(c.fwd).multiplyScalar(Math.cos(pp)).addScaledVector(up, Math.sin(pp));
    const want = target.clone().addScaledVector(place, -c.dist).addScaledVector(up, scoped ? 0 : 0.8 + (sv ? sv.camHeight : 0)); // settings
    if (sv && sv.shoulder && !scoped) want.addScaledVector(c.right, sv.shoulder); // settings
    // Rail Lance scope: first-person, narrow field of view, runner hidden
    if (!P.dead && this.state !== 'cutscene') P.model.root.visible = c.dist > 1.2 && !(P.seat && P.seat.hidden) && !(P.vehicle && (P.vehicle.def.hideRider || P.vehicle.model.hideRider)); // hideRider: crewed inside (BTR-M)
    const scopeEl = document.getElementById('scope');
    if (scopeEl) scopeEl.classList.toggle('hidden', !scoped || c.dist > 1.2);
    const alt = this.planet.altitude(want);
    if (alt < 1.2) want.addScaledVector(upAt(want), 1.2 - alt);
    // keep out of walls: sweep a ball from your head to the wanted spot, stepped then bisected, so the stop point
    // slides smoothly along curves. The ball is wider than the near clip (0.5 m), so walls can't slice the view.
    const span = want.clone().sub(target);
    const L = span.length();
    const probe = new THREE.Vector3(), nrm = new THREE.Vector3();
    const solid = (t) => {
      probe.copy(target).addScaledVector(span, t);
      for (const col of this.colliders.query(probe, 1.6)) if (!col.platform && this.colliders.contact(col, probe, 0.65, nrm) > 0) return true;
      return false;
    };
    const steps = Math.max(1, Math.ceil(L / 0.5));
    let reach = 1;
    for (let i = 1; i <= steps; i++) {
      if (!solid(i / steps)) continue;
      let lo = (i - 1) / steps, hi = i / steps;
      for (let k = 0; k < 5; k++) { const mid = (lo + hi) / 2; if (solid(mid)) hi = mid; else lo = mid; }
      reach = Math.max(0.12, lo);
      break;
    }
    // allowed reach, smoothed: in fast, out slowly
    if (c.reach === undefined || snap) c.reach = reach;
    else c.reach += (reach - c.reach) * Math.min(1, dt * (reach < c.reach ? 16 : 4));
    // a new obstacle eases in over a few frames, but never more than ~1 m past the stop point (the 0.65 m ball covers that)
    if (L > 1e-3) c.reach = Math.min(c.reach, reach + 1 / L);
    want.copy(target).addScaledVector(span, c.reach);
    const held = c.reach < 0.999;
    if (snap) c.position.copy(want);
    // held by a wall: follow the (already smooth) stop point closely
    else c.position.lerp(want, held ? Math.min(1, dt * 30) : sv && sv.camSmooth < 0.05 ? 1 : Math.min(1, dt * 18 / (sv ? sv.camSmooth : 1))); // settings
    this.camera.position.copy(c.position);
    if (c.shake > 0) {
      c.shake = Math.max(0, c.shake - dt * 2.5);
      const sk = c.shake * (sv ? sv.shake : 1); // settings
      this.camera.position.x += (Math.random() - 0.5) * sk;
      this.camera.position.y += (Math.random() - 0.5) * sk;
      this.camera.position.z += (Math.random() - 0.5) * sk;
    }
    this.camera.up.copy(up);
    this.camera.lookAt(target.addScaledVector(c.look, 30));
    const fov = scoped ? (this.alchemy && this.alchemy.mutations.includes('hawk') ? 8 : 14) : (sv ? sv.fov : 72) + Math.min(30, Math.max(0, sp - 15) * 0.3); // settings
    c.fov += (fov - c.fov) * Math.min(1, dt * (scoped ? 12 : 3));
    if (Math.abs(this.camera.fov - c.fov) > 0.01) {
      this.camera.fov = c.fov;
      this.camera.updateProjectionMatrix();
    }
  }

}

// dev tools first: the Game builds game.cheats on construction (release builds have none to fetch).
// Fonts before init: canvas text (signs, maps) is drawn there. loadOutpostParts never rejects; it only fetches with
// the outpostGlb pilot on.
loadDevTools().then(() => {
  const game = new Game();
  if (DEV_TOOLS) window.game = game; // (the console, the test harnesses and the trailer's pump mode)
  preloadChimeras();                 // (not waited for: a chimera made before the kit is in fills in when it arrives)
  return Promise.all([loadFonts(), loadRunnerParts(), loadShipParts(), loadOutpostParts()]).then(() => game.init());
}).catch((e) => {
  console.error(e);
  document.getElementById('load-status').textContent = 'Failed to start: ' + e.message;
});
