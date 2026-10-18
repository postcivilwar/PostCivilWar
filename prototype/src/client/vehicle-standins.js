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
//   const standins = createStandins(scene, { lite });
//   standins.update([{ key, kind: 'bike' | 'car', id, x, y, z, h }], eye, now)      each frame: these, and no others
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
    const texture = new THREE.Texture(); texture.encoding = THREE.sRGBEncoding; texture.anisotropy = 4;
    const material = new THREE.MeshBasicMaterial({ map: texture, alphaTest: 0.5, toneMapped: false, side: THREE.DoubleSide });
    material.visible = false;
    s = { texture, material, wantedAt: 0, asked: false, generation: 0 };
    sheets.set(key, s);
    return s;
  }
  function want(kind, id, s, now) {
    s.wantedAt = now;
    if (s.asked || ON_DISK) return;
    s.asked = true;
    const mine = ++s.generation;
    const img = new Image();
    img.onload = () => {
      if (!s.asked || s.generation !== mine) return;
      // (a phone keeps a sheet at half its size: a quarter of the memory, for something seen from further off)
      let picture = img;
      if (lite) { const c = document.createElement('canvas'); c.width = img.width / 2; c.height = img.height / 2; const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(img, 0, 0, c.width, c.height); picture = c; }
      s.texture.image = picture; s.texture.needsUpdate = true; s.material.visible = true;
    };
    img.onerror = () => { s.asked = false; };
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

  function update(list, eye, now) {
    const wanted = new Set();
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
    }
    for (const key of [...shown.keys()]) if (!wanted.has(key)) drop(key);
    // a sheet no picture has been drawn from for a while is let go
    for (const s of sheets.values()) if (s.asked && now - s.wantedAt > KEEP_IDLE) { s.asked = false; s.generation += 1; s.material.visible = false; s.texture.dispose(); s.texture.image = undefined; }
  }
  function drop(key) {
    const e = shown.get(key);
    if (!e) return;
    scene.remove(e.mesh); e.mesh.geometry.dispose();
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
