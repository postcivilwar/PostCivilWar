// Sound. Everything heard is made here, in the browser, from oscillators and
// noise: there are no recordings and no files, and none of the music is
// anybody else's. It is a sketch of the town's sound, not a finished mix.
//
// Six groups, each with its own volume, which the player can set:
//   music      a DJ's loudspeaker at the market, a radio at the motor park
//   effects    footsteps, blows, doors, a police whistle
//   ambient    wind, rain, the river, birds, insects, generators, hammering, bells
//   vehicles   the keke you drive, okadas passing, horns, a siren
//   voice      the murmur of a crowd, children at play, a shout
//   interface  the phone ringing, a payment going through, a warning
//
// What keeps it from being a wall of noise:
//   Every place and vehicle is a positional source: heard from its direction,
//   fading with distance, and not played at all beyond its reach.
//   Only so many short sounds may play at once, of each kind and in all; when
//   there is no room, the least important are not started.
//   Only the nearest few loudspeakers, generators and engines are sounded.
//   Things that matter push the rest down for a moment ("ducking"): an
//   engine under your hands lowers the music; a blow, a whistle or the phone
//   lowers music and background; an open panel lowers everything but itself.
//   A limiter on the way out catches what is left.

import { BIKE_SOUNDS, BIKE_HORNS, createBikeEngine, soundBikeHorn, profileFor, BIKE_RECORDINGS, recordingKindOf, recordingPitchOf, createRecordedEngine, holdBikeHorn } from './bike-audio.js';
import { POWER_BIKES } from '../sim/power-bikes.js';
import { POWER_CARS } from '../sim/power-cars.js';
import { carProfile, carHornOf } from './car-audio.js';
import { BIRD_SONGS, FROG_CALLS, cricket } from './bird-songs.js';

// How each kind of engine sounds: lowest pitch, how far it climbs, its
// character. Only the keke and the okada move in this build; the rest are
// here so that a new vehicle has a voice the day it is added.
export const ENGINE_VOICES = Object.freeze({
  keke: Object.freeze({ low: 58, climb: 92, wave: 'sawtooth', putter: 13, bright: 7, level: 0.34 }),
  okada: Object.freeze({ low: 84, climb: 150, wave: 'square', putter: 21, bright: 9, level: 0.22 }),
  car: Object.freeze({ low: 46, climb: 110, wave: 'sawtooth', putter: 0, bright: 5, level: 0.26 }),
  bus: Object.freeze({ low: 38, climb: 60, wave: 'sawtooth', putter: 9, bright: 4, level: 0.34 }),
  truck: Object.freeze({ low: 31, climb: 44, wave: 'sawtooth', putter: 7, bright: 3.5, level: 0.4 }),
  boat: Object.freeze({ low: 70, climb: 60, wave: 'square', putter: 17, bright: 5, level: 0.28 }),
});

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

// ------------------------------------------------------------ instruments --

function pluck(ctx, out, t, note, level = 0.2, length = 0.32, bright = 2400) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  osc.type = 'triangle';
  osc.frequency.value = midi(note);
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(bright, t);
  filter.frequency.exponentialRampToValueAtTime(600, t + length);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(level, t + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
  osc.connect(filter); filter.connect(gain); gain.connect(out);
  osc.start(t); osc.stop(t + length + 0.02);
}

function bass(ctx, out, t, note, level = 0.3, length = 0.28) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(midi(note) * 1.02, t);
  osc.frequency.exponentialRampToValueAtTime(midi(note), t + 0.04);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(level, t + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
  osc.connect(gain); gain.connect(out);
  osc.start(t); osc.stop(t + length + 0.02);
}

function hit(ctx, out, noise, t, kind, level = 0.2) {
  const src = ctx.createBufferSource();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  src.buffer = noise;
  const [type, freq, length] = { shaker: ['highpass', 6000, 0.05], snare: ['bandpass', 1900, 0.11], hat: ['highpass', 8000, 0.03] }[kind];
  filter.type = type;
  filter.frequency.value = freq;
  gain.gain.setValueAtTime(level, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
  src.connect(filter); filter.connect(gain); gain.connect(out);
  src.start(t, (t * 7.3) % 1.5, length + 0.02);
}

function thump(ctx, out, t, level = 0.5, from = 130, to = 48, length = 0.16) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.setValueAtTime(from, t);
  osc.frequency.exponentialRampToValueAtTime(to, t + length * 0.7);
  gain.gain.setValueAtTime(level, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
  osc.connect(gain); gain.connect(out);
  osc.start(t); osc.stop(t + length + 0.02);
}

// A bubble bursting at the boiling river's surface: a short rising tone (the bubble's own ring as it closes) and a soft
// plop under it. `r`: the dice.
function bubble(ctx, out, t, r) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  const f0 = 180 + r() * 260, len = 0.05 + r() * 0.07;
  o.type = 'sine'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f0 * (2.2 + r() * 1.6), t + len);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.32 + r() * 0.2, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  o.connect(g); g.connect(out); o.start(t); o.stop(t + len + 0.02);
}
function tick(ctx, out, t, freq, level = 0.12, length = 0.035) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(level, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
  osc.connect(gain); gain.connect(out);
  osc.start(t); osc.stop(t + length + 0.01);
}

function pad(ctx, out, t, notes, length, level = 0.06, wave = 'sine') {
  for (const note of notes) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = wave;
    osc.frequency.value = midi(note);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(level, t + Math.min(0.12, length * 0.3));
    gain.gain.setValueAtTime(level, t + length * 0.8);
    gain.gain.linearRampToValueAtTime(0.0001, t + length);
    osc.connect(gain); gain.connect(out);
    osc.start(t); osc.stop(t + length + 0.02);
  }
}

// ------------------------------------------------------------------ music --
// Original patterns in familiar West African idioms: a highlife guitar line
// over I, IV and V; an afrobeat vamp; a slow palm-wine figure; a plain hymn.
// A style is a tempo, a step length and a function that plays one step. What
// is played depends only on the step's number, so a station sounds the same
// whenever you walk up to it.

const HIGHLIFE_BARS = [[55, 59, 62, 64], [55, 59, 62, 64], [60, 64, 67, 69], [60, 64, 67, 69], [62, 66, 69, 71], [62, 66, 69, 71], [55, 59, 62, 64], [55, 59, 62, 66]];
const AFRO_BASS = [45, 0, 0, 45, 0, 48, 0, 50, 0, 52, 0, 0, 50, 0, 48, 0];
const PALM_BARS = [[60, 64, 67], [65, 69, 72], [67, 71, 74], [60, 64, 67]];
const HYMN = [[53, 57, 60, 65], [58, 62, 65, 70], [53, 57, 60, 69], [55, 60, 64, 72], [50, 57, 62, 69], [58, 62, 65, 70], [52, 55, 60, 67], [53, 57, 60, 65]];

export const MUSIC_STYLES = Object.freeze({
  highlife: Object.freeze({ step: 60 / 116 / 2, play(ctx, out, noise, t, n) {
    const bar = HIGHLIFE_BARS[Math.floor(n / 8) % 8];
    const s = n % 8;
    const line = [0, 1, 2, 1, 3, 2, 1, 2][s];
    if ([1, 0, 1, 1, 0, 1, 1, 1][s]) pluck(ctx, out, t, bar[line] + 12, s % 2 ? 0.1 : 0.14, 0.26, 3200);
    if (s === 0 || s === 4) bass(ctx, out, t, bar[0] - 12 + (s === 4 ? 7 : 0), 0.26, 0.3);
    if (s === 3 || s === 7) bass(ctx, out, t, bar[0] - 12 + (s === 7 ? 7 : 0), 0.14, 0.16);
    hit(ctx, out, noise, t, 'shaker', s % 2 ? 0.07 : 0.04);
    if ([1, 0, 0, 1, 0, 0, 1, 0][s] || (Math.floor(n / 8) % 2 === 1 && s === 5)) tick(ctx, out, t, 1500, 0.07);
    if (Math.floor(n / 8) % 8 === 7 && (s === 4 || s === 6)) pad(ctx, out, t, [bar[0] + 12, bar[2] + 12], 0.22, 0.05, 'sawtooth');
  } }),
  afrobeat: Object.freeze({ step: 60 / 104 / 4, play(ctx, out, noise, t, n) {
    const s = n % 16;
    const bar = Math.floor(n / 16);
    const lift = bar % 4 === 3 ? 5 : 0;
    if (AFRO_BASS[s]) bass(ctx, out, t, AFRO_BASS[s] + lift - 12, 0.3, 0.2);
    if ([0, 6, 10].includes(s)) thump(ctx, out, t, 0.42);
    if (s === 4 || s === 12) hit(ctx, out, noise, t, 'snare', 0.13);
    hit(ctx, out, noise, t, 'hat', s % 2 ? 0.05 : 0.03);
    if ([2, 5, 8, 11, 14].includes(s)) for (const note of [69, 72, 76]) pluck(ctx, out, t, note + lift, 0.045, 0.07, 4200);
    if (bar % 2 === 1 && s === 0) pad(ctx, out, t, [57 + lift, 64 + lift, 67 + lift], 0.5, 0.04, 'sawtooth');
    if ([0, 3, 7, 10, 12].includes(s)) tick(ctx, out, t, 900, 0.04);
  } }),
  palmwine: Object.freeze({ step: 60 / 92 / 3, play(ctx, out, noise, t, n) {
    const bar = PALM_BARS[Math.floor(n / 12) % 4];
    const s = n % 12;
    pluck(ctx, out, t, bar[[0, 1, 2, 1, 2, 1][s % 6]] + (s >= 6 ? 12 : 0), s % 3 ? 0.07 : 0.11, 0.42, 2000);
    if (s === 0 || s === 6) bass(ctx, out, t, bar[0] - 12, 0.2, 0.5);
    if (s % 3 === 0) tick(ctx, out, t, 760, 0.045, 0.05);
  } }),
  hymn: Object.freeze({ step: 60 / 66, play(ctx, out, noise, t, n) {
    const chord = HYMN[Math.floor(n / 2) % 8];
    if (n % 2 === 0) pad(ctx, out, t, chord, 60 / 66 * 2.04, 0.05, 'triangle');
    if (n % 2 === 0) pad(ctx, out, t, [chord[0] - 12], 60 / 66 * 2.04, 0.07, 'sine');
  } }),
});

function noiseBuffer(ctx, seconds = 2, colour = 'white') {
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  let seed = 22222;
  for (let i = 0; i < data.length; i += 1) {
    seed = (seed * 16807) % 2147483647;
    const white = seed / 1073741823.5 - 1;
    if (colour === 'brown') { last = (last + 0.02 * white) / 1.02; data[i] = last * 3.2; } else data[i] = white;
  }
  return buffer;
}

// Plays a style for a few seconds without a loudspeaker and reports how loud
// it came out: a check that the music makes sound and does not clip.
export async function renderStyle(style, seconds = 4) {
  const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const ctx = new Offline(1, Math.floor(22050 * seconds), 22050);
  const noise = noiseBuffer(ctx);
  const def = MUSIC_STYLES[style];
  for (let n = 0; n * def.step < seconds - 0.5; n += 1) def.play(ctx, ctx.destination, noise, 0.05 + n * def.step, n);
  const data = (await ctx.startRendering()).getChannelData(0);
  let sum = 0, peak = 0;
  for (let i = 0; i < data.length; i += 1) { sum += data[i] * data[i]; peak = Math.max(peak, Math.abs(data[i])); }
  return { style, rms: Math.sqrt(sum / data.length), peak };
}

// ------------------------------------------------------------------ audio --

export const SOUND_GROUPS = Object.freeze(['music', 'effects', 'ambient', 'vehicles', 'voice', 'ui']);
export const SOUND_NAMES = Object.freeze({ master: 'Everything', music: 'Music', effects: 'Effects', ambient: 'Background', vehicles: 'Vehicles', voice: 'Voices', ui: 'Phone and alerts' });
export const DEFAULT_VOLUMES = Object.freeze({ master: 0.9, music: 0.6, effects: 0.8, ambient: 0.7, vehicles: 0.75, voice: 0.7, ui: 0.8 });
// How each group sits in the mix before the player's own volume is applied.
const TRIM = Object.freeze({ music: 0.6, effects: 0.8, ambient: 0.55, vehicles: 0.7, voice: 0.6, ui: 0.7 });
// Short sounds: how many of a kind may play at once, and how much each matters (0 least, 3 most).
const KINDS = Object.freeze({
  footstep: { limit: 2, rank: 1 }, knock: { limit: 1, rank: 0 }, bird: { limit: 1, rank: 0 }, beep: { limit: 1, rank: 0 }, bell: { limit: 1, rank: 1 },
  horn: { limit: 2, rank: 2 }, blow: { limit: 3, rank: 2 }, whistle: { limit: 1, rank: 3 }, shout: { limit: 2, rank: 2 }, door: { limit: 2, rank: 1 }, ui: { limit: 2, rank: 3 },
  shutter: { limit: 2, rank: 3 }, choose: { limit: 1, rank: 3 },
  // the habitation's birds, frogs and crickets (bird-songs.js)
  birdsong: { limit: 3, rank: 0 }, frog: { limit: 2, rank: 0 }, cricket: { limit: 2, rank: 0 },
  // the boiling river's bubbles (21 October 2026)
  boil: { limit: 3, rank: 0 },
});
const MOST_AT_ONCE = 10;         // short sounds, of every kind together
const NEAREST = Object.freeze({ music: 2, generator: 2, engine: 3 });
const UPDATE_EVERY = 0.085;      // seconds between changes to the long sounds: about twelve a second, not sixty

export function createAudio() {
  const Ctx = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
  let ctx = null;
  let muted = false;
  const volumes = { ...DEFAULT_VOLUMES };
  let nodes = null;
  const stations = new Map();
  const engines = [];
  const spots = new Map();          // generators and the like, by id
  const playing = [];               // short sounds now sounding: { kind, until }
  const ear = { x: 0, z: 0 };
  const PEER_HEARD = 120, PEER_ENGINES = 3;   // another player's motorcycle is heard within this many metres; the nearest few
  const ducks = { panel: false, focusUntil: 0 };
  let since = 1;
  let birdAt = 0, knockAt = 0, beepAt = 0, hornAt = 0, stepAt = 0;
  const stats = { started: 0, refused: 0, tooFar: 0 };

  function looped(buffer, filterType, freq, q = 0.7) {
    const src = ctx.createBufferSource();
    src.buffer = buffer; src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType; filter.frequency.value = freq; filter.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(filter); filter.connect(gain);
    src.start();
    return { src, filter, gain };
  }

  function panner(reach = 40) {
    const p = ctx.createPanner();
    p.panningModel = 'equalpower';
    p.distanceModel = 'inverse';
    p.refDistance = Math.max(3, reach * 0.14);
    p.maxDistance = reach * 1.6;
    p.rolloffFactor = 1.5;
    return p;
  }
  const move = (p, x, y, z) => { if (p.positionX) { p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z; } else p.setPosition(x, y, z); };

  function engineVoice(kind, positional) {
    const voice = ENGINE_VOICES[kind];
    const a = ctx.createOscillator(), b = ctx.createOscillator(), lfo = ctx.createOscillator();
    const mix = ctx.createGain(), wobble = ctx.createGain(), filter = ctx.createBiquadFilter(), out = ctx.createGain();
    a.type = voice.wave; b.type = 'sawtooth';
    a.frequency.value = voice.low; b.frequency.value = voice.low * 1.5;
    const second = ctx.createGain();
    second.gain.value = 0.3;
    lfo.frequency.value = voice.putter || 1;
    wobble.gain.value = voice.putter ? 0.3 : 0;
    mix.gain.value = 0.7;
    filter.type = 'lowpass'; filter.frequency.value = 400;
    out.gain.value = 0;
    a.connect(mix); b.connect(second); second.connect(mix); lfo.connect(wobble); wobble.connect(mix.gain);
    mix.connect(filter); filter.connect(out);
    const pan = positional ? panner(55) : null;
    if (pan) { out.connect(pan); pan.connect(nodes.vehicles); } else out.connect(nodes.vehicles);
    a.start(); b.start(); lfo.start();
    return { kind, voice, a, b, lfo, filter, out, pan, set(rev, level, now) {
      const f = voice.low + voice.climb * rev;
      a.frequency.setTargetAtTime(f, now, 0.08);
      b.frequency.setTargetAtTime(f * 1.5, now, 0.08);
      if (voice.putter) lfo.frequency.setTargetAtTime(voice.putter * (0.8 + rev * 1.6), now, 0.1);
      filter.frequency.setTargetAtTime(f * voice.bright * (0.6 + rev * 0.7), now, 0.1);
      out.gain.setTargetAtTime(level * voice.level, now, 0.12);
    } };
  }

  // One group of the mix: what is played into `input` passes its fixed trim,
  // whatever is ducking it at the moment, and the player's own volume.
  function group(name, master) {
    const input = ctx.createGain(), duck = ctx.createGain(), user = ctx.createGain(), meter = ctx.createAnalyser();
    input.gain.value = TRIM[name]; duck.gain.value = 1; user.gain.value = volumes[name];
    meter.fftSize = 1024;
    input.connect(duck); duck.connect(user); user.connect(master); user.connect(meter);
    return { input, duck, user, meter };
  }

  function start() {
    if (!Ctx) return false;
    if (ctx) { if (ctx.state === 'suspended') ctx.resume().catch(() => {}); return true; }
    ctx = new Ctx();
    const master = ctx.createGain();
    const limiter = ctx.createDynamicsCompressor();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    // quiet things are left alone; only what would be too loud is held back
    limiter.threshold.value = -12; limiter.knee.value = 8; limiter.ratio.value = 8; limiter.attack.value = 0.004; limiter.release.value = 0.18;
    master.gain.value = muted ? 0 : volumes.master;
    master.connect(limiter); limiter.connect(ctx.destination); limiter.connect(analyser);
    const groups = {};
    for (const name of SOUND_GROUPS) groups[name] = group(name, master);
    nodes = { master, analyser, groups, white: noiseBuffer(ctx, 2, 'white'), brown: noiseBuffer(ctx, 3, 'brown'), peerBikes: new Map(), peerCars: new Map() };
    for (const name of SOUND_GROUPS) nodes[name] = groups[name].input;
    nodes.wind = looped(nodes.brown, 'lowpass', 420);
    nodes.rain = looped(nodes.white, 'highpass', 1400);
    nodes.river = looped(nodes.brown, 'bandpass', 620, 0.5);
    nodes.people = looped(nodes.brown, 'bandpass', 760, 0.9);
    nodes.children = looped(nodes.white, 'bandpass', 2100, 1.6);
    nodes.tyres = looped(nodes.white, 'bandpass', 900, 0.6);
    for (const key of ['wind', 'rain', 'river']) nodes[key].gain.connect(nodes.ambient);
    nodes.people.gain.connect(nodes.voice);
    nodes.tyres.gain.connect(nodes.vehicles);
    nodes.childrenPan = panner(60);
    nodes.children.gain.connect(nodes.childrenPan); nodes.childrenPan.connect(nodes.voice);
    // insects: two high tones, pulsing
    const insects = ctx.createGain();
    insects.gain.value = 0;
    for (const [freq, rate] of [[4200, 27], [4750, 31]]) { const osc = ctx.createOscillator(); const am = ctx.createOscillator(); const depth = ctx.createGain(); const g = ctx.createGain(); osc.frequency.value = freq; am.frequency.value = rate; depth.gain.value = 0.5; g.gain.value = 0.5; am.connect(depth); depth.connect(g.gain); osc.connect(g); g.connect(insects); osc.start(); am.start(); }
    insects.connect(nodes.ambient);
    nodes.insects = insects;
    nodes.own = engineVoice('keke', false);
    for (let i = 0; i < NEAREST.engine; i += 1) engines.push(engineVoice('okada', true));
    // a siren, for an ambulance or the police: two tones, from a place
    const siren = { osc: ctx.createOscillator(), lfo: ctx.createOscillator(), depth: ctx.createGain(), out: ctx.createGain(), pan: panner(120), on: false };
    siren.osc.type = 'square'; siren.osc.frequency.value = 760; siren.lfo.type = 'square'; siren.lfo.frequency.value = 1.6; siren.depth.gain.value = 140; siren.out.gain.value = 0;
    const soften = ctx.createBiquadFilter(); soften.type = 'lowpass'; soften.frequency.value = 1900;
    siren.lfo.connect(siren.depth); siren.depth.connect(siren.osc.frequency); siren.osc.connect(soften); soften.connect(siren.out); siren.out.connect(siren.pan); siren.pan.connect(nodes.vehicles);
    siren.osc.start(); siren.lfo.start();
    nodes.siren = siren;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return true;
  }

  // May a short sound of this kind start now? Counts it if so.
  function claim(kind, seconds) {
    const now = ctx.currentTime;
    for (let i = playing.length - 1; i >= 0; i -= 1) if (playing[i].until <= now) playing.splice(i, 1);
    const rule = KINDS[kind] || { limit: 2, rank: 1 };
    let same = 0;
    for (const s of playing) if (s.kind === kind) same += 1;
    if (same >= rule.limit) { stats.refused += 1; return false; }
    if (playing.length >= MOST_AT_ONCE) {
      // full: only something that matters more than the least of what is playing may still start
      let least = 9;
      for (const s of playing) least = Math.min(least, (KINDS[s.kind] || { rank: 1 }).rank);
      if (rule.rank <= least) { stats.refused += 1; return false; }
    }
    playing.push({ kind, until: now + seconds });
    stats.started += 1;
    return true;
  }

  // Something that matters is sounding: music and background step back for a moment.
  function focus(seconds = 1.2) { if (ctx) ducks.focusUntil = Math.max(ducks.focusUntil, ctx.currentTime + seconds); }

  // The habitation (20 October 2026): its birds as they sing, each from where it is (bird-songs.js); its waterfalls,
  // the nearest two heard from where they fall, louder the nearer; the nearest stream's babble; little waves at the
  // lagoon's edge; the wind in its trees; and at night its frogs by the water and crickets all round. `h`: { wild (0 to
  // 1: how far into it), calls, falls: [{ id, x, y, z, size }], stream: { x, y, z, rapids } | null, shore (metres to
  // the lagoon's edge), frogs: [{ x, z, kind }], gust (0 to 1), night }.
  const habitat = { falls: new Map(), stream: null, waves: null, leaves: null, boil: null, popAt: 0, cricketAt: 0, frogAt: 0, heard: { songs: 0, kinds: new Set(), frogs: 0, crickets: 0, pops: 0, boiling: 0 } };
  function habitatSounds(h, now, L, rain) {
    const wild = h ? h.wild : 0;
    const quiet = (n) => { if (n) n.gain.gain.setTargetAtTime(0, now, 0.5); };
    if (!h || wild <= 0.01) {
      for (const [id, n] of habitat.falls) { n.low.src.stop(); n.hiss.src.stop(); n.p.disconnect(); habitat.falls.delete(id); }
      quiet(habitat.stream); quiet(habitat.waves); quiet(habitat.leaves);
      if (habitat.boil) { quiet(habitat.boil.seethe); quiet(habitat.boil.hiss); }
      return;
    }
    const night = h.night || 0;
    // birds
    // (taken as they are played: the list is the game's own, filled as the birds sing)
    for (const c of (h.calls || []).splice(0)) {
      const song = BIRD_SONGS[c.song];
      if (!song || night > 0.6 || Math.hypot(c.x - L.x, c.z - L.z) > 140) continue;
      if (!claim('birdsong', 1.6)) break;
      // (louder than the rest of the background, and heard further: 21 October 2026, the owner had not heard them
      // over the rain and his own footsteps)
      const p = panner(150), loud = ctx.createGain();
      loud.gain.value = c.alarm ? 5 : 4;
      move(p, c.x, c.y, c.z);
      loud.connect(p); p.connect(nodes.ambient);
      const len = song(ctx, loud, now + 0.02 + Math.random() * 0.25, nodes.white, Math.random);
      setTimeout(() => { loud.disconnect(); p.disconnect(); }, (len + 1.5) * 1000);
      habitat.heard.songs += 1; habitat.heard.kinds.add(c.song);
    }
    // the waterfalls: a deep roar and a hiss of spray, from the foot of each of the nearest two
    const near = (h.falls || []).map((f) => ({ f, d: Math.hypot(f.x - L.x, f.z - L.z) })).filter((e) => e.d < 280).sort((a, b) => a.d - b.d).slice(0, 2);
    const keep = new Set();
    for (const { f } of near) {
      keep.add(f.id);
      let n = habitat.falls.get(f.id);
      if (!n) { const p = panner(f.size > 0.7 ? 170 : 100); const low = looped(nodes.brown, 'lowpass', 650); const hiss = looped(nodes.white, 'bandpass', 2600, 0.5); low.gain.connect(p); hiss.gain.connect(p); p.connect(nodes.ambient); n = { p, low, hiss }; habitat.falls.set(f.id, n); }
      move(n.p, f.x, f.y, f.z);
      n.low.gain.gain.setTargetAtTime(0.42 * f.size * wild, now, 0.6);
      n.hiss.gain.gain.setTargetAtTime(0.1 * f.size * wild, now, 0.6);
    }
    for (const [id, n] of habitat.falls) if (!keep.has(id)) { n.low.gain.gain.setTargetAtTime(0, now, 0.3); n.hiss.gain.gain.setTargetAtTime(0, now, 0.3); const gone = n; setTimeout(() => { gone.low.src.stop(); gone.hiss.src.stop(); gone.p.disconnect(); }, 1500); habitat.falls.delete(id); }
    // the nearest stream: water over stones (its pitch wandering, as a stream's does)
    if (!habitat.stream) { habitat.stream = looped(nodes.white, 'bandpass', 900, 1.4); habitat.streamPan = panner(45); habitat.stream.gain.connect(habitat.streamPan); habitat.streamPan.connect(nodes.ambient); }
    const st = h.stream;
    if (st) {
      move(habitat.streamPan, st.x, st.y, st.z);
      habitat.stream.filter.frequency.setTargetAtTime(700 + Math.random() * 900, now, 0.06);
      habitat.stream.gain.gain.setTargetAtTime((st.rapids ? 0.2 : 0.11) * wild * (0.75 + Math.random() * 0.25), now, 0.08);
    } else habitat.stream.gain.gain.setTargetAtTime(0, now, 0.5);
    // little waves at the lagoon's edge, in and out
    if (!habitat.waves) { habitat.waves = looped(nodes.brown, 'lowpass', 900); habitat.waves.gain.connect(nodes.ambient); }
    const lap = Math.max(0, 1 - (h.shore === undefined ? 99 : h.shore) / 30);
    habitat.waves.gain.gain.setTargetAtTime(lap * wild * (0.04 + 0.05 * Math.max(0, Math.sin(now * 0.9))), now, 0.25);
    // the wind in the leaves, in gusts
    if (!habitat.leaves) { habitat.leaves = looped(nodes.white, 'bandpass', 5200, 0.6); habitat.leaves.gain.connect(nodes.ambient); }
    habitat.leaves.gain.gain.setTargetAtTime(wild * (0.012 + 0.03 * (h.gust || 0)) * (1 - night * 0.4) * (1 + rain), now, 0.5);
    // the boiling river (21 October 2026): a deep seethe and a hiss of steam from its nearest water, louder the nearer,
    // and its bubbles bursting, a pop and a gurgle at a time, more of them close by
    if (!habitat.boil) {
      const p = panner(140);
      const seethe = looped(nodes.brown, 'lowpass', 380, 0.9), hiss = looped(nodes.white, 'bandpass', 4200, 0.6);
      seethe.gain.connect(p); hiss.gain.connect(p); p.connect(nodes.ambient);
      habitat.boil = { p, seethe, hiss };
    }
    const hot = h.hot;
    if (hot) {
      move(habitat.boil.p, hot.x, hot.y, hot.z);
      const k = wild * Math.max(0, 1 - hot.d / 120);
      habitat.boil.seethe.filter.frequency.setTargetAtTime(300 + Math.random() * 180, now, 0.08);
      habitat.boil.seethe.gain.gain.setTargetAtTime(0.55 * k, now, 0.3);
      habitat.boil.hiss.gain.gain.setTargetAtTime(0.05 * k, now, 0.3);
      if (k > 0.05) habitat.heard.boiling += 1;
      if (hot.d < 70 && now > habitat.popAt) {
        habitat.popAt = now + 0.04 + Math.random() * (0.12 + hot.d / 90);
        const a = Math.random() * Math.PI * 2, r = Math.random() * 6;
        if (at(hot.x + Math.cos(a) * r, hot.z + Math.sin(a) * r, 80, 'boil', 0.25, 'ambient', (out, t) => bubble(ctx, out, t, Math.random))) habitat.heard.pops += 1;
      }
    } else { quiet(habitat.boil.seethe); quiet(habitat.boil.hiss); }
    // at night: crickets all round, and the frogs by the water
    if (night > 0.45 && rain < 0.5) {
      if (now > habitat.cricketAt) {
        habitat.cricketAt = now + 0.12 + Math.random() * 0.35;
        const a = Math.random() * Math.PI * 2, r = 4 + Math.random() * 22;
        if (at(L.x + Math.cos(a) * r, L.z + Math.sin(a) * r, 40, 'cricket', 0.2, 'ambient', (out, t) => cricket(ctx, out, t, Math.random, 0.012 * night))) habitat.heard.crickets += 1;
      }
      const frogs = h.frogs || [];
      if (frogs.length && now > habitat.frogAt) {
        habitat.frogAt = now + 0.5 + Math.random() * 1.6;
        const f = frogs[Math.floor(Math.random() * frogs.length)];
        const call = FROG_CALLS[f.kind] || FROG_CALLS.ribbit;
        if (at(f.x, f.z, 70, 'frog', 0.8, 'ambient', (out, t) => call(ctx, out, t, nodes.white, Math.random))) habitat.heard.frogs += 1;
      }
    }
  }

  // a short sound from a place in the world, into one of the groups
  function at(x, z, reach, kind, seconds, into, build) {
    if (!ctx || muted || ctx.state !== 'running') return false;
    if (Math.hypot(x - ear.x, z - ear.z) > reach * 1.3) { stats.tooFar += 1; return false; }
    if (!claim(kind, seconds)) return false;
    const p = panner(reach);
    move(p, x, 1.6, z);
    p.connect(nodes[into]);
    build(p, ctx.currentTime + 0.02);
    setTimeout(() => p.disconnect(), (seconds + 1) * 1000);
    return true;
  }
  // and one that is not anywhere: in the player's own hands or head
  function here(kind, seconds, into, build) {
    if (!ctx || muted || ctx.state !== 'running' || !claim(kind, seconds)) return false;
    build(nodes[into], ctx.currentTime + 0.01);
    return true;
  }

  function bell(x, z, kind = 'bell') {
    if (kind === 'handbell') { at(x, z, 90, 'bell', 2.6, 'ambient', (out, t) => { for (let k = 0; k < 7; k += 1) for (const [f, level] of [[1760, 0.12], [2640, 0.06], [3520, 0.03]]) tick(ctx, out, t + k * 0.32, f, level, 0.28); }); return; }
    at(x, z, 420, 'bell', 9.5, 'ambient', (out, t) => {
      for (let k = 0; k < 5; k += 1) for (const [f, level, length] of [[196, 0.34, 3.2], [392, 0.19, 2.4], [494, 0.11, 1.8], [588, 0.08, 1.4], [784, 0.04, 1.0]]) {
        const osc = ctx.createOscillator(); const g = ctx.createGain();
        osc.frequency.value = f * (kind === 'bell' ? 1 : 1.2);
        g.gain.setValueAtTime(0.0001, t + k * 1.7); g.gain.exponentialRampToValueAtTime(level, t + k * 1.7 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + k * 1.7 + length);
        osc.connect(g); g.connect(out); osc.start(t + k * 1.7); osc.stop(t + k * 1.7 + length + 0.05);
      }
    });
  }

  function burst(out, t, band, freq, q, level, length, offset = 3.1) {
    const src = ctx.createBufferSource(); const filter = ctx.createBiquadFilter(); const gain = ctx.createGain();
    src.buffer = nodes.white;
    filter.type = band; filter.frequency.value = freq; filter.Q.value = q;
    gain.gain.setValueAtTime(level, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
    src.connect(filter); filter.connect(gain); gain.connect(out);
    src.start(t, (t * offset) % 1.5, length + 0.02);
  }

  function footstep(surface = 'earth') {
    if (!ctx || muted || ctx.state !== 'running' || ctx.currentTime < stepAt) return;
    stepAt = ctx.currentTime + 0.12;
    here('footstep', 0.09, 'effects', (out, t) => burst(out, t, 'bandpass', { earth: 340, tar: 900, floor: 1500, wood: 600 }[surface] || 400, surface === 'floor' ? 3 : 1.2, surface === 'earth' ? 0.2 : 0.15, 0.07));
  }

  function horn(x = null, z = null) {
    if (!ctx || muted || ctx.currentTime < hornAt) return;
    hornAt = ctx.currentTime + 0.8;
    const play = (out, t) => { for (const f of [415, 523]) { const osc = ctx.createOscillator(); const g = ctx.createGain(); osc.type = 'square'; osc.frequency.value = f; g.gain.setValueAtTime(0.06, t); g.gain.setValueAtTime(0.06, t + 0.22); g.gain.linearRampToValueAtTime(0.0001, t + 0.26); osc.connect(g); g.connect(out); osc.start(t); osc.stop(t + 0.3); } };
    if (x === null) here('horn', 0.3, 'vehicles', play); else at(x, z, 60, 'horn', 0.3, 'vehicles', play);
  }

  // A power bike's own horn (bike-audio.js BIKE_HORNS), from the player's own bike.
  function bikeHorn(id = 'dual') {
    if (!ctx || muted || ctx.currentTime < hornAt) return;
    const h = BIKE_HORNS[id] || BIKE_HORNS.dual;
    hornAt = ctx.currentTime + h.length + 0.2;
    here('horn', h.length, 'vehicles', (out, t) => soundBikeHorn(ctx, out, h, t));
  }

  // A car's horn (car-audio.js): the player's own (no place given), or another player's, heard where the car is.
  function carHorn(id, x = null, z = null) {
    if (!ctx || muted) return;
    const h = carHornOf(POWER_CARS[id]);
    if (x === null) {
      if (ctx.currentTime < hornAt) return;
      hornAt = ctx.currentTime + h.length + 0.2;
      here('horn', h.length, 'vehicles', (out, t) => soundBikeHorn(ctx, out, h, t));
    } else at(x, z, 90, 'horn', h.length, 'vehicles', (out, t) => soundBikeHorn(ctx, out, h, t));
  }

  // Another player's bike sounding its horn, heard where the bike is.
  function bikeHornAt(id, x, z) {
    const h = BIKE_HORNS[id] || BIKE_HORNS.dual;
    at(x, z, 90, 'horn', h.length, 'vehicles', (out, t) => soundBikeHorn(ctx, out, h, t));
  }

  // The owner's engine recordings (bike-audio.js, BIKE_RECORDINGS): a set (the V-twin's or the sports bike's) is
  // fetched and decoded the first time a bike that plays it is heard, then shared by every engine that plays it.
  const decoded = new Map();
  const fetchBuffer = (url) => {
    // (asked for after what is to be seen: the recordings are a few MB, and the engine is heard once they are here)
    if (!decoded.has(url)) decoded.set(url, fetch(url, { priority: 'low' }).then((r) => { if (!r.ok) throw new Error(`${url}: ${r.status}`); return r.arrayBuffer(); }).then((data) => ctx.decodeAudioData(data)));
    return decoded.get(url);
  };
  const recordingSets = new Map();          // kind -> { buffers, failed }
  function recordingsOf(kind) {
    let r = recordingSets.get(kind);
    if (!r) {
      r = { buffers: null, failed: false };
      recordingSets.set(kind, r);
      const L = BIKE_RECORDINGS.loops[kind];
      Promise.all([L.idle.file, L.mid.file, L.high.file, BIKE_RECORDINGS.start, BIKE_RECORDINGS.stop].map((f) => fetchBuffer(BIKE_RECORDINGS.base + f)))
        .then(([idle, mid, high, startBuf, stopBuf]) => { r.buffers = { idle, mid, high, start: startBuf, stop: stopBuf }; }, () => { r.failed = true; });
    }
    return r;
  }
  // A bike's engine into `out`: the recordings once they are here (null until then). Only if they cannot be fetched
  // at all does it fall back to the engine the game makes itself, and says so (status: recording false).
  function bikeEngine(id, out) {
    const bike = POWER_BIKES[id];
    if (!bike) return null;
    const kind = recordingKindOf(bike), r = recordingsOf(kind);
    if (r.buffers) return createRecordedEngine(ctx, out, { kind, pitch: recordingPitchOf(bike), buffers: r.buffers });
    if (r.failed) return createBikeEngine(ctx, out, profileFor(bike), { noise: nodes.white });
    return null;
  }
  const retire = (engine, now, quiet = false) => { if (!engine) return; engine.stop(now, { quiet }); setTimeout(() => engine.dispose(), 2600); };

  // A motorcycle's engine on its page in the market, before it is bought or ridden: started and switched off with
  // its key, revved for as long as Rev is held (the revs climbing smoothly to its red line and falling back to idle
  // when it is let go), and its horn for as long as Horn is held. One at a time: another bike's, getting on a bike,
  // or leaving the page stops it. It is only a sound: no bike is put in the town and nobody else hears it.
  let preview = null;
  const REV_UP = 0.85, REV_DOWN = 0.55;      // revs (0..1) a second, climbing while Rev is held, falling after
  function stopPreview() {
    if (!preview) return;
    const p = preview; preview = null;
    clearInterval(p.timer);
    if (p.horn) p.horn.stop();
    if (ctx) retire(p.engine, ctx.currentTime, !p.running);
  }
  function previewBike(id) {
    stopPreview();
    const bike = POWER_BIKES[id];
    if (!bike || !start() || !ctx) return null;
    recordingsOf(recordingKindOf(bike));
    const p = { id, engine: null, running: false, wanted: false, revving: false, rev: 0, horn: null, last: ctx.currentTime };
    const tick = () => {
      if (preview !== p || !ctx) return;
      const now = ctx.currentTime, dt = Math.min(0.2, now - p.last);
      p.last = now;
      // the key turned before the recordings arrived: it starts as soon as they are here
      if (p.wanted && !p.engine) { p.engine = bikeEngine(id, nodes.vehicles); if (p.engine) { p.engine.start(now); p.running = true; } }
      const goal = p.running && p.revving ? 1 : 0;
      p.rev = goal > p.rev ? Math.min(goal, p.rev + REV_UP * dt) : Math.max(goal, p.rev - REV_DOWN * dt);
      if (p.engine && p.running) p.engine.set(p.rev, p.running && p.revving ? 1 : 0, now);
    };
    p.timer = setInterval(tick, 40);
    preview = p;
    return {
      id,
      get running() { return p.running || (p.wanted && !p.engine); },
      get rev() { return p.rev; },
      // the key: on (the starter, then idle) or off (it runs down)
      ignite() {
        if (preview !== p) return false;
        if (p.wanted) { p.wanted = false; p.revving = false; if (p.running) retire(p.engine, ctx.currentTime); p.engine = null; p.running = false; p.rev = 0; return false; }
        start();
        p.wanted = true; tick();
        return true;
      },
      revHold(on) { if (preview === p) { p.revving = !!on && p.wanted; tick(); } },
      hornHold(on) {
        if (preview !== p) return;
        if (on && !p.horn && start()) { p.horn = holdBikeHorn(ctx, nodes.vehicles, BIKE_HORNS[bike.horn] || BIKE_HORNS.dual, ctx.currentTime); focus(0.5); }
        else if (!on && p.horn) { p.horn.stop(); p.horn = null; }
      },
      stop() { if (preview === p) stopPreview(); },
    };
  }

  // A blow in a fight: 'punch', 'heavy', 'kick', 'block', 'miss', 'shove', 'fall'. No voices, no gore: a thud and the cloth.
  function blow(kind, x, z) {
    const play = (out, t) => {
      if (kind === 'miss') { burst(out, t, 'bandpass', 1900, 0.8, 0.07, 0.12, 5.3); return; }
      if (kind === 'block') { thump(ctx, out, t, 0.22, 260, 140, 0.07); burst(out, t, 'bandpass', 1300, 1.4, 0.12, 0.05); return; }
      if (kind === 'shove') { thump(ctx, out, t, 0.2, 150, 70, 0.14); burst(out, t, 'lowpass', 700, 0.7, 0.1, 0.16); return; }
      if (kind === 'fall') { thump(ctx, out, t, 0.34, 110, 42, 0.26); burst(out, t + 0.03, 'lowpass', 500, 0.7, 0.12, 0.22); return; }
      const heavy = kind === 'heavy' || kind === 'kick';
      thump(ctx, out, t, heavy ? 0.42 : 0.28, heavy ? 150 : 190, heavy ? 46 : 70, heavy ? 0.2 : 0.12);
      burst(out, t, 'bandpass', heavy ? 900 : 1500, 1.1, heavy ? 0.16 : 0.12, 0.05);
    };
    const made = x === undefined ? here('blow', 0.3, 'effects', play) : at(x, z, 30, 'blow', 0.3, 'effects', play);
    if (made && kind !== 'miss') focus(0.9);
  }

  // A police whistle: a hard trill.
  function whistle(x, z) {
    const made = at(x, z, 110, 'whistle', 1.1, 'effects', (out, t) => {
      const osc = ctx.createOscillator(), trill = ctx.createOscillator(), depth = ctx.createGain(), g = ctx.createGain();
      osc.type = 'triangle'; osc.frequency.value = 2850; trill.frequency.value = 34; depth.gain.value = 190;
      trill.connect(depth); depth.connect(osc.frequency);
      for (const [from, length] of [[0, 0.3], [0.42, 0.55]]) { g.gain.setValueAtTime(0.0001, t + from); g.gain.exponentialRampToValueAtTime(0.16, t + from + 0.02); g.gain.setValueAtTime(0.16, t + from + length - 0.04); g.gain.exponentialRampToValueAtTime(0.0001, t + from + length); }
      osc.connect(g); g.connect(out); osc.start(t); trill.start(t); osc.stop(t + 1.05); trill.stop(t + 1.05);
    });
    if (made) focus(1.6);
  }

  // A shout or a gasp from someone nearby: a vowel-shaped burst, not a word.
  function shout(x, z, kind = 'shout') {
    at(x, z, 45, 'shout', 0.5, 'voice', (out, t) => {
      const osc = ctx.createOscillator(), g = ctx.createGain(), f1 = ctx.createBiquadFilter();
      const base = kind === 'gasp' ? 300 : 190 + Math.random() * 60;
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(base * 1.25, t); osc.frequency.exponentialRampToValueAtTime(base * (kind === 'gasp' ? 1.6 : 0.85), t + 0.3);
      f1.type = 'bandpass'; f1.frequency.value = kind === 'gasp' ? 1400 : 820; f1.Q.value = 2.2;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(kind === 'gasp' ? 0.1 : 0.2, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + (kind === 'gasp' ? 0.22 : 0.4));
      osc.connect(f1); f1.connect(g); g.connect(out); osc.start(t); osc.stop(t + 0.45);
    });
  }

  // A vehicle's door, or a seat taken: 'open', 'shut'.
  function door(x, z, kind = 'shut') {
    at(x, z, 28, 'door', 0.25, 'effects', (out, t) => { thump(ctx, out, t, kind === 'shut' ? 0.26 : 0.12, kind === 'shut' ? 170 : 240, kind === 'shut' ? 60 : 150, kind === 'shut' ? 0.1 : 0.06); burst(out, t, 'bandpass', kind === 'shut' ? 700 : 2100, 1.2, 0.07, 0.04); });
  }

  // The phone and the game's own notices: 'tap', 'ok', 'paid', 'error', 'alert', 'ring'.
  function chime(kind = 'tap') {
    const made = here('ui', kind === 'ring' ? 1.3 : 0.35, 'ui', (out, t) => {
      if (kind === 'tap') tick(ctx, out, t, 1150, 0.05, 0.03);
      else if (kind === 'ok') { tick(ctx, out, t, 880, 0.08, 0.09); tick(ctx, out, t + 0.09, 1320, 0.08, 0.14); }
      else if (kind === 'paid') { tick(ctx, out, t, 1568, 0.07, 0.08); tick(ctx, out, t + 0.07, 2093, 0.07, 0.2); }
      else if (kind === 'error') { tick(ctx, out, t, 330, 0.1, 0.12); tick(ctx, out, t + 0.13, 262, 0.1, 0.2); }
      else if (kind === 'alert') { for (let k = 0; k < 2; k += 1) { tick(ctx, out, t + k * 0.16, 988, 0.1, 0.1); } }
      else if (kind === 'ring') { for (let k = 0; k < 2; k += 1) for (let j = 0; j < 6; j += 1) tick(ctx, out, t + k * 0.62 + j * 0.055, j % 2 ? 1480 : 1245, 0.07, 0.05); }
    });
    if (made && (kind === 'alert' || kind === 'ring' || kind === 'error')) focus(kind === 'ring' ? 1.5 : 0.8);
  }

  // The opening: a camera's shutter for each picture, and the sound of the choice that follows.
  function shutter() {
    return here('shutter', 0.25, 'ui', (out, t) => {
      burst(out, t, 'bandpass', 3200, 0.8, 0.5, 0.022);              // the mirror goes up
      burst(out, t + 0.012, 'lowpass', 420, 0.7, 0.34, 0.05);
      tick(ctx, out, t + 0.07, 190, 0.09, 0.05);
      burst(out, t + 0.074, 'bandpass', 4300, 1.1, 0.42, 0.018);     // the curtain
      burst(out, t + 0.112, 'bandpass', 2400, 0.9, 0.3, 0.03);       // and the mirror comes down
    });
  }
  // 'hero': an open fifth that climbs. 'villain': two low notes a semitone apart, closing in. 'move': a light step between the two.
  function choose(path) {
    if (path === 'move') return here('ui', 0.1, 'ui', (out, t) => tick(ctx, out, t, 660, 0.05, 0.04));
    return here('choose', 1.5, 'ui', (out, t) => {
      const voice = (type, freq, at, level, length, sweep) => {
        const osc = ctx.createOscillator(); const filter = ctx.createBiquadFilter(); const gain = ctx.createGain();
        osc.type = type; osc.frequency.setValueAtTime(freq, t + at);
        filter.type = 'lowpass'; filter.frequency.setValueAtTime(sweep[0], t + at); filter.frequency.exponentialRampToValueAtTime(sweep[1], t + at + length);
        gain.gain.setValueAtTime(0.0001, t + at); gain.gain.exponentialRampToValueAtTime(level, t + at + 0.015); gain.gain.exponentialRampToValueAtTime(0.0001, t + at + length);
        osc.connect(filter); filter.connect(gain); gain.connect(out);
        osc.start(t + at); osc.stop(t + at + length + 0.05);
      };
      if (path === 'villain') {
        voice('sawtooth', 73.42, 0, 0.3, 1.3, [900, 120]);
        voice('sawtooth', 77.78, 0.02, 0.26, 1.3, [900, 110]);
        voice('square', 36.71, 0, 0.2, 1.1, [300, 80]);
        burst(out, t, 'lowpass', 260, 0.7, 0.4, 0.12);
      } else {
        for (const [freq, at] of [[392, 0], [587.33, 0.09], [783.99, 0.18], [1174.66, 0.3]]) { voice('triangle', freq, at, 0.2, 0.7, [4200, 1400]); voice('sawtooth', freq / 2, at, 0.07, 0.5, [1800, 500]); }
        burst(out, t + 0.3, 'highpass', 6000, 0.7, 0.08, 0.35);
      }
    });
  }

  // Called every frame with what the listener's surroundings are:
  //   listener { x, z, yaw, indoors }   hour, night (0..1), weather { intensity }
  //   shore (metres to the water)       crowd (people within a few metres)
  //   own { kind, rev, throttle } or null     engines [{ x, z, rev }] (nearest first)
  //   sources [{ id, kind: 'music'|'generator'|'children'|'work'|'beeps', style, x, z, reach, level }]
  //   panel (a panel is open)           siren { x, z } or null
  function update(dt, scene) {
    if (!ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    const L = scene.listener;
    ear.x = L.x; ear.z = L.z;
    const fx = Math.sin(L.yaw), fz = Math.cos(L.yaw);
    const l = ctx.listener;
    if (l.positionX) { l.positionX.value = L.x; l.positionY.value = 1.6; l.positionZ.value = L.z; l.forwardX.value = fx; l.forwardY.value = 0; l.forwardZ.value = fz; l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0; } else { l.setPosition(L.x, 1.6, L.z); l.setOrientation(fx, 0, fz, 0, 1, 0); }
    ownStep(now);
    // The long sounds are steered about twelve times a second. Sixty times a second was sixty
    // changes a second to every one of them, which is work for nothing and can make a phone crackle.
    since += dt;
    if (since < UPDATE_EVERY) return;
    since = 0;
    const inside = L.indoors ? 0.45 : 1;
    const rain = scene.weather.intensity;
    const set = (node, value) => node.gain.gain.setTargetAtTime(value, now, 0.4);
    set(nodes.wind, (0.04 + rain * 0.04) * inside);
    set(nodes.rain, rain * 0.12);
    nodes.rain.filter.frequency.setTargetAtTime(L.indoors ? 700 : 1400, now, 0.3);
    nodes.rain.filter.type = L.indoors ? 'bandpass' : 'highpass';
    set(nodes.river, Math.max(0, 1 - scene.shore / 60) * 0.1 * inside);
    set(nodes.people, Math.min(1, scene.crowd / 22) * 0.32 * (0.85 + 0.15 * Math.sin(now * 1.7)));
    const wild = scene.habitat ? scene.habitat.wild : 0;
    nodes.insects.gain.setTargetAtTime(scene.night * (1 - rain) * 0.007 * inside * (1 + wild * 1.8), now, 1.5);
    habitatSounds(scene.habitat || null, now, L, rain);

    // birds, by day and in the dry (in the habitation its own birds sing instead: habitatSounds)
    if (now > birdAt && scene.night < 0.3 && rain < 0.2 && !L.indoors && wild < 0.5) {
      birdAt = now + 2.5 + Math.random() * 6;
      if (claim('bird', 0.6)) {
        const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
        const out = pan || nodes.ambient;
        if (pan) { pan.pan.value = Math.random() * 2 - 1; pan.connect(nodes.ambient); setTimeout(() => pan.disconnect(), 2500); }
        const base = 2400 + Math.random() * 1800;
        const notes = 2 + Math.floor(Math.random() * 4);
        for (let k = 0; k < notes; k += 1) {
          const osc = ctx.createOscillator(); const g = ctx.createGain(); const t = now + k * (0.09 + Math.random() * 0.05);
          osc.frequency.setValueAtTime(base * (1 + (k % 2) * 0.18), t); osc.frequency.exponentialRampToValueAtTime(base * (1.25 + (k % 3) * 0.1), t + 0.06);
          g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.03, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.085);
          osc.connect(g); g.connect(out); osc.start(t); osc.stop(t + 0.1);
        }
      }
    }

    // the vehicle being driven, and the wheels on the road. A power bike has an engine of its own (bike-audio.js):
    // started when the player gets on, run down when they get off; the small engine voice is quiet meanwhile.
    const own = scene.own;
    const bike = own && own.kind === 'powerbike' ? own : null;
    if (bike && (!nodes.bike || nodes.bike.id !== bike.bike)) {
      if (nodes.bike) retire(nodes.bike.engine, now);
      stopPreview();
      nodes.bike = { id: bike.bike, engine: null, since: now };
    } else if (!bike && nodes.bike) { retire(nodes.bike.engine, now); nodes.bike = null; }
    if (bike && !nodes.bike.engine) {
      // the key is turned as the player gets on; if the recordings take a while to arrive, it is already running
      nodes.bike.engine = bikeEngine(bike.bike, nodes.vehicles);
      if (nodes.bike.engine) nodes.bike.engine.start(now, { warm: now - nodes.bike.since > 4 });
    }
    if (bike && nodes.bike.engine) nodes.bike.engine.set(bike.rev, bike.throttle, now);
    // other players' motorcycles: each nearby one's own engine, heard from where it is (the nearest few; one engine
    // each, made when it comes near and let go when it goes)
    const peers = (scene.peerBikes || []).filter((q) => POWER_BIKES[q.bike] && Math.hypot(q.x - ear.x, q.z - ear.z) < PEER_HEARD).sort((a, b) => Math.hypot(a.x - ear.x, a.z - ear.z) - Math.hypot(b.x - ear.x, b.z - ear.z)).slice(0, PEER_ENGINES);
    const heardNow = new Set();
    for (const q of peers) {
      heardNow.add(q.key);
      let e = nodes.peerBikes.get(q.key);
      if (e && e.id !== q.bike) { retire(e.engine, now, true); setTimeout(() => e.pan.disconnect(), 3000); nodes.peerBikes.delete(q.key); e = null; }
      if (!e) { e = { id: q.bike, engine: null, pan: panner(PEER_HEARD / 1.6) }; e.pan.connect(nodes.vehicles); nodes.peerBikes.set(q.key, e); }
      move(e.pan, q.x, 0.7, q.z);
      if (!e.engine) { e.engine = bikeEngine(q.bike, e.pan); if (e.engine) e.engine.start(now, { warm: true }); }
      if (e.engine) e.engine.set(q.rev, q.throttle, now);
    }
    for (const [key, e] of nodes.peerBikes) if (!heardNow.has(key)) { retire(e.engine, now, true); setTimeout(() => e.pan.disconnect(), 3000); nodes.peerBikes.delete(key); }
    // a car of the player's own: its own engine (car-audio.js), started as they get in and run down as they get out
    const carOwn = own && own.kind === 'car' && POWER_CARS[own.car] ? own : null;
    if (carOwn && (!nodes.car || nodes.car.id !== carOwn.car)) {
      if (nodes.car) retire(nodes.car.engine, now);
      stopPreview();
      nodes.car = { id: carOwn.car, engine: createBikeEngine(ctx, nodes.vehicles, carProfile(POWER_CARS[carOwn.car]), { noise: nodes.white }), since: now };
      nodes.car.engine.start(now);
    } else if (!carOwn && nodes.car) { retire(nodes.car.engine, now); nodes.car = null; }
    if (carOwn) nodes.car.engine.set(carOwn.rev, carOwn.throttle, now);
    // other players' cars: each nearby one's engine, heard from where it is (the nearest few)
    const cars = (scene.peerCars || []).filter((q) => POWER_CARS[q.car] && Math.hypot(q.x - ear.x, q.z - ear.z) < PEER_HEARD).sort((a, b) => Math.hypot(a.x - ear.x, a.z - ear.z) - Math.hypot(b.x - ear.x, b.z - ear.z)).slice(0, PEER_ENGINES);
    const carsNow = new Set();
    for (const q of cars) {
      carsNow.add(q.key);
      let e = nodes.peerCars.get(q.key);
      if (e && e.id !== q.car) { retire(e.engine, now, true); setTimeout(() => e.pan.disconnect(), 3000); nodes.peerCars.delete(q.key); e = null; }
      if (!e) { e = { id: q.car, engine: null, pan: panner(PEER_HEARD / 1.6) }; e.pan.connect(nodes.vehicles); nodes.peerCars.set(q.key, e); }
      move(e.pan, q.x, 0.6, q.z);
      if (!e.engine) { e.engine = createBikeEngine(ctx, e.pan, carProfile(POWER_CARS[q.car]), { noise: nodes.white }); e.engine.start(now); }
      e.engine.set(q.rev, q.throttle, now);
    }
    for (const [key, e] of nodes.peerCars) if (!carsNow.has(key)) { retire(e.engine, now, true); setTimeout(() => e.pan.disconnect(), 3000); nodes.peerCars.delete(key); }
    if (own && !bike && !carOwn && nodes.own.kind !== own.kind && ENGINE_VOICES[own.kind]) { nodes.own.set(0, 0, now); nodes.own.out.disconnect(); nodes.own = engineVoice(own.kind, false); }
    nodes.own.set(own && !bike && !carOwn ? own.rev : 0, own && !bike && !carOwn ? 0.21 + own.throttle * 0.24 : 0, now);
    nodes.tyres.gain.gain.setTargetAtTime(own ? own.rev * 0.035 : 0, now, 0.2);
    engines.forEach((voice, i) => {
      const e = scene.engines[i];
      if (!e) { voice.set(0, 0, now); return; }
      move(voice.pan, e.x, 0.8, e.z);
      voice.set(e.rev, 0.18 + e.rev * 0.22, now);
    });
    const siren = scene.siren;
    if (siren) move(nodes.siren.pan, siren.x, 2, siren.z);
    nodes.siren.out.gain.setTargetAtTime(siren ? 0.07 : 0, now, 0.15);
    if (siren && Math.hypot(siren.x - L.x, siren.z - L.z) < 60) focus(0.4);

    // Ducking. Music gives way to an engine under the player's hands; music and background give way
    // to whatever has asked for attention; with a panel open everything out in the world drops back.
    const focused = now < ducks.focusUntil;
    const panel = scene.panel ? 0.55 : 1;
    const G = nodes.groups;
    G.music.duck.gain.setTargetAtTime((own ? 1 - own.rev * 0.5 : 1) * (focused ? 0.35 : 1) * panel, now, focused ? 0.05 : 0.5);
    G.ambient.duck.gain.setTargetAtTime((focused ? 0.6 : 1) * panel, now, focused ? 0.05 : 0.5);
    G.voice.duck.gain.setTargetAtTime((focused ? 0.75 : 1) * panel, now, focused ? 0.05 : 0.5);
    G.vehicles.duck.gain.setTargetAtTime(scene.panel ? 0.6 : 1, now, 0.3);

    // places that make a sound of their own: only the nearest few of each kind are sounded
    const wanted = new Set();
    let children = null;
    const near = { music: [], generator: [] };
    for (const s of scene.sources) {
      const d = Math.hypot(s.x - L.x, s.z - L.z);
      if (d > s.reach * 1.5) continue;
      if (s.kind === 'music' || s.kind === 'generator') near[s.kind].push({ s, d: d / s.reach });
      else if (s.kind === 'children') children = !children || d < Math.hypot(children.x - L.x, children.z - L.z) ? s : children;
      else if (s.kind === 'work' && now > knockAt && d < s.reach) { knockAt = now + 1.4 + Math.random() * 3.2; at(s.x, s.z, s.reach, 'knock', 0.7, 'ambient', (out, t) => { for (let k = 0; k < 1 + Math.floor(Math.random() * 3); k += 1) { tick(ctx, out, t + k * 0.21, 1250 + Math.random() * 300, 0.14, 0.05); thump(ctx, out, t + k * 0.21, 0.12, 320, 160, 0.05); } }); }
      else if (s.kind === 'beeps' && now > beepAt && d < s.reach) { beepAt = now + 1.6; at(s.x, s.z, s.reach, 'beep', 0.1, 'ambient', (out, t) => tick(ctx, out, t, 880, 0.05, 0.09)); }
    }
    for (const kind of ['music', 'generator']) near[kind].sort((a, b) => a.d - b.d);
    for (const { s } of near.music.slice(0, NEAREST.music)) {
      wanted.add(s.id);
      let station = stations.get(s.id);
      if (!station) { const p = panner(s.reach); const gain = ctx.createGain(); gain.gain.value = 0; gain.connect(p); p.connect(nodes.music); station = { p, gain, next: 0, def: MUSIC_STYLES[s.style] }; stations.set(s.id, station); }
      move(station.p, s.x, 2.2, s.z);
      station.gain.gain.setTargetAtTime(s.level === undefined ? 1 : s.level, now, 0.5);
      const step = station.def.step;
      if (station.next < now - 0.1) station.next = Math.ceil((now + 0.05) / step) * step;
      while (station.next < now + 0.4) { station.def.play(ctx, station.gain, nodes.white, station.next, Math.round(station.next / step)); station.next += step; }
    }
    for (const { s } of near.generator.slice(0, NEAREST.generator)) {
      wanted.add(s.id);
      let g = spots.get(s.id);
      if (!g) { const p = panner(s.reach); const osc = ctx.createOscillator(); const hum = ctx.createGain(); osc.type = 'sawtooth'; osc.frequency.value = 49; const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 240; hum.gain.value = 0.07; osc.connect(lp); lp.connect(hum); hum.connect(p); const rattle = looped(nodes.brown, 'bandpass', 180, 1.2); rattle.gain.gain.value = 0.085; rattle.gain.connect(p); p.connect(nodes.ambient); osc.start(); g = { p, osc, rattle }; spots.set(s.id, g); }
      move(g.p, s.x, 1, s.z);
    }
    if (children) { move(nodes.childrenPan, children.x, 1.2, children.z); nodes.children.gain.gain.setTargetAtTime(children.level * 0.18 * (0.7 + 0.3 * Math.sin(now * 5.3) * Math.sin(now * 1.9)), now, 0.25); } else nodes.children.gain.gain.setTargetAtTime(0, now, 0.4);
    for (const [id, station] of stations) if (!wanted.has(id)) { station.gain.gain.setTargetAtTime(0, now, 0.15); const gone = station; setTimeout(() => { gone.gain.disconnect(); gone.p.disconnect(); }, 900); stations.delete(id); }
    for (const [id, g] of spots) if (!wanted.has(id)) { g.osc.stop(); g.rattle.src.stop(); g.p.disconnect(); spots.delete(id); }
  }

  // ------------------------------------------------------------ the player's own music --
  // What the player puts on from the phone. One thing plays at a time, and it goes on playing when the phone is
  // put away. A track is either one of the game's own pieces (a style above, played from its first step for a
  // set length, so it has a beginning, an end and a place that can be moved to) or a file beside the page. It
  // goes through the Music volume like every other music, but does not step back when a panel opens: it is the
  // player's, not the town's.
  const deck = { track: null, state: 'idle', error: '', out: null, bus: null, startedAt: 0, offset: 0, next: 0, el: null, node: null, ended: null, token: 0 };
  const ownOut = () => { if (!deck.out) { deck.out = ctx.createGain(); deck.out.gain.value = TRIM.music * 1.25; deck.out.connect(nodes.groups.music.user); } return deck.out; };
  const ownTime = () => (deck.track && deck.track.kind === 'file' ? (deck.el ? deck.el.currentTime : 0) : deck.state === 'playing' && ctx ? deck.offset + (ctx.currentTime - deck.startedAt) : deck.offset);
  const ownLength = () => (!deck.track ? 0 : deck.track.kind === 'file' ? (deck.el && Number.isFinite(deck.el.duration) ? deck.el.duration : 0) : deck.track.duration);
  // whatever has been scheduled a moment ahead is cut off with the bus it was played into
  function ownHush() { if (deck.bus && ctx) { const bus = deck.bus; deck.bus = null; bus.gain.setTargetAtTime(0, ctx.currentTime, 0.02); setTimeout(() => { try { bus.disconnect(); } catch (error) { /* already gone */ } }, 300); } }
  function ownDrop() {
    deck.token += 1;
    ownHush();
    if (deck.el) { const el = deck.el; deck.el = null; try { el.pause(); el.removeAttribute('src'); el.load(); } catch (error) { /* nothing was loaded */ } }
    if (deck.node) { try { deck.node.disconnect(); } catch (error) { /* already gone */ } deck.node = null; }
  }
  function ownLoad(track, { autoplay = true, at = 0 } = {}) {
    if (!start()) { deck.state = 'error'; deck.error = 'This browser cannot play sound.'; return false; }
    ownDrop();
    deck.track = track; deck.error = ''; deck.offset = Math.max(0, at);
    if (track.kind === 'file') {
      const token = deck.token;
      const el = new Audio();
      el.preload = 'auto'; el.src = track.url;
      deck.el = el; deck.state = 'loading';
      try { deck.node = ctx.createMediaElementSource(el); deck.node.connect(ownOut()); } catch (error) { deck.node = null; }
      el.addEventListener('ended', () => { if (token === deck.token) { deck.state = 'ended'; if (deck.ended) deck.ended(); } });
      el.addEventListener('error', () => { if (token === deck.token) { deck.state = 'error'; deck.error = 'That song could not be loaded.'; } });
      el.addEventListener('playing', () => { if (token === deck.token) deck.state = 'playing'; });
      el.addEventListener('waiting', () => { if (token === deck.token && deck.state === 'playing') deck.state = 'loading'; });
      if (at > 0) el.addEventListener('loadedmetadata', () => { if (token === deck.token) { try { el.currentTime = Math.min(at, el.duration || at); } catch (error) { /* not seekable yet */ } } }, { once: true });
      if (autoplay) el.play().catch(() => { if (token === deck.token && deck.state !== 'error') { deck.state = 'paused'; } });
      else deck.state = 'paused';
      return true;
    }
    if (!MUSIC_STYLES[track.style]) { deck.state = 'error'; deck.error = 'That piece is not in this build.'; return false; }
    deck.state = 'paused';
    if (autoplay) ownPlay();
    return true;
  }
  function ownPlay() {
    if (!deck.track || !start()) return false;
    if (deck.track.kind === 'file') { if (deck.el) deck.el.play().catch(() => {}); return true; }
    if (deck.state === 'playing') return true;
    if (deck.offset >= deck.track.duration - 0.05) deck.offset = 0;
    deck.bus = ctx.createGain(); deck.bus.gain.value = 1; deck.bus.connect(ownOut());
    deck.startedAt = ctx.currentTime + 0.06; deck.next = deck.startedAt; deck.state = 'playing';
    return true;
  }
  function ownPause() {
    if (!deck.track) return;
    if (deck.track.kind === 'file') { if (deck.el) deck.el.pause(); deck.state = 'paused'; return; }
    if (deck.state !== 'playing') return;
    deck.offset = Math.min(deck.track.duration, ownTime()); deck.state = 'paused'; ownHush();
  }
  function ownSeek(seconds) {
    if (!deck.track) return;
    const to = Math.max(0, Math.min(ownLength() || 0, Number(seconds) || 0));
    if (deck.track.kind === 'file') { if (deck.el) { try { deck.el.currentTime = to; } catch (error) { /* not seekable yet */ } } return; }
    const was = deck.state === 'playing';
    if (was) ownHush();
    deck.offset = to; deck.state = 'paused';
    if (was) ownPlay();
  }
  // the game's own pieces are played a little ahead, step by step, like the town's loudspeakers
  function ownStep(now) {
    if (deck.state !== 'playing' || !deck.track || deck.track.kind === 'file' || !deck.bus) return;
    const def = MUSIC_STYLES[deck.track.style];
    // the page was held up for a while: carry on from now, in time, rather than play what was missed all at once
    if (deck.next < now - 0.15) deck.next = deck.startedAt + Math.ceil((now + 0.03 - deck.startedAt) / def.step) * def.step;
    while (deck.next < now + 0.4) {
      const at = deck.offset + (deck.next - deck.startedAt);
      if (at >= deck.track.duration) { deck.offset = deck.track.duration; deck.state = 'ended'; ownHush(); if (deck.ended) deck.ended(); return; }
      def.play(ctx, deck.bus, nodes.white, deck.next, Math.round(at / def.step));
      deck.next += def.step;
    }
  }
  const player = Object.freeze({
    load: ownLoad, play: ownPlay, pause: ownPause, seek: ownSeek,
    stop() { ownDrop(); deck.track = null; deck.state = 'idle'; deck.offset = 0; },
    onEnded(fn) { deck.ended = fn; },
    status: () => ({ state: deck.state, error: deck.error, id: deck.track ? deck.track.id : null, time: Math.max(0, Math.min(ownLength() || Infinity, ownTime())), duration: ownLength() }),
  });

  const rmsOf = (analyser) => {
    const data = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(data);
    let sum = 0, peak = 0;
    for (let i = 0; i < data.length; i += 1) { sum += data[i] * data[i]; if (Math.abs(data[i]) > peak) peak = Math.abs(data[i]); }
    return { rms: Math.sqrt(sum / data.length), peak };
  };
  const level = () => (ctx ? rmsOf(nodes.analyser).rms : 0);

  function setVolumes(next = {}) {
    for (const key of Object.keys(volumes)) if (Number.isFinite(next[key])) volumes[key] = Math.max(0, Math.min(1, next[key]));
    if (!ctx) return;
    const now = ctx.currentTime;
    if (!muted) nodes.master.gain.setTargetAtTime(volumes.master, now, 0.05);
    for (const name of SOUND_GROUPS) nodes.groups[name].user.gain.setTargetAtTime(volumes[name], now, 0.05);
  }

  return {
    supported: !!Ctx,
    start, update, bell, footstep, horn, bikeHorn, bikeHornAt, carHorn, previewBike, stopPreview, previewing: () => !!preview, blow, whistle, shout, door, chime, shutter, choose, focus, level,
    player,
    get running() { return !!ctx && ctx.state === 'running'; },
    get muted() { return muted; },
    setMuted(value) { muted = !!value; if (ctx) nodes.master.gain.setTargetAtTime(muted ? 0 : volumes.master, ctx.currentTime, 0.05); },
    setVolume(value) { setVolumes({ master: value }); },
    setVolumes,
    volumes: () => ({ ...volumes }),
    suspend() { if (ctx && ctx.state === 'running') ctx.suspend().catch(() => {}); },
    // what is in the mix right now: for the Help panel and the sound checks
    status: () => ({ supported: !!Ctx, state: ctx ? ctx.state : 'not started', muted, stations: [...stations.keys()], spots: [...spots.keys()], level: level(), peak: ctx ? rmsOf(nodes.analyser).peak : 0,
      groups: ctx ? Object.fromEntries(SOUND_GROUPS.map((name) => [name, rmsOf(nodes.groups[name].meter).rms])) : {},
      ducked: ctx ? Object.fromEntries(SOUND_GROUPS.map((name) => [name, Number(nodes.groups[name].duck.gain.value.toFixed(2))])) : {},
      voices: ctx ? { short: playing.filter((s) => s.until > ctx.currentTime).length, ...stats } : null,
      bike: ctx && nodes.bike ? { id: nodes.bike.id, running: !!nodes.bike.engine && nodes.bike.engine.running, recording: !!nodes.bike.engine && !!nodes.bike.engine.recording, rev: nodes.bike.engine ? nodes.bike.engine.rev : 0 } : null,
      preview: preview ? { id: preview.id, running: preview.running, recording: !!preview.engine && !!preview.engine.recording, rev: preview.rev, revving: preview.revving, horn: !!preview.horn } : null,
      peerBikes: ctx ? [...nodes.peerBikes].map(([key, e]) => ({ key, id: e.id, running: !!e.engine && e.engine.running, recording: !!e.engine && !!e.engine.recording, rev: e.engine ? e.engine.rev : 0 })) : [],
      car: ctx && nodes.car ? { id: nodes.car.id, running: !!nodes.car.engine && nodes.car.engine.running, rev: nodes.car.engine ? nodes.car.engine.rev : 0 } : null,
      peerCars: ctx ? [...nodes.peerCars].map(([key, e]) => ({ key, id: e.id, running: !!e.engine && e.engine.running, rev: e.engine ? e.engine.rev : 0 })) : [],
      recordings: Object.fromEntries([...recordingSets].map(([kind, r]) => [kind, r.buffers ? 'ready' : r.failed ? 'failed' : 'fetching'])),
      // the habitation's: how many songs, of which birds, frogs and crickets have been played; the waterfalls heard now
      habitat: { songs: habitat.heard.songs, kinds: [...habitat.heard.kinds], frogs: habitat.heard.frogs, crickets: habitat.heard.crickets, falls: [...habitat.falls.keys()], fallsLevel: ctx ? [...habitat.falls.values()].map((n) => +n.low.gain.gain.value.toFixed(3)) : [], stream: ctx && habitat.stream ? +habitat.stream.gain.gain.value.toFixed(3) : 0, boiling: habitat.heard.boiling, pops: habitat.heard.pops, boil: ctx && habitat.boil ? +habitat.boil.seethe.gain.gain.value.toFixed(3) : 0 } }),
  };
}
