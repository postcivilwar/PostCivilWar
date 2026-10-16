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

import { BIKE_SOUNDS, BIKE_HORNS, createBikeEngine, soundBikeHorn, profileFor } from './bike-audio.js';
import { POWER_BIKES } from '../sim/power-bikes.js';

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
    nodes = { master, analyser, groups, white: noiseBuffer(ctx, 2, 'white'), brown: noiseBuffer(ctx, 3, 'brown') };
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

  // A motorcycle's engine heard before it is bought (the market's Play Sound): started, held at idle, revved up
  // through the gears and let off again, over and over, until it is stopped. One at a time: a second stops the
  // first, and so does getting on a bike. Gives a function that stops it.
  let preview = null;
  function stopPreview() {
    if (!preview) return;
    const p = preview; preview = null;
    clearInterval(p.timer);
    if (ctx) { p.engine.stop(ctx.currentTime); setTimeout(() => p.engine.dispose(), 1600); }
  }
  function previewBike(id) {
    stopPreview();
    const bike = POWER_BIKES[id];
    if (!bike || !start() || !ctx) return () => {};
    const engine = createBikeEngine(ctx, nodes.vehicles, profileFor(bike), { noise: nodes.white });
    engine.start(ctx.currentTime);
    const began = ctx.currentTime;
    // (one turn of it: idle 1.6 s, up through the gears 3.4 s, let off 1.6 s, idle again 1.4 s)
    const cycle = 8;
    const at = (t) => {
      const k = t % cycle;
      if (k < 1.6) return [0.04, 0];
      if (k < 5) { const u = (k - 1.6) / 3.4; const gear = Math.min(3, Math.floor(u * 4)); const inGear = u * 4 - gear; return [0.18 + gear * 0.08 + inGear * 0.5, 1]; }
      if (k < 6.6) return [Math.max(0.04, 0.6 * (1 - (k - 5) / 1.6)), 0];
      return [0.04, 0];
    };
    const me = { engine, timer: setInterval(() => { if (!ctx || preview !== me) return; const [rev, throttle] = at(ctx.currentTime - began); engine.set(rev, throttle, ctx.currentTime); }, 50) };
    preview = me;
    return () => { if (preview === me) stopPreview(); };
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
    nodes.insects.gain.setTargetAtTime(scene.night * (1 - rain) * 0.007 * inside, now, 1.5);

    // birds, by day and in the dry
    if (now > birdAt && scene.night < 0.3 && rain < 0.2 && !L.indoors) {
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
      if (nodes.bike) { nodes.bike.engine.stop(now); const old = nodes.bike.engine; setTimeout(() => old.dispose(), 1500); }
      const profile = POWER_BIKES[bike.bike] ? profileFor(POWER_BIKES[bike.bike]) : BIKE_SOUNDS[bike.sound] || BIKE_SOUNDS.four1000;
      stopPreview();
      nodes.bike = { id: bike.bike, engine: createBikeEngine(ctx, nodes.vehicles, profile, { noise: nodes.white }) };
      nodes.bike.engine.start(now);
    } else if (!bike && nodes.bike) { nodes.bike.engine.stop(now); const old = nodes.bike.engine; nodes.bike = null; setTimeout(() => old.dispose(), 1500); }
    if (bike) nodes.bike.engine.set(bike.rev, bike.throttle, now);
    if (own && !bike && nodes.own.kind !== own.kind && ENGINE_VOICES[own.kind]) { nodes.own.set(0, 0, now); nodes.own.out.disconnect(); nodes.own = engineVoice(own.kind, false); }
    nodes.own.set(own && !bike ? own.rev : 0, own && !bike ? 0.21 + own.throttle * 0.24 : 0, now);
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
    start, update, bell, footstep, horn, bikeHorn, previewBike, stopPreview, previewing: () => !!preview, blow, whistle, shout, door, chime, shutter, choose, focus, level,
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
      bike: ctx && nodes.bike ? { id: nodes.bike.id, profile: nodes.bike.engine.profile.name, running: nodes.bike.engine.running } : null }),
  };
}
