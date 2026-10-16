'use strict';
// The real weather where a player is.
//
// The place is the approximate one the host works out from the connection (on Vercel, the x-vercel-ip-*
// headers: a city, never an address); without one, Atani. The weather there is asked of the Norwegian
// Meteorological Institute's forecast service (api.met.no, free to use with credit: CC BY 4.0, shown in the
// game's Settings), and kept for each place, rounded to a tenth of a degree, for as long as MET says it holds
// (at least ten minutes, at most an hour), so that one answer serves everyone near there. Nothing about who
// asked is kept. If MET cannot be reached, the answer says so and the game keeps weather of its own.

const { SCHEMA: S } = require('./schema.js');

// the game's own town, when the player's place is not known (Asaba, Delta State, since 13 October 2026)
const ATANI = { lat: 6.198, lon: 6.733, place: 'Asaba' };
const SOURCE = 'https://api.met.no/weatherapi/locationforecast/2.0/compact';
// MET asks every caller to say who it is and how to reach them
const AGENT = 'PostCivilWar/1.0 (+https://postcivilwar.com)';

// Where the connection comes from, as far as the host can tell.
function placeOf(req) {
  const h = (req && req.headers) || {};
  const lat = Number(h['x-vercel-ip-latitude']), lon = Number(h['x-vercel-ip-longitude']);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180 || (lat === 0 && lon === 0)) return { ...ATANI, guessed: true };
  let place = '';
  try { place = decodeURIComponent(String(h['x-vercel-ip-city'] || '')).slice(0, 60); } catch (error) { place = ''; }
  return { lat, lon, place: place.replace(/[^\p{L}\p{M} .'-]/gu, '').trim(), guessed: false };
}

// MET's words for the sky, as the four kinds the town knows. Snow and sleet are not weather the town can show:
// they are a grey sky. Thunder is a storm.
function kindOf(symbol) {
  const s = String(symbol || '').replace(/_(day|night|polartwilight)$/, '');
  if (!s) return null;
  if (s.includes('thunder')) return 'storm';
  if (s.includes('snow') || s.includes('sleet')) return 'cloudy';
  if (s.includes('rain')) return 'rain';
  if (s === 'clearsky' || s === 'fair') return 'clear';
  if (s === 'partlycloudy' || s === 'cloudy' || s === 'fog') return 'cloudy';
  return 'cloudy';
}

const round = (n) => Math.round(n * 10) / 10;

async function ask(lat, lon, fetcher) {
  const control = new AbortController();
  const timer = setTimeout(() => control.abort(), 5000);
  try {
    const r = await fetcher(`${SOURCE}?lat=${lat.toFixed(1)}&lon=${lon.toFixed(1)}`, { headers: { 'User-Agent': AGENT, Accept: 'application/json' }, signal: control.signal });
    if (!r.ok) return null;
    const data = await r.json();
    const now = data && data.properties && data.properties.timeseries && data.properties.timeseries[0];
    if (!now || !now.data) return null;
    const symbol = (now.data.next_1_hours && now.data.next_1_hours.summary && now.data.next_1_hours.summary.symbol_code) || (now.data.next_6_hours && now.data.next_6_hours.summary && now.data.next_6_hours.summary.symbol_code);
    const kind = kindOf(symbol);
    if (!kind) return null;
    const d = (now.data.instant && now.data.instant.details) || {};
    let expires = Date.parse(r.headers && r.headers.get ? r.headers.get('expires') || '' : '');
    if (!Number.isFinite(expires)) expires = Date.now() + 30 * 60 * 1000;
    expires = Math.min(Math.max(expires, Date.now() + 10 * 60 * 1000), Date.now() + 60 * 60 * 1000);
    return { kind, symbol: String(symbol), temperature: Number.isFinite(d.air_temperature) ? d.air_temperature : null, clouds: Number.isFinite(d.cloud_area_fraction) ? d.cloud_area_fraction : null, at: now.time || null, expires };
  } catch (error) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// { weather: { kind, temperature, place, source } } or { weather: null } if it cannot be had just now.
async function current(sql, req, fetcher = globalThis.fetch) {
  const where = placeOf(req);
  const lat = round(where.lat), lon = round(where.lon);
  const key = `${lat.toFixed(1)},${lon.toFixed(1)}`;
  const answer = (row) => ({ weather: { kind: row.kind, temperature: row.detail && Number.isFinite(row.detail.temperature) ? row.detail.temperature : null, place: where.place || null, source: 'MET Norway' } });
  const kept = await sql.unsafe(`select kind, detail from ${S}.weather_cache where place = $1 and expires_at > now()`, [key]);
  if (kept.length) return answer(kept[0]);
  if (typeof fetcher !== 'function') return { weather: null };
  const got = await ask(lat, lon, fetcher);
  if (!got) {
    // MET did not answer: what was last known there, if it is not more than three hours old
    const old = await sql.unsafe(`select kind, detail from ${S}.weather_cache where place = $1 and fetched_at > now() - interval '3 hours'`, [key]);
    return old.length ? answer(old[0]) : { weather: null };
  }
  const detail = { symbol: got.symbol, temperature: got.temperature, clouds: got.clouds, at: got.at };
  await sql.unsafe(`insert into ${S}.weather_cache (place, kind, detail, fetched_at, expires_at) values ($1, $2, $3::text::jsonb, now(), to_timestamp($4 / 1000.0))
    on conflict (place) do update set kind = excluded.kind, detail = excluded.detail, fetched_at = excluded.fetched_at, expires_at = excluded.expires_at`, [key, got.kind, JSON.stringify(detail), got.expires]);
  return answer({ kind: got.kind, detail });
}

module.exports = { current, placeOf, kindOf, ATANI, SOURCE, AGENT };
