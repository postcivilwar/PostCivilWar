// The game's own adverts on Oganiru City's billboards along the expressway (the owner's brief of 31 October 2026,
// Stage 2: "billboards with the game's own adverts"; where they stand: zones/oganiru.js OGANIRU_BILLBOARDS). Each a
// poster of one of the game's own places, drawn here (no picture is fetched), with the owner's canonical logo (the
// rising sun over level ground, and POST CIVIL WAR: assets/brand/cover/logo.png, carried in the page as COVER.logo) on
// those of Post Civil War itself. Made-up names only, as everywhere in the game.
//
//   const blob = await cityAdvertArt('powerbike', 1024)      a picture for render-billboards.js to put on a face
import { COVER } from './brand-data.js';

// what each says: its colours, its name in heavy letters, a line under it, and whether the logo is on it
export const CITY_ADVERTS = Object.freeze({
  game: { ground: ['#0f2d4a', '#1d5a86'], ink: '#fff6dc', accent: '#f2b632', name: 'POST CIVIL WAR', line: 'Find work. Buy a plot. Build the walls. Start again.', logo: true },
  powerbike: { ground: ['#14171c', '#2a2f38'], ink: '#ffffff', accent: '#e4572e', name: 'POWERBIKE', line: 'Motorcycles of every kind · Market Road, Atani', logo: true },
  carshow: { ground: ['#f4f1ea', '#d9d4c7'], ink: '#14202b', accent: '#0b6b3a', name: 'CAR SHOWROOM', line: 'Twenty models to choose from · Atani', logo: true },
  sports: { ground: ['#0b6b3a', '#13894d'], ink: '#ffffff', accent: '#f2c200', name: 'SPORTS MALL', line: 'Bicycles · skateboards · skates', logo: true },
  'unity-tower': { ground: ['#0e3b5c', '#2b6f9e'], ink: '#ffffff', accent: '#9fd3f2', name: 'UNITY TOWER', line: 'Offices to let · Unity Avenue, Oganiru City', logo: false },
  'udo-bank': { ground: ['#5b1a1a', '#8c2a2a'], ink: '#fff2df', accent: '#f2c27a', name: 'UDO BANK', line: 'Harmony Place · open six days a week', logo: false },
  airport: { ground: ['#e9eef2', '#c9d6e0'], ink: '#123047', accent: '#d9382c', name: 'ASABA AIRPORT', line: 'Fly from Asaba · Terminal Drive', logo: false },
});

let logo = null;
function logoImage() {
  if (!logo) logo = new Promise((resolve) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => resolve(null); img.src = COVER.logo.src; });
  return logo;
}
const HEAVY = (px) => `900 ${px}px "Arial Black", "Helvetica Neue", Helvetica, Arial, sans-serif`;
const PLAIN = (px) => `600 ${px}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
// writes `text` no wider than `most`, its size brought down until it fits
function fit(g, text, x, y, px, most, font, fill) {
  let size = px;
  g.font = font(size);
  while (g.measureText(text).width > most && size > 10) { size -= 2; g.font = font(size); }
  g.fillStyle = fill;
  g.fillText(text, x, y);
  return size;
}

// The poster for `advert`, `width` pixels across, as wide to high as the face (`aspect`, width / height): a Blob.
export async function cityAdvertArt(advert, width = 1024, aspect = 3) {
  const a = CITY_ADVERTS[advert] || CITY_ADVERTS.game;
  const W = width, H = Math.round(width / aspect);
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const g = canvas.getContext('2d');
  const grad = g.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, a.ground[0]); grad.addColorStop(1, a.ground[1]);
  g.fillStyle = grad; g.fillRect(0, 0, W, H);
  // a band of its colour along the foot, and a thin one along the top
  g.fillStyle = a.accent; g.fillRect(0, H * 0.86, W, H * 0.14); g.fillRect(0, 0, W, H * 0.035);
  let left = W * 0.05;
  if (a.logo) {
    const img = await logoImage();
    if (img) {
      const h = H * 0.74, w = (h * img.width) / img.height;
      g.drawImage(img, W * 0.035, H * 0.07, w, h);
      left = W * 0.06 + w;
    }
  }
  g.textBaseline = 'alphabetic';
  fit(g, a.name, left, H * 0.5, Math.round(H * 0.34), W - left - W * 0.04, HEAVY, a.ink);
  fit(g, a.line, left, H * 0.72, Math.round(H * 0.11), W - left - W * 0.04, PLAIN, a.ink);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('no picture'))), 'image/png'));
}
