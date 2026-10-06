// Global tuning knobs. World units are metres, time is seconds.
export const PLANET = {
  radius: 3600, // a small, fully traversable moon (~22.6 km around)
  faceCells: 640, // finest terrain grid cells per cube-sphere face edge (~8.8 m)
  chunkCells: 40, // cells per terrain chunk edge (16 x 16 chunks per face)
  seed: 1969,
};

export const PHYS = {
  // Lunar gravity, exaggerated slightly from 1.62 so arcs stay readable at speed.
  gravity: 6.0,
  radius: 0.9,

  // Boots (skates off)
  runSpeed: 9,
  runAccel: 40,
  brakeDecel: 17,

  // Quantum-Lock skates
  skatePush: 3.5,
  skatePushMax: 18,
  carve: 16,
  skateFriction: 0.004,
  slopeAssist: 0.35, // extra downhill pull: the magnetic cushion "harvests" slope energy
  // Magnetic grip: while the skates are in contact (or just left it) they pull toward the
  // surface, so small bumps don't skip you off. Big launches still break free.
  grip: 10,
  gripWindow: 0.3, // seconds after losing contact that grip still pulls
  gripRange: 2.5, // metres above the surface where grip still pulls
  airControl: 5,
  drag: 0.0002,

  jumpSpeed: 10,
  jumpCost: 15,
  // 'down' = dive thrusters (push into the slope / dive onto downslopes),
  // 'up'   = classic jetpack. Toggle in-game with T.
  thrustMode: 'down',
  thrustAccel: 16,
  thrustDrain: 30,
  energyRegen: 14,
  maxEnergy: 100,

  skateSafeImpact: 38,
  bootSafeImpact: 11,
  impactDamage: 2.6,
};
