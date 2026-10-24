import * as THREE from 'three';
import data from './assets/idles.json';

// The courier's idles (tools/blender/build_idles.py writes src/assets/idles.json). When stopped the breath (clip 0) loops;
// every 10-30 s one of the others plays once, in shuffled rounds so all come up before any repeats. Blended over animate()'s
// pose: eases in after a moment still, out when you move, skate, jump or go limp.
const FADE_IN = 0.4;    // s ease in after stopping
const FADE_OUT = 0.2;   // s ease out to the run / skate / air pose
const CROSS = 0.5;      // s cross-fade between clips
const SETTLE = 0.25;    // s still before it starts
const GAP_MIN = 10, GAP_MAX = 30; // s of breath between occasional idles
const STOP_BELOW = 0.6, MOVE_ABOVE = 1.2; // m/s hysteresis: stopped / moving again
const DEFAULT = 0;      // the breath

const ROT = ['torso', 'head', 'armL', 'armR', 'foreL', 'foreR', 'legL', 'legR']; // pivots the clips turn
const POS = ['body', 'torso'];                                   // ...and shift

const CLIPS = data.anims.map(a => ({
  name: a.name,
  n: a.n,
  dur: a.n / data.fps,
  q: Object.fromEntries(Object.entries(a.q).map(([k, v]) => [k, Float32Array.from(v)])),
  p: Object.fromEntries(Object.entries(a.p).map(([k, v]) => [k, Float32Array.from(v)])),
}));

const _qb = new THREE.Quaternion(), _v = new THREE.Vector3();

function makePose() {
  const pose = { q: {}, p: {} };
  for (const k of ROT) pose.q[k] = new THREE.Quaternion();
  for (const k of POS) pose.p[k] = new THREE.Vector3();
  return pose;
}

// a clip at `t` s (looping), interpolated between stored frames
function sample(clip, t, out) {
  const f = (t * data.fps) % clip.n, i = Math.floor(f), k = f - i, j = (i + 1) % clip.n;
  for (const key of ROT) {
    const a = clip.q[key];
    if (a) out.q[key].fromArray(a, i * 4).slerp(_qb.fromArray(a, j * 4), k);
    else out.q[key].identity();
  }
  for (const key of POS) {
    const a = clip.p[key];
    if (a) out.p[key].fromArray(a, i * 3).lerp(_v.fromArray(a, j * 3), k);
    else out.p[key].set(0, 0, 0);
  }
}

export class Idle {
  constructor() {
    this.on = false;       // stopped for at least SETTLE
    this.hold = 0;         // s stopped so far
    this.w = 0;            // idle weight 0..1
    this.touched = false;  // figure carries last frame's idle (begin() removes it)
    this.dy = 0;           // body height the idle added last frame
    this.bag = [];
    this.last = -1;
    this.rig = null;       // model the rest positions belong to
    this.rest = null;
    this.cur = makePose(); this.old = makePose();
    this.restart();
  }

  // back to the breath with a fresh wait
  restart() {
    this.fresh = true;
    this.clip = DEFAULT; this.t = 0;
    this.prev = -1; this.prevT = 0; this.x = 1;
    this.wait = GAP_MIN + Math.random() * (GAP_MAX - GAP_MIN);
  }

  // Before animate(): remove last frame's idle, since the run/skate/air poses only set the angles they use.
  begin(m) {
    if (!this.touched) return;
    this.touched = false;
    for (const k of ROT) m[k].rotation.set(0, 0, 0);
    m.body.position.x = this.rest.bodyX; m.body.position.z = this.rest.bodyZ;
    m.body.position.y -= this.dy; this.dy = 0;
    m.torso.position.copy(this.rest.torso);
  }

  // something took over the figure (seat, vehicle, rail, cutscene): drop the idle
  cancel(m) {
    this.begin(m);
    this.on = false; this.hold = 0; this.w = 0;
    if (!this.fresh) this.restart();
  }

  // After animate(). `calm`: grounded, no move input, skates off, not limp. `cut`: airborne or limp, so the idle
  // drops at once (the pose snaps anyway); otherwise it fades out.
  apply(m, dt, calm, speed, cut) {
    if (this.rig !== m) { // first use, or model swapped
      this.rig = m;
      this.rest = { bodyX: m.body.position.x, bodyZ: m.body.position.z, torso: m.torso.position.clone() };
    }
    const still = calm && speed < (this.on ? MOVE_ABOVE : STOP_BELOW);
    this.hold = still ? this.hold + dt : 0;
    this.on = still && (this.on || this.hold > SETTLE);
    if (this.on) this.w = Math.min(1, this.w + dt / FADE_IN);
    else if (cut) this.w = 0;
    else this.w = Math.max(0, this.w - dt / FADE_OUT);
    if (this.w <= 0) { if (!this.on && !this.fresh) this.restart(); return; }

    this.fresh = false;
    this.advance(dt);
    sample(CLIPS[this.clip], this.t, this.cur);
    if (this.prev >= 0) { // cross-fade; the previous clip keeps playing as it fades
      sample(CLIPS[this.prev], this.prevT, this.old);
      const s = this.x * this.x * (3 - 2 * this.x);
      for (const k of ROT) this.old.q[k].slerp(this.cur.q[k], s);
      for (const k of POS) this.old.p[k].lerp(this.cur.p[k], s);
      this.pose = this.old;
    } else this.pose = this.cur;

    const e = this.w * this.w * (3 - 2 * this.w);
    for (const k of ROT) m[k].quaternion.slerp(this.pose.q[k], e);
    const pb = this.pose.p.body, pt = this.pose.p.torso;
    m.body.position.x = this.rest.bodyX + pb.x * e;
    m.body.position.z = this.rest.bodyZ + pb.z * e;
    this.dy = pb.y * e;
    m.body.position.y += this.dy;
    m.torso.position.set(this.rest.torso.x + pt.x * e, this.rest.torso.y + pt.y * e, this.rest.torso.z + pt.z * e);
    this.touched = true;
  }

  advance(dt) {
    this.t += dt;
    if (this.prev >= 0) {
      this.prevT += dt;
      this.x += dt / CROSS;
      if (this.x >= 1) this.prev = -1;
    }
    if (this.clip === DEFAULT) {
      if (this.on && (this.wait -= dt) <= 0) this.play(this.next());
    } else if (this.t >= CLIPS[this.clip].dur) {
      this.play(DEFAULT);
      this.wait = GAP_MIN + Math.random() * (GAP_MAX - GAP_MIN);
    }
  }

  play(i) {
    this.prev = this.clip; this.prevT = this.t;
    this.clip = i; this.t = 0; this.x = 0;
  }

  // next occasional idle: shuffled rounds, never the one just played
  next() {
    if (!this.bag.length) {
      for (let i = 0; i < CLIPS.length; i++) if (i !== DEFAULT) this.bag.push(i);
      for (let i = this.bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
      }
      if (this.bag.length > 1 && this.bag[this.bag.length - 1] === this.last) this.bag.unshift(this.bag.pop());
    }
    return (this.last = this.bag.pop());
  }
}
