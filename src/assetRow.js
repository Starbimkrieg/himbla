import * as THREE from 'three';
import { GRAV } from './geo.js';
import { toon, glow, ink, textSprite } from './toon.js';
import { mulberry32 } from './rng.js';
import { railOf } from './rails.js';
import { GROUPS } from './assetRowItems/index.js';

// THE ASSET ROW (a dev tool): a flat showroom with the game's assets lined up side by side, each under a name board.
// The one way in is the dev menu -> full cheat menu -> TELEPORT -> "1 · ASSET ROW" (cheats.js); a release build has none
// of it (devtools.js). It is not a location, is in no save, and leaving (the same menu entry, any other teleport, quitting
// to the menu) puts you back on the Moon exactly where you left.
//
// Modelled on spindle.js: while you are here the Moon is hidden and frozen (main.js `away()`), g.planet is this world
// (FlatWorld), and "up" is one fixed direction (geo.js GRAV.flat). The things shown are the catalogue in
// assetRowItems/ (see index.js for what an item is). They are built when you come near and let go of when you walk off, so
// the whole catalogue never has to be alive at once.
//
// Layout: two lanes along +x. Lane A (z = 0) holds everything under 100 m across, group after group; lane B (z = LANE_B)
// the big places, which need the room. You start on the plaza at x = 0.

const UP = new THREE.Vector3(0, 1, 0);
const LANE_Z = { A: 0, B: 460 };
const LANE_HALF = { A: 90, B: 330 }; // the plinth reaches this far either side of a lane's line
const PLINTH_X0 = -90, PLINTH_PAD = 120;
const VOID_Y = -1e5; // "no floor" past the plinth's edge
const FALL_LIMIT = -70; // below this you went over the edge: back to the start
const BUILD_R = 320, DROP_R = 520; // m from an item's footprint: built inside the first, let go of outside the second
const BUILD_MS = 14; // at most this long a frame spent building items (a big place can take longer on its own)
const GAP = (w) => Math.min(14, Math.max(6, w * 0.12)); // clear metres between neighbouring footprints
const SECTION_GAP = 36;
const COLOR = { A: '#ffd23f', B: '#2ee6ff' };
const TERMINAL_R = 5.5; // m: how near a terminal you must stand to use it

// A section terminal: a console with a slanted screen under a light column that shows from far off. `color` is the lane's.
function makeTerminal(color) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.1, 1.1), toon(0x2a2438)); base.position.y = 0.55; ink(base, 0.06); g.add(base);
  const screen = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1, 0.14), glow(0x2ee6ff)); screen.position.set(0, 1.6, 0.1); screen.rotation.x = -0.5; ink(screen, 0.05); g.add(screen);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.12, 0.7), toon(color)); cap.position.set(0, 1.12, 0); g.add(cap);
  const beam = new THREE.Mesh(new THREE.BoxGeometry(0.25, 22, 0.25), glow(color)); beam.position.y = 12.5; g.add(beam);
  for (const m of [base, screen, cap]) m.castShadow = true;
  return g;
}

// ---------- the flat planet interface the physics, camera, effects and HUD use (planet.js has the Moon's) ----------
class FlatWorld {
  constructor() {
    this.R = 3600; this.craters = []; this.rails = []; this.lastLake = null; this.colliders = null; this.rockRay = Infinity;
    this.x0 = PLINTH_X0; this.x1 = 100; this.z0 = -LANE_HALF.A - 40; this.z1 = LANE_Z.B + LANE_HALF.B + 40;
  }
  onPlinth(p) { return p.x >= this.x0 && p.x <= this.x1 && p.z >= this.z0 && p.z <= this.z1; }
  surface(p, outN) { if (outN) outN.copy(UP); return this.onPlinth(p) ? 0 : VOID_Y; }
  ground(v, out = new THREE.Vector3(), lift = 0) { return out.set(v.x, lift, v.z); }
  altitude(p) { return p.y - this.surface(p); }
  meshLift() { return 0; }
  visible() { return true; }
  inLake() { return null; }
  rimRailsNear() { return []; }
  // grind rails (rails.js): an item's crest lines stand here while it is built
  addRail(pts) { const r = railOf(pts); this.rails.push(r); return r; }
  removeRail(r) { const i = this.rails.indexOf(r); if (i >= 0) this.rails.splice(i, 1); }
  update() {}
}

// canvas grid for the plinth: a line every 10 m, so scale reads at a glance
function gridTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#8a8398'; x.fillRect(0, 0, 256, 256);
  x.fillStyle = '#7a7389'; x.fillRect(0, 0, 128, 128); x.fillRect(128, 128, 128, 128);
  x.strokeStyle = 'rgba(20,12,40,0.45)'; x.lineWidth = 3; x.strokeRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// a name board: the game's pixel-font sign as a sprite that always draws, `height` m tall
function board(text, height, color = '#ffd23f') {
  const s = textSprite(text, { color, scale: height / 10 });
  s.material.depthTest = false; // (readable over what stands behind it)
  s.renderOrder = 10;
  return s;
}

// the box round what is drawn: visible meshes only (a hidden plume or ghost does not count), each by its own geometry's box
// moved into place (a tilted part is not swelled to its rotated corners the way Box3.setFromObject does)
const _gb = new THREE.Box3();
function drawnBox(obj) {
  const box = new THREE.Box3();
  obj.updateMatrixWorld(true);
  obj.traverseVisible((o) => {
    if (!(o.isMesh || o.isPoints) || o.isInstancedMesh || !o.geometry) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    box.union(_gb.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld));
  });
  return box;
}

const disposeTree = (root) => {
  root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.isSkinnedMesh && o.skeleton) o.skeleton.dispose(); // (a skinned figure's bone texture)
    if (o.isInstancedMesh) o.dispose(); // (a crowd's instance buffers)
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) { if (m.map) m.map.dispose(); m.dispose(); }
  });
};

// ---------------------------------------------------------------------------------------------
export class AssetRow {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.world = new FlatWorld();
    this.root = null;
    this.items = []; // every catalogue item, with its place in the layout (layout())
    this.sections = [];
    this.terminals = []; // one by the plaza and one at the start of every section (build())
    this.t = 0;
  }

  // ---- the layout: where every item stands, worked out from the sizes the items declare, before any is built
  layout() {
    if (this.items.length) return;
    const lanes = { A: 40, B: 40 };
    for (const grp of GROUPS) {
      for (const lane of ['A', 'B']) {
        const mine = grp.items.filter((it) => (it.big ? 'B' : 'A') === lane);
        if (!mine.length) continue;
        this.sections.push({ title: grp.title, lane, x: lanes[lane] });
        lanes[lane] += 16;
        for (const it of mine) {
          const w = Math.max(it.w || 4, 2), d = Math.max(it.d || 4, 2);
          this.items.push({ it, group: grp.id, lane, x: lanes[lane] + w / 2, z: LANE_Z[lane], w, d, state: 'off', inst: null, cols: [], rails: [], api: null });
          lanes[lane] += w + GAP(w);
        }
        lanes[lane] += SECTION_GAP;
      }
    }
    this.world.x1 = Math.max(lanes.A, lanes.B) + PLINTH_PAD;
  }

  // The static parts: the plinth, the stars, the plaza and the section boards
  build() {
    if (this.root) return;
    this.layout();
    const root = new THREE.Group();
    root.name = 'assetRow';
    this.root = root;
    const w = this.world;
    const len = w.x1 - w.x0, wid = w.z1 - w.z0;
    const tex = gridTexture();
    tex.repeat.set(len / 20, wid / 20);
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(len, 4, wid), new THREE.MeshToonMaterial({ map: tex, gradientMap: toon(0).gradientMap }));
    plinth.position.set(w.x0 + len / 2, -2, (w.z0 + w.z1) / 2);
    plinth.receiveShadow = true;
    root.add(plinth);
    // the sky: stars (a sphere that follows the camera)
    const sky = new THREE.Group();
    const rr = mulberry32(5), N = 2000, sp = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { const u = rr() * 2 - 1, th = rr() * Math.PI * 2, q = Math.sqrt(1 - u * u); sp[i * 3] = q * Math.cos(th) * 7600; sp[i * 3 + 1] = Math.abs(u) * 7600; sp[i * 3 + 2] = q * Math.sin(th) * 7600; }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    sky.add(new THREE.Points(sg, new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, color: 0xe8e8ff })));
    this.sky = sky;
    root.add(sky);
    // the plaza: the way in, and what is down the row
    const title = board('ASSET ROW', 9, '#2ee6ff'); title.position.set(0, 12, 20); root.add(title);
    const note = board(`${this.items.length} ASSETS · LANE A (YELLOW): EVERYTHING UNDER 100 M · LANE B (CYAN, ${LANE_Z.B} M OVER): THE BIG PLACES`, 1.6, '#ffffff'); note.position.set(0, 5.5, 20); root.add(note);
    // the terminals: where you can jump to any section instead of walking (use: F, see terminalMenu)
    const addTerminal = (name, x, z, color, hex) => {
      const t = makeTerminal(color);
      t.position.set(x, 0, z);
      root.add(t);
      this.terminals.push({ name, x, z, color: hex });
    };
    addTerminal('PLAZA', 8, 52, 0x2ee6ff, '#2ee6ff');
    for (const s of [...this.sections].sort((a, b) => a.lane.localeCompare(b.lane) || a.x - b.x)) { // (the menu lists the yellow lane's sections down the row, then the cyan lane's)
      addTerminal(`${s.lane} · ${s.title}`, s.x + 4, LANE_Z[s.lane] + 34, s.lane === 'A' ? 0xffd23f : 0x2ee6ff, COLOR[s.lane]);
      const b = board(s.title, 6, COLOR[s.lane]);
      b.position.set(s.x + 8, 13, LANE_Z[s.lane]);
      root.add(b);
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.6, 12, 0.6), toon(0x2a2438)); post.position.set(s.x, 6, LANE_Z[s.lane] + 40); root.add(post);
    }
    root.visible = false;
    this.game.scene.add(root);
  }

  // ---- one item: built when you come near
  buildItem(e) {
    const g = this.game;
    let made;
    try { made = e.it.make({ game: g, moon: this.savedPlanet || g.planet }); } catch (err) { console.warn('[assetRow] could not build', e.it.id, err); made = null; }
    const inst = new THREE.Group();
    inst.name = `row:${e.it.id}`;
    e.inst = inst;
    e.api = made;
    e.state = 'on';
    if (!made || !made.root) {
      e.failed = true;
      const f = board(`${e.it.label || e.it.id}: DID NOT BUILD`, 1.5, '#ff2e88'); f.position.set(0, 2, 0); inst.add(f);
      inst.position.set(e.x, 0, e.z);
      this.root.add(inst);
      return;
    }
    const obj = made.root;
    inst.add(obj);
    // (centre the footprint on its slot: a factory's own origin may sit off to one side; measured with inst at the origin)
    inst.updateMatrixWorld(true);
    const box = drawnBox(obj);
    if (!box.isEmpty()) { const c = box.getCenter(new THREE.Vector3()); obj.position.x -= c.x; obj.position.z -= c.z; }
    inst.position.set(e.x, 0, e.z);
    this.root.add(inst);
    inst.updateMatrixWorld(true);
    // the name board, on the walking side
    const bh = e.it.labelH || Math.min(10, Math.max(1.1, Math.max(e.w, e.d) * 0.05 + 0.9));
    const label = board(e.it.label || e.it.id, bh, COLOR[e.lane]);
    label.position.set(0, bh * 0.5 + 0.3, e.d / 2 + (e.it.labelZ ?? 3 + bh * 0.4));
    inst.add(label);
    // colliders: the item's own (kit-built things carry real specs) or one box round what was built
    if (e.it.solid !== false) {
      const specs = [];
      // (obj sits inside inst; the specs are in obj's frame, which differs from inst's only by obj.position: a pure translation)
      const at = (x, y, z) => new THREE.Vector3(e.x + obj.position.x + x, y, e.z + obj.position.z + z);
      // grind rails (a snake rock's crest line, rails.js): polylines in obj's frame like the colliders, standing in the flat world while it is built.
      // A collider's `rail` is the index of the one it belongs to (the rider on a crest doesn't collide with its own rock).
      e.rails = (made.rails || []).map((pts) => this.world.addRail(pts.map((p) => at(p.x, p.y, p.z))));
      const own = (b) => (b.rail === undefined ? {} : { rail: e.rails[b.rail].pts });
      if (made.cols) { // (an array, even an empty one, is the item's own word on it; none at all: one box round what was built)
        for (const b of made.cols) {
          if (b.type === 'sphere') specs.push({ type: 'sphere', c: at(b.x, b.y, b.z), r: b.r });
          else if (b.type === 'cyl') specs.push({ type: 'cyl', c: at(b.x, 0, b.z), axis: UP.clone(), y0: b.y0, y1: b.y1, r: b.r });
          else if ((b.type === 'box' || b.type === undefined) && b.ax) specs.push({ type: 'box', c: at(b.x, b.y, b.z), hx: b.hx, hy: b.hy, hz: b.hz, ax: b.ax.clone(), ay: b.ay.clone(), az: b.az.clone(), ...own(b) }); // (a full spec: a tilted ramp, a snake's sloping tip)
          else if (b.type === 'box' || b.type === undefined) {
            const q = new THREE.Quaternion().setFromAxisAngle(UP, b.yaw || 0);
            specs.push({ type: 'box', c: at(b.x, b.y, b.z), hx: b.hx, hy: b.hy, hz: b.hz, ax: new THREE.Vector3(1, 0, 0).applyQuaternion(q), ay: UP.clone(), az: new THREE.Vector3(0, 0, 1).applyQuaternion(q), ...own(b) });
          }
        }
      } else if (!box.isEmpty()) {
        const b2 = drawnBox(obj), c2 = b2.getCenter(new THREE.Vector3()), s2 = b2.getSize(new THREE.Vector3());
        specs.push({ type: 'box', c: c2, hx: s2.x / 2, hy: s2.y / 2, hz: s2.z / 2, ax: new THREE.Vector3(1, 0, 0), ay: UP.clone(), az: new THREE.Vector3(0, 0, 1) });
      }
      e.cols = specs.map((s) => g.colliders.add(s));
    }
    // what it really measures, for the checks (and to see at a glance when a declared size is off)
    e.measured = box.isEmpty() ? null : box.getSize(new THREE.Vector3()).toArray().map((v) => Math.round(v * 10) / 10);
  }

  dropItem(e) {
    const g = this.game;
    for (const c of e.cols) g.colliders.remove(c);
    e.cols = [];
    for (const r of e.rails) this.world.removeRail(r);
    e.rails = [];
    if (e.api && e.api.dispose) { try { e.api.dispose(); } catch (err) { console.warn('[assetRow] dispose', e.it.id, err); } }
    if (e.inst) { e.inst.removeFromParent(); disposeTree(e.inst); }
    e.inst = null; e.api = null; e.state = 'off'; e.failed = false;
  }

  // distance in the ground plane from p to an item's footprint
  reach(e, p) {
    const dx = Math.max(0, Math.abs(p.x - e.x) - e.w / 2), dz = Math.max(0, Math.abs(p.z - e.z) - e.d / 2);
    return Math.hypot(dx, dz);
  }

  stream(budgetMs) {
    const p = this.game.player.pos, t0 = performance.now();
    for (const e of this.items) {
      const d = this.reach(e, p);
      if (e.state === 'on' && d > DROP_R) this.dropItem(e);
      else if (e.state === 'off' && d < BUILD_R) {
        if (performance.now() - t0 > budgetMs) break; // (the rest next frame)
        this.buildItem(e);
      }
    }
  }

  // ---------------------------------------------------------------------------------------------
  start() {
    const g = this.game;
    if (this.active) { this.respawnAt(); return; }
    if (g.spindle.active) { g.hud.toast('Leave the Spindle first.', 2.5); return; }
    this.build();
    this.active = true;
    this.t = 0;
    this.nearTerminal = null;
    // remember where you were, and what a visit must not change
    this.back = { pos: g.player.pos.clone(), fwd: g.cam.fwd.clone(), pitch: g.cam.pitch };
    this.keep = { credits: g.credits, stats: JSON.parse(JSON.stringify(g.stats)) };
    // nothing carries over: a vehicle, a ride, the winch line, a ragdoll, shots in flight
    if (g.player.vehicle) g.garage.exit();
    if (g.garage.active) g.garage.active.model.root.visible = false;
    if (g.rides && g.rides.exit) g.rides.exit();
    if (g.winch && g.winch.release) g.winch.release(true);
    if (g.player.rag) { g.player.rag.release(); g.player.rag = null; }
    g.projectiles.clear();
    // hide (and freeze) the Moon; whatever must keep drawing stays
    const keep = new Set([this.root, g.player.model.root, g.sun.target, g.earthLight.target, g.fx.pMesh, ...(g.fx.trails || []).map((t) => t.mesh)]);
    this.hidden = g.scene.children.filter((o) => o.visible && !keep.has(o) && !o.isLight && !o.userData.persist);
    for (const o of this.hidden) o.visible = false;
    this.root.visible = true;
    this.savedPlanet = g.planet;
    g.planet = this.world;
    this.world.colliders = g.colliders;
    this.savedHemi = [g.hemi.color.getHex(), g.hemi.groundColor.getHex()];
    g.hemi.color.setHex(0xd8d4ff);
    g.hemi.groundColor.setHex(0x7a7298);
    GRAV.flat = UP;
    // the Moon's HUD (contract, event, territory, objective, prompts, minimap) has nothing to say here
    this.style = document.createElement('style');
    this.style.textContent = 'body.asset-row :is(#mission, #eventpanel, #scanchip, #techchip, #obj-arrow, #obj-marker, #zonewarn, #banner, #evpop, #terrchip, #minimap, #dilate) { display: none !important; }';
    document.head.appendChild(this.style);
    document.body.classList.add('asset-row');
    this.termCols = this.terminals.map((t) => g.colliders.add({ type: 'box', c: new THREE.Vector3(t.x, 1, t.z), hx: 0.9, hy: 1, hz: 0.6, ax: new THREE.Vector3(1, 0, 0), ay: UP.clone(), az: new THREE.Vector3(0, 0, 1) }));
    this.respawnAt();
    this.stream(1e9); // (what is round the start, all at once)
    g.hud.alert('ASSET ROW', '#2ee6ff', 2.5);
    g.hud.toast('Dev showroom: walk (or skate, or turn the dev speed up) along the row. Leave from the dev menu (F8) → full cheat menu → teleport, or teleport anywhere.', 6);
  }

  respawnAt(x = 0, z = 70) {
    const g = this.game;
    const p = new THREE.Vector3(x, 1.5, z), fwd = new THREE.Vector3(1, 0, 0);
    g.player.respawn(p, fwd);
    g.cam.fwd.copy(fwd);
    g.cam.up.copy(UP);
    g.cam.pitch = 0.05;
    g.updateCamera(0.016, true);
  }

  // back on the Moon, where you were. quiet: arriving some other way (the caller then moves you itself)
  exit(quiet = false) {
    const g = this.game;
    if (!this.active) return;
    this.active = false;
    if (g.grind) g.grind.active = null; // (a ride on one of the row's rails ends with it)
    for (const e of this.items) if (e.state === 'on') this.dropItem(e);
    for (const c of this.termCols || []) g.colliders.remove(c);
    this.termCols = null;
    g.hud.prompt(null);
    for (const o of this.hidden || []) o.visible = true;
    this.hidden = null;
    this.root.removeFromParent();
    disposeTree(this.root);
    this.root = null;
    g.planet = this.savedPlanet;
    this.savedPlanet = null;
    if (this.savedHemi) { g.hemi.color.setHex(this.savedHemi[0]); g.hemi.groundColor.setHex(this.savedHemi[1]); this.savedHemi = null; }
    GRAV.flat = null;
    document.body.classList.remove('asset-row');
    if (this.style) { this.style.remove(); this.style = null; }
    g.projectiles.clear();
    g.cam.up.copy(g.player.up);
    // what a visit must not change
    if (this.keep) { g.credits = this.keep.credits; g.stats = this.keep.stats; this.keep = null; }
    g.player.body.vel.set(0, 0, 0);
    if (g.settings && g.settings.apply) g.settings.apply(g); // (anything that was written to the planet while away: the detail setting)
    const b = this.back;
    this.back = null;
    if (b && !quiet) {
      g.planet.update(b.pos, { budgetMs: 1e9 });
      g.player.respawn(b.pos, b.fwd);
      g.cam.fwd.copy(b.fwd);
      g.cam.pitch = b.pitch;
      g.updateCamera(0.016, true);
    }
    // let the Moon's own chips repaint
    if (g.territory) g.territory.current = null;
  }

  // The terminal menu: every terminal (the plaza's, then each section's, in row order) as a jump, 7 to a page
  terminalMenu(page = 0) {
    const g = this.game;
    const per = 7, pages = Math.ceil(this.terminals.length / per);
    page = ((page % pages) + pages) % pages;
    const buttons = this.terminals.slice(page * per, page * per + per).map((t, i) => ({ label: `${i + 1} · ${t.name}`, fn: () => this.jumpTo(t) }));
    if (pages > 1) buttons.push({ label: `${buttons.length + 1} · NEXT PAGE (${page + 1}/${pages})`, fn: () => this.terminalMenu(page + 1) });
    buttons.push({ label: 'CLOSE' });
    g.dialog('ASSET ROW TERMINAL', '<small>Jump to the start of a section: the yellow lane is everything under 100 m across, the cyan one the big places.</small>', buttons);
  }

  // Stand in front of a terminal, facing down the row, and build what is round you
  jumpTo(t) {
    const g = this.game;
    this.respawnAt(t.x, t.z + 3.5);
    this.stream(1e9);
    g.fx.pop(`→ ${t.name}`, null, { color: t.color, size: 44 });
  }

  // every frame while here (main.js updateRow)
  update(dt) {
    const g = this.game, P = g.player;
    if (!this.active) return;
    this.t += dt;
    this.stream(BUILD_MS);
    // a terminal in reach: F opens its menu
    let near = null;
    for (const t of this.terminals) if (Math.hypot(P.pos.x - t.x, P.pos.z - t.z) < TERMINAL_R && P.pos.y < 8) { near = t; break; }
    if (near !== this.nearTerminal) { this.nearTerminal = near; g.hud.prompt(near ? 'F · TERMINAL: JUMP TO ANOTHER SECTION' : null); }
    if (near && g.input.pressed('KeyF') && g.boardCooldown <= 0) this.terminalMenu();
    for (const e of this.items) {
      if (e.state !== 'on' || !e.api || !e.api.update) continue;
      // (a demo that drives a live system breaks when that system changes: one that throws is switched off, it must not stop the whole frame)
      try { e.api.update(dt, this.t); } catch (err) { console.warn('[assetRow] update failed, switched off:', e.it.id, err); e.api.update = null; }
    }
    // flat, even light: a high sun, the sky fill straight up, no moonlight, no helmet lamp
    const sunDir = _sd.set(0.45, 0.8, 0.4).normalize();
    g.sun.intensity = 1.5;
    g.hemi.position.copy(UP);
    g.hemi.intensity = 0.95;
    g.earthLight.intensity = 0.2;
    P.lamp.intensity = 0; P.glowLight.intensity = 0;
    const snap = 320 / 2048;
    const lz = sunDir, lx = _lx.set(0, 1, 0).cross(lz).normalize(), ly = _ly.copy(lz).cross(lx);
    const sp = _sp.copy(lx).multiplyScalar(Math.round(P.pos.dot(lx) / snap) * snap).addScaledVector(ly, Math.round(P.pos.dot(ly) / snap) * snap).addScaledVector(lz, P.pos.dot(lz));
    g.sun.target.position.copy(sp);
    g.sun.position.copy(sp).addScaledVector(sunDir, 600);
    g.earthLight.target.position.copy(P.pos);
    g.earthLight.position.copy(P.pos).addScaledVector(_sd.set(-0.5, 0.6, -0.3), 600);
    g.renderer.shadowMap.autoUpdate = true;
    this.sky.position.copy(g.camera.position);
    // over the edge: back to the start of the row
    if (P.pos.y < FALL_LIMIT) {
      g.fx.pop('OVER THE EDGE', null, { color: '#ff2e88', size: 56 });
      this.respawnAt();
    }
  }
}
const _sd = new THREE.Vector3(), _lx = new THREE.Vector3(), _ly = new THREE.Vector3(), _sp = new THREE.Vector3();
