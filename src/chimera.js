import * as THREE from 'three';
import { toon, glow, ink } from './toon.js';
import { mulberry32 } from './rng.js';

// Things with bodies. Two or more of these in the reactor make a Chimera.
export const LIVING = ['person', 'voidling', 'mite', 'car', 'pirate'];
// Things that only mutate whatever they get spliced into.
export const MODIFIERS = { water: 'void', rock: 'crystal', slickrock: 'crystal', dirt: 'mud', mud: 'mud' };

const PALETTE = {
  person: [0xff9f1c, 0x2ec4ff, 0xffd23f, 0x7dff6a],
  voidling: [0xc77dff, 0x7b2ff7],
  mite: [0xb8e986, 0xd8d0c4, 0x9be7ff],
  car: [0xff7ad9, 0x2ec4ff, 0x7dff6a, 0xffd23f],
  pirate: [0x3a2b4f, 0x5a3a5a],
};
const SYLL = { car: 'Vroom', mite: 'Skitter', pirate: 'Grit' };
const EPITHET = { void: 'the Unholy', crystal: 'the Crystalline', mud: 'of the Mud' };

function part(geo, mat, x, y, z, outline = 0.04) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  if (outline) ink(m, outline);
  return m;
}

// Mix the parents into a gene sheet: which body, legs and head; mutations; stats; a name.
export function spliceGenes(items, seed = Math.floor(Math.random() * 1e9)) {
  const rr = mulberry32(seed);
  const living = items.filter((i) => LIVING.includes(i.kind));
  const mods = [...new Set(items.map((i) => MODIFIERS[i.kind]).filter(Boolean))];
  const pickPart = () => living[Math.floor(rr() * living.length)].kind;
  const body = living[0].kind;
  const legs = living.length > 1 ? living[1].kind : pickPart();
  const head = pickPart();
  const kinds = new Set(living.map((i) => i.kind));
  const extraHead = rr() < 0.15 + 0.12 * kinds.size ? pickPart() : null;
  const size = 0.75 + rr() * 0.7;
  const tint = PALETTE[body][Math.floor(rr() * PALETTE[body].length)];
  const nameOf = (i) => i.name || SYLL[i.kind] || 'Blob';
  const a = nameOf(living[0]), b = nameOf(living[living.length - 1]);
  let name = a.replace(/^Little /, '').slice(0, Math.max(2, Math.ceil(a.length / 2))) + b.replace(/^Little /, '').slice(Math.floor(b.length / 2)).toLowerCase();
  if (living.length === 1) name = `Mutant ${a}`;
  if (mods.length) name += ' ' + EPITHET[mods[0]];
  const legSpeed = { car: 1.0, mite: 0.9, pirate: 0.8, person: 0.72, voidling: 0.78 }[legs];
  const bodyMult = { car: 0.95, mite: 1.05, pirate: 1.05, person: 1, voidling: 1.08 }[body];
  const speed = 34 * legSpeed * bodyMult * (1.12 - (size - 1) * 0.25) * (0.9 + rr() * 0.2) * (mods.includes('crystal') ? 1.05 : 1);
  const chaos = kinds.size + mods.length + (extraHead ? 1 : 0) + (mods.includes('void') ? 1 : 0);
  return { seed, body, legs, head, extraHead, mods, size, tint, name, speed: Math.round(speed * 10) / 10, hop: legs === 'mite' ? 1 : 0.3, chaos, parents: living.map((i) => i.kind), born: Date.now() };
}

// Build the creature from its genes. Feet at y = 0, facing +Z.
export function makeChimera(genes) {
  const root = new THREE.Group();
  const inner = new THREE.Group();
  root.add(inner);
  const rr = mulberry32(genes.seed);
  const bodyM = toon(genes.tint);
  const dark = toon(0x221d33);
  const legParts = [];
  let legH;
  // legs
  if (genes.legs === 'car') {
    legH = 0.5;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const w = part(new THREE.CylinderGeometry(0.48, 0.48, 0.35, 12).rotateZ(Math.PI / 2), dark, sx * 0.85, 0.48, sz * 0.9);
      inner.add(w);
      legParts.push({ m: w, kind: 'wheel' });
    }
  } else if (genes.legs === 'mite') {
    legH = 0.8;
    for (let i = 0; i < 6; i++) {
      const side = i < 3 ? -1 : 1, k = i % 3;
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.4, legH, (k - 1) * 0.45);
      const leg = part(new THREE.CylinderGeometry(0.05, 0.03, 1.1, 5), toon(0x3a3550), side * 0.35, -0.4, 0, 0.02);
      leg.rotation.z = side * 0.7;
      pivot.add(leg);
      inner.add(pivot);
      legParts.push({ m: pivot, kind: 'mite', phase: i });
    }
  } else {
    legH = 1.0;
    const legM = genes.legs === 'pirate' ? toon(0x3a2b4f) : genes.legs === 'voidling' ? toon(0xc77dff) : toon(PALETTE.person[Math.floor(rr() * 4)]);
    for (const sx of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(sx * 0.22, legH, 0);
      pivot.add(part(new THREE.CapsuleGeometry(0.13, 0.6, 3, 6), legM, 0, -0.5, 0));
      if (genes.legs === 'pirate') pivot.add(part(new THREE.BoxGeometry(0.22, 0.06, 0.6), glow(0x7dff3a), 0, -0.98, 0.05, 0.02));
      inner.add(pivot);
      legParts.push({ m: pivot, kind: 'leg', side: sx });
    }
  }
  // body
  let top, front;
  if (genes.body === 'car') {
    inner.add(part(new THREE.CapsuleGeometry(0.85, 2.2, 4, 10).rotateX(Math.PI / 2), bodyM, 0, legH + 0.75, 0, 0.06));
    inner.add(part(new THREE.BoxGeometry(2.2, 0.15, 0.5), toon(0xfff4e0), 0, legH + 0.55, -1.7, 0.03));
    top = legH + 1.55; front = 1.6;
  } else if (genes.body === 'mite') {
    inner.add(part(new THREE.SphereGeometry(0.65, 12, 10), bodyM, 0, legH + 0.55, 0.3, 0.05));
    const abd = part(new THREE.SphereGeometry(0.85, 12, 10), bodyM, 0, legH + 0.7, -0.9, 0.05);
    abd.scale.set(1, 0.85, 1.25);
    inner.add(abd);
    for (let i = 0; i < 3; i++) inner.add(part(new THREE.SphereGeometry(0.16, 6, 4), toon(0x5a3a5a), (rr() - 0.5) * 0.9, legH + 1.25, -0.9 + (rr() - 0.5), 0));
    top = legH + 1.1; front = 0.95;
  } else {
    const c = genes.body === 'pirate' ? 0x3a2b4f : genes.tint;
    inner.add(part(new THREE.CapsuleGeometry(0.36, 0.55, 4, 10), toon(c), 0, legH + 0.55, 0, 0.05));
    inner.add(part(new THREE.BoxGeometry(0.5, 0.6, 0.28), dark, 0, legH + 0.6, -0.36, 0.03));
    top = legH + 1.25; front = 0.25;
  }
  const makeHead = (kind, x) => {
    const h = new THREE.Group();
    if (kind === 'car') {
      h.add(part(new THREE.SphereGeometry(0.55, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), toon(0x9be7ff), 0, 0, 0, 0.04));
      for (const sx of [-1, 1]) h.add(part(new THREE.SphereGeometry(0.14, 8, 6), glow(0xfff6a8), sx * 0.3, 0.05, 0.5, 0));
    } else if (kind === 'mite') {
      h.add(part(new THREE.SphereGeometry(0.42, 12, 10), toon(0xb8e986), 0, 0.1, 0.1, 0.04));
      for (const sx of [-1, 1]) {
        h.add(part(new THREE.SphereGeometry(0.17, 8, 6), glow(0xff2e88), sx * 0.2, 0.25, 0.42, 0));
        const ant = part(new THREE.CylinderGeometry(0.025, 0.025, 0.9, 4), toon(0x3a3550), sx * 0.18, 0.75, 0.1, 0);
        ant.rotation.z = -sx * 0.4;
        h.add(ant);
      }
    } else {
      const helmet = kind === 'pirate' ? 0x2b2b2b : kind === 'voidling' ? 0x7b2ff7 : 0xfff4e0;
      h.add(part(new THREE.SphereGeometry(0.36, 12, 10), toon(helmet), 0, 0.2, 0, 0.04));
      const v = part(new THREE.SphereGeometry(0.26, 10, 8), kind === 'person' ? toon(0x241a5c) : glow(kind === 'pirate' ? 0x7dff3a : 0xff2e88), 0, 0.22, 0.17, 0);
      v.scale.set(1.1, 0.75, 0.75);
      h.add(v);
      if (kind === 'pirate') { const band = part(new THREE.TorusGeometry(0.34, 0.06, 6, 14), toon(0xd7263d), 0, 0.32, 0, 0); band.rotation.x = Math.PI / 2; h.add(band); }
    }
    h.position.set(x, top, front);
    inner.add(h);
    return h;
  };
  const heads = [makeHead(genes.head, genes.extraHead ? -0.4 : 0)];
  if (genes.extraHead) { heads.push(makeHead(genes.extraHead, 0.4)); heads[1].rotation.z = -0.3; heads[0].rotation.z = 0.3; }
  // mutations
  if (genes.mods.includes('crystal')) {
    for (let i = 0; i < 4; i++) {
      const sp = new THREE.Mesh(new THREE.OctahedronGeometry(0.3, 0), glow(0x2ee6ff));
      sp.scale.set(0.6, 1.6, 0.6);
      sp.position.set((rr() - 0.5) * 0.8, top - 0.2 + rr() * 0.3, -0.3 - rr() * 0.8);
      sp.rotation.set((rr() - 0.5) * 0.8, 0, (rr() - 0.5) * 0.8);
      inner.add(sp);
    }
  }
  if (genes.mods.includes('mud')) {
    for (let i = 0; i < 5; i++) inner.add(part(new THREE.SphereGeometry(0.18 + rr() * 0.15, 6, 4), toon(0x6b4a2a), (rr() - 0.5) * 1.2, legH + rr() * 1.2, (rr() - 0.5) * 1.6, 0));
  }
  if (genes.mods.includes('void')) {
    const aura = new THREE.Mesh(new THREE.SphereGeometry(1.6, 16, 12), new THREE.MeshBasicMaterial({ color: 0x7b2ff7, transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending }));
    aura.position.y = legH + 0.7;
    inner.add(aura);
  }
  inner.scale.setScalar(genes.size);
  // walk / roll / skitter animation
  const anim = (t, speed) => {
    const k = Math.min(1, speed / 6);
    for (const p of legParts) {
      if (p.kind === 'wheel') p.m.rotation.x += speed * 0.03;
      else if (p.kind === 'mite') p.m.rotation.x = Math.sin(t * 18 + p.phase * 1.7) * 0.5 * k;
      else p.m.rotation.x = Math.sin(t * 10) * 0.9 * k * p.side;
    }
    heads.forEach((h, i) => { h.rotation.y = Math.sin(t * (2 + i) + i) * 0.3; });
    inner.position.y = genes.legs === 'car' ? 0 : Math.abs(Math.sin(t * 10)) * 0.12 * k;
  };
  return { root, anim, height: (top + 0.6) * genes.size };
}

// Small wild critter of the sunlit craters.
export function makeMite() {
  const genes = { seed: Math.floor(Math.random() * 1e9), body: 'mite', legs: 'mite', head: 'mite', extraHead: null, mods: [], size: 0.8, tint: 0xb8e986 };
  return makeChimera(genes);
}
