// The people of a zone.
//
// Everyone who lives here is made once, from a seed: a name, an age, a
// family, a home, work, a way of dressing, languages, a temperament. From
// then on each person lives a day that follows from who they are and what
// day it is: a pupil goes to assembly, a nurse to the ward, a trader to her
// stall, a farmer to the field before it is hot.
//
// Nobody is moved step by step. A person's day is a list of journeys with
// times; where they are at any moment is read off that list. That is what
// lets a thousand people (or ten thousand) cost almost nothing until someone
// is close enough to see them:
//
//   far     known only as a position, looked up about once a second
//   middle  position and pose, looked up whenever a player's view is built
//   near    as middle, and they can be spoken to and overheard
//
// The few people who ride motorcycle taxis are the exception: a ride is
// simulated, and okada.js tells this module where its passengers are.

import { ZONE_SPOTS, ZONE_HOMES, ZONE_VENUES, ZONE_ROOMS, ZONE_POPULATION, ZONE_RESIDENTS, ZONE_PATROLS, BOULEVARD, ZONE_ROADS, OUTSKIRT_ROADS } from './zone.js';
import { PEOPLES, GIVEN_NAMES, TRAITS } from './culture.js';
import { makeRng } from './rng.js';
import { wearFor, configFromLook, figFor } from './characters.js';
import { graphIndex, graphRoute, graphDistance, graphPoint, graphIsRoad, graphIsOpen } from './graph.js';
import { policeLook, policeFig } from './police-looks.js';
import { NPC_FIGURES, TOWN_FIGURES } from './npc-figures.js';
import { VOICE_CAST } from './voice-lines.js';

export const WALK_SPEED = 1.7;                 // metres per real second
export const RIDE_SPEED = 6.5;
export const POSE = Object.freeze({ stand: 0, walk: 1, sit: 2, lie: 3, hidden: 4, ride: 5 });
export const RANGE = Object.freeze({ near: 30, middle: 150, scan: 172 });
export const WEEKDAYS = Object.freeze(['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']);
const POSE_OF = { stand: 0, sit: 2, lie: 3 };

// ---------------------------------------------------------------- spots --

const SPOT_NODE = ZONE_SPOTS.map((s) => graphIndex(s.node));
const BY_SLOT = new Map();
const BY_ROOM = new Map();
for (const s of ZONE_SPOTS) {
  const a = `${s.venue}|${s.slot}`;
  if (!BY_SLOT.has(a)) BY_SLOT.set(a, []);
  BY_SLOT.get(a).push(s.id);
  if (s.room) { const b = `${s.room}|${s.slot}`; if (!BY_ROOM.has(b)) BY_ROOM.set(b, []); BY_ROOM.get(b).push(s.id); }
}
const slot = (venue, name) => BY_SLOT.get(`${venue}|${name}`) || [];
const inRoom = (room, name) => BY_ROOM.get(`${room}|${name}`) || [];
const roomsOf = (venue, ...kinds) => ZONE_ROOMS.filter((r) => r.venue === venue && kinds.includes(r.kind));
const SHEDS = Object.values(ZONE_VENUES).filter((v) => v.kind === 'shed');
const FOOD = SHEDS.filter((v) => v.trade === 'foodvendor');
const HOME_BY_ID = new Map(ZONE_HOMES.map((h) => [h.id, h]));
const CONGREGATION = { catholic: [...slot('catholic', 'nave.pew'), ...slot('catholic', 'nave.stand')], anglican: [...slot('anglican', 'nave.pew'), ...slot('anglican', 'nave.stand')] };

// A journey between two spots: the points to walk through, and how far it is.
const pathCache = new Map();
// Crossing the city block's boulevard (atani-city.js): someone on foot stops at the kerb before stepping out, for as
// long as walking KERB_PAUSE metres would take (a few seconds), and then crosses.
const KERB_PAUSE = 4;
const onCarriageway = (x, z) => x > BOULEVARD.x0 && x < BOULEVARD.x1 && z > BOULEVARD.z0 && z < BOULEVARD.z1;
const atKerb = (x, z) => !onCarriageway(x, z) && Math.abs(x) < BOULEVARD.x1 + 5 && z > BOULEVARD.z0 - 4 && z < BOULEVARD.z1;
// The roads the town's cars use (traffic.js: those wide enough for two cars to pass), and whether a point is on one.
const CAR_ROADS = [...ZONE_ROADS, ...OUTSKIRT_ROADS].filter((r) => Math.min(r.x1 - r.x0, r.z1 - r.z0) >= 7.5 && !r.bays && !r.deck);
const onCarRoad = (x, z) => CAR_ROADS.some((r) => x >= r.x0 - 0.5 && x <= r.x1 + 0.5 && z >= r.z0 - 0.5 && z <= r.z1 + 0.5);
// how far to one side of a road's middle someone walking along it keeps, at most: well clear of the cars on either side
// (a car at its lane, on the right of the middle, comes no nearer it than a metre)
export const ON_CAR_ROAD_SIDE = 0.5;

function pathBetween(a, b) {
  const key = a * 8192 + b;
  let path = pathCache.get(key);
  if (path) return path;
  const A = ZONE_SPOTS[a];
  const B = ZONE_SPOTS[b];
  const pts = [[A.x, A.z, 0]];
  let nodes = null;
  // two of a police beat's stops on the same line out of the town (atani-patrols.js): along the line, back as far as
  // where the two part and on from there, not back into the town and out again
  let shared = 0;
  if (A.chain && B.chain && SPOT_NODE[a] === SPOT_NODE[b]) while (shared < A.via.length && shared < B.via.length && A.via[shared][0] === B.via[shared][0] && A.via[shared][1] === B.via[shared][1]) shared += 1;
  if (SPOT_NODE[a] === SPOT_NODE[b] && !A.via && !B.via) pts.push([B.x, B.z, 0]);
  else if (shared > 0) {
    for (let i = A.via.length - 1; i >= shared; i -= 1) pts.push([A.via[i][0], A.via[i][1], 0]);
    for (let i = shared; i < B.via.length; i += 1) pts.push([B.via[i][0], B.via[i][1], 0]);
    pts.push([B.x, B.z, 0]);
  } else {
    if (A.via) for (let i = A.via.length - 1; i >= 0; i -= 1) pts.push([A.via[i][0], A.via[i][1], 0]);
    nodes = graphRoute(SPOT_NODE[a], SPOT_NODE[b]) || [SPOT_NODE[b]];
    for (const n of nodes) { const [x, z] = graphPoint(n); pts.push([x, z, graphIsOpen(n) ? 1 : 0]); }
    if (B.via) for (const v of B.via) pts.push([v[0], v[1], 0]);
    pts.push([B.x, B.z, 0]);
  }
  const xs = [];
  const open = [];
  const cum = [0];
  const still = [];
  for (let k = 0; k < pts.length; k += 1) {
    const [x, z, o] = pts[k];
    const n = xs.length / 2;
    if (n && Math.abs(xs[n * 2 - 2] - x) < 0.01 && Math.abs(xs[n * 2 - 1] - z) < 0.01) continue;
    if (n) cum.push(cum[n - 1] + Math.hypot(x - xs[n * 2 - 2], z - xs[n * 2 - 1]));
    xs.push(x, z);
    open.push(o);
    still.push(0);
    // about to step off the pavement into the city boulevard's traffic: they stop at the kerb and look first
    const next = pts[k + 1];
    if (next && atKerb(x, z) && onCarriageway(next[0], next[1])) { cum.push(cum[cum.length - 1] + KERB_PAUSE); xs.push(x, z); open.push(0); still.push(1); }
  }
  // (which of its points are on a road the town's cars use, traffic.js: walking along one, people keep near its middle,
  // out of the cars' way on either side)
  const wide = Uint8Array.from({ length: xs.length / 2 }, (_, k) => (onCarRoad(xs[k * 2], xs[k * 2 + 1]) ? 1 : 0));
  path = { xs: Float32Array.from(xs), open: Uint8Array.from(open), cum: Float32Array.from(cum), len: cum[cum.length - 1], nodes, still: still.some(Boolean) ? Uint8Array.from(still) : null, wide: wide.some(Boolean) ? wide : null };
  pathCache.set(key, path);
  return path;
}

// ----------------------------------------------------------------- jobs --
// What kinds of people there are: ages, how many are women, what they earn.

const job = (name, lo, hi, female, income, more = {}) => Object.freeze({ name, ages: [lo, hi], female, income, ...more });
export const JOBS = Object.freeze({
  infant: job('Child', 1, 5, 0.5, 'none'),
  pupil: job('Pupil', 6, 11, 0.5, 'none'),
  student: job('Student', 12, 17, 0.5, 'none'),
  undergrad: job('Student', 18, 26, 0.48, 'none'),
  headteacher: job('Head teacher', 45, 58, 0.6, 'middle'),
  teacher: job('Teacher', 26, 55, 0.65, 'middle'),
  principal: job('Principal', 46, 59, 0.35, 'middle'),
  labtech: job('Laboratory technician', 25, 45, 0.4, 'low'),
  schoolstaff: job('School worker', 22, 58, 0.5, 'low', { early: true }),
  lecturer: job('Lecturer', 32, 62, 0.35, 'high'),
  officer: job('Administrative officer', 28, 58, 0.5, 'middle'),
  librarian: job('Librarian', 30, 55, 0.6, 'middle'),
  guard: job('Security guard', 25, 55, 0.05, 'low', { early: true, shifts: true }),
  doctor: job('Doctor', 28, 58, 0.4, 'high', { shifts: true }),
  nurse: job('Nurse', 23, 54, 0.88, 'middle', { early: true, shifts: true }),
  pharmacist: job('Pharmacist', 26, 50, 0.5, 'high'),
  labscientist: job('Laboratory scientist', 26, 50, 0.5, 'middle'),
  records: job('Records clerk', 22, 50, 0.6, 'low'),
  cleaner: job('Cleaner', 22, 56, 0.7, 'low', { early: true }),
  ambulance: job('Ambulance driver', 28, 52, 0, 'low', { early: true }),
  priest: job('Priest', 30, 62, 0, 'middle', { early: true, clergy: true }),
  catechist: job('Catechist', 35, 65, 0.1, 'low', { early: true }),
  sexton: job('Sexton', 25, 60, 0, 'low', { early: true }),
  churchworker: job('Church worker', 22, 62, 0.6, 'low'),
  vicar: job('Vicar', 35, 62, 0, 'middle', { clergy: true }),
  trader: job('Trader', 22, 62, 0.78, 'low', { early: true }),
  tailor: job('Tailor', 20, 55, 0.5, 'low'),
  barber: job('Barber', 20, 50, 0.45, 'low'),
  mechanic: job('Mechanic', 20, 55, 0, 'low'),
  carpenter: job('Carpenter', 22, 58, 0, 'low'),
  welder: job('Welder', 22, 50, 0, 'low'),
  foodvendor: job('Food seller', 24, 58, 0.92, 'low', { early: true }),
  baker: job('Baker', 22, 50, 0.4, 'low', { early: true }),
  farmer: job('Farmer', 22, 66, 0.45, 'low', { early: true }),
  fisher: job('Fisherman', 18, 60, 0.04, 'low', { early: true }),
  okada: job('Okada rider', 19, 45, 0, 'low', { early: true }),
  driver: job('Driver', 24, 55, 0, 'low', { early: true }),
  // (30 October 2026) out in their own car for their hours at the wheel (traffic.js); otherwise about the town
  motorist: job('Motorist', 22, 50, 0.5, 'middle'),
  police: job('Police officer', 24, 52, 0.25, 'middle', { early: true, shifts: true }),
  clerk: job('Council clerk', 24, 58, 0.5, 'middle'),
  labourer: job('Labourer', 18, 48, 0.06, 'low', { early: true }),
  apprentice: job('Apprentice', 15, 22, 0.3, 'none'),
  hawker: job('Hawker', 14, 45, 0.6, 'low', { early: true }),
  unemployed: job('Looking for work', 18, 40, 0.45, 'none'),
  retiree: job('Retired', 60, 84, 0.5, 'low'),
  homemaker: job('Homemaker', 22, 55, 0.95, 'none'),
});
const WHITE_COLLAR = new Set(['headteacher', 'teacher', 'principal', 'labtech', 'lecturer', 'officer', 'librarian', 'doctor', 'nurse', 'pharmacist', 'labscientist', 'records', 'priest', 'vicar', 'catechist', 'police', 'clerk', 'undergrad', 'student']);
const OKADA_SHARE = { none: 0.1, low: 0.16, middle: 0.34, high: 0.5 };
// The police's beats (atani-patrols.js), and who walks which when: the day's officers first, beat by beat, then the
// night's. An officer's number among the police says which of these is hers.
const PATROL_BY_ID = new Map((ZONE_PATROLS || []).map((b) => [b.id, b]));
const PATROL_DUTIES = Object.freeze([
  ...(ZONE_PATROLS || []).flatMap((b) => Array.from({ length: b.day }, () => Object.freeze({ beat: b.id, night: false }))),
  ...(ZONE_PATROLS || []).flatMap((b) => Array.from({ length: b.night }, () => Object.freeze({ beat: b.id, night: true }))),
]);

// Small deterministic hashes, so a person's choices do not need storing.
function mix(a, b = 0, c = 0) {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return h >>> 0;
}
const unit = (a, b = 0, c = 0) => mix(a, b, c) / 4294967296;

// ---------------------------------------------------------------- looks --

const SKINS = [0x3b2415, 0x4a2c17, 0x4f3019, 0x5a3620, 0x5e3b24, 0x6b4226, 0x70482c, 0x7a4a2b, 0x8a5a36];
const SHIRTS = [0xe8e2d0, 0x2f4f7f, 0x8a2f2f, 0x3c6e47, 0xb8860b, 0x6a4a8a, 0x2d5f73, 0xd9a441, 0x9c6b3f, 0x44526a, 0xc9c2b0, 0x7b2d5b, 0x1f5c4d, 0xd96f3a];
const TROUSERS = [0x2a2a2a, 0x3a3f4b, 0x2c3a5a, 0x4a4a3a, 0x44352a, 0x5a5346, 0x1d2233];
const CLOTHS = [
  { colours: [0x14402f, 0xd9a441, 0xf3ecdc], motif: 'leaves' }, { colours: [0x6b2d3a, 0xd9a441, 0xf3ecdc], motif: 'rings' }, { colours: [0x5a1f47, 0x2e9fa3, 0xf2c200], motif: 'diamonds' },
  { colours: [0x44352a, 0xe67e22, 0xf3ecdc], motif: 'rings' }, { colours: [0x1f3f7a, 0xf2c200, 0xf3ecdc], motif: 'diamonds' }, { colours: [0x8a1f1f, 0xf3ecdc, 0x1b1b1e], motif: 'leaves' },
  { colours: [0x2e6f73, 0xf5c518, 0x7b2d5b], motif: 'rings' }, { colours: [0x5b3a8a, 0xe9a6c0, 0xf3ecdc], motif: 'leaves' },
];
const HEADTIES = [0x1f5c4d, 0xd9a441, 0x2e6f73, 0xe0d6c3, 0x7b2d5b, 0xb3261e, 0x2f4f7f, 0xe67e22];

// One of his townspeople: the figure, whose it is, and what it is from far off (its own colours: npc-figures.js).
function townLook(p) {
  const list = p.figures && p.figures.length ? p.figures : TOWN_FIGURES[p.gender === 'm' ? 'm' : 'f'];
  const F = NPC_FIGURES[list[p.k % list.length]];
  const c = F.far;
  const look = { figure: F.id, body: F.gender, skin: c.skin, top: c.top, bottom: c.bottom, height: 1, outfit: 'figure', age: p.age,
    plain: Object.freeze({ body: F.gender, skin: c.skin, top: c.top, bottom: c.bottom, outfit: c.skirt ? 'skirt-blouse' : 'tee', build: 1, height: F.height / (F.gender === 'f' ? 1.66 : 1.78) }) };
  const fig = { skin: c.skin, arm: c.skin, top: c.top, bottom: c.bottom, legs: c.skirt ? c.skin : c.bottom, hair: c.hair, hat: 0, skirt: c.skirt ? 1 : 0, scale: (F.height / 1.75) * 1.02, wide: F.gender === 'f' ? 0.94 : 1.02 };
  return { look: Object.freeze(look), fig: Object.freeze(fig) };
}

// What someone wears, from the work they do and who they are. The result is
// a `look` for the full figure and a `fig` for the simple one seen far away.
function dress(p, rng) {
  // the town's police (27 October 2026): his police officer and his security guard, five of each (police-looks.js)
  if (p.looks === 'police') return { look: Object.freeze({ ...policeLook(p.k, p.gender), age: p.age }), fig: Object.freeze(policeFig(p.k, p.gender)) };
  // his townspeople (27 October 2026): each drawn from one of his figures (npc-figures.js), the k-th of the list the
  // town gives; from far off a plain figure in its colours
  if (p.looks === 'npc') return townLook(p);
  const f = p.gender === 'f';
  const skin = rng.pick(SKINS);
  const old = p.age >= 60;
  const look = { skin, top: rng.pick(SHIRTS), bottom: rng.pick(TROUSERS), build: 0.92 + rng.next() * 0.24, body: f ? 'f' : 'm', hair: f ? rng.pick(['braids', 'bun', 'low', 'afro', 'braids']) : 'low', height: 0.94 + rng.next() * 0.1 };
  if (old) { look.hair = 'grey'; look.face = 'elder'; }
  if (!f && p.age > 24 && rng.next() < 0.3) look.beard = true;
  const wrapper = () => { look.outfit = 'wrapper'; look.pattern = CLOTHS[rng.int(CLOTHS.length)]; look.bottom = look.pattern.colours[0]; look.top = rng.pick([look.pattern.colours[1], 0xf3ecdc, look.pattern.colours[0]]); look.shoes = 'sandal'; if (rng.next() < 0.75) { look.hat = ['headtie', rng.pick(HEADTIES)]; look.hair = 'low'; } };
  const gown = (colour) => { look.outfit = 'gown'; look.top = colour; };
  const kaftan = (colour, cap = null) => { look.outfit = 'kaftan'; look.top = colour; look.bottom = colour; if (cap) look.hat = cap; };
  const white = 0xf4f4f0;
  switch (p.job) {
    case 'infant': look.outfit = f ? 'gown' : 'shirt'; if (!f) look.legs = 'shorts'; look.shoes = 'sandal'; break;
    case 'pupil': if (f) gown(0x2f6f4f); else { look.top = white; look.bottom = 0x2f6f4f; look.legs = 'shorts'; } look.shoes = 'sandal'; look.hair = 'low'; break;
    case 'student': if (f) gown(0x9fb8d6); else { look.top = white; look.bottom = 0x24364f; } look.hair = f ? rng.pick(['low', 'braids']) : 'low'; break;
    case 'undergrad': if (f && rng.next() < 0.45) gown(rng.pick(SHIRTS)); break;
    case 'nurse': if (f) { gown(white); look.hat = ['nursecap', white]; look.hair = 'bun'; } else { look.top = white; look.bottom = white; } look.shoeColour = white; break;
    case 'doctor': case 'pharmacist': case 'labscientist': case 'labtech': kaftan(white); look.bottom = rng.pick(TROUSERS); look.sleeves = 'long'; break;
    case 'priest': look.outfit = 'cassock'; look.top = 0xf2efe6; look.bottom = 0xf2efe6; break;
    case 'vicar': look.outfit = 'cassock'; look.top = 0x1c1c1f; look.bottom = 0x1c1c1f; break;
    case 'catechist': kaftan(white); break;
    case 'police': look.outfit = 'uniform'; look.top = 0x1d2233; look.bottom = 0x1d2233; look.hat = ['beret', 0x10182a]; if (f) look.hair = 'bun'; break;
    case 'guard': look.outfit = 'uniform'; look.top = 0x6a5a3a; look.bottom = 0x3a3324; look.hat = ['beret', 0x2a2a2a]; break;
    case 'cleaner': look.top = 0x3d6fa5; look.bottom = 0x3d6fa5; break;
    case 'trader': case 'foodvendor': case 'homemaker': case 'hawker': if (f) wrapper(); else if (rng.next() < 0.3) kaftan(rng.pick(SHIRTS)); break;
    case 'farmer': if (f) wrapper(); else { look.outfit = rng.next() < 0.5 ? 'singlet' : 'shirt'; look.legs = 'shorts'; look.shoes = 'sandal'; } if (rng.next() < 0.6) look.hat = ['strawhat', 0xc9b183]; break;
    case 'fisher': look.legs = 'shorts'; look.shoes = 'sandal'; look.hat = rng.next() < 0.5 ? ['strawhat', 0xc9b183] : ['facecap', 0x2a2a2a]; break;
    case 'okada': look.hat = rng.next() < 0.45 ? ['helmet', rng.pick([0xb3261e, 0x1b1b1e, 0xf5f5f5, 0x2f4f7f])] : ['facecap', rng.pick([0x1b1b1e, 0x8a2f2f, 0x2f4f7f])]; break;
    case 'driver': if (rng.next() < 0.5) look.hat = ['facecap', 0x1b1b1e]; break;
    case 'mechanic': case 'welder': look.top = 0x3a3f4b; look.bottom = 0x2a2a2a; if (rng.next() < 0.4) look.outfit = 'singlet'; break;
    case 'carpenter': case 'labourer': if (rng.next() < 0.4) { look.outfit = 'singlet'; look.legs = 'shorts'; } else if (rng.next() < 0.3) { look.outfit = 'hivis'; look.top = 0xf2c200; } if (rng.next() < 0.35) look.hat = ['helmet', rng.pick([0xe07b1a, 0xf5f5f5, 0xf2c200])]; look.shoeColour = 0x4a3524; break;
    case 'baker': look.top = white; look.hat = ['cap', white]; break;
    case 'retiree': if (f) wrapper(); else kaftan(rng.pick([0xe8e2d0, 0x8a8f96, 0xb5651d, 0x2f4f7f, 0xf3ecdc]), rng.next() < 0.18 ? ['redcap', 0xa01c1c] : rng.next() < 0.6 ? ['cap', rng.pick([0x1b1b1e, 0x2f4f7f, 0x6b2d3a])] : null); break;
    default:
      if (f) { if (rng.next() < 0.4) wrapper(); else if (rng.next() < 0.6) gown(rng.pick(SHIRTS)); } else if (WHITE_COLLAR.has(p.job)) look.sleeves = rng.next() < 0.6 ? 'long' : 'short';
  }
  if (p.people === 'hausa' && !['police', 'guard', 'doctor', 'nurse', 'pupil', 'student'].includes(p.job)) {
    if (f) { gown(rng.pick([0x2f4f7f, 0x6a4a8a, 0x1f5c4d, 0x8a2f2f])); look.hat = ['headtie', look.top]; look.hair = 'low'; } else if (p.age >= 16) kaftan(rng.pick([0xe8e2d0, 0xbcd3ea, 0xf3ecdc, 0x9fb8a0]), ['cap', rng.pick([0xf3ecdc, 0x1b1b1e, 0x7a2f22])]);
  }
  if (p.age < 18) { look.scale = p.age < 6 ? 0.46 + p.age * 0.035 : 0.66 + (p.age - 6) * 0.027; look.beard = false; }
  // The character system dresses them from here: the look above says what their work asks for; their age,
  // their people and their own taste do the rest. It draws on the person's number, not on the shared dice.
  look.age = p.age;
  look.wear = wearFor(p, look);
  const fig = figFor(configFromLook(look));
  return { look: Object.freeze(look), fig: Object.freeze(fig) };
}

// --------------------------------------------------------------- roster --

const rosters = new Map();

// Everyone in the zone, made from the seed. `scale` multiplies the numbers,
// for finding out how the simulation holds up with a bigger town.
// `jobs` is the town's own (ZONE_POPULATION.jobs) unless another list is given: the tests keep the townspeople's
// systems working with the town as it was before its townspeople were taken out (test/helpers.mjs, FORMER_TOWN), ready
// for the owner's own models of them.
const jobsKeys = new WeakMap();
const jobsKey = (jobs) => { if (jobs === ZONE_POPULATION.jobs) return 'town'; if (!jobsKeys.has(jobs)) jobsKeys.set(jobs, `jobs:${JSON.stringify(jobs)}`); return jobsKeys.get(jobs); };
export function rosterOf(seed = ZONE_POPULATION.seed, scale = 1, jobs = ZONE_POPULATION.jobs) {
  const cacheKey = `${seed}|${scale}|${jobsKey(jobs)}`;
  if (rosters.has(cacheKey)) return rosters.get(cacheKey);
  // The town's own people, and those added to it since (ZONE_POPULATION.more: each of his figures ten of the town's people,
  // 30 October 2026): the first made exactly as they were, with the same numbers, names, homes and families (their voices
  // know them by their names: voices.js), and the others after them, made from a seed of their own and numbered on
  // from them.
  const more = jobs === ZONE_POPULATION.jobs && ZONE_POPULATION.more && ZONE_POPULATION.more.length ? ZONE_POPULATION.more : null;
  const first = makeRoster(seed, scale, jobs, 0);
  // (and none of them given the name of one of the first, nor of anyone the voices were written for: voice-lines.js)
  const taken = more ? [...first.map((p) => `${p.first} ${p.surname}`), ...Object.values(VOICE_CAST).map((c) => c.name.replace(/^(Cpl\.|Insp\.|Sgt\.|Mrs|Mr|Nurse|Mama)\s+/, '').trim())] : [];
  const roster = more ? Object.freeze([...first, ...makeRoster(seed + 7919, scale, more, first.length, taken)]) : first;
  rosters.set(cacheKey, roster);
  return roster;
}
function makeRoster(seed, scale, jobs, offset, namesTaken = []) {
  const rng = makeRng(seed);
  const weighted = (list) => { let roll = rng.next(); for (const [value, share] of list) { roll -= share; if (roll <= 0) return value; } return list[0][0]; };
  const people = [];
  // are there okadas in this town at all? (none since 22 October 2026, the owner's brief: their riders are gone, and
  // with them the motorcycles)
  const OKADAS = jobs.some(([job]) => job === 'okada');
  for (const [jobId, count, venue, more = {}] of jobs) {
    const J = JOBS[jobId];
    const n = Math.round(count * scale);
    // (a town may say how many of those in a job are women: its police are all women, 22 October 2026)
    const female = more.female !== undefined ? more.female : J.female;
    for (let k = 0; k < n; k += 1) {
      const gender = rng.next() < female ? 'f' : 'm';
      // children are spread evenly over the classes, so no class overflows
      // (a town may give the ages of those in a job too: his townspeople are grown women and men, 27 October 2026)
      const ages = more.ages || J.ages;
      const age = jobId === 'pupil' || jobId === 'student' ? ages[0] + Math.floor((k * 6) / n) : ages[0] + rng.int(ages[1] - ages[0] + 1);
      // those who work for a church are of a people whose members mostly belong to one
      let kin = weighted(ZONE_POPULATION.peoples);
      if ((venue === 'catholic' || venue === 'anglican') && PEOPLES[kin].faiths[0][0] === 'muslim') kin = ZONE_POPULATION.peoples[0][0];
      people.push({ index: offset + people.length, id: `n-${String(offset + people.length + 1).padStart(4, '0')}`, job: jobId, venue, gender, age, people: kin, k, of: n, relations: [], looks: more.looks || null, figures: more.figures || null });
    }
  }

  // families: couples, then children, students and elders with them
  const grown = people.filter((p) => p.age >= 18 && !JOBS[p.job].clergy && p.job !== 'undergrad' && p.job !== 'retiree');
  const men = grown.filter((p) => p.gender === 'm');
  const women = grown.filter((p) => p.gender === 'f');
  for (let i = men.length - 1; i > 0; i -= 1) { const j = rng.int(i + 1); [men[i], men[j]] = [men[j], men[i]]; }
  const units = [];
  const taken = new Set();
  for (const man of men) {
    let wife = null;
    if (man.age >= 23 && rng.next() < 0.76) {
      const start = rng.int(women.length || 1);
      for (let pass = 0; pass < 2 && !wife; pass += 1) {
        for (let k = 0; k < women.length; k += 1) {
          const w = women[(start + k) % women.length];
          if (taken.has(w.index) || w.age < 20 || w.age > man.age + 2 || w.age < man.age - 14) continue;
          if (pass === 0 && w.people !== man.people) continue;
          wife = w;
          break;
        }
      }
    }
    if (wife) { taken.add(wife.index); if (rng.next() < 0.7) wife.people = man.people; }
    units.push({ head: man, wife, members: wife ? [man, wife] : [man], kids: 0 });
  }
  for (const w of women) if (!taken.has(w.index)) units.push({ head: w, wife: w, members: [w], kids: 0, single: true });
  // young people on their own move in with a family of their own people
  const families = units.filter((u) => u.members.length === 2);
  const keep = [];
  for (const u of units) {
    if (u.members.length === 1 && u.head.age < 30 && families.length && rng.next() < 0.6) {
      const host = families[rng.int(families.length)];
      host.members.push(u.head);
      u.head.rel = 'relative';
      continue;
    }
    keep.push(u);
  }
  const mother = (u) => u.wife;
  // a child goes to a couple (or a parent alone) old enough to be its
  // parents; an elder goes to a household young enough to be its children
  const place = (child, minGap, maxGap, asChild) => {
    let best = null;
    let nearest = null;
    let nearestMiss = Infinity;
    for (let tries = 0; tries < 300 && !best; tries += 1) {
      const u = keep[rng.int(keep.length)];
      const m = mother(u) || u.head;
      const youngest = Math.min(u.head.age, m.age) - child.age;
      const oldest = Math.max(u.head.age, m.age) - child.age;
      if (asChild && u.kids >= 6) continue;
      const miss = Math.max(0, minGap - youngest, oldest - maxGap);
      if (miss === 0) best = u; else if (miss < nearestMiss) { nearestMiss = miss; nearest = u; }
    }
    if (!best) best = nearest || keep[rng.int(keep.length)];
    best.members.push(child);
    if (asChild) { best.kids += 1; child.rel = 'child'; }
    return best;
  };
  const hostels = ZONE_HOMES.filter((h) => h.kind === 'hostel');
  const beds = { m: 0, f: 0 };
  const hostelBeds = hostels.reduce((sum, h) => sum + h.beds, 0) * scale / Math.max(1, hostels.length);
  for (const p of people) {
    if (p.age < 18) place(p, 17, 44, true);
    else if (p.job === 'undergrad') {
      const hall = hostels.length && p.venue === 'university' && beds[p.gender] < hostelBeds ? hostels[p.gender === 'm' ? 0 : hostels.length - 1] : null;
      if (hall) { beds[p.gender] += 1; p.home = hall.id; } else place(p, 17, 46, true);
    } else if (p.job === 'retiree') { const u = place(p, -70, -17, false); p.rel = 'parent'; p.parentOf = u; }
  }

  // a people, a faith and a surname for each family
  const used = new Set(namesTaken);
  const nameIn = (p, surname) => {
    const P = PEOPLES[p.people];
    const pool = p.gender === 'm' ? P.male : P.female;
    for (let tries = 0; tries < 30; tries += 1) {
      const first = p.faith !== 'muslim' && rng.next() < 0.3 ? rng.pick(GIVEN_NAMES[p.gender]) : rng.pick(pool);
      const full = `${first} ${surname}`;
      if (used.has(full) && tries < 29) continue;
      used.add(full);
      p.first = first;
      p.surname = surname;
      return;
    }
  };
  const faithOf = (peopleId) => weighted(PEOPLES[peopleId].faiths);
  let household = 0;
  for (const u of keep) {
    household += 1;
    const kin = u.head.people;
    const surname = rng.pick(PEOPLES[kin].surnames);
    const faith = faithOf(kin);
    for (const m of u.members) {
      m.household = household;
      if (m.rel === 'child' && m.venue !== 'catholic' && m.venue !== 'anglican') m.people = kin;
      m.faith = m === u.head || m.rel === 'child' || rng.next() < 0.85 ? faith : faithOf(m.people);
      const own = m.rel === 'relative' || (m.rel === 'parent' && rng.next() < 0.5);
      nameIn(m, own ? rng.pick(PEOPLES[m.people].surnames) : surname);
    }
    u.surname = surname;
  }
  for (const p of people) {
    if (p.first) continue;
    household += 1;
    p.household = household;
    p.faith = p.job === 'priest' || p.job === 'catechist' || p.job === 'sexton' ? 'catholic' : p.job === 'vicar' ? 'anglican' : faithOf(p.people);
    if (JOBS[p.job].clergy && p.people === 'hausa') p.people = ZONE_POPULATION.peoples[0][0];
    nameIn(p, rng.pick(PEOPLES[p.people].surnames));
  }
  for (const p of people) if (p.venue === 'catholic') p.faith = 'catholic'; else if (p.venue === 'anglican') p.faith = 'anglican';
  // a place in the congregation, so that no two people are given the same pew
  const flock = {};
  for (const p of people) { flock[p.faith] = (flock[p.faith] || 0) + 1; p.flock = flock[p.faith] - 1; }

  // homes: each family goes to a house with room, near where its head works
  const houses = ZONE_HOMES.filter((h) => h.kind === 'house').map((h) => ({ ...h, free: h.beds * scale }));
  const order = keep.slice().sort((a, b) => b.members.length - a.members.length);
  for (const u of order) {
    // somewhere between the places its members go each day
    let wx = 0, wz = 0, anchors = 0;
    for (const m of u.members) { const v = ZONE_VENUES[m.venue]; if (v && (v.x || v.z)) { const weight = m === u.head ? 2 : 1; wx += v.x * weight; wz += v.z * weight; anchors += weight; } }
    if (anchors) { wx /= anchors; wz /= anchors; } else { wx = (rng.next() - 0.5) * 400; wz = (rng.next() - 0.6) * 500; }
    let best = null;
    let bestScore = Infinity;
    for (const h of houses) {
      if (h.free < u.members.length) continue;
      const score = Math.hypot(h.x - wx, h.z - wz) + rng.next() * 50;
      if (score < bestScore) { bestScore = score; best = h; }
    }
    if (!best) best = houses.reduce((a, b) => (b.free > a.free ? b : a));
    best.free -= u.members.length;
    for (const m of u.members) m.home = best.id;
  }
  for (const p of people) {
    if (JOBS[p.job].clergy) p.homeSpot = slot(p.venue, 'residence')[0];
    else {
      if (!p.home) p.home = houses[rng.int(houses.length)].id;
      const h = HOME_BY_ID.get(p.home);
      p.homeSpot = h.home;
      p.frontSpot = h.front.length ? h.front[p.index % h.front.length] : h.home;
      p.quarter = h.quarter;
    }
    if (p.frontSpot === undefined) p.frontSpot = p.homeSpot;
  }

  // kin and friends
  const relate = (a, b, kind, back) => { a.relations.push([b.index, kind]); b.relations.push([a.index, back]); };
  for (const u of keep) {
    if (u.wife && u.wife !== u.head) relate(u.head, u.wife, 'wife', 'husband');
    const kids = u.members.filter((m) => m.rel === 'child');
    for (const kid of kids) { for (const parent of new Set([u.head, u.wife].filter(Boolean))) relate(parent, kid, kid.gender === 'f' ? 'daughter' : 'son', parent.gender === 'f' ? 'mother' : 'father'); }
    for (let i = 1; i < kids.length; i += 1) relate(kids[i - 1], kids[i], kids[i].gender === 'f' ? 'sister' : 'brother', kids[i - 1].gender === 'f' ? 'sister' : 'brother');
    for (const m of u.members) if (m.rel === 'parent') relate(m, u.head, u.head.gender === 'f' ? 'daughter' : 'son', m.gender === 'f' ? 'mother' : 'father');
    for (const m of u.members) if (m.rel === 'relative') relate(m, u.head, 'relative', 'relative');
    u.firstChild = kids.length ? kids.slice().sort((a, b) => b.age - a.age)[0] : null;
  }
  const mates = new Map();
  for (const p of people) { const key = `${p.job}|${p.venue}|${Math.floor(p.age / (p.age < 18 ? 1 : 12))}`; if (!mates.has(key)) mates.set(key, []); mates.get(key).push(p); }
  for (const group of mates.values()) for (let i = 1; i < group.length; i += 2) relate(group[i - 1], group[i], group[i].age < 18 ? 'classmate' : group[i].job === 'undergrad' ? 'course mate' : 'friend', group[i - 1].age < 18 ? 'classmate' : group[i - 1].job === 'undergrad' ? 'course mate' : 'friend');
  const firstChildOf = new Map();
  for (const u of keep) if (u.firstChild) for (const parent of [u.head, u.wife]) if (parent) firstChildOf.set(parent.index, u.firstChild);

  // names in full, languages, temperament, how they get about, what they wear
  for (const p of people) {
    const J = JOBS[p.job];
    const P = PEOPLES[p.people];
    let title = '';
    if (p.job === 'doctor') title = 'Dr.';
    else if (p.job === 'priest') title = 'Rev. Fr.';
    else if (p.job === 'vicar') title = 'Ven.';
    else if (p.job === 'nurse') title = 'Nurse';
    else if (p.job === 'lecturer') title = p.age > 50 && rng.next() < 0.4 ? 'Prof.' : rng.next() < 0.6 ? 'Dr.' : '';
    else if (p.job === 'police') title = rng.pick(['Insp.', 'Sgt.', 'Cpl.', 'Cpl.']);
    else if (p.job === 'retiree' && p.gender === 'm' && ZONE_POPULATION.chiefs.includes(p.people) && rng.next() < 0.18) title = 'Chief';
    else if (p.people === 'hausa' && p.age >= 40) title = p.gender === 'm' ? (rng.next() < 0.5 ? 'Alhaji' : 'Mallam') : (rng.next() < 0.4 ? 'Hajiya' : '');
    p.title = title;
    p.name = title ? `${title} ${p.first} ${p.surname}` : `${p.first} ${p.surname}`;
    const child = firstChildOf.get(p.index);
    const married = p.relations.some(([, kind]) => kind === 'husband');
    if (title) p.short = `${title} ${p.surname}`;
    else if (child && ['trader', 'foodvendor', 'homemaker', 'farmer', 'hawker'].includes(p.job) && rng.next() < 0.45) p.short = `${p.gender === 'f' ? 'Mama' : 'Papa'} ${child.first}`;
    else if (p.age >= 35) p.short = `${p.gender === 'm' ? 'Mr' : married ? 'Mrs' : 'Madam'} ${p.surname}`;
    else p.short = p.first;

    const langs = [];
    const schooled = WHITE_COLLAR.has(p.job) || p.job === 'pupil';
    if (P.language) langs.push(P.language);
    if (p.age >= 5 && rng.next() < 0.93) langs.push('pcm');
    if (p.age >= 8 && (schooled || rng.next() < 0.55)) langs.push('en');
    if (P.language !== 'ig' && p.age >= 6 && rng.next() < ZONE_POPULATION.secondIgbo) langs.push('ig');
    if (!langs.length) langs.push('pcm');
    p.langs = Object.freeze(langs);
    p.lang = langs[0];
    const traits = [];
    while (traits.length < 2 + (rng.next() < 0.4 ? 1 : 0)) { const t = rng.pick(TRAITS); if (!traits.includes(t)) traits.push(t); }
    if (p.faith !== 'other' && rng.next() < 0.14 && !traits.includes('devout')) traits[0] = 'devout';
    p.traits = Object.freeze(traits);
    p.income = p.job === 'trader' && p.k < 13 * scale ? 'middle' : J.income;
    // (nobody rides an okada in a town that has none; an officer on duty walks her beat)
    p.transport = OKADAS && p.age >= 16 && p.job !== 'okada' && p.job !== 'police' && rng.next() < (p.job === 'undergrad' || p.job === 'student' ? 0.2 : OKADA_SHARE[p.income]) ? 'okada' : 'walk';
    // children half run everywhere; the old take their time
    p.pace = p.age < 6 ? 1.6 : p.age < 14 ? 2.3 : p.age < 18 ? 2.1 : p.age >= 65 ? 1.35 : 1.75 + rng.next() * 0.3;
    // (an officer walks her beat at a patrol's pace, not a commuter's)
    if (p.job === 'police') p.pace = 1.32 + (p.pace - 1.75) * 0.5;
    p.side = (rng.next() - 0.5) * 2.2;
    p.early = Math.floor(rng.next() * 16) * 60;
    p.night = !!J.shifts && (p.job === 'doctor' ? p.k === 4 : p.job === 'nurse' ? p.k >= 7 : p.k % 2 === 1);
    Object.assign(p, dress(p, rng));
  }

  assignPosts(people, scale);
  // those who live far from where their day is spent ride more often
  for (const p of people) {
    const to = p.post.seat !== undefined ? p.post.seat : p.post.work;
    if (!OKADAS || p.age < 12 || p.transport === 'okada' || p.job === 'okada' || p.job === 'police' || to === undefined) continue;
    if (graphDistance(SPOT_NODE[p.homeSpot], SPOT_NODE[to]) > 380 && rng.next() < 0.3) p.transport = 'okada';
  }
  for (const p of people) { delete p.k; delete p.of; delete p.rel; delete p.parentOf; delete p.looks; p.relations = Object.freeze(p.relations.map(Object.freeze)); Object.freeze(p.post); Object.freeze(p); }
  return Object.freeze(people);
}

// Gives everyone the places their day is spent in: a desk, a seat, a stall.
function assignPosts(people, scale) {
  const next = new Map();
  const take = (list, key) => { if (!list.length) return undefined; const n = next.get(key) || 0; next.set(key, n + 1); return list[n % list.length]; };
  const pickBy = (list, p, salt) => (list.length ? list[mix(p.index, salt) % list.length] : undefined);
  // a seat at the nearest food seller, while there are seats
  // (an officer's number among all the police, whichever line of the town's list she or he is in: atani.js has two, the
  // women's and the men's; numbered a woman, a man, a woman, so that each shift has both)
  const officerNo = new Map();
  {
    const women = people.filter((q) => q.job === 'police' && q.gender === 'f'), men = people.filter((q) => q.job === 'police' && q.gender !== 'f');
    for (let k = 0, n = 0; k < Math.max(women.length, men.length); k += 1) { if (women[k]) officerNo.set(women[k].index, n++); if (men[k]) officerNo.set(men[k].index, n++); }
  }
  const lunch = (p) => { let best = null; let bestD = Infinity; const v = ZONE_VENUES[p.venue] || { x: 0, z: 0 }; for (const f of FOOD) { const d = Math.hypot(f.x - v.x, f.z - v.z); if (d < bestD) { bestD = d; best = f; } } if (!best) return undefined; const seats = slot(best.id, 'customer'); const n = next.get(best.id) || 0; if (n >= seats.length * scale) return undefined; next.set(best.id, n + 1); return seats[n % seats.length]; };
  for (const p of people) {
    const v = p.venue;
    const post = { front: p.frontSpot };
    const J = p.job;
    if (J === 'pupil' || J === 'student') {
      const rooms = roomsOf(v, 'classroom');
      const room = rooms[Math.min(rooms.length - 1, p.age - JOBS[J].ages[0])];
      post.room = room.id;
      post.seat = take(inRoom(room.id, 'classroom.seat'), `${room.id}s`);
      post.assembly = take(slot(v, 'assembly'), `${v}a`);
      post.play = take(slot(v, 'play'), `${v}p`);
    } else if (J === 'undergrad') {
      const rooms = roomsOf(v, 'classroom', 'lecture');
      const room = rooms[p.k % rooms.length];
      post.room = room.id;
      post.seat = take(inRoom(room.id, `${room.kind}.seat`), `${room.id}s`);
      const second = [...slot(v, 'lab.seat'), ...slot(v, 'library.seat'), ...slot(v, 'workshop.seat')];
      post.alt = take(second, `${v}alt`);
      post.hang = take(slot(v, 'quad'), `${v}q`);
      post.eat = slot(v, 'cafeteria.seat').length ? take(slot(v, 'cafeteria.seat'), `${v}c`) : lunch(p);
      if (post.eat === undefined) post.eat = post.hang;
    } else if (J === 'teacher') {
      const rooms = roomsOf(v, 'classroom');
      if (p.k < rooms.length) { post.room = rooms[p.k].id; post.work = inRoom(rooms[p.k].id, 'classroom.teacher')[0]; } else post.work = take([...slot(v, 'lab.teacher'), ...slot(v, 'library.desk'), ...slot(v, 'staffroom.seat')], `${v}tx`);
      post.rest = take(slot(v, 'staffroom.seat'), `${v}st`);
      post.assembly = take(slot(v, 'assembly-front'), `${v}af`);
    } else if (J === 'headteacher' || J === 'principal') {
      post.work = slot(v, 'office.desk')[0];
      post.assembly = slot(v, 'assembly-front')[3];
    } else if (J === 'schoolstaff') {
      const posts = [...slot(v, 'gate'), ...slot(v, 'office.desk').slice(1), ...slot(v, 'sweep')];
      post.work = take(posts, `${v}ss`);
      post.alt = take(slot(v, 'sweep'), `${v}sw`);
    } else if (J === 'labtech') post.work = slot(v, 'lab.teacher')[0];
    else if (J === 'lecturer') {
      post.desk = take([...slot(v, 'office.desk').slice(1), ...slot(v, 'staffroom.seat')], `${v}ld`);
      post.work = take([...slot(v, 'lecture.teacher'), ...slot(v, 'classroom.teacher')], `${v}lt`);
      post.alt = take([...slot(v, 'lab.teacher'), ...slot(v, 'workshop.teacher'), ...slot(v, 'classroom.teacher')], `${v}la`);
    } else if (J === 'officer' || J === 'records' || J === 'librarian') {
      post.work = J === 'librarian' ? slot(v, 'library.desk')[0] : J === 'records' ? take([...slot(v, 'reception.desk'), slot(v, 'office.desk')[0], slot(v, 'office.visitor')[0]], `${v}rec`) : take(slot(v, 'office.desk'), `${v}of`);
      post.eat = lunch(p);
    } else if (J === 'guard') post.work = take(slot(v, 'gate'), `${v}g`);
    else if (J === 'doctor') {
      const desks = [...slot(v, 'consulting.desk'), slot(v, 'office.desk')[1], slot(v, 'emergency.desk')[0]];
      post.work = desks[p.k % desks.length];
      post.alt = take(slot(v, 'ward.bedside'), `${v}round`);
      post.eat = lunch(p);
    } else if (J === 'nurse') {
      const day = [...slot(v, 'ward.desk'), slot(v, 'office.desk')[2], ...slot(v, 'emergency.bedside').slice(0, 1), slot(v, 'reception.queue')[1], slot(v, 'consulting.couch')[0]];
      post.work = p.night ? [...slot(v, 'ward.desk'), slot(v, 'emergency.desk')[0], slot(v, 'office.desk')[2]][(p.k - 7) % 5] : day[p.k % day.length];
      post.alt = take(slot(v, 'ward.bedside'), `${v}nr`);
    } else if (J === 'pharmacist') post.work = p.k === 0 ? slot(v, 'pharmacy.desk')[0] : slot(v, 'lab.seat')[0];
    else if (J === 'labscientist') post.work = slot(v, 'lab.teacher')[0];
    else if (J === 'cleaner') {
      if (slot(v, 'sweep').length) { post.work = take(slot(v, 'sweep'), `${v}cl`); post.alt = take(slot(v, 'yard'), `${v}cy`); } else post.work = slot(v, 'inside')[0];
    } else if (J === 'ambulance') post.work = slot(v, 'ambulance')[0];
    else if (J === 'priest') { post.work = slot(v, 'nave.priest')[0]; post.desk = slot(v, 'office.desk')[p.k % 2]; post.kneel = slot(v, 'nave.kneel')[p.k]; post.alt = take(slot('hospital', 'ward.bedside'), 'chaplain'); if (p.k > 0) post.work = slot(v, 'nave.kneel')[3]; }
    else if (J === 'vicar') { post.work = slot(v, 'nave.priest')[0]; post.desk = slot(v, 'office.desk')[0]; post.alt = slot(v, 'hall.teacher')[0]; }
    else if (J === 'catechist') { post.work = slot(v, 'nave.lector')[0]; post.desk = slot(v, 'office.visitor')[0]; post.alt = slot(v, 'hall.teacher')[0]; }
    else if (J === 'sexton') { post.work = slot(v, 'nave.bell')[0]; post.door = slot(v, 'nave.door')[0]; post.alt = slot(v, 'sweep')[0]; post.rest = slot(v, 'sweep')[1]; }
    else if (J === 'churchworker') { post.work = take([...slot(v, 'sweep'), ...slot(v, 'office.visitor'), ...slot(v, 'yard')], `${v}cw`); post.alt = take(slot(v, 'yard'), `${v}cwy`); post.choir = take(slot(v, 'nave.choir'), `${v}ch`); }
    else if (J === 'trader') post.work = p.k < slot('market', 'trader').length * scale ? take(slot('market', 'trader'), 'stall') : take(slot('market', 'petty'), 'petty');
    else if (['tailor', 'barber', 'mechanic', 'carpenter', 'welder', 'foodvendor', 'baker'].includes(J)) {
      const spots = SHEDS.filter((s) => s.trade === J).flatMap((s) => slot(s.id, 'work'));
      post.work = take(spots, `work-${J}`);
      post.shed = ZONE_SPOTS[post.work].venue;
    } else if (J === 'apprentice') {
      const spots = SHEDS.filter((s) => s.trade !== 'foodvendor').flatMap((s) => slot(s.id, 'apprentice'));
      post.work = take(spots, 'apprentice');
      post.shed = ZONE_SPOTS[post.work].venue;
    } else if (J === 'farmer') { post.work = take(slot('farm', 'field'), 'field'); post.rest = take(slot('farm', 'rest'), 'farmrest'); }
    else if (J === 'fisher') { post.work = take([...slot('shore', 'fish'), ...slot('shore', 'jetty')], 'fish'); post.alt = take(slot('shore', 'mend'), 'mend'); }
    else if (J === 'okada') post.work = take(Object.values(ZONE_VENUES).filter((x) => x.kind === 'rank').flatMap((r) => slot(r.id, 'rank')), 'rank');
    else if (J === 'driver') { post.work = take([...slot('park', 'driver'), ...slot('park', 'hang')], 'driver'); post.eat = lunch(p); }
    else if (J === 'police') {
      // her beat and her shift (atani-patrols.js), the day's officers first, beat by beat, then the night's: she
      // reports for duty at the Police Post, walks her beat, and signs off there
      const n = officerNo.get(p.index);
      const duty = PATROL_DUTIES.length ? PATROL_DUTIES[n % PATROL_DUTIES.length] : null;
      post.work = slot('police', 'inside')[0];
      if (duty) { post.patrol = duty.beat; post.officer = n; p.night = duty.night; } else post.beats = slot('police', 'beat');
    }
    else if (J === 'clerk') { post.work = slot(p.k < 6 * scale ? 'secretariat' : 'registry', 'inside')[0]; post.eat = lunch(p); }
    else if (J === 'labourer') { post.work = take([...slot('yard', 'work'), ...slot('yard', 'site')], 'labour'); post.eat = lunch(p); }
    else if (J === 'hawker') post.round = [0, 1, 2, 3].map((n) => pickBy(slot('street', 'hawk'), p, 20 + n));
    else if (J === 'unemployed' || J === 'motorist') { post.hang = pickBy([...slot('street', 'hang'), ...slot('park', 'hang')], p, 31); post.alt = pickBy([...slot('street', 'hang'), ...slot('shore', 'mend')], p, 32); }
    else if (J === 'retiree') post.hang = pickBy(slot('street', 'hang'), p, 33);
    if (post.work === undefined && !['infant', 'pupil', 'student', 'undergrad', 'hawker', 'unemployed', 'motorist', 'retiree', 'homemaker'].includes(J)) post.work = p.homeSpot;
    p.post = post;
  }
}

// What someone is, said in a few words.
function roleOf(p) {
  const J = JOBS[p.job];
  const v = ZONE_VENUES[p.venue];
  const room = p.post.room ? ZONE_ROOMS.find((r) => r.id === p.post.room) : null;
  const at = v && v.kind !== 'street' && v.kind !== 'home' ? v.name : '';
  switch (p.job) {
    case 'infant': return 'Child';
    case 'pupil': case 'student': return `${room.name} ${p.job === 'pupil' ? 'pupil' : 'student'}, ${at}`;
    case 'undergrad': return `Student, ${at}`;
    case 'teacher': return room ? `${room.name} teacher, ${at}` : `Teacher, ${at}`;
    case 'barber': return p.gender === 'f' ? 'Hairdresser' : 'Barber';
    case 'fisher': return p.gender === 'f' ? 'Fish seller' : 'Fisherman';
    case 'trader': return ZONE_SPOTS[p.post.work].slot === 'trader' ? 'Stall trader at the market' : 'Petty trader at the market';
    case 'tailor': case 'mechanic': case 'carpenter': case 'welder': case 'foodvendor': case 'baker': case 'apprentice': return p.job === 'apprentice' ? `Apprentice ${ZONE_VENUES[p.post.shed].trade}` : J.name;
    case 'retiree': return 'Retired';
    case 'unemployed': return 'Looking for work';
    case 'homemaker': return 'Homemaker';
    case 'hawker': case 'farmer': case 'okada': return J.name;
    default: return at ? `${J.name}, ${at}` : J.name;
  }
}

// ----------------------------------------------------------------- days --

const T = (h, m = 0) => h * 3600 + m * 60;
const EARLIEST = T(4, 50);

export function dayInfo(dayIndex) {
  const weekday = (ZONE_POPULATION.firstWeekday + dayIndex) % 7;
  return { index: dayIndex, weekday, name: WEEKDAYS[weekday], school: weekday >= 1 && weekday <= 5, sunday: weekday === 0, saturday: weekday === 6, friday: weekday === 5 };
}

// A police officer's day (22 October 2026). By day she reports at the Police Post at six, walks her beat until half
// past six in the evening, round its stops in their order and standing a minute or so at each, and signs off at the
// post; by night she is out from six in the evening until six in the morning. A night officer is at the first stop
// of her beat at midnight, where the next day's plan finds her: nobody is moved in a jump. Every walk is timed the
// way the day itself times it (the length of the way, her pace, and how many game seconds a real one is), so that
// the stops are set off for when she has really got to the last one and stood her time there.
function patrolDay(p, d, timeScale, { be, go, j }) {
  const B = PATROL_BY_ID.get(p.post.patrol);
  const order = B.round.map((k) => B.spots[k]);
  const station = p.post.work;
  const home = p.homeSpot;
  const walk = (a, b) => (a === b ? 0 : (pathBetween(a, b).len / p.pace) * timeScale);
  // how long she stands at a stop: half a minute to a minute and a quarter, in real seconds
  const stand = (n) => Math.round((30 + unit(p.index, d.index * 131 + n, 77) * 45) * timeScale);
  // Round the beat from `at`, setting off at `t`, for as long as she can still get from the stop after the next to
  // `back` by `until`; gives where she is and when she is free.
  const round = (at, t, n, until, back) => {
    let time = t;
    for (let count = 0; count < 5000; count += 1) {
      const next = order[n % order.length];
      const there = time + walk(at, next);
      if (there + walk(next, back) > until) break;
      go(time, next, 'On patrol');
      time = there + stand(count);
      at = next; n += 1;
    }
    return { at, time };
  };
  // to the Police Post to sign off, setting off so as to be there at `by` (or as soon as she can), and then home
  const signOff = (from, by, homeAt) => {
    const leave = Math.max(from.time, by - walk(from.at, station));
    go(leave, station, 'Signing off at the Police Post');
    go(Math.max(homeAt, leave + walk(from.at, station) + 10 * timeScale), home, 'At home');
  };
  // (two officers of one beat do not walk it together: each begins her round at a stop of her own)
  const begin = (p.post.officer * 3 + d.index) % order.length;
  if (!p.night) {
    be(T(6), station, 'Reporting for duty at the Police Post');
    signOff(round(station, T(6, 12) + j(6), begin, T(18, 40), station), T(18, 40), T(18, 55) + j(10));
    return { start: home, startAct: 'Asleep at home' };
  }
  // by night: out from midnight, from the first stop of her round, until six in the morning; and again from six in the
  // evening, back at that first stop before midnight
  const first = order[0];
  signOff(round(first, T(0, 1), 1, T(6, 10), station), T(6, 10), T(6, 30) + j(10));
  be(T(18), station, 'Reporting for duty at the Police Post');
  round(station, T(18, 12) + j(6), begin, T(23, 40), first);
  be(T(23, 58), first, 'On patrol');
  return { start: first, startAct: 'On patrol' };
}

// The stops of one person's day. `be` means be there by that time; `go`
// means set off at that time.
function routine(p, d, seed, timeScale = 30) {
  const stops = [];
  let calls = 0;
  const j = (minutes) => Math.floor(unit(p.index, seed + d.index, calls += 1) * minutes) * 60;
  const chance = (share, salt) => unit(p.index, seed + d.index * 7, salt) < share;
  const be = (t, spot, act) => { if (spot !== undefined) stops.push({ t, spot, act, arrive: true }); };
  const go = (t, spot, act) => { if (spot !== undefined) stops.push({ t, spot, act, arrive: false }); };
  // move on some minutes after getting to the place before, whenever that turns out to be
  const then = (minutes, spot, act) => { if (spot !== undefined && stops.length) stops.push({ t: stops[stops.length - 1].t + 1, spot, act, arrive: false, dwell: minutes * 60 }); };
  const any = (list, salt) => (list.length ? list[mix(p.index, d.index, salt) % list.length] : undefined);
  const home = p.homeSpot;
  const post = p.post;
  const J = JOBS[p.job];
  let start = home;
  let startAct = 'Asleep at home';
  const v = p.venue;
  const church = p.faith === 'catholic' ? 'catholic' : p.faith === 'anglican' ? 'anglican' : null;
  const seats = church ? CONGREGATION[church] : null;
  // three Masses on a Sunday, or two services, share out the pews
  const sittings = church === 'catholic' ? 3 : 2;
  const pew = church ? seats[Math.floor(p.flock / sittings) % seats.length] : undefined;
  const shop = (salt) => any([...slot('market', 'customer'), ...slot('market', 'stroll')], salt);
  const sitOut = (from, to) => { go(from, post.front, 'Sitting outside the house'); go(to, home, 'At home'); };
  // somewhere to go that is not a long walk: the place itself if it is near, or the front of the house
  const nearby = (spot) => (spot !== undefined && pathBetween(home, spot).len < 320 ? spot : post.front);

  // someone who is ill today goes to the hospital instead of to work
  const sick = unit(p.index, seed + 11, d.index);
  const works = !['infant'].includes(p.job);
  if (!d.sunday && works && p.venue !== 'hospital' && !J.clergy && !post.patrol && sick < 0.034) {
    if (sick < 0.005) { be(T(7, 40) + j(40), any(slot('hospital', 'ward.bed'), 4), 'Admitted to hospital'); go(T(17) + j(30), home, 'Resting at home'); }
    else if (sick < 0.007) { be(T(9) + j(300), any(slot('hospital', 'emergency.bed'), 4), 'Being treated at the emergency room'); then(70, home, 'Resting at home'); }
    else {
      const t = T(8, 20) + Math.floor(((sick - 0.007) / 0.027) * 330) * 60;
      be(t, any(slot('hospital', 'reception.queue'), 5), 'At the hospital reception');
      then(7, any(slot('hospital', 'reception.wait'), 6), 'Waiting to see the doctor');
      then(28, any(slot('hospital', 'consulting.patient'), 7), 'With the doctor');
      then(16, any(slot('hospital', 'pharmacy.customer'), 8), 'Collecting medicine');
      then(9, home, 'Resting at home');
    }
    return { stops, start, startAct, ill: true };
  }

  // a police officer's day: her beat, by day or by night, every day of the week
  if (post.patrol) { const day = patrolDay(p, d, timeScale, { be, go, j }); return { stops, start: day.start, startAct: day.startAct }; }

  if (d.sunday && !['nurse', 'doctor', 'guard', 'police', 'okada', 'ambulance'].includes(p.job)) {
    if (p.job === 'priest') { be(T(6, 10), post.work, 'Saying Mass'); go(T(11, 5), post.desk, 'In the parish office'); go(T(12, 30), home, 'At the parish house'); go(T(17, 30), post.kneel, 'At evening prayer'); go(T(18, 30), home, 'At the parish house'); }
    else if (p.job === 'vicar') { be(T(7, 10), post.work, 'Leading the service'); go(T(11, 45), any(slot(v, 'yard'), 2), 'Greeting the congregation'); go(T(12, 15), home, 'At the vicarage'); }
    else if (church) {
      const from = church === 'catholic' ? [T(6, 25), T(8), T(9, 45)][p.flock % 3] : [T(7, 25), T(9, 55)][p.flock % 2];
      const to = from + (church === 'catholic' ? T(1, 15) : T(1, 45));
      const seat = p.job === 'sexton' ? post.door : p.job === 'catechist' ? post.work : post.choir !== undefined ? post.choir : pew;
      be(from - j(12), seat, church === 'catholic' ? 'At Sunday Mass' : 'At Sunday service');
      go(to + j(4), any(slot(church, 'yard'), 9), 'Talking after church');
      then(12, home, 'At home');
      if (chance(0.5, 41)) sitOut(T(16) + j(60), T(18, 30) + j(30));
    } else if (chance(0.5, 42)) { sitOut(T(10) + j(120), T(12, 30)); sitOut(T(16, 30), T(18, 40)); }
    return { stops, start, startAct };
  }

  // early Mass for the devout, before the day begins
  // early Mass for the devout who live near enough to get there and back to their day
  const firstPlace = post.assembly !== undefined ? post.assembly : post.seat !== undefined ? post.seat : post.work !== undefined ? post.work : home;
  const free = ['retiree', 'homemaker', 'unemployed'].includes(p.job);
  const weekdayPew = church ? seats[p.flock % seats.length] : undefined;
  if (church === 'catholic' && !J.early && !p.night && p.age >= 12 && (p.traits.includes('devout') || chance(free ? 0.3 : 0.04, 43)) && !d.saturday && pathBetween(home, weekdayPew).len < 400 && (free || pathBetween(weekdayPew, firstPlace).len < 280)) { be(T(6, 27), weekdayPew, 'At morning Mass'); go(T(7, 12), home, 'At home'); }
  if (p.faith === 'muslim' && d.friday && p.age >= 10) { go(T(12, 50), slot('mosque', 'inside')[0], 'At Friday prayers'); if (post.work !== undefined) go(T(13, 50), post.work, 'Back at work'); }

  const offDuty = (d.saturday) && ['pupil', 'student', 'undergrad', 'teacher', 'headteacher', 'principal', 'schoolstaff', 'labtech', 'lecturer', 'officer', 'librarian', 'records', 'clerk', 'pharmacist', 'labscientist'].includes(p.job);
  if (d.saturday && p.age >= 18 && (offDuty || p.job === 'unemployed')) { go(T(7) + j(20), post.front, 'Clearing the drain for sanitation'); go(T(8, 50) + j(20), home, 'At home'); }
  if (offDuty) {
    if (p.age < 18) {
      if (church === 'catholic' && chance(0.3, 44)) { be(T(10), any(slot('catholic', 'hall.seat'), 12), 'At catechism class'); go(T(11, 15), home, 'At home'); }
      else { go(T(9, 30) + j(60), post.front, 'Playing outside'); go(T(12), home, 'At home'); }
      go(T(15, 30) + j(40), chance(0.4, 45) && post.play !== undefined && p.age >= 12 ? any(slot('street', 'hang'), 13) : post.front, 'Playing outside'); go(T(18) + j(30), home, 'At home');
    } else {
      go(T(9, 45) + j(60), shop(14), 'Shopping at the market'); then(30, home, 'At home');
      if (post.hang !== undefined) { go(T(15) + j(60), post.hang, 'With friends'); go(T(18) + j(40), home, 'At home'); } else sitOut(T(16) + j(40), T(18, 30) + j(30));
    }
    return { stops, start, startAct };
  }

  const lunchBreak = (t, back, act) => { if (post.eat !== undefined && chance(0.7, 46)) { go(t + j(15), post.eat, 'Eating'); then(30, back, act); } };
  const close = v === 'primary' ? T(13, 30) : T(14, 30);
  switch (p.job) {
    case 'infant': go(T(9) + j(40), post.front, 'Playing outside'); go(T(11, 45) + j(20), home, 'At home'); go(T(16) + j(30), post.front, 'Playing outside'); go(T(18) + j(20), home, 'At home'); break;
    case 'pupil': case 'student':
      be(T(7, 40), post.assembly, 'At morning assembly'); go(T(8, 10), post.seat, 'In class'); go(p.job === 'pupil' ? T(10, 30) : T(11), post.play, 'On break'); go(p.job === 'pupil' ? T(11) : T(11, 30), post.seat, 'In class'); go(close + j(6), home, 'At home');
      if (church === 'catholic' && p.job === 'pupil' && chance(0.12, 47)) { be(T(16), any(slot('catholic', 'hall.seat'), 12), 'At catechism class'); go(T(17), home, 'At home'); }
      else if (chance(0.6, 48)) { go(T(15, 45) + j(40), post.front, 'Playing outside'); go(T(18) + j(25), home, 'At home'); }
      break;
    case 'undergrad':
      be(T(8, 30) + (p.index % 3) * 1800, post.seat, 'In a lecture'); go(T(11, 45), post.hang, 'Between lectures'); go(T(12, 30) + j(10), post.eat, 'Eating'); then(30, post.alt !== undefined ? post.alt : post.seat, 'Studying'); go(T(15, 45) + j(20), post.hang, 'With friends'); go(T(17, 15) + j(30), home, 'At home');
      if (chance(0.25, 49) && slot(v, 'library.seat').length) { go(T(19, 30), any(slot(v, 'library.seat'), 15), 'Reading in the library'); go(T(21, 10), home, 'At home'); }
      break;
    case 'teacher': be(T(7, 30), post.assembly, 'Taking assembly'); go(T(8, 10), post.work, post.room ? 'Teaching' : 'Preparing lessons'); go(v === 'primary' ? T(10, 30) : T(11), post.rest, 'On break in the staff room'); go(v === 'primary' ? T(11) : T(11, 30), post.work, post.room ? 'Teaching' : 'Preparing lessons'); go(close, post.rest, 'Marking books'); go(close + T(0, 40) + j(15), home, 'At home'); break;
    case 'headteacher': case 'principal': be(T(7, 30), post.assembly, 'Taking assembly'); go(T(8, 15), post.work, 'In the office'); go(close + T(0, 50), home, 'At home'); break;
    case 'schoolstaff': be(T(7), post.work, ZONE_SPOTS[post.work].slot === 'gate' ? 'Minding the gate' : 'At work'); if (ZONE_SPOTS[post.work].slot === 'sweep') { go(T(10), post.alt, 'Sweeping the compound'); go(T(12), post.work, 'Sweeping the compound'); } go(close + T(1), home, 'At home'); break;
    case 'labtech': be(T(7, 45), post.work, 'Setting up the laboratory'); go(T(15), home, 'At home'); break;
    case 'lecturer': be(T(8, 30), post.desk, 'In the office'); go(T(9, 20), post.work, 'Lecturing'); go(T(11, 45), post.desk, 'In the office'); go(T(13, 10), post.alt, 'Taking a practical class'); go(T(15, 30), post.desk, 'In the office'); go(T(16, 30) + j(20), home, 'At home'); break;
    case 'officer': case 'records': case 'clerk': be(T(7, 55), post.work, 'At work'); lunchBreak(T(12, 45), post.work, 'At work'); go(T(16) + j(15), home, 'At home'); break;
    case 'librarian': be(T(8), post.work, 'At the library desk'); go(T(18), home, 'At home'); break;
    case 'guard': case 'police': case 'nurse': case 'doctor':
      if (p.night) { start = post.work; startAct = 'On night duty'; go(T(7, 12) + j(8), home, 'Asleep at home'); be(T(19), post.work, 'On night duty'); break; }
      if (p.job === 'guard') { be(T(6, 30), post.work, 'On guard at the gate'); go(T(18, 35), home, 'At home'); }
      else if (p.job === 'police') { be(T(6, 50), post.work, 'On the beat'); for (const [k, t] of [[1, T(9, 30)], [2, T(12, 30)], [3, T(15, 30)]]) go(t + j(10), post.beats[(p.index + k) % post.beats.length], 'On the beat'); go(T(19, 5), home, 'At home'); }
      else if (p.job === 'nurse') { be(T(7), post.work, 'On duty'); go(T(10), post.alt, 'Doing the ward round'); go(T(11, 30), post.work, 'On duty'); go(T(15), post.alt, 'Doing the ward round'); go(T(16, 30), post.work, 'On duty'); go(T(19, 8), home, 'At home'); }
      else { be(T(8), post.work, 'Seeing patients'); go(T(12, 50), post.eat !== undefined ? post.eat : post.work, 'At lunch'); then(30, post.alt, 'On the ward round'); go(T(15, 30), post.work, 'Seeing patients'); go(T(17) + j(20), home, 'At home'); }
      break;
    case 'pharmacist': case 'labscientist': be(T(8), post.work, p.job === 'pharmacist' ? 'Dispensing medicine' : 'Running tests'); go(T(17) + j(10), home, 'At home'); break;
    case 'cleaner': be(T(7), post.work, 'Cleaning'); if (post.alt !== undefined) { go(T(9, 30), post.alt, 'Cleaning'); go(T(12), post.work, 'Cleaning'); } go(T(15), home, 'At home'); break;
    case 'ambulance': be(T(7), post.work, 'Standing by with the ambulance'); go(T(19), home, 'At home'); break;
    case 'priest':
      if (post.work === slot(v, 'nave.priest')[0]) { be(T(6, 10), post.work, 'Saying Mass'); go(T(7, 15), post.desk, 'In the parish office'); go(T(12), post.kneel, 'At midday prayer'); go(T(12, 30), home, 'At the parish house'); go(T(15), post.alt, 'Visiting the sick'); go(T(16, 20), post.kneel, 'At evening prayer'); go(T(18, 30), home, 'At the parish house'); }
      else { be(T(6, 15), post.work, 'At Mass'); go(T(7, 15), post.desk, 'In the parish office'); go(T(12, 30), home, 'At the parish house'); go(T(15), post.desk, 'Hearing parishioners'); go(T(17, 30), post.kneel, 'At evening prayer'); go(T(18, 30), home, 'At the parish house'); }
      break;
    case 'vicar': be(T(8), post.desk, 'In the vicar\'s office'); go(T(12), post.work, 'At midday prayer'); go(T(12, 40), home, 'At the vicarage'); go(T(15, 30), post.desk, 'In the vicar\'s office'); if (d.weekday === 3) go(T(16, 50), post.alt, 'Leading Bible study'); go(T(18, 15), home, 'At the vicarage'); break;
    case 'catechist': be(T(6, 15), post.work, 'Reading at Mass'); go(T(7, 20), post.desk, 'In the parish office'); go(T(13), home, 'At home'); be(T(15, 50), post.alt, 'Teaching catechism'); go(T(17, 10), home, 'At home'); break;
    case 'sexton': be(T(5, 58), post.work, 'Ringing the bell'); go(T(6, 22), post.door, 'Minding the church door'); go(T(7, 20), post.alt, 'Sweeping the church yard'); be(T(11, 58), post.work, 'Ringing the Angelus'); go(T(12, 10), post.rest, 'Sweeping the church yard'); go(T(14), home, 'At home'); be(T(17, 58), post.work, 'Ringing the Angelus'); go(T(18, 15), home, 'At home'); break;
    case 'churchworker': be(T(8), post.work, 'Working at the church'); go(T(11), post.alt, 'Working at the church'); go(T(13), home, 'At home'); if (d.weekday === 3 || d.saturday) { be(T(17), post.choir, 'At choir practice'); go(T(18, 15), home, 'At home'); } break;
    case 'trader': be(T(6, 40) + p.early, post.work, 'Selling at the market'); go(T(18, 15) + j(25), home, 'At home'); break;
    case 'tailor': case 'barber': case 'mechanic': case 'carpenter': case 'welder': case 'baker': case 'apprentice':
      be(T(7, 45) + p.early, post.work, { tailor: 'Sewing', barber: p.gender === 'f' ? 'Dressing hair' : 'Cutting hair', mechanic: 'Repairing an engine', carpenter: 'Making furniture', welder: 'Welding', baker: 'Baking bread', apprentice: 'Learning the trade' }[p.job]); go(T(18, 20) + j(25), home, 'At home'); break;
    case 'foodvendor': be(T(6, 30), post.work, 'Cooking and serving food'); go(T(18, 45), home, 'At home'); break;
    case 'farmer': be(T(6, 20) + p.early, post.work, 'Working on the farm'); go(T(11, 30), post.rest, 'Resting in the shade'); go(T(12, 20), post.work, 'Working on the farm'); go(T(15, 20) + j(30), home, 'At home'); sitOut(T(17, 20) + j(20), T(19, 15) + j(20)); break;
    case 'fisher': be(T(5, 40) + p.early, post.work, 'Fishing'); go(T(10, 30) + j(20), post.alt, 'Mending nets'); go(T(13, 20), home, 'At home'); go(T(16, 20) + j(20), post.alt, 'Mending nets'); go(T(18, 40), home, 'At home'); break;
    case 'driver': be(T(6, 40), post.work, 'Waiting for passengers'); lunchBreak(T(13), post.work, 'Waiting for passengers'); go(T(19) + j(20), home, 'At home'); break;
    case 'labourer': be(T(7), post.work, 'Working'); if (post.eat !== undefined) { go(T(12, 20), post.eat, 'Eating'); then(30, post.work, 'Working'); } go(T(17, 30) + j(15), home, 'At home'); break;
    case 'hawker': be(T(7, 15) + p.early, post.round[0], 'Selling by the road'); go(T(9, 30), post.round[1], 'Selling by the road'); go(T(11, 45), post.round[2], 'Selling by the road'); go(T(14), post.round[3], 'Selling by the road'); go(T(16, 15), post.round[0], 'Selling by the road'); go(T(18, 10) + j(15), home, 'At home'); break;
    // (a motorist's hours at the wheel are traffic.js's: it says where they are then, and their day is as this the rest of the time)
    case 'unemployed': case 'motorist': go(T(9) + j(70), nearby(post.hang), 'Passing the time'); go(T(12, 45) + j(20), home, 'At home'); go(T(15, 45) + j(40), nearby(post.alt), 'Passing the time'); go(T(19) + j(40), home, 'At home'); break;
    case 'retiree': go(T(7, 30) + j(30), post.front, 'Sitting outside the house'); go(T(9, 45) + j(20), chance(0.4, 51) || pathBetween(home, shop(17)).len > 350 ? nearby(post.hang) : shop(17), 'Out for a walk'); then(45, home, 'At home'); sitOut(T(16, 15) + j(20), T(19) + j(20)); break;
    case 'homemaker': if (pathBetween(home, shop(18)).len < 520) { go(T(7, 30) + j(60), shop(18), 'Shopping at the market'); then(24, shop(19), 'Shopping at the market'); then(22, home, 'At home'); } else go(T(8, 30) + j(40), post.front, 'Sweeping the yard'); go(T(12) + j(20), post.front, 'Cooking outside'); go(T(13, 30), home, 'At home'); if (chance(0.35, 53) && pathBetween(home, shop(21)).len < 380) { go(T(15, 20) + j(50), shop(21), 'Shopping at the market'); then(20, home, 'At home'); } sitOut(T(17, 15) + j(20), T(18, 40) + j(20)); break;
    default: break;
  }
  // most working people shop on the way home now and then
  if (p.age >= 20 && !p.night && !['trader', 'homemaker', 'retiree', 'okada', 'priest', 'vicar'].includes(p.job) && chance(0.24, 52)) { const last = stops[stops.length - 1]; const before = stops[stops.length - 2]; if (last && before && last.spot === home && last.t < T(17, 20) && pathBetween(before.spot, shop(20)).len < 300) { go(last.t - 60, shop(20), 'Shopping at the market'); then(25, home, 'At home'); } }
  // and those whose afternoon is their own go while the market is still open
  const errand = { unemployed: [0.55, T(13, 40)], farmer: [0.3, T(15, 50)], fisher: [0.35, T(14)], undergrad: [0.14, T(16)], student: [0.1, T(15, 20)] }[p.job];
  if (errand && !d.sunday && !d.saturday && sick >= 0.034 && chance(errand[0], 54) && pathBetween(home, shop(22)).len < 400) { go(errand[1] + j(45), shop(22), 'Shopping at the market'); then(24, home, 'At home'); }
  return { stops, start, startAct };
}

// His townspeople's evenings and nights (30 October 2026, the owner: "I can't even see them on the street. They are
// scarce"): until now everyone in the town was home by eight in the evening and stayed there until morning, and the
// owner plays at night. Now, of his townspeople, on any one day about half go out for the evening (from about twenty to
// eight until ten or eleven), a fifth stay out late (until one or two in the morning), and a few are out the whole
// night, going between two of the places where people gather until a little before five; the places: the corners where
// people with time on their hands gather, the motor park's corners and its waiting row. Chosen from who they are and the
// day alone, so every copy of the town has the same people out, and someone out late is still out when the next day's
// plan begins (its `start`).
const NIGHT = Object.freeze({ evening: 0.5, late: 0.7, night: 0.76, near: 200, between: 150 });
const NIGHT_PLACES = [];
function nightOut(p, dayIndex, seed) {
  // (his townspeople: drawn from one of his figures, npc-figures.js; the police keep their shifts)
  if (p.job === 'police' || !p.look || !NPC_FIGURES[p.look.figure] || dayIndex < 0) return null;
  // (nobody goes out on a day they are ill: routine, `sick`)
  const d = dayInfo(dayIndex), J = JOBS[p.job];
  if (!d.sunday && p.job !== 'infant' && p.venue !== 'hospital' && !J.clergy && !(p.post && p.post.patrol) && unit(p.index, seed + 11, dayIndex) < 0.034) return null;
  const h = unit(p.index, seed + dayIndex * 13, 61);
  const kind = h < NIGHT.evening ? 'evening' : h < NIGHT.late ? 'late' : h < NIGHT.night ? 'night' : null;
  if (!kind) return null;
  // (among them, those within a short walk of home, so that a walk there and back fits the evening: the town's day is
  // thirty times a real one, and its people walk at their own pace; with none near, the front of the house)
  if (!NIGHT_PLACES.length) NIGHT_PLACES.push(...slot('street', 'hang'), ...slot('park', 'hang'), ...slot('park', 'wait'));
  const home = ZONE_SPOTS[p.homeSpot];
  const near = NIGHT_PLACES.filter((s) => Math.hypot(ZONE_SPOTS[s].x - home.x, ZONE_SPOTS[s].z - home.z) < NIGHT.near);
  const jit = (salt, minutes) => Math.floor(unit(p.index, seed + dayIndex * 17, salt) * minutes) * 60;
  if (!near.length) return { kind, spot: p.post.front, other: p.post.front, jit, front: true };
  const spot = near[mix(p.index, dayIndex, 63) % near.length];
  // (the second place of a night out within a short walk of the first, or the first again)
  const S0 = ZONE_SPOTS[spot];
  const close = near.filter((s) => s !== spot && Math.hypot(ZONE_SPOTS[s].x - S0.x, ZONE_SPOTS[s].z - S0.z) < NIGHT.between);
  const other = close.length ? close[mix(p.index, dayIndex, 64) % close.length] : spot;
  return { kind, spot, other, jit, front: false };
}
function addNight(p, d, seed, r) {
  const home = p.homeSpot;
  const tonight = nightOut(p, d.index, seed);
  const lastNight = nightOut(p, d.index - 1, seed);
  // (out late or all night yesterday: still out as today begins, and home in the small hours)
  if (lastNight && lastNight.kind === 'late') {
    r.start = lastNight.spot; r.startAct = lastNight.front ? 'Outside the house' : 'Out late';
    r.stops.push({ t: T(0, 40) + lastNight.jit(71, 110), spot: home, act: 'Asleep at home', arrive: false });
  } else if (lastNight && lastNight.kind === 'night') {
    // (where the night before left them: its second place)
    r.start = lastNight.other; r.startAct = lastNight.front ? 'Outside the house' : 'Out at night';
    r.stops.push({ t: T(1) + lastNight.jit(72, 30), spot: lastNight.spot, act: 'Out at night', arrive: false });
    r.stops.push({ t: T(2, 30) + lastNight.jit(73, 30), spot: lastNight.other, act: 'Out at night', arrive: false });
    r.stops.push({ t: T(3, 50) + lastNight.jit(74, 20), spot: lastNight.spot, act: 'Out at night', arrive: false });
    r.stops.push({ t: T(4, 45) + lastNight.jit(75, 15), spot: home, act: 'Asleep at home', arrive: false });
  }
  if (!tonight || r.ill) return r;
  // (standing there: out of doors nobody sits but on a seat, and the front of a house has none, atani.js `addSpot`)
  const outside = tonight.front ? 'Outside the house' : null;
  if (tonight.kind === 'evening') {
    r.stops.push({ t: T(19, 40) + tonight.jit(76, 50), spot: tonight.spot, act: outside || 'Out for the evening', arrive: false });
    r.stops.push({ t: T(21, 20) + tonight.jit(77, 70), spot: home, act: 'Asleep at home', arrive: false });
  } else if (tonight.kind === 'late') r.stops.push({ t: T(20, 10) + tonight.jit(78, 60), spot: tonight.spot, act: outside || 'Out late', arrive: false });
  else {
    r.stops.push({ t: T(20, 30) + tonight.jit(79, 40), spot: tonight.spot, act: outside || 'Out at night', arrive: false });
    r.stops.push({ t: T(22, 10) + tonight.jit(80, 30), spot: tonight.other, act: outside || 'Out at night', arrive: false });
  }
  return r;
}

// ----------------------------------------------------------- population --

// A day's plans depend only on the seed and the day, so every copy of the
// world can share them. The last few days are kept.
const planBooks = new Map();
function plansFor(key, n) {
  let plans = planBooks.get(key);
  if (!plans) { plans = new Array(n); planBooks.set(key, plans); if (planBooks.size > 8) planBooks.delete(planBooks.keys().next().value); }
  return plans;
}

export function createPopulation({ state, timeScale, scale = 1, seed = ZONE_POPULATION.seed, jobs = ZONE_POPULATION.jobs }) {
  const people = rosterOf(seed, scale, jobs);
  const N = people.length;
  // Who this save was made with: a town saved before its people changed (ZONE_POPULATION.edition) is `renewed`, and
  // what it held about the people it had is let go (sim.js, renew.js), so that nobody's number points at someone else.
  const roster = `${jobs === ZONE_POPULATION.jobs ? ZONE_POPULATION.edition || 1 : `own:${jobs.length}`}|${seed}|${scale}|${N}`;
  const renewed = !!state.population && state.population.roster !== roster;
  if (!state.population || renewed) state.population = { seed, scale, rides: {}, roster };
  const book = state.population;
  const hooks = [];                // whoever else may say where someone is: the okada service for its riders and passengers, and so on
  const planKey = (day) => `${seed}|${scale}|${timeScale}|${day}`;
  let planDay = -1;
  let plans = null;
  const stats = { scans: 0, scanMs: 0, views: 0, viewMs: 0, plans: 0, planMs: 0, lastScanMs: 0, lastViewMs: 0, near: 0, middle: 0, far: N };
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

  function compile(p, dayIndex, carry = true) {
    const d = dayInfo(dayIndex);
    const r = addNight(p, d, seed, routine(p, d, seed, timeScale));
    r.stops.sort((a, b) => a.t - b.t);
    // nobody walks home only to turn round and leave again
    r.stops = r.stops.filter((stop, n) => !(stop.spot === p.homeSpot && r.stops[n + 1] && r.stops[n + 1].spot !== p.homeSpot && r.stops[n + 1].t - stop.t < 2700));
    // The day begins where the day before left them (30 October 2026: out in the evening or the night, some are still
    // out as one day becomes the next, or on their way home): there, and a walk not over at midnight carried on, so that
    // nobody is moved in a jump. (Yesterday's plan as its own day made it, without looking a day further back: kept apart
    // from the plans the town goes by, whose own first hours carry on from the day before them.)
    let carried = [];
    if (carry && dayIndex > 0) {
      const book = plansFor(`${planKey(dayIndex - 1)}|own`, N);
      const y = book[p.index] || (book[p.index] = compile(p, dayIndex - 1, false));
      const last = y.legs[y.legs.length - 1];
      if (last) {
        r.start = last.spot; r.startAct = last.act;
        carried = y.legs.filter((l) => l.t1 > 86400 || l.t0 >= 86400).map((l) => ({ ...l, t0: l.t0 - 86400, t1: l.t1 - 86400 }));
      }
    }
    const legs = carried;
    const end = carried.length ? carried[carried.length - 1] : null;
    let at = r.start;
    let free = end ? Math.max(0, end.t1) + 30 : 0;
    let arrived = end ? Math.max(0, end.t1) : 0;
    for (const stop of r.stops) {
      // a stay of so many minutes is counted from getting there, however long the walk was
      if (stop.dwell !== undefined) stop.t = arrived + stop.dwell;
      if (stop.spot === at) { legs.push({ t0: Math.max(free, stop.t), t1: Math.max(free, stop.t), path: null, spot: at, act: stop.act }); arrived = Math.max(free, stop.t); continue; }
      const path = pathBetween(at, stop.spot);
      let seconds = (path.len / p.pace) * timeScale;
      let ride = null;
      if (p.transport === 'okada' && path.nodes && path.len > 240) {
        // from the first road on the way to the last one, on the back of a motorcycle
        let first = -1, last = -1;
        for (let i = 0; i < path.nodes.length; i += 1) if (graphIsRoad(path.nodes[i])) { if (first < 0) first = i; last = i; }
        if (first >= 0 && last > first) {
          const road = graphDistance(path.nodes[first], path.nodes[last], true);
          const a = graphDistance(SPOT_NODE[at], path.nodes[first]);
          const b = graphDistance(path.nodes[last], SPOT_NODE[stop.spot]);
          if (road >= 170 && road < Infinity && a + b < path.len * 0.6) { ride = { from: path.nodes[first], to: path.nodes[last], road, a, b }; seconds = ((a + b + 8) / p.pace + 22 + road / RIDE_SPEED) * timeScale; }
        }
      }
      const slack = 60 + (mix(p.index, legs.length) % 4) * 60;
      // nobody sets off before first light; those with far to go arrive late
      const t0 = Math.max(free, stop.arrive ? Math.max(Math.min(stop.t - 600, EARLIEST), stop.t - seconds - slack) : stop.t);
      legs.push({ t0, t1: t0 + seconds, path, spot: stop.spot, act: stop.act, from: at, ride });
      free = t0 + seconds + 30;
      arrived = t0 + seconds;
      at = stop.spot;
    }
    return { legs, start: r.start, startAct: r.startAct, ill: !!r.ill };
  }

  function planOf(i, dayIndex) {
    if (dayIndex !== planDay) { planDay = dayIndex; plans = plansFor(planKey(dayIndex), N); }
    let plan = plans[i];
    if (!plan) { const t = now(); plan = compile(people[i], dayIndex); plans[i] = plan; stats.plans += 1; stats.planMs += now() - t; }
    return plan;
  }

  // Tomorrow's plans are worked out a few at a time through the evening, so
  // that midnight does not have a thousand of them to do at once.
  let ahead = 0;
  function prepare(t) {
    const dayIndex = Math.floor(t / 86400);
    if (t - dayIndex * 86400 < 72000) { ahead = 0; return; }
    const tomorrow = plansFor(planKey(dayIndex + 1), N);
    for (let n = 0; n < 6 && ahead < N; n += 1, ahead += 1) if (!tomorrow[ahead]) { tomorrow[ahead] = compile(people[ahead], dayIndex + 1); stats.plans += 1; }
  }

  // Where person `i` is at time `t`, written into `out`.
  function locate(i, t, out) {
    for (let k = 0; k < hooks.length; k += 1) if (hooks[k](i, t, out)) return out;
    return planned(i, t, out);
  }

  // Where their own day has person `i` at time `t`, whatever else has hold of them.
  function planned(i, t, out) {
    const dayIndex = Math.floor(t / 86400);
    const s = t - dayIndex * 86400;
    const plan = planOf(i, dayIndex);
    const legs = plan.legs;
    let lo = 0, hi = legs.length - 1, k = -1;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (legs[mid].t0 <= s) { k = mid; lo = mid + 1; } else hi = mid - 1; }
    const leg = k >= 0 ? legs[k] : null;
    if (leg && leg.path && s < leg.t1) {
      const path = leg.path;
      const d = ((s - leg.t0) / (leg.t1 - leg.t0)) * path.len;
      const cum = path.cum;
      let a = 0, b = cum.length - 1;
      while (b - a > 1) { const m = (a + b) >> 1; if (cum[m] <= d) a = m; else b = m; }
      const span = cum[b] - cum[a] || 1;
      const f = (d - cum[a]) / span;
      const ax = path.xs[a * 2], az = path.xs[a * 2 + 1], bx = path.xs[b * 2], bz = path.xs[b * 2 + 1];
      const dx = (bx - ax) / span, dz = (bz - az) / span;
      if (path.still && path.still[b]) {
        // standing at the kerb, looking at the road before crossing it
        const nx = path.xs[(b + 1) * 2], nz = path.xs[(b + 1) * 2 + 1];
        out.x = ax; out.z = az; out.h = Number.isFinite(nx) ? Math.atan2(nx - ax, nz - az) : 0;
        out.pose = POSE.stand; out.spot = leg.spot; out.act = leg.act; out.moving = false; out.leg = leg;
        return out;
      }
      const side = path.open[a] && path.open[b] ? (path.wide && path.wide[a] && path.wide[b] ? people[i].side * (ON_CAR_ROAD_SIDE / 1.1) : people[i].side) : 0;
      out.x = ax + (bx - ax) * f + dz * side;
      out.z = az + (bz - az) * f - dx * side;
      out.h = Math.atan2(dx, dz);
      out.pose = POSE.walk;
      out.spot = leg.spot;
      out.act = leg.act;
      out.moving = true;
      out.leg = leg;
      return out;
    }
    const spot = ZONE_SPOTS[leg ? leg.spot : plan.start];
    out.x = spot.x; out.z = spot.z; out.h = spot.facing;
    out.pose = spot.inside ? POSE.hidden : POSE_OF[spot.pose];
    out.spot = spot.id;
    out.act = leg ? leg.act : plan.startAct;
    out.moving = false;
    out.leg = null;
    return out;
  }

  // --- who is near whom --------------------------------------------------------

  const sets = new Map();
  const probe = { x: 0, z: 0, h: 0, pose: 0, spot: 0, act: '', moving: false, leg: null };
  function scan(key, x, z, t, real) {
    const started = now();
    const list = [];
    const r2 = RANGE.scan * RANGE.scan;
    for (let i = 0; i < N; i += 1) {
      locate(i, t, probe);
      const dx = probe.x - x, dz = probe.z - z;
      if (dx * dx + dz * dz <= r2) list.push(i);
    }
    const set = { x, z, real, list };
    sets.set(key, set);
    stats.scans += 1;
    stats.lastScanMs = now() - started;
    stats.scanMs += stats.lastScanMs;
    return set;
  }

  // The people a player can see, as [index, x, z, heading, pose] rows.
  function around(key, x, z, t, real) {
    let set = sets.get(key);
    if (!set || real - set.real >= 1 || real < set.real || Math.hypot(set.x - x, set.z - z) > 5) set = scan(key, x, z, t, real);
    const started = now();
    const rows = [];
    const m2 = RANGE.middle * RANGE.middle;
    const n2 = RANGE.near * RANGE.near;
    let near = 0;
    for (const i of set.list) {
      locate(i, t, probe);
      if (probe.pose === POSE.hidden || probe.pose === POSE.ride) continue;
      const dx = probe.x - x, dz = probe.z - z;
      const d2 = dx * dx + dz * dz;
      if (d2 > m2) continue;
      if (d2 <= n2) near += 1;
      rows.push([i, Math.round(probe.x * 100) / 100, Math.round(probe.z * 100) / 100, Math.round(probe.h * 100) / 100, probe.pose]);
    }
    stats.views += 1;
    stats.lastViewMs = now() - started;
    stats.viewMs += stats.lastViewMs;
    stats.near = near; stats.middle = rows.length - near; stats.far = N - rows.length;
    return rows;
  }

  // Who is within `radius` of a point right now, as [index, x, z, pose] rows. For things that happen at a place
  // (a vehicle striking someone): it keeps its own list of who is roughly near, like a view does, and counts
  // towards nobody's figures.
  function within(key, x, z, radius, t, real) {
    let set = sets.get(key);
    if (!set || real - set.real >= 1 || real < set.real || Math.hypot(set.x - x, set.z - z) > 5) { const kept = { scans: stats.scans, last: stats.lastScanMs, total: stats.scanMs }; set = scan(key, x, z, t, real); stats.scans = kept.scans; stats.lastScanMs = kept.last; stats.scanMs = kept.total; }
    const rows = [];
    const r2 = radius * radius;
    for (const i of set.list) {
      locate(i, t, probe);
      const dx = probe.x - x, dz = probe.z - z;
      if (dx * dx + dz * dz <= r2) rows.push([i, probe.x, probe.z, probe.pose]);
    }
    return rows;
  }

  // The okada journeys that begin on a day: [time, person, which leg].
  const riders = people.filter((p) => p.transport === 'okada').map((p) => p.index);
  function ridesOf(dayIndex) {
    const book2 = plansFor(planKey(dayIndex), N);
    if (!book2.rides) {
      const list = [];
      for (const i of riders) {
        if (!book2[i]) { book2[i] = compile(people[i], dayIndex); stats.plans += 1; }
        book2[i].legs.forEach((leg, k) => { if (leg.ride) list.push([dayIndex * 86400 + leg.t0, i, k]); });
      }
      book2.rides = list.sort((a, b) => a[0] - b[0]);
    }
    return book2.rides;
  }

  function describe(i, t) {
    const p = people[i];
    const at = locate(i, t, {});
    const dayIndex = Math.floor(t / 86400);
    const hour = (t - dayIndex * 86400) / 3600;
    const lastMeal = hour >= 19.5 ? 19.5 : hour >= 13 ? 13 : hour >= 7 ? 7 : -4.5;
    const needs = { hunger: Math.min(1, (hour - lastMeal) / 6.5), rest: Math.min(1, Math.max(0, hour - 6) / 16), company: p.traits.includes('reserved') || p.traits.includes('shy') ? 0.2 : 0.6 };
    const goingTo = at.moving ? ZONE_VENUES[ZONE_SPOTS[at.spot].venue] : null;
    return {
      id: p.id, index: i, name: p.name, short: p.short, age: p.age, gender: p.gender, role: roleOf(p), job: p.job, income: p.income,
      people: PEOPLES[p.people].name, tongue: PEOPLES[p.people].tongue, faith: p.faith, languages: p.langs, language: p.lang, traits: p.traits, transport: p.transport,
      home: p.quarter ? `${p.quarter} quarter` : ZONE_VENUES[p.venue] ? ZONE_VENUES[p.venue].name : 'town',
      // (an officer walking her beat, from one of its stops to the next, is on patrol, not on her way to the police post)
      activity: at.moving ? (ZONE_SPOTS[at.spot].venue === 'home' ? 'Walking home' : ZONE_SPOTS[at.spot].slot === 'patrol' ? 'On patrol' : goingTo && goingTo.kind !== 'street' && goingTo.kind !== 'shed' ? `Walking to ${goingTo.name}` : 'Out walking') : at.act,
      needs, look: p.look, fig: p.fig,
      relations: p.relations.slice(0, 6).map(([other, kind]) => ({ kind, name: people[other].name })),
    };
  }

  // How many people are doing what, right now: for tests and for the curious.
  function census(t) {
    const out = { total: N, hidden: 0, walking: 0, byActivity: {}, byVenue: {} };
    const o = {};
    for (let i = 0; i < N; i += 1) {
      locate(i, t, o);
      if (o.pose === POSE.hidden) out.hidden += 1;
      if (o.moving) out.walking += 1;
      out.byActivity[o.act] = (out.byActivity[o.act] || 0) + 1;
      if (!o.moving && o.pose !== POSE.hidden) { const v = ZONE_SPOTS[o.spot].venue; out.byVenue[v] = (out.byVenue[v] || 0) + 1; }
    }
    return out;
  }

  return {
    people, count: N, total: N + ZONE_RESIDENTS.length, book, renewed,
    locate, around, within, describe, census, planOf, ridesOf, prepare, stats,
    spot: (id) => ZONE_SPOTS[id],
    forget(key) { sets.delete(key); },
    planned,
    // the way between two of the town's places, as people walk it (the town's voices: someone going over to talk)
    route: (a, b) => pathBetween(a, b),
    // Others may take charge of where someone is (a rider on his motorcycle, someone running from a fight).
    // Each is asked in turn; the first to answer true has them.
    addHook(fn, first = false) { if (first) hooks.unshift(fn); else hooks.push(fn); },
    setHook(fn) { hooks.push(fn); },
    dayInfo,
  };
}
