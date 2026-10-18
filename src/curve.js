import * as THREE from 'three';

// A place on a `curved` plateau (locations.js; terrainField.js lays it as a sphere cap) is authored in flat local (x, y, z),
// y up, and bent onto the sphere here so nothing leans off the local up: a point at horizontal distance d goes d / R round
// the sphere, y above it; a frame at (x, z) turns by that angle about the horizontal axis normal to the radius; long pieces
// are cut short first so they curve rather than chord (a 100 m wall would sink 0.35 m at its ends). R: plateau radius from
// the Moon's centre. Used by outpostModels.js Kit, world.js (put, toWorld, colliders) and race.js (crowd).

const _ax = new THREE.Vector3();

// bent position of a flat local point
export function bendPoint(R, x, y, z, out) {
  const d = Math.hypot(x, z);
  if (d < 1e-6) return out.set(x, y, z);
  const phi = d / R, r = R + y, s = r * Math.sin(phi) / d;
  return out.set(x * s, r * Math.cos(phi) - R, z * s);
}

// inverse of bendPoint
export function unbendPoint(R, x, y, z, out) {
  const rho = Math.hypot(x, z);
  if (rho < 1e-6) return out.set(x, y, z);
  const phi = Math.atan2(rho, R + y), s = R * phi / rho;
  return out.set(x * s, Math.hypot(rho, R + y) - R, z * s);
}

// turn taking the flat frame at (x, z) onto the sphere (+y to the radius there)
export function bendQuat(R, x, z, out) {
  const d = Math.hypot(x, z);
  if (d < 1e-6) return out.identity();
  return out.setFromAxisAngle(_ax.set(z / d, 0, -x / d), d / R);
}

// Bends a flat-frame matrix in place (translation by bendPoint, rotation by bendQuat; scale kept).
const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _b = new THREE.Quaternion();
export function bendMatrix(R, m) {
  m.decompose(_p, _q, _s);
  bendQuat(R, _p.x, _p.z, _b);
  bendPoint(R, _p.x, _p.y, _p.z, _p);
  return m.compose(_p, _q.premultiply(_b), _s);
}

// Cuts every triangle edge longer horizontally than `maxLen` until none is (conforming: shared edges cut alike, no cracks).
// Indexed, position + normal only (outpostModels.js prep). Returns the same geometry.
export function refine(geo, maxLen) {
  const names = Object.keys(geo.attributes), arrs = {}, size = {};
  for (const n of names) { arrs[n] = Array.from(geo.attributes[n].array); size[n] = geo.attributes[n].itemSize; }
  const pos = arrs.position;
  let idx = Array.from(geo.index.array);
  const max2 = maxLen * maxLen;
  const long = (a, b) => { const dx = pos[3 * a] - pos[3 * b], dz = pos[3 * a + 2] - pos[3 * b + 2]; return dx * dx + dz * dz > max2; };
  for (let pass = 0; pass < 10; pass++) {
    const mids = new Map(), out = [];
    const mid = (a, b) => {
      const key = a < b ? a * 16777216 + b : b * 16777216 + a;
      let m = mids.get(key);
      if (m === undefined) {
        m = pos.length / 3;
        for (const n of names) for (let c = 0; c < size[n]; c++) arrs[n].push((arrs[n][size[n] * a + c] + arrs[n][size[n] * b + c]) / 2);
        mids.set(key, m);
      }
      return m;
    };
    let cut = false;
    for (let i = 0; i < idx.length; i += 3) {
      let a = idx[i], b = idx[i + 1], c = idx[i + 2];
      const e = [long(a, b), long(b, c), long(c, a)];
      const n = e[0] + e[1] + e[2];
      if (!n) { out.push(a, b, c); continue; }
      cut = true;
      if (n === 3) {
        const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
        out.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
      } else if (n === 1) {
        if (e[1]) { const t = a; a = b; b = c; c = t; } else if (e[2]) { const t = c; c = b; b = a; a = t; } // (cut edge first: a-b)
        const m = mid(a, b);
        out.push(a, m, c, m, b, c);
      } else {
        if (e[0]) { if (e[1]) { const t = c; c = b; b = a; a = t; } else { const t = a; a = b; b = c; c = t; } } // (uncut edge first: a-b)
        // (b-c and c-a are cut, meeting at c)
        const bc = mid(b, c), ca = mid(c, a);
        out.push(bc, c, ca, a, b, bc, a, bc, ca);
      }
    }
    idx = out;
    if (!cut) break;
  }
  for (const n of names) geo.setAttribute(n, new THREE.BufferAttribute(new Float32Array(arrs[n]), size[n]));
  geo.setIndex(new THREE.BufferAttribute(pos.length / 3 > 65535 ? new Uint32Array(idx) : new Uint16Array(idx), 1));
  return geo;
}

// Bends a geometry's vertices and normals onto the sphere; refines first when `maxLen` is given.
const _v = new THREE.Vector3(), _n = new THREE.Vector3(), _r = new THREE.Quaternion();
export function bendGeometry(geo, R, maxLen = 0) {
  if (maxLen) refine(geo, maxLen);
  const pa = geo.attributes.position, na = geo.attributes.normal;
  for (let i = 0; i < pa.count; i++) {
    const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i);
    if (na) { bendQuat(R, x, z, _r); _n.set(na.getX(i), na.getY(i), na.getZ(i)).applyQuaternion(_r); na.setXYZ(i, _n.x, _n.y, _n.z); }
    bendPoint(R, x, y, z, _v);
    pa.setXYZ(i, _v.x, _v.y, _v.z);
  }
  pa.needsUpdate = true;
  geo.boundingBox = geo.boundingSphere = null;
  return geo;
}
