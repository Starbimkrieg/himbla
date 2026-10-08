import * as THREE from 'three';
import { inkMat } from './toon.js';
import { makeChimera } from './chimera.js';
import { ensureStats, STAT_KEYS, STAT_INFO } from './chimerastats.js';

// Pixel "trading card" HTML for chimeras: portrait, parts, the four racing stats as segmented
// bars, and a grade. Rendered inside g.dialog bubbles (pen, detail, Derby entry/betting, breeding).
// A card rendered as <button data-i="n"> is clickable through the dialog's own button handler,
// and wrapping the cards in cardList(.., hide) hides the duplicate plain dialog buttons.

const PS = 72; // portrait render size (shown scaled up, pixelated)
const cache = new Map();
let rt = null, scene, cam, canvas, ctx, pixels;

const PART_NAME = { person: 'PERSON', voidling: 'VOIDLING', mite: 'MITE', car: 'CAR', pirate: 'PIRATE', sapling: 'SAPLING', junkbot: 'JUNKBOT', alien: 'ALIEN' };
const MOD_NAME = { void: 'VOID', crystal: 'CRYSTAL', mud: 'MUD', spark: 'SPARK', turbo: 'TURBO', lens: 'LENS', radio: 'RADIO', armor: 'ARMOR' };
const hex = (c) => '#' + (c >>> 0).toString(16).padStart(6, '0').slice(-6);
const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

// A small 3D snapshot of the creature, rendered once per chimera and cached as a data URL.
export function portrait(renderer, genes) {
  const key = `${genes.seed}|${genes.body}|${genes.legs}|${genes.head}|${genes.extraHead}|${(genes.mods || []).join()}|${genes.tint}|${genes.size}`;
  if (cache.has(key)) return cache.get(key);
  let url = null;
  if (renderer) {
    try {
      if (!rt) {
        rt = new THREE.WebGLRenderTarget(PS, PS);
        rt.texture.colorSpace = THREE.SRGBColorSpace;
        scene = new THREE.Scene();
        scene.add(new THREE.HemisphereLight(0xffffff, 0x4a4466, 1.8));
        const sun = new THREE.DirectionalLight(0xffffff, 2.4);
        sun.position.set(4, 6, 5);
        scene.add(sun);
        cam = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
        canvas = document.createElement('canvas');
        canvas.width = canvas.height = PS;
        ctx = canvas.getContext('2d');
        pixels = new Uint8Array(PS * PS * 4);
      }
      const m = makeChimera(genes);
      m.anim(0.35, 3);
      scene.add(m.root);
      m.root.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(m.root);
      const c = box.getCenter(new THREE.Vector3());
      const sz = box.getSize(new THREE.Vector3());
      const r = Math.max(sz.x, sz.y, sz.z) * 0.62;
      const dist = r / Math.tan(THREE.MathUtils.degToRad(15));
      cam.position.copy(c).add(new THREE.Vector3(0.62, 0.32, 0.72).normalize().multiplyScalar(dist));
      cam.lookAt(c);
      const prevRT = renderer.getRenderTarget();
      const prevColor = renderer.getClearColor(new THREE.Color());
      const prevAlpha = renderer.getClearAlpha();
      renderer.setRenderTarget(rt);
      renderer.setClearColor(0x000000, 0);
      renderer.clear();
      renderer.render(scene, cam);
      renderer.readRenderTargetPixels(rt, 0, 0, PS, PS, pixels);
      renderer.setRenderTarget(prevRT);
      renderer.setClearColor(prevColor, prevAlpha);
      scene.remove(m.root);
      m.root.traverse((o) => {
        if (!o.isMesh) return;
        if (!o.geometry.userData.shared) o.geometry.dispose(); // part geometry is cached and shared
        if (o.material !== inkMat && o.material.isMeshBasicMaterial) o.material.dispose();
      });
      const img = ctx.createImageData(PS, PS);
      for (let y = 0; y < PS; y++) img.data.set(pixels.subarray((PS - 1 - y) * PS * 4, (PS - y) * PS * 4), y * PS * 4);
      ctx.putImageData(img, 0, 0);
      url = canvas.toDataURL('image/png');
    } catch { url = null; }
  }
  cache.set(key, url);
  return url;
}

export function statBars(st, big = false) {
  return `<div class="cc-stats${big ? ' big' : ''}">${STAT_KEYS.map((k) => {
    const v = st[k];
    const on = Math.max(1, Math.round(v / 10));
    let seg = '';
    for (let i = 0; i < 10; i++) seg += `<i${i < on ? ' class="on"' : ''}></i>`;
    return `<div class="cc-stat s-${k}"><span class="cc-lbl">${big ? STAT_INFO[k].name : STAT_INFO[k].short}</span><span class="cc-bar">${seg}</span><span class="cc-num">${v}</span>${big ? `<span class="cc-blurb">${STAT_INFO[k].blurb}</span>` : ''}</div>`;
  }).join('')}</div>`;
}

export function partsLine(genes) {
  const p = (lbl, kind) => `<span class="cc-part"><em>${lbl}</em>${PART_NAME[kind] || String(kind).toUpperCase()}</span>`;
  let s = p('BODY', genes.body) + p('LEGS', genes.legs) + p('HEAD', genes.head);
  if (genes.extraHead) s += p('+HEAD', genes.extraHead);
  for (const m of genes.mods || []) s += `<span class="cc-part mod">${MOD_NAME[m] || m.toUpperCase()}</span>`;
  return `<div class="cc-parts">${s}</div>`;
}

// opts: key (number badge), button (clickable, data-i = key - 1), mine, status (html), odds {p, odds}, big, tag (ribbon text)
export function chimeraCard(g, genes, opts = {}) {
  ensureStats(genes);
  const st = genes.stats;
  const url = portrait(g && g.renderer, genes);
  const tint = hex(genes.tint ?? 0x7dff6a);
  const tag = opts.button ? 'button' : 'div';
  const cls = ['cc', opts.mine ? 'mine' : '', opts.big ? 'big' : '', opts.button ? 'pick' : ''].filter(Boolean).join(' ');
  const attrs = opts.button ? ` data-i="${opts.key - 1}" type="button"` : '';
  const por = `<div class="cc-por" style="--tint:${tint}">${url ? `<img src="${url}" alt="">` : '<span class="cc-blob"></span>'}${opts.key ? `<span class="cc-key">${opts.key}</span>` : ''}</div>`;
  const odds = opts.odds ? `<div class="cc-odds"><span>WIN ${Math.round(opts.odds.p * 100)}%</span><b>PAYS ${opts.odds.odds.toFixed(1)}x</b></div>` : '';
  const top = `<div class="cc-top"><span class="cc-name">${esc(genes.name)}</span><span class="cc-grade g-${genes.tier}" title="grade">${genes.tier}</span></div>`;
  const foot = opts.status ? `<div class="cc-foot">${opts.status}</div>` : '';
  const ribbon = opts.tag ? `<span class="cc-ribbon">${opts.tag}</span>` : '';
  return `<${tag} class="${cls}"${attrs}>${ribbon}${por}<div class="cc-main">${top}${partsLine(genes)}${statBars(st, opts.big)}${odds}${foot}</div></${tag}>`;
}

// Wrap cards in a grid. `hide` = how many leading dialog buttons the cards stand in for.
export function cardList(cards, hide = 0, cls = '') {
  return `<div class="cc-list ${cls}" data-hide="${hide}">${cards.join('')}</div>`;
}
