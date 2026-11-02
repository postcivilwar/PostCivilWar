// Oganiru City, Stage 1 (31 October 2026, the owner's brief for the new city with flyovers; the plan he said yes to
// that evening): the sample's roads, decks, trees and street lamps, and the levels a player keeps to on them.
//   node --test test/oganiru.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { town } from './world.mjs';
import { createHost } from '../src/sim/host.js';
import { OGANIRU, OGANIRU_DECKS, OGANIRU_ROADS, OGANIRU_TREES, OGANIRU_PILLARS, OGANIRU_TOWERS, OGANIRU_LAMPS, OGANIRU_MEDIAN_GAPS, oganiruDecksAt, zoneWalkable, zoneSurfaceY, zoneGroundY, zoneSolid, zoneBlockKind, zoneOnGround, ZONE_ROADS } from '../src/sim/zone.js';
import { STREET_LAMPS, LAMP_KNOCK, LAMP_KINDS, lampDown, lampsDown, lampOnAt, lampInTheWay, clearLamps, knockSpeedOf } from '../src/sim/street-lamps.js';
import { levelAt, walkLevel, keepLevel } from '../src/sim/levels.js';
import { carFits } from '../src/sim/own-cars.js';
import { OGANIRU_CLOSURES, roadWidthAt } from '../src/sim/zones/oganiru.js';
import { onOutskirts } from '../src/sim/zones/atani-outskirts.js';
import { POWER_CARS } from '../src/sim/power-cars.js';

const D = OGANIRU.deck;
// how far (x, z) is from the nearest of the city's roadblocks (each a line from a to b)
const toClosure = (x, z) => Math.min(...OGANIRU_CLOSURES.map(({ a, b }) => { const dx = b.x - a.x, dz = b.z - a.z, t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1))); return Math.hypot(x - a.x - dx * t, z - a.z - dz * t); }));
const deck = (id) => OGANIRU_DECKS.find((d) => d.id === id);
const into = (w, id, x, z, heading, car = 'grey-saloon') => {
  const p = w.g.state.players[id];
  w.place(p, x, z, heading);
  keepLevel(p, zoneGroundY(x, z));
  w.send(id, { type: 'cars.owned', cars: [car] });
  const r = w.send(id, { type: 'cars.enter', car });
  assert.ok(r.ok, `into the car: ${r.message || ''}`);
  return p;
};
// a car driven in steps of `step` metres a fifth of a second apart (as the driver's page sends them), from where it
// is to (x, z); gives the heights it was at on the way
const driveTo = (w, id, x, z, { step = 2, speed = 10 } = {}) => {
  const p = w.g.state.players[id], heights = [];
  const c = p.pcar;
  for (let k = 0; k < 2000; k += 1) {
    const gap = Math.hypot(x - c.x, z - c.z);
    if (gap < 0.05) break;
    const t = Math.min(1, step / gap);
    const nx = c.x + (x - c.x) * t, nz = c.z + (z - c.z) * t, heading = Math.atan2(x - c.x, z - c.z);
    w.g.state.real += step / speed;
    p.lastMoveAt = w.g.state.real - step / speed;
    const r = w.send(id, { type: 'car.drive', x: nx, z: nz, heading, speed, throttle: 0.6 });
    assert.ok(r.ok, `drive to (${nx.toFixed(1)}, ${nz.toFixed(1)}) from (${c.x.toFixed(1)}, ${c.z.toFixed(1)}): ${r.code} ${r.message || ''}`);
    heights.push({ x: nx, z: nz, y: w.g.view(id).self.y, hit: r.hit || null });
  }
  return heights;
};

test('the decks are as the brief has them: no steeper than 6%, at least 5.5 m clear over whatever passes under, the upper level about 15 m up, walls 1.1 m, pillars clear of the roads', () => {
  assert.equal(D.wall, 1.1); assert.equal(D.thick, 2); assert.ok(D.clear >= 5.5);
  assert.ok(OGANIRU_DECKS.length >= 9, `${OGANIRU_DECKS.length} decks`);
  let highest = 0;
  for (const d of OGANIRU_DECKS) {
    for (let i = 1; i < d.path.length; i += 1) {
      const a = d.path[i - 1], b = d.path[i];
      const grade = Math.abs(b.y - a.y) / Math.max(1e-6, b.s - a.s);
      assert.ok(grade <= 0.0605, `${d.id} at ${a.s.toFixed(0)} m: ${(grade * 100).toFixed(2)}%`);
      highest = Math.max(highest, a.y);
    }
  }
  assert.ok(highest > 15 && highest < 16, `the upper level ${highest} m`);
  // where one deck crosses over another, or over a road on the ground, there is room under it
  // (on a road's tar: not the middle of a flyover-road, which is its flyover's own way up and down)
  const roadAt = (x, z) => OGANIRU_ROADS.some((r) => { const a = r.along === 'z' ? z : x; if (a < r.from || a > r.to) return false; const w = roadWidthAt(r, a), off = Math.abs(r.along === 'z' ? x - r.c : z - r.c); if (r.kind === 'flyover-road' && off < w.median / 2) return false; return off <= w.half; });
  let crossings = 0, overRoad = 0;
  for (const d of OGANIRU_DECKS) for (const p of d.path) {
    const hits = oganiruDecksAt(p.x, p.z).sort((a, b) => a.y - b.y);
    for (let k = 1; k < hits.length; k += 1) {
      if (hits[k].y - hits[k - 1].y < 1.5) continue;           // (running together, or into one another)
      crossings += 1;
      assert.ok(hits[k].y - D.thick - hits[k - 1].y >= D.clear - 0.01, `${hits[k].deck.id} over ${hits[k - 1].deck.id} at (${p.x.toFixed(0)}, ${p.z.toFixed(0)}): ${(hits[k].y - D.thick - hits[k - 1].y).toFixed(2)} m clear`);
    }
    // over a road on the ground: high enough to pass under, never an embankment across it
    if (roadAt(p.x, p.z) && p.y > 0.35) { overRoad += 1; assert.ok(p.y - D.thick >= D.clear - 0.01, `${d.id} over the road at (${p.x.toFixed(0)}, ${p.z.toFixed(0)}): ${(p.y - D.thick).toFixed(2)} m clear`); }
  }
  assert.ok(crossings > 20 && overRoad > 10, `${crossings} points where one deck crosses another, ${overRoad} over a road`);
  for (const p of OGANIRU_PILLARS) assert.ok(!roadAt(p.x, p.z) || OGANIRU_ROADS.some((r) => r.kind === 'flyover-road' && Math.abs(p.z - r.c) < r.median / 2), `pillar at (${p.x.toFixed(0)}, ${p.z.toFixed(0)}) on a road`);
  // the Independence Flyover over Unity Avenue: 7.5 m up, 5.5 m clear under it; the expressway too
  for (const [id, x, z] of [['independence-flyover', 0, -780], ['viaduct', 0, -1130]]) {
    const h = oganiruDecksAt(x, z).find((q) => q.deck.id === id);
    assert.ok(h && Math.abs(h.y - D.level) < 0.01 && h.y - D.thick >= D.clear, `${id} over the avenue`);
  }
});

test('every lane of the city\'s roads on the ground is open to a car, and to the town\'s people: no pillar, tree, kerb post or embankment in a lane', () => {
  let points = 0;
  // (each road's lanes where it is, as wide as it is there: a flyover-road narrowing to the avenue past its flyover's foot)
  const lanesAt = (r, a) => {
    const w = roadWidthAt(r, a);
    if (r.kind === 'flyover-road') return [-(w.half + w.median / 2) / 2, (w.half + w.median / 2) / 2];
    if (r.kind === 'expressway' || r.kind === 'cutting') return r.half > 10 ? [-12, -8.5, -5, 5, 8.5, 12] : [-3.5, 3.5];
    if (w.median > 0 && r.kind !== 'approach') return [-(w.median / 2 + 1.75), -(w.median / 2 + 5.25), w.median / 2 + 1.75, w.median / 2 + 5.25];
    if (r.kind === 'approach' || r.kind === 'link') return [-(w.half + w.median / 2) / 2, (w.half + w.median / 2) / 2];
    return [-3.5, 3.5];
  };
  for (const r of OGANIRU_ROADS) {
    for (let a = r.from + 3; a <= r.to - 3; a += 2) for (const o of lanesAt(r, a)) {
      const x = r.along === 'z' ? r.c + o : a, z = r.along === 'z' ? a : r.c + o;
      // (the flyovers' ends come down onto the roads' middles, between their two carriageways; the roadblocks at the
      // roads' ends are across them)
      if (!zoneOnGround(x, z) || toClosure(x, z) < 3) continue;
      const g = zoneGroundY(x, z);
      points += 1;
      assert.ok(zoneWalkable(x, z, [], 1.0, g), `${r.id}: a car's width at (${x.toFixed(1)}, ${z.toFixed(1)})`);
      assert.ok(zoneWalkable(x, z, [], 0.3), `${r.id}: the town's people at (${x.toFixed(1)}, ${z.toFixed(1)})`);
      assert.equal(zoneSurfaceY(x, z, g), g, `${r.id}: on the ground at (${x.toFixed(1)}, ${z.toFixed(1)})`);
    }
  }
  assert.ok(points > 8000, `${points} points`);
  // College Road goes on into Unity Avenue: from the town's road onto the city's, open all the way
  for (let z = -460; z > -540; z -= 1) assert.ok(zoneWalkable(-2.5, z, [], 1.0, 0) && zoneWalkable(2.5, z, [], 1.0, 0), `College Road on into Unity Avenue at ${z}`);
  assert.ok(ZONE_ROADS.some((r) => r.z0 <= -470 && r.x0 <= -2.5 && r.x1 >= 2.5), 'College Road reaches the town\'s west edge');
});

test('the slim trees down the middle strip: their trunks are solid to a car and to anyone on foot, at least 4 m apart, and the gaps between them open; a car crosses the strip only between them', () => {
  const all = OGANIRU_TREES.filter((t) => t.kind === 'slim');
  assert.ok(all.length >= 200, `${all.length} slim trees`);
  // (down each avenue's strip, at least 4 m apart)
  for (const id of new Set(all.map((t) => t.road))) {
    const r = OGANIRU_ROADS.find((q) => q.id === id), along = (t) => (r.along === 'z' ? t.z : t.x);
    const row = all.filter((t) => t.road === id).sort((a, b) => along(a) - along(b));
    for (let i = 1; i < row.length; i += 1) assert.ok(Math.abs(along(row[i]) - along(row[i - 1])) >= 4.5, `${id}: trees at ${along(row[i]).toFixed(1)} and ${along(row[i - 1]).toFixed(1)}`);
  }
  const slim = all.filter((t) => t.road === 'unity').sort((a, b) => a.z - b.z);
  for (const t of slim) {
    assert.ok(!zoneWalkable(t.x, t.z, [], 0.35, 0.15), `the trunk at ${t.z.toFixed(1)} stops someone on foot`);
    assert.ok(!zoneWalkable(t.x, t.z, [], 0.35), `and the town's people`);
    assert.ok(!carFits('grey-saloon', t.x + 1.9, t.z, -Math.PI / 2, [], 0.2, 0.15), `and a car turning across the strip into it at ${t.z.toFixed(1)}`);
    // (its leaves, high up, are not in the way of anything: what is solid is the trunk, a few tens of centimetres)
    assert.ok(zoneWalkable(t.x + 0.9, t.z, [], 0.35, 0.15), 'beside it the strip is open');
  }
  // a gap between two trees, wide enough to walk and to drive a car across the strip at a slant
  // (two next to each other, with no lamp between them)
  const k = slim.findIndex((t, i) => i > 4 && i < slim.length - 1 && Math.abs(slim[i + 1].z - t.z) < 10);
  const a = slim[k], b = slim[k + 1], mid = (a.z + b.z) / 2;
  assert.ok(zoneWalkable(0, mid, [], 0.4, 0.15));
  assert.ok(carFits('grey-saloon', 0, mid, -Math.PI / 2, [], 0.2, 0.15), `a car across the strip between the trees at ${mid.toFixed(1)}`);
  // the middle strip is a kerb above the road; its openings (the junctions and the two U-turn gaps) are level
  assert.ok(Math.abs(zoneGroundY(0, -620) - OGANIRU.kerb) < 1e-9);
  for (const g of OGANIRU_MEDIAN_GAPS) { const r = OGANIRU_ROADS.find((q) => q.id === g.road), a = (g.from + g.to) / 2; assert.equal(zoneGroundY(r.along === 'z' ? r.c : a, r.along === 'z' ? a : r.c), 0, `${g.road}: ${g.why} at ${g.from}`); }
});

test('a car keeps its level: up the Independence Flyover\'s ramp, over Unity Avenue on it, down its far ramp; another under it on the avenue all the while, neither touching the other', () => {
  const w = town(['Deck Driver', 'Road Driver']);
  const [A, B] = w.ids;
  into(w, A, -206, -777, Math.PI / 2);
  into(w, B, 6.5, -760, Math.PI);
  const pa = w.g.state.players[A], pb = w.g.state.players[B];
  assert.equal(w.g.view(A).self.y, 0);
  const up = driveTo(w, A, -60, -777);
  // halfway along, B goes under it
  const under = driveTo(w, B, 6.5, -800);
  const over = driveTo(w, A, 206, -777);
  const all = [...up, ...over];
  const top = all.reduce((m, q) => Math.max(m, q.y), 0);
  assert.ok(Math.abs(top - D.level) < 0.05, `over the avenue at ${top} m`);
  const at0 = all.find((q) => Math.abs(q.x) < 2);
  assert.ok(at0 && Math.abs(at0.y - D.level) < 0.05, `over Unity Avenue on the flyover: ${at0 && at0.y}`);
  for (let i = 1; i < all.length; i += 1) assert.ok(Math.abs(all[i].y - all[i - 1].y) <= 0.06 * 2 * 1.05 + 1e-6, `no jump: ${all[i - 1].y} to ${all[i].y} at ${all[i].x.toFixed(1)}`);
  assert.ok(Math.abs(all[all.length - 1].y) < 1e-6, 'down on the ground again at the far end');
  assert.ok(under.every((q) => q.y === 0), 'the car under it stays on the avenue');
  assert.ok(!all.some((q) => q.hit) && !under.some((q) => q.hit), 'neither struck the other');
  // and the one on the flyover, standing over the other, is not in its way, nor it in the other's
  w.place(pa, 2, -777, Math.PI / 2); keepLevel(pa, D.level); pa.pcar.x = 2; pa.pcar.z = -777; keepLevel(pa.pcar, D.level);
  w.place(pb, 2, -790, Math.PI); pb.pcar.x = 2; pb.pcar.z = -790; keepLevel(pb.pcar, 0);
  pb.lastMoveAt = w.g.state.real - 0.3;
  assert.ok(w.send(B, { type: 'car.drive', x: 2, z: -786, heading: Math.PI, speed: 8 }).ok, 'under it, going on along the avenue beneath the car on the flyover');
  assert.equal(levelAt(pb.pcar), 0);
  assert.equal(levelAt(pa.pcar), D.level);
});

test('on the flyover a car keeps inside its walls: it cannot be driven off its side, nor through its middle barrier; on the ground the embankment of its ramp is a wall', () => {
  const w = town(['Wall Test']);
  const p = into(w, w.id, -206, -777, Math.PI / 2);
  driveTo(w, w.id, -20, -777);
  assert.ok(Math.abs(w.g.view(w.id).self.y - D.level) < 0.05);
  // off its side (south-west of it is the ground, 7.5 m down)
  p.lastMoveAt = w.g.state.real - 0.5;
  const off = w.send(w.id, { type: 'car.drive', x: -20, z: -769, heading: 0, speed: 8 });
  assert.equal(off.code, 'BLOCKED', 'not through the wall');
  const middle = w.send(w.id, { type: 'car.drive', x: -20, z: -781, heading: Math.PI, speed: 8 });
  assert.equal(middle.code, 'BLOCKED', 'not over the barrier into the other carriageway');
  // the ramp where it is low: an embankment, solid from the ground; where it is high, open between its pillars
  // (in a lane of it, beside the barrier down its middle)
  const low = deck('independence-flyover').path.find((q) => q.y > 1.5 && q.y < 3);
  const lane = { x: low.x + low.uz * 3.5, z: low.z - low.ux * 3.5 };
  assert.ok(!zoneWalkable(lane.x, lane.z, [], 0.4, 0), 'the embankment is a wall to someone on the ground');
  assert.ok(zoneWalkable(lane.x, lane.z, [], 0.4, low.y), 'and its top is the road to someone on it');
  assert.ok(!zoneWalkable(low.x, low.z, [], 0.4, low.y), 'but for the barrier down its middle');
  // where it is high enough to pass under (on its columns), the ground under it is open between them
  assert.ok(zoneWalkable(-34, -780, [], 0.4, 0), 'under it where it is high');
});

test('on foot: up a ramp a step at a time onto the expressway\'s loop, along it, and never down off its side; under a deck the ground is what is walked on', () => {
  const d = deck('u-loop-nw');
  const start = d.path[0];
  let y = zoneGroundY(start.x, start.z);
  for (let i = 1; i < d.path.length; i += 1) {
    const a = d.path[i - 1], b = d.path[i];
    const got = walkLevel(a.x, a.z, y, b.x, b.z, [], 0.4, 0.4);
    assert.ok(got !== null, `walked to ${b.s.toFixed(0)} m along it`);
    y = got;
    assert.ok(Math.abs(y - b.y) < 0.2, `on the ramp at ${b.s.toFixed(0)} m: ${y} against ${b.y}`);
  }
  assert.ok(Math.abs(y - D.level) < 0.05, `up on the expressway's level: ${y}`);
  // over the edge where it is high: the wall
  const high = d.path.find((q) => q.y > 6);
  const lx = high.uz, lz = -high.ux;
  assert.equal(walkLevel(high.x, high.z, high.y, high.x + lx * (d.half + 1.5), high.z + lz * (d.half + 1.5), [], 0.4, 0.4), null, 'not over its wall');
  // under the expressway, on the ground: the ground; on the expressway, its deck
  assert.equal(zoneSurfaceY(-30, -1130, 0), zoneGroundY(-30, -1130));
  assert.equal(zoneSurfaceY(-30, -1130, D.level), D.level, 'on it, its deck');
  // under the loop where it climbs, the ground; on it, its road where it is
  const climbing = oganiruDecksAt(-30, -1150).find((h) => h.deck.id === 'u-loop-sw');
  assert.equal(zoneSurfaceY(-30, -1150, 0), zoneGroundY(-30, -1150));
  assert.ok(climbing && Math.abs(zoneSurfaceY(-30, -1150, climbing.y) - climbing.y) < 1e-9, 'on the loop, its road');
});

test('street lamps: a car slower than 35 km/h stops against one and it stands; faster, it goes down the way it was hit and the car goes on at two thirds of its pace; a heavy car from 25 km/h; it stands again after a while; lit only at night', () => {
  clearLamps();
  const w = town(['Lamp Driver']);
  // one of the tall lamps down Unity Avenue's middle strip, and one of the town's own
  const median = STREET_LAMPS.find((l) => l.kind === 'median' && Math.abs(l.x) < 1 && l.z < -620 && l.z > -660);
  assert.ok(median, 'a lamp on the middle strip');
  const lampIndex = STREET_LAMPS.indexOf(median);
  assert.ok(lampInTheWay(median.x, median.z, 0.4, median.y) === lampIndex, 'its pole is in the way of a player\'s things');
  assert.ok(zoneWalkable(median.x, median.z, [], 0.4), 'not of the town\'s own people');
  // a car up against it, slowly
  const p = into(w, w.id, median.x + 4, median.z + 5, Math.PI);
  p.pcar.x = median.x; p.pcar.z = median.z + 2.9 + 0.2; p.pcar.h = Math.PI; p.pcar.seen = 6; keepLevel(p.pcar, 0);
  const slow = w.send(w.id, { type: 'lamp.knock', lamp: median.id, speed: 6, heading: Math.PI });
  assert.ok(slow.ok && slow.down === false, `at 22 km/h it stands: ${JSON.stringify(slow)}`);
  assert.ok(!lampDown(lampIndex));
  // fast: down, the way it was hit; no longer in the way
  p.pcar.seen = 12;
  const fast = w.send(w.id, { type: 'lamp.knock', lamp: median.id, speed: 12, heading: Math.PI });
  assert.ok(fast.ok && fast.down === true && Math.abs(fast.keep - 2 / 3) < 1e-9, `at 43 km/h it goes down: ${JSON.stringify(fast)}`);
  assert.ok(lampDown(lampIndex));
  assert.ok(Math.abs(Math.cos(lampsDown().get(lampIndex).dir - Math.PI)) > 0.99, 'it falls the way the car was going');
  assert.equal(lampInTheWay(median.x, median.z, 0.4, median.y), -1, 'down, it is not in the way');
  // it stands again once it has lain long enough (nobody's page having put it back sooner)
  w.g.state.real += LAMP_KNOCK.back;
  w.g.step(0.05);
  assert.ok(lampDown(lampIndex), 'still down after three minutes: the town waits for the pages, which raise it unseen');
  w.g.state.real += LAMP_KNOCK.watched - LAMP_KNOCK.back + 2;
  w.g.step(0.05);
  assert.ok(!lampDown(lampIndex), 'up again after six minutes at most');
  // (the town judges the speed by what it saw: a page saying 40 km/h for a car the town saw crawling knocks nothing)
  const town2 = town(['Crawler']);
  const other = STREET_LAMPS.find((l) => l.kind === 'median' && Math.abs(l.x) < 1 && l.z < -680 && l.z > -760 && !lampDown(STREET_LAMPS.indexOf(l)));
  const q = into(town2, town2.id, other.x + 4, other.z + 5, Math.PI);
  q.pcar.x = other.x; q.pcar.z = other.z + 3.1; q.pcar.h = Math.PI; q.pcar.seen = 1;
  const lie = town2.send(town2.id, { type: 'lamp.knock', lamp: other.id, speed: 12, heading: Math.PI });
  assert.ok(lie.ok && lie.down === false, 'a speed the town did not see is not believed');
  // too far from it: refused
  q.pcar.z = other.z + 12; q.pcar.seen = 12;
  assert.equal(town2.send(town2.id, { type: 'lamp.knock', lamp: other.id, speed: 12, heading: Math.PI }).code, 'TOO_FAR');
  // a heavy one (the armoured limousine) from 25 km/h; a car from 35
  assert.equal(Math.round(knockSpeedOf(POWER_CARS['state-limousine'].class) * 3.6), POWER_CARS['state-limousine'].class === 'limousine' ? 25 : 35);
  assert.equal(Math.round(knockSpeedOf(POWER_CARS['grey-saloon'].class) * 3.6), 35);
  // on foot or a motorcycle nothing is knocked down
  const walker = town(['Walker']);
  assert.equal(walker.send(walker.id, { type: 'lamp.knock', lamp: other.id, speed: 12 }).code, 'NOT_DRIVING');
  // lit only at night: each comes on as the dusk deepens, one after another along the avenue
  const ons = STREET_LAMPS.filter((l) => l.kind === 'median').map(lampOnAt);
  assert.ok(ons.every((v) => v > 0.05 && v < 0.35), 'each comes on at dusk, none by day');
  assert.ok(new Set(ons.map((v) => v.toFixed(4))).size > ons.length / 2, 'not all at once');
  // the town's own lamps are knocked down the same way
  const townLamp = STREET_LAMPS.find((l) => l.kind === 'town');
  assert.ok(townLamp && townLamp.knock, 'the town\'s lamps too');
  // and the lamps on the decks' walls are out of any car's reach
  assert.ok(STREET_LAMPS.filter((l) => l.kind === 'deck').every((l) => !l.knock));
  clearLamps();
});

test('a lamp knocked down in one player\'s game is told to the others near, who see it down too, once; it is up again for all after its time', () => {
  clearLamps();
  const a = town(['Knocker']);
  // (one of the lamps along College Road carried on, as in Stage 1)
  const lamp = STREET_LAMPS.find((l) => l.kind === 'edge' && Math.abs(l.z + 511) < 0.5 && l.x > 0);
  const i = STREET_LAMPS.indexOf(lamp);
  const p = into(a, a.id, lamp.x + 3, lamp.z + 6, Math.PI);
  p.pcar.x = lamp.x - Math.sin(lamp.heading) * 0; p.pcar.z = lamp.z + 3; p.pcar.h = Math.PI; p.pcar.seen = 13; keepLevel(p.pcar, 0);
  const r = a.send(a.id, { type: 'lamp.knock', lamp: lamp.id, speed: 13, heading: Math.PI });
  assert.ok(r.ok && r.down, JSON.stringify(r));
  const told = a.g.view(a.id).self.knocked;
  assert.equal(told.length, 1); assert.equal(told[0].lamp, lamp.id);
  // the other player's game (a game of its own): the lamp is up there until the word comes
  clearLamps();
  const b = town(['Watcher']);
  assert.ok(!lampDown(i));
  b.g.visitors.seen('peer-1', { name: 'Knocker', x: lamp.x, z: lamp.z + 3, heading: Math.PI, look: {}, knocked: told });
  assert.ok(lampDown(i), 'told of it, it is down in the other game too');
  const at = lampsDown().get(i).at;
  b.g.visitors.seen('peer-1', { name: 'Knocker', x: lamp.x, z: lamp.z + 3, heading: Math.PI, look: {}, knocked: told });
  assert.equal(lampsDown().get(i).at, at, 'the same word again changes nothing');
  clearLamps();
});

test('a game saved before the city loads into the town with it: the player where they were, on the ground, their money and their things as they were, and the way west open', () => {
  const host = createHost();
  const g = host.game;
  const id = g.join({ name: 'Old Save', look: {} });
  const p = g.state.players[id];
  p.x = 1.5; p.z = -476; p.heading = Math.PI;
  const saved = JSON.parse(JSON.stringify(host.save()));
  // (as saved before 31 October 2026: nobody had a level)
  const old = saved.game.players[id];
  delete old.lv;
  const before = host.auditor.balance(p.wallet);
  const again = createHost({ saved });
  const q = again.game.state.players[id];
  assert.ok(q, 'the player is there');
  assert.equal(q.x, 1.5); assert.equal(q.z, -476);
  assert.equal(levelAt(q), zoneGroundY(1.5, -476), 'on the ground');
  assert.equal(again.auditor.balance(q.wallet), before, 'their money as it was');
  // and they walk on west into the city
  q.lastMoveAt = again.game.state.real - 1;
  const step = again.game.intent(id, { type: 'move', x: 1.5, z: -478, heading: Math.PI });
  assert.ok(step.ok, `on into Unity Avenue: ${step.message || ''}`);
  assert.equal(again.game.view(id).self.y, 0);
});

test('the towers are solid to their tops, with room to walk round them (the sample\'s six where they were); nothing of the city is in the town', () => {
  // (Stage 3, 2 November 2026: downtown's thirty, the sample's six among them, as they were: test/oganiru-downtown.test.mjs)
  assert.ok(OGANIRU_TOWERS.length >= 20 && OGANIRU_TOWERS.length <= 40, `${OGANIRU_TOWERS.length} towers`);
  const sample = [['t1', 72, -716, 34], ['t2', 152, -722, 26], ['t3', -72, -716, 30], ['t4', -152, -720, 22], ['t5', 72, -842, 10], ['t6', -72, -846, 40]];
  for (const [id, x, z, storeys] of sample) { const t = OGANIRU_TOWERS.find((q) => q.id === id); assert.ok(t && t.x === x && t.z === z && t.storeys === storeys, `${id} as it was`); }
  for (const t of OGANIRU_TOWERS) {
    assert.ok(!zoneWalkable(t.x, t.z, [], 0.4, 0.15), `${t.name} is solid`);
    assert.ok(zoneSolid(t.x, t.z, 0.25, t.height - 1), `${t.name} to its top`);
    assert.ok(t.storeys >= 6 && t.height >= 6 * 3.6, `${t.name}: ${t.height} m`);
  }
  assert.ok(OGANIRU_TOWERS.some((t) => t.storeys >= 40) && OGANIRU_TOWERS.some((t) => t.storeys <= 12), 'tall and lower');
  // nothing of the city on the town's land, the airport's or the Kwale road's
  const theirs = (x, z) => (Math.abs(x) < 250 && z > -478.6) || onOutskirts(x, z);
  for (const l of OGANIRU_LAMPS) assert.ok(!theirs(l.x, l.z), `its lamps: (${l.x.toFixed(0)}, ${l.z.toFixed(0)})`);
  for (const t of OGANIRU_TREES) assert.ok(!theirs(t.x, t.z), `its trees: (${t.x.toFixed(0)}, ${t.z.toFixed(0)})`);
  for (const d of OGANIRU_DECKS) for (const q of d.path) assert.ok(!theirs(q.x, q.z), 'its decks');
  assert.ok(LAMP_KINDS.median.height > 10 && LAMP_KINDS.ornate.height < 5);
});
