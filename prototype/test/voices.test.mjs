// The town's voices (28 October 2026, the owner's brief): the townspeople and the police talk to one another in
// recorded lines, and call out when something happens near them.
//   "When NPCs meet or stand together, they sometimes start a conversation and take turns speaking, facing each other,
//   with talking gestures. Not every NPC talks all the time."
//   "Voices come from the NPC: louder close by, fading with distance, and silent beyond about 25 m."
//   "Every player nearby hears the same conversation at the same time."
//   "Mix lines so conversations rarely repeat exactly, and the same line isn't heard twice in a few minutes."
//   "NPCs react with their reaction lines when something happens near them: a fight, a gunshot, a crash, the police."
//
// What is tested here is the whole script (assets/voices/script.csv) with the lengths it was written to, so that it
// does not wait on the recordings; the recordings themselves are checked at the end (their files, lengths and sizes).
//   node --test test/voices.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { useVoiceData, VOICES } from '../src/sim/voices.js';
import { readScript } from '../tools/voices/script.mjs';
import { VOICE_TALKS, VOICE_REACTIONS, VOICE_CAST } from '../src/sim/voice-lines.js';
import { POSE } from '../src/sim/population.js';
import { town, run, ok, standing, beside } from './world.mjs';
import { createHost } from '../src/sim/host.js';
import { zoneGroundY } from '../src/sim/zone.js';

const SCRIPT = readScript({ estimated: true });
useVoiceData(SCRIPT);

const voiceLines = (w) => w.g.state.talk.lines.filter((l) => l.kind === 'voice');
// runs the town for `seconds`, keeping every recorded line said meanwhile (the town lets a line go once it is over)
function listen(w, seconds) {
  const heard = new Map();
  for (let t = 0; t < seconds; t += 0.1) { w.host.tick(0.1); for (const l of voiceLines(w)) if (!heard.has(l.id)) heard.set(l.id, { ...l, at: w.g.state.t, real: w.g.state.real }); }
  return [...heard.values()];
}
// the first conversation the town's clock has after town time `t`, anywhere: { s, t }
function nextTalk(w, from, limit = 86400) {
  const V = w.I.voices;
  const step = VOICES.slot * w.I.timeScale;
  for (let t = from; t < from + limit; t += step) { const list = V.schedule(t).filter((s) => s.t0 >= t - step); if (list.length) return { s: list[0], t }; }
  return null;
}

test('the script: every conversation two or three people, every line 2 to 8 seconds, at least 60 conversations and 150 reactions', () => {
  assert.ok(SCRIPT.talks.length >= 60, `${SCRIPT.talks.length} conversations`);
  const reactions = Object.values(SCRIPT.reactions).flatMap((r) => Object.values(r).flat());
  assert.ok(reactions.length >= 150, `${reactions.length} reactions`);
  for (const c of SCRIPT.talks) {
    const who = new Set(c.lines.map(([v]) => v));
    assert.ok(who.size >= 2 && who.size <= 3, `${c.id}: ${who.size} people`);
    for (const [, id, seconds] of c.lines) assert.ok(seconds >= 2 && seconds <= 8, `${id}: ${seconds} s`);
  }
  for (const [, seconds] of reactions) assert.ok(seconds >= 2 && seconds <= 8);
  // every voice is someone in the game, but for the two figures still to come
  const away = Object.entries(SCRIPT.cast).filter(([, c]) => !c.who).map(([k]) => k);
  assert.deepEqual(away.sort(), ['jobseeker_ebiye', 'jobseeker_ngozi']);
});

test('a conversation: when two people who talk are standing together, they take turns, each line after the last, from where each stands; and two games hear it alike', () => {
  const w = town(['Listener']);
  const found = nextTalk(w, w.g.state.t);
  assert.ok(found, 'a conversation somewhere in the town within a day');
  const { s } = found;
  // to just before it begins, the listener beside the first speaker
  w.g.advance(Math.max(0, s.t0 - w.g.state.t - 2 * w.I.timeScale));
  const first = s.at[0];
  w.place(w.p, first.x + 2, first.z);
  // and a second game of the same town, with its own player there too
  const w2 = town(['Other']);
  w2.g.advance(w.g.state.t - w2.g.state.t);
  w2.place(w2.p, first.x - 2, first.z);
  assert.equal(Math.round(w.g.state.t), Math.round(w2.g.state.t));
  const length = s.length;
  const said = listen(w, length + 4).filter((l) => l.group === s.key);
  const said2 = listen(w2, length + 4).filter((l) => l.group === s.key);
  assert.equal(said.length, s.c.lines.length, 'every line of it said');
  // in turn: each line begins after the one before has ended
  for (let k = 1; k < said.length; k += 1) assert.ok(said[k].from >= said[k - 1].from + said[k - 1].seconds, `${said[k].voice} after ${said[k - 1].voice}`);
  // the same lines in the other game, at the same moments of the town's clock
  assert.deepEqual(said2.map((l) => l.voice), said.map((l) => l.voice));
  // (each line's beginning by the town's clock: where the town's clock stood when it was heard, less how long before)
  const startOf = (game, line) => line.at - (line.real - line.from) * game.I.timeScale;
  assert.ok(said.every((l, k) => Math.abs(startOf(w, l) - startOf(w2, said2[k])) <= 0.6 * w.I.timeScale), 'at the same time in both games');
  // from where each speaker stands, the people standing within reach of each other, facing the one they speak to
  for (const l of said) {
    const at = s.at.find((q) => q.who === l.who);
    assert.ok(at && Math.hypot(at.x - l.x, at.z - l.z) < 0.2, `${l.voice} said from where ${l.who} stands`);
    assert.ok(l.to && Math.hypot(l.to[0] - l.x, l.to[1] - l.z) <= VOICES.three, 'said to someone beside them');
  }
});

test('heard within 25 metres of the speaker and not beyond; the page is told which recording and how far into it', () => {
  const w = town(['Near', 'Far']);
  const found = nextTalk(w, w.g.state.t);
  const { s } = found;
  w.g.advance(Math.max(0, s.t0 - w.g.state.t - w.I.timeScale));
  const a = s.at[0];
  const near = w.players[0], far = w.players[1];
  w.place(near, a.x + 6, a.z);
  w.place(far, a.x + 31, a.z);
  let heardNear = null, heardFar = null;
  for (let k = 0; k < 120 && !heardNear; k += 1) {
    w.host.tick(0.1);
    heardNear = w.g.view(near.id).speech.find((l) => l.voice);
    heardFar = heardFar || w.g.view(far.id).speech.find((l) => l.voice);
  }
  assert.ok(heardNear, 'heard by the player six metres away');
  assert.ok(heardNear.voice && Number.isFinite(heardNear.ago) && heardNear.ago >= 0 && heardNear.seconds > 1.5 && Number.isFinite(heardNear.x));
  assert.equal(heardFar, undefined, 'not by the one thirty-one metres away');
  // and who is turned to whom, talking
  const talking = w.g.view(near.id).voiceTalk;
  assert.ok(talking.some(([who, , , speaking]) => who === heardNear.who && speaking === 1), 'the speaker, talking');
});

test('through a day: conversations all over the town, some begun by one walking over to the other; none heard again within fifteen minutes, nor any line of it', () => {
  // the town as the website has it: keeping the real clock
  const T = Date.UTC(2026, 9, 28, 5, 0, 0) / 1000;
  const host = createHost({ wallClock: () => T });
  const V = host.game.internals.voices;
  const starts = new Map();      // conversation -> town times it began
  const spans = [];              // [who, from, to]: when each person is taken up by one
  let visits = 0;
  const t0 = host.game.state.t;
  for (let t = t0; t < t0 + 86400; t += VOICES.slot) for (const s of V.schedule(t)) {
    const list = starts.get(s.c.id) || [];
    if (!list.includes(s.t0)) {
      list.push(s.t0);
      if (s.visits) visits += 1;
      for (const w of s.at) { const v = s.visits && s.visits.find((q) => `n:${q.i}` === w.who); const walking = v ? v.walk : 0; spans.push([w.who, s.t0 - walking, s.t0 + s.length + walking]); }
    }
    starts.set(s.c.id, list);
  }
  let begun = 0;
  for (const [id, list] of starts) {
    begun += list.length;
    list.sort((a, b) => a - b);
    for (let k = 1; k < list.length; k += 1) assert.ok(list[k] - list[k - 1] >= 900, `${id} again after ${list[k] - list[k - 1]} s`);
  }
  assert.ok(starts.size >= 25, `${starts.size} different conversations in a day`);
  assert.ok(begun >= 150 && begun <= 600, `${begun} conversations begun in a day`);
  assert.ok(visits >= 30, `${visits} begun by one walking over to the other`);
  // a line belongs to one conversation only, so no line is heard twice within fifteen minutes either
  const owners = new Map();
  for (const c of SCRIPT.talks) for (const [, id] of c.lines) { assert.ok(!owners.has(id), `${id} in two conversations`); owners.set(id, c.id); }
  // and nobody is in two conversations at once
  for (const [who, a0, a1] of spans) for (const [who2, b0, b1] of spans) if (who === who2 && (a0 !== b0 || a1 !== b1)) assert.ok(a1 <= b0 || b1 <= a0, `${who} in two at once`);
});

test('one who goes over to talk walks there the way people walk, stands beside the other while they talk, and walks back', () => {
  const T = Date.UTC(2026, 9, 28, 5, 0, 0) / 1000;
  const host = createHost({ wallClock: () => T });
  const V = host.game.internals.voices, pop = host.game.internals.population;
  let found = null;
  for (let t = host.game.state.t; t < host.game.state.t + 86400 && !found; t += VOICES.slot) found = V.schedule(t).find((s) => s.visits && s.visits[0].walk > 8) || null;
  assert.ok(found, 'a conversation begun by a walk over');
  const v = found.visits[0];
  const o = {};
  let last = null, fastest = 0;
  for (let t = v.t0 - v.walk; t <= v.end + v.walk; t += 0.5) {
    pop.locate(v.i, t, o);
    if (last) fastest = Math.max(fastest, Math.hypot(o.x - last[0], o.z - last[1]) / 0.5);
    last = [o.x, o.z];
    if (t >= v.t0 && t <= v.end) { const b = found.at.find((q) => q.who !== `n:${v.i}` && !found.visits.some((x) => `n:${x.i}` === q.who)); assert.ok(Math.hypot(o.x - b.x, o.z - b.z) <= VOICES.beside + 0.3, 'beside the other while they talk'); assert.equal(o.pose, POSE.stand); }
  }
  assert.ok(fastest <= VOICES.pace + 0.05, `walking (${fastest.toFixed(2)} m/s at most)`);
  // back where their own day has them, after
  pop.locate(v.i, v.end + v.walk + 2, o);
  const own = {}; pop.planned(v.i, v.end + v.walk + 2, own);
  assert.ok(Math.hypot(o.x - own.x, o.z - own.z) < 0.01, 'back where they were');
});

test('a gunshot: one or two of those near call out, each their own line for it; and they do not say it again at once', () => {
  const w = town(['Shooter Test']);
  // somewhere with several of his townspeople standing about
  let spot = null;
  for (let k = 0; k < 48 && !spot; k += 1) {
    for (const q of standing(w, 0, 0, { range: 400, adult: false })) {
      const around = standing(w, q.x, q.z, { range: 12, adult: false });
      if (around.length >= 2) { spot = q; break; }
    }
    if (!spot) run(w.host, 20);
  }
  assert.ok(spot, 'people standing together');
  beside(w, w.p, spot, { metres: 4 });
  ok(w.send(w.id, { type: 'gun.draw' }));
  const fire = () => w.send(w.id, { type: 'gun.fire', shots: [{ o: [w.p.x, zoneGroundY(w.p.x, w.p.z) + 1.4, w.p.z - 0.6], d: [0, 0.6, -0.8] }] });
  ok(fire());
  const calls = listen(w, 0.2).filter((l) => /_gunshot_\d+$/.test(l.voice));
  assert.ok(calls.length >= 1 && calls.length <= VOICES.callers, `${calls.length} called out`);
  for (const l of calls) assert.ok(Math.hypot(l.x - w.p.x, l.z - w.p.z) <= VOICES.react + 1, 'from near the shot');
  assert.equal(new Set(calls.map((l) => l.who)).size, calls.length, 'each their own');
  // two seconds on, another round: those who called out are not heard saying it again
  run(w.host, 2.2);
  ok(fire());
  const again = listen(w, 0.2).filter((l) => /_gunshot_\d+$/.test(l.voice) && !calls.some((c) => c.id === l.id));
  assert.ok(again.every((l) => !calls.some((c) => c.who === l.who)), 'not the same people again');
});

test('a fight: the one struck cries out, and someone near calls out at the fight', () => {
  const w = town(['Puncher']);
  let pair = null;
  for (let k = 0; k < 48 && !pair; k += 1) {
    for (const q of standing(w, 0, 0, { range: 400, adult: false, not: ['police'] })) {
      const around = standing(w, q.x, q.z, { range: 14, adult: false }).filter((o) => o.i !== q.i);
      if (around.length) { pair = q; break; }
    }
    if (!pair) run(w.host, 20);
  }
  assert.ok(pair, 'someone with others near');
  beside(w, w.p, pair);
  ok(w.send(w.id, { type: 'combat.engage', target: { kind: 'npc', id: pair.i } }));
  w.p.energy = 80;
  ok(w.send(w.id, { type: 'combat.act', move: 'punch' }));
  const lines = listen(w, 0.3);
  assert.ok(lines.some((l) => l.who === `n:${pair.i}` && /_hurt_\d+$/.test(l.voice)) || !SCRIPT.reactions[Object.keys(SCRIPT.cast).find((v) => SCRIPT.cast[v].who === `n:${pair.i}`)].hurt, 'the one struck cries out (where they have a line for it)');
  assert.ok(lines.some((l) => l.who !== `n:${pair.i}` && /_fight_\d+$/.test(l.voice)), 'and someone near calls out at the fight');
});

test('the townspeople with voices do not also talk in the phrase book\'s words', () => {
  const w = town(['Quiet']);
  listen(w, 120);
  assert.ok(w.g.state.talk.lines.every((l) => l.kind !== 'npc' || !/^n:/.test(l.who)), 'no phrase-book lines from his townspeople');
});

// The recordings (the owner's ElevenLabs lines, 28 October 2026): every line the game uses has its light copy, two to
// eight seconds, and small; and the recording as it was made is kept beside it.
test('the recordings: every line the game uses is there, as made and as a light copy, 2 to 8.5 seconds, under 45 KB', (t) => {
  const used = [...VOICE_TALKS.flatMap((c) => c.lines.map((l) => [l[1], l[2]])), ...Object.values(VOICE_REACTIONS).flatMap((r) => Object.values(r).flat().map((l) => [l[0], l[1]]))];
  if (!used.length) { t.skip('no recordings yet'); return; }
  for (const [id, seconds] of used) {
    const game = new URL(`../assets/voices/game/${id}.mp3`, import.meta.url), original = new URL(`../assets/voices/original/${id}.mp3`, import.meta.url);
    assert.ok(existsSync(game), `${id}: its light copy`);
    assert.ok(existsSync(original), `${id}: the recording as made`);
    assert.ok(seconds >= 1.5 && seconds <= 8.5, `${id}: ${seconds} s`);
    assert.ok(statSync(game).size <= 45 * 1024, `${id}: ${statSync(game).size} bytes`);
  }
  assert.ok(Object.values(VOICE_CAST).filter((c) => c.who).length >= 46);
});

// The page's player (src/client/voices.js), with no browser: a file that cannot be had is not asked for again every
// frame, and a page opened from a file of its own (local.html) asks for none (28 October 2026: the city test found the
// prototype's page asking every frame for files it cannot have).
test('the page asks once for a recording it cannot have, and none from a page opened as a file', async () => {
  const { createVoicePlayer } = await import('../src/client/voices.js');
  const line = { id: 1, voice: 'police_ebele_family_01', who: 'n:0', x: 0, z: 0, ago: 0, seconds: 3 };
  const audio = { running: true, decode: () => Promise.reject(new Error('no')), voiceLine: () => null };
  let asked = 0;
  const failing = createVoicePlayer({ audio, served: true, fetchFile: async () => { asked += 1; throw new Error('no connection'); } });
  for (let k = 0; k < 50; k += 1) { failing.update([line], ['police_ebele']); await new Promise((r) => setImmediate(r)); }
  const once = asked;
  assert.ok(once >= 1 && once <= failing.lines('police_ebele').length, `asked ${once} times`);
  assert.equal(failing.stats().failed, once, 'each file asked for failed once, and was not asked for again');
  let fromFile = 0;
  const local = createVoicePlayer({ audio, served: false, fetchFile: async () => { fromFile += 1; throw new Error('file:'); } });
  for (let k = 0; k < 10; k += 1) local.update([line], ['police_ebele']);
  assert.equal(fromFile, 0, 'nothing asked for by a page opened as a file');
});
