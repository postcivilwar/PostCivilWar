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
const { letGoOnceDrawn, setPictureMost, stepPictures, picturesWaiting, pictureMost, wantPicture, pictureWanted, setUploader, restorePictures } = await import('../src/client/glb.js');

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

// A picture's own largest (wantPicture, 23 October 2026): a parked truck's pictures at 512 on a phone from more than 60 m
// off (render-supplied.js), apart from the level's largest; what it is made at is the smaller of the two.
test('a picture\'s own largest makes it smaller, and larger again once given up; the level\'s largest still holds', async () => {
  setPictureMost(1024); await settle();
  const truck = made(1024), other = made(1024);
  assert.equal(truck.texture.userData.drawn, 1024);
  assert.equal(wantPicture(truck.texture, 512), true);
  assert.equal(pictureWanted(truck.texture), 512);
  await settle(); truck.upload();
  assert.equal(truck.texture.userData.drawn, 512, 'made again at its own largest');
  assert.equal(other.asked.length, 0, 'the others left as they are');
  assert.equal(truck.disposed(), 1, 'its old copy let go from the graphics card first');
  // the level lowered below it: the smaller of the two
  setPictureMost(256); await settle(); truck.upload(); other.upload();
  assert.equal(truck.texture.userData.drawn, 256);
  assert.equal(other.texture.userData.drawn, 256);
  // the level raised again: its own largest holds it at 512, the other back to 1024
  setPictureMost(1024); await settle(); truck.upload(); other.upload();
  assert.equal(truck.texture.userData.drawn, 512);
  assert.equal(other.texture.userData.drawn, 1024);
  // its own largest given up (the eye near it again): the level's
  wantPicture(truck.texture, 0); await settle(); truck.upload();
  assert.equal(truck.texture.userData.drawn, 1024);
  assert.deepEqual(truck.asked, [512, 256, 512, 1024]);
  setPictureMost(0); await settle(); truck.upload(); other.upload();
});

test('a picture\'s own largest changed back before its turn: not made again; asked for again as it is: nothing done', async () => {
  setPictureMost(0); await settle();
  const busy = made(2048), truck = made(1024);
  setPictureMost(1024);                 // (the 2048 being made at 1024: the truck waits its turn)
  stepPictures();
  wantPicture(truck.texture, 512);
  wantPicture(truck.texture, 0);        // (changed back before its turn)
  await settle(); busy.upload();
  assert.deepEqual(truck.asked, [], 'not made again');
  assert.equal(wantPicture(truck.texture, 0), false, 'asked for as it is: nothing to do');
  setPictureMost(0); await settle(); busy.upload();
});

test('a picture made under a cap that was raised before the card had it is made larger once the card has it', async () => {
  setPictureMost(512); await settle();
  const late = made(2048);              // (taken in at 2048, larger than the level's 512: queued as the card took it)
  stepPictures();                       // (being made at 512)
  setPictureMost(1024);                 // (raised while it is being made)
  await settle(); late.upload();        // (the card has the 512: larger again, in its turn)
  await settle(); late.upload();
  assert.equal(late.texture.userData.drawn, 1024);
  assert.deepEqual(late.asked, [512, 1024]);
  setPictureMost(0); await settle(); late.upload();
});

// 26 October 2026 (the owner's brief: the game hung on his phones and his iPhone closed it): a picture made again is
// handed to the graphics card at once, not when it is next drawn, so that the page lets its own copy go at once; and a
// lost drawing surface's pictures are made again one at a time, each handed over before the next is made.
test('a picture made again is handed to the graphics card at once, its page copy let go, though nothing draws it', async () => {
  setPictureMost(0); await settle();
  const handed = [];
  setUploader((texture) => { handed.push(texture); if (texture.onUpdate) texture.onUpdate(texture); });
  try {
    const far = made(2048);              // (out of sight: nothing will draw it)
    setPictureMost(1024); await settle();
    assert.ok(handed.includes(far.texture), 'handed over as it was made');
    assert.ok(far.texture.image.closed, 'the page\'s copy let go at once');
    assert.equal(far.texture.userData.drawn, 1024);
  } finally { setUploader(null); setPictureMost(0); await settle(); }
});

test('a lost drawing surface\'s pictures are made again one at a time, each handed over before the next is begun', async () => {
  setPictureMost(0); await settle();
  let inFlight = 0, most = 0;
  // (pictures as the browser's ImageBitmaps: one closed is 0 by 0, and that is how a picture let go is known)
  const hadBitmap = globalThis.ImageBitmap;
  class Bitmap { constructor(side) { this.width = side; this.height = side; this.closed = false; } close() { this.closed = true; this.width = 0; this.height = 0; } }
  globalThis.ImageBitmap = Bitmap;
  const slow = (side) => {
    const texture = new THREE.Texture(new Bitmap(side));
    letGoOnceDrawn(texture, () => { inFlight += 1; most = Math.max(most, inFlight); return new Promise((r) => setTimeout(() => { inFlight -= 1; r(new Bitmap(side)); }, 5)); });
    if (texture.onUpdate) texture.onUpdate(texture);       // (the card has it, and the page's copy is let go)
    return texture;
  };
  const textures = [slow(512), slow(1024), slow(256), slow(2048)];
  const handed = [];
  setUploader((texture) => { handed.push(inFlight); if (texture.onUpdate) texture.onUpdate(texture); });
  try {
    const r = await restorePictures();
    assert.ok(r.made >= 4, `made again: ${JSON.stringify(r)}`);
    assert.equal(most, 1, 'never two being made at once');
    assert.ok(handed.length >= 4 && handed.every((n) => n === 0), 'each handed over once made, before the next was begun');
    for (const t of textures) assert.ok(t.image.closed, 'and its page copy let go');
  } finally { setUploader(null); for (const t of textures) t.dispose(); globalThis.ImageBitmap = hadBitmap; }
});
