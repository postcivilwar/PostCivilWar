// Voice chat between players on the website's server (api/_lib/voice.js, 29 October 2026): the handshakes passed from
// one player's game to another's with their words about where they are, only between players near each other who
// both have voice on and are allowed it; the age said once; blocks both ways; reports; an administrator's warnings
// and bans; the relay's password made here, the key never sent.
//   server/with-postgres.sh node --test --test-concurrency=1 server/test/voice.test.mjs
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { newPlayer, closeDatabase, database, ZONE, person } from './harness.mjs';

const require = createRequire(import.meta.url);
const voice = require('../../api/_lib/voice.js');

after(() => closeDatabase());

const state = (x, z, vc = 1) => ({ v: 1, zn: ZONE, n: 'x', x, z, h: 0, lg: 'en', lk: { s: 1, t: 1, b: 1, f: 0 }, ...(vc ? { vc: 1 } : {}) });
const say = (p, x, z, word, vc = 1) => p.ok('presence', { zone: ZONE, state: state(x, z, vc), voice: word });
async function adult(prefix) { const p = await newPlayer(prefix); await p.ok('voice.age', { adult: true }); return p; }
async function admin() {
  const boss = await newPlayer('Boss');
  await (await database()).unsafe(`update pcw.accounts set role = 'admin' where username_key = $1`, [boss.username.toLowerCase()]);
  return boss;
}
// two adults in voice chat, near each other: their ids as each other's game knows them
async function pair(x = 30, z = 60) {
  const a = await adult('Va'), b = await adult('Vb');
  const sa = await say(a, x, z, { on: true });
  const sb = await say(b, x + 4, z, { on: true });
  a.id = sa.voice.me; b.id = sb.voice.me;
  return { a, b };
}

test('voice is off and unasked to begin with; the age is asked once, and a no stays a no', async () => {
  const p = await newPlayer('Age');
  const s0 = (await p.ok('voice.status')).voice;
  assert.equal(s0.adult, null);
  assert.equal(s0.allowed, false);
  // not allowed until said: no relay password
  const refused = await p.call('voice.ice');
  assert.equal(refused.body.code, 'NO_VOICE');
  const under = await newPlayer('Young');
  assert.equal((await under.ok('voice.age', { adult: false })).voice.allowed, false);
  // said once: saying otherwise later changes nothing
  assert.equal((await under.ok('voice.age', { adult: true })).voice.adult, false);
  const no = await under.call('voice.ice');
  assert.equal(no.body.code, 'NO_VOICE');
  assert.match(no.body.message, /18/);
  assert.equal((await p.ok('voice.age', { adult: true })).voice.allowed, true);
});

test('the relay: the public STUN servers without a key; with one, a password from Cloudflare, the key never in the answer', async () => {
  const p = await adult('Ice');
  const plain = await p.ok('voice.ice');
  assert.equal(plain.relay, false);
  assert.ok(plain.iceServers[0].urls.some((u) => u.startsWith('stun:')));
  const sql = await database();
  const me = (await sql.unsafe(`select id from pcw.accounts where username_key = $1`, [p.username.toLowerCase()]))[0];
  process.env.CF_TURN_KEY_ID = 'key-id-123'; process.env.CF_TURN_API_TOKEN = 'secret-token-456';
  let asked = null;
  const fetcher = async (url, init) => { asked = { url, init }; return { ok: true, status: 201, json: async () => ({ iceServers: [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.cloudflare.com:53'] }, { urls: ['turn:turn.cloudflare.com:3478?transport=udp', 'turn:turn.cloudflare.com:53?transport=udp', 'turns:turn.cloudflare.com:443?transport=tcp'], username: 'u1', credential: 'c1' }] }) }; };
  try {
    const got = await voice.ice(sql, { id: me.id }, { fetcher });
    assert.match(asked.url, /\/v1\/turn\/keys\/key-id-123\/credentials\/generate-ice-servers$/);
    assert.equal(asked.init.headers.Authorization, 'Bearer secret-token-456');
    assert.equal(got.relay, true);
    const urls = got.iceServers.flatMap((s) => s.urls);
    assert.ok(!urls.some((u) => /:53(\?|$)/.test(u)), 'the port 53 addresses left out');
    assert.ok(urls.includes('turns:turn.cloudflare.com:443?transport=tcp'));
    assert.ok(!JSON.stringify(got).includes('secret-token-456') && !JSON.stringify(got).includes('key-id-123'), 'the key never in the answer');
    // Cloudflare out of reach: the STUN servers alone, and no error
    const down = await voice.ice(sql, { id: me.id }, { fetcher: async () => { throw new Error('down'); } });
    assert.equal(down.relay, false);
  } finally { delete process.env.CF_TURN_KEY_ID; delete process.env.CF_TURN_API_TOKEN; }
});

test('the handshake: an offer from one game reaches the other at its next word, and the answer comes back; once each', async () => {
  const { a, b } = await pair(40, 60);
  const sa = await say(a, 40, 60, { on: true });
  assert.ok(sa.voice.ok.includes(b.id), 'each may talk with the other');
  await say(a, 40, 60, { on: true, out: [{ to: b.id, k: 'offer', d: 'v=0 offer-from-a' }] });
  const got = await say(b, 44, 60, { on: true });
  assert.deepEqual(got.voice.in, [{ from: a.id, k: 'offer', d: 'v=0 offer-from-a' }]);
  assert.deepEqual((await say(b, 44, 60, { on: true })).voice.in, [], 'taken once');
  await say(b, 44, 60, { on: true, out: [{ to: a.id, k: 'answer', d: 'v=0 answer-from-b' }] });
  assert.deepEqual((await say(a, 40, 60, { on: true })).voice.in, [{ from: b.id, k: 'answer', d: 'v=0 answer-from-b' }]);
  // too large, or not a handshake: not passed on
  await say(a, 40, 60, { on: true, out: [{ to: b.id, k: 'offer', d: 'x'.repeat(voice.VOICE.size + 1) }, { to: b.id, k: 'hello', d: 'x' }] });
  assert.deepEqual((await say(b, 44, 60, { on: true })).voice.in, []);
});

test('only between players who both have voice on: one with it off is not offered, and nothing reaches them', async () => {
  const a = await adult('On'), b = await adult('Off');
  const idB = (await say(b, 80, 60, { on: false }, 0)).voice.me;
  const sa = await say(a, 76, 60, { on: true });
  assert.ok(!sa.voice.ok.includes(idB));
  await say(a, 76, 60, { on: true, out: [{ to: idB, k: 'offer', d: 'v=0' }] });
  assert.deepEqual((await say(b, 80, 60, { on: true })).voice.in, []);
  // an account that has not said its age is not offered either, and is told why
  const c = await newPlayer('Unasked');
  const sc = await say(c, 78, 60, { on: true });
  assert.equal(sc.voice.on, false);
  assert.equal(sc.voice.no, 'AGE_UNKNOWN');
  assert.ok(!(await say(a, 76, 60, { on: true })).voice.ok.includes(sc.voice.me));
});

test('a block: never put in touch again, either way; and unblocked, they may be', async () => {
  const { a, b } = await pair(120, 60);
  await a.ok('voice.block', { peer: b.id });
  assert.ok(!(await say(a, 120, 60, { on: true })).voice.ok.includes(b.id), 'not offered to the one who blocked');
  assert.ok(!(await say(b, 124, 60, { on: true })).voice.ok.includes(a.id), 'nor the other way');
  await b.ok('presence', { zone: ZONE, state: state(124, 60), voice: { on: true, out: [{ to: a.id, k: 'offer', d: 'v=0 from b' }] } });
  assert.deepEqual((await say(a, 120, 60, { on: true })).voice.in, [], 'nothing passes');
  const list = (await a.ok('voice.status')).voice.blocked;
  assert.deepEqual(list.map((x) => x.id), [b.id]);
  assert.equal(list[0].username, b.username);
  await a.ok('voice.unblock', { peer: b.id });
  assert.ok((await say(a, 120, 60, { on: true })).voice.ok.includes(b.id));
});

test('a report reaches the Admin app with the date, the accounts and the place; only an administrator sees or decides', async () => {
  const { a, b } = await pair(160, 60);
  const bad = await a.call('voice.report', { peer: b.id, reason: 'jokes' });
  assert.equal(bad.body.code, 'BAD_REQUEST');
  const r = await a.ok('voice.report', { peer: b.id, reason: 'harassment', note: 'kept shouting at me', zone: ZONE, x: 160, z: 60 });
  assert.equal(r.report.username, b.username);
  assert.equal((await a.call('admin.voice.reports')).body.code, 'NOT_ADMIN');
  const boss = await admin();
  const seen = (await boss.ok('admin.voice.reports')).reports.find((x) => x.id === r.report.id);
  assert.ok(seen);
  assert.equal(seen.reporter, a.username); assert.equal(seen.reported, b.username);
  assert.equal(seen.reason, 'harassment'); assert.equal(seen.note, 'kept shouting at me');
  assert.deepEqual(seen.place, { zone: ZONE, x: 160, z: 60 });
  assert.ok(seen.at);
  assert.equal(seen.status, 'open');
  assert.equal((await b.call('admin.voice.decide', { report: r.report.id, action: 'gameBan' })).body.code, 'NOT_ADMIN');
});

test('an administrator warns: the player is told once at their next sign-in; bans from voice for 7 days: no relay, nobody offered', async () => {
  const { a, b } = await pair(200, 60);
  const boss = await admin();
  const r1 = await a.ok('voice.report', { peer: b.id, reason: 'abuse' });
  await boss.ok('admin.voice.decide', { report: r1.report.id, action: 'warn' });
  const me = await b.ok('me');
  assert.match(me.warning, /warning/i);
  await b.ok('voice.seen');
  assert.equal((await b.ok('me')).warning, null, 'shown once');
  const r2 = await a.ok('voice.report', { peer: b.id, reason: 'threats' });
  await boss.ok('admin.voice.decide', { report: r2.report.id, action: 'voice7' });
  const st = (await b.ok('voice.status')).voice;
  assert.equal(st.allowed, false);
  const days = (new Date(st.bannedUntil).getTime() - Date.now()) / 86400000;
  assert.ok(days > 6.9 && days < 7.1, `${days} days`);
  assert.equal((await b.call('voice.ice')).body.code, 'NO_VOICE');
  assert.ok(!(await say(a, 200, 60, { on: true })).voice.ok.includes(b.id));
  assert.equal((await say(b, 204, 60, { on: true })).voice.no, 'BANNED');
  // the report as decided, with who decided
  const seen = (await boss.ok('admin.voice.reports', { status: 'all' })).reports.find((x) => x.id === r2.report.id);
  assert.equal(seen.status, 'voice-7'); assert.equal(seen.decidedBy, boss.username);
  // undone
  await boss.ok('admin.voice.account', { username: b.username, unbanVoice: true });
  assert.equal((await b.ok('voice.status')).voice.allowed, true);
});

test('a ban from the game: signed out at once, and not let in again; undone, let in', async () => {
  const { a, b } = await pair(240, 60);
  const boss = await admin();
  const r = await a.ok('voice.report', { peer: b.id, reason: 'hate' });
  await boss.ok('admin.voice.decide', { report: r.report.id, action: 'gameBan' });
  assert.equal((await b.call('voice.status')).body.code, 'SIGNED_OUT');
  const again = person();
  const tried = await again.call('login', { username: b.username, password: `pw-${b.username}-long` });
  assert.equal(tried.body.code, 'BANNED');
  assert.match(tried.body.message, /banned/);
  await boss.ok('admin.voice.account', { username: b.username, unbanGame: true });
  assert.equal((await again.call('login', { username: b.username, password: `pw-${b.username}-long` })).body.ok, true);
});

test('an administrator can set an account\'s age for voice; the player cannot change it after', async () => {
  const p = await newPlayer('Minor');
  await p.ok('voice.age', { adult: false });
  const boss = await admin();
  await boss.ok('admin.voice.account', { username: p.username, adult: true });
  const st = (await p.ok('voice.status')).voice;
  assert.equal(st.adult, true); assert.equal(st.ageLocked, true); assert.equal(st.allowed, true);
});
