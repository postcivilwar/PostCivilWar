// The town's policewomen, each drawn from the owner's supplied police officer (W3, police.glb) with her own face, skin,
// uniform and headwear (src/sim/police-looks.js says which). The file is not changed and its picture is not copied:
//
//   her face     a copy of the figure's positions with its head reshaped (the face wider or narrower, the jaw, the chin,
//                the nose, the lips, the cheeks, the brow; the hair pressed down under a beret or a cap; her body a little
//                broader or slighter); everything else of the figure (its texture coordinates, its normals, its skin
//                weights, its triangles) is shared with it, not copied
//   her skin     the figure's own skin in its picture, its light and shade kept, in her tone
//   her uniform  the figure's own cloth in its picture, its folds and seams kept, in her uniform's colours: the shirt's
//                sleeves and collar, the trousers, the blue camouflage's blotches; the body armour over the shirt, with
//                POLICE across it, as the owner's figure has it
//   her hat      a beret or a peaked cap with its badge, on her head, moving with it
//
// The skin and the cloth are told apart by the colour of the picture (a skin's warm brown; the cloth's greys and
// olive), and which cloth by where it is on the body: which bones move it (the arms, the legs, the feet, the head). It
// is done as the figure is drawn, in one shader shared by the sixteen; nothing is fetched or held twice.

import { POLICE_LOOKS, UNIFORMS } from '../sim/police-looks.js';
import { surface, linear } from './render-kit.js';

// The figure's own skin and cloth as they are on average in its picture (sRGB, measured from police.glb's picture by
// the bones that move each texel): what her tone and her uniform's colours are made relative to.
const OWN_SKIN = [0.34, 0.215, 0.168];
const OWN_SHIRT = [0.163, 0.164, 0.168];
const OWN_TROUSERS = [0.287, 0.284, 0.249];
// officers stand a little shorter than the supplied figure (1.80 m): about 1.69 m, each her own height about that
const HEIGHT = 0.94;
// the camouflage's blotches: about this many across a metre
const CAMO_PER_METRE = 12;

const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const lum = ([r, g, b]) => 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
const vec = (hex) => { const c = linear(hex); return new THREE.Vector3(c.r, c.g, c.b); };
const smooth = (t) => { const u = Math.max(0, Math.min(1, t)); return u * u * (3 - 2 * u); };
// a falloff about a point: 1 at it, nothing at `r` from it and beyond
const near = (x, y, z, p, r) => { const d = Math.hypot(x - p.x, y - p.y, z - p.z); return d >= r ? 0 : (1 - d / r) * (1 - d / r); };

// ----------------------------------------------------------------------------------------------- the figure --

// What is worked out once for the figure's model: which part of the body each point of it belongs to (by its skin
// weights), where its face is, and its positions as plain numbers in the model's own units.
const prepared = new WeakMap();
const unitOf = (a) => {
  if (!a.normalized) return 1;
  const t = a.array;
  return t instanceof Int16Array ? 32767 : t instanceof Uint16Array ? 65535 : t instanceof Int8Array ? 127 : t instanceof Uint8Array ? 255 : 1;
};
function prepare(model, mesh) {
  if (prepared.has(model)) return prepared.get(model);
  const g = model.geometry;
  const P = g.attributes.position, SI = g.attributes.skinIndex, SW = g.attributes.skinWeight;
  const n = P.count;
  const pk = unitOf(P), wk = unitOf(SW);
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n * 3; i += 1) pos[i] = P.array[i] / pk;
  // The part of the body each bone moves: the head; the shirt's collar and sleeves (the neck, the arms and the hands);
  // the legs; the feet; and the rest, the body under its armour.
  const names = mesh.skeleton.bones.map((b) => String(b.name).toLowerCase());
  const zoneOfBone = names.map((name) => (/(^|_|:)head$/.test(name) ? 0 : /neck|arm|hand|thumb|index|middle|ring|pinky/.test(name) ? 1 : /thigh|calf|upleg|(^|_|:)leg/.test(name) ? 2 : /foot|ball|toe/.test(name) ? 3 : -1));
  const armBone = names.map((name, j) => zoneOfBone[j] === 1 && !/neck/.test(name));
  const neckBone = names.map((name) => /neck/.test(name));
  const zone = new Float32Array(n * 4);
  const arm = new Float32Array(n), neck = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    for (let k = 0; k < 4; k += 1) {
      const w = SW.array[i * 4 + k] / wk;
      if (w <= 0) continue;
      const j = SI.array[i * 4 + k];
      const z = zoneOfBone[j];
      if (z >= 0) zone[i * 4 + z] += w;
      if (armBone[j]) arm[i] += w;
      if (neckBone[j]) neck[i] += w;
    }
  }
  // (how much the head's own bone moves each point: what her face and her hat are made from)
  const headWeight = new Float32Array(n);
  for (let i = 0; i < n; i += 1) headWeight[i] = zone[i * 4];
  // the head: its box, the tip of the nose, the chin; the face's measures are taken from how far the nose's tip is
  // above the chin (F)
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  let low = Infinity, high = -Infinity;
  for (let i = 0; i < n; i += 1) {
    const y = pos[i * 3 + 1];
    low = Math.min(low, y); high = Math.max(high, y);
    if (zone[i * 4] < 0.6) continue;
    const x = pos[i * 3], z = pos[i * 3 + 2];
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); z0 = Math.min(z0, z); z1 = Math.max(z1, z);
  }
  if (!Number.isFinite(x0)) throw new Error('the figure has no head to dress');
  const C = { x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: (z0 + z1) / 2 }, W = x1 - x0, H = y1 - y0, D = z1 - z0;
  let nose = null, chin = null;
  for (let i = 0; i < n; i += 1) {
    if (zone[i * 4] < 0.6) continue;
    const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
    if (Math.abs(x - C.x) < W * 0.15 && y > C.y - H * 0.3 && y < C.y + H * 0.1 && (!nose || z > nose.z)) nose = { x, y, z };
  }
  for (let i = 0; i < n; i += 1) {
    if (zone[i * 4] < 0.6) continue;
    const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
    if (Math.abs(x - nose.x) < W * 0.12 && z > nose.z - D * 0.3 && y < nose.y && (!chin || y < chin.y)) chin = { x, y, z };
  }
  const F = nose.y - chin.y;
  const face = {
    F, nose, chin,
    mouth: { x: nose.x, y: chin.y + 0.45 * F, z: nose.z - 0.35 * F },
    bridge: { x: nose.x, y: nose.y + 0.22 * F, z: nose.z - 0.42 * F },
    brow: { x: nose.x, y: nose.y + 0.55 * F, z: nose.z - 0.4 * F },
    // the skull, as it is under the hair: its middle seen from above, and how far it reaches across and from front to back
    skull: { x: nose.x, z: nose.z - 1.12 * F, rx: 0.78 * F, rz: 1.0 * F, top: chin.y + 2.35 * F },
  };
  // What the bones of the arms and the neck move is not all shirt. The figure stands with its hands beside its
  // thighs, and the hands' bones move some of the trousers and the holster beside them; the shoulders' and the neck's
  // move some of the body armour; the neck's, the hair at the nape. Each point they move is the shirt's only where it
  // is nearer an arm or the neck than the body or a leg, each measured against how thick it is (and below the chin):
  // so that a sky-blue sleeve's colour is put on the sleeves and the collar, and nowhere else.
  const tall = high - low;
  const bind = new THREE.Matrix4().copy(mesh.bindMatrix).invert();
  const at = (name) => { const j = names.indexOf(name); return j < 0 ? null : new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().copy(mesh.skeleton.boneInverses[j]).invert().premultiply(bind)); };
  const lines = (list) => list.map(([a, b, more = 0]) => { const p = at(a), q = at(b); if (!p || !q) return null; if (more) q.sub(p).multiplyScalar(more).add(p); return [p, q]; }).filter(Boolean);
  const arms = lines([['upperarm_l', 'lowerarm_l'], ['lowerarm_l', 'hand_l'], ['lowerarm_l', 'hand_l', 1.45], ['upperarm_r', 'lowerarm_r'], ['lowerarm_r', 'hand_r'], ['lowerarm_r', 'hand_r', 1.45]]);
  const necks = lines([['neck_01', 'head']]);
  const torso = lines([['pelvis', 'spine_03']]);
  const legs = lines([['thigh_l', 'calf_l'], ['calf_l', 'foot_l'], ['thigh_r', 'calf_r'], ['calf_r', 'foot_r']]);
  if (arms.length === 6 && necks.length && torso.length && legs.length === 4) {
    const v = new THREE.Vector3(), w = new THREE.Vector3(), seg = new THREE.Line3();
    const from = (list, thick) => { let best = Infinity; for (const [p, q] of list) { seg.set(p, q); seg.closestPointToPoint(v, true, w); best = Math.min(best, w.distanceTo(v)); } return best / (thick * tall); };
    for (let i = 0; i < n; i += 1) {
      let shirt = arm[i] + neck[i];
      if (shirt <= 0) continue;
      v.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
      // (the hair at the nape and the skin of the neck under the jaw: the head's)
      if (neck[i] > 0 && v.y > chin.y) { zone[i * 4 + 1] -= neck[i]; zone[i * 4] += neck[i]; shirt -= neck[i]; }
      if (shirt <= 0) continue;
      const own = Math.min(from(arms, 0.025), from(necks, 0.03)), leg = from(legs, 0.04), body = from(torso, 0.065);
      if (leg < own && leg <= body) { zone[i * 4 + 1] -= shirt; zone[i * 4 + 2] += shirt; } else if (body < own) zone[i * 4 + 1] -= shirt;
    }
  }
  const zone8 = new Uint8Array(n * 4);
  for (let i = 0; i < n * 4; i += 1) zone8[i] = Math.round(Math.max(0, Math.min(1, zone[i])) * 255);
  // the body: its middle, about which it is made broader or slighter
  let bx = 0, bz = 0, bw = 0;
  for (let i = 0; i < n; i += 1) {
    const b = Math.max(0, 1 - zone[i * 4] - zone[i * 4 + 1] - zone[i * 4 + 2] - zone[i * 4 + 3]);
    bx += pos[i * 3] * b; bz += pos[i * 3 + 2] * b; bw += b;
  }
  const base = {
    pos, zone, head: headWeight, zoneAttribute: new THREE.BufferAttribute(zone8, 4, true), C, W, H, D, top: y1, face,
    body: { x: bw ? bx / bw : 0, z: bw ? bz / bw : 0 }, tall: high - low,
    unit: pk, Type: P.array.constructor, normalized: P.normalized, variants: new Map(),
  };
  prepared.set(model, base);
  return base;
}

// --------------------------------------------------------------------------------------------------- her face --

// Her head, reshaped from the figure's, and her body broader or slighter: a new set of positions (in the model's own
// units); everything else is the figure's.
function reshape(base, L, hatted) {
  const { pos, zone, head, C, H, face } = base;
  const { F, nose } = face;
  // (each of her face's measures, as police-looks.js gives it, made this much more of: enough to be seen at a few paces)
  const S = Object.fromEntries(Object.entries(L.face).map(([key, value]) => [key, key === 'chin' ? value * 1.2 : 1 + (value - 1) * (key === 'head' ? 1.2 : 1.5)]));
  const n = pos.length / 3;
  const out = new Float32Array(pos);
  // how far forward a point of the head is: its face 1, the ears about a third, the back of the head nothing
  const front = (z) => smooth((z - (nose.z - 1.6 * F)) / (1.2 * F));
  const hatLine = face.brow.y + 0.1 * F;
  const sk = face.skull;
  const build = L.build || 1;
  for (let i = 0; i < n; i += 1) {
    const h = head[i];
    let x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
    // her body: broader or slighter at the chest, the waist and the hips (the body itself, not the head, the arms or
    // the legs), a little more across than from front to back
    const b = Math.max(0, 1 - zone[i * 4] - zone[i * 4 + 1] - zone[i * 4 + 2] - zone[i * 4 + 3]) + 0.4 * zone[i * 4 + 2];
    if (b > 0.01 && build !== 1) { x = base.body.x + (x - base.body.x) * (1 + (build - 1) * 0.8 * b); z = base.body.z + (z - base.body.z) * (1 + (build - 1) * 0.5 * b); }
    if (h > 0.01) {
      // the head's size, about its middle
      x = C.x + (x - C.x) * (1 + (S.head - 1) * h); y = C.y + (y - C.y) * (1 + (S.head - 1) * h); z = C.z + (z - C.z) * (1 + (S.head - 1) * h);
      const fr = front(z) * h;
      // the face wider or narrower, and the jaw below the nose's tip more so or less
      const below = smooth((nose.y - y) / F);
      x = nose.x + (x - nose.x) * (1 + (S.width - 1) * fr) * (1 + (S.jaw - 1) * fr * below);
      // the chin longer or shorter: what is below the mouth moves down or up, most at the chin itself
      const chinward = smooth((face.mouth.y - y) / (face.mouth.y - face.chin.y)) * smooth(1 - Math.abs(x - nose.x) / (0.9 * F));
      y -= S.chin * H * chinward * fr;
      // the nose: larger or smaller about its bridge, wider rather than longer
      const nn = near(x, y, z, nose, 0.55 * F) * h;
      if (nn > 0) {
        const p = face.bridge;
        x = p.x + (x - p.x) * (1 + (S.nose - 1) * 1.3 * nn); y = p.y + (y - p.y) * (1 + (S.nose - 1) * 0.6 * nn); z = p.z + (z - p.z) * (1 + (S.nose - 1) * 0.8 * nn);
      }
      // the lips fuller or thinner: forward and taller
      const ln = near(x, y, z, face.mouth, 0.45 * F) * h;
      if (ln > 0) { z += (S.lips - 1) * 0.28 * F * ln; y = face.mouth.y + (y - face.mouth.y) * (1 + (S.lips - 1) * 0.7 * ln); }
      // the cheekbones higher and fuller, or flatter
      for (const side of [-1, 1]) {
        const cheek = { x: nose.x + side * 0.55 * F, y: nose.y + 0.12 * F, z: nose.z - 0.55 * F };
        const cn = near(x, y, z, cheek, 0.6 * F) * h;
        if (cn > 0) { x += side * (S.cheeks - 1) * 0.35 * F * cn; z += (S.cheeks - 1) * 0.25 * F * cn; }
      }
      // the brow standing out more or less
      const bn = near(x, y, z, face.brow, 0.7 * F) * h;
      if (bn > 0) z += (S.brow - 1) * 0.3 * F * bn;
      // under a beret or a cap, the hair pressed down to the head: drawn in towards the skull, and lowered
      if (hatted && y > hatLine) {
        const up = smooth((y - hatLine) / (0.6 * F));
        const ex = (x - sk.x) / (sk.rx * 1.12), ez = (z - sk.z) / (sk.rz * 1.1), r = Math.hypot(ex, ez);
        if (r > 1) { const k = (1 + (r - 1) * (1 - 0.85 * up)) / r; x = sk.x + (x - sk.x) * k; z = sk.z + (z - sk.z) * k; }
        if (y > sk.top) y = sk.top + (y - sk.top) * (1 - 0.75 * up);
      }
    }
    out[i * 3] = x; out[i * 3 + 1] = y; out[i * 3 + 2] = z;
  }
  return out;
}

// -------------------------------------------------------------------------------------- her skin and her uniform --

// One shader for all sixteen: the picture's colour told apart into skin and cloth, the cloth by where it is on the
// body, each put into her colours with its own light and shade kept (the camouflage in blotches laid on the body's
// own shape, so that they move with it).
const UNIFORM_NAMES = ['uTone', 'uShirt', 'uTrousers', 'uCamoA', 'uCamoB', 'uCamoC', 'uCamoD', 'uCamo', 'uCamoScale', 'uSkinRef', 'uShirtRef', 'uTrousersRef'];
function dressShader(shader) {
  const u = this.userData.dress;
  for (const name of UNIFORM_NAMES) shader.uniforms[name] = { value: u[name] };
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nattribute vec4 aZone;\nvarying vec4 vZone;\nvarying vec3 vBind;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvZone = aZone;\nvBind = position;');
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>
varying vec4 vZone;
varying vec3 vBind;
uniform vec3 uTone, uShirt, uTrousers, uCamoA, uCamoB, uCamoC, uCamoD;
uniform float uCamo, uCamoScale, uSkinRef, uShirtRef, uTrousersRef;
float pdSkin = 0.0;
float pdHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float pdNoise(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(pdHash(i), pdHash(i + vec3(1.0, 0.0, 0.0)), f.x), mix(pdHash(i + vec3(0.0, 1.0, 0.0)), pdHash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
             mix(mix(pdHash(i + vec3(0.0, 0.0, 1.0)), pdHash(i + vec3(1.0, 0.0, 1.0)), f.x), mix(pdHash(i + vec3(0.0, 1.0, 1.0)), pdHash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
}
vec3 pdCamo(vec3 p) {
  vec3 q = p * uCamoScale;
  q += (vec3(pdNoise(q * 0.6 + 11.3), pdNoise(q * 0.6 + 23.1), pdNoise(q * 0.6 + 5.7)) - 0.5) * 0.9;
  float a = pdNoise(q) * 0.62 + pdNoise(q * 2.1 + 7.1) * 0.38;
  float b = pdNoise(q * 1.3 + 3.7) * 0.7 + pdNoise(q * 2.7 + 1.3) * 0.3;
  vec3 c = mix(uCamoA, uCamoB, step(0.46, a));
  c = mix(c, uCamoC, step(0.6, b) * step(0.4, a));
  return mix(c, uCamoD, step(0.66, a) * (1.0 - step(0.62, b)));
}`)
    .replace('#include <map_fragment>', `#include <map_fragment>
{
  vec3 c = diffuseColor.rgb;
  vec3 s = LinearTosRGB(vec4(max(c, vec3(0.0)), 1.0)).rgb;
  float mx = max(s.r, max(s.g, s.b)), mn = min(s.r, min(s.g, s.b));
  float sat = (mx - mn) / max(mx, 1e-4);
  float hue = 0.0;
  if (mx > mn) { float d = mx - mn; if (mx == s.r) hue = mod((s.g - s.b) / d, 6.0); else if (mx == s.g) hue = (s.b - s.r) / d + 2.0; else hue = (s.r - s.g) / d + 4.0; }
  hue *= 60.0;
  float head = vZone.x, shirt = vZone.y, legs = vZone.z, feet = vZone.w;
  float body = max(0.0, 1.0 - head - shirt - legs - feet);
  /* the letters across the armour, kept as they are */
  float yellow = step(38.0, hue) * step(hue, 72.0) * smoothstep(0.5, 0.6, sat) * smoothstep(0.4, 0.5, mx);
  /* skin: a warm brown, saturated; on the head the hair is a warm brown too, but darker and duller */
  float warm = clamp(step(hue, 38.0) + step(338.0, hue), 0.0, 1.0) * smoothstep(0.22, 0.32, sat);
  pdSkin = warm * mix(smoothstep(0.02, 0.05, mx), smoothstep(0.1, 0.15, mx) * (1.0 - smoothstep(0.88, 0.96, mx)), head) * (1.0 - feet) * (1.0 - yellow);
  /* the trousers' olive (on the body itself only where it is light enough: the armour has darker olive straps) */
  float olive = step(38.0, hue) * step(hue, 130.0) * smoothstep(0.05, 0.08, sat) * (1.0 - yellow);
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  vec3 camo = pdCamo(vBind);
  vec3 sleeve = mix(uShirt, camo, uCamo) * clamp(l / uShirtRef, 0.3, 1.7);
  vec3 trousers = mix(uTrousers, camo, uCamo) * clamp(l / uTrousersRef, 0.3, 1.5);
  vec3 gear = c * 0.8;
  vec3 bodyCloth = mix(gear, trousers, olive * smoothstep(0.17, 0.22, mx));
  /* on the shirt's part: its own cloth is grey or cool; olive there is the armour's, and a warm brown the hair's */
  float hairLike = clamp(step(hue, 38.0) + step(338.0, hue), 0.0, 1.0) * smoothstep(0.06, 0.1, sat);
  /* on the legs everything but the darkest gear (the holster, the straps) is the trousers' own cloth, its seams,
     stitching and wear too: in the trousers' colour, lighter or darker with the cloth's own light, not left light on
     dark cloth */
  float legCloth = max(olive * smoothstep(0.08, 0.12, mx), smoothstep(0.1, 0.17, mx));
  vec3 cloth = body * bodyCloth
    + shirt * mix(mix(sleeve, bodyCloth, olive), c, hairLike)
    + legs * mix(gear, trousers, legCloth)
    + feet * mix(gear * 0.85, trousers, olive * smoothstep(0.08, 0.12, mx))
    + head * c;
  vec3 skin = uTone * clamp(l / uSkinRef, 0.2, 2.4);
  diffuseColor.rgb = mix(mix(cloth, skin, pdSkin), c, yellow);
}`);
  if (shader.fragmentShader.includes('#include <roughnessmap_fragment>')) {
    shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.55, pdSkin);');
  }
}

function materialFor(model, base, L) {
  const U = UNIFORMS[L.uniform];
  const m = model.material.clone();
  const camo = U.camo || [U.shirt, U.shirt, U.shirt, U.shirt];
  // the camouflage's blotches the same size whatever the model's units: the model is `tall` of its units, 1.80 m
  const perUnit = (CAMO_PER_METRE * 1.8) / Math.max(1e-6, base.tall);
  m.userData.dress = {
    uTone: vec(L.tone), uShirt: vec(U.shirt), uTrousers: vec(U.trousers),
    uCamoA: vec(camo[0]), uCamoB: vec(camo[1]), uCamoC: vec(camo[2]), uCamoD: vec(camo[3]), uCamo: U.camo ? 1 : 0, uCamoScale: perUnit,
    uSkinRef: lum(OWN_SKIN), uShirtRef: lum(OWN_SHIRT), uTrousersRef: lum(OWN_TROUSERS),
  };
  m.onBeforeCompile = dressShader;
  m.customProgramCacheKey = () => 'police-dress-1';
  return m;
}

// --------------------------------------------------------------------------------------------------- her hat --

// A beret's crown about its band (`rx`, `rz` across and from front to back), `high` above it: a soft bag of wool
// turned about the head, its overhang let down `droop` over the right side.
function beretCrown(rx, rz, high, droop) {
  // its outline from the band up: how far out (a share of the band), how high (a share of `high`)
  const outline = [[1.0, 0], [1.1, 0.1], [1.22, 0.26], [1.3, 0.44], [1.27, 0.6], [1.1, 0.78], [0.78, 0.92], [0.4, 0.985], [0, 1]];
  const g = new THREE.LatheGeometry(outline.map(([r, y]) => new THREE.Vector2(r, y)), 36);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i += 1) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const out = Math.max(0, Math.hypot(x, z) - 1) / 0.3;          // how far it stands out beyond the band
    const right = Math.max(0, -x) / Math.max(1e-6, Math.hypot(x, z));
    p.setXYZ(i, x * rx * (1 + 0.1 * right * out), y * high - droop * right * right * (0.35 + 0.65 * out) * Math.min(1, y * 4), z * rz);
  }
  g.computeVertexNormals();
  return g;
}

// A beret or a peaked cap, made for her head as it is now: in the model's own units, about the head as it was bound
// (the figure attaches it to its head bone). Its parts are made once for her and shared by every figure of her.
function hatFor(base, U, positions) {
  const { face } = base;
  const { F } = face;
  const sk = face.skull;
  // the head where the band sits: its middle and how far it reaches either way, from her head as it is (ignoring
  // the odd stray point of the hair)
  const band = face.brow.y + 0.17 * F;
  const xs = [], zs = [];
  let top = -Infinity;
  for (let i = 0; i < positions.length / 3; i += 1) {
    if (base.head[i] < 0.6) continue;
    const x = positions[i * 3], y = positions[i * 3 + 1], z = positions[i * 3 + 2];
    if (y > band - 0.25 * F && Math.hypot((x - sk.x) / sk.rx, (z - sk.z) / sk.rz) < 1.6) top = Math.max(top, y);
    if (Math.abs(y - band) < 0.12 * F) { xs.push(x); zs.push(z); }
  }
  xs.sort((a, b) => a - b); zs.sort((a, b) => a - b);
  const at = (list, q) => list[Math.max(0, Math.min(list.length - 1, Math.round(q * (list.length - 1))))];
  const left = xs.length ? at(xs, 0.02) : sk.x - sk.rx, right = xs.length ? at(xs, 0.98) : sk.x + sk.rx;
  const back = zs.length ? at(zs, 0.02) : sk.z - sk.rz, fore = zs.length ? at(zs, 0.98) : sk.z + sk.rz;
  const cx = (left + right) / 2, cz = (back + fore) / 2;
  const rx = Math.max((right - left) / 2, sk.rx) * 1.04, rz = Math.max((fore - back) / 2, sk.rz) * 1.04;
  if (!Number.isFinite(top)) top = sk.top;
  const felt = surface({ color: linear(U.hatColour), roughness: 0.96, metalness: 0, side: THREE.DoubleSide });
  const gloss = surface({ color: linear(0x0b0b0c), roughness: 0.3, metalness: 0.05 });
  const gold = surface({ color: linear(U.badge), roughness: 0.3, metalness: 0.85 });
  const parts = [];
  const add = (geometry, material, p, r = [0, 0, 0], s = [1, 1, 1]) => parts.push({ geometry, material, p, r, s });
  if (U.hat === 'beret') {
    // the band of leather round the head, level, a finger's width above the brow
    add(new THREE.TorusGeometry(1, 0.045, 6, 40), felt, [cx, band, cz], [Math.PI / 2, 0, 0], [rx * 1.01, rz * 1.01, rx]);
    // the crown: soft wool rising from the band, fuller than the head, and pulled down over her right ear (her
    // right is -x), as the police wear it
    const lift = Math.max(0.55 * F, top - band + 0.14 * F);
    add(beretCrown(rx, rz, lift, 0.62 * F), felt, [cx - rx * 0.06, band, cz]);
    // the badge on its front, over her left eye, where the crown stands out from the band
    const a = 0.55, out = 1.2, up = 0.26;
    add(new THREE.CylinderGeometry(1, 1, 1, 18), gold, [cx - rx * 0.06 + rx * out * Math.sin(a), band + lift * up, cz + rz * out * Math.cos(a)], [Math.PI / 2 - 0.35, a, 0, 'YXZ'], [0.16 * F, 0.05 * F, 0.19 * F]);
  } else {
    // the peaked cap: its band round the head; its crown flaring out from the band to a top much wider than the head,
    // higher at the front; the peak over the eyes, angled down; the badge at the front of the crown
    const bandHigh = 0.36 * F;
    const crown = Math.max(0.55 * F, top - band - bandHigh + 0.22 * F);
    add(new THREE.CylinderGeometry(1, 1, 1, 36, 1, true), felt, [cx, band + bandHigh / 2, cz], [0, 0, 0], [rx * 1.02, bandHigh, rz * 1.02]);
    add(new THREE.CylinderGeometry(1.3, 1.02, 1, 36, 1, true), felt, [cx, band + bandHigh + crown / 2, cz + rz * 0.04], [0.1, 0, 0], [rx, crown, rz]);
    add(new THREE.CircleGeometry(1.3, 36), felt, [cx, band + bandHigh + crown, cz + rz * 0.04], [-Math.PI / 2 + 0.1, 0, 0], [rx, rz, 1]);
    add(new THREE.CircleGeometry(1, 30, 0, Math.PI), gloss, [cx, band + 0.02 * F, cz + rz * 0.86], [Math.PI / 2 + 0.55, 0, 0], [rx * 0.92, 0.75 * F, 1]);
    add(new THREE.CylinderGeometry(1, 1, 1, 18), gold, [cx, band + bandHigh + crown * 0.42, cz + rz * 1.12], [Math.PI / 2 - 0.25, 0, 0], [0.18 * F, 0.04 * F, 0.2 * F]);
  }
  return { parts, materials: [felt, gloss, gold] };
}

// --------------------------------------------------------------------------------------------------- dressing --

// Dresses a figure made from the police officer's model as the k-th officer: `mesh` its skinned mesh, `root` what the
// figure's size is set on, `bones` its bones by name. Each officer's shape, material and hat are made once and shared
// by every figure of her. Gives back what she is.
export function dressPolice({ model, root, mesh, bones, k, shadow = false }) {
  const L = POLICE_LOOKS[((k % POLICE_LOOKS.length) + POLICE_LOOKS.length) % POLICE_LOOKS.length];
  const U = UNIFORMS[L.uniform];
  const base = prepare(model, mesh);
  let v = base.variants.get(k);
  if (!v) {
    const shaped = reshape(base, L, true);
    const g = new THREE.BufferGeometry();
    for (const [name, attribute] of Object.entries(model.geometry.attributes)) if (name !== 'position') g.setAttribute(name, attribute);
    const stored = new base.Type(shaped.length);
    if (base.unit === 1) stored.set(shaped);
    else for (let i = 0; i < shaped.length; i += 1) stored[i] = Math.max(-base.unit, Math.min(base.unit, Math.round(shaped[i] * base.unit)));
    g.setAttribute('position', new THREE.BufferAttribute(stored, 3, base.normalized));
    g.setAttribute('aZone', base.zoneAttribute);
    g.setIndex(model.geometry.index);
    g.boundingBox = model.geometry.boundingBox.clone(); g.boundingSphere = model.geometry.boundingSphere.clone();
    v = { geometry: g, material: materialFor(model, base, L), hat: hatFor(base, U, shaped) };
    base.variants.set(k, v);
  }
  mesh.geometry = v.geometry;
  mesh.material = v.material;
  // her hat, on her head and moving with it: placed where the head was as the figure was bound
  const head = bones.get('head');
  const j = head && mesh.skeleton ? mesh.skeleton.bones.indexOf(head) : -1;
  if (j >= 0) {
    const hat = new THREE.Group();
    hat.name = 'police-hat';
    hat.matrixAutoUpdate = false;
    hat.matrix.copy(mesh.skeleton.boneInverses[j]).multiply(mesh.bindMatrix);
    for (const part of v.hat.parts) {
      const m = new THREE.Mesh(part.geometry, part.material);
      m.position.fromArray(part.p); m.rotation.set(part.r[0], part.r[1], part.r[2], part.r[3] || 'XYZ'); m.scale.fromArray(part.s);
      m.castShadow = shadow;
      hat.add(m);
    }
    head.add(hat);
  }
  // her height
  root.scale.multiplyScalar(HEIGHT * L.height);
  return { k, skin: L.skin, uniform: L.uniform, height: HEIGHT * L.height };
}

// Lets go of what was made for the officers of a model, when the model itself is let go (animated.js).
export function undressPolice(model) {
  const base = prepared.get(model);
  if (!base) return;
  for (const v of base.variants.values()) {
    v.geometry.dispose(); v.material.dispose();
    for (const part of v.hat.parts) part.geometry.dispose();
    for (const m of v.hat.materials) m.dispose();
  }
  base.variants.clear();
  base.zoneAttribute = null;
  prepared.delete(model);
}
