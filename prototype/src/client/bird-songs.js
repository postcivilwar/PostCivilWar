// The habitation's voices (20 October 2026, the owner's brief: "varied birdsong", and at night "insects and frogs"),
// made here from oscillators and noise as every sound in the game is (audio.js): no recordings. Each kind of bird in
// render-habitation-life.js BIRD_KINDS has a song of its own, after the real bird's: the grey parrot's whistles and
// squawks, the parakeet's screech, the turaco's deep "kok-kok-kok", the hornbill's piping, the pied crow's "kraak", the
// bulbul's quick phrase, the sunbird's high twitter, the weavers' sizzling chatter, the kingfisher's thin "tseet", the
// egret's croak, the hadada's "haa-haa-de-dah" and the fish eagle's ringing cry.
//
//   BIRD_SONGS[song](ctx, out, t, noise, rnd)     schedules one song into `out`, starting at `t`; returns its length (s)
//   FROG_CALLS[kind](ctx, out, t, noise, rnd)      the same for a frog
//   cricket(ctx, out, t, rnd)                      one cricket's chirp

// one note: a tone that slides from `f0` to `f1`, with its own loudness and shape
function note(ctx, out, t, { f0, f1 = f0, len, level = 0.05, wave = 'sine', attack = 0.008, vibrato = 0, vibratoRate = 30, bend = 'exp', filter = null }) {
  const osc = ctx.createOscillator(), g = ctx.createGain();
  osc.type = wave;
  osc.frequency.setValueAtTime(f0, t);
  if (bend === 'exp') osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + len); else osc.frequency.linearRampToValueAtTime(f1, t + len);
  let tail = osc;
  if (vibrato) { const lfo = ctx.createOscillator(), depth = ctx.createGain(); lfo.frequency.value = vibratoRate; depth.gain.value = vibrato; lfo.connect(depth); depth.connect(osc.frequency); lfo.start(t); lfo.stop(t + len + 0.05); }
  if (filter) { const f = ctx.createBiquadFilter(); f.type = filter.type || 'bandpass'; f.frequency.value = filter.f; f.Q.value = filter.q || 1; osc.connect(f); tail = f; }
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(level, t + Math.min(attack, len * 0.4));
  g.gain.setValueAtTime(level, t + Math.max(attack, len * 0.55));
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  tail.connect(g); g.connect(out);
  osc.start(t); osc.stop(t + len + 0.05);
}
// a burst of noise through a band (a squawk's rasp, a weaver's sizzle)
function rasp(ctx, out, noise, t, { f, q = 2, len, level = 0.05, offset = 0 }) {
  const src = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), g = ctx.createGain();
  src.buffer = noise; filter.type = 'bandpass'; filter.frequency.value = f; filter.Q.value = q;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(level, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  src.connect(filter); filter.connect(g); g.connect(out);
  src.start(t, offset % Math.max(0.1, noise.duration - len - 0.1)); src.stop(t + len + 0.05);
}

export const BIRD_SONGS = Object.freeze({
  // whistles, rising and falling, and now and then a harsh squawk
  'grey-parrot'(ctx, out, t, noise, r) {
    const pick = r();
    if (pick < 0.45) { note(ctx, out, t, { f0: 1100 + r() * 300, f1: 2300 + r() * 500, len: 0.26, level: 0.06 }); note(ctx, out, t + 0.32, { f0: 2400, f1: 1300, len: 0.3, level: 0.05 }); return 0.7; }
    if (pick < 0.75) { for (let i = 0; i < 3; i += 1) note(ctx, out, t + i * 0.18, { f0: 1800 + i * 200, f1: 1500 + i * 250, len: 0.12, level: 0.05, vibrato: 60 }); return 0.6; }
    note(ctx, out, t, { f0: 700, f1: 520, len: 0.22, level: 0.06, wave: 'sawtooth', filter: { f: 1400, q: 3 } }); rasp(ctx, out, noise, t, { f: 2200, q: 1.5, len: 0.2, level: 0.035, offset: r() * 1.5 });
    return 0.3;
  },
  // shrill squeaks in pairs
  'senegal-parrot'(ctx, out, t, noise, r) {
    const n = 2 + Math.floor(r() * 3);
    for (let i = 0; i < n; i += 1) note(ctx, out, t + i * 0.16, { f0: 2600 + r() * 400, f1: 3300 + r() * 300, len: 0.08, level: 0.04, wave: 'square', filter: { f: 3000, q: 4 } });
    return n * 0.16;
  },
  // a loud "kee-ak", two to four times
  parakeet(ctx, out, t, noise, r) {
    const n = 2 + Math.floor(r() * 3);
    for (let i = 0; i < n; i += 1) { note(ctx, out, t + i * 0.22, { f0: 3600, f1: 2500, len: 0.14, level: 0.05, wave: 'sawtooth', filter: { f: 3100, q: 3 } }); }
    return n * 0.22;
  },
  // a deep "kok-kok-kok", quicker and quicker, ending in a roll
  'blue-turaco'(ctx, out, t, noise, r) {
    let at = t, gap = 0.32;
    const n = 6 + Math.floor(r() * 5);
    for (let i = 0; i < n; i += 1) { note(ctx, out, at, { f0: 420, f1: 360, len: 0.11, level: 0.07, wave: 'triangle', filter: { f: 520, q: 2 } }); at += gap; gap = Math.max(0.09, gap * 0.85); }
    note(ctx, out, at, { f0: 380, f1: 330, len: 0.6, level: 0.05, wave: 'triangle', vibrato: 40, vibratoRate: 22 });
    return at - t + 0.6;
  },
  // soft hoots, "cou-cou-cou"
  'violet-turaco'(ctx, out, t, noise, r) {
    const n = 5 + Math.floor(r() * 4);
    for (let i = 0; i < n; i += 1) note(ctx, out, t + i * 0.24, { f0: 640, f1: 560, len: 0.16, level: 0.05, wave: 'sine' });
    return n * 0.24;
  },
  // piping whistles, falling a little each time
  hornbill(ctx, out, t, noise, r) {
    const n = 6 + Math.floor(r() * 4);
    for (let i = 0; i < n; i += 1) note(ctx, out, t + i * 0.19, { f0: 1750 - i * 35, f1: 1500 - i * 35, len: 0.12, level: 0.05 });
    return n * 0.19;
  },
  // a harsh "kraak"
  'pied-crow'(ctx, out, t, noise, r) {
    const n = 1 + Math.floor(r() * 3);
    for (let i = 0; i < n; i += 1) { note(ctx, out, t + i * 0.42, { f0: 560, f1: 430, len: 0.3, level: 0.07, wave: 'sawtooth', filter: { f: 950, q: 2.5 } }); rasp(ctx, out, noise, t + i * 0.42, { f: 1300, q: 1.2, len: 0.28, level: 0.04, offset: r() * 1.5 }); }
    return n * 0.42;
  },
  // a quick bright phrase, "kwik-kwik-doctor-quick"
  bulbul(ctx, out, t, noise, r) {
    const phrase = [[1500, 1900, 0.07], [1500, 1900, 0.07], [2100, 1700, 0.09], [1600, 2200, 0.08], [1900, 1400, 0.12]];
    let at = t;
    for (const [a, b, len] of phrase) { note(ctx, out, at, { f0: a * (0.95 + r() * 0.1), f1: b, len, level: 0.045 }); at += len + 0.04; }
    return at - t;
  },
  // a fast high twitter
  sunbird(ctx, out, t, noise, r) {
    const n = 10 + Math.floor(r() * 12);
    let at = t;
    for (let i = 0; i < n; i += 1) { const f = 4200 + r() * 2200; note(ctx, out, at, { f0: f, f1: f * (0.85 + r() * 0.3), len: 0.04, level: 0.025 }); at += 0.05 + r() * 0.03; }
    return at - t;
  },
  // a sizzling chatter, chirps and buzzes (a colony of weavers)
  weaver(ctx, out, t, noise, r) {
    let at = t;
    const n = 8 + Math.floor(r() * 8);
    for (let i = 0; i < n; i += 1) {
      if (r() < 0.4) rasp(ctx, out, noise, at, { f: 4500 + r() * 1500, q: 3, len: 0.09, level: 0.025, offset: r() * 1.5 });
      else note(ctx, out, at, { f0: 2600 + r() * 1400, f1: 2200 + r() * 1200, len: 0.05, level: 0.025 });
      at += 0.06 + r() * 0.05;
    }
    return at - t;
  },
  // a thin high "tseet", two or three
  kingfisher(ctx, out, t, noise, r) {
    const n = 2 + Math.floor(r() * 2);
    for (let i = 0; i < n; i += 1) note(ctx, out, t + i * 0.14, { f0: 6400, f1: 6900, len: 0.07, level: 0.03 });
    return n * 0.14;
  },
  // a low croak, now and then
  egret(ctx, out, t, noise, r) {
    note(ctx, out, t, { f0: 320, f1: 240, len: 0.35, level: 0.05, wave: 'sawtooth', filter: { f: 700, q: 2 } });
    return 0.4;
  },
  // "haa-haa-haa-de-dah": loud and nasal
  ibis(ctx, out, t, noise, r) {
    const n = 3 + Math.floor(r() * 2);
    let at = t;
    for (let i = 0; i < n; i += 1) { note(ctx, out, at, { f0: 640, f1: 520, len: 0.3, level: 0.06, wave: 'sawtooth', filter: { f: 1150, q: 3 } }); at += 0.38; }
    note(ctx, out, at, { f0: 560, f1: 600, len: 0.16, level: 0.05, wave: 'sawtooth', filter: { f: 1150, q: 3 } });
    note(ctx, out, at + 0.2, { f0: 600, f1: 460, len: 0.3, level: 0.055, wave: 'sawtooth', filter: { f: 1100, q: 3 } });
    return at - t + 0.5;
  },
  // the fish eagle's ringing cry: "weee-ah", then "hyo-hyo-hyo"
  'fish-eagle'(ctx, out, t, noise, r) {
    note(ctx, out, t, { f0: 1350, f1: 1650, len: 0.35, level: 0.06, wave: 'triangle' });
    note(ctx, out, t + 0.36, { f0: 1650, f1: 1050, len: 0.4, level: 0.055, wave: 'triangle' });
    for (let i = 0; i < 3; i += 1) note(ctx, out, t + 0.9 + i * 0.2, { f0: 1300, f1: 1100, len: 0.13, level: 0.05, wave: 'triangle' });
    return 1.6;
  },
});

// Frogs at night, by the water: a tree frog's clicks, a reed frog's "ribbit", a big frog's low "rumm".
export const FROG_CALLS = Object.freeze({
  tree(ctx, out, t, noise, r) {
    const n = 4 + Math.floor(r() * 6);
    for (let i = 0; i < n; i += 1) note(ctx, out, t + i * 0.07, { f0: 2100 + r() * 200, f1: 1900, len: 0.03, level: 0.03, wave: 'square', filter: { f: 2200, q: 5 } });
    return n * 0.07;
  },
  ribbit(ctx, out, t, noise, r) {
    for (let i = 0; i < 2; i += 1) note(ctx, out, t + i * 0.18, { f0: 520 + r() * 60, f1: 420, len: 0.13, level: 0.05, wave: 'sawtooth', vibrato: 90, vibratoRate: 38, filter: { f: 900, q: 3 } });
    return 0.4;
  },
  bull(ctx, out, t, noise, r) {
    note(ctx, out, t, { f0: 150, f1: 120, len: 0.55, level: 0.08, wave: 'sawtooth', vibrato: 12, vibratoRate: 18, filter: { f: 300, q: 2, type: 'lowpass' } });
    return 0.6;
  },
});

// One cricket's chirp: three quick pulses of a high tone.
export function cricket(ctx, out, t, r, level = 0.012) {
  const f = 4300 + r() * 600;
  for (let i = 0; i < 3; i += 1) note(ctx, out, t + i * 0.035, { f0: f, len: 0.025, level, attack: 0.003 });
  return 0.12;
}
