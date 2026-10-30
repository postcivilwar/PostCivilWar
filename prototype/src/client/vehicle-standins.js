// Another player's motorcycle or car as its picture from all round, where its model is not drawn (18 October 2026,
// the owner's brief: every player sees the vehicle another is riding or driving, never someone sitting on nothing).
//
// A vehicle being ridden or driven by someone else is drawn as its model (own-bike-view.js, car-view.js) for the
// nearest few; the model of one first seen takes a moment to come, and beyond the nearest few it is not drawn at all.
// There, its picture stands in: the showrooms' pictures of it from twenty-four sides (tools/vehicles/
// bike_impostors.mjs, car_impostors.mjs), the one for the side it is seen from, at its own size and where it is,
// turned to the eye. One picture sheet a kind of vehicle, fetched the first time it is wanted and let go once it has
// not been drawn for a while; one small square for each vehicle shown.
//
// (30 October 2026, the town's traffic: after dark a picture taken by day would shine out of the night, so the pictures
// are dimmed with the daylight (`light`); and a car's lamps, where it has them lit (`lamps`), glow at its two ends, the
// headlamps white and the tail lamps red, which is most of what is seen of a car at night from far off.)
//
//   const standins = createStandins(scene, { lite });
//   standins.update([{ key, kind: 'bike' | 'car', id, x, y, z, h, lamps }], eye, now, light)      each frame: these, and no others
import { BIKE_IMPOSTOR } from './bike-impostors.js';
import { CAR_IMPOSTOR } from './car-impostors.js';

const KEEP_IDLE = 30;              // seconds a sheet is kept after it was last drawn
const ON_DISK = (() => { try { return location.protocol === 'file:'; } catch (error) { return false; } })();

export function createStandins(scene, { lite = false } = {}) {
  const sheets = new Map();        // 'bike:id' -> { texture, material, wantedAt, asked }
  const shown = new Map();         // key -> { mesh, kind, id, frame }
  const metaOf = (kind) => (kind === 'car' ? CAR_IMPOSTOR : BIKE_IMPOSTOR);
  const sizeOf = (kind, id) => { const m = metaOf(kind); return (kind === 'car' ? m.cars : m.bikes)[id] || null; };

  function sheetOf(kind, id) {
    const key = `${kind}:${id}`;
    let s = sheets.get(key);
    if (s) return s;
    const texture = new THREE.Texture(); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
    const material = new THREE.MeshBasicMaterial({ map: texture, alphaTest: 0.5, toneMapped: false, side: THREE.DoubleSide });
    material.visible = false;
    s = { texture, material, wantedAt: 0, asked: false, generation: 0 };
    sheets.set(key, s);
    return s;
  }
  function want(kind, id, s, now) {
    s.wantedAt = now;
    if (s.asked || ON_DISK || now < (s.retryAt || 0)) return;
    s.asked = true;
    const mine = ++s.generation;
    const img = new Image();
    img.onload = () => {
      if (!s.asked || s.generation !== mine) return;
      // (a phone keeps a sheet at a quarter of its size, a sixteenth of the memory, for something seen from further off
      // than the nearest few drawn as their models: since 30 October 2026, with the town's traffic, several kinds of car
      // are about at once, and a phone at Medium held 10.7 MB of these sheets at the PowerBike showroom at half size)
      let picture = img;
      if (lite) { const c = document.createElement('canvas'); c.width = Math.round(img.width / 4); c.height = Math.round(img.height / 4); const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(img, 0, 0, c.width, c.height); picture = c; }
      s.texture.image = picture; s.texture.needsUpdate = true; s.material.visible = true;
    };
    // (one that could not be fetched is asked for again half a minute later, not every frame)
    img.onerror = () => { if (s.generation !== mine) return; s.asked = false; s.retryAt = performance.now() / 1000 + 30; };
    // (asked for before the vehicle's own files, which take longer: this is what is seen until they are here)
    try { img.fetchPriority = 'high'; } catch (error) { /* an older browser: as it comes */ }
    img.src = `assets/${kind}-${id}-impostor.webp`;
  }
  function frameOf(e, k) {
    if (e.frame === k) return;
    e.frame = k;
    const { cols, rows } = metaOf(e.kind);
    const c = k % cols, r = Math.floor(k / cols);
    const u0 = c / cols, u1 = (c + 1) / cols, v1 = 1 - r / rows, v0 = 1 - (r + 1) / rows;
    const uv = e.mesh.geometry.attributes.uv;
    uv.setXY(0, u0, v1); uv.setXY(1, u1, v1); uv.setXY(2, u0, v0); uv.setXY(3, u1, v0);
    uv.needsUpdate = true;
  }

  // the glow of a lamp: one small picture for all, shared
  let glowMap = null;
  const glowMaterials = {};
  function glowOf(color) {
    if (!glowMap) {
      const g = document.createElement('canvas'); g.width = g.height = 32;
      const c = g.getContext('2d'); const r = c.createRadialGradient(16, 16, 0, 16, 16, 16); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.35, 'rgba(255,255,255,0.45)'); r.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = r; c.fillRect(0, 0, 32, 32);
      glowMap = new THREE.CanvasTexture(g);
    }
    if (!glowMaterials[color]) glowMaterials[color] = new THREE.MeshBasicMaterial({ color, map: glowMap, transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending });
    return glowMaterials[color];
  }
  let glowPlane = null;
  function lampsOn(e, on) {
    if (on && !e.lamps) {
      glowPlane = glowPlane || new THREE.PlaneGeometry(1, 1);
      e.lamps = [new THREE.Mesh(glowPlane, glowOf(0xfff2d8)), new THREE.Mesh(glowPlane, glowOf(0xff2010))];
      e.lamps[0].scale.setScalar(1.3); e.lamps[1].scale.setScalar(0.8);
      for (const m of e.lamps) scene.add(m);
    }
    if (e.lamps) for (const m of e.lamps) m.visible = on;
  }

  function update(list, eye, now, light = 1) {
    const wanted = new Set();
    for (const s of sheets.values()) if (s.light !== light) { s.light = light; s.material.color.setScalar(light); }
    for (const v of list) {
      const size = sizeOf(v.kind, v.id);
      if (!size) continue;
      wanted.add(v.key);
      let e = shown.get(v.key);
      if (e && (e.kind !== v.kind || e.id !== v.id)) { drop(v.key); e = null; }
      const s = sheetOf(v.kind, v.id);
      if (!e) {
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size.size, size.size), s.material);
        mesh.name = `standin:${v.kind}:${v.id}`;
        scene.add(mesh);
        e = { mesh, kind: v.kind, id: v.id, frame: -1 };
        shown.set(v.key, e);
      }
      want(v.kind, v.id, s, now);
      // where the picture's middle is: the vehicle's own middle, turned with it; and the picture turned to the eye
      const c = size.centre, ch = Math.cos(v.h), sh = Math.sin(v.h);
      const wx = v.x + c[0] * ch + c[2] * sh, wz = v.z - c[0] * sh + c[2] * ch;
      e.mesh.position.set(wx, (v.y || 0) + c[1], wz);
      e.mesh.rotation.set(0, Math.atan2(eye.x - wx, eye.z - wz), 0);
      const n = metaOf(v.kind).frames;
      const a = Math.atan2(eye.x - v.x, eye.z - v.z) - v.h;
      frameOf(e, ((Math.round(a / ((Math.PI * 2) / n)) % n) + n) % n);
      // its lamps at its two ends, a little above its middle's height, turned to the eye
      lampsOn(e, !!v.lamps && v.kind === 'car');
      if (e.lamps) {
        const half = size.size * 0.42, y = (v.y || 0) + c[1] * 0.75;
        for (const [m, k] of [[e.lamps[0], 1], [e.lamps[1], -1]]) { m.position.set(v.x + sh * half * k, y, v.z + ch * half * k); m.rotation.set(0, Math.atan2(eye.x - m.position.x, eye.z - m.position.z), 0); }
      }
    }
    for (const key of [...shown.keys()]) if (!wanted.has(key)) drop(key);
    // a sheet no picture has been drawn from for a while is let go
    for (const s of sheets.values()) if (s.asked && now - s.wantedAt > KEEP_IDLE) { s.asked = false; s.generation += 1; s.material.visible = false; s.texture.dispose(); s.texture.image = undefined; }
  }
  function drop(key) {
    const e = shown.get(key);
    if (!e) return;
    scene.remove(e.mesh); e.mesh.geometry.dispose();
    if (e.lamps) for (const m of e.lamps) scene.remove(m);
    shown.delete(key);
  }

  return {
    update,
    // (for the tests: what stands in for what)
    shown: () => [...shown.entries()].map(([key, e]) => ({ key, kind: e.kind, id: e.id, drawn: e.mesh.material.visible })),
    sheets: () => [...sheets.entries()].filter(([, s]) => s.asked).map(([key]) => key),
    dispose() { for (const key of [...shown.keys()]) drop(key); for (const s of sheets.values()) { s.texture.dispose(); s.material.dispose(); } sheets.clear(); },
  };
}
