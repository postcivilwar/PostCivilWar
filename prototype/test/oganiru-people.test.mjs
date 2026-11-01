// Oganiru City's people (the owner's brief of 31 October 2026, Stage 2, 1 November: "The police chase over the flyovers
// too. Townspeople walk the pavements and use the crossings, never the expressway or flyovers (players may).").
//   node --test test/oganiru-people.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { town, officerOnScene, until } from './world.mjs';
import { levelAt } from '../src/sim/levels.js';
import { cityWalks } from '../src/sim/city-walks.js';
import { POSE } from '../src/sim/population.js';
import { OGANIRU_JUNCTIONS, oganiruTar, oganiruDecksAt, signalState } from '../src/sim/zone.js';

test('townspeople out walking in the city by day: out of a tower\'s door and in at another; on its pavements, crossing its roads only at the zebras, and at a junction with lights only while that road\'s traffic is held at red; never on the expressway, a flyover or a slip road; each only while their own day has them indoors', () => {
  const w = town(['Watcher Test'], { hour: 11 });
  const S = w.I.strollers;
  const W = cityWalks();
  const doorAt = (x, z) => W.doors.some((d) => Math.hypot(d.x - x, d.z - z) < 0.6);
  const o = {};
  const first = new Map(), last = new Map(), was = new Map();
  let samples = 0, offPavement = 0, onDecks = 0, notIndoors = 0, steppedOff = 0, steppedOffGreen = 0;
  const walks0 = S.audit().walks;
  for (let s = 0; s < 5 * 120; s += 0.1) {
    w.place(w.p, 0, -760);
    w.host.tick(0.1);
    const now = w.g.state.real;
    for (const st of S.out()) {
      w.pop.locate(st.i, w.g.state.t, o);
      samples += 1;
      if (!first.has(`${st.i}:${st.since}`)) first.set(`${st.i}:${st.since}`, { x: o.x, z: o.z });
      last.set(`${st.i}:${st.since}`, { x: o.x, z: o.z, d: st.d, len: S.wayOf(st.i).len });
      // on the pavements (or a crossing at a junction), never a deck but the Hope bridge
      if (oganiruDecksAt(o.x, o.z).some((h) => h.deck.kind !== 'bridge' && h.y > 0.3 && Math.abs(h.y - o.y) < 1.5)) onDecks += 1;
      if (oganiruTar(o.x, o.z) && !oganiruDecksAt(o.x, o.z).some((h) => h.deck.kind === 'bridge') && !OGANIRU_JUNCTIONS.some((j) => Math.abs(o.x - j.x) < j.hx + 7 && Math.abs(o.z - j.z) < j.hz + 7)) offPavement += 1;
      // their own day has them indoors meanwhile
      w.pop.planned(st.i, w.g.state.t, o);
      if (o.pose !== POSE.hidden) notIndoors += 1;
      // stepping off the kerb at a crossing with lights: its road's traffic held at red
      const way = S.wayOf(st.i), prev = was.get(st.i);
      if (prev !== undefined) for (const c of way.cross) if (c.crossing.signals && prev <= c.at - 0.5 + 1e-6 && st.d > c.at - 0.5 + 1e-6) { steppedOff += 1; if (signalState(c.crossing.phase, now + c.crossing.offset) !== 'red') steppedOffGreen += 1; }
      was.set(st.i, st.d);
    }
  }
  const walks = S.audit().walks - walks0;
  assert.ok(walks >= 25, `${walks} walks set out in five hours`);
  assert.ok(samples > 10000, `${samples} looks at someone out walking`);
  assert.equal(onDecks, 0, 'never on a flyover, a slip road or the expressway');
  assert.equal(offPavement, 0, 'never on a road but at a crossing');
  assert.equal(notIndoors, 0, 'only while their own day has them indoors in the town');
  assert.ok(steppedOff >= 10, `${steppedOff} crossings at lights`);
  assert.equal(steppedOffGreen, 0, 'never off the kerb into a road whose traffic has a green light');
  // out of a door, in at a door
  for (const [key, at] of first) if (at.d === undefined) assert.ok(doorAt(at.x, at.z) || last.get(key).d > 2, `${key} came out of a door`);
  let ended = 0;
  for (const [, at] of last) if (at.d >= at.len - 0.5) { ended += 1; assert.ok(doorAt(at.x, at.z), 'went in at a door'); }
  assert.ok(ended >= 10, `${ended} walks ended at a door`);
});

test('the police chase over the flyovers: a wanted player running up the Independence Flyover is followed up its ramp by the officer after them, and arrested on its deck over Unity Avenue; an officer under the deck neither sees nor lays hands on someone on it', () => {
  const w = town(['Runner Test'], { hour: 10 });
  const p = w.p;
  w.place(p, -250, -793.5);
  // (an officer on her beat sees it; the nearest free officer is sent, on foot from the town)
  officerOnScene(w, p.x, p.z, { metres: 16 });
  const victim = w.pop.people.find((q) => q.job !== 'police' && q.job !== 'motorist').index;
  w.I.justice.offence(p, 'assault', { victim: { kind: 'npc', id: victim, name: 'Someone' }, x: p.x, z: p.z });
  const after = () => Object.values(w.g.state.justice.officers).find((o) => o.suspect === p.id && o.duty === 'pursue');
  until(w, () => p.law.state === 'pursuit' && after(), 400, () => w.place(p, -250, -793.5));
  const i = after().i;
  // at a jog up the ramp in its lane, to the top over Unity Avenue
  const pts = [[-232, -776], [-180, -776], [-120, -776], [-60, -776], [-10, -776]];
  let k = 0, officerTop = 0, steps = 0;
  until(w, () => k >= pts.length, 150, () => {
    const [tx, tz] = pts[k], gap = Math.hypot(tx - p.x, tz - p.z);
    if (gap < 0.2) { k += 1; return; }
    const s = Math.min(gap, 0.3);
    assert.ok(w.send(w.id, { type: 'move', x: p.x + ((tx - p.x) / gap) * s, z: p.z + ((tz - p.z) / gap) * s, heading: Math.atan2(tx - p.x, tz - p.z), run: true }).ok, 'up the ramp');
    steps += 1;
  });
  assert.ok(Math.abs(levelAt(p) - 7.5) < 0.05, `up on the deck at ${levelAt(p)}`);
  // standing there: the officer comes up after them, a step at a time, and takes them on the deck
  let last = { x: w.I.actors.get(i).x, z: w.I.actors.get(i).z };
  until(w, () => p.law.state === 'arrested' || p.law.state === 'custody', 120, () => {
    const m = w.I.actors.get(i);
    if (!m) return;
    assert.ok(Math.hypot(m.x - last.x, m.z - last.z) < 0.9, 'the officer moves by steps');
    last = { x: m.x, z: m.z };
    officerTop = Math.max(officerTop, m.y || 0);
  });
  assert.ok(officerTop > 7.3, `the officer came up onto the deck (${officerTop.toFixed(2)} m)`);
  // and the people of the town are seen at their height: the officer up there is drawn up there
  const rows = w.pop.around(w.id, p.x, p.z, w.g.state.t, w.g.state.real);
  const row = rows.find((r) => r[0] === i);
  assert.ok(row && Math.abs(row[5] - 7.5) < 0.2, `the officer's row says how high she is: ${row && row[5]}`);

  // another: on the deck while an officer stands on the avenue under it, out of her sight and her reach
  const v = town(['Above Test'], { hour: 10 });
  const q = v.p;
  v.place(q, -250, -793.5);
  for (const [tx, tz] of [[-232, -776], [-180, -776], [-120, -776], [-60, -776], [-4, -776]]) {
    for (let n = 0; n < 4000 && Math.hypot(tx - q.x, tz - q.z) > 0.2; n += 1) { const gap = Math.hypot(tx - q.x, tz - q.z), s = Math.min(gap, 0.5); v.send(v.id, { type: 'move', x: q.x + ((tx - q.x) / gap) * s, z: q.z + ((tz - q.z) / gap) * s, heading: 0, run: true }); v.host.tick(0.1); }
  }
  assert.ok(levelAt(q) > 7.4, 'up on the deck');
  const below = officerOnScene(v, -4, -768, { metres: 6 });
  const m = v.I.actors.get(below);
  assert.ok(Math.abs((m.y || 0) - levelAt(q)) > 5, 'the officer is on the avenue under it');
  v.I.justice.offence(q, 'assault', { victim: { kind: 'npc', id: victim, name: 'Someone' }, x: q.x, z: q.z });
  for (let n = 0; n < 50; n += 1) v.host.tick(0.1);
  assert.notEqual(q.law.state, 'arrested', 'not taken from under the deck');
});
