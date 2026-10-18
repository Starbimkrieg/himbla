import * as THREE from 'three';
import { TerrainField } from './terrainField.js';

// A terrain worker: makes Moon chunks off the main thread (planet.js sends the jobs). It keeps its
// own copy of the height field, built from the same seed and the same plateaus, and the main thread
// forwards every plateau added later, so its chunks match the main thread's physics exactly.
let field = null;
const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);

self.onmessage = (e) => {
  const m = e.data;
  if (m.type === 'init') {
    field = new TerrainField(m.zones.map((z) => ({ ...z, dir: v3(z.dir) })), m.seed);
    field.painted = m.painted;
  } else if (m.type === 'zone') {
    field.addZoneData({ ...m.zone, dir: v3(m.zone.dir) });
  } else if (m.type === 'flat') {
    field.addFlatData(v3(m.dir), m.r, m.zr);
    field.cache.clear();
  } else if (m.type === 'unflat') {
    field.removeFlatData(v3(m.dir));
    field.cache.clear();
  } else if (m.type === 'build') {
    const d = field.computeChunk(m.f, m.cx, m.cy, m.flip, m.lod);
    self.postMessage({ id: m.id, ...d }, [d.pos.buffer, d.nor.buffer, d.col.buffer, d.rim.buffer, d.tint.buffer, d.idx.buffer, d.inside.buffer]);
  }
};
