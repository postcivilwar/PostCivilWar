// The Map app's map: what can be checked of it without a page. The page itself is walked through in test/play.mjs.
//
//   node --test test/map.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHost } from '../src/sim/host.js';
import { ZONE, ZONE_ROADS, ZONE_SERVICES, ZONE_BUILDINGS, ZONE_PARCELS, ZONE_PROPS, zoneShoreZ } from '../src/sim/zone.js';
import { MAP_STYLE, roadRank, mapExtent } from '../src/client/town-map.js';
import { ok, walkTo } from './helpers.mjs';

const onRoad = (x, z, slack = 0.8) => ZONE_ROADS.some((r) => x >= r.x0 - slack && x <= r.x1 + slack && z >= r.z0 - slack && z <= r.z1 + slack);
// is every point of the line from a to b on a road?
const alongRoad = ([ax, az], [bx, bz]) => { const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 2)); for (let i = 0; i <= steps; i += 1) if (!onRoad(ax + ((bx - ax) * i) / steps, az + ((bz - az) * i) / steps)) return false; return true; };
const lengthOf = (points) => points.reduce((sum, p, i) => (i ? sum + Math.hypot(p[0] - points[i - 1][0], p[1] - points[i - 1][1]) : 0), 0);

test('the way shown on the map keeps to the town\'s roads: only its first step to the road and its last from it leave them', () => {
  const host = createHost();
  const id = host.game.join({ name: 'Ada Obi', look: {} });
  const starts = [null, [48, -58], [-95, -178], [30, 14], [-140, -62]];
  let checked = 0;
  for (const start of starts) {
    if (start) walkTo(host, id, start[0], start[1]);
    const me = host.game.view(id).self;
    for (const place of ZONE_SERVICES) {
      const way = ok(host.game.intent(id, { type: 'map.route', x: place.x, z: place.z, label: place.name }));
      assert.ok(Array.isArray(way.road) && way.road.length >= 2, `${place.name}: a way by road`);
      const road = way.road;
      // it begins where the player is and ends at the place
      assert.ok(Math.hypot(road[0][0] - me.x, road[0][1] - me.z) < 0.2, `${place.name}: begins at the player`);
      assert.ok(Math.hypot(road[road.length - 1][0] - place.x, road[road.length - 1][1] - place.z) < 0.2, `${place.name}: ends at the place`);
      const direct = Math.hypot(place.x - me.x, place.z - me.z);
      if (road.length === 2) { assert.ok(direct < 18, `${place.name}: a straight line only between two places within sight of each other (${Math.round(direct)} m)`); continue; }
      // everything between the first step and the last is on a road, every metre of it
      for (let i = 1; i < road.length - 2; i += 1) assert.ok(alongRoad(road[i], road[i + 1]), `${place.name}: from ${road[i]} to ${road[i + 1]} is not along a road`);
      // and those two steps are short: to the road from where one stands, and from it to the door
      assert.ok(Math.hypot(road[1][0] - road[0][0], road[1][1] - road[0][1]) <= 71, `${place.name}: ${Math.round(Math.hypot(road[1][0] - road[0][0], road[1][1] - road[0][1]))} m to reach the road`);
      assert.ok(Math.hypot(road[road.length - 1][0] - road[road.length - 2][0], road[road.length - 1][1] - road[road.length - 2][1]) <= 71, `${place.name}: a long way from the road to the door`);
      // the distance given is the length of that line, and it is never less than the crow flies
      assert.ok(Math.abs(way.roadMetres - lengthOf(road)) <= 1.5, `${place.name}: ${way.roadMetres} m said, ${lengthOf(road).toFixed(1)} m drawn`);
      assert.ok(way.roadMetres >= Math.floor(direct) - 1, `${place.name}: shorter than a straight line`);
      checked += 1;
    }
  }
  assert.ok(checked >= 30, `${checked} ways checked`);
});

test('the roads are of three ranks, and every road in the town has one', () => {
  const ranks = ZONE_ROADS.map(roadRank);
  assert.ok(ranks.every((r) => r === 0 || r === 1 || r === 2));
  for (const rank of [0, 1, 2]) assert.ok(ranks.includes(rank), `rank ${rank}`);
  // the broad tarred roads are the highest rank, the footpaths the lowest
  for (const r of ZONE_ROADS) { if (r.surface === 'asphalt') assert.equal(roadRank(r), 0, r.name); if (r.surface === 'path') assert.equal(roadRank(r), 2, r.name); }
  assert.ok(ZONE_ROADS.every((r) => typeof r.name === 'string' && r.name.length > 3), 'every road has a name to put on the map');
});

test('the map is the town and nothing else: its edges are the zone\'s, north is up, and the river is where the river is', () => {
  const e = mapExtent();
  const b = ZONE.bounds;
  // the same ground, whichever way the town's own grid is turned
  assert.equal(Math.round((e.maxE - e.minE) * (e.maxS - e.minS)), (b.maxX - b.minX) * (b.maxZ - b.minZ));
  // the river is water on the map exactly where it is water in the town
  for (const x of [-200, -50, 0, 120, 240]) { const shore = zoneShoreZ(x); assert.ok(shore > b.minZ && shore < b.maxZ, `the bank at x=${x} is inside the map`); }
  // no map service, no picture of a map: it is drawn from the town's own data
  const source = readFileSync(new URL('../src/client/town-map.js', import.meta.url), 'utf8');
  assert.ok(!/https?:\/\/|tile|mapbox|leaflet|openstreetmap|google/i.test(source.replace(/\/\/.*$/gm, '').replace(/'http:\/\/www\.w3\.org\/2000\/svg'/g, '')), 'the map asks nobody else for anything');
  for (const name of ['ZONE_ROADS', 'ZONE_BUILDINGS', 'ZONE_HOUSES', 'ZONE_PARCELS', 'ZONE_TREES', 'ZONE_COMPOUNDS', 'ZONE_FARMLAND', 'zoneShoreZ', 'ZONE_JETTY']) assert.ok(source.includes(name), `${name} is on the map`);
  // land is green, water is blue, and they are not alike; the three ranks of road are told apart
  const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const [lr, lg, lb] = rgb(MAP_STYLE.land), [wr, wg, wb] = rgb(MAP_STYLE.water);
  assert.ok(lg > lr && lg > lb, 'land is green');
  assert.ok(wb > wr && wb > wg, 'water is blue');
  assert.equal(new Set([MAP_STYLE.major, MAP_STYLE.minor, MAP_STYLE.lane]).size, 3);
  assert.ok(ZONE_BUILDINGS.length > 10 && ZONE_PARCELS.length > 10 && ZONE_PROPS.mapLabels.length > 10);
});
