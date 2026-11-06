// A car's doors and seats, and the way round it to a door (4 November 2026, the owner, with two videos of another
// game: "If a user want to hijack a vehicle and they clicked the hijack button while staying in front of the car, the user
// will automatically walk through the driver doors, opens it and enters, while the other passengers they are carrying
// will open the door bang/close it and run away. But if there's a blockage from the driver side ... the user will
// automatically go to the passenger seat and enters through there ... the player auto moves from the passenger seat to
// the driver seat").
//
// Every place here is in metres in the car's own frame: `along` ahead of its middle (+ to its front), `across` to its
// left (+; the town drives on the right, so the driver sits on the left). The doors open on hinges at their front edges.
//   fl  the driver's door              fr  the front passenger's
//   rl  behind the driver              rr  behind the front passenger
// A car of two doors has only fl and fr; its back seat is got out of through them, the front seat tipped forward.
import { POWER_CARS } from './power-cars.js';

// The cars with two doors (the coupés, the convertibles, the roadsters and the supercars), read from the models (each
// drawn from the side with its doors marked, 4 November 2026: the grand tourer and the off-roader have four)
// (6 November 2026: the Grey Grand Tourer and the Midnight Saloon are coupés, a long door each side and a quarter
// window behind it, as their glass shows now; they had opened a back door that was not there)
export const TWO_DOORS = Object.freeze(new Set(['mint-sports-coupe', 'white-roadster', 'yellow-classic-roadster', 'bronze-spyder', 'red-winged-supercar', 'gold-hypercar', 'black-grand-convertible', 'pearl-convertible', 'grey-grand-tourer', 'midnight-saloon']));
// The cars whose doors are not cut from their sides to swing open (car-model.js): the hypercar's are up already, as made
export const DOORS_UP = Object.freeze(new Set(['gold-hypercar']));
export const doorsOf = (model) => (TWO_DOORS.has(model) ? ['fl', 'fr'] : ['fl', 'fr', 'rl', 'rr']);

// Shares of the car's length (from its middle, + ahead) where the doors' edges are, as on the models: the cabin between
// the arches of the wheels (a little over a fifth of the length either side of the middle), the front doors from the
// front arch back to the middle pillar, the back doors from there to the rear arch; a two-door car's doors longer.
const EDGES = Object.freeze({ four: Object.freeze({ front: [0.215, -0.01], rear: [-0.01, -0.215] }), two: Object.freeze({ front: [0.215, -0.085] }) });
export const DOOR = Object.freeze({
  open: 1.15,          // radians a door swings out to (about 65 degrees)
  opening: 0.35,       // seconds to swing it open
  shutting: 0.22,      // seconds to swing it shut (a slam)
  stand: 0.62,         // metres out from the car's side where someone stands at a door
  swing: 0.95,         // and how far out a door's edge goes when it is open (room needed beside it)
});

// Where a door is: its edges along the car, which side, how long it is.
export function doorPlace(model, door) {
  const spec = POWER_CARS[model] || { length: 4.8, width: 2.1 };
  const two = TWO_DOORS.has(model);
  const [f, r] = (door[0] === 'f' ? (two ? EDGES.two.front : EDGES.four.front) : EDGES.four.rear);
  const side = door[1] === 'l' ? 1 : -1;
  return { door, side, front: f * spec.length, rear: r * spec.length, length: (f - r) * spec.length, half: spec.width / 2 };
}
// Where someone stands to open a door (just behind its rear edge, a step out from the side), and where they are once
// out of it (beside it, clear of it as it swings shut).
export function doorStand(model, door) {
  const d = doorPlace(model, door);
  return { along: d.rear - 0.12, across: d.side * (d.half + DOOR.stand) };
}
export function doorOut(model, door) {
  const d = doorPlace(model, door);
  return { along: (d.front + d.rear) / 2 - 0.2, across: d.side * (d.half + 0.75) };
}
// The seats: the driver's and the front passenger's, and the back seat's three places (left, middle, right).
export function seatPlace(model, seat) {
  const spec = POWER_CARS[model] || { length: 4.8, width: 2.1 };
  const two = TWO_DOORS.has(model);
  const across = spec.width * 0.2;
  const front = (two ? -0.02 : 0.045) * spec.length, back = (two ? -0.16 : -0.115) * spec.length;
  return { driver: { along: front, across }, front: { along: front, across: -across }, rl: { along: back, across }, rm: { along: back, across: 0 }, rr: { along: back, across: -across } }[seat];
}
// The door each seat is got out of (the back seat of a two-door car: through the front doors)
export function doorOfSeat(model, seat) {
  const two = TWO_DOORS.has(model);
  if (seat === 'driver') return 'fl';
  if (seat === 'front') return 'fr';
  if (two) return seat === 'rr' ? 'fr' : 'fl';
  return seat === 'rr' ? 'rr' : seat === 'rl' ? 'rl' : 'rr';
}

// From the car's frame to the town's, and back.
export function toWorld(car, p) {
  const ux = Math.sin(car.h), uz = Math.cos(car.h), lx = Math.cos(car.h), lz = -Math.sin(car.h);
  return { x: car.x + ux * p.along + lx * p.across, z: car.z + uz * p.along + lz * p.across };
}
export function toCar(car, x, z) {
  const dx = x - car.x, dz = z - car.z;
  return { along: dx * Math.sin(car.h) + dz * Math.cos(car.h), across: dx * Math.cos(car.h) - dz * Math.sin(car.h) };
}

// The way round the car on foot from where someone stands to a place beside it: straight there where that does not
// cross the car, otherwise round its nearer corners (each a little off it), as short as can be. `open(x, z)`: whether a
// body can stand at a point. Gives the points to go through (the last the place itself) and how long the way is, or
// null where there is no way round that is open.
export function wayRound(car, model, from, to, open = () => true) {
  const spec = POWER_CARS[model] || { length: 4.8, width: 2.1 };
  const A = spec.length / 2 + 0.6, B = spec.width / 2 + 0.6;
  const a = toCar(car, from.x, from.z), b = toCar(car, to.x, to.z);
  const corners = { fl: { along: A, across: B }, fr: { along: A, across: -B }, rl: { along: -A, across: B }, rr: { along: -A, across: -B } };
  // does the straight line from p to q pass through the car (its box, a little smaller than the way round it)?
  const cuts = (p, q) => {
    const a0 = A - 0.25, b0 = B - 0.25;
    let t0 = 0, t1 = 1;
    const d = [q.along - p.along, q.across - p.across], s = [p.along, p.across], lim = [a0, b0];
    for (let k = 0; k < 2; k += 1) {
      if (Math.abs(d[k]) < 1e-9) { if (s[k] < -lim[k] || s[k] > lim[k]) return false; continue; }
      let u = (-lim[k] - s[k]) / d[k], v = (lim[k] - s[k]) / d[k];
      if (u > v) [u, v] = [v, u];
      t0 = Math.max(t0, u); t1 = Math.min(t1, v);
      if (t0 > t1) return false;
    }
    return true;
  };
  const dist = (p, q) => Math.hypot(q.along - p.along, q.across - p.across);
  const routes = [[]];
  for (const c of Object.keys(corners)) routes.push([c]);
  for (const c1 of Object.keys(corners)) for (const c2 of Object.keys(corners)) if (c1 !== c2 && (c1[0] === c2[0] || c1[1] === c2[1])) routes.push([c1, c2]);
  let best = null;
  for (const r of routes) {
    const pts = [a, ...r.map((c) => corners[c]), b];
    let ok = true, len = 0;
    for (let k = 0; k < pts.length - 1 && ok; k += 1) { if (cuts(pts[k], pts[k + 1])) ok = false; len += dist(pts[k], pts[k + 1]); }
    if (!ok || (best && len >= best.len)) continue;
    const world = pts.slice(1).map((p) => toWorld(car, p));
    if (world.slice(0, -1).some((p) => !open(p.x, p.z))) continue;
    best = { len, points: world };
  }
  return best;
}
