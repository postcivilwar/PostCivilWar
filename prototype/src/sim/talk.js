// Speech: what is said in the zone, by whom, and who can hear it.
//
// Three kinds of talk pass through here, and all of it is decided by the
// simulation, not by a client:
//   townspeople talking to one another, near enough to a player to be heard
//   a player speaking to a townsperson, and the answer
//   players speaking to players who are standing close by
//
// A line of speech belongs to a speaker and a place. A client is told only
// the lines spoken near its player, and draws each as a small bubble over the
// speaker's head. Nothing here plays a voice: a line carries its language and
// its text, which is what a voice service would be given later.

import { ZONE, ZONE_SPOTS, ZONE_ROOMS, zoneResident, zoneOnGround, zoneWalkable, inPowerbikeHall, inCarHall } from './zone.js';
import { LANGUAGES, EXCHANGES, PEOPLES, phrase, greetingId, dayPart, sharedLanguage } from './culture.js';
import { POSE, RANGE } from './population.js';
import { GameError } from './registry.js';
import { cleanFigureLook } from './figures.js';
import { POWER_BIKES } from './power-bikes.js';
import { POWER_CARS } from './power-cars.js';
import { VEHICLE_MODELS, KEKE_PAINTS, KEKE_CANOPIES, KEKE_SEATS, KEKE_FLOORS } from './vehicle-looks.js';

export const CHAT = Object.freeze({ radius: 10, hearing: 16, overhear: 24, maxLength: 140, gap: 1.2, visitors: 24 });

const hash = (a, b = 0, c = 0) => { let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const lowerFirst = (text) => text.charAt(0).toLowerCase() + text.slice(1);
// Seconds: another player's fall (or their motorcycle going down) first heard of within this of its beginning is shown
// from its beginning (visitorSeen).
const FRESH = 2.5;
const ROOM_OF = new Map(ZONE_ROOMS.map((r) => [r.id, r]));

// Takes what a person typed and makes it safe to show to someone else: no
// control characters, no runs of space, a length limit. The words themselves
// are never changed.
export function cleanText(text, limit = CHAT.maxLength) {
  return String(text == null ? '' : text).replace(/[\p{Cc}\p{Cf}\p{Co}\p{Cn}\p{Zl}\p{Zp}]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, limit);
}

export function cleanName(name) {
  return String(name == null ? '' : name).replace(/[^\p{L}\p{M} .'-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 24);
}

// The name another player is seen under: a character's name, or an account's username.
export function cleanHandle(name) {
  return String(name == null ? '' : name).replace(/[^\p{L}\p{M}\p{N} ._'-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 24);
}

const STAFF = new Set(['doctor', 'nurse', 'pharmacist', 'labscientist', 'records']);
const PATIENT_SLOTS = new Set(['reception.queue', 'reception.wait', 'consulting.patient', 'pharmacy.customer', 'ward.bed', 'emergency.bed']);

// The part someone is playing where they stand: trader, customer, teacher...
function partOf(person, spot) {
  if (!spot) return null;
  if (spot.slot === 'trader' || spot.slot === 'petty' || (spot.slot === 'work' && person.job === 'foodvendor')) return 'trader';
  if (spot.slot === 'customer') return 'customer';
  if (spot.slot.endsWith('.teacher') && spot.ctx === 'class') return 'teacher';
  if (spot.slot.endsWith('.seat') && spot.ctx === 'class') return 'pupil';
  if (spot.venue === 'hospital' && STAFF.has(person.job)) return 'staff';
  if (PATIENT_SLOTS.has(spot.slot)) return 'patient';
  if (spot.slot === 'rank') return 'rider';
  if (spot.venue === 'park' && spot.slot === 'wait') return 'passenger';
  return null;
}

export function createTalk({ state, population, residents, players, weather, hub = {} }) {
  if (!state.talk) state.talk = { lines: [], seq: 0, busy: {}, next: {} };
  const book = state.talk;
  const people = population.people;
  const visitors = new Map();          // people in other copies of this world, seen through the network
  const chatter = [];                  // what players have said: heard, shown, and never written to the save
  const now = () => state.real;
  const hourNow = () => (state.t % 86400) / 3600;

  function say(line) {
    book.seq += 1;
    const from = line.from === undefined ? now() : line.from;
    const until = from + (line.hold || Math.max(line.kind === 'chat' ? 4 : 2.6, Math.min(8, 1.6 + line.text.length * 0.055)));
    const entry = { id: book.seq, who: line.who, name: line.name, role: line.role || '', text: line.text, lang: line.lang, gloss: line.gloss || null, x: Math.round(line.x * 10) / 10, z: Math.round(line.z * 10) / 10, from: Math.floor(from * 100) / 100, until: Math.round(until * 100) / 100, kind: line.kind, range: line.range || CHAT.overhear };
    (line.kind === 'chat' ? chatter : book.lines).push(entry);
    return entry;
  }

  // a line from the phrase book, with its English beside it when it is not English
  const spoken = (id, lang, hour) => { const key = id === 'GREETING' ? greetingId(hour) : id; const text = phrase(key, lang); return { text, lang, gloss: lang === 'en' ? null : phrase(key, 'en') }; };
  const busy = (key) => (book.busy[key] || 0) > now();

  // --- townspeople among themselves ------------------------------------------------

  function speakersNear(player, t) {
    const rows = population.around(player.id, player.x, player.z, t, now());
    const out = [];
    const reach = CHAT.overhear * CHAT.overhear;
    for (const [i, x, z, h, pose] of rows) {
      const d2 = (x - player.x) * (x - player.x) + (z - player.z) * (z - player.z);
      if (d2 > reach || pose === POSE.lie) continue;
      const p = people[i];
      if (p.age < 4) continue;
      const at = population.locate(i, t, {});
      const spot = at.moving ? null : ZONE_SPOTS[at.spot];
      out.push({ key: `n:${i}`, n: i, x, z, moving: pose === POSE.walk, langs: p.langs, age: p.age, name: p.short, role: '', part: partOf(p, spot), ctx: spot ? spot.ctx : 'street', room: spot ? spot.room : null, chatty: p.traits.includes('talkative') || p.traits.includes('jovial') ? 1.6 : p.traits.includes('reserved') || p.traits.includes('shy') ? 0.45 : 1 });
    }
    for (const r of residents.all()) {
      if (r.mode === 'inside') continue;
      const d2 = (r.x - player.x) * (r.x - player.x) + (r.z - player.z) * (r.z - player.z);
      if (d2 > reach) continue;
      const who = zoneResident(r.id);
      out.push({ key: `r:${r.id}`, n: 5000 + out.length, x: r.x, z: r.z, moving: r.mode === 'walking', langs: who.langs || ['ig', 'pcm', 'en'], name: who.short, role: who.role, part: r.placeKey && r.placeKey.startsWith('stall') ? 'trader' : null, ctx: r.placeKey && (r.placeKey.startsWith('stall') || r.placeKey.startsWith('lunch')) ? 'market' : 'street', room: null, chatty: 1 });
    }
    return out;
  }

  function converse(player, t) {
    const list = speakersNear(player, t).filter((s) => !busy(s.key));
    const real = now();
    const hour = hourNow();
    const part = dayPart(hour);
    const wet = weather().wet;
    const bucket = Math.floor(real / 2);
    let best = null;
    let bestScore = 0;
    for (let a = 0; a < list.length; a += 1) {
      for (let b = a + 1; b < list.length; b += 1) {
        const A = list[a], B = list[b];
        const gap = Math.hypot(A.x - B.x, A.z - B.z);
        const lesson = A.room && A.room === B.room && ((A.part === 'teacher' && B.part === 'pupil') || (A.part === 'pupil' && B.part === 'teacher'));
        if (A.moving && B.moving) continue;
        if (gap > (lesson ? 10 : A.moving || B.moving ? 2.2 : 2.8)) continue;
        if (A.part === 'pupil' && B.part === 'pupil') continue;                      // no talking in class
        const score = hash(A.n * 977 + B.n, bucket, 3) * A.chatty * B.chatty * (lesson ? 0.8 : 1);
        if (score > bestScore) { bestScore = score; best = [A, B, lesson]; }
      }
    }
    if (!best || bestScore < 0.25) return null;
    let [A, B] = best;
    const passing = A.moving || B.moving;
    const fits = EXCHANGES.filter((e) => {
      if (passing) return e.lines.length === 2 && e.where.includes('any');
      if (!e.where.includes('any') && !e.where.includes(A.ctx) && !e.where.includes(B.ctx)) return false;
      if (e.when && e.when !== part && !(e.when === 'afternoon' && part === 'morning' && hour > 11)) return false;
      if (e.weather && (e.weather === 'wet') !== wet) return false;
      if (e.roles) return (A.part === e.roles[0] && B.part === e.roles[1]) || (A.part === e.roles[1] && B.part === e.roles[0]);
      // a lesson, a sale or a consultation is not the time for small talk
      if (best[2]) return false;
      return true;
    });
    if (!fits.length) return null;
    const mine = fits.filter((e) => e.roles || !e.where.includes('any'));
    const pool = mine.length && hash(A.n, B.n, bucket) < 0.75 ? mine : fits;
    const exchange = pool[Math.floor(hash(A.n + 13, B.n + 7, bucket) * pool.length)];
    if (exchange.roles && A.part !== exchange.roles[0]) [A, B] = [B, A];
    // a lesson or a consultation is in English where both have it; otherwise
    // people use whichever of the languages they share comes to hand, most
    // often the first
    const formal = A.ctx === 'class' || (A.part === 'staff' || B.part === 'staff');
    const common = A.langs.filter((l) => B.langs.includes(l));
    const roll = hash(A.n + 5, B.n + 3, bucket);
    // buying and selling is as often done in Pidgin, the language of trade
    const trade = (A.ctx === 'market' || B.ctx === 'market' || A.ctx === 'park' || B.ctx === 'park') && common.includes('pcm');
    // a lesson is taught in English, the language of the school, by a teacher who has it (a class of children of
    // many peoples, as in a Delta town, has no other language in common), unless the class is too young for it
    const teaching = A.ctx === 'class' && [A, B].some((x) => x.part === 'teacher' && x.langs.includes('en')) && [A, B].some((x) => x.part === 'pupil' && x.age >= 6);
    const lang = teaching ? 'en' : formal || common.length < 2 ? sharedLanguage(A.langs, B.langs, formal) : trade && roll > 0.5 ? 'pcm' : common[roll < 0.58 ? 0 : roll < 0.86 || common.length < 3 ? 1 : 2];
    let at = real + 0.2;
    let last = at;
    for (const [who, id] of exchange.lines) {
      const S = who === 0 ? A : B;
      const line = say({ who: S.key, name: S.name, role: S.role, ...spoken(id, lang, hour), x: S.x, z: S.z, from: at, kind: 'npc' });
      last = line.until;
      at = line.until + 0.25;
    }
    const rest = last + 18 + hash(A.n, B.n, 9) * 40;
    book.busy[A.key] = rest;
    book.busy[B.key] = rest + 6;
    return { a: A.key, b: B.key, lang, lines: exchange.lines.length };
  }

  // --- a player speaks to a townsperson ---------------------------------------------

  function greet(player, key, name, x, z, langs, hour) {
    const lang = langs.includes(player.lang) ? player.lang : sharedLanguage(['pcm', 'en'], langs);
    const first = say({ who: `p:${player.id}`, name: player.name, ...spoken('GREETING', lang, hour), x: player.x, z: player.z, kind: 'player', range: CHAT.hearing });
    return { lang, at: first.until + 0.2, key, name, x, z };
  }

  function talkToPerson(player, index) {
    const p = people[index];
    if (!p) throw new GameError('NOT_HERE', 'There is nobody there.');
    const t = state.t;
    const at = population.locate(index, t, {});
    if (at.pose === POSE.hidden) throw new GameError('NOT_HERE', 'There is nobody there.');
    if (Math.hypot(at.x - player.x, at.z - player.z) > 4.5) throw new GameError('TOO_FAR', 'You are too far away. Walk closer.');
    const hour = hourNow();
    const who = population.describe(index, t);
    const key = `n:${index}`;
    const g = greet(player, key, p.short, at.x, at.z, p.langs, hour);
    const answer = (text, lang = 'en', gloss = null) => { const line = say({ who: key, name: p.short, role: who.role, text, lang, gloss, x: at.x, z: at.z, from: g.at, kind: 'reply', range: CHAT.hearing }); g.at = line.until + 0.2; };
    if (p.age < 4) { answer('...', g.lang); book.busy[key] = g.at + 6; return { name: p.name, role: who.role, lines: 2 }; }
    const reply = spoken(hash(index, Math.floor(now())) < 0.5 ? 'how_are_you' : 'GREETING', g.lang, hour);
    answer(reply.text, reply.lang, reply.gloss);
    // spoken to, they greet back with their body too: a wave, a hello, a little bow from the old
    if (hub.reactions && at.pose === POSE.stand) hub.reactions.react(index, p.age > 60 ? 'bow' : ['wave', 'greet', 'hello'][Math.floor(hash(index, 9) * 3) % 3]);
    // who they are, in English if they have it and Pidgin if not
    const english = p.langs.includes('en') || !p.langs.includes('pcm');
    const role = who.role;
    const quiet = p.traits.includes('reserved') || p.traits.includes('shy');
    if (p.age < 12) answer(english ? `My name is ${p.first}. ${role}.` : `My name na ${p.first}.`, english ? 'en' : 'pcm', english ? null : `My name is ${p.first}.`);
    else answer(english ? `I am ${p.first} ${p.surname}. ${role}.` : `My name na ${p.first} ${p.surname}. ${role}.`, english ? 'en' : 'pcm', english ? null : `My name is ${p.first} ${p.surname}. ${role}.`);
    // what they speak at home, when it is not what they are speaking to you in (said in English or Pidgin: the game
    // does not put words into a language it does not hold)
    const home = PEOPLES[p.people];
    if (p.age >= 12 && home && home.tongue && home.language !== g.lang && !quiet && hash(index, 31) < 0.6) answer(english ? `At home I speak ${home.tongue}.` : `For house, na ${home.tongue} I dey speak.`, english ? 'en' : 'pcm', english ? null : `At home I speak ${home.tongue}.`);
    if (!quiet) {
      const doing = lowerFirst(who.activity);
      if (who.needs.hunger > 0.85 && hash(index, 4) < 0.5) { const hungry = spoken('hungry', g.lang, hour); answer(hungry.text, hungry.lang, hungry.gloss); }
      else answer(english ? `Now I am ${doing}.` : `I dey ${doing}.`, english ? 'en' : 'pcm', english ? null : `Now I am ${doing}.`);
    }
    if ((p.traits.includes('talkative') || p.traits.includes('jovial') || p.traits.includes('cheerful')) && who.relations.length) {
      const kin = who.relations[0];
      answer(english ? `${kin.name} is my ${kin.kind}.` : `${kin.name} na my ${kin.kind}.`, english ? 'en' : 'pcm', english ? null : `${kin.name} is my ${kin.kind}.`);
    }
    book.busy[key] = g.at + 8;
    return { name: p.name, role, language: g.lang };
  }

  // The named residents say what they have always said, as speech.
  function talkToResident(player, r, live, greeting, service) {
    const hour = hourNow();
    const key = `r:${r.id}`;
    const g = greet(player, key, r.short, live.x, live.z, r.langs || ['ig', 'pcm', 'en'], hour);
    const answer = (text, lang = 'en', gloss = null) => { const line = say({ who: key, name: r.short, role: r.role, text, lang, gloss, x: live.x, z: live.z, from: g.at, kind: 'reply', range: CHAT.hearing }); g.at = line.until + 0.2; };
    if (g.lang !== 'en') { const reply = spoken('GREETING', g.lang, hour); answer(reply.text, reply.lang, reply.gloss); } else answer(greeting);
    for (const sentence of `${r.talk.about} ${r.talk.tip}`.match(/[^.!?]+[.!?]+/g) || []) answer(sentence.trim());
    if (service && !service.open && service.note) answer(service.note);
    book.busy[key] = g.at + 6;
  }

  // --- players among themselves ------------------------------------------------------

  function others(player) {
    const out = [];
    const rideOf = (q) => (typeof q.astride === 'string' && q.astride.startsWith('pb:') && q.pbike ? { bike: q.pbike.id, ...(q.pbike.ride || { lean: 0, speed: 0, throttle: 0, brake: 0, rev: 0 }) } : null);
    const carOf = (q) => (typeof q.incar === 'string' && q.incar.startsWith('pc:') && q.pcar ? { car: q.pcar.id, ...(q.pcar.drive || { steer: 0, speed: 0, throttle: 0, brake: 0, rev: 0, lamps: 0 }) } : null);
    for (const id of Object.keys(players)) { const q = players[id]; if (q.id !== player.id) out.push({ id: q.id, name: q.name, look: q.look, lang: q.lang || 'en', x: q.x, z: q.z, heading: q.heading, visitor: false, ride: rideOf(q), car: carOf(q), hornAt: q.hornAt === undefined ? -10 : q.hornAt }); }
    for (const v of visitors.values()) out.push({ id: v.id, name: v.name, look: v.look, lang: v.lang, x: v.x, z: v.z, heading: v.heading, visitor: true, ride: v.ride || null, car: v.car || null, cars: v.cars || [], hornAt: v.hornAt === undefined ? -10 : v.hornAt, vehicle: v.vehicle || null, parked: v.parked || [], kekes: v.kekes || [], vel: v.vel || [0, 0], talk: v.talk || null, carTalk: v.carTalk || null, phone: v.phone || 0, down: v.down || null });
    return out;
  }
  const withinOf = (player, range) => others(player).filter((o) => Math.hypot(o.x - player.x, o.z - player.z) <= range);

  function chat(player, text) {
    const body = cleanText(text);
    if (!body) throw new GameError('EMPTY', 'Type something to say.');
    if (!withinOf(player, CHAT.radius).length) throw new GameError('NOBODY_NEAR', 'Nobody is close enough to hear you.');
    if (now() - (player.lastChatAt || -10) < CHAT.gap) throw new GameError('TOO_SOON', 'Wait a moment before you speak again.');
    player.lastChatAt = now();
    player.said = (player.said || 0) + 1;
    const line = say({ who: `p:${player.id}`, name: player.name, text: body, lang: player.lang || 'en', x: player.x, z: player.z, kind: 'chat', range: CHAT.hearing, hold: Math.max(4, Math.min(9, 2.5 + body.length * 0.06)) });
    player.lastSaid = { seq: player.said, text: body, lang: line.lang };
    return { line: { id: line.id, text: body, lang: line.lang }, heardBy: withinOf(player, CHAT.hearing).map((o) => o.id) };
  }

  // People from other copies of the world. What arrives here was written by
  // someone else's computer, so none of it is trusted: every field is
  // checked, and a visitor has no say in anything but where they appear to
  // stand and what they said.
  const near = (o, x, z) => Number.isFinite(Number(o.x)) && Number.isFinite(Number(o.z)) && Math.hypot(Number(o.x) - x, Number(o.z) - z) < 90;
  const oneOf = (value, list, fallback) => (list.includes(value) ? value : fallback);
  function lookIn(l) {
    if (!l || typeof l !== 'object') return null;
    const n01 = (k) => (Number.isFinite(Number(k)) ? Math.max(0, Math.min(1, Number(k))) : 0);
    return { model: 'keke', trim: oneOf(l.trim, VEHICLE_MODELS.keke.trims, VEHICLE_MODELS.keke.trims[0]), paint: oneOf(l.paint, KEKE_PAINTS.map((p) => p.id), 'yellow'), canopy: oneOf(l.canopy, Object.keys(KEKE_CANOPIES), 'black'), seat: oneOf(l.seat, Object.keys(KEKE_SEATS), 'black'), floor: oneOf(l.floor, Object.keys(KEKE_FLOORS), 'dark'), wear: n01(l.wear), dirt: n01(l.dirt), slogan: l.slogan ? cleanText(String(l.slogan), 32) || null : null, number: l.number ? String(l.number).replace(/[^0-9]/g, '').slice(0, 4) || null : null, extras: Array.isArray(l.extras) && l.extras.includes('curtains') ? ['curtains'] : [] };
  }
  function vehicleIn(h) {
    if (!h || typeof h !== 'object') return null;
    if (h.kind === 'keke') return { kind: 'keke', id: cleanText(String(h.id || ''), 12), plate: cleanText(String(h.plate || ''), 14), look: lookIn(h.look) || lookIn({}), fleet: !!h.fleet };
    if (h.kind === 'okada') return { kind: 'okada', back: !!h.back, driver: Number.isInteger(h.driver) && h.driver >= 0 && h.driver < 100000 ? h.driver : null };
    return null;
  }
  function visitorSeen(peerId, data) {
    const id = `v:${cleanText(peerId, 40).replace(/[^\w-]/g, '')}`;
    if (id.length < 3 || !data || typeof data !== 'object') return null;
    const x = Number(data.x), z = Number(data.z), heading = Number(data.heading);
    const b = ZONE.bounds;
    // (within the town's square, or out on the land beyond it: the airport, the roads out, the far side of the bridge)
    if (!Number.isFinite(x) || !Number.isFinite(z) || ((x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) && !zoneOnGround(x, z))) return null;
    // another player is known by their account's username, which may have figures and underscores in it
    const name = cleanHandle(data.name);
    if (name.length < 2) return null;
    if (!visitors.has(id) && visitors.size >= CHAT.visitors) return null;
    const colour = (value, fallback) => (Number.isInteger(value) && value >= 0 && value <= 0xffffff ? value : fallback);
    const look = data.look && typeof data.look === 'object' ? data.look : {};
    const old = visitors.get(id);
    const v = { id, name, x, z, heading: Number.isFinite(heading) ? heading : 0, lang: LANGUAGES[data.lang] ? data.lang : 'en', look: cleanFigureLook(look) || { skin: colour(look.skin, 0x6b4226), top: colour(look.top, 0xf2c200), bottom: colour(look.bottom, 0x2c3440), build: 1, body: look.body === 'f' ? 'f' : 'm', outfit: 'streetwear' }, seen: now(), saySeq: old ? old.saySeq : -1, saidAt: old ? old.saidAt : -10 };
    // on a motorcycle: which (one of the game's own) and what it is doing, within bounds; a horn newly sounded
    const r = data.ride && typeof data.ride === 'object' ? data.ride : null;
    const n = (value, lo, hi) => { const k = Number(value); return Number.isFinite(k) ? Math.max(lo, Math.min(hi, k)) : 0; };
    v.ride = r && typeof r.bike === 'string' && POWER_BIKES[r.bike] ? { bike: r.bike, lean: n(r.lean, -0.9, 0.9), speed: n(r.speed, -3, 70), throttle: n(r.throttle, 0, 1), brake: r.brake ? 1 : 0, rev: n(r.rev, 0, 1), steer: n(r.steer, -0.7, 0.7) } : null;
    // the phone in their hand: held to be read (1), on a call (2), held up for a picture (3), or not out (0)
    v.phone = [1, 2, 3].includes(data.phone) ? data.phone : 0;
    // a vehicle under them (a keke they drive, an okada they ride or ride on the back of), the motorcycles and kekes of
    // theirs standing near them, and how fast they are going: each field checked, a bad one dropped
    v.vehicle = vehicleIn(data.vehicle);
    // (one that came down in a crash: when, by this town's clock, kept from the first word of it as a fall is, and
    // seen going over from the start if that word came soon after: FRESH)
    v.parked = (Array.isArray(data.parked) ? data.parked : []).slice(0, 3).map((b) => {
      if (!(b && POWER_BIKES[b.bike] && near(b, x, z))) return null;
      const out = { bike: b.bike, x: Number(b.x), z: Number(b.z), h: n(b.h, -10, 10), fallen: !!b.fallen };
      if (out.fallen && Number.isFinite(Number(b.ago))) {
        const began = now() - n(b.ago, 0, 600);
        // (down in the last word too: the same fall of it, however late either word came)
        const was = old && (old.parked || []).find((o) => o.bike === b.bike && o.fallen && Number.isFinite(o.since));
        out.began = was ? was.began : began;
        out.since = was ? was.since : Number(b.ago) <= FRESH ? now() : began;
      }
      return out;
    }).filter(Boolean);
    v.kekes = (Array.isArray(data.kekes) ? data.kekes : []).slice(0, 2).map((k) => (k && near(k, x, z) && lookIn(k.look) ? { id: cleanText(String(k.id || ''), 12), x: Number(k.x), z: Number(k.z), heading: n(k.heading, -10, 10), plate: cleanText(String(k.plate || ''), 14), look: lookIn(k.look), fleet: !!k.fleet } : null)).filter(Boolean);
    v.vel = Array.isArray(data.vel) ? [n(data.vel[0], -100, 100), n(data.vel[1], -100, 100)] : [0, 0];
    // in one of their own cars (one of the game's own) and what it is doing, within bounds; their cars standing near
    const c = data.car && typeof data.car === 'object' ? data.car : null;
    v.car = c && typeof c.car === 'string' && POWER_CARS[c.car] ? { car: c.car, steer: n(c.steer, -0.7, 0.7), speed: n(c.speed, -6, 100), throttle: n(c.throttle, 0, 1), brake: c.brake ? 1 : 0, rev: n(c.rev, 0, 1), lamps: c.lamps ? 1 : 0 } : null;
    v.cars = (Array.isArray(data.cars) ? data.cars : []).slice(0, 3).map((b) => (b && POWER_CARS[b.car] && near(b, x, z) ? { car: b.car, x: Number(b.x), z: Number(b.z), h: n(b.h, -10, 10) } : null)).filter(Boolean);
    // asking the showroom's salesman about one of its motorcycles: only in the showroom's hall, only one of its bikes;
    // when it began, by this town's clock (kept from the first word of it, so that it does not drift)
    const tk = data.talk && typeof data.talk === 'object' && POWER_BIKES[data.talk.bike] && inPowerbikeHall(x, z) ? data.talk : null;
    v.talk = tk ? { bike: tk.bike, since: old && old.talk && old.talk.bike === tk.bike ? old.talk.since : now() - n(tk.ago, 0, 3600) } : null;
    // and asking one of the car showroom's salesmen about one of its cars: only in its hall, only one of its cars
    const tc = data.carTalk && typeof data.carTalk === 'object' && POWER_CARS[data.carTalk.car] && inCarHall(x, z) ? data.carTalk : null;
    v.carTalk = tc ? { car: tc.car, since: old && old.carTalk && old.carTalk.car === tc.car ? old.carTalk.since : now() - n(tc.ago, 0, 3600) } : null;
    // knocked down, thrown from a motorcycle, or killed (19 October 2026): when it began (kept from the first word of it,
    // so that it does not drift, and one word after another is the same fall, not a new one), how long on the ground
    // and getting up, which way the blow sent them, where it began (only near where they are) and where they lie:
    // within bounds, or nothing. Everything of theirs is seen a moment late (the word takes its time to come), and so
    // is a fall: one first heard of soon after it began (FRESH) is shown from its beginning, so that none of it is
    // missed; and one still being shown here when their own screen has them up again is let finish (never stood up
    // before it is over). One first heard of long after (coming into view) is shown as it is now.
    const dn = data.down && typeof data.down === 'object' && ['knock', 'crash', 'dead'].includes(data.down.kind) ? data.down : null;
    if (dn) {
      const began = now() - n(dn.age, 0, 120);
      // (the same fall: its own number the same; from a game that gives none, begun at about the same time)
      const id = Number.isFinite(Number(dn.id)) && dn.id !== null ? Number(dn.id) : null;
      const same = old && old.down && old.down.kind === dn.kind && (id !== null && old.down.id !== null ? old.down.id === id : Math.abs(old.down.began - began) < 1.5);
      const from = dn.from && Number.isFinite(Number(dn.from.x)) && Number.isFinite(Number(dn.from.z)) && Math.hypot(Number(dn.from.x) - x, Number(dn.from.z) - z) < 8 ? { x: Number(dn.from.x), z: Number(dn.from.z) } : null;
      // (thrown over something low: where along the way from `from` it lay, within the way)
      const over = from && dn.over && Number.isFinite(Number(dn.over.a)) && Number.isFinite(Number(dn.over.b)) ? { a: n(dn.over.a, 0, 8), b: n(dn.over.b, 0, 8) } : null;
      // (where they lie: as their game says, if it says, and that is near where they are shown)
      const lies = dn.at && Number.isFinite(Number(dn.at.x)) && Number.isFinite(Number(dn.at.z)) && Math.hypot(Number(dn.at.x) - x, Number(dn.at.z) - z) < 25 ? { x: Number(dn.at.x), z: Number(dn.at.z) } : { x, z };
      v.down = { kind: dn.kind, id, began: same ? old.down.began : began, since: same ? old.down.since : Number(dn.age) <= FRESH ? now() : began, at: same ? old.down.at : lies, lie: n(dn.lie, 0, 30), rise: n(dn.rise, 0, 6), push: n(dn.push, -10, 10), hard: !!dn.hard, from, over: over && over.b >= over.a ? over : null };
    } else if (old && old.down && old.down.kind !== 'dead' && now() - old.down.since < old.down.lie + old.down.rise) v.down = old.down;
    else v.down = null;
    // (a vehicle is carried on between words at the speed it was going, online.js: it is not shown going through anything
    // solid, but held where it last stood clear, until the next word says where it really is)
    if ((v.ride || v.car || v.vehicle) && old && !zoneWalkable(x, z, [], 0.3) && zoneWalkable(old.x, old.z, [], 0.3)) { v.x = old.x; v.z = old.z; }
    const horns = r ? n(r.horns, 0, 1e9) : c ? n(c.horns, 0, 1e9) : data.vehicle && typeof data.vehicle === 'object' ? n(data.vehicle.horns, 0, 1e9) : 0;
    v.horns = old && old.horns !== undefined ? old.horns : horns;
    v.hornAt = old ? old.hornAt : -10;
    if (horns > v.horns) { v.horns = horns; v.hornAt = now(); }
    visitors.set(id, v);
    const said = data.say;
    // what was said before this visitor came into view is not replayed
    if (!old) v.saySeq = said && Number.isInteger(said.seq) ? said.seq : 0;
    if (said && Number.isInteger(said.seq) && said.seq > v.saySeq) {
      v.saySeq = said.seq;
      const body = cleanText(said.text);
      if (body && now() - v.saidAt >= CHAT.gap * 0.8) {
        const heard = Object.keys(players).some((pid) => Math.hypot(players[pid].x - v.x, players[pid].z - v.z) <= CHAT.hearing);
        if (heard) { v.saidAt = now(); say({ who: id, name: v.name, text: body, lang: LANGUAGES[said.lang] ? said.lang : v.lang, x: v.x, z: v.z, kind: 'chat', range: CHAT.hearing, hold: Math.max(4, Math.min(9, 2.5 + body.length * 0.06)) }); }
      }
    }
    return v;
  }

  function tick(t) {
    const real = now();
    if (book.lines.length && book.lines[0].until < real - 1) book.lines = book.lines.filter((line) => line.until >= real - 1);
    while (chatter.length && chatter[0].until < real - 1) chatter.shift();
    for (const [id, v] of visitors) if (real - v.seen > 6) visitors.delete(id);
    for (const id of Object.keys(players)) {
      if ((book.next[id] || 0) > real) continue;
      const made = converse(players[id], t);
      book.next[id] = real + (made ? 2.2 : 1.2) + hash(Math.floor(real), 7) * 2;
    }
    if (Object.keys(book.busy).length > 400) for (const key of Object.keys(book.busy)) if (book.busy[key] < real) delete book.busy[key];
  }

  // What one player can hear and whom they can talk to.
  function view(player) {
    const real = now();
    const speech = [];
    for (const line of chatter.length ? [...book.lines, ...chatter] : book.lines) {
      if (line.from > real || line.until <= real) continue;
      if (Math.hypot(line.x - player.x, line.z - player.z) > line.range && line.who !== `p:${player.id}`) continue;
      speech.push({ id: line.id, who: line.who, name: line.name, role: line.role, text: line.text, lang: line.lang, gloss: line.gloss, kind: line.kind, until: line.until });
    }
    const seen = others(player).filter((o) => Math.hypot(o.x - player.x, o.z - player.z) <= RANGE.middle).map((o) => ({ ...o, parked: (o.parked || []).map((b) => (Number.isFinite(b.since) ? { bike: b.bike, x: b.x, z: b.z, h: b.h, fallen: b.fallen, ago: Math.max(0, Math.round((real - b.since) * 100) / 100) } : b)), down: o.down && (o.down.kind === 'dead' || real - o.down.since < o.down.lie + o.down.rise + 1) ? { kind: o.down.kind, age: Math.max(0, Math.round((real - o.down.since) * 1000) / 1000), lie: o.down.lie, rise: o.down.rise, push: o.down.push, hard: o.down.hard, from: o.down.from, over: o.down.over || null, at: o.down.at || null } : null, x: Math.round(o.x * 100) / 100, z: Math.round(o.z * 100) / 100, hornAgo: Math.round((real - o.hornAt) * 100) / 100, ago: o.visitor ? Math.max(0, Math.round((real - (visitors.get(o.id) || { seen: real }).seen) * 1000) / 1000) : 0 }));
    const near = seen.filter((o) => Math.hypot(o.x - player.x, o.z - player.z) <= CHAT.radius).map((o) => o.id);
    return { speech, players: seen, chat: { near, can: near.length > 0, radius: CHAT.radius, language: player.lang || 'en' } };
  }

  return { tick, view, say, chat, talkToPerson, talkToResident, converse, visitorSeen, chatter: () => chatter, visitorGone: (peerId) => visitors.delete(`v:${cleanText(peerId, 40).replace(/[^\w-]/g, '')}`), visitors: () => [...visitors.values()], cleanText };
}
