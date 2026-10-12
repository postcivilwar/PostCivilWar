// The radar: a round map in the top left corner, the player at its middle, turning with the camera so that
// what is ahead on the screen is up on the radar. It shows the roads, the buildings and the river; where the
// player is going (a marked place, a job, a delivery) as a coloured mark and a thick line along the roads;
// the player's own keke; the police while they are after the player; and N where north is. Anything marked
// that is off the edge sits on the rim, pointing the way.
//
// The town itself is drawn once into a picture and only turned and moved each frame; the marks are drawn
// over it. Nothing here decides anything: it draws what the view says.

import { ZONE, ZONE_ROADS, ZONE_BUILDINGS, ZONE_PARCELS, ZONE_JETTY, ZONE_COMPOUNDS, ZONE_HOUSES, ZONE_SHEDS, ZONE_FARMLAND, zoneShoreZ, OUTSKIRT_ROADS, AIRPORT } from '../sim/zone.js';
import { trueToGrid } from '../sim/geo.js';

const PX = 2;                       // pixels of the town picture to a metre
export const RADAR_COLOURS = Object.freeze({
  land: '#45573a', farm: '#55663d', water: '#2c5b80', bank: '#3a4f33', asphalt: '#c8c8c2', laterite: '#b39069',
  building: '#7b7670', house: '#8b7e70', compound: 'rgba(255,255,255,0.06)', mine: '#ffffff', sale: 'rgba(255,255,255,0.35)',
  route: '#f2c230', target: '#f2c230', police: ['#ff3b30', '#2f7bff'], keke: '#ffffff', ambulance: '#ff3b30',
});

// The town, drawn once (and again when who owns which plot changes).
function drawTownPicture(owned) {
  const b = ZONE.bounds;
  const w = Math.ceil((b.maxX - b.minX) * PX), h = Math.ceil((b.maxZ - b.minZ) * PX);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  const X = (x) => (x - b.minX) * PX, Z = (z) => (z - b.minZ) * PX;
  const rect = (x0, z0, x1, z1) => g.fillRect(X(Math.min(x0, x1)), Z(Math.min(z0, z1)), Math.abs(x1 - x0) * PX, Math.abs(z1 - z0) * PX);
  g.fillStyle = RADAR_COLOURS.land; g.fillRect(0, 0, w, h);
  g.fillStyle = RADAR_COLOURS.farm; rect(ZONE_FARMLAND.x0, ZONE_FARMLAND.z0, ZONE_FARMLAND.x1, ZONE_FARMLAND.z1);
  // the river, beyond the bank
  g.fillStyle = RADAR_COLOURS.water; g.beginPath(); g.moveTo(X(b.minX), Z(b.maxZ));
  for (let x = b.minX; x <= b.maxX; x += 4) g.lineTo(X(x), Z(zoneShoreZ(x)));
  g.lineTo(X(b.maxX), Z(b.maxZ)); g.closePath(); g.fill();
  g.fillStyle = RADAR_COLOURS.laterite; rect(ZONE_JETTY.x0, ZONE_JETTY.z0, ZONE_JETTY.x1, ZONE_JETTY.z1);
  for (const r of ZONE_ROADS) { g.fillStyle = r.surface === 'asphalt' ? RADAR_COLOURS.asphalt : RADAR_COLOURS.laterite; rect(r.x0, r.z0, r.x1, r.z1); }
  ZONE_PARCELS.forEach((p, i) => {
    if (owned.has(i)) { g.fillStyle = RADAR_COLOURS.mine; rect(p.x0, p.z0, p.x1, p.z1); return; }
  });
  for (const k of ZONE_COMPOUNDS) { g.fillStyle = RADAR_COLOURS.compound; rect(k.x0, k.z0, k.x1, k.z1); }
  g.fillStyle = RADAR_COLOURS.house;
  for (const hs of ZONE_HOUSES) rect(hs.x - hs.w / 2, hs.z - hs.d / 2, hs.x + hs.w / 2, hs.z + hs.d / 2);
  for (const sh of ZONE_SHEDS) rect(sh.x - 2.5, sh.z - 2.5, sh.x + 2.5, sh.z + 2.5);
  g.fillStyle = RADAR_COLOURS.building;
  for (const bd of ZONE_BUILDINGS) rect(bd.x - bd.w / 2, bd.z - bd.d / 2, bd.x + bd.w / 2, bd.z + bd.d / 2);
  for (const k of ZONE_COMPOUNDS) for (const bd of k.buildings) rect(bd.x0, bd.z0, bd.x1, bd.z1);
  return c;
}

// Where a point in the town is on the radar: `f` is the way the camera looks (up on the radar), `r` its right.
export function radarPoint(dx, dz, yaw, k) {
  const fx = Math.sin(yaw), fz = Math.cos(yaw), rx = -Math.cos(yaw), rz = Math.sin(yaw);
  return [(dx * rx + dz * rz) * k, -(dx * fx + dz * fz) * k];
}

export function createRadar(canvas) {
  const g = canvas.getContext('2d');
  let picture = null, ownedKey = '';
  const north = (() => { const n = trueToGrid(0, -1, ZONE.gridBearing); const l = Math.hypot(n.x, n.z) || 1; return { x: n.x / l, z: n.z / l }; })();
  let range = 70;                  // metres from the middle to the rim; further out in a vehicle

  // `s`: { x, z, heading, yaw, vehicle, target: {x,z}|null, route: [[x,z]...]|null, keke: {x,z}|null,
  //        police: [{x,z}], ambulance: {x,z}|null, parcels: view.parcels, t }
  function draw(s) {
    const key = s.parcels ? s.parcels.map((p, i) => (p.yours ? i : '')).join(',') : '';
    if (!picture || key !== ownedKey) { ownedKey = key; picture = drawTownPicture(new Set(s.parcels ? s.parcels.map((p, i) => (p.yours ? i : -1)).filter((i) => i >= 0) : [])); }
    const W = canvas.width, R = W / 2;
    range += ((s.vehicle ? 120 : 70) - range) * 0.06;
    const k = R / range;
    const b = ZONE.bounds;
    g.save();
    g.clearRect(0, 0, W, W);
    g.fillStyle = RADAR_COLOURS.bank; g.fillRect(0, 0, W, W);
    g.beginPath(); g.arc(R, R, R, 0, Math.PI * 2); g.clip();
    // the town, turned so that the camera's way is up
    const fx = Math.sin(s.yaw), fz = Math.cos(s.yaw), rx = -Math.cos(s.yaw), rz = Math.sin(s.yaw);
    g.setTransform(rx * k, -fx * k, rz * k, -fz * k, R, R);
    g.imageSmoothingEnabled = true;
    g.drawImage(picture, b.minX - s.x, b.minZ - s.z, picture.width / PX, picture.height / PX);
    // beyond the town: the airport's runway, taxiway, apron and terminal, the roads out and the bridge (a few
    // shapes, drawn as they are, rather than a second picture of a kilometre and a half of bush)
    const near = (r) => r.x1 > s.x - range * 1.5 && r.x0 < s.x + range * 1.5 && r.z1 > s.z - range * 1.5 && r.z0 < s.z + range * 1.5;
    const shape = (r) => g.fillRect(r.x0 - s.x, r.z0 - s.z, r.x1 - r.x0, r.z1 - r.z0);
    g.fillStyle = RADAR_COLOURS.asphalt;
    for (const r of [AIRPORT.runway, AIRPORT.taxiway, ...AIRPORT.links, AIRPORT.apron, ...OUTSKIRT_ROADS]) if (near(r)) shape(r);
    g.fillStyle = RADAR_COLOURS.building;
    if (near(AIRPORT.terminal)) shape(AIRPORT.terminal);
    // the way to go: thick, dark-edged, along the roads
    if (s.route && s.route.length > 1) {
      g.lineJoin = 'round'; g.lineCap = 'round';
      for (const [colour, width] of [['#000000', 9], [RADAR_COLOURS.route, 5]]) {
        g.strokeStyle = colour; g.lineWidth = width / k; g.beginPath();
        s.route.forEach(([x, z], i) => { if (i) g.lineTo(x - s.x, z - s.z); else g.moveTo(x - s.x, z - s.z); });
        g.stroke();
      }
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    // marks: on the radar where they are, or on the rim pointing the way
    const mark = (x, z, paint, rim = true) => {
      let [px, py] = radarPoint(x - s.x, z - s.z, s.yaw, k);
      const d = Math.hypot(px, py), edge = R - 12;
      if (d > edge) { if (!rim) return; px *= edge / d; py *= edge / d; }
      paint(R + px, R + py, d > edge);
    };
    if (s.keke) mark(s.keke.x, s.keke.z, (x, y) => { g.fillStyle = '#000'; g.fillRect(x - 7, y - 7, 14, 14); g.fillStyle = RADAR_COLOURS.keke; g.fillRect(x - 5, y - 5, 10, 10); }, false);
    if (s.ambulance) mark(s.ambulance.x, s.ambulance.z, (x, y) => { g.fillStyle = '#fff'; g.fillRect(x - 7, y - 7, 14, 14); g.fillStyle = RADAR_COLOURS.ambulance; g.fillRect(x - 2, y - 6, 4, 12); g.fillRect(x - 6, y - 2, 12, 4); });
    const flash = Math.floor((s.t || 0) * 3) % 2;
    for (const p of s.police || []) mark(p.x, p.z, (x, y) => { g.fillStyle = '#000'; g.beginPath(); g.arc(x, y, 7.5, 0, Math.PI * 2); g.fill(); g.fillStyle = RADAR_COLOURS.police[flash]; g.beginPath(); g.arc(x, y, 5.5, 0, Math.PI * 2); g.fill(); });
    if (s.target) mark(s.target.x, s.target.z, (x, y, onRim) => {
      g.fillStyle = '#000'; g.beginPath(); g.arc(x, y, onRim ? 9 : 11, 0, Math.PI * 2); g.fill();
      g.fillStyle = RADAR_COLOURS.target; g.beginPath(); g.arc(x, y, onRim ? 6.5 : 8, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#000'; g.beginPath(); g.arc(x, y, 2.5, 0, Math.PI * 2); g.fill();
    });
    // north, on the rim
    {
      const [nx, ny] = radarPoint(north.x, north.z, s.yaw, 1);
      const l = Math.hypot(nx, ny) || 1, x = R + (nx / l) * (R - 16), y = R + (ny / l) * (R - 16);
      g.fillStyle = '#000'; g.beginPath(); g.arc(x, y, 13, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#fff'; g.font = '700 17px "PCW Arcade", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('N', x + 0.5, y + 1);
    }
    // the player: a fixed arrow in the middle, turned by how the player faces against the camera
    g.translate(R, R); g.rotate(s.yaw - s.heading);
    g.fillStyle = '#ffffff'; g.strokeStyle = '#000000'; g.lineWidth = 3.5; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(0, -15); g.lineTo(11, 11); g.lineTo(0, 5); g.lineTo(-11, 11); g.closePath(); g.stroke(); g.fill();
    g.restore();
  }
  return { draw };
}
