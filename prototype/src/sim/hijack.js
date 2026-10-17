// Taking a vehicle that is not yours.
//
// It can only be begun from beside the driver: next to the rider of a
// motorcycle that is standing still, or at the front seat of a keke that is
// not locked. From behind, where a passenger sits, it cannot. Once begun it
// takes a couple of seconds, in steps the client can show (a hand on the
// door, the rider pulled off, the seat taken), and the player is in the
// seat only when those have run their course. It is an offence from the
// moment it is done, and the owner knows who did it.

import { ZONE_FLEET, zoneService, zoneResident } from './zone.js';
import { GameError } from './registry.js';
import { PACE } from './actors.js';

export const HIJACK = Object.freeze({
  okada: Object.freeze({ lateral: Object.freeze([0.35, 1.6]), along: Object.freeze([-0.3, 1.1]), stand: Object.freeze([0.78, 0.25]), steps: Object.freeze([['reach', 0.5], ['pull', 1.4], ['mount', 2.2]]) }),
  keke: Object.freeze({ lateral: Object.freeze([0.5, 2.0]), along: Object.freeze([-0.25, 1.5]), stand: Object.freeze([1.12, 0.5]), steps: Object.freeze([['door', 0.6], ['enter', 1.7]]) }),
});

// Where someone stands in relation to a vehicle: `lateral` metres to its side
// (positive to its left), `along` metres ahead of its middle. `ok` when that is
// beside the driver; `stand` is the exact place to stand to take it from that side.
export function driverSide(kind, v, px, pz) {
  const rule = HIJACK[kind];
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
    return { hijack: view(p) };
  }

  function cancel(p) {
    if (!p.hijack) return {};
    if (p.hijack.kind === 'okada') okada.freeze(p.hijack.id, false);
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
