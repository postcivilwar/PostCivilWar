// The city's roads are tar (4 November 2026, the owner: "the max is 36km/h ... build it so drivers can ride the km/h
// based on the car own speed, including on motorcycles"): a car, a motorcycle or anything ridden on the city's roads,
// roundabouts, flyovers and expressway goes as fast as it does on the town's tar; on the city's grass, as off the tar.
//   node --test test/city-speed.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { MOTO, motoSpeedAt } from '../src/sim/okada.js';
import { OGANIRU, OGANIRU_ROADS, OGANIRU_DECKS, OGANIRU_ROUNDABOUTS, oganiruTar, onOganiru } from '../src/sim/zones/oganiru.js';
import { POWER_CARS, carHandlingOf, stepPowerCar } from '../src/sim/power-cars.js';
import { POWER_BIKES, stepPowerBike, handlingOf } from '../src/sim/power-bikes.js';

const tar = (x, z) => motoSpeedAt(x, z, false) === MOTO.speedRoad;
// a point on each road, near its middle, found by trying across it
function onRoad(r) {
  const a = (r.from + r.to) / 2;
  for (let off = -r.half; off <= r.half; off += 0.5) {
    const [x, z] = r.along === 'x' ? [a, r.c + off] : [r.c + off, a];
    if (Number.isFinite(x) && oganiruTar(x, z)) return [x, z];
  }
  return null;
}

test('the city\'s roads, roundabouts and decks are tar to a vehicle; its grass is not', () => {
  const roads = OGANIRU_ROADS.filter((r) => r.along === 'x' || r.along === 'z').map(onRoad).filter(Boolean);
  assert.ok(roads.length >= 10, `points found on ${roads.length} roads`);
  for (const [x, z] of roads) assert.ok(tar(x, z), `${x}, ${z}`);
  for (const r of OGANIRU_ROUNDABOUTS) { const x = r.x + (r.outer + r.island) / 2, z = r.z; assert.ok(tar(x, z), `roundabout at ${r.x}, ${r.z}`); }
  let decks = 0;
  for (const d of OGANIRU_DECKS) {
    const p = d.path[Math.floor(d.path.length / 2)];
    const [x, z] = [p.x, p.z];
    decks += 1;
    assert.ok(tar(x, z), `deck ${d.id} at ${x}, ${z}`);
  }
  // grass: a point of the city's land that is no road
  let grass = null;
  for (let x = OGANIRU.bounds.x0 + 5; x < OGANIRU.bounds.x1 && !grass; x += 7) for (let z = OGANIRU.bounds.z0 + 5; z < OGANIRU.bounds.z1 && !grass; z += 7) if (onOganiru(x, z) && !oganiruTar(x, z)) grass = [x, z];
  assert.ok(grass, 'a point of grass found');
  assert.ok(!tar(...grass), `grass at ${grass}`);
  assert.equal(decks, OGANIRU_DECKS.length);
});

test('on the city\'s road the fastest car and motorcycle reach their own top speed, well past 36 km/h', () => {
  const r = OGANIRU_ROADS.find((q) => q.id === 'unity') || OGANIRU_ROADS[0];
  const [x, z] = onRoad(r);
  const fastest = Object.values(POWER_CARS).sort((a, b) => b.kmh - a.kmh)[0];
  const h = carHandlingOf(fastest);
  const car = { speed: 0, heading: 0, steer: 0 };
  for (let i = 0; i < 60 * 40; i += 1) stepPowerCar(car, { steer: 0, throttle: 1, brake: 0 }, 1 / 60, { handling: h, onTar: tar(x, z), wet: false });
  assert.ok(car.speed * 3.6 > fastest.kmh * 0.95, `${fastest.id}: ${(car.speed * 3.6).toFixed(0)} of ${fastest.kmh} km/h`);
  const bike = Object.values(POWER_BIKES)[0];
  const bh = handlingOf(bike);
  const b = { speed: 0, heading: 0, steer: 0, lean: 0 };
  for (let i = 0; i < 60 * 40; i += 1) stepPowerBike(b, { steer: 0, throttle: 1, brake: 0 }, 1 / 60, { handling: bh, onTar: tar(x, z), wet: false });
  assert.ok(b.speed * 3.6 > 60, `${bike.id || 'motorcycle'}: ${(b.speed * 3.6).toFixed(0)} km/h`);
});
