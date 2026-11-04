import * as THREE from 'three';
import { makeWeapon, WEAPON_KEYS } from './models.js';
import { AIM_SHOW } from './gamepad.js';

// The courier's weapon in hand (models.js makeWeapon; tools/blender/build_weapons.py, docs/weapon-proposals/). Shown as the
// crosshair is: drawn when you fire, put away AIM_SHOW s after the last shot (gamepad.js crosshair), and never in a
// vehicle, a ragdoll, a dive or a trick.
//
// An aim layer over the animated pose (player.js animate: restore() first, apply() last), worked in the figure's root
// frame (+z forward, +y up). The weapon hand is the one on screen right from behind, where the shots leave (cam.right
// is -x: the `armL` pivot, the rig's arms being named as seen from the front); the holds were worked out for the other
// hand in Blender (preview_weapons.py HOLDS), so they and the model are mirrored in x here (S = -1). For the weight k
// (eased in as it's drawn, out as it's put away):
//   - the torso turns into the stance (`twist`, the off-hand shoulder forward) plus the aim's yaw;
//   - the shoulders roll forward and in (`slide`): two-handed, no spot in front of the chest is in both hands' reach,
//     and the hands met inside the torso;
//   - the weapon hand goes to the grip (`grip`: from its shoulder, outward / forward / up, turned with the aim's yaw and
//     its pitch about the shoulder), the off hand to the weapon's `fore` point, each arm by two-bone IK (the elbow an
//     exact hinge about the arm's own x, as the pivots bend), slerped over the animated pose by k;
//   - the weapon hangs from the weapon hand's forearm, so it steps with the arm when animating on twos (twos.js).
// On foot the courier faces where the camera looks while the weapon is out (player.js); skating, he faces his way and the
// aim turns the torso, up to AIM_YAW.

const S = -1;                                  // the weapon hand's side (x sign)
const HOLDS = {
  pistol: { twist: -0.25, slide: 0, grip: [-0.08, 0.55, -0.12] },
  chest: { twist: 0.6, slide: 0.24, grip: [-0.2, 0.4, -0.3] },
  under: { twist: 0.6, slide: 0.24, grip: [-0.2, 0.4, -0.3] },
};
const AIM_YAW = 1.0, AIM_PITCH = 0.7;          // rad: how far the aim turns the hold from the body
const DRAW_T = 0.15, HOLSTER_T = 0.35;         // s to bring it up, to put it away
const GLOVE = new THREE.Vector3(0, -0.325, 0.01); // the glove's middle in the forearm's frame

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _e = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _qr = new THREE.Quaternion();
const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0), RIGHT = new THREE.Vector3(1, 0, 0);

export class WeaponView {
  constructor(model, laser) {
    this.m = model;
    this.k = 0;                                // drawn: 0 (away) to 1 (up)
    this.key = null;
    this.out = false;                          // wanted out (player.js turns him to the camera on foot)
    this.hand = model.foreL; this.handArm = model.armL; this.off = model.foreR; this.offArm = model.armR;
    this.armRest = [model.armL.position.clone(), model.armR.position.clone()];
    this.weapons = {};
    for (const k of WEAPON_KEYS) {
      const w = makeWeapon(k, laser);
      w.visible = false;
      w.matrixAutoUpdate = true;
      this.hand.add(w);
      this.weapons[k] = w;
    }
    this.saved = null;
    this.aimQ = new THREE.Quaternion();
  }

  // put it away at once (a ragdoll, a cutscene)
  hide() {
    this.k = 0;
    for (const w of Object.values(this.weapons)) w.visible = false;
  }

  // the muzzle's world position, or null while it isn't up (the shot then leaves where it always did)
  muzzle(out) {
    const w = this.key && this.weapons[this.key];
    if (!w || this.k < 0.5) return null;
    return w.localToWorld(out.fromArray(w.userData.muzzle || [0, 0.15, 0.4]));
  }

  // put back what apply() changed (animate sets only the angles it uses, so the rest would carry over)
  restore() {
    const s = this.saved, m = this.m;
    if (!s) return;
    m.torso.rotation.y = s.ty;
    m.armL.position.copy(this.armRest[0]); m.armR.position.copy(this.armRest[1]);
    for (const [o, e] of s.eulers) o.rotation.copy(e);
    this.saved = null;
  }

  // want: weapon key or null (none: put it away); aimDir: world unit vector; dt
  apply(want, aimDir, dt, laser) {
    const m = this.m;
    this.out = !!want;
    const switching = want && this.key && want !== this.key;        // switching: the one in hand goes down, the new one comes up
    const target = want && !switching ? 1 : 0;
    if (target > this.k) this.k = Math.min(1, this.k + dt / DRAW_T);
    else if (target < this.k) this.k = Math.max(0, this.k - dt / (switching ? DRAW_T : HOLSTER_T));
    if (want && (!this.key || (switching && this.k === 0))) this.key = want;
    for (const [k, w] of Object.entries(this.weapons)) w.visible = k === this.key && this.k > 0.02;
    if (this.k <= 0) return;
    const w = this.weapons[this.key], H = HOLDS[w.userData.hold] || HOLDS.pistol;
    if (laser != null && w.userData.laserMat && w.userData.laserMat.color.getHex() !== laser) w.userData.laserMat.color.setHex(laser);
    const e = this.k * this.k * (3 - 2 * this.k);
    const two = !!w.userData.fore;
    this.saved = { ty: m.torso.rotation.y, eulers: [m.armL, m.armR, m.foreL, m.foreR].map((o) => [o, o.rotation.clone()]) };

    // the aim in the root's frame: its yaw and pitch from the body, limited
    const root = m.root;
    root.updateMatrixWorld(true);
    _qr.copy(root.getWorldQuaternion(_q)).invert();
    const d = _a.copy(aimDir).applyQuaternion(_qr);
    const yaw = THREE.MathUtils.clamp(Math.atan2(d.x, d.z), -AIM_YAW, AIM_YAW);
    const pitch = THREE.MathUtils.clamp(Math.atan2(d.y, Math.hypot(d.x, d.z)), -AIM_PITCH, AIM_PITCH);

    // the torso into the stance (plus the aim's yaw), the shoulders rolled forward and in
    m.torso.rotation.y = this.saved.ty + e * (S * H.twist + yaw);
    m.armL.position.set(this.armRest[0].x + 0.3 * H.slide * e, this.armRest[0].y - 0.25 * H.slide * e, this.armRest[0].z + H.slide * e);
    m.armR.position.set(this.armRest[1].x - 0.3 * H.slide * e, this.armRest[1].y - 0.25 * H.slide * e, this.armRest[1].z + H.slide * e);
    root.updateMatrixWorld(true);

    // the grip: from the weapon shoulder, in the aim's frame (yaw about up, then pitch about the aim's right)
    const aimQ = this.aimQ.setFromAxisAngle(UP, yaw).multiply(_q2.setFromAxisAngle(RIGHT, -pitch));
    const sh = this.local(this.handArm, _b);
    const off = _c.set(S * H.grip[0], H.grip[2], H.grip[1]).applyQuaternion(aimQ);
    const grip = _d.copy(sh).add(off);
    // solve both arms fully, place the weapon on the hand at that pose, then ease the arms back toward the animated pose
    const from = [m.armL.quaternion.clone(), m.foreL.quaternion.clone(), m.armR.quaternion.clone(), m.foreR.quaternion.clone()];
    const pole = (side) => _e.set(side * 0.7, -1, -0.2).normalize();
    this.solve(this.handArm, this.hand, grip, pole(S));
    // the weapon: at the grip, turned with the aim, mirrored to this hand; set in the forearm's frame
    _m.compose(grip, aimQ, _a.set(S < 0 ? -1 : 1, 1, 1));
    _m2.copy(root.matrixWorld).multiply(_m);                       // world
    this.hand.updateMatrixWorld(true);
    _m.copy(this.hand.matrixWorld).invert().multiply(_m2);
    _m.decompose(w.position, w.quaternion, w.scale);
    if (two) {
      w.updateMatrixWorld(true);
      const fore = w.localToWorld(_b.fromArray(w.userData.fore));
      this.solve(this.offArm, this.off, root.worldToLocal(fore), pole(-S));
    }
    if (e < 1) {
      const pairs = two ? [[m.armL, 0], [m.foreL, 1], [m.armR, 2], [m.foreR, 3]] : [[this.handArm, S < 0 ? 0 : 2], [this.hand, S < 0 ? 1 : 3]];
      for (const [o, i] of pairs) { _q2.copy(o.quaternion); o.quaternion.copy(from[i]).slerp(_q2, e); }   // (the solved turn kept before the animated one goes back)
    }
  }

  // a pivot's position in the root's frame
  local(o, out) {
    return this.m.root.worldToLocal(o.getWorldPosition(out));
  }

  // two-bone IK in the root's frame: `arm` turned so `fore`'s glove reaches `target`, bending toward `pole`; the elbow
  // turns about the arm's own x, the forearm swinging toward the arm's front (+z)
  solve(arm, fore, target, pole) {
    const root = this.m.root;
    const S0 = this.local(arm, new THREE.Vector3());
    const a = this.local(fore, new THREE.Vector3()).distanceTo(S0);
    const b = GLOVE.length();
    const dv = target.clone().sub(S0);
    let L = dv.length();
    L = Math.min(L, (a + b) * 0.999);
    const dn = dv.normalize();
    const pl = pole.clone().addScaledVector(dn, -pole.dot(dn)).normalize();
    const ca = (a * a + L * L - b * b) / (2 * a * L), sa = Math.sqrt(Math.max(0, 1 - ca * ca));
    const E = S0.clone().addScaledVector(dn, a * ca).addScaledVector(pl, a * sa);
    const H = S0.clone().addScaledVector(dn, L);
    const du = E.clone().sub(S0).normalize(), df = H.clone().sub(E).normalize();
    const front = df.clone().addScaledVector(du, -df.dot(du));
    if (front.lengthSq() < 1e-8) front.copy(pl);
    front.normalize();
    const Yl = du.clone().negate(), Zl = front, Xl = new THREE.Vector3().crossVectors(Yl, Zl);
    this.setRootRot(arm, Xl, Yl, Zl);
    const Yf = df.clone().negate(), Zf = new THREE.Vector3().crossVectors(Xl, Yf);
    root.updateMatrixWorld(true);
    this.setRootRot(fore, Xl, Yf, Zf);
    root.updateMatrixWorld(true);
  }

  // turn o so its axes in the root's frame are (X, Y, Z)
  setRootRot(o, X, Y, Z) {
    const root = this.m.root;
    const want = _q.setFromRotationMatrix(_m.makeBasis(X, Y, Z));                    // in the root's frame
    const parentQ = o.parent.getWorldQuaternion(new THREE.Quaternion());
    const rootQ = root.getWorldQuaternion(new THREE.Quaternion());
    const parentInRoot = rootQ.invert().multiply(parentQ);                           // the parent in the root's frame
    o.quaternion.copy(parentInRoot.invert().multiply(want));
  }
}
