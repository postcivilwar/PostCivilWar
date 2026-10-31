// The law: offences, who saw them, who is wanted, the police, arrest,
// custody, fines, and what was stolen being given back.
//
// Everything here is the simulation's own record. A client cannot say that
// it is or is not wanted, that it has or has not been arrested, what its fine
// is, or that it is a police officer: those are read from here and nowhere
// else. Every payment is one ledger transaction with a key made from the
// thing being paid for (the offence, the arrest), so that asking twice, or
// asking again after a lost connection, pays once.
//
// How it goes:
//   an offence is recorded the moment it happens, seen or not
//   only the police are witnesses (22 October 2026, the owner's word: "remove
//     witness. only police should serve as witness"), and only what an officer
//     on the scene sees is a crime (31 October 2026, the owner's word: "the
//     only time a character gets a star is if police js around on the scene
//     during the crime. If police is out of sight, don't count it as crime"):
//     an officer within LAW.witness.range with a clear view of it sees it,
//     always (something done by stealth, a pocket picked, only within
//     LAW.witness.sure); an officer it was done to knows it, wherever she was
//   one no officer saw is written in the book and goes no further: nobody
//     reports it afterwards (not the person wronged, by phone or otherwise),
//     nobody finds anything out about it later, and it brings no stars; an
//     officer who comes upon it while it is still going on (a fight, more
//     blows) sees it then
//   one an officer saw is the police's at once: the culprit is wanted
//   officers on duty walk or run to where the culprit was last seen: nobody
//     appears from nowhere
//   an officer who can see the culprit gives chase, challenges, and lays
//     hands on them when they stand still or are caught
//   what was stolen is taken back and returned; a fine is set; the culprit is
//     walked to the Police Post
//   there they pay, or someone pays for them, or they sit out their time

import { ZONE, ZONE_SPOTS, zoneService, zoneWalkable, zoneSolid } from './zone.js';
import { GameError } from './registry.js';
import { LedgerError, fineShares, trText, TR } from './ledger.js';
import { POSE } from './population.js';
import { PACE, clearLine } from './actors.js';

export const LAW = Object.freeze({
  // Fines are in ledger units, two to a TR (src/sim/ledger.js). The owner's rule (10 October 2026): the police
  // charge 10 TR for a crime, whatever it was, and 100 TR where someone was killed. A player constable sets the
  // fine once, from half the charge up to the charge and never above it.
  offences: Object.freeze({
    assault: Object.freeze({ name: 'Assault', severity: 2, fine: 10 * TR, hours: 2 }),
    assault_serious: Object.freeze({ name: 'Assault causing harm', severity: 3, fine: 10 * TR, hours: 4 }),
    theft: Object.freeze({ name: 'Stealing', severity: 2, fine: 10 * TR, hours: 3 }),
    vehicle_theft: Object.freeze({ name: 'Taking a vehicle', severity: 3, fine: 10 * TR, hours: 5 }),
    resisting: Object.freeze({ name: 'Resisting arrest', severity: 1, fine: 10 * TR, hours: 1 }),
    dangerous_driving: Object.freeze({ name: 'Dangerous driving causing harm', severity: 3, fine: 10 * TR, hours: 4 }),
    death_by_driving: Object.freeze({ name: 'Causing death by dangerous driving', severity: 4, fine: 100 * TR, hours: 8, death: true }),
    // (25 October 2026: guns. The charge is the owner's rule for any crime, 10 TR)
    shooting: Object.freeze({ name: 'Shooting at someone', severity: 3, fine: 10 * TR, hours: 4 }),
    shooting_police: Object.freeze({ name: 'Shooting at a police officer', severity: 4, fine: 10 * TR, hours: 6 }),
  }),
  compensation: 300,               // paid to a player who was put in hospital, out of the culprit's pocket (150 TR)
  mostHours: 8,
  // what a player constable may set: from 5 TR to the charge of 10 TR, or to 100 TR where someone was killed
  constableFine: Object.freeze({ least: 5 * TR, most: 10 * TR, mostWithDeath: 100 * TR }),
  // (31 October 2026: an officer with a clear view of it within `range` metres always sees it, and nobody else does;
  // something done by stealth only within `sure`; at most `most` of them are counted)
  witness: Object.freeze({ range: 30, most: 8, sure: 15 }),
  report: Object.freeze([0.5, 0.5]),   // real seconds for an officer who saw it to have it known to the police
  sight: 32,                           // metres at which an officer knows a wanted person on sight
  reach: 1.9,                          // metres at which an officer can lay hands on someone
  still: 0.7,                          // real seconds the suspect must have stood still to be taken without a struggle
  lost: 25,                            // real seconds out of sight before a chase is broken off
  search: 8,                           // real seconds an officer looks about where the trail ends
  lapse: 12 * 3600,                    // game seconds unseen before a wanted person is no longer looked for
  tax: 0.01,                           // the government's share when a constable made the arrest
  confirmWithin: 60,                   // real seconds a constable has to set the fine before it stands at the scale
  callWait: 30,                        // real seconds a constable has to answer a request for a phone call
  bookWithin: 300,                     // real seconds a constable has to bring a prisoner in
  cuffed: 4,                           // real seconds a prisoner of the town's police is held in handcuffs where caught, before they are at the Police Post
  released: 60,                        // real seconds the "released" state lasts
  steal: Object.freeze({ reach: 1.6, npc: Object.freeze([60, 380]), player: 200, share: 0.05, chance: 0.55, behind: 0.25 }),
  constables: 4,
  messagesInCustody: 3,
});
export const LAW_STATES = Object.freeze(['normal', 'suspicious', 'wanted', 'pursuit', 'arrested', 'custody', 'released']);

// The stars (30 October 2026, the owner's brief: "That star is for the police. The star increases as you commit crime",
// by the rules he was shown with the plan for the police, its question 7): how wanted a player is, one to five, shown
// at the top of their screen. Each crime the police come to know of raises them to its own number, if that is higher:
//   1  stealing, a fight
//   2  hurting someone badly in a fight, taking a vehicle, dangerous driving that hurts someone, running on after being
//      told to stop
//   3  shooting at a player or at a police officer, killing someone with a vehicle
//   4  bringing a police officer down to 20 (`raise`, 'officer_down')
//   5  bringing three or more officers down to 20
// They never go down while an officer can see the player, or while officers are on their way to where the player was
// last seen. Out of every officer's sight, one goes at a time, after `fade` real seconds for the number there are (20
// at one star, 30 at two, 45 at three, 60 at four, 90 at five); seen again, the fading starts again. When the last one goes the player is no longer looked for (what they did stays in the
// police's book, unsolved). How many officers come, and how hard they run, go with the stars (`officers`, `pace`); at
// one star they jog and give up sooner (`lost`). The police's motorcycles, cars and helicopter at two stars and more,
// and SARS and the army at four and five, come with those stages of the plan. At 20 life every chase stops (the
// owner's 20-life rule): the stars go at once.
export const STARS = Object.freeze({
  of: Object.freeze({ theft: 1, assault: 1, assault_serious: 2, vehicle_theft: 2, dangerous_driving: 2, resisting: 2, shooting: 3, shooting_police: 3, death_by_driving: 3, officer_down: 4, officers_down: 5 }),
  most: 5,
  fade: Object.freeze([0, 20, 30, 45, 60, 90]),
  officers: Object.freeze([0, 1, 2, 3, 4, 6]),
  lost: Object.freeze([25, 12, 25, 30, 40, 50]),
  officersDown: 3,             // officers brought down to 20 by one player that make it five stars
});
export const starsOf = (type) => STARS.of[type] || 1;

// Can someone at (x1, z1) see (x0, z0)? Nothing standing up between them at the height of the eyes (a wall, a building,
// a tree, a parked coach); open ground and water are no hindrance, so the river is seen across from its bank (31
// October 2026), and the low boards of a roadblock are seen over.
const EYES = 1.5;
export function inSight(x0, z0, x1, z1) {
  const gap = Math.hypot(x1 - x0, z1 - z0);
  const steps = Math.max(1, Math.ceil(gap / 0.6));
  for (let i = 1; i < steps; i += 1) if (zoneSolid(x0 + ((x1 - x0) * i) / steps, z0 + ((z1 - z0) * i) / steps, 0.1, EYES)) return false;
  return true;
}

const SHOUTS = Object.freeze([['Police! Police!', 'Police! Police o!'], ['Hey! Stop that!', 'Hey! Stop am!'], ['Somebody call the police!', 'Make person call police!']]);
const THIEF = Object.freeze([['Thief! Thief!', 'Ole! Ole!'], ['My money! Somebody has taken my money!', 'My money! Person don carry my money!']]);
const hash = (a, b = 0) => { let h = (a * 374761393 + b * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const pad = (n, width) => String(n).padStart(width, '0');

export function createJustice({ state, players, ledger, accounts, population, actors, talk, emit, rng, hub }) {
  if (!state.justice) state.justice = { crimes: {}, crimeSeq: 0, arrests: {}, arrestSeq: 0, officers: {}, roles: {}, badgeSeq: 0, picked: {}, owed: {}, totals: { fines: 0, toGovernment: 0, toConstables: 0, restitution: 0, stolen: 0 } };
  const book = state.justice;
  const people = population.people;
  const POLICE = people.filter((p) => p.job === 'police').map((p) => p.index);
  const post = zoneService('police');
  const treasury = () => accounts.government(post.jurisdiction);
  const households = ledger.openAccount('community', 'households', 'pool');
  const probe = {};
  const real = () => state.real;
  const where = (i) => population.locate(i, state.t, probe);
  // where a prisoner is brought to, and stands while held: in front of the desk
  const STATION = (() => { for (const [dx, dz] of [[0, -1.2], [1.5, -1.2], [-1.5, -1.2], [0, -2.4], [0, 0]]) if (zoneWalkable(post.x + dx, post.z + dz)) return { x: post.x + dx, z: post.z + dz }; return { x: post.x, z: post.z }; })();
  const DOOR = { x: post.x, z: post.z };

  for (const id of Object.keys(players)) if (!players[id].law) players[id].law = { state: 'normal', since: 0, crimes: [], seenAt: null };
  const lawOf = (p) => p.law || (p.law = { state: 'normal', since: 0, crimes: [], seenAt: null });
  const setState = (p, next) => { const law = lawOf(p); if (law.state !== next) { law.state = next; law.since = real(); } };

  const victimAccount = (victim) => (victim.kind === 'player' ? (players[victim.id] ? players[victim.id].wallet : null) : victim.kind === 'resident' ? accounts.resident(victim.id) : households);
  const speak = (i, lines) => { const who = people[i]; const at = where(i); const pick = lines[Math.floor(rng.next() * lines.length)]; const pidgin = who.langs.includes('pcm') && who.lang !== 'en'; talk.say({ who: `n:${i}`, name: who.short, text: pidgin ? pick[1] : pick[0], lang: pidgin ? 'pcm' : 'en', gloss: pidgin ? pick[0] : null, x: at.x, z: at.z, kind: 'shout', range: 30, hold: 3.2 }); };
  const officerSays = (i, text) => { const at = where(i); talk.say({ who: `n:${i}`, name: people[i].short, role: 'Police', text, lang: 'en', x: at.x, z: at.z, kind: 'shout', range: 34, hold: 3.6 }); };

  // --- offences ---------------------------------------------------------------------

  // Which police officers saw an offence: every officer on the scene, out in the open within LAW.witness.range of it
  // (within LAW.witness.sure of something done by stealth) with nothing standing between her and it (`inSight`), and not
  // lying on the ground; and an
  // officer it was done to, wherever she was. Nobody but the police is a witness: not a townsperson, not the person
  // wronged, and not another player standing by. Nothing here is left to chance (31 October 2026).
  function witnessesOf(crime, culprit, stealth) {
    const out = [];
    const far = stealth ? LAW.witness.sure : LAW.witness.range;
    for (const i of POLICE) {
      if (out.length >= LAW.witness.most) break;
      const at = where(i);
      if (at.pose === POSE.hidden) continue;
      const d = Math.hypot(at.x - crime.x, at.z - crime.z);
      const wronged = crime.victim.kind === 'npc' && crime.victim.id === i;
      if (!wronged && (d > far || at.pose === POSE.lie || !inSight(crime.x, crime.z, at.x, at.z))) continue;
      out.push({ kind: 'npc', id: i, name: people[i].name, metres: Math.round(d), police: true, ...(wronged ? { wronged: true } : {}) });
    }
    void culprit;
    return out;
  }

  // People who saw it back away or cry out. Nobody near a fight carries on as if nothing had happened.
  function stir(crime, culprit, lines = SHOUTS) {
    let cried = false;
    for (const w of crime.witnesses) {
      if (w.kind !== 'npc' || w.police || w.stirred) continue;
      w.stirred = true;
      const brave = hub.conflict ? hub.conflict.nerve(w.id) : 0.5;
      if (!cried && brave >= 0.4) { speak(w.id, lines); cried = true; }
      if (w.metres < 14 && brave < 0.7 && !actors.has(w.id)) {
        if (!actors.take(w.id, state.t)) continue;
        if (brave < 0.4) actors.flee(w.id, crime.x, crime.z, PACE.run, 'Running from trouble', 20);
        else actors.flee(w.id, crime.x, crime.z, PACE.hurry, 'Backing away', 9);
        const m = actors.get(w.id);
        m.until = 0; m.after = real() + 14;
      }
    }
  }

  function known(crime) { return crime.detection === 'identified'; }

  // Records an offence. `info.crime` continues one already under way (more blows in the same fight).
  //   info: { victim: { kind, id, name }, x, z, amount, stealth, noticed, vehicle }
  // Only an officer on the scene makes it a crime the police know of (`seenBy`); one no officer saw is `unseen`, and
  // stays so unless an officer comes upon it while it is still going on.
  const seenBy = (crime) => { if (crime.detection !== 'identified' && crime.witnesses.some((w) => w.police)) { crime.detection = 'identified'; crime.reportAt = real() + LAW.report[0]; } };
  function offence(p, type, info) {
    const rule = LAW.offences[type];
    if (!rule) throw new Error(`no such offence: ${type}`);
    let crime = info.crime ? book.crimes[info.crime] : null;
    if (crime && crime.status === 'open' && crime.culprit === p.id) {
      crime.count += 1; crime.x = info.x; crime.z = info.z;
      if (real() - crime.lookedAt > 2 && crime.witnesses.length < LAW.witness.most) {
        crime.lookedAt = real();
        for (const w of witnessesOf(crime, p, false)) if (!crime.witnesses.some((e) => e.kind === w.kind && e.id === w.id)) crime.witnesses.push(w);
        stir(crime, p);
        // (an officer has come upon it now)
        seenBy(crime);
      }
      return { id: crime.id, isNew: false };
    }
    book.crimeSeq += 1;
    crime = {
      id: `CR-${pad(book.crimeSeq, 6)}`, no: `${ZONE.lgaCode}/CR/${pad(book.crimeSeq + 1000, 4)}`, type, culprit: p.id, culpritName: p.name,
      victim: { kind: info.victim.kind, id: info.victim.id, name: info.victim.name }, amount: info.amount || 0, recovered: 0, vehicle: info.vehicle || null,
      x: Math.round(info.x * 10) / 10, z: Math.round(info.z * 10) / 10, at: Math.round(state.t), real: real(), count: 1, lookedAt: real(),
      witnesses: [], detection: 'unseen', status: 'open', arrest: null, reportAt: null, discoverAt: null, txn: info.txn || null,
    };
    book.crimes[crime.id] = crime;
    crime.witnesses = witnessesOf(crime, p, !!info.stealth);
    seenBy(crime);
    stir(crime, p, type === 'theft' ? THIEF : SHOUTS);
    // a player wronged, who knows who did it (unless it was done by stealth and they felt nothing), is told whether the
    // police saw it
    const victimKnows = !info.stealth || !!info.noticed;
    if (crime.victim.kind === 'player' && victimKnows) emit(crime.victim.id, { type: 'witness', crime: crime.id, text: `${p.name} has wronged you: ${rule.name.toLowerCase()}. ${known(crime) ? 'A police officer saw it.' : 'No police officer was there to see it.'}` });
    return { id: crime.id, isNew: true };
  }

  // An offence turns out graver than it first looked.
  function worsen(crimeId, type) {
    const crime = book.crimes[crimeId];
    if (crime && crime.status === 'open' && LAW.offences[type].severity > LAW.offences[crime.type].severity) {
      crime.type = type;
      // (already known to the police: the stars go up with it)
      const p = players[crime.culprit];
      if (p && crime.detection === 'identified' && !crime.reportAt) { const law = lawOf(p); if ((law.state === 'wanted' || law.state === 'pursuit') && law.crimes.includes(crime.id)) { law.stars = Math.min(STARS.most, Math.max(law.stars || 0, starsOf(type))); law.unseen = 0; } }
    }
  }

  // The police now know who did it.
  function reported(crime) {
    const p = players[crime.culprit];
    crime.reportAt = null; crime.discoverAt = null;
    if (!p || crime.status !== 'open') return;
    crime.detection = 'identified';
    const law = lawOf(p);
    if (!law.crimes.includes(crime.id)) law.crimes.push(crime.id);
    if (!law.seenAt || crime.real >= law.seenAt.real) law.seenAt = { x: crime.x, z: crime.z, real: crime.real, t: crime.at };
    const was = law.state === 'wanted' || law.state === 'pursuit' ? law.stars || 0 : 0;
    if (law.state === 'normal' || law.state === 'suspicious' || law.state === 'released') { setState(p, 'wanted'); emit(p.id, { type: 'police', title: 'Wanted', text: `You have been reported to the police: ${LAW.offences[crime.type].name.toLowerCase()}. Officers are looking for you.` }); }
    law.wantedAt = state.t;
    law.stars = Math.min(STARS.most, Math.max(was, starsOf(crime.type), downStars(p)));
    law.unseen = 0;
    dispatch(p, crime);
  }
  // officers this player has brought down to 20 since the police last had them or gave up on them: four stars for one,
  // five for three or more (counted when it happens, before the police may know who did it)
  const downStars = (p) => { const n = book.downed && book.downed[p.id] ? book.downed[p.id].length : 0; return n >= STARS.officersDown ? STARS.of.officers_down : n ? STARS.of.officer_down : 0; };

  // More stars than the crimes on the book give, for what the police see done to their own (guns.js, conflict.js): an
  // officer brought down to 20 is four stars, three or more of them five. Only for someone already known to them.
  function raise(p, kind, officer = null) {
    const law = lawOf(p);
    if (kind === 'officer_down' && officer !== null) { const downed = (book.downed || (book.downed = {}))[p.id] || (book.downed[p.id] = []); if (!downed.includes(officer)) downed.push(officer); }
    if (law.state !== 'wanted' && law.state !== 'pursuit') return law.stars || 0;
    const next = Math.min(STARS.most, Math.max(law.stars || 0, STARS.of[kind] || 0, downStars(p)));
    if (next > (law.stars || 0)) { law.stars = next; law.unseen = 0; dispatch(p, null); }
    return law.stars;
  }

  // No longer looked for: what they did stays on the books, unsolved; the officers after them go back to their beats.
  function lapse(p, text = 'The police have stopped looking for you.') {
    const law = lawOf(p);
    for (const c of law.crimes) if (book.crimes[c] && book.crimes[c].status === 'open') book.crimes[c].status = 'lapsed';
    law.crimes = []; law.stars = 0; law.unseen = 0; law.resisted = false; law.surrendered = false;
    if (book.downed) delete book.downed[p.id];
    for (const o of Object.values(book.officers)) if (o.suspect === p.id && o.duty !== 'escort') dutyOver(o.i);
    setState(p, 'normal');
    emit(p.id, { type: 'police', title: 'No longer wanted', text });
  }

  // A player who suffered an offence, or saw one, tells the police by phone (phone.js). Only what an officer saw is a
  // crime the police act on (31 October 2026): one an officer saw is the police's at once if word of it has not reached
  // them yet; of one no officer saw, there is nothing they can do.
  function reportSeen(q, crimeId) {
    const crime = book.crimes[crimeId];
    if (!crime || crime.status !== 'open') throw new GameError('NO_CRIME', 'There is nothing open under that number.');
    const saw = crime.witnesses.some((w) => w.kind === 'player' && w.id === q.id);
    const wronged = crime.victim.kind === 'player' && crime.victim.id === q.id;
    if (!saw && !wronged) throw new GameError('NOT_A_WITNESS', 'You did not see that happen.');
    if (!known(crime)) return { crime: crime.no, identified: false, unseen: true };
    if (crime.reportAt) reported(crime);
    return { crime: crime.no, identified: true };
  }

  // --- stealing ----------------------------------------------------------------------

  function steal(p, target) {
    if (hub.conflict && hub.conflict.critical(p)) throw new GameError('CRITICAL', 'Your health is critical.');
    const day = Math.floor(state.t / 86400);
    book.stealSeq = (book.stealSeq || 0);
    if (!target || (target.kind !== 'npc' && target.kind !== 'player')) throw new GameError('NO_TARGET', 'There is nobody there.');
    let victim, at, account, amount, facing;
    if (target.kind === 'npc') {
      const i = Number(target.id);
      if (!Number.isInteger(i) || i < 0 || i >= population.count) throw new GameError('NO_TARGET', 'There is nobody there.');
      at = { ...where(i) };
      if (at.pose === POSE.hidden || at.pose === POSE.ride) throw new GameError('NO_TARGET', 'There is nobody there.');
      if (people[i].age < 16) throw new GameError('A_CHILD', 'That is a child. You will not.');
      if (book.picked[`n:${i}`] === day) throw new GameError('NOTHING_LEFT', `${people[i].short} has nothing more on them today.`);
      victim = { kind: 'npc', id: i, name: people[i].name };
      account = households;
      amount = Math.round((LAW.steal.npc[0] + hash(i, day) * (LAW.steal.npc[1] - LAW.steal.npc[0])) / 10) * 10;
      facing = at.h;
    } else {
      const q = players[target.id];
      if (!q || q.id === p.id) throw new GameError('NO_TARGET', 'There is nobody there.');
      if (q.custody || q.carried) throw new GameError('NO_TARGET', 'You cannot reach them.');
      at = { x: q.x, z: q.z };
      if (book.picked[`p:${q.id}:${p.id}`] === day) throw new GameError('NOTHING_LEFT', `${q.name} is watching their pockets now.`);
      victim = { kind: 'player', id: q.id, name: q.name };
      account = q.wallet;
      // never more than pocket money: a small, fixed ceiling and a small share of what they have
      amount = Math.min(LAW.steal.player, Math.floor(ledger.balance(q.wallet) * LAW.steal.share));
      facing = q.heading;
    }
    if (Math.hypot(at.x - p.x, at.z - p.z) > LAW.steal.reach) throw new GameError('TOO_FAR', 'You are too far away. Get closer.');
    // from behind is easier
    const behind = Math.cos(Math.atan2(p.x - at.x, p.z - at.z) - facing) < -0.3;
    const success = amount > 0 && rng.next() < LAW.steal.chance + (behind ? LAW.steal.behind : 0);
    book.picked[target.kind === 'npc' ? `n:${victim.id}` : `p:${victim.id}:${p.id}`] = day;
    if (!success) {
      // caught with a hand in the pocket: nothing taken, and they know exactly who it was
      const crime = offence(p, 'theft', { victim, x: at.x, z: at.z, amount: 0, stealth: true, noticed: true });
      return { taken: 0, noticed: true, crime: crime.id };
    }
    const crimeId = `CR-${pad(book.crimeSeq + 1, 6)}`;
    const txn = ledger.post({ key: `theft:${crimeId}`, kind: 'theft', initiator: `player:${p.id}`, reason: `Taken from ${victim.name}`, legs: [{ account, amount: -amount }, { account: p.wallet, amount }], meta: { crime: crimeId, victim: `${victim.kind}:${victim.id}` } });
    const crime = offence(p, 'theft', { victim, x: at.x, z: at.z, amount, stealth: true, noticed: false, txn: txn.id });
    book.totals.stolen += amount;
    // a player is told at once that the money is gone: nobody loses money without knowing it
    if (victim.kind === 'player') emit(victim.id, { type: 'alert', title: 'Your pocket has been picked', text: `${trText(amount)} are gone. You did not see who took them. ${known(book.crimes[crime.id]) ? 'A police officer saw it.' : 'No police officer was there to see it.'}`, amount: -amount, txn: txn.id, crime: crime.id });
    return { taken: amount, noticed: known(book.crimes[crime.id]), crime: crime.id, txn: txn.id };
  }

  // --- the police ----------------------------------------------------------------------

  const onDuty = (i) => book.officers[i] || null;
  // Can this officer be sent now, and from where?
  function available(i) {
    if (book.officers[i]) return null;
    const m = actors.get(i);
    if (m && !m.home) return null;                    // caught up in something else (a fight, say)
    const at = where(i);
    if (at.pose !== POSE.hidden) return { x: at.x, z: at.z, from: null };
    const spot = ZONE_SPOTS[at.spot];
    if (spot && spot.venue === 'police') return { x: DOOR.x, z: DOOR.z, from: DOOR };      // in the post: comes out of the door
    return null;                                      // at home, off duty
  }

  function send(i, from, duty, crime, suspect, goal) {
    if (actors.has(i)) actors.drop(i);
    const m = actors.take(i, state.t, from);
    if (!m) return null;
    book.officers[i] = { i, duty, crime: crime ? crime.id : null, suspect: suspect ? suspect.id : null, seen: 0, lost: 0, challenged: false, challengeAt: null, sentAt: real(), arrived: 0 };
    actors.walkTo(i, goal.x, goal.z, PACE.run, duty === 'investigate' ? 'Looking into a report' : 'Answering a call');
    return book.officers[i];
  }

  function nearestFree(x, z, count) {
    const list = [];
    for (const i of POLICE) { const a = available(i); if (a) list.push({ i, from: a.from, d: Math.hypot(a.x - x, a.z - z) }); }
    return list.sort((a, b) => a.d - b.d).slice(0, count);
  }

  function dispatch(p, crime) {
    const law = lawOf(p);
    const already = Object.values(book.officers).filter((o) => o.suspect === p.id && o.duty !== 'return').length;
    // (how many come goes with the stars: one at one star, up to six at five)
    const want = Math.max(crime && LAW.offences[crime.type].severity >= 3 ? 2 : 1, STARS.officers[Math.min(STARS.most, law.stars || 0)] || 0) - already;
    const goal = law.seenAt || { x: p.x, z: p.z };
    for (const pick of nearestFree(goal.x, goal.z, Math.max(0, want))) send(pick.i, pick.from, 'respond', crime, p, goal);
  }

  const sees = (m, p) => { const d = Math.hypot(p.x - m.x, p.z - m.z); return d < 8 || (d < LAW.sight && clearLine(m.x, m.z, p.x, p.z, 0.1)); };
  // how hard the police run after someone: at one star a jog, from two up flat out (STARS)
  const chasePace = (law) => ((law.stars || 0) <= 1 ? PACE.hurry : PACE.sprint);
  const dutyOver = (i) => { delete book.officers[i]; if (actors.has(i)) actors.release(i, 'Going back on the beat'); };

  function challenge(o, m, p) {
    o.challenged = true; o.challengeAt = { x: p.x, z: p.z, real: real() };
    officerSays(o.i, 'Stop! Police! Stand where you are!');
    emit(p.id, { type: 'police', title: 'Police', text: 'Stop! Police! Stand where you are. Stand still to give yourself up, or run.', sound: 'whistle', x: m.x, z: m.z });
  }

  function officerTick(o, dt) {
    const m = actors.get(o.i);
    if (!m) { delete book.officers[o.i]; return; }
    // (an officer shooting back at someone, guns.js, is busy with that: her duty waits until it is over)
    if (hub.guns && hub.guns.isShooting && hub.guns.isShooting(o.i)) return;
    const now = real();
    const p = o.suspect ? players[o.suspect] : null;

    if (o.duty === 'investigate') {
      const crime = book.crimes[o.crime];
      const culprit = crime ? players[crime.culprit] : null;
      // a culprit still hanging about with the money on them is found out
      if (culprit && crime.status === 'open' && !culprit.custody && Math.hypot(culprit.x - m.x, culprit.z - m.z) < 12 && clearLine(m.x, m.z, culprit.x, culprit.z, 0.1)) {
        officerSays(o.i, 'You there. Stay where you are.');
        o.duty = 'pursue'; o.suspect = culprit.id; o.lost = 0;
        reported(crime);
        return;
      }
      if (m.mode === 'hold') {
        if (!o.arrived) { o.arrived = now; m.act = 'Asking what happened'; }
        if (now - o.arrived > LAW.search * 2) { if (culprit && lawOf(culprit).state === 'suspicious') setState(culprit, 'normal'); dutyOver(o.i); }
      }
      return;
    }

    if (o.duty === 'escort') {
      const arrest = book.arrests[o.arrest];
      if (!arrest || arrest.status !== 'escort') { dutyOver(o.i); return; }
      if (arrest.officer.kind === 'npc' && now - arrest.real < LAW.cuffed) { m.act = 'Handcuffing a prisoner'; return; }
      if (Math.hypot(m.x - STATION.x, m.z - STATION.z) < 2.6 || m.mode === 'hold') { intoCustody(arrest); dutyOver(o.i); }
      return;
    }

    if (!p || p.custody || !['wanted', 'pursuit'].includes(lawOf(p).state)) { dutyOver(o.i); return; }
    const law = lawOf(p);
    const d = Math.hypot(p.x - m.x, p.z - m.z);
    const inSight = sees(m, p);
    if (inSight) { law.seenAt = { x: p.x, z: p.z, real: now, t: state.t }; law.wantedAt = state.t; o.lost = 0; } else o.lost += dt;

    if (o.duty === 'respond') {
      if (inSight) {
        o.duty = 'pursue';
        setState(p, 'pursuit');
        // the police running after someone: the people near see it (voices.js)
        if (hub.voices) hub.voices.event('police', m.x, m.z, { not: [`n:${o.i}`] });
        actors.follow(o.i, { kind: 'player', id: p.id }, 1.2, chasePace(law), 'Chasing a suspect');
        if (!o.challenged) challenge(o, m, p);
        return;
      }
      if (m.mode === 'hold') {
        // at the place they were last seen, and they are not here: look about, then give it up for now
        if (!o.arrived) { o.arrived = now; m.act = 'Looking about'; }
        if (now - o.arrived > LAW.search) dutyOver(o.i);
      }
      return;
    }

    // pursuing (at one star, given up sooner: STARS.lost)
    if (o.lost > (STARS.lost[Math.min(STARS.most, law.stars || 0)] || LAW.lost)) {
      // lost them: go to where they were last seen and look
      o.duty = 'respond'; o.arrived = 0;
      if (!Object.values(book.officers).some((x) => x.suspect === p.id && x.duty === 'pursue')) setState(p, 'wanted');
      actors.walkTo(o.i, law.seenAt.x, law.seenAt.z, PACE.run, 'Looking for a suspect');
      return;
    }
    if (m.mode !== 'follow') actors.follow(o.i, { kind: 'player', id: p.id }, 1.2, chasePace(law), 'Chasing a suspect');
    if (!o.challenged && d < 14) challenge(o, m, p);
    // running on after being told to stop is an offence of its own, once
    if (o.challenged && !law.resisted && o.challengeAt && now - o.challengeAt.real > 1.5 && Math.hypot(p.x - o.challengeAt.x, p.z - o.challengeAt.z) > 7) {
      law.resisted = true;
      const crime = offence(p, 'resisting', { victim: { kind: 'npc', id: o.i, name: people[o.i].name }, x: p.x, z: p.z });
      reported(book.crimes[crime.id]);
    }
    if (d > LAW.reach) return;
    const still = now - (p.lastMoveAt || 0) >= LAW.still;
    const helpless = (hub.conflict && hub.conflict.critical(p)) || now < (p.heldUntil || 0) || law.surrendered;
    const stopped = p.driving || (p.astride !== null && p.astride !== undefined) || p.incar ? still : still || helpless;
    if (stopped) arrest(p, { kind: 'npc', id: o.i, name: people[o.i].name });
  }

  // A wanted player gives themselves up to the next officer to reach them.
  function surrender(p) {
    const law = lawOf(p);
    if (!['wanted', 'pursuit'].includes(law.state)) throw new GameError('NOT_WANTED', 'Nobody is looking for you.');
    law.surrendered = true;
    if (!Object.values(book.officers).some((o) => o.suspect === p.id && o.duty !== 'return')) { law.seenAt = { x: p.x, z: p.z, real: real(), t: state.t }; dispatch(p, null); }
    return { surrendered: true };
  }

  // --- arrest ----------------------------------------------------------------------------

  // the police's charge: the heaviest of the offences, not their sum (10 TR, or 100 TR where someone was killed)
  const fineFor = (crimes) => Math.max(...crimes.map((c) => LAW.offences[c.type].fine));
  const deathIn = (crimes) => crimes.some((c) => LAW.offences[c.type].death);
  const hoursFor = (crimes) => Math.min(LAW.mostHours, crimes.reduce((sum, c) => sum + LAW.offences[c.type].hours, 0));

  // Takes back what was stolen and hands it to whoever it was taken from. Each offence is its own
  // transaction with its own key, so it can be asked for again and never pays twice; it never takes
  // more than was stolen, and never more than the culprit has.
  function recover(arrest, p) {
    for (const id of arrest.crimes) {
      const crime = book.crimes[id];
      const out = { crime: id, victim: crime.victim.name, kind: null, due: 0, paid: 0, txn: null };
      if (crime.type === 'theft' && crime.amount > crime.recovered) { out.kind = 'returned'; out.due = crime.amount - crime.recovered; } else if (crime.type === 'assault_serious' && crime.victim.kind === 'player' && !crime.compensated) { out.kind = 'compensation'; out.due = LAW.compensation; } else continue;
      const to = victimAccount(crime.victim);
      const pay = to ? Math.min(out.due, ledger.balance(p.wallet)) : 0;
      if (pay > 0) {
        const txn = ledger.post({ key: `restitution:${id}:${arrest.id}`, kind: 'restitution', initiator: 'svc:police', reason: out.kind === 'returned' ? `Stolen money returned to ${crime.victim.name}, ${arrest.no}` : `Compensation to ${crime.victim.name}, ${arrest.no}`, legs: [{ account: p.wallet, amount: -pay }, { account: to, amount: pay }], meta: { crime: id, arrest: arrest.id, kind: out.kind } });
        out.paid = pay; out.txn = txn.id;
        if (out.kind === 'returned') crime.recovered += pay; else crime.compensated = true;
        book.totals.restitution += pay;
        if (crime.victim.kind === 'player') emit(crime.victim.id, { type: 'receipt', title: out.kind === 'returned' ? 'Stolen money returned' : 'Compensation', text: `The police have ${out.kind === 'returned' ? 'recovered' : 'collected'} ${trText(pay)} for you from ${p.name}.`, txn: txn.id, amount: pay });
      }
      if (out.due > out.paid) book.owed[p.id] = (book.owed[p.id] || 0) + (out.due - out.paid);
      arrest.restitution.push(out);
    }
  }

  // `officer` is { kind: 'npc' | 'player', id, name }. An arrest is made once: a second call returns the first.
  function arrest(p, officer) {
    if (p.custody) return book.arrests[p.custody];
    const law = lawOf(p);
    const crimes = law.crimes.map((id) => book.crimes[id]).filter((c) => c && c.status === 'open');
    if (!crimes.length) return null;
    book.arrestSeq += 1;
    const scale = fineFor(crimes);
    const byConstable = officer.kind === 'player';
    const record = {
      id: `AR-${pad(book.arrestSeq, 6)}`, no: `${ZONE.lgaCode}/AR/${pad(book.arrestSeq, 4)}`, culprit: p.id, culpritName: p.name, officer: { ...officer },
      crimes: crimes.map((c) => c.id), at: Math.round(state.t), real: real(), x: Math.round(p.x * 10) / 10, z: Math.round(p.z * 10) / 10,
      fine: { scale, amount: byConstable ? Math.min(scale, deathIn(crimes) ? LAW.constableFine.mostWithDeath : LAW.constableFine.most) : scale, least: LAW.constableFine.least, most: deathIn(crimes) ? LAW.constableFine.mostWithDeath : LAW.constableFine.most, confirmed: !byConstable, confirmedAt: byConstable ? null : real(), confirmBy: byConstable ? real() + LAW.confirmWithin : null },
      hours: hoursFor(crimes), restitution: [], status: 'escort', bookedAt: null, until: null,
      payment: { status: 'unpaid', txn: null, paidBy: null, at: null },
      call: { status: 'none', askedAt: null, messages: 0 }, bail: [],
    };
    book.arrests[record.id] = record;
    for (const c of crimes) { c.status = 'arrested'; c.arrest = record.id; c.reportAt = null; c.discoverAt = null; }
    law.crimes = []; law.resisted = false; law.surrendered = false; law.stars = 0; law.unseen = 0;
    if (book.downed) delete book.downed[p.id];
    p.custody = record.id;
    setState(p, 'arrested');
    // out of whatever they were in, and no more fighting
    if (hub.conflict) hub.conflict.stop(p);
    if (hub.vehicles && p.driving) hub.vehicles.eject(p);
    if (hub.okada) hub.okada.unseat(p);
    if (hub.ownCars) hub.ownCars.unseat(p);
    if (hub.hijack) hub.hijack.cancel(p);
    recover(record, p);
    if (hub.vehicles) hub.vehicles.recover(p.id);
    if (hub.okada) hub.okada.recover(p.id);
    // (30 October 2026, the owner: "if police catch them, all cars must be returned"): every car of the town's they
    // took, the one they were in and every one they left standing, goes back to its owner (traffic.js)
    record.carsReturned = hub.traffic ? hub.traffic.recover(p.id) : 0;
    // and every bicycle, skateboard or pair of skates taken from one of the town's riders (31 October 2026)
    record.sportsReturned = hub.sportRiders ? hub.sportRiders.recover(p.id) : 0;
    // and a naval ship taken goes back to the navy (naval.js)
    record.shipsReturned = hub.naval ? hub.naval.recover(p.id) : 0;
    // a constable who is arrested is a constable no longer
    if (book.roles[p.id]) { delete book.roles[p.id]; emit(p.id, { type: 'police', title: 'Badge withdrawn', text: 'You have been arrested. You are no longer a special constable.' }); }
    // every officer after this suspect stands down, except the one bringing them in
    for (const o of Object.values(book.officers)) if (o.suspect === p.id) { if (officer.kind === 'npc' && o.i === officer.id) { o.duty = 'escort'; o.arrest = record.id; actors.hold(o.i, 'Handcuffing a prisoner'); } else dutyOver(o.i); }
    if (officer.kind === 'npc') officerSays(officer.id, 'You are under arrest. Come with me.');
    const back = record.restitution.reduce((sum, r) => sum + r.paid, 0);
    const cars = record.carsReturned, sports = record.sportsReturned || 0, ships = record.shipsReturned || 0;
    emit(p.id, { type: 'police', title: 'Under arrest', text: `${officer.name} has arrested you: ${crimes.map((c) => LAW.offences[c.type].name.toLowerCase()).join(', ')}.${back ? ` ${trText(back)} have been taken back from you.` : ''}${cars ? ` ${cars === 1 ? 'The car you took goes back to its owner.' : `All ${cars} cars you took go back to their owners.`}` : ''}${sports ? ` ${sports === 1 ? 'What you took from a rider goes back to its owner.' : `All ${sports} things you took from riders go back to their owners.`}` : ''}${ships ? ' The ship you took goes back to the navy.' : ''} ${officer.kind === 'npc' ? 'You are being taken to the Police Post.' : 'You are being walked to the Police Post.'}`, arrest: record.id });
    for (const c of crimes) if (c.victim.kind === 'player') emit(c.victim.id, { type: 'police', title: 'Arrest made', text: `${p.name} has been arrested (${record.no}).` });
    return record;
  }

  function intoCustody(record, fetched = false) {
    const p = players[record.culprit];
    record.status = 'custody'; record.bookedAt = Math.round(state.t); record.until = record.bookedAt + (hub.span ? hub.span(record.hours * 3600) : record.hours * 3600);
    if (!record.fine.confirmed) { record.fine.confirmed = true; record.fine.confirmedAt = real(); }
    if (!p) return;
    // they were walked here; only someone who has somehow been left far behind is fetched
    if (fetched || Math.hypot(p.x - STATION.x, p.z - STATION.z) > 12) { p.x = STATION.x; p.z = STATION.z; }
    if (fetched) for (const o of Object.values(book.officers)) if (o.arrest === record.id) dutyOver(o.i);
    p.heading = Math.PI; p.lastMoveAt = real();
    setState(p, 'custody');
    emit(p.id, { type: 'police', title: 'In custody', text: `You are held at the Police Post. Fine: ${trText(record.fine.amount)}. Pay it, ask someone to pay it for you, or sit out ${record.hours} hours.`, arrest: record.id });
  }

  function release(record, how) {
    const p = players[record.culprit];
    record.status = 'released'; record.releasedAt = Math.round(state.t); record.how = how;
    for (const id of record.crimes) book.crimes[id].status = 'closed';
    if (!p) return;
    p.custody = null;
    p.lastMoveAt = real();
    const law = lawOf(p);
    law.releasedAt = real();
    setState(p, 'released');
    emit(p.id, { type: 'police', title: 'Released', text: how === 'paid' ? 'The fine is paid. You are free to go.' : how === 'bail' ? 'Your fine has been paid for you. You are free to go.' : 'You have sat out your time. You are free to go.' });
  }

  // Pays the fine. `payer` is the prisoner, or anyone standing at the Police Post who chooses to pay for them.
  // One transaction, keyed by the arrest: it cannot be paid twice, by one person or by two.
  function payFine(payer, arrestId) {
    const record = book.arrests[arrestId];
    if (!record) throw new GameError('NO_ARREST', 'There is no such arrest.');
    if (record.payment.status === 'paid') return { ...receipt(record), replayed: true };
    if (record.status !== 'custody') throw new GameError('NOT_IN_CUSTODY', record.status === 'escort' ? 'The fine is paid at the Police Post, once the prisoner is brought in.' : 'That matter is closed.');
    if (!record.fine.confirmed) throw new GameError('FINE_NOT_SET', 'The fine has not been set yet.');
    if (record.officer.kind === 'player' && record.officer.id === payer.id) throw new GameError('NOT_YOU', 'The arresting officer cannot pay their own prisoner\'s fine.');
    const own = payer.id === record.culprit;
    if (!own && Math.hypot(payer.x - post.x, payer.z - post.z) > 6) throw new GameError('TOO_FAR', 'Fines are paid at the Police Post.');
    const amount = record.fine.amount;
    const legs = [{ account: payer.wallet, amount: -amount }];
    let tax = amount, reward = 0;
    const constable = record.officer.kind === 'player' ? players[record.officer.id] : null;
    if (record.officer.kind === 'player') {
      // the government's share is never rounded away to nothing; the constable has the rest, whether or not they are in town today
      ({ government: tax, constable: reward } = fineShares(amount));
      const wallet = constable ? constable.wallet : ledger.findAccount('player', record.officer.id, 'wallet');
      if (!wallet) throw new GameError('NO_OFFICER', 'The arresting constable\'s account cannot be found. The fine cannot be taken yet.');
      if (reward > 0) legs.push({ account: wallet, amount: reward });
    }
    legs.push({ account: treasury(), amount: tax });
    const names = record.crimes.map((id) => LAW.offences[book.crimes[id].type].name.toLowerCase()).join(', ');
    let txn;
    try {
      txn = ledger.post({ key: `fine:${record.id}`, kind: 'fine', initiator: `player:${payer.id}`, reason: `Fine, ${record.no}: ${names}`, legs, meta: { arrest: record.id, crimes: record.crimes.join(','), culprit: record.culprit, paidBy: payer.id, officer: `${record.officer.kind}:${record.officer.id}`, toGovernment: tax, toOfficer: reward } });
    } catch (error) {
      if (error instanceof LedgerError && (error.code === 'NL002' || error.code === 'NL011')) return { ...receipt(record), replayed: true };      // the ledger already holds this arrest's fine
      throw error;
    }
    record.payment = { status: 'paid', txn: txn.id, paidBy: payer.id, paidByName: payer.name, at: Math.round(state.t), toGovernment: tax, toOfficer: reward };
    book.totals.fines += amount; book.totals.toGovernment += tax; book.totals.toConstables += reward;
    if (constable && reward > 0) emit(constable.id, { type: 'receipt', title: 'Arrest reward', text: `${record.culpritName}'s fine is paid (${record.no}). Your share is ${trText(reward)}; ${trText(tax)} went to the government.`, txn: txn.id, amount: reward });
    if (!own && players[payer.id]) emit(payer.id, { type: 'receipt', title: 'Fine paid', text: `You paid ${record.culpritName}'s fine (${record.no}).`, txn: txn.id, amount: -amount });
    else if (!own) { /* a townsperson paid: the prisoner is told by whoever arranged it */ }
    else emit(payer.id, { type: 'receipt', title: 'Fine paid', text: `${record.no}: ${names}.`, txn: txn.id, amount: -amount });
    release(record, own ? 'paid' : 'bail');
    return { ...receipt(record), replayed: false };
  }
  const receipt = (record) => ({ arrest: record.id, no: record.no, amount: record.fine.amount, txn: record.payment.txn, paidBy: record.payment.paidBy, toGovernment: record.payment.toGovernment, toOfficer: record.payment.toOfficer });

  // What a culprit still owes the people they stole from, paid of their own accord.
  function settleOwed(p) {
    const owed = book.owed[p.id] || 0;
    if (owed <= 0) throw new GameError('NOTHING_OWED', 'You owe nothing.');
    let left = owed, paid = 0;
    for (const record of Object.values(book.arrests)) {
      if (record.culprit !== p.id) continue;
      for (const r of record.restitution) {
        const short = r.due - r.paid - (r.later || 0);
        if (short <= 0 || left <= 0) continue;
        const crime = book.crimes[r.crime];
        const to = victimAccount(crime.victim);
        const pay = to ? Math.min(short, left, ledger.balance(p.wallet)) : 0;
        if (pay <= 0) continue;
        r.laterSeq = (r.laterSeq || 0) + 1;
        ledger.post({ key: `restitution:${r.crime}:${record.id}:later:${r.laterSeq}`, kind: 'restitution', initiator: `player:${p.id}`, reason: `Owed to ${crime.victim.name}, ${record.no}`, legs: [{ account: p.wallet, amount: -pay }, { account: to, amount: pay }], meta: { crime: r.crime, arrest: record.id, kind: r.kind } });
        r.later = (r.later || 0) + pay; left -= pay; paid += pay;
        if (r.kind === 'returned') crime.recovered += pay;
        book.totals.restitution += pay;
      }
    }
    if (paid <= 0) throw new GameError('CANNOT_PAY', 'You do not have the TR to pay what you owe.');
    book.owed[p.id] = owed - paid;
    return { paid, owed: book.owed[p.id] };
  }

  // --- special constables: players with the power of arrest -----------------------------

  const roleOf = (p) => book.roles[p.id] || null;
  function needRole(p) { const role = roleOf(p); if (!role) throw new GameError('NOT_POLICE', 'You are not a police officer.'); return role; }

  function enlist(p) {
    if (roleOf(p)) throw new GameError('ALREADY', 'You already carry a badge.');
    if (lawOf(p).state !== 'normal') throw new GameError('NOT_NOW', 'The police will not take on someone they are looking for.');
    if (Object.values(book.arrests).some((a) => a.culprit === p.id && state.t - a.at < (hub.span ? hub.span(3 * 86400) : 3 * 86400))) throw new GameError('RECORD', 'You were arrested within the last three days. Come back with a clean record.');
    if ((book.owed[p.id] || 0) > 0) throw new GameError('RECORD', 'You still owe money to someone you wronged.');
    if (Object.keys(book.roles).length >= LAW.constables) throw new GameError('FULL', 'The post has all the special constables it is allowed.');
    book.badgeSeq += 1;
    book.roles[p.id] = { badge: `${ZONE.lgaCode}/SC/${pad(book.badgeSeq, 3)}`, since: Math.round(state.t), arrests: 0 };
    return { role: { ...book.roles[p.id] } };
  }
  function resign(p) { needRole(p); if (Object.values(book.arrests).some((a) => a.officer.kind === 'player' && a.officer.id === p.id && a.status === 'escort')) throw new GameError('BUSY', 'Bring your prisoner in first.'); delete book.roles[p.id]; return {}; }

  function wantedList(p) {
    needRole(p);
    const out = [];
    for (const id of Object.keys(players)) {
      const q = players[id];
      const law = lawOf(q);
      if (q.id === p.id || !['wanted', 'pursuit'].includes(law.state)) continue;
      out.push({ id: q.id, name: q.name, state: law.state, offences: law.crimes.map((c) => LAW.offences[book.crimes[c].type].name), fine: fineFor(law.crimes.map((c) => book.crimes[c])), lastSeen: law.seenAt ? { x: Math.round(law.seenAt.x), z: Math.round(law.seenAt.z), t: law.seenAt.t } : null, metres: Math.round(Math.hypot(q.x - p.x, q.z - p.z)) });
    }
    return { wanted: out };
  }

  function arrestBy(p, targetId) {
    needRole(p);
    if (p.custody) throw new GameError('IN_CUSTODY', 'You are in custody yourself.');
    const q = players[targetId];
    if (!q || q.id === p.id) throw new GameError('NO_TARGET', 'There is nobody there.');
    if (q.custody) throw new GameError('ALREADY_ARRESTED', `${q.name} is already under arrest.`);
    if (!['wanted', 'pursuit'].includes(lawOf(q).state)) throw new GameError('NOT_WANTED', `${q.name} is not wanted for anything.`);
    if (Math.hypot(q.x - p.x, q.z - p.z) > 2.2) throw new GameError('TOO_FAR', 'You must be within arm\'s reach.');
    const record = arrest(q, { kind: 'player', id: p.id, name: p.name });
    if (!record) throw new GameError('NOT_WANTED', `${q.name} is not wanted for anything.`);
    book.roles[p.id].arrests += 1;
    return { arrest: arrestView(record, p) };
  }

  // The constable sets the fine, once, within the limits. After that nobody can change it.
  function setFine(p, arrestId, amount) {
    needRole(p);
    const record = book.arrests[arrestId];
    if (!record || record.officer.kind !== 'player' || record.officer.id !== p.id) throw new GameError('NOT_YOURS', 'That is not your arrest.');
    if (record.fine.confirmed) throw new GameError('FINE_SET', `The fine was set at ${trText(record.fine.amount)} and cannot be changed.`);
    const value = Number(amount);
    if (!Number.isInteger(value) || value < record.fine.least || value > record.fine.most) throw new GameError('OUT_OF_RANGE', `The fine must be between ${trText(record.fine.least)} and ${trText(record.fine.most)}.`);
    record.fine.amount = value; record.fine.confirmed = true; record.fine.confirmedAt = real();
    const q = players[record.culprit];
    if (q) emit(q.id, { type: 'police', title: 'Fine set', text: `${p.name} has set your fine at ${trText(value)}.` });
    return { arrest: arrestView(record, p) };
  }

  function bookIn(p, arrestId) {
    needRole(p);
    const record = book.arrests[arrestId];
    if (!record || record.officer.kind !== 'player' || record.officer.id !== p.id) throw new GameError('NOT_YOURS', 'That is not your arrest.');
    if (record.status !== 'escort') throw new GameError('DONE', 'They have been brought in already.');
    if (Math.hypot(p.x - post.x, p.z - post.z) > 7) throw new GameError('TOO_FAR', 'Bring your prisoner to the Police Post.');
    intoCustody(record);
    return { arrest: arrestView(record, p) };
  }

  // --- a phone call from custody -------------------------------------------------------------

  function requestCall(p) {
    const record = p.custody ? book.arrests[p.custody] : null;
    if (!record) throw new GameError('NOT_IN_CUSTODY', 'You are not under arrest.');
    if (record.call.status === 'allowed') return { call: { ...record.call } };
    if (record.call.status === 'asked') throw new GameError('ASKED', 'You have asked. Wait for an answer.');
    if (record.call.status === 'denied' && real() - record.call.decidedAt < 60) throw new GameError('DENIED', 'The officer said no. Ask again in a minute.');
    record.call = { status: 'asked', askedAt: real(), messages: record.call.messages || 0 };
    if (record.officer.kind === 'player' && players[record.officer.id]) emit(record.officer.id, { type: 'police', title: 'Prisoner asks to make a call', text: `${p.name} asks to use the phone. Allow or refuse it from your phone.`, arrest: record.id });
    return { call: { ...record.call } };
  }
  function decideCall(p, arrestId, allow) {
    needRole(p);
    const record = book.arrests[arrestId];
    if (!record || record.officer.kind !== 'player' || record.officer.id !== p.id) throw new GameError('NOT_YOURS', 'That is not your arrest.');
    if (record.call.status !== 'asked') throw new GameError('NOT_ASKED', 'They have not asked.');
    answerCall(record, !!allow, p.name);
    return { call: { ...record.call } };
  }
  function answerCall(record, allow, by) {
    record.call.status = allow ? 'allowed' : 'denied'; record.call.decidedAt = real(); record.call.by = by;
    const q = players[record.culprit];
    if (q) emit(q.id, { type: 'police', title: allow ? 'You may use the phone' : 'No phone call', text: allow ? 'You may call or message someone you know.' : `${by} will not allow a call just now.` });
  }
  // May this prisoner use the phone to reach someone now?
  function mayCall(p) { const record = p.custody ? book.arrests[p.custody] : null; return !record || record.call.status === 'allowed'; }
  function usedMessage(p) { const record = p.custody ? book.arrests[p.custody] : null; if (!record) return; if (record.call.messages >= LAW.messagesInCustody) throw new GameError('NO_MORE', 'You have sent all the messages you are allowed from custody.'); record.call.messages += 1; }

  // --- time ------------------------------------------------------------------------------------

  function tick(dt) {
    const now = real();
    for (const id of Object.keys(book.crimes)) {
      const crime = book.crimes[id];
      if (crime.status !== 'open') continue;
      if (crime.reportAt && now >= crime.reportAt) reported(crime);
    }
    // (an arrest made by one officer stands the others down, so one may be gone before its turn comes)
    for (const key of Object.keys(book.officers)) { const o = book.officers[key]; if (o) officerTick(o, dt); }
    // people who backed away from trouble go back to what they were doing
    for (const m of actors.all()) if (m.after && now >= m.after && !book.officers[m.i]) { m.after = 0; if (!hub.conflict || !hub.conflict.record(m.i) || hub.conflict.record(m.i).mood !== 'fighting') actors.release(m.i); }

    for (const id of Object.keys(players)) {
      const p = players[id];
      const law = lawOf(p);
      if (law.state === 'released' && now - law.releasedAt > LAW.released) setState(p, 'normal');
      if (law.state === 'wanted' || law.state === 'pursuit') {
        // an officer on the beat who sees a wanted person goes after them
        const after = Object.values(book.officers).filter((o) => o.suspect === p.id && o.duty !== 'return').length;
        if (!after && Math.floor(now * 2) !== Math.floor((now - dt) * 2)) {
          for (const i of POLICE) {
            const a = available(i);
            if (!a || a.from) continue;
            if (Math.hypot(a.x - p.x, a.z - p.z) < LAW.sight && clearLine(a.x, a.z, p.x, p.z, 0.1)) { law.seenAt = { x: p.x, z: p.z, real: now, t: state.t }; send(i, null, 'respond', null, p, law.seenAt); break; }
          }
        }
        if (law.state === 'pursuit' && !Object.values(book.officers).some((o) => o.suspect === p.id && o.duty === 'pursue')) setState(p, 'wanted');
        // (a save from before the stars: as many as the worst crime on the book gives)
        if (!law.stars) law.stars = Math.max(1, ...law.crimes.map((c) => (book.crimes[c] ? starsOf(book.crimes[c].type) : 1)));
        // at 20 (the 20-life rule) every chase stops, and the stars go
        if (hub.conflict && hub.conflict.critical(p)) { lapse(p, 'You are badly hurt. The police have stopped chasing you.'); continue; }
        // the stars fade, one at a time, while no officer can see them; seen, the fading starts again. (Not while officers
        // are still on their way to where the player was last seen: escaping is getting away before they come and
        // finding nobody there, they give up looking. Nor for someone who has given themselves up and waits for them.)
        const coming = Object.values(book.officers).some((o) => o.suspect === p.id && o.duty === 'respond' && !o.arrived);
        const seen = !!law.surrendered || coming || (!!law.seenAt && now - law.seenAt.real < 0.75);
        law.unseen = seen ? 0 : (law.unseen || 0) + dt;
        if (!seen && law.unseen >= STARS.fade[Math.min(STARS.most, law.stars)]) {
          law.stars -= 1; law.unseen = 0;
          if (law.stars <= 0) { lapse(p); continue; }
        }
        // someone not seen for half a day is no longer looked for; what they did stays on the books, unsolved
        if (state.t - (law.wantedAt || 0) > (hub.span ? hub.span(LAW.lapse) : LAW.lapse)) { lapse(p); continue; }
      }
      if (!p.custody) continue;
      const record = book.arrests[p.custody];
      if (record.status === 'escort') {
        // taken by the town's police: four seconds in handcuffs where they were caught, then at the Police Post
        // (the screen goes dark between; nobody is walked across town)
        if (record.officer.kind === 'npc') { if (now - record.real >= LAW.cuffed) intoCustody(record, true); continue; }
        // the prisoner walks beside whoever has them
        const officer = record.officer.kind === 'npc' ? actors.get(record.officer.id) : players[record.officer.id];
        const handed = record.handedTo !== undefined ? actors.get(record.handedTo) : null;
        const lead = handed || officer;
        if (lead) {
          const h = lead.h !== undefined ? lead.h : lead.heading;
          const tx = lead.x - Math.sin(h) * 0.9 + Math.cos(h) * 0.5, tz = lead.z - Math.cos(h) * 0.9 - Math.sin(h) * 0.5;
          const gap = Math.hypot(tx - p.x, tz - p.z);
          const stride = Math.min(gap, PACE.sprint * dt + gap * dt);
          if (gap > 0.02) { p.x += ((tx - p.x) / gap) * stride; p.z += ((tz - p.z) / gap) * stride; p.heading = Math.atan2(tx - p.x, tz - p.z) || h; }
          if (gap < 0.3) p.heading = h;
        }
        if (record.officer.kind === 'player') {
          if (!record.fine.confirmed && now >= record.fine.confirmBy) { record.fine.confirmed = true; record.fine.confirmedAt = now; }
          // a constable who does not bring the prisoner in hands them over to the regular police
          const gone = !officer || Math.hypot(officer.x - p.x, officer.z - p.z) > 40 || now - record.real > LAW.bookWithin;
          if (gone && record.handedTo === undefined) {
            const pick = nearestFree(p.x, p.z, 1)[0];
            if (pick) { record.handedTo = pick.i; const o = send(pick.i, pick.from, 'escort', null, null, { x: p.x, z: p.z }); o.arrest = record.id; o.collect = true; }
          }
          if (handed) { const o = book.officers[record.handedTo]; if (o && o.collect && Math.hypot(handed.x - p.x, handed.z - p.z) < 2.5) { o.collect = false; actors.walkTo(record.handedTo, STATION.x, STATION.z, PACE.walk, 'Bringing in a prisoner'); } }
        } else if (!officer && !handed) intoCustody(record);
        continue;
      }
      if (record.status !== 'custody') continue;
      if (record.call.status === 'asked' && (record.officer.kind === 'npc' ? now - record.call.askedAt > 3 : now - record.call.askedAt > LAW.callWait || !players[record.officer.id])) answerCall(record, true, record.officer.kind === 'npc' ? record.officer.name : 'The desk officer');
      if (state.t >= record.until && record.payment.status === 'unpaid') { record.payment = { status: 'served', txn: null, paidBy: null, at: Math.round(state.t) }; release(record, 'served'); }
    }
  }

  // --- what may be seen ---------------------------------------------------------------------------

  function arrestView(record, viewer) {
    const mine = viewer && viewer.id === record.culprit;
    return {
      id: record.id, no: record.no, culprit: record.culpritName, culpritId: record.culprit, officer: record.officer.name, byConstable: record.officer.kind === 'player',
      offences: record.crimes.map((id) => ({ name: LAW.offences[book.crimes[id].type].name, against: book.crimes[id].victim.name, no: book.crimes[id].no })),
      fine: { amount: record.fine.amount, scale: record.fine.scale, least: record.fine.least, most: record.fine.most, confirmed: record.fine.confirmed },
      hours: record.hours, status: record.status, until: record.until, payment: { status: record.payment.status, paidBy: record.payment.paidByName || null, txn: mine || (viewer && viewer.id === record.payment.paidBy) ? record.payment.txn : null },
      restitution: record.restitution.map((r) => ({ victim: r.victim, kind: r.kind, due: r.due, paid: r.paid + (r.later || 0) })),
      call: { status: record.call.status, messagesLeft: Math.max(0, LAW.messagesInCustody - (record.call.messages || 0)) },
      station: { x: post.x, z: post.z, name: post.name },
    };
  }

  function selfView(p) {
    const law = lawOf(p);
    const record = p.custody ? book.arrests[p.custody] : null;
    const role = roleOf(p);
    const mine = role ? Object.values(book.arrests).filter((a) => a.officer.kind === 'player' && a.officer.id === p.id && a.status !== 'released').map((a) => arrestView(a, p)) : [];
    return {
      state: law.state, wanted: law.crimes.map((id) => ({ no: book.crimes[id].no, name: LAW.offences[book.crimes[id].type].name })), surrendered: !!law.surrendered,
      // the stars (STARS), and how far the next one is to fading, while no officer can see them (0 seen; 1 about to go)
      stars: law.state === 'wanted' || law.state === 'pursuit' ? Math.min(STARS.most, law.stars || 1) : 0,
      fading: law.state === 'wanted' || law.state === 'pursuit' ? Math.round(Math.min(1, (law.unseen || 0) / STARS.fade[Math.min(STARS.most, law.stars || 1)]) * 100) / 100 : 0,
      arrest: record ? arrestView(record, p) : null,
      canPay: !!record && record.status === 'custody' && record.fine.confirmed && ledger.balance(p.wallet) >= record.fine.amount,
      owed: book.owed[p.id] || 0,
      role: role ? { ...role, prisoners: mine } : null,
      // offences this player saw or suffered and may report
      // (what this player could tell the police of: only what an officer saw, and only until word of it reaches them,
      // a moment after: 31 October 2026)
      seen: Object.values(book.crimes).filter((c) => c.status === 'open' && c.detection === 'identified' && c.reportAt && (c.witnesses.some((w) => w.kind === 'player' && w.id === p.id) || (c.victim.kind === 'player' && c.victim.id === p.id))).map((c) => ({ id: c.id, no: c.no, name: LAW.offences[c.type].name, known: c.witnesses.some((w) => w.kind === 'player' && w.id === p.id) })),
    };
  }

  // Officers out on a call, for whoever draws the town.
  function officersNear(x, z, range = 150) {
    const out = [];
    for (const o of Object.values(book.officers)) { const m = actors.get(o.i); if (m && Math.hypot(m.x - x, m.z - z) <= range) out.push({ i: o.i, duty: o.duty, x: Math.round(m.x * 10) / 10, z: Math.round(m.z * 10) / 10 }); }
    return out;
  }

  // A player's own record with the police.
  function record(p) {
    return {
      arrests: Object.values(book.arrests).filter((a) => a.culprit === p.id).map((a) => arrestView(a, p)).reverse().slice(0, 12),
      owed: book.owed[p.id] || 0,
    };
  }

  // Bail asked of other players: what is owed and where, for whoever is asked.
  function bailFor(arrestId) { const r = book.arrests[arrestId]; return r && r.status !== 'released' && r.payment.status === 'unpaid' ? { arrest: r.id, no: r.no, name: r.culpritName, amount: r.fine.amount, confirmed: r.fine.confirmed, status: r.status, station: { x: post.x, z: post.z, name: post.name } } : null; }

  const audit = () => ({ ...book.totals, crimes: Object.keys(book.crimes).length, arrests: Object.keys(book.arrests).length, open: Object.values(book.crimes).filter((c) => c.status === 'open').length, officersOut: Object.keys(book.officers).length });

  const api = {
    offence, worsen, raise, steal, reportSeen, surrender, arrest, payFine, settleOwed, tick,
    enlist, resign, wantedList, arrestBy, setFine, bookIn, requestCall, decideCall, mayCall, usedMessage, roleOf,
    selfView, officersNear, record, bailFor, audit, lawOf, STATION,
    crime: (id) => book.crimes[id] || null, arrestOf: (id) => book.arrests[id] || null,
    // for tests: is this person out on police business? can someone at one point see another?
    onDuty, inSight,
  };
  hub.justice = api;
  return api;
}
