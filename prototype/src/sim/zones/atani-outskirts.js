// Beyond the town: the road out of Asaba to the south, Asaba Airport beside it, and the bridge over the River Niger
// toward Anambra State. Added 12 October 2026 at the owner's request (then the town was Atani, on the east bank);
// turned to Asaba and Delta State on 13 October 2026. Content only, like atani.js: the simulation and the renderer
// read it through ../zone.js.
//
// Geography. Asaba is on the west bank of the Niger, and Onitsha faces it across the river. The road built here
// leaves the town southward, the way the real roads go on through Delta State toward Kwale, Ughelli and Warri;
// it is the first stretch only, shortened and schematic (not a survey), with those towns named only on its
// direction sign, and it ends at road works, honestly closed, where the world ends.
//
// The airport is the game's own "Asaba Airport", built on open land beside that road: it is not a model of the
// real airport near Asaba. The bridge is the game's own crossing, after the steel through-truss bridges of the
// Niger (the owner's photographs), not a model of the Niger bridges at Asaba and Onitsha. Its far end is in
// Anambra State, which is not built yet: travellers are welcomed there by the State's sign, and stopped a little
// further on by a barrier until that world is opened.
//
// Directions are the site grid's (atani.js, ZONE.gridBearing 270): grid +z is true east, the river and Anambra
// beyond it; grid -z is true west, inland; grid -x is true south, down the road toward Kwale and Warri.
// One grid metre is one metre on the ground.

import { CARSHOW, CARSHOW_AREAS } from './asaba-carshow.js';
import { SPORTS_MALL, SPORTS_AREAS } from './asaba-sports.js';

const box = (x0, z0, x1, z1) => Object.freeze({ x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1) });
const road = (id, name, x0, z0, x1, z1, surface, extra = {}) => Object.freeze({ id, name, x0, z0, x1, z1, surface, ...extra });

// ------------------------------------------------------------------------------------------ the bridge --
// Across the river from the west end of Waterside Road. The deck is 14 m wide (two lanes and a footway each
// side), 7 m above the water on five piers; the approach rises from the road over an embankment, and on the far
// bank it comes down onto the land and stops at a barrier.
export const BRIDGE = Object.freeze({
  name: 'River Niger Bridge',
  x0: -212, x1: -198,              // the deck, rail to rail
  roadway: Object.freeze({ x0: -209.5, x1: -200.5 }),
  start: 118,                       // where the approach leaves Waterside Road
  up: 178,                          // where it reaches the height of the deck
  down: 272,                        // where it begins to come down on the far side
  land: 322,                        // where it meets the far bank
  end: 384,                         // the barrier on the far bank
  height: 7,                        // the deck above the town's ground (the water is a little below that ground)
  farBank: 1.0,                     // the far bank's ground, above the town's
  piers: Object.freeze([165, 195, 225, 255, 285]),
  truss: Object.freeze({ from: 158, to: 292, bay: 9.6, rise: 7.6 }),
});

// How high the ground (or the deck) is at a point: 0 in town; the approach, the deck and the far bank where
// they are. Pure: for walking, driving, the camera and drawing alike.
export function outskirtsGroundY(x, z) {
  const b = BRIDGE;
  if (z > b.start && x > b.x0 - 0.01 && x < b.x1 + 0.01 && z < b.end + 6) {
    if (z <= b.up) return b.height * smoothRamp((z - b.start) / (b.up - b.start));
    if (z <= b.down) return b.height;
    if (z <= b.land) return b.farBank + (b.height - b.farBank) * smoothRamp((b.land - z) / (b.land - b.down));
    return b.farBank;
  }
  if (inFarBank(x, z)) return b.farBank;
  return 0;
}
// a ramp that starts and ends level (no kink to trip a wheel)
function smoothRamp(t) { const u = Math.max(0, Math.min(1, t)); return u * u * (3 - 2 * u); }
const FAR_BANK = box(-236, 312, -174, 392);
const inFarBank = (x, z) => x > FAR_BANK.x0 && x < FAR_BANK.x1 && z > FAR_BANK.z0 && z < FAR_BANK.z1;

// ----------------------------------------------------------------------------------------- the roads --
// The road south: Registry Road carried on out of town, wider, with a centre line and shoulders. (Its id and the
// name ONITSHA_ROAD are the code's own, kept from when the town was Atani; what a player sees is its name.)
export const ONITSHA_ROAD = road('onitsha', 'Asaba–Kwale Road', -1190, -47, -240, -33, 'asphalt', { lanes: 2, edgeLines: true });
export const OUTSKIRT_ROADS = Object.freeze([
  ONITSHA_ROAD,
  // the airport: in from the Kwale road, along the front of the terminal, and to the car park
  road('airport-access', 'Airport Road', -752, -205, -740, -47, 'asphalt', { lanes: 2, edgeLines: true }),
  road('airport-front', 'Terminal Drive', -940, -207, -740, -191, 'asphalt', { lanes: 2, edgeLines: true }),
  road('airport-park', 'Car Park', -936, -186, -812, -108, 'asphalt', { bays: true }),
  // the bridge's roadway and the road on the far bank, to the barrier
  road('bridge', BRIDGE.name, BRIDGE.roadway.x0, BRIDGE.start, BRIDGE.roadway.x1, BRIDGE.end, 'asphalt', { lanes: 2, deck: true }),
]);

// ----------------------------------------------------------------------------------------- the airport --
// On open land beside the Kwale road, inland of it. No aircraft: the stands and the runway are ready for them.
export const AIRPORT = Object.freeze({
  name: 'Asaba Airport',
  runway: Object.freeze({ ...box(-1120, -474, -580, -434), heading: 'x', designators: ['18', '36'] }),
  taxiway: box(-1080, -411, -620, -393),
  links: Object.freeze([box(-1080, -434, -1062, -393), box(-638, -434, -620, -393), box(-860, -393, -842, -330)]),
  apron: box(-944, -330, -756, -252),
  // where aircraft will stand when there are any: nose to the terminal
  stands: Object.freeze([-915, -880, -845, -810, -780].map((x) => Object.freeze({ x, z: -278, heading: Math.PI }))),
  terminal: Object.freeze({ ...box(-930, -248, -770, -214), height: 13, canopy: 10, doors: Object.freeze([-900, -850, -800]), desks: Object.freeze([-875, -825]) }),
  tower: Object.freeze({ x: -712, z: -292, base: 7, height: 30, cab: 9 }),
  admin: Object.freeze({ ...box(-735, -250, -690, -222), height: 8 }),
  fire: Object.freeze({ ...box(-655, -360, -620, -335), height: 7 }),
  // the fence round the airside, with a gate for vehicles by the admin building
  fence: box(-1150, -500, -560, -252),
  gate: Object.freeze({ x0: -690, x1: -676 }),
});
const A = AIRPORT;

// ----------------------------------------------------------------------------------- where one can go --
// Ground that can be walked and driven on outside the town's own bounds: the road corridor, the airport's land
// and the bridge. The rest of the land beyond the town is bush.
export const OUTSKIRT_AREAS = Object.freeze([
  box(-1192, -60, -240, -20),                 // the Kwale road and its verges
  box(-1160, -510, -560, -20),                // the airport's land, inside and outside its fence
  box(BRIDGE.x0 + 0.6, BRIDGE.start - 2, BRIDGE.x1 - 0.6, BRIDGE.end),   // the deck, inside its rails
  box(FAR_BANK.x0, BRIDGE.land, FAR_BANK.x1, BRIDGE.end),              // the far bank by the bridge's end, up to the barrier
  ...CARSHOW_AREAS,                                                     // the Post Civil War Car Showroom's compound, and its drive from the road
  ...SPORTS_AREAS,                                                      // the Post Civil War Sports Mall's compound, and its drive from the road
]);
export const onOutskirts = (x, z) => OUTSKIRT_AREAS.some((a) => x > a.x0 && x < a.x1 && z > a.z0 && z < a.z1);

// What stands up and cannot be walked through. The bridge's rails and the sides of its embankment are walls,
// so that a person on the beach cannot step up onto the deck from the side, nor one on the deck off it.
const wall = (x0, z0, x1, z1) => box(x0, z0, x1, z1);
function fenceWalls() {
  const f = A.fence, t = 0.15, out = [];
  out.push(wall(f.x0, f.z0, f.x1, f.z0 + t));                         // the far side
  out.push(wall(f.x0, f.z0, f.x0 + t, f.z1));                         // the north end
  out.push(wall(f.x1 - t, f.z0, f.x1, f.z1));                         // the south end
  // the landside line, behind the terminal, with the gate by the admin building the one way through
  out.push(wall(f.x0, f.z1 - t, A.gate.x0, f.z1));
  out.push(wall(A.gate.x1, f.z1 - t, f.x1, f.z1));
  return out;
}
// The terminal: walls with doors in the front, glass to the apron at the back, a hall inside one can walk into.
function terminalWalls() {
  const T = A.terminal, t = 0.4, out = [];
  out.push(wall(T.x0, T.z0, T.x1, T.z0 + t));                         // the apron side
  out.push(wall(T.x0, T.z0, T.x0 + t, T.z1));
  out.push(wall(T.x1 - t, T.z0, T.x1, T.z1));
  // the front: open where the doors are (8 m each)
  let from = T.x0;
  for (const d of [...T.doors].sort((a, b) => a - b)) { out.push(wall(from, T.z1 - t, d - 4, T.z1)); from = d + 4; }
  out.push(wall(from, T.z1 - t, T.x1, T.z1));
  // the check-in desks: two islands across the hall, between the doors, so that each door opens onto the hall
  for (const cx of A.terminal.desks) out.push(box(cx - 8, -237, cx + 8, -234));
  return out;
}
export const OUTSKIRT_COLLIDERS = Object.freeze([
  // the bridge: its rails the length of the deck, and the end piers of its truss
  wall(BRIDGE.x0, BRIDGE.start + 2, BRIDGE.x0 + 0.6, BRIDGE.end), wall(BRIDGE.x1 - 0.6, BRIDGE.start + 2, BRIDGE.x1, BRIDGE.end),
  // the columns of the State's welcome gantry on the far bank
  ...[-1, 1].map((k) => box((BRIDGE.x0 + BRIDGE.x1) / 2 + k * 9.5 - 0.35, BRIDGE.land + 8 - 0.35, (BRIDGE.x0 + BRIDGE.x1) / 2 + k * 9.5 + 0.35, BRIDGE.land + 8 + 0.35)),
  // the barrier across the far end
  wall(FAR_BANK.x0, BRIDGE.end - 0.6, FAR_BANK.x1, BRIDGE.end),
  // the road works at the end of the Kwale road
  wall(-1188, -47, -1184, -33),
  ...fenceWalls(),
  ...terminalWalls(),
  box(A.tower.x - A.tower.base / 2, A.tower.z - A.tower.base / 2, A.tower.x + A.tower.base / 2, A.tower.z + A.tower.base / 2),
  box(A.admin.x0, A.admin.z0, A.admin.x1, A.admin.z1),
  box(A.fire.x0, A.fire.z0, A.fire.x1, A.fire.z1),
].map(Object.freeze));

// Lamps: down the Kwale road, round the terminal and its car park, and along the bridge.
export const OUTSKIRT_LAMPS = Object.freeze([
  ...Array.from({ length: 22 }, (_, i) => ({ x: -280 - i * 42, z: i % 2 ? -50 : -30 })),
  ...[-930, -890, -850, -810, -770].map((x) => ({ x, z: -188 })),
  ...[-920, -870, -820].flatMap((x) => [{ x, z: -150 }, { x, z: -112 }]),
  ...[-200, -170, -140, -110, -80].map((z) => ({ x: -737, z })),
  ...Array.from({ length: 13 }, (_, i) => ({ x: i % 2 ? BRIDGE.x0 + 0.9 : BRIDGE.x1 - 0.9, z: BRIDGE.start + 8 + i * 20, deck: true })),
].map(Object.freeze));

// Signs: what each says, where it stands and which way it faces (radians, 0 facing +z).
export const OUTSKIRT_SIGNS = Object.freeze([
  // at the edge of town, for someone leaving: where the road goes (no distances: they are not measured here)
  { id: 'onitsha-exit', lines: ['KWALE ROAD', 'Kwale · Ughelli · Warri'], x: -262, z: -54, facing: Math.PI / 2, width: 7, height: 2.2, palette: ['#ffffff', '#0b6b3a'] },
  { id: 'airport-turn', lines: ['ASABA AIRPORT', 'Turn here'], x: -728, z: -54, facing: Math.PI / 2, width: 5.5, height: 2, palette: ['#ffffff', '#16407a'] },
  { id: 'airport-terminal', lines: ['ASABA AIRPORT'], x: -850, z: -212.6, facing: 0, width: 26, height: 2.6, palette: ['#ffffff', '#0e2a4a'], high: 10.5 },
  { id: 'roadworks', lines: ['ROAD WORKS', 'Road closed ahead'], x: -1180, z: -54, facing: Math.PI / 2, width: 5, height: 2, palette: ['#111111', '#f2b705'] },
  { id: 'bridge-name', lines: ['RIVER NIGER BRIDGE'], x: (BRIDGE.x0 + BRIDGE.x1) / 2, z: BRIDGE.truss.from - 0.45, facing: Math.PI, width: 12, height: 1.4, palette: ['#ffffff', '#24364f'], high: BRIDGE.height + BRIDGE.truss.rise - 0.2 },
  // Anambra State, at the far end of the bridge: the State's welcome over the road where it comes down onto the far
  // bank (a gantry, lit at night), and a little further on the barrier where the world ends for now
  { id: 'anambra-welcome', lines: ['WELCOME TO ANAMBRA STATE —', 'LIGHT OF THE NATION'], x: (BRIDGE.x0 + BRIDGE.x1) / 2, z: BRIDGE.land + 8, facing: Math.PI, width: 15, height: 3.2, palette: ['#ffffff', '#0b3b6e', '#f2c200'], ground: BRIDGE.farBank, gantry: Object.freeze({ span: 19, clear: 6.2 }) },
  { id: 'bridge-closed', lines: ['ROAD NOT YET OPEN', 'Onitsha and Anambra State: coming later'], x: (BRIDGE.x0 + BRIDGE.x1) / 2, z: BRIDGE.end - 1.4, facing: Math.PI, width: 8, height: 1.8, palette: ['#111111', '#f2b705'], ground: BRIDGE.farBank },
].map(Object.freeze));

// Roadside buildings along the Kwale road, more of them and closer together the further from Asaba: the way a
// road gets busier towards a city. Simple shops and stores; nobody lives or works in them in this build.
export const OUTSKIRT_BUILDINGS = Object.freeze((() => {
  const out = [];
  let i = 0;
  for (let x = -300; x > -1170; i += 1) {
    const busy = Math.min(1, (-x - 300) / 700);
    const gap = 38 - busy * 26;
    for (const side of [-1, 1]) {
      // not where the airport road leaves, nor in front of the airport's land
      const z = side < 0 ? -64 - (i % 3) * 3 : -16 + (i % 2) * 3;
      if (side < 0 && x < -700 && x > -770) continue;
      // (nor in front of the car showroom's compound, 17 October 2026: those that stood there are taken away)
      if (side < 0 && x - 14 < CARSHOW.compound.x1 + 6 && x > CARSHOW.compound.x0 - 6) continue;
      // (nor in front of the sports mall's, 30 October 2026)
      if (side < 0 && x - 14 < SPORTS_MALL.compound.x1 + 6 && x > SPORTS_MALL.compound.x0 - 6) continue;
      if (((i * 7 + (side + 1) * 3) % 10) / 10 > 0.35 + busy * 0.6) continue;
      const w = 7 + ((i * 13) % 5) * 1.5, d = 6 + ((i * 7) % 3) * 1.5, h = 3 + busy * 3.4 * (((i * 5) % 3) / 2);
      out.push(Object.freeze({ id: `road-${i}-${side}`, x: x - w / 2, z, w, d, h, facing: side < 0 ? 0 : Math.PI, wall: [0xd9c7a0, 0xc9d6c3, 0xe3d6a8, 0xcfd9df, 0xd6c2c2][i % 5], roof: [0x7d7f83, 0x8b4a33, 0x5f6a72, 0x355e3b][i % 4] }));
    }
    x -= gap;
  }
  return out;
})());
export const OUTSKIRT_BUILDING_COLLIDERS = Object.freeze(OUTSKIRT_BUILDINGS.map((b) => Object.freeze(box(b.x - b.w / 2, b.z - b.d / 2, b.x + b.w / 2, b.z + b.d / 2))));

// Labels for the map.
export const OUTSKIRT_MAP_LABELS = Object.freeze([
  ['To Kwale and Warri', -1100, -60, 'center'], ['Asaba Airport', -850, -300, 'center'], ['Bridge to Anambra', -205, 230, 'vertical'],
]);
