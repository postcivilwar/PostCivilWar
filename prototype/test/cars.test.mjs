// The Post Civil War Car Showroom and a player's own cars, in the town (17 October 2026): the twenty cars and how they
// go; only what the server says is theirs can be driven; getting in (brought to them, or where they left it), driving
// within what the car can do and never through anything solid, getting out on the driver's side and finding it where
// it stands; the compound, its gate and its doors; the hall, spacious, with its two salespeople each looking after
// one side of the floor.
import test from 'node:test';
import assert from 'node:assert/strict';
import { town, run } from './world.mjs';
import { POWER_CARS, carHandlingOf, stepPowerCar, carRevs, carCircles, carBoxes, CAR_FASTEST } from '../src/sim/power-cars.js';
import { carCrashHarm, CAR_CRASH, carFits } from '../src/sim/own-cars.js';
import { CAR_PARTS } from '../src/client/car-parts.js';
import { CARSHOW, inCarHall, onCarshowExit, carshowAtDoors, carshowDisplayNear, carshowSideAt, carshowSideOf, stepCarshowGate, carshowGateBoxes, carshowBuildingAt, inCarCompound, zoneWalkable, zoneSolid } from '../src/sim/zone.js';
import { createSalesman } from '../src/sim/salesman.js';
import { carProfile, carHornOf } from '../src/client/car-audio.js';

const IDS = Object.keys(POWER_CARS);
const G = CARSHOW.gate;

test('the twenty cars: each is the owner\'s model in five parts (every triangle kept), priced from 600 TR to 6,000 TR (the owner\'s of 18 October 2026), with its own top speed', () => {
  assert.equal(IDS.length, 20);
  assert.deepEqual([...IDS].sort(), Object.keys(CAR_PARTS).sort());
  for (const id of IDS) {
    const c = POWER_CARS[id], parts = CAR_PARTS[id];
    assert.ok(c.price >= 600 && c.price <= 6000 && c.price % 50 === 0, `${id}: ${c.price}`);
    assert.equal(parts.parts.length, 5, `${id}: the body and four wheels`);
    assert.equal(parts.parts.reduce((a, n) => a + n, 0), parts.triangles, `${id}: every triangle kept`);
    assert.equal(parts.wheels.length, 4);
    const [fl, fr, rl, rr] = parts.wheels;
    assert.ok(fl.z > 0 && fr.z > 0 && rl.z < 0 && rr.z < 0, `${id}: front wheels ahead, back wheels behind`);
    assert.ok(fl.x > 0 && fr.x < 0 && rl.x > 0 && rr.x < 0, `${id}: left wheels at +x, as the car faces +z`);
    for (const w of parts.wheels) assert.ok(w.r > 0 && Math.abs(w.y - w.r) < 0.02 * parts.length, `${id}: each wheel stands on the ground`);
    // its real size: long enough, no wider than a road car is, no lower than a supercar
    assert.ok(c.length >= 4.3 && c.length <= 6 && c.width >= 1.8 && c.width <= 2.5 && c.height >= 1.1 && c.height <= 2.6, id);
    assert.ok(c.kmh >= 140 && c.kmh <= 350, id);
    assert.equal(Math.round(carHandlingOf(c).top * 3.6), c.kmh, `${id}: its speedometer reads its top speed`);
    assert.ok(c.blurb && !/\b(cc|hp|bhp|litre|cylinder|v8|v12|turbo)\b/i.test(c.blurb), `${id}: nothing said of its engine`);
  }
  assert.equal(Math.min(...IDS.map((id) => POWER_CARS[id].price)), 600);
  assert.equal(Math.max(...IDS.map((id) => POWER_CARS[id].price)), 6000);
  // dearer as the list goes, as it always was (its order is the owner's)
  for (let i = 1; i < IDS.length; i += 1) assert.ok(POWER_CARS[IDS[i]].price >= POWER_CARS[IDS[i - 1]].price, IDS[i]);
  assert.equal(Math.round(CAR_FASTEST * 3.6), 350);
  assert.equal(new Set(IDS.map((id) => POWER_CARS[id].name)).size, 20);
});

test('a car goes as a car does: smoothly up to its top speed, slows when let go, stops hard on the brake and backs up slowly; steered, it turns no harder than its tyres grip', () => {
  const c = POWER_CARS['grey-saloon'], h = carHandlingOf(c);
  const s = { speed: 0, steer: 0, heading: 0 };
  const trace = [];
  for (let i = 0; i < 60 * 40; i += 1) { stepPowerCar(s, { throttle: 1 }, 1 / 60, { handling: h }); trace.push(s.speed); }
  for (let i = 1; i < trace.length; i += 1) assert.ok(trace[i] >= trace[i - 1] && trace[i] - trace[i - 1] < 0.15, 'it gathers speed without a jump');
  assert.ok(s.speed > h.top * 0.85 && s.speed <= h.top + 1e-9, `${s.speed} of ${h.top}`);
  const at = s.speed;
  for (let i = 0; i < 60; i += 1) stepPowerCar(s, {}, 1 / 60, { handling: h });
  const coasted = at - s.speed;
  assert.ok(coasted > 0.5 && coasted < 6, `let go for a second it loses ${coasted} m/s`);
  const before = s.speed;
  for (let i = 0; i < 60; i += 1) stepPowerCar(s, { brake: 1 }, 1 / 60, { handling: h });
  assert.ok(before - s.speed > coasted * 4, 'the brake takes off far more than letting go');
  for (let i = 0; i < 60 * 10; i += 1) stepPowerCar(s, { brake: 1 }, 1 / 60, { handling: h });
  assert.ok(s.speed < 0 && s.speed >= -h.reverse, 'held on when stopped, it backs up, slowly');
  // braking to a stop does not roll it back: it stands for a moment (reverseAfter) before the brake takes it backwards
  {
    const b = { speed: 5, steer: 0, heading: 0 }, v = [];
    for (let i = 0; i < 60 * 3; i += 1) { stepPowerCar(b, { brake: 1 }, 1 / 60, { handling: h }); v.push(b.speed); }
    const stopped = v.findIndex((x) => x === 0), backing = v.findIndex((x) => x < 0);
    assert.ok(stopped > 0 && v.slice(0, stopped).every((x) => x > 0), 'it slows to a stop, going forward all the way');
    assert.ok(backing > stopped, 'and only then backs up');
    const standing = (backing - stopped) / 60;
    assert.ok(standing >= h.reverseAfter - 1 / 60 && standing <= h.reverseAfter + 2 / 60, `it stands ${standing} s, the brake held, before it backs up`);
    // let go of the brake and pressed again at a standstill: the moment starts again
    const c2 = { speed: 0, steer: 0, heading: 0 };
    for (let i = 0; i < 15; i += 1) stepPowerCar(c2, { brake: 1 }, 1 / 60, { handling: h });
    stepPowerCar(c2, {}, 1 / 60, { handling: h });
    for (let i = 0; i < 15; i += 1) stepPowerCar(c2, { brake: 1 }, 1 / 60, { handling: h });
    assert.equal(c2.speed, 0, 'two short presses at a standstill do not add up to reversing');
  }
  // the steering: at walking pace a full turn of the wheel turns it tightly; flat out, the same turn far less
  const slow = { speed: 4, steer: 0, heading: 0 }, fast = { speed: h.top, steer: 0, heading: 0 };
  for (let i = 0; i < 60; i += 1) { stepPowerCar(slow, { steer: 1, throttle: 0.2 }, 1 / 60, { handling: h }); stepPowerCar(fast, { steer: 1, throttle: 1 }, 1 / 60, { handling: h }); }
  assert.ok(slow.heading < 0, 'steering right turns it right (the heading falls)');
  const slowRadius = slow.speed / Math.abs(slow.heading - 0) , fastRate = Math.abs(fast.heading);
  assert.ok(fastRate < (h.grip / h.top) * 1.2 + 0.05, 'flat out it turns no harder than its grip');
  assert.ok(slowRadius > 0);
  // the revs: up through the gears, near the red line at the top speed
  const revs = [0, 0.1, 0.3, 0.5, 0.8, 1].map((k) => carRevs(h.top * k, 1, h));
  assert.ok(revs[0] < 0.15 && revs[5] > 0.9, JSON.stringify(revs));
  assert.ok(carRevs(h.top * 0.16, 1, h) > carRevs(h.top * 0.17, 1, h), 'a gear change drops the revs');
});

test('a car takes the room it takes: its circles cover it end to end and side to side, and nothing slips between them', () => {
  for (const id of IDS) {
    const c = POWER_CARS[id];
    for (const hd of [0, 0.7, Math.PI / 2, 2.4]) {
      const circles = carCircles(c, 10, 20, hd);
      const ux = Math.sin(hd), uz = Math.cos(hd), sx = Math.cos(hd), sz = -Math.sin(hd);
      // every point of its outline (its corners eased by a hand's breadth) is inside some circle
      for (const [a, b] of [[c.length / 2 - 0.1, 0], [-(c.length / 2 - 0.1), 0], [0, c.width / 2 - 0.05], [0, -(c.width / 2 - 0.05)], [c.length / 2 - 0.35, c.width / 2 - 0.35], [-(c.length / 2 - 0.35), -(c.width / 2 - 0.35)]]) {
        const x = 10 + ux * a + sx * b, z = 20 + uz * a + sz * b;
        assert.ok(circles.some((q) => Math.hypot(q.x - x, q.z - z) <= q.r + 1e-6), `${id} at ${hd}: (${a}, ${b}) covered`);
      }
      // and the squares inside them, for what walks round it
      assert.equal(carBoxes(c, 10, 20, hd).length, circles.length);
    }
  }
});

test('a car\'s engine and horn are its own: the beat of its kind of engine, the horn of its kind of car', () => {
  const profiles = IDS.map((id) => carProfile(POWER_CARS[id]));
  for (const p of profiles) { assert.ok(p.cylinders >= 4 && p.idle < p.redline && p.level > 0 && p.harmonics.length >= 6); }
  assert.notDeepEqual(carProfile(POWER_CARS['gold-hypercar']), carProfile(POWER_CARS['grey-saloon']));
  assert.ok(carHornOf(POWER_CARS['state-limousine']).notes[0] < carHornOf(POWER_CARS['red-winged-supercar']).notes[0], 'the big car\'s horn is the deeper');
});

test('only the server\'s list can be driven; in, drive, out on the driver\'s side, and it stands where it was left', () => {
  const w = town(['Driver One']);
  const { p, id, send, place } = w;
  place(p, -420, -55, Math.PI / 2);
  assert.equal(send(id, { type: 'cars.enter', car: 'grey-saloon' }).code, 'NOT_YOURS');
  assert.equal(send(id, { type: 'cars.owned', cars: ['grey-saloon', 'no-such-car', 'grey-saloon'] }).ok, true);
  assert.deepEqual(w.g.view(id).self.ownCars.cars, ['grey-saloon']);
  assert.equal(send(id, { type: 'cars.enter', car: 'gold-hypercar' }).code, 'NOT_YOURS');
  // in: brought to where they stand, facing their way
  const inside = send(id, { type: 'cars.enter', car: 'grey-saloon' });
  assert.equal(inside.ok, true, JSON.stringify(inside));
  assert.equal(inside.h, Math.PI / 2);
  assert.equal(w.g.view(id).self.incar.car, 'grey-saloon');
  // while in it, nothing that needs feet
  assert.equal(send(id, { type: 'move', x: p.x + 1, z: p.z, heading: 0 }).ok, false);
  // driving: a step it could make is taken; one it could not, refused
  run(w.host, 0.2);
  const step = send(id, { type: 'car.drive', x: p.x + 3, z: p.z, heading: Math.PI / 2, speed: 12, throttle: 1, steer: 0, rev: 0.5 });
  assert.equal(step.ok, true, JSON.stringify(step));
  assert.equal(w.g.view(id).self.incar.drive.speed, 12);
  const leap = send(id, { type: 'car.drive', x: p.x + 300, z: p.z, heading: Math.PI / 2 });
  assert.equal(leap.code, 'TOO_FAST');
  // the horn is counted (others hear it where the car is)
  const horns = p.horns || 0;
  assert.equal(send(id, { type: 'car.horn' }).ok, true);
  assert.equal(p.horns, horns + 1);
  // out: on the driver's side (the left: the town drives on the right), and it stays where it stands
  const at = { x: p.x, z: p.z, h: p.heading };
  const out = send(id, { type: 'car.leave' });
  assert.equal(out.ok, true);
  assert.equal(w.g.view(id).self.incar, null);
  const left = { x: Math.cos(at.h), z: -Math.sin(at.h) };
  assert.ok((p.x - at.x) * left.x + (p.z - at.z) * left.z > 1, 'out on the left of the car');
  const parked = w.g.view(id).self.ownCars.parked;
  assert.equal(parked.length, 1);
  assert.ok(Math.hypot(parked[0].x - at.x, parked[0].z - at.z) < 0.01);
  // it is in everybody's way where it stands: nobody walks through it
  assert.equal(zoneWalkable(at.x, at.z, w.I.ownCars ? w.I.ownCars.boxes() : carBoxes(POWER_CARS['grey-saloon'], at.x, at.z, at.h)), false);
  // back in, where it stands
  const again = send(id, { type: 'cars.enter', car: 'grey-saloon' });
  assert.equal(again.ok, true);
  assert.ok(Math.hypot(again.x - at.x, again.z - at.z) < 0.01);
  send(id, { type: 'car.leave' });
  // sold (no longer on the server's list): no longer parked, no longer driven
  send(id, { type: 'cars.owned', cars: [] });
  assert.deepEqual(w.g.view(id).self.ownCars, { cars: [], parked: [] });
});

test('a car is not brought indoors, into the showroom\'s hall, or where there is no room for it; it never goes through a wall', () => {
  const w = town(['Driver Two']);
  const { p, id, send, place } = w;
  send(id, { type: 'cars.owned', cars: ['state-limousine', 'grey-saloon'] });
  place(p, -26, 44, 0);          // inside the HOLARIS showroom building
  assert.ok(['INDOORS', 'NO_ROOM'].includes(send(id, { type: 'cars.enter', car: 'grey-saloon' }).code));
  place(p, CARSHOW.arrive.x, CARSHOW.arrive.z, 0);
  assert.equal(send(id, { type: 'cars.enter', car: 'grey-saloon' }).code, 'INDOORS');
  // out on the drive: in, and driven at the showroom's wall: refused there, whatever the speed
  place(p, -420.5, -140, Math.PI);
  assert.equal(send(id, { type: 'cars.enter', car: 'state-limousine' }).ok, true);
  run(w.host, 1);
  let z = p.z, refused = null;
  for (let k = 0; k < 40 && !refused; k += 1) {
    const r = send(id, { type: 'car.drive', x: p.x, z: z - 0.5, heading: Math.PI, speed: 5 });
    if (r.ok) { z -= 0.5; run(w.host, 0.1); } else refused = r;
  }
  assert.equal(refused && refused.code, 'BLOCKED');
  assert.ok(p.z > CARSHOW.doors.z + POWER_CARS['state-limousine'].length / 2 - 0.3, 'it stopped before the glass');
  // a crash at speed: the driver hurt by the speed, never more than 8 in 100, and still in the car
  const health = p.health;
  // (19 October 2026: judged at no more than the town saw the car going, here 5 m/s, and by how hard it went into the
  // wall, head on here: whatever the page says)
  const hit = send(id, { type: 'car.crash', speed: CAR_FASTEST * 3, heading: Math.PI });
  assert.equal(hit.ok, true);
  assert.equal(hit.hurt, true, JSON.stringify(hit));
  assert.ok(hit.kmh <= Math.round((5 * 1.35 + 1.5) * 3.6) + 1 && hit.kmh < POWER_CARS['state-limousine'].kmh, `no faster than the town saw it go: ${hit.kmh} km/h`);
  // (at 30 km/h a fraction of one in a hundred, by the owner's scale: no more than 8 at the fastest car's top speed)
  assert.ok(health - p.health >= 0 && health - p.health <= 8);
  assert.equal(w.g.view(id).self.incar.car, 'state-limousine');
  assert.equal(send(id, { type: 'car.crash', speed: 3 }).hurt, false, 'a bump at walking pace hurts nobody');
  // and a page that says it crashed where nothing is in the way is not believed
  place(p, -420.5, -150, 0);
  run(w.host, 1);
  const open = send(id, { type: 'car.crash', speed: 20, heading: 0 });
  assert.equal(open.hurt, false, JSON.stringify(open));
  assert.equal(carCrashHarm(CAR_FASTEST), 8);
  assert.equal(carCrashHarm(CAR_CRASH.least), 0);
});

test('the compound: railings all round with one way in, the gate sliding open for whoever comes and closing behind them, the buildings solid', () => {
  const C = CARSHOW.compound;
  // the railings: nobody walks through them, anywhere but the gate
  for (let x = C.x0 + 3; x < C.x1 - 3; x += 7) {
    if (Math.abs(x - G.x) < G.width / 2 + 1) continue;
    assert.equal(zoneWalkable(x, C.z1, []), false, `the front railings at ${x}`);
    assert.equal(zoneWalkable(x, C.z0, []), false, `the back railings at ${x}`);
  }
  for (let z = C.z0 + 3; z < C.z1 - 3; z += 7) { assert.equal(zoneWalkable(C.x0, z, []), false); assert.equal(zoneWalkable(C.x1, z, []), false); }
  // the gate: shut, its leaves are in the way; open, the way is clear for the biggest car
  assert.ok(carshowGateBoxes(0).some((b) => G.x > b.x0 - 0.5 && G.x < b.x1 + 0.5 || G.x - 2 > b.x0 && G.x - 2 < b.x1));
  assert.equal(zoneWalkable(G.x - 1, G.z - 0.35, carshowGateBoxes(0)), false, 'shut, nobody walks through it');
  assert.deepEqual(carshowGateBoxes(1), []);
  for (const zz of [-62, -66, -70, -74, -80]) assert.ok(carFits('state-limousine', G.x - 0.5, zz, Math.PI, carshowGateBoxes(1)), `the limousine passes the gateway at ${zz}`);
  // it opens slowly for someone coming, waits, and closes slowly behind them
  const s = { open: 0, lastNear: -1e9 };
  let t = 0;
  const near = [{ x: G.x, z: G.z + 8, driving: false }], far = [{ x: G.x, z: G.z + 60, driving: false }];
  stepCarshowGate(s, far, 0.1, t);
  assert.equal(s.open, 0, 'nobody near: shut');
  const opening = [];
  for (let i = 0; i < 50; i += 1) { t += 0.1; stepCarshowGate(s, near, 0.1, t); opening.push(s.open); }
  assert.equal(s.open, 1);
  assert.ok(opening.findIndex((v) => v >= 1) >= Math.round(G.open / 0.1) - 2, 'it takes its time opening');
  for (let i = 0; i < 20; i += 1) { t += 0.1; stepCarshowGate(s, far, 0.1, t); }
  assert.equal(s.open, 1, 'it waits a little after they have gone');
  for (let i = 0; i < 60; i += 1) { t += 0.1; stepCarshowGate(s, far, 0.1, t); }
  assert.equal(s.open, 0, 'then it closes');
  // someone driving up opens it from further off
  stepCarshowGate(s, [{ x: G.x, z: G.z + 25, driving: true }], 0.1, t + 0.1);
  assert.ok(s.open > 0);
  // the buildings: solid, and tall to the camera
  for (const b of CARSHOW.buildings) {
    const x = b.x + (b.id === 'twisting' ? -0.05 : 0) * b.scale, zz = b.z + (b.id === 'stacked' ? -0.1 : 0) * b.scale;
    if (b.id === 'showroom') continue;
    assert.ok(zoneSolid(x, zz, 0.25) || !zoneWalkable(x, zz, []), `${b.id}: solid`);
  }
  assert.ok(carshowBuildingAt(CARSHOW.showroom.x + 0.105 * 130, CARSHOW.showroom.z + 0.05 * 130) > 100, 'the showroom\'s tower stands tall');
  assert.ok(inCarCompound(G.x, G.z - 10) && !inCarCompound(G.x, G.z + 10));
});

test('the showroom: in by its glass doors, out by the mat inside them; the twenty cars on their stands with room all round', () => {
  const w = town(['Visitor One']);
  const { p, id, send, place } = w;
  place(p, CARSHOW.entry.x, CARSHOW.entry.z + 8, Math.PI);
  assert.equal(send(id, { type: 'carshow.in' }).code, 'TOO_FAR');
  place(p, CARSHOW.entry.x, CARSHOW.entry.z + 0.8, Math.PI);
  assert.ok(carshowAtDoors(p.x, p.z));
  const r = send(id, { type: 'carshow.in' });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.ok(inCarHall(p.x, p.z));
  assert.equal(r.heading, CARSHOW.arrive.heading);
  // nobody walks out but by the doors: the hall's walls are solid all round
  const H = CARSHOW.hall;
  for (let x = H.x0 + 0.5; x < H.x1 - 0.5; x += 1) { assert.equal(zoneWalkable(x, H.z0 - 0.6, []), false, `the back wall at ${x}`); assert.equal(zoneWalkable(x, H.z1 + 0.5, []), false, `the glass front at ${x}`); }
  for (let z = H.z0 + 0.5; z < H.z1 - 0.5; z += 1) { assert.equal(zoneWalkable(H.x0 - 0.6, z, []), false); assert.equal(zoneWalkable(H.x1 + 0.6, z, []), false); }
  // the cars: twenty, each on its own stand inside the hall, each stand clear of every other by a good walk
  const D = CARSHOW.displays;
  assert.equal(D.length, 20);
  assert.deepEqual([...D.map((d) => d.car)].sort(), [...IDS].sort());
  for (const d of D) {
    assert.ok(inCarHall(d.x, d.z, d.r + 1.5), `${d.car}: its stand within the hall, with a walk round it`);
    assert.ok(d.r * 2 > POWER_CARS[d.car].length * 0.98, `${d.car}: on a stand as long as itself`);
    for (const e of D) if (e !== d) assert.ok(Math.hypot(d.x - e.x, d.z - e.z) - d.r - e.r > 2.4, `${d.car} and ${e.car}: room to walk between`);
    assert.equal(carshowDisplayNear(d.x + d.r + 0.5, d.z).display.car === d.car || carshowDisplayNear(d.x, d.z + d.r + 0.5).display.car === d.car, true);
  }
  assert.equal(D.find((d) => d.stand === 'turntable').car, 'gold-hypercar');
  // each side of the floor has one of the two looking after it, and ten cars
  assert.equal(D.filter((d) => d.side === 'west').length + D.filter((d) => d.side === 'east').length, 20);
  for (const d of D) assert.equal(carshowSideOf(d.car), carshowSideAt(d.x) === d.side ? d.side : carshowSideOf(d.car));
  // out: from the middle of the floor, refused; from the mat, out before the doors
  place(p, (H.x0 + H.x1) / 2, (H.z0 + H.z1) / 2, 0);
  assert.equal(send(id, { type: 'carshow.out' }).code, 'TOO_FAR');
  const mat = CARSHOW.exit;
  place(p, (mat.x0 + mat.x1) / 2, (mat.z0 + mat.z1) / 2, 0);
  assert.ok(onCarshowExit(p.x, p.z));
  const o = send(id, { type: 'carshow.out' });
  assert.equal(o.ok, true);
  assert.ok(!inCarHall(p.x, p.z) && inCarCompound(p.x, p.z));
  assert.ok(zoneWalkable(p.x, p.z, []), 'set down on open ground');
});

test('the two who sell the cars: each waits at their desk with nobody on their side, comes to whoever is on it, and goes to whoever asks about one of their cars', () => {
  const [west, east] = CARSHOW.salesmen;
  const mineOf = (spec) => (c) => (c.talking ? carshowSideOf(c.talking) === spec.side : carshowSideAt(c.x) === spec.side);
  const tochi = createSalesman({ floor: 'carshow', home: west.home, round: west.round, mine: mineOf(west) });
  const oluchi = createSalesman({ floor: 'carshow', home: east.home, round: east.round, mine: mineOf(east) });
  const westCar = CARSHOW.displays.find((d) => d.side === 'west' && d.stand === 'plinth');
  const eastCar = CARSHOW.displays.find((d) => d.side === 'east' && d.stand === 'plinth');
  // a customer at a car on the west side: Tochi comes over; Oluchi stays at her desk
  const at = { id: 'p:a', x: westCar.x + westCar.r + 0.9, z: westCar.z, heading: -Math.PI / 2, talking: null, since: 0 };
  let now = 0;
  for (let i = 0; i < 60 * 30; i += 1) { now += 1 / 60; tochi.step(1 / 60, { now, customers: [at] }); oluchi.step(1 / 60, { now, customers: [at] }); }
  assert.ok(Math.hypot(tochi.state.x - at.x, tochi.state.z - at.z) < 2.2, 'Tochi is with the customer');
  assert.ok(Math.hypot(oluchi.state.x - east.home.x, oluchi.state.z - east.home.z) < 0.5, 'Oluchi waits at her desk');
  // they ask (on the west side of the floor) about a car on the east side: it is Oluchi who comes
  const asking = { ...at, talking: eastCar.car, since: now };
  for (let i = 0; i < 60 * 40; i += 1) { now += 1 / 60; tochi.step(1 / 60, { now, customers: [asking] }); oluchi.step(1 / 60, { now, customers: [asking] }); }
  assert.equal(oluchi.state.mode, 'talk');
  assert.ok(Math.hypot(oluchi.state.x - asking.x, oluchi.state.z - asking.z) < 2.2, 'Oluchi has come to talk');
  // nobody walks through a stand: every point of their way is open floor
  for (const s of [tochi, oluchi]) assert.ok(zoneWalkable(s.state.x, s.state.z, [], 0.3));
});

test('another player driving their car, from another copy of the town: seen with what the car is doing (within bounds), their cars left standing, and a horn when it is newly sounded', () => {
  const w = town(['Driver Four']);
  const { p, id, place } = w;
  place(p, -420, -60, 0);
  const seen = (car, extra = {}) => w.g.visitors.seen('peer-c1', { name: 'Obi_Driver', x: -425, z: -58, heading: 1.5, look: {}, car, ...extra });
  const v = seen({ car: 'red-winged-supercar', steer: 3, speed: 900, throttle: 4, brake: 1, rev: 3, lamps: 1, horns: 2 });
  assert.ok(v && v.car, JSON.stringify(v && v.car));
  assert.equal(v.car.car, 'red-winged-supercar');
  assert.ok(Math.abs(v.car.steer) <= 0.7 && v.car.speed <= 100 && v.car.throttle <= 1 && v.car.rev <= 1, JSON.stringify(v.car));
  run(w.host, 0.5);
  let q = w.g.view(id).players.find((o) => o.name === 'Obi_Driver');
  assert.ok(q && q.car && q.car.car === 'red-winged-supercar');
  assert.ok(q.hornAgo > 5, 'the horns counted before it was seen are not heard');
  seen({ car: 'red-winged-supercar', steer: 0, speed: 3, throttle: 0, brake: 0, rev: 0.2, lamps: 0, horns: 3 });
  q = w.g.view(id).players.find((o) => o.name === 'Obi_Driver');
  assert.ok(q.hornAgo >= 0 && q.hornAgo < 0.5, 'one more: its horn, just now');
  assert.equal(seen({ car: 'no-such-car' }).car, null);
});
