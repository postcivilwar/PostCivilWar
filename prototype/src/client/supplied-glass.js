// Real glass and a cab inside the owner's ambulance and his two trucks (6 November 2026, the brief's Stage 3: "the
// ambulance and the two trucks" given what the cars were given: "Every car's windscreen, side windows and back window
// must be real glass you can see through ... and the cabs of the ambulance and the two trucks, get a full cabin fitted
// to each").
//
// Nothing of his files is changed: each is drawn from its file as before (render-supplied.js), and beside it are its
// windows picture and the list of its triangles that carry glass (tools/vehicles/windows.py, reading it as
// tools/vehicles/supplied_cars.py writes it), as a car's are (car-glass.js): its body drawn without its painted glass,
// its inside dark, the glass drawn in its place; and a cab of the game's own inside (car-cabin.js), fitted to the room
// in its shell where its driver sits (tools/vehicles/supplied_cabs.json).
//
//   const glazed = await glazeSupplied(id, mesh, fitted, { lite, env })   fitted: render-supplied.js fitVehicle's
//   glazed.detail(level)       how much of its cab is drawn (2 near, 1 further, 0 far off)
//   glazed.light({ night, on })   its dials lit (its engine running)
//   glazed.dispose()
import { SUPPLIED_WINDOWS } from './supplied-windows.js';
import { carGlass, windowsPicture } from './car-glass.js';
import { makeCabin, PLAIN } from './car-cabin.js';
import { fetchKept } from './glb.js';

const BASE = 'supplied/';

async function pictureOf(url) {
  const r = await fetchKept(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  const blob = await r.blob();
  const bmp = typeof createImageBitmap === 'function' ? await createImageBitmap(blob).catch(() => null) : null;
  const image = bmp || await new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = URL.createObjectURL(blob); });
  return windowsPicture(image);
}

export async function glazeSupplied(id, mesh, fitted, { lite = false, env = null } = {}) {
  const win = SUPPLIED_WINDOWS[id];
  if (!win || !mesh.geometry.index) return null;
  const [picture, bits] = await Promise.all([pictureOf(BASE + win.masks[lite ? '512' : '1k']), fetchKept(BASE + win.tris).then((r) => { if (!r.ok) throw new Error(`${win.tris}: ${r.status}`); return r.arrayBuffer(); })]);
  const own = new Uint8Array(bits);
  // the glass: the triangles that carry any, in the model's own order
  const index = mesh.geometry.index.array;
  const list = [];
  for (let t = 0; t < index.length / 3; t += 1) if ((own[t >> 3] >> (t & 7)) & 1) list.push(index[t * 3], index[t * 3 + 1], index[t * 3 + 2]);
  const paneShape = new THREE.BufferGeometry();
  for (const [name, a] of Object.entries(mesh.geometry.attributes)) paneShape.setAttribute(name, a);
  paneShape.setIndex(list);
  paneShape.boundingSphere = mesh.geometry.boundingSphere ? mesh.geometry.boundingSphere.clone() : null;
  // (its measures as the tools read it: facing +z, its middle over the origin, from the ground, in its own units; its
  // file's own frame is turned and moved from that (fitVehicle): its height from the ground is its file's less its
  // lowest point)
  const { frame } = fitted;
  const spec = { length: win.length, height: win.height, body: win.body, width: win.body, driver: win.driver };
  const glass = carGlass(spec, picture, { lite, privacy: false, belt: win.belt + frame.y0, inside: new THREE.Color(PLAIN.roof).multiplyScalar(0.28), envMap: lite ? null : env });
  glass.body(mesh.material);
  const pane = glass.pane(paneShape);
  mesh.add(pane);
  // the cab, in the tools' frame, put where that lies in the turned file's
  const cab = win.driver ? makeCabin(`supplied:${id}`, spec, { scale: fitted.scale, lite, fit: win.fit || null, doors: [], cab: true }) : null;
  const holder = new THREE.Group();
  holder.position.set((frame.u0 + frame.u1) / 2, frame.y0, (frame.w0 + frame.w1) / 2);
  if (cab) holder.add(cab.group);
  fitted.fit.add(holder);
  let gone = false;
  return {
    pane, cab, holder,
    detail(level) { if (cab) cab.detail(level); },
    light(state) { if (cab) cab.light(state); },
    dispose() {
      if (gone) return; gone = true;
      if (cab) cab.dispose();
      if (holder.parent) holder.parent.remove(holder);
      if (pane.parent) pane.parent.remove(pane);
      paneShape.setIndex(null); paneShape.dispose();
      glass.dispose();
      picture.dispose();
    },
  };
}
