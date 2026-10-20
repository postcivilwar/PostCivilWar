// Kekes and coaches, drawn from the supplied models.
//
// Every keke shares one set of geometry and every coach another. What makes
// one vehicle differ from the next is a small table of colours handed to the
// material (the vehicle's "look"), plus its plate and markings. Nothing here
// changes a shape.

import { VEHICLE_SLOTS, vehicleMeta, vehicleGeometry, vehicleTriangles } from './vehicle-kit.js';
import { resolveLook } from '../sim/vehicle-looks.js';

const SLOT = Object.fromEntries(VEHICLE_SLOTS.map((name, i) => [name, i]));
const N = VEHICLE_SLOTS.length;
// Which slots light up, and with which lamp: 1 headlamps, 2 tail, 3 indicators, 4 cabin lights.
const LAMP = { lens: 1, tail: 2, amber: 3, cabinlight: 4 };
// Slots on the outside of a vehicle, which gather dust and fade.
const OUTSIDE = new Set(['paint', 'paint2', 'accent', 'trim', 'steel', 'alloy', 'rubber', 'chassis', 'lens', 'amber', 'tail', 'canopy']);
const DUST = 0x9a5a3c;          // laterite

const linear = (hex) => new THREE.Color(hex).convertSRGBToLinear();
const css = (hex) => `#${hex.toString(16).padStart(6, '0')}`;

// ------------------------------------------------------------- shared things --

const shared = { env: null, textures: new Map(), daylight: 1, live: new Set() };

// Gives vehicles something to reflect: a plain sky over plain ground. Call once
// with the renderer; without it vehicles are drawn with their metal toned down.
export function initVehicles(renderer) {
  if (shared.env || !renderer || location.hash.includes('noenv')) return;
  shared.env = skyPicture(renderer);
}
// The picture itself, made on the graphics card (so it is not there after the browser has taken the card's pictures
// away and given the drawing surface back: renewEnvironment makes it again).
function skyPicture(renderer) {
  try {
    const sky = new THREE.Scene();
    const dome = new THREE.Mesh(new THREE.SphereGeometry(20, 24, 12), new THREE.ShaderMaterial({
      side: THREE.BackSide,
      vertexShader: 'varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'varying vec3 vDir; void main() { float h = vDir.y; vec3 skyTop = vec3(0.30, 0.48, 0.80); vec3 horizon = vec3(0.80, 0.84, 0.86); vec3 ground = vec3(0.30, 0.22, 0.16); vec3 c = h > 0.0 ? mix(horizon, skyTop, pow(h, 0.55)) : mix(horizon * 0.8, ground, pow(-h, 0.4)); float sun = pow(max(dot(vDir, normalize(vec3(0.4, 0.75, 0.5))), 0.0), 220.0); gl_FragColor = vec4(c + vec3(6.0, 5.4, 4.6) * sun, 1.0);\n#include <encodings_fragment>\n}',
    }));
    sky.add(dome);
    const pmrem = new THREE.PMREMGenerator(renderer);
    const made = pmrem.fromScene(sky, 0.03).texture;
    pmrem.dispose();
    dome.geometry.dispose(); dome.material.dispose();
    return made;
  } catch (error) { return null; }
}
// After the drawing surface is given back (main.js): the sky picture made again, and everything in `scene` that
// reflected the old one reflecting the new. Gives how many materials were changed.
export function renewEnvironment(renderer, scene) {
  if (!shared.env) return 0;
  const old = shared.env;
  const made = skyPicture(renderer);
  if (!made) return 0;
  shared.env = made;
  let n = 0;
  const seen = new Set();
  scene.traverse((o) => { for (const m of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []) { if (!seen.has(m) && m.envMap === old) { m.envMap = made; m.needsUpdate = true; n += 1; } seen.add(m); } });
  return n;
}

// What vehicles reflect (null until initVehicles has made it): the city's glass reflects it too.
export const vehicleEnvironment = () => shared.env;

// How bright the sky is, 0 at night to 1 at noon, so reflections fade after dark.
export function setVehicleDaylight(amount) {
  const value = Math.max(0.04, Math.min(1, amount));
  if (Math.abs(value - shared.daylight) < 0.01) return;
  shared.daylight = value;
  for (const model of shared.live) model.relight();
}

function dataTexture(uri, srgb) {
  let t = shared.textures.get(uri);
  if (t) return t;
  t = new THREE.TextureLoader().load(uri);
  t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping;
  t.flipY = false;
  t.anisotropy = 4;
  if (srgb) t.encoding = THREE.sRGBEncoding;
  shared.textures.set(uri, t);
  return t;
}
let white = null;
const whiteTexture = () => { if (!white) { white = new THREE.DataTexture(new Uint8Array([200, 200, 200, 255]), 1, 1, THREE.RGBAFormat); white.needsUpdate = true; } return white; };

// ------------------------------------------------------------------ materials --

// The material of a vehicle's solid parts. All vehicles compile to one
// program; each has its own colours.
function bodyMaterial(model, look, { rolling = false } = {}) {
  const meta = vehicleMeta(model);
  const fade = look.wear;
  const palette = VEHICLE_SLOTS.map((slot) => {
    let c;
    if (look.colours[slot] !== undefined) c = linear(look.colours[slot]);
    else if (slot === 'floor' && meta.floors && meta.floors[look.trim]) c = new THREE.Color().fromArray(meta.floors[look.trim]);
    else if (meta.colours[slot]) c = new THREE.Color().fromArray(meta.colours[slot]);
    else c = new THREE.Color(0.5, 0.5, 0.5);
    // sun and years: paint loses depth and goes chalky
    if (slot === 'paint' || slot === 'paint2' || slot === 'accent' || slot === 'canopy') { const grey = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; c.lerp(new THREE.Color(grey * 0.9 + 0.1, grey * 0.9 + 0.1, grey * 0.9 + 0.09), fade * 0.3); }
    return new THREE.Vector3(c.r, c.g, c.b);
  });
  const metalScale = shared.env ? 1 : 0.15;
  const surface = VEHICLE_SLOTS.map((slot) => {
    const f = meta.finish[slot] || [0.8, 0];
    const rough = slot === 'paint' || slot === 'paint2' || slot === 'accent' ? Math.min(0.95, f[0] + fade * 0.3) : f[0];
    const detail = meta.detail[slot] === 'wear' ? 1 : meta.detail[slot] === 'weave' ? 2 : 0;
    return new THREE.Vector4(rough, f[1] * metalScale, LAMP[slot] || 0, detail);
  });
  const dust = linear(DUST);
  const uniforms = {
    uPalette: { value: palette }, uSurface: { value: surface }, uOutside: { value: VEHICLE_SLOTS.map((slot) => (OUTSIDE.has(slot) ? 1 : 0)) },
    uWear: { value: fade }, uDust: { value: new THREE.Vector4(dust.r, dust.g, dust.b, look.dirt * (rolling ? 0.55 : 1)) },
    // dust lies thickest low down; on a wheel, which turns, it lies all over
    uDustBand: { value: rolling ? new THREE.Vector2(50, 51) : new THREE.Vector2(meta.wheelRadius * 0.8, meta.wheelRadius * 3.4) },
    uLamps: { value: new THREE.Vector4(0, 0, 0, 0) },
    uWearMap: { value: meta.textures.wear ? dataTexture(meta.textures.wear, false) : whiteTexture() },
    uWeaveMap: { value: meta.textures.weave ? dataTexture(meta.textures.weave, false) : whiteTexture() },
  };
  const material = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, envMap: shared.env, envMapIntensity: 0.9 * shared.daylight });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = `attribute float slot;\nuniform vec3 uPalette[${N}];\nuniform vec4 uSurface[${N}];\nuniform float uOutside[${N}];\nuniform vec4 uDust;\nuniform vec2 uDustBand;\nvarying vec3 vTint;\nvarying vec4 vSurf;\nvarying vec2 vDetailUv;\nvarying float vDirt;\n${shader.vertexShader}`
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        int vehicleSlot = int(slot + 0.5);
        vTint = uPalette[vehicleSlot];
        vSurf = uSurface[vehicleSlot];
        vDetailUv = uv;
        vDirt = uDust.a * uOutside[vehicleSlot] * (1.0 - smoothstep(uDustBand.x, uDustBand.y, position.y) * 0.93);`);
    shader.fragmentShader = `uniform sampler2D uWearMap;\nuniform sampler2D uWeaveMap;\nuniform float uWear;\nuniform vec4 uDust;\nuniform vec4 uLamps;\nvarying vec3 vTint;\nvarying vec4 vSurf;\nvarying vec2 vDetailUv;\nvarying float vDirt;\n${shader.fragmentShader}`
      .replace('#include <color_fragment>', `#include <color_fragment>
        diffuseColor.rgb *= vTint;
        if (vSurf.w > 0.5) {
          float worn = (vSurf.w < 1.5 ? texture2D(uWearMap, vDetailUv).r : texture2D(uWeaveMap, vDetailUv).r) * 1.275;
          diffuseColor.rgb *= max(0.0, mix(1.0, worn, vSurf.w < 1.5 ? 0.6 + uWear * 1.6 : 1.0));
        }
        diffuseColor.rgb = mix(diffuseColor.rgb, uDust.rgb, clamp(vDirt * 0.5, 0.0, 0.5));`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = clamp(vSurf.x + vDirt * 0.45, 0.04, 1.0);')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vSurf.y * (1.0 - clamp(vDirt, 0.0, 1.0));')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float vehicleLamp = vSurf.z < 0.5 ? 0.0 : vSurf.z < 1.5 ? uLamps.x : vSurf.z < 2.5 ? uLamps.y : vSurf.z < 3.5 ? uLamps.z : uLamps.w;
        totalEmissiveRadiance += vTint * vehicleLamp;`);
  };
  material.customProgramCacheKey = () => 'vehicle-body';
  material.userData.uniforms = uniforms;
  return material;
}

function glassMaterial(model, far) {
  const meta = vehicleMeta(model);
  const c = new THREE.Color().fromArray(meta.colours.glass);
  if (far) c.multiplyScalar(0.45);
  return new THREE.MeshStandardMaterial({ color: c, transparent: true, opacity: far ? 0.92 : Math.min(0.6, meta.finish.glassOpacity + 0.12), roughness: 0.1, metalness: 0, envMap: shared.env, envMapIntensity: 1.2 * shared.daylight, side: THREE.DoubleSide, depthWrite: false });
}

// ------------------------------------------------------------------ markings --

function canvasTexture(width, height, paint) {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  paint(canvas.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.encoding = THREE.sRGBEncoding;
  texture.anisotropy = 8;
  return texture;
}
const FONT = '"Arial Narrow", "Helvetica Neue", Arial, sans-serif';
function fitText(g, text, width, height, weight = 700) {
  let size = height;
  do { g.font = `${weight} ${size}px ${FONT}`; size -= 2; } while (g.measureText(text).width > width && size > 8);
}

// A registration plate: white, with the state across the top and the number in red, as commercial vehicles carry.
export function plateTexture(text, region = '') {
  return canvasTexture(256, 80, (g, w, h) => {
    g.fillStyle = '#f4f3ee'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#1b1b1e'; g.lineWidth = 4; g.strokeRect(3, 3, w - 6, h - 6);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    if (region) { g.fillStyle = '#17633a'; g.font = `700 15px ${FONT}`; g.fillText(region.toUpperCase(), w / 2, 15); }
    g.fillStyle = '#b3201c';
    fitText(g, text, w - 24, region ? 44 : 52, 800);
    g.fillText(text, w / 2, region ? h / 2 + 8 : h / 2 + 2);
  });
}

function wordsTexture(text, { colour = '#ffffff', outline = null, width = 512, height = 96, ground = null, italic = false } = {}) {
  return canvasTexture(width, height, (g, w, h) => {
    if (ground) { g.fillStyle = ground; g.fillRect(0, 0, w, h); }
    g.textAlign = 'center'; g.textBaseline = 'middle';
    fitText(g, text, w * 0.94, h * 0.78);
    if (italic) g.font = `italic ${g.font}`;
    if (outline) { g.strokeStyle = outline; g.lineWidth = Math.max(3, h / 14); g.lineJoin = 'round'; g.strokeText(text, w / 2, h / 2 + 2); }
    g.fillStyle = colour; g.fillText(text, w / 2, h / 2 + 2);
  });
}

// An advert panel along a coach's side.
function advertTexture(advert) {
  const ground = css(advert.ground), ink = css(advert.ink), head = advert.head, line = advert.line;
  return canvasTexture(1024, 256, (g, w, h) => {
    g.fillStyle = ground; g.fillRect(0, 0, w, h);
    g.strokeStyle = ink; g.lineWidth = 10; g.strokeRect(12, 12, w - 24, h - 24);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = ink;
    fitText(g, head, w - 90, 104, 800); g.fillText(head, w / 2, line ? h * 0.4 : h * 0.52);
    if (line) { fitText(g, line, w - 140, 54, 500); g.fillText(line, w / 2, h * 0.74); }
  });
}

// A flat panel on the vehicle's surface, where the bake found it.
function panelMesh(panel, texture, { opacity = 1, transparent = true, far = false } = {}) {
  if (!panel) return null;
  const [a, b, c, d] = panel.corners;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c, ...d], 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute([...panel.normal, ...panel.normal, ...panel.normal, ...panel.normal], 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  const material = new THREE.MeshStandardMaterial({ map: texture, transparent, opacity, roughness: 0.6, metalness: 0, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, depthWrite: !transparent });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.userData.far = far;
  return mesh;
}

let unseen = null;
// A material that draws nothing to the screen, for a mesh that is there only to cast a shadow.
const shadowOnly = () => { if (!unseen) unseen = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, side: THREE.DoubleSide }); return unseen; };

// Every shape a keke or a coach can be drawn in, as jobs to do one at a time
// while the town loads: each unpacks one piece of the kit and returns its
// geometry, so that walking up to a vehicle never waits for it.
export function vehicleWarmJobs() {
  const jobs = [];
  for (const model of ['keke', 'bus']) {
    const meta = vehicleMeta(model);
    for (const trim of meta.trims) {
      const ids = (list) => (Array.isArray(list) ? list : [list]).map((id) => id.replace('{trim}', trim));
      for (const level of [1, 0]) {
        jobs.push(() => vehicleGeometry(ids(meta.parts.body), level));
        jobs.push(() => vehicleGeometry(ids(meta.parts.wheel), level));
        for (const s of meta.steer) if (s.part) jobs.push(() => vehicleGeometry(ids(s.part), level));
      }
      jobs.push(() => vehicleGeometry(ids(meta.parts.far), 0));
    }
  }
  return jobs;
}

// ---------------------------------------------------------------- the model --

// Levels of detail: 0 near, 1 middle, 2 far.
export const VEHICLE_LEVELS = Object.freeze(['near', 'middle', 'far']);
// The distances at which a vehicle steps down a level, by how many levels the device can afford.
export const VEHICLE_RANGES = Object.freeze({ keke: Object.freeze([9, 34]), bus: Object.freeze([14, 60]) });

// A keke or a coach. `look` is the plain data from ../sim/vehicle-looks.js.
//   plate   the registration to show, if any
//   region  the state named on the plate
//   level   the level of detail to start at
export function makeVehicleModel(look, { plate = null, region = '', level = 0, shadows = true } = {}) {
  const resolved = resolveLook(look);
  const model = resolved.model;
  const meta = vehicleMeta(model);
  const trim = resolved.trim;
  const ids = (list) => (Array.isArray(list) ? list : [list]).map((id) => id.replace('{trim}', trim));
  const group = new THREE.Group();
  const body = bodyMaterial(model, resolved);
  const rolling = bodyMaterial(model, resolved, { rolling: true });
  // far off the coach is drawn without its cabin, so its glass is darkened to hide that; the keke is open and keeps clear glass
  const glass = [glassMaterial(model, false), glassMaterial(model, model === 'bus')];
  const materials = [body, glass[0]];
  const owned = [body, rolling, glass[0], glass[1]];

  const shell = new THREE.Mesh(vehicleGeometry(ids(meta.parts.far), 0), materials);
  shell.receiveShadow = true;
  group.add(shell);
  // The shadow is cast by the far-off shape whatever level is on show: the
  // outline is the same, and the sun's pass draws a few thousand triangles
  // instead of tens of thousands.
  const caster = shadows ? new THREE.Mesh(vehicleGeometry(ids(meta.parts.far), 0), shadowOnly()) : null;
  if (caster) { caster.castShadow = true; group.add(caster); }

  // steering pivots, each with whatever turns with it, and the wheels
  const steerers = meta.steer.map((s) => {
    const pivot = new THREE.Group();
    pivot.position.fromArray(s.at);
    let mesh = null;
    if (s.part) { mesh = new THREE.Mesh(vehicleGeometry(ids(s.part), 0), [rolling, glass[0]]); pivot.add(mesh); }
    group.add(pivot);
    return { pivot, mesh, part: s.part };
  });
  const wheels = meta.wheels.map((w) => {
    const steer = w.steer !== undefined ? steerers[w.steer] : null;
    const holder = new THREE.Group();
    const spin = new THREE.Group();
    const mesh = new THREE.Mesh(vehicleGeometry(ids(meta.parts.wheel), 0), [rolling, glass[0]]);
    mesh.rotation.y = w.yaw || 0;
    spin.add(mesh); holder.add(spin);
    if (steer) { holder.position.set(w.at[0] - steer.pivot.position.x, w.at[1] - steer.pivot.position.y, w.at[2] - steer.pivot.position.z); steer.pivot.add(holder); } else { holder.position.fromArray(w.at); group.add(holder); }
    return { holder, spin, mesh };
  });

  // plate, lettering and adverts
  const decals = [];
  const stick = (name, texture, options) => { const mesh = panelMesh(meta.panels[name], texture, options); if (mesh) { group.add(mesh); decals.push(mesh); } return mesh; };
  const faded = 1 - resolved.wear * 0.35;
  if (plate) { stick('plateRear', plateTexture(plate, region), { transparent: false }); stick('plateFront', plateTexture(plate, region), { transparent: false }); }
  if (model === 'keke') {
    if (resolved.texts.slogan) stick('flap', wordsTexture(resolved.texts.slogan, { colour: '#f1ead6', width: 768, height: 136, italic: true }), { opacity: faded });
    if (resolved.texts.number) { const t = wordsTexture(resolved.texts.number, { colour: resolved.id === 'white' || resolved.id === 'yellow' ? '#1b1b1e' : '#f4f3ee', width: 256, height: 128 }); stick('sideLeft', t, { opacity: faded }); stick('sideRight', t, { opacity: faded }); }
  } else {
    const ink = css(resolved.colours.accent);
    if (resolved.texts.operator) { const t = wordsTexture(resolved.texts.operator, { colour: ink, width: 1024, height: 128 }); stick('nameLeft', t, { opacity: faded, far: true }); stick('nameRight', t, { opacity: faded, far: true }); stick('visor', wordsTexture(resolved.texts.operator, { colour: '#f4f3ee', ground: css(resolved.colours.accent), width: 1024, height: 104 }), { transparent: false, far: true });
      // the operator's name again, small, on the nose and above the back window, where a maker would put its own
      stick('nose', wordsTexture(resolved.texts.operator, { colour: '#e8e6dc', width: 768, height: 104 }), { opacity: faded });      // on the dark bar between the lamps
      stick('nameRear', wordsTexture(resolved.texts.operator, { colour: ink, width: 768, height: 104 }), { opacity: faded }); }
    if (resolved.texts.number) { const t = wordsTexture(resolved.texts.number, { colour: ink, width: 256, height: 128 }); stick('numberLeft', t, { opacity: faded }); stick('numberRight', t, { opacity: faded }); stick('numberRear', t, { opacity: faded }); }
    if (resolved.texts.route) stick('routeRear', wordsTexture(resolved.texts.route, { colour: ink, width: 512, height: 128 }), { opacity: faded });
    if (resolved.texts.advert) { const t = advertTexture(resolved.texts.advert); stick('adLeft', t, { transparent: false, far: true }); stick('adRight', t, { transparent: false, far: true }); }
  }

  // the few things an owner adds
  const extras = [];
  const plain = (hex, rough = 0.85) => { const m = new THREE.MeshStandardMaterial({ color: linear(hex), roughness: rough, metalness: 0 }); owned.push(m); return m; };
  if (resolved.extras.includes('curtains')) {
    // rain covers, rolled up and tied under the edge of the canopy on each side
    const cloth = plain(resolved.colours.canopy, 0.9); const strap = plain(0x2a2a2c);
    for (const side of [-1, 1]) {
      const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 1.72, 10), cloth);
      roll.rotation.x = Math.PI / 2; roll.position.set(side * 0.648, 1.655, -0.27);
      extras.push(roll);
      for (const z of [-0.95, -0.27, 0.4]) { const tie = new THREE.Mesh(new THREE.TorusGeometry(0.042, 0.007, 5, 12), strap); tie.position.set(side * 0.648, 1.655, z); extras.push(tie); }
    }
  }
  if (resolved.extras.includes('flaps')) {
    const rubber = plain(0x18181a, 0.95);
    const seen = new Set();
    for (const w of meta.wheels) {
      const key = `${Math.sign(w.at[0])}|${w.at[2].toFixed(1)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const flap = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.36, 0.02), rubber);
      flap.position.set(Math.sign(w.at[0]) * 1.1, 0.36, w.at[2] - meta.wheelRadius - 0.16);
      extras.push(flap);
    }
  }
  for (const e of extras) group.add(e);

  const state = { level: -1, roll: 0, steer: 0 };
  const bodyParts = ids(meta.parts.body);

  const api = {
    group, model, trim, look: resolved, meta,
    get level() { return state.level; },
    // how far the wheels have turned (radians) and where the steering stands, for tests
    get spin() { return state.roll; },
    get steering() { return state.steer; },
    get lit() { return body.userData.uniforms.uLamps.value.x > 0; },
    get triangles() {
      if (state.level === 2) return vehicleTriangles(ids(meta.parts.far), 0);
      return vehicleTriangles(bodyParts, state.level) + meta.wheels.length * vehicleTriangles(ids(meta.parts.wheel), state.level) + steerers.reduce((sum, s) => sum + (s.part ? vehicleTriangles(ids(s.part), state.level) : 0), 0);
    },
    // 0 near, 1 middle, 2 far
    setLevel(next) {
      const wanted = Math.max(0, Math.min(2, next));
      if (wanted === state.level) return;
      state.level = wanted;
      const far = wanted === 2;
      shell.geometry = far ? vehicleGeometry(ids(meta.parts.far), 0) : vehicleGeometry(bodyParts, wanted);
      materials[1] = glass[far ? 1 : 0];
      for (const s of steerers) { s.pivot.visible = !far; if (s.mesh && !far) s.mesh.geometry = vehicleGeometry(ids(s.part), wanted); }
      for (const w of wheels) { w.holder.visible = !far; if (!far) w.mesh.geometry = vehicleGeometry(ids(meta.parts.wheel), wanted); }
      for (const d of decals) d.visible = !far || d.userData.far;
      for (const e of extras) e.visible = !far;
    },
    // picks the level for a distance from the eye; `ranges` are the near and middle limits in metres
    setDistance(distance, ranges = VEHICLE_RANGES[model], bias = 1) {
      const level = distance < ranges[0] * bias ? 0 : distance < ranges[1] * bias ? 1 : 2;
      // a little slack, so a vehicle on the line does not flicker between levels
      if (level > state.level && distance < (state.level === 0 ? ranges[0] : ranges[1]) * bias * 1.12) return;
      api.setLevel(level);
    },
    // turns the wheels as if the vehicle had moved this far forward (metres; negative for reverse)
    roll(distance) { state.roll += distance / meta.wheelRadius; for (const w of wheels) w.spin.rotation.x = state.roll; },
    // turns the front wheel or wheels: radians, positive to the left
    steer(angle) { state.steer = angle; for (const s of steerers) s.pivot.rotation.y = angle; },
    // head lamps, tail lamps, indicators, cabin lights: each 0 to 1
    lamps(head = 0, tail = head, indicators = 0, cabin = 0) { for (const m of [body, rolling]) m.userData.uniforms.uLamps.value.set(head * 1.6, tail * 1.2, indicators * 1.4, cabin * 0.9); },
    relight() { for (const m of [body, rolling]) m.envMapIntensity = 0.9 * shared.daylight; for (const g of glass) g.envMapIntensity = 1.2 * shared.daylight; },
    dispose() {
      shared.live.delete(api);
      for (const m of owned) m.dispose();
      for (const d of decals) { d.geometry.dispose(); if (d.material.map) d.material.map.dispose(); d.material.dispose(); }
      for (const e of extras) e.geometry.dispose();
    },
  };
  api.setLevel(level);
  shared.live.add(api);
  return api;
}
