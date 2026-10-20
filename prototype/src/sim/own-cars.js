// A player's own cars (the owner's supplied models, bought in the market at the Post Civil War Car Showroom):
// getting in, driving, getting out, and where each one was left.
//
// Who owns which car is the website's server's to say (the market's holdings): the page tells the town what the
// server told it (`cars.owned`), and only a car on that list can be driven. In a copy of the game with no server
// there are no cars to own, and so none to drive.
//
// While a player drives one, `incar` is 'pc:<car>', so that everything that asks "is this player on foot?" (fights,
// arrests, treatment, what may be done meanwhile) can ask it of a car as it does of a keke or a motorcycle. A car
// in motion strikes whoever is in its way as any vehicle does (impact.js), with its own length and width; a car
// standing where it was left is in everybody's way (`boxes`), as a parked keke is.
import { POWER_CARS, carHandlingOf, CAR_FASTEST, carCircles, carBoxes } from './power-cars.js';
import { zoneWalkable, zoneRoomAt, inPowerbikeHall, inCarHall, zoneBlockKind, onHabitation, habitationFootOnly } from './zone.js';
import { contactNormal, contactOutcome } from './contact.js';
import { GameError } from './registry.js';

export const isOwnCar = (incar) => typeof incar === 'string' && incar.startsWith('pc:');
export const carOf = (incar) => (isOwnCar(incar) ? incar.slice(3) : null);
// Running into something solid (17 October 2026): slower than `least` it is a bump and the car stops; faster, the
// car stops dead and the driver is hurt, in proportion to the speed and never more than `most` of full health (a
// car keeps its driver in; nobody is thrown out of one).
export const CAR_CRASH = Object.freeze({
  least: 6.5,                 // m/s (about 23 km/h): slower than this, a bump
  most: 0.08,                 // the share of full health lost at the top speed of the fastest car there is
});
export const carCrashHarm = (speed, max = 100) => max * CAR_CRASH.most * Math.min(1, Math.max(0, speed - CAR_CRASH.least) / Math.max(1, CAR_FASTEST - CAR_CRASH.least));

// Does a car fit where it would stand (every part of it on open ground, nothing solid in it)? `slack` is room
// forgiven at its edges (a step's worth, for one that is already moving along a wall).
export function carFits(id, x, z, h, boxes = [], slack = 0) {
  for (const c of carCircles(POWER_CARS[id], x, z, h)) if (!zoneWalkable(c.x, c.z, boxes, Math.max(0.3, c.r - slack))) return false;
  return true;
}

export function createOwnCars({ state, hub, obstacles }) {
  const own = (p) => (Array.isArray(p.cars) ? p.cars : []);
  const parkedOf = (p) => { if (!p.carParked || typeof p.carParked !== 'object') p.carParked = {}; return p.carParked; };
  const onFoot = (p) => !p.driving && (p.riding === null || p.riding === undefined) && (p.astride === null || p.astride === undefined) && !p.incar && !p.carried && !p.custody && !p.swimming && !p.dead && !p.down;

  // What the server says this player owns: the list is replaced as a whole. A car no longer theirs (sold) is
  // taken from under them if they are in it, and is no longer parked anywhere.
  function setOwned(p, { cars }) {
    const list = (Array.isArray(cars) ? cars : []).filter((id) => typeof id === 'string' && POWER_CARS[id]).slice(0, 40);
    p.cars = [...new Set(list)];
    const parked = parkedOf(p);
    for (const id of Object.keys(parked)) if (!p.cars.includes(id)) delete parked[id];
    if (isOwnCar(p.incar) && !p.cars.includes(carOf(p.incar))) leave(p);
    return { cars: p.cars };
  }

  // In: the car where it was left, if the player is beside it; otherwise brought to where they stand (the
  // showroom delivers it), facing the way they face if it fits so, or the nearest way round that it fits.
  function enter(p, { car }) {
    const id = String(car || '');
    if (!POWER_CARS[id]) throw new GameError('NO_CAR', 'There is no such car.');
    if (!own(p).includes(id)) throw new GameError('NOT_YOURS', 'That car is not yours.');
    if (!onFoot(p)) throw new GameError('NOT_ON_FOOT', 'You cannot get into a car now.');
    if (p.fight) throw new GameError('FIGHTING', 'Not in the middle of a fight.');
    const parked = parkedOf(p)[id];
    const spec = POWER_CARS[id];
    let at;
    if (parked && Math.hypot(parked.x - p.x, parked.z - p.z) < spec.length / 2 + 2.5) at = parked;
    else {
      if (zoneRoomAt(p.x, p.z) || inPowerbikeHall(p.x, p.z) || inCarHall(p.x, p.z)) throw new GameError('INDOORS', 'Go outside first: your car is brought to you there.');
      if (onHabitation(p.x, p.z)) throw new GameError('ON_FOOT_HERE', 'The habitation is on foot: your car is brought to you at its car park.');
      const boxes = [...obstacles(), ...othersParked(p, id)];
      const h0 = p.heading || 0;
      const turns = [0, Math.PI, Math.PI / 2, -Math.PI / 2, Math.PI / 4, -Math.PI / 4, (3 * Math.PI) / 4, (-3 * Math.PI) / 4];
      const h = turns.map((d) => h0 + d).find((hh) => carFits(id, p.x, p.z, hh, boxes));
      if (h === undefined) throw new GameError('NO_ROOM', 'There is no room for a car here. Go out to the road.');
      at = { x: p.x, z: p.z, h };
    }
    delete parkedOf(p)[id];
    p.incar = `pc:${id}`;
    p.pcar = { id, x: at.x, z: at.z, h: at.h, movedAt: state.real };
    p.x = at.x; p.z = at.z; p.heading = at.h; p.lastMoveAt = state.real;
    return { car: id, x: at.x, z: at.z, h: at.h };
  }

  // One step of driving, as the driver's page moved it. Not further than the car could have gone since the last
  // step, not through anything solid (each step of the way, the whole car is looked at, not only its middle).
  // What the page says the car is doing (its speed, steering, lamps, revs) is for others to see and hear; nothing
  // here depends on it, so it is only kept within sensible bounds.
  const num = (v, lo, hi, d = 0) => { const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };
  const driveOf = (step, top) => ({ steer: Math.round(num(step.steer, -0.7, 0.7) * 100) / 100, speed: Math.round(num(step.speed, -6, top) * 10) / 10, throttle: Math.round(num(step.throttle, 0, 1) * 10) / 10, brake: step.brake ? 1 : 0, rev: Math.round(num(step.rev, 0, 1) * 100) / 100, lamps: step.lamps ? 1 : 0 });
  function drive(p, { x, z, heading, ...step }) {
    if (![x, z, heading].every(Number.isFinite)) throw new GameError('BAD_MOVE', 'Invalid position.');
    const c = p.pcar;
    if (!isOwnCar(p.incar) || !c) throw new GameError('NOT_DRIVING', 'You are not in a car.');
    const handling = carHandlingOf(POWER_CARS[c.id]);
    const gap = Math.hypot(x - c.x, z - c.z);
    const elapsed = Math.min(1.0, state.real - p.lastMoveAt);
    if (gap > handling.top * (elapsed + 0.12) * 1.2 + 0.05) throw new GameError('TOO_FAST', 'Movement rejected.');
    if (gap > 0.02 && hub.impact && hub.impact.stalled(c)) throw new GameError('STALLED', 'The car has stopped: you hit someone.');
    const boxes = [...obstacles(), ...othersParked(p, c.id)];
    const steps = Math.max(1, Math.ceil(gap / 0.4));
    for (let i = 1; i <= steps; i += 1) {
      const k = i / steps;
      const hh = c.h + wrap(heading - c.h) * k;
      if (!carFits(c.id, c.x + (x - c.x) * k, c.z + (z - c.z) * k, hh, boxes, 0.2)) throw new GameError('BLOCKED', 'Movement rejected.');
      // (a bridge, a boardwalk, a jetty: walked, never driven onto; the car's front is what reaches it)
      const front = POWER_CARS[c.id].length / 2;
      if (habitationFootOnly(c.x + (x - c.x) * k + Math.sin(hh) * front, c.z + (z - c.z) * k + Math.cos(hh) * front)) throw new GameError('FOOT_ONLY', 'Get off your vehicle to cross the bridge.');
    }
    const fromX = c.x, fromZ = c.z;
    // (how fast the town itself saw it go: a crash is judged at no more than this, whatever the page says)
    if (elapsed > 0.004) c.seen = Number.isFinite(c.seen) ? c.seen * 0.5 + (gap / elapsed) * 0.5 : gap / elapsed;
    c.x = x; c.z = z; c.h = heading; c.movedAt = state.real;
    c.drive = driveOf(step, handling.top);
    p.x = x; p.z = z; p.heading = heading; p.lastMoveAt = state.real;
    p.stats.driven = (p.stats.driven || 0) + gap;
    const spec = POWER_CARS[c.id];
    const front = { half: spec.width / 2, nose: spec.length / 2, tail: spec.length / 2 };
    const hit = hub.impact ? hub.impact.step(p, { kind: 'car', id: `pc:${c.id}`, front }, c, fromX, fromZ, x, z, heading, elapsed) : [];
    return hit.length ? { hit } : {};
  }

  // Run into something at `speed` along `heading` (as the driver's page found it: it moves the car, and the town
  // checks every step of it). The town judges it again for itself (contact.js, 19 October 2026): something must be in
  // the car's way within a step or two of where the town last saw it, the speed no more than the town saw it going,
  // and only a hard enough blow INTO it hurts the driver; a scrape along a wall, a knock, or the edge of the map does
  // not. The car stops there; the driver stays in it, hurt in proportion to how hard it was (and taken out of it if
  // that is the end of them).
  function crash(p, { speed, heading } = {}) {
    const c = p.pcar;
    if (!isOwnCar(p.incar) || !c) throw new GameError('NOT_DRIVING', 'You are not in a car.');
    const handling = carHandlingOf(POWER_CARS[c.id]);
    const seen = Number.isFinite(c.seen) ? c.seen : handling.top;
    const v = Math.max(-handling.top, Math.min(Math.min(handling.top, seen * 1.35 + 1.5), Number(speed) || 0));
    if (Math.abs(v) < CAR_CRASH.least) return { hurt: false, outcome: 'stop' };
    const h = Number.isFinite(heading) ? heading : c.h;
    const spec = POWER_CARS[c.id] || { length: 4.6 };
    const boxes = [...obstacles(), ...othersParked(p, c.id)];
    const way = Math.sign(v) || 1;
    const free = (x, z) => carFits(c.id, x, z, h, boxes, 0.2);
    let hit = null;
    for (let d = 0.2; d <= 1.41; d += 0.2) {
      const qx = c.x + Math.sin(h) * d * way, qz = c.z + Math.cos(h) * d * way;
      if (!free(qx, qz)) {
        // what is there, at the end of the car that meets it
        const ex = qx + Math.sin(h) * (spec.length / 2) * way, ez = qz + Math.cos(h) * (spec.length / 2) * way;
        hit = { x: qx, z: qz, kind: zoneBlockKind(ex, ez, boxes, 0.6) || 'solid' };
        break;
      }
    }
    if (!hit) return { hurt: false, outcome: 'none' };
    const out = contactOutcome({ speed: v, heading: h, normal: contactNormal(free, c.x, c.z, hit.x, hit.z), kind: hit.kind });
    if (out.outcome !== 'crash' || out.into < CAR_CRASH.least) return { hurt: false, outcome: out.outcome === 'crash' ? 'stop' : out.outcome, into: Math.round(out.into * 10) / 10 };
    const harm = Math.round(carCrashHarm(out.into, 100) * 10) / 10;
    const before = p.health;
    if (hub.conflict) hub.conflict.injure(p, harm); else p.health = Math.max(0, p.health - harm);
    p.stats.crashes = (p.stats.crashes || 0) + 1;
    if (p.health <= 0) leave(p);
    return { hurt: true, kmh: Math.round(Math.abs(v) * 3.6), into: Math.round(out.into * 10) / 10, lost: before - p.health, health: p.health };
  }

  // Out: the driver steps out on their side (the left: the town drives on the right), and the car stays where it
  // stands. If there is no room on that side, on the other, then behind, then in front.
  function leave(p) {
    const c = p.pcar;
    if (!isOwnCar(p.incar) || !c) throw new GameError('NOT_DRIVING', 'You are not in a car.');
    const boxes = obstacles();
    const spec = POWER_CARS[c.id] || { width: 1.9, length: 4.6 };
    const out = spec.width / 2 + 0.55, back = spec.length / 2 + 0.6;
    const side = { x: Math.cos(c.h), z: -Math.sin(c.h) }, ahead = { x: Math.sin(c.h), z: Math.cos(c.h) };
    const door = -0.15 * spec.length;          // the driver's door is a little behind the car's middle
    const spots = [[side.x * out + ahead.x * door, side.z * out + ahead.z * door], [-side.x * out + ahead.x * door, -side.z * out + ahead.z * door], [-ahead.x * back, -ahead.z * back], [ahead.x * back, ahead.z * back]];
    const spot = spots.map(([dx, dz]) => ({ x: c.x + dx, z: c.z + dz })).find((s) => zoneWalkable(s.x, s.z, boxes)) || { x: c.x + spots[0][0], z: c.z + spots[0][1] };
    if (own(p).includes(c.id)) parkedOf(p)[c.id] = { x: c.x, z: c.z, h: c.h };
    p.incar = null; p.pcar = null;
    p.x = spot.x; p.z = spot.z; p.lastMoveAt = state.real;
    return { x: spot.x, z: spot.z, parked: { car: c.id, x: c.x, z: c.z, h: c.h } };
  }

  // Taken out of it by the police: it is left where it stands.
  function unseat(p) { if (isOwnCar(p.incar) && p.pcar) leave(p); }

  // The cars standing where they were left, as what is in the way (every player's; not `except`, the one being
  // driven or brought round).
  function parkedBoxes(skip = null, except = null) {
    const out = [];
    for (const q of Object.values(state.players)) {
      const parked = q.carParked;
      if (!parked || typeof parked !== 'object') continue;
      for (const [id, s] of Object.entries(parked)) if (POWER_CARS[id] && !(q === skip && id === except)) out.push(...carBoxes(POWER_CARS[id], s.x, s.z, s.h));
    }
    return out;
  }
  const othersParked = (p, id) => parkedBoxes(p, id);
  const boxes = () => parkedBoxes();

  // What the player sees of their own cars: which they own, and where the ones they are not in stand.
  function selfView(p) {
    return { cars: own(p), parked: Object.entries(parkedOf(p)).map(([id, s]) => ({ car: id, x: Math.round(s.x * 100) / 100, z: Math.round(s.z * 100) / 100, h: Math.round(s.h * 1000) / 1000 })) };
  }

  return { setOwned, enter, drive, crash, leave, unseat, selfView, boxes, isOwnCar };
}

const wrap = (a) => { let d = a % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
