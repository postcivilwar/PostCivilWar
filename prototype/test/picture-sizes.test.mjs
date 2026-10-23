// The graphics level's largest picture (glb.js: setPictureMost, stepPictures; graphics.js, pictureMost): every picture
// the game can make again from its file is made again no larger than the level's largest, one at a time, its old copy let
// go from the graphics card first (r186 gives a picture its room on the card once); raised again, those made smaller are
// made again larger. What can be checked without a graphics card: which pictures are made again, at what size, in what
// order, and that the old copy is let go and the new one handed over.
//
//   node --test test/picture-sizes.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
globalThis.THREE = require('../vendor/three.min.js');
const { letGoOnceDrawn, setPictureMost, stepPictures, picturesWaiting, pictureMost } = await import('../src/client/glb.js');

// a picture as the browser gives one (an ImageBitmap): its size, and closed once the graphics card has it
const picture = (side, h = side) => ({ width: side, height: h, closed: false, close() { this.closed = true; this.width = 0; this.height = 0; } });
// a texture whose picture can be made again from its file, at most `own` pixels across, as the game's makers do
function made(own, { h = own } = {}) {
  const asked = [];
  const restore = (size) => { asked.push(size); const k = size && Math.max(own, h) > size ? size / Math.max(own, h) : 1; return Promise.resolve(picture(Math.round(own * k), Math.round(h * k))); };
  const texture = new THREE.Texture(picture(own, h));
  let disposed = 0;
  texture.addEventListener('dispose', () => { disposed += 1; });
  letGoOnceDrawn(texture, restore);
  // (handed to the graphics card: three.js calls onUpdate once it has uploaded the picture)
  const upload = () => { if (texture.onUpdate) texture.onUpdate(texture); };
  upload();
  return { texture, asked, upload, disposed: () => disposed };
}
const settle = async () => { for (let i = 0; i < 50 && picturesWaiting(); i += 1) { stepPictures(); await new Promise((r) => setTimeout(r, 0)); } };

test('lowering the level makes every larger picture again at its largest, one at a time, the old copy let go first', async () => {
  const a = made(2048), b = made(1024), c = made(512), d = made(4096, { h: 2048 });
  assert.equal(a.texture.userData.drawn, 2048, 'its size on the card, kept as the page\'s copy is let go');
  assert.ok(a.texture.image.closed, 'the page\'s copy let go once the card has it');
  const queued = setPictureMost(1024);
  assert.equal(pictureMost(), 1024);
  assert.equal(queued, 2, 'the 2048 and the 4096 are made again; the 1024 and the 512 are already small enough');
  // one at a time
  stepPictures(); stepPictures();
  assert.equal(picturesWaiting(), 2, 'one being made, one waiting');
  await settle();
  for (const x of [a, d]) {
    assert.equal(x.disposed(), 1, 'its old copy let go from the graphics card');
    assert.equal(x.texture.userData.cap, 1024);
    x.upload();
  }
  assert.deepEqual(a.asked, [1024]); assert.deepEqual(d.asked, [1024]);
  assert.equal(a.texture.userData.drawn, 1024);
  assert.equal(d.texture.userData.drawn, 1024, 'its shape kept: 1024 by 512');
  assert.equal(b.asked.length + c.asked.length, 0);
});

test('raising the level makes the pictures made smaller again larger, as large as their files give', async () => {
  const a = made(2048), b = made(256);
  setPictureMost(512); await settle(); a.upload();
  assert.equal(a.texture.userData.drawn, 512);
  assert.equal(b.asked.length, 0, 'a picture smaller than the largest is left alone');
  setPictureMost(2048); await settle(); a.upload();
  assert.equal(a.texture.userData.drawn, 2048);
  setPictureMost(0); await settle(); a.upload();
  assert.deepEqual(a.asked, [512, 2048, 0], 'as fetched: made again without a cap, in case its file holds more');
  assert.equal(a.texture.userData.drawn, 2048);
  assert.equal(b.asked.length, 0);
});

test('a picture that comes larger than the level\'s largest is made smaller in its turn, and one let go is forgotten', async () => {
  setPictureMost(512); await settle();
  const late = made(1024);
  assert.equal(picturesWaiting(), 1, 'queued as the card took it');
  await settle(); late.upload();
  assert.equal(late.texture.userData.drawn, 512);
  // let go by the game (its model gone): not made again
  const gone = made(2048);
  gone.texture.dispose();
  setPictureMost(256); await settle();
  assert.deepEqual(gone.asked, []);
  setPictureMost(0); await settle();
});

test('the level changed again while a picture was being made: it is made again at the size asked for now', async () => {
  setPictureMost(0); await settle();
  const a = made(2048);
  setPictureMost(512);
  stepPictures();                       // (being made at 512)
  setPictureMost(1024);                 // (changed while it is being made)
  await settle(); a.upload();
  await settle(); a.upload();
  assert.equal(a.texture.userData.drawn, 1024);
  assert.deepEqual(a.asked, [512, 1024]);
  setPictureMost(0); await settle();
});
