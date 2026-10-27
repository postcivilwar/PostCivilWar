// Health and fighting.
//
// The simulation decides every blow: whether it was in reach, whether it was
// blocked or slipped, how much it hurt, and what the person struck does next.
// A client asks to swing; it is never told to believe its own result.
//
// Nobody dies of a fight and nobody is maimed. A player at or below a fifth of
// their health cannot fight and cannot be struck; a townsperson who has had
// enough sits down and is left alone. Children cannot be struck at all.
// The 20-life rule (the owner's brief of 22 October 2026): when anyone's life reaches 20, from a blow, a round or a
// vehicle, it goes no lower until they are treated; nobody can fight them or shoot them, and they can neither fight nor
// shoot. Nobody dies: a vehicle that would once have killed leaves them at 20 (impact.js, through `injure` here), and
// the ambulance is sent for them (care.js).
//
// Townspeople would rather not fight. Struck once, most plead and run; a few
// stand and warn. Struck again, they defend themselves, and stop the moment the
// attacker backs off or is hurt enough.
// (27 October 2026, the owner's brief for his townspeople: "When a player attacks an NPC for the first time, the NPC
// usually tries to get away. If the player attacks the same NPC again, it fights back. After a few seconds of fighting,
// NPCs give up and walk away. Make it a little different each time." And the 20-life rule for them too: at 20 nobody
// can hurt them, they limp slowly, and their life comes back slowly to 100.)

import { GameError } from './registry.js';
import { zoneWalkable } from './zone.js';
import { POSE } from './population.js';
import { PACE } from './actors.js';

export const HEALTH = Object.freeze({
  max: 100,
  critical: 20,        // at or below this: no fighting, and nobody may strike you
  floor: 20,           // nothing takes a player below this until they are treated: a blow, a round, a vehicle (the 20-life rule)
  restPerHour: 2,      // regained each game hour, out of a fight and above critical
  sleep: 30,           // regained by a night's sleep at home
  yield: 25,           // (until 27 October 2026, a townsperson at or below this had had enough: now it is 20, `critical`)
  // a townsperson (27 October 2026): at 20 they limp off, stand a while (real seconds, each time its own), then go back
  // to their day still limping, and their life comes back a point every `mend` real seconds; they limp while it is
  // at or below `limp`
  hurtFor: Object.freeze([40, 80]),
  mend: 3,
  limp: 30,
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
  fightFor: Object.freeze([6, 14]),                        // real seconds a townsperson fights back before giving up (each fight its own)
  backAfter: Object.freeze([12, 24]),                      // real seconds after running off before going back to their day
  fell: 0.35,                                              // the chance that a heavy punch or a kick that lands unblocked puts someone down
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

  // (the 22 October brief's words, calmly: "You are badly hurt. An ambulance is on its way." The ambulance is sent for
  // them at once, free, care.js; until it can be, they are told it will come)
  function goCritical(p) {
    p.fight = null;
    for (const key of Object.keys(book.npc)) { const rec = book.npc[key]; if (rec.by === p.id && (rec.mood === 'fighting' || rec.mood === 'shooting')) settle(Number(key), rec, 'done'); }
    if (hub.guns) hub.guns.holster(p);
    const sent = hub.care && hub.care.summon ? hub.care.summon(p) : false;
    emit(p.id, { type: 'critical', title: 'Badly hurt', text: sent ? 'You are badly hurt. An ambulance is on its way.' : 'You are badly hurt. An ambulance will come for you as soon as one can.' });
  }

  // Takes health off a player. Returns what was actually lost.
  function hurt(p, amount) {
    const before = p.health;
    p.health = Math.max(Math.min(before, HEALTH.floor), Math.round(p.health - amount));
    p.struckAt = real();
    if (before > HEALTH.critical && p.health <= HEALTH.critical) goCritical(p);
    return before - p.health;
  }

  // Takes health off a player for what a vehicle does to them. (Until 25 October 2026 this had no floor and a vehicle
  // could kill; under the 20-life rule it stops at 20 as everything else does.) Returns what was actually lost.
  function injure(p, amount) {
    const before = p.health;
    p.health = Math.max(Math.min(before, HEALTH.floor), Math.round(p.health - amount));
    p.struckAt = real();
    if (before > HEALTH.critical && p.health <= HEALTH.critical) goCritical(p);
    return before - p.health;
  }

  // Takes health off a player for a round that hit them (guns.js): never below the floor. Returns what was lost.
  function shot(p, amount) {
    const before = p.health;
    p.health = Math.max(Math.min(before, HEALTH.floor), Math.round(p.health - Math.max(0, amount)));
    p.struckAt = real();
    if (before > HEALTH.critical && p.health <= HEALTH.critical) goCritical(p);
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

  const between = (range) => range[0] + rng.next() * (range[1] - range[0]);

  // A townsperson is done with a fight. Badly hurt (at 20): they limp away from whoever did it, slowly, stand a
  // while, hurt, and then go back to their day, still limping (tick, below). Otherwise they give up and go: each time a little
  // differently, walking back to their day, walking off, or hurrying off.
  function settle(i, rec, mood, from = null) {
    rec.mood = mood;
    if (mood === 'down') {
      const m = actors.take(i, state.t);
      rec.hurtUntil = real() + between(HEALTH.hurtFor);
      const away = from || players[rec.by] || null;
      if (m) { m.after = 0; if (away) actors.flee(i, away.x, away.z, PACE.limp, 'Limping away, badly hurt', 10); else actors.hold(i, 'Badly hurt', POSE.stand, 0); }
      speak(i, 'yield');
      if (hub.reactions) hub.reactions.react(i, 'hurt');
      return;
    }
    if (mood === 'done') speak(i, 'done');
    if (!actors.has(i)) return;
    const p = players[rec.by];
    const roll = rng.next();
    const m = actors.get(i);
    if (mood === 'done' && p && roll < 0.3) { actors.flee(i, p.x, p.z, PACE.walk, 'Walking away', 10 + roll * 30); m.after = real() + between(COMBAT.backAfter); }
    else if (mood === 'done' && p && roll < 0.45) { actors.flee(i, p.x, p.z, PACE.hurry, 'Hurrying away', 16); m.after = real() + between(COMBAT.backAfter); }
    else actors.release(i, mood === 'done' ? 'Walking away' : '', rec.health <= HEALTH.limp ? PACE.limp : PACE.walk);
  }

  // What someone does on being struck. `rec.hits` already counts this blow.
  function react(i, rec, attacker) {
    const n = nerve(i) + (real() < rec.heldUntil ? 0.2 : 0);
    actors.take(i, state.t);
    if (rec.health <= HEALTH.critical) { if (rec.mood !== 'down') settle(i, rec, 'down', attacker); if (hub.justice) hub.justice.worsen(rec.crime, 'assault_serious'); return 'down'; }
    if (rec.mood === 'fighting') return 'fighting';
    // struck again, anyone fights back (and a very few at the first blow); for a few seconds, each fight its own
    if (people[i].job === 'police' || rec.hits >= 2 || (rec.hits === 1 && n >= 0.95)) {
      rec.mood = 'fighting'; rec.swingAt = real() + 0.4 + rng.next() * 0.6;
      rec.fightUntil = people[i].job === 'police' ? 0 : real() + between(COMBAT.fightFor);
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
    { const m = actors.get(i); if (m) m.after = real() + between(COMBAT.backAfter); }
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
      if (rec && (rec.mood === 'down' || rec.health <= HEALTH.critical)) throw new GameError('TARGET_DOWN', `${who.name} has had enough. Leave them.`);
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
    if (who.kind === 'npc' && book.npc[who.id] && (book.npc[who.id].mood === 'down' || book.npc[who.id].health <= HEALTH.critical)) throw new GameError('TARGET_DOWN', `${who.name} has had enough. Leave them.`);
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
      // (an officer at 20 is out of it: she sits down, hurt; the 20-life rule)
      if (people[i].job === 'police' && rec.health <= HEALTH.critical && rec.mood !== 'down') { settle(i, rec, 'down'); if (hub.guns && hub.guns.officerDown) hub.guns.officerDown(i); }
      actors.take(i, state.t);
      const m = actors.get(i);
      if (def.push && m) { const to = pushed(p.x, p.z, m.x, m.z, def.push); m.x = to.x; m.z = to.z; }
      if (def.stagger) { rec.staggerUntil = now + def.stagger; rec.swingAt = Math.max(rec.swingAt, now + def.stagger); }
      if (def.hold && now >= (rec.grabFreeAt || 0)) { rec.heldUntil = now + def.hold; rec.grabFreeAt = now + def.hold + COMBAT.regrab; out.held = true; if (m && rec.mood !== 'fighting') actors.hold(i, 'Held', POSE.stand, now + def.hold); }
      // the law: striking someone is an offence from the first blow that lands
      if (hub.justice && def.id !== 'grab') { const crime = hub.justice.offence(p, 'assault', { victim: { kind: 'npc', id: i, name: people[i].name }, x: who.x, z: who.z, crime: rec.crime && real() - rec.firstAt < 90 ? rec.crime : null }); rec.crime = crime ? crime.id : rec.crime; if (crime && crime.isNew) rec.firstAt = now; }
      out.reaction = def.id === 'grab' && rec.hits === 1 && !out.held ? rec.mood : react(i, rec, p);
      // hit hard and not fighting back: now and then it puts them down (they fall, lie a moment, get up and run:
      // impact.js `felled`); otherwise a kick hurts first, and then they go
      if ((def.id === 'heavy' || def.id === 'kick') && !out.blocked && out.reaction === 'fled' && hub.impact && rng.next() < COMBAT.fell && hub.impact.felled(i, { from: { x: p.x, z: p.z }, harm: damage })) out.fell = true;
      else if (hub.reactions && def.id === 'kick' && out.reaction === 'fled') hub.reactions.react(i, 'hurt');
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
        after(i, rec, now, dt);
        if (state.t - rec.at > (hub.span ? hub.span(COMBAT.remember) : COMBAT.remember) && !actors.has(i)) delete book.npc[key];
        continue;
      }
      const p = players[rec.by];
      if (!p || critical(p) || p.custody || p.driving || p.carried) { settle(i, rec, 'done'); continue; }
      const m = actors.get(i);
      if (!m) { rec.mood = 'done'; continue; }
      // a few seconds of it, and they have had enough of fighting: they give up and go
      if (rec.fightUntil && now >= rec.fightUntil) { rec.fightUntil = 0; settle(i, rec, 'done'); continue; }
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

  // After a fight, or a round (guns.js), or a fall: someone badly hurt has limped off; where they stop they stand a
  // while, hurt, and then go back to their day, still limping. Their life comes back slowly, a point at a time, once nobody
  // has struck them for a while. (An officer shooting back, or out on a call, is the police's own: guns.js, justice.js.)
  function after(i, rec, now, dt) {
    const m = actors.get(i);
    const theirs = rec.mood !== 'shooting' && !(hub.justice && hub.justice.onDuty && hub.justice.onDuty(i));
    if (rec.mood === 'down' && m && theirs && !m.dead) {
      if (now < rec.hurtUntil) {
        // (standing a while to get their breath, bent over, hurt: there is nothing to sit on in the street)
        if (m.mode === 'hold' && m.arrived && m.act !== 'Resting, badly hurt') {
          actors.hold(i, 'Resting, badly hurt', POSE.stand, 0);
          if (hub.reactions) hub.reactions.react(i, rng.next() < 0.5 ? 'cry' : 'sad', { seconds: Math.max(4, rec.hurtUntil - now), loop: true });
        }
      } else if (m.mode === 'hold' && m.pose !== POSE.lie) {
        rec.mood = 'mending';
        if (hub.reactions && hub.reactions.end) hub.reactions.end(i);
        actors.release(i, 'Going back, hurt', rec.health <= HEALTH.limp ? PACE.limp : PACE.walk);
      }
    }
    if (now < (rec.hurtUntil || 0) || now - rec.lastAt < 10 || rec.health >= HEALTH.max || rec.mood === 'shooting' || rec.mood === 'fighting') return;
    rec.mend = (rec.mend || 0) + dt / HEALTH.mend;
    while (rec.mend >= 1 && rec.health < HEALTH.max) { rec.health += 1; rec.mend -= 1; }
    if (rec.health >= HEALTH.max) rec.mend = 0;
  }

  // once a game hour: bruises mend, slowly, for anyone not in a fight and not badly hurt
  function hourly() {
    for (const id of Object.keys(players)) {
      const p = players[id];
      if (p.fight || critical(p) || p.health >= HEALTH.max) continue;
      if (real() - (p.struckAt || -1e9) < 30) continue;
      p.health = Math.min(HEALTH.max, p.health + HEALTH.restPerHour);
    }
    // (a townsperson's bruises mend by the second, `after`, since 27 October 2026; before, six points a game hour)
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
      against: Object.keys(book.npc).filter((k) => book.npc[k].by === p.id && (book.npc[k].mood === 'fighting' || book.npc[k].mood === 'shooting')).map(Number),
    };
  }

  // Fights within sight, for the client to animate and sound.
  function eventsNear(x, z, range = 60) { return book.events.filter((e) => Math.hypot(e.x - x, e.z - z) <= range); }

  // The state of the townspeople a player has struck, for whoever draws them.
  // (with `limp`: badly hurt, at 20 or not far above, they limp, the 20-life rule)
  function moods(x, z, range = 60) {
    const out = [];
    for (const key of Object.keys(book.npc)) { const rec = book.npc[key]; if (rec.mood === 'calm' && rec.health > HEALTH.limp) continue; const at = whereNpc(Number(key)); if (Math.hypot(at.x - x, at.z - z) <= range) out.push({ i: Number(key), mood: rec.mood, health: rec.health, ...(rec.health <= HEALTH.limp ? { limp: 1 } : {}) }); }
    return out;
  }

  // A police officer hit by a player's round (guns.js; `amount` 0 for one that went past her): her life down, never
  // below the floor; at 20 she sits down, hurt, and is out of it; otherwise she is shooting back. Returns { lost, health }.
  function officerShot(i, p, amount) {
    const rec = npcRec(i, p.id);
    const before = rec.health;
    rec.by = p.id; rec.lastAt = real(); rec.at = state.t;
    if (amount > 0) { rec.hits += 1; rec.health = Math.max(Math.min(before, HEALTH.critical), before - amount); }
    if (rec.health <= HEALTH.critical) { if (rec.mood !== 'down') settle(i, rec, 'down'); } else rec.mood = 'shooting';
    return { lost: before - rec.health, health: rec.health };
  }
  // An officer has stopped shooting (the shooter is down to 20, held, gone, or she is): back to her day.
  // A townsperson (not an officer) hit by a player's round (guns.js): their life down, never below 20. They fall and get
  // up (impact.js `felled`), and then run, or at 20 limp, away. Returns { lost, health, mood }.
  function townShot(i, p, amount) {
    const rec = npcRec(i, p.id);
    const before = rec.health;
    rec.by = p.id; rec.lastAt = real(); rec.at = state.t;
    if (amount > 0) { rec.hits += 1; rec.health = Math.max(Math.min(before, HEALTH.critical), before - amount); }
    if (rec.health <= HEALTH.critical) { if (rec.mood !== 'down') { rec.mood = 'down'; rec.hurtUntil = real() + between(HEALTH.hurtFor); speak(i, 'yield'); } }
    else if (rec.mood !== 'fighting') rec.mood = 'fled';
    return { lost: before - rec.health, health: rec.health, mood: rec.mood };
  }
  function officerDone(i) { const rec = book.npc[i]; if (rec && rec.mood === 'shooting') rec.mood = 'done'; }

  // The police, or anything else that ends a fight outright.
  function stop(p) {
    p.fight = null;
    for (const key of Object.keys(book.npc)) { const rec = book.npc[key]; if (rec.by === p.id && rec.mood === 'fighting') { rec.mood = 'done'; if (actors.has(Number(key))) actors.release(Number(key)); } }
  }

  const api = { engage, disengage, act, block, dodge, tick, hourly, hurt, injure, shot, heal, critical, selfView, eventsNear, moods, stop, nerve, officerShot, officerDone, townShot, record: (i) => book.npc[i] || null };
  hub.conflict = api;
  return api;
}
