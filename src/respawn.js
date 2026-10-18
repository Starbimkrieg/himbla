import * as THREE from 'three';
import { TIERS, FACTIONS } from './locations.js';
import { arcDist, tangent, greatCircle } from './geo.js';
import { saveWorldState } from './worldstate.js';

const NEUTRAL = TIERS.find((t) => t.name === 'NEUTRAL').min; // 0: "at least neutral" is this tier or better
const GATE = 45; // m outside a restricted zone's wall

// Where a K.O. puts you. Three kinds, tried in this order:
//   hq      the headquarters you set at your town's clinic (ws.respawnAt = its location id), if it still lets you in
//   clinic  your nearest clinic: the town's or an outpost's (story.clinicSpawn, as it always was)
//   home    game.home(): the ILMB, your story faction's HQ, your town once it has a Shuttle Pad
// A choice that stops being valid (standing dropped, the HQ fell) is kept, not cleared: it is only ignored, with a note on the K.O. card,
// until it works again.
export class Respawn {
  constructor(game) { this.game = game; }

  get id() { return this.game.ws.respawnAt || null; }

  // '' if this HQ would take you in right now, else the short reason it won't
  why(l) {
    const g = this.game;
    if (!l.hq || l.type === 'ruin') return 'GONE'; // (a razed Rustmoon Hold keeps hq: true)
    if (!l.discovered) return 'NOT CHARTED YET';
    if (l.type === 'pirate') return g.rep.aligned() ? '' : 'CREW ONLY'; // (the den's standing starts at 0, which would read as neutral)
    if (g.rep.get(l.faction) < NEUTRAL) return `STANDING ${g.rep.tier(l.faction).name}`;
    return '';
  }

  // every HQ of a faction you know of: [{ l, why }] (why '' = you can pick it)
  options() {
    const g = this.game;
    return g.locations.filter((l) => l.hq && l.type !== 'ruin' && g.rep.visible(l.faction)).map((l) => ({ l, why: this.why(l) }));
  }

  // where you stand when you redeploy at HQ l: the usual clear patch inside, or, at a military HQ that hasn't cleared you, its gate
  spot(l) {
    const g = this.game;
    if (l === g.hub) return { point: g.spawnPoint, facing: g.spawnFacing, loc: l, note: '' }; // (the ILMB: the spot home() uses)
    if (l.restricted && !g.rep.cleared(l.faction)) return this.gate(l);
    return { ...g.spotNear(l), note: '' };
  }

  // just outside the zone wall, on the side facing the ILMB (else the nearest clear side, in 30° steps): inside, an uncleared runner is
  // shot at within seconds
  gate(l) {
    const g = this.game, V = THREE.Vector3;
    const toward = tangent(g.hub.dir.clone().sub(l.dir), l.dir);
    if (toward.lengthSq() < 1e-8) tangent(new V(0, 1, 0), l.dir, toward);
    toward.normalize();
    for (let k = 0; k < 12; k++) {
      const t = toward.clone().applyAxisAngle(l.dir, (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 6));
      const d = greatCircle(l.dir, t, l.zoneR + GATE);
      if (g.locations.some((o) => o !== l && arcDist(d, o.dir) < (o.zoneR || o.r) + 20)) continue; // (another place's zone)
      const point = g.planet.ground(d, new V(), 0.5);
      return { point, facing: tangent(l.pos.clone().sub(point), d).normalize(), loc: l, note: 'No clearance to go in: you redeploy at the gate.' };
    }
    return { ...g.spotNear(l), note: '' };
  }

  // what a K.O. at `from` (a unit direction) does: { kind, name, note, ...where } (hq and home: point, facing, loc; clinic: dir)
  plan(from) {
    const g = this.game;
    let note = '';
    if (this.id) {
      const l = g.locations.find((x) => x.id === this.id);
      const why = l ? this.why(l) : 'GONE';
      if (!why) return { kind: 'hq', name: l.name, ...this.spot(l) };
      note = `${l ? l.name : 'Your respawn point'} will not take you in (${why.toLowerCase()}): redeploying ${g.story.clinicSpawn(from) ? 'at your clinic' : 'at home'} instead.`;
    }
    const c = g.story.clinicSpawn(from);
    if (c) return { kind: 'clinic', name: c.modules ? `${g.territory.name(c)} clinic` : c.name, dir: c.dir, note }; // (an outpost is the outpost itself; the town's entry has a name)
    const h = g.home();
    return { kind: 'home', name: h.loc.name, point: h.point, facing: h.facing, loc: h.loc, note };
  }

  // the clinic and home branches make the very calls they always made
  deploy(p) {
    const g = this.game;
    if (p.kind === 'clinic') g.story.teleportTo(p.dir);
    else { g.player.respawn(p.point, p.facing); g.cam.fwd.copy(p.facing); }
    if (p.note) g.hud.toast(p.note, 5);
  }

  // null = back to the default; false if that HQ will not take you in
  set(id) {
    const g = this.game, l = id && g.locations.find((x) => x.id === id);
    if (id && (!l || this.why(l))) return false;
    g.ws.respawnAt = id || null;
    saveWorldState(g.ws);
    return true;
  }

  // The picker: a dialog in the town menu's style (numbered buttons, a tick on the one in force, Escape = BACK). It is a screen of its own:
  // the page that opened it has been left, and back(msg?, tone?) takes you on from it, with what was chosen as the message to show (the
  // page answers in place, the clinic's door has no page: it toasts).
  menu(back) {
    const g = this.game, cur = this.id, rows = this.options();
    const ok = rows.filter((r) => !r.why), no = rows.filter((r) => r.why);
    const now = this.plan(g.player.pos.clone().normalize());
    const tick = (on) => (on ? ' ✔' : '');
    const buttons = [{ label: `NEAREST CLINIC, ELSE HOME${tick(!cur)}`, fn: () => this.choose(null, back) }]
      .concat(ok.map(({ l }) => ({ label: `${l.name.toUpperCase()}${tick(cur === l.id)}`, fn: () => this.choose(l.id, back) })))
      .concat([{ label: 'BACK', fn: () => back() }]);
    buttons.forEach((b, i) => { b.label = `${i + 1} · ${b.label}`; });
    const locked = no.map(({ l, why }) => (l.discovered ? `${l.name} (${why.toLowerCase()})` : `??? ${FACTIONS[l.faction].name} HQ (${why.toLowerCase()})`));
    g.dialog('RESPAWN POINT', `After a K.O. you redeploy at: <b>${now.name}</b>.<br><br><small>Pick any headquarters you have charted whose faction rates you at least neutral. A military HQ that has not cleared you puts you down at its gate.${locked.length ? `<br><br>Not yet: ${locked.join(' · ')}` : ''}</small>`, buttons);
  }

  choose(id, back) {
    const g = this.game;
    if (!this.set(id)) { g.audio.tone(180, 0.08, 'square', 0.05); back('THAT HEADQUARTERS WILL NOT TAKE YOU IN RIGHT NOW', 'bad'); return; }
    g.audio.click();
    back(id ? `RESPAWN POINT: ${g.locations.find((x) => x.id === id).name.toUpperCase()}` : 'RESPAWN POINT: NEAREST CLINIC', 'ok');
  }
}
