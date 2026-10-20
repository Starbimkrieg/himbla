import * as THREE from 'three';
import { makeShuttle } from './models.js';
import { frameQuat, tangent } from './geo.js';
import { FACTIONS } from './locations.js';

// Emergency recall: ₵100 and a cutscene. A shuttle lands at your home base, drops its ramp, and you stroll out.
const RECALL_COST = 100;

const SCALE = 0.85;
const SET_BACK = 15; // m, shuttle centre behind your stand point
const ease = (k) => 1 - Math.pow(1 - Math.min(1, Math.max(0, k)), 3);
const _v = new THREE.Vector3();

// Landing site: settlements are cluttered, so site() tries the usual spot, then swings round you in 30° steps at each
// of SET_BACKS, and takes the first clear one.
const SET_BACKS = [SET_BACK, 18, 21, 24];
const SWINGS = [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6]; // × 30°
// footprint at SCALE: 13.4 m wide, ramp foot 11.4 m ahead of centre (toward you), nose 8.7 m behind. Values are probe-ball
// centre lines: that far in from each edge, plus 0.5 m of room
const HALF_W = 6.2, AHEAD = 10.9, BEHIND = 8.2, RAMP_FOOT = 11.4;
const BALL = 1, GAP = 2; // m: probe ball radius, max probe spacing (balls touch, so only sub-metre things slip through)
const FLAT = 1; // m the ground may rise or fall from the touchdown point
const COL_H = [1.2, 3.2, 5.2, 7.2, 9.2, 11.2, 13.2, 16, 20, 25, 31, 38, 46, 56, 68, 82, 100]; // heights probed up the descent column
const CAM_SIDE = 22, CAM_AHEAD = 13, CAM_UP = 6; // cinematic camera, off the shuttle's flank
const LEG_A = 0.66; // s from the hold to the ramp's foot
const WALK_SPEED = 6.5; // m/s from the ramp's foot to your spot
const _near = [], _n = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();

// A (scaled) shuttle on its gear over `land`, alt m up, nose along fwd, pitched by tilt (also the Spindle's med-evac craft)
export function poseShuttle(s, land, up, fwd, alt, tilt = 0) {
  s.root.position.copy(land).addScaledVector(up, s.gearH * s.root.scale.x + alt);
  frameQuat(up, fwd, s.root.quaternion);
  if (tilt) s.root.rotateX(tilt);
}

export class Recall {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.failed = []; // [{ line, short }] failed by this recall: listed during the scene, then in a toast
    this.leaving = null; // shuttle flying off after the scene
    this.bars = document.createElement('div');
    this.bars.id = 'cinebars';
    this.bars.className = 'hidden';
    this.bars.innerHTML = '<div class="cb-top"></div><div class="cb-bot"></div><div class="cb-cap"></div><div class="cb-skip">SPACE · SKIP</div>';
    document.getElementById('hud').appendChild(this.bars);
  }

  request() {
    const g = this.game;
    if (this.active) return;
    if (g.credits < RECALL_COST) { g.hud.toast(`Emergency recall costs ₵${RECALL_COST}. You can't afford the shuttle.`, 2.5); return; }
    if (g.player.vehicle) g.garage.exit();
    if (g.rides.ride) g.rides.exit();
    g.credits -= RECALL_COST;
    g.audio.cash();
    this.start();
  }

  // What the recall fails: contracts (both on a Twin Cradle), the active event, the current story chapter.
  // `line` for the list panel, `short` for the toast. The Spindle's chapter is exempt (own retry; no recall there).
  activeWork() {
    const g = this.game;
    const M = g.missions, E = g.events, S = g.story;
    const rows = [];
    if (M.active) rows.push({ line: `Contract: ${M.active.cargo.name} → ${M.active.to.name}`, short: M.active.cargo.name });
    if (M.extra) rows.push({ line: `Second contract: ${M.extra.a.cargo.name} → ${M.extra.a.to.name}`, short: M.extra.a.cargo.name });
    if (E.active) {
      const f = FACTIONS[E.active.faction];
      rows.push({ line: `${f ? f.name + ' event' : 'Event'}: ${E.active.title}`, short: E.active.title });
      if (E.active.type === 'wreck') rows.push({ line: "The pirate didn't make it: Rustmoon is closed to you for good.", short: null });
    }
    if (S.active && !(g.spindle && g.spindle.active)) {
      rows.push({ line: `Story: ${S.active.def.title} (${FACTIONS[S.active.f].name}, chapter ${S.active.idx + 1})`, short: S.active.def.title });
    }
    return rows;
  }

  // Fails it all quietly (the list is the message) and clears the story chip and hold meter, which only a play frame
  // would refresh. Returns what failed. Called first in start(), since nothing ticks during the scene (clocks would freeze).
  failActiveWork() {
    const g = this.game;
    const rows = this.activeWork();
    if (!rows.length) return [];
    const M = g.missions, E = g.events, S = g.story;
    M.failAll('Emergency recall: contract forfeited.', true);
    if (E.active) E.fail(E.active, 'Emergency recall: event failed.', true);
    if (S.active && !(g.spindle && g.spindle.active)) S.fail('Emergency recall: chapter failed.', true);
    g.hud.eventPanel(S.panel()); // null now: hides the story/event chip and fluid canvas
    S.renderMeter();
    g.audio.hurt();
    return rows;
  }

  start() {
    const g = this.game;
    const P = g.player;
    this.failed = this.failActiveWork(); // the tutorial's free shuttle comes through here too
    const home = g.home();
    this.home = home;
    this.active = true;
    this.t = 0;
    this.landed = false;
    this.opened = false;
    this.walked = false;
    g.state = 'cutscene';
    if (this.leaving) { this.leaving.root.removeFromParent(); this.leaving = null; }
    // landing spot near your stand point, clear of clutter
    g.planet.update(home.point, { budgetMs: 1e9 });
    const site = this.site(home);
    this.land = site.land;
    this.up = this.land.clone().normalize();
    this.fwd = site.dir; // shuttle toward your stand point (ramp end)
    this.spot = site; // and the camera's flank (camera())
    // stroll time from the ramp's foot scales with the distance
    this.walkT = LEG_A + Math.max(0.54, Math.min(3, Math.max(0, this.land.distanceTo(home.point) - RAMP_FOOT) / WALK_SPEED));
    this.endAt = 3.4 + this.walkT + 0.6;
    if (this.failed.length) g.hud.failedList('SHUTTLE RECALL: WORK FAILED', this.failed.map((r) => r.line), this.endAt + 0.5); // up for the whole scene
    // shuttle behind your stand point, nose away, so the rear door drops toward you
    const s = makeShuttle({ color: 0xfff4e0, stripe: g.rep.aligned() ? 0x7dff3a : 0x2ec4ff });
    s.setSign('RECALL');
    s.root.scale.setScalar(SCALE);
    s.setGear(0);
    s.setRamp(0);
    g.scene.add(s.root);
    this.shuttle = s;
    this.pose(140);
    // aboard and hidden, reset to rest pose (the cutscene never runs the skating pose, so the lean and scarf would stick)
    P.respawn(home.point, home.facing);
    P.restPose();
    P.model.root.visible = false;
    g.cam.fwd.copy(home.facing);
    // cinema bars + caption
    this.bars.querySelector('.cb-cap').textContent = `MEANWHILE, ABOVE ${home.loc.name.toUpperCase()}…`;
    this.bars.classList.remove('hidden', 'cb-out');
    g.hud.prompt(null);
    g.audio.tone(70, 2.6, 'sawtooth', 0.12, 0.6);
  }

  // is a ball of radius r at p inside a building or prop? (moving decks, like the satellite's, don't count)
  solid(p, r) {
    const C = this.game.colliders;
    for (const c of C.query(p, r, _near)) if (!c.platform && C.contact(c, p, r, _n) > 0) return true;
    return false;
  }

  // Clutter count for landing at `land`, ramp toward `dir`: blocked or unlevel footprint columns plus blocked spots on
  // the walk to `stand`. 0 = clear. Stops at `limit` (can't beat the best so far).
  clutter(land, dir, stand, limit = Infinity) {
    const g = this.game;
    const up = _a.copy(land).normalize();
    const right = _b.crossVectors(dir, up).normalize();
    const r0 = g.planet.surface(land);
    const ground = (p, lift) => p.normalize().multiplyScalar(g.planet.surface(p) + lift);
    const nu = Math.ceil((AHEAD + BEHIND) / GAP), nv = Math.ceil((2 * HALF_W) / GAP);
    let n = 0;
    for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) {
      const base = _c.copy(land).addScaledVector(dir, -BEHIND + ((AHEAD + BEHIND) * i) / nu).addScaledVector(right, -HALF_W + ((2 * HALF_W) * j) / nv);
      if (Math.abs(g.planet.surface(base) - r0) > FLAT) n++;
      else {
        ground(base, 0);
        for (const h of COL_H) if (this.solid(_v.copy(base).addScaledVector(up, h), BALL)) { n++; break; }
      }
      if (n >= limit) return n;
    }
    // the walk from the ramp's foot, at hip height
    const foot = _c.copy(land).addScaledVector(dir, RAMP_FOOT);
    const len = foot.distanceTo(stand);
    for (let i = 0, k = Math.ceil(len / 0.8); i <= k; i++) {
      _v.lerpVectors(foot, stand, i / k);
      if (this.solid(ground(_v, 1), 0.55)) n++;
    }
    return n;
  }

  // landing site: the usual spot, else the nearest clear one (or least cluttered); also the camera's flank
  site(home) {
    const g = this.game;
    const stand = home.point;
    const standUp = stand.clone().normalize();
    const back = tangent(home.facing.clone().negate(), standUp).normalize(); // away from where you face
    let best = null;
    search: for (const d of SET_BACKS) for (const k of SWINGS) {
      const at = back.clone().applyAxisAngle(standUp, k * Math.PI / 6);
      const land = g.planet.ground(stand.clone().addScaledVector(at, d));
      const up = land.clone().normalize();
      const dir = tangent(stand.clone().sub(land), up).normalize();
      const n = this.clutter(land, dir, stand, best ? best.n : Infinity);
      if (!best || n < best.n) best = { land, dir, up, n };
      if (n === 0) break search;
    }
    best.right = new THREE.Vector3().crossVectors(best.dir, best.up).normalize();
    // camera on the side with a clear view of the shuttle
    const focus = best.land.clone().addScaledVector(best.up, 2.5);
    best.side = 1;
    for (const side of [1, -1]) {
      const cam = this.camSpot(best, side);
      if (!this.solid(cam, 2) && g.clearSight(cam, focus)) { best.side = side; break; }
    }
    return best;
  }

  camSpot(site, side, out = new THREE.Vector3()) {
    return out.copy(site.land).addScaledVector(site.right, CAM_SIDE * side).addScaledVector(site.dir, CAM_AHEAD).addScaledVector(site.up, CAM_UP);
  }

  pose(alt, tilt) { poseShuttle(this.shuttle, this.land, this.up, _v.copy(this.fwd).negate(), alt, tilt); }

  // cinematic camera off to the side
  camera() {
    const g = this.game;
    const cam = g.camera;
    const focus = this.land.clone().addScaledVector(this.up, 2.5 + Math.max(0, this.shuttleAlt || 0) * 0.6);
    this.camSpot(this.spot, this.spot.side, cam.position);
    cam.up.copy(this.up);
    cam.lookAt(focus);
    g.cam.position.copy(cam.position);
  }

  update(dt) {
    const g = this.game;
    const P = g.player;
    if (this.leaving) this.flyAway(dt);
    if (!this.active) return;
    if (g.input.pressed('Space') || g.input.pressed('Enter')) this.t = Math.max(this.t, this.endAt);
    this.t += dt;
    const t = this.t;
    const s = this.shuttle;
    // 0–2.4 s: descend on retro-thrusters
    if (t < 2.4) {
      this.shuttleAlt = 140 * (1 - ease(t / 2.4));
      this.pose(this.shuttleAlt, Math.sin(t * 3) * 0.04);
      s.setGear(Math.min(1, Math.max(0, 1 - (this.shuttleAlt - 4) / 30)));
      s.setThrust(0.3, 1, t);
      if (Math.random() < dt * 40) g.fx.spawn(s.root.position.clone().addScaledVector(this.up, -3), this.up.clone().multiplyScalar(-18), { color: Math.random() < 0.5 ? 0xff9f1c : 0xffd23f, size: 0.6, life: 0.4, count: 2, spread: 2 });
    } else {
      this.shuttleAlt = 0;
      this.pose(0);
      s.setGear(1);
      s.setThrust(0, Math.max(0, 1 - (t - 2.4) * 2), t);
      if (!this.landed) {
        this.landed = true;
        g.fx.dust(this.land, new THREE.Vector3(), 30, this.up);
        g.audio.thud(30);
        g.cam.shake = 0.5;
        g.fx.pop('TOUCHDOWN!', this.land.clone().addScaledVector(this.up, 7), { color: '#2ee6ff', size: 52 });
      }
    }
    // 2.8–3.4 s: the rear door drops into a ramp
    if (t > 2.8) s.setRamp(ease((t - 2.8) / 0.6));
    // 3.4 s on: walk out of the hold, down the ramp, to your spot
    if (t > 3.4) {
      const wt = t - 3.4;
      const k = Math.min(1, wt / this.walkT);
      s.root.updateMatrixWorld(true);
      const a = s.root.localToWorld(s.inside.clone()), b = s.root.localToWorld(s.rampBottom.clone());
      const to = this.home.point.clone();
      if (wt < LEG_A) P.body.pos.lerpVectors(a, b, ease(wt / LEG_A));
      else P.body.pos.lerpVectors(b, to, ease((wt - LEG_A) / (this.walkT - LEG_A)));
      P.body.vel.set(0, 0, 0);
      P.model.root.visible = true;
      P.model.root.position.copy(P.body.pos);
      P.heading.copy(this.fwd).negate();
      frameQuat(this.up, P.heading, P.model.root.quaternion);
      // walk swing, fading as you arrive
      const w = Math.sin(t * 10) * 0.6 * (1 - k);
      P.model.legL.rotation.x = w; P.model.legR.rotation.x = -w;
      P.model.armL.rotation.x = -w * 0.9; P.model.armR.rotation.x = w * 0.9;
    }
    P.updateScarf(dt); // nothing else steps it during the scene
    this.camera();
    if (t >= this.endAt) this.end();
  }

  end() {
    const g = this.game;
    const P = g.player;
    this.active = false;
    // face the shuttle (facing away would put the camera inside the hull) and watch it lift off
    const toShip = this.fwd.clone().negate();
    P.respawn(this.home.point, toShip);
    P.restPose();
    P.model.root.visible = true;
    g.cam.fwd.copy(toShip);
    g.cam.pitch = 0.12;
    g.updateCamera(0.016, true);
    this.bars.classList.add('cb-out');
    setTimeout(() => this.bars.classList.add('hidden'), 400);
    g.state = 'play';
    if (this.failed.length) {
      // the list is where the arrival banner goes, so swap it for a toast (also covers a scene skipped at once)
      g.hud.hideResult();
      g.hud.toast(`Recall: failed ${[...new Set(this.failed.map((r) => r.short).filter(Boolean))].join(' · ')}`, 6);
      this.failed = [];
    }
    g.hud.banner(this.home.loc);
    this.leaving = { root: this.shuttle.root, t: 0, vel: 0 };
  }

  // after the scene: close up and climb away
  flyAway(dt) {
    const L = this.leaving, s = this.shuttle;
    L.t += dt;
    s.setRamp(Math.max(0, s.rampK - dt * 2));
    if (L.t > 0.6) {
      L.vel += dt * 30;
      L.root.position.addScaledVector(this.up, L.vel * dt);
      s.setGear(Math.max(0, s.gearK - dt * 0.6));
      s.setThrust(Math.min(1, (L.t - 0.6) * 0.5), 1, L.t);
      if (Math.random() < dt * 30) this.game.fx.spawn(L.root.position.clone().addScaledVector(this.up, -3), this.up.clone().multiplyScalar(-14), { color: 0xff9f1c, size: 0.5, life: 0.4, count: 1, spread: 1.5 });
    } else s.setThrust(0, L.t / 0.6, L.t);
    if (L.t > 8) { L.root.removeFromParent(); this.leaving = null; }
  }
}
