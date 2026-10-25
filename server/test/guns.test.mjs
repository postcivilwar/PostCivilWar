// The guns on the website's server (api/_lib/guns.js): the starter rifle every account has, free; rounds counted a shot
// at a time; reloads that take their time; the rate of fire; guns bought only with earned TR, once; and one player's
// round hitting another only when this server agrees, never through a wall, never twice, never on someone at 20.
//   server/with-postgres.sh node --test --test-concurrency=1 server/test/guns.test.mjs
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { newPlayer, earn, uuid, closeDatabase, database, ZONE } from './harness.mjs';

const require = createRequire(import.meta.url);
const guns = require('../../api/_lib/guns.js');
const WALLS = require('../../api/_lib/walls.json');
const { GUNS, GUN, STARTER } = guns;
const R = GUNS.rifle;
const GAP = 60 / R.rpm;

after(() => closeDatabase());

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
// a clear line on the ground, west to east, `metres` long: [x, z]
function openLine(metres = 12) {
  for (let x = -200; x <= 200; x += 7) for (let z = -300; z <= 100; z += 7) if (!guns.wallBetween(x - 4, z, x + metres + 4, z) && !guns.wallBetween(x - 4, z - 1, x + metres + 4, z - 1) && !guns.wallBetween(x - 4, z + 1, x + metres + 4, z + 1)) return [x, z];
  throw new Error('no open line');
}
// a player's state for presence, as their game writes it
const state = (x, z, more = {}) => ({ v: 1, zn: ZONE, n: 'x', x, z, h: Math.PI / 2, lg: 'en', lk: { s: 1, t: 1, b: 1, f: 0 }, hp: 100, gn: ['rifle', 1, 0, -1, 0, 0], vl: [0, 0], ...more });
const here = async (p, x, z, more = {}, extra = {}) => p.ok('presence', { zone: ZONE, state: state(x, z, more), ...extra });
let session = 0;
// shots from a muzzle at (x, 1.4, z), east, `t` seconds apart by the session's clock; `hit`: a claim on someone
function shots(from, x, z, n, { t0 = 1, gap = GAP * 1.02, hit = null, gun = 'rifle', dir = [1, 0, 0] } = {}) {
  return Array.from({ length: n }, (_, k) => [from + k, t0 + k * gap, gun, [x + 0.6, 1.4, z], dir, ...(hit ? [hit(k)] : [])]);
}
const sid = () => `test-session-${(session += 1)}-${Math.random().toString(36).slice(2, 8)}`;
const wallet = async (p) => (await p.ok('wallet.get')).wallet;
const idOf = async (p, x, z, of) => { const peers = (await here(p, x, z)).peers; const found = peers.find((q) => q.state && q.state.n === of.username); assert.ok(found, 'seen'); return found.id; };

test('every account has the rifle from the start, free: 30 in it, 120 spare, in hand; nothing is taken from the wallet', async () => {
  const a = await newPlayer('Gunner');
  const before = await wallet(a);
  const g = (await a.ok('gun.state')).gun;
  assert.equal(g.equipped, STARTER);
  const rifle = g.guns.find((x) => x.id === 'rifle');
  assert.deepEqual([rifle.owned, rifle.mag, rifle.spare, rifle.starter, rifle.forSale, rifle.price], [true, 30, 120, true, false, 0]);
  assert.deepEqual((await wallet(a)).balance, before.balance, 'not a TR taken');
  // asked again, the same: one rifle, not two
  const sql = await database();
  const rows = await sql.unsafe(`select count(*)::int as n from pcw.gun_owned o join pcw.accounts a on a.id = o.account_id where a.username_key = $1`, [a.username.toLowerCase()]);
  await a.ok('gun.state');
  assert.equal(rows[0].n, 1);
});

test('only a gun owned can be taken in hand, and the starter is never sold', async () => {
  const a = await newPlayer('Owner');
  assert.equal((await a.call('gun.equip', { gun: 'cannon' })).body.code, 'NO_GUN');
  assert.equal((await a.call('gun.buy', { gun: 'rifle', key: uuid(), price: 0 })).body.code, 'NOT_FOR_SALE');
  assert.equal((await a.call('gun.buy', { gun: 'cannon', key: uuid(), price: 10 })).body.code, 'NO_GUN');
  assert.equal((await a.ok('gun.equip', { gun: 'rifle' })).gun.equipped, 'rifle');
});

test('a gun for sale is bought with earned TR only, to the town, once however often it is asked', async () => {
  const sql = await database();
  // (none is for sale yet: the owner sends the guns and their prices; the shop is tried here with one of its own)
  const catalog = { ...GUNS, practice: { id: 'practice', name: 'Practice Gun', starter: false, forSale: true, price: 300, magazine: 12, spare: 48, rpm: 300, reload: 1.8, range: 60 } };
  const as = async (p) => { const rows = await sql.unsafe(`select id, username from pcw.accounts where username_key = $1`, [p.username.toLowerCase()]); return { id: rows[0].id, username: rows[0].username }; };
  const a = await newPlayer('Buyer');
  const me = await as(a);
  // only starter TR: refused, and nothing taken
  const key = uuid();
  await assert.rejects(guns.buy(sql, me, { gun: 'practice', key, price: 300 }, catalog), (e) => e.code === 'STARTER_FUNDS');
  // the price as it is now, or nothing
  await earn(a, 1000 * 2);
  await assert.rejects(guns.buy(sql, me, { gun: 'practice', key, price: 250 }, catalog), (e) => e.code === 'QUOTE_CHANGED');
  const before = await wallet(a);
  const bought = await guns.buy(sql, me, { gun: 'practice', key, price: 300 }, catalog);
  assert.equal(bought.bought.replayed, false);
  const now = await wallet(a);
  assert.equal(before.balance - now.balance, 300 * 2, '300 TR');
  assert.equal(before.starter, now.starter, 'not a TR of the arrival money');
  const owned = await sql.unsafe(`select gun, mag, spare, how from pcw.gun_owned where account_id = $1 order by gun`, [me.id]);
  assert.deepEqual(owned.map((r) => [r.gun, r.mag, r.spare, r.how]), [['practice', 12, 48, 'bought'], ['rifle', 30, 120, 'starter']]);
  // asked again with the same key: the same answer, paid once
  const again = await guns.buy(sql, me, { gun: 'practice', key, price: 300 }, catalog);
  assert.equal(again.bought.replayed, true);
  assert.equal((await wallet(a)).balance, now.balance);
  // and with another: they have it already
  await assert.rejects(guns.buy(sql, me, { gun: 'practice', key: uuid(), price: 300 }, catalog), (e) => e.code === 'OWNED');
});

test('rounds are counted on the server, a shot at a time; a shot sent twice is counted once; an empty gun fires nothing', async () => {
  const a = await newPlayer('Counter');
  const [x, z] = openLine();
  await a.ok('gun.state');
  const s = sid();
  const first = (await here(a, x, z, {}, { fire: { sid: s, s: shots(1, x, z, 10) }, ack: 0 })).fire;
  assert.equal(first.ok.length, 10);
  assert.equal(first.mag, 20);
  // the same shots again (a reply lost, asked again): nothing more
  const twice = (await here(a, x, z, {}, { fire: { sid: s, s: shots(1, x, z, 10) }, ack: 0 })).fire;
  assert.deepEqual([twice.ok.length, twice.no.length, twice.mag], [0, 0, 20]);
  // the rest of the magazine (a moment later, as a gun is fired), then nothing
  await sleep(800);
  const rest = (await here(a, x, z, {}, { fire: { sid: s, s: shots(11, x, z, 22, { t0: 1 + 10 * GAP * 1.02 }) }, ack: 0 })).fire;
  assert.equal(rest.ok.length, 20);
  assert.equal(rest.mag, 0);
  assert.ok(rest.no.slice(0, 2).every(([, code]) => code === 'EMPTY'));
  assert.equal((await a.ok('gun.state')).gun.guns.find((g) => g.id === 'rifle').mag, 0);
});

test('a reload moves rounds from the spare and takes its time, and nothing fires meanwhile', async () => {
  const a = await newPlayer('Reloader');
  const [x, z] = openLine();
  await a.ok('gun.state');
  assert.equal((await a.call('gun.reload', {})).body.code, 'FULL');
  const s = sid();
  await here(a, x, z, {}, { fire: { sid: s, s: shots(1, x, z, 8) }, ack: 0 });
  const r = await a.ok('gun.reload', {});
  assert.equal(r.moved, 8);
  assert.deepEqual([r.gun.guns[0].mag, r.gun.guns[0].spare], [30, 112]);
  assert.equal((await a.call('gun.reload', {})).body.code, 'NOT_READY', 'not twice');
  const during = (await here(a, x, z, {}, { fire: { sid: s, s: shots(9, x, z, 1, { t0: 5 }) }, ack: 0 })).fire;
  assert.deepEqual(during.no, [[9, 'RELOADING']]);
  await sleep((R.reload - guns.SLACK.reload) * 1000 + 300);
  const afterwards = (await here(a, x, z, {}, { fire: { sid: s, s: shots(10, x, z, 1, { t0: 9 }) }, ack: 0 })).fire;
  assert.deepEqual([afterwards.ok, afterwards.mag], [[10], 29]);
});

test('a reload told with the rounds is counted in its place among them, however late the word comes; once; and the rounds after it wait for its time', async () => {
  const a = await newPlayer('InOrder');
  const [x, z] = openLine();
  await a.ok('gun.state');
  const s = sid();
  const all = shots(1, x, z, 20);
  const t20 = all[19][1];
  const one = (await here(a, x, z, {}, { fire: { sid: s, s: all.slice(0, 10) }, ack: 0 })).fire;
  assert.equal(one.mag, 20);
  await sleep(900);
  // the late word: rounds 11 to 20, then the reload done after round 20 (begun at t20 + 0.2 by the session's clock),
  // then round 21, fired once the reload was done: counted in that order (a reload counted before rounds 11 to 20
  // would have left 10 in the gun and moved only 10)
  const after = shots(21, x, z, 1, { t0: t20 + 0.2 + R.reload });
  const word = { sid: s, s: [...all.slice(10), ...after], r: [[20, t20 + 0.2, 'rifle']] };
  const two = (await here(a, x, z, {}, { fire: word, ack: 0 })).fire;
  assert.deepEqual(two.r, [[20, 'ok']]);
  assert.deepEqual(two.ok, [11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21]);
  assert.deepEqual([two.mag, two.spare], [29, 100], 'as the game has it: 21 fired, 20 moved in after the twentieth');
  // the same word again (its answer lost): nothing counted twice
  const again = (await here(a, x, z, {}, { fire: word, ack: 0 })).fire;
  assert.deepEqual([again.r, again.ok, again.mag, again.spare], [[[20, 'ok']], [], 29, 100]);
  // a round fired before the reload's time is up, by the session's clock, is refused; a reload with the gun full too
  const b = await newPlayer('Early');
  await b.ok('gun.state');
  const s2 = sid();
  const five = shots(1, x, z, 5);
  const t5 = five[4][1];
  const early = (await here(b, x, z, {}, { fire: { sid: s2, s: [...five, ...shots(6, x, z, 1, { t0: t5 + 0.6 })], r: [[5, t5 + 0.1, 'rifle']] }, ack: 0 })).fire;
  assert.deepEqual(early.r, [[5, 'ok']]);
  assert.deepEqual(early.no, [[6, 'RELOADING']]);
  assert.deepEqual([early.mag, early.spare], [30, 115]);
  const full = (await here(b, x, z, {}, { fire: { sid: s2, s: [], r: [[6, t5 + 9, 'rifle']] }, ack: 0 })).fire;
  assert.deepEqual(full.r, [[6, 'FULL']]);
});

test('no faster than the gun fires: shots too close together, or too many at once, are refused', async () => {
  const a = await newPlayer('Rapid');
  const [x, z] = openLine();
  await a.ok('gun.state');
  const quick = (await here(a, x, z, {}, { fire: { sid: sid(), s: shots(1, x, z, 12, { gap: GAP * 0.4 }) }, ack: 0 })).fire;
  assert.ok(quick.no.filter(([, code]) => code === 'RATE').length >= 5, `refused: ${JSON.stringify(quick.no)}`);
  // spaced by the session's clock, but all at once, far more than the gun could have fired in the time: refused
  const b = await newPlayer('Burst');
  await b.ok('gun.state');
  const sql = await database();
  await sql.unsafe(`update pcw.gun_state s set bucket = 0, bucket_at = now() from pcw.accounts a where a.id = s.account_id and a.username_key = $1`, [b.username.toLowerCase()]);
  const burst = (await here(b, x, z, {}, { fire: { sid: sid(), s: shots(1, x, z, 24) }, ack: 0 })).fire;
  assert.ok(burst.ok.length <= 2, `fired ${burst.ok.length} at once from a standing start`);
  assert.ok(burst.no.some(([, code]) => code === 'RATE'));
});

test('a hit on another player is the server\'s to say: told to them once, taken once, the owner\'s one point', async () => {
  const a = await newPlayer('Shooter');
  const b = await newPlayer('Target');
  const [x, z] = openLine();
  await a.ok('gun.state');
  await here(b, x + 10, z, { gn: null });
  const who = await idOf(a, x, z, b);
  const s = sid();
  const at = [x + 10 - 0.25, 1.3, z];
  const d = [at[0] - (x + 0.6), at[1] - 1.4, at[2] - z]; const len = Math.hypot(...d);
  const fired = (await here(a, x, z, {}, { fire: { sid: s, s: [[1, 1, 'rifle', [x + 0.6, 1.4, z], d.map((k) => k / len), { who, at, w: [3, 0.01, 0.12, 0.08] }]] }, ack: 0 })).fire;
  assert.deepEqual(fired.ok, [1]);
  assert.equal(fired.hit.length, 1);
  assert.equal(fired.hit[0][1], who);
  // the one hit is told, with the owner's one point, where, and the wound
  const told = (await here(b, x + 10, z, { gn: null }, { ack: 0 })).struck;
  assert.equal(told.length, 1);
  assert.deepEqual([told[0].dmg, told[0].name, told[0].at, told[0].w], [GUN.damage, a.username, at.map((k) => Math.round(k * 100) / 100), [3, 0.01, 0.12, 0.08]]);
  // not taken yet (no word back): told again; taken: never again
  assert.equal((await here(b, x + 10, z, { gn: null }, { ack: 0 })).struck.length, 1);
  assert.equal((await here(b, x + 10, z, { gn: null }, { ack: told[0].id })).struck.length, 0);
  // the same shot sent again: no second hit
  const again = (await here(a, x, z, {}, { fire: { sid: s, s: [[1, 1, 'rifle', [x + 0.6, 1.4, z], d.map((k) => k / len), { who, at }]] }, ack: 0 })).fire;
  assert.deepEqual([again.ok, again.hit], [[], []]);
  assert.equal((await here(b, x + 10, z, { gn: null }, { ack: told[0].id })).struck.length, 0);
});

test('no hit through a wall, on someone not where they are, off the line it was fired along, or on someone at 20', async () => {
  const a = await newPlayer('Cheat');
  const b = await newPlayer('Behind');
  await a.ok('gun.state');
  // a wall with open ground on both sides of it
  const wall = WALLS.boxes.find((w) => w[2] - w[0] > 2 && w[2] - w[0] < 30 && w[3] - w[1] > 2 && !guns.wallBetween(w[0] - 6, (w[1] + w[3]) / 2, w[0] - 1, (w[1] + w[3]) / 2) && !guns.wallBetween(w[2] + 1, (w[1] + w[3]) / 2, w[2] + 6, (w[1] + w[3]) / 2));
  const zc = (wall[1] + wall[3]) / 2, ax = wall[0] - 4, bx = wall[2] + 3;
  await here(b, bx, zc, { gn: null });
  const who = await idOf(a, ax, zc, b);
  const aim = (at) => { const d = [at[0] - (ax + 0.6), at[1] - 1.4, at[2] - zc]; const len = Math.hypot(...d); return d.map((k) => k / len); };
  const through = [bx - 0.3, 1.3, zc];
  const s = sid();
  const r1 = (await here(a, ax, zc, {}, { fire: { sid: s, s: [[1, 1, 'rifle', [ax + 0.6, 1.4, zc], aim(through), { who, at: through }]] }, ack: 0 })).fire;
  assert.deepEqual([r1.ok, r1.hit, r1.no], [[1], [], [[1, 'WALL']]], 'fired (a round spent), but no hit through the wall');
  // in the open: someone said to be hit 6 m from where they are
  const [x, z] = openLine();
  await here(b, x + 10, z, { gn: null });
  const far = [x + 4, 1.3, z];
  const r2 = (await here(a, x, z, {}, { fire: { sid: s, s: [[2, 1 + GAP * 2, 'rifle', [x + 0.6, 1.4, z], [1, 0, 0], { who, at: far }]] }, ack: 0 })).fire;
  assert.deepEqual(r2.no, [[2, 'NOT_THERE']]);
  // where they are, but the round was fired the other way
  const on = [x + 9.7, 1.3, z];
  const r3 = (await here(a, x, z, {}, { fire: { sid: s, s: [[3, 1 + GAP * 4, 'rifle', [x + 0.6, 1.4, z], [0, 0, 1], { who, at: on }]] }, ack: 0 })).fire;
  assert.deepEqual(r3.no, [[3, 'OFF_LINE']]);
  // at 20: nobody can shoot them
  await here(b, x + 10, z, { gn: null, hp: 20 });
  const d = [on[0] - (x + 0.6), on[1] - 1.4, 0]; const len = Math.hypot(...d);
  const r4 = (await here(a, x, z, {}, { fire: { sid: s, s: [[4, 1 + GAP * 6, 'rifle', [x + 0.6, 1.4, z], d.map((k) => k / len), { who, at: on }]] }, ack: 0 })).fire;
  assert.deepEqual(r4.no, [[4, 'NOT_A_TARGET']]);
  assert.equal((await here(b, x + 10, z, { gn: null, hp: 20 }, { ack: 0 })).struck.length, 0, 'told of nothing');
});

test('nobody fires from a vehicle, at 20, or without a gun in hand; and the rounds are topped up once a day', async () => {
  const a = await newPlayer('Rules');
  const [x, z] = openLine();
  await a.ok('gun.state');
  for (const more of [{ vh: { k: 'okada' } }, { hp: 20 }, { gn: null }, { sw: 1 }, { hd: 1 }]) {
    const r = (await here(a, x, z, more, { fire: { sid: sid(), s: shots(1, x, z, 1) }, ack: 0 })).fire;
    assert.deepEqual(r.no, [[1, 'CANNOT']], JSON.stringify(more));
    await new Promise((done) => setTimeout(done, 3100));       // (a new session is taken no more often than every few seconds)
  }
  // a day goes by
  const sql = await database();
  await sql.unsafe(`update pcw.gun_owned o set mag = 3, spare = 7, topped = topped - 1 from pcw.accounts a where a.id = o.account_id and a.username_key = $1`, [a.username.toLowerCase()]);
  const g = (await a.ok('gun.state')).gun.guns.find((x2) => x2.id === 'rifle');
  assert.deepEqual([g.mag, g.spare], [R.magazine, R.spare]);
});

test('a game that knows nothing of guns is answered as before', async () => {
  const a = await newPlayer('Older');
  const [x, z] = openLine();
  const r = await a.ok('presence', { zone: ZONE, state: { v: 1, zn: ZONE, n: 'x', x, z, h: 0, lg: 'en', lk: { s: 1, t: 1, b: 1, f: 0 } } });
  assert.deepEqual(Object.keys(r).sort(), ['ok', 'peers']);
});
