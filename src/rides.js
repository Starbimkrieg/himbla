import * as THREE from 'three';

// Things you can sit in and be carried by: the transit ships (free: hop into a landed shuttle-bus or
// freighter with F, ride it wherever it goes, hop out with F any time, on the pad or mid-flight)
// and the Funpark's carousel and ferris wheel (pop onto the nearest horse or gondola).
// While seated, player.js lets the seat carry you (player.seat) and skips the physics.

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();

export class Rides {
  constructor(game) {
    this.game = game;
    this.ride = null; // what you're on: { kind: 'ship' | 'fun', v?, ride?, seat }
  }

  // the nearest seat you could take from p, or null
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

  // F prompt + handling, called from main's interaction chain. True when it owns the prompt.
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

  // where a ship goes next: parked at one end, it's heading for the other
  shipLabel(v) {
    const kind = v.kind === 'ship' ? 'FREIGHTER' : 'SHUTTLE';
    const to = v.state === 'park' ? (v.s <= 0 ? v.stops[1] : v.stops[0]) : (v.dir > 0 ? v.stops[1] : v.stops[0]);
    return `${kind} TO ${to.loc.name.toUpperCase()}`;
  }

  board(n) {
    const g = this.game, P = g.player;
    if (n.kind === 'ship') {
      const v = n.v;
      // you ride inside, out of sight; the camera hangs back far enough to see the whole ship
      n.seat = { obj: v.root, local: new THREE.Vector3(0, 0.5, 0), face: new THREE.Vector3(0, 0, 1), hidden: true, camDist: v.kind === 'ship' ? 62 : 26 };
      g.hud.toast(`All aboard! ${this.shipLabel(v).toLowerCase().replace(/^./, (c) => c.toUpperCase())}. F to hop out.`, 3);
    } else {
      n.seat = { ...n.seat, camDist: n.ride.camDist };
      g.fx.pop('WHEEE!', null, { color: '#ff2e88', size: 40 });
    }
    this.ride = n;
    P.seat = n.seat;
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
    P.model.root.visible = true;
    const up = _c;
    if (r.kind === 'ship') {
      const v = r.v;
      v.root.updateMatrixWorld(true);
      if (v.state === 'park') {
        // down the ramp and a step clear of it
        const bottom = v.root.localToWorld(_a.copy(v.rampBottom));
        const top = v.root.localToWorld(_b.copy(v.rampTop));
        b.pos.copy(bottom).addScaledVector(bottom.clone().sub(top).normalize(), 1.5);
        up.copy(b.pos).normalize();
        b.pos.addScaledVector(up, 1);
        b.vel.set(0, 0, 0);
      } else {
        // out of the side hatch, keeping the ship's speed: good luck down there
        const side = v.kind === 'ship' ? 16 : 8;
        b.pos.copy(v.root.localToWorld(_a.set(side, -1, 0)));
        b.vel.copy(v.vel);
        g.fx.pop('GERONIMO!', null, { color: '#ffd23f', size: 44 });
        g.style(15, 'Bailed out');
      }
    } else {
      // step off away from the ride's middle (and off the wheel's plane)
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

  update() {
    const P = this.game.player;
    if (this.ride && (P.dead || !P.seat)) { this.ride = null; P.seat = null; }
  }
}
