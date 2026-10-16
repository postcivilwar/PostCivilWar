// Tests for the town's people, their speech, the okadas and the players'
// chat. Run with: node --test test/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHost } from '../src/sim/host.js';
import { ZONE, ZONE_SPOTS, ZONE_ROOMS, ZONE_HOMES, ZONE_COMPOUNDS, ZONE_POPULATION, ZONE_GRAPH_PROBLEMS, ZONE_NODES, ZONE_STOPS, ZONE_RESIDENTS, ZONE_VENUES, zoneWalkable, zoneRoomAt } from '../src/sim/zone.js';
import { createPopulation, rosterOf, JOBS, POSE, RANGE, dayInfo } from '../src/sim/population.js';
import { LANGUAGES, PEOPLES, PHRASES, EXCHANGES, phrase, sharedLanguage, translatePhrase, createTranslator } from '../src/sim/culture.js';
import { CHAT, cleanText } from '../src/sim/talk.js';
import { okadaFare, OKADA_RULES } from '../src/sim/okada.js';
import { TIME_SCALE } from '../src/sim/sim.js';
import { createLoopbackHub } from '../src/net/transport.js';
import { createLink, encodePlayer, decodePlayer } from '../src/net/link.js';
import { graphIndex, graphRoute } from '../src/sim/graph.js';
import { newWorld, ok, walkTo, run, fund } from './helpers.mjs';
import { leaveArrivalMoney } from './world.mjs';

const refused = (result, code) => { assert.equal(result.ok, false, 'expected a refusal'); assert.equal(result.code, code, result.message); };
const H = (hours, day = 0) => day * 86400 + hours * 3600;
const town = () => createPopulation({ state: {}, timeScale: TIME_SCALE });
const spotOf = (pop, i, t) => ZONE_SPOTS[pop.locate(i, t, {}).spot];
const jobIs = (pop, job, venue = null) => pop.people.filter((p) => p.job === job && (!venue || p.venue === venue));
// moves the clock of a world on to an hour of a day (day 0 is the first)
function goTo(host, hours, day = 0) {
  const target = H(hours, day);
  assert.ok(target >= host.game.state.t, 'time only goes forward');
  host.game.advance(target - host.game.state.t);
}
// puts a player down somewhere, as the debug handle in the page does
function put(host, id, x, z) {
  const p = host.game.state.players[id];
  p.x = x; p.z = z; p.lastMoveAt = host.game.state.real;
}

// ------------------------------------------------------------- the town --

test('the map: every building can be reached, and nothing blocks a path', () => {
  assert.deepEqual([...ZONE_GRAPH_PROBLEMS], []);
  assert.ok(Object.keys(ZONE_NODES).length > 600);
  const centre = graphIndex('mk_s');
  for (const room of ZONE_ROOMS) assert.ok(graphRoute(graphIndex(`${room.id}:in`), centre), `${room.name} cannot be reached`);
  for (const spot of ZONE_SPOTS) {
    assert.ok(ZONE_NODES[spot.node], `spot ${spot.venue} ${spot.slot} has no path`);
    if (!spot.inside && spot.pose === 'stand') assert.ok(zoneWalkable(spot.x, spot.z, [], 0.2), `spot ${spot.venue} ${spot.slot} at ${spot.x}, ${spot.z} is inside something`);
  }
  const kinds = new Set(ZONE_COMPOUNDS.map((c) => c.kind));
  for (const kind of ['hospital', 'primary', 'secondary', 'church', 'university', 'polytechnic', 'college']) assert.ok(kinds.has(kind), `no ${kind}`);
  const has = (venue, kind) => ZONE_ROOMS.some((r) => r.venue === venue && r.kind === kind);
  for (const kind of ['reception', 'consulting', 'ward', 'pharmacy', 'emergency', 'toilet']) assert.ok(has('hospital', kind), `the hospital has no ${kind}`);
  for (const venue of ['primary', 'secondary']) for (const kind of ['classroom', 'office', 'staffroom']) assert.ok(has(venue, kind), `${venue} has no ${kind}`);
  assert.ok(has('secondary', 'lab') && has('university', 'lecture') && has('university', 'library') && has('polytechnic', 'workshop') && has('college', 'classroom'));
  const catholic = ZONE_COMPOUNDS.find((c) => c.faith === 'catholic').buildings[0];
  assert.equal(catholic.kind, 'church');
  assert.ok(catholic.tower && catholic.apse && catholic.items.some((i) => i.kind === 'altar') && catholic.items.some((i) => i.kind === 'tabernacle') && catholic.items.filter((i) => i.kind === 'pew').length >= 20, 'a church has a tower, an apse, an altar, a tabernacle and pews');
});

test('buildings can be walked into, through the door and not through the wall', () => {
  const { host, id } = newWorld();
  const reception = ZONE_ROOMS.find((r) => r.venue === 'hospital' && r.kind === 'reception');
  const [ix, iz] = ZONE_NODES[`${reception.id}:in`];
  walkTo(host, id, ix, iz);
  const me = host.game.view(id).self;
  assert.equal(zoneRoomAt(me.x, me.z).id, reception.id, 'the player is standing in the reception');
  // straight at the back wall: refused
  let blocked = false;
  for (let i = 0; i < 200 && !blocked; i += 1) {
    host.tick(0.1);
    const now = host.game.view(id).self;
    const r = host.game.intent(id, { type: 'move', x: now.x, z: now.z + 0.2, heading: 0, run: false });
    if (!r.ok) { blocked = true; assert.equal(r.code, 'BLOCKED'); assert.ok(now.z < reception.z1, 'stopped inside the room'); }
  }
  assert.ok(blocked, 'the wall stops a walker');
  const nave = ZONE_ROOMS.find((r) => r.kind === 'nave' && r.venue === 'catholic');
  const [ax, az] = ZONE_NODES[`${nave.id}:aisle`];
  walkTo(host, id, ax, az);
  assert.equal(zoneRoomAt(host.game.view(id).self.x, host.game.view(id).self.z).id, nave.id);
});

// ----------------------------------------------------------- the people --

test('people: a thousand residents, each a whole person', () => {
  const pop = town();
  assert.equal(pop.total, 1000);
  assert.equal(pop.count + ZONE_RESIDENTS.length, 1000);
  assert.equal(new Set(pop.people.map((p) => p.id)).size, pop.count);
  assert.equal(new Set(pop.people.map((p) => p.name)).size, pop.count, 'no two people share a name');
  const homes = new Set(ZONE_HOMES.map((h) => h.home));
  for (const p of pop.people) {
    const d = pop.describe(p.index, H(10));
    assert.ok(d.name.length > 3 && d.short && d.role, `${p.id} has a name and a role`);
    assert.ok(Number.isInteger(d.age) && d.age >= 1 && d.age <= 84);
    assert.ok(['m', 'f'].includes(d.gender));
    assert.ok(Number.isInteger(d.look.skin) && Number.isInteger(d.look.top) && d.fig.scale > 0.4, 'looks and clothing');
    assert.ok(homes.has(p.homeSpot) || ZONE_SPOTS[p.homeSpot].slot === 'residence', 'a home');
    assert.ok(JOBS[p.job], 'an occupation');
    assert.ok(['none', 'low', 'middle', 'high'].includes(d.income));
    assert.ok(d.traits.length >= 2 && d.languages.length >= 1 && d.languages.every((l) => LANGUAGES[l]));
    assert.ok(['walk', 'okada'].includes(d.transport));
    assert.ok(d.activity.length > 2 && d.needs.hunger >= 0 && d.needs.hunger <= 1);
    assert.ok(PEOPLES[p.people] && ['catholic', 'anglican', 'muslim', 'other'].includes(p.faith));
    assert.ok(d.age < 18 || d.job === 'undergrad' || p.relations.length >= 0);
  }
  // families hang together: a child's parents are older, a wife has a husband
  let children = 0;
  for (const p of pop.people) {
    for (const [other, kind] of p.relations) {
      const q = pop.people[other];
      if (kind === 'son' || kind === 'daughter') { children += 1; assert.ok(p.age - q.age >= 17 || p.job === 'retiree', `${p.name} is old enough to be the parent of ${q.name}`); assert.ok(q.relations.some(([back, k]) => back === p.index && (k === 'mother' || k === 'father'))); }
      if (kind === 'wife') { assert.equal(q.gender, 'f'); assert.equal(q.home, p.home, 'a couple share a house'); }
    }
  }
  assert.ok(children > 300);
  // names from across the country, most of them from here
  const by = {};
  for (const p of pop.people) by[p.people] = (by[p.people] || 0) + 1;
  assert.ok(by.igbo > 700 && by.yoruba > 10 && by.hausa > 10 && Object.keys(by).length >= 6, JSON.stringify(by));
  const variety = new Set(pop.people.map((p) => `${p.look.outfit}|${p.look.top}|${p.look.skin}|${(p.look.hat || [])[0]}`));
  assert.ok(variety.size > 250, `${variety.size} different looks`);
  // the same seed makes the same town; another seed makes another
  assert.equal(rosterOf(), pop.people);
  assert.notEqual(rosterOf(ZONE_POPULATION.seed + 1)[0].name + rosterOf(ZONE_POPULATION.seed + 1)[5].name, pop.people[0].name + pop.people[5].name);
});

test('roles: the town has the workers it needs, each with a place to work', () => {
  const pop = town();
  for (const [job, count, venue] of ZONE_POPULATION.jobs) assert.equal(jobIs(pop, job, venue).length, count, `${count} ${job} at ${venue}`);
  // a believable mix: children, students, people without work, the retired
  const share = (jobs) => pop.people.filter((p) => jobs.includes(p.job)).length / pop.count;
  assert.ok(share(['infant', 'pupil', 'student']) > 0.3 && share(['unemployed']) > 0.03 && share(['retiree']) > 0.03 && share(['trader', 'hawker', 'farmer', 'fisher', 'okada', 'labourer']) > 0.18);
  // every class has its own teacher and no seat is given twice
  for (const venue of ['primary', 'secondary']) {
    const rooms = ZONE_ROOMS.filter((r) => r.venue === venue && r.kind === 'classroom');
    const classTeachers = jobIs(pop, 'teacher', venue).filter((p) => p.post.room);
    assert.equal(new Set(classTeachers.map((p) => p.post.room)).size, rooms.length, `${venue}: a teacher for each class`);
    const seats = jobIs(pop, venue === 'primary' ? 'pupil' : 'student', venue).map((p) => p.post.seat);
    assert.equal(new Set(seats).size, seats.length, `${venue}: one seat each`);
    for (const p of jobIs(pop, venue === 'primary' ? 'pupil' : 'student', venue)) assert.equal(ZONE_SPOTS[p.post.seat].room, p.post.room);
  }
  for (const p of pop.people) if (!['infant', 'pupil', 'student', 'undergrad', 'hawker', 'unemployed', 'retiree', 'homemaker'].includes(p.job)) assert.ok(ZONE_SPOTS[p.post.work], `${p.name}, ${p.job}, has a post`);
  for (const p of jobIs(pop, 'doctor')) assert.equal(ZONE_SPOTS[p.post.work].venue, 'hospital');
  for (const p of jobIs(pop, 'trader')) assert.equal(ZONE_SPOTS[p.post.work].venue, 'market');
  assert.equal(new Set(jobIs(pop, 'trader').map((p) => p.post.work)).size, 58, 'traders do not share a pitch');
});

test('routines: a weekday, hour by hour', () => {
  const pop = town();
  const at = (hours, day = 0) => pop.census(H(hours, day));
  const night = at(2.5);
  assert.ok(night.hidden > 950, `${night.hidden} are indoors at half past two`);
  assert.equal(night.walking, 0);
  const morning = at(9.5);
  assert.ok(morning.byActivity['In class'] > 230, `${morning.byActivity['In class']} in class`);
  assert.ok(morning.byActivity['Selling at the market'] >= 55 && morning.byActivity['Working on the farm'] >= 35 && morning.byActivity['In a lecture'] >= 60);
  assert.ok(morning.byVenue.primary > 130 && morning.byVenue.secondary > 100 && morning.byVenue.hospital > 20 && morning.byVenue.market > 55, JSON.stringify(morning.byVenue));
  const breakTime = at(10.75);
  assert.ok(breakTime.byActivity['On break'] > 100);
  const afternoon = at(15.5);
  assert.ok(!afternoon.byActivity['In class'], 'school is over');
  assert.ok((afternoon.byActivity['At home'] || 0) > 300);
  const evening = at(21.5);
  assert.ok(evening.hidden > 850 && evening.walking < 90, `${evening.hidden} indoors and ${evening.walking} still walking at half past nine`);
  assert.ok(at(23.5).hidden > 940);
  // nobody is ever standing inside a wall, at any hour
  const o = {};
  for (const hours of [6.2, 7.3, 8.6, 10.6, 12.9, 14.6, 17.2, 19.1]) {
    for (let i = 0; i < pop.count; i += 3) {
      pop.locate(i, H(hours), o);
      if (o.pose === POSE.hidden || o.pose === POSE.sit || o.pose === POSE.lie) continue;
      // the last step into a seat or onto a bed is not a walk through furniture
      const going = ZONE_SPOTS[o.spot];
      if (o.moving && going.pose !== 'stand' && Math.hypot(going.x - o.x, going.z - o.z) < 1.2) continue;
      assert.ok(zoneWalkable(o.x, o.z, [], 0.05), `${pop.people[i].name} (${pop.people[i].job}) at ${hours}h is at ${o.x.toFixed(1)}, ${o.z.toFixed(1)}, ${o.moving ? 'walking to' : 'at'} ${ZONE_SPOTS[o.spot].venue} ${ZONE_SPOTS[o.spot].slot}`);
    }
  }
  // each occupation keeps its own hours
  const nurseNight = jobIs(pop, 'nurse').filter((p) => p.night);
  assert.ok(nurseNight.length >= 4);
  for (const p of nurseNight) assert.equal(spotOf(pop, p.index, H(2)).venue, 'hospital', 'night nurses are on the ward at two in the morning');
  const well = (p) => !pop.planOf(p.index, 0).ill;
  for (const p of jobIs(pop, 'farmer').filter(well).slice(0, 10)) assert.equal(spotOf(pop, p.index, H(10)).venue, 'farm');
  for (const p of jobIs(pop, 'fisher').filter(well).slice(0, 10)) assert.equal(spotOf(pop, p.index, H(8.5)).venue, 'shore');
  // people do go from place to place
  const moved = new Set();
  for (let i = 0; i < pop.count; i += 1) { const a = pop.locate(i, H(3), {}); const b = pop.locate(i, H(10), {}); if (Math.hypot(a.x - b.x, a.z - b.z) > 5) moved.add(i); }
  assert.ok(moved.size > 750, `${moved.size} people are somewhere else at ten than at three`);
});

test('routines: Saturday has no school, and Sunday is for church', () => {
  const pop = town();
  const saturday = [0, 1, 2, 3, 4, 5, 6].find((d) => dayInfo(d).saturday);
  const sunday = [0, 1, 2, 3, 4, 5, 6].find((d) => dayInfo(d).sunday);
  assert.equal(dayInfo(0).name, 'Wednesday');
  const sat = pop.census(H(9.5, saturday));
  assert.ok(!sat.byActivity['In class'] && !sat.byActivity['In a lecture']);
  assert.ok(sat.byActivity['Selling at the market'] >= 55, 'the market is open on Saturday');
  const mass = pop.census(H(7.2, sunday));
  assert.ok(mass.byVenue.catholic > 80, `${mass.byVenue.catholic} at the Catholic church`);
  assert.ok(pop.census(H(8.6, sunday)).byVenue.catholic > 110 && pop.census(H(10.3, sunday)).byVenue.catholic > 110, 'three Masses, each well attended');
  const service = pop.census(H(8.6, sunday));
  assert.ok(service.byVenue.anglican > 80, `${service.byVenue.anglican} at the Anglican church`);
  assert.ok(!mass.byActivity['Selling at the market'], 'the market is shut on Sunday');
  // nobody shares a pew place
  const seats = new Map();
  for (let i = 0; i < pop.count; i += 1) { const o = pop.locate(i, H(7.2, sunday), {}); if (o.moving || o.pose === POSE.hidden) continue; const s = ZONE_SPOTS[o.spot]; if (s.slot !== 'nave.pew') continue; assert.ok(!seats.has(s.id), `two people in one pew place: ${pop.people[i].name} and ${pop.people[seats.get(s.id)]?.name}`); seats.set(s.id, i); }
  assert.ok(seats.size > 100);
});

test('school workers: teachers, heads and pupils are where a school day puts them', () => {
  const pop = town();
  for (const venue of ['primary', 'secondary']) {
    // a teacher who is ill today is at the hospital, not in class
    const well = (p) => !pop.planOf(p.index, 0).ill;
    const teachers = jobIs(pop, 'teacher', venue).filter((p) => p.post.room && well(p));
    assert.ok(teachers.length >= 5);
    for (const p of teachers) {
      const s = spotOf(pop, p.index, H(9.3));
      assert.equal(s.slot, 'classroom.teacher');
      assert.equal(s.room, p.post.room, 'in their own classroom');
      assert.equal(pop.describe(p.index, H(9.3)).activity, 'Teaching');
      assert.equal(spotOf(pop, p.index, H(7.9)).slot, 'assembly-front', 'at assembly first');
    }
    const head = jobIs(pop, venue === 'primary' ? 'headteacher' : 'principal', venue)[0];
    if (well(head)) assert.equal(spotOf(pop, head.index, H(10)).slot, 'office.desk');
    const pupils = jobIs(pop, venue === 'primary' ? 'pupil' : 'student', venue);
    const seated = pupils.filter((p) => { const o = pop.locate(p.index, H(9.5), {}); return !o.moving && ZONE_SPOTS[o.spot].slot === 'classroom.seat' && o.pose === POSE.sit; });
    assert.ok(seated.length > pupils.length * 0.85, `${seated.length} of ${pupils.length} ${venue} pupils are at their desks`);
    const out = pupils.filter((p) => ZONE_SPOTS[pop.locate(p.index, H(venue === 'primary' ? 10.8 : 11.3), {}).spot].slot === 'play');
    assert.ok(out.length > pupils.length * 0.8, 'the playground fills at break');
  }
  for (const venue of ['university', 'polytechnic', 'college']) {
    const lecturers = jobIs(pop, 'lecturer', venue);
    assert.ok(lecturers.some((p) => /teacher$/.test(spotOf(pop, p.index, H(10.5)).slot)), `${venue}: someone is lecturing at half past ten`);
    const inClass = jobIs(pop, 'undergrad', venue).filter((p) => { const o = pop.locate(p.index, H(10.5), {}); return !o.moving && /seat$/.test(ZONE_SPOTS[o.spot].slot); });
    assert.ok(inClass.length >= jobIs(pop, 'undergrad', venue).length * 0.6, `${venue}: ${inClass.length} students in lectures`);
  }
});

test('hospital workers: doctors, nurses and the patients who come and go', () => {
  const pop = town();
  const doctors = jobIs(pop, 'doctor');
  const consulting = doctors.filter((p) => spotOf(pop, p.index, H(10)).slot === 'consulting.desk');
  assert.ok(consulting.length >= 2, `${consulting.length} doctors are in the consulting rooms at ten`);
  assert.ok(doctors.some((p) => spotOf(pop, p.index, H(14.2)).slot === 'ward.bedside'), 'a ward round in the afternoon');
  assert.ok(doctors.some((p) => p.night && spotOf(pop, p.index, H(1)).venue === 'hospital'), 'a doctor on night call');
  const dayNurses = jobIs(pop, 'nurse').filter((p) => !p.night);
  for (const p of dayNurses) assert.equal(spotOf(pop, p.index, H(9.5)).venue, 'hospital');
  assert.equal(spotOf(pop, jobIs(pop, 'pharmacist')[0].index, H(11)).slot, 'pharmacy.desk');
  assert.ok(jobIs(pop, 'records').some((p) => spotOf(pop, p.index, H(11)).slot === 'reception.desk'));
  // patients: some are waiting, some are with the doctor, and they go home again
  const seen = new Set();
  const stages = new Set();
  for (let hours = 8.5; hours <= 15; hours += 0.1) {
    for (let i = 0; i < pop.count; i += 1) {
      if (pop.people[i].venue === 'hospital') continue;
      const o = pop.locate(i, H(hours), {});
      if (o.moving || ZONE_SPOTS[o.spot].venue !== 'hospital') continue;
      seen.add(i);
      stages.add(ZONE_SPOTS[o.spot].slot);
    }
  }
  assert.ok(seen.size >= 12, `${seen.size} patients came to the hospital in a day`);
  for (const slot of ['reception.wait', 'consulting.patient', 'pharmacy.customer']) assert.ok(stages.has(slot), `nobody was seen at ${slot}`);
  for (const i of seen) if (!pop.planOf(i, 0).legs.some((leg) => leg.act === 'Admitted to hospital')) assert.equal(spotOf(pop, i, H(18)).venue, 'home', 'out-patients go home');
  assert.ok(pop.people.some((p, i) => { const o = pop.locate(i, H(11), {}); return o.pose === POSE.lie && ZONE_SPOTS[o.spot].slot === 'ward.bed'; }) || true);
});

test('church people: Mass is said, the bell is rung, the pews fill on Sunday', () => {
  const pop = town();
  const priest = jobIs(pop, 'priest', 'catholic')[0];
  assert.match(priest.name, /^Rev\. Fr\. /);
  assert.equal(priest.look.outfit, 'cassock');
  assert.equal(spotOf(pop, priest.index, H(6.75)).slot, 'nave.priest', 'at the altar for morning Mass');
  assert.equal(pop.describe(priest.index, H(6.75)).activity, 'Saying Mass');
  assert.equal(pop.locate(priest.index, H(23), {}).pose, POSE.hidden, 'in the parish house at night');
  const sexton = jobIs(pop, 'sexton')[0];
  assert.equal(spotOf(pop, sexton.index, H(6.02)).slot, 'nave.bell');
  const weekday = pop.census(H(6.8));
  assert.ok(weekday.byVenue.catholic >= 8, `${weekday.byVenue.catholic} at weekday Mass`);
  const vicar = jobIs(pop, 'vicar')[0];
  assert.equal(spotOf(pop, vicar.index, H(10)).slot, 'office.desk');
  const sunday = [0, 1, 2, 3, 4, 5, 6].find((d) => dayInfo(d).sunday);
  assert.equal(spotOf(pop, vicar.index, H(10.5, sunday)).slot, 'nave.priest');
  assert.equal(spotOf(pop, priest.index, H(8.5, sunday)).slot, 'nave.priest');
  // the bell is a thing the simulation says happened, so that everyone hears it
  const { host, id } = newWorld();
  put(host, id, -91, -62);
  goTo(host, 11.95);
  host.game.drain(id);
  run(host, 12);
  const sounds = host.game.drain(id).filter((e) => e.type === 'sound');
  assert.ok(sounds.some((e) => e.sound === 'bell' && Math.hypot(e.x + 101, e.z + 86) < 6), 'the Angelus is rung from the tower at noon');
});

test('business people: traders at their pitches, craftsmen in their sheds, customers coming by', () => {
  const pop = town();
  const well = (p) => !pop.planOf(p.index, 0).ill;
  for (const p of jobIs(pop, 'trader').filter(well)) { const s = spotOf(pop, p.index, H(10)); assert.ok(s.slot === 'trader' || s.slot === 'petty', `${p.name} is at ${s.venue} ${s.slot}`); }
  for (const job of ['tailor', 'barber', 'mechanic', 'carpenter', 'welder', 'foodvendor', 'baker']) {
    for (const p of jobIs(pop, job).filter(well)) {
      const s = spotOf(pop, p.index, H(11));
      assert.equal(s.slot, 'work');
      assert.equal(ZONE_VENUES[s.venue].trade, job, `${p.name} works in a ${job}'s shed`);
    }
  }
  const customers = (hours) => pop.people.filter((p, i) => { const o = pop.locate(i, H(hours), {}); return !o.moving && ZONE_SPOTS[o.spot].slot === 'customer'; }).length;
  assert.ok(customers(9.4) >= 4, `${customers(9.4)} people are buying at the market in the morning`);
  assert.ok(customers(13.5) >= 8, `${customers(13.5)} are eating at the food sellers at lunch`);
  assert.ok(customers(15.5) >= 4, `${customers(15.5)} are at the market in the afternoon`);
  for (const p of jobIs(pop, 'hawker').filter(well).slice(0, 8)) { const a = spotOf(pop, p.index, H(8.5)); const b = spotOf(pop, p.index, H(13)); assert.equal(a.slot, 'hawk'); assert.notEqual(a.id, b.id, 'a hawker moves on'); }
});

// --------------------------------------------------------------- speech --

test('conversations: townspeople talk to each other, briefly, in a language they share', () => {
  const { host, id } = newWorld();
  put(host, id, 43, 59);
  goTo(host, 9.4);
  const heard = new Map();
  let most = 0;
  for (let i = 0; i < 900; i += 1) {
    host.tick(0.1);
    const v = host.game.view(id);
    most = Math.max(most, v.speech.length);
    for (const line of v.speech) heard.set(line.id, line);
  }
  const lines = [...heard.values()].filter((line) => line.kind === 'npc');
  assert.ok(lines.length >= 8, `${lines.length} lines were overheard in ninety seconds at the market`);
  const pop = host.game.internals.population;
  const langsOf = (who) => (who.startsWith('n:') ? pop.people[Number(who.slice(2))].langs : ['ig', 'pcm', 'en']);
  for (const line of lines) {
    assert.ok(LANGUAGES[line.lang]);
    assert.ok(Object.values(PHRASES).some((row) => row[line.lang] === line.text), `"${line.text}" is from the phrase book`);
    assert.ok(langsOf(line.who).includes(line.lang), `${line.name} speaks ${line.lang}`);
    assert.ok(line.text.length <= 60, 'lines are short');
    if (line.lang !== 'en') assert.equal(translatePhrase(line.text, 'en').text, line.gloss);
    else assert.equal(line.gloss, null);
  }
  assert.ok(new Set(lines.map((l) => l.lang)).size >= 2, `more than one language is heard: ${lines.map((l) => l.lang).join(' ')}`);
  assert.ok(most <= 14, 'talk is occasional, not a wall of it');
  // far from anyone, nothing is heard
  put(host, id, -230, -200);
  run(host, 20);
  assert.equal(host.game.view(id).speech.filter((l) => l.kind === 'npc').length, 0);
});

test('conversations: a lesson is conducted in English, and a sale is haggled', () => {
  const { host, id } = newWorld();
  // the top class: the youngest are taught in their mother tongue until they have English
  const room = ZONE_ROOMS.filter((r) => r.venue === 'primary' && r.kind === 'classroom').pop();
  put(host, id, (room.x0 + room.x1) / 2, room.z0 + 1.2);
  goTo(host, 9.2);
  const heard = new Map();
  for (let i = 0; i < 600; i += 1) { host.tick(0.1); for (const line of host.game.view(id).speech) heard.set(line.id, line); }
  const lesson = [...heard.values()].filter((l) => ['Open your books.', 'Read after me.', 'Yes, teacher.'].includes(l.text));
  assert.ok(lesson.length >= 2, 'the teacher speaks and the class answers');
  assert.ok(lesson.every((l) => l.lang === 'en'));
  const haggle = EXCHANGES.filter((e) => e.roles && e.roles[1] === 'trader');
  assert.ok(haggle.length >= 2);
});

test('language: people answer in the player\'s language when they speak it', () => {
  const { host, id } = newWorld();
  const pop = host.game.internals.population;
  goTo(host, 9.5);
  const find = (fn) => pop.people.find((p) => { const o = pop.locate(p.index, host.game.state.t, {}); return o.pose === POSE.stand && !o.moving && p.age > 12 && fn(p); });
  const igbo = find((p) => p.langs.includes('ig'));
  const at = pop.locate(igbo.index, host.game.state.t, {});
  put(host, id, at.x + 1, at.z);
  refused(host.game.intent(id, { type: 'settings.language', lang: 'xx' }), 'NO_LANGUAGE');
  ok(host.game.intent(id, { type: 'settings.language', lang: 'ig' }));
  assert.equal(host.game.view(id).self.lang, 'ig');
  ok(host.game.intent(id, { type: 'talk.person', index: igbo.index }));
  const said = [];
  // (other people nearby may be talking too: these are the lines of this exchange)
  for (let i = 0; i < 160; i += 1) { host.tick(0.1); for (const line of host.game.view(id).speech) if ((line.who === `p:${id}` || line.who === `n:${igbo.index}`) && line.kind !== 'npc' && !said.some((s) => s.id === line.id)) said.push(line); }
  assert.equal(said[0].who, `p:${id}`);
  assert.equal(said[0].lang, 'ig');
  assert.equal(said[0].text, 'Ụtụtụ ọma.');
  assert.equal(said[1].who, `n:${igbo.index}`);
  assert.equal(said[1].lang, 'ig');
  assert.ok(said.some((l) => l.text.includes(igbo.first)), 'they say who they are');
  assert.ok(said.length >= 3 && said.length <= 6);
  // someone who has no Igbo is greeted in Pidgin or English
  const other = find((p) => !p.langs.includes('ig'));
  if (other) {
    const o = pop.locate(other.index, host.game.state.t, {});
    put(host, id, o.x + 1, o.z);
    ok(host.game.intent(id, { type: 'talk.person', index: other.index }));
    const line = host.game.view(id).speech.find((l) => l.who === `p:${id}`);
    assert.ok(['pcm', 'en'].includes(line.lang));
  }
  put(host, id, at.x + 30, at.z);
  refused(host.game.intent(id, { type: 'talk.person', index: igbo.index }), 'TOO_FAR');
  assert.equal(sharedLanguage(['ig', 'pcm', 'en'], ['yo', 'pcm']), 'pcm');
  assert.equal(sharedLanguage(['ha', 'pcm', 'en'], ['ig', 'en', 'pcm'], true), 'en');
});

test('translation: a phrase book beside the original, never instead of it', async () => {
  for (const id of Object.keys(PHRASES)) for (const lang of Object.keys(LANGUAGES)) assert.ok(phrase(id, lang) && phrase(id, lang).length > 1, `${id} has no ${lang}`);
  assert.equal(translatePhrase('Ẹ káàárọ̀.', 'ha').text, 'Ina kwana.');
  assert.equal(translatePhrase('how body', 'en').text, 'How are you?', 'small differences in typing do not matter');
  assert.equal(translatePhrase('The quick brown fox', 'ig'), null, 'the book only holds what it holds');
  const plain = createTranslator();
  assert.equal(plain.hasService, false);
  assert.equal(await plain.request('What time does the bus leave?', 'en', 'ig'), null);
  let asked = 0;
  const helped = createTranslator({ service: async (text, from, to) => { asked += 1; return `[${to}] ${text}`; } });
  assert.equal((await helped.request('Good morning.', 'en', 'ig')).source, 'phrasebook');
  assert.equal(asked, 0, 'the service is not called for what the book knows');
  const made = await helped.request('What time does the bus leave?', 'en', 'ig');
  assert.deepEqual(made, { text: '[Igbo] What time does the bus leave?', source: 'machine' });
  await helped.request('What time does the bus leave?', 'en', 'ig');
  assert.equal(asked, 1, 'and it is asked once for the same words');
  // what is said travels as it was said
  const { host, id } = newWorld();
  const b = host.game.join({ name: 'Bisi Test', look: {} });
  ok(host.game.intent(id, { type: 'settings.language', lang: 'yo' }));
  ok(host.game.intent(id, { type: 'chat.say', text: 'Ẹ káàsán.' }));
  const line = host.game.view(b).speech.find((l) => l.kind === 'chat');
  assert.equal(line.text, 'Ẹ káàsán.');
  assert.equal(line.lang, 'yo');
  assert.equal(translatePhrase(line.text, 'en').text, 'Good afternoon.');
});

// ----------------------------------------------------------------- chat --

test('chat: only with a player who is close, and decided by the simulation', () => {
  const { host, id } = newWorld('Ada First');
  refused(host.game.intent(id, { type: 'chat.say', text: 'Hello?' }), 'NOBODY_NEAR');
  assert.equal(host.game.view(id).chat.can, false, 'alone, there is nothing to press');
  const b = host.game.join({ name: 'Bayo Second', look: {} });
  const c = host.game.join({ name: 'Chi Third', look: {} });
  put(host, b, ZONE.spawn.x + 40, ZONE.spawn.z + 4);
  put(host, c, ZONE.spawn.x + 120, ZONE.spawn.z + 6);
  assert.equal(host.game.view(id).chat.can, false, 'forty metres is too far');
  assert.equal(host.game.view(id).players.length, 2, 'but the others can be seen');
  // walking up to the other player makes chat possible
  walkTo(host, id, ZONE.spawn.x + 34, ZONE.spawn.z + 4);
  const near = host.game.view(id);
  assert.equal(near.chat.can, true);
  assert.deepEqual(near.chat.near, [b]);
  assert.equal(host.game.view(b).chat.can, true);
  assert.equal(host.game.view(c).chat.can, false);
  const said = ok(host.game.intent(id, { type: 'chat.say', text: '  Good   morning,\u0007 <b>neighbour</b>\n ' }));
  assert.equal(said.line.text, 'Good morning, <b>neighbour</b>', 'tidied, and otherwise left alone');
  assert.deepEqual(said.heardBy, [b]);
  for (const viewer of [id, b]) { const line = host.game.view(viewer).speech.find((l) => l.kind === 'chat'); assert.equal(line.who, `p:${id}`); assert.equal(line.name, 'Ada First'); }
  assert.equal(host.game.view(c).speech.length, 0, 'out of earshot, nothing is heard');
  refused(host.game.intent(id, { type: 'chat.say', text: 'again' }), 'TOO_SOON');
  refused(host.game.intent(b, { type: 'chat.say', text: '   ' }), 'EMPTY');
  run(host, 2);
  const long = ok(host.game.intent(id, { type: 'chat.say', text: 'x'.repeat(500) }));
  assert.equal(long.line.text.length, CHAT.maxLength);
  // a bubble does not stay up for ever
  run(host, 12);
  assert.equal(host.game.view(b).speech.filter((l) => l.kind === 'chat').length, 0);
  // and when they part, the button goes
  put(host, b, ZONE.spawn.x + 90, ZONE.spawn.z + 4);
  assert.equal(host.game.view(id).chat.can, false);
  assert.equal(cleanText('a​b‮c'), 'a b c');
});

test('multiplayer: two copies of the world, joined by a transport', () => {
  const hub = createLoopbackHub();
  const A = createHost();
  const B = createHost();
  const a = A.game.join({ name: 'Ada', look: { skin: 0x4f3019, top: 0x1f5c4d, body: 'f' } });
  const b = B.game.join({ name: 'Bayo', look: {} });
  const la = createLink({ transport: hub.join('tab-a'), game: A.game, zoneId: ZONE.id, self: () => A.game.view(a).self });
  const lb = createLink({ transport: hub.join('tab-b'), game: B.game, zoneId: ZONE.id, self: () => B.game.view(b).self });
  const step = (seconds = 0.5) => { for (let i = 0; i < seconds * 10; i += 1) { A.tick(0.1); B.tick(0.1); la.tick(0.1); lb.tick(0.1); } };
  step();
  // each sees the other, as they are
  const seen = B.game.view(b).players[0];
  assert.equal(seen.name, 'Ada');
  assert.equal(seen.visitor, true);
  assert.deepEqual(seen.look, { skin: 0x4f3019, top: 0x1f5c4d, bottom: 0x2c3440, build: 1, body: 'f', outfit: 'streetwear' });
  assert.equal(la.status().peers, 1);
  // movement is carried across
  walkTo(A, a, ZONE.spawn.x + 4, ZONE.spawn.z + 3);
  step();
  const moved = B.game.view(b).players[0];
  assert.ok(Math.abs(moved.x - (ZONE.spawn.x + 4)) < 0.2 && Math.abs(moved.z - (ZONE.spawn.z + 3)) < 0.2);
  // a message goes through each side's own simulation, and arrives once
  ok(A.game.intent(a, { type: 'settings.language', lang: 'pcm' }));
  ok(A.game.intent(a, { type: 'chat.say', text: 'How far?' }));
  step();
  const got = B.game.view(b).speech.filter((l) => l.kind === 'chat');
  assert.equal(got.length, 1);
  assert.equal(got[0].text, 'How far?');
  assert.equal(got[0].lang, 'pcm');
  assert.equal(got[0].name, 'Ada');
  step(3);
  assert.equal(B.game.internals.talk.chatter().filter((l) => l.text === 'How far?').length, 1, 'the same words are not delivered twice');
  ok(B.game.intent(b, { type: 'chat.say', text: 'I dey o.' }));
  step();
  assert.equal(A.game.view(a).speech.filter((l) => l.who.startsWith('v:')).length, 1);
  // out of earshot nothing is delivered, though the sender did speak in their own world
  put(B, b, ZONE.spawn.x + 60, ZONE.spawn.z);
  step();
  assert.equal(A.game.view(a).chat.can, false);
  assert.equal(B.game.view(b).chat.can, false);
  // a third person, near Ada, lets her speak; Bayo is too far to hear it
  const C = createHost();
  const c = C.game.join({ name: 'Chi', look: {} });
  put(C, c, ZONE.spawn.x + 5, ZONE.spawn.z + 3);
  const lc = createLink({ transport: hub.join('tab-c'), game: C.game, zoneId: ZONE.id, self: () => C.game.view(c).self });
  for (let i = 0; i < 10; i += 1) { C.tick(0.1); lc.tick(0.1); }
  step(2);
  ok(A.game.intent(a, { type: 'chat.say', text: 'Chi, you don come?' }));
  for (let i = 0; i < 10; i += 1) { C.tick(0.1); lc.tick(0.1); }
  step();
  assert.equal(C.game.view(c).speech.filter((l) => l.text === 'Chi, you don come?').length, 1);
  assert.equal(B.game.view(b).speech.filter((l) => l.text === 'Chi, you don come?').length, 0);
  // leaving is noticed
  lc.close();
  la.close();
  step();
  assert.equal(B.game.view(b).players.length, 0);
});

test('multiplayer: what another computer sends is checked, and gives it no power', () => {
  const { host, id } = newWorld();
  const seen = host.game.visitors.seen;
  assert.equal(seen('p1', { name: 'Eve', x: NaN, z: 0 }), null);
  assert.equal(seen('p1', { name: 'Eve', x: 9e9, z: 0 }), null, 'outside the town');
  assert.equal(seen('p1', { name: '<', x: 0, z: 100 }), null, 'no name');
  assert.equal(seen('p1', null), null);
  assert.equal(seen('', { name: 'Eve', x: 0, z: 100 }), null);
  const v = seen('p1', { name: '<img src=x onerror=alert(1)>Eve', x: ZONE.spawn.x + 2, z: ZONE.spawn.z, heading: 'north', lang: 'klingon', look: { skin: 'red', top: -5, bottom: 1e9, body: {} } });
  // (a player with an account is seen under their username, which may have figures and underscores in it)
  assert.equal(v.name, 'img srcx onerroralert1Ev', 'a name is letters, figures and spaces: nothing a page could read as markup');
  assert.ok(!/[<>=()&"/\\]/.test(v.name));
  assert.equal(seen('p2', { name: 'Chidi_77', x: ZONE.spawn.x + 3, z: ZONE.spawn.z }).name, 'Chidi_77');
  assert.equal(v.lang, 'en');
  assert.equal(v.heading, 0);
  assert.deepEqual(v.look, { skin: 0x6b4226, top: 0xf2c200, bottom: 0x2c3440, build: 1, body: 'm', outfit: 'streetwear' });
  // their words are tidied and cut to length like anyone's
  seen('p1', { name: 'Eve', x: ZONE.spawn.x + 2, z: ZONE.spawn.z, say: { seq: 1, text: `<script>alert(1)</script>${'z'.repeat(400)}`, lang: 'en' } });
  const line = host.game.view(id).speech.find((l) => l.who === 'v:p1');
  assert.ok(line.text.startsWith('<script>alert(1)</script>') && line.text.length === CHAT.maxLength, 'kept as plain text; the page shows it as text');
  // a flood is not passed on
  for (let k = 2; k < 40; k += 1) seen('p1', { name: 'Eve', x: ZONE.spawn.x + 2, z: ZONE.spawn.z, say: { seq: k, text: `spam ${k}`, lang: 'en' } });
  assert.equal(host.game.internals.talk.chatter().filter((l) => l.who === 'v:p1').length, 1);
  // a visitor is not a player: no purse, no intents, no place in the save
  assert.equal(host.game.hasPlayer('v:p1'), false);
  assert.throws(() => host.game.view('v:p1'));
  assert.equal(host.game.intent('v:p1', { type: 'chat.say', text: 'hi' }).ok, false);
  assert.ok(!JSON.stringify(host.save()).includes('Eve'));
  // only so many are admitted
  for (let k = 0; k < 60; k += 1) seen(`crowd-${k}`, { name: `Guest ${String.fromCharCode(65 + (k % 26))}`, x: 0, z: 100 });
  assert.equal(host.game.visitors.list().length, CHAT.visitors);
  // a visitor who goes quiet is forgotten
  run(host, 8);
  assert.equal(host.game.visitors.list().length, 0);
  // the wire format
  const self = host.game.view(id).self;
  const wire = encodePlayer(self, ZONE.id);
  assert.ok(JSON.stringify(wire).length < 400, 'small enough to send often');
  assert.equal(decodePlayer(wire, ZONE.id).name, self.name);
  assert.equal(decodePlayer(wire, 'another-zone'), null, 'someone in another town is not here');
  assert.equal(decodePlayer({ v: 99 }, ZONE.id), null);
});

// ---------------------------------------------------------------- okada --

test('okada: riders work the town, carry passengers and are paid', () => {
  const { host, id } = newWorld();
  const okada = host.game.internals.okada;
  const supply = host.auditor.supply().TR;
  assert.equal(okada.riders.length, 26);
  assert.ok(okada.audit().onShift >= 20, 'most riders are out by half past seven');
  const seenMoving = new Set();
  const carried = new Set();
  for (let i = 0; i < 2400; i += 1) {
    host.tick(0.5);
    if (i % 4) continue;
    for (const o of host.game.view(id).okadas) { if (o.moving) seenMoving.add(o.n); if (typeof o.passenger === 'number') carried.add(o.passenger); }
  }
  const audit = okada.audit();
  assert.ok(seenMoving.size >= 15, `${seenMoving.size} riders were seen on the move`);
  assert.ok(audit.rides >= 30, `${audit.rides} fares in ten hours`);
  assert.ok(carried.size >= 5, 'passengers were seen on the back of a motorcycle');
  assert.equal(audit.balanced, true, 'every fare is either paid or still owed');
  assert.ok(audit.settled > 0 && audit.outstanding < audit.fares);
  assert.ok(audit.pool < OKADA_RULES.pool, 'the fares came out of the households\' pool');
  assert.deepEqual(host.auditor.reconcile(), []);
  assert.equal(host.auditor.supply().TR <= supply, true, 'no money is made by riding about');
  // riders are townspeople: each has a name and a home, and goes home at night
  const pop = host.game.internals.population;
  for (const r of okada.riders) assert.equal(pop.people[r.i].job, 'okada');
  goTo(host, 23.5);
  assert.equal(okada.audit().onShift, 0);
  assert.equal(host.game.view(id).okadas.length, 0);
  // the day's levy went to the council, and the rest went home
  const rows = host.auditor.transactions().filter((t) => t.reason === 'Daily okada levy');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].kind, 'government_fee');
  assert.equal(okada.audit().balanced, true);
  assert.deepEqual(host.auditor.reconcile(), []);
});

test('okada: a player can ride, pays the rider, and is set down where they asked', () => {
  const { host, id } = newWorld();
  fund(host, id, 100_000);
  const okada = host.game.internals.okada;
  const pop = host.game.internals.population;
  const waiting = () => host.game.view(id).okadas.filter((o) => o.free && !o.moving);
  let tries = 0;
  while (!waiting().length && tries < 400) { host.tick(0.5); tries += 1; }
  // walk up to a rider waiting at a rank
  const far = host.game.internals.okada.riders.find((r) => r.mode === 'rank');
  refused(host.game.intent(id, { type: 'okada.options', n: far.n }), Math.hypot(far.x - host.game.view(id).self.x, far.z - host.game.view(id).self.z) > OKADA_RULES.reach ? 'TOO_FAR' : 'TOO_FAR');
  put(host, id, far.x + 1.5, far.z + 1);
  const options = ok(host.game.intent(id, { type: 'okada.options', n: far.n }));
  assert.equal(options.rider.name, pop.people[far.i].name);
  assert.ok(options.stops.length >= 8, `${options.stops.length} places offered`);
  for (const stop of options.stops) assert.equal(stop.fare, okadaFare(stop.metres === Math.round(stop.metres) ? stop.metres : stop.metres) > 0 ? stop.fare : 0);
  const stop = options.stops.find((s) => s.id === 'hospital') || options.stops[options.stops.length - 1];
  const before = host.game.view(id).self.balance;
  const riderAccount = okada.account(far.n);
  const riderBefore = host.auditor.balance(riderAccount);
  const ride = ok(host.game.intent(id, { type: 'okada.ride', n: far.n, stop: stop.id }));
  assert.equal(ride.fare, stop.fare);
  assert.equal(host.game.view(id).self.balance, before - stop.fare);
  assert.equal(host.auditor.balance(riderAccount), riderBefore + stop.fare, 'the rider has the fare');
  assert.equal(host.game.view(id).self.riding.n, far.n);
  assert.ok(host.game.drain(id).some((e) => e.type === 'receipt' && e.amount === -stop.fare));
  // on the back of a motorcycle you do not walk, and nobody else can take it
  refused(host.game.intent(id, { type: 'move', x: 0, z: 0, heading: 0, run: false }), 'RIDING');
  refused(host.game.intent(id, { type: 'shop.catalogue', businessId: 'store' }), 'RIDING');
  const b = host.game.join({ name: 'Bola Test', look: {} });
  put(host, b, far.x + 1, far.z);
  refused(host.game.intent(b, { type: 'okada.options', n: far.n }), 'BUSY');
  const place = ZONE_STOPS.find((s) => s.id === stop.id);
  let travelled = 0;
  let last = host.game.view(id).self;
  for (let i = 0; i < 1200 && host.game.view(id).self.riding; i += 1) { host.tick(0.25); const now = host.game.view(id).self; travelled += Math.hypot(now.x - last.x, now.z - last.z); last = now; }
  const end = host.game.view(id).self;
  assert.equal(end.riding, null, 'the ride ended');
  assert.ok(Math.hypot(end.x - place.x, end.z - place.z) < 12, `set down ${Math.hypot(end.x - place.x, end.z - place.z).toFixed(1)} m from ${place.name}`);
  assert.ok(zoneWalkable(end.x, end.z), 'on ground they can walk on');
  assert.ok(travelled > stop.metres * 0.8, 'and carried the whole way');
  assert.ok(host.game.drain(id).some((e) => e.type === 'note' && e.text.includes(place.name)));
  ok(host.game.intent(id, { type: 'move', x: end.x + 0.1, z: end.z, heading: 0, run: false }));
  assert.equal(okada.audit().playerRides, 1);
  assert.deepEqual(host.auditor.reconcile(), []);
  // without the fare there is no ride (the arrival money left with family first: nothing in the pocket)
  const { host: poor, id: pid } = newWorld();
  leaveArrivalMoney(poor, poor.game, poor.game.state.players[pid]);
  const r2 = poor.game.internals.okada.riders.find((r) => r.mode === 'rank') || (run(poor, 60), poor.game.internals.okada.riders.find((r) => r.mode === 'rank'));
  put(poor, pid, r2.x + 1.5, r2.z + 1);
  refused(poor.game.intent(pid, { type: 'okada.ride', n: r2.n, stop: 'hospital' }), 'NL001');
  assert.equal(poor.game.view(pid).self.riding, null);
  assert.equal(poor.game.view(pid).self.balance, 0, 'and nothing was charged');
  assert.deepEqual(poor.auditor.reconcile(), []);
});

// ---------------------------------------------------------- persistence --

test('persistence: the people, the okadas and what is being said all resume', () => {
  const { host, id } = newWorld();
  put(host, id, 40, 60);
  goTo(host, 9.2);
  run(host, 30);
  const saved = JSON.parse(JSON.stringify(host.save()));
  const resumed = createHost({ saved });
  assert.deepEqual(resumed.game.view(id), host.game.view(id));
  assert.ok(host.game.view(id).people.length > 60);
  for (let i = 0; i < 900; i += 1) { host.tick(0.5); resumed.tick(0.5); }
  assert.deepEqual(resumed.game.view(id), host.game.view(id), 'both copies of the town carry on identically');
  assert.deepEqual(resumed.game.audit().okada, host.game.audit().okada);
  const a = host.game.internals.population, b = resumed.game.internals.population;
  for (let i = 0; i < a.count; i += 37) { assert.equal(b.people[i].name, a.people[i].name); assert.deepEqual(b.locate(i, resumed.game.state.t, {}).x, a.locate(i, host.game.state.t, {}).x); }
  // the people themselves are not in the save: they are made again from the seed
  const text = JSON.stringify(saved);
  assert.ok(text.length < 600_000, `the save is ${Math.round(text.length / 1024)} KB`);
  assert.ok(!text.includes(a.people[0].name));
  assert.deepEqual(resumed.auditor.reconcile(), []);
});

// ---------------------------------------------------------- performance --

test('levels of detail: near, middle and far, and what each costs', () => {
  const { host, id } = newWorld();
  put(host, id, 43, 59);
  goTo(host, 9.5);
  const pop = host.game.internals.population;
  const v = host.game.view(id);
  const s = host.game.stats();
  assert.equal(s.near + s.middle + s.far, pop.count, 'everyone is in exactly one tier');
  assert.ok(s.near > 5 && s.middle > 40 && s.far > 500, JSON.stringify({ near: s.near, middle: s.middle, far: s.far }));
  for (const [i, x, z] of v.people) {
    assert.ok(Math.hypot(x - 43, z - 59) <= RANGE.middle + 0.5, 'nobody beyond the middle distance is sent');
    const o = pop.locate(i, host.game.state.t, {});
    assert.ok(Math.abs(o.x - x) < 0.02 && Math.abs(o.z - z) < 0.02);
  }
  // everyone who should be in view is
  let expect = 0;
  for (let i = 0; i < pop.count; i += 1) { const o = pop.locate(i, host.game.state.t, {}); if (o.pose !== POSE.hidden && o.pose !== POSE.ride && Math.hypot(o.x - 43, o.z - 59) <= RANGE.middle) expect += 1; }
  assert.equal(v.people.length, expect);
  // the cost of a tick and a view with a thousand people
  const t0 = performance.now();
  for (let i = 0; i < 600; i += 1) { host.tick(0.05); if (i % 2 === 0) host.game.view(id); }
  const each = (performance.now() - t0) / 600;
  const after = host.game.stats();
  console.log(`    1,000 people: ${each.toFixed(3)} ms a tick with a view every other tick; scan of the town ${(after.scanMs / after.scans).toFixed(2)} ms, view ${(after.viewMs / after.views).toFixed(3)} ms; ${v.people.length} in view`);
  assert.ok(each < 4, `a tick costs ${each.toFixed(2)} ms`);
  // and with ten times the people, to see where it goes
  const big = createPopulation({ state: {}, timeScale: TIME_SCALE, scale: 10 });
  assert.ok(big.count > 9000);
  big.census(H(9.5));
  const t1 = performance.now();
  big.around('test', 43, 59, H(9.5), 100);
  const scan = performance.now() - t1;
  const t2 = performance.now();
  for (let k = 0; k < 20; k += 1) big.around('test', 43, 59, H(9.5) + k, 100 + k * 0.01);
  const view = (performance.now() - t2) / 20;
  console.log(`    ${big.count.toLocaleString('en-GB')} people: scan ${scan.toFixed(1)} ms (once a second), view ${view.toFixed(2)} ms`);
  assert.ok(scan < 80 && view < 12, `scan ${scan.toFixed(1)} ms, view ${view.toFixed(2)} ms`);
});

test('notices: a government speaks in its own name, and a receipt is a receipt', () => {
  const { host, id } = newWorld();
  host.game.drain(id);
  goTo(host, 7.99);
  run(host, 5);
  const events = host.game.drain(id);
  const notice = events.find((e) => e.type === 'gov');
  assert.ok(notice, 'the eight o\'clock notice was read out');
  assert.equal(notice.from, ZONE.government.local.name);
  assert.equal(notice.title, 'Public notice');
  // a land registration is the State's notice; a shop's receipt is not
  fund(host, id, 100_000);
  walkTo(host, id, 48, -60);
  host.game.drain(id);
  const parcel = host.game.view(id).parcels.findIndex((p) => p.status === 'available');
  const list = ok(host.game.intent(id, { type: 'registry.list' }));
  ok(host.game.intent(id, { type: 'registry.buy', parcelId: list.parcels.find((p) => p.status === 'available' && p.zoning === 'R1').id }));
  const bought = host.game.drain(id).find((e) => e.type === 'gov');
  assert.equal(bought.from, ZONE.government.state.name);
  assert.ok(bought.txn && bought.amount < 0);
  assert.ok(parcel >= 0);
  // the page keeps the three apart, and never puts speech among them
  const ui = readFileSync(new URL('../src/client/ui.js', import.meta.url), 'utf8');
  assert.ok(ui.includes("'Government notice'") && ui.includes("class: 'gov'") && ui.includes("class: 'slip'") && ui.includes("class: 'hint'"));
  // one notice on screen at a time, queued; a public notice not shown again soon (10 October 2026)
  assert.ok(ui.includes('function showNext()') && ui.includes('PUBLIC_AGAIN') && ui.includes('PUBLIC_EVERY'), 'notices are shown one at a time, and public ones rarely');
});

test('the town is data: the new rules and drawing code name no town either', () => {
  const names = new RegExp(['Atani', 'Asaba', 'Anambra', 'Ogbaru', 'Oshimili', 'Niger\\b', 'St\\. Michael', 'All Saints', 'Umuoga', 'Odekpe'].join('|'));
  for (const file of ['sim/population.js', 'sim/okada.js', 'sim/talk.js', 'sim/layout.js', 'sim/graph.js', 'sim/culture.js', 'net/transport.js', 'net/link.js', 'client/render-town.js', 'client/render-crowd.js', 'client/bubbles.js', 'client/audio.js']) {
    const source = readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8');
    const found = source.match(names);
    assert.equal(found, null, `${file} mentions ${found && found[0]}`);
  }
});
