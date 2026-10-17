// The owner's vehicles of 17 October 2026 (supplied-vehicles.js): each where it belongs, the supplied file kept as it
// is, standing clear of the roads and of everything else, solid, and with room to walk round it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SUPPLIED_VEHICLES, SUPPLIED_VEHICLE_COLLIDERS, ZONE_ROADS, OUTSKIRT_ROADS, ZONE_COLLIDERS, ZONE_BUILDINGS, ZONE_SERVICES, AIRPORT, zoneWalkable, zoneSolid } from '../src/sim/zone.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const overlap = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1;

test('the four vehicles are the owner\'s files, each read from the game\'s assets and served beside the page under its own name', () => {
  const files = new Set();
  for (const v of Object.values(SUPPLIED_VEHICLES)) {
    const at = resolve(root, 'assets/vehicles/town', v.source);
    assert.ok(existsSync(at), `${v.source} is in assets/vehicles/town`);
    const bytes = readFileSync(at);
    assert.equal(bytes.readUInt32LE(0), 0x46546c67, `${v.source} is a GLB file`);
    assert.match(v.file, /^vehicle-[a-z-]+\.glb$/);
    files.add(v.file);
    assert.ok(v.length > 4 && v.length < 25 && v.width > 2 && v.height > 2, v.id);
    assert.ok(Math.abs(v.front) <= Math.PI, `${v.id}: its front is an angle`);
  }
  assert.equal(files.size, 4);
  // nothing claims a name or brand that is not the game's own
  for (const v of Object.values(SUPPLIED_VEHICLES)) assert.doesNotMatch(v.name, /Mercedes|Ford|Isuzu|Gulfstream|Learjet|Bombardier|Cessna/i);
});

test('the parked ones stand where they belong, square to the grid, off every road, clear of every wall, and solid', () => {
  const { jet, boxTruck, heavyTruck } = SUPPLIED_VEHICLES;
  // the jet on the middle stand, nose to the terminal, inside the apron
  assert.ok(AIRPORT.stands.some((s) => s.x === jet.x), 'the jet is on a stand');
  assert.equal(jet.heading, 0);
  assert.ok(jet.z + jet.length / 2 < AIRPORT.apron.z1 && jet.z - jet.length / 2 > AIRPORT.apron.z0, 'the jet is on the apron');
  // the box truck by the store, the heavy truck by the yard
  const store = ZONE_SERVICES.find((s) => s.id === 'store'), yard = ZONE_SERVICES.find((s) => s.id === 'yard');
  assert.ok(Math.hypot(boxTruck.x - store.x, boxTruck.z - store.z) < 25, 'the box truck is at the store');
  assert.ok(Math.hypot(heavyTruck.x - yard.x, heavyTruck.z - yard.z) < 30, 'the heavy truck is at the yard');
  for (const v of [jet, boxTruck, heavyTruck]) assert.ok(Math.abs(Math.sin(v.heading * 2)) < 1e-9, `${v.id} stands square to the grid`);
  // its boxes: none on a road, none into another collider (a wall, a tree, a building) nor into a building's footprint
  const others = ZONE_COLLIDERS.filter((c) => !SUPPLIED_VEHICLE_COLLIDERS.some((s) => s.x0 === c.x0 && s.z0 === c.z0 && s.x1 === c.x1 && s.z1 === c.z1));
  for (const b of SUPPLIED_VEHICLE_COLLIDERS) {
    for (const r of [...ZONE_ROADS, ...OUTSKIRT_ROADS]) assert.ok(!overlap(b, r), `${JSON.stringify(b)} is on ${r.id}`);
    for (const c of others) assert.ok(!overlap(b, c), `${JSON.stringify(b)} runs into ${JSON.stringify(c)}`);
    for (const k of ZONE_BUILDINGS) assert.ok(!overlap(b, { x0: k.x - k.w / 2, x1: k.x + k.w / 2, z0: k.z - k.d / 2, z1: k.z + k.d / 2 }), `${JSON.stringify(b)} is in ${k.id}`);
    // solid: nobody stands in it; and there is ground to walk on beside it, all round
    assert.ok(zoneSolid((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2));
  }
  for (const v of [boxTruck, heavyTruck]) {
    const along = Math.abs(Math.sin(v.heading)) > 0.5, hx = (along ? v.length : v.width) / 2 + 1.2, hz = (along ? v.width : v.length) / 2 + 1.2;
    for (const [dx, dz] of [[-hx, 0], [hx, 0], [0, -hz], [0, hz]]) assert.ok(zoneWalkable(v.x + dx, v.z + dz), `there is room to walk round ${v.id} at ${dx},${dz}`);
  }
  // under the jet's tailplane, between its engines and its wingtips, and in front of its nose, one can walk
  assert.ok(zoneWalkable(jet.x, jet.z + jet.length / 2 + 2));
  assert.ok(zoneWalkable(jet.x - jet.width / 2 - 1.5, jet.z));
  assert.ok(!zoneWalkable(jet.x, jet.z), 'not through its fuselage');
  assert.ok(!zoneWalkable(jet.x + jet.width / 2 - 1, jet.z - jet.length * 0.1), 'nor through its wing');
});
