// What of other players' stands in the way of a player's own vehicle (31 October 2026, the owner's word: "users can
// use their car to run over another car, as if nothing was blocking").
//
// Each player's page keeps its own copy of the town, and another player is seen in it as a visitor (talk.js): where
// their page says they are, what they drive or ride, and what of theirs stands near them. Until now none of that was
// solid to anyone's vehicle here, so a car went straight through another player's car, driven or parked. Now a car,
// a motorcycle or a keke of another player's is as solid to this player's car, motorcycle or bicycle as one of the
// town's own; and so is a motorcycle of any player's left standing, which nothing here had counted either.
//
// Where another page says its things are is not to be trusted with anything that matters, and this is not: it can only
// stop this player's own vehicle. One that is already in contact with it (another player's car brought up against it,
// or a word come late from far behind where it really is) never holds it there (`clearOf`): nobody can be boxed in by
// someone else's word of where they stand.
import { POWER_CARS, carBoxes, carCircles } from './power-cars.js';
import { footprintBox } from './vehicle-looks.js';

// a motorcycle, standing or ridden: as long and as wide as the showroom's (power-bikes.js: a little over two metres)
export const BIKE_SHAPE = Object.freeze({ length: 2.1, width: 0.8 });
export const bikeBoxes = (x, z, h) => carBoxes(BIKE_SHAPE, x, z, h);

const fine = (...v) => v.every(Number.isFinite);

// Another player's vehicles, as their page says: the car they drive and their cars standing near them; the motorcycle
// they ride and theirs standing near them; the keke they drive and theirs standing near them. Each box says which of
// them it is part of (`g`).
const tag = (list, g) => list.map((b) => ({ ...b, g }));
export function visitorBoxes(visitors) {
  const out = [];
  for (const v of visitors) {
    if (!v || v.held || v.swimming || !fine(v.x, v.z)) continue;
    const h = Number.isFinite(v.heading) ? v.heading : 0;
    if (v.car && POWER_CARS[v.car.car]) out.push(...tag(carBoxes(POWER_CARS[v.car.car], v.x, v.z, h), `${v.id}:in`));
    else if (v.ride) out.push(...tag(bikeBoxes(v.x, v.z, h), `${v.id}:in`));
    else if (v.vehicle && v.vehicle.kind === 'keke') out.push(...tag([footprintBox('keke', v.x, v.z, h)], `${v.id}:in`));
    (v.cars || []).forEach((c, n) => { if (POWER_CARS[c.car] && fine(c.x, c.z, c.h)) out.push(...tag(carBoxes(POWER_CARS[c.car], c.x, c.z, c.h), `${v.id}:car${n}`)); });
    (v.parked || []).forEach((b, n) => { if (fine(b.x, b.z, b.h)) out.push(...tag(bikeBoxes(b.x, b.z, b.h), `${v.id}:bike${n}`)); });
    (v.kekes || []).forEach((k, n) => { if (fine(k.x, k.z)) out.push(...tag([footprintBox('keke', k.x, k.z, Number.isFinite(k.heading) ? k.heading : 0)], `${v.id}:keke${n}`)); });
  }
  return out;
}

// Every player's motorcycles left standing (own-bikes.js `parked`).
export function standingBikes(players) {
  const out = [];
  for (const q of Object.values(players)) {
    const parked = q && q.parked && typeof q.parked === 'object' ? q.parked : null;
    if (!parked) continue;
    for (const [id, s] of Object.entries(parked)) if (s && fine(s.x, s.z, s.h)) out.push(...tag(bikeBoxes(s.x, s.z, s.h), `${q.id}:bike:${id}`));
  }
  return out;
}

// Of `boxes`, those of nothing already touching what stands at (x, z) facing h with this shape (a car's own length and
// width): a car of someone else's against it is left out whole, so that none of it can hold it where it is.
const inside = (b, x, z, r) => x > b.x0 - r && x < b.x1 + r && z > b.z0 - r && z < b.z1 + r;
const without = (boxes, touches) => {
  const gone = new Set();
  for (const b of boxes) if (touches(b)) gone.add(b.g === undefined ? b : b.g);
  return gone.size ? boxes.filter((b) => !gone.has(b.g === undefined ? b : b.g)) : boxes;
};
export function clearOf(boxes, shape, x, z, h, slack = 0) {
  if (!boxes.length) return boxes;
  const circles = carCircles(shape, x, z, h);
  return without(boxes, (b) => circles.some((c) => inside(b, c.x, c.z, Math.max(0.3, c.r - slack))));
}
// The same for something as small as a motorcycle or a bicycle, taken as a point with room `r` about it.
export const clearOfPoint = (boxes, x, z, r) => (boxes.length ? without(boxes, (b) => inside(b, x, z, r)) : boxes);
