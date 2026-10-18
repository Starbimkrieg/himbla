import { makeChimera, makeMite, LIVING, MODIFIERS, PALETTE } from '../chimera.js';
import { makeFollowerModel } from '../alchemy.js';
import { makeDuck } from '../casinoWorld.js';
import { span, cell, line } from './characters-util.js';

// 03 · CREATURES: chimera species, mutation kits, hybrids, Mega Mite, wild mite, racing ducks, reactor pets.

const SP_W = 4.4; // a chimera's cell along the row (m)
const SP_D = 4.4;

// walk-cycle speed for chimera.js anim(t, speed): they trot on the spot
const GAIT = 3.5;

function chimeraCells(list, w = SP_W, d = SP_D, yaw = 0) {
  const anims = [];
  const cells = list.map(([name, genes]) => {
    const c = makeChimera(genes);
    if (yaw) c.root.rotation.y = yaw;
    anims.push(c.anim);
    return cell(c.root, name, w, d, { h: 0.7 });
  });
  return { cells, update: (dt, t) => { for (const a of anims) a(t, GAIT); } };
}

// ---- the eight pure species
function speciesItem() {
  return {
    id: 'creatures.species', label: 'CHIMERA SPECIES (8)', w: span(LIVING.length, SP_W), d: SP_D,
    make() {
      const R = chimeraCells(LIVING.map((k) => [k.toUpperCase(), { seed: 11, body: k, legs: k, head: k, extraHead: null, mods: [], size: 1, tint: PALETTE[k][0] }]));
      return { root: line(R.cells).root, update: R.update };
    },
  };
}

// ---- the eight mutation kits, one each on a person/car/alien chimera
function modsItem() {
  const mods = [...new Set(Object.values(MODIFIERS))];
  const W = 4.8;
  return {
    id: 'creatures.mutations', label: 'CHIMERA MUTATIONS (8)', w: span(mods.length, W), d: SP_D + 1,
    make() {
      const R = chimeraCells(mods.map((m) => [m.toUpperCase(), { seed: 11, body: 'person', legs: 'car', head: 'alien', extraHead: null, mods: [m], size: 1, tint: PALETTE.person[0] }]), W, SP_D + 1, 1.2); // (side-on: kits sit on the back)
      return { root: line(R.cells).root, update: R.update };
    },
  };
}

// ---- hybrids: mixed parts, second heads, sizes
function hybridsItem() {
  const mixes = [
    ['MITE LEGS', { seed: 3, body: 'person', legs: 'mite', head: 'junkbot', extraHead: 'pirate', mods: [], size: 1.2, tint: PALETTE.person[1] }],
    ['TWO-HEADED', { seed: 5, body: 'car', legs: 'car', head: 'alien', extraHead: 'sapling', mods: [], size: 1.1, tint: PALETTE.car[0] }],
    ['ROOTED', { seed: 8, body: 'sapling', legs: 'junkbot', head: 'voidling', extraHead: null, mods: [], size: 0.9, tint: PALETTE.sapling[1] }],
    ['IRONCLAD', { seed: 9, body: 'pirate', legs: 'sapling', head: 'car', extraHead: null, mods: ['crystal', 'armor'], size: 1.35, tint: PALETTE.pirate[1] }],
  ];
  return {
    id: 'creatures.hybrids', label: 'HYBRIDS', w: span(mixes.length, 5.2), d: 5,
    make() {
      const R = chimeraCells(mixes, 5.2, 5);
      return { root: line(R.cells).root, update: R.update };
    },
  };
}

// ---- the 600 HP Mega Mite (alchemy.js spawnMegaMite)
function megaMiteItem() {
  return {
    id: 'creatures.megamite', label: 'MEGA MITE', w: 19, d: 20,
    make() {
      const m = makeChimera({ seed: 7, body: 'mite', legs: 'mite', head: 'mite', extraHead: 'mite', mods: ['void'], size: 6, tint: 0xb8e986 });
      return { root: m.root, update: (dt, t) => m.anim(t, 2) };
    },
  };
}

// ---- the wild mite (sunlit craters)
function miteItem() {
  return {
    id: 'creatures.mite', label: 'WILD MITE', w: 3, d: 3,
    make() {
      const m = makeMite();
      return { root: m.root, update: (dt, t) => m.anim(t, GAIT) };
    },
  };
}

// ---- the four racing ducks (casinoWorld.js: the Duck Derby)
function ducksItem() {
  const cols = [0xffd23f, 0xff2e88, 0x2ee6ff, 0x7dff6a];
  const DW = 3.4;
  return {
    id: 'creatures.ducks', label: 'RACING DUCKS (4)', w: span(cols.length, DW), d: 2.4,
    make() {
      const ducks = [];
      const cells = cols.map((c, i) => {
        const d = makeDuck(c, i === 0 ? 0xff5a1f : 0xff9f1c, i + 1);
        d.root.rotation.y = -Math.PI / 2 + 0.5; // (they swim along +x; turned face-on)
        ducks.push(d);
        return cell(d.root, 'DUCK ' + (i + 1), DW, 2.4, { h: 0.6, z: 1.4 });
      });
      return {
        root: line(cells).root,
        update: (dt, t) => { ducks.forEach((d, i) => { d.bob.position.y = Math.sin(t * 3 + i) * 0.05; d.bob.rotation.z = Math.sin(t * 2 + i) * 0.04; }); },
      };
    },
  };
}

// ---- reactor pets: slick-rock pet, dirt golem (alchemy.js addFollower)
function followersItem() {
  return {
    id: 'creatures.followers', label: 'REACTOR PETS', w: span(2, 3.4), d: 2.8,
    make() {
      const cells = [
        cell(makeFollowerModel('rock'), 'PET ROCK', 3.4, 2.8, { h: 0.6, z: 1.9 }),
        cell(makeFollowerModel('dirt'), 'DIRT GOLEM', 3.4, 2.8, { h: 0.6, z: 1.9 }),
      ];
      return { root: line(cells).root };
    },
  };
}

export default {
  id: 'characters.creatures',
  title: '03 · CREATURES',
  items: [speciesItem(), modsItem(), hybridsItem(), megaMiteItem(), miteItem(), ducksItem(), followersItem()],
};
