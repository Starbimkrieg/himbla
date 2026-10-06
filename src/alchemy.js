import * as THREE from 'three';
import { PHYS } from './config.js';
import { makeFigure } from './models.js';
import { toon, glow, ink } from './toon.js';
import { frameQuat, tangent, greatCircle } from './geo.js';
import { pick } from './rng.js';

// What can go in a containment jar.
export const ITEMS = {
  rock: { name: 'Rock Sample', icon: '◆', color: '#2ee6ff' },
  dirt: { name: 'Moon Dirt', icon: '▲', color: '#c9b79c' },
  water: { name: 'Black Water', icon: '●', color: '#7b5cff' },
  person: { name: 'A Person', icon: '☺', color: '#ff9f1c' },
  // things that happen when items sit together in a jar
  mud: { name: 'Moon Mud', icon: '≈', color: '#8a6a4a' },
  slickrock: { name: 'Slick Rock', icon: '◈', color: '#9be7ff' },
  voidling: { name: 'Void-Touched Person', icon: '☻', color: '#c77dff' },
};

// Slow reactions inside the jar (pairs that sit together for a while turn into something else).
const JAR_MIXES = [
  { a: 'dirt', b: 'water', into: 'mud', text: 'The dirt and the black water turned into MOON MUD.' },
  { a: 'rock', b: 'water', into: 'slickrock', text: 'The rock sample is coated in black slime. SLICK ROCK!' },
  { a: 'person', b: 'water', into: 'voidling', text: 'Your passenger has gone… purple. VOID-TOUCHED!' },
];
const MIX_TIME = 12;

const NAMES = ['Gary', 'Priya', 'Tomasz', 'Little Juno', 'Ade', 'Wen', 'Marisol', 'Big Lars', 'Fen', 'Doris'];

const _v = new THREE.Vector3();

// Containment jar + Dr. Zbornak's reactor: scoop things up, let them stew, feed them to
// the antimatter and see what happens.
export class Alchemy {
  constructor(game) {
    this.game = game;
    this.jar = [];
    this.mixT = 0;
    this.followers = [];
    this.wanderers = [];
    this.statues = 0;
    this.buffs = { lowGrav: 0, slick: 0, bouncy: 0, invert: 0, rain: 0, cushion: 0 };
    this.monoCd = 0;
    this.jarMesh = null;
  }

  get owned() { return (this.game.upgrades.jar || 0) > 0; }
  get slots() { return 2 + (this.game.upgrades.jar || 0); }

  // ---------- collecting ----------
  scoop() {
    const g = this.game;
    const P = g.player;
    if (!this.owned) { g.hud.toast('You need a containment jar. Dr. Zbornak sells them at the Antimatter Lab.', 3); return; }
    if (this.jar.length >= this.slots) { g.hud.toast('Jar is full. Empty it with X (into the reactor, if you\'re brave).', 2.5); return; }
    // people first, then crystals, then black water, then plain dirt
    let best = null, bd = 6;
    for (const f of g.world.figures) {
      if (!f.root.visible || f.captured || f.loc.restricted) continue;
      const d = f.root.getWorldPosition(_v).distanceTo(P.pos);
      if (d < bd) { bd = d; best = { kind: 'figure', f }; }
    }
    for (const w of this.wanderers) {
      const d = w.root.position.distanceTo(P.pos);
      if (d < bd) { bd = d; best = { kind: 'wanderer', w }; }
    }
    if (best) {
      const name = best.kind === 'figure' ? pick(NAMES) : best.w.name;
      if (best.kind === 'figure') { best.f.captured = true; best.f.root.visible = false; }
      else { best.w.root.removeFromParent(); this.wanderers = this.wanderers.filter((w) => w !== best.w); }
      this.add('person', name);
      g.fx.pop(`GOTCHA, ${name.toUpperCase()}!`, null, { color: '#ff9f1c', size: 46 });
      if (best.kind === 'figure') g.rep.add(best.f.loc.faction, -1, 'Jarred a resident', { silent: true });
      return;
    }
    for (const c of g.world.crystals) {
      if (c.taken || c.pos.distanceTo(P.pos) > 6) continue;
      c.taken = true;
      this.add('rock');
      g.fx.pop('ROCK SAMPLE!', null, { color: '#2ee6ff', size: 46 });
      return;
    }
    if (P.body.onLake && P.body.grounded) { this.add('water'); g.fx.pop('BLACK WATER!', null, { color: '#c77dff', size: 46 }); return; }
    if (P.body.grounded || P.body.altitude < 1.5) { this.add('dirt'); g.fx.dust(P.pos, P.vel, 6, P.up); g.fx.pop('MOON DIRT!', null, { color: '#c9b79c', size: 40 }); return; }
    g.hud.toast('Nothing to scoop up here.', 1.5);
  }

  add(kind, name) {
    this.jar.push({ kind, name });
    this.mixT = 0;
    this.game.audio.pickup();
    this.refreshJarMesh();
  }

  // ---------- emptying ----------
  empty() {
    const g = this.game;
    if (!this.jar.length) { g.hud.toast(this.owned ? 'The jar is empty. Scoop something with G.' : 'You don\'t have a jar yet.', 1.8); return; }
    const lab = g.world.lab;
    if (lab && g.player.pos.distanceTo(lab.reactor) < 11) this.feedReactor();
    else this.dump();
    this.jar = [];
    this.refreshJarMesh();
  }

  dump() {
    const g = this.game;
    const P = g.player;
    for (const it of this.jar) {
      if (it.kind === 'person' || it.kind === 'voidling') this.spawnWanderer(it.name, it.kind === 'voidling');
      else if (it.kind === 'rock' || it.kind === 'slickrock') g.fx.spawn(P.pos.clone().addScaledVector(P.up, 1), P.up.clone().multiplyScalar(3), { color: 0x2ee6ff, size: 0.5, life: 1, gravity: 2, count: 6, spread: 3 });
      else g.fx.spawn(P.pos.clone().addScaledVector(P.up, 1), P.up.clone().multiplyScalar(2), { color: it.kind === 'dirt' ? 0xc9b79c : 0x2a1f4f, size: 0.4, life: 1, gravity: 2, count: 10, spread: 3 });
    }
    g.fx.pop('EMPTIED!', null, { color: '#c9c3d9', size: 40 });
  }

  // Free people wander off (and can be scooped up again).
  spawnWanderer(name, purple) {
    const g = this.game;
    const P = g.player;
    const f = makeFigure({ suit: purple ? 0xc77dff : 0xff9f1c, visor: purple ? 0x7dff3a : 0x241a5c });
    const pos = g.planet.ground(P.pos.clone().addScaledVector(g.cam.right, 3), new THREE.Vector3());
    f.root.position.copy(pos);
    g.scene.add(f.root);
    this.wanderers.push({ ...f, name: name || pick(NAMES), dir: tangent(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5), pos.clone().normalize()).normalize(), t: 0 });
    g.fx.pop(`${(name || 'THEY').toUpperCase()} IS FREE!`, null, { color: '#ff9f1c', size: 36 });
  }

  // ---------- the reactor ----------
  feedReactor() {
    const g = this.game;
    const kinds = this.jar.map((i) => i.kind).sort();
    const key = kinds.join('+');
    const names = this.jar.filter((i) => i.name).map((i) => i.name);
    const r = g.world.reactor;
    r.flash = 1.5;
    g.audio.boom(false);
    g.cam.shake = Math.max(g.cam.shake, 0.6);
    const unique = new Set(kinds);
    let res;
    if (kinds.length >= 3 && unique.size === kinds.length) res = this.singularity();
    else if (kinds.length >= 3 && unique.size === 1) res = this.resonance(kinds[0]);
    else res = (RECIPES[key] || RECIPES._default).call(this, names);
    this.game.stats.experiments = (this.game.stats.experiments || 0) + 1;
    g.dialog('DR. ZBORNAK', `<b>${res.title}</b><br>${res.text}`, [{ label: 'FOR SCIENCE!' }]);
  }

  singularity() {
    const g = this.game;
    const P = g.player;
    g.world.reactor.flash = 4;
    g.fx.explosion(g.world.lab.reactor, 22, true);
    P.vel.addScaledVector(P.up, 70);
    this.buffs.cushion = 25; // the reactor's field softens the landing
    P.body.grounded = false;
    P.body.sinceContact = 1;
    g.style(120, 'SINGULARITY');
    g.addCredits(300, 'Data');
    g.actionPanel('launch', null, 'THE REACTOR SAID NO.');
    return { title: 'SINGULARITY!', text: '"Three different things at once?! The containment field folded in half and spat you through the roof. Magnificent. Here is your share of the data."' };
  }

  resonance(kind) {
    this.buffs.bouncy = 40;
    return { title: 'RESONANCE', text: `"Three ${ITEMS[kind].name}s, perfectly in tune. You are now… springy. Everything you land on will bounce you for a while."` };
  }

  // ---------- per-frame ----------
  update(dt) {
    const g = this.game;
    const P = g.player;
    for (const k of Object.keys(this.buffs)) this.buffs[k] = Math.max(0, this.buffs[k] - dt);
    // buffs change how the skates and gravity behave
    P.params.gravity = this.buffs.lowGrav > 0 ? PHYS.gravity * 0.45 : PHYS.gravity;
    P.params.slopeAssist = this.buffs.slick > 0 ? 1.1 : PHYS.slopeAssist;
    P.params.skateFriction = this.buffs.slick > 0 ? 0 : PHYS.skateFriction;
    if (this.buffs.rain > 0 && Math.random() < dt * 40) {
      const p = P.pos.clone().addScaledVector(P.up, 14).addScaledVector(g.cam.right, (Math.random() - 0.5) * 16).addScaledVector(g.cam.fwd, (Math.random() - 0.3) * 16);
      g.fx.spawn(p, P.up.clone().multiplyScalar(-14), { color: 0x2a1f4f, size: 0.25, life: 1, count: 1, spread: 0.5 });
    }
    // slow reactions inside the jar
    if (this.jar.length >= 2) {
      this.mixT += dt;
      if (this.mixT > MIX_TIME) {
        this.mixT = 0;
        for (const m of JAR_MIXES) {
          const ia = this.jar.findIndex((i) => i.kind === m.a), ib = this.jar.findIndex((i) => i.kind === m.b);
          if (ia < 0 || ib < 0) continue;
          const keep = this.jar[m.a === 'person' ? ia : ib];
          this.jar = this.jar.filter((_, i) => i !== ia && i !== ib);
          this.jar.push({ kind: m.into, name: keep.name });
          g.hud.toast(m.text, 3.5);
          g.fx.pop('BLOOP!', null, { color: ITEMS[m.into].color, size: 50 });
          this.refreshJarMesh();
          break;
        }
      }
    }
    // the Monolith
    const mono = g.world.monolith;
    this.monoCd -= dt;
    if (mono && this.monoCd <= 0 && P.pos.distanceTo(mono.pos) < 9) {
      this.monoCd = 90;
      this.buffs.lowGrav = 30;
      g.audio.tone(55, 2.5, 'sine', 0.35, 1);
      g.fx.pop('THE MONOLITH HUMS…', null, { color: '#c77dff', size: 56 });
      g.hud.toast('Gravity feels… optional. (Low gravity for 30 s)', 4);
    }
    // bouncy buff: landings spring you back up
    if (this.buffs.bouncy > 0 && P.body.bounceReady && P.body.grounded) {
      P.vel.addScaledVector(P.body.groundN, P.body.bounceReady * 0.85);
      P.body.grounded = false;
      P.body.sinceContact = 1;
    }
    P.body.bounceReady = 0;
    this.updateFollowers(dt);
    this.updateWanderers(dt);
  }

  // Pets made in the reactor hop after you.
  addFollower(kind) {
    const g = this.game;
    const P = g.player;
    let root;
    if (kind === 'rock') {
      root = new THREE.Group();
      const body = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 0), toon(0x8d8898));
      ink(body, 0.08);
      body.position.y = 1;
      root.add(body);
      for (const s of [-1, 1]) { const eye = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 4), glow(0x2ee6ff)); eye.position.set(s * 0.35, 1.3, 0.85); root.add(eye); }
    } else {
      const f = makeFigure({ suit: 0x8a6a4a, helmet: 0x6b5a3a, visor: 0xffd23f, scale: 0.7 });
      root = f.root;
    }
    root.position.copy(P.pos);
    g.scene.add(root);
    this.followers.push({ root, kind, vy: 0, h: 0 });
  }

  updateFollowers(dt) {
    const P = this.game.player;
    this.followers.forEach((f, i) => {
      const up = f.root.position.clone().normalize();
      const target = P.pos.clone().addScaledVector(this.game.cam.right, (i % 2 ? 3 : -3)).addScaledVector(P.heading, -4 - i * 2);
      const to = tangent(target.clone().sub(f.root.position), up);
      const d = to.length();
      if (d > 300) { f.root.position.copy(P.pos); return; }
      if (d > 2) f.root.position.addScaledVector(to.normalize(), Math.min(d, (8 + d * 1.5) * dt));
      f.h += f.vy * dt; f.vy -= 9 * dt;
      if (f.h <= 0) { f.h = 0; f.vy = d > 3 ? 4 : 0; }
      const g = this.game.planet.ground(f.root.position, new THREE.Vector3());
      f.root.position.copy(g).addScaledVector(up, f.h);
      frameQuat(up, d > 0.5 ? to : P.heading, f.root.quaternion);
    });
  }

  updateWanderers(dt) {
    for (const w of this.wanderers) {
      const p = w.root.position;
      const up = p.clone().normalize();
      w.t += dt;
      if (Math.random() < dt * 0.3) w.dir = tangent(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5), up).normalize();
      const next = greatCircle(up, w.dir, 1.2 * dt);
      p.copy(this.game.planet.ground(next, new THREE.Vector3()));
      frameQuat(next, w.dir, w.root.quaternion);
      w.legL.rotation.x = Math.sin(w.t * 6) * 0.5; w.legR.rotation.x = -Math.sin(w.t * 6) * 0.5;
    }
  }

  // The jar rides on your back and shows what's inside.
  refreshJarMesh() {
    const P = this.game.player;
    if (this.jarMesh) this.jarMesh.removeFromParent();
    this.jarMesh = null;
    if (!this.owned) return;
    const g = new THREE.Group();
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.8, 12), new THREE.MeshBasicMaterial({ color: 0x9be7ff, transparent: true, opacity: 0.3 }));
    g.add(glass);
    this.jar.forEach((it, i) => {
      const blob = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6), glow(new THREE.Color(ITEMS[it.kind].color).getHex()));
      blob.position.set(Math.sin(i * 2.1) * 0.12, -0.25 + i * 0.2, Math.cos(i * 2.1) * 0.12);
      g.add(blob);
    });
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.12, 12), toon(0x3a3550));
    cap.position.y = 0.45;
    g.add(cap);
    g.position.set(0.45, 0.1, -0.05);
    P.model.cargoSlot.add(g);
    this.jarMesh = g;
  }

  hudText() {
    if (!this.owned) return '';
    const cells = [];
    for (let i = 0; i < this.slots; i++) {
      const it = this.jar[i];
      cells.push(it ? `<span style="color:${ITEMS[it.kind].color}" title="${ITEMS[it.kind].name}">${ITEMS[it.kind].icon}</span>` : '<span class="empty-slot">·</span>');
    }
    const buff = Object.entries(this.buffs).filter(([, v]) => v > 0).map(([k, v]) => `${BUFF_NAMES[k]} ${Math.ceil(v)}s`).join(' · ');
    return `JAR ${cells.join('')}${this.jar.length >= 2 ? ' <i>stewing…</i>' : ''}${buff ? `<div class="buffs">${buff}</div>` : ''}`;
  }
}

const BUFF_NAMES = { lowGrav: 'LOW-G', slick: 'MOON MUD', bouncy: 'SPRINGY', invert: 'NEGATIVE', rain: 'BLACK RAIN', cushion: 'SOFT LANDING' };

// Reactor recipes, keyed by the sorted item kinds fed in together.
const RECIPES = {
  rock() { this.game.addCredits(60, 'Sample'); return { title: 'ROCK… ANALYSED', text: '"A fine rock. It is now slightly radioactive and worth sixty credits to someone."' }; },
  dirt() { this.game.addCredits(20, 'Glass'); return { title: 'MOON GLASS', text: '"The dirt fused into a tiny glass bead. I will treasure it. Have twenty credits."' }; },
  water() { this.buffs.rain = 45; return { title: 'BLACK RAIN', text: '"The black water went UP. It is now raining on you specifically. That will stop. Probably."' }; },
  person(names) {
    const g = this.game;
    const P = g.player;
    const n = names[0] || 'Your passenger';
    g.fx.explosion(g.world.lab.reactor.clone().addScaledVector(P.up, 8), 6, true);
    g.fx.pop(`${n.toUpperCase()}: WHEEEEE!`, null, { color: '#ff9f1c', size: 60 });
    g.rep.add('kepler', -3, 'Fed a resident to a reactor');
    g.schedule(6, () => this.spawnWanderer(n));
    return { title: 'YEET', text: `"${n} has been launched through the roof at roughly escape velocity, and also back down again. Somewhere. Kepler will be filing a complaint."` };
  },
  mud() { this.buffs.slick = 60; return { title: 'MOON MUD COATING', text: '"Your skates are now coated in antimatter mud. Downhills will be… extreme. One minute."' }; },
  slickrock() { this.addFollower('rock'); return { title: 'IT\'S ALIVE', text: '"The slick rock has developed opinions, eyes, and an attachment to you. It will follow you now. Name it something nice."' }; },
  voidling(names) { this.buffs.lowGrav = 45; return { title: 'VOID TWIN', text: `"${names[0] || 'Your passenger'} split into two people and one of them took most of your weight with them. Enjoy the low gravity."` }; },
  'person+water'(names) { return RECIPES.voidling.call(this, names); },
  'dirt+water'() { return RECIPES.mud.call(this); },
  'rock+water'() { return RECIPES.slickrock.call(this); },
  'rock+rock'() { this.game.addCredits(160, 'Twin rock'); return { title: 'TWINNED ROCK', text: '"Two rocks went in. Four rocks came out. Two of them are worth a lot. Here."' }; },
  'dirt+dirt'() { this.game.addCredits(70, 'Concrete'); return { title: 'MOON CONCRETE', text: '"Congratulations, you invented concrete. Again."' }; },
  'dirt+rock'() { this.game.addCredits(90, 'Concrete'); return { title: 'REINFORCED MOON CONCRETE', text: '"Ah, aggregate. Very construction. Ninety credits."' }; },
  'dirt+person'() { this.addFollower('dirt'); return { title: 'DIRT GOLEM', text: '"The person is fine. The DIRT, however, has stood up and decided you are its parent."' }; },
  'person+rock'(names) { this.game.rep.add('kepler', -2, 'Petrified a resident', { silent: true }); this.statue(names[0]); return { title: 'PETRIFIED', text: `"${names[0] || 'They'} turned to stone. Beautiful work. I'm putting them in the lab's gallery."` }; },
  'person+person'(names) { this.game.rep.add('kepler', 2, 'Reactor romance'); this.game.fx.pop('♥ ♥ ♥', null, { color: '#ff2e88', size: 90 }); this.spawnWanderer(names[0]); this.spawnWanderer(names[1]); return { title: 'THEY FELL IN LOVE', text: `"${names[0]} and ${names[1]} came out holding hands. Kepler wants to invite you to the wedding."` }; },
  'water+water'() { this.buffs.invert = 40; return { title: 'DEEP BLACK', text: '"You have seen the other side of light. For the next forty seconds, so will your eyes."' }; },
  'mud+person'() { this.addFollower('dirt'); return RECIPES['dirt+person'].call(this); },
  _default() { this.game.addCredits(15, 'Fizzle'); this.game.fx.pop('FIZZLE', null, { color: '#c9c3d9', size: 50 }); return { title: 'FIZZLE', text: '"Hm. Nothing interesting. Try mixing more chaotic things. Three different ones, for instance. No, wait—"' }; },
};

// statue for the lab gallery (kept inside the Alchemy so it can read the game)
Alchemy.prototype.statue = function statue(name) {
  const g = this.game;
  const lab = g.world.lab;
  const loc = lab.loc;
  const f = makeFigure({ suit: 0x9a9a9a, helmet: 0x9a9a9a, visor: 0x5b5870 });
  const i = this.statues++;
  f.root.position.set(-16 + (i % 6) * 3, 0, 10);
  f.root.rotation.y = Math.PI;
  f.root.userData.name = name;
  loc.group.add(f.root);
};

