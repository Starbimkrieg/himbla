import * as THREE from 'three';
import { makeRunner, makeFigure, makeBouncer } from '../models.js';
import { glow } from '../toon.js';
import { FACTIONS } from '../locations.js';
import { LEADERS, Story } from '../story.js';
import { FOES } from '../storyAssets.js';
import { span, cell, line, restRunner, tag } from './characters-util.js';
import { podium, factionHex } from './common.js';

// 02 · PEOPLE: townsfolk (makeFigure), Dr. Zbornak, casino staff, the six faction leaders and six troop liveries.

const FW = 2.4; // townsperson cell along the row (m)
const FD = 2.2;

const LOOKS = ['coveralls', 'lab', 'engineer', 'trader', 'elder', 'eva', 'casual', 'kid', 'trooper'];

// ---- nine townsfolk looks (look = outfit shape; seed = colours, hair, hats)
function archetypesItem() {
  return {
    id: 'people.archetypes', label: 'TOWNSFOLK (9 LOOKS)', w: span(LOOKS.length, FW), d: FD,
    make() {
      return { root: line(LOOKS.map((look, i) => cell(makeFigure({ look, seed: 7 + i * 5 }).root, look.toUpperCase(), FW, FD, { h: 0.6 }))).root };
    },
  };
}

// ---- special figures: Vrill, soldier, kid, statue, the reactor's freed people, medic
function specialItem() {
  const specs = [
    ['VRILL', () => makeFigure({ alien: true })],
    ['SOLDIER', () => makeFigure({ kind: 'soldier', suit: 0x55607a, helmet: 0xffd23f, visor: 0x111111 })],
    ['KID', () => makeFigure({ kind: 'kid', suit: 0xff9f1c, scale: 0.55 })],
    ['STATUE', () => makeFigure({ suit: 0x9a9a9a, helmet: 0x9a9a9a, visor: 0x5b5870 })],
    ['FREED PERSON', () => makeFigure({ suit: 0xff9f1c, visor: 0x241a5c, helmet: 0xfff4e0 })],
    ['VOID-TOUCHED', () => makeFigure({ suit: 0xc77dff, visor: 0x7dff3a, helmet: 0xfff4e0 })],
    ['FREED PIRATE', () => makeFigure({ suit: 0x3a2b4f, visor: 0x7dff3a, helmet: 0x2b2b2b })],
    ['MEDIC', () => makeFigure({ suit: 0x1fa89a, helmet: 0xfff4e0, visor: 0x123a3a, look: 'eva', seed: 21 })],
  ];
  return {
    id: 'people.special', label: 'SPECIAL FIGURES', w: span(specs.length, FW), d: FD,
    make() {
      return { root: line(specs.map(([name, f]) => cell(f().root, name, FW, FD, { h: 0.6 }))).root };
    },
  };
}

// ---- Dr. Zbornak (world.js buildLab)
function zbornakItem() {
  return {
    id: 'people.zbornak', label: 'DR. ZBORNAK', w: 3, d: 3,
    make() {
      const f = makeFigure({ suit: 0xffffff, helmet: 0xfff4e0, visor: 0x7dff3a });
      return { root: cell(f.root, 'DR. ZBORNAK', 3, 3, { color: '#7dff3a', h: 0.8 }).root };
    },
  };
}

// ---- casino staff (casinoWorld.js buildCasino)
function casinoItem() {
  const staff = [
    ['PATRON', () => makeFigure({ suit: 0xffc83a, helmet: 0xfff4e0, visor: 0xff2e88, seed: 900 }).root],
    ['BOUNCER', () => { const b = makeBouncer(); b.root.scale.setScalar(0.94); return b.root; }],
    ['DEALER', () => {
      const dealer = makeFigure({ suit: 0x16121f, helmet: 0xfff4e0, visor: 0xffd23f, scale: 1.05 });
      const bow = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.06), glow(0xd7263d));
      bow.position.set(0, 1.62, 0.33);
      dealer.root.add(bow);
      return dealer.root;
    }],
    ['VINNIE', () => makeFigure({ suit: 0x1f8a4a, helmet: 0x7dff6a, visor: 0xffd23f, scale: 1.1 }).root],
    ['PRIZE CLERK', () => makeFigure({ suit: 0xff7ad9, helmet: 0xfff4e0, visor: 0x2ee6ff }).root],
    ['SPECTATOR', () => makeFigure({ suit: 0x2ee6ff, helmet: 0xfff4e0, visor: 0x241a5c }).root],
  ];
  return {
    id: 'people.casino', label: 'CASINO STAFF', w: span(staff.length, 3), d: FD + 0.6,
    make() {
      return { root: line(staff.map(([name, f]) => cell(f(), name, 3, FD + 0.6, { h: 0.6 }))).root };
    },
  };
}

// ---- the six faction leaders (story.js buildLeaders): runner x1.15 on a podium, glowing ring, light column
function leadersItem() {
  const ids = Object.keys(LEADERS);
  const PW = 7.6;
  return {
    id: 'people.leaders', label: 'FACTION LEADERS (6)', w: span(ids.length, PW), d: 7,
    make() {
      const swayers = [];
      const cells = ids.map((f) => {
        const L = LEADERS[f];
        const g = new THREE.Group();
        const m = makeRunner({ ...L.look, pirate: f === 'rustmoon' });
        if (f === 'rustmoon') Story.prototype.addRifle.call({}, m, true); // Captain Kade: slung rifle, long coat
        m.root.scale.setScalar(1.15);
        m.root.position.y = 0.4;
        g.add(m.root);
        const { ring, beam } = podium(g, factionHex(f));
        const sign = tag(L.name.toUpperCase(), FACTIONS[f].color, 0.9);
        sign.position.set(0, 4.2, 0);
        g.add(sign);
        swayers.push({ m, ring, beam, phase: swayers.length * 1.3 });
        return cell(g, null, PW, 7);
      });
      return {
        root: line(cells).root,
        cols: cells.map((c) => ({ type: 'cyl', x: c.root.position.x, z: 0, y0: 0, y1: 0.4, r: 1.9 })), // only the podiums are solid
        // idle as in story.update: head turns, left arm sways, ring and column pulse
        update: (dt, t) => {
          for (const s of swayers) {
            const T = t + s.phase;
            s.m.head.rotation.y = Math.sin(T * 0.7) * 0.4;
            s.m.armL.rotation.z = -0.3 + Math.sin(T * 1.3) * 0.15;
            s.ring.scale.setScalar(1 + Math.sin(T * 3) * 0.06);
            s.beam.material.opacity = 0.12 + Math.sin(T * 2) * 0.05;
          }
        },
      };
    },
  };
}

// ---- six troop liveries (storyAssets.js FOES, enemies.js spawnPirate): pirates and faction soldiers on skates
function troopsItem() {
  const ids = Object.keys(FOES);
  const RW = 2.6;
  return {
    id: 'people.troops', label: 'TROOPS (6 LIVERIES)', w: span(ids.length, RW), d: 3.2,
    make() {
      const cells = ids.map((f) => {
        const M = restRunner(makeRunner({ ...FOES[f].look }));
        return cell(M.root, f === 'rustmoon' ? 'PIRATE' : f.toUpperCase(), RW, 3.2, { h: 0.6, color: '#' + new THREE.Color(FOES[f].glow).getHexString() });
      });
      return { root: line(cells).root };
    },
  };
}

export default {
  id: 'characters.people',
  title: '02 · PEOPLE',
  items: [archetypesItem(), specialItem(), zbornakItem(), casinoItem(), leadersItem(), troopsItem()],
};
