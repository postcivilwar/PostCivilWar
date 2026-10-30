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

import { ZONE_FLEET, zoneService, zoneResident, zoneWalkable } from './zone.js';
import { GameError } from './registry.js';
import { PACE } from './actors.js';
import { POWER_CARS } from './power-cars.js';

export const HIJACK = Object.freeze({
  okada: Object.freeze({ lateral: Object.freeze([0.35, 1.6]), along: Object.freeze([-0.3, 1.1]), stand: Object.freeze([0.78, 0.25]), steps: Object.freeze([['reach', 0.5], ['pull', 1.4], ['mount', 2.2]]) }),
  keke: Object.freeze({ lateral: Object.freeze([0.5, 2.0]), along: Object.freeze([-0.25, 1.5]), stand: Object.freeze([1.12, 0.5]), steps: Object.freeze([['door', 0.6], ['enter', 1.7]]) }),
  // a car: its own width and length say where its doors are (`carRule`)
  car: Object.freeze({ steps: Object.freeze([['door', 0.7], ['pull', 1.7], ['enter', 2.5]]) }),
});
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

export function createHijack({ state, players, okada, vehicles, actors, population, emit, hub }) {
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
      hub.ownCars.enterTaken(p, { model: taken.model, x: taken.x, z: taken.z, h: taken.h, n: h.id });
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
      if (now >= p.hijack.until) complete(p);
    }
  }

  function view(p) {
    const h = p.hijack;
    if (!h) return null;
    const steps = HIJACK[h.kind].steps;
    const elapsed = real() - h.startedAt;
    const step = steps.find(([, until]) => elapsed < until) || steps[steps.length - 1];
    return { kind: h.kind, id: h.id, step: step[0], progress: Math.min(1, elapsed / steps[steps.length - 1][1]), side: h.side };
  }

  const api = { start, cancel, tick, view };
  hub.hijack = api;
  return api;
}
