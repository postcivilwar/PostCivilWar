// The game simulation for one zone. It is authoritative: clients send
// intents, the simulation decides, and clients are told the result.
//
// It has no renderer and no DOM, so it runs the same in a browser tab, in
// Node, or behind a network socket. It is given a gameplay ledger handle and
// nothing else to do with money: it cannot see the settlement service.

import { ZONE, ZONE_SERVICES, ZONE_RESIDENTS, ZONE_BENCHES, ZONE_MOULD_STATIONS, ZONE_PARCELS, ZONE_ALLOCATIONS, ZONE_COMPOUNDS, ZONE_NOTICES, zoneService, zoneResident, zoneParcel, zoneParcelByPlot, zoneSiteLayout, zoneWalkable, zoneSwimmable, zoneToWater, zoneShoreZ } from './zone.js';
import { createResidents } from './residents.js';
import { createRegistry, GameError } from './registry.js';
import { createEconomy, DESIGNS, GOODS, BUSINESSES, ENERGY, PAINT_COLOURS, MASON_RATE, countOf } from './economy.js';
import { createVehicles, LOAD_UNITS } from './vehicles.js';
import { createPopulation, RANGE } from './population.js';
import { createOkada } from './okada.js';
import { createTalk } from './talk.js';
import { LANGUAGES } from './culture.js';
import { LedgerError, trText } from './ledger.js';
import { createActors } from './actors.js';
import { createConflict, HEALTH, MOVES, COMBAT } from './conflict.js';
import { createImpact, IMPACT, BODY } from './impact.js';
import { createJustice, LAW } from './justice.js';
import { createCare, CARE } from './care.js';
import { createPhone } from './phone.js';
import { createHijack, HIJACK } from './hijack.js';
import { createMarketBridge } from './market.js';
import { cleanFigureLook } from './figures.js';
import { createReactions } from './reactions.js';
import { makeRng } from './rng.js';

export const TIME_SCALE = 30;                 // game seconds per real second (a 48-minute day)
export const SIM_START = 7.5 * 3600;          // 07:30 on day one
export const SPEED = Object.freeze({ walk: 2.4, run: 5.6, rain: 0.9 });
const REACH = 4.5;
const ALWAYS = 'chat\\.|settings\\.|people\\.|phone\\.|contacts\\.|map\\.|wallet\\.history$|property\\.list$|police\\.status$|police\\.surrender$|police\\.reportSeen$|care\\.tariff$|care\\.ambulance';
const WHILE_DRIVING = new RegExp(`^(vehicle\\.|run\\.|${ALWAYS})`);
const WHILE_RIDING = new RegExp(`^(okada\\.alight$|${ALWAYS})`);
const WHILE_ASTRIDE = new RegExp(`^(moto\\.|${ALWAYS})`);
// Held by the police: the phone (as far as the officer allows), and what concerns the arrest itself.
const IN_CUSTODY = /^(custody\.|phone\.|contacts\.|map\.|chat\.|settings\.|people\.|wallet\.history$|property\.list$|police\.status$|care\.tariff$)/;
const WHILE_CARRIED = /^(phone\.|contacts\.|map\.|chat\.|settings\.|people\.|wallet\.history$|property\.list$|police\.status$)/;
const WHILE_TAKING = /^(hijack\.cancel$|chat\.|settings\.|people\.)/;
const REQUESTS_KEPT = 40;                     // answers remembered for each player, to answer a request sent twice
const SCRIPTED_WEATHER = [[9 + 40 / 60, 'clear'], [10 + 10 / 60, 'cloudy'], [11 + 20 / 60, 'rain'], [12, 'cloudy'], [16.5, 'clear']];
const WEATHER_NEXT = { clear: [['clear', 0.55], ['cloudy', 0.45]], cloudy: [['clear', 0.45], ['rain', 0.4], ['storm', 0.15]], rain: [['cloudy', 0.7], ['rain', 0.2], ['storm', 0.1]], storm: [['rain', 0.6], ['cloudy', 0.4]] };
const WEATHER_HOURS = { clear: [2, 5], cloudy: [0.5, 2], rain: [0.75, 2], storm: [0.3, 0.8] };

export function clockOf(t) {
  const dayNumber = Math.floor(t / 86400);
  const seconds = t - dayNumber * 86400;
  const hour = Math.floor(seconds / 3600);
  const minute = Math.floor((seconds % 3600) / 60);
  return { day: dayNumber + 1, hour, minute, hourFloat: seconds / 3600, label: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}` };
}

export function structureFootprint(parcel, design) {
  const turned = parcel.frontage === 'east' || parcel.frontage === 'west';
  const w = turned ? design.d : design.w;
  const d = turned ? design.w : design.d;
  return { x0: parcel.cx - w / 2, x1: parcel.cx + w / 2, z0: parcel.cz - d / 2, z1: parcel.cz + d / 2 };
}

// What every new character arrives with, in ledger units (two to a TR): 2,000 TR, the £20 of the story.
export const ARRIVAL_FUNDS = 4000;

// Swimming in the river (8 October 2026). Slower than walking; a stroke held makes it faster. One goes in from
// the bank and comes out at the bank; while in the water nothing else can be done.
export const SWIM = Object.freeze({ speed: 1.15, fast: 1.9, reach: 4.5, outReach: 2.6, depth: 1.2 });
const WHILE_SWIMMING = /^(move$|swim\.|phone\.|contacts\.|map\.|chat\.|settings\.|people\.|wallet\.history$|property\.list$|police\.status$)/;

export function createGameSim({ ledger, monetary, issuanceAccount, rng, saved }) {
  const state = saved || { version: 1, t: SIM_START, real: 0, playerCounter: 0, players: {}, weather: { kind: 'clear', until: 0 }, reports: [], structures: 0 };
  const queues = {};
  const emit = (playerId, event) => { if (state.players[playerId]) (queues[playerId] || (queues[playerId] = [])).push(event); };
  const clock = () => Math.round(state.t);
  const weather = () => ({ kind: state.weather.kind, wet: state.weather.kind === 'rain' || state.weather.kind === 'storm', intensity: { clear: 0, cloudy: 0, rain: 0.6, storm: 1 }[state.weather.kind] });

  const residents = createResidents({ state, timeScale: TIME_SCALE });
  const accountsShim = { government: (code) => ledger.openAccount('government', code, 'treasury') };
  const registry = createRegistry({ state, ledger, accounts: accountsShim, clock });
  const economy = createEconomy({ state, ledger, monetary, issuanceAccount, registry, residents, clock, weather, emit });
  const INITIAL_GOODS = { block: 240, cement: 68, roofing: 6, doorset: 6, paint: 8 };
  // the parts that deal with trouble know each other through this, so that none needs the rest to exist first
  const hub = {};
  const vehicles = createVehicles({ state, ledger, issuanceAccount, economy, clock, weather, emit, structureBoxes: () => structureBoxes(), hub });
  const fresh = !state.okada;
  const population = createPopulation({ state, timeScale: TIME_SCALE });
  const okada = createOkada({ state, ledger, monetary, issuanceAccount, population, timeScale: TIME_SCALE, emit, players: state.players, hub, obstacles: () => [...structureBoxes(), ...vehicles.boxes()] });
  // a player is the base character; saves from before it say nothing about what they wear
  for (const id of Object.keys(state.players)) if (!state.players[id].look.outfit) state.players[id].look = { ...state.players[id].look, outfit: 'streetwear' };
  const talk = createTalk({ state, population, residents, players: state.players, weather, hub });
  // people taken out of their day, fights, the law, the hospital, the phone, and vehicles taken without leave
  const actors = createActors({ state, population });
  actors.setResolver((target) => (target.kind === 'player' ? state.players[target.id] || null : null));
  hub.actors = actors; hub.vehicles = vehicles; hub.okada = okada; hub.serviceState = (id) => serviceState(id);
  // what townspeople's bodies do when something happens to them; its own dice, so that the rest of the town's
  // chances fall exactly as they did before it was added
  const reactions = createReactions({ state, population, rng: makeRng(0x5eac7) });
  hub.reactions = reactions;
  const conflict = createConflict({ state, players: state.players, population, actors, talk, emit, rng, hub });
  const justice = createJustice({ state, players: state.players, ledger, accounts: economy.accounts, population, actors, talk, emit, rng, hub });
  const care = createCare({ state, players: state.players, ledger, accounts: economy.accounts, emit, hub });
  const impact = createImpact({ state, players: state.players, population, actors, conflict, talk, emit, rng, hub, door: CARE.ambulance.door, visitors: () => talk.visitors() });
  const phone = createPhone({ state, players: state.players, ledger, accounts: economy.accounts, residents, talk, emit, clock, hub, serviceState: (id) => serviceState(id), timeScale: TIME_SCALE });
  const hijack = createHijack({ state, players: state.players, okada, vehicles, actors, population, emit, hub });
  // the shared market settles its sales here (market.js): money set aside for an offer, paid for a purchase, received for a sale
  const market = createMarketBridge({ state, ledger, monetary, issuanceAccount, players: state.players });
  for (const id of Object.keys(state.players)) { const q = state.players[id]; if (q.custody === undefined) q.custody = null; if (q.carried === undefined) q.carried = null; if (q.astride === undefined) q.astride = null; if (q.hijack === undefined) q.hijack = null; }
  // the riders have been out since before the newcomer's bus came in
  if (fresh) for (let k = 240; k > 0; k -= 1) okada.tick(1, SIM_START - k * TIME_SCALE, -k, false);

  // Things that happen at a set time each day: bells, and notices read out.
  const DAILY = [];
  for (const c of ZONE_COMPOUNDS) {
    if (c.kind === 'church') { const church = c.buildings[0]; const x = (church.tower.x0 + church.tower.x1) / 2; const z = (church.tower.z0 + church.tower.z1) / 2; for (const minute of c.faith === 'catholic' ? [360, 720, 1080] : [450, 1050]) DAILY.push({ minute, sound: 'bell', x, z }); }
    const bell = c.yard.find((y) => y.kind === 'bell');
    if (bell && c.hours) for (const minute of [c.hours[0] * 60 + 10, 490, c.kind === 'primary' ? 630 : 660, c.kind === 'primary' ? 660 : 690, c.hours[1] * 60 - 30]) DAILY.push({ minute, sound: 'handbell', x: bell.x, z: bell.z, school: true });
  }
  for (const n of ZONE_NOTICES) DAILY.push({ minute: Math.round(n.hour * 60), notice: n });
  let quiet = false;
  function daily(fromT, toT) {
    if (quiet) return;
    const a = Math.floor(fromT / 60), b = Math.floor(toT / 60);
    if (a === b) return;
    const day = population.dayInfo(Math.floor(toT / 86400));
    const minute = b % 1440;
    for (const e of DAILY) {
      if (e.minute !== minute) continue;
      if (e.school && !day.school) continue;
      for (const id of Object.keys(state.players)) {
        const p = state.players[id];
        if (e.sound && Math.hypot(p.x - e.x, p.z - e.z) < 420) emit(id, { type: 'sound', sound: e.sound, x: e.x, z: e.z });
        if (e.notice && e.notice.days.includes(day.weekday) && (!e.notice.wet || weather().wet)) emit(id, { type: 'gov', from: ZONE.government[e.notice.from].name, title: 'Public notice', text: e.notice.text });
      }
    }
  }

  if (!saved) {
    // Begin before dawn and let the town walk to work, so the first thing a
    // new arrival sees is people on the road.
    const startMinute = Math.floor(SIM_START / 60);
    residents.init(startMinute - 150);
    for (let i = 0; i < (150 * 60) / TIME_SCALE; i += 1) residents.tick(1, startMinute - 150 + Math.floor((i * TIME_SCALE) / 60));
    // Some residents already hold land, so the register is not empty on day one.
    for (const grant of ZONE_ALLOCATIONS) {
      const holder = zoneResident(grant.resident);
      registry.allocate(grant.plot, { kind: 'resident', id: holder.id, name: holder.name }, `Allocated to ${holder.name}`);
      if (!grant.design) continue;
      const row = registry.record(zoneParcelByPlot(grant.plot).id);
      const complete = grant.stage >= DESIGNS[grant.design].stages.length;
      row.permit = { no: `${ZONE.lgaCode}/BP/0000`, design: grant.design, issuedAt: 0, txn: null };
      row.site = { design: grant.design, stage: grant.stage, started: !complete, labour: grant.labour || 0, complete, paint: grant.paint || null, mason: null, startedAt: 0, completedAt: complete ? 0 : null };
    }
    state.structures = countStructures();
    advanceWeather();
  }

  // --- world state helpers ----------------------------------------------------

  function advanceWeather() {
    const now = clockOf(state.t);
    if (now.day === 1) {
      for (const [untilHour, kind] of SCRIPTED_WEATHER) {
        if (now.hourFloat < untilHour) { state.weather = { kind, until: untilHour * 3600 }; return; }
      }
    }
    const roll = rng.next();
    let acc = 0;
    let next = 'clear';
    for (const [kind, p] of WEATHER_NEXT[state.weather.kind]) { acc += p; if (roll < acc) { next = kind; break; } }
    const [lo, hi] = WEATHER_HOURS[next];
    state.weather = { kind: next, until: state.t + (lo + rng.next() * (hi - lo)) * 3600 };
  }

  let boxCache = null;
  let boxVersion = -1;
  function structureBoxes() {
    if (boxVersion === state.structures && boxCache) return boxCache;
    boxCache = [];
    for (const p of ZONE_PARCELS) {
      const site = state.registry.parcels[p.id].site;
      if (site && (site.stage >= 1)) boxCache.push(structureFootprint(p, DESIGNS[site.design]));
    }
    boxVersion = state.structures;
    return boxCache;
  }

  function serviceState(id) {
    const s = zoneService(id);
    const { hourFloat } = clockOf(state.t);
    if (!(s.closes - s.opens >= 24) && (hourFloat < s.opens || hourFloat >= s.closes)) {
      return { open: false, reason: `Closed. Open ${String(s.opens).padStart(2, '0')}:00 to ${String(s.closes).padStart(2, '0')}:00.` };
    }
    if (!s.staff) return { open: true, staff: null, reason: '' };
    const staff = s.staff.split('|');
    const present = staff.find((npc) => residents.isAt(npc, s.id));
    if (!present) return { open: false, reason: `Nobody is at the desk. ${zoneResident(staff[0]).name} has not arrived yet.` };
    return { open: true, staff: present, reason: '' };
  }

  function player(id) {
    const p = state.players[id];
    if (!p) throw new GameError('NO_PLAYER', 'Unknown player.');
    return p;
  }

  function near(p, x, z, range = REACH) {
    if (Math.hypot(p.x - x, p.z - z) > range) throw new GameError('TOO_FAR', 'You are too far away. Walk closer.');
  }

  function atService(p, id) {
    const s = zoneService(id);
    near(p, s.x, s.z, 5);
    const status = serviceState(id);
    if (!status.open) throw new GameError('CLOSED', status.reason);
    return status;
  }

  function ownStructureNearby(p) {
    for (const parcelId of registry.ownedBy(p.id)) {
      const site = state.registry.parcels[parcelId].site;
      const parcel = zoneParcel(parcelId);
      if (site && site.complete && Math.hypot(p.x - parcel.cx, p.z - parcel.cz) < 9) return parcelId;
    }
    return null;
  }

  // --- time ---------------------------------------------------------------------

  function step(dtReal) {
    const before = Math.floor(state.t / 3600);
    const was = state.t;
    state.real += dtReal;
    state.t += dtReal * TIME_SCALE;
    const now = clockOf(state.t);
    if (state.t >= state.weather.until) advanceWeather();
    const after = Math.floor(state.t / 3600);
    for (let h = before + 1; h <= after; h += 1) { economy.hourly(h % 24, Math.floor(h / 24)); conflict.hourly(); }
    residents.tick(dtReal, now.hour * 60 + now.minute, weather().wet ? SPEED.rain : 1);
    const stagesBefore = state.structures;
    economy.tick(dtReal, now.hourFloat);
    vehicles.tick();
    population.prepare(state.t);
    okada.tick(dtReal, state.t, state.real, weather().wet);
    actors.tick(dtReal, state.t, state.real);
    conflict.tick(dtReal);
    hijack.tick();
    justice.tick(dtReal);
    care.tick(dtReal);
    impact.tick();
    if (!quiet) reactions.tick(dtReal, Object.values(state.players).filter((q) => !q.custody && !q.carried));
    phone.tick();
    // nobody hears the town talk while time is being skipped (a night's sleep), and listening for it was two thirds of the cost of skipping
    if (!quiet) talk.tick(state.t);
    daily(was, state.t);
    if (stagesBefore !== countStructures()) state.structures = countStructures();
  }

  function countStructures() {
    let n = 0;
    for (const p of ZONE_PARCELS) { const site = state.registry.parcels[p.id].site; if (site && site.stage >= 1) n += 1; }
    return n;
  }

  // Prototype convenience for a single player: sleeping, resting and classes
  // run the world forward. A shared world cannot skip time; there the player
  // waits, or logs out and comes back.
  function advance(gameSeconds) {
    let left = gameSeconds / TIME_SCALE;
    quiet = true;
    while (left > 0) { const dt = Math.min(1, left); step(dt); left -= dt; }
    quiet = false;
  }

  // --- intents -------------------------------------------------------------------

  const handlers = {
    move(p, { x, z, heading, run }) {
      if (![x, z, heading].every(Number.isFinite)) throw new GameError('BAD_MOVE', 'Invalid position.');
      if (p.driving) throw new GameError('DRIVING', 'You are driving. Step out first.');
      if (p.riding !== null && p.riding !== undefined) throw new GameError('RIDING', 'You are on an okada. Get down first.');
      if (state.real < (p.heldUntil || 0)) throw new GameError('HELD', 'You are being held.');
      // another player is a body in the way: nobody walks through anybody
      impact.clear(p, x, z);
      const elapsed = Math.min(1.0, state.real - p.lastMoveAt);
      if (p.swimming) {
        // in the river: at a swimmer's pace, through water only; a stroke onto the bank itself climbs out
        const limit = (run ? SWIM.fast : SWIM.speed) * (elapsed + 0.12) * 1.15;
        const gap = Math.hypot(x - p.x, z - p.z);
        if (gap > limit) throw new GameError('TOO_FAST', 'Movement rejected.');
        const steps = Math.max(1, Math.ceil(gap / 0.4));
        for (let i = 1; i <= steps; i += 1) { const sx = p.x + ((x - p.x) * i) / steps, sz = p.z + ((z - p.z) * i) / steps; if (!zoneSwimmable(sx, sz) && !zoneWalkable(sx, sz)) throw new GameError('BLOCKED', 'Movement rejected.'); }
        p.x = x; p.z = z; p.heading = heading; p.lastMoveAt = state.real; p.stats.swum = (p.stats.swum || 0) + gap;
        if (zoneWalkable(x, z)) p.swimming = null;
        return { swimming: !!p.swimming };
      }
      // nobody runs on a fifth of their health
      const pace = run && !conflict.critical(p) ? SPEED.run : SPEED.walk;
      const limit = pace * (weather().wet ? SPEED.rain : 1) * (elapsed + 0.12) * 1.15;
      const gap = Math.hypot(x - p.x, z - p.z);
      if (gap > limit) throw new GameError('TOO_FAST', 'Movement rejected.');
      // Parked vehicles are in the way, except one that has been put down on top of you.
      const parked = vehicles.boxes().filter((b) => !(p.x > b.x0 - 0.4 && p.x < b.x1 + 0.4 && p.z > b.z0 - 0.4 && p.z < b.z1 + 0.4));
      const boxes = [...structureBoxes(), ...parked];
      // the ambulance too, unless the player is one of those it is in the middle of helping aboard
      const van = care.box();
      if (!(p.x > van.x0 - 0.5 && p.x < van.x1 + 0.5 && p.z > van.z0 - 0.5 && p.z < van.z1 + 0.5)) boxes.push(van);
      const steps = Math.max(1, Math.ceil(gap / 0.4));
      for (let i = 1; i <= steps; i += 1) {
        if (!zoneWalkable(p.x + ((x - p.x) * i) / steps, p.z + ((z - p.z) * i) / steps, boxes)) throw new GameError('BLOCKED', 'Movement rejected.');
      }
      p.x = x; p.z = z; p.heading = heading; p.lastMoveAt = state.real; p.stats.walked += gap;
      if (p.emote && gap > 0.05) p.emote = null;          // walking off ends a skill
      return {};
    },

    // A skill: the player's own figure plays one of its animations where it stands, for others to see. It is
    // only a movement of the body: it hits nobody, takes nothing, and is ended by walking off. Which clips a
    // figure has is the client's to know; here the name is only checked to be a name.
    emote(p, { name }) {
      if (typeof name !== 'string' || !/^[A-Za-z0-9_.\-]{1,48}$/.test(name)) throw new GameError('BAD_SKILL', 'There is no such skill.');
      if (p.fight) throw new GameError('FIGHTING', 'Not in the middle of a fight.');
      if (p.hijack) throw new GameError('BUSY', 'You have your hands full.');
      p.emote = { name, at: state.real };
      return { name };
    },
    // Into the river from the bank: a few steps from the water, on foot and able.
    'swim.in'(p) {
      if (p.fight) throw new GameError('FIGHTING', 'You are in a fight.');
      if (conflict.critical(p)) throw new GameError('CRITICAL', 'Your health is critical. You cannot swim like this.');
      if (p.swimming) throw new GameError('SWIMMING', 'You are already in the water.');
      const toWater = zoneToWater(p.x, p.z);
      if (toWater > SWIM.reach) throw new GameError('TOO_FAR', 'Walk down to the water first.');
      // the nearest water straight out from the bank
      let at = null;
      for (let d = Math.max(0, toWater) + SWIM.depth; d < toWater + 6; d += 0.4) { const z = p.z + d; if (zoneSwimmable(p.x, z)) { at = { x: p.x, z }; break; } }
      if (!at) throw new GameError('NO_WATER', 'There is no open water here. Try along the bank.');
      p.x = at.x; p.z = at.z; p.heading = 0; p.lastMoveAt = state.real;
      p.swimming = { since: state.real };
      p.stats.swims = (p.stats.swims || 0) + 1;
      return { x: p.x, z: p.z };
    },
    // Out onto the bank, from water close to it.
    'swim.out'(p) {
      if (!p.swimming) throw new GameError('NOT_SWIMMING', 'You are not in the water.');
      const toBank = -zoneToWater(p.x, p.z);
      if (toBank > SWIM.outReach) throw new GameError('TOO_FAR', 'Swim closer to the bank first.');
      let at = null;
      for (const dx of [0, 1, -1, 2, -2, 3, -3]) { for (let d = 0.9; d < 4; d += 0.3) { const x = p.x + dx, z = zoneShoreZ(x) - d; if (zoneWalkable(x, z)) { at = { x, z }; break; } } if (at) break; }
      if (!at) throw new GameError('NO_BANK', 'The bank is too steep here. Swim along a little.');
      p.x = at.x; p.z = at.z; p.heading = Math.PI; p.lastMoveAt = state.real;
      p.swimming = null;
      return { x: p.x, z: p.z };
    },

    talk(p, { residentId }) {
      const r = zoneResident(residentId);
      const live = r && residents.get(residentId);
      if (!r || live.mode === 'inside') throw new GameError('NOT_HERE', 'There is nobody there.');
      near(p, live.x, live.z);
      p.met[residentId] = true;
      const { hour } = clockOf(state.t);
      const greeting = hour < 12 ? 'Good morning.' : hour < 17 ? 'Good afternoon.' : 'Good evening.';
      let service = null;
      if (r.service) {
        const status = serviceState(r.service);
        const s = zoneService(r.service);
        const atDesk = residents.isAt(residentId, r.service);
        service = { id: r.service, name: s.name, open: status.open && atDesk, note: atDesk ? status.reason : 'I am not at my desk. Come and find me there.' };
      }
      talk.talkToResident(p, r, live, greeting, service);
      return { residentId, name: r.name, role: r.role, greeting, about: r.talk.about, tip: r.talk.tip, service, walking: live.mode === 'walking' };
    },
    'talk.person'(p, { index }) { return talk.talkToPerson(p, Number(index)); },
    // who the people in view are: a client asks once for each new face
    'people.describe'(p, { ids }) {
      const out = [];
      for (const raw of Array.isArray(ids) ? ids.slice(0, 60) : []) {
        const i = Number(raw);
        if (!Number.isInteger(i) || i < 0 || i >= population.count) continue;
        const at = population.locate(i, state.t, {});
        if (Math.hypot(at.x - p.x, at.z - p.z) > RANGE.scan + 20) continue;
        const who = population.people[i];
        out.push({ index: i, id: who.id, name: who.name, short: who.short, look: who.look, fig: who.fig });
      }
      return { people: out };
    },
    'people.about'(p, { index }) {
      const i = Number(index);
      if (!Number.isInteger(i) || i < 0 || i >= population.count) throw new GameError('NOT_HERE', 'There is nobody there.');
      const at = population.locate(i, state.t, {});
      near(p, at.x, at.z, 30);
      const d = population.describe(i, state.t);
      return { person: { name: d.name, role: d.role, activity: d.activity, home: d.home, languages: d.languages, age: d.age } };
    },
    'chat.say'(p, { text }) { return talk.chat(p, text); },
    'settings.language'(p, { lang }) {
      if (!LANGUAGES[lang]) throw new GameError('NO_LANGUAGE', 'That language is not offered yet.');
      p.lang = lang;
      return { lang };
    },
    'okada.options'(p, { n }) { return okada.options(p, Number(n)); },
    'okada.ride'(p, { n, stop }) {
      const result = okada.ride(p, Number(n), stop);
      emit(p.id, { type: 'receipt', title: 'Okada fare', text: `${result.rider} takes you to ${result.to}.`, txn: result.txn, amount: -result.fare });
      return result;
    },
    'okada.alight'(p) { return okada.alight(p); },

    'registry.list'(p) { atService(p, 'registry'); return { parcels: registry.list(p.id) }; },
    'registry.buy'(p, { parcelId }) {
      atService(p, 'registry');
      const result = registry.purchase(p, parcelId);
      emit(p.id, { type: 'gov', from: ZONE.government.state.name, title: 'Land registered', text: `Plot ${result.parcel.plot} is registered in your name. Title ${result.titleNo}.`, txn: result.txn, amount: -result.total });
      return result;
    },
    'parcel.inspect'(p, { parcelId }) {
      const parcel = zoneParcel(parcelId);
      if (!parcel) throw new GameError('NO_PARCEL', 'There is no such parcel.');
      const board = zoneSiteLayout(parcel).board;
      near(p, board.x, board.z, 6);
      p.inspected[parcelId] = true;
      return { parcel: registry.view(parcelId, p.id), site: economy.siteView(parcelId, p.id) };
    },

    'permit.options'(p) {
      atService(p, 'secretariat');
      return {
        plots: registry.ownedBy(p.id).map((id) => registry.view(id, p.id)),
        designs: Object.values(DESIGNS).map((d) => ({ id: d.id, name: d.name, zoning: d.zoning, fee: d.permitFee, size: `${d.w} m by ${d.d} m`, stages: d.stages.map((s) => ({ name: s.name, needs: { ...s.needs }, labour: s.labour })) })),
      };
    },
    'permit.apply'(p, { parcelId, design }) {
      atService(p, 'secretariat');
      if (!DESIGNS[design]) throw new GameError('NO_DESIGN', 'That design is not on file.');
      const result = registry.applyPermit(p, parcelId, DESIGNS[design]);
      economy.siteOf(parcelId);
      emit(p.id, { type: 'gov', from: ZONE.government.local.name, title: 'Building permit', text: `Permit ${result.permitNo} issued.`, txn: result.txn, amount: -result.fee });
      return result;
    },
    'treasury.public'(p, { code }) {
      const desk = ZONE_SERVICES.find((s) => s.jurisdiction === code && ['registry', 'secretariat'].includes(s.id));
      if (!desk) throw new GameError('NO_ACCOUNT', 'There is no such public account.');
      atService(p, desk.id);
      return economy.publicAccount(code);
    },

    'shop.catalogue'(p, { businessId }) {
      atService(p, businessId);
      const desk = zoneService(businessId);
      return { business: { id: businessId, name: BUSINESSES[businessId].name, delivery: BUSINESSES[businessId].delivery || 0 }, items: economy.catalogue(businessId), plots: registry.ownedBy(p.id).map((id) => ({ id, plot: zoneParcel(id).plot })), carriers: vehicles.carriersNear(p, desk.x, desk.z), loadUnits: { ...LOAD_UNITS } };
    },
    'shop.buy'(p, { businessId, item, qty, parcelId, carry }) {
      atService(p, businessId);
      const desk = zoneService(businessId);
      const carrier = carry ? vehicles.checkRoom(p, carry, desk.x, desk.z, item, qty) : null;
      const result = economy.buy(p, businessId, item, qty, parcelId, carrier);
      emit(p.id, { type: 'receipt', title: BUSINESSES[businessId].name, text: carrier ? `${countOf(item, qty)} paid for and loaded into keke ${carrier.plate}.` : `${countOf(item, qty)} paid for. Delivery to site in about ${result.dueMinutes} minutes.`, txn: result.txn, amount: -result.total });
      return result;
    },

    // --- vehicles and delivery runs ---
    'vehicle.options'(p) { atService(p, 'park'); return vehicles.options(p); },
    'vehicle.hire'(p) {
      atService(p, 'park');
      const result = vehicles.hire(p);
      emit(p.id, { type: 'receipt', title: zoneService('park').name, text: `Keke ${result.vehicle.plate} is yours until six tomorrow morning.`, txn: result.txn, amount: -result.fee });
      return result;
    },
    'vehicle.buy'(p, { paint, trim } = {}) {
      atService(p, 'park');
      const result = vehicles.buy(p, { paint, trim });
      emit(p.id, { type: 'gov', from: ZONE.government.state.name, title: 'Vehicle registered', text: `Keke ${result.vehicle.plate} is registered in your name.`, txn: result.txn, amount: -result.total });
      return result;
    },
    'vehicle.refuel'(p, { vehicleId, litres }) {
      atService(p, 'park');
      const result = vehicles.refuel(p, vehicleId, litres);
      emit(p.id, { type: 'receipt', title: 'Petrol', text: `${result.litres.toFixed(1)} litres in the tank.`, txn: result.txn, amount: -result.cost });
      return result;
    },
    'vehicle.mine'(p) { return { vehicles: vehicles.selfView(p).vehicles.map((id) => vehicles.summary(vehicles.get(id), p.id)) }; },
    'vehicle.enter'(p, { vehicleId }) { return vehicles.enter(p, vehicleId); },
    'vehicle.exit'(p) { if (!p.driving) throw new GameError('NOT_DRIVING', 'You are not driving.'); return vehicles.exit(p); },
    'vehicle.drive'(p, step) { if (!p.driving) throw new GameError('NOT_DRIVING', 'You are not driving.'); return vehicles.drive(p, step); },
    'vehicle.unload'(p, { vehicleId, parcelId }) {
      if (!zoneParcel(parcelId)) throw new GameError('NO_PARCEL', 'There is no such parcel.');
      const result = vehicles.unload(p, vehicleId, parcelId, state.registry.parcels[parcelId]);
      emit(p.id, { type: 'site', text: `Unloaded at Plot ${result.plot}: ${Object.entries(result.moved).map(([item, qty]) => countOf(item, qty)).join(', ')}.` });
      return result;
    },
    'run.list'(p) { return vehicles.listRuns(p); },
    'run.accept'(p, { runId }) { return vehicles.acceptRun(p, runId); },
    'run.load'(p) { return vehicles.loadRun(p); },
    'run.deliver'(p) {
      const result = vehicles.deliverRun(p);
      emit(p.id, { type: 'receipt', title: 'Delivery paid', text: `${result.what} delivered to ${result.to}.`, txn: result.txn, amount: result.fee });
      return result;
    },
    'run.drop'(p) { return vehicles.dropRun(p); },
    eat(p) {
      atService(p, 'kitchen');
      const result = economy.eat(p);
      emit(p.id, { type: 'receipt', title: BUSINESSES.kitchen.name, text: `A plate of ${ZONE.dish.toLowerCase()}. You feel stronger.`, txn: result.txn, amount: -result.total });
      return result;
    },
    'clinic.treat'(p) {
      atService(p, 'clinic');
      const result = economy.treat(p);
      emit(p.id, { type: 'receipt', title: BUSINESSES.clinic.name, text: 'Treated and rested. Your energy is restored.', txn: result.txn, amount: -result.total });
      return result;
    },
    'school.enrol'(p) {
      atService(p, 'school');
      const result = economy.enrol(p);
      advance(result.hours * 3600);
      emit(p.id, { type: 'receipt', title: BUSINESSES.school.name, text: 'Block-laying certificate awarded. Your work on site now counts double.', txn: result.txn, amount: -result.total });
      return result;
    },
    'police.report'(p, { text }) {
      atService(p, 'police');
      const body = String(text || '').trim().slice(0, 240);
      if (body.length < 8) throw new GameError('TOO_SHORT', 'Say what happened in a sentence or two.');
      const report = { no: `${ZONE.lgaCode}/CR/${String(state.reports.length + 1).padStart(4, '0')}`, by: p.id, at: clock(), text: body, status: 'recorded' };
      state.reports.push(report);
      return { report };
    },
    'police.reports'(p) { atService(p, 'police'); return { reports: state.reports.filter((r) => r.by === p.id) }; },

    'job.info'(p) {
      atService(p, 'yard');
      return { wage: BUSINESSES.yard.wagePerBlock, stations: ZONE_MOULD_STATIONS.filter((s) => !s.reservedFor).map((s) => s.id), moulded: p.stats.blocksMoulded, yardStock: economy.have('yard', 'block') };
    },
    'job.mould'(p, { stationId }) {
      const station = ZONE_MOULD_STATIONS.find((s) => s.id === stationId);
      if (!station) throw new GameError('NO_STATION', 'There is no such mould.');
      near(p, station.standX, station.standZ, 2.5);
      const status = serviceState('yard');
      if (!status.open) throw new GameError('CLOSED', `The yard is not working now. ${status.reason}`);
      const result = economy.mould(p, stationId, state.real);
      if (p.stats.blocksMoulded === 1) emit(p.id, { type: 'receipt', title: 'First wage', text: `${BUSINESSES.yard.name} paid you ${trText(result.wage)} for one block.`, txn: result.txn, amount: result.wage });
      return result;
    },

    'site.view'(p, { parcelId }) {
      const parcel = zoneParcel(parcelId);
      if (!parcel) throw new GameError('NO_PARCEL', 'There is no such parcel.');
      near(p, parcel.cx, parcel.cz, 22);
      return economy.siteView(parcelId, p.id);
    },
    'site.work'(p, { parcelId }) {
      const parcel = zoneParcel(parcelId);
      if (!parcel) throw new GameError('NO_PARCEL', 'There is no such parcel.');
      near(p, parcel.cx, parcel.cz, 12);
      const result = economy.work(p, parcelId, state.real);
      state.structures = countStructures();
      if (result.finishedStage) emit(p.id, { type: 'site', text: result.complete ? `Plot ${parcel.plot}: the building is complete.` : `Plot ${parcel.plot}: ${result.finishedStage.toLowerCase()} finished.` });
      return result;
    },
    'site.hire'(p, { parcelId }) {
      const parcel = zoneParcel(parcelId);
      if (!parcel) throw new GameError('NO_PARCEL', 'There is no such parcel.');
      near(p, parcel.cx, parcel.cz, 22);
      const result = economy.hireMason(p, parcelId);
      emit(p.id, { type: 'receipt', title: 'Mason engaged', text: `${zoneResident('mason').name} will do ${result.stage.toLowerCase()} (${result.units} units of labour at ${MASON_RATE} each). He is on his way.`, txn: result.txn, amount: -result.fee });
      return result;
    },
    'site.paint'(p, { parcelId, colour }) { return economy.choosePaint(p, parcelId, colour); },

    rest(p, { benchId, hours }) {
      const bench = ZONE_BENCHES.find((b) => b.id === benchId);
      if (!bench) throw new GameError('NO_BENCH', 'There is no bench there.');
      near(p, bench.x, bench.z, 3);
      const h = Math.max(1, Math.min(10, Math.round(Number(hours) || 1)));
      advance(h * 3600);
      p.energy = Math.min(ENERGY.max, p.energy + ENERGY.restPerHour * h);
      return { hours: h, energy: p.energy };
    },
    sleep(p) {
      const home = ownStructureNearby(p);
      if (!home) throw new GameError('NO_HOME', 'You can sleep in a building you own, once it is finished.');
      const now = clockOf(state.t);
      const hoursToMorning = ((24 + 6.5 - now.hourFloat) % 24) || 24;
      advance(hoursToMorning * 3600);
      p.energy = ENERGY.max;
      if (!conflict.critical(p)) p.health = Math.min(HEALTH.max, p.health + HEALTH.sleep);
      return { hours: hoursToMorning, energy: p.energy, health: p.health };
    },

    // --- fighting ---
    'combat.engage'(p, { target }) { return conflict.engage(p, target); },
    'combat.act'(p, { move }) { return conflict.act(p, String(move)); },
    'combat.block'(p, { on }) { return conflict.block(p, !!on); },
    'combat.dodge'(p, { dx, dz }) { return conflict.dodge(p, { dx, dz }); },
    'combat.disengage'(p) { return conflict.disengage(p); },

    // --- offences, and the police ---
    'crime.steal'(p, { target }) {
      if (p.fight) throw new GameError('FIGHTING', 'Not while you are squared up to someone.');
      const result = justice.steal(p, target);
      if (result.taken > 0) emit(p.id, { type: 'receipt', title: 'Stolen', text: 'You have somebody else\'s money in your pocket.', txn: result.txn, amount: result.taken });
      return result;
    },
    'police.status'(p) { return { law: justice.selfView(p), record: justice.record(p), scale: Object.fromEntries(Object.entries(LAW.offences).map(([id, o]) => [id, { name: o.name, fine: o.fine, hours: o.hours }])), treasury: justice.audit() }; },
    'police.surrender'(p) { return justice.surrender(p); },
    'police.reportSeen'(p, { crimeId }) { return justice.reportSeen(p, String(crimeId)); },
    'police.settle'(p) { return justice.settleOwed(p); },
    'police.enlist'(p) { atService(p, 'police'); return justice.enlist(p); },
    'police.resign'(p) { return justice.resign(p); },
    'police.wanted'(p) { return justice.wantedList(p); },
    'police.arrest'(p, { playerId }) { return justice.arrestBy(p, String(playerId)); },
    'police.fine'(p, { arrestId, amount }) { return justice.setFine(p, String(arrestId), amount); },
    'police.book'(p, { arrestId }) { return justice.bookIn(p, String(arrestId)); },
    'police.decideCall'(p, { arrestId, allow }) { return justice.decideCall(p, String(arrestId), !!allow); },
    'custody.pay'(p, { arrestId } = {}) {
      // asked again after release (a second tap, a retry): the arrest named is answered with its receipt
      const id = p.custody || (arrestId ? String(arrestId) : null);
      const record = id ? justice.arrestOf(id) : null;
      if (!record || record.culprit !== p.id) throw new GameError('NOT_IN_CUSTODY', 'You are not under arrest.');
      return justice.payFine(p, id);
    },
    'custody.requestCall'(p) { return justice.requestCall(p); },
    // Prototype convenience, like sleeping: sit out the time. A shared world cannot skip time; there the prisoner waits.
    'custody.wait'(p) {
      const record = p.custody ? justice.arrestOf(p.custody) : null;
      if (!record || record.status !== 'custody') throw new GameError('NOT_IN_CUSTODY', 'You are not being held.');
      const seconds = Math.max(0, record.until - state.t) + TIME_SCALE;
      advance(seconds);
      return { hours: seconds / 3600 };
    },
    // someone else, standing at the Police Post, pays a prisoner's fine
    'bail.pay'(p, { arrestId }) { return justice.payFine(p, String(arrestId)); },

    // --- taking a vehicle ---
    'hijack.start'(p, { okada: n, vehicle }) { return hijack.start(p, { okada: n, vehicle }); },
    'hijack.cancel'(p) { return hijack.cancel(p); },
    // the horn: the simulation needs to know, because people in the road answer it
    'vehicle.horn'(p) { if (!p.driving) throw new GameError('NOT_DRIVING', 'You are not driving.'); return impact.horn(p); },
    'moto.horn'(p) { if (p.astride === null || p.astride === undefined) throw new GameError('NOT_RIDING', 'You are not on a motorcycle.'); return impact.horn(p); },
    'moto.drive'(p, step) { if (p.astride === null || p.astride === undefined) throw new GameError('NOT_RIDING', 'You are not on a motorcycle.'); return okada.rideDrive(p, step); },
    'moto.leave'(p) { if (p.astride === null || p.astride === undefined) throw new GameError('NOT_RIDING', 'You are not on a motorcycle.'); return okada.dismount(p); },

    // --- treatment ---
    'care.tariff'(p, { place }) { return care.tariff(String(place)); },
    'care.quote'(p, { place }) { atService(p, String(place)); return care.quote(p, String(place)); },
    'care.bargain'(p, { quoteId, level, offer }) { const q = care.quoteOf(String(quoteId)); if (q) atService(p, q.place); return care.bargain(p, String(quoteId), level, offer); },
    'care.pay'(p, { quoteId, level }) {
      const q = care.quoteOf(String(quoteId));
      if (q && !q.used) atService(p, q.place);
      const result = care.pay(p, String(quoteId), level);
      if (!result.replayed) emit(p.id, { type: 'receipt', title: zoneService(result.place).name, text: `Treated. Your health is now ${result.health}%.`, txn: result.txn, amount: -result.fee });
      return result;
    },
    'care.ambulance.info'(p) { return care.ambulanceInfo(p); },
    'care.ambulance.call'(p) {
      const result = care.callAmbulance(p);
      if (!result.replayed && result.call.fee > 0) emit(p.id, { type: 'receipt', title: 'Ambulance', text: 'The ambulance is on its way.', txn: result.call.txn, amount: -result.call.fee });
      return result;
    },

    // --- the phone ---
    'phone.contacts'(p) { return { contacts: phone.contacts(p), ...phone.selfView(p), ...phone.recent(p), custody: p.custody ? { mayCall: justice.mayCall(p) } : null }; },
    'phone.call'(p, { key, about }) { return phone.call(p, String(key), about ? String(about) : null); },
    'phone.message'(p, { key, text }) { return phone.message(p, String(key), text); },
    'phone.thread'(p, { key }) { return phone.thread(p, String(key)); },
    'phone.askBail'(p, { key }) { return phone.askBail(p, String(key)); },
    'phone.askSurety'(p, { key }) { return phone.askSurety(p, String(key)); },
    'phone.repay'(p, { debtId, amount }) { const result = phone.repay(p, String(debtId), amount); emit(p.id, { type: 'receipt', title: 'Repaid', text: result.left ? `You still owe ${trText(result.left)}.` : 'You owe nothing more.', txn: result.txn, amount: -result.paid }); return result; },
    'contacts.add'(p, { playerId }) { return phone.addContact(p, String(playerId)); },
    'contacts.tag'(p, { key, tag }) { return phone.tagContact(p, String(key), String(tag)); },
    'contacts.remove'(p, { key }) { return phone.removeContact(p, String(key)); },
    'map.route'(p, { x, z, label }) { return phone.route(p, { x, z, label: label ? String(label).slice(0, 60) : '' }); },

    'wallet.history'(p) { return { balance: ledger.balance(p.wallet), rows: ledger.history(p.wallet, 25) }; },
    'property.list'(p) { return { parcels: registry.ownedBy(p.id).map((id) => ({ parcel: registry.view(id, p.id), site: economy.siteView(id, p.id) })) }; },
  };

  function intent(playerId, message) {
    try {
      const p = player(playerId);
      const handler = message && Object.prototype.hasOwnProperty.call(handlers, message.type) ? handlers[message.type] : null;
      if (!handler) throw new GameError('UNKNOWN_INTENT', 'The server does not know that request.');
      // A request that carries an id is answered once. Sent again (a second tap, a retry after a lost
      // connection), it gets the first answer back and nothing is done a second time.
      const rid = typeof message.requestId === 'string' && message.requestId.length >= 8 && message.requestId.length <= 80 ? message.requestId : null;
      const kept = rid ? (answered[playerId] || (answered[playerId] = [])) : null;
      if (kept) { const before = kept.find((e) => e.id === rid); if (before) return before.type === message.type ? { ...before.result, replayed: true } : { ok: false, code: 'REQUEST_REUSED', message: 'That request id was used for something else.' }; }
      const result = decide(p, handler, message);
      if (kept) { kept.push({ id: rid, type: message.type, result }); if (kept.length > REQUESTS_KEPT) kept.shift(); }
      return result;
    } catch (error) {
      if (error instanceof GameError) return { ok: false, code: error.code, message: error.message, ...(error.at ? { at: error.at } : {}) };
      throw error;
    }
  }

  function decide(p, handler, message) {
    try {
      if (p.custody && !IN_CUSTODY.test(message.type)) throw new GameError('IN_CUSTODY', 'You are in the hands of the police.');
      if (p.dead && !WHILE_CARRIED.test(message.type)) throw new GameError('DEAD', 'You have been killed. You will come round at the hospital.');
      if (p.down && !WHILE_CARRIED.test(message.type)) throw new GameError('DOWN', 'You have been knocked down.');
      if (p.carried && !WHILE_CARRIED.test(message.type)) throw new GameError('CARRIED', 'You are in the ambulance.');
      if (p.hijack && !WHILE_TAKING.test(message.type)) throw new GameError('BUSY', 'You have your hands full.');
      if (p.driving && !WHILE_DRIVING.test(message.type)) throw new GameError('DRIVING', 'Step out of the keke first.');
      if (p.riding !== null && p.riding !== undefined && !WHILE_RIDING.test(message.type)) throw new GameError('RIDING', 'Get down from the okada first.');
      if (p.astride !== null && p.astride !== undefined && !WHILE_ASTRIDE.test(message.type)) throw new GameError('RIDING', 'Get off the motorcycle first.');
      if (p.swimming && !WHILE_SWIMMING.test(message.type)) throw new GameError('SWIMMING', 'You are in the river. Swim to the bank and climb out first.');
      return { ok: true, ...handler(p, message) };
    } catch (error) {
      if (error instanceof GameError) return { ok: false, code: error.code, message: error.message, ...(error.at ? { at: error.at } : {}) };
      if (error instanceof LedgerError) {
        const text = error.code === 'NL001' ? 'You do not have enough TR for that.' : `The ledger refused the payment (${error.code}).`;
        return { ok: false, code: error.code, message: text };
      }
      throw error;
    }
  }
  if (!state.answered) state.answered = {};
  const answered = state.answered;

  // --- players --------------------------------------------------------------------

  // `path` is what the player answered when asked, before anything else, whether they would be a hero or a villain.
  // It is kept with the character and shown to them. It changes none of the town's rules.
  function join({ name, look, path }) {
    const clean = String(name || '').replace(/[^\p{L}\p{M} .'-]/gu, '').trim().slice(0, 24);
    if (clean.length < 2) throw new GameError('BAD_NAME', 'Choose a name of at least two letters.');
    state.playerCounter += 1;
    const id = `p-${String(state.playerCounter).padStart(4, '0')}`;
    state.players[id] = {
      id, name: clean, path: path === 'hero' || path === 'villain' ? path : null, look: cleanFigureLook(look) || { skin: look?.skin ?? 0x6b4226, top: look?.top ?? 0xf2c200, bottom: look?.bottom ?? 0x2c3440, build: look?.build ?? 1, body: look?.body === 'f' ? 'f' : 'm', outfit: 'streetwear' },
      zone: ZONE.id, x: ZONE.spawn.x, z: ZONE.spawn.z, heading: ZONE.spawn.heading,
      energy: 80, skills: { blocklaying: false }, wallet: ledger.openAccount('player', id, 'wallet'),
      met: {}, inspected: {}, stats: { blocksMoulded: 0, walked: 0 }, lastMoveAt: state.real, lastWorkAt: -10, joinedAt: clock(), lang: 'en', riding: null,
      health: HEALTH.max, fight: null, law: { state: 'normal', since: 0, crimes: [], seenAt: null }, custody: null, carried: null, astride: null, hijack: null,
      down: null, dead: null, involved: {},
    };
    grantArrival(state.players[id]);
    return id;
  }

  // Everyone arrives with £20 in their pocket: 2,000 TR, issued once to each character, on the ledger like
  // any other money. The key means it can never be paid twice: not on a retried join, not on a reload. A
  // character made before arrival money existed is given it the first time the world is loaded.
  function grantArrival(p) {
    monetary.post({
      key: `arrival:${p.id}`, kind: 'issuance', initiator: 'ops:monetary', reason: `Arrival money for ${p.name}: £20, as ${trText(ARRIVAL_FUNDS)}`,
      legs: [{ account: issuanceAccount, amount: -ARRIVAL_FUNDS }, { account: p.wallet, amount: ARRIVAL_FUNDS }],
    });
  }
  for (const p of Object.values(state.players)) grantArrival(p);

  function journal(p) {
    const owned = registry.ownedBy(p.id);
    const sites = owned.map((id) => state.registry.parcels[id]);
    const history = ledger.history(p.wallet, 2);
    return [
      { id: 'arrive', text: `Arrive in ${ZONE.name}`, done: true },
      { id: 'look', text: `Read the survey board on a plot in the ${ZONE.scheme}`, done: Object.keys(p.inspected).length > 0 || owned.length > 0 },
      { id: 'funds', text: 'Earn your first TR: mould blocks at the yard, or add sandbox funds from your phone', done: history.length > 1 },
      { id: 'land', text: 'Buy a plot at the Lands Registry', done: owned.length > 0 },
      { id: 'permit', text: 'Get a building permit at the Secretariat', done: sites.some((r) => r.permit) },
      { id: 'materials', text: 'Have materials delivered from the yard and the store', done: sites.some((r) => r.site && (r.site.started || r.site.stage > 0)) || owned.some((id) => Object.values(state.economy.stock[`site:${id}`] || {}).some((q) => q > 0)) },
      { id: 'build', text: 'Build: work the site yourself or hire the mason', done: sites.some((r) => r.site && r.site.stage > 0) },
      { id: 'home', text: 'Finish the building', done: sites.some((r) => r.site && r.site.complete) },
    ];
  }

  // What anyone standing in the zone can see: the shared, public state.
  function zoneView(viewerId, at = null) {
    const now = clockOf(state.t);
    const eye = viewerId ? state.players[viewerId] : at || ZONE.spawn;
    const calendar = population.dayInfo(now.day - 1);
    const sites = [];
    for (const parcel of ZONE_PARCELS) {
      const row = state.registry.parcels[parcel.id];
      const stock = state.economy.stock[`site:${parcel.id}`] || {};
      if (!row.site && !Object.values(stock).some((q) => q > 0)) continue;
      const design = row.site ? DESIGNS[row.site.design] : null;
      const current = design && design.stages[row.site.stage];
      sites.push({
        parcelId: parcel.id, design: design ? design.id : null, stage: row.site ? row.site.stage : 0,
        progress: current && row.site.started ? row.site.labour / current.labour : 0,
        complete: !!(row.site && row.site.complete), paint: row.site ? row.site.paint : null,
        mason: !!(row.site && row.site.mason), blocks: stock.block || 0, cement: stock.cement || 0, other: (stock.roofing || 0) + (stock.doorset || 0) + (stock.paint || 0),
      });
    }
    const services = {};
    for (const s of ZONE_SERVICES) services[s.id] = serviceState(s.id);
    return {
      t: state.t, clock: now, weather: weather(), zone: ZONE.id,
      residents: ZONE_RESIDENTS.map((r) => { const live = residents.get(r.id); return { id: r.id, x: live.x, z: live.z, heading: live.heading, mode: live.mode, busy: live.override ? 'site' : live.placeKey }; }),
      parcels: ZONE_PARCELS.map((parcel) => { const row = state.registry.parcels[parcel.id]; return { id: parcel.id, status: row.status, yours: !!viewerId && row.owner.kind === 'player' && row.owner.id === viewerId }; }),
      sites, services, yardBlocks: state.economy.stock.yard.block || 0,
      vehicles: vehicles.zoneList(viewerId),
      calendar: { weekday: calendar.name, school: calendar.school },
      people: population.around(viewerId || 'spectator', eye.x, eye.z, state.t, state.real),
      okadas: okada.list(eye.x, eye.z, viewerId),
      // trouble within sight: blows struck, people shaken by them, officers out on a call, the ambulance
      fights: conflict.eventsNear(eye.x, eye.z), impacts: impact.eventsNear(eye.x, eye.z), fallen: impact.fallen(), blood: impact.bleeding(eye.x, eye.z), reacts: reactions.near(eye.x, eye.z), moods: conflict.moods(eye.x, eye.z), officers: justice.officersNear(eye.x, eye.z), ambulance: care.ambulanceView(),
      population: population.total,
    };
  }

  // What one player is allowed to know right now: the zone, plus their own affairs.
  function view(playerId) {
    const p = player(playerId);
    const riding = p.riding !== null && p.riding !== undefined ? okada.riders[p.riding] : null;
    return {
      ...zoneView(playerId),
      ...talk.view(p),
      self: { id: p.id, name: p.name, path: p.path || null, look: p.look, x: p.x, z: p.z, heading: p.heading, energy: p.energy, balance: ledger.balance(p.wallet), skills: { ...p.skills }, owned: registry.ownedBy(p.id), home: ownStructureNearby(p), lang: p.lang || 'en', said: p.lastSaid || null, riding: riding ? { n: riding.n, rider: population.people[riding.i].name, to: riding.passenger ? riding.passenger.name : '' } : null, ...vehicles.selfView(p),
        ...conflict.selfView(p), ...impact.selfView(p), law: justice.selfView(p), ...care.selfView(p), phone: phone.selfView(p), hijack: hijack.view(p), astride: p.astride !== null && p.astride !== undefined ? { n: p.astride } : null, swimming: p.swimming ? { since: p.swimming.since, nearBank: -zoneToWater(p.x, p.z) <= SWIM.outReach } : null, byWater: !p.swimming && zoneToWater(p.x, p.z) <= SWIM.reach },
      // how the other players in sight stand: fighting, badly hurt, held; and, to a constable only, wanted
      others: Object.fromEntries(Object.keys(state.players).filter((id) => id !== p.id && Math.hypot(state.players[id].x - p.x, state.players[id].z - p.z) <= RANGE.middle).map((id) => { const q = state.players[id]; const law = justice.lawOf(q).state; return [id, { fighting: !!q.fight, blocking: !!(q.fight && q.fight.blocking && state.real >= q.fight.busyUntil), critical: conflict.critical(q), swimming: !!q.swimming, emote: q.emote && state.real - q.emote.at < 40 ? { name: q.emote.name, ago: Math.round((state.real - q.emote.at) * 10) / 10 } : null, ...impact.stanceOf(q), health: impact.maySee(p, q) ? q.health : null, held: !!q.custody, wanted: justice.roleOf(p) ? law === 'wanted' || law === 'pursuit' : false }]; })),
      journal: journal(p),
    };
  }

  return {
    state, intent, join, view, spectate: (at) => zoneView(null, at), step, advance, clockOf: () => clockOf(state.t), weather, structureBoxes,
    drain: (playerId) => { const q = queues[playerId] || []; queues[playerId] = []; return q; },
    hasPlayer: (id) => !!state.players[id],
    audit: () => ({ goods: economy.auditGoods(INITIAL_GOODS), missedPayments: state.economy.missed, vehicles: vehicles.audit(), okada: okada.audit(), justice: justice.audit(), care: care.audit() }),
    // people playing in another copy of this world, as the network reports them
    visitors: { seen: (peerId, data) => talk.visitorSeen(peerId, data), gone: (peerId) => talk.visitorGone(peerId), list: () => talk.visitors() },
    stats: () => ({ ...population.stats, people: population.total, simulated: population.count, riders: okada.riders.length }),
    // what anyone can see of a person: their name and how they look
    faces: (ids) => ids.filter((i) => Number.isInteger(i) && i >= 0 && i < population.count).slice(0, 400).map((i) => { const who = population.people[i]; return { index: i, id: who.id, name: who.name, short: who.short, look: who.look, fig: who.fig }; }),
    // not an intent: the market service's side of a sale (see market.js)
    market,
    internals: { registry, economy, residents, vehicles, population, okada, talk, actors, conflict, justice, care, phone, hijack, impact },
  };
}

export const GAME_REFERENCE = Object.freeze({ GOODS, DESIGNS, PAINT_COLOURS, ENERGY, HEALTH, MOVES, COMBAT, LAW, CARE, HIJACK, IMPACT, BODY });
