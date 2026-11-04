// Taking a vehicle that is not yours.
//
// It can only be begun from beside the driver: next to the rider of a
// motorcycle that is standing still, or at the front seat of a keke that is
// not locked. From behind, where a passenger sits, it cannot. Once begun it
// takes a couple of seconds, in steps the client can show (a hand on the
// door, the rider pulled off, the seat taken), and the player is in the
// seat only when those have run their course. It is an offence from the
// moment it is done, and the owner knows who did it.
//
// (30 October 2026) And a car of the town's (traffic.js) standing still with its driver at the wheel, at the
// roadside, at a red light or in a queue, from beside either front door: the door opened, the driver pulled out (who
// runs, out of the far door), the seat taken. It is driven as the player's own cars are (own-cars.js), and it is never
// theirs: never on their list of cars, never sold; the police take back every one when they catch them.

// (4 November 2026, the owner, with two videos of another game, the way it is done there) A car of the town's is taken
// from wherever the player stands near it, in front of it as well: they go round it to the driver's door, open it, pull
// the driver out onto the road (who gets up and runs), get in and slam the door; whoever rides with the driver opens
// their own door, gets out, slams it and runs. Where the driver's side is blocked (a wall, another car), they go to the
// front passenger's door instead, the front passenger is pulled out, the driver scrambles out after them across the
// seat, and the player gets in there and slides across to the wheel. Every step is the town's, timed (`plan`), so that
// every player sees the same; the page draws the doors and the figures (car-view.js, main.js).

import { ZONE_FLEET, zoneService, zoneResident, zoneWalkable } from './zone.js';
import { GameError } from './registry.js';
import { PACE } from './actors.js';
import { POWER_CARS } from './power-cars.js';
import { levelAt } from './levels.js';
import { DOOR, doorPlace, doorStand, doorOut, doorOfSeat, doorsOf, toWorld, toCar, wayRound, TWO_DOORS } from './car-doors.js';

export const HIJACK = Object.freeze({
  okada: Object.freeze({ lateral: Object.freeze([0.35, 1.6]), along: Object.freeze([-0.3, 1.1]), stand: Object.freeze([0.78, 0.25]), steps: Object.freeze([['reach', 0.5], ['pull', 1.4], ['mount', 2.2]]) }),
  keke: Object.freeze({ lateral: Object.freeze([0.5, 2.0]), along: Object.freeze([-0.25, 1.5]), stand: Object.freeze([1.12, 0.5]), steps: Object.freeze([['door', 0.6], ['enter', 1.7]]) }),
  // a car: its own width and length say where its doors are (`carRule`)
  car: Object.freeze({ steps: Object.freeze([['door', 0.7], ['pull', 1.7], ['enter', 2.5]]) }),
});
// Taking a car of the town's (4 November 2026): how near it one must be (metres from its sides and ends), the pace round
// it to the door, and how long each step takes (seconds): turning to the door, opening it, pulling the driver out (and
// the front passenger too, from that side), getting in, slamming the door, sliding across to the wheel.
export const CAR_TAKING = Object.freeze({ reach: 4.5, pace: 3.3, turn: 0.2, door: 0.55, pull: 1.05, pullBoth: 1.6, scramble: 0.75, enter: 0.8, shut: 0.35, slide: 0.85, out: 0.32, next: 0.55, slam: 0.5 });
// Beside a car's front doors: from just off its side to a long step away, from a little behind the door (a little
// behind its middle, as own-cars.js has it) to a little ahead of it; squared up a step out from it.
export function carRule(model) {
  const s = POWER_CARS[model] || { length: 4.8, width: 2.1 };
  const door = -0.15 * s.length;
  return { lateral: [s.width / 2 + 0.05, s.width / 2 + 1.7], along: [door - 1.4, door + 1.6], stand: [s.width / 2 + 0.45, door], steps: HIJACK.car.steps };
}

// Where someone stands in relation to a vehicle: `lateral` metres to its side
// (positive to its left), `along` metres ahead of its middle. `ok` when that is
// beside the driver; `stand` is the exact place to stand to take it from that side.
export function driverSide(kind, v, px, pz) {
  const rule = kind === 'car' ? carRule(v.model) : HIJACK[kind];
  const h = v.h !== undefined ? v.h : v.heading;
  const dx = px - v.x, dz = pz - v.z;
  const lateral = dx * Math.cos(h) - dz * Math.sin(h);
  const along = dx * Math.sin(h) + dz * Math.cos(h);
  const side = lateral >= 0 ? 1 : -1;
  const near = Math.abs(lateral) >= rule.lateral[0] && Math.abs(lateral) <= rule.lateral[1];
  const beside = along >= rule.along[0] && along <= rule.along[1];
  const behind = along < rule.along[0];
  const stand = { x: v.x + Math.cos(h) * rule.stand[0] * side + Math.sin(h) * rule.stand[1], z: v.z - Math.sin(h) * rule.stand[0] * side + Math.cos(h) * rule.stand[1] };
  return { ok: near && beside, lateral, along, side, behind, stand, reason: near && beside ? '' : behind ? 'That is the passenger\'s place. Come up beside the driver.' : 'Come up beside the driver.' };
}

export function createHijack({ state, players, okada, vehicles, actors, population, emit, hub, obstacles = () => [] }) {
  const real = () => state.real;
  const people = population.people;

  function mayTake(p) {
    if (p.hijack) throw new GameError('BUSY', 'You have your hands full.');
    if (p.custody) throw new GameError('IN_CUSTODY', 'You are in the hands of the police.');
    if (p.carried) throw new GameError('CARRIED', 'You are in the ambulance.');
    if (hub.conflict.critical(p)) throw new GameError('CRITICAL', 'Your health is critical. You have not the strength.');
    if (p.driving || (p.riding !== null && p.riding !== undefined) || (p.astride !== null && p.astride !== undefined) || p.incar) throw new GameError('NOT_ON_FOOT', 'Get down first.');
  }

  // target: { okada: n } or { vehicle: id }
  function start(p, target) {
    mayTake(p);
    let kind, id, at;
    if (target && target.okada !== undefined && target.okada !== null) {
      kind = 'okada'; id = Number(target.okada);
      at = okada.seizable(id);
    } else if (target && target.vehicle) {
      kind = 'keke'; id = String(target.vehicle);
      at = vehicles.seizable(vehicles.get(id), p.id);
    } else if (target && target.car !== undefined && target.car !== null && hub.traffic) {
      kind = 'car'; id = Number(target.car);
      at = hub.traffic.seizable(id);
    } else throw new GameError('NO_TARGET', 'There is nothing there to take.');
    if (!at.ok) throw new GameError(at.code, at.reason);
    // (in the city one road may run over another: not a car on a flyover from the road under it)
    if (Number.isFinite(at.y) && Math.abs(at.y - levelAt(p)) > 2.5) throw new GameError('TOO_FAR', 'Walk up to it.');
    if (kind === 'car') return startCar(p, id, at);
    const where = driverSide(kind, at, p.x, p.z);
    if (!where.ok) throw new GameError(where.behind ? 'PASSENGER_SIDE' : 'TOO_FAR', where.reason);
    const steps = HIJACK[kind].steps;
    p.hijack = { kind, id, startedAt: real(), until: real() + steps[steps.length - 1][1], side: where.side };
    // squared up to the door: a step, not a jump
    p.x = where.stand.x; p.z = where.stand.z; p.heading = Math.atan2(at.x - p.x, at.z - p.z); p.lastMoveAt = real();
    if (hub.conflict) hub.conflict.stop(p);
    if (kind === 'okada') okada.freeze(id, true);
    if (kind === 'car') hub.traffic.freeze(id, true);
    return { hijack: view(p) };
  }

  // ---- a car of the town's (4 November 2026) ----
  // Which door, the way round to it, and every step after, timed from now.
  function startCar(p, n, at) {
    const C = CAR_TAKING, model = at.model, spec = POWER_CARS[model];
    const car = { x: at.x, z: at.z, h: at.h };
    const rel = toCar(car, p.x, p.z);
    if (Math.abs(rel.along) > spec.length / 2 + C.reach || Math.abs(rel.across) > spec.width / 2 + C.reach) throw new GameError('TOO_FAR', 'Walk up to it.');
    const y = Number.isFinite(at.y) ? at.y : levelAt(p);
    // (what is in the way: not the car itself)
    const own = (b) => { const c = toCar(car, (b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2); return Math.abs(c.along) < spec.length / 2 + 0.3 && Math.abs(c.across) < spec.width / 2 + 0.3; };
    const boxes = obstacles().filter((b) => !own(b) && (!Number.isFinite(b.y) || Math.abs(b.y - y) < 2.5));
    const open = (x, z, r = 0.3) => zoneWalkable(x, z, boxes, r, y);
    const reachable = (door) => {
      const d = doorPlace(model, door), stand = toWorld(car, doorStand(model, door));
      if (!open(stand.x, stand.z, 0.3)) return null;
      // room for the door to swing out (its edge as it goes, half open and open)
      for (const ang of [DOOR.open * 0.5, DOOR.open]) for (const k of [0.45, 0.8, 1]) {
        const q = toWorld(car, { along: d.front - Math.cos(ang) * d.length * k, across: d.side * (d.half + Math.sin(ang) * d.length * k) });
        if (!open(q.x, q.z, 0.1)) return null;
      }
      const way = wayRound(car, model, p, stand, (x, z) => open(x, z, 0.3));
      return way ? { door, stand, way } : null;
    };
    const entry = reachable('fl') || reachable('fr');
    if (!entry) throw new GameError('NO_WAY_IN', 'There is no way in: something is against both of its front doors.');
    const driverSideIn = entry.door === 'fl';
    const riders = hub.traffic.ridersOf(n);
    const front = riders.find((r) => r.seat === 'front');
    const T = {};
    let t = 0;
    const span = (key, len) => { T[key] = [t, t + len]; t += len; };
    span('walk', entry.way.len / C.pace);
    t += C.turn;
    span('door', C.door);
    span('pull', driverSideIn ? C.pull : front ? C.pullBoth : C.scramble + 0.3);
    span('enter', C.enter);
    span('shut', C.shut);
    if (!driverSideIn) span('slide', C.slide);
    const now = real();
    // who gets out of which door, when: the driver (pulled out, or across the seat), and everyone riding with them
    const outs = [];
    const doorOpen = (door) => { const sp = toWorld(car, doorOut(model, door)); return open(sp.x, sp.z, 0.3); };
    const doorFor = (seat) => {
      let d = doorOfSeat(model, seat);
      if (d === entry.door && seat !== 'front' && !driverSideIn) d = d === 'fl' ? 'fr' : 'fl';
      if (d === entry.door && seat !== 'front' && driverSideIn) d = 'fr';
      if (!doorOpen(d)) { const other = d[0] + (d[1] === 'l' ? 'r' : 'l'); if (doorsOf(model).includes(other) && doorOpen(other)) d = other; }
      return d;
    };
    const pullAt = T.pull[0] + 0.3;
    if (driverSideIn) outs.push({ at: pullAt, i: at.person, door: 'fl', who: 'driver', fall: true });
    else if (front) { outs.push({ at: pullAt, i: front.i, door: 'fr', who: 'front', fall: true }); outs.push({ at: pullAt + 0.75, i: at.person, door: 'fr', who: 'driver', fall: false }); }
    else outs.push({ at: pullAt, i: at.person, door: 'fr', who: 'driver', fall: false });
    // the rest, a little after the door is opened, each out of the door nearest their seat (one after another where
    // two share one)
    const byDoor = new Map();
    for (const r of riders) { if (!driverSideIn && r === front) continue; const d = doorFor(r.seat); if (!byDoor.has(d)) byDoor.set(d, []); byDoor.get(d).push(r); }
    let k = 0;
    for (const [d, list] of byDoor) {
      const opens = T.door[1] + 0.15 + 0.25 * k;
      list.forEach((r, j) => outs.push({ at: opens + C.out + C.next * j, i: r.i, door: d, who: r.seat, fall: false, opens }));
      k += 1;
    }
    outs.sort((a, b) => a.at - b.at);
    // the doors, opened and slammed, for the drawing: the one the player opens, the others as each is got out of
    hub.traffic.door(n, entry.door, now + T.door[0] + 0.12, now + T.shut[1] - DOOR.shutting);
    for (const [d, list] of byDoor) { const first = outs.find((o) => o.door === d && o.who !== 'driver'); const last = [...outs].reverse().find((o) => o.door === d); if (first && last) hub.traffic.door(n, d, now + first.opens, now + last.at + C.slam); }
    p.hijack = { kind: 'car', id: n, startedAt: now, until: now + t, side: driverSideIn ? 1 : -1, door: entry.door, model, car: { ...car, y }, from: { x: p.x, z: p.z }, way: entry.way.points.map((q) => [Math.round(q.x * 100) / 100, Math.round(q.z * 100) / 100]), len: entry.way.len, T, outs, done: 0 };
    if (hub.conflict) hub.conflict.stop(p);
    hub.traffic.freeze(n, true);
    return { hijack: view(p) };
  }
  // Where the player is along the way round to the door, `d` metres on
  function alongWay(h, d) {
    let x = h.from.x, z = h.from.z;
    for (const [qx, qz] of h.way) {
      const l = Math.hypot(qx - x, qz - z);
      if (d <= l) { const k = l > 1e-6 ? d / l : 1; return { x: x + (qx - x) * k, z: z + (qz - z) * k, h: Math.atan2(qx - x, qz - z) }; }
      d -= l; x = qx; z = qz;
    }
    return { x, z, h: null };
  }
  // One step of it: the player on their way round, or at the door; whoever's time has come, out of the car.
  function stepCar(p, now) {
    const h = p.hijack, e = now - h.startedAt;
    const traffic = hub.traffic;
    if (e < h.T.walk[1]) {
      const at = alongWay(h, (e / Math.max(1e-6, h.T.walk[1])) * h.len);
      p.x = at.x; p.z = at.z; if (at.h !== null) p.heading = at.h; p.lastMoveAt = now;
    } else {
      const end = alongWay(h, h.len + 1);
      p.x = end.x; p.z = end.z; p.lastMoveAt = now;
      // facing the door
      const d = doorPlace(h.model, h.door), mid = toWorld(h.car, { along: (d.front + d.rear) / 2, across: d.side * d.half });
      p.heading = Math.atan2(mid.x - p.x, mid.z - p.z);
    }
    while (h.done < h.outs.length && e >= h.outs[h.done].at) { getOut(p, h, h.outs[h.done]); h.done += 1; }
    void traffic;
  }
  // Someone out of the car, at their door: the driver pulled out onto the road (or scrambling out after the front
  // passenger), whoever rode with them out on their own; and away.
  function getOut(p, h, o) {
    const traffic = hub.traffic;
    // (two out of one door: the second a little further back and out, clear of the first)
    const used = h.used || (h.used = {});
    const k = used[o.door] || 0;
    used[o.door] = k + 1;
    const base = doorOut(h.model, o.door);
    let spot = toWorld(h.car, { along: base.along - 0.6 * k, across: base.across + Math.sign(base.across) * 0.35 * k });
    if (k && !zoneWalkable(spot.x, spot.z, [], 0.3, h.car.y)) spot = toWorld(h.car, base);
    const at = { x: spot.x, z: spot.z, y: h.car.y };
    if (o.who !== 'driver') traffic.riderOut(h.id, o.i);
    if (actors.has(o.i)) actors.drop(o.i);
    const m = actors.take(o.i, state.t, at);
    if (!m) return;
    m.h = Math.atan2(spot.x - h.car.x, spot.z - h.car.z);
    if (o.who === 'driver') {
      const crime = hub.justice.offence(p, 'vehicle_theft', { victim: { kind: 'npc', id: o.i, name: people[o.i].name }, x: h.car.x, z: h.car.z, vehicle: `car:${h.id}` });
      h.crime = crime && crime.id;
      if (hub.voices) hub.voices.event('fight', spot.x, spot.z);
    }
    if (o.fall && hub.impact && hub.impact.felled(o.i, { from: { x: p.x, z: p.z }, harm: 0, lie: 1.3, blood: false })) return;
    actors.flee(o.i, h.car.x, h.car.z, PACE.run, o.who === 'driver' ? 'Robbed of the car' : 'Running from the car', 20);
    m.after = real() + 9;
    if (hub.reactions) hub.reactions.react(o.i, 'flee', { seconds: 5, loop: true });
  }
  // At the wheel: the car the player's, as taken cars are (own-cars.js), at the height it stands at.
  function completeCar(p, h) {
    const traffic = hub.traffic;
    // (anyone whose time had not quite come: out now)
    while (h.done < h.outs.length) { getOut(p, h, h.outs[h.done]); h.done += 1; }
    traffic.freeze(h.id, false);
    const c = traffic.cars[h.id];
    if (!c || c.mode === 'kept' || c.mode === 'returning' || c.mode === 'taken') return;
    const driver = h.outs.find((o) => o.who === 'driver');
    const taken = traffic.take(h.id, p);
    hub.ownCars.enterTaken(p, { model: taken.model, x: taken.x, z: taken.z, h: taken.h, n: h.id, y: h.car.y });
    const who = people[driver ? driver.i : taken.person], spec = POWER_CARS[taken.model];
    emit(p.id, { type: 'note', text: `You have taken ${who.first}'s ${spec.name}. ${who.first} has seen your face. It is not yours: it can never be sold, and the police will take back every car you have taken when they catch you.`, crime: h.crime || null });
  }

  function cancel(p) {
    if (!p.hijack) return {};
    if (p.hijack.kind === 'okada') okada.freeze(p.hijack.id, false);
    if (p.hijack.kind === 'car' && hub.traffic) hub.traffic.freeze(p.hijack.id, false);
    p.hijack = null;
    return {};
  }

  function complete(p) {
    const h = p.hijack;
    p.hijack = null;
    if (h.kind === 'car' && h.T) { completeCar(p, h); return; }
    if (h.kind === 'okada') {
      const at = okada.seizable(h.id);
      okada.freeze(h.id, false);
      const again = okada.seizable(h.id);
      if (!again.ok) return;
      void at;
      const i = again.person;
      // the rider lands on his feet on the far side, and runs
      const off = { x: again.x - Math.cos(again.h) * 1.1 * h.side, z: again.z + Math.sin(again.h) * 1.1 * h.side };
      const taken = okada.take(h.id, p);
      actors.drop(i);
      actors.take(i, state.t, off);
      const crime = hub.justice.offence(p, 'vehicle_theft', { victim: { kind: 'npc', id: i, name: people[i].name }, x: taken.x, z: taken.z, vehicle: `okada:${h.id}` });
      actors.flee(i, taken.x, taken.z, PACE.run, 'Robbed of his motorcycle', 16);
      const m = actors.get(i); if (m) m.after = real() + 9;
      emit(p.id, { type: 'note', text: `You have ${people[i].first}'s motorcycle. He has seen your face.`, crime: crime.id });
      return;
    }
    if (h.kind === 'car') {
      const traffic = hub.traffic;
      traffic.freeze(h.id, false);
      const at = traffic.seizable(h.id);
      if (!at.ok) return;
      const i = at.person, spec = POWER_CARS[at.model];
      // the driver gets out of the far door and runs; the thief is at the wheel
      const out = spec.width / 2 + 0.9, back = spec.length / 2 + 0.9;
      // (out of the far door; where there is no room on that side, out behind the car, or on the near side behind it)
      const far = [[-out * h.side, 0], [0, -back], [out * h.side, -back * 0.8]].map(([l, a]) => ({ x: at.x + Math.cos(at.h) * l + Math.sin(at.h) * a, z: at.z - Math.sin(at.h) * l + Math.cos(at.h) * a })).find((q) => zoneWalkable(q.x, q.z)) || { x: at.x - Math.cos(at.h) * out * h.side, z: at.z + Math.sin(at.h) * out * h.side };
      const taken = traffic.take(h.id, p);
      actors.drop(i);
      actors.take(i, state.t, far);
      const crime = hub.justice.offence(p, 'vehicle_theft', { victim: { kind: 'npc', id: i, name: people[i].name }, x: taken.x, z: taken.z, vehicle: `car:${h.id}` });
      actors.flee(i, taken.x, taken.z, PACE.run, 'Robbed of the car', 18);
      const m = actors.get(i); if (m) m.after = real() + 9;
      hub.ownCars.enterTaken(p, { model: taken.model, x: taken.x, z: taken.z, h: taken.h, n: h.id, y: at.y });
      emit(p.id, { type: 'note', text: `You have taken ${people[i].first}'s ${spec.name}. ${people[i].first} has seen your face. It is not yours: it can never be sold, and the police will take back every car you have taken when they catch you.`, crime: crime.id });
      return;
    }
    const v = vehicles.get(h.id);
    if (!vehicles.seizable(v, p.id).ok) return;
    const dealer = zoneResident(ZONE_FLEET.dealer);
    const park = zoneService('park');
    const watched = hub.serviceState('park').open && Math.hypot(v.x - park.x, v.z - park.z) < 45;
    vehicles.take(v, p);
    const crime = hub.justice.offence(p, 'vehicle_theft', { victim: { kind: 'resident', id: v.owner.id || dealer.id, name: v.owner.name }, x: v.x, z: v.z, vehicle: v.id, stealth: !watched, noticed: false });
    vehicles.enter(p, v.id);
    emit(p.id, { type: 'note', text: watched ? `You have taken keke ${v.plate}. ${v.owner.name} saw you.` : `You have taken keke ${v.plate}.`, crime: crime.id });
  }

  function tick() {
    const now = real();
    for (const id of Object.keys(players)) {
      const p = players[id];
      if (!p.hijack) continue;
      if (p.custody || p.carried || hub.conflict.critical(p)) { cancel(p); continue; }
      if (p.hijack.kind === 'car' && p.hijack.T) stepCar(p, now);
      if (now >= p.hijack.until) complete(p);
    }
  }

  function view(p) {
    const h = p.hijack;
    if (!h) return null;
    if (h.kind === 'car' && h.T) {
      const e = real() - h.startedAt;
      const order = ['walk', 'door', 'pull', 'enter', 'shut', 'slide'].filter((k) => h.T[k]);
      const step = order.find((k) => e < h.T[k][1]) || order[order.length - 1];
      const [a, b] = h.T[step];
      const r = (v) => Math.round(v * 100) / 100;
      return { kind: 'car', id: h.id, step, progress: Math.max(0, Math.min(1, (e - a) / Math.max(1e-6, b - a))), side: h.side, door: h.door, model: h.model, t: r(e), times: Object.fromEntries(order.map((k) => [k, [r(h.T[k][0]), r(h.T[k][1])]])), car: { x: r(h.car.x), z: r(h.car.z), h: Math.round(h.car.h * 1000) / 1000 } };
    }
    const steps = HIJACK[h.kind].steps;
    const elapsed = real() - h.startedAt;
    const step = steps.find(([, until]) => elapsed < until) || steps[steps.length - 1];
    return { kind: h.kind, id: h.id, step: step[0], progress: Math.min(1, elapsed / steps[steps.length - 1][1]), side: h.side };
  }

  const api = { start, cancel, tick, view };
  hub.hijack = api;
  return api;
}
