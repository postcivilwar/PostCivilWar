// Residents: the non-player population of a zone.
//
// Each resident follows a daily schedule of named places and walks the road
// graph between them. This is the "full agent" tier. In a larger world the
// same schedule data drives two cheaper tiers (schedule-only, and a
// statistical population) for zones with no players nearby.

import { ZONE_NODES, ZONE_PLACES, ZONE_RESIDENTS } from './zone.js';
import { shortestRoute, nearestNode } from './graph.js';

const WALK_SPEED = 1.7;

const toMinutes = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));

function walkLength(from, to) {
  const nodes = shortestRoute(from.node, to.node) || [to.node];
  let length = 0;
  let x = from.x;
  let z = from.z;
  for (const name of nodes) { const [nx, nz] = ZONE_NODES[name]; length += Math.hypot(nx - x, nz - z); x = nx; z = nz; }
  return length + Math.hypot(to.x - x, to.z - z);
}

// A schedule entry is either a time to ARRIVE (going to work) or, marked
// 'leave', a time to set off (going for lunch or home). This turns both into
// departure times, allowing for the walk, so that an office that opens at
// eight has its officer at the desk at eight.
export function departurePlan(resident, timeScale) {
  const entries = resident.schedule.map(([time, key, mode]) => ({ at: toMinutes(time), key, leave: mode === 'leave' })).sort((a, b) => a.at - b.at);
  return entries.map((entry, index) => {
    if (entry.leave) return { depart: entry.at, key: entry.key };
    const previous = entries[(index + entries.length - 1) % entries.length];
    const minutes = (walkLength(ZONE_PLACES[previous.key], ZONE_PLACES[entry.key]) / WALK_SPEED) * (timeScale / 60) + 4;
    return { depart: (entry.at - minutes + 1440) % 1440, key: entry.key };
  }).sort((a, b) => a.depart - b.depart);
}

// The place a resident should be heading for, or be at, at a given minute of the day.
export function scheduledPlace(plan, minuteOfDay) {
  let current = plan[plan.length - 1].key;
  for (const step of plan) if (step.depart <= minuteOfDay) current = step.key;
  return current;
}

export function createResidents({ state, timeScale }) {
  const plans = {};
  for (const resident of ZONE_RESIDENTS) plans[resident.id] = departurePlan(resident, timeScale);
  if (!state.residents) state.residents = {};
  if (!state.customPlaces) state.customPlaces = {};

  const placeFor = (key) => ZONE_PLACES[key] || state.customPlaces[key] || null;

  function settle(record, key) {
    const spot = placeFor(key);
    record.placeKey = key;
    record.x = spot.x;
    record.z = spot.z;
    record.heading = spot.facing;
    record.mode = spot.inside ? 'inside' : 'at';
    record.route = [];
  }

  function routeTo(record, key) {
    const spot = placeFor(key);
    const startNode = record.mode === 'walking' ? nearestNode(record.x, record.z) : (placeFor(record.placeKey)?.node || nearestNode(record.x, record.z));
    const nodes = shortestRoute(startNode, spot.node) || [spot.node];
    const points = nodes.map((name) => ZONE_NODES[name].slice());
    for (const via of spot.via || []) points.push(via.slice());
    points.push([spot.x, spot.z]);
    record.placeKey = key;
    record.route = points;
    record.mode = 'walking';
  }

  function init(minuteOfDay) {
    for (const resident of ZONE_RESIDENTS) {
      if (state.residents[resident.id]) continue;
      const record = { id: resident.id, x: 0, z: 0, heading: 0, mode: 'at', placeKey: null, route: [], override: null, busy: null };
      settle(record, scheduledPlace(plans[resident.id], minuteOfDay));
      state.residents[resident.id] = record;
    }
  }

  function tick(dtReal, minuteOfDay, speedFactor = 1) {
    for (const resident of ZONE_RESIDENTS) {
      const record = state.residents[resident.id];
      const wanted = record.override || scheduledPlace(plans[resident.id], minuteOfDay);
      if (wanted !== record.placeKey) routeTo(record, wanted);
      if (record.mode !== 'walking') continue;
      let budget = WALK_SPEED * speedFactor * dtReal;
      while (budget > 0 && record.route.length) {
        const [tx, tz] = record.route[0];
        const dx = tx - record.x;
        const dz = tz - record.z;
        const gap = Math.hypot(dx, dz);
        if (gap <= budget) {
          record.x = tx; record.z = tz; budget -= gap; record.route.shift();
        } else {
          record.x += (dx / gap) * budget;
          record.z += (dz / gap) * budget;
          record.heading = Math.atan2(dx, dz);
          budget = 0;
        }
      }
      if (!record.route.length) settle(record, record.placeKey);
    }
  }

  return {
    init, tick,
    get: (id) => state.residents[id],
    isAt: (id, key) => { const r = state.residents[id]; return !!r && r.mode === 'at' && r.placeKey === key; },
    send(id, key, customPlace) {
      if (customPlace) state.customPlaces[key] = customPlace;
      state.residents[id].override = key;
    },
    release(id) { state.residents[id].override = null; },
    all: () => ZONE_RESIDENTS.map((resident) => state.residents[resident.id]),
  };
}
