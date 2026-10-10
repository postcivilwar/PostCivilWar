import { createHost } from '../src/sim/host.js';
import { ZONE_NODES, zoneService, zoneParcelByPlot, zoneSiteLayout, ZONE_MOULD_STATIONS } from '../src/sim/zone.js';
import { shortestRoute, nearestNode } from '../src/sim/graph.js';
import { SPEED } from '../src/sim/sim.js';
import { vehicleSpeedAt } from '../src/sim/vehicles.js';

export function newWorld(name = 'Amara Test') {
  const host = createHost();
  const id = host.game.join({ name, look: {} });
  return { host, id };
}

export const ok = (result) => {
  if (!result.ok) throw new Error(`expected success, got ${result.code}: ${result.message}`);
  return result;
};

// Walks the way a client does: small steps, each one sent as a move intent and
// each one checked by the simulation. Follows the road graph between nodes.
export function walkTo(host, id, x, z) {
  const self = () => host.game.view(id).self;
  const start = self();
  const points = [];
  const from = nearestNode(start.x, start.z);
  const to = nearestNode(x, z);
  for (const name of shortestRoute(from, to)) points.push(ZONE_NODES[name]);
  points.push([x, z]);
  let blocked = 0;
  for (const [tx, tz] of points) {
    for (let guard = 0; guard < 8000; guard += 1) {
      const me = self();
      const gap = Math.hypot(tx - me.x, tz - me.z);
      if (gap < 0.05) break;
      host.tick(0.1);
      const wet = host.game.weather().wet ? SPEED.rain : 1;
      const stride = Math.min(gap, SPEED.run * wet * 0.1);
      const nx = me.x + ((tx - me.x) / gap) * stride;
      const nz = me.z + ((tz - me.z) / gap) * stride;
      const moved = host.game.intent(id, { type: 'move', x: nx, z: nz, heading: Math.atan2(tx - me.x, tz - me.z), run: true });
      if (moved.ok) { blocked = 0; continue; }
      // someone is in the way: step round them as a client does, and if that fails too, wait for them to move
      if (moved.code === 'IN_THE_WAY' && moved.at) {
        blocked += 1;
        // standing on the very spot being walked to: arm's length from them is there
        if (Math.hypot(moved.at.x - tx, moved.at.z - tz) < 0.7 && gap < 1.2) break;
        const ox = moved.at.x - me.x, oz = moved.at.z - me.z, d = Math.hypot(ox, oz) || 1;
        const ux = (tx - me.x) / gap, uz = (tz - me.z) / gap;
        const side = ux * -oz + uz * ox >= 0 ? 1 : -1;
        let stepped = false;
        for (const k of [1, -1]) {
          const sx = me.x + (-oz / d) * side * k * stride, sz = me.z + (ox / d) * side * k * stride;
          if (host.game.intent(id, { type: 'move', x: sx, z: sz, heading: Math.atan2(sx - me.x, sz - me.z), run: true }).ok) { stepped = true; break; }
        }
        if (!stepped && blocked > 400) throw new Error(`stuck behind someone at (${moved.at.x.toFixed(1)}, ${moved.at.z.toFixed(1)})`);
        continue;
      }
      throw new Error(`move to (${nx.toFixed(1)}, ${nz.toFixed(1)}) rejected: ${moved.code}`);
    }
  }
}

export function goToService(host, id, serviceId) {
  const s = zoneService(serviceId);
  walkTo(host, id, s.x, s.z);
}

export function goToBoard(host, id, plot) {
  const board = zoneSiteLayout(zoneParcelByPlot(plot)).board;
  walkTo(host, id, board.x, board.z);
}

export function goToWork(host, id, plot) {
  const spot = zoneSiteLayout(zoneParcelByPlot(plot)).work;
  walkTo(host, id, spot.x, spot.z);
}

export function goToMould(host, id, index = 0) {
  const station = ZONE_MOULD_STATIONS[index];
  walkTo(host, id, station.standX, station.standZ);
}

export function run(host, seconds, step = 0.1) {
  for (let elapsed = 0; elapsed < seconds; elapsed += step) host.tick(step);
}

// Sandbox funds: faucet, wait for confirmations, convert everything.
export function fund(host, id, sats = 100_000) {
  ok(host.portal(id, 'faucet', { sats }));
  run(host, host.settlementOps.policy.blockIntervalSeconds * (host.settlementOps.policy.confirmationsRequired + 1));
  const quote = ok(host.portal(id, 'quote', { sats })).data;
  return ok(host.portal(id, 'convert', { quoteId: quote.id })).data;
}

export function waitUntilOpen(host, id, serviceId, limitSeconds = 4000) {
  for (let elapsed = 0; elapsed < limitSeconds; elapsed += 1) {
    if (host.game.view(id).services[serviceId].open) return;
    host.tick(1);
  }
  throw new Error(`${serviceId} did not open`);
}

export function waitUntilDry(host, limitSeconds = 20000) {
  for (let elapsed = 0; elapsed < limitSeconds && host.game.weather().wet; elapsed += 1) host.tick(1);
}

// Drives the way a client does: short steps along straight legs, each one sent
// as an intent and each one checked by the simulation.
export function driveTo(host, id, points) {
  let waited = 0;
  for (const [tx, tz] of points) {
    for (let guard = 0; guard < 8000; guard += 1) {
      const car = host.game.view(id).self.driving;
      if (!car) throw new Error('not driving');
      const gap = Math.hypot(tx - car.x, tz - car.z);
      if (gap < 0.05) break;
      host.tick(0.1);
      const stride = Math.min(gap, vehicleSpeedAt(car.kind, car.x, car.z, host.game.weather().wet) * 0.1);
      const nx = car.x + ((tx - car.x) / gap) * stride;
      const nz = car.z + ((tz - car.z) / gap) * stride;
      // a careful driver: the horn clears the road ahead (see impact.js), and nobody is driven at who is still
      // in front, so these journeys strike nobody
      host.game.intent(id, { type: 'vehicle.horn' });
      const pop = host.game.internals.population, st = host.game.state;
      const ux = (tx - car.x) / gap, uz = (tz - car.z) / gap;
      const ahead = pop.within(`careful:${id}`, car.x + ux * 2.4, car.z + uz * 2.4, 2.2, st.t, st.real).filter((r) => r[3] !== 4 && r[3] !== 5);
      if (ahead.length && waited < 300) { waited += 1; continue; }
      waited = 0;
      const moved = host.game.intent(id, { type: 'vehicle.drive', x: nx, z: nz, heading: Math.atan2(tx - car.x, tz - car.z) });
      if (!moved.ok) throw new Error(`drive to (${nx.toFixed(1)}, ${nz.toFixed(1)}) rejected: ${moved.code} ${moved.message} ${JSON.stringify(host.game.state.impact.events.slice(-2))}`);
    }
  }
}
