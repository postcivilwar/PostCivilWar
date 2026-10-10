'use strict';
// The database: one small pool of connections, shared by every request this process answers, and the tables
// brought up to date the first time it is used.
//
// The address comes from the environment and from nowhere else: POSTGRES_URL is what the host's database
// integration sets (PCW_DATABASE_URL, if set, is used instead; the tests set it). Nothing in the page ever
// sees it.
//
// The pool goes through the database's connection pooler, which hands a connection to one transaction at a
// time. So nothing here keeps anything on a connection between statements: no prepared statements, no
// session settings, and locks that last only as long as the transaction that took them.

const postgres = require('./postgres/index.js');
const { MIGRATIONS, SCHEMA } = require('./schema.js');

let sql = null;
let ready = null;

function optionsFrom(env) {
  const address = env.PCW_DATABASE_URL || env.POSTGRES_URL || env.DATABASE_URL || '';
  if (!address) return null;
  const url = new URL(address);
  const local = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(url.hostname);
  const mode = url.searchParams.get('sslmode');
  // Encrypted always, except to a database on this same machine. With the authority's certificate given in
  // PCW_DATABASE_CA the server is also proved to be the right one; without it the link is encrypted only.
  let ssl = 'require';
  if (mode === 'disable' || (local && !mode)) ssl = false;
  else if (env.PCW_DATABASE_CA) ssl = { ca: env.PCW_DATABASE_CA.replace(/\\n/g, '\n'), rejectUnauthorized: true };
  return {
    host: url.hostname.replace(/^\[|\]$/g, ''),
    port: Number(url.port) || 5432,
    database: decodeURIComponent(url.pathname.replace(/^\//, '')) || 'postgres',
    username: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    ssl,
    prepare: false,
    fetch_types: false,
    max: Math.max(1, Math.min(10, Number(env.PCW_DB_MAX) || 3)),
    idle_timeout: 20,
    connect_timeout: 10,
    onnotice() {},
  };
}

const configured = () => !!optionsFrom(process.env);

// Brings the tables up to date. Each step is applied once, in order, inside one transaction that holds a lock,
// so two processes starting together cannot both apply a step.
async function migrate(db) {
  await db.begin(async (tx) => {
    await tx.unsafe('select pg_advisory_xact_lock(7203114)');
    await tx.unsafe(`create schema if not exists ${SCHEMA}`);
    await tx.unsafe(`create table if not exists ${SCHEMA}.migrations (id integer primary key, name text not null, applied_at timestamptz not null default now())`);
    const done = new Set((await tx.unsafe(`select id from ${SCHEMA}.migrations`)).map((row) => row.id));
    for (const step of MIGRATIONS) {
      if (done.has(step.id)) continue;
      for (const statement of step.statements) await tx.unsafe(statement);
      await tx.unsafe(`insert into ${SCHEMA}.migrations (id, name) values ($1, $2)`, [step.id, step.name]);
    }
  });
}

// The pool, ready to use. Fails with code NO_DATABASE when the site has been given no database.
async function database() {
  if (!sql) {
    const options = optionsFrom(process.env);
    if (!options) { const error = new Error('no database is configured'); error.code = 'NO_DATABASE'; throw error; }
    sql = postgres(options);
  }
  if (!ready) ready = migrate(sql).catch((error) => { ready = null; throw error; });
  await ready;
  return sql;
}

// For the tests: let go of every connection, so the process can end.
async function closeDatabase() {
  const old = sql;
  sql = null; ready = null;
  if (old) await old.end({ timeout: 2 });
}

module.exports = { database, closeDatabase, configured, SCHEMA };
