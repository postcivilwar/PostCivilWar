// One of the owner's single-mesh models (a building, a vehicle), read as it is: its one mesh, its pictures (colour,
// and where the file has them, normal and metal and roughness), its material's own finish. Nothing in the file is
// changed. (Moved here from render-carshow.js, which reads its buildings with it, on 17 October 2026.)
//
// What was written on a building (another company's name) can be painted over in the colour picture the graphics
// card is given (`brand`: rectangles of the picture, and where beside each to take its own surface from), feathered
// at its edges. Each picture is handed to the graphics card no larger than `maxTexture` and never larger than it is:
// the owner's pictures are 8192 pixels square, and a browser cannot hold many of those at once (a few hundred
// megabytes each once drawn); the file keeps them whole.

import { parseGLB, fetchKept, letGoOnceDrawn, rereadFile } from './glb.js';
import { modelFile } from './budget.js';
import { surface } from './render-kit.js';
import { reflects } from './render-finish.js';

// One large picture taken in at a time, whichever building or vehicle it is for. A model carries up to three pictures
// of 8192 pixels, each of which can take a quarter of a gigabyte while it is read; the town, the car showroom and the
// owner's vehicles each fetch their models, and all of them read at once were more than a browser's page is allowed
// (in a test the page fell over).
let reading = Promise.resolve();
function oneAtATime(task) { const run = reading.then(task, task); reading = run.then(() => {}, () => {}); return run; }

export async function loadSuppliedMesh(named, { maxTexture, env = null, brand = null, name = '', envMapIntensity = 0.9 } = {}) {
  // (on a phone, the website's copy with its pictures the size a phone draws them: budget.js)
  const file = modelFile(named);
  const response = await fetchKept(file);
  if (!response.ok) throw new Error(`${file}: ${response.status}`);
  const { json, accessor, bytes } = parseGLB(await response.arrayBuffer());
  const prim = json.meshes[0].primitives[0], at = prim.attributes;
  const geometry = new THREE.BufferGeometry();
  // (each list copied out of the file, so that the file itself, mostly its pictures, is let go once read)
  const put = (key, attr) => { if (at[attr] === undefined) return; const a = accessor(at[attr]); geometry.setAttribute(key, new THREE.BufferAttribute(a.array.slice(), a.width, a.normalized)); };
  put('position', 'POSITION'); put('normal', 'NORMAL'); put('uv', 'TEXCOORD_0');
  if (prim.indices !== undefined) geometry.setIndex(new THREE.BufferAttribute(accessor(prim.indices).array.slice(), 1));
  if (!at.NORMAL) geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  const mat = json.materials[prim.material || 0], pbr = mat.pbrMetallicRoughness || {};
  const pictureOf = async (info, colour, paint = null) => {
    if (!info) return null;
    const index = json.textures[info.index].source;
    const image = json.images[index];
    const t = new THREE.Texture(await makePicture(bytes(image.bufferView), image, paint));
    t.flipY = false; t.anisotropy = 8; if (colour) t.encoding = THREE.sRGBEncoding; t.needsUpdate = true;
    // (once the graphics card has the picture, the page's own copy is let go: see glb.js; should the card's copy be
    // lost, it is made again the same way from the file, which the browser has kept)
    letGoOnceDrawn(t, () => rereadFile(file).then((again) => makePicture(again.bytes(again.json.images[index].bufferView), image, paint)));
    return t;
  };
  // a picture as it is drawn: no larger than `maxTexture`, and anything painted over it painted
  async function makePicture(raw, image, paint) {
    const blob = new Blob([raw], { type: image.mimeType || 'image/jpeg' });
    // (drawn no larger than `maxTexture`, and never larger than it is)
    const own = pictureSize(raw);
    const most = Math.min(maxTexture || 4096, own ? Math.max(own.width, own.height) : Infinity);
    const wide = own ? Math.round((most * own.width) / Math.max(own.width, own.height)) : most, high = own ? Math.round((most * own.height) / Math.max(own.width, own.height)) : most;
    let picture = await oneAtATime(async () => {
      const made = typeof createImageBitmap === 'function' ? await createImageBitmap(blob, { resizeWidth: wide, resizeHeight: high, resizeQuality: 'high' }).catch(() => null) : null;
      return made || new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = URL.createObjectURL(blob); });
    });
    if (paint && paint.length) {
      const c = document.createElement('canvas'); c.width = picture.width; c.height = picture.height;
      const g = c.getContext('2d'); g.drawImage(picture, 0, 0);
      for (const { at: [u0, v0, u1, v1], from: [fu, fv] } of paint) {
        const W = c.width, Hh = c.height, w = (u1 - u0) * W, h = (v1 - v0) * Hh, pad = Math.max(2, Math.min(w, h) * 0.12);
        // the surface from beside it, laid over it, its edges blended into what is round it
        const patch = document.createElement('canvas'); patch.width = Math.ceil(w + 2 * pad); patch.height = Math.ceil(h + 2 * pad);
        const pg = patch.getContext('2d');
        pg.drawImage(c, fu * W - pad, fv * Hh - pad, patch.width, patch.height, 0, 0, patch.width, patch.height);
        pg.globalCompositeOperation = 'destination-in';
        const fade = (a, b) => { const m = pg.createLinearGradient(...a); m.addColorStop(0, 'rgba(0,0,0,0)'); m.addColorStop(Math.min(0.45, pad / b), 'rgba(0,0,0,1)'); m.addColorStop(1 - Math.min(0.45, pad / b), 'rgba(0,0,0,1)'); m.addColorStop(1, 'rgba(0,0,0,0)'); pg.fillStyle = m; pg.fillRect(0, 0, patch.width, patch.height); };
        fade([0, 0, patch.width, 0], patch.width); fade([0, 0, 0, patch.height], patch.height);
        g.drawImage(patch, u0 * W - pad, v0 * Hh - pad);
      }
      picture = c;
    }
    return picture;
  }
  const [map, normalMap, rm] = await Promise.all([pictureOf(pbr.baseColorTexture, true, brand), pictureOf(mat.normalTexture, false), pictureOf(pbr.metallicRoughnessTexture, false)]);
  const colour = pbr.baseColorFactor ? new THREE.Color(...pbr.baseColorFactor.slice(0, 3)) : new THREE.Color(1, 1, 1);
  // the glass, the cladding and the paint reflect the sky (render-city.js's glass does the same)
  const material = surface({ map, normalMap, roughnessMap: rm, metalnessMap: rm, color: colour, roughness: rm ? 1 : (pbr.roughnessFactor ?? 1), metalness: rm ? 1 : (pbr.metallicFactor ?? 1), envMap: env || null, envMapIntensity, side: mat.doubleSided ? THREE.DoubleSide : THREE.FrontSide });
  if (normalMap && material.normalScale) material.normalScale.set(1, -1);
  // (and gives back less of it under cloud, and hardly any at night: render-finish.js)
  if (env) reflects(material, envMapIntensity);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.name = name;
  return { mesh, triangles: geometry.index ? geometry.index.count / 3 : geometry.attributes.position.count / 3 };
}

// How large a picture is, read from its first bytes (a PNG's header, or a JPEG's frame marker): null if neither.
export function pictureSize(b) {
  if (b.length > 24 && b[0] === 0x89 && b[1] === 0x50) return { width: (b[16] << 24 | b[17] << 16 | b[18] << 8 | b[19]) >>> 0, height: (b[20] << 24 | b[21] << 16 | b[22] << 8 | b[23]) >>> 0 };
  if (b[0] !== 0xff || b[1] !== 0xd8) return null;
  for (let i = 2; i + 9 < b.length;) {
    if (b[i] !== 0xff) { i += 1; continue; }
    const marker = b[i + 1];
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return { height: b[i + 5] << 8 | b[i + 6], width: b[i + 7] << 8 | b[i + 8] };
    i += 2 + (b[i + 2] << 8 | b[i + 3]);
  }
  return null;
}
