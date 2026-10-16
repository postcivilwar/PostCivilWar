// Okada: motorcycle taxis.
//
// The riders are residents like anyone else, with names, homes and families.
// While on shift each one is simulated step by step: waiting at a rank,
// cruising to another, going to a fare, carrying a passenger along the roads
// and lanes, and going back to wait. Passengers are townspeople whose day has
// a long journey in it and who would rather ride than walk, and players.
//
// A fare is real game money. A player pays the rider on the spot. The town's
// own fares are added up as they are earned and settled every hour, in one
// ledger transaction, from a pooled account that stands for the town's
// households; the riders pay a daily levy and take the rest home. The pool
// is a simplification: residents do not yet have purses of their own.

import { ZONE, ZONE_SPOTS, ZONE_STOPS, ZONE_VENUES, ZONE_ROADS, OUTSKIRT_ROADS, AIRPORT, zoneWalkable, trafficHold, onBoulevard } from './zone.js';
import { graphRoute, graphDistance, graphNearest, graphPoint } from './graph.js';
import { POSE, RIDE_SPEED } from './population.js';
import { GameError } from './registry.js';

export const OKADA_RULES = Object.freeze({
  speed: RIDE_SPEED + 0.5,      // metres per real second on the road
  lane: 1.2,                    // riders keep to the right of the road
  base: 30, perMetre: 0.2, least: 50,
  patience: 45,                 // real seconds a passenger waits before walking instead
  idle: Object.freeze([40, 140]),
  levy: 50, float: 500, pool: 400000,
  reach: 4.5,
});

// A motorcycle with a player in the saddle (one taken from its rider: nobody sells or hires them yet).
export const MOTO = Object.freeze({ speedRoad: 11, speedRough: 6, reverse: 2, radius: 0.55, returnAfter: 10 });

const inBox = (r, x, z) => !!r && x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
// tarred: the roads, and the airport's runway, taxiway, its links and the apron (all paved)
const PAVED = [AIRPORT.runway, AIRPORT.taxiway, AIRPORT.apron, ...(Array.isArray(AIRPORT.links) ? AIRPORT.links : [])].filter((r) => r && Number.isFinite(r.x0));
const onTar = (x, z) => ZONE_ROADS.some((r) => inBox(r, x, z)) || OUTSKIRT_ROADS.some((r) => inBox(r, x, z)) || PAVED.some((r) => inBox(r, x, z));
// The top speed of a motorcycle at a point, in metres a second.
export const motoSpeedAt = (x, z, wet) => (onTar(x, z) ? MOTO.speedRoad : MOTO.speedRough) * (wet ? 0.8 : 1);

export const okadaFare = (metres) => Math.max(OKADA_RULES.least, Math.round((OKADA_RULES.base + metres * OKADA_RULES.perMetre) / 10) * 10);

const hash = (a, b = 0) => { let h = (a * 374761393 + b * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const RANK_SPOTS = ZONE_SPOTS.filter((s) => s.slot === 'rank');

export function createOkada({ state, ledger, monetary, issuanceAccount, population, timeScale, emit, players, hub = {}, obstacles = () => [] }) {
  const people = population.people;
  const riderPeople = people.filter((p) => p.job === 'okada');
  const account = (n) => ledger.openAccount('player', `npc:okada-${String(n + 1).padStart(2, '0')}`, 'wallet');
  const pool = ledger.openAccount('community', 'households', 'pool');
  const council = ledger.openAccount('government', ZONE.government.local.code, 'treasury');

  if (!state.okada) {
    state.okada = {
      riders: riderPeople.map((p, n) => ({ n, i: p.index, mode: 'off', x: 0, z: 0, h: 0, node: 0, route: [], k: 0, rank: -1, goal: null, passenger: null, idleUntil: 0, rides: 0, metres: 0, moving: false })),
      trips: {}, owed: riderPeople.map(() => 0), cursor: -1, rideCount: 0, fareTotal: 0, settled: 0, playerFares: 0, playerRides: 0, walked: 0, pay: 0, lastHour: -1,
    };
    monetary.post({ key: 'opening:households', kind: 'issuance', initiator: 'ops:monetary', reason: 'Opening funds of the town\'s households', legs: [{ account: issuanceAccount, amount: -OKADA_RULES.pool }, { account: pool, amount: OKADA_RULES.pool }] });
    for (let n = 0; n < riderPeople.length; n += 1) account(n);
  }
  const book = state.okada;
  const riders = book.riders;
  const riderOf = new Map(riders.map((r) => [r.i, r.n]));

  const shiftOf = (r, day) => { const from = (day.sunday ? 10.5 : 5.75) + hash(r.i, 5) * 1.5; return [from * 3600, (19.5 + hash(r.i, 6) * 1.6) * 3600]; };
  const freeNow = (r) => !r.passenger && !r.frozen && (r.mode === 'rank' || r.mode === 'toRank');
  // off his machine: it has been taken from him, or left somewhere and he has not got back to it
  const parted = (r) => r.mode === 'taken' || r.mode === 'abandoned';
  const rankTaken = () => { const taken = new Set(); for (const r of riders) if (r.rank >= 0) taken.add(r.rank); return taken; };

  function routeTo(r, node) {
    r.route = graphRoute(r.node, node, true) || [node];
    r.k = 0;
  }

  // sends a free rider to wait somewhere: the nearest rank with room, or, when
  // cruising, another one
  function goRank(r, real, elsewhere = false) {
    const taken = rankTaken();
    let best = null;
    let bestScore = Infinity;
    for (const s of RANK_SPOTS) {
      if (taken.has(s.id) && s.id !== r.rank) continue;
      if (elsewhere && r.rank >= 0 && ZONE_SPOTS[r.rank].venue === s.venue) continue;
      const score = Math.hypot(s.x - r.x, s.z - r.z) * (elsewhere ? hash(r.i * 31 + s.id, Math.floor(real)) + 0.2 : 1 + hash(r.i, s.id) * 0.5);
      if (score < bestScore) { bestScore = score; best = s; }
    }
    if (!best) { r.mode = 'rank'; r.idleUntil = real + 60; return; }
    r.rank = best.id;
    r.mode = 'toRank';
    r.goal = { x: best.x, z: best.z, h: best.facing };
    // ride to the nearest point on the road, then pull in
    routeTo(r, graphNearest(best.x, best.z, true));
  }

  // --- trips: a townsperson's journey by okada ------------------------------------

  function indexOnPath(path, node, fromEnd) {
    const [x, z] = graphPoint(node);
    const n = path.xs.length / 2;
    for (let a = 0; a < n; a += 1) { const i = fromEnd ? n - 1 - a : a; if (Math.abs(path.xs[i * 2] - x) < 0.02 && Math.abs(path.xs[i * 2 + 1] - z) < 0.02) return i; }
    return -1;
  }

  function along(path, d, out, pose) {
    const cum = path.cum;
    const dist = Math.max(0, Math.min(path.len, d));
    let a = 0, b = cum.length - 1;
    while (b - a > 1) { const m = (a + b) >> 1; if (cum[m] <= dist) a = m; else b = m; }
    const span = cum[b] - cum[a] || 1;
    const f = (dist - cum[a]) / span;
    out.x = path.xs[a * 2] + (path.xs[b * 2] - path.xs[a * 2]) * f;
    out.z = path.xs[a * 2 + 1] + (path.xs[b * 2 + 1] - path.xs[a * 2 + 1]) * f;
    out.h = Math.atan2(path.xs[b * 2] - path.xs[a * 2], path.xs[b * 2 + 1] - path.xs[a * 2 + 1]);
    out.pose = pose;
    out.moving = pose === POSE.walk;
  }

  function dispatch(trip) {
    const [px, pz] = graphPoint(trip.from);
    let best = null;
    let bestD = 420;
    for (const r of riders) { if (!freeNow(r)) continue; const d = Math.hypot(r.x - px, r.z - pz); if (d < bestD) { bestD = d; best = r; } }
    if (!best) return false;
    best.passenger = { npc: trip.i };
    best.mode = 'toPickup';
    best.rank = -1;
    best.goal = null;
    routeTo(best, trip.from);
    trip.rider = best.n;
    return true;
  }

  function startTrip(i, dayIndex, k, real) {
    if (book.trips[i]) return;
    const leg = population.planOf(i, dayIndex).legs[k];
    if (!leg || !leg.ride) return;
    const a = indexOnPath(leg.path, leg.ride.from, false);
    const b = indexOnPath(leg.path, leg.ride.to, true);
    if (a < 0 || b <= a) return;
    const trip = { i, day: dayIndex, k, phase: 'toPickup', t: real, rider: -1, from: leg.ride.from, to: leg.ride.to, a, b, fare: okadaFare(leg.ride.road), end: dayIndex * 86400 + leg.t1 };
    book.trips[i] = trip;
    dispatch(trip);
  }

  function stepTrip(trip, t, real) {
    const p = people[trip.i];
    const leg = population.planOf(trip.i, trip.day).legs[trip.k];
    const path = leg.path;
    if (trip.phase === 'toPickup' && (real - trip.t) * p.pace >= path.cum[trip.a]) { trip.phase = 'waiting'; trip.t = real; }
    if (trip.phase === 'waiting') {
      if (trip.rider < 0 && !dispatch(trip) && real - trip.t > OKADA_RULES.patience) { trip.phase = 'walking'; trip.t = real; book.walked += 1; return; }
      const r = trip.rider >= 0 ? riders[trip.rider] : null;
      if (r && r.mode === 'atPickup') { trip.phase = 'riding'; r.mode = 'carry'; routeTo(r, trip.to); }
    }
    if (trip.phase === 'fromDrop' && path.cum[trip.b] + (real - trip.t) * p.pace >= path.len) trip.phase = 'arrived';
    if (trip.phase === 'walking' && path.cum[trip.a] + (real - trip.t) * p.pace >= path.len) trip.phase = 'arrived';
    if (trip.phase === 'arrived' && t >= trip.end) delete book.trips[trip.i];
  }

  // Tells the population where a rider or a passenger is.
  function locate(i, t, out) {
    const n = riderOf.get(i);
    if (n !== undefined) {
      const r = riders[n];
      if (r.mode === 'off' || parted(r)) return false;
      out.x = r.x; out.z = r.z; out.h = r.h; out.pose = POSE.ride; out.moving = r.moving; out.spot = people[i].post.work; out.leg = null;
      out.act = r.passenger ? 'Carrying a passenger' : r.mode === 'rank' ? 'Waiting for a fare' : 'Riding';
      return true;
    }
    const trip = book.trips[i];
    if (!trip) return false;
    const p = people[i];
    const leg = population.planOf(i, trip.day).legs[trip.k];
    const path = leg.path;
    const real = state.real;
    out.spot = leg.spot; out.leg = leg; out.act = leg.act;
    if (trip.phase === 'toPickup') along(path, (real - trip.t) * p.pace, out, POSE.walk);
    else if (trip.phase === 'waiting') { along(path, path.cum[trip.a], out, POSE.stand); out.moving = false; out.act = 'Waiting for an okada'; }
    else if (trip.phase === 'riding') { const r = riders[trip.rider]; out.x = r.x; out.z = r.z; out.h = r.h; out.pose = POSE.ride; out.moving = true; out.act = 'On an okada'; }
    else if (trip.phase === 'fromDrop') along(path, path.cum[trip.b] + (real - trip.t) * p.pace, out, POSE.walk);
    else if (trip.phase === 'walking') along(path, path.cum[trip.a] + (real - trip.t) * p.pace, out, POSE.walk);
    else { const s = ZONE_SPOTS[leg.spot]; out.x = s.x; out.z = s.z; out.h = s.facing; out.pose = s.inside ? POSE.hidden : { stand: POSE.stand, sit: POSE.sit, lie: POSE.lie }[s.pose]; out.moving = false; }
    return true;
  }
  population.setHook(locate);

  // --- riders -----------------------------------------------------------------------

  function arrive(r, t, real) {
    if (r.mode === 'toRank') {
      r.mode = 'rank';
      r.idleUntil = real + OKADA_RULES.idle[0] + hash(r.i, Math.floor(real)) * (OKADA_RULES.idle[1] - OKADA_RULES.idle[0]);
      if (r.goal) { r.x = r.goal.x; r.z = r.goal.z; r.h = r.goal.h; }
    } else if (r.mode === 'toPickup') r.mode = 'atPickup';
    else if (r.mode === 'home') { r.mode = 'off'; r.rank = -1; }
    else if (r.mode === 'carry') {
      const who = r.passenger;
      r.passenger = null;
      r.rides += 1;
      if (who && who.npc !== undefined) {
        const trip = book.trips[who.npc];
        if (trip) { trip.phase = 'fromDrop'; trip.t = real; book.owed[r.n] += trip.fare; book.fareTotal += trip.fare; book.rideCount += 1; }
      } else if (who && who.player) setDown(players[who.player], r, who.name, true);
      goRank(r, real);
    }
  }

  function stepRider(r, dt, t, real, wet) {
    r.moving = false;
    if (r.mode === 'off' || r.mode === 'atPickup' || r.frozen || parted(r)) return;
    if (r.mode === 'rank') {
      if (real >= r.idleUntil && !r.passenger) goRank(r, real, true);
      return;
    }
    // give way to anyone on foot in front
    const ahead = { x: r.x + Math.sin(r.h) * 1.6, z: r.z + Math.cos(r.h) * 1.6 };
    for (const id of Object.keys(players)) { const q = players[id]; if (!q.riding && !q.driving && Math.hypot(q.x - ahead.x, q.z - ahead.z) < 1.5) return; }
    let budget = OKADA_RULES.speed * (wet ? 0.8 : 1) * dt;
    r.metres += budget;
    while (budget > 0) {
      let tx, tz;
      const final = r.k >= r.route.length;
      if (!final) [tx, tz] = graphPoint(r.route[r.k]);
      else if (r.goal && r.mode === 'toRank') { tx = r.goal.x; tz = r.goal.z; } else { arrive(r, t, real); return; }
      const dx = tx - r.x, dz = tz - r.z;
      const gap = Math.hypot(dx, dz);
      // at a red light on the city block's boulevard: it waits at the line
      const step = Math.min(gap, budget) + 0.6;
      if (gap > 0.01 && trafficHold(r.x, r.z, r.x + (dx / gap) * step, r.z + (dz / gap) * step, real)) { r.held = true; r.h = Math.atan2(dx, dz); return; }
      r.held = false;
      if (gap <= budget) {
        r.x = tx; r.z = tz; budget -= gap;
        if (!final) { r.node = r.route[r.k]; r.k += 1; } else { arrive(r, t, real); return; }
      } else {
        r.x += (dx / gap) * budget; r.z += (dz / gap) * budget; r.h = Math.atan2(dx, dz); budget = 0;
      }
      r.moving = true;
    }
  }

  // --- players as passengers ---------------------------------------------------------

  const stopNode = (stop) => graphNearest(stop.x, stop.z, true);
  function riderNear(player, n) {
    const r = riders[n];
    if (!r || r.mode === 'off') throw new GameError('NO_RIDER', 'There is no rider there.');
    if (Math.hypot(player.x - r.x, player.z - r.z) > OKADA_RULES.reach) throw new GameError('TOO_FAR', 'You are too far away. Walk closer.');
    if (parted(r) || r.frozen) throw new GameError('NO_RIDER', 'There is no rider there.');
    if (r.passenger || r.mode === 'toPickup' || r.mode === 'atPickup' || r.mode === 'home') throw new GameError('BUSY', `${people[r.i].first} already has a fare.`);
    return r;
  }

  function options(player, n) {
    const r = riderNear(player, n);
    const stops = [];
    for (const stop of ZONE_STOPS) {
      const metres = graphDistance(r.node, stopNode(stop), true);
      if (metres < 70 || metres === Infinity) continue;
      stops.push({ id: stop.id, name: stop.name, metres: Math.round(metres), fare: okadaFare(metres) });
    }
    return { rider: { n, name: people[r.i].name, first: people[r.i].first }, stops };
  }

  function ride(player, n, stopId) {
    const r = riderNear(player, n);
    const stop = ZONE_STOPS.find((s) => s.id === stopId);
    if (!stop) throw new GameError('NO_STOP', 'The rider does not know that place.');
    const node = stopNode(stop);
    const metres = graphDistance(r.node, node, true);
    if (metres < 70 || metres === Infinity) throw new GameError('TOO_NEAR', 'That is no distance. Walk it.');
    const fare = okadaFare(metres);
    book.pay += 1;
    const txn = ledger.post({ key: `okada:${book.pay}:${player.id}`, kind: 'transfer', initiator: `player:${player.id}`, reason: `Okada fare to ${stop.name}`, legs: [{ account: player.wallet, amount: -fare }, { account: account(n), amount: fare }], meta: { rider: people[r.i].id, metres: Math.round(metres) } });
    book.playerFares += fare;
    book.playerRides += 1;
    r.passenger = { player: player.id, name: stop.name };
    r.mode = 'carry';
    r.rank = -1;
    r.goal = null;
    routeTo(r, node);
    player.riding = n;
    player.x = r.x; player.z = r.z;
    return { fare, txn: txn.id, to: stop.name, rider: people[r.i].name, metres: Math.round(metres) };
  }

  // puts a passenger back on their feet beside the motorcycle
  function setDown(player, r, where, arrived) {
    if (!player) return false;
    for (const [dx, dz] of [[1.4, 0], [-1.4, 0], [0, 1.4], [0, -1.4], [2.2, 2.2], [-2.2, 2.2], [2.2, -2.2], [-2.2, -2.2], [3.4, 0], [-3.4, 0], [0, 3.4], [0, -3.4]]) {
      if (!zoneWalkable(r.x + dx, r.z + dz)) continue;
      player.x = r.x + dx; player.z = r.z + dz; player.riding = null; player.lastMoveAt = state.real;
      emit(player.id, { type: 'note', text: arrived ? `You get down at ${where}.` : 'You get down.' });
      return true;
    }
    return false;
  }

  function alight(player) {
    if (player.riding === null || player.riding === undefined) throw new GameError('NOT_RIDING', 'You are not on an okada.');
    const r = riders[player.riding];
    if (!setDown(player, r, '', false)) throw new GameError('NO_ROOM', 'There is no room to get down here.');
    r.passenger = null;
    goRank(r, state.real);
    return { x: player.x, z: player.z };
  }

  // --- money --------------------------------------------------------------------------

  function settle(hour) {
    const due = [];
    for (let n = 0; n < riders.length; n += 1) if (book.owed[n] > 0) due.push([n, book.owed[n]]);
    for (let from = 0; from < due.length; from += 60) {
      const part = due.slice(from, from + 60);
      const total = part.reduce((sum, [, amount]) => sum + amount, 0);
      if (ledger.balance(pool) < total) return;
      book.pay += 1;
      ledger.post({ key: `okada:${book.pay}:fares`, kind: 'transfer', initiator: 'svc:okada', reason: 'Okada fares for the hour', legs: [{ account: pool, amount: -total }, ...part.map(([n, amount]) => ({ account: account(n), amount }))], meta: { rides: part.length } });
      for (const [n, amount] of part) { book.owed[n] -= amount; book.settled += amount; }
    }
    if (hour !== 21) return;
    // the day's levy to the council, and what is left goes home
    const levies = [];
    const keeps = [];
    for (let n = 0; n < riders.length; n += 1) {
      const balance = ledger.balance(account(n));
      if (balance >= OKADA_RULES.levy) levies.push(n);
      const home = balance - OKADA_RULES.levy - OKADA_RULES.float;
      if (home > 0) keeps.push([n, home]);
    }
    for (let from = 0; from < levies.length; from += 60) {
      const part = levies.slice(from, from + 60);
      book.pay += 1;
      ledger.post({ key: `okada:${book.pay}:levy`, kind: 'government_fee', initiator: 'svc:okada', reason: 'Daily okada levy', legs: [{ account: council, amount: OKADA_RULES.levy * part.length }, ...part.map((n) => ({ account: account(n), amount: -OKADA_RULES.levy }))] });
    }
    for (let from = 0; from < keeps.length; from += 60) {
      const part = keeps.slice(from, from + 60);
      book.pay += 1;
      ledger.post({ key: `okada:${book.pay}:home`, kind: 'transfer', initiator: 'svc:okada', reason: 'Riders\' takings brought home', legs: [{ account: pool, amount: part.reduce((sum, [, amount]) => sum + amount, 0) }, ...part.map(([n, amount]) => ({ account: account(n), amount: -amount }))] });
    }
  }

  // --- the clock ----------------------------------------------------------------------

  function tick(dt, t, real, wet) {
    const dayIndex = Math.floor(t / 86400);
    const s = t - dayIndex * 86400;
    const day = population.dayInfo(dayIndex);
    for (const r of riders) {
      const [from, to] = shiftOf(r, day);
      const on = s >= from && s < to;
      if (parted(r)) continue;
      if (on && r.mode === 'off') {
        const home = ZONE_SPOTS[people[r.i].homeSpot];
        r.node = graphNearest(home.x, home.z, true);
        [r.x, r.z] = graphPoint(r.node);
        goRank(r, real);
      } else if (!on && !r.passenger && (r.mode === 'rank' || r.mode === 'toRank')) {
        const home = ZONE_SPOTS[people[r.i].homeSpot];
        r.mode = 'home'; r.rank = -1; r.goal = null;
        routeTo(r, graphNearest(home.x, home.z, true));
      }
    }
    // journeys that begin now
    if (book.cursor < 0) book.cursor = t;
    if (t > book.cursor) {
      for (let d = Math.floor(book.cursor / 86400); d <= dayIndex; d += 1) {
        for (const [at, i, k] of population.ridesOf(d)) if (at > book.cursor && at <= t) startTrip(i, d, k, real);
      }
      book.cursor = t;
    }
    for (const key of Object.keys(book.trips)) stepTrip(book.trips[key], t, real);
    for (const r of riders) stepRider(r, dt, t, real, wet);
    for (const id of Object.keys(players)) { const p = players[id]; if (p.riding !== null && p.riding !== undefined) { const r = riders[p.riding]; p.x = r.x; p.z = r.z; p.heading = r.h; } }
    const hour = Math.floor(t / 3600);
    if (hour !== book.lastHour) { if (book.lastHour >= 0) settle(hour % 24); book.lastHour = hour; }
    reunite(real);
  }

  // What can be seen of the riders from a point.
  function list(x, z, viewerId) {
    const out = [];
    for (const r of riders) {
      if (r.mode === 'off' || Math.hypot(r.x - x, r.z - z) > 240) continue;
      // (riders keep right; on the city block's boulevard, in the middle of the inner lane)
      const lane = (r.moving || r.held) && !parted(r) ? (onBoulevard(r.x, r.z) ? 1.85 : OKADA_RULES.lane) : 0;
      const who = r.passenger;
      const carrying = who && (who.player || (who.npc !== undefined && book.trips[who.npc] && book.trips[who.npc].phase === 'riding'));
      out.push({ n: r.n, person: parted(r) ? null : r.i, x: Math.round((r.x - Math.cos(r.h) * lane) * 100) / 100, z: Math.round((r.z + Math.sin(r.h) * lane) * 100) / 100, h: Math.round(r.h * 100) / 100, moving: r.moving, free: freeNow(r), passenger: carrying ? (who.player ? `player:${who.player}` : who.npc) : null, yours: !!(who && who.player && who.player === viewerId),
        // someone other than its rider has it, or it stands where they left it
        taken: r.mode === 'taken' ? r.takenBy : null, abandoned: r.mode === 'abandoned', mine: r.mode === 'taken' && r.takenBy === viewerId, stopped: !r.moving && !r.passenger && !parted(r) && !r.frozen && r.mode === 'rank' });
    }
    return out;
  }

  function audit() {
    const outstanding = book.owed.reduce((sum, amount) => sum + amount, 0);
    return { riders: riders.length, onShift: riders.filter((r) => r.mode !== 'off').length, rides: book.rideCount, playerRides: book.playerRides, fares: book.fareTotal, settled: book.settled, outstanding, balanced: book.settled + outstanding === book.fareTotal, walkedInstead: book.walked, pool: ledger.balance(pool) };
  }

  // --- a motorcycle taken from its rider -----------------------------------------------

  // May this one be taken, as far as the rider and his machine go?
  function seizable(n) {
    const r = riders[n];
    if (!r || r.mode === 'off') return { ok: false, code: 'NO_RIDER', reason: 'There is no motorcycle there.' };
    if (parted(r) || r.frozen) return { ok: false, code: 'BUSY', reason: 'Somebody already has that motorcycle.' };
    // only a rider waiting at a rank: one on his way somewhere, or stopped for a fare, is about to move
    if (r.moving || r.mode !== 'rank') return { ok: false, code: 'MOVING', reason: 'It is moving. Wait until it stops.' };
    if (r.passenger) return { ok: false, code: 'BUSY', reason: 'There is a passenger on it.' };
    return { ok: true, x: r.x, z: r.z, h: r.h, person: r.i };
  }
  // The rider is held where he is while someone lays hands on him.
  function freeze(n, on) { const r = riders[n]; if (r) r.frozen = !!on; }
  // The rider comes off and the player is in the saddle.
  function take(n, player) {
    const r = riders[n];
    r.frozen = false; r.mode = 'taken'; r.takenBy = player.id; r.rank = -1; r.goal = null; r.route = []; r.k = 0; r.moving = false; r.speed = 0;
    player.astride = n;
    player.x = r.x; player.z = r.z; player.heading = r.h; player.lastMoveAt = state.real;
    return { person: r.i, x: r.x, z: r.z, h: r.h };
  }

  function rideDrive(player, { x, z, heading }) {
    if (![x, z, heading].every(Number.isFinite)) throw new GameError('BAD_MOVE', 'Invalid position.');
    const r = riders[player.astride];
    if (!r || r.mode !== 'taken' || r.takenBy !== player.id) throw new GameError('NOT_RIDING', 'You are not on a motorcycle.');
    const gap = Math.hypot(x - r.x, z - r.z);
    const elapsed = Math.min(1.0, state.real - player.lastMoveAt);
    const top = Math.max(motoSpeedAt(r.x, r.z, false), motoSpeedAt(x, z, false));
    if (gap > top * (elapsed + 0.12) * 1.15) throw new GameError('TOO_FAST', 'Movement rejected.');
    if (gap > 0.02 && hub.impact && hub.impact.stalled(r)) throw new GameError('STALLED', 'The motorcycle has stopped: you hit someone.');
    const boxes = obstacles();
    const steps = Math.max(1, Math.ceil(gap / 0.4));
    for (let i = 1; i <= steps; i += 1) if (!zoneWalkable(r.x + ((x - r.x) * i) / steps, r.z + ((z - r.z) * i) / steps, boxes, MOTO.radius)) throw new GameError('BLOCKED', 'Movement rejected.');
    const fromX = r.x, fromZ = r.z;
    r.moving = gap > 0.01;
    r.x = x; r.z = z; r.h = heading; r.node = graphNearest(x, z, true); r.movedAt = state.real;
    player.x = x; player.z = z; player.heading = heading; player.lastMoveAt = state.real;
    player.stats.driven = (player.stats.driven || 0) + gap;
    const hit = hub.impact ? hub.impact.step(player, { kind: 'moto', id: r.n }, r, fromX, fromZ, x, z, heading, elapsed) : [];
    return hit.length ? { hit } : {};
  }

  function leaveBike(player, r) {
    const boxes = obstacles();
    const side = { x: Math.cos(r.h), z: -Math.sin(r.h) };
    const spot = [[side.x * 1.1, side.z * 1.1], [-side.x * 1.1, -side.z * 1.1], [-Math.sin(r.h) * 1.5, -Math.cos(r.h) * 1.5]].map(([dx, dz]) => ({ x: r.x + dx, z: r.z + dz })).find((s) => zoneWalkable(s.x, s.z, boxes)) || { x: r.x, z: r.z };
    player.astride = null; player.x = spot.x; player.z = spot.z; player.lastMoveAt = state.real;
    r.mode = 'abandoned'; r.abandonedAt = state.real; r.moving = false;
    return spot;
  }
  function dismount(player) {
    const r = riders[player.astride];
    if (!r || r.takenBy !== player.id) throw new GameError('NOT_RIDING', 'You are not on a motorcycle.');
    const spot = leaveBike(player, r);
    return { x: spot.x, z: spot.z };
  }
  // The police take someone off whatever they are on: a stolen machine, or the back of a taxi.
  function unseat(player) {
    // (one of the player's own motorcycles is theirs to leave standing, not a rider's to recover)
    if (typeof player.astride === 'string') { if (hub.ownBikes) hub.ownBikes.unseat(player); player.astride = null; }
    if (player.astride !== null && player.astride !== undefined) { const r = riders[player.astride]; if (r) leaveBike(player, r); player.astride = null; }
    if (player.riding !== null && player.riding !== undefined) { const r = riders[player.riding]; if (r && setDown(player, r, '', false)) { r.passenger = null; goRank(r, state.real); } else if (r) { r.passenger = null; player.riding = null; goRank(r, state.real); } }
  }
  // After an arrest the machine is the rider's again the moment he reaches it.
  function recover(playerId) { for (const r of riders) if (r.takenBy === playerId) { if (r.mode === 'taken') { r.mode = 'abandoned'; r.moving = false; } r.abandonedAt = -1e9; } }

  // A rider whose machine has been left somewhere walks to it, gets on, and goes back to work.
  function reunite(real) {
    for (const r of riders) {
      if (r.mode !== 'abandoned' || !hub.actors) continue;
      if (real - r.abandonedAt < MOTO.returnAfter) continue;
      const actors = hub.actors;
      if (!actors.has(r.i)) { if (!actors.take(r.i, state.t)) { r.mode = 'off'; r.takenBy = null; continue; } }
      const m = actors.get(r.i);
      if (Math.hypot(m.x - r.x, m.z - r.z) < 0.7) {
        actors.drop(r.i);
        r.takenBy = null; r.node = graphNearest(r.x, r.z, true);
        goRank(r, real);
        continue;
      }
      if (!r.walking || real - r.walking > 3) { r.walking = real; actors.walkTo(r.i, r.x, r.z, 1.9, 'Going for his motorcycle'); }
    }
  }

  return { seizable, freeze, take, rideDrive, dismount, unseat, recover, parted, tick, list, options, ride, alight, audit, locate, riders, account, pool, stopName: (id) => (ZONE_STOPS.find((s) => s.id === id) || {}).name, venueName: (id) => (ZONE_VENUES[id] || {}).name };
}
