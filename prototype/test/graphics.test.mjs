// The graphics levels (graphics.js) and the governor that moves between them in Auto (monitor.js): what each level
// draws, where Auto starts on each kind of device, what it keeps for the next start, how high it climbs by itself,
// and its quicker judgement in the first seconds.
//
//   node --test test/graphics.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { GRAPHICS_LEVELS, GRAPHICS_LOWERED, GRAPHICS_NOTE, LEVEL_SETTINGS, ULTRA, HIGH, MEDIUM, LOW, autoStart, autoCeiling, remembered, remember, levelOf } from '../src/client/graphics.js';
import { createGovernor, QUALITY_RULES } from '../src/client/monitor.js';

test('four levels, Ultra to Low, each with one line; the words the owner asked for', () => {
  assert.deepEqual(GRAPHICS_LEVELS.map((l) => l.name), ['Ultra', 'High', 'Medium', 'Low']);
  assert.deepEqual([ULTRA, HIGH, MEDIUM, LOW], [0, 1, 2, 3]);
  for (const l of GRAPHICS_LEVELS) { assert.ok(l.line.length > 20 && l.line.length < 120 && !l.line.includes('\n'), l.name); }
  assert.equal(GRAPHICS_LOWERED, 'Graphics lowered to keep the game smooth');
  assert.match(GRAPHICS_NOTE, /battery/); assert.match(GRAPHICS_NOTE, /warm/);
  assert.equal(levelOf('ultra'), 0); assert.equal(levelOf('low'), 3); assert.equal(levelOf('auto'), null); assert.equal(levelOf('nonsense'), null);
});

test('each level draws less than the one above it: pixels, the sun\'s shadow map, no sun shadows at Low only', () => {
  for (const key of ['pixelRatio', 'shadowMap', 'shadowSoft']) assert.equal(LEVEL_SETTINGS[key].length, 4, key);
  for (let i = 1; i < 4; i += 1) {
    assert.ok(LEVEL_SETTINGS.pixelRatio[i] < LEVEL_SETTINGS.pixelRatio[i - 1]);
    assert.ok(LEVEL_SETTINGS.shadowMap[i] <= LEVEL_SETTINGS.shadowMap[i - 1]);
  }
  assert.deepEqual(LEVEL_SETTINGS.shadowMap.map((s) => s > 0), [true, true, true, false]);
  // Medium is a phone as it was drawn before the levels (1.25 pixels for each, a 1024 shadow map); Ultra a computer
  assert.equal(LEVEL_SETTINGS.pixelRatio[MEDIUM], 1.25); assert.equal(LEVEL_SETTINGS.shadowMap[MEDIUM], 1024);
  assert.equal(LEVEL_SETTINGS.pixelRatio[ULTRA], 2); assert.equal(LEVEL_SETTINGS.shadowMap[ULTRA], 2048);
  assert.equal(LEVEL_SETTINGS.pixelRatio[LOW], 1, 'Low is never blurry: one pixel for each of the screen\'s at least');
});

test('Auto starts a phone at Medium, a computer at Ultra; lower where the device says it is weak', () => {
  assert.equal(autoStart({ lite: true, gpu: 'Adreno (TM) 642L' }), MEDIUM);
  assert.equal(autoStart({ lite: true, gpu: 'Apple GPU', memory: 4 }), MEDIUM);
  assert.equal(autoStart({ lite: true, gpu: 'Mali-G52', memory: 2 }), LOW);
  assert.equal(autoStart({ lite: false, gpu: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)' }), ULTRA);
  assert.equal(autoStart({ lite: false, gpu: 'Apple M2' }), ULTRA);
  assert.equal(autoStart({ lite: false, gpu: 'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)' }), HIGH);
  assert.equal(autoStart({ lite: false, gpu: 'ANGLE (Intel, Intel(R) Arc(TM) A770 Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)' }), ULTRA);
  // no graphics card at all (the browser drawing in software): Low, on either kind
  assert.equal(autoStart({ lite: false, gpu: 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)' }), LOW);
  assert.equal(autoStart({ lite: true, gpu: 'llvmpipe (LLVM 15.0.7, 256 bits)' }), LOW);
  // it climbs by itself to High on a phone, to Ultra on a computer
  assert.equal(autoCeiling({ lite: true }), HIGH); assert.equal(autoCeiling({ lite: false }), ULTRA);
});

test('the level Auto settled at is kept for this graphics card, and only for it', () => {
  const kept = new Map();
  const storage = { getItem: (k) => (kept.has(k) ? kept.get(k) : null), setItem: (k, v) => kept.set(k, String(v)) };
  assert.equal(remembered(storage, 'Adreno (TM) 642L'), null);
  remember(storage, 'Adreno (TM) 642L', HIGH);
  assert.equal(remembered(storage, 'Adreno (TM) 642L'), HIGH);
  assert.equal(remembered(storage, 'Mali-G52'), null);
  kept.set('pcw-graphics-auto', '{not json');
  assert.equal(remembered(storage, 'Adreno (TM) 642L'), null);
  const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  assert.equal(remembered(broken, 'x'), null);
  remember(broken, 'x', LOW);    // (does not throw)
});

// Plays `seconds` of frames through a governor; `cost(level)` the ms a frame takes.
function play(g, seconds, cost) { let t = 0; while (t < seconds) { const ms = cost(g.level); g.frame(ms, Math.min(0.5, ms / 1000)); t += ms / 1000; } }

test('Auto steps down under thirty frames a second, climbs back no higher than its ceiling', () => {
  assert.ok(Math.abs(QUALITY_RULES.slowMs - 1000 / 30) < 1e-9);
  const g = createGovernor(() => {});
  g.set(MEDIUM);
  g.setCeiling(HIGH);
  play(g, 400, () => 8);                         // very fast for minutes
  assert.equal(g.level, HIGH, 'no higher than High by itself');
  g.set(ULTRA, 'chosen in Settings: Ultra');      // the player may choose more
  assert.equal(g.level, ULTRA);
  play(g, 30, () => 40);                         // 25 frames a second
  assert.ok(g.level > ULTRA, 'stepped down from Ultra');
});

test('the first seconds in the town are judged quickly (the silent test), then as usual', () => {
  const slow = () => 45;
  const timeToStep = (quick) => { const g = createGovernor(() => {}); g.set(HIGH); if (quick) g.quick(30); let t = 0; const at = g.level; while (g.level === at && t < 60) { g.frame(45, 0.045); t += 0.045; } return t; };
  const quickT = timeToStep(true), usualT = timeToStep(false);
  assert.ok(quickT < usualT - 1, `quick ${quickT.toFixed(1)} s, usual ${usualT.toFixed(1)} s`);
  void slow;
});
