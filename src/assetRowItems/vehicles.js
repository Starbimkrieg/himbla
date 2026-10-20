// Asset Row catalogue: 06 GROUND VEHICLES and 07 SHIPS (see index.js for the item format).
//
// Every vehicle is a STATIC display on y = 0 (vehicle physics assume a round planet): wheels as built, gear down, ramps up,
// no thrust. Only cheap cosmetic updates run (flag cloth, gatling, phase coils, land-train beacon). Built with the pure
// model factories, never through Garage, Traffic or Enemies.
import * as THREE from 'three';
import { makeLightBike, makeSkimmer, makeRover, makeHoverCar, makeKadeTruck, makeTurret, makeLandTrain, makeShuttle, makeFreighter, makeRocket } from '../models.js';
import { buildVehicleModel, VEHICLES } from '../vehicles.js';
import { buildBuggyRig, linkBar } from '../traffic.js';
import { BOSS_MODELS, FOES } from '../storyAssets.js';
import { makeMothership } from '../spindle.js';
import { lineUp, together } from './common.js';

const FACTION_COLOR = { spacecom: 0xffd23f, vostok: 0xff3b5c, meridian: 0x2ec4ff, kepler: 0xff9f1c, daedalus: 0xc77dff };

// ---------------------------------------------------------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------------------------------------------------------

// A model turned to `yaw` about y (nose +z then points along (sin yaw, 0, cos yaw)); lift: where its lowest point goes.
// Returns an identity-transform group (as an item root must be) holding it.
function pose(obj, yaw = 0, lift = null) {
  const g = new THREE.Group();
  g.add(obj);
  g.rotation.y = yaw;
  if (lift !== null) {
    g.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(g, true); // (precise: a tilted part's loose box would float it)
    g.position.y = lift - b.min.y;
  }
  const outer = new THREE.Group();
  outer.add(g);
  return outer;
}

// Removes invisible parts (folded thrust plumes, stowed gear) so what is measured, centred and boxed is what is seen.
function pruneHidden(root) {
  const gone = [];
  root.traverse((o) => { if (!o.visible && o !== root) gone.push(o); });
  for (const o of gone) o.removeFromParent();
  return root;
}

// a lineUp() part: root plus the room it takes
const part = (root, w, d) => ({ root, w, d });

// Variants in two staggered rows (first `nFront` in front, the rest behind in the gaps), all visible from the walk.
// `pitch` = spacing along the row, `dz` = between rows.
function brick(parts, pitch, dz, nFront = Math.ceil(parts.length / 2)) {
  const root = new THREE.Group();
  const back = parts.length - nFront;
  parts.forEach((p, i) => {
    const front = i < nFront, j = front ? i : i - nFront, n = front ? nFront : back;
    p.root.position.set((j - (n - 1) / 2) * pitch, 0, front ? dz / 2 : -dz / 2);
    root.add(p.root);
  });
  return root;
}

// the cloth on a rover's whip pole ripples at rest
const flagUpdate = (m) => (m.anim ? (dt, t) => m.anim(t, 0) : undefined);

const rover = (o) => makeRover({ pirate: false, ...o });

// faction armoured patrol car, as enemies.js spawns it (x1.15)
function patrolRover(faction) {
  const fc = FACTION_COLOR[faction];
  const m = rover({ color: 0x55607a, trim: fc, flag: fc, style: 'military' });
  m.root.scale.setScalar(1.15);
  return m;
}

// faction troop car (x1.3, storyAssets FOES)
function troopRover(faction) {
  const F = FOES[faction].rover;
  const m = rover({ color: F.color, trim: F.trim, flag: F.flag, style: F.civil ? 'civil' : 'military' });
  m.root.scale.setScalar(1.3);
  return m;
}

// Land-trains: tractor (nose +z) and cars behind it along z at traffic.js spacings, drawbars aimed at each coupling pin,
// then the whole train turned to run along the row (+x).
function landTrain(spec) {
  const lt = makeLandTrain(spec);
  const train = new THREE.Group();
  train.add(lt.root);
  lt.trailers.forEach((t, i) => { t.root.position.z = -(4.3 + 1.6 + 4.0 + i * 9.9); train.add(t.root); });
  train.updateMatrixWorld(true);
  lt.trailers.forEach((t, i) => linkBar(t, i ? lt.trailers[i - 1].root : lt.root, i ? -4.25 : -4.55));
  const beacon = lt.beacon;
  return { root: pose(train, Math.PI / 2), update: beacon ? (dt, t) => { beacon.visible = Math.sin(t * 6) > -0.2; } : undefined };
}
const trainItem = (type, faction, cars, label, w, d) => ({
  id: `train.${type}.${faction}`, label, w, d,
  make: () => landTrain({ faction, type, cars }),
});

// ---------------------------------------------------------------------------------------------------------------------------
// 06 GROUND VEHICLES
// ---------------------------------------------------------------------------------------------------------------------------
const YAW = 1.0; // three-quarter view: nose along the row, a little toward the walker
const YAW_ROW = 1.3; // nearer a side view, for sub-rows (takes less room)

const ground = {
  id: 'vehicles.ground',
  title: '06 · GROUND VEHICLES',
  items: [
    {
      id: 'veh.interceptor', label: 'SPACECOM LUNAR INTERCEPTOR', w: 8, d: 7,
      make: () => { const m = buildVehicleModel('interceptor'); return { root: pose(m.root, YAW), update: flagUpdate(m) }; },
    },
    {
      id: 'veh.apc', label: 'VOSTOK BTR-M MOON APC', w: 10, d: 9,
      make: () => { const m = buildVehicleModel('apc'); return { root: pose(m.root, YAW) }; },
    },
    {
      // classic Skimmer and the two Blender redesigns (A Aegis, B Bulwark), as built (the runner rides inside)
      id: 'veh.skimmer', label: 'DAEDALUS PHASE SKIMMER · CLASSIC, A, B', w: 28, d: 9,
      make: () => {
        const { color, trim } = VEHICLES.skimmer;
        const ms = ['classic', 'a', 'b'].map((style) => makeSkimmer({ color, trim, style }));
        return { root: lineUp(ms.map((m) => part(pose(m.root, YAW), 8.5, 9))).root, update: (dt, t) => { for (const m of ms) m.anim(t, 24); } };
      },
    },
    {
      // the Mule, and the Kepler hometown motor pool's rover (lighter green, no scale-up)
      id: 'veh.mule', label: 'KEPLER MULE · HOMETOWN ROVER', w: 17, d: 8,
      make: () => {
        const mule = buildVehicleModel('mule');
        const home = rover({ color: 0x7dff6a, trim: 0xff9f1c, flag: 0xff9f1c, style: 'civil' });
        return { root: lineUp([part(pose(mule.root, YAW), 8, 8), part(pose(home.root, YAW), 7, 7)]).root, update: together(flagUpdate(mule), flagUpdate(home)) };
      },
    },
    {
      id: 'veh.carrier', label: 'KEPLER MILITIA CARRIER', w: 10, d: 9,
      make: () => { const m = buildVehicleModel('carrier'); return { root: pose(m.root, YAW) }; },
    },
    {
      // classic bike and the two Blender redesigns (A Slipstream, B Parcel Runner), as built (no rider)
      id: 'veh.lightbike', label: 'MERIDIAN COURIER LIGHT-BIKE · CLASSIC, A, B', w: 22, d: 4,
      make: () => ({
        root: lineUp(['classic', 'a', 'b'].map((style) => part(pose(makeLightBike({ style }).root, YAW), 6, 4))).root,
      }),
    },
    {
      id: 'veh.warrig', label: 'RUSTMOON SCRAPJAW WAR-RIG', w: 10, d: 9,
      make: () => { const m = buildVehicleModel('warrig'); return { root: pose(m.root, YAW), update: flagUpdate(m) }; },
    },
    {
      id: 'veh.patrol-rovers', label: 'BASE PATROL ROVERS · 5 FACTIONS', w: 29, d: 17,
      make: () => {
        const ms = Object.keys(FACTION_COLOR).map(patrolRover);
        return { root: brick(ms.map((m) => part(pose(m.root, YAW_ROW))), 10, 8), update: together(...ms.map(flagUpdate)) };
      },
    },
    {
      id: 'veh.troop-rovers', label: 'TROOP ROVERS · 5 FACTIONS', w: 33, d: 18,
      make: () => {
        const ms = ['spacecom', 'vostok', 'daedalus', 'meridian', 'kepler'].map(troopRover);
        return { root: brick(ms.map((m) => part(pose(m.root, YAW_ROW))), 11.5, 9), update: together(...ms.map(flagUpdate)) };
      },
    },
    {
      id: 'veh.road-buggies', label: 'ROAD BUGGIES · 3 PAINTS', w: 28, d: 9,
      make: () => {
        const ms = [0, 1, 2].map(buildBuggyRig);
        return { root: lineUp(ms.map((m) => part(pose(m.root, YAW_ROW), 9.4, 9)), 0).root, update: together(...ms.map(flagUpdate)) };
      },
    },
    {
      // four faction cars (SPACECOM's with light bar), then five civilian paints
      id: 'veh.hover-cars', label: 'HOVER-CARS · 4 FACTION, 5 CIVILIAN', w: 36, d: 12,
      make: () => {
        const cars = [...['spacecom', 'vostok', 'kepler', 'meridian'].map((faction) => makeHoverCar({ faction })), ...[0, 1, 2, 3, 4].map((paint) => makeHoverCar({ paint }))];
        const ups = cars.map((m) => part(pose(m.root, YAW_ROW, 1.15)));
        const beacons = cars.flatMap((m) => m.beacons);
        return { root: brick(ups, 8.5, 6.5, 5), update: beacons.length ? (dt, t) => { for (const b of beacons) b.visible = Math.sin(t * 7 + b.userData.phase * Math.PI) > 0; } : undefined };
      },
    },
    {
      id: 'veh.kade-truck', label: "CAPTAIN KADE'S GUN TRUCK", w: 19, d: 17,
      make: () => {
        const m = makeKadeTruck();
        m.root.scale.setScalar(1.25); // (boss: biggest thing on the road)
        return { root: pose(m.root, YAW), update: (dt) => { m.gatSpin.rotation.z += dt * 6; } };
      },
    },
    ...['convoy', 'warden', 'hammer'].map((k) => ({
      id: `boss.${k}`,
      label: { convoy: 'SPACECOM ARMOURED CONVOY HAULER', warden: 'DAEDALUS WARDEN', hammer: 'VOSTOK HAMMER' }[k],
      w: { convoy: 15, warden: 20, hammer: 17 }[k], d: { convoy: 12, warden: 17.5, hammer: 15 }[k],
      make: () => { const m = BOSS_MODELS[k](); m.root.scale.setScalar(1.25); return { root: pose(m.root, YAW) }; },
    })),
    // land-trains: four faction liveries per service, one train per item (39 m long)
    ...[['spacecom', 'SPACECOM'], ['vostok', 'VOSTOK'], ['kepler', 'KEPLER'], ['meridian', 'MERIDIAN']].map(([f, n]) =>
      trainItem('moonliner', f, ['pax', 'pax', 'pax'], `MOONLINER LAND-TRAIN · ${n}`, 39, 6)),
    ...[['spacecom', 'SPACECOM', ['tank', 'cargo', 'blast']], ['vostok', 'VOSTOK', ['cargo', 'tank', 'blast']], ['kepler', 'KEPLER', ['tank', 'tank', 'blast']], ['meridian', 'MERIDIAN', ['tank', 'cargo', 'cargo']]].map(([f, n, cars]) =>
      trainItem('prospector', f, cars, `PROSPECTOR FREIGHT TRAIN · ${n}`, 39, 6)),
    {
      // base gun turrets in each faction's colour, then the ILMB's heavy x1.35
      id: 'veh.turrets', label: 'BASE TURRETS · 5 FACTIONS · ILMB HEAVY', w: 44, d: 11,
      make: () => {
        const ts = [...Object.values(FACTION_COLOR).map((c) => makeTurret({ color: c })), makeTurret({ color: FACTION_COLOR.spacecom })];
        ts[5].root.scale.setScalar(1.35);
        return { root: lineUp(ts.map((t, i) => part(pose(t.root, 0.5), i === 5 ? 8 : 6.5, i === 5 ? 8 : 6.5)), 0.5).root };
      },
    },
  ],
};

// ---------------------------------------------------------------------------------------------------------------------------
// 07 SHIPS
// ---------------------------------------------------------------------------------------------------------------------------
// Transit ships' origin is their flight point; on a pad their feet are gearH below it. pose() puts the feet on y = 0.
const park = (s, gear = 1) => { s.setGear(gear); s.setRamp(0); s.setThrust(0, 0, 0); return s; };
const ships = {
  id: 'vehicles.ships',
  title: '07 · SHIPS',
  items: [
    {
      id: 'ship.shuttle-bus', label: 'SHUTTLE-BUS', w: 26, d: 24,
      make: () => ({ root: pose(pruneHidden(park(makeShuttle({ color: 0xfff4e0, stripe: 0x2ec4ff })).root), YAW, 0) }),
    },
    {
      id: 'ship.freighter', label: 'DEEP-HAUL FREIGHTER', w: 86, d: 79,
      make: () => ({ root: pose(pruneHidden(park(makeFreighter({ stripe: 0xff9f1c })).root), YAW, 0) }),
    },
    {
      // pirate wreck event's ship: small, dark, bay doors hanging, tipped on one leg (events.js spawnWreck)
      id: 'ship.crashed-freighter', label: 'CRASHED PIRATE FREIGHTER', w: 39, d: 36,
      make: () => {
        const s = makeFreighter({ color: 0x3a2b4f, stripe: 0x7dff3a });
        s.root.scale.setScalar(0.45);
        park(s, 0.15);
        s.root.rotateZ(0.35);
        s.root.rotateX(0.2);
        return { root: pose(pruneHidden(s.root), YAW, 0) };
      },
    },
    {
      id: 'ship.rocket', label: 'ARRIVALS ROCKET', w: 11, d: 11,
      make: () => {
        const r = makeRocket();
        r.flame.visible = r.core.visible = false; // (on its pad, not flying)
        return { root: pose(pruneHidden(r.root), 0, 0) };
      },
    },
    {
      id: 'ship.mothership', label: 'ALIEN MOTHERSHIP', w: 86, d: 86,
      make: () => {
        const m = makeMothership();
        m.root.traverse((o) => { o.castShadow = false; });
        return { root: pose(m.root, 0, 0) };
      },
    },
  ],
};

export default [ground, ships];

// SKIPPED (and why)
// - Other shuttle-bus stripes (orange, green, violet), freighter stripes (pink, cyan), and the shuttle's medevac / recall /
//   Spindle-pod scalings: same model, only colour or scale differs (a row would be 100 m wide).
// - The crashed freighter's prone pirate: a character (makeFigure).
// - Vehicles parked in places (ILMB depot patrol rovers, casino car park, events.js "supply rover"): same models as above
//   (the hometown motor pool's paint is in the Mule item).
// - Scenery containing a vehicle shape (tower crane, garage hall, dish stations, Helium-3 bucket-wheel excavator, junk pile's
//   half-buried rover, Meridian launch pad's rocket, shuttle-bus in the Vostok hangar): buildings and places groups.
// - The Spindle's alien drone (spindle.js makeDrone): an enemy (the props manifest lists it).
// - Driving, wheel spin, turret tracking, ramp and gear cycles, thrust plumes: these are static displays.
// OVERLAP: the props manifest also lists prop.turret, prop.rocket and spindle.mothership, built here too (veh.turrets,
// ship.rocket, ship.mothership); one group should drop them.
