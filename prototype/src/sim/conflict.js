// Health and fighting.
//
// The simulation decides every blow: whether it was in reach, whether it was
// blocked or slipped, how much it hurt, and what the person struck does next.
// A client asks to swing; it is never told to believe its own result.
//
// Nobody dies of a fight and nobody is maimed. A player at or below a fifth of
// their health cannot fight and cannot be struck; a townsperson who has had
// enough sits down and is left alone. Children cannot be struck at all.
// (A vehicle is another matter: see impact.js. It can take a player's health
// to nothing, through `injure` here, which is the only way that happens.)
//
// Townspeople would rather not fight. Struck once, most plead and run; a few
// stand and warn. Struck again, those with the nerve for it defend
// themselves, and stop the moment the attacker backs off or is hurt enough.

import { GameError } from './registry.js';
import { zoneWalkable } from './zone.js';
import { POSE } from './population.js';
import { PACE } from './actors.js';

export const HEALTH = Object.freeze({
  max: 100,
  critical: 20,        // at or below this: no fighting, and nobody may strike you
  floor: 5,            // no blow takes a player below this
  restPerHour: 2,      // regained each game hour, out of a fight and above critical
  sleep: 30,           // regained by a night's sleep at home
  yield: 25,           // a townsperson at or below this has had enough
});

// range in metres, cooldown and recovery in real seconds, energy spent whether or not it lands
export const MOVES = Object.freeze({
  punch: Object.freeze({ id: 'punch', name: 'Punch', damage: 6, range: 1.7, cooldown: 0.45, energy: 1 }),
  heavy: Object.freeze({ id: 'heavy', name: 'Heavy punch', damage: 14, range: 1.7, cooldown: 1.1, energy: 3 }),
  kick: Object.freeze({ id: 'kick', name: 'Kick', damage: 10, range: 2.0, cooldown: 0.9, energy: 2, push: 0.7 }),
  shove: Object.freeze({ id: 'shove', name: 'Shove', damage: 2, range: 1.7, cooldown: 0.8, energy: 1, push: 1.6, stagger: 0.9 }),
  grab: Object.freeze({ id: 'grab', name: 'Grab', damage: 0, range: 1.4, cooldown: 1.6, energy: 2, hold: 1.6 }),
});

export const COMBAT = Object.freeze({
  engage: 6,               // metres within which someone can be squared up to
  leash: 16,               // a townsperson defending themselves does not chase further than this
  calm: 20,                // real seconds without being struck before they let it go
  recovery: 0.28,          // real seconds after any move before the next
  blockCut: 0.75, blockCutHeavy: 0.5, blockArc: 1.75,     // a block takes this share off a blow from the front (radians either side)
  dodgeWindow: 0.45, dodgeEvery: 1.0, dodgeStep: 1.6, dodgeEnergy: 2,
  regrab: 4,               // real seconds before someone let go can be grabbed again
  swing: Object.freeze([1.1, 1.8]),                        // real seconds between a townsperson's blows
  npcPunch: 5, npcHeavy: 10, npcKick: 8,
  minAge: 16,
  remember: 2 * 3600,      // game seconds a townsperson's bruises are kept
});

// [English, Nigerian Pidgin]
const LINES = Object.freeze({
  calm: [['Easy now. There is no need for that.', 'Take am easy. No be fight.'], ['My friend, go your way.', 'My friend, waka your way.'], ['I am not looking for trouble.', 'I no dey find trouble.']],
  plead: [['Please, leave me alone!', 'Abeg, leave me!'], ['What did I do to you?', 'Wetin I do you?'], ['I do not want trouble!', 'I no want wahala!']],
  warn: [['Do not touch me again.', 'No touch me again o.'], ['Try that once more and see.', 'Try am again, you go see.']],
  fight: [['Enough! You asked for it.', 'E don do! Na you find am.'], ['So you will not stop?', 'So you no go stop?']],
  yield: [['Enough, enough. I am done.', 'E don do, e don do.'], ['Stop. You have won.', 'Stop. You don win.']],
  done: [['Go. And do not come back.', 'Dey go. No come back.'], ['Let that be the end of it.', 'Make e end for here.']],
});

const angleGap = (a, b) => { let d = (a - b) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };

export function createConflict({ state, players, population, actors, talk, emit, rng, hub }) {
  if (!state.conflict) state.conflict = { npc: {}, firsts: {}, events: [], seq: 0 };
  const book = state.conflict;
  const people = population.people;
  const probe = {};
  const real = () => state.real;

  // players from saves made before anyone had health
  for (const id of Object.keys(players)) { const p = players[id]; if (!Number.isFinite(p.health)) p.health = HEALTH.max; if (p.fight === undefined) p.fight = null; }

  const critical = (p) => p.health <= HEALTH.critical;
  // Is this player's guard up right now?
  const guarding = (p, now) => !!(p.fight && p.fight.blocking && now >= p.fight.busyUntil);
  const whereNpc = (i) => population.locate(i, state.t, probe);

  // --- what is said --------------------------------------------------------------

  function speak(i, kind) {
    const who = people[i];
    const at = whereNpc(i);
    const pick = LINES[kind][Math.floor(rng.next() * LINES[kind].length)];
    const pidgin = who.langs.includes('pcm') && who.lang !== 'en';
    talk.say({ who: `n:${i}`, name: who.short, text: pidgin ? pick[1] : pick[0], lang: pidgin ? 'pcm' : 'en', gloss: pidgin ? pick[0] : null, x: at.x, z: at.z, kind: 'shout', range: 26, hold: 3.2 });
  }

  // Something that happened in a fight, for everyone near to see and hear.
  function show(event) {
    book.seq += 1;
    book.events.push({ id: book.seq, at: real(), ...event });
    if (book.events.length > 40) book.events.splice(0, book.events.length - 40);
  }

  // --- health ---------------------------------------------------------------------

  function goCritical(p) {
    p.fight = null;
    for (const key of Object.keys(book.npc)) { const rec = book.npc[key]; if (rec.by === p.id && rec.mood === 'fighting') settle(Number(key), rec, 'done'); }
    emit(p.id, { type: 'critical', title: 'Critical health', text: 'You cannot fight. Get to a hospital: walk, ride, or call an ambulance from your phone.' });
  }

  // Takes health off a player. Returns what was actually lost.
  function hurt(p, amount) {
    const before = p.health;
    p.health = Math.max(HEALTH.floor, Math.round(p.health - amount));
    p.struckAt = real();
    if (before > HEALTH.critical && p.health <= HEALTH.critical) goCritical(p);
    return before - p.health;
  }

  // Takes health off a player with no floor under it: what a vehicle does. Returns what was actually lost.
  function injure(p, amount) {
    const before = p.health;
    p.health = Math.max(0, Math.round(p.health - amount));
    p.struckAt = real();
    if (before > HEALTH.critical && p.health <= HEALTH.critical && p.health > 0) goCritical(p);
    return before - p.health;
  }

  // Sets a player's health after treatment. Only the hospital calls this.
  function heal(p, to) { p.health = Math.max(p.health, Math.min(HEALTH.max, Math.round(to))); return p.health; }

  // --- townspeople ----------------------------------------------------------------

  // How likely someone is to stand their ground, 0 to 1. The same person always has the same nerve.
  function nerve(i) {
    const who = people[i];
    let n = 0.45;
    const has = (t) => who.traits.includes(t);
    if (has('quick-tempered')) n += 0.3;
    if (has('proud')) n += 0.2;
    if (has('stern')) n += 0.15;
    if (has('shy')) n -= 0.3;
    if (has('gentle')) n -= 0.3;
    if (has('patient')) n -= 0.15;
    if (has('reserved')) n -= 0.1;
    if (who.job === 'police' || who.job === 'guard') n += 0.45;
    if (who.age > 55) n -= 0.25;
    if (who.age < 20) n -= 0.1;
    return Math.max(0, Math.min(1, n));
  }

  function npcRec(i, by) {
    let rec = book.npc[i];
    if (!rec || (by && rec.by !== by && rec.mood !== 'fighting')) { rec = { health: rec ? rec.health : HEALTH.max, hits: 0, by, firstAt: real(), lastAt: real(), mood: 'calm', swingAt: 0, heldUntil: 0, staggerUntil: 0, farSince: 0, at: state.t }; book.npc[i] = rec; }
    return rec;
  }

  // A townsperson is done with a fight: they walk back to their day, or sit where they are.
  function settle(i, rec, mood) {
    rec.mood = mood;
    if (mood === 'down') { actors.take(i, state.t); actors.hold(i, 'Sitting down, hurt', POSE.sit, real() + 25); speak(i, 'yield'); if (hub.reactions) hub.reactions.react(i, rng.next() < 0.5 ? 'cry' : 'sad', { seconds: 25, upper: true, loop: true }); } else { if (mood === 'done') speak(i, 'done'); if (actors.has(i)) actors.release(i); }
  }

  // What someone does on being struck. `rec.hits` already counts this blow.
  function react(i, rec, attacker) {
    const n = nerve(i) + (real() < rec.heldUntil ? 0.2 : 0);
    actors.take(i, state.t);
    if (rec.health <= HEALTH.yield) { settle(i, rec, 'down'); if (hub.justice) hub.justice.worsen(rec.crime, 'assault_serious'); return 'down'; }
    if (rec.mood === 'fighting') return 'fighting';
    if (people[i].job === 'police' || (rec.hits >= 2 && (n >= 0.45 || rec.mood === 'warned')) || (rec.hits === 1 && n >= 0.95)) {
      rec.mood = 'fighting'; rec.swingAt = real() + 0.7;
      actors.follow(i, { kind: 'player', id: attacker.id }, 1.2, PACE.hurry, 'Defending themselves');
      speak(i, 'fight');
      if (hub.reactions) hub.reactions.react(i, 'box');
      return 'fighting';
    }
    if (rec.hits === 1 && n >= 0.75) {
      rec.mood = 'warned';
      actors.hold(i, 'Standing their ground', POSE.stand, real() + 8);
      const m = actors.get(i); if (m) m.h = Math.atan2(attacker.x - m.x, attacker.z - m.z);
      speak(i, 'warn');
      if (hub.reactions) hub.reactions.react(i, rng.next() < 0.5 ? 'box' : 'stomp');
      return 'warned';
    }
    rec.mood = 'fled';
    actors.flee(i, attacker.x, attacker.z, rec.hits >= 2 ? PACE.sprint : PACE.run, 'Running away');
    speak(i, 'plead');
    // struck and frightened: a moment of fear, or hurt, and then they run with their arms going
    if (hub.reactions) hub.reactions.react(i, 'flee', { seconds: 6, loop: true });
    return 'fled';
  }

  // --- a player's moves -----------------------------------------------------------

  function targetOf(p, target) {
    if (!target || (target.kind !== 'npc' && target.kind !== 'player')) throw new GameError('NO_TARGET', 'There is nobody there to face.');
    if (target.kind === 'player') {
      const q = players[target.id];
      if (!q || q.id === p.id) throw new GameError('NO_TARGET', 'There is nobody there to face.');
      return { kind: 'player', id: q.id, player: q, x: q.x, z: q.z, name: q.name };
    }
    const i = Number(target.id);
    if (!Number.isInteger(i) || i < 0 || i >= population.count) throw new GameError('NO_TARGET', 'There is nobody there to face.');
    const at = whereNpc(i);
    if (at.pose === POSE.hidden || at.pose === POSE.ride) throw new GameError('NO_TARGET', 'There is nobody there to face.');
    return { kind: 'npc', id: i, x: at.x, z: at.z, name: people[i].short, lying: at.pose === POSE.lie };
  }

  function mayFight(p) {
    if (critical(p)) throw new GameError('CRITICAL', 'Your health is critical. You cannot fight.');
    if (p.custody) throw new GameError('IN_CUSTODY', 'You are in the hands of the police.');
    if (p.driving || (p.riding !== null && p.riding !== undefined) || (p.astride !== null && p.astride !== undefined) || p.incar) throw new GameError('NOT_ON_FOOT', 'You cannot fight from a vehicle.');
    if (p.carried) throw new GameError('CARRIED', 'You are in the ambulance.');
    if (p.swimming) throw new GameError('SWIMMING', 'You are in the river.');
  }

  function engage(p, target) {
    mayFight(p);
    const who = targetOf(p, target);
    if (Math.hypot(who.x - p.x, who.z - p.z) > COMBAT.engage) throw new GameError('TOO_FAR', 'You are too far away. Walk closer.');
    if (who.kind === 'npc') {
      if (people[who.id].age < COMBAT.minAge) throw new GameError('A_CHILD', 'That is a child. You will not.');
      if (who.lying) throw new GameError('NO_TARGET', 'They are lying down. Leave them be.');
      const rec = book.npc[who.id];
      if (rec && rec.mood === 'down') throw new GameError('TARGET_DOWN', `${who.name} has had enough. Leave them.`);
      if (!rec || rec.mood === 'calm') { actors.take(who.id, state.t); actors.hold(who.id, 'Keeping an eye on you', POSE.stand, real() + 2.5); const m = actors.get(who.id); if (m) m.h = Math.atan2(p.x - m.x, p.z - m.z); speak(who.id, 'calm'); }
    } else {
      if (critical(who.player) || who.player.down || who.player.dead) throw new GameError('TARGET_DOWN', `${who.name} is badly hurt. Leave them.`);
      emit(who.id, { type: 'note', text: `${p.name} is squaring up to you. You can walk away, or stand and fight.` });
    }
    p.fight = { target: { kind: who.kind, id: who.id }, since: real(), ready: {}, busyUntil: 0, blocking: false, dodgeUntil: 0, dodgeReady: 0 };
    p.heading = Math.atan2(who.x - p.x, who.z - p.z);
    return { fighting: true, target: { kind: who.kind, id: who.id, name: who.name } };
  }

  function disengage(p) {
    if (!p.fight) return { fighting: false };
    if (real() < (p.heldUntil || 0)) throw new GameError('HELD', 'You are being held. Shove them off first.');
    p.fight = null;
    return { fighting: false };
  }

  // Moves someone back from a point by up to `metres`, as far as the ground allows.
  function pushed(fromX, fromZ, x, z, metres) {
    const d = Math.hypot(x - fromX, z - fromZ) || 1;
    const ux = (x - fromX) / d, uz = (z - fromZ) / d;
    for (let m = metres; m > 0.15; m -= 0.25) if (zoneWalkable(x + ux * m, z + uz * m)) return { x: x + ux * m, z: z + uz * m };
    return { x, z };
  }

  function act(p, move) {
    const f = p.fight;
    if (!f) throw new GameError('NOT_FIGHTING', 'You are not squared up to anyone.');
    mayFight(p);
    const def = MOVES[move];
    if (!def) throw new GameError('NO_MOVE', 'There is no such move.');
    const now = real();
    // whether they may be struck at all comes before whether this swing is ready
    const who = targetOf(p, f.target);
    if (who.kind === 'npc' && book.npc[who.id] && book.npc[who.id].mood === 'down') throw new GameError('TARGET_DOWN', `${who.name} has had enough. Leave them.`);
    if (who.kind === 'player' && who.player.swimming) throw new GameError('NO_TARGET', `${who.name} is in the river.`);
    if (who.kind === 'player' && critical(who.player)) throw new GameError('TARGET_DOWN', `${who.name} is badly hurt. Leave them.`);
    if (now < (p.heldUntil || 0) && move !== 'shove') throw new GameError('HELD', 'You are being held. Shove them off first.');
    if (now < (p.staggerUntil || 0)) throw new GameError('STAGGERED', 'You are off balance.');
    if (now < f.busyUntil || now < (f.ready[move] || 0)) throw new GameError('NOT_READY', 'Not yet.');
    if (p.energy < def.energy) throw new GameError('TIRED', 'You are too tired to swing. Eat or rest.');

    f.ready[move] = now + def.cooldown;
    f.busyUntil = now + COMBAT.recovery;        // and for that long the guard is down
    p.energy = Math.max(0, p.energy - def.energy);
    const d = Math.hypot(who.x - p.x, who.z - p.z);
    if (d > 0.05) p.heading = Math.atan2(who.x - p.x, who.z - p.z);
    const out = { move, hit: false, blocked: false, damage: 0, target: { kind: who.kind, id: who.id, name: who.name }, energy: p.energy };
    const shown = { kind: move, from: `p:${p.id}`, to: who.kind === 'npc' ? `n:${who.id}` : `p:${who.id}`, x: who.x, z: who.z, hit: false, blocked: false };
    if (d > def.range) { out.reason = 'out of reach'; show({ ...shown, kind: 'miss' }); return out; }
    p.held = null;

    if (who.kind === 'npc') {
      const i = who.id;
      const rec = npcRec(i, p.id);
      let damage = def.damage;
      if (rec.mood === 'fighting' && now >= rec.heldUntil) {
        const roll = rng.next();
        if (roll < 0.12) { out.reason = 'slipped'; show({ ...shown, kind: 'miss' }); return out; }
        if (roll < 0.42) { out.blocked = true; damage = Math.round(damage * (1 - (move === 'heavy' ? COMBAT.blockCutHeavy : COMBAT.blockCut))); }
      }
      rec.by = p.id; rec.hits += 1; rec.lastAt = now; rec.at = state.t;
      rec.health = Math.max(HEALTH.critical, rec.health - damage);
      out.hit = true; out.damage = damage; out.targetHealth = rec.health;
      actors.take(i, state.t);
      const m = actors.get(i);
      if (def.push && m) { const to = pushed(p.x, p.z, m.x, m.z, def.push); m.x = to.x; m.z = to.z; }
      if (def.stagger) { rec.staggerUntil = now + def.stagger; rec.swingAt = Math.max(rec.swingAt, now + def.stagger); }
      if (def.hold && now >= (rec.grabFreeAt || 0)) { rec.heldUntil = now + def.hold; rec.grabFreeAt = now + def.hold + COMBAT.regrab; out.held = true; if (m && rec.mood !== 'fighting') actors.hold(i, 'Held', POSE.stand, now + def.hold); }
      // the law: striking someone is an offence from the first blow that lands
      if (hub.justice && def.id !== 'grab') { const crime = hub.justice.offence(p, 'assault', { victim: { kind: 'npc', id: i, name: people[i].name }, x: who.x, z: who.z, crime: rec.crime && real() - rec.firstAt < 90 ? rec.crime : null }); rec.crime = crime ? crime.id : rec.crime; if (crime && crime.isNew) rec.firstAt = now; }
      out.reaction = def.id === 'grab' && rec.hits === 1 && !out.held ? rec.mood : react(i, rec, p);
      // kicked and not fighting back: it hurts first, and then they go (or sit and cry)
      if (hub.reactions && def.id === 'kick' && out.reaction === 'fled') hub.reactions.react(i, 'hurt');
      if (hub.reactions && def.id !== 'grab') hub.reactions.witnessed(who.x, who.z, [i]);
      show({ ...shown, hit: true, blocked: out.blocked });
      return out;
    }

    // another player
    const q = who.player;
    const qf = q.fight;
    if (qf && now < qf.dodgeUntil) { out.reason = 'slipped'; show({ ...shown, kind: 'miss' }); return out; }
    let damage = def.damage;
    const facing = Math.abs(angleGap(Math.atan2(p.x - q.x, p.z - q.z), q.heading)) < COMBAT.blockArc;
    if (guarding(q, now) && facing) { out.blocked = true; damage = Math.round(damage * (1 - (move === 'heavy' ? COMBAT.blockCutHeavy : COMBAT.blockCut))); }
    // who started it: the first to land a blow on the other within the last minute and a half
    const pair = [p.id, q.id].sort().join('|');
    const first = book.firsts[pair];
    const aggressor = first && now - first.at < 90 ? first.by : p.id;
    if (!first || now - first.at >= 90) book.firsts[pair] = { by: p.id, at: now, crime: null }; else first.at = now;
    out.hit = true;
    out.damage = hurt(q, damage);
    out.targetHealth = q.health;
    if (def.push) { const to = pushed(p.x, p.z, q.x, q.z, def.push); q.x = to.x; q.z = to.z; q.lastMoveAt = now; }
    if (def.stagger) q.staggerUntil = now + def.stagger;
    if (def.hold && now >= (q.grabFreeAt || 0)) { q.heldUntil = now + def.hold; q.grabFreeAt = now + def.hold + COMBAT.regrab; q.held = p.id; out.held = true; }
    if (move === 'shove') { p.heldUntil = 0; }
    if (aggressor === p.id && hub.justice && def.id !== 'grab') {
      const entry = book.firsts[pair];
      const crime = hub.justice.offence(p, 'assault', { victim: { kind: 'player', id: q.id, name: q.name }, x: q.x, z: q.z, crime: entry.crime || null });
      if (crime) { entry.crime = crime.id; if (critical(q)) hub.justice.worsen(crime.id, 'assault_serious'); }
    }
    emit(q.id, { type: 'struck', by: p.name, move, damage: out.damage, health: q.health, blocked: out.blocked });
    show({ ...shown, hit: true, blocked: out.blocked });
    return out;
  }

  function block(p, on) {
    if (!p.fight) throw new GameError('NOT_FIGHTING', 'You are not squared up to anyone.');
    // the guard is held up for as long as it is asked for; it counts except in the moment after a swing
    p.fight.blocking = !!on;
    return { blocking: guarding(p, real()), held: p.fight.blocking };
  }

  // A quick step out of the way: for a moment nothing lands.
  function dodge(p, { dx = 0, dz = 0 } = {}) {
    const f = p.fight;
    if (!f) throw new GameError('NOT_FIGHTING', 'You are not squared up to anyone.');
    mayFight(p);
    const now = real();
    if (now < (p.heldUntil || 0)) throw new GameError('HELD', 'You are being held. Shove them off first.');
    if (now < f.dodgeReady) throw new GameError('NOT_READY', 'Not yet.');
    if (p.energy < COMBAT.dodgeEnergy) throw new GameError('TIRED', 'You are too tired.');
    p.energy -= COMBAT.dodgeEnergy;
    f.dodgeReady = now + COMBAT.dodgeEvery;
    f.dodgeUntil = now + COMBAT.dodgeWindow;
    let ux = Number(dx) || 0, uz = Number(dz) || 0;
    const len = Math.hypot(ux, uz);
    if (len < 0.1) { ux = -Math.sin(p.heading); uz = -Math.cos(p.heading); } else { ux /= len; uz /= len; }     // straight back, if no way was given
    for (let m = COMBAT.dodgeStep; m > 0.2; m -= 0.3) if (zoneWalkable(p.x + ux * m, p.z + uz * m)) { p.x += ux * m; p.z += uz * m; break; }
    p.lastMoveAt = now;
    show({ kind: 'dodge', from: `p:${p.id}`, to: null, x: p.x, z: p.z, hit: false, blocked: false });
    return { x: p.x, z: p.z, until: f.dodgeUntil, energy: p.energy };
  }

  // --- time -------------------------------------------------------------------------

  function tick(dt) {
    const now = real();
    for (const key of Object.keys(book.npc)) {
      const i = Number(key);
      const rec = book.npc[key];
      if (rec.mood !== 'fighting') {
        if (state.t - rec.at > (hub.span ? hub.span(COMBAT.remember) : COMBAT.remember) && !actors.has(i)) delete book.npc[key];
        continue;
      }
      const p = players[rec.by];
      if (!p || critical(p) || p.custody || p.driving || p.carried) { settle(i, rec, 'done'); continue; }
      const m = actors.get(i);
      if (!m) { rec.mood = 'done'; continue; }
      const d = Math.hypot(p.x - m.x, p.z - m.z);
      if (d > COMBAT.leash) { if (!rec.farSince) rec.farSince = now; } else rec.farSince = 0;
      if (now - rec.lastAt > COMBAT.calm || (rec.farSince && now - rec.farSince > 4)) { settle(i, rec, 'done'); continue; }
      if (d > MOVES.punch.range || now < rec.swingAt || now < rec.heldUntil || now < rec.staggerUntil) continue;
      // a blow back
      const roll = rng.next();
      const heavy = roll < 0.25;
      // some kick (on the townsperson's own dice, so the rest of a fight goes as it always did)
      const kick = !heavy && hub.reactions && hub.reactions.pick([0, 0, 0, 1]) === 1;
      rec.swingAt = now + COMBAT.swing[0] + rng.next() * (COMBAT.swing[1] - COMBAT.swing[0]);
      const f = p.fight;
      if (hub.reactions) hub.reactions.react(i, kick ? 'kick' : heavy ? 'punch' : 'jab');
      const shown = { kind: kick ? 'kick' : heavy ? 'heavy' : 'punch', from: `n:${i}`, to: `p:${p.id}`, x: p.x, z: p.z, hit: false, blocked: false };
      if (f && now < f.dodgeUntil) { show({ ...shown, kind: 'miss' }); continue; }
      let damage = kick ? COMBAT.npcKick : heavy ? COMBAT.npcHeavy : COMBAT.npcPunch;
      const facing = Math.abs(angleGap(Math.atan2(m.x - p.x, m.z - p.z), p.heading)) < COMBAT.blockArc;
      const blocked = guarding(p, now) && facing;
      if (blocked) damage = Math.round(damage * (1 - (heavy ? COMBAT.blockCutHeavy : COMBAT.blockCut)));
      const lost = hurt(p, damage);
      emit(p.id, { type: 'struck', by: people[i].short, move: kick ? 'kick' : heavy ? 'heavy' : 'punch', damage: lost, health: p.health, blocked });
      show({ ...shown, hit: true, blocked });
    }
    // a hold that has run out lets go
    for (const id of Object.keys(players)) { const p = players[id]; if (p.held && now >= (p.heldUntil || 0)) p.held = null; }
    while (book.events.length && now - book.events[0].at > 4) book.events.shift();
  }

  // once a game hour: bruises mend, slowly, for anyone not in a fight and not badly hurt
  function hourly() {
    for (const id of Object.keys(players)) {
      const p = players[id];
      if (p.fight || critical(p) || p.health >= HEALTH.max) continue;
      if (real() - (p.struckAt || -1e9) < 30) continue;
      p.health = Math.min(HEALTH.max, p.health + HEALTH.restPerHour);
    }
    for (const key of Object.keys(book.npc)) { const rec = book.npc[key]; if (rec.mood !== 'fighting') rec.health = Math.min(HEALTH.max, rec.health + 6); }
  }

  // What a player may know of their own state in a fight.
  function selfView(p) {
    const f = p.fight;
    const now = real();
    let target = null;
    if (f) {
      if (f.target.kind === 'npc') { const rec = book.npc[f.target.id]; const at = whereNpc(f.target.id); target = { kind: 'npc', id: f.target.id, name: people[f.target.id].short, health: rec ? rec.health : HEALTH.max, mood: rec ? rec.mood : 'calm', x: at.x, z: at.z }; } else { const q = players[f.target.id]; target = q ? { kind: 'player', id: q.id, name: q.name, health: q.health, mood: q.fight ? 'fighting' : 'calm', x: q.x, z: q.z } : null; }
    }
    return {
      health: p.health, critical: critical(p),
      fight: f ? { target, blocking: guarding(p, now), ready: Object.fromEntries(Object.keys(MOVES).map((k) => [k, Math.max(0, Number(((f.ready[k] || 0) - now).toFixed(2)))])), dodgeIn: Math.max(0, Number((f.dodgeReady - now).toFixed(2))), held: now < (p.heldUntil || 0), staggered: now < (p.staggerUntil || 0) } : null,
      // anyone still coming at you, whether or not you are squared up
      against: Object.keys(book.npc).filter((k) => book.npc[k].by === p.id && book.npc[k].mood === 'fighting').map(Number),
    };
  }

  // Fights within sight, for the client to animate and sound.
  function eventsNear(x, z, range = 60) { return book.events.filter((e) => Math.hypot(e.x - x, e.z - z) <= range); }

  // The state of the townspeople a player has struck, for whoever draws them.
  function moods(x, z, range = 40) {
    const out = [];
    for (const key of Object.keys(book.npc)) { const rec = book.npc[key]; if (rec.mood === 'calm') continue; const at = whereNpc(Number(key)); if (Math.hypot(at.x - x, at.z - z) <= range) out.push({ i: Number(key), mood: rec.mood, health: rec.health }); }
    return out;
  }

  // The police, or anything else that ends a fight outright.
  function stop(p) {
    p.fight = null;
    for (const key of Object.keys(book.npc)) { const rec = book.npc[key]; if (rec.by === p.id && rec.mood === 'fighting') { rec.mood = 'done'; if (actors.has(Number(key))) actors.release(Number(key)); } }
  }

  const api = { engage, disengage, act, block, dodge, tick, hourly, hurt, injure, heal, critical, selfView, eventsNear, moods, stop, nerve, record: (i) => book.npc[i] || null };
  hub.conflict = api;
  return api;
}
