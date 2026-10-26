// The graphics levels (graphics.js) and the governor that moves between them in Auto (monitor.js): what each level
// draws, where Auto starts on each kind of device, what it keeps for the next start, how high it climbs by itself,
// and its quicker judgement in the first seconds.
//
//   node --test test/graphics.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { GRAPHICS_LEVELS, GRAPHICS_LOWERED, GRAPHICS_NOTE, LEVEL_SETTINGS, ULTRA, HIGH, MEDIUM, LOW, levelSetting, memoryLimitMB, autoStart, autoCeiling, remembered, remember, levelOf } from '../src/client/graphics.js';
import { createGovernor, QUALITY_RULES, PHONE_QUALITY_RULES } from '../src/client/monitor.js';

test('four levels, Ultra to Low, each with one line; the words the owner asked for', () => {
  assert.deepEqual(GRAPHICS_LEVELS.map((l) => l.name), ['Ultra', 'High', 'Medium', 'Low']);
  assert.deepEqual([ULTRA, HIGH, MEDIUM, LOW], [0, 1, 2, 3]);
  for (const l of GRAPHICS_LEVELS) { assert.ok(l.line.length > 20 && l.line.length < 120 && !l.line.includes('\n'), l.name); }
  assert.equal(GRAPHICS_LOWERED, 'Graphics lowered to keep the game smooth');
  assert.match(GRAPHICS_NOTE, /battery/); assert.match(GRAPHICS_NOTE, /warm/);
  assert.equal(levelOf('ultra'), 0); assert.equal(levelOf('low'), 3); assert.equal(levelOf('auto'), null); assert.equal(levelOf('nonsense'), null);
});

test('each level draws less than the one above it, in the owner\'s words for each', () => {
  const at = (key, lite = false) => [0, 1, 2, 3].map((l) => levelSetting(key, l, lite));
  for (const key of Object.keys(LEVEL_SETTINGS)) for (const lite of [false, true]) assert.equal(at(key, lite).length, 4, key);
  for (let i = 1; i < 4; i += 1) {
    assert.ok(at('pixelRatio')[i] < at('pixelRatio')[i - 1]);
    for (const lite of [false, true]) assert.ok(at('shadowMap', lite)[i] <= at('shadowMap', lite)[i - 1]);
    assert.ok(at('shadowReach')[i] <= at('shadowReach')[i - 1]);
    assert.ok(at('view')[i] <= at('view')[i - 1]);
  }
  // Low: small pictures, no sun shadows, simple water, a shorter view with fog
  assert.equal(levelSetting('pictureMost', LOW), 512);
  for (const lite of [false, true]) assert.equal(levelSetting('shadowMap', LOW, lite), 0);
  assert.equal(levelSetting('water', LOW), 'simple'); assert.equal(levelSetting('reflections', LOW), 'none');
  assert.ok(levelSetting('view', LOW) < 1);
  // Medium: pictures up to 1024, sun shadows nearby, simple reflections, as a phone was drawn (1.25 pixels for each, a 1024 map)
  assert.equal(levelSetting('pictureMost', MEDIUM), 1024);
  assert.equal(levelSetting('reflections', MEDIUM), 'simple');
  assert.ok(levelSetting('shadowReach', MEDIUM) < levelSetting('shadowReach', HIGH), 'nearby');
  assert.equal(levelSetting('pixelRatio', MEDIUM), 1.25); assert.equal(levelSetting('shadowMap', MEDIUM, true), 1024);
  // High: pictures up to 2048, softer and further shadows, reflections on glass, water and wet roads
  assert.equal(levelSetting('pictureMost', HIGH), 2048);
  assert.ok(levelSetting('shadowSoft', HIGH) > levelSetting('shadowSoft', MEDIUM), 'softer');
  assert.equal(levelSetting('reflections', HIGH), 'full'); assert.equal(levelSetting('water', HIGH), 'full');
  // Ultra: everything at its best (a computer as it was drawn before the levels: 2 pixels for each, a 2048 map)
  assert.equal(levelSetting('pictureMost', ULTRA), 0, 'as fetched');
  assert.equal(levelSetting('pixelRatio', ULTRA), 2); assert.equal(levelSetting('shadowMap', ULTRA), 2048);
  assert.equal(levelSetting('pixelRatio', LOW), 1, 'Low is never blurry: one pixel for each of the screen\'s at least');
  // a phone's graphics card holds a 1024 shadow map below Ultra
  assert.equal(levelSetting('shadowMap', HIGH, true), 1024); assert.equal(levelSetting('shadowMap', HIGH, false), 2048);
});

test('the graphics card nearly full lowers the level: on a phone at nine tenths of its 150 MB, a computer far past its budget', () => {
  assert.equal(memoryLimitMB(150, true), 135);
  assert.ok(memoryLimitMB(700, false) > 700);
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
  // it climbs by itself to Medium on a phone (26 October 2026: High and Ultra are the player's to choose there), to Ultra
  // on a computer
  assert.equal(autoCeiling({ lite: true }), MEDIUM); assert.equal(autoCeiling({ lite: false }), ULTRA);
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

test('a level given up for a full graphics card is not climbed back to for a while, longer each time', () => {
  const g = createGovernor(() => {});
  g.set(MEDIUM);
  g.setCeiling(MEDIUM);
  g.lower('the graphics card nearly full (140 of 150 MB)');
  assert.equal(g.level, LOW);
  assert.match(g.changes[g.changes.length - 1].why, /nearly full/);
  play(g, 120, () => 8);                          // very fast for two minutes: not back to Medium yet
  assert.equal(g.level, LOW);
  play(g, 120, () => 8);                          // three minutes and more: tried again
  assert.equal(g.level, MEDIUM);
  g.lower('the graphics card nearly full (141 of 150 MB)');
  play(g, 300, () => 8);                          // given up a second time: five minutes are not enough now
  assert.equal(g.level, LOW);
  play(g, 120, () => 8);
  assert.equal(g.level, MEDIUM);
  const bottom = createGovernor(() => {}); bottom.set(LOW); bottom.lower('full'); assert.equal(bottom.level, LOW);   // (Low is the least)
});

test('a phone that cannot quite hold Medium in a busy street settles at Low, and does not go back and forth (26 October 2026)', () => {
  // Medium a frame of 34 ms there (under thirty a second), Low 15 ms: a quarter of an hour of it
  const cost = (level) => (level === MEDIUM ? 34 : 15);
  const changesIn = (rules) => { const g = createGovernor(() => {}, rules); g.set(MEDIUM); g.setCeiling(MEDIUM); play(g, 900, cost); return g.changes.length - 1; };
  const before = changesIn({ ...QUALITY_RULES, slowMs: 1000 / 31, downAfter: 2.5, upAfter: 25, settle: 4 });
  const now = changesIn(PHONE_QUALITY_RULES);
  assert.ok(now <= 6, `${now} changes in a quarter of an hour (the rules before: ${before})`);
  assert.ok(now < before, `${now} changes, fewer than ${before}`);
  // and a phone that holds Medium comfortably stays there: no climb above it by itself
  const g = createGovernor(() => {}, PHONE_QUALITY_RULES); g.set(MEDIUM); g.setCeiling(autoCeiling({ lite: true }));
  play(g, 900, () => 9);
  assert.equal(g.level, MEDIUM);
  assert.equal(g.changes.length, 1);
  // stepped down for a moment's slowness long after climbing (not a failure), it climbs back after a minute and a half
  const h = createGovernor(() => {}, PHONE_QUALITY_RULES); h.set(MEDIUM); h.setCeiling(MEDIUM);
  play(h, 60, () => 12); play(h, 6, () => 40);
  assert.equal(h.level, LOW);
  play(h, 80, () => 12);
  assert.equal(h.level, LOW, 'not yet');
  play(h, 20, () => 12);
  assert.equal(h.level, MEDIUM, 'back after a minute and a half of fast frames');
});

test('the first seconds in the town are judged quickly (the silent test), then as usual', () => {
  const slow = () => 45;
  const timeToStep = (quick) => { const g = createGovernor(() => {}); g.set(HIGH); if (quick) g.quick(30); let t = 0; const at = g.level; while (g.level === at && t < 60) { g.frame(45, 0.045); t += 0.045; } return t; };
  const quickT = timeToStep(true), usualT = timeToStep(false);
  assert.ok(quickT < usualT - 1, `quick ${quickT.toFixed(1)} s, usual ${usualT.toFixed(1)} s`);
  void slow;
});

test('the sun\'s shadows fade out at the edge of their reach instead of stopping at a line (three.js\'s shadow function, changed once)', async () => {
  const { createRequire } = await import('node:module');
  globalThis.THREE = globalThis.THREE || createRequire(import.meta.url)('../vendor/three.min.js');
  const { shadowEdgeFades } = await import('../src/client/render-sky.js');
  assert.equal(shadowEdgeFades, true);
  const chunk = THREE.ShaderChunk.shadowmap_pars_fragment;
  assert.equal(chunk.split('pcwEdge').length - 1, 2, 'once, in the soft shadows\' function');
  assert.ok(chunk.indexOf('pcwEdge') < chunk.indexOf('SHADOWMAP_TYPE_VSM'));
});
