// On the water (31 October 2026, stage 4 of the owner's brief of 30 October): the speedboat, the three naval ships, and
// the waves the town's swimmers in swimwear may surf. How each goes, where each may go, and who may surf.
import test from 'node:test';
import assert from 'node:assert/strict';
import { BOAT_HANDLING, stepBoat, boatStep } from '../src/sim/boat-ride.js';
import { boatWater, hullClear, BOATING } from '../src/sim/own-boats.js';
import { NAVAL, NAVAL_ROUND, onRound, shipWater } from '../src/sim/naval.js';
import { SURF, wavesAt, waveAt, surfHeight, catchable, maySurf } from '../src/sim/surf.js';
import { ZONE_JETTY, zoneShoreZ, BRIDGE } from '../src/sim/zone.js';

const kmh = (v) => v * 3.6;
const run = (id, seconds, input) => { const s = { speed: 0, side: 0, heading: 0, yaw: 0, steer: 0, bank: 0, pitch: 0 }; let peakBow = 0; for (let t = 0; t < seconds; t += 1 / 60) { stepBoat(s, input, 1 / 60, { handling: BOAT_HANDLING[id] }); peakBow = Math.max(peakBow, s.pitch); } return { s, peakBow }; };

test('the speedboat: 60 km/h flat out, quick to it, its bow up as it climbs onto the plane, stopped by its motor astern', () => {
  const { s, peakBow } = run('speedboat', 40, { throttle: 1 });
  assert.ok(Math.abs(kmh(s.speed) - 60) < 1.5, `${kmh(s.speed)} km/h`);
  let t50 = 0; { const q = { speed: 0, side: 0, heading: 0, yaw: 0, steer: 0, bank: 0, pitch: 0 }; while (kmh(q.speed) < 50 && t50 < 30) { stepBoat(q, { throttle: 1 }, 1 / 60, { handling: BOAT_HANDLING.speedboat }); t50 += 1 / 60; } }
  assert.ok(t50 > 3 && t50 < 10, `50 km/h in ${t50} s`);
  assert.ok(peakBow > 0.06 && peakBow < 0.2, `the bow up ${peakBow}`);
  assert.ok(s.pitch < peakBow * 0.6, 'and down again on the plane');
  // full lock at speed: it turns, banked into the turn, its stern sliding out
  for (let i = 0; i < 180; i += 1) stepBoat(s, { throttle: 1, steer: 1 }, 1 / 60, { handling: BOAT_HANDLING.speedboat });
  assert.ok(s.yaw < -0.2 && s.bank > 0.05 && Math.abs(s.side) > 0.2, JSON.stringify(s));
  // astern: stopped within 40 m; with the throttle shut it runs on far further
  const a = { ...s, yaw: 0, steer: 0 }; let gone = 0; while (a.speed > 0.05) { stepBoat(a, { brake: 1 }, 1 / 60, { handling: BOAT_HANDLING.speedboat }); gone += a.speed / 60; }
  assert.ok(gone < 40, `stopped in ${gone} m`);
  // at a standstill the wheel does not turn it
  const still = run('speedboat', 2, { steer: 1 }).s;
  assert.ok(Math.abs(still.heading) < 0.05);
});

test('a naval ship: slow to gather way and slow to turn, 22 km/h at most', () => {
  const { s } = run('naval-ship', 240, { throttle: 1 });
  assert.ok(Math.abs(kmh(s.speed) - 22.3) < 1, `${kmh(s.speed)}`);
  const early = run('naval-ship', 20, { throttle: 1 }).s;
  assert.ok(kmh(early.speed) < 12, 'a long while to gather way');
  const step = boatStep({ speed: 2, side: 0, heading: Math.PI / 2 }, 1);
  assert.ok(Math.abs(step.dx - 2) < 1e-9 && Math.abs(step.dz) < 1e-9);
});

test('where a boat may go: the river along the town, between the bridge\'s piers, not onto the bank, the jetty, a pier or the far bank', () => {
  assert.ok(boatWater(100, 220) && boatWater(-500, 220) && boatWater(500, 280));
  assert.ok(!boatWater(100, zoneShoreZ(100) + 0.5), 'not up against the bank');
  assert.ok(!boatWater(21, 160), 'not in the jetty');
  assert.ok(!boatWater(-205, BRIDGE.piers[2]), 'not in a pier');
  assert.ok(boatWater(-205, (BRIDGE.piers[1] + BRIDGE.piers[2]) / 2), 'between two piers, under the deck');
  assert.ok(!boatWater(-205, 170), 'not into the bridge\'s approach');
  assert.ok(!boatWater(0, 299), 'not onto the far bank');
  // off the jetty's end and alongside it, a boat fits
  assert.ok(hullClear((ZONE_JETTY.x0 + ZONE_JETTY.x1) / 2, ZONE_JETTY.z1 + 4.5, 0));
  assert.ok(hullClear(ZONE_JETTY.x1 + 2.2, 170, 0));
  // a ship's hull in the way is not gone through
  assert.ok(!hullClear(100, 220, 0, [{ x: 100, z: 221, r: 9 }]));
  assert.ok(BOATING.x1 > 500 && BOATING.x0 < -600);
});

test('the three naval ships go round their patrol: always on the river, upriver of the bridge, a third of the round apart', () => {
  assert.equal(NAVAL.count, 3);
  for (let s = 0; s < NAVAL_ROUND; s += 3) {
    const p = onRound(s);
    assert.ok(shipWater(p.x, p.z), `on the river at ${s}`);
    assert.ok(p.x - NAVAL.length / 2 > BRIDGE.x1 + 20, 'never near the bridge');
    // clear of the jetty's end
    if (Math.abs(p.x - ZONE_JETTY.x0) < NAVAL.length) assert.ok(p.z - NAVAL.beam / 2 > ZONE_JETTY.z1 + 3);
  }
  // upriver on the far side (a vessel keeps to its right), down on the town's side
  assert.ok(onRound(10).z > onRound(NAVAL_ROUND / 2 + 10).z);
  assert.ok(Math.abs(onRound(10).h - Math.PI / 2) < 1e-9);
});

test('surfing: only in swimwear and with a board of one\'s own; the waves come in in sets, build, stand up and break near the bank', () => {
  assert.equal(maySurf({ figure: 'W10' }, true).ok, true);
  assert.equal(maySurf({ figure: 'W11' }, true).ok, true);
  assert.equal(maySurf({ figure: 'W3' }, true).code, 'CLOTHES', 'anyone else is told what they wear will not do');
  assert.equal(maySurf({ figure: 'W10' }, false).code, 'NO_BOARD');
  // the waves come and go, and every copy of the town has the same at the same moment
  let seen = 0, broke = 0, tallest = 0;
  for (let t = 0; t < 120; t += 0.5) {
    const ws = wavesAt(t);
    seen = Math.max(seen, ws.length);
    for (const w of ws) { const a = waveAt(w, 120); tallest = Math.max(tallest, a.height); if (a.state === 'foam') broke += 1; }
  }
  assert.ok(seen >= 1 && seen <= 3, `${seen} at once`);
  assert.ok(broke > 0, 'they break');
  assert.ok(tallest > 0.8 && tallest <= SURF.high * 1.01, `${tallest} m at their highest`);
  assert.deepEqual(wavesAt(37.5), wavesAt(37.5));
  // the water stands up only where they come in: not west of the jetty, not out on the river, not by the bridge
  let up = 0;
  for (let t = 0; t < 30; t += 0.5) up = Math.max(up, surfHeight(120, 165, t));
  assert.ok(up > 0.4);
  for (let t = 0; t < 30; t += 0.5) { assert.equal(surfHeight(-100, 165, t), 0); assert.equal(surfHeight(120, 230, t), 0); }
  // a wave comes up behind a board lying off the bank often enough to be caught
  let chances = 0;
  for (let t = 0; t < 120; t += 0.25) if (catchable(120, 161, t)) chances += 1;
  assert.ok(chances >= 8, `${chances} quarter-seconds in two minutes`);
});
