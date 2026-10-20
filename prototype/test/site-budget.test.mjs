// What the website sends, against the budget the owner set (20 October 2026, the owner's brief: "a size budget over
// site/ (every figure copy under 3 MB, no picture over 1024/2048, no 8K anywhere)"). Read from site/, the website as
// it was last built (node build.mjs --site).
//
//  - each figure as a phone fetches it (its model and its pictures at 1024) at most 3 MB, and as a computer fetches it
//    (its pictures at 2048) at most 6 MB; its model (its shape, skeleton and every one of its movements) under 2 MB;
//  - no picture of a figure larger than 1024 for a phone, or 2048 for a computer;
//  - no picture of 8192 anywhere: none larger than 4096 in any file the website sends, and none larger than a phone
//    draws it in the copies a phone fetches of the owner's buildings, the town's vehicles and the watch;
//  - the page itself small, and the opening (its markup, its style, the mark) at its very start.
//
//   node --test test/site-budget.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';

const served = new URL('../../site/', import.meta.url);
const there = existsSync(new URL('index.html', served));
const MB = 1048576;
const page = there ? readFileSync(new URL('index.html', served), 'utf8') : '';
const fileOf = (url) => readFileSync(new URL(url.split('?')[0], served));

// a picture's size across, from its first bytes (JPEG, PNG or WebP)
function pictureSize(b) {
  if (b[0] === 0x89 && b.toString('latin1', 1, 4) === 'PNG') return [b.readUInt32BE(16), b.readUInt32BE(20)];
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i < b.length - 9) {
      if (b[i] !== 0xff) { i += 1; continue; }
      const m = b[i + 1];
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(m)) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
      i += 2 + b.readUInt16BE(i + 2);
    }
    return null;
  }
  if (b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') {
    const kind = b.toString('latin1', 12, 16);
    if (kind === 'VP8 ') return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
    if (kind === 'VP8L') { const v = b.readUInt32LE(21); return [(v & 0x3fff) + 1, ((v >>> 14) & 0x3fff) + 1]; }
    if (kind === 'VP8X') return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
  }
  return null;
}
// every picture inside a GLB file (gzipped or not): [its size across, its bytes]
function glbPictures(bytes) {
  const glb = bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes) : bytes;
  if (glb.toString('latin1', 0, 4) !== 'glTF') return [];
  const length = glb.readUInt32LE(12);
  const json = JSON.parse(glb.subarray(20, 20 + length).toString('utf8'));
  const bin = 20 + length + 8;
  return (json.images || []).filter((im) => im.bufferView !== undefined).map((im) => {
    const view = json.bufferViews[im.bufferView];
    return pictureSize(glb.subarray(bin + (view.byteOffset || 0), bin + (view.byteOffset || 0) + Math.min(view.byteLength, 1 << 18)));
  });
}
const all = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? all(new URL(`${e.name}/`, dir)) : [new URL(e.name, dir)]));

test('each figure: at most 3 MB to a phone, at most 6 MB to a computer, its model under 2 MB', { skip: !there }, () => {
  const figures = JSON.parse(page.match(/window\.__PCW_FIGURES = (\{[^\n]*?\});/)[1]).figures;
  assert.equal(Object.keys(figures).length, 30);
  const rows = [];
  for (const [id, f] of Object.entries(figures)) {
    const shape = fileOf(f.model).length, model = shape + fileOf(f.moves[0]).length;
    const at = (most) => f.pictures.map((p) => { const sizes = Object.keys(p.sizes).map(Number).sort((a, b) => a - b); return p.sizes[sizes.filter((n) => n <= most).pop() || sizes[0]][0]; });
    const phone = model + at(1024).reduce((n, url) => n + fileOf(url).length, 0);
    const computer = model + at(2048).reduce((n, url) => n + fileOf(url).length, 0);
    rows.push([id, +(phone / MB).toFixed(2), +(computer / MB).toFixed(2)]);
    assert.ok(shape <= 2 * MB, `${id}: its model is ${(shape / MB).toFixed(2)} MB`);
    assert.ok(phone <= 3 * MB, `${id}: ${(phone / MB).toFixed(2)} MB to a phone`);
    assert.ok(computer <= 6 * MB, `${id}: ${(computer / MB).toFixed(2)} MB to a computer`);
    // and the pictures are no larger than the device draws them
    for (const url of at(1024)) assert.ok(Math.max(...pictureSize(fileOf(url))) <= 1024, `${url} is larger than a phone draws it`);
    for (const url of at(2048)) assert.ok(Math.max(...pictureSize(fileOf(url))) <= 2048, `${url} is larger than a computer draws it`);
  }
  console.log(`  per figure, MB to a phone and to a computer: ${rows.map((r) => `${r[0]} ${r[1]}/${r[2]}`).join(', ')}`);
});

test('no picture of 8192 anywhere: none larger than 4096 in any file the website sends', { skip: !there }, () => {
  let pictures = 0;
  const larger = [];
  for (const file of all(served)) {
    const name = file.pathname.slice(served.pathname.length);
    let sizes = [];
    if (/\.(png|jpe?g|webp)$/i.test(name)) sizes = [pictureSize(readFileSync(file).subarray(0, 1 << 18))];
    else if (/\.glb(\.gz)?$/i.test(name)) sizes = glbPictures(readFileSync(file));
    for (const size of sizes) {
      assert.ok(size, `${name}: a picture whose size cannot be read`);
      pictures += 1;
      if (Math.max(...size) > 4096) larger.push([name, size]);
      // the figures are drawn at 2048 at most
      if (name.startsWith('figures/')) assert.ok(Math.max(...size) <= 2048, `${name} is ${size.join('x')}`);
    }
  }
  assert.deepEqual(larger, []);
  assert.ok(pictures > 500, `${pictures} pictures looked at`);
});

test('the owner\'s buildings, the town\'s vehicles and the watch: no picture larger than the device draws it', { skip: !there }, () => {
  const models = JSON.parse(page.match(/window\.__PCW_MODELS = (\{[^\n]*?\});/)[1]);
  for (const [name, lite] of Object.entries(models)) {
    // (the watch is looked at close to, on its own: 4096 on a computer and 2048 on a phone, budget.js: inspect)
    const [computer, phone] = name === 'assets/watch.glb' ? [4096, 2048] : [2048, 1024];
    for (const size of glbPictures(readFileSync(new URL(name, served)))) assert.ok(Math.max(...size) <= computer, `${name}: ${size.join('x')}`);
    for (const size of glbPictures(readFileSync(new URL(lite, served)))) assert.ok(Math.max(...size) <= phone, `${lite}: ${size.join('x')}`);
  }
});

test('the page is small, and the opening is at its very start', { skip: !there }, () => {
  assert.ok(page.length <= 300 * 1024, `the page is ${(page.length / 1024).toFixed(0)} KB`);
  // the opening's markup, its style and the mark, then the rest of the page's style (template.html)
  const opening = page.indexOf('<div id="intro"'), rest = page.indexOf('the rest of the page\'s style');
  assert.ok(opening > 0 && rest > opening, 'the opening is in the page, before the rest of its style');
  assert.ok(rest <= 40 * 1024, `the opening ends ${(rest / 1024).toFixed(1)} KB into the page`);
  const sent = gzipSync(Buffer.from(page.slice(0, rest)), { level: 9 }).length;
  assert.ok(sent <= 16 * 1024, `the opening is ${(sent / 1024).toFixed(1)} KB as it is sent`);
  // and no script is read before it: the 3D library and the game's own come after the page, read once it has been
  const firstScript = page.search(/<script[^>]*\ssrc=/);
  assert.ok(firstScript > rest && /<script defer src=/.test(page.slice(firstScript, firstScript + 20)), 'a script is fetched before the opening');
});

test('what the website holds, in all', { skip: !there }, () => {
  const sizes = all(served).map((file) => readFileSync(file).length);
  const total = sizes.reduce((n, b) => n + b, 0);
  console.log(`  site/: ${sizes.length} files, ${(total / MB).toFixed(1)} MB`);
  // (1.38 GB until 20 October 2026; the figures as supplied were most of it)
  assert.ok(total <= 800 * MB, `site/ is ${(total / MB).toFixed(0)} MB`);
});
