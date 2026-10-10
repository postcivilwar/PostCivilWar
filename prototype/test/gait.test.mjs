// How people walk and run: the arithmetic in src/client/gait.js, checked without drawing anything.
//
//   node --test test/gait.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { gaitFor, footAt, solveLeg, gaitPose, slipOf, LEG } from '../src/client/gait.js';

const WALK = 1.35, JOG = 2.4, RUN = 5.6;

// One settled stride at a speed, as a list of poses with the foot targets they were solved for.
function stride(speed, fit = 1, frames = 240) {
  const g = gaitFor(speed, fit);
  const dt = 1 / (g.rate * frames);
  const state = {};
  const out = [];
  for (let lap = 0; lap < 3; lap += 1) for (let i = 0; i < frames; i += 1) {
    const pose = { ...gaitPose(i / frames, speed, fit, dt, state, {}) };
    if (lap === 2) out.push({ phase: i / frames, pose, left: { ...footAt(i / frames, g, {}) }, right: { ...footAt(i / frames + 0.5, g, {}) } });
  }
  return { g, frames: out };
}
// where the left ankle really is, given the angles the pose came back with
function ankle(pose) {
  const thigh = pose.thighL + LEG.thighRest, shin = pose.shinL + LEG.shinRest;
  return { z: Math.sin(thigh) * LEG.thigh + Math.sin(shin) * LEG.shin, y: LEG.hipY + pose.hipDrop - Math.cos(thigh) * LEG.thigh - Math.cos(shin) * LEG.shin };
}

test('standing still is standing: no stride, no swing, and the legs straight under the hips', () => {
  const g = gaitFor(0);
  assert.equal(g.rate, 0);
  assert.equal(g.weight, 0);
  const pose = gaitPose(0.37, 0, 1, 1 / 60, {}, {});
  for (const key of ['thighL', 'thighR', 'shinL', 'shinR', 'footL', 'footR', 'hipYaw', 'hipRoll', 'sway', 'chestYaw', 'armL', 'armR', 'lean']) assert.ok(Math.abs(pose[key]) < 0.04, `${key} is ${pose[key]}`);
  assert.ok(Math.abs(pose.hipDrop) < 0.002);
});

test('a walk has both feet down at each step; a run has both feet off the ground', () => {
  for (const [speed, both] of [[WALK, true], [1.0, true], [3.5, false], [RUN, false]]) {
    const { frames } = stride(speed);
    const twoDown = frames.some((f) => f.left.down && f.right.down);
    const noneDown = frames.some((f) => !f.left.down && !f.right.down);
    assert.equal(twoDown, both, `at ${speed} m/s`);
    assert.equal(noneDown, !both, `at ${speed} m/s`);
  }
});

test('a planted foot stays where it was put: the ground goes by under the body at the body\'s own speed', () => {
  // the foot's travel while it is down, against how far the body went in that time
  for (const speed of [0.5, 1.0, WALK, JOG, 3.5]) assert.ok(slipOf(speed) < 0.06, `slip at ${speed} m/s is ${slipOf(speed).toFixed(2)} m/s`);
  // flat on the ground between the heel landing and the heel lifting
  const { g, frames } = stride(WALK);
  const flat = frames.filter((f) => f.left.down && f.phase / g.duty > g.flat && f.phase / g.duty < g.heelOff);
  assert.ok(flat.length > 40);
  for (const f of flat) { assert.equal(f.left.y, LEG.ankleY); assert.equal(f.left.pitch, 0); }
  // and it moves back evenly: each frame the same distance
  const steps = flat.slice(1).map((f, i) => flat[i].left.z - f.left.z);
  assert.ok(Math.max(...steps) - Math.min(...steps) < 1e-9);
});

test('the leg reaches the foot it was given: the knee and hip found really put the ankle there', () => {
  for (const speed of [0.5, WALK, JOG, 3.5]) {
    const { frames } = stride(speed);
    let worst = 0;
    for (const f of frames) { if (!f.left.down) continue; const a = ankle(f.pose); worst = Math.max(worst, Math.hypot(a.z - f.left.z, a.y - f.left.y)); }
    assert.ok(worst < 0.02, `at ${speed} m/s the planted foot is ${(worst * 100).toFixed(1)} cm from where it should be`);
  }
});

test('the knee only ever bends the way a knee bends, and the walk uses the whole leg', () => {
  for (const speed of [0.5, WALK, JOG, RUN]) {
    const { frames } = stride(speed);
    const bend = frames.map((f) => (f.pose.thighL + LEG.thighRest) - (f.pose.shinL + LEG.shinRest));
    assert.ok(Math.min(...bend) > 0, `knee bent backwards at ${speed} m/s`);
    assert.ok(Math.max(...bend) < 2.4, `knee folded shut at ${speed} m/s`);
  }
  const { frames } = stride(WALK);
  const thigh = frames.map((f) => f.pose.thighL + LEG.thighRest);
  assert.ok(Math.max(...thigh) > 0.4, 'the thigh comes well forward');
  assert.ok(Math.min(...thigh) < -0.15, 'and goes behind the body before the foot leaves');
});

test('nothing jumps: from one frame to the next every joint moves a little, and the stride closes on itself', () => {
  for (const speed of [WALK, JOG, RUN]) {
    const { frames } = stride(speed);
    for (const key of ['thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR', 'hipDrop', 'hipYaw', 'armL', 'elbowL', 'chestYaw']) {
      let worst = 0;
      for (let i = 0; i < frames.length; i += 1) worst = Math.max(worst, Math.abs(frames[i].pose[key] - frames[(i + 1) % frames.length].pose[key]));
      assert.ok(worst < 0.12, `${key} jumps by ${worst.toFixed(3)} at ${speed} m/s`);
    }
  }
});

test('the two legs do the same thing half a stride apart, and each arm goes with the leg across from it', () => {
  const { frames } = stride(WALK);
  const n = frames.length;
  for (let i = 0; i < n; i += 12) {
    const now = frames[i].pose, later = frames[(i + n / 2) % n].pose;
    assert.ok(Math.abs(now.thighL - later.thighR) < 0.03);
    assert.ok(Math.abs(now.shinL - later.shinR) < 0.03);
    assert.ok(Math.abs(now.armL - later.armR) < 0.03);
  }
  // as the left foot lands in front (phase 0), the left arm is back and the right arm forward; a negative turn is forward
  const landing = frames[0].pose;
  assert.ok(landing.thighL > 0.3);
  assert.ok(landing.armL > 0.1 && landing.armR < -0.1);
  // the hips turn toward the leading leg and the chest against them
  assert.ok(Math.sign(landing.hipYaw) === -Math.sign(landing.chestYaw) && Math.abs(landing.chestYaw) > 0.05);
});

test('the hips ride lowest with the legs spread and highest over the standing leg, by a few centimetres', () => {
  const { frames } = stride(WALK);
  const drops = frames.map((f) => f.pose.hipDrop);
  const bob = Math.max(...drops) - Math.min(...drops);
  assert.ok(bob > 0.012 && bob < 0.06, `the hips move ${(bob * 100).toFixed(1)} cm`);
  assert.ok(Math.max(...drops) <= 0, 'never above standing height');
});

test('faster is longer steps and more of them; a run leans, lifts the heel and bends the elbow', () => {
  const walk = gaitFor(WALK), jog = gaitFor(JOG), run = gaitFor(RUN);
  assert.ok(walk.step < jog.step && jog.step < run.step);
  assert.ok(walk.rate < jog.rate && jog.rate < run.rate);
  assert.ok(walk.rate * 2 > 1.6 && walk.rate * 2 < 2.3, `walking at ${(walk.rate * 2).toFixed(2)} steps a second`);
  assert.ok(run.rate * 2 < 3.6, `running at ${(run.rate * 2).toFixed(2)} steps a second`);
  assert.equal(walk.run, 0);
  assert.equal(run.run, 1);
  assert.ok(run.lift > walk.lift * 3);
  const w = stride(WALK).frames, r = stride(RUN).frames;
  const most = (frames, key) => Math.max(...frames.map((f) => Math.abs(f.pose[key])));
  assert.ok(most(r, 'elbowL') > most(w, 'elbowL') + 0.6);
  assert.ok(r[0].pose.lean > w[0].pose.lean + 0.05);
});

test('someone in a wrapper takes shorter steps, and more of them, to cover the same ground', () => {
  const free = gaitFor(WALK, 1), wrapped = gaitFor(WALK, 0.55);
  assert.ok(wrapped.travel < free.travel);
  assert.ok(wrapped.rate > free.rate);
  assert.ok(wrapped.rate * 2 <= 2.36, 'but never a scurry');
});

test('a leg asked for more than its length gives its whole length and no more', () => {
  const far = solveLeg(0.9, 0.6, {});
  assert.ok(far.reach > 1);
  const bend = far.thigh - far.shin;
  assert.ok(bend > 0 && bend < 0.2, 'all but straight');
  const near = solveLeg(0, LEG.thigh + LEG.shin - 0.001, {});
  assert.ok(Math.abs(near.thigh) < 0.08 && Math.abs(near.shin) < 0.08);
});
