import * as THREE from 'three';
import { WORLD } from './config.js';
import { mulberry32, createNoise2D, smoothstep, clamp, lerp } from './rng.js';
import { gradientMap } from './toon.js';

const BUCKET = 256;

// Heightfield moon surface: rolling highlands, ridges and hundreds of craters,
// with flattened plateaus where settlements sit. Physics samples the exact same
// triangles that are rendered, so what you see is what you ski on.
export class Terrain {
  constructor(zones, seed = WORLD.seed) {
    this.size = WORLD.size;
    this.seg = WORLD.segments;
    this.n = this.seg + 1;
    this.cell = this.size / this.seg;
    this.half = this.size / 2;

    const rand = mulberry32(seed);
    this.noiseA = createNoise2D(rand);
    this.noiseB = createNoise2D(rand);
    this.noiseC = createNoise2D(rand);

    this.zones = zones;
    for (const z of zones) z.h = this.baseHeight(z.x, z.z);

    this.craters = this.makeCraters(rand);
    this.buildBuckets();

    const N = this.n * this.n;
    this.H = new Float32Array(N);
    this.floorAmt = new Float32Array(N);
    this.rimAmt = new Float32Array(N);
    this.rayAmt = new Float32Array(N);
    for (let iz = 0; iz < this.n; iz++) {
      for (let ix = 0; ix < this.n; ix++) {
        const x = -this.half + ix * this.cell;
        const z = -this.half + iz * this.cell;
        this.H[iz * this.n + ix] = this.sample(x, z, iz * this.n + ix);
      }
    }
  }

  baseHeight(x, z) {
    const a = this.noiseA, b = this.noiseB;
    let h = a(x * 0.00045, z * 0.00045) * 115;
    h += a(x * 0.0013 + 7.1, z * 0.0013 - 3.3) * 38;
    h += (1 - Math.abs(b(x * 0.0009, z * 0.0009))) * 46 - 23;
    h += b(x * 0.005, z * 0.005) * 6;
    h += a(x * 0.02, z * 0.02) * 1.1;
    return h;
  }

  makeCraters(rand) {
    const tiers = [
      [6, 200, 330],
      [34, 90, 190],
      [130, 42, 90],
      [300, 22, 42],
    ];
    const list = [];
    for (const [count, rMin, rMax] of tiers) {
      for (let k = 0; k < count; k++) {
        for (let tries = 0; tries < 14; tries++) {
          const R = lerp(rMin, rMax, rand());
          const x = (rand() * 2 - 1) * 1800;
          const z = (rand() * 2 - 1) * 1800;
          if (Math.hypot(x, z) + R > 1850) continue;
          let ok = true;
          for (const zn of this.zones) {
            if (Math.hypot(x - zn.x, z - zn.z) < zn.r * 1.6 + R * 1.3) { ok = false; break; }
          }
          if (!ok) continue;
          list.push({
            x, z, R,
            depth: R * (R > 150 ? 0.17 : 0.25),
            rim: R * 0.075,
            rays: R > 150 ? rand() * Math.PI * 2 : -1,
          });
          break;
        }
      }
    }
    return list;
  }

  buildBuckets() {
    const nb = Math.ceil(this.size / BUCKET);
    this.nb = nb;
    this.buckets = Array.from({ length: nb * nb }, () => []);
    for (const c of this.craters) {
      const infl = c.R * (c.rays >= 0 ? 4.2 : 2.3);
      const x0 = Math.floor((c.x - infl + this.half) / BUCKET), x1 = Math.floor((c.x + infl + this.half) / BUCKET);
      const z0 = Math.floor((c.z - infl + this.half) / BUCKET), z1 = Math.floor((c.z + infl + this.half) / BUCKET);
      for (let bz = Math.max(0, z0); bz <= Math.min(nb - 1, z1); bz++)
        for (let bx = Math.max(0, x0); bx <= Math.min(nb - 1, x1); bx++) this.buckets[bz * nb + bx].push(c);
    }
  }

  sample(x, z, idx) {
    let h = this.baseHeight(x, z);
    const bx = clamp(Math.floor((x + this.half) / BUCKET), 0, this.nb - 1);
    const bz = clamp(Math.floor((z + this.half) / BUCKET), 0, this.nb - 1);
    let floorA = 0, rimA = 0, rayA = 0;
    for (const c of this.buckets[bz * this.nb + bx]) {
      const dx = x - c.x, dz = z - c.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      const r = d / c.R;
      if (r < 2.3) {
        if (r < 1) {
          const bowl = Math.max((r * r - 1) * c.depth, -c.depth * 0.82);
          h += bowl;
          floorA = Math.max(floorA, smoothstep(1.0, 0.35, r));
        }
        const rimT = Math.exp(-(((r - 1) / (r < 1 ? 0.22 : 0.45)) ** 2));
        h += c.rim * rimT;
        rimA = Math.max(rimA, rimT);
      }
      if (c.rays >= 0 && r > 1.05 && r < 4.2) {
        const ang = Math.atan2(dz, dx);
        const ray = Math.pow(Math.abs(Math.sin(ang * 6 + c.rays)), 18) * (1 - smoothstep(1.2, 4.2, r));
        rayA = Math.max(rayA, ray * (0.6 + 0.4 * this.noiseC(x * 0.01, z * 0.01)));
      }
    }
    for (const zn of this.zones) {
      const d = Math.hypot(x - zn.x, z - zn.z);
      if (d < zn.r * 2) {
        const t = smoothstep(zn.r, zn.r * 1.95, d);
        h = lerp(zn.h, h, t);
        floorA *= t; rimA *= t; rayA *= t;
      }
    }
    const rd = Math.hypot(x, z);
    if (rd > 1780) h += ((rd - 1780) / 110) ** 2 * 38;
    if (idx !== undefined) {
      this.floorAmt[idx] = floorA;
      this.rimAmt[idx] = rimA;
      this.rayAmt[idx] = rayA;
    }
    return h;
  }

  // Exact height of the rendered triangle under (x,z).
  height(x, z) {
    const n = this.n;
    let fx = (x + this.half) / this.cell, fz = (z + this.half) / this.cell;
    fx = clamp(fx, 0, this.seg - 1e-4); fz = clamp(fz, 0, this.seg - 1e-4);
    const ix = Math.floor(fx), iz = Math.floor(fz);
    const tx = fx - ix, tz = fz - iz;
    const i = iz * n + ix;
    const H = this.H;
    const h00 = H[i], h10 = H[i + 1], h01 = H[i + n], h11 = H[i + n + 1];
    if (tx > tz) return h00 + (h10 - h00) * tx + (h11 - h10) * tz;
    return h00 + (h11 - h01) * tx + (h01 - h00) * tz;
  }

  // Face normal of the triangle under (x,z).
  normal(x, z, out = new THREE.Vector3()) {
    const n = this.n;
    let fx = (x + this.half) / this.cell, fz = (z + this.half) / this.cell;
    fx = clamp(fx, 0, this.seg - 1e-4); fz = clamp(fz, 0, this.seg - 1e-4);
    const ix = Math.floor(fx), iz = Math.floor(fz);
    const tx = fx - ix, tz = fz - iz;
    const i = iz * n + ix;
    const H = this.H;
    const h00 = H[i], h10 = H[i + 1], h01 = H[i + n], h11 = H[i + n + 1];
    let dx, dz;
    if (tx > tz) { dx = h10 - h00; dz = h11 - h10; } else { dx = h11 - h01; dz = h01 - h00; }
    return out.set(-dx / this.cell, 1, -dz / this.cell).normalize();
  }

  // Smooth normal (for placing objects / AI).
  smoothNormal(x, z, out = new THREE.Vector3()) {
    const e = this.cell;
    const hx = this.height(x + e, z) - this.height(x - e, z);
    const hz = this.height(x, z + e) - this.height(x, z - e);
    return out.set(-hx, 2 * e, -hz).normalize();
  }

  // Line-of-sight test against the heightfield.
  visible(a, b, steps = 12) {
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t, z = a.z + (b.z - a.z) * t;
      if (this.height(x, z) > y + 0.5) return false;
    }
    return true;
  }

  buildMeshes(scene) {
    const n = this.n;
    const vNormals = new Float32Array(n * n * 3);
    const colors = new Float32Array(n * n * 3);
    const H = this.H, cell = this.cell;
    const c = new THREE.Color();
    const highland = new THREE.Color(0.84, 0.78, 0.70);
    const mare = new THREE.Color(0.46, 0.45, 0.62);
    const floorC = new THREE.Color(0.34, 0.31, 0.50);
    const rimC = new THREE.Color(1.0, 0.95, 0.84);
    const rayC = new THREE.Color(1.0, 0.98, 0.92);
    for (let iz = 0; iz < n; iz++) {
      for (let ix = 0; ix < n; ix++) {
        const i = iz * n + ix;
        const hl = H[iz * n + Math.max(0, ix - 1)], hr = H[iz * n + Math.min(n - 1, ix + 1)];
        const hd = H[Math.max(0, iz - 1) * n + ix], hu = H[Math.min(n - 1, iz + 1) * n + ix];
        let nx = -(hr - hl), ny = 2 * cell, nz = -(hu - hd);
        const len = Math.hypot(nx, ny, nz);
        nx /= len; ny /= len; nz /= len;
        vNormals[i * 3] = nx; vNormals[i * 3 + 1] = ny; vNormals[i * 3 + 2] = nz;

        const x = -this.half + ix * cell, z = -this.half + iz * cell;
        const m = smoothstep(-0.25, 0.35, this.noiseB(x * 0.0007 + 11, z * 0.0007 - 5));
        c.copy(highland).lerp(mare, m);
        c.lerp(floorC, this.floorAmt[i] * 0.7);
        c.lerp(rimC, this.rimAmt[i] * 0.6);
        c.lerp(rayC, this.rayAmt[i] * 0.7);
        const speck = this.noiseC(x * 0.08, z * 0.08) * 0.05;
        const slope = (1 - ny) * 0.9;
        const k = clamp(1 - slope + speck, 0.45, 1.1);
        colors[i * 3] = c.r * k; colors[i * 3 + 1] = c.g * k; colors[i * 3 + 2] = c.b * k;
      }
    }

    const mat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: gradientMap() });
    // Inked crater rims: a comic contour wherever the rim profile peaks.
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aRim;\nvarying float vRim;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRim = aRim;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vRim;')
        .replace('#include <color_fragment>', '#include <color_fragment>\nfloat rimInk = smoothstep(0.84, 0.93, vRim);\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.06, 0.03, 0.1), rimInk * 0.9);');
    };
    const cpc = this.seg / WORLD.chunks;
    this.meshes = [];
    for (let cz = 0; cz < WORLD.chunks; cz++) {
      for (let cx = 0; cx < WORLD.chunks; cx++) {
        const vn = cpc + 1;
        const pos = new Float32Array(vn * vn * 3);
        const nor = new Float32Array(vn * vn * 3);
        const col = new Float32Array(vn * vn * 3);
        const rim = new Float32Array(vn * vn);
        for (let lz = 0; lz < vn; lz++) {
          for (let lx = 0; lx < vn; lx++) {
            const gx = cx * cpc + lx, gz = cz * cpc + lz;
            const gi = gz * n + gx, li = (lz * vn + lx) * 3;
            pos[li] = -this.half + gx * cell;
            pos[li + 1] = H[gi];
            pos[li + 2] = -this.half + gz * cell;
            nor[li] = vNormals[gi * 3]; nor[li + 1] = vNormals[gi * 3 + 1]; nor[li + 2] = vNormals[gi * 3 + 2];
            col[li] = colors[gi * 3]; col[li + 1] = colors[gi * 3 + 1]; col[li + 2] = colors[gi * 3 + 2];
            rim[lz * vn + lx] = this.rimAmt[gi];
          }
        }
        const idx = new Uint32Array(cpc * cpc * 6);
        let k = 0;
        for (let lz = 0; lz < cpc; lz++) {
          for (let lx = 0; lx < cpc; lx++) {
            const a = lz * vn + lx, b = a + 1, cc = a + vn, d = cc + 1;
            // Must match the split used by height(): (a,d,b) and (a,c,d)
            idx[k++] = a; idx[k++] = d; idx[k++] = b;
            idx[k++] = a; idx[k++] = cc; idx[k++] = d;
          }
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
        geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
        geo.setAttribute('aRim', new THREE.BufferAttribute(rim, 1));
        geo.setIndex(new THREE.BufferAttribute(idx, 1));
        geo.computeBoundingSphere();
        geo.computeBoundingBox();
        const mesh = new THREE.Mesh(geo, mat);
        mesh.receiveShadow = true;
        mesh.castShadow = true;
        scene.add(mesh);
        this.meshes.push(mesh);
      }
    }
  }
}
