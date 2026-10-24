// The air written into three.js's shader pieces (world-shading.js, stage 3 of the owner's brief and his extras of 24
// October): the clouds' shadows drifting over the land, far gloss spread (no glitter far off), the low haze, the mirage on
// hot tarmac, and puddles after rain; and the numbers for each by the hour and the weather.
//
//   node --test test/world-shading.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
globalThis.THREE = require('../vendor/three.min.js');
const { worldShadingInstalled, isRoad, setWorldShading, withoutWorldShading, worldShadingState, airAt, cloudThreshold, cloudShadeAt } = await import('../src/client/world-shading.js');
const { LEVEL_SETTINGS } = await import('../src/client/graphics.js');

test('every piece is written once into three.js\'s own shaders', () => {
  assert.equal(worldShadingInstalled, true);
  const C = THREE.ShaderChunk;
  assert.ok(C.lights_pars_begin.includes('float pcwCloudShade('), 'the clouds\' shadows');
  assert.ok(C.lights_fragment_begin.includes('directLight.color *= pcwCloudShade( geometryPosition );'), 'on the sun\'s light');
  assert.ok(C.lights_physical_fragment.includes('pcwAir.y * smoothstep( 30.0, 170.0, length( vViewPosition ) )'), 'far gloss spread');
  assert.ok(C.fog_fragment.includes('pcwAir.x * pcwLow'), 'the low haze');
  assert.equal(C.lights_pars_begin.split('float pcwHash(').length, 2, 'once');
  assert.ok(!/\bsin\(/.test(C.lights_pars_begin.slice(C.lights_pars_begin.indexOf('float pcwHash('), C.lights_pars_begin.indexOf('float pcwNoise('))), 'its numbers made without sin (the same on every card)');
  // the mirage and the puddles only on tarmac
  const road = (text) => { const a = text.indexOf('#ifdef PCW_ROAD'); return a >= 0; };
  assert.ok(road(C.fog_fragment) && C.fog_fragment.indexOf('pcwAir.z') > C.fog_fragment.indexOf('#ifdef PCW_ROAD'), 'the mirage on tarmac alone');
  assert.ok(C.lights_physical_fragment.includes('#ifdef PCW_ROAD') && C.lights_lambert_fragment.includes('pcwPuddle'), 'puddles on tarmac, lit with or without gloss');
  assert.ok(C.envmap_fragment.includes('#else\n\t\t\toutgoingLight = mix( outgoingLight, envColor.xyz, specularStrength * reflectivity );'), 'every other surface given back the sky as before');
});

test('a material is given the game\'s numbers as three.js prepares it, its program keyed as before', () => {
  const plain = new THREE.MeshStandardMaterial();
  const shader = { uniforms: {} };
  plain.onBeforeCompile(shader, null);
  for (const name of ['pcwTime', 'pcwClouds', 'pcwAir']) assert.ok(shader.uniforms[name], name);
  // a material's own hook still runs, after, and three.js still keys its program by that hook's text
  const own = new THREE.MeshLambertMaterial();
  let ran = false;
  const hook = function (s) { ran = !!s.uniforms.pcwAir; };
  own.onBeforeCompile = hook;
  own.onBeforeCompile({ uniforms: {} }, null);
  assert.equal(ran, true);
  assert.equal(own.onBeforeCompile.toString(), hook.toString());
  // tarmac is marked
  const tar = isRoad(new THREE.MeshStandardMaterial());
  assert.ok('PCW_ROAD' in tar.defines);
});

test('the numbers by the hour and the weather', () => {
  const noon = airAt({ sunUp: 0.95, cover: 0.12, wet: 0, hour: 13 });
  assert.ok(noon.clouds > 0.3 && noon.share < 0.2, `a clear noon: a few clouds' shadows ${JSON.stringify(noon)}`);
  assert.ok(noon.mirage > 0.8, 'the mirage at the height of a hot day');
  assert.equal(noon.puddles, 0);
  const morning = airAt({ sunUp: 0.5, cover: 0.12, wet: 0, hour: 8.5 });
  assert.equal(morning.mirage, 0, 'no mirage in the morning');
  const cloudy = airAt({ sunUp: 0.95, cover: 0.75, wet: 0, hour: 13 });
  assert.ok(cloudy.share > noon.share && cloudy.threshold < noon.threshold && cloudy.clouds > 0, 'broken cloud: more of the land in shadow');
  assert.ok(cloudy.mirage < noon.mirage * 0.5, 'less heat under cloud');
  const rain = airAt({ sunUp: 0.95, cover: 0.92, wet: 1, hour: 13 });
  assert.ok(rain.clouds < 0.05, 'a whole grey sky: no shadows of single clouds');
  assert.equal(rain.mirage, 0, 'no mirage on wet ground');
  assert.equal(rain.puddles, 1, 'puddles in the rain');
  const night = airAt({ sunUp: -0.6, cover: 0.12, wet: 0, hour: 1 });
  assert.equal(night.clouds, 0, 'no clouds\' shadows at night');
  assert.ok(night.haze > 0 && night.haze < noon.haze, 'less haze at night');
  const hall = airAt({ sunUp: 0.95, cover: 0.12, wet: 1, hour: 13, indoor: 1 });
  assert.deepEqual([hall.clouds, hall.haze, hall.mirage, hall.puddles], [0, 0, 0, 0], 'none of it in a hall');
});

test('the share of the land in the clouds\' shadows, as the shader\'s own noise has it', () => {
  // (the shader's hash and octaves, sampled here over other ground than the calibration's: the share over each threshold)
  const fract = (x) => x - Math.floor(x);
  const hash = (px, py) => { let x = fract(px * 0.1031), y = fract(py * 0.1031), z = fract(px * 0.1031); const d = x * (y + 33.33) + y * (z + 33.33) + z * (x + 33.33); x += d; y += d; z += d; return fract((x + y) * z); };
  const noise = (px, py) => { const ix = Math.floor(px), iy = Math.floor(py); let fx = px - ix, fy = py - iy; fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1); return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fy; };
  // (60,000 points over 20 km of other ground than the calibration's)
  let seed = 11; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const n = [];
  for (let i = 0; i < 60000; i += 1) { const px = (-2000 + rnd() * 20000) / 160, py = (9000 + rnd() * 20000) / 160; n.push(noise(px, py) * 0.62 + noise(px * 2.17 + 5.2, py * 2.17 + 1.3) * 0.28 + noise(px * 4.9 + 2.1, py * 4.9 + 7.7) * 0.10); }
  for (const share of [0.15, 0.3, 0.45]) {
    const t = cloudThreshold(share);
    const got = n.filter((v) => v > t).length / n.length;
    assert.ok(Math.abs(got - share) < 0.02, `share ${share}: ${got.toFixed(3)} of the land over ${t.toFixed(3)}`);
  }
  // and the game's own reckoning of it, at a point, agrees: the share of the land under a cloud's shadow as asked
  setWorldShading({ t: 40, clouds: 0.6, threshold: cloudThreshold(0.3) });
  let under = 0;
  for (let i = 0; i < 20000; i += 1) if (cloudShadeAt(-3000 + rnd() * 20000, 2000 + rnd() * 20000) < 0.7) under += 1;
  assert.ok(Math.abs(under / 20000 - 0.3) < 0.03, `${under / 20000}`);
  setWorldShading({ t: 40, clouds: 0 });
  assert.equal(cloudShadeAt(0, 0), 1, 'no clouds\' shadows, all the sun');
});

test('set each frame; a picture that is not of the town drawn without any of it, and the numbers put back', () => {
  setWorldShading({ t: 12, clouds: 0.4, threshold: 0.65, haze: 0.8, glint: 0.32, mirage: 0.5, puddles: 0.25 });
  assert.deepEqual(worldShadingState().air, [0.8, 0.32, 0.5, 0.25]);
  const inside = withoutWorldShading(() => worldShadingState());
  assert.deepEqual(inside.air, [0, 0, 0, 0]);
  assert.equal(inside.clouds[0], 0);
  assert.deepEqual(worldShadingState().air, [0.8, 0.32, 0.5, 0.25]);
  assert.equal(worldShadingState().clouds[0], 0.4);
});

test('by level: the air from Medium up, far gloss spread at every level, puddles where wet roads give back the sky', () => {
  const L = LEVEL_SETTINGS;
  for (const key of ['clouds', 'haze', 'mirage', 'dust', 'fireflies', 'wetTracks']) assert.deepEqual(L[key].map(Boolean), [true, true, true, false], key);
  assert.ok(L.glint.every((x) => x > 0), 'far gloss spread at every level');
  assert.deepEqual(L.puddles.map(Boolean), L.reflections.map((r) => r === 'full'), 'puddles where wet roads give back the sky');
  assert.deepEqual(L.glow.map(Boolean), [true, true, true, false], 'the glow from Medium up');
  assert.deepEqual(L.flare.map(Boolean), [true, false, false, false], 'the sun\'s flare at Ultra');
  assert.deepEqual(L.ao.map(Boolean), [true, true, false, false], 'soft darkening where things meet at High and Ultra');
  // the brief's "better water with reflections, waves and foam (HIGH+)": all three at High and Ultra, none below
  for (const key of ['waves', 'foam', 'mirror']) assert.deepEqual(L[key].map(Boolean), [true, true, false, false], key);
  assert.ok(L.mirrorSize[0] === 0.5 && L.mirrorSize[1] > 0.2 && L.mirrorSize[1] < 0.5, 'the town in the river: half the screen\'s size at Ultra, less at High');
});
