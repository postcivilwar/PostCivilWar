// Bodies in each other's way, and what a moving vehicle does to one.
//
// Two rules that the rest of the game had not needed until players could meet and vehicles could move:
//
//   1. Nobody stands in anybody: a player cannot step into or through another player, a townsperson or a
//      resident (8 October 2026: townspeople and residents added). A step that would put one inside another, or carry
//      one through another, is refused. A step that takes them apart is always allowed, so nobody can be
//      pinned.
//   2. A keke or a motorcycle that drives into someone knocks them down. How hard depends on how fast it
//      was going. They lie where they fall for a few seconds and get up; struck again and again, a player
//      can be killed. A player who is killed is carried to the hospital and comes round there, badly hurt.
//
// All of it is decided here, from positions the simulation already holds. A client never says "I hit",
// "I was hit" or "I died": the driver's client asks to move its vehicle one step, as it always has, and
// this file works out what that step struck.
//
// A car (31 October 2026, the owner's word: "I don't want characters to stop a car movement when jammed, the car
// should jam them if they block the road/path. Jam them and climb over them"): a car is never stopped by whoever it
// runs into. Anyone in its way is struck at whatever pace it is going, however slowly (it no longer slides through
// someone at a crawl), and goes down across its way a little ahead of it, so that it goes over them; someone already
// lying in its way (knocked down, or dead) is gone over where they lie, not shoved along the road. The page shows the
// wheels climbing over the body and the car's body pitching and rolling on its springs as they do (car-view.js). A
// rider on a bicycle, a skateboard or skates is knocked off as someone on foot is, what they rode thrown aside
// (sport-riders.js); a keke, a motorcycle or a bicycle ridden into someone is still stopped by it, as before.
//
// Townspeople are knocked down and hurt, and (8 October 2026, at the owner's word) struck hard enough or often
// enough they die: they lie where they fell for a while, and are then taken to the mortuary and are gone from
// the town. A player is never killed for good: a dead player comes round at the hospital. Children step clear
// and are never struck. Each blow draws blood, more the harder it was; someone lying bleeds on, so the pool
// under them spreads, and a pool is left on the ground after they are gone.

import { HEALTH } from './conflict.js';
import { GameError } from './registry.js';
import { zoneWalkable, ZONE_RESIDENTS } from './zone.js';

const RESIDENT_NAME = new Map(ZONE_RESIDENTS.map((r) => [r.id, r.name]));
import { POSE } from './population.js';
import { PACE } from './actors.js';
import { SPORT_ON } from './sport-ride.js';
import { POWER_CARS } from './power-cars.js';

export const BODY = Object.freeze({
  radius: 0.3,             // a person, for standing in the way: two cannot be nearer than twice this
});

export const IMPACT = Object.freeze({
  least: 1.6,              // metres a second: slower than this a vehicle nudges and does no harm
  perSpeed: 7,             // health lost for each metre a second above `least`
  floor: 4, most: 60,      // the least and the most one blow can take
  grace: 0.9,              // real seconds after a blow in which the same person cannot be struck again, by anything
  downed: 0.6,             // the share of the harm that counts on someone already on the ground
  down: Object.freeze([2.4, 3.6]),     // real seconds on the ground, light blow to heavy
  // (19 October 2026: time enough to get up as a person does, onto the hands, a knee, a foot, and up: falls.js)
  rise: 2.7,               // real seconds getting up, in which they still cannot act
  throw: Object.freeze([0.6, 2.6]),    // metres thrown forward, light blow to heavy
  stall: 0.7,              // real seconds the vehicle is stopped by what it hit (not a car: 31 October 2026)
  crawl: 0.3,              // metres a second: a car going faster than this strikes whoever it runs into, however slowly
  carry: 0.9,              // the share of its pace a car keeps after striking someone (it is not stopped by them)
  pinned: 20,              // real seconds the most someone knocked down lies under a car standing on them, before crawling out
  gather: 9,               // metres a second each second: the fastest any vehicle here can gain speed
  reach: 0.35,             // metres added to the vehicle's half-width: the body it meets
  dead: 8,                 // real seconds between being killed and coming round at the hospital
  body: 150,               // real seconds a dead townsperson lies where they fell before they are taken away
  bleed: Object.freeze({ perHarm: 1, most: 260 }),     // blood counted for each point of harm, and the most one body holds for the drawing
  wake: 20,                // health on coming round
  // brought down by a round or a hard blow (27 October 2026, the owner's brief: "If an NPC is shot, it falls using the
  // falling animation, gets up again, and then limps or runs away"): real seconds before the same person goes down
  // again (just up, they keep going), and the blood each fall leaves under them
  refall: 6,
  fallBlood: 40,
  seen: 10,                // real seconds the two of them can see each other's health afterwards
  minAge: 16,              // nobody younger is struck: they jump clear
  crimeWindow: 30,         // real seconds in which more blows from the same driver are the same offence
  // run into by another player's car, seen through the network (31 October 2026): no more often than this (real
  // seconds), and never brought below HEALTH.critical by it
  visitorEvery: 4,
});

// What each vehicle presents to someone in front of it: half its width, and how far ahead of its middle its nose is.
export const FRONTS = Object.freeze({
  keke: Object.freeze({ half: 0.72, nose: 1.15, tail: 1.2 }),
  moto: Object.freeze({ half: 0.36, nose: 0.85, tail: 0.8 }),
  // a car (17 October 2026): an ordinary saloon's; each car gives its own (own-cars.js, from its length and width)
  car: Object.freeze({ half: 0.92, nose: 2.3, tail: 2.3 }),
  // a thing from the sports mall, ridden (31 October 2026): each gives its own (sport-ride.js SPORT_FRONTS)
  sport: Object.freeze({ half: 0.3, nose: 0.5, tail: 0.5 }),
});
// A rider on one of the sports mall's things (a bicycle, a skateboard, skates...) is far lighter than a motorcycle and
// goes far slower: what they do to someone they run into is this share of what a vehicle would, and never more than
// `most`. Who did it is said as "ran into you on a bicycle".
export const SPORT_HARM = Object.freeze({ share: 0.35, most: 16 });
// What a vehicle is called, for whoever it struck.
const VEHICLE_WORD = Object.freeze({ keke: 'keke', moto: 'motorcycle', car: 'car' });

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// How near a point comes to the line walked from (x0, z0) to (x1, z1).
export function nearestOnStep(x0, z0, x1, z1, px, pz) {
  const dx = x1 - x0, dz = z1 - z0;
  const len2 = dx * dx + dz * dz;
  const t = len2 > 1e-9 ? clamp(((px - x0) * dx + (pz - z0) * dz) / len2, 0, 1) : 0;
  return Math.hypot(px - (x0 + dx * t), pz - (z0 + dz * t));
}

// How much health a blow at `speed` metres a second takes.
export function harmAt(speed) {
  if (!(speed >= IMPACT.least)) return 0;
  return Math.round(clamp((speed - IMPACT.least) * IMPACT.perSpeed, IMPACT.floor, IMPACT.most));
}
// What this vehicle does at this speed (a rider from the sports mall: far less, SPORT_HARM).
export const harmOf = (vehicle, speed) => (vehicle && vehicle.kind === 'sport' ? Math.min(SPORT_HARM.most, Math.round(harmAt(speed) * SPORT_HARM.share)) : harmAt(speed));

export function createImpact({ state, players, population, actors, conflict, talk, emit, rng, hub, door, visitors = () => [] }) {
  if (!state.impact) state.impact = { seq: 0, events: [], npc: {} };
  const book = state.impact;
  const people = population.people;
  const real = () => state.real;
  for (const id of Object.keys(players)) { const p = players[id]; if (p.down === undefined) p.down = null; if (p.dead === undefined) p.dead = null; if (!p.involved) p.involved = {}; }

  const onFoot = (q) => !q.driving && (q.riding === null || q.riding === undefined) && (q.astride === null || q.astride === undefined) && !q.incar && !q.carried;
  // someone who takes up room where they stand
  const solid = (q) => onFoot(q) && !q.dead;

  // --- standing in the way --------------------------------------------------------

  // May `p` step from where they are to (x, z)? Throws if another player, a townsperson or a resident is in
  // the way; the error carries where they stand, so that the walker's client can step round them.
  const blockedBy = (q, name) => { const e = new GameError('IN_THE_WAY', `${name} is in the way.`); e.at = { x: q.x, z: q.z }; return e; };
  function clear(p, x, z) {
    const need = BODY.radius * 2;
    const test = (qx, qz, name) => {
      const before = Math.hypot(p.x - qx, p.z - qz);
      if (before > need + 8) return;
      const after = Math.hypot(x - qx, z - qz);
      if (before < need) { if (after + 1e-6 < before) throw blockedBy({ x: qx, z: qz }, name); return; }
      if (after < need || nearestOnStep(p.x, p.z, x, z, qx, qz) < need) throw blockedBy({ x: qx, z: qz }, name);
    };
    // the town's people, wherever their day has them just now (not those indoors out of sight, nor riding)
    if (population.within && !p.driving) {
      for (const [i, qx, qz, pose] of population.within(`way:${p.id}`, x, z, 1.6, state.t, real())) {
        if (pose === POSE.hidden || pose === POSE.ride) continue;
        if (book.npc[i] && book.npc[i].dead) continue;
        test(qx, qz, population.people[i] ? population.people[i].short || population.people[i].name : 'Someone');
      }
    }
    // the named residents (the police, the clerks, the drivers at the park)
    if (state.residents) for (const r of Object.values(state.residents)) if (r && r.mode !== 'inside' && r.mode !== 'away' && Number.isFinite(r.x)) test(r.x, r.z, RESIDENT_NAME.get(r.id) || 'Someone');
    for (const id of Object.keys(players)) {
      const q = players[id];
      if (q === p || !solid(q)) continue;
      const before = Math.hypot(p.x - q.x, p.z - q.z);
      if (before > need + 8) continue;
      const after = Math.hypot(x - q.x, z - q.z);
      // already too close (set down together, or one fell onto the other): any step apart is allowed
      if (before < need) { if (after + 1e-6 < before) throw blockedBy(q, q.name); continue; }
      if (after < need || nearestOnStep(p.x, p.z, x, z, q.x, q.z) < need) throw blockedBy(q, q.name);
    }
    // A player in another copy of this world, seen through the network. Where they say they are is not to be
    // trusted with anything that matters, and this is not: it can only stop this player's own step, and a
    // step apart is always allowed, so nobody can be boxed in by someone lying about where they stand.
    for (const v of visitors()) {
      const before = Math.hypot(p.x - v.x, p.z - v.z);
      if (before > need + 8) continue;
      const after = Math.hypot(x - v.x, z - v.z);
      if (before < need) { if (after + 1e-6 < before) throw blockedBy(v, v.name); continue; }
      if (after < need || nearestOnStep(p.x, p.z, x, z, v.x, v.z) < need) throw blockedBy(v, v.name);
    }
  }

  // --- the blow --------------------------------------------------------------------

  function show(event) {
    book.seq += 1;
    book.events.push({ id: book.seq, at: real(), ...event });
    if (book.events.length > 30) book.events.splice(0, book.events.length - 30);
    // someone knocked down by a vehicle: the people near call out (voices.js)
    if (hub.voices && (event.kind === 'knock' || event.kind === 'killed')) hub.voices.event('crash', event.x, event.z, { not: [event.on && event.on.kind === 'npc' ? `n:${event.on.id}` : ''] });
  }

  // Throws someone forward along the vehicle's heading, as far as the ground allows.
  function thrown(x, z, heading, metres) {
    const ux = Math.sin(heading), uz = Math.cos(heading);
    for (let m = metres; m > 0.2; m -= 0.25) if (zoneWalkable(x + ux * m, z + uz * m)) return { x: x + ux * m, z: z + uz * m };
    return { x, z };
  }

  // The two of them may see each other's health for a little while: the one who was hit, and the one who hit.
  function involve(a, b) {
    const until = real() + IMPACT.seen;
    a.involved[b.id] = until; b.involved[a.id] = until;
  }

  // What the driver has done, for the police: one offence for one incident, however many blows.
  function charge(driver, victim, x, z, vehicle, killed) {
    if (!hub.justice) return null;
    const open = driver.driveCrime && real() - driver.driveCrime.at < IMPACT.crimeWindow && driver.driveCrime.victim === `${victim.kind}:${victim.id}` ? driver.driveCrime.id : null;
    // (a crime only if an officer on the scene saw it: justice.js, 31 October 2026)
    const made = hub.justice.offence(driver, killed ? 'death_by_driving' : 'dangerous_driving', { victim, x, z, vehicle, crime: open, stealth: false, noticed: false });
    driver.driveCrime = { id: made.id, at: real(), victim: `${victim.kind}:${victim.id}` };
    if (killed) hub.justice.worsen(made.id, 'death_by_driving', true);
    return made.id;
  }

  function strikePlayer(driver, q, speed, heading, vehicle) {
    const now = real();
    if (q.struckByVehicleAt !== undefined && now - q.struckByVehicleAt < IMPACT.grace) return null;
    const lying = !!q.down;
    const harm = Math.max(1, Math.round(harmOf(vehicle, speed) * (lying ? IMPACT.downed : 1)));
    const weight = clamp((speed - IMPACT.least) / 7, 0, 1) * (vehicle.kind === 'sport' ? 0.5 : 1);
    q.struckByVehicleAt = now;
    const lost = conflict.injure(q, harm);
    q.blood = Math.min(IMPACT.bleed.most, (q.blood && now - (q.bloodAt || 0) < 60 ? q.blood : 0) + harm * IMPACT.bleed.perHarm); q.bloodAt = now;
    const from = { x: q.x, z: q.z };
    // (someone already on the ground, gone over by a car, stays where they lie)
    const to = lying && vehicle.kind === 'car' ? from : thrown(q.x, q.z, heading, IMPACT.throw[0] + (IMPACT.throw[1] - IMPACT.throw[0]) * weight);
    q.x = to.x; q.z = to.z; q.lastMoveAt = now;
    conflict.stop(q);
    involve(driver, q);
    const killed = q.health <= 0;
    const crime = charge(driver, { kind: 'player', id: q.id, name: q.name }, q.x, q.z, vehicle, killed);
    if (killed) {
      q.down = null;
      q.dead = { at: now, by: driver.id, byName: driver.name, wakeAt: now + IMPACT.dead, crime, x: q.x, z: q.z, vehicle: vehicle.kind };
      q.stats.deaths = (q.stats.deaths || 0) + 1;
      emit(q.id, { type: 'critical', title: 'Killed', text: `${driver.name} ran you down. You are being carried to the hospital.` });
      emit(driver.id, { type: 'alert', title: 'You have killed someone', text: `${q.name} is dead under your wheels.` });
    } else if (lying && vehicle.kind === 'car' && now < q.down.until) {
      // (already on the ground, gone over where they lie by a car: they stay down until it is past, the fall they are in
      // carried on, not begun again)
      q.down.until = Math.max(q.down.until, now + 2); q.down.upAt = q.down.until + IMPACT.rise;
      emit(q.id, { type: 'alert', title: 'Run over', text: `${driver.name} drove over you. Health ${q.health}.` });
    } else {
      const lie = IMPACT.down[0] + (IMPACT.down[1] - IMPACT.down[0]) * weight;
      // (`from`: where they were struck, to be carried from as they fall; `hard`: a heavy blow, down at once)
      q.down = { at: now, until: now + lie, upAt: now + lie + IMPACT.rise, by: driver.id, h: heading, from, hard: weight > 0.6 };
      emit(q.id, { type: 'alert', title: 'Knocked down', text: vehicle.kind === 'sport' ? `${driver.name} ran into you on ${SPORT_ON[String(vehicle.id).slice(3)] || 'a bicycle'}. Health ${q.health}.` : `${driver.name} hit you with a ${VEHICLE_WORD[vehicle.kind] || 'keke'}. Health ${q.health}.` });
    }
    show({ kind: killed ? 'killed' : 'knock', by: { kind: 'player', id: driver.id }, on: { kind: 'player', id: q.id }, x: q.x, z: q.z, speed: Math.round(speed * 10) / 10, harm: lost, vehicle: vehicle.kind });
    return { kind: 'player', id: q.id, name: q.name, harm: lost, health: q.health, killed };
  }

  function strikeNpc(driver, i, speed, heading, vehicle) {
    const now = real();
    const who = people[i];
    const rec = book.npc[i] || (book.npc[i] = { at: -10, health: 100, t: state.t });
    if (rec.dead) {
      // a body is not knocked about again; the vehicle goes over it (and, but for a car, stops)
      if (now - rec.at < IMPACT.grace) return null;
      rec.at = now;
      return { kind: 'npc', id: i, name: who.short, harm: 0, health: 0, killed: false, body: true };
    }
    if (now - rec.at < IMPACT.grace) return null;
    actors.take(i, state.t);
    const m = actors.get(i);
    if (!m) return null;
    if (who.age < IMPACT.minAge) {
      // a child jumps clear, and runs
      if (now - rec.at > 3) { rec.at = now; actors.flee(i, driver.x, driver.z, 4.6, 'Running from the road'); }
      return null;
    }
    const lying = m.pose === POSE.lie;
    const harm = Math.max(1, Math.round(harmOf(vehicle, speed) * (lying ? IMPACT.downed : 1)));
    const weight = clamp((speed - IMPACT.least) / 7, 0, 1) * (vehicle.kind === 'sport' ? 0.5 : 1);
    rec.at = now; rec.t = state.t;
    // (the 20-life rule, 22 October 2026: nobody is brought below 20, and nobody is killed)
    rec.health = Math.max(Math.min(rec.health, HEALTH.critical), rec.health - harm);
    rec.blood = Math.min(IMPACT.bleed.most, (rec.blood || 0) + harm * IMPACT.bleed.perHarm);
    rec.hits = (rec.hits || 0) + 1;
    const car = vehicle.kind === 'car';
    if (car && lying) {
      // already down in its way: the car goes over them where they lie (car-view.js shows its wheels climbing over),
      // and they stay down until it is past
      downLonger(i, rec, now + 2.5);
      charge(driver, { kind: 'npc', id: i, name: who.short }, m.x, m.z, vehicle, false);
      driver.involvedNpc = { i, name: who.short, until: now + IMPACT.seen };
      show({ kind: 'knock', by: { kind: 'player', id: driver.id }, on: { kind: 'npc', id: i }, x: m.x, z: m.z, speed: Math.round(speed * 10) / 10, harm, vehicle: vehicle.kind, over: true });
      return { kind: 'npc', id: i, name: who.short, harm, health: rec.health, killed: false, over: true };
    }
    const to = thrown(m.x, m.z, heading, IMPACT.throw[0] + (IMPACT.throw[1] - IMPACT.throw[0]) * weight);
    m.x = to.x; m.z = to.z;
    // Which way they go down (31 October 2026). The fall every figure is drawn with (falls.js: the woman's fall from the
    // supplied files, carried onto each figure) staggers back and turns a quarter as it goes down, so that a figure
    // lies across the way it faced, its head to its left (measured in a browser on three figures and a player's). Struck
    // by a car, they are turned to face along its way (of the two ways along it, the one nearer the way they were
    // facing) and so lie across it, a little ahead of it, for it to go over them, the wheels on both sides climbing; by
    // anything else they face what struck them.
    if (car) m.h = Math.cos(m.h - heading) >= 0 ? heading : heading + Math.PI; else m.h = heading + Math.PI;
    rec.x = m.x; rec.z = m.z;
    const killed = rec.health <= 0;
    if (killed) {
      rec.dead = { at: now, by: driver.id, byName: driver.name, takeAt: now + IMPACT.body };
      actors.kill(i, 'Dead');
      if (talk) talk.say({ who: `n:${i}`, name: 'Someone', text: 'Ewo! He don die! Call police!', lang: 'pcm', gloss: 'Oh no! He is dead! Call the police!', x: m.x, z: m.z, kind: 'shout', range: 30, hold: 3.6 });
      emit(driver.id, { type: 'alert', title: 'You have killed someone', text: `${who.short} is dead under your wheels.` });
    } else {
      const lie = IMPACT.down[0] + (IMPACT.down[1] - IMPACT.down[0]) * weight + (rec.health <= 25 ? 12 : 1.5);
      // down for `lie` seconds, then getting up (`rise`), then let go to walk back to their day (tick); drawn as the
      // figure's own fall and getting up, timed by these (falls.js, `fall`: before, a figure of his own was drawn standing
      // where it had been knocked down, as if the vehicle had gone through it)
      actors.hold(i, 'Knocked down', POSE.lie, 0);
      m.after = 0;
      rec.upAt = now + lie;
      rec.then = { at: now + lie + IMPACT.rise, from: null, release: true };
      rec.fall = { at: now, lie, rise: IMPACT.rise, h: m.h, car };
      rec.pinnedSince = 0;
      // getting up, they hold their head; badly hurt, they weep
      if (hub.reactions) { if (hub.reactions.end) hub.reactions.end(i); rec.reactAt = now + lie + IMPACT.rise; rec.reactWith = rec.badly || rec.health <= 25 ? 'cry' : 'hurt'; }
      rec.badly = rec.health <= 25;
      if (talk) talk.say({ who: `n:${i}`, name: who.short, text: rec.badly ? 'My leg! Somebody help me!' : 'Ah! You no dey look road?', lang: rec.badly ? 'en' : 'pcm', gloss: rec.badly ? null : 'Are you not watching the road?', x: m.x, z: m.z, kind: 'shout', range: 26, hold: 3.2 });
    }
    charge(driver, { kind: 'npc', id: i, name: who.short }, m.x, m.z, vehicle, killed);
    driver.involvedNpc = { i, name: who.short, until: now + IMPACT.seen };
    show({ kind: killed ? 'killed' : 'knock', by: { kind: 'player', id: driver.id }, on: { kind: 'npc', id: i }, x: m.x, z: m.z, speed: Math.round(speed * 10) / 10, harm, vehicle: vehicle.kind });
    return { kind: 'npc', id: i, name: who.short, harm, health: rec.health, killed };
  }

  // Townspeople in the way of a vehicle that is coming get out of its way, if they notice it in time. Nearly
  // everyone does; at speed a few do not; a horn makes everyone look. Someone sitting or lying cannot, and
  // someone who is busy with something else (an officer on a call, a person running from a fight) does not.
  function warn(driver, rows, bx, bz, tx, tz, speed, reach) {
    makeWay(rows, bx, bz, tx, tz, speed, reach, { horn: real() - (driver.hornAt === undefined ? -10 : driver.hornAt) < 2.5 });
  }
  // (the same for the town's own traffic, traffic.js, with its own dice, so that the rest of the town's chances fall as
  // they did before it came; at the pace of someone stepping aside, without a start)
  function makeWay(rows, bx, bz, tx, tz, speed, reach, { horn = false, chance = () => rng.next(), pace = 4.6, react = true } = {}) {
    const now = real();
    const look = clamp(speed * 1.1 + 3, 5, 14);
    for (const [i, px, pz, pose] of rows) {
      if (pose !== POSE.stand && pose !== POSE.walk) continue;
      const along = (px - bx) * tx + (pz - bz) * tz;
      const across = (px - bx) * tz - (pz - bz) * tx;
      if (along < 0.6 || along > look || Math.abs(across) > reach + 0.5) continue;
      if (actors.has(i)) continue;
      const rec = book.npc[i] || (book.npc[i] = { at: -10, health: 100, t: state.t });
      if (now - (rec.warned === undefined ? -10 : rec.warned) < 2.5) continue;
      rec.warned = now; rec.t = state.t;
      const notices = people[i].age < IMPACT.minAge || horn || chance() < (speed > 6 ? 0.88 : 0.97);
      if (!notices) continue;
      const first = across > 0.15 ? 1 : across < -0.15 ? -1 : i % 2 ? 1 : -1;
      const need = reach + 1.1 - Math.abs(across);
      let to = null;
      for (const side of [first, -first]) {
        const far = side === first ? need : need + Math.abs(across) * 2;
        const x = px + tz * side * far, z = pz - tx * side * far;
        if (zoneWalkable(x, z)) { to = [x, z]; break; }
      }
      if (!to || !actors.take(i, state.t)) continue;
      actors.walkTo(i, to[0], to[1], pace, 'Getting out of the way');
      actors.get(i).after = now + 2.2;
      // a leap clear, or a fright
      if (react && hub.reactions) hub.reactions.react(i, horn || speed > 5 ? 'jump' : 'scared');
    }
  }

  // A vehicle has been moved one step by its driver, from (x0, z0) to (x1, z1), facing `heading`.
  // Returns who it struck, if anyone, and stops the vehicle if it struck someone.
  //   vehicle: { kind: 'keke' | 'moto' | 'car', id, front? }; `holder` is the vehicle's own record, where its pace is
  //   kept between steps. A vehicle may give its own `front` (a car: its own length and width); it is not kept with
  //   what it did, only its kind and its id are.
  function step(driver, given, holder, x0, z0, x1, z1, heading, elapsed) {
    const vehicle = { kind: given.kind, id: given.id };
    const gap = Math.hypot(x1 - x0, z1 - z0);
    // How fast it is going. Not simply this step over the time it took: a vehicle gathers speed, it does not
    // have it. So the pace kept here follows the steps but can rise only as fast as an engine could raise it,
    // and starts again from nothing after a stop. One long frame, or one step sent early, is not a crash.
    const now0 = real();
    if (holder.pace === undefined || now0 - (holder.paceAt === undefined ? -10 : holder.paceAt) > 0.6) holder.pace = 0;
    const instant = gap / Math.max(elapsed, 1 / 90);
    holder.pace = Math.min(holder.pace + IMPACT.gather * Math.max(elapsed, 1 / 120), holder.pace + (instant - holder.pace) * 0.5);
    holder.paceAt = now0;
    const speed = holder.pace;
    const front = given.front || FRONTS[vehicle.kind] || FRONTS.keke;
    const ux = Math.sin(heading), uz = Math.cos(heading);
    // forward, the nose leads; backing up, the tail does
    const forward = (x1 - x0) * ux + (z1 - z0) * uz >= 0;
    const lead = forward ? front.nose : -front.tail;
    const ax = x0 + ux * lead, az = z0 + uz * lead, bx = x1 + ux * lead, bz = z1 + uz * lead;
    if (gap < 0.005) { holder.sweep = null; return []; }
    const reach = front.half + IMPACT.reach;
    const throwTo = forward ? heading : heading + Math.PI;
    const hits = [];
    // (a car strikes whoever it runs into at any pace but a standstill: it never slides through someone, 31 October 2026)
    const car = vehicle.kind === 'car';
    const least = car ? IMPACT.crawl : IMPACT.least;
    if (speed >= least) {
      for (const id of Object.keys(players)) {
        const q = players[id];
        if (q === driver || !onFoot(q) || q.dead) continue;
        if (nearestOnStep(ax, az, bx, bz, q.x, q.z) > reach) continue;
        const hit = strikePlayer(driver, q, speed, throwTo, vehicle);
        if (hit) hits.push(hit);
      }
    }
    // Townspeople are looked at ten times a second, over all the ground the nose has covered since the last
    // look: a thousand of them cannot be asked where they are at every step of every vehicle.
    const now = real();
    let from = holder.sweep;
    if (!from || Math.hypot(bx - from.x, bz - from.z) > 4) from = { x: ax, z: az, at: now - 1 };
    if (now - from.at >= 0.09 || Math.hypot(bx - from.x, bz - from.z) > 1) {
      const rows = population.within(`hit:${driver.id}`, x1, z1, 17, state.t, now);
      const tx = forward ? ux : -ux, tz = forward ? uz : -uz;
      if (speed >= least) {
        for (const [i, px, pz, pose] of rows) {
          if (pose === POSE.ride || pose === POSE.hidden) continue;
          if (nearestOnStep(from.x, from.z, bx, bz, px, pz) > reach) continue;
          const hit = strikeNpc(driver, i, speed, throwTo, vehicle);
          if (hit) hits.push(hit);
        }
      }
      if (speed > 0.8) warn(driver, rows, bx, bz, tx, tz, speed, reach);
      // (whoever lies under a car is kept down until it is past them: nobody gets up under it)
      if (car) keepDown(rows, x1, z1, heading, front, now);
      holder.sweep = { x: bx, z: bz, at: now };
    } else holder.sweep = from;
    // the town's riders on their bicycles, skateboards and skates (sport-riders.js): a car knocks them off, as it would
    // anyone on foot, at each step of its way (there are few of them, and they move quickly)
    if (car && speed >= least && hub.sportRiders && hub.sportRiders.knock) {
      for (const r of hub.sportRiders.riders()) {
        if (!hub.sportRiders.isOut(r)) continue;
        if (Math.abs(r.x - bx) > 12 || Math.abs(r.z - bz) > 12) continue;
        if (nearestOnStep(ax, az, bx, bz, r.x, r.z) > reach + (r.item === 'bicycle' ? 0.55 : 0.3)) continue;
        const rec = book.npc[r.i];
        if (rec && now - rec.at < IMPACT.grace) continue;
        if (hub.sportRiders.knock(r.n, x1, z1, heading, front.half) === null) continue;
        const hit = strikeNpc(driver, r.i, speed, throwTo, vehicle);
        if (hit) hits.push({ ...hit, rider: r.n });
      }
    }
    // Whoever it struck stops a keke, a motorcycle or a bicycle for a moment. Not a car: it loses a little of its pace
    // (someone's weight against it, a wheel over them) and goes on (31 October 2026).
    if (hits.length) { if (car) holder.pace *= IMPACT.carry; else { holder.stalledUntil = now + IMPACT.stall; holder.pace = 0; } }
    return hits;
  }

  // Someone knocked down kept on the ground until at least `until` (a car going over them): their getting up, and what
  // the drawing shows of their fall (`fall`), put back to suit.
  function downLonger(i, rec, until) {
    const m = actors.get(i);
    if (!m || m.dead) return;
    if (m.mode !== 'hold' || m.pose !== POSE.lie) actors.hold(i, 'Knocked down', POSE.lie, 0);
    m.until = 0; m.after = 0;
    rec.upAt = Math.max(rec.upAt || 0, until);
    if (rec.then) rec.then.at = Math.max(rec.then.at, rec.upAt + IMPACT.rise);
    else rec.then = { at: rec.upAt + IMPACT.rise, from: null, release: true };
    if (rec.fall) rec.fall.lie = Math.max(rec.fall.lie, rec.upAt - rec.fall.at);
    if (rec.reactAt) rec.reactAt = Math.max(rec.reactAt, rec.upAt + IMPACT.rise);
  }

  // Those lying under a car, as it stands now (its whole length, and a little to each side), are kept down a moment
  // longer each time it is looked at, until it has gone past them.
  function keepDown(rows, x, z, heading, front, now) {
    const ux = Math.sin(heading), uz = Math.cos(heading);
    const under = (px, pz) => { const a = (px - x) * ux + (pz - z) * uz, c = (px - x) * uz - (pz - z) * ux; return a > -front.tail - 0.6 && a < front.nose + 0.6 && Math.abs(c) < front.half + 0.6; };
    for (const [i, px, pz, pose] of rows) {
      if (pose !== POSE.lie || !under(px, pz) || !actors.has(i)) continue;
      const m = actors.get(i);
      if (m.dead || m.act !== 'Knocked down' || !book.npc[i]) continue;
      downLonger(i, book.npc[i], now + 1.2);
      // (a car going over them is not one standing on them: `pinnedUnder` counts from when one stands still)
      book.npc[i].pinnedSince = 0;
    }
    for (const id of Object.keys(players)) {
      const q = players[id];
      if (!q.down || now >= q.down.until || !under(q.x, q.z)) continue;
      q.down.until = Math.max(q.down.until, now + 1.2); q.down.upAt = q.down.until + IMPACT.rise;
    }
  }

  // A player's car standing over (x, z) now, driven or left standing (its whole length and width, and a little more),
  // or null.
  function carOver(x, z) {
    for (const id of Object.keys(players)) {
      const q = players[id];
      const cars = [];
      if (q.pcar && typeof q.incar === 'string' && q.incar.startsWith('pc:')) cars.push(q.pcar);
      if (q.carParked && typeof q.carParked === 'object') for (const [car, s] of Object.entries(q.carParked)) if (s) cars.push({ id: car, x: s.x, z: s.z, h: s.h });
      for (const c of cars) {
        const spec = POWER_CARS[c.id];
        if (!spec || !Number.isFinite(c.x) || Math.abs(c.x - x) > 6 || Math.abs(c.z - z) > 6) continue;
        const ux = Math.sin(c.h), uz = Math.cos(c.h);
        const a = (x - c.x) * ux + (z - c.z) * uz, s = (x - c.x) * uz - (z - c.z) * ux;
        if (Math.abs(a) < spec.length / 2 + 0.4 && Math.abs(s) < spec.width / 2 + 0.4) return { ...c, spec, a, s, ux, uz };
      }
    }
    return null;
  }

  // Someone knocked down by a car, about to get up: not under a car standing over them. Kept down a moment longer while
  // it stands there; after it has stood on them `pinned` seconds, out from under it to its nearer side (where there is
  // ground to lie on), to get up there.
  function pinnedUnder(i, rec, now) {
    const m = actors.get(i);
    if (!m || m.dead || m.act !== 'Knocked down') return;
    const c = carOver(m.x, m.z);
    if (!c) { rec.pinnedSince = 0; return; }
    if (!rec.pinnedSince) rec.pinnedSince = now;
    if (now - rec.pinnedSince < IMPACT.pinned) { downLonger(i, rec, now + 1.2); return; }
    const out = c.spec.width / 2 + 0.6;
    for (const side of c.s >= 0 ? [1, -1] : [-1, 1]) {
      const x = c.x + c.ux * c.a + c.uz * out * side, z = c.z + c.uz * c.a - c.ux * out * side;
      if (!zoneWalkable(x, z)) continue;
      m.x = x; m.z = z; rec.x = x; rec.z = z;
      return;
    }
  }

  // Run into by another player's car (31 October 2026, the owner's word: "Sometimes cars pass through characters
  // without jamming them"). Their car is seen here where their page says it is (talk.js), and this town's own player is
  // here: if it goes through where they stand, they are knocked down as by any car, and their page shows it and tells
  // the other's (link.js), which shows it too. How hard is judged by how fast it was seen to go here, from one word of it
  // to the next (never by what their page says its speed is); and where another page says its car is cannot be trusted
  // with a life, so nobody is brought below HEALTH.critical by it, nor knocked down by it more often than
  // `visitorEvery`. Nobody is charged for it here: the driver is in their own copy of the town.
  const seenCars = new Map();      // a visitor's id -> where their car was last seen to be, and when
  function visitorCars() {
    const now = real();
    const live = new Set();
    for (const v of visitors()) {
      const spec = v && v.car && POWER_CARS[v.car.car];
      if (!spec || !Number.isFinite(v.x) || !Number.isFinite(v.z)) continue;
      live.add(v.id);
      const was = seenCars.get(v.id);
      const h = Number.isFinite(v.heading) ? v.heading : 0;
      if (was && Math.hypot(v.x - was.x, v.z - was.z) < 0.01) continue;
      seenCars.set(v.id, { x: v.x, z: v.z, h, at: now });
      if (!was || now - was.at > 1.2) continue;
      const speed = Math.hypot(v.x - was.x, v.z - was.z) / Math.max(now - was.at, 1 / 30);
      // (slower than a crawl, it nudges nobody; faster than any car here, it was not driven there but put there)
      if (speed < IMPACT.crawl || speed > 60) continue;
      const ux = Math.sin(h), uz = Math.cos(h);
      const forward = (v.x - was.x) * ux + (v.z - was.z) * uz >= 0;
      const lead = forward ? spec.length / 2 : -spec.length / 2;
      const reach = spec.width / 2 + IMPACT.reach;
      for (const id of Object.keys(players)) {
        const q = players[id];
        if (!onFoot(q) || q.dead || q.swimming || q.custody) continue;
        if (nearestOnStep(was.x + ux * lead, was.z + uz * lead, v.x + ux * lead, v.z + uz * lead, q.x, q.z) > reach) continue;
        struckByVisitor(q, v, speed, forward ? h : h + Math.PI);
      }
    }
    for (const id of [...seenCars.keys()]) if (!live.has(id)) seenCars.delete(id);
  }
  function struckByVisitor(q, v, speed, heading) {
    const now = real();
    if (q.struckByVehicleAt !== undefined && now - q.struckByVehicleAt < IMPACT.grace) return;
    if (q.visitorStruckAt !== undefined && now - q.visitorStruckAt < IMPACT.visitorEvery) return;
    q.struckByVehicleAt = now; q.visitorStruckAt = now;
    const lying = !!q.down && now < q.down.until;
    const harm = Math.max(0, Math.min(Math.max(1, Math.round(harmAt(speed) * (lying ? IMPACT.downed : 1))), q.health - HEALTH.critical));
    const lost = harm > 0 ? conflict.injure(q, harm) : 0;
    if (lost > 0) { q.blood = Math.min(IMPACT.bleed.most, (q.blood && now - (q.bloodAt || 0) < 60 ? q.blood : 0) + lost * IMPACT.bleed.perHarm); q.bloodAt = now; }
    const weight = clamp((speed - IMPACT.least) / 7, 0, 1);
    const from = { x: q.x, z: q.z };
    if (lying) { q.down.until = Math.max(q.down.until, now + 2); q.down.upAt = q.down.until + IMPACT.rise; }
    else {
      const to = thrown(q.x, q.z, heading, IMPACT.throw[0] + (IMPACT.throw[1] - IMPACT.throw[0]) * weight);
      q.x = to.x; q.z = to.z; q.lastMoveAt = now;
      conflict.stop(q);
      const lie = IMPACT.down[0] + (IMPACT.down[1] - IMPACT.down[0]) * weight;
      q.down = { at: now, until: now + lie, upAt: now + lie + IMPACT.rise, by: v.id, h: heading, from, hard: weight > 0.6 };
    }
    emit(q.id, { type: 'alert', title: lying ? 'Run over' : 'Knocked down', text: `${v.name} ${lying ? 'drove over you' : 'hit you with a car'}. Health ${q.health}.` });
    show({ kind: 'knock', by: { kind: 'visitor', id: v.id }, on: { kind: 'player', id: q.id }, x: q.x, z: q.z, speed: Math.round(speed * 10) / 10, harm: lost, vehicle: 'car' });
  }

  // Is this vehicle still stopped by what it hit?
  const stalled = (holder) => real() < (holder.stalledUntil || 0);

  // --- time ------------------------------------------------------------------------

  function tick() {
    const now = real();
    visitorCars();
    for (const id of Object.keys(players)) {
      const p = players[id];
      if (p.down && now >= p.down.upAt) p.down = null;
      if (p.dead && now >= p.dead.wakeAt) revive(p);
      for (const other of Object.keys(p.involved)) if (now >= p.involved[other]) delete p.involved[other];
      if (p.involvedNpc && now >= p.involvedNpc.until) p.involvedNpc = null;
    }
    // the dead are taken away after a while; bruises mend: a townsperson not struck for two game hours is whole again
    for (const key of Object.keys(book.npc)) {
      const rec = book.npc[key];
      if (rec.dead) { if (!rec.dead.gone && now >= rec.dead.takeAt) { rec.dead.gone = true; actors.remove(Number(key)); } continue; }
      if (rec.reactAt && now >= rec.reactAt) { if (hub.reactions) hub.reactions.react(Number(key), rec.reactWith || 'hurt'); rec.reactAt = 0; }
      // knocked down by a car, and a player's car standing over them now (one stopped on top of them, or left there):
      // not up under it. They lie still while it stands there, `pinned` seconds at the most, and then crawl out from
      // under it to its nearer side and get up there.
      if (rec.upAt && now >= rec.upAt - 0.1 && rec.fall && rec.fall.car) pinnedUnder(Number(key), rec, now);
      // brought down (`felled`): up again, and a moment later off, away from whoever did it
      if (rec.upAt && now >= rec.upAt) { rec.upAt = 0; if (actors.has(Number(key)) && !actors.dead(Number(key))) actors.hold(Number(key), 'Getting up', POSE.stand, 0); }
      if (rec.then && now >= rec.then.at) { const th = rec.then; rec.then = null; if (th.release) { if (actors.has(Number(key)) && !actors.dead(Number(key))) actors.release(Number(key)); } else up(Number(key), th, now); }
      // (never while they are still down or getting up: the town's clock can be moved on hours at once, and they would
      // be left lying for ever)
      if (state.t - rec.t > (hub.span ? hub.span(7200) : 7200) && !rec.upAt && !rec.then) delete book.npc[key];
    }
  }

  // Brought down where they stand by a round (guns.js) or a hard blow (conflict.js): they fall (the figure's own fall,
  // drawn as for a vehicle: `fallen`), lie a few seconds, get up, and then run from whoever did it, or, badly hurt
  // (at 20), limp. A little blood is left under them each time. Not again within `refall` seconds of the last: just up,
  // they keep going. Returns whether they went down.
  function felled(i, { from = null, harm = 1 } = {}) {
    const now = real();
    const rec = book.npc[i] || (book.npc[i] = { at: -10, health: 100, t: state.t });
    if (rec.dead) return false;
    rec.t = state.t;
    rec.blood = Math.min(IMPACT.bleed.most, (rec.blood || 0) + Math.max(harm * IMPACT.bleed.perHarm, IMPACT.fallBlood * (rec.fellAt && now - rec.fellAt < IMPACT.refall ? 0.25 : 1)));
    if (now - (rec.fellAt === undefined ? -1e9 : rec.fellAt) < IMPACT.refall) return false;
    const m = actors.take(i, state.t);
    if (!m || m.pose === POSE.lie || m.pose === POSE.sit) return false;
    rec.fellAt = now; rec.at = now;
    rec.x = m.x; rec.z = m.z;
    if (from && Math.hypot(from.x - m.x, from.z - m.z) > 0.2) m.h = Math.atan2(from.x - m.x, from.z - m.z);
    const lie = IMPACT.down[0] + rng.next() * (IMPACT.down[1] - IMPACT.down[0]);
    actors.hold(i, 'Knocked down', POSE.lie, 0);
    m.after = 0;
    rec.upAt = now + lie;
    rec.then = { at: now + lie + IMPACT.rise + rng.next() * 0.4, from: from ? { x: from.x, z: from.z } : null };
    // (for the drawing: down backwards, away from the round, as a player goes down, falls.js)
    rec.fall = { at: now, lie, rise: IMPACT.rise, h: m.h };
    if (hub.reactions && hub.reactions.end) hub.reactions.end(i);
    return true;
  }
  function up(i, th, now) {
    if (!actors.has(i) || actors.dead(i)) return;
    const c = conflict.record(i);
    const hurt = !!c && c.health <= HEALTH.limp;
    if (c && c.mood === 'fighting') { actors.follow(i, { kind: 'player', id: c.by }, 1.2, PACE.hurry, 'Defending themselves'); return; }
    const from = th.from || { x: actors.get(i).x + 1, z: actors.get(i).z };
    if (hurt) { actors.flee(i, from.x, from.z, PACE.limp, 'Limping away, badly hurt', 10); return; }
    actors.flee(i, from.x, from.z, PACE.sprint, 'Running away', 28);
    actors.get(i).after = now + 16 + rng.next() * 10;
    if (hub.reactions) hub.reactions.react(i, 'flee', { seconds: 6, loop: true });
  }

  // Coming round. Someone in the hands of the police stays in them; anyone else wakes at the hospital door.
  function revive(p) {
    const was = p.dead;
    p.dead = null; p.down = null;
    conflict.heal(p, IMPACT.wake);
    if (!p.custody) { p.x = door.x; p.z = door.z; p.heading = 0; }
    p.lastMoveAt = real();
    emit(p.id, { type: 'critical', title: 'You came round', text: p.custody ? 'You are alive, and still in the hands of the police.' : `You were carried to the hospital after ${was.byName} ran you down. Your health is critical: go in and be treated.` });
  }

  // --- what a player is told -------------------------------------------------------

  function selfView(p) {
    const now = real();
    // whose health this player may see: only those they have just hit, or been hit by
    const involved = Object.keys(p.involved).filter((id) => players[id]).map((id) => ({ kind: 'player', id, name: players[id].name, health: players[id].health, dead: !!players[id].dead }));
    if (p.involvedNpc && book.npc[p.involvedNpc.i]) involved.push({ kind: 'npc', id: p.involvedNpc.i, name: p.involvedNpc.name, health: book.npc[p.involvedNpc.i].health, dead: !!book.npc[p.involvedNpc.i].dead });
    return {
      // (how long ago it began, how long on the ground and getting up, and from where: the page shows the fall and
      // the getting up from these, falls.js, and tells other players' pages, link.js; `id`, this fall's own number,
      // so that every word of it is known for the same fall however late it comes)
      down: p.down ? { rising: now >= p.down.until, left: Math.max(0, Number((p.down.upAt - now).toFixed(2))), h: p.down.h, ...(p.down.by === 'crash' ? { by: 'crash' } : {}), age: Math.max(0, Number((now - p.down.at).toFixed(3))), lie: Number((p.down.until - p.down.at).toFixed(3)), rise: Number((p.down.upAt - p.down.until).toFixed(3)), hard: !!p.down.hard || (p.down.into || 0) > 9, from: p.down.from ? { x: Math.round(p.down.from.x * 100) / 100, z: Math.round(p.down.from.z * 100) / 100 } : null, over: p.down.over || null, id: Math.round(p.down.at * 100) } : null,
      dead: p.dead ? { by: p.dead.byName, left: Math.max(0, Math.ceil(p.dead.wakeAt - now)), vehicle: p.dead.vehicle, age: Math.max(0, Number((now - p.dead.at).toFixed(3))), id: Math.round(p.dead.at * 100) } : null,
      involved,
    };
  }

  // How another player looks from outside: on the ground, getting up, dead. Never a number.
  const stanceOf = (q) => ({ down: !!q.down && real() < q.down.until, rising: !!q.down && real() >= q.down.until, dead: !!q.dead, fell: q.down ? q.down.h : q.dead ? 0 : null, ...(q.down ? { fallAge: real() - q.down.at, lie: q.down.until - q.down.at, rise: q.down.upAt - q.down.until, kind: q.down.by === 'crash' ? 'crash' : 'knock', hard: !!q.down.hard || (q.down.into || 0) > 9, over: q.down.over || null } : q.dead ? { fallAge: real() - q.dead.at, kind: 'dead' } : {}) });
  // May `p` be shown `q`'s health?
  const maySee = (p, q) => !!(p.involved[q.id] || (p.fight && p.fight.target.kind === 'player' && p.fight.target.id === q.id) || (q.fight && q.fight.target.kind === 'player' && q.fight.target.id === p.id));
  // What happened within sight, for everyone near to see and hear. How much it hurt is left out: that is nobody's business but theirs.
  const eventsNear = (x, z, range = 60) => book.events.filter((e) => Math.hypot(e.x - x, e.z - z) <= range).map((e) => ({ id: e.id, kind: e.kind, by: e.by, on: e.on, x: e.x, z: e.z, vehicle: e.vehicle }));
  // Townspeople lying where a vehicle left them (as against lying in a hospital bed), so they can be drawn on the ground.
  const fallen = () => Object.keys(book.npc).map(Number).filter((i) => { const m = actors.get(i); return !!m && m.pose === POSE.lie && (m.act === 'Knocked down' || m.dead); });
  // Townspeople brought down by a round or a hard blow (`felled`), near a point: [index, seconds since, seconds on the
  // ground, seconds getting up, the way they faced], for the drawing to show the fall and the getting up (falls.js)
  function falls(x, z, range = 80) {
    const now = real();
    const out = [];
    for (const key of Object.keys(book.npc)) {
      const f = book.npc[key].fall;
      if (!f) continue;
      if (now - f.at > f.lie + f.rise + 0.5) { book.npc[key].fall = null; continue; }
      const m = actors.get(Number(key));
      if (!m || Math.hypot(m.x - x, m.z - z) > range) continue;
      out.push([Number(key), Math.round((now - f.at) * 100) / 100, Math.round(f.lie * 100) / 100, f.rise, Math.round(f.h * 1000) / 1000]);
    }
    return out;
  }
  // Blood on the ground near a point: whoever is lying hurt or dead after a blow, how much they have bled, and how
  // long since. The drawing spreads a pool under each that grows while they lie there.
  function bleeding(x, z, range = 70) {
    const now = real();
    const out = [];
    for (const key of Object.keys(book.npc)) {
      const rec = book.npc[key];
      if (!rec.blood || rec.dead && rec.dead.gone) continue;
      const m = actors.get(Number(key));
      const lying = !!m && m.pose === POSE.lie;
      const bx = m ? m.x : rec.x, bz = m ? m.z : rec.z;
      if (!Number.isFinite(bx) || Math.hypot(bx - x, bz - z) > range) continue;
      out.push({ key: `n:${key}`, x: Math.round(bx * 100) / 100, z: Math.round(bz * 100) / 100, h: m ? m.h : 0, blood: rec.blood, lying, dead: !!rec.dead, since: Math.round((now - rec.at) * 10) / 10 });
    }
    for (const id of Object.keys(players)) {
      const q = players[id];
      if (!q.blood || now - (q.bloodAt || 0) > 90) continue;
      if (Math.hypot(q.x - x, q.z - z) > range) continue;
      out.push({ key: `p:${id}`, x: Math.round(q.x * 100) / 100, z: Math.round(q.z * 100) / 100, h: q.heading || 0, blood: q.blood, lying: !!q.down || !!q.dead, dead: !!q.dead, since: Math.round((now - q.bloodAt) * 10) / 10 });
    }
    return out;
  }

  // The driver sounds the horn: for a moment, everyone ahead looks up.
  function horn(driver) { driver.hornAt = real(); driver.horns = (driver.horns || 0) + 1; return {}; }

  const api = { clear, step, stalled, horn, tick, felled, falls, selfView, stanceOf, maySee, eventsNear, fallen, bleeding, onFoot, makeWay, record: (i) => book.npc[i] || null };
  hub.impact = api;
  return api;
}
