import * as THREE from 'three';

// Seats that carry you: transit ships (free; F into a landed shuttle-bus or freighter, F out any time, even mid-flight)
// and the fairground carousel and ferris wheel (nearest horse or gondola; settlements.js keeps both for Chimera Downs'
// rework). Seated, player.js follows player.seat and skips physics. Fairground seats hide the HUD (style.css body.on-ride).

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();

export class Rides {
  constructor(game) {
    this.game = game;
    this.ride = null; // { kind: 'ship' | 'fun', v?, ride?, seat }
    this.hudOff = false; // body.on-ride set (syncHud)
  }

  // nearest seat from p, or null
  nearest(p) {
    const g = this.game;
    let best = null, bd = Infinity;
    const T = g.world.traffic;
    for (const v of (T && T.vehicles) || []) {
      if ((v.kind !== 'ship' && v.kind !== 'bus') || v.state !== 'park' || !v.root.visible) continue;
      const d = p.distanceTo(v.pos);
      const reach = v.kind === 'ship' ? 38 : 17;
      if (d < reach && d < bd) { bd = d; best = { kind: 'ship', v }; }
    }
    for (const r of g.world.rides || []) {
      if (!r.loc.active) continue;
      for (const s of r.seats) {
        s.obj.updateMatrixWorld(true);
        const d = p.distanceTo(s.obj.localToWorld(_a.copy(s.local)));
        if (d < 5 && d < bd) { bd = d; best = { kind: 'fun', ride: r, seat: s }; }
      }
    }
    return best;
  }

  // F prompt and handling (main's interaction chain). True when it owns the prompt.
  interact() {
    const g = this.game, P = g.player;
    if (this.ride) {
      const r = this.ride;
      const where = r.kind === 'ship' ? (r.v.state === 'park' ? 'HOP OUT' : 'BAIL OUT (mid-flight!)') : 'HOP OFF';
      g.hud.prompt(`<b>F</b> — ${where}${r.kind === 'ship' ? ` · ${this.shipLabel(r.v)}` : ''}`);
      if (g.input.pressed('KeyF') && g.boardCooldown <= 0) this.exit();
      return true;
    }
    if (P.dead || P.vehicle) return false;
    const n = this.nearest(P.pos);
    if (!n) return false;
    if (n.kind === 'ship') {
      g.hud.prompt(`<b>F</b> — HOP IN (FREE RIDE) · ${this.shipLabel(n.v)}`);
      if (g.input.pressed('KeyF') && g.boardCooldown <= 0) this.board(n);
    } else {
      g.hud.prompt(`<b>F</b> — RIDE THE ${n.ride.name}`);
      if (g.input.pressed('KeyF') && g.boardCooldown <= 0) this.board(n);
    }
    return true;
  }

  // a ship's next stop (parked at one end: the other)
  shipLabel(v) {
    const kind = v.kind === 'ship' ? 'FREIGHTER' : 'SHUTTLE';
    const to = v.state === 'park' ? (v.s <= 0 ? v.stops[1] : v.stops[0]) : (v.dir > 0 ? v.stops[1] : v.stops[0]);
    return `${kind} TO ${to.loc.name.toUpperCase()}`;
  }

  board(n) {
    const g = this.game, P = g.player;
    if (n.kind === 'ship') {
      const v = n.v;
      // ride hidden inside; camera far enough back to see the whole ship
      n.seat = { obj: v.root, local: new THREE.Vector3(0, 0.5, 0), face: new THREE.Vector3(0, 0, 1), hidden: true, camDist: v.kind === 'ship' ? 62 : 26 };
      g.hud.toast(`All aboard! ${this.shipLabel(v).toLowerCase().replace(/^./, (c) => c.toUpperCase())}. F to hop out.`, 3);
    } else {
      n.seat = { ...n.seat, camDist: n.ride.camDist };
      g.fx.pop('WHEEE!', null, { color: '#ff2e88', size: 40 });
    }
    this.ride = n;
    P.seat = n.seat;
    this.syncHud();
    P.body.vel.set(0, 0, 0);
    g.boardCooldown = 0.4;
    g.audio.tone(660, 0.1, 'triangle', 0.12);
  }

  exit() {
    const g = this.game, P = g.player, b = P.body;
    const r = this.ride;
    if (!r) return;
    this.ride = null;
    P.seat = null;
    this.syncHud();
    P.model.root.visible = true;
    const up = _c;
    if (r.kind === 'ship') {
      const v = r.v;
      v.root.updateMatrixWorld(true);
      if (v.state === 'park') {
        // a step past the ramp's foot
        const bottom = v.root.localToWorld(_a.copy(v.rampBottom));
        const top = v.root.localToWorld(_b.copy(v.rampTop));
        b.pos.copy(bottom).addScaledVector(bottom.clone().sub(top).normalize(), 1.5);
        up.copy(b.pos).normalize();
        b.pos.addScaledVector(up, 1);
        b.vel.set(0, 0, 0);
      } else {
        // side hatch, keeping the ship's speed
        const side = v.kind === 'ship' ? 16 : 8;
        b.pos.copy(v.root.localToWorld(_a.set(side, -1, 0)));
        b.vel.copy(v.vel);
        g.fx.pop('GERONIMO!', null, { color: '#ffd23f', size: 44 });
        g.style(15, 'Bailed out');
      }
    } else {
      // step off away from the ride's middle (and the wheel's plane)
      const s = r.seat;
      const p = s.obj.localToWorld(_a.copy(s.local));
      up.copy(p).normalize();
      const out = r.ride.exitDir(p, _b);
      b.pos.copy(p).addScaledVector(out, 2.5).addScaledVector(up, 0.5);
      b.vel.copy(out).multiplyScalar(2).addScaledVector(up, 2);
    }
    b.grounded = false;
    b.airTime = 0.2;
    g.boardCooldown = 0.4;
    g.audio.tone(440, 0.1, 'triangle', 0.1);
  }

  // no HUD on fairground rides (hop-off prompt and pop-ups stay: style.css body.on-ride); ships keep it
  syncHud() {
    const off = !!(this.ride && this.ride.kind === 'fun');
    if (off !== this.hudOff) { this.hudOff = off; document.body.classList.toggle('on-ride', off); }
  }

  update() {
    const P = this.game.player;
    if (this.ride && (P.dead || !P.seat)) { this.ride = null; P.seat = null; }
    this.syncHud();
  }
}
