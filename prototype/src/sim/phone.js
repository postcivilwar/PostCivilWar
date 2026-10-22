// The phone: who a player can reach, what was said, and help with bail.
//
// Contacts are kept by the simulation, not by the phone. Emergency numbers
// and the town's businesses are there from the start; another player is added
// by standing next to them and asking. (Townspeople were contacts too, once
// spoken to, until 22 October 2026: the owner's word, the phone reaches only
// players, "becos its only playable character one can phone".)
//
// From custody a player may use the phone only when the officer has allowed
// it, and then only to reach people they know, a few messages at most.
//
// Someone asked to pay a fine is shown where the Police Post is, how far it
// is and how long the walk will take. Only another player can pay it now: a
// townsperson no longer stands it. Money a player came to owe a townsperson who
// paid a fine for them before then is still theirs to repay, whenever they choose.

import { ZONE_SERVICES, zoneService, zoneResident, zoneAccountHolder } from './zone.js';
import { GameError } from './registry.js';
import { LedgerError, trText } from './ledger.js';
import { nearestNode, graphNearest, graphDistance, graphRoute, graphPoint, graphSize, graphIsRoad } from './graph.js';
import { wayBetween, wayLength } from './actors.js';

export const PHONE = Object.freeze({
  messageLength: 160,
  kept: 200,               // messages kept in all
  addWithin: 6,            // metres within which another player can be added as a contact
  suretyMargin: 1000,      // what a townsperson keeps back for themselves before they will stand a fine
  walk: 2.4, drive: 8,     // metres a real second, for telling how long a journey takes
});
const EMERGENCY = Object.freeze([
  Object.freeze({ key: 'svc:police', kind: 'emergency', name: 'Police Post', service: 'police', note: 'Report an offence, or give yourself up' }),
  Object.freeze({ key: 'svc:hospital', kind: 'emergency', name: 'General Hospital, ambulance', service: 'hospital', note: 'An ambulance to where you are' }),
]);

export function createPhone({ state, players, ledger, accounts, residents, talk, emit, clock, hub, serviceState, timeScale }) {
  if (!state.phone) state.phone = { contacts: {}, messages: [], seq: 0, calls: [], requests: {}, sureties: {}, debts: {}, debtSeq: 0 };
  const book = state.phone;
  const real = () => state.real;
  const mine = (p) => book.contacts[p.id] || (book.contacts[p.id] = {});

  // --- contacts -------------------------------------------------------------------

  function contacts(p) {
    const out = EMERGENCY.map((e) => ({ ...e }));
    for (const s of ZONE_SERVICES) if (!EMERGENCY.some((e) => e.service === s.id)) out.push({ key: `svc:${s.id}`, kind: 'business', name: s.name, service: s.id, note: serviceState(s.id).open ? 'Open now' : 'Closed now' });
    for (const [key, c] of Object.entries(mine(p))) { const q = players[c.id]; if (q) out.push({ key, kind: c.tag === 'family' ? 'family' : 'friend', name: q.name, player: q.id, note: c.tag === 'family' ? 'Family' : 'Friend', here: Math.hypot(q.x - p.x, q.z - p.z) < 60 }); }
    return out;
  }

  function addContact(p, playerId) {
    const q = players[playerId];
    if (!q || q.id === p.id) throw new GameError('NO_PLAYER', 'There is nobody there.');
    if (Math.hypot(q.x - p.x, q.z - p.z) > PHONE.addWithin) throw new GameError('TOO_FAR', 'Stand next to them to take their number.');
    mine(p)[`ply:${q.id}`] = { id: q.id, tag: 'friend', at: clock() };
    // the other is told, and is given the number back
    if (!mine(q)[`ply:${p.id}`]) { mine(q)[`ply:${p.id}`] = { id: p.id, tag: 'friend', at: clock() }; emit(q.id, { type: 'note', text: `${p.name} has taken your number, and you have theirs.` }); }
    return { contact: { key: `ply:${q.id}`, name: q.name } };
  }
  function tagContact(p, key, tag) {
    const c = mine(p)[key];
    if (!c) throw new GameError('NO_CONTACT', 'That is not one of your contacts.');
    if (tag !== 'friend' && tag !== 'family') throw new GameError('BAD_TAG', 'Friend or family.');
    c.tag = tag;
    return { key, tag };
  }
  function removeContact(p, key) { if (!mine(p)[key]) throw new GameError('NO_CONTACT', 'That is not one of your contacts.'); delete mine(p)[key]; return {}; }

  const known = (p, key) => contacts(p).find((c) => c.key === key) || null;
  function reach(p, key) {
    const c = known(p, key);
    if (!c) throw new GameError('NO_CONTACT', 'That is not one of your contacts.');
    if (p.custody && !hub.justice.mayCall(p)) throw new GameError('NOT_ALLOWED', 'You are in custody. Ask the officer for a phone call first.');
    if (p.custody && c.kind !== 'friend' && c.kind !== 'family' && c.kind !== 'person') throw new GameError('NOT_ALLOWED', 'From custody you may call only people you know.');
    return c;
  }

  // --- calls ------------------------------------------------------------------------

  function log(p, c, what) { book.calls.push({ by: p.id, to: c.key, name: c.name, at: clock(), what }); if (book.calls.length > 300) book.calls.splice(0, book.calls.length - 300); }

  // A call. What it does depends on who is called; `about` chooses among the things that number can do.
  function call(p, key, about = null) {
    const c = reach(p, key);
    if (c.key === 'svc:police') {
      if (about === 'surrender') { const r = hub.justice.surrender(p); log(p, c, 'Gave yourself up'); return { said: 'Stay where you are. An officer is coming to you.', ...r }; }
      if (about === 'report') {
        const seen = hub.justice.selfView(p).seen;
        if (!seen.length) throw new GameError('NOTHING', 'You have nothing to report.');
        const done = seen.map((s) => hub.justice.reportSeen(p, s.id));
        log(p, c, 'Reported an offence');
        return { said: done.some((d) => d.identified) ? 'Thank you. Officers are being sent.' : 'Thank you. An officer will look into it.', reports: done };
      }
      const law = hub.justice.selfView(p);
      log(p, c, 'Asked the desk');
      return { said: law.state === 'wanted' || law.state === 'pursuit' ? 'We are looking for you. Give yourself up and it will go easier.' : law.owed ? `You still owe ${trText(law.owed)} to people you wronged.` : 'Police Post. Nothing is held against you.', options: [...(law.seen.length ? ['report'] : []), ...(law.state === 'wanted' || law.state === 'pursuit' ? ['surrender'] : [])] };
    }
    if (c.key === 'svc:hospital') {
      if (about === 'ambulance') { const r = hub.care.callAmbulance(p); log(p, c, 'Called the ambulance'); return { said: r.replayed ? 'The ambulance is already on its way.' : 'The ambulance is on its way. Stay by the road.', ...r }; }
      log(p, c, 'Asked about the ambulance');
      return { said: 'General Hospital. Emergency is always open.', ambulance: hub.care.ambulanceInfo(p), options: ['ambulance'] };
    }
    if (c.kind === 'business') {
      const s = zoneService(c.service);
      const status = serviceState(s.id);
      log(p, c, 'Asked if they are open');
      return { said: status.open ? `${s.name}. We are open until ${String(s.closes % 24).padStart(2, '0')}:00.` : `${s.name}. ${status.reason}` };
    }
    if (c.kind === 'person') {
      const r = zoneResident(c.resident);
      const live = residents.get(c.resident);
      const owed = owedTo(p, c.resident);
      log(p, c, 'Spoke');
      return { said: owed ? `${r.short} here. You still owe me ${trText(owed)}, remember.` : live.mode === 'walking' ? `${r.short} here. I am on the road just now.` : `${r.short} here. ${r.talk && r.talk.tip ? r.talk.tip : 'How are you?'}`, options: p.custody ? ['surety'] : owed ? ['repay'] : [] };
    }
    // another player: it rings for them
    const q = players[c.player];
    emit(q.id, { type: 'call', from: p.name, by: p.id, text: `${p.name} is calling you${p.custody ? ' from the Police Post' : ''}.` });
    log(p, c, 'Rang');
    return { said: `Ringing ${q.name}.`, options: p.custody ? ['bail'] : [] };
  }

  // --- messages -----------------------------------------------------------------------

  function message(p, key, text) {
    const c = reach(p, key);
    if (!c.player) throw new GameError('NO_REPLY', 'Messages go to other players. Call this number instead.');
    const body = talk.cleanText(text, PHONE.messageLength);
    if (!body) throw new GameError('EMPTY', 'Write something first.');
    if (p.custody) hub.justice.usedMessage(p);
    book.seq += 1;
    const m = { id: book.seq, from: p.id, to: c.player, text: body, at: clock(), read: false };
    book.messages.push(m);
    if (book.messages.length > PHONE.kept) book.messages.splice(0, book.messages.length - PHONE.kept);
    emit(c.player, { type: 'message', from: p.name, by: p.id, text: body });
    return { message: { id: m.id, to: c.name, text: body, at: m.at } };
  }

  function thread(p, key) {
    const c = known(p, key);
    if (!c || !c.player) throw new GameError('NO_CONTACT', 'That is not one of your contacts.');
    const rows = book.messages.filter((m) => (m.from === p.id && m.to === c.player) || (m.from === c.player && m.to === p.id));
    for (const m of rows) if (m.to === p.id) m.read = true;
    return { with: c.name, messages: rows.slice(-40).map((m) => ({ id: m.id, mine: m.from === p.id, text: m.text, at: m.at })) };
  }
  const unread = (p) => book.messages.filter((m) => m.to === p.id && !m.read).length;

  // --- finding the way ------------------------------------------------------------------

  // The way from where a player stands to a point: the path, how long it is, how long it takes.
  // The way by road: from where the player stands to the nearest road, along the town's roads and lanes to
  // the one nearest the place, and from there to its door. (Two places close enough to see one another need no
  // road between them.) Gives the points, with the player's own first, or null if no road joins the two.
  function byRoad(px, pz, x, z, a, b) {
    if (Math.hypot(x - px, z - pz) < 18) return [[px, pz], [x, z]];
    // Which point of the road to make for, and which to leave it at: not simply the nearest to each end, but
    // the pair that makes the whole journey shortest, walking to and from the road counted three times as dear
    // than keeping to it.
    const near = (qx, qz, nearest) => { const out = []; for (let i = 0; i < graphSize(); i += 1) { if (!graphIsRoad(i)) continue; const [nx, nz] = graphPoint(i); const d = Math.hypot(nx - qx, nz - qz); if (d <= 70) out.push([i, d]); } out.sort((m, n) => m[1] - n[1]); return out.length ? out.slice(0, 20) : [[nearest, Math.hypot(graphPoint(nearest)[0] - qx, graphPoint(nearest)[1] - qz)]]; };
    let best = null;
    for (const [from, d0] of near(px, pz, a)) for (const [to, d1] of near(x, z, b)) {
      const along = graphDistance(from, to, true);
      if (!Number.isFinite(along)) continue;
      const cost = d0 * 3 + along + d1 * 3;
      if (!best || cost < best.cost) best = { cost, from, to };
    }
    const nodes = best ? graphRoute(best.from, best.to, true) : graphRoute(a, b, true);
    if (!nodes) return null;
    const pts = nodes.map((n) => graphPoint(n));
    // not back along the road to its nearest point, when the next one along is as near
    while (pts.length > 1 && Math.hypot(pts[1][0] - px, pts[1][1] - pz) <= Math.hypot(pts[0][0] - px, pts[0][1] - pz) + 1) pts.shift();
    while (pts.length > 1 && Math.hypot(pts[pts.length - 2][0] - x, pts[pts.length - 2][1] - z) <= Math.hypot(pts[pts.length - 1][0] - x, pts[pts.length - 1][1] - z) + 1) pts.pop();
    // a straight stretch of road is two points, however many posts stand along it
    const out = [[px, pz]];
    for (const pt of pts) {
      const n = out.length;
      if (n >= 2 && Math.abs((out[n - 1][0] - out[n - 2][0]) * (pt[1] - out[n - 2][1]) - (out[n - 1][1] - out[n - 2][1]) * (pt[0] - out[n - 2][0])) < 0.05 * Math.hypot(pt[0] - out[n - 2][0], pt[1] - out[n - 2][1]) && n > 2) out[n - 1] = pt; else out.push(pt);
    }
    out.push([x, z]);
    return out;
  }

  function route(p, to) {
    const x = Number(to && to.x), z = Number(to && to.z);
    if (!Number.isFinite(x) || !Number.isFinite(z)) throw new GameError('NO_PLACE', 'There is no such place.');
    const points = wayBetween(p.x, p.z, x, z);
    const metres = wayLength(p.x, p.z, points);
    const a = graphNearest(p.x, p.z, true), b = graphNearest(x, z, true);
    const road = graphDistance(a, b, true);
    const along = byRoad(p.x, p.z, x, z, a, b);
    const round = ([qx, qz]) => [Math.round(qx * 10) / 10, Math.round(qz * 10) / 10];
    return {
      to: { x, z, label: (to && to.label) || '' }, points: [[Math.round(p.x * 10) / 10, Math.round(p.z * 10) / 10], ...points.map(([px, pz]) => [Math.round(px * 10) / 10, Math.round(pz * 10) / 10])],
      metres: Math.round(metres), walkSeconds: Math.round(metres / PHONE.walk), walkMinutes: Math.max(1, Math.round((metres / PHONE.walk) * timeScale / 60)),
      driveSeconds: Number.isFinite(road) ? Math.round(road / PHONE.drive) : null,
      // the same journey kept to the town's roads: what a map shows, and how far that is
      road: along ? along.map(round) : null, roadMetres: along ? Math.round(wayLength(along[0][0], along[0][1], along.slice(1))) : null,
    };
  }

  // --- bail ---------------------------------------------------------------------------------

  // A prisoner asks another player to come and pay.
  function askBail(p, key) {
    const c = reach(p, key);
    if (!c.player) throw new GameError('NO_CONTACT', 'Ask another player, or someone in town who knows you.');
    if (!p.custody) throw new GameError('NOT_IN_CUSTODY', 'You are not under arrest.');
    const bail = hub.justice.bailFor(p.custody);
    if (!bail) throw new GameError('NOT_NEEDED', 'There is nothing to pay.');
    book.requests[`${p.custody}|${c.player}`] = { arrest: p.custody, from: p.id, to: c.player, at: clock() };
    emit(c.player, { type: 'call', from: p.name, by: p.id, text: `${p.name} is held at the ${bail.station.name} and asks you to pay a fine of ${trText(bail.amount)}. Your phone shows the way.`, arrest: p.custody });
    return { asked: c.name, amount: bail.amount };
  }

  // What has been asked of a player, with the way to the Police Post.
  function requests(p) {
    const out = [];
    for (const key of Object.keys(book.requests)) {
      const r = book.requests[key];
      if (r.to !== p.id) continue;
      const bail = hub.justice.bailFor(r.arrest);
      if (!bail) { delete book.requests[key]; continue; }
      const way = route(p, { ...bail.station, label: bail.station.name });
      out.push({ kind: 'bail', arrest: bail.arrest, no: bail.no, from: bail.name, amount: bail.amount, ready: bail.status === 'custody' && bail.confirmed, station: bail.station, metres: way.metres, walkMinutes: way.walkMinutes, walkSeconds: way.walkSeconds, canPay: ledger.balance(p.wallet) >= bail.amount, near: Math.hypot(p.x - bail.station.x, p.z - bail.station.z) <= 6 });
    }
    return out;
  }

  // --- what is owed to a townsperson who stood a fine, before 22 October 2026 ---------------------

  const owedTo = (p, residentId) => Object.values(book.debts).filter((d) => d.player === p.id && d.to === residentId).reduce((sum, d) => sum + d.left, 0);
  const nameOf = (residentId) => { const r = zoneAccountHolder(residentId); return r ? r.name : 'a townsperson'; };
  const debtsOf = (p) => Object.values(book.debts).filter((d) => d.player === p.id && d.left > 0).map((d) => ({ id: d.id, to: nameOf(d.to), resident: d.to, amount: d.amount, left: d.left, at: d.at }));

  // (a townsperson no longer stands a player's fine: only another player can pay it, 22 October 2026)
  function askSurety(p, key) {
    void key;
    if (!p.custody) throw new GameError('NOT_IN_CUSTODY', 'You are not under arrest.');
    throw new GameError('PLAYERS_ONLY', 'Only another player can pay your fine for you. Ask a friend or your family from your contacts, or pay it yourself.');
  }

  function repay(p, debtId, amount) {
    const d = book.debts[debtId];
    if (!d || d.player !== p.id || d.left <= 0) throw new GameError('NO_DEBT', 'You owe nothing there.');
    const pay = Math.min(d.left, Math.max(1, Math.floor(Number(amount) || d.left)));
    d.paySeq = (d.paySeq || 0) + 1;
    const txn = ledger.post({ key: `repay:${d.id}:${d.paySeq}`, kind: 'transfer', initiator: `player:${p.id}`, reason: `Repaid to ${nameOf(d.to)}`, legs: [{ account: p.wallet, amount: -pay }, { account: accounts.resident(d.to), amount: pay }], meta: { debt: d.id } });
    d.left -= pay;
    return { paid: pay, left: d.left, txn: txn.id };
  }

  function tick() {
    // a townsperson on the way to pay a fine when townspeople stopped standing them goes back to their day, and the
    // prisoner is told (a save from before 22 October 2026)
    for (const key of Object.keys(book.sureties)) {
      const s = book.sureties[key];
      if (zoneResident(s.resident)) residents.release(s.resident);
      if (players[s.player]) emit(s.player, { type: 'note', text: `${nameOf(s.resident)} cannot come to pay your fine after all. Ask another player to pay it, or pay it yourself.` });
      delete book.sureties[key];
    }
  }

  function selfView(p) {
    return { unread: unread(p), requests: requests(p), debts: debtsOf(p), surety: p.custody && book.sureties[p.custody] ? nameOf(book.sureties[p.custody].resident) : null };
  }
  function recent(p) { return { calls: book.calls.filter((c) => c.by === p.id).slice(-12).reverse() }; }

  const api = { contacts, addContact, tagContact, removeContact, call, message, thread, route, askBail, requests, askSurety, repay, tick, selfView, recent };
  hub.phone = api;
  return api;
}
