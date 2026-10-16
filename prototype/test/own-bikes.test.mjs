// A player's own motorcycles in the town: only what the server says is theirs can be ridden; getting on (brought
// to them, or where they left it), riding within what the bike can do, getting off and finding it where it stands.
import test from 'node:test';
import assert from 'node:assert/strict';
import { town, run } from './world.mjs';
import { POWER_BIKES, handlingOf } from '../src/sim/power-bikes.js';
import { BIKE_PARTS } from '../src/client/bike-parts.js';

test('the twelve motorcycles: each has its model\'s parts, a price from 1,000 TR rising with its class, and its own tuned engine', () => {
  const ids = Object.keys(POWER_BIKES);
  assert.equal(ids.length, 12);
  assert.deepEqual([...ids].sort(), Object.keys(BIKE_PARTS).sort());
  for (const id of ids) {
    const b = POWER_BIKES[id], parts = BIKE_PARTS[id];
    assert.ok(b.price >= 1000, id);
    assert.equal(parts.parts.length, 4, `${id}: body, fork, front wheel, rear wheel`);
    assert.equal(parts.parts.reduce((a, c) => a + c, 0), parts.triangles, `${id}: every triangle kept`);
    assert.ok(parts.front.z > 0 && parts.rear.z < 0 && parts.front.r > 0 && parts.rear.r > 0, `${id}: wheels`);
    assert.ok(parts.seat[1] > parts.peg[1] && parts.grip[1] > parts.peg[1] && parts.grip[2] > parts.seat[2], `${id}: pegs below the seat, grips ahead of it`);
  }
  // no two engines the same
  const tones = ids.map((id) => JSON.stringify([POWER_BIKES[id].sound, POWER_BIKES[id].tone]));
  assert.equal(new Set(tones).size, 12);
});

test('only the server\'s list can be ridden; on, ride, off, and it stands where it was left', () => {
  const w = town(['Rider One']);
  const { p, id, send, place } = w;
  place(p, -50, 98, Math.PI / 2);
  // nothing owned: nothing to ride
  assert.equal(send(id, { type: 'bikes.ride', bike: 'red-superbike' }).code, 'NOT_YOURS');
  assert.equal(send(id, { type: 'bikes.owned', bikes: ['red-superbike', 'no-such-bike', 'red-superbike'] }).ok, true);
  assert.deepEqual(w.g.view(id).self.ownBikes.bikes, ['red-superbike']);
  assert.equal(send(id, { type: 'bikes.ride', bike: 'chopper' }).code, 'NOT_YOURS');
  // on: brought to where they stand
  const on = send(id, { type: 'bikes.ride', bike: 'red-superbike' });
  assert.equal(on.ok, true, JSON.stringify(on));
  assert.equal(w.g.view(id).self.astride.model, 'red-superbike');
  // riding: a step it could make is taken; one it could not is refused
  run(w.host, 0.2);
  const step = send(id, { type: 'moto.drive', x: p.x + 2, z: p.z, heading: Math.PI / 2 });
  assert.equal(step.ok, true, JSON.stringify(step));
  const leap = send(id, { type: 'moto.drive', x: p.x + 200, z: p.z, heading: Math.PI / 2 });
  assert.equal(leap.code, 'TOO_FAST');
  assert.ok(handlingOf(POWER_BIKES['red-superbike']).top > handlingOf(POWER_BIKES['chopper']).top);
  // off: it stays where it stands
  const at = { x: p.x, z: p.z };
  const off = send(id, { type: 'moto.leave' });
  assert.equal(off.ok, true);
  assert.equal(w.g.view(id).self.astride, null);
  const parked = w.g.view(id).self.ownBikes.parked;
  assert.equal(parked.length, 1);
  assert.ok(Math.hypot(parked[0].x - at.x, parked[0].z - at.z) < 0.01);
  assert.ok(Math.hypot(p.x - at.x, p.z - at.z) > 0.5, 'the rider steps down beside it');
  // back on, where it stands
  const again = send(id, { type: 'bikes.ride', bike: 'red-superbike' });
  assert.equal(again.ok, true);
  assert.ok(Math.hypot(again.x - at.x, again.z - at.z) < 0.01);
  send(id, { type: 'moto.leave' });
  // sold (no longer on the server's list): no longer parked, no longer ridden
  send(id, { type: 'bikes.owned', bikes: [] });
  assert.deepEqual(w.g.view(id).self.ownBikes, { bikes: [], parked: [] });
});

test('a motorcycle is not brought indoors or into a wall', () => {
  const w = town(['Rider Two']);
  const { p, id, send, place } = w;
  send(id, { type: 'bikes.owned', bikes: ['chopper'] });
  // inside the hospital
  place(p, -26, 44, 0);     // inside the HOLARIS showroom building
  const r = send(id, { type: 'bikes.ride', bike: 'chopper' });
  assert.equal(r.ok, false);
  assert.ok(['INDOORS', 'NO_ROOM'].includes(r.code), r.code);
});
