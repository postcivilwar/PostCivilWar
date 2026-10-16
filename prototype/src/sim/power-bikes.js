// Power bikes: the big motorcycles a player owns and rides themselves, with their own controls, their
// own handling and their own engine and horn. They are not okadas: an okada is a small bike that carries
// people for a fare (okada.js), and the motorcycle a player can already ride is that small bike.
//
// The bikes are the owner's twelve supplied models (assets/vehicles/bikes/, drawn as supplied: see
// src/client/bike-model.js). Each is sold new in the market at its price; a player may own one of each.
//
// The price follows the bike's class, read from how it looks: its size, its finish, and what kind of machine it
// is (a light naked bike, a cruiser, a sport bike, a superbike, a touring flagship, a show machine). Nothing is
// claimed about any bike's engine: the files say nothing of it, and neither does the game. A bike's handling
// is set by its class in the same way.
//
// An entry:
//   id                      how the game knows it (and its model, assets/vehicles/bikes/<id>.glb)
//   name                    what a player sees
//   tier                    its class, 1 (entry) to 5 (flagship); the price follows it
//   price                   TR, new from the showroom
//   length                  metres, nose to tail, that the model is drawn at
//   sound                   which engine (BIKE_SOUNDS in bike-audio.js) until its own recording is supplied
//   tone                    that engine tuned for this bike (its idle, pipe, rasp: TONES below)
//   horn                    which horn (BIKE_HORNS in bike-audio.js)
//   handling                anything that differs from HANDLING below
//   blurb                   a line for the market

export const BIKE_TIERS = Object.freeze({
  1: Object.freeze({ name: 'Entry', price: 1000 }),
  2: Object.freeze({ name: 'Standard', price: 1500 }),
  3: Object.freeze({ name: 'Premium', price: 2500 }),
  4: Object.freeze({ name: 'Superbike', price: 4000 }),
  5: Object.freeze({ name: 'Flagship', price: 6000 }),
});

const bike = (id, name, tier, length, sound, horn, handling, blurb, price = BIKE_TIERS[tier].price) => Object.freeze({ id, name, tier, price, length, sound, tone: Object.freeze(TONES[id] || {}), horn, handling: Object.freeze(handling), blurb });

// Until each bike's own recording is supplied, its engine is made by the game (bike-audio.js) from the kind of
// engine above, tuned for that bike so that no two of the twelve sound the same: its idle, the ring of its pipe,
// the rasp of its exhaust. A recording, when it comes, replaces this (bike-audio.js, `recordings`).
const TONES = {
  'streetfighter': { idle: 1350, pipe: 230, rasp: 0.15 },
  'cafe-racer': { idle: 1100, pipe: 185, rasp: 0.17, lope: 0.2 },
  'white-sport': { idle: 1400, pipe: 175, rasp: 0.12 },
  'black-cruiser': { idle: 900, pipe: 110, lope: 0.8 },
  'chopper': { idle: 850, pipe: 98, lope: 0.85, rasp: 0.22 },
  'purple-sport': { idle: 1500, pipe: 360, rasp: 0.09 },
  'olive-cruiser': { idle: 1000, pipe: 135, lope: 0.7, rasp: 0.21, level: 0.5 },
  'yellow-adventure': { idle: 1250, pipe: 200, rasp: 0.14, lope: 0.18 },
  'red-superbike': { idle: 1600, pipe: 390, rasp: 0.11, redline: 14500 },
  'black-gold-superbike': { idle: 1550, pipe: 315, rasp: 0.12, redline: 14000 },
  'gold-tourer': { idle: 900, pipe: 125, lope: 0.6, rasp: 0.12, level: 0.42 },
  'chrome-concept': { idle: 1100, pipe: 150, rasp: 0.16, redline: 9500, level: 0.48 },
};

export const POWER_BIKES = Object.freeze({
  'streetfighter': bike('streetfighter', 'Streetfighter', 1, 2.05, 'twin650', 'single', { top: 24, accel: 5.4 }, 'A light naked street bike in red and white, upright and quick to turn.'),
  'cafe-racer': bike('cafe-racer', 'Café Racer', 1, 2.05, 'twin650', 'single', { top: 23, accel: 5.0 }, 'A grey café racer with an orange seat and an open frame.'),
  'white-sport': bike('white-sport', 'White Sport Tourer', 1, 2.1, 'single500', 'single', { top: 24, accel: 5.0 }, 'A white half-faired sport tourer, easy to live with.'),
  'black-cruiser': bike('black-cruiser', 'Black Cruiser', 2, 2.35, 'vtwin1200', 'dual', { top: 24, accel: 4.8, leanMax: 0.5, wheelbase: 1.65 }, 'A classic black cruiser with chrome, wire wheels and a low seat.'),
  'chopper': bike('chopper', 'Chopper', 2, 2.4, 'vtwin1200', 'dual', { top: 23, accel: 4.6, leanMax: 0.48, wheelbase: 1.7 }, 'A long chopper with high bars and a stepped seat.'),
  'purple-sport': bike('purple-sport', 'Purple Sport', 2, 2.05, 'four1000', 'dual', { top: 27, accel: 5.8 }, 'A fully faired sport bike in deep purple.'),
  'olive-cruiser': bike('olive-cruiser', 'Olive Muscle Cruiser', 3, 2.35, 'vtwin1200', 'dual', { top: 27, accel: 6.2, leanMax: 0.52, wheelbase: 1.65 }, 'A heavy muscle cruiser in military olive.'),
  'yellow-adventure': bike('yellow-adventure', 'Yellow Adventure Tourer', 3, 2.25, 'twin650', 'dual', { top: 26, accel: 5.8, rough: 14 }, 'A tall adventure tourer in yellow, at home off the tar as on it.'),
  'red-superbike': bike('red-superbike', 'Red Superbike', 4, 2.1, 'four1000', 'dual', { top: 31, accel: 7.2, leanMax: 0.7 }, 'A red superbike with a full race fairing.'),
  'black-gold-superbike': bike('black-gold-superbike', 'Black & Gold Superbike', 4, 2.1, 'four1000', 'dual', { top: 31, accel: 7.0, leanMax: 0.7 }, 'A black superbike on gold wheels.'),
  'gold-tourer': bike('gold-tourer', 'Gold Grand Tourer', 5, 2.55, 'vtwin1200', 'dual', { top: 28, accel: 5.4, leanMax: 0.5, wheelbase: 1.75 }, 'A full-dress touring bike in gold, with a fairing and hard luggage.'),
  'chrome-concept': bike('chrome-concept', 'Chrome V-Concept', 5, 2.6, 'four1000', 'dual', { top: 33, accel: 7.6, leanMax: 0.55, wheelbase: 1.9 }, 'A chrome show machine with twin wheels at each end and an engine down its length.', 10000),
});

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
