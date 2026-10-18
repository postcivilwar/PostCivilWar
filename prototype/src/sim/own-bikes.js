// A player's own motorcycles (the owner's supplied models, bought in the market): getting on, riding, getting
// off, and where each one was left.
//
// Who owns which bike is the website's server's to say (the market's holdings): the page tells the town what the
// server told it (`bikes.owned`), and only a bike on that list can be ridden. In a copy of the game with no server
// there are no motorcycles to own, and so none to ride.
//
// While a player rides one, `astride` is 'pb:<bike>' (a taken okada is a number there), so that everything that
// already asks "is this player on a motorcycle?" (fights, arrests, treatment, what may be done meanwhile) gets
// the same answer. A ridden bike strikes whoever is in its way as any motorcycle does (impact.js).
import { POWER_BIKES, handlingOf, FASTEST } from './power-bikes.js';
import { zoneWalkable, zoneRoomAt, inPowerbikeHall } from './zone.js';
import { GameError } from './registry.js';

export const isOwnBike = (astride) => typeof astride === 'string' && astride.startsWith('pb:');
export const bikeOf = (astride) => (isOwnBike(astride) ? astride.slice(3) : null);
const ROOM = 0.7;                     // metres it takes up, for walls and kerbs
// Coming off (16 October 2026, the owner's rule): running into something at speed throws the rider. The faster,
// the harder: the life lost is in proportion to the speed, and is at most 5 in 100 (the top speed of the biggest
// engine there is); slower than CRASH.least it is only a bump, and the bike stops.
export const CRASH = Object.freeze({
  least: 5.5,                 // m/s (about 20 km/h): slower than this, a bump and no fall
  most: 0.05,                 // the share of full health lost at the top speed of the biggest engine
  lie: Object.freeze([1.6, 4.0]),     // real seconds on the ground, slowest fall to fastest
  rise: 0.9,                  // real seconds getting up
  thrown: Object.freeze([0.8, 4.5]),  // metres thrown forward
});
export const crashHarm = (speed, max = 100) => max * CRASH.most * Math.min(1, Math.max(0, speed) / FASTEST);

export function createOwnBikes({ state, hub, obstacles }) {
  const own = (p) => (Array.isArray(p.bikes) ? p.bikes : []);
  const parkedOf = (p) => { if (!p.parked || typeof p.parked !== 'object') p.parked = {}; return p.parked; };
  const onFoot = (p) => !p.driving && (p.riding === null || p.riding === undefined) && (p.astride === null || p.astride === undefined) && !p.incar && !p.carried && !p.custody && !p.swimming && !p.dead && !p.down;

  // What the server says this player owns: the list is replaced as a whole. A bike no longer theirs (sold) is
  // taken from under them if they are on it, and is no longer parked anywhere.
  function setOwned(p, { bikes }) {
    const list = (Array.isArray(bikes) ? bikes : []).filter((id) => typeof id === 'string' && POWER_BIKES[id]).slice(0, 40);
    p.bikes = [...new Set(list)];
    const parked = parkedOf(p);
    for (const id of Object.keys(parked)) if (!p.bikes.includes(id)) delete parked[id];
    if (isOwnBike(p.astride) && !p.bikes.includes(bikeOf(p.astride))) leave(p);
    return { bikes: p.bikes };
  }

  // On: the bike where it was left, if the player is beside it; otherwise brought to where they stand (the shop
  // delivers it), as long as there is room for it there.
  function mount(p, { bike }) {
    const id = String(bike || '');
    if (!POWER_BIKES[id]) throw new GameError('NO_BIKE', 'There is no such motorcycle.');
    if (!own(p).includes(id)) throw new GameError('NOT_YOURS', 'That motorcycle is not yours.');
    if (!onFoot(p)) throw new GameError('NOT_ON_FOOT', 'You cannot get on a motorcycle now.');
    if (p.fight) throw new GameError('FIGHTING', 'Not in the middle of a fight.');
    const parked = parkedOf(p)[id];
    let at;
    if (parked && Math.hypot(parked.x - p.x, parked.z - p.z) < 3) at = parked;
    else {
      if (zoneRoomAt(p.x, p.z) || inPowerbikeHall(p.x, p.z)) throw new GameError('INDOORS', 'Go outside first: your motorcycle is brought to you there.');
      if (!zoneWalkable(p.x, p.z, obstacles(), ROOM)) throw new GameError('NO_ROOM', 'There is no room for a motorcycle here. Go out to the road.');
      at = { x: p.x, z: p.z, h: p.heading || 0 };
    }
    delete parkedOf(p)[id];
    p.astride = `pb:${id}`;
    p.pbike = { id, x: at.x, z: at.z, h: at.h, movedAt: state.real };
    p.x = at.x; p.z = at.z; p.heading = at.h; p.lastMoveAt = state.real;
    return { bike: id, x: at.x, z: at.z, h: at.h };
  }

  // One step of riding, as the rider's page moved it. Not further than the bike could have gone since the last
  // step, not through anything solid.
  // What the rider's page says the bike is doing, for others to see and hear (lamps, flames, the engine's note):
  // nothing here depends on it, so it is only kept within sensible bounds.
  const num = (v, lo, hi, d = 0) => { const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };
  // (with how far the bars are turned, so that others see the front wheel steer: 18 October 2026)
  const rideOf = (step, top) => ({ lean: Math.round(num(step.lean, -0.9, 0.9) * 100) / 100, speed: Math.round(num(step.speed, -3, top) * 10) / 10, throttle: Math.round(num(step.throttle, 0, 1) * 10) / 10, brake: step.brake ? 1 : 0, rev: Math.round(num(step.rev, 0, 1) * 100) / 100, steer: Math.round(num(step.steer, -0.7, 0.7) * 100) / 100 });
  function drive(p, { x, z, heading, ...step }) {
    if (![x, z, heading].every(Number.isFinite)) throw new GameError('BAD_MOVE', 'Invalid position.');
    const b = p.pbike;
    if (!isOwnBike(p.astride) || !b) throw new GameError('NOT_RIDING', 'You are not on a motorcycle.');
    const handling = handlingOf(POWER_BIKES[b.id]);
    const gap = Math.hypot(x - b.x, z - b.z);
    const elapsed = Math.min(1.0, state.real - p.lastMoveAt);
    if (gap > handling.top * (elapsed + 0.12) * 1.2 + 0.05) throw new GameError('TOO_FAST', 'Movement rejected.');
    if (gap > 0.02 && hub.impact && hub.impact.stalled(b)) throw new GameError('STALLED', 'The motorcycle has stopped: you hit someone.');
    const boxes = obstacles();
    const steps = Math.max(1, Math.ceil(gap / 0.4));
    for (let i = 1; i <= steps; i += 1) if (!zoneWalkable(b.x + ((x - b.x) * i) / steps, b.z + ((z - b.z) * i) / steps, boxes, ROOM - 0.1)) throw new GameError('BLOCKED', 'Movement rejected.');
    const fromX = b.x, fromZ = b.z;
    b.x = x; b.z = z; b.h = heading; b.movedAt = state.real;
    b.ride = rideOf(step, handling.top);
    p.x = x; p.z = z; p.heading = heading; p.lastMoveAt = state.real;
    p.stats.driven = (p.stats.driven || 0) + gap;
    const hit = hub.impact ? hub.impact.step(p, { kind: 'moto', id: `pb:${b.id}` }, b, fromX, fromZ, x, z, heading, elapsed) : [];
    return hit.length ? { hit } : {};
  }

  // Thrown off: the bike ran into something solid at `speed` (as the rider's page found it: it moves the bike, and
  // the town checks every step of it). The bike is left lying where it stopped; the rider is thrown on ahead, as
  // far as there is room, and lies there, then gets up. What it costs in health follows the speed (crashHarm).
  function crash(p, { speed }) {
    const b = p.pbike;
    if (!isOwnBike(p.astride) || !b) throw new GameError('NOT_RIDING', 'You are not on a motorcycle.');
    const handling = handlingOf(POWER_BIKES[b.id]);
    const v = Math.max(0, Math.min(handling.top, Number(speed) || 0));
    if (v < CRASH.least) return { fell: false };
    const share = Math.min(1, (v - CRASH.least) / Math.max(1, FASTEST - CRASH.least));
    const now = state.real;
    const h = b.h;
    if (own(p).includes(b.id)) parkedOf(p)[b.id] = { x: b.x, z: b.z, h: b.h, fallen: true };
    p.astride = null; p.pbike = null;
    // thrown on ahead, to the last place there is room for a body before anything solid
    const boxes = obstacles();
    const far = CRASH.thrown[0] + (CRASH.thrown[1] - CRASH.thrown[0]) * share;
    let at = { x: b.x, z: b.z };
    for (let d = 0.4; d <= far + 1e-6; d += 0.4) { const q = { x: b.x + Math.sin(h) * d, z: b.z + Math.cos(h) * d }; if (!zoneWalkable(q.x, q.z, boxes, 0.3)) break; at = q; }
    if (at.x === b.x && at.z === b.z) { const side = { x: b.x + Math.cos(h), z: b.z - Math.sin(h) }; if (zoneWalkable(side.x, side.z, boxes, 0.3)) at = side; }
    p.x = at.x; p.z = at.z; p.lastMoveAt = now;
    const harm = crashHarm(v, 100);
    const before = p.health;
    if (hub.conflict) hub.conflict.injure(p, harm); else p.health = Math.max(0, p.health - harm);
    const lie = CRASH.lie[0] + (CRASH.lie[1] - CRASH.lie[0]) * share;
    p.down = { at: now, until: now + lie, upAt: now + lie + CRASH.rise, by: 'crash', h, speed: Math.round(v * 10) / 10 };
    p.stats.crashes = (p.stats.crashes || 0) + 1;
    return { fell: true, kmh: Math.round(v * 3.6), lost: before - p.health, health: p.health, x: at.x, z: at.z, bike: { id: b.id, x: b.x, z: b.z, h: b.h }, lie };
  }

  // Off: the rider steps down beside it, and it stays where it stands.
  function leave(p) {
    const b = p.pbike;
    if (!isOwnBike(p.astride) || !b) throw new GameError('NOT_RIDING', 'You are not on a motorcycle.');
    const boxes = obstacles();
    const side = { x: Math.cos(b.h), z: -Math.sin(b.h) };
    const spot = [[side.x * 1.0, side.z * 1.0], [-side.x * 1.0, -side.z * 1.0], [-Math.sin(b.h) * 1.6, -Math.cos(b.h) * 1.6]].map(([dx, dz]) => ({ x: b.x + dx, z: b.z + dz })).find((s) => zoneWalkable(s.x, s.z, boxes)) || { x: b.x, z: b.z };
    if (own(p).includes(b.id)) parkedOf(p)[b.id] = { x: b.x, z: b.z, h: b.h };
    p.astride = null; p.pbike = null;
    p.x = spot.x; p.z = spot.z; p.lastMoveAt = state.real;
    return { x: spot.x, z: spot.z, parked: { bike: b.id, x: b.x, z: b.z, h: b.h } };
  }

  // Taken off it by the police, or knocked off: it is left where it stands.
  function unseat(p) { if (isOwnBike(p.astride) && p.pbike) leave(p); }

  // What the player sees of their own bikes: which they own, which they are on, and where the others stand.
  function selfView(p) {
    return { bikes: own(p), parked: Object.entries(parkedOf(p)).map(([id, s]) => ({ bike: id, x: Math.round(s.x * 100) / 100, z: Math.round(s.z * 100) / 100, h: Math.round(s.h * 1000) / 1000, ...(s.fallen ? { fallen: true } : {}) })) };
  }

  return { setOwned, mount, drive, crash, leave, unseat, selfView, isOwnBike };
}
