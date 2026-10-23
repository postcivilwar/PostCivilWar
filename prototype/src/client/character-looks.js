// The printed cloths, painted here once each, and the sets of figures the
// character lab shows.

import { PROTOTYPES, VARIATIONS, characterSpec } from '../sim/characters.js';

// ------------------------------------------------------------------ prints --

const textures = new Map();
const css = (hex) => `#${hex.toString(16).padStart(6, '0')}`;

function paintPrint(kind, motif, colours, size) {
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const g = canvas.getContext('2d');
  const [c0, c1 = c0, c2 = c1] = colours.map(css);
  g.fillStyle = c0; g.fillRect(0, 0, size, size);
  const each = (cells, draw, stagger = true) => { const cell = size / cells; for (let i = -1; i <= cells; i += 1) for (let j = -1; j <= cells; j += 1) { g.save(); g.translate(i * cell + (stagger && j % 2 ? cell / 2 : 0), j * cell); draw(cell, i, j); g.restore(); } };
  if (kind === 'ankara') {
    if (motif === 'leaves') each(4, (c) => { g.fillStyle = c1; for (const turn of [0, 1, 2, 3]) { g.save(); g.rotate(turn * Math.PI / 2 + 0.5); g.beginPath(); g.ellipse(c * 0.2, 0, c * 0.2, c * 0.08, 0, 0, 7); g.fill(); g.restore(); } g.fillStyle = c2; g.beginPath(); g.arc(0, 0, c * 0.07, 0, 7); g.fill(); });
    else if (motif === 'diamonds') each(4, (c) => { g.fillStyle = c1; g.rotate(Math.PI / 4); g.fillRect(-c * 0.22, -c * 0.22, c * 0.44, c * 0.44); g.fillStyle = c2; g.fillRect(-c * 0.08, -c * 0.08, c * 0.16, c * 0.16); });
    else if (motif === 'fans') each(3, (c) => { for (let k = 4; k >= 1; k -= 1) { g.fillStyle = k % 2 ? c1 : c2; g.beginPath(); g.moveTo(0, c * 0.3); g.arc(0, c * 0.3, c * 0.13 * k, Math.PI * 1.15, Math.PI * 1.85); g.closePath(); g.fill(); } });
    else each(4, (c) => { g.strokeStyle = c1; g.lineWidth = c * 0.14; g.beginPath(); g.arc(0, 0, c * 0.3, 0, 7); g.stroke(); g.fillStyle = c2; g.beginPath(); g.arc(0, 0, c * 0.12, 0, 7); g.fill(); });
  } else if (kind === 'isiagu') {
    // a lion's head, worked in gold on the ground colour
    each(3, (c) => {
      g.fillStyle = c1;
      for (let k = 0; k < 12; k += 1) { g.save(); g.rotate((k / 12) * Math.PI * 2); g.beginPath(); g.ellipse(0, -c * 0.25, c * 0.055, c * 0.1, 0, 0, 7); g.fill(); g.restore(); }
      g.beginPath(); g.arc(0, 0, c * 0.2, 0, 7); g.fill();
      g.fillStyle = c2; g.beginPath(); g.arc(-c * 0.07, -c * 0.04, c * 0.028, 0, 7); g.arc(c * 0.07, -c * 0.04, c * 0.028, 0, 7); g.fill();
      g.beginPath(); g.moveTo(-c * 0.04, c * 0.05); g.lineTo(c * 0.04, c * 0.05); g.lineTo(0, c * 0.11); g.closePath(); g.fill();
    });
  } else if (kind === 'asooke') {
    // narrow woven strips: bands of the ground with fine lines of the other threads
    const bands = [0.0, 0.18, 0.24, 0.5, 0.56, 0.62, 0.82, 0.9];
    bands.forEach((x, k) => { g.fillStyle = [c0, c1, c0, c0, c2, c0, c1, c0][k]; g.fillRect(x * size, 0, ((bands[k + 1] || 1) - x) * size + 1, size); });
    g.globalAlpha = 0.16; g.fillStyle = '#000';
    for (let y = 0; y < size; y += 4) g.fillRect(0, y, size, 1);
    g.globalAlpha = 1;
  } else if (kind === 'adire') {
    each(2, (c) => { g.strokeStyle = c1; g.lineWidth = size / 90; g.strokeRect(-c * 0.42, -c * 0.42, c * 0.84, c * 0.84); g.fillStyle = c1; for (let k = 0; k < 10; k += 1) { const a = (k / 10) * Math.PI * 2; g.beginPath(); g.arc(Math.cos(a) * c * 0.25, Math.sin(a) * c * 0.25, c * 0.03, 0, 7); g.fill(); } g.beginPath(); g.arc(0, 0, c * 0.07, 0, 7); g.fill(); }, false);
  } else if (kind === 'george') {
    each(3, (c) => { g.strokeStyle = c1; g.lineWidth = c * 0.035; g.beginPath(); g.moveTo(-c * 0.5, 0); g.quadraticCurveTo(-c * 0.25, -c * 0.22, 0, 0); g.quadraticCurveTo(c * 0.25, c * 0.22, c * 0.5, 0); g.stroke(); g.fillStyle = c2; for (const [x, y] of [[0, -c * 0.25], [0, c * 0.25]]) { for (let k = 0; k < 5; k += 1) { const a = (k / 5) * Math.PI * 2; g.beginPath(); g.arc(x + Math.cos(a) * c * 0.07, y + Math.sin(a) * c * 0.07, c * 0.04, 0, 7); g.fill(); } } });
  } else if (kind === 'lace') {
    each(6, (c) => { g.fillStyle = c1; g.beginPath(); g.arc(0, 0, c * 0.2, 0, 7); g.fill(); g.fillStyle = c0; g.beginPath(); g.arc(0, 0, c * 0.09, 0, 7); g.fill(); });
  } else if (kind === 'knit') {
    const rows = [c0, c1, c2, c1];
    for (let k = 0; k < 8; k += 1) { g.fillStyle = rows[k % rows.length]; g.fillRect(0, (k / 8) * size, size, size / 8 + 1); }
  } else if (kind === 'hula') {
    g.strokeStyle = c1; g.lineWidth = size / 28;
    for (let row = 0; row < 3; row += 1) { g.beginPath(); for (let k = 0; k <= 8; k += 1) { const x = (k / 8) * size, y = (row + 0.5) * size / 3 + (k % 2 ? -1 : 1) * size / 14; if (k) g.lineTo(x, y); else g.moveTo(x, y); } g.stroke(); }
    g.fillStyle = c2; each(6, (c) => { g.beginPath(); g.arc(0, 0, c * 0.1, 0, 7); g.fill(); }, false);
  } else if (kind === 'braid') {
    // needlework: interlaced loops in a darker thread
    g.strokeStyle = c1; g.lineWidth = size / 40;
    each(4, (c) => { g.beginPath(); g.arc(0, 0, c * 0.36, 0, 7); g.stroke(); g.beginPath(); g.moveTo(-c * 0.5, 0); g.lineTo(c * 0.5, 0); g.stroke(); });
  } else if (kind === 'check') {
    const n = 8; for (let i = 0; i < n; i += 1) for (let j = 0; j < n; j += 1) { g.fillStyle = (i + j) % 2 ? c1 : (i % 2 ? c0 : c2); g.fillRect((i / n) * size, (j / n) * size, size / n + 1, size / n + 1); }
  }
  return canvas;
}

// The texture for a print key (see printKey in ../sim/characters.js).
export function printTexture(key) {
  let t = textures.get(key);
  if (t) return t;
  const [kind, motif, list] = key.split('|');
  const colours = list.split(',').map((c) => parseInt(c, 16));
  t = new THREE.CanvasTexture(paintPrint(kind, motif, colours, 128));
  t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  textures.set(key, t);
  return t;
}

// ----------------------------------------------------------------- the lab --

// Sets of figures for the character lab.
export function labSets() {
  const row = (list) => (lod) => list.map((e) => ({ name: e.name, note: e.note || '', spec: characterSpec(e.config, lod) }));
  const sets = { prototypes: row(PROTOTYPES) };
  for (const [name, list] of Object.entries(VARIATIONS)) sets[name] = row(list);
  sets.detail = () => [0, 1, 2].flatMap((lod) => [PROTOTYPES[0], PROTOTYPES[3]].map((e) => ({ name: e.name, note: ['full', 'near', 'middle'][lod], spec: characterSpec(e.config, lod) })));
  sets.bare = (lod) => [{ name: 'Head and hands', note: 'the base model without its clothes', spec: { ...characterSpec({ gender: 'm', outfit: 'tee', hair: 'none' }, lod), parts: [{ id: 'base.head' }, { id: 'base.hands' }] } }];
  return sets;
}
