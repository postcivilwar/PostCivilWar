// A player's own boat: the speedboat from the sports mall, on the River Niger by the town (31 October 2026, stage 4 of the
// owner's brief of 30 October: "Once a user buys a boat or any item, it is theirs").
//
// Bought at the mall (the website's server keeps who owns it: `sports.owned`, the same list as everything from the mall),
// it is taken out from the town's jetty or from the bank (`boats.launch`): there it is, in the water beside them, and
// they are at its wheel. It goes where there is water deep enough for it: the river along the town, down past the bridge
// (between its piers: the deck is high above) and up to the bend; not onto the bank, the jetty or the piers, nor into a
// ship. Brought in to the bank or the jetty, the player steps ashore and it is left moored where it is; out on the water
// by the town, they may go over the side and swim. While aboard, `astride` is 'bt:<boat>', and what it does goes through
// the motorcycle's own intents (moto.drive, moto.leave), as everything ridden does.
import { BOAT_HANDLING } from './boat-ride.js';
import { zoneShoreZ, ZONE_JETTY, zoneWalkable, zoneSwimmable, zoneToWater, zoneGroundY, BRIDGE, zoneRoomAt } from './zone.js';
import { GameError } from './registry.js';

export const isOwnBoat = (astride) => typeof astride === 'string' && astride.startsWith('bt:');
export const boatOfAstride = (astride) => (isOwnBoat(astride) ? astride.slice(3) : null);
export const BOATS = Object.freeze(['speedboat']);
export const BOATING = Object.freeze({
  launch: 5,          // metres from the water's edge, or from the jetty's side, a player may take their boat out
  ashore: 7,          // metres from the bank or the jetty a boat may be brought in to, for the player to step ashore
  x0: -740, x1: 600,  // the river a boat may go on: from below the town to the bend above it
  far: 298,           // the far bank (grid z)
  edge: 1.4,          // metres of water kept between a hull and the bank (it is shallow there)
  hull: Object.freeze({ half: 0.95, ahead: 1.6 }),    // the speedboat: two circles along it, each this far from its middle
});

const JETTY = ZONE_JETTY;
const inBox = (b, x, z, m = 0) => x > b.x0 - m && x < b.x1 + m && z > b.z0 - m && z < b.z1 + m;
// The bridge in the water: its approach from the town's bank out to where it stands on its first pier (all of it solid
// below the deck there), and the piers across the river.
const BRIDGE_SOLID = Object.freeze([
  Object.freeze({ x0: BRIDGE.x0 - 0.5, z0: 100, x1: BRIDGE.x1 + 0.5, z1: 178 }),
  ...BRIDGE.piers.filter((z) => z > 178).map((z) => Object.freeze({ x0: BRIDGE.x0 - 0.5, z0: z - 1.8, x1: BRIDGE.x1 + 0.5, z1: z + 1.8 })),
  Object.freeze({ x0: BRIDGE.x0 - 0.5, z0: 292, x1: BRIDGE.x1 + 0.5, z1: 400 }),
]);
// Water a boat's hull may be over at (x, z), `r` metres of it round the point.
export function boatWater(x, z, r = BOATING.hull.half) {
  if (x < BOATING.x0 + r || x > BOATING.x1 - r) return false;
  if (z < zoneShoreZ(x) + BOATING.edge + r || z > BOATING.far - BOATING.edge - r) return false;
  if (inBox(JETTY, x, z, r + 0.3)) return false;
  for (const b of BRIDGE_SOLID) if (inBox(b, x, z, r)) return false;
  return true;
}
// The hull of a boat at (x, z) facing h: in the water all along it, and clear of the ships' hulls (`hulls`).
export function hullClear(x, z, h, hulls = [], hull = BOATING.hull) {
  const ux = Math.sin(h), uz = Math.cos(h);
  for (const k of [-1, 0, 1]) {
    const px = x + ux * hull.ahead * k, pz = z + uz * hull.ahead * k;
    if (!boatWater(px, pz, hull.half)) return false;
    for (const c of hulls) if (Math.hypot(c.x - px, c.z - pz) < c.r + hull.half) return false;
  }
  return true;
}

export function createOwnBoats({ state, hub }) {
  const own = (p) => (Array.isArray(p.sports) ? p.sports.filter((id) => BOATS.includes(id)) : []);
  const mooredOf = (p) => { if (!p.boatMoored || typeof p.boatMoored !== 'object') p.boatMoored = {}; return p.boatMoored; };
  const onFoot = (p) => !p.driving && (p.riding === null || p.riding === undefined) && (p.astride === null || p.astride === undefined) && !p.incar && !p.carried && !p.custody && !p.dead && !p.down;
  const hulls = () => (hub.naval ? hub.naval.hulls() : []);

  // Where a boat is put in the water for someone at (x, z): off the jetty's end or its side, or straight out from the
  // bank, facing out, with water all round it.
  function putIn(p) {
    const tries = [];
    if (inBox(JETTY, p.x, p.z, 1.5)) {
      // from the jetty: alongside it on whichever side the player is nearer, by where they stand; or off its end
      const side = p.x < (JETTY.x0 + JETTY.x1) / 2 ? -1 : 1;
      const along = Math.max(JETTY.z0 + 22, Math.min(JETTY.z1 - 3, p.z));
      tries.push({ x: side < 0 ? JETTY.x0 - 2.2 : JETTY.x1 + 2.2, z: along, h: 0 }, { x: (JETTY.x0 + JETTY.x1) / 2, z: JETTY.z1 + 4.5, h: 0 });
    } else if (zoneToWater(p.x, p.z) <= BOATING.launch && zoneGroundY(p.x, p.z) < 0.5) {
      for (const dx of [0, 2, -2, 4, -4]) tries.push({ x: p.x + dx, z: zoneShoreZ(p.x + dx) + BOATING.edge + 2.4, h: 0 });
    }
    return tries.find((t) => hullClear(t.x, t.z, t.h, hulls())) || null;
  }

  // Into it: where it is moored if the player is beside it, or put in the water for them at the jetty or the bank.
  function launch(p, { boat = 'speedboat' } = {}) {
    const id = String(boat || '');
    if (!BOATS.includes(id)) throw new GameError('NO_BOAT', 'There is no such boat.');
    if (!own(p).includes(id)) throw new GameError('NOT_YOURS', 'You have no speedboat. The sports mall sells them.');
    if (!onFoot(p) && !p.swimming) throw new GameError('NOT_ON_FOOT', 'You cannot get into it now.');
    if (p.fight) throw new GameError('FIGHTING', 'Not in the middle of a fight.');
    const moored = mooredOf(p)[id];
    let at = null;
    if (moored && Math.hypot(moored.x - p.x, moored.z - p.z) < BOATING.ashore + 2) at = moored;
    else {
      if (zoneRoomAt(p.x, p.z)) throw new GameError('INDOORS', 'Go down to the water first.');
      at = putIn(p);
      if (!at) throw new GameError('NO_WATER', 'Go down to the jetty, or to the water\'s edge, to take your speedboat out.');
    }
    delete mooredOf(p)[id];
    p.swimming = null;
    p.astride = `bt:${id}`;
    p.pboat = { id, x: at.x, z: at.z, h: at.h, movedAt: state.real, ride: null };
    p.x = at.x; p.z = at.z; p.heading = at.h; p.lastMoveAt = state.real;
    return { boat: id, x: at.x, z: at.z, h: at.h };
  }

  // One step on the water, as the player's page moved it: no further than it could go, the whole hull in the water.
  const num = (v, lo, hi) => { const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : 0; };
  function drive(p, { x, z, heading, ...step }) {
    if (![x, z, heading].every(Number.isFinite)) throw new GameError('BAD_MOVE', 'Invalid position.');
    const b = p.pboat;
    if (!isOwnBoat(p.astride) || !b) throw new GameError('NOT_RIDING', 'You are not in your boat.');
    const h = BOAT_HANDLING[b.id];
    const gap = Math.hypot(x - b.x, z - b.z);
    const elapsed = Math.min(1, state.real - p.lastMoveAt);
    if (gap > h.top * (elapsed + 0.12) * 1.25 + 0.05) throw new GameError('TOO_FAST', 'Movement rejected.');
    const steps = Math.max(1, Math.ceil(gap / 0.8));
    const ships = hulls();
    for (let i = 1; i <= steps; i += 1) if (!hullClear(b.x + ((x - b.x) * i) / steps, b.z + ((z - b.z) * i) / steps, heading, ships, { half: BOATING.hull.half - 0.1, ahead: BOATING.hull.ahead })) throw new GameError('BLOCKED', 'Movement rejected.');
    b.x = x; b.z = z; b.h = heading; b.movedAt = state.real;
    b.ride = { speed: Math.round(num(step.speed, -3, h.top) * 10) / 10, throttle: Math.round(num(step.throttle, 0, 1) * 10) / 10, brake: step.brake ? 1 : 0, steer: Math.round(num(step.steer, -0.6, 0.6) * 100) / 100, bank: Math.round(num(step.bank, -0.3, 0.3) * 100) / 100, pitch: Math.round(num(step.pitch, -0.2, 0.3) * 100) / 100, rev: Math.round(num(step.rev, 0, 1) * 100) / 100 };
    p.x = x; p.z = z; p.heading = heading; p.lastMoveAt = state.real;
    p.stats.boated = (p.stats.boated || 0) + gap;
    return {};
  }

  // Out of it: ashore, if it is in by the bank or the jetty; over the side into the river, out on the water by the town;
  // otherwise not (bring it in first). It is left moored where it is.
  function leave(p) {
    const b = p.pboat;
    if (!isOwnBoat(p.astride) || !b) throw new GameError('NOT_RIDING', 'You are not in your boat.');
    let to = null, into = 'land';
    // ashore: the nearest place to stand on the jetty or the bank within reach
    const near = [];
    if (inBox(JETTY, b.x, b.z, BOATING.ashore)) for (let z = JETTY.z0 + 1; z < JETTY.z1 - 0.5; z += 1) near.push({ x: (JETTY.x0 + JETTY.x1) / 2, z });
    for (let dx = -6; dx <= 6; dx += 1) for (const d of [0.8, 1.6, 2.6]) near.push({ x: b.x + dx, z: zoneShoreZ(b.x + dx) - d });
    for (const s of near.sort((a, c) => Math.hypot(a.x - b.x, a.z - b.z) - Math.hypot(c.x - b.x, c.z - b.z))) {
      if (Math.hypot(s.x - b.x, s.z - b.z) > BOATING.ashore) break;
      if (zoneWalkable(s.x, s.z)) { to = s; break; }
    }
    if (!to) {
      // over the side, where a swimmer can be
      const side = { x: Math.cos(b.h), z: -Math.sin(b.h) };
      for (const s of [1, -1]) { const x = b.x + side.x * s * 1.6, z = b.z + side.z * s * 1.6; if (zoneSwimmable(x, z)) { to = { x, z }; into = 'water'; break; } }
    }
    if (!to) throw new GameError('TOO_FAR', 'Bring it in to the bank or the jetty first.');
    mooredOf(p)[b.id] = { x: b.x, z: b.z, h: b.h };
    p.astride = null; p.pboat = null;
    p.x = to.x; p.z = to.z; p.lastMoveAt = state.real;
    if (into === 'water') p.swimming = { since: state.real };
    return { x: to.x, z: to.z, into, moored: { boat: b.id, x: b.x, z: b.z, h: b.h } };
  }

  // (for a naval ship: the player's boat left alongside it as they climb aboard, and back down into it)
  function leaveAlongside(p) { const b = p.pboat; if (!b) return; mooredOf(p)[b.id] = { x: b.x, z: b.z, h: b.h }; p.astride = null; p.pboat = null; }
  function alongside(p, ship, reach) {
    for (const [id, m] of Object.entries(mooredOf(p))) {
      if (!BOATS.includes(id)) continue;
      const ux = Math.sin(ship.h), uz = Math.cos(ship.h), dx = m.x - ship.x, dz = m.z - ship.z;
      if (Math.abs(dx * ux + dz * uz) < 32 && Math.abs(dx * uz - dz * ux) < 8.8 + reach) return id;
    }
    return null;
  }
  function backAboard(p) {
    const id = alongside(p, { x: p.x, z: p.z, h: p.heading }, 40) || Object.keys(mooredOf(p)).find((k) => BOATS.includes(k));
    const m = mooredOf(p)[id];
    delete mooredOf(p)[id];
    p.astride = `bt:${id}`;
    p.pboat = { id, x: m.x, z: m.z, h: m.h, movedAt: state.real, ride: null };
    p.x = m.x; p.z = m.z; p.heading = m.h; p.lastMoveAt = state.real;
    return { boat: id, x: m.x, z: m.z, h: m.h };
  }
  // sold (no longer theirs): no longer moored anywhere, and they are put ashore if aboard
  function setOwned(p) {
    const mine = own(p);
    for (const id of Object.keys(mooredOf(p))) if (!mine.includes(id)) delete mooredOf(p)[id];
    if (isOwnBoat(p.astride) && !mine.includes(boatOfAstride(p.astride))) { try { leave(p); } catch (error) { p.astride = null; p.pboat = null; p.swimming = { since: state.real }; } }
  }
  function unseat(p) { if (isOwnBoat(p.astride) && p.pboat) { const b = p.pboat; mooredOf(p)[b.id] = { x: b.x, z: b.z, h: b.h }; p.astride = null; p.pboat = null; } }
  const selfView = (p) => ({ boats: own(p), moored: Object.entries(mooredOf(p)).map(([id, m]) => ({ boat: id, x: Math.round(m.x * 100) / 100, z: Math.round(m.z * 100) / 100, h: Math.round(m.h * 1000) / 1000 })) });

  const api = { launch, drive, leave, leaveAlongside, alongside, backAboard, setOwned, unseat, selfView, putIn };
  hub.ownBoats = api;
  return api;
}
