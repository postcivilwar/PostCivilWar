'use strict';
// The game's one door on the server: /api/game.
//
//   GET   says whether the server is here and has been given a database (nothing else)
//   POST  { op: '...', ... } does one thing and answers { ok: true, ... } or { ok: false, code, message }
//
// It is one function, not one for each thing, because every request needs the same three things first: to
// have come from the game's own page, the database, and who is asking.
//
// What it keeps: accounts (a username and what scrypt makes of a password), each account's character, the
// market, and where signed-in players are standing. It holds no secret that the page ever sees.

const { ApiError, readBody, fromOwnPage, send } = require('./_lib/http.js');
const { database, configured } = require('./_lib/db.js');
const auth = require('./_lib/auth.js');
const market = require('./_lib/market.js');
const world = require('./_lib/world.js');

const publicAccount = (account) => ({ username: account.username, admin: !!account.admin });

// op -> [needs an account, what it does]. `ctx` is { sql, req, body, me }.
const OPS = {
  'me': [false, async ({ sql, me }) => (me ? { account: publicAccount(me), save: await world.saveInfo(sql, me.id) } : { account: null })],
  'signup': [false, async ({ sql, req, body }) => {
    const { account, cookie } = await auth.signUp(sql, req, body);
    // a character already being played on this device goes with the new account
    let save = null;
    if (body.save && typeof body.save === 'object') { try { await world.savePut(sql, account, { ...body.save, baseRev: 0 }, { first: true }); } catch (error) { if (!(error instanceof ApiError)) throw error; } save = await world.saveInfo(sql, account.id); }
    return { account: publicAccount(account), save, cookie };
  }],
  'login': [false, async ({ sql, req, body }) => {
    const { account, cookie } = await auth.signIn(sql, req, body);
    return { account: publicAccount(account), save: await world.saveInfo(sql, account.id), cookie };
  }],
  'logout': [false, async ({ sql, req }) => ({ cookie: await auth.signOut(sql, req) })],
  'save.get': [true, ({ sql, me }) => world.saveGet(sql, me)],
  'save.put': [true, ({ sql, me, body }) => world.savePut(sql, me, body)],
  'presence': [true, ({ sql, me, body }) => world.presence(sql, me, body)],
  'market.list': [false, ({ sql, me, body }) => market.list(sql, me, body)],
  'market.mine': [true, ({ sql, me }) => market.mine(sql, me)],
  'market.sync': [true, ({ sql, me, body }) => market.sync(sql, me, body)],
  'market.open': [true, ({ sql, me, body }) => market.open(sql, me, body)],
  'market.read': [true, ({ sql, me, body }) => market.read(sql, me, body)],
  'market.say': [true, ({ sql, me, body }) => market.write(sql, me, body)],
  'market.offer': [true, ({ sql, me, body }) => market.offer(sql, me, body)],
  'market.withdraw': [true, ({ sql, me, body }) => market.withdraw(sql, me, body)],
  'market.decide': [true, ({ sql, me, body }) => market.decide(sql, me, body)],
  'market.sell': [true, ({ sql, me, body }) => market.sell(sql, me, body)],
  'market.unlist': [true, ({ sql, me, body }) => market.unlist(sql, me, body)],
  'admin.assets': [true, ({ sql, me }) => market.adminAssets(sql, me)],
  'admin.list': [true, ({ sql, me, body }) => market.adminList(sql, me, body)],
};

async function handle(req, res) {
  if (req.method === 'GET' || req.method === 'HEAD') return send(res, 200, { ok: true, service: 'postcivilwar', accounts: configured() });
  if (req.method !== 'POST') throw new ApiError(405, 'METHOD', 'Not that way.');
  if (!fromOwnPage(req)) throw new ApiError(403, 'NOT_THE_GAME', 'This is for the game itself.');
  const body = await readBody(req);
  const entry = typeof body.op === 'string' && Object.prototype.hasOwnProperty.call(OPS, body.op) ? OPS[body.op] : null;
  if (!entry) throw new ApiError(400, 'UNKNOWN', 'The server does not know how to do that.');
  let sql;
  try { sql = await database(); } catch (error) {
    if (error && error.code === 'NO_DATABASE') throw new ApiError(503, 'NO_DATABASE', 'Accounts are not set up on this site yet.');
    console.error('database:', error && error.message);
    throw new ApiError(503, 'DATABASE', 'The server cannot reach its database just now. Try again in a moment.');
  }
  const [needsAccount, run] = entry;
  const me = needsAccount ? await auth.requireAccount(sql, req) : await auth.accountOf(sql, req);
  const result = await run({ sql, req, body, me });
  const { cookie, ...rest } = result || {};
  return send(res, 200, { ok: true, ...rest }, cookie ? { 'Set-Cookie': cookie } : null);
}

module.exports = async function game(req, res) {
  try {
    await handle(req, res);
  } catch (error) {
    if (error instanceof ApiError) return send(res, error.status, { ok: false, code: error.code, message: error.message, ...(error.extra || {}) });
    console.error('game:', error && (error.stack || error.message));
    return send(res, 500, { ok: false, code: 'SERVER', message: 'Something went wrong on the server. Nothing was changed.' });
  }
};
