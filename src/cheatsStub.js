// game.cheats (and its debug overlay) in a release build (devtools.js): same fields at their normal values, every method a
// no-op, so the game can read `cheats.god` or call `devOverlay.lap('physics')` without the dev menu. Keep in step with
// cheats.js and devoverlay.js: `npm run check:dev-strip` fails if the game uses a member missing here.
class DevOverlay {
  constructor() { this.on = false; }
  begin() {}
  lap() {}
  renderStart() {}
  renderEnd() {}
  updateInput() {}
  end() {}
  toggle() {}
  shows() { return false; }
  alertNote() {}
}

class FreeCam {
  constructor() { this.on = false; }
  takeInput() {}
  giveBack() {}
  view() {}
}

export class Cheats {
  constructor(game) {
    this.game = game;
    this.god = false;
    this.infJet = false;
    this.mapTeleport = false;
    this.aiPaths = false;
    this.debugView = null;
    this.ragdoll = true;
    this.crackedVisor = true;
    this.speed = 1;
    this.unlocked = false;
    this.meteorPower = false;
    this.overlay = new DevOverlay();
    this.freeCam = new FreeCam();
  }

  showPauseButton() {}
  dev() {}
  open() {}
  tick() {}
  renderDebug() {}
  alertNote() {}
  spawnMeteor() { return false; }
  teleport() {}
}
