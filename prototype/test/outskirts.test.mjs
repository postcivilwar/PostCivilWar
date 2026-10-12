// Beyond the town: the road to Onitsha, Atani Airport and the bridge, as the simulation knows them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { zoneWalkable, zoneGroundY, zoneSwimmable, BRIDGE, AIRPORT, ONITSHA_ROAD, OUTSKIRT_ROADS, OUTSKIRT_SIGNS, ZONE_ROADS, ZONE_BUILDINGS, ZONE } from '../src/sim/zone.js';
import { createHost } from '../src/sim/host.js';

const walkLine = (x0, z0, x1, z1, step = 0.5) => { const n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / step); for (let i = 0; i <= n; i += 1) { const x = x0 + ((x1 - x0) * i) / n, z = z0 + ((z1 - z0) * i) / n; if (!zoneWalkable(x, z)) return { x, z }; } return null; };

test('the Onitsha road leaves the town from Registry Road and can be walked to the road works', () => {
  const registry = ZONE_ROADS.find((r) => r.id === 'registry');
  assert.ok(ONITSHA_ROAD.x1 >= registry.x0 && ONITSHA_ROAD.z0 <= registry.z0 && ONITSHA_ROAD.z1 >= registry.z1, 'it carries straight on from Registry Road');
  assert.equal(walkLine(0, -40, -1180, -40), null, 'from the middle of town to the road works');
  assert.equal(zoneWalkable(-1187, -40), false, 'and no further');
  assert.equal(zoneWalkable(-700, -300 - 300), false, 'the bush beyond is not walked on');
});

test('the airport: in by its road, along the terminal, into the hall by a door, onto the airside only by the gate', () => {
  assert.equal(walkLine(-746, -50, -746, -199), null, 'down the airport road');
  assert.equal(walkLine(-746, -199, -930, -199), null, 'along the front of the terminal');
  for (const d of AIRPORT.terminal.doors) assert.equal(walkLine(d, -199, d, -240), null, `in at the door at ${d}`);
  assert.equal(walkLine(-900, -230, -800, -230), null, 'across the hall');
  assert.ok(walkLine(-875, -199, -875, -226), 'not through the glass between the doors');
  assert.ok(walkLine(-850, -240, -850, -270), 'not out of the back of the hall onto the apron');
  assert.ok(walkLine(-1000, -200, -1000, -300), 'not over the fence');
  assert.equal(walkLine(-683, -230, -683, -300), null, 'through the gate');
  assert.equal(walkLine(-683, -300, -850, -440), null, 'and out to the runway');
  assert.equal(OUTSKIRT_SIGNS.filter((s) => /AIRPORT/.test(s.lines.join(' '))).length >= 2, true);
});

test('the bridge: up from Waterside Road, over the river at 7 m, down to the far bank and its barrier', () => {
  const x = (BRIDGE.roadway.x0 + BRIDGE.roadway.x1) / 2;
  assert.equal(walkLine(x, 112, x, BRIDGE.end - 1), null, 'the whole way across');
  assert.ok(!zoneWalkable(x, BRIDGE.end + 0.5), 'and not past the barrier');
  // the deck's height: level on the road, rising without a step, flat over the water, down to the far bank
  let last = zoneGroundY(x, 100);
  assert.equal(last, 0);
  for (let z = 100; z < BRIDGE.end; z += 0.25) { const y = zoneGroundY(x, z); assert.ok(Math.abs(y - last) < 0.06, `a step at ${z}: ${last} to ${y}`); last = y; }
  assert.equal(zoneGroundY(x, 225), BRIDGE.height);
  assert.ok(zoneSwimmable(x, 170) && zoneGroundY(x, 170) > 5, 'the river is under it');
  assert.equal(zoneGroundY(x, BRIDGE.end - 2), BRIDGE.farBank);
  // the rails, and the sides of the embankment: nobody steps off, nobody climbs on from the beach
  assert.ok(walkLine(x, 225, x - 12, 225), 'off the side over the water');
  assert.ok(walkLine(-230, 130, -190, 130), 'across the embankment from the beach');
  assert.equal(zoneGroundY(-230, 130), 0);
});

test('it is not the First Niger Bridge, and says so nowhere', () => {
  for (const s of OUTSKIRT_SIGNS) assert.ok(!/first niger|bridge head|onitsha bridge/i.test(s.lines.join(' ')), s.lines.join(' '));
  assert.ok(!/first/i.test(BRIDGE.name));
});

test('a player walks out on the bridge, is carried at its height, and cannot swim from the deck', () => {
  const host = createHost();
  const g = host.game;
  const id = g.join({ name: 'Bridge Test', look: {} });
  const p = g.state.players[id];
  p.x = -205; p.z = 225;
  const v = g.view(id).self;
  assert.equal(v.byWater, false, 'no swim offered on the deck');
  const r = g.intent(id, { type: 'swim.in' });
  assert.equal(r.ok, false);
});

test('the town is as it was: no building, road or tree of it moved by what is beyond it', () => {
  assert.equal(ZONE.bounds.minX, -250);
  for (const r of OUTSKIRT_ROADS) for (const b of ZONE_BUILDINGS) assert.ok(r.x1 < b.x - b.w / 2 || r.x0 > b.x + b.w / 2 || r.z1 < b.z - b.d / 2 || r.z0 > b.z + b.d / 2, `${r.id} over ${b.id}`);
});
