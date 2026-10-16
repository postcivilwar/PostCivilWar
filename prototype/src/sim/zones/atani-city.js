// The first city block (16 October 2026, from the owner's brief and street recordings): Market Road made a city
// boulevard from the Registry Road junction to the Waterside Road junction, framed by real buildings.
//
//   - the road: four lanes (two each way, about 3 m each) between raised kerbs, paired yellow lines down the
//     middle, dashed white lines between the lanes, a yellow line along each kerb; zebra crossings and stop lines
//     at the two junctions and at the market gate, and traffic signals at the Registry Road junction;
//   - the pavements: 4 m of light stone pavers each side, 15 cm above the road, turning the corners into Registry
//     Road and Waterside Road, with ramps down at every crossing;
//   - along them: streetlights, bollards, bins, a hydrant, drains and manholes; and on the west side a raised
//     lawn behind a low panelled retaining wall, with trees and shrubs;
//   - the buildings: a brick shopfront terrace and a pale tower on the west side, a stone building with an arched
//     ground floor and a glass office tower on the east, and two more towers behind for the skyline. They are not
//     entered (`kind: 'city'`); everything the town already had here (the police post, the clinic, the store, the
//     kitchen, the trade sheds, the market, the HOLARIS showroom, the motor park) stays where it was.
//
// Positions are site-grid metres (atani.js). This file is content, and is read by the simulation (what stands where,
// what is in the way, how high the ground is) and by the drawing (render-city.js).

export const KERB = 0.15;                 // metres: how far the pavement stands above the road

// The carriageway, and its lanes. (x across, z along; Market Road runs along z.)
export const BOULEVARD = Object.freeze({
  x0: -6.5, x1: 6.5, z0: -45, z1: 118,
  lane: 3.05,                             // each of the four
  centre: 0.16,                           // half the gap between the paired yellow lines
});

// The pavements: [x0, z0, x1, z1] each, raised by KERB.
const box = (x0, z0, x1, z1) => Object.freeze({ x0, z0, x1, z1 });
export const PAVEMENTS = Object.freeze([
  box(-10.5, -31, -6.5, 104),           // west, the length of the block
  box(6.5, -31, 10.5, 104),             // east
  box(-30, -35, -10.5, -31),            // round the corners into Registry Road, north side (the corner itself, where
  box(10.5, -35, 30, -31),              //   the crossings meet, is at road level)
  box(-30, -49, -5, -45),               // and its south side, where Market Road goes on south as it was
  box(5, -49, 30, -45),
  box(-14, 104, -6.5, 108),             // round the corners into Waterside Road
  box(6.5, 104, 16, 108),
  box(-17.5, -31, -10.5, 57),           // and paved up to the buildings' fronts (the trade sheds stand on it)
  box(10.5, -31, 11.5, 10),
]);
// The corners of the Registry Road junction where the crossings meet: paved, at the road's level.
export const LANDINGS = Object.freeze([box(-10.5, -35, -6.5, -31), box(6.5, -35, 10.5, -31)]);

// Zebra crossings: across the road at `at`, over the span [from, to]; `along` is the axis the walker crosses on.
const crossing = (id, along, at, from, to, width = 3.2) => Object.freeze({ id, along, at, from, to, width });
export const CROSSINGS = Object.freeze([
  crossing('registry-n', 'x', -33, -6.5, 6.5),        // across Market Road, north of the Registry Road junction
  crossing('registry-s', 'x', -47, -5, 5),            // and south of it
  crossing('registry-w', 'z', -8.5, -45, -35),        // across Registry Road, west and east of the junction
  crossing('registry-e', 'z', 8.5, -45, -35),
  crossing('market-gate', 'x', 60, -6.5, 6.5),        // at the market gate
  crossing('waterside', 'x', 102, -6.5, 6.5),         // before Waterside Road
]);
// Stop lines, [x0, z0, x1, z1], where traffic coming to a crossing waits. Traffic keeps right: going north (+z) it
// is on the west half (x < 0), going east (+x) on the north half of Registry Road.
export const STOP_LINES = Object.freeze([
  box(0.3, -31.1, 6.3, -30.7),          // southbound, before the junction
  box(-4.8, -49.3, -0.3, -48.9),        // northbound, coming up from the south
  box(-10.9, -39.7, -10.5, -35.3),      // eastbound on Registry Road
  box(10.5, -44.7, 10.9, -40.3),        // westbound
  box(-6.3, 57.9, -0.3, 58.3), box(0.3, 61.7, 6.3, 62.1),       // the market gate, both ways
  box(-6.3, 100.0, -0.3, 100.4),        // northbound, before Waterside Road
]);

// Ramps down to road level: [x0, z0, x1, z1] and which way the ground falls to the road ('x+': down toward +x).
export const RAMPS = Object.freeze([
  [-10.5, -31, -6.5, -28.6, 'z-'], [6.5, -31, 10.5, -28.6, 'z-'],          // the ends of the block, at the junction
  [-13, -35, -10.5, -31, 'x+'], [10.5, -35, 13, -31, 'x-'],               // the ends of the corners
  [-10.1, -47.4, -6.9, -45, 'z+'], [6.9, -47.4, 10.1, -45, 'z+'],         // the south side, for the crossings over Registry Road
  [-7.4, -49, -5, -45, 'x+'], [5, -49, 7.4, -45, 'x-'],                   // and over Market Road south
  [-9, 58.4, -6.5, 61.6, 'x+'], [6.5, 58.4, 9, 61.6, 'x-'],               // the market gate
  [-9, 100.4, -6.5, 103.6, 'x+'], [6.5, 100.4, 9, 103.6, 'x-'],           // before Waterside Road
].map(([x0, z0, x1, z1, fall]) => Object.freeze({ x0, z0, x1, z1, fall })));

// The raised lawn behind its retaining wall, west side (the wall stands along its road edge and its two ends).
export const LAWN = Object.freeze({ x0: -18, z0: 57, x1: -10.6, z1: 75, height: 0.8, wall: 0.25 });
export const LAWN_TREES = Object.freeze([[-14.8, 60.5], [-15.6, 67], [-14.6, 72.6]].map(([x, z]) => Object.freeze({ x, z })));
export const LAWN_SHRUBS = Object.freeze([[-12, 58.6], [-12.2, 64.2], [-11.8, 70.3], [-16.9, 63.8], [-16.8, 73.8], [-12.1, 73.9]].map(([x, z]) => Object.freeze({ x, z })));

// Street furniture. `kind`: light (a streetlight), signal (traffic signals), bollard, bin, hydrant, drain, manhole,
// bench-free kerb planters are not used. Each has a place and, where it matters, which way it faces.
const thing = (kind, x, z, more = {}) => Object.freeze({ kind, x, z, ...more });
function furniture() {
  const list = [];
  // streetlights: both sides, staggered, at the pavement's road edge, arm over the road
  for (const z of [-22, 3, 28, 53, 78]) list.push(thing('light', -7.05, z, { face: 1 }));
  for (const z of [-9.5, 15.5, 40.5, 65.5, 90.5]) list.push(thing('light', 7.05, z, { face: -1 }));
  // traffic signals, each on the kerb at the right of the traffic it stops (traffic keeps right): at the Registry
  // Road junction for all four ways in, and for the crossing at the market gate. `phase` is which group it is in.
  list.push(thing('signal', 10.3, -30.6, { face: Math.PI, phase: 0 }));            // southbound, into the junction
  list.push(thing('signal', -5.6, -49.4, { face: 0, phase: 0 }));                  // northbound, from the south
  list.push(thing('signal', -11.6, -34.4, { face: Math.PI / 2, phase: 1 }));       // eastbound on Registry Road
  list.push(thing('signal', 11.6, -45.6, { face: -Math.PI / 2, phase: 1 }));       // westbound
  list.push(thing('signal', -7.0, 57.4, { face: 0, phase: 2 }), thing('signal', 7.0, 62.6, { face: Math.PI, phase: 2 }));
  // bollards: a line of them along the lawn's wall, and either side of the crossings, leaving the walking line clear
  for (let z = 63.6; z <= 74.6; z += 1.9) list.push(thing('bollard', -10.15, z));
  for (const [x, z] of [[-6.95, 104.2], [6.95, 104.2], [-6.95, 57.9], [-6.95, 62.1], [6.95, 57.9], [6.95, 62.1], [-6.95, 100.1], [6.95, 103.9]]) list.push(thing('bollard', x, z));
  // bins (yellow and red, as a pair), a hydrant
  list.push(thing('bin', -10.05, 84.4, { colour: 0xe0b31a }), thing('bin', -10.05, 85.2, { colour: 0xc8381f }));
  list.push(thing('bin', 10.05, -18.6, { colour: 0xe0b31a }), thing('bin', 10.05, 47.0, { colour: 0xc8381f }));
  list.push(thing('hydrant', -9.9, 57.0), thing('hydrant', 9.9, 24.0));
  // drains at the kerb, manholes in the road
  for (let z = -24; z < 100; z += 18) { list.push(thing('drain', -6.15, z), thing('drain', 6.15, z + 9)); }
  for (const [x, z] of [[-3.1, -8], [3.0, 22], [-1.6, 44], [3.1, 81], [-3.0, 95]]) list.push(thing('manhole', x, z));
  return list;
}
export const CITY_FURNITURE = Object.freeze(furniture());

// The buildings. `face` is the side toward the road ('e' or 'w'); `storeys`, each `floor` metres (the ground floor
// `ground` metres); `style`: brick (a shopfront terrace), pale (a rendered tower with a grid of windows), stone
// (stone-faced, an arcade of arches at street level), glass (an office tower with a curtain wall).
const building = (id, name, style, x0, z0, x1, z1, storeys, face, more = {}) => Object.freeze({
  id, kind: 'city', sign: '', name, style, x: (x0 + x1) / 2, z: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0,
  storeys, floor: more.floor || 3.3, ground: more.ground || 4.6, h: (more.ground || 4.6) + (storeys - 1) * (more.floor || 3.3), door: face, face, wall: 0, roof: 0, ...more,
});
export const CITY_BUILDINGS = Object.freeze([
  building('city-w1', 'Ogbogonogo Terrace', 'brick', -31, -31, -17.5, -3, 4, 'e', { seed: 3 }),
  building('city-w2', 'Niger View House', 'pale', -31, 1, -18.5, 31, 9, 'e', { seed: 7 }),
  building('city-e1', 'Cable Point Chambers', 'stone', 11.5, -31, 22, -12.5, 4, 'w', { seed: 11, floor: 3.6, ground: 5.4 }),
  // (the way into the market and to the store's door, from z 11 to 33, is left open)
  building('city-e2', 'Delta Trust Tower', 'glass', 11.5, -9.5, 21, 10, 12, 'w', { seed: 13, floor: 3.5 }),
  building('city-t1', 'Riverside Plaza', 'glass', -58, 2, -42, 18, 15, 'e', { seed: 17, floor: 3.5 }),
  building('city-t2', 'Okpanam Court', 'pale', 70, -24, 82, -8, 11, 'w', { seed: 19 }),
]);

// What stands in the way (for anyone walking or driving): the buildings, the lawn and its wall, and the furniture
// one cannot walk through (poles, bins, hydrants, bollards).
const solid = { light: 0.14, signal: 0.14, bollard: 0.12, bin: 0.3, hydrant: 0.2 };
export const CITY_COLLIDERS = Object.freeze([
  ...CITY_BUILDINGS.map((b) => box(b.x - b.w / 2, b.z - b.d / 2, b.x + b.w / 2, b.z + b.d / 2)),
  box(LAWN.x0, LAWN.z0, LAWN.x1 + LAWN.wall, LAWN.z1),
  ...CITY_FURNITURE.filter((f) => solid[f.kind]).map((f) => box(f.x - solid[f.kind], f.z - solid[f.kind], f.x + solid[f.kind], f.z + solid[f.kind])),
]);

// Where the city block is: anything outside this needs no more looking at.
export const CITY_AREA = Object.freeze(box(-31, -49, 30, 118));
const inBox = (b, x, z) => x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1;

// How high the ground is here: the pavements stand KERB above the road, falling to it at the ramps.
export function cityGroundY(x, z) {
  if (x < CITY_AREA.x0 || x > CITY_AREA.x1 || z < CITY_AREA.z0 || z > CITY_AREA.z1) return 0;
  let on = false;
  for (const p of PAVEMENTS) if (inBox(p, x, z)) { on = true; break; }
  if (!on) return 0;
  for (const r of RAMPS) {
    if (!inBox(r, x, z)) continue;
    // ('x+': at its +x edge it is at road level, at its -x edge at the pavement's height)
    const t = r.fall === 'x-' ? (x - r.x0) / (r.x1 - r.x0) : r.fall === 'x+' ? (r.x1 - x) / (r.x1 - r.x0) : r.fall === 'z-' ? (z - r.z0) / (r.z1 - r.z0) : (r.z1 - z) / (r.z1 - r.z0);
    return KERB * Math.max(0, Math.min(1, t));
  }
  return KERB;
}

// Is a point on the city block's carriageway (for the drawing: the old road is not drawn here)?
export const onBoulevard = (x, z) => x >= BOULEVARD.x0 && x <= BOULEVARD.x1 && z >= BOULEVARD.z0 && z <= BOULEVARD.z1;

// The traffic signals' cycle, by the town's own clock (seconds): Market Road's traffic through the Registry Road
// junction (phase 0), then Registry Road's (phase 1); the cars' lights at the market gate crossing (phase 2) give
// those on foot their turn after. 'green', 'amber' or 'red'.
export const SIGNAL_CYCLE = 34;
export function signalState(phase, seconds) {
  const k = ((seconds % SIGNAL_CYCLE) + SIGNAL_CYCLE) % SIGNAL_CYCLE;
  if (phase === 0) return k < 13 ? 'green' : k < 16 ? 'amber' : 'red';
  if (phase === 1) return k >= 17 && k < 30 ? 'green' : k >= 30 && k < 33 ? 'amber' : 'red';
  return k < 22 ? 'green' : k < 25 ? 'amber' : 'red';
}
// Where traffic stops for them (on the middle of its own road, as the town's riders keep to it), and which way it
// is going when it does: north (+z), south, east (+x) or west.
const STOPS = Object.freeze([
  { way: 'n', at: -49, phase: 0 }, { way: 's', at: -31, phase: 0 },
  { way: 'e', at: -10.7, phase: 1 }, { way: 'w', at: 10.7, phase: 1 },
  { way: 'n', at: 58, phase: 2 }, { way: 's', at: 62, phase: 2 },
]);
// Must something going from (x, z) to (nx, nz) wait here, the light at the line ahead not being green?
export function trafficHold(x, z, nx, nz, seconds) {
  for (const s of STOPS) {
    if (s.way === 'n' || s.way === 's') {
      if (Math.abs(x) > BOULEVARD.x1 + 1) continue;
      const going = s.way === 'n' ? nz > z : nz < z;
      if (!going) continue;
      const before = s.way === 'n' ? z <= s.at && nz > s.at : z >= s.at && nz < s.at;
      if (before && signalState(s.phase, seconds) !== 'green') return true;
    } else {
      if (Math.abs(z + 40) > 6) continue;
      const going = s.way === 'e' ? nx > x : nx < x;
      if (!going) continue;
      const before = s.way === 'e' ? x <= s.at && nx > s.at : x >= s.at && nx < s.at;
      if (before && signalState(s.phase, seconds) !== 'green') return true;
    }
  }
  return false;
}
