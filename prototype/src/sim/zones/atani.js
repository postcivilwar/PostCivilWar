// Atani: a town on the east bank of the River Niger, headquarters of Ogbaru
// Local Government Area, Anambra State.
//
// Everything in this file is content. The simulation and the renderer read it
// through ../zone.js and know nothing else about the town, so another town is
// another file like this one.
//
// Positions are in site-grid metres: x across the page, z down it, with the
// river at the foot of the page. The grid is turned a quarter turn from true
// north (`ZONE.gridBearing`), so that on the ground the river lies west of
// the town and the layout runs inland to the east, as at Atani. Maps, the sun
// and every latitude and longitude use true directions.
//
// The layout is original and schematic. It is not a survey of the real town,
// and the people and businesses in it are invented.

import { geoToWorld, worldToGeo, gridToTrue } from '../geo.js';
import { makeRng } from '../rng.js';
import { houseDoor } from '../layout.js';
import { kekeLook, busLook, footprintBox } from '../vehicle-looks.js';
import { TOWN_ROADS, TOWN_HOUSES, TOWN_BUILDINGS, TOWN_SHEDS, TOWN_COMPOUNDS, TOWN_FARMLAND, TOWN_SPOTS, TOWN_RANKS, TOWN_STOPS, TOWN_SOUNDS, TOWN_NOTICES } from './atani-town.js';

export const ZONE = Object.freeze({
  id: 'NG-AN-OGB-Z1',
  name: 'Atani',
  country: 'NG',
  state: 'AN',
  stateName: 'Anambra',
  lga: 'Ogbaru',
  lgaCode: 'OGB',
  scheme: 'Niger View Layout',
  water: 'River Niger',
  gridBearing: 90,                    // grid north points true east
  origin: Object.freeze(geoToWorld(6.017, 6.75)),
  bounds: Object.freeze({ minX: -250, maxX: 250, minZ: -480, maxZ: 185 }),
  spawn: Object.freeze({ x: -34, z: 101, heading: 0 }),
  government: Object.freeze({
    state: Object.freeze({ code: 'NG-AN', name: 'Anambra State Government', short: 'Anambra State' }),
    local: Object.freeze({ code: 'NG-AN-OGB', name: 'Ogbaru Local Government', short: 'Ogbaru Local Government' }),
  }),
  dish: 'Rice and fresh fish stew',
  playerName: 'Nonso Obi',
});

export function zoneToGeo(x, z) {
  const t = gridToTrue(x, z, ZONE.gridBearing);
  return worldToGeo(ZONE.origin.x + t.e, ZONE.origin.z + t.s);
}

// The river bank, as the grid z at which the water starts for a given grid x.
export function zoneShoreZ(x) {
  return 150 + 5 * Math.sin(x / 37) + 3 * Math.sin(x / 11 + 1);
}

export const ZONE_JETTY = Object.freeze({ x0: 18, x1: 24, z0: 136, z1: 182 });

// The river, for swimming: from just past the bank out to the edge of the map, and not where the jetty stands.
export function zoneSwimmable(x, z) {
  const b = ZONE.bounds;
  if (x < b.minX + 1 || x > b.maxX - 1 || z > b.maxZ - 1.5) return false;
  if (z < zoneShoreZ(x) - 0.2) return false;
  if (x > ZONE_JETTY.x0 - 0.4 && x < ZONE_JETTY.x1 + 0.4 && z > ZONE_JETTY.z0 - 0.4 && z < ZONE_JETTY.z1 + 0.4) return false;
  return true;
}
// How far a point on land is from the water's edge, in metres along the grid's z (negative: in the water).
export const zoneToWater = (x, z) => zoneShoreZ(x) - z;

const road = (id, name, x0, z0, x1, z1, surface) => Object.freeze({ id, name, x0, z0, x1, z1, surface });
export const ZONE_ROADS = Object.freeze([
  road('waterside', 'Waterside Road', -250, 108, 250, 118, 'asphalt'),
  road('market', 'Market Road', -5, -216, 5, 118, 'asphalt'),
  road('registry', 'Registry Road', -240, -45, 240, -35, 'asphalt'),
  road('yard', 'Yard Lane', -120, -145, 198, -137, 'laterite'),
  road('close', 'Layout Close', 5, -216, 198, -208, 'laterite'),
  road('link', 'Link Road', 190, -208, 198, -145, 'laterite'),
  ...TOWN_ROADS,
]);

const building = (id, kind, sign, x, z, w, d, h, door, wall, roof) => Object.freeze({ id, kind, sign, x, z, w, d, h, door, wall, roof });
export const ZONE_BUILDINGS = Object.freeze([
  building('registry', 'government', 'LANDS REGISTRY', 48, -70, 26, 16, 4.4, 's', 0xe9dfc8, 0x7a2f22),
  building('secretariat', 'government', 'OGBARU LOCAL GOVT SECRETARIAT', -48, -70, 24, 15, 4.4, 's', 0xd9e2d0, 0x355e3b),
  building('police', 'government', 'POLICE POST', -40, -14, 13, 9, 3.4, 'n', 0xcfd8e6, 0x24364f),
  building('clinic', 'service', 'COMMUNITY CLINIC', 46, -12, 18, 11, 3.6, 'n', 0xf2f0ea, 0x2f6f73),
  building('school', 'service', 'NIGER VIEW TECHNICAL SCHOOL', -140, -72, 32, 11, 3.6, 's', 0xf0d9a4, 0x8a4b2a),
  building('yardshed', 'business', 'UDEH BLOCK INDUSTRY', -95, -186, 14, 8, 3.2, 's', 0xb9b3a6, 0x6e7378),
  building('store', 'business', 'NWOSU BUILDING MATERIALS', 30, 6, 14, 9, 3.4, 's', 0xd8c7a0, 0x5b6b7a),
  building('kitchen', 'business', 'MAMA NKECHI KITCHEN', 64, 6, 10, 8, 3.0, 's', 0xe8b98a, 0x9b3b2e),
  building('home1', 'home', '', -120, 96, 9, 7, 3.0, 's', 0xdcc9a8, 0x7d7f83),
  building('home2', 'home', '', -150, 96, 9, 7, 3.0, 's', 0xc9d6c3, 0x8b4a33),
  building('home3', 'home', '', -180, 96, 9, 7, 3.0, 's', 0xe6d3b8, 0x5f6a72),
  building('home4', 'home', '', -210, 96, 9, 7, 3.0, 's', 0xd6c2c2, 0x7a2f22),
  building('home5', 'home', '', 120, 96, 9, 7, 3.0, 's', 0xcfd9df, 0x8b4a33),
  building('home6', 'home', '', 150, 96, 9, 7, 3.0, 's', 0xe3d6a8, 0x5f6a72),
  building('home7', 'home', '', 180, 96, 9, 7, 3.0, 's', 0xd9c7b0, 0x355e3b),
  // HOLARIS Watch (October 2026): three storeys of glass on open ground north of the motor park, west of Market
  // Road. It is drawn by its own code (render-holaris.js), not as a walled building with a pitched roof.
  building('holaris', 'showroom', 'HOLARIS WATCH', -26, 44, 16, 12, 12.6, 's', 0x9fd3e6, 0x16222b),
  ...TOWN_BUILDINGS,
]);

// The wider town: houses, trade sheds, and the walled institutions with the
// buildings people can walk into.
export const ZONE_HOUSES = TOWN_HOUSES;
export const ZONE_SHEDS = TOWN_SHEDS;
export const ZONE_COMPOUNDS = TOWN_COMPOUNDS;
export const ZONE_FARMLAND = TOWN_FARMLAND;
export const ZONE_RANKS = TOWN_RANKS;
export const ZONE_STOPS = TOWN_STOPS;
export const ZONE_SOUNDS = TOWN_SOUNDS;
export const ZONE_NOTICES = TOWN_NOTICES;

// Shops that sell through the market every player shares. `marker` is where a buyer stands to deal: the pink
// column before the door. `attendant` is where the shop's own person stands.
export const ZONE_SHOPS = Object.freeze([
  Object.freeze({ id: 'holaris', name: 'HOLARIS Watch', building: 'holaris', storeys: 3, marker: Object.freeze({ x: -26, z: 55.4 }), attendant: Object.freeze({ x: -23.6, z: 53.1, facing: 0, name: 'HOLARIS attendant', look: Object.freeze({ skin: 0x5a3620, top: 0x14171b, bottom: 0x14171b, build: 1, body: 'f', outfit: 'shirt', sleeves: 'long', hair: 'low' }) }) }),
]);
export function zoneShop(id) {
  return ZONE_SHOPS.find((s) => s.id === id) || null;
}

export function zoneBuilding(id) {
  return ZONE_BUILDINGS.find((b) => b.id === id) || null;
}

// Where a player stands to be served, the hours, and who has to be at their post.
const service = (id, name, x, z, opens, closes, staff, jurisdiction) => Object.freeze({ id, name, x, z, opens, closes, staff, jurisdiction });
export const ZONE_SERVICES = Object.freeze([
  service('registry', 'Lands Registry', 48, -60, 8, 16, 'lands', 'NG-AN'),
  service('secretariat', 'Local Government Secretariat', -48, -60.5, 8, 16, 'clerk', 'NG-AN-OGB'),
  service('police', 'Police Post', -40, -20.5, 0, 24, 'sergeant|corporal', 'NG'),
  service('clinic', 'Community Clinic', 46, -19.5, 7, 21, 'nurse', null),
  // the emergency entrance of the General Hospital: always open, and staffed by the hospital's own people, not by one named resident
  service('hospital', 'Atani General Hospital', -144, 5.6, 0, 24, '', 'NG-AN'),
  service('school', 'Niger View Technical School', -140, -64.5, 8, 14, 'instructor', null),
  service('yard', 'Udeh Block Industry', -95, -180, 7, 18, 'yardowner', null),
  service('store', 'Nwosu Building Materials', 30, 12.5, 7, 19, 'trader', null),
  service('kitchen', 'Mama Nkechi Kitchen', 64, 12, 7, 20, 'cook', null),
  service('park', 'Okoye Keke Hire and Sales', -33.5, 97.6, 7, 19, 'rider', null),
]);

export function zoneService(id) {
  return ZONE_SERVICES.find((s) => s.id === id) || null;
}

export const ZONE_MOULD_STATIONS = Object.freeze([
  Object.freeze({ id: 'mould-1', x: -72, z: -165, standX: -72, standZ: -163.4, reservedFor: null }),
  Object.freeze({ id: 'mould-2', x: -66, z: -165, standX: -66, standZ: -163.4, reservedFor: null }),
  Object.freeze({ id: 'mould-3', x: -60, z: -165, standX: -60, standZ: -163.4, reservedFor: 'moulder' }),
]);

export const ZONE_BENCHES = Object.freeze([
  Object.freeze({ id: 'bench-park', x: -28, z: 104.5, facing: 0 }),
  Object.freeze({ id: 'bench-market', x: 9, z: 66, facing: Math.PI / 2 }),
  Object.freeze({ id: 'bench-registry', x: 22, z: -50, facing: 0 }),
  Object.freeze({ id: 'bench-shore', x: 44, z: 134, facing: 0 }),
]);

export const ZONE_STALLS = Object.freeze([32, 44, 76, 88].flatMap((z) => [18, 30, 56, 68].map((x) => Object.freeze({ x, z }))));

// Parked scenery. The coaches stand at the motor park; the kekes here belong
// to townspeople and are parked on the verges. Neither moves. (The kekes a
// player can hire, buy and drive are not scenery: the simulation owns those,
// see ZONE_VEHICLE_BAYS.) Coaches and kekes stand square to the grid, so the
// box someone on foot walks round is exact.
const parked = (kind, n, x, z, heading, look) => Object.freeze({ kind, x, z, heading, plate: `OGB ${String(900 + n).padStart(3, '0')} AN`, look: Object.freeze(look) });
export const ZONE_VEHICLES = Object.freeze([
  parked('bus', 1, -72, 86, 0, { ...busLook(1), wear: 0.1, dirt: 0.2 }),          // green over white, as the coach was designed
  parked('bus', 2, -66.5, 86, 0, { ...busLook(0), advert: { head: 'NWOSU BUILDING MATERIALS', line: 'Cement · Roofing · Doors · Paint', ground: 0xf3ecdc, ink: 0x1f2f6b } }),
  parked('bus', 3, -50, 80, Math.PI / 2, { ...busLook(2), advert: { head: 'MAMA NKECHI KITCHEN', line: 'Hot food by the market', ground: 0x7a1f1c, ink: 0xf3ecdc } }),
  parked('keke', 11, 7.4, 40, 0, kekeLook(3)),
  parked('keke', 12, -7.4, 6, Math.PI, kekeLook(4)),
  parked('keke', 13, -7.4, 62, Math.PI, kekeLook(5)),
  parked('keke', 14, 30, -32.4, Math.PI / 2, kekeLook(6)),
  parked('keke', 15, -60, -32.4, -Math.PI / 2, kekeLook(7)),
  parked('keke', 16, -185, -30.6, Math.PI / 2, kekeLook(8)),
  parked('keke', 17, -99, -51, Math.PI / 2, kekeLook(9)),
  parked('keke', 18, 158, -30.6, -Math.PI / 2, kekeLook(10)),
  parked('keke', 19, 7.4, -250, 0, kekeLook(11)),
  parked('keke', 20, -40, 72, Math.PI / 2, kekeLook(12)),
  parked('keke', 21, 60, 105.8, Math.PI / 2, kekeLook(13)),
  Object.freeze({ kind: 'pickup', x: -110, z: -160, heading: Math.PI / 2 }),
  Object.freeze({ kind: 'canoe', x: 15, z: 160, heading: 0.3 }),
  Object.freeze({ kind: 'canoe', x: 28, z: 168, heading: -0.4 }),
  Object.freeze({ kind: 'canoe', x: 60, z: 158, heading: 1.1 }),
  Object.freeze({ kind: 'canoe', x: -40, z: 163, heading: 1.4 }),
]);

// Where kekes stand at the motor park. The dealer's hire fleet takes the first
// bays; a newly bought keke is handed over in the next free one.
export const ZONE_VEHICLE_BAYS = Object.freeze([
  Object.freeze({ x: -29, z: 91.5, heading: Math.PI / 2 }),
  Object.freeze({ x: -36, z: 86.5, heading: Math.PI / 2 }),
  Object.freeze({ x: -22, z: 86.5, heading: Math.PI / 2 }),
  Object.freeze({ x: -29, z: 81.5, heading: Math.PI / 2 }),
  Object.freeze({ x: -20, z: 78, heading: Math.PI / 2 }),
]);
export const ZONE_FLEET = Object.freeze({ dealer: 'rider', hireCount: 2, madeIn: 'Nnewi', name: 'Okoye Keke Hire' });

// Delivery runs a keke rider can take. Each is posted at its hour every day,
// paid for by the one who needs the goods moved, on delivery.
const run = (id, hour, what, from, to, payer, fee) => Object.freeze({ id, hour, what, from: Object.freeze(from), to: Object.freeze(to), payer, fee });
export const ZONE_RUNS = Object.freeze([
  run('fish', 6.5, 'Baskets of fresh fish', { x: 21, z: 128, label: 'the jetty' }, { x: 64, z: 20, label: 'Mama Nkechi Kitchen' }, 'business:kitchen', 180),
  run('medicine', 8.5, 'Cartons of medicine off the Onitsha bus', { x: -42, z: 78, label: 'the motor park' }, { x: 46, z: -27, label: 'the clinic' }, 'business:clinic', 200),
  run('cloth', 9.5, 'Bales of cloth off the Onitsha bus', { x: -42, z: 78, label: 'the motor park' }, { x: 12, z: 58, label: 'the market gate' }, 'resident:clothseller', 160),
  run('yam', 11, 'Yam from the farms', { x: -112, z: -141, label: 'the farm end of Yard Lane' }, { x: 12, z: 58, label: 'the market gate' }, 'resident:produce', 220),
  run('books', 14.5, 'Exercise books and chalk', { x: -42, z: 78, label: 'the motor park' }, { x: -140, z: -55, label: 'the technical school' }, 'business:school', 200),
  run('files', 16, 'Council files for the land office', { x: -48, z: -50, label: 'the secretariat' }, { x: 48, z: -50, label: 'the Lands Registry' }, 'government:local', 120),
]);

export const ZONE_LAMPS = Object.freeze([
  [-7, 100], [7, 60], [-7, 20], [7, -20], [-7, -60], [7, -100], [-7, -150], [7, -190],
  [-60, 106], [-130, 106], [-200, 106], [70, 106], [140, 106],
  [-90, -47], [-160, -47], [90, -33], [150, -33],
  [60, -147], [130, -147], [-60, -147],
].map(([x, z]) => Object.freeze({ x, z })));

// Scenery the renderer draws that is particular to this town, and how the
// town looks: its earth, its water, what stands on the far bank.
export const ZONE_PROPS = Object.freeze({
  shelter: Object.freeze({ x: -50, z: 68, sign: 'ATANI MOTOR PARK' }),
  sandHeaps: Object.freeze([[-78, -172, 3.4, 1.9], [-84, -168, 2.2, 1.2]]),
  yardApron: Object.freeze({ x: -101, z: -179.6 }),
  worn: Object.freeze([[44, 58, 62], [-44, 82, 40], [-80, -175, 44]]),   // trodden earth: x, z, radius
  earth: 0xb4532b,                    // red laterite
  laterite: 0xa44a2a,
  water: Object.freeze({ day: 0x7d8a62, night: 0x1c2630, dull: 0x6f7868, width: 150 }),   // a wide brown river, with a far bank
  startCamera: Object.freeze({ x: 10, z: -10 }),
  // Map labels: text, grid x, grid z, alignment on a north-up map.
  mapLabels: Object.freeze([
    ['Lands Registry', 68, -70, 'center'], ['Secretariat', -48, -82, 'left'], ['Police', -40, -4, 'right'], ['Clinic', 46, -3, 'right'],
    ['Technical School', -140, -82, 'left'], ['Block yard', -95, -195, 'left'], ['Market', 43, 60, 'center'], ['Motor park', -46, 74, 'center'],
    ['River Niger', 0, 170, 'vertical'], ['Niger View Layout', 214, -177, 'center'],
    ['General Hospital', -175, 54, 'center'], ['Primary School', 157, 54, 'center'], ['Secondary School', 160, -134, 'center'],
    ['Catholic Church', -91, -136, 'center'], ['Anglican Church', -201, -124, 'center'], ['University', 127, -226, 'center'],
    ['Polytechnic', -84, -226, 'center'], ['College of Education', 90, -471, 'center'], ['Farms', -200, -476, 'center'],
  ]),
});

// ---------------------------------------------------------------------------
// Parcels. The surveyed layout inland of the town centre.
// ---------------------------------------------------------------------------

export const ZONING = Object.freeze({
  R1: Object.freeze({ code: 'R1', name: 'Residential', uses: ['house'], pricePerM2: 20 }),
  C1: Object.freeze({ code: 'C1', name: 'Commercial', uses: ['kiosk'], pricePerM2: 50 }),
  A1: Object.freeze({ code: 'A1', name: 'Agricultural', uses: [], pricePerM2: 4 }),
});

function parcel(serial, plot, zoning, x0, z0, x1, z1, frontage) {
  const area = Math.round((x1 - x0) * (z1 - z0));
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const geo = zoneToGeo(cx, cz);
  return Object.freeze({
    id: `${ZONE.country}-${ZONE.state}-${ZONE.lgaCode}-${String(serial).padStart(6, '0')}`,
    plot, scheme: ZONE.scheme, zoning, x0, z0, x1, z1, cx, cz, area, frontage,
    lat: Number(geo.lat.toFixed(5)), lon: Number(geo.lon.toFixed(5)),
    price: area * ZONING[zoning].pricePerM2,
  });
}

// `frontage` names the grid side of the plot that meets its road.
function buildParcels() {
  const list = [];
  let serial = 100;
  for (let i = 0; i < 8; i += 1) list.push(parcel(serial += 1, `R-${String(i + 1).padStart(2, '0')}`, 'R1', 30 + i * 20, -177, 50 + i * 20, -147, 'south'));
  for (let i = 0; i < 8; i += 1) list.push(parcel(serial += 1, `R-${String(i + 9).padStart(2, '0')}`, 'R1', 30 + i * 20, -207, 50 + i * 20, -177, 'north'));
  for (let i = 0; i < 3; i += 1) list.push(parcel(serial += 1, `C-0${i + 1}`, 'C1', -27, -132 + i * 15, -7, -117 + i * 15, 'east'));
  for (let i = 0; i < 3; i += 1) list.push(parcel(serial += 1, `C-0${i + 4}`, 'C1', 7, -132 + i * 15, 27, -117 + i * 15, 'west'));
  list.push(parcel(serial += 1, 'A-01', 'A1', -240, -270, -160, -200, 'east'));
  list.push(parcel(serial += 1, 'A-02', 'A1', -240, -195, -160, -125, 'east'));
  return Object.freeze(list);
}
export const ZONE_PARCELS = buildParcels();

export function zoneParcel(id) {
  return ZONE_PARCELS.find((p) => p.id === id) || null;
}

export function zoneParcelByPlot(plot) {
  return ZONE_PARCELS.find((p) => p.plot === plot) || null;
}

// Where the structure sits on a plot, and where people stand to work on it.
export function zoneSiteLayout(p) {
  const pad = { x: p.cx, z: p.cz };
  if (p.frontage === 'south') return { pad, board: { x: p.cx - 6, z: p.z1 - 1.5 }, road: { x: p.cx, z: -141 }, work: { x: p.cx + 4.5, z: p.cz + 4 }, facing: 's' };
  if (p.frontage === 'north') return { pad, board: { x: p.cx - 6, z: p.z0 + 1.5 }, road: { x: p.cx, z: -212 }, work: { x: p.cx + 4.5, z: p.cz - 4 }, facing: 'n' };
  if (p.frontage === 'east') return { pad, board: { x: p.x1 - 1.5, z: p.cz - 5 }, road: { x: 0, z: p.cz }, work: { x: p.cx + 5, z: p.cz + 3.5 }, facing: 'e' };
  return { pad, board: { x: p.x0 + 1.5, z: p.cz - 5 }, road: { x: 0, z: p.cz }, work: { x: p.cx - 5, z: p.cz + 3.5 }, facing: 'w' };
}

// Land that residents already hold when the world begins, so the register is
// not empty on day one. `stage` 5 is a finished house.
export const ZONE_ALLOCATIONS = Object.freeze([
  Object.freeze({ plot: 'R-03', resident: 'lands', design: 'house', stage: 5, paint: 'river' }),
  Object.freeze({ plot: 'R-12', resident: 'yardowner', design: 'house', stage: 1, labour: 4 }),
  Object.freeze({ plot: 'C-02', resident: 'trader' }),
]);

// ---------------------------------------------------------------------------
// Walking graph for residents.
// ---------------------------------------------------------------------------

const BASE_NODES = ({
  mk_s: [0, 113], mk_m: [0, 60], mk_x: [0, -40], mk_y: [0, -141], mk_n: [0, -212],
  mar_w1: [-40, 113], mar_w2: [-120, 113], mar_w3: [-150, 113], mar_w4: [-180, 113], mar_w5: [-210, 113],
  mar_e0: [21, 113], mar_e1: [120, 113], mar_e2: [150, 113], mar_e3: [180, 113],
  park: [-40, 99], jetty_a: [21, 140], jetty_b: [21, 174],
  h1: [-120, 101.5], h2: [-150, 101.5], h3: [-180, 101.5], h4: [-210, 101.5], h5: [120, 101.5], h6: [150, 101.5], h7: [180, 101.5],
  market_gate: [11, 60], ma_w: [30, 60], market_mid: [43, 60], ma_e: [56, 60], market_n: [43, 13.5],
  store_door: [30, 13.5], kitchen_door: [64, 13.5], stall_w: [30, 47.5], stall_e: [56, 47.5], stall_s: [56, 72.5],
  rr_e1: [48, -40], rr_p: [-40, -40], rr_w1: [-48, -40], rr_s: [-140, -40],
  reg_door: [48, -58.5], clinic_door: [46, -21.5], police_door: [-40, -22], sec_door: [-48, -58.5], school_door: [-140, -62.5],
  yard_gate: [-95, -141], yard_in: [-95, -160], yard_shed: [-95, -179], mould_n: [-63, -161.5],
  r03_gate: [80, -141], r03_door: [80, -146.2], yl_e1: [112, -141], yl_e2: [194, -141],
  sc_e: [194, -212], sc_m: [100, -212], r12_site: [100, -206.5],
});

const BASE_EDGES = ([
  ['mar_w5', 'mar_w4'], ['mar_w4', 'mar_w3'], ['mar_w3', 'mar_w2'], ['mar_w2', 'mar_w1'], ['mar_w1', 'mk_s'],
  ['mk_s', 'mar_e0'], ['mar_e0', 'mar_e1'], ['mar_e1', 'mar_e2'], ['mar_e2', 'mar_e3'],
  ['h1', 'mar_w2'], ['h2', 'mar_w3'], ['h3', 'mar_w4'], ['h4', 'mar_w5'], ['h5', 'mar_e1'], ['h6', 'mar_e2'], ['h7', 'mar_e3'],
  ['park', 'mar_w1'], ['mar_e0', 'jetty_a'], ['jetty_a', 'jetty_b'],
  ['mk_s', 'mk_m'], ['mk_m', 'mk_x'], ['mk_x', 'mk_y'], ['mk_y', 'mk_n'],
  ['mk_m', 'market_gate'], ['market_gate', 'ma_w'], ['ma_w', 'market_mid'], ['market_mid', 'ma_e'], ['market_mid', 'market_n'],
  ['market_n', 'store_door'], ['market_n', 'kitchen_door'], ['ma_w', 'stall_w'], ['ma_e', 'stall_e'], ['ma_e', 'stall_s'],
  ['mk_x', 'rr_e1'], ['rr_e1', 'reg_door'], ['rr_e1', 'clinic_door'],
  ['mk_x', 'rr_p'], ['rr_p', 'rr_w1'], ['rr_w1', 'rr_s'], ['rr_p', 'police_door'], ['rr_w1', 'sec_door'], ['rr_s', 'school_door'],
  ['mk_y', 'yard_gate'], ['yard_gate', 'yard_in'], ['yard_in', 'yard_shed'], ['yard_in', 'mould_n'],
  ['mk_y', 'r03_gate'], ['r03_gate', 'r03_door'], ['r03_gate', 'yl_e1'], ['yl_e1', 'yl_e2'], ['yl_e2', 'sc_e'], ['sc_e', 'sc_m'], ['sc_m', 'mk_n'], ['sc_m', 'r12_site'],
]);

// Named places a resident can be sent to: the graph node to walk to, then the
// exact spot to stand on. `inside` means the resident goes indoors and is not drawn.
const place = (node, x, z, facing, inside = false) => Object.freeze({ node, x, z, facing, inside });
export const ZONE_PLACES = Object.freeze({
  home_r03: place('r03_door', 80, -158.6, 0, true),
  home1: place('h1', -120, 100.3, 0, true), home2: place('h2', -150, 100.3, 0, true), home3: place('h3', -180, 100.3, 0, true),
  home4: place('h4', -210, 100.3, 0, true), home5: place('h5', 120, 100.3, 0, true), home6: place('h6', 150, 100.3, 0, true), home7: place('h7', 180, 100.3, 0, true),
  registry: place('reg_door', 50.2, -60.4, 0), secretariat: place('sec_door', -45.8, -60.9, 0),
  police: place('police_door', -37.8, -20.1, Math.PI), clinic: place('clinic_door', 48.2, -19.2, Math.PI),
  school: place('school_door', -137.8, -64.9, 0), yard: place('yard_shed', -92.8, -180.4, 0),
  mould3: place('mould_n', -60, -163.4, Math.PI), yard_idle: place('yard_in', -86, -157, 1.2),
  store: place('store_door', 32.2, 12.1, 0), kitchen: place('kitchen_door', 66.2, 11.6, 0),
  stall_cloth: place('stall_w', 30, 46.4, 0), stall_produce: place('stall_e', 56, 46.4, 0), stall_fish: place('stall_s', 56, 73.6, Math.PI),
  park: place('park', -35, 95.5, 0.6), jetty: place('jetty_b', 21, 176.5, 0),
  survey: place('yl_e1', 112, -135.6, Math.PI), r12: place('r12_site', 104.5, -196, 0),
  lunch_a: place('kitchen_door', 60, 14.5, 0.4), lunch_b: place('kitchen_door', 68.5, 15, -0.5), lunch_c: place('market_n', 47, 15.5, 0.2),
  stroll_market: place('ma_w', 36, 62.5, 1.0), stroll_shore: place('mar_e0', 30, 124, 0), stroll_cross: place('mk_x', 3.5, -30, 2.2),
});

// ---------------------------------------------------------------------------
// Residents. Ids are roles, so the rules can refer to "the mason" in any town.
// A schedule time is when the resident should ARRIVE at a place, unless the
// entry is marked 'leave', in which case it is when they set off.
// ---------------------------------------------------------------------------

const resident = (id, name, short, role, employer, look, schedule, talk, service = null) => Object.freeze({ id, name, short, role, employer, look, schedule, talk, service });
// What a resident looks like: skin, shirt and lower-garment colours, build,
// then the rest: body ('m' or 'f'), outfit, sleeves, hair, hat [kind, colour],
// face, beard, shoes, and cloth patterns. The renderer turns this into a figure.
const look = (skin, top, bottom, build = 1, more = {}) => Object.freeze({ skin, top, bottom, build, ...more });

export const ZONE_RESIDENTS = Object.freeze([
  resident('lands', 'Ifeoma Okonkwo', 'Mrs Okonkwo', 'Lands officer', 'gov:NG-AN', look(0x6b4226, 0x1f5c4d, 0x1f5c4d, 1, { body: 'f', outfit: 'wrapper', hat: ['headtie', 0x1f5c4d], hair: 'low', pattern: { colours: [0x14402f, 0xd9a441, 0xf3ecdc], motif: 'leaves' }, shoes: 'sandal', height: 0.97 }),
    [['07:50', 'registry'], ['16:05', 'stroll_market', 'leave'], ['17:45', 'home_r03', 'leave']], {
      about: 'Every plot in the Niger View Layout is surveyed and numbered. The registry holds the record of who owns each one, and every sale is written into it.',
      tip: 'Walk the layout first and read the survey boards. When you know the plot you want, come back and I will register it in your name.',
    }, 'registry'),
  resident('clerk', 'Obinna Nwankwo', 'Mr Nwankwo', 'Secretariat clerk', 'gov:NG-AN-OGB', look(0x4a2c17, 0xe8e2d0, 0x3a3f4b, 1.05, { body: 'm', outfit: 'shirt', sleeves: 'long', hair: 'low' }),
    [['07:50', 'secretariat'], ['16:05', 'stroll_cross', 'leave'], ['17:30', 'home1', 'leave']], {
      about: 'The secretariat issues building permits and keeps the council accounts. The accounts are public. Ask and I will show you.',
      tip: 'Nobody may build without a permit, and the permit has to match the zoning of the plot.',
    }, 'secretariat'),
  resident('sergeant', 'Sgt. Musa Ibrahim', 'Sgt. Ibrahim', 'Police sergeant, day shift', 'gov:NG-AN-OGB', look(0x5a3a22, 0x1d2233, 0x1d2233, 1.1, { body: 'm', outfit: 'uniform', hat: ['beret', 0x10182a], hair: 'low', beard: true, height: 1.03 }),
    [['06:50', 'police'], ['19:05', 'home2', 'leave']], {
      about: 'Atani is quiet. If something goes wrong, report it here and it goes on the record with a number.',
      tip: 'A report is evidence. Keep the number.',
    }, 'police'),
  resident('corporal', 'Cpl. Ebiere Okon', 'Cpl. Okon', 'Police corporal, night shift', 'gov:NG-AN-OGB', look(0x7a4a2b, 0x1d2233, 0x1d2233, 0.98, { body: 'f', outfit: 'uniform', hat: ['beret', 0x10182a], hair: 'bun', height: 0.98 }),
    [['18:55', 'police'], ['07:05', 'home5', 'leave']], {
      about: 'I hold the post at night. The lamps on Market Road help.',
      tip: 'Most offices are shut until eight. The clinic keeps longer hours.',
    }, 'police'),
  resident('nurse', 'Nurse Chiamaka Obi', 'Nurse Obi', 'Clinic nurse', 'biz:clinic', look(0x5c3a21, 0xf4f4f0, 0xf4f4f0, 0.97, { body: 'f', outfit: 'gown', hat: ['nursecap', 0xf4f4f0], hair: 'bun', shoeColour: 0xf4f4f0, height: 0.96 }),
    [['06:50', 'clinic'], ['21:05', 'home5', 'leave']], {
      about: 'We treat exhaustion, fevers and injuries. Treatment is paid for at the desk.',
      tip: 'Eat properly and rest. Most of the labourers I see only needed a meal and a bench.',
    }, 'clinic'),
  resident('instructor', 'Uchenna Ezeani', 'Mr Ezeani', 'Trade instructor', 'biz:school', look(0x3d2314, 0xb5651d, 0xb5651d, 1.0, { body: 'm', outfit: 'kaftan', hair: 'grey', face: 'elder', height: 1.0 }),
    [['07:45', 'school'], ['14:10', 'stroll_shore', 'leave'], ['17:00', 'home3', 'leave']], {
      about: 'The school runs a block-laying certificate. One afternoon of instruction and you will lay a course in half the time.',
      tip: 'Classes run from eight until two.',
    }, 'school'),
  resident('yardowner', 'Ikenna Udeh', 'Mr Udeh', 'Block yard owner', 'biz:yard', look(0x4f3019, 0x8a8f96, 0x8a8f96, 1.15, { body: 'm', outfit: 'kaftan', hat: ['redcap', 0xa01c1c], hair: 'low', beard: true, height: 1.02 }),
    [['06:50', 'yard'], ['18:05', 'home4', 'leave']], {
      about: 'Sharp sand from the Niger, cement, water and labour go in. Nine-inch blocks come out. I pay by the block and I sell by the block.',
      tip: 'Take a free mould and start. The wage is paid the moment the block is turned out.',
    }, 'yard'),
  resident('trader', 'Emeka Nwosu', 'Mr Nwosu', 'Building materials trader', 'biz:store', look(0x6a4429, 0x2f4f7f, 0x2a2a2a, 1.05, { body: 'm', outfit: 'shirt', hair: 'low' }),
    [['06:50', 'store'], ['13:00', 'lunch_c', 'leave'], ['13:40', 'store', 'leave'], ['19:05', 'home6', 'leave']], {
      about: 'Cement, roofing sheets, doors, windows and paint. I deliver to any plot in the layout.',
      tip: 'I can only deliver to a plot you own. Buy the land before the cement.',
    }, 'store'),
  resident('cook', 'Nkechi Okeke', 'Mama Nkechi', 'Cook and owner, Mama Nkechi Kitchen', 'biz:kitchen', look(0x5a3620, 0xd9a441, 0x6b2d3a, 1.12, { body: 'f', outfit: 'wrapper', hat: ['headtie', 0xd9a441], hair: 'low', pattern: { colours: [0x6b2d3a, 0xd9a441, 0xf3ecdc], motif: 'rings' }, shoes: 'sandal', height: 0.95 }),
    [['06:40', 'kitchen'], ['20:05', 'home7', 'leave']], {
      about: 'Rice from the farms here with fresh fish stew, nsala with pounded yam, onugbu soup. The market eats here at one o\'clock, and I send plates to the offices.',
      tip: 'Hard work on an empty stomach does not last. Sit, eat, then go back.',
    }, 'kitchen'),
  resident('mason', 'Sunday Akpan', 'Mr Akpan', 'Mason for hire', 'self', look(0x4a2f1c, 0x9c6b3f, 0x4a4a3a, 1.1, { body: 'm', outfit: 'shirt', hat: ['helmet', 0xe07b1a], hair: 'low', shoeColour: 0x4a3524 }),
    [['06:55', 'yard_idle'], ['18:05', 'home1', 'leave']], {
      about: 'Foundations, walls, roofs. I am paid per stage, in advance, and I do not lay blocks in the rain.',
      tip: 'Hire me from the board on your own plot once your materials are on site.',
    }),
  resident('moulder', 'Chidi Okafor', 'Chidi', 'Block moulder', 'biz:yard', look(0x70482c, 0x3c6e47, 0x3a3a3a, 1.0, { body: 'm', outfit: 'singlet', hair: 'low', legs: 'shorts', shoes: 'sandal' }),
    [['06:55', 'mould3'], ['18:05', 'home6', 'leave']], {
      about: 'Fill the mould, tamp it, turn it out. Then again. The stack behind me is this week.',
      tip: 'The first two moulds are free. This one is mine.',
    }),
  resident('fisher', 'Nnamdi Osakwe', 'Mr Osakwe', 'Fisherman', 'self', look(0x3b2415, 0x2d5f73, 0x2a2a2a, 1.0, { body: 'm', outfit: 'shirt', hat: ['strawhat', 0xc9b183], hair: 'low', legs: 'shorts', shoes: 'sandal', beard: true }),
    [['05:40', 'jetty'], ['11:20', 'stall_fish', 'leave'], ['13:05', 'lunch_a', 'leave'], ['13:45', 'stall_fish', 'leave'], ['18:20', 'home5', 'leave']], {
      about: 'Out on the river before light, back before noon, then I sell what the Niger gave.',
      tip: 'When the rain comes hard nobody goes out. You pull the canoe up and wait.',
    }),
  resident('clothseller', 'Adaeze Ilodibe', 'Madam Adaeze', 'Cloth trader', 'self', look(0x6f4a30, 0x7b2d5b, 0x7b2d5b, 1.02, { body: 'f', outfit: 'wrapper', hat: ['headtie', 0x2e6f73], hair: 'low', pattern: { colours: [0x5a1f47, 0x2e9fa3, 0xf2c200], motif: 'diamonds' }, shoes: 'sandal', height: 0.98 }),
    [['06:50', 'stall_cloth'], ['13:00', 'lunch_b', 'leave'], ['13:40', 'stall_cloth', 'leave'], ['19:05', 'home2', 'leave']], {
      about: 'George wrappers, Akwete cloth, ankara, lace for occasions. The george goes first when a wedding is coming.',
      tip: 'The council takes a small levy from every stall each day. It is in their accounts.',
    }),
  resident('produce', 'Ogechi Nwabueze', 'Madam Ogechi', 'Yam and produce seller', 'self', look(0x5e3b24, 0x2f6f4f, 0x44352a, 0.98, { body: 'f', outfit: 'wrapper', hat: ['headtie', 0xe0d6c3], hair: 'low', pattern: { colours: [0x44352a, 0xe67e22, 0xf3ecdc], motif: 'rings' }, shoes: 'sandal', height: 0.94 }),
    [['06:50', 'stall_produce'], ['13:10', 'lunch_c', 'leave'], ['13:50', 'stall_produce', 'leave'], ['19:05', 'home7', 'leave']], {
      about: 'Yam, cassava and garri from the farms along the river. Oranges and pawpaw when the lorry comes.',
      tip: 'The two big plots out past the school are farmland. Nobody has taken them yet.',
    }),
  resident('rider', 'Ifeanyi Okoye', 'Ifeanyi', 'Keke rider and dealer', 'self', look(0x4b2e1b, 0xb8860b, 0x2a2a2a, 1.0, { body: 'm', outfit: 'shirt', hat: ['facecap', 0x1b1b1e], hair: 'low' }),
    [['06:30', 'park'], ['13:20', 'lunch_a', 'leave'], ['14:10', 'park', 'leave'], ['19:40', 'home3', 'leave']], {
      about: 'This is the motor park. Buses for Onitsha and Awka leave from here, when there are roads to take them. The kekes are mine: I hire them out by the day, and I can bring a new one down from Nnewi if you want your own.',
      tip: 'A rider with a keke never lacks work. Look at the runs on your phone: fish from the jetty, cartons off the bus, yam from the farms.',
    }, 'park'),
  resident('surveyor', 'Surv. Ngozi Eze', 'Surv. Eze', 'Registered surveyor', 'self', look(0x65402a, 0xf2c200, 0x2c3440, 1.0, { body: 'f', outfit: 'hivis', sleeves: 'long', hat: ['helmet', 0xf5f5f5], hair: 'braids', height: 0.99 }),
    [['07:30', 'survey'], ['17:00', 'stroll_cross', 'leave'], ['18:00', 'home6', 'leave']], {
      about: 'I set out this layout: sixteen residential plots, six commercial, two farms. Every corner has a beacon and every plot a board.',
      tip: 'White beacons are plots for sale. Read the board for the size and the price, then go to the registry on Registry Road.',
    }),
]);

export function zoneResident(id) {
  return ZONE_RESIDENTS.find((r) => r.id === id) || null;
}

// Short lines of text that name places in this town.
export const ZONE_TEXT = Object.freeze({
  arrival: 'You step down from the bus at Atani motor park. Market Road runs east from here, away from the river.',
  // the opening words on the character screen, one paragraph each, as the owner wrote them
  story: Object.freeze([
    '15 January 1970. The Civil War has just ended.',
    'You arrive at Atani motor park with nothing but £20 and the ruins of a life you once knew.',
    'East of the market, beyond the River Niger, the land lies untouched—only government buildings remain.',
    'Find work. Buy a plot. Build the first walls. Start again.',
  ]),
  intro: 'You arrive at Atani motor park with nothing. East of the market, away from the Niger, the land is surveyed and unbuilt. Find work, buy a plot, and put up the first walls.',
  toRegistry: 'To buy it, go to the Lands Registry on Registry Road, south of Market Road.',
  materials: 'Blocks come from the yard on Yard Lane; everything else from Nwosu Building Materials by the market.',
  fare: 'Keke fare',
  plate: (n) => `OGB ${String(n).padStart(3, '0')} AN`,
  kitchenFish: 'Fish for the kitchen',
  kitchenProduce: 'Yam and vegetables for the kitchen',
});


// Who lives here, by the work they do: [job, how many, where]. With the named
// residents above this makes a town of one thousand. The jobs themselves, and
// what each does with its day, are not this town's business: see population.js.
export const ZONE_POPULATION = Object.freeze({
  seed: 6017675,
  firstWeekday: 3,                    // day one is a Wednesday
  peoples: Object.freeze([['igbo', 0.82], ['igala', 0.04], ['yoruba', 0.04], ['hausa', 0.04], ['ijaw', 0.02], ['efik', 0.02], ['urhobo', 0.01], ['edo', 0.01]]),
  jobs: Object.freeze([
    ['infant', 90, 'home'], ['pupil', 150, 'primary'], ['student', 120, 'secondary'],
    ['undergrad', 50, 'university'], ['undergrad', 35, 'polytechnic'], ['undergrad', 25, 'college'],
    ['headteacher', 1, 'primary'], ['teacher', 12, 'primary'], ['schoolstaff', 5, 'primary'],
    ['principal', 1, 'secondary'], ['teacher', 14, 'secondary'], ['labtech', 1, 'secondary'], ['schoolstaff', 5, 'secondary'],
    ['lecturer', 7, 'university'], ['officer', 3, 'university'], ['librarian', 1, 'university'], ['guard', 1, 'university'],
    ['lecturer', 4, 'polytechnic'], ['officer', 1, 'polytechnic'], ['guard', 1, 'polytechnic'],
    ['lecturer', 3, 'college'], ['officer', 1, 'college'],
    ['doctor', 5, 'hospital'], ['nurse', 12, 'hospital'], ['pharmacist', 2, 'hospital'], ['labscientist', 1, 'hospital'], ['records', 4, 'hospital'], ['cleaner', 3, 'hospital'], ['guard', 2, 'hospital'], ['ambulance', 1, 'hospital'],
    ['priest', 2, 'catholic'], ['catechist', 1, 'catholic'], ['sexton', 1, 'catholic'], ['churchworker', 2, 'catholic'],
    ['vicar', 1, 'anglican'], ['churchworker', 3, 'anglican'],
    ['trader', 60, 'market'],
    ['tailor', 8, 'street'], ['barber', 8, 'street'], ['mechanic', 6, 'street'], ['carpenter', 6, 'street'], ['welder', 4, 'street'], ['foodvendor', 10, 'street'], ['baker', 2, 'street'],
    ['farmer', 45, 'farm'], ['fisher', 25, 'shore'],
    ['okada', 26, 'park'], ['driver', 12, 'park'],
    ['police', 6, 'police'], ['clerk', 8, 'secretariat'], ['cleaner', 2, 'secretariat'],
    ['labourer', 24, 'yard'], ['apprentice', 16, 'street'], ['hawker', 25, 'street'],
    ['unemployed', 45, 'street'], ['retiree', 45, 'home'], ['homemaker', 30, 'home'],
  ].map(Object.freeze)),
});

// ---------------------------------------------------------------------------
// Solid things. Trees are added last, once the paths are known.
// ---------------------------------------------------------------------------

const boxOf = (x, z, hx, hz) => ({ x0: x - hx, x1: x + hx, z0: z - hz, z1: z + hz });
const YARD_SOLIDS = { generator: [1.2, 0.9], tank: [0.8, 0.8], swing: [1.6, 0.5], slide: [0.6, 1.8], seesaw: [1.5, 0.3], grotto: [1.6, 1.0], flag: [0.15, 0.15], bell: [0.15, 0.15] };

// The three walls of a trade shed, which is open at the front.
export function zoneShedWalls(s) {
  const alongX = s.face === 'n' || s.face === 's';
  const hx = (alongX ? s.w : s.d) / 2;
  const hz = (alongX ? s.d : s.w) / 2;
  const t = 0.18;
  const walls = [];
  if (s.face !== 'n') walls.push({ x0: s.x - hx, x1: s.x + hx, z0: s.z - hz, z1: s.z - hz + t });
  if (s.face !== 's') walls.push({ x0: s.x - hx, x1: s.x + hx, z0: s.z + hz - t, z1: s.z + hz });
  if (s.face !== 'w') walls.push({ x0: s.x - hx, x1: s.x - hx + t, z0: s.z - hz, z1: s.z + hz });
  if (s.face !== 'e') walls.push({ x0: s.x + hx - t, x1: s.x + hx, z0: s.z - hz, z1: s.z + hz });
  return walls;
}

function buildFixedColliders() {
  const boxes = [];
  for (const b of ZONE_BUILDINGS) boxes.push(boxOf(b.x, b.z, b.w / 2, b.d / 2));
  for (const s of ZONE_STALLS) boxes.push({ x0: s.x - 1.5, x1: s.x + 1.5, z0: s.z - 0.9, z1: s.z + 0.9 });
  for (const m of ZONE_MOULD_STATIONS) boxes.push({ x0: m.x - 0.7, x1: m.x + 0.7, z0: m.z - 0.6, z1: m.z + 0.6 });
  for (const v of ZONE_VEHICLES) {
    if (v.kind === 'bus' || v.kind === 'keke') boxes.push(footprintBox(v.kind, v.x, v.z, v.heading));
    if (v.kind === 'pickup') boxes.push({ x0: v.x - 2.6, x1: v.x + 2.6, z0: v.z - 1.2, z1: v.z + 1.2 });
  }
  const sh = ZONE_PROPS.shelter;
  boxes.push({ x0: sh.x - 6, x1: sh.x + 6, z0: sh.z - 2.5, z1: sh.z + 2.5 });   // motor park shelter posts
  boxes.push({ x0: -64, x1: -50, z0: -196, z1: -176 });                          // cured block stacks
  for (const h of ZONE_HOUSES) boxes.push(boxOf(h.x, h.z, h.w / 2, h.d / 2));
  for (const s of ZONE_SHEDS) boxes.push(...zoneShedWalls(s));
  for (const c of ZONE_COMPOUNDS) {
    boxes.push(...c.fence.walls);
    for (const b of c.buildings) {
      boxes.push(...b.walls);
      for (const item of b.items) if (item.solid) boxes.push(boxOf(item.x, item.z, item.sx / 2, item.sz / 2));
      if (b.tower) boxes.push({ x0: b.tower.x0, x1: b.tower.x1, z0: b.tower.z0, z1: b.tower.z1 });
      if (b.apse) boxes.push({ ...b.apse });
    }
    for (const y of c.yard) {
      if (YARD_SOLIDS[y.kind]) boxes.push(boxOf(y.x, y.z, ...YARD_SOLIDS[y.kind]));
      if (y.kind === 'vehicle' && y.vehicle !== 'ambulance') boxes.push(Math.abs(Math.sin(y.heading)) > 0.5 ? boxOf(y.x, y.z, 2.3, 1.0) : boxOf(y.x, y.z, 1.1, 2.6));
    }
  }
  return boxes;
}

// A grid over the town, so that asking "is anything here?" looks at a few
// boxes instead of all of them.
const CELL = 12;
function indexBoxes(boxes) {
  const cells = new Map();
  for (const b of boxes) {
    for (let i = Math.floor(b.x0 / CELL); i <= Math.floor(b.x1 / CELL); i += 1) {
      for (let j = Math.floor(b.z0 / CELL); j <= Math.floor(b.z1 / CELL); j += 1) {
        const key = i * 4096 + j;
        const list = cells.get(key);
        if (list) list.push(b); else cells.set(key, [b]);
      }
    }
  }
  return cells;
}
function blockedIn(cells, x, z, radius) {
  const i0 = Math.floor((x - radius) / CELL), i1 = Math.floor((x + radius) / CELL);
  const j0 = Math.floor((z - radius) / CELL), j1 = Math.floor((z + radius) / CELL);
  for (let i = i0; i <= i1; i += 1) {
    for (let j = j0; j <= j1; j += 1) {
      const list = cells.get(i * 4096 + j);
      if (!list) continue;
      for (const c of list) if (x > c.x0 - radius && x < c.x1 + radius && z > c.z0 - radius && z < c.z1 + radius) return true;
    }
  }
  return false;
}
function onGround(x, z) {
  const b = ZONE.bounds;
  if (x < b.minX + 1 || x > b.maxX - 1 || z < b.minZ + 1 || z > b.maxZ - 1) return false;
  const onJetty = x > ZONE_JETTY.x0 + 0.3 && x < ZONE_JETTY.x1 - 0.3 && z > ZONE_JETTY.z0 && z < ZONE_JETTY.z1 - 0.4;
  return onJetty || z <= zoneShoreZ(x) - 0.8;
}

const FIXED_COLLIDERS = buildFixedColliders();
const FIXED_INDEX = indexBoxes(FIXED_COLLIDERS);
const openAt = (x, z, radius = 0.4) => onGround(x, z) && !blockedIn(FIXED_INDEX, x, z, radius);
function openLine(ax, az, bx, bz, radius = 0.4) {
  const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.35));
  for (let i = 0; i <= steps; i += 1) if (!openAt(ax + ((bx - ax) * i) / steps, az + ((bz - az) * i) / steps, radius)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// The walking graph of the whole town, the spots people use, and their homes.
// The centre of town is drawn by hand above. The rest is laid out here from
// the streets, compounds and houses: every door is joined to the nearest path.
// ---------------------------------------------------------------------------

const STREETS = [
  [[-238, 113], [-210, 113]], [[180, 113], [238, 113]],
  [[-236, -40], [-140, -40]], [[48, -40], [87.5, -40], [236, -40]],
  [[-118, -141], [-95, -141]],
  [[0, -212], [0, -282], [0, -341], [0, -390.5], [0, -435.5], [0, -465]],
  [[-212, -341], [-201.5, -341], [-148, -341], [0, -341], [90, -341], [169.5, -341], [238, -341]],
  [[-201.5, -341], [-201.5, -438]],
  [[-235, 67], [-84.5, 67]], [[-84.5, 113], [-84.5, 67], [-84.5, 30], [-84.5, -40]], [[-84.5, 30], [-100, 30]],
  [[235, 67], [87.5, 67]], [[87.5, 113], [87.5, 67], [87.5, -40]],
  [[-148, -390.5], [0, -390.5]], [[-148, -435.5], [0, -435.5]],
  [[169.5, -341], [169.5, -390.5], [169.5, -435.5], [169.5, -460]], [[169.5, -390.5], [236, -390.5]], [[169.5, -435.5], [236, -435.5]],
];

function buildTown() {
  const nodes = {};
  // The same nodes, in the order they were made, as three plain lists: every search below goes through all of
  // them, thousands of times, and going through the object itself made a new list of pairs each time. A node
  // is only ever added through `put`, so the lists and the object cannot disagree.
  const nodeNames = [], nodeX = [], nodeZ = [];
  const nodeIndex = new Map();
  const put = (id, x, z) => {
    nodes[id] = [x, z];
    const i = nodeIndex.get(id);
    if (i === undefined) { nodeIndex.set(id, nodeNames.length); nodeNames.push(id); nodeX.push(x); nodeZ.push(z); } else { nodeX[i] = x; nodeZ[i] = z; }
  };
  for (const [name, at] of Object.entries(BASE_NODES)) put(name, at[0], at[1]);
  const edges = BASE_EDGES.map((e) => e.slice());
  const problems = [];
  let counter = 0;

  const near = (x, z, range) => { let best = null; let bestD = range; for (let i = 0; i < nodeNames.length; i += 1) { const d = Math.hypot(nodeX[i] - x, nodeZ[i] - z); if (d < bestD) { bestD = d; best = nodeNames[i]; } } return best; };
  const project = (x, z, a, b) => { const [ax, az] = nodes[a]; const [bx, bz] = nodes[b]; const dx = bx - ax; const dz = bz - az; const len2 = dx * dx + dz * dz || 1; const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2)); return { t, x: ax + dx * t, z: az + dz * t }; };
  const link = (a, b) => { if (a !== b && !edges.some(([p, q]) => (p === a && q === b) || (p === b && q === a))) edges.push([a, b]); };
  // the node at a point: one already there, or a new one, cut into any path it lies on
  function nodeAt(x, z, name = null) {
    const found = near(x, z, 0.6);
    if (found) return found;
    const id = name || `t${counter += 1}`;
    for (let i = 0; i < edges.length; i += 1) {
      const [a, b] = edges[i];
      const p = project(x, z, a, b);
      if (p.t > 0.001 && p.t < 0.999 && Math.hypot(p.x - x, p.z - z) < 0.35) { put(id, x, z); edges.splice(i, 1, [a, id], [id, b]); return id; }
    }
    put(id, x, z);
    return id;
  }
  function segment(a, b) {
    const [ax, az] = nodes[a];
    const [bx, bz] = nodes[b];
    const on = [];
    for (let i = 0; i < nodeNames.length; i += 1) {
      const name = nodeNames[i], nx = nodeX[i], nz = nodeZ[i];
      if (name === a || name === b) continue;
      const p = project(nx, nz, a, b);
      if (p.t > 0.001 && p.t < 0.999 && Math.hypot(p.x - nx, p.z - nz) < 0.35) on.push([p.t, name]);
    }
    on.sort((p, q) => p[0] - q[0]);
    let from = a;
    for (const [, name] of on) { link(from, name); from = name; }
    link(from, b);
    void ax; void az; void bx; void bz;
  }
  function street(points, names = null) {
    const ids = points.map(([x, z], i) => nodeAt(x, z, names && names[i]));
    for (let i = 1; i < ids.length; i += 1) segment(ids[i - 1], ids[i]);
    return ids;
  }
  // joins a node to the nearest path it can reach in a straight, clear line
  function attach(id, { max = 45, avoid = null, what = id } = {}) {
    const [x, z] = nodes[id];
    const options = [];
    for (const [a, b] of edges) {
      if (a === id || b === id || (avoid && avoid.has(a) && avoid.has(b))) continue;
      const p = project(x, z, a, b);
      const d = Math.hypot(p.x - x, p.z - z);
      if (d <= max) options.push({ d, x: p.x, z: p.z });
    }
    options.sort((p, q) => p.d - q.d);
    for (const o of options.slice(0, 12)) {
      if (!openLine(x, z, o.x, o.z)) continue;
      const to = nodeAt(Math.round(o.x * 100) / 100, Math.round(o.z * 100) / 100);
      if (to !== id) { link(id, to); return to; }
    }
    problems.push(`no clear path from ${what} at (${x}, ${z})`);
    return null;
  }

  for (const line of STREETS) street(line);

  const spots = [];
  const rooms = [];
  const homes = [];
  const venues = {};
  const venue = (id, kind, name, x, z) => { venues[id] = { id, kind, name, x, z }; };
  const addSpot = (s) => { const spot = Object.freeze({ id: spots.length, ctx: 'street', pose: 'stand', inside: false, room: null, roomKind: null, via: null, ...s }); spots.push(spot); return spot.id; };

  venue('market', 'market', 'the market', 43, 60);
  venue('park', 'park', 'the motor park', -46, 84);
  venue('shore', 'shore', 'the waterside', 30, 138);
  venue('farm', 'farm', 'the farms', -200, -400);
  venue('yard', 'yard', 'the block yard', -85, -168);
  venue('street', 'street', 'town', 0, 0);
  venue('home', 'home', 'home', 0, 0);
  for (const [id, name, node, ctx] of [['police', 'the police post', 'police_door', 'street'], ['secretariat', 'the secretariat', 'sec_door', 'street'], ['registry', 'the Lands Registry', 'reg_door', 'street'], ['technical', 'the technical school', 'school_door', 'school'], ['clinic', 'the clinic', 'clinic_door', 'hospital'], ['store', 'the building materials store', 'store_door', 'market'], ['kitchen', 'the kitchen', 'kitchen_door', 'market']]) {
    venue(id, id, name, nodes[node][0], nodes[node][1]);
    addSpot({ venue: id, slot: 'inside', x: nodes[node][0], z: nodes[node][1], facing: 0, node, inside: true, ctx });
  }

  const CTX = { hospital: 'hospital', primary: 'school', secondary: 'school', church: 'church', university: 'campus', polytechnic: 'campus', college: 'campus' };
  const TEACHING = new Set(['classroom', 'lecture', 'lab', 'workshop']);
  for (const c of ZONE_COMPOUNDS) {
    const gate = c.fence.gates[0];
    venues[c.id] = { id: c.id, kind: c.kind, name: c.name, x: (c.x0 + c.x1) / 2, z: (c.z0 + c.z1) / 2, gate: { x: gate.x, z: gate.z }, faith: c.faith || null, hours: c.hours || null };
    for (const line of c.spine) street(line);
    for (const b of c.buildings) {
      const own = new Set();
      if (b.kind === 'church') {
        const r = b.rooms[0];
        const [out, inside, aisle] = street([r.out, r.in, r.aisle], [`${r.id}:out`, `${r.id}:in`, `${r.id}:aisle`]);
        const [sideOut, sideIn] = street([r.side.out, r.side.in], [`${r.id}:side`, `${r.id}:sidein`]);
        link(sideIn, aisle);
        for (const n of [out, inside, aisle, sideOut, sideIn]) own.add(n);
        if (!edges.some(([p, q]) => (p === out && !own.has(q)) || (q === out && !own.has(p)))) attach(out, { avoid: own, what: `${b.id} front door` });
        attach(sideOut, { avoid: own, what: `${b.id} side door` });
        rooms.push({ id: r.id, venue: c.id, building: b.id, kind: 'nave', name: b.name, x0: b.x0, z0: b.z0, x1: b.x1, z1: b.z1, h: b.h });
        for (const s of b.spots) addSpot({ venue: c.id, slot: `nave.${s.slot}`, room: r.id, roomKind: 'nave', x: s.x, z: s.z, facing: s.facing, pose: s.pose, via: s.via || null, node: s.outside ? null : (s.slot === 'door' ? inside : aisle), ctx: 'church' });
        continue;
      }
      const walk = street(b.walk, b.walk.map((_, i) => (i === 0 ? `${b.id}:a` : i === b.walk.length - 1 ? `${b.id}:b` : `${b.rooms[i - 1].id}:out`)));
      for (const n of walk) own.add(n);
      for (const r of b.rooms) {
        const inside = nodeAt(r.in[0], r.in[1], `${r.id}:in`);
        own.add(inside);
        link(`${r.id}:out`, inside);
        rooms.push({ id: r.id, venue: c.id, building: b.id, kind: r.kind, name: r.name, x0: r.x0, z0: r.z0, x1: r.x1, z1: r.z1, h: b.h });
      }
      // join the veranda to the compound's paths, from both ends where it can be
      const before = problems.length;
      const first = attach(walk[0], { max: 26, avoid: own, what: `${b.id} veranda` });
      const second = attach(walk[walk.length - 1], { max: 26, avoid: own, what: `${b.id} veranda` });
      if (first || second) problems.length = before;
      // clergy live in a room of their house, and are not seen there
      if (c.kind === 'church') { const last = b.rooms[b.rooms.length > 2 ? 1 : 0]; addSpot({ venue: c.id, slot: 'residence', room: last.id, x: last.in[0], z: last.in[1], facing: 0, node: `${last.id}:in`, inside: true, ctx: 'church' }); }
      for (const s of b.spots) {
        const r = b.rooms[s.room];
        addSpot({ venue: c.id, slot: `${r.kind}.${s.slot}`, room: r.id, roomKind: r.kind, x: s.x, z: s.z, facing: s.facing, pose: s.pose, via: s.via || null, node: `${r.id}:in`, ctx: TEACHING.has(r.kind) ? 'class' : CTX[c.kind] });
      }
    }
  }

  // houses, old and new, and the halls of residence
  const front = (home, d, node, quarter) => {
    const ox = Math.sin(d.facing), oz = Math.cos(d.facing);      // out from the door
    const lx = oz, lz = -ox;                                        // along the wall
    home.front = [[1.9, -0.7, 'sit'], [-1.9, -0.7, 'sit'], [2.8, 0.5, 'stand'], [-0.9, 0.9, 'stand']].map(([l, o, pose]) => addSpot({ venue: 'home', slot: 'front', room: home.id, x: Math.round((d.x + lx * l + ox * o) * 100) / 100, z: Math.round((d.z + lz * l + oz * o) * 100) / 100, facing: d.facing, pose, node, ctx: 'home' }));
    home.quarter = quarter;
  };
  for (const b of ZONE_BUILDINGS) {
    if (b.kind !== 'home') continue;
    const place = ZONE_PLACES[b.id];
    const home = { id: b.id, kind: 'house', x: b.x, z: b.z, beds: 8, home: addSpot({ venue: 'home', slot: 'home', room: b.id, x: place.x, z: place.z, facing: 0, node: place.node, inside: true, ctx: 'home' }) };
    front(home, { x: b.x, z: b.z + b.d / 2 + 1.6, facing: 0 }, place.node, b.x < 0 ? 'Umuoga' : 'Odekpe');
    homes.push(home);
  }
  for (const h of ZONE_HOUSES) {
    const d = houseDoor(h);
    const node = nodeAt(d.x, d.z, `${h.id}:door`);
    attach(node, { what: h.id });
    const home = { id: h.id, kind: 'house', x: h.x, z: h.z, beds: 9, home: addSpot({ venue: 'home', slot: 'home', room: h.id, x: d.x, z: d.z, facing: d.facing, node, inside: true, ctx: 'home' }) };
    front(home, d, node, h.quarter);
    homes.push(home);
  }
  for (const b of ZONE_BUILDINGS) {
    if (b.kind !== 'hostel' && b.id !== 'mosque') continue;
    const d = houseDoor(b);
    const node = nodeAt(d.x, d.z, `${b.id}:door`);
    attach(node, { what: b.id });
    if (b.kind === 'hostel') homes.push({ id: b.id, kind: 'hostel', x: b.x, z: b.z, beds: b.beds, quarter: 'the halls', front: [], home: addSpot({ venue: 'home', slot: 'home', room: b.id, x: d.x, z: d.z, facing: d.facing, node, inside: true, ctx: 'campus' }) });
    else { venue('mosque', 'mosque', 'the Central Mosque', b.x, b.z); addSpot({ venue: 'mosque', slot: 'inside', x: d.x, z: d.z, facing: 0, node, inside: true, ctx: 'church' }); }
  }

  // trade sheds: workers inside, customers in front
  for (const s of ZONE_SHEDS) {
    const [fx, fz] = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] }[s.face];
    const tx = -fz, tz = fx;
    const node = nodeAt(Math.round((s.x + fx * (s.d / 2 + 3.4)) * 100) / 100, Math.round((s.z + fz * (s.d / 2 + 3.4)) * 100) / 100, `${s.id}:front`);
    attach(node, { what: s.id });
    const facing = Math.atan2(fx, fz);
    const workers = s.w >= 6 ? 6 : s.trade === 'foodvendor' ? 3 : 4;
    for (let k = 0; k < workers; k += 1) { const t = (k - (workers - 1) / 2) * ((s.w - 1.4) / Math.max(1, workers - 1)); addSpot({ venue: s.id, slot: 'work', trade: s.trade, x: Math.round((s.x + tx * t - fx * 0.2) * 100) / 100, z: Math.round((s.z + tz * t - fz * 0.2) * 100) / 100, facing, node, ctx: s.trade === 'foodvendor' ? 'market' : 'street' }); }
    const seats = s.trade === 'foodvendor' ? 8 : 3;
    for (let k = 0; k < seats; k += 1) { const t = ((k % 4) - (Math.min(seats, 4) - 1) / 2) * 1.05; const back = Math.floor(k / 4) * 1.3; addSpot({ venue: s.id, slot: 'customer', trade: s.trade, x: Math.round((s.x + tx * t + fx * (s.d / 2 + 1.1 + back)) * 100) / 100, z: Math.round((s.z + tz * t + fz * (s.d / 2 + 1.1 + back)) * 100) / 100, facing: facing + Math.PI, pose: s.trade === 'foodvendor' || s.trade === 'barber' ? 'sit' : 'stand', node, ctx: s.trade === 'foodvendor' ? 'market' : 'street' }); }
    if (s.trade !== 'foodvendor') for (const side of [-1, 1]) addSpot({ venue: s.id, slot: 'apprentice', trade: s.trade, x: Math.round((s.x + tx * side * (s.w / 2 + 1.0) + fx * (s.d / 2 + 0.6)) * 100) / 100, z: Math.round((s.z + tz * side * (s.w / 2 + 1.0) + fz * (s.d / 2 + 0.6)) * 100) / 100, facing: facing + side * 1.2, node, ctx: 'street' });
    venue(s.id, 'shed', s.sign, s.x, s.z);
    venues[s.id].trade = s.trade;
  }

  // okada ranks
  for (const r of ZONE_RANKS) {
    const node = nodeAt(r.x, r.z, `${r.id}:node`);
    attach(node, { what: r.id, max: 30 });
    venue(r.id, 'rank', r.name, r.x, r.z);
    for (let k = 0; k < r.slots; k += 1) addSpot({ venue: r.id, slot: 'rank', x: r.x + r.dx * k, z: r.z + r.dz * k, facing: r.heading, node, ctx: 'park' });
  }

  // everything else in the open: use a path close by if there is one, or make one
  for (const s of TOWN_SPOTS) {
    let node = null;
    let bestD = 15;
    for (let k = 0; k < nodeNames.length; k += 1) { const nx = nodeX[k], nz = nodeZ[k]; const d = Math.hypot(nx - s.x, nz - s.z); if (d < bestD && openLine(s.x, s.z, nx, nz, 0.3)) { bestD = d; node = nodeNames[k]; } }
    if (!node) { node = nodeAt(s.x, s.z); if (!edges.some(([a, b]) => a === node || b === node)) attach(node, { max: 70, what: `${s.venue} ${s.slot}` }); }
    addSpot({ ...s, ctx: s.ctx || 'street', node });
  }
  for (let i = 0; i < spots.length; i += 1) {
    if (spots[i].node) continue;
    const s = spots[i];
    let node = null;
    let bestD = 30;
    for (let k = 0; k < nodeNames.length; k += 1) { const nx = nodeX[k], nz = nodeZ[k]; const d = Math.hypot(nx - s.x, nz - s.z); if (d < bestD && openLine(s.x, s.z, nx, nz, 0.3)) { bestD = d; node = nodeNames[k]; } }
    if (!node) problems.push(`no path to spot ${s.venue} ${s.slot}`);
    spots[i] = Object.freeze({ ...s, node: node || 'mk_s' });
  }

  // everything must be reachable from the market cross
  const seen = new Set(['mk_s']);
  const queue = ['mk_s'];
  const next = {};
  for (const [a, b] of edges) { (next[a] || (next[a] = [])).push(b); (next[b] || (next[b] = [])).push(a); }
  while (queue.length) { for (const n of next[queue.pop()] || []) if (!seen.has(n)) { seen.add(n); queue.push(n); } }
  for (const name of Object.keys(nodes)) if (!seen.has(name)) problems.push(`node ${name} cannot be reached`);

  for (const name of Object.keys(nodes)) Object.freeze(nodes[name]);
  return { nodes: Object.freeze(nodes), edges: Object.freeze(edges.map(Object.freeze)), spots: Object.freeze(spots), rooms: Object.freeze(rooms.map(Object.freeze)), homes: Object.freeze(homes.map(Object.freeze)), venues: Object.freeze(venues), problems: Object.freeze(problems) };
}

const TOWN = buildTown();
export const ZONE_NODES = TOWN.nodes;
export const ZONE_EDGES = TOWN.edges;
export const ZONE_SPOTS = TOWN.spots;
export const ZONE_ROOMS = TOWN.rooms;
export const ZONE_HOMES = TOWN.homes;
export const ZONE_VENUES = TOWN.venues;
export const ZONE_GRAPH_PROBLEMS = TOWN.problems;

// The room a point is in, if it is inside a building people can enter.
const ROOM_INDEX = indexBoxes(ZONE_ROOMS.map((r) => ({ ...r })));
export function zoneRoomAt(x, z) {
  const list = ROOM_INDEX.get(Math.floor(x / CELL) * 4096 + Math.floor(z / CELL));
  if (list) for (const r of list) if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) return r;
  return null;
}

// ---------------------------------------------------------------------------
// Trees, and the final test of where a person can stand.
// ---------------------------------------------------------------------------

function buildTrees() {
  const rng = makeRng(20261006);
  const trees = [];
  const keepClear = [];
  for (const p of ZONE_PARCELS) keepClear.push({ x0: p.x0 - 2, x1: p.x1 + 2, z0: p.z0 - 2, z1: p.z1 + 2 });
  for (const r of ZONE_ROADS) keepClear.push({ x0: r.x0 - 3, x1: r.x1 + 3, z0: r.z0 - 3, z1: r.z1 + 3 });
  for (const b of ZONE_BUILDINGS) keepClear.push(boxOf(b.x, b.z, b.w / 2 + 5, b.d / 2 + 6));
  for (const h of ZONE_HOUSES) keepClear.push(boxOf(h.x, h.z, h.w / 2 + 2.5, h.d / 2 + 3.5));
  for (const s of ZONE_SHEDS) keepClear.push(boxOf(s.x, s.z, 6, 6));
  for (const c of ZONE_COMPOUNDS) {
    for (const b of c.buildings) keepClear.push({ x0: b.x0 - 6, x1: b.x1 + 6, z0: b.z0 - 6, z1: b.z1 + 6 });
    for (const y of c.yard) { if (y.x0 !== undefined) keepClear.push({ x0: y.x0 - 1, x1: y.x1 + 1, z0: y.z0 - 1, z1: y.z1 + 1 }); else keepClear.push(boxOf(y.x, y.z, 4, 4)); }
    for (const w of c.fence.walls) keepClear.push({ x0: w.x0 - 1.6, x1: w.x1 + 1.6, z0: w.z0 - 1.6, z1: w.z1 + 1.6 });
  }
  keepClear.push({ x0: 8, x1: 82, z0: 18, z1: 100 }, { x0: -75, x1: -12, z0: 58, z1: 106 }, { x0: -118, x1: -42, z0: -202, z1: -148 });   // market, motor park, block yard
  keepClear.push({ x0: ZONE_FARMLAND.x0, x1: ZONE_FARMLAND.x1, z0: ZONE_FARMLAND.z0, z1: ZONE_FARMLAND.z1 });
  const clear = indexBoxes(keepClear);
  const points = [];
  for (const [from, to] of ZONE_EDGES) {
    const a = ZONE_NODES[from];
    const c = ZONE_NODES[to];
    const steps = Math.max(1, Math.ceil(Math.hypot(c[0] - a[0], c[1] - a[1]) / 2.5));
    for (let i = 0; i <= steps; i += 1) points.push(boxOf(a[0] + ((c[0] - a[0]) * i) / steps, a[1] + ((c[1] - a[1]) * i) / steps, 3.2, 3.2));
  }
  for (const spot of Object.values(ZONE_PLACES)) points.push(boxOf(spot.x, spot.z, 4, 4));
  for (const s of ZONE_SPOTS) points.push(boxOf(s.x, s.z, 2.6, 2.6));
  const paths = indexBoxes(points);
  const b = ZONE.bounds;
  let guard = 0;
  while (trees.length < 260 && guard < 12000) {
    guard += 1;
    const x = b.minX + 4 + rng.next() * (b.maxX - b.minX - 8);
    const z = b.minZ + 4 + rng.next() * (148 - b.minZ - 4);
    const shore = zoneShoreZ(x);
    if (z > shore - 3) continue;
    if (blockedIn(clear, x, z, 0) || blockedIn(paths, x, z, 0)) continue;
    if (trees.some((t) => Math.hypot(t.x - x, t.z - z) < 5)) continue;
    // Oil palm country: coconut palms only along the bank, oil palms and mango inland.
    const nearShore = z > shore - 30;
    const kind = nearShore ? (rng.next() < 0.5 ? 'palm' : 'oilpalm') : (rng.next() < 0.45 ? 'oilpalm' : rng.next() < 0.55 ? 'mango' : 'almond');
    trees.push(Object.freeze({ x: Number(x.toFixed(1)), z: Number(z.toFixed(1)), kind, size: Number((0.8 + rng.next() * 0.5).toFixed(2)), turn: Number((rng.next() * 6.28).toFixed(2)) }));
  }
  return Object.freeze(trees);
}
export const ZONE_TREES = buildTrees();

export const ZONE_COLLIDERS = Object.freeze([...FIXED_COLLIDERS, ...ZONE_TREES.map((t) => boxOf(t.x, t.z, 0.45, 0.45))].map(Object.freeze));
const COLLIDER_INDEX = indexBoxes(ZONE_COLLIDERS);

// True when a person of the given radius can stand at (x, z).
// `extra` is a list of additional boxes: structures players have built.
// Is this point inside something that stands up from the ground: a wall, a tree, a parked coach?
// (Water and the edge of the map are not solid; they are only not for walking on.)
export function zoneSolid(x, z, radius = 0.2) {
  return blockedIn(COLLIDER_INDEX, x, z, radius);
}

export function zoneWalkable(x, z, extra = [], radius = 0.4) {
  if (!onGround(x, z)) return false;
  if (blockedIn(COLLIDER_INDEX, x, z, radius)) return false;
  for (const c of extra) if (x > c.x0 - radius && x < c.x1 + radius && z > c.z0 - radius && z < c.z1 + radius) return false;
  return true;
}
