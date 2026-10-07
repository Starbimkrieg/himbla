import * as THREE from 'three';
import { makeRunner, scarfLift } from './models.js';
import { toon, glow } from './toon.js';
import { OUTFITS, SKATES, LASERS, dressRunner, dressSkates } from './cosmetics.js';
import { FACTIONS, LOCATIONS, TIERS } from './locations.js';

// The wardrobe screen (C): a live turntable preview of the runner on the left, click-to-equip
// grids for outfits / skate finishes / pulse-disc colours on the right. Hovering or arrowing
// onto any tile (locked ones too) dresses the preview, clicking or Enter equips what you own.
// The preview is its own little Scene drawn by a dedicated WebGLRenderer bound to the overlay's
// canvas; it only runs while the screen is open and is reused between openings.

const TABS = [
  { id: 'outfit', label: 'OUTFITS' },
  { id: 'skates', label: 'SKATES' },
  { id: 'laser', label: 'LASERS' },
];
// Casino prize counter prices (mirrors casino.js SHOP): chips, minimum VIP tier
const CASINO = {
  felt: [40, 'BRONZE'], loungelizard: [75, 'SILVER'], jackpot: [150, 'GOLD'], highroller: [250, 'GOLD'], moonroyal: [500, 'MOON ROYALTY'],
};
const EXTRA_NAMES = { crest: 'helmet crest', pads: 'shoulder pads', halo: 'halo', band: 'bandana', cape: 'cape' };

const hex = (c) => '#' + (c >>> 0).toString(16).padStart(6, '0').slice(-6);
const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const tierFor = (v) => { let t = TIERS[0]; for (const x of TIERS) if (v >= x.min) t = x; return t; };

export class Wardrobe {
  constructor(game, cosmetics) {
    this.game = game;
    this.cos = cosmetics;
    this.tab = 'outfit';
    this.sel = { outfit: 0, skates: 0, laser: 0 };
    this.hover = null;
    this.yaw = 0;
    this.spinHold = 0;
    this.dragging = null;
    this.three = null;
    this.look = null;
    this.buildDom();
  }

  // ---------- catalogue ----------
  items(tab = this.tab) {
    if (tab === 'laser') return LASERS.map((l, i) => ({ kind: 'laser', id: i, d: l }));
    const src = tab === 'outfit' ? OUTFITS : SKATES;
    return Object.keys(src).map((id) => ({ kind: tab, id, d: src[id] }));
  }

  owned(it) { return it.kind === 'laser' || this.cos.owned(it.kind, it.id); }

  equipped(it) {
    const c = this.cos;
    return it.kind === 'outfit' ? c.outfit === it.id : it.kind === 'skates' ? c.skates === it.id : c.laser === it.id;
  }

  // Short tag shown on the tile, and the full "how to get it" lines for the info panel.
  source(it) {
    const g = this.game, d = it.d;
    if (it.kind === 'laser') return { tag: 'FREE', lines: ['Every pulse spinner can be tuned to any colour.'] };
    if (it.id === 'courier' || it.id === 'stock') return { tag: 'STANDARD ISSUE', lines: ['Standard courier issue.'] };
    const repLine = (f, req) => {
      const F = FACTIONS[f];
      const known = !g.rep || g.rep.visible(f);
      const fname = known ? F.name : 'a hidden faction';
      const you = g.rep && known ? ` You: ${g.rep.tier(f).name} (${g.rep.get(f)}).` : '';
      return `Needs ${fname} standing ${tierFor(req).name} (${req}+).${you}`;
    };
    if (d.casino) {
      const c = CASINO[it.id];
      return { tag: 'CASINO PRIZE', lines: [`Prize counter at the Lucky Crater Casino${c ? `: ${c[0]} chips, VIP ${c[1]} or higher` : ''}.`, 'Win chips at the tables, or exchange credits for them.'] };
    }
    if (it.kind === 'outfit' && d.shop) {
      const F = FACTIONS[d.faction] || { name: d.faction };
      const known = !g.rep || g.rep.visible(d.faction);
      const loc = LOCATIONS.find((l) => l.id === d.shop);
      const lines = [`Sold at ${known ? (loc ? loc.name : F.name) : 'a hidden headquarters'} for ₵${fmt(d.cost)}.`, repLine(d.faction, d.req)];
      if (d.elite) lines.push(`Or earn it by finishing the ${known ? F.name : 'faction'} story.`);
      return { tag: known && loc ? `${loc.short} · ${tierFor(d.req).name}` : 'HIDDEN SHOP', lines };
    }
    if (it.kind === 'skates' && d.cost) {
      const lines = [`Sold at Meridian Exchange for ₵${fmt(d.cost)}.`];
      if (d.req) lines.push(repLine('meridian', d.req));
      if (d.unlock) lines.push(`Unlock first: ${d.unlock.text} (${Math.min(d.unlock.n, g.stats[d.unlock.stat] || 0)}/${d.unlock.n}).`);
      return { tag: d.unlock ? 'MERIDIAN · TASK' : d.req ? `MERIDIAN · ${tierFor(d.req).name}` : 'MERIDIAN', lines };
    }
    if (d.alien) return { tag: 'LEGENDARY', lines: ['Not sold anywhere. One pair lies sealed behind an ancient gate, and the socket wants an artifact.'] };
    return { tag: 'SECRET', lines: ['Not sold anywhere. Keep exploring.'] };
  }

  // ---------- DOM ----------
  buildDom() {
    const el = document.createElement('div');
    el.id = 'wardrobe';
    el.className = 'overlay hidden';
    el.innerHTML = `
      <div class="wd panel" role="dialog" aria-label="Wardrobe">
        <div class="wd-head">
          <span class="wd-title">WARDROBE</span>
          <span class="wd-sub">TRY IT ON, THEN WEAR IT</span>
          <button class="wd-close" type="button">ESC · CLOSE</button>
        </div>
        <div class="wd-body">
          <div class="wd-stage">
            <canvas class="wd-canvas"></canvas>
            <div class="wd-tag"></div>
            <div class="wd-drag">DRAG TO ROTATE</div>
          </div>
          <div class="wd-side">
            <div class="wd-tabs"></div>
            <div class="wd-grid"></div>
            <div class="wd-info"></div>
          </div>
        </div>
        <div class="wd-foot">CLICK: EQUIP · HOVER: TRY ON · Q/E or 1-3: TABS · ARROWS + ENTER · C/ESC: CLOSE</div>
      </div>`;
    document.body.appendChild(el);
    this.el = el;
    this.canvas = el.querySelector('.wd-canvas');
    this.tabsEl = el.querySelector('.wd-tabs');
    this.gridEl = el.querySelector('.wd-grid');
    this.infoEl = el.querySelector('.wd-info');
    this.tagEl = el.querySelector('.wd-tag');
    el.querySelector('.wd-close').addEventListener('click', () => this.close(false));
    el.addEventListener('click', (e) => { if (e.target === el) this.close(false); });
    this.tabsEl.addEventListener('click', (e) => {
      const b = e.target.closest('[data-tab]');
      if (b) this.setTab(b.dataset.tab);
    });
    this.gridEl.addEventListener('click', (e) => {
      const b = e.target.closest('[data-i]');
      if (!b) return;
      const i = +b.dataset.i;
      this.sel[this.tab] = i;
      this.equip(this.items()[i]);
    });
    this.gridEl.addEventListener('pointerover', (e) => {
      const b = e.target.closest('[data-i]');
      if (b && this.hover !== +b.dataset.i) { this.hover = +b.dataset.i; this.refresh(false); }
    });
    this.gridEl.addEventListener('pointerleave', () => { if (this.hover !== null) { this.hover = null; this.refresh(false); } });
    this.infoEl.addEventListener('animationend', () => this.infoEl.classList.remove('wd-shake'));
    this.infoEl.addEventListener('click', (e) => {
      if (e.target.closest('.wd-equip')) this.equip(this.items()[this.sel[this.tab]]);
    });
    // drag to spin the mannequin
    this.canvas.addEventListener('pointerdown', (e) => {
      this.dragging = { x: e.clientX, id: e.pointerId };
      this.canvas.setPointerCapture(e.pointerId);
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (!this.dragging || this.dragging.id !== e.pointerId) return;
      this.yaw += (e.clientX - this.dragging.x) * 0.012;
      this.dragging.x = e.clientX;
      this.spinHold = 2;
      this.faceFront = false;
    });
    const end = () => { this.dragging = null; };
    this.canvas.addEventListener('pointerup', end);
    this.canvas.addEventListener('pointercancel', end);
  }

  open() {
    const g = this.game;
    if (g.state !== 'play') return;
    g.openModal('wardrobe');
    const c = this.cos;
    this.sel.outfit = Math.max(0, this.items('outfit').findIndex((it) => it.id === c.outfit));
    this.sel.skates = Math.max(0, this.items('skates').findIndex((it) => it.id === c.skates));
    this.sel.laser = c.laser;
    this.hover = null;
    this.el.classList.remove('hidden');
    this.initThree();
    this.syncBody();
    this.yaw = -0.35;
    this.spinHold = 1.2;
    this.faceFront = false;
    this.look = null;
    this.refresh(true);
    this.last = performance.now();
    this.three.renderer.setAnimationLoop(() => this.tick());
  }

  close(viaEscape) {
    this.el.classList.add('hidden');
    if (this.three) this.three.renderer.setAnimationLoop(null);
    this.dragging = null;
    if (this.game.state === 'wardrobe') this.game.closeModal(viaEscape);
  }

  setTab(id) {
    if (!TABS.some((t) => t.id === id) || id === this.tab) return;
    this.tab = id;
    this.hover = null;
    this.game.audio.click();
    this.refresh(true);
  }

  equip(it) {
    if (!it) return;
    const c = this.cos;
    if (!this.owned(it)) { this.flashLocked(); this.refresh(false); return; }
    if (!this.equipped(it)) {
      if (it.kind === 'outfit') c.outfit = it.id;
      else if (it.kind === 'skates') c.skates = it.id;
      else c.laser = it.id;
      if (it.kind === 'laser') c.save(); else c.apply();
      this.game.audio.click();
    }
    this.refresh(true);
  }

  flashLocked() {
    this.infoEl.classList.remove('wd-shake');
    void this.infoEl.offsetWidth;
    this.infoEl.classList.add('wd-shake');
    if (this.game.audio.tone) this.game.audio.tone(180, 0.08, 'square', 0.05);
  }

  onKey(code) {
    const list = this.items();
    const n = list.length;
    let i = this.sel[this.tab];
    const cols = Math.max(1, getComputedStyle(this.gridEl).gridTemplateColumns.split(' ').length);
    const tabIdx = TABS.findIndex((t) => t.id === this.tab);
    if (code === 'KeyQ') this.setTab(TABS[(tabIdx + TABS.length - 1) % TABS.length].id);
    else if (code === 'KeyE' || code === 'Tab') this.setTab(TABS[(tabIdx + 1) % TABS.length].id);
    else if (code === 'Digit1' || code === 'Digit2' || code === 'Digit3') this.setTab(TABS[+code.slice(5) - 1].id);
    else if (code === 'Enter' || code === 'Space') this.equip(list[i]);
    else {
      if (code === 'ArrowRight' || code === 'KeyD') i++;
      else if (code === 'ArrowLeft' || code === 'KeyA') i--;
      else if (code === 'ArrowDown' || code === 'KeyS') i += cols;
      else if (code === 'ArrowUp' || code === 'KeyW') i -= cols;
      else return;
      this.sel[this.tab] = Math.max(0, Math.min(n - 1, i));
      this.hover = null;
      this.refresh(true);
      const t = this.gridEl.querySelector('.wd-tile.sel');
      if (t) t.scrollIntoView({ block: 'nearest' });
    }
  }

  // which item is being tried on: the hovered tile, else the keyboard/click selection
  focus() {
    const list = this.items();
    return list[this.hover ?? this.sel[this.tab]] || list[0];
  }

  refresh(rebuildGrid) {
    if (rebuildGrid) {
      this.renderTabs();
      this.renderGrid();
    } else for (const t of this.gridEl.querySelectorAll('.wd-tile')) t.classList.toggle('sel', +t.dataset.i === this.sel[this.tab]);
    const it = this.focus();
    this.renderInfo(it);
    const c = this.cos;
    const look = { outfit: c.outfit, skates: c.skates, laser: c.laser };
    look[it.kind] = it.id;
    this.setLook(look);
  }

  renderTabs() {
    this.tabsEl.innerHTML = TABS.map((t, k) => {
      const list = this.items(t.id);
      const own = list.filter((it) => this.owned(it)).length;
      return `<button type="button" data-tab="${t.id}" class="${t.id === this.tab ? 'on' : ''}"><span class="wd-key">${k + 1}</span>${t.label}<small>${own}/${list.length}</small></button>`;
    }).join('');
  }

  tileArt(it) {
    const d = it.d;
    if (it.kind === 'outfit') {
      return `<span class="wd-fig" style="--s:${hex(d.suit)};--a:${hex(d.accent)};--h:${hex(d.helmet)};--v:${hex(d.visor)};--c:${hex(d.scarf)}"><i class="fh"></i><i class="fb"></i></span>`;
    }
    if (it.kind === 'skates') return `<span class="wd-skate${d.rainbow ? ' rainbow' : ''}${d.flame ? ' flame' : ''}" style="--k:${hex(d.color)}"><i class="sb"></i><i class="sr"></i></span>`;
    return `<span class="wd-disc" style="--k:${hex(d.color)}"><i></i></span>`;
  }

  renderGrid() {
    const list = this.items();
    this.gridEl.className = `wd-grid wd-${this.tab}`;
    this.gridEl.innerHTML = list.map((it, i) => {
      const own = this.owned(it), on = this.equipped(it);
      const state = on ? 'EQUIPPED' : own ? 'OWNED' : 'LOCKED';
      const d = it.d;
      const badge = d.elite ? '<b class="wd-badge elite">ELITE</b>' : d.casino ? '<b class="wd-badge casino">CASINO</b>' : d.alien ? '<b class="wd-badge legend">LEGEND</b>' : '';
      const hint = own ? (on ? 'WEARING' : 'CLICK TO EQUIP') : this.source(it).tag;
      return `<button type="button" class="wd-tile ${on ? 'is-on' : own ? 'is-own' : 'is-locked'}${i === this.sel[this.tab] ? ' sel' : ''}" data-i="${i}">
        ${badge}${this.tileArt(it)}
        <span class="wd-tname">${esc(d.name)}</span>
        <span class="wd-state">${state}</span>
        <span class="wd-hint">${esc(hint)}</span>
      </button>`;
    }).join('');
  }

  renderInfo(it) {
    const d = it.d;
    const own = this.owned(it), on = this.equipped(it);
    const src = this.source(it);
    const chips = it.kind === 'outfit' ? [d.suit, d.accent, d.helmet, d.visor, d.scarf] : [d.color];
    const facts = [];
    if (it.kind === 'outfit' && d.extras) facts.push(`Extras: ${d.extras.map((e) => EXTRA_NAMES[e] || e).join(', ')}.`);
    if (it.kind === 'skates') {
      facts.push(d.rainbow ? 'Prismatic rail and a rainbow glide trail.' : d.flame ? 'Throws a flaming glide trail.' : d.hooves ? 'Horseshoes. Clip-clop.' : d.trail ? 'Leaves a glide trail.' : 'No glide trail.');
      if (d.alien) facts.push('Unrivalled handling; your jet burns antimatter.');
    }
    if (it.kind === 'laser') facts.push('Colour of your pulse-spinner discs.');
    const state = on ? '<span class="wd-pill on">EQUIPPED</span>' : own ? '<span class="wd-pill own">OWNED</span>' : '<span class="wd-pill lock">LOCKED</span>';
    const how = own ? '' : `<div class="wd-how"><b>HOW TO GET IT</b>${src.lines.map((l) => `<p>${esc(l)}</p>`).join('')}</div>`;
    const btn = on ? '<button type="button" class="wd-equip" disabled>WEARING IT</button>'
      : own ? '<button type="button" class="wd-equip">ENTER · EQUIP</button>'
        : '<button type="button" class="wd-equip" disabled>LOCKED</button>';
    this.infoEl.innerHTML = `
      <div class="wd-info-top"><span class="wd-iname">${esc(d.name)}</span>${state}</div>
      <div class="wd-chips">${chips.map((c) => `<i style="background:${hex(c)}"></i>`).join('')}<span>${facts.map(esc).join(' ')}</span></div>
      ${how}${btn}`;
    this.tagEl.textContent = on ? 'WEARING' : own ? 'PREVIEW · OWNED' : 'PREVIEW · LOCKED';
    this.tagEl.className = `wd-tag ${on ? 'on' : own ? 'own' : 'lock'}`;
  }

  // ---------- 3D preview ----------
  initThree() {
    if (this.three) return;
    const renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 60);
    scene.add(new THREE.HemisphereLight(0xe6e2ff, 0x3a2c5a, 1.15));
    const key = new THREE.DirectionalLight(0xfff1d6, 1.9);
    key.position.set(2.5, 4, 5);
    const rim = new THREE.DirectionalLight(0x7fd8ff, 1.3);
    rim.position.set(-3.5, 2.5, -4);
    scene.add(key, rim);
    // pedestal with a glowing ring that takes the outfit's accent colour
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.08, 0.18, 36), toon(0x221a3a));
    ped.position.y = -0.09;
    const ringM = glow(0x2ee6ff);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.97, 0.03, 6, 48), ringM);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.005;
    scene.add(ped, ring);
    const model = makeRunner({ own: true });
    model.root.position.y = 0.06;
    scene.add(model.root);
    // a pulse disc hovering by the right hand, in the chosen laser colour
    const discM = glow(0x9be7ff);
    const disc = new THREE.Group();
    const torus = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.035, 6, 24), discM);
    const core = new THREE.Mesh(new THREE.CircleGeometry(0.11, 20), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
    const halo = new THREE.Mesh(new THREE.CircleGeometry(0.3, 24), new THREE.MeshBasicMaterial({ color: 0x9be7ff, transparent: true, opacity: 0.25, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
    disc.add(torus, core, halo);
    disc.position.set(0.95, 1.05, 0.25);
    model.root.add(disc);
    this.three = { renderer, scene, camera, model, extras: [], clones: [], ringM, disc, discM, halo, w: 0, h: 0, t: 0, pose: 0 };
  }

  // copy the player's mutation parts and whatever hangs in the cargo slot (jar, crate) onto the mannequin
  syncBody() {
    const T = this.three, g = this.game;
    for (const m of T.clones) m.removeFromParent();
    T.clones = [];
    const P = g.player.model, M = T.model;
    const muts = new Set((g.alchemy && g.alchemy.mutMeshes) || []);
    for (const k of ['legL', 'legR', 'torso', 'armL', 'armR', 'head', 'cargoSlot']) {
      for (const c of P[k].children) {
        if (!(muts.has(c) || k === 'cargoSlot')) continue;
        const cl = c.clone();
        cl.visible = true;
        M[k].add(cl);
        T.clones.push(cl);
      }
    }
  }

  setLook(look) {
    const T = this.three;
    if (!T) return;
    const prev = this.look;
    this.look = look;
    if (!prev || prev.outfit !== look.outfit) {
      for (const x of T.extras) x.removeFromParent();
      T.extras = dressRunner(T.model, look.outfit);
      T.ringM.color.setHex((OUTFITS[look.outfit] || OUTFITS.courier).accent);
    }
    if (!prev || prev.skates !== look.skates) dressSkates(T.model, look.skates);
    const l = LASERS[look.laser] || LASERS[0];
    T.discM.color.setHex(l.color);
    T.halo.material.color.setHex(l.color);
    // swing round to face the camera whenever the item being shown changes
    if (prev && (prev.outfit !== look.outfit || prev.skates !== look.skates || prev.laser !== look.laser)) { this.faceFront = true; this.spinHold = 2.5; }
  }

  tick() {
    const g = this.game;
    if (g.state !== 'wardrobe') { this.close(false); return; }
    const T = this.three;
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    T.t += dt;
    // fit the canvas
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (w && h && (w !== T.w || h !== T.h)) {
      T.w = w; T.h = h;
      T.renderer.setSize(w, h, false);
      T.camera.aspect = w / h;
      // keep the whole runner (2.5 m to the helmet top, 2.8 m with the antenna) and the
      // pedestal in frame at any aspect
      const half = Math.max(1.78, 1.12 / T.camera.aspect);
      const dist = half / Math.tan(THREE.MathUtils.degToRad(T.camera.fov / 2));
      T.camera.position.set(0, 1.6, dist);
      T.camera.lookAt(0, 1.38, 0);
      T.camera.updateProjectionMatrix();
    }
    // turntable: slow spin, paused while dragging and after a change (when it turns to face you)
    if (this.dragging) { /* the pointer drives the yaw */ } else if (this.faceFront) {
      const target = Math.round(this.yaw / (Math.PI * 2)) * Math.PI * 2;
      this.yaw += (target - this.yaw) * Math.min(1, dt * 6);
      if (Math.abs(target - this.yaw) < 0.01) this.faceFront = false;
    } else if (this.spinHold > 0) this.spinHold -= dt;
    else this.yaw += dt * 0.32;
    const M = T.model;
    M.root.rotation.y = this.yaw;
    // idle pose; the skate tab drops into a skating crouch with the rail lit
    const skating = this.tab === 'skates' ? 1 : 0;
    T.pose += (skating - T.pose) * Math.min(1, dt * 5);
    const p = T.pose, br = Math.sin(T.t * 2.2);
    M.body.position.y = M.bodyBase - 0.14 * p + br * 0.008;
    M.torso.rotation.x = 0.04 + 0.3 * p + br * 0.015;
    M.legL.rotation.x = 0.28 * p; M.legR.rotation.x = -0.28 * p;
    M.armL.rotation.x = M.armR.rotation.x = -0.6 * p;
    M.armL.rotation.z = -0.14 - 0.2 * p - br * 0.02; M.armR.rotation.z = 0.14 + 0.2 * p + br * 0.02;
    M.head.rotation.y = Math.sin(T.t * 0.7) * 0.12;
    M.head.rotation.x = -0.15 * p;
    M.scarf.rotation.x = scarfLift(M.torso.rotation.x, 30 * p, Math.sin(T.t * 3) * 0.05);
    M.scarf.rotation.y = Math.sin(T.t * 1.7) * 0.15;
    const s = SKATES[this.look.skates] || SKATES.stock;
    if (s.rainbow) M.mats.skate.color.setHSL((T.t * 0.4) % 1, 1, 0.6);
    for (const x of T.extras) if (x.userData.cape) x.rotation.x = 0.3 + 0.5 * p + Math.sin(T.t * 3) * 0.05;
    for (const x of T.clones) if (x.userData.flap) x.rotation.y = x.userData.flap * (0.5 + Math.sin(T.t * 3) * 0.3);
    // pulse disc spins and bobs; bigger on the laser tab
    const ds = this.tab === 'laser' ? 1.5 : 0.85;
    T.disc.scale.setScalar(ds);
    T.disc.rotation.set(0.3, T.t * 2.5, 0);
    T.disc.position.y = 1.05 + Math.sin(T.t * 2) * 0.06;
    T.halo.material.opacity = 0.18 + 0.1 * Math.sin(T.t * 6);
    T.renderer.render(T.scene, T.camera);
  }
}
