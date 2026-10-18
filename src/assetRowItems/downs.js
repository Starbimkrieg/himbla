import * as THREE from 'three';
import { makeDownsPart, makeDownsFountain } from '../models.js';
import { lineUp } from './common.js';

// Asset Row catalogue group: Chimera Downs' Blender kits (tools/blender/build_downs_*.py; docs/downs-layouts.md), each file's parts side by side as one item. The two rides (wheel and
// carousel) are shown with the settlement parts (buildings.js); the whole course is the place at the end of the row (places.js).

// A kit part as one part of a line-up: `w` the width it takes along the row, `dz` where its middle lies along z (so a part authored from its front edge sits in the middle of its item).
const P = (name, w, { d = 0, dz = 0, tint, y = 0, ry = 0 } = {}) => {
  const o = makeDownsPart(name, tint);
  o.position.set(0, y, dz);
  o.rotation.y = ry;
  const g = new THREE.Group();
  g.add(o);
  return { root: g, w, d };
};
// The fountain with its water running and its cup turning: a part of a line-up whose row item has an `update` hook (below).
const fountainPart = (list) => { const f = makeDownsFountain(); list.push(f); return { root: f.root, w: 25, d: 25 }; };
const item = (id, label, w, d, make, extra = {}) => ({ id, label, w, d, make: () => make(), ...extra });
const row = (parts, gap = 3) => { const L = lineUp(parts, gap); return { root: L.root }; };

const tintFor = (c) => ({ mint: c });

const downs = {
  id: 'downs',
  title: 'CHIMERA DOWNS',
  items: [
    item('downs.stand', 'DOWNS GRANDSTAND KIT: SEATS · ROOF BAYS · TOWERS · SUITE · BACK WALLS · WALLS WITH A WAY IN · ENTRY FRAME', 188, 46, () => row([
      P('dn_seat3', 3, { d: 1, tint: { seat: 0x7b9a6e } }), P('dn_seat3', 3, { d: 1, tint: { seat: 0xf8fff8 } }), P('dn_seat3', 3, { d: 1, tint: { seat: 0x8b4044 } }),
      P('dn_suite', 19.4, { d: 4, dz: -1.6 }), P('dn_back', 19.4, { d: 1 }), P('dn_back_s', 19.4, { d: 1 }), P('dn_back_gate', 19.4, { d: 1 }), P('dn_back_s_gate', 19.4, { d: 1 }), P('dn_entry', 8, { d: 3, dz: 0 }),
      P('dn_tower', 10, { d: 10, dz: -4.5 }), P('dn_tower_s', 9, { d: 9, dz: -4 }),
      P('dn_roof_bay', 19.6, { d: 44, dz: -17.5 }), P('dn_roof_bay_s', 19.6, { d: 27, dz: -10 }),
    ], 2)),
    item('downs.club', 'DOWNS CLUBHOUSE AND TOTE HALL', 62, 30, () => row([P('dn_club', 62, { d: 28, dz: 13.5 })])),
    item('downs.course', 'DOWNS COURSE KIT: RAIL · FURLONG POLE · FINISH ARCH · PHOTO TOWER · LAMP · FLOOD MAST · FLAG MAST · CROSSING POST · STARTING GATE', 108, 10, () => {
      const gate = P('dn_gate_frame', 17, { d: 4, dz: 1.4 });
      for (let i = 0; i < 4; i++) for (const s of [-1, 1]) {            // (the stall doors, hinged as race.js hangs them)
        const hinge = new THREE.Group();
        hinge.position.set((1.5 - i) * 4 + s * 1.95, 0, 0.1);
        const d = makeDownsPart('dn_gate_door');
        d.scale.x = s > 0 ? 1 : -1;
        hinge.add(d);
        gate.root.children[0].add(hinge);
      }
      return row([
        P('dn_rail', 5, { d: 1 }), P('dn_furlong', 2.5, { d: 1 }), P('dn_finish_arch', 26, { d: 3 }), P('dn_photo_tower', 6, { d: 7 }), P('dn_lamp', 2.5, { d: 1 }),
        P('dn_flood', 4, { d: 1 }), P('dn_mast', 4, { d: 1 }), P('dn_crossing', 2, { d: 1 }), gate,
      ], 2);
    }),
    item('downs.stalls', 'DOWNS CONCESSION STALLS ×12, EACH IN AN ARCADE BAY: MOON DOGS · CRATER FRIES · HE-3 FIZZ · CHIMERA CHOW · ROCK CANDY · TOTE · SPACE SLUSH · LUNAR COFFEE · DERBY DONUTS · JOCKEY\'S GRILL · FOAM FINGERS · RAIL BAR', 140, 18, () => {
      const accents = [0x8b4044, 0xcfb352, 0x7b9a6e, 0xb07c57, 0x8b4044, 0x3b393a, 0x7b9a6e, 0xb07c57, 0x8b4044, 0xcfb352, 0x7b9a6e, 0x3b393a];
      return row(accents.map((c, i) => {
        const g = new THREE.Group();
        g.add(makeDownsPart('dn_arcade'));
        g.add(makeDownsPart(`dn_stall_${i}`, { accent: c }));
        return { root: g, w: 11, d: 16 };
      }), 0.3);
    }),
    item('downs.arcade', 'DOWNS ARCADE BAY · GATE HALL · FORECOURT GATE · FOUNTAIN · VALET BAY · BENCH · PLANTER · FESTOON', 154, 27, () => {
      const fs = [];
      const L = row([
        P('dn_arcade', 11, { d: 16, dz: -8 }), P('dn_gate_hall', 32, { d: 22 }), P('dn_gate_main', 30, { d: 4 }), fountainPart(fs),
        P('dn_bay', 3, { d: 6, dz: -2.8 }), P('dn_bench', 2.4, { d: 1 }), P('dn_planter', 2.6, { d: 1 }), P('dn_festoon', 30, { d: 1, y: 10 }),
      ], 2);
      return { root: L.root, update: (dt, t) => { for (const f of fs) f.update(t, dt); } };
    }),
    item('downs.screen', 'DOWNS SCREEN DRUM AND WINNERS\' PODIUM', 63, 20, () => row([P('dn_drum', 42, { d: 16 }), P('dn_podium', 19, { d: 5 })], 2)),
    item('downs.stable', 'DOWNS STABLE BLOCK · HAY BARN · WEIGHING ROOM · RING GATE · HAY · PICNIC TABLE', 112, 16, () => row([
      P('dn_stable_block', 31, { d: 12, dz: 3 }), P('dn_hay_barn', 25, { d: 14, dz: 7 }), P('dn_pavilion', 19, { d: 13, dz: 3.4 }), P('dn_ring_gate', 4, { d: 1 }),
      P('dn_hay', 1.4, { d: 1 }), P('dn_picnic', 3.8, { d: 3, tint: { accent: 0x8b4044 } }),
    ], 2)),
    item('downs.fair', 'DOWNS FAIR KIT: GONDOLA · HORSE · TICKET HALL · FAIR GATE · STANCHION · FENCE', 52, 10, () => row([
      P('dn_gondola', 3, { d: 3, y: 3.6 }), P('dn_horse', 3, { d: 1, y: 1 }), P('dn_ticket_hall', 23, { d: 8, dz: 4 }), P('dn_fair_gate', 12, { d: 2 }), P('dn_stanchion', 3.2, { d: 1 }),
      P('dn_fence', 4, { d: 1 }),
    ], 2)),
    item('downs.crowd', 'DOWNS SPECTATORS: SEATED FANS (BODY · HEAD · CAP · HAIR) AND ONE WAVING', 14, 3, () => {
      const fan = (jacket, skin, cap, wave, hat) => {
        const g = new THREE.Group();
        const body = makeDownsPart('dn_fan_body', tintFor(jacket)); body.position.y = 0.8; g.add(body);
        const head = makeDownsPart('dn_fan_head', tintFor(skin)); head.position.y = 0.8 + 0.66; g.add(head);
        const top = makeDownsPart(hat ? 'dn_fan_cap' : 'dn_fan_hair', tintFor(cap)); top.position.y = 0.8 + 0.66; g.add(top);
        if (wave) { const arms = makeDownsPart('dn_fan_arms', tintFor(jacket)); arms.position.y = 0.8; g.add(arms); }
        return { root: g, w: 1.6, d: 2 };
      };
      return row([fan(0x8b4044, 0xf1c9a5, 0x3b393a, false, true), fan(0x7b9a6e, 0xa8714f, 0x2a1d18, false, false), fan(0xcfb352, 0xe9b98f, 0xdfe8dd, true, true), fan(0x3b393a, 0x6e4632, 0x5a3a22, true, false)], 1);
    }),
  ],
};

export default [downs];
