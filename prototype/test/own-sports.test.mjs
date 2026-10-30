// A player's own things from the sports mall, ridden on land (31 October 2026, stage 2 of the owner's brief of 30 October:
// "the player must pedal and control the bike"): how each goes (pedalled, pushed, skated, by its motor), only what the
// server says is theirs can be ridden, getting on (brought to them, or where they left it), riding within what it can do,
// getting off and finding it where it stands, coming off it, the police taking them off it, and others seeing them on it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { town, run } from './world.mjs';
import { SPORTS } from '../src/sim/sports.js';
import { SPORT_HANDLING, SPORT_FRONTS, SPORT_ON, SPORT_BELL, LAND_SPORTS, stepSport, sportSeated } from '../src/sim/sport-ride.js';
import { harmOf, SPORT_HARM } from '../src/sim/impact.js';
import { encodePlayer, decodePlayer } from '../src/net/link.js';
import { SPORTS_PARTS } from '../src/client/sports-parts.js';

const require = createRequire(import.meta.url);
globalThis.THREE = globalThis.THREE || require('../vendor/three.min.js');
const { STANCE } = await import('../src/client/sport-view.js');

const kmh = (v) => v * 3.6;
// rides it for `seconds` with the button held (and the arrows as given), and gives what it did
function ride(id, seconds, input = { throttle: 1 }, { onTar = true } = {}) {
  const s = { speed: 0, lean: 0, heading: 0, phase: 0, pushing: false };
  const trace = [];
  for (let t = 0; t < seconds; t += 1 / 60) { stepSport(s, input, 1 / 60, { handling: SPORT_HANDLING[id], onTar }); trace.push({ t, speed: s.speed, phase: s.phase, heading: s.heading, pushing: s.pushing }); }
  return { s, trace };
}

test('the six ridden on land, each as fast as such a thing goes, the speedboat and surfboard not among them', () => {
  assert.deepEqual([...LAND_SPORTS].sort(), ['bicycle', 'e-scooter', 'e-unicycle', 'hoverboard', 'inline-skates', 'skateboard']);
  for (const id of LAND_SPORTS) {
    assert.equal(SPORTS[id].on, 'land', id);
    assert.ok(SPORTS_PARTS[id], `${id}: its model`);
    assert.ok(SPORT_FRONTS[id] && SPORT_ON[id], id);
    // its top speed on the tar is the mall's word for it, within a km/h
    assert.ok(Math.abs(kmh(SPORT_HANDLING[id].top) - SPORTS[id].kmh) <= 1, `${id}: ${kmh(SPORT_HANDLING[id].top)} km/h against ${SPORTS[id].kmh}`);
    // off the tar it goes slower
    assert.ok(SPORT_HANDLING[id].rough < SPORT_HANDLING[id].top, id);
  }
  for (const id of ['speedboat', 'surfboard']) assert.ok(!SPORT_HANDLING[id], `${id}: for the water`);
  // only the bicycle is sat on; only the bicycle and the e-scooter have a bell
  assert.deepEqual(LAND_SPORTS.filter(sportSeated), ['bicycle']);
  assert.deepEqual([...SPORT_BELL].sort(), ['bicycle', 'e-scooter']);
  // every one stood on has a stance for the rider's feet, on its deck
  for (const id of LAND_SPORTS.filter((i) => !sportSeated(i))) assert.ok(STANCE[id] && STANCE[id].feet.length === 2, id);
});

test('pedalled, the bicycle gathers speed smoothly to about 30 km/h; the cranks go round only while pedalled; it coasts on, and the brake stops it', () => {
  const { s, trace } = ride('bicycle', 20);
  for (let i = 1; i < trace.length; i += 1) assert.ok(trace[i].speed >= trace[i - 1].speed - 1e-9 && trace[i].speed - trace[i - 1].speed < 0.05, 'no jump in speed');
  assert.ok(kmh(s.speed) > 28 && kmh(s.speed) <= 30.1, `${kmh(s.speed)} km/h`);
  // the cranks turned all the while, at a cadence a rider keeps (about 90 a minute near the top)
  const phases = trace.slice(-60).map((q) => q.phase);
  const turned = phases.slice(1).reduce((a, p, i) => a + ((p - phases[i] + Math.PI * 2) % (Math.PI * 2)), 0);
  assert.ok(turned / (Math.PI * 2) * 60 > 70 && turned / (Math.PI * 2) * 60 < 110, `${turned / (Math.PI * 2) * 60} turns a minute`);
  // let go: it rolls on, slowing a little, and the cranks stand still
  const at = s.speed, phase = s.phase;
  for (let i = 0; i < 60; i += 1) stepSport(s, {}, 1 / 60, { handling: SPORT_HANDLING.bicycle });
  assert.ok(at - s.speed > 0.1 && at - s.speed < 1.2, `coasting a second loses ${at - s.speed} m/s`);
  assert.equal(s.phase, phase, 'the cranks stand still while it coasts');
  // the brake: stopped within a few metres
  let gone = 0;
  while (s.speed > 0) { stepSport(s, { brake: 1 }, 1 / 60, { handling: SPORT_HANDLING.bicycle }); gone += s.speed / 60; }
  assert.ok(gone < 9, `stopped in ${gone} m`);
  // off the tar it is slower
  assert.ok(kmh(ride('bicycle', 20, { throttle: 1 }, { onTar: false }).s.speed) < 21);
});

test('pushed and skated: speed comes in strokes, each begun only while the button is held and once begun finished; let go, they roll on', () => {
  for (const id of ['skateboard', 'inline-skates']) {
    const h = SPORT_HANDLING[id];
    const { s, trace } = ride(id, 15);
    assert.ok(kmh(s.speed) > SPORTS[id].kmh * 0.85 && kmh(s.speed) <= SPORTS[id].kmh + 0.5, `${id}: ${kmh(s.speed)} km/h`);
    // the speed rises while a foot is down and pushing, and falls a little between: strokes, not a motor's pull
    const early = trace.slice(0, 180);
    let rises = 0, falls = 0;
    for (let i = 1; i < early.length; i += 1) { if (early[i].speed > early[i - 1].speed + 1e-6) rises += 1; else if (early[i].speed < early[i - 1].speed - 1e-6) falls += 1; }
    assert.ok(rises > 30 && falls > 10, `${id}: ${rises} steps faster, ${falls} slower`);
    // let go in the middle of a stroke: it is finished, then the foot rests
    const r = { speed: 2, lean: 0, heading: 0, phase: 0, pushing: false };
    for (let i = 0; i < 20; i += 1) stepSport(r, { throttle: 1 }, 1 / 60, { handling: h });
    assert.ok(r.pushing && r.phase % 1 > 0.05, `${id}: a stroke begun`);
    for (let i = 0; i < 120; i += 1) stepSport(r, {}, 1 / 60, { handling: h });
    assert.equal(r.pushing, false, `${id}: finished`);
    assert.ok(Math.abs(r.phase % 1) < 1e-9, `${id}: the foot at rest`);
    assert.ok(r.speed > 1, `${id}: still rolling`);
  }
  // on the dirt a skateboard and skates hardly go
  assert.ok(kmh(ride('skateboard', 10, { throttle: 1 }, { onTar: false }).s.speed) < 5);
  assert.ok(kmh(ride('inline-skates', 10, { throttle: 1 }, { onTar: false }).s.speed) < 4);
});

test('leaned into a turn as a motorcycle is; the hoverboard turns round on the spot', () => {
  const b = ride('bicycle', 12);
  for (let i = 0; i < 120; i += 1) stepSport(b.s, { throttle: 1, steer: 1 }, 1 / 60, { handling: SPORT_HANDLING.bicycle });
  assert.ok(b.s.lean > 0.3, `leaned ${b.s.lean}`);
  const turn = (q) => { const s = { speed: 0, lean: 0, heading: 0, phase: 0 }; for (let i = 0; i < 60; i += 1) stepSport(s, { steer: 1 }, 1 / 60, { handling: SPORT_HANDLING[q] }); return s.heading; };
  assert.ok(Math.abs(turn('hoverboard')) > 1.5, 'the hoverboard turns where it stands');
  assert.ok(Math.abs(turn('bicycle')) < 0.01, 'a bicycle standing still does not');
});

test('only what the server says is theirs is ridden; on, ride within what it can do, off, and it stands where it was left', () => {
  const w = town(['Cyclist One']);
  const { p, id, send, place } = w;
  place(p, -50, 98, Math.PI / 2);
  assert.equal(send(id, { type: 'sports.ride', item: 'bicycle' }).code, 'NOT_YOURS');
  assert.equal(send(id, { type: 'sports.owned', items: ['bicycle', 'no-such-thing', 'bicycle', 'speedboat'] }).ok, true);
  assert.deepEqual(w.g.view(id).self.ownSports.items, ['bicycle', 'speedboat']);
  assert.equal(send(id, { type: 'sports.ride', item: 'skateboard' }).code, 'NOT_YOURS');
  // the speedboat: theirs, but not ridden on land
  assert.equal(send(id, { type: 'sports.ride', item: 'speedboat' }).code, 'WATER');
  const on = send(id, { type: 'sports.ride', item: 'bicycle' });
  assert.equal(on.ok, true, JSON.stringify(on));
  const a = w.g.view(id).self.astride;
  assert.equal(a.sport, 'bicycle');
  assert.equal(a.model, undefined, 'not a motorcycle');
  // riding: a step it could make is taken, with what it is doing (for others to see); one it could not is refused
  run(w.host, 0.2);
  const step = send(id, { type: 'moto.drive', x: p.x + 1.5, z: p.z, heading: Math.PI / 2, lean: 0.1, speed: 7, throttle: 1, steer: 0.05, phase: 2.5 });
  assert.equal(step.ok, true, JSON.stringify(step));
  assert.deepEqual(w.g.view(id).self.astride.ride, { lean: 0.1, speed: 7, throttle: 1, brake: 0, steer: 0.05, phase: 2.5 });
  run(w.host, 0.2);
  assert.equal(send(id, { type: 'moto.drive', x: p.x + 5, z: p.z, heading: Math.PI / 2 }).code, 'TOO_FAST', 'faster than a bicycle goes');
  // the bell: the bicycle has one
  assert.equal(send(id, { type: 'moto.horn' }).ok, true);
  // off: it stays where it stands
  const at = { x: p.x, z: p.z };
  const off = send(id, { type: 'moto.leave' });
  assert.equal(off.ok, true);
  const self = w.g.view(id).self;
  assert.equal(self.astride, null);
  assert.equal(self.ownSports.parked.length, 1);
  assert.equal(self.ownSports.parked[0].item, 'bicycle');
  assert.ok(Math.hypot(self.ownSports.parked[0].x - at.x, self.ownSports.parked[0].z - at.z) < 0.01);
  assert.ok(Math.hypot(p.x - at.x, p.z - at.z) > 0.5, 'the rider steps off beside it');
  // back on where it stands
  const again = send(id, { type: 'sports.ride', item: 'bicycle' });
  assert.equal(again.ok, true);
  assert.ok(Math.hypot(again.x - at.x, again.z - at.z) < 0.01);
  send(id, { type: 'moto.leave' });
  // sold (no longer on the server's list): no longer standing anywhere
  send(id, { type: 'sports.owned', items: [] });
  assert.deepEqual(w.g.view(id).self.ownSports, { items: [], parked: [] });
});

test('a skateboard has no bell; no thing is brought indoors; none is got on in the middle of a fight or from a motorcycle', () => {
  const w = town(['Skater One']);
  const { p, id, send, place } = w;
  send(id, { type: 'sports.owned', items: ['skateboard', 'hoverboard'] });
  send(id, { type: 'bikes.owned', bikes: ['chopper'] });
  place(p, -50, 98, Math.PI / 2);
  assert.equal(send(id, { type: 'sports.ride', item: 'skateboard' }).ok, true);
  assert.equal(send(id, { type: 'moto.horn' }).code, 'NO_BELL');
  // on it, not another thing at once, nor a motorcycle; and not the doors of a shop
  assert.equal(send(id, { type: 'sports.ride', item: 'hoverboard' }).code, 'RIDING');
  assert.equal(send(id, { type: 'bikes.ride', bike: 'chopper' }).code, 'RIDING');
  send(id, { type: 'moto.leave' });
  // indoors (the HOLARIS showroom building)
  place(p, -26, 44, 0);
  const r = send(id, { type: 'sports.ride', item: 'hoverboard' });
  assert.ok(['INDOORS', 'NO_ROOM'].includes(r.code), r.code);
});

test('running into a wall hard enough throws the rider (no life lost) and leaves it lying; a bump does not', () => {
  const w = town(['Cyclist Two']);
  const { p, id, send, place } = w;
  // facing the purple tower's curved wall across the grass from Waterside Road, just short of it
  place(p, -101.5, 104.2, Math.PI);
  send(id, { type: 'sports.owned', items: ['bicycle'] });
  assert.equal(send(id, { type: 'sports.ride', item: 'bicycle' }).ok, true);
  assert.equal(send(id, { type: 'moto.crash', speed: 3 }).fell, false);
  const health = p.health, at = { x: p.x, z: p.z };
  const fell = send(id, { type: 'moto.crash', speed: 500 });
  assert.equal(fell.ok, true, JSON.stringify(fell));
  assert.equal(fell.fell, true);
  assert.ok(fell.kmh <= SPORTS.bicycle.kmh, 'no faster than a bicycle goes');
  assert.equal(p.health, health, 'no life lost for hitting anything');
  const self = w.g.view(id).self;
  assert.equal(self.astride, null);
  assert.ok(self.down && self.down.by === 'crash', 'on the ground');
  const lying = self.ownSports.parked.find((b) => b.item === 'bicycle');
  assert.ok(lying && lying.fallen && Math.hypot(lying.x - at.x, lying.z - at.z) < 0.01, 'the bicycle lies where it stopped');
  assert.equal(send(id, { type: 'sports.ride', item: 'bicycle' }).ok, false, 'not got on again until up');
});

test('arrested: taken off it, and it is left standing where it was; it is theirs still', () => {
  const w = town(['Cyclist Three']);
  const { p, id, send, place } = w;
  place(p, -50, 98, Math.PI / 2);
  send(id, { type: 'sports.owned', items: ['e-scooter'] });
  assert.equal(send(id, { type: 'sports.ride', item: 'e-scooter' }).ok, true);
  w.g.internals.okada.unseat(p);
  const self = w.g.view(id).self;
  assert.equal(self.astride, null);
  assert.equal(p.psport, null);
  assert.deepEqual(self.ownSports.parked.map((b) => b.item), ['e-scooter']);
  assert.deepEqual(self.ownSports.items, ['e-scooter']);
});

test('others see them on it: what it is and what it is doing, through the link, every field checked', () => {
  const w = town(['Cyclist Four', 'Walker']);
  const [a, b] = w.players;
  const [ida, idb] = w.ids;
  w.place(a, -50, 98, Math.PI / 2); w.place(b, -48, 98, 0);
  w.send(ida, { type: 'sports.owned', items: ['inline-skates'] });
  assert.equal(w.send(ida, { type: 'sports.ride', item: 'inline-skates' }).ok, true);
  run(w.host, 0.2);
  w.send(ida, { type: 'moto.drive', x: a.x + 0.5, z: a.z, heading: Math.PI / 2, lean: -0.2, speed: 5, throttle: 1, phase: 1.3 });
  // in the same town: who is near sees them on it
  const seen = w.g.view(idb).players.find((o) => o.id === ida);
  assert.ok(seen && seen.sport && seen.sport.sport === 'inline-skates' && seen.sport.phase === 1.3, JSON.stringify(seen && seen.sport));
  // through the link to another copy of the town: as it was sent, and back as a visitor
  const self = w.g.view(ida).self;
  const sent = encodePlayer(self, 'z');
  assert.deepEqual(sent.ms, { i: 'inline-skates', l: -0.2, s: 5, t: 1, k: 0, st: 0, ph: 1.3, hn: 0 });
  assert.equal(sent.vh, undefined, 'not taken for an okada');
  const back = decodePlayer(JSON.parse(JSON.stringify(sent)), 'z');
  assert.equal(back.sport.sport, 'inline-skates');
  const other = town(['Far Watcher']);
  other.place(other.p, a.x + 3, a.z, 0);
  assert.ok(other.g.visitors.seen('peer-1', back));
  const visitor = other.g.view(other.id).players.find((o) => o.visitor);
  assert.equal(visitor.sport.sport, 'inline-skates');
  // what is not one of the game's own, or not ridden on land, is not believed
  for (const bad of [{ ...back, sport: { sport: 'speedboat', speed: 3 } }, { ...back, sport: { sport: 'rocket', speed: 3 } }]) {
    other.g.visitors.seen('peer-2', { ...bad, name: 'Bad Peer' });
    const v = other.g.view(other.id).players.find((o) => o.name === 'Bad Peer');
    assert.ok(v && v.sport === null, JSON.stringify(v && v.sport));
  }
  // a speed beyond any of them is held to the most
  other.g.visitors.seen('peer-3', { ...back, name: 'Fast Peer', sport: { sport: 'skateboard', speed: 400, lean: 9 } });
  const fast = other.g.view(other.id).players.find((o) => o.name === 'Fast Peer');
  assert.ok(fast.sport.speed <= 9 && Math.abs(fast.sport.lean) <= 0.6);
  // left standing near them: told to others too
  w.send(ida, { type: 'moto.leave' });
  const left = encodePlayer(w.g.view(ida).self, 'z');
  assert.deepEqual(left.ps.map((q) => q[0]), ['inline-skates']);
});

test('someone run into by a rider is hurt far less than by a vehicle', () => {
  for (const speed of [3, 5, 8.3]) {
    const sport = harmOf({ kind: 'sport', id: 'sp:bicycle' }, speed), moto = harmOf({ kind: 'moto', id: 'pb:x' }, speed);
    assert.ok(sport <= SPORT_HARM.most && sport < moto, `${speed} m/s: ${sport} against ${moto}`);
  }
});
