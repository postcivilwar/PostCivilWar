// The Post Civil War Car Showroom (17 October 2026): a large open compound beside the Kwale road just out of Asaba,
// on the inland side, between the edge of town and the airport.
//
//   - the compound: fenced all round with white iron railings one can see through, a post at each of its four corners
//     with a CCTV camera on it that turns to watch and blinks red now and then; the way in is a transparent sliding
//     gate in the middle of its front, on the road, whose two glass leaves slide apart slowly for whoever comes to
//     it, as a bank's doors do, and close again behind them (`gate`, and the simulation's `carshowGate`); the
//     ground inside is paved with interlocking blocks;
//   - inside, the owner's five buildings, exactly as supplied (assets/buildings/carshow/, drawn by
//     src/client/render-carshow.js), each one's old branding painted over in the page and never in the file: the
//     tall glass tower with its podium, the largest of them, is the showroom, its name standing on top; the stacked
//     tower and the twisting tower behind, the tower on its raised deck and the villa in its gardens before them;
//   - the showroom's hall, inside the podium of the glass tower: the twenty cars on round stands with room all round
//     each, the gold hypercar turning in the middle; two salesmen, each keeping one side of the floor, their desks
//     against the end walls, and a lounge by the glass; the glass doors in the front of the podium slide open for
//     whoever comes to them, and stepping through them takes the player inside (`carshow.in`), the mat inside them
//     back out (`carshow.out`).
//
// Each car is sold where it stands: each one's listing in the market has its place at its stand (api/_lib/schema.js,
// migration 13). Everything here is in site-grid metres (atani.js; grid +z is true east, toward the river, and -x is
// true south, down the Kwale road). The buildings' walls are solid: nobody walks into one, and from the hall nobody
// walks out but by the doors.

const box = (x0, z0, x1, z1) => Object.freeze({ x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1) });
const pt = (x, z) => Object.freeze({ x, z });

// --------------------------------------------------------------------------------------------- the compound --
const C = box(-560, -212, -275, -70);
// the gate: the middle of the front fence, on the road side; two leaves of glass that slide apart along the inside
// of the fence, each as wide as half the way through
const GATE = Object.freeze({ x: -420, z: C.z1, width: 11, height: 2.6, open: 3.2, close: 3.8, wait: 2.5, reach: 13, reachDriving: 30 });

// --------------------------------------------------------------------------------------------- the buildings --
// Each is the owner's model as supplied, one unit tall in its file (the villa: its gardens one unit across), drawn at
// `scale` metres to the unit, its front (+z in its file) facing the way it is turned (`heading`, 0 = +z). `outline`
// is where it stands on the ground, in the model's own units (read off cross-sections of the mesh at its foot: see
// the README), and is solid. `brand` lists what was written on it (another company's name and marks in its
// picture), painted over in the page: rectangles of its picture (0 to 1 across and down) and where to take the
// paint from.
const BUILDINGS = Object.freeze([
  Object.freeze({
    id: 'showroom', name: 'Post Civil War Car Showroom', file: 'carshow-showroom.glb', source: 'tall_glass_skyscraper_3d_model.glb', scale: 130, x: -400.4, z: -170, heading: 0,
    outline: [[-0.345, -0.197], [0.345, -0.226], [0.32, 0.12], [0.235, 0.105], [0.2, 0.15], [0.15, 0.18], [0.1, 0.19], [0.05, 0.18], [0.0, 0.15], [-0.02, 0.1], [-0.345, 0.108]],
    // its podium's roof, and the round tower's top (the name stands on both)
    podium: 0.2, tower: Object.freeze({ x: 0.105, z: 0.05, r: 0.135, top: 0.93 }),
    brand: [{ at: [0.298, 0.090, 0.372, 0.112], from: [0.298, 0.067] }],          // PARKER and its badge, on a panel of its podium
  }),
  Object.freeze({
    id: 'stacked', name: 'Stacked tower', file: 'carshow-stacked.glb', source: 'modern_skyscraper_3d_model_4.glb', scale: 90, x: -510, z: -172, heading: 0,
    outline: [[-0.011, -0.3], [0.1, -0.275], [0.218, -0.255], [0.218, -0.15], [0.111, -0.061], [0.186, 0.207], [0.064, 0.207], [-0.025, 0.232], [-0.249, 0.05], [-0.243, -0.15], [-0.125, -0.246]],
    brand: [{ at: [0.630, 0.172, 0.715, 0.210], from: [0.630, 0.212] }, { at: [0.414, 0.646, 0.429, 0.687], from: [0.398, 0.646] }],          // another company's name, twice
  }),
  Object.freeze({
    id: 'twisting', name: 'Twisting tower', file: 'carshow-twisting.glb', source: 'twisting_skyscraper_3d_model.glb', scale: 120, x: -305, z: -175, heading: 0,
    outline: [[-0.149, -0.014], [-0.08, -0.109], [0.04, -0.014], [-0.08, 0.082]],
    brand: [],
  }),
  Object.freeze({
    id: 'deck', name: 'Tower on its deck', file: 'carshow-deck.glb', source: 'architectural_3d_model_1.glb', scale: 70, x: -318, z: -105, heading: 0,
    outline: [[-0.206, -0.2], [0.0, -0.205], [0.03, -0.25], [0.146, -0.26], [0.197, 0.0], [0.163, 0.188], [0.114, 0.256], [-0.171, 0.274]],
    brand: [],          // (the red shapes in its picture are its spiral ramp, not a name)
  }),
  Object.freeze({
    id: 'villa', name: 'Villa', file: 'carshow-villa.glb', source: 'modern_villa_3d_model.glb', scale: 42, x: -515, z: -102, heading: 0,
    outline: [[-0.455, -0.044], [-0.414, -0.342], [-0.206, -0.482], [0.19, -0.473], [0.294, -0.422], [0.352, -0.377], [0.451, -0.272], [0.455, -0.165], [0.452, -0.141], [0.247, 0.315], [0.059, 0.465], [-0.083, 0.491], [-0.121, 0.478], [-0.231, 0.378], [-0.396, 0.088]],
    brand: [],
  }),
]);

// a point on a building's model (its own units, its front toward +z) in the town
export function onBuilding(b, u, v) {
  const c = Math.cos(b.heading), s = Math.sin(b.heading);
  return { x: b.x + (u * c + v * s) * b.scale, z: b.z + (-u * s + v * c) * b.scale };
}
const SHOWROOM = BUILDINGS[0];
const at = (u, v) => onBuilding(SHOWROOM, u, v);

// ------------------------------------------------------------------------------------------------- the hall --
// In the glass tower's podium: from inside its west wall to near its east one, from inside its back to just inside
// its front, where the doors are (in the front of the podium's west wing, the part of the front that is flat).
const FRONT = at(0, 0.107).z;                   // the podium's front, west of the round tower
const HALL = box(at(-0.335, 0).x, at(0, -0.189).z, at(0.307, 0).x, FRONT - 1.0);
const DOOR_X = HALL.x0 + 23.25;                 // the doors: between the first two rows of stands across the west wing
const DOORS = Object.freeze({ x: DOOR_X, z: FRONT, width: 3.6, height: 3.4 });

// The cars on show: three rows of seven across the hall, the front row's westmost place kept for the lounge and the
// doors' way in; the gold hypercar turning in the middle. Each faces the way it is shown (h, radians: 0 faces the
// doors, toward +z), on a round stand of radius `r`.
const COLS = Array.from({ length: 7 }, (_, i) => HALL.x0 + 5.9 + i * ((HALL.x1 - HALL.x0 - 11.8) / 6));
const ROWS = [HALL.z1 - 7.3, HALL.z1 - 19.3, HALL.z1 - 31.0];
const SHOWN = [
  // the front row (nearest the doors): everyday cars, the classics and the work horses
  [null, 0, 0], ['grey-saloon', 1, 0, 0.55], ['classic-two-tone', 2, 0, 0.4], ['yellow-classic-roadster', 3, 0, 0.3], ['black-pickup', 4, 0, -0.3], ['blue-off-roader', 5, 0, -0.45], ['camo-expedition', 6, 0, -0.6],
  // the middle row: the SUVs either side, the hypercar on the turntable in the middle
  ['black-square-suv', 0, 1, 0.7], ['white-square-suv', 1, 1, 0.5], ['peach-suv', 2, 1, 0.35], ['gold-hypercar', 3, 1, 0, 'turntable'], ['black-luxury-suv', 4, 1, -0.35], ['state-limousine', 5, 1, -0.5], ['midnight-saloon', 6, 1, -0.7],
  // the back row: the sports cars, the convertibles and the supercars
  ['mint-sports-coupe', 0, 2, 0.6], ['white-roadster', 1, 2, 0.45], ['pearl-convertible', 2, 2, 0.3], ['red-winged-supercar', 3, 2, 0, 'hero'], ['bronze-spyder', 4, 2, -0.3], ['black-grand-convertible', 5, 2, -0.45], ['grey-grand-tourer', 6, 2, -0.6],
];
const DISPLAYS = SHOWN.filter((d) => d[0]).map(([car, i, j, h, stand = 'plinth']) => Object.freeze({ car, x: Math.round(COLS[i] * 100) / 100, z: Math.round(ROWS[j] * 100) / 100, h, stand, r: stand === 'turntable' ? 3.6 : 3.3, side: i < 3 || (i === 3 && j === 0) ? 'west' : 'east' }));

const mid = (ROWS[0] + ROWS[1]) / 2;            // the desks: against the end walls, between the first two rows
export const CARSHOW = Object.freeze({
  id: 'carshow',
  name: 'Post Civil War Car Showroom',
  shop: 'cars',                          // the market's name for the showroom (its listings keep it)
  label: 'Post Civil War Car Showroom, Kwale Road, Asaba',
  compound: C,
  gate: GATE,
  // the iron railings: posts, rails and bars; the four corner posts carry the cameras
  fence: Object.freeze({ height: 2.3, post: 2.6, bar: 0.13 }),
  cctv: Object.freeze([[C.x0, C.z0], [C.x1, C.z0], [C.x0, C.z1], [C.x1, C.z1]].map(([x, z]) => Object.freeze({ x, z, height: 4.6, look: Math.atan2((C.x0 + C.x1) / 2 - x, (C.z0 + C.z1) / 2 - z) }))),
  // the drive from the road's verge to the gate, and from the gate to the doors
  drive: Object.freeze({ fromRoad: box(GATE.x - GATE.width / 2 - 2, C.z1, GATE.x + GATE.width / 2 + 2, -59), width: 12 }),
  // on the forecourt: palms in round planters along the front, three flag poles beside the drive inside the gate
  // (the middle one, Nigeria's, the tallest), and lamps along the drive
  forecourt: Object.freeze({
    palms: Object.freeze([-1, 1].flatMap((s) => [0, 1, 2, 3, 4, 5].map((k) => Object.freeze({ x: GATE.x + s * (16 + k * 13), z: C.z1 - 4.5, h: 5.5 + (k % 3) * 0.7, r: 0.85 })))),
    flags: Object.freeze([0, 1, 2].map((k) => Object.freeze({ x: GATE.x + 13 + k * 4, z: C.z1 - 8, h: k === 1 ? 12 : 10, k }))),
    lamps: Object.freeze([-1, 1].flatMap((s) => Array.from({ length: 5 }, (_, k) => Object.freeze({ x: GATE.x + s * 7.2, z: C.z1 - 16 - k * 16, side: s })))),
  }),
  buildings: BUILDINGS,
  showroom: SHOWROOM,
  hall: Object.freeze({ ...HALL, ceiling: 7.2 }),
  doors: DOORS,
  // stepping through the doors from outside; where someone coming in is set down, and someone going out
  entry: Object.freeze({ x: DOOR_X, z: FRONT + 0.9, radius: 1.5 }),
  arrive: Object.freeze({ x: DOOR_X, z: HALL.z1 - 2.4, heading: Math.PI }),
  leave: Object.freeze({ x: DOOR_X + 2.6, z: FRONT + 4.2, heading: 0 }),
  exit: box(DOOR_X - 1.8, HALL.z1 - 1.0, DOOR_X + 1.8, HALL.z1),
  displays: Object.freeze(DISPLAYS),
  // the salesmen's desks against the end walls, the lounge in the front corner by the glass, plants
  desks: Object.freeze([box(HALL.x0 + 0.6, mid - 2.2, HALL.x0 + 1.6, mid + 2.2), box(HALL.x1 - 1.6, mid - 2.2, HALL.x1 - 0.6, mid + 2.2)]),
  lounge: Object.freeze({ sofa: box(HALL.x0 + 0.5, HALL.z1 - 8.6, HALL.x0 + 1.5, HALL.z1 - 4.2), table: box(HALL.x0 + 2.6, HALL.z1 - 7.4, HALL.x0 + 3.8, HALL.z1 - 5.4), chairs: Object.freeze([pt(HALL.x0 + 5.1, HALL.z1 - 7.8), pt(HALL.x0 + 5.1, HALL.z1 - 4.9)]) }),
  plants: Object.freeze([[HALL.x0 + 0.9, HALL.z0 + 0.9], [HALL.x1 - 0.9, HALL.z0 + 0.9], [HALL.x1 - 0.9, HALL.z1 - 0.9], [HALL.x0 + 0.9, HALL.z1 - 0.9], [DOOR_X - 3.2, HALL.z1 - 0.8], [DOOR_X + 3.2, HALL.z1 - 0.8]].map(([x, z]) => pt(x, z))),
  // the two salesmen: each keeps one side of the floor (and the cars on it), waits at their desk when nobody is
  // on their side, and walks their side when it is busy
  salesmen: Object.freeze([
    Object.freeze({ id: 'tochi', name: 'Tochi', side: 'west', home: Object.freeze({ x: HALL.x0 + 2.4, z: mid, heading: Math.PI / 2 }), round: Object.freeze([[HALL.x0 + 2.4, mid], [COLS[1], ROWS[0] + 4.8], [COLS[2], ROWS[1] + 5.4], [COLS[0], ROWS[1] - 5.6], [COLS[1], ROWS[2] - 4.6], [COLS[2], ROWS[2] + 5.4], [COLS[3] - 5.4, ROWS[1] + 5.4], [COLS[0] + 5.4, ROWS[0] - 5.4]].map(([x, z]) => pt(x, z))) }),
    Object.freeze({ id: 'oluchi', name: 'Oluchi', side: 'east', home: Object.freeze({ x: HALL.x1 - 2.4, z: mid, heading: -Math.PI / 2 }), round: Object.freeze([[HALL.x1 - 2.4, mid], [COLS[5], ROWS[0] + 4.8], [COLS[4], ROWS[1] + 5.4], [COLS[6], ROWS[1] - 5.6], [COLS[5], ROWS[2] - 4.6], [COLS[4], ROWS[2] + 5.4], [COLS[3] + 5.4, ROWS[1] + 5.4], [COLS[6] - 5.4, ROWS[0] - 5.4]].map(([x, z]) => pt(x, z))) }),
  ]),
});

// Is a point in the hall (on its floor, inside its walls)?
export const inCarHall = (x, z, margin = 0) => { const h = CARSHOW.hall; return x > h.x0 + margin && x < h.x1 - margin && z > h.z0 + margin && z < h.z1 - margin; };
// Is a point on the mat inside the doors?
export const onCarshowExit = (x, z) => { const e = CARSHOW.exit; return x >= e.x0 && x <= e.x1 && z >= e.z0 && z <= e.z1; };
// Is someone at the doors, outside (where stepping on takes them in)?
export const carshowAtDoors = (x, z) => Math.hypot(x - CARSHOW.entry.x, z - CARSHOW.entry.z) <= CARSHOW.entry.radius + 0.6;
// Is a point inside the compound's fence?
export const inCarCompound = (x, z, margin = 0) => x > C.x0 + margin && x < C.x1 - margin && z > C.z0 + margin && z < C.z1 - margin;
// The car on show nearest a point, and how far it is from the edge of its stand (null when none is near)
export function carshowDisplayNear(x, z, reach = 1.4) {
  let best = null;
  for (const d of CARSHOW.displays) {
    const gap = Math.hypot(x - d.x, z - d.z) - d.r;
    if (gap <= reach && (!best || gap < best.gap)) best = { display: d, gap };
  }
  return best;
}
// Which salesman keeps a point of the floor (west of the hypercar's turntable, or east of it), and which a car
export const carshowSideAt = (x) => (x < COLS[3] ? 'west' : 'east');
export const carshowSideOf = (car) => { const d = CARSHOW.displays.find((q) => q.car === car); return d ? d.side : null; };

// ----------------------------------------------------------------------------------- the gate, as it moves --
// How far open the gate is (0 shut, 1 wide open), one step on: it opens, slowly, while anyone is near it (on foot,
// within `reach`; driving, within `reachDriving`), stays open a little after they have gone, then closes. `state` is
// { open, lastNear }; `people` are { x, z, driving }. Pure: the simulation keeps the state (sim.js), the page draws it.
export function stepCarshowGate(state, people, dt, now) {
  const near = people.some((p) => Math.hypot(p.x - GATE.x, p.z - GATE.z) <= (p.driving ? GATE.reachDriving : GATE.reach));
  if (near) state.lastNear = now;
  const want = near || now - (state.lastNear ?? -1e9) < GATE.wait;
  state.open = want ? Math.min(1, state.open + dt / GATE.open) : Math.max(0, state.open - dt / GATE.close);
  return state;
}
// What of the gate is in the way at `open`: each leaf, slid back from the middle by its share of the opening. The
// leaves run along the inside of the fence line (they do not swing out over the road).
export function carshowGateBoxes(open) {
  const half = GATE.width / 2, slide = half * Math.max(0, Math.min(1, open)), t = 0.12, z = GATE.z - 0.35;
  const out = [];
  if (slide < half - 0.02) {
    out.push(box(GATE.x - half - slide, z - t, GATE.x - slide, z + t));          // the west leaf
    out.push(box(GATE.x + slide, z - t, GATE.x + half + slide, z + t));          // the east leaf
  }
  return out;
}

// How tall what stands at a point is, if it is one of the compound's buildings (for the camera, which keeps out of
// them): its model's height there, as near as its outline says (0 where none stands).
const OUTLINES = BUILDINGS.map((b) => {
  const poly = b.outline.map(([u, v]) => onBuilding(b, u, v));
  const xs = poly.map((p) => p.x), zs = poly.map((p) => p.z);
  return { poly, x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs), height: b.id === 'villa' ? 0.39 * b.scale : b.scale };
});
export function carshowBuildingAt(x, z) {
  for (const o of OUTLINES) {
    if (x < o.x0 || x > o.x1 || z < o.z0 || z > o.z1) continue;
    let inside = false;
    for (let i = 0, j = o.poly.length - 1; i < o.poly.length; j = i, i += 1) {
      const a = o.poly[i], b = o.poly[j];
      if ((a.z > z) !== (b.z > z) && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
    }
    if (inside) return o.height;
  }
  return 0;
}

// ------------------------------------------------------------------------------------------- what is solid --
// A building's outline (in its model's units) laid on the ground in boxes: the outline is cut into rows `cell` metres
// deep, and each row's run inside it is one box.
function outlineBoxes(b, cell = 2) {
  const poly = b.outline.map(([u, v]) => onBuilding(b, u, v));
  const zs = poly.map((p) => p.z), z0 = Math.min(...zs), z1 = Math.max(...zs);
  const out = [];
  for (let z = z0; z < z1; z += cell) {
    const zc = Math.min(z1, z + cell / 2);
    // where the row's middle line crosses the outline
    const xs = [];
    for (let i = 0; i < poly.length; i += 1) {
      const a = poly[i], c = poly[(i + 1) % poly.length];
      if ((a.z <= zc && c.z > zc) || (c.z <= zc && a.z > zc)) xs.push(a.x + ((zc - a.z) / (c.z - a.z)) * (c.x - a.x));
    }
    xs.sort((p, q) => p - q);
    for (let i = 0; i + 1 < xs.length; i += 2) out.push(box(xs[i], z, xs[i + 1], Math.min(z1, z + cell)));
  }
  return out;
}
// minus the hall (its floor is open, inside the showroom's walls)
function minusHall(boxes) {
  const h = HALL, out = [];
  for (const q of boxes) {
    if (q.x1 <= h.x0 || q.x0 >= h.x1 || q.z1 <= h.z0 || q.z0 >= h.z1) { out.push(q); continue; }
    if (q.x0 < h.x0) out.push(box(q.x0, q.z0, h.x0, q.z1));
    if (q.x1 > h.x1) out.push(box(h.x1, q.z0, q.x1, q.z1));
    if (q.z0 < h.z0) out.push(box(Math.max(q.x0, h.x0), q.z0, Math.min(q.x1, h.x1), h.z0));
    if (q.z1 > h.z1) out.push(box(Math.max(q.x0, h.x0), h.z1, Math.min(q.x1, h.x1), q.z1));
  }
  return out;
}
function colliders() {
  const out = [];
  // the railings all round, and the gate's posts; the way through the gate is open (its leaves are the
  // simulation's to put in the way: carshowGateBoxes)
  const t = 0.12, gx0 = GATE.x - GATE.width / 2, gx1 = GATE.x + GATE.width / 2;
  out.push(box(C.x0, C.z0 - t, C.x1, C.z0 + t), box(C.x0 - t, C.z0, C.x0 + t, C.z1), box(C.x1 - t, C.z0, C.x1 + t, C.z1));
  out.push(box(C.x0, C.z1 - t, gx0 - 0.3, C.z1 + t), box(gx1 + 0.3, C.z1 - t, C.x1, C.z1 + t));
  for (const x of [gx0 - 0.3, gx1 + 0.3]) out.push(box(x - 0.3, C.z1 - 0.3, x + 0.3, C.z1 + 0.3));
  // the buildings (the showroom round its hall)
  out.push(...minusHall(outlineBoxes(SHOWROOM)));
  for (const b of BUILDINGS.slice(1)) out.push(...outlineBoxes(b));
  // in the hall: the stands (a square inside each round one), the desks, the lounge, the plants
  for (const d of DISPLAYS) { const k = d.r * 0.72; out.push(box(d.x - k, d.z - k, d.x + k, d.z + k)); }
  out.push(...CARSHOW.desks, CARSHOW.lounge.sofa, CARSHOW.lounge.table);
  for (const c of CARSHOW.lounge.chairs) out.push(box(c.x - 0.4, c.z - 0.4, c.x + 0.4, c.z + 0.4));
  for (const p of CARSHOW.plants) out.push(box(p.x - 0.3, p.z - 0.3, p.x + 0.3, p.z + 0.3));
  // on the forecourt: the planters, the flag poles and the lamp posts
  const F = CARSHOW.forecourt;
  for (const q of F.palms) out.push(box(q.x - q.r * 0.8, q.z - q.r * 0.8, q.x + q.r * 0.8, q.z + q.r * 0.8));
  for (const q of [...F.flags, ...F.lamps]) out.push(box(q.x - 0.12, q.z - 0.12, q.x + 0.12, q.z + 0.12));
  return Object.freeze(out.map(Object.freeze));
}
export const CARSHOW_COLLIDERS = colliders();
// the ground that can be walked and driven on: inside the fence, and the drive out to the road
export const CARSHOW_AREAS = Object.freeze([C, CARSHOW.drive.fromRoad]);
