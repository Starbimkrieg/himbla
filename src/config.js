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
  // Ground steering on skates: max turn rate (rad/s) at full lateral input. Speed is kept.
  handling: 1.5,
  skateFriction: 0.004,
  slopeAssist: 0.35, // extra downhill pull: the magnetic cushion "harvests" slope energy
  // Magnetic grip: while the skates are in contact (or just left it) they pull toward the
  // surface, so small bumps don't skip you off. Big launches still break free.
  grip: 10,
  gripWindow: 0.3, // seconds after losing contact that grip still pulls
  gripRange: 2.5, // metres above the surface where grip still pulls
  airControl: 5,
  drag: 0.0002,

  // Airborne: the Moon is small enough that at 100+ m/s the ground curves away beneath you and
  // you nearly orbit. These keep big air big but bring you home.
  orbitComp: 1, // extra pull equal to the "orbital lift" of your horizontal speed (v²/R)
  airGrace: 1.0, // seconds of normal, floaty moon gravity after leaving the ground
  airGravRamp: 1.5, // ...then gravity ramps up by this much (to x2.5)
  airGravRampTime: 2.0, // ...over this many seconds
  diveGrav: 3, // holding Dive in the air
  diveCatch: 22, // magnetic catch pulling a diving skater down in the last few metres
  diveSafeImpact: 160, // a skated dive landing absorbs this much vertical speed safely

  jumpSpeed: 10,
  jumpCost: 15,
  // Thrusters push mostly forward; only a little lift or dive is allowed.
  thrustAccel: 15,
  thrustVertical: 0.22,
  thrustDrain: 30,
  energyRegen: 14,
  maxEnergy: 100,

  skateSafeImpact: 44,
  bootSafeImpact: 15,
  impactDamage: 1.8,
};
