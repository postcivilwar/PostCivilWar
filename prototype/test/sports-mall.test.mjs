// The Post Civil War Sports Mall (30 October 2026): where it stands, what is solid, its doors, its eight things on show
// at the owner's prices, and what may not be brought into its hall.
import test from 'node:test';
import assert from 'node:assert/strict';
import { town } from './world.mjs';
import { SPORTS, SPORT_IDS, NOT_FOR_SALE, sportOfModel, sportModel } from '../src/sim/sports.js';
import { SPORTS_MALL, inSportsHall, onSportsExit, sportsAtDoors, inSportsCompound, sportsDisplayNear, sportsBuildingAt, CARSHOW, AIRPORT, OUTSKIRT_BUILDINGS, OUTSKIRT_ROADS, zoneWalkable, zoneSolid } from '../src/sim/zone.js';
import { SPORTS_PARTS } from '../src/client/sports-parts.js';

const M = SPORTS_MALL, C = M.compound, H = M.hall, B = M.building;

test('the eight things on sale at the owner\'s prices: 50 TR to 600 TR, the speedboat the dearest, the skateboard the cheapest; the naval ship not sold', () => {
  assert.equal(SPORT_IDS.length, 8);
  const prices = Object.fromEntries(SPORT_IDS.map((id) => [id, SPORTS[id].price]));
  // (his of 30 October 2026, 22:01: the speedboat 600 TR, the bicycle 300, the e-scooter 200, the skateboard the cheapest at 50; the
  // other four between, in the order of the plan he was sent)
  assert.deepEqual(prices, { bicycle: 300, speedboat: 600, 'e-scooter': 200, 'e-unicycle': 150, hoverboard: 120, surfboard: 100, 'inline-skates': 75, skateboard: 50 });
  assert.equal(Math.min(...Object.values(prices)), 50);
  assert.equal(Math.max(...Object.values(prices)), 600);
  for (const id of SPORT_IDS) if (id !== 'skateboard') assert.ok(prices[id] > prices.skateboard, `${id}: dearer than the skateboard`);
  assert.deepEqual(NOT_FOR_SALE, ['naval-ship']);
  assert.ok(!SPORT_IDS.includes('naval-ship'));
  // each has its model (the game's copy of the owner's file), and is named by the market as sport:<id>
  for (const id of SPORT_IDS) { assert.ok(SPORTS_PARTS[id], id); assert.equal(sportOfModel(sportModel(id)), SPORTS[id]); }
  assert.ok(SPORTS_PARTS['naval-ship'], 'the naval ship\'s model is made ready too');
  assert.equal(sportOfModel('car:grey-saloon'), null);
  // no maker's name anywhere in what a player reads
  for (const s of Object.values(SPORTS)) assert.doesNotMatch(`${s.name} ${s.blurb}`, /segway|ninebot|xiaomi|razor|boosted|rollerblade|powerslide|yamaha|mercury|evinrude/i, s.id);
});

test('the mall stands on open land by the Kwale road, between the airport\'s road and the car showroom, clear of both', () => {
  const road = OUTSKIRT_ROADS.find((r) => r.id === 'onitsha'), airportRoad = OUTSKIRT_ROADS.find((r) => r.id === 'airport-access');
  assert.ok(C.z1 < road.z0 && C.z1 > road.z0 - 30, 'its front by the road, on the inland side');
  assert.ok(C.x0 > airportRoad.x1 + 20, 'clear of the airport\'s road');
  assert.ok(C.x1 < CARSHOW.compound.x0 - 5, 'clear of the car showroom\'s compound');
  assert.ok(C.z0 > AIRPORT.fence.z1 + 50, 'clear of the airport\'s fence');
  // nothing of the roadside's shops stands in front of it or in it
  for (const b of OUTSKIRT_BUILDINGS) assert.ok(b.x + b.w / 2 < C.x0 - 6 || b.x - b.w / 2 > C.x1 + 6 || b.z > C.z1 + 20, b.id);
  // the building inside the compound, the hall inside the building, the doors in its front
  assert.ok(B.x0 > C.x0 && B.x1 < C.x1 && B.z0 > C.z0 && B.z1 < C.z1);
  assert.ok(H.x0 > B.x0 && H.x1 < B.x1 && H.z0 > B.z0 && H.z1 < B.z1);
  assert.equal(M.doors.z, B.z1);
  // the gateway, the walk to the doors and the doors' step are open ground; the road's verge leads to it
  for (const [x, z] of [[M.gateway.x, M.gateway.z], [M.gateway.x, M.gateway.z - 3], [M.entry.x, M.entry.z], [M.leave.x, M.leave.z], [M.gateway.x, -58]]) assert.ok(zoneWalkable(x, z, []), `${x}, ${z}`);
  // the railings are solid but at the gateway
  for (let x = C.x0 + 1; x < C.x1 - 1; x += 2) if (Math.abs(x - M.gateway.x) > M.gateway.width / 2 + 1.2) assert.equal(zoneWalkable(x, C.z1, [], 0.3), false, `the front railings at ${x}`);
  for (let z = C.z0 + 1; z < C.z1 - 1; z += 2) { assert.equal(zoneWalkable(C.x0, z, [], 0.3), false); assert.equal(zoneWalkable(C.x1, z, [], 0.3), false); }
  // the building's walls round the hall, and its glass front: nobody walks in but by the doors
  for (let x = H.x0 + 0.5; x < H.x1 - 0.5; x += 1) { assert.equal(zoneWalkable(x, H.z0 - 0.6, []), false, `the back wall at ${x}`); assert.equal(zoneWalkable(x, H.z1 + 0.5, []), false, `the glass front at ${x}`); }
  for (let z = H.z0 + 0.5; z < H.z1 - 0.5; z += 1) { assert.equal(zoneWalkable(H.x0 - 0.6, z, []), false); assert.equal(zoneWalkable(H.x1 + 0.6, z, []), false); }
  // tall to the camera outside, not inside its own hall
  assert.ok(sportsBuildingAt((B.x0 + B.x1) / 2, B.z0 + 1) > 9);
  assert.ok(inSportsCompound(M.gateway.x, M.gateway.z - 5) && !inSportsCompound(M.gateway.x, M.gateway.z + 5));
});

test('the hall: each thing on its own stand with room all round, its plate before it; the boat in the middle facing the doors', () => {
  const D = M.displays;
  assert.equal(D.length, 8);
  assert.deepEqual([...D.map((d) => d.item)].sort(), [...SPORT_IDS].sort());
  for (const d of D) {
    assert.ok(inSportsHall(d.x, d.z, d.r + 1.5), `${d.item}: its stand within the hall, with a walk round it`);
    const size = SPORTS_PARTS[d.item].size;
    assert.ok(d.r * 2 > Math.max(size[0], d.upright ? 0 : size[2]) * 0.98, `${d.item}: on a stand as large as itself`);
    for (const e of D) if (e !== d) assert.ok(Math.hypot(d.x - e.x, d.z - e.z) - d.r - e.r > 2.4, `${d.item} and ${e.item}: room to walk between`);
    // walked up to from any side, it is the one asked about
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = d.x + dx * (d.r + 0.5), z = d.z + dz * (d.r + 0.5);
      if (!zoneWalkable(x, z, [])) continue;
      assert.equal(sportsDisplayNear(x, z).display.item, d.item, `${d.item} from ${dx},${dz}`);
    }
    assert.ok(zoneSolid(d.x, d.z, 0.2), `${d.item}: its stand is solid`);
  }
  const boat = D.find((d) => d.item === 'speedboat');
  assert.equal(boat.x, M.doors.x, 'the boat faces the doors, in the middle');
  assert.equal(boat.stand, 'platform');
  assert.ok(D.find((d) => d.item === 'surfboard').upright);
  // from where someone coming in is set down, the boat is ahead
  assert.ok(M.arrive.z > boat.z && Math.abs(M.arrive.x - boat.x) < 0.01);
});

test('the doors: in from before them, not from across the forecourt; out by the mat, not from the floor', () => {
  const w = town(['Shopper One']);
  const { p, id, send, place } = w;
  place(p, M.entry.x, M.entry.z + 8, Math.PI);
  assert.equal(send(id, { type: 'sports.in' }).code, 'TOO_FAR');
  place(p, M.entry.x, M.entry.z + 0.8, Math.PI);
  assert.ok(sportsAtDoors(p.x, p.z));
  const r = send(id, { type: 'sports.in' });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.ok(inSportsHall(p.x, p.z));
  assert.equal(r.heading, M.arrive.heading);
  assert.equal(p.stats.sports, 1);
  // out: from the middle of the floor, refused; from the mat, out before the doors
  place(p, (H.x0 + H.x1) / 2 - 8, (H.z0 + H.z1) / 2, 0);
  assert.equal(send(id, { type: 'sports.out' }).code, 'TOO_FAR');
  const mat = M.exit;
  place(p, (mat.x0 + mat.x1) / 2, (mat.z0 + mat.z1) / 2, 0);
  assert.ok(onSportsExit(p.x, p.z));
  const o = send(id, { type: 'sports.out' });
  assert.equal(o.ok, true);
  assert.ok(!inSportsHall(p.x, p.z) && inSportsCompound(p.x, p.z));
  assert.ok(zoneWalkable(p.x, p.z, []), 'set down on open ground');
  // out again from outside: not inside
  assert.equal(send(id, { type: 'sports.out' }).code, 'NOT_INSIDE');
  // in a fight, the doors do not open
  place(p, M.entry.x, M.entry.z + 0.8, Math.PI);
  p.fight = { with: 'x', since: 0 };
  assert.equal(send(id, { type: 'sports.in' }).code, 'FIGHTING');
});

test('nobody\'s car or motorcycle is brought into the mall\'s hall', () => {
  const w = town(['Driver In Mall']);
  const { p, id, send, place } = w;
  p.cars = ['grey-saloon']; p.bikes = ['streetfighter'];
  place(p, M.arrive.x, M.arrive.z, Math.PI);
  assert.equal(send(id, { type: 'cars.enter', car: 'grey-saloon' }).code, 'INDOORS');
  assert.equal(send(id, { type: 'bikes.ride', bike: 'streetfighter' }).code, 'INDOORS');
});
