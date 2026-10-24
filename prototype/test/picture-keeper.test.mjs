// A phone's pictures painted in the page let go from the graphics card when nothing drawn has used them for a while
// (picture-keeper.js, 23 October 2026): which are let go, which are kept, and when. Without a graphics card: the
// renderer's record of what is on the card is a stand-in that three.js's own dispose empties, as three.js does.
//
//   node --test test/picture-keeper.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
globalThis.THREE = require('../vendor/three.min.js');
// (the browser's kinds of picture, as the keeper tells them apart)
globalThis.HTMLCanvasElement = class { constructor(w = 256, h = 64) { this.width = w; this.height = h; } };
globalThis.HTMLImageElement = class { constructor(w = 256, h = 256) { this.width = w; this.height = h; this.complete = true; } };
const { createPictureKeeper } = await import('../src/client/picture-keeper.js');

// the renderer's properties, as three.js keeps them: a picture handed to the card has its __webglTexture; dispose takes it
function cardOf() {
  const props = new Map();
  const renderer = { properties: { has: (t) => props.has(t), get: (t) => { if (!props.has(t)) props.set(t, {}); return props.get(t); } } };
  const upload = (t) => { renderer.properties.get(t).__webglTexture = {}; if (!t.__watched) { t.__watched = true; t.addEventListener('dispose', () => props.delete(t)); } };
  return { renderer, upload, held: (t) => props.has(t) && !!props.get(t).__webglTexture };
}
const sign = (scene, image = new HTMLCanvasElement()) => {
  const texture = new THREE.Texture(image);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: texture }));
  scene.add(mesh);
  return { texture, mesh };
};

test('a picture out of sight for half a minute is let go; one in sight, or shared with one in sight, is kept', () => {
  const scene = new THREE.Scene(), { renderer, upload, held } = cardOf();
  const far = sign(scene), near = sign(scene), shared = sign(scene);
  const twin = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: shared.texture }));
  scene.add(twin);
  for (const s of [far, near, shared]) upload(s.texture);
  far.mesh.visible = false; shared.mesh.visible = false;          // (twin, using the same picture, is shown)
  const keeper = createPictureKeeper(scene, renderer, { keepMs: 30000, everyMs: 5000 });
  keeper.step(0);                                                  // (first seen out of sight: its time starts)
  keeper.step(20000);
  assert.ok(held(far.texture), 'not yet: out of sight for 20 s');
  keeper.step(31000);
  assert.ok(!held(far.texture), 'out of sight for more than 30 s: let go');
  assert.ok(held(near.texture) && held(shared.texture), 'in sight, and shared with one in sight: kept');
  assert.deepEqual([keeper.state().letGo, keeper.state().MB], [1, 0.1]);
});

test('out of sight as part of a hidden group; shown again its time starts again; hidden again, let go again', () => {
  const scene = new THREE.Scene(), { renderer, upload, held } = cardOf();
  const chunk = new THREE.Group(); scene.add(chunk);
  const s = sign(chunk);
  upload(s.texture);
  chunk.visible = false;                                           // (a chunk of the town beyond the view)
  const keeper = createPictureKeeper(scene, renderer);
  keeper.step(0); keeper.step(31000);
  assert.ok(!held(s.texture), 'let go with its group out of sight');
  chunk.visible = true; upload(s.texture);                         // (drawn again: three.js hands it over again)
  keeper.step(40000);
  chunk.visible = false;
  keeper.step(50000); keeper.step(65000);
  assert.ok(held(s.texture), 'shown 25 s ago: kept');
  keeper.step(71000);
  assert.ok(!held(s.texture), 'out of sight for 30 s since: let go again');
  assert.equal(keeper.state().letGo, 2);
});

test('never let go: a picture the game makes again from its file, one under a hall kept ready, one the page no longer holds, one not on the card; and not more often than asked', () => {
  const scene = new THREE.Scene(), { renderer, upload, held } = cardOf();
  const restorable = sign(scene);
  const hall = new THREE.Group(); hall.userData.keepPictures = true; scene.add(hall);
  const inHall = sign(hall);
  const bitmap = sign(scene, { width: 1024, height: 1024, close() {} });   // (an ImageBitmap, let go by the page once drawn)
  const never = sign(scene);                                       // (never handed to the card)
  for (const s of [restorable, inHall, bitmap]) upload(s.texture);
  for (const s of [restorable, bitmap, never]) s.mesh.visible = false;
  hall.visible = false;
  const keeper = createPictureKeeper(scene, renderer, { skip: (t) => t === restorable.texture });
  keeper.step(0); keeper.step(31000);
  assert.ok(held(restorable.texture) && held(inHall.texture) && held(bitmap.texture));
  assert.ok(!held(never.texture));
  assert.equal(keeper.state().letGo, 0);
  // (asked again within `everyMs`: nothing is walked)
  const walks = keeper.state().walks;
  keeper.step(32000);
  assert.equal(keeper.state().walks, walks);
});
