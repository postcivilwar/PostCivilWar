// Things the tests of fighting, the law, treatment and the phone all need.
import { createHost } from '../src/sim/host.js';
import { zoneWalkable, zoneService } from '../src/sim/zone.js';
import { fund, run, ok } from './helpers.mjs';

export { run, ok };
export const refused = (result, code) => { if (result.ok) throw new Error(`expected a refusal (${code}), got success: ${JSON.stringify(result).slice(0, 200)}`); if (result.code !== code) throw new Error(`expected ${code}, got ${result.code}: ${result.message}`); return result; };

// A town at ten in the morning on a dry day, with one funded player (or several).
// Everyone arrives with ARRIVAL_FUNDS. `broke: true` is for a test about having no money at all: each
// player first leaves their arrival money with family, by an ordinary balanced ledger transfer (nothing is
// written by hand), so that they start with nothing. Implies `funded: false`.
// `people`: who lives in the town, where it is not the town's own (helpers.mjs, FORMER_TOWN: the town as it was, with
// its thousand townspeople, for the tests of what townspeople do).
// `seed`: the world's own dice, where a test needs another throw of them.
export function town(names = ['Emeka Test'], { hour = 10, funded = true, broke = false, people = undefined, seed = undefined } = {}) {
  const host = createHost({ people, seed });
  const g = host.game;
  const ids = names.map((name) => g.join({ name, look: {} }));
  if (broke) for (const id of ids) leaveArrivalMoney(host, g, g.state.players[id]);
  else if (funded) for (const id of ids) fund(host, id);
  const now = (g.state.t % 86400) / 3600;
  g.advance((((hour - now) % 24) + 24) % 24 * 3600);
  g.state.weather = { kind: 'clear', until: 1e15 };
  const players = ids.map((id) => g.state.players[id]);
  const send = (id, message) => g.intent(id, message);
  const place = (p, x, z, heading = 0) => { p.x = x; p.z = z; p.heading = heading; p.lastMoveAt = g.state.real - 5; };
  const balance = (p) => host.auditor.balance(p.wallet);
  const events = (id) => g.drain(id);
  return { host, g, ids, players, id: ids[0], p: players[0], send, place, balance, events, pop: g.internals.population, I: g.internals };
}

// Hands everything in a player's wallet to their family, a ledger account outside the town's economy.
export function leaveArrivalMoney(host, g, p) {
  const economy = g.internals.economy;
  const amount = host.auditor.balance(p.wallet);
  if (amount > 0 && !economy.tryPay('transfer', p.wallet, economy.accounts.business(`family:${p.id}`), amount, `${p.name} leaves the arrival money with family`)) throw new Error('could not hand the arrival money over');
  if (host.auditor.balance(p.wallet) !== 0) throw new Error('the wallet is not empty');
  return amount;
}

// Townspeople standing in the open near a point: [{ i, x, z, d, nerve, who }], nearest first.
export function standing(w, x, z, { range = 60, adult = true, not = [] } = {}) {
  const out = [];
  const o = {};
  for (let i = 0; i < w.pop.count; i += 1) {
    const who = w.pop.people[i];
    if (adult && who.age < 18) continue;
    if (not.includes(who.job)) continue;
    w.pop.locate(i, w.g.state.t, o);
    if (o.pose !== 0 || o.moving) continue;
    const d = Math.hypot(o.x - x, o.z - z);
    if (d <= range) out.push({ i, x: o.x, z: o.z, h: o.h, d, nerve: w.I.conflict.nerve(i), who });
  }
  return out.sort((a, b) => a.d - b.d);
}

// Puts a player within arm's reach of someone, on ground that can be stood on, in front of them or behind.
export function beside(w, p, at, { behind = false, metres = 1.0 } = {}) {
  const sign = behind ? -1 : 1;
  for (const turn of [0, 0.5, -0.5, 1, -1, 1.5, -1.5]) {
    const h = at.h + turn;
    const x = at.x + Math.sin(h) * metres * sign, z = at.z + Math.cos(h) * metres * sign;
    if (zoneWalkable(x, z)) { w.place(p, x, z, Math.atan2(at.x - x, at.z - z)); return { x, z }; }
  }
  throw new Error('no room beside them');
}

export const whereIs = (w, i) => { const o = {}; w.pop.locate(i, w.g.state.t, o); return { x: o.x, z: o.z, pose: o.pose, moving: o.moving, act: o.act }; };
export const post = () => zoneService('police');

// Runs the world until something is true, a tenth of a second at a time. Returns the seconds it took.
export function until(w, test, limit = 240, each = null) {
  for (let t = 0; t < limit; t += 0.1) { if (test()) return t; w.host.tick(0.1); if (each) each(t); }
  throw new Error(`still waiting after ${limit} s`);
}

// Strikes someone until the police have been told, standing still afterwards.
export function assault(w, p, victim, blows = 1) {
  beside(w, p, victim);
  ok(w.send(p.id, { type: 'combat.engage', target: { kind: 'npc', id: victim.i } }));
  const first = ok(w.send(p.id, { type: 'combat.act', move: 'punch' }));
  for (let k = 1; k < blows; k += 1) { run(w.host, 0.5); w.send(p.id, { type: 'combat.act', move: 'punch' }); }
  ok(w.send(p.id, { type: 'combat.disengage' }));
  return first;
}

// Someone to pick on who is a good way from every police officer, so that a test has time before one arrives.
export function farFromPolice(w, list, metres = 110) {
  const officers = w.pop.people.filter((q) => q.job === 'police').map((q) => whereIs(w, q.index)).filter((o) => o.pose !== 4);
  return list.filter((a) => officers.every((o) => Math.hypot(o.x - a.x, o.z - a.z) > metres));
}

// Walks a player in a straight line, a step each tenth of a second, the way someone leading a prisoner would.
export function lead(w, p, x, z, speed = 2.4) {
  for (let guard = 0; guard < 20000; guard += 1) {
    const gap = Math.hypot(x - p.x, z - p.z);
    if (gap < 0.05) return;
    const stride = Math.min(gap, speed * 0.1);
    p.heading = Math.atan2(x - p.x, z - p.z);
    p.x += ((x - p.x) / gap) * stride; p.z += ((z - p.z) / gap) * stride; p.lastMoveAt = w.g.state.real;
    w.host.tick(0.1);
  }
}

// Open ground a long way from every police officer, with room for three people to stand: [x, z].
export function quietSpot(w, metres = 170) {
  const officers = w.pop.people.filter((q) => q.job === 'police').map((q) => whereIs(w, q.index)).filter((o) => o.pose !== 4);
  for (let x = -260; x <= 260; x += 12) for (let z = -360; z <= 100; z += 12) {
    if (officers.some((o) => Math.hypot(o.x - x, o.z - z) < metres)) continue;
    if ([[0, 0], [0.9, 0], [6, 2], [-2, 0], [0, 2], [0, -2], [3, 0]].every(([dx, dz]) => zoneWalkable(x + dx, z + dz))) return [x, z];
  }
  throw new Error('nowhere quiet');
}
