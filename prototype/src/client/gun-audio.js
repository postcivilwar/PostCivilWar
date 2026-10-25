// How the guns sound (25 October 2026, the owner's brief: "Use my supplied WAV gunshot sound. Do not replace it with a
// generated or unrelated sound ... Play the correct gunshot sound when a shot is actually fired. Prevent overlapping sound
// loops or duplicate sounds ... Give the sound appropriate spatial positioning and distance attenuation ... Handle audio
// loading failures gracefully"; and of 22 October: "loud close by, fainter far away, with a short echo in the street.
// Every nearby player hears every shot").
//
// His four recordings (gun-sound-files.js) are each one second of automatic fire: eight to thirteen rounds and the
// echo of the last dying away. Each is found here, round by round (`findShots`: where the sound jumps up), and every
// round fired plays one of his rounds, from where it begins to just past where the next began, so that a burst rings
// on under itself as real fire does; never the same one twice running. When the firing stops, the echo of the last
// round of one of his recordings is played after it (`tail`). His files are played as they are: nothing is made louder,
// cut into new files or changed.
//
// The player's own shots are heard in their own hands; anyone else's (another player's, a police officer's) from where
// it is fired: fainter and duller the further off (a filter that takes the top off with distance), later by the time
// sound takes to come that far, and not at all beyond 400 m; in the street each one also rings off the buildings (a
// short echo, less indoors). A round that passes close by is heard cracking past; one that strikes something near is
// heard strike it.
//
// He sent no recording of a reload, an empty gun or a round striking something: those are made here, short and quiet
// (noise and tones shaped like a click, a magazine, a handle, dust, metal), and he is told so.

export const GUN_HEARD = 400;            // metres: no shot is heard further off than this
const SPEED_OF_SOUND = 343;
const MOST_VOICES = 16;                  // of his rounds sounding at once, the oldest let go first

// Where each round begins in a recording, and where its echo ends: the envelope over each thousandth of a second, a
// round where it rises sharply (by `rise` within three thousandths) and is the highest rise for 30 ms either side, no
// two within 45 ms. (The same as the tool that measured them on 25 October 2026: 8, 10, 13 and 10 rounds.)
export function findShots(channels, rate, { rise = 0.12, apart = 0.045 } = {}) {
  const n = channels[0].length;
  const win = Math.max(1, Math.round(rate * 0.001));
  const env = new Float32Array(Math.ceil(n / win));
  for (let w = 0; w < env.length; w += 1) {
    let m = 0;
    for (let i = w * win, end = Math.min(n, i + win); i < end; i += 1) for (const c of channels) { const a = Math.abs(c[i]); if (a > m) m = a; }
    env[w] = m;
  }
  const up = new Float32Array(env.length);
  for (let i = 3; i < env.length; i += 1) up[i] = env[i] - env[i - 3];
  const peaks = [];
  for (let i = 3; i < env.length - 3; i += 1) {
    if (up[i] <= rise) continue;
    let best = true;
    for (let j = Math.max(0, i - 30); j <= Math.min(env.length - 1, i + 30); j += 1) if (up[j] > up[i]) { best = false; break; }
    if (!best) continue;
    if (peaks.length && i - peaks[peaks.length - 1] < apart * 1000) continue;
    peaks.push(i);
  }
  // each round from its rise (a few thousandths before it) to the next one's
  const at = peaks.map((p) => Math.max(0, (p - 4) / 1000));
  return at.map((start, k) => ({ start, gap: k + 1 < at.length ? at[k + 1] - start : null }));
}

// The recordings of one gun, fetched and decoded once, and the rounds found in each.
export function createGunVoice(ctx, { out, fetchBytes, urls = {}, indoors = () => false, ear = () => ({ x: 0, y: 1.6, z: 0 }) } = {}) {
  const sets = new Map();          // gun -> { state: 'fetching' | 'ready' | 'failed', takes: [{ buffer, shots, tail }], error }
  const voices = [];               // { src, until }
  let last = null;                 // the take played last: never twice running
  const stats = { shots: 0, tails: 0, refused: 0, far: 0, empty: 0, reload: 0, strikes: 0, past: 0, failed: 0 };

  // the street's echo: one short delay with a little of itself fed back, the top taken off it
  const echoIn = ctx.createGain(), delay = ctx.createDelay(1), feedback = ctx.createGain(), dull = ctx.createBiquadFilter(), wet = ctx.createGain();
  echoIn.gain.value = 1; delay.delayTime.value = 0.13; feedback.gain.value = 0.3; dull.type = 'lowpass'; dull.frequency.value = 2400; wet.gain.value = 0.3;
  echoIn.connect(delay); delay.connect(dull); dull.connect(feedback); feedback.connect(delay); dull.connect(wet); wet.connect(out);

  function load(gun) {
    if (sets.has(gun)) return sets.get(gun).ready;
    const set = { state: 'fetching', takes: [], error: null, ready: null };
    sets.set(gun, set);
    set.ready = Promise.all((urls[gun] || []).map((url) => fetchBytes(url).then((bytes) => ctx.decodeAudioData(bytes)))).then((buffers) => {
      for (const buffer of buffers) {
        const channels = []; for (let c = 0; c < buffer.numberOfChannels; c += 1) channels.push(buffer.getChannelData(c));
        const shots = findShots(channels, buffer.sampleRate);
        if (!shots.length) continue;
        set.takes.push({ buffer, shots, tail: shots[shots.length - 1].start + 0.05 });
      }
      if (!set.takes.length) throw new Error('no rounds found in the recordings');
      set.state = 'ready';
    }).catch((error) => { set.state = 'failed'; set.error = String(error && error.message || error); stats.failed += 1; });
    return set.ready;
  }
  const ready = (gun) => { const s = sets.get(gun); return s && s.state === 'ready' ? s : null; };

  function hold(src, until) {
    voices.push({ src, until });
    for (let i = voices.length - 1; i >= 0; i -= 1) if (voices[i].until < ctx.currentTime) voices.splice(i, 1);
    while (voices.length > MOST_VOICES) { const old = voices.shift(); try { old.src.stop(); } catch (error) { /* ended */ } }
  }
  // Where a sound from (x, y, z) goes: for the player's own, straight to the mix; for anyone else's, through a filter
  // that dulls it with distance and from its place; with how long it takes to arrive and how loud it is there
  function route(at, own) {
    if (own) return { node: out, delay: 0, gain: 1 };
    const e = ear();
    const d = Math.hypot(at.x - e.x, at.y - e.y, at.z - e.z);
    if (d > GUN_HEARD) { stats.far += 1; return null; }
    const pan = ctx.createPanner();
    pan.panningModel = 'equalpower'; pan.distanceModel = 'inverse'; pan.refDistance = 7; pan.rolloffFactor = 1; pan.maxDistance = GUN_HEARD * 2;
    if (pan.positionX) { pan.positionX.value = at.x; pan.positionY.value = at.y; pan.positionZ.value = at.z; } else pan.setPosition(at.x, at.y, at.z);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass'; filter.frequency.value = Math.max(700, 16000 * Math.exp(-d / 110)); filter.Q.value = 0.5;
    filter.connect(pan); pan.connect(out);
    setTimeout(() => { try { filter.disconnect(); pan.disconnect(); } catch (error) { /* gone */ } }, 3000 + (d / SPEED_OF_SOUND) * 1000);
    return { node: filter, echo: pan, delay: d / SPEED_OF_SOUND, gain: 1, d };
  }

  // One round of `gun` fired from `at` ({ x, y, z }); `own`: the player's own (heard in their hands).
  function shot(gun, at, { own = false, level = 1 } = {}) {
    const set = ready(gun);
    if (!set) { load(gun); stats.refused += 1; return false; }
    const r = route(at, own);
    if (!r) return false;
    // one of his rounds, never the one played last
    let take, k, guard = 0;
    do { take = set.takes[Math.floor(Math.random() * set.takes.length)]; k = Math.floor(Math.random() * take.shots.length); guard += 1; } while (last && last.take === take && last.k === k && guard < 8);
    last = { take, k };
    const s = take.shots[k];
    const length = Math.min(0.22, (s.gap || 0.09) * 1.45);
    const t = ctx.currentTime + 0.005 + r.delay;
    const src = ctx.createBufferSource(), gain = ctx.createGain();
    src.buffer = take.buffer;
    gain.gain.setValueAtTime(level * (own ? 0.9 : 1), t);
    gain.gain.setValueAtTime(level * (own ? 0.9 : 1), t + length * 0.55);
    gain.gain.exponentialRampToValueAtTime(0.001, t + length);
    src.connect(gain); gain.connect(r.node);
    // the street's echo (less under a roof)
    // (the echo of a shot further off comes to the ear as faint as the shot: the street's echo is heard where it is)
    const send = ctx.createGain(); send.gain.value = (indoors() ? 0.25 : 0.7) * (own ? 0.6 : Math.min(1, 7 / Math.max(7, r.d || 7)) * 1.2); gain.connect(send); send.connect(echoIn);
    src.start(t, s.start, length + 0.02);
    src.onended = () => { try { send.disconnect(); gain.disconnect(); } catch (error) { /* gone */ } };
    hold(src, t + length);
    stats.shots += 1;
    return true;
  }

  // The firing has stopped: the echo of the last round of one of his recordings, after the last one played.
  function tail(gun, at, { own = false, level = 1 } = {}) {
    const set = ready(gun);
    if (!set) return false;
    const r = route(at, own);
    if (!r) return false;
    const take = set.takes[Math.floor(Math.random() * set.takes.length)];
    const from = take.tail, length = Math.max(0.1, take.buffer.duration - from);
    const t = ctx.currentTime + 0.02 + r.delay;
    const src = ctx.createBufferSource(), gain = ctx.createGain();
    src.buffer = take.buffer;
    gain.gain.setValueAtTime(0.0001, t); gain.gain.exponentialRampToValueAtTime(level * 0.85, t + 0.012);
    gain.gain.setValueAtTime(level * 0.85, t + length * 0.5); gain.gain.exponentialRampToValueAtTime(0.0005, t + length);
    src.connect(gain); gain.connect(r.node);
    src.start(t, from, length);
    src.onended = () => { try { gain.disconnect(); } catch (error) { /* gone */ } };
    hold(src, t + length);
    stats.tails += 1;
    return true;
  }

  // ---- made here: the few sounds he sent no recording of ----
  let noise = null;
  const noiseBuffer = () => {
    if (noise) return noise;
    noise = ctx.createBuffer(1, Math.round(ctx.sampleRate * 0.5), ctx.sampleRate);
    const d = noise.getChannelData(0); for (let i = 0; i < d.length; i += 1) d[i] = Math.random() * 2 - 1;
    return noise;
  };
  // a short burst of filtered noise into `node` at `t`
  function burst(node, t, { type = 'bandpass', freq = 2000, q = 1, level = 0.2, length = 0.03, attack = 0.002 }) {
    const src = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
    src.buffer = noiseBuffer();
    filter.type = type; filter.frequency.value = freq; filter.Q.value = q;
    gain.gain.setValueAtTime(0.0001, t); gain.gain.exponentialRampToValueAtTime(level, t + attack); gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
    src.connect(filter); filter.connect(gain); gain.connect(node);
    src.start(t, Math.random() * 0.4, length + 0.02);
    src.onended = () => { try { gain.disconnect(); } catch (error) { /* gone */ } };
  }
  function ring(node, t, freqs, level, length) {
    for (const [f, share] of freqs) {
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.frequency.value = f;
      gain.gain.setValueAtTime(0.0001, t); gain.gain.exponentialRampToValueAtTime(level * share, t + 0.002); gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
      osc.connect(gain); gain.connect(node); osc.start(t); osc.stop(t + length + 0.02);
      osc.onended = () => { try { gain.disconnect(); } catch (error) { /* gone */ } };
    }
  }
  // the trigger pulled on an empty gun: a dry click
  function empty() {
    const t = ctx.currentTime + 0.005;
    burst(out, t, { freq: 3200, q: 2.5, level: 0.22, length: 0.025 });
    burst(out, t + 0.012, { type: 'lowpass', freq: 600, level: 0.12, length: 0.04 });
    stats.empty += 1;
  }
  // a reload's steps: the magazine let go and slid out, a fresh one pushed home, the handle pulled and let fly
  function reload(step, at = null) {
    const r = at ? route(at, false) : { node: out, delay: 0 };
    if (!r) return;
    const t = ctx.currentTime + 0.005 + r.delay;
    if (step === 'grab') burst(r.node, t, { freq: 2400, q: 3, level: 0.12, length: 0.03 });
    else if (step === 'out') { burst(r.node, t, { freq: 2800, q: 2, level: 0.16, length: 0.03 }); burst(r.node, t + 0.03, { freq: 1200, q: 0.7, level: 0.07, length: 0.12, attack: 0.02 }); }
    else if (step === 'home') { burst(r.node, t, { freq: 900, q: 1.2, level: 0.2, length: 0.05 }); burst(r.node, t + 0.006, { freq: 3800, q: 3, level: 0.18, length: 0.03 }); ring(r.node, t, [[1850, 1], [2930, 0.5]], 0.025, 0.09); }
    else if (step === 'handle') { burst(r.node, t, { freq: 1700, q: 1.5, level: 0.12, length: 0.06, attack: 0.01 }); burst(r.node, t + 0.11, { freq: 2600, q: 2.5, level: 0.22, length: 0.04 }); ring(r.node, t + 0.11, [[2300, 1], [3650, 0.6]], 0.03, 0.12); }
    stats.reload += 1;
  }
  // a round striking something near the listener: grit off a wall or the ground, a ring off metal, a dull blow on a body
  function strike(what, at) {
    const e = ear();
    if (Math.hypot(at.x - e.x, at.z - e.z) > 45) return;
    const r = route(at, false);
    if (!r) return;
    const t = ctx.currentTime + 0.005 + r.delay;
    if (what === 'vehicle') { ring(r.node, t, [[2350, 1], [3720, 0.7], [5100, 0.35]], 0.08, 0.22); burst(r.node, t, { freq: 4000, q: 1, level: 0.1, length: 0.03 }); }
    else if (what === 'person') { burst(r.node, t, { type: 'lowpass', freq: 380, level: 0.35, length: 0.07 }); burst(r.node, t, { freq: 1400, q: 0.8, level: 0.07, length: 0.04 }); }
    else if (what === 'wall') { burst(r.node, t, { freq: 1900, q: 0.9, level: 0.22, length: 0.06 }); burst(r.node, t + 0.01, { type: 'lowpass', freq: 500, level: 0.12, length: 0.08 }); }
    else if (what === 'ground') burst(r.node, t, { type: 'lowpass', freq: 700, level: 0.2, length: 0.09 });
    stats.strikes += 1;
  }
  // a round cracking past close to the listener (`at`: the nearest point of its path)
  function past(at) {
    const r = route(at, false);
    if (!r) return;
    const t = ctx.currentTime + 0.002;
    burst(r.node, t, { type: 'highpass', freq: 2500, level: 0.18, length: 0.09, attack: 0.004 });
    burst(r.node, t, { freq: 5200, q: 1.5, level: 0.1, length: 0.05 });
    stats.past += 1;
  }

  return {
    load, shot, tail, empty, reload, strike, past, stats,
    // for the tests: whether a gun's recordings are here, and how many rounds were found in each
    state: (gun) => { const s = sets.get(gun); return s ? { state: s.state, error: s.error, rounds: s.takes.map((k) => k.shots.length) } : { state: 'not asked' }; },
    get voices() { return voices.filter((v) => v.until >= ctx.currentTime).length; },
  };
}
