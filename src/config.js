// Global tuning knobs. World units are metres, time is seconds.
export const WORLD = {
  size: 4096,
  segments: 512,
  chunks: 8,
  playRadius: 1950,
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
  airControl: 5,
  drag: 0.0002,

  jumpSpeed: 9,
  jumpCost: 15,
  thrustAccel: 15,
  thrustDrain: 30,
  energyRegen: 14,
  maxEnergy: 100,

  skateSafeImpact: 38,
  bootSafeImpact: 11,
  impactDamage: 2.6,
};
