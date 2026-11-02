import * as THREE from 'three';

// Animating on twos (the Animate on twos setting): a figure's pose is shown in held steps, TWOS.fps a second, as hand-drawn
// animation is, while the figure itself moves through the world every frame and the camera never steps. Only the joints
// hold (the pivots under a figure's root), never the root.
//
// PoseHold keeps two poses per joint: the live one the animation code works from, and the held one on screen. Around the
// animation: pre() puts the live pose back (code that eases a joint toward a target eases from where it really is, not
// from the held pose), post(dt) records the new live pose, and shows it if a step is due, else the held one.
export const TWOS = { on: true, fps: 12 };

export class PoseHold {
  // `parts`: the joints (Object3Ds whose position, rotation and scale the animation sets); `root`: take every non-mesh
  // descendant of it instead (the pivots of a Blender figure)
  constructor(parts = null, root = null) {
    if (!parts) {
      parts = [];
      if (root) root.traverse((o) => { if (o !== root && !o.isMesh && !o.isLight && !o.isCamera) parts.push(o); });
    }
    this.parts = parts.filter(Boolean);
    this.live = this.parts.map((o) => ({ p: o.position.clone(), q: o.quaternion.clone(), s: o.scale.clone() }));
    this.held = this.parts.map((o) => ({ p: o.position.clone(), q: o.quaternion.clone(), s: o.scale.clone() }));
    this.t = Math.random() / TWOS.fps; // (figures out of step with each other, as a crowd drawn by hand is)
    this.showing = false;
  }

  pre() {
    if (!this.showing) return;
    this.parts.forEach((o, i) => { const l = this.live[i]; o.position.copy(l.p); o.quaternion.copy(l.q); o.scale.copy(l.s); });
    this.showing = false;
  }

  post(dt) {
    if (!TWOS.on) return;
    this.parts.forEach((o, i) => { const l = this.live[i]; l.p.copy(o.position); l.q.copy(o.quaternion); l.s.copy(o.scale); });
    this.t += dt;
    if (this.t >= 1 / TWOS.fps) {
      this.t %= 1 / TWOS.fps;
      this.parts.forEach((o, i) => { const h = this.held[i], l = this.live[i]; h.p.copy(l.p); h.q.copy(l.q); h.s.copy(l.s); });
      return; // (the new pose is on screen as it is)
    }
    this.parts.forEach((o, i) => { const h = this.held[i]; o.position.copy(h.p); o.quaternion.copy(h.q); o.scale.copy(h.s); });
    this.showing = true;
  }
}

// a hold kept on an object's userData, made on first use (for figures made elsewhere)
export function holdOf(root) {
  return root.userData.poseHold || (root.userData.poseHold = new PoseHold(null, root));
}

// For gaits drawn straight from a phase (the simple walkers): the phase to draw, held on `f` (f.twosT, f.twosPh) and
// caught up TWOS.fps times a second. The walker keeps moving smoothly; only its stride steps.
export function heldPhase(f, phase, dt) {
  if (!TWOS.on) return phase;
  if (f.twosPh === undefined) { f.twosPh = phase; f.twosT = Math.random() / TWOS.fps; }
  f.twosT += dt;
  if (f.twosT >= 1 / TWOS.fps) { f.twosT %= 1 / TWOS.fps; f.twosPh = phase; }
  return f.twosPh;
}
