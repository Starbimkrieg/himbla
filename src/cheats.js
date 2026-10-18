import { FACTIONS, SHOPS } from './locations.js';
import { OUTFITS, SKATES } from './cosmetics.js';
import { spliceGenes } from './chimera.js';
import { pick } from './rng.js';
import { VEHICLES } from './vehicles.js';
import { BIKE_STYLES, getBikeStyle, setBikeStyle, SKIMMER_STYLES, getSkimmerStyle, setSkimmerStyle } from './models.js';
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
const BIKE_NAMES = { b: 'B · PARCEL RUNNER', a: 'A · SLIPSTREAM', classic: 'CLASSIC' };
const SKIMMER_NAMES = { a: 'A · AEGIS', b: 'B · BULWARK', classic: 'CLASSIC' };
const GIT_POLL = 90; // seconds between looks at the upstream while the upstream chip is on

// Testing menu on the ` (backtick) key. Everything goes through the normal dialog, so number
// keys pick options and Esc closes.
export class Cheats {
  constructor(game) {
    this.game = game;
    this.god = false; // unlimited health
    this.infJet = false; // unlimited jet (thruster energy)
    this.mapTeleport = false; // click a location (or press A with the controller cursor on it) in the full map to go there
    this.debugView = null; // 'poly' (every polygon outlined) | 'draw' (every draw call its own flat colour): the scene drawn bare, without the comic post pass
    this.ragdoll = true; // wipeouts and hard crashes turn the runner limp (player.js startRagdoll); off: you stay on your feet
    this.crackedVisor = true; // the cracks that spread over the screen as hull drops (hud.js)
    this.speed = 1; // player speed multiplier, 1 to 10 (player.js)
    // once the dev menu has been opened (F8 / controller combo) it gets a button on the pause card, remembered across launches
    try { this.unlocked = localStorage.getItem(DEV_KEY) === '1'; } catch { this.unlocked = false; }
    // the first time the dev menu's SPAWN A METEOR ON ME is used it becomes a power (powers.js), remembered across launches too
    try { this.meteorPower = localStorage.getItem(METEOR_KEY) === '1'; } catch { this.meteorPower = false; }
    this.overlay = new DevOverlay(game, this); // (F3: every on-screen readout in one panel: devoverlay.js)
    this.freeCam = new FreeCam(game); // (Dev menu → Debug overlay → Free cam: the camera flies on its own: freecam.js)
    this.showPauseButton();
    // the chip at the top left that counts the commits the upstream has and this checkout does not (GIT menu, dev server only)
    try { this.gitChip = localStorage.getItem(GITCHIP_KEY) === '1'; } catch { this.gitChip = false; }
    this.gitState = null; // the last answer from the dev server's git status
    this.gitTimer = 0;
    this.gitChipSync();
  }

  // (read by enemies.js: whether to record each AI's steering goal for the AI paths drawing)
  get aiPaths() { return this.overlay.shows('paths'); }

  showPauseButton() {
    const b = document.getElementById('dev-btn-pause');
    if (b) b.classList.toggle('hidden', !this.unlocked);
  }

  // In the Asset Row (assetRow.js)? Then the Moon-only entries (spawns, events, the story, vehicles, ...) would run against
  // the wrong world: they say so instead.
  inRow() { const a = this.game.assetRow; return !!(a && a.active); }
  notInRow() {
    if (!this.inRow()) return true;
    this.game.hud.toast('Leave the Asset Row first: teleport menu, option 1.', 3);
    return false;
  }

  // Hidden dev menu: F8, or B, B, X, Y on a controller (gamepad.js). Press F8 again to close.
  dev() {
    const g = this.game;
    if (!this.unlocked) {
      this.unlocked = true;
      try { localStorage.setItem(DEV_KEY, '1'); } catch { /* unavailable */ }
      this.showPauseButton();
    }
    g.dialog('DEV MENU', '<small>Hidden. Toggles last until you reload.</small>', [
      { label: '1 · UNLIMITED JET, HEALTH & SPEED…', fn: () => this.boostMenu() },
      { label: '2 · SPAWN A METEOR ON ME', fn: () => this.meteorFromMenu() },
      { label: `3 · DEBUG OVERLAY: ${this.overlay.on ? 'ON' : 'OFF'}  (F3)…`, fn: () => this.overlayMenu() },
      { label: '4 · DISPLAY TESTS…', fn: () => this.displayMenu() },
      { label: `5 · CLICK MAP TO TELEPORT: ${this.mapTeleport ? 'ON' : 'OFF'}`, fn: () => { this.mapTeleport = !this.mapTeleport; this.dev(); } },
      { label: '6 · FULL CHEAT MENU…', fn: () => this.open() },
      { label: `7 · RAGDOLL: ${this.ragdoll ? 'ON' : 'OFF'}`, fn: () => { this.toggleRagdoll(); this.dev(); } },
      { label: '8 · GIT: FETCH & PULL UPSTREAM…', fn: () => this.gitMenu() },
      { label: `9 · COURIER MODEL: ${BIKE_NAMES[getBikeStyle()]}`, fn: () => this.bikeModel() },
      { label: `10 · SKIMMER MODEL: ${SKIMMER_NAMES[getSkimmerStyle()]}`, fn: () => this.skimmerModel() },
      { label: 'CLOSE' },
    ]);
    g.dialogButtons.dev = true;
  }

  // Cycles which Courier light-bike gets built (models.js makeLightBike): B and A are the Blender redesigns (docs/courier-proposals).
  // Remembered across launches; it applies to the next bike you call (V), so a bike already out keeps the model it was built with.
  bikeModel() {
    const next = BIKE_STYLES[(BIKE_STYLES.indexOf(getBikeStyle()) + 1) % BIKE_STYLES.length];
    setBikeStyle(next);
    this.game.hud.toast(`Courier light-bike: ${BIKE_NAMES[next]}. Put the bike away (V) and call it again to see it.`, 4);
    this.dev();
  }

  // Cycles which Phase Skimmer gets built (models.js makeSkimmer): A and B are the Blender redesigns (docs/skimmer-proposals), which carry
  // the runner inside. Remembered across launches; it applies to the next skimmer you call (V).
  skimmerModel() {
    const next = SKIMMER_STYLES[(SKIMMER_STYLES.indexOf(getSkimmerStyle()) + 1) % SKIMMER_STYLES.length];
    setSkimmerStyle(next);
    this.game.hud.toast(`Phase Skimmer: ${SKIMMER_NAMES[next]}. Put it away (V) and call it again to see it.`, 4);
    this.dev();
  }

  // ---- git: the dev server runs it for us (tools/devGit.mjs: a fetch, and a fast-forward pull only), so all of this works from
  // `npm run dev` and nowhere else ----
  async gitCall(act) {
    try {
      const r = await fetch(`/__dev/git/${act}`, { method: 'POST', headers: { 'X-Dev-Git': '1' } });
      return await r.json();
    } catch (e) { return { ok: false, err: String((e && e.message) || e) }; }
  }

  // The upstream chip (top left of the HUD): how many commits the upstream has that this checkout does not. While it is on, the
  // upstream is fetched every GIT_POLL seconds (and whenever the GIT menu looks); the toggle is in the GIT menu, kept across launches.
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

  // Fetch and pull this checkout's upstream without leaving the game. The dev server notices the pulled files and reloads the page.
  async gitMenu() {
    const g = this.game;
    const esc = (t) => String(t).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    const dev = import.meta.env.DEV;
    const show = (text, buttons, again = null) => {
      // (the chip's switch sits just before BACK on every screen that can come back to itself)
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
    if (g.dialogButtons !== mine) return; // (closed or changed while it was working)
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

  // Unlimited jet and health, and the speed multiplier
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
    // the speed row adjusts in place: click / A = +1 (wraps), left / right on a controller (d-pad or stick) = -1 / +1
    const row = document.querySelector('#dialog [data-i="2"]');
    if (row) {
      row.dataset.adj = '1';
      const bump = (d) => { this.setSpeed(this.speed + d); row.textContent = this.speedLabel(); };
      row.addEventListener('adj', (e) => bump(e.detail));
      row.onclick = (e) => { e.stopPropagation(); bump(this.speed >= 10 ? -9 : 1); };
    }
  }

  // Ragdoll on / off. Off, a wipeout or a hard crash still costs you the same health and speed but you stay on your feet;
  // turning it off mid-tumble stands you straight back up.
  toggleRagdoll() {
    const P = this.game.player;
    this.ragdoll = !this.ragdoll;
    if (!this.ragdoll && P.rag) { P.rag.release(); P.rag = null; }
  }

  // The dev menu's meteor button. The first time it also becomes a power (the power wheel's METEOR SPAWN, equipped straight
  // away), so from then on E / RB drops one on you without the menu.
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

  // A rock that comes down on the spot you're standing on (meteors.js spawnOnPlayer): a few seconds' warning from the ring.
  // (`long`: the full note; the power's repeat uses show a short one.) False when there's no place for one (the Spindle).
  spawnMeteor(long = true) {
    const g = this.game;
    if (g.spindle && g.spindle.active) { g.hud.toast('No meteors out on the Spindle.', 2); return false; }
    if (!this.notInRow()) return false;
    g.meteors.spawnOnPlayer();
    if (long) g.hud.toast('Meteor inbound: it lands where you stand in a few seconds. Move, or go and land on it.', 4);
    else g.hud.toast('Meteor inbound!', 1.5);
    return true;
  }

  // The display tests: effects and render modes you switch on to look at something (the on-screen readouts
  // are in the debug overlay)
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

  // Debug views. The scene is drawn bare (no comic post pass) with one flat-colour material standing in
  // for every material (scene.overrideMaterial): 'draw' fills each draw call with a colour of its own
  // (stable per object, so batching shows: a merged chunk is one colour, a pile of loose props a
  // confetti), 'poly' fills dark and draws every triangle's edges on top. The colour is set per draw call
  // by wrapping renderBufferDirect, which three calls once per draw.
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
      // (the fill sits a touch behind, so the outlines drawn over it aren't z-fought away)
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

  // every frame while playing: keeps the tank and health topped up
  tick() {
    const P = this.game.player;
    if (this.infJet) P.body.energy = P.body.maxEnergy;
    if (this.god && !P.dead) P.health = P.maxHealth;
    this.overlay.tick();
  }

  // (enemies.js: the Kade roll note under the squad alert, shown with the overlay's pirate spawns section)
  alertNote(text, secs) { this.overlay.alertNote(text, secs); }

  // Dev menu → Debug overlay: the master switch (F3 does the same in play), the free cam, and which sections are in the overlay.
  // Each toggle re-opens the menu, like the other submenus.
  overlayMenu() {
    const g = this.game, o = this.overlay, f = this.freeCam;
    const on = (v) => (v ? 'ON' : 'OFF');
    g.dialog('DEBUG OVERLAY', '<small>Every on-screen readout in one panel. F3 shows or hides it in play; the sections you pick are remembered. Free cam flies the camera while the runner stands still (its controls are shown at the top of the screen); it is off after a reload.</small>', [
      { label: `1 · OVERLAY: ${on(o.on)}`, fn: () => { o.toggle(); this.overlayMenu(); } },
      { label: `2 · FREE CAM: ${on(f.on)}`, fn: () => { f.toggle(); this.overlayMenu(); } },
      ...SECTIONS.map((s, i) => ({ label: `${i + 3} · ${s.name}: ${on(o.sec[s.key])}`, fn: () => { o.setSection(s.key, !o.sec[s.key]); this.overlayMenu(); } })),
      { label: 'BACK', fn: () => this.dev() }, // (rows past the ninth are mouse / pad: the number keys stop at 9; Esc closes)
      { label: 'CLOSE' },
    ]);
  }

  open() {
    const g = this.game;
    g.dialog('CHEAT MENU', '<small>For testing. Changes are saved like normal progress.</small>', [
      { label: '1 · +₵10,000', fn: () => { g.addCredits(10000, 'Cheat'); g.save(); this.open(); } },
      { label: '2 · REVEAL WHOLE MAP', fn: () => { this.revealMap(); this.open(); } },
      { label: '3 · REPUTATION…', fn: () => this.repMenu() },
      { label: '4 · TELEPORT…', fn: () => this.teleportMenu(0) },
      { label: `5 · GOD MODE: ${this.god ? 'ON' : 'OFF'}`, fn: () => { this.god = !this.god; g.player.health = g.player.maxHealth; this.open(); } },
      { label: '6 · UNLOCK ALL GEAR, WEAPONS & COSMETICS', fn: () => { this.unlockAll(); this.open(); } },
      { label: '7 · LAB KIT (big jar, items, 3 chimeras)', fn: () => { this.labKit(); this.open(); } },
      { label: '8 · MORE…', fn: () => this.moreMenu() },
      { label: '9 · SPAWN A VEHICLE…', fn: () => this.vehicleMenu() },
      { label: 'CLOSE' },
    ]);
  }

  // Drops any faction vehicle next to you and puts you in it (owned or not; doesn't unlock it, so V
  // still only calls the ones the story has given you)
  vehicleMenu() {
    if (!this.notInRow()) return;
    const g = this.game;
    const ids = Object.keys(VEHICLES);
    g.dialog('SPAWN A VEHICLE', '<small>Drops it beside you and hops you in. Replaces any vehicle already out.</small>', ids.map((k, i) => ({
      label: `${i + 1} · ${VEHICLES[k].name}`,
      fn: () => {
        if (g.player.vehicle) g.garage.exit();
        g.garage.hp[k] = g.garage.maxHp(k); // (fresh hull, and not stuck in a rebuild)
        g.garage.wreckedUntil[k] = 0;
        g.garage.choice = k;
        g.garage.summon(k);
        g.garage.enter();
      },
    })).concat([{ label: `${ids.length + 1} · BACK`, fn: () => this.open() }]));
  }

  moreMenu() {
    const g = this.game;
    g.dialog('CHEAT MENU · MORE', `<small>Stats: ${g.stats.events || 0} events, ${g.stats.meridianEvents || 0} Meridian events, ${g.stats.darkDeliveries || 0} dark deliveries, ${g.stats.raceWins || 0} Derby wins.</small>`, [
      { label: '1 · JOIN RUSTMOON (skip the Pirate Wreck)', fn: () => { this.joinRustmoon(); this.moreMenu(); } },
      { label: '2 · SPAWN PIRATE SQUAD', fn: () => { if (this.notInRow()) g.enemies.spawnSquad(3); } },
      { label: '3 · SPAWN MEGA MITE', fn: () => { if (this.notInRow()) g.alchemy.spawnMegaMite(); } },
      { label: '4 · SPAWN AN EVENT… (or a meteor shower)', fn: () => this.eventMenu() },
      { label: '5 · UNLOCK-STAT COUNTERS (events, deliveries, wins)', fn: () => { Object.assign(g.stats, { meridianEvents: Math.max(3, g.stats.meridianEvents || 0), darkDeliveries: Math.max(5, g.stats.darkDeliveries || 0), raceWins: Math.max(1, g.stats.raceWins || 0) }); g.save(); this.moreMenu(); } },
      { label: `6 · SPLICE MUTATIONS… (${g.alchemy.mutations.length} active)`, fn: () => this.spliceMenu(0) },
      { label: '7 · RESET THIS SAVE SLOT (back to menu)', fn: () => this.confirmReset() },
      { label: '8 · STORY…', fn: () => this.storyMenu() },
      { label: '9 · BACK', fn: () => this.open() },
      { label: 'CLOSE' },
    ]);
  }

  // Every splice-pod mutation as a toggle (ignores the pod's 3-mutation cap), plus a reset that
  // cures them all. Paged because the dialog only has number keys 1-9.
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
    rows.push({ label: `${rows.length + 1} · BACK`, fn: () => this.moreMenu() });
    const active = A.mutations.map((k) => MUTATIONS[k].name).join(', ') || 'none';
    g.dialog('CHEAT MENU · SPLICE', `<small>Toggles each pod mutation without the jar or the 3-mutation cap.<br>Active: ${active}</small>`, rows);
  }

  storyMenu() {
    if (!this.notInRow()) return;
    const g = this.game;
    const S = g.story;
    const A = S.active;
    g.dialog('CHEAT MENU · STORY', `<small>Committed to: <b>${S.faction ? FACTIONS[S.faction].name : 'nobody yet'}</b>${A ? ` · active: ${A.def.title} (step ${A.si + 1}/${A.steps.length})` : ''}<br>Vehicles: ${S.vehicles.join(', ') || 'none'} · Tech: ${S.tech.join(', ') || 'none'}</small>`, [
      { label: '1 · SKIP CURRENT STEP', fn: () => { if (S.active) S.skipStep(); this.storyMenu(); } },
      { label: '2 · TELEPORT TO CURRENT OBJECTIVE', fn: () => { const o = S.objective(); if (o) { S.teleportTo(o.pos.clone().normalize()); } } },
      { label: '3 · SPAWN CAPTAIN KADE (ambush)', fn: () => { S.spawnKade(false); } },
      { label: '4 · ALL VEHICLES + TECH', fn: () => { S.vehicles = Object.keys(VEHICLES); S.tech = Object.keys(TECH); S.save(); this.storyMenu(); } },
      { label: '5 · RESET STORY (keeps outposts)', fn: () => { if (S.active) S.fail('Reset.'); S.faction = null; S.progress = {}; S.kade.captured = false; S.save(); this.storyMenu(); } },
      { label: '6 · DROP ME ON SAT-7 (matched speed)', fn: () => { const S = g.secrets; const o = S.sat; const up = o.pos.clone().normalize(); g.player.respawn(o.pos.clone().addScaledVector(up, 4)); g.player.body.vel.copy(o.vel); } },
      { label: '7 · TELEPORT TO THE WHISPERING FISSURE', fn: () => { const L = g.secrets.loc; g.globe.discover(L, true); S.teleportTo(g.world.toWorld(L, 0, 0, -90).normalize()); } },
      { label: '8 · GIVE ME THE ALIEN ARTIFACT', fn: () => { g.upgrades.jar = Math.max(1, g.upgrades.jar || 0); g.alchemy.artifact = true; g.secrets.state.artifactTaken = true; g.secrets.sat.artifact.visible = g.secrets.sat.aGlow.visible = false; g.secrets.save(); g.alchemy.save(); g.alchemy.refreshJarMesh(); this.storyMenu(); } },
      { label: '9 · LAUNCH TO THE SPINDLE (Meridian finale)', fn: () => this.toSpindle() },
      { label: 'BACK', fn: () => this.moreMenu() },
      { label: 'CLOSE' },
    ]);
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

  teleportMenu(page) {
    const g = this.game;
    // the Asset Row (assetRow.js: a flat showroom of every asset, not a place on the Moon) is always option 1, the settlements follow it
    const items = [
      { name: this.inRow() ? 'LEAVE ASSET ROW' : 'ASSET ROW', fn: () => this.assetRow(!this.inRow()) },
      ...g.locations.filter((l) => !l.camp).map((l) => ({ name: l.name, fn: () => this.teleport(l) })),
    ];
    const per = 7;
    const slice = items.slice(page * per, page * per + per);
    const pages = Math.ceil(items.length / per);
    const buttons = slice.map((it, i) => ({ label: `${i + 1} · ${it.name}`, fn: it.fn }));
    buttons.push({ label: `${buttons.length + 1} · NEXT PAGE (${page + 1}/${pages})`, fn: () => this.teleportMenu((page + 1) % pages) });
    buttons.push({ label: `${buttons.length + 1} · BACK`, fn: () => this.open() });
    g.dialog('TELEPORT', '<small>Drops you at the edge of the settlement. Option 1 is the Asset Row: every asset in the game, side by side.</small>', buttons);
  }

  // into the Asset Row, or out of it to where you were
  assetRow(enter) {
    const g = this.game;
    if (enter) (g.assetRow ||= new AssetRow(g)).start();
    else if (g.assetRow) g.assetRow.exit();
  }

  teleport(l) {
    const g = this.game;
    const P = g.player;
    if (this.inRow()) g.assetRow.exit(); // (back on the Moon first: the Row has its own flat ground)
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
    // the ones you earn rather than buy: Zbornak's trade-ins, the pen link, the legendary Xenoglide skates
    Object.assign(g.upgrades, { gripwire: 3, plating: 3, radar: 1, penlink: 1, alien: 1 });
    for (const id of Object.keys(OUTFITS)) if (id !== 'courier') g.upgrades['outfit_' + id] = 1;
    for (const id of Object.keys(SKATES)) if (id !== 'stock') g.upgrades['skates_' + id] = 1;
    g.player.applyUpgrades(g.upgrades);
    g.player.health = g.player.maxHealth;
    g.alchemy.refreshJarMesh();
    g.save();
    g.hud.toast('Everything unlocked (incl. grip tunes, plating, event radar, pen link, Xenoglide skates). Weapons on 1-4, wardrobe on C.', 4);
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

  // Straight onto the Spindle to test it: drops whatever chapter is running, starts Meridian's
  // finale and skips the trip to the launch complex (finishing it counts, like any chapter).
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

  // Spawn a fresh event for a faction and drop you at its start marker.
  eventMenu() {
    if (!this.notInRow()) return;
    const g = this.game;
    const fs = ['spacecom', 'vostok', 'meridian', 'kepler', 'daedalus', 'rustmoon'];
    g.dialog('SPAWN EVENT', '<small>Creates a new event and teleports you to where it starts.</small>', fs.map((f, i) => ({
      label: `${i + 1} · ${FACTIONS[f].name.toUpperCase()}`,
      fn: () => {
        const ev = g.events.create(f);
        if (!ev) { g.hud.toast('No event fits right now; try again.', 2); return; }
        g.planet.update(ev.start, { budgetMs: 1e9 });
        g.player.respawn(g.planet.ground(ev.start.clone().addScaledVector(g.cam.right, 6), ev.start.clone(), 1.5));
      },
    })).concat([
      { label: '7 · METEOR SHOWER (teleports you to its edge)', fn: () => {
        const M = g.meteors;
        if (M.zone) M.zone = null; // (not end(): its 'has passed' toast would sit under the new shower's banner)
        M.begin();
        if (!M.zone) { g.hud.toast('No open ground nearby for a shower; try again.', 2); return; }
        const up = g.player.pos.clone().normalize();
        const t = M.zone.dir.clone().sub(up);
        const edge = greatCircle(M.zone.dir, t.lengthSq() > 1e-8 ? t.negate() : g.cam.right, M.zone.r + 60, new THREE.Vector3());
        g.planet.update(edge, { budgetMs: 1e9 });
        g.player.respawn(g.planet.ground(edge, new THREE.Vector3(), 1.5));
      } },
      { label: '8 · BACK', fn: () => this.moreMenu() },
    ]));
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
      { label: '2 · NO', fn: () => this.moreMenu() },
    ]);
  }
}
