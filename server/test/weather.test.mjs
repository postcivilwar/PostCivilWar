// The real weather where a player is (api/_lib/weather.js): asked of MET Norway for the place the host says
// the connection comes from, kept for each place for a while, and nothing about who asked.
//   server/with-postgres.sh node --test server/test/weather.test.mjs
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { request, database, closeDatabase } from './harness.mjs';

const require = createRequire(import.meta.url);
const weather = require('../../api/_lib/weather.js');
after(() => closeDatabase());

// MET, as far as these tests need it: what was asked, and an answer to give
const met = { asked: [], answer: null, fail: false };
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  met.asked.push({ url: String(url), agent: init.headers && init.headers['User-Agent'] });
  if (met.fail) throw new TypeError('fetch failed');
  const body = met.answer;
  return { ok: !!body, status: body ? 200 : 503, headers: { get: (name) => (name === 'expires' ? new Date(Date.now() + 40 * 60 * 1000).toUTCString() : null) }, json: async () => body };
};
after(() => { globalThis.fetch = realFetch; });
const forecast = (symbol, temperature = 27.4) => ({ properties: { timeseries: [{ time: '2026-10-12T08:00:00Z', data: { instant: { details: { air_temperature: temperature, cloud_area_fraction: 80 } }, next_1_hours: { summary: { symbol_code: symbol } } } }] } });
const from = (lat, lon, city) => ({ 'x-vercel-ip-latitude': String(lat), 'x-vercel-ip-longitude': String(lon), ...(city ? { 'x-vercel-ip-city': encodeURIComponent(city) } : {}) });
const ask = (headers = {}) => request({ body: { op: 'world.weather' }, headers, address: `10.9.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` });

test('the sky where the player is: asked of MET for the place the connection comes from, said as one of the town\'s four kinds', async () => {
  met.asked.length = 0; met.answer = forecast('lightrain_day', 26.6); met.fail = false;
  const r = await ask(from(6.4541, 3.3947, 'Lagos'));
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.weather, { kind: 'rain', temperature: 26.6, place: 'Lagos', source: 'MET Norway' });
  assert.equal(met.asked.length, 1);
  assert.equal(met.asked[0].url, `${weather.SOURCE}?lat=6.5&lon=3.4`, 'the place, to a tenth of a degree: no nearer');
  assert.match(met.asked[0].agent, /PostCivilWar/, 'MET is told who is asking');
  // someone else nearby is given the same answer, without MET being asked again
  const again = await ask(from(6.47, 3.41, 'Lagos'));
  assert.equal(again.body.weather.kind, 'rain');
  assert.equal(met.asked.length, 1);
  // and nothing about either of them is kept: one row for the place, with the weather in it
  const rows = await (await database()).unsafe('select * from pcw.weather_cache');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].place, '6.5,3.4');
  assert.deepEqual(Object.keys(rows[0].detail).sort(), ['at', 'clouds', 'symbol', 'temperature']);
});

test('with no place from the host, Atani\'s weather', async () => {
  met.asked.length = 0; met.answer = forecast('clearsky_night', 24); met.fail = false;
  const r = await ask();
  assert.equal(r.body.weather.kind, 'clear');
  assert.equal(r.body.weather.place, 'Asaba', 'and it says so');
  assert.equal(met.asked[0].url, `${weather.SOURCE}?lat=6.2&lon=6.7`);
  // a place that makes no sense is no place
  met.asked.length = 0;
  await ask(from('north', 900));
  assert.equal(met.asked.length, 0, 'Asaba again, and it is already known');
});

test('MET not answering: the last weather known there, if it is recent; otherwise none, and the town keeps its own', async () => {
  const sql = await database();
  met.asked.length = 0; met.fail = true;
  const none = await ask(from(52.52, 13.4, 'Berlin'));
  assert.equal(none.status, 200);
  assert.equal(none.body.weather, null);
  // known an hour ago and since gone stale: still the best there is
  met.fail = false; met.answer = forecast('heavyrainandthunder', 12);
  assert.equal((await ask(from(52.52, 13.4, 'Berlin'))).body.weather.kind, 'storm');
  await sql.unsafe(`update pcw.weather_cache set expires_at = now() - interval '1 minute', fetched_at = now() - interval '1 hour' where place = '52.5,13.4'`);
  met.fail = true;
  assert.equal((await ask(from(52.52, 13.4, 'Berlin'))).body.weather.kind, 'storm');
  await sql.unsafe(`update pcw.weather_cache set fetched_at = now() - interval '4 hours' where place = '52.5,13.4'`);
  assert.equal((await ask(from(52.52, 13.4, 'Berlin'))).body.weather, null);
  // and once it answers again, the new weather, kept
  met.fail = false; met.answer = forecast('partlycloudy_day', 15);
  assert.equal((await ask(from(52.52, 13.4, 'Berlin'))).body.weather.kind, 'cloudy');
});

test('MET\'s words for the sky, as the town\'s four kinds', () => {
  const cases = { clearsky_day: 'clear', clearsky_night: 'clear', fair_polartwilight: 'clear', partlycloudy_day: 'cloudy', cloudy: 'cloudy', fog: 'cloudy', lightrain: 'rain', rain: 'rain', heavyrain: 'rain', rainshowers_day: 'rain', lightrainshowersandthunder_night: 'storm', heavyrainandthunder: 'storm', snow: 'cloudy', lightsleet: 'cloudy', heavysnowshowers_day: 'cloudy' };
  for (const [symbol, kind] of Object.entries(cases)) assert.equal(weather.kindOf(symbol), kind, symbol);
  assert.equal(weather.kindOf(''), null);
});
