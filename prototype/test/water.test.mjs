// On the River Niger by the town, in the game (31 October 2026, stage 4 of the owner's brief of 30 October: "the navel
// ship should be only 3 in number and not for sale, it should be on the river, driven by NPCs, but can still be
// hijacked ... Once a user buys a boat or any item, it is theirs and cannot be resold if hijacked"): the speedboat taken
// out by whoever owns it, driven, brought in, moored and got into again, gone over the side of; the navy's three ships on
// patrol, boarded from a boat or the water, the police told, steered, left; the police giving one back; other players'
// boats seen out on the river.
import test from 'node:test';
import assert from 'node:assert/strict';
import { town, run, officerOnScene } from './world.mjs';
import { ZONE_JETTY, zoneShoreZ, zoneSwimmable, zoneWalkable } from '../src/sim/zone.js';
import { hullClear, BOATING } from '../src/sim/own-boats.js';
import { NAVAL, onRound } from '../src/sim/naval.js';
import { encodePlayer, decodePlayer } from '../src/net/link.js';

// a step of the boat or the ship, as the page sends it: `metres` on along its heading, after `dt` seconds
function step(w, id, p, metres, { dt = 0.25, heading = p.heading, ...rest } = {}) {
  run(w.host, dt);
  return w.send(id, { type: 'moto.drive', x: p.x + Math.sin(heading) * metres, z: p.z + Math.cos(heading) * metres, heading, speed: metres / dt, throttle: 1, ...rest });
}
const onJetty = () => ({ x: (ZONE_JETTY.x0 + ZONE_JETTY.x1) / 2, z: ZONE_JETTY.z1 - 6 });

test('the speedboat: only its owner\'s; taken out from the jetty; driven on the river, never into the jetty or the bank', () => {
  const w = town(['Boat Owner']);
  const { p, id, send } = w;
  const j = onJetty();
  w.place(p, j.x, j.z, 0);
  assert.equal(send(id, { type: 'boats.launch' }).code, 'NOT_YOURS');
  send(id, { type: 'sports.owned', items: ['speedboat'] });
  // from up in the town: not here
  w.place(p, 0, 0, 0);
  assert.equal(send(id, { type: 'boats.launch' }).code, 'NO_WATER');
  w.place(p, j.x, j.z, 0);
  const out = send(id, { type: 'boats.launch' });
  assert.equal(out.ok, true, JSON.stringify(out));
  const self = w.g.view(id).self;
  assert.equal(self.astride.boat, 'speedboat');
  assert.ok(hullClear(out.x, out.z, out.h), 'in the water, clear of the jetty');
  assert.ok(Math.abs(out.x - j.x) < 6, 'beside the jetty');
  // out into the river: on, steadily, as fast as it goes
  for (let k = 0; k < 12; k += 1) { const r = step(w, id, p, 3, { dt: 0.25 }); assert.equal(r.ok, true, JSON.stringify(r)); }
  assert.ok(p.z > out.z + 30);
  // faster than it can go: refused
  assert.equal(step(w, id, p, 30, { dt: 0.25 }).code, 'TOO_FAST');
  // into the bank: refused (turned round toward it, a long step at a time)
  let blocked = false;
  for (let k = 0; k < 40 && !blocked; k += 1) { const r = step(w, id, p, 3, { heading: Math.PI }); if (!r.ok) { blocked = r.code === 'BLOCKED'; break; } }
  assert.ok(blocked, 'stopped short of the bank');
  assert.ok(p.z > zoneShoreZ(p.x) + BOATING.edge, `still in the water at ${p.z.toFixed(1)}`);
  // what others see: the boat, and what it is doing
  const sent = encodePlayer(w.g.view(id).self, 'z');
  assert.equal(sent.bt.i, 'speedboat');
  assert.equal(sent.vh, undefined, 'not taken for an okada');
});

test('brought in to the bank, the player steps ashore and it is left moored; into it again from beside it; over the side out on the water', () => {
  const w = town(['Boat Mooring']);
  const { p, id, send } = w;
  send(id, { type: 'sports.owned', items: ['speedboat'] });
  const j = onJetty();
  w.place(p, j.x, j.z, 0);
  assert.equal(send(id, { type: 'boats.launch' }).ok, true);
  // well out on the river (beyond where anyone can swim): no getting out there
  p.pboat.x = 60; p.pboat.z = 240; p.x = 60; p.z = 240;
  assert.equal(send(id, { type: 'moto.leave' }).code, 'TOO_FAR');
  // in by the bank: ashore
  const bankZ = zoneShoreZ(60) + BOATING.edge + 1.6;
  p.pboat.x = 60; p.pboat.z = bankZ; p.x = 60; p.z = bankZ;
  const off = send(id, { type: 'moto.leave' });
  assert.equal(off.ok, true, JSON.stringify(off));
  assert.equal(off.into, 'land');
  assert.ok(zoneWalkable(p.x, p.z) && !p.astride);
  const moored = w.g.view(id).self.ownBoats.moored;
  assert.equal(moored.length, 1);
  assert.ok(Math.abs(moored[0].z - bankZ) < 0.01);
  // told to others, near them
  assert.deepEqual(encodePlayer(w.g.view(id).self, 'z').pb.map((b) => b[0]), ['speedboat']);
  // back into it where it is
  const back = send(id, { type: 'boats.launch' });
  assert.equal(back.ok, true);
  assert.ok(Math.abs(back.z - bankZ) < 0.01, 'the same boat, where it was');
  // out on the water by the town, over the side into the river
  p.pboat.z = 176; p.z = 176;
  const swim = send(id, { type: 'moto.leave' });
  assert.equal(swim.into, 'water', JSON.stringify(swim));
  assert.ok(p.swimming && zoneSwimmable(p.x, p.z));
  // and from the water back into it
  assert.equal(send(id, { type: 'boats.launch' }).ok, true);
  assert.ok(!p.swimming && p.astride === 'bt:speedboat');
});

test('sold: no longer theirs, it is no longer moored anywhere, and they are put ashore if aboard', () => {
  const w = town(['Boat Seller']);
  const { p, id, send } = w;
  send(id, { type: 'sports.owned', items: ['speedboat', 'bicycle'] });
  const j = onJetty();
  w.place(p, j.x, j.z, 0);
  assert.equal(send(id, { type: 'boats.launch' }).ok, true);
  send(id, { type: 'sports.owned', items: ['bicycle'] });
  assert.ok(!p.astride && !p.pboat);
  assert.equal(w.g.view(id).self.ownBoats.moored.length, 0);
});

test('the navy\'s three ships on patrol: boarded from a boat alongside, the police told; steered as a ship; left into the boat', () => {
  const w = town(['Ship Taker']);
  const { p, id, send } = w;
  const ships = w.g.view(id).naval;
  assert.equal(ships.length, 3);
  assert.ok(ships.every((s) => s.mode === 'patrol'));
  // nobody may take one from the bank, on foot
  assert.equal(send(id, { type: 'naval.take' }).code, 'NOT_ON_WATER');
  send(id, { type: 'sports.owned', items: ['speedboat'] });
  const j = onJetty();
  w.place(p, j.x, j.z, 0);
  assert.equal(send(id, { type: 'boats.launch' }).ok, true);
  // alongside one: four metres off its side
  const s0 = w.I.naval.ships()[0];
  const side = { x: Math.cos(s0.h), z: -Math.sin(s0.h) };
  const at = { x: s0.x + side.x * (NAVAL.beam / 2 + 4), z: s0.z + side.z * (NAVAL.beam / 2 + 4) };
  p.pboat.x = at.x; p.pboat.z = at.z; p.x = at.x; p.z = at.z;
  const took = send(id, { type: 'naval.take' });
  assert.equal(took.ok, true, JSON.stringify(took));
  assert.equal(took.n, s0.n);
  assert.equal(p.astride, `nv:${s0.n}`);
  assert.equal(w.g.view(id).self.astride.ship, s0.n);
  assert.equal(s0.mode, 'taken');
  assert.equal(w.g.state.justice.crimes[took.crime].type, 'vehicle_theft', 'taking it is a crime');
  // the boat left alongside, moored where it was
  assert.equal(w.g.view(id).self.ownBoats.moored.length, 1);
  // steered: a ship's speed at most; on into the river, not into the shallows
  for (let k = 0; k < 6; k += 1) assert.equal(step(w, id, p, 1.2, { dt: 0.25, heading: s0.h }).ok, true);
  assert.equal(step(w, id, p, 8, { dt: 0.25, heading: s0.h }).code, 'TOO_FAST');
  assert.ok(Math.hypot(s0.x - p.x, s0.z - p.z) < 0.01, 'the town has the ship where the player has it');
  // what others see: a ship under them
  assert.equal(encodePlayer(w.g.view(id).self, 'z').bt.i, 'naval-ship');
  // left: down into the boat alongside; the ship lies where it is
  const off = send(id, { type: 'moto.leave' });
  assert.equal(off.ok, true, JSON.stringify(off));
  assert.equal(off.into, 'boat');
  assert.equal(p.astride, 'bt:speedboat');
  assert.equal(s0.mode, 'kept');
  // and aboard it again: no new crime
  p.pboat.x = at.x; p.pboat.z = at.z; p.x = at.x; p.z = at.z;
  const again = send(id, { type: 'naval.take' });
  assert.equal(again.ok, true, JSON.stringify(again));
  assert.equal(again.crime, null);
});

test('a ship climbed aboard out of every officer\'s sight is no crime to the police (31 October 2026): the navy are not the police', () => {
  const w = town(['Ship Swimmer']);
  const { p, id, send } = w;
  // a ship on its leg down the town's side, far out from the bank (48 m), with a swimmer beside it
  const s1 = w.I.naval.ships().find((s) => s.z < 220) || w.I.naval.ships()[1];
  Object.assign(s1, onRound(NAVAL.x1 - NAVAL.x0 + Math.PI * ((NAVAL.up - NAVAL.down) / 2) + 300));
  s1.mode = 'patrol';
  const x = s1.x, z = Math.min(183, s1.z - NAVAL.beam / 2 - 3);
  w.place(p, x, z, 0);
  p.swimming = { since: w.g.state.real };
  const took = send(id, { type: 'naval.take' });
  assert.equal(took.ok, true, JSON.stringify(took));
  const crime = w.g.state.justice.crimes[took.crime];
  assert.equal(crime.detection, 'unseen');
  run(w.host, 10);
  assert.equal(p.law.state, 'normal');
  assert.equal(w.g.view(id).self.law.stars, 0);
});

test('from the water a swimmer climbs aboard a ship on the town\'s side of the river, seen from the jetty by an officer; caught by the police, the ship goes back to the navy and its patrol', () => {
  const w = town(['Ship Swimmer']);
  const { p, id, send } = w;
  // a ship on its leg down the town's side, passing the end of the jetty, with a swimmer beside it
  const s1 = w.I.naval.ships().find((s) => s.z < 220) || w.I.naval.ships()[1];
  Object.assign(s1, onRound(NAVAL.x1 - NAVAL.x0 + Math.PI * ((NAVAL.up - NAVAL.down) / 2) + (NAVAL.x1 - 38)));
  s1.mode = 'patrol';
  const x = s1.x, z = Math.min(183, s1.z - NAVAL.beam / 2 - 3);
  w.place(p, x, z, 0);
  p.swimming = { since: w.g.state.real };
  assert.ok(zoneSwimmable(x, z));
  // an officer at the end of the jetty, in sight of it (31 October 2026, only what an officer sees is a crime)
  const officerAt = w.I.actors.get(officerOnScene(w, s1.x, s1.z, { metres: 25 }));
  assert.ok(officerAt.x >= ZONE_JETTY.x0 && officerAt.x <= ZONE_JETTY.x1 && officerAt.z <= ZONE_JETTY.z1, `on the jetty: ${officerAt.x.toFixed(1)}, ${officerAt.z.toFixed(1)}`);
  const took = send(id, { type: 'naval.take' });
  assert.equal(took.ok, true, JSON.stringify(took));
  assert.ok(!p.swimming);
  // the police: the officer saw it, and when they catch the player, everything taken goes back
  for (let k = 0; k < 600 && !p.law.crimes.includes(took.crime); k += 1) run(w.host, 0.5);
  assert.ok(p.law.crimes.includes(took.crime), 'the police know of it');
  const officer = w.I.population.people.find((q) => q.job === 'police');
  const record = w.I.justice.arrest(p, { kind: 'npc', id: officer.index, name: officer.name });
  assert.equal(record.shipsReturned, 1);
  assert.ok(!p.astride && !p.pship, 'off the ship');
  assert.ok(zoneWalkable(p.x, p.z), 'brought ashore');
  assert.equal(s1.mode, 'returning');
  for (let k = 0; k < 400 && s1.mode === 'returning'; k += 1) run(w.host, 0.5);
  assert.equal(s1.mode, 'patrol', 'back on its patrol');
  assert.equal(s1.takenBy, null);
});

test('another player out on the river in their boat is seen there, beyond the town\'s square; a boat on dry land is not believed', () => {
  const w = town(['River Driver']);
  const { p, id, send } = w;
  send(id, { type: 'sports.owned', items: ['speedboat'] });
  const j = onJetty();
  w.place(p, j.x, j.z, 0);
  assert.equal(send(id, { type: 'boats.launch' }).ok, true);
  p.pboat.x = 40; p.pboat.z = 240; p.x = 40; p.z = 240;
  step(w, id, p, 2, { heading: Math.PI / 2, steer: 0.2, bank: 0.1, pitch: 0.05 });
  const back = decodePlayer(JSON.parse(JSON.stringify(encodePlayer(w.g.view(id).self, 'z'))), 'z');
  assert.equal(back.boat.boat, 'speedboat');
  const other = town(['Bank Watcher']);
  other.place(other.p, 40, 140, 0);
  assert.ok(other.g.visitors.seen('peer-b', back));
  const v = other.g.view(other.id).players.find((o) => o.visitor);
  assert.ok(v && v.boat && v.boat.boat === 'speedboat' && v.z > 200, JSON.stringify(v && { boat: v.boat, z: v.z }));
  // the same word from up in the town, on dry land: seen there, but not in a boat
  assert.ok(other.g.visitors.seen('peer-c', { ...back, x: 0, z: 0, name: 'Dry Boat' }));
  const dry = other.g.view(other.id).players.find((o) => o.name === 'Dry Boat');
  assert.ok(dry && dry.boat === null, JSON.stringify(dry && dry.boat));
});
