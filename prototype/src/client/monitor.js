// The frame monitor: how long each frame took, which part of it took the
// time, and a record of every hitch. It measures; it changes nothing.
//
// A frame is split into named sections by calling `mark(name)` as the frame
// moves from one job to the next. `end()` closes the frame. `report()` gives
// the last few hundred frames as numbers: this is what the Help panel shows
// and what the performance checks read.

const WINDOW = 600;              // frames kept
const HITCH_MS = 50;             // a frame longer than this is a hitch (three missed frames at 60 a second)
const FREEZE_MS = 250;           // and longer than this, a freeze
const KEPT = 40;                 // hitches remembered
const SPIKE_MS = 12;             // one part of a frame taking longer than this is noted, with what was made in that frame

export function createMonitor(now = () => performance.now()) {
  const frames = new Float32Array(WINDOW);
  let count = 0;
  let head = 0;
  let frameStart = 0;
  let sectionStart = 0;
  let section = null;
  let current = new Map();
  const totals = new Map();        // name -> { sum, max, n } over the monitor's whole life
  const hitches = [];
  let spikes = [];
  let notes = null;
  const counters = Object.create(null);
  const life = { frames: 0, hitches: 0, freezes: 0, worst: 0, since: now() };
  let paused = false;

  function close(t) {
    if (section === null) return;
    current.set(section, (current.get(section) || 0) + (t - sectionStart));
    section = null;
  }

  return {
    HITCH_MS, FREEZE_MS,
    // starts a frame
    begin() { frameStart = now(); sectionStart = frameStart; section = null; current = new Map(); notes = null; },
    // something made in this frame that may explain its length (a program compiled, a figure built)
    note(name, n = 1) { if (!notes) notes = {}; notes[name] = (notes[name] || 0) + n; counters[name] = (counters[name] || 0) + n; },
    // the frame moves on to another job
    mark(name) { const t = now(); close(t); section = name; sectionStart = t; },
    // times one piece of work inside the current section, on its own line of the report
    time(name, fn) { const t = now(); try { return fn(); } finally { const took = now() - t; current.set(name, (current.get(name) || 0) + took); } },
    // counts something that happened (a figure built, a texture made), to explain a hitch
    count(name, n = 1) { counters[name] = (counters[name] || 0) + n; },
    // The page was hidden or has just come back: the next frame's length means nothing.
    pause() { paused = true; },
    // ends the frame. `interval` is the time since the last frame was drawn, in ms.
    end(interval) {
      const t = now();
      close(t);
      if (paused) { paused = false; return; }
      const work = t - frameStart;
      const length = Math.max(work, interval || 0);
      frames[head] = length; head = (head + 1) % WINDOW; count = Math.min(WINDOW, count + 1);
      life.frames += 1;
      let worstName = null, worstMs = 0;
      for (const [name, ms] of current) {
        let rec = totals.get(name);
        if (!rec) { rec = { sum: 0, max: 0, n: 0 }; totals.set(name, rec); }
        rec.sum += ms; rec.n += 1; if (ms > rec.max) rec.max = ms;
        if (ms > worstMs) { worstMs = ms; worstName = name; }
        if (ms > SPIKE_MS) spikes.push({ part: name, ms: Math.round(ms), at: Math.round(t - life.since), made: notes });
      }
      if (spikes.length > 80) spikes = spikes.sort((a, b) => b.ms - a.ms).slice(0, 40);
      if (length > life.worst) life.worst = length;
      if (length > HITCH_MS) {
        life.hitches += 1;
        if (length > FREEZE_MS) life.freezes += 1;
        // time not spent in this frame's own work was spent before it started: the browser, or the last frame's drawing
        hitches.push({ at: Math.round(t - life.since), ms: Math.round(length), work: Math.round(work), made: notes, where: work > length * 0.5 ? worstName : 'outside the frame', whereMs: Math.round(worstMs) });
        if (hitches.length > KEPT) hitches.shift();
      }
    },
    report() {
      const sorted = Array.from(frames.subarray(0, count)).sort((a, b) => a - b);
      const at = (q) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] : 0);
      const mean = sorted.length ? sorted.reduce((a, b) => a + b, 0) / sorted.length : 0;
      const sections = {};
      for (const [name, rec] of totals) sections[name] = { mean: Number((rec.sum / Math.max(1, life.frames)).toFixed(3)), max: Number(rec.max.toFixed(1)) };
      return {
        frames: life.frames, seconds: Math.round((now() - life.since) / 1000),
        fps: mean ? Number((1000 / mean).toFixed(1)) : 0,
        ms: { median: Number(at(0.5).toFixed(1)), p95: Number(at(0.95).toFixed(1)), p99: Number(at(0.99).toFixed(1)), worst: Number(life.worst.toFixed(0)) },
        hitches: life.hitches, freezes: life.freezes, recent: hitches.slice(-12), spikes: spikes.slice().sort((a, b) => b.ms - a.ms).slice(0, 12),
        sections, counters: { ...counters },
      };
    },
    reset() { count = 0; head = 0; totals.clear(); hitches.length = 0; spikes = []; for (const k of Object.keys(counters)) delete counters[k]; life.frames = 0; life.hitches = 0; life.freezes = 0; life.worst = 0; life.since = now(); },
  };
}

// The quality governor: lowers detail when the frame rate is truly low, and
// raises it again when there is room.
//
// It judges the typical frame over a few seconds, not single frames, so a
// hitch (a save, a figure being built, the browser collecting garbage) cannot
// lower the quality: a hitch is not a slow device. And what it takes away it
// gives back, a step at a time, once frames have been comfortably fast for a
// while; a step that was tried and had to be undone is not tried again soon.
export const QUALITY_RULES = Object.freeze({
  levels: 4,              // 0 the most (Ultra), 3 the least (Low): graphics.js
  slowMs: 1000 / 30,      // a typical frame slower than this (under thirty a second), for `downAfter` seconds, steps down
  fastMs: 1000 / 50,      // a typical frame faster than this, for `upAfter` seconds, steps up
  downAfter: 4,
  upAfter: 12,
  settle: 3,              // seconds after a change during which nothing is judged
  retry: 90,              // seconds before a level that had to be undone is tried again; doubled each time it fails
  failWithin: 30,         // a step down this soon (seconds) after a step up: the level stepped up to had to be undone
  window: 45,             // frames the typical frame is taken over
});

// A phone's (26 October 2026, the owner's brief: the game hung on his phones). Stepped down sooner when it cannot keep up
// (under 31 frames a second for two and a half seconds), and back up far more slowly than a computer: each change of
// level on a phone is seconds of work (the pictures made again at another size, the drawing set up afresh), felt as a
// hang, and a phone that could not hold a level in a busy street went back and forth between two all the time it was
// there. Now a minute and a half of comfortably fast frames before it climbs; a level stepped down from within two and
// a half minutes of climbing to it had to be undone, and is not tried again for five minutes, then ten, then fifteen.
export const PHONE_QUALITY_RULES = Object.freeze({ ...QUALITY_RULES, slowMs: 1000 / 31, downAfter: 2.5, upAfter: 90, settle: 4, retry: 150, failWithin: 150 });

export function createGovernor(apply, rules = QUALITY_RULES) {
  const recent = [];
  // (`ceiling`: the most it climbs to by itself; `quickUntil`: until then, on the clock, a slow device is stepped down
  // sooner: the first seconds in the town, when Auto is finding this device's level)
  const state = { level: 0, ceiling: 0, quickUntil: 0, slow: 0, fast: 0, settle: rules.settle, failedAt: new Array(rules.levels).fill(-Infinity), wait: new Array(rules.levels).fill(rules.retry), clock: 0, changes: [], held: false };
  const median = () => { const s = recent.slice().sort((a, b) => a - b); return s[Math.floor(s.length / 2)] || 0; };
  function change(next, why) {
    if (next === state.level) return;
    const from = state.level;
    state.level = next; state.slow = 0; state.fast = 0; state.settle = rules.settle; recent.length = 0;
    state.changes.push({ at: Math.round(state.clock), from, to: next, why });
    if (state.changes.length > 20) state.changes.shift();
    apply(next, from);
  }
  return {
    get level() { return state.level; },
    get changes() { return state.changes.slice(); },
    get typical() { return median(); },
    // `ms` is how long the last frame took; `dt` the seconds it covered
    frame(ms, dt) {
      state.clock += dt;
      // a frame that long is the page being hidden or the device asleep, not the game being slow
      if (ms > 2000 || state.held) return;
      recent.push(ms); if (recent.length > rules.window) recent.shift();
      if (state.settle > 0) { state.settle -= dt; return; }
      if (recent.length < Math.min(rules.window, 20)) return;
      const typical = median();
      if (typical > rules.slowMs) { state.slow += dt; state.fast = 0; } else if (typical < rules.fastMs) { state.fast += dt; state.slow = Math.max(0, state.slow - dt); } else { state.slow = Math.max(0, state.slow - dt); state.fast = 0; }
      const downAfter = state.clock < state.quickUntil ? Math.min(rules.downAfter, 2) : rules.downAfter;
      if (state.slow >= downAfter && state.level < rules.levels - 1) {
        // stepping down so soon after stepping up means the higher level was too much: remember that
        const last = state.changes[state.changes.length - 1];
        if (last && last.to < last.from && state.clock - last.at < (rules.failWithin || 30)) { state.failedAt[last.to] = state.clock; state.wait[last.to] = Math.min(900, state.wait[last.to] * 2); }
        change(state.level + 1, `typical frame ${typical.toFixed(0)} ms`);
      } else if (state.fast >= rules.upAfter && state.level > state.ceiling && state.clock - state.failedAt[state.level - 1] > state.wait[state.level - 1]) {
        change(state.level - 1, `typical frame ${typical.toFixed(0)} ms`);
      }
    },
    // for tests and for the player's own choice
    set(level, why = 'set by hand') { change(Math.max(0, Math.min(rules.levels - 1, level)), why); },
    // a step down for a reason other than the frames (the graphics card nearly full): the level given up is not
    // climbed back to for a while, longer each time it has to be given up again, so that it is not tried and undone
    // over and over
    lower(why) {
      if (state.level >= rules.levels - 1) return;
      const from = state.level;
      state.failedAt[from] = state.clock;
      state.wait[from] = Math.min(900, state.wait[from] * 2);
      change(from + 1, why);
    },
    // keeps the level where it is (true) or lets it move again (false)
    hold(on) { state.held = !!on; },
    get held() { return state.held; },
    // the most it climbs to by itself (the player can still choose more)
    setCeiling(level) { state.ceiling = Math.max(0, Math.min(rules.levels - 1, level)); },
    get ceiling() { return state.ceiling; },
    // judges more quickly for the next `seconds`, settling sooner after a change too
    quick(seconds) { state.quickUntil = state.clock + seconds; state.settle = Math.min(state.settle, 1); },
  };
}
