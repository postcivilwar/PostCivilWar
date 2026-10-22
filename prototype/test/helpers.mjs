import { createHost } from '../src/sim/host.js';
import { ZONE_NODES, zoneService, zoneParcelByPlot, zoneSiteLayout, ZONE_MOULD_STATIONS } from '../src/sim/zone.js';
import { shortestRoute, nearestNode } from '../src/sim/graph.js';
import { SPEED } from '../src/sim/sim.js';
import { vehicleSpeedAt } from '../src/sim/vehicles.js';

// (`people`: who lives in the town, where it is not the town's own: FORMER_TOWN below)
export function newWorld(name = 'Amara Test', { people = undefined } = {}) {
  const host = createHost({ people });
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
      // stepped round someone, and now against something solid (a bollard, a post): back toward the line being
      // walked, as a client's player would be steered (the way between two points of the route is clear)
      if (moved.code === 'BLOCKED' && blocked < 400) {
        blocked += 1;
        const [lx, lz] = points[Math.max(0, points.indexOf(points.find((q) => q[0] === tx && q[1] === tz)) - 1)] || [start.x, start.z];
        const vx = tx - lx, vz = tz - lz, len = Math.hypot(vx, vz) || 1;
        const along = ((me.x - lx) * vx + (me.z - lz) * vz) / (len * len);
        const px = lx + vx * along, pz = lz + vz * along, off = Math.hypot(px - me.x, pz - me.z);
        if (off > 0.05) {
          const step = Math.min(off, stride);
          const sx = me.x + ((px - me.x) / off) * step, sz = me.z + ((pz - me.z) / off) * step;
          if (host.game.intent(id, { type: 'move', x: sx, z: sz, heading: Math.atan2(sx - me.x, sz - me.z), run: true }).ok) continue;
        }
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

// Money for a test that needs more than the arrival money: put into the character's wallet as the bank would
// put it there (the bank's side of this world's money: sim/bank.js). `sats` is what the tests have always
// asked for; two of them are one ledger unit, so 100,000 are 25,000 TR.
export function fund(host, id, sats = 100_000) {
  // (the tests were written when funds took twenty-four seconds to arrive, and some count on the town having
  // moved on by then: the same time is let pass)
  run(host, 24);
  const have = host.game.view(id).self.balance;
  const cowries = Math.floor(sats * 0.5);
  const done = host.bank.align(id, have + cowries + host.bank.report(id).spent - host.bank.report(id).earned, 'Test funds');
  if (!done.ok) throw new Error(done.message);
  return { cowries };
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

// The town as it was until 22 October 2026, when every townsperson was taken out of the game but the police (the
// owner's brief): a thousand people by job (with the sixteen named residents). The tests of the townspeople's own
// systems (their days, their dress, their talk, the okadas, what happens when one of them is struck or run down) are
// run with it, so that those systems stay working and ready for the owner's own models of townspeople. The town
// itself is ZONE_POPULATION (src/sim/zones/atani.js).
export const FORMER_TOWN = Object.freeze([
  ['infant', 90, 'home'], ['pupil', 150, 'primary'], ['student', 120, 'secondary'],
  ['undergrad', 50, 'university'], ['undergrad', 35, 'polytechnic'], ['undergrad', 25, 'college'],
  ['headteacher', 1, 'primary'], ['teacher', 12, 'primary'], ['schoolstaff', 5, 'primary'],
  ['principal', 1, 'secondary'], ['teacher', 14, 'secondary'], ['labtech', 1, 'secondary'], ['schoolstaff', 5, 'secondary'],
  ['lecturer', 7, 'university'], ['officer', 3, 'university'], ['librarian', 1, 'university'], ['guard', 1, 'university'],
  ['lecturer', 4, 'polytechnic'], ['officer', 1, 'polytechnic'], ['guard', 1, 'polytechnic'],
  ['lecturer', 3, 'college'], ['officer', 1, 'college'],
  ['doctor', 5, 'hospital'], ['nurse', 12, 'hospital'], ['pharmacist', 2, 'hospital'], ['labscientist', 1, 'hospital'], ['records', 4, 'hospital'], ['cleaner', 3, 'hospital'], ['guard', 2, 'hospital'], ['ambulance', 1, 'hospital'],
  ['priest', 2, 'catholic'], ['catechist', 1, 'catholic'], ['sexton', 1, 'catholic'], ['churchworker', 2, 'catholic'],
  ['vicar', 1, 'anglican'], ['churchworker', 3, 'anglican'],
  ['trader', 60, 'market'],
  ['tailor', 8, 'street'], ['barber', 8, 'street'], ['mechanic', 6, 'street'], ['carpenter', 6, 'street'], ['welder', 4, 'street'], ['foodvendor', 10, 'street'], ['baker', 2, 'street'],
  ['farmer', 45, 'farm'], ['fisher', 25, 'shore'],
  ['okada', 26, 'park'], ['driver', 12, 'park'],
  ['police', 6, 'police'], ['clerk', 8, 'secretariat'], ['cleaner', 2, 'secretariat'],
  ['labourer', 24, 'yard'], ['apprentice', 16, 'street'], ['hawker', 25, 'street'],
  ['unemployed', 45, 'street'], ['retiree', 45, 'home'], ['homemaker', 30, 'home'],
].map(Object.freeze));
