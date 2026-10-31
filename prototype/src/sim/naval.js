// The three naval ships on the River Niger by the town (31 October 2026, stage 4 of the owner's brief of 30 October: "the
// navel ship should be only 3 in number and not for sale, it should be on the river, driven by NPCs, but can still be
// hijacked").
//
// The owner's model was made a 120 m warship; on the river it is drawn at half that, a 60 m patrol ship, so that three
// of them fit the river with room to pass and to turn round. They patrol the reach of the river above the bridge (they
// do not go under it: the deck is 7 m above the water): upriver on the far side, as a vessel keeps to its right, round
// at the bend, down on the town's side, round short of the bridge, and up again, a third of the round apart, slower
// in the turns, each crewed by the navy (its crew aboard, unseen; its lamps at night). A ship stops for a boat or a
// swimmer in its way until the way is clear.
//
// One can be taken: from a boat alongside it, or swimming beside it, a player climbs aboard (`take`), the crew go over
// the side into their launch (the navy are not the police: it is a crime for the police only if one of their officers
// saw it, justice.js, 31 October 2026). The player then has the helm: the ship answers it as a ship does
// (boat-ride.js: a long while to gather way and to lose it, slow to turn). Left (into the player's own boat alongside,
// or into the water by the town), it lies where it was left. It is never theirs: never sold. When the police catch
// them, it goes back to the navy, who take it back to its patrol.
import { BOAT_HANDLING } from './boat-ride.js';
import { zoneShoreZ } from './zone.js';
import { GameError } from './registry.js';

// At a ship's helm, `astride` is 'nv:<n>' (as it is 'bt:<boat>' in the player's own boat): its steps go through the
// motorcycle's own intents (moto.drive, moto.leave), as everything ridden does.
export const isShip = (astride) => typeof astride === 'string' && astride.startsWith('nv:');
export const shipOfAstride = (astride) => (isShip(astride) ? Number(astride.slice(3)) : null);

export const NAVAL = Object.freeze({
  count: 3,
  scale: 0.5,                          // of the owner's model (made 120 m long)
  length: 60, beam: 17.6,              // metres, as it is on the river
  // the round: between these along the river (upriver of the bridge: x is upriver), on these courses across it (z)
  x0: -100, x1: 440,
  up: 266,                             // upriver, on the far side
  down: 196,                           // downriver, on the town's side (clear of the end of the jetty)
  pace: 3.4,                           // m/s on patrol (about 6.6 knots)
  turning: 2.2,                        // and going round
  near: 70,                            // metres ahead a ship watches for something in its way
  board: 10,                           // metres from its side a player may climb aboard
  leave: 16,                           // metres from its side the player's own boat may be to go back down into it
});
const R = (NAVAL.up - NAVAL.down) / 2;                     // the radius of its turns
const LEG = NAVAL.x1 - NAVAL.x0;                           // a straight leg
const ROUND = 2 * LEG + 2 * Math.PI * R;                   // once round, in metres

// Where a ship is, `s` metres round from the downriver end of its upriver leg: the point, and the way it faces.
export function onRound(s) {
  let d = ((s % ROUND) + ROUND) % ROUND;
  if (d < LEG) return { x: NAVAL.x0 + d, z: NAVAL.up, h: Math.PI / 2, turn: false };
  d -= LEG;
  const half = Math.PI * R;
  if (d < half) {
    // round to the left at the upriver end, from the far side to the town's
    const a = d / R;
    return { x: NAVAL.x1 + Math.sin(a) * R, z: NAVAL.up - R + Math.cos(a) * R, h: Math.PI / 2 + a, turn: true };
  }
  d -= half;
  if (d < LEG) return { x: NAVAL.x1 - d, z: NAVAL.down, h: -Math.PI / 2, turn: false };
  d -= LEG;
  const a = d / R;
  return { x: NAVAL.x0 - Math.sin(a) * R, z: NAVAL.down + R - Math.cos(a) * R, h: -Math.PI / 2 + a, turn: true };
}
export const NAVAL_ROUND = ROUND;
// The water a ship may be in: the river, clear of its banks by half its beam and a little; not under the bridge.
export function shipWater(x, z) {
  if (x < -170 || x > 640) return false;
  const half = NAVAL.beam / 2 + 2;
  return z > zoneShoreZ(x) + half + 6 && z < 300 - half;
}

// Where ships' hulls are (three circles along each), for whatever moves on the water: `list` of { x, z, h, n }.
export function shipHulls(list) {
  const out = [];
  for (const ship of list) for (const k of [-1, 0, 1]) out.push({ x: ship.x + Math.sin(ship.h) * k * NAVAL.length * 0.32, z: ship.z + Math.cos(ship.h) * k * NAVAL.length * 0.32, r: NAVAL.beam / 2 + (k ? -1.5 : 0.5), n: ship.n });
  return out;
}

export function createNaval({ state, players, hub = {}, visitors = () => [] }) {
  if (!state.naval || !Array.isArray(state.naval.ships) || state.naval.ships.length !== NAVAL.count) {
    state.naval = { ships: Array.from({ length: NAVAL.count }, (_, n) => ({ n, s: (n * ROUND) / NAVAL.count, v: NAVAL.pace, mode: 'patrol', x: 0, z: 0, h: 0, takenBy: null, keptAt: 0, ride: null })), taken: 0 };
    for (const ship of state.naval.ships) Object.assign(ship, onRound(ship.s));
  }
  const ships = state.naval.ships;
  const real = () => state.real;

  // What is in a patrolling ship's way: a player's boat, a swimmer, another ship (one taken and left, or under a
  // player's helm), within its reach ahead and across its beam.
  function inWay(ship) {
    const ux = Math.sin(ship.h), uz = Math.cos(ship.h);
    let nearest = Infinity;
    const look = (x, z, half) => {
      const dx = x - ship.x, dz = z - ship.z;
      const along = dx * ux + dz * uz, across = Math.abs(dx * uz - dz * ux);
      if (along > NAVAL.length / 2 && along < NAVAL.length / 2 + NAVAL.near && across < NAVAL.beam / 2 + half + 3) nearest = Math.min(nearest, along - NAVAL.length / 2);
    };
    for (const id of Object.keys(players)) {
      const q = players[id];
      if (q.pboat) look(q.pboat.x, q.pboat.z, 1.2);
      else if (q.swimming) look(q.x, q.z, 0.5);
    }
    for (const v of visitors()) if (v.boat || v.swimming) look(v.x, v.z, 1.2);
    for (const o of ships) if (o !== ship && o.mode !== 'patrol') look(o.x, o.z, NAVAL.beam / 2);
    for (const o of ships) if (o !== ship && o.mode === 'patrol') { const ahead = (((o.s - ship.s) % ROUND) + ROUND) % ROUND; if (ahead > 0 && ahead < NAVAL.length + 40) nearest = Math.min(nearest, ahead - NAVAL.length); }
    return nearest;
  }

  function tick(dt) {
    if (!(dt > 0)) return;
    for (const ship of ships) {
      if (ship.mode === 'returning') {
        // back to its patrol: the navy brings it round to the nearest point of the round, and it takes up its patrol
        let best = 0, bestD = Infinity;
        for (let s = 0; s < ROUND; s += 20) { const p = onRound(s); const d = Math.hypot(p.x - ship.x, p.z - ship.z); if (d < bestD) { bestD = d; best = s; } }
        const to = onRound(best);
        const step = Math.min(bestD, NAVAL.pace * dt);
        if (bestD < 1) { Object.assign(ship, to, { s: best, mode: 'patrol', takenBy: null, v: 0, ride: null }); continue; }
        ship.x += ((to.x - ship.x) / bestD) * step; ship.z += ((to.z - ship.z) / bestD) * step;
        ship.h += wrap(Math.atan2(to.x - ship.x, to.z - ship.z) - ship.h) * Math.min(1, dt * 0.3);
        continue;
      }
      if (ship.mode !== 'patrol') continue;
      const here = onRound(ship.s);
      const want = (here.turn ? NAVAL.turning : NAVAL.pace) * Math.max(0, Math.min(1, (inWay(ship) - 12) / 40));
      // (a ship gathers way and loses it slowly)
      const h = BOAT_HANDLING['naval-ship'];
      ship.v += Math.max(-h.back * 0.6 * dt, Math.min(h.accel * dt, want - ship.v));
      ship.s = (ship.s + ship.v * dt) % ROUND;
      Object.assign(ship, onRound(ship.s));
    }
  }

  // ---- taken ----
  const nearShip = (x, z, reach) => {
    let best = null;
    for (const ship of ships) {
      if (ship.mode === 'taken') continue;
      const ux = Math.sin(ship.h), uz = Math.cos(ship.h);
      const dx = x - ship.x, dz = z - ship.z;
      const along = Math.abs(dx * ux + dz * uz), across = Math.abs(dx * uz - dz * ux);
      const gap = Math.max(0, across - NAVAL.beam / 2);
      if (along < NAVAL.length / 2 && gap <= reach && (!best || gap < best.gap)) best = { ship, gap };
    }
    return best;
  };
  function take(p) {
    const from = p.pboat ? { x: p.pboat.x, z: p.pboat.z } : p.swimming ? { x: p.x, z: p.z } : null;
    if (!from) throw new GameError('NOT_ON_WATER', 'Come alongside in a boat, or swim to it.');
    if (p.fight) throw new GameError('FIGHTING', 'Not in the middle of a fight.');
    const near = nearShip(from.x, from.z, NAVAL.board);
    if (!near) throw new GameError('TOO_FAR', 'Come alongside the ship first.');
    const ship = near.ship;
    if (ship.mode === 'kept' && ship.takenBy !== p.id) throw new GameError('TAKEN', 'Someone else has that ship.');
    const fresh = ship.mode === 'patrol';
    let crime = null;
    if (fresh) {
      if (hub.justice) crime = hub.justice.offence(p, 'vehicle_theft', { victim: { kind: 'navy', id: ship.n, name: 'the navy' }, x: ship.x, z: ship.z, vehicle: `ship:${ship.n}` });
      state.naval.taken += 1;
    }
    // the player's own boat, if they came in it: left alongside, where it is
    if (p.pboat && hub.ownBoats) hub.ownBoats.leaveAlongside(p);
    p.swimming = null;
    const way = fresh ? ship.v : 0;
    ship.mode = 'taken'; ship.takenBy = p.id; ship.keptAt = real();
    ship.ride = { speed: way, steer: 0 };
    p.astride = `nv:${ship.n}`;
    p.pship = { n: ship.n, x: ship.x, z: ship.z, h: ship.h, movedAt: real(), ride: { speed: way, steer: 0 } };
    p.x = ship.x; p.z = ship.z; p.heading = ship.h; p.lastMoveAt = real();
    return { n: ship.n, x: ship.x, z: ship.z, h: ship.h, speed: way, crime: crime ? crime.id : null };
  }
  // A step of the ship under the player's helm, as their page moved it: no further than it could go, in the river.
  function drive(p, { x, z, heading, speed = 0, steer = 0 } = {}) {
    if (![x, z, heading].every(Number.isFinite)) throw new GameError('BAD_MOVE', 'Invalid position.');
    const b = p.pship;
    const ship = b ? ships[b.n] : null;
    if (!ship || ship.takenBy !== p.id) throw new GameError('NOT_RIDING', 'You are not at the helm of a ship.');
    const gap = Math.hypot(x - ship.x, z - ship.z);
    const elapsed = Math.min(1, real() - p.lastMoveAt);
    if (gap > BOAT_HANDLING['naval-ship'].top * (elapsed + 0.12) * 1.25 + 0.05) throw new GameError('TOO_FAST', 'Movement rejected.');
    if (!shipWater(x, z)) throw new GameError('BLOCKED', 'Movement rejected.');
    for (const o of ships) if (o !== ship && Math.hypot(o.x - x, o.z - z) < NAVAL.beam) throw new GameError('BLOCKED', 'Movement rejected.');
    ship.x = x; ship.z = z; ship.h = heading;
    b.x = x; b.z = z; b.h = heading; b.movedAt = real();
    b.ride = { speed: Math.round(Math.max(-2, Math.min(7, Number(speed) || 0)) * 10) / 10, steer: Math.round(Math.max(-0.7, Math.min(0.7, Number(steer) || 0)) * 100) / 100 };
    p.x = x; p.z = z; p.heading = heading; p.lastMoveAt = real();
    return {};
  }
  // Off it: down into the player's own boat alongside, or into the water by the town; it lies where it is.
  function leave(p) {
    const b = p.pship;
    const ship = b ? ships[b.n] : null;
    if (!ship) throw new GameError('NOT_RIDING', 'You are not aboard a ship.');
    if (hub.ownBoats && hub.ownBoats.alongside(p, ship, NAVAL.leave)) {
      ship.mode = 'kept'; ship.keptAt = real(); ship.ride = null;
      p.astride = null; p.pship = null;
      return { into: 'boat', ...hub.ownBoats.backAboard(p) };
    }
    // into the water: only where a swimmer can be (by the town), from its side nearest the bank
    const side = { x: Math.cos(ship.h), z: -Math.sin(ship.h) };
    for (const s of [1, -1]) {
      const x = ship.x + side.x * s * (NAVAL.beam / 2 + 1.5), z = ship.z + side.z * s * (NAVAL.beam / 2 + 1.5);
      if (hub.swimmable && hub.swimmable(x, z)) {
        ship.mode = 'kept'; ship.keptAt = real(); ship.ride = null;
        p.astride = null; p.pship = null;
        p.x = x; p.z = z; p.heading = ship.h; p.lastMoveAt = real(); p.swimming = { since: real() };
        return { into: 'water', x, z };
      }
    }
    throw new GameError('TOO_FAR', 'Bring her in near the town\'s bank to go over the side, or bring your own boat alongside.');
  }
  // Taken off it by the police (they come out to it): it stays where it lies until the navy has it back.
  function unseat(p) {
    const b = p.pship;
    if (!b) return;
    const ship = ships[b.n];
    if (ship) { ship.mode = 'kept'; ship.keptAt = real(); ship.ride = null; }
    p.astride = null; p.pship = null;
    // (brought ashore: the nearest place on the town's bank)
    if (hub.ashore) { const at = hub.ashore(p.x); p.x = at.x; p.z = at.z; p.lastMoveAt = real(); }
  }
  function recover(playerId) {
    let n = 0;
    for (const ship of ships) if (ship.takenBy === playerId && (ship.mode === 'taken' || ship.mode === 'kept')) { ship.mode = 'returning'; n += 1; }
    return n;
  }
  function list() {
    const r = (v, k = 100) => Math.round(v * k) / k;
    return ships.map((ship) => ({ n: ship.n, x: r(ship.x), z: r(ship.z), h: r(ship.h, 1000), speed: r(ship.mode === 'patrol' ? ship.v : (ship.ride && ship.ride.speed) || 0, 10), mode: ship.mode, mine: ship.takenBy, steer: ship.mode === 'taken' && players[ship.takenBy] && players[ship.takenBy].pship && players[ship.takenBy].pship.ride ? players[ship.takenBy].pship.ride.steer : 0 }));
  }
  // where a ship's hull is, for whatever moves on the water
  const hulls = () => shipHulls(ships);
  const api = { tick, take, drive, leave, unseat, recover, list, hulls, nearShip, ships: () => ships };
  hub.naval = api;
  return api;
}

const wrap = (a) => { let d = a % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
