// The Map app's map of the town: drawn as a map for finding the way is drawn, and moved about like one.
//
// Everything on it is the game's own town, read from the same data the town itself is built from (sim/zone.js):
// the ground and the farmland, the trees, the River Niger and its jetty, every road with its width and surface,
// every building and house where it stands, the plots, the grounds of the hospital and the schools. Nothing is
// drawn that is not in the town, and nothing comes from a map service. North is up.
//
//   land green, water blue, roads in three ranks (the tarred main roads broad and yellow, the laterite roads
//   white, the lanes narrow and pale), each with an edge so that junctions read; buildings as their footprints;
//   names put on as there is room for them, the important ones first, more as the map is brought closer.
//
//   the player is the blue dot, with a wedge for the way they face. The way to a place is the blue line: it is
//   the simulation's own route, which runs along the town's roads and paths (sim/phone.js), never a straight
//   line across country. The place itself is the red pin.
//
//   drag to move the map, pinch or turn the wheel to bring it closer, press twice to step in; the buttons do
//   the same for anyone who would rather press. The round button brings the map back to the player and keeps
//   it there as they walk.
//
// createTownMap({ h, view, way, waypoint, listings, state, onPick }) gives { el, redraw, fit, dispose }.
//   view()       the game's view (the player, the plots, what is moving)
//   way()        the route being shown, or null
//   waypoint()   the place marked in the town, or null
//   state        an object the caller keeps, so the map is where it was left when the page is drawn again

import { ZONE, ZONE_ROADS, ZONE_BUILDINGS, ZONE_PARCELS, ZONE_JETTY, ZONE_COMPOUNDS, ZONE_HOUSES, ZONE_SHEDS, ZONE_FARMLAND, ZONE_PROPS, ZONE_TREES, ZONE_STALLS, ZONE_SERVICES, ZONE_SHOPS, zoneShoreZ, OUTSKIRT_ROADS, OUTSKIRT_MAP_LABELS, OUTSKIRT_BUILDINGS, AIRPORT, BRIDGE } from '../sim/zone.js';
import { gridToTrue, trueToGrid } from '../sim/geo.js';

export const MAP_STYLE = Object.freeze({
  land: '#dbe7c9', farm: '#c6dc9c', farmLine: '#b4cd86', grounds: '#e6ead6', groundsEdge: '#bfcaa6', tree: '#a3cb86', treeEdge: '#8dba70',
  water: '#9ccaf0', waterDeep: '#86bbe8', shore: '#6aa3d6', wave: 'rgba(255,255,255,0.55)', jetty: '#cfae7c', jettyEdge: '#a98a5c',
  plot: 'rgba(120,140,96,0.16)', plotEdge: '#a9b78f', plotSale: '#d98c00', plotMine: '#ffe08a', plotMineEdge: '#c98a00',
  major: '#ffe7a0', majorEdge: '#d0a63a', minor: '#ffffff', minorEdge: '#b3b6a6', lane: '#f4eee0', laneEdge: '#c3b697', centre: 'rgba(160,130,40,0.55)',
  building: '#d9d0c4', buildingEdge: '#a69a8b', house: '#e4dacd', houseEdge: '#b9ac9b', stall: '#e9c98f',
  kinds: { government: '#cdd6ea', hospital: '#f1cfca', service: '#f1cfca', business: '#ecd9b2', showroom: '#f6c6dc', hostel: '#d7d2e8', church: '#dccdea', school: '#ecdfb8' },
  text: '#26331f', halo: 'rgba(255,255,255,0.92)', roadText: '#5a5546', waterText: '#1f5f9c',
  route: '#1a73e8', routeEdge: '#ffffff', pin: '#e53935', me: '#1a73e8', meRing: '#ffffff', mark: '#e53935', listing: '#e6399b',
});
const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const ZOOM = Object.freeze({ most: 9, step: 1.6, start: 1.9 });

// "LANDS REGISTRY" as a map writes it
const titled = (text) => String(text || '').toLowerCase().replace(/(^|[\s.'-])([a-z])/g, (m, a, b) => a + b.toUpperCase()).replace(/\bGovt\b/, 'Govt.');
// which rank a road is: the broad tarred roads, the laterite roads, the lanes and footpaths
export const roadRank = (road) => (road.surface === 'asphalt' ? 0 : road.surface === 'laterite' ? 1 : 2);

// The town in the map's own measure: metres east and south of the middle of the grid, north up.
const T = (x, z) => gridToTrue(x, z, ZONE.gridBearing);
// The roads on the map: the town's, and those beyond it to Onitsha, the airport and over the bridge.
const MAP_ROADS = Object.freeze([...ZONE_ROADS, ...OUTSKIRT_ROADS]);
export function mapExtent() {
  const b = ZONE.bounds;
  // (out as far as the road works on the Onitsha road, the airport's fence and the bridge's far end)
  const minX = Math.min(b.minX, ...OUTSKIRT_ROADS.map((r) => r.x0)), minZ = Math.min(b.minZ, AIRPORT.fence.z0), maxZ = Math.max(b.maxZ, BRIDGE.end);
  const pts = [T(minX, minZ), T(b.maxX, minZ), T(minX, maxZ), T(b.maxX, maxZ)];
  return { minE: Math.min(...pts.map((p) => p.e)), maxE: Math.max(...pts.map((p) => p.e)), minS: Math.min(...pts.map((p) => p.s)), maxS: Math.max(...pts.map((p) => p.s)) };
}

// The names on the map, most important first: [text, x, z, kind, least zoom at which it is shown]
function namesOf() {
  const out = [];
  const seen = new Set();
  const add = (text, x, z, kind, from) => { const key = text.toLowerCase(); if (!text || seen.has(key)) return; seen.add(key); out.push({ text, x, z, kind, from }); };
  for (const [text, x, z, align] of [...ZONE_PROPS.mapLabels, ...OUTSKIRT_MAP_LABELS]) add(text, x, z, align === 'vertical' ? 'water' : 'place', /River|Market|Motor park|Hospital|Registry/.test(text) ? 0 : 1.15);
  for (const k of ZONE_COMPOUNDS) add(k.name, (k.x0 + k.x1) / 2, (k.z0 + k.z1) / 2, 'place', 2.4);
  // a building is called what the town calls it: the name of the office or the shop in it, or else what its sign says
  const called = (b) => { const office = ZONE_SERVICES.find((sv) => sv.id === b.id); const shop = ZONE_SHOPS.find((sh) => sh.id === b.id); return (office && office.name) || (shop && shop.name) || titled(b.sign); };
  for (const b of ZONE_BUILDINGS) if (b.sign) add(called(b), b.x, b.z, 'place', 2.4);
  return out;
}

export function createTownMap({ h, view, way = () => null, waypoint = () => null, listings = () => [], state = {}, onPick = null }) {
  const extent = mapExtent();
  const canvas = h('canvas', { class: 'navmap-canvas', tabindex: '0', role: 'img', 'aria-label': `Map of ${ZONE.name}. Drag to move it, pinch or use the buttons to zoom.` });
  const button = (id, label, glyph, onclick) => h('button', { class: 'navmap-btn', type: 'button', id, 'aria-label': label, title: label, onclick }, glyph);
  const svg = (paths, filled) => { const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); el.setAttribute('viewBox', '0 0 24 24'); el.setAttribute('aria-hidden', 'true'); if (filled) el.classList.add('filled'); for (const d of paths) { const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', d); el.append(p); } return el; };
  const recentre = button('map-recentre', 'Centre the map on where you are', svg(['M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z', 'M12 2v4', 'M12 18v4', 'M2 12h4', 'M18 12h4']), () => { state.follow = true; ease(); });
  const el = h('div', { class: 'navmap' }, canvas,
    h('div', { class: 'navmap-zoom' }, button('map-zoom-in', 'Zoom in', svg(['M12 5v14', 'M5 12h14']), () => zoomBy(ZOOM.step)), button('map-zoom-out', 'Zoom out', svg(['M5 12h14']), () => zoomBy(1 / ZOOM.step))),
    h('div', { class: 'navmap-here' }, recentre),
    h('div', { class: 'navmap-north', 'aria-hidden': 'true' }, svg(['M12 3l5 16-5-3.5L7 19z'], true), h('span', null, 'N')));
  const g = canvas.getContext('2d');
  const names = namesOf();
  let W = 0, H = 0, dpr = 1, fitK = 1, dirty = true, running = false, frame = 0, last = '';
  let picks = [];                // names drawn this time, to be pressed: { x0, y0, x1, y1, name }

  // ---- where the map is ----
  const me = () => { const v = view(); return v && v.self ? v.self : null; };
  function measure() {
    // its size as the page lays it out, not as it is drawn at this moment: a page that is still sliding in is
    // drawn a little small, and a map measured then would be stretched until it was measured again
    const w = canvas.clientWidth, ht = canvas.clientHeight;
    if (!w || !ht) return false;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    if (w !== W || ht !== H || ratio !== dpr) { W = w; H = ht; dpr = ratio; canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); dirty = true; }
    fitK = Math.min(W / (extent.maxE - extent.minE), H / (extent.maxS - extent.minS));
    return true;
  }
  const least = () => fitK * 0.92;
  function settle() {
    if (!Number.isFinite(state.k)) { state.k = Math.max(fitK * 1.05, Math.min(ZOOM.start, fitK * 3.2)); state.follow = true; }
    state.k = Math.max(least(), Math.min(ZOOM.most, state.k));
    if (state.follow !== false) { const p = me(); if (p) { const t = T(p.x, p.z); state.e = t.e; state.s = t.s; } }
    if (!Number.isFinite(state.e)) { state.e = (extent.minE + extent.maxE) / 2; state.s = (extent.minS + extent.maxS) / 2; }
    // The town fills the screen: the map is not moved so far that there is nothing of it at one side. (So, far
    // out, the whole town is in view, and at its edges the player's dot is off the middle.)
    const hold = (value, lo, hi, half) => (hi - lo <= half * 2 ? (lo + hi) / 2 : Math.max(lo + half, Math.min(hi - half, value)));
    state.e = hold(state.e, extent.minE, extent.maxE, W / (2 * state.k));
    state.s = hold(state.s, extent.minS, extent.maxS, H / (2 * state.k));
  }
  const X = (e) => (e - state.e) * state.k + W / 2;
  const Y = (s) => (s - state.s) * state.k + H / 2;
  const P = (x, z) => { const t = T(x, z); return [X(t.e), Y(t.s)]; };
  const toWorld = (px, py) => trueToGrid((px - W / 2) / state.k + state.e, (py - H / 2) / state.k + state.s, ZONE.gridBearing);

  function zoomAt(factor, px = W / 2, py = H / 2) {
    const before = { e: (px - W / 2) / state.k + state.e, s: (py - H / 2) / state.k + state.s };
    state.k = Math.max(least(), Math.min(ZOOM.most, state.k * factor));
    if (state.follow === false) { state.e = before.e - (px - W / 2) / state.k; state.s = before.s - (py - H / 2) / state.k; }
    dirty = true;
  }
  const zoomBy = (factor) => zoomAt(factor);
  function ease() { dirty = true; }
  // The whole of a route in view, with room round it.
  function fit(points) {
    if (!measure() || !points || points.length < 2) return;
    const ts = points.map(([x, z]) => T(x, z));
    const minE = Math.min(...ts.map((t) => t.e)), maxE = Math.max(...ts.map((t) => t.e)), minS = Math.min(...ts.map((t) => t.s)), maxS = Math.max(...ts.map((t) => t.s));
    state.follow = false;
    state.e = (minE + maxE) / 2; state.s = (minS + maxS) / 2;
    state.k = Math.max(least(), Math.min(4.5, Math.min((W - 90) / Math.max(20, maxE - minE), (H - 90) / Math.max(20, maxS - minS))));
    dirty = true;
  }

  // ---- drawing ----
  const quad = (x0, z0, x1, z1) => { const a = P(x0, z0), b = P(x1, z0), c = P(x1, z1), d = P(x0, z1); g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.lineTo(c[0], c[1]); g.lineTo(d[0], d[1]); g.closePath(); };
  const box = (x0, z0, x1, z1) => { const a = P(x0, z0), c = P(x1, z1); return [Math.min(a[0], c[0]), Math.min(a[1], c[1]), Math.abs(c[0] - a[0]), Math.abs(c[1] - a[1])]; };
  const onScreen = (x0, z0, x1, z1, pad = 20) => { const [x, y, w, ht] = box(x0, z0, x1, z1); return x < W + pad && y < H + pad && x + w > -pad && y + ht > -pad; };

  function ground() {
    const b = ZONE.bounds;
    g.fillStyle = MAP_STYLE.waterDeep; g.fillRect(0, 0, W, H);
    // the land: everything up to the river's bank
    g.fillStyle = MAP_STYLE.land;
    g.beginPath();
    let [px, py] = P(b.minX, b.minZ); g.moveTo(px, py);
    [px, py] = P(b.maxX, b.minZ); g.lineTo(px, py);
    for (let x = b.maxX; x >= b.minX; x -= 4) { [px, py] = P(x, zoneShoreZ(x)); g.lineTo(px, py); }
    g.closePath(); g.fill();
    // beyond the edges of the zone the land goes on (the map has no more to say about it)
    for (const [x0, z0, x1, z1] of [[b.minX - 600, b.minZ - 600, b.minX, zoneShoreZ(b.minX)], [b.maxX, b.minZ - 600, b.maxX + 600, zoneShoreZ(b.maxX)], [b.minX - 600, b.minZ - 600, b.maxX + 600, b.minZ]]) { quad(x0, z0, x1, z1); g.fillStyle = MAP_STYLE.land; g.fill(); }
    // the river: its water, the line of its bank, and a few strokes for the flow
    g.fillStyle = MAP_STYLE.water;
    g.beginPath();
    for (let x = b.minX - 600; x <= b.maxX + 600; x += 4) { [px, py] = P(x, zoneShoreZ(Math.max(b.minX, Math.min(b.maxX, x)))); if (x === b.minX - 600) g.moveTo(px, py); else g.lineTo(px, py); }
    [px, py] = P(b.maxX + 600, b.maxZ + 600); g.lineTo(px, py); [px, py] = P(b.minX - 600, b.maxZ + 600); g.lineTo(px, py);
    g.closePath(); g.fill();
    g.strokeStyle = MAP_STYLE.shore; g.lineWidth = Math.max(1, 0.9 * state.k); g.lineJoin = 'round';
    g.beginPath();
    for (let x = b.minX - 600; x <= b.maxX + 600; x += 4) { [px, py] = P(x, zoneShoreZ(Math.max(b.minX, Math.min(b.maxX, x)))); if (x === b.minX - 600) g.moveTo(px, py); else g.lineTo(px, py); }
    g.stroke();
    if (state.k > 0.7) {
      g.strokeStyle = MAP_STYLE.wave; g.lineWidth = Math.max(1, 0.5 * state.k); g.lineCap = 'round';
      for (let x = b.minX + 30; x < b.maxX; x += 70) for (const out of [14, 36, 58]) {
        const z = zoneShoreZ(x) + out + ((x * 7) % 9);
        if (z > b.maxZ + 40) continue;
        const [ax, ay] = P(x, z), [bx, by] = P(x + 16, z);
        g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
      }
    }
    // farmland, in furrows
    const f = ZONE_FARMLAND;
    quad(f.x0, f.z0, f.x1, f.z1); g.fillStyle = MAP_STYLE.farm; g.fill();
    if (state.k > 0.9) {
      g.save(); quad(f.x0, f.z0, f.x1, f.z1); g.clip();
      g.strokeStyle = MAP_STYLE.farmLine; g.lineWidth = 1;
      for (let z = f.z0 + 4; z < f.z1; z += 6) { const [ax, ay] = P(f.x0, z), [bx, by] = P(f.x1, z); g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke(); }
      g.restore();
    }
    // the grounds of the hospital, the schools and the churches
    for (const k of ZONE_COMPOUNDS) {
      if (!onScreen(k.x0, k.z0, k.x1, k.z1)) continue;
      quad(k.x0, k.z0, k.x1, k.z1); g.fillStyle = MAP_STYLE.grounds; g.fill();
      g.strokeStyle = MAP_STYLE.groundsEdge; g.lineWidth = 1; g.stroke();
    }
    quad(ZONE_JETTY.x0, ZONE_JETTY.z0, ZONE_JETTY.x1, ZONE_JETTY.z1); g.fillStyle = MAP_STYLE.jetty; g.fill(); g.strokeStyle = MAP_STYLE.jettyEdge; g.lineWidth = 1; g.stroke();
    // the airport: its fenced land, the runway, the taxiway and the apron, the terminal
    const A = AIRPORT;
    quad(A.fence.x0, A.fence.z0, A.fence.x1, A.fence.z1); g.fillStyle = MAP_STYLE.grounds; g.fill(); g.strokeStyle = MAP_STYLE.groundsEdge; g.lineWidth = 1; g.stroke();
    for (const r of [A.runway, A.taxiway, ...A.links, A.apron]) { quad(r.x0, r.z0, r.x1, r.z1); g.fillStyle = MAP_STYLE.major; g.fill(); }
    quad(A.terminal.x0, A.terminal.z0, A.terminal.x1, A.terminal.z1); g.fillStyle = MAP_STYLE.building; g.fill();
    for (const b of OUTSKIRT_BUILDINGS) { if (!onScreen(b.x - b.w / 2, b.z - b.d / 2, b.x + b.w / 2, b.z + b.d / 2)) continue; quad(b.x - b.w / 2, b.z - b.d / 2, b.x + b.w / 2, b.z + b.d / 2); g.fillStyle = MAP_STYLE.house; g.fill(); }
  }

  function plots(v) {
    ZONE_PARCELS.forEach((p, i) => {
      if (!onScreen(p.x0, p.z0, p.x1, p.z1)) return;
      const row = v && v.parcels ? v.parcels[i] : null;
      quad(p.x0, p.z0, p.x1, p.z1);
      g.fillStyle = row && row.yours ? MAP_STYLE.plotMine : MAP_STYLE.plot; g.fill();
      g.setLineDash(row && row.status === 'available' && !row.yours ? [5, 4] : []);
      g.strokeStyle = row && row.yours ? MAP_STYLE.plotMineEdge : row && row.status === 'available' ? MAP_STYLE.plotSale : MAP_STYLE.plotEdge;
      g.lineWidth = row && (row.yours || row.status === 'available') ? 1.6 : 1; g.stroke();
      g.setLineDash([]);
    });
  }

  function trees() {
    if (state.k < 0.75) return;
    for (const t of ZONE_TREES) {
      const [x, y] = P(t.x, t.z);
      if (x < -12 || y < -12 || x > W + 12 || y > H + 12) continue;
      const r = Math.max(1.6, 2.1 * (t.size || 1) * state.k);
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fillStyle = MAP_STYLE.tree; g.fill();
      if (state.k > 2.2) { g.strokeStyle = MAP_STYLE.treeEdge; g.lineWidth = 1; g.stroke(); }
    }
  }

  // The roads: every edge first, then every surface, lowest rank first, so that where two roads meet the
  // junction is open and the greater road runs through the lesser.
  function roads() {
    const order = [...MAP_ROADS].sort((a, b) => roadRank(b) - roadRank(a));
    const grow = (rank) => Math.max(0, (rank === 0 ? 2.2 : rank === 1 ? 1.5 : 1.2) - state.k * 0.25);      // far out, a road is still wide enough to be seen
    const shape = (r, extra) => { const rank = roadRank(r); const m = grow(rank) / state.k + extra / state.k; quad(r.x0 - (r.x1 - r.x0 < r.z1 - r.z0 ? m : 0), r.z0 - (r.x1 - r.x0 < r.z1 - r.z0 ? 0 : m), r.x1 + (r.x1 - r.x0 < r.z1 - r.z0 ? m : 0), r.z1 + (r.x1 - r.x0 < r.z1 - r.z0 ? 0 : m)); };
    for (const r of order) { if (!onScreen(r.x0, r.z0, r.x1, r.z1)) continue; const rank = roadRank(r); shape(r, rank === 2 ? 0.8 : 1.3); g.fillStyle = [MAP_STYLE.majorEdge, MAP_STYLE.minorEdge, MAP_STYLE.laneEdge][rank]; g.fill(); }
    for (const r of order) { if (!onScreen(r.x0, r.z0, r.x1, r.z1)) continue; const rank = roadRank(r); shape(r, 0); g.fillStyle = [MAP_STYLE.major, MAP_STYLE.minor, MAP_STYLE.lane][rank]; g.fill(); }
    // the line down the middle of a tarred road, close to
    if (state.k > 2.6) {
      g.strokeStyle = MAP_STYLE.centre; g.lineWidth = Math.max(1, 0.18 * state.k); g.setLineDash([3 * state.k, 3 * state.k]);
      for (const r of MAP_ROADS) {
        if (roadRank(r) !== 0 || !onScreen(r.x0, r.z0, r.x1, r.z1)) continue;
        const along = r.x1 - r.x0 >= r.z1 - r.z0;
        const [ax, ay] = along ? P(r.x0, (r.z0 + r.z1) / 2) : P((r.x0 + r.x1) / 2, r.z0), [bx, by] = along ? P(r.x1, (r.z0 + r.z1) / 2) : P((r.x0 + r.x1) / 2, r.z1);
        g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
      }
      g.setLineDash([]);
    }
  }

  function footprints() {
    const outline = state.k > 1.1;
    g.lineWidth = 1; g.lineJoin = 'miter';
    if (state.k > 1.5) { g.fillStyle = MAP_STYLE.stall; for (const s of ZONE_STALLS) { const [x, y] = P(s.x, s.z); const r = 1.5 * state.k; g.fillRect(x - r, y - r, r * 2, r * 2); } }
    for (const hs of ZONE_HOUSES) {
      if (!onScreen(hs.x - hs.w / 2, hs.z - hs.d / 2, hs.x + hs.w / 2, hs.z + hs.d / 2)) continue;
      quad(hs.x - hs.w / 2, hs.z - hs.d / 2, hs.x + hs.w / 2, hs.z + hs.d / 2); g.fillStyle = MAP_STYLE.house; g.fill();
      if (outline) { g.strokeStyle = MAP_STYLE.houseEdge; g.stroke(); }
    }
    if (state.k > 1.3) for (const sh of ZONE_SHEDS) { quad(sh.x - 2.5, sh.z - 2.5, sh.x + 2.5, sh.z + 2.5); g.fillStyle = MAP_STYLE.house; g.fill(); if (outline) { g.strokeStyle = MAP_STYLE.houseEdge; g.stroke(); } }
    for (const k of ZONE_COMPOUNDS) for (const bd of k.buildings) {
      if (!onScreen(bd.x0, bd.z0, bd.x1, bd.z1)) continue;
      quad(bd.x0, bd.z0, bd.x1, bd.z1); g.fillStyle = MAP_STYLE.kinds[k.kind === 'hospital' ? 'hospital' : k.kind === 'church' ? 'church' : 'school'] || MAP_STYLE.building; g.fill();
      g.strokeStyle = MAP_STYLE.buildingEdge; g.stroke();
    }
    for (const bd of ZONE_BUILDINGS) {
      if (!onScreen(bd.x - bd.w / 2, bd.z - bd.d / 2, bd.x + bd.w / 2, bd.z + bd.d / 2)) continue;
      quad(bd.x - bd.w / 2, bd.z - bd.d / 2, bd.x + bd.w / 2, bd.z + bd.d / 2);
      g.fillStyle = MAP_STYLE.kinds[bd.kind] || (bd.kind === 'home' ? MAP_STYLE.house : MAP_STYLE.building); g.fill();
      g.strokeStyle = MAP_STYLE.buildingEdge; g.stroke();
    }
  }

  // ---- names ----
  let taken = [];
  const free = (x0, y0, x1, y1) => !taken.some((t) => x0 < t[2] && t[0] < x1 && y0 < t[3] && t[1] < y1);
  function write(text, x, y, { size = 12, weight = 600, colour = MAP_STYLE.text, italic = false, turn = 0, pick = null, force = false } = {}) {
    g.font = `${italic ? 'italic ' : ''}${weight} ${size}px ${FONT}`;
    const w = g.measureText(text).width, ht = size * 1.25;
    const [bw, bh] = turn ? [ht, w] : [w, ht];
    const x0 = x - bw / 2 - 3, y0 = y - bh / 2 - 2, x1 = x + bw / 2 + 3, y1 = y + bh / 2 + 2;
    if (x1 < 0 || y1 < 0 || x0 > W || y0 > H) return false;
    if (!force && !free(x0, y0, x1, y1)) return false;
    taken.push([x0, y0, x1, y1]);
    g.save(); g.translate(x, y); if (turn) g.rotate(turn);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    g.strokeStyle = MAP_STYLE.halo; g.lineWidth = Math.max(3, size * 0.32); g.strokeText(text, 0, 0);
    g.fillStyle = colour; g.fillText(text, 0, 0);
    g.restore();
    if (pick) picks.push({ x0, y0, x1, y1, name: pick });
    return true;
  }

  function roadNames() {
    const done = new Map();          // name -> where it has been written, so that it is not written again close by
    for (const r of [...MAP_ROADS].sort((a, b) => roadRank(a) - roadRank(b))) {
      const rank = roadRank(r);
      if (state.k < [0.62, 1.25, 2.3][rank]) continue;
      const [ax, ay] = P(r.x0, r.z0), [bx, by] = P(r.x1, r.z1);
      const flat = Math.abs(bx - ax) >= Math.abs(by - ay);             // how it lies on the screen
      const size = rank === 0 ? 12 : 11;
      g.font = `600 ${size}px ${FONT}`;
      const wide = g.measureText(r.name).width;
      const length = flat ? Math.abs(bx - ax) : Math.abs(by - ay);
      if (length < wide + 24) continue;
      // along the part of the road that is on the screen, clear of the ends
      const lo = Math.max(flat ? Math.min(ax, bx) : Math.min(ay, by), 0) + wide / 2 + 10, hi = Math.min(flat ? Math.max(ax, bx) : Math.max(ay, by), flat ? W : H) - wide / 2 - 10;
      if (hi < lo) continue;
      const mid = (ax + bx) / 2, midY = (ay + by) / 2;
      for (const at of [0.5, 0.25, 0.75]) {
        const along2 = lo + (hi - lo) * at;
        const x = flat ? along2 : mid, y = flat ? midY : along2;
        const before = done.get(r.name) || [];
        if (before.some(([px, py]) => Math.hypot(px - x, py - y) < 260)) continue;
        if (write(r.name, x, y, { size, colour: MAP_STYLE.roadText, weight: 600, turn: flat ? 0 : -Math.PI / 2 })) { before.push([x, y]); done.set(r.name, before); break; }
      }
    }
  }

  function placeNames() {
    for (const n of names) {
      if (state.k < n.from) continue;
      const [x, y] = P(n.x, n.z);
      if (n.kind === 'water') { write(n.text, x, y, { size: state.k > 1.4 ? 15 : 13, italic: true, weight: 600, colour: MAP_STYLE.waterText }); continue; }
      const big = n.from === 0;
      write(n.text, x, y, { size: big ? 13 : 12, weight: big ? 700 : 600, pick: { x: n.x, z: n.z, label: n.text } });
    }
  }

  // ---- what moves, and what the player has asked for ----
  function pin(x, y, colour) {
    g.save(); g.translate(x, y);
    g.beginPath(); g.moveTo(0, 0); g.bezierCurveTo(-11, -13, -11, -27, 0, -27); g.bezierCurveTo(11, -27, 11, -13, 0, 0); g.closePath();
    g.fillStyle = colour; g.strokeStyle = '#ffffff'; g.lineWidth = 2; g.fill(); g.stroke();
    g.beginPath(); g.arc(0, -17, 4, 0, Math.PI * 2); g.fillStyle = '#ffffff'; g.fill();
    g.restore();
  }

  // The way: over the roads, under the names.
  function wayLine() {
    const route = way();
    const line = route ? route.road || route.points : null;
    if (line && line.length > 1) {
      g.lineJoin = 'round'; g.lineCap = 'round';
      const pts = line.map(([x, z]) => P(x, z));
      const stroke = (from, to, colour, width, dash) => { g.strokeStyle = colour; g.lineWidth = width; g.setLineDash(dash || []); g.beginPath(); for (let i = from; i <= to; i += 1) { if (i === from) g.moveTo(pts[i][0], pts[i][1]); else g.lineTo(pts[i][0], pts[i][1]); } g.stroke(); g.setLineDash([]); };
      const n = pts.length - 1;
      if (route.road && n >= 3) {
        // along the roads, a solid line; from the player to the road and from the road to the door, dots
        stroke(1, n - 1, MAP_STYLE.routeEdge, 9); stroke(1, n - 1, MAP_STYLE.route, 5.5);
        for (const [from, to] of [[0, 1], [n - 1, n]]) { stroke(from, to, MAP_STYLE.routeEdge, 7, [0.1, 9]); stroke(from, to, MAP_STYLE.route, 4, [0.1, 9]); }
      } else { stroke(0, n, MAP_STYLE.routeEdge, 9); stroke(0, n, MAP_STYLE.route, 5.5); }
    }
  }

  function overlay(v) {
    const route = way();
    // things for sale in the market: where their markers stand
    for (const l of listings() || []) { const [x, y] = P(l.x, l.z); g.beginPath(); g.arc(x, y, 5, 0, Math.PI * 2); g.fillStyle = MAP_STYLE.listing; g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke(); }
    if (v) {
      g.fillStyle = '#6b7280';
      for (const o of v.okadas || []) { const [x, y] = P(o.x, o.z); g.beginPath(); g.arc(x, y, 2.6, 0, Math.PI * 2); g.fill(); }
      for (const car of v.vehicles || []) {
        const [x, y] = P(car.x, car.z);
        g.fillStyle = car.yours ? '#111827' : '#9ca3af'; g.strokeStyle = '#ffffff'; g.lineWidth = 1.5;
        g.beginPath(); g.rect(x - 4.5, y - 4.5, 9, 9); g.fill(); g.stroke();
      }
      if (v.self && v.self.run) { const spot = v.self.run.state === 'accepted' ? v.self.run.from : v.self.run.to; const [x, y] = P(spot.x, spot.z); pin(x, y, '#f59e0b'); }
      const van = v.ambulance;
      if (van && van.mode !== 'parked') { const [x, y] = P(van.x, van.z); g.fillStyle = '#ffffff'; g.fillRect(x - 7, y - 7, 14, 14); g.fillStyle = '#e53935'; g.fillRect(x - 1.8, y - 5.5, 3.6, 11); g.fillRect(x - 5.5, y - 1.8, 11, 3.6); }
    }
    const mark = waypoint();
    if (mark) { const [x, y] = P(mark.x, mark.z); g.beginPath(); g.arc(x, y, 13, 0, Math.PI * 2); g.strokeStyle = '#ffffff'; g.lineWidth = 5; g.stroke(); g.strokeStyle = MAP_STYLE.mark; g.lineWidth = 2.5; g.stroke(); }
    if (route && route.to) { const [x, y] = P(route.to.x, route.to.z); pin(x, y, MAP_STYLE.pin); }
    // the player: a blue dot, ringed in white, with a wedge for the way they face
    const p = me();
    if (p) {
      const [x, y] = P(p.x, p.z);
      const facing = -p.heading + Math.PI + (ZONE.gridBearing * Math.PI) / 180;
      g.save(); g.translate(x, y);
      g.beginPath(); g.arc(0, 0, 20, 0, Math.PI * 2); g.fillStyle = 'rgba(26,115,232,0.16)'; g.fill();
      g.rotate(facing);
      g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, 26, -Math.PI / 2 - 0.5, -Math.PI / 2 + 0.5); g.closePath(); g.fillStyle = 'rgba(26,115,232,0.38)'; g.fill();
      g.beginPath(); g.arc(0, 0, 8.5, 0, Math.PI * 2); g.fillStyle = MAP_STYLE.meRing; g.fill();
      g.beginPath(); g.arc(0, 0, 6, 0, Math.PI * 2); g.fillStyle = MAP_STYLE.me; g.fill();
      g.restore();
    }
  }

  function scaleBar() {
    const want = 90 / state.k;                 // metres that about ninety pixels are
    const metres = [10, 20, 50, 100, 200, 500].reduce((best, m) => (Math.abs(m - want) < Math.abs(best - want) ? m : best), 10);
    const w = metres * state.k, x = 12, y = H - 14;
    g.lineCap = 'butt';
    for (const [colour, width] of [['rgba(255,255,255,0.9)', 5], ['#26331f', 2]]) { g.strokeStyle = colour; g.lineWidth = width; g.beginPath(); g.moveTo(x, y - 5); g.lineTo(x, y); g.lineTo(x + w, y); g.lineTo(x + w, y - 5); g.stroke(); }
    g.font = `600 11px ${FONT}`; g.textAlign = 'left'; g.textBaseline = 'bottom'; g.lineJoin = 'round';
    g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 3; g.strokeText(`${metres} m`, x + 5, y - 3);
    g.fillStyle = '#26331f'; g.fillText(`${metres} m`, x + 5, y - 3);
  }

  function draw() {
    if (!measure()) return;
    settle();
    const v = view();
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    taken = []; picks = [];
    // (the buttons and the scale are not written over)
    taken.push([W - 58, 0, W, 58], [W - 58, H - 164, W, H], [0, H - 34, 150, H]);
    ground(); plots(v); trees(); roads(); footprints();
    wayLine();
    roadNames(); placeNames();
    overlay(v);
    scaleBar();
    recentre.classList.toggle('on', state.follow !== false);
    dirty = false;
    el.dataset.zoom = state.k.toFixed(3);
    el.dataset.follow = String(state.follow !== false);
    // where the player's dot is on the map, in the map's own pixels (at an edge of the town it is off the middle)
    { const p = me(); if (p) { const at = P(p.x, p.z); el.dataset.me = `${at[0].toFixed(1)},${at[1].toFixed(1)}`; } else delete el.dataset.me; }
  }

  // drawn again when it has been moved, and a few times a second for what moves by itself
  function loop(now) {
    if (!canvas.isConnected) { running = false; return; }
    const p = me(), v = view(), route = way();
    const sig = p ? `${p.x.toFixed(1)}|${p.z.toFixed(1)}|${p.heading.toFixed(2)}|${route ? (route.road || route.points).length : 0}|${v && v.vehicles ? v.vehicles.length : 0}` : '';
    if (sig !== last) { last = sig; dirty = true; }
    if (!dirty && now - frame > 600) dirty = true;         // the okadas, the ambulance
    if (dirty) { frame = now; draw(); }
    requestAnimationFrame(loop);
  }
  function start() { if (!running) { running = true; requestAnimationFrame(loop); } }

  // ---- the hand on it ----
  const fingers = new Map();
  let pinch = 0, moved = 0, downAt = null, lastTap = 0;
  const place = (event) => { const b = canvas.getBoundingClientRect(); return [(event.clientX - b.left) * (b.width ? W / b.width : 1), (event.clientY - b.top) * (b.height ? H / b.height : 1)]; };
  canvas.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    try { canvas.setPointerCapture(event.pointerId); } catch (error) { /* a made-up pointer has none to give */ }
    fingers.set(event.pointerId, place(event));
    if (fingers.size === 1) { moved = 0; downAt = place(event); }
    if (fingers.size === 2) { const [a, b] = [...fingers.values()]; pinch = Math.hypot(a[0] - b[0], a[1] - b[1]); }
    canvas.classList.add('held');
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!fingers.has(event.pointerId)) return;
    const was = fingers.get(event.pointerId), now = place(event);
    fingers.set(event.pointerId, now);
    if (fingers.size === 1) {
      const dx = now[0] - was[0], dy = now[1] - was[1];
      moved += Math.abs(dx) + Math.abs(dy);
      if (moved > 6) { state.follow = false; state.e -= dx / state.k; state.s -= dy / state.k; dirty = true; }
    } else if (fingers.size === 2) {
      const [a, b] = [...fingers.values()];
      const apart = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (pinch > 0 && apart > 0) { state.follow = false; zoomAt(apart / pinch, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2); }
      pinch = apart; moved += 20;
    }
  });
  const lift = (event) => {
    if (!fingers.has(event.pointerId)) return;
    const at = place(event);
    fingers.delete(event.pointerId);
    if (fingers.size < 2) pinch = 0;
    if (fingers.size) return;
    canvas.classList.remove('held');
    if (event.type === 'pointercancel' || moved > 8 || !downAt) return;
    // a press that did not move: on a name, that place is asked for; twice in a moment, the map steps in
    const hit = picks.find((n) => at[0] >= n.x0 && at[0] <= n.x1 && at[1] >= n.y0 && at[1] <= n.y1);
    const now = performance.now();
    if (hit && onPick) { onPick(hit.name); lastTap = 0; return; }
    if (now - lastTap < 320) { state.follow = false; zoomAt(ZOOM.step, at[0], at[1]); lastTap = 0; } else lastTap = now;
  };
  canvas.addEventListener('pointerup', lift);
  canvas.addEventListener('pointercancel', lift);
  canvas.addEventListener('wheel', (event) => { event.preventDefault(); const at = place(event); zoomAt(Math.exp(-event.deltaY * 0.0016), at[0], at[1]); }, { passive: false });
  canvas.addEventListener('keydown', (event) => {
    const step = 60 / state.k;
    const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[event.key]) { state.follow = false; state.e += moves[event.key][0]; state.s += moves[event.key][1]; dirty = true; }
    else if (event.key === '+' || event.key === '=') zoomBy(ZOOM.step);
    else if (event.key === '-' || event.key === '_') zoomBy(1 / ZOOM.step);
    else if (event.key === '0' || event.key === 'Home') { state.follow = true; dirty = true; }
    else return;
    event.preventDefault(); event.stopPropagation();
  });
  const watch = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { dirty = true; }) : null;
  if (watch) watch.observe(canvas);
  // (it is put on the page by whoever asked for it; drawing begins when it is there)
  requestAnimationFrame(() => { start(); });

  return {
    el, fit,
    redraw() { dirty = true; start(); },
    // where a place in the town is on the map just now, and the other way about: for the checks
    point: (x, z) => P(x, z), world: (px, py) => toWorld(px, py),
    get zoom() { return state.k; },
    dispose() { if (watch) watch.disconnect(); },
  };
}
