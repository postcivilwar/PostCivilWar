// The app's icons, drawn from the mark (src/client/mark.svg.txt) and nothing else: the rising sun, white with
// the sun's yellow, on black. These are what a phone shows on its home screen, what a browser shows in its
// tab, and the picture that goes with a link when it is shared.
//
//   node tools/brand/make_icons.mjs      # writes assets/brand/icons/
//
// Needs Playwright with Chromium to turn the drawing into PNG files. It is run by hand when the mark
// changes; the files it writes are kept in the repository, so building the game needs nothing.

import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch (error) { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const out = resolve(root, 'assets/brand/icons');
mkdirSync(out, { recursive: true });

const BLACK = '#000000', WHITE = '#ffffff', SUN = '#e9c46a';
const mark = readFileSync(resolve(root, 'src/client/mark.svg.txt'), 'utf8').trim();
// The mark is drawn in a box 240 by 132; what is inked lies between x 26 and 214 and between y 29 and 126.
const INK = { x: 26, y: 29, w: 188, h: 97 };

// The mark, `share` of the square's width across, in the middle of a square of side `size`.
function markIn(size, share, cx = size / 2, cy = size / 2) {
  const s = (size * share) / INK.w;
  return `<g transform="translate(${cx - (INK.x + INK.w / 2) * s} ${cy - (INK.y + INK.h / 2) * s}) scale(${s})">${mark}</g>`;
}
const defs = `<defs><clipPath id="pcw-sky"><rect x="0" y="0" width="240" height="100"></rect></clipPath><style>.disc{fill:${SUN}}.ray,.ground{fill:${WHITE}}</style></defs>`;

// `round`: the corners are cut, for a browser tab and a desktop. Left square for a phone, which cuts its own.
function icon(size, { share, round }) {
  const r = round ? size * 0.22 : 0;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${defs}<rect width="${size}" height="${size}" rx="${r}" fill="${BLACK}"></rect>${markIn(size, share)}</svg>`;
}

// The picture that goes with a shared link: the mark, the name in the game's own face, the address.
function card() {
  const font = readFileSync(resolve(root, 'assets/brand/pcw-arcade.ttf')).toString('base64');
  const W = 1200, H = 630;
  const s = 330 / INK.w;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${defs}
<style>@font-face{font-family:"PCW Arcade";src:url(data:font/ttf;base64,${font}) format("truetype")}</style>
<rect width="${W}" height="${H}" fill="${BLACK}"></rect>
<g transform="translate(${W / 2 - (INK.x + INK.w / 2) * s} ${228 - (INK.y + INK.h / 2) * s}) scale(${s})">${mark}</g>
<text x="${W / 2}" y="440" text-anchor="middle" font-family="PCW Arcade" font-size="76" letter-spacing="2" fill="${WHITE}">POST CIVIL WAR</text>
<text x="${W / 2}" y="512" text-anchor="middle" font-family="-apple-system, 'Segoe UI', Roboto, Arial, sans-serif" font-size="24" font-weight="500" letter-spacing="9" fill="#77777c">POSTCIVILWAR.COM</text>
</svg>`;
}

// A phone that cuts icons to its own shape keeps only the middle: the mark must lie inside a circle four
// fifths of the icon across. At 0.56 of the width its furthest corner is 0.32 from the middle.
const FILES = [
  ['icon-192.png', 192, 192, icon(192, { share: 0.64, round: true }), true],
  ['icon-512.png', 512, 512, icon(512, { share: 0.64, round: true }), true],
  ['icon-maskable-192.png', 192, 192, icon(192, { share: 0.56, round: false }), false],
  ['icon-maskable-512.png', 512, 512, icon(512, { share: 0.56, round: false }), false],
  ['apple-touch-icon.png', 180, 180, icon(180, { share: 0.62, round: false }), false],
  ['favicon-48.png', 48, 48, icon(48, { share: 0.7, round: true }), true],
  ['share.png', 1200, 630, card(), false],
];

writeFileSync(resolve(out, 'favicon.svg'), icon(64, { share: 0.7, round: true }) + '\n');

const browser = await chromium.launch();
for (const [name, width, height, svg, clear] of FILES) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.setContent(`<!doctype html><style>html,body{margin:0;background:transparent}svg{display:block}</style>${svg}`);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: resolve(out, name), omitBackground: clear, clip: { x: 0, y: 0, width, height } });
  await context.close();
  console.log(`${name}: ${width} by ${height}`);
}
await browser.close();
