'use strict';
// The game's one door on the server: /api/game.
//
//   GET   says whether the server is here and has been given a database (nothing else)
//   POST  { op: '...', ... } does one thing and answers { ok: true, ... } or { ok: false, code, message }
//
// It is one function, not one for each thing, because every request needs the same three things first: to
// have come from the game's own page, the database, and who is asking.
//
// What it keeps: accounts (a username and what scrypt makes of a password), each account's character, its
// wallet and every movement of TR (and which of it is starter TR and which was earned), the one character each
// account is, the market, and where signed-in players are standing. It holds no secret that the page ever sees.

const { ApiError, readBody, fromOwnPage, send } = require('./_lib/http.js');
const { database, configured } = require('./_lib/db.js');
const auth = require('./_lib/auth.js');
const market = require('./_lib/market.js');
const world = require('./_lib/world.js');
const wallet = require('./_lib/wallet.js');
const character = require('./_lib/character.js');
const { SCHEMA: S } = require('./_lib/schema.js');

// (the character and the path are the account's own: chosen once, kept here, and the same on every device)
const publicAccount = (account) => ({ username: account.username, admin: !!account.admin, figure: account.figure || null, path: account.path || null });
const purse = (sql, account) => wallet.after(sql, account.id);
// Two movements that wanted each other's wallets at the same instant: the database stops one of them, and it is
// simply done again. (Everything that moves TR is done once however often it is asked: see wallet.js.)
const AGAIN = new Set(['40P01', '40001']);

// op -> [needs an account, what it does]. `ctx` is { sql, req, body, me }.
const OPS = {
  'me': [false, async ({ sql, me }) => (me ? { account: publicAccount(me), save: await world.saveInfo(sql, me.id), wallet: await purse(sql, me) } : { account: null })],
  'signup': [false, async ({ sql, req, body }) => {
    const { account, cookie } = await auth.signUp(sql, req, body, (tx, made) => wallet.open(tx, made.id));
    // a character already being played on this device goes with the new account
    let save = null;
    if (body.save && typeof body.save === 'object') { try { await world.savePut(sql, account, { ...body.save, baseRev: 0 }, { first: true }); } catch (error) { if (!(error instanceof ApiError)) throw error; } save = await world.saveInfo(sql, account.id); }
    return { account: publicAccount(account), save, wallet: await purse(sql, account), cookie };
  }],
  'login': [false, async ({ sql, req, body }) => {
    const { account, cookie } = await auth.signIn(sql, req, body);
    return { account: publicAccount(account), save: await world.saveInfo(sql, account.id), wallet: await purse(sql, account), cookie };
  }],
  'logout': [false, async ({ sql, req }) => ({ cookie: await auth.signOut(sql, req) })],
  'save.get': [true, ({ sql, me }) => world.saveGet(sql, me)],
  'save.put': [true, ({ sql, me, body }) => world.savePut(sql, me, body)],
  'save.erase': [true, ({ sql, me }) => world.saveErase(sql, me)],
  'character.get': [true, async ({ sql, me }) => ({ character: await character.profile(sql, me.id), ...(await character.changes(sql, me)) })],
  'character.choose': [true, ({ sql, me, body }) => character.choose(sql, me, body)],
  'character.quote': [true, ({ sql, me, body }) => character.quote(sql, me, body)],
  'character.upgrade': [true, ({ sql, me, body }) => character.upgrade(sql, me, body)],
  'wallet.get': [true, ({ sql, me, body }) => wallet.get(sql, me, body)],
  'wallet.find': [true, ({ sql, me, body }) => wallet.find(sql, me, body)],
  'wallet.check': [true, ({ sql, me, body }) => wallet.check(sql, me, body)],
  'wallet.send': [true, ({ sql, me, body }) => wallet.send(sql, me, body)],
  'wallet.history': [true, ({ sql, me, body }) => wallet.history(sql, me, body)],
  'wallet.people': [true, ({ sql, me }) => wallet.people(sql, me)],
  'wallet.person.add': [true, ({ sql, me, body }) => wallet.addPerson(sql, me, body)],
  'wallet.person.remove': [true, ({ sql, me, body }) => wallet.removePerson(sql, me, body)],
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

// Refusals that are about what TR is or how much of it there is. Each is written down (who asked, for what, how
// much, and the reason given), beside the ledger, which only says what did move.
const REFUSALS = new Set(['STARTER_FUNDS', 'ELIGIBLE_FUNDS', 'FUNDS', 'QUOTE_CHANGED', 'BALANCE']);
const MONEY_OPS = new Set(['wallet.check', 'wallet.send', 'market.offer', 'market.decide', 'character.quote', 'character.upgrade']);
const short = (value, most) => (typeof value === 'string' || typeof value === 'number' ? String(value).slice(0, most) : null);
async function noteRefusal(at, error) {
  if (!at || !at.sql || !at.me || !MONEY_OPS.has(at.op) || !REFUSALS.has(error.code)) return;
  const body = at.body || {}, extra = error.extra || {};
  const detail = {};
  for (const key of ['username', 'figure', 'thread', 'offer', 'listing']) { const v = short(body[key], 64); if (v !== null) detail[key] = v; }
  for (const key of ['balance', 'eligible', 'starter']) if (Number.isSafeInteger(extra[key])) detail[key] = extra[key];
  if (extra.quote && Number.isSafeInteger(extra.quote.fee)) detail.fee = extra.quote.fee;
  const amount = short(body.amount !== undefined ? body.amount : body.fee, 32);
  // (the refusal has already been decided: failing to write it down must not turn it into something else)
  try { await at.sql.unsafe(`insert into ${S}.wallet_refusals (account_id, op, code, amount, detail) values ($1, $2, $3, $4, $5::text::jsonb)`, [at.me.id, at.op, error.code, amount, JSON.stringify(detail)]); } catch (failed) { console.error('refusal not recorded:', failed && failed.message); }
}

async function handle(req, res, at) {
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
  at.sql = sql; at.me = me; at.op = body.op; at.body = body;
  let result;
  for (let tries = 0; ; tries += 1) {
    try { result = await run({ sql, req, body, me }); break; } catch (error) { if (!(error && AGAIN.has(error.code)) || tries >= 3) throw error; }
  }
  const { cookie, ...rest } = result || {};
  return send(res, 200, { ok: true, ...rest }, cookie ? { 'Set-Cookie': cookie } : null);
}

module.exports = async function game(req, res) {
  const at = {};
  try {
    await handle(req, res, at);
  } catch (error) {
    if (error instanceof ApiError) await noteRefusal(at, error);
    if (error instanceof ApiError) return send(res, error.status, { ok: false, code: error.code, message: error.message, ...(error.extra || {}) });
    console.error('game:', error && (error.stack || error.message));
    return send(res, 500, { ok: false, code: 'SERVER', message: 'Something went wrong on the server. Nothing was changed.' });
  }
};
