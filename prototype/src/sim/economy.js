// Economy: goods, businesses, work, and building.
//
// Every payment goes through the gameplay ledger handle. Goods move between
// named holders and are only created by production or import and only
// destroyed by use, so stock can be audited the same way money is.
//
// A business is one generic facility: inputs, labour and time produce goods
// or a service. The block yard, the store, the kitchen, the clinic and the
// school below are five configurations of it.

import { ZONE, ZONE_TEXT, ZONE_MOULD_STATIONS, ZONE_RESIDENTS, zoneParcel, zoneSiteLayout, zoneService, zoneResident } from './zone.js';
import { nearestNode } from './graph.js';
import { GameError } from './registry.js';
import { LedgerError } from './ledger.js';

export const GOODS = Object.freeze({
  block: { name: '9-inch sandcrete block', one: 'block', many: 'blocks' },
  cement: { name: 'Cement, 50 kg bag', one: 'bag of cement', many: 'bags of cement' },
  roofing: { name: 'Roofing sheets and timber', one: 'roofing bundle', many: 'roofing bundles' },
  doorset: { name: 'Door and window set', one: 'door and window set', many: 'door and window sets' },
  paint: { name: 'Emulsion paint, 20 litres', one: 'tin of paint', many: 'tins of paint' },
  meal: { name: ZONE.dish, one: 'plate', many: 'plates' },
});

export function countOf(item, qty) {
  return `${qty} ${qty === 1 ? GOODS[item].one : GOODS[item].many}`;
}

// What each business does is a rule; what it is called and who runs it comes from the zone.
const business = (id, rules) => Object.freeze({ id, name: zoneService(id).name, owner: zoneService(id).staff, ...rules });
export const BUSINESSES = Object.freeze({
  yard: business('yard', { sells: { block: 55 }, wagePerBlock: 25, blocksPerBag: 35, delivery: 300 }),
  store: business('store', { sells: { cement: 600, roofing: 4500, doorset: 3800, paint: 1200 }, importShare: 0.7, delivery: 300 }),
  kitchen: business('kitchen', { sells: { meal: 250 } }),
  clinic: business('clinic', { fee: 500 }),
  school: business('school', { fee: 800, courseHours: 2 }),
});
const MASON = zoneResident('mason');
const GOV_STATE = ZONE.government.state.code;
const GOV_LOCAL = ZONE.government.local.code;

const stage = (id, name, needs, labour, dry) => Object.freeze({ id, name, needs: Object.freeze(needs), labour, dry });
export const DESIGNS = Object.freeze({
  house: Object.freeze({
    id: 'house', name: 'One-room house', zoning: 'R1', w: 6, d: 5, wallHeight: 2.8, permitFee: 1500,
    stages: Object.freeze([
      stage('foundation', 'Foundation', { block: 30, cement: 4 }, 6, false),
      stage('walls', 'Walls', { block: 90, cement: 5 }, 10, true),
      stage('roof', 'Roof', { roofing: 1 }, 6, true),
      stage('fittings', 'Doors and windows', { doorset: 1 }, 3, false),
      stage('finish', 'Plaster and paint', { cement: 3, paint: 1 }, 5, true),
    ]),
  }),
  kiosk: Object.freeze({
    id: 'kiosk', name: 'Shop kiosk', zoning: 'C1', w: 4, d: 3, wallHeight: 2.5, permitFee: 1000,
    stages: Object.freeze([
      stage('foundation', 'Foundation', { block: 12, cement: 2 }, 3, false),
      stage('walls', 'Walls', { block: 40, cement: 2 }, 5, true),
      stage('roof', 'Roof', { roofing: 1 }, 3, true),
      stage('fittings', 'Doors and windows', { doorset: 1 }, 2, false),
      stage('finish', 'Plaster and paint', { cement: 1, paint: 1 }, 2, true),
    ]),
  }),
});

export const PAINT_COLOURS = Object.freeze({ cream: 0xe9dcc0, river: 0x8fc1b5, clay: 0xc97b5a, sky: 0xa9c4dd, leaf: 0x9db58a, sun: 0xe8c45c });

export const ENERGY = Object.freeze({ max: 100, mould: 2, build: 3, meal: 45, restPerHour: 18 });
export const MASON_RATE = 120;            // hundredths of a cowrie per unit of labour, paid in advance per stage
export const MASON_SECONDS_PER_UNIT = 5;  // real seconds
const WORK_INTERVAL = 1.1;                // minimum real seconds between two work actions by one person
const OPENING_CAPITAL = { 'business:yard': 60000, 'business:store': 80000, 'business:kitchen': 15000, 'business:clinic': 10000, 'business:school': 10000, [`government:${GOV_LOCAL}`]: 150000, [`government:${GOV_STATE}`]: 50000 };
const RESIDENT_CAPITAL = 4000;

export function createEconomy({ state, ledger, monetary, issuanceAccount, registry, residents, clock, weather, emit }) {
  const accounts = {
    business: (id) => ledger.openAccount('business', id, 'operating'),
    government: (code) => ledger.openAccount('government', code, 'treasury'),
    resident: (id) => ledger.openAccount('player', `npc:${id}`, 'wallet'),
  };

  if (!state.economy) {
    state.economy = {
      stock: { yard: { block: 240, cement: 8 }, store: { cement: 60, roofing: 6, doorset: 6, paint: 8 } },
      made: {}, imported: {}, used: {}, deliveries: [], payCounter: 0, missed: 0, lastHour: -1, mouldTimer: 0,
    };
    const grant = (account, amount, who) => monetary.post({
      key: `opening:${who}`, kind: 'issuance', initiator: 'ops:monetary', reason: `Opening capital for ${who}`,
      legs: [{ account: issuanceAccount, amount: -amount }, { account, amount }],
    });
    for (const [who, amount] of Object.entries(OPENING_CAPITAL)) {
      const [kind, id] = who.split(':');
      grant(kind === 'business' ? accounts.business(id) : accounts.government(id), amount, who);
    }
    for (const r of ZONE_RESIDENTS) grant(accounts.resident(r.id), RESIDENT_CAPITAL, `resident:${r.id}`);
  }
  const eco = state.economy;

  // --- goods ----------------------------------------------------------------

  const stockOf = (holder) => (eco.stock[holder] || (eco.stock[holder] = {}));
  const have = (holder, item) => stockOf(holder)[item] || 0;
  function moveGoods(from, to, item, qty) {
    if (have(from, item) < qty) throw new GameError('OUT_OF_STOCK', `Only ${countOf(item, have(from, item))} in stock.`);
    stockOf(from)[item] -= qty;
    stockOf(to)[item] = have(to, item) + qty;
  }
  const bump = (table, item, qty) => { table[item] = (table[item] || 0) + qty; };

  // --- payments -------------------------------------------------------------

  function pay(kind, from, to, amount, reason, meta, key) {
    eco.payCounter += 1;
    return ledger.post({ key: key || `sim:${eco.payCounter}:${kind}`, kind, initiator: 'svc:economy', reason, legs: [{ account: from, amount: -amount }, { account: to, amount }], meta });
  }

  // A payment a resident or business makes on its own. If it cannot afford it, it goes without.
  function tryPay(kind, from, to, amount, reason) {
    try { pay(kind, from, to, amount, reason); return true; } catch (error) {
      if (error instanceof LedgerError && error.code === 'NL001') { eco.missed += 1; return false; }
      throw error;
    }
  }

  // --- shops ----------------------------------------------------------------

  function catalogue(businessId) {
    const b = BUSINESSES[businessId];
    return Object.entries(b.sells || {}).map(([item, price]) => ({ item, name: GOODS[item].name, unit: GOODS[item].one, price, stock: item === 'meal' ? null : have(businessId, item) }));
  }

  // `carrier` is a vehicle the buyer loads the goods into, instead of having them delivered.
  function buy(player, businessId, item, qty, parcelId, carrier = null) {
    const b = BUSINESSES[businessId];
    const price = b.sells && b.sells[item];
    if (!price) throw new GameError('NOT_SOLD', 'That is not sold here.');
    if (!Number.isInteger(qty) || qty < 1 || qty > 500) throw new GameError('BAD_QUANTITY', 'Choose a quantity between 1 and 500.');
    if (carrier) {
      if (have(businessId, item) < qty) throw new GameError('OUT_OF_STOCK', `Only ${countOf(item, have(businessId, item))} in stock.`);
      const result = pay('goods_purchase', player.wallet, accounts.business(businessId), price * qty,
        `${countOf(item, qty)} from ${b.name}, carried away by the buyer`, { item, qty, unitPrice: price, vehicle: carrier.id });
      moveGoods(businessId, `vehicle:${carrier.id}`, item, qty);
      return { txn: result.id, total: price * qty, item, qty, carried: true, plate: carrier.plate };
    }
    const row = parcelId ? registry.record(parcelId) : null;
    if (!row || row.owner.kind !== 'player' || row.owner.id !== player.id) throw new GameError('NO_DELIVERY_ADDRESS', 'Materials are delivered to a plot you own. Buy a plot first.');
    if (have(businessId, item) < qty) throw new GameError('OUT_OF_STOCK', `Only ${countOf(item, have(businessId, item))} in stock.`);
    const total = price * qty + b.delivery;
    const p = zoneParcel(parcelId);
    const result = pay('goods_purchase', player.wallet, accounts.business(businessId), total,
      `${countOf(item, qty)} from ${b.name}, delivered to Plot ${p.plot}`, { item, qty, unitPrice: price, delivery: b.delivery, parcel: parcelId });
    moveGoods(businessId, `transit:${parcelId}`, item, qty);
    eco.deliveries.push({ parcelId, item, qty, due: clock() + 30 * 60, playerId: player.id });
    return { txn: result.id, total, item, qty, dueMinutes: 30 };
  }

  function eat(player) {
    const b = BUSINESSES.kitchen;
    const result = pay('goods_purchase', player.wallet, accounts.business('kitchen'), b.sells.meal, `One plate at ${b.name}`, { item: 'meal', qty: 1 });
    bump(eco.made, 'meal', 1); bump(eco.used, 'meal', 1);
    player.energy = Math.min(ENERGY.max, player.energy + ENERGY.meal);
    return { txn: result.id, total: b.sells.meal, energy: player.energy };
  }

  function treat(player) {
    const b = BUSINESSES.clinic;
    if (player.energy >= ENERGY.max) throw new GameError('NOT_NEEDED', 'The nurse says you are fit and sends you on your way.');
    const result = pay('goods_purchase', player.wallet, accounts.business('clinic'), b.fee, `Treatment at ${b.name}`, { service: 'treatment' });
    player.energy = ENERGY.max;
    return { txn: result.id, total: b.fee, energy: player.energy };
  }

  function enrol(player) {
    const b = BUSINESSES.school;
    if (player.skills.blocklaying) throw new GameError('ALREADY_CERTIFIED', 'You already hold the block-laying certificate.');
    const result = pay('goods_purchase', player.wallet, accounts.business('school'), b.fee, `Block-laying course at ${b.name}`, { service: 'course' });
    player.skills.blocklaying = true;
    return { txn: result.id, total: b.fee, hours: b.courseHours };
  }

  // --- the block yard: labour in, blocks out --------------------------------

  function makeBlock(count) {
    const b = BUSINESSES.yard;
    const cementNeeded = count / b.blocksPerBag;
    eco.cementDebt = (eco.cementDebt || 0) + cementNeeded;
    while (eco.cementDebt >= 1) {
      if (have('yard', 'cement') < 1) { eco.cementDebt -= cementNeeded; return false; }
      stockOf('yard').cement -= 1;
      bump(eco.used, 'cement', 1);
      eco.cementDebt -= 1;
    }
    stockOf('yard').block = have('yard', 'block') + count;
    bump(eco.made, 'block', count);
    return true;
  }

  function checkWorkRate(player, realNow) {
    if (realNow - (player.lastWorkAt ?? -10) < WORK_INTERVAL) throw new GameError('TOO_FAST', 'Finish the last one first.');
  }

  function mould(player, stationId, realNow) {
    const station = ZONE_MOULD_STATIONS.find((s) => s.id === stationId);
    if (!station) throw new GameError('NO_STATION', 'There is no such mould.');
    if (station.reservedFor) throw new GameError('STATION_TAKEN', 'That mould belongs to one of the yard\'s own workers.');
    checkWorkRate(player, realNow);
    if (player.energy < ENERGY.mould) throw new GameError('TOO_TIRED', 'You are too tired to work. Eat something or rest.');
    const b = BUSINESSES.yard;
    if (have('yard', 'block') >= 900) throw new GameError('YARD_FULL', `The yard is full. ${zoneResident(b.owner).short} is not taking more blocks until some are sold.`);
    if (ledger.balance(accounts.business('yard')) < b.wagePerBlock) throw new GameError('CANNOT_PAY', 'The yard cannot pay wages just now.');
    if (!makeBlock(1)) throw new GameError('NO_CEMENT', 'The yard has run out of cement. Come back after the delivery.');
    const result = pay('wage', accounts.business('yard'), player.wallet, b.wagePerBlock, 'Piece wage: one block moulded', { station: stationId });
    player.energy -= ENERGY.mould;
    player.lastWorkAt = realNow;
    player.stats.blocksMoulded += 1;
    return { txn: result.id, wage: b.wagePerBlock, energy: player.energy, moulded: player.stats.blocksMoulded };
  }

  // --- building -------------------------------------------------------------

  function siteOf(parcelId) {
    const row = registry.record(parcelId);
    if (!row.site && row.permit) {
      row.site = { design: row.permit.design, stage: 0, started: false, labour: 0, complete: false, paint: null, mason: null, startedAt: null, completedAt: null };
    }
    return row.site;
  }

  function siteView(parcelId, viewerId) {
    const row = registry.record(parcelId);
    const p = zoneParcel(parcelId);
    const site = siteOf(parcelId);
    const stock = { ...stockOf(`site:${parcelId}`) };
    const transit = { ...stockOf(`transit:${parcelId}`) };
    const base = { parcelId, plot: p.plot, yours: row.owner.kind === 'player' && row.owner.id === viewerId, ownerName: row.owner.name, permit: row.permit ? { ...row.permit } : null, stock, transit };
    if (!site) return { ...base, site: null };
    const design = DESIGNS[site.design];
    const current = design.stages[site.stage] || null;
    return {
      ...base,
      site: { design: design.id, designName: design.name, stage: site.stage, stageCount: design.stages.length, started: site.started, labour: site.labour, complete: site.complete, paint: site.paint, mason: site.mason ? { ...site.mason } : null },
      current: current ? { id: current.id, name: current.name, needs: { ...current.needs }, labour: current.labour, dry: current.dry, short: shortfall(parcelId, current) } : null,
      stages: design.stages.map((s) => ({ id: s.id, name: s.name, needs: { ...s.needs }, labour: s.labour })),
    };
  }

  function shortfall(parcelId, current) {
    const short = {};
    for (const [item, qty] of Object.entries(current.needs)) {
      const missing = qty - have(`site:${parcelId}`, item);
      if (missing > 0) short[item] = missing;
    }
    return short;
  }

  // One unit of labour on the current stage, by anyone. Returns what changed.
  function labour(parcelId, units) {
    const row = registry.record(parcelId);
    const site = siteOf(parcelId);
    const p = zoneParcel(parcelId);
    if (!site) throw new GameError('NO_PERMIT', 'There is no building permit for this plot. Apply at the secretariat.');
    if (site.complete) throw new GameError('COMPLETE', 'This building is finished.');
    const design = DESIGNS[site.design];
    const current = design.stages[site.stage];
    if (current.dry && weather().wet) throw new GameError('RAIN', `${current.name} cannot go on in the rain. Wait for it to stop.`);
    if (!site.started) {
      const short = shortfall(parcelId, current);
      const missing = Object.entries(short);
      if (missing.length) {
        throw new GameError('MATERIALS', `${current.name} needs ${missing.map(([item, qty]) => countOf(item, qty)).join(' and ')} more on site.`);
      }
      for (const [item, qty] of Object.entries(current.needs)) { stockOf(`site:${parcelId}`)[item] -= qty; bump(eco.used, item, qty); }
      site.started = true;
      if (site.startedAt === null) { site.startedAt = clock(); row.history.push({ at: clock(), type: 'construction', detail: `Construction started: ${design.name.toLowerCase()}` }); }
    }
    site.labour = Math.min(current.labour, site.labour + units);
    let finishedStage = null;
    if (site.labour >= current.labour) {
      finishedStage = current.name;
      site.stage += 1; site.labour = 0; site.started = false;
      if (site.stage >= design.stages.length) {
        site.complete = true; site.completedAt = clock();
        if (!site.paint) site.paint = 'cream';
        row.history.push({ at: clock(), type: 'construction', detail: `${design.name} completed on Plot ${p.plot}` });
      }
    }
    return { finishedStage, complete: site.complete, stage: site.stage, labour: site.labour };
  }

  function work(player, parcelId, realNow) {
    const row = registry.record(parcelId);
    if (row.owner.kind !== 'player' || row.owner.id !== player.id) throw new GameError('NOT_OWNER', 'This is not your plot.');
    checkWorkRate(player, realNow);
    if (player.energy < ENERGY.build) throw new GameError('TOO_TIRED', 'You are too tired to work. Eat something or rest.');
    const result = labour(parcelId, player.skills.blocklaying ? 2 : 1);
    player.energy -= ENERGY.build;
    player.lastWorkAt = realNow;
    return { ...result, energy: player.energy };
  }

  function hireMason(player, parcelId) {
    const row = registry.record(parcelId);
    const p = zoneParcel(parcelId);
    if (row.owner.kind !== 'player' || row.owner.id !== player.id) throw new GameError('NOT_OWNER', 'This is not your plot.');
    const site = siteOf(parcelId);
    if (!site) throw new GameError('NO_PERMIT', 'There is no building permit for this plot.');
    if (site.complete) throw new GameError('COMPLETE', 'This building is finished.');
    if (site.mason) throw new GameError('ALREADY_HIRED', `${MASON.short} is already engaged on this stage.`);
    const busyElsewhere = Object.values(state.registry.parcels).some((r) => r.site && r.site.mason);
    if (busyElsewhere) throw new GameError('MASON_BUSY', `${MASON.short} is working on another plot. Try again when he is free.`);
    const design = DESIGNS[site.design];
    const current = design.stages[site.stage];
    if (!site.started) {
      const missing = Object.keys(shortfall(parcelId, current));
      if (missing.length) throw new GameError('MATERIALS', `${MASON.short} will not start until the materials for ${current.name.toLowerCase()} are on site.`);
    }
    const units = current.labour - site.labour;
    const fee = units * MASON_RATE;
    const result = pay('wage', player.wallet, accounts.resident('mason'), fee, `Mason engaged for ${current.name.toLowerCase()}, Plot ${p.plot}`, { parcel: parcelId, stage: current.id, units });
    site.mason = { id: 'mason', stage: site.stage, timer: 0 };
    const layout = zoneSiteLayout(p);
    residents.send('mason', `site:${parcelId}`, { node: nearestNode(layout.road.x, layout.road.z), via: [[layout.road.x, layout.road.z]], x: layout.work.x, z: layout.work.z, facing: Math.atan2(layout.pad.x - layout.work.x, layout.pad.z - layout.work.z), inside: false });
    return { txn: result.id, fee, units, stage: current.name };
  }

  function choosePaint(player, parcelId, colour) {
    const row = registry.record(parcelId);
    if (row.owner.kind !== 'player' || row.owner.id !== player.id) throw new GameError('NOT_OWNER', 'This is not your plot.');
    if (!PAINT_COLOURS[colour]) throw new GameError('BAD_COLOUR', 'That colour is not in stock.');
    const site = siteOf(parcelId);
    if (!site) throw new GameError('NO_PERMIT', 'There is nothing to paint yet.');
    site.paint = colour;
    return { colour };
  }

  // --- time-driven activity ---------------------------------------------------

  function tick(dtReal, hourOfDay) {
    const now = clock();
    // deliveries arriving
    for (let i = eco.deliveries.length - 1; i >= 0; i -= 1) {
      const d = eco.deliveries[i];
      if (d.due <= now) {
        moveGoods(`transit:${d.parcelId}`, `site:${d.parcelId}`, d.item, d.qty);
        eco.deliveries.splice(i, 1);
        emit(d.playerId, { type: 'delivery', text: `Delivered to Plot ${zoneParcel(d.parcelId).plot}: ${countOf(d.item, d.qty)}.` });
      }
    }
    // the yard's own moulder
    if (residents.isAt('moulder', 'mould3') && have('yard', 'block') < 600) {
      eco.mouldTimer += dtReal;
      while (eco.mouldTimer >= 14) {
        eco.mouldTimer -= 14;
        if (ledger.balance(accounts.business('yard')) >= BUSINESSES.yard.wagePerBlock && makeBlock(1)) {
          tryPay('wage', accounts.business('yard'), accounts.resident('moulder'), BUSINESSES.yard.wagePerBlock, 'Piece wage: one block moulded');
        }
      }
    }
    // hired mason
    for (const [parcelId, row] of Object.entries(state.registry.parcels)) {
      const site = row.site;
      if (!site || !site.mason) continue;
      const onSite = residents.isAt('mason', `site:${parcelId}`);
      const design = DESIGNS[site.design];
      const current = design.stages[site.stage];
      if (site.complete || site.stage !== site.mason.stage) {
        site.mason = null; residents.release('mason');
        if (row.owner.kind === 'player') emit(row.owner.id, { type: 'site', text: `${MASON.short} has finished ${design.stages[Math.max(0, site.stage - 1)].name.toLowerCase()} on Plot ${zoneParcel(parcelId).plot}.` });
        continue;
      }
      if (!onSite || hourOfDay < 7 || hourOfDay >= 18 || (current.dry && weather().wet)) continue;
      site.mason.timer += dtReal;
      while (site.mason && site.mason.timer >= MASON_SECONDS_PER_UNIT) {
        site.mason.timer -= MASON_SECONDS_PER_UNIT;
        const outcome = labour(parcelId, 1);
        if (outcome.finishedStage) break;
      }
    }
  }

  function restock() {
    const store = BUSINESSES.store;
    for (const [item, price] of Object.entries(store.sells)) {
      const target = item === 'cement' ? 60 : 6;
      if (have('store', item) < target / 2) {
        const qty = target - have('store', item);
        if (tryPay('retirement', accounts.business('store'), issuanceAccount, Math.round(price * store.importShare) * qty, `Imported stock: ${qty} x ${GOODS[item].name}`)) {
          stockOf('store')[item] = have('store', item) + qty;
          bump(eco.imported, item, qty);
        }
      }
    }
    if (have('yard', 'cement') < 3 && have('store', 'cement') >= 10) {
      if (tryPay('goods_purchase', accounts.business('yard'), accounts.business('store'), 540 * 10, 'Ten bags of cement at trade price')) moveGoods('store', 'yard', 'cement', 10);
    }
  }

  const SALARIES = { lands: [`government:${GOV_STATE}`, 900], surveyor: [`government:${GOV_STATE}`, 600], clerk: [`government:${GOV_LOCAL}`, 900], sergeant: [`government:${GOV_LOCAL}`, 900], corporal: [`government:${GOV_LOCAL}`, 900], nurse: ['business:clinic', 700], instructor: ['business:school', 700] };
  const TRADERS = ['clothseller', 'produce', 'fisher'];

  function hourly(hour, dayNumber) {
    restock();
    if (hour === 6) {
      tryPay('goods_purchase', accounts.business('kitchen'), accounts.resident('fisher'), 600, ZONE_TEXT.kitchenFish);
      tryPay('goods_purchase', accounts.business('kitchen'), accounts.resident('produce'), 400, ZONE_TEXT.kitchenProduce);
    }
    if (hour === 8 || hour === 17) for (const id of ['lands', 'clerk', 'instructor']) tryPay('goods_purchase', accounts.resident(id), accounts.resident('rider'), 100, ZONE_TEXT.fare);
    if (hour === 13) {
      for (const r of ZONE_RESIDENTS) {
        if (r.id !== 'cook' && tryPay('goods_purchase', accounts.resident(r.id), accounts.business('kitchen'), BUSINESSES.kitchen.sells.meal, `Lunch at ${BUSINESSES.kitchen.name}`)) { bump(eco.made, 'meal', 1); bump(eco.used, 'meal', 1); }
      }
    }
    if (hour === 17) {
      for (const [id, [payer, amount]] of Object.entries(SALARIES)) {
        const [kind, code] = payer.split(':');
        tryPay('wage', kind === 'government' ? accounts.government(code) : accounts.business(code), accounts.resident(id), amount, 'Daily salary');
      }
      for (const id of ['yardowner', 'trader', 'cook']) tryPay('transfer', accounts.business({ yardowner: 'yard', trader: 'store', cook: 'kitchen' }[id]), accounts.resident(id), 500, 'Owner\'s drawings');
    }
    if (hour === 18) {
      ZONE_RESIDENTS.forEach((r, index) => {
        const trader = TRADERS[(index + dayNumber) % TRADERS.length];
        if (r.id !== trader) tryPay('goods_purchase', accounts.resident(r.id), accounts.resident(trader), 300, 'Household shopping at the market');
      });
      for (const id of [...TRADERS, 'rider']) tryPay('government_fee', accounts.resident(id), accounts.government(GOV_LOCAL), 50, 'Daily market levy');
      for (const id of ['yard', 'store', 'kitchen']) tryPay('government_fee', accounts.business(id), accounts.government(GOV_LOCAL), 150, 'Daily business levy');
    }
  }

  // The public account of a government: what came in, what went out.
  function publicAccount(code) {
    const account = accounts.government(code);
    const rows = ledger.history(account, 400);
    let income = 0;
    let spending = 0;
    const byReason = {};
    for (const row of rows) {
      if (row.kind === 'issuance') continue;
      if (row.amount > 0) income += row.amount; else spending -= row.amount;
      const label = row.reason.replace(/, Plot .*$/, '').replace(/^Purchase of Plot .*$/, 'Land sales and registration fees');
      byReason[label] = (byReason[label] || 0) + row.amount;
    }
    return { code, balance: ledger.balance(account), income, spending, lines: Object.entries(byReason).map(([label, amount]) => ({ label, amount })).sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)), recent: rows.slice(0, 8) };
  }

  // Stock audit: everything that exists was made or imported, and has not been used.
  function auditGoods(initial) {
    const totals = {};
    for (const holder of Object.values(eco.stock)) for (const [item, qty] of Object.entries(holder)) totals[item] = (totals[item] || 0) + qty;
    const problems = [];
    for (const item of Object.keys(GOODS)) {
      const expected = (initial[item] || 0) + (eco.made[item] || 0) + (eco.imported[item] || 0) - (eco.used[item] || 0);
      if ((totals[item] || 0) !== expected) problems.push({ item, held: totals[item] || 0, expected });
    }
    return problems;
  }

  return { accounts, catalogue, buy, eat, treat, enrol, mould, work, hireMason, choosePaint, siteView, siteOf, labour, tick, hourly, publicAccount, auditGoods, have, moveGoods, stockOf, tryPay };
}
