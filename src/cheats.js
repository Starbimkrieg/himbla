import { FACTIONS, SHOPS } from './locations.js';
import { OUTFITS, SKATES } from './cosmetics.js';
import { spliceGenes, ensureStats } from './chimera.js';
import { SEASON_RACES } from './chimerastats.js';
import { SKILL_IDS } from './chimeraskills.js';
import { pick } from './rng.js';
import { VEHICLES } from './vehicles.js';
import { TECH } from './story.js';
import * as THREE from 'three';
import { greatCircle } from './geo.js';
import { MUTATIONS } from './alchemy.js';
import { DevOverlay, SECTIONS } from './devoverlay.js';
import { FreeCam } from './freecam.js';
import { AssetRow } from './assetRow.js';

const DEV_KEY = 'mr-dev-unlocked';
const METEOR_KEY = 'mr-dev-meteor-power';
const GITCHIP_KEY = 'mr-dev-git-chip';
const GIT_POLL = 90; // s between upstream checks while the upstream chip is on

// Testing menu on ` (backtick). Uses the normal dialog: number keys pick, Esc closes.
export class Cheats {
  constructor(game) {
    this.game = game;
    this.god = false; // unlimited health
    this.infJet = false; // unlimited jet (thruster energy)
    this.mapTeleport = false; // click a location in the full map (or A on it with the pad cursor) to go there
    this.debugView = null; // 'poly' (polygons outlined) | 'draw' (each draw call a flat colour), drawn without the post pass
    this.ragdoll = true; // wipeouts and hard crashes go limp (player.js startRagdoll); off: you stay on your feet
    this.crackedVisor = true; // screen cracks as hull drops (hud.js)
    this.speed = 1; // player speed multiplier, 1 to 10 (player.js)
    // once the dev menu is opened (F8 / pad combo) it gets a pause-card button, remembered across launches
    try { this.unlocked = localStorage.getItem(DEV_KEY) === '1'; } catch { this.unlocked = false; }
    // first use of SPAWN A METEOR ON ME makes it a power (powers.js), remembered across launches
    try { this.meteorPower = localStorage.getItem(METEOR_KEY) === '1'; } catch { this.meteorPower = false; }
    this.overlay = new DevOverlay(game, this); // F3 readouts panel (devoverlay.js)
    this.freeCam = new FreeCam(game); // Dev menu → Debug overlay → Free cam (freecam.js)
    this.showPauseButton();
    // top-left chip counting commits upstream has and this checkout lacks (GIT menu, dev server only)
    try { this.gitChip = localStorage.getItem(GITCHIP_KEY) === '1'; } catch { this.gitChip = false; }
    this.gitState = null; // last git status from the dev server
    this.gitTimer = 0;
    this.gitChipSync();
  }

  // enemies.js: whether to record AI steering goals for the AI paths drawing
  get aiPaths() { return this.overlay.shows('paths'); }

  showPauseButton() {
    const b = document.getElementById('dev-btn-pause');
    if (b) b.classList.toggle('hidden', !this.unlocked);
  }

  // In the Asset Row (assetRow.js)? Moon-only entries (spawns, events, story, vehicles, ...) would hit the wrong world, so
  // they say so instead.
  inRow() { const a = this.game.assetRow; return !!(a && a.active); }
  notInRow() {
    if (!this.inRow()) return true;
    this.game.hud.toast('Leave the Asset Row first: teleport menu, option 1.', 3);
    return false;
  }

  // Hidden dev menu: F8, or B, B, X, Y on a controller (gamepad.js). Press F8 again to close. It is the cheat menu: open().
  dev() {
    if (!this.unlocked) {
      this.unlocked = true;
      try { localStorage.setItem(DEV_KEY, '1'); } catch { /* unavailable */ }
      this.showPauseButton();
    }
    this.open();
  }

  // The icon grid every cheat page uses: 6 tiles across, 3 rows a page, the arrow turns the page.
  //   tiles(): the tiles, rebuilt each time the page repaints. A tile is { icon, name, sub?, on?, fn, keep? }: `sub` a line under the name
  //   (a state, a count), `on` lights it, `keep` runs fn and repaints the page in place instead of closing it.
  //   opts: note (small text under the title), back (fn: a BACK button), page.
  // Number keys 1 to 9 pick the first nine tiles, Esc closes (the last button).
  grid(title, tiles, { note = '', back = null, page = 0, stay = false } = {}) {
    const PER = 18;
    const all = tiles();
    const pages = Math.max(1, Math.ceil(all.length / PER));
    page = ((page % pages) + pages) % pages;
    const here = all.slice(page * PER, page * PER + PER);
    const again = (extra = {}) => this.grid(title, tiles, { note, back, page, ...extra, stay: true });
    const buttons = here.map((t) => (t.keep ? { label: t.name, keep: true, fn: () => { t.fn(); again(); } } : { label: t.name, fn: t.fn }));
    const add = (b) => buttons.push(b) - 1;
    const backI = back ? add({ label: 'BACK', fn: back }) : -1;
    const nextI = pages > 1 ? add({ label: 'NEXT', keep: true, fn: () => again({ page: page + 1 }) }) : -1;
    const closeI = add({ label: 'CLOSE' });
    const tile = (t, i) => `<button class="cg-tile${t.on ? ' on' : ''}" data-i="${i}">${i < 9 ? `<i class="cg-n">${i + 1}</i>` : ''}<span class="cg-ico">${t.icon || '•'}</span><b>${t.name}</b>${t.sub ? `<small>${t.sub}</small>` : ''}</button>`;
    const html = `<div class="cg-head"><span class="dlg-title">${title}</span>${backI >= 0 ? `<button class="cg-back" data-i="${backI}">BACK</button>` : ''}${note ? `<small>${note}</small>` : ''}<button class="cg-x" data-i="${closeI}">✕</button></div>
      <div class="cg-grid">${here.map(tile).join('')}</div>
      <div class="cg-foot"><small>${pages > 1 ? `PAGE ${page + 1} / ${pages} · ` : ''}CLICK OR 1-9 · ESC CLOSES</small>${nextI >= 0 ? `<button class="cg-next" data-i="${nextI}">→</button>` : ''}</div>`;
    this.game.dialog(title, html, buttons, { raw: true, cls: 'cg', stay });
    this.game.dialogButtons.dev = true; // F8 closes it
  }

  // ---- git: run by the dev server (tools/devGit.mjs: fetch and fast-forward pull only), so `npm run dev` only ----
  async gitCall(act) {
    try {
      const r = await fetch(`/__dev/git/${act}`, { method: 'POST', headers: { 'X-Dev-Git': '1' } });
      return await r.json();
    } catch (e) { return { ok: false, err: String((e && e.message) || e) }; }
  }

  // The upstream chip (HUD top left): commits upstream has that this checkout lacks. While on, fetches every GIT_POLL s (and
  // when the GIT menu looks); toggled in the GIT menu, kept across launches.
  gitChipSync() {
    const on = this.gitChip && import.meta.env.DEV;
    clearInterval(this.gitTimer);
    this.gitTimer = 0;
    if (on) {
      this.gitCheck();
      this.gitTimer = setInterval(() => { if (!document.hidden) this.gitCheck(); }, GIT_POLL * 1000);
    }
    this.gitChipDraw();
  }

  async gitCheck() { this.gitSeen(await this.gitCall('status')); }

  gitSeen(st) {
    this.gitState = st && st.ok && !st.noUpstream ? st : null;
    this.gitChipDraw();
  }

  gitChipDraw() {
    const el = document.getElementById('gitchip');
    if (!el) return;
    const on = this.gitChip && import.meta.env.DEV;
    el.classList.toggle('hidden', !on);
    if (!on) return;
    const st = this.gitState;
    const n = st ? st.behind : null;
    el.textContent = n === null ? '⇣ ? UPSTREAM' : `⇣ ${n}${st.fetchError ? '?' : ''} UPSTREAM`;
    el.classList.toggle('behind', n > 0);
    el.classList.toggle('unknown', n === null);
  }

  // Fetch and pull the upstream from in game. The dev server sees the pulled files and reloads the page.
  async gitMenu() {
    const g = this.game;
    const esc = (t) => String(t).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    const dev = import.meta.env.DEV;
    const show = (text, buttons, again = null) => {
      // the chip's switch goes just before BACK on every screen that can redraw itself
      const sw = dev && again ? [{
        label: `UPSTREAM CHIP: ${this.gitChip ? 'ON' : 'OFF'}`,
        fn: () => { this.gitChip = !this.gitChip; try { localStorage.setItem(GITCHIP_KEY, this.gitChip ? '1' : '0'); } catch { /* unavailable */ } this.gitChipSync(); again(); },
      }] : [];
      const list = [...buttons, ...sw, { label: 'BACK', fn: () => this.dev() }, { label: 'CLOSE' }].map((b, i) => ({ ...b, label: `${i + 1} · ${b.label}` }));
      g.dialog('GIT: FETCH & PULL', text, list);
      return list;
    };
    if (!dev) { show('<small>Only available when the game runs from the dev server (npm run dev).</small>', []); return; }
    const mine = show('<small>Fetching…</small>', []);
    const st = await this.gitCall('status');
    if (g.dialogButtons !== mine) return; // closed or changed meanwhile
    this.gitSeen(st);
    const note = (msg) => { const again = () => note(msg); show(`<small>${msg}</small>`, [{ label: 'TRY AGAIN', fn: () => this.gitMenu() }], again); };
    if (!st.ok) { note(esc(st.err || 'The dev server did not answer.')); return; }
    if (st.noUpstream) { note(`${esc(st.branch)} has no upstream branch. In a terminal: git branch -u origin/${esc(st.branch)}`); return; }
    const screen = () => {
      const lines = [`<b>${esc(st.branch)}</b> → ${esc(st.upstream)} · now at ${esc(st.head)}`];
      lines.push(st.behind ? `${st.behind} new commit${st.behind === 1 ? '' : 's'} upstream${st.ahead ? `, ${st.ahead} of yours not pushed` : ''}` : st.ahead ? `Up to date; ${st.ahead} commit${st.ahead === 1 ? '' : 's'} of yours not pushed` : 'Up to date.');
      if (st.dirty) lines.push(`${st.dirty} uncommitted change${st.dirty === 1 ? '' : 's'} here (kept: a pull that would overwrite them stops)`);
      if (st.fetchError) lines.push(`Fetch failed: ${esc(st.fetchError.split('\n')[0])}`);
      for (const c of st.incoming.slice(0, 8)) lines.push(`&nbsp;· ${esc(c.length > 90 ? c.slice(0, 89) + '…' : c)}`);
      if (st.incoming.length > 8) lines.push(`&nbsp;· …and ${st.behind - 8} more`);
      const buttons = [];
      if (st.behind && !st.ahead) buttons.push({ label: `PULL ${st.behind} COMMIT${st.behind === 1 ? '' : 'S'}`, fn: () => this.gitPull(show, esc) });
      else if (st.behind) lines.push('Diverged from upstream: pull it by hand (a merge or rebase is not for the game to choose).');
      buttons.push({ label: 'CHECK AGAIN', fn: () => this.gitMenu() });
      show(`<small>${lines.join('<br>')}</small>`, buttons, screen);
    };
    screen();
  }

  async gitPull(show, esc) {
    const g = this.game;
    try { g.save(); } catch { /* the pull goes ahead without a fresh save */ }
    const mine = show('<small>Pulling…</small>', []);
    const r = await this.gitCall('pull');
    if (g.dialogButtons !== mine) return;
    if (!r.ok) { show(`<small>Pull stopped: ${esc((r.err || r.out || 'git said no').split('\n').filter((l) => l && !/^hint:/.test(l)).slice(0, 4).join(' · '))}<br>Nothing was changed.</small>`, [{ label: 'CHECK AGAIN', fn: () => this.gitMenu() }]); return; }
    if (this.gitState && r.from !== r.to) { this.gitState = { ...this.gitState, behind: 0, incoming: [] }; this.gitChipDraw(); }
    const lines = [r.from === r.to ? 'Already up to date.' : `Pulled ${esc(r.from)} → ${esc(r.to)} · ${r.changed} file${r.changed === 1 ? '' : 's'} changed.`];
    if (r.deps) lines.push('package.json changed: run npm install, then restart the dev server.');
    if (r.from !== r.to) lines.push('Your progress was saved. The page reloads by itself when the dev server sees the new files.');
    show(`<small>${lines.join('<br>')}</small>`, [{ label: 'RELOAD NOW', fn: () => location.reload() }]);
  }

  // unlimited jet and health, speed multiplier
  boostMenu() {
    const g = this.game;
    const on = (v) => (v ? 'ON' : 'OFF');
    g.dialog('UNLIMITED JET, HEALTH & SPEED', '<small>Toggles last until you reload.</small>', [
      { label: `1 · UNLIMITED JET: ${on(this.infJet)}`, fn: () => { this.infJet = !this.infJet; this.tick(); this.boostMenu(); } },
      { label: `2 · UNLIMITED HEALTH: ${on(this.god)}`, fn: () => { this.god = !this.god; this.tick(); this.boostMenu(); } },
      { label: this.speedLabel(), fn: () => { this.setSpeed(this.speed >= 10 ? 1 : this.speed + 1); this.boostMenu(); } },
      { label: '4 · BACK', fn: () => this.dev() },
      { label: 'CLOSE' },
    ]);
    // the speed row adjusts in place: click / A = +1 (wraps), pad left / right = -1 / +1
    const row = document.querySelector('#dialog [data-i="2"]');
    if (row) {
      row.dataset.adj = '1';
      const bump = (d) => { this.setSpeed(this.speed + d); row.textContent = this.speedLabel(); };
      row.addEventListener('adj', (e) => bump(e.detail));
      row.onclick = (e) => { e.stopPropagation(); bump(this.speed >= 10 ? -9 : 1); };
    }
  }

  // Ragdoll on / off. Off, wipeouts still cost the same health and speed but you stay up; turning it off mid-tumble
  // stands you back up.
  toggleRagdoll() {
    const P = this.game.player;
    this.ragdoll = !this.ragdoll;
    if (!this.ragdoll && P.rag) { P.rag.release(); P.rag = null; }
  }

  // The dev menu's meteor button. First use also makes it a power (METEOR SPAWN, equipped), so E / RB drops one after that.
  meteorFromMenu() {
    const g = this.game;
    const first = !this.meteorPower;
    if (first) {
      this.meteorPower = true;
      try { localStorage.setItem(METEOR_KEY, '1'); } catch { /* unavailable */ }
      g.powers.select('meteor');
    }
    const ok = this.spawnMeteor(!first);
    if (first) g.hud.toast(`${ok ? 'Meteor inbound. ' : ''}Meteor Spawn is now one of your powers, and equipped: E / RB drops another on you.`, 5);
  }

  // A rock that lands where you stand (meteors.js spawnOnPlayer) after a few seconds' warning ring. `long`: the full note
  // (power repeats show a short one). False where there's no place for one (the Spindle).
  spawnMeteor(long = true) {
    const g = this.game;
    if (g.spindle && g.spindle.active) { g.hud.toast('No meteors out on the Spindle.', 2); return false; }
    if (!this.notInRow()) return false;
    g.meteors.spawnOnPlayer();
    if (long) g.hud.toast('Meteor inbound: it lands where you stand in a few seconds. Move, or go and land on it.', 4);
    else g.hud.toast('Meteor inbound!', 1.5);
    return true;
  }

  // display tests: effects and render modes to look at (readouts are in the debug overlay)
  displayMenu() {
    const g = this.game;
    const on = (v) => (v ? 'ON' : 'OFF');
    g.dialog('DISPLAY TESTS', '<small>Toggles last until you reload.</small>', [
      { label: `1 · CRACKED VISOR: ${on(this.crackedVisor)}`, fn: () => { this.crackedVisor = !this.crackedVisor; g.hud.crackKey = -1; this.displayMenu(); } },
      { label: `2 · SHOW EACH POLYGON: ${on(this.debugView === 'poly')}`, fn: () => { this.setDebugView(this.debugView === 'poly' ? null : 'poly'); this.displayMenu(); } },
      { label: `3 · SHOW EACH DRAW CALL: ${on(this.debugView === 'draw')}`, fn: () => { this.setDebugView(this.debugView === 'draw' ? null : 'draw'); this.displayMenu(); } },
      { label: `4 · STATIC SHADOW CACHE: ${g.shadowCache.failed ? 'FAILED (see console)' : on(g.shadowCache.enabled)}`, fn: () => { g.shadowCache.enabled = !g.shadowCache.enabled; g.shadowCache.failed = false; g.shadowCache.invalidate(); this.displayMenu(); } },
      { label: '5 · BACK', fn: () => this.dev() },
      { label: 'CLOSE' },
    ]);
  }

  // Debug views: the scene drawn bare (no post pass) with one flat-colour override material. 'draw' gives each draw call
  // its own colour (stable per object, so batching shows: a merged chunk is one colour, loose props confetti); 'poly'
  // fills dark with triangle edges on top. The colour is set per draw by wrapping renderBufferDirect.
  setDebugView(mode) {
    const r = this.game.renderer;
    this.debugView = mode;
    if (mode && !this._rbd) {
      const orig = this._rbd = r.renderBufferDirect;
      r.renderBufferDirect = (camera, scene, geometry, material, object, group) => {
        const m = this.dbg;
        if (m && (material === m.fill || material === m.wire)) {
          const u = material.uniforms.c.value;
          if (material === m.wire) u.setHex(0x7fd8ff);
          else if (this.debugView === 'poly') u.setHex(0x0a0818);
          else u.setHSL((((object.id * 0.6180339 + (group ? group.materialIndex || 0 : 0) * 0.37) % 1) + 1) % 1, 0.75, 0.55);
          material.uniformsNeedUpdate = true;
        }
        return orig.call(r, camera, scene, geometry, material, object, group);
      };
    } else if (!mode && this._rbd) {
      r.renderBufferDirect = this._rbd;
      this._rbd = null;
      this.game.scene.overrideMaterial = null;
    }
  }

  renderDebug() {
    const g = this.game, r = g.renderer;
    if (!this.dbg) {
      const make = (extra) => new THREE.ShaderMaterial({
        uniforms: { c: { value: new THREE.Color() } },
        vertexShader: '#include <common>\n#include <skinning_pars_vertex>\nvoid main() {\n#include <skinbase_vertex>\n#include <begin_vertex>\n#include <skinning_vertex>\n#include <project_vertex>\n}',
        fragmentShader: 'uniform vec3 c;\nvoid main() { gl_FragColor = vec4( c, 1.0 ); }',
        side: THREE.DoubleSide,
        ...extra,
      });
      // fill sits a touch behind so the outlines over it don't z-fight
      this.dbg = { fill: make({ polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }), wire: make({ wireframe: true }) };
    }
    r.setRenderTarget(null);
    g.scene.overrideMaterial = this.dbg.fill;
    r.render(g.scene, g.camera);
    if (this.debugView === 'poly') {
      g.scene.overrideMaterial = this.dbg.wire;
      const ac = r.autoClear;
      r.autoClear = false;
      r.render(g.scene, g.camera);
      r.autoClear = ac;
    }
    g.scene.overrideMaterial = null;
  }

  speedLabel() { return `3 · SPEED: ×${this.speed}  (◄ ►)`; }

  setSpeed(v) { this.speed = Math.max(1, Math.min(10, Math.round(v))); }

  // per frame in play: keeps jet and health topped up
  tick() {
    const P = this.game.player;
    if (this.infJet) P.body.energy = P.body.maxEnergy;
    if (this.god && !P.dead) P.health = P.maxHealth;
    this.overlay.tick();
  }

  // enemies.js: the Kade roll note under the squad alert (overlay's pirate spawns section)
  alertNote(text, secs) { this.overlay.alertNote(text, secs); }

  // Dev menu → Debug overlay: master switch (F3 in play), free cam, and the overlay's sections. Each toggle re-opens the menu.
  overlayMenu() {
    const g = this.game, o = this.overlay, f = this.freeCam;
    const on = (v) => (v ? 'ON' : 'OFF');
    g.dialog('DEBUG OVERLAY', '<small>Every on-screen readout in one panel. F3 shows or hides it in play; the sections you pick are remembered. Free cam flies the camera while the runner stands still (its controls are shown at the top of the screen); it is off after a reload.</small>', [
      { label: `1 · OVERLAY: ${on(o.on)}`, fn: () => { o.toggle(); this.overlayMenu(); } },
      { label: `2 · FREE CAM: ${on(f.on)}`, fn: () => { f.toggle(); this.overlayMenu(); } },
      ...SECTIONS.map((s, i) => ({ label: `${i + 3} · ${s.name}: ${on(o.sec[s.key])}`, fn: () => { o.setSection(s.key, !o.sec[s.key]); this.overlayMenu(); } })),
      { label: 'BACK', fn: () => this.dev() }, // rows past the ninth are mouse / pad only (number keys stop at 9)
      { label: 'CLOSE' },
    ]);
  }

  open(page = 0) {
    const g = this.game;
    const on = (v) => (v ? 'ON' : 'OFF');
    const stats = `${g.stats.events || 0} events · ${g.stats.meridianEvents || 0} Meridian · ${g.stats.darkDeliveries || 0} dark deliveries · ${g.stats.raceWins || 0} Derby wins`;
    this.grid('CHEAT MENU', () => [
      { icon: '💰', name: '+₵10,000', fn: () => { g.addCredits(10000, 'Cheat'); g.save(); }, keep: true },
      { icon: '🗺️', name: 'REVEAL MAP', fn: () => this.revealMap(), keep: true },
      { icon: '⭐', name: 'REPUTATION', fn: () => this.repMenu() },
      { icon: '🚀', name: 'TELEPORT', fn: () => this.teleportMenu() },
      { icon: '🛡️', name: 'GOD MODE', sub: on(this.god), on: this.god, fn: () => { this.god = !this.god; g.player.health = g.player.maxHealth; }, keep: true },
      { icon: '🔓', name: 'UNLOCK ALL', sub: 'gear, weapons, cosmetics', fn: () => this.unlockAll(), keep: true },
      { icon: '🧪', name: 'LAB & CHIMERAS', sub: 'lab kit, careers, skills', fn: () => this.chimeraMenu() },
      { icon: '🛴', name: 'SPAWN VEHICLE', fn: () => this.vehicleMenu() },
      { icon: '⚡', name: 'JET · HEALTH · SPEED', fn: () => this.boostMenu() },
      { icon: '☄️', name: 'METEOR ON ME', fn: () => this.meteorFromMenu() },
      { icon: '📡', name: 'SPAWN EVENT', sub: 'or a meteor shower', fn: () => this.eventMenu() },
      { icon: '☠️', name: 'PIRATE SQUAD', fn: () => { if (this.notInRow()) g.enemies.spawnSquad(3); } },
      { icon: '🐛', name: 'MEGA MITE', fn: () => { if (this.notInRow()) g.alchemy.spawnMegaMite(); } },
      { icon: '🏴', name: 'JOIN RUSTMOON', sub: 'skips the Pirate Wreck', fn: () => this.joinRustmoon(), keep: true },
      { icon: '📈', name: 'UNLOCK COUNTERS', sub: 'events, deliveries, wins', fn: () => { Object.assign(g.stats, { meridianEvents: Math.max(3, g.stats.meridianEvents || 0), darkDeliveries: Math.max(5, g.stats.darkDeliveries || 0), raceWins: Math.max(1, g.stats.raceWins || 0) }); g.save(); }, keep: true },
      { icon: '🧬', name: 'SPLICE MUTATIONS', sub: `${g.alchemy.mutations.length} active`, fn: () => this.spliceMenu(0) },
      { icon: '📖', name: 'STORY', sub: g.story.faction ? FACTIONS[g.story.faction].name : 'no faction yet', fn: () => this.storyMenu() },
      { icon: '♻️', name: 'RESET PROGRESS', sub: 'story, gear, standing', fn: () => this.confirmResetProgress() },
      // page 2: the dev tools
      { icon: '🧭', name: 'CLICK MAP TO TELEPORT', sub: on(this.mapTeleport), on: this.mapTeleport, fn: () => { this.mapTeleport = !this.mapTeleport; }, keep: true },
      { icon: '📊', name: 'DEBUG OVERLAY', sub: `${on(this.overlay.on)} (F3)`, on: this.overlay.on, fn: () => this.overlayMenu() },
      { icon: '🖥️', name: 'DISPLAY TESTS', fn: () => this.displayMenu() },
      { icon: '🤸', name: 'RAGDOLL', sub: on(this.ragdoll), on: this.ragdoll, fn: () => this.toggleRagdoll(), keep: true },
      { icon: '🌿', name: 'GIT', sub: 'fetch & pull upstream', fn: () => this.gitMenu() },
      { icon: '🗑️', name: 'WIPE SAVE SLOT', sub: 'back to the menu', fn: () => this.confirmReset() },
    ], { note: stats, page });
  }

  // Drops any faction vehicle beside you and boards it (owned or not; doesn't unlock it for V)
  vehicleMenu() {
    if (!this.notInRow()) return;
    const g = this.game;
    this.grid('SPAWN A VEHICLE', () => Object.keys(VEHICLES).map((k) => ({
      icon: '🚙',
      name: VEHICLES[k].name.toUpperCase(),
      fn: () => {
        if (g.player.vehicle) g.garage.exit();
        g.garage.hp[k] = g.garage.maxHp(k); // fresh hull, not stuck in a rebuild
        g.garage.wreckedUntil[k] = 0;
        g.garage.choice = k;
        g.garage.summon(k);
        g.garage.enter();
      },
    })), { note: 'Drops it beside you and hops you in. Replaces any vehicle already out.', back: () => this.open() });
  }

  // Each splice-pod mutation as a toggle (ignores the 3-mutation cap), plus a cure-all. Paged: number keys stop at 9.
  spliceMenu(page) {
    const g = this.game;
    const A = g.alchemy;
    const keys = Object.keys(MUTATIONS);
    const per = 6;
    const pages = Math.ceil(keys.length / per);
    const rows = keys.slice(page * per, page * per + per).map((k, i) => {
      const on = A.mutations.includes(k);
      return {
        label: `${i + 1} · ${MUTATIONS[k].name}: ${on ? 'ON' : 'OFF'}`,
        fn: () => {
          A.mutations = on ? A.mutations.filter((m) => m !== k) : A.mutations.concat(k);
          A.save();
          A.applyMutations();
          this.spliceMenu(page);
        },
      };
    });
    rows.push({ label: `${rows.length + 1} · NEXT PAGE (${page + 1}/${pages})`, fn: () => this.spliceMenu((page + 1) % pages) });
    rows.push({ label: `${rows.length + 1} · RESET ALL (cure)`, fn: () => { A.cure(); this.spliceMenu(page); } });
    rows.push({ label: `${rows.length + 1} · BACK`, fn: () => this.open() });
    const active = A.mutations.map((k) => MUTATIONS[k].name).join(', ') || 'none';
    g.dialog('CHEAT MENU · SPLICE', `<small>Toggles each pod mutation without the jar or the 3-mutation cap.<br>Active: ${active}</small>`, rows);
  }

  storyMenu() {
    if (!this.notInRow()) return;
    const g = this.game;
    const S = g.story;
    const A = S.active;
    this.grid('CHEAT MENU · STORY', () => [
      { icon: '⏭️', name: 'SKIP STEP', sub: 'the current one', fn: () => { if (S.active) S.skipStep(); }, keep: true },
      { icon: '📍', name: 'TO OBJECTIVE', fn: () => { const o = S.objective(); if (o) S.teleportTo(o.pos.clone().normalize()); } },
      { icon: '👮', name: 'SPAWN KADE', sub: 'ambush', fn: () => S.spawnKade(false) },
      { icon: '🧰', name: 'ALL VEHICLES + TECH', fn: () => { S.vehicles = Object.keys(VEHICLES); S.tech = Object.keys(TECH); S.save(); }, keep: true },
      { icon: '↺', name: 'RESET STORY', sub: 'keeps outposts', fn: () => { if (S.active) S.fail('Reset.'); S.faction = null; S.progress = {}; S.kade.captured = false; S.save(); }, keep: true },
      { icon: '🛰️', name: 'DROP ON SAT-7', sub: 'matched speed', fn: () => { const o = g.secrets.sat; const up = o.pos.clone().normalize(); g.player.respawn(o.pos.clone().addScaledVector(up, 4)); g.player.body.vel.copy(o.vel); } },
      { icon: '🌀', name: 'WHISPERING FISSURE', fn: () => { const L = g.secrets.loc; g.globe.discover(L, true); S.teleportTo(g.world.toWorld(L, 0, 0, -90).normalize()); } },
      { icon: '👽', name: 'ALIEN ARTIFACT', fn: () => { g.upgrades.jar = Math.max(1, g.upgrades.jar || 0); g.alchemy.artifact = true; g.secrets.state.artifactTaken = true; g.secrets.sat.artifact.visible = g.secrets.sat.aGlow.visible = false; g.secrets.save(); g.alchemy.save(); g.alchemy.refreshJarMesh(); }, keep: true },
      { icon: '🌌', name: 'THE SPINDLE', sub: 'Meridian finale', fn: () => this.toSpindle() },
    ], { note: `Committed to <b>${S.faction ? FACTIONS[S.faction].name : 'nobody yet'}</b>${A ? ` · ${A.def.title} (step ${A.si + 1}/${A.steps.length})` : ''} · vehicles: ${S.vehicles.length} · tech: ${S.tech.length}`, back: () => this.open() });
  }

  revealMap() {
    const g = this.game;
    g.globe.explored.fill(1);
    for (const l of g.locations) {
      if (l.faction === 'rustmoon' && !g.rep.aligned() && !l.camp && g.rep.rustmoon === 'unknown') continue;
      g.globe.discover(l, true);
    }
    g.globe.save();
    g.hud.toast('Whole Moon charted.', 2);
  }

  repMenu() {
    const g = this.game;
    const ids = Object.keys(g.rep.values).filter((f) => FACTIONS[f]);
    const rows = ids.map((f) => `${FACTIONS[f].name}: <b>${g.rep.get(f)}</b> (${g.rep.tier(f).name})`).join('<br>');
    g.dialog('REPUTATION', `<small>${rows}</small>`, ids.map((f, i) => ({ label: `${i + 1} · ${FACTIONS[f].name.toUpperCase()}…`, fn: () => this.repFaction(f) }))
      .concat([{ label: `${ids.length + 1} · ALL FACTIONS → HONORED`, fn: () => { for (const f of ids) this.setRep(f, 60); this.repMenu(); } }, { label: 'BACK', fn: () => this.open() }]));
  }

  repFaction(f) {
    const g = this.game;
    g.dialog(FACTIONS[f].name.toUpperCase(), `Current: <b>${g.rep.get(f)}</b> (${g.rep.tier(f).name})`, [
      { label: '1 · +10', fn: () => { this.setRep(f, g.rep.get(f) + 10); this.repFaction(f); } },
      { label: '2 · −10', fn: () => { this.setRep(f, g.rep.get(f) - 10); this.repFaction(f); } },
      { label: '3 · FRIENDLY (10)', fn: () => { this.setRep(f, 10); this.repFaction(f); } },
      { label: '4 · TRUSTED (25)', fn: () => { this.setRep(f, 25); this.repFaction(f); } },
      { label: '5 · HONORED (60)', fn: () => { this.setRep(f, 60); this.repFaction(f); } },
      { label: '6 · NEUTRAL (0)', fn: () => { this.setRep(f, 0); this.repFaction(f); } },
      { label: '7 · HOSTILE (−30)', fn: () => { this.setRep(f, -30); this.repFaction(f); } },
      { label: '8 · BACK', fn: () => this.repMenu() },
    ]);
  }

  // Set directly (no war penalty with the rival faction).
  setRep(f, v) {
    const g = this.game;
    if (f === 'rustmoon' && g.rep.rustmoon === 'unknown') g.rep.rustmoon = 'known';
    g.rep.values[f] = Math.max(-100, Math.min(100, v));
    g.rep.history.push({ f, amount: 0, reason: `Cheat: set to ${g.rep.values[f]}`, at: Date.now() });
    g.rep.save();
  }

  teleportMenu(page = 0) {
    const g = this.game;
    // the first tile is always the Asset Row (assetRow.js: flat showroom of every asset); settlements follow
    this.grid('TELEPORT', () => [
      { icon: '🏛️', name: this.inRow() ? 'LEAVE ASSET ROW' : 'ASSET ROW', sub: 'every asset', fn: () => this.assetRow(!this.inRow()) },
      ...g.locations.filter((l) => !l.camp).map((l) => ({ icon: '📍', name: l.name.toUpperCase(), sub: l.discovered ? '' : 'not charted', fn: () => this.teleport(l) })),
    ], { note: 'Drops you at the edge of the settlement.', back: () => this.open(), page });
  }

  assetRow(enter) {
    const g = this.game;
    if (enter) (g.assetRow ||= new AssetRow(g)).start();
    else if (g.assetRow) g.assetRow.exit();
  }

  teleport(l) {
    const g = this.game;
    const P = g.player;
    if (this.inRow()) g.assetRow.exit(); // back to the Moon first (the Row has its own flat ground)
    const p = g.world.toWorld(l, 0, 0, Math.min(l.r * 0.8, 120));
    const pos = g.planet.ground(p, p.clone(), 1.5);
    g.planet.update(pos, { budgetMs: 1e9 });
    const ground = g.planet.ground(p, p.clone(), 1.5);
    const fwd = l.pos.clone().sub(ground);
    const up = ground.clone().normalize();
    fwd.addScaledVector(up, -fwd.dot(up)).normalize();
    P.respawn(ground, fwd);
    g.cam.fwd.copy(fwd);
    g.globe.discover(l, true);
    g.fx.pop(`→ ${l.short || l.name}`, null, { color: '#2ee6ff', size: 50 });
  }

  unlockAll() {
    const g = this.game;
    for (const items of Object.values(SHOPS)) for (const u of items) g.upgrades[u.key] = Math.max(g.upgrades[u.key] || 0, u.max);
    g.upgrades.jar = Math.max(g.upgrades.jar || 0, 3);
    // earned, not bought: Zbornak's trade-ins, pen link, Xenoglide skates
    Object.assign(g.upgrades, { gripwire: 3, plating: 3, radar: 1, penlink: 1, alien: 1 });
    for (const id of Object.keys(OUTFITS)) if (id !== 'courier') g.upgrades['outfit_' + id] = 1;
    for (const id of Object.keys(SKATES)) if (id !== 'stock') g.upgrades['skates_' + id] = 1;
    g.player.applyUpgrades(g.upgrades);
    g.player.health = g.player.maxHealth;
    g.alchemy.refreshJarMesh();
    g.save();
    g.hud.toast('Everything unlocked (incl. grip tunes, plating, event radar, pen link, Xenoglide skates). Weapons on 1-4, wardrobe on C.', 4);
  }

  // the lab kit, and shortcuts through the chimeras' racing careers
  chimeraMenu() {
    const g = this.game;
    const A = g.alchemy;
    const all = (fn) => { for (const c of A.chimeras) { ensureStats(c); fn(c); } A.save(); A.syncChimeras(); this.chimeraMenu(); };
    g.dialog('CHEAT MENU · LAB & CHIMERAS', `<small>${A.chimeras.length} chimeras. The career shortcuts apply to every one of them.</small>`, [
      { label: '1 · LAB KIT (big jar, items, 3 chimeras)', fn: () => { this.labKit(); this.chimeraMenu(); } },
      { label: '2 · +3 TRAINING SESSIONS EACH', fn: () => all((c) => { c.career.train += 3; }) },
      { label: '3 · SKIP TO THIS SEASON\'S TOURNAMENT', fn: () => all((c) => { if (!c.career.retired) c.career.races = SEASON_RACES; }) },
      { label: '4 · TEACH EVERY SKILL', fn: () => all((c) => { c.skills = [...SKILL_IDS]; }) },
      { label: '5 · RETIRE THEM ALL (to test selling)', fn: () => all((c) => { c.career.retired = true; }) },
      { label: '6 · BACK', fn: () => this.open() },
      { label: 'CLOSE' },
    ]);
  }

  labKit() {
    const g = this.game;
    const A = g.alchemy;
    g.upgrades.jar = Math.max(g.upgrades.jar || 0, 3);
    A.jar = [{ kind: 'person', name: 'Gary' }, { kind: 'mite' }, { kind: 'water' }];
    const living = ['person', 'mite', 'car', 'pirate', 'voidling', 'sapling'];
    for (let i = 0; i < 3; i++) {
      const items = [{ kind: pick(living), name: pick(['Gary', 'Priya', 'Grit', 'Doris']) }, { kind: pick(living) }];
      if (Math.random() < 0.6) items.push({ kind: pick(['water', 'rock', 'dirt']) });
      A.chimeras.push(spliceGenes(items));
    }
    A.save();
    A.syncChimeras();
    A.refreshJarMesh();
    g.save();
    g.hud.toast('Jar filled (person, mite, black water) and 3 chimeras added.', 3);
  }

  // Straight onto the Spindle: drops the running chapter, starts Meridian's finale and skips the trip to the launch
  // complex (finishing it counts).
  toSpindle() {
    const g = this.game;
    const S = g.story;
    if (g.spindle.active || !this.notInRow()) return;
    if (S.active) S.fail('Dropped for a test launch.');
    S.start('meridian', 4);
    S.skipStep();
  }

  joinRustmoon() {
    const g = this.game;
    g.rep.rustmoon = 'aligned';
    if (g.rep.get('rustmoon') < 15) g.rep.values.rustmoon = 15;
    g.rep.save();
    for (const l of g.locations) if (l.faction === 'rustmoon' && !l.camp) g.globe.discover(l, true);
    g.hud.toast('You ride with Rustmoon now.', 2.5);
  }

  // spawn a fresh faction event and drop you at its start marker
  eventMenu() {
    if (!this.notInRow()) return;
    const g = this.game;
    const fs = ['spacecom', 'vostok', 'meridian', 'kepler', 'daedalus', 'rustmoon'];
    this.grid('SPAWN EVENT', () => [
      ...fs.map((f) => ({
        icon: '📡',
        name: FACTIONS[f].name.toUpperCase(),
        fn: () => {
          const ev = g.events.create(f);
          if (!ev) { g.hud.toast('No event fits right now; try again.', 2); return; }
          g.planet.update(ev.start, { budgetMs: 1e9 });
          g.player.respawn(g.planet.ground(ev.start.clone().addScaledVector(g.cam.right, 6), ev.start.clone(), 1.5));
        },
      })),
      { icon: '☄️', name: 'METEOR SHOWER', sub: 'teleports you to its edge', fn: () => {
        const M = g.meteors;
        if (M.zone) M.zone = null; // not end(): its 'has passed' toast would sit under the new banner
        M.begin();
        if (!M.zone) { g.hud.toast('No open ground nearby for a shower; try again.', 2); return; }
        const up = g.player.pos.clone().normalize();
        const t = M.zone.dir.clone().sub(up);
        const edge = greatCircle(M.zone.dir, t.lengthSq() > 1e-8 ? t.negate() : g.cam.right, M.zone.r + 60, new THREE.Vector3());
        g.planet.update(edge, { budgetMs: 1e9 });
        g.player.respawn(g.planet.ground(edge, new THREE.Vector3(), 1.5));
      } },
    ], { note: 'Creates a new event and teleports you to where it starts.', back: () => this.open() });
  }

  // Back to a new runner's base for testing: the story, gear, outfits, standing, unlock counters, the world's finale changes, outposts and the
  // tutorial. Kept: credits, the charted map, the lab and its chimeras, settings. The saved keys are cleared and the game reloads, so
  // nothing live (outposts, finale scenery) survives to be saved back.
  confirmResetProgress() {
    const g = this.game;
    g.dialog('RESET PROGRESS?', 'Resets the story, every gear, weapon and cosmetic unlock, faction standing, unlock counters, outposts and finale changes, and offers the tutorial again. Keeps your credits, the charted map, the lab and chimeras, and settings. The game reloads.', [
      { label: '1 · YES, RESET', fn: () => this.resetProgress() },
      { label: '2 · NO', fn: () => this.open() },
    ]);
  }

  resetProgress() {
    const g = this.game;
    for (const k of Object.keys(g.upgrades)) { if (/^(outfit|skates)_/.test(k) || k === 'alien') delete g.upgrades[k]; else g.upgrades[k] = 0; }
    g.stats = { deliveries: 0, bestTrick: 0 };
    try {
      for (const k of ['story-v1', 'rep-v2', 'territory-v1', 'world-v1', 'secrets-v1', 'tutorial-v1', 'style-v1']) localStorage.removeItem('moonrunner-' + k);
    } catch { /* unavailable */ }
    g.save(); // credits and the zeroed upgrades and stats (and the slot's snapshot, now without the cleared keys)
    location.reload();
  }

  confirmReset() {
    const g = this.game;
    const n = g.saves && g.saves.active;
    g.dialog('RESET THIS SAVE?', `Wipes ${n ? `save slot ${n}` : 'this save'} (credits, upgrades, reputation, map, chimeras and outfits) and returns to the main menu. Other slots and your settings are kept.`, [
      { label: '1 · YES, WIPE IT', fn: () => {
        if (g.saves && n) g.saves.remove(n); // clears the slot and the live working copy
        else { try { for (const k of Object.keys(localStorage)) if (k.startsWith('moonrunner-') && k !== 'moonrunner-settings-v1') localStorage.removeItem(k); } catch { /* unavailable */ } }
        location.reload();
      } },
      { label: '2 · NO', fn: () => this.open() },
    ]);
  }
}
