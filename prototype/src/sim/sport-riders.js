// The town's people out on bicycles, skateboards and skates (31 October 2026, stage 3 of the owner's brief of 30 October:
// "NPCs should also be seen using these items on the streets—10 NPCs riding bicycles, 5 on skateboards, and 5 on
// skating shoes. Ensure each NPC realistically pedals, balances, and maneuvers their equipment, with smooth wheel
// rotation and realistic motions. The player must also be able to hijack these bicycles, and some others sports assets
// that can be hijacked. Once hijacked, the player must pedal and control the bike, but remember, hijacked bikes cannot
// be resold.").
//
// Twenty of the town's people (chosen from those of riding age, the same in every copy of the town) each have one: ten
// bicycles, five skateboards, five pairs of skates. By day (and some into the evening) each rides up and down a road of
// the town: on the right, near its edge, out of the cars' way; going round a car stopped at the roadside when there is
// room and the road is clear, waiting behind it when there is not; slowing for anyone on foot in the way (a cyclist rings
// the bell), and keeping behind another rider going slower; turning round at the road's end across the road to its
// other side; pulling in now and then to stand a while. They go as such things go (sport-ride.js): the cyclist pedals to
// keep going, the skateboarder pushes and glides, the skater strides and glides; and the page draws them so
// (sport-view.js: the same rider on the same thing as a player).
//
// One of them riding slowly, or standing, can have it taken from them by a player close beside them (`take`): pushed
// off, they run, shouting; a crime for the police if an officer saw it (justice.js: taking a vehicle). The thief rides it as their own
// (own-sports.js), and may leave it and come back to it: it stands where they left it. It is never theirs: the website's
// server, which keeps who owns what, is never told of it, so it is never in their Property, never in the market and
// never sold. When the police catch them, everything they took goes back to its owner, who walks to it and rides off
// (`recover`). One player holds three at most: a fourth taken, the first is found by its owner.
import { ZONE_ROADS, zoneWalkable } from './zone.js';
import { POSE } from './population.js';
import { trafficNetwork } from './traffic.js';
import { SPORT_HANDLING, stepSport } from './sport-ride.js';
import { GameError } from './registry.js';

export const RIDERS = Object.freeze({ bicycle: 10, skateboard: 5, 'inline-skates': 5 });
export const SPORT_RIDING = Object.freeze({
  // m/s each keeps to, cruising (the bicycles 13 to 19 km/h, the skateboards 9 to 12, the skates 10 to 14)
  pace: Object.freeze({ bicycle: Object.freeze([3.6, 5.2]), skateboard: Object.freeze([2.5, 3.4]), 'inline-skates': Object.freeze([2.8, 3.9]) }),
  edge: 1.0,               // metres in from the right-hand edge of the road (clear of a car stopped at the roadside)
  pass: 0.35,              // metres kept from the side of what is gone round
  middle: 0.8,             // metres short of the middle of the road a rider keeps, going round something
  look: 11,                // metres ahead a rider watches
  gap: 1.6,                // metres kept behind whatever is ahead
  brake: 2.6,              // m/s² at most, slowing for something
  end: 12,                 // metres short of the road's end a rider turns round (clear of the junction there)
  turning: 2.2,            // m/s: going round, no faster
  giveWay: 4,              // real seconds held up in the middle of the road by something standing still: then to the side
  footWait: 3,             // real seconds waited, ringing, for someone on foot in the way to step aside: then round them
  aside: 1.0,              // m/s: moving over to the side of the road, giving way
  glide: Object.freeze({ bicycle: 0.93, skateboard: 0.72, 'inline-skates': 0.78 }),  // of their pace: gliding down to it
  pause: Object.freeze([10, 30]),     // real seconds stood at the roadside now and then
  between: Object.freeze([260, 720]), // metres ridden between stops
  bell: 8,                 // metres: a cyclist rings for someone on foot this near ahead
  take: 2.4,               // metres: a player this near may take it from its rider
  slow: 3.4,               // m/s: going faster than this, it cannot be taken
  most: 3,                 // taken and left standing by one player at once; a fourth, and the first is found by its owner
  apart: 110,              // metres: a rider comes out, or goes home, only this far from every player
  seen: 220,               // metres: riders within this of a player are told to their page
});
// Where each rides up and down (roads of the town wide enough for cars and a rider beside them; the skateboards and
// skates only on the tarred ones). The n-th of each kind takes the n-th road of its list.
export const BEATS = Object.freeze({
  bicycle: Object.freeze(['waterside', 'registry', 'market', 'market-s', 'college', 'waterside', 'registry', 'yard', 'campus', 'close']),
  skateboard: Object.freeze(['waterside', 'registry', 'market-s', 'waterside', 'registry']),
  'inline-skates': Object.freeze(['registry', 'waterside', 'market', 'college', 'waterside']),
});
const KINDS = Object.freeze(Object.keys(RIDERS));
const NAMES = Object.freeze({ bicycle: 'bicycle', skateboard: 'skateboard', 'inline-skates': 'skates' });

const hash = (a, b = 0) => { let h = (a * 374761393 + b * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const wrap = (a) => { let d = a % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// The roads, as the traffic has them (its ends short of any roadblock): which way each runs, its middle, its ends, how
// wide, and where the cars keep (their lane, from its middle).
function beatRoads() {
  const out = new Map();
  for (const r of trafficNetwork().roads) out.set(r.id, r);
  return out;
}
// A point of a road: `along` it, `lat` metres to the right of its middle for someone going `dir` along it.
const pointOf = (road, along, lat, dir) => (road.axis === 'x' ? [along, road.c + lat * dir] : [road.c - lat * dir, along]);
const headingOf = (road, dir) => (road.axis === 'x' ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : dir > 0 ? 0 : Math.PI);
const alongOf = (road, x, z) => (road.axis === 'x' ? x : z);
const latOf = (road, x, z, dir) => (road.axis === 'x' ? (z - road.c) * dir : -(x - road.c) * dir);

// The twenty, from the town's people: of riding age (16 to 38), not police, not motorists, the same each time; as many
// women as men, as near as may be, and among them every one of the owner's figures that can be.
export function chooseRiders(people) {
  const fit = people.filter((p) => p && ['hawker', 'unemployed', 'trader', 'homemaker', 'labourer'].includes(p.job) && p.age >= 16 && p.age <= 38);
  const picked = [];
  const used = new Set(), figures = new Set();
  const want = KINDS.reduce((a, k) => a + RIDERS[k], 0);
  const figureOf = (p) => (p.look && p.look.figure) || null;
  // first one of each figure, a woman and a man in turn; then any of the figures; then anyone
  for (const pass of [0, 1, 2]) {
    for (let k = 0; k < fit.length * 3 && picked.length < want; k += 1) {
      const p = fit[Math.floor(hash(k, 77 + pass) * fit.length)];
      if (used.has(p.index)) continue;
      const fig = figureOf(p);
      if (pass < 2 && fig && figures.has(fig)) continue;
      if (pass === 0 && (picked.length % 2 === 0) !== (p.gender === 'f')) continue;
      used.add(p.index); if (fig) figures.add(fig);
      picked.push(p.index);
    }
  }
  for (const p of fit) { if (picked.length >= want) break; if (!used.has(p.index)) { used.add(p.index); picked.push(p.index); } }
  return picked;
}

export function createSportRiders({ state, population, players, hub = {}, emit = () => {}, visitors = () => [] }) {
  const people = population.people;
  const roads = beatRoads();
  const chosen = chooseRiders(people);
  const plan = [];
  for (const kind of KINDS) for (let k = 0; k < RIDERS[kind]; k += 1) plan.push({ kind, road: BEATS[kind][k % BEATS[kind].length] });
  if (!state.sportRiders || !Array.isArray(state.sportRiders.riders) || state.sportRiders.riders.length !== plan.length || state.sportRiders.riders.some((r, n) => r.i !== chosen[n])) {
    state.sportRiders = {
      riders: plan.map((p, n) => ({ n, i: chosen[n], item: p.kind, road: p.road, mode: 'off', x: 0, z: 0, h: 0, v: 0, lean: 0, phase: 0, dir: n % 2 ? -1 : 1, along: 0, lat: 0, turned: 0, until: 0, next: 0, takenBy: null, keptAt: 0, fallen: false, bellAt: -10, cruise: 0, since: 0 })),
      taken: 0, returned: 0,
    };
  }
  const book = state.sportRiders;
  const riders = book.riders;
  const ofPerson = new Map(riders.map((r) => [r.i, r.n]));
  const real = () => state.real;
  const ride = { speed: 0, lean: 0, heading: 0, phase: 0, pushing: false };

  const out = (r) => r.mode === 'ride' || r.mode === 'stop' || r.mode === 'turn' || r.mode === 'aside';
  const shown = (r) => out(r) || r.mode === 'kept' || r.mode === 'returning' || r.mode === 'taken';
  const roadOf = (r) => roads.get(r.road) || null;
  const nearestPlayer = (x, z) => { let d = Infinity; for (const id of Object.keys(players)) { const q = players[id]; d = Math.min(d, Math.hypot(q.x - x, q.z - z)); } for (const v of visitors()) d = Math.min(d, Math.hypot(v.x - x, v.z - z)); return d; };
  const anyPlayers = () => Object.keys(players).length > 0;
  // the edge of the road, on the right, for this rider
  const edgeLat = (road) => road.w / 2 - SPORT_RIDING.edge;

  // Out for the day: most from the morning into the early evening, some later; each their own hours each day.
  function onShift(r, t) {
    const day = Math.floor(t / 86400), s = t - day * 86400;
    const a = hash(r.i, day * 3 + 1), b = hash(r.i, day * 3 + 2), late = hash(r.i, day * 3 + 3) < 0.3;
    const from = (7 + a * 2.5) * 3600, to = (late ? 20 + b * 2 : 16.5 + b * 2.5) * 3600;
    return s >= from && s <= to;
  }
  function comeOut(r, t) {
    const road = roadOf(r);
    if (!road) return;
    // somewhere along its road no player is near (nobody sees them appear), going the way the day has them
    for (let k = 0; k < 6; k += 1) {
      const clear = SPORT_RIDING.end + road.w / 2 + 2;
      const along = road.a0 + clear + hash(r.i, Math.floor(t / 3600) * 9 + k) * (road.a1 - road.a0 - 2 * clear);
      const dir = hash(r.i, Math.floor(t / 3600) * 9 + k + 5) < 0.5 ? 1 : -1;
      const lat = edgeLat(road);
      const [x, z] = pointOf(road, along, lat, dir);
      if (nearestPlayer(x, z) < SPORT_RIDING.apart) continue;
      if (!zoneWalkable(x, z, [], 0.35)) continue;
      Object.assign(r, { mode: 'ride', x, z, h: headingOf(road, dir), dir, along, lat, v: 0, lean: 0, phase: 0, turned: 0, until: 0, since: real(), fallen: false });
      r.cruise = SPORT_RIDING.pace[r.item][0] + hash(r.i, 11) * (SPORT_RIDING.pace[r.item][1] - SPORT_RIDING.pace[r.item][0]);
      r.next = SPORT_RIDING.between[0] + hash(r.i, Math.floor(t / 600)) * (SPORT_RIDING.between[1] - SPORT_RIDING.between[0]);
      return;
    }
  }
  const goHome = (r) => { r.mode = 'off'; r.v = 0; };

  // What is in the road this step, for the riders: the town's cars, the players and what they are in or on, those from
  // other copies of the town, the riders themselves, and anything taken and left standing.
  function obstaclesNow() {
    const list = [];
    // (the town's cars: every one within reach of the town's roads)
    if (hub.traffic && hub.traffic.list) for (const c of hub.traffic.list(0, -150, null)) list.push({ x: c.x, z: c.z, h: c.h, hw: 1.05, hl: 2.5, v: Math.max(0, c.speed || 0), car: true, id: `c${c.n}`, held: !!c.held });
    for (const id of Object.keys(players)) {
      const q = players[id];
      if (q.incar && q.pcar) list.push({ x: q.pcar.x, z: q.pcar.z, h: q.pcar.h, hw: 1.05, hl: 2.5, v: Math.max(0, (q.pcar.drive && q.pcar.drive.speed) || 0), car: true });
      else if (q.astride) list.push({ x: q.x, z: q.z, h: q.heading || 0, hw: 0.45, hl: 1.0, v: 0 });
      else if (q.driving) list.push({ x: q.x, z: q.z, h: q.heading || 0, hw: 0.8, hl: 1.5, v: 0, car: true });
      else if (!q.carried && !q.swimming) list.push({ x: q.x, z: q.z, h: 0, hw: 0.35, hl: 0.35, v: 0, foot: q.id });
    }
    for (const v of visitors()) { if (v.held || v.swimming) continue; list.push({ x: v.x, z: v.z, h: v.heading || 0, hw: v.car ? 1.05 : 0.4, hl: v.car ? 2.5 : 0.4, v: 0, foot: v.car || v.ride || v.sport || v.vehicle ? null : v.id }); }
    for (const r of riders) if (shown(r) && r.mode !== 'taken') list.push({ x: r.x, z: r.z, h: r.h, hw: 0.35, hl: r.item === 'bicycle' ? 0.9 : 0.45, v: out(r) ? r.v : 0, rider: r.n });
    return list;
  }

  // The nearest thing ahead of a rider on their way, at the lateral place `lat`: how far (from the front of it to the
  // back of the other) and how fast it goes the same way; and, if it may be gone round, the lateral place to do so.
  function aheadOf(r, road, list, lat) {
    const ux = Math.sin(r.h), uz = Math.cos(r.h);
    const half = 0.35, front = r.item === 'bicycle' ? 0.9 : 0.45;
    let best = null;
    for (const o of list) {
      if (o.rider === r.n) continue;
      const dx = o.x - r.x, dz = o.z - r.z;
      if (Math.abs(dx) > SPORT_RIDING.look + 4 || Math.abs(dz) > SPORT_RIDING.look + 4) continue;
      const along = dx * ux + dz * uz;
      const turned = (o.h || 0) - r.h, ca = Math.abs(Math.cos(turned)), sa = Math.abs(Math.sin(turned));
      const reachAlong = ca * o.hl + sa * o.hw, reachAcross = ca * o.hw + sa * o.hl;
      const gap = along - reachAlong - front;
      if (along < -reachAlong || gap > SPORT_RIDING.look) continue;
      // across: where it is on the road (to the right of the middle, for this rider's way)
      const oLat = latOf(road, o.x, o.z, r.dir);
      if (Math.abs(oLat - lat) > half + reachAcross + 0.05) continue;
      if (!best || gap < best.gap) best = { gap, o, oLat, reachAcross, speed: Math.max(0, o.v * Math.cos(turned)) };
    }
    return best;
  }

  // How far a point is from the outside of something in the road (its box, turned as it faces).
  function boxGap(o, px, pz) {
    const dx = px - o.x, dz = pz - o.z, sh = Math.sin(o.h || 0), ch = Math.cos(o.h || 0);
    const along = dx * sh + dz * ch, across = dx * ch - dz * sh;
    return Math.hypot(Math.max(0, Math.abs(along) - (o.hl || 0.4)), Math.max(0, Math.abs(across) - (o.hw || 0.4)));
  }
  // The way round to the other side of the road: a half circle to the left, as wide as the road between the two edges,
  // from where the rider is (already `turned` into it); its points from `from` to `to` radians on, with the time to each.
  function arcAhead(r, from, to) {
    const radius = Math.max(2, r.lat), cx = r.x + Math.cos(r.h) * radius, cz = r.z - Math.sin(r.h) * radius;
    const pace = Math.max(0.8, Math.min(r.v || SPORT_RIDING.turning, SPORT_RIDING.turning));
    const pts = [];
    for (let a = from; a <= to + 1e-6; a += 0.2) pts.push({ x: cx - radius * Math.cos(r.h + a), z: cz + radius * Math.sin(r.h + a), t: ((a - from) * radius) / pace });
    return { pts, radius, cx, cz, time: ((to - from) * radius) / pace };
  }
  // Is the way round clear, `from` to `to` radians on: nothing standing on it (with room for the rider beside it), and
  // nothing coming that would be on it as the rider gets there (a car of the town's, another rider, a player). What is
  // behind the rider, or beside them on the right, is not on it.
  function wayRoundClear(r, list, from, to, room = 0.5) {
    const arc = arcAhead(r, from, to);
    const reach = 2 * arc.radius + 6;
    for (const o of list) {
      if (o.rider === r.n) continue;
      const v = o.v || 0, far = Math.hypot(o.x - arc.cx, o.z - arc.cz);
      if (far > reach + v * (arc.time + 1.5)) continue;
      if (v < 0.3) { for (const q of arc.pts) if (boxGap(o, q.x, q.z) < room) return false; continue; }
      const ux = Math.sin(o.h || 0), uz = Math.cos(o.h || 0);
      for (const q of arc.pts) {
        for (const lag of [-1, 0, 1]) {
          const at = Math.max(0, q.t + lag);
          if (boxGap({ ...o, x: o.x + ux * v * at, z: o.z + uz * v * at }, q.x, q.z) < room + 0.4) return false;
        }
      }
    }
    return true;
  }
  // Is the whole way round clear, before setting off on it?
  const turnClear = (r, list) => wayRoundClear(r, list, 0.2, Math.PI);
  // Given way: over to the side of the road (whichever side is nearer: its own, or the other as if gone round) and
  // standing there a few seconds, out of the way of what held it up.
  function giveWay(r, road) {
    const lat = latOf(road, r.x, r.z, r.dir);
    if (lat < 0) { r.dir = -r.dir; r.lat = -lat; } else r.lat = lat;
    r.along = alongOf(road, r.x, r.z); r.turned = 0; r.v = 0; r.held = 0; r.mode = 'aside'; r.asideFor = 0;
    book.gaveWay = (book.gaveWay || 0) + 1;
  }

  // One rider, one step: on along the road at their pace, round or behind what is in the way, round at the end.
  function step(r, dt, list) {
    const road = roadOf(r);
    if (!road) return;
    const h = SPORT_HANDLING[r.item];
    if (r.mode === 'stop') {
      r.v = 0;
      if (real() >= r.until) { r.mode = 'ride'; r.next = SPORT_RIDING.between[0] + hash(r.i, Math.floor(real())) * (SPORT_RIDING.between[1] - SPORT_RIDING.between[0]); }
      return;
    }
    if (r.mode === 'aside') {
      // over to the edge at a walk, turned the way of that side; not into anything beside (after a while held at it,
      // the other side instead); then a few seconds standing there
      r.v = 0; r.lean += (0 - r.lean) * Math.min(1, dt * 3);
      const want = edgeLat(road), face = headingOf(road, r.dir);
      r.h = wrap(r.h + clamp(wrap(face - r.h), -2 * dt, 2 * dt));
      const dl = clamp(want - r.lat, -SPORT_RIDING.aside * dt, SPORT_RIDING.aside * dt);
      const [nx, nz] = pointOf(road, r.along, r.lat + dl, r.dir);
      if (!list.some((o) => o.rider !== r.n && boxGap(o, nx, nz) < 0.4)) { r.lat += dl; r.x = nx; r.z = nz; r.asideFor = 0; }
      else if ((r.asideFor = (r.asideFor || 0) + dt) > SPORT_RIDING.giveWay * 1.5) { r.dir = -r.dir; r.lat = -r.lat; r.asideFor = 0; }
      if (Math.abs(want - r.lat) < 0.02 && Math.abs(wrap(face - r.h)) < 0.05) { r.mode = 'stop'; r.until = real() + 3 + hash(r.i, Math.floor(real())) * 5; }
      return;
    }
    if (r.mode === 'turn') {
      // round to the other side of the road, to the left, along a half circle as wide as the road between the two edges;
      // held where they are while something is just ahead of them on it
      const radius = Math.max(2, r.lat);
      if (!wayRoundClear(r, list, 0.1, Math.min(0.9, Math.PI - r.turned + 0.1), 0.45)) {
        r.v = Math.max(0, r.v - SPORT_RIDING.brake * dt);
        if (r.v < 0.05) { r.v = 0; r.held = (r.held || 0) + dt; if (r.held > SPORT_RIDING.giveWay) giveWay(r, road); return; }
      } else r.held = 0;
      const rate = Math.min(r.v, SPORT_RIDING.turning) / radius;
      ride.speed = r.v; ride.lean = r.lean; ride.heading = r.h; ride.phase = r.phase;
      stepSport(ride, { throttle: r.v < SPORT_RIDING.turning * 0.9 ? 0.5 : 0 }, dt, { handling: h });
      r.v = Math.min(ride.speed, SPORT_RIDING.turning); r.phase = ride.phase;
      const turn = rate * dt;
      r.h = wrap(r.h + turn); r.turned += turn;
      r.lean += (-Math.atan((r.v * r.v) / (9.81 * radius)) - r.lean) * Math.min(1, dt * 3);
      r.x += Math.sin(r.h) * r.v * dt; r.z += Math.cos(r.h) * r.v * dt;
      if (r.turned >= Math.PI - 1e-3) {
        r.dir = -r.dir; r.h = headingOf(road, r.dir); r.turned = 0; r.mode = 'ride';
        r.along = alongOf(road, r.x, r.z); r.lat = latOf(road, r.x, r.z, r.dir);
      }
      return;
    }
    // riding: how fast to go (its own pace; slower behind something, or for someone on foot; stopping for the end)
    // (a car of the town's and this rider each waiting for the other for a while: the rider goes on past it, as if it
    // were not there, for a few seconds: traffic.js does the same for two of its cars)
    if (real() < (r.ghostUntil || 0)) list = list.filter((o) => o.id !== r.ghostOf);
    const want = edgeLat(road);
    let target = r.cruise, latWant = want;
    const ahead = aheadOf(r, road, list, r.lat);
    if (ahead) {
      // something stood still or slower ahead: round it on the inside, out into the road, if that is clear (nothing there,
      // no car coming up behind or ahead on that side) and not over the middle; otherwise behind it, waiting (and a
      // cyclist rings for someone on foot)
      const round = ahead.oLat - ahead.reachAcross - 0.35 - SPORT_RIDING.pass;
      const coming = (o) => { const along = (o.x - r.x) * Math.sin(r.h) + (o.z - r.z) * Math.cos(r.h); return o.car && o.v > 0.5 && Math.abs(latOf(road, o.x, o.z, r.dir) - round) < o.hw + 0.9 && along > -24 && along < 14; };
      const roomy = round >= SPORT_RIDING.middle && !aheadOf(r, road, list.filter((o) => o !== ahead.o), round) && !list.some(coming);
      // (or, if it stands only partly in the way, past it on the outside, along the edge of the road, where there is room)
      const outside = ahead.oLat + ahead.reachAcross + 0.35 + 0.1;
      const squeeze = !roomy && outside > r.lat - 0.05 && outside <= road.w / 2 - 0.45 && !aheadOf(r, road, list.filter((o) => o !== ahead.o), outside);
      // (someone on foot: rung at, and given a few seconds to step aside; then gone round, if there is room, giving them
      // a wide berth)
      const onFoot = ahead.o.foot !== undefined && ahead.o.foot !== null;
      r.footWait = onFoot && r.v < 0.3 ? (r.footWait || 0) + dt : onFoot ? r.footWait || 0 : 0;
      const mayPass = !onFoot || r.footWait > SPORT_RIDING.footWait;
      const wide = onFoot ? round - 0.3 : round;
      if (ahead.speed < r.cruise * 0.8 && mayPass && (onFoot ? wide >= SPORT_RIDING.middle && roomy : roomy)) latWant = wide;
      else if (ahead.speed < r.cruise * 0.8 && squeeze && !onFoot) { latWant = outside; target = Math.min(target, ahead.speed + Math.max(0, ahead.gap - 0.3) * 0.9); }
      else target = Math.min(target, ahead.speed + Math.max(0, ahead.gap - SPORT_RIDING.gap) * 0.9);
      if (ahead.o.foot !== undefined && ahead.o.foot !== null && r.item === 'bicycle' && ahead.gap < SPORT_RIDING.bell && real() - r.bellAt > 4) r.bellAt = real();
    }
    // the road's end ahead: round (begun far enough short of it that the way round, as far ahead as the road is wide,
    // ends twelve metres short of it: never out into the junction there)
    const toEnd = (r.dir > 0 ? road.a1 - r.along : r.along - road.a0) - Math.max(2, r.lat);
    if (toEnd < SPORT_RIDING.end) {
      // (round only when nothing is in the way of the turn: otherwise waiting at the edge until it is clear)
      if (!turnClear(r, list)) target = 0;
      else if (r.v <= SPORT_RIDING.turning + 0.2) { r.mode = 'turn'; r.turned = 0; return; }
      else target = Math.min(target, SPORT_RIDING.turning);
    } else if (toEnd < SPORT_RIDING.end + 10) target = Math.min(target, SPORT_RIDING.turning + (toEnd - SPORT_RIDING.end) * 0.35);
    // the drive: the pedals turned, a push, a stride, as the speed wanted asks; braking hard enough to keep the gap
    ride.speed = r.v; ride.lean = 0; ride.heading = r.h; ride.phase = r.phase;
    const short = target - r.v;
    // (up to their pace, then a glide: a skateboarder pushes a few times and rides the board, a skater strides and
    // glides, a cyclist pedals and freewheels a little; on again once a good way under it)
    if (r.v >= target - 0.05) r.coast = true; else if (r.v < target * SPORT_RIDING.glide[r.item]) r.coast = false;
    const drive = short > 0.05 && !r.coast ? clamp(short * 1.6 + 0.35, 0, 1) : 0;
    stepSport(ride, { throttle: drive, brake: short < -0.4 ? 1 : 0 }, dt, { handling: h });
    let v = ride.speed;
    if (v > target + 0.05) v = Math.max(target, r.v - SPORT_RIDING.brake * dt);
    r.v = Math.max(0, v); r.phase = ride.phase;
    // (held up: if what holds it is a car waiting for this very rider, after a few seconds of both waiting, on past it)
    if (target < 0.05 && r.v < 0.05) r.held = (r.held || 0) + dt; else r.held = 0;
    if (r.held > SPORT_RIDING.giveWay * 1.5 && ahead && ahead.o.car && ahead.o.id && !ahead.o.held && hub.traffic && hub.traffic.waitingFor && hub.traffic.waitingFor(r.n)) {
      r.ghostOf = ahead.o.id; r.ghostUntil = real() + 4; r.held = 0; book.wentPast = (book.wentPast || 0) + 1;
    }
    // (across the road only where nothing is beside them on that side: back toward the edge once past what was gone
    // round, out from it once past what was squeezed by)
    if (Math.abs(latWant - r.lat) > 0.01) {
      const ux = Math.sin(r.h), uz = Math.cos(r.h), front = r.item === 'bicycle' ? 0.9 : 0.45, toward = Math.sign(latWant - r.lat);
      const beside = list.some((o) => {
        if (o.rider === r.n) return false;
        const along = (o.x - r.x) * ux + (o.z - r.z) * uz;
        const turned = (o.h || 0) - r.h, ca = Math.abs(Math.cos(turned)), sa = Math.abs(Math.sin(turned));
        const reachAlong = ca * (o.hl || 0.5) + sa * (o.hw || 0.4), reachAcross = ca * (o.hw || 0.4) + sa * (o.hl || 0.5);
        // (beside them, or just behind on that side: back in only a couple of metres clear ahead of what was passed)
        if (along > reachAlong + front + 0.4 || along < -(reachAlong + front + (o.v > 0.3 ? 2.5 : 0.4))) return false;
        const side = (latOf(road, o.x, o.z, r.dir) - r.lat) * toward;
        return side > 0 && side - reachAcross - 0.35 < 0.25;
      });
      if (beside) latWant = r.lat;
    }
    // across the road, toward where it wants to be, as a rider steers: a little lean into it
    const dl = clamp(latWant - r.lat, -0.9 * dt, 0.9 * dt);
    r.lat += dl;
    const yaw = r.v > 0.3 ? Math.atan2(-dl / dt, r.v) * 0.6 : 0;
    r.h = wrap(headingOf(road, r.dir) + yaw);
    r.lean += (clamp(-yaw * 1.2, -0.25, 0.25) - r.lean) * Math.min(1, dt * 3);
    r.along += r.v * dt * r.dir;
    [r.x, r.z] = pointOf(road, r.along, r.lat, r.dir);
    // now and then pulled in to stand a while
    r.next -= r.v * dt;
    // (never pulled in with someone close behind on its side of the road: they would run into them)
    const followed = () => list.some((o) => { if (o.rider === r.n || !(o.v > 0.3)) return false; const along = (o.x - r.x) * Math.sin(r.h) + (o.z - r.z) * Math.cos(r.h); return along < 0 && along > -10 && Math.abs(latOf(road, o.x, o.z, r.dir) - r.lat) < 1.4; });
    if (r.next <= 0 && Math.abs(r.lat - want) < 0.1 && !ahead && !followed()) { r.mode = 'stop'; r.v = 0; r.until = real() + SPORT_RIDING.pause[0] + hash(r.i, Math.floor(real())) * (SPORT_RIDING.pause[1] - SPORT_RIDING.pause[0]); }
  }

  // An owner coming for what was taken from them, after the police have caught the thief: on foot to it, on, away.
  function returning(r, t) {
    const actors = hub.actors;
    if (!actors) { r.mode = 'off'; r.takenBy = null; return; }
    // (sent for it: no longer someone who backed away from trouble, to be let go back to their day after a while)
    const sendFor = () => { actors.walkTo(r.i, r.x, r.z, 1.6, `Going for the ${NAMES[r.item]}`); const sent = actors.get(r.i); if (sent) sent.after = 0; };
    if (!actors.has(r.i)) { if (actors.take(r.i, t, { x: r.x + 6, z: r.z })) sendFor(); return; }
    const m = actors.get(r.i);
    // (knocked off by a car, `knock`: on the ground, and getting up, before anything else)
    if (m && m.mode === 'hold' && (m.act === 'Knocked down' || m.act === 'Getting up' || (m.until && real() < m.until))) return;
    if (m && Math.hypot(m.x - r.x, m.z - r.z) < 1.2) { actors.drop(r.i); r.takenBy = null; r.fallen = false; r.v = 0; r.lean = 0; book.returned += 1; backOnRoad(r); }
    else if (m && (m.mode !== 'go' || m.home || m.goal === null)) sendFor();
  }
  // Back on the road from wherever it was left: onto its own road if near it, otherwise home for the day.
  function backOnRoad(r) {
    const road = roadOf(r);
    if (!road) { goHome(r); return; }
    const clear = SPORT_RIDING.end + road.w / 2 + 1;
    const along = clamp(alongOf(road, r.x, r.z), road.a0 + clear, road.a1 - clear);
    const [x, z] = pointOf(road, along, edgeLat(road), r.dir);
    if (Math.hypot(x - r.x, z - r.z) > 25) { goHome(r); return; }
    Object.assign(r, { mode: 'ride', along, lat: latOf(road, r.x, r.z, r.dir), h: headingOf(road, r.dir), turned: 0, next: SPORT_RIDING.between[0] });
    if (!r.cruise) r.cruise = SPORT_RIDING.pace[r.item][0];
  }

  function tick(dt, t, realNow) {
    if (!(dt > 0)) return;
    const list = obstaclesNow();
    for (const r of riders) {
      if (r.mode === 'taken' || r.mode === 'kept' || r.mode === 'robbed') continue;
      if (r.mode === 'returning') { returning(r, t); continue; }
      const person = people[r.i];
      const free = hub.actors ? !hub.actors.has(r.i) : true;
      const due = onShift(r, t) && free && !(person && person.gone);
      if (r.mode === 'off') { if (due && anyPlayers()) comeOut(r, t); continue; }
      if (!due && nearestPlayer(r.x, r.z) > SPORT_RIDING.apart) { goHome(r); continue; }
      // (too far from every player to be seen: they keep going, a step at a time, as cheaply)
      const steps = Math.max(1, Math.ceil(dt / 0.12));
      for (let k = 0; k < steps; k += 1) step(r, dt / steps, list);
    }
  }

  // Tells the population where a rider is while out on it: on it, drawn by the page as a rider (sport-view.js), not as
  // someone walking.
  function locate(i, t, outp) {
    const n = ofPerson.get(i);
    if (n === undefined) return false;
    const r = riders[n];
    if (!out(r)) return false;
    outp.x = r.x; outp.z = r.z; outp.h = r.h; outp.pose = POSE.hidden; outp.moving = r.v > 0.1; outp.spot = people[i].homeSpot; outp.leg = null;
    outp.act = r.mode === 'stop' ? 'Standing a while' : r.item === 'bicycle' ? 'Cycling' : r.item === 'skateboard' ? 'Skateboarding' : 'Skating';
    return true;
  }
  population.setHook(locate);

  // ---- taking one ----

  const onFoot = (p) => !p.driving && (p.riding === null || p.riding === undefined) && (p.astride === null || p.astride === undefined) && !p.incar && !p.carried && !p.custody && !p.swimming && !p.dead && !p.down;
  const takenBy = (id) => riders.filter((r) => r.takenBy === id && (r.mode === 'taken' || r.mode === 'kept'));
  // the rider nearest a player that may be taken from (for the page's offer, and the town's check)
  function nearTaker(p) {
    let best = null;
    for (const r of riders) {
      if (!out(r)) continue;
      const d = Math.hypot(r.x - p.x, r.z - p.z);
      if (d <= SPORT_RIDING.take && (!best || d < best.d)) best = { r, d };
    }
    return best ? best.r : null;
  }
  function take(p, n) {
    const r = riders[Number(n)];
    if (!r || !out(r)) throw new GameError('NO_RIDER', 'There is nobody on it to take it from.');
    if (!onFoot(p)) throw new GameError('NOT_ON_FOOT', 'You cannot take it now.');
    if (p.fight) throw new GameError('FIGHTING', 'Not in the middle of a fight.');
    if (Math.hypot(r.x - p.x, r.z - p.z) > SPORT_RIDING.take) throw new GameError('TOO_FAR', 'Get closer to them.');
    if (r.v > SPORT_RIDING.slow) throw new GameError('TOO_FAST', `They are going too fast: wait until they slow down.`);
    const who = people[r.i];
    const at = { x: r.x, z: r.z, h: r.h };
    // the rider off it and away: pushed off to the side, they run, shouting
    r.mode = 'robbed';
    if (hub.actors) {
      const side = { x: Math.cos(at.h) * 0.9, z: -Math.sin(at.h) * 0.9 };
      const from = zoneWalkable(at.x + side.x, at.z + side.z, [], 0.3) ? { x: at.x + side.x, z: at.z + side.z } : { x: at.x - side.x, z: at.z - side.z };
      if (hub.actors.take(r.i, state.t, from)) hub.actors.flee(r.i, p.x, p.z, 4.4, 'Running from a thief');
    }
    if (hub.talk) hub.talk.say({ who: `n:${r.i}`, name: who ? who.short || who.name : 'Someone', text: `Thief! Thief! My ${NAMES[r.item]}!`, lang: 'en', x: at.x, z: at.z, kind: 'shout', range: 40, hold: 3.4 });
    const crime = hub.justice ? hub.justice.offence(p, 'vehicle_theft', { victim: { kind: 'npc', id: r.i, name: who ? who.name : 'Someone' }, x: at.x, z: at.z, vehicle: `sport:${r.item}` }) : null;
    r.mode = 'taken'; r.takenBy = p.id; r.v = 0; r.lean = 0; r.keptAt = real(); r.fallen = false;
    book.taken += 1;
    p.astride = `sp:${r.item}`;
    p.psport = { id: r.item, x: at.x, z: at.z, h: at.h, movedAt: real(), taken: r.n };
    p.x = at.x; p.z = at.z; p.heading = at.h; p.lastMoveAt = real();
    // (more than one player may hold: the oldest of theirs is found by its owner)
    const held = takenBy(p.id).filter((q) => q.mode === 'kept').sort((a, b) => a.keptAt - b.keptAt);
    while (held.length + 1 > SPORT_RIDING.most) { const q = held.shift(); q.mode = 'returning'; }
    return { n: r.n, item: r.item, x: at.x, z: at.z, h: at.h, crime: crime ? crime.id : null, name: who ? who.short || who.name : null };
  }
  // Left by the one who took it (own-sports.js `leave`, or thrown off it: `fallen`): it stands, or lies, where it is.
  function leftBy(p, n, at, fallen = false) {
    const r = riders[n];
    if (!r || r.takenBy !== p.id) return;
    r.mode = 'kept'; r.x = at.x; r.z = at.z; r.h = at.h; r.keptAt = real(); r.fallen = !!fallen;
  }
  // Back on one taken and left standing, from beside it.
  function retake(p, n) {
    const r = riders[Number(n)];
    if (!r || r.mode !== 'kept' || r.takenBy !== p.id) throw new GameError('NOT_YOURS', 'That is not one you can ride.');
    if (!onFoot(p)) throw new GameError('NOT_ON_FOOT', 'You cannot get on it now.');
    if (Math.hypot(r.x - p.x, r.z - p.z) > 2.6) throw new GameError('TOO_FAR', 'Get closer to it.');
    r.mode = 'taken'; r.fallen = false;
    p.astride = `sp:${r.item}`;
    p.psport = { id: r.item, x: r.x, z: r.z, h: r.h, movedAt: real(), taken: r.n };
    p.x = r.x; p.z = r.z; p.heading = r.h; p.lastMoveAt = real();
    return { n: r.n, item: r.item, x: r.x, z: r.z, h: r.h };
  }
  // Knocked off by a player's car (impact.js, 31 October 2026, the owner's word: "the car should jam them if they block
  // the road"): the rider is struck as anyone on foot is (impact.js throws them down ahead of the car, across its way,
  // and it goes over them); what they rode is thrown aside, off the car's way, and lies there; once up again, they go
  // back for it and ride on (`returning`). (cx, cz, h): where the car is and which way it faces; `half`: half its width.
  // Gives the person, or null if there is nobody on it to knock off.
  function knock(n, cx, cz, h, half = 0.95) {
    const r = riders[Number(n)];
    if (!r || !out(r) || !hub.actors) return null;
    if (!hub.actors.take(r.i, state.t, { x: r.x, z: r.z })) return null;
    const fx = Math.sin(h), fz = Math.cos(h), lx = Math.cos(h), lz = -Math.sin(h);
    const lateral = (r.x - cx) * lx + (r.z - cz) * lz;
    const first = lateral >= 0 ? 1 : -1;
    for (const side of [first, -first]) {
      const off = side * (half + 0.9) - lateral;
      const x = r.x + fx * 1.2 + lx * off, z = r.z + fz * 1.2 + lz * off;
      if (zoneWalkable(x, z, [], 0.3)) { r.x = x; r.z = z; r.h = h + side * 1.1; break; }
    }
    r.mode = 'returning'; r.takenBy = null; r.fallen = true; r.v = 0; r.lean = 0; r.held = 0;
    book.knocked = (book.knocked || 0) + 1;
    return r.i;
  }
  // Where the thief has it now (own-sports.js, each step ridden).
  function moved(n, at) { const r = riders[n]; if (r && r.mode === 'taken') { r.x = at.x; r.z = at.z; r.h = at.h; } }
  // The police have caught them: everything they took goes back (the one they are on is left where it is first).
  function recover(playerId) {
    let n = 0;
    for (const r of riders) if (r.takenBy === playerId && (r.mode === 'taken' || r.mode === 'kept')) { r.mode = 'returning'; n += 1; }
    return n;
  }

  // What can be seen of them from a point: those near enough, and what each is doing.
  function list(x, z, viewerId) {
    const shownList = [];
    const rd = (v, k = 100) => Math.round(v * k) / k;
    for (const r of riders) {
      if (!shown(r) || r.mode === 'taken') continue;
      if (Math.abs(r.x - x) > SPORT_RIDING.seen || Math.abs(r.z - z) > SPORT_RIDING.seen) continue;
      shownList.push({ n: r.n, item: r.item, person: out(r) ? r.i : null, x: rd(r.x), z: rd(r.z), h: rd(r.h, 1000), speed: rd(out(r) ? r.v : 0, 10), lean: rd(r.lean), phase: rd(r.phase), mode: r.mode, mine: r.takenBy !== null && r.takenBy === viewerId, fallen: !!r.fallen, bellAgo: rd(real() - r.bellAt, 10) });
    }
    return shownList;
  }
  // What stands in the way of a player's car or motorcycle: every rider near a player, as a small box (`standing`: only
  // what stands or lies on its own, nobody on it: a car knocks a rider off instead, impact.js).
  function boxes(standing = false) {
    const outBoxes = [];
    for (const r of riders) {
      if (!shown(r) || r.mode === 'taken') continue;
      if (standing && out(r)) continue;
      if (nearestPlayer(r.x, r.z) > 60) continue;
      const half = r.item === 'bicycle' ? 0.55 : 0.35;
      outBoxes.push({ x0: r.x - half, z0: r.z - half, x1: r.x + half, z1: r.z + half, kind: 'solid' });
    }
    return outBoxes;
  }
  // For the town's cars: the riders on the road, as things in it.
  const obstacles = () => riders.filter((r) => out(r)).map((r) => ({ x: r.x, z: r.z, h: r.h, hw: 0.35, hl: r.item === 'bicycle' ? 0.9 : 0.45, v: r.v, rider: r.n }));
  const audit = () => ({ out: riders.filter(out).length, taken: book.taken, returned: book.returned, knocked: book.knocked || 0, byKind: Object.fromEntries(KINDS.map((k) => [k, riders.filter((r) => r.item === k).length])) });

  const api = { tick, list, take, leftBy, retake, moved, recover, boxes, obstacles, audit, nearTaker, knock, isOut: (r) => out(r), riders: () => riders, count: () => riders.length };
  hub.sportRiders = api;
  return api;
}

export const sportRiderName = (item) => NAMES[item] || 'bicycle';
