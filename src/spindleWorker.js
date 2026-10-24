import { buildRockArrays } from './spindleTerrain.js';

// Builds the Spindle's rock off the main thread (spindle.js prefetch): ~2 s of maths and normals that would stall the mission start.
self.onmessage = () => {
  const d = buildRockArrays();
  self.postMessage(d, [d.pos.buffer, d.col.buffer, d.idx.buffer, d.nor.buffer]);
};
