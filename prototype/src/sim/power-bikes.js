// Power bikes: big motorcycles (500 cc and up) that a player rides themselves, with their own controls, their
// own handling and their own engine and horn. They are not okadas: an okada is a small bike that carries
// people for a fare (okada.js), and the motorcycle a player can already ride is that small bike.
//
// No power bike is in the game yet: the owner will supply each bike's model. Until one is, POWER_BIKES is empty
// and nothing in town offers one, shows one or plays one. What is here is everything that does not need the
// model: how each bike handles (this file), its controls (src/client/bike-controls.js) and its engine and horn
// (src/client/bike-audio.js). Adding a bike is adding an entry here, with its model, and nothing else.
//
// An entry, when there is one:
//   id: 'some-bike'           how the game knows it
//   name: 'Some Bike 1000'    what a player sees
//   model: 'some-bike.glb'    the owner's supplied model (assets/vehicles/), drawn as supplied
//   cc: 1000                  the engine's size, for what the player is told
//   sound: 'four1000'         which engine (BIKE_SOUNDS in bike-audio.js), or that bike's own recordings
//   horn: 'dual'              which horn (BIKE_HORNS in bike-audio.js), or its own recording
//   handling: { ... }         anything that differs from HANDLING below

export const POWER_BIKES = Object.freeze({});

// How a big motorcycle goes, in metres, seconds and radians. A heavier, faster bike overrides some of these.
export const HANDLING = Object.freeze({
  top: 26,              // top speed on tar, m/s (about 94 km/h in the town's own scale)
  rough: 9,             // top speed off the tar
  reverse: 1.2,         // pushed backwards with the feet
  accel: 5.5,           // m/s² with the throttle open, at low speed; less as it nears the top
  brake: 9,             // m/s² with the brake fully on
  coast: 0.9,           // m/s² lost with neither throttle nor brake (engine braking and the road)
  leanMax: 0.62,        // radians: how far over it leans at most
  leanRate: 2.6,        // how quickly it goes over (per second, towards the lean asked for)
  wheelbase: 1.45,      // metres: with the lean, how tight it turns
  steerSlow: 1.6,       // radians a second it can turn at walking pace, when it is steered more than leaned
  radius: 0.6,          // how much room it takes, for running into things
});

export const handlingOf = (bike) => Object.freeze({ ...HANDLING, ...((bike && bike.handling) || {}) });

// One step of a power bike being ridden.
//   state  { speed, lean, heading }   (changed in place; returned)
//   input  { steer: -1..1 (left negative), throttle: 0..1, brake: 0..1 }
//   onTar  whether the road under it is tarred; wet: whether it is raining
// A motorcycle turns by leaning: the lean follows the steering, at a rate, and the turn follows the lean and the
// speed (a lean of θ at speed v turns at g·tanθ/v), so it cannot change direction in an instant, it turns wider
// the faster it goes, and it stands up again when it is let go. At walking pace it is steered by the bars.
export function stepPowerBike(state, input, dt, { handling = HANDLING, onTar = true, wet = false } = {}) {
  const h = handling;
  const steer = Math.max(-1, Math.min(1, input.steer || 0));
  const throttle = Math.max(0, Math.min(1, input.throttle || 0));
  const brake = Math.max(0, Math.min(1, input.brake || 0));
  const top = (onTar ? h.top : h.rough) * (wet ? 0.85 : 1);
  let v = state.speed;
  if (brake > 0 && v > 0.05) v = Math.max(0, v - h.brake * (wet ? 0.7 : 1) * brake * dt);
  else if (brake > 0 && v <= 0.05) v = Math.max(-h.reverse, v - 1.5 * brake * dt);          // stopped: brake held walks it back
  else if (throttle > 0) {
    if (v < 0) v = Math.min(0, v + h.brake * dt);
    else v += h.accel * throttle * Math.max(0.08, 1 - (v / top) ** 2) * dt;
  } else v -= Math.sign(v) * Math.min(Math.abs(v), h.coast * dt);
  // over the top speed (off the tar, say): it slows to it, it does not stop dead
  if (v > top) v = Math.max(top, v - h.brake * 0.6 * dt);
  // the lean: towards what the steering asks, the more so the faster it goes (positive: over to the right, as
  // the small motorcycle's lean is kept in main.js; the heading goes down as it turns right)
  const speedShare = Math.min(1, Math.abs(v) / 6);
  const leanWant = steer * h.leanMax * speedShare;
  state.lean += (leanWant - state.lean) * Math.min(1, dt * h.leanRate);
  // the turn: from the lean at speed, from the bars at walking pace
  const fromLean = Math.abs(v) > 0.5 ? ((9.81 * Math.tan(Math.abs(state.lean))) / Math.max(2.5, Math.abs(v))) * Math.sign(state.lean) : 0;
  const fromBars = steer * h.steerSlow * (1 - speedShare) * Math.min(1, Math.abs(v) / 0.6);
  const turn = (fromLean + fromBars) * Math.sign(v || 1);
  state.heading -= turn * dt;
  state.speed = Math.abs(v) < 0.02 && !throttle ? 0 : v;
  return state;
}

// How hard the engine is working, 0 (idle) to 1 (the red line), from the speed and the throttle: what the
// engine's sound follows. Each gear takes the revs up and drops them back as it changes.
export function bikeRevs(speed, throttle, handling = HANDLING, gears = 6) {
  const share = Math.max(0, Math.min(1, Math.abs(speed) / handling.top));
  const gear = Math.min(gears - 1, Math.floor(share * gears));
  const inGear = share * gears - gear;
  const base = 0.12 + 0.18 * (gear / gears);
  return Math.max(0, Math.min(1, base + inGear * (0.62 - 0.05 * gear) + throttle * 0.12));
}
