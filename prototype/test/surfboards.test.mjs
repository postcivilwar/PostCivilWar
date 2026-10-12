import test from 'node:test';
import assert from 'node:assert/strict';
import { SURFBOARDS, HANDLING, maySurf, stepSurfboard, leaveBoard } from '../src/sim/surfboards.js';
import { zoneSwimmable } from '../src/sim/zone.js';

test('no surfboard is offered until one has been supplied, and nobody may surf without owning one', () => {
  assert.deepEqual(Object.keys(SURFBOARDS), []);
  assert.equal(maySurf({ swimming: { since: 0 } }).code, 'NO_BOARD');
  assert.equal(maySurf({ swimming: null }, { owns: true }).code, 'NOT_IN_WATER');
  assert.equal(maySurf({ swimming: { since: 0 } }, { owns: true }).ok, true);
});

test('on the river a board is paddled up to speed, turns by leaning and stops at the bank', () => {
  const s = { x: 0, z: 175, heading: 0, speed: 0, lean: 0 };
  for (let i = 0; i < 300; i += 1) stepSurfboard(s, { paddle: 1 }, 1 / 60, { inWater: () => true });
  assert.ok(s.speed > 2 && s.speed <= HANDLING.top, `${s.speed}`);
  const turned = { ...s };
  for (let i = 0; i < 60; i += 1) stepSurfboard(turned, { paddle: 1, steer: 1 }, 1 / 60, { inWater: () => true });
  assert.ok(turned.heading < s.heading - 0.2, 'leaning right turns it right');
  // heading for the bank (grid -z is inland): it stops there
  const bank = { x: 0, z: 158, heading: Math.PI, speed: 3, lean: 0 };
  assert.ok(zoneSwimmable(bank.x, bank.z), 'it starts in the water');
  for (let i = 0; i < 300; i += 1) stepSurfboard(bank, { paddle: 1 }, 1 / 60, { inWater: zoneSwimmable });
  assert.ok(zoneSwimmable(bank.x, bank.z), 'still in the water');
  assert.equal(bank.speed, 0);
});

test('off the board: swimming in open water, on the bank beside it', () => {
  assert.equal(leaveBoard({ x: 0, z: 200 }, { toBank: () => 40 }).mode, 'swimming');
  assert.equal(leaveBoard({ x: 0, z: 152 }, { toBank: () => 1 }).mode, 'walking');
});
