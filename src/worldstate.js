// The Moon after the story: what each faction finale changed for good. Saved under a live 'moonrunner-*' key (so it's in
// the save slot) and applied at boot before the world is built, so every builder, defence and spawner sees the remapped
// locations.
//
//   conquered   { loser: winner }  vostok/daedalus finales: the loser's settlements fly the winner's flag and use its
//                                  reputation, shops and clearance
//   piratesGone true               SPACECOM finale: Rustmoon Hold is a ruin, other dens resettled as civilian towns,
//                                  no pirates spawn, Kade is gone
//   lawless     true               Rustmoon finale: the ILMB fell; SPACECOM's guns are silent everywhere
//   razed       [outpost ids]      Lights Out: SPACECOM outposts the charges took down (rebuilt as Rustmoon's after the chapter)
//   pirateTowns [location ids]     Lights Out: towns the clans blew up and took (pirate dens now)
//   blackSun    true               Daedalus chapter 4: the reactor at the Forward Post stays
//   town        {dir,name,kind,    Kepler finale: your town (hometown.js), a settlement on the map. slots: eight building
//               slots,bank,radio,  keys or null ('school' is read as 'roads' at load); radio: the Radio Tower's map sweep
//               sapNext,defNext}   { d: [x,y,z], r metres, on, n cells, f: [location ids] } (radio.js); sapNext: next
//                                  nursery sapling at the Greenhouse Farm; defNext: when the Motor Pool can send its
//                                  militia rovers again (both ms since 1970, real time, like council.next)
//   council     {passed,next}      the Moon Council's carried motions and next sitting
//   respawnAt   string|null        HQ (location id) set at your town clinic to redeploy at after a K.O. (respawn.js);
//                                  null = nearest clinic, else home
//   bulletin    string|null        news shown once on the first load after a finale (also set by a carried council vote,
//                                  until its new dawn has played)
import * as THREE from 'three';
import { FACTIONS, SHOPS } from './locations.js';
import { darkness, arcDist, tangent, greatCircle } from './geo.js';

const KEY = 'moonrunner-world-v1';

export function loadWorldState() {
  let d = null;
  try { d = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { /* fresh */ }
  return { conquered: {}, piratesGone: false, lawless: false, razed: [], town: null, council: null, respawnAt: null, bulletin: null, ...(d || {}) };
}

export function saveWorldState(ws) {
  try { localStorage.setItem(KEY, JSON.stringify(ws)); } catch { /* unavailable */ }
}

// Remap the location and faction tables before anything is built from them.
export function applyWorldState(ws, locations) {
  for (const [loser, winner] of Object.entries(ws.conquered || {})) {
    if (!FACTIONS[loser] || !FACTIONS[winner]) continue;
    FACTIONS[loser].absorbedBy = winner;
    for (const l of locations) {
      if (l.faction !== loser) continue;
      l.conqueredFrom = loser;
      l.faction = winner;
    }
  }
  if (ws.piratesGone) {
    FACTIONS.rustmoon.gone = true;
    for (const l of locations) {
      if (l.type !== 'pirate') continue;
      l.wasPirate = true;
      l.hostile = false;
      if (l.hq) {
        // Rustmoon Hold: demolished, a SPACECOM memorial on the rubble
        Object.assign(l, { type: 'ruin', faction: 'spacecom', jobs: undefined, blurb: 'What is left of Rustmoon Hold: scrap, scorch marks and a SPACECOM flag. The clans are finished.' });
      } else if (l.camp) {
        // small camps just empty out
        Object.assign(l, { type: 'ruin', faction: 'none', small: true, blurb: 'An abandoned pirate camp. Nobody is coming back for it.' });
      } else {
        Object.assign(l, {
          type: 'civilian', faction: 'kepler', safe: true, repair: 4, jobs: ['kepler', 'spacecom'], defense: { ring: Math.round(l.r * 0.8), turrets: 2 },
          blurb: 'Once a pirate den, now resettled by Kepler families under SPACECOM protection.',
        });
      }
    }
  }
  // Lights Out: towns the clans took are pirate dens
  for (const id of ws.pirateTowns || []) {
    const l = locations.find((x) => x.id === id);
    if (!l) continue;
    l.genR ??= l.zoneR || l.r; // outpost generation still sees the old town, so ids don't shift
    Object.assign(l, {
      type: 'pirate', faction: 'rustmoon', hostile: true, dark: true, safe: false, takenTown: true, jobs: ['rustmoon', 'rustmoon'],
      defense: undefined, restricted: false, zoneR: undefined, hq: false, r: Math.max(l.r, 110),
      blurb: 'A town the Rustmoon clans blew open and moved into. Lights off, guns on.',
    });
  }
  // Meridian: the launch complex beside the Monolith
  if (ws.launchPad) { const l = locations.find((x) => x.id === 'monolith'); if (l) l.launchPad = true; }
  // ws.quantum (Spindle core home) needs nothing here: its prize, the Slipstream Vanes, is a story tech (story.js load)
  // the Black Sun: Daedalus' reactor stays by the Forward Post
  if (ws.blackSun) { const l = locations.find((x) => x.id === 'daedalus2'); if (l) l.blackSun = true; }
  if (ws.lawless) {
    FACTIONS.spacecom.fallen = true;
    for (const l of locations) if (l.faction === 'spacecom') l.lawless = true;
  }
  // your town (late: kept out of crater and outpost generation, like Chimera Downs)
  if (ws.town && !locations.some((l) => l.id === 'hometown')) {
    const t = ws.town;
    // old saves' 'school' plot becomes Roads (in place: the location's slots and ws.town.slots are one array)
    t.slots.forEach((s, i) => { if (s === 'school') t.slots[i] = 'roads'; });
    let dir = new THREE.Vector3().fromArray(t.dir).normalize();
    // never on another settlement (an old save could sit inside Kepler Civic Center): nudge it along the ground until clear
    for (let k = 0; k < 60; k++) {
      const bad = locations.find((l) => l.dir && arcDist(dir, l.dir) < (l.zoneR || l.r) + 260);
      if (!bad) break;
      let away = tangent(dir.clone().sub(bad.dir), dir);
      if (away.lengthSq() < 1e-8) away = tangent(new THREE.Vector3(1, 0, 0), dir);
      dir = greatCircle(dir, away.normalize(), 60);
    }
    t.dir = dir.toArray();
    // fit: level the plateau to the real ground, not the smooth base noise (terrainField.fitZone)
    locations.push({
      id: 'hometown', name: t.name, short: t.name.toUpperCase().slice(0, 12), type: 'hometown', faction: 'kepler', r: 120, dir, late: true, fit: true,
      jobs: ['kepler', 'meridian', 'spacecom'], safe: true, repair: 10, defense: { ring: 100, turrets: 2 }, dark: darkness(dir) > 0.5,
      slots: t.slots, blurb: `${t.name}: your town, and the seat of the Moon Council.`,
    });
  }
  applyCouncil(ws, locations);
}

// Moon Council motions passed (hometown.js MOTIONS): open zones, new shop stock.
function applyCouncil(ws, locations) {
  const passed = (ws.council && ws.council.passed) || [];
  const sell = (shop, item) => { if (SHOPS[shop] && !SHOPS[shop].some((x) => x.key === item.key)) SHOPS[shop].push(item); };
  const open = (shop, key) => { const it = (SHOPS[shop] || []).find((x) => x.key === key); if (it) { delete it.faction; delete it.req; } };
  if (passed.includes('ceasefire')) {
    // militarised zones stand down: Vostok and Daedalus bases become ordinary walled bases
    for (const l of locations) {
      if ((l.faction !== 'vostok' && l.faction !== 'daedalus') || !l.restricted) continue;
      Object.assign(l, { restricted: false, ceasefire: true, safe: true, defense: { ring: l.small ? 50 : 90, turrets: l.small ? 3 : 5 } });
    }
    sell('vostok', { key: 'v_apc', name: 'Vostok BTR-M APC', desc: 'VEHICLE: the Moon APC, yours to call with V', cost: 4000, max: 1, vehicle: 'apc' });
    sell('daedalus', { key: 'v_skimmer', name: 'Daedalus Phase Skimmer', desc: 'VEHICLE: the hover skimmer, yours to call with V', cost: 4000, max: 1, vehicle: 'skimmer' });
    sell('daedalus', { key: 't_dash', name: 'Daedalus Phase Dash Rig', desc: 'TECH (E): swing all your momentum to wherever you look', cost: 3500, max: 1, tech: 'dash' });
    open('vostok', 'scatter'); open('daedalus', 'rail');
  }
  if (passed.includes('openSkies')) {
    sell('ilmb', { key: 'v_interceptor', name: 'SPACECOM Lunar Interceptor', desc: 'VEHICLE: the fast one, yours to call with V', cost: 3500, max: 1, vehicle: 'interceptor' });
    sell('ilmb', { key: 't_shield', name: 'SPACECOM Deflector Shield', desc: 'TECH: absorbs one hit every 12 s', cost: 3000, max: 1, tech: 'shield' });
  }
  if (passed.includes('freeTrade')) {
    for (const items of Object.values(SHOPS)) for (const it of items) if (!it.discounted) { it.cost = Math.round((it.cost * 0.9) / 10) * 10; it.discounted = true; }
    sell('meridian', { key: 'v_van', name: 'Meridian Courier Light-Bike', desc: 'VEHICLE: the light-bike, yours to call with V', cost: 3200, max: 1, vehicle: 'van' });
    sell('meridian', { key: 't_teleport', name: 'Meridian Personal Teleporter', desc: 'TECH (T): jump to any discovered settlement or your outposts', cost: 4500, max: 1, tech: 'teleport' });
  }
  if (passed.includes('militiaPact')) {
    for (const l of locations) if (l.faction === 'kepler' && l.defense && !l.militia) { l.militia = true; l.defense = { ...l.defense, turrets: (l.defense.turrets || 0) + 2 }; }
    // not the Mule: the Kepler story already gives it to everyone who can call a vote
    sell('kepler', { key: 'v_carrier', name: 'Kepler Militia Carrier', desc: 'VEHICLE: the militia\'s armoured hauler with a turret cannon, yours to call with V', cost: 3500, max: 1, vehicle: 'carrier' });
  }
}
