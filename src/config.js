// Global tuning knobs. World units are metres, time is seconds.
export const PLANET = {
  radius: 3600, // a small, fully traversable moon (~22.6 km around)
  faceCells: 1280, // finest terrain grid cells per cube-sphere face edge (~4.4 m)
  chunkCells: 80, // cells per terrain chunk edge (16 x 16 chunks per face)
  seed: 1969,
  painted: true, // painted Moon (maria, white crests, debris splatters); false: one-tone Moon
};

export const PHYS = {
  // lunar gravity, raised from 1.62 so arcs stay readable at speed
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
  // skate ground steering: max turn rate (rad/s) at full lateral input; speed is kept
  handling: 1.5,
  skateFriction: 0.004,
  slopeAssist: 0.35, // extra downhill pull ("harvested" slope energy)
  // magnetic grip: skates in (or just out of) contact pull to the surface so bumps don't skip you off;
  // big launches still break free
  grip: 13,
  skateBuffer: 0.6, // m above ground the locked skates still hold you (+2% of speed, up to +1.6 m)
  skateLaunch: 3, // upward m/s to break free of that buffer (+10% of speed, up to +9): a real ramp
  gripWindow: 0.45, // seconds after losing contact that grip still pulls
  gripRange: 3.5, // metres above the surface where grip still pulls
  airControl: 5,
  drag: 0.0002,

  // airborne: at 100+ m/s the small Moon curves away and you nearly orbit; these keep big air big
  // but bring you home
  orbitComp: 1, // extra pull equal to the "orbital lift" of horizontal speed (v²/R)
  airGrace: 1.0, // seconds of normal floaty gravity after leaving the ground
  airGravRamp: 1.5, // ...then gravity ramps up by this much (to x2.5)
  airGravRampTime: 2.0, // ...over this many seconds
  diveGrav: 3, // holding Dive in the air
  diveCatch: 22, // magnetic pull on a diving skater in the last few metres
  diveSafeImpact: 160, // vertical speed a skated dive landing absorbs safely

  jumpSpeed: 10,
  jumpCost: 15,
  // thrusters push mostly forward, with a little lift or dive
  thrustAccel: 15,
  thrustVertical: 0.22,
  thrustDrain: 30,
  energyRegen: 14,
  maxEnergy: 100,

  skateSafeImpact: 50,
  bootSafeImpact: 22,
  impactDamage: 1.3,
};

// distress events farther than this (m) stay out of the log above the speedometer and don't pop up
export const EVENT_RANGE = 3500;
