// Accounts, sessions, saved characters and who is in town, against a real PostgreSQL.
//   server/with-postgres.sh node --test server/test/*.test.mjs
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { request, person, newPlayer, database, closeDatabase, ZONE } from './harness.mjs';

after(() => closeDatabase());

test('the server says it is here, and that it has a database', async () => {
  const a = await request({ method: 'GET' });
  assert.equal(a.status, 200);
  assert.deepEqual(a.body, { ok: true, service: 'postcivilwar', accounts: true });
});

test('a request that did not come from the game\'s own page is refused', async () => {
  const noHeader = await request({ body: { op: 'me' }, headers: { 'x-pcw': null } });
  assert.equal(noHeader.status, 403);
  const elsewhere = await request({ body: { op: 'me' }, headers: { origin: 'https://example.com' } });
  assert.equal(elsewhere.status, 403);
  assert.equal(elsewhere.body.code, 'NOT_THE_GAME');
  const unknown = await request({ body: { op: 'drop everything' } });
  assert.equal(unknown.status, 400);
});

test('a username and a password are checked before an account is made', async () => {
  const p = person();
  const bad = async (username, password, code) => { const a = await p.call('signup', { username, password }); assert.equal(a.body.ok, false, `${username} / ${password}`); assert.equal(a.body.code, code, `${username} / ${password}: ${a.body.message}`); };
  await bad('ab', 'long enough password', 'USERNAME');
  await bad('a name with spaces', 'long enough password', 'USERNAME');
  await bad('1starts_with_figure', 'long enough password', 'USERNAME');
  await bad('this_name_is_far_too_long', 'long enough password', 'USERNAME');
  await bad('Admin', 'long enough password', 'USERNAME');
  await bad('<script>', 'long enough password', 'USERNAME');
  await bad('Nonso', 'short', 'PASSWORD');
  await bad('Nonso', 'nonso', 'PASSWORD');
  await bad('NonsoObi', 'nonsoobi', 'PASSWORD');
  await bad('Nonso', 'x'.repeat(200), 'PASSWORD');
  assert.equal((await p.call('me')).body.account, null);
});

test('signing up makes an account and a session; the password is kept only as a hash, the session only as a fingerprint', async () => {
  const p = person();
  const made = await p.call('signup', { username: 'Adaeze', password: 'correct horse battery' });
  assert.equal(made.status, 200);
  assert.deepEqual(made.body.account, { username: 'Adaeze', admin: false, figure: null, path: null });
  assert.match(made.setCookie, /^pcw_session=[\w-]{40,}; Path=\/; HttpOnly; SameSite=Lax; Max-Age=2592000; Secure$/);
  assert.equal((await p.ok('me')).account.username, 'Adaeze');
  const sql = await database();
  const row = (await sql.unsafe(`select pass_hash from pcw.accounts where username_key = 'adaeze'`))[0];
  assert.match(row.pass_hash, /^scrypt\$32768\$8\$3\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
  assert.ok(!row.pass_hash.includes('correct horse'));
  const token = p.cookie.split('=')[1];
  const sessions = await sql.unsafe(`select token_hash from pcw.sessions`);
  assert.ok(sessions.length >= 1);
  assert.ok(sessions.every((s) => s.token_hash !== token && /^[0-9a-f]{64}$/.test(s.token_hash)));
  // nothing in any answer carries the hash
  assert.ok(!JSON.stringify(made.body).includes('scrypt'));
});

test('a username belongs to one person, whatever the capitals', async () => {
  const first = person(), second = person();
  await first.ok('signup', { username: 'Chidi_77', password: 'a long password one' });
  const again = await second.call('signup', { username: 'CHIDI_77', password: 'a long password two' });
  assert.equal(again.status, 409);
  assert.equal(again.body.code, 'TAKEN');
});

test('signing in: the right password and no other; the same answer for a wrong password and for nobody', async () => {
  const owner = person();
  await owner.ok('signup', { username: 'Ngozi', password: 'the river is wide' });
  const other = person();
  const wrong = await other.call('login', { username: 'Ngozi', password: 'the river is deep' });
  const nobody = await other.call('login', { username: 'NobodyAtAll', password: 'the river is deep' });
  assert.equal(wrong.status, 401);
  assert.equal(nobody.status, 401);
  assert.deepEqual(wrong.body, nobody.body);
  assert.equal(other.cookie, '');
  const right = await other.call('login', { username: 'ngozi', password: 'the river is wide' });
  assert.equal(right.status, 200);
  assert.equal(right.body.account.username, 'Ngozi');
  assert.equal((await other.ok('me')).account.username, 'Ngozi');
});

test('guessing is slowed: after eight wrong passwords for a name, even the right one waits', async () => {
  const owner = person();
  await owner.ok('signup', { username: 'Emeka', password: 'eight wrong guesses' });
  const guesser = person();
  for (let i = 0; i < 8; i += 1) assert.equal((await guesser.call('login', { username: 'Emeka', password: `guess number ${i}` })).status, 401);
  const ninth = await guesser.call('login', { username: 'Emeka', password: 'eight wrong guesses' });
  assert.equal(ninth.status, 429);
  assert.equal(ninth.body.code, 'TOO_MANY');
  assert.ok(ninth.body.wait > 0);
  // from another address too: the count is against the name
  assert.equal((await person().call('login', { username: 'Emeka', password: 'eight wrong guesses' })).status, 429);
  // and the owner's own session is untouched
  assert.equal((await owner.ok('me')).account.username, 'Emeka');
});

test('one address cannot make accounts without end', async () => {
  const address = '10.9.9.9';
  let made = 0, refused = 0;
  for (let i = 0; i < 8; i += 1) {
    const a = await person(address).call('signup', { username: `Many${i}_x`, password: 'another long password' });
    if (a.status === 200) made += 1; else { refused += 1; assert.equal(a.status, 429); }
  }
  assert.equal(made, 6);
  assert.equal(refused, 2);
});

test('signing out ends the session, there and in the database', async () => {
  const p = person();
  await p.ok('signup', { username: 'Obinna', password: 'out and in again' });
  const old = p.cookie;
  const out = await p.call('logout');
  assert.match(out.setCookie, /^pcw_session=; .*Max-Age=0/);
  p.cookie = old;       // someone who kept the old cookie
  assert.equal((await p.call('me')).body.account, null);
  assert.equal((await p.call('save.get')).status, 401);
});

test('a character is kept with its account: what was being played before the account was made, and each save after', async () => {
  const p = person();
  const made = await p.ok('signup', { username: 'Ifeoma', password: 'keep my character', save: { enc: 'json', data: '{"playerId":"p1","marker":"before"}', summary: { name: 'Ifeoma Eze', figure: 'W1', tr: 4000 } } });
  assert.equal(made.save.rev, 1);
  assert.equal(made.save.name, 'Ifeoma Eze');
  assert.equal(made.save.tr, 4000);
  const got = await p.ok('save.get');
  assert.equal(got.save.data, '{"playerId":"p1","marker":"before"}');
  const next = await p.ok('save.put', { baseRev: 1, enc: 'json', data: '{"marker":"after"}', summary: { name: 'Ifeoma Eze', tr: 3800 } });
  assert.equal(next.rev, 2);
  // another device that began from the first copy cannot overwrite the second
  const stale = await p.call('save.put', { baseRev: 1, enc: 'json', data: '{"marker":"stale"}' });
  assert.equal(stale.status, 409);
  assert.equal(stale.body.code, 'NEWER');
  assert.equal(stale.body.rev, 2);
  assert.equal((await p.ok('save.get')).save.data, '{"marker":"after"}');
  // signing in elsewhere finds it
  const elsewhere = person();
  const inAgain = await elsewhere.ok('login', { username: 'Ifeoma', password: 'keep my character' });
  assert.equal(inAgain.save.rev, 2);
  assert.equal((await elsewhere.ok('save.get')).save.data, '{"marker":"after"}');
  // and nobody else can read it
  const stranger = await newPlayer('Stranger');
  assert.equal((await stranger.ok('save.get')).save, null);
});

test('players in the same town see each other, each under their own username and no other', async () => {
  const a = await newPlayer('Ada'), b = await newPlayer('Bayo'), c = await newPlayer('Chi');
  const stateOf = (x, z, name) => ({ v: 1, zn: ZONE, n: name, x, z, h: 0, lg: 'en', lk: { s: 1, t: 2, b: 3, f: 1 } });
  assert.deepEqual((await a.ok('presence', { zone: ZONE, state: stateOf(10, 10, 'Ada Obi') })).peers, []);
  // b says it is called something it is not
  const seenByB = (await b.ok('presence', { zone: ZONE, state: stateOf(12, 10, a.username) })).peers;
  assert.equal(seenByB.length, 1);
  assert.equal(seenByB[0].state.n, a.username);
  assert.equal(seenByB[0].state.x, 10);
  await c.ok('presence', { zone: 'OTHER-TOWN', state: stateOf(11, 10, 'Chi') });
  const seenByA = (await a.ok('presence', { zone: ZONE, state: stateOf(10, 10, 'Ada Obi') })).peers;
  assert.equal(seenByA.length, 1);
  assert.equal(seenByA[0].state.n, b.username, 'the name is the account\'s, not the one the game sent');
  assert.match(seenByA[0].id, /^u[0-9a-f]{20}$/);
  // leaving
  await b.ok('presence', { zone: ZONE, state: null });
  assert.deepEqual((await a.ok('presence', { zone: ZONE, state: stateOf(10, 10, 'Ada Obi') })).peers, []);
  // not signed in: not in town
  assert.equal((await person().call('presence', { zone: ZONE, state: stateOf(1, 1, 'Ghost') })).status, 401);
});

test('the public keys of the database host can touch none of it', async () => {
  const sql = await database();
  const open = await sql.unsafe(`select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'pcw' and c.relkind = 'r' and not c.relrowsecurity`);
  assert.deepEqual(open.map((r) => r.relname), []);
  const inPublic = await sql.unsafe(`select tablename from pg_tables where schemaname = 'public'`);
  assert.deepEqual([...inPublic], []);
});
