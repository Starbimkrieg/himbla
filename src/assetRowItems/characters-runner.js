import * as THREE from 'three';
import { makeRunner, makeCrate } from '../models.js';
import { OUTFITS, SKATES } from '../cosmeticsData.js';
import { dressRunner, dressSkates } from '../cosmetics.js';
import '../casino.js'; // adds the casino outfits and skate finishes
import '../secrets.js'; // adds the Xenoglide finish
import { ITEMS, MUTATIONS, makeJarMesh, buildMutationMeshes } from '../alchemy.js';
import { CARGO, MIL_CARGO } from '../locations.js';
import { holoMaterial } from '../monolith.js';
import { makeXenoSkates } from '../secrets.js';
import { makeDrone } from '../tutorial.js';
import { span, cell, line, restRunner } from './characters-util.js';

// 01 · RUNNER & GEAR: the runner, outfits, skate finishes, mutations, cargo, the jar, the hologram, Xenoglide and BOLT.

const RW = 2.6; // a runner's cell width along the row, with its tag (m)
const RD = 3.2;

const OUTFIT_TAGS = { loungelizard: 'LOUNGE LIZARD', highroller: 'HIGH ROLLER', moonroyal: 'MOON ROYAL' };
const outfitTag = (id) => OUTFIT_TAGS[id] || id.replace(/2$/, ' ELITE').toUpperCase();
const OUTFIT_N = 16; // courier + six factions x base/elite + three casino
const SKATE_N = 11;
const MUT_N = 10;
const CRATE_NAMES = ['MEDICAL', 'FAMILY', 'CRYO', 'HELIUM-3', 'RADAR', 'COIL', 'CAKE', 'SPORE', 'ICE', 'MAIL', 'LAMPS', 'DIPLOMAT', 'DRIVE', 'RATIONS'];
const JAR_N = 20;

// ---- runner, front and back
function playerItem() {
  return {
    id: 'runner.player', label: 'RUNNER (FRONT, BACK)', w: span(2, RW), d: RD,
    make() {
      // own: private materials, so the wardrobe can recolour it
      const front = restRunner(makeRunner({ suit: 0xff4f2e, accent: 0x2ee6ff, scarf: 0xffd23f, own: true }));
      const back = restRunner(makeRunner({ suit: 0xff4f2e, accent: 0x2ee6ff, scarf: 0xffd23f, own: true }));
      back.root.rotation.y = Math.PI;
      const L = line([cell(front.root, 'FRONT', RW, RD), cell(back.root, 'BACK', RW, RD)]);
      return { root: L.root };
    },
  };
}

// ---- outfits
function outfitsItem() {
  return {
    id: 'runner.outfits', label: 'OUTFITS (16)', w: span(OUTFIT_N, RW), d: RD,
    make() {
      const cells = Object.keys(OUTFITS).map((id) => {
        const M = makeRunner({ own: true });
        dressRunner(M, id);
        restRunner(M);
        return cell(M.root, outfitTag(id), RW, RD, { h: 0.6 });
      });
      return { root: line(cells).root };
    },
  };
}

// ---- skate finishes
function skatesItem() {
  return {
    id: 'runner.skates', label: 'SKATE FINISHES (11)', w: span(SKATE_N, RW), d: RD,
    make() {
      const cells = Object.keys(SKATES).map((id) => {
        const M = makeRunner({ own: true });
        dressSkates(M, id);
        restRunner(M);
        M.root.rotation.y = 0.9; // three-quarter turn so the boots show
        return cell(M.root, id.toUpperCase(), RW, RD, { h: 0.6 });
      });
      return { root: line(cells).root };
    },
  };
}

// ---- mutations
function mutationsItem() {
  return {
    id: 'runner.mutations', label: 'MUTATIONS (10)', w: span(MUT_N, 4.4), d: RD + 1,
    make() {
      const flaps = [];
      const cells = Object.keys(MUTATIONS).map((key) => {
        const M = makeRunner({ own: true });
        restRunner(M);
        buildMutationMeshes(M, (k) => k === key, (parent, mesh) => { parent.add(mesh); if (mesh.userData.flap) flaps.push(mesh); return mesh; });
        return cell(M.root, MUTATIONS[key].name, 4.4, RD + 1, { h: 0.6 });
      });
      return {
        root: line(cells).root,
        // wings flap as in alchemy.update
        update: (dt, t) => { for (const m of flaps) m.rotation.y = m.userData.flap * (0.5 + Math.sin(t * 3) * 0.35); },
      };
    },
  };
}

// ---- cargo: a crate on the back, the Kepler twin stack, the contract colours
function cargoItem() {
  const colours = [...CARGO, ...MIL_CARGO];
  return {
    id: 'runner.cargo', label: 'CARGO CRATES', w: span(2, RW) + span(colours.length, 2) + 0.6, d: RD,
    make() {
      const cells = [];
      const one = restRunner(makeRunner({ own: true }), { back: 1.14, top: 1.0, hw: 0.42 });
      one.cargoSlot.add(makeCrate(0xffd23f, 0.7));
      one.root.rotation.y = Math.PI;
      cells.push(cell(one.root, 'ONE CRATE', RW, RD, { h: 0.6 }));
      const twin = restRunner(makeRunner({ own: true }), { back: 1.14, top: 1.5, hw: 0.42 });
      const bottom = makeCrate(0xff9f1c, 0.7);
      const top = makeCrate(0x7dff6a, 0.62);
      top.position.y = 0.55;
      top.rotation.y = 0.25;
      bottom.add(top);
      twin.cargoSlot.add(bottom);
      twin.root.rotation.y = Math.PI;
      cells.push(cell(twin.root, 'TWIN STACK', RW, RD, { h: 0.6 }));
      // the cargo colours, at carried size
      colours.forEach((c, i) => {
        const crate = makeCrate(c.color, 0.7);
        crate.position.y = 0.28;
        cells.push(cell(crate, CRATE_NAMES[i], 2, 1, { h: 0.5, z: 0.9 }));
      });
      return { root: line(cells).root };
    },
  };
}

// ---- the containment jar on the pack
function jarItem() {
  const kinds = Object.keys(ITEMS);
  return {
    id: 'runner.jar', label: 'CONTAINMENT JAR', w: RW + span(JAR_N, 2) + 0.6, d: RD,
    make() {
      const cells = [];
      const R = restRunner(makeRunner({ own: true }), { back: 0.55, top: 0.94 });
      R.cargoSlot.add(makeJarMesh([{ kind: 'rock' }, { kind: 'water' }, { kind: 'person' }], true));
      R.root.rotation.y = Math.PI;
      cells.push(cell(R.root, 'ON THE PACK', RW, RD, { h: 0.6 }));
      // the jar alone at true size: empty, with the artifact, and with each of the 18 things
      const alone = (jar, artifact, label) => {
        const g = new THREE.Group();
        const m = makeJarMesh(jar, artifact);
        m.position.set(0, 0.34, 0);
        g.add(m);
        cells.push(cell(g, label, 2, 1, { h: 0.5, z: 0.9 }));
      };
      alone([], false, 'EMPTY');
      alone([], true, 'ARTIFACT');
      for (const k of kinds) alone([{ kind: k }], false, k.toUpperCase());
      return { root: line(cells).root };
    },
  };
}

// ---- echo hologram (monolith.js spawnEchoes): flat translucent cyan, no ink
function echoItem() {
  return {
    id: 'runner.echo', label: 'ECHO HOLOGRAM', w: 2, d: 2,
    make() {
      const m = restRunner(makeRunner());
      const mat = holoMaterial();
      m.root.traverse((o) => {
        if (!o.isMesh) return;
        if (o.material && o.material.side === THREE.BackSide) { o.visible = false; return; }
        o.material = mat;
        o.castShadow = false;
      });
      return { root: m.root };
    },
  };
}

// ---- Xenoglide skates, hovering as over the Fissure shrine
function xenoItem() {
  return {
    id: 'runner.xenoskates', label: 'XENOGLIDE SKATES', w: 3.4, d: 3.4,
    make() {
      const root = new THREE.Group();
      const skates = makeXenoSkates();
      skates.position.y = 2.4;
      root.add(skates);
      const shards = skates.userData.shards;
      return {
        root,
        update: (dt, t) => {
          skates.rotation.y += dt;
          if (shards) { shards.rotation.y -= dt * 2.2; for (const c of shards.children) c.rotation.x += dt * 3; }
          skates.position.y = 2.4 + Math.sin(t * 2) * 0.25;
        },
      };
    },
  };
}

// ---- BOLT, the courier-school drone
function boltItem() {
  return {
    id: 'runner.bolt', label: 'BOLT (DRONE)', w: 3, d: 2,
    make() {
      const D = makeDrone();
      const root = new THREE.Group();
      D.root.position.y = 1.6;
      root.add(D.root);
      let t0 = 0;
      return {
        root,
        update: (dt, t) => {
          t0 = t;
          for (const r of D.rotors) r.rotation.y += dt * 40;
          D.tip.visible = Math.sin(t0 * 5) > 0;
          D.jet.scale.y = 0.8 + Math.sin(t0 * 30) * 0.2;
          D.root.position.y = 1.6 + Math.sin(t0 * 2) * 0.12;
        },
      };
    },
  };
}

export default {
  id: 'characters.runner',
  title: '01 · RUNNER & GEAR',
  items: [playerItem(), outfitsItem(), skatesItem(), mutationsItem(), cargoItem(), jarItem(), echoItem(), xenoItem(), boltItem()],
};
