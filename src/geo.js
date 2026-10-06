import * as THREE from 'three';
import { PLANET } from './config.js';

// Spherical helpers. The sun direction is fixed: the hemisphere around SUN is the lit near
// side, the opposite hemisphere is the pitch-black dark side.
export const SUN = new THREE.Vector3(0.35, 0.25, 0.9).normalize();
export const E1 = new THREE.Vector3().crossVectors(SUN, new THREE.Vector3(0, 1, 0)).normalize();
export const E2 = new THREE.Vector3().crossVectors(SUN, E1).normalize();
export const R = PLANET.radius;

// theta: degrees from the sub-solar point (0 = noon, 90 = terminator, 180 = midnight); phi: azimuth.
export function dirFromAngles(thetaDeg, phiDeg, out = new THREE.Vector3()) {
  const t = THREE.MathUtils.degToRad(thetaDeg), p = THREE.MathUtils.degToRad(phiDeg);
  return out.copy(SUN).multiplyScalar(Math.cos(t))
    .addScaledVector(E1, Math.sin(t) * Math.cos(p))
    .addScaledVector(E2, Math.sin(t) * Math.sin(p)).normalize();
}

export function anglesFromDir(d) {
  const theta = Math.acos(THREE.MathUtils.clamp(d.dot(SUN), -1, 1));
  const phi = Math.atan2(d.dot(E2), d.dot(E1));
  return { theta, phi };
}

// 0 on the lit side, 1 deep on the dark side.
export function darkness(dir) {
  const e = dir.dot(SUN);
  const t = THREE.MathUtils.clamp((0.12 - e) / 0.4, 0, 1);
  return t * t * (3 - 2 * t);
}

export function arcDist(a, b) {
  const la = a.length(), lb = b.length();
  return R * Math.acos(THREE.MathUtils.clamp(a.dot(b) / (la * lb), -1, 1));
}

// Tangent component of v at surface direction up.
export function tangent(v, up, out = new THREE.Vector3()) {
  return out.copy(v).addScaledVector(up, -v.dot(up));
}

// Quaternion whose local +Y is `up` and local +Z points along `fwd` (projected).
const _m = new THREE.Matrix4(), _x = new THREE.Vector3(), _z = new THREE.Vector3();
export function frameQuat(up, fwd, out = new THREE.Quaternion()) {
  _z.copy(fwd).addScaledVector(up, -fwd.dot(up));
  if (_z.lengthSq() < 1e-8) _z.set(1, 0, 0).addScaledVector(up, -up.x);
  _z.normalize();
  _x.crossVectors(up, _z).normalize();
  _m.makeBasis(_x, up, _z);
  return out.setFromRotationMatrix(_m);
}

// Move from surface direction `dir` along tangent `t` by arc distance `dist`.
export function greatCircle(dir, t, dist, out = new THREE.Vector3()) {
  const a = dist / R;
  const tn = _x.copy(t).addScaledVector(dir, -t.dot(dir)).normalize();
  return out.copy(dir).multiplyScalar(Math.cos(a)).addScaledVector(tn, Math.sin(a)).normalize();
}
