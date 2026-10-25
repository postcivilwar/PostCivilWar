// Tests of the guns' parts in the page that need no browser (25 October 2026): the rounds found in the owner's own
// recordings, the word about rounds with the website's server (gun-net.js), what the others are told of a player with a
// gun (link.js), and the wounds kept on a body (wound-paint.js). The rest (the model, the pose, the screen, the sound
// played) is tried in a browser: test/guns.mjs.
//
//   node --test test/gun-client.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findShots } from '../src/client/gun-audio.js';
import { GUN_SOUNDS } from '../src/client/gun-sound-files.js';
import { createGunNet } from '../src/net/gun-net.js';
import { encodePlayer, decodePlayer, trimPlayer, STATE_MOST, SHOT_KINDS } from '../src/net/link.js';
import { GUNS } from '../src/sim/guns.js';

globalThis.THREE = globalThis.THREE || createRequire(import.meta.url)('../vendor/three.min.js');
const { woundAt, woundPlace, addWound, WOUND_BONES, MOST_WOUNDS } = await import('../src/client/wound-paint.js');

const here = dirname(fileURLToPath(import.meta.url));

// A WAV file's samples, each channel from -1 to 1 (the owner's are 16-bit)
function readWav(path) {
  const b = readFileSync(path);
  assert.equal(b.toString('ascii', 0, 4), 'RIFF');
  let o = 12, fmt = null, data = null;
  while (o + 8 <= b.length) {
    const id = b.toString('ascii', o, o + 4), size = b.readUInt32LE(o + 4);
    if (id === 'fmt ') fmt = { format: b.readUInt16LE(o + 8), channels: b.readUInt16LE(o + 10), rate: b.readUInt32LE(o + 12), bits: b.readUInt16LE(o + 22) };
    if (id === 'data') data = b.subarray(o + 8, o + 8 + size);
    o += 8 + size + (size % 2);
  }
  assert.ok(fmt && data && fmt.format === 1 && fmt.bits === 16, 'a 16-bit PCM recording');
  const n = data.length / 2 / fmt.channels;
  const channels = Array.from({ length: fmt.channels }, () => new Float32Array(n));
  for (let i = 0; i < n; i += 1) for (let c = 0; c < fmt.channels; c += 1) channels[c][i] = data.readInt16LE((i * fmt.channels + c) * 2) / 32768;
  return { ...fmt, channels, seconds: n / fmt.rate };
}

test('the owner\'s four recordings of the rifle are in the game, and each round in them is found to be played alone', () => {
  assert.equal(GUN_SOUNDS.rifle.length, 4);
  const gap = 60 / GUNS.rifle.rpm;
  for (const name of GUN_SOUNDS.rifle) {
    const wav = readWav(resolve(here, '../assets/weapons/rifle/sound', name));
    const shots = findShots(wav.channels, wav.rate);
    assert.ok(shots.length >= 6, `${name}: ${shots.length} rounds found`);
    assert.ok(shots[0].start < 0.03, `${name}: the first round at the very start`);
    for (let k = 1; k < shots.length; k += 1) {
      const apart = shots[k].start - shots[k - 1].start;
      // (a machine gun's rounds: about as far apart as the rifle fires, never two found in one)
      assert.ok(apart > 0.04 && apart < 0.16, `${name}: rounds ${k - 1} and ${k} ${apart.toFixed(3)} s apart (the rifle: ${gap.toFixed(3)})`);
      assert.ok(Math.abs(shots[k - 1].gap - apart) < 1e-9);
    }
    assert.equal(shots[shots.length - 1].gap, null, 'the last round runs on to the end (its echo)');
  }
});

test('the rounds go to the server with the next word, are sent again if a word is lost, and are counted once', () => {
  let clock = 100;
  const net = createGunNet({ now: () => clock });
  assert.match(net.sid, /^[A-Za-z0-9_-]{8,40}$/, 'a session the server takes');
  assert.deepEqual(net.body(), { ack: 0 }, 'nothing fired: only the last hit taken');
  const who = `u${'ab12'.repeat(5)}`;
  assert.equal(net.fire({ t: 1.5, gun: 'rifle', o: [1.234, 1.5, -2], d: [0.6, 0, 0.8] }), 1);
  assert.equal(net.fire({ t: 1.571, gun: 'rifle', o: [1.234, 1.5, -2], d: [0.6, 0, 0.8], hit: { who, at: [10.123, 1.2, 5] } }), 2);
  // (one that says it hit someone the server does not know the name of: sent with no hit)
  net.fire({ t: 1.64, gun: 'rifle', o: [0, 1, 0], d: [1, 0, 0], hit: { who: 'Ada', at: [1, 1, 1] } });
  assert.ok(net.urgent());
  const first = net.body();
  assert.equal(first.fire.sid, net.sid);
  assert.deepEqual(first.fire.s.map((s) => s[0]), [1, 2, 3]);
  assert.deepEqual(first.fire.s[1], [2, 1.571, 'rifle', [1.23, 1.5, -2], [0.6, 0, 0.8], { who, at: [10.12, 1.2, 5] }]);
  assert.equal(first.fire.s[2].length, 5, 'no hit claimed for a name that is not one');
  // the word is lost: the same rounds go again with the next
  net.answer(null);
  assert.deepEqual(net.body().fire.s.map((s) => s[0]), [1, 2, 3]);
  const seen = [];
  net.onAnswer((a) => seen.push(a));
  net.answer({ ok: true, fire: { ok: [1, 2], no: [[3, 'RATE']], hit: [[2, who]], gun: 'rifle', mag: 28, spare: 120 }, struck: [{ id: 5, by: who, dmg: 1 }, { id: 4, by: who, dmg: 1 }] });
  assert.equal(seen.length, 1);
  assert.deepEqual(seen[0].sent.map((s) => s[0]), [1, 2, 3], 'told which rounds the answer is to');
  assert.equal(seen[0].struck.length, 2);
  assert.equal(net.waiting, 0);
  assert.equal(net.urgent(), false);
  assert.deepEqual({ ok: net.stats.ok, refused: net.stats.refused, hits: net.stats.hits, codes: net.stats.codes }, { ok: 2, refused: 1, hits: 1, codes: { RATE: 1 } });
  // the hits on this player taken: the next word says so, and those taken are not told again
  net.took(5); net.took(4);
  assert.deepEqual(net.body(), { ack: 5 });
  net.answer({ ok: true, struck: [{ id: 5, dmg: 1 }, { id: 6, dmg: 1 }] });
  assert.deepEqual(seen[1].struck.map((s) => s.id), [6]);
  // rounds not told within two minutes (the connection lost) are let go; a slow word's are not
  net.fire({ t: 9, gun: 'rifle', o: [0, 1, 0], d: [1, 0, 0] });
  clock += 40;
  assert.equal(net.body().fire.s.length, 1, 'still sent after a slow while');
  net.answer(null);
  clock += 90;
  assert.deepEqual(net.body(), { ack: 5 });
  assert.equal(net.stats.lost, 1);
  // the server could not take them just then (too many at once): they go again; a word it could not read: let go
  net.fire({ t: 15, gun: 'rifle', o: [0, 1, 0], d: [1, 0, 0] });
  const busyWord = net.body().fire.s.map((x) => x[0]);
  net.answer({ ok: true, fire: { error: 'TOO_MANY' } });
  assert.deepEqual(net.body().fire.s.map((x) => x[0]), busyWord, 'sent again');
  net.answer({ ok: true, fire: { error: 'BAD_REQUEST' } });
  assert.equal(net.waiting, 0, 'let go');
  // no more than the server takes in one word
  for (let i = 0; i < 40; i += 1) net.fire({ t: 20 + i * 0.08, gun: 'rifle', o: [0, 1, 0], d: [1, 0, 0] });
  assert.equal(net.body().fire.s.length, 24);
  net.answer({ ok: true, fire: { ok: [], no: [] } });
  assert.equal(net.body().fire.s.length, 16, 'the rest with the next word');
});

// a player with the gun out, as the town's view has them
function armed(extra = {}) {
  return {
    name: 'Ada Okafor', x: 12.34, z: -56.78, heading: 1.234, lang: 'en', look: { skin: 1, top: 2, bottom: 3, body: 'f', figure: 'w2', colours: { top: '#aa3344', skirt: '#223344', shoes: '#ffffff', hair: '#111111' } },
    health: 87.4, gy: 2.345,
    gun: { equipped: 'rifle', out: true, aim: 2, crouch: true, reloading: { left: 0.6, total: 2.4 } },
    gunAim: { yaw: 1.2345, pitch: -0.123 },
    gunShots: [{ q: 7, ago: 0.123, o: [1.23, 1.45, 2.34], e: [30.12, 1.2, 5.67], what: 'person' }],
    wounds: [[3, 0.0712, 0.0123, -0.0456, 1.6]],
    ...extra,
  };
}

test('a reload done goes to the server in its place among the rounds: once every round before it has gone, and again until it is answered', () => {
  let clock = 0;
  const net = createGunNet({ now: () => clock });
  for (let i = 0; i < 30; i += 1) net.fire({ t: 1 + i * 0.071, gun: 'rifle', o: [0, 1, 0], d: [1, 0, 0] });
  // the reload done after round 30 (begun at t = 4): it waits until rounds 25 to 30 go (24 a word)
  net.reload({ gun: 'rifle', t: 4 });
  assert.ok(net.urgent());
  const first = net.body();
  assert.deepEqual(first.fire.s.map((x) => x[0]), Array.from({ length: 24 }, (_, k) => k + 1));
  assert.equal(first.fire.r, undefined, 'not before the rounds ahead of it');
  net.answer({ ok: true, fire: { ok: first.fire.s.map((x) => x[0]), no: [] } });
  net.fire({ t: 7, gun: 'rifle', o: [0, 1, 0], d: [1, 0, 0] });
  const second = net.body();
  assert.deepEqual(second.fire.s.map((x) => x[0]), [25, 26, 27, 28, 29, 30, 31]);
  assert.deepEqual(second.fire.r, [[30, 4, 'rifle']], 'with the last rounds before it, and the one after it');
  // the word lost: all of it again; an answer that says nothing of the reload: the reload again
  net.answer(null);
  assert.deepEqual(net.body().fire.r, [[30, 4, 'rifle']]);
  net.answer({ ok: true, fire: { ok: [25, 26, 27, 28, 29, 30, 31], no: [] } });
  assert.deepEqual(net.body().fire.r, [[30, 4, 'rifle']]);
  net.answer({ ok: true, fire: { ok: [], no: [], r: [[30, 'ok']] } });
  assert.equal(net.waiting, 0);
  assert.equal(net.stats.reloads, 1);
  assert.deepEqual(net.body(), { ack: 0 });
});

test('the others are told the gun in a player\'s hands, how it is held and aimed, the rounds lately, the wounds and the ground', () => {
  const state = encodePlayer(armed(), 'atani');
  assert.deepEqual(state.gn, ['rifle', 2, 1, 0.75, 1.23, -0.12]);
  assert.equal(state.hp, 87);
  assert.equal(state.gy, 2.3);
  assert.deepEqual(state.sh, [[7, 0.12, 1.2, 1.5, 2.3, 30.1, 1.2, 5.7, SHOT_KINDS.indexOf('person')]]);
  assert.deepEqual(state.wd, [[3, 0.071, 0.012, -0.046, 1.6]]);
  const back = decodePlayer(JSON.parse(JSON.stringify(state)), 'atani');
  assert.deepEqual(back.gun, { id: 'rifle', out: true, aim: 2, crouch: true, reload: 0.75, yaw: 1.23, pitch: -0.12 });
  assert.deepEqual(back.shots, [{ q: 7, ago: 0.12, o: [1.2, 1.5, 2.3], e: [30.1, 1.2, 5.7], what: 'person' }]);
  assert.deepEqual(back.wounds, [[3, 0.071, 0.012, -0.046, 1.6]]);
  assert.equal(back.health, 87);
  // put away: no gun
  const holstered = encodePlayer(armed({ gun: { equipped: 'rifle', out: false }, gunShots: [], wounds: [] }), 'atani');
  assert.equal(holstered.gn, undefined);
  assert.equal(decodePlayer(holstered, 'atani').gun, null);
});

test('a player\'s word is never longer than the server takes: the rounds and the wounds give way first, and what was said is kept', () => {
  const many = armed({
    gunShots: Array.from({ length: 12 }, (_, k) => ({ q: 100 + k, ago: k * 0.07, o: [1234.56, 12.34, -1234.56], e: [-1234.56, 12.34, 1234.56], what: 'wall' })),
    wounds: Array.from({ length: 8 }, (_, k) => [k, 0.12345, -0.12345, 0.12345, 3.3]),
    said: { seq: 41, text: 'x'.repeat(140), lang: 'en' },
    ownBikes: { parked: Array.from({ length: 3 }, (_, k) => ({ bike: `bike-${k}`, x: 12 + k, z: -56, h: 0.5, fallen: true, ago: 12.5 })) },
    parkedKekes: Array.from({ length: 2 }, (_, k) => ({ id: `keke-${k}`, x: 13, z: -55 + k, heading: 0.1, plate: `AT-${k}`, look: { trim: 'chrome', paint: 'green', canopy: 'yellow', seat: 'black', floor: 'rubber', wear: 0.3, dirt: 0.2, slogan: 'God is good', number: 'AT 123 XY', extras: ['radio', 'mirror'] } })),
    ownCars: { parked: Array.from({ length: 3 }, (_, k) => ({ car: `car-${k}`, x: 11, z: -57 - k, h: 0.3 })) },
  });
  const full = JSON.stringify(encodePlayer({ ...many }, 'atani'));
  assert.ok(full.length <= STATE_MOST, `${full.length} characters`);
  const state = JSON.parse(full);
  assert.equal(state.say.t, 'x'.repeat(140), 'what was said is kept');
  assert.ok(state.gn && state.hp && state.gy !== undefined, 'the gun, the health and the ground are kept');
  // given more than fits, the oldest wounds go first, then the oldest rounds
  const rounds = (n) => Array.from({ length: n }, (_, k) => [k, 0, 1, 1, 1, 1, 1, 1, 1]);
  const wounds = (n) => Array.from({ length: n }, (_, k) => [k % 20, 0.1, k, 0.1, 1]);
  const some = trimPlayer({ v: 1, zn: 'atani', n: 'A', sh: rounds(40), wd: wounds(40), say: { q: 1, t: 'y'.repeat(140) } });
  assert.ok(JSON.stringify(some).length <= STATE_MOST);
  assert.equal(some.sh.length, 40, 'the rounds kept while the wounds made room enough');
  assert.ok(some.wd.length < 40 && some.wd[some.wd.length - 1][2] === 39, 'the latest wounds kept');
  const more = trimPlayer({ v: 1, zn: 'atani', n: 'A', sh: rounds(80), wd: wounds(40), say: { q: 1, t: 'y'.repeat(140) } });
  assert.ok(JSON.stringify(more).length <= STATE_MOST);
  assert.equal(more.wd, undefined, 'the wounds all gone before a round');
  assert.ok(more.sh.length < 80 && more.sh[more.sh.length - 1][0] === 79, 'the latest rounds kept');
  assert.equal(more.say.t, 'y'.repeat(140));
});

// A figure of bones as the game's figures have them (the same names), standing at `x, z` facing `heading`
function figure(x = 0, z = 0, heading = 0) {
  const group = new THREE.Group();
  group.position.set(x, 0, z); group.rotation.y = heading;
  const body = new THREE.Group(); group.add(body);
  const bones = new Map();
  const add = (name, parent, at) => { const b = new THREE.Bone(); b.position.set(...at); (parent ? bones.get(parent) : body).add(b); bones.set(name, b); return b; };
  add('pelvis', null, [0, 0.95, 0]); add('spine_01', 'pelvis', [0, 0.1, 0]); add('spine_02', 'spine_01', [0, 0.12, 0]); add('spine_03', 'spine_02', [0, 0.14, 0]);
  add('neck_01', 'spine_03', [0, 0.18, 0]); add('head', 'neck_01', [0, 0.1, 0]);
  for (const [s, x0] of [['l', 1], ['r', -1]]) {
    add(`clavicle_${s}`, 'spine_03', [0.04 * x0, 0.14, 0]); add(`upperarm_${s}`, `clavicle_${s}`, [0.15 * x0, 0, 0]); add(`lowerarm_${s}`, `upperarm_${s}`, [0, -0.28, 0]); add(`hand_${s}`, `lowerarm_${s}`, [0, -0.25, 0]);
    add(`thigh_${s}`, 'pelvis', [0.1 * x0, -0.05, 0]); add(`calf_${s}`, `thigh_${s}`, [0, -0.43, 0]); add(`foot_${s}`, `calf_${s}`, [0, -0.42, 0.05]);
  }
  group.updateMatrixWorld(true);
  return { group, body, bones, spec: { height: 1.75 } };
}

test('a round in the chest leaves its wound on the chest, on the side it came from, and the wound moves with the body', () => {
  const rig = figure(5, 5, 0);
  // from in front (the figure faces +z): into the middle of the chest
  const point = new THREE.Vector3(5, 1.3, 5.12);
  const w = woundAt(rig, point, new THREE.Vector3(0, 0, -1));
  assert.ok(['spine_02', 'spine_03'].includes(WOUND_BONES[w[0]]), WOUND_BONES[w[0]]);
  assert.ok(w[1] > 0.04, 'ahead of the bone, on the front of the body');
  const at = woundPlace(rig, w);
  assert.ok(Math.hypot(at[0] - 5, at[1] - 1.3, at[2] - 5.13) < 0.08, `where it struck: ${at.map((k) => k.toFixed(2))}`);
  // the figure turns about: the wound goes round with it, to its back as it is now seen
  rig.group.rotation.y = Math.PI; rig.group.updateMatrixWorld(true);
  const turned = woundPlace(rig, w);
  assert.ok(turned[2] < 4.95, `on the front of a figure facing the other way: z ${turned[2].toFixed(2)}`);
  // the left arm, from the figure's left
  const arm = woundAt(figure(0, 0, 0), new THREE.Vector3(0.2, 1.2, 0), new THREE.Vector3(-1, 0, 0));
  assert.ok(/arm_l|clavicle_l/.test(WOUND_BONES[arm[0]]), WOUND_BONES[arm[0]]);
  assert.equal(woundAt({}, point, new THREE.Vector3(0, 0, -1)), null, 'no bones, no wound');
});

test('wounds close together run into one larger stain, and no more than eight are kept', () => {
  const list = [];
  addWound(list, [3, 0.1, 0.1, 0.1, 1]);
  addWound(list, [3, 0.11, 0.1, 0.1, 1]);
  assert.equal(list.length, 1);
  assert.ok(list[0][4] > 1, 'larger');
  addWound(list, [3, 0.3, 0.1, 0.1, 1]);
  addWound(list, [4, 0.1, 0.1, 0.1, 1]);
  assert.equal(list.length, 3, 'far apart, or by another bone: their own');
  for (let k = 0; k < 20; k += 1) addWound(list, [k % 20, 0.5, k * 0.1, 0, 1]);
  assert.equal(list.length, MOST_WOUNDS);
  addWound(list, null);
  assert.equal(list.length, MOST_WOUNDS);
});
