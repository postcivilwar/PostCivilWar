// Surfing in the game (31 October 2026, stage 4 of the owner's brief of 30 October: "incorporate a realistic surf feature
// for certain characters in bikinis, and ensure heavy clothing users can't surf"; at 22:01: "NOBODY SHould surf at the
// lagoon beach, only surf at the river by town"): who may, where, lying on the board paddling, standing up on a wave
// coming up behind, riding it in, down on the board again, off it, and others seeing a surfer.
import test from 'node:test';
import assert from 'node:assert/strict';
import { town, run } from './world.mjs';
import { SURF, catchable, crestOf } from '../src/sim/surf.js';
import { SURFING } from '../src/sim/surfing.js';
import { zoneShoreZ, zoneSwimmable, zoneWalkable } from '../src/sim/zone.js';
import { encodePlayer, decodePlayer } from '../src/net/link.js';

const X = 120;                                   // a place along the bank where the waves come in
const bankAt = (x) => ({ x, z: zoneShoreZ(x) - 1.5 });
const waveClock = (w) => w.g.state.t / 30;       // (a copy of the town with no wall clock runs at thirty times)
function surfer(name = 'Surf Tester', figure = 'W10') {
  const w = town([name]);
  w.p.look = { ...w.p.look, figure };
  w.send(w.id, { type: 'sports.owned', items: ['surfboard'] });
  const b = bankAt(X);
  w.place(w.p, b.x, b.z, 0);
  return w;
}
const step = (w, x, z, heading, dt = 0.25, rest = {}) => { run(w.host, dt); return w.send(w.id, { type: 'moto.drive', x, z, heading, ...rest }); };

test('only in swimwear, with a board of one\'s own, and only where the waves come in along the town\'s bank', () => {
  // dressed for the street: told so
  const street = surfer('Street Clothes', 'W3');
  const no = street.send(street.id, { type: 'surf.out' });
  assert.equal(no.code, 'CLOTHES');
  assert.match(no.message, /swimwear/);
  // no board
  const w = town(['No Board']);
  w.p.look = { ...w.p.look, figure: 'W11' };
  const b = bankAt(X);
  w.place(w.p, b.x, b.z, 0);
  assert.equal(w.send(w.id, { type: 'surf.out' }).code, 'NO_BOARD');
  // in swimwear, with a board, but west of the jetty (no waves there), and up in the town
  const s = surfer('Bikini Surfer', 'W10');
  const west = bankAt(-60);
  s.place(s.p, west.x, west.z, 0);
  assert.equal(s.send(s.id, { type: 'surf.out' }).code, 'NO_WAVES');
  s.place(s.p, X, 40, 0);
  assert.equal(s.send(s.id, { type: 'surf.out' }).code, 'TOO_FAR');
  // at the water's edge where the waves come in: out on it, lying on it
  s.place(s.p, bankAt(X).x, bankAt(X).z, 0);
  const out = s.send(s.id, { type: 'surf.out' });
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(s.p.astride, 'sf:surfboard');
  assert.equal(s.g.view(s.id).self.astride.surf.mode, 'lie');
  assert.ok(zoneSwimmable(s.p.x, s.p.z));
});

test('lying on it: paddled no faster than a paddler, never onto the bank; standing up only on a wave coming up behind, the board facing the bank', () => {
  const w = surfer();
  assert.equal(w.send(w.id, { type: 'surf.out' }).ok, true);
  const p = w.p;
  // paddled out, a metre and a bit a second
  for (let k = 0; k < 8; k += 1) assert.equal(step(w, p.x, p.z + 0.3, 0).ok, true);
  assert.equal(step(w, p.x, p.z + 3, 0).code, 'TOO_FAST');
  // not up onto the bank
  p.psurf.z = zoneShoreZ(p.x) + 0.8; p.z = p.psurf.z;
  assert.equal(step(w, p.x, zoneShoreZ(p.x) - 0.6, Math.PI, 1).code, 'BLOCKED');
  // facing out to the river: not stood up, whatever the waves are doing
  assert.equal(w.send(w.id, { type: 'surf.stand' }).code, 'NOT_FACING');
  // turned to the bank, out where the waves stand up (eight to twelve metres out), waiting for one
  const at = { x: X, z: zoneShoreZ(X) + 12 };
  p.psurf.x = at.x; p.psurf.z = at.z; p.x = at.x; p.z = at.z;
  assert.equal(step(w, at.x, at.z, Math.PI, 0.2).ok, true);
  let tries = 0;
  while (!catchable(at.x, at.z, waveClock(w)) && tries < 600) { if (tries === 2 && !catchable(at.x, at.z, waveClock(w) - SURFING.late)) assert.equal(w.send(w.id, { type: 'surf.stand' }).code, 'NO_WAVE'); run(w.host, 0.1); tries += 1; }
  assert.ok(catchable(at.x, at.z, waveClock(w)), 'a wave comes up behind within a minute');
  const up = w.send(w.id, { type: 'surf.stand' });
  assert.equal(up.ok, true, JSON.stringify(up));
  assert.equal(w.g.view(w.id).self.astride.surf.mode, 'ride');
  // ridden in on its face, and across it: as fast as a wave carries a board, faster than paddling
  let x = at.x, z = at.z, rode = 0, lastMode = 'ride';
  for (let k = 0; k < 40 && lastMode === 'ride'; k += 1) {
    run(w.host, 0.2);
    const crest = crestOf(up.wave, x + 1, waveClock(w));
    if (crest === null) break;
    const nz = Math.min(z, crest - 1.9);
    if (nz - zoneShoreZ(x + 1) < 2.4) break;
    const r = w.send(w.id, { type: 'moto.drive', x: x + 1, z: nz, heading: Math.PI - 0.5, speed: 5 });
    assert.equal(r.ok, true, JSON.stringify(r));
    rode += Math.hypot(1, nz - z); x += 1; z = nz; lastMode = r.mode;
  }
  assert.ok(rode > 8, `rode ${rode.toFixed(1)} m on the wave`);
  // the wave gone on from under the board: down on it again
  for (let k = 0; k < 120 && w.g.view(w.id).self.astride.surf.mode === 'ride'; k += 1) { run(w.host, 0.5); step(w, p.x, p.z, Math.PI, 0); }
  assert.equal(w.g.view(w.id).self.astride.surf.mode, 'lie');
});

test('off the board: into the water out on the river, onto the bank near it; the board goes with them; others see a surfer', () => {
  const w = surfer('Surf Leaver', 'W11');
  assert.equal(w.send(w.id, { type: 'surf.out' }).ok, true);
  const p = w.p;
  // what the others see
  step(w, p.x, p.z + 0.3, 0, 0.25, { speed: 1.2, lean: 0, phase: 0.6 });
  const sent = encodePlayer(w.g.view(w.id).self, 'z');
  assert.deepEqual(sent.sf, { m: 0, l: 0, s: 1.2, ph: 0.6 });
  assert.equal(sent.vh, undefined, 'not taken for an okada');
  const back = decodePlayer(JSON.parse(JSON.stringify(sent)), 'z');
  const other = town(['Beach Watcher']);
  other.place(other.p, p.x, p.z - 8, 0);
  assert.ok(other.g.visitors.seen('surfer-1', back));
  const seen = other.g.view(other.id).players.find((o) => o.visitor);
  assert.equal(seen.surf.mode, 'lie');
  // out on the water: into it
  p.psurf.z = zoneShoreZ(p.x) + 14; p.z = p.psurf.z;
  const swim = w.send(w.id, { type: 'moto.leave' });
  assert.equal(swim.into, 'water');
  assert.ok(p.swimming && !p.astride);
  // and from the water back onto it there (the waves come in here)
  assert.equal(w.send(w.id, { type: 'surf.out' }).ok, true);
  // near the bank: onto it
  p.psurf.z = zoneShoreZ(p.x) + 1.2; p.z = p.psurf.z;
  const off = w.send(w.id, { type: 'moto.leave' });
  assert.equal(off.into, 'land');
  assert.ok(zoneWalkable(p.x, p.z) && !p.swimming);
  assert.ok(SURFING.ashore > 1 && SURF.x0 > 24, 'the waves are east of the jetty');
});
