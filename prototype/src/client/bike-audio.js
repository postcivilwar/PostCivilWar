// The engine and the horn of a power bike (src/sim/power-bikes.js), made by the game itself as it plays: no
// recording of anyone's motorcycle is used. Each bike names one of the engines below, or brings its own
// recordings (see `recordings`), and one of the horns.
//
// An engine is heard as what it is: a four-stroke fires each cylinder once every two turns of the crank, so it
// beats at revs/60 × cylinders/2 times a second, and that beat, with the pipes it goes out through, is its
// sound. A big single thumps, slow and uneven; a V-twin lopes (its two cylinders fire close together, then a
// gap); a parallel twin is even and gruff; an inline four is smooth and climbs to a howl. Each is made from that
// beat (an oscillator whose overtones are that engine's), half of it for the lope of a single or a twin, the
// rasp of the exhaust (noise around the beat), the pipe's own ring (a peak in the filter) and the airbox at high
// revs. The revs follow the throttle and the gears (bikeRevs), smoothly, so nothing jumps; let off at speed and
// the exhaust crackles on the overrun.
//
// Started: the starter turns it over and it catches, rising to its idle. Stopped: it runs down and is quiet.
// It plays into the game's own vehicle sound (audio.js), so the volume and mute settings govern it like
// every other engine, and it is a voice of its own: the town's sounds and the other engines are left as they are.
//
// To give a bike its own recordings later: `recordings: { idle: 'some-bike-idle.mp3', idleRpm: 1100, horn:
// 'some-bike-horn.mp3' }` in its entry. The idle recording is then looped and played faster as the revs climb,
// over the made engine's rasp; nothing else changes.

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

// The engine's beat for a share of its rev range (0 idle .. 1 the red line), in times a second.
export function firingHz(profile, rev) {
  const rpm = profile.idle + (profile.redline - profile.idle) * Math.max(0, Math.min(1, rev));
  return (rpm / 60) * (profile.cylinders / 2);
}

// One power bike's engine, sounding into `out` (the game's vehicle sound). `ctx` is the page's AudioContext.
export function createBikeEngine(ctx, out, profile, { noise = null, recordings = null, fetchBuffer = null } = {}) {
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
  // a bike's own idle recording, when it has one: looped, faster as the revs climb
  let recorded = null;
  if (recordings && recordings.idle && fetchBuffer) {
    fetchBuffer(recordings.idle).then((buffer) => {
      if (!buffer || stopped) return;
      const src = ctx.createBufferSource(); src.buffer = buffer; src.loop = true;
      const g = ctx.createGain(); g.gain.value = 0.9; src.connect(g); g.connect(level); src.start();
      recorded = { src, g };
      body.gain.value = 0.15;              // the made beat stays only underneath, for weight
    }).catch(() => {});
  }
  beat.start(); half.start(); if (rasp) rasp.start(); if (airbox) airbox.start();

  let running = false, stopped = false, rev = 0, popAt = 0;
  const engine = {
    profile,
    get running() { return running; },
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
      if (recorded) recorded.src.playbackRate.setTargetAtTime(Math.max(0.5, (profile.idle + (profile.redline - profile.idle) * rev) / (recordings.idleRpm || profile.idle)), now, 0.09);
      // on the overrun: throttle shut with the revs up, the exhaust pops now and then
      if (noise && throttle < 0.05 && rev > 0.35 && now > popAt && Math.random() < profile.crackle * 0.5) { popAt = now + 0.06 + Math.random() * 0.2; pop(now); }
    },
    dispose() {
      stopped = true; running = false;
      const t = ctx.currentTime + 0.5;
      for (const n of [beat, half, rasp, airbox, recorded && recorded.src]) if (n) { try { n.stop(t); } catch (error) { /* already stopped */ } }
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
