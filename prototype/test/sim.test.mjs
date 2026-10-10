// Headless tests for the simulation. Run with: node --test test/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHost } from '../src/sim/host.js';
import { createLedger, LedgerError } from '../src/sim/ledger.js';
import { createSettlement, SETTLEMENT_POLICY } from '../src/sim/settlement.js';
import { makeRng } from '../src/sim/rng.js';
import { ZONE, ZONE_PARCELS, ZONE_NODES, ZONE_EDGES, ZONE_PLACES, ZONE_SERVICES, ZONE_JETTY, zoneParcelByPlot, zoneWalkable, zoneService, zoneToGeo } from '../src/sim/zone.js';
import { NIGERIA_STATES } from '../src/sim/nigeria.js';
import { geoToWorld, worldToGeo, gridToTrue, trueToGrid } from '../src/sim/geo.js';
import { newWorld, ok, walkTo, goToService, goToBoard, goToWork, goToMould, run, fund, waitUntilOpen, waitUntilDry, driveTo } from './helpers.mjs';
import { ZONE_RUNS, ZONE_VEHICLE_BAYS } from '../src/sim/zone.js';
import { VEHICLE_KINDS, FUEL, vehicleFits } from '../src/sim/vehicles.js';
import { ARRIVAL_FUNDS } from '../src/sim/sim.js';
import { trText, trAmount, trPlain, trIn, poundsOf, TR } from '../src/sim/ledger.js';

const refused = (result, code) => { assert.equal(result.ok, false, 'expected a refusal'); assert.equal(result.code, code, result.message); };
const clean = (host) => { assert.deepEqual(host.auditor.reconcile(), []); assert.deepEqual(host.game.audit().goods, []); };

test('the country: 36 states and the FCT are registered, and coordinates round-trip', () => {
  assert.equal(NIGERIA_STATES.length, 37);
  assert.equal(NIGERIA_STATES.filter((s) => s.kind === 'state').length, 36);
  assert.equal(new Set(NIGERIA_STATES.map((s) => s.code)).size, 37);
  const lagos = geoToWorld(6.5244, 3.3792);
  const abuja = geoToWorld(9.0765, 7.3986);
  const km = Math.hypot(lagos.x - abuja.x, lagos.z - abuja.z) / 1000;
  assert.ok(km > 50 && km < 56, `Lagos to Abuja is ${km.toFixed(1)} game km at 1:10`);
  const back = worldToGeo(lagos.x, lagos.z);
  assert.ok(Math.abs(back.lat - 6.5244) < 1e-9 && Math.abs(back.lon - 3.3792) < 1e-9);
});

test('the town: Atani sits in Anambra State on the east bank of the river, in true coordinates', () => {
  const anambra = NIGERIA_STATES.find((s) => s.code === ZONE.state);
  assert.equal(anambra.name, 'Anambra');
  assert.equal(ZONE.id, 'NG-AN-OGB-Z1');
  const here = worldToGeo(ZONE.origin.x, ZONE.origin.z);
  assert.ok(Math.abs(here.lat - 6.017) < 1e-9 && Math.abs(here.lon - 6.75) < 1e-9);
  const awka = geoToWorld(anambra.lat, anambra.lon);
  const km = Math.hypot(awka.x - ZONE.origin.x, awka.z - ZONE.origin.z) / 1000;
  assert.ok(km > 2 && km < 6, `the state capital is ${km.toFixed(1)} game km away at 1:10`);
  // The river lies west of the town and the layout runs inland to the east.
  const jetty = zoneToGeo((ZONE_JETTY.x0 + ZONE_JETTY.x1) / 2, ZONE_JETTY.z1);
  const centre = zoneToGeo(0, 0);
  assert.ok(jetty.lon < centre.lon, 'the jetty is west of the town centre');
  for (const p of ZONE_PARCELS) assert.ok(p.lon > centre.lon, `plot ${p.plot} is east of the town centre`);
  assert.ok(Math.abs(jetty.lat - centre.lat) < 0.003, 'the road to the jetty runs east to west');
  // Grid and true offsets convert both ways.
  const t = gridToTrue(12, -7, ZONE.gridBearing);
  const g = trueToGrid(t.e, t.s, ZONE.gridBearing);
  assert.ok(Math.abs(g.x - 12) < 1e-9 && Math.abs(g.z + 7) < 1e-9);
  assert.deepEqual(gridToTrue(3, 4, 0), { e: 3, s: 4 });
});

test('the town is data: no rule or client file names a town, a state or a resident', () => {
  const names = new RegExp(['Atani', 'Anambra', 'Ogbaru', 'Niger\\b', 'Epe\\b', 'Lagos', 'Okonkwo', 'Udeh', 'Akpan', 'Nkechi'].join('|'));
  for (const file of ['sim/sim.js', 'sim/vehicles.js', 'sim/economy.js', 'sim/registry.js', 'sim/residents.js', 'sim/host.js', 'client/main.js', 'client/ui.js', 'client/render-world.js', 'client/render-actors.js', 'client/render-sky.js', 'client/template.html']) {
    const source = readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8');
    const found = source.match(names);
    assert.equal(found, null, `${file} mentions ${found && found[0]}`);
  }
});

test('the map: every path, post and service point is on walkable ground', () => {
  for (const [name, [x, z]] of Object.entries(ZONE_NODES)) assert.ok(zoneWalkable(x, z), `node ${name}`);
  for (const [a, b] of ZONE_EDGES) {
    const [ax, az] = ZONE_NODES[a];
    const [bx, bz] = ZONE_NODES[b];
    const steps = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.4);
    for (let i = 0; i <= steps; i += 1) assert.ok(zoneWalkable(ax + ((bx - ax) * i) / steps, az + ((bz - az) * i) / steps), `edge ${a}-${b}`);
  }
  for (const [key, spot] of Object.entries(ZONE_PLACES)) if (!spot.inside) assert.ok(zoneWalkable(spot.x, spot.z), `place ${key}`);
  for (const s of ZONE_SERVICES) assert.ok(zoneWalkable(s.x, s.z), `service ${s.id}`);
  assert.equal(new Set(ZONE_PARCELS.map((p) => p.id)).size, ZONE_PARCELS.length);
  for (const p of ZONE_PARCELS) assert.match(p.id, /^NG-AN-OGB-\d{6}$/);
});

test('ledger: the gameplay handle cannot touch test bitcoin or create TR', () => {
  const ledger = createLedger();
  const a = ledger.gameplay.openAccount('player', 'a', 'wallet');
  const b = ledger.gameplay.openAccount('player', 'b', 'wallet');
  const btc = ledger.settlement.openAccount('player', 'a', 'settlement', 'TBTC');
  const code = (fn) => { try { fn(); } catch (e) { assert.ok(e instanceof LedgerError); return e.code; } return null; };
  assert.equal(code(() => ledger.gameplay.post({ key: 'k-000001', kind: 'issuance', initiator: 'x', reason: 'x', legs: [{ account: ledger.system.issuance, amount: -500 }, { account: a, amount: 500 }] })), 'NL004');
  assert.equal(code(() => ledger.gameplay.post({ key: 'k-000002', kind: 'deposit', initiator: 'x', reason: 'x', legs: [{ account: ledger.system.chainCustody, amount: -5 }, { account: btc, amount: 5 }] })), 'NL004');
  assert.equal(code(() => ledger.gameplay.post({ key: 'k-000003', kind: 'transfer', initiator: 'x', reason: 'x', legs: [{ account: btc, amount: -5 }, { account: ledger.system.revenue, amount: 5 }] })), 'NL004');
  assert.equal(code(() => ledger.gameplay.post({ key: 'k-000004', kind: 'conversion', initiator: 'x', reason: 'x', legs: [{ account: a, amount: -5 }, { account: b, amount: 5 }] })), 'NL004');
  assert.equal(code(() => ledger.gameplay.balance(btc)), 'NL004');
  assert.equal(code(() => ledger.gameplay.history(btc)), 'NL004');
  assert.equal(code(() => ledger.gameplay.openAccount('system', 'operator', 'mint2')), 'NL004');
  assert.equal(ledger.gameplay.settlement, undefined);
  assert.equal(ledger.auditor.transactionCount(), 0);
});

test('ledger: double entry, idempotency and refusals', () => {
  const ledger = createLedger();
  const a = ledger.gameplay.openAccount('player', 'a', 'wallet');
  const b = ledger.gameplay.openAccount('player', 'b', 'wallet');
  ledger.monetary.post({ key: 'grant-0001', kind: 'issuance', initiator: 'ops', reason: 'grant', legs: [{ account: ledger.system.issuance, amount: -1000 }, { account: a, amount: 1000 }] });
  const send = (key, amount) => ledger.gameplay.post({ key, kind: 'transfer', initiator: 'svc', reason: 'pay', legs: [{ account: a, amount: -amount }, { account: b, amount }] });
  const first = send('pay-00001', 400);
  assert.deepEqual(send('pay-00001', 400), { id: first.id, replayed: true });
  assert.throws(() => send('pay-00001', 401), (e) => e.code === 'NL002');
  assert.throws(() => send('pay-00002', 601), (e) => e.code === 'NL001');
  assert.throws(() => ledger.gameplay.post({ key: 'pay-00003', kind: 'transfer', initiator: 'svc', reason: 'x', legs: [{ account: a, amount: -5 }, { account: b, amount: 6 }] }), (e) => e.code === 'NL003');
  assert.throws(() => ledger.gameplay.post({ key: 'pay-00004', kind: 'transfer', initiator: 'svc', reason: 'x', legs: [{ account: a, amount: -1.5 }, { account: b, amount: 1.5 }] }), (e) => e.code === 'NL005');
  assert.equal(ledger.gameplay.balance(a), 600);
  assert.equal(ledger.gameplay.balance(b), 400);
  assert.deepEqual(ledger.auditor.reconcile(), []);
  assert.equal(ledger.auditor.supply().TR, 1000);
  assert.throws(() => { ledger.auditor.transactions()[0].entries[0].amount = 1; }, TypeError);
});

test('TR: two ledger units to a TR, written as TR, and £20 is 2,000 TR', () => {
  assert.equal(TR, 2);
  assert.equal(trText(4000), '2,000 TR');
  assert.equal(trText(20), '10 TR');
  assert.equal(trText(200), '100 TR');
  assert.equal(trText(1), '0.5 TR');
  assert.equal(trText(12345), '6,172.5 TR');
  assert.equal(trAmount(4000), '2,000');
  assert.equal(trPlain(4000), '2000', 'no commas in a box a number is typed into');
  assert.equal(trIn('10'), 20);
  assert.equal(trIn('7.5'), 15);
  assert.equal(trIn('ten'), null);
  assert.equal(poundsOf(ARRIVAL_FUNDS), 20, 'the arrival money is the £20 of the story');
  assert.equal(poundsOf(100 * TR), 1, '£1 is 100 TR');
});

test('the rename changed no number: a character saved when the money was cowries has exactly what they had', () => {
  const host = createHost();
  const id = host.game.join({ name: 'Ada Before', look: {} });
  const other = host.game.join({ name: 'Bayo Before', look: {} });
  // a save as it was written before the rename: the accounts say their asset is CWR
  const old = JSON.parse(JSON.stringify(host.save()));
  for (const account of old.ledger.accounts) if (account.asset === 'TR') account.asset = 'CWR';
  assert.ok(old.ledger.accounts.some((a) => a.asset === 'CWR'));
  const before = old.ledger.accounts.map((a) => [a.id, a.balance]);
  const supply0 = host.auditor.supply().TR;      // the town's own opening capital, and the two arrivals
  let now = createHost({ saved: old });
  // loaded, saved and loaded again, three times over: the numbers never move, so nothing can be applied twice
  for (let k = 0; k < 3; k += 1) {
    assert.equal(now.game.view(id).self.balance, ARRIVAL_FUNDS);
    assert.equal(trText(now.game.view(id).self.balance), '2,000 TR');
    assert.equal(now.auditor.supply().TR, supply0, 'not a unit more or less in the world');
    assert.equal(now.auditor.supply().CWR, undefined, 'there is one currency, not two');
    assert.deepEqual(now.auditor.reconcile(), []);
    const saved = JSON.parse(JSON.stringify(now.save()));
    assert.deepEqual(saved.ledger.accounts.map((a) => [a.id, a.balance]), before);
    assert.ok(saved.ledger.accounts.every((a) => a.asset !== 'CWR'));
    now = createHost({ saved });
  }
  // and the money still works: a new arrival after the rename is given the same 2,000 TR into the same ledger
  const late = now.game.join({ name: 'Chidi After', look: {} });
  assert.equal(now.game.view(late).self.balance, ARRIVAL_FUNDS);
  assert.equal(now.game.view(other).self.balance, ARRIVAL_FUNDS);
  assert.deepEqual(now.auditor.reconcile(), []);
});

test('arrival: every newcomer is given 2,000 TR once, by one issuance on the ledger, and never again', () => {
  const host = createHost();
  const supply0 = host.auditor.supply().TR, count0 = host.auditor.transactionCount();
  const id = host.game.join({ name: 'Ada Newcomer', look: {} });
  assert.equal(ARRIVAL_FUNDS, 4000);
  assert.equal(trText(ARRIVAL_FUNDS), '2,000 TR');
  assert.equal(host.game.view(id).self.balance, ARRIVAL_FUNDS);
  assert.equal(host.auditor.supply().TR - supply0, ARRIVAL_FUNDS, 'issued, not taken from anyone');
  assert.equal(host.auditor.transactionCount(), count0 + 1);
  const arrivals = () => host.auditor.transactions().filter((t) => t.key.startsWith('arrival:'));
  const [grant] = arrivals();
  assert.equal(grant.key, `arrival:${id}`);
  assert.equal(grant.kind, 'issuance');
  assert.equal(grant.entries.length, 2);
  assert.equal(grant.entries.find((e) => e.amount > 0).account, host.game.state.players[id].wallet);
  assert.equal(grant.entries.find((e) => e.amount > 0).amount, ARRIVAL_FUNDS);
  assert.match(grant.reason, /2,000 TR/);
  const history = ok(host.game.intent(id, { type: 'wallet.history' })).rows;
  assert.deepEqual(history.map((r) => [r.kind, r.amount]), [['issuance', ARRIVAL_FUNDS]]);
  assert.equal(host.game.view(id).journal.find((j) => j.id === 'funds').done, false, 'the arrival money is not a first earning');
  // a second newcomer: a grant of their own
  const id2 = host.game.join({ name: 'Bayo Newcomer', look: {} });
  assert.equal(host.game.view(id2).self.balance, ARRIVAL_FUNDS);
  assert.equal(host.auditor.supply().TR - supply0, 2 * ARRIVAL_FUNDS);
  // saved and loaded again, twice: nobody is given it a second time
  let again = host;
  for (let k = 0; k < 2; k += 1) {
    again = createHost({ saved: JSON.parse(JSON.stringify(again.save())) });
    again.tick(1);
    assert.equal(again.game.view(id).self.balance, ARRIVAL_FUNDS);
    assert.equal(again.game.view(id2).self.balance, ARRIVAL_FUNDS);
    assert.equal(again.auditor.supply().TR - supply0, 2 * ARRIVAL_FUNDS);
    assert.equal(again.auditor.transactions().filter((t) => t.key.startsWith('arrival:')).length, 2);
  }
  // a newcomer after the reload is a new character with a new key, and gets their own
  const id3 = again.game.join({ name: 'Chidi Later', look: {} });
  assert.ok(![id, id2].includes(id3));
  assert.equal(again.game.view(id3).self.balance, ARRIVAL_FUNDS);
  assert.equal(again.auditor.transactions().filter((t) => t.key === `arrival:${id3}`).length, 1);
  clean(again);
});

test('settlement: a deposit is credited once, and only after enough confirmations', () => {
  const { host, id } = newWorld();
  const deposit = ok(host.portal(id, 'faucet', { sats: 100_000 })).data;
  assert.equal(deposit.status, 'seen');
  assert.equal(ok(host.portal(id, 'summary')).data.btcSats, 0);
  host.settlementOps.mineBlock();
  host.settlementOps.mineBlock();
  assert.equal(ok(host.portal(id, 'summary')).data.btcSats, 0, 'two confirmations are not enough');
  assert.equal(ok(host.portal(id, 'summary')).data.deposits[0].confirmations, 2);
  host.settlementOps.mineBlock();
  assert.equal(ok(host.portal(id, 'summary')).data.btcSats, 100_000);
  for (let i = 0; i < 5; i += 1) host.settlementOps.mineBlock();
  assert.equal(ok(host.portal(id, 'summary')).data.btcSats, 100_000, 'credited exactly once');
  assert.equal(host.game.view(id).self.balance, ARRIVAL_FUNDS, 'a deposit alone creates no game funds: only the arrival money is there');
  assert.ok(host.settlementOps.proofOfReserves().matches);
  clean(host);
});

test('settlement: conversion uses a quote, moves both sides at once, and a quote works once', () => {
  const { host, id } = newWorld();
  ok(host.portal(id, 'faucet', { sats: 100_000 }));
  for (let i = 0; i < 3; i += 1) host.settlementOps.mineBlock();
  const supplyBefore = host.auditor.supply().TR;
  const quote = ok(host.portal(id, 'quote', { sats: 60_000 })).data;
  assert.equal(quote.cowries, 30_000);
  const done = ok(host.portal(id, 'convert', { quoteId: quote.id })).data;
  assert.equal(done.cowries, 30_000);
  assert.equal(host.game.view(id).self.balance, ARRIVAL_FUNDS + 30_000);
  assert.equal(ok(host.portal(id, 'summary')).data.btcSats, 40_000);
  assert.equal(host.auditor.supply().TR - supplyBefore, 30_000);
  refused(host.portal(id, 'convert', { quoteId: quote.id }), 'QUOTE_USED');
  const tooMuch = ok(host.portal(id, 'quote', { sats: 50_000 })).data;
  refused(host.portal(id, 'convert', { quoteId: tooMuch.id }), 'INSUFFICIENT_BTC');
  const stale = ok(host.portal(id, 'quote', { sats: 10_000 })).data;
  run(host, SETTLEMENT_POLICY.quoteLifetimeSeconds + 1, 1);
  refused(host.portal(id, 'convert', { quoteId: stale.id }), 'QUOTE_EXPIRED');
  assert.equal(host.game.view(id).self.balance, ARRIVAL_FUNDS + 30_000);
  clean(host);
});

test('settlement: a withdrawal is held, checked, broadcast, confirmed and then settled', () => {
  const { host, id } = newWorld();
  ok(host.portal(id, 'faucet', { sats: 200_000 }));
  for (let i = 0; i < 3; i += 1) host.settlementOps.mineBlock();
  refused(host.portal(id, 'withdraw', { address: 'bc1qrealmainnetaddressxxxxxxxxxxxxxxxxxxxxx', sats: 50_000 }), 'BAD_ADDRESS');
  refused(host.portal(id, 'withdraw', { address: 'sbx1qaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', sats: 5_000 }), 'BELOW_MINIMUM');
  refused(host.portal(id, 'withdraw', { address: 'sbx1qaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', sats: 200_000 }), 'INSUFFICIENT_BTC');
  const w = ok(host.portal(id, 'withdraw', { address: 'sbx1qaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', sats: 50_000 })).data;
  assert.equal(w.status, 'approved');
  assert.equal(ok(host.portal(id, 'summary')).data.btcSats, 200_000 - 50_000 - SETTLEMENT_POLICY.withdrawalFeeSats, 'amount and fee are held at once');
  assert.ok(host.settlementOps.proofOfReserves().matches);
  host.settlementOps.mineBlock();
  assert.equal(ok(host.portal(id, 'summary')).data.withdrawals[0].status, 'broadcast');
  for (let i = 0; i < 3; i += 1) { host.settlementOps.mineBlock(); assert.ok(host.settlementOps.proofOfReserves().matches); }
  assert.equal(ok(host.portal(id, 'summary')).data.withdrawals[0].status, 'settled');
  assert.equal(ok(host.portal(id, 'summary')).data.btcSats, 149_000);
  clean(host);
});

test('settlement: a large withdrawal waits for a named reviewer, and a rejection returns the funds', () => {
  const { host, id } = newWorld();
  ok(host.portal(id, 'faucet', { sats: 900_000 }));
  for (let i = 0; i < 3; i += 1) host.settlementOps.mineBlock();
  const w = ok(host.portal(id, 'withdraw', { address: 'sbx1qbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', sats: 400_000 })).data;
  assert.equal(w.status, 'manual_review');
  for (let i = 0; i < 4; i += 1) host.settlementOps.mineBlock();
  assert.equal(ok(host.portal(id, 'summary')).data.withdrawals[0].status, 'manual_review', 'nothing is sent without review');
  assert.throws(() => host.settlementOps.reviewWithdrawal(w.id, 'approve', ''), (e) => e.code === 'NO_REVIEWER');
  host.settlementOps.reviewWithdrawal(w.id, 'reject', 'ops:compliance-officer');
  assert.equal(ok(host.portal(id, 'summary')).data.btcSats, 900_000);
  assert.equal(ok(host.portal(id, 'withdraw', { address: 'sbx1qbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', sats: 300_000 })).data.status, 'approved');
  refused(host.portal(id, 'withdraw', { address: 'sbx1qbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', sats: 250_000 }), 'DAILY_LIMIT');
  assert.ok(host.settlementOps.auditLog().some((row) => row.action === 'withdrawal_rejected' && row.actor === 'ops:compliance-officer'));
  clean(host);
});

test('settlement: TR is not redeemable unless the settlement layer authorises it', () => {
  const { host, id } = newWorld();
  fund(host, id, 100_000);
  refused(host.portal(id, 'redeem', { cowries: 10_000 }), 'REDEMPTION_DISABLED');
  assert.equal(host.game.view(id).self.balance, ARRIVAL_FUNDS + 50_000);

  // The same flow with the policy switched on by the operator.
  const ledger = createLedger();
  const settlement = createSettlement({ ledger, rng: makeRng(7), policy: { ...SETTLEMENT_POLICY, redemptionEnabled: true } });
  settlement.account('p1');
  settlement.faucet('p1', 100_000);
  for (let i = 0; i < 3; i += 1) settlement.mineBlock();
  settlement.convert('p1', settlement.quote('p1', 100_000).id);
  const wallet = ledger.gameplay.findAccount('player', 'p1', 'wallet');
  const request = settlement.requestRedemption('p1', 20_000);
  assert.equal(ledger.gameplay.balance(wallet), 30_000, 'the TR is held while the request is pending');
  assert.equal(settlement.summary('p1').btcSats, 0, 'no bitcoin moves before authorisation');
  assert.throws(() => settlement.decideRedemption(request.id, 'authorise', ''), (e) => e.code === 'NO_REVIEWER');
  settlement.decideRedemption(request.id, 'authorise', 'ops:settlement-officer');
  assert.equal(settlement.summary('p1').btcSats, 40_000);
  assert.equal(ledger.auditor.supply().TR, 30_000, 'redeemed TR leaves circulation');
  const second = settlement.requestRedemption('p1', 10_000);
  settlement.decideRedemption(second.id, 'decline', 'ops:settlement-officer');
  assert.equal(ledger.gameplay.balance(wallet), 30_000, 'a declined request returns the TR');
  assert.throws(() => settlement.decideRedemption(second.id, 'authorise', 'ops:settlement-officer'), (e) => e.code === 'ALREADY_DECIDED');
  assert.deepEqual(ledger.auditor.reconcile(), []);
  assert.ok(settlement.proofOfReserves().matches);
  // only what came in from bitcoin can go back out: game-issued TR (like the arrival money) cannot
  ledger.monetary.post({ key: 'arrival:p1', kind: 'issuance', initiator: 'ops:monetary', reason: 'Arrival money', legs: [{ account: ledger.system.issuance, amount: -4000 }, { account: wallet, amount: 4000 }] });
  assert.throws(() => settlement.requestRedemption('p1', 30_001), (e) => e.code === 'NOT_REDEEMABLE');
  assert.equal(ledger.gameplay.balance(wallet), 34_000, 'a refused request holds nothing');
  settlement.requestRedemption('p1', 30_000);
  assert.throws(() => settlement.requestRedemption('p1', 1), (e) => e.code === 'NOT_REDEEMABLE', 'the arrival money stays a game fund');
});

test('isolation: the game simulation does not import or receive the settlement service', () => {
  for (const file of ['sim.js', 'economy.js', 'registry.js', 'residents.js', 'vehicles.js', 'zone.js', 'zones/atani.js']) {
    const source = readFileSync(new URL(`../src/sim/${file}`, import.meta.url), 'utf8');
    assert.ok(!/from '\.\/settlement\.js'/.test(source), `${file} must not import settlement`);
    assert.ok(!/TBTC|satoshi|bitcoin/i.test(source.replace(/\/\/.*$/gm, '')), `${file} must not mention bitcoin`);
  }
  const { host, id } = newWorld();
  refused(host.game.intent(id, { type: 'settlement.faucet', sats: 1 }), 'UNKNOWN_INTENT');
  refused(host.game.intent(id, { type: 'constructor' }), 'UNKNOWN_INTENT');
  assert.equal(host.portal('p-9999', 'summary').code, 'NO_ACCOUNT');
  assert.equal(JSON.stringify(host.game.view(id)).includes('sbx1q'), false, 'the game view carries no settlement data');
});

test('movement: the simulation rejects teleports, speed hacks and walking through walls', () => {
  const { host, id } = newWorld();
  const me = host.game.view(id).self;
  host.tick(0.1);
  refused(host.game.intent(id, { type: 'move', x: me.x + 60, z: me.z, heading: 0, run: true }), 'TOO_FAST');
  refused(host.game.intent(id, { type: 'move', x: me.x + 1.5, z: me.z, heading: 0, run: false }), 'TOO_FAST');
  ok(host.game.intent(id, { type: 'move', x: me.x + 0.2, z: me.z, heading: 0, run: false }));
  refused(host.game.intent(id, { type: 'move', x: NaN, z: 0, heading: 0 }), 'BAD_MOVE');
  // Walk up to the registry wall, then try to step through it.
  goToService(host, id, 'registry');
  const reg = zoneService('registry');
  let blocked = false;
  for (let i = 0; i < 80 && !blocked; i += 1) {
    host.tick(0.1);
    const now = host.game.view(id).self;
    const step = host.game.intent(id, { type: 'move', x: now.x, z: now.z - 0.4, heading: Math.PI, run: true });
    if (!step.ok) { assert.equal(step.code, 'BLOCKED'); blocked = true; }
  }
  assert.ok(blocked, 'the wall stopped the player');
  assert.ok(host.game.view(id).self.z > reg.z - 2.1, 'still outside the building');
});

test('services: an office needs both its opening hours and its officer at the desk', () => {
  const { host, id } = newWorld();
  goToService(host, id, 'registry');
  waitUntilOpen(host, id, 'registry');
  ok(host.game.intent(id, { type: 'registry.list' }));
  walkTo(host, id, 22, -48);
  ok(host.game.intent(id, { type: 'rest', benchId: 'bench-registry', hours: 10 }));
  assert.equal(host.game.view(id).services.registry.open, false);
  goToService(host, id, 'registry');
  refused(host.game.intent(id, { type: 'registry.list' }), 'CLOSED');
  // From far away the same request is refused for a different reason.
  walkTo(host, id, 0, 60);
  refused(host.game.intent(id, { type: 'registry.list' }), 'TOO_FAR');
});

test('work: a newcomer with only the arrival money earns a first wage at the block yard', () => {
  const { host, id } = newWorld();
  assert.equal(host.game.view(id).self.balance, ARRIVAL_FUNDS);
  assert.equal(host.game.view(id).journal.find((j) => j.id === 'funds').done, false, 'the arrival money is not earned');
  goToMould(host, id, 0);
  waitUntilOpen(host, id, 'yard');
  const yardBefore = host.game.view(id).yardBlocks;
  const first = ok(host.game.intent(id, { type: 'job.mould', stationId: 'mould-1' }));
  assert.equal(first.wage, 25);
  refused(host.game.intent(id, { type: 'job.mould', stationId: 'mould-1' }), 'TOO_FAST');
  refused(host.game.intent(id, { type: 'job.mould', stationId: 'mould-3' }), 'TOO_FAR');
  for (let i = 0; i < 9; i += 1) { run(host, 1.3); ok(host.game.intent(id, { type: 'job.mould', stationId: 'mould-1' })); }
  const view = host.game.view(id);
  assert.equal(view.self.balance, ARRIVAL_FUNDS + 250);
  assert.equal(view.journal.find((j) => j.id === 'funds').done, true, 'a first wage is earned');
  assert.ok(view.yardBlocks >= yardBefore + 10);
  assert.equal(view.self.energy, 80 - 20);
  const receipts = host.game.drain(id).filter((e) => e.type === 'receipt');
  assert.equal(receipts.length, 1);
  const rows = ok(host.game.intent(id, { type: 'wallet.history' })).rows;
  assert.equal(rows.length, 11, 'ten wages and the arrival money');
  assert.equal(rows.filter((r) => r.kind === 'issuance').length, 1);
  clean(host);
});

test('land: buying a plot moves money and title together, once', () => {
  const { host, id } = newWorld();
  const plot = zoneParcelByPlot('R-05');
  goToBoard(host, id, 'R-05');
  const inspected = ok(host.game.intent(id, { type: 'parcel.inspect', parcelId: plot.id }));
  assert.equal(inspected.parcel.total, 12_360);
  assert.equal(inspected.parcel.zoningName, 'Residential');
  goToService(host, id, 'registry');
  waitUntilOpen(host, id, 'registry');
  refused(host.game.intent(id, { type: 'registry.buy', parcelId: plot.id }), 'NL001');
  assert.equal(ok(host.game.intent(id, { type: 'registry.list' })).parcels.find((p) => p.id === plot.id).status, 'available');
  fund(host, id, 100_000);
  const bought = ok(host.game.intent(id, { type: 'registry.buy', parcelId: plot.id }));
  assert.match(bought.titleNo, /^AN\/OGB\/\d{5}$/);
  assert.equal(host.game.view(id).self.balance, ARRIVAL_FUNDS + 50_000 - 12_360);
  refused(host.game.intent(id, { type: 'registry.buy', parcelId: plot.id }), 'NOT_FOR_SALE');
  refused(host.game.intent(id, { type: 'registry.buy', parcelId: zoneParcelByPlot('R-03').id }), 'NOT_FOR_SALE');
  const record = ok(host.game.intent(id, { type: 'registry.list' })).parcels.find((p) => p.id === plot.id);
  assert.equal(record.yours, true);
  assert.equal(record.history.at(-1).type, 'sale');
  assert.equal(record.history.at(-1).txn, bought.txn);
  const state = ok(host.game.intent(id, { type: 'treasury.public', code: 'NG-AN' }));
  assert.equal(state.income, 12_360);
  clean(host);
});

test('law: a permit goes only to the owner and only for a use the zoning allows', () => {
  const { host, id } = newWorld();
  fund(host, id, 100_000);
  goToService(host, id, 'registry');
  waitUntilOpen(host, id, 'registry');
  const shopPlot = zoneParcelByPlot('C-04');
  ok(host.game.intent(id, { type: 'registry.buy', parcelId: shopPlot.id }));
  goToService(host, id, 'secretariat');
  waitUntilOpen(host, id, 'secretariat');
  refused(host.game.intent(id, { type: 'permit.apply', parcelId: shopPlot.id, design: 'house' }), 'ZONING');
  refused(host.game.intent(id, { type: 'permit.apply', parcelId: zoneParcelByPlot('R-01').id, design: 'house' }), 'NOT_OWNER');
  ok(host.game.intent(id, { type: 'permit.apply', parcelId: shopPlot.id, design: 'kiosk' }));
  refused(host.game.intent(id, { type: 'permit.apply', parcelId: shopPlot.id, design: 'kiosk' }), 'HAS_PERMIT');
  goToService(host, id, 'store');
  waitUntilOpen(host, id, 'store');
  refused(host.game.intent(id, { type: 'shop.buy', businessId: 'store', item: 'cement', qty: 2, parcelId: zoneParcelByPlot('R-01').id }), 'NO_DELIVERY_ADDRESS');
  clean(host);
});

test('the whole loop: from arriving with only the arrival money to a finished house', () => {
  const { host, id } = newWorld('Chiamaka Bello');
  const plot = zoneParcelByPlot('R-06');
  fund(host, id, 100_000);
  goToService(host, id, 'registry');
  waitUntilOpen(host, id, 'registry');
  ok(host.game.intent(id, { type: 'registry.buy', parcelId: plot.id }));
  goToService(host, id, 'secretariat');
  waitUntilOpen(host, id, 'secretariat');
  ok(host.game.intent(id, { type: 'permit.apply', parcelId: plot.id, design: 'house' }));

  goToWork(host, id, 'R-06');
  refused(host.game.intent(id, { type: 'site.work', parcelId: plot.id }), 'MATERIALS');

  goToService(host, id, 'yard');
  waitUntilOpen(host, id, 'yard');
  ok(host.game.intent(id, { type: 'shop.buy', businessId: 'yard', item: 'block', qty: 120, parcelId: plot.id }));
  goToService(host, id, 'store');
  waitUntilOpen(host, id, 'store');
  for (const [item, qty] of [['cement', 12], ['roofing', 1], ['doorset', 1], ['paint', 1]]) ok(host.game.intent(id, { type: 'shop.buy', businessId: 'store', item, qty, parcelId: plot.id }));
  goToService(host, id, 'kitchen');
  ok(host.game.intent(id, { type: 'eat' }));

  goToWork(host, id, 'R-06');
  run(host, 50, 1);     // deliveries take 30 game minutes
  const site = ok(host.game.intent(id, { type: 'site.view', parcelId: plot.id }));
  assert.equal(site.stock.block, 120);
  assert.deepEqual(site.current.short, {});

  let guard = 0;
  while (!host.game.view(id).sites.find((s) => s.parcelId === plot.id).complete) {
    guard += 1;
    assert.ok(guard < 400, 'construction should finish');
    run(host, 1.3);
    const result = host.game.intent(id, { type: 'site.work', parcelId: plot.id });
    if (result.ok) continue;
    if (result.code === 'RAIN') { waitUntilDry(host); continue; }
    if (result.code === 'TOO_TIRED') {
      goToService(host, id, 'kitchen');
      waitUntilOpen(host, id, 'kitchen', 30000);
      ok(host.game.intent(id, { type: 'eat' }));
      ok(host.game.intent(id, { type: 'eat' }));
      goToWork(host, id, 'R-06');
      continue;
    }
    assert.fail(`unexpected refusal ${result.code}: ${result.message}`);
  }

  const view = host.game.view(id);
  assert.ok(view.journal.every((step) => step.done), 'every milestone is reached');
  const property = ok(host.game.intent(id, { type: 'property.list' })).parcels[0];
  assert.equal(property.parcel.development, 'developed');
  assert.equal(property.site.site.complete, true);
  assert.deepEqual(property.site.stock, { block: 0, cement: 0, roofing: 0, doorset: 0, paint: 0 });
  assert.ok(property.parcel.history.some((h) => /completed/.test(h.detail)));
  // The finished walls are solid.
  host.tick(0.2);
  const me = host.game.view(id).self;
  assert.equal(zoneWalkable(plot.cx, plot.cz, host.game.structureBoxes()), false);
  assert.ok(zoneWalkable(me.x, me.z, host.game.structureBoxes()));
  ok(host.game.intent(id, { type: 'sleep' }));
  assert.equal(host.game.view(id).self.energy, 100);
  // Spending: 12,360 land + 1,500 permit + 6,900 blocks + 7,500 cement + 4,800 + 4,100 + 1,500 + meals.
  const spent = ARRIVAL_FUNDS + 50_000 - host.game.view(id).self.balance;
  assert.ok(spent >= 38_660 && spent < 42_000, `spent ${spent}`);
  clean(host);
});

test('labour for hire: the mason walks to the site, does one stage, and is paid in advance', () => {
  const { host, id } = newWorld();
  const plot = zoneParcelByPlot('R-10');
  fund(host, id, 100_000);
  goToService(host, id, 'registry');
  waitUntilOpen(host, id, 'registry');
  ok(host.game.intent(id, { type: 'registry.buy', parcelId: plot.id }));
  goToService(host, id, 'secretariat');
  waitUntilOpen(host, id, 'secretariat');
  ok(host.game.intent(id, { type: 'permit.apply', parcelId: plot.id, design: 'house' }));
  goToBoard(host, id, 'R-10');
  refused(host.game.intent(id, { type: 'site.hire', parcelId: plot.id }), 'MATERIALS');
  goToService(host, id, 'yard');
  ok(host.game.intent(id, { type: 'shop.buy', businessId: 'yard', item: 'block', qty: 30, parcelId: plot.id }));
  goToService(host, id, 'store');
  ok(host.game.intent(id, { type: 'shop.buy', businessId: 'store', item: 'cement', qty: 4, parcelId: plot.id }));
  goToBoard(host, id, 'R-10');
  run(host, 50, 1);
  const before = host.game.view(id).self.balance;
  const hired = ok(host.game.intent(id, { type: 'site.hire', parcelId: plot.id }));
  assert.equal(hired.fee, 6 * 120);
  assert.equal(host.game.view(id).self.balance, before - 720);
  refused(host.game.intent(id, { type: 'site.hire', parcelId: plot.id }), 'ALREADY_HIRED');
  host.tick(1);
  assert.equal(host.game.view(id).residents.find((r) => r.id === 'mason').mode, 'walking');
  let guard = 0;
  while (host.game.view(id).sites.find((s) => s.parcelId === plot.id).stage < 1) { guard += 1; assert.ok(guard < 3000, 'mason should finish'); host.tick(1); }
  host.tick(1);
  assert.equal(host.game.view(id).sites.find((s) => s.parcelId === plot.id).mason, false);
  assert.equal(host.game.view(id).self.energy, 80, 'the owner did none of the work');
  clean(host);
});

test('a living town: residents commute, are paid, eat and pay the levy; money and goods stay conserved', () => {
  const { host, id } = newWorld();
  const supply = host.auditor.supply().TR;
  const seenWalking = new Set();
  for (let i = 0; i < 2 * 86400 / 30; i += 1) {
    host.tick(1);
    if (i % 20 === 0) for (const r of host.game.view(id).residents) if (r.mode === 'walking') seenWalking.add(r.id);
  }
  assert.equal(host.game.view(id).clock.day, 3);
  assert.ok(seenWalking.size >= 14, `${seenWalking.size} residents were seen walking`);
  assert.ok(host.auditor.transactionCount() > 150);
  assert.ok(host.auditor.supply().TR <= supply, 'nothing is issued by daily life; imports retire currency');
  assert.equal(host.game.audit().missedPayments, 0);
  clean(host);
});

test('persistence: a saved world resumes exactly where it stopped', () => {
  const { host, id } = newWorld();
  fund(host, id, 100_000);
  goToService(host, id, 'registry');
  waitUntilOpen(host, id, 'registry');
  ok(host.game.intent(id, { type: 'registry.buy', parcelId: zoneParcelByPlot('R-08').id }));
  const saved = JSON.parse(JSON.stringify(host.save()));
  const resumed = createHost({ saved });
  assert.deepEqual(resumed.game.view(id), host.game.view(id));
  assert.equal(resumed.auditor.transactionCount(), host.auditor.transactionCount());
  for (let i = 0; i < 600; i += 1) { host.tick(1); resumed.tick(1); }
  assert.deepEqual(resumed.game.view(id), host.game.view(id), 'both copies evolve identically');
  assert.deepEqual(resumed.portal(id, 'summary'), host.portal(id, 'summary'));
  clean(resumed);
  assert.equal(createHost({ saved: { version: 1 } }).game.hasPlayer(id), false, 'an incompatible save is ignored');
});

// ----------------------------------------------------------------- vehicles --

const PARK_OUT = [[-20, 100], [-12, 113]];            // from the bays onto Waterside Road
const balanceOf = (host, account) => host.auditor.balance(account);

test('vehicles: bays, run points and the dealer are on ground a keke can stand on', () => {
  for (const bay of ZONE_VEHICLE_BAYS) assert.ok(vehicleFits('keke', bay.x, bay.z), `bay at ${bay.x}, ${bay.z}`);
  for (const t of ZONE_RUNS) {
    assert.ok(vehicleFits('keke', t.from.x, t.from.z), `pickup of ${t.id}`);
    assert.ok(vehicleFits('keke', t.to.x, t.to.z), `drop of ${t.id}`);
  }
  assert.equal(vehicleFits('keke', 21, 160), false, 'not on the jetty');
  assert.equal(vehicleFits('keke', 30, 6), false, 'not inside the store');
  const { host, id } = newWorld();
  const fleet = host.game.view(id).vehicles;
  assert.equal(fleet.length, 2);
  for (const v of fleet) { assert.match(v.plate, /^OGB \d{3} AN$/); assert.equal(v.yours, false); }
});

test('vehicles: hiring a keke, driving it, and the checks on every step', () => {
  const { host, id } = newWorld();
  fund(host, id, 10_000);
  goToService(host, id, 'park');
  waitUntilOpen(host, id, 'park');
  const keke = host.game.view(id).vehicles[0];
  walkTo(host, id, keke.x + 2.4, keke.z + 2.4);
  refused(host.game.intent(id, { type: 'vehicle.enter', vehicleId: keke.id }), 'NOT_YOURS');
  goToService(host, id, 'park');
  const dealer = host.game.internals.economy.accounts.resident('rider');
  const before = balanceOf(host, dealer);
  const hired = ok(host.game.intent(id, { type: 'vehicle.hire' }));
  assert.equal(hired.fee, VEHICLE_KINDS.keke.hirePerDay);
  assert.equal(balanceOf(host, dealer) - before, hired.fee);
  refused(host.game.intent(id, { type: 'vehicle.hire' }), 'ALREADY_HIRED');
  const mine = hired.vehicle;
  refused(host.game.intent(id, { type: 'vehicle.enter', vehicleId: mine.id }), 'TOO_FAR');
  // a parked vehicle is an obstacle to someone on foot
  walkTo(host, id, mine.x + 2.2, mine.z + 2.2);
  run(host, 1);
  refused(host.game.intent(id, { type: 'move', x: mine.x + 0.3, z: mine.z + 0.3, heading: 0, run: false }), 'BLOCKED');
  ok(host.game.intent(id, { type: 'vehicle.enter', vehicleId: mine.id }));
  refused(host.game.intent(id, { type: 'move', x: mine.x + 1, z: mine.z, heading: 0, run: false }), 'DRIVING');
  refused(host.game.intent(id, { type: 'job.info' }), 'DRIVING');
  // too far in one step, and into another vehicle
  run(host, 1);
  refused(host.game.intent(id, { type: 'vehicle.drive', x: mine.x + 40, z: mine.z, heading: 0 }), 'TOO_FAST');
  const other = host.game.view(id).vehicles.find((v) => v.id !== mine.id);
  let bumped = null;
  for (let i = 0; i < 60 && !bumped; i += 1) {
    host.tick(0.1);
    const c = host.game.view(id).self.driving;
    const gap = Math.hypot(other.x - c.x, other.z - c.z);
    const r = host.game.intent(id, { type: 'vehicle.drive', x: c.x + ((other.x - c.x) / gap) * 0.4, z: c.z + ((other.z - c.z) / gap) * 0.4, heading: 0 });
    if (!r.ok) bumped = r;
  }
  assert.equal(bumped.code, 'BLOCKED', 'one vehicle cannot drive through another');
  const fuelBefore = host.game.view(id).self.driving.fuel;
  driveTo(host, id, [...PARK_OUT, [0, 113], [0, 22], [22, 20]]);
  const car = host.game.view(id).self.driving;
  assert.ok(Math.hypot(car.x - 22, car.z - 20) < 0.1);
  assert.ok(car.fuel < fuelBefore, 'fuel is used');
  const me = host.game.view(id).self;
  assert.ok(Math.abs(me.x - car.x) < 1e-9 && Math.abs(me.z - car.z) < 1e-9, 'the driver moves with the vehicle');
  // into a wall
  let blocked = null;
  for (let i = 0; i < 80 && !blocked; i += 1) { host.tick(0.1); const c = host.game.view(id).self.driving; const r = host.game.intent(id, { type: 'vehicle.drive', x: c.x + 0.3, z: c.z - 0.4, heading: 2.5 }); if (!r.ok) blocked = r; }
  assert.equal(blocked.code, 'BLOCKED');
  const out = ok(host.game.intent(id, { type: 'vehicle.exit' }));
  assert.ok(zoneWalkable(out.x, out.z));
  refused(host.game.intent(id, { type: 'vehicle.drive', x: 0, z: 0, heading: 0 }), 'NOT_DRIVING');
  // the hire ends at six the next morning and the keke goes back to its bay
  host.game.advance(24 * 3600);
  const after = host.game.view(id).vehicles.find((v) => v.id === mine.id);
  assert.equal(after.yours, false);
  assert.ok(Math.hypot(after.x - ZONE_VEHICLE_BAYS[0].x, after.z - ZONE_VEHICLE_BAYS[0].z) < 0.01 || Math.hypot(after.x - ZONE_VEHICLE_BAYS[1].x, after.z - ZONE_VEHICLE_BAYS[1].z) < 0.01);
  clean(host);
});

test('vehicles: buying one pays the dealer and the State, registers it, and retires the import cost', () => {
  const { host, id } = newWorld();
  fund(host, id, 200_000);
  goToService(host, id, 'park');
  waitUntilOpen(host, id, 'park');
  const k = VEHICLE_KINDS.keke;
  const state = host.game.internals.economy.accounts.government('NG-AN');
  const stateBefore = balanceOf(host, state);
  const supplyBefore = host.auditor.supply().TR;
  const mineBefore = host.game.view(id).self.balance;
  const bought = ok(host.game.intent(id, { type: 'vehicle.buy' }));
  assert.equal(bought.total, k.price + k.registration);
  assert.equal(mineBefore - host.game.view(id).self.balance, k.price + k.registration);
  assert.equal(balanceOf(host, state) - stateBefore, k.registration);
  assert.equal(supplyBefore - host.auditor.supply().TR, Math.round(k.price * k.importShare), 'the maker is outside the world: that money is retired');
  assert.match(bought.vehicle.plate, /^OGB 003 AN$/);
  assert.equal(bought.vehicle.owned, true);
  assert.deepEqual(host.game.audit().vehicles, { count: 3, expected: 3 });
  // petrol
  const fuel = ok(host.game.intent(id, { type: 'vehicle.refuel', vehicleId: bought.vehicle.id, litres: 2 }));
  assert.equal(fuel.cost, 2 * FUEL.price);
  assert.equal(ok(host.game.intent(id, { type: 'vehicle.refuel', vehicleId: bought.vehicle.id, litres: 99 })).fuel, k.tank, 'a large order only fills the tank');
  refused(host.game.intent(id, { type: 'vehicle.refuel', vehicleId: bought.vehicle.id, litres: 1 }), 'TANK_FULL');
  // an owned vehicle is still the owner's the next day
  host.game.advance(26 * 3600);
  assert.equal(host.game.view(id).vehicles.find((v) => v.id === bought.vehicle.id).yours, true);
  clean(host);
});

test('vehicles: carrying your own materials home instead of paying for delivery', () => {
  const { host, id } = newWorld();
  fund(host, id, 120_000);
  goToService(host, id, 'registry');
  waitUntilOpen(host, id, 'registry');
  const plot = zoneParcelByPlot('R-06');
  ok(host.game.intent(id, { type: 'registry.buy', parcelId: plot.id }));
  goToService(host, id, 'park');
  const keke = ok(host.game.intent(id, { type: 'vehicle.hire' })).vehicle;
  walkTo(host, id, keke.x + 2.2, keke.z + 2.2);
  ok(host.game.intent(id, { type: 'vehicle.enter', vehicleId: keke.id }));
  driveTo(host, id, [...PARK_OUT, [0, 113], [0, 22], [22, 20]]);
  ok(host.game.intent(id, { type: 'vehicle.exit' }));
  goToService(host, id, 'store');
  const list = ok(host.game.intent(id, { type: 'shop.catalogue', businessId: 'store' }));
  assert.equal(list.carriers.length, 1);
  assert.equal(list.carriers[0].free, VEHICLE_KINDS.keke.capacity);
  refused(host.game.intent(id, { type: 'shop.buy', businessId: 'store', item: 'cement', qty: 20, carry: keke.id }), 'TOO_HEAVY');
  const before = host.game.view(id).self.balance;
  const paid = ok(host.game.intent(id, { type: 'shop.buy', businessId: 'store', item: 'cement', qty: 6, carry: keke.id }));
  assert.equal(paid.total, 6 * 600, 'no delivery charge');
  assert.equal(before - host.game.view(id).self.balance, 3600);
  refused(host.game.intent(id, { type: 'shop.buy', businessId: 'store', item: 'roofing', qty: 1, carry: keke.id }), 'TOO_HEAVY');
  const car0 = host.game.view(id).vehicles.find((v) => v.id === keke.id);
  walkTo(host, id, car0.x + 2.2, car0.z + 2.2);
  ok(host.game.intent(id, { type: 'vehicle.enter', vehicleId: keke.id }));
  assert.deepEqual(host.game.view(id).self.driving.cargo, { cement: 6 });
  refused(host.game.intent(id, { type: 'vehicle.unload', vehicleId: keke.id, parcelId: plot.id }), 'TOO_FAR');
  refused(host.game.intent(id, { type: 'vehicle.unload', vehicleId: keke.id, parcelId: zoneParcelByPlot('R-01').id }), 'NOT_OWNER');
  driveTo(host, id, [[0, 22], [0, -141], [plot.cx, -141]]);
  const down = ok(host.game.intent(id, { type: 'vehicle.unload', vehicleId: keke.id, parcelId: plot.id }));
  assert.deepEqual(down.moved, { cement: 6 });
  assert.equal(ok(host.game.intent(id, { type: 'vehicle.exit' })).x !== undefined, true);
  walkTo(host, id, plot.cx, -143);
  assert.equal(ok(host.game.intent(id, { type: 'site.view', parcelId: plot.id })).stock.cement, 6);
  clean(host);
});

test('vehicles: a delivery run is paid by the one who needed it, and an untaken run goes to the dealer', () => {
  const { host, id } = newWorld();
  fund(host, id, 10_000);
  const runs = ok(host.game.intent(id, { type: 'run.list' }));
  assert.equal(runs.hasVehicle, false);
  const fish = runs.open.find((r) => r.what.includes('fish'));
  assert.ok(fish, 'the morning fish run is posted');
  refused(host.game.intent(id, { type: 'run.accept', runId: fish.id }), 'NO_VEHICLE');
  goToService(host, id, 'park');
  waitUntilOpen(host, id, 'park');
  const keke = ok(host.game.intent(id, { type: 'vehicle.hire' })).vehicle;
  ok(host.game.intent(id, { type: 'run.accept', runId: fish.id }));
  refused(host.game.intent(id, { type: 'run.load' }), 'TOO_FAR');
  walkTo(host, id, keke.x + 2.2, keke.z + 2.2);
  ok(host.game.intent(id, { type: 'vehicle.enter', vehicleId: keke.id }));
  driveTo(host, id, [...PARK_OUT, [21, 113], [21, 125]]);
  refused(host.game.intent(id, { type: 'run.deliver' }), 'NO_RUN');
  ok(host.game.intent(id, { type: 'run.load' }));
  assert.equal(host.game.view(id).self.run.state, 'loaded');
  refused(host.game.intent(id, { type: 'run.deliver' }), 'TOO_FAR');
  driveTo(host, id, [[21, 113], [0, 113], [0, 22], [60, 20]]);
  const kitchen = host.game.internals.economy.accounts.business('kitchen');
  const kitchenBefore = balanceOf(host, kitchen);
  const mineBefore = host.game.view(id).self.balance;
  const paid = ok(host.game.intent(id, { type: 'run.deliver' }));
  assert.equal(paid.fee, 180);
  assert.equal(host.game.view(id).self.balance - mineBefore, 180);
  assert.equal(kitchenBefore - balanceOf(host, kitchen), 180);
  assert.equal(host.game.view(id).self.run, null);
  refused(host.game.intent(id, { type: 'run.deliver' }), 'NO_RUN');
  // Nobody takes the later runs: the dealer does them and is paid instead.
  ok(host.game.intent(id, { type: 'vehicle.exit' }));
  const dealer = host.game.internals.economy.accounts.resident('rider');
  const dealerBefore = balanceOf(host, dealer);
  host.game.advance(4 * 3600);
  assert.ok(balanceOf(host, dealer) > dealerBefore, 'the dealer was paid for runs nobody took');
  assert.equal(host.game.state.vehicles.runs.filter((r) => r.state === 'npc').length >= 2, true);
  clean(host);
});

test('swimming: in from the bank, through the water at a swimmer\'s pace, nothing else in the water, and out again', async () => {
  const { SWIM } = await import('../src/sim/sim.js');
  const { zoneShoreZ, zoneSwimmable, zoneWalkable } = await import('../src/sim/zone.js');
  const { host, id } = newWorld();
  const g = host.game;
  const p = g.state.players[id];
  // too far from the water to go in
  p.x = -60; p.z = 100;
  refused(g.intent(id, { type: 'swim.in' }), 'TOO_FAR');
  // at the bank: the view says the water is near, and in they go
  const x = -60, bank = zoneShoreZ(x);
  p.x = x; p.z = bank - 1.5; p.lastMoveAt = g.state.real;
  assert.ok(zoneWalkable(p.x, p.z));
  assert.equal(g.view(id).self.byWater, true);
  ok(g.intent(id, { type: 'swim.in' }));
  assert.ok(zoneSwimmable(p.x, p.z), 'they are in the water');
  assert.ok(g.view(id).self.swimming);
  // nothing else in the water: no keke, no fight
  refused(g.intent(id, { type: 'vehicle.hire' }), 'SWIMMING');
  // a swimmer is slower than a walker
  host.tick(0.5);
  refused(g.intent(id, { type: 'move', x: p.x, z: p.z + SWIM.fast * 0.62 * 1.15 + 0.3, heading: 0, run: true }), 'TOO_FAST');
  for (let k = 0; k < 20; k += 1) { host.tick(0.1); ok(g.intent(id, { type: 'move', x: p.x, z: p.z + SWIM.speed * 0.1, heading: 0 })); }
  // too far out to climb onto the bank; swim back, and out
  refused(g.intent(id, { type: 'swim.out' }), 'TOO_FAR');
  for (let k = 0; k < 60 && -(zoneShoreZ(p.x) - p.z) > SWIM.outReach - 0.3; k += 1) { host.tick(0.1); ok(g.intent(id, { type: 'move', x: p.x, z: p.z - SWIM.speed * 0.1, heading: Math.PI })); }
  ok(g.intent(id, { type: 'swim.out' }));
  assert.ok(zoneWalkable(p.x, p.z) && !g.view(id).self.swimming, 'on the bank again');
});

test('a skill: the body only. Another player sees it; it hurts nobody; walking off ends it; not in a fight or a vehicle', () => {
  const host = createHost();
  const g = host.game;
  const a = g.join({ name: 'Ada Dancer', look: {} }), b = g.join({ name: 'Bayo Watching', look: {} });
  const A = g.state.players[a], B = g.state.players[b];
  B.x = A.x + 2; B.z = A.z; B.lastMoveAt = g.state.real;
  const before = { health: B.health, balance: g.view(b).self.balance, crimes: g.audit().justice.crimes };
  refused(g.intent(a, { type: 'emote', name: '<script>' }), 'BAD_SKILL');
  ok(g.intent(a, { type: 'emote', name: 'front_kick_02.001' }));
  assert.deepEqual(g.view(b).others[a].emote.name, 'front_kick_02.001', 'the other player sees it');
  assert.equal(B.health, before.health, 'a kick played as a skill touches nobody');
  assert.equal(g.view(b).self.balance, before.balance);
  assert.equal(g.audit().justice.crimes, before.crimes, 'and is no offence');
  // walking off ends it
  host.tick(0.2);
  ok(g.intent(a, { type: 'move', x: A.x - 0.2, z: A.z, heading: 0 }));
  assert.equal(g.view(b).others[a].emote, null);
});
