// What the server's tests share: the handler itself, called as the host calls it, and a way to be several
// different people at once. Needs PCW_DATABASE_URL (server/with-postgres.sh sets it).
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';

const require = createRequire(import.meta.url);
if (!process.env.PCW_DATABASE_URL) throw new Error('PCW_DATABASE_URL is not set: run these with server/with-postgres.sh');

// Each file of tests has a database to itself, made here and named after this process, so that one file
// emptying the shop does not leave another with nothing to buy.
{
  const postgres = require('../../api/_lib/postgres/index.js');
  const url = new URL(process.env.PCW_DATABASE_URL);
  const name = `pcw_test_${process.pid}`;
  const admin = postgres({ host: url.hostname, port: Number(url.port), database: url.pathname.slice(1), username: decodeURIComponent(url.username), password: decodeURIComponent(url.password), max: 1, onnotice() {} });
  await admin.unsafe(`create database ${name}`);
  await admin.end();
  url.pathname = `/${name}`;
  process.env.PCW_DATABASE_URL = url.href;
}

export const game = require('../../api/game.js');
export const { database, closeDatabase } = require('../../api/_lib/db.js');
export const { HOLARIS } = require('../../api/_lib/schema.js');

let addresses = 0;

// One request, as the host hands it over. Gives { status, body, cookie }.
export async function request({ method = 'POST', body = {}, cookie = '', headers = {}, address = '10.0.0.1' } = {}) {
  const req = { method, headers: { host: 'postcivilwar.test', 'x-pcw': '1', origin: 'https://postcivilwar.test', 'x-forwarded-proto': 'https', 'x-real-ip': address, ...(cookie ? { cookie } : {}), ...headers }, body, socket: {} };
  for (const [name, value] of Object.entries(req.headers)) if (value === null) delete req.headers[name];
  const out = { status: 0, headers: {}, text: '' };
  const res = { set statusCode(v) { out.status = v; }, get statusCode() { return out.status; }, setHeader(name, value) { out.headers[name.toLowerCase()] = value; }, end(text) { out.text = text || ''; } };
  await game(req, res);
  return { status: out.status, body: out.text ? JSON.parse(out.text) : null, headers: out.headers, setCookie: out.headers['set-cookie'] || null };
}

// A person with a browser of their own: remembers the session it is given.
export function person(address) {
  const at = address || `10.1.${Math.floor((addresses += 1) / 250)}.${addresses % 250}`;
  let cookie = '';
  const call = async (op, body = {}, extra = {}) => {
    const answer = await request({ body: { op, ...body }, cookie, address: at, ...extra });
    if (answer.setCookie) cookie = answer.setCookie.split(';')[0];
    return answer;
  };
  // the same, but anything other than success is an error
  const ok = async (op, body) => { const a = await call(op, body); if (!a.body || !a.body.ok) throw new Error(`${op}: ${a.status} ${a.body ? `${a.body.code}: ${a.body.message}` : ''}`); return a.body; };
  return { call, ok, get cookie() { return cookie; }, set cookie(v) { cookie = v; }, address: at };
}

let names = 0;
export async function newPlayer(prefix = 'Player') {
  const p = person();
  const username = `${prefix}${(names += 1)}_${Math.random().toString(36).slice(2, 6)}`.slice(0, 16);
  await p.ok('signup', { username, password: `pw-${username}-long` });
  p.username = username;
  return p;
}

// TR that a player earned in town, as their game would report it with a save: `units` of it (two to a TR),
// lawful unless it is said to have been taken from someone. The bank takes a game's word for its earnings only
// so far (wallet.js); a test that is about something else is first given room to be believed.
export async function earn(p, units, kind = 'lawful') {
  const sql = await database();
  await sql.unsafe(`update pcw.wallets w set earn_room = earn_room + $2 from pcw.accounts a where a.id = w.account_id and a.username_key = $1`, [p.username.toLowerCase(), units]);
  const now = await p.ok('save.get');
  const rev = now.save ? now.save.rev : (now.rev || 0), mark = now.wallet.mark;
  const kept = await p.ok('save.put', {
    baseRev: rev, enc: now.save ? now.save.enc : 'json', data: now.save ? now.save.data : JSON.stringify({ host: { test: true } }), summary: { name: 'Test Player', figure: 'W1' },
    wallet: { v: 2, from: mark, upto: mark + 1, in: { lawful: kind === 'lawful' ? units : 0, illicit: kind === 'illicit' ? units : 0 }, out: { cost: 0, restitution: 0, asset: 0 } },
  });
  if (kept.wallet.refused) throw new Error(`the bank refused ${kept.wallet.refused} of what the test said was earned`);
  return kept;
}

// A report of what a character did in town, as its game sends it with a save.
export const report = (from, upto, { lawful = 0, illicit = 0, cost = 0, restitution = 0, asset = 0 } = {}) => ({ v: 2, from, upto, in: { lawful, illicit }, out: { cost, restitution, asset } });

// A new player who has also earned `units` in town (so has TR that can be sent and spent on things to own).
export async function earner(prefix = 'Player', units = 4000) {
  const p = await newPlayer(prefix);
  await earn(p, units);
  return p;
}

export const uuid = () => randomUUID();
export const NEAR_HOLARIS = { x: HOLARIS.x, z: HOLARIS.z };
export const ZONE = 'NG-AN-OGB-Z1';

// A browser's `fetch`, for the game's own client code (prototype/src/net/online.js): it keeps its cookie as a
// browser does, and can be cut off from the network.
export function browser(address) {
  const at = address || `10.2.${Math.floor((addresses += 1) / 250)}.${addresses % 250}`;
  let cookie = '';
  const net = { down: false, lose: null, calls: 0 };
  const fetcher = async (url, init = {}) => {
    net.calls += 1;
    if (net.down) throw new TypeError('Failed to fetch');
    const body = init.body ? JSON.parse(init.body) : {};
    const headers = {};
    for (const [name, value] of Object.entries(init.headers || {})) headers[name.toLowerCase()] = value;
    const answer = await request({ method: init.method || 'GET', body, cookie, address: at, headers: init.method === 'POST' ? headers : { 'x-pcw': null } });
    if (answer.setCookie) cookie = answer.setCookie.split(';')[0].endsWith('=') ? '' : answer.setCookie.split(';')[0];
    // the request arrived and was acted on, but its answer was lost on the way back
    if (net.lose && net.lose(body)) throw new TypeError('Failed to fetch');
    return { ok: answer.status >= 200 && answer.status < 300, status: answer.status, json: async () => answer.body };
  };
  return { fetcher, net };
}
