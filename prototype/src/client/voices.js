// The town's voices on the page (28 October 2026): plays the recorded lines the simulation says are being said
// (src/sim/voices.js), each from where its speaker stands, and keeps the recordings of the people about the player
// ready to play.
//
//   "Download voices only for the area the player is in, and keep them on the device, so they use little mobile data."
//   "Works offline and needs no AI service or subscription: the voices are files in the game."
//   "It must not slow the game or raise memory on phones."
//
// The recordings are small files beside the page (voices/<line>.mp3, about 25 KB each: tools/voices/game_copies.py).
// Only those of the people within about 60 metres are fetched, a voice at a time, as the player comes near them; once
// fetched, the web app's service worker keeps each on the device (src/site/sw.js), so they are not fetched again and
// play with no connection. The bytes of the fetched ones are kept here as they came (small); a line is made into
// sound only when it is about to be said, and only the last few so made are held (a few MB at most), since sound
// ready to play takes ten times the room of its file.

import { VOICE_TALKS, VOICE_REACTIONS } from '../sim/voice-lines.js';

export const VOICE_PLAYER = Object.freeze({
  folder: 'voices/',
  ready: 6,            // lines held ready to play (made into sound, about 0.8 MB each): the most recent
  fetching: 4,         // files fetched at once
  keepBytes: 120,      // files kept here as they came (about 25 KB each), the most recently wanted (the device keeps them all, sw.js)
});

// every voice's lines, by voice
const LINES = new Map();
const add = (voice, id) => { if (!LINES.has(voice)) LINES.set(voice, []); LINES.get(voice).push(id); };
for (const c of VOICE_TALKS) for (const [voice, id] of c.lines) add(voice, id);
for (const [voice, triggers] of Object.entries(VOICE_REACTIONS)) for (const list of Object.values(triggers)) for (const [id] of list) add(voice, id);

export function createVoicePlayer({ audio, fetchFile = (url) => fetch(url), fingerprints = {} }) {
  const bytes = new Map();       // line id -> ArrayBuffer of its file (most recently wanted last)
  const ready = new Map();       // line id -> AudioBuffer (most recently used last)
  const asked = new Set();       // line ids being fetched or decoded
  const queue = [];              // line ids waiting to be fetched, most urgent first
  const started = new Map();     // speech line id -> handle (what is sounding)
  const seen = new Map();        // speech line id -> [its `ago` when first seen, when that was]
  let busy = 0;
  const stats = { fetched: 0, failed: 0, bytes: 0, decoded: 0, played: 0, late: 0, missed: 0 };

  const url = (id) => `${VOICE_PLAYER.folder}${id}.mp3${fingerprints[id] ? `?v=${fingerprints[id]}` : ''}`;
  function touch(map, key, value) { map.delete(key); map.set(key, value); }

  function pump() {
    while (busy < VOICE_PLAYER.fetching && queue.length) {
      const id = queue.shift();
      if (bytes.has(id)) { asked.delete(id); continue; }
      busy += 1;
      fetchFile(url(id)).then((r) => { if (!r.ok) throw new Error(`${id}: ${r.status}`); return r.arrayBuffer(); })
        .then((b) => { touch(bytes, id, b); stats.fetched += 1; stats.bytes += b.byteLength; while (bytes.size > VOICE_PLAYER.keepBytes) bytes.delete(bytes.keys().next().value); })
        .catch(() => { stats.failed += 1; })
        .finally(() => { busy -= 1; asked.delete(id); pump(); });
    }
  }
  function want(id, urgent = false) {
    if (bytes.has(id) || asked.has(id)) { if (bytes.has(id)) touch(bytes, id, bytes.get(id)); return; }
    asked.add(id);
    if (urgent) queue.unshift(id); else queue.push(id);
    pump();
  }

  // the voices of the people about the player: every line of theirs, fetched once (and kept by the device)
  function prepare(voices) {
    for (const v of voices || []) for (const id of LINES.get(v) || []) want(id);
  }

  function made(id) {
    if (ready.has(id)) { const b = ready.get(id); touch(ready, id, b); return b; }
    if (!bytes.has(id) || asked.has(`d:${id}`)) return null;
    asked.add(`d:${id}`);
    audio.decode(bytes.get(id)).then((b) => { touch(ready, id, b); stats.decoded += 1; while (ready.size > VOICE_PLAYER.ready) ready.delete(ready.keys().next().value); }).catch(() => { stats.failed += 1; }).finally(() => asked.delete(`d:${id}`));
    return null;
  }

  // Each frame: `speech` is what the simulation says is being said near the player now (view.speech); a recorded line
  // is started as soon as it can be, from as far into it as it has got.
  // `where(who)`: where a speaker is drawn now, so that the voice goes with one who walks while talking
  function update(speech, voicesNear, where = null) {
    if (!audio || !audio.running) return;
    prepare(voicesNear);
    const now = new Set();
    for (const line of speech || []) {
      if (!line.voice) continue;
      now.add(line.id);
      if (started.has(line.id)) { const h = started.get(line.id); const at = h && where ? where(line.who) : null; if (at) h.move(at.x, at.z); continue; }
      const buffer = made(line.voice);
      if (!buffer) { want(line.voice, true); continue; }
      // (how far into it this moment is: the simulation's `ago` when the line was first seen, and the time since)
      if (!seen.has(line.id)) seen.set(line.id, [line.ago, performance.now()]);
      const [ago0, at0] = seen.get(line.id);
      const ago = ago0 + (performance.now() - at0) / 1000;
      if (ago >= buffer.duration - 0.2) { stats.missed += 1; started.set(line.id, null); continue; }
      if (ago > 0.4) stats.late += 1;
      started.set(line.id, audio.voiceLine(buffer, line.x, line.z, Math.max(0, ago)));
      stats.played += 1;
    }
    // (a line over is forgotten; one still sounding plays to its end)
    for (const id of started.keys()) if (!now.has(id)) started.delete(id);
    for (const id of seen.keys()) if (!now.has(id)) seen.delete(id);
  }

  return { update, prepare, stats: () => ({ ...stats, kept: bytes.size, ready: ready.size, fetching: busy, waiting: queue.length }), lines: (voice) => (LINES.get(voice) || []).slice() };
}
