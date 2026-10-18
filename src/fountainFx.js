import * as THREE from 'three';

// The Lucky Crater Casino's plaza fountain water (the model is built in Blender, tools/blender/build_casino.py; models.js makeFountain
// and settlements.js dressCasinoLot dress it). Four kinds of water pivot, each a mesh with a shader of its own:
//   water (tier basin / bowl)  a disc the two tiers' ripples run across, with foam where the water lands: the curtain's foot in the basin,
//                              the jets' landing ring in the bowl
//   curtain                    the sheet that spills over the bowl's lip into the basin: strands of water running down
//   streams                    the eight jets from the spigots under the chip into the bowl: bright dashes running along them
// Every material shares one clock (`time`), set by whichever of the meshes' tick runs (World.update: u.tick(o, dt, time)).

const TIME = { value: 0 };
const VERT = 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const lin = (hex) => new THREE.Color(hex);

// ripples travelling out from the middle and from the ring where water lands, a slow wobble through them, foam on the ring
const RIPPLE = `uniform float time; uniform vec3 deep; uniform vec3 light; uniform float landing; uniform float edge; varying vec3 vP;
  void main(){
    float d = length(vP.xz), a = atan(vP.z, vP.x);
    float w1 = sin(d * 2.4 - time * 1.9);
    float w2 = sin(d * 5.6 + sin(a * 5.0 + time * 0.7) * 0.7 - time * 3.0);
    float w3 = sin((d - landing) * 7.0 - time * 4.0);
    float foam = exp(-pow((d - landing) * 1.5, 2.0));
    float wave = w1 * 0.35 + w2 * 0.35 + w3 * 0.3 * foam;
    float band = smoothstep(0.55, 0.9, wave);
    float froth = foam * (0.45 + 0.35 * sin(a * 21.0 + time * 5.0 + d * 3.0));
    float rim = smoothstep(edge - 0.5, edge, d);
    vec3 col = mix(deep, light, clamp(band * 0.75 + froth, 0.0, 1.0));
    col = mix(col, light, rim * 0.5);
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }`;

// strands of water running down the sheet, brighter dashes sliding along them
const CURTAIN = `uniform float time; uniform vec3 deep; uniform vec3 light; varying vec3 vP;
  void main(){
    float a = atan(vP.z, vP.x);
    float strand = sin(a * 46.0 + sin(vP.y * 1.6 + a * 3.0) * 1.4) * 0.5 + 0.5;
    float dash = sin(vP.y * 5.5 + time * 6.5 + a * 11.0) * 0.5 + 0.5;
    float lit = smoothstep(0.55, 0.95, strand) * smoothstep(0.25, 0.8, dash);
    float fade = smoothstep(0.7, 1.6, vP.y) * 0.8 + 0.2;     // thinner toward the foot, where it meets the water
    gl_FragColor = vec4(mix(deep, light, lit), (0.34 + 0.5 * lit) * fade);
    #include <colorspace_fragment>
  }`;

// bright dashes running down the arcs (the arc falls as it goes, so height is how far along it is)
const STREAM = `uniform float time; uniform vec3 deep; uniform vec3 light; varying vec3 vP;
  void main(){
    float dash = sin(vP.y * 16.0 + time * 11.0) * 0.5 + 0.5;
    gl_FragColor = vec4(mix(deep, light, smoothstep(0.3, 0.85, dash)), 1.0);
    #include <colorspace_fragment>
  }`;

const KINDS = {
  basin: { frag: RIPPLE, u: { deep: lin(0x2f9be0), light: lin(0xc6f4ff), landing: { value: 3.95 }, edge: { value: 8.5 } }, extra: {} },
  bowl: { frag: RIPPLE, u: { deep: lin(0x3fb2f2), light: lin(0xd8f8ff), landing: { value: 2.5 }, edge: { value: 3.36 } }, extra: {} },
  curtain: { frag: CURTAIN, u: { deep: lin(0x7fd0ff), light: lin(0xf0fcff) }, extra: { transparent: true, depthWrite: false, side: THREE.DoubleSide } },
  streams: { frag: STREAM, u: { deep: lin(0x6cc8ff), light: lin(0xf4fdff) }, extra: {} },
};

// One mesh for a water node of the model (baked by models.js bakeShip: its `parts` hold the geometry, `data` the pivot's extras), at the node's
// place. `m.userData.tick` runs the shared clock.
export function waterMesh(node) {
  const kind = node.role === 'water' ? node.data.tier : node.role; // 'basin', 'bowl', 'curtain' or 'streams'
  const K = KINDS[kind];
  if (!K) throw new Error('fountain water: unknown kind ' + kind);
  const uniforms = { time: TIME };
  for (const [k, v] of Object.entries(K.u)) uniforms[k] = v.isColor ? { value: v } : v;
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: K.frag, ...K.extra });
  const geo = node.parts.length === 1 ? node.parts[0].geo : null;
  if (!geo) throw new Error('fountain water node ' + node.name + ' should have one slot');
  const m = new THREE.Mesh(geo, mat);
  m.position.copy(node.pos);
  m.name = node.name;
  if (K.extra.transparent) m.renderOrder = 2;
  m.userData.tick = (o, dt, t) => { TIME.value = t; };
  return m;
}
