// Tests of the keke and the coach: that the supplied models are untouched,
// that what the game draws is the same shape at every level of detail, and
// that every keke and coach in the game takes its shape from them.
//
//   node --test test/vehicles.test.mjs
//
// These run without a browser. They check what a vehicle is made of and where
// it stands, not how it looks; the look is judged in the vehicle yard
// (dist/yard.html) and in the play-through.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { VEHICLE_META, VEHICLE_B64 } from '../src/client/vehicle-kit-data.js';
import { VEHICLE_MODELS, KEKE_PAINTS, BUS_LIVERIES, BUS_OPERATORS, kekeLook, busLook, resolveLook, variantSheet, footprintBox } from '../src/sim/vehicle-looks.js';
import { VEHICLE_KINDS, vehicleBox, vehicleFits } from '../src/sim/vehicles.js';
import { ZONE_VEHICLES, ZONE_VEHICLE_BAYS, ZONE_ROADS, ZONE_BUILDINGS, ZONE_SPOTS, ZONE_NODES, ZONE_EDGES, zoneWalkable } from '../src/sim/zone.js';
import { createHost } from '../src/sim/host.js';
import { newWorld, ok, fund, goToService, waitUntilOpen } from './helpers.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const asset = (rel) => resolve(here, '../assets/vehicles', rel);
const bytes = Buffer.from(VEHICLE_B64, 'base64');
const SLOTS = VEHICLE_META.slots;
const MASTERS = {
  'keke/canonical_keke.glb': '52a95f35279882ca2dd50c8b725a93a325c5ee9b790890b9da946fc6efe99e7e',
  'keke/canonical_keke_classic.glb': '91c95f781753d01ca757d6a7b1286ba3006a51b3170ec04ea58436237f75c162',
  'keke/canonical_keke_tvs.glb': 'd71b3f17c89132ac71d0e6a8da068afe69a5a695c5c0e401730473262c0d7e86',
  'bus/canonical_ivm_bus.glb': '293ac2d35443a17301eac52715a468bef84c487adcc95c474cd67b43754fcc75',
};

// A supplied model, read straight from its file: where each named node sits, its bounds and its triangles.
function readMaster(rel) {
  const data = readFileSync(asset(rel));
  const jsonLength = data.readUInt32LE(12);
  const json = JSON.parse(data.subarray(20, 20 + jsonLength).toString('utf8'));
  const parent = new Map();
  json.nodes.forEach((n, i) => (n.children || []).forEach((c) => parent.set(c, i)));
  // a point in a node's own frame, carried out to the vehicle's frame
  const turn = ([x, y, z, w], [px, py, pz]) => { const tx = 2 * (y * pz - z * py), ty = 2 * (z * px - x * pz), tz = 2 * (x * py - y * px); return [px + w * tx + (y * tz - z * ty), py + w * ty + (z * tx - x * tz), pz + w * tz + (x * ty - y * tx)]; };
  const out = (i, p) => { const n = json.nodes[i]; const s = n.scale || [1, 1, 1]; const r = turn(n.rotation || [0, 0, 0, 1], [p[0] * s[0], p[1] * s[1], p[2] * s[2]]); const t = n.translation || [0, 0, 0]; const q = [r[0] + t[0], r[1] + t[1], r[2] + t[2]]; return parent.has(i) ? out(parent.get(i), q) : q; };
  const nodes = Object.fromEntries(json.nodes.map((n, i) => [n.name, out(i, [0, 0, 0])]));
  let triangles = 0;
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  json.nodes.forEach((n, i) => {
    if (n.mesh === undefined) return;
    for (const p of json.meshes[n.mesh].primitives) {
      triangles += json.accessors[p.indices].count / 3;
      const a = json.accessors[p.attributes.POSITION];
      // nodes are turned by quarter turns at most, so the corners of a mesh's box bound it exactly
      for (const x of [a.min[0], a.max[0]]) for (const y of [a.min[1], a.max[1]]) for (const z of [a.min[2], a.max[2]]) { const q = out(i, [x, y, z]); for (let k = 0; k < 3; k += 1) { lo[k] = Math.min(lo[k], q[k]); hi[k] = Math.max(hi[k], q[k]); } }
    }
  });
  return { nodes, triangles, lo, hi, animations: (json.animations || []).map((a) => a.name), materials: json.materials.map((m) => m.name) };
}

// One level of one part, unpacked the way the client does it.
function unpack(id, lod) {
  const rec = VEHICLE_META.parts[id].lods[lod];
  const q = new Uint16Array(bytes.buffer, bytes.byteOffset + rec.pos, rec.v * 3);
  const pos = new Float32Array(rec.v * 3);
  for (let i = 0; i < rec.v * 3; i += 1) pos[i] = rec.lo[i % 3] + (q[i] / 65535) * rec.span[i % 3];
  const Index = rec.wide ? Uint32Array : Uint16Array;
  return { rec, pos, slot: new Uint8Array(bytes.buffer, bytes.byteOffset + rec.slot, rec.v), idx: new Index(bytes.buffer, bytes.byteOffset + rec.idx, rec.t * 3) };
}
const expand = (model, list, trim) => (Array.isArray(list) ? list : [list]).map((id) => id.replace('{trim}', trim));
// The bounds of a whole vehicle at one level: body, anything that steers, and its wheels where they stand.
function boundsOf(model, level, trim) {
  const meta = VEHICLE_META.models[model];
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  const take = (id, lod, offset = [0, 0, 0], yaw = 0) => {
    const { pos } = unpack(id, Math.min(lod, VEHICLE_META.parts[id].lods.length - 1));
    const c = Math.cos(yaw), s = Math.sin(yaw);
    for (let i = 0; i < pos.length; i += 3) { const p = [pos[i] * c + pos[i + 2] * s + offset[0], pos[i + 1] + offset[1], -pos[i] * s + pos[i + 2] * c + offset[2]]; for (let k = 0; k < 3; k += 1) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); } }
  };
  if (level === 2) { for (const id of expand(model, meta.parts.far, trim)) take(id, 0); return { lo, hi }; }
  for (const id of expand(model, meta.parts.body, trim)) take(id, level);
  for (const s of meta.steer) if (s.part) for (const id of expand(model, s.part, trim)) take(id, level, s.at);
  for (const w of meta.wheels) for (const id of expand(model, meta.parts.wheel, trim)) take(id, level, w.at, w.yaw || 0);
  return { lo, hi };
}
const drawn = (model, level, trim) => {
  const meta = VEHICLE_META.models[model];
  const t = (id, lod = level) => VEHICLE_META.parts[id].lods[Math.min(lod, VEHICLE_META.parts[id].lods.length - 1)].t;
  if (level === 2) return expand(model, meta.parts.far, trim).reduce((sum, id) => sum + t(id, 0), 0);
  return expand(model, meta.parts.body, trim).reduce((sum, id) => sum + t(id), 0)
    + meta.steer.reduce((sum, s) => sum + (s.part ? expand(model, s.part, trim).reduce((n, id) => n + t(id), 0) : 0), 0)
    + meta.wheels.length * expand(model, meta.parts.wheel, trim).reduce((sum, id) => sum + t(id), 0);
};
const close = (a, b, tolerance, what) => assert.ok(Math.abs(a - b) <= tolerance, `${what}: ${a} against ${b}`);

// ------------------------------------------------------------ the masters --

test('the supplied models are kept exactly as they were given', () => {
  for (const [rel, sha] of Object.entries(MASTERS)) assert.equal(createHash('sha256').update(readFileSync(asset(rel))).digest('hex'), sha, rel);
  const manifest = JSON.parse(readFileSync(asset('manifest.json'), 'utf8'));
  assert.equal(manifest.bus.master.sha256, MASTERS['bus/canonical_ivm_bus.glb'], 'the bake read this very file');
  for (const [trim, m] of Object.entries(manifest.keke.masters)) assert.equal(m.sha256, MASTERS[m.file], trim);
});

test('the supplied models are what the inspection said: size, wheels, clips', () => {
  const keke = readMaster('keke/canonical_keke.glb');
  assert.equal(keke.triangles, 57292);
  assert.deepEqual(keke.animations.sort(), ['Steering_Sweep', 'Wheel_Roll']);
  assert.deepEqual(keke.nodes.Wheel_Front.map((v) => Number(v.toFixed(3))), [0, 0.25, 1]);
  assert.deepEqual(keke.nodes.Wheel_Rear_Left.map((v) => Number(v.toFixed(3))), [-0.54, 0.25, -0.84]);
  close(keke.lo[1], 0, 0.003, 'the keke stands on the ground');
  const bus = readMaster('bus/canonical_ivm_bus.glb');
  assert.equal(bus.triangles, 170704);
  assert.equal(bus.materials.length, 16);
  close(bus.hi[2] - bus.lo[2], 11.569, 0.002, 'coach length');
  close(bus.lo[1], 0, 0.003, 'the coach stands on the ground');
  for (const trim of ['classic', 'tvs']) { const other = readMaster(`keke/canonical_keke_${trim}.glb`); for (const name of ['Wheel_Front', 'Wheel_Rear_Left', 'Wheel_Rear_Right', 'Steering_Pivot']) assert.deepEqual(other.nodes[name], keke.nodes[name], `${trim} ${name}`); }
});

// ---------------------------------------------------------------- the kit --

test('every part is sound at every level: triangles in range, slots known, groups whole', () => {
  for (const [id, part] of Object.entries(VEHICLE_META.parts)) {
    part.lods.forEach((rec, lod) => {
      const { idx, slot } = unpack(id, lod);
      let top = 0;
      for (const i of idx) if (i > top) top = i;
      assert.ok(top < rec.v, `${id} level ${lod}: a triangle points past the last vertex`);
      for (const s of slot) assert.ok(s < SLOTS.length, `${id}: unknown slot ${s}`);
      assert.equal(rec.groups.reduce((sum, g) => sum + g.count, 0), rec.t * 3, `${id} level ${lod}: groups cover every triangle`);
      if (lod > 0) assert.ok(rec.t <= part.lods[lod - 1].t, `${id}: level ${lod} is no heavier than the one before`);
    });
  }
});

test('the baked vehicles are the size of the supplied ones at every level, and stand on the ground', () => {
  const masters = { keke: { modern: 'keke/canonical_keke.glb', classic: 'keke/canonical_keke_classic.glb', tvs: 'keke/canonical_keke_tvs.glb' }, bus: { standard: 'bus/canonical_ivm_bus.glb' } };
  for (const [model, files] of Object.entries(masters)) {
    for (const [trim, rel] of Object.entries(files)) {
      const master = readMaster(rel);
      // near: every piece of the master is there, so the bounds agree to the millimetre
      const near = boundsOf(model, 0, trim);
      for (let k = 0; k < 3; k += 1) { close(near.lo[k], master.lo[k], 0.002, `${model} ${trim} near, low ${'xyz'[k]}`); close(near.hi[k], master.hi[k], 0.002, `${model} ${trim} near, high ${'xyz'[k]}`); }
      // middle and far: small fittings are left out (a mirror stalk, a wiper), but the body is the same body
      for (const level of [1, 2]) {
        const b = boundsOf(model, level, trim);
        close(b.hi[1], master.hi[1], 0.03, `${model} ${trim} level ${level} height`);
        // a wheel cut down to a dozen flat sides cannot sit dead on the ground; far off, the gap is a hand's thickness at most
        close(b.lo[1], 0, level === 1 ? 0.02 : 0.03, `${model} ${trim} level ${level} on the ground`);
        close(b.hi[2], master.hi[2], 0.08, `${model} ${trim} level ${level} front`);
        close(b.lo[2], master.lo[2], 0.08, `${model} ${trim} level ${level} back`);
        const slack = level === 1 ? 0.03 : 0.25;
        assert.ok(b.hi[0] <= master.hi[0] + 0.002 && b.hi[0] >= master.hi[0] - slack - (model === 'bus' && level === 2 ? 0.25 : 0), `${model} ${trim} level ${level} width ${b.hi[0]}`);
      }
    }
  }
});

test('wheels and steering are where the supplied models put them', () => {
  const keke = readMaster('keke/canonical_keke.glb');
  const k = VEHICLE_META.models.keke;
  assert.equal(k.wheels.length, 3);
  assert.deepEqual(k.wheels.map((w) => w.at), [keke.nodes.Wheel_Front, keke.nodes.Wheel_Rear_Left, keke.nodes.Wheel_Rear_Right].map((p) => p.map((v) => Number(v.toFixed(5)))));
  assert.deepEqual(k.steer[0].at, keke.nodes.Steering_Pivot.map((v) => Number(v.toFixed(5))));
  assert.equal(k.wheels[0].steer, 0, 'the front wheel turns with the fork');
  close(k.wheelRadius, 0.25, 0.002, 'keke wheel radius');
  for (const w of k.wheels) close(w.at[1], k.wheelRadius, 0.002, 'a keke wheel rests on the ground');
  const bus = readMaster('bus/canonical_ivm_bus.glb');
  const b = VEHICLE_META.models.bus;
  assert.equal(b.wheels.length, 6, 'two front wheels and twin tyres on each side at the back');
  assert.deepEqual(b.wheels[0].at, bus.nodes.Wheel_Front_Left.map((v) => Number(v.toFixed(5))));
  assert.deepEqual(b.wheels[1].at, bus.nodes.Wheel_Front_Right.map((v) => Number(v.toFixed(5))));
  assert.deepEqual(b.steer.map((s) => s.at), [bus.nodes.Steering_Pivot, bus.nodes.Steering_Pivot_Right].map((p) => p.map((v) => Number(v.toFixed(5)))));
  assert.equal(b.wheels.filter((w) => w.steer !== undefined).length, 2, 'only the front wheels steer');
  for (const w of b.wheels) close(w.at[1], b.wheelRadius, 0.004, 'a coach wheel rests on the ground');
  // the wheel itself is round about its own axle
  for (const id of ['keke.wheel', 'bus.wheel']) { const { rec } = unpack(id, 0); close(rec.lo[1], -(rec.lo[1] + rec.span[1]), 0.004, `${id} is centred on its axle`); }
});

test('levels of detail: what each costs to draw', () => {
  const budget = { keke: [24000, 5000, 2200], bus: [54000, 15000, 4200] };
  for (const model of ['keke', 'bus']) {
    for (const trim of VEHICLE_META.models[model].trims) {
      const cost = [0, 1, 2].map((level) => drawn(model, level, trim));
      cost.forEach((t, level) => assert.ok(t <= budget[model][level], `${model} ${trim} level ${level}: ${t} triangles`));
      assert.ok(cost[0] > cost[1] * 3 && cost[1] > cost[2] * 2, `${model} ${trim}: each level is a real saving (${cost})`);
    }
  }
  // the near keke keeps every piece of the body and fork untouched: every triangle of the master that has
  // any area is there (the master also holds some of no area at all, which cannot be seen and are dropped)
  const manifest = JSON.parse(readFileSync(asset('manifest.json'), 'utf8'));
  const kept = ['keke.body', 'keke.front.modern', 'keke.fork.modern'];
  const empty = kept.reduce((sum, id) => sum + manifest.keke.empty_triangles_dropped[id], 0);
  assert.equal(kept.reduce((sum, id) => sum + manifest.keke.triangles[id][0], 0) + empty, 57292 - 3 * 15588, 'body and fork of the near keke, triangle for triangle');
  assert.ok(empty < 600, `${empty} triangles of no area`);
});

test('the three keke fronts share one body', () => {
  const k = VEHICLE_META.models.keke;
  assert.deepEqual(k.trims, ['modern', 'classic', 'tvs']);
  assert.deepEqual(k.parts.body, ['keke.body', 'keke.front.{trim}']);
  const body = VEHICLE_META.parts['keke.body'].lods[0].t;
  for (const trim of k.trims) assert.ok(VEHICLE_META.parts[`keke.front.${trim}`].lods[0].t < body / 4, `${trim}: the front is a small part of the whole`);
  assert.notEqual(VEHICLE_META.parts['keke.front.classic'].lods[0].t, VEHICLE_META.parts['keke.front.modern'].lods[0].t, 'round lamps are not square lamps');
});

test("no maker's name, badge or logo from the supplied coach reaches the game", () => {
  const SLOT = Object.fromEntries(SLOTS.map((s, i) => [s, i]));
  const b = VEHICLE_META.models.bus;
  // no slot, no part, no texture and no material group is left for a logo
  assert.ok(!SLOTS.includes('seatmark') && !SLOTS.includes('badge'), 'the logo slots are retired');
  assert.equal(b.parts.marks, undefined);
  assert.ok(!Object.keys(VEHICLE_META.parts).some((id) => /mark|badge|logo/i.test(id)));
  assert.deepEqual(b.textures, {}, 'the two photographed logos are not shipped');
  const manifest = JSON.parse(readFileSync(asset('manifest.json'), 'utf8'));
  const left = manifest.bus.branding_left_out;
  assert.deepEqual([left.letters, left.seat_logos, left.badges], [14, 36, 2], 'the name twice over, a logo on each seat back, the badge on the nose and the steering wheel');
  const retired = [SLOTS.indexOf('unused'), SLOTS.lastIndexOf('unused')];
  assert.equal(retired[1] - retired[0], 1, 'two retired slots');
  for (const id of Object.keys(VEHICLE_META.parts).filter((k) => k.startsWith('bus.'))) for (let lod = 0; lod < VEHICLE_META.parts[id].lods.length; lod += 1) {
    const { slot, rec, pos, idx } = unpack(id, lod);
    assert.ok(!slot.includes(retired[0]) && !slot.includes(retired[1]), `${id} level ${lod} carries no logo`);
    assert.ok(rec.groups.every((g) => g.kind === 'solid' || g.kind === 'glass'), `${id} level ${lod} needs no logo texture`);
    assert.equal(rec.uv, undefined, `${id} level ${lod} is drawn in flat colour`);
    if (id === 'bus.wheel') continue;
    // nothing stands where the raised letters of the name stood
    for (let t = 0; t < idx.length; t += 3) {
      const c = [0, 1, 2].map((k) => (pos[idx[t] * 3 + k] + pos[idx[t + 1] * 3 + k] + pos[idx[t + 2] * 3 + k]) / 3);
      for (const [lo, hi] of left.letter_boxes) assert.ok(!(c[0] > lo[0] && c[0] < hi[0] && c[1] > lo[1] && c[1] < hi[1] && c[2] > lo[2] - 0.0005 && c[2] < hi[2] + 0.0005), `${id} level ${lod}: a triangle where a letter of the name was`);
    }
  }
  // the triangles drawn near are the master's, less the wheels' reductions and exactly these pieces
  assert.ok(left.triangles > 900 && left.triangles < 1000);
  // where the name stood, a coach now shows its operator's
  for (const name of ['nose', 'nameRear', 'visor', 'nameLeft', 'nameRight']) assert.ok(b.panels[name], `a place for the operator's name: ${name}`);
  close(b.panels.nose.corners[0][2], 5.8465, 0.01, 'the nose panel lies on the bar between the lamps');
  // and the words themselves appear nowhere the player's browser is sent
  const words = /innoson|\bivm\b/i;
  assert.ok(!words.test(JSON.stringify(VEHICLE_META)), 'the kit');
  const sources = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? sources(resolve(dir, e.name)) : [resolve(dir, e.name)]));
  for (const file of sources(resolve(here, '../src'))) {
    if (file.endsWith('-data.js')) continue;      // packed geometry: its meta is checked above
    assert.ok(!words.test(readFileSync(file, 'utf8')), file);
  }
  for (const c of [0, 1, 2, 3, 4, 5, 6, 7].map(busLook)) assert.ok(!words.test(JSON.stringify(c)) && !words.test(JSON.stringify(resolveLook(c))));
  // the exported levels are named for what they are
  assert.deepEqual(readdirSync(asset('bus/lod')).sort(), ['coach_lod0.glb', 'coach_lod1.glb', 'coach_lod2.glb']);
  for (const file of readdirSync(asset('bus/lod'))) { const data = readFileSync(asset(`bus/lod/${file}`)); const json = data.subarray(20, 20 + data.readUInt32LE(12)).toString('utf8'); assert.ok(!words.test(json), file); }
  assert.deepEqual(readdirSync(asset('bus/textures')), [], 'no logo images kept beside the coach');
});

test('colours and finishes come from the supplied materials', () => {
  const k = VEHICLE_META.models.keke, b = VEHICLE_META.models.bus;
  const srgb = (c) => Math.round(255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055));
  assert.deepEqual(k.colours.paint.map(srgb), [231, 180, 14], 'the yellow the keke came in');
  close(k.finish.glassOpacity, 0.32, 0.001, 'windscreen');
  assert.deepEqual(b.colours.paint, [0.008, 0.38, 0.055], 'the green the coach came in');
  assert.deepEqual(b.colours.accent, b.colours.paint, 'its lettering was the same green');
  const supplied = (list, id) => list.find((e) => e.id === id);
  for (let i = 0; i < 3; i += 1) close(srgb(k.colours.paint[i]), (supplied(KEKE_PAINTS, 'yellow').paint >> (16 - 8 * i)) & 255, 1, 'the yellow in the catalogue is the supplied yellow');
  for (let i = 0; i < 3; i += 1) close(srgb(b.colours.paint[i]), (supplied(BUS_LIVERIES, 'green').paint >> (16 - 8 * i)) & 255, 3, 'the green in the catalogue is the supplied green');
  for (const slot of ['paint', 'glass', 'rubber', 'alloy']) assert.ok(k.finish[slot] && b.finish[slot], `${slot} has a finish`);
});

test('the sizes the simulation uses are the sizes of the models', () => {
  for (const model of ['keke', 'bus']) {
    const size = VEHICLE_META.models[model].size, rule = VEHICLE_MODELS[model];
    close(rule.width, size.width, 0.002, `${model} width`); close(rule.length, size.length, 0.002, `${model} length`); close(rule.height, size.height, 0.002, `${model} height`);
    close(rule.bodyWidth, size.body, 0.06, `${model} body width`); close(rule.wheelRadius, VEHICLE_META.models[model].wheelRadius, 0.002, `${model} wheel`);
    assert.ok(rule.halfLength >= Math.max(size.front, -size.back), `${model}: the footprint covers its length`);
    assert.ok(rule.halfWidth >= size.body / 2, `${model}: the footprint covers its body`);
    assert.deepEqual(rule.trims, VEHICLE_META.models[model].trims);
  }
  assert.ok(VEHICLE_KINDS.keke.radius >= VEHICLE_MODELS.keke.bodyWidth / 2 + 0.4, 'a driven keke keeps clear of walls by more than half its width');
  // room for a seated adult under the canopy: seat to crown is about 0.92 m for someone 1.82 m tall
  assert.ok(VEHICLE_META.models.keke.seats.driver[1] + 0.92 < VEHICLE_META.models.keke.size.height - 0.04);
});

// ------------------------------------------------------------------ looks --

test('seven colours of each, as numbered in the brief, all on the one design', () => {
  assert.deepEqual(KEKE_PAINTS.map((p) => p.id), ['blue', 'green', 'red', 'yellow', 'white', 'black', 'orange']);
  assert.deepEqual(BUS_LIVERIES.map((p) => p.id), ['blue', 'green', 'red', 'white', 'yellow', 'silver', 'dark']);
  for (const model of ['keke', 'bus']) {
    const sheet = variantSheet(model);
    assert.equal(sheet.length, 7);
    const looks = sheet.map((v) => resolveLook(v.look));
    assert.equal(new Set(looks.map((l) => l.colours.paint)).size, 7, 'seven different paints');
    for (const l of looks) { assert.equal(l.model, model); assert.ok(VEHICLE_MODELS[model].trims.includes(l.trim), 'one of the supplied shapes'); }
  }
});

test('a look only ever chooses among supplied shapes and catalogue colours', () => {
  assert.deepEqual(kekeLook(7), kekeLook(7), 'the same number is the same keke');
  const junk = resolveLook({ model: 'keke', trim: 'limousine', paint: 'tartan', canopy: 'gold', wear: 9, dirt: -2, extras: ['wings'] });
  assert.equal(junk.trim, 'modern'); assert.equal(junk.id, 'yellow'); assert.equal(junk.wear, 1); assert.equal(junk.dirt, 0); assert.deepEqual(junk.extras, []);
  assert.equal(resolveLook({ model: 'spaceship' }).model, 'keke');
  assert.equal(resolveLook({ model: 'bus', livery: 'tartan' }).id, 'green');
  assert.equal(resolveLook(null).id, 'yellow');
  const many = Array.from({ length: 40 }, (_, n) => kekeLook(n));
  assert.equal(new Set(many.map((l) => l.paint)).size, 7, 'every colour turns up');
  assert.equal(new Set(many.map((l) => l.trim)).size, 3, 'every front turns up');
  for (let n = 1; n < 40; n += 1) assert.ok(many[n].paint !== many[n - 1].paint || many[n].trim !== many[n - 1].trim, `kekes ${n - 1} and ${n} are not twins`);
  assert.ok(many.some((l) => l.wear < 0.25) && many.some((l) => l.wear > 0.6), 'some are fresh and some are worn');
  const coaches = Array.from({ length: 14 }, (_, n) => busLook(n));
  assert.equal(new Set(coaches.map((l) => l.livery)).size, 7);
  for (const c of coaches) { assert.ok(BUS_OPERATORS.includes(c.operator)); assert.equal(c.advert, null, 'adverts belong to a town, not to the rules'); assert.equal(c.marks, undefined); }
});

// ----------------------------------------------------------------- the town --

test('no keke or coach in the game is drawn from anything but the supplied models', () => {
  const old = readFileSync(resolve(here, '../src/client/render-vehicles.js'), 'utf8');
  assert.ok(!/kind === 'keke'/.test(old) && !/kind === 'bus'/.test(old), 'the old hand-made keke and bus are gone');
  for (const file of readdirSync(resolve(here, '../src/client'))) {
    if (!file.startsWith('render-') || !file.endsWith('.js')) continue;
    const source = readFileSync(resolve(here, '../src/client', file), 'utf8');
    assert.ok(!/kind: 'bus'/.test(source) && !/kind: 'keke'/.test(source), `${file} draws no keke or bus of its own`);
  }
  assert.match(readFileSync(resolve(here, '../src/client/render-actors.js'), 'utf8'), /makeVehicleModel\(look/);
  for (const v of ZONE_VEHICLES) if (v.kind === 'bus' || v.kind === 'keke') { assert.equal(v.look.model, v.kind); assert.ok(resolveLook(v.look).colours.paint !== undefined); }
});

test('parked coaches and kekes: none alike, none in the way', () => {
  const parked = ZONE_VEHICLES.filter((v) => v.kind === 'bus' || v.kind === 'keke');
  assert.equal(parked.filter((v) => v.kind === 'bus').length, 3);
  assert.ok(parked.filter((v) => v.kind === 'keke').length >= 10);
  assert.equal(new Set(parked.map((v) => v.plate)).size, parked.length, 'every plate is its own');
  const sign = (v) => { const l = resolveLook(v.look); return [l.model, l.trim, l.id, JSON.stringify(l.texts), l.colours.canopy, l.colours.seat].join('|'); };
  assert.equal(new Set(parked.map(sign)).size, parked.length, 'no two are turned out the same');
  assert.equal(new Set(parked.filter((v) => v.kind === 'bus').map((v) => resolveLook(v.look).id)).size, 3, 'three coaches, three liveries');
  assert.ok(new Set(parked.filter((v) => v.kind === 'keke').map((v) => resolveLook(v.look).id)).size >= 5, 'kekes in at least five colours');
  assert.equal(resolveLook(parked[0].look).id, 'green', 'the first coach is in the livery it was designed in');
  const boxes = parked.map((v) => footprintBox(v.kind, v.x, v.z, v.heading));
  const onRoad = (x, z) => ZONE_ROADS.some((r) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1);
  parked.forEach((v, i) => {
    const b = boxes[i];
    assert.ok(Math.abs(Math.sin(v.heading) * Math.cos(v.heading)) < 1e-9, `${v.plate} stands square to the grid, so its box is exact`);
    // it is solid to someone on foot, and there is room to walk round it
    assert.equal(zoneWalkable(v.x, v.z), false, `${v.plate} is solid`);
    assert.equal(zoneWalkable((b.x0 + b.x1) / 2, b.z0 + 0.3), false, `${v.plate} is solid to its end`);
    for (const [x, z] of [[b.x0 - 1.2, v.z], [b.x1 + 1.2, v.z], [v.x, b.z0 - 1.2], [v.x, b.z1 + 1.2]]) assert.ok(zoneWalkable(x, z), `${v.plate}: room to pass at ${x.toFixed(1)}, ${z.toFixed(1)}`);
    for (const [x, z] of [[b.x0, b.z0], [b.x1, b.z0], [b.x0, b.z1], [b.x1, b.z1]]) assert.ok(!onRoad(x, z), `${v.plate} is off the carriageway`);
    for (const bld of ZONE_BUILDINGS) assert.ok(b.x1 < bld.x - bld.w / 2 || b.x0 > bld.x + bld.w / 2 || b.z1 < bld.z - bld.d / 2 || b.z0 > bld.z + bld.d / 2, `${v.plate} is clear of ${bld.id}`);
    boxes.forEach((o, j) => { if (j !== i) assert.ok(b.x1 + 1 < o.x0 || b.x0 - 1 > o.x1 || b.z1 + 1 < o.z0 || b.z0 - 1 > o.z1, `${v.plate} and ${parked[j].plate} are apart`); });
    for (const s of ZONE_SPOTS) if (!s.room) assert.ok(s.x < b.x0 - 0.8 || s.x > b.x1 + 0.8 || s.z < b.z0 - 0.8 || s.z > b.z1 + 0.8, `${v.plate} is not where people stand (${s.venue})`);
    for (const bay of ZONE_VEHICLE_BAYS) assert.ok(Math.hypot(bay.x - v.x, bay.z - v.z) > 5, `${v.plate} is clear of the hire bays`);
    // nor across a path people walk
    for (const [a, c] of ZONE_EDGES) {
      const [ax, az] = ZONE_NODES[a], [cx, cz] = ZONE_NODES[c];
      if (Math.max(ax, cx) < b.x0 - 2 || Math.min(ax, cx) > b.x1 + 2 || Math.max(az, cz) < b.z0 - 2 || Math.min(az, cz) > b.z1 + 2) continue;
      const steps = Math.max(2, Math.ceil(Math.hypot(cx - ax, cz - az)));
      for (let k = 0; k <= steps; k += 1) { const px = ax + ((cx - ax) * k) / steps, pz = az + ((cz - az) * k) / steps; assert.ok(px < b.x0 - 0.9 || px > b.x1 + 0.9 || pz < b.z0 - 0.9 || pz > b.z1 + 0.9, `${v.plate} stands on the path ${a} to ${c}`); }
    }
  });
  // a driven keke cannot be put through a parked coach
  const coach = parked[0];
  assert.equal(vehicleFits('keke', coach.x, coach.z + 4), false);
  assert.equal(vehicleFits('keke', coach.x + 1.45 + VEHICLE_KINDS.keke.radius - 0.2, coach.z), false, 'nor scrape along its side');
});

test('the kekes the simulation owns: each has a look, kept through a save, chosen at purchase', () => {
  const { host, id } = newWorld();
  const fleet = host.game.view(id).vehicles;
  assert.equal(fleet.length, 2);
  for (const v of fleet) { const l = resolveLook(v.look); assert.equal(l.model, 'keke'); assert.equal(l.texts.slogan, 'OKOYE KEKE HIRE', "the dealer's name is on his kekes"); }
  assert.deepEqual([fleet[0].look.trim, fleet[0].look.paint], ['modern', 'yellow'], 'the first is the keke as it was designed');
  assert.ok(fleet[0].look.paint !== fleet[1].look.paint && fleet[0].look.trim !== fleet[1].look.trim, 'the two for hire differ');
  // its box for someone on foot follows its heading
  const box = vehicleBox({ kind: 'keke', x: 0, z: 0, heading: Math.PI / 2 });
  close(box.x1, VEHICLE_MODELS.keke.halfLength, 1e-9, 'lengthways along x when it faces east'); close(box.z1, VEHICLE_MODELS.keke.halfWidth, 1e-9, 'and its width along z');
  // buying: the colour and front asked for, or the supplied ones if the request is nonsense
  fund(host, id, 400_000);
  goToService(host, id, 'park');
  waitUntilOpen(host, id, 'park');
  const options = ok(host.game.intent(id, { type: 'vehicle.options' }));
  assert.equal(options.paints.length, 7); assert.deepEqual(options.trims, ['modern', 'classic', 'tvs']);
  const red = ok(host.game.intent(id, { type: 'vehicle.buy', paint: 'red', trim: 'classic' }));
  assert.deepEqual([red.vehicle.look.paint, red.vehicle.look.trim, red.vehicle.look.floor], ['red', 'classic', 'green']);
  assert.ok(red.vehicle.look.wear < 0.1 && red.vehicle.look.dirt === 0, 'bought new');
  // move it off the bay so there is room for the next
  const v = host.game.state.vehicles.list[red.vehicle.id]; v.x = -20; v.z = 78;
  const odd = ok(host.game.intent(id, { type: 'vehicle.buy', paint: 'plaid', trim: 'tank' }));
  assert.deepEqual([odd.vehicle.look.paint, odd.vehicle.look.trim], ['yellow', 'modern']);
  // saved and loaded, each keke is still itself
  const again = createHost({ saved: JSON.parse(JSON.stringify(host.save())) });
  for (const car of host.game.view(id).vehicles) assert.deepEqual(again.game.view(id).vehicles.find((c) => c.id === car.id).look, car.look);
  // a world saved before looks existed: the dealer's kekes are turned out his way, a player's keeps the supplied yellow
  const old = JSON.parse(JSON.stringify(host.save()));
  for (const car of Object.values(old.game.vehicles.list)) delete car.look;
  const migrated = createHost({ saved: old });
  const now = migrated.game.view(id).vehicles;
  assert.deepEqual(now.find((c) => c.id === 'V-0001').look, fleet[0].look);
  assert.deepEqual([now.find((c) => c.id === red.vehicle.id).look.paint, now.find((c) => c.id === red.vehicle.id).look.trim], ['yellow', 'modern']);
  for (const car of now) assert.ok(car.look && car.look.model === 'keke');
});
