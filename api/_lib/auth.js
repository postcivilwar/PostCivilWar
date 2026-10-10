'use strict';
// Accounts: a username and a password, and nothing else about anybody.
//
// A password is never kept. What is kept is what scrypt makes of it with a salt of its own, which cannot be
// turned back into the password and costs real work to guess at. A session is a long random number kept in the
// browser where the page's own code cannot read it; the database holds only its fingerprint, so that a copy of
// the database opens nobody's session.

const crypto = require('crypto');
const { ApiError, cookiesOf, addressOf, secure } = require('./http.js');
const { SCHEMA: S } = require('./schema.js');

const COOKIE = 'pcw_session';
const SESSION_DAYS = 30;
const SESSIONS_EACH = 8;                  // devices signed in at once; the oldest is signed out by the ninth
const SCRYPT = { N: 32768, r: 8, p: 3, keylen: 32, maxmem: 96 * 1024 * 1024 };

// Tries allowed before a wait, and how long the count is kept (seconds).
const LIMITS = {
  loginName: { most: 8, window: 15 * 60 },         // wrong passwords for one username
  loginAddress: { most: 40, window: 15 * 60 },     // wrong passwords from one address, whatever the usernames
  signupAddress: { most: 6, window: 60 * 60 },     // accounts made from one address
};

const RESERVED = new Set(['admin', 'administrator', 'root', 'system', 'government', 'govt', 'police', 'moderator', 'mod', 'staff', 'support', 'official', 'holaris', 'holariswatch', 'postcivilwar', 'owner', 'server', 'null', 'undefined', 'anonymous', 'guest', 'everyone']);

// A username: 3 to 16 letters, figures and underscores, beginning with a letter. It is shown over the player's
// head, so it is kept short and plain. Two names that differ only in capitals are the same name.
function cleanUsername(value) {
  if (typeof value !== 'string') throw new ApiError(400, 'USERNAME', 'Choose a username.');
  const name = value.trim();
  if (!name) throw new ApiError(400, 'USERNAME', 'Choose a username.');
  if (name.length < 3 || name.length > 16) throw new ApiError(400, 'USERNAME', 'A username is 3 to 16 characters long.');
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(name)) throw new ApiError(400, 'USERNAME', 'A username begins with a letter and has only letters, figures and underscores: no spaces.');
  if (RESERVED.has(name.toLowerCase())) throw new ApiError(400, 'USERNAME', 'That username is not available.');
  return name;
}

function cleanPassword(value, username) {
  if (typeof value !== 'string' || !value) throw new ApiError(400, 'PASSWORD', 'Choose a password.');
  if (value.length < 8) throw new ApiError(400, 'PASSWORD', 'A password is at least 8 characters long.');
  if (value.length > 128) throw new ApiError(400, 'PASSWORD', 'A password is at most 128 characters long.');
  if (username && value.toLowerCase() === username.toLowerCase()) throw new ApiError(400, 'PASSWORD', 'The password must not be the username.');
  return value;
}

const scrypt = (password, salt, o) => new Promise((resolve, reject) => {
  crypto.scrypt(password.normalize('NFKC'), salt, o.keylen, { N: o.N, r: o.r, p: o.p, maxmem: SCRYPT.maxmem }, (error, key) => (error ? reject(error) : resolve(key)));
});

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

async function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const N = Number(parts[1]), r = Number(parts[2]), p = Number(parts[3]);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p) || N < 1024 || N > 1048576 || r < 1 || r > 32 || p < 1 || p > 16) return false;
  const salt = Buffer.from(parts[4], 'base64');
  const want = Buffer.from(parts[5], 'base64');
  let got;
  try { got = await scrypt(password, salt, { N, r, p, keylen: want.length }); } catch (error) { return false; }
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

// For a username nobody has: the same work as checking a real one, so that the time taken tells nothing.
let decoy = null;
async function pretendToCheck(password) {
  if (!decoy) decoy = hashPassword(crypto.randomBytes(12).toString('hex'));
  await verifyPassword(password, await decoy);
}

// ---- how often ----

// Counts one more against `key` and gives the count within its window.
async function count(sql, key, window) {
  const rows = await sql.unsafe(
    `insert into ${S}.limits (key, count, window_start) values ($1, 1, now())
     on conflict (key) do update set
       count = case when ${S}.limits.window_start < now() - make_interval(secs => $2::int) then 1 else ${S}.limits.count + 1 end,
       window_start = case when ${S}.limits.window_start < now() - make_interval(secs => $2::int) then now() else ${S}.limits.window_start end
     returning count`, [key, window]);
  return rows[0].count;
}
// The count as it stands, without adding to it, and how long until it is forgotten.
async function counted(sql, key, window) {
  const rows = await sql.unsafe(`select count, greatest(1, ceil(extract(epoch from (window_start + make_interval(secs => $2::int) - now()))))::int as wait from ${S}.limits where key = $1 and window_start >= now() - make_interval(secs => $2::int)`, [key, window]);
  return rows.length ? { count: rows[0].count, wait: rows[0].wait } : { count: 0, wait: 0 };
}
const tooMany = (wait) => new ApiError(429, 'TOO_MANY', `Too many tries. Wait ${wait > 90 ? `${Math.ceil(wait / 60)} minutes` : 'a minute'} and try again.`, { wait });

// Allows `most` of something in each `window` seconds for one key; the one over is refused.
async function allow(sql, key, most, window) {
  const n = await count(sql, key, window);
  if (n > most) { const left = await counted(sql, key, window); throw tooMany(left.wait || window); }
}

// ---- sessions ----

const fingerprint = (token) => crypto.createHash('sha256').update(token).digest('hex');

function cookie(req, token, age) {
  const parts = [`${COOKIE}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${age}`];
  if (secure(req)) parts.push('Secure');
  return parts.join('; ');
}

async function startSession(sql, req, accountId) {
  const token = crypto.randomBytes(32).toString('base64url');
  await sql.unsafe(`insert into ${S}.sessions (token_hash, account_id, expires_at) values ($1, $2, now() + make_interval(days => $3::int))`, [fingerprint(token), accountId, SESSION_DAYS]);
  // keep the newest few; a tenth device signs the oldest out
  await sql.unsafe(`delete from ${S}.sessions where account_id = $1 and token_hash not in (select token_hash from ${S}.sessions where account_id = $1 order by created_at desc limit $2::int)`, [accountId, SESSIONS_EACH]);
  if (Math.random() < 0.05) await sql.unsafe(`delete from ${S}.sessions where expires_at < now()`);
  return cookie(req, token, SESSION_DAYS * 86400);
}

const adminNames = () => new Set(String(process.env.PCW_ADMINS || '').split(',').map((n) => n.trim().toLowerCase()).filter(Boolean));
const isAdmin = (account) => !!account && (account.role === 'admin' || adminNames().has(account.username_key));

// Who is asking, or null. A session used again is good for another thirty days from then.
async function accountOf(sql, req) {
  const token = cookiesOf(req)[COOKIE];
  if (!token || token.length > 128) return null;
  const rows = await sql.unsafe(
    `select a.id, a.username, a.username_key, a.role, s.token_hash, s.last_used_at < now() - interval '1 hour' as stale
     from ${S}.sessions s join ${S}.accounts a on a.id = s.account_id
     where s.token_hash = $1 and s.expires_at > now()`, [fingerprint(token)]);
  if (!rows.length) return null;
  const row = rows[0];
  if (row.stale) {
    await sql.unsafe(`update ${S}.sessions set last_used_at = now(), expires_at = now() + make_interval(days => $2::int) where token_hash = $1`, [row.token_hash, SESSION_DAYS]);
    await sql.unsafe(`update ${S}.accounts set last_seen_at = now() where id = $1`, [row.id]);
  }
  const account = { id: row.id, username: row.username, username_key: row.username_key, role: row.role, session: row.token_hash };
  account.admin = isAdmin(account);
  return account;
}

async function requireAccount(sql, req) {
  const account = await accountOf(sql, req);
  if (!account) throw new ApiError(401, 'SIGNED_OUT', 'You are not signed in.');
  return account;
}

// ---- the three things a person does ----

async function signUp(sql, req, body) {
  const username = cleanUsername(body.username);
  const password = cleanPassword(body.password, username);
  await allow(sql, `signup:addr:${addressOf(req)}`, LIMITS.signupAddress.most, LIMITS.signupAddress.window);
  const hash = await hashPassword(password);
  const rows = await sql.unsafe(`insert into ${S}.accounts (username, username_key, pass_hash) values ($1, $2, $3) on conflict (username_key) do nothing returning id, username, username_key, role`, [username, username.toLowerCase(), hash]);
  if (!rows.length) throw new ApiError(409, 'TAKEN', 'That username is taken. Choose another.');
  const account = rows[0];
  account.admin = isAdmin(account);
  return { account, cookie: await startSession(sql, req, account.id) };
}

async function signIn(sql, req, body) {
  const typed = typeof body.username === 'string' ? body.username.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!typed || !password || typed.length > 32 || password.length > 128) throw new ApiError(400, 'BAD_REQUEST', 'Type your username and your password.');
  const key = typed.toLowerCase();
  const nameKey = `login:name:${key}`, addressKey = `login:addr:${addressOf(req)}`;
  const byName = await counted(sql, nameKey, LIMITS.loginName.window);
  const byAddress = await counted(sql, addressKey, LIMITS.loginAddress.window);
  if (byName.count >= LIMITS.loginName.most) throw tooMany(byName.wait);
  if (byAddress.count >= LIMITS.loginAddress.most) throw tooMany(byAddress.wait);
  const rows = await sql.unsafe(`select id, username, username_key, role, pass_hash from ${S}.accounts where username_key = $1`, [key]);
  let good = false;
  if (rows.length) good = await verifyPassword(password, rows[0].pass_hash); else await pretendToCheck(password);
  if (!good) {
    await count(sql, nameKey, LIMITS.loginName.window);
    await count(sql, addressKey, LIMITS.loginAddress.window);
    // the same words whether the username exists or not
    throw new ApiError(401, 'NO_MATCH', 'That username and password do not match.');
  }
  await sql.unsafe(`delete from ${S}.limits where key = $1`, [nameKey]);
  const account = { id: rows[0].id, username: rows[0].username, username_key: rows[0].username_key, role: rows[0].role };
  account.admin = isAdmin(account);
  await sql.unsafe(`update ${S}.accounts set last_seen_at = now() where id = $1`, [account.id]);
  return { account, cookie: await startSession(sql, req, account.id) };
}

async function signOut(sql, req) {
  const token = cookiesOf(req)[COOKIE];
  if (token) {
    const rows = await sql.unsafe(`delete from ${S}.sessions where token_hash = $1 returning account_id`, [fingerprint(token)]);
    if (rows.length) await sql.unsafe(`delete from ${S}.presence where account_id = $1`, [rows[0].account_id]);
  }
  return cookie(req, '', 0);
}

module.exports = { signUp, signIn, signOut, accountOf, requireAccount, allow, cleanUsername, cleanPassword, hashPassword, verifyPassword, LIMITS, COOKIE };
