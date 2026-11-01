// The street lamps, all of them: the town's, the city block's on Market Road, those beyond the town (the Kwale road, the
// airport, the bridge) and Oganiru City's (31 October 2026, the owner's brief for the new city: "Knocking one down
// depends on speed ... The town's existing street lamps behave the same way").
//
// Each lamp's pole is solid to the players' vehicles and to the players on foot (the town's own people and cars go
// round them as they always have: they never knock one down). A car that runs into one:
//   - slower than LAMP_KNOCK.car (a heavy one, a limousine, slower than LAMP_KNOCK.heavy): the pole stays up; the car
//     stops against it as against a wall, and the pole shakes and its lamp flickers;
//   - that fast or faster: the pole snaps at its foot and falls the way it was hit, its lamp broken and out, and the car
//     goes on at two thirds of its speed, with a jolt.
// Motorcycles, kekes, bicycles, skateboards and skates never knock one down: they crash into it as into anything solid.
// A lamp down lies where it fell, across whatever it fell on: vehicles go over it with a bump, people step over it.
// It stands again about LAMP_KNOCK.back seconds later once nobody is looking at it, or rises in front of whoever keeps
// watching after LAMP_KNOCK.watched; lit again at night. Other players nearby see it fall and lie (link.js `kl`).
// No police stars for it (the owner: "No police stars for it for now").
//
// The numbers are here, in one place, for the owner to change.
import { ZONE_LAMPS, CITY_AREA, CITY_FURNITURE, OUTSKIRT_LAMPS, BRIDGE, OGANIRU_LAMPS, zoneGroundY } from './zone.js';
import { setLampBlocker } from './zones/atani.js';

export const LAMP_KNOCK = Object.freeze({
  car: 35 / 3.6,          // m/s: a car this fast or faster knocks a lamp down (35 km/h)
  heavy: 25 / 3.6,        // m/s: a heavy vehicle (a coach, a lorry, the armoured limousine) from 25 km/h
  heavyClasses: Object.freeze(['limousine', 'coach', 'lorry', 'truck', 'bus']),
  keep: 2 / 3,            // the share of its speed a car keeps going through a lamp it knocks down
  back: 180,              // s: a lamp down stands again this long after, once nobody is looking at it
  watched: 360,           // s: ... or rises in front of whoever is still looking, this long after
  rise: 4,                // s: how long it takes to rise
  fall: 1.3,              // s: how long it takes to fall
  shake: 1.6,             // s: how long a lamp hit gently shakes and flickers
  reach: 1.6,             // m: how near the car's front must be to the pole for its knock to count (the town checks)
  told: 360,              // s: a lamp this player knocked down is told to the others for this long
});

// ------------------------------------------------------------------------------------------ the lamps --
// Every lamp: where its pole stands (x, z) on what (y), which kind it is (how it is drawn), which way its arm reaches
// (heading: 0 is +z, pi/2 is +x), where its lamp hangs (hx, hy, hz) and the ground under it (gy), and whether a vehicle
// can reach it to knock it down (the lamps on the decks' walls cannot be).
const lamp = (id, kind, x, z, y, heading, reach, height, extra = {}) => {
  const hx = x + Math.sin(heading) * reach, hz = z + Math.cos(heading) * reach;
  return Object.freeze({ id, kind, x, z, y, heading, hx, hz, hy: y + height, gy: extra.gy !== undefined ? extra.gy : y, knock: extra.knock !== false, radius: extra.radius || 0.13, arms: extra.arms || 1, ...extra });
};
const inCityBlock = (x, z) => x > CITY_AREA.x0 && x < CITY_AREA.x1 && z > CITY_AREA.z0 && z < CITY_AREA.z1;
// (the same sizes as each kind has always been drawn at: render-world.js, render-city.js, render-outskirts.js)
export const LAMP_KINDS = Object.freeze({
  town: Object.freeze({ height: 5.27, reach: 0.85, radius: 0.1 }),
  block: Object.freeze({ height: 8.33, reach: 1.85, radius: 0.13 }),
  outskirt: Object.freeze({ height: 6.06, reach: 1.15, radius: 0.11 }),
  median: Object.freeze({ height: 11.2, reach: 3.4, radius: 0.16, arms: 2 }),
  edge: Object.freeze({ height: 10.2, reach: 3.0, radius: 0.14 }),
  ornate: Object.freeze({ height: 4.3, reach: 0, radius: 0.12 }),
  deck: Object.freeze({ height: 8.0, reach: 2.6, radius: 0.12 }),
});
function allLamps() {
  const out = [];
  // the town's own: a pole at the place given, its arm reaching across toward the road's middle (render-world.js)
  ZONE_LAMPS.forEach((l, i) => {
    if (inCityBlock(l.x, l.z)) return;
    const reach = l.x < 0 ? 1 : -1;
    out.push(lamp(`t${i}`, 'town', l.x, l.z, zoneGroundY(l.x, l.z), reach > 0 ? Math.PI / 2 : -Math.PI / 2, LAMP_KINDS.town.reach, LAMP_KINDS.town.height, { radius: LAMP_KINDS.town.radius }));
  });
  // Market Road's (the city block's): on the pavement's edge, the arm over the road (render-city.js)
  CITY_FURNITURE.filter((f) => f.kind === 'light').forEach((f, i) => {
    out.push(lamp(`b${i}`, 'block', f.x, f.z, zoneGroundY(f.x, f.z) || 0.15, f.face > 0 ? Math.PI / 2 : -Math.PI / 2, LAMP_KINDS.block.reach, LAMP_KINDS.block.height, { radius: LAMP_KINDS.block.radius }));
  });
  // beyond the town: down the Kwale road, at the airport, and along the bridge's deck (render-outskirts.js)
  OUTSKIRT_LAMPS.forEach((l, i) => {
    const y = zoneGroundY(l.x, l.z);
    const ax = l.deck ? (l.x < (BRIDGE.x0 + BRIDGE.x1) / 2 ? 1 : -1) : 0;
    const az = l.deck ? 0 : Math.abs(l.z + 40) < 15 ? (l.z < -40 ? 1 : -1) : 1;
    const heading = ax ? (ax > 0 ? Math.PI / 2 : -Math.PI / 2) : az > 0 ? 0 : Math.PI;
    out.push(lamp(`o${i}`, 'outskirt', l.x, l.z, y, heading, LAMP_KINDS.outskirt.reach, LAMP_KINDS.outskirt.height, { radius: LAMP_KINDS.outskirt.radius, bridge: !!l.deck }));
  });
  // Oganiru City's: tall ones with two arms down the middle strips, one-armed at the road edges and on the decks' walls
  // (out of any vehicle's reach), the ornate black posts with lanterns on the downtown streets
  OGANIRU_LAMPS.forEach((l, i) => {
    const k = LAMP_KINDS[l.kind];
    const gy = l.kind === 'deck' ? l.y - 1.1 : 0;
    out.push(lamp(`c${i}`, l.kind, l.x, l.z, l.y, l.heading, k.reach, k.height, { radius: k.radius, arms: k.arms || 1, gy, knock: l.kind !== 'deck', deck: l.deck || null, banner: !!l.banner }));
  });
  return Object.freeze(out);
}
export const STREET_LAMPS = allLamps();
const BY_ID = new Map(STREET_LAMPS.map((l, i) => [l.id, i]));
export const lampIndexOf = (id) => (BY_ID.has(id) ? BY_ID.get(id) : -1);

// The lamps in squares of the grid, for finding the one in a vehicle's way quickly.
const CELL = 12;
const CELLS = new Map();
STREET_LAMPS.forEach((l, i) => {
  if (!l.knock) return;
  const key = Math.floor(l.x / CELL) * 4096 + Math.floor(l.z / CELL);
  if (!CELLS.has(key)) CELLS.set(key, []);
  CELLS.get(key).push(i);
});

// ---------------------------------------------------------------------------------------- what is down --
// Which lamps are down, in this page (shared by the town it runs and its drawing): each by its number, when it went
// down by this page's clock (seconds), which way it fell, who knocked it down (a player's id, or '' for one heard of from
// another player), and once it stands again, when it began to rise.
const DOWN = new Map();
export const lampsDown = () => DOWN;
export const lampDown = (i) => DOWN.has(i) && !DOWN.get(i).up;
// Down now (`at` by the clock the caller keeps: what matters is how long ago). Already down: nothing changes.
export function knockLamp(i, at, dir, by = '') {
  if (!STREET_LAMPS[i] || !STREET_LAMPS[i].knock) return false;
  const was = DOWN.get(i);
  if (was && !was.up) return false;
  DOWN.set(i, { at, dir, by, up: null, seq: (was ? was.seq : 0) + 1 });
  return true;
}
// Up again (rising from `at`): it is solid again from now.
export function raiseLamp(i, at) { const d = DOWN.get(i); if (d && !d.up) d.up = at; }
// Long risen: forgotten.
export function forgetLamp(i) { DOWN.delete(i); }
export function clearLamps() { DOWN.clear(); }

// The standing pole (radius) a body of `radius` at (x, z), standing at height `y`, runs into, if any: its number.
// (A lamp on a deck's wall is out of reach; one down is not in the way.)
export function lampInTheWay(x, z, radius = 0.4, y = 0) {
  const i0 = Math.floor((x - radius - 1) / CELL), i1 = Math.floor((x + radius + 1) / CELL);
  const j0 = Math.floor((z - radius - 1) / CELL), j1 = Math.floor((z + radius + 1) / CELL);
  for (let ci = i0; ci <= i1; ci += 1) for (let cj = j0; cj <= j1; cj += 1) {
    const list = CELLS.get(ci * 4096 + cj);
    if (!list) continue;
    for (const i of list) {
      const l = STREET_LAMPS[i];
      if (Math.abs(l.y - y) > 2.5) continue;
      if (Math.hypot(x - l.x, z - l.z) >= l.radius + radius) continue;
      if (lampDown(i)) continue;
      return i;
    }
  }
  return -1;
}
// The fallen poles near a point, as bars on the ground for the wheels to climb (wheel-bumps.js): from the foot to the
// lamp's end, as thick as the pole.
export function fallenBars(x, z, reach = 40) {
  const out = [];
  for (const [i, d] of DOWN) {
    if (d.up) continue;
    const l = STREET_LAMPS[i];
    if (Math.abs(l.x - x) > reach || Math.abs(l.z - z) > reach) continue;
    const len = l.hy - l.y;
    out.push({ ax: l.x, az: l.z, bx: l.x + Math.sin(d.dir) * len, bz: l.z + Math.cos(d.dir) * len, r: Math.max(0.09, l.radius), lamp: i, y: l.y });
  }
  return out;
}
// Is a vehicle of this class heavy (it knocks a lamp down from LAMP_KNOCK.heavy)?
export const heavyClass = (cls) => LAMP_KNOCK.heavyClasses.includes(cls);
export const knockSpeedOf = (cls) => (heavyClass(cls) ? LAMP_KNOCK.heavy : LAMP_KNOCK.car);

// Is the lamp lit (night, and standing, and not broken)? `night` 0..1. Each comes on at its own moment at dusk, one
// after another along its street (`order`, 0..1 along it), and goes off in the same order at dawn.
export function lampOrder(l) {
  // along the road it stands on: for one down a road running along z, by its z; along x, by its x; the town's by place
  const k = Math.sin(l.x * 0.0123 + l.z * 0.0071) * 0.5 + 0.5;
  if (l.kind === 'median' || l.kind === 'edge' || l.kind === 'ornate' || l.kind === 'deck') return Math.max(0, Math.min(1, (-l.z - 470) / 1100)) * 0.85 + k * 0.15;
  return k;
}
export const lampOnAt = (l) => 0.12 + lampOrder(l) * 0.16;

// (the town's test of where something can stand asks this for the players' things: atani.js zoneWalkable; the town's own
// people and cars, which never knock a lamp down, are not asked)
setLampBlocker((x, z, radius, y) => lampInTheWay(x, z, radius, y) >= 0);
