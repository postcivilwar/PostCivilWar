// Guns (25 October 2026, the owner's brief for the guns, the aiming and fighting with them between players; and his
// brief of 22 October: shooting, health, blood and the 20-life rule).
//
// What is decided here, in this copy of the town:
//   whether a shot may be fired   the gun out, a round in it, not being reloaded, ready by its rate of fire, and the
//                                 one holding it on their feet and able (not at 20, not held, not in the water)
//   where it goes                 to the first thing in its way: a wall, the ground, a vehicle, a police officer, one
//                                 of the town's people, or another player as this town sees them; never through anything
//   what it does                  GUN.damage life points off whoever it hits, and nobody below the 20-life floor
//   what the police do about it   an officer shot at shoots back at whoever shot at her; it is an offence, recorded
//                                 and witnessed as any other (justice.js)
//   the town's people             (27 October 2026, the owner's brief) one hit falls, lies a moment, gets up and runs,
//                                 or at 20 limps, away (impact.js `felled`); at 20 rounds go past them; gunfire near
//                                 frightens everyone about, and they run
//
// What is decided by the website's server instead (api/_lib/guns.js): which guns a player owns and how many rounds they
// have (the page passes its word on, `gun.owned`, as it does for the motorcycles a player owns), and whether a shot of
// one player's hit another. Each player's game runs its own copy of the town, so a hit on another player is claimed by
// the shooter's game, checked by the server against where both players really were and the walls between, and the one
// hit is told by the server (`gun.struck`); a game cannot award itself a hit, nor give itself rounds or a gun.
//
// A copy of the game with no server (opened from a disk, played with no connection) keeps its own count: the starter
// rifle and its rounds, topped up once a day.

import { GameError } from './registry.js';
import { zoneSolid, zoneGroundY } from './zone.js';
import { POSE } from './population.js';
import { HEALTH, COMBAT } from './conflict.js';
import { PACE } from './actors.js';

// The owner's one setting (22 October 2026: "Every shot that hits takes 1 life point off the person hit. Put this number
// in one setting so I can change it later"). The website's server reads it from here too (build.mjs writes it beside
// the server as api/_lib/guns-data.json).
export const GUN = Object.freeze({
  damage: 1,                 // life points one hit takes off whoever it hits
  floor: HEALTH.critical,    // nobody is brought below this, by a gun or anything else, until they are treated
  // a body, for what a shot can hit: an upright figure is a post this wide and this tall; one crouched, this tall
  body: Object.freeze({ radius: 0.32, height: 1.78, crouched: 1.2 }),
  // how far from the shooter's own place a shot may start (the gun's muzzle is ahead of the body), and how high
  muzzle: Object.freeze({ reach: 2.2, low: 0.3, high: 2.4 }),
  // the most shots one request may carry (the page asks once a frame; at the rifle's rate that is one or two)
  most: 8,
  // seconds a shot stays in the view for others to see and hear
  seen: 1.6,
  daySeconds: 86400,
});

// The guns there are. Each is one of the owner's GLB files (src/client/gun-model.js draws it), with what it does.
// `starter`: everyone has it, free, from the start; it is never sold, and never paid for. `price` and `forSale`: a gun
// sold in the shop (none yet: the owner sends more guns, with their prices). Rates and times are the owner's to change.
//   magazine, spare   rounds in the gun, and carried besides it, when topped up
//   rpm               rounds a minute held on the trigger (the owner's recordings fire at about 850)
//   reload            seconds a reload takes
//   range             metres a shot carries
//   spread            radians either side of the aim a round may go: from the hip, aimed, through the sight, and how
//                     much more while moving; crouched it is less (a share)
//   recoil            what each round does to the aim: up and to the side (radians), and how quickly it comes back
export const GUNS = Object.freeze({
  rifle: Object.freeze({
    id: 'rifle', name: 'Rifle', file: 'futuristicrifle3dmodel.glb', starter: true, price: 0, forSale: false,
    magazine: 30, spare: 120, rpm: 850, mode: 'auto', reload: 2.4, range: 150,
    spread: Object.freeze({ hip: 0.03, aim: 0.012, sight: 0.0035, moving: 0.02, crouched: 0.65 }),
    recoil: Object.freeze({ climb: 0.0075, side: 0.0032, recover: 7 }),
  }),
});
export const STARTER_GUN = 'rifle';
export const gunOf = (id) => (typeof id === 'string' && Object.prototype.hasOwnProperty.call(GUNS, id) ? GUNS[id] : null);

// The police and their rifles: the owner's rifle, carried by every officer. An officer shoots back at whoever is
// shooting at her (22 October 2026, stage 1: the full rules come with the stars): short bursts while she can see them.
export const POLICE_FIRE = Object.freeze({
  rpm: 600, burst: Object.freeze([3, 5]), pause: Object.freeze([0.7, 1.4]),
  sight: 60,                 // metres within which she fires at someone she can see
  near: 2.0,                 // a round passing this close to an officer is a shot at her
  // the chance that one of her rounds hits: close by, and at the edge of her sight; less at a run, less crouched
  hit: Object.freeze({ close: 0.42, far: 0.08, running: 0.6, crouched: 0.7 }),
  lose: 6,                   // seconds out of her sight before she goes to look where they were
});

const n = (v) => Number.isFinite(Number(v)) ? Number(v) : NaN;
const r2 = (v) => Math.round(v * 100) / 100;

// The nearest of a ray (from o, along the unit vector d, up to `most` metres) and an upright post standing at (x, z)
// from its foot at y0 up to y0 + h, radius r: how far along the ray it is met, or Infinity.
export function rayPost(o, d, most, x, y0, z, h, r) {
  const ox = o[0] - x, oz = o[2] - z;
  const a = d[0] * d[0] + d[2] * d[2];
  let t = Infinity;
  if (a > 1e-9) {
    const b = ox * d[0] + oz * d[2], c = ox * ox + oz * oz - r * r;
    const disc = b * b - a * c;
    if (disc >= 0) {
      const s = Math.sqrt(disc);
      for (const k of [(-b - s) / a, (-b + s) / a]) {
        if (k < 0 || k > most) continue;
        const y = o[1] + d[1] * k;
        if (y >= y0 && y <= y0 + h) { t = Math.min(t, k); break; }
      }
    }
  }
  // (straight down onto its top, or from inside it)
  if (!Number.isFinite(t) && ox * ox + oz * oz <= r * r) { const y = o[1]; if (y >= y0 && y <= y0 + h) t = 0; }
  return t;
}

// How far along a ray the first wall, the ground or a vehicle is, within `most` metres: { at, what, point }. `boxes`:
// vehicles and whatever else stands in the way as [{ x0, z0, x1, z1, top }] (top: metres above the ground).
export function rayWorld(o, d, most, boxes = []) {
  const STEP = 0.25;
  let last = 0;
  const solidAt = (k) => {
    const x = o[0] + d[0] * k, y = o[1] + d[1] * k, z = o[2] + d[2] * k;
    const g = zoneGroundY(x, z);
    if (y <= g) return 'ground';
    if (zoneSolid(x, z, 0.04, y - g)) return 'wall';
    for (const b of boxes) if (x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1 && y - g < b.top) return 'vehicle';
    return null;
  };
  for (let k = STEP; k <= most + 1e-6; k += STEP) {
    const what = solidAt(Math.min(k, most));
    if (!what) { last = k; continue; }
    // found between the last clear step and this one: to a couple of centimetres
    let lo = last, hi = Math.min(k, most);
    for (let i = 0; i < 4; i += 1) { const mid = (lo + hi) / 2; if (solidAt(mid)) hi = mid; else lo = mid; }
    return { at: hi, what, point: [o[0] + d[0] * hi, o[1] + d[1] * hi, o[2] + d[2] * hi] };
  }
  return { at: most, what: 'air', point: [o[0] + d[0] * most, o[1] + d[1] * most, o[2] + d[2] * most] };
}

export function createGuns({ state, players, population, actors, conflict, talk, emit, rng, hub, boxes = () => [] }) {
  if (!state.guns) state.guns = { shots: [], seq: 0 };
  const book = state.guns;
  const people = population.people;
  const POLICE = people.filter((q) => q.job === 'police').map((q) => q.index);
  const real = () => state.real;
  const probe = {};
  const where = (i) => population.locate(i, state.t, probe);
  const dayOf = () => Math.floor(state.t / GUN.daySeconds);

  // ---- each player's guns ---------------------------------------------------------------

  const fresh = (id) => { const g = GUNS[id]; return { mag: g.magazine, spare: g.spare }; };
  function gunsOf(p) {
    if (!p.gun || typeof p.gun !== 'object') p.gun = { have: { [STARTER_GUN]: fresh(STARTER_GUN) }, equipped: STARTER_GUN, out: false, aim: 0, crouch: false, reload: null, next: 0, seq: 0, struck: [], day: dayOf(), server: false };
    const g = p.gun;
    if (!g.have || typeof g.have !== 'object') g.have = {};
    // the starter is everyone's, always
    if (!g.have[STARTER_GUN]) g.have[STARTER_GUN] = fresh(STARTER_GUN);
    for (const id of Object.keys(g.have)) if (!GUNS[id]) delete g.have[id];
    if (!g.have[g.equipped]) g.equipped = STARTER_GUN;
    if (!Array.isArray(g.struck)) g.struck = [];
    return g;
  }
  // a game opened again starts with the gun put away, nothing half done (a reload, a crouch)
  for (const id of Object.keys(players)) { const g = gunsOf(players[id]); g.out = false; g.aim = 0; g.crouch = false; g.reload = null; }

  // Can this player use a gun now? (The 20-life rule: at 20 nobody shoots, 22 October 2026.)
  function mayShoot(p) {
    if (p.health <= GUN.floor) throw new GameError('CRITICAL', 'You are badly hurt. You cannot use a gun.');
    if (p.custody || p.law && p.law.arrest) throw new GameError('IN_CUSTODY', 'You are in the hands of the police.');
    if (p.carried) throw new GameError('CARRIED', 'You are in the ambulance.');
    if (p.driving || p.incar || (p.riding !== null && p.riding !== undefined) || (p.astride !== null && p.astride !== undefined)) throw new GameError('NOT_ON_FOOT', 'Not from a vehicle.');
    if (p.swimming) throw new GameError('SWIMMING', 'Not in the water.');
    if (p.hijack) throw new GameError('BUSY', 'You have your hands full.');
    if (p.fight) throw new GameError('FIGHTING', 'You are in a fist fight. Step back from it first.');
    if (p.down || p.dead) throw new GameError('DOWN', 'You are on the ground.');
  }

  // Put away: nothing half done is carried on (a reload stops, and moves no rounds).
  function holster(p) { const g = gunsOf(p); g.out = false; g.aim = 0; g.crouch = false; g.reload = null; }

  // The day's rounds, for a copy of the game with no server (with one, the server tops them up: api/_lib/guns.js)
  function topUp(p) {
    const g = gunsOf(p);
    const day = dayOf();
    if (g.server || g.day === day) return;
    g.day = day;
    for (const id of Object.keys(g.have)) g.have[id] = fresh(id);
  }

  // The website's server's word on this player's guns: which they own, and their rounds (the page has already allowed
  // for rounds it has fired that the server has not yet heard of). Only guns the game knows are kept.
  function owned(p, { guns, equipped } = {}) {
    const g = gunsOf(p);
    const list = Array.isArray(guns) ? guns : [];
    const next = {};
    for (const item of list) {
      const def = item && gunOf(item.id);
      if (!def) continue;
      const mag = Math.max(0, Math.min(def.magazine, Math.floor(n(item.mag)) || 0));
      const spare = Math.max(0, Math.min(def.spare * 4, Math.floor(n(item.spare)) || 0));
      next[def.id] = { mag, spare };
    }
    if (!next[STARTER_GUN]) next[STARTER_GUN] = g.have[STARTER_GUN] || fresh(STARTER_GUN);
    // a reload under way here keeps its own count until it is done; the server has the same reload
    if (g.reload && next[g.reload.gun]) next[g.reload.gun] = g.have[g.reload.gun] || next[g.reload.gun];
    g.have = next;
    if (equipped && next[equipped]) g.equipped = equipped;
    if (!g.have[g.equipped]) g.equipped = STARTER_GUN;
    g.server = true;
    return view(p);
  }

  function draw(p, { gun } = {}) {
    mayShoot(p);
    const g = gunsOf(p);
    if (gun !== undefined && gun !== null) {
      if (!gunOf(gun)) throw new GameError('NO_GUN', 'There is no such gun.');
      if (!g.have[gun]) throw new GameError('NOT_OWNED', 'You do not own that gun.');
      if (g.equipped !== gun) g.reload = null;
      g.equipped = gun;
    }
    topUp(p);
    if (p.emote) p.emote = null;
    g.out = true;
    return view(p);
  }

  function equip(p, { gun } = {}) {
    const g = gunsOf(p);
    if (!gunOf(gun)) throw new GameError('NO_GUN', 'There is no such gun.');
    if (!g.have[gun]) throw new GameError('NOT_OWNED', 'You do not own that gun.');
    if (g.equipped !== gun) { g.reload = null; g.equipped = gun; }
    return view(p);
  }

  // Aiming (0 at the ready, 1 aimed, 2 through the sight) and crouching: for others to see, and how true it shoots.
  function aim(p, { aim: how, crouch } = {}) {
    const g = gunsOf(p);
    if (!g.out) throw new GameError('NOT_OUT', 'Your gun is put away.');
    g.aim = [0, 1, 2].includes(how) ? how : 0;
    if (crouch !== undefined) g.crouch = !!crouch;
    return { aim: g.aim, crouch: g.crouch };
  }

  function reload(p) {
    mayShoot(p);
    const g = gunsOf(p);
    if (!g.out) throw new GameError('NOT_OUT', 'Your gun is put away.');
    const def = GUNS[g.equipped];
    const have = g.have[g.equipped];
    if (g.reload) throw new GameError('NOT_READY', 'Already reloading.');
    if (have.mag >= def.magazine) throw new GameError('FULL', 'The magazine is full.');
    if (have.spare <= 0) throw new GameError('NO_SPARE', 'You have no rounds left to reload with.');
    g.reload = { gun: g.equipped, at: real(), until: real() + def.reload };
    return { reloading: { gun: g.equipped, seconds: def.reload } };
  }

  // ---- what a shot meets ------------------------------------------------------------------

  // Who can be shot: a police officer on her feet who is not badly hurt (the 20-life rule), one of the town's people on
  // their feet or sitting (not a child), and another player as this town sees them (whatever their own game says of
  // them: their health, on their feet, not in the water). Nobody at a counter, and nobody at 20. Each as an upright post.
  function targets(o, d, most, shooter) {
    const out = [];
    for (const [i, x, z, pose] of population.within(`gun:${shooter ? shooter.id : '-'}`, o[0], o[2], most + 2, state.t, real())) {
      const who = people[i];
      if (!who || who.job === 'police' || who.age < COMBAT.minAge) continue;
      if (pose === POSE.hidden || pose === POSE.ride || pose === POSE.lie) continue;
      const rec = conflict.record(i);
      const health = rec ? rec.health : HEALTH.max;
      out.push({ kind: 'npc', id: i, x, z, y0: zoneGroundY(x, z), h: pose === POSE.sit ? 1.25 : GUN.body.height, health, able: health > GUN.floor });
    }
    for (const i of POLICE) {
      const at = where(i);
      if (at.pose === POSE.hidden || at.pose === POSE.ride || at.pose === POSE.lie) continue;
      if (Math.abs(at.x - o[0]) > most + 2 || Math.abs(at.z - o[2]) > most + 2) continue;
      const rec = conflict.record(i);
      const health = rec ? rec.health : HEALTH.max;
      const sit = at.pose === POSE.sit;
      out.push({ kind: 'npc', id: i, x: at.x, z: at.z, y0: zoneGroundY(at.x, at.z), h: sit ? 1.25 : GUN.body.height, health, able: health > GUN.floor });
    }
    for (const v of talk.visitors()) {
      if (Math.abs(v.x - o[0]) > most + 2 || Math.abs(v.z - o[2]) > most + 2) continue;
      const hp = Number.isFinite(v.health) ? v.health : null;
      const able = hp !== null && hp > GUN.floor && !v.vehicle && !v.ride && !v.car && !v.swimming && !v.held && !v.down;
      out.push({ kind: 'player', id: v.id, peer: v.peer, name: v.name, x: v.x, z: v.z, y0: zoneGroundY(v.x, v.z), h: v.crouch ? GUN.body.crouched : GUN.body.height, health: hp, able });
    }
    // (another player in this same copy of the town: the tests' two players in one world)
    for (const id of Object.keys(players)) {
      const q = players[id];
      if (q === shooter || q.custody || q.carried || q.dead) continue;
      if (Math.abs(q.x - o[0]) > most + 2 || Math.abs(q.z - o[2]) > most + 2) continue;
      const crouched = q.gun && q.gun.out && q.gun.crouch;
      const able = q.health > GUN.floor && !q.driving && !q.incar && (q.astride === null || q.astride === undefined) && (q.riding === null || q.riding === undefined) && !q.swimming;
      out.push({ kind: 'local', id: q.id, name: q.name, x: q.x, z: q.z, y0: zoneGroundY(q.x, q.z), h: crouched ? GUN.body.crouched : GUN.body.height, health: q.health, able });
    }
    return out;
  }

  // Where a shot from `o` along `d` stops, and what it hits there. Someone who may not be shot (at 20) is not in its
  // way: it goes past them. `skip`: the shooter's own body (an officer's, or a player's own copy).
  function trace(o, d, most, { shooter = null, skip = null } = {}) {
    const world = rayWorld(o, d, most, boxes());
    let best = null;
    for (const t of targets(o, d, world.at, shooter)) {
      if (skip && skip.kind === t.kind && skip.id === t.id) continue;
      if (!t.able) continue;
      const k = rayPost(o, d, world.at, t.x, t.y0, t.z, t.h, GUN.body.radius);
      if (k < (best ? best.at : world.at)) best = { at: k, target: t };
    }
    if (best) return { at: best.at, what: 'person', point: [o[0] + d[0] * best.at, o[1] + d[1] * best.at, o[2] + d[2] * best.at], target: best.target };
    return world;
  }

  // What is under the aim, for the aiming mark's colour (src/client/gun-hud.js): whoever is first along the ray,
  // shootable or not (red, green), else what it meets. `self`: the one aiming (never under their own aim).
  function look(o, d, most = 150, self = null) {
    const world = rayWorld(o, d, most, boxes());
    let best = null;
    for (const t of targets(o, d, world.at, null)) {
      if (self !== null && t.kind === 'local' && t.id === self) continue;
      const k = rayPost(o, d, world.at, t.x, t.y0, t.z, t.h, GUN.body.radius + 0.06);
      if (k < (best ? best.at : world.at)) best = { at: k, target: t };
    }
    if (best) return { at: best.at, what: 'person', point: [o[0] + d[0] * best.at, o[1] + d[1] * best.at, o[2] + d[2] * best.at], target: { kind: best.target.kind, id: best.target.id, name: best.target.name || (best.target.kind === 'npc' ? people[best.target.id].short : ''), health: best.target.health, able: best.target.able, police: best.target.kind === 'npc' && people[best.target.id].job === 'police' } };
    return world;
  }

  function recordShot(entry) {
    book.seq += 1;
    const shot = { id: book.seq, at: real(), ...entry };
    book.shots.push(shot);
    while (book.shots.length > 160 || (book.shots.length && real() - book.shots[0].at > GUN.seen)) book.shots.shift();
    return shot;
  }

  // ---- a player fires -------------------------------------------------------------------

  // Each shot: { o: [x, y, z] (the muzzle), d: [dx, dy, dz] (the way it goes, the aim's spread already in it) }.
  // Answers for each: whether it was fired, and where it stopped and what it hit.
  function fire(p, { shots } = {}) {
    mayShoot(p);
    const g = gunsOf(p);
    if (!g.out) throw new GameError('NOT_OUT', 'Your gun is put away.');
    const def = GUNS[g.equipped];
    const have = g.have[g.equipped];
    const list = Array.isArray(shots) ? shots.slice(0, GUN.most) : [];
    const out = [];
    const gap = 60 / def.rpm;
    for (const s of list) {
      if (g.reload) { out.push({ ok: false, code: 'RELOADING' }); continue; }
      if (have.mag <= 0) { out.push({ ok: false, code: 'EMPTY' }); continue; }
      // (a frame can come a little early: a twentieth of the gap either way)
      if (real() < g.next - gap * 0.35) { out.push({ ok: false, code: 'NOT_READY' }); continue; }
      const o = Array.isArray(s && s.o) ? s.o.map(n) : [], dIn = Array.isArray(s && s.d) ? s.d.map(n) : [];
      if (o.length !== 3 || dIn.length !== 3 || ![...o, ...dIn].every(Number.isFinite)) { out.push({ ok: false, code: 'BAD_SHOT' }); continue; }
      const len = Math.hypot(dIn[0], dIn[1], dIn[2]);
      if (len < 1e-6) { out.push({ ok: false, code: 'BAD_SHOT' }); continue; }
      const d = dIn.map((v) => v / len);
      // the muzzle is where the shooter is: ahead of them, at their arms' height
      const ground = zoneGroundY(p.x, p.z);
      if (Math.hypot(o[0] - p.x, o[2] - p.z) > GUN.muzzle.reach || o[1] < ground + GUN.muzzle.low || o[1] > ground + GUN.muzzle.high) { out.push({ ok: false, code: 'BAD_SHOT' }); continue; }
      have.mag -= 1;
      g.next = Math.max(real(), g.next) + gap;
      g.seq += 1;
      p.stats.shots = (p.stats.shots || 0) + 1;
      const hit = trace(o, d, def.range, { shooter: p, skip: { kind: 'local', id: p.id } });
      const result = { ok: true, seq: g.seq, end: hit.point.map(r2), what: hit.what };
      if (hit.what === 'person') {
        const t = hit.target;
        result.target = { kind: t.kind, id: t.id, name: t.name || (t.kind === 'npc' ? people[t.id].short : '') };
        if (t.kind === 'npc') { const lost = people[t.id].job === 'police' ? officerShot(p, t.id, GUN.damage, hit.point) : townShot(p, t.id, GUN.damage, hit.point); result.target.health = lost.health; result.damage = lost.lost; }
        else if (t.kind === 'local') { const q = players[t.id]; const lost = wound(q, GUN.damage, { by: p.name, from: [p.x, p.z], at: hit.point }); result.target.health = q.health; result.damage = lost; shotPlayer(p, q, hit.point); }
        // another player (`player`): claimed here, decided by the website's server; the page sends it there
        else { result.claim = { peer: t.peer || t.id, point: hit.point.map(r2) }; }
      }
      // a round past an officer's ear is a shot at her
      if (hit.what !== 'person' || hit.target.kind !== 'npc') nearMiss(p, o, d, hit.at);
      scare(p, hit.point);
      recordShot({ from: `p:${p.id}`, o: o.map(r2), e: result.end, what: hit.what, on: result.target ? (result.target.kind === 'npc' ? `n:${result.target.id}` : result.target.kind === 'local' ? `p:${result.target.id}` : `v:${result.target.id}`) : null });
      out.push(result);
    }
    return { shots: out, mag: have.mag, spare: have.spare };
  }

  // One of the town's people hit by a player's round: an offence; they go down, get up and run, or limp, away
  // (impact.js), and whoever saw it is frightened.
  function townShot(p, i, amount, point) {
    const lost = conflict.townShot(i, p, amount);
    if (hub.justice) {
      const key = `${p.id}|n:${i}`;
      const open = book.open && book.open[key] && real() - book.open[key].at < 90 ? book.open[key].crime : null;
      const crime = hub.justice.offence(p, 'shooting', { victim: { kind: 'npc', id: i, name: people[i].name }, x: point[0], z: point[2], crime: open });
      (book.open || (book.open = {}))[key] = { crime: crime.id, at: real() };
    }
    if (hub.impact) hub.impact.felled(i, { from: { x: p.x, z: p.z }, harm: amount });
    if (hub.voices) hub.voices.event('hurt', point[0], point[2], { only: `n:${i}` });
    return lost;
  }
  // Gunfire frightens the town's people near it (the owner's brief: they "run when scared"): those on their feet near
  // the one shooting, or near where the round struck, run from the shooter; a few only flinch or cower. Each person is
  // frightened afresh at most every few seconds, and no more than a dozen at a time.
  const SCARE = Object.freeze({ near: 16, struck: 8, every: 1.0, again: 8, most: 12 });
  const scared = new Map();        // i -> real time last frightened
  let scareAt = -1e9;
  function scare(p, point) {
    const now = real();
    if (now - scareAt < SCARE.every) return;
    scareAt = now;
    // and those near call out (voices.js), the police among them
    if (hub.voices) hub.voices.event('gunshot', p.x, p.z);
    let n = 0;
    const rows = [...population.within(`scare:${p.id}`, p.x, p.z, SCARE.near, state.t, now), ...population.within(`scare:${p.id}:at`, point[0], point[2], SCARE.struck, state.t, now)];
    for (const [i, , , pose] of rows) {
      if (n >= SCARE.most) break;
      const who = people[i];
      if (!who || who.job === 'police' || (pose !== POSE.stand && pose !== POSE.walk) || now - (scared.get(i) || -1e9) < SCARE.again) continue;
      if (actors.has(i)) continue;
      const rec = conflict.record(i);
      if (rec && rec.mood !== 'calm') continue;
      scared.set(i, now); n += 1;
      if (!actors.take(i, state.t)) continue;
      const roll = rng.next();
      if (roll < 0.15) { actors.hold(i, 'Cowering', POSE.stand, now + 2.5); if (hub.reactions) hub.reactions.react(i, roll < 0.08 ? 'afraid' : 'scared'); continue; }
      actors.flee(i, p.x, p.z, roll < 0.7 ? PACE.run : PACE.sprint, 'Running from the gunfire', 22 + roll * 14);
      actors.get(i).after = now + 14 + rng.next() * 12;
      if (hub.reactions) hub.reactions.react(i, 'flee', { seconds: 5, loop: true });
    }
    for (const [i, at] of scared) if (now - at > 60) scared.delete(i);
  }

  // A player in this same copy of the town hit by another's round (the tests' two players in one world): an offence.
  function shotPlayer(p, q, at) {
    if (!hub.justice) return;
    const key = `${p.id}|${q.id}`;
    const open = book.open && book.open[key] && real() - book.open[key].at < 90 ? book.open[key].crime : null;
    const crime = hub.justice.offence(p, 'shooting', { victim: { kind: 'player', id: q.id, name: q.name }, x: at[0], z: at[2], crime: open });
    (book.open || (book.open = {}))[key] = { crime: crime.id, at: real() };
  }

  // The website's server has said these shots of this player's hit another player: an offence like any other, where
  // it happened (the police see it if they are there to see it).
  function confirmed(p, { hits } = {}) {
    let n2 = 0;
    for (const h of (Array.isArray(hits) ? hits : []).slice(0, 16)) {
      const x = n(h && h.x), z = n(h && h.z);
      if (!Number.isFinite(x) || !Number.isFinite(z) || !hub.justice) continue;
      const name = typeof h.name === 'string' ? h.name.slice(0, 32) : 'another player';
      const key = `${p.id}|peer:${String(h.who || '').slice(0, 40)}`;
      const open = book.open && book.open[key] && real() - book.open[key].at < 90 ? book.open[key].crime : null;
      const crime = hub.justice.offence(p, 'shooting', { victim: { kind: 'visitor', id: String(h.who || '').slice(0, 40), name }, x, z, crime: open });
      (book.open || (book.open = {}))[key] = { crime: crime.id, at: real() };
      n2 += 1;
    }
    return { recorded: n2 };
  }

  // ---- being hit ----------------------------------------------------------------------------

  // Takes life points off a player for a round, never below the floor (the 20-life rule). Returns what was lost.
  function wound(q, amount, { by = '', from = null, at = null, id = null } = {}) {
    const lost = conflict.shot(q, amount);
    emit(q.id, { type: 'shot', by, damage: lost, health: q.health, at: at ? at.map(r2) : null, from: from ? from.map(r2) : null, id });
    if (q.health <= GUN.floor) holster(q);
    return lost;
  }

  // The website's server says this player was hit by other players' rounds. Each hit is taken once, however often it
  // is told (by its number); its damage is the server's, never more than a round does.
  function struck(p, { hits } = {}) {
    const g = gunsOf(p);
    const done = [];
    for (const h of (Array.isArray(hits) ? hits : []).slice(0, 40)) {
      const id = Math.floor(n(h && h.id));
      if (!Number.isFinite(id) || id <= 0 || g.struck.includes(id)) continue;
      g.struck.push(id);
      if (g.struck.length > 200) g.struck.splice(0, g.struck.length - 200);
      const dmg = Math.max(0, Math.min(GUN.damage, Math.floor(n(h.dmg)) || GUN.damage));
      const at = Array.isArray(h.at) && h.at.length === 3 && h.at.every((v) => Number.isFinite(Number(v))) ? h.at.map(Number) : null;
      const from = Array.isArray(h.from) && h.from.length === 2 && h.from.every((v) => Number.isFinite(Number(v))) ? h.from.map(Number) : null;
      const lost = p.health > GUN.floor && !p.carried && !p.custody ? wound(p, dmg, { by: typeof h.name === 'string' ? h.name.slice(0, 32) : '', from, at, id }) : 0;
      done.push({ id, lost });
    }
    return { applied: done, health: p.health };
  }

  // ---- the police -----------------------------------------------------------------------------

  const PF = POLICE_FIRE;
  const officers = new Map();      // i -> { by, burst, next, lastSeen, at }
  // An officer hit by a player's round: her life down (never below the floor), and she turns on whoever shot her.
  function officerShot(p, i, amount, point) {
    const rec = conflict.officerShot(i, p, amount);
    if (hub.justice) {
      const key = `${p.id}|n:${i}`;
      const open = book.open && book.open[key] && real() - book.open[key].at < 90 ? book.open[key].crime : null;
      const crime = hub.justice.offence(p, 'shooting_police', { victim: { kind: 'npc', id: i, name: people[i].name }, x: point[0], z: point[2], crime: open });
      (book.open || (book.open = {}))[key] = { crime: crime.id, at: real() };
    }
    if (rec.health > GUN.floor) engage(i, p);
    return { lost: rec.lost, health: rec.health };
  }
  function nearMiss(p, o, d, length) {
    for (const i of POLICE) {
      const at = where(i);
      if (at.pose === POSE.hidden || at.pose === POSE.ride) continue;
      const px = at.x - o[0], pz = at.z - o[2];
      const along = px * d[0] + pz * d[2];
      if (along < 0 || along > length) continue;
      const side = Math.hypot(px - d[0] * along, pz - d[2] * along);
      if (side > PF.near) continue;
      const rec = conflict.record(i);
      if (rec && rec.health <= GUN.floor) continue;
      conflict.officerShot(i, p, 0);
      if (hub.justice) {
        const key = `${p.id}|n:${i}`;
        const open = book.open && book.open[key] && real() - book.open[key].at < 90 ? book.open[key].crime : null;
        const crime = hub.justice.offence(p, 'shooting_police', { victim: { kind: 'npc', id: i, name: people[i].name }, x: at.x, z: at.z, crime: open });
        (book.open || (book.open = {}))[key] = { crime: crime.id, at: real() };
      }
      engage(i, p);
    }
  }
  function engage(i, p) {
    const o = officers.get(i);
    if (o && o.by === p.id) { o.lastSeen = real(); return; }
    officers.set(i, { by: p.id, burst: 0, next: real() + 0.35 + rng.next() * 0.3, lastSeen: real(), at: { x: p.x, z: p.z } });
    if (!actors.has(i)) actors.take(i, state.t);
    actors.hold(i, 'Shooting back', POSE.stand, real() + 30);
    if (talk) { const at = where(i); talk.say({ who: `n:${i}`, name: people[i].short, role: 'Police', text: 'Police! Drop your weapon!', lang: 'en', x: at.x, z: at.z, kind: 'shout', range: 40, hold: 3.2 }); }
  }
  function disengage(i, why = 'Going back on the beat') {
    officers.delete(i);
    conflict.officerDone(i);
    // (one out on a call, justice.js, goes back to it; anyone else goes back to her beat)
    if (actors.has(i) && !(hub.justice && hub.justice.onDuty(i))) actors.release(i, why);
  }
  // brought to 20 in a fist fight (conflict.js): she is out of it
  function officerDown(i) { if (officers.has(i)) { officers.delete(i); conflict.officerDone(i); } }

  // An officer's round at the player she is shooting at: where it goes depends on how near they are, whether they run or
  // crouch; walls stop it as they stop anyone's.
  function officerFires(i, p, m) {
    const ground = zoneGroundY(m.x, m.z);
    const dx = p.x - m.x, dz = p.z - m.z, dist = Math.hypot(dx, dz) || 1;
    const fx = dx / dist, fz = dz / dist;
    const o = [m.x + fx * 0.55 - fz * 0.12, ground + 1.42, m.z + fz * 0.55 + fx * 0.12];
    const crouched = p.gun && p.gun.out && p.gun.crouch;
    const chest = [p.x, zoneGroundY(p.x, p.z) + (crouched ? 0.85 : 1.25), p.z];
    const running = real() - (p.lastMoveAt || -10) < 0.4;
    let chance = PF.hit.close + (PF.hit.far - PF.hit.close) * Math.min(1, Math.max(0, (dist - 6) / (PF.sight - 6)));
    if (running) chance *= PF.hit.running;
    if (crouched) chance *= PF.hit.crouched;
    const hits = rng.next() < chance;
    // a miss goes by them: a little to one side, or over
    const aimAt = hits ? [chest[0] + (rng.next() - 0.5) * 0.25, chest[1] + (rng.next() - 0.5) * 0.5, chest[2] + (rng.next() - 0.5) * 0.25] : [chest[0] + (rng.next() < 0.5 ? -1 : 1) * fz * (0.6 + rng.next()), chest[1] + (rng.next() - 0.3) * 1.2, chest[2] - (rng.next() < 0.5 ? -1 : 1) * fx * (0.6 + rng.next())];
    const v = [aimAt[0] - o[0], aimAt[1] - o[1], aimAt[2] - o[2]];
    const len = Math.hypot(v[0], v[1], v[2]) || 1;
    const d = v.map((k) => k / len);
    const world = rayWorld(o, d, Math.min(GUNS.rifle.range, len + 25), boxes());
    let end = world.point, what = world.what, on = null;
    // does it reach the player? (only a round aimed at them can hit them: a miss goes past)
    if (hits) {
      const k = rayPost(o, d, world.at, p.x, zoneGroundY(p.x, p.z), p.z, crouched ? GUN.body.crouched : GUN.body.height, GUN.body.radius);
      if (Number.isFinite(k)) {
        end = [o[0] + d[0] * k, o[1] + d[1] * k, o[2] + d[2] * k];
        what = 'person'; on = `p:${p.id}`;
        wound(p, GUN.damage, { by: people[i].short, from: [m.x, m.z], at: end });
      }
    }
    recordShot({ from: `n:${i}`, o: o.map(r2), e: end.map(r2), what, on });
  }

  function tick(dt) {
    const now = real();
    // reloads finish
    for (const id of Object.keys(players)) {
      const p = players[id];
      const g = p.gun;
      if (!g) continue;
      if (g.out && (p.health <= GUN.floor || p.custody || p.carried || p.driving || p.incar || p.swimming || (p.astride !== null && p.astride !== undefined) || (p.riding !== null && p.riding !== undefined) || p.dead)) holster(p);
      if (g.reload && now >= g.reload.until) {
        const def = GUNS[g.reload.gun], have = g.have[g.reload.gun];
        if (def && have) { const moved = Math.min(def.magazine - have.mag, have.spare); have.mag += moved; have.spare -= moved; }
        g.reload = null;
      }
    }
    // the officers shooting back
    for (const [i, o] of officers) {
      const p = players[o.by];
      const rec = conflict.record(i);
      // (the 20-life rule: nobody shoots at someone at 20, and nobody at 20 shoots)
      if (!p || p.health <= GUN.floor || p.custody || p.carried || p.dead || !rec || rec.health <= GUN.floor) { disengage(i); continue; }
      const m = actors.get(i);
      if (!m) { officers.delete(i); continue; }
      const d = Math.hypot(p.x - m.x, p.z - m.z);
      // can she see them? (nothing solid between her eyes and their chest)
      const ground = zoneGroundY(m.x, m.z);
      const eye = [m.x, ground + 1.62, m.z], chest = [p.x, zoneGroundY(p.x, p.z) + 1.2, p.z];
      const v = [chest[0] - eye[0], chest[1] - eye[1], chest[2] - eye[2]];
      const len = Math.hypot(v[0], v[1], v[2]) || 1;
      const seen = d <= PF.sight && rayWorld(eye, v.map((k) => k / len), len, boxes()).at >= len - 0.3;
      m.h = Math.atan2(p.x - m.x, p.z - m.z);
      if (seen) {
        o.lastSeen = now; o.at = { x: p.x, z: p.z };
        if (m.mode !== 'hold') actors.hold(i, 'Shooting back', POSE.stand, now + 30);
        else m.until = now + 30;
        if (now >= o.next) {
          if (o.burst <= 0) o.burst = PF.burst[0] + Math.floor(rng.next() * (PF.burst[1] - PF.burst[0] + 1));
          officerFires(i, p, m);
          o.burst -= 1;
          o.next = now + (o.burst > 0 ? 60 / PF.rpm : PF.pause[0] + rng.next() * (PF.pause[1] - PF.pause[0]));
        }
      } else if (now - o.lastSeen > PF.lose) {
        // gone from her sight: she goes to where they were, and gives it up there if they are not to be seen
        if (m.mode === 'hold') actors.walkTo(i, o.at.x, o.at.z, 4.6, 'Looking for the shooter');
        if (now - o.lastSeen > PF.lose + 20) disengage(i, 'Going back on the beat');
      }
    }
    while (book.shots.length && now - book.shots[0].at > GUN.seen) book.shots.shift();
  }

  // ---- what a player is told --------------------------------------------------------------------

  function view(p) {
    const g = gunsOf(p);
    const now = real();
    const def = GUNS[g.equipped];
    return {
      equipped: g.equipped, out: !!g.out, aim: g.aim || 0, crouch: !!g.crouch, server: !!g.server,
      have: Object.keys(g.have).map((id) => ({ id, name: GUNS[id].name, mag: g.have[id].mag, spare: g.have[id].spare, magazine: GUNS[id].magazine, starter: !!GUNS[id].starter })),
      mag: g.have[g.equipped].mag, spare: g.have[g.equipped].spare, magazine: def.magazine,
      reloading: g.reload ? { gun: g.reload.gun, left: Math.max(0, r2(g.reload.until - now)), total: GUNS[g.reload.gun].reload } : null,
      ready: Math.max(0, r2(g.next - now)), seq: g.seq,
    };
  }
  // Shots fired within sight in the last moment, for whoever draws and sounds them (each once, by its number).
  function shotsNear(x, z, range = 400) { return book.shots.filter((s) => Math.hypot(s.o[0] - x, s.o[2] - z) <= range || Math.hypot(s.e[0] - x, s.e[2] - z) <= range); }
  // The officers shooting, and at whom: for drawing them with their rifles up.
  const shooting = () => [...officers.entries()].map(([i, o]) => { const p = players[o.by]; return { i, at: p ? [r2(p.x), r2(p.z)] : [o.at.x, o.at.z], by: o.by }; });

  const api = { draw, holster, equip, aim, reload, fire, owned, struck, confirmed, tick, view, look, trace, shotsNear, shooting, mayShoot, gunsOf, wound, officerDown, isShooting: (i) => officers.has(i) };
  hub.guns = api;
  return api;
}
