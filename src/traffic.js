import * as THREE from 'three';
import { toon, ink, glow, textSprite, setMask } from './toon.js';
const VEH_DETAIL = 220; // m: past this a vehicle's small parts stop drawing
import { makeFigure, makeShuttle, makeRover, makeHoverCar, makeFreighter, makeLandTrain, LAND_TRAIN_FACTIONS, GARAGE_HALL, GARAGE_BAYS, GARAGE_FLOOR } from './models.js';
import { mulberry32 } from './rng.js';
import { SUN, frameQuat, arcDist } from './geo.js';
import { planRoad, roadQuality } from './roadplan.js';

// Ambient traffic: freighters and shuttle-buses landing on pads at each settlement's edge (passengers walk to and from
// the buildings), and a road network joining the safe outposts (through or round each town) driven by land-trains,
// hover-cars and buggies. Land-trains and buggies can be wrecked.
//
// world.vehicles kinds: 'ship' (freighter), 'bus' (shuttle), 'car' (hover-car on roads; alchemy can jar these),
// 'landtrain' (Moonliner express or Prospector freight rig, with trailers). Buggies live in world.crawlers (main.js
// bumps the player with those).

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
const _n = new THREE.Vector3(), _u = new THREE.Vector3(), _f = new THREE.Vector3();
const _q = new THREE.Quaternion(), _m4 = new THREE.Matrix4();
const _fp = new THREE.Vector3(), _rp = new THREE.Vector3(); // lane ground points under a unit's front and rear axles
const _g0 = new THREE.Vector3(), _g1 = new THREE.Vector3(), _g2 = new THREE.Vector3(), _g3 = new THREE.Vector3();
const _gx = new THREE.Vector3(), _gy = new THREE.Vector3(), _gz = new THREE.Vector3(), _gt = new THREE.Vector3();
const smooth = (t) => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };
const clamp01 = (t) => Math.min(1, Math.max(0, t));
const SAFE_ROAD = 2500; // m: connect safe outposts closer than this (plus each one's nearest neighbour < 3 km)
const LINK_MAX = 3000; // m: longest nearest / second-nearest link
const PAX_RANGE = 500; // m: passengers only exist near the camera
// A land-train is 5.4 m across the tyres, so two pass 2.2 m apart: lanes 3.8 m off the centreline, graded bed to 7.4,
// then the cut and a dust berm to 9.
const LANE = 3.8; // lane offset from the centreline (right-hand traffic)
const ROAD_HALF = 9; // half the drawn strip (m)
const ROAD_LAT = [-9, -7.4, -3.8, 0, 3.8, 7.4, 9]; // offsets the strip is sampled onto the ground at
// squared distance from point c to the segment a-b
function segDist2(a, b, c) {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const l2 = abx * abx + aby * aby + abz * abz || 1e-9;
  const t = Math.max(0, Math.min(1, ((c.x - a.x) * abx + (c.y - a.y) * aby + (c.z - a.z) * abz) / l2));
  const dx = a.x + abx * t - c.x, dy = a.y + aby * t - c.y, dz = a.z + abz * t - c.z;
  return dx * dx + dy * dy + dz * dz;
}
// Prospector trailers: Helium-3 tankers, containers, the explosives magazine (always last)
const FREIGHT = [['tank', 'cargo', 'blast'], ['cargo', 'tank', 'blast'], ['tank', 'tank', 'blast'], ['tank', 'cargo', 'cargo']];
const TRAIN_HP = 400, BUGGY_HP = 120, CAR_HP = 90;
const _z = new THREE.Vector3(0, 0, 1);
const _eu = new THREE.Euler();
// ring roads round each connected town
const RING_GAP = 32; // ring centreline this far outside the settlement radius (past buildings / plateau edge)
const RING_PUSH = 90; // pushed out up to this much more where something is in the way
const JOIN = 24; // junction connectors join the ring this far along it either side of a road
const JOIN_OUT = 26; // ...and leave the road lanes this far out from the ring
const GATE_SEP = 90; // minimum ring distance between two junctions
const GATE_NEAR = GATE_SEP * 0.6; // minimum for a junction laid late (addTownRoads, on a built ring): flares (24 m a side) clear
const PAD_APART = 26; // clear ground between two flights' pad discs, where the town has room (makePadStop)
// your town's shuttle climbs this high off its plot before turning: hall spire 26.6 m, hull 9 m round, gear down 5.4 m,
// so it clears the hall on any heading (the hall has no collider that tall for flightPath to lift over)
const TOWN_CLIMB = 40;
const FILLET = 24; // drawn flare at each junction
// Roads cut, and roads ending in a T on another road (buildSpur): the ILMB's roads to Meridian, Tranquility and Aldrin
// are one road meeting the Meridian-Tranquility road side-on, where traffic splits.
const CUT_ROADS = [['ilmb', 'aldrin'], ['ilmb', 'meridian'], ['ilmb', 'tranq']];
const TEES = [{ from: 'ilmb', on: ['meridian', 'tranq'] }];
// hand-laid roads the network leaves out: the Vostok supply road from the Helium-3 exchange into Bastion Vostok-9's
// restricted zone (the only road to a restricted base)
const EXTRA_ROADS = [['mine', 'vostok']];
const UNSUITABLE_STEEP = 0.2, UNSUITABLE_OFF = 0.35; // roadCentreline
const T_ARM = 30; // m from a T's centre where lanes stop and the turning connectors take over
const STOP_IN = 50; // m: minimum stop distance along its ring stretch (room for a land-train)
const pairKey = (a, b) => (a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`); // name of the road between two settlements

function part(geo, mat, x = 0, y = 0, z = 0, outline = 0.05) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  if (outline) ink(m, outline);
  return m;
}

// ---------------- models ----------------

// ---------------- path helpers ----------------

function makePath(pts, loop = false) {
  if (loop) pts = [...pts, pts[0]];
  const cum = new Float32Array(pts.length);
  for (let i = 1; i < pts.length; i++) cum[i] = cum[i - 1] + pts[i].distanceTo(pts[i - 1]);
  return { pts, cum, len: cum[pts.length - 1], loop };
}

// Position at arc length s (hint keeps a running segment index: O(1) per frame).
function sample(path, s, out, hint) {
  const cum = path.cum, n = cum.length;
  if (path.loop) s = ((s % path.len) + path.len) % path.len;
  else s = Math.min(path.len, Math.max(0, s));
  let i = Math.min(hint.i | 0, n - 2);
  while (i < n - 2 && cum[i + 1] < s) i++;
  while (i > 0 && cum[i] > s) i--;
  hint.i = i;
  const f = (s - cum[i]) / Math.max(1e-6, cum[i + 1] - cum[i]);
  hint.f = f;
  return out.copy(path.pts[i]).lerp(path.pts[i + 1], f);
}

function chaikin(pts, passes) {
  for (let p = 0; p < passes; p++) {
    const out = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      out.push(pts[i].clone().lerp(pts[i + 1], 0.25), pts[i].clone().lerp(pts[i + 1], 0.75));
    }
    out.push(pts[pts.length - 1]);
    pts = out;
  }
  return pts;
}

// ---------------- road shader ----------------

function roadMaterial() {
  return new THREE.ShaderMaterial({
    // A ground decal: blended like a transparent surface but in the opaque queue, right after the terrain (terrain
    // renderOrder -1, road -0.5, rest 0). In the transparent queue its plane (4 cm up) would cover anything sunk below it
    // (boot soles, rock feet); this way it only has to beat the terrain and everything later draws over it.
    transparent: false, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    // lights: binds the sun's shadow map so the road shows shadows falling on it (the flat bed would hide them)
    lights: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.lights, { sunDir: { value: SUN.clone() } }]),
    vertexShader: `#include <common>
      #include <shadowmap_pars_vertex>
      uniform vec3 sunDir; attribute float fade; attribute float mark; attribute float berm; attribute float soft; attribute float wid; varying vec2 vUv; varying float vLit; varying float vFade; varying float vEnd; varying float vMark; varying float vBerm; varying float vSoft; varying float vWid;
      void main(){
        vUv = uv; vEnd = fade; vMark = mark; vBerm = berm; vSoft = soft; vWid = wid;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        #if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
          // (the shadow lookup is made from the true ground point, nudged up along the local vertical: the eye-ward pull below is for the depth test only)
          vDirectionalShadowCoord[ 0 ] = directionalShadowMatrix[ 0 ] * ( wp + vec4( normalize( wp.xyz ) * directionalLightShadows[ 0 ].shadowNormalBias, 0.0 ) );
        #endif
        vec3 toCam = cameraPosition - wp.xyz; float dist = length(toCam);
        // pull toward the eye (screen position unchanged) so coarse terrain LODs never swallow the track
        wp.xyz += toCam / max(dist, 1e-3) * min(dist * 0.5, 0.25 + dist * 0.012);
        vLit = smoothstep(-0.12, 0.3, dot(normalize(wp.xyz), sunDir));
        vFade = 1.0 - smoothstep(2300.0, 2900.0, dist);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `#include <common>
      #include <packing>
      #include <lights_pars_begin>
      #include <shadowmap_pars_fragment>
      varying vec2 vUv; varying float vLit; varying float vFade; varying float vEnd; varying float vMark; varying float vBerm; varying float vSoft; varying float vWid;
      float h1(float n){ return fract(sin(n) * 43758.5453); }
      float n1(float x){ float i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(h1(i), h1(i + 1.0), f); }
      float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n2(vec2 p){
        vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h2(i), h2(i + vec2(1.0, 0.0)), f.x), mix(h2(i + vec2(0.0, 1.0)), h2(i + vec2(1.0, 1.0)), f.x), f.y);
      }
      // A track cut into the regolith: a graded bed of churned, compacted soil (scraped in long streaks where the dozer
      // blade ran, worn into a pair of ruts under each lane's tyres), with a dark cut line along each edge and a smooth
      // ridge of pale pushed-up dust outside it, which melts into the surface. It is drawn translucent, so the craters and
      // the colour of the ground show through. Metres across (X) and along (s) the road.
      void main(){
        float X = vUv.x * ${ROAD_HALF.toFixed(1)}, s = vUv.y, ax = abs(X), sg = sign(X);
        // (vWid: how many metres one unit across is, for a bed much wider than a road: its texture and its edge keep their size)
        float XR = X * vWid;
        float ne = n1(s * 0.29 + sg * 41.0);
        // churned soil: broad mottling, finer clods, and the blade's streaks running along the road
        float mot = n2(vec2(XR * 0.8, s * 0.2)) * 0.5 + n2(vec2(XR * 2.3, s * 0.9)) * 0.3 + n2(vec2(XR * 6.0, s * 2.6)) * 0.2;
        float scr = n2(vec2(XR * 5.5 + n1(s * 0.04) * 9.0, s * 0.045));
        float scr2 = n2(vec2(XR * 15.0 + n1(s * 0.07 + 9.0) * 6.0, s * 0.14));
        float edgeR = 7.3 + (ne - 0.5) * 0.15;
        float dE = (ax - edgeR) * vWid; // metres beyond the bed's edge
        // (a junction flare keeps the road's crisp edge and berm on the outside of its curve, and a soft, bermless edge on the
        // inside, where it melts into the neighbouring flare and the ring)
        float es = vSoft * (1.0 - vBerm);
        float bed = 1.0 - smoothstep(-0.3 - es * 1.2, 0.1 + es * 0.6, dE);
        vec3 soil = mix(vec3(0.09, 0.085, 0.115), vec3(0.25, 0.24, 0.28), mot);
        soil *= (0.88 + 0.28 * (scr - 0.5) + 0.12 * (scr2 - 0.5)) * (1.0 - 0.14 * vSoft);
        // dust that has drifted back over the bed, and the crown between the lanes where nothing runs
        float drift = smoothstep(0.6, 0.9, n2(vec2(XR * 0.35, s * 0.04 + 3.0)));
        float crown = (1.0 - smoothstep(0.5, 1.5, ax)) / (1.0 + (vWid - 1.0) * 4.0);
        soil = mix(soil, vec3(0.42, 0.4, 0.46), drift * 0.3 + crown * 0.1);
        // wheel ruts: a worn groove with a lip of pushed-up dust beside it (tyres run 1.75 and 5.85 m from the centre)
        float rd = min(abs(ax - 1.75), abs(ax - 5.85));
        float rutN = 0.6 + 0.4 * n1(s * 0.9 + ax * 3.0);
        float groove = (1.0 - smoothstep(0.1, 0.45, rd)) * rutN * vMark;
        float lip = smoothstep(0.4, 0.6, rd) * (1.0 - smoothstep(0.6, 1.0, rd)) * vMark;
        soil = mix(soil, vec3(0.03, 0.028, 0.045), groove * 0.9);
        soil = mix(soil, vec3(0.5, 0.48, 0.54), lip * 0.32 * (0.5 + 0.5 * n1(s * 0.5 + 7.0)));
        // the cut: a dark line where the bed drops away, then a smooth berm of pushed-up regolith, palest at the crest
        float cut = smoothstep(-0.2, 0.25, dE) * (1.0 - smoothstep(0.4, 1.1, dE)) * vBerm;
        float crest = smoothstep(0.3, 1.1, dE) * (1.0 - smoothstep(1.1, 9.0 - edgeR, dE)) * vBerm;
        vec3 col = soil;
        col = mix(col, vec3(0.03, 0.028, 0.045), cut * 0.92);
        col = mix(col, vec3(0.82, 0.79, 0.85) * (0.94 + 0.06 * n1(s * 0.05 + sg * 11.0)), crest * 0.9);
        // translucent, so the ground shows through, and soft where it melts into the surface
        float bedA = max(bed * mix(0.84, 0.96, vSoft), groove * 0.9);
        float a = max(bedA * vEnd, max(cut * 0.9, crest * 0.8)); // (the end fade is the bed's: a berm only stops where its strip says)
        a *= 1.0 - smoothstep(8.3 - edgeR, 9.0 - edgeR, dE);
        float sh = 1.0;
        #if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
          DirectionalLightShadow dls = directionalLightShadows[ 0 ];
          if ( receiveShadow ) sh = getShadow( directionalShadowMap[ 0 ], dls.shadowMapSize, dls.shadowIntensity, dls.shadowBias, dls.shadowRadius, vDirectionalShadowCoord[ 0 ] );
        #endif
        col *= 0.22 + 0.85 * vLit * sh;
        gl_FragColor = vec4(col, a * vFade);
      }`,
  });
}

// ---------------- traffic ----------------

// A road buggy (a rover with a driver); k picks colour and driver. Pure: the Asset Row builds it too.
export function buildBuggyRig(k) {
  const r = makeRover({ color: [0xffd23f, 0xff9f1c, 0x7dff6a][k % 3], trim: 0xfff4e0, pirate: false, flag: 0x2ec4ff });
  r.gun.visible = false;
  r.root.scale.setScalar(1.3);
  // driver on the left of the bench, legs under the dash, hands on the wheel
  const drv = makeFigure({ seed: 4100 + k });
  drv.root.position.set(0.6, 1.12, -0.32);
  drv.legL.rotation.x = drv.legR.rotation.x = -1.45;
  drv.armL.rotation.x = drv.armR.rotation.x = -1.0;
  r.chassis.add(drv.root);
  return r;
}

export class Traffic {
  constructor(world) {
    this.w = world;
    this.P = world.planet;
    this.C = world.colliders;
    this.rand = mulberry32(2024);
    this.vehicles = world.vehicles;
    this.crawlers = world.crawlers;
    this.roads = [];
    this.stops = [];
    this.walkers = [];
    this.pool = [];
    this.platforms = []; // trailer decks
    this._buf = [];
    this.L = {};
    for (const loc of world.locations) this.registerLocation(loc);
    this.buildRoads();
    this.buildFlights();
    this.dropSparePads();
  }

  // Registers a place: every boot settlement, plus a town a finale founds mid-game (main.js applyWorldLive), so flyers
  // and roads can be laid to it live. Idempotent.
  registerLocation(loc) {
    if (this.L[loc.id] === loc) return;
    this.L[loc.id] = loc;
    loc._inv = loc.group.matrixWorld.clone().invert();
    loc.stopKeep = [];
  }

  // A place rebuilt in place (world.rebuildLocation, after a Council motion) loses what traffic hung on its old group and
  // its passengers' doors. This restores its pad-stop shelters and forgets the stale buildings. Only your town asks (its
  // pad and lights are in its own kit, rebaked by hometown.js buildHomeTown).
  redress(loc) {
    delete loc._bld;
    for (const s of this.stops) {
      if (s.loc !== loc) continue;
      delete s.doors;
      if (s.shelterAt) this.shelter(loc, s.shelterAt.x, s.shelterAt.z, s.shelterAt.yaw, s.shelterAt.text, s.shelterAt.color);
    }
  }

  // nearest settlement a shuttle may fly to from `loc`: safe, unrestricted, a real town (not a POI like the casino or
  // Monolith), not a den, camp or ruin
  nearestPort(loc) {
    let best = null, bd = Infinity;
    for (const l of this.w.locations) {
      if (l === loc || l.type === 'pirate' || l.type === 'ruin' || l.camp || l.hostile || !l.safe || l.restricted || l.poi) continue;
      const d = arcDist(loc.dir, l.dir);
      if (d < bd) { bd = d; best = l; }
    }
    return best;
  }

  // settlements lay their own pads; any no transit line used goes (else an empty pad, often under a lamp post)
  dropSparePads() {
    for (const loc of this.w.locations) {
      if (!loc.pads) continue;
      for (const p of loc.pads.slice()) {
        if (!p.spare || p.used) continue;
        this.w.dropPad(loc, p); // deck, legs, railing, stairs and their colliders
        (loc.droppedPads ||= []).push({ x: p.x, z: p.z });
      }
    }
  }

  r() { return this.rand(); }

  // ---------- local frame ----------
  local(loc, v, out = new THREE.Vector3()) { return out.copy(v).applyMatrix4(loc._inv); }

  groundY(loc, x, z) {
    this.w.toWorld(loc, x, 0, z, _a);
    this.P.ground(_a, _a);
    return _a.applyMatrix4(loc._inv).y;
  }

  // local heading (radians in the XZ plane) from loc toward another location
  toward(loc, other) {
    this.local(loc, _b.copy(other.dir).multiplyScalar(this.P.R), _b);
    return Math.atan2(_b.z, _b.x);
  }

  blocked(p, r) {
    const C = this.C;
    C.query(p, r, this._buf);
    for (const c of this._buf) if (!c.platform && C.contact(c, p, r, _n) > 0) return true;
    return false;
  }

  // Is a disc of radius R (local frame) free of colliders at the given heights above y0?
  clearDisc(loc, x, z, R, heights, y0 = 0) {
    const rr = Math.max(1, R * 0.36);
    const pts = [[0, 0]];
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; pts.push([Math.cos(a) * R * 0.5, Math.sin(a) * R * 0.5]); }
    const n2 = Math.max(8, Math.ceil((2 * Math.PI * R) / (rr * 1.3)));
    for (let i = 0; i < n2; i++) { const a = (i / n2) * Math.PI * 2; pts.push([Math.cos(a) * (R - rr * 0.5), Math.sin(a) * (R - rr * 0.5)]); }
    for (const h of heights) for (const [px, pz] of pts) {
      this.w.toWorld(loc, x + px, y0 + h, z + pz, _c);
      if (this.blocked(_c, rr)) return false;
    }
    return true;
  }

  // Collider-less footprints that must stay free: pads, solar fields, lamps, turret spots (enemies.js places those
  // later), and claimed stops.
  keepouts(loc, withStops = true) {
    const k = [...(loc.pads || []), ...(loc.keep || []), ...(withStops ? loc.stopKeep : [])];
    const spots = [];
    // use world.js's real gun mounts (walls, bastions, pylons) when present
    if (loc.turretMounts && loc.turretMounts.length) {
      for (const m of loc.turretMounts) k.push({ x: m.x, z: m.z, r: 6 });
      return k;
    }
    if (loc.restricted) {
      const small = !!loc.small, inner = small ? 3 : 4, outer = small ? 2 : 4;
      for (let i = 0; i < inner; i++) spots.push([(i / inner) * Math.PI * 2 + 0.4, small ? 68 : 112]);
      for (let i = 0; i < outer; i++) spots.push([(i / outer) * Math.PI * 2 + 1.2, small ? 180 : 290]);
    } else if (loc.defense) {
      const d = loc.defense;
      for (let i = 0; i < d.turrets; i++) spots.push([(i / d.turrets) * Math.PI * 2 + 0.2, d.ring]);
      for (let i = 0; i < (d.inner || 0); i++) spots.push([(i / d.inner) * Math.PI * 2 + 0.8, d.ring * 0.55]);
    }
    for (const [a, r] of spots) k.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, r: 4 });
    return k;
  }

  // walk from (x, z) toward the centre until something solid is in the way
  townPoint(loc, x, z, max = 60) {
    const d = Math.hypot(x, z) || 1;
    const ux = -x / d, uz = -z / d;
    let best = 4;
    for (let t = 4; t <= Math.min(max, d - 2); t += 2) {
      const px = x + ux * t, pz = z + uz * t;
      this.w.toWorld(loc, px, this.groundY(loc, px, pz) + 1.2, pz, _c);
      if (this.blocked(_c, 0.9)) break;
      best = t;
    }
    best = Math.max(4, best - 2);
    const px = x + ux * best, pz = z + uz * best;
    return { x: px, y: this.groundY(loc, px, pz), z: pz, g: true };
  }

  // stop shelter (two posts, roof, bench) with a destination sign; local frame
  shelter(loc, x, z, yaw, text, color) {
    const g = new THREE.Group();
    const post = toon(0x5b5870), roofM = toon(color);
    for (const sx of [-1.6, 1.6]) g.add(part(new THREE.BoxGeometry(0.25, 2.8, 0.25), post, sx, 1.4, -0.6, 0.03));
    g.add(part(new THREE.BoxGeometry(4.0, 0.25, 2.0), roofM, 0, 2.9, 0, 0.05));
    g.add(part(new THREE.BoxGeometry(3.0, 0.2, 0.7), toon(0xfff4e0), 0, 0.7, -0.5, 0.03));
    g.add(part(new THREE.BoxGeometry(3.6, 1.2, 0.12), toon(0x2a2540), 0, 1.9, -1.0, 0));
    g.add(part(new THREE.SphereGeometry(0.22, 8, 6), glow(0xfff6a8), 0, 2.65, 0.5, 0));
    const gy = this.groundY(loc, x, z);
    this.w.put(g, loc, x, z, gy, yaw);
    // back panel and posts as one slab, bench in front: room to stand under the roof
    const c = Math.cos(yaw), sn = Math.sin(yaw);
    const at = (lx, lz) => [x + lx * c + lz * sn, z - lx * sn + lz * c];
    let [cx, cz] = at(0, -0.85);
    this.w.col(loc, { type: 'box', x: cx, y: gy + 1.5, z: cz, hx: 1.85, hy: 1.5, hz: 0.3, yaw });
    [cx, cz] = at(0, -0.5);
    this.w.col(loc, { type: 'box', x: cx, y: gy + 0.4, z: cz, hx: 1.5, hy: 0.4, hz: 0.35, yaw });
    [cx, cz] = at(0, 0);
    this.w.col(loc, { type: 'box', x: cx, y: gy + 2.9, z: cz, hx: 2.0, hy: 0.13, hz: 1.0, yaw });
    if (text) {
      const s = textSprite(text, { color: '#' + new THREE.Color(color).getHexString(), size: 48, scale: 0.24, bg: '#120a1e' });
      s.position.set(x, this.groundY(loc, x, z) + 4.6, z);
      loc.group.add(s);
    }
    return g;
  }

  // ================= flights: pads, arcs, landings =================

  // makePadStop's search: the best open spot (or registered pad) at the edge, toward heading `tw`
  padSpot(loc, tw, keeps, spec, kind) {
    const cands = [];
    for (const p of loc.pads || []) {
      if (p.r >= 25 || p.used || p.flat) continue;
      cands.push({ x: p.x, z: p.z, existing: p });
    }
    for (let fr = 0.4; fr <= 1.16; fr += 0.07) {
      for (let i = 0; i < 40; i++) {
        const a = (i / 40) * Math.PI * 2;
        cands.push({ x: Math.cos(a) * loc.r * fr, z: Math.sin(a) * loc.r * fr });
      }
    }
    for (const c of cands) {
      const d = Math.hypot(c.x, c.z), a = Math.atan2(c.z, c.x);
      c.d = d;
      c.score = 2.2 * Math.cos(a - tw) + (c.existing ? 1.4 : 0) - 0.8 * Math.abs(d / loc.r - 0.78) - 3 * Math.max(0, (d + spec.padR) / loc.r - 1.15);
    }
    cands.sort((p, q) => q.score - p.score);
    let pick = null;
    // two flights' pads keep PAD_APART m between their discs where there's room (wings and tail fins mustn't crowd);
    // a town without room takes the closer spot
    for (const apart of [PAD_APART, 0]) {
      for (const c of cands) {
        if (keeps.some((k) => k !== c.existing && Math.hypot(c.x - k.x, c.z - k.z) < spec.clearR * 0.85 + k.r + (k.flyPad ? apart : 0))) continue;
        // beyond the plateau the ground may slope: gentle spots only (the pad is raised to the top)
        let lo = 0, hi = 0;
        if (c.d + spec.padR > loc.r * 0.98) {
          lo = Infinity; hi = -Infinity;
          for (let i = 0; i <= 8; i++) {
            const a = (i / 8) * Math.PI * 2, rr = i === 8 ? 0 : spec.padR;
            const y = this.groundY(loc, c.x + Math.cos(a) * rr, c.z + Math.sin(a) * rr);
            lo = Math.min(lo, y); hi = Math.max(hi, y);
          }
          if (hi - lo > 3.5) continue;
        }
        if (!this.clearDisc(loc, c.x, c.z, spec.clearR, spec.heights, hi)) continue;
        pick = { ...c, lo, hi };
        break;
      }
      if (pick) break;
    }
    if (!pick) {
      // nothing fits: a raised pad well outside, toward the other end
      const d = loc.r * 1.35;
      pick = { x: Math.cos(tw) * d, z: Math.sin(tw) * d, lo: 0, hi: 0 };
      pick.lo = pick.hi = this.groundY(loc, pick.x, pick.z);
      console.warn('[traffic] no open pad spot at', loc.id, 'for', kind);
    }
    return pick;
  }

  // Picks (or reuses) a pad in open ground at the edge, facing `other`. `pin`: a built, reserved pad (your town's shuttle
  // pad) used as is, no search. Pads are landingPad.js's: a raised railed deck with stairs on one side for passengers.
  makePadStop(loc, other, spec, kind, pin = null) {
    const tw = this.toward(loc, other);
    const keeps = this.keepouts(loc);
    const pick = pin ? { x: pin.x, z: pin.z, lo: 0, hi: 0, existing: pin } : this.padSpot(loc, tw, keeps, spec, kind);
    const color = kind === 'ship' ? 0xff9f1c : 0x2ec4ff;
    let rec = pick.existing || null;
    // a settlement's own pad is used if big enough for this rig's deck (the ramp must land on it); else it's replaced
    if (rec && !pin && !(rec.stairs && rec.r >= spec.padR - 0.5)) { this.w.dropPad(loc, rec); rec = null; }
    if (!rec) {
      const face = this.stairFace(loc, pick, spec.padR, keeps.filter((k) => k !== pick.existing));
      rec = this.w.pad(loc, pick.x, pick.z, spec.padR, color, false, { face });
    }
    rec.used = true;
    const top = rec.top, st = rec.stairs;
    loc.stopKeep.push({ x: pick.x, z: pick.z, r: spec.clearR, flyPad: true });
    // waiting shelter on the ground beside the stairs' foot, facing them
    const fx = st.foot.x, fz = st.foot.z, ox = Math.cos(st.face), oz = Math.sin(st.face), sx = -oz, sz = ox;
    let wx = st.out.x + ox * 3, wz = st.out.z + oz * 3;
    for (const [side, along] of [[1, -0.6], [-1, -0.6], [1, 1.5], [-1, 1.5], [1, 3.5], [-1, 3.5]]) {
      const lat = st.w / 2 + 3.6;
      const x = fx + sx * side * lat + ox * along, z = fz + sz * side * lat + oz * along;
      if (keeps.some((k) => k !== pick.existing && k !== rec.keep && Math.hypot(x - k.x, z - k.z) < k.r + 2.5)) continue;
      this.w.toWorld(loc, x, this.groundY(loc, x, z) + 1.5, z, _c);
      if (this.blocked(_c, 2.4)) continue;
      wx = x; wz = z;
      break;
    }
    const yaw = Math.atan2(fx - wx, fz - wz);
    const shelterAt = { x: wx, z: wz, yaw, text: `${kind === 'ship' ? 'FREIGHT' : 'SHUTTLE'} > ${other.short}`, color };
    this.shelter(loc, wx, wz, yaw, shelterAt.text, color);
    loc.stopKeep.push({ x: wx, z: wz, r: 3 });
    const stop = {
      loc, kind: 'pad', x: pick.x, z: pick.z, top, padR: rec.r, shelterAt, stairs: st,
      wait: { x: wx + Math.sin(yaw) * 1.8, y: this.groundY(loc, wx, wz), z: wz + Math.cos(yaw) * 1.8, g: true },
      town: this.townPoint(loc, wx, wz, 70),
      queue: [], queued: false,
    };
    // where people step off the stairs; walks to buildings start here
    stop.origin = { x: st.out.x, z: st.out.z };
    stop.world = this.w.toWorld(loc, pick.x, top, pick.z);
    // landed heading: nose away from the stairs, so the tail ramp comes down toward them
    const head = this.w.toWorld(loc, st.head.x, top, st.head.z), up = stop.world.clone().normalize();
    stop.land = stop.world.clone().sub(head);
    stop.land.addScaledVector(up, -stop.land.dot(up)).normalize();
    this.stops.push(stop);
    return stop;
  }

  // Which way a new pad's stairs run (angle as Math.atan2(z, x)): toward the middle if clear, else the nearest clear way
  // round (nothing solid or kept clear where the flight and its foot stand).
  stairFace(loc, pick, r, keeps) {
    const base = Math.atan2(-pick.z, -pick.x);
    const clear = [];
    for (const off of [0, 0.45, -0.45, 0.9, -0.9, 1.4, -1.4, 2.0, -2.0, 2.6, -2.6, Math.PI]) {
      const a = base + off, ca = Math.cos(a), sa = Math.sin(a);
      let ok = true;
      for (const d of [r + 1.5, r + 4, r + 7]) {
        const x = pick.x + ca * d, z = pick.z + sa * d;
        if (keeps.some((k) => Math.hypot(x - k.x, z - k.z) < k.r + 1)) { ok = false; break; }
        this.w.toWorld(loc, x, this.groundY(loc, x, z) + 1.4, z, _c);
        if (this.blocked(_c, 1.7)) { ok = false; break; }
      }
      if (ok) clear.push({ a, y: this.groundY(loc, pick.x + ca * (r + 4), pick.z + sa * (r + 4)) });
    }
    if (!clear.length) return base;
    // on a slope, stairs on the high side (shorter flight); on the level, toward the middle
    const hi = Math.max(...clear.map((c) => c.y));
    return (hi - clear[0].y > 1.5 ? clear.find((c) => c.y === hi) : clear[0]).a;
  }

  // The deck walk from a flyer's ramp foot to the stairs' head, round the ship's side (not under its belly): out to the
  // stairs' side, along the hull, over. Points in the settlement's frame, on the deck.
  deckRoute(v, stop) {
    const loc = stop.loc, S = stop.stairs, M = v.model || v;
    v.root.updateMatrixWorld(true);
    const toLoc = (x, z) => {
      const p = this.local(loc, v.root.localToWorld(_a.set(x, M.rampBottom.y, z)), new THREE.Vector3());
      // kept inside the railing
      const dx = p.x - stop.x, dz = p.z - stop.z, d = Math.hypot(dx, dz), max = stop.padR - 1.3;
      if (d > max) { p.x = stop.x + (dx / d) * max; p.z = stop.z + (dz / d) * max; }
      return { x: p.x, y: stop.top, z: p.z, g: false };
    };
    const e = v.root.worldToLocal(this.w.toWorld(loc, S.edge.x, S.edge.y, S.edge.z, _b));
    const side = e.x >= 0 ? 1 : -1, W = (M.deck ? M.deck[0] : 3) + 2.4, zb = M.rampBottom.z;
    // landed properly, the ramp faces the stairs: walk straight there
    if (e.z < zb + 1 && Math.abs(e.x) < 3) return [];
    const pts = [toLoc(side * W, zb * 0.85)];
    // along the hull to level with the stairs, if they're forward of the ramp (usual)
    if (e.z > zb * 0.85 + 2) pts.push(toLoc(side * W, Math.min(e.z, -zb * 0.6)));
    return pts;
  }

  // Climb vertically off pad A, arc to cruise, descend over pad B, settle vertically. climb: vertical leg height, a number or [A, B].
  flightPath(sA, sB, gearH, climb, cruise, radius) {
    const P = this.P;
    const [climbA, climbB] = Array.isArray(climb) ? climb : [climb, climb];
    const uA = sA.world.clone().normalize(), uB = sB.world.clone().normalize();
    const start = sA.world.clone().addScaledVector(uA, gearH), topA = sA.world.clone().addScaledVector(uA, gearH + climbA);
    const end = sB.world.clone().addScaledVector(uB, gearH), topB = sB.world.clone().addScaledVector(uB, gearH + climbB);
    const len = arcDist(uA, uB);
    const step = 20, steps = Math.max(4, Math.ceil(len / step));
    const raw = [];
    for (let i = 0; i <= steps; i++) {
      const d = new THREE.Vector3().lerpVectors(uA, uB, i / steps).normalize();
      raw.push({ d, r: P.surface(_a.copy(d).multiplyScalar(P.R)) });
    }
    const rA = topA.length(), rB = topB.length(), ramp = Math.min(len * 0.45, 140 + cruise * 2.5);
    const rad = raw.map((p, i) => {
      let rmax = -Infinity;
      for (let k = -4; k <= 4; k++) rmax = Math.max(rmax, raw[Math.min(steps, Math.max(0, i + k))].r);
      const t = i / steps, fromEnd = Math.min(i, steps - i) * (len / steps);
      const blend = smooth(fromEnd / ramp);
      return Math.max(rA + (rB - rA) * t + cruise * blend, rmax + 6 + cruise * 0.5 * blend);
    });
    rad[0] = rA; rad[steps] = rB;
    // lift over anything solid on the way (domes, towers, cranes, settlements…)
    const req = rad.slice();
    for (let i = 1; i < steps; i++) {
      for (let k = 0; k < 40; k++) {
        if (!this.blocked(_a.copy(raw[i].d).multiplyScalar(req[i]), radius)) break;
        req[i] += 4;
      }
    }
    for (let pass = 0; pass < 6; pass++) {
      for (let i = 1; i < steps; i++) rad[i] = Math.max(req[i], (rad[i - 1] + rad[i] * 2 + rad[i + 1]) / 4);
    }
    const mid = [];
    for (let i = 1; i < steps; i++) mid.push(raw[i].d.clone().multiplyScalar(rad[i]));
    let pts = [start, topA, ...mid, topB, end];
    // round the corners (keeps the vertical legs straight)
    pts = chaikin(pts, 2);
    return makePath(pts);
  }

  // A transit line between two settlements. opts.pinA: its pad at A (makePadStop); opts.startAtB: start parked at B and
  // fly in to A first (a service just opened)
  addFlyer(kind, A, B, opts = {}) {
    const ship = kind === 'ship';
    const n = this.vehicles.length;
    // the rig (models.js) knows its gear height, deck box, ramp path and pad size
    // a freighter's cargo wears the livery of a faction it serves, like the land-trains
    const owners = [A, B].map((l) => l.faction).filter((f) => LAND_TRAIN_FACTIONS[f]);
    const model = ship ? makeFreighter({ stripe: [0xff9f1c, 0xff2e88, 0x2ec4ff][n % 3], faction: owners.length ? owners[n % owners.length] : 'kepler' }) : makeShuttle({ stripe: [0x2ec4ff, 0xff9f1c, 0x7dff6a, 0xc77dff][n % 4] });
    // deck at least the rig's pad size and big enough for the ramp to land inside the railing (a shuttle's ramp reaches
    // 13.3 m, past its 11 m pad)
    const deckR = Math.max(model.padR, Math.hypot(model.rampBottom.x, model.rampBottom.z) + 0.9);
    const spec = ship
      ? { padR: deckR, clearR: Math.max(31, deckR + 2), heights: [3, 10, 20, 32], climb: 36 }
      : { padR: deckR, clearR: Math.max(13, deckR + 1.5), heights: [2, 7, 14], climb: 18 };
    const cruise = ship ? 55 + (n % 3) * 25 : 24;
    const sA = this.makePadStop(A, B, spec, kind, opts.pinA), sB = this.makePadStop(B, A, spec, kind);
    const path = this.flightPath(sA, sB, model.gearH, [opts.pinA ? TOWN_CLIMB : spec.climb, spec.climb], cruise, model.radius);
    model.root.matrixAutoUpdate = true;
    this.w.scene.add(model.root);
    const v = {
      ...model, model, kind, path, hint: { i: 0, f: 0 }, ahint: { i: 0, f: 0 },
      stops: [sA, sB], dir: 1, s: 0, state: 'park', timer: 0, open: 0, gearK: 1, clock: this.r() * 10,
      vmax: ship ? 40 : 26, acc: ship ? 2.2 : 3.2, turn: ship ? 0.45 : 1.0, turnMin: ship ? 22 : 8,
      minWait: ship ? 12 : 6, maxWait: ship ? 34 : 18, pax: ship ? [3, 5] : [1, 3],
      view: ship ? 4200 : 1600, quat: model.root.quaternion, boarding: 0, heading: new THREE.Vector3(),
      pos: new THREE.Vector3(), prevPos: new THREE.Vector3(), vel: new THREE.Vector3(), fwd: new THREE.Vector3(),
    };
    // spread out: some parked at either end, most along the route
    const r = this.r();
    if (r < 0.3) { v.state = 'park'; v.dir = this.r() < 0.5 ? 1 : -1; v.s = v.dir > 0 ? 0 : path.len; v.timer = this.r() * 6; }
    else { v.state = 'fly'; v.dir = this.r() < 0.5 ? 1 : -1; v.s = path.len * (0.15 + this.r() * 0.7); }
    if (opts.startAtB) { v.state = 'park'; v.dir = -1; v.s = path.len; v.timer = 0; }
    v.stop = v.state === 'park' ? (v.s <= 0 ? sA : sB) : null;
    sample(path, v.s, v.pos, v.hint);
    v.prevPos.copy(v.pos);
    // initial heading along the route (parked at A faces B)
    sample(path, v.s + (v.state === 'park' ? (v.s <= 0 ? 80 : -80) : 40 * v.dir), _a, v.ahint);
    v.heading.copy(_a).sub(v.pos);
    const up = _u.copy(v.pos).normalize();
    v.heading.addScaledVector(up, -v.heading.dot(up));
    if (v.heading.lengthSq() < 1e-6) v.heading.set(1, 0, 0);
    v.heading.normalize();
    if (v.stop && v.stop.land) v.heading.copy(v.stop.land); // parked as if landed, ramp toward the stairs
    frameQuat(up, v.heading, model.root.quaternion);
    model.root.position.copy(v.pos);
    v.fwd.copy(v.heading);
    this.vehicles.push(v);
    return v;
  }

  buildFlights() {
    const L = this.L;
    const buses = [['ilmb', 'tranq'], ['ilmb', 'shackleton'], ['ilmb', 'mine'], ['tranq', 'kepler'], ['aldrin', 'twilight'], ['twilight', 'farside'],
      // extra lines: the Kepler winch's favourite thing to hang off
      ['ilmb', 'aldrin'], ['kepler', 'hertz'], ['shackleton', 'meridian'], ['meridian', 'monolith'], ['tranq', 'mine'], ['aldrin', 'kepler']];
    const ships = [['ilmb', 'farside'], ['ilmb', 'hertz'], ['mine', 'twilight'], ['twilight', 'gloom'], ['kepler', 'vostok'], ['meridian', 'aldrin']];
    // ships first: they need the biggest spots
    for (const [a, b] of ships) if (L[a] && L[b]) this.addFlyer('ship', L[a], L[b]);
    for (const [a, b] of buses) if (L[a] && L[b]) this.addFlyer('bus', L[a], L[b]);
    // last, so the lines above don't change: your town's shuttle, once it has the Shuttle Pad
    if (L.hometown && (L.hometown.slots || []).includes('pad')) this.addTownShuttle(L.hometown);
  }

  // Your town's shuttle: a bus from the Shuttle Pad plot to nearestPort (opts as addFlyer). One at most; null with no pad,
  // no port, or the line already running
  addTownShuttle(loc, opts = {}) {
    const pin = (loc.pads || []).find((p) => p.plot !== undefined);
    const port = pin && this.nearestPort(loc);
    if (!port || this.vehicles.some((v) => v.stops && v.stops[0].loc === loc)) return null;
    return this.addFlyer('bus', loc, port, { ...opts, pinA: pin });
  }


  // ================= road network =================
  //
  // Settlements are nodes, roads edges. Each connected settlement gets a two-way ring road just outside its buildings /
  // plateau (pushed out round pads, turret mounts and anything solid); each road runs in radially and joins the ring at a
  // flared T (curved fillets, no stub, no turning loop). Vehicles drive directed "pieces": a lane per road direction
  // ('e'), a lane per direction per ring stretch between junctions ('r'), and junction connectors ('j': onto the ring
  // either way, carry on, or off onto the road out). Each vehicle has a destination town and a route (list of pieces):
  // through traffic follows the ring to the road it needs; traffic for this town pulls in at its one ring-side stop, then
  // carries on round to the next road (no U-turns: a dead-end town is a lap of its ring).

  // Towns that get roads. The casino counts as a town (ring road, punters dropped off); your town once it has built Roads
  // (or is the one being given them).
  townsOnRoads(extra = null) {
    return this.w.locations.filter((l) => l.safe && !l.restricted && (!l.poi || l.type === 'casino') && l.type !== 'pirate'
      && (l.type !== 'hometown' || l === extra || (l.slots || []).includes('roads')));
  }

  // Which towns are joined (a set of 'idA|idB' keys): all within SAFE_ROAD, each town's nearest neighbour, a few second
  // links, then the hand-made cuts and extras.
  linkPairs(safe) {
    const key = pairKey;
    const pairs = new Set();
    const has = (a, b) => pairs.has(key(a, b));
    const dist = (a, b) => arcDist(a.dir, b.dir);
    const near = new Map(safe.map((a) => [a, safe.filter((b) => b !== a).map((b) => ({ b, d: dist(a, b) })).sort((p, q) => p.d - q.d)]));
    for (const a of safe) {
      for (const { b, d } of near.get(a)) if (d < SAFE_ROAD) pairs.add(key(a, b));
      const n0 = near.get(a)[0];
      if (n0 && n0.d < LINK_MAX) pairs.add(key(a, n0.b));
    }
    // a second link where it isn't just a detour of existing ones, so the network has loops
    for (const a of safe) {
      const n1 = near.get(a)[1];
      if (!n1 || n1.d >= LINK_MAX || has(a, n1.b)) continue;
      const detour = safe.some((x) => x !== a && x !== n1.b && has(a, x) && has(x, n1.b) && dist(a, x) + dist(x, n1.b) < 1.3 * n1.d);
      if (!detour) pairs.add(key(a, n1.b));
    }
    for (const [a, b] of CUT_ROADS) if (this.L[a] && this.L[b]) pairs.delete(key(this.L[a], this.L[b]));
    for (const [a, b] of EXTRA_ROADS) if (this.L[a] && this.L[b]) pairs.add(key(this.L[a], this.L[b]));
    return pairs;
  }

  buildRoads() {
    const pairs = this.linkPairs(this.townsOnRoads());
    this.roadGeo = { pos: [], uv: [], fade: [], mark: [], berm: [], soft: [], wid: [], idx: [] };
    this.posts = [];
    this.pieces = [];
    this.mapLines = []; // every road and ring as a polyline of unit directions, for the maps
    this.gates = [];
    this.towns = new Map(); // loc -> gates
    this.rings = new Map(); // loc -> ring profile
    const keys = [...pairs].sort();
    for (const k of keys) for (const id of k.split('|')) if (!this.rings.has(this.L[id])) this.rings.set(this.L[id], this.ringProfile(this.L[id]));
    // roads per town: a link the terrain won't allow is only dropped if both towns keep another
    this.linkCount = new Map();
    for (const k of keys) for (const id of k.split('|')) this.linkCount.set(this.L[id], (this.linkCount.get(this.L[id]) || 0) + 1);
    for (const k of keys) {
      const [a, b] = k.split('|');
      this.buildRoad(this.L[a], this.L[b]);
    }
    this.linkCount = null;
    for (const t of TEES) {
      const [m, n] = t.on.map((id) => this.L[id]);
      const main = this.roads.find((r) => (r.A === m && r.B === n) || (r.A === n && r.B === m));
      if (this.L[t.from] && main) this.buildSpur(this.L[t.from], main);
      else console.warn('[traffic] no road to put a T on for', t.from);
    }
    for (const [loc, R] of this.rings) this.buildRing(loc, R);
    for (const loc of this.w.locations) for (const s of loc.paved || []) this.pavedStrip(loc, s);
    this.pieces.forEach((pc, i) => { pc.id = i; this.finishPiece(pc); });
    for (const R of this.rings.values()) this.ringStop(R);
    for (const R of this.rings.values()) this.garageLink(R);
    this.flushRoadBatch();
    this.roadVehicles = [];
    let civil = 0; // the Vostok road is -1 so the other roads keep their services
    for (const road of this.roads) this.populateRoad(road, road.A.restricted || (road.B && road.B.restricted) ? -1 : civil++);
    this.populateGarage();
  }

  // settlements a road from `loc` joins under the standard rules, in a load's laying order
  linkPartners(loc) {
    const safe = this.townsOnRoads(loc), pairs = this.linkPairs(safe);
    return safe.filter((b) => b !== loc && pairs.has(pairKey(loc, b))).sort((p, q) => (pairKey(loc, p) < pairKey(loc, q) ? -1 : 1));
  }

  // Lays your town's ring and links live when it builds Roads (hometown.js layRoads): the ring a load would make
  // (ringProfile) and its roads (linkPartners, in load order), added to the running network. A settlement nothing joined
  // at boot (Hertzsprung) gets its ring in the same pass. Differs from a load: boot rings have no junction for the new
  // road, so each link ends in a U-turn connector there (ring traffic never turns in), and U-turn roads get no
  // land-trains (they'd fold). The next load lays the full network. Returns { ring, links, roads }, or null if the town
  // has a ring. All or nothing: a failure puts every piece, mesh and vehicle back and throws (except the final tidying).
  addTownRoads(loc) {
    if (this.rings.has(loc)) return null;
    this.registerLocation(loc);
    const partners = this.linkPartners(loc);
    if (!partners.length) return { ring: null, links: [], roads: [] };
    const fresh = partners.filter((b) => !this.rings.has(b));
    // rollback state: network lengths, and what new roads add to each settlement touched (fences, gates, group)
    const was = {
      pieces: this.pieces.length, roads: this.roads.length, gates: this.gates.length, stops: this.stops.length, lines: this.mapLines.length,
      vehicles: this.vehicles.length, crawlers: this.crawlers.length, drivers: this.roadVehicles.length, decks: this.platforms.length, scene: new Set(this.w.scene.children),
      ends: [loc, ...partners].map((l) => ({
        l, towns: this.towns.has(l) ? this.towns.get(l).length : -1, keep: l.stopKeep.length, gates: this.rings.has(l) ? this.rings.get(l).gates.length : -1,
        kids: l.group.children.length, cols: (l._cols || []).length, ring: l.ring, ringStop: l.ringStop,
      })),
    };
    let rings = [], roads = [];
    try {
      for (const l of [loc, ...fresh]) delete l._bld; // current colliders, not those the last passenger saw
      this.roadGeo = { pos: [], uv: [], fade: [], mark: [], berm: [], soft: [], wid: [], idx: [] };
      this.posts = [];
      rings = [loc, ...fresh].map((l) => { const R = this.ringProfile(l); this.rings.set(l, R); return R; });
      for (const k of partners.map((b) => pairKey(loc, b)).sort()) {
        const [a, b] = k.split('|'), P = this.L[a === loc.id ? b : a], RP = this.rings.get(P), all = RP.gates;
        // a load lays this road when the partner's ring has only junctions of roads named before it (and no T), so its end
        // goes where it now chooses. A standing junction of a later road may be in the way: then the end goes to the
        // nearest spot GATE_NEAR from every standing junction
        let near = null;
        if (!fresh.includes(P)) {
          RP.gates = all.filter((e) => e.gate.road.eB && pairKey(e.gate.road.A, e.gate.road.B) < k);
          const at = this.ringGate(RP, loc);
          if (all.some((e) => Math.min(Math.abs(e.i - at.i), RP.M - Math.abs(e.i - at.i)) * RP.step < GATE_NEAR)) { RP.gates = all; near = { loc: P, apart: GATE_NEAR }; }
        }
        const own = RP.gates, m = own.length;
        try { this.buildRoad(this.L[a], this.L[b], near); } finally { RP.gates = all; }
        if (own !== all && own.length > m) all.push(own[m]);
      }
      for (const R of rings) this.buildRing(R.loc, R);
      roads = this.roads.slice(was.roads);
      for (const road of roads) {
        const g = road.A === loc ? road.gates[1] : road.gates[0]; // the partner's end
        if (fresh.includes(g.loc)) continue; // its ring has the junction
        road.uturn = true;
        const u = this.newPiece('j', this.bez(g.inEnd, g.inDir, g.outStart, g.outDir), { town: g.loc, vlim: 6, uturn: true });
        g.in.next = [u];
        u.next = [g.out];
        this.drawJoin(this.rings.get(g.loc), g.e); // a plain T works for cars, not the eye
      }
      for (let i = was.pieces; i < this.pieces.length; i++) { const pc = this.pieces[i]; pc.id = i; this.finishPiece(pc); }
      for (const R of rings) this.ringStop(R);
      this.flushRoadBatch();
      roads.forEach((road) => this.populateRoad(road, this.roads.indexOf(road), !road.uturn));
      this._chunks = null; // maps' road lines
    } catch (e) {
      this.pieces.length = was.pieces; this.roads.length = was.roads; this.gates.length = was.gates; this.stops.length = was.stops; this.mapLines.length = was.lines;
      this.vehicles.length = was.vehicles; this.crawlers.length = was.crawlers; this.roadVehicles.length = was.drivers; this.platforms.length = was.decks;
      for (const o of this.w.scene.children.slice()) if (!was.scene.has(o)) o.removeFromParent(); // road meshes, posts, vehicles, trailers
      for (const w of was.ends) {
        w.l.stopKeep.length = w.keep;
        if (w.towns < 0) this.towns.delete(w.l); else this.towns.get(w.l).length = w.towns;
        if (w.gates < 0) this.rings.delete(w.l); else this.rings.get(w.l).gates.length = w.gates;
        for (const o of w.l.group.children.slice(w.kids)) o.removeFromParent();
        for (const c of (w.l._cols || []).splice(w.cols)) this.C.remove(c);
        w.l.ring = w.ring; w.l.ringStop = w.ringStop;
      }
      this.roadGeo = null; this.posts = null;
      throw e;
    }
    // The roads stand and are driven now. The rest only tidies up, so a fault is just logged (a rock left on a road, a
    // berm left closed at a link's far end).
    for (const road of roads) {
      if (!road.uturn) continue;
      const g = road.A === loc ? road.gates[1] : road.gates[0];
      try { this.openJoin(this.rings.get(g.loc), g.e); } catch (e) { console.warn('[traffic] could not open the ring of', g.loc.id, 'for the road from', loc.id, e); }
    }
    try {
      for (const pc of this.pieces.slice(was.pieces)) for (let i = 0; i < pc.path.pts.length; i += 10) this.P.clearSpot(pc.path.pts[i]); // rocks off the new roads
    } catch (e) { console.warn('[traffic] could not clear the rocks off the new roads', e); }
    return { ring: rings[0], links: partners, roads };
  }

  // Turns what's laid so far (this.roadGeo, this.posts) into meshes: one road mesh and the delineator posts (white with a
  // dark band, amber reflectors both ways, lit cap, clear of the shoulder, every ~110 m: three instanced draws). A load
  // flushes once (this.roadMesh); a live road (addTownRoads) flushes its own batch sharing that material.
  flushRoadBatch() {
    const G = this.roadGeo;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(G.pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(G.uv, 2));
    geo.setAttribute('fade', new THREE.Float32BufferAttribute(G.fade, 1));
    geo.setAttribute('mark', new THREE.Float32BufferAttribute(G.mark, 1));
    geo.setAttribute('berm', new THREE.Float32BufferAttribute(G.berm, 1));
    geo.setAttribute('soft', new THREE.Float32BufferAttribute(G.soft, 1));
    geo.setAttribute('wid', new THREE.Float32BufferAttribute(G.wid, 1));
    geo.setIndex(G.idx);
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, this.roadMesh ? this.roadMesh.material : roadMaterial());
    mesh.matrixAutoUpdate = false;
    mesh.frustumCulled = false;
    mesh.receiveShadow = true;
    mesh.renderOrder = -0.5; // after the terrain, before the rest (roadMaterial)
    this.w.scene.add(mesh);
    if (!this.roadMesh) this.roadMesh = mesh;
    const n = this.posts.length;
    if (n) {
      const postM = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.11, 0.15, 1.8, 6).translate(0, 0.9, 0), toon(0xe8e4f4), n);
      const bandM = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.16, 0.16, 0.34, 6).translate(0, 1.4, 0), toon(0x2a2540), n);
      const lensM = new THREE.InstancedMesh(new THREE.BoxGeometry(0.2, 0.24, 0.46).translate(0, 1.4, 0), glow(0xff9f1c), n);
      const capM = new THREE.InstancedMesh(new THREE.BoxGeometry(0.2, 0.12, 0.2).translate(0, 1.86, 0), glow(0xfff6a8), n);
      const one = new THREE.Vector3(1, 1, 1);
      this.posts.forEach((p, i) => {
        _m4.compose(p.pos, p.q, one);
        for (const m of [postM, bandM, lensM, capM]) m.setMatrixAt(i, _m4);
      });
      for (const m of [postM, bandM, lensM, capM]) { m.frustumCulled = false; m.matrixAutoUpdate = false; this.w.scene.add(m); }
      postM.castShadow = true;
    }
    this.roadGeo = null;
    this.posts = null;
  }

  // every k-th point of a world polyline as a unit direction (the last always kept)
  thin(pts, k) {
    const out = [];
    for (let i = 0; i < pts.length; i += k) out.push(pts[i].clone().normalize());
    if ((pts.length - 1) % k) out.push(pts[pts.length - 1].clone().normalize());
    return out;
  }

  // Road network for the globe and minimap: short polyline runs, each with a bounding cap (c: unit direction, r: m) for
  // culling and fog tests. Built on first use.
  mapChunks() {
    if (this._chunks) return this._chunks;
    const out = [], N = 12, R = this.P.R;
    for (const line of this.mapLines) {
      for (let i = 0; i < line.length - 1; i += N) {
        const pts = line.slice(i, Math.min(line.length, i + N + 1));
        const c = new THREE.Vector3();
        for (const p of pts) c.add(p);
        c.normalize();
        let r = 0;
        for (const p of pts) r = Math.max(r, Math.acos(Math.min(1, c.dot(p))));
        out.push({ pts, c, r: r * R });
      }
    }
    return (this._chunks = out);
  }

  // Can an 18 m road (bed and berms) run over local (x, z)? Exact collider contact tests plus keep-outs.
  roadClear(loc, x, z, keeps) {
    if (keeps.some((k) => Math.hypot(x - k.x, z - k.z) < k.r + 8)) return false;
    const y = this.groundY(loc, x, z);
    for (const h of [2, 5]) {
      this.w.toWorld(loc, x, y + h, z, _c);
      if (this.blocked(_c, 5.5)) return false;
    }
    return true;
  }

  // Ring radius at M even angles round the town: RING_GAP outside the settlement radius (past the buildings, at the
  // plateau's foot), pushed out wherever it'd touch something, bulges eased so the ring stays smooth.
  ringProfile(loc) {
    const TAU = Math.PI * 2;
    const keeps = this.keepouts(loc);
    const Rb = loc.r + RING_GAP;
    const M = Math.max(64, Math.ceil((TAU * Rb) / 4));
    const step = (TAU * Rb) / M;
    const clearAt = (i, r) => { const a = (i / M) * TAU; return this.roadClear(loc, Math.cos(a) * r, Math.sin(a) * r, keeps); };
    const need = (i, r0) => { for (let r = r0; r <= Rb + RING_PUSH; r += 3) if (clearAt(i, r)) return r; return Rb + RING_PUSH; };
    const req = new Float64Array(M);
    for (let i = 0; i < M; i++) req[i] = need(i, Rb);
    let rad = req;
    for (let it = 0; it < 5; it++) {
      rad = Float64Array.from(req);
      // at most ~1 m outward per 2.5 m along, then rounded
      const slope = 0.4 * step;
      for (let pass = 0; pass < 2; pass++) {
        for (let i = 1; i <= 2 * M; i++) { const k = i % M; rad[k] = Math.max(rad[k], rad[(k + M - 1) % M] - slope); }
        for (let i = 2 * M - 1; i >= 0; i--) { const k = i % M; rad[k] = Math.max(rad[k], rad[(k + 1) % M] - slope); }
      }
      for (let pass = 0; pass < 8; pass++) {
        const nx = new Float64Array(M);
        for (let i = 0; i < M; i++) nx[i] = Math.max(req[i], (rad[(i + M - 1) % M] + 2 * rad[i] + rad[(i + 1) % M]) / 4);
        rad = nx;
      }
      // easing a bulge may push neighbours into something else: re-check
      let bad = 0;
      for (let i = 0; i < M; i++) if (rad[i] < Rb + RING_PUSH && !clearAt(i, rad[i])) { req[i] = need(i, rad[i] + 3); bad++; }
      if (!bad) break;
    }
    let blocked = 0;
    for (let i = 0; i < M; i++) if (rad[i] >= Rb + RING_PUSH && !clearAt(i, rad[i])) blocked++;
    if (blocked) console.warn('[traffic] ring at', loc.id, 'still touches something at', blocked, 'samples');
    let maxR = 0;
    for (let i = 0; i < M; i++) maxR = Math.max(maxR, rad[i]);
    return { loc, M, Rb, step, rad, maxR, kd: Math.max(3, Math.round(JOIN / step)), gates: [] };
  }

  ringLocal(R, i) {
    i = ((i % R.M) + R.M) % R.M;
    const a = (i / R.M) * Math.PI * 2, r = R.rad[i];
    return { x: Math.cos(a) * r, z: Math.sin(a) * r, a, r };
  }

  // Where a road from `other` joins this ring: as straight toward it as possible, on an unbulged stretch with open ground
  // outside, clear of other junctions.
  ringGate(R, other, apart = GATE_SEP) {
    const loc = R.loc, M = R.M, TAU = Math.PI * 2;
    const tw = this.toward(loc, other);
    // ignore the ring's own fences, else a road to an existing ring (addTownRoads) finds every spot taken
    const keeps = this.keepouts(loc).filter((k) => !k.ring);
    const sep = (i) => R.gates.every((g) => { const d = Math.abs(g.i - i); return Math.min(d, M - d) * R.step >= apart; });
    const idx = (a) => ((Math.round((a / TAU) * M) % M) + M) % M;
    const kink = (i) => {
      let k = 0;
      for (let j = -R.kd * 2; j <= R.kd * 2; j++) k = Math.max(k, Math.abs(R.rad[(i + j + M) % M] - R.rad[i]));
      return k;
    };
    const outside = (i) => {
      const p = this.ringLocal(R, i), ux = Math.cos(p.a), uz = Math.sin(p.a);
      for (let t = 8; t <= 56; t += 4) if (!this.roadClear(loc, ux * (p.r + t), uz * (p.r + t), keeps)) return false;
      return true;
    };
    // the first 200 m a road leaving here crosses: how steep, and how much crater, rock or rille (roadplan.js)
    const lay = (i) => {
      const p = this.ringLocal(R, i), ux = Math.cos(p.a), uz = Math.sin(p.a);
      let h0 = null, climb = 0, bad = 0;
      for (let t = 0; t <= 200; t += 10) {
        this.w.toWorld(loc, ux * (p.r + t), 0, uz * (p.r + t), _c).normalize();
        const h = this.P.H(_c.x, _c.y, _c.z), a = this.P.attr;
        bad += 10 * a.floor + 6 * a.rim + 3 * a.rock + 2 * a.crest + 8 * a.rille;
        if (h0 !== null) climb += 10 * Math.max(0, Math.abs(h - h0) / 10 - 0.1);
        h0 = h;
      }
      return 40 * climb + bad;
    };
    let best = null;
    for (const dev of [0, 0.06, -0.06, 0.12, -0.12, 0.2, -0.2, 0.3, -0.3, 0.42, -0.42, 0.56, -0.56, 0.72, -0.72, 0.9, -0.9, 1.1, -1.1, 1.35, -1.35]) {
      const i = idx(tw + dev);
      if (!sep(i) || !outside(i)) continue;
      const bulge = R.rad[i] - R.Rb, kk = kink(i), ground = lay(i);
      const score = Math.abs(dev) * 120 + bulge + kk * 3 + Math.min(150, ground * 0.4);
      if (!best || score < best.score) best = { i, score };
      if (bulge < 4 && kk < 2 && ground < 12) break;
    }
    if (!best) {
      // crowded: nearest angle that keeps junctions apart
      for (let k = 0; k < M; k++) {
        const i = idx(tw + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (TAU / M));
        if (sep(i)) { best = { i }; break; }
      }
      console.warn('[traffic] no open ring junction at', loc.id, 'toward', other.id);
      if (!best) best = { i: idx(tw) };
    }
    const p = this.ringLocal(R, best.i);
    return { loc, R, i: best.i, a: p.a, x: p.x, z: p.z, rr: p.r };
  }

  // Visible track: a row of ground-hugging samples across the strip (ROAD_LAT) at a centreline point.
  // `fade` (0..1): melt into an overlapping strip (junction flares, road ends). `mark` (0..1): wheel ruts (none on
  // flares or where roads meet rings). `bermL` / `bermR` (0..1): cut line and berm on the left (-) / right (+) edge.
  // `soft` (1 on a flare) widens the edge fade: where strips overlap only the edge's owner shows a berm.
  stripPush(centre, sideV, s, vScale = 1, fade = 1, mark = 1, bermL = 1, bermR = 1, soft = 0, wid = 1) {
    const G = this.roadGeo;
    for (const o of ROAD_LAT) {
      _b.copy(centre).addScaledVector(sideV, o * vScale);
      this.P.ground(_b, _b, 0.04);
      G.pos.push(_b.x, _b.y, _b.z);
      G.uv.push(o / ROAD_HALF, s);
      G.fade.push(fade);
      G.mark.push(mark);
      G.berm.push(o < 0 ? bermL : o > 0 ? bermR : Math.min(bermL, bermR));
      G.soft.push(soft);
      G.wid.push(wid);
    }
  }

  stripIdx(base, rows) {
    const G = this.roadGeo, n = ROAD_LAT.length;
    for (let i = 0; i < rows - 1; i++) {
      for (let k = 0; k < n - 1; k++) {
        const a = base + i * n + k, b = a + n;
        G.idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  }

  // tangent, right side and arc length along a ground polyline (closed: wraps)
  frames(g, closed = false) {
    const N = g.length - 1, side = [], tan = [], cum = [0];
    for (let i = 0; i <= N; i++) {
      const up = _u.copy(g[i]).normalize();
      const nx = closed ? g[(i + 1) % (N + 1)] : g[Math.min(N, i + 1)];
      const pv = closed ? g[(i + N) % (N + 1)] : g[Math.max(0, i - 1)];
      const t = new THREE.Vector3().subVectors(nx, pv);
      t.addScaledVector(up, -t.dot(up)).normalize();
      tan.push(t);
      side.push(new THREE.Vector3().crossVectors(t, up).normalize());
      if (i) cum.push(cum[i - 1] + g[i].distanceTo(g[i - 1]));
    }
    return { side, tan, cum };
  }

  // `flare`: a junction sweep from a road into a ring or road, road width so its edges meet theirs; berm on the outside
  // of the curve, the inside (facing the next sweep) bare.
  drawLine(g, s0 = 0, vScale = 1, fadeAt = null, flare = false) {
    const { side, cum } = this.frames(g);
    const base = this.roadGeo.pos.length / 3;
    let bL = 0, bR = 0;
    if (flare) {
      const n = g.length - 1, up = new THREE.Vector3().copy(g[n >> 1]).normalize();
      const t0 = new THREE.Vector3().subVectors(g[1], g[0]), t1 = new THREE.Vector3().subVectors(g[n], g[n - 1]);
      // berm on the side the curve turns toward
      if (new THREE.Vector3().crossVectors(t0, t1).dot(up) > 0) bL = 1; else bR = 1;
    }
    for (let i = 0; i < g.length; i++) this.stripPush(g[i], side[i], s0 + cum[i], vScale, fadeAt ? fadeAt(i / (g.length - 1)) : 1, 0, bL, bR, flare ? 1 : 0);
    this.stripIdx(base, g.length);
  }

  newPiece(kind, raw, opts) {
    const pc = { kind, raw, next: [], vehicles: [], vlim: Infinity, ...opts };
    this.pieces.push(pc);
    return pc;
  }

  // cubic from p0 (heading t0) to p1 (arriving along t1), n+1 world points (grounded later)
  bez(p0, t0, p1, t1, n = 10, k = 0.42) {
    const h = p0.distanceTo(p1) * k;
    const c0 = p0.clone().addScaledVector(t0, h), c1 = p1.clone().addScaledVector(t1, -h);
    const out = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, u = 1 - t;
      out.push(new THREE.Vector3()
        .addScaledVector(p0, u * u * u).addScaledVector(c0, 3 * u * u * t)
        .addScaledVector(c1, 3 * u * t * t).addScaledVector(p1, t * t * t));
    }
    return out;
  }

  // a ring gate's road, `extra` m out along the gate's radial
  ringExit(e, extra) {
    return this.w.toWorld(e.loc, Math.cos(e.a) * (e.rr + extra), 0, Math.sin(e.a) * (e.rr + extra)).normalize();
  }

  // Dense ground centreline, a point every ~4 m: leaves the first ring radially, crosses the terrain (avoiding every
  // other ring, military zone and black lake) and arrives along dB2 -> dB1 -> dB. B is null for a T onto another road.
  // Returns { g, dirs, N, side, tan, cum }.
  roadCentreline(A, B, [dA, dA1, dA2], [dB, dB1, dB2]) {
    const P = this.P, R = P.R;
    // avoid every other settlement (and ring), military zone and black lake, and its own rings once it has left them
    const obs = [];
    for (const l of this.w.locations) {
      const ring = this.rings.get(l);
      const r0 = l === A || l === B ? ring.maxR + 18 : Math.max((l.zoneR || l.r) + 55, ring ? ring.maxR + 40 : 0);
      obs.push({ d: l.dir, r: r0 });
    }
    for (const lk of this.w.lakes || []) obs.push({ d: lk.d, r: Math.acos(Math.min(1, lk.cos)) * R + 25 });
    // the line is planned on the real terrain (roadplan.js): round craters, rims, rock and rilles, along gentle slopes.
    // The meander below is the fallback where that finds no way through.
    const laid = [];
    for (const r of this.roads) if (r.geo && r.geo.dirs) laid.push(r.geo.dirs.filter((_, i) => i % 3 === 0));
    const mid = dA2.clone().add(dB2).normalize(), reach = Math.cos((arcDist(dA2, dB2) / 2 + 700) / R);
    const plan = planRoad(P, dA2, dB2, obs, laid.map((l) => l.filter((q) => q.dot(mid) > reach)).filter((l) => l.length));
    if (plan) {
      const ctrl = [dA, dA1, ...plan.dirs, dB1, dB];
      const curve = new THREE.CatmullRomCurve3(ctrl.map((d) => d.clone().multiplyScalar(R)), false, 'centripetal');
      const total = curve.getLength();
      const N = Math.max(8, Math.ceil(total / 4));
      const dirs = curve.getSpacedPoints(N).map((p) => p.normalize());
      const g = dirs.map((d) => P.ground(d, new THREE.Vector3()));
      const { side, tan, cum } = this.frames(g);
      // over a fifth on grades past ~14°, or a third on rock, rille or crater floor: unsuitable (buildRoad may drop it)
      const q = roadQuality(P, dirs, cum);
      return { g, dirs, N, side, tan, cum, planned: plan, quality: q, unsuitable: q.steep > UNSUITABLE_STEEP || q.off > UNSUITABLE_OFF };
    }
    // fallback: a gently meandering great circle
    const len = arcDist(dA2, dB2);
    const n = Math.max(3, Math.ceil(len / 30));
    const rr = mulberry32(Math.floor(len * 7) + A.id.length * 131 + (B ? B.id.length * 17 : 53));
    const ph1 = rr() * 6.28, ph2 = rr() * 6.28, f1 = Math.max(1, Math.round(len / 900)), f2 = Math.max(2, Math.round(len / 330));
    const axis = new THREE.Vector3().crossVectors(dA2, dB2).normalize();
    const ctrl = [dA, dA1, dA2];
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const d = new THREE.Vector3().lerpVectors(dA2, dB2, t).normalize();
      const env = smooth(t * len / 150) * smooth((1 - t) * len / 150);
      const off = env * (40 * Math.sin(Math.PI * 2 * f1 * t + ph1) + 12 * Math.sin(Math.PI * 2 * f2 * t + ph2));
      d.addScaledVector(axis, off / R).normalize();
      ctrl.push(d);
    }
    ctrl.push(dB2, dB1, dB);
    for (let it = 0; it < 60; it++) {
      for (let i = 3; i < ctrl.length - 3; i++) {
        const p = ctrl[i];
        for (const o of obs) {
          const dist = arcDist(p, o.d);
          if (dist >= o.r) continue;
          _a.copy(p).sub(o.d);
          _a.addScaledVector(p, -_a.dot(p));
          if (_a.lengthSq() < 1e-12) _a.copy(axis);
          _a.normalize();
          p.addScaledVector(_a, ((o.r - dist) * 0.6 + 1) / R).normalize();
        }
      }
      for (let i = 3; i < ctrl.length - 3; i++) {
        _a.copy(ctrl[i - 1]).add(ctrl[i + 1]).multiplyScalar(0.25).addScaledVector(ctrl[i], 0.5);
        ctrl[i].copy(_a.normalize());
      }
    }
    // dense centreline every ~4 m on the ground
    const curve = new THREE.CatmullRomCurve3(ctrl.map((d) => d.clone().multiplyScalar(R)), false, 'centripetal');
    const total = curve.getLength();
    const N = Math.max(8, Math.ceil(total / 4));
    const dirs = curve.getSpacedPoints(N).map((p) => p.normalize());
    const g = dirs.map((d) => P.ground(d, new THREE.Vector3()));
    const { side, tan, cum } = this.frames(g);
    return { g, dirs, N, side, tan, cum };
  }

  // A centreline's strip, posts and keep-outs. `ends`: [loc, atStart] towns; their pads and shelters stay off the first
  // stretch out.
  layRoad(line, ends) {
    const { g, dirs, N, side, tan, cum } = line;
    const P = this.P;
    this.mapLines.push(this.thin(g, 5));
    // stops just short of each ring's centreline (the ring strip covers the join)
    let i0 = 0, i1 = N;
    while (i0 < N && cum[i0] < 2.5) i0++;
    while (i1 > 0 && cum[N] - cum[i1] < 2.5) i1--;
    const base = this.roadGeo.pos.length / 3;
    for (let i = i0; i <= i1; i++) {
      const e = Math.min(cum[i], cum[N] - cum[i]);
      const b = smooth((e - 22) / 4); // berms run to where the sweeps start (24 m out), which carry them on
      this.stripPush(g[i], side[i], cum[i], 1, smooth((e - 2.5) / 7), smooth((e - 12) / 16), b, b);
    }
    this.stripIdx(base, i1 - i0 + 1);
    line.strip = { base, i0, i1 };
    // delineator posts every ~110 m, alternating sides
    for (let s = 60, k = 0; s < cum[N] - 60; s += 110, k++) {
      let i = 0;
      while (i < N && cum[i] < s) i++;
      const p = g[i].clone().addScaledVector(side[i], k % 2 ? 10 : -10);
      P.ground(p, p);
      this.posts.push({ pos: p, q: frameQuat(dirs[i], tan[i], new THREE.Quaternion()) });
    }
    // pads and shelters stay off the first stretch out of each town
    for (const [loc, from] of ends) {
      for (let k = 0; k <= N && (from ? cum[k] : cum[N] - cum[N - k]) < 90; k += 2) {
        const p = this.local(loc, g[from ? k : N - k], _a);
        loc.stopKeep.push({ x: p.x, z: p.z, r: 10 });
      }
    }
  }

  buildRoad(A, B, near = null) {
    const RA = this.rings.get(A), RB = this.rings.get(B);
    const eA = this.ringGate(RA, B, near && near.loc === A ? near.apart : GATE_SEP);
    RA.gates.push(eA);
    const eB = this.ringGate(RB, A, near && near.loc === B ? near.apart : GATE_SEP);
    RB.gates.push(eB);
    const dA = this.ringExit(eA, 0), dA1 = this.ringExit(eA, 24), dA2 = this.ringExit(eA, 52), dB = this.ringExit(eB, 0), dB1 = this.ringExit(eB, 24), dB2 = this.ringExit(eB, 52);
    const line = this.roadCentreline(A, B, [dA, dA1, dA2], [dB, dB1, dB2]);
    // a link the terrain won't allow (a rocky ridge or crater wall in the way) is dropped if both towns keep another road
    const lc = this.linkCount;
    if (line.unsuitable && lc && lc.get(A) > 1 && lc.get(B) > 1) {
      RA.gates.pop(); RB.gates.pop();
      lc.set(A, lc.get(A) - 1); lc.set(B, lc.get(B) - 1);
      (this.droppedLinks ||= []).push([A.id, B.id, line.quality]);
      console.info('[traffic] no way for a road from', A.id, 'to', B.id, '(', Math.round(line.quality.steep * 100), '% steep,', Math.round(line.quality.off * 100), '% rock or crater ): left out');
      return null;
    }
    this.layRoad(line, [[A, true], [B, false]]);
    const { g, N, side, cum } = line;
    // ---- lanes: right-hand traffic; the last ~20 m at each end belong to the junctions ----
    const step = cum[N] / N;
    const K = Math.max(2, Math.round(JOIN_OUT / step));
    const ab = [], ba = [];
    for (let i = 0; i <= N; i++) ab.push(g[i].clone().addScaledVector(side[i], LANE));
    for (let i = N; i >= 0; i--) ba.push(g[i].clone().addScaledVector(side[i], -LANE));
    const road = { A, B, eA, eB, len: cum[N] };
    // centreline out of each ring (for the fillets), inward directions at the lane ends
    const clA = g.slice(0, K * 2 + 2), clB = g.slice(N - K * 2 - 1).reverse();
    const gA = { loc: A, other: B, e: eA, road, cl: clA }, gB = { loc: B, other: A, e: eB, road, cl: clB };
    const pAB = this.newPiece('e', ab.slice(K, N + 1 - K), { from: gA, to: gB, fromLoc: A, toLoc: B, road });
    const pBA = this.newPiece('e', ba.slice(K, N + 1 - K), { from: gB, to: gA, fromLoc: B, toLoc: A, road });
    gA.out = pAB; gA.in = pBA; gB.in = pAB; gB.out = pBA;
    const dir = (p, q) => q.clone().sub(p).normalize();
    gB.inEnd = ab[N - K]; gB.inDir = dir(ab[N - K - 1], ab[N - K]);
    gA.inEnd = ba[N - K]; gA.inDir = dir(ba[N - K - 1], ba[N - K]);
    gA.outStart = ab[K]; gA.outDir = dir(ab[K], ab[K + 1]);
    gB.outStart = ba[K]; gB.outDir = dir(ba[K], ba[K + 1]);
    eA.gate = gA; eB.gate = gB;
    road.lanes = [pAB, pBA];
    road.gates = [gA, gB];
    road.geo = { ...line, step, K, ab, ba, pAB, pBA, gA, gB };
    for (const gt of [gA, gB]) {
      if (!this.towns.has(gt.loc)) this.towns.set(gt.loc, []);
      this.towns.get(gt.loc).push(gt);
      this.gates.push(gt);
    }
    this.roads.push(road);
  }

  // A road from town A ending in a T on `main` (another road), side-on at main's point nearest the town. Main's lanes are
  // cut there (far halves keep the ring gates) and connectors carry the turns: each main lane goes on or turns down the
  // spur, the spur turns either way onto main. Routing is by piece links, so traffic just splits at the T.
  buildSpur(A, main) {
    const R = this.P.R, G = main.geo, N0 = G.N;
    if (!this.rings.has(A)) this.rings.set(A, this.ringProfile(A));
    const RA = this.rings.get(A);
    // the meeting point: nearest the town, well clear of both ends
    _b.copy(A.dir).multiplyScalar(R);
    let jx = -1, bd = Infinity;
    for (let i = 0; i <= N0; i++) {
      if (G.cum[i] < 200 || G.cum[N0] - G.cum[i] < 200) continue;
      const d = G.g[i].distanceToSquared(_b);
      if (d < bd) { bd = d; jx = i; }
    }
    if (jx < 0) { console.warn('[traffic] no room for a T on the road to', A.id); return; }
    const X = G.g[jx];
    // arrives from the town's side
    const perp = G.side[jx].clone();
    if (perp.dot(_a.copy(_b).sub(X)) < 0) perp.negate();
    const at = (d) => X.clone().addScaledVector(perp, d).normalize();
    const dirX = X.clone().normalize();
    const eA = this.ringGate(RA, { id: 'T', dir: dirX });
    RA.gates.push(eA);
    const line = this.roadCentreline(A, null, [this.ringExit(eA, 0), this.ringExit(eA, 24), this.ringExit(eA, 52)], [dirX, at(24), at(52)]);
    this.layRoad(line, [[A, true]]);
    // main's berm on the spur side would cross the spur's mouth: it stops where the sweeps meet it (24 m either side) and
    // they carry it into the spur
    {
      const st = G.strip, GG = this.roadGeo, n = ROAD_LAT.length, spurSide = perp.dot(G.side[jx]) > 0 ? 1 : -1;
      for (let i = st.i0; i <= st.i1; i++) {
        const b = smooth((Math.abs(G.cum[i] - G.cum[jx]) - 12) / 10);
        if (b >= 1) continue;
        for (let k = 0; k < n; k++) {
          if (Math.sign(ROAD_LAT[k]) !== spurSide) continue;
          const at = st.base + (i - st.i0) * n + k;
          GG.berm[at] = Math.min(GG.berm[at], b);
        }
      }
    }
    const { g, N, side, cum } = line;
    const step = cum[N] / N;
    const K = Math.max(2, Math.round(JOIN_OUT / step));
    const Ke = Math.max(3, Math.ceil(T_ARM / step)); // lanes stop this far short of the T
    const ab = g.map((p, i) => p.clone().addScaledVector(side[i], LANE)); // town -> T
    const ba = []; // T -> town
    for (let i = N; i >= 0; i--) ba.push(g[i].clone().addScaledVector(side[i], -LANE));
    const dir = (p, q) => q.clone().sub(p).normalize();
    const road = { A, B: main.A, eA, eB: null, len: cum[N] };
    const gA = { loc: A, other: main.A, e: eA, road, cl: g.slice(0, K * 2 + 2) };
    const pIn = this.newPiece('e', ab.slice(K, N + 1 - Ke), { from: gA, to: null, fromLoc: A, toLoc: A, road });
    const pOut = this.newPiece('e', ba.slice(Ke, N + 1 - K), { from: null, to: gA, fromLoc: A, toLoc: A, road });
    gA.out = pIn; gA.in = pOut;
    gA.inEnd = ba[N - K]; gA.inDir = dir(ba[N - K - 1], ba[N - K]);
    gA.outStart = ab[K]; gA.outDir = dir(ab[K], ab[K + 1]);
    eA.gate = gA;
    road.lanes = [pIn, pOut];
    road.gates = [gA];
    if (!this.towns.has(A)) this.towns.set(A, []);
    this.towns.get(A).push(gA);
    this.gates.push(gA);
    this.roads.push(road);

    // ---- the main road, cut at the T (m steps either side of the centre) ----
    const m = Math.max(3, Math.ceil(T_ARM / G.step));
    const kb = N0 - jx - m, ka = N0 - jx + m; // indices into ba, which runs the other way
    const opts = (p) => ({ from: p.from, to: p.to, fromLoc: p.fromLoc, toLoc: p.toLoc, road: main });
    const pAB2 = this.newPiece('e', G.ab.slice(jx + m, N0 + 1 - G.K), opts(G.pAB));
    const pBA2 = this.newPiece('e', G.ba.slice(ka, N0 + 1 - G.K), opts(G.pBA));
    G.pAB.raw = G.ab.slice(G.K, jx - m + 1);
    G.pBA.raw = G.ba.slice(G.K, kb + 1);
    G.gA.in = pBA2; G.gB.in = pAB2; // the far halves arrive at the rings now
    main.lanes = [G.pAB, pAB2, G.pBA, pBA2];
    // straight through, and four turns
    const thAB = this.newPiece('j', G.ab.slice(jx - m, jx + m + 1), { vlim: 11 });
    const thBA = this.newPiece('j', G.ba.slice(kb, ka + 1), { vlim: 11 });
    const ein = ab[N - Ke], din = dir(ab[N - Ke - 1], ab[N - Ke]); // spur lane arriving
    const eout = ba[Ke], dout = dir(ba[Ke], ba[Ke + 1]); // spur lane leaving
    const turn = (p0, t0, p1, t1) => this.newPiece('j', this.bez(p0, t0, p1, t1), { vlim: 7 });
    const abEnd = G.ab[jx - m], baEnd = G.ba[kb], abStart = G.ab[jx + m], baStart = G.ba[ka];
    const abEndT = dir(G.ab[jx - m - 1], abEnd), baEndT = dir(G.ba[kb - 1], baEnd);
    const abStartT = dir(abStart, G.ab[jx + m + 1]), baStartT = dir(baStart, G.ba[ka + 1]);
    const offAB = turn(abEnd, abEndT, eout, dout), offBA = turn(baEnd, baEndT, eout, dout);
    const onAB = turn(ein, din, abStart, abStartT), onBA = turn(ein, din, baStart, baStartT);
    G.pAB.next = [thAB, offAB]; G.pBA.next = [thBA, offBA];
    thAB.next = [pAB2]; thBA.next = [pBA2];
    offAB.next = [pOut]; offBA.next = [pOut];
    pIn.next = [onAB, onBA];
    onAB.next = [pAB2]; onBA.next = [pBA2];
    // drawn flares either side where the spur meets the road
    const cl = g.slice(N - K * 2 - 1).reverse();
    let k = 1;
    while (k < cl.length - 1 && cl[k].distanceTo(cl[0]) < FILLET) k++;
    const q = cl[k], tIn = cl[k - 1].clone().sub(cl[k]).normalize();
    const mf = Math.max(2, Math.round(FILLET / G.step));
    for (const d of [1, -1]) {
      const j = jx + d * mf;
      this.drawLine(this.bez(q, tIn, G.g[j], G.tan[j].clone().multiplyScalar(d), 10, 0.5), 0, 1, (t) => smooth(t / 0.3) * smooth((1 - t) / 0.3), true);
    }
  }

  // The Meridian Exchange's garage road. The main garage (settlements.js garage(), `loc.garage`) stands inside the ring,
  // bays facing it. A regolith forecourt runs from the plinth across the whole front (hall and office), flaring into the
  // ring like a bell-mouth, berms on its outer edges. A rover leaves the open bay, drives straight out and turns right
  // onto the ring's inner lane (town on its right), becoming a road buggy. This lays the strips and the rover's path;
  // buildRing calls it before drawing the ring (so the inner berm makes way) and makes the piece at its end.
  garageRoad(loc, R, W, side, tan) {
    const G = loc.garage, H = GARAGE_HALL.main, bx = GARAGE_BAYS.main[G.bay], M = R.M, step = R.step, din = R.din;
    const c = Math.cos(G.yaw), sn = Math.sin(G.yaw);
    const L2W = (lx, lz) => this.P.ground(this.w.toWorld(loc, G.x + lx * c + lz * sn, 0, G.z - lx * sn + lz * c), new THREE.Vector3());
    const wrap = (i) => ((i % M) + M) % M;
    const lane = (i) => W[wrap(i)].clone().addScaledVector(side[wrap(i)], LANE * din);
    const LZ0 = H.hz + 0.6;                                                       // plinth's front edge, where the road meets it
    const S0 = L2W(bx, LZ0), u = L2W(bx, LZ0 + 1).sub(S0).normalize();            // and the way out
    // where the road's line meets the ring's inner lane
    let i0 = 0, best = Infinity, tLane = 0;
    for (let i = 0; i < M; i++) {
      const q = lane(i).sub(S0), t = q.dot(u);
      if (t <= 0) continue;
      const lat = q.addScaledVector(u, -t).length();
      if (lat < best) { best = lat; i0 = i; tLane = t; }
    }
    // merges onto the lane `m` steps further on, like an on-ramp: at least 40 m and clear of junctions (arcs start `kd`
    // steps out). The road stays inside the ring, so a road leaving the ring there is no obstacle.
    const gi = R.gates.map((e) => e.i);
    const clear = (i) => gi.every((g) => { const d = Math.abs(g - wrap(i)); return Math.min(d, M - d) >= R.kd + Math.ceil(14 / step); });
    let m = Math.max(2, Math.round(40 / step));
    while (m * step < 120 && !clear(i0 + din * m)) m++;
    if (!clear(i0 + din * m)) console.warn('[traffic] the garage road meets the ring at a junction');
    const j = i0 + din * m, Q = lane(j), T = tan[wrap(j)].clone().multiplyScalar(din);
    const RAD = 22; // curve's reach in from the ring (m)
    const S1 = S0.clone().addScaledVector(u, Math.max(2, tLane - RAD));
    // rover's path (right-hand lane): from inside the bay, out the door, along the road, round the curve to the ring
    const A = L2W(bx, -5), D0 = L2W(bx, H.hz - 0.4);
    const dense = (a, b, out, gap = 2.5) => { const n = Math.max(1, Math.ceil(a.distanceTo(b) / gap)); for (let k = 1; k <= n; k++) out.push(a.clone().lerp(b, k / n)); };
    const raw = [A];
    dense(A, D0, raw); dense(D0, S0, raw);
    const iS0 = raw.length - 1;                      // the road proper starts at S0 (the plinth before it)
    dense(S0, S1, raw);
    const iS1 = raw.length - 1;
    for (const p of this.bez(S1, u, Q, T, 14, 0.55).slice(1)) raw.push(p);
    const lenOf = (pts, a, b) => { let L = 0; for (let k = a + 1; k <= b; k++) L += pts[k].distanceTo(pts[k - 1]); return L; };

    // ---- forecourt: a wide bed across the front, from under the plinth to the ring's inner lane ----
    // x across the front, z out from it; edges run straight out from the compound's front corners, then bend along the
    // ring's inner edge (a quarter-ellipse each side). The shader is told the bed's width (`wid`).
    const FX0 = -27.6, FX1 = 33.2;                   // edges at the garage, the compound's (build_garage.py): past the pump island left, the side lane's railing right
    const TIP0 = -47, TIP1 = 44;                     // edges by the ring (the right stops short of the casino road's junction)
    const zA = H.hz + 0.2, zEnd = LZ0 + tLane - 1;   // from under the plinth into the ring's bed, which melts it in
    const sideAt = (z) => L2W(1, z).sub(L2W(0, z)).normalize();
    const N = 18;
    const fc = { x0: TIP0, x1: TIP1 };               // widest, where it meets the ring
    const baseF = this.roadGeo.pos.length / 3;
    for (let k = 0; k <= N; k++) {
      const th = (k / N) * Math.PI / 2, z = zA + (zEnd - zA) * Math.sin(th), e = 1 - Math.cos(th);
      const xl = FX0 + (TIP0 - FX0) * e, xr = FX1 + (TIP1 - FX1) * e;
      const centre = L2W((xl + xr) / 2, z), sv = sideAt(z), h = (xr - xl) / 2;
      const fade = smooth((zEnd - z) / 5);
      const berm = smooth((zEnd - 3.5 - z) / 3);
      this.stripPush(centre, sv, z - zA, h / 7.3, fade, 0, berm, berm, 0, h / 7.3);
    }
    this.stripIdx(baseF, N + 1);

    // ---- compound yard (build_garage.py): the same bed without ruts behind the hall (back yard, rover park) and down the
    // side lane past the office. The back yard's hall-side edge has no berm (it runs under the plinth, bund and power
    // slab, and across the lane) ----
    this.bedStrip(L2W(-22.6, -19.3), L2W(33.8, -19.3), 8.7, { bR: 0 });           // x -22 to 33, z -28 to -10.6; right edge is the hall's side
    this.bedStrip(L2W(30.3, H.hz + 1.0), L2W(30.3, -H.hz - 2.0), 2.9);           // x 27.4 to 33.2, forecourt into the back yard

    // ---- rover's road: the same line as a sweep, melting in from the forecourt and out into the ring ----
    // strip centre a lane's width left of the line, so the rover keeps right
    const path = raw.slice(iS0).map((p) => this.P.ground(p.clone(), new THREE.Vector3()));
    const { side: ps, cum } = this.frames(path);
    const total = cum[path.length - 1], straight = cum[iS1 - iS0];
    const base = this.roadGeo.pos.length / 3;
    for (let k = 0; k < path.length; k++) {
      const centre = path[k].clone().addScaledVector(ps[k], -LANE);
      const s = cum[k];
      const fade = smooth(s / 22) * smooth((total - s) / 10);
      const soft = smooth((s - straight * 0.8) / (total - straight * 0.8 + 1e-3));
      this.stripPush(centre, ps[k], s, 1, fade, smooth((s - 8) / 12) * smooth((total - s - 8) / 10), 0, 0, Math.max(0.7, soft));
    }
    this.stripIdx(base, path.length);
    // forecourt stays free of pads and shelters
    for (let lx = fc.x0; lx <= fc.x1; lx += 12) {
      for (let lz = zA; lz <= zEnd; lz += 12) {
        const p = this.local(loc, L2W(lx, lz), _a);
        loc.stopKeep.push({ x: p.x, z: p.z, r: 8 });
      }
    }
    for (let k = 0; k < path.length; k += 2) { const p = this.local(loc, path[k], _a); loc.stopKeep.push({ x: p.x, z: p.z, r: 10 }); }
    // a ring point in the garage's frame (the ring's berm makes way where the forecourt flares in)
    const toGarage = (wp) => { const q = this.local(loc, wp, _a), dx = q.x - G.x, dz = q.z - G.z; return { lx: dx * c - dz * sn, lz: dx * sn + dz * c }; };
    return { i0, j, Q, raw, fc, toGarage, lead: Math.ceil(11 / step), trail: m + Math.ceil(14 / step), polyLen: lenOf(raw, 0, raw.length - 1), hallLen: lenOf(raw, 0, 0) + A.distanceTo(L2W(bx, H.hz)), plinthAt: A.distanceTo(L2W(bx, LZ0)), piece: null };
  }

  // A wide rutless bed of road soil along a straight ground line (world a to b), `hw` m either side (a yard, a lot), fading
  // over `fadeIn` / `fadeOut` m at the ends; `bL` / `bR`: berm on the left / right edge (0 under something or at another bed).
  bedStrip(a, b, hw, { fadeIn = 1.5, fadeOut = 1.5, bL = 1, bR = 1 } = {}) {
    const n = Math.max(2, Math.ceil(a.distanceTo(b) / 4)), g = [];
    for (let i = 0; i <= n; i++) g.push(this.P.ground(a.clone().lerp(b, i / n), new THREE.Vector3()));
    const { side, cum } = this.frames(g), total = cum[n], k = hw / 7.3, base = this.roadGeo.pos.length / 3;
    for (let i = 0; i <= n; i++) this.stripPush(g[i], side[i], cum[i], k, smooth(cum[i] / fadeIn) * smooth((total - cum[i]) / fadeOut), 0, bL, bR, 0, k);
    this.stripIdx(base, n + 1);
  }

  // A straight road inside a settlement's grounds (`loc.paved`: { x0, z0, x1, z1 } in its frame, e.g. the Meridian
  // Exchange's avenue from plaza to gate arch): bed, ruts and berms, melting in at both ends. Laid after the rings;
  // nothing drives on it.
  pavedStrip(loc, spec) {
    let { x0, z0, x1, z1 } = spec;
    // a road out to the ring runs a little past where the join's sweeps start (inletFor), at full strength
    const e = spec.ring ? (this.rings.get(loc)?.inlets || []).find((q) => q.spec === spec) : null;
    if (e) { x1 = x0 + e.ux * (e.tq + 8); z1 = z0 + e.uz * (e.tq + 8); }   // 8 m past the sweeps' start, berms fading, so no bare ground shows between
    const n = Math.max(2, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 4));
    const g = [];
    for (let i = 0; i <= n; i++) g.push(this.P.ground(this.w.toWorld(loc, x0 + ((x1 - x0) * i) / n, 0, z0 + ((z1 - z0) * i) / n), new THREE.Vector3()));
    const { side, cum } = this.frames(g), total = cum[n];
    const base = this.roadGeo.pos.length / 3;
    for (let i = 0; i <= n; i++) {
      const s = cum[i];
      const bf = e ? 1 - smooth((s - e.tq) / 4) : 1;
      this.stripPush(g[i], side[i], s, 1, smooth(s / 8) * (e ? 1 : smooth((total - s) / 8)), smooth((s - 6) / 10) * (e ? Math.min(1, smooth((e.tq - s) / 6 + 0.5)) : smooth((total - s - 6) / 10)), bf, bf, 0);
    }
    this.stripIdx(base, n + 1);
  }

  // Where a paved road (`spec`, settlement frame, straight toward (x1, z1)) meets ring R, as a gate for drawJoin: `i` the
  // ring point, `gate.cl` the centreline back from the ring in 4 m steps, `tq` where the sweeps start along the road
  // (FILLET short of the ring), `ux, uz` its direction.
  inletFor(loc, R, spec) {
    const dx = spec.x1 - spec.x0, dz = spec.z1 - spec.z0, len = Math.hypot(dx, dz), ux = dx / len, uz = dz / len;
    let bi = -1, bd = Infinity;
    for (let i = 0; i < R.M; i++) {
      const p = this.ringLocal(R, i);
      if ((p.x - spec.x0) * ux + (p.z - spec.z0) * uz < len * 0.3) continue;       // the ring's far side, not the near one
      const d = Math.abs((p.x - spec.x0) * uz - (p.z - spec.z0) * ux);
      if (d < bd) { bd = d; bi = i; }
    }
    const T = this.ringLocal(R, bi), t0 = (T.x - spec.x0) * ux + (T.z - spec.z0) * uz;
    const pt = (t) => this.P.ground(this.w.toWorld(loc, spec.x0 + ux * t, 0, spec.z0 + uz * t), new THREE.Vector3());
    const cl = [];
    for (let k = 0; k <= 14; k++) cl.push(pt(t0 - 4 * k));
    let kq = 1;
    while (kq < cl.length - 1 && cl[kq].distanceTo(cl[0]) < FILLET) kq++;
    return { i: bi, gate: { cl }, spec, ux, uz, tq: t0 - 4 * kq };
  }

  // After the ring's pieces are finished: link the garage piece onto the lane arc it meets and lift the rover's path over
  // the garage floor (raised on its plinth; the road meets the plinth's edge).
  garageLink(R) {
    const gj = R.garageJoin;
    if (!gj || !gj.piece || !gj.piece.path) return;
    const M = R.M, dirn = R.din, jw = ((gj.j % M) + M) % M;
    const host = (R.arcs[dirn] || []).find((pc) => {
      const n = Math.abs(pc.i1 - pc.i0), off = dirn > 0 ? (((jw - pc.i0) % M) + M) % M : (((pc.i0 - jw) % M) + M) % M;
      return off <= n && pc.path;
    });
    if (!host) { console.warn('[traffic] the garage road found no ring lane to join'); gj.piece = null; return; }
    let bi = 0, bd = Infinity;
    host.path.pts.forEach((p, k) => { const d = p.distanceToSquared(gj.Q); if (d < bd) { bd = d; bi = k; } });
    const gp = gj.piece;
    gp.next = [host];
    gp.joinTo = host;
    gp.joinS = host.path.cum[bi];
    // up inside the hall and over the plinth's lip, then down to the road
    const k = gp.len / Math.max(1, gj.polyLen);
    const sR0 = gj.plinthAt * k, sR1 = sR0 + 1.5 * k;
    gp.path.pts.forEach((p, n) => {
      const s = gp.path.cum[n];
      const lift = s <= sR0 ? GARAGE_FLOOR : s <= sR1 ? GARAGE_FLOOR * (1 - (s - sR0) / (sR1 - sR0)) : 0;
      if (lift > 0) p.addScaledVector(_u.copy(p).normalize(), lift);
    });
  }

  // flared join of road end `e` (a gate of ring R): a curved fillet each side, road centreline -> ring centreline
  drawJoin(R, e) {
    const M = R.M, cl = e.gate.cl, wrap = (i) => ((i % M) + M) % M;
    let k = 1;
    while (k < cl.length - 1 && cl[k].distanceTo(cl[0]) < FILLET) k++;
    const q = cl[k], tIn = cl[k - 1].clone().sub(cl[k]).normalize();
    const m = Math.max(2, Math.round(FILLET / R.step));
    for (const d of [1, -1]) {
      const j = e.i + d * m;
      this.drawLine(this.bez(q, tIn, R.W[wrap(j)], R.tan[wrap(j)].clone().multiplyScalar(d), 10, 0.5), 0, 1, (t) => smooth(t / 0.3) * smooth((1 - t) / 0.3), true);
    }
  }

  // A road reaching an already-drawn ring (addTownRoads, partner's end): the ring's outer berm and ruts make way as
  // buildRing does for known junctions (same fall-offs, never raising). The ring's strip is in the first road mesh.
  openJoin(R, e) {
    const A = this.roadMesh.geometry.attributes, n = ROAD_LAT.length, M = R.M, outer = R.din > 0 ? -1 : 1;
    for (let i = 0; i <= M; i++) {
      const d = Math.abs(e.i - (i % M)), dg = Math.min(d, M - d) * R.step;
      if (dg >= 38) continue;
      const b = smooth((dg - 12) / 10), mk = smooth((dg - 24) / 14);
      for (let k = 0; k < n; k++) {
        const at = R.stripBase + i * n + k;
        A.mark.array[at] = Math.min(A.mark.array[at], mk);
        if (ROAD_LAT[k] === 0 || Math.sign(ROAD_LAT[k]) === outer) A.berm.array[at] = Math.min(A.berm.array[at], b);
      }
    }
    A.mark.needsUpdate = A.berm.needsUpdate = true;
  }

  // the ring: one closed strip, a flared join per road, lanes and junction connectors
  buildRing(loc, R) {
    const P = this.P, M = R.M, kd = R.kd;
    const W = [];
    for (let i = 0; i < M; i++) { const p = this.ringLocal(R, i); W.push(P.ground(this.w.toWorld(loc, p.x, 0, p.z), new THREE.Vector3())); }
    const { side, tan } = this.frames(W, true);
    R.W = W; R.side = side; R.tan = tan;
    this.mapLines.push(this.thin([...W, W[0]], Math.max(1, Math.round(20 / (R.step || 10)))));
    const wrap = (i) => ((i % M) + M) % M;
    // which way round has the town on its right (the stop's lane); roads join on the outer edge
    const c0 = this.w.toWorld(loc, 0, 0, 0);
    R.din = side[0].dot(_a.copy(c0).sub(W[0])) > 0 ? 1 : -1;
    // paved roads out to the ring (`loc.paved` with `ring`: the casino's car-park roads): where they meet it, for the sweeps
    R.inlets = (loc.paved || []).filter((s) => s.ring).map((s) => this.inletFor(loc, R, s));
    // the Meridian Exchange's garage road: laid first so the ring's inner berm can stop for it
    const gj = loc.garage ? this.garageRoad(loc, R, W, side, tan) : null;
    R.garageJoin = gj;
    // closed strip (the last row repeats the first)
    {
      const base = this.roadGeo.pos.length / 3;
      R.stripBase = base; // openJoin finds the rows by it
      let s = 0;
      for (let i = 0; i <= M; i++) {
        if (i) s += W[wrap(i)].distanceTo(W[i - 1]);
        // no ruts ~30 m either side of a junction (the sweeps take over); the outer berm resumes from 12 m out,
        // overlapping the sweeps' end
        let dg = Infinity;
        for (const e of R.gates) { const d = Math.abs(e.i - wrap(i)); dg = Math.min(dg, Math.min(d, M - d) * R.step); }
        const b = smooth((dg - 12) / 10);
        let bi = 1, mk = smooth((dg - 24) / 14); // inner berm and ruts, cut where the garage road comes in
        if (gj) {
          let k = R.din * (wrap(i) - gj.i0);
          k = ((k + M * 1.5) % M) - M * 0.5; // steps along the lane from where the road's line meets it (ahead positive)
          const gd = Math.max(-gj.lead - k, k - gj.trail, 0) * R.step;
          bi = smooth((gd - 3) / 8);
          mk = Math.min(mk, smooth((gd - 6) / 10));
          // the forecourt's berms take over its flared edges; the ring's stops short
          const q = gj.toGarage(W[wrap(i)]);
          if (q.lz > 0) bi = Math.min(bi, 1 - smooth(Math.min(q.lx - gj.fc.x0 - 2, gj.fc.x1 - 2 - q.lx) / 6));
        }
        let di = Infinity;
        for (const e of R.inlets) { const d = Math.abs(e.i - wrap(i)); di = Math.min(di, Math.min(d, M - d) * R.step); }
        bi = Math.min(bi, smooth((di - 12) / 10));
        mk = Math.min(mk, smooth((di - 24) / 14));
        this.stripPush(W[wrap(i)], side[wrap(i)], s, 1, 1, mk, R.din > 0 ? b : bi, R.din > 0 ? bi : b);
      }
      this.stripIdx(base, M + 1);
    }
    const lane = (d, i) => W[wrap(i)].clone().addScaledVector(side[wrap(i)], LANE * d);
    const laneT = (d, i) => tan[wrap(i)].clone().multiplyScalar(d);
    const gates = R.gates.sort((p, q) => p.i - q.i);
    const n = gates.length;
    loc.ring = { radius: Math.round(R.Rb), max: Math.round(R.maxR), gates: n };
    // flared joins
    for (const e of gates) this.drawJoin(R, e);
    for (const e of R.inlets) this.drawJoin(R, e);
    // delineator posts outside the ring, away from junctions
    const outSide = -R.din;
    const near = (i, list, dist) => list.some((gi) => { const d = Math.abs(gi - i); return Math.min(d, M - d) * R.step < dist; });
    const postEvery = Math.max(8, Math.round(95 / R.step));
    for (let i = 0; i < M; i += postEvery) {
      if (near(i, gates.map((e) => e.i), 34)) continue;
      const p = W[i].clone().addScaledVector(side[i], 10 * outSide);
      P.ground(p, p);
      this.posts.push({ pos: p, q: frameQuat(W[i].clone().normalize(), tan[i], new THREE.Quaternion()) });
    }
    // pads (laid after the roads) keep off the ring (tagged so ringGate ignores them)
    for (let i = 0; i < M; i += 2) { const p = this.ringLocal(R, i); loc.stopKeep.push({ x: p.x, z: p.z, r: 10, ring: true }); }
    if (!n) return;
    // ---- pieces ----
    const span = (d, from, to) => { const out = []; for (let i = from; d > 0 ? i <= to : i >= to; i += d) out.push(lane(d, i)); return out; };
    const arcP = [], arcM = [];
    for (let k = 0; k < n; k++) {
      const c = gates[k].i, c1 = k + 1 < n ? gates[k + 1].i : gates[0].i + M;
      arcP.push(this.newPiece('r', span(1, c + kd, c1 - kd), { town: loc, ring: R, dirn: 1, i0: c + kd, i1: c1 - kd, vlim: 11 }));
      arcM.push(this.newPiece('r', span(-1, c1 - kd, c + kd), { town: loc, ring: R, dirn: -1, i0: c1 - kd, i1: c + kd, vlim: 11 }));
    }
    for (let k = 0; k < n; k++) {
      const e = gates[k], gt = e.gate, c = e.i;
      const opt = { town: loc, gate: gt, vlim: 7 };
      const entP = this.newPiece('j', [gt.inEnd, ...this.bez(gt.inEnd, gt.inDir, lane(1, c + kd), laneT(1, c + kd)).slice(1)], opt);
      const entM = this.newPiece('j', [gt.inEnd, ...this.bez(gt.inEnd, gt.inDir, lane(-1, c - kd), laneT(-1, c - kd)).slice(1)], opt);
      const exP = this.newPiece('j', this.bez(lane(1, c - kd), laneT(1, c - kd), gt.outStart, gt.outDir), opt);
      const exM = this.newPiece('j', this.bez(lane(-1, c + kd), laneT(-1, c + kd), gt.outStart, gt.outDir), opt);
      const thP = this.newPiece('j', span(1, c - kd, c + kd), { ...opt, vlim: 11 });
      const thM = this.newPiece('j', span(-1, c + kd, c - kd), { ...opt, vlim: 11 });
      const prev = (k + n - 1) % n;
      gt.in.next = [entP, entM];
      entP.next = [arcP[k]]; thP.next = [arcP[k]];
      entM.next = [arcM[prev]]; thM.next = [arcM[prev]];
      exP.next = [gt.out]; exM.next = [gt.out];
      arcP[prev].next = [thP, exP];
      arcM[k].next = [thM, exM];
      Object.assign(gt, { entP, entM, exP, exM, thP, thM });
    }
    R.arcs = { 1: arcP, [-1]: arcM };
    if (gj) gj.piece = this.newPiece('j', gj.raw, { town: loc, vlim: 9, garage: true });
  }

  // smooth the corners (ends fixed so pieces join exactly), drop to the ground, smooth the normals
  finishPiece(pc) {
    const P = this.P;
    let pts = pc.raw;
    if (pc.kind !== 'e') {
      const dense = [pts[0]];
      for (let i = 1; i < pts.length; i++) {
        const k = Math.max(1, Math.round(pts[i].distanceTo(pts[i - 1]) / 2));
        for (let j = 1; j <= k; j++) dense.push(pts[i - 1].clone().lerp(pts[i], j / k));
      }
      pts = dense;
      for (let pass = 0; pass < 8; pass++) {
        const nx = pts.map((p, i) => (i === 0 || i === pts.length - 1 ? p : p.clone().multiplyScalar(0.5).addScaledVector(pts[i - 1], 0.25).addScaledVector(pts[i + 1], 0.25)));
        pts = nx;
      }
    }
    const nor = [];
    for (const p of pts) { const nn = new THREE.Vector3(); P.ground(p, p); P.surface(p, nn); nor.push(nn); }
    // smoothed terrain normals leaned toward radial up, so vehicles don't jitter on facets
    const M = nor.length;
    pc.normals = nor.map((_, i) => {
      const s = new THREE.Vector3();
      for (let k = -3; k <= 3; k++) s.add(nor[Math.min(M - 1, Math.max(0, i + k))]);
      return s.normalize().lerp(pts[i].clone().normalize(), 0.3).normalize();
    });
    pc.path = makePath(pts);
    pc.len = pc.path.len;
    pc.raw = null;
  }

  // The town's stop: one shelter and sign on the town side of the ring, on a stretch long enough for a land-train, on
  // open ground, as close to the buildings as possible.
  ringStop(R) {
    const loc = R.loc, M = R.M, d = R.din;
    if (!R.arcs) return;
    const keeps = [...this.keepouts(loc, false), ...loc.stopKeep.filter((k) => k.flyPad)]; // a late ring avoids pads laid before it
    const bl = this.buildings(loc);
    const wrap = (i) => ((i % M) + M) % M;
    let best = null;
    for (const pc of R.arcs[d]) {
      const n = Math.abs(pc.i1 - pc.i0);
      const lo = Math.ceil(STOP_IN / R.step), hi = n - Math.ceil(16 / R.step);
      for (let j = lo; j <= hi; j += 2) {
        const i = wrap(pc.i0 + d * j);
        if (R.garageJoin) { // not where the garage road comes in
          let kk = R.din * (i - R.garageJoin.i0);
          kk = ((kk + M * 1.5) % M) - M * 0.5;
          if (kk > -R.garageJoin.lead - Math.ceil(24 / R.step) && kk < R.garageJoin.trail + Math.ceil(24 / R.step)) continue;
        }
        const p = this.ringLocal(R, i);
        // shelter 12 m in from the centreline (clear of a land-train in the stop lane, 6.5 m out)
        const ux = Math.cos(p.a), uz = Math.sin(p.a);
        const sx = p.x - ux * 12, sz = p.z - uz * 12;
        if (keeps.some((k) => Math.hypot(sx - k.x, sz - k.z) < k.r + 2.5)) continue;
        this.w.toWorld(loc, sx, this.groundY(loc, sx, sz) + 1.5, sz, _c);
        if (this.blocked(_c, 2.4)) continue;
        let db = 200;
        for (const b of bl) db = Math.min(db, Math.hypot(b.x - sx, b.z - sz) - (b.r || Math.max(b.hx, b.hz)));
        const score = (p.r - R.Rb) * 2 + Math.max(0, db) * 0.6;
        if (!best || score < best.score) best = { pc, i, sx, sz, score };
      }
    }
    if (!best) {
      // nowhere ideal: middle of the longest stretch
      const pc = R.arcs[d].reduce((p, q) => (q.len > p.len ? q : p));
      const i = wrap(pc.i0 + d * Math.round(Math.abs(pc.i1 - pc.i0) * 0.6));
      const p = this.ringLocal(R, i);
      best = { pc, i, sx: p.x - Math.cos(p.a) * 12, sz: p.z - Math.sin(p.a) * 12 };
      console.warn('[traffic] no open shelter spot on the ring at', loc.id);
    }
    const pc = best.pc, path = pc.path;
    // arc length on the lane nearest the chosen ring sample
    const target = R.W[best.i].clone().addScaledVector(R.side[best.i], LANE * d);
    let bi = 0, bd = Infinity;
    for (let k = 0; k < path.pts.length; k++) { const dd = path.pts[k].distanceToSquared(target); if (dd < bd) { bd = dd; bi = k; } }
    const s = path.cum[bi];
    const p = path.pts[bi].clone();
    const sL = this.local(loc, p, new THREE.Vector3());
    const { sx, sz } = best;
    const yaw = Math.atan2(sL.x - sx, sL.z - sz);
    const names = (this.towns.get(loc) || []).map((g) => g.other.short);
    const text = `ROADS > ${names.slice(0, 3).join(' ')}${names.length > 3 ? ' +' : ''}`;
    const shelterAt = { x: sx, z: sz, yaw, text, color: 0xff9f1c }; // redress rebuilds it after an in-place rebuild
    this.shelter(loc, sx, sz, yaw, text, shelterAt.color);
    loc.stopKeep.push({ x: sx, z: sz, r: 3 });
    const wait = { x: sx + Math.sin(yaw) * 1.8, y: this.groundY(loc, sx, sz), z: sz + Math.cos(yaw) * 1.8, g: true };
    const r = Math.hypot(sx, sz) || 1;
    pc.stop = {
      loc, kind: 'road', piece: pc, s, world: p, wait, origin: wait, shelterAt,
      town: this.townPoint(loc, sx - (sx / r) * 4, sz - (sz / r) * 4, 90),
      queue: [], queued: false,
    };
    R.stop = pc.stop;
    loc.ringStop = pc.stop;
    loc.ring.stop = Math.round(Math.atan2(best.sz, best.sx) * 57.3);
    this.stops.push(pc.stop);
  }

  // ---------- routing ----------

  // pieces after `from` to reach town `dest`'s stop lane (Dijkstra over lane lengths)
  route(from, dest) {
    const target = dest && dest.ringStop && dest.ringStop.piece;
    if (!target) return null;
    const N = this.pieces.length;
    const d = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1), done = new Uint8Array(N);
    for (const nx of from.next) { d[nx.id] = nx.len; prev[nx.id] = -2; }
    for (;;) {
      let bi = -1, bd = Infinity;
      for (let i = 0; i < N; i++) if (!done[i] && d[i] < bd) { bd = d[i]; bi = i; }
      if (bi < 0) return null;
      done[bi] = 1;
      const pc = this.pieces[bi];
      if (pc === target) {
        const out = [];
        for (let i = bi; i >= 0; i = prev[i]) out.unshift(this.pieces[i]);
        return out;
      }
      for (const nx of pc.next) if (bd + nx.len < d[nx.id]) { d[nx.id] = bd + nx.len; prev[nx.id] = bi; }
    }
  }

  // a new destination: a neighbouring town half the time, else anywhere on the network
  pickDest(v) {
    const here = v.piece.kind === 'e' ? v.piece.toLoc : v.piece.town;
    // Vostok supply trains only work their own road, end to end
    if (v.shuttle) return v.piece.kind === 'e' && v.shuttle.includes(here) ? here : v.shuttle.find((l) => l !== here) || v.shuttle[0];
    // nobody else drives into a restricted zone
    const towns = [...this.towns.keys()].filter((l) => l !== here && l.ringStop && !l.restricted);
    const nbrs = (this.towns.get(here) || []).map((g) => g.other).filter((l) => l.ringStop && !l.restricted);
    const list = nbrs.length && this.r() < 0.5 ? nbrs : towns;
    return list[Math.floor(this.r() * list.length)] || here;
  }

  plan(v, dest) {
    v.dest = dest || this.pickDest(v);
    const st = v.dest.ringStop;
    // already on the stop lane, short of the shelter: just pull in
    if (st && v.piece === st.piece && v.s < st.s - 1) { v.plan = []; return; }
    v.plan = this.route(v.piece, v.dest) || [];
  }

  move(v, pc) {
    if (v.piece) { const i = v.piece.vehicles.indexOf(v); if (i >= 0) v.piece.vehicles.splice(i, 1); }
    v.piece = pc;
    if (pc) pc.vehicles.push(v);
  }

  // A road's service and livery: the faction of the towns it joins (alternating where two meet; Kepler orange if none).
  // The Prospector runs roads to the Helium-3 exchange and half the rest; the Moonliner the others. (The Vostok road has
  // its own pair, below.)
  trainSpec(road, k) {
    const ends = [road.A, road.B].filter(Boolean);
    const owners = ends.map((l) => l.faction).filter((f) => LAND_TRAIN_FACTIONS[f]);
    const faction = owners.length ? owners[(k >> 1) % owners.length] : 'kepler';
    const type = ends.some((l) => l.type === 'industrial') || (k >> 1) % 2 ? 'prospector' : 'moonliner';
    const cars = type === 'moonliner' ? ['pax', 'pax', 'pax'] : FREIGHT[(k >> 1) % FREIGHT.length];
    return { faction, type, cars };
  }

  // A land-train, two hover-cars and a buggy per road, each with a destination. The road into a restricted base
  // (Vostok-9) has only that faction's two trains (Moonliner and Prospector), exchange to bastion and back, one per lane.
  populateRoad(road, k, trains = true) {
    const military = k < 0;
    const add = (v, lane) => {
      const pc = road.lanes[lane === undefined ? Math.floor(this.r() * road.lanes.length) : lane];
      Object.assign(v, {
        piece: null, s: pc.len * (0.1 + this.r() * 0.8), plan: [], hist: [], dest: null, cur: 0, state: 'drive', timer: 0,
        pos: new THREE.Vector3(), prevPos: new THREE.Vector3(), vel: new THREE.Vector3(), fwd: new THREE.Vector3(),
        hintF: { i: 0, f: 0 }, hintR: { i: 0, f: 0 }, hover: 0, smokeT: 0, roll: 0,
      });
      this.move(v, pc);
      this.plan(v);
      this.roadVehicles.push(v);
      return v;
    };
    // land-trains in the colours of the faction whose towns the road joins
    const base = [road.A, road.B].find((l) => l && l.restricted);
    const specs = military
      ? [{ faction: base.faction, type: 'moonliner', cars: ['pax', 'pax', 'pax'] }, { faction: base.faction, type: 'prospector', cars: FREIGHT[0] }]
      : [this.trainSpec(road, k)];
    (trains ? specs : []).forEach((spec, n) => {
      const lt = makeLandTrain(spec);
      this.w.scene.add(lt.root);
      for (const t of lt.trailers) this.w.scene.add(t.root);
      const train = add({
        ...lt, kind: 'landtrain', vmax: 11, acc: 1.4, front: 4.6, tail: 4.4 + lt.trailers.length * 9.9, waitT: spec.type === 'moonliner' ? 16 : 12,
        quat: lt.root.quaternion, view: 1200, radius: 6, boarding: 0, wheelR: 1.2, shuttle: military ? [road.A, road.B] : null,
        pax: spec.type === 'moonliner' ? [1, 3] : null, hp: TRAIN_HP, maxHp: TRAIN_HP, hitR: 4.8, credits: 60,
      }, military ? n : undefined);
      train.trailers.forEach((t, i) => {
        t.offset = 4.3 + 1.6 + 4.0 + i * 9.9;
        t.hintF = { i: 0, f: 0 }; t.hintR = { i: 0, f: 0 };
        t.plat = { pos: new THREE.Vector3(), prevPos: new THREE.Vector3(), vel: new THREE.Vector3(), decks: t.decks, quat: t.root.quaternion };
        this.platforms.push(t.plat);
      });
      this.vehicles.push(train);
    });
    if (military) return;
    // hover-cars hop over slower traffic instead of queueing (the jar can scoop these)
    // one in the road faction's livery, one in a civilian paint
    const carFaction = this.trainSpec(road, k).faction;
    for (let i = 0; i < 2; i++) {
      const m = makeHoverCar(i === 0 ? { faction: carFaction } : { paint: k });
      m.root.matrixAutoUpdate = true;
      this.w.scene.add(m.root);
      const v = add({ ...m, kind: 'car', vmax: 22 + this.r() * 6, acc: 4, front: 2.4, tail: 2.4, waitT: 4, deck: [1.7, 1.3, 3.6], deckY: 0, quat: m.root.quaternion, view: 800, radius: 3.3, hoverH: 1.9, hp: CAR_HP, maxHp: CAR_HP, hitR: 3.5, credits: 30, bobPh: this.r() * 6.28 });
      this.vehicles.push(v);
    }
    // buggy (crawler): queues behind slower traffic
    const b = add({ ...this.makeBuggyRig(k), kind: 'buggy', vmax: 12 + this.r() * 3, acc: 2.5, front: 3.4, tail: 3.4, waitT: 6, view: 900, wheelR: 1.1, hp: BUGGY_HP, maxHp: BUGGY_HP, hitR: 3.4, credits: 25 });
    this.crawlers.push(b);
  }

  // a road buggy added to the scene; k picks colour and driver
  makeBuggyRig(k) {
    const r = buildBuggyRig(k);
    this.w.scene.add(r.root);
    return r;
  }

  // Garage rovers (garageRoad): two buggies taking turns out of the open bay and onto the ring as ordinary buggies. After
  // a while, unseen, they go home and wait their turn.
  populateGarage() {
    const R = [...this.rings.values()].find((q) => q.garageJoin && q.garageJoin.piece && q.garageJoin.piece.joinTo);
    if (!R) return;
    const loc = R.loc;
    this.garage = { loc, piece: R.garageJoin.piece, rovers: [] };
    for (let i = 0; i < 2; i++) {
      const rig = this.makeBuggyRig(90 + i);
      rig.root.visible = false;
      const v = Object.assign(rig, {
        kind: 'buggy', vmax: 12 + this.r() * 3, acc: 2.5, front: 3.4, tail: 3.4, waitT: 6, view: 900, wheelR: 1.1, hp: BUGGY_HP, maxHp: BUGGY_HP, hitR: 3.4, credits: 25,
        piece: null, s: 0, plan: [], hist: [], dest: null, cur: 0, state: 'bay', timer: 0,
        pos: new THREE.Vector3(), prevPos: new THREE.Vector3(), vel: new THREE.Vector3(), fwd: new THREE.Vector3(),
        hintF: { i: 0, f: 0 }, hintR: { i: 0, f: 0 }, hover: 0, smokeT: 0, roll: 0,
        garage: true, spawnT: 6 + i * 22, retireT: 0,
      });
      this.garage.rovers.push(v);
      this.roadVehicles.push(v);
      this.crawlers.push(v);
    }
  }

  // per frame: a waiting rover rolls out when the Exchange is active and the road clear; one out a while and unseen
  // goes back
  updateGarage(dt) {
    const G = this.garage;
    if (!G) return;
    for (const v of G.rovers) {
      if (v.state === 'bay') {
        v.spawnT -= dt;
        if (v.spawnT > 0 || !G.loc.active || G.piece.vehicles.length) continue;
        this.move(v, G.piece);
        v.s = 3; v.hist = []; v.plan = []; v.cur = 1; v.state = 'drive'; v.roll = 0; v.hp = v.maxHp; v.wreckT = 0;
        v.retireT = 70 + this.r() * 60;
        this.char(v, false);
        this.plan(v);
      } else if (v.state === 'drive' && v.piece && v.piece !== G.piece) {
        v.retireT -= dt;
        if (v.retireT <= 0 && !v.root.visible) {
          this.move(v, null);
          v.state = 'bay'; v.cur = 0; v.spawnT = 15 + this.r() * 25; v.root.visible = false;
        }
      }
    }
  }

  // ================= passengers =================

  figure() {
    let f = this.pool.find((p) => !p.busy);
    if (!f) {
      if (this.pool.length >= 40) return null;
      const pal = [0xff9f1c, 0xff7ad9, 0x2ec4ff, 0xffd23f, 0x7dff6a, 0xc77dff, 0xffffff, 0xff3b5c];
      const k = this.pool.length;
      f = makeFigure({ suit: pal[k % pal.length], helmet: k % 3 ? 0xfff4e0 : 0xffd23f, scale: k % 7 === 3 ? 0.62 : 1 });
      f.phase = k * 1.7;
      this.pool.push(f);
    }
    f.busy = true;
    return f;
  }

  release(wk) {
    wk.fig.busy = false;
    wk.fig.root.removeFromParent();
    if (wk.board && wk.owner && !wk.counted) { wk.owner.boarding = Math.max(0, wk.owner.boarding - 1); wk.counted = true; }
    wk.done = true;
  }

  // civilians.js takes over this passenger (blasted or panicking): retire the walker and settle stop / boarding
  // bookkeeping, but keep the pool figure busy until civilians.js frees it
  detach(wk) {
    if (wk.stop) wk.stop.queue = wk.stop.queue.filter((q) => q !== wk);
    if (wk.board && wk.owner && !wk.counted) { wk.owner.boarding = Math.max(0, wk.owner.boarding - 1); wk.counted = true; }
    wk.done = true;
  }

  walker(loc, pts, opts) {
    const fig = this.figure();
    if (!fig) return null;
    loc.group.add(fig.root);
    fig.root.visible = true;
    fig.root.position.set(pts[0].x, pts[0].y, pts[0].z);
    const wk = { fig, loc, pts, seg: 0, t: 0, delay: 0, speed: 1.6 + Math.random() * 0.5, done: false, ...opts };
    if (wk.board && wk.owner) wk.owner.boarding++;
    this.walkers.push(wk);
    return wk;
  }

  stopNear(stop) { return stop.loc.active && stop.world.distanceTo(this.cam) < PAX_RANGE; }

  // a settlement's buildings as walk targets (local frame), from its static colliders
  buildings(loc) {
    if (loc._bld) return loc._bld;
    const out = [];
    const list = this.C.query(this.w.toWorld(loc, 0, 0, 0), loc.r * 1.15 + 10, []);
    for (const c of list) {
      if (c.platform) continue;
      const cl = this.local(loc, c.c, new THREE.Vector3());
      if (Math.hypot(cl.x, cl.z) > loc.r * 1.15) continue;
      if (c.type === 'box') {
        const ay = _a.copy(c.ay).transformDirection(loc._inv);
        if (Math.abs(ay.y) < 0.9 || c.hy < 1.2 || Math.max(c.hx, c.hz) < 2 || Math.min(c.hx, c.hz) < 0.8 || cl.y - c.hy > 1.5) continue;
        const ax = _b.copy(c.ax).transformDirection(loc._inv), az = _d.copy(c.az).transformDirection(loc._inv);
        const lx = Math.hypot(ax.x, ax.z) || 1, lz = Math.hypot(az.x, az.z) || 1;
        out.push({ c, type: 'box', x: cl.x, z: cl.z, ax: [ax.x / lx, ax.z / lx], az: [az.x / lz, az.z / lz], hx: c.hx, hz: c.hz });
      } else if (c.type === 'sphere') {
        if (c.r < 4 || cl.y > c.r * 0.5) continue;
        out.push({ c, type: 'round', x: cl.x, z: cl.z, r: Math.sqrt(Math.max(1, c.r * c.r - cl.y * cl.y)) });
      } else if (c.type === 'cyl') {
        if (c.r < 2.5) continue;
        out.push({ c, type: 'round', x: cl.x, z: cl.z, r: c.r });
      }
    }
    loc._bld = out;
    return out;
  }

  // door on building b's wall facing point o (local frame)
  door(b, o, jitter) {
    const rx = o.x - b.x, rz = o.z - b.z;
    if (b.type === 'round') {
      const d = Math.hypot(rx, rz) || 1;
      const a = Math.atan2(rz, rx) + jitter * 0.25;
      return { x: b.x + Math.cos(a) * (b.r + 0.35), z: b.z + Math.sin(a) * (b.r + 0.35), d };
    }
    const da = rx * b.ax[0] + rz * b.ax[1], dz = rx * b.az[0] + rz * b.az[1];
    const alongX = Math.abs(da) / b.hx > Math.abs(dz) / b.hz;
    const n = alongX ? b.ax : b.az, t = alongX ? b.az : b.ax;
    const h = alongX ? b.hx : b.hz, w = alongX ? b.hz : b.hx;
    const sg = (alongX ? da : dz) >= 0 ? 1 : -1;
    const lat = jitter * w * 0.45;
    return { x: b.x + n[0] * sg * (h + 0.35) + t[0] * lat, z: b.z + n[1] * sg * (h + 0.35) + t[1] * lat };
  }

  // is a straight walk p -> q clear of colliders (ignoring the target building)?
  walkClear(loc, p, q, ignore) {
    const L = Math.hypot(q.x - p.x, q.z - p.z), n = Math.ceil(L / 1.5);
    for (let i = 1; i <= n; i++) {
      const t = Math.min(i / n, Math.max(0, 1 - 0.6 / L));
      const x = p.x + (q.x - p.x) * t, z = p.z + (q.z - p.z) * t;
      this.w.toWorld(loc, x, this.groundY(loc, x, z) + 1.0, z, _c);
      this.C.query(_c, 0.5, this._buf);
      for (const c of this._buf) if (c !== ignore && !c.platform && this.C.contact(c, _c, 0.45, _n) > 0) return false;
    }
    return true;
  }

  // straight segments from o to the door, stepping round one obstacle if needed
  planWalk(loc, o, d, ignore) {
    if (this.walkClear(loc, o, d, ignore)) return [d];
    const L = Math.hypot(d.x - o.x, d.z - o.z) || 1;
    const px = -(d.z - o.z) / L, pz = (d.x - o.x) / L;
    for (const f of [0.5, 0.3, 0.7]) {
      for (const off of [5, -5, 10, -10, 16, -16, 24, -24]) {
        const w = { x: o.x + (d.x - o.x) * f + px * off, z: o.z + (d.z - o.z) * f + pz * off };
        if (this.walkClear(loc, o, w, null) && this.walkClear(loc, w, d, ignore)) return [w, d];
      }
    }
    return null;
  }

  // up to 8 reachable building doors near a stop (cached; colliders are static)
  doorsFor(stop) {
    if (stop.doors) return stop.doors;
    const loc = stop.loc, o = stop.origin;
    const bl = this.buildings(loc)
      .map((b) => ({ b, d: Math.hypot(b.x - o.x, b.z - o.z) }))
      .filter((e) => e.d < 200)
      .sort((p, q) => p.d - q.d)
      .slice(0, 24);
    const doors = [];
    let k = 0;
    for (const { b } of bl) {
      if (doors.length >= 8) break;
      const d = this.door(b, o, ((k++ * 0.618) % 1) * 2 - 1);
      this.w.toWorld(loc, d.x, this.groundY(loc, d.x, d.z) + 1, d.z, _c);
      this.C.query(_c, 0.6, this._buf);
      if (this._buf.some((c) => c !== b.c && !c.platform && this.C.contact(c, _c, 0.5, _n) > 0)) continue;
      const path = this.planWalk(loc, o, d, b.c);
      if (path) doors.push(path.map((p) => ({ x: p.x, y: this.groundY(loc, p.x, p.z), z: p.z, g: true })));
    }
    stop.doors = doors;
    return doors;
  }

  // boarders appear as the vehicle comes in: most walk out of a building, a few already wait at the shelter
  queueBoarders(stop, v) {
    if (stop.queued || !this.stopNear(stop)) return;
    stop.queued = true;
    const doors = this.doorsFor(stop);
    const n = v.pax[0] + Math.floor(Math.random() * (v.pax[1] - v.pax[0] + 1));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, rr = Math.random() * 1.6;
      const p = { x: stop.wait.x + Math.cos(a) * rr, y: stop.wait.y, z: stop.wait.z + Math.sin(a) * rr, g: true };
      let wk;
      if (doors.length && Math.random() < 0.75) {
        const path = doors[Math.floor(Math.random() * doors.length)];
        const pts = [...path].reverse().map((q) => ({ ...q }));
        pts.push({ ...stop.origin, g: true, y: this.groundY(stop.loc, stop.origin.x, stop.origin.z) }, p);
        wk = this.walker(stop.loc, pts, { hold: true, stop, delay: Math.random() * 3 });
      } else {
        wk = this.walker(stop.loc, [p], { idle: true, stop });
        if (wk) wk.fig.root.rotation.y = Math.random() * 6;
      }
      if (wk) stop.queue.push(wk);
    }
  }

  // doors open: some get off and head for a building, the queue walks up the ramp
  exchange(v, stop) {
    if (!this.stopNear(stop)) { stop.queue.forEach((wk) => this.release(wk)); stop.queue = []; stop.queued = false; return; }
    const loc = stop.loc;
    v.root.updateMatrixWorld(true);
    const pt = (lp, ground) => {
      const p = this.local(loc, v.root.localToWorld(_a.copy(lp)), new THREE.Vector3());
      return { x: p.x, y: ground ? this.groundY(loc, p.x, p.z) : p.y, z: p.z, g: !!ground };
    };
    let door;
    if (v.kind === 'landtrain') {
      const tr = v.trailers.find((t) => t.kind === 'pax') || v.trailers[0];
      tr.root.updateMatrixWorld(true);
      const lp = (x, y) => {
        const p = this.local(loc, tr.root.localToWorld(_a.set(x, y, 0)), new THREE.Vector3());
        return { x: p.x, y: y > 0.5 ? p.y : this.groundY(loc, p.x, p.z), z: p.z, g: y <= 0.5 };
      };
      door = [lp(-0.6, 1.9), lp(-1.9, 1.9), lp(-3.6, 0)];
    } else {
      // flyers' ramps end on the pad deck, not the ground
      const bottom = pt(v.rampBottom, false);
      bottom.y = stop.top; bottom.g = false;
      door = [pt(v.inside, false), pt(v.rampTop, false), bottom];
    }
    // off a pad: round the ship to the stairs, down to the foot (stop.origin), then to a building
    let down = [];
    if (stop.kind === 'pad' && stop.stairs) {
      const S = stop.stairs;
      const around = this.deckRoute(v, stop);
      // the deck-edge point only if it's between the ramp's foot and the stairs
      const bottom = door[door.length - 1], past = Math.hypot(bottom.x - stop.x, bottom.z - stop.z) > stop.padR - 1.6;
      down = [...around, ...(around.length || !past ? [{ ...S.edge, g: false }] : []), { ...S.head, g: false }, { ...S.foot, g: false }];
    }
    const doors = this.doorsFor(stop);
    const nOff = v.pax[0] + Math.floor(Math.random() * (v.pax[1] - v.pax[0] + 1));
    for (let i = 0; i < nOff; i++) {
      const via = down.map((p) => ({ ...p }));
      via.push({ ...stop.origin, y: this.groundY(loc, stop.origin.x, stop.origin.z), g: true });
      let dest;
      if (doors.length) dest = doors[Math.floor(Math.random() * doors.length)].map((q) => ({ ...q }));
      else dest = [{ ...stop.town, x: stop.town.x + (Math.random() - 0.5) * 6, z: stop.town.z + (Math.random() - 0.5) * 6 }];
      const pts = [...door.map((p) => ({ ...p })), ...via, ...dest];
      this.walker(loc, pts, { delay: i * 1.1, owner: v });
    }
    // the queue boards once the last is off the ramp
    const back = [...door].reverse().map((p) => ({ ...p }));
    stop.queue.forEach((wk, i) => {
      if (wk.done) return;
      const here = { x: wk.fig.root.position.x, y: wk.fig.root.position.y, z: wk.fig.root.position.z, g: true };
      const via = down.length ? [{ ...stop.origin, y: this.groundY(loc, stop.origin.x, stop.origin.z), g: true }, ...[...down].reverse().map((p) => ({ ...p }))] : [];
      wk.pts = [here, ...via, ...back];
      wk.seg = 0; wk.t = 0; wk.idle = false; wk.hold = false;
      wk.delay = Math.max(wk.delay, 0) + nOff * 1.1 + 1.5 + i * 1.2;
      wk.board = true; wk.owner = v; v.boarding++;
    });
    stop.queue = [];
    stop.queued = false;
  }

  updateWalkers(dt) {
    if (dt <= 0) return;
    for (let i = this.walkers.length - 1; i >= 0; i--) {
      const wk = this.walkers[i];
      if (wk.done) { this.walkers.splice(i, 1); continue; }
      const loc = wk.loc;
      if (!loc.active || loc.camDist > PAX_RANGE + 250) {
        if (wk.stop) { wk.stop.queue = wk.stop.queue.filter((q) => q !== wk); wk.stop.queued = false; }
        this.release(wk); this.walkers.splice(i, 1); continue;
      }
      const f = wk.fig, p = f.root.position;
      if (wk.idle || wk.delay > 0) {
        wk.delay -= dt;
        f.legL.rotation.x = f.legR.rotation.x = 0;
        continue;
      }
      const a = wk.pts[wk.seg], b = wk.pts[wk.seg + 1];
      if (!b) {
        // queuers wait at the shelter; everyone else has gone indoors
        if (wk.hold) { wk.hold = false; wk.idle = true; wk.pts = [a]; wk.seg = 0; continue; }
        this.release(wk); this.walkers.splice(i, 1); continue;
      }
      const len = Math.hypot(b.x - a.x, b.z - a.z, (b.y - a.y) * 0.3) || 0.01;
      wk.t += (wk.speed * dt) / len;
      if (wk.t >= 1) { wk.seg++; wk.t = 0; continue; }
      p.x = a.x + (b.x - a.x) * wk.t;
      p.z = a.z + (b.z - a.z) * wk.t;
      p.y = a.g && b.g ? this.groundY(loc, p.x, p.z) : a.y + (b.y - a.y) * wk.t;
      if (Math.abs(b.x - a.x) + Math.abs(b.z - a.z) > 0.05) f.root.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
      f.phase += dt * 7;
      f.legL.rotation.x = Math.sin(f.phase) * 0.6;
      f.legR.rotation.x = -Math.sin(f.phase) * 0.6;
      p.y += Math.abs(Math.sin(f.phase)) * 0.12;
    }
  }

  // ================= damage: land-trains and buggies =================

  hook() {
    const g = globalThis.game;
    if (this.g || !g) return;
    this.g = g;
    g.blastHooks = g.blastHooks || [];
    g.blastHooks.push((pos, radius, damage, owner) => this.blast(pos, radius, damage, owner));
  }

  // hover-car bob: slow and shallow (~0.05 m swell at 0.15 Hz plus a finer ripple), per-car phase, time-based (not
  // distance-based, which bounced at speed)
  carBob(v) {
    const ph = v.bobPh || 0;
    return Math.sin(this.t * 0.9 + ph) * 0.05 + Math.sin(this.t * 1.7 + ph * 1.7) * 0.02;
  }

  centre(v, out) { return out.copy(v.pos).addScaledVector(_u.copy(v.pos).normalize(), v.kind === 'buggy' ? 1.8 : v.kind === 'car' ? 0.4 : 2.6); }

  // Does a shot segment (a -> b) hit a road vehicle, trailers included (they only have a thin deck collider)? Returns
  // the vehicle so the caller can explode there.
  segHit(a, b) {
    for (const v of this.roadVehicles || []) {
      if (!v.maxHp || v.hp <= 0 || v.state === 'dead' || !v.root.visible) continue;
      const c = this.centre(v, _c);
      if (c.distanceToSquared(a) > 3600) continue;
      if (segDist2(a, b, c) < v.hitR * v.hitR) return v;
      if (v.trailers) for (const t of v.trailers) {
        _c.copy(t.plat.pos).addScaledVector(_u.copy(t.plat.pos).normalize(), 2.6);
        if (segDist2(a, b, _c) < 4.2 * 4.2) return v;
      }
    }
    return null;
  }

  // rammed at sp m/s (pos: rammer's centre, r: its reach); short cooldown per target
  ram(pos, r, sp) {
    let hit = null;
    for (const v of this.roadVehicles || []) {
      if (!v.maxHp || v.hp <= 0 || v.state === 'dead' || !v.root.visible || (v.ramT || 0) > this.t) continue;
      let d = this.centre(v, _c).distanceTo(pos) - v.hitR;
      if (v.trailers) for (const t of v.trailers) d = Math.min(d, _c.copy(t.plat.pos).addScaledVector(_u.copy(t.plat.pos).normalize(), 2.6).distanceTo(pos) - 4.2);
      if (d > r) continue;
      v.ramT = this.t + 0.6;
      this.damage(v, sp * 2.2);
      hit = v;
    }
    return hit;
  }

  blast(pos, radius, damage, owner) {
    if (owner !== 'player') return;
    for (const v of this.roadVehicles) {
      if (!v.maxHp || v.hp <= 0 || v.state === 'dead' || !v.root.visible) continue;
      let d = this.centre(v, _a).distanceTo(pos) - v.hitR;
      if (v.trailers) for (const t of v.trailers) d = Math.min(d, _a.copy(t.plat.pos).addScaledVector(_u.copy(t.plat.pos).normalize(), 2.6).distanceTo(pos) - 4.6);
      if (d > radius) continue;
      this.damage(v, damage * Math.max(0.3, 1 - Math.max(0, d) / radius));
    }
  }

  damage(v, amount, blame = true) {
    v.hp -= amount;
    v.hurt = 0.2;
    if (v.hp <= 0) this.wreck(v, blame);
  }

  // a meteor lands (meteors.js): under it wrecked, nearby battered (less further out), nobody blamed
  meteorBlast(pos, core, reach) {
    for (const v of this.roadVehicles || []) {
      if (!v.maxHp || v.hp <= 0 || v.state === 'dead' || !v.root.visible) continue;
      let d = this.centre(v, _a).distanceTo(pos) - v.hitR;
      if (v.trailers) for (const t of v.trailers) d = Math.min(d, _a.copy(t.plat.pos).addScaledVector(_u.copy(t.plat.pos).normalize(), 2.6).distanceTo(pos) - 4.6);
      if (d > reach) continue;
      this.damage(v, d <= core ? v.maxHp * 2 : v.maxHp * 0.9 * (1 - (d - core) / (reach - core)), false);
    }
  }

  // burnt look: every surface (not ink hulls) to one charred material, and back
  char(v, on) {
    const mat = toon(0x2b2530);
    for (const r of [v.root, ...(v.trailers || []).map((t) => t.root)]) {
      r.traverse((o) => {
        if (!o.isMesh || o.userData.isInk) return;
        if (on) { if (!o.userData.mat0) o.userData.mat0 = o.material; o.material = mat; }
        else if (o.userData.mat0) { o.material = o.userData.mat0; o.userData.mat0 = null; }
      });
    }
  }

  wreck(v, blame = true) {
    const g = this.g;
    v.hp = 0;
    v.state = 'wreck';
    v.cur = 0;
    v.wreckT = 45;
    v.roll = (this.r() - 0.5) * 0.35;
    for (const wk of this.walkers) if (wk.owner === v && !wk.done) this.release(wk);
    this.char(v, true);
    if (v.beacon) v.beacon.visible = false;
    if (v.beacons) for (const b of v.beacons) b.visible = false;
    if (!g) return;
    const c = this.centre(v, new THREE.Vector3()), up = c.clone().normalize();
    g.fx.explosion(c, v.kind === 'buggy' ? 7 : 11, true);
    if (v.trailers) for (const t of v.trailers) g.fx.explosion(t.plat.pos.clone().addScaledVector(up, 2.5), 6, false);
    if (g.audio) g.audio.boom(true);
    g.fx.pop('WRECKED!', c.clone().addScaledVector(up, 4), { color: '#ff4f2e', size: 60, life: 1.2 });
    if (g.alchemy) {
      // thrown clear, one each side, easy to spot and skate over
      const sideV = _d.crossVectors(v.fwd, up).normalize();
      g.alchemy.dropLoot('engine', v.pos.clone().addScaledVector(sideV, v.kind === 'buggy' ? 4 : 6));
      g.alchemy.dropLoot(null, v.pos.clone().addScaledVector(sideV, v.kind === 'buggy' ? -4 : -6), { credits: v.credits || 25 });
    }
    // the road's town isn't happy
    const pc = v.piece;
    let town = pc.kind === 'e' ? (pc.fromLoc.dir.distanceTo(up) < pc.toLoc.dir.distanceTo(up) ? pc.fromLoc : pc.toLoc) : pc.town;
    if (blame && town && town.faction && g.rep) g.rep.add(town.faction, -3, 'Wrecked civilian traffic');
  }

  // back on the road later, out of the camera's sight
  respawn(v, camPos) {
    // Vostok supply trains return to their own road, and nothing else goes on it
    const lanes = this.roads.filter((r) => !!(r.A.restricted || (r.B && r.B.restricted)) === !!v.shuttle && !(r.uturn && v.kind === 'landtrain')).flatMap((r) => r.lanes).filter((pc) => pc.len > 300);
    const h = { i: 0, f: 0 };
    for (let tries = 0; tries < 8 && lanes.length; tries++) {
      const pc = lanes[Math.floor(this.r() * lanes.length)];
      const s = 60 + this.r() * (pc.len - 120);
      h.i = 0;
      if (sample(pc.path, s, _a, h).distanceTo(camPos) < 1700) continue;
      if (pc.vehicles.some((o) => Math.abs(o.s - s) < 90)) continue;
      v.hist = [];
      this.move(v, pc);
      v.s = s;
      v.state = 'drive'; v.cur = 0; v.hp = v.maxHp; v.roll = 0; v.boarding = 0;
      this.char(v, false);
      this.plan(v, pc.toLoc);
      return;
    }
    v.respawnT = 20;
  }

  smoke(v, dt) {
    const g = this.g;
    if (!g || !(v.state === 'wreck' || v.hp < v.maxHp * 0.6)) return;
    if (v.pos.distanceToSquared(this.cam) > 500 * 500) return;
    v.smokeT -= dt;
    if (v.smokeT > 0) return;
    const wrecked = v.state === 'wreck';
    v.smokeT = wrecked ? 0.12 : v.hp < v.maxHp * 0.3 ? 0.15 : 0.3;
    const c = this.centre(v, _a), up = _u.copy(c).normalize();
    c.addScaledVector(up, v.kind === 'buggy' ? 1.5 : 2.5);
    g.fx.spawn(c, up.clone().multiplyScalar(2.5), { color: 0x3a3550, size: wrecked ? 1.3 : 0.9, life: 2.2, gravity: -0.2, drag: 0.3, count: 1, spread: 0.8 });
    if (wrecked ? v.wreckT > 25 : v.hp < v.maxHp * 0.3) g.fx.spawn(c, up.clone().multiplyScalar(3), { color: this.r() < 0.5 ? 0xff4f2e : 0xffd23f, size: 0.5, life: 0.5, gravity: -0.5, count: 1, spread: 1.2 });
  }

  // ================= per frame =================

  // Drawn (and fully simulated) only within view distance and line of sight (rechecked every 0.25 s per vehicle).
  // Past VEH_DETAIL its small parts (and their ink) stop drawing too.
  seen(v, camPos) {
    const d2 = v.pos.distanceToSquared(camPos);
    if (d2 > v.view * v.view) return false;
    if (!v.detail) {
      v.detail = [];
      for (const r of [v.root, ...(v.trailers || []).map((t) => t.root)]) r.traverse((o) => {
        if (!o.isMesh || (o.userData && o.userData.isInk)) return;
        if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
        if (o.geometry.boundingSphere.radius * o.scale.x * r.scale.x < 0.9) o.traverse((c) => v.detail.push(c));
      });
      v.detailOn = true;
    }
    if (v.detailOn && d2 > (VEH_DETAIL + 20) ** 2) { v.detailOn = false; setMask(v.detail, false); }
    else if (!v.detailOn && d2 < VEH_DETAIL * VEH_DETAIL) { v.detailOn = true; setMask(v.detail, true); }
    if (d2 < 260 * 260) { v.occ = false; return true; }
    v.occT = (v.occT ?? Math.random() * 0.25) - this.dt;
    if (v.occT <= 0) { v.occT = 0.25; v.occ = !this.w.lineOfSight(camPos, v.pos, (v.radius || 4) + 3); }
    return !v.occ;
  }

  update(dt, camPos) {
    this.dt = dt;
    this.cam = camPos;
    this.hook();
    this.t = (this.t || 0) + dt;
    for (const v of this.vehicles) {
      v.prevPos.copy(v.pos);
      if (v.captured > 0) { v.root.visible = false; this.dropDeck(v); v.vel.set(0, 0, 0); continue; }
      if (v.piece || v.offroad) this.updateRoadVehicle(v, dt, camPos);
      else this.updateFlyer(v, dt, camPos);
    }
    for (const c of this.crawlers) {
      if (!c.piece) continue;
      c.prevPos.copy(c.pos);
      this.updateRoadVehicle(c, dt, camPos);
    }
    this.updateGarage(dt);
    this.updateWalkers(dt);
  }

  // The Kepler winch (winch.js) pulls a vehicle: an offset off its route (tug) with its own velocity, sprung and damped
  // to zero, so it eases back onto its path when released.
  applyTug(v, dt) {
    if (!v.tug) return;
    // spring back to the route: a hover-car drifts far and wanders back, a freighter snaps back
    const k = { car: 0.18, buggy: 0.3, landtrain: 0.6, bus: 0.55, ship: 0.9 }[v.kind] ?? 0.5;
    v.tugVel.addScaledVector(v.tug, -k * dt).multiplyScalar(Math.max(0, 1 - 1.4 * dt));
    v.tug.addScaledVector(v.tugVel, dt);
    if (v.tug.length() > 70) v.tug.setLength(70);
    if (v.tug.lengthSq() < 1e-3 && v.tugVel.lengthSq() < 1e-3) { v.tug = null; v.tugVel = null; return; }
    if (v.piece) {
      // a road vehicle keeps its height over the ground when dragged
      const h = this.P.altitude(v.pos);
      v.pos.add(v.tug);
      this.P.ground(v.pos, v.pos, Math.max(0, h));
    } else v.pos.add(v.tug);
  }

  updateFlyer(v, dt, camPos) {
    const path = v.path, L = path.len, M = v.model;
    v.clock += dt;
    let main = 0, lift = 0;
    if (v.state === 'park') {
      v.timer += dt;
      const dur = 2.4;
      if (!v.closing) {
        v.open = clamp01((v.timer - 1.2) / dur);
        if (v.open >= 1 && !v.exchanged) { v.exchanged = true; this.exchange(v, v.stop); }
        if (v.exchanged && ((v.timer > v.minWait && v.boarding <= 0) || v.timer > v.maxWait)) { v.closing = true; v.closeAt = v.timer; }
      } else {
        v.open = 1 - clamp01((v.timer - v.closeAt) / dur);
        if (v.boarding > 0) for (const wk of this.walkers) if (wk.owner === v && wk.board) this.release(wk);
        // spool the lift jets up for the last moments
        lift = clamp01((v.timer - v.closeAt - dur + 0.6) / 1.2);
        if (v.timer > v.closeAt + dur + 0.8) {
          v.state = 'fly'; v.dir = v.s <= 0 ? 1 : -1; v.timer = 0; v.exchanged = false; v.closing = false; v.open = 0; v.stop = null;
        }
      }
      v.vel.set(0, 0, 0);
      sample(path, v.s, v.pos, v.hint);
      this.applyTug(v, dt);
      if (M.gearK < 1) M.setGear(1);
    } else {
      const dS = v.dir > 0 ? v.s : L - v.s, dE = v.dir > 0 ? L - v.s : v.s;
      const d = Math.min(dS, dE);
      const sp = Math.min(v.vmax, 1.2 + Math.min(0.3 * d, Math.sqrt(2 * v.acc * d)));
      v.s += sp * dt * v.dir;
      const dest = v.dir > 0 ? v.stops[1] : v.stops[0];
      if (dE < (v.kind === 'ship' ? 600 : 250)) this.queueBoarders(dest, v);
      if (v.s >= L || v.s <= 0) {
        v.s = v.s >= L ? L : 0;
        v.state = 'park'; v.timer = 0; v.stop = dest;
      }
      sample(path, v.s, v.pos, v.hint);
      this.applyTug(v, dt);
      if (dt > 0) v.vel.copy(v.pos).sub(v.prevPos).divideScalar(dt);
      // gear stowed in cruise, down over the pad
      M.setGear(v.kind === 'ship' ? clamp01((70 - d) / 40) : clamp01((30 - d) / 18));
      // thrusters pulse while moving; belly jets carry it on the vertical legs
      const near = v.kind === 'ship' ? 90 : 40;
      lift = v.state === 'park' ? 0 : clamp01(1.25 - d / near);
      main = v.state === 'park' ? 0 : 0.25 + 0.75 * clamp01(sp / v.vmax);
      // heading follows the route a little ahead, not swinging while low over the pad it left; descending it turns to land
      // ramp toward the stairs (stop.land)
      if (dE < (v.kind === 'ship' ? 150 : 70) && dest.land) v.heading.copy(dest.land);
      else if (dS > v.turnMin) {
        sample(path, v.s + v.dir * 30, _a, v.ahint);
        _a.sub(v.pos);
        const up = _u.copy(v.pos).normalize();
        _a.addScaledVector(up, -_a.dot(up));
        if (_a.lengthSq() > 9) v.heading.copy(_a).normalize();
      }
    }
    const vis = this.seen(v, camPos);
    v.root.visible = vis;
    if (!vis) { this.dropDeck(v); return; }
    // route board names where it's bound: the far end in flight, the other end while parked
    M.setSign((v.state === 'park' ? (v.stop === v.stops[0] ? v.stops[1] : v.stops[0]) : (v.dir > 0 ? v.stops[1] : v.stops[0])).loc.short);
    v.root.position.copy(v.pos);
    const up = _u.copy(v.pos).normalize();
    frameQuat(up, v.heading, _q);
    v.root.quaternion.rotateTowards(_q, v.turn * dt);
    v.fwd.set(0, 0, 1).applyQuaternion(v.root.quaternion);
    M.setRamp(v.open);
    M.setThrust(main, lift, v.clock);
    if (M.setCrane) {
      // freighter gantry cranes work the bays while parked (spreaders down only over their own bay, hoisted before lift-off)
      const down = v.state === 'park' && !v.closing;
      v.craneW = (v.craneW || 0) + ((down && v.timer > 2 ? 1 : 0) - (v.craneW || 0)) * Math.min(1, dt * 0.7);
      v.craneL = (v.craneL || 0) + ((down ? 1 : 0) - (v.craneL || 0)) * Math.min(1, dt * 1.2);
      M.setCrane(v.craneW, v.clock, v.craneL);
    }
    this.syncDeck(v, camPos);
  }

  hide(v) {
    v.root.visible = false;
    this.dropDeck(v);
    if (v.trailers) for (const t of v.trailers) { t.root.visible = false; this.dropDeck(t.plat); }
  }

  // a hover-car tipped out of a jar at `from` drives cross-country to the nearest road and rejoins with a new destination
  sendHome(v, from) {
    let best = null, bd = Infinity;
    const q = new THREE.Vector3();
    for (const pc of this.pieces) {
      if (!pc.path || (pc.kind !== 'e' && pc.kind !== 'r')) continue;
      const P = pc.path.pts;
      for (let i = 0; i < P.length; i += 2) {
        const d = P[i].distanceToSquared(from);
        if (d < bd) { bd = d; best = { pc, s: pc.path.cum[i] }; }
      }
    }
    if (!best) return;
    sample(best.pc.path, best.s, q, { i: 0, f: 0 });
    v.offroad = { target: q.clone(), pc: best.pc, s: best.s };
    v.pos.copy(from);
    v.prevPos.copy(from);
    v.state = 'drive';
    v.cur = 0;
  }

  // sendHome's cross-country leg: hover straight at the road, then join it
  driveHome(v, dt, camPos) {
    const o = v.offroad, P = this.P;
    const up = _u.copy(v.pos).normalize();
    _f.copy(o.target).sub(v.pos);
    _f.addScaledVector(up, -_f.dot(up));
    const d = _f.length();
    if (d < 2.5) {
      v.offroad = null;
      this.move(v, o.pc);
      v.s = o.s;
      v.hist = [];
      v.hintF = { i: 0, f: 0 }; v.hintR = { i: 0, f: 0 };
      this.plan(v);
      return;
    }
    _f.divideScalar(d);
    v.cur = Math.min(v.vmax * 0.5, v.cur + v.acc * dt);
    v.pos.addScaledVector(_f, Math.min(d, v.cur * dt));
    P.ground(v.pos, v.pos, v.hoverH + 0.3 + this.carBob(v));
    if (dt > 0) v.vel.copy(v.pos).sub(v.prevPos).divideScalar(dt);
    v.fwd.copy(_f);
    v.root.visible = this.seen(v, camPos);
    v.root.position.copy(v.pos);
    frameQuat(_u.copy(v.pos).normalize(), _f, v.root.quaternion);
  }

  updateRoadVehicle(v, dt, camPos) {
    if (v.offroad) { this.driveHome(v, dt, camPos); return; }
    if (v.state === 'dead') {
      v.respawnT -= dt;
      if (v.respawnT <= 0) this.respawn(v, camPos);
      if (v.state === 'dead') { v.vel.set(0, 0, 0); return; }
    }
    let pc = v.piece;
    let limit = v.vmax, over = 0;
    if (v.state === 'wreck') {
      v.cur = 0;
      v.wreckT -= dt;
      if (v.wreckT <= 0) {
        // burnt out: gone, back on the road in a few minutes
        if (this.g && v.root.visible && v.pos.distanceTo(camPos) < 400) this.g.fx.explosion(this.centre(v, new THREE.Vector3()), 4, false);
        this.hide(v);
        this.move(v, null);
        v.piece = pc; // kept for respawn bookkeeping, but off the lane
        v.state = 'dead';
        v.respawnT = 180 + this.r() * 120;
        v.vel.set(0, 0, 0);
        return;
      }
    } else if (v.state === 'stop') {
      v.timer -= dt;
      v.cur = 0;
      if (!v.exchanged && v.timer < v.waitT - 1.5) {
        v.exchanged = true;
        if (v.pax) this.exchange(v, pc.stop);
      }
      // hold the doors (up to 14 s extra) for passengers still walking up
      if (v.timer <= 0 && (!v.boarding || v.timer < -14)) {
        v.state = 'drive';
        for (const wk of this.walkers) if (wk.owner === v && wk.board) this.release(wk);
        this.plan(v);
      }
    } else {
      limit = Math.min(limit, pc.vlim * (v.kind === 'car' ? 1.7 : 1)); // hover-cars outpace the town crawl to get past what they hop
      const nx = v.plan[0];
      if (nx && nx.vlim < limit) limit = Math.min(limit, nx.vlim + Math.sqrt(2 * 1.5 * Math.max(0, pc.len - v.s - v.front)));
      // traffic ahead on this piece or the next (land-trains and buggies queue; hover-cars hop over)
      const scan = (list, base, from = 0) => {
        for (const o of list) {
          if (o === v || o.captured > 0 || o.s < from) continue;
          const gap = base + o.s - v.s;
          if (v.kind === 'car') {
            if (gap > -(o.front + v.tail + 3) && gap < o.tail + v.front + 12) over = Math.max(over, o.kind === 'landtrain' ? 6.5 : o.kind === 'car' ? 2.6 : 4.5);
            continue;
          }
          if (gap <= 0) continue;
          limit = Math.min(limit, Math.max(0, (gap - o.tail - v.front - 5) * 0.6));
        }
      };
      scan(pc.vehicles, 0);
      if (nx) scan(nx.vehicles, pc.len - (pc.joinTo === nx ? pc.joinS : 0), pc.joinTo === nx ? pc.joinS - 2 : 0); // a road merging part-way sees only what's past the merge
      // pull in at the destination's ring stop (may be a few pieces ahead)
      const fin = v.plan.length ? v.plan[v.plan.length - 1] : pc, st = fin.stop;
      if (st && st.loc === v.dest && v.plan.length <= 4) {
        let toStop = st.s - v.s;
        if (fin !== pc) { toStop = pc.len - v.s + st.s - (pc.joinTo === v.plan[0] ? pc.joinS : 0); for (let i = 0; i < v.plan.length - 1; i++) toStop += v.plan[i].len; }
        if (toStop > -2) {
          limit = Math.min(limit, 0.6 + Math.sqrt(2 * 1.2 * Math.max(0, toStop - 0.3)));
          if (v.pax && toStop < 300) this.queueBoarders(st, v);
          if (fin === pc && toStop < 0.5) { v.state = 'stop'; v.timer = v.waitT; v.cur = 0; v.exchanged = false; }
        }
      }
      if (v.state === 'drive') {
        v.cur = Math.min(limit, v.cur + v.acc * dt);
        v.s += v.cur * dt;
        while (v.s > v.piece.len) {
          let next = v.plan.shift();
          if (!next) { this.plan(v); next = v.plan.shift() || v.piece.next[v.piece.next.length - 1]; }
          v.s -= v.piece.len;
          if (v.piece.joinTo === next) v.s += v.piece.joinS; // garage road merges part-way along a ring arc
          v.hist.unshift(v.piece);
          if (v.hist.length > 6) v.hist.length = 6;
          this.move(v, next);
        }
        pc = v.piece;
      }
    }
    // placement: chord between the axles, normals smoothed along the road (a land-train's outer axles are 2.9 m out)
    const lt = v.kind === 'landtrain';
    const up = this.roadFrame(v, v.s, lt ? 2.9 : v.front * 0.7, lt ? 2.9 : Math.max(2, v.front * 0.7), v.hintF, v.hintR, v.pos, _f, _fp, _rp);
    if (v.kind === 'car') {
      v.hover += ((over || 0) - v.hover) * Math.min(1, dt * 1.4);
      // a wreck has lost its lift and sits on the road
      if (v.state === 'wreck') v.dropH = Math.max(0, (v.dropH ?? v.hoverH) - dt * 6);
      else v.dropH = v.hoverH;
      v.pos.addScaledVector(up, v.dropH + (v.state === 'wreck' ? 0.3 : v.hover + this.carBob(v)));
    }
    this.applyTug(v, dt);
    if (dt > 0) v.vel.copy(v.pos).sub(v.prevPos).divideScalar(dt);
    if (v.vel.lengthSq() > 3600 || v.state === 'wreck') v.vel.set(0, 0, 0);
    v.fwd.copy(_f);
    const vis = this.seen(v, camPos);
    v.root.visible = vis;
    if (v.trailers) for (const t of v.trailers) t.root.visible = vis;
    if (!vis) { this.hide(v); return; }
    if (lt) {
      // clamped to the ground under its tyres; that moves it off the lane a little, so recompute its speed
      if (v.tug) { _fp.add(v.tug); _rp.add(v.tug); }
      this.groundPose(_fp, _rp, up, 2.15, v.pos, v.root.quaternion);
      if (dt > 0) v.vel.copy(v.pos).sub(v.prevPos).divideScalar(dt);
      if (v.vel.lengthSq() > 3600 || v.state === 'wreck') v.vel.set(0, 0, 0);
      v.root.position.copy(v.pos);
    } else {
      v.root.position.copy(v.pos);
      frameQuat(up, _f, v.root.quaternion);
      if (v.kind === 'car' && v.state !== 'wreck') { // gentle wallow on its lift: ~1° of roll and pitch, slow
        const ph = v.bobPh || 0;
        v.root.quaternion.multiply(_q.setFromEuler(_eu.set(Math.sin(this.t * 0.6 + ph * 1.3) * 0.012, 0, Math.sin(this.t * 0.8 + ph) * 0.018)));
      }
    }
    if (v.roll) { v.root.quaternion.multiply(_q.setFromAxisAngle(_z, v.roll)); v.root.position.addScaledVector(up, -0.4); }
    if (v.wheels) {
      const spin = (v.cur * dt) / (v.wheelR || 1);
      for (const w of v.wheels) w.rotation.x += spin;
    }
    if (v.beacon && v.state !== 'wreck') v.beacon.visible = Math.sin(this.t * 6) > -0.2;
    if (v.beacons && v.state !== 'wreck') for (const b of v.beacons) b.visible = Math.sin(this.t * 7 + b.userData.phase * Math.PI) > 0; // SPACECOM light bar: the lamps alternate
    if (v.trailers) {
      v.trailers.forEach((t, i) => {
        const p = t.plat;
        p.prevPos.copy(p.pos);
        const tu = this.roadFrame(v, v.s - t.offset, 2.7, 2.7, t.hintF, t.hintR, p.pos, _d, _fp, _rp);
        if (v.tug) { _fp.add(v.tug); _rp.add(v.tug); } // winch drags it with the engine
        this.groundPose(_fp, _rp, tu, 1.95, p.pos, t.root.quaternion);
        t.root.position.copy(p.pos);
        if (v.roll) t.root.quaternion.multiply(_q.setFromAxisAngle(_z, v.roll * (i % 2 ? -0.7 : 0.8)));
        if (dt > 0) p.vel.copy(p.pos).sub(p.prevPos).divideScalar(dt);
        if (p.vel.lengthSq() > 3600 || v.state === 'wreck') p.vel.set(0, 0, 0);
        for (const w of t.wheels) w.rotation.x += (v.cur * dt) / 1.0;
        this.syncDeck(p, camPos);
        this.linkBar(t, i ? v.trailers[i - 1].root : v.root, i ? -4.25 : -4.55);
      });
    }
    if (v.deck || v.decks) this.syncDeck(v, camPos);
    if (v.maxHp) this.smoke(v, dt);
  }

  // point a trailer's drawbar from its yoke at the coupling pin of the unit ahead (local z = pinZ)
  linkBar(t, ahead, pinZ) {
    ahead.updateMatrixWorld();
    t.root.updateMatrixWorld();
    _b.set(0, 1.4, pinZ).applyMatrix4(ahead.matrixWorld);
    t.root.worldToLocal(_b).sub(t.bar.position);
    const len = Math.max(0.3, _b.length());
    t.bar.quaternion.setFromUnitVectors(_z, _b.divideScalar(len));
    t.rod.scale.z = len;
    t.eye.position.z = len;
  }

  // position at arc length s along the route: back through pieces just left (trailers), or into the next (front axle)
  at(v, s, out, h, nOut) {
    let p = v.piece;
    // a road merging part-way (garage road onto the ring) meets the piece `joinS` along: behind that is the road it came
    // by, and past the road's end is the piece from `joinS`, not its start
    let back = 0;
    for (;;) {
      const q = v.hist[back];
      const from = q && q.joinTo === p ? q.joinS : 0;
      if (s >= from || !q) break;
      s = q.len - (from - s); p = q; back++;
    }
    if (s < 0) s = 0;
    if (!back && s > p.len && v.plan[0]) { s -= p.len; if (p.joinTo === v.plan[0]) s += p.joinS; p = v.plan[0]; }
    if (h.p !== p) { h.p = p; h.i = s > p.len * 0.5 ? p.path.pts.length - 2 : 0; }
    sample(p.path, s, out, h);
    return nOut.copy(p.normals[h.i]).lerp(p.normals[h.i + 1], h.f);
  }

  // ground point midway between the axles, travel direction, smoothed up (outF / outR get the two axle points)
  roadFrame(v, s, front, rear, hF, hR, outPos, outFwd, outF = null, outR = null) {
    const nf = this.at(v, s + front, _b, hF, _n);
    const nr = this.at(v, s - rear, _c, hR, _u);
    outPos.copy(_b).add(_c).multiplyScalar(0.5);
    outFwd.copy(_b).sub(_c);
    if (outF) outF.copy(_b);
    if (outR) outR.copy(_c);
    if (outFwd.lengthSq() < 1e-6) outFwd.set(1, 0, 0);
    return nf.add(nr).normalize();
  }

  // Lays a land-train unit on the ground: `fp` / `rp` the lane points under its front / rear axles, `up` the smoothed
  // normal, `half` its half track. Ground is sampled under all four tyres and the unit sits on their plane (pitched along
  // the axles, rolled across camber, origin at their middle), so every wheel touches on slopes, crests and dips.
  groundPose(fp, rp, up, half, outPos, outQuat) {
    const P = this.P;
    _gz.subVectors(fp, rp).normalize();
    _gt.crossVectors(_gz, up).normalize(); // right-hand side, level with the ground
    const lf = P.ground(_g0.copy(fp).addScaledVector(_gt, -half), _g0);
    const rf = P.ground(_g1.copy(fp).addScaledVector(_gt, half), _g1);
    const lr = P.ground(_g2.copy(rp).addScaledVector(_gt, -half), _g2);
    const rr = P.ground(_g3.copy(rp).addScaledVector(_gt, half), _g3);
    outPos.copy(lf).add(rf).add(lr).add(rr).multiplyScalar(0.25);
    _gz.copy(lf).add(rf).sub(lr).sub(rr).normalize(); // along: front pair minus rear pair
    _gx.copy(lf).add(lr).sub(rf).sub(rr); // across: left minus right (the model's +x is its left)
    _gx.addScaledVector(_gz, -_gx.dot(_gz)).normalize();
    _gy.crossVectors(_gz, _gx);
    return outQuat.setFromRotationMatrix(_m4.makeBasis(_gx, _gy, _gz));
  }

  // take a vehicle's deck colliders out of the spatial hash
  dropDeck(s) {
    if (!s.deckLive) return;
    for (const c of s.deckCols) this.C.remove(c);
    s.deckLive = false;
  }

  // Keeps deck colliders in the spatial hash while near the camera: one box for a flyer or hover-car (deck / deckY /
  // deckZ), or boxes in the model's frame for a land-train unit or freighter (decks: hx, hy, hz, y, z, and x if off-centre).
  syncDeck(s, camPos) {
    const near = s.pos.distanceToSquared(camPos) < 350 * 350;
    this.dropDeck(s);
    if (!near || s.pos.lengthSq() < 1) return;
    const boxes = s.decks || (s.deckOne = s.deckOne || [{ hx: s.deck[0], hy: s.deck[1], hz: s.deck[2], y: s.deckY || 0, z: s.deckZ || 0 }]);
    if (!s.deckCols) s.deckCols = boxes.map(() => ({ type: 'box', platform: s, c: new THREE.Vector3(), ax: new THREE.Vector3(), ay: new THREE.Vector3(), az: new THREE.Vector3() }));
    const q = s.quat;
    _a.set(1, 0, 0).applyQuaternion(q); _b.set(0, 1, 0).applyQuaternion(q); _c.set(0, 0, 1).applyQuaternion(q);
    boxes.forEach((d, i) => {
      const c = s.deckCols[i];
      if (d.roll) {
        // slab tipped about the ship's z axis (a wing's dihedral)
        const cs = Math.cos(d.roll), sn = Math.sin(d.roll);
        c.ax.copy(_a).multiplyScalar(cs).addScaledVector(_b, sn);
        c.ay.copy(_b).multiplyScalar(cs).addScaledVector(_a, -sn);
      } else { c.ax.copy(_a); c.ay.copy(_b); }
      c.az.copy(_c);
      c.c.copy(s.pos).addScaledVector(_a, d.x || 0).addScaledVector(_b, d.y).addScaledVector(_c, d.z);
      c.hx = d.hx; c.hy = d.hy; c.hz = d.hz;
      this.C.add(c);
    });
    s.deckLive = true;
  }
}
