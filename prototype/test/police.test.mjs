// The town without its townspeople (22 October 2026, the owner's brief): every NPC taken out of the game but the named
// people at the counters, the mason and the police; the police are ten officers since 27 October 2026, five of his
// police officer and five of his security guard, who walk the land by day and by night (sixteen policewomen before). And what a game saved with the town as
// it was becomes when it is opened now.
//
//   node --test test/police.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHost } from '../src/sim/host.js';
import { createPopulation, POSE } from '../src/sim/population.js';
import { TIME_SCALE } from '../src/sim/sim.js';
import * as Z from '../src/sim/zone.js';
import { POLICE_LOOKS, UNIFORMS } from '../src/sim/police-looks.js';
import { FIGURES, FIGURE_ORDER, cleanFigureLook } from '../src/sim/figures.js';
import { NPC_FIGURES } from '../src/sim/npc-figures.js';
import { LAW } from '../src/sim/justice.js';
import { town, whereIs, until, run, ok, refused } from './world.mjs';
import { FORMER_TOWN, fund } from './helpers.mjs';

const H = (hours, day = 0) => day * 86400 + hours * 3600;
const walkable = (x, z, r = 0.45) => Z.zoneWalkable(x, z, [], r);
// the first point of a straight line that is not clear for someone walking along it, or null
const blockedOn = (ax, az, bx, bz) => { const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.5)); for (let i = 0; i <= n; i += 1) { const x = ax + ((bx - ax) * i) / n, z = az + ((bz - az) * i) / n; if (!walkable(x, z, 0.3)) return [x, z]; } return null; };

test('the town\'s people: ten police officers, five women and five men, and nobody else but the named residents at their counters and the mason', () => {
  // (27 October 2026, the owner: "replace the current police in the game with this male and female police ... 10
  // police. 5 males, 5 females"; the sixteen policewomen before them are kept only in the lab's lineup)
  const pop = createPopulation({ state: {}, timeScale: TIME_SCALE });
  assert.equal(pop.count, 10);
  assert.ok(pop.people.every((p) => p.job === 'police'), 'every one an officer');
  assert.equal(pop.people.filter((p) => p.gender === 'f').length, 5);
  assert.equal(pop.people.filter((p) => p.gender === 'm').length, 5);
  assert.deepEqual(Z.ZONE_RESIDENTS.map((r) => r.id).sort(), ['clerk', 'cook', 'corporal', 'instructor', 'lands', 'mason', 'nurse', 'rider', 'sergeant', 'trader', 'yardowner']);
  assert.deepEqual(Z.ZONE_FORMER_RESIDENTS.map((r) => r.id).sort(), ['clothseller', 'fisher', 'moulder', 'produce', 'surveyor'], 'the five no longer seen, kept for the books');
  // everyone at a counter has a counter (the mason builds)
  for (const r of Z.ZONE_RESIDENTS) if (r.id !== 'mason') assert.ok(Z.ZONE_SERVICES.some((s) => s.staff.split('|').includes(r.id)), `${r.name} keeps a counter`);
  assert.equal(new Set(pop.people.map((p) => p.name)).size, 10, 'ten names');
  // his police officer for a woman, his security guard for a man, each drawn as he made them; each of the five a
  // little taller or shorter than the next; a plain figure in the uniform's colours from far off
  for (const p of pop.people) {
    assert.equal(p.look.figure, p.gender === 'f' ? 'P1' : 'P2');
    assert.equal(NPC_FIGURES[p.look.figure].police, true);
    assert.equal(p.look.body, p.gender);
    assert.equal(p.fig.top, p.look.top, 'from far off too');
    assert.ok(p.transport === 'walk', 'on foot');
  }
  for (const g of ['f', 'm']) assert.equal(new Set(pop.people.filter((p) => p.gender === g).map((p) => p.look.height)).size, 5, `the five ${g === 'f' ? 'women' : 'men'} each their own height`);
  // they are not offered to a player, and a look naming one is not accepted from a client
  for (const id of Object.keys(NPC_FIGURES)) { assert.ok(!FIGURES[id] && !FIGURE_ORDER.f.includes(id) && !FIGURE_ORDER.m.includes(id)); assert.equal(cleanFigureLook({ figure: id }), null); }
  // the sixteen policewomen of before, kept for the lab: no two faces alike
  assert.equal(POLICE_LOOKS.length, 16);
  assert.equal(new Set(POLICE_LOOKS.map((L) => JSON.stringify(L.face))).size, 16);
  assert.equal(UNIFORMS.black.hat, 'beret'); assert.equal(UNIFORMS.blue.hat, 'cap'); assert.ok(UNIFORMS.camo.camo.length === 4);
  // no okadas, no market stalls
  assert.equal(Z.ZONE_STALLS.length, 0);
  assert.equal(Z.ZONE_POPULATION.jobs.some(([job]) => job === 'okada'), false);
  // and the showroom staff, the watch shop's attendant, the sellers' goods and the okada boards are not drawn (their
  // places are kept)
  assert.deepEqual(Z.ZONE_CAST, { shopAttendants: false, showroomStaff: false, sellers: false, okadas: false });
  assert.ok(Z.ZONE_SHOPS[0].attendant && Z.CARSHOW.salesmen.length === 2);
});

test('the police officer is no longer one of the women a player can choose; a player who has her keeps her', () => {
  assert.ok(!FIGURE_ORDER.f.includes('W3'));
  assert.equal(FIGURES.W3.file, 'police.glb');
  const host = createHost();
  const id = host.game.join({ name: 'Amaka Kept', look: { figure: 'W3', colours: {} } });
  assert.equal(host.game.view(id).self.look.figure, 'W3');
});

test('the beats: every stop where an officer can stand, every way between them clear, all of the land walked', () => {
  const station = Z.ZONE_SPOTS.find((s) => s.venue === 'police' && s.slot === 'inside');
  assert.equal(Z.ZONE_GRAPH_PROBLEMS.length, 0, Z.ZONE_GRAPH_PROBLEMS.join('; '));
  let day = 0, night = 0;
  const reach = { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity };
  for (const b of Z.ZONE_PATROLS) {
    day += b.day; night += b.night;
    assert.ok(b.round.length >= b.spots.length && b.round.every((k) => k >= 0 && k < b.spots.length), `${b.id}: its round is of its own stops`);
    assert.ok(b.spots.every((id) => b.round.includes(b.spots.indexOf(id))), `${b.id}: every stop is walked to`);
    for (const id of b.spots) {
      const s = Z.ZONE_SPOTS[id];
      assert.equal(s.venue, 'police'); assert.equal(s.slot, 'patrol');
      assert.ok(walkable(s.x, s.z), `${b.id}: she can stand at ${s.x}, ${s.z}`);
      reach.x0 = Math.min(reach.x0, s.x); reach.x1 = Math.max(reach.x1, s.x); reach.z0 = Math.min(reach.z0, s.z); reach.z1 = Math.max(reach.z1, s.z);
      // a stop off the town's paths is at the end of a line out of the town, and every stretch of it is clear
      if (s.via) {
        let [px, pz] = Z.ZONE_NODES[s.node];
        for (const [x, z] of [...s.via, [s.x, s.z]]) { assert.equal(blockedOn(px, pz, x, z), null, `${b.id}: the way from ${px}, ${pz} to ${x}, ${z}`); px = x; pz = z; }
      } else {
        const [nx, nz] = Z.ZONE_NODES[s.node];
        assert.equal(blockedOn(nx, nz, s.x, s.z), null, `${b.id}: from the path to ${s.x}, ${s.z}`);
      }
      // and stands clear of the doors people come to
      for (const sv of Z.ZONE_SERVICES) assert.ok(Math.hypot(sv.x - s.x, sv.z - s.z) > 6, `${b.id}: ${s.x}, ${s.z} is clear of ${sv.name}`);
    }
    void station;
  }
  assert.deepEqual([day, night], [7, 3], 'seven by day and three by night: the ten officers (27 October 2026)');
  // the whole of the land: the airport, the Kwale road, the bridge's far end, the habitation's lagoon, the campuses
  assert.ok(reach.x0 < -850 && reach.x1 > 700 && reach.z0 < -380 && reach.z1 > 370, JSON.stringify(reach));
  for (const id of ['market', 'registry', 'waterside', 'west', 'east', 'kwale', 'habitation']) assert.ok(Z.ZONE_PATROLS.some((b) => b.id === id && b.day >= 1), `${id} is walked by day`);
  // (the south of the town and the airport keep their beats, with nobody on them until there are more officers)
  for (const id of ['south', 'airport']) assert.ok(Z.ZONE_PATROLS.some((b) => b.id === id && b.day === 0 && b.night === 0), `${id}: a beat, unwalked`);
});

test('their days: on the beat through the shift, by day or by night, every step a step, at midnight where the next day finds them', () => {
  for (const timeScale of [TIME_SCALE, 1]) {
    const pop = createPopulation({ state: {}, timeScale });
    const step = timeScale === 1 ? 5 : 30;
    for (let i = 0; i < pop.count; i += 1) {
      const p = pop.people[i];
      const beat = Z.ZONE_PATROLS.find((b) => b.id === p.post.patrol);
      assert.ok(beat, `${p.name} has a beat`);
      let prev = null, onPatrol = 0, shift = 0;
      for (let t = H(0, 3); t < H(0, 5); t += step) {
        const at = pop.locate(i, t, {});
        if (prev) assert.ok(Math.hypot(at.x - prev.x, at.z - prev.z) <= (p.pace / timeScale) * step * 1.8 + 1.2, `${p.name} at ${t}: ${prev.act} to ${at.act}`);
        const hour = (t % 86400) / 3600;
        const inShift = p.night ? hour < 5.5 || hour >= 19 : hour >= 7.5 && hour < 17.5;
        if (inShift) { shift += 1; if (at.act === 'On patrol') onPatrol += 1; }
        prev = at;
      }
      // (by the game's own clock a day is 48 minutes and a long beat is mostly walked to and from)
      assert.ok(onPatrol / shift > (timeScale === 1 ? 0.95 : 0.5), `${p.name} (${beat.id}${p.night ? ', by night' : ''}) on patrol ${(100 * onPatrol / shift).toFixed(0)}% of the shift`);
      // and what anyone asking is told she is doing, in the middle of her shift by the website's clock: on patrol,
      // walking or standing (by the game's own clock a long beat's officer is still walking back from it then)
      if (timeScale === 1) for (const t of [H(p.night ? 2 : 11, 3), H(p.night ? 2.37 : 11.37, 3), H(p.night ? 3.1 : 14.2, 4)]) assert.equal(pop.describe(i, t).activity, 'On patrol', `${p.name} at ${((t % 86400) / 3600).toFixed(2)}`);
      // at midnight a night officer is out, at the first stop of her round; a day officer asleep at home
      const midnight = pop.locate(i, H(0, 4), {});
      if (p.night) { assert.equal(midnight.act, 'On patrol'); assert.equal(midnight.spot, beat.spots[beat.round[0]]); } else assert.equal(midnight.pose, POSE.hidden);
    }
  }
});

test('the police come from their beats when something happens, and only an officer is a witness', () => {
  const w = town(['Ada Attacker', 'Bayo Struck', 'Chidi Watching']);
  const [a, b, c] = w.players;
  // in the market at ten in the morning, with an officer on her beat a few metres off
  const officer = w.pop.people.find((q) => q.post.patrol === 'market' && whereIs(w, q.index).act === 'On patrol');
  assert.ok(officer, 'an officer is walking the market');
  const her = whereIs(w, officer.index);
  w.place(a, her.x + 6, her.z, -Math.PI / 2); w.place(b, her.x + 6.9, her.z, Math.PI / 2); w.place(c, her.x + 9, her.z + 3);
  run(w.host, 0.1);
  ok(w.send(a.id, { type: 'combat.engage', target: { kind: 'player', id: b.id } }));
  ok(w.send(a.id, { type: 'combat.act', move: 'punch' }));
  const crime = Object.values(w.g.state.justice.crimes)[0];
  assert.ok(crime.witnesses.length >= 1 && crime.witnesses.every((s) => s.kind === 'npc' && s.police), 'the officer saw it, and nobody else is counted');
  assert.ok(!w.events(c.id).some((e) => e.type === 'witness'), 'the other player is not asked to be a witness');
  // she needs nobody to tell her: the attacker is wanted in a moment, and taken
  until(w, () => a.law.state !== 'normal', 3);
  until(w, () => !!a.custody, 300);
  assert.equal(w.g.view(a.id).self.law.arrest.officer, officer.name);
});

test('an officer struck fights back at once, and her colleagues are told', () => {
  const w = town(['Femi Foolish']);
  const officer = w.pop.people.find((q) => whereIs(w, q.index).act === 'On patrol');
  const her = whereIs(w, officer.index);
  w.place(w.p, her.x + 1, her.z, -Math.PI / 2);
  ok(w.send(w.id, { type: 'combat.engage', target: { kind: 'npc', id: officer.index } }));
  const hit = ok(w.send(w.id, { type: 'combat.act', move: 'punch' }));
  assert.equal(hit.reaction, 'fighting', 'no pleading from her');
  until(w, () => ['wanted', 'pursuit'].includes(w.p.law.state), LAW.report[1] + 1);
  assert.ok(w.g.view(w.id).officers.length >= 1);
});

test('a game saved with the town as it was opens with the town as it is: what it held about its people let go, the players\' own kept', () => {
  // the town as it was, with a player who has money, a crime on the books against a townsperson, on the back of an okada
  const before = createHost({ people: FORMER_TOWN });
  const g = before.game;
  const id = g.join({ name: 'Old Save', look: {} });
  fund(before, id, 5000);
  for (let k = 0; k < 600; k += 1) before.tick(0.5);
  const p = g.state.players[id];
  const rider = g.internals.okada.riders.find((r) => r.mode === 'rank' && !r.passenger);
  assert.ok(rider, 'an okada is waiting');
  p.x = rider.x + 1; p.z = rider.z; p.lastMoveAt = g.state.real;
  const stop = ok(g.intent(id, { type: 'okada.options', n: rider.n })).stops[0];
  ok(g.intent(id, { type: 'okada.ride', n: rider.n, stop: stop.id }));
  assert.equal(typeof p.riding, 'number');
  const money = before.auditor.balance(p.wallet);
  // a saved game from before has no record of which people it was made with
  const saved = JSON.parse(JSON.stringify(before.save()));
  delete saved.game.population.roster;
  assert.ok(saved.game.okada.riders.length === 26 && Object.keys(saved.game.okada.trips).length >= 0);
  const after = createHost({ saved });
  const a = after.game;
  assert.equal(a.state.players[id].riding, null, 'off the okada, which is gone');
  assert.deepEqual(a.state.okada.riders, []);
  assert.equal(a.internals.population.count, 10);
  assert.equal(after.auditor.balance(a.state.players[id].wallet), money, 'the money is the player\'s still');
  assert.deepEqual(after.auditor.reconcile(), []);
  // and it runs: views, ticks, the police on their beats
  for (let k = 0; k < 200; k += 1) after.tick(0.5);
  const v = a.view(id);
  assert.deepEqual(v.okadas, []);
  assert.ok(v.people.every(([i]) => a.internals.population.people[i].job === 'police'));
  assert.equal(a.audit().okada.balanced, true);
  // saved again and opened again: nothing more is let go
  const again = createHost({ saved: JSON.parse(JSON.stringify(after.save())) });
  assert.equal(again.game.internals.population.renewed, false);
});

test('the market\'s ground is open where its stalls stood, and nothing unseen stands in the way', () => {
  for (const z of [32, 44, 76, 88]) for (const x of [18, 30, 56, 68]) assert.ok(walkable(x, z), `where a stall stood, ${x}, ${z}`);
  // the trade sheds stand, empty of what was sold in them
  assert.ok(Z.ZONE_SHEDS.length > 0);
  for (const s of Z.ZONE_SHEDS) assert.ok(walkable(s.x, s.z, 0.3), `inside ${s.sign}`);
});

test('a resident at a counter is still there to serve, and the yard still makes blocks without its moulder', () => {
  const w = town(['Busy Buyer'], { hour: 9 });
  const services = w.g.view(w.id).services;
  for (const id of ['registry', 'secretariat', 'police', 'clinic', 'school', 'yard', 'store', 'kitchen', 'park']) assert.equal(services[id].open, true, `${id} is open at nine`);
  const before = w.I.economy.have('yard', 'block');
  w.I.economy.moveGoods('yard', 'store', 'block', before - 100);
  for (let k = 0; k < 600; k += 1) w.host.tick(0.5);
  assert.ok(w.I.economy.have('yard', 'block') > 100, 'blocks are turned out');
});
