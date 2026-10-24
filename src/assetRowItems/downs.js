import * as THREE from 'three';
import { makeDownsPart, makeDownsFountain } from '../models.js';
import { lineUp } from './common.js';
import { arcadeBayShell } from '../downsKit.js';

// Asset Row group: Chimera Downs' Blender kits (tools/blender/build_downs_*.py; docs/downs-layouts.md), one item per file.
// The wheel and carousel are with the settlement parts (buildings.js); the whole course is a place (places.js).

// A kit part as one part of a line-up: `w` the width it takes along the row, `dz` where its middle lies along z (so a part authored from its front edge sits in the middle of its item).
const P = (name, w, { d = 0, dz = 0, x = 0, tint, y = 0, ry = 0 } = {}) => {
  const o = makeDownsPart(name, tint);
  o.position.set(x, y, dz);
  o.rotation.y = ry;
  const g = new THREE.Group();
  g.add(o);
  return { root: g, w, d };
};
// one arcade bay: the Blender wedge plus the game's per-bay shell (downsKit.js), centred
const bayPart = () => { const p = P('dn_arcade', 11, { d: 16, dz: -8 }), s = arcadeBayShell(); s.position.z -= 8; p.root.add(s); return p; };
// the running fountain; its item needs an `update` hook (below)
const fountainPart = (list) => { const f = makeDownsFountain(); list.push(f); return { root: f.root, w: 25, d: 25 }; };
const item = (id, label, w, d, make, extra = {}) => ({ id, label, w, d, make: () => make(), ...extra });
const row = (parts, gap = 3) => { const L = lineUp(parts, gap); return { root: L.root }; };


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
    item('downs.course', 'DOWNS COURSE KIT: RAIL · FURLONG POLE · FINISH ARCH · PHOTO TOWER · LAMP · FLAG MAST · CROSSING POST · SIX-STALL STARTING GATES A (CLASSIC SIX) AND B (THE GANTRY)', 104, 10, () => {
      const gate = (k, w) => {
        const G = P(`dn_gate6_frame_${k}`, w, { d: 3.5, dz: 1.2 });
        for (let i = 0; i < 6; i++) for (const s of [-1, 1]) {          // (the stall doors, hinged as race.js hangs them)
          const hinge = new THREE.Group();
          hinge.position.set((2.5 - i) * 3 + s * 1.45, 0, 0.1);
          const d = makeDownsPart(`dn_gate6_door_${k}`);
          d.scale.x = s > 0 ? 1 : -1;
          hinge.add(d);
          G.root.children[0].add(hinge);
        }
        return G;
      };
      return row([
        P('dn_rail', 5, { d: 1 }), P('dn_furlong', 2.5, { d: 1 }), P('dn_finish_arch', 26, { d: 3 }), P('dn_photo_tower', 6, { d: 7 }), P('dn_lamp', 2.5, { d: 1 }),
        P('dn_mast', 4, { d: 1 }), P('dn_crossing', 2, { d: 1 }), gate('a', 18.5), gate('b', 19.1),
      ], 2);
    }),
    item('downs.stalls', 'DOWNS CONCESSION STALLS ×12, EACH IN AN ARCADE BAY: MOON DOGS · CRATER FRIES · HE-3 FIZZ · CHIMERA CHOW · ROCK CANDY · TOTE · SPACE SLUSH · LUNAR COFFEE · DERBY DONUTS · JOCKEY\'S GRILL · FOAM FINGERS · RAIL BAR', 140, 18, () => {
      const accents = [0x8b4044, 0xcfb352, 0x7b9a6e, 0xb07c57, 0x8b4044, 0x3b393a, 0x7b9a6e, 0xb07c57, 0x8b4044, 0xcfb352, 0x7b9a6e, 0x3b393a];
      return row(accents.map((c, i) => {
        const g = new THREE.Group();
        g.add(makeDownsPart('dn_arcade'), arcadeBayShell());
        g.add(makeDownsPart(`dn_stall_${i}`, { accent: c }));
        return { root: g, w: 11, d: 16 };
      }), 0.3);
    }),
    item('downs.arcade', 'DOWNS ARCADE BAY · GATE HALL · FORECOURT GATE · FOUNTAIN · VALET BAY · BENCH · PLANTER · FESTOON', 154, 27, () => {
      const fs = [];
      const L = row([
        bayPart(), P('dn_gate_hall', 34, { d: 24 }), P('dn_gate_main', 30, { d: 4 }), fountainPart(fs),
        P('dn_bay', 3, { d: 6, dz: -2.8 }), P('dn_bench', 3.4, { d: 1 }), P('dn_planter', 2.6, { d: 1 }), P('dn_festoon', 30, { d: 1, y: 10 }),
      ], 2);
      return { root: L.root, update: (dt, t) => { for (const f of fs) f.update(t, dt); } };
    }),
    item('downs.screen', 'DOWNS SCREEN DRUM AND WINNERS\' PODIUM', 64, 20, () => row([P('dn_drum', 42, { d: 16 }), P('dn_podium', 19.3, { d: 5.15 })], 2)),
    item('downs.stable', 'DOWNS STABLE BLOCK (SIX BOXES) · HAY BARN · WEIGHING ROOM · RING GATE · HAY · PICNIC TABLE', 112, 16, () => row([
      P('dn_stable_6', 31, { d: 12, dz: 3 }), P('dn_hay_barn', 25, { d: 14, dz: 7 }), P('dn_pavilion', 19, { d: 13, dz: 3.4 }), P('dn_ring_gate', 4, { d: 1 }),
      P('dn_hay', 1.4, { d: 1 }), P('dn_picnic', 3.8, { d: 3, tint: { accent: 0x8b4044 } }),
    ], 2)),
    item('downs.yard', 'DOWNS STABLE YARD: FOUR BOXES · CLOCK TOWER · YARD GATE · FENCE · LUNGE RING · TROUGH · SADDLE RACK', 80, 20, () => row([
      P('dn_stable_4', 21, { d: 12, dz: 3 }), P('dn_stable_corner', 10, { d: 10, x: 4.5, dz: 4.5 }), P('dn_yard_gate', 7.2, { d: 3 }),
      P('dn_stable_fence', 4.2, { d: 1, x: -2 }), P('dn_lunge_ring', 18.5, { d: 18.5 }), P('dn_trough', 2.6, { d: 1 }), P('dn_tack', 1.3, { d: 1 }),
    ], 2)),
    item('downs.fair', 'DOWNS FAIR KIT: GONDOLA · HORSE · TICKET HALL · FAIR GATE · KIOSK · STANCHION · FENCE', 60, 10, () => row([
      P('dn_gondola', 3, { d: 3, y: 3.6 }), P('dn_horse', 3, { d: 1, y: 1 }), P('dn_ticket_hall', 23, { d: 8, dz: 4 }), P('dn_fair_gate', 12, { d: 2 }), P('dn_kiosk', 5.4, { d: 4.6, dz: 1.7, tint: { accent: 0x7b9a6e } }), P('dn_stanchion', 3.2, { d: 1 }),
      P('dn_fence', 4, { d: 1 }),
    ], 2)),
    item('downs.crowd', 'DOWNS SPECTATORS: SUIT · FROCK · SIX HATS · FOUR HAIRDOS · PROGRAMME · BINOCULARS · ROSETTE · SCARF · TWO CHEERS', 19, 3, () => {
      // a seated racegoer as race.js buildCrowd draws one, parts tinted per fan; body 0.8 m up (seat + 0.5), head 0.66 above it
      const fan = ({ body, arms, hair, hat, favour }, tint) => {
        const g = new THREE.Group();
        for (const n of ['dn_fan_legs', body, arms, favour]) if (n) { const o = makeDownsPart(n, tint); o.position.y = 0.8; g.add(o); }
        for (const n of ['dn_fan_head', hair, hat]) if (n) { const o = makeDownsPart(n, tint); o.position.y = 0.8 + 0.66; g.add(o); }
        return { root: g, w: 1.8, d: 2 };
      };
      const T = (coat, shirt, legs, skin, hair, hat, band) => ({ coat, shirt, legs, skin, hair, hat, band });
      return row([
        fan({ body: 'dn_fan_body', arms: 'dn_fan_lap', hair: 'dn_fan_hair', hat: 'dn_fan_derby', favour: 'dn_fan_rosette' }, T(0x3b393a, 0xf8fff8, 0x3b393a, 0xf1c9a5, 0x2a1d18, 0x3b393a, 0x8b4044)),
        fan({ body: 'dn_fan_body2', arms: 'dn_fan_prog', hair: 'dn_fan_hair_bun', hat: 'dn_fan_sunhat' }, T(0x7b9a6e, 0xf8fff8, 0x7b9a6e, 0xa8714f, 0x1d1a29, 0xf8fff8, 0xcfb352)),
        fan({ body: 'dn_fan_body', arms: 'dn_fan_bino', hair: 'dn_fan_hair_thin', hat: 'dn_fan_tophat' }, T(0x2f4f7a, 0xdfe8dd, 0x5a5760, 0xe9b98f, 0x8a8698, 0x3b393a, 0xcfb352)),
        fan({ body: 'dn_fan_body2', arms: 'dn_fan_lap', hair: 'dn_fan_hair_long', hat: 'dn_fan_fascinator', favour: 'dn_fan_scarf' }, T(0x8b4044, 0xf8fff8, 0x8b4044, 0xd8a47f, 0x9a6a3a, 0xcfb352, 0xf8fff8)),
        fan({ body: 'dn_fan_body', arms: 'dn_fan_arms', hair: 'dn_fan_hair', hat: 'dn_fan_cap' }, T(0xb07c57, 0xf8fff8, 0x8c5f3f, 0x6e4632, 0x1d1a29, 0x5b7a52, 0x6a2e33)),
        fan({ body: 'dn_fan_body', arms: 'dn_fan_arm1', hair: 'dn_fan_hair_bun', hat: 'dn_fan_boater', favour: 'dn_fan_scarf' }, T(0xdfe8dd, 0xcfb352, 0x2f4f7a, 0xf1c9a5, 0xd8b56a, 0xcfb352, 0x8b4044)),
        fan({ body: 'dn_fan_body2', arms: 'dn_fan_arms', hair: 'dn_fan_hair_long', favour: 'dn_fan_rosette' }, T(0xcfb352, 0xf8fff8, 0xcfb352, 0xe9b98f, 0x5a3a22, 0x3b393a, 0x8b4044)),
        fan({ body: 'dn_fan_body', arms: 'dn_fan_lap', hair: 'dn_fan_hair_thin' }, T(0x5b7a52, 0xf8fff8, 0x3b393a, 0xd8a47f, 0x8a8698, 0x3b393a, 0x8b4044)),
      ], 0.4);
    }),
  ],
};

export default [downs];
