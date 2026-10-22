// Vehicles and the work they make possible.
//
// A vehicle is an entity the simulation owns: where it is, who holds it, how
// much fuel is in the tank and what it carries. A driver's client predicts
// its own movement and sends each step as an intent; the simulation checks
// speed, ground, obstacles and fuel before it accepts the step, exactly as
// it does for walking.
//
// Three things use vehicles here: hire and purchase at the motor park,
// carrying your own goods instead of paying for delivery, and paid delivery
// runs for the town's businesses.

import { ZONE, ZONE_TEXT, ZONE_ROADS, OUTSKIRT_ROADS, ZONE_VEHICLE_BAYS, ZONE_FLEET, ZONE_RUNS, zoneWalkable, zoneShoreZ, zoneParcel, zoneService, zoneResident, habitationFootOnly, footOnlySaid } from './zone.js';
import { GameError } from './registry.js';
import { LedgerError } from './ledger.js';
import { KEKE_PAINTS, VEHICLE_MODELS, kekeLook, footprintBox } from './vehicle-looks.js';

export const VEHICLE_KINDS = Object.freeze({
  keke: Object.freeze({
    id: 'keke', name: 'Keke', wheels: 3, price: 45000, registration: 2500, hirePerDay: 600, importShare: 0.8,
    tank: 8, metresPerLitre: 350, speedRoad: 9, speedRough: 5, reverse: 3, radius: 1.15, capacity: 60,
  }),
});
export const FUEL = Object.freeze({ price: 70, importShare: 0.85 });
// How much room each good takes in a keke, in load units.
export const LOAD_UNITS = Object.freeze({ block: 2, cement: 5, roofing: 40, doorset: 30, paint: 3 });
export const RUN_RULES = Object.freeze({ openMinutes: 90, carryMinutes: 180, reach: 7 });

// "Bales of cloth" in the middle of a sentence, without touching proper names.
export const lowerFirst = (text) => text.charAt(0).toLowerCase() + text.slice(1);

const onRoad = (x, z) => ZONE_ROADS.some((r) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) || OUTSKIRT_ROADS.some((r) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1);

// The top speed of a vehicle at a point, in metres a second.
export function vehicleSpeedAt(kind, x, z, wet) {
  const k = VEHICLE_KINDS[kind];
  return (onRoad(x, z) ? k.speedRoad : k.speedRough) * (wet ? 0.8 : 1);
}

// True when a vehicle of this kind can stand at (x, z): firm ground, clear
// of buildings and trees, clear of other vehicles. `boxes` are structures
// players have built; `others` are the positions of other vehicles.
export function vehicleFits(kind, x, z, boxes = [], others = []) {
  const radius = VEHICLE_KINDS[kind].radius;
  if (!zoneWalkable(x, z, boxes, radius)) return false;
  if (z > zoneShoreZ(x) - 2.5) return false;                    // not onto the bank or the jetty
  for (const o of others) if (Math.hypot(o.x - x, o.z - z) < radius * 2) return false;
  return true;
}

// The box a parked vehicle presents to someone on foot: its footprint, turned to its heading.
export function vehicleBox(v) {
  return footprintBox(v.kind, v.x, v.z, v.heading);
}

// How the dealer's own kekes are turned out: his name on the back, a fleet
// number on the side. The first is the keke exactly as it was designed.
function fleetLook(n) {
  const base = kekeLook(n + 40);
  const paints = ['yellow', 'green', 'blue', 'red', 'orange'];
  const trim = VEHICLE_MODELS.keke.trims[(n - 1) % 3];
  return { ...base, trim, paint: paints[(n - 1) % paints.length], canopy: 'black', seat: 'black', floor: trim === 'classic' ? 'green' : 'dark', wear: Math.min(0.4, base.wear), dirt: Math.min(0.35, base.dirt), slogan: `${ZONE_FLEET.name || 'KEKE HIRE'}`.toUpperCase(), number: String(n).padStart(2, '0'), extras: n % 2 ? [] : ['curtains'] };
}
// A keke bought new, in the colour and with the front the buyer chose.
function newLook(choice = {}) {
  const paint = KEKE_PAINTS.some((p) => p.id === choice.paint) ? choice.paint : 'yellow';
  const trim = VEHICLE_MODELS.keke.trims.includes(choice.trim) ? choice.trim : 'modern';
  return { model: 'keke', trim, paint, canopy: 'black', seat: 'black', floor: trim === 'classic' ? 'green' : 'dark', wear: 0.02, dirt: 0, slogan: null, number: null, extras: [] };
}

export function createVehicles({ state, ledger, issuanceAccount, economy, clock, weather, emit, structureBoxes, hub = {} }) {
  if (!state.vehicles) {
    state.vehicles = { counter: 0, list: {}, runs: [], runCounter: 0, imported: 0, litresSold: 0 };
    const dealer = zoneResident(ZONE_FLEET.dealer);
    for (let i = 0; i < ZONE_FLEET.hireCount; i += 1) create('keke', { kind: 'resident', id: dealer.id, name: dealer.name }, i, VEHICLE_KINDS.keke.tank / 2);
  }
  // a world saved before vehicles had looks: the dealer's are turned out his way, a player's keeps the supplied yellow
  for (const v of Object.values(state.vehicles.list)) if (!v.look) v.look = v.owner.kind === 'player' ? newLook() : fleetLook(Number(v.id.slice(2)) || 1);
  const book = state.vehicles;
  const accounts = economy.accounts;
  const dealerWallet = () => accounts.resident(ZONE_FLEET.dealer);

  function create(kind, owner, bayIndex, fuel, look = null) {
    const s = state.vehicles;
    s.counter += 1;
    const bay = ZONE_VEHICLE_BAYS[bayIndex];
    const id = `V-${String(s.counter).padStart(4, '0')}`;
    s.list[id] = { id, kind, plate: ZONE_TEXT.plate(s.counter), owner, hire: null, bay: bayIndex, x: bay.x, z: bay.z, heading: bay.heading, fuel, odometer: 0, driver: null, look: look || fleetLook(s.counter) };
    return s.list[id];
  }

  const all = () => Object.values(book.list);
  const get = (id) => { const v = book.list[id]; if (!v) throw new GameError('NO_VEHICLE', 'There is no such vehicle.'); return v; };
  const cargoOf = (v) => economy.stockOf(`vehicle:${v.id}`);
  const loadOf = (v) => Object.entries(cargoOf(v)).reduce((sum, [item, qty]) => sum + qty * (LOAD_UNITS[item] || 1), 0);
  const hireLive = (v) => !!v.hire && v.hire.until > clock();

  // May this player drive the vehicle now?
  function mayDrive(v, playerId) {
    if (v.taken && v.taken.by === playerId) return true;        // taken without leave: theirs to drive until the police have it back
    if (v.owner.kind === 'player') return v.owner.id === playerId;
    return hireLive(v) && v.hire.playerId === playerId;
  }
  // A keke nobody is entitled to is locked at night, and always when it is another player's.
  function locked(v) {
    if (v.owner.kind === 'player') return true;
    const hour = (clock() % 86400) / 3600;
    return hour < 7 || hour >= 19;
  }
  // May this one be taken without leave, as far as the vehicle goes?
  function seizable(v, playerId) {
    if (mayDrive(v, playerId)) return { ok: false, code: 'YOURS', reason: 'It is yours to drive already.' };
    if (v.driver) return { ok: false, code: 'OCCUPIED', reason: 'Somebody is driving it.' };
    if (v.taken) return { ok: false, code: 'BUSY', reason: 'Somebody already has it.' };
    if (v.hire && hireLive(v)) return { ok: false, code: 'LOCKED', reason: 'It is locked.' };
    if (locked(v)) return { ok: false, code: 'LOCKED', reason: 'It is locked.' };
    return { ok: true, x: v.x, z: v.z, h: v.heading };
  }
  function take(v, player) { v.taken = { by: player.id, at: clock() }; }
  // The police take the driver out, wherever the keke is.
  function eject(player) {
    const v = book.list[player.driving];
    player.driving = null;
    if (!v) return;
    v.driver = null;
    const side = { x: Math.cos(v.heading), z: -Math.sin(v.heading) };
    const boxes = [...structureBoxes(), ...all().map(vehicleBox)];
    const spot = [[side.x * 1.9, side.z * 1.9], [-side.x * 1.9, -side.z * 1.9], [-Math.sin(v.heading) * 2.4, -Math.cos(v.heading) * 2.4]].map(([dx, dz]) => ({ x: v.x + dx, z: v.z + dz })).find((s) => zoneWalkable(s.x, s.z, boxes));
    if (spot) { player.x = spot.x; player.z = spot.z; }
    player.lastMoveAt = state.real;
  }
  // What was taken goes back to where it belongs.
  function recover(playerId) {
    for (const v of all()) {
      if (!v.taken || v.taken.by !== playerId) continue;
      v.taken = null;
      if (v.driver === playerId) v.driver = null;
      const bay = ZONE_VEHICLE_BAYS[v.bay];
      v.x = bay.x; v.z = bay.z; v.heading = bay.heading;
    }
  }
  // May this player still take their goods out of it?
  const mayUnload = (v, playerId) => (v.owner.kind === 'player' ? v.owner.id === playerId : !!v.hire && v.hire.playerId === playerId);
  const usableBy = (playerId) => all().filter((v) => mayDrive(v, playerId));

  function freeBay() {
    for (let i = 0; i < ZONE_VEHICLE_BAYS.length; i += 1) {
      const bay = ZONE_VEHICLE_BAYS[i];
      if (!all().some((v) => Math.hypot(v.x - bay.x, v.z - bay.z) < 2.6)) return i;
    }
    return -1;
  }

  // --- the dealer -------------------------------------------------------------

  function options(player) {
    const k = VEHICLE_KINDS.keke;
    const forHire = all().filter((v) => v.owner.kind !== 'player' && !v.hire).length;
    return {
      dealer: zoneResident(ZONE_FLEET.dealer).name, madeIn: ZONE_FLEET.madeIn,
      kind: { id: k.id, name: k.name, price: k.price, registration: k.registration, total: k.price + k.registration, hirePerDay: k.hirePerDay, tank: k.tank, capacity: k.capacity },
      fuelPrice: FUEL.price, forHire,
      paints: KEKE_PAINTS.map((c) => ({ id: c.id, name: c.name, colour: c.paint })), trims: VEHICLE_MODELS.keke.trims.slice(),
      mine: all().filter((v) => mayUnload(v, player.id)).map((v) => summary(v, player.id)),
    };
  }

  function summary(v, playerId) {
    const k = VEHICLE_KINDS[v.kind];
    return {
      id: v.id, kind: v.kind, name: k.name, plate: v.plate, owned: v.owner.kind === 'player' && v.owner.id === playerId, ownerName: v.owner.name,
      hiredUntil: v.hire && v.hire.playerId === playerId ? v.hire.until : null, usable: mayDrive(v, playerId),
      fuel: Number(v.fuel.toFixed(2)), tank: k.tank, cargo: { ...cargoOf(v) }, load: loadOf(v), capacity: k.capacity, x: v.x, z: v.z, look: v.look,
    };
  }

  function hire(player) {
    if (all().some((v) => v.hire && v.hire.playerId === player.id)) throw new GameError('ALREADY_HIRED', 'You already have a keke on hire. Bring it back before you take another.');
    const v = all().find((c) => c.owner.kind !== 'player' && !c.hire && !c.driver);
    if (!v) throw new GameError('NONE_FREE', 'Every keke is out on hire. Try again tomorrow morning.');
    const k = VEHICLE_KINDS[v.kind];
    const now = clock();
    const until = (Math.floor(now / 86400) + 1) * 86400 + 6 * 3600;
    const result = ledger.post({
      key: `hire:${v.id}:${player.id}:${now}`, kind: 'goods_purchase', initiator: 'svc:vehicles', reason: `Keke hire for the day, ${v.plate}`,
      legs: [{ account: player.wallet, amount: -k.hirePerDay }, { account: dealerWallet(), amount: k.hirePerDay }], meta: { vehicle: v.id, until },
    });
    v.hire = { playerId: player.id, until, txn: result.id };
    return { txn: result.id, fee: k.hirePerDay, vehicle: summary(v, player.id), until };
  }

  function buy(player, choice = {}) {
    const k = VEHICLE_KINDS.keke;
    if (all().filter((v) => v.owner.kind === 'player' && v.owner.id === player.id).length >= 2) throw new GameError('FLEET_LIMIT', 'Two kekes to one owner is the limit for now.');
    const bay = freeBay();
    if (bay < 0) throw new GameError('NO_ROOM', 'There is no room at the park to hand one over. Move a keke out of the bays first.');
    // The price goes to the dealer and the registration fee to the State, in one transaction.
    const result = ledger.post({
      key: `vehicle:${book.counter + 1}:${player.id}`, kind: 'goods_purchase', initiator: 'svc:vehicles', reason: `${k.name} bought new, with registration`,
      legs: [{ account: player.wallet, amount: -(k.price + k.registration) }, { account: dealerWallet(), amount: k.price }, { account: accounts.government(ZONE.government.state.code), amount: k.registration }],
      meta: { price: k.price, registration: k.registration },
    });
    const v = create('keke', { kind: 'player', id: player.id, name: player.name }, bay, k.tank / 2, newLook(choice));
    // The dealer pays the maker, which is outside this world: that money is retired.
    ledger.post({ key: `vehicle-import:${v.id}`, kind: 'retirement', initiator: 'svc:vehicles', reason: `${k.name} ${v.plate} brought in from ${ZONE_FLEET.madeIn}`, legs: [{ account: dealerWallet(), amount: -Math.round(k.price * k.importShare) }, { account: issuanceAccount, amount: Math.round(k.price * k.importShare) }] });
    book.imported += 1;
    return { txn: result.id, total: k.price + k.registration, vehicle: summary(v, player.id) };
  }

  function refuel(player, vehicleId, litres) {
    const v = get(vehicleId);
    if (!mayDrive(v, player.id)) throw new GameError('NOT_YOURS', 'That keke is not yours to fuel.');
    const pump = zoneService('park');
    if (Math.hypot(v.x - pump.x, v.z - pump.z) > 22) throw new GameError('TOO_FAR', 'Bring the keke to the motor park to fuel it.');
    const k = VEHICLE_KINDS[v.kind];
    const room = Math.floor((k.tank - v.fuel) * 10) / 10;
    const want = Math.min(room, Math.max(0, Number(litres) || 0));
    if (want < 0.1) throw new GameError('TANK_FULL', 'The tank is full.');
    const cost = Math.ceil(want * FUEL.price);
    book.fuelCounter = (book.fuelCounter || 0) + 1;
    const result = ledger.post({ key: `fuel:${v.id}:${book.fuelCounter}`, kind: 'goods_purchase', initiator: 'svc:vehicles', reason: `${want.toFixed(1)} litres of petrol, ${v.plate}`, legs: [{ account: player.wallet, amount: -cost }, { account: dealerWallet(), amount: cost }], meta: { vehicle: v.id, litres: want } });
    ledger.post({ key: `fuel-import:${v.id}:${book.fuelCounter}`, kind: 'retirement', initiator: 'svc:vehicles', reason: 'Petrol bought in', legs: [{ account: dealerWallet(), amount: -Math.round(cost * FUEL.importShare) }, { account: issuanceAccount, amount: Math.round(cost * FUEL.importShare) }] });
    v.fuel = Math.min(k.tank, v.fuel + want);
    book.litresSold += want;
    return { txn: result.id, litres: want, cost, fuel: v.fuel };
  }

  // --- driving ----------------------------------------------------------------

  const othersOf = (v) => all().filter((o) => o.id !== v.id).map((o) => ({ x: o.x, z: o.z }));

  function enter(player, vehicleId) {
    if (player.driving) throw new GameError('DRIVING', 'You are already driving.');
    const v = get(vehicleId);
    if (Math.hypot(player.x - v.x, player.z - v.z) > 3.6) throw new GameError('TOO_FAR', 'You are too far away. Walk closer.');
    if (v.driver) throw new GameError('OCCUPIED', 'Somebody is already driving it.');
    if (!mayDrive(v, player.id)) {
      if (v.hire && v.hire.playerId === player.id) throw new GameError('HIRE_OVER', 'Your hire ended at six this morning. Hire it again at the motor park.');
      throw new GameError('NOT_YOURS', `This keke belongs to ${v.owner.name}.`);
    }
    v.driver = player.id;
    player.driving = v.id;
    player.x = v.x; player.z = v.z; player.heading = v.heading; player.lastMoveAt = state.real;
    return { vehicle: summary(v, player.id) };
  }

  function exit(player) {
    const v = get(player.driving);
    const boxes = [...structureBoxes(), ...all().map(vehicleBox)];
    const side = { x: Math.cos(v.heading), z: -Math.sin(v.heading) };       // the driver's left
    const back = { x: -Math.sin(v.heading), z: -Math.cos(v.heading) };
    const spots = [[side.x * 1.9, side.z * 1.9], [-side.x * 1.9, -side.z * 1.9], [back.x * 2.4, back.z * 2.4], [-back.x * 2.4, -back.z * 2.4]];
    const spot = spots.map(([dx, dz]) => ({ x: v.x + dx, z: v.z + dz })).find((s) => zoneWalkable(s.x, s.z, boxes));
    if (!spot) throw new GameError('NO_ROOM', 'There is no room to step out here. Move the keke a little.');
    v.driver = null;
    if (v.taken) v.taken.leftAt = clock();
    player.driving = null;
    player.x = spot.x; player.z = spot.z; player.lastMoveAt = state.real;
    return { x: spot.x, z: spot.z };
  }

  function drive(player, { x, z, heading }) {
    if (![x, z, heading].every(Number.isFinite)) throw new GameError('BAD_MOVE', 'Invalid position.');
    const v = get(player.driving);
    if (!mayDrive(v, player.id)) throw new GameError('HIRE_OVER', 'The hire has ended. Step out, and hire it again at the motor park.');
    const k = VEHICLE_KINDS[v.kind];
    const gap = Math.hypot(x - v.x, z - v.z);
    if (gap > 0 && v.fuel <= 0) throw new GameError('NO_FUEL', 'The tank is empty. Petrol is sold at the motor park.');
    const elapsed = Math.min(1.0, state.real - player.lastMoveAt);
    const top = Math.max(vehicleSpeedAt(v.kind, v.x, v.z, weather().wet), vehicleSpeedAt(v.kind, x, z, weather().wet));
    if (gap > top * (elapsed + 0.12) * 1.15) throw new GameError('TOO_FAST', 'Movement rejected.');
    // a keke that has just struck someone is stopped by it for a moment
    if (gap > 0.02 && hub.impact && hub.impact.stalled(v)) throw new GameError('STALLED', 'The keke has stopped: you hit someone.');
    const boxes = structureBoxes();
    const others = othersOf(v);
    const steps = Math.max(1, Math.ceil(gap / 0.4));
    for (let i = 1; i <= steps; i += 1) {
      if (!vehicleFits(v.kind, v.x + ((x - v.x) * i) / steps, v.z + ((z - v.z) * i) / steps, boxes, others)) throw new GameError('BLOCKED', 'Movement rejected.');
    }
    // a bridge, a boardwalk, a jetty: walked, never driven onto
    { const f = habitationFootOnly(x, z); if (f) throw new GameError('FOOT_ONLY', footOnlySaid(f)); }
    const fromX = v.x, fromZ = v.z;
    v.x = x; v.z = z; v.heading = heading;
    v.fuel = Math.max(0, v.fuel - gap / k.metresPerLitre);
    v.odometer += gap;
    player.x = x; player.z = z; player.heading = heading; player.lastMoveAt = state.real;
    player.stats.driven = (player.stats.driven || 0) + gap;
    // what the step ran into, if anything: worked out here, never reported by the driver
    const hit = hub.impact ? hub.impact.step(player, { kind: 'keke', id: v.id }, v, fromX, fromZ, x, z, heading, elapsed) : [];
    return hit.length ? { fuel: v.fuel, hit } : { fuel: v.fuel };
  }

  // --- carrying goods -----------------------------------------------------------

  // Vehicles of this player that are standing close enough to a point to be loaded there.
  function carriersNear(player, x, z, range = 14) {
    return usableBy(player.id).filter((v) => Math.hypot(v.x - x, v.z - z) <= range).map((v) => ({ id: v.id, plate: v.plate, capacity: VEHICLE_KINDS[v.kind].capacity, free: VEHICLE_KINDS[v.kind].capacity - loadOf(v) }));
  }

  function checkRoom(player, vehicleId, x, z, item, qty) {
    const v = get(vehicleId);
    if (!mayDrive(v, player.id)) throw new GameError('NOT_YOURS', 'That keke is not yours to load.');
    if (Math.hypot(v.x - x, v.z - z) > 14) throw new GameError('TOO_FAR', 'Bring the keke up to the shop to load it.');
    const need = qty * (LOAD_UNITS[item] || 1);
    const free = VEHICLE_KINDS[v.kind].capacity - loadOf(v);
    if (need > free) throw new GameError('TOO_HEAVY', `That is more than the keke can take. There is room for ${Math.floor(free / (LOAD_UNITS[item] || 1))} more.`);
    return v;
  }

  function unload(player, vehicleId, parcelId, row) {
    const v = get(vehicleId);
    if (!mayUnload(v, player.id)) throw new GameError('NOT_YOURS', 'That keke is not yours to unload.');
    if (!row || row.owner.kind !== 'player' || row.owner.id !== player.id) throw new GameError('NOT_OWNER', 'You can unload at a plot you own.');
    const p = zoneParcel(parcelId);
    const dx = Math.max(p.x0 - v.x, 0, v.x - p.x1);
    const dz = Math.max(p.z0 - v.z, 0, v.z - p.z1);
    if (Math.hypot(dx, dz) > 9) throw new GameError('TOO_FAR', `Bring the keke up to Plot ${p.plot} to unload.`);
    if (Math.hypot(player.x - v.x, player.z - v.z) > 6) throw new GameError('TOO_FAR', 'Stand by the keke to unload it.');
    const moved = Object.entries(cargoOf(v)).filter(([, qty]) => qty > 0);
    if (!moved.length) throw new GameError('EMPTY', 'The keke is empty.');
    for (const [item, qty] of moved) economy.moveGoods(`vehicle:${v.id}`, `site:${parcelId}`, item, qty);
    return { moved: Object.fromEntries(moved), plot: p.plot };
  }

  // --- delivery runs ----------------------------------------------------------------

  function payerAccount(code) {
    const [kind, id] = code.split(':');
    if (kind === 'business') return accounts.business(id);
    if (kind === 'government') return accounts.government(ZONE.government[id].code);
    return accounts.resident(id);
  }

  const template = (run) => ZONE_RUNS.find((t) => t.id === run.template);
  const activeRunOf = (playerId) => book.runs.find((r) => r.by === playerId && (r.state === 'accepted' || r.state === 'loaded')) || null;

  function runView(run) {
    const t = template(run);
    return { id: run.id, what: t.what, from: { ...t.from }, to: { ...t.to }, fee: t.fee, state: run.state, postedAt: run.postedAt, closesAt: run.postedAt + RUN_RULES.openMinutes * 60 };
  }

  function listRuns(player) {
    return {
      open: book.runs.filter((r) => r.state === 'open').map(runView),
      mine: activeRunOf(player.id) ? runView(activeRunOf(player.id)) : null,
      done: player.stats.runs || 0, hasVehicle: usableBy(player.id).length > 0,
    };
  }

  function acceptRun(player, runId) {
    if (!usableBy(player.id).length) throw new GameError('NO_VEHICLE', 'You need a keke for this. Hire or buy one at the motor park.');
    if (activeRunOf(player.id)) throw new GameError('BUSY', 'Finish the run you have before you take another.');
    const run = book.runs.find((r) => r.id === runId);
    if (!run || run.state !== 'open') throw new GameError('GONE', 'That run has been taken.');
    run.state = 'accepted'; run.by = player.id; run.acceptedAt = clock();
    return { run: runView(run) };
  }

  // The player's vehicle that is standing at a point, if any.
  function vehicleAt(player, point) {
    return usableBy(player.id).find((v) => Math.hypot(v.x - point.x, v.z - point.z) <= RUN_RULES.reach && Math.hypot(player.x - v.x, player.z - v.z) <= 6) || null;
  }

  function loadRun(player) {
    const run = activeRunOf(player.id);
    if (!run || run.state !== 'accepted') throw new GameError('NO_RUN', 'You have nothing to collect.');
    const t = template(run);
    const v = vehicleAt(player, t.from);
    if (!v) throw new GameError('TOO_FAR', `Bring your keke to ${t.from.label} to load.`);
    run.state = 'loaded'; run.vehicle = v.id;
    return { run: runView(run) };
  }

  function deliverRun(player) {
    const run = activeRunOf(player.id);
    if (!run || run.state !== 'loaded') throw new GameError('NO_RUN', 'You have nothing to deliver.');
    const t = template(run);
    const v = get(run.vehicle);
    if (Math.hypot(v.x - t.to.x, v.z - t.to.z) > RUN_RULES.reach || Math.hypot(player.x - v.x, player.z - v.z) > 6) throw new GameError('TOO_FAR', `Bring the load to ${t.to.label}.`);
    let result;
    try {
      result = ledger.post({ key: `run:${run.id}`, kind: 'wage', initiator: 'svc:vehicles', reason: `Delivery: ${lowerFirst(t.what)} to ${t.to.label}`, legs: [{ account: payerAccount(t.payer), amount: -t.fee }, { account: player.wallet, amount: t.fee }], meta: { run: run.id } });
    } catch (error) {
      if (error instanceof LedgerError && error.code === 'NL001') throw new GameError('CANNOT_PAY', 'They cannot pay you just now. Try again a little later.');
      throw error;
    }
    run.state = 'delivered'; run.doneAt = clock();
    player.stats.runs = (player.stats.runs || 0) + 1;
    return { txn: result.id, fee: t.fee, what: t.what, to: t.to.label, runs: player.stats.runs };
  }

  function dropRun(player) {
    const run = activeRunOf(player.id);
    if (!run) throw new GameError('NO_RUN', 'You have no run to give up.');
    handOver(run);
    return {};
  }

  // A run nobody took, or one that was given up, is done by the dealer himself.
  function handOver(run) {
    const t = template(run);
    economy.tryPay('wage', payerAccount(t.payer), dealerWallet(), t.fee, `Delivery: ${lowerFirst(t.what)} to ${t.to.label}`);
    run.state = 'npc'; run.doneAt = clock();
  }

  // --- time ---------------------------------------------------------------------------

  function tick() {
    const now = clock();
    const day = Math.floor(now / 86400);
    const hour = (now - day * 86400) / 3600;
    for (const t of ZONE_RUNS) {
      if (hour < t.hour || book.runs.some((r) => r.template === t.id && r.day === day)) continue;
      book.runCounter += 1;
      book.runs.push({ id: `R-${String(book.runCounter).padStart(5, '0')}`, template: t.id, day, postedAt: now, state: 'open', by: null });
    }
    for (const run of book.runs) {
      if (run.state === 'open' && now - run.postedAt > RUN_RULES.openMinutes * 60) handOver(run);
      if ((run.state === 'accepted' || run.state === 'loaded') && now - run.acceptedAt > RUN_RULES.carryMinutes * 60) {
        emit(run.by, { type: 'note', text: `You took too long over the run to ${template(run).to.label}. It has gone to another rider.` });
        handOver(run);
      }
    }
    if (book.runs.length > 60) book.runs = book.runs.filter((r) => r.day >= day - 1 || r.state === 'accepted' || r.state === 'loaded');
    // A keke taken without leave and then left standing is fetched back by its owner after a while.
    for (const v of all()) if (v.taken && !v.driver && v.taken.leftAt !== undefined && now - v.taken.leftAt > 900) { const bay = ZONE_VEHICLE_BAYS[v.bay]; v.taken = null; v.x = bay.x; v.z = bay.z; v.heading = bay.heading; }
    // A hired keke goes back to its bay once the hire is over, it is empty and nobody is in it.
    for (const v of all()) {
      if (!v.hire || hireLive(v) || v.driver || loadOf(v) > 0) continue;
      const hirer = v.hire.playerId;
      const bay = ZONE_VEHICLE_BAYS[v.bay];
      const away = Math.hypot(v.x - bay.x, v.z - bay.z) > 3;
      v.hire = null;
      if (away) { v.x = bay.x; v.z = bay.z; v.heading = bay.heading; }
      emit(hirer, { type: 'note', text: `The day's hire of keke ${v.plate} is over${away ? `. ${zoneResident(ZONE_FLEET.dealer).short} has taken it back to the park` : ''}.` });
    }
  }

  function zoneList(viewerId) {
    return all().map((v) => ({ id: v.id, kind: v.kind, plate: v.plate, x: v.x, z: v.z, heading: v.heading, driver: !!v.driver, yours: !!viewerId && mayDrive(v, viewerId), ownerName: v.owner.name, loaded: loadOf(v) > 0, look: v.look, locked: !!viewerId && !mayDrive(v, viewerId) && !seizable(v, viewerId).ok, taken: !!v.taken }));
  }

  function selfView(player) {
    const run = activeRunOf(player.id);
    const v = player.driving ? book.list[player.driving] : null;
    return {
      driving: v ? summary(v, player.id) : null,
      vehicles: all().filter((c) => mayUnload(c, player.id)).map((c) => c.id),
      // the kekes this player may drive, standing where they were left (other players are told of them: link.js)
      parkedKekes: all().filter((c) => !c.driver && (c.owner.kind === 'player' ? c.owner.id === player.id : mayDrive(c, player.id))).map((c) => ({ id: c.id, x: c.x, z: c.z, heading: c.heading, plate: c.plate, look: c.look, fleet: c.owner.kind !== 'player' })),
      run: run ? runView(run) : null,
      openRuns: book.runs.filter((r) => r.state === 'open').length,
    };
  }

  const audit = () => ({ count: all().length, expected: ZONE_FLEET.hireCount + book.imported });

  return {
    options, hire, buy, refuel, enter, exit, drive, carriersNear, checkRoom, unload, summary, get, all, seizable, take, eject, recover, mayDrive,
    listRuns, acceptRun, loadRun, deliverRun, dropRun, tick, zoneList, selfView, audit,
    boxes: () => all().filter((v) => !v.driver).map(vehicleBox),
  };
}
