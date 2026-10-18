// What game.cheats (and its debug overlay) are in a release build (devtools.js): the same fields at their normal values and
// every method a no-op, so the rest of the game reads `cheats.speed`, `cheats.god`, calls `devOverlay.lap('physics')` ... without
// knowing the dev menu is gone. Keep it in step with cheats.js and devoverlay.js: `npm run check:dev-strip` fails if the game
// uses a member this file lacks.
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
