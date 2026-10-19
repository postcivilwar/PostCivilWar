// Tests of the parts of the client that are plain logic and need no browser:
// the frame monitor and the detail governor.
//
//   node --test test/client.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMonitor, createGovernor, QUALITY_RULES } from '../src/client/monitor.js';

// Plays `seconds` of frames through a governor. `cost(level, t)` is how long a frame takes, in ms.
function play(governor, seconds, cost, clock = { t: 0 }) {
  const end = clock.t + seconds;
  while (clock.t < end) { const ms = cost(governor.level, clock.t); governor.frame(ms, Math.min(0.5, ms / 1000)); clock.t += ms / 1000; }
  return clock;
}

test('detail: a hitch is not a slow device, however long and however often', () => {
  const applied = [];
  const g = createGovernor((level) => applied.push(level));
  let n = 0;
  // sixty frames a second, with a frame of nearly a second every five seconds, for five minutes
  play(g, 300, () => { n += 1; return n % 300 === 0 ? 900 : 16.7; });
  assert.equal(g.level, 0);
  assert.deepEqual(applied, []);
  // and a burst of ten slow frames in a row (a figure being built, a save, the browser collecting garbage)
  n = 0;
  play(g, 60, () => { n += 1; return n % 400 < 10 ? 120 : 16.7; });
  assert.equal(g.level, 0, 'ten slow frames among four hundred do not move the typical frame');
});

test('detail: steps down one level at a time when frames are truly slow, and no further than needed', () => {
  const applied = [];
  const g = createGovernor((level) => applied.push(level));
  const clock = play(g, 4, () => 16.7);
  // a device that manages 20 frames a second at full detail, 22 at the next, 31 at the one after
  const cost = (level) => [50, 45, 32, 20][level];
  play(g, 3, cost, clock);
  assert.equal(g.level, 0, 'not within the first few seconds');
  play(g, 8, cost, clock);
  assert.equal(g.level, 1, 'one step after several seconds of slow frames');
  play(g, 60, cost, clock);
  assert.equal(g.level, 2, 'stops at the first level that is fast enough');
  assert.deepEqual(applied, [1, 2]);
  assert.ok(g.changes.every((c) => /typical frame \d+ ms/.test(c.why)));
});

test('detail: comes back up when there is room, a step at a time', () => {
  const applied = [];
  const g = createGovernor((level) => applied.push(level));
  const clock = { t: 0 };
  play(g, 40, (level) => [60, 55, 50, 30][level], clock);
  assert.equal(g.level, 3, 'a heavy scene took it to the lowest level');
  // the load lifts: every level now draws in 12 ms
  play(g, QUALITY_RULES.upAfter - 2, () => 12, clock);
  assert.equal(g.level, 3, 'not at once');
  play(g, 8, () => 12, clock);
  assert.equal(g.level, 2);
  play(g, 60, () => 12, clock);
  assert.equal(g.level, 0, 'all the way back');
  assert.deepEqual(applied, [1, 2, 3, 2, 1, 0]);
});

test('detail: a level that had to be undone is not tried again soon, and waits longer each time', () => {
  const applied = [];
  const g = createGovernor((level) => applied.push(level));
  // full detail is too much for this device (50 ms); one step down is comfortable (15 ms)
  const cost = (level) => (level === 0 ? 50 : 15);
  const clock = play(g, 30, cost);
  assert.equal(g.level, 1);
  play(g, 600, cost, clock);
  const ups = g.changes.filter((c) => c.to === 0);
  assert.ok(ups.length >= 2 && ups.length <= 4, `full detail was tried ${ups.length} times in ten minutes`);
  const gaps = ups.slice(1).map((c, i) => c.at - ups[i].at);
  for (let i = 1; i < gaps.length; i += 1) assert.ok(gaps[i] > gaps[i - 1] * 1.5, `each wait is longer than the last (${gaps})`);
  // each failed try costs only a few seconds of slow frames
  const slow = g.changes.filter((c) => c.to === 1).slice(1).map((c) => c.at - ups.find((u) => u.at < c.at && c.at - u.at < 30).at);
  for (const s of slow) assert.ok(s < 12, `back down within ${s} s`);
});

test('detail: held where the player set it; a sleeping page is not a slow one', () => {
  const applied = [];
  const g = createGovernor((level) => applied.push(level));
  g.hold(true); g.set(2, 'chosen in Help');
  play(g, 120, () => 80);
  assert.equal(g.level, 2, 'slow frames do not move a level that is held');
  play(g, 120, () => 8);
  assert.equal(g.level, 2, 'nor do fast ones');
  g.hold(false); g.set(0);
  const clock = play(g, 10, () => 16.7);
  // the page is hidden for a minute, then comes back
  g.frame(60000, 0.5);
  for (let i = 0; i < 5; i += 1) g.frame(4000, 0.5);
  play(g, 10, () => 16.7, clock);
  assert.equal(g.level, 0);
  assert.deepEqual(applied, [2, 0]);
});

test('monitor: what a frame was spent on, and a record of each hitch', () => {
  let t = 0;
  const m = createMonitor(() => t);
  const frame = (parts, interval) => { m.begin(); for (const [name, ms] of parts) { m.mark(name); t += ms; } m.end(interval); };
  for (let i = 0; i < 100; i += 1) frame([['simulation', 1], ['drawing', 6]], 16.7);
  let r = m.report();
  assert.equal(r.frames, 100);
  assert.equal(r.hitches, 0);
  assert.equal(r.ms.median, 16.7);
  assert.deepEqual(r.sections.drawing, { mean: 6, max: 6 });
  // a frame whose own work is long names the part that took it
  m.begin(); m.mark('simulation'); t += 2; m.mark('townspeople'); t += 70; m.note('figures made', 1); m.mark('drawing'); t += 6; m.end(80);
  // and one that was long before its work began is not blamed on any part
  frame([['simulation', 1], ['drawing', 6]], 400);
  r = m.report();
  assert.equal(r.hitches, 2);
  assert.equal(r.freezes, 1);
  assert.equal(r.recent[0].where, 'townspeople');
  assert.deepEqual(r.recent[0].made, { 'figures made': 1 });
  assert.equal(r.recent[1].where, 'outside the frame');
  assert.equal(r.spikes[0].part, 'townspeople');
  assert.equal(r.counters['figures made'], 1);
  // the first frame after the page was hidden is not counted
  m.pause(); frame([['drawing', 6]], 90000);
  assert.equal(m.report().hitches, 2);
  assert.equal(m.report().ms.worst, 400);
  m.reset();
  assert.equal(m.report().frames, 0);
});

// --- the camera ----------------------------------------------------------------------------
// camera.js uses three.js for nothing but vectors; a few lines stand in for it here.
class V3 {
  constructor(x = 0, y = 0, z = 0) { this.set(x, y, z); }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  copy(v) { return this.set(v.x, v.y, v.z); }
  lerp(v, t) { return this.set(this.x + (v.x - this.x) * t, this.y + (v.y - this.y) * t, this.z + (v.z - this.z) * t); }
}
globalThis.THREE = { Vector3: V3 };
const { CAMERA_VIEWS, CAMERA_VIEW, STREET, nextView, viewFor, createCameraRig } = await import('../src/client/camera.js');
const fakeCamera = () => { const c = { position: new V3(), aim: new V3(), lookAt(v) { c.aim.copy(v); }, updateMatrixWorld() {} }; return c; };
// Runs the rig for some seconds at sixty frames a second.
function film(rig, seconds, frame) { for (let t = 0; t < seconds; t += 1 / 60) rig.update(1 / 60, frame); }

test('camera: C goes round every view for where the player is, and a view that does not exist there falls back', () => {
  for (const where of ['foot', 'vehicle']) {
    const seen = [];
    let view = CAMERA_VIEWS[where][0];
    for (let i = 0; i < CAMERA_VIEWS[where].length; i += 1) { seen.push(view); view = nextView(view, where); }
    assert.deepEqual(seen, [...CAMERA_VIEWS[where]]);
    assert.equal(view, CAMERA_VIEWS[where][0], 'and back to the first');
    assert.ok(CAMERA_VIEWS[where].length >= 4);
    for (const name of CAMERA_VIEWS[where]) assert.ok(CAMERA_VIEW[name] && CAMERA_VIEW[name].name, `${name} is described`);
  }
  assert.equal(CAMERA_VIEWS.foot[0], 'street', 'on foot the street view comes first: the one the game starts with');
  assert.equal(viewFor('driver', 'foot'), 'street', 'the driver\'s-side view is not kept on foot');
  assert.equal(viewFor('seat', 'foot'), 'street');
  assert.equal(viewFor('high', 'vehicle'), 'high', 'a view that exists in both is kept');
  assert.equal(viewFor('shoulder', 'vehicle'), 'chase');
  assert.equal(viewFor('bonnet', 'foot'), 'street');
  assert.equal(viewFor('behind', 'foot'), 'behind', 'further back is still there on foot');
});

test('camera: it glides from one view to the next; it never jumps', () => {
  const camera = fakeCamera();
  const rig = createCameraRig(camera, { blocked: () => false });
  const cam = { yaw: 0, pitch: STREET.pitch, dist: STREET.dist };
  const frame = { cam, target: { x: 0, y: 1.5, z: 0 }, heading: 0 };
  rig.snap(cam);
  film(rig, 1, frame);
  let last = { x: camera.position.x, y: camera.position.y, z: camera.position.z };
  let worst = 0;
  for (const view of ['close', 'shoulder', 'high', 'side', 'behind', 'street']) {
    rig.view = view;
    for (let t = 0; t < 2; t += 1 / 60) {
      rig.update(1 / 60, frame);
      const step = Math.hypot(camera.position.x - last.x, camera.position.y - last.y, camera.position.z - last.z);
      worst = Math.max(worst, step);
      last = { x: camera.position.x, y: camera.position.y, z: camera.position.z };
    }
  }
  // the views are many metres apart; the quickest frame of any change covers a small part of that
  assert.ok(worst < 1.5, `the largest move in one frame was ${worst.toFixed(2)} m`);
  assert.equal(rig.hidesPlayer, false);
});

test('camera: with a wall behind, it never stands inside it; pressed right up, it rises over the wall and the player is still drawn', () => {
  const camera = fakeCamera();
  // a wall across the world, 4.2 m high (the rig's wall height): everything beyond z = -3 is solid below that
  const wall = (x, z, y = 0) => z < -3 && y <= 4.2;
  const rig = createCameraRig(camera, { blocked: wall });
  const cam = { yaw: 0, pitch: 0.27, dist: 8 };
  rig.snap(cam);
  film(rig, 2, { cam, target: { x: 0, y: 1.5, z: 0 }, heading: 0 });
  assert.ok(!wall(camera.position.x, camera.position.z, camera.position.y), `camera at z ${camera.position.z.toFixed(2)} is inside the wall`);
  assert.ok(camera.position.z < -1.0, 'with three metres of room it stays behind the player');
  assert.equal(rig.hidesPlayer, false);
  // the player backs up against the wall: no room behind at head height, so the camera goes up and looks down
  film(rig, 3, { cam, target: { x: 0, y: 1.5, z: -2.6 }, heading: 0 });
  assert.ok(!wall(camera.position.x, camera.position.z, camera.position.y), `still not inside the wall (${camera.position.x.toFixed(2)}, ${camera.position.y.toFixed(2)}, ${camera.position.z.toFixed(2)})`);
  assert.equal(rig.hidesPlayer, false, 'on foot the figure is always drawn');
  assert.ok(Math.hypot(camera.position.x, camera.position.y - 1.5, camera.position.z + 2.6) > 2.0, 'the eye is not in the player\'s head');
  assert.ok(camera.position.y > 4.2, 'it has risen above the wall');
  // and walks out into the open again: the camera comes back down and out, gradually
  film(rig, 0.2, { cam, target: { x: 0, y: 1.5, z: 20 }, heading: 0 });
  const soon = camera.position.y;
  film(rig, 6, { cam, target: { x: 0, y: 1.5, z: 20 }, heading: 0 });
  assert.equal(rig.hidesPlayer, false);
  assert.ok(camera.position.y < soon && camera.position.y < 4.5 && 20 - camera.position.z > 6.5, `back down and out (y ${camera.position.y.toFixed(2)}, ${(20 - camera.position.z).toFixed(2)} m behind)`);
});

test('camera: from the seat, the eye is the driver\'s own and the figure is hidden', () => {
  const camera = fakeCamera();
  const rig = createCameraRig(camera, { blocked: () => false });
  const cam = { yaw: 0, pitch: 0.27, dist: 8 };
  rig.snap(cam);
  rig.view = 'seat';
  film(rig, 2, { cam, target: { x: 5, y: 1.4, z: 5 }, heading: Math.PI / 2, eyeHeight: 1.45 });
  assert.equal(rig.hidesPlayer, true);
  assert.ok(Math.hypot(camera.position.x - 5, camera.position.z - 5) < 0.4);
  assert.ok(camera.aim.x > camera.position.x + 3, 'looking the way the vehicle faces');
});

test('camera: from the bonnet, the eye is ahead of the vehicle looking on, and the driver is still drawn', () => {
  const camera = fakeCamera();
  const rig = createCameraRig(camera, { blocked: () => false });
  const cam = { yaw: 0, pitch: 0.27, dist: 8 };
  rig.snap(cam);
  rig.view = 'bonnet';
  film(rig, 2, { cam, target: { x: 5, y: 1.4, z: 5 }, heading: Math.PI / 2, eyeHeight: 1.45 });
  assert.equal(rig.hidesPlayer, false);
  assert.ok(camera.position.x > 6, 'in front of the driver');
  assert.ok(camera.aim.x > camera.position.x + 3, 'looking the way the vehicle faces');
});

test('camera: someone under a low roof is looked at from under it, not through it', () => {
  const camera = fakeCamera();
  // a shed roof at 2.4 m over a square of ground; nothing solid in it
  const roof = (x, z, y) => y > 2.2 && Math.abs(x) < 3 && Math.abs(z) < 3;
  const rig = createCameraRig(camera, { blocked: roof });
  const cam = { yaw: 0, pitch: 0.5, dist: 8 };
  rig.snap(cam);
  // standing in the middle, under it: the camera keeps below the eaves
  film(rig, 3, { cam, target: { x: 0, y: 1.5, z: 0 }, heading: 0 });
  assert.ok(camera.position.y <= 2.2, `eye at ${camera.position.y.toFixed(2)} m is above the roof`);
  assert.ok(!roof(camera.position.x, camera.position.z, camera.position.y));
  // standing well clear of it with the camera high over open ground: untouched
  film(rig, 3, { cam, target: { x: 0, y: 1.5, z: 30 }, heading: 0 });
  assert.ok(Math.hypot(camera.position.z - 30, camera.position.y - 1.5) > 7.5, 'out in the open the camera is at its full distance');
});

test('camera: on the street view the player stands in the lower middle, a few metres ahead, the eye about their head\'s height', () => {
  const camera = fakeCamera();
  const rig = createCameraRig(camera, { blocked: () => false });
  const cam = { yaw: 0, pitch: STREET.pitch, dist: STREET.dist };
  rig.snap(cam);
  assert.equal(rig.view, 'street', 'the view the game starts with');
  // the player at the origin, their target 1.55 m up (as main.js keeps it), facing +z
  film(rig, 3, { cam, target: { x: 0, y: 1.55, z: 0 }, heading: 0 });
  const back = -camera.position.z;
  assert.ok(back > 3.2 && back < 4.4, `${back.toFixed(2)} m behind`);
  assert.ok(camera.position.y > 1.6 && camera.position.y < 2.2, `the eye ${camera.position.y.toFixed(2)} m up: about the height of a head`);
  // looking a little down, at the chest, so the head is above the middle of the picture and the feet well below it
  assert.ok(camera.aim.y > 1.3 && camera.aim.y < 1.5, `looking at ${camera.aim.y.toFixed(2)} m`);
  assert.ok(camera.position.y > camera.aim.y, 'down, not up');
  // at a run it comes a little closer and lower, and goes back out when the player slows
  film(rig, 3, { cam, target: { x: 0, y: 1.55, z: 0 }, heading: 0, running: 1 });
  const atRun = -camera.position.z;
  assert.ok(atRun < back - 0.4 && atRun > 2.4, `at a run ${atRun.toFixed(2)} m behind (walking ${back.toFixed(2)})`);
  film(rig, 4, { cam, target: { x: 0, y: 1.55, z: 0 }, heading: 0, running: 0 });
  assert.ok(Math.abs(-camera.position.z - back) < 0.1, 'and back out');
});

test('camera: on the street view it comes in toward the player before a wall rather than rising over it', () => {
  const camera = fakeCamera();
  const wall = (x, z, y = 0) => z < -2.5 && y <= 4.2;
  const rig = createCameraRig(camera, { blocked: wall });
  const cam = { yaw: 0, pitch: STREET.pitch, dist: STREET.dist };
  rig.snap(cam);
  film(rig, 3, { cam, target: { x: 0, y: 1.55, z: 0 }, heading: 0 });
  assert.ok(!wall(camera.position.x, camera.position.z, camera.position.y), 'not inside the wall');
  assert.ok(camera.position.y < 2.4, `it came in, at head height (${camera.position.y.toFixed(2)} m), rather than rising`);
  assert.ok(-camera.position.z > 1.1 && -camera.position.z < 2.5, `${(-camera.position.z).toFixed(2)} m behind`);
});

test('camera: on the street view a turn swings it out a little and lets it settle; the eye never goes under the ground', () => {
  const camera = fakeCamera();
  // a slope rising behind the player: the eye keeps above it
  const rig = createCameraRig(camera, { blocked: () => false, ground: (x, z) => (z < -1 ? (-1 - z) * 0.6 : 0) });
  const cam = { yaw: 0, pitch: STREET.pitch, dist: STREET.dist };
  rig.snap(cam);
  film(rig, 2, { cam, target: { x: 0, y: 1.55, z: 0 }, heading: 0 });
  const g = (-1 - camera.position.z) * 0.6;
  assert.ok(camera.position.y >= g + 0.3, `the eye ${camera.position.y.toFixed(2)} m is above the slope (${g.toFixed(2)} m there)`);
  // the yaw turned steadily (the player going round to the left): the sway is to the outside of the turn, small
  for (let t = 0; t < 1; t += 1 / 60) { cam.yaw += 1.2 / 60; rig.update(1 / 60, { cam, target: { x: 0, y: 1.55, z: 0 }, heading: cam.yaw }); }
  const sway = rig.live.sway;
  assert.ok(sway > 0.05 && sway <= 0.22, `swung out by ${sway.toFixed(3)} m`);
  film(rig, 3, { cam, target: { x: 0, y: 1.55, z: 0 }, heading: cam.yaw });
  assert.ok(Math.abs(rig.live.sway) < 0.01, 'and settles when the turn ends');
});

test('camera: it moves the same at 20 frames a second as at 60', () => {
  const run = (fps) => {
    const camera = fakeCamera();
    const rig = createCameraRig(camera, { blocked: () => false });
    const cam = { yaw: 0, pitch: STREET.pitch, dist: STREET.dist };
    rig.snap(cam);
    rig.view = 'high';
    for (let t = 0; t < 0.5; t += 1 / fps) rig.update(1 / fps, { cam, target: { x: 0, y: 1.55, z: 0 }, heading: 0 });
    return { y: camera.position.y, z: camera.position.z };
  };
  const a = run(60), b = run(20);
  assert.ok(Math.hypot(a.y - b.y, a.z - b.z) < 0.6, `half a second into a change of view: ${JSON.stringify(a)} at 60, ${JSON.stringify(b)} at 20`);
});

// --- skills ---------------------------------------------------------------------------------
const { buildCatalog, pagesOf, nextSkillsState, PER_PAGE } = await import('../src/client/skill-catalog.js');

test('skills: the catalog is the character\'s own clips, without walking, running or swimming, and nothing empty', () => {
  const clips = [{ name: 'walk.001', label: 'Walk', duration: 1 }, { name: 'run.001', label: 'Run', duration: 1 }, { name: 'swim.001', label: 'Swim', duration: 2 },
    { name: 'front_kick_02.001', label: 'Kick', duration: 1.4 }, { name: 'laugh_02.001', label: 'Laugh', duration: 3 }, { name: 'dance_01.001', label: 'Boogie', duration: 6 },
    { name: 'broken.001', label: 'Broken', duration: 0 }, { name: 'front_kick_02.001', label: 'Kick', duration: 1.4 }];
  const cat = buildCatalog(clips);
  assert.deepEqual(cat.map((e) => e.id), ['front_kick_02.001', 'dance_01.001', 'laugh_02.001'], 'fights first, then dances, then feelings; no locomotion, no empty clip, no repeat');
  for (const e of cat) assert.ok(e.icon && e.label && e.duration > 0 && e.available && e.compatible);
  assert.equal(cat[0].icon, 'kick'); assert.equal(cat[1].icon, 'dance'); assert.equal(cat[2].icon, 'laugh');
});

test('skills: five to a page, and the button pages through them and closes after the last', () => {
  const thirteen = Array.from({ length: 13 }, (_, i) => ({ name: `clip_${i}.001`, label: `C${i}`, duration: 1 }));
  const pages = pagesOf(buildCatalog(thirteen));
  assert.equal(PER_PAGE, 5);
  assert.deepEqual(pages.map((p) => p.length), [5, 5, 3]);
  let s = { open: false, page: 0 };
  const seen = [];
  for (let tap = 0; tap < 4; tap += 1) { s = nextSkillsState(s, pages.length); seen.push(s.open ? s.page + 1 : 'closed'); }
  assert.deepEqual(seen, [1, 2, 3, 'closed']);
  assert.deepEqual(nextSkillsState(s, pages.length), { open: true, page: 0 }, 'the next opening starts at page 1');
  // thirty: six pages; thirty-one: seven (no limit of six)
  assert.equal(pagesOf(buildCatalog(Array.from({ length: 30 }, (_, i) => ({ name: `a_${i}.001`, duration: 1 })))).length, 6);
  assert.equal(pagesOf(buildCatalog(Array.from({ length: 31 }, (_, i) => ({ name: `a_${i}.001`, duration: 1 })))).length, 7);
  // nothing to show: the button does nothing
  assert.deepEqual(nextSkillsState({ open: false, page: 0 }, 0), { open: false, page: 0 });
});
