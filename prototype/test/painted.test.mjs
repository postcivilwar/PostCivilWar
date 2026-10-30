// The pictures the game paints for itself on a canvas, let go on a phone once the graphics card has them and painted
// again when wanted (src/client/painted.js, 30 October 2026). Without a browser: a canvas stand-in that counts its
// paintings, and a texture as three.js holds one (its picture in `source.data`, `onUpdate` called once handed over).
//   node --test test/painted.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { letPaintedGo, paintedState, paintedStats } from '../src/client/painted.js';

function fakeCanvas(width, height) {
  const c = { width, height, painted: 0, getContext: () => ({}) };
  return c;
}
function fakeTexture(canvas) { return { source: { data: canvas }, get image() { return this.source.data; }, set image(v) { this.source.data = v; }, onUpdate: null }; }

test('a painted picture: kept whole until the card has it, then its pixels let go; painted again, whole, the moment it is read', () => {
  const canvas = fakeCanvas(512, 256);
  const texture = fakeTexture(canvas);
  let paints = 0;
  const repaint = (c) => { paints += 1; assert.equal(c, canvas); assert.equal(c.width, 512, 'given its size back before it is painted'); assert.equal(c.height, 256); };
  letPaintedGo(texture, repaint, { always: true });
  assert.deepEqual(paintedState(texture), { asleep: false, width: 512, height: 256 });
  // (not yet handed over: read as it is, nothing painted again)
  assert.equal(texture.image, canvas); assert.equal(canvas.width, 512); assert.equal(paints, 0);
  // handed over: three.js calls onUpdate; the canvas's pixels go
  texture.onUpdate(texture);
  assert.equal(canvas.width, 1); assert.equal(canvas.height, 1);
  assert.equal(canvas.__letGo, true);
  assert.equal(paintedState(texture).asleep, true);
  // the keeper looks at it without reading it: still asleep, nothing painted
  assert.deepEqual(paintedState(texture), { asleep: true, width: 512, height: 256 });
  assert.equal(paints, 0);
  // read (three.js handing it over again, say): painted again first, whole
  const read = texture.image;
  assert.equal(read, canvas); assert.equal(canvas.width, 512); assert.equal(canvas.height, 256);
  assert.equal(canvas.__letGo, false);
  assert.equal(paints, 1);
  // read again before it is handed over: not painted twice
  void texture.image; assert.equal(paints, 1);
  // handed over again, let go again; and again on the next read
  texture.onUpdate(texture); assert.equal(canvas.width, 1);
  void texture.source.data; assert.equal(paints, 2); assert.equal(canvas.width, 512);
  assert.ok(paintedStats().letGo >= 2 && paintedStats().repainted >= 2);
});

test('whatever else was told when the card had it is still told; a texture given another picture is no longer one of these', () => {
  const canvas = fakeCanvas(64, 64);
  const texture = fakeTexture(canvas);
  let told = 0;
  texture.onUpdate = () => { told += 1; };
  letPaintedGo(texture, () => {}, { always: true });
  texture.onUpdate(texture);
  assert.equal(told, 1);
  assert.equal(canvas.width, 1);
  const other = fakeCanvas(32, 32);
  texture.image = other;
  assert.equal(texture.image, other);
  assert.equal(paintedState(texture), null);
  // (the new picture is not let go when handed over)
  texture.onUpdate(texture);
  assert.equal(other.width, 32);
});

test('painted again for something other than three.js handing it over: let go again a moment later if the card still has it as it is; not if it is to be handed over again', async () => {
  const a = fakeCanvas(256, 64), b = fakeCanvas(256, 64);
  const ta = fakeTexture(a), tb = fakeTexture(b);
  ta.version = 3; tb.version = 3;
  letPaintedGo(ta, () => {}, { always: true }); letPaintedGo(tb, () => {}, { always: true });
  ta.onUpdate(ta); tb.onUpdate(tb);
  assert.equal(a.width, 1); assert.equal(b.width, 1);
  void ta.image; void tb.image;              // read by, say, the warm-up: painted again, whole
  assert.equal(a.width, 256); assert.equal(b.width, 256);
  tb.version = 4;                            // b marked to be handed over again (its maker painted it)
  await new Promise((r) => setTimeout(r, 2200));
  assert.equal(a.width, 1, 'a: the card has it as it is: let go again');
  assert.equal(b.width, 256, 'b: kept whole until three.js hands it over');
  tb.onUpdate(tb);
  assert.equal(b.width, 1);
});

test('only on a phone (here, outside a browser, the device is a computer): elsewhere nothing changes', () => {
  const canvas = fakeCanvas(128, 128);
  const texture = fakeTexture(canvas);
  assert.equal(letPaintedGo(texture, () => {}), texture);
  assert.equal(paintedState(texture), null);
  assert.equal(texture.onUpdate, null);
  assert.equal(Object.getOwnPropertyDescriptor(texture.source, 'data').value, canvas);
});

test('a picture that is not a canvas, or with nothing to paint it again, is left alone', () => {
  const texture = fakeTexture({ width: 10, height: 10, close() {} });
  letPaintedGo(texture, () => {}, { always: true });
  assert.equal(paintedState(texture), null);
  const texture2 = fakeTexture(fakeCanvas(8, 8));
  letPaintedGo(texture2, null, { always: true });
  assert.equal(paintedState(texture2), null);
});
