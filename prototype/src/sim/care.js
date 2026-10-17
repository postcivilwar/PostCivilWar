// Treatment: the General Hospital, the private clinic, and the ambulance.
//
// A patient is quoted before anything is done: how they are now, each level
// they could be brought up to, what each costs. Paying is one ledger
// transaction keyed by the quote, so that a second tap, or a request sent
// again after a lost connection, is answered with the same receipt and no
// second charge. The fee is the one that was quoted, never more. Treatment
// is given only when the payment has gone through.
//
// The General Hospital belongs to the State: its prices are a fixed tariff,
// there is no bargaining, and what it takes goes to the State's account. The
// clinic is a private business: its owner sets the prices and may be
// bargained with, and what it takes goes to the business.

import { trAmount } from './ledger.js';
import { ZONE, zoneService, zoneWalkable } from './zone.js';
import { GameError } from './registry.js';
import { graphNearest, graphRoute, graphPoint } from './graph.js';
import { HEALTH } from './conflict.js';

export const CARE = Object.freeze({
  levels: Object.freeze([40, 60, 80, 100]),
  places: Object.freeze({
    hospital: Object.freeze({ id: 'hospital', kind: 'government', consult: 60, perPoint: 12, bargain: false }),
    clinic: Object.freeze({ id: 'clinic', kind: 'private', consult: 100, perPoint: 16, bargain: true, floor: 0.75 }),
  }),
  quoteFor: 180,           // real seconds a quote stands
  rounds: 3,               // offers a patient may make at the clinic
  ambulance: Object.freeze({
    fee: 150,              // the call-out; nothing when the caller's health is critical
    below: 60,             // health below which an ambulance will come
    speed: 9.5,            // metres a real second
    reach: 34,             // how near the road the patient must be to be carried to it
    help: 3.0,             // metres a second at which the crew bring someone to the van
    wait: 25,              // real seconds it waits for someone who is not there
    home: Object.freeze({ x: -138, z: -4, h: 0 }),
    // out of the hospital yard to the road
    drive: Object.freeze([[-150, -6], [-168, -14], [-175, -24], [-175, -40]]),
    door: Object.freeze({ x: -144, z: 5.6 }),       // where a patient is set down: the emergency entrance
  }),
});

const round10 = (n) => Math.round(n / 10) * 10;

export function createCare({ state, players, ledger, accounts, emit, hub }) {
  if (!state.care) state.care = { quotes: {}, quoteSeq: 0, prices: { clinic: { consult: CARE.places.clinic.consult, perPoint: CARE.places.clinic.perPoint } }, owner: { clinic: { kind: 'resident', id: zoneService('clinic').staff.split('|')[0] } }, ambulance: { mode: 'parked', x: CARE.ambulance.home.x, z: CARE.ambulance.home.z, h: CARE.ambulance.home.h, path: [], call: null, waited: 0 }, calls: {}, callSeq: 0, totals: { government: 0, clinic: 0, ambulance: 0, treatments: 0 } };
  const book = state.care;
  const real = () => state.real;
  const stateCode = ZONE.government.state.code;

  const placeOf = (id) => { const place = CARE.places[id]; if (!place) throw new GameError('NO_PLACE', 'There is no such hospital.'); return place; };
  const nameOf = (id) => zoneService(id).name;
  const pricesOf = (id) => (CARE.places[id].kind === 'private' ? book.prices[id] : CARE.places[id]);
  const payeeOf = (id) => (CARE.places[id].kind === 'government' ? accounts.government(stateCode) : accounts.business(id));
  const listFee = (id, restored) => { const p = pricesOf(id); return p.consult + p.perPoint * restored; };

  // --- quotes -----------------------------------------------------------------------

  function quoteView(q, p) {
    const balance = ledger.balance(p.wallet);
    return {
      id: q.id, place: q.place, name: nameOf(q.place), kind: CARE.places[q.place].kind, health: q.from, expiresIn: Math.max(0, Math.round(q.expires - real())),
      balance, bargain: CARE.places[q.place].bargain ? { roundsLeft: CARE.rounds - q.rounds } : null,
      options: q.options.map((o) => ({ level: o.level, restored: o.restored, fee: o.fee, list: o.list, balanceAfter: balance - o.fee, affordable: balance >= o.fee })),
      used: q.used ? { level: q.used.level, fee: q.used.fee, txn: q.used.txn } : null,
    };
  }

  // What treatment would cost this patient here, now. A new quote replaces any earlier one at the same place.
  function quote(p, placeId) {
    placeOf(placeId);
    if (p.health >= HEALTH.max) throw new GameError('NOT_NEEDED', 'You are in full health. There is nothing to treat.');
    for (const id of Object.keys(book.quotes)) { const old = book.quotes[id]; if (old.player === p.id && old.place === placeId && !old.used) delete book.quotes[id]; }
    book.quoteSeq += 1;
    const q = { id: `Q-${String(book.quoteSeq).padStart(6, '0')}`, player: p.id, place: placeId, from: p.health, expires: real() + CARE.quoteFor, rounds: 0, used: null, options: [] };
    for (const level of CARE.levels) {
      if (level <= p.health) continue;
      const restored = level - p.health;
      const fee = listFee(placeId, restored);
      q.options.push({ level, restored, fee, list: fee });
    }
    book.quotes[q.id] = q;
    return { quote: quoteView(q, p) };
  }

  function live(p, quoteId) {
    const q = book.quotes[quoteId];
    if (!q || q.player !== p.id) throw new GameError('NO_QUOTE', 'There is no such quote. Ask again at the desk.');
    return q;
  }

  // An offer for one level of treatment, at the clinic only. The owner takes it, or names a lower price than before.
  function bargain(p, quoteId, level, offer) {
    const q = live(p, quoteId);
    const place = CARE.places[q.place];
    if (!place.bargain) throw new GameError('FIXED_PRICE', `${nameOf(q.place)} charges the government tariff. There is no bargaining.`);
    if (q.used) throw new GameError('USED', 'That quote has been paid.');
    if (real() > q.expires) throw new GameError('EXPIRED', 'That quote has run out. Ask again at the desk.');
    const option = q.options.find((o) => o.level === Number(level));
    if (!option) throw new GameError('NO_OPTION', 'That level of treatment was not offered.');
    if (q.rounds >= CARE.rounds) throw new GameError('LAST_PRICE', `"${trAmount(option.fee)} is my last price."`);
    const want = Math.floor(Number(offer));
    if (!Number.isFinite(want) || want <= 0) throw new GameError('BAD_OFFER', 'Name a price.');
    q.rounds += 1;
    const floor = Math.ceil(option.list * place.floor);
    if (want >= option.fee) return { accepted: true, fee: option.fee, said: 'That is the price already.', quote: quoteView(q, p) };
    if (want >= floor) { option.fee = want; return { accepted: true, fee: want, said: `All right. ${trAmount(want)}.`, quote: quoteView(q, p) }; }
    // meet them part of the way, and never go back up
    const counter = Math.max(floor, Math.min(option.fee, round10((option.fee + Math.max(want, floor)) / 2)));
    option.fee = counter;
    return { accepted: false, fee: counter, said: q.rounds >= CARE.rounds ? `${trAmount(counter)}. That is my last price.` : `I cannot do ${trAmount(want)}. ${trAmount(counter)}.`, quote: quoteView(q, p) };
  }

  // Pays for one level of a quote and gives the treatment. Asked twice, it answers twice and charges once.
  function pay(p, quoteId, level) {
    const q = live(p, quoteId);
    const want = Number(level);
    if (q.used) {
      if (q.used.level !== want) throw new GameError('USED', 'That quote has been paid for a different level of treatment. Ask again at the desk.');
      return { ...q.used, health: p.health, replayed: true };
    }
    if (real() > q.expires) throw new GameError('EXPIRED', 'That quote has run out. Ask again at the desk.');
    if (p.health !== q.from) throw new GameError('STALE_QUOTE', 'Your condition has changed since that quote. Ask again at the desk.');
    const option = q.options.find((o) => o.level === want);
    if (!option) throw new GameError('NO_OPTION', 'That level of treatment was not offered.');
    const place = CARE.places[q.place];
    // The ledger checks the balance and moves the money in one step. If it refuses, nothing below this line happens.
    const txn = ledger.post({
      key: `care:${q.id}`, kind: 'medical_fee', initiator: `player:${p.id}`, reason: `Treatment at ${nameOf(q.place)}, to ${option.level}% health`,
      legs: [{ account: p.wallet, amount: -option.fee }, { account: payeeOf(q.place), amount: option.fee }],
      meta: { quote: q.id, place: q.place, from: q.from, to: option.level, restored: option.restored, list: option.list },
    });
    const health = hub.conflict.heal(p, option.level);
    q.used = { level: option.level, restored: option.restored, fee: option.fee, txn: txn.id, at: Math.round(state.t), place: q.place };
    book.totals[place.kind === 'government' ? 'government' : 'clinic'] += option.fee;
    book.totals.treatments += 1;
    return { ...q.used, health, replayed: false };
  }

  // The clinic's owner may change its prices. Nobody else may, and nobody may change the hospital's.
  function setPrices(p, placeId, prices) {
    const place = placeOf(placeId);
    if (place.kind !== 'private') throw new GameError('FIXED_PRICE', 'Those prices are set by the government.');
    const owner = book.owner[placeId];
    if (!owner || owner.kind !== 'player' || owner.id !== p.id) throw new GameError('NOT_OWNER', `Only the owner of ${nameOf(placeId)} sets its prices.`);
    const consult = Math.floor(Number(prices && prices.consult)), perPoint = Math.floor(Number(prices && prices.perPoint));
    if (!(consult >= 0 && consult <= 2000) || !(perPoint >= 1 && perPoint <= 200)) throw new GameError('BAD_PRICE', 'Those prices are out of range.');
    book.prices[placeId] = { consult, perPoint };
    return { prices: { ...book.prices[placeId] } };
  }

  function tariff(placeId) {
    const place = placeOf(placeId);
    const owner = book.owner[placeId];
    return { place: placeId, name: nameOf(placeId), kind: place.kind, bargain: place.bargain, prices: { consult: pricesOf(placeId).consult, perPoint: pricesOf(placeId).perPoint }, example: CARE.levels.map((level) => ({ from: HEALTH.critical, to: level, fee: listFee(placeId, level - HEALTH.critical) })).filter((e) => e.to > e.from), paidTo: place.kind === 'government' ? ZONE.government.state.name : nameOf(placeId), owner: owner ? owner.kind : 'government' };
  }

  // --- the ambulance ---------------------------------------------------------------------

  const A = CARE.ambulance;
  const van = book.ambulance;
  const gateNode = graphNearest(A.drive[A.drive.length - 1][0], A.drive[A.drive.length - 1][1], true);

  function ambulanceInfo(p) {
    const free = p.health <= HEALTH.critical;
    return { fee: free ? 0 : A.fee, free, available: van.mode === 'parked', needed: p.health < A.below, balance: ledger.balance(p.wallet), from: nameOf('hospital') };
  }

  function callAmbulance(p) {
    if (p.custody) throw new GameError('IN_CUSTODY', 'You are in custody. Ask the officer.');
    if (p.carried) throw new GameError('ALREADY', 'You are already in the ambulance.');
    if (p.health >= A.below) throw new GameError('NOT_NEEDED', 'The ambulance is for people who are hurt. You can walk.');
    const mine = Object.values(book.calls).find((c) => c.player === p.id && (c.status === 'coming' || c.status === 'waiting'));
    if (mine) return { call: callView(mine), replayed: true };
    if (van.mode !== 'parked') throw new GameError('BUSY', 'The ambulance is out on another call. Try again shortly, or make your own way.');
    if (p.driving || (p.riding !== null && p.riding !== undefined) || (p.astride !== null && p.astride !== undefined) || p.incar) throw new GameError('NOT_ON_FOOT', 'Stop and get down first.');
    const node = graphNearest(p.x, p.z, true);
    const [nx, nz] = graphPoint(node);
    if (Math.hypot(nx - p.x, nz - p.z) > A.reach) throw new GameError('TOO_FAR', 'The ambulance cannot get near you here. Make your way towards a road and call again.');
    const free = p.health <= HEALTH.critical;
    book.callSeq += 1;
    const call = { id: `AMB-${String(book.callSeq).padStart(5, '0')}`, player: p.id, at: Math.round(state.t), fee: free ? 0 : A.fee, txn: null, status: 'coming', node, x: nx, z: nz };
    if (call.fee > 0) {
      const txn = ledger.post({ key: `ambulance:${call.id}`, kind: 'medical_fee', initiator: `player:${p.id}`, reason: `Ambulance call-out, ${nameOf('hospital')}`, legs: [{ account: p.wallet, amount: -call.fee }, { account: accounts.government(stateCode), amount: call.fee }], meta: { call: call.id } });
      call.txn = txn.id;
      book.totals.ambulance += call.fee;
    }
    book.calls[call.id] = call;
    const road = (graphRoute(gateNode, node, true) || [node]).map((n) => graphPoint(n));
    van.path = [...A.drive.map((pt) => pt.slice()), ...road];
    van.mode = 'out'; van.call = call.id; van.waited = 0;
    return { call: callView(call), replayed: false };
  }
  const callView = (call) => ({ id: call.id, fee: call.fee, status: call.status, txn: call.txn, metres: Math.round(Math.hypot(van.x - call.x, van.z - call.z)) });

  function drive(dt) {
    let budget = A.speed * dt;
    while (budget > 0 && van.path.length) {
      const [tx, tz] = van.path[0];
      const dx = tx - van.x, dz = tz - van.z;
      const gap = Math.hypot(dx, dz);
      if (gap <= budget) { van.x = tx; van.z = tz; budget -= gap; van.path.shift(); } else { van.x += (dx / gap) * budget; van.z += (dz / gap) * budget; van.h = Math.atan2(dx, dz); budget = 0; }
    }
    return van.path.length === 0;
  }

  function homeward() {
    const road = (graphRoute(graphNearest(van.x, van.z, true), gateNode, true) || [gateNode]).map((n) => graphPoint(n));
    van.path = [...road, ...A.drive.slice(0, -1).reverse().map((pt) => pt.slice()), [A.home.x, A.home.z]];
  }

  function tick(dt) {
    const now = real();
    for (const id of Object.keys(book.quotes)) { const q = book.quotes[id]; if (now > q.expires + 600) delete book.quotes[id]; }
    if (van.mode === 'parked') return;
    const call = van.call ? book.calls[van.call] : null;
    const p = call ? players[call.player] : null;
    if (van.mode === 'out') {
      if (!p || p.custody) { if (call) call.status = 'cancelled'; van.mode = 'returning'; homeward(); return; }
      if (drive(dt)) { van.mode = 'waiting'; call.status = 'waiting'; van.waited = 0; emit(p.id, { type: 'note', text: 'The ambulance is here.' }); }
      return;
    }
    if (van.mode === 'waiting') {
      van.waited += dt;
      const d = p ? Math.hypot(p.x - van.x, p.z - van.z) : Infinity;
      const able = p && !p.custody && !p.driving && (p.riding === null || p.riding === undefined) && (p.astride === null || p.astride === undefined) && !p.incar;
      if (able && d <= A.reach + 6) {
        // the crew bring them to the van: a short walk, not a jump
        if (!p.carried) { p.carried = { call: call.id, phase: 'boarding' }; if (hub.conflict) hub.conflict.stop(p); }
        const stride = Math.min(d, A.help * dt);
        if (d > 1.6) { p.x += ((van.x - p.x) / d) * stride; p.z += ((van.z - p.z) / d) * stride; p.heading = Math.atan2(van.x - p.x, van.z - p.z); p.lastMoveAt = now; } else { p.carried.phase = 'aboard'; call.status = 'aboard'; van.mode = 'back'; homeward(); }
        return;
      }
      if (van.waited > A.wait) { call.status = 'missed'; if (p) { p.carried = null; emit(p.id, { type: 'note', text: 'The ambulance waited and has gone back.' }); } van.mode = 'returning'; van.call = null; homeward(); }
      return;
    }
    if (van.mode === 'back') {
      if (p) { p.x = van.x; p.z = van.z; p.heading = van.h; p.lastMoveAt = now; }
      if (drive(dt)) { van.mode = 'unloading'; van.h = A.home.h; if (p) p.carried.phase = 'alighting'; }
      return;
    }
    if (van.mode === 'unloading') {
      if (!p) { van.mode = 'parked'; van.call = null; return; }
      const d = Math.hypot(A.door.x - p.x, A.door.z - p.z);
      if (d > 0.4) { const stride = Math.min(d, A.help * dt); p.x += ((A.door.x - p.x) / d) * stride; p.z += ((A.door.z - p.z) / d) * stride; p.heading = Math.atan2(A.door.x - p.x, A.door.z - p.z); p.lastMoveAt = now; return; }
      p.carried = null; call.status = 'arrived'; van.mode = 'parked'; van.call = null;
      emit(p.id, { type: 'note', text: `You are at the emergency entrance of ${nameOf('hospital')}. Ask at the desk for treatment.` });
      return;
    }
    if (van.mode === 'returning') { if (drive(dt)) { van.mode = 'parked'; van.h = A.home.h; van.call = null; } }
  }

  // The ground the van stands on, for anyone walking: it is in the way wherever it is.
  // (the owner's ambulance, 5.7 m long and 2.4 m wide across its mirrors: supplied-vehicles.js)
  const box = () => (Math.abs(Math.sin(van.h)) > 0.5 ? { x0: van.x - 2.85, x1: van.x + 2.85, z0: van.z - 1.2, z1: van.z + 1.2 } : { x0: van.x - 1.2, x1: van.x + 1.2, z0: van.z - 2.85, z1: van.z + 2.85 });
  const ambulanceView = () => ({ x: Math.round(van.x * 100) / 100, z: Math.round(van.z * 100) / 100, h: Math.round(van.h * 100) / 100, mode: van.mode, siren: van.mode === 'out' || van.mode === 'back' });
  const selfView = (p) => { const call = Object.values(book.calls).find((c) => c.player === p.id && ['coming', 'waiting', 'aboard'].includes(c.status)); return { carried: p.carried ? p.carried.phase : null, ambulance: call ? callView(call) : null }; };
  const audit = () => ({ ...book.totals });
  // Nearest of the two to a point, for the phone's map.
  const nearest = (x, z) => ['hospital', 'clinic'].map((id) => { const s = zoneService(id); return { id, name: s.name, x: s.x, z: s.z, kind: CARE.places[id].kind, metres: Math.round(Math.hypot(s.x - x, s.z - z)) }; }).sort((a, b) => a.metres - b.metres);

  const api = { quote, bargain, pay, setPrices, tariff, ambulanceInfo, callAmbulance, tick, ambulanceView, box, selfView, audit, nearest, quoteOf: (id) => book.quotes[id] || null };
  hub.care = api;
  void zoneWalkable;
  return api;
}
