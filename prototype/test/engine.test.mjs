// The 3D engine (three.js r186 since 23 October 2026, from r128): the library the game is given, and what the move
// changed that the game had to answer (tools/three/make.mjs; README, "three.js r186").
//
//   node --test test/engine.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const THREE = require('../vendor/three.min.js');
globalThis.THREE = THREE;
const files = (dir) => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? files(p) : [p]; });
const client = files(resolve(root, 'src/client')).filter((f) => f.endsWith('.js') && !f.endsWith('reaction-data.js'));
const source = Object.fromEntries(client.map((f) => [f.slice(root.length + 1), readFileSync(f, 'utf8')]));

test('the library is three.js r186, made for the game, holding every name the game and its tests use', () => {
  assert.equal(THREE.REVISION, '186');
  const symbols = JSON.parse(readFileSync(resolve(root, 'vendor/three.symbols.json'), 'utf8'));
  assert.equal(symbols.revision, '186');
  // (and what the add-ons' script adds, at the levels that fetch it: three-post.min.js)
  const held = new Set([...symbols.names, ...(symbols.post || [])]);
  const used = new Set();
  const tools = files(resolve(root, 'tools')).filter((f) => /\.m?js$/.test(f) && !f.startsWith(resolve(root, 'tools/three')));
  for (const f of [...client, ...files(resolve(root, 'test')).filter((f) => /\.m?js$/.test(f)), ...tools]) for (const m of readFileSync(f, 'utf8').matchAll(/\bTHREE\.([A-Za-z_][\w$]*)/g)) used.add(m[1]);
  const missing = [...used].filter((n) => !held.has(n));
  assert.deepEqual(missing, [], 'run node tools/three/make.mjs');
  for (const name of symbols.names) assert.ok(THREE[name] !== undefined, `THREE.${name}`);
  // the add-ons' script: three.js's own GTAOPass, unchanged, taking the library from the page's THREE and adding its own
  // name to it, nothing of the library carried twice
  const post = readFileSync(resolve(root, 'vendor/three-post.min.js'), 'utf8');
  assert.match(post.slice(0, 300), /three\.js r186 add-ons .*GTAOPass/);
  assert.ok(post.length < 60000, `${post.length} bytes`);
  assert.ok(!/WebGLRenderer|class \w+ extends Texture/.test(post), 'none of the library itself');
  require('../vendor/three-post.min.js');
  for (const name of symbols.post) assert.equal(typeof THREE[name], 'function', `THREE.${name}`);
  // (made from the authors' own files, kept unchanged beside it, with their licence)
  assert.match(readFileSync(resolve(root, 'vendor/three.min.js'), 'utf8').slice(0, 200), /three\.js r186/);
  assert.match(readFileSync(resolve(root, 'vendor/THREE-LICENSE.txt'), 'utf8'), /MIT License/);
});

test('a colour written in the game means what it meant (no conversion from sRGB), pictures and the screen still sRGB', () => {
  assert.equal(THREE.ColorManagement.enabled, false);
  const c = new THREE.Color(0x808080);
  assert.equal(c.r, 128 / 255);
  assert.equal(new THREE.Color('#336699').getHex(), 0x336699);
  // (linear() turns a colour from sRGB on purpose, as before)
  const l = new THREE.Color(0x808080).convertSRGBToLinear();
  assert.ok(Math.abs(l.r - 0.2158605) < 1e-6, String(l.r));
  // every picture once marked sRGB is marked so in r186's words, and nothing still uses r128's
  for (const [file, text] of [...Object.entries(source), ...files(resolve(root, 'tools')).filter((f) => /\.m?js$/.test(f) && !f.startsWith(resolve(root, 'tools/three'))).map((f) => [f, readFileSync(f, 'utf8')])]) {
    assert.ok(!/sRGBEncoding|LinearEncoding|\.encoding\s*=|outputEncoding|THREE\.PCFSoftShadowMap/.test(text), `${file}: r128's words`);
  }
  for (const page of ['main.js', 'lab.js', 'yard.js', 'creator.js', 'asset-view.js']) assert.match(source[`src/client/${page}`], /outputColorSpace = THREE\.SRGBColorSpace/, page);
});

test('a surface gives back its light as in r128: its colour not darkened by its gloss\'s share, a rough metal\'s gloss as it was', () => {
  const s = THREE.ShaderChunk.lights_physical_pars_fragment;
  assert.ok(s.includes('reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseContribution );'));
  assert.ok(s.includes('vec3 diffuse = irradiance * BRDF_Lambert( material.diffuseContribution );'));
  assert.ok(s.includes('reflectedLight.directSpecular += irradiance * specularBRDF;'));
  assert.ok(!s.includes('* ( 1.0 - F )') && !s.includes('( 1.0 - singleScattering - multiScattering )') && !s.includes('specularBRDF * material.multiScatteringCompensation'));
});

test('see-through things seen from both sides are drawn once, as in r128', () => {
  const m = new THREE.MeshStandardMaterial({ transparent: true, side: THREE.DoubleSide });
  assert.equal(m.forceSinglePass, true);
  m.forceSinglePass = false;
  assert.equal(m.forceSinglePass, true);
  assert.equal(m.clone().forceSinglePass, true);
});

test('see-through things drawn in r128\'s order, and a solid surface\'s alpha as r128 wrote it: the renderer changed as bundled', async () => {
  const { LIGHTS_AS_R128, RENDERER_AS_R128, timesIn } = await import('../tools/three/as-r128.mjs');
  const module = readFileSync(resolve(root, 'vendor/three-r186/three.module.js'), 'utf8');
  // (each change is found exactly once in three.js's own file, kept unchanged)
  for (const [was] of [...LIGHTS_AS_R128, ...RENDERER_AS_R128]) assert.equal(timesIn(module, was), 1, String(was));
  const script = readFileSync(resolve(root, 'vendor/three.min.js'), 'utf8');
  assert.match(script.slice(0, 300), /as r128 drew: colours, lights, single pass, order, alpha/);
  // (in the bundle: a solid surface no longer sets OPAQUE, and r186's ordering by the middle of a thing's shape is gone)
  assert.ok(script.includes('opaque:!1'), 'opaque: false');
  assert.ok(!/opaque:[a-zA-Z_$]+\.transparent===!1/.test(script), 'r186\'s OPAQUE rule left in');
  assert.ok(!/\.copy\([\w$]+\.boundingSphere\.center\)\)?[,;][\w$]+\.applyMatrix4\([\w$]+\.matrixWorld\)\.applyMatrix4\(/.test(script), 'r186\'s ordering left in');
});

test('the shaders the game changes: every piece it hooks exists in r186, and none of r128\'s removed names is left', () => {
  const hooked = new Set();
  for (const text of Object.values(source)) for (const m of text.matchAll(/#include <([a-z_]+)>/g)) hooked.add(m[1]);
  assert.ok(hooked.size >= 10);
  for (const name of hooked) assert.equal(typeof THREE.ShaderChunk[name], 'string', `#include <${name}>`);
  const gone = ['mapTexelToLinear', 'perturbNormal2Arb', 'lights_lambert_vertex', 'vLightFront', 'vIndirectFront', 'encodings_fragment', 'LinearTosRGB', 'BRDF_Diffuse_Lambert', 'emissiveMapTexelToLinear', 'GeometricContext', 'getShadowMask()'];
  for (const [file, text] of Object.entries(source)) for (const name of gone) assert.ok(!text.includes(name), `${file}: ${name}`);
  // (r128's vUv is r186's vMapUv in a hook of a built-in material; a ShaderMaterial of the game's own has its own vUv)
  for (const [file, text] of Object.entries(source)) {
    for (const m of text.matchAll(/\.replace\('#include <[a-z_]+>'[^;]*?\bvUv\b/g)) assert.fail(`${file}: vUv in a hook (${m[0].slice(0, 80)})`);
  }
  // r186 still has what the hooks use
  const all = Object.values(THREE.ShaderChunk).join('\n');
  for (const name of ['vMapUv', 'getTangentFrame', 'sRGBTransferOETF', 'BRDF_Lambert', 'IncidentLight directLight', 'faceDirection', 'directionalLights[']) assert.ok(all.includes(name), name);
  // the shadows: r186 has one kind of soft shadow; PCFSoftShadowMap is not asked for
  for (const [file, text] of Object.entries(source)) assert.ok(!/= THREE\.PCFSoftShadowMap/.test(text), file);
});

test('the lights in physical units: the sun and the sky times π, the lamps as near as they can be to what they lit', async () => {
  const { LIGHT, STREET_LAMP, HEADLAMP_LIGHT, TORCH_LIGHT, SCREEN_GLOW } = await import('../src/client/light.js');
  assert.equal(LIGHT, Math.PI);
  // what a lamp lit a surface with in r128, and in r186 (tools/three/fit-lights.mjs)
  const before = (d, I, D, k) => (d < D ? I * (1 - d / D) ** k : 0);
  const after = (d, I, D, k) => (I / Math.PI) / Math.max(d ** k, 0.01) * Math.max(0, 1 - (d / D) ** 4) ** 2;
  const close = (name, old, now, [a, b]) => {
    let worst = 0, sum = 0, n = 0, peak = 0;
    for (let d = a; d <= b; d += 0.05) { const x = before(d, ...old), y = after(d, ...now); peak = Math.max(peak, x); worst = Math.max(worst, Math.abs(x - y)); sum += (x - y) ** 2; n += 1; }
    const rms = Math.sqrt(sum / n) / peak;
    assert.ok(rms < 0.06 && worst / peak < 0.22, `${name}: ${(rms * 100).toFixed(1)}% on average, ${(worst / peak * 100).toFixed(1)}% at most`);
  };
  close('a street lamp', [1.25, 30, 1.6], [STREET_LAMP.intensity, STREET_LAMP.distance, STREET_LAMP.decay], [3, 30]);
  close('a car\'s headlamp', [2.8, 38, 1.6], [HEADLAMP_LIGHT.car, HEADLAMP_LIGHT.distance, HEADLAMP_LIGHT.decay], [1.5, 38]);
  close('a motorcycle\'s headlamp', [2.2, 38, 1.6], [HEADLAMP_LIGHT.bike, HEADLAMP_LIGHT.distance, HEADLAMP_LIGHT.decay], [1.5, 38]);
  close('the torch', [3.4, 30, 1.7], [TORCH_LIGHT.intensity, TORCH_LIGHT.distance, TORCH_LIGHT.decay], [0.8, 30]);
  close('a phone\'s screen', [1, 1.5, 2], [SCREEN_GLOW.times, SCREEN_GLOW.distance, SCREEN_GLOW.decay], [0.08, 1.5]);
  // every light the game makes is in these units
  for (const [file, text] of Object.entries(source)) {
    for (const m of text.matchAll(/new THREE\.(Directional|Hemisphere|Ambient)Light\(([^;]*?)\)/g)) {
      const args = m[2].split(',').map((s) => s.trim());
      const strength = args[m[1] === 'Hemisphere' ? 2 : 1];
      assert.ok(strength === undefined || /LIGHT/.test(strength), `${file}: ${m[0]}`);
    }
    for (const m of text.matchAll(/new THREE\.(Point|Spot)Light\(([^;]*?)\);/g)) assert.ok(/STREET_LAMP|HEADLAMP|SCREEN_GLOW|TORCH/.test(m[2]), `${file}: ${m[0]}`);
  }
});

test('the graphics card\'s count: a picture made with all its levels at once is counted once, its smaller copies with it', async () => {
  const { countGraphics } = await import('../src/client/graphics-count.js');
  const gl = { texImage2D() {}, texStorage2D() {}, generateMipmap() {}, bindTexture() {}, activeTexture() {}, deleteTexture() {}, compressedTexImage2D() {}, bindRenderbuffer() {}, deleteRenderbuffer() {}, renderbufferStorage() {}, renderbufferStorageMultisample() {}, drawingBufferWidth: 0, drawingBufferHeight: 0 };
  const count = countGraphics(gl);
  const a = {}, b = {};
  // r186: storage for all eleven levels of a 1024 picture (sRGB, 4 bytes a pixel), then its levels filled
  gl.activeTexture(33984); gl.bindTexture(3553, a);
  gl.texStorage2D(3553, 11, 35907, 1024, 1024);
  gl.generateMipmap(3553);
  let all = 0; for (let s = 1024; s >= 1; s >>= 1) all += s * s * 4;
  assert.equal(count.pictures, all);
  // r128's way: the picture, then its smaller copies made (a third more)
  gl.bindTexture(3553, b);
  gl.texImage2D(3553, 0, 6408, 512, 512, 0, 6408, 5121, null);
  gl.generateMipmap(3553);
  assert.equal(count.pictures, all + Math.round(512 * 512 * 4 * (1 + 1 / 3)));
  gl.deleteTexture(a);
  assert.equal(count.pictures, Math.round(512 * 512 * 4 * (1 + 1 / 3)));
});

test('the build loads the library from beside each page, never from elsewhere, and refuses a name it does not hold', () => {
  const build = readFileSync(resolve(root, 'build.mjs'), 'utf8');
  assert.ok(!/cdnjs|unpkg|jsdelivr/.test(build), 'no page loads the library from another site');
  assert.match(build, /threeNeeded\(/);
  assert.match(build, /does not hold: run node tools\/three\/make\.mjs/);
});
