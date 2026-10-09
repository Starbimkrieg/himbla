import { FACTIONS, SHOPS } from './locations.js';
import { OUTFITS, SKATES } from './cosmetics.js';
import { spliceGenes } from './chimera.js';
import { pick } from './rng.js';
import { VEHICLES } from './vehicles.js';
import { TECH } from './story.js';
import * as THREE from 'three';
import { greatCircle } from './geo.js';

// Testing menu on the ` (backtick) key. Everything goes through the normal dialog, so number
// keys pick options and Esc closes.
export class Cheats {
  constructor(game) {
    this.game = game;
    this.god = false;
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
      { label: '9 · CLOSE' },
    ]);
  }

  moreMenu() {
    const g = this.game;
    g.dialog('CHEAT MENU · MORE', `<small>Stats: ${g.stats.events || 0} events, ${g.stats.meridianEvents || 0} Meridian events, ${g.stats.darkDeliveries || 0} dark deliveries, ${g.stats.raceWins || 0} Derby wins.</small>`, [
      { label: '1 · JOIN RUSTMOON (skip the Pirate Wreck)', fn: () => { this.joinRustmoon(); this.moreMenu(); } },
      { label: '2 · SPAWN PIRATE SQUAD', fn: () => { g.enemies.spawnSquad(3); } },
      { label: '3 · SPAWN MEGA MITE', fn: () => { g.alchemy.spawnMegaMite(); } },
      { label: '4 · SPAWN AN EVENT… (or a meteor shower)', fn: () => this.eventMenu() },
      { label: '5 · UNLOCK-STAT COUNTERS (events, deliveries, wins)', fn: () => { Object.assign(g.stats, { meridianEvents: Math.max(3, g.stats.meridianEvents || 0), darkDeliveries: Math.max(5, g.stats.darkDeliveries || 0), raceWins: Math.max(1, g.stats.raceWins || 0) }); g.save(); this.moreMenu(); } },
      { label: '6 · CURE MUTATIONS', fn: () => { g.alchemy.cure(); this.moreMenu(); } },
      { label: '7 · RESET THIS SAVE SLOT (back to menu)', fn: () => this.confirmReset() },
      { label: '8 · STORY…', fn: () => this.storyMenu() },
      { label: '9 · BACK', fn: () => this.open() },
      { label: 'CLOSE' },
    ]);
  }

  storyMenu() {
    const g = this.game;
    const S = g.story;
    const A = S.active;
    g.dialog('CHEAT MENU · STORY', `<small>Committed to: <b>${S.faction ? FACTIONS[S.faction].name : 'nobody yet'}</b>${A ? ` · active: ${A.def.title} (step ${A.si + 1}/${A.steps.length})` : ''}<br>Vehicles: ${S.vehicles.join(', ') || 'none'} · Tech: ${S.tech.join(', ') || 'none'}</small>`, [
      { label: '1 · SKIP CURRENT STEP', fn: () => { if (S.active) S.next(); this.storyMenu(); } },
      { label: '2 · TELEPORT TO CURRENT OBJECTIVE', fn: () => { const o = S.objective(); if (o) { S.teleportTo(o.pos.clone().normalize()); } } },
      { label: '3 · SPAWN CAPTAIN KADE (ambush)', fn: () => { S.spawnKade(false); } },
      { label: '4 · ALL VEHICLES + TECH', fn: () => { S.vehicles = Object.keys(VEHICLES); S.tech = Object.keys(TECH); S.save(); this.storyMenu(); } },
      { label: '5 · RESET STORY (keeps outposts)', fn: () => { if (S.active) S.fail('Reset.'); S.faction = null; S.progress = {}; S.kade.captured = false; S.save(); this.storyMenu(); } },
      { label: '6 · DROP ME ON SAT-7 (matched speed)', fn: () => { const S = g.secrets; const o = S.sat; const up = o.pos.clone().normalize(); g.player.respawn(o.pos.clone().addScaledVector(up, 4)); g.player.body.vel.copy(o.vel); } },
      { label: '7 · TELEPORT TO THE WHISPERING FISSURE', fn: () => { const L = g.secrets.loc; g.globe.discover(L, true); S.teleportTo(g.world.toWorld(L, 0, 0, -90).normalize()); } },
      { label: '8 · GIVE ME THE ALIEN ARTIFACT', fn: () => { g.upgrades.jar = Math.max(1, g.upgrades.jar || 0); g.alchemy.artifact = true; g.secrets.state.artifactTaken = true; g.secrets.sat.artifact.visible = g.secrets.sat.aGlow.visible = false; g.secrets.save(); g.alchemy.save(); g.alchemy.refreshJarMesh(); this.storyMenu(); } },
      { label: '9 · BACK', fn: () => this.moreMenu() },
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
    const locs = g.locations.filter((l) => !l.camp);
    const per = 7;
    const slice = locs.slice(page * per, page * per + per);
    const pages = Math.ceil(locs.length / per);
    const buttons = slice.map((l, i) => ({ label: `${i + 1} · ${l.name}`, fn: () => this.teleport(l) }));
    buttons.push({ label: `${buttons.length + 1} · NEXT PAGE (${page + 1}/${pages})`, fn: () => this.teleportMenu((page + 1) % pages) });
    buttons.push({ label: `${buttons.length + 1} · BACK`, fn: () => this.open() });
    g.dialog('TELEPORT', '<small>Drops you at the edge of the settlement.</small>', buttons);
  }

  teleport(l) {
    const g = this.game;
    const P = g.player;
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
        if (M.zone) M.end();
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
    g.dialog('RESET THIS SAVE?', `Wipes ${n ? `save slot ${n}` : 'this save'} (credits, upgrades, reputation, map, chimeras, outfits and highlights) and returns to the main menu. Other slots and your settings are kept.`, [
      { label: '1 · YES, WIPE IT', fn: () => {
        if (g.saves && n) g.saves.remove(n); // clears the slot and the live working copy
        else { try { for (const k of Object.keys(localStorage)) if (k.startsWith('moonrunner-') && k !== 'moonrunner-settings-v1') localStorage.removeItem(k); } catch { /* unavailable */ } }
        location.reload();
      } },
      { label: '2 · NO', fn: () => this.moreMenu() },
    ]);
  }
}
