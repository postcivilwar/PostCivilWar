// Vehicles seen by every player. Each copy of the town has its own vehicles, so what one player drives, rides or has
// left standing travels with them (link.js) and every other player's game is told of it (talk.js): the keke they
// drive, the okada they ride or sit on the back of, their own motorcycles and kekes standing near them, and how fast
// they are going. Then the network: another player's vehicle, heard through the website's presence (online.js)
// with the network's delay, jitter and lost answers, is shown where it is, smoothly, without lagging behind or
// jumping.
//   node --test test/vehicle-sync.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { town, ok, run } from './world.mjs';
import { zoneService } from '../src/sim/zone.js';
import { encodePlayer, decodePlayer, createLink } from '../src/net/link.js';
import { createWebTransport } from '../src/net/online.js';
import { createLoopbackHub } from '../src/net/transport.js';

const ZONE_ID = 'NG-AN-OGB-Z1';
const PARK = zoneService('park');

// A player at the wheel of a hired keke from the motor park.
function atTheWheel(w, p) {
  w.place(p, PARK.x, PARK.z);
  const hired = ok(w.send(p.id, { type: 'vehicle.hire' }));
  const v = w.g.state.vehicles.list[hired.vehicle.id];
  w.place(p, v.x + 1.4, v.z);
  ok(w.send(p.id, { type: 'vehicle.enter', vehicleId: v.id }));
  return v;
}

test('a keke driven by another player: sent with its plate and paint, and seen by everyone near, at the wheel', () => {
  const a = town(['Driver Ada']);
  const v = atTheWheel(a, a.p);
  const self = { ...a.g.view(a.id).self, vel: [6.5, 0] };
  const state = encodePlayer(self, ZONE_ID);
  assert.equal(state.vh.k, 'keke');
  assert.equal(state.vh.pl, v.plate);
  assert.ok(JSON.stringify(state).length < 1500, 'within what the server takes');
  // in another copy of the town
  const b = town(['Watcher Bayo']);
  b.place(b.p, a.p.x + 8, a.p.z);
  const seen = b.g.visitors.seen('peer-ada', decodePlayer(state, ZONE_ID));
  assert.ok(seen);
  const q = b.g.view(b.id).players.find((o) => o.name === state.n);
  assert.equal(q.vehicle.kind, 'keke');
  assert.equal(q.vehicle.plate, v.plate);
  assert.deepEqual(q.vehicle.look, v.look, 'the same paint, trim, canopy, slogan and number');
  assert.equal(q.vehicle.fleet, true, 'a keke of the hire fleet (so the watcher\'s own copy of it is not also shown in its bay)');
  assert.deepEqual(q.vel, [6.5, 0]);
  // out of it: no keke under them
  ok(a.send(a.id, { type: 'vehicle.exit' }));
  const after = encodePlayer(a.g.view(a.id).self, ZONE_ID);
  assert.equal(after.vh, undefined);
  b.g.visitors.seen('peer-ada', decodePlayer(after, ZONE_ID));
  const q2 = b.g.view(b.id).players.find((o) => o.name === state.n);
  assert.equal(q2.vehicle, null);
  // and the keke they left standing beside them is told of (and seen) where it stands
  assert.equal(q2.kekes.length, 1);
  assert.equal(q2.kekes[0].id, v.id);
  assert.ok(Math.abs(q2.kekes[0].x - v.x) < 0.01 && Math.abs(q2.kekes[0].z - v.z) < 0.01);
});

test('an okada: ridden, or sat on the back of (with its rider, one of the town\'s people, the same in every copy)', () => {
  const ridden = decodePlayer(encodePlayer({ name: 'Rider', x: 0, z: 100, heading: 0, look: {}, astride: { n: 4 }, horns: 2 }, ZONE_ID), ZONE_ID);
  assert.deepEqual([ridden.vehicle.kind, ridden.vehicle.back], ['okada', false]);
  const back = decodePlayer(encodePlayer({ name: 'Rider', x: 0, z: 100, heading: 0, look: {}, riding: { n: 4, i: 1234 } }, ZONE_ID), ZONE_ID);
  assert.deepEqual([back.vehicle.kind, back.vehicle.back, back.vehicle.driver], ['okada', true, 1234]);
  const b = town(['Watcher Chi']);
  b.place(b.p, 2, 100);
  b.g.visitors.seen('peer-r', back);
  const q = b.g.view(b.id).players.find((o) => o.name === 'Rider');
  assert.deepEqual(q.vehicle, { kind: 'okada', back: true, driver: 1234 });
});

test('their own motorcycles standing near them are seen; nothing made up or out of reach is taken', () => {
  const self = { name: 'Owner', x: 10, z: 100, heading: 0, look: {}, ownBikes: { parked: [{ bike: 'chopper', x: 14, z: 101, h: 1, fallen: true }, { bike: 'red-superbike', x: 400, z: 100, h: 0 }] } };
  const state = encodePlayer(self, ZONE_ID);
  assert.equal(state.pk.length, 1, 'only those near them');
  const b = town(['Watcher Dayo']);
  b.place(b.p, 12, 100);
  const data = decodePlayer(state, ZONE_ID);
  // a forged one, far off, and one that is no motorcycle of the game's
  data.parked.push({ bike: 'chrome-concept', x: 900, z: 900, h: 0 }, { bike: 'no-such-bike', x: 11, z: 100, h: 0 });
  data.kekes.push({ id: 'V-0001', x: 11, z: 101, heading: 0, plate: 'X'.repeat(200), look: { paint: 'not-a-paint', trim: 'x', wear: 9, slogan: 'Y'.repeat(300) } });
  b.g.visitors.seen('peer-o', data);
  const q = b.g.view(b.id).players.find((o) => o.name === 'Owner');
  assert.deepEqual(q.parked, [{ bike: 'chopper', x: 14, z: 101, h: 1, fallen: true }]);
  assert.equal(q.kekes.length, 1);
  assert.ok(q.kekes[0].plate.length <= 14 && q.kekes[0].look.paint === 'yellow' && q.kekes[0].look.wear === 1 && q.kekes[0].look.slogan.length <= 32, 'every field checked');
});

test('a motorcycle\'s steering and the phone in a player\'s hand travel with them, and are checked when heard', () => {
  const self = { name: 'Rider', x: 0, z: 100, heading: 0, look: {}, astride: { n: 'pb:cafe-racer', model: 'cafe-racer', ride: { lean: 0.2, speed: 9, throttle: 0.5, brake: 0, rev: 0.4, steer: 0.31 }, horns: 0 }, phone: 1 };
  const state = encodePlayer(self, ZONE_ID);
  assert.equal(state.mb.st, 0.31);
  assert.equal(state.ph, 1);
  const data = decodePlayer(state, ZONE_ID);
  assert.equal(data.ride.steer, 0.31);
  assert.equal(data.phone, 1);
  const b = town(['Watcher Ebi']);
  b.place(b.p, 2, 100);
  b.g.visitors.seen('peer-ph', data);
  let q = b.g.view(b.id).players.find((o) => o.name === 'Rider');
  assert.equal(q.ride.steer, 0.31, 'the front wheel is seen turned as theirs is');
  assert.equal(q.phone, 1, 'and their phone in their hand');
  // on a call, and the phone put away; a made-up value is no phone at all, and the bars turned past the lock are held to it
  for (const [ph, want] of [[2, 2], [0, 0], [7, 0], ['1', 0]]) { b.g.visitors.seen('peer-ph', { ...data, phone: ph }); q = b.g.view(b.id).players.find((o) => o.name === 'Rider'); assert.equal(q.phone, want, `phone ${ph}`); }
  b.g.visitors.seen('peer-ph', { ...data, ride: { ...data.ride, steer: 5 } });
  q = b.g.view(b.id).players.find((o) => o.name === 'Rider');
  assert.equal(q.ride.steer, 0.7);
  // a player without the phone out sends nothing for it
  assert.equal(encodePlayer({ ...self, phone: 0 }, ZONE_ID).ph, undefined);
});

test('a vehicle\'s speed travels with it; the link works it out from where the player is', () => {
  const hub = createLoopbackHub();
  const me = { name: 'Mover', x: 0, z: 100, heading: Math.PI / 2, look: {}, astride: { n: 3 } };
  let heard = null;
  const game = { visitors: { seen: () => true, gone: () => {} } };
  const listen = hub.join('b');
  listen.subscribe((others) => { if (others.length) heard = others[0].state; });
  const link = createLink({ transport: hub.join('a'), game, zoneId: ZONE_ID, self: () => me });
  for (let i = 0; i < 40; i += 1) { me.x += 20 * 0.05; link.tick(0.05); }
  assert.ok(heard && heard.vh && Math.abs(heard.vl[0] - 20) < 1 && Math.abs(heard.vl[1]) < 0.01, JSON.stringify(heard && heard.vl));
});

// ---- the network ----------------------------------------------------------------------------------------------
// Two games on a pretend website: the server keeps each one's latest word and hands back the other's; every answer
// arrives after a delay that wanders (latency and jitter), and some never arrive. One player drives round a bend and
// along the road at 18 m/s (65 km/h) in a keke; the other watches. What the watcher is shown is compared with where
// the keke really was at that moment.
function network({ latency = 0.15, jitter = 0.12, loss = 0.1, seed = 7 } = {}) {
  let clock = 0, s = seed;
  const rand = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const timers = [], waits = [];
  const store = new Map();
  const online = (who) => ({
    signedIn: true,
    ask: (op, body) => new Promise((resolve) => {
      const there = clock + (latency + rand() * jitter) / 2;
      const back = there + (latency + rand() * jitter) / 2;
      const lost = rand() < loss;
      let answer = null;
      waits.push({ at: there, run: () => { if (body.state) store.set(who, { state: body.state, at: clock }); answer = [...store].filter(([k]) => k !== who).map(([k, e]) => ({ id: k, state: e.state, age: clock - e.at })); } });
      waits.push({ at: back, run: () => resolve(lost ? { ok: false, code: 'NETWORK' } : { ok: true, peers: answer }) });
    }),
  });
  const every = (fn, ms) => { timers.push({ fn, ms: ms / 1000, next: clock + ms / 1000 }); return timers.length; };
  const advance = async (dt) => {
    const end = clock + dt;
    for (;;) {
      const nextTimer = Math.min(...timers.map((t) => t.next));
      const nextWait = waits.length ? Math.min(...waits.map((w) => w.at)) : Infinity;
      const next = Math.min(nextTimer, nextWait);
      if (next > end) break;
      clock = next;
      if (nextWait <= nextTimer) { const i = waits.findIndex((w) => w.at === nextWait); const [w] = waits.splice(i, 1); w.run(); await new Promise((r) => setImmediate(r)); }
      else for (const t of timers) if (t.next <= clock) { t.next += t.ms; t.fn(); }
    }
    clock = end;
  };
  return { online, every, now: () => clock, advance };
}

// The keke's true path: along, round a quarter bend, along again; and slowing to a stop at the end.
function path(t) {
  const v = 18, r = 25, a0 = v / 3;
  // away from standing over three seconds, then along at 18 m/s
  const startLen = (v * 3) / 2;
  const straight = 3 + (60 - startLen) / v, bend = (Math.PI / 2 * r) / v;
  if (t < 3) return { x: (a0 * t * t) / 2, z: 0, h: Math.PI / 2, vx: a0 * t, vz: 0 };
  if (t < straight) return { x: startLen + v * (t - 3), z: 0, h: Math.PI / 2, vx: v, vz: 0 };
  if (t < straight + bend) { const a = ((t - straight) * v) / r; return { x: 60 + r * Math.sin(a), z: r - r * Math.cos(a), h: Math.PI / 2 - a, vx: v * Math.cos(a), vz: v * Math.sin(a) }; }
  const u = t - straight - bend;
  const stopAfter = 3, decel = v / stopAfter;
  const d = u < stopAfter ? v * u - (decel * u * u) / 2 : (v * stopAfter) / 2;
  const sp = u < stopAfter ? v - decel * u : 0;
  return { x: 60 + r, z: r + d, h: 0, vx: 0, vz: sp };
}

// (a keke, one of the player's own cars, one of their own motorcycles: each says what it is in its own field. Before
// 18 October 2026 a car was not carried on between words at all: it was moved in steps from where it had been heard)
const KINDS = [['keke', { vh: { k: 'keke' } }], ['car', { mc: { i: 'grey-saloon', s: 0, v: 18, t: 0.5, k: 0, r: 0.4, l: 0, hn: 0 } }], ['motorcycle', { mb: { i: 'cafe-racer', l: 0, s: 18, t: 0.5, k: 0, r: 0.4, st: 0, hn: 0 } }]];
const turnGap = (a, b) => { let d = (a - b) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return Math.abs(d); };
for (const [kind, field] of KINDS) for (const conditions of [{ name: 'a good connection', latency: 0.08, jitter: 0.04, loss: 0 }, { name: 'a poor mobile connection', latency: 0.35, jitter: 0.3, loss: 0.15 }]) {
  test(`another player's ${kind} over ${conditions.name}: shown where it is and facing the way it goes, smoothly, never jumping, and stopping where it stops`, async () => {
    const net = network(conditions);
    const ta = createWebTransport({ online: net.online('a'), zone: ZONE_ID, now: net.now, every: net.every, never: () => {} });
    const tb = createWebTransport({ online: net.online('b'), zone: ZONE_ID, now: net.now, every: net.every, never: () => {} });
    let shown = [], shownAt = 0;
    tb.subscribe((others) => { shown = others; shownAt = net.now(); });
    let seenByA = [];
    ta.subscribe((others) => { seenByA = others; });
    const mine = { v: 1, zn: ZONE_ID, n: 'Watcher', x: 30, z: 10, h: 0 };
    tb.publish(mine);
    // (first they find each other: alone in town a game asks only every ten seconds)
    ta.publish({ v: 1, zn: ZONE_ID, n: 'Driver', x: 0, z: 0, h: Math.PI / 2, ...field, vl: [0, 0] });
    for (let i = 0; i < 12 && !(seenByA.length && shown.length); i += 1) await net.advance(10);
    assert.ok(shown.some((o) => o.state.n === 'Driver') && seenByA.length, 'each sees the other');
    await net.advance(3);
    const trace = [];
    const dt = 1 / 30;
    let t = 0;
    let worst = 0, worstJump = 0, last = null, worstTurn = 0;
    for (; t < 16; t += dt) {
      const p = path(t);
      ta.publish({ v: 1, zn: ZONE_ID, n: 'Driver', x: Math.round(p.x * 10) / 10, z: Math.round(p.z * 10) / 10, h: Math.round(p.h * 100) / 100, ...field, vl: [Math.round(p.vx * 100) / 100, Math.round(p.vz * 100) / 100] });
      await net.advance(dt);
      const heard = shown.find((o) => o.state.n === 'Driver');
      if (!heard) continue;
      // (what the player sees: as the game draws it, carried on from the last word at its speed: main.js peersNow)
      const k = Math.min(0.3, net.now() - shownAt), vl = heard.state.vl || [0, 0];
      const them = { state: { ...heard.state, x: heard.state.x + vl[0] * k, z: heard.state.z + vl[1] * k } };
      const truth = path(t + dt);
      const err = Math.hypot(them.state.x - truth.x, them.state.z - truth.z);
      if (t > 2) worst = Math.max(worst, err);
      if (t > 2) worstTurn = Math.max(worstTurn, turnGap(them.state.h, truth.h));
      if (last) worstJump = Math.max(worstJump, Math.hypot(them.state.x - last.x, them.state.z - last.z));
      last = { x: them.state.x, z: them.state.z };
      trace.push(err);
    }
    // what it was before 16 October 2026 (moved from where it was shown to where it was heard, over the time
    // between words, and put there at once if that was more than 25 m): 15 to 23 m behind on average, and jumping
    // up to 40 m. Now: within a metre or so on a good connection, a few metres on a poor one, and never a jump.
    const mean = trace.slice(60).reduce((a, b) => a + b, 0) / trace.slice(60).length;
    if (process.env.TRACE) console.log('SUMMARY', kind, conditions.name, worst.toFixed(2), mean.toFixed(2), worstJump.toFixed(2), worstTurn.toFixed(2));
    const limits = conditions.loss ? { worst: 30, mean: 6, step: 4.5 } : { worst: 6, mean: 1.5, step: 1.5 };
    assert.ok(worstJump < limits.step, `never jumps: the largest step shown from one frame to the next was ${worstJump.toFixed(2)} m (it really moves 0.6 m a frame)`);
    assert.ok(worst < limits.worst, `close to where it really is: at worst ${worst.toFixed(2)} m out`);
    assert.ok(mean < limits.mean, `on average ${mean.toFixed(2)} m out`);
    // facing the way it goes, round the bend too (it turns as it was turning when last heard: before, it faced the way
    // it had last been heard to face, 0.6 rad out in the bend on a good connection and 0.95 on a poor one)
    assert.ok(worstTurn < (conditions.loss ? 0.85 : 0.52), `facing the way it goes: at worst ${worstTurn.toFixed(2)} rad out`);
    // stopped: shown where it stopped, not carried on past it
    await net.advance(3);
    const end = path(100), them = shown.find((o) => o.state.n === 'Driver');
    assert.ok(Math.hypot(them.state.x - end.x, them.state.z - end.z) < 0.3, `stopped at ${them.state.x}, ${them.state.z}`);
    ta.close(); tb.close();
  });
}

test('the website is asked more often while a vehicle is moving near another player (so it keeps up), seldom otherwise', async () => {
  const net = network({ latency: 0.05, jitter: 0, loss: 0 });
  let asked = 0;
  const base = net.online('a');
  const online = { signedIn: true, ask: (...args) => { asked += 1; return base.ask(...args); } };
  const ta = createWebTransport({ online, zone: ZONE_ID, now: net.now, every: net.every, never: () => {} });
  const tb = createWebTransport({ online: net.online('b'), zone: ZONE_ID, now: net.now, every: net.every, never: () => {} });
  tb.subscribe(() => {}); ta.subscribe(() => {});
  tb.publish({ v: 1, zn: ZONE_ID, n: 'B', x: 5, z: 0, h: 0 });
  ta.publish({ v: 1, zn: ZONE_ID, n: 'A', x: 0, z: 0, h: 0 });
  await net.advance(12);
  asked = 0;
  await net.advance(6);
  const walking = asked;
  ta.publish({ v: 1, zn: ZONE_ID, n: 'A', x: 0, z: 0, h: 0, vh: { k: 'keke' }, vl: [12, 0] });
  asked = 0;
  await net.advance(6);
  assert.ok(walking <= 6 && asked >= 10, `standing near: ${walking} in 6 s; driving: ${asked}`);
  ta.close(); tb.close();
});
