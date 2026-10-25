// The owner's guns, as the game draws them (25 October 2026, his brief for the guns: "Use the original GLBs and WAVs ...
// If a model has a built-in sight, use that actual sight rather than inventing a different one").
//
// Each gun is his GLB as he supplied it: one mesh with its three pictures (colour, normal, metal and roughness), fetched
// once and shared by every gun drawn from it (the player's own, other players', the police officers'). Nothing in his
// file is changed. What is done to it as it is drawn:
//   - its magazine (the triangles of it below the receiver, between the trigger guard and the handguard) is drawn as a
//     part of its own, so that a reload takes it out and puts another in: the same triangles and the same pictures;
//   - the glass of its sight is not drawn. The sight is a short tube with a disc of glass at each end, which the file
//     has as solid as the rest; aimed through, whatever is beyond is to be seen through it, as through a real one (the
//     brief: "Make the target visible through the sight opening"). Only what is inside the tube goes; its ring stays;
//   - its pictures are drawn at the size the device draws such things (on the website a phone fetches the copy made at
//     1024, build.mjs), the normal and metal pictures at half that on a computer (fine detail, at a third of the
//     memory), and not at all on a phone, which draws without them.
// Far off a gun is a few pixels; there (beyond `GUN_NEAR` metres from the eye) it is drawn as a few dark boxes in its
// shape instead of its 58,000 triangles.
//
// Where things are on each gun was measured from his file (its vertices: tools in the session's notes, 25 October
// 2026), in the file's own units: the muzzle, the sight's line (the middle of its two discs of glass), the pistol grip,
// where the other hand holds it, the butt, the magazine and the port the cases come out of. The rifle's file is 0.98
// long; drawn at `scale`, it is a 74 cm carbine with a grip and a magazine of a size for a hand.

import { loadSuppliedMesh } from './supplied-model.js';

export const GUN_NEAR = 40;

export const GUN_MODELS = Object.freeze({
  rifle: Object.freeze({
    id: 'rifle', file: 'guns/rifle.glb', scale: 0.755,
    // the end of the barrel; the bore runs along +x, up is +y, the gun's right side +z
    muzzle: Object.freeze([0.495, 0.3445, 0]),
    // the sight: a tube along the bore, its glass discs at x -0.042 and 0.029 (their middles 0.4994 and 0.5045 up, so a
    // line along the bore through y 0.502 passes through both), 0.028 across; `eye`: where an eye looks through it from,
    // 19 cm behind its back disc at this scale (a red dot sight is looked through from well back)
    sight: Object.freeze({ y: 0.502, z: 0, rear: -0.056, front: 0.048, glass: 0.0285, eye: -0.294 }),
    // the middle of the pistol grip (it leans back: its axis, from the top, `gripLean` radians back from straight down),
    // its half-width; where the other hand holds the handguard, just ahead of the magazine, from below
    grip: Object.freeze([-0.195, 0.215, -0.025]), gripLean: 0.33, gripHalf: 0.03,
    support: Object.freeze([0.205, 0.29, 0.004]),
    // the middle of the butt's end, against the shoulder
    butt: Object.freeze([-0.49, 0.345, -0.02]),
    // the magazine: the triangles in this box below the receiver; `hold`, where a hand holds it
    magazine: Object.freeze({ x0: 0.03, x1: 0.16, y1: 0.285, hold: Object.freeze([0.1, 0.12, 0.005]) }),
    // the charging handle, pulled after a new magazine goes in, and the port the cases are thrown from (on its right)
    handle: Object.freeze([-0.12, 0.43, -0.04]),
    port: Object.freeze([-0.02, 0.39, 0.05]),
    triangles: 57977,
  }),
});

let settings = { env: null, maxTexture: 2048, lite: false };
// What the device draws with (main.js, once): its sky for reflections (none on a phone), the largest picture.
export function setGunDrawing({ env = null, maxTexture = 2048, lite = false } = {}) { settings = { env, maxTexture, lite }; }

// ---- the model, read once ----

const models = new Map();          // id -> Promise<{ body, mag, material, triangles }>
export function loadGunModel(id) {
  const spec = GUN_MODELS[id];
  if (!spec) return Promise.reject(new Error(`no gun ${id}`));
  if (!models.has(id)) {
    const job = loadSuppliedMesh(spec.file, {
      maxTexture: settings.maxTexture, env: settings.env, envMapIntensity: 0.75, name: `gun-${id}`,
      maps: settings.lite ? { normal: false, rm: false } : { normal: Math.max(512, settings.maxTexture / 2), rm: Math.max(512, settings.maxTexture / 2) },
    }).then(({ mesh, triangles }) => {
      const { body, mag } = splitMagazine(mesh.geometry, spec.magazine);
      const material = mesh.material;
      seeThroughSight(material, spec);
      return { body, mag, material, triangles };
    });
    job.catch(() => models.delete(id));
    models.set(id, job);
  }
  return models.get(id);
}
export const gunModelReady = (id) => models.has(id);

// The magazine as a part of its own: the triangles whose middles are in its box, below the receiver. Both parts keep
// the file's own lists of points (shared between them, not copied); each has its own list of which make its triangles.
export function splitMagazine(geometry, box) {
  const pos = geometry.attributes.position, index = geometry.index;
  const body = [], mag = [];
  const all = index ? index.array : null;
  const n = all ? all.length : pos.count;
  for (let t = 0; t < n; t += 3) {
    const a = all ? all[t] : t, b = all ? all[t + 1] : t + 1, c = all ? all[t + 2] : t + 2;
    const x = (pos.getX(a) + pos.getX(b) + pos.getX(c)) / 3, top = Math.max(pos.getY(a), pos.getY(b), pos.getY(c));
    (x > box.x0 && x < box.x1 && top < box.y1 + 0.012 ? mag : body).push(a, b, c);
  }
  const part = (list) => {
    const g = new THREE.BufferGeometry();
    for (const [key, attr] of Object.entries(geometry.attributes)) g.setAttribute(key, attr);
    g.setIndex(new THREE.BufferAttribute(pos.count > 65535 ? new Uint32Array(list) : new Uint16Array(list), 1));
    g.computeBoundingSphere();
    return g;
  };
  return { body: part(body), mag: part(mag), bodyTriangles: body.length / 3, magTriangles: mag.length / 3 };
}

// The sight's glass not drawn: whatever of the gun is inside the tube, between its two ends (in the file's own units,
// as the shader has them), is left out, so that the tube is open from end to end and its ring frames what is beyond.
function seeThroughSight(material, spec) {
  const s = spec.sight;
  const f = (v) => Number(v).toFixed(5);
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vGunLocal;').replace('#include <begin_vertex>', '#include <begin_vertex>\n  vGunLocal = position;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vGunLocal;').replace('void main() {', `void main() {\n  if (vGunLocal.x > ${f(s.rear)} && vGunLocal.x < ${f(s.front)} && length(vGunLocal.yz - vec2(${f(s.y)}, ${f(s.z)})) < ${f(s.glass)}) discard;`);
  };
  material.customProgramCacheKey = () => `gun-sight-${spec.id}`;
  material.needsUpdate = true;
}

// ---- far off: a few boxes in its shape ----

let farGeometry = null, farMaterial = null;
function farShape() {
  if (farGeometry) return farGeometry;
  // [x0, x1, y0, y1, z half-width]: the stock, the receiver and handguard, the barrel, the grip, the magazine, the sight
  const boxes = [[-0.49, -0.26, 0.24, 0.45, 0.035], [-0.26, 0.40, 0.29, 0.45, 0.04], [0.40, 0.495, 0.32, 0.37, 0.02], [-0.24, -0.15, 0.12, 0.3, 0.028], [0.05, 0.145, 0.0, 0.3, 0.03], [-0.06, 0.06, 0.45, 0.535, 0.03]];
  const pos = [], nor = [], idx = [];
  for (const [x0, x1, y0, y1, w] of boxes) {
    const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, w * 2);
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, 0);
    const base = pos.length / 3;
    pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array);
    for (const i of g.index.array) idx.push(base + i);
    g.dispose();
  }
  farGeometry = new THREE.BufferGeometry();
  farGeometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  farGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  farGeometry.setIndex(idx);
  farGeometry.computeBoundingSphere();
  farMaterial = new THREE.MeshLambertMaterial({ color: 0x2b2d30 });
  return farGeometry;
}

// ---- one gun to draw ----

// A gun: its frame `group` (placed by whoever holds it: gun-pose.js), drawn at its scale, with its body, its magazine
// (its own `mag.position` moved by a reload, in the file's units) and its far shape. `point(name, out)`: one of its
// places in the world (muzzle, grip, support, butt, eye, sight and rear (the sight's front and back), port, handle,
// magazine), as it is placed now.
export function makeGun(id) {
  const spec = GUN_MODELS[id];
  if (!spec) throw new Error(`no gun ${id}`);
  const group = new THREE.Group();
  group.name = `gun-${id}`;
  group.scale.setScalar(spec.scale);
  const far = new THREE.Mesh(farShape(), farMaterial);
  far.castShadow = false;
  group.add(far);
  const gun = { id, spec, group, body: null, mag: null, far, ready: false, failed: null, near: true, disposed: false, magShown: true };
  loadGunModel(id).then((m) => {
    if (gun.disposed) return;
    gun.body = new THREE.Mesh(m.body, m.material);
    gun.mag = new THREE.Mesh(m.mag, m.material);
    for (const mesh of [gun.body, gun.mag]) { mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false; }
    group.add(gun.body, gun.mag);
    gun.ready = true;
    show();
  }).catch((error) => { gun.failed = String(error && error.message || error); });
  const show = () => {
    const full = gun.ready && gun.near;
    far.visible = !full;
    if (gun.body) gun.body.visible = full;
    if (gun.mag) gun.mag.visible = full && gun.magShown;
  };
  const local = {
    muzzle: spec.muzzle, grip: spec.grip, support: spec.support, butt: spec.butt, port: spec.port, handle: spec.handle,
    eye: [spec.sight.eye, spec.sight.y, spec.sight.z], sight: [spec.sight.front, spec.sight.y, spec.sight.z], rear: [spec.sight.rear, spec.sight.y, spec.sight.z], magazine: spec.magazine.hold,
  };
  gun.point = (name, out = new THREE.Vector3()) => { const p = local[name]; out.set(p[0], p[1], p[2]); if (name === 'magazine' && gun.mag) out.add(gun.mag.position); return group.localToWorld(out); };
  gun.local = local;
  // nearer than GUN_NEAR to the eye: its own model; further: its far shape
  gun.setNear = (on) => { if (gun.near === !!on) return; gun.near = !!on; show(); };
  // the magazine drawn or not (taken out in a reload)
  gun.showMagazine = (on) => { gun.magShown = !!on; show(); };
  gun.dispose = () => { gun.disposed = true; if (group.parent) group.parent.remove(group); };
  return gun;
}

// ---- a picture of it, for the weapon panel ----

// The gun from its right side, as a white silhouette: every triangle of his model drawn flat on a small picture (the
// weapon panel's, gun-hud.js; the owner's picture has a white rifle there). Made once from the model, kept as a picture.
const pictures = new Map();
export function gunPicture(id, { width = 240, height = 96 } = {}) {
  if (!pictures.has(id)) {
    pictures.set(id, loadGunModel(id).then(({ body, mag }) => {
      const c = document.createElement('canvas'); c.width = width; c.height = height;
      const g = c.getContext('2d');
      const pos = body.attributes.position;
      // the gun's extent from the side, and a little room round it
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (let i = 0; i < pos.count; i += 7) { const x = pos.getX(i), y = pos.getY(i); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      const k = Math.min((width - 8) / (x1 - x0), (height - 8) / (y1 - y0));
      const ox = (width - (x1 - x0) * k) / 2, oy = (height - (y1 - y0) * k) / 2;
      const px = (x) => ox + (x - x0) * k, py = (y) => height - oy - (y - y0) * k;
      g.fillStyle = '#ffffff';
      for (const geometry of [body, mag]) {
        const index = geometry.index.array;
        g.beginPath();
        for (let t = 0; t < index.length; t += 3) {
          const a = index[t], b = index[t + 1], d = index[t + 2];
          const ax = px(pos.getX(a)), ay = py(pos.getY(a)), bx = px(pos.getX(b)), by = py(pos.getY(b)), dx = px(pos.getX(d)), dy = py(pos.getY(d));
          // (every triangle the same way round, so that none cancels another out)
          const turn = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax);
          if (Math.abs(turn) < 0.01) continue;
          g.moveTo(ax, ay);
          if (turn > 0) { g.lineTo(bx, by); g.lineTo(dx, dy); } else { g.lineTo(dx, dy); g.lineTo(bx, by); }
          g.closePath();
        }
        g.fill('nonzero');
      }
      return c.toDataURL('image/png');
    }));
  }
  return pictures.get(id);
}
