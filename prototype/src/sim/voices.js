// The town's voices (28 October 2026, the owner's brief): the townspeople and the police talk to one another out loud,
// in the recordings made for them (src/sim/voice-lines.js), and call out when something happens near them.
//
//   "When NPCs meet or stand together, they sometimes start a conversation and take turns speaking, facing each other,
//   with talking gestures. Not every NPC talks all the time."
//   "Every player nearby hears the same conversation at the same time."
//   "Mix lines so conversations rarely repeat exactly, and the same line isn't heard twice in a few minutes."
//   "NPCs react with their reaction lines when something happens near them: a fight, a gunshot, a crash, the police."
//
// Who talks when is worked out from the town's clock and where each person's own day has them (population.planned),
// and from nothing else: every player's game works it out the same, so two players standing by the same two
// townspeople hear the same conversation, line for line, at the same moment. A conversation may begin only at the
// start of one of the town's half-minutes, and only in the first ten half-minutes of every forty (twenty minutes) that
// are its own: a conversation heard is not heard again within fifteen minutes. Of those that could begin, some do and
// some do not (by the town's dice, the same in every game). The people in it are standing together when it begins and
// still there when it ends, so that nobody walks off in the middle of a sentence; or one walks over to the other (at
// most 200 m), stands beside them for it, and walks back to where their day has them.
//
// Reactions are what this game saw: a gunshot, a fight, a crash near the people in it. One or two of those nearest call
// out, each in their own way, and nobody says the same kind of thing twice within three minutes.
//
// Each line is put into the town's speech (talk.js) with its recording's name and length, at the place of the one
// who says it, heard within 25 metres. The page plays the recording from there (src/client/voices.js) and shows
// the words as a subtitle if the player wants them.

import { VOICE_CAST, VOICE_TALKS, VOICE_REACTIONS } from './voice-lines.js';
import { POSE } from './population.js';
import { zoneResident, zoneWalkable } from './zone.js';

export const VOICES = Object.freeze({
  slot: 30,           // seconds: a conversation begins only at the start of one of these
  spread: 10,         // and only in the first this many of each of its own cycles
  cycle: 40,          // of this many (twenty minutes): never heard again within fifteen
  visit: 200,         // metres: the one who begins a conversation walks over to the other from at most this far (as the crow
                      // flies); the farther, the less often
  beside: 1.3,        // and stands this far from them
  pace: 1.2,          // metres a second, walking over
  chance: 0.35,       // of the conversations that could begin in a half-minute, about this many do
  together: 3.4,      // metres: two who talk stand at most this far apart
  three: 5,           // and three
  gap: 0.35,          // seconds between one line and the next
  reach: 25,          // metres: a voice is not heard beyond this
  around: 40,         // metres round a player within which conversations are looked for
  react: 22,          // metres: who is this near something calls out
  callers: 2,         // and at most this many of them
  reactAgain: 180,    // seconds before one person says the same kind of thing again
  lineAgain: 300,     // seconds before the same line is heard again
  news: 90,           // seconds a fight, a crash or a shooting is still talked about
  newsReach: 40,      // metres
});

const hash = (a, b = 0, c = 0) => { let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const textHash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i += 1) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
// What the town says: the recorded lines (voice-lines.js). The tests give it lines of their own (`useVoiceData`), the
// whole script with its lengths as written, so that what is tested does not wait on the recordings.
let DATA = { cast: VOICE_CAST, talks: VOICE_TALKS, reactions: VOICE_REACTIONS };
export function useVoiceData(data) { DATA = data || { cast: VOICE_CAST, talks: VOICE_TALKS, reactions: VOICE_REACTIONS }; }
const EVENT_TALK = Object.freeze({ fight: 'fight', crash: 'crash', gunshot: 'gunshot', police: 'police', car: 'car', building: 'building' });

// when in the day a conversation suits: by the town's hour
function suits(when, hour) {
  if (when === 'any') return hour >= 6 && hour < 21.5;
  if (when === 'morning') return hour >= 6 && hour < 11.5;
  if (when === 'evening') return hour >= 17 && hour < 21.5;
  if (when === 'night') return hour >= 21 || hour < 5;
  if (when === 'market') return hour >= 7 && hour < 18;
  return false;                  // the ones about something that happened: only when it has
}

// `timeScale`: town seconds to a real one (1 where the town keeps the real clock; the game's own faster day otherwise).
// The recordings last real seconds; the town's day is in town seconds.
export function createVoices({ state, population, residents, actors, talk, timeScale = 1 }) {
  const S = timeScale;
  if (!state.voices) state.voices = { booked: {}, said: {}, reacted: {}, news: [] };
  const book = state.voices;
  const CAST = DATA.cast, REACT = DATA.reactions;
  // the voices of people who are in the game, and who each one is
  const voiceOf = new Map();      // 'n:3' / 'r:cook' -> voice name
  for (const [voice, c] of Object.entries(CAST)) if (c.who) voiceOf.set(c.who, voice);
  // (30 October 2026: each of his figures is ten of the town's people, the owner's "1 NPC character should be multiplied
  // into 10 places"; those added to the town speak, when they call out at something, with the voice of the first one
  // drawn from their figure. The conversations are the first ones' own.)
  const byFigure = new Map();
  for (const [who, voice] of voiceOf) {
    if (!who.startsWith('n:')) continue;
    const p = population.people[Number(who.slice(2))];
    const figure = p && p.look && p.look.figure;
    if (figure && !byFigure.has(figure)) byFigure.set(figure, voice);
  }
  for (const p of population.people) {
    const who = `n:${p.index}`;
    const voice = !voiceOf.has(who) && p.look && byFigure.get(p.look.figure);
    if (voice) voiceOf.set(who, voice);
  }
  const talks = DATA.talks.filter((c) => c.lines.every(([voice]) => CAST[voice] && CAST[voice].who));
  const probe = {};
  const visiting = new Set(talks.flatMap((c) => { const w = [...new Set(c.lines.map(([v]) => CAST[v].who))]; return w.filter((q, k) => k !== 1 && q.startsWith('n:')).map((q) => Number(q.slice(2))); }));
  const stats = { talks: 0, lines: 0, reactions: 0, skipped: 0 };

  // where someone is, as their own day has them at town time `t` (the same in every game): standing, sitting, or
  // walking along; null where they are not to be talked with: inside, lying down, riding, or taken out of their day
  // here (a fight, running from gunfire)
  function placeOf(who, t) {
    if (who.startsWith('n:')) {
      const i = Number(who.slice(2));
      if (actors && actors.has(i)) return null;
      population.planned(i, t, probe);
      if (probe.pose !== POSE.stand && probe.pose !== POSE.sit && probe.pose !== POSE.walk) return null;
      return { x: probe.x, z: probe.z, moving: !!probe.moving };
    }
    const r = residents.all().find((q) => `r:${q.id}` === who);
    if (!r || r.mode === 'inside' || r.mode === 'walking') return null;
    return { x: r.x, z: r.z };
  }
  const nameOf = (who) => {
    if (who.startsWith('n:')) { const p = population.people[Number(who.slice(2))]; return { name: p.short, role: '' }; }
    const z = zoneResident(who.slice(2)); return { name: z.short, role: z.role };
  };

  // Whether conversation `c` takes place beginning at town time `t0` with its people where they already are:
  // together then (standing, sitting, or walking along side by side), and still together when it ends. Where each
  // one is at its beginning, or null.
  const whosOf = (c) => [...new Set(c.lines.map(([voice]) => CAST[voice].who))];
  const lengthOf = (c) => c.lines.reduce((sum, l) => sum + l[2] + VOICES.gap, 0);
  function together(c, t0) {
    const whos = whosOf(c), length = lengthOf(c);
    const most = whos.length > 2 ? VOICES.three : VOICES.together;
    const at = [], end = [];
    for (const who of whos) {
      const a = placeOf(who, t0), b = placeOf(who, t0 + length * S);
      if (!a || !b) return null;
      at.push({ who, x: a.x, z: a.z }); end.push(b);
    }
    for (const list of [at, end]) for (let i = 0; i < list.length; i += 1) for (let j = i + 1; j < list.length; j += 1) if (Math.hypot(list[i].x - list[j].x, list[i].z - list[j].z) > most) return null;
    return { at, length, visits: null, walk: 0 };
  }

  // Or with the one who begins it walking over to the other first ("when NPCs meet"): two people, each staying where
  // they are a while (standing or sitting, at their stall, on their bench, at their post), not too far apart: the
  // first to speak goes over, the way people walk in the town, stands beside the other while they talk, and goes back
  // the same way to where they were. Their walk is part of the town's plan for that moment (the hook below), so every
  // game shows it.
  const spotOf = (who, t) => { population.planned(Number(who.slice(2)), t, probe); return probe.spot; };
  function along(path, d) {
    const cum = path.cum;
    if (d <= 0) return [path.xs[0], path.xs[1], Math.atan2(path.xs[2] - path.xs[0], path.xs[3] - path.xs[1]) || 0];
    let a = 0, b = cum.length - 1;
    if (d >= cum[b]) return [path.xs[b * 2], path.xs[b * 2 + 1], Math.atan2(path.xs[b * 2] - path.xs[b * 2 - 2], path.xs[b * 2 + 1] - path.xs[b * 2 - 1]) || 0];
    while (b - a > 1) { const m = (a + b) >> 1; if (cum[m] <= d) a = m; else b = m; }
    const f = (d - cum[a]) / (cum[b] - cum[a] || 1);
    const ax = path.xs[a * 2], az = path.xs[a * 2 + 1], bx = path.xs[b * 2], bz = path.xs[b * 2 + 1];
    return [ax + (bx - ax) * f, az + (bz - az) * f, Math.atan2(bx - ax, bz - az)];
  }
  function visit(c, t0) {
    const whos = whosOf(c);
    if (!whos.every((w) => w.startsWith('n:'))) return null;
    const length = lengthOf(c);
    // the one they go to: the second to speak; whoever else is in it goes over to them
    const host = whos[1], guests = whos.filter((w) => w !== host);
    const ph = placeOf(host, t0);
    if (!ph || ph.moving) return null;
    const still = (who, p, from, to) => { for (let k = 0; k <= 4; k += 1) { const q = placeOf(who, from + ((to - from) * k) / 4); if (!q || q.moving || Math.hypot(q.x - p.x, q.z - p.z) > 0.3) return false; } return true; };
    const visits = [], at = [];
    let farthest = 0, longest = 0;
    for (const [k, g] of guests.entries()) {
      const pg = placeOf(g, t0);
      if (!pg || pg.moving) return null;
      const apart = Math.hypot(ph.x - pg.x, ph.z - pg.z);
      if (apart > VOICES.visit) return null;
      farthest = Math.max(farthest, apart);
      const path = population.route(spotOf(g, t0), spotOf(host, t0));
      if (!path || path.len > VOICES.visit * 1.6 || path.len < VOICES.beside + 0.5 + k) return null;
      // (a second one stops a step short of the first)
      const goes = path.len - VOICES.beside - k * 0.9;
      const walk = goes / VOICES.pace;                                    // real seconds
      longest = Math.max(longest, walk);
      visits.push({ i: Number(g.slice(2)), from: pg, path, goes, walk });
      const [tx, tz] = along(path, goes);
      at.push({ who: g, x: tx, z: tz });
    }
    // (going a long way to talk is something done less often than a word with a neighbour)
    if (hash(textHash(c.id), Math.floor(t0 / (VOICES.slot * S)), 23) > 1 - (farthest / VOICES.visit) * 0.8) return null;
    // everyone where they are from before the walks until after them back (by their own days)
    if (!still(host, ph, t0 - (longest + 1) * S, t0 + (length + 1) * S)) return null;
    for (const v of visits) if (!still(`n:${v.i}`, v.from, t0 - (v.walk + 1) * S, t0 + (length + v.walk + 1) * S)) return null;
    at.splice(1, 0, { who: host, x: ph.x, z: ph.z });
    for (const v of visits) { v.t0 = t0; v.end = t0 + length * S; delete v.from; }
    return { at, length, visits, walk: longest };
  }

  // Puts a conversation's lines into the town's speech, each at its own time: the first at town time `t0`.
  function play(c, t0, where, key) {
    const real0 = state.real + (t0 - state.t) / S;
    let from = real0;
    const spot = new Map(where.map((w) => [w.who, w]));
    for (const [voice, id, seconds, words, meaning] of c.lines) {
      const who = CAST[voice].who;
      const w = spot.get(who);
      // whom they speak to: the next one to speak, or the one before
      const others = where.filter((q) => q.who !== who);
      const to = others[0] || null;
      const { name, role } = nameOf(who);
      talk.say({ who, name, role, text: words, lang: 'voice', gloss: meaning || null, x: w.x, z: w.z, from, hold: seconds + 0.15, kind: 'voice', range: VOICES.reach, voice: id, seconds, to: to ? [Math.round(to.x * 10) / 10, Math.round(to.z * 10) / 10] : null, group: key });
      book.said[id] = from;
      from += seconds + VOICES.gap;
      stats.lines += 1;
    }
    book.booked[key] = { until: from, at: where.map((w) => [w.who, Math.round(w.x * 10) / 10, Math.round(w.z * 10) / 10]) };
    stats.talks += 1;
  }

  // Whether conversation `c` could begin at the start of half-minute `s`: the hour suits it, the town's dice say
  // yes, and its people are together then, or one can go over to the other. Where they will stand, or null. (Worked
  // out once for each half-minute and kept a while.)
  const could = new Map();
  function possible(c, s) {
    const key = `${c.id}@${s}`;
    if (could.has(key)) return could.get(key);
    const slotT = VOICES.slot * S, t0 = s * slotT + S;
    const hour = ((t0 % 86400) + 86400) % 86400 / 3600;
    const met = suits(c.when, hour) && hash(textHash(c.id), s, 11) <= VOICES.chance ? together(c, t0) || visit(c, t0) : null;
    could.set(key, met);
    if (could.size > 8000) for (const k of [...could.keys()].slice(0, 4000)) could.delete(k);
    return met;
  }

  // The conversations that begin in half-minute `s`, wherever in the town they are: [{ key, c, t0, at, length,
  // visit }]. The same in every game: it is worked out from the town's clock and where people's own days have them,
  // and nothing else. Each conversation has its own twenty minutes, over and over: it may begin only in the first
  // five of them, at the first half-minute it could, and not again until its next twenty (so it is never heard twice
  // within fifteen minutes, nor any line of it). Nobody is in two at once: one that would have someone in it who is
  // in another begun in the minute and a half before is not begun.
  const begun = new Map(), raws = new Map();
  // how many half-minutes a conversation reaches over, with the longest walk there and back
  const REACH = Math.ceil((VOICES.visit * 1.6 / VOICES.pace) / VOICES.slot) + 1;
  const LONGEST = Math.ceil(Math.max(0, ...talks.map(lengthOf)) / VOICES.slot) + 1;
  function raw(s) {
    if (raws.has(s)) return raws.get(s);
    const slotT = VOICES.slot * S, t0 = s * slotT + S, out = [];
    for (const c of talks) {
      if (EVENT_TALK[c.when]) continue;                         // those are begun by what happens (event, below)
      const W = VOICES.cycle, into = (((s - textHash(c.id) % W) % W) + W) % W;
      if (into >= VOICES.spread) continue;
      const met = possible(c, s);
      if (!met) continue;
      let earlier = false;
      for (let k = 1; k <= into && !earlier; k += 1) if (possible(c, s - k)) earlier = true;
      if (!earlier) out.push({ key: `${c.id}@${s}`, c, t0, ...met });
    }
    raws.set(s, out);
    if (raws.size > 600) for (const k of [...raws.keys()].slice(0, 300)) raws.delete(k);
    return out;
  }
  function startsIn(s) {
    if (begun.has(s)) return begun.get(s);
    // (until when each person is in one begun earlier: walking there, talking, or walking back)
    const until = new Map();
    const hold = (b) => { const end = b.t0 + (b.length + (b.walk || 0) + 2) * S; for (const w of b.at) until.set(w.who, Math.max(until.get(w.who) || -1e12, end)); };
    for (let k = 1; k <= 2 * REACH + LONGEST; k += 1) for (const b of raw(s - k)) hold(b);
    const out = [];
    for (const b of raw(s)) {
      const from = b.t0 - ((b.walk || 0) + 2) * S;
      if (b.at.some((w) => (until.get(w.who) || -1e12) > from)) continue;
      hold(b);
      out.push(b);
    }
    begun.set(s, out);
    if (begun.size > 400) for (const k of [...begun.keys()].slice(0, 200)) begun.delete(k);
    return out;
  }
  // those going on at town time `t` (or about to: someone walking over), wherever they are
  function schedule(t) {
    const slotT = VOICES.slot * S, slot = Math.floor(t / slotT), out = [];
    for (let s = slot - REACH - LONGEST - 1; s <= slot + REACH; s += 1) for (const b of startsIn(s)) if (t <= b.t0 + (b.length + (b.walk || 0)) * S && t >= b.t0 - ((b.walk || 0) + 1) * S) out.push(b);
    return out;
  }

  // Where someone walking over to talk is, at town time `t`: on their way, talking, or on their way back. A hook in the
  // town's own plan for the day (population.locate), so that it is drawn, and seen, by everyone.
  population.addHook((i, t, out) => {
    if (!visiting.has(i)) return false;
    for (const b of schedule(t)) {
      const v = b.visits && b.visits.find((q) => q.i === i);
      if (!v) continue;
      const go = v.t0 - v.walk * S, back = v.end + v.walk * S;
      if (t < go || t > back) continue;
      let at;
      if (t < v.t0) { at = along(v.path, ((t - go) / S) * VOICES.pace); out.pose = POSE.walk; out.moving = true; out.act = 'Going over to talk'; }
      else if (t <= v.end) { at = along(v.path, v.goes); out.pose = POSE.stand; out.moving = false; out.act = 'Talking'; }
      else { at = along(v.path, v.goes - ((t - v.end) / S) * VOICES.pace); at[2] += Math.PI; out.pose = POSE.walk; out.moving = true; out.act = 'Going back'; }
      out.x = at[0]; out.z = at[1]; out.h = at[2];
      population.planned(i, t, probe);
      out.spot = probe.spot; out.leg = null;
      return true;
    }
    return false;
  });



  // What is happening near the players at town time `t`: conversations begun (or begun a moment ago, for one who has
  // just come near), and what is no longer news.
  let lookedAt = -1e9;
  function tick(t, players) {
    const real = state.real;
    // (twice a second is often enough: a conversation is found within half a second of its beginning)
    if (real - lookedAt < 0.5 && real >= lookedAt) return;
    lookedAt = real;
    if (book.news.length && book.news[0].real < real - VOICES.news) book.news = book.news.filter((n) => n.real >= real - VOICES.news);
    for (const [k, b] of Object.entries(book.booked)) if (b.until < real - 2) delete book.booked[k];
    if (!players.length) return;
    for (const s of schedule(t)) {
      if (book.booked[s.key] || t > s.t0 + s.length * S) continue;
      if (!players.some((p) => s.at.some((w) => Math.hypot(w.x - p.x, w.z - p.z) <= VOICES.around))) continue;
      play(s.c, s.t0, s.at, s.key);
    }
  }

  // Something happened at (x, z): `kind` is gunshot, fight, crash, police, car (a car bought), building (walls going
  // up), laugh (something funny), or hurt (`only` the one struck). Those near call out; and it is news for a while,
  // which the people in a conversation about such a thing talk about if they are together.
  function event(kind, x, z, { only = null, not = [] } = {}) {
    const real = state.real, t = state.t;
    if (kind !== 'hurt' && kind !== 'laugh') book.news.push({ kind, x, z, real });
    // who is near: the townspeople and the people at the counters, with a voice, up and about
    const near = [];
    const consider = (who, px, pz) => {
      if (only && who !== only) return;
      if (not.includes(who) || !voiceOf.has(who)) return;
      const d = Math.hypot(px - x, pz - z);
      if (d > VOICES.react) return;
      const lines = (REACT[voiceOf.get(who)] || {})[kind];
      if (!lines || !lines.length) return;
      if ((book.reacted[`${who}|${kind}`] || -1e9) > real - VOICES.reactAgain) return;
      near.push({ who, x: px, z: pz, d, lines });
    };
    for (const [i, px, pz, pose] of population.within('voices', x, z, VOICES.react, t, real)) if (pose !== POSE.lie && pose !== POSE.hidden && pose !== POSE.ride) consider(`n:${i}`, px, pz);
    for (const r of residents.all()) if (r.mode !== 'inside') consider(`r:${r.id}`, r.x, r.z);
    near.sort((a, b) => a.d - b.d);
    let delay = kind === 'hurt' ? 0.15 : 0.45;
    for (const n of near.slice(0, only ? 1 : VOICES.callers)) {
      // their line for it: one not heard lately, the same in every game for the same moment
      const fresh = n.lines.filter(([id]) => (book.said[id] || -1e9) <= real - VOICES.lineAgain);
      if (!fresh.length) { stats.skipped += 1; continue; }
      const [id, seconds, words, meaning] = fresh[Math.floor(hash(textHash(n.who), Math.floor(t)) * fresh.length)];
      const { name, role } = nameOf(n.who);
      talk.say({ who: n.who, name, role, text: words, lang: 'voice', gloss: meaning || null, x: n.x, z: n.z, from: real + delay, hold: seconds + 0.15, kind: 'voice', range: VOICES.reach, voice: id, seconds, to: [Math.round(x * 10) / 10, Math.round(z * 10) / 10], group: null });
      book.said[id] = real + delay;
      book.reacted[`${n.who}|${kind}`] = real;
      delay += 0.9 + hash(textHash(n.who), 3) * 0.8;
      stats.reactions += 1;
    }
    if (EVENT_TALK[kind]) afterNews(kind, x, z);
  }

  // A conversation about what has just happened, between people who are together near it, a few seconds on.
  function afterNews(kind, x, z) {
    const t0 = state.t + (4 + hash(Math.floor(state.t), 5) * 4) * S;
    for (const c of talks) {
      if (c.when !== kind) continue;
      if (c.lines.some(([, id]) => (book.said[id] || -1e9) > state.real - VOICES.lineAgain)) continue;
      const met = together(c, t0);
      if (!met || !met.at.some((w) => Math.hypot(w.x - x, w.z - z) <= VOICES.newsReach)) continue;
      play(c, t0, met.at, `${c.id}@news${Math.floor(state.t)}`);
      return;
    }
  }

  // Who is talking to whom just now, for the page to turn them to each other and move their hands: [who, x, z of the
  // one they face, 1 while speaking]
  function talking(real = state.real) {
    const out = [];
    for (const line of talk.lines()) {
      if (line.kind !== 'voice' || !line.to || line.from > real || line.until <= real) continue;
      out.push([line.who, line.to[0], line.to[1], 1]);
      if (line.group && book.booked[line.group]) for (const [who, ox, oz] of book.booked[line.group].at) if (who !== line.who) out.push([who, line.x, line.z, 0]);
    }
    return out;
  }

  // The voices of the people near a point: what the page should have ready to play (it fetches each voice's lines
  // only for the people about it).
  function voicesNear(x, z, radius = 60) {
    const out = new Set();
    for (const [i] of population.within('voices-near', x, z, radius, state.t, state.real)) { const v = voiceOf.get(`n:${i}`); if (v) out.add(v); }
    for (const r of residents.all()) if (r.mode !== 'inside' && Math.hypot(r.x - x, r.z - z) <= radius) { const v = voiceOf.get(`r:${r.id}`); if (v) out.add(v); }
    return [...out];
  }

  // whether someone speaks in recordings (and so not in the phrase book's words: talk.js)
  const voiced = (who) => voiceOf.has(who) && (Object.keys(REACT[voiceOf.get(who)] || {}).length > 0 || talks.some((c) => c.lines.some(([v]) => v === voiceOf.get(who))));
  return { tick, schedule, event, talking, voicesNear, voiced, stats: () => ({ ...stats }), news: () => book.news.slice(), talks: () => talks };
}
