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
// Townspeople are knocked down and hurt, and (8 October 2026, at the owner's word) struck hard enough or often
// enough they die: they lie where they fell for a while, and are then taken to the mortuary and are gone from
// the town. A player is never killed for good: a dead player comes round at the hospital. Children step clear
// and are never struck. Each blow draws blood, more the harder it was; someone lying bleeds on, so the pool
// under them spreads, and a pool is left on the ground after they are gone.

import { GameError } from './registry.js';
import { zoneWalkable, ZONE_RESIDENTS } from './zone.js';

const RESIDENT_NAME = new Map(ZONE_RESIDENTS.map((r) => [r.id, r.name]));
import { POSE } from './population.js';

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
  rise: 0.7,               // real seconds getting up, in which they still cannot act
  throw: Object.freeze([0.6, 2.6]),    // metres thrown forward, light blow to heavy
  stall: 0.7,              // real seconds the vehicle is stopped by what it hit
  gather: 9,               // metres a second each second: the fastest any vehicle here can gain speed
  reach: 0.35,             // metres added to the vehicle's half-width: the body it meets
  dead: 8,                 // real seconds between being killed and coming round at the hospital
  body: 150,               // real seconds a dead townsperson lies where they fell before they are taken away
  bleed: Object.freeze({ perHarm: 1, most: 260 }),     // blood counted for each point of harm, and the most one body holds for the drawing
  wake: 20,                // health on coming round
  seen: 10,                // real seconds the two of them can see each other's health afterwards
  minAge: 16,              // nobody younger is struck: they jump clear
  crimeWindow: 30,         // real seconds in which more blows from the same driver are the same offence
});

// What each vehicle presents to someone in front of it: half its width, and how far ahead of its middle its nose is.
export const FRONTS = Object.freeze({
  keke: Object.freeze({ half: 0.72, nose: 1.15, tail: 1.2 }),
  moto: Object.freeze({ half: 0.36, nose: 0.85, tail: 0.8 }),
});

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

export function createImpact({ state, players, population, actors, conflict, talk, emit, rng, hub, door, visitors = () => [] }) {
  if (!state.impact) state.impact = { seq: 0, events: [], npc: {} };
  const book = state.impact;
  const people = population.people;
  const real = () => state.real;
  for (const id of Object.keys(players)) { const p = players[id]; if (p.down === undefined) p.down = null; if (p.dead === undefined) p.dead = null; if (!p.involved) p.involved = {}; }

  const onFoot = (q) => !q.driving && (q.riding === null || q.riding === undefined) && (q.astride === null || q.astride === undefined) && !q.carried;
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
    // someone who was killed tells nobody: unless it was seen, the police learn of it only when the body is found
    const made = hub.justice.offence(driver, killed ? 'death_by_driving' : 'dangerous_driving', { victim, x, z, vehicle, crime: open, stealth: killed, noticed: false });
    driver.driveCrime = { id: made.id, at: real(), victim: `${victim.kind}:${victim.id}` };
    if (killed) hub.justice.worsen(made.id, 'death_by_driving', true);
    return made.id;
  }

  function strikePlayer(driver, q, speed, heading, vehicle) {
    const now = real();
    if (q.struckByVehicleAt !== undefined && now - q.struckByVehicleAt < IMPACT.grace) return null;
    const lying = !!q.down;
    const harm = Math.max(1, Math.round(harmAt(speed) * (lying ? IMPACT.downed : 1)));
    const weight = clamp((speed - IMPACT.least) / 7, 0, 1);
    q.struckByVehicleAt = now;
    const lost = conflict.injure(q, harm);
    q.blood = Math.min(IMPACT.bleed.most, (q.blood && now - (q.bloodAt || 0) < 60 ? q.blood : 0) + harm * IMPACT.bleed.perHarm); q.bloodAt = now;
    const to = thrown(q.x, q.z, heading, IMPACT.throw[0] + (IMPACT.throw[1] - IMPACT.throw[0]) * weight);
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
    } else {
      const lie = IMPACT.down[0] + (IMPACT.down[1] - IMPACT.down[0]) * weight;
      q.down = { at: now, until: now + lie, upAt: now + lie + IMPACT.rise, by: driver.id, h: heading };
      emit(q.id, { type: 'alert', title: 'Knocked down', text: `${driver.name} hit you with a ${vehicle.kind === 'moto' ? 'motorcycle' : 'keke'}. Health ${q.health}.` });
    }
    show({ kind: killed ? 'killed' : 'knock', by: { kind: 'player', id: driver.id }, on: { kind: 'player', id: q.id }, x: q.x, z: q.z, speed: Math.round(speed * 10) / 10, harm: lost, vehicle: vehicle.kind });
    return { kind: 'player', id: q.id, name: q.name, harm: lost, health: q.health, killed };
  }

  function strikeNpc(driver, i, speed, heading, vehicle) {
    const now = real();
    const who = people[i];
    const rec = book.npc[i] || (book.npc[i] = { at: -10, health: 100, t: state.t });
    if (rec.dead) {
      // a body is not knocked about again; the vehicle goes over it, and stops
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
    const harm = Math.max(1, Math.round(harmAt(speed) * (lying ? IMPACT.downed : 1)));
    const weight = clamp((speed - IMPACT.least) / 7, 0, 1);
    rec.at = now; rec.t = state.t;
    rec.health = Math.max(0, rec.health - harm);
    rec.blood = Math.min(IMPACT.bleed.most, (rec.blood || 0) + harm * IMPACT.bleed.perHarm);
    rec.hits = (rec.hits || 0) + 1;
    const to = thrown(m.x, m.z, heading, IMPACT.throw[0] + (IMPACT.throw[1] - IMPACT.throw[0]) * weight);
    m.x = to.x; m.z = to.z; m.h = heading;
    rec.x = m.x; rec.z = m.z;
    const killed = rec.health <= 0;
    if (killed) {
      rec.dead = { at: now, by: driver.id, byName: driver.name, takeAt: now + IMPACT.body };
      actors.kill(i, 'Dead');
      if (talk) talk.say({ who: `n:${i}`, name: 'Someone', text: 'Ewo! He don die! Call police!', lang: 'pcm', gloss: 'Oh no! He is dead! Call the police!', x: m.x, z: m.z, kind: 'shout', range: 30, hold: 3.6 });
      emit(driver.id, { type: 'alert', title: 'You have killed someone', text: `${who.short} is dead under your wheels.` });
    } else {
      const lie = IMPACT.down[0] + (IMPACT.down[1] - IMPACT.down[0]) * weight + (rec.health <= 25 ? 12 : 1.5);
      actors.hold(i, 'Knocked down', POSE.lie, now + lie);
      m.after = now + lie;             // then they are let go, and walk back to their day
      // getting up, they hold their head; badly hurt, they weep
      if (hub.reactions) { if (hub.reactions.end) hub.reactions.end(i); rec.reactAt = now + lie; rec.reactWith = rec.badly || rec.health <= 25 ? 'cry' : 'hurt'; }
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
    const now = real();
    const look = clamp(speed * 1.1 + 3, 5, 14);
    const horn = now - (driver.hornAt === undefined ? -10 : driver.hornAt) < 2.5;
    for (const [i, px, pz, pose] of rows) {
      if (pose !== POSE.stand && pose !== POSE.walk) continue;
      const along = (px - bx) * tx + (pz - bz) * tz;
      const across = (px - bx) * tz - (pz - bz) * tx;
      if (along < 0.6 || along > look || Math.abs(across) > reach + 0.5) continue;
      if (actors.has(i)) continue;
      const rec = book.npc[i] || (book.npc[i] = { at: -10, health: 100, t: state.t });
      if (now - (rec.warned === undefined ? -10 : rec.warned) < 2.5) continue;
      rec.warned = now; rec.t = state.t;
      const notices = people[i].age < IMPACT.minAge || horn || rng.next() < (speed > 6 ? 0.88 : 0.97);
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
      actors.walkTo(i, to[0], to[1], 4.6, 'Getting out of the way');
      actors.get(i).after = now + 2.2;
      // a leap clear, or a fright
      if (hub.reactions) hub.reactions.react(i, horn || speed > 5 ? 'jump' : 'scared');
    }
  }

  // A vehicle has been moved one step by its driver, from (x0, z0) to (x1, z1), facing `heading`.
  // Returns who it struck, if anyone, and stops the vehicle if it struck someone.
  //   vehicle: { kind: 'keke' | 'moto', id }; `holder` is the vehicle's own record, where its pace is kept between steps
  function step(driver, vehicle, holder, x0, z0, x1, z1, heading, elapsed) {
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
    const front = FRONTS[vehicle.kind] || FRONTS.keke;
    const ux = Math.sin(heading), uz = Math.cos(heading);
    // forward, the nose leads; backing up, the tail does
    const forward = (x1 - x0) * ux + (z1 - z0) * uz >= 0;
    const lead = forward ? front.nose : -front.tail;
    const ax = x0 + ux * lead, az = z0 + uz * lead, bx = x1 + ux * lead, bz = z1 + uz * lead;
    if (gap < 0.005) { holder.sweep = null; return []; }
    const reach = front.half + IMPACT.reach;
    const throwTo = forward ? heading : heading + Math.PI;
    const hits = [];
    if (speed >= IMPACT.least) {
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
      if (speed >= IMPACT.least) {
        for (const [i, px, pz, pose] of rows) {
          if (pose === POSE.ride || pose === POSE.hidden) continue;
          if (nearestOnStep(from.x, from.z, bx, bz, px, pz) > reach) continue;
          const hit = strikeNpc(driver, i, speed, throwTo, vehicle);
          if (hit) hits.push(hit);
        }
      }
      if (speed > 0.8) warn(driver, rows, bx, bz, tx, tz, speed, reach);
      holder.sweep = { x: bx, z: bz, at: now };
    } else holder.sweep = from;
    if (hits.length) { holder.stalledUntil = now + IMPACT.stall; holder.pace = 0; }
    return hits;
  }

  // Is this vehicle still stopped by what it hit?
  const stalled = (holder) => real() < (holder.stalledUntil || 0);

  // --- time ------------------------------------------------------------------------

  function tick() {
    const now = real();
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
      if (state.t - rec.t > (hub.span ? hub.span(7200) : 7200)) delete book.npc[key];
    }
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
      down: p.down ? { rising: now >= p.down.until, left: Math.max(0, Number((p.down.upAt - now).toFixed(2))), h: p.down.h } : null,
      dead: p.dead ? { by: p.dead.byName, left: Math.max(0, Math.ceil(p.dead.wakeAt - now)), vehicle: p.dead.vehicle } : null,
      involved,
    };
  }

  // How another player looks from outside: on the ground, getting up, dead. Never a number.
  const stanceOf = (q) => ({ down: !!q.down && real() < q.down.until, rising: !!q.down && real() >= q.down.until, dead: !!q.dead, fell: q.down ? q.down.h : q.dead ? 0 : null });
  // May `p` be shown `q`'s health?
  const maySee = (p, q) => !!(p.involved[q.id] || (p.fight && p.fight.target.kind === 'player' && p.fight.target.id === q.id) || (q.fight && q.fight.target.kind === 'player' && q.fight.target.id === p.id));
  // What happened within sight, for everyone near to see and hear. How much it hurt is left out: that is nobody's business but theirs.
  const eventsNear = (x, z, range = 60) => book.events.filter((e) => Math.hypot(e.x - x, e.z - z) <= range).map((e) => ({ id: e.id, kind: e.kind, by: e.by, on: e.on, x: e.x, z: e.z, vehicle: e.vehicle }));
  // Townspeople lying where a vehicle left them (as against lying in a hospital bed), so they can be drawn on the ground.
  const fallen = () => Object.keys(book.npc).map(Number).filter((i) => { const m = actors.get(i); return !!m && m.pose === POSE.lie && (m.act === 'Knocked down' || m.dead); });
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
  function horn(driver) { driver.hornAt = real(); return {}; }

  const api = { clear, step, stalled, horn, tick, selfView, stanceOf, maySee, eventsNear, fallen, bleeding, onFoot, record: (i) => book.npc[i] || null };
  hub.impact = api;
  return api;
}
