// PostCivilWar PowerBike (src/sim/zones/atani-powerbike.js): the motorcycle showroom beside HOLARIS. Where it stands
// and what is in its hall; the one way in (the pink column) and the one way out (the mat by the doors); the salesman,
// worked out the same on every device; another player asking him about a motorcycle, as the town hears of it; the
// camera kept inside the hall; and the hands and heads of two people talking.
//   node --test test/powerbike.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as Z from '../src/sim/zone.js';
import { POWER_BIKES } from '../src/sim/power-bikes.js';
import { createSalesman, SALESMAN } from '../src/sim/salesman.js';
import { encodePlayer, decodePlayer } from '../src/net/link.js';
import { newWorld } from './helpers.mjs';

const require = createRequire(import.meta.url);
globalThis.THREE = require('../vendor/three.min.js');
const { createCameraRig } = await import('../src/client/camera.js');
const { talkGesture } = await import('../src/client/talk-gestures.js');

const P = Z.POWERBIKE;
const H = P.hall;
const footprintOf = (b) => ({ x0: b.x - b.w / 2, x1: b.x + b.w / 2, z0: b.z - b.d / 2, z1: b.z + b.d / 2 });
const overlap = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1;
const gapOf = (a, b) => { let d = (a - b) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return Math.abs(d); };

test('the tower stands beside HOLARIS Watch with room between them, on open ground, the only one of its kind', () => {
  const tower = Z.ZONE_BUILDINGS.filter((b) => b.kind === 'tower');
  assert.equal(tower.length, 1, 'one building, not two');
  assert.equal(tower[0].id, 'powerbike');
  assert.equal(tower[0].sign, 'POSTCIVILWAR POWERBIKE');
  const t = footprintOf(tower[0]), holaris = footprintOf(Z.zoneBuilding('holaris'));
  // west of HOLARIS, the two fronts facing the same way, a reasonable distance apart
  assert.ok(t.x1 < holaris.x0, 'to the west of it');
  const gap = holaris.x0 - t.x1;
  assert.ok(gap >= 8 && gap <= 14, `${gap.toFixed(1)} m between them`);
  assert.ok(Math.abs(t.z1 - holaris.z1) < 8, 'their fronts nearly in line');
  // nothing else stands where it does
  for (const b of Z.ZONE_BUILDINGS) if (b.id !== 'powerbike') assert.ok(!overlap(t, footprintOf(b)), b.id);
  for (const r of Z.ZONE_ROADS) assert.ok(!overlap(t, r), `road ${r.id}`);
  // HOLARIS keeps its own: its shop, its column, its attendant
  const shop = Z.zoneShop('holaris');
  assert.deepEqual([shop.marker.x, shop.marker.z], [-26, 55.4]);
  assert.equal(Z.ZONE_SHOPS.length, 1, 'the showroom is not a second shop with a column of its own in the shops\' list');
});

test('one pink column before the doors, clear of everything; set down inside and outside where there is room', () => {
  const walk = (x, z) => Z.zoneWalkable(x, z, [], 0.3);
  const c = P.portal;
  assert.ok(walk(c.x, c.z), 'the column stands on open ground');
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) assert.ok(walk(c.x + Math.sin(a) * (c.radius + 1), c.z + Math.cos(a) * (c.radius + 1)), 'and can be walked into from every side');
  assert.ok(c.z > P.footprint.z1 + 2, 'before the porch, out of the building');
  assert.ok(walk(P.leave.x, P.leave.z) && Math.hypot(P.leave.x - c.x, P.leave.z - c.z) > c.radius + 0.9, 'outside: set down beside it, not in it again');
  assert.ok(walk(P.arrive.x, P.arrive.z) && Z.inPowerbikeHall(P.arrive.x, P.arrive.z, 0.5), 'inside: just within the doors');
  assert.ok(!Z.onPowerbikeExit(P.arrive.x, P.arrive.z), 'not on the mat that takes them out');
  assert.ok(walk(P.home.x, P.home.z), 'the salesman\'s place by his desk');
});

test('the hall: seventeen motorcycles, each on its own stand with room all round; walled but for the way in and out', () => {
  assert.equal(P.displays.length, 17);
  assert.deepEqual(P.displays.map((d) => d.bike).sort(), Object.keys(POWER_BIKES).sort(), 'every motorcycle, once');
  assert.equal(P.displays.filter((d) => d.stand === 'turntable').length, 1);
  for (const d of P.displays) {
    assert.ok(Z.inPowerbikeHall(d.x, d.z, d.r + 1), `${d.bike} is well inside the hall`);
    assert.ok(!Z.zoneWalkable(d.x, d.z, [], 0.3), `${d.bike}: its stand is not walked through`);
    // a person can walk all round it, a step off its stand
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) assert.ok(Z.zoneWalkable(d.x + Math.sin(a) * (d.r + 0.75), d.z + Math.cos(a) * (d.r + 0.75), [], 0.3), `${d.bike}: round it at ${a.toFixed(2)}`);
    for (const e of P.displays) if (e !== d) assert.ok(Math.hypot(d.x - e.x, d.z - e.z) - d.r - e.r >= 1.6, `${d.bike} and ${e.bike} have room between them`);
  }
  // from just inside the doors every stand can be walked to; nothing walked to inside leads out of the hall
  const step = 0.25, seen = new Set(), queue = [[P.arrive.x, P.arrive.z]];
  const key = (x, z) => `${Math.round(x / step)},${Math.round(z / step)}`;
  seen.add(key(P.arrive.x, P.arrive.z));
  let escaped = false;
  while (queue.length) {
    const [x, z] = queue.shift();
    if (!Z.inPowerbikeHall(x, z)) { escaped = true; break; }
    for (const [dx, dz] of [[step, 0], [-step, 0], [0, step], [0, -step]]) {
      const nx = x + dx, nz = z + dz, k = key(nx, nz);
      if (seen.has(k) || !Z.zoneWalkable(nx, nz, [], 0.3)) continue;
      seen.add(k); queue.push([nx, nz]);
    }
  }
  assert.equal(escaped, false, 'the hall\'s walls hold: inside, nobody walks out but by the mat');
  for (const d of P.displays) assert.ok(seen.has(key(Math.round((d.x + Math.sin(d.h) * (d.r + 0.75)) / step) * step, Math.round((d.z + Math.cos(d.h) * (d.r + 0.75)) / step) * step)), `${d.bike} can be walked up to`);
  assert.ok(seen.size * step * step > 300, `${(seen.size * step * step).toFixed(0)} m² of floor to walk about`);
});

test('in by the column and out by the mat, through the simulation; and not otherwise', () => {
  const { host, id } = newWorld('Showroom Visitor');
  const p = host.game.state.players[id];
  const put = (x, z) => { p.x = x; p.z = z; p.lastMoveAt = host.game.state.real; };
  put(P.portal.x + 8, P.portal.z + 3);
  let r = host.game.intent(id, { type: 'showroom.in' });
  assert.equal(r.code, 'TOO_FAR', 'from away from the column: no');
  put(P.portal.x + 0.4, P.portal.z - 0.3);
  r = host.game.intent(id, { type: 'showroom.in' });
  assert.ok(r.ok, r.message);
  assert.deepEqual([p.x, p.z], [P.arrive.x, P.arrive.z]);
  assert.ok(Z.inPowerbikeHall(p.x, p.z));
  // a walk can never take them through a wall: a move that jumps out is refused
  assert.equal(host.game.intent(id, { type: 'move', x: P.leave.x, z: P.leave.z, heading: 0 }).ok, false);
  // out: only from the doors
  put(-52.4 + 1, 40.6);
  assert.equal(host.game.intent(id, { type: 'showroom.out' }).code, 'TOO_FAR');
  put((P.exit.x0 + P.exit.x1) / 2, (P.exit.z0 + P.exit.z1) / 2);
  r = host.game.intent(id, { type: 'showroom.out' });
  assert.ok(r.ok, r.message);
  assert.deepEqual([p.x, p.z], [P.leave.x, P.leave.z]);
  assert.equal(host.game.intent(id, { type: 'showroom.out' }).code, 'NOT_INSIDE');
  // a motorcycle of the player's own is not brought indoors
  put(P.arrive.x, P.arrive.z);
  assert.ok(Z.inPowerbikeHall(p.x, p.z));
});

// the salesman, stepped as a device steps him: a frame at a time, by the wall clock
function run(s, seconds, customers, from = 1000, dt = 1 / 30) {
  const seen = [];
  for (let t = 0; t < seconds; t += dt) { const c = typeof customers === 'function' ? customers(from + t) : customers; seen.push({ ...s.step(dt, { now: from + t, customers: c }) }); }
  return seen;
}
const clear = (st) => Z.zoneWalkable(st.x, st.z, [], 0.2) && Z.inPowerbikeHall(st.x, st.z, 0.2);

test('the salesman: at his desk when nobody is in; with a customer, a step to their side; never in a wall or a stand', () => {
  const s = createSalesman();
  let seen = run(s, 4, []);
  assert.equal(seen.at(-1).mode, 'home');
  assert.ok(Math.hypot(seen.at(-1).x - P.home.x, seen.at(-1).z - P.home.z) < 0.3);
  // one customer, standing at the Red Superbike: he comes over and stands beside them, facing them
  const red = P.displays.find((d) => d.bike === 'red-superbike');
  const c = { id: 'p:a', x: red.x + Math.sin(red.h) * (red.r + 0.9), z: red.z + Math.cos(red.h) * (red.r + 0.9), heading: red.h + Math.PI, talking: null, since: 0 };
  seen = run(s, 25, [c]);
  assert.ok(seen.every(clear), 'he never walks into anything');
  const end = seen.at(-1);
  assert.equal(end.with, 'p:a');
  assert.equal(end.mode, 'assist', 'at a motorcycle: showing it to them');
  const d = Math.hypot(end.x - c.x, end.z - c.z);
  assert.ok(d > 1.0 && d < 2.0, `${d.toFixed(2)} m from them`);
  assert.ok(gapOf(Math.atan2(c.x - end.x, c.z - end.z), end.heading) < 0.25, 'facing them');
  assert.ok(seen.some((st) => st.speed > SALESMAN.walk * 0.8), 'he walked over, at a walk');
  // they walk off across the floor: he keeps with them
  const away = { ...c, x: -76.2, z: 40.6 };
  seen = run(s, 20, [away], 1030);
  assert.ok(seen.every(clear));
  assert.ok(Math.hypot(seen.at(-1).x - away.x, seen.at(-1).z - away.z) < 2.2);
});

test('the salesman is the same on every device, from the same people in the hall and the same clock', () => {
  const a = createSalesman(), b = createSalesman();
  const people = (now) => [
    { id: 'p:x', x: -60 + Math.sin(now * 0.2) * 6, z: 46, heading: 0, talking: null, since: 0 },
    { id: 'p:y', x: -70, z: 40.6 + Math.cos(now * 0.13) * 2, heading: 1, talking: now > 1015 ? 'chopper' : null, since: 1015 },
  ];
  const ra = run(a, 30, people), rb = run(b, 30, people);
  assert.deepEqual(ra.at(-1), rb.at(-1));
  assert.ok(ra.every(clear) && rb.every(clear));
  // a player who comes into a busy hall sees him where he is for the others, at once (not walking from his desk)
  const c = createSalesman();
  c.rejoin();
  const first = c.step(1 / 30, { now: 1031, customers: people(1031) });
  assert.ok(Math.hypot(first.x - P.home.x, first.z - P.home.z) > 3, 'not at his desk');
});

test('the salesman: with two, he keeps to one; asked about a bike, he goes to who asked first; a busy floor, he walks it', () => {
  const s = createSalesman();
  const at = (bike, side = 1) => { const d = P.displays.find((x) => x.bike === bike); return { x: d.x + side * (d.r + 0.9), z: d.z }; };
  const A = { id: 'p:a', ...at('chopper'), heading: 0, talking: null, since: 0 };
  const B = { id: 'p:b', ...at('gold-tourer', -1), heading: 0, talking: null, since: 0 };
  let seen = run(s, 15, [A, B]);
  const keptTo = seen.at(-1).with;
  assert.ok(['p:a', 'p:b'].includes(keptTo));
  assert.ok(seen.slice(-60).every((st) => st.with === keptTo), 'not to and fro between them');
  // both ask, B first: he is B's
  seen = run(s, 15, [{ ...A, talking: 'chopper', since: 20 }, { ...B, talking: 'gold-tourer', since: 12 }], 1015);
  assert.equal(seen.at(-1).mode, 'talk');
  assert.equal(seen.at(-1).with, 'p:b');
  assert.equal(seen.at(-1).talking, 'gold-tourer');
  assert.ok(Math.hypot(seen.at(-1).x - B.x, seen.at(-1).z - B.z) < 2.0);
  // four in the hall, nobody asking: he walks the floor, the same round for everyone
  const many = [A, B, { id: 'p:c', ...at('black-bobber'), heading: 0 }, { id: 'p:d', ...at('streetfighter'), heading: 0 }];
  seen = run(s, 40, many, 1040);
  assert.equal(seen.at(-1).mode, 'roam');
  const places = new Set(seen.map((st) => `${Math.round(st.x)},${Math.round(st.z)}`));
  assert.ok(places.size > 8, 'he moves about');
  assert.ok(seen.every(clear));
});

test('another player asking about a motorcycle: sent with them, heard only for one of the bikes and only in the hall', () => {
  const self = { name: 'Asker', x: -63.6, z: 46.2, heading: 0, lang: 'en', look: { skin: 0x5a3620, top: 0x1f5c4d, bottom: 0x111111, body: 'm' }, talk: { bike: 'red-superbike', ago: 4.2 } };
  const wire = JSON.parse(JSON.stringify(encodePlayer(self, Z.ZONE.id)));
  assert.deepEqual(wire.tk, ['red-superbike', 4.2]);
  assert.deepEqual(decodePlayer(wire, Z.ZONE.id).talk, { bike: 'red-superbike', ago: 4.2 });
  const { host, id } = newWorld('Listener');
  const seen = (peer, data) => host.game.visitors.seen(peer, data);
  seen('one', { name: 'Asker', x: -63.6, z: 46.2, heading: 0, talk: { bike: 'red-superbike', ago: 4.2 } });
  seen('two', { name: 'Outside', x: -63.6, z: 62, heading: 0, talk: { bike: 'red-superbike', ago: 1 } });
  seen('three', { name: 'Wrong', x: -60, z: 46.2, heading: 0, talk: { bike: 'no-such-bike', ago: 1 } });
  const players = host.game.view(id).players;
  const by = (name) => players.find((q) => q.name === name);
  assert.equal(by('Asker').talk.bike, 'red-superbike');
  const since = by('Asker').talk.since;
  assert.ok(Math.abs(since - (host.game.state.real - 4.2)) < 0.01, 'when it began, by this town\'s clock');
  assert.equal(by('Outside').talk, null, 'not outside the hall');
  assert.equal(by('Wrong').talk, null, 'not about something that is not on the floor');
  // heard again a moment later, it is the same conversation: its beginning does not move
  host.tick(0.5);
  seen('one', { name: 'Asker', x: -63.6, z: 46.2, heading: 0, talk: { bike: 'red-superbike', ago: 4.7 } });
  assert.equal(host.game.view(id).players.find((q) => q.name === 'Asker').talk.since, since);
});

test('in the hall the camera stays inside its walls and under its ceiling, wherever it is turned', () => {
  const camera = new THREE.PerspectiveCamera(60, 1.6, 0.1, 500);
  const rig = createCameraRig(camera, { blocked: () => false });
  const room = { x0: H.x0, z0: H.z0, x1: H.x1, z1: H.z1, top: H.ceiling };
  for (const [tx, tz] of [[H.x0 + 1.2, (H.z0 + H.z1) / 2], [H.x1 - 1.2, H.z0 + 1.2], [-63.6, H.z1 - 1.0]]) {
    for (let yaw = 0; yaw < Math.PI * 2; yaw += Math.PI / 6) for (const pitch of [0.05, 0.5, 1.0]) {
      const cam = { yaw, pitch, dist: 9 };
      rig.snap(cam);
      for (let i = 0; i < 40; i += 1) rig.update(1 / 30, { cam, target: new THREE.Vector3(tx, 1.55, tz), heading: 0, indoors: { pitch: 0.04, maxPitch: 1.05, dist: 7.5 }, room });
      const e = camera.position;
      assert.ok(e.x > H.x0 && e.x < H.x1 && e.z > H.z0 && e.z < H.z1 && e.y < H.ceiling, `inside: ${e.toArray().map((v) => v.toFixed(2))} for ${tx},${tz} yaw ${yaw.toFixed(2)}`);
    }
  }
  // outside, the tower is solid to its top: the camera does not end up inside it
  const tall = (x, z) => (x > P.footprint.x0 && x < P.footprint.x1 && z > P.footprint.z0 && z < P.footprint.z1 ? 46 : 0);
  const outside = createCameraRig(camera, { blocked: (x, z) => x > P.footprint.x0 && x < P.footprint.x1 && z > P.footprint.z0 && z < P.footprint.z1, tall });
  // (looking at the porch from the street, the eye high behind the player: above the eaves of an ordinary building)
  const cam = { yaw: 0, pitch: 0.7, dist: 14 };
  outside.snap(cam);
  for (let i = 0; i < 60; i += 1) outside.update(1 / 30, { cam, target: new THREE.Vector3(-62, 1.55, P.footprint.z1 + 6), heading: 0 });
  assert.ok(camera.position.z > P.footprint.z1 - 0.3, `the eye ${camera.position.z.toFixed(2)} is not inside the tower`);
});

test('talking face to face: the speaker\'s hands come up and keep moving, the listener\'s rest and nod; nothing is still', () => {
  const handle = () => ({ rotation: { x: 0, y: 0, z: 0 } });
  const fresh = () => ({ head: { group: handle() }, torso: handle(), armL: { shoulder: handle(), elbow: handle() }, armR: { shoulder: handle(), elbow: handle() } });
  const pose = (r) => [r.armR.shoulder.rotation.x, r.armR.elbow.rotation.x, r.armL.shoulder.rotation.x, r.head.group.rotation.x, r.head.group.rotation.y];
  const at = (t, speaking, look = 0.4, amount = 1) => { const r = fresh(); talkGesture(r, { t, amount, speaking, look }); return pose(r); };
  // nothing at all when nothing shows
  assert.deepEqual(at(3, 1, 0.4, 0), [0, 0, 0, 0, 0]);
  // speaking, the right hand is raised in front higher than listening, and the left with it, less
  const speaking = [], listening = [];
  for (let t = 0; t < 12; t += 0.1) { speaking.push(at(t, 1)); listening.push(at(t, 0)); }
  const mean = (rows, k) => rows.reduce((a, r) => a + r[k], 0) / rows.length;
  assert.ok(mean(speaking, 0) < mean(listening, 0) - 0.25, 'the right arm forward and up to speak');
  assert.ok(mean(speaking, 0) < mean(speaking, 2), 'the right hand leads');
  // never a still pose: over a few seconds each moves
  const range = (rows, k) => Math.max(...rows.map((r) => r[k])) - Math.min(...rows.map((r) => r[k]));
  assert.ok(range(speaking, 0) > 0.2 && range(speaking, 1) > 0.25, 'the speaker\'s arms move with what is said');
  assert.ok(range(listening, 3) > 0.1, 'the listener nods now and then');
  assert.ok(range(listening, 0) > 0.02, 'and the listener\'s hands are never quite still');
  // the head turns toward the other person
  assert.ok(at(1, 0, 0.6)[4] > at(1, 0, -0.6)[4] + 0.4);
});
