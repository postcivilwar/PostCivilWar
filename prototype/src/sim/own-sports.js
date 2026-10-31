// A player's own things from the sports mall, ridden on land (the bicycle, the skateboard, the skates, the e-scooter, the
// hoverboard, the electric unicycle): getting on, riding, getting off, and where each was left. The speedboat and the
// surfboard are for the water and are not ridden here.
//
// Who owns which is the website's server's to say (the market's holdings): the page tells the town what the server told
// it (`sports.owned`), and only a thing on that list can be ridden. In a copy of the game with no server there is
// nothing to own, and so nothing to ride.
//
// While a player rides one, `astride` is 'sp:<item>', as it is 'pb:<bike>' on a motorcycle, so that everything that
// already asks "is this player riding something?" (fights, arrests, treatment, doors, what may be done meanwhile) gets
// the same answer. What it does while ridden goes through the motorcycle's own intents (moto.drive, moto.leave,
// moto.crash: sim.js sends each to the one ridden). A ridden thing strikes whoever is in its way (impact.js), lightly.
import { SPORTS } from './sports.js';
import { SPORT_HANDLING, SPORT_FRONTS } from './sport-ride.js';
import { zoneWalkable, zoneRoomAt, inPowerbikeHall, inCarHall, inSportsHall, zoneBlockKind, onHabitation, habitationFootOnly, footOnlySaid } from './zone.js';
import { contactNormal, contactOutcome, crashShare, throwLanding, THROW } from './contact.js';
import { GameError } from './registry.js';
import { clearOfPoint } from './in-the-way.js';

export const isOwnSport = (astride) => typeof astride === 'string' && astride.startsWith('sp:');
export const sportOfAstride = (astride) => (isOwnSport(astride) ? astride.slice(3) : null);
// Coming off: as from a motorcycle, but at the speeds these go (30 October 2026, the owner's word: no life lost for
// hitting anything). Slower than `least` it is a bump and it stops.
export const SPORT_CRASH = Object.freeze({ least: 4.2, lie: Object.freeze([1.6, 3.4]), rise: 2.4, thrown: Object.freeze([0.6, 3.5]), carry: 0.25 });

export function createOwnSports({ state, hub, obstacles, strangers = () => [] }) {
  // (other players' cars, motorcycles and kekes: never one the rider is already against, in-the-way.js)
  const theirs = (b) => clearOfPoint(strangers(), b.x, b.z, SPORT_HANDLING[b.id].room - 0.05);
  const own = (p) => (Array.isArray(p.sports) ? p.sports : []);
  const parkedOf = (p) => { if (!p.sportParked || typeof p.sportParked !== 'object') p.sportParked = {}; return p.sportParked; };
  const onFoot = (p) => !p.driving && (p.riding === null || p.riding === undefined) && (p.astride === null || p.astride === undefined) && !p.incar && !p.carried && !p.custody && !p.swimming && !p.dead && !p.down;
  const ridable = (id) => !!(SPORTS[id] && SPORT_HANDLING[id]);

  // What the server says this player owns: the list is replaced as a whole. A thing no longer theirs (sold) is taken
  // from under them if they are on it, and is no longer standing anywhere.
  function setOwned(p, { items }) {
    const list = (Array.isArray(items) ? items : []).filter((id) => typeof id === 'string' && SPORTS[id]).slice(0, 20);
    p.sports = [...new Set(list)];
    const parked = parkedOf(p);
    for (const id of Object.keys(parked)) if (!p.sports.includes(id)) delete parked[id];
    if (isOwnSport(p.astride) && p.psport && !Number.isInteger(p.psport.taken) && !p.sports.includes(sportOfAstride(p.astride))) leave(p);
    return { items: p.sports };
  }

  // On: where it was left, if the player is beside it; otherwise it is brought to where they stand (as a motorcycle is),
  // as long as there is room for it there and the player is out of doors.
  function mount(p, { item }) {
    const id = String(item || '');
    if (!SPORTS[id]) throw new GameError('NO_ITEM', 'There is no such thing.');
    if (!own(p).includes(id)) throw new GameError('NOT_YOURS', `The ${SPORTS[id].name} is not yours.`);
    if (!ridable(id)) throw new GameError('WATER', `The ${SPORTS[id].name} is for the water.`);
    if (!onFoot(p)) throw new GameError('NOT_ON_FOOT', 'You cannot get on it now.');
    if (p.fight) throw new GameError('FIGHTING', 'Not in the middle of a fight.');
    const h = SPORT_HANDLING[id];
    const parked = parkedOf(p)[id];
    let at;
    if (parked && Math.hypot(parked.x - p.x, parked.z - p.z) < 2.5) at = parked;
    else {
      if (zoneRoomAt(p.x, p.z) || inPowerbikeHall(p.x, p.z) || inCarHall(p.x, p.z) || inSportsHall(p.x, p.z)) throw new GameError('INDOORS', `Go outside first: your ${SPORTS[id].name} is brought to you there.`);
      if (onHabitation(p.x, p.z)) throw new GameError('ON_FOOT_HERE', `The habitation is on foot: your ${SPORTS[id].name} is brought to you at its car park.`);
      if (!zoneWalkable(p.x, p.z, obstacles(), h.room)) throw new GameError('NO_ROOM', `There is no room for it here. Go out to the road.`);
      at = { x: p.x, z: p.z, h: p.heading || 0 };
    }
    delete parkedOf(p)[id];
    p.astride = `sp:${id}`;
    p.psport = { id, x: at.x, z: at.z, h: at.h, movedAt: state.real };
    p.x = at.x; p.z = at.z; p.heading = at.h; p.lastMoveAt = state.real;
    return { item: id, x: at.x, z: at.z, h: at.h };
  }

  // One step of riding, as the rider's page moved it: not further than it could have gone since the last step, not
  // through anything solid, not onto a footbridge.
  const num = (v, lo, hi, d = 0) => { const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };
  const rideOf = (step, top) => ({ lean: Math.round(num(step.lean, -0.6, 0.6) * 100) / 100, speed: Math.round(num(step.speed, -1, top) * 10) / 10, throttle: Math.round(num(step.throttle, 0, 1) * 10) / 10, brake: step.brake ? 1 : 0, steer: Math.round(num(step.steer, -0.7, 0.7) * 100) / 100, phase: Math.round(num(step.phase, 0, 7) * 100) / 100 });
  function drive(p, { x, z, heading, ...step }) {
    if (![x, z, heading].every(Number.isFinite)) throw new GameError('BAD_MOVE', 'Invalid position.');
    const b = p.psport;
    if (!isOwnSport(p.astride) || !b) throw new GameError('NOT_RIDING', 'You are not riding anything.');
    const h = SPORT_HANDLING[b.id];
    const gap = Math.hypot(x - b.x, z - b.z);
    const elapsed = Math.min(1.0, state.real - p.lastMoveAt);
    if (gap > h.top * (elapsed + 0.12) * 1.2 + 0.05) throw new GameError('TOO_FAST', 'Movement rejected.');
    if (gap > 0.02 && hub.impact && hub.impact.stalled(b)) throw new GameError('STALLED', 'You have stopped: you hit someone.');
    const boxes = [...obstacles(), ...theirs(b)];
    const steps = Math.max(1, Math.ceil(gap / 0.4));
    for (let i = 1; i <= steps; i += 1) if (!zoneWalkable(b.x + ((x - b.x) * i) / steps, b.z + ((z - b.z) * i) / steps, boxes, h.room - 0.05)) throw new GameError('BLOCKED', 'Movement rejected.');
    { const f = habitationFootOnly(x, z); if (f) throw new GameError('FOOT_ONLY', footOnlySaid(f)); }
    const fromX = b.x, fromZ = b.z;
    if (elapsed > 0.004) b.seen = Number.isFinite(b.seen) ? b.seen * 0.5 + (gap / elapsed) * 0.5 : gap / elapsed;
    b.x = x; b.z = z; b.h = heading; b.movedAt = state.real;
    b.ride = rideOf(step, h.top);
    p.x = x; p.z = z; p.heading = heading; p.lastMoveAt = state.real;
    p.stats.ridden = (p.stats.ridden || 0) + gap;
    // (one taken from one of the town's riders: the riders keep where it is)
    if (Number.isInteger(b.taken) && hub.sportRiders) hub.sportRiders.moved(b.taken, { x, z, h: heading });
    const hit = hub.impact ? hub.impact.step(p, { kind: 'sport', id: `sp:${b.id}`, front: SPORT_FRONTS[b.id] }, b, fromX, fromZ, x, z, heading, elapsed) : [];
    return hit.length ? { hit } : {};
  }

  // Thrown off: it ran into something at `speed` along `heading`, judged again here as a motorcycle's crash is
  // (contact.js): only a hard enough blow into something throws the rider, who goes on as far as there is room and
  // gets up again; it costs no life. The thing is left lying where it stopped.
  function crash(p, { speed, heading } = {}) {
    const b = p.psport;
    if (!isOwnSport(p.astride) || !b) throw new GameError('NOT_RIDING', 'You are not riding anything.');
    const h = SPORT_HANDLING[b.id];
    const seen = Number.isFinite(b.seen) ? b.seen : h.top;
    const v = Math.max(-1, Math.min(Math.min(h.top, seen * 1.35 + 1.5), Number(speed) || 0));
    if (Math.abs(v) < SPORT_CRASH.least) return { fell: false, outcome: 'stop' };
    const dir = Number.isFinite(heading) ? heading : b.h;
    const boxes = [...obstacles(), ...theirs(b)];
    let hit = null;
    for (let d = 0.2; d <= 1.21; d += 0.2) {
      const qx = b.x + Math.sin(dir) * d, qz = b.z + Math.cos(dir) * d;
      const kind = zoneBlockKind(qx, qz, boxes, h.room - 0.05);
      if (kind) { hit = { x: qx, z: qz, kind }; break; }
    }
    if (!hit) return { fell: false, outcome: 'none' };
    const normal = contactNormal((x, z) => zoneWalkable(x, z, boxes, h.room - 0.05), b.x, b.z, hit.x, hit.z);
    const c = contactOutcome({ speed: v, heading: dir, normal, kind: hit.kind });
    if (c.outcome !== 'crash') return { fell: false, outcome: c.outcome, into: Math.round(c.into * 10) / 10 };
    const share = crashShare(c.into, hit.kind);
    const now = state.real;
    if (Number.isInteger(b.taken)) { if (hub.sportRiders) hub.sportRiders.leftBy(p, b.taken, { x: b.x, z: b.z, h: b.h }, true); } else if (own(p).includes(b.id)) parkedOf(p)[b.id] = { x: b.x, z: b.z, h: b.h, fallen: true, at: now };
    p.astride = null; p.psport = null;
    const far = Math.min(SPORT_CRASH.thrown[1], SPORT_CRASH.thrown[0] + SPORT_CRASH.carry * c.into);
    const at = throwLanding({ x: b.x, z: b.z, ux: Math.sin(dir), uz: Math.cos(dir), far: Math.max(far, THROW.nearest), kind: (x, z, r) => zoneBlockKind(x, z, boxes, r) });
    p.x = at.x; p.z = at.z; p.lastMoveAt = now;
    const lie = SPORT_CRASH.lie[0] + (SPORT_CRASH.lie[1] - SPORT_CRASH.lie[0]) * share;
    p.down = { at: now, until: now + lie, upAt: now + lie + SPORT_CRASH.rise, by: 'crash', h: dir, speed: Math.round(Math.abs(v) * 10) / 10, into: Math.round(c.into * 10) / 10, fall: 'pitch', from: { x: b.x, z: b.z }, over: at.over };
    p.stats.crashes = (p.stats.crashes || 0) + 1;
    return { fell: true, kmh: Math.round(Math.abs(v) * 3.6), into: Math.round(c.into * 10) / 10, x: at.x, z: at.z, item: { id: b.id, x: b.x, z: b.z, h: b.h }, lie };
  }

  // Off: the rider steps off beside it, and it stays where it stands (the skates are taken off and left there too).
  function leave(p) {
    const b = p.psport;
    if (!isOwnSport(p.astride) || !b) throw new GameError('NOT_RIDING', 'You are not riding anything.');
    const boxes = obstacles();
    const side = { x: Math.cos(b.h), z: -Math.sin(b.h) };
    const spot = [[side.x * 0.8, side.z * 0.8], [-side.x * 0.8, -side.z * 0.8], [-Math.sin(b.h) * 1.2, -Math.cos(b.h) * 1.2]].map(([dx, dz]) => ({ x: b.x + dx, z: b.z + dz })).find((s) => zoneWalkable(s.x, s.z, boxes)) || { x: b.x, z: b.z };
    if (Number.isInteger(b.taken)) { if (hub.sportRiders) hub.sportRiders.leftBy(p, b.taken, { x: b.x, z: b.z, h: b.h }); } else if (own(p).includes(b.id)) parkedOf(p)[b.id] = { x: b.x, z: b.z, h: b.h };
    p.astride = null; p.psport = null;
    p.x = spot.x; p.z = spot.z; p.lastMoveAt = state.real;
    return { x: spot.x, z: spot.z, parked: { item: b.id, x: b.x, z: b.z, h: b.h } };
  }

  // Taken off it by the police, or knocked off: it is left where it stands.
  function unseat(p) { if (isOwnSport(p.astride) && p.psport) leave(p); }

  function selfView(p) {
    return { items: own(p), parked: Object.entries(parkedOf(p)).map(([id, s]) => ({ item: id, x: Math.round(s.x * 100) / 100, z: Math.round(s.z * 100) / 100, h: Math.round(s.h * 1000) / 1000, ...(s.fallen ? { fallen: true, ago: Number.isFinite(s.at) ? Math.round((state.real - s.at) * 100) / 100 : 99 } : {}) })) };
  }

  return { setOwned, mount, drive, crash, leave, unseat, selfView, isOwnSport };
}
