import * as THREE from 'three';
import { arcDist, frameQuat } from './geo.js';
import { toon, glow, ink } from './toon.js';

// Guided first shift, with BOLT: a little courier-school drone that hovers at your shoulder. It
// teaches the controls (each step waits until you've actually done the thing), then rides along
// for two training contracts: a gentle run from the ILMB to the nearest Kepler town, then a
// cleared delivery from there to a Vostok base, where it explains factions and restricted zones.
// It chips in as you go (big air, a hard landing that dings the parcel, top speed, grinds), and at
// the end offers a free recovery shuttle back to the ILMB. No pirate ambushes while it's with you.
const KEY = 'moonrunner-tutorial-v1';

const STEPS = [
  { id: 'look', title: 'LOOK AROUND', text: 'Hey, rookie! I\'m <b>BOLT</b>, your courier-school drone. I\'ll ride along for your first couple of jobs. Move the <b>MOUSE</b> to look around.', hold: true },
  { id: 'walk', title: 'WALK', text: 'Walk with <b>W A S D</b>.', hold: true },
  { id: 'skate', title: 'QUANTUM-LOCK SKATES', text: 'Now the good stuff: hold <b>SPACE</b> to lock your skates and <b>glide</b>. Push off with <b>W</b> and keep holding SPACE.', hold: true },
  { id: 'carve', title: 'CARVE', text: 'While you glide, steer with <b>A</b> and <b>D</b>.', hold: true },
  { id: 'jump', title: 'MAG-JUMP', text: '<b>SHIFT</b> mag-jumps you. Give it a go!' },
  { id: 'thrust', title: 'THRUSTERS', text: 'Hold <b>E</b> (or the <b>right mouse button</b>) for thrusters. They burn JET, which tops itself back up.', hold: true },
  { id: 'map', title: 'THE GLOBE MAP', text: 'Press <b>M</b> for the globe map. Drag to spin it, then <b>M</b> again to close it.' },
  { id: 'board', title: 'THE JOB BOARD', text: 'Follow the arrow to the yellow <b>JOB BOARD</b> and press <b>F</b>.' },
  { id: 'accept', title: 'TAKE A CONTRACT', text: 'Take the <b>TRAINING RUN</b> to {town} (click it, or press <b>1</b>).' },
  { id: 'deliver', title: 'FIRST DELIVERY', text: 'Follow the arrow to <b>{town}</b>. Downhill + skates = speed. Land with your skates <b>on</b>, or the parcel takes a beating!' },
  { id: 'board2', title: 'ANOTHER JOB', text: 'Nice work! {town} has a job for you too. Press <b>F</b> here to open its job board.' },
  { id: 'accept2', title: 'A MILITARY RUN', text: 'Take the <b>VOSTOK</b> contract to {base}. It comes with delivery <b>CLEARANCE</b>.' },
  { id: 'deliver2', title: 'CLEARED DELIVERY', text: 'Take it to <b>{base}</b>. Vostok is the military, and their bases are <b>restricted zones</b>. Your clearance gets you in.' },
];

// BOLT himself: a round courier drone with a big glowing eye, two rotor pods and an antenna
function makeDrone() {
  const root = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.42, 18, 12), toon(0xfff4e0));
  ink(body, 0.04);
  root.add(body);

  const visor = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.06, 16).rotateX(Math.PI / 2), toon(0x1d1a29));
  visor.position.set(0, 0.04, 0.37);
  root.add(visor);
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), glow(0x2ee6ff));
  eye.scale.set(1, 0.8, 0.45);
  eye.position.set(0, 0.04, 0.41);
  root.add(eye);
  const rotors = [];
  for (const s of [-1, 1]) {
    const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.45, 10).rotateZ(Math.PI / 2), toon(0x5b5870));
    ink(pod, 0.03);
    pod.position.set(s * 0.6, 0, 0);
    root.add(pod);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.035, 6, 20), toon(0xffd23f));
    ring.rotation.x = Math.PI / 2;
    ring.position.set(s * 0.82, 0.12, 0);
    root.add(ring);
    const blades = new THREE.Group();
    blades.position.copy(ring.position);
    for (let k = 0; k < 2; k++) {
      const bl = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.02, 0.07), toon(0x3a3550));
      bl.rotation.y = (k * Math.PI) / 2;
      blades.add(bl);
    }
    root.add(blades);
    rotors.push(blades);
  }
  const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.4, 5), toon(0x3a3550));
  ant.position.set(0.14, 0.58, -0.05);
  root.add(ant);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2a4a }));
  tip.position.set(0.14, 0.8, -0.05);
  root.add(tip);
  const jet = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.35, 8), new THREE.MeshBasicMaterial({ color: 0x9be7ff, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
  jet.rotation.x = Math.PI;
  jet.position.set(0, -0.5, 0);
  root.add(jet);
  root.traverse((o) => { o.castShadow = false; });
  return { root, eye, rotors, tip, jet };
}

// what BOLT says when you do something worth a comment
const QUIPS = {
  air: ['Whoa, SICK air!', 'Look at you go!', 'Air time! The judges love it.', 'Wheeee! Er, I mean: very professional.'],
  rough: ['Ouch! Careful with the parcel!', 'That landing rattled the cargo. Skates ON when you touch down!', 'The client heard that one.'],
  fast: ['Now we\'re moving!', 'I can barely keep up!', 'Speed limit? Never heard of it.'],
  hurt: ['You okay down there?', 'That looked like it hurt.'],
  grind: ['Grinding! Style points!', 'Rail-riding, nice!'],
  crash: ['Up you get. I\'ll pretend I didn\'t see that.'],
};

export class Tutorial {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.step = 0;
    this.prog = 0;
    this.done = false;
    try { this.done = !!JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { /* fresh */ }
    this.el = document.createElement('div');
    this.el.id = 'tutorial';
    this.el.className = 'hidden';
    document.getElementById('hud').appendChild(this.el);
    this.drone = null;
    this.say = null; // { text, t }
    this.quipT = 0;
  }

  // Offer the training at the start of a fresh game.
  offer() {
    const g = this.game;
    if (this.done || (g.stats.deliveries || 0) > 0) return;
    g.dialog('BOLT · COURIER-SCHOOL DRONE', '"Bzzt! Hi! I\'m BOLT, SPACECOM courier school. First shift on the Moon? I\'ll hover along, show you the skates and ride with you on your first two deliveries. Promise I won\'t get in the way. Much."', [
      { label: '1 · SURE, SHOW ME', fn: () => this.begin() },
      { label: '2 · I KNOW WHAT I\'M DOING (skip)', fn: () => this.finish(true) },
    ]);
  }

  begin() {
    const g = this.game;
    this.active = true;
    this.step = 0;
    this.prog = 0;
    this.lastFwd = null;
    this.lastPos = g.player.pos.clone();
    g.tipIndex = 1e9; // the old tips stay quiet while BOLT teaches
    this.pickRoute();
    if (!this.drone) {
      this.drone = makeDrone();
      g.scene.add(this.drone.root);
      this.drone.pos = g.player.center.clone().addScaledVector(g.player.up, 3);
      this.drone.root.position.copy(this.drone.pos);
    }
    this.drone.leaving = 0;
    this.render(true);
  }

  // the two runs: the nearest Kepler town to the ILMB, then the nearest Vostok base from there
  pickRoute() {
    const g = this.game;
    const hub = g.hub;
    const towns = g.locations.filter((l) => l.faction === 'kepler' && !l.restricted && !l.dark && l.type !== 'pirate' && (l.jobs || []).length);
    towns.sort((a, b) => arcDist(a.dir, hub.dir) - arcDist(b.dir, hub.dir));
    this.town = towns[0] || g.locations.find((l) => l.id === 'kepler');
    const bases = g.locations.filter((l) => l.faction === 'vostok' && l.restricted);
    bases.sort((a, b) => (a.dark ? 1 : 0) - (b.dark ? 1 : 0) || arcDist(a.dir, this.town.dir) - arcDist(b.dir, this.town.dir));
    this.base = bases[0];
  }

  finish(skipped) {
    const g = this.game;
    this.active = false;
    this.done = true;
    this.el.classList.add('hidden');
    try { localStorage.setItem(KEY, 'true'); } catch { /* unavailable */ }
    if (this.drone) this.drone.leaving = 0.001; // it flies off
    if (skipped) return;
    g.addCredits(200, 'Training bonus');
    g.audio.cash();
    g.dialog('BOLT · COURIER-SCHOOL DRONE', '"Bzzt! That\'s two deliveries: you\'re officially a Moon-Runner! A few things to explore on your own:<br><br>• <b>F</b> at any settlement opens its job board; HQs sell gear upgrades.<br>• <b>J</b> shows your reputation. Get FRIENDLY with a faction and its leader (the glowing beacon at their HQ) will offer you their story.<br>• The dark side pays more, but it\'s pirate country.<br>• Strange places are out there. Go look.<br>• <b>H</b> for your controls, <b>Esc</b> for settings.<br><br>Want a lift back to the International Moon Base? I can call a recovery shuttle. On the house!"', [
      { label: '1 · YES, CALL THE SHUTTLE', fn: () => { if (!g.recall.active) g.recall.start(); } },
      { label: '2 · I\'LL MAKE MY OWN WAY', fn: () => {} },
    ]);
  }

  // A short, safe delivery from the ILMB to the nearest Kepler town.
  trainingOffer() {
    const g = this.game;
    const M = g.missions;
    const hub = g.hub, to = this.town;
    const o = M.makeOffer(hub, 'kepler');
    const dist = arcDist(to.dir, hub.dir);
    Object.assign(o, {
      board: hub, pickup: hub, to, dist, faction: 'kepler', dark: false, clearance: null, premium: false, training: true,
      cargo: { name: 'TRAINING RUN: Welcome Parcel', fragile: 0.1, hot: 0, color: 0x2ec4ff },
      client: 'BOLT (courier school)', time: Math.ceil((dist / 18 + 60) / 5) * 5, reward: 150,
      text: `Take this to ${to.name}. No pirates on this route: I'm watching.`,
    });
    return o;
  }

  // The second run: Vostok rations from the Kepler town to the base, with clearance.
  vostokOffer() {
    const g = this.game;
    const M = g.missions;
    const from = this.town, to = this.base;
    const o = M.makeOffer(from, 'kepler');
    const dist = arcDist(to.dir, from.dir);
    Object.assign(o, {
      board: from, pickup: from, to, dist, faction: 'vostok', dark: !!to.dark, clearance: to.id, premium: false, training: true,
      cargo: { name: 'TRAINING RUN: Vostok Ration Crates', fragile: 0.2, hot: 0, color: 0xff3b5c },
      client: 'Quartermaster Ilya (Vostok)', time: Math.ceil((dist / 16 + 90) / 5) * 5, reward: 220,
      text: `Rations for ${to.name}. Clearance attached: our gunners will let you through. Do not dawdle on the perimeter.`,
    });
    return o;
  }

  fill(text) {
    return text.replace('{town}', this.town ? this.town.name : 'town').replace('{base}', this.base ? this.base.name : 'the base');
  }

  next() {
    const g = this.game;
    this.step++;
    this.prog = 0;
    g.audio.tone(880, 0.12, 'triangle', 0.2);
    setTimeout(() => g.audio.tone(1320, 0.15, 'triangle', 0.2), 90);
    g.fx.pop('NICE!', null, { color: '#2ee6ff', size: 46, life: 0.8 });
    if (this.step >= STEPS.length) { this.finish(false); return; }
    const id = STEPS[this.step].id;
    // the contracts BOLT wants you on are waiting on the right boards
    if (id === 'board') {
      const list = g.missions.offersFor(g.hub);
      if (!list.some((o) => o.training)) list.unshift(this.trainingOffer());
    }
    if (id === 'board2') {
      const list = g.missions.offersFor(this.town);
      if (!list.some((o) => o.training)) list.unshift(this.vostokOffer());
      this.talk('That\'s a delivery! Kepler are the homesteaders: friendly folk, lots of small jobs. Every faction keeps score of how you treat them.', 6);
    }
    if (id === 'deliver2') {
      this.warned = false;
      this.talk('Five factions run the Moon: SPACECOM (us), Kepler, Meridian, Daedalus and Vostok, plus the Rustmoon pirates. Some can turn hostile if you cross them.', 7);
    }
    if (id === 'deliver' || id === 'deliver2') this.deliveriesAt = g.stats.deliveries || 0;
    this.render(true);
  }

  // a passing remark (shown in the panel under the current step, and chirped)
  talk(text, dur = 3) {
    this.say = { text, t: dur };
    this.render();
    const g = this.game;
    g.audio.tone(1200 + Math.random() * 400, 0.06, 'square', 0.05, 1.6);
    setTimeout(() => g.audio.tone(900 + Math.random() * 300, 0.07, 'square', 0.05, 0.7), 80);
  }

  quip(kind) {
    // (he's a companion, not a commentator: a long gap between remarks, and he lets most moments pass)
    if (this.quipT > 0 || Math.random() < 0.55) { if (!(this.quipT > 0)) this.quipT = 6; return; }
    this.quipT = 22;
    const list = QUIPS[kind];
    this.talk(list[Math.floor(Math.random() * list.length)], 2.8);
  }

  render(pop) {
    const s = STEPS[this.step];
    if (!s) return;
    const bar = s.hold ? `<div class="tut-bar"><div style="width:${Math.round(Math.min(1, this.prog) * 100)}%"></div></div>` : '';
    const say = this.say ? `<div class="tut-say">“${this.say.text}”</div>` : '';
    const html = `<div class="tut-head">◉ BOLT · ${this.step + 1}/${STEPS.length} · ${s.title}</div><div class="tut-text">${this.fill(s.text)}</div>${bar}${say}`;
    if (html !== this.lastHtml) { this.el.innerHTML = html; this.lastHtml = html; }
    this.el.classList.remove('hidden');
    if (pop) { this.el.classList.remove('tut-pop'); void this.el.offsetWidth; this.el.classList.add('tut-pop'); }
  }

  // objective arrow while heading for the ILMB board
  objective() {
    if (!this.active) return null;
    const s = STEPS[this.step];
    const g = this.game;
    if (s.id === 'board') return { pos: g.world.toWorld(g.hub, 0, 0, 84), label: 'JOB BOARD' };
    return null;
  }

  // screens that pause the world report in directly
  on(what) {
    if (!this.active) return;
    const id = STEPS[this.step].id;
    if (what === 'map' && id === 'map') this.sawMap = true;
    if (what === 'board' && (id === 'board' || id === 'board2')) this.next();
  }

  // the training runs never get ambushed
  quiet() { return this.active; }

  // BOLT hovers at your shoulder, bobbing, facing where you look (or you, while talking)
  updateDrone(dt) {
    const D = this.drone;
    if (!D) return;
    const g = this.game;
    const P = g.player;
    const up = P.up;
    D.t = (D.t || 0) + dt;
    if (D.leaving > 0) {
      D.leaving += dt;
      D.pos.addScaledVector(up, dt * (4 + D.leaving * 12));
      D.root.position.copy(D.pos);
      if (D.leaving > 3) { D.root.removeFromParent(); this.drone = null; }
      return;
    }
    const want = P.center.clone().addScaledVector(g.cam.right, 1.7).addScaledVector(up, 1.25 + Math.sin(D.t * 2.2) * 0.12).addScaledVector(g.cam.fwd, -0.3);
    if (D.pos.distanceTo(want) > 40) D.pos.copy(want);
    D.pos.lerp(want, 1 - Math.exp(-dt * 7));
    D.root.position.copy(D.pos);
    const look = this.say ? g.camera.position.clone().sub(D.pos) : g.cam.fwd.clone();
    look.addScaledVector(up, -look.dot(up));
    if (look.lengthSq() > 1e-4) {
      const q = frameQuat(up, look.normalize(), new THREE.Quaternion());
      D.root.quaternion.slerp(q, Math.min(1, dt * 5));
    }
    for (const r of D.rotors) r.rotation.y += dt * 40;
    D.tip.visible = Math.sin(D.t * 5) > 0;
    D.jet.scale.y = 0.8 + Math.sin(D.t * 30) * 0.2;
    D.eye.scale.y = this.say && Math.sin(D.t * 14) > 0.6 ? 0.25 : 0.8; // "talking" flicker
  }

  update(dt) {
    this.updateDrone(dt);
    if (!this.active) return;
    const g = this.game;
    const P = g.player;
    const I = g.input;
    const s = STEPS[this.step];
    const b = P.body;
    // passing remarks
    if (this.say) { this.say.t -= dt; if (this.say.t <= 0) { this.say = null; this.render(); } }
    this.quipT -= dt;
    if (b.airTime > 1.4 && !b.grounded) this.airLong = true;
    if (b.grounded && this.airLong) { this.airLong = false; this.quip('air'); }
    const M = g.missions;
    if (M.active && this.lastInteg != null && M.integrity < this.lastInteg - 0.03) this.quip('rough');
    this.lastInteg = M.active ? M.integrity : null;
    if (P.speed > 48) this.quip('fast');
    if (this.lastHp != null && P.health < this.lastHp - 8) this.quip('hurt');
    this.lastHp = P.health;
    if (g.grind && g.grind.active && !this.wasGrinding) this.quip('grind');
    this.wasGrinding = !!(g.grind && g.grind.active);
    const add = (amount, need) => { this.prog += amount / need; if (this.prog >= 1) this.next(); else this.render(); };
    switch (s.id) {
      case 'look': {
        const f = g.cam.fwd.clone();
        if (this.lastFwd) add(this.lastFwd.angleTo(f) + Math.abs(g.cam.pitch - (this.lastPitch ?? g.cam.pitch)), 2.2);
        this.lastFwd = f;
        this.lastPitch = g.cam.pitch;
        break;
      }
      case 'walk': {
        const d = P.pos.distanceTo(this.lastPos);
        this.lastPos.copy(P.pos);
        if (!b.skating && d < 2) add(d, 12);
        break;
      }
      case 'skate':
        if (b.skating && P.speed > 8) add(dt, 2.5);
        break;
      case 'carve':
        if (b.skating && P.speed > 5 && (I.down('KeyA') || I.down('KeyD'))) add(dt, 1.2);
        break;
      case 'jump':
        if (b.jumped || (!b.grounded && b.airTime > 0.3 && P.vel.dot(P.up) > 2)) this.next();
        break;
      case 'thrust':
        if (b.thrusting) add(dt, 1.2);
        break;
      case 'map':
        if (this.sawMap && g.state === 'play') { this.sawMap = false; this.next(); }
        break;
      case 'accept':
      case 'accept2':
        if (M.active) {
          if (M.active.training) this.next();
          else { this.step = STEPS.findIndex((x) => x.id === (s.id === 'accept' ? 'deliver' : 'deliver2')); this.deliveriesAt = g.stats.deliveries || 0; this.render(true); } // a different job: fine, deliver that
        } else if (g.state === 'play') {
          // closed the board without taking it: send them back
          this.step = STEPS.findIndex((x) => x.id === (s.id === 'accept' ? 'board' : 'board2'));
          this.render(true);
        }
        break;
      case 'deliver':
      case 'deliver2': {
        // on the way: a word about the place you're heading for
        const a = M.active;
        if (a && s.id === 'deliver' && !this.nearTown && arcDist(P.pos, a.to.dir) < 450) { this.nearTown = true; this.talk(`There's ${a.to.name}! Get inside the town to hand the parcel over.`, 4); }
        if (a && s.id === 'deliver2' && !this.warned && a.to.restricted && arcDist(P.pos, a.to.dir) < (a.to.zoneR || a.to.r * 2) * 1.35) {
          this.warned = true;
          this.talk(`That's the ${a.to.name} perimeter. Military zones are RESTRICTED: without clearance their turrets warn you, then open fire. Your contract's clearance means they'll wave you through. Don't shoot anything!`, 9);
        }
        if (!a) {
          if ((g.stats.deliveries || 0) > (this.deliveriesAt || 0)) this.next();
          else {
            this.step = STEPS.findIndex((x) => x.id === (s.id === 'deliver' ? 'board' : 'board2'));
            this.render(true);
            g.hud.toast(s.id === 'deliver' ? 'No worries, grab another contract from the ILMB board.' : `No worries: ${this.town.name}'s board will have another.`, 3);
          }
        }
        break;
      }
      default: break;
    }
  }
}
