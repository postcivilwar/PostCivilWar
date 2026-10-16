// The engine and the horn of a power bike (src/sim/power-bikes.js).
//
// The engine is the owner's recordings (16 October 2026; BIKE_RECORDINGS and createRecordedEngine, below): the
// supplied WAV files, cut by tools/audio/bike_sounds.py into an idle, a mid and a high loop for each of the two
// kinds of engine they record (a big V-twin and a sports bike's four), and the start and the switching-off. Every
// bike plays one of the two sets, pitched a little its own way.
//
// The engine made below (createBikeEngine) is heard only when the recordings cannot be fetched at all: a
// four-stroke's beat (revs/60 × cylinders/2 a second) with its exhaust rasp, its pipe's ring and its airbox, the
// revs following the throttle and the gears (bikeRevs). No horn was among the recordings, so the horns are made
// here too (BIKE_HORNS).
//
// Everything plays into the game's own vehicle sound (audio.js), so the volume and mute settings govern it like
// every other engine.

export const BIKE_SOUNDS = Object.freeze({
  // a 500 cc single: low and thumping, a lope at idle
  single500: Object.freeze({ name: '500 cc single', cylinders: 1, idle: 1300, redline: 8500, harmonics: [1, 0.85, 0.6, 0.45, 0.3, 0.22, 0.15, 0.1], lope: 0.55, rasp: 0.16, pipe: 160, pipeQ: 1.6, intake: 0.05, level: 0.42, crackle: 0.5 }),
  // a 650 cc parallel twin: even, gruff
  twin650: Object.freeze({ name: '650 cc parallel twin', cylinders: 2, idle: 1200, redline: 9500, harmonics: [1, 0.7, 0.55, 0.42, 0.3, 0.2, 0.14, 0.1, 0.07], lope: 0.12, rasp: 0.13, pipe: 210, pipeQ: 1.3, intake: 0.07, level: 0.4, crackle: 0.4 }),
  // a 1000 cc inline four: smooth at the bottom, a howl at the top
  four1000: Object.freeze({ name: '1000 cc inline four', cylinders: 4, idle: 1400, redline: 13500, harmonics: [1, 0.55, 0.5, 0.42, 0.38, 0.3, 0.26, 0.2, 0.16, 0.12, 0.09], lope: 0.03, rasp: 0.1, pipe: 340, pipeQ: 1.1, intake: 0.12, level: 0.36, crackle: 0.65 }),
  // a 1200 cc V-twin: a deep, uneven potato-potato
  vtwin1200: Object.freeze({ name: '1200 cc V-twin', cylinders: 2, idle: 950, redline: 7000, harmonics: [1, 0.95, 0.7, 0.5, 0.38, 0.26, 0.18, 0.12], lope: 0.75, rasp: 0.18, pipe: 120, pipeQ: 1.8, intake: 0.04, level: 0.46, crackle: 0.35 }),
});

export const BIKE_HORNS = Object.freeze({
  single: Object.freeze({ notes: [440], length: 0.4 }),
  dual: Object.freeze({ notes: [415, 523], length: 0.45 }),
  high: Object.freeze({ notes: [523, 659], length: 0.35 }),
});

// The engine a bike sounds with: its kind of engine, tuned for it (power-bikes.js, `tone`).
export const profileFor = (bike) => Object.freeze({ ...(BIKE_SOUNDS[bike && bike.sound] || BIKE_SOUNDS.four1000), ...((bike && bike.tone) || {}), name: bike ? `${bike.name}` : 'engine' });

// The engine's beat for a share of its rev range (0 idle .. 1 the red line), in times a second.
export function firingHz(profile, rev) {
  const rpm = profile.idle + (profile.redline - profile.idle) * Math.max(0, Math.min(1, rev));
  return (rpm / 60) * (profile.cylinders / 2);
}

// One power bike's engine, sounding into `out` (the game's vehicle sound). `ctx` is the page's AudioContext.
export function createBikeEngine(ctx, out, profile, { noise = null } = {}) {
  const real = ctx.createPeriodicWave(new Float32Array(profile.harmonics.length + 1), Float32Array.from([0, ...profile.harmonics]), { disableNormalization: false });
  const beat = ctx.createOscillator(); beat.setPeriodicWave(real);
  // half the beat, for the lope of a single or a twin: the same engine heard every other stroke
  const half = ctx.createOscillator(); half.type = 'triangle';
  const halfGain = ctx.createGain(); halfGain.gain.value = profile.lope * 0.6;
  // the lope also comes and goes in the loudness of the beat itself
  const lopeDepth = ctx.createGain(); lopeDepth.gain.value = profile.lope * 0.35;
  const body = ctx.createGain(); body.gain.value = 0.7;
  half.connect(lopeDepth); lopeDepth.connect(body.gain);
  beat.connect(body); half.connect(halfGain); halfGain.connect(body);
  // the pipe: a ring at its own pitch, then everything above the revs' reach rolled off
  const pipe = ctx.createBiquadFilter(); pipe.type = 'peaking'; pipe.frequency.value = profile.pipe; pipe.Q.value = profile.pipeQ; pipe.gain.value = 7;
  const tone = ctx.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 600; tone.Q.value = 0.8;
  body.connect(pipe); pipe.connect(tone);
  // the rasp: noise around the beat's upper overtones, louder with the throttle open
  let rasp = null, raspGain = null, airbox = null, airGain = null, crackle = null;
  if (noise) {
    rasp = ctx.createBufferSource(); rasp.buffer = noise; rasp.loop = true;
    const band = ctx.createBiquadFilter(); band.type = 'bandpass'; band.frequency.value = 900; band.Q.value = 0.9;
    raspGain = ctx.createGain(); raspGain.gain.value = 0;
    rasp.connect(band); band.connect(raspGain); raspGain.connect(tone);
    rasp.band = band;
    airbox = ctx.createBufferSource(); airbox.buffer = noise; airbox.loop = true; airbox.playbackRate.value = 0.7;
    const hiss = ctx.createBiquadFilter(); hiss.type = 'bandpass'; hiss.frequency.value = 2600; hiss.Q.value = 1.4;
    airGain = ctx.createGain(); airGain.gain.value = 0;
    airbox.connect(hiss); hiss.connect(airGain);
    crackle = ctx.createGain(); crackle.gain.value = 1;
  }
  const level = ctx.createGain(); level.gain.value = 0;
  tone.connect(level);
  if (airGain) airGain.connect(level);
  level.connect(out);
  beat.start(); half.start(); if (rasp) rasp.start(); if (airbox) airbox.start();

  let running = false, stopped = false, rev = 0, popAt = 0;
  const engine = {
    profile,
    get running() { return running; },
    // made, not recorded
    recording: false,
    get rev() { return rev; },
    // The starter, then it catches and settles to its idle.
    start(now = ctx.currentTime) {
      if (running || stopped) return;
      running = true;
      const f0 = firingHz(profile, 0);
      beat.frequency.setValueAtTime(f0 * 0.25, now); beat.frequency.linearRampToValueAtTime(f0 * 0.35, now + 0.45);
      beat.frequency.setTargetAtTime(f0 * 1.25, now + 0.5, 0.12);        // it catches, a little high
      beat.frequency.setTargetAtTime(f0, now + 1.1, 0.35);               // and settles
      level.gain.setValueAtTime(0, now); level.gain.linearRampToValueAtTime(profile.level * 0.45, now + 0.4); level.gain.setTargetAtTime(profile.level * 0.6, now + 0.5, 0.2);
    },
    // Runs down and goes quiet.
    stop(now = ctx.currentTime) {
      if (!running) return;
      running = false;
      beat.frequency.cancelScheduledValues(now); beat.frequency.setTargetAtTime(firingHz(profile, 0) * 0.3, now, 0.35);
      level.gain.cancelScheduledValues(now); level.gain.setTargetAtTime(0, now, 0.3);
      if (raspGain) raspGain.gain.setTargetAtTime(0, now, 0.2);
      if (airGain) airGain.gain.setTargetAtTime(0, now, 0.2);
    },
    // Each frame (or a few times a second): how far up the rev range it is (0..1) and how open the throttle is.
    set(nextRev, throttle, now = ctx.currentTime) {
      if (!running) return;
      const was = rev;
      rev = Math.max(0, Math.min(1, nextRev));
      const f = firingHz(profile, rev);
      // the revs follow, never jump: up a little slower than down
      beat.frequency.setTargetAtTime(f, now, rev > was ? 0.09 : 0.06);
      half.frequency.setTargetAtTime(f / 2, now, 0.09);
      tone.frequency.setTargetAtTime(Math.min(9000, f * (3.5 + throttle * 3) + 250), now, 0.08);
      pipe.frequency.setTargetAtTime(profile.pipe * (1 + rev * 0.6), now, 0.2);
      level.gain.setTargetAtTime(profile.level * (0.6 + 0.25 * rev + 0.15 * throttle), now, 0.1);
      if (raspGain) { raspGain.gain.setTargetAtTime(profile.rasp * (0.25 + 0.75 * throttle) * (0.5 + rev), now, 0.08); rasp.band.frequency.setTargetAtTime(Math.min(6000, f * 6), now, 0.1); }
      if (airGain) airGain.gain.setTargetAtTime(profile.intake * throttle * rev * rev, now, 0.1);
      // on the overrun: throttle shut with the revs up, the exhaust pops now and then
      if (noise && throttle < 0.05 && rev > 0.35 && now > popAt && Math.random() < profile.crackle * 0.5) { popAt = now + 0.06 + Math.random() * 0.2; pop(now); }
    },
    dispose() {
      stopped = true; running = false;
      const t = ctx.currentTime + 0.5;
      for (const n of [beat, half, rasp, airbox]) if (n) { try { n.stop(t); } catch (error) { /* already stopped */ } }
      setTimeout(() => { try { level.disconnect(); } catch (error) { /* gone */ } }, 700);
    },
  };
  function pop(now) {
    const src = ctx.createBufferSource(); src.buffer = noise;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 700 + Math.random() * 900; f.Q.value = 1.2;
    const g = ctx.createGain(); g.gain.setValueAtTime(profile.level * 0.5, now); g.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
    src.connect(f); f.connect(g); g.connect(level); src.start(now, Math.random()); src.stop(now + 0.07);
  }
  return engine;
}

// A power bike's horn: its notes together, held while pressed (up to its length), into `out`.
export function soundBikeHorn(ctx, out, horn, now = ctx.currentTime) {
  const g = ctx.createGain();
  const shape = ctx.createBiquadFilter(); shape.type = 'bandpass'; shape.frequency.value = 900; shape.Q.value = 0.7;
  g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(0.09, now + 0.02); g.gain.setValueAtTime(0.09, now + horn.length - 0.05); g.gain.exponentialRampToValueAtTime(0.0001, now + horn.length);
  for (const f of horn.notes) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.connect(shape); o.start(now); o.stop(now + horn.length + 0.02); }
  shape.connect(g); g.connect(out);
  return horn.length;
}

// ---- The owner's recordings (16 October 2026) ---------------------------------------------------------------------
// Made ready by tools/audio/bike_sounds.py from the owner's WAV files (kept as supplied; what each one is, as read
// from the sound itself, is written at the top of that tool): for each of the two kinds of engine the owner sent,
// a big deep twin ('twin', the nine "A_hyper-realistic" files) and a high-revving sports bike ('sport', the two
// "gp_motor_powerbikes"), three seamless loops at idle, middle and high revs with the engine's firing frequency in
// each, and the start and the switching off. No horn was among them: the horn is the one made below.
export const BIKE_RECORDINGS = Object.freeze({
  base: 'bikes/sound-',
  loops: Object.freeze({"twin": {"idle": {"file": "twin-idle.wav", "firing": 41.5}, "mid": {"file": "twin-mid.wav", "firing": 55.3}, "high": {"file": "twin-high.wav", "firing": 107.3}}, "sport": {"idle": {"file": "sport-idle.wav", "firing": 45.9}, "mid": {"file": "sport-mid.wav", "firing": 88.4}, "high": {"file": "sport-high.wav", "firing": 246.2}}}),
  start: 'start.wav', stop: 'stop.wav',
  // where the start catches (seconds into start.wav): the idle loop comes in under it from here
  catchAt: 1.1,
});
// Which recordings a bike plays: the cruisers' V-twins the deep twin, the rest the sports bike.
export const recordingKindOf = (bike) => (bike && bike.sound === 'vtwin1200' ? 'twin' : 'sport');
// Each bike pitched a little its own way, from its tuned idle (power-bikes.js, tone.idle): no two exactly alike.
export const recordingPitchOf = (bike) => { const base = BIKE_SOUNDS[bike && bike.sound] || BIKE_SOUNDS.four1000; const idle = (bike && bike.tone && bike.tone.idle) || base.idle; return Math.max(0.88, Math.min(1.14, idle / base.idle)); };
const LAYERS = ['idle', 'mid', 'high'];
const AT = { idle: 0, mid: 0.45, high: 1 };          // the revs (0 idle .. 1 the red line) each loop is heard best at

// The engine, from the recordings: the three loops play together, each faded in where the revs are nearest its own
// and sped up or slowed to the pitch the revs ask for, so that the engine climbs and falls smoothly and none of them
// is ever heard to restart. The revs follow the bike: its speed, its gear and the throttle (bikeRevs), smoothly.
//   buffers  { idle, mid, high, start, stop }: decoded AudioBuffers (see audio.js)
//   out      where it sounds (the game's vehicle sound, or a panner for someone else's bike)
export function createRecordedEngine(ctx, out, { kind = 'sport', pitch = 1, buffers, level: base = 0.9 } = {}) {
  const loops = BIKE_RECORDINGS.loops[kind];
  const lo = loops.idle.firing * pitch, hi = loops.high.firing * pitch * 1.06;
  const firingAt = (rev) => lo * (hi / lo) ** rev;                 // the firing frequency the revs ask for
  const level = ctx.createGain(); level.gain.value = 0;
  // more bite with the throttle open and the revs up, without simply getting louder: a lift in the upper middle
  const bite = ctx.createBiquadFilter(); bite.type = 'peaking'; bite.frequency.value = 1800; bite.Q.value = 0.7; bite.gain.value = 0;
  level.connect(bite); bite.connect(out);
  const voices = {};
  let running = false, stopped = false, rev = 0;
  for (const layer of LAYERS) {
    const src = ctx.createBufferSource(); src.buffer = buffers[layer]; src.loop = true;
    const g = ctx.createGain(); g.gain.value = 0;
    src.connect(g); g.connect(level);
    voices[layer] = { src, g, native: loops[layer].firing };
  }
  const weights = (r) => {
    // equal power between the two loops either side of the revs
    const w = { idle: 0, mid: 0, high: 0 };
    if (r <= AT.mid) { const k = r / AT.mid; w.idle = Math.cos(k * Math.PI / 2); w.mid = Math.sin(k * Math.PI / 2); } else { const k = (r - AT.mid) / (AT.high - AT.mid); w.mid = Math.cos(k * Math.PI / 2); w.high = Math.sin(k * Math.PI / 2); }
    return w;
  };
  function steer(now, glide) {
    const f = firingAt(rev), w = weights(rev);
    for (const layer of LAYERS) {
      const v = voices[layer];
      v.src.playbackRate.setTargetAtTime(Math.max(0.5, Math.min(2.2, f / v.native)), now, glide);
      v.g.gain.setTargetAtTime(w[layer], now, glide);
    }
  }
  const startAt = ctx.currentTime;
  for (const layer of LAYERS) voices[layer].src.start(startAt, Math.random() * 0.5);
  return {
    recording: true,
    get running() { return running; },
    get rev() { return rev; },
    // The ignition: the owner's start, then the idle comes in under it as it catches. `warm`: already running (a
    // bike seen from afar, or the recordings arriving while it runs): no start sound.
    start(now = ctx.currentTime, { warm = false } = {}) {
      if (running || stopped) return;
      running = true; rev = 0; steer(now, 0.01);
      if (!warm && buffers.start) {
        const s = ctx.createBufferSource(); s.buffer = buffers.start;
        const g = ctx.createGain(); g.gain.value = base; s.connect(g); g.connect(out); s.start(now);
        level.gain.setValueAtTime(0, now); level.gain.setValueAtTime(0, now + BIKE_RECORDINGS.catchAt); level.gain.linearRampToValueAtTime(base * 0.8, now + BIKE_RECORDINGS.catchAt + 0.6);
      } else { level.gain.setValueAtTime(0, now); level.gain.linearRampToValueAtTime(base * 0.8, now + 0.35); }
    },
    // Switched off: the owner's running-down, and the loops let go under it.
    stop(now = ctx.currentTime, { quiet = false } = {}) {
      if (!running) return;
      running = false;
      level.gain.cancelScheduledValues(now); level.gain.setTargetAtTime(0, now, quiet ? 0.12 : 0.08);
      if (!quiet && buffers.stop) { const s = ctx.createBufferSource(); s.buffer = buffers.stop; const g = ctx.createGain(); g.gain.value = base * 0.9; s.connect(g); g.connect(out); s.start(now); }
    },
    // The revs (0 idle .. 1 the red line) and the throttle (0..1), each frame or a few times a second.
    set(nextRev, throttle = 0, now = ctx.currentTime) {
      if (!running) return;
      const was = rev;
      rev = Math.max(0, Math.min(1, nextRev));
      steer(now, rev > was ? 0.08 : 0.12);            // up a little quicker than down: an engine falls back gently
      level.gain.setTargetAtTime(base * (0.8 + 0.12 * rev + 0.08 * throttle), now, 0.12);
      bite.gain.setTargetAtTime(4.5 * throttle * (0.3 + 0.7 * rev), now, 0.1);
    },
    dispose() {
      stopped = true; running = false;
      const t = ctx.currentTime + 0.4;
      for (const layer of LAYERS) { try { voices[layer].src.stop(t); } catch (error) { /* already stopped */ } }
      setTimeout(() => { try { bite.disconnect(); } catch (error) { /* gone */ } }, 600);
    },
  };
}

// A horn held for as long as the button is (the game's own horn: no recording of one was supplied). Gives stop().
export function holdBikeHorn(ctx, out, horn, now = ctx.currentTime) {
  const g = ctx.createGain();
  const shape = ctx.createBiquadFilter(); shape.type = 'bandpass'; shape.frequency.value = 900; shape.Q.value = 0.7;
  g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(0.09, now + 0.02);
  const oscs = horn.notes.map((f) => { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.connect(shape); o.start(now); return o; });
  shape.connect(g); g.connect(out);
  let done = false;
  return { stop(at = ctx.currentTime) { if (done) return; done = true; const end = Math.max(at, now + 0.15); g.gain.setValueAtTime(0.09, end); g.gain.exponentialRampToValueAtTime(0.0001, end + 0.06); for (const o of oscs) o.stop(end + 0.08); } };
}
