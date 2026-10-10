// What the server's tests share: the handler itself, called as the host calls it, and a way to be several
// different people at once. Needs PCW_DATABASE_URL (server/with-postgres.sh sets it).
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';

const require = createRequire(import.meta.url);
export const game = require('../../api/game.js');
export const { database, closeDatabase } = require('../../api/_lib/db.js');
export const { HOLARIS } = require('../../api/_lib/schema.js');

if (!process.env.PCW_DATABASE_URL) throw new Error('PCW_DATABASE_URL is not set: run these with server/with-postgres.sh');

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

export const uuid = () => randomUUID();
export const NEAR_HOLARIS = { x: HOLARIS.x, z: HOLARIS.z };
export const ZONE = 'NG-AN-OGB-Z1';
