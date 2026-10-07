// fonts are bundled so the desktop build works offline (see fonts.js)
import { loadFonts } from './fonts.js';
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
import { LOCATIONS, SHOPS, FACTIONS } from './locations.js';
import { Reputation } from './reputation.js';
import { Events } from './events.js';
import { GlobeMap } from './mapview.js';
import { Alchemy, MUTATIONS } from './alchemy.js';
import { Race } from './race.js';
import { Cosmetics } from './cosmetics.js';
import { Cheats } from './cheats.js';
import { Territory } from './territory.js';
import { Story } from './story.js';
import { Garage } from './vehicles.js';
import { Tutorial } from './tutorial.js';
import { Recall } from './recall.js';
import { Secrets } from './secrets.js';
import { Settings } from './settings.js'; // settings
import { Casino } from './casino.js'; // casino
import { SaveSlots } from './saves.js'; // save slots
import { MainMenu } from './menu.js'; // main menu
import { WEAPONS } from './weapons.js';
import { clamp, pick, mulberry32 } from './rng.js';
import { inkMat } from './toon.js';
import { SUN, dirFromAngles, darkness, arcDist, tangent } from './geo.js';

const SAVE_KEY = 'moonrunner-save-v1';
const TIPS = [
  'Hold <b>SPACE</b> to engage the Quantum-Lock skates — they grip the ground and glide without friction.',
  'On skates, <b>A/D</b> steer you along the ground: full input carves hard, <b>W+A</b> carves gently. Aim for ramps and crater rims!',
  'Hold <b>E</b> / <b>RIGHT MOUSE</b> for thrusters (mostly forward). <b>SHIFT</b> mag-jumps.',
  'In the air, hold <b>Q</b> + <b>W/S</b> to flip, <b>Q</b> + <b>A/D</b> to spin. Land upright! Buses and freighters make great ramps.',
  'Press <b>M</b> for the globe map (drag to spin). Unexplored ground stays fogged until you visit.',
  'Factions post <b>EVENTS</b> (beacons on the map). <b>J</b> opens your Reputation Log — higher standing means better pay and faction gear.',
  'The Moon is round — keep going and you\'ll reach the <b>DARK SIDE</b>. Bring your lamp (<b>L</b>). Pirates live there.',
];
const CAMP_NAMES = ['Grimtooth Camp', "Vandal's Rest", 'Ashfall Hideout', 'Cutthroat Crater', 'The Junkpile'];

const sleep = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const FROZEN_STATES = new Set(['paused', 'map', 'dialog', 'board', 'log', 'wardrobe']);
const _sightN = new THREE.Vector3();
const _sightNear = [];
// Threat Scanner outline: a bold red version of the comic ink shell.
const SCAN_INK = new THREE.MeshBasicMaterial({ color: 0xff1a2e, side: THREE.BackSide });
const _q = new THREE.Quaternion();

function buildLocations() {
  const locs = LOCATIONS.map((l) => ({ ...l, dir: dirFromAngles(l.theta, l.phi) }));
  // a few unmarked pirate camps scattered across the dark side
  const rr = mulberry32(777);
  let k = 0;
  for (let tries = 0; tries < 400 && k < CAMP_NAMES.length; tries++) {
    const d = dirFromAngles(105 + rr() * 70, rr() * 360 - 180);
    if (locs.some((l) => arcDist(d, l.dir) < 900)) continue;
    locs.push({ id: 'camp' + k, name: CAMP_NAMES[k], short: 'CAMP', type: 'pirate', faction: 'rustmoon', camp: true, r: 55, hostile: true, dark: true, dir: d, blurb: 'A pirate camp. Lights off, guns on.' });
    k++;
  }
  return locs;
}

class Game {
  async init() {
    const status = document.getElementById('load-status');
    const step = async (t) => { status.textContent = t; await sleep(); };
    // save slots first: picking a slot rewrites the live save keys every module reads below
    this.saves = new SaveSlots();
    this.started = false;
    this.menu = new MainMenu(this);
    this.settings = new Settings(); // settings
    this.settings.attach(this); // settings

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
    this.rep = new Reputation(this);
    this.events = new Events(this);
    this.enemies = new Enemies(this);
    this.globe = new GlobeMap(this);
    this.alchemy = new Alchemy(this);
    this.post = new ComicPost(this.renderer, this.camera);
    this.highlights = new Highlights(this);

    this.credits = 250;
    this.stats = { deliveries: 0, bestTrick: 0 };
    this.upgrades = { capacitor: 0, armor: 0, dampers: 0, spinner: 0, seeker: 0, gyro: 0, cradle: 0, flak: 0, overcharge: 0, shadow: 0, jar: 0, scatter: 0, rail: 0, mortar: 0 };
    this.load();
    this.race = new Race(this);
    this.cosmetics = new Cosmetics(this);
    this.cosmetics.apply();
    this.cheats = new Cheats(this);
    this.casino = new Casino(this); // casino
    this.territory = new Territory(this);
    this.story = new Story(this);
    this.garage = new Garage(this);
    this.tutorial = new Tutorial(this);
    this.recall = new Recall(this);
    this.secrets = new Secrets(this);
    // pirates live at Rustmoon Hold
    if (this.rep.aligned()) { const h = this.home(); this.player.respawn(h.point, h.facing); this.cam.fwd.copy(h.facing); }
    this.slowmo = 0;
    this.alchemy.start();
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
  }

  bindUI() {
    document.getElementById('quit-btn-pause').addEventListener('click', (e) => {
      e.stopPropagation();
      this.quitToMenu();
    });
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
      const esc = code === 'Escape';
      if (this.state === 'board') {
        if (esc || code === 'KeyF') { this.closeModal(esc); return; }
        const n = parseInt(code.replace('Digit', ''), 10);
        if (n >= 1 && n <= 9) {
          const offers = this.missions.offersFor(this.boardLoc);
          if (offers[n - 1] && !this.missions.active) this.acceptOffer(offers[n - 1]);
        }
      } else if (this.state === 'map') {
        if (esc || code === 'KeyM') this.closeModal(esc);
      } else if (this.state === 'log') {
        if (esc || code === 'KeyJ') this.closeModal(esc);
      } else if (this.state === 'dialog') {
        const n = parseInt(code.replace('Digit', ''), 10);
        if (code === 'Enter') this.pickDialog(0);
        else if (n >= 1 && n <= this.dialogButtons.length) this.pickDialog(n - 1);
        else if (esc) this.pickDialog(this.dialogButtons.length - 1, esc);
      } else if (this.state === 'casino') { // casino
        if (esc) this.casino.close(true); else this.casino.onKey(code);
      } else if (this.state === 'wardrobe') { // wardrobe
        if (esc || code === 'KeyC') this.cosmetics.ui.close(esc); else this.cosmetics.ui.onKey(code);
      } else if (this.state === 'play') {
        if (code === 'KeyM') this.openMap();
        if (code === 'KeyJ') this.openLog();
        if (code === 'KeyH') document.getElementById('help').classList.toggle('hidden');
        // hidden testing menu: hold = and ` together
        if ((code === 'Backquote' && this.input.down('Equal')) || (code === 'Equal' && this.input.down('Backquote'))) this.cheats.open();
        if (code === 'KeyL') {
          this.lampMode = this.lampMode === 'auto' ? 'off' : this.lampMode === 'off' ? 'on' : 'auto';
          this.hud.toast(`HELMET LAMP: ${this.lampMode.toUpperCase()}`);
        }
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
    this.hud.closeBoard();
    this.hud.closeDialog();
    document.getElementById('globe-wrap').classList.add('hidden');
    document.getElementById('globe-tip').classList.add('hidden');
    document.getElementById('replog').classList.add('hidden');
    this.state = 'play';
    // swallow the key that closed it so it can't immediately reopen anything
    this.input.justPressed.clear();
    this.boardCooldown = 0.4;
    // Escape can't re-grab the mouse (browser rule), so show a hint instead of pausing
    if (viaEscape) this.hud.show('clickhint', true);
    this.input.lock();
  }

  openMap() {
    this.tutorial.on('map');
    this.openModal('map');
    document.getElementById('globe-wrap').classList.remove('hidden');
    this.globe.center();
    this.globe.draw();
  }

  openLog() {
    this.openModal('log');
    this.hud.openRepLog(this);
  }

  dialog(title, text, buttons) {
    this.openModal('dialog');
    this.dialogButtons = buttons;
    this.hud.dialog(title, text, buttons, (i) => this.pickDialog(i));
  }

  pickDialog(i, esc = false) {
    const b = this.dialogButtons && this.dialogButtons[i];
    this.closeModal(esc);
    if (b && b.fn) b.fn();
  }

  // After saving the wrecked pirate: join Rustmoon?
  wreckChoice() {
    const swear = () => {
      this.rep.rustmoon = 'aligned';
      this.rep.add('rustmoon', 15, 'Saved a Rustmoon smuggler');
      this.rep.add('spacecom', -10, 'Joined the pirates');
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
    if (lvl === 0) buttons.push({ label: '1 · BUY A CONTAINMENT JAR — ₵400', fn: () => this.buyJar(400) });
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
    if (wires >= 3 && gw < 3) buttons.push({ label: `${buttons.length + 1} · HAND OVER 3 ELECTRICAL WIRING — SKATE GRIP TUNE (${gw + 1}/3)`, fn: () => {
      let n = 0;
      this.alchemy.jar = this.alchemy.jar.filter((i) => !(i.kind === 'wiring' && n++ < 3));
      this.alchemy.refreshJarMesh();
      this.upgrades.gripwire = gw + 1;
      this.player.applyUpgrades(this.upgrades);
      this.audio.cash();
      this.save();
      this.fx.pop('GRIP TUNED!', null, { color: '#ffd23f', size: 50 });
      this.dialog('DR. ZBORNAK', `"Copper! Lovely, stolen copper. I have rewound the magnetic coils in your skates. They will hug the ground a little harder now (grip tune ${gw + 1}/3). ${gw + 1 < 3 ? 'Bring more wire and I can wind them tighter.' : 'Any tighter and you would be welded to the Moon.'}"`, [{ label: 'STICKY!' }]);
    } });
    else if (wires >= 3) buttons.push({ label: `${buttons.length + 1} · MORE WIRING?`, fn: () => this.dialog('DR. ZBORNAK', '"Your coils are already wound as tight as physics allows. Throw the wire in the reactor if you must."', [{ label: 'OK' }]) });
    const chims = this.alchemy.chimeras.length;
    if (chims) buttons.push({ label: `${buttons.length + 1} · HOLDING PEN (${chims})`, fn: () => this.alchemy.penMenu() });
    buttons.push({ label: `${buttons.length + 1} · HEARD ANY RUMOURS?`, fn: () => this.dialog('DR. ZBORNAK', '"Rumours? Science does not deal in rumours. But… <br><br>• <b>Moon Mites</b> herd together in the sunny craters, well away from settlements. Green dots on your minimap, if you\'re close.<br>• That old satellite, <b>SAT-7 \"Lantern\"</b>, swoops low over the ground just past the ILMB once a lap. Something on its deck glows. You would have to match its speed exactly to land on it. Ha!<br>• Bring me <b>three lengths of electrical wiring</b> from a supply depot, in your jar, and I will rewind your skate coils for extra grip.<br>• Saplings from the farm domes are alive, technically. They splice beautifully.<br>• On the twilight side there is a trench nobody dug: the <b>Whispering Fissure</b>. My instruments go strange near it. Something down there wants a key."', [{ label: 'SPOOKY' }]) });
    buttons.push({ label: `${buttons.length + 1} · HOW DOES THIS WORK?`, fn: () => this.dialog('DR. ZBORNAK', '"Press <b>G</b> to scoop: rock samples (the glowing crystals on the sunny side), moon dirt (anywhere), black water (stand on a black lake), people, wild moon mites, a dazed pirate, even a whole hover-car if it fits. Things left together in a jar start to react. Bring the jar here and press <b>X</b> to throw everything into my reactor. <b>Two living things make a CHIMERA</b> — race it at the Bounce Dome Derby! One thing alone does… other things. Three different non-living things: don\'t. And the splice pod in the corner puts the jar into <i>you</i>."', [{ label: 'GOT IT' }]) });
    buttons.push({ label: `${buttons.length + 1} · LEAVE` });
    const greet = lvl ? `"Back already? Your jar holds ${2 + lvl}. What have you brought me?"` : '"Ah, a runner! Want to help science? You will need a containment jar. Everything goes in the jar. EVERYTHING."';
    this.dialog('DR. ZBORNAK', greet, buttons);
  }

  // Every hostile you can actually see gets a thick red outline, live, for as long as you keep line
  // of sight (terrain and buildings both block it). The Threat Scanner (ILMB upgrade) extends the
  // range, keeps marks for a while after they duck out of view, and counts squads closing in.
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
      const threat = !e.dead && e.model && e.center && (e.kind === 'megamite' || (e.faction === 'pirate' && e.kind !== 'core' && !this.enemies.friendly(e)) || (e.base && e.base.hostile));
      let seen = false;
      if (threat) {
        const d = e.center.distanceTo(P.pos);
        if (d < range) {
          if (lvl && (e.state === 'chase' || e.kind === 'megamite')) inbound++;
          // line-of-sight checks are throttled per enemy; the outline sticks for a beat between them
          e.losT = (e.losT || 0) - dt;
          if (e.losT <= 0) {
            e.losT = 0.12 + Math.random() * 0.06;
            e.los = this.planet.visible(cam, e.center) && this.clearSight(cam, e.center, e.radius || 1.5);
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
          if (!h.userData.baseScale) { h.userData.baseScale = h.scale.clone(); h.userData.basePos = h.position.clone(); }
          h.material = on ? SCAN_INK : inkMat;
          // a much fatter shell while targeted so the red reads at a distance
          const k = on ? 4 : 1;
          const bs = h.userData.baseScale, bp = h.userData.basePos;
          h.scale.set(1 + (bs.x - 1) * k, 1 + (bs.y - 1) * k, 1 + (bs.z - 1) * k);
          // keep the shell centred on its mesh (ink() offsets by the bounding-box centre)
          const f = (s, b2) => (Math.abs(1 - b2) > 1e-6 ? (1 - s) / (1 - b2) : 1);
          h.position.set(bp.x * f(h.scale.x, bs.x), bp.y * f(h.scale.y, bs.y), bp.z * f(h.scale.z, bs.z));
        }
      }
    }
    chip.classList.toggle('hidden', !inbound);
    if (inbound) chip.textContent = `⚠ SCANNER: ${inbound} HOSTILE${inbound > 1 ? 'S' : ''} INBOUND`;
  }

  // Is the straight line from a to b free of building colliders? (terrain is checked separately)
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
    // no recipe list on purpose: what the pod does is for players to find out
    const mine = A.mutations.length ? `<br><br>Currently spliced into you: <b>${A.mutations.map((k) => MUTATIONS[k].name).join(', ')}</b>` : '';
    const buttons = A.jar.length ? [{ label: '1 · SPLICE ME WITH THE JAR', fn: () => A.spliceSelf() }, { label: '2 · ABSOLUTELY NOT' }] : [{ label: 'OK' }];
    this.dialog('SPLICE POD', `A humming glass pod, warm to the touch. The label reads: <i>"INSERT JAR. INSERT SELF. RESULTS NOT GUARANTEED, REVERSIBLE, OR EXPLAINED."</i>${mine}`, buttons);
  }

  buyJar(cost) {
    if (this.credits < cost) { this.hud.toast(`Not enough credits (need ₵${cost}).`, 2); return; }
    this.credits -= cost;
    this.upgrades.jar = (this.upgrades.jar || 0) + 1;
    this.alchemy.refreshJarMesh();
    this.audio.cash();
    this.hud.toast(`Jar holds ${this.alchemy.slots} things now. G scoops, X empties.`, 3);
    this.save();
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

  // Where you deploy from: the ILMB, or Rustmoon Hold once you ride with the pirates.
  // Where you respawn and recall to: the ILMB, or the HQ of the faction whose story you've committed
  // to (Rustmoon Hold once you've sworn in with the pirates).
  home() {
    const f = this.rep && this.rep.aligned() ? 'rustmoon' : (this.story && this.story.faction);
    const loc = f && f !== 'spacecom' ? this.locations.find((l) => l.hq && l.faction === f) : null;
    if (!loc) return { point: this.spawnPoint, facing: this.spawnFacing, loc: this.hub };
    this._homes = this._homes || {};
    if (!this._homes[loc.id]) {
      // first clear patch of ground (no buildings) around the HQ
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
    if (this.missions.active) this.missions.stylePool += points;
    else this.credits += Math.round(points * 0.15);
    if (label) this.fx.pop(`${label}! +${points}`, null, { color: '#ff7ad9', size: 44, life: 1.3 });
  }

  damagePlayer(amount, cause) {
    const P = this.player;
    if (P.dead || amount <= 0 || this.cheats.god) return;
    if (this.story.absorb()) return;
    // the vehicle soaks hits (and can be wrecked); a sniper round goes straight through the glass
    if (P.vehicle && cause !== 'sniper') { amount = this.garage.hit(amount); if (amount <= 0) return; }
    P.health -= amount;
    this.damageFlash = Math.min(1, this.damageFlash + 0.25 + amount / 40);
    this.cam.shake = Math.min(1.5, this.cam.shake + amount / 25);
    if (!(P.vehicle && P.vehicle.def.cargoSafe)) this.missions.onDamage(amount);
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
    this.story.onDeath();
    if (this.events.active) this.events.fail(this.events.active, 'You went down. Event failed.');
    if (P.vehicle) this.garage.exit();
    const fee = Math.min(this.credits, 100);
    this.credits -= fee;
    const causes = {
      impact: 'You hit the ground way too hard with your skates off.',
      ram: 'Rammed into oblivion.',
      pirate: 'Scrapjaw pirates blasted you off your skates.',
      mil: 'Military defences turned you into a crater.',
      player: 'Your own Pulse Spinner. Classic.',
      sniper: 'Longshot Kade. You never even saw him. Well, you saw the red dot.',
      anomaly: 'Vaporised by a phase anomaly. For science.',
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
    // redeploy at your nearest clinic outpost if you have one, otherwise the ILMB
    const clinic = this.story.clinicSpawn(this.player.pos.clone().normalize());
    if (clinic) this.story.teleportTo(clinic.dir);
    else {
      const h = this.home();
      this.player.respawn(h.point, h.facing);
      this.cam.fwd.copy(h.facing);
    }
    this.state = 'play';
    this.input.lock();
  }

  explode(pos, radius, damage, owner, knock = 1, spare = false) {
    const big = radius > 10;
    const up = pos.clone().normalize();
    this.fx.explosion(pos, radius * 0.7, big);
    const P = this.player;
    const dCam = pos.distanceTo(this.camera.position);
    if (dCam < 600) this.audio.boom(big);
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
    if (owner !== 'player') {
      for (const o of this.events.protect) {
        if (o.dead) continue;
        const d = pos.distanceTo(o.center);
        if (d < radius + o.radius) {
          o.hp -= damage * Math.max(0.3, 1 - d / (radius + o.radius));
          if (o.hp <= 0) { o.dead = true; this.fx.explosion(o.center, 9, true); }
        }
      }
    }
    // other things that can be blown up (outposts, road traffic) register here: fn(pos, radius, damage, owner)
    for (const fn of this.blastHooks || []) fn(pos, radius, damage, owner);
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
    const pf = this.settings ? this.settings.v.panels : 'normal'; // settings: pop-up frequency
    if (pf === 'off' || (pf === 'rare' && (kind === 'launch' || kind === 'trick') && this.time - (this.lastPanelAt ?? -999) < 25)) return; // settings
    this.lastPanelAt = this.time; // settings
    const captions = {
      launch: ['MEANWHILE, FORTY METRES UP…', 'NO BRAKES. NO REGRETS.', 'GRAVITY? NEVER HEARD OF IT.', 'THE CRATER COULDN\'T HOLD HER!'],
      stolen: ['THE SCRAPJAW GANG STRIKES!', 'HEY! THAT\'S MY PACKAGE!'],
      delivered: ['SIGNED, SEALED, DELIVERED!', 'ANOTHER HAPPY CUSTOMER!'],
      trick: ['STYLE FOR MILES!'],
    };
    const text = caption || pick(captions[kind]);
    // big moments get pinned to the Hall of Highlights
    const worthy = kind === 'trick' || kind === 'delivered' || kind === 'stolen' || (kind === 'launch' && this.player.speed > 55);
    this.panel = { kind, subject, t: 2.6, text, capture: worthy && this.time - this.lastCapture > (this.settings ? this.settings.photoGap() : 15) ? 0.45 : -1 }; // settings
    document.getElementById('panel-caption').textContent = text;
    const el = document.getElementById('action-panel');
    el.classList.remove('hidden');
    el.classList.remove('slam'); void el.offsetWidth; el.classList.add('slam');
  }

  // ---------- job board ----------
  openBoard(loc) {
    this.tutorial.on('board');
    this.boardLoc = loc;
    this.openModal('board');
    this.refreshBoard();
  }

  refreshBoard() {
    const loc = this.boardLoc;
    this.hud.openBoard(loc, this.missions.offersFor(loc), {
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
      onAbandon: () => { this.missions.abandon(); this.refreshBoard(); },
      highlights: loc.id === 'ilmb' ? this.highlights.items : null,
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
    // new clothes go straight on
    if (key.startsWith('outfit_')) { this.cosmetics.outfit = key.slice(7); this.cosmetics.apply(); this.hud.toast('Looking sharp. Change outfits any time with C.', 3); }
    if (key.startsWith('skates_')) { this.cosmetics.skates = key.slice(7); this.cosmetics.apply(); this.hud.toast('New skate finish fitted. Change it any time with C.', 3); }
    this.audio.cash();
    this.save();
    this.refreshBoard();
  }

  save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ credits: this.credits, stats: this.stats, upgrades: this.upgrades }));
    } catch { /* storage unavailable */ }
    if (this.started && this.saves) this.saves.snapshot(this.slotMeta()); // save slots
  }

  // ---------- save slots / main menu ----------
  // Called by the main menu (from a click or key press, so pointer lock is allowed).
  startPlay() {
    if (this.started) return;
    this.started = true;
    this.audio.init();
    document.getElementById('title').classList.add('hidden');
    this.state = 'play';
    this.input.lock();
    this.hud.banner(this.hub);
    // brand-new runners get the guided training shift
    if (!this.tutorial.done && !this.tutorial.active) this.schedule(1.2, () => this.tutorial.offer());
    this.save();
  }

  slotMeta() {
    return { credits: this.credits, deliveries: (this.stats && this.stats.deliveries) || 0, faction: (this.story && this.story.faction) || null };
  }

  // Play-time clock and periodic snapshots of the live save keys into the active slot.
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
    this.save();
    this.saves.toMenu(this.slotMeta());
  }

  load() {
    try {
      const d = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
      if (!d) return;
      this.credits = d.credits ?? this.credits;
      this.stats = { ...this.stats, ...(d.stats || {}) };
      this.upgrades = { ...this.upgrades, ...(d.upgrades || {}) };
    } catch { /* corrupt or unavailable */ }
  }

  // ---------- main loop ----------
  frame() {
    const now = performance.now();
    if (this.settings && this.settings.skip(now)) return; // settings: frame-rate cap
    const rdt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    // paused, map, menus and dialogs freeze the whole world: traffic, the satellite, particles, clocks
    const frozen = FROZEN_STATES.has(this.state);
    const dt = frozen ? 0 : rdt;
    this.time += dt;

    const playing = this.state === 'play';
    if (playing) this.updatePlay(dt);
    else this.input.consumeMouse();
    if (this.state === 'dead') {
      this.enemies.update(dt, this.time);
      this.projectiles.update(dt);
    }

    this.recall.update(dt);
    if (this.state !== 'cutscene') this.updateCamera(dt);
    this.world.update(dt, this.time, this.camera.position);
    this.fx.update(dt);
    this.hud.update(rdt);
    this.updateLighting(dt);
    const P = this.player;
    this.audio.update(P.dead ? 0 : P.speed, P.body.skating, P.body.grounded, P.body.thrusting && playing);

    const dark = darkness(P.up);
    this.planet.update(this.camera.position, { budgetMs: 4, maxDist: (dark > 0.7 ? 1500 : 3200) * (this.settings ? this.settings.v.viewDist : 1) }); // settings

    const u = this.post.material.uniforms;
    u.time.value = this.time;
    u.speed.value = clamp((P.speed - 28) / 60, 0, 1);
    u.boost.value = P.body.thrusting ? 1 : 0;
    u.invert.value += ((this.alchemy && this.alchemy.buffs.invert > 0 ? 1 : 0) - u.invert.value) * 0.1;
    this.damageFlash = Math.max(0, this.damageFlash - dt * 1.5);
    u.damage.value = (this.damageFlash * 0.8 + (P.health / P.maxHealth < 0.25 && !P.dead ? 0.25 : 0)) * (this.settings ? this.settings.v.damageFlash : 1); // settings
    u.alert.value = this.enemies.bases.some((b) => b.inside && ((b.restricted && !b.authorized) || b.hostile)) ? 1 : 0;

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
    const lampOn = this.lampMode === 'on' || (this.lampMode === 'auto' && (dark > 0.35 || (this.secrets && this.secrets.isUnder(P.pos))));
    const k = P.dead ? 0 : lampOn ? 1 : 0;
    P.lamp.intensity += (k * 9 - P.lamp.intensity) * 0.2;
    // void skin lets you see in the dark: a wide violet glow without giving you away with a lamp
    const voidSight = this.alchemy.mutations.includes('void') && dark > 0.35 && !P.dead;
    P.glowLight.distance = voidSight ? 140 : 26;
    P.glowLight.color.setHex(voidSight ? 0xb69cff : 0x9be7ff);
    P.glowLight.intensity += ((voidSight ? 4 : k * 1.2) - P.glowLight.intensity) * 0.2;
    const isDark = dark > 0.6;
    if (isDark !== this.wasDark && this.state === 'play') {
      this.wasDark = isDark;
      if (isDark) this.hud.alert('☾ ENTERING THE DARK SIDE ☾', '#3a2b6f', 3.5);
      else this.hud.alert('☀ BACK IN THE LIGHT', '#ff9f1c', 2.5);
    }
    document.getElementById('darkchip').classList.toggle('hidden', !isDark);
  }

  updatePlay(dt) {
    // dramatic slow-motion (villain entrances)
    if (this.slowmo > 0) { this.slowmo -= dt; dt *= 0.3; }
    const [mx, my] = this.input.consumeMouse();
    const c = this.cam;
    const P = this.player;
    // parallel-transport the camera heading as you move around the sphere
    c.up.copy(P.pos).normalize();
    c.fwd.addScaledVector(c.up, -c.fwd.dot(c.up));
    if (c.fwd.lengthSq() < 1e-6) c.fwd.copy(P.heading);
    c.fwd.normalize();
    const sv = this.settings ? this.settings.v : null; // settings
    const sens = 0.0022 * (sv ? sv.sensitivity : 1) * (P.scoped ? 0.28 : 1); // settings; slower aim while scoped
    c.fwd.applyQuaternion(_q.setFromAxisAngle(c.up, -mx * sens));
    c.pitch = clamp(c.pitch - my * sens * (sv && sv.invertY ? -1 : 1), -1.25, 0.95);
    c.right.crossVectors(c.fwd, c.up).normalize();
    c.look.copy(c.fwd).multiplyScalar(Math.cos(c.pitch)).addScaledVector(c.up, Math.sin(c.pitch));
    this.hurtCd -= dt;
    this.boardCooldown -= dt;

    this.secrets.preUpdate(dt);
    P.update(dt, this.input, c);
    this.secrets.update(dt);
    this.missions.update(dt);
    this.events.update(dt);
    if (!this.events.active) this.hud.eventPanel(this.story.panel());
    this.globe.update(dt);
    this.territory.update(dt);
    this.story.update(dt);
    this.tutorial.update(dt);
    this.garage.update(dt);
    document.getElementById('techchip').innerHTML = this.story.hudTech();
    this.alchemy.update(dt);
    this.race.update(dt);
    if (this.input.pressed('KeyG')) this.alchemy.scoop();
    if (this.input.pressed('KeyX')) this.alchemy.empty(this.input.down('ShiftLeft') || this.input.down('ShiftRight'));
    if (this.input.pressed('KeyC') && this.boardCooldown <= 0) this.cosmetics.wardrobe();
    if (this.input.pressed('KeyP') && this.boardCooldown <= 0) {
      if (this.upgrades.penlink) this.alchemy.penMenu();
      else this.hud.toast('No pen link. Dr. Zbornak sells a remote holding-pen link at the Antimatter Lab.', 3);
    }
    if (this.input.pressed('KeyV') && this.boardCooldown <= 0) this.garage.toggle();
    if (this.input.pressed('KeyZ')) this.story.useTech('dash');
    if (this.input.pressed('KeyT') && this.boardCooldown <= 0) this.story.useTech('teleport');
    if (this.input.pressed('KeyN')) this.hud.toast(this.audio.toggleMusic() ? '♪ Music on' : 'Music off', 1.5);
    this.cosmetics.update(dt);
    this.updateScanner(dt);
    this.enemies.update(dt, this.time);
    this.projectiles.update(dt);

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
      if (z) this.hud.banner(z);
      this.currentZone = z;
    }
    const zw = document.getElementById('zonewarn');
    const base = this.enemies.bases.find((b) => b.inside && (b.restricted || b.hostile));
    if (base && !base.restricted) {
      zw.classList.remove('hidden');
      zw.innerHTML = `⚠ ${FACTIONS[base.faction].name.toUpperCase()} DEFENSES ARE FIRING ON YOU ⚠`;
    } else if (base && !base.authorized) {
      zw.classList.remove('hidden');
      const left = Math.max(0, 4 - base.time);
      zw.innerHTML = base.hostile
        ? `⚠ ${base.loc.name.toUpperCase()}: WEAPONS FREE${base.time > 9 ? ' — ARTILLERY INBOUND' : ''} ⚠`
        : `⚠ RESTRICTED ZONE — ${base.loc.name.toUpperCase()} — LEAVE IN ${left.toFixed(1)}s ⚠`;
    } else if (base) {
      zw.classList.remove('hidden');
      zw.innerHTML = `✔ CLEARANCE ACCEPTED — ${base.loc.name.toUpperCase()}`;
    } else zw.classList.add('hidden');

    // settlements patch you up, unless their defences are currently shooting at you
    const zBase = z && this.enemies.bases.find((b) => b.loc === z);
    const engaged = zBase && (zBase.hostile || zBase.aggro > 0);
    if (this.isSafe(z) && !P.dead && !engaged) P.health = Math.min(P.maxHealth, P.health + (z.repair || 6) * dt);
    const canBoard = z && (this.jobsAt(z).length || (SHOPS[z.id] && (z.type !== 'pirate' || this.rep.aligned())));
    const canSwear = z && z.id === 'rustmoon' && this.rep.rustmoon === 'known';
    const lab = this.world.lab;
    const nearDoc = lab && z === lab.loc && P.pos.distanceTo(lab.scientist) < 8;
    const nearReactor = lab && z === lab.loc && P.pos.distanceTo(lab.reactor) < 11;
    const nearPod = lab && z === lab.loc && P.pos.distanceTo(lab.pod) < 4;
    const nearPen = lab && z === lab.loc && P.pos.distanceTo(lab.penTerm) < 5;
    const nearBooth = this.race.near(P.pos);
    if (this.events.interact()) {
      // an event's start prop
    } else if (this.secrets.interact()) {
      // satellite artifact, alien gate, shrine
    } else if (this.story.interact(P)) {
      // a leader or one of your outposts' terminals
    } else if (this.casino.interact()) { // casino: walk-in game stations
    } else if (this.territory.interact()) { // raid a farm dome or supply depot
    } else if (nearPen) {
      this.hud.prompt(`<b>F</b> — HOLDING PEN (${this.alchemy.chimeras.length} chimeras)`);
      if (this.input.pressed('KeyF') && this.boardCooldown <= 0) this.alchemy.penMenu();
    } else if (nearPod) {
      this.hud.prompt(this.alchemy.jar.length ? '<b>F</b> — STEP INTO THE SPLICE POD (with your jar)' : 'SPLICE POD — BRING A FULL JAR. (<b>F</b> to read the label)');
      if (this.input.pressed('KeyF') && this.boardCooldown <= 0) this.usePod();
    } else if (nearBooth) {
      this.hud.prompt('<b>F</b> — CHIMERA DERBY: ENTER A CREATURE &amp; BET');
      if (this.input.pressed('KeyF') && this.boardCooldown <= 0) this.race.open();
    } else if (nearDoc) {
      this.hud.prompt('<b>F</b> — TALK TO DR. ZBORNAK');
      if (this.input.pressed('KeyF') && this.boardCooldown <= 0) this.talkScientist();
    } else if (nearReactor) {
      this.hud.prompt(this.alchemy.jar.length ? '<b>X</b> — THROW THE JAR\'S CONTENTS INTO THE REACTOR' : 'THE REACTOR HUNGERS. FILL A JAR (<b>G</b>) AND BRING IT HERE.');
    } else if (canSwear) {
      this.hud.prompt('<b>F</b> — SWEAR IN WITH RUSTMOON');
      if (this.input.pressed('KeyF') && this.boardCooldown <= 0) this.wreckChoice();
    } else if (canBoard) {
      this.hud.prompt(`<b>F</b> — ${z.short} ${z.hq ? 'HQ · ' : ''}JOB BOARD${SHOPS[z.id] ? ' &amp; GEAR' : ''}`);
      if (this.input.pressed('KeyF') && this.boardCooldown <= 0) this.openBoard(z);
    } else this.hud.prompt(null);

    // emergency recall: hold R for 1.5 s (so it can't be fat-fingered mid-run)
    if (this.input.down('KeyR') && !this.recall.active && !this.player.dead) {
      this.recallHold = (this.recallHold || 0) + dt;
      this.hud.recallHold(this.recallHold / 1.5, this.home().loc);
      if (this.recallHold >= 1.5) { this.recallHold = 0; this.hud.recallHold(0); this.recall.request(); }
    } else if (this.recallHold) { this.recallHold = 0; this.hud.recallHold(0); }

    if (this.tipIndex < TIPS.length && (!this.settings || this.settings.v.tips)) { // settings
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
    const sv = this.settings ? this.settings.v : null; // settings
    const scoped = !!P.scoped;
    const targetDist = scoped ? 0.2 : (7.5 + Math.min(7, sp * 0.06)) * (sv ? sv.camDist : 1); // settings
    c.dist += (targetDist - c.dist) * Math.min(1, dt * (scoped ? 14 : 3));
    const target = P.pos.clone().addScaledVector(up, 2.3);
    const want = target.clone().addScaledVector(c.look, -c.dist).addScaledVector(up, scoped ? 0 : 0.8 + (sv ? sv.camHeight : 0)); // settings
    if (sv && sv.shoulder && !scoped) want.addScaledVector(c.right, sv.shoulder); // settings
    // Rail Lance scope: first-person, narrow field of view, runner hidden
    if (!P.dead && this.state !== 'cutscene') P.model.root.visible = c.dist > 1.2;
    const scopeEl = document.getElementById('scope');
    if (scopeEl) scopeEl.classList.toggle('hidden', !scoped || c.dist > 1.2);
    const alt = this.planet.altitude(want);
    if (alt < 1.2) want.addScaledVector(want.clone().normalize(), 1.2 - alt);
    // keep the camera out of walls (matters indoors)
    const span = want.clone().sub(target);
    const L = span.length();
    const steps = Math.ceil(L / 0.6);
    const probe = new THREE.Vector3(), nrm = new THREE.Vector3();
    for (let i = 1; i <= steps; i++) {
      probe.copy(target).addScaledVector(span, i / steps);
      let hit = false;
      for (const col of this.colliders.query(probe, 1)) {
        if (!col.platform && this.colliders.contact(col, probe, 0.35, nrm) > 0) { hit = true; break; }
      }
      if (hit) { want.copy(target).addScaledVector(span, Math.max(0.15, (i - 1) / steps)); break; }
    }
    if (snap) c.position.copy(want);
    else c.position.lerp(want, sv && sv.camSmooth < 0.05 ? 1 : Math.min(1, dt * 18 / (sv ? sv.camSmooth : 1))); // settings
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
    if (p.kind === 'villain' && p.subject && p.subject.model) {
      // close-up on the villain's face
      focus = p.subject.center.clone().addScaledVector(up, 0.5);
      const f = p.subject.heading.clone();
      from = focus.clone().addScaledVector(f, 3.2).addScaledVector(side(f), 1.2).addScaledVector(up, 0.2);
    } else if (p.kind === 'stolen' && p.subject && !p.subject.dead) {
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
// canvas text (signs, maps) is drawn during init, so the pixel fonts must be loaded first
loadFonts().then(() => game.init()).catch((e) => {
  console.error(e);
  document.getElementById('load-status').textContent = 'Failed to start: ' + e.message;
});
