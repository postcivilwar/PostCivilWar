// The habitation's plants and things as the game draws them (20 October 2026, the owner's brief for the habitation at
// the far end of the River Niger): the models made from the owner's own files by tools/habitation/dress.py, read and
// given the surfaces they are made of.
//
//   - Leaves (a palm's fronds, a banana's torn leaves, a bush's sprays): drawn from their pictures with the air between
//     them (see-through where the picture is), coloured with the plant's own greens, lit from both sides as a leaf is,
//     glowing where the sun comes through them from behind, and moving in the wind, the tips more than the heart, each
//     plant a moment apart from the next.
//   - Bark, rock, moss, planks, rope: the model's own picture with the relief made from it (dress.py), and how rough
//     each part is, so that it is lit as wood or stone is.
//
//   const model = await readDressed(arrayBuffer)           the parts of one dressed model (shared by all its copies)
//   const object = model.make()                              one copy, to place in the scene
//   setHabitationWind(seconds)                               each frame: the wind's clock for every leaf
//
// Nothing here is fetched: whoever reads the file fetches it (render-habitation.js; the look tool, tools/habitation).

import { letGoOnceDrawn, decodeAtMost } from './glb.js';
import { letGoOnceSent } from './render-kit.js';

const TYPES = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const WIDTH = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
const MAX = { 5120: 127, 5121: 255, 5122: 32767, 5123: 65535 };

const wind = { value: 0 };
export const setHabitationWind = (seconds) => { wind.value = seconds % 3600; };
export const habitationWind = () => wind.value;

function readGLBParts(buffer) {
  const dv = new DataView(buffer);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('not a GLB file');
  let at = 12, json = null, bin = null;
  while (at < dv.byteLength) {
    const len = dv.getUint32(at, true), type = dv.getUint32(at + 4, true);
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, at + 8, len)));
    else if (type === 0x004e4942) bin = new Uint8Array(buffer, at + 8, len);
    at += 8 + len;
  }
  return { json, bin };
}
function accessor(json, bin, k, float = true) {
  const a = json.accessors[k], v = json.bufferViews[a.bufferView], T = TYPES[a.componentType], w = WIDTH[a.type];
  const off = bin.byteOffset + (v.byteOffset || 0) + (a.byteOffset || 0), n = a.count * w;
  const raw = new T(bin.buffer.slice(off, off + n * T.BYTES_PER_ELEMENT));
  if (!float || T === Float32Array) return raw;
  const out = new Float32Array(n), m = a.normalized ? MAX[a.componentType] : 1;
  for (let i = 0; i < n; i += 1) out[i] = Math.max(raw[i] / m, -1);
  return out;
}
// A picture shared by many models (the leaves' sheet, named in each file by `uri`): fetched once, by whoever reads
// the models (`shared(uri)` gives its texture).
// A texture's picture made half its size (once). Made by the browser as a picture of its own (createImageBitmap), so
// that the page's copy can be let go once the graphics card has it (glb.js, letGoOnceDrawn: a canvas, as it was made
// before 29 October 2026, was kept by the page for as long as the habitation stood), and remembered as its own largest
// (`userData.want`), so that it is made again at that size from its file should it be let go (glb.js, wakePicture).
const halvedOnce = new WeakSet();
async function halved(t) {
  if (!t || halvedOnce.has(t) || !t.image || !(t.image.width > 16)) return t;
  halvedOnce.add(t);
  const img = t.image, w = Math.max(1, Math.round(img.width / 2)), h = Math.max(1, Math.round(img.height / 2));
  t.userData.want = Math.max(w, h);
  let half = null;
  try { half = await createImageBitmap(img, { ...PICTURE_OPTIONS, resizeWidth: w, resizeHeight: h, resizeQuality: 'high' }); } catch (error) { half = null; }
  if (!half) {
    // (a browser that cannot make it so: drawn into a canvas, as before)
    half = document.createElement('canvas'); half.width = w; half.height = h;
    half.getContext('2d').drawImage(img, 0, 0, w, h);
  }
  if (t.image === img) { if (img.close) img.close(); t.image = half; t.needsUpdate = true; } else if (half.close) half.close();
  return t;
}
// A picture decoded: away from the page's thread where the browser can (createImageBitmap), and if that has not
// answered within a while (on a page busy with a great deal, it was once seen never to answer: 21 October 2026), by an
// image element instead; an error if neither can read it.
// (how a picture of the habitation is read: as its file has it, nothing turned or multiplied)
export const PICTURE_OPTIONS = Object.freeze({ imageOrientation: 'none', premultiplyAlpha: 'none' });
export function decodePicture(blob, { wait = 15000 } = {}) {
  const viaImage = () => new Promise((resolve, reject) => {
    const img = new Image(), url = URL.createObjectURL(blob);
    const done = (ok) => { clearTimeout(timer); URL.revokeObjectURL(url); if (ok) resolve(img); else reject(new Error('a picture of the habitation could not be read')); };
    const timer = setTimeout(() => done(false), 60000);
    img.onload = () => done(true); img.onerror = () => done(false);
    img.src = url;
  });
  if (typeof createImageBitmap !== 'function') return viaImage();
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => { if (!settled) { settled = true; viaImage().then(resolve, reject); } }, wait);
    createImageBitmap(blob, PICTURE_OPTIONS).then((bitmap) => {
      if (settled) { if (bitmap.close) bitmap.close(); return; }
      settled = true; clearTimeout(timer); resolve(bitmap);
    }, () => { if (settled) return; settled = true; clearTimeout(timer); viaImage().then(resolve, reject); });
  });
}
async function pictureOf(json, bin, index, colour, shared = null) {
  const tx = json.textures[index];
  const source = tx.source !== undefined ? tx.source : tx.extensions && tx.extensions.EXT_texture_webp && tx.extensions.EXT_texture_webp.source;
  const img = json.images[source];
  if (img.uri) {
    if (!shared) throw new Error(`the model needs ${img.uri}, and nothing gives it`);
    return shared(img.uri, colour);
  }
  const v = json.bufferViews[img.bufferView];
  const blob = new Blob([new Uint8Array(bin.buffer, bin.byteOffset + (v.byteOffset || 0), v.byteLength)], { type: img.mimeType });
  const t = new THREE.Texture(await decodePicture(blob));
  // (the page's copy let go once the graphics card has it, and made again from its file's bytes, at the graphics level's
  // size, should the card's copy be lost or another size be wanted: glb.js. Held, the habitation's pictures were some
  // twenty megabytes of the page's memory at the town's east end, where a phone holds the most: 29 October 2026)
  letGoOnceDrawn(t, (size) => decodeAtMost(blob, size, PICTURE_OPTIONS));
  t.flipY = false;
  if (colour) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.needsUpdate = true;
  return t;
}

// ---------------------------------------------------------------------------------------------- the leaves --

// A leaf's material: its picture, its plant's colours, both sides lit (the side seen is lit as the side toward the eye),
// a glow where the sun is behind it, and the wind. `sway` (an attribute, 0 at the heart to 1 at a tip) says how far
// each part moves; `amount` how far the tips go, in the model's own size (one model unit is its height or length).
export function leafMaterial({ map, alphaTest = 0.4, amount = 0.035, glow = 0.55 }) {
  const m = new THREE.MeshLambertMaterial({ map, vertexColors: true, alphaTest, side: THREE.DoubleSide });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uWind = wind;
    shader.uniforms.uAmount = { value: amount };
    shader.uniforms.uGlow = { value: glow };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float sway;\nuniform float uWind;\nuniform float uAmount;\nuniform float uGlow;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      {
        /* (each plant its own moment: where it stands, from its model matrix) */
        #ifdef USE_INSTANCING
          float seed = (modelMatrix * instanceMatrix[3]).x * 0.37 + (modelMatrix * instanceMatrix[3]).z * 0.23;
        #else
          float seed = modelMatrix[3].x * 0.37 + modelMatrix[3].z * 0.23;
        #endif
        float phase = seed + position.x * 2.1 + position.z * 1.7;
        float gust = 0.55 + 0.45 * sin(uWind * 0.21 + seed * 0.31);
        float flex = sway * sway * uAmount;
        transformed.x += (sin(uWind * 1.35 + phase) + 0.35 * sin(uWind * 3.3 + phase * 2.7)) * flex * gust;
        transformed.z += cos(uWind * 1.1 + phase * 1.3) * flex * 0.8 * gust;
        transformed.y += sin(uWind * 1.9 + phase * 2.2) * flex * 0.45 * gust;
      }`);
    // the sun through the leaf: bright where it is behind the leaf as seen from the eye, on either side of it, and not
    // where the leaf is in shade. (In three.js r128 a Lambert material was lit at its corners and this was added to that
    // light there; in r186 it is lit at every point, and the glow is added there, as much as before. `directLight` is
    // the sun as it reaches this point, its shadow taken, lights_fragment_begin: three.js's units are π times the old,
    // hence the RECIPROCAL_PI.)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uGlow;')
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
      #if NUM_DIR_LIGHTS > 0
      {
        vec3 toEye = normalize(vViewPosition);
        float through = pow(max(dot(-toEye, directLight.direction), 0.0), 3.0);
        reflectedLight.directDiffuse += directLight.color * through * uGlow * RECIPROCAL_PI * BRDF_Lambert(diffuseColor.rgb);
      }
      #endif`);
  };
  m.customProgramCacheKey = () => 'pcw-habitation-leaf-2';
  return m;
}
// the shadow a leaf casts: the shape of its leaves, moving with them
function leafDepth(map, alphaTest, amount) {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map, alphaTest });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uWind = wind;
    shader.uniforms.uAmount = { value: amount };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float sway;\nuniform float uWind;\nuniform float uAmount;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      {
        #ifdef USE_INSTANCING
          float seed = (modelMatrix * instanceMatrix[3]).x * 0.37 + (modelMatrix * instanceMatrix[3]).z * 0.23;
        #else
          float seed = modelMatrix[3].x * 0.37 + modelMatrix[3].z * 0.23;
        #endif
        float phase = seed + position.x * 2.1 + position.z * 1.7;
        float gust = 0.55 + 0.45 * sin(uWind * 0.21 + seed * 0.31);
        float flex = sway * sway * uAmount;
        transformed.x += (sin(uWind * 1.35 + phase) + 0.35 * sin(uWind * 3.3 + phase * 2.7)) * flex * gust;
        transformed.z += cos(uWind * 1.1 + phase * 1.3) * flex * 0.8 * gust;
        transformed.y += sin(uWind * 1.9 + phase * 2.2) * flex * 0.45 * gust;
      }`);
  };
  m.customProgramCacheKey = () => 'pcw-habitation-leaf-depth';
  return m;
}

// ---------------------------------------------------------------------------------------------- stone --

// Stone (the habitation's rocks, tools/habitation/rocks.py): its seamless picture painted on from the three ways each
// part of the rock can face, blended where they meet, and its relief the same way, so no rock shows a seam or a
// stretch; `scale` pictures to a model unit. The moss is in its vertex colour.
export function stoneMaterial({ map, normalMap, roughnessMap, scale = 1.6, relief = 1 }) {
  const m = new THREE.MeshStandardMaterial({ map, normalMap, roughnessMap, roughness: 1, metalness: 0, vertexColors: true });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTri = { value: scale };
    shader.uniforms.uRelief = { value: relief };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTriPos;\nvarying vec3 vTriNormal;\nvarying vec3 vTriX;\nvarying vec3 vTriY;\nvarying vec3 vTriZ;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTriPos = position;\nvTriNormal = normal;\nvTriX = normalMatrix * vec3(1.0, 0.0, 0.0);\nvTriY = normalMatrix * vec3(0.0, 1.0, 0.0);\nvTriZ = normalMatrix * vec3(0.0, 0.0, 1.0);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
      varying vec3 vTriPos;
      varying vec3 vTriNormal;
      varying vec3 vTriX;
      varying vec3 vTriY;
      varying vec3 vTriZ;
      uniform float uTri;
      uniform float uRelief;
      vec3 triWeights() { vec3 w = pow(abs(normalize(vTriNormal)), vec3(4.0)); return w / (w.x + w.y + w.z); }
      vec4 triSample(sampler2D t) {
        vec3 w = triWeights();
        return texture2D(t, vTriPos.zy * uTri) * w.x + texture2D(t, vTriPos.xz * uTri) * w.y + texture2D(t, vTriPos.xy * uTri) * w.z;
      }`)
      .replace('#include <map_fragment>', `
      #ifdef USE_MAP
        vec4 texelColor = triSample(map);    /* (an sRGB picture is read as linear light by the graphics card itself) */
        diffuseColor *= texelColor;
      #endif`)
      .replace('#include <roughnessmap_fragment>', `
      float roughnessFactor = roughness;
      #ifdef USE_ROUGHNESSMAP
        roughnessFactor *= triSample(roughnessMap).g;
      #endif`)
      .replace('#include <normal_fragment_maps>', `
      #ifdef USE_NORMALMAP
      {
        /* each side's relief turned onto the way that side faces, blended, and brought into the eye's frame */
        vec3 w = triWeights();
        vec3 sn = sign(vTriNormal);
        vec3 tx = texture2D(normalMap, vTriPos.zy * uTri).xyz * 2.0 - 1.0;
        vec3 ty = texture2D(normalMap, vTriPos.xz * uTri).xyz * 2.0 - 1.0;
        vec3 tz = texture2D(normalMap, vTriPos.xy * uTri).xyz * 2.0 - 1.0;
        vec3 n = normalize(vTriNormal);
        n += uRelief * (w.x * vec3(0.0, tx.y, tx.x) + w.y * vec3(ty.x, 0.0, ty.y) + w.z * vec3(tz.x, tz.y, 0.0));
        n = normalize(n);
        normal = normalize(n.x * vTriX + n.y * vTriY + n.z * vTriZ);
        normal = normal * faceDirection;
      }
      #endif`);
  };
  m.customProgramCacheKey = () => 'pcw-habitation-stone';
  return m;
}

// ---------------------------------------------------------------------------------------------- a model --

// One dressed model: its parts (geometry and material, shared by every copy), and `make()` for a copy.
export async function readDressed(buffer, { lite = false, shared = null } = {}) {
  // (`let`: let go once the model is read. The model's `make` and `dispose` share this function's closure with `picture`,
  // and kept every model's whole file, its pictures' bytes too, for as long as the habitation stood: 13 MB of a phone's
  // page, besides what was made from it; 29 October 2026)
  let { json, bin } = readGLBParts(buffer);
  const pictures = new Map();
  const picture = (index, colour) => { const key = `${index}:${colour}`; if (!pictures.has(key)) pictures.set(key, pictureOf(json, bin, index, colour, shared)); return pictures.get(key); };
  // (every picture it has asked for at once, so that they are decoded together rather than one after another: each
  // answer comes between two frames, and on a slow device a frame is long)
  for (const md of json.materials || []) {
    const pbr = md.pbrMetallicRoughness || {};
    if (pbr.baseColorTexture) picture(pbr.baseColorTexture.index, true).catch(() => {});
    if (md.normalTexture) picture(md.normalTexture.index, false).catch(() => {});
    if (pbr.metallicRoughnessTexture) picture(pbr.metallicRoughnessTexture.index, false).catch(() => {});
  }
  const parts = [];
  const notes = (json.extras && json.extras.dressed) || {};
  for (const node of json.nodes || []) {
    if (node.mesh === undefined) continue;
    for (const p of json.meshes[node.mesh].primitives) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(accessor(json, bin, p.attributes.POSITION), 3));
      if (p.attributes.NORMAL !== undefined) g.setAttribute('normal', new THREE.BufferAttribute(accessor(json, bin, p.attributes.NORMAL), 3));
      if (p.attributes.TEXCOORD_0 !== undefined) g.setAttribute('uv', new THREE.BufferAttribute(accessor(json, bin, p.attributes.TEXCOORD_0), 2));
      if (p.attributes.COLOR_0 !== undefined) g.setAttribute('color', new THREE.BufferAttribute(accessor(json, bin, p.attributes.COLOR_0), json.accessors[p.attributes.COLOR_0].type === 'VEC4' ? 4 : 3));
      g.setAttribute('sway', new THREE.BufferAttribute(p.attributes._SWAY !== undefined ? accessor(json, bin, p.attributes._SWAY) : new Float32Array(g.attributes.position.count), 1));
      if (p.indices !== undefined) g.setIndex(new THREE.BufferAttribute(accessor(json, bin, p.indices, false), 1));
      if (!g.attributes.normal) g.computeVertexNormals();
      g.computeBoundingSphere(); g.computeBoundingBox();
      // (its numbers let go once the graphics card has them: nothing changes them or reads them again; render-kit.js. How
      // far its leaves bend at most is kept: the tests look at it)
      { const a = g.attributes.sway.array; let most = 0; for (let i = 0; i < a.length; i += 1) if (a[i] > most) most = a[i]; g.userData.swayMost = most; }
      letGoOnceSent(g);
      const md = json.materials[p.material || 0] || {}, pbr = md.pbrMetallicRoughness || {};
      const part = (md.extras && md.extras.part) || 'surface';
      let material, depth = null;
      if (part === 'stone') {
        // (on a phone a rock's stone at half its pictures' size: it is laid on in small squares over the rock, and so
        // looks the same, for a quarter of the graphics memory)
        const stone = async (t) => (lite ? halved(t) : t);
        material = stoneMaterial({
          map: pbr.baseColorTexture ? await stone(await picture(pbr.baseColorTexture.index, true)) : null,
          normalMap: md.normalTexture ? await stone(await picture(md.normalTexture.index, false)) : null,
          roughnessMap: pbr.metallicRoughnessTexture ? await stone(await picture(pbr.metallicRoughnessTexture.index, false)) : null,
          scale: (md.extras && md.extras.triplanar) || 1.6,
        });
      } else if (part === 'leaves') {
        const map = pbr.baseColorTexture ? await picture(pbr.baseColorTexture.index, true) : null;
        const amount = (md.extras && md.extras.sway) || 0.035;
        material = leafMaterial({ map, alphaTest: md.alphaCutoff || 0.4, amount });
        depth = leafDepth(map, md.alphaCutoff || 0.4, amount);
      } else {
        material = new THREE.MeshStandardMaterial({ roughness: pbr.roughnessFactor !== undefined ? pbr.roughnessFactor : 0.9, metalness: pbr.metallicFactor || 0, side: md.doubleSided ? THREE.DoubleSide : THREE.FrontSide, vertexColors: !!g.attributes.color });
        if (pbr.baseColorTexture) material.map = await picture(pbr.baseColorTexture.index, true);
        // (a phone draws the relief only up close: its pictures are kept, its cost is the normal map's look-ups)
        if (md.normalTexture) { material.normalMap = await picture(md.normalTexture.index, false); const s = md.normalTexture.scale || 1; material.normalScale.set(s, -s); }
        if (pbr.metallicRoughnessTexture) material.roughnessMap = await picture(pbr.metallicRoughnessTexture.index, false);
        if (md.alphaMode === 'MASK') material.alphaTest = md.alphaCutoff || 0.5;
      }
      parts.push({ geometry: g, material, depth, part });
    }
  }
  const box = new THREE.Box3();
  for (const p of parts) box.union(p.geometry.boundingBox);
  // (the file let go: see above)
  json = null; bin = null; pictures.clear();
  return {
    notes, box, parts,
    make() {
      const group = new THREE.Group();
      for (const p of parts) {
        const mesh = new THREE.Mesh(p.geometry, p.material);
        mesh.castShadow = true; mesh.receiveShadow = true;
        if (p.depth) mesh.customDepthMaterial = p.depth;
        mesh.name = p.part;
        group.add(mesh);
      }
      return group;
    },
    dispose() {
      for (const p of parts) {
        p.geometry.dispose();
        for (const k of ['map', 'normalMap', 'roughnessMap']) if (p.material[k] && !(p.material[k].userData && p.material[k].userData.shared)) p.material[k].dispose();
        p.material.dispose(); if (p.depth) p.depth.dispose();
      }
    },
  };
}
