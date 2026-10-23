"use strict";

__modules["client/habitation-plants.js"] = (function () {

const TYPES = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const WIDTH = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
const MAX = { 5120: 127, 5121: 255, 5122: 32767, 5123: 65535 };

const wind = { value: 0 };
const setHabitationWind = (seconds) => { wind.value = seconds % 3600; };
const habitationWind = () => wind.value;

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
const halvedOnce = new WeakSet();
function halved(t) {
  if (!t || halvedOnce.has(t) || !t.image || !(t.image.width > 16)) return t;
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(t.image.width / 2)); c.height = Math.max(1, Math.round(t.image.height / 2));
  c.getContext('2d').drawImage(t.image, 0, 0, c.width, c.height);
  if (t.image.close) t.image.close();
  t.image = c; t.needsUpdate = true;
  halvedOnce.add(t);
  return t;
}
function decodePicture(blob, { wait = 15000 } = {}) {
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
    createImageBitmap(blob, { imageOrientation: 'none', premultiplyAlpha: 'none' }).then((bitmap) => {
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
  t.flipY = false;
  if (colour) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.needsUpdate = true;
  return t;
}


function leafMaterial({ map, alphaTest = 0.4, amount = 0.035, glow = 0.55 }) {
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


function stoneMaterial({ map, normalMap, roughnessMap, scale = 1.6, relief = 1 }) {
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


async function readDressed(buffer, { lite = false, shared = null } = {}) {
  const { json, bin } = readGLBParts(buffer);
  const pictures = new Map();
  const picture = (index, colour) => { const key = `${index}:${colour}`; if (!pictures.has(key)) pictures.set(key, pictureOf(json, bin, index, colour, shared)); return pictures.get(key); };
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
      const md = json.materials[p.material || 0] || {}, pbr = md.pbrMetallicRoughness || {};
      const part = (md.extras && md.extras.part) || 'surface';
      let material, depth = null;
      if (part === 'stone') {
        const stone = (t) => (lite ? halved(t) : t);
        material = stoneMaterial({
          map: pbr.baseColorTexture ? stone(await picture(pbr.baseColorTexture.index, true)) : null,
          normalMap: md.normalTexture ? stone(await picture(md.normalTexture.index, false)) : null,
          roughnessMap: pbr.metallicRoughnessTexture ? stone(await picture(pbr.metallicRoughnessTexture.index, false)) : null,
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
        if (md.normalTexture) { material.normalMap = await picture(md.normalTexture.index, false); const s = md.normalTexture.scale || 1; material.normalScale.set(s, -s); }
        if (pbr.metallicRoughnessTexture) material.roughnessMap = await picture(pbr.metallicRoughnessTexture.index, false);
        if (md.alphaMode === 'MASK') material.alphaTest = md.alphaCutoff || 0.5;
      }
      parts.push({ geometry: g, material, depth, part });
    }
  }
  const box = new THREE.Box3();
  for (const p of parts) box.union(p.geometry.boundingBox);
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

return { setHabitationWind, habitationWind, decodePicture, leafMaterial, stoneMaterial, readDressed };
})();

__modules["client/render-habitation.js"] = (function () {

const { HABITATION, HABITATION_WATERS, HABITATION_STREAMS, HABITATION_PATHS, HABITATION_GRASS, HABITATION_FALLS, HABITATION_DECKS, HABITATION_HIGHLANDS, HABITATION_BOWLS, HABITATION_PILLARS, UPRIVER, WATER, RIVER_HEAD, RIVER_FAR, riverShore, habitationLand, habitationFooting, habitationWaterAt, habitationNoise, HABITATION_GROUND, HABITATION_GROUND_POINTS, habitationGroundPoint, habitationGroundAt, habitationGroundKind, habitationRailsAt, HABITATION_SWIM_SIGNS, HABITATION_DECK_POSTS, HABITATION_STANDING, HABITATION_MODELS, HABITATION_GATE_SIGN, HABITATION_HOT_RIVER, HOT_RIVER_SIGNS, hotRiverNear, HABITATION_SHIFT, habitationAway } = __modules["sim/zone.js"];
const { linear, grainTexture, rippleNormalTexture, Chunked, Batch, textTexture, buildingKit } = __modules["client/render-kit.js"];
const { addTree } = __modules["client/render-world.js"];
const { Foliage, foliageMaterials } = __modules["client/render-foliage.js"];
const { reflects } = __modules["client/render-finish.js"];
const { LIGHT } = __modules["client/light.js"];
const { readDressed, setHabitationWind, habitationWind, stoneMaterial, decodePicture } = __modules["client/habitation-plants.js"];

const COME = { full: 260, lite: 180 }, GO = { full: 400, lite: 240 };
const NEAR_GROUND = Object.freeze({ come: 60, go: 90 });
const ROAD_COME = 380, ROAD_GO = 480;
const v3 = new THREE.Vector3();


const GROUND = {
  grass: 0x6f8f3a, grassDry: 0x9a9a52, floor: 0x3e3a22, moss: 0x3f5a26, earth: 0x9a5434, mud: 0x4e3a28, stone: 0x8c877c,
  sand: 0xdccaa0, sandWet: 0xb9a57c, bed: 0xc9b98e, silt: 0x2c2a1c, pebbles: 0x8a8070,
  sinter: 0xc9c0a6, rust: 0xa86a3c,
  rock: { mossy: 0x6e6d62, limestone: 0xb5ae9c, granite: 0xa8a097, redstone: 0x9a5c40 },
};
function rockKindAt(x, z) {
  for (const b of HABITATION_BOWLS) if (x > b.bounds.x0 && x < b.bounds.x1 && z > b.bounds.z0 && z < b.bounds.z1) return b.rock;
  const near = (id, far) => { const s = HABITATION_STREAMS.find((q) => q.id === id); if (!s) return false; let best = Infinity; for (const [px, pz] of s.line) best = Math.min(best, Math.hypot(px - x, pz - z)); return best < far; };
  if (near('outflow', 34)) return 'granite';
  if (near('gorge', 30)) return 'mossy';
  for (const g of HABITATION_HIGHLANDS) if (x > g.bounds.x0 && x < g.bounds.x1 && z > g.bounds.z0 && z < g.bounds.z1) return g.rock;
  return 'mossy';
}
function stoneTexture(size = 256) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  const lumps = (x, y, cells, seed) => {
    const fx = (x / size) * cells, fy = (y / size) * cells, i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j;
    const h = (a, b) => habitationNoise(((a % cells) + cells) % cells + seed * 31.7, ((b % cells) + cells) % cells + seed * 17.3);
    const s = (t) => t * t * (3 - 2 * t);
    return h(i, j) * (1 - s(u)) * (1 - s(v)) + h(i + 1, j) * s(u) * (1 - s(v)) + h(i, j + 1) * (1 - s(u)) * s(v) + h(i + 1, j + 1) * s(u) * s(v);
  };
  for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
    const n = lumps(x, y, 4, 1) * 0.45 + lumps(x, y, 11, 2) * 0.3 + lumps(x, y, 32, 3) * 0.17 + lumps(x, y, 90, 4) * 0.08;
    const k = (y * size + x) * 4, v = Math.round(255 * Math.min(1, 0.45 + n * 0.55));
    img.data[k] = v; img.data[k + 1] = Math.round(v * 0.98); img.data[k + 2] = Math.round(v * 0.95); img.data[k + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  g.strokeStyle = 'rgba(40,38,34,0.55)'; g.lineWidth = Math.max(1, size / 256);
  for (let i = 0; i < 9; i += 1) {
    let x = habitationNoise(i * 3.1, 7) * size, y = habitationNoise(i * 5.7, 11) * size, a = habitationNoise(i, 13) * 6.28;
    for (const [ox, oy] of [[0, 0], [size, 0], [-size, 0], [0, size], [0, -size]]) {
      g.beginPath(); let px = x + ox, py = y + oy; g.moveTo(px, py);
      let aa = a;
      for (let k = 0; k < 10; k += 1) { aa += (habitationNoise(i * 9 + k, 3) - 0.5) * 1.2; px += Math.cos(aa) * size / 22; py += Math.sin(aa) * size / 22; g.lineTo(px, py); }
      g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  return t;
}
function pillarGeometry(p, lite) {
  const rings = lite ? 16 : 30, sides = lite ? 16 : 32;
  const pos = [], idx = [];
  const bottom = WATER - 3;
  const islet = p.h < 10;
  for (let i = 0; i <= rings; i += 1) {
    const t = i / rings, y = bottom + (p.h - bottom) * t;
    const u = Math.max(0, (y - WATER) / (p.h - WATER));            // 0 at the water, 1 at the top
    let shape;
    if (islet) shape = y < WATER ? 1.1 : 1.06 * Math.sqrt(Math.max(0.36, 1 - u ** 2.2));
    else {
      shape = y < WATER ? 1.08 + (WATER - y) * 0.04 : 1.04 - 0.16 * u + 0.05 * Math.max(0, 1 - u * 6);
      shape *= 1 + 0.045 * Math.sin(u * 11 + p.x * 0.37) + 0.03 * Math.sin(u * 23 + p.z * 0.11);
      if (u > 0.88) shape *= 0.62 + 0.38 * Math.sqrt(Math.max(0, 1 - ((u - 0.88) / 0.12) ** 2));
    }
    for (let k = 0; k <= sides; k += 1) {
      const a = (k / sides) * Math.PI * 2;
      const flute = habitationNoise(Math.cos(a) * 5.5 + p.x * 0.013, Math.sin(a) * 5.5 + y / 16);
      const bulk = habitationNoise(Math.cos(a) * 1.6 + p.z * 0.01, y / 7 + Math.sin(a) * 1.6);
      const bump = 0.8 + 0.3 * bulk + (islet ? 0.06 : 0.16) * flute;
      const r = p.r * shape * bump;
      pos.push(p.x + Math.cos(a) * r, y, p.z + Math.sin(a) * r);
    }
    if (i > 0) for (let k = 0; k < sides; k += 1) { const a0 = (i - 1) * (sides + 1) + k, b0 = i * (sides + 1) + k; idx.push(a0, b0, a0 + 1, a0 + 1, b0, b0 + 1); }
  }
  const topCentre = pos.length / 3;
  pos.push(p.x, p.h + 0.4, p.z);
  for (let k = 0; k < sides; k += 1) { const a0 = rings * (sides + 1) + k; idx.push(a0, topCentre, a0 + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  const n = pos.length / 3, col = new Float32Array(n * 3), cc = new THREE.Color();
  for (let i = 0; i < n; i += 1) {
    const y = pos[i * 3 + 1], ny = g.attributes.normal.getY(i);
    const px = pos[i * 3], pz = pos[i * 3 + 2], a = Math.atan2(pz - p.z, px - p.x);
    cc.copy(linear(0xd6cfbb)).multiplyScalar(0.85 + 0.25 * habitationNoise(px / 3, y / 3));
    cc.multiplyScalar(0.86 + 0.16 * Math.sin(y * 1.9 + 2.5 * habitationNoise(a * 1.5, y / 9)));
    const streak = habitationNoise(a * 7 + p.x, 0.5) * habitationNoise(a * 13, y / 14);
    if (streak > 0.3) cc.lerp(linear(0x6e6a5e), Math.min(0.55, (streak - 0.3) * 1.6));
    const moss = habitationNoise(px / 2.5 + 7, y / 2.5) * (y > WATER + 1 ? 1 : 0);
    if (moss > 0.58) cc.lerp(linear(0x56703a), Math.min(0.75, (moss - 0.58) * 3));
    if (ny > 0.22 && y > WATER + (p.h < 10 ? 0.8 : 3)) cc.lerp(linear(ny > 0.6 ? 0x3f5f26 : 0x4c6a2c), Math.min(1, (ny - 0.22) * 2.4));
    if (y > WATER - 0.5 && y < WATER + 1.2) cc.multiplyScalar(y < WATER + 0.5 ? 0.62 : 0.62 + 0.38 * (y - WATER - 0.5) / 0.7);
    col[i * 3] = cc.r; col[i * 3 + 1] = cc.g; col[i * 3 + 2] = cc.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
function pillarContact() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(18,40,38,0.75)'); grad.addColorStop(0.42, 'rgba(18,40,38,0.6)'); grad.addColorStop(0.7, 'rgba(20,48,46,0.22)'); grad.addColorStop(1, 'rgba(20,48,46,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  const map = new THREE.CanvasTexture(c);
  const pos = [], uv = [], idx = [];
  for (const p of HABITATION_PILLARS) {
    const r = p.r * 2.1, y = WATER + 0.03, n = pos.length / 3;
    pos.push(p.x - r, y, p.z - r, p.x + r, y, p.z - r, p.x + r, y, p.z + r, p.x - r, y, p.z + r);
    uv.push(0, 0, 1, 0, 1, 1, 0, 1);
    idx.push(n, n + 2, n + 1, n, n + 3, n + 2);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(idx); geometry.computeBoundingSphere();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false }));
  mesh.name = 'pillar-water'; mesh.renderOrder = 3;
  mesh.userData.map = map;
  return mesh;
}
const PAVED = new Set(['overlook-terrace', 'overlook-steps', 'garden']);
function groundData() {
  const G = HABITATION_GROUND, nx = HABITATION_GROUND_POINTS.x, nz = HABITATION_GROUND_POINTS.z, step = G.step;
  const count = nx * nz;
  const heights = new Float32Array(count), tint = new Uint8Array(count * 4), normal = new Int8Array(count * 4);
  for (let j = 0; j < nz; j += 1) for (let i = 0; i < nx; i += 1) heights[j * nx + i] = habitationGroundPoint(i, j);
  const c = new THREE.Color(), t = new THREE.Color();
  const col = (hex) => t.copy(linear(hex));
  const h = (i, j) => heights[Math.max(0, Math.min(nz - 1, j)) * nx + Math.max(0, Math.min(nx - 1, i))];
  for (let j = 0; j < nz; j += 1) {
    for (let i = 0; i < nx; i += 1) {
      const k = j * nx + i, x = G.x0 + i * step, z = G.z0 + j * step, y = heights[k];
      const hx = h(i + 1, j) - h(i - 1, j), hz = h(i, j + 1) - h(i, j - 1);
      const slope = Math.hypot(hx, hz) / (2 * step);
      const nl = Math.hypot(hx / (2 * step), 1, hz / (2 * step));
      normal[k * 4] = Math.round((-hx / (2 * step) / nl) * 127); normal[k * 4 + 1] = Math.round((1 / nl) * 127); normal[k * 4 + 2] = Math.round((-hz / (2 * step) / nl) * 127);
      const f = habitationGroundKind(x, z);
      const rails = habitationRailsAt(x, z);
      const n1 = habitationNoise(x / 7, z / 7), n2 = habitationNoise(x / 23 + 40, z / 23);
      const kind = rails && rails.kind === 'stairs' && f && f.walk ? 'cutting' : f ? f.kind : 'forest';
      let paved = 0;
      if (kind === 'path') {
        if (f.surface === 'stone' && PAVED.has(f.path)) paved = 1;
        c.copy(linear(f.surface === 'mud' ? GROUND.mud : f.surface === 'stone' ? GROUND.stone : f.surface === 'sand' ? GROUND.sand : GROUND.earth));
        c.multiplyScalar(0.9 + 0.2 * n1);
        if (f.surface === 'mud' && n2 > 0.62) c.lerp(col(0x2a2a20), 0.5);          // (puddles: dark, wet)
      } else if (kind === 'cutting') {
        c.copy(linear(GROUND.stone)).lerp(col(GROUND.earth), 0.25 * n2).multiplyScalar(0.82 + 0.2 * n1);
      } else if (kind === 'sand') {
        c.copy(linear(GROUND.sand)).multiplyScalar(0.94 + 0.12 * n1);
      } else if (kind === 'grass') {
        c.copy(linear(GROUND.grass)).lerp(col(GROUND.grassDry), Math.max(0, n2 - 0.45) * 1.2).multiplyScalar(0.9 + 0.2 * n1);
      } else if (kind === 'shallows' || kind === 'water') {
        const w = habitationWaterAt(x, z);
        const bed = w && w.kind === 'swamp' ? GROUND.silt : w && (w.kind === 'stream' || w.kind === 'rapids') ? GROUND.pebbles : GROUND.bed;
        c.copy(linear(bed)).multiplyScalar(0.9 + 0.2 * n1);
      } else if (kind === 'hot') {
        c.copy(linear(GROUND.sinter)).lerp(col(GROUND.rust), Math.max(0, n2 - 0.5) * 1.4).multiplyScalar(0.85 + 0.25 * n1);
      } else {
        c.copy(linear(GROUND.floor)).lerp(col(GROUND.moss), n2 * 0.7).lerp(col(GROUND.grass), Math.max(0, n1 - 0.6) * 0.8).multiplyScalar(0.85 + 0.3 * n1);
      }
      if (kind === 'sand' && y < WATER + 0.25) c.lerp(col(GROUND.sandWet), 0.6);
      if (kind !== 'hot') { const hr = hotRiverNear(x, z); if (hr.d < 6) c.lerp(col(GROUND.sinter), (1 - hr.d / 6) * 0.85).lerp(col(GROUND.rust), Math.max(0, n2 - 0.62) * (1 - hr.d / 6)); }
      const rock = Math.max(0, Math.min(1, (slope - 0.75) / 0.5));
      if (rock > 0) {
        const kindOfRock = rockKindAt(x, z);
        t.copy(linear(GROUND.rock[kindOfRock])).multiplyScalar(0.86 + 0.14 * (0.5 + 0.5 * Math.sin(y * (kindOfRock === 'redstone' ? 3.1 : 1.7) + 3 * habitationNoise(x / 25, z / 25))));
        t.multiplyScalar(0.78 + 0.3 * habitationNoise(x / 6 + 11, z / 6 - 7));
        const moss = habitationNoise(x / 5 + 3, z / 5 + y / 4);
        const cling = Math.max(0, Math.min(1, Math.max(0, (moss - 0.45) / 0.2) * 0.9 + (1 - rock) * 0.8));
        t.lerp(linear(moss > 0.62 ? 0x35521f : 0x4d6a2e), Math.min(0.85, cling));
        c.lerp(t, rock);
      }
      c.convertLinearToSRGB();
      tint[k * 4] = Math.round(Math.max(0, Math.min(1, c.r)) * 255); tint[k * 4 + 1] = Math.round(Math.max(0, Math.min(1, c.g)) * 255); tint[k * 4 + 2] = Math.round(Math.max(0, Math.min(1, c.b)) * 255);
      tint[k * 4 + 3] = (paved ? 128 : 0) + Math.round(rock * 127);
    }
  }
  return { nx, nz, step, x0: G.x0, z0: G.z0, heights, tint, normal };
}
function groundPieces(data, every, material) {
  const nx = Math.floor((data.nx - 1) / every) + 1, nz = Math.floor((data.nz - 1) / every) + 1;
  const rows = Math.floor(65535 / nx);
  const group = new THREE.Group(); group.name = 'habitation-ground';
  group.userData.every = every;
  for (let r0 = 0; r0 < nz - 1; r0 += rows - 1) {
    const r1 = Math.min(nz - 1, r0 + rows - 1), n = (r1 - r0 + 1) * nx;
    const position = new Float32Array(n * 3), tint = new Uint8Array(n * 4), normal = new Int8Array(n * 4);
    for (let r = r0; r <= r1; r += 1) for (let i = 0; i < nx; i += 1) {
      const k = (r - r0) * nx + i, src = r * every * data.nx + i * every;
      position[k * 3] = data.x0 + i * every * data.step; position[k * 3 + 1] = data.heights[src]; position[k * 3 + 2] = data.z0 + r * every * data.step;
      for (let q = 0; q < 4; q += 1) { tint[k * 4 + q] = data.tint[src * 4 + q]; normal[k * 4 + q] = data.normal[src * 4 + q]; }
    }
    const index = new Uint16Array((r1 - r0) * (nx - 1) * 6);
    let m = 0;
    for (let r = 0; r < r1 - r0; r += 1) for (let i = 0; i + 1 < nx; i += 1) {
      const a = r * nx + i, b2 = a + 1, c2 = a + nx, d = c2 + 1;
      index[m++] = a; index[m++] = c2; index[m++] = b2; index[m++] = b2; index[m++] = c2; index[m++] = d;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(position, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(normal, 4, true));
    g.setAttribute('tint', new THREE.BufferAttribute(tint, 4, true));
    g.setIndex(new THREE.BufferAttribute(index, 1));
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, material);
    mesh.name = 'habitation-ground'; mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}
function groundMaterial({ grain, stone, lite }) {
  const m = new THREE.MeshStandardMaterial({ map: grain, roughness: 1, metalness: 0 });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uStone = { value: stone };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 tint;\nvarying vec3 vTint;\nvarying float vRocky;\nvarying float vPaved;\nvarying vec3 vWorld;\nvarying vec3 vWorldNormal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTint = mix(tint.rgb / 12.92, pow((tint.rgb + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), tint.rgb));\nfloat packed = floor(tint.a * 255.0 + 0.5);\nvPaved = step(127.5, packed);\nvRocky = (packed - 128.0 * vPaved) / 127.0;\nvWorld = (modelMatrix * vec4(position, 1.0)).xyz;\nvWorldNormal = normal;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv = (modelMatrix * vec4(position, 1.0)).xz / 2.6;\n#endif');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uStone;\nvarying vec3 vTint;\nvarying float vRocky;\nvarying float vPaved;\nvarying vec3 vWorld;\nvarying vec3 vWorldNormal;\nfloat paveHash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }')
      .replace('#include <color_fragment>', 'diffuseColor.rgb *= vTint;')
      .replace('#include <map_fragment>', `
      #ifdef USE_MAP
        vec4 texelColor = texture2D(map, vMapUv);    /* (sRGB pictures are read as linear light by the graphics card) */
        ${lite ? '' : `
        if (vRocky > 0.01) {
          vec3 w = pow(abs(normalize(vWorldNormal)), vec3(4.0)); w /= (w.x + w.y + w.z);
          vec4 s = texture2D(uStone, vWorld.zy / 4.0) * w.x + texture2D(uStone, vWorld.xz / 4.0) * w.y + texture2D(uStone, vWorld.xy / 4.0) * w.z;
          texelColor = mix(texelColor, s * 1.25, vRocky);
        }`}
        diffuseColor *= texelColor;
        /* paving: flat stones laid in rows, each its own shade, the joints between them dark */
        if (vPaved > 0.01) {
          vec2 q = vWorld.xz / vec2(0.85, 0.6);
          q.x += 0.5 * mod(floor(q.y), 2.0);
          vec2 cellId = floor(q), f = fract(q);
          float joint = smoothstep(0.0, 0.07, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)));
          float shade = 0.82 + 0.3 * paveHash(cellId);
          diffuseColor.rgb *= mix(1.0, mix(0.45, shade, joint), vPaved);
        }
        /* bare rock: its beds faintly, and the streaks where water runs down it, dark and long (the stone's own grain,
           drawn out downward, on whichever way the face looks) */
        diffuseColor.rgb *= mix(1.0, 0.88 + 0.14 * (0.5 + 0.5 * sin(vWorld.y * 2.7 + 2.0 * sin(vWorld.x * 0.13 + vWorld.z * 0.09))), vRocky);
        ${lite ? '' : `
        if (vRocky > 0.01) {
          vec3 wn = abs(normalize(vWorldNormal));
          float u = (vWorld.z * wn.x + vWorld.x * wn.z) / max(0.001, wn.x + wn.z);
          float s = 0.5 + 0.5 * sin(u * 1.9 + 2.3 * sin(u * 0.37) + 0.8 * sin(vWorld.y * 0.15 + u * 0.11));
          float fade = 0.5 + 0.5 * sin(vWorld.y * 0.21 + u * 0.05);
          diffuseColor.rgb *= 1.0 - 0.45 * pow(s, 6.0) * fade * vRocky * smoothstep(0.3, 0.8, 1.0 - wn.y);
        }`}
      #endif`);
  };
  m.customProgramCacheKey = () => `pcw-habitation-ground-${lite ? 'lite' : 'full'}`;
  return m;
}


const WATER_LOOK = {
  lagoon: { shallow: 0x9fe3d4, deep: 0x0f7f8f, deeper: 0x0b4f6a, deepAt: 2.6, clear: 0.18, still: 0.55 },
  pool: { shallow: 0x9fd8bf, deep: 0x1f7f6a, deeper: 0x16524a, deepAt: 2.0, clear: 0.22, still: 0.5 },
  pond: { shallow: 0x6f9a74, deep: 0x2c5240, deeper: 0x1c3a2e, deepAt: 0.7, clear: 0.45, still: 0.2 },
  swamp: { shallow: 0x3f4628, deep: 0x2c331e, deeper: 0x1e2416, deepAt: 0.6, clear: 0.8, still: 0.15 },
  stream: { shallow: 0x9cc4b0, deep: 0x3f8a76, deeper: 0x2b6656, deepAt: 0.7, clear: 0.2, still: 1, most: 0.72 },
  rapids: { shallow: 0xd6efea, deep: 0x5aa69a, deeper: 0x3a7a70, deepAt: 0.8, clear: 0.35, still: 1.4 },
};
const waterClock = { value: 0 };
function waterMaterial(kind, { ripples, lite }) {
  const look = WATER_LOOK[kind];
  const still = kind === 'swamp' || kind === 'pond';
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: still ? 0.22 : 0.1, metalness: 0.0, transparent: true, depthWrite: false, normalMap: ripples, normalScale: new THREE.Vector2(still ? 0.1 : 0.35, still ? 0.1 : 0.35) });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = waterClock;
    shader.uniforms.uShallow = { value: linear(look.shallow) };
    shader.uniforms.uDeep = { value: linear(look.deep) };
    shader.uniforms.uDeeper = { value: linear(look.deeper) };
    shader.uniforms.uDeepAt = { value: look.deepAt };
    shader.uniforms.uClear = { value: look.clear };
    shader.uniforms.uMost = { value: look.most || 0.94 };
    shader.uniforms.uStill = { value: look.still };
    shader.uniforms.uRiver = { value: linear(0x7d8a62) };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float depth;\nattribute float rush;\nattribute vec2 flow;\nvarying float vDepth;\nvarying float vRush;\nvarying vec2 vFlow;\nvarying vec3 vWorldPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvDepth = depth;\nvRush = rush;\nvFlow = flow;\nvWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
      uniform float uTime; uniform vec3 uShallow; uniform vec3 uDeep; uniform vec3 uDeeper; uniform float uDeepAt; uniform float uClear; uniform float uMost; uniform float uStill; uniform vec3 uRiver;
      varying float vDepth; varying float vRush; varying vec2 vFlow; varying vec3 vWorldPos;
      float wn(vec2 p) { return fract(sin(dot(floor(p), vec2(12.9898, 78.233))) * 43758.5453); }
      float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f); return mix(mix(wn(i), wn(i + vec2(1.0, 0.0)), u.x), mix(wn(i + vec2(0.0, 1.0)), wn(i + vec2(1.0, 1.0)), u.x), u.y); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
      {
        float d = clamp(vDepth / uDeepAt, 0.0, 1.0);
        vec3 c = mix(uShallow, uDeep, smoothstep(0.0, 0.55, d));
        c = mix(c, uDeeper, smoothstep(0.55, 1.0, d));
        /* (where the lagoon meets the river it takes the river's own colour) */
        c = mix(c, uRiver, smoothstep(${(RIVER_HEAD + 42).toFixed(1)}, ${(RIVER_HEAD + 2).toFixed(1)}, vWorldPos.x) * step(${(RIVER_HEAD - 6).toFixed(1)}, vWorldPos.x) * step(vWorldPos.z, 305.0) * step(140.0, vWorldPos.z));
        diffuseColor.rgb = c;
        /* see-through where shallow, more and more solid where deep */
        diffuseColor.a = mix(uClear, uMost, smoothstep(0.0, 1.0, pow(d, 0.7)));
        /* and wherever it can be waded (up to 0.55 m), never more than half solid: a walker's legs are seen in it, faintly
           (22 October 2026, the owner: "players' feet must be seen always, except in water: there, at low opacity") */
        diffuseColor.a = min(diffuseColor.a, mix(0.5, 1.0, smoothstep(0.55, 0.9, vDepth)));
        /* foam: a broken line where it meets the shore, and in a stream wherever it rushes */
        float edge = 1.0 - smoothstep(0.0, 0.12, vDepth);
        float n = vnoise(vWorldPos.xz * 1.7 + vec2(uTime * 0.3, uTime * 0.2)) * vnoise(vWorldPos.xz * 4.1 - vec2(uTime * 0.5, 0.0));
        float rushFoam = vRush * smoothstep(0.25, 0.7, vnoise(vWorldPos.xz * 0.9 + vFlow * uTime * 1.6) + 0.3 * vnoise(vWorldPos.xz * 3.0 + vFlow * uTime * 2.4));
        float foam = clamp(edge * smoothstep(0.35, 0.7, n) * 1.4 + rushFoam, 0.0, 1.0);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92, 0.95, 0.95), foam * 0.85);
        diffuseColor.a = max(diffuseColor.a, foam * 0.9);
      }`)
      .replace('#include <normal_fragment_maps>', `
      #ifdef USE_NORMALMAP
      {
        /* two sets of ripples, each drifting its own way (downstream in a stream), the still swamp hardly moving */
        vec2 drift = (length(vFlow) > 0.01 ? vFlow : vec2(0.7, 0.4)) * uTime * 0.05 * uStill;
        vec3 n1 = texture2D(normalMap, vWorldPos.xz / 9.0 + drift).xyz * 2.0 - 1.0;
        vec3 n2 = texture2D(normalMap, vWorldPos.zx / 4.3 - drift * 1.7 + vec2(0.37, 0.11)).xyz * 2.0 - 1.0;
        vec3 mapN = normalize(vec3((n1.xy + n2.xy) * normalScale * (0.6 + vRush), 1.0));
        normal = normalize(tbn * mapN);
      }
      #endif`);
  };
  m.customProgramCacheKey = () => `pcw-habitation-water-${kind}-${lite ? 'lite' : 'full'}`;
  return reflects(m, still ? 0.12 : 0.55);
}
function lilyTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  grad.addColorStop(0, '#6f9a3c'); grad.addColorStop(0.75, '#4d7a2a'); grad.addColorStop(1, '#2f5419');
  g.fillStyle = grad;
  g.beginPath(); g.moveTo(64, 64); g.arc(64, 64, 62, 0.22, Math.PI * 2 - 0.22); g.closePath(); g.fill();
  g.strokeStyle = 'rgba(30,55,16,0.45)'; g.lineWidth = 1.2;
  for (let a = 0.4; a < Math.PI * 2 - 0.3; a += 0.42) { g.beginPath(); g.moveTo(64, 64); g.lineTo(64 + Math.cos(a) * 58, 64 + Math.sin(a) * 58); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function buildLilies(lite) {
  const pads = [], flowers = [];
  const deckNear = (x, z) => HABITATION_DECKS.some((d) => {
    for (let i = 0; i + 1 < d.line.length; i += 1) {
      const [ax, az] = d.line[i], [bx, bz] = d.line[i + 1], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
      if (Math.hypot(ax + dx * t - x, az + dz * t - z) < d.width / 2 + 1.4) return true;
    }
    return false;
  });
  for (const [id, want] of [['swamp', lite ? 240 : 520], ['garden-pool', lite ? 14 : 26]]) {
    const w = HABITATION_WATERS.find((q) => q.id === id);
    if (!w) continue;
    let n = 0;
    for (let k = 0; k < want * 12 && n < want; k += 1) {
      const x = w.bounds.x0 + habitationNoise(k * 1.31 + 0.2, 7.7) * (w.bounds.x1 - w.bounds.x0);
      const z = w.bounds.z0 + habitationNoise(k * 0.77 + 0.6, 3.3) * (w.bounds.z1 - w.bounds.z0);
      const at = habitationWaterAt(x, z);
      if (!at || at.id !== id || at.depth < 0.12 || deckNear(x, z)) continue;
      if (habitationNoise(x / 9 + 4, z / 9) < 0.42) continue;
      const r = 0.32 + habitationNoise(x * 3.1, z * 2.7) * 0.42;
      pads.push([x, at.level + 0.012, z, r, habitationNoise(x * 7.3, z * 5.1) * Math.PI * 2]);
      if (habitationNoise(x * 4.1 + 2, z * 3.9) > 0.86) flowers.push([x + r * 0.2, at.level + 0.06, z - r * 0.15, habitationNoise(x, z * 9.1) > 0.5]);
      n += 1;
    }
  }
  const map = lilyTexture();
  const disc = new THREE.CircleGeometry(1, 12); disc.rotateX(-Math.PI / 2);
  const padMat = new THREE.MeshStandardMaterial({ map, alphaTest: 0.5, roughness: 0.55, metalness: 0, side: THREE.DoubleSide });
  const padMesh = new THREE.InstancedMesh(disc, padMat, Math.max(1, pads.length));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  pads.forEach(([x, y, z, r, turn], i) => { q.setFromAxisAngle(up, turn); m4.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(r, 1, r)); padMesh.setMatrixAt(i, m4); });
  padMesh.count = pads.length; padMesh.name = 'lilies'; padMesh.receiveShadow = true;
  const cup = new THREE.ConeGeometry(0.11, 0.09, 7, 1, true); cup.rotateX(Math.PI);
  const flowerMat = new THREE.MeshStandardMaterial({ vertexColors: false, color: 0xffffff, roughness: 0.5, metalness: 0, side: THREE.DoubleSide });
  const flowerMesh = new THREE.InstancedMesh(cup, flowerMat, Math.max(1, flowers.length));
  const pink = new THREE.Color(0xf2a6c4), white = new THREE.Color(0xf6f2ea);
  flowers.forEach(([x, y, z, isPink], i) => { m4.makeTranslation(x, y, z); flowerMesh.setMatrixAt(i, m4); flowerMesh.setColorAt(i, isPink ? pink : white); });
  flowerMesh.count = flowers.length; flowerMesh.name = 'lily-flowers';
  return { meshes: [padMesh, flowerMesh], pads: pads.length, flowers: flowers.length, dispose() { disc.dispose(); cup.dispose(); padMat.dispose(); flowerMat.dispose(); map.dispose(); } };          // (the meshes' own buffers go with the group: letGo)
}

function buildStill(w, step) {
  const b = w.bounds;
  const nx = Math.ceil((b.x1 - b.x0) / step) + 1, nz = Math.ceil((b.z1 - b.z0) / step) + 1;
  const pos = [], depth = [], keep = new Int32Array(nx * nz).fill(-1), idx = [];
  const ground = (x, z) => habitationGroundAt(x, z);
  const wet = new Uint8Array(nx * nz);
  for (let j = 0; j < nz; j += 1) for (let i = 0; i < nx; i += 1) {
    const x = b.x0 + i * step, z = b.z0 + j * step;
    const g = ground(x, z);
    const here = habitationWaterAt(x, z);
    wet[j * nx + i] = (here && here.id === w.id) || (g < w.level + 0.05 && insideOutline(w, x, z, step * 1.5)) ? 1 : 0;
  }
  for (let j = 0; j + 1 < nz; j += 1) for (let i = 0; i + 1 < nx; i += 1) {
    const a = j * nx + i, b1 = a + 1, c = a + nx, d = c + 1;
    if (!(wet[a] || wet[b1] || wet[c] || wet[d])) continue;
    for (const k of [a, b1, c, d]) if (keep[k] < 0) {
      const ii = k % nx, jj = Math.floor(k / nx), x = b.x0 + ii * step, z = b.z0 + jj * step;
      keep[k] = pos.length / 3; pos.push(x, w.level, z); depth.push(Math.max(0, w.level - ground(x, z)));
    }
    idx.push(keep[a], keep[c], keep[b1], keep[b1], keep[c], keep[d]);
  }
  return waterGeometry(pos, depth, idx, null, null);
}
const insideOutline = (w, x, z, pad) => {
  const b = w.bounds;
  return x > b.x0 - pad && x < b.x1 + pad && z > b.z0 - pad && z < b.z1 + pad;
};
function waterGeometry(pos, depth, idx, rush, flow) {
  const g = new THREE.BufferGeometry();
  const n = pos.length / 3;
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(n * 3).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2).map((_, i) => (i % 2 ? pos[Math.floor(i / 2) * 3 + 2] : pos[Math.floor(i / 2) * 3]) / 9), 2));
  g.setAttribute('depth', new THREE.Float32BufferAttribute(depth, 1));
  g.setAttribute('rush', new THREE.Float32BufferAttribute(rush || new Float32Array(n), 1));
  g.setAttribute('flow', new THREE.Float32BufferAttribute(flow || new Float32Array(n * 2), 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}
function buildStream(s, step = 1.5) {
  const pos = [], depth = [], rush = [], flow = [], idx = [];
  const L = s.length, n = Math.max(2, Math.ceil(L / step));
  let prev = null;
  for (let k = 0; k <= n; k += 1) {
    const at = (k / n) * L;
    let run = 0, seg = 0, t = 0;
    for (let i = 0; i + 1 < s.line.length; i += 1) {
      const len = Math.hypot(s.line[i + 1][0] - s.line[i][0], s.line[i + 1][1] - s.line[i][1]);
      if (run + len >= at || i === s.line.length - 2) { seg = i; t = Math.min(1, (at - run) / (len || 1)); break; }
      run += len;
    }
    const [ax, az] = s.line[seg], [bx, bz] = s.line[seg + 1];
    const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
    const dx = bx - ax, dz = bz - az, dl = Math.hypot(dx, dz) || 1;
    const level = s.heights[seg] + ((s.heights[seg + 1] !== undefined ? s.heights[seg + 1] : s.heights[seg]) - s.heights[seg]) * t;
    const drop = prev === null ? 0 : Math.max(0, prev - level) / step;
    prev = level;
    const half = s.width / 2 + 0.6, sx = -dz / dl, sz = dx / dl;
    const r = Math.min(1, drop * 3 + (s.rapids ? 0.55 : 0.12));
    for (const side of [-1, 0, 1]) {
      const px = x + sx * half * side, pz = z + sz * half * side;
      pos.push(px, level + 0.02, pz);
      depth.push(Math.max(0.02, level - habitationGroundAt(px, pz)));
      rush.push(side === 0 ? r : r * 0.6);
      flow.push(dx / dl, dz / dl);
    }
    if (k > 0) {
      const a = (k - 1) * 3, b2 = k * 3;
      idx.push(a, a + 1, b2, a + 1, b2 + 1, b2, a + 1, a + 2, b2 + 1, a + 2, b2 + 2, b2 + 1);
    }
  }
  return waterGeometry(pos, depth, idx, rush, flow);
}


const HOT_LOOK = { shallow: 0xc9d2c0, deep: 0x8ea596, deeper: 0x6f8c80, froth: 0xf2f0e6 };
function hotWaterMaterial(ripples, lite) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.16, metalness: 0, transparent: true, depthWrite: false, normalMap: ripples, normalScale: new THREE.Vector2(0.75, 0.75) });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = waterClock;
    shader.uniforms.uShallow = { value: linear(HOT_LOOK.shallow) };
    shader.uniforms.uDeep = { value: linear(HOT_LOOK.deep) };
    shader.uniforms.uDeeper = { value: linear(HOT_LOOK.deeper) };
    shader.uniforms.uFroth = { value: linear(HOT_LOOK.froth) };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float depth;\nvarying float vDepth;\nvarying vec3 vWorldPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvDepth = depth;\nvWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
      uniform float uTime; uniform vec3 uShallow; uniform vec3 uDeep; uniform vec3 uDeeper; uniform vec3 uFroth;
      varying float vDepth; varying vec3 vWorldPos;
      vec2 h2(vec2 p) { return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453); }
      float hn(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f); return mix(mix(h2(i).x, h2(i + vec2(1.0, 0.0)).x, u.x), mix(h2(i + vec2(0.0, 1.0)).x, h2(i + vec2(1.0, 1.0)).x, u.x), u.y); }
      /* the bubbles in one size: in each cell one, rising at its own time: a dome swelling, then a ring as it bursts */
      vec2 boil(vec2 p, float t) {
        vec2 i = floor(p), f = fract(p);
        float dome = 0.0, ring = 0.0;
        for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
          vec2 g = vec2(float(x), float(y));
          vec2 h = h2(i + g);
          vec2 c = g + 0.15 + 0.7 * h - f;
          float life = fract(t * (0.55 + 0.9 * h.x) + h.y * 7.0);
          float d = length(c);
          /* swelling for most of its life, bursting at the end into a ring that spreads and fades */
          float r = 0.06 + 0.22 * smoothstep(0.0, 0.8, life);
          dome = max(dome, smoothstep(r, r * 0.35, d) * smoothstep(0.0, 0.3, life) * (1.0 - smoothstep(0.78, 0.82, life)));
          float burst = smoothstep(0.8, 1.0, life);
          float rr = r + 0.3 * burst;
          ring = max(ring, smoothstep(0.045, 0.0, abs(d - rr)) * (1.0 - burst) * step(0.8, life));
        }
        return vec2(dome, ring);
      }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
      {
        float d = clamp(vDepth / 1.4, 0.0, 1.0);
        vec3 c = mix(uShallow, uDeep, smoothstep(0.0, 0.6, d));
        c = mix(c, uDeeper, smoothstep(0.6, 1.0, d));
        /* the surface heaving: lighter where it swells up, in slow patches moving every way */
        float heave = hn(vWorldPos.xz * 0.35 + vec2(uTime * 0.21, -uTime * 0.17)) * hn(vWorldPos.xz * 0.9 - vec2(uTime * 0.33, uTime * 0.12));
        c = mix(c, uShallow * 1.08, smoothstep(0.25, 0.6, heave) * 0.5);
        /* bubbles everywhere, two sizes, rising and bursting */
        vec2 big = boil(vWorldPos.xz * 0.55, uTime * 0.9);
        vec2 small = boil(vWorldPos.xz * 1.6 + 13.0, uTime * 1.3);
        float bubbles = max(big.x * 0.7, small.x * 0.55);
        float rings = max(big.y, small.y * 0.8);
        c = mix(c, uFroth, clamp(bubbles * 0.55 + rings * 0.9, 0.0, 1.0));
        /* a scum of froth along its edges */
        float edge = 1.0 - smoothstep(0.0, 0.25, vDepth);
        float scum = edge * smoothstep(0.3, 0.65, hn(vWorldPos.xz * 1.9 + vec2(uTime * 0.15, 0.0)));
        c = mix(c, uFroth, clamp(scum * 1.2, 0.0, 1.0) * 0.8);
        diffuseColor.rgb = c;
        diffuseColor.a = mix(0.82, 0.96, d) ;
      }`)
      .replace('#include <normal_fragment_maps>', `
      #ifdef USE_NORMALMAP
      {
        /* churned every way at once: two sets of ripples running fast against each other, and the bubbles' domes */
        vec2 drift = vec2(uTime * 0.11, uTime * 0.07);
        vec3 n1 = texture2D(normalMap, vWorldPos.xz / 5.0 + drift).xyz * 2.0 - 1.0;
        vec3 n2 = texture2D(normalMap, vWorldPos.zx / 2.3 - drift * 1.9 + vec2(0.37, 0.11)).xyz * 2.0 - 1.0;
        vec3 mapN = normalize(vec3((n1.xy + n2.xy) * normalScale, 1.0));
        normal = normalize(tbn * mapN);
      }
      #endif`);
  };
  m.customProgramCacheKey = () => `pcw-habitation-hot-${lite ? 'lite' : 'full'}`;
  return reflects(m, 0.25);
}
function buildHotRiver(step) {
  const s = HABITATION_HOT_RIVER;
  const pos = [], depth = [], idx = [];
  const L = s.length, n = Math.max(2, Math.ceil(L / step));
  for (let k = 0; k <= n; k += 1) {
    const at = (k / n) * L;
    let run = 0, seg = 0, t = 0;
    for (let i = 0; i + 1 < s.line.length; i += 1) {
      const len = Math.hypot(s.line[i + 1][0] - s.line[i][0], s.line[i + 1][1] - s.line[i][1]);
      if (run + len >= at || i === s.line.length - 2) { seg = i; t = Math.min(1, (at - run) / (len || 1)); break; }
      run += len;
    }
    const [ax, az] = s.line[seg], [bx, bz] = s.line[seg + 1];
    const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
    const dx = bx - ax, dz = bz - az, dl = Math.hypot(dx, dz) || 1;
    const level = s.heights[seg] + ((s.heights[seg + 1] !== undefined ? s.heights[seg + 1] : s.heights[seg]) - s.heights[seg]) * t;
    const half = s.width / 2 + 0.8, sx = -dz / dl, sz = dx / dl;
    for (const side of [-1, -0.5, 0, 0.5, 1]) {
      const px = x + sx * half * side, pz = z + sz * half * side;
      pos.push(px, level + 0.02, pz);
      depth.push(Math.max(0.02, level - habitationGroundAt(px, pz)));
    }
    if (k > 0) {
      const a = (k - 1) * 5, b2 = k * 5;
      for (let q = 0; q < 4; q += 1) idx.push(a + q, a + q + 1, b2 + q, a + q + 1, b2 + q + 1, b2 + q);
    }
  }
  return waterGeometry(pos, depth, idx, null, null);
}
function steamTexture(size) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
    const u = (x + 0.5) / size * 2 - 1, v = (y + 0.5) / size * 2 - 1, r = Math.hypot(u, v);
    const n = habitationNoise(x / size * 6 + 3, y / size * 6) * 0.6 + habitationNoise(x / size * 14, y / size * 14 + 9) * 0.4;
    const a = Math.max(0, 1 - r / (0.62 + 0.38 * n)) ** 1.6;
    const k = (y * size + x) * 4;
    img.data[k] = img.data[k + 1] = img.data[k + 2] = 255; img.data[k + 3] = Math.round(255 * a);
  }
  g.putImageData(img, 0, 0);
  return new THREE.CanvasTexture(c);
}
function hotRiverAt(d) {
  const s = HABITATION_HOT_RIVER;
  let run = 0;
  for (let i = 0; i + 1 < s.line.length; i += 1) {
    const [ax, az] = s.line[i], [bx, bz] = s.line[i + 1], len = Math.hypot(bx - ax, bz - az);
    if (run + len >= d || i + 2 === s.line.length) {
      const t = Math.min(1, Math.max(0, (d - run) / (len || 1)));
      const level = s.heights[i] + ((s.heights[i + 1] !== undefined ? s.heights[i + 1] : s.heights[i]) - s.heights[i]) * t;
      return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, y: level, sx: -(bz - az) / len, sz: (bx - ax) / len };
    }
    run += len;
  }
  return null;
}
function hotSteam(lite) {
  const COUNT = lite ? 130 : 280, REACH = lite ? 110 : 150;
  const s = HABITATION_HOT_RIVER;
  const spots = [];
  for (let d = 0; d < s.length; d += 2.5) spots.push(hotRiverAt(d));
  const plane = new THREE.PlaneGeometry(1, 1);
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.index = plane.index;
  geometry.setAttribute('position', plane.attributes.position);
  geometry.setAttribute('uv', plane.attributes.uv);
  const base = new Float32Array(COUNT * 3), seed = new Float32Array(COUNT * 2);
  for (let i = 0; i < COUNT; i += 1) { seed[i * 2] = habitationNoise(i * 1.7 + 0.3, 2.1); seed[i * 2 + 1] = habitationNoise(i * 0.9 + 5.2, 7.7); base[i * 3 + 1] = -1000; }
  geometry.setAttribute('aBase', new THREE.InstancedBufferAttribute(base, 3));
  geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 2));
  geometry.instanceCount = COUNT;
  const map = steamTexture(lite ? 64 : 128);
  const material = new THREE.ShaderMaterial({
    uniforms: { uTime: waterClock, uMap: { value: map }, uLight: { value: new THREE.Color(1, 1, 1) }, uWind: { value: new THREE.Vector2(0.8, 0.3) }, fogColor: { value: new THREE.Color() }, fogNear: { value: 1 }, fogFar: { value: 1000 } },
    vertexShader: `
      uniform float uTime; uniform vec2 uWind;
      attribute vec3 aBase; attribute vec2 aSeed;
      varying vec2 vUv; varying float vAlpha; varying float vFogDepth;
      void main() {
        float span = 4.0 + 4.0 * aSeed.y;
        float life = fract(uTime / span + aSeed.x * 13.0);
        /* up from the water, slowing as it goes, drifting with the air; swelling as it rises */
        float up = (3.5 + 5.5 * aSeed.y) * sqrt(life);
        vec3 c = aBase + vec3(uWind.x * life * 3.5, up, uWind.y * life * 3.5);
        float size = (2.0 + 5.5 * life) * (0.75 + 0.5 * aSeed.x);
        vec4 mv = modelViewMatrix * vec4(c, 1.0);
        mv.xy += position.xy * size;
        gl_Position = projectionMatrix * mv;
        vUv = uv;
        vAlpha = smoothstep(0.0, 0.15, life) * (1.0 - smoothstep(0.5, 1.0, life)) * 0.62;
        vFogDepth = -mv.z;
      }`,
    fragmentShader: `
      uniform sampler2D uMap; uniform vec3 uLight; uniform vec3 fogColor; uniform float fogNear; uniform float fogFar;
      varying vec2 vUv; varying float vAlpha; varying float vFogDepth;
      void main() {
        float a = texture2D(uMap, vUv).a * vAlpha;
        if (a < 0.01) discard;
        vec3 c = mix(uLight, fogColor, smoothstep(fogNear, fogFar, vFogDepth));
        gl_FragColor = vec4(c, a);
      }`,
    transparent: true, depthWrite: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'hot-steam'; mesh.frustumCulled = false; mesh.renderOrder = 4;
  const curtain = steamCurtain(lite, material.uniforms);
  mesh.add(curtain);
  let lastX = Infinity, lastZ = Infinity, near = 0;
  const pick = (k) => habitationNoise(k * 3.7 + 0.1, k * 0.37 + 4.4);
  return {
    mesh,
    update(eye, light, fog) {
      if (fog) { material.uniforms.fogColor.value.copy(fog.color); material.uniforms.fogNear.value = fog.near; material.uniforms.fogFar.value = fog.far; }
      if (light) material.uniforms.uLight.value.copy(light);
      if (!eye || Math.hypot(eye.x - lastX, eye.z - lastZ) < 6) return;
      lastX = eye.x; lastZ = eye.z;
      const close = spots.map((p) => ({ p, d: Math.hypot(p.x - eye.x, p.z - eye.z) })).filter((q) => q.d < REACH).sort((a, b) => a.d - b.d);
      near = close.length;
      for (let i = 0; i < COUNT; i += 1) {
        if (!close.length) { base[i * 3 + 1] = -1000; continue; }
        const r = pick(i);
        const p = close[Math.min(close.length - 1, Math.floor(r * r * close.length))].p;
        const across = (pick(i + 500) - 0.5) * (s.width * 0.85);
        const along = (pick(i + 900) - 0.5) * 2.5;
        base[i * 3] = p.x + p.sx * across + p.sz * along; base[i * 3 + 1] = p.y + 0.1; base[i * 3 + 2] = p.z + p.sz * across - p.sx * along;
      }
      geometry.attributes.aBase.needsUpdate = true;
    },
    get near() { return near; },
    dispose() { geometry.dispose(); plane.dispose(); material.dispose(); map.dispose(); curtain.geometry.dispose(); curtain.material.dispose(); },
  };
}
function steamCurtain(lite, uniforms) {
  const s = HABITATION_HOT_RIVER, STEP = lite ? 6 : 4, H = lite ? 5 : 6.5;
  const pos = [], uv = [], idx = [];
  for (const off of [-2.8, 2.8]) {
    const first = pos.length / 3;
    let n = 0;
    for (let d = 0; d <= s.length; d += STEP) {
      const p = hotRiverAt(d);
      const x = p.x + p.sx * off, z = p.z + p.sz * off;
      const fade = Math.min(1, d / 20, (s.length - d) / 40);
      pos.push(x, p.y + 0.05, z, x, p.y + 0.05 + H * (0.4 + 0.6 * fade), z);
      uv.push(d / 9 + off, 0, d / 9 + off, 1);
      if (n > 0) { const a = first + (n - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      n += 1;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(idx);
  geometry.computeBoundingSphere();
  const material = new THREE.ShaderMaterial({
    uniforms: { uTime: uniforms.uTime, uLight: uniforms.uLight, fogColor: uniforms.fogColor, fogNear: uniforms.fogNear, fogFar: uniforms.fogFar },
    vertexShader: `
      varying vec2 vUv; varying float vFogDepth;
      void main() { vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vFogDepth = -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `
      uniform float uTime; uniform vec3 uLight; uniform vec3 fogColor; uniform float fogNear; uniform float fogFar;
      varying vec2 vUv; varying float vFogDepth;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
      void main() {
        vec2 p = vec2(vUv.x, vUv.y * 2.2 - uTime * 0.45);
        float n = noise(p + vec2(uTime * 0.06, 0.0)) * 0.55 + noise(p * 2.3 + vec2(-uTime * 0.09, 3.1)) * 0.3 + noise(p * 5.1 + vec2(0.0, -uTime * 0.3)) * 0.15;
        float a = smoothstep(0.3, 0.78, n) * pow(1.0 - vUv.y, 1.3) * smoothstep(0.0, 0.06, vUv.y) * 0.72;
        /* (seen from far off, a thin vapour is lost in the haze: it fades out with distance rather than stand there as
           a pale band along the horizon) */
        a *= 1.0 - smoothstep(140.0, 320.0, vFogDepth);
        if (a < 0.01) discard;
        vec3 c = mix(uLight, fogColor, smoothstep(fogNear, fogFar, vFogDepth));
        gl_FragColor = vec4(c, a);
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'hot-steam-curtain'; mesh.renderOrder = 4; mesh.frustumCulled = false;
  return mesh;
}


function fallTextures() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 128, 256);
  for (let x = 0; x < 128; x += 1) {
    const thick = 0.18 + 0.22 * habitationNoise(x / 9, 3.3) + 0.12 * habitationNoise(x / 3, 7.1);
    g.fillStyle = `rgba(214,236,240,${thick.toFixed(2)})`;
    g.fillRect(x, 0, 1, 256);
  }
  for (let i = 0; i < 300; i += 1) {
    const x = (i * 37.13) % 128, w = 1 + ((i * 7) % 4), a = 0.25 + ((i * 13) % 10) / 14;
    g.fillStyle = `rgba(255,255,255,${a.toFixed(2)})`;
    const y = (i * 53) % 256, h = 40 + ((i * 29) % 160);
    for (const oy of [-256, 0, 256]) g.fillRect(x, y + oy, w, h);
  }
  const fade = g.createLinearGradient(0, 0, 128, 0);
  fade.addColorStop(0, 'rgba(0,0,0,1)'); fade.addColorStop(0.16, 'rgba(0,0,0,0)'); fade.addColorStop(0.84, 'rgba(0,0,0,0)'); fade.addColorStop(1, 'rgba(0,0,0,1)');
  g.globalCompositeOperation = 'destination-out'; g.fillStyle = fade; g.fillRect(0, 0, 128, 256); g.globalCompositeOperation = 'source-over';
  const sheet = new THREE.CanvasTexture(c); sheet.wrapS = sheet.wrapT = THREE.RepeatWrapping;
  const f = document.createElement('canvas'); f.width = f.height = 128;
  const fg = f.getContext('2d');
  for (let i = 0; i < 160; i += 1) {
    const a = habitationNoise(i, 1.3) * Math.PI * 2, r = 10 + habitationNoise(i, 2.9) * 52, s2 = 2 + habitationNoise(i, 4.1) * 7;
    fg.fillStyle = `rgba(255,255,255,${(0.25 + 0.6 * (1 - r / 64)).toFixed(2)})`;
    fg.beginPath(); fg.arc(64 + Math.cos(a) * r, 64 + Math.sin(a) * r, s2, 0, Math.PI * 2); fg.fill();
  }
  const foam = new THREE.CanvasTexture(f);
  const p = document.createElement('canvas'); p.width = p.height = 64;
  const q = p.getContext('2d'); const r = q.createRadialGradient(32, 32, 2, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,0.9)'); r.addColorStop(0.5, 'rgba(255,255,255,0.35)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  q.fillStyle = r; q.fillRect(0, 0, 64, 64);
  const puff = new THREE.CanvasTexture(p);
  return { sheet, puff, foam };
}
function buildFall(f, textures) {
  const [tx, tz, ty] = f.top, [fx, fz, fy] = [f.foot[0], f.foot[1], f.foot[2]];
  const out = new THREE.Vector3(fx - tx, 0, fz - tz); const away = out.length() || 1; out.normalize();
  const across = new THREE.Vector3(-out.z, 0, out.x);
  const seg = 14, pos = [], uv = [], idx = [];
  for (let i = 0; i <= seg; i += 1) {
    const t = i / seg;
    const fall = ty + (fy - ty) * t, reach = away * Math.sqrt(t);
    const width = f.width * (1 + 0.35 * t);
    for (const s of [-0.5, 0.5]) {
      pos.push(tx + out.x * reach + across.x * width * s, fall, tz + out.z * reach + across.z * width * s);
      uv.push(s + 0.5, t * (ty - fy) / 6);
    }
    if (i > 0) { const a = (i - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  const map = textures.sheet.clone(); map.needsUpdate = true; map.repeat.set(1, 1);
  const mat = new THREE.MeshBasicMaterial({ map, color: 0xf2fbff, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide, fog: true });
  const sheet = new THREE.Mesh(g, mat);
  sheet.name = `waterfall:${f.id}`;
  sheet.renderOrder = 3;
  const front = map.clone(); front.needsUpdate = true; front.repeat.set(0.8, 1.3); front.offset.x = 0.37;
  const veil = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: front, color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide, fog: true }));
  veil.position.copy(out).multiplyScalar(0.25); veil.renderOrder = 4;
  sheet.add(veil);
  const foamMat = new THREE.MeshBasicMaterial({ map: textures.foam, transparent: true, opacity: 0.8, depthWrite: false, fog: true });
  const foam = new THREE.Mesh(new THREE.CircleGeometry(f.width * 1.25, 24), foamMat);
  foam.rotation.x = -Math.PI / 2; foam.position.set(fx + out.x * Math.min(away, 1.5), fy + 0.04, fz + out.z * Math.min(away, 1.5)); foam.renderOrder = 3;
  sheet.add(foam); foam.position.sub(sheet.position);
  const spray = new THREE.Group();
  const puffs = [];
  const puffMat = new THREE.SpriteMaterial({ map: textures.puff, color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false, fog: true });
  for (let i = 0; i < 14; i += 1) {
    const s = new THREE.Sprite(puffMat.clone());
    s.userData = { phase: i / 14, spread: f.width * (0.6 + 0.8 * ((i * 7) % 5) / 5), turn: i * 2.39 };
    spray.add(s); puffs.push(s);
  }
  spray.position.set(fx + out.x * Math.min(away, 1.5), fy, fz + out.z * Math.min(away, 1.5));
  return { sheet, spray, map, puffs, height: ty - fy, veil, foam, update(dt, time) {
    map.offset.y = -time * 0.9;
    front.offset.y = -time * 1.25;
    foam.rotation.z = time * 0.12; foam.scale.setScalar(1 + 0.06 * Math.sin(time * 2.3));
    for (const s of puffs) {
      const k = (s.userData.phase + time * 0.18) % 1;
      const a = s.userData.turn + time * 0.2;
      s.position.set(Math.cos(a) * s.userData.spread * (0.4 + k), 0.2 + k * Math.min(6, (ty - fy) * 0.35), Math.sin(a) * s.userData.spread * (0.4 + k));
      const size = (0.8 + k * 3.2) * Math.min(1.6, f.width / 3);
      s.scale.set(size, size, 1);
      s.material.opacity = 0.55 * (1 - k) * (k < 0.1 ? k / 0.1 : 1);
    }
  } };
}


class Pieces {
  constructor() { this.p = []; this.n = []; this.uv = []; this.c = []; this.i = []; }
  box(cx, cy, cz, ax, ay, az, sx, sy, sz, shade = 1, uvScale = 1, uvAt = null) {
    const ou = uvAt ? uvAt[0] : 0, ov = uvAt ? uvAt[1] : 0;
    const o = this.p.length / 3;
    const faces = [[ay, ax, az, sy, sx, sz], [ay.clone().negate(), ax, az.clone().negate(), sy, sx, sz], [az, ax, ay, sz, sx, sy], [az.clone().negate(), ax, ay.clone().negate(), sz, sx, sy], [ax, az, ay, sx, sz, sy], [ax.clone().negate(), az.clone().negate(), ay, sx, sz, sy]];
    let f = 0;
    for (const [n, u, v, dn, du, dv] of faces) {
      const base = o + f * 4; f += 1;
      for (const [i, j] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        this.p.push(cx + n.x * dn / 2 + u.x * du / 2 * i + v.x * dv / 2 * j, cy + n.y * dn / 2 + u.y * du / 2 * i + v.y * dv / 2 * j, cz + n.z * dn / 2 + u.z * du / 2 * i + v.z * dv / 2 * j);
        this.n.push(n.x, n.y, n.z); this.uv.push(ou + (i + 1) / 2 * du * uvScale, ov + (j + 1) / 2 * dv * uvScale); this.c.push(shade, shade, shade);
      }
      const cr = new THREE.Vector3().crossVectors(u, v).dot(n);
      if (cr > 0) this.i.push(base, base + 1, base + 2, base, base + 2, base + 3); else this.i.push(base, base + 2, base + 1, base, base + 3, base + 2);
    }
  }
  tube(points, radius, sides = 6, shade = 1) {
    const o = this.p.length / 3;
    for (let k = 0; k < points.length; k += 1) {
      const p = points[k], q = points[Math.min(k + 1, points.length - 1)], r = points[Math.max(k - 1, 0)];
      const t = v3.set(q.x - r.x, q.y - r.y, q.z - r.z).normalize();
      const a = Math.abs(t.y) < 0.9 ? new THREE.Vector3(0, 1, 0).cross(t).normalize() : new THREE.Vector3(1, 0, 0).cross(t).normalize();
      const b = new THREE.Vector3().crossVectors(t, a);
      for (let s = 0; s <= sides; s += 1) {
        const ang = (s / sides) * Math.PI * 2, nx = a.x * Math.cos(ang) + b.x * Math.sin(ang), ny = a.y * Math.cos(ang) + b.y * Math.sin(ang), nz = a.z * Math.cos(ang) + b.z * Math.sin(ang);
        this.p.push(p.x + nx * radius, p.y + ny * radius, p.z + nz * radius); this.n.push(nx, ny, nz); this.uv.push(k * 0.5, s / sides); this.c.push(shade, shade, shade);
      }
    }
    for (let k = 0; k + 1 < points.length; k += 1) for (let s = 0; s < sides; s += 1) {
      const a = o + k * (sides + 1) + s, b = o + (k + 1) * (sides + 1) + s;
      this.i.push(a, b, b + 1, a, b + 1, a + 1);
    }
  }
  build(material) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setIndex(this.i.length > 65535 ? new THREE.Uint32BufferAttribute(this.i, 1) : new THREE.Uint16BufferAttribute(this.i, 1));
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, material);
    mesh.castShadow = true; mesh.receiveShadow = true;
    return mesh;
  }
}
function boardsAt(d, x, z) {
  const f = habitationFooting(x, z);
  if (f && f.deck === d.id) return f.y;
  return null;
}
function buildDecks(woodMat, ropeMat, stoneMat) {
  const wood = new Pieces(), rope = new Pieces(), stone = new Pieces();
  const up = new THREE.Vector3(0, 1, 0);
  for (const d of HABITATION_DECKS) {
    if (d.kind === 'suspension' || d.kind === 'platform') continue;          // (the owner's own models: placeModels)
    const L = d.length;
    const at = (s) => {
      let run = 0;
      for (let i = 0; i + 1 < d.line.length; i += 1) {
        const [ax, az] = d.line[i], [bx, bz] = d.line[i + 1], len = Math.hypot(bx - ax, bz - az);
        if (run + len >= s || i === d.line.length - 2) { const t = Math.min(1, Math.max(0, (s - run) / (len || 1))); return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, dx: (bx - ax) / (len || 1), dz: (bz - az) / (len || 1) }; }
        run += len;
      }
      return null;
    };
    const heightAt = (x, z, fallback) => { const y = boardsAt(d, x, z); return y === null ? fallback : y; };
    const stair = d.kind === 'stairs';
    const pitch = stair ? 0.32 : 0.24;
    let last = d.heights[0];
    const posts = [];
    for (let s = pitch / 2; s < L; s += pitch) {
      const p = at(s);
      const y = heightAt(p.x, p.z, last); last = y;
      const along = new THREE.Vector3(p.dx, 0, p.dz), across = new THREE.Vector3(-p.dz, 0, p.dx);
      const shade = 0.85 + 0.3 * habitationNoise(s * 3.1, d.id.length);
      if (d.stone) stone.box(p.x, y - 0.12, p.z, across, up, along, d.width, 0.24, pitch * 0.98, shade, 0.5);
      else wood.box(p.x, y - 0.025, p.z, across, up, along, d.width * (0.97 + 0.06 * habitationNoise(s * 7, 3)), 0.05, pitch * (stair ? 0.95 : 0.82), shade, 0.5, [habitationNoise(s * 5.3, 1.7) * 7, habitationNoise(s * 3.7, 9.1) * 7]);
    }
    const rails = new Map();
    for (const post of HABITATION_DECK_POSTS) {
      if (post.deck !== d.id) continue;
      const p = at(post.s);
      const y = heightAt(p.x, p.z, last);
      const ground = Math.min(habitationGroundAt(p.x, p.z), (habitationWaterAt(p.x, p.z) || { level: y }).level) - 0.4;
      const px = post.x, pz = post.z;
      const top = y + (d.rails ? 1.0 : 0.15), bottom = Math.min(ground, y - 0.3);
      if (!d.stone) wood.box(px, (top + bottom) / 2, pz, new THREE.Vector3(1, 0, 0), up, new THREE.Vector3(0, 0, 1), 0.12, top - bottom, 0.12, 0.8, 0.5);
      else stone.box(px, (top + y) / 2, pz, new THREE.Vector3(1, 0, 0), up, new THREE.Vector3(0, 0, 1), 0.22, top - y, 0.22, 0.9, 0.5);
      const key = `${post.side}:${post.run}`;
      if (!rails.has(key)) rails.set(key, []);
      rails.get(key).push(new THREE.Vector3(px, y + 0.95, pz));
      posts.push(post.s);
    }
    if (d.rails) for (const line of rails.values()) {
      if (line.length < 2) continue;
      if (d.ropes) {
        const pts = [];
        for (let k = 0; k + 1 < line.length; k += 1) for (let t = 0; t < 1; t += 0.25) { const a = line[k], b = line[k + 1]; pts.push(new THREE.Vector3(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t - Math.sin(Math.PI * t) * 0.08, a.z + (b.z - a.z) * t)); }
        pts.push(line[line.length - 1]);
        rope.tube(pts, 0.025, 6, 1);
      } else {
        for (const drop of [0, 0.45]) wood.tube(line.map((p) => new THREE.Vector3(p.x, p.y - drop, p.z)), drop ? 0.04 : 0.055, 6, 0.9);
      }
    }
  }
  const out = [wood.build(woodMat), rope.build(ropeMat)];
  if (stone.p.length) out.push(stone.build(stoneMat));
  return out;
}


function buildUpriver(lite) {
  const group = new THREE.Group(); group.name = 'upriver';
  const r = UPRIVER.road, p = UPRIVER.park;
  const road = new Pieces();
  const ax = new THREE.Vector3(1, 0, 0), ay = new THREE.Vector3(0, 1, 0), az = new THREE.Vector3(0, 0, 1);
  const x0 = 250;
  road.box((x0 + r.x1) / 2, 0.02, (r.z0 + r.z1) / 2, ax, ay, az, r.x1 - x0, 0.04, r.z1 - r.z0 + 2.6, 1);
  road.box((p.x0 + p.x1) / 2, 0.02, (p.z0 + p.z1) / 2, ax, ay, az, p.x1 - p.x0 + 2, 0.04, p.z1 - p.z0 + 2, 1);
  const shoulder = road.build(new THREE.MeshStandardMaterial({ color: linear(0x9a5434), roughness: 1, metalness: 0 }));
  const tar = new Pieces();
  tar.box((x0 + r.x1) / 2, 0.05, (r.z0 + r.z1) / 2, ax, ay, az, r.x1 - x0, 0.06, r.z1 - r.z0, 1);
  tar.box((p.x0 + p.x1) / 2, 0.05, (p.z0 + p.z1) / 2, ax, ay, az, p.x1 - p.x0, 0.06, p.z1 - p.z0, 1);
  const tarMesh = tar.build(new THREE.MeshStandardMaterial({ color: linear(0x56555a), roughness: 0.94, metalness: 0, map: grainTexture({ low: 0.66, coarse: 0.3, speck: 0.45, seed: 3 }) }));
  const paint = new Pieces();
  for (let x = x0 + 2; x < r.x1 - 2; x += 9) paint.box(x + 1.5, 0.085, (r.z0 + r.z1) / 2, ax, ay, az, 3, 0.02, 0.14, 1);
  for (const z of [r.z0 + 0.25, r.z1 - 0.25]) paint.box((x0 + r.x1) / 2, 0.085, z, ax, ay, az, r.x1 - x0, 0.02, 0.12, 1);
  for (let x = p.x0 + 3; x < p.x1 - 2; x += 2.6) for (const z of [p.z0 + 3, p.z1 - 14]) paint.box(x, 0.085, z, ax, ay, az, 0.12, 0.02, 5, 1);
  const paintMesh = paint.build(new THREE.MeshStandardMaterial({ color: linear(0xe6e2d6), roughness: 0.8, metalness: 0 }));
  shoulder.castShadow = tarMesh.castShadow = paintMesh.castShadow = false;
  group.add(shoulder, tarMesh, paintMesh);
  for (const sign of [...UPRIVER.signs, HABITATION_GATE_SIGN]) group.add(roadSign(sign, lite));
  return group;
}

const signPictures = new Map();
const signLines = (s) => s.lines.map((line, i) => (typeof line === 'string' ? { text: line, size: i === 0 ? 88 : 60 } : line));
function signPicture(s, lite) {
  const key = `${signLines(s).map((l) => `${l.text}@${l.size}`).join('|')}|${s.palette.join('|')}|${s.width}x${s.height}|${lite ? 'lite' : 'full'}`;
  let texture = signPictures.get(key);
  if (!texture) {
    const [ink, ground] = s.palette;
    texture = textTexture(signLines(s), { width: 1024, height: Math.round((1024 * s.height) / s.width / 32) * 32, background: ground, colour: ink, border: ink, size: 70, scale: lite ? 0.5 : 1 });
    signPictures.set(key, texture);
  }
  return texture;
}
function letSignsGo(group) {
  group.traverse((o) => {
    if (!o.material) return;
    const t = o.material.map;
    if (t) for (const [key, picture] of signPictures) if (picture === t) { picture.dispose(); signPictures.delete(key); }
    o.material.dispose();
  });
}
function roadSign(s, lite = false) {
  const group = new THREE.Group(); group.name = `sign:${s.id}`;
  const board = new THREE.Mesh(new THREE.PlaneGeometry(s.width, s.height), new THREE.MeshStandardMaterial({ map: signPicture(s, lite), roughness: 0.6, metalness: 0 }));
  board.position.set(0, 1.3 + s.height / 2, 0);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(s.width, s.height), new THREE.MeshStandardMaterial({ color: linear(0x6a6f72), roughness: 0.7, metalness: 0.3 }));
  back.position.set(0, 1.3 + s.height / 2, -0.03); back.rotation.y = Math.PI;
  group.add(board, back);
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.9 + s.height, 8), new THREE.MeshStandardMaterial({ color: linear(0x8a8f92), roughness: 0.5, metalness: 0.6 }));
    post.position.set(side * (s.width / 2 - 0.3), (1.3 + s.height) / 2 - 0.3, -0.06);
    post.castShadow = true;
    group.add(post);
  }
  group.position.set(s.x, s.ground ? habitationGroundAt(s.x, s.z) - 0.1 : 0, s.z);
  group.rotation.y = s.facing;
  return group;
}

function hotSignsMerged(lite) { return signsMerged(HOT_RIVER_SIGNS, 'hot', lite); }
function signsMerged(list, name, lite) {
  const boards = new Batch({ uv: 'keep' }), steel = new Batch({ uv: 'keep' });
  const group = new THREE.Group(); group.name = `${name}-signs`;
  let boardMaterial = null;
  for (const s of list) {
    const sign = roadSign(s, lite);
    sign.updateMatrixWorld(true);
    for (const part of sign.children) {
      if (part.material.map) { boards.add(part.geometry, part.matrixWorld, 0xffffff, 1, true); if (!boardMaterial) boardMaterial = part.material; }
      else steel.add(part.geometry, part.matrixWorld, part.geometry.type === 'CylinderGeometry' ? 0x8a8f92 : 0x6a6f72, 1, true);
    }
    for (const part of sign.children) { part.geometry.dispose(); if (part.material !== boardMaterial) part.material.dispose(); }
    const marker = new THREE.Object3D(); marker.name = sign.name; marker.position.copy(sign.position); marker.rotation.copy(sign.rotation);
    group.add(marker);
  }
  const board = boards.build(boardMaterial); board.name = `${name}-sign-boards`;
  const posts = steel.build(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.45 })); posts.name = `${name}-sign-posts`; posts.castShadow = true;
  group.add(board, posts);
  return group;
}


function buildApron(lite) {
  const b = HABITATION.bounds, OUT = 360, step = lite ? 30 : 20;
  const x0 = b.x0 - 6, x1 = b.x1 + OUT, z0 = b.z0 - OUT, z1 = b.z1 + OUT;
  const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0, Math.ceil((x1 - x0) / step), Math.ceil((z1 - z0) / step));
  g.rotateX(-Math.PI / 2); g.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
  const P = g.attributes.position, col = new Float32Array(P.count * 3), c = new THREE.Color();
  for (let i = 0; i < P.count; i += 1) {
    const x = P.getX(i), z = P.getZ(i);
    const out = Math.max(0, Math.hypot(Math.max(0, x - b.x1), Math.max(0, b.z0 - z, z - b.z1)));
    const inside = x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1;
    const y = inside ? -4 : Math.min(16, out * 0.06) * (0.35 + 0.65 * habitationNoise(x / 90 + 7, z / 90)) - 0.15;
    P.setY(i, y);
    c.copy(linear(0x587f38)).lerp(linear(0x7d9446), habitationNoise(x / 45, z / 45 + 3)).lerp(linear(0x3f6a2c), Math.max(0, habitationNoise(x / 20 + 9, z / 20) - 0.55) * 1.6);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true }));
  mesh.name = 'habitation-apron'; mesh.receiveShadow = true;
  return mesh;
}


const HILLS = { x: 2200 + HABITATION_SHIFT, z: 150, valley: Math.PI, gap: 1.25 };
function hillRing(radius, peaks, tallest, seed, lite) {
  const N = lite ? 360 : 720;
  const list = [];
  for (let i = 0; i < peaks; i += 1) {
    const a = (i / peaks) * Math.PI * 2 + (habitationNoise(i * 1.7 + seed, seed) - 0.5) * 0.12;
    list.push({ a, w: 0.014 + 0.04 * habitationNoise(i * 3.1, seed + 5), h: tallest * (0.3 + 0.7 * habitationNoise(i * 0.9 + seed, 11)), lean: (habitationNoise(i * 2.3, seed + 9) - 0.5) * 0.6 });
  }
  const pos = [], idx = [];
  for (let k = 0; k <= N; k += 1) {
    const a = (k / N) * Math.PI * 2;
    const off = Math.abs(Math.atan2(Math.sin(a - HILLS.valley), Math.cos(a - HILLS.valley)));
    const open = Math.max(0, Math.min(1, (off - HILLS.gap) / 0.12));
    let h = tallest * 0.12 * habitationNoise(a * 9 + seed, 3);
    for (const p of list) {
      const sd = Math.atan2(Math.sin(a - p.a), Math.cos(a - p.a)) / p.w, d = Math.abs(sd);
      if (d < 1) h = Math.max(h, p.h * Math.pow(1 - Math.pow(d, 5), 0.5) * (1 + p.lean * sd * 0.5) * (0.94 + 0.06 * habitationNoise(a * 140 + seed, 5)));
    }
    h *= open;
    const x = HILLS.x + Math.cos(a) * radius, z = HILLS.z + Math.sin(a) * radius;
    pos.push(x, -60, z, x, Math.max(-40, h - 20), z);
    if (k > 0) { const a0 = (k - 1) * 2, b0 = k * 2; idx.push(a0, a0 + 1, b0, b0, a0 + 1, b0 + 1); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}
function buildHills(lite) {
  const group = new THREE.Group(); group.name = 'habitation-hills';
  const rings = [
    { radius: 1500, peaks: 80, tallest: 300, seed: 7, tint: 0x7f96a6, air: 0.62 },
    { radius: 1150, peaks: 70, tallest: 200, seed: 3, tint: 0x3a5642, air: 0.4 },
  ];
  for (const r of rings) {
    const m = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(hillRing(r.radius, r.peaks, r.tallest, r.seed, lite), m);
    mesh.userData = { tint: linear(r.tint), air: r.air };
    mesh.renderOrder = -1;
    group.add(mesh);
  }
  group.userData.tone = (horizon) => { for (const mesh of group.children) mesh.material.color.copy(mesh.userData.tint).lerp(horizon, mesh.userData.air); };
  return group;
}


const BANDS = {                     // metres within which a copy is drawn as the model: [a computer, a phone]
  tree: [150, 85], palm: [150, 85], banana: [80, 48], shrub: [75, 45], herb: [60, 38], fern: [60, 38], rock: [130, 70],
  structure: [420, 300], bridge: [420, 300], cliff: [700, 500],
};
const PICTURED = new Set(['tree', 'palm']);         // drawn as their picture beyond their band
const PICTURE_REACH = [720, 420];                   // and as far as this
const SLOT = { full: [256, 512], lite: [64, 128] };
const COLS = 8, ROWS = 4;
function createImpostors(renderer, scene, lite) {
  const [sw, sh] = SLOT[lite ? 'lite' : 'full'];
  const target = new THREE.WebGLRenderTarget(sw * COLS, sh * ROWS, { minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: true, depthBuffer: true });
  target.texture.colorSpace = THREE.SRGBColorSpace;
  const slots = new Map();
  const studio = new THREE.Scene();
  const key = new THREE.DirectionalLight(0xfff4e0, 1.25 * LIGHT); key.position.set(0.4, 1, 1); studio.add(key);
  studio.add(new THREE.HemisphereLight(0xdfeaff, 0x5a5040, 0.75 * LIGHT));
  const lens = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  const card = new THREE.PlaneGeometry(1, 1); card.translate(0, 0.5, 0);
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.index = card.index; geometry.setAttribute('position', card.attributes.position); geometry.setAttribute('uv', card.attributes.uv);
  const MOST = 2200;
  const at = new Float32Array(MOST * 4), slot = new Float32Array(MOST * 4);
  geometry.setAttribute('impAt', new THREE.InstancedBufferAttribute(at, 4));
  geometry.setAttribute('impSlot', new THREE.InstancedBufferAttribute(slot, 4));
  geometry.instanceCount = 0;
  const material = new THREE.MeshBasicMaterial({ map: target.texture, alphaTest: 0.5, side: THREE.DoubleSide });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 impAt;\nattribute vec4 impSlot;')
      .replace('#include <uv_vertex>', `#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv = impSlot.xy + vec2(impSlot.w > 0.0 ? uv.x : 1.0 - uv.x, uv.y) * vec2(${(1 / COLS).toFixed(6)}, ${(1 / ROWS).toFixed(6)});\n#endif`)
      .replace('#include <project_vertex>', `
        vec3 toEye = cameraPosition - impAt.xyz; toEye.y = 0.0; toEye = normalize(toEye + vec3(1e-5));
        vec3 across = vec3(toEye.z, 0.0, -toEye.x);
        float h = impAt.w, w = h * abs(impSlot.w);
        vec3 p = impAt.xyz + across * (position.x * w) + vec3(0.0, position.y * h, 0.0);
        vec4 mvPosition = viewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mvPosition;`);
  };
  material.customProgramCacheKey = () => 'pcw-habitation-impostor';
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'habitation-impostors'; mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = false;
  scene.add(mesh);
  function take(name, model) {
    if (slots.size >= COLS * ROWS) return null;
    const index = slots.size, cx = index % COLS, cy = Math.floor(index / COLS);
    const box = model.box, size = box.getSize(new THREE.Vector3()), mid = box.getCenter(new THREE.Vector3());
    const wide = Math.max(size.x, size.z), high = size.y;
    const frameH = Math.max(high, wide * (sh / sw)), frameW = frameH * (sw / sh);
    lens.left = -frameW / 2; lens.right = frameW / 2; lens.top = frameH; lens.bottom = 0; lens.updateProjectionMatrix();
    lens.position.set(mid.x, box.min.y, mid.z + 50); lens.lookAt(mid.x, box.min.y, mid.z);
    const copy = model.make();
    studio.add(copy);
    const before = renderer.getRenderTarget(), clear = renderer.getClearColor(new THREE.Color()), alpha = renderer.getClearAlpha(), auto = renderer.autoClear, shadows = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    target.viewport.set(cx * sw, cy * sh, sw, sh); target.scissor.set(cx * sw, cy * sh, sw, sh); target.scissorTest = true;
    renderer.setRenderTarget(target);
    renderer.setClearColor(0x30402a, 0);
    renderer.autoClear = false; renderer.clear(true, true, false);
    renderer.render(studio, lens);
    target.scissorTest = false; target.viewport.set(0, 0, sw * COLS, sh * ROWS);
    renderer.setRenderTarget(before); renderer.setClearColor(clear, alpha); renderer.autoClear = auto; renderer.shadowMap.autoUpdate = shadows;
    studio.remove(copy);
    const s = { u: cx / COLS, v: cy / ROWS, du: 1 / COLS, dv: 1 / ROWS, aspect: frameW / frameH, height: frameH, base: box.min.y, centre: [mid.x, mid.z] };
    slots.set(name, s);
    return s;
  }
  let shown = 0;
  return {
    mesh, take, slots, target,
    show(list, brightness) {
      shown = Math.min(MOST, list.length);
      for (let i = 0; i < shown; i += 1) {
        const p = list[i], s = p.slot;
        at[i * 4] = p.x; at[i * 4 + 1] = p.y + s.base * p.scale; at[i * 4 + 2] = p.z; at[i * 4 + 3] = s.height * p.scale;
        slot[i * 4] = s.u; slot[i * 4 + 1] = s.v; slot[i * 4 + 2] = s.du; slot[i * 4 + 3] = s.aspect * (p.flip ? -1 : 1);
      }
      geometry.instanceCount = shown;
      geometry.attributes.impAt.needsUpdate = true; geometry.attributes.impSlot.needsUpdate = true;
      material.color.setScalar(brightness);
    },
    get shown() { return shown; },
    dispose() { scene.remove(mesh); geometry.dispose(); card.dispose(); material.dispose(); target.dispose(); },
  };
}

const ON_DISK = (() => { try { return location.protocol === 'file:'; } catch (error) { return false; } })();
function placeModels(group, { lite, fetchFile, shared, impostors, onModel = () => {} }) {
  const byModel = new Map();
  for (const p of HABITATION_STANDING) { if (!byModel.has(p.m)) byModel.set(p.m, []); byModel.get(p.m).push(p); }
  const placed = { models: new Map(), fetched: 0, bytes: 0, instances: 0, list: [], retried: new Set() };
  const q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), sc = new THREE.Vector3(), at = new THREE.Vector3(), off = new THREE.Vector3(), m4 = new THREE.Matrix4();
  const order = [...byModel.keys()].sort((a, b) => Math.min(...byModel.get(a).map((p) => Math.hypot(p.x - HABITATION.gate.x, p.z - HABITATION.gate.z))) - Math.min(...byModel.get(b).map((p) => Math.hypot(p.x - HABITATION.gate.x, p.z - HABITATION.gate.z))));
  const fetchBytes = (m) => { const p = fetchFile(`habitation/${m}.${lite ? 'lite' : 'full'}.glb`).then((res) => { if (!res.ok) throw new Error(`${m}: ${res.status}`); return res.arrayBuffer(); }); p.catch(() => {}); return p; };
  let ahead = null;
  const bytesOf = (m) => { if (ahead && ahead.m === m) { const p = ahead.bytes; ahead = null; return p; } return fetchBytes(m); };
  const readOne = (m, next) => new Promise((resolve, reject) => {
    let late = false;
    const timer = setTimeout(() => { late = true; reject(new Error(`${m}: not read within two minutes`)); }, 120000);
    (async () => {
      const mine = bytesOf(m);
      if (next && !ahead) ahead = { m: next, bytes: fetchBytes(next) };
      const buf = await mine;
      placed.now.step = 'read';
      const model = await readDressed(buf, { lite, shared });
      return { model, bytes: buf.byteLength };
    })().then((got) => { clearTimeout(timer); if (late) got.model.dispose(); else resolve(got); }, (error) => { clearTimeout(timer); if (!late) reject(error); });
  });
  placed.loading = (async () => {
    if (ON_DISK) return;
    const queue = [...order];
    while (queue.length) {
      const m = queue.shift();
      if (placed.stopped) return;
      const list = byModel.get(m);
      const info = HABITATION_MODELS[m];
      let model;
      placed.now = { model: m, step: 'asked' };
      try {
        const got = await readOne(m, queue[0]);
        model = got.model; placed.bytes += got.bytes;
        placed.now.step = 'made';
      } catch (error) { onModel(m, error); if (!placed.retried.has(m)) { placed.retried.add(m); queue.push(m); } continue; }
      if (placed.stopped) { model.dispose(); return; }
      placed.fetched += 1;
      const kind = info ? info.kind : 'tree';
      const copies = list.map((p) => {
        const scale = p.s / (info ? info.unit : 1);
        const base = info ? info.base : [0, 0, 0];
        const y = p.y !== null ? p.y : habitationGroundAt(p.x, p.z);
        q.setFromAxisAngle(up, p.r);
        sc.setScalar(scale);
        off.set(base[0] * scale, base[1] * scale, base[2] * scale).applyQuaternion(q);
        at.set(p.x - off.x, y - off.y - 0.04 * Math.min(1, scale * 0.05), p.z - off.z);
        m4.compose(at, q, sc);
        const sphere = model.box.getBoundingSphere(new THREE.Sphere()).applyMatrix4(m4);
        return { matrix: Float32Array.from(m4.elements), sphere, x: p.x, y, z: p.z, scale, flip: (p.r * 7.3) % 1 > 0.5 };
      });
      const meshes = model.parts.map((part) => {
        const mesh = new THREE.InstancedMesh(part.geometry, part.material, copies.length);
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.name = `${m}:${part.part}`;
        mesh.castShadow = part.part !== 'inside' && (!lite || !['herb', 'fern', 'shrub', 'banana', 'rock'].includes(kind)); mesh.receiveShadow = true;
        if (part.depth) mesh.customDepthMaterial = part.depth;
        mesh.frustumCulled = false;
        mesh.count = 0; mesh.visible = false;
        group.add(mesh);
        return mesh;
      });
      const slot = impostors && PICTURED.has(kind) ? impostors.take(m, model) : null;
      const entry = { name: m, kind, model, copies, meshes, slot, band: BANDS[kind] || BANDS.tree, chosen: '' };
      placed.models.set(m, entry);
      placed.list.push(entry);
      placed.instances += copies.length;
      onModel(m, null);
    }
  })();
  return placed;
}

const frustum = new THREE.Frustum(), viewProjection = new THREE.Matrix4(), margin = new THREE.Sphere();
function chooseCopies(placed, impostors, camera, lite, brightness, counts) {
  if (!camera) return;
  const now = performance.now() / 1000;
  camera.updateMatrixWorld();
  camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
  viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  frustum.setFromProjectionMatrix(viewProjection);
  const ex = camera.position.x, ez = camera.position.z;
  const far = PICTURE_REACH[lite ? 1 : 0];
  const pictures = [];
  counts.models = 0; counts.copies = 0;
  for (const e of placed.list) {
    const near = e.band[lite ? 1 : 0];
    let n = 0, chosen = '';
    for (let i = 0; i < e.copies.length; i += 1) {
      const c = e.copies[i];
      const d = Math.hypot(c.x - ex, c.z - ez);
      if (d - c.sphere.radius > near) {
        if (e.slot && d < far && frustum.intersectsSphere(c.sphere)) pictures.push({ x: c.x, y: c.y, z: c.z, scale: c.scale, slot: e.slot, flip: c.flip });
        continue;
      }
      margin.center.copy(c.sphere.center); margin.radius = c.sphere.radius + 8;
      if (!frustum.intersectsSphere(margin)) continue;
      if (n < 64) chosen += `${i},`; else if (n === 64) chosen += `+${e.copies.length}`;
      for (const mesh of e.meshes) mesh.instanceMatrix.array.set(c.matrix, n * 16);
      n += 1;
    }
    chosen += `:${n}`;
    if (n) e.drawnAt = now;
    if (chosen !== e.chosen || e.meshes[0] && e.meshes[0].count !== n) {
      e.chosen = chosen;
      for (const mesh of e.meshes) { mesh.count = n; mesh.visible = n > 0; if (n) { mesh.instanceMatrix.clearUpdateRanges(); mesh.instanceMatrix.addUpdateRange(0, n * 16); mesh.instanceMatrix.needsUpdate = true; } }
    }
    if (n) { counts.models += 1; counts.copies += n; }
  }
  counts.pictures = pictures.length;
  if (impostors) impostors.show(pictures, brightness);
}

const SLEEP_AFTER = 10;
const PICTURE_KEYS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'alphaMap', 'emissiveMap', 'aoMap', 'bumpMap'];
function picturesOf(entry) {
  if (entry.pictures) return entry.pictures;
  const out = new Set();
  for (const p of entry.model.parts) {
    for (const m of [p.material, p.depth]) {
      if (!m) continue;
      for (const k of PICTURE_KEYS) if (m[k] && m[k].isTexture) out.add(m[k]);
      if (m.uniforms) for (const u of Object.values(m.uniforms)) if (u && u.value && u.value.isTexture) out.add(u.value);
    }
  }
  entry.pictures = [...out];
  return entry.pictures;
}
function sleepModels(placed, sharedTextures) {
  const now = performance.now() / 1000;
  if (now - (placed.sleptAt || 0) < 3) return;
  placed.sleptAt = now;
  let sharing = 0, asleep = 0;
  for (const e of placed.list) {
    if (now - (e.drawnAt || 0) < SLEEP_AFTER) { if (picturesOf(e).some((t) => t.userData && t.userData.shared)) sharing += 1; continue; }
    for (const t of picturesOf(e)) if (!(t.userData && t.userData.shared)) t.dispose();
    asleep += 1;
  }
  if (!sharing) for (const t of sharedTextures) t.dispose();
  placed.asleep = asleep;
}


function createHabitation(scene, { lite = false, renderer = null, riverMaterial = null, fetchFile = (url) => fetch(url), onError = () => {} } = {}) {
  const sharedPictures = new Map();
  const sharedTextures = new Set();
  const shared = (uri, colour) => {
    if (ON_DISK) return Promise.reject(new Error('opened from the disk'));
    if (!sharedPictures.has(uri)) sharedPictures.set(uri, (async () => {
      const res = await fetchFile(`habitation/${uri}`);
      if (!res.ok) throw new Error(`${uri}: ${res.status}`);
      const t = new THREE.Texture(await decodePicture(await res.blob())); t.flipY = false; if (colour) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.needsUpdate = true; t.userData = { shared: true };       // (three r128: a texture has no userData of its own)
      sharedTextures.add(t);
      return t;
    })());
    const p = sharedPictures.get(uri);
    p.catch(() => { if (sharedPictures.get(uri) === p) sharedPictures.delete(uri); });
    return p;
  };
  const root = new THREE.Group(); root.name = 'habitation';
  const steamLight = new THREE.Color();
  let upriver = null;
  let built = null;             // { group, waters, falls, ... } while near
  let building = false;
  let time = 0;
  const stats = { builds: 0, letGo: 0, buildMs: 0, triangles: 0 };
  const drawn = { models: 0, copies: 0, pictures: 0 };

  function ensureUpriver() {
    if (upriver) return;
    upriver = buildUpriver(lite);
    scene.add(upriver);
  }
  function swapGround(every) {
    const old = built.ground;
    const next = groundPieces(built.groundPoints, every, built.groundMat);
    built.group.add(next); built.group.remove(old);
    old.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    built.ground = next;
    stats.groundSwaps = (stats.groundSwaps || 0) + 1;
  }
  function build(away = 0) {
    if (built || building) return;
    building = true;
    const t0 = performance.now();
    const group = new THREE.Group(); group.name = 'habitation-near';
    const grain = grainTexture({ low: 0.6, coarse: 0.35, speck: 0.35, seed: 11 });
    grain.wrapS = grain.wrapT = THREE.RepeatWrapping;
    const ripples = rippleNormalTexture(lite ? 128 : 256);
    ripples.wrapS = ripples.wrapT = THREE.RepeatWrapping;
    const stone = stoneTexture(lite ? 256 : 512);
    const groundPoints = groundData();
    const groundMat = groundMaterial({ grain, stone, lite });
    const ground = groundPieces(groundPoints, lite && away > NEAR_GROUND.come ? 2 : 1, groundMat);
    group.add(ground);
    const waters = [];
    const materials = {};
    const matFor = (kind) => materials[kind] || (materials[kind] = waterMaterial(kind, { ripples, lite }));
    for (const w of HABITATION_WATERS) {
      const mesh = new THREE.Mesh(buildStill(w, lite ? 4 : 2), matFor(w.kind));
      mesh.name = `water:${w.id}`; mesh.renderOrder = 2; mesh.receiveShadow = true;
      group.add(mesh); waters.push(mesh);
    }
    for (const s of HABITATION_STREAMS) {
      const mesh = new THREE.Mesh(buildStream(s, lite ? 2.5 : 1.5), matFor(s.rapids ? 'rapids' : 'stream'));
      mesh.name = `stream:${s.id}`; mesh.renderOrder = 2;
      group.add(mesh); waters.push(mesh);
    }
    const hotMaterial = hotWaterMaterial(ripples, lite);
    const hot = new THREE.Mesh(buildHotRiver(lite ? 3 : 2), hotMaterial);
    hot.name = 'water:hot-river'; hot.renderOrder = 2; hot.receiveShadow = true;
    group.add(hot); waters.push(hot);
    const steam = hotSteam(lite);
    group.add(steam.mesh);
    const hotSigns = hotSignsMerged(lite);
    group.add(hotSigns);
    const swimSigns = signsMerged(HABITATION_SWIM_SIGNS, 'swim', lite);
    group.add(swimSigns);
    const apron = buildApron(lite);
    group.add(apron);
    const hills = buildHills(lite);
    group.add(hills);
    const pillarMat = stoneMaterial({ map: stone, normalMap: null, roughnessMap: null, scale: 0.25 });
    for (const p of HABITATION_PILLARS) {
      const mesh = new THREE.Mesh(pillarGeometry(p, lite), pillarMat);
      mesh.name = `pillar:${p.id}`; mesh.castShadow = true; mesh.receiveShadow = true;
      group.add(mesh);
    }
    const contact = pillarContact();
    group.add(contact);
    const textures = fallTextures();
    const falls = HABITATION_FALLS.map((f) => buildFall(f, textures));
    for (const f of falls) group.add(f.sheet, f.spray);
    const woodMat = new THREE.MeshStandardMaterial({ vertexColors: true, color: linear(0x8a6a48), roughness: 0.85, metalness: 0 });
    shared(`deck-wood.${lite ? 'lite' : 'full'}.webp`, true).then((t) => {
      if (!built || built.woodMat !== woodMat) return;
      t.wrapS = t.wrapT = THREE.RepeatWrapping; t.needsUpdate = true;
      woodMat.map = t; woodMat.color.copy(linear(0xf2ece4)); woodMat.needsUpdate = true;
    }, () => {});
    const ropeMat = new THREE.MeshStandardMaterial({ vertexColors: true, color: linear(0xa08a62), roughness: 0.95, metalness: 0 });
    const stoneMat = stoneMaterial({ map: stone, normalMap: null, roughnessMap: null, scale: 0.45 });
    stoneMat.color.copy(linear(0xb9b09c));
    for (const mesh of buildDecks(woodMat, ropeMat, stoneMat)) group.add(mesh);
    const lilies = buildLilies(lite);
    for (const mesh of lilies.meshes) group.add(mesh);
    root.add(group);
    if (!root.parent) scene.add(root);
    const impostors = renderer ? createImpostors(renderer, group, lite) : null;
    const meadow = createMeadow(group, { lite });
    const placed = placeModels(group, { lite, fetchFile, shared, impostors, onModel: (m, error) => { if (error) { placed.failed = (placed.failed || []).concat(m); onError(error, m); } } });
    let triangles = 0;
    group.traverse((o) => { if (o.isMesh && o.geometry.index && !o.isInstancedMesh) triangles += o.geometry.index.count / 3; });
    built = { group, waters, falls, ground, groundPoints, groundMat, textures, materials, grain, ripples, stone, woodMat, ropeMat, stoneMat, pillarMat, placed, impostors, meadow, lilies, hills, contact, hotMaterial, steam, hotSigns, swimSigns, apron };
    placed.loading.then(() => { if (!placed.stopped) stats.modelsMs = Math.round(performance.now() - t0); });
    stats.builds += 1; stats.buildMs = Math.round(performance.now() - t0); stats.triangles = triangles;
    building = false;
  }
  function letGo() {
    if (!built) return;
    const gone = built;
    built = null;
    root.remove(gone.group);
    gone.group.traverse((o) => { if (o.isInstancedMesh) o.dispose(); else if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose(); });
    for (const m of Object.values(gone.materials)) m.dispose();
    for (const m of [gone.woodMat, gone.ropeMat, gone.stoneMat, gone.pillarMat, gone.groundMat]) m.dispose();
    for (const t of [gone.grain, gone.ripples, gone.stone, gone.textures.sheet, gone.textures.puff, gone.textures.foam]) t.dispose();
    for (const f of gone.falls) { f.map.dispose(); f.sheet.material.dispose(); f.veil.material.map.dispose(); f.veil.material.dispose(); f.foam.material.dispose(); f.foam.geometry.dispose(); for (const s of f.puffs) s.material.dispose(); }
    if (gone.impostors) gone.impostors.dispose();
    gone.meadow.dispose();
    gone.lilies.dispose();
    for (const mesh of gone.hills.children) mesh.material.dispose();
    gone.contact.userData.map.dispose(); gone.contact.material.dispose();
    gone.hotMaterial.dispose(); gone.steam.dispose(); gone.apron.material.dispose();
    letSignsGo(gone.hotSigns);
    letSignsGo(gone.swimSigns);
    const placed = gone.placed;
    if (placed) { placed.stopped = true; for (const e of placed.models.values()) e.model.dispose(); }
    for (const p of sharedPictures.values()) p.then((t) => t.dispose(), () => {});
    sharedPictures.clear(); sharedTextures.clear();
    stats.letGo += 1;
  }

  function update(dt, { at = null, eye = null, camera = null, night = 0 } = {}) {
    time += dt;
    waterClock.value = time % 1000;
    setHabitationWind(time);
    const away = at ? habitationAway(at.x, at.z) : Infinity;
    if (away < ROAD_COME) ensureUpriver();
    else if (upriver && away > ROAD_GO) {
      scene.remove(upriver);
      const signs = new Set(signPictures.values());
      upriver.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material && o.material.map && !signs.has(o.material.map)) o.material.map.dispose(); });
      letSignsGo(upriver);
      upriver = null;
    }
    if (!built && !building && away < COME[lite ? 'lite' : 'full']) { try { build(away); } catch (error) { building = false; onError(error); } }
    if (built && away > GO[lite ? 'lite' : 'full']) letGo();
    if (built && lite) { const every = built.ground.userData.every; if (every === 2 && away < NEAR_GROUND.come) swapGround(1); else if (every === 1 && away > NEAR_GROUND.go) swapGround(2); }
    if (built) {
      for (const f of built.falls) f.update(dt, time);
      if (built.placed) { chooseCopies(built.placed, built.impostors, camera, lite, 0.1 + 0.9 * (1 - night), drawn); sleepModels(built.placed, sharedTextures); }
      built.meadow.update(eye);
      if (scene.fog) built.hills.userData.tone(scene.fog.color);
      steamLight.setRGB(1, 1, 1).multiplyScalar(0.25 + 0.75 * (1 - night));
      built.steam.update(eye, steamLight, scene.fog);
    }
  }

  return {
    update,
    get built() { return !!built; },
    get root() { return root; },
    get impostors() { return built ? built.impostors : null; },
    build, letGo,
    state: () => ({ ...stats, built: !!built, building, upriver: !!upriver, steam: built ? built.steam.near : 0, hotSigns: built ? built.hotSigns.children.filter((o) => o.name.startsWith('sign:')).length : 0, swimSigns: built ? built.swimSigns.children.filter((o) => o.name.startsWith('sign:')).length : 0, groundEvery: built ? built.ground.userData.every : 0, groundPieces: built ? built.ground.children.length : 0, waters: built ? built.waters.length : 0, falls: built ? built.falls.length : 0, models: built && built.placed ? built.placed.fetched : 0, of: new Set(HABITATION_STANDING.map((s) => s.m)).size, modelBytes: built && built.placed ? built.placed.bytes : 0, instances: built && built.placed ? built.placed.instances : 0, asleep: built && built.placed ? built.placed.asleep || 0 : 0, pictures: built && built.impostors ? built.impostors.slots.size : 0, drawn: { ...drawn }, wind: +habitationWind().toFixed(2), failed: built && built.placed && built.placed.failed ? [...built.placed.failed] : [], now: built && built.placed && built.placed.now ? { ...built.placed.now } : null }),
  };
}


function createMeadow(scene, { lite = false } = {}) {
  const MOST = lite ? 2600 : 7000, NEAR = lite ? 32 : 55;
  const pos = [], sway = [], col = [];
  for (let i = 0; i < 7; i += 1) {
    const a = i * 2.4, out = 0.03 + (i % 3) * 0.05, bx = Math.cos(a) * out, bz = Math.sin(a) * out, tall = 0.22 + ((i * 5) % 4) * 0.06;
    pos.push(bx - Math.sin(a) * 0.02, 0, bz + Math.cos(a) * 0.02, bx + Math.sin(a) * 0.02, 0, bz - Math.cos(a) * 0.02, bx * 2.6, tall, bz * 2.6);
    sway.push(0, 0, 1);
    col.push(0.7, 0.72, 0.6, 0.7, 0.72, 0.6, 1, 1, 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('sway', new THREE.Float32BufferAttribute(sway, 1));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  const material = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide, vertexColors: true });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWind = { get value() { return habitationWind(); } };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float sway;\nuniform float uWind;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      {
        float seed = (modelMatrix * instanceMatrix[3]).x * 0.71 + (modelMatrix * instanceMatrix[3]).z * 0.53;
        float gust = 0.6 + 0.4 * sin(uWind * 0.21 + seed * 0.05);
        transformed.x += sin(uWind * 2.1 + seed) * 0.05 * sway * gust;
        transformed.z += cos(uWind * 1.7 + seed * 1.3) * 0.04 * sway * gust;
      }`);
  };
  material.customProgramCacheKey = () => 'pcw-habitation-grass';
  const mesh = new THREE.InstancedMesh(g, material, MOST);
  mesh.name = 'habitation-grass'; mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = true; mesh.count = 0;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(mesh);
  const SQ = 8, squares = new Map();
  const b = HABITATION.bounds;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), at = new THREE.Vector3(), sc = new THREE.Vector3(), c = new THREE.Color();
  const green = [linear(0x6f9f48), linear(0x8cb655), linear(0x5f8a3a), linear(0xa9ad5c)];
  const flower = [linear(0xf4f2ea), linear(0xf2d24a), linear(0xe8e4f0)];
  const grows = (x, z) => {
    const f = habitationFooting(x, z);
    if (f && f.kind === 'grass') return 1;
    if (f && f.walk) return 0;                 // (not on paths, decks, sand or in water)
    for (const p of HABITATION_PATHS) {
      if (p.surface === 'sand' || x < p.bounds.x0 || x > p.bounds.x1 || z < p.bounds.z0 || z > p.bounds.z1) continue;
      for (let i = 0; i + 1 < p.line.length; i += 1) {
        const [ax, az] = p.line[i], [bx, bz] = p.line[i + 1], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
        const u = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)), d = Math.hypot(ax + dx * u - x, az + dz * u - z) - p.width / 2;
        if (d > 0 && d < 2.2) return 0.8;
      }
    }
    return 0;
  };
  let made = 0;
  const places = [];
  for (const a of HABITATION_GRASS) places.push({ kind: 'area', a, n: Math.round(((a.bounds.x1 - a.bounds.x0) * (a.bounds.z1 - a.bounds.z0)) * (lite ? 0.9 : 2.2)) });
  for (const p of HABITATION_PATHS) if (p.surface !== 'sand') places.push({ kind: 'path', p, n: Math.round(p.line.slice(1).reduce((s2, [x2, z2], k2) => s2 + Math.hypot(x2 - p.line[k2][0], z2 - p.line[k2][1]), 0) * (lite ? 2.2 : 5)) });
  const candidates = [];
  let seq = 0;
  for (const pl of places) for (let k2 = 0; k2 < pl.n; k2 += 1) {
    seq += 1;
    const r1 = habitationNoise(seq * 0.913 + 0.17, 3.7), r2 = habitationNoise(seq * 0.771 + 0.29, 8.3);
    if (pl.kind === 'area') candidates.push([pl.a.bounds.x0 + r1 * (pl.a.bounds.x1 - pl.a.bounds.x0), pl.a.bounds.z0 + r2 * (pl.a.bounds.z1 - pl.a.bounds.z0)]);
    else {
      const line = pl.p.line, seg = Math.floor(r1 * (line.length - 1)), t = (r1 * (line.length - 1)) % 1;
      const [ax, az] = line[seg], [bx, bz] = line[seg + 1], len = Math.hypot(bx - ax, bz - az) || 1;
      const side = r2 < 0.5 ? -1 : 1, off = pl.p.width / 2 + 0.15 + ((r2 * 2) % 1) * 2.1;
      candidates.push([ax + (bx - ax) * t - ((bz - az) / len) * off * side, az + (bz - az) * t + ((bx - ax) / len) * off * side]);
    }
  }
  for (let i = 0; i < candidates.length && made < (lite ? 26000 : 60000); i += 1) {
    const [x, z] = candidates[i];
    const k = grows(x, z);
    if (!k || habitationNoise(x / 6, z / 6) > 0.35 + k * 0.5) continue;
    const y = habitationGroundAt(x, z);
    const s = 0.8 + habitationNoise(i, 5.1) * 0.9;
    q.setFromAxisAngle(up, habitationNoise(i, 7.3) * 6.28);
    m4.compose(at.set(x, y - 0.02, z), q, sc.set(s, s * (0.8 + habitationNoise(i, 9.1) * 0.7), s));
    const bloom = habitationNoise(i * 1.3, 11.9) > 0.86;
    c.copy(bloom ? flower[i % flower.length] : green[i % green.length]).lerp(green[(i + 1) % green.length], habitationNoise(i, 13.3) * 0.6);
    const key = `${Math.floor(x / SQ)},${Math.floor(z / SQ)}`;
    if (!squares.has(key)) squares.set(key, []);
    squares.get(key).push({ e: Float32Array.from(m4.elements), r: c.r, g: c.g, b: c.b, x, z });
    made += 1;
  }
  const colours = new Float32Array(MOST * 3);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(colours, 3);
  mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  let lastX = Infinity, lastZ = Infinity;
  return {
    mesh,
    get tufts() { return made; },
    update(eye) {
      if (!eye || Math.hypot(eye.x - lastX, eye.z - lastZ) < 3) return;
      lastX = eye.x; lastZ = eye.z;
      let n = 0;
      const r = Math.ceil(NEAR / SQ), ci = Math.floor(eye.x / SQ), cj = Math.floor(eye.z / SQ);
      for (let dj = -r; dj <= r && n < MOST; dj += 1) for (let di = -r; di <= r && n < MOST; di += 1) {
        const list = squares.get(`${ci + di},${cj + dj}`);
        if (!list) continue;
        for (const t of list) {
          if (n >= MOST) break;
          if (Math.hypot(t.x - eye.x, t.z - eye.z) > NEAR) continue;
          mesh.instanceMatrix.array.set(t.e, n * 16);
          colours[n * 3] = t.r; colours[n * 3 + 1] = t.g; colours[n * 3 + 2] = t.b;
          n += 1;
        }
      }
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true;
    },
    dispose() { scene.remove(mesh); g.dispose(); material.dispose(); mesh.dispose(); },
  };
}

return { createHabitation, createMeadow };
})();

__modules["client/render-habitation-life.js"] = (function () {

const { HABITATION, HABITATION_WATERS, HABITATION_STREAMS, HABITATION_STANDING, HABITATION_MODELS, HABITATION_PATHS, HABITATION_SHIFT, habitationWaterAt, habitationLand, habitationGroundAt, habitationFooting } = __modules["sim/zone.js"];
const { linear } = __modules["client/render-kit.js"];

function dice(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const angleTo = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };


const BIRD_KINDS = Object.freeze({
  'grey-parrot': { name: 'African grey parrot', span: 0.5, c: [0x8a8e93, 0x6a6e74, 0xb6babe, 0x9a9ea3, 0xc4242a, 0x1e1e20], tail: 0.7, bill: 1.2, hook: 1, ways: 'perch', speed: 11, flap: 10, song: 'grey-parrot' },
  'senegal-parrot': { name: 'Senegal parrot', span: 0.42, c: [0x3f9a3a, 0x3a8e36, 0x5a5e64, 0xe3a326, 0x3f9a3a, 0x2a2a2c], tail: 0.6, bill: 1.1, hook: 1, ways: 'perch', speed: 11, flap: 11, song: 'senegal-parrot' },
  parakeet: { name: 'Rose-ringed parakeet', span: 0.42, c: [0x79c64a, 0x5fae3a, 0x8ad45a, 0xa8dc78, 0x6cbf46, 0xc62a2a], tail: 2.2, bill: 1.0, hook: 1, ways: 'flock', speed: 13, flap: 12, song: 'parakeet' },
  'blue-turaco': { name: 'Great blue turaco', span: 0.75, c: [0x2d5ea8, 0x2a559a, 0x2f64b0, 0xaebf3a, 0x2d5ea8, 0xe8c21e], tail: 1.6, bill: 1.0, crest: 1, ways: 'perch', speed: 8, flap: 6, song: 'blue-turaco' },
  'violet-turaco': { name: 'Violet turaco', span: 0.55, c: [0x45286a, 0xb3122e, 0x3a2058, 0x45286a, 0x45286a, 0xf08a1c], tail: 1.4, bill: 1.0, crest: 1, ways: 'perch', speed: 9, flap: 7, song: 'violet-turaco' },
  hornbill: { name: 'African pied hornbill', span: 0.9, c: [0x1f1f21, 0x232325, 0x1f1f21, 0xeeeeea, 0x1f1f21, 0xd8c89a], tail: 1.3, bill: 2.6, ways: 'perch', speed: 10, flap: 6, song: 'hornbill' },
  'pied-crow': { name: 'Pied crow', span: 0.95, c: [0x18181a, 0x1c1c1e, 0x18181a, 0xe8e8e6, 0x18181a, 0x18181a], tail: 1.0, bill: 1.3, ways: 'perch', speed: 11, flap: 5, song: 'pied-crow' },
  bulbul: { name: 'Common bulbul', span: 0.28, c: [0x7a6a54, 0x6e5e4a, 0x3a3230, 0xcdbfa6, 0x6e5e4a, 0x1e1e20], tail: 1.1, bill: 0.8, ways: 'low', speed: 9, flap: 15, song: 'bulbul' },
  sunbird: { name: 'Splendid sunbird', span: 0.17, c: [0x1b7f72, 0x214a6e, 0x2b2a7a, 0xb8243a, 0x1b4f6e, 0x161616], tail: 1.0, bill: 1.7, ways: 'low', speed: 9, flap: 20, song: 'sunbird' },
  weaver: { name: 'Village weaver', span: 0.24, c: [0xeec11e, 0x6a5a1e, 0x1c1c1c, 0xf4cc2a, 0x8a7a2a, 0x1c1c1c], tail: 0.8, bill: 0.9, ways: 'flock', speed: 10, flap: 16, song: 'weaver' },
  kingfisher: { name: 'Malachite kingfisher', span: 0.2, c: [0x1f6fd0, 0x1a5fb8, 0x2a80dc, 0xe2782e, 0x1f6fd0, 0xd8261e], tail: 0.6, bill: 1.9, ways: 'kingfisher', speed: 12, flap: 18, song: 'kingfisher' },
  egret: { name: 'Little egret', span: 0.95, c: [0xf3f1ea, 0xf6f4ee, 0xf3f1ea, 0xf3f1ea, 0xf3f1ea, 0x1c1c1c], tail: 0.7, bill: 2.0, legs: 1, neck: 1, ways: 'wade', speed: 8, flap: 4, song: 'egret' },
  ibis: { name: 'Hadada ibis', span: 1.0, c: [0x6b6150, 0x5a6a52, 0x5e5648, 0x6b6150, 0x5e5648, 0x2a2622], tail: 0.7, bill: 2.4, curve: 1, legs: 1, ways: 'wade', speed: 9, flap: 5, song: 'ibis' },
  'fish-eagle': { name: 'African fish eagle', span: 2.0, c: [0x5a3420, 0x3a2618, 0xf2f0ea, 0x6a3a22, 0xf2f0ea, 0xe8c21e], tail: 0.9, bill: 1.2, hook: 1, ways: 'soar', speed: 9, flap: 3, song: 'fish-eagle' },
});

const HOMES = [
  ['entrance-hill', [['bulbul', 3], ['pied-crow', 3], ['weaver', 8], ['sunbird', 2], ['grey-parrot', 2], ['hornbill', 1]]],
  ['forest-path', [['grey-parrot', 4], ['blue-turaco', 3], ['hornbill', 3], ['bulbul', 2], ['violet-turaco', 2], ['sunbird', 2]]],
  ['swamp', [['ibis', 3], ['kingfisher', 2], ['violet-turaco', 2], ['grey-parrot', 3], ['egret', 2]]],
  ['mangroves', [['egret', 4], ['kingfisher', 2], ['senegal-parrot', 3], ['ibis', 1]]],
  ['lagoon', [['egret', 3], ['parakeet', 8], ['senegal-parrot', 3], ['fish-eagle', 1], ['pied-crow', 2], ['kingfisher', 1]]],
  ['gorge', [['kingfisher', 2], ['bulbul', 2], ['sunbird', 3], ['blue-turaco', 2], ['grey-parrot', 2]]],
  ['big-waterfall', [['pied-crow', 2], ['fish-eagle', 1], ['violet-turaco', 2], ['parakeet', 4]]],
  ['waterfall-pool', [['sunbird', 3], ['violet-turaco', 2], ['kingfisher', 1], ['bulbul', 2]]],
  ['overlook', [['hornbill', 2], ['parakeet', 6], ['pied-crow', 1]]],
  ['gazebo-garden', [['sunbird', 3], ['bulbul', 2], ['weaver', 6], ['senegal-parrot', 2]]],
  ['sunset-beach', [['egret', 2], ['ibis', 2], ['grey-parrot', 3], ['pied-crow', 1]]],
];
const CROSSINGS = [['parakeet', 9], ['weaver', 10], ['grey-parrot', 4], ['senegal-parrot', 5]];

function birdGeometry(kind) {
  const k = BIRD_KINDS[kind];
  const col = k.c.map((h) => linear(h));
  const [back, wingC, head, belly, tailC, billC] = col;
  const pos = [], colr = [], wing = [];
  const tri = (a, b, c, cA, cB = cA, cC = cA, w = 0) => { pos.push(...a, ...b, ...c); for (const cc of [cA, cB, cC]) colr.push(cc.r, cc.g, cc.b); wing.push(w, w, w); };
  const neck = k.neck ? 0.06 : 0;
  const rings = [[-0.19, 0.022], [-0.11, 0.05], [0.0, 0.062], [0.08, 0.055], [0.14 + neck, 0.033]];
  const S = 6;
  const ring = (z, r, j) => { const a = (j / S) * TAU; return [Math.cos(a) * r, Math.sin(a) * r * 0.9, z]; };
  for (let i = 0; i + 1 < rings.length; i += 1) for (let j = 0; j < S; j += 1) {
    const a = ring(rings[i][0], rings[i][1], j), b = ring(rings[i][0], rings[i][1], j + 1), c = ring(rings[i + 1][0], rings[i + 1][1], j), d = ring(rings[i + 1][0], rings[i + 1][1], j + 1);
    const ca = a[1] >= 0 ? back : belly, cb = b[1] >= 0 ? back : belly, cc = c[1] >= 0 ? back : belly, cd = d[1] >= 0 ? back : belly;
    tri(a, c, b, ca, cc, cb); tri(b, c, d, cb, cc, cd);
  }
  const hz = 0.19 + neck, hr = 0.042, hy = 0.03 + neck * 0.5;
  const top = [0, hy + hr, hz], bottom = [0, hy - hr, hz], front = [0, hy, hz + hr], rear = [0, hy, hz - hr], left = [-hr * 0.85, hy, hz], right = [hr * 0.85, hy, hz];
  for (const [a, b] of [[front, right], [right, rear], [rear, left], [left, front]]) { tri(top, a, b, head); tri(bottom, b, a, head); }
  if (k.crest) tri([0, hy + hr, hz + 0.01], [0, hy + hr * 2.1, hz - 0.03], [0, hy + hr * 0.6, hz - 0.05], head);
  const bl = 0.045 * (k.bill || 1), bw = 0.014 * Math.min(1.6, k.bill || 1);
  const by = hy - (k.hook ? 0.008 : 0.002), bz = hz + hr * 0.8;
  const tip = [0, by - (k.curve ? bl * 0.45 : k.hook ? bl * 0.35 : bl * 0.1), bz + bl];
  tri([-bw, by, bz], [bw, by, bz], tip, billC); tri([bw, by, bz], [0, by + bw * 1.2, bz], tip, billC); tri([0, by + bw * 1.2, bz], [-bw, by, bz], tip, billC);
  const tl = 0.11 * (k.tail || 1), tz = -0.18;
  tri([-0.025, 0.012, tz], [0.025, 0.012, tz], [0.05 * Math.min(1.4, 0.8 + (k.tail || 1) * 0.25), 0.0, tz - tl], tailC);
  tri([-0.025, 0.012, tz], [0.05 * Math.min(1.4, 0.8 + (k.tail || 1) * 0.25), 0.0, tz - tl], [-0.05 * Math.min(1.4, 0.8 + (k.tail || 1) * 0.25), 0.0, tz - tl], tailC);
  if (k.legs) for (const s of [-1, 1]) { const x = s * 0.018; tri([x - 0.006, -0.03, 0.0], [x + 0.006, -0.03, 0.0], [x, -0.26, 0.02], billC); tri([x, -0.03, -0.006], [x, -0.03, 0.006], [x, -0.26, 0.02], billC); }
  const tipC = wingC.clone().multiplyScalar(0.7);
  for (const s of [-1, 1]) {
    const r0 = [s * 0.04, 0.03, 0.07], r1 = [s * 0.04, 0.03, -0.07];
    const m0 = [s * 0.27, 0.04, 0.06], m1 = [s * 0.27, 0.04, -0.09];
    const t0 = [s * 0.5, 0.03, -0.04], t1 = [s * 0.46, 0.03, -0.12];
    const add = (a, b, c, ca, cb, cc) => (s > 0 ? tri(a, b, c, ca, cb, cc, 1) : tri(a, c, b, ca, cc, cb, 1));
    add(r0, m0, r1, wingC, wingC, wingC); add(r1, m0, m1, wingC, wingC, wingC);
    add(m0, t0, m1, wingC, tipC, wingC); add(m1, t0, t1, wingC, tipC, tipC);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
  g.setAttribute('birdWing', new THREE.Float32BufferAttribute(wing, 1));
  g.computeVertexNormals();
  return g;
}

function birdMaterial(clock) {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.birdTime = clock;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float birdWing;\nattribute vec4 birdState;\nuniform float birdTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      if (birdWing > 0.5) {
        float r = abs(transformed.x), s = sign(transformed.x);
        float a = birdState.y * sin(birdTime * birdState.x + birdState.z);
        float fold = birdState.w;
        float rr = mix(r, 0.05 + r * 0.12, fold);
        transformed.z = mix(transformed.z, transformed.z - r * 0.32, fold);
        transformed.x = s * rr * cos(a);
        transformed.y += rr * sin(a) + fold * 0.012;
      }`);
  };
  m.customProgramCacheKey = () => 'pcw-habitation-bird';
  return m;
}


function fishGeometry(backHex, bellyHex, finHex) {
  const back = linear(backHex), belly = linear(bellyHex), fin = linear(finHex);
  const pos = [], col = [], bend = [];
  const push = (p, c, b) => { pos.push(...p); col.push(c.r, c.g, c.b); bend.push(b); };
  const rings = [[0.5, 0.0], [0.38, 0.07], [0.15, 0.11], [-0.12, 0.09], [-0.3, 0.035]];
  const S = 6;
  for (let i = 0; i + 1 < rings.length; i += 1) for (let j = 0; j < S; j += 1) {
    const p = (ri, jj) => { const a = (jj / S) * TAU; const [z, r] = rings[ri]; return [Math.cos(a) * r * 0.55, Math.sin(a) * r, z]; };
    const a = p(i, j), b = p(i, j + 1), c = p(i + 1, j), d = p(i + 1, j + 1);
    const cOf = (q) => (q[1] >= 0 ? back : belly), bOf = (q) => clamp((0.5 - q[2]) / 0.9, 0, 1);
    for (const q of [a, c, b, b, c, d]) push(q, cOf(q), bOf(q));
  }
  for (const q of [[0, 0, -0.28], [0, 0.13, -0.48], [0, -0.13, -0.48]]) push(q, fin, 1);
  for (const q of [[0, 0.1, 0.1], [0, 0.17, -0.02], [0, 0.08, -0.12]]) push(q, back, 0.3);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('fishBend', new THREE.Float32BufferAttribute(bend, 1));
  g.computeVertexNormals();
  return g;
}
function fishMaterial(clock) {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.fishTime = clock;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float fishBend;\nattribute vec3 fishState;\nuniform float fishTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      transformed.x += sin(fishTime * fishState.x + fishState.z - transformed.z * 7.0) * fishState.y * fishBend * fishBend;`);
  };
  m.customProgramCacheKey = () => 'pcw-habitation-fish';
  return m;
}
const FISH_KINDS = Object.freeze({
  tilapia: { back: 0x4a5a52, belly: 0xc9cfc6, fin: 0x5a6a5a, size: [0.16, 0.28] },
  minnow: { back: 0x5a5a44, belly: 0xd8d4c0, fin: 0x6a6a52, size: [0.07, 0.12] },
  gold: { back: 0xd8661c, belly: 0xf2c060, fin: 0xe88a3a, size: [0.18, 0.3] },
});
const SHOALS = [
  { water: 'lagoon', near: [2168, 132], fish: 9, kind: 'tilapia' },
  { water: 'lagoon', near: [2232, 132], fish: 8, kind: 'tilapia' },
  { water: 'lagoon', near: [2198, 172], fish: 9, kind: 'minnow' },
  { water: 'lagoon', near: [2210, 230], fish: 7, kind: 'tilapia' },
  { water: 'lagoon', near: [2196, 326], fish: 9, kind: 'minnow' },
  { water: 'lagoon', near: [2236, 334], fish: 7, kind: 'tilapia' },
  { water: 'lagoon', near: [2290, 146], fish: 6, kind: 'tilapia' },
  { water: 'falls-pool', near: [2346, 322], fish: 7, kind: 'tilapia' },
  { water: 'falls-pool', near: [2356, 334], fish: 6, kind: 'minnow' },
  { water: 'big-pool', near: [2456, 222], fish: 7, kind: 'tilapia' },
  { water: 'garden-pool', near: [2158, 404], fish: 5, kind: 'gold' },
  { water: 'gorge', near: [2340, 118], fish: 5, kind: 'minnow' },
  { water: 'gorge', near: [2402, 74], fish: 4, kind: 'minnow' },
  { water: 'falls-run', near: [2328, 306], fish: 4, kind: 'minnow' },
].map((s) => ({ ...s, near: [s.near[0] + HABITATION_SHIFT, s.near[1]] }));


function footprintTexture() {
  const c = document.createElement('canvas'); c.width = 32; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,0)'; g.fillRect(0, 0, 32, 64);
  const blob = (x, y, rx, ry, a) => { const r = g.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry)); r.addColorStop(0, `rgba(255,255,255,${a})`); r.addColorStop(0.7, `rgba(255,255,255,${a * 0.75})`); r.addColorStop(1, 'rgba(255,255,255,0)'); g.save(); g.translate(x, y); g.scale(rx / Math.max(rx, ry), ry / Math.max(rx, ry)); g.translate(-x, -y); g.fillStyle = r; g.beginPath(); g.arc(x, y, Math.max(rx, ry), 0, TAU); g.fill(); g.restore(); };
  blob(16, 50, 8, 10, 0.9);       // the heel
  blob(17, 30, 9, 13, 0.8);       // the ball of the foot
  for (const [x, y, r] of [[11, 13, 3.5], [16, 11, 3], [20, 12, 2.6], [23.5, 14, 2.2], [26, 17, 2]]) blob(x, y, r, r, 0.85);
  const t = new THREE.CanvasTexture(c);
  return t;
}


function createHabitationLife(scene, { lite = false } = {}) {
  const rand = dice(20261020);
  const group = new THREE.Group(); group.name = 'habitation-life';
  scene.add(group);
  const clock = { value: 0 };
  let time = 0;
  const share = lite ? 0.8 : 1;

  const crowns = [], bushes = [], waterside = [], wading = [];
  for (const p of HABITATION_STANDING) {
    const info = HABITATION_MODELS[p.m];
    if (!info) continue;
    const ground = p.y !== null ? p.y : habitationGroundAt(p.x, p.z);
    if (info.kind === 'tree' || info.kind === 'palm') crowns.push({ x: p.x, y: ground + p.s * (info.kind === 'palm' ? 0.93 : 0.86), z: p.z, high: p.s });
    else if (info.kind === 'shrub' || info.kind === 'banana' || info.kind === 'herb') bushes.push({ x: p.x, y: ground + p.s * 0.92, z: p.z, high: p.s });
    else if (info.kind === 'rock') { const w = habitationWaterAt(p.x + 1.5, p.z) || habitationWaterAt(p.x - 1.5, p.z) || habitationWaterAt(p.x, p.z + 1.5) || habitationWaterAt(p.x, p.z - 1.5); if (w && w.kind !== 'river') waterside.push({ x: p.x, y: ground + p.s * 0.85, z: p.z, water: w }); }
  }
  const nearPath = (x, z, within) => HABITATION_PATHS.some((p) => p.line.some(([px, pz], i) => { if (i === 0) return false; const [ax, az] = p.line[i - 1], dx = px - ax, dz = pz - az, l2 = dx * dx + dz * dz || 1; const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)); return Math.hypot(ax + dx * t - x, az + dz * t - z) < p.width / 2 + within; }));
  const lows = bushes.filter((b) => b.high < 4.5 && nearPath(b.x, b.z, 8));
  const verges = [];
  for (const p of HABITATION_PATHS) for (let i = 0; i + 1 < p.line.length; i += 1) {
    const [ax, az] = p.line[i], [bx, bz] = p.line[i + 1], len = Math.hypot(bx - ax, bz - az) || 1;
    for (let d = 2; d < len; d += 5) for (const side of [-1, 1]) {
      const off = p.width / 2 + 1.5 + rand() * 3, x = ax + ((bx - ax) * d) / len - ((bz - az) / len) * side * off, z = az + ((bz - az) * d) / len + ((bx - ax) / len) * side * off;
      const f = habitationFooting(x, z);
      if (f && f.walk && !f.deck && f.kind !== 'shallows') verges.push({ x, y: habitationGroundAt(x, z), z, ground: true });
    }
  }
  for (let i = 0; i < 2400 && wading.length < 160; i += 1) {
    const b = HABITATION.bounds;
    const x = b.x0 + rand() * (b.x1 - b.x0), z = b.z0 + rand() * (b.z1 - b.z0);
    const w = habitationWaterAt(x, z);
    if (w && w.kind !== 'river' && w.kind !== 'rapids' && w.depth > 0.03 && w.depth < 0.22) wading.push({ x, y: w.level - w.depth, z, water: w.id });
  }
  const placeOf = (id) => HABITATION.places.find((p) => p.id === id);
  const nearest = (list, x, z, within, filter = () => true) => { const out = []; for (const p of list) { const d = Math.hypot(p.x - x, p.z - z); if (d < within && filter(p)) out.push(p); } return out; };

  const kinds = Object.keys(BIRD_KINDS);
  const birdMat = birdMaterial(clock);
  const birdMeshes = new Map();       // kind -> { mesh, state, list }
  const birds = [];
  for (const [placeId, list] of HOMES) {
    const place = placeOf(placeId);
    if (!place) continue;
    for (const [kind, many] of list) {
      const n = Math.max(1, Math.round(many * share));
      const k = BIRD_KINDS[kind];
      const flockOf = k.ways === 'flock' ? { leader: null, members: [] } : null;
      for (let i = 0; i < n; i += 1) {
        const b = { kind, k, home: place, x: place.x, y: 8, z: place.z, h: rand() * TAU, pitch: 0, mode: 'rest', wait: rand() * 8, from: null, to: null, ctrl: null, t: 0, dur: 1, flap: 0, fold: 1, phase: rand() * TAU, rate: k.flap * (0.9 + rand() * 0.2), songAt: rand() * 12, flock: flockOf, spot: null, roost: false };
        if (flockOf) { if (!flockOf.leader) flockOf.leader = b; else flockOf.members.push(b); b.offset = [(rand() - 0.5) * 6, (rand() - 0.5) * 2, (rand() - 0.5) * 6]; }
        birds.push(b);
      }
    }
  }
  const crossings = [];
  for (const [kind, many] of CROSSINGS) {
    const k = BIRD_KINDS[kind], n = Math.max(3, Math.round(many * share));
    const flock = { kind, members: [], t: 0, dur: 1, from: null, to: null, ctrl: null, callAt: 0 };
    for (let i = 0; i < n; i += 1) {
      const b = { kind, k, home: HABITATION.places[0], x: 0, y: -1000, z: 0, h: 0, pitch: 0, mode: 'idle', wait: 0, flap: 0, fold: 0, phase: rand() * TAU, rate: k.flap * (0.9 + rand() * 0.2), songAt: Infinity, flock: null, spot: null, roost: false, cross: flock, offset: [(rand() - 0.5) * 9, (rand() - 0.5) * 3, (rand() - 0.5) * 9] };
      flock.members.push(b); birds.push(b);
    }
    crossings.push(flock);
  }
  let nextCrossing = 6 + rand() * 6, crossingTurn = 0;
  const GROUNDERS = new Set(['pied-crow', 'hornbill', 'ibis']);
  const spotFor = (b, from = b.home, within = 90) => {
    const k = b.k;
    let list;
    if (k.ways === 'wade') list = nearest(wading, from.x, from.z, within);
    else if (k.ways === 'kingfisher') list = nearest(waterside, from.x, from.z, within * 1.6);
    else if (k.ways === 'low') list = nearest(rand() < 0.6 && lows.length ? lows : bushes, from.x, from.z, within, (p) => p.high > 1.0);
    else if (k.ways === 'perch' && rand() < 0.5) list = GROUNDERS.has(b.kind) && rand() < 0.6 ? nearest(verges, from.x, from.z, within) : nearest(lows, from.x, from.z, within);
    else list = nearest(crowns, from.x, from.z, within, (p) => p.high > (k.span > 0.7 ? 9 : 5));
    if (!list || !list.length) list = nearest(crowns, from.x, from.z, within, (p) => p.high > (k.span > 0.7 ? 9 : 5));
    if (!list.length) list = nearest(crowns, from.x, from.z, within * 2);
    if (!list.length) return { x: from.x, y: habitationLand(from.x, from.z) + 8, z: from.z };
    const p = list[Math.floor(rand() * list.length)];
    if (k.ways === 'wade') return { x: p.x, y: p.y + 0.24 * k.span, z: p.z, water: p.water };
    if (p.ground) return { x: p.x, y: p.y + 0.2 * k.span, z: p.z, ground: true };
    const spread = k.ways === 'wade' ? 0 : Math.min(2.4, 0.6 + (p.high || 2) * 0.08);
    const a = rand() * TAU;
    return { x: p.x + Math.cos(a) * spread * rand(), y: p.y, z: p.z + Math.sin(a) * spread * rand(), water: p.water };
  };
  for (const b of birds) {
    if (b.cross) continue;
    if (b.k.ways === 'soar') { b.mode = 'soar'; b.circle = { x: b.home.x + (rand() - 0.5) * 60, z: b.home.z + (rand() - 0.5) * 60, r: 34 + rand() * 30, y: 48 + rand() * 30, dir: rand() < 0.5 ? 1 : -1 }; b.a = rand() * TAU; continue; }
    const s = b.flock && b.flock.leader !== b ? null : spotFor(b);
    if (s) { b.x = s.x; b.y = s.y; b.z = s.z; b.spot = s; }
  }
  for (const b of birds) if (!b.cross && b.flock && b.flock.leader !== b) { const L = b.flock.leader; b.x = L.x + b.offset[0] * 0.3; b.y = L.y; b.z = L.z + b.offset[2] * 0.3; b.spot = { x: b.x, y: b.y, z: b.z }; }
  for (const kind of kinds) {
    const list = birds.filter((b) => b.kind === kind);
    if (!list.length) continue;
    const geometry = birdGeometry(kind);
    const state = new Float32Array(list.length * 4);
    geometry.setAttribute('birdState', new THREE.InstancedBufferAttribute(state, 4));
    const mesh = new THREE.InstancedMesh(geometry, birdMat, list.length);
    mesh.name = `bird:${kind}`; mesh.frustumCulled = false; mesh.castShadow = false;
    group.add(mesh);
    birdMeshes.set(kind, { mesh, state, list });
  }

  function fly(b, to, { low = false } = {}) {
    const from = { x: b.x, y: b.y, z: b.z };
    const d = Math.hypot(to.x - from.x, to.z - from.z);
    let top = Math.max(from.y, to.y) + (low ? 0.8 : 2 + Math.min(10, d * 0.12));
    for (let i = 1; i < 6; i += 1) { const u = i / 6; top = Math.max(top, habitationLand(from.x + (to.x - from.x) * u, from.z + (to.z - from.z) * u) + (low ? 2 : 6)); }
    b.from = from; b.to = to; b.ctrl = { x: (from.x + to.x) / 2, y: top + (top - (from.y + to.y) / 2) * 0.6, z: (from.z + to.z) / 2 };
    b.t = 0; b.dur = Math.max(1.2, (d + Math.abs(to.y - from.y) * 0.5) / b.k.speed);
    b.mode = 'fly';
  }
  const bez = (a, c, b, u) => (1 - u) * (1 - u) * a + 2 * (1 - u) * u * c + u * u * b;

  const fishMat = fishMaterial(clock);
  const fishMeshes = new Map();
  const shoals = [];
  const waterKinds = new Map(HABITATION_WATERS.map((w) => [w.id, w]));
  for (const s of SHOALS) {
    const n = Math.max(2, Math.round(s.fish * share));
    const spots = [];
    for (let i = 0; i < 600 && spots.length < 40; i += 1) {
      const x = s.near[0] + (rand() - 0.5) * 36, z = s.near[1] + (rand() - 0.5) * 36;
      const w = habitationWaterAt(x, z);
      if (w && w.id === s.water && w.depth > 0.28 && w.depth < 2.6) spots.push({ x, z });
    }
    if (spots.length < 3) continue;
    const kind = FISH_KINDS[s.kind];
    const shoal = { water: s.water, spots, at: { ...spots[0] }, goal: spots[1], scare: 0, fish: [] };
    for (let i = 0; i < n; i += 1) {
      const size = kind.size[0] + rand() * (kind.size[1] - kind.size[0]);
      const w0 = waterKinds.get(s.water) || HABITATION_STREAMS.find((q) => q.id === s.water);
      const at0 = habitationWaterAt(shoal.at.x, shoal.at.z);
      shoal.fish.push({ kind: s.kind, size, x: shoal.at.x, z: shoal.at.z, y: 0, h: rand() * TAU, v: 0.3, off: [(rand() - 0.5) * 3.2, (rand() - 0.5) * 3.2], scare: 0, rate: 9 + rand() * 4, phase: rand() * TAU, check: rand() * 0.3, ok: true, level: at0 ? at0.level : w0 && w0.level !== undefined ? w0.level : 0, depth: at0 ? at0.depth : 0.6 });
    }
    shoals.push(shoal);
  }
  for (const [kindId, kind] of Object.entries(FISH_KINDS)) {
    const list = shoals.flatMap((s) => s.fish.filter((f) => f.kind === kindId).map((f) => ({ f, s })));
    if (!list.length) continue;
    const geometry = fishGeometry(kind.back, kind.belly, kind.fin);
    const state = new Float32Array(list.length * 3);
    geometry.setAttribute('fishState', new THREE.InstancedBufferAttribute(state, 3));
    const mesh = new THREE.InstancedMesh(geometry, fishMat, list.length);
    mesh.name = `fish:${kindId}`; mesh.frustumCulled = false; mesh.castShadow = false;
    group.add(mesh);
    fishMeshes.set(kindId, { mesh, state, list });
  }

  const FLY_AREAS = [[2040, -80, 40], [2030, 70, 30], [2070, 150, 30], [2160, 400, 22], [1990, 40, 26]].map(([x, z, r]) => [x + HABITATION_SHIFT, z, r]);
  const flyCount = lite ? 40 : 90;
  const flies = [];
  for (let i = 0; i < flyCount; i += 1) { const a = FLY_AREAS[i % FLY_AREAS.length]; const x = a[0] + (rand() - 0.5) * 2 * a[2], z = a[1] + (rand() - 0.5) * 2 * a[2]; flies.push({ x, z, y: 0.6 + rand() * 2.2, base: habitationLand(x, z), a: rand() * TAU, s: 0.3 + rand() * 0.5, blink: rand() * 10, rate: 0.35 + rand() * 0.5 }); }
  const flyPos = new Float32Array(flyCount * 3), flyCol = new Float32Array(flyCount * 3);
  const flyGeom = new THREE.BufferGeometry();
  flyGeom.setAttribute('position', new THREE.BufferAttribute(flyPos, 3));
  flyGeom.setAttribute('color', new THREE.BufferAttribute(flyCol, 3));
  const dot = (() => { const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d'); const r = g.createRadialGradient(16, 16, 0, 16, 16, 16); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.3, 'rgba(255,255,255,0.6)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 32, 32); return new THREE.CanvasTexture(c); })();
  const fireflies = new THREE.Points(flyGeom, new THREE.PointsMaterial({ size: 0.32, map: dot, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false }));
  fireflies.name = 'fireflies'; fireflies.frustumCulled = false; fireflies.visible = false;
  group.add(fireflies);

  const PRINTS = lite ? 90 : 180;
  const printTex = footprintTexture();
  const printGeom = new THREE.PlaneGeometry(0.13, 0.28); printGeom.rotateX(-Math.PI / 2);
  const printFade = new Float32Array(PRINTS);
  printGeom.setAttribute('printFade', new THREE.InstancedBufferAttribute(printFade, 1));
  const printMat = new THREE.MeshBasicMaterial({ map: printTex, color: linear(0x6e5a3e), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  printMat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute float printFade;\nvarying float vPrintFade;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvPrintFade = printFade;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vPrintFade;').replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.a = texture2D(map, vMapUv).r * 0.42 * vPrintFade;');
  };
  printMat.customProgramCacheKey = () => 'pcw-habitation-print';
  const prints = new THREE.InstancedMesh(printGeom, printMat, PRINTS);
  prints.name = 'footprints'; prints.frustumCulled = false; prints.count = 0; prints.renderOrder = 1;
  group.add(prints);
  const printList = [];            // { x, y, z, h, side, age }
  const walkers = new Map();       // key -> { x, z, gone, side }
  const PRINT_LIFE = 90;           // seconds before a print has faded away

  const calls = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(0, 0, 0, 'YXZ'), sc = new THREE.Vector3(), at = new THREE.Vector3();
  const stats = { birds: birds.length, fish: shoals.reduce((n, s) => n + s.fish.length, 0), shoals: shoals.length, kinds: birdMeshes.size, flying: 0, sitting: 0, wading: 0, soaring: 0, scattered: 0, prints: 0, fireflies: 0, flushed: 0 };

  function startCrossing(eye, look) {
    const flock = crossings[crossingTurn % crossings.length]; crossingTurn += 1;
    const fx = look ? look.x : 1, fz = look ? look.z : 0, fl = Math.hypot(fx, fz) || 1;
    const ux = fx / fl, uz = fz / fl, rx = -uz, rz = ux;
    const ahead = 28 + rand() * 30, wide = 70, side = rand() < 0.5 ? 1 : -1, slant = (rand() - 0.5) * 30;
    const a = { x: eye.x + ux * (ahead + slant) - rx * wide * side, z: eye.z + uz * (ahead + slant) - rz * wide * side };
    const c = { x: eye.x + ux * (ahead - slant) + rx * wide * side, z: eye.z + uz * (ahead - slant) + rz * wide * side };
    let top = 0;
    for (let i = 0; i <= 6; i += 1) { const u = i / 6; top = Math.max(top, habitationLand(a.x + (c.x - a.x) * u, a.z + (c.z - a.z) * u)); }
    const y = Math.max(top, habitationLand(eye.x, eye.z)) + 9 + rand() * 7;
    flock.from = { x: a.x, y: y + 4, z: a.z }; flock.to = { x: c.x, y: y + 2, z: c.z };
    flock.ctrl = { x: (a.x + c.x) / 2 + ux * 6, y: y - 3, z: (a.z + c.z) / 2 + uz * 6 };
    flock.t = 0; flock.dur = Math.hypot(c.x - a.x, c.z - a.z) / (BIRD_KINDS[flock.kind].speed * 1.1);
    flock.callAt = 0.5;
    for (const m of flock.members) m.mode = 'cross';
    stats.crossings = (stats.crossings || 0) + 1;
  }
  function updateBirds(dt, people, night, eye, look) {
    const roost = night > 0.55;
    stats.flying = stats.sitting = stats.wading = stats.soaring = 0;
    const b0 = HABITATION.bounds, inside = eye && eye.x > b0.x0 && eye.x < b0.x1 && eye.z > b0.z0 && eye.z < b0.z1;
    nextCrossing -= dt;
    if (nextCrossing <= 0 && inside && !roost && !crossings.some((f) => f.members[0].mode === 'cross')) { startCrossing(eye, look); nextCrossing = 16 + rand() * 18; }
    for (const f of crossings) {
      if (f.members[0].mode !== 'cross') continue;
      f.t += dt / f.dur;
      const u = Math.min(1, f.t);
      if (u > f.callAt && calls.length < 24) { const m = f.members[0]; calls.push({ song: BIRD_KINDS[f.kind].song, kind: f.kind, x: m.x, y: m.y, z: m.z }); f.callAt += 0.18 + rand() * 0.2; }
      for (const m of f.members) {
        const nx = bez(f.from.x, f.ctrl.x, f.to.x, u) + m.offset[0], ny = bez(f.from.y, f.ctrl.y, f.to.y, u) + m.offset[1], nz = bez(f.from.z, f.ctrl.z, f.to.z, u) + m.offset[2];
        if (Math.hypot(nx - m.x, nz - m.z) > 1e-4 && m.y > -100) m.h = Math.atan2(nx - m.x, nz - m.z);
        m.x = nx; m.y = ny; m.z = nz; m.flap = 0.75; m.fold = 0; m.pitch = 0;
        if (u >= 1) { m.mode = 'idle'; m.y = -1000; }
      }
      stats.flying += f.members.length;
    }
    for (const b of birds) {
      const k = b.k;
      if (b.cross) continue;
      if (b.mode === 'soar') {
        if (roost) { const s = spotFor(b, b, 160); fly(b, s); b.roost = true; continue; }
        b.a += dt * (k.speed / b.circle.r) * b.circle.dir;
        b.circle.x += Math.sin(time * 0.013 + b.phase) * dt * 0.8; b.circle.z += Math.cos(time * 0.011 + b.phase) * dt * 0.8;
        const nx = b.circle.x + Math.cos(b.a) * b.circle.r, nz = b.circle.z + Math.sin(b.a) * b.circle.r;
        const ny = b.circle.y + Math.sin(time * 0.2 + b.phase) * 3;
        b.h = Math.atan2(nx - b.x, nz - b.z); b.pitch = 0; b.x = nx; b.y = ny; b.z = nz;
        b.flap = Math.sin(time * 0.35 + b.phase) > 0.85 ? 0.5 : 0.04; b.fold = 0;
        stats.soaring += 1;
      } else if (b.mode === 'fly') {
        b.t += dt / b.dur;
        const u = Math.min(1, b.t), eu = u < 0.85 ? u : 0.85 + (1 - Math.pow(1 - (u - 0.85) / 0.15, 2)) * 0.15;
        const nx = bez(b.from.x, b.ctrl.x, b.to.x, eu), ny = bez(b.from.y, b.ctrl.y, b.to.y, eu), nz = bez(b.from.z, b.ctrl.z, b.to.z, eu);
        const dx = nx - b.x, dz = nz - b.z, dy = ny - b.y;
        if (Math.hypot(dx, dz) > 1e-4) b.h = Math.atan2(dx, dz);
        b.pitch = clamp(-Math.atan2(dy, Math.hypot(dx, dz) + 1e-4), -0.5, 0.5);
        b.x = nx; b.y = ny; b.z = nz;
        b.flap = u > 0.88 ? 0.9 : dy > 0.02 ? 0.8 : 0.45 + 0.25 * Math.sin(time * 0.9 + b.phase); b.fold = 0;
        if (u >= 1) {
          if (k.ways === 'soar' && !b.roost) { b.mode = 'soar'; b.a = Math.atan2(b.z - b.circle.z, b.x - b.circle.x); }
          else { b.mode = k.ways === 'wade' && b.to.water ? 'wade' : 'rest'; b.spot = b.to; b.wait = (k.ways === 'flock' ? 4 : 5) + rand() * (k.ways === 'wade' ? 24 : 12); b.pitch = 0; }
        }
        stats.flying += 1;
      } else {
        b.fold = Math.min(1, b.fold + dt * 3); b.flap = 0;
        if (b.mode === 'wade') {
          stats.wading += 1;
          if (b.step) { const d = Math.hypot(b.step.x - b.x, b.step.z - b.z); if (d < 0.05) b.step = null; else { const s = Math.min(d, dt * 0.35); b.h = Math.atan2(b.step.x - b.x, b.step.z - b.z); b.x += ((b.step.x - b.x) / d) * s; b.z += ((b.step.z - b.z) / d) * s; } }
          else if (rand() < dt * 0.15) { const a = rand() * TAU, r = 0.6 + rand() * 1.4, x = b.x + Math.cos(a) * r, z = b.z + Math.sin(a) * r, w = habitationWaterAt(x, z); if (w && w.depth < 0.25) b.step = { x, z }; }
          const w = habitationWaterAt(b.x, b.z);
          if (w) b.y = w.level - Math.min(0.22, w.depth) + 0.24 * k.span;
        } else stats.sitting += 1;
        const low = b.spot && b.y - habitationLand(b.x, b.z) < 6;
        const shy = k.ways === 'wade' ? 9 : k.ways === 'kingfisher' ? 6 : k.ways === 'low' ? 4 : low ? 7 : 0;
        let flushed = false;
        if (shy) for (const p of people) if (Math.hypot(p.x - b.x, p.z - b.z) < shy && Math.abs((p.y || 0) - b.y) < 6) { flushed = true; break; }
        b.wait -= dt;
        if (flushed && !roost) { stats.flushed += 1; if (calls.length < 24) calls.push({ song: k.song, kind: b.kind, x: b.x, y: b.y, z: b.z, alarm: true }); fly(b, spotFor(b, b, 70), { low: k.ways === 'wade' }); continue; }
        if (k.ways === 'soar' && b.wait <= 0 && !roost) {
          b.roost = false;
          fly(b, { x: b.circle.x + Math.cos(b.a) * b.circle.r, y: b.circle.y, z: b.circle.z + Math.sin(b.a) * b.circle.r });
          continue;
        }
        if (b.wait <= 0 && !roost && !(b.flock && b.flock.leader !== b)) {
          if (k.ways === 'kingfisher' && rand() < 0.5 && b.spot) { const a = rand() * TAU, x = b.x + Math.cos(a) * 4, z = b.z + Math.sin(a) * 4, w = habitationWaterAt(x, z); if (w) { const back = { ...b.spot }; fly(b, { x, y: w.level + 0.05, z }, { low: true }); b.then = back; continue; } }
          const from = Math.hypot(b.x - b.home.x, b.z - b.home.z) > 70 ? b.home : b;
          fly(b, spotFor(b, from, 70), { low: k.ways === 'wade' });
          if (b.flock) for (const m of b.flock.members) { const t = { x: b.to.x + m.offset[0] * 0.25, y: b.to.y + Math.abs(m.offset[1]) * 0.2, z: b.to.z + m.offset[2] * 0.25 }; fly(m, t); m.dur = b.dur * (0.95 + rand() * 0.1); }
        }
        if (b.then && b.mode === 'rest') { const back = b.then; b.then = null; b.wait = 0; fly(b, back, { low: true }); }
      }
      if (!roost && time > b.songAt) {
        b.songAt = time + (k.ways === 'flock' ? 2 + rand() * 5 : k.ways === 'soar' ? 18 + rand() * 30 : 4 + rand() * 12);
        if (eye && Math.hypot(b.x - eye.x, b.z - eye.z) < 150 && calls.length < 24) calls.push({ song: k.song, kind: b.kind, x: b.x, y: b.y, z: b.z });
      }
    }
    for (const { mesh, state, list } of birdMeshes.values()) {
      let n = 0;
      for (const b of list) {
        if (b.mode === 'idle') continue;
        if (eye && Math.hypot(b.x - eye.x, b.z - eye.z) > (lite ? 220 : 340)) continue;
        e.set(b.pitch, b.h, b.mode === 'soar' ? -0.25 * b.circle.dir : 0);
        q.setFromEuler(e);
        const s = b.k.span;
        at.set(b.x, b.y + (b.mode === 'rest' ? s * 0.04 : 0), b.z);
        m4.compose(at, q, sc.set(s, s, s));
        mesh.setMatrixAt(n, m4);
        state[n * 4] = b.rate; state[n * 4 + 1] = b.flap; state[n * 4 + 2] = b.phase; state[n * 4 + 3] = b.fold;
        n += 1;
      }
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.geometry.attributes.birdState.needsUpdate = true;
    }
  }

  function updateFish(dt, people, eye) {
    stats.scattered = 0;
    for (const s of shoals) {
      let fright = null;
      for (const f of s.fish) for (const p of people) { const d = Math.hypot(p.x - f.x, p.z - f.z); if (d < 4.2) { fright = p; break; } }
      if (fright && s.scare <= 0) {
        s.scare = 3.5;
        let best = null, far = -1;
        for (let i = 0; i < 8; i += 1) { const c = s.spots[Math.floor(rand() * s.spots.length)]; const d = Math.hypot(c.x - fright.x, c.z - fright.z); if (d > far) { far = d; best = c; } }
        s.goal = best;
        for (const f of s.fish) { const d = Math.hypot(f.x - fright.x, f.z - fright.z) || 1; f.scare = 1.4 + rand() * 0.6; f.away = [(f.x - fright.x) / d, (f.z - fright.z) / d]; }
      }
      s.scare = Math.max(0, s.scare - dt);
      if (s.scare > 0) stats.scattered += 1;
      const gx = s.goal.x - s.at.x, gz = s.goal.z - s.at.z, gd = Math.hypot(gx, gz);
      if (gd < 0.8) s.goal = s.spots[Math.floor(rand() * s.spots.length)];
      else { const v = (s.scare > 0 ? 2.6 : 0.35) * dt; s.at.x += (gx / gd) * Math.min(gd, v); s.at.z += (gz / gd) * Math.min(gd, v); }
      for (const f of s.fish) {
        let tx, tz, speed;
        if (f.scare > 0) { f.scare -= dt; tx = f.x + f.away[0] * 3; tz = f.z + f.away[1] * 3; speed = 3.4; }
        else { const a = time * 0.15 + f.phase; tx = s.at.x + f.off[0] + Math.cos(a) * 0.6; tz = s.at.z + f.off[1] + Math.sin(a) * 0.6; speed = Math.min(0.9, 0.25 + Math.hypot(tx - f.x, tz - f.z) * 0.35); }
        const want = Math.atan2(tx - f.x, tz - f.z);
        f.h += clamp(angleTo(f.h, want), -dt * (f.scare > 0 ? 9 : 2.4), dt * (f.scare > 0 ? 9 : 2.4));
        f.v += (speed - f.v) * Math.min(1, dt * (f.scare > 0 ? 6 : 1.5));
        const nx = f.x + Math.sin(f.h) * f.v * dt, nz = f.z + Math.cos(f.h) * f.v * dt;
        f.check -= dt;
        if (f.check <= 0) { f.check = 0.25; const w = habitationWaterAt(nx, nz); f.ok = !!w && w.id === s.water && w.depth > 0.18; f.level = w ? w.level : f.level; f.depth = w ? w.depth : f.depth; }
        if (f.ok) { f.x = nx; f.z = nz; } else { f.h += Math.PI * 0.6; f.check = 0; }
        const depth = f.depth || 0.5;
        f.y = (f.level !== undefined ? f.level : 0) - clamp(depth * 0.45, 0.1, 0.8);
      }
    }
    for (const { mesh, state, list } of fishMeshes.values()) {
      let n = 0;
      for (const { f } of list) {
        if (eye && Math.hypot(f.x - eye.x, f.z - eye.z) > (lite ? 45 : 70)) continue;
        e.set(0, f.h, 0); q.setFromEuler(e);
        m4.compose(at.set(f.x, f.y, f.z), q, sc.set(f.size, f.size, f.size));
        mesh.setMatrixAt(n, m4);
        state[n * 3] = f.rate * (f.scare > 0 ? 2.2 : 1); state[n * 3 + 1] = f.scare > 0 ? 0.12 : 0.06 + f.v * 0.05; state[n * 3 + 2] = f.phase;
        n += 1;
      }
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.geometry.attributes.fishState.needsUpdate = true;
    }
  }

  function updateFireflies(dt, night, eye) {
    const on = night > 0.5;
    fireflies.visible = on;
    stats.fireflies = on ? flyCount : 0;
    if (!on) return;
    for (let i = 0; i < flyCount; i += 1) {
      const f = flies[i];
      f.a += dt * f.s * (0.6 + 0.4 * Math.sin(time * 0.3 + i));
      f.x += Math.cos(f.a) * dt * f.s; f.z += Math.sin(f.a) * dt * f.s;
      const y = f.base + f.y + Math.sin(time * 0.7 + i) * 0.3;
      flyPos[i * 3] = f.x; flyPos[i * 3 + 1] = y; flyPos[i * 3 + 2] = f.z;
      const cyc = (time * f.rate + f.blink) % 3.2, glow = cyc < 0.9 ? Math.sin((cyc / 0.9) * Math.PI) : 0;
      const k = glow * night * (eye && Math.hypot(f.x - eye.x, f.z - eye.z) < 90 ? 1 : 0);
      flyCol[i * 3] = 0.75 * k; flyCol[i * 3 + 1] = 1.0 * k; flyCol[i * 3 + 2] = 0.35 * k;
    }
    flyGeom.attributes.position.needsUpdate = true; flyGeom.attributes.color.needsUpdate = true;
  }

  function updatePrints(dt, people) {
    const seen = new Set();
    for (const p of people) {
      if (!p.key || p.riding) continue;
      seen.add(p.key);
      let w = walkers.get(p.key);
      if (!w) { w = { x: p.x, z: p.z, side: 1 }; walkers.set(p.key, w); continue; }
      const d = Math.hypot(p.x - w.x, p.z - w.z);
      if (d > 6) { w.x = p.x; w.z = p.z; continue; }
      if (d < 0.68) continue;
      const h = Math.atan2(p.x - w.x, p.z - w.z);
      w.x = p.x; w.z = p.z; w.side = -w.side;
      const f = habitationFooting(p.x, p.z);
      if (!f || (f.kind !== 'sand' && !(f.kind === 'path' && f.surface === 'sand'))) continue;
      const px = p.x + Math.cos(h) * 0.11 * w.side, pz = p.z - Math.sin(h) * 0.11 * w.side;
      printList.push({ x: px, y: habitationGroundAt(px, pz) + 0.015, z: pz, h, age: 0 });
      if (printList.length > PRINTS) printList.shift();
    }
    for (const key of walkers.keys()) if (!seen.has(key)) walkers.delete(key);
    let n = 0;
    for (let i = printList.length - 1; i >= 0; i -= 1) { const pr = printList[i]; pr.age += dt; if (pr.age > PRINT_LIFE) printList.splice(i, 1); }
    for (const pr of printList) {
      e.set(0, pr.h, 0); q.setFromEuler(e);
      m4.compose(at.set(pr.x, pr.y, pr.z), q, sc.set(1, 1, 1));
      prints.setMatrixAt(n, m4);
      printFade[n] = 1 - Math.max(0, (pr.age - PRINT_LIFE * 0.5) / (PRINT_LIFE * 0.5));
      n += 1;
    }
    prints.count = n; stats.prints = n;
    prints.instanceMatrix.needsUpdate = true;
    printGeom.attributes.printFade.needsUpdate = true;
  }

  function update(dt, { eye = null, look = null, people = [], night = 0 } = {}) {
    time += dt;
    clock.value = time % 3600;
    updateBirds(dt, people, night, eye, look);
    updateFish(dt, people, eye);
    updateFireflies(dt, night, eye);
    updatePrints(dt, people);
  }

  return {
    update,
    group,
    calls() { const out = calls.splice(0); return out; },
    state: () => ({ ...stats, kindsSeen: [...birdMeshes.keys()], birdsNow: birds.map((b) => ({ kind: b.kind, mode: b.mode, x: +b.x.toFixed(1), y: +b.y.toFixed(1), z: +b.z.toFixed(1) })), fishNow: shoals.map((s) => ({ water: s.water, scared: s.scare > 0, fish: s.fish.map((f) => ({ x: +f.x.toFixed(2), z: +f.z.toFixed(2), y: +f.y.toFixed(2) })) })) }),
    dispose() {
      scene.remove(group);
      for (const { mesh } of birdMeshes.values()) { mesh.geometry.dispose(); mesh.dispose(); }
      for (const { mesh } of fishMeshes.values()) { mesh.geometry.dispose(); mesh.dispose(); }
      birdMat.dispose(); fishMat.dispose();
      flyGeom.dispose(); fireflies.material.dispose(); dot.dispose();
      printGeom.dispose(); printMat.dispose(); printTex.dispose(); prints.dispose();
    },
  };
}

return { BIRD_KINDS, createHabitationLife };
})();

__modules["client/habitation-code.js"] = (function () {
const { createHabitation } = __modules["client/render-habitation.js"];
const { createHabitationLife } = __modules["client/render-habitation-life.js"];
const { habitationWind } = __modules["client/habitation-plants.js"];

window.__pcwHabitationCode = Object.freeze({ createHabitation, createHabitationLife, habitationWind });

return {  };
})();
