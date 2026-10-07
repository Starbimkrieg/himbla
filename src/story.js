import * as THREE from 'three';
import { FACTIONS } from './locations.js';
import { makeRunner, makeCrate } from './models.js';
import { makeBody, stepSkater } from './physics.js';
import { toon, glow, ink, textSprite } from './toon.js';
import { arcDist, tangent, frameQuat, greatCircle, darkness } from './geo.js';
import { pick } from './rng.js';
import { VEHICLES } from './vehicles.js';

// Faction stories. Every faction has a leader who offers a four-chapter storyline once you're
// FRIENDLY with them. Finishing the first chapter of one story commits you to it (the other
// leaders stop dealing with you), which keeps each playthrough coherent and replayable.
const KEY = 'moonrunner-story-v1';
const REQ = [10, 15, 25, 35];

export const LEADERS = {
  spacecom: { name: 'Admiral Ada Okonkwo', title: 'Commander, International Moon Force', look: { suit: 0xf4f1ff, accent: 0xffd23f, helmet: 0xf4f1ff, visor: 0xffd23f, scarf: 0xd7263d } },
  vostok: { name: 'General Yuri Volkov', title: 'Supreme Commander, Vostok Lunar Army', look: { suit: 0x6b6f78, accent: 0xff3b5c, helmet: 0x8a8f99, visor: 0x111111, scarf: 0xff3b5c } },
  meridian: { name: 'Chairwoman Lucinda Vane', title: 'Chief Executive, Meridian Exchange', look: { suit: 0xffc83a, accent: 0xffffff, helmet: 0xffe27a, visor: 0x1a1030, scarf: 0x2ec4ff } },
  kepler: { name: 'Mayor Hettie "Gran" Pike', title: 'Elected Mayor, Kepler Settlements', look: { suit: 0x7a4a2a, accent: 0x7dff6a, helmet: 0xfff4e0, visor: 0x2b8f4a, scarf: 0xff9f1c } },
  daedalus: { name: 'Director Ilsa Moreau', title: 'Director of Applied Sciences, Daedalus', look: { suit: 0x1a1426, accent: 0xff2e88, helmet: 0xeeeaf8, visor: 0xc77dff, scarf: 0xc77dff } },
  rustmoon: { name: 'Captain Vex "Longshot" Kade', title: 'King of Rustmoon · Deadliest Shot on the Moon', look: { suit: 0x1a1a1a, accent: 0xff2a3a, helmet: 0x2b2b2b, visor: 0xff2a3a, scarf: 0xd7263d } },
};

// Tech unlocked by the research-minded stories.
export const TECH = {
  dash: { name: 'Phase Dash', key: 'Z', desc: 'Blink about 30 m forward. 6 s cooldown.' },
  shield: { name: 'Deflector Shield', key: '—', desc: 'Absorbs one hit every 12 s.' },
  teleport: { name: 'Personal Teleporter', key: 'T', desc: 'Jump to any discovered settlement or your outposts. 90 s cooldown.' },
};

// Modules for outposts you found (the base-builder part).
export const MODULES = {
  greenhouse: { name: 'Greenhouse', cost: 600, desc: 'Heals you while you are nearby, and grows a little income.' },
  clinic: { name: 'Clinic', cost: 800, desc: 'You redeploy here after a K.O. (nearest clinic wins).' },
  beacon: { name: 'Beacon Tower', cost: 700, desc: 'Charts 1.5 km of map around it and links to your other beacons for fast travel.' },
  turret: { name: 'Militia Turret', cost: 900, desc: 'Shoots pirates within 300 m.' },
  market: { name: 'Market Stall', cost: 1200, desc: 'Earns ₵40 a minute (up to ₵800) to collect at the terminal.' },
  garage: { name: 'Garage', cost: 1500, desc: 'Unlocks your faction hauler and lets you summon it anywhere.' },
};

// Chapter scripts. Step types: goto, relays, clear, capture, build, defend, experiment, carry, boss, kade.
const CHAPTERS = {
  spacecom: [
    {
      title: 'Clear the Trade Lanes',
      brief: '"Runner. Convoys to the Helium-3 Exchange keep getting jumped. I need someone fast enough to find the ambush before it finds my trucks. Clear them out."',
      steps: [{ t: 'clear', at: { site: 'mine', min: 450, max: 750 }, n: 5, label: 'Clear the pirate ambush' }],
      reward: { credits: 600 },
      outro: '"Clean work. You\'re on SPACECOM\'s books now, Runner. Don\'t make me regret it."',
    },
    {
      title: 'Operation Foothold',
      brief: '"Rustmoon\'s squatting on outposts around Farside. We\'re taking one back. Clear the scum, then hold the ground until my engineers lock it down."',
      steps: [{ t: 'capture', at: { outpost: 'rustmoon', near: 'farside' }, guards: 5, hold: 25, label: 'Take the outpost' }],
      reward: { credits: 900, vehicle: 'interceptor' },
      outro: '"Outpost secured. You\'ve earned wheels. The motor pool will drop a Lunar Interceptor wherever you call for it. Press V."',
    },
    {
      title: 'Signal in the Dark',
      brief: '"We\'re lighting up a relay on the dark side so patrols can see the pirates coming. Plant it and keep it breathing while it calibrates. They WILL come."',
      steps: [
        { t: 'goto', at: { site: 'farside', min: 500, max: 800 }, r: 25, label: 'Reach the relay site' },
        { t: 'defend', at: { prev: true }, secs: 60, hp: 700, label: 'Protect the relay while it calibrates' },
      ],
      reward: { credits: 1100, tech: 'shield' },
      outro: '"Relay\'s up. R&D sent you a gift: a Deflector Shield. It\'ll eat one hit every few seconds. Try not to need it."',
    },
    {
      title: 'Longshot',
      brief: '"Vex Kade. The King of Rustmoon. He\'s put more of my people in the dirt than the vacuum has. Intel says he\'s near Gloom Harbor. Bring him in. Watch for the red dot, Runner. When you see it, MOVE."',
      steps: [
        { t: 'goto', at: { site: 'gloom', min: 350, max: 550 }, r: 60, label: 'Find Kade near Gloom Harbor' },
        { t: 'kade', label: 'Defeat Longshot Kade' },
      ],
      reward: { credits: 2000, outfit: 'spacecom2', rep: 12 },
      outro: '"Kade\'s in a cell. The Moon\'s a little quieter tonight. Admiral\'s Whites are yours, Runner. Wear them like you mean it."',
      final: true,
    },
  ],
  vostok: [
    {
      title: 'Proving Ground',
      brief: '"You want to work for Vostok? Show me. Raiders are camping near Base Four. Remove them."',
      steps: [{ t: 'clear', at: { site: 'vostok4', min: 400, max: 700 }, n: 5, label: 'Remove the raiders' }],
      reward: { credits: 650 },
      outro: '"Acceptable. You are Vostok\'s now, comrade. Daedalus will hear your name and spit."',
    },
    {
      title: 'Bite the Daedalus',
      brief: '"Daedalus hides a listening post near our border. Mercenaries guard it. Take it. Hold it. Raise our flag."',
      steps: [{ t: 'capture', at: { outpost: 'daedalus', near: 'vostok' }, guards: 5, hold: 30, label: 'Capture the Daedalus post', war: 'daedalus' }],
      reward: { credits: 1000, vehicle: 'apc' },
      outro: '"The post is ours. Take an APC: the BTR-M. Press V and it will find you. It does not die easily. Neither should you."',
    },
    {
      title: 'Hold the Line',
      brief: '"Daedalus wants the post back. They hired pirates to do it, cowards. Plant a field generator and hold until our garrison arrives."',
      steps: [
        { t: 'goto', at: { captured: true }, r: 30, label: 'Return to the captured post' },
        { t: 'defend', at: { prev: true }, secs: 75, hp: 900, label: 'Hold until the garrison arrives' },
      ],
      reward: { credits: 1300 },
      outro: '"The line held. Good. Now we finish this."',
    },
    {
      title: 'Red Moon Rising',
      brief: '"Daedalus Base Two\'s outer post is guarded by their Warden, a monster of a war-rig. Destroy it. Take the post. Then they will know whose Moon this is."',
      steps: [
        { t: 'boss', at: { outpost: 'daedalus', near: 'daedalus2' }, boss: { name: 'THE DAEDALUS WARDEN', hp: 1000 }, label: 'Destroy the Daedalus Warden' },
        { t: 'capture', at: { prev: true }, guards: 3, hold: 25, label: 'Raise the Vostok flag', war: 'daedalus' },
      ],
      reward: { credits: 2500, outfit: 'vostok2', rep: 12 },
      outro: '"Hero of the Moon. Wear it. Vostok remembers its heroes, comrade, and it never forgets its enemies."',
      final: true,
    },
  ],
  daedalus: [
    {
      title: 'Recovery Protocol',
      brief: '"A prototype core is sitting in a field lab at Base Two. It is unstable. Bring it to me here. Gently. If it cracks you will not need to worry about the delivery fee."',
      steps: [{ t: 'carry', from: 'daedalus2', to: { loc: 'daedalus' }, fragile: 26, label: 'Carry the prototype core', cargo: 'PROTOTYPE CORE' }],
      reward: { credits: 700 },
      outro: '"Intact. Remarkable. You are Daedalus\' runner now. Vostok will consider you a target. Consider that a compliment."',
    },
    {
      title: 'Asset Denial',
      brief: '"Vostok placed a post on our border. It hears everything we say. Silence it, then hold it for Daedalus."',
      steps: [{ t: 'capture', at: { outpost: 'vostok', near: 'daedalus' }, guards: 5, hold: 30, label: 'Capture the Vostok post', war: 'vostok' }],
      reward: { credits: 1000, vehicle: 'skimmer' },
      outro: '"Efficient. Take a Phase Skimmer. It hovers. It drifts. Do try to steer. Press V."',
    },
    {
      title: 'Phase Trial',
      brief: '"I am testing a phase field in the open. Someone must stand inside it while it destabilises. Volunteers have been… scarce."',
      steps: [
        { t: 'goto', at: { site: 'daedalus', min: 400, max: 700 }, r: 30, label: 'Reach the test site' },
        { t: 'experiment', at: { prev: true }, secs: 45, label: 'Survive the phase field' },
      ],
      reward: { credits: 1300, tech: 'dash' },
      outro: '"You survived. Your molecules are now… slightly negotiable. Press Z to phase-dash forward. Do not do it into a wall."',
    },
    {
      title: 'The Black Sun',
      brief: '"Our new reactor goes live tonight. Vostok will try to stop it with their Hammer, a war-rig with an ego. Keep the reactor alive. Break the Hammer."',
      steps: [
        { t: 'goto', at: { site: 'daedalus2', min: 400, max: 700 }, r: 30, label: 'Reach the reactor site' },
        { t: 'defend', at: { prev: true }, secs: 70, hp: 1000, label: 'Keep the reactor alive' },
        { t: 'boss', at: { prev: true }, boss: { name: 'THE VOSTOK HAMMER', hp: 1100 }, label: 'Break the Vostok Hammer' },
      ],
      reward: { credits: 2500, outfit: 'daedalus2', rep: 12 },
      outro: '"The Black Sun burns. You have my gratitude, which is rare, and a Prototype Shell, which is rarer."',
      final: true,
    },
  ],
  kepler: [
    {
      title: 'Room to Grow',
      brief: '"Kepler\'s bursting at the seams, dear. I\'ve found a lovely flat spot for a homestead. Haul the prefab parts out there and we\'ll have a new home by supper."',
      steps: [{ t: 'build', from: 'kepler', site: { site: 'kepler', min: 600, max: 900 }, trips: 3, found: { kind: 'homestead', name: 'Pike\'s Hope' }, label: 'Haul prefab parts to the homestead site' }],
      reward: { credits: 700 },
      outro: '"Pike\'s Hope! Oh, it\'s perfect. It\'s yours to run, love: use the terminal there to add a greenhouse, a clinic, a market… Kepler\'s proud to call you family."',
    },
    {
      title: 'Raiders at the Gate',
      brief: '"Pirates are sniffing around Pike\'s Hope. The settlers are frightened. Please, keep the generator running until the militia arrives."',
      steps: [
        { t: 'goto', at: { founded: true }, r: 30, label: 'Get to Pike\'s Hope' },
        { t: 'defend', at: { prev: true }, secs: 70, hp: 800, label: 'Keep the generator running' },
      ],
      reward: { credits: 1100, module: 'turret' },
      outro: '"You saved them. I\'ve had a militia turret installed at Pike\'s Hope, on the house."',
    },
    {
      title: 'Second Harvest',
      brief: '"Families on the twilight edge need a place too. Another homestead, dear: closer to the dark, so it\'ll want a garage for the long hauls."',
      steps: [{ t: 'build', from: 'twilight', site: { site: 'twilight', min: 500, max: 800 }, trips: 3, found: { kind: 'homestead', name: 'Twilight Rest' }, label: 'Haul prefab parts to the new site' }],
      reward: { credits: 1300, vehicle: 'mule', module: 'garage' },
      outro: '"Twilight Rest! And the garage came with a Homestead Mule. Cargo rides soft in it. Press V."',
    },
    {
      title: 'The Charter',
      brief: '"The homesteads want a proper charter. Visit each one, then chase off the raiders squatting by Hertz. After that, the settlements are a nation, and you helped build it."',
      steps: [
        { t: 'relays', sites: [{ foundedIdx: 0 }, { foundedIdx: 1 }], hold: 3, label: 'Collect signatures at each homestead' },
        { t: 'clear', at: { site: 'hertz', min: 400, max: 700 }, n: 6, label: 'Chase off the raiders near Hertz' },
      ],
      reward: { credits: 2000, outfit: 'kepler2', rep: 12, everyModule: 'greenhouse' },
      outro: '"The Kepler Charter is signed. Every homestead gets a greenhouse, and you get Gran\'s best coat. Don\'t you dare argue."',
      final: true,
    },
  ],
  meridian: [
    {
      title: 'Sensor Net',
      brief: '"Information is money, Runner. Plant three sensor relays around the Exchange. Quickly. Time is also money."',
      steps: [{ t: 'relays', sites: [{ site: 'meridian', min: 400, max: 700 }, { site: 'meridian', min: 500, max: 800 }, { site: 'meridian', min: 600, max: 900 }], hold: 3, label: 'Plant sensor relays' }],
      reward: { credits: 700 },
      outro: '"Data is flowing. Consider yourself retained by Meridian. Exclusively."',
    },
    {
      title: 'Controlled Burn',
      brief: '"Our research wing wants a live phase-field test near Shackleton. The insurance won\'t cover our staff. It will cover you."',
      steps: [
        { t: 'goto', at: { site: 'shackleton', min: 350, max: 600 }, r: 30, label: 'Reach the test site' },
        { t: 'experiment', at: { prev: true }, secs: 40, label: 'Survive the field test' },
      ],
      reward: { credits: 1100, tech: 'dash' },
      outro: '"Profitable. The by-product is a Phase Dash rig with your name on it. Press Z."',
    },
    {
      title: 'Handle With Care',
      brief: '"Dr. Zbornak has a sample we\'ve licensed. Antimatter. In a jar. Bring it to the Exchange without dropping it, and Meridian will be very grateful."',
      steps: [{ t: 'carry', from: 'antimatter', to: { loc: 'meridian' }, fragile: 22, label: 'Carry the antimatter sample', cargo: 'ANTIMATTER SAMPLE' }],
      reward: { credits: 1500, tech: 'shield' },
      outro: '"Delivered, and nobody evaporated. Our labs made you a Deflector Shield. A business expense."',
    },
    {
      title: 'Infrastructure',
      brief: '"Meridian needs its own research station. Haul the parts, then run the first experiment yourself. Shareholders love a demonstration."',
      steps: [
        { t: 'build', from: 'mine', site: { site: 'mine', min: 500, max: 800 }, trips: 3, found: { kind: 'lab', name: 'Vane Research Station' }, label: 'Haul parts for the research station' },
        { t: 'experiment', at: { founded: true }, secs: 45, label: 'Run the first experiment' },
      ],
      reward: { credits: 2500, tech: 'teleport', vehicle: 'van', outfit: 'meridian2', rep: 12 },
      outro: '"A triumph. Here: a Personal Teleporter (press T), a Courier Hover-Van, and the Gilded Executive. You\'ve made us very rich, Runner."',
      final: true,
    },
  ],
  rustmoon: [
    {
      title: 'Ship Shape',
      brief: '"So you\'re the runner everyone\'s whispering about. SPACECOM\'s got a depot sitting on our side of the line. Take it. Show me you\'ve got teeth."',
      steps: [{ t: 'capture', at: { outpost: 'spacecom', near: 'rustmoon' }, guards: 4, hold: 20, label: 'Take the SPACECOM depot', war: 'spacecom' }],
      reward: { credits: 800 },
      outro: '"Ha! That\'s a pirate\'s work. You ride with ME now. SPACECOM won\'t forget your face. Neither will I."',
    },
    {
      title: 'The Convoy',
      brief: '"An armoured convoy runs past Farside every night. Their lead rig is a fortress on wheels. Crack it open and I\'ll give you one of ours."',
      steps: [{ t: 'boss', at: { site: 'farside', min: 500, max: 800 }, boss: { name: 'SPACECOM ARMOURED CONVOY', hp: 900 }, label: 'Crack the armoured convoy' }],
      reward: { credits: 1200, vehicle: 'warrig' },
      outro: '"Now THAT was music. Take a Scrapjaw War-Rig. It rams. Press V and paint something green."',
    },
    {
      title: 'Lights Out',
      brief: '"SPACECOM\'s patrols run on relay masts. Plant charges on three and their whole sky goes dark for a week."',
      steps: [{ t: 'relays', sites: [{ outpostAny: 'spacecom', near: 'farside' }, { site: 'twilight', min: 500, max: 800 }, { site: 'hertz', min: 500, max: 800 }], hold: 4, label: 'Plant the charges', charge: true }],
      reward: { credits: 1500, rep: 10 },
      outro: '"Boom, boom, boom. Beautiful. One more job, Runner. The big one."',
    },
    {
      title: 'The Big Score',
      brief: '"Meridian keeps a vault cube at the Exchange. Grab it, run it home to Rustmoon Hold, and don\'t you dare crack it. Every gun on the Moon will be pointed at you."',
      steps: [
        { t: 'carry', from: 'meridian', to: { loc: 'rustmoon' }, fragile: 30, label: 'Run the vault cube to Rustmoon Hold', cargo: 'MERIDIAN VAULT CUBE', chase: true },
      ],
      reward: { credits: 3000, outfit: 'rustmoon2', rep: 15 },
      outro: '"THE BIG SCORE! Ha! You\'re a legend now, Runner. A Dread Captain. The Moon is ours."',
      final: true,
    },
  ],
};

const _v = new THREE.Vector3();

export class Story {
  constructor(game) {
    this.game = game;
    this.faction = null; // the story you're committed to
    this.progress = {}; // faction -> chapters completed
    this.vehicles = [];
    this.tech = [];
    this.founded = []; // outpost ids you founded
    this.capturedIds = [];
    this.kade = { met: 0, beaten: 0, captured: false, nextAt: 0 };
    this.active = null;
    this.leaders = {};
    this.techCd = { dash: 0, shield: 0, teleport: 0 };
    this.load();
    this.buildLeaders();
    this.buildUI();
  }

  load() {
    try {
      const d = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (!d) return;
      Object.assign(this, { faction: d.faction || null, progress: d.progress || {}, vehicles: d.vehicles || [], tech: d.tech || [], founded: d.founded || [], capturedIds: d.capturedIds || [] });
      Object.assign(this.kade, d.kade || {});
    } catch { /* new story */ }
  }

  save() {
    try { localStorage.setItem(KEY, JSON.stringify({ faction: this.faction, progress: this.progress, vehicles: this.vehicles, tech: this.tech, founded: this.founded, capturedIds: this.capturedIds, kade: this.kade })); } catch { /* unavailable */ }
  }

  chaptersDone(f) { return this.progress[f] || 0; }

  // ---------- leaders ----------
  buildLeaders() {
    const g = this.game;
    for (const [f, L] of Object.entries(LEADERS)) {
      const loc = g.locations.find((l) => l.id === FACTIONS[f].hq);
      if (!loc) continue;
      const m = makeRunner({ ...L.look, pirate: f === 'rustmoon' });
      if (f === 'rustmoon') this.addRifle(m, true);
      const spot = this.findSpot(loc);
      g.world.put(m.root, loc, spot.x, spot.z, 0, Math.atan2(-spot.x, -spot.z), true);
      m.root.scale.setScalar(1.15);
      // a little podium + name plate
      const pod = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.9, 0.4, 16), toon(new THREE.Color(FACTIONS[f].color).getHex()));
      ink(pod, 0.05);
      g.world.put(pod, loc, spot.x, spot.z, 0.2);
      m.root.position.y = 0.4;
      const sign = textSprite(L.name.toUpperCase(), { color: FACTIONS[f].color, size: 52, scale: 0.5, bg: '#120a1e' });
      sign.position.set(spot.x, 5.4, spot.z);
      loc.group.add(sign);
      // faction-coloured beacon: a glowing ring on the ground and a soft light column you can spot from afar
      const fc = new THREE.Color(FACTIONS[f].color).getHex();
      const ring = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.18, 8, 40), glow(fc));
      ring.rotation.x = Math.PI / 2;
      g.world.put(ring, loc, spot.x, spot.z, 0.15, 0, true);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3.2, 40, 20, 1, true).translate(0, 20, 0), new THREE.MeshBasicMaterial({ color: fc, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      g.world.put(beam, loc, spot.x, spot.z, 0, 0, true);
      loc.group.updateMatrixWorld(true);
      this.leaders[f] = { f, loc, model: m, sign, pod, ring, beam, pos: g.world.toWorld(loc, spot.x, 1, spot.z), t: Math.random() * 5 };
    }
  }

  // An open, visible spot for a leader: well clear of buildings (so the name sign never clips),
  // just off to the side of where you usually arrive (not blocking the path in).
  findSpot(loc) {
    const g = this.game;
    const cands = [];
    const r0 = Math.max(24, loc.r * 0.3), r1 = Math.min(loc.r * 0.78, 150);
    for (let rad = r0; rad <= r1; rad += 8) {
      for (let k = 0; k < 24; k++) {
        const a = (k / 24) * Math.PI * 2;
        cands.push({ x: Math.sin(a) * rad, z: Math.cos(a) * rad, score: Math.abs(Math.abs(a > Math.PI ? a - Math.PI * 2 : a) - 0.5) + Math.abs(rad - (r0 + r1) / 2) / 60 });
      }
    }
    cands.sort((p, q) => p.score - q.score);
    for (const c of cands) {
      let blocked = false;
      for (const y of [1.2, 3.5, 6]) {
        const p = g.world.toWorld(loc, c.x, y, c.z);
        if (g.colliders.query(p, 9, []).some((col) => g.colliders.contact(col, p, 8, _v) > 0)) { blocked = true; break; }
      }
      if (!blocked) return c;
    }
    return { x: 0, z: Math.min(loc.r * 0.6, 90) };
  }

  addRifle(m, slung) {
    const rifle = new THREE.Group();
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 2.1), toon(0x221d33));
    ink(barrel, 0.03);
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.6, 6).rotateX(Math.PI / 2), toon(0x3a3550));
    scope.position.set(0, 0.14, 0.1);
    const lens = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 4), glow(0xff2a3a));
    lens.position.set(0, 0.14, 0.42);
    rifle.add(barrel, scope, lens);
    if (slung) { rifle.position.set(0.1, 0.6, -0.42); rifle.rotation.set(0.2, 0, 0.9); m.torso.add(rifle); }
    else { rifle.position.set(0, -0.55, 0.8); m.armR.add(rifle); }
    // a long coat
    const coat = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.2), toon(0x111111, { side: THREE.DoubleSide }));
    coat.position.set(0, 0.25, -0.4);
    coat.rotation.x = 0.2;
    m.torso.add(coat);
    m.coat = coat;
    return rifle;
  }

  leaderVisible(f) {
    if (f !== 'rustmoon') return true;
    const r = this.game.rep;
    return r.rustmoon !== 'unknown' && r.rustmoon !== 'locked' && r.get('rustmoon') >= 10 && !this.kade.captured;
  }

  // F near a leader or one of your outposts' terminals. Returns true if it set a prompt.
  interact(P) {
    const g = this.game;
    for (const L of Object.values(this.leaders)) {
      L.model.root.visible = this.leaderVisible(L.f);
      L.sign.visible = L.ring.visible = L.beam.visible = L.pod.visible = L.model.root.visible;
      if (!L.model.root.visible || !L.loc.active || P.pos.distanceTo(L.pos) > 6) continue;
      g.hud.prompt(`<b>F</b> — TALK TO ${LEADERS[L.f].name.toUpperCase()}`);
      if (g.input.pressed('KeyF') && g.boardCooldown <= 0) this.talk(L.f);
      return true;
    }
    for (const o of this.myOutposts()) {
      if (!o.terminal || !o.model || P.pos.distanceTo(o.terminal) > 4.5) continue;
      g.hud.prompt(`<b>F</b> — ${g.territory.name(o).toUpperCase()} TERMINAL`);
      if (g.input.pressed('KeyF') && g.boardCooldown <= 0) this.outpostMenu(o);
      return true;
    }
    return false;
  }

  talk(f) {
    const g = this.game;
    const L = LEADERS[f];
    const done = this.chaptersDone(f);
    const chapters = CHAPTERS[f];
    const name = `${L.name.toUpperCase()}`;
    const sub = `<small>${L.title}</small><br><br>`;
    if (this.faction && this.faction !== f) {
      const other = FACTIONS[this.faction].name;
      g.dialog(name, `${sub}${pick([`"You run for ${other} now. We have nothing to discuss."`, `"I don't hire ${other}'s errand runners. Off you go."`, `"Interesting choice, ${other}. We'll see how that works out for you."`])}`, [{ label: 'FAIR ENOUGH' }]);
      return;
    }
    if (this.active && this.active.f === f) {
      const ch = this.active.def;
      g.dialog(name, `${sub}"${ch.title}. You know what to do." <br><small>${this.status()}</small>`, [
        { label: '1 · ON IT' },
        { label: '2 · ABANDON THIS CHAPTER', fn: () => this.fail('Chapter abandoned. Talk to me when you\'re ready to try again.') },
      ]);
      return;
    }
    if (done >= chapters.length) {
      g.dialog(name, `${sub}"${pick(['The Moon owes you, Runner.', 'Legends don\'t need errands. Go enjoy it.', 'You did it. Now go cause some trouble.'])}"<br><br><small>Story complete: ${chapters.length}/${chapters.length} chapters.</small>`, [{ label: 'THANKS' }]);
      return;
    }
    const need = REQ[done];
    const rep = g.rep.get(f);
    if (rep < need) {
      const tier = need >= 25 ? 'TRUSTED' : 'FRIENDLY';
      g.dialog(name, `${sub}"${done ? 'Not yet. Do some more work for us first.' : `Who are you? Come back when ${FACTIONS[f].name} knows your name.`}"<br><br><small>Next chapter needs ${need} reputation with ${FACTIONS[f].name} (you have ${rep}). Contracts and events raise it.${tier ? '' : ''}</small>`, [{ label: 'OK' }]);
      return;
    }
    if (this.active) { g.dialog(name, `${sub}"Finish what you're doing for ${FACTIONS[this.active.f].name} first."`, [{ label: 'OK' }]); return; }
    const ch = chapters[done];
    const warn = !this.faction ? '<br><br><b style="color:#ff2a4a">Finishing this chapter commits you to this story: the other leaders will stop offering you theirs.</b>' : '';
    g.dialog(`${name} · CHAPTER ${done + 1}`, `${sub}<b>${ch.title}</b><br>${ch.brief}${warn}`, [
      { label: '1 · I\'M IN', fn: () => this.start(f, done) },
      { label: '2 · NOT YET' },
    ]);
  }

  // ---------- running a chapter ----------
  start(f, idx) {
    const g = this.game;
    const def = CHAPTERS[f][idx];
    this.active = { f, idx, def, si: -1, steps: def.steps.map((s) => ({ ...s })), t: 0, units: [], props: [] };
    g.hud.alert(`★ ${FACTIONS[f].name.toUpperCase()}: ${def.title.toUpperCase()}`, FACTIONS[f].color, 3.5);
    g.audio.pickup();
    this.next();
  }

  // Resolve a site selector into a position (+ the outpost it refers to, if any).
  resolve(sel, step) {
    const g = this.game;
    const T = g.territory;
    const A = this.active;
    const locOf = (id) => g.locations.find((l) => l.id === id);
    if (!sel) return null;
    if (sel.prev) return A.lastAt;
    if (sel.loc) { const l = locOf(sel.loc); return { pos: l.pos.clone(), loc: l }; }
    if (sel.outpost || sel.outpostAny) {
      const ref = locOf(sel.near) || { dir: g.player.pos.clone().normalize() };
      const want = sel.outpost || sel.outpostAny;
      let o = T.nearest(ref.dir, (x) => x.faction === want && !x.built);
      if (!o) o = T.nearest(ref.dir, (x) => !x.built && x.faction !== A.f);
      if (!o) return this.resolve({ site: sel.near || 'ilmb', min: 400, max: 700 });
      return { pos: g.planet.ground(o.dir, new THREE.Vector3()), outpost: o };
    }
    if (sel.captured) {
      const o = T.outposts.find((x) => x.id === this.capturedIds[this.capturedIds.length - 1]) || T.nearest(g.player.pos.clone().normalize(), (x) => x.faction === A.f);
      if (!o) return { pos: g.player.pos.clone() };
      return { pos: g.planet.ground(o.dir, new THREE.Vector3()), outpost: o };
    }
    if (sel.founded || sel.foundedIdx !== undefined) {
      const mine = this.myOutposts();
      const o = sel.foundedIdx !== undefined ? mine[sel.foundedIdx] || mine[0] : mine[mine.length - 1];
      if (!o) return { pos: g.player.pos.clone() };
      return { pos: g.planet.ground(o.dir, new THREE.Vector3()), outpost: o };
    }
    if (sel.site) {
      const l = locOf(sel.site);
      for (let tries = 0; tries < 60; tries++) {
        const dist = sel.min + Math.random() * (sel.max - sel.min);
        const t = tangent(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5), l.dir).normalize();
        const d = greatCircle(l.dir, t, dist);
        if (g.locations.some((x) => arcDist(d, x.dir) < (x.zoneR || x.r) + 150)) continue;
        if (T.outposts.some((o) => arcDist(d, o.dir) < 120)) continue;
        if (g.world.lakes.some((lk) => arcDist(d, lk.d) < lk.rad + 30)) continue;
        return { pos: g.planet.ground(d, new THREE.Vector3()) };
      }
      return { pos: g.planet.ground(greatCircle(l.dir, tangent(new THREE.Vector3(1, 0, 0), l.dir).normalize(), sel.min), new THREE.Vector3()) };
    }
    return null;
  }

  next() {
    const g = this.game;
    const A = this.active;
    this.clearStep();
    A.si++;
    if (A.si >= A.steps.length) { this.complete(); return; }
    const s = A.steps[A.si];
    s.phase = 'go';
    s.prog = 0;
    s.timer = s.secs || 0;
    if (s.at) { const r = this.resolve(s.at, s); if (r) { s.pos = r.pos; s.outpost = r.outpost; A.lastAt = r; } }
    if (s.site) { const r = this.resolve(s.site, s); s.pos = r.pos; A.lastAt = r; }
    if (s.t === 'relays') { s.list = s.sites.map((x) => this.resolve(x, s).pos); s.k = 0; s.pos = s.list[0]; }
    if (s.t === 'build' || s.t === 'carry') { s.fromLoc = g.locations.find((l) => l.id === s.from); s.phase = 'fetch'; s.trip = 0; }
    if (s.t === 'carry') { const r = this.resolve(s.to, s); s.dest = r.pos; }
    if (s.t === 'kade') { s.unit = this.spawnKade(true); }
    this.setMarker(this.stepTarget(s));
  }

  stepTarget(s) {
    if (!s) return null;
    if ((s.t === 'build' || s.t === 'carry') && s.phase === 'fetch') return s.fromLoc.pos;
    if (s.t === 'carry') return s.dest;
    if (s.t === 'kade') return s.unit && !s.unit.dead ? s.unit.body.pos : null;
    return s.pos;
  }

  setMarker(pos) {
    const g = this.game;
    if (!this.marker) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 160, 10, 1, true).translate(0, 80, 0), new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      g.scene.add(m);
      this.marker = m;
    }
    this.marker.visible = !!pos;
    if (pos) {
      this.marker.position.copy(pos);
      this.marker.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), pos.clone().normalize());
      this.marker.material.color.set(FACTIONS[this.active.f].color);
    }
  }

  clearStep() {
    const g = this.game;
    const A = this.active;
    if (!A) return;
    for (const p of A.props) p.removeFromParent();
    A.props = [];
    if (A.obj) { g.events.protect = g.events.protect.filter((o) => o !== A.obj); A.obj = null; }
    if (A.carrying) { g.player.setCargo(null); A.carrying = false; }
  }

  complete() {
    const g = this.game;
    const A = this.active;
    const f = A.f;
    const def = A.def;
    this.clearStep();
    this.setMarker(null);
    this.active = null;
    this.progress[f] = A.idx + 1;
    const first = !this.faction;
    if (first) this.faction = f;
    const r = def.reward;
    if (r.credits) g.addCredits(r.credits, 'Story');
    g.rep.add(f, r.rep || 8, `Story: ${def.title}`);
    const unlocks = [];
    if (r.vehicle && !this.vehicles.includes(r.vehicle)) { this.vehicles.push(r.vehicle); unlocks.push(`Vehicle: ${VEHICLES[r.vehicle].name} (V)`); }
    if (r.tech && !this.tech.includes(r.tech)) { this.tech.push(r.tech); unlocks.push(`Tech: ${TECH[r.tech].name}${TECH[r.tech].key !== '—' ? ` (${TECH[r.tech].key})` : ''}`); }
    if (r.outfit) { g.upgrades['outfit_' + r.outfit] = 1; unlocks.push('Outfit added to your wardrobe (C)'); }
    if (r.module) { for (const o of this.myOutposts().slice(-1)) if (!o.modules.includes(r.module)) o.modules.push(r.module); unlocks.push(`Free ${MODULES[r.module].name} at your newest outpost`); this.refreshOutposts(); }
    if (r.everyModule) { for (const o of this.myOutposts()) if (!o.modules.includes(r.everyModule)) o.modules.push(r.everyModule); this.refreshOutposts(); unlocks.push(`A ${MODULES[r.everyModule].name} at every homestead`); }
    this.save();
    g.save();
    g.style(80, 'CHAPTER COMPLETE');
    g.actionPanel('delivered', null, `${def.title.toUpperCase()} — COMPLETE!`);
    g.audio.cash();
    const lock = first ? `<br><br><b style="color:#ff2a4a">You are now ${LEADERS[f].name}'s runner. The other leaders will remember that.</b>` : '';
    const ul = unlocks.length ? `<br><br>${unlocks.map((u) => `★ ${u}`).join('<br>')}` : '';
    g.dialog(`${LEADERS[f].name.toUpperCase()} (RADIO)`, `${def.outro}${ul}${lock}${def.final ? '<br><br><b>STORY COMPLETE!</b>' : `<br><br><small>Next chapter at ${REQ[A.idx + 1]} reputation.</small>`}`, [{ label: 'ROGER THAT' }]);
  }

  fail(reason) {
    const g = this.game;
    if (!this.active) return;
    this.clearStep();
    this.setMarker(null);
    const f = this.active.f;
    for (const u of this.active.units) if (!u.dead && u.model) { u.dead = true; u.model.root.removeFromParent(); }
    this.active = null;
    g.hud.alert('CHAPTER FAILED', '#ff2a4a', 3);
    g.hud.toast(`${reason} (${LEADERS[f].name} will give you another go.)`, 4);
  }

  onDeath() { if (this.active) this.fail('You went down.'); }

  onImpact(speed) {
    const A = this.active;
    if (!A || !A.carrying) return;
    const s = A.steps[A.si];
    const limit = s.t === 'carry' ? s.fragile : 30;
    if (speed < limit) return;
    const g = this.game;
    A.carrying = false;
    g.player.setCargo(null);
    g.fx.explosion(g.player.center.clone(), s.t === 'carry' ? 7 : 3, s.t === 'carry');
    g.fx.pop(s.t === 'carry' ? 'IT CRACKED!' : 'PARTS SMASHED!', null, { color: '#ff2a4a', size: 64 });
    if (s.t === 'carry' && s.fragile < 25) g.damagePlayer(25, 'impact');
    g.hud.toast(`Go back to ${s.fromLoc.name} for another ${s.t === 'carry' ? 'one' : 'load'}.`, 3);
    s.phase = 'fetch';
    this.setMarker(this.stepTarget(s));
  }

  // spawn enemies around a point
  spawnGuards(pos, n, opts = {}) {
    const g = this.game;
    const up = pos.clone().normalize();
    const out = [];
    for (let i = 0; i < n; i++) {
      const t = tangent(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5), up).normalize();
      const p = greatCircle(up, t, 25 + Math.random() * 50);
      const e = g.enemies.spawnPirate(i % 3 === 2 ? 'rover' : 'skater', p, null, { rogue: true, targetObj: opts.targetObj || null });
      e.storyUnit = true;
      out.push(e);
    }
    this.active.units.push(...out);
    return out;
  }

  updateStep(dt) {
    const g = this.game;
    const P = g.player;
    const A = this.active;
    const s = A.steps[A.si];
    if (!s) return;
    const near = (pos, r) => pos && P.pos.distanceTo(pos) < r;
    A.t += dt;
    switch (s.t) {
      case 'goto':
        if (near(s.pos, s.r || 30)) this.next();
        break;
      case 'relays': {
        if (near(s.pos, 15)) {
          s.prog += dt;
          if (s.prog >= (s.hold || 3)) {
            s.prog = 0;
            const prop = this.relayProp(s.pos, s.charge);
            A.props.push(prop);
            g.fx.pop(s.charge ? 'CHARGE SET!' : 'DONE!', null, { color: FACTIONS[A.f].color, size: 54 });
            g.audio.pickup();
            s.k++;
            if (s.charge) { const pos = s.pos.clone(); g.schedule(4, () => { g.fx.explosion(pos.clone().addScaledVector(pos.clone().normalize(), 6), 14, true); g.audio.boom(true); }); }
            if (s.k >= s.list.length) { this.next(); return; }
            s.pos = s.list[s.k];
            this.setMarker(s.pos);
          }
        } else s.prog = Math.max(0, s.prog - dt);
        break;
      }
      case 'clear':
      case 'boss': {
        if (!s.spawned && near(s.pos, 600)) {
          s.spawned = true;
          if (s.t === 'boss') {
            const e = g.enemies.spawnPirate('rover', s.pos, null, { rogue: true });
            e.hp = e.maxHp = s.boss.hp;
            e.model.root.scale.setScalar(2.2);
            e.radius = 6.5;
            e.storyUnit = true;
            e.bossName = s.boss.name;
            s.units = [e];
            A.units.push(e);
            g.hud.alert(s.boss.name, '#ff2a4a', 3);
            g.cam.shake = 0.6;
          } else s.units = this.spawnGuards(s.pos, s.n);
        }
        if (s.spawned) {
          // units that wandered out of range get respawned when you return
          if (s.units.every((e) => e.dead) && s.units.some((e) => e.hp > 0)) { s.spawned = false; break; }
          if (s.units.every((e) => e.dead)) { g.fx.pop('CLEARED!', null, { color: '#7dff3a', size: 64 }); this.next(); }
        }
        break;
      }
      case 'capture': {
        if (s.phase === 'go') {
          if (!s.spawned && near(s.pos, 600)) { s.spawned = true; s.units = this.spawnGuards(s.pos, s.guards); g.fx.pop('MERCS!', s.pos.clone().addScaledVector(s.pos.clone().normalize(), 8), { color: '#ff2a4a', size: 50 }); }
          if (s.spawned && s.units.every((e) => e.dead)) {
            if (s.units.some((e) => e.hp > 0)) s.spawned = false;
            else { s.phase = 'hold'; g.hud.toast('Guards down. Stand on the outpost to take it.', 3); }
          }
        } else {
          if (near(s.pos, 35)) s.prog += dt; else s.prog = Math.max(0, s.prog - dt * 0.5);
          s.waveT = (s.waveT || 6) - dt;
          if (s.waveT <= 0) { s.waveT = 14; this.spawnGuards(s.pos.clone(), 2); }
          if (s.prog >= s.hold) {
            if (!s.outpost) s.outpost = g.territory.found(s.pos, A.f, 'tower', null);
            g.territory.capture(s.outpost, A.f);
            this.capturedIds.push(s.outpost.id);
            if (s.war) g.rep.add(s.war, -6, `Lost an outpost to ${FACTIONS[A.f].name}`);
            g.fx.pop('OUTPOST TAKEN!', null, { color: FACTIONS[A.f].color, size: 70 });
            g.hud.alert(`${FACTIONS[A.f].name.toUpperCase()} TERRITORY EXPANDS`, FACTIONS[A.f].color, 3);
            this.next();
          }
        }
        break;
      }
      case 'build':
      case 'carry': {
        if (s.phase === 'fetch') {
          if (near(s.fromLoc.pos, Math.min(60, s.fromLoc.r * 0.6))) {
            s.phase = 'haul';
            A.carrying = true;
            P.setCargo(s.t === 'carry' ? 0xff2e88 : 0xffd23f);
            g.fx.pop(s.t === 'carry' ? `${s.cargo}!` : 'PREFAB PARTS!', null, { color: '#ffd23f', size: 50 });
            g.audio.pickup();
            this.setMarker(this.stepTarget(s));
            if (s.chase) { g.hud.alert('EVERY GUN ON THE MOON IS AFTER YOU!', '#ff2a4a', 3); this.chaseT = 0; }
          }
        } else {
          if (s.chase) { this.chaseT -= dt; if (this.chaseT <= 0) { this.chaseT = 22; this.spawnGuards(P.pos.clone().addScaledVector(g.cam.fwd, -300), 2); } }
          const dest = s.t === 'carry' ? s.dest : s.pos;
          if (near(dest, s.t === 'carry' ? 40 : 25)) {
            A.carrying = false;
            P.setCargo(null);
            if (s.t === 'carry') { g.fx.pop('DELIVERED!', null, { color: '#7dff3a', size: 64 }); this.next(); break; }
            s.trip++;
            const crate = makeCrate(0xffd23f, 1.6);
            const up = s.pos.clone().normalize();
            crate.position.copy(g.planet.ground(greatCircle(up, tangent(new THREE.Vector3(Math.random(), Math.random(), Math.random()), up).normalize(), 4 + s.trip * 3), new THREE.Vector3(), 0.8));
            g.scene.add(crate);
            A.props.push(crate);
            g.fx.pop(`LOAD ${s.trip}/${s.trips}`, null, { color: '#ffd23f', size: 54 });
            if (s.trip >= s.trips) {
              const o = g.territory.found(s.pos, A.f, s.found.kind, s.found.name);
              this.founded.push(o.id);
              this.save();
              g.fx.explosion(s.pos.clone().addScaledVector(up, 3), 8, false);
              g.hud.alert(`${s.found.name.toUpperCase()} IS BUILT!`, FACTIONS[A.f].color, 3.5);
              A.lastAt = { pos: s.pos.clone(), outpost: o };
              this.next();
            } else { s.phase = 'fetch'; this.setMarker(this.stepTarget(s)); }
          }
        }
        break;
      }
      case 'defend': {
        if (!A.obj) {
          const up = s.pos.clone().normalize();
          const m = this.generatorProp(s.pos);
          A.props.push(m);
          A.obj = { center: s.pos.clone().addScaledVector(up, 2.5), vel: new THREE.Vector3(), radius: 2.6, hp: s.hp, maxHp: s.hp, dead: false, label: 'GENERATOR' };
          g.events.protect.push(A.obj);
          s.waveT = 3;
        }
        if (A.obj.dead) { this.fail('It was destroyed.'); return; }
        s.timer -= dt;
        s.waveT -= dt;
        if (s.waveT <= 0) { s.waveT = 16; this.spawnGuards(s.pos.clone().addScaledVector(g.cam.fwd, 0), 0); g.enemies.spawnWave(s.pos, 2 + Math.floor(A.t / 40), A.obj, 300); }
        if (s.timer <= 0) { g.fx.pop('HELD!', null, { color: '#7dff3a', size: 64 }); this.next(); }
        break;
      }
      case 'experiment': {
        const inside = near(s.pos, 40);
        if (!A.props.length) {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(40, 0.6, 6, 64), glow(0xc77dff));
          ring.position.copy(g.planet.ground(s.pos, new THREE.Vector3(), 0.6));
          ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), s.pos.clone().normalize());
          g.scene.add(ring);
          A.props.push(ring);
        }
        if (inside) {
          s.timer -= dt;
          s.zap = (s.zap || 1) - dt;
          if (s.zap <= 0) {
            s.zap = Math.max(0.7, 2 - A.t / 40);
            const up = P.up;
            const t = tangent(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5), up).normalize();
            const p = g.planet.ground(greatCircle(P.pos.clone().normalize(), t, Math.random() < 0.3 ? 0 : 4 + Math.random() * 22), new THREE.Vector3(), 0.3);
            g.fx.warningRing(p, 6, 1.1);
            g.schedule(1.1, () => { if (this.active) { g.explode(p.clone().addScaledVector(p.clone().normalize(), 1), 6, 20, 'anomaly', 1.6); g.fx.pop('ZZAP!', p.clone().addScaledVector(p.clone().normalize(), 3), { color: '#c77dff', size: 46 }); } });
          }
          if (Math.random() < dt * 0.3) { g.alchemy.buffs.lowGrav = Math.max(g.alchemy.buffs.lowGrav, 2.5); }
        }
        if (s.timer <= 0) { g.fx.pop('DATA CAPTURED!', null, { color: '#c77dff', size: 64 }); this.next(); }
        break;
      }
      case 'kade':
        if (s.unit && s.unit.dead) this.next();
        break;
      default: break;
    }
  }

  relayProp(pos, charge) {
    const g = this.game;
    const root = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.25, 4, 6), toon(charge ? 0x3a3550 : 0xd8d4e8));
    pole.position.y = 2;
    ink(pole, 0.04);
    const top = new THREE.Mesh(charge ? new THREE.BoxGeometry(0.8, 0.8, 0.8) : new THREE.OctahedronGeometry(0.6, 0), glow(charge ? 0xff2a4a : 0x2ec4ff));
    top.position.y = 4.3;
    root.add(pole, top);
    root.position.copy(g.planet.ground(pos, new THREE.Vector3()));
    root.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), pos.clone().normalize());
    g.scene.add(root);
    return root;
  }

  generatorProp(pos) {
    const g = this.game;
    const root = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.8, 1.2, 12), toon(0x55607a));
    ink(base, 0.06);
    base.position.y = 0.6;
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(1.4, 0), glow(new THREE.Color(FACTIONS[this.active.f].color).getHex()));
    core.position.y = 2.6;
    core.userData.spin = true;
    root.add(base, core);
    root.position.copy(g.planet.ground(pos, new THREE.Vector3()));
    root.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), pos.clone().normalize());
    g.scene.add(root);
    return root;
  }

  status() {
    const A = this.active;
    if (!A) return '';
    const s = A.steps[A.si];
    if (!s) return '';
    const P = this.game.player;
    const dist = (p) => (p ? `${(P.pos.distanceTo(p) / 1000).toFixed(1)} km` : '');
    switch (s.t) {
      case 'relays': return `${s.label} (${s.k}/${s.list.length}) · ${dist(s.pos)}${s.prog > 0 ? ` · ${Math.round((s.prog / (s.hold || 3)) * 100)}%` : ''}`;
      case 'clear': return `${s.label}${s.units ? ` · ${s.units.filter((e) => !e.dead).length} left` : ''} · ${dist(s.pos)}`;
      case 'boss': return `${s.label}${s.units && s.units[0] && !s.units[0].dead ? ` · ${Math.max(0, Math.round(s.units[0].hp))} HP` : ''} · ${dist(s.pos)}`;
      case 'capture': return s.phase === 'hold' ? `Hold the outpost: ${Math.round((s.prog / s.hold) * 100)}%` : `${s.label} · ${dist(s.pos)}`;
      case 'build': return `${s.phase === 'fetch' ? `Pick up parts at ${s.fromLoc.name}` : 'Haul the parts to the site'} (${s.trip}/${s.trips}) · ${dist(this.stepTarget(s))}`;
      case 'carry': return `${s.phase === 'fetch' ? `Pick up the ${s.cargo.toLowerCase()} at ${s.fromLoc.name}` : `Deliver it. Don't crack it!`} · ${dist(this.stepTarget(s))}`;
      case 'defend': return `${s.label} · ${Math.ceil(Math.max(0, s.timer))} s${this.active.obj ? ` · ${Math.round((this.active.obj.hp / this.active.obj.maxHp) * 100)}% integrity` : ''}`;
      case 'experiment': return `${s.label} · ${Math.ceil(Math.max(0, s.timer))} s${P.pos.distanceTo(s.pos) > 40 ? ' · GET INSIDE THE RING' : ''}`;
      case 'kade': return 'Defeat Longshot Kade';
      default: return `${s.label} · ${dist(s.pos)}`;
    }
  }

  // HUD panel (shares the event panel when no event is running)
  panel() {
    const A = this.active;
    if (!A) return null;
    const s = A.steps[A.si];
    let bar = 0;
    if (s) {
      if (s.t === 'capture' && s.phase === 'hold') bar = s.prog / s.hold;
      else if (s.t === 'defend' || s.t === 'experiment') bar = 1 - Math.max(0, s.timer) / s.secs;
      else if (s.t === 'relays') bar = s.k / s.list.length;
      else if (s.t === 'build') bar = s.trip / s.trips;
      else bar = A.si / A.steps.length;
    }
    return { faction: A.f, title: `★ CH.${A.idx + 1} · ${A.def.title}`, status: this.status(), bar };
  }

  objective() {
    const A = this.active;
    if (!A) return null;
    const s = A.steps[A.si];
    const pos = this.stepTarget(s);
    return pos ? { pos, label: `★ ${A.def.title.toUpperCase()}` } : null;
  }

  // ---------- outposts you founded: modules, income, healing ----------
  myOutposts() { return this.founded.map((id) => this.game.territory.outposts.find((o) => o.id === id)).filter(Boolean); }

  refreshOutposts() {
    const T = this.game.territory;
    for (const o of this.myOutposts()) if (o.model) T.despawn(o);
    T.save();
  }

  outpostMenu(o) {
    const g = this.game;
    const T = g.territory;
    o.bank = o.bank || 0;
    const mods = Object.entries(MODULES);
    const buttons = [];
    if (o.modules.includes('market') && o.bank >= 1) buttons.push({ label: `${buttons.length + 1} · COLLECT MARKET TAKINGS — ₵${Math.floor(o.bank)}`, fn: () => { g.addCredits(Math.floor(o.bank), 'Market'); o.bank = 0; this.outpostMenu(o); } });
    if (o.modules.includes('clinic')) buttons.push({ label: `${buttons.length + 1} · PATCH ME UP (free)`, fn: () => { g.player.health = g.player.maxHealth; g.fx.pop('GOOD AS NEW!', null, { color: '#7dff6a', size: 50 }); } });
    if (o.modules.includes('beacon')) buttons.push({ label: `${buttons.length + 1} · BEACON TRAVEL…`, fn: () => this.beaconMenu(o) });
    for (const [k, m] of mods) {
      if (o.modules.includes(k)) continue;
      if (o.modules.length >= 6) break;
      buttons.push({
        label: `${buttons.length + 1} · BUILD ${m.name.toUpperCase()} — ₵${m.cost}`,
        fn: () => {
          if (g.credits < m.cost) { g.hud.toast(`Not enough credits (need ₵${m.cost}).`, 2); return; }
          g.credits -= m.cost;
          o.modules.push(k);
          if (k === 'garage') { const v = o.faction === 'meridian' ? 'van' : 'mule'; if (!this.vehicles.includes(v)) { this.vehicles.push(v); g.hud.toast(`${VEHICLES[v].name} unlocked! Press V.`, 3); } }
          if (k === 'beacon') this.revealAround(o);
          g.audio.cash();
          this.refreshOutposts();
          this.save();
          g.save();
          this.outpostMenu(o);
        },
      });
    }
    buttons.push({ label: `${buttons.length + 1} · CLOSE` });
    const built = o.modules.length ? o.modules.map((k) => MODULES[k].name).join(', ') : 'nothing yet';
    const info = mods.filter(([k]) => !o.modules.includes(k)).map(([, m]) => `<b>${m.name}</b>: ${m.desc}`).join('<br>');
    g.dialog(T.name(o).toUpperCase(), `Built: <b>${built}</b> (${o.modules.length}/6)<br><br><small>${info}</small>`, buttons);
  }

  beaconMenu(from) {
    const g = this.game;
    const T = g.territory;
    const others = this.myOutposts().filter((o) => o !== from && o.modules.includes('beacon'));
    if (!others.length) { g.hud.toast('Build a beacon at another outpost to link them.', 2.5); return; }
    g.dialog('BEACON TRAVEL', 'Where to?', others.map((o, i) => ({ label: `${i + 1} · ${T.name(o)}`, fn: () => this.teleportTo(o.dir) })).concat([{ label: `${others.length + 1} · CANCEL` }]));
  }

  revealAround(o) {
    const G = this.game.globe;
    const cells = G.cells;
    const cos = Math.cos(1500 / 3600);
    for (let k = 0; k < G.explored.length; k++) if (cells[k * 3] * o.dir.x + cells[k * 3 + 1] * o.dir.y + cells[k * 3 + 2] * o.dir.z > cos) G.explored[k] = 1;
    G.save();
  }

  teleportTo(dir) {
    const g = this.game;
    const P = g.player;
    if (P.vehicle) g.garage.exit();
    const t = tangent(new THREE.Vector3(1, 0, 0), dir).normalize();
    const d = greatCircle(dir.clone().normalize(), t, 18);
    g.planet.update(g.planet.ground(d, new THREE.Vector3()), { budgetMs: 1e9 });
    const pos = g.planet.ground(d, new THREE.Vector3(), 1.5);
    const fwd = tangent(dir.clone().sub(d), d).normalize();
    P.respawn(pos, fwd);
    g.cam.fwd.copy(fwd);
    g.fx.explosion(pos, 4, false);
    g.fx.pop('*VWORP*', null, { color: '#c77dff', size: 56 });
    g.audio.tone(200, 0.5, 'sine', 0.25, 4);
  }

  // nearest clinic for redeploying after a K.O.
  clinicSpawn(from) {
    let best = null, bd = Infinity;
    for (const o of this.myOutposts()) {
      if (!o.modules.includes('clinic')) continue;
      const d = arcDist(from, o.dir);
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }

  updateOutposts(dt) {
    const g = this.game;
    const P = g.player;
    for (const o of this.myOutposts()) {
      if (o.modules.includes('market')) o.bank = Math.min(800, (o.bank || 0) + (40 / 60) * dt);
      const d = P.pos.distanceTo(g.planet.ground(o.dir, _v));
      if (o.modules.includes('greenhouse') && d < 60 && !P.dead) { P.health = Math.min(P.maxHealth, P.health + 4 * dt); o.bank = (o.bank || 0) + (o.modules.includes('market') ? 0 : 0); }
      if (o.modules.includes('turret') && d < 900) {
        o.fireCd = (o.fireCd || 0) - dt;
        if (o.fireCd <= 0) {
          o.fireCd = 1.2;
          const from = g.planet.ground(o.dir, new THREE.Vector3(), 12.5); // above the hub dome
          let target = null, bd = 300;
          for (const e of g.enemies.list) {
            if (e.dead || e.faction !== 'pirate' || !e.center || e.kind === 'core' || g.enemies.friendly(e)) continue;
            const dd = e.center.distanceTo(from);
            if (dd < bd) { bd = dd; target = e; }
          }
          if (target) g.projectiles.fire('mil', from, target.center.clone().sub(from).normalize().multiplyScalar(140), { damage: 26, splash: 4, color: 0xff9f1c, size: 0.45, knock: 0.5, spare: true });
        }
      }
    }
  }

  // ---------- tech ----------
  useTech(k) {
    const g = this.game;
    const P = g.player;
    if (!this.tech.includes(k)) { g.hud.toast(`${TECH[k].name} isn't yours yet.`, 1.5); return; }
    if (this.techCd[k] > 0) { g.hud.toast(`${TECH[k].name}: ${Math.ceil(this.techCd[k])} s`, 1); return; }
    if (k === 'dash') {
      if (P.vehicle) return;
      const dir = tangent(g.cam.fwd.clone(), P.up).normalize();
      const from = P.pos.clone();
      let dist = 30;
      for (let d = 2; d <= 30; d += 2) { if (g.colliders.query(P.pos.clone().addScaledVector(dir, d).addScaledVector(P.up, 1.2), 1.2, []).some((c) => g.colliders.contact(c, P.pos.clone().addScaledVector(dir, d).addScaledVector(P.up, 1.2), 1, _v) > 0)) { dist = d - 2; break; } }
      P.body.pos.addScaledVector(dir, dist);
      const sr = g.planet.surface(P.body.pos);
      if (P.body.pos.length() < sr + 0.3) P.body.pos.setLength(sr + 0.3);
      g.fx.beam(from.addScaledVector(P.up, 1.2), P.center.clone(), 0xc77dff);
      g.fx.pop('*PHASE*', null, { color: '#c77dff', size: 44, life: 0.6 });
      g.audio.tone(900, 0.2, 'sine', 0.2, 0.3);
      this.techCd.dash = 6;
    } else if (k === 'teleport') {
      const places = g.locations.filter((l) => l.discovered && !l.camp).map((l) => ({ name: l.name, dir: l.dir }))
        .concat(this.myOutposts().map((o) => ({ name: g.territory.name(o), dir: o.dir })));
      const page = (n) => {
        const per = 7, sl = places.slice(n * per, n * per + per), pages = Math.ceil(places.length / per);
        g.dialog('PERSONAL TELEPORTER', 'Pick a destination. (90 s recharge)', sl.map((p, i) => ({ label: `${i + 1} · ${p.name}`, fn: () => { this.techCd.teleport = 90; this.teleportTo(p.dir); } }))
          .concat(pages > 1 ? [{ label: `${sl.length + 1} · MORE (${n + 1}/${pages})`, fn: () => page((n + 1) % pages) }] : [])
          .concat([{ label: 'CANCEL' }]));
      };
      page(0);
    }
  }

  // Deflector Shield: called from damagePlayer; returns true if the hit was absorbed.
  absorb() {
    if (!this.tech.includes('shield') || this.techCd.shield > 0) return false;
    this.techCd.shield = 12;
    const g = this.game;
    g.fx.pop('DEFLECTED!', null, { color: '#2ee6ff', size: 50 });
    g.audio.tone(1400, 0.15, 'triangle', 0.2, 0.5);
    return true;
  }

  // ---------- Captain Kade, the sniper ----------
  // Rarely shows up with a regular dark-side pirate squad (unless you ride with Rustmoon).
  maybeKade() {
    const g = this.game;
    if (this.kade.captured || g.rep.aligned() || this.faction === 'rustmoon' || g.time < this.kade.nextAt) return;
    if (darkness(g.player.up) < 0.5 || g.enemies.list.some((e) => e.kind === 'sniper' && !e.dead)) return;
    if (Math.random() > 0.08) return;
    this.spawnKade(false);
  }

  spawnKade(final) {
    const g = this.game;
    const P = g.player;
    // pick a perch in front of you with a clear line of sight (he's a sniper, he plans these things)
    let pos = null;
    const base = tangent(g.cam.fwd.clone(), P.up).normalize();
    for (let i = 0; i < 24 && !pos; i++) {
      const dir = base.clone().applyAxisAngle(P.up, (i % 2 ? 1 : -1) * Math.floor(i / 2) * 0.35);
      const p = g.planet.ground(greatCircle(P.pos.clone().normalize(), dir, 170 + (i % 4) * 30), new THREE.Vector3(), 0.5);
      if (g.planet.visible(p.clone().addScaledVector(p.clone().normalize(), 2), P.center)) pos = p;
    }
    if (!pos) pos = g.planet.ground(greatCircle(P.pos.clone().normalize(), base, 140), new THREE.Vector3(), 0.5);
    const m = makeRunner({ ...LEADERS.rustmoon.look, pirate: true });
    this.addRifle(m, false);
    m.root.scale.setScalar(1.2);
    g.scene.add(m.root);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1, 6, 1, true), new THREE.MeshBasicMaterial({ color: 0xff1a2e, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
    beam.visible = false;
    g.scene.add(beam);
    const e = {
      kind: 'sniper', faction: 'pirate', model: m, hp: 480, maxHp: 480, body: makeBody(pos), radius: 1.5, center: pos.clone(), dead: false, impacts: [],
      heading: tangent(P.pos.clone().sub(pos), pos.clone().normalize()).normalize(), state: 'reposition', phase: 'move', phaseT: 2.5, beam, final, aim: new THREE.Vector3(),
      rogue: false, aggro: true, fireCd: 99, carrying: false, grab: 0, home: null, bossName: 'LONGSHOT KADE',
    };
    g.enemies.list.push(e);
    this.kade.met++;
    this.save();
    this.splash();
    g.actionPanel('villain', e, '"NOBODY SKATES MY SIDE OF THE MOON."');
    g.slowmo = 1.4;
    return e;
  }

  splash() {
    const el = this.splashEl;
    const L = LEADERS.rustmoon;
    el.innerHTML = `<div class="sp-burst"></div><div class="sp-name">CAPTAIN VEX "LONGSHOT" KADE</div><div class="sp-title">${L.title}</div><div class="sp-quote">${pick(['"Smile for the scope, Runner."', '"You\'ve got a lot of nerve, skating on MY side of the Moon."', '"Three hundred metres. Moving target. Easy."', '"Run. It\'s more fun when they run."'])}</div>`;
    el.classList.remove('hidden', 'sp-out');
    void el.offsetWidth;
    el.classList.add('sp-in');
    clearTimeout(this.splashT);
    this.splashT = setTimeout(() => { el.classList.add('sp-out'); setTimeout(() => el.classList.add('hidden'), 400); }, 3200);
    this.game.audio.tone(110, 0.8, 'sawtooth', 0.25, 0.5);
    this.game.audio.boom(true);
  }

  updateSniper(e, dt) {
    const g = this.game;
    const P = g.player;
    const b = e.body;
    const up = b.up.copy(b.pos).normalize();
    const toP = P.center.clone().sub(e.center);
    const dist = toP.length();
    // keep a sniper's distance: back off if you close in, creep in if you run
    const flat = tangent(toP.clone(), up);
    const seen = g.planet.visible(e.center, P.center);
    // creep closer to find a line of sight, otherwise keep a sniper's distance
    const want = dist < 120 ? -1 : !seen || dist > 280 ? 1 : dist < 150 ? -1 : 0;
    const ctrl = { wish: flat.lengthSq() > 0 ? flat.normalize().multiplyScalar(want) : flat, skates: false, thrust: want !== 0 && b.energy > 30 && (want < 0 || !seen), jump: false, thrustDir: flat.clone().multiplyScalar(want).addScaledVector(up, 0.2).normalize() };
    if (e.phase !== 'move') { ctrl.wish.set(0, 0, 0); ctrl.skates = false; ctrl.thrust = false; }
    const steps = Math.ceil(dt / (1 / 60));
    for (let i = 0; i < steps; i++) stepSkater(b, ctrl, dt / steps, g.planet, g.colliders, undefined, e.impacts);
    e.center.copy(b.pos).addScaledVector(up, 1.5);
    if (flat.lengthSq() > 0) e.heading.copy(tangent(toP.clone(), up).normalize());
    const m = e.model;
    m.root.position.copy(b.pos);
    frameQuat(up, e.heading, m.root.quaternion);
    m.armR.rotation.x = e.phase === 'move' ? -0.3 : -1.5;
    m.glowM.color.setHex(e.flash > 0 ? 0xffffff : 0xff2a3a);
    if (e.flash > 0) e.flash -= dt;
    m.root.updateMatrixWorld(true);
    const muzzle = m.armR.localToWorld(new THREE.Vector3(0, -0.55, 1.9));
    const eye = e.center.clone().addScaledVector(up, 0.4);
    const los = g.planet.visible(eye, P.center) && !P.dead;
    e.phaseT -= dt;
    const warn = this.lockEl;
    if (e.phase === 'move') {
      e.beam.visible = false;
      if (e.phaseT <= 0 && los && dist < 420) { e.phase = 'lock'; e.phaseT = 2.0; e.beep = 0; }
      else if (e.phaseT <= 0) e.phaseT = 0.5;
    } else if (e.phase === 'lock') {
      if (!los) { e.phase = 'move'; e.phaseT = 2; g.fx.pop('"TCH. LOST YOU."', e.center.clone().addScaledVector(up, 3), { color: '#ff2a3a', size: 32 }); }
      e.aim.copy(P.center);
      e.beep -= dt;
      if (e.beep <= 0) { e.beep = 0.08 + e.phaseT * 0.18; g.audio.tone(1200 + (2 - e.phaseT) * 600, 0.05, 'square', 0.08); }
      if (e.phaseT <= 0) { e.phase = 'commit'; e.phaseT = 0.38; }
    } else if (e.phase === 'commit') {
      if (e.phaseT <= 0) {
        // FIRE: hits where you were when the dot froze
        const dir = e.aim.clone().sub(muzzle).normalize();
        const end = muzzle.clone().addScaledVector(dir, 600);
        const closest = muzzle.clone().addScaledVector(dir, Math.max(0, P.center.clone().sub(muzzle).dot(dir)));
        const hit = closest.distanceTo(P.center) < 1.9 && g.planet.visible(eye, P.center) && !P.dead;
        g.fx.beam(muzzle, hit ? P.center.clone() : end, 0xff1a2e);
        g.audio.boom(false);
        g.audio.tone(2400, 0.25, 'sawtooth', 0.2, 0.1);
        if (hit) {
          g.damagePlayer(P.vehicle ? 45 * P.vehicle.def.armor : 45, 'sniper');
          P.vel.addScaledVector(dir, 10);
          g.fx.pop('CRACK!', null, { color: '#ff2a3a', size: 80 });
          g.cam.shake = Math.max(g.cam.shake, 0.8);
        } else g.fx.pop('MISSED!', null, { color: '#7dff3a', size: 50, life: 0.7 });
        e.phase = 'move';
        e.phaseT = 2 + Math.random() * 2;
      }
    }
    // the laser sight
    if (e.phase === 'lock' || e.phase === 'commit') {
      const target = e.phase === 'lock' ? P.center : e.aim;
      const len = muzzle.distanceTo(target);
      e.beam.visible = true;
      e.beam.position.lerpVectors(muzzle, target, 0.5);
      e.beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), target.clone().sub(muzzle).normalize());
      e.beam.scale.set(e.phase === 'commit' ? 3 : 1 + Math.sin(g.time * 40) * 0.3, len, e.phase === 'commit' ? 3 : 1);
      e.beam.material.color.setHex(e.phase === 'commit' ? 0xffffff : 0xff1a2e);
    }
    warn.classList.toggle('hidden', !(e.phase === 'lock' || e.phase === 'commit'));
    if (e.phase === 'commit') warn.textContent = '⚠ MOVE! ⚠';
    else if (e.phase === 'lock') warn.textContent = `⚠ LASER LOCK ${'▮'.repeat(Math.ceil(e.phaseT * 3))}`;
    // he bails out when hurt (unless this is the showdown)
    if (!e.final && e.hp < e.maxHp * 0.35) {
      e.dead = true;
      e.beam.removeFromParent();
      m.root.removeFromParent();
      warn.classList.add('hidden');
      g.fx.explosion(e.center, 6, false);
      g.fx.pop('"THIS AIN\'T OVER, RUNNER!"', e.center.clone().addScaledVector(up, 4), { color: '#ff2a3a', size: 44, life: 2 });
      g.addCredits(500, 'Drove off Kade');
      g.style(100, 'KADE ESCAPED');
      g.rep.add('spacecom', 4, 'Drove off Longshot Kade');
      this.kade.beaten++;
      this.kade.nextAt = g.time + 900;
      this.save();
    }
    if (P.pos.distanceTo(b.pos) > 1200 && !e.final) { e.dead = true; e.beam.removeFromParent(); m.root.removeFromParent(); warn.classList.add('hidden'); this.kade.nextAt = g.time + 300; }
  }

  onKill(e) {
    if (e.kind !== 'sniper') return;
    const g = this.game;
    e.beam.removeFromParent();
    this.lockEl.classList.add('hidden');
    if (e.final) {
      this.kade.captured = true;
      g.hud.alert('LONGSHOT KADE IS IN CUFFS!', '#ffd23f', 4);
    }
    g.addCredits(800, 'Kade bounty');
    this.save();
  }

  // ---------- UI ----------
  buildUI() {
    const hud = document.getElementById('hud');
    this.splashEl = document.createElement('div');
    this.splashEl.id = 'splash';
    this.splashEl.className = 'hidden';
    hud.appendChild(this.splashEl);
    this.lockEl = document.createElement('div');
    this.lockEl.id = 'lockwarn';
    this.lockEl.className = 'hidden';
    hud.appendChild(this.lockEl);
  }

  // ---------- per frame ----------
  update(dt) {
    for (const k of Object.keys(this.techCd)) this.techCd[k] = Math.max(0, this.techCd[k] - dt);
    for (const L of Object.values(this.leaders)) {
      if (!L.loc.active) continue;
      L.t += dt;
      L.model.head.rotation.y = Math.sin(L.t * 0.7) * 0.4;
      L.ring.scale.setScalar(1 + Math.sin(L.t * 3) * 0.06);
      L.beam.material.opacity = 0.12 + Math.sin(L.t * 2) * 0.05;
      L.model.armL.rotation.z = -0.3 + Math.sin(L.t * 1.3) * 0.15;
    }
    if (this.active) {
      this.updateStep(dt);
      if (this.active) {
        const s = this.active.steps[this.active.si];
        const tgt = this.stepTarget(s);
        if (tgt && this.marker) this.marker.position.copy(tgt);
        for (const p of this.active.props) p.traverse((o) => { if (o.userData.spin) o.rotation.y += dt * 2; });
      }
    }
    this.updateOutposts(dt);
  }

  hudTech() {
    if (!this.tech.length) return '';
    return this.tech.map((k) => {
      const cd = this.techCd[k];
      const key = TECH[k].key !== '—' ? `[${TECH[k].key}] ` : '';
      return `<span class="${cd > 0 ? 'cd' : 'ready'}">${key}${TECH[k].name}${cd > 0 ? ` ${Math.ceil(cd)}s` : ''}</span>`;
    }).join(' · ');
  }
}

export { CHAPTERS, REQ };
