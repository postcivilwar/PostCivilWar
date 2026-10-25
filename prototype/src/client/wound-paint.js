// Blood on the clothes where someone has been shot (22 October 2026, the owner's brief: "realistic blood: a spray where
// the bullet hits, blood stains on the clothes ..."; painted on the figure itself, not a sticker on it).
//
// A wound is kept by where it is on the body, so that it moves with the body and can be told to the other players
// (link.js `wd`): the bone it is by (one of WOUND_BONES, the same on every figure), and how far from that bone, in the
// figure's own frame (ahead, up, to its left), as a share of the figure's height; and how large. Where a round struck
// is turned into one by the bone nearest it, the stain put on the side the round came from, at about the body's
// surface there (`woundAt`).
//
// The stain itself is painted by the figure's own material: every point of its surface within a stain's reach is
// darkened toward dried blood, more toward the middle, with a ragged edge. A figure with no wounds is drawn as it always
// is; one with wounds is given its own copy of its material (the same pictures), which is let go again when the wounds
// are (healed at the hospital: gun-play.js). At most MOST_WOUNDS are painted on anyone; more run together.

export const WOUND_BONES = Object.freeze(['pelvis', 'spine_01', 'spine_02', 'spine_03', 'neck_01', 'head', 'clavicle_l', 'upperarm_l', 'lowerarm_l', 'hand_l', 'clavicle_r', 'upperarm_r', 'lowerarm_r', 'hand_r', 'thigh_l', 'calf_l', 'foot_l', 'thigh_r', 'calf_r', 'foot_r']);
// each bone's reach, wound-wise: the bone it runs to, and how far its surface is from that line (for a figure 1.75 m tall)
const SPANS = Object.freeze({
  pelvis: ['spine_01', 0.13], spine_01: ['spine_02', 0.13], spine_02: ['spine_03', 0.14], spine_03: ['neck_01', 0.14], neck_01: ['head', 0.06], head: [null, 0.09],
  clavicle_l: ['upperarm_l', 0.07], upperarm_l: ['lowerarm_l', 0.055], lowerarm_l: ['hand_l', 0.045], hand_l: [null, 0.035],
  clavicle_r: ['upperarm_r', 0.07], upperarm_r: ['lowerarm_r', 0.055], lowerarm_r: ['hand_r', 0.045], hand_r: [null, 0.035],
  thigh_l: ['calf_l', 0.075], calf_l: ['foot_l', 0.055], foot_l: [null, 0.045], thigh_r: ['calf_r', 0.075], calf_r: ['foot_r', 0.055], foot_r: [null, 0.045],
});
export const MOST_WOUNDS = 8;
const STAIN = 0.065;             // metres across a stain's middle for a figure 1.75 m tall, one round

const v = () => new THREE.Vector3();
const T = { a: v(), b: v(), c: v(), d: v(), q: new THREE.Quaternion() };

// The wound a round makes striking `rig` at `point` (in the scene), coming the way `dir` goes: [bone, ahead, up, left,
// size], or null for a figure with no bones to put it by.
export function woundAt(rig, point, dir) {
  if (!rig || !rig.bones) return null;
  const H = rig.spec ? rig.spec.height : 1.75, hs = H / 1.75;
  let best = null;
  for (let i = 0; i < WOUND_BONES.length; i += 1) {
    const name = WOUND_BONES[i];
    const bone = rig.bones.get(name);
    if (!bone) continue;
    const [next, radius] = SPANS[name];
    const a = bone.getWorldPosition(v());
    const toBone = next && rig.bones.get(next) ? rig.bones.get(next).getWorldPosition(v()) : a.clone();
    // the nearest point of the bone's line to where the round struck
    const ab = toBone.clone().sub(a);
    const t = ab.lengthSq() > 1e-8 ? Math.max(0, Math.min(1, point.clone().sub(a).dot(ab) / ab.lengthSq())) : 0;
    const on = a.clone().addScaledVector(ab, t);
    const d = on.distanceTo(point);
    if (!best || d - radius * hs < best.d - best.radius * hs) best = { i, bone, on, d, radius, a };
  }
  if (!best) return null;
  // on the body's surface, on the side the round came from (toward where it struck, and back along its way)
  const out = T.a.copy(dir).normalize().multiplyScalar(-1).add(T.b.copy(point).sub(best.on).normalize().multiplyScalar(0.8));
  if (out.lengthSq() < 1e-6) out.set(0, 0, 1);
  out.normalize();
  const spot = best.on.clone().addScaledVector(out, best.radius * hs * 0.9);
  // from the bone, in the figure's own frame, as a share of its height
  rig.body.getWorldQuaternion(T.q).invert();
  const local = spot.sub(best.a).applyQuaternion(T.q).divideScalar(H);
  return [best.i, local.z, local.y, local.x, 1];
}

// Where a wound is now, in the scene, and how large (`out`: [x, y, z, radius])
export function woundPlace(rig, w, out = [0, 0, 0, 0]) {
  const bone = rig && rig.bones ? rig.bones.get(WOUND_BONES[w[0]]) : null;
  if (!bone) return null;
  const H = rig.spec ? rig.spec.height : 1.75;
  bone.getWorldPosition(T.a);
  rig.body.getWorldQuaternion(T.q);
  T.b.set(w[3], w[2], w[1]).multiplyScalar(H).applyQuaternion(T.q);
  T.a.add(T.b);
  out[0] = T.a.x; out[1] = T.a.y; out[2] = T.a.z; out[3] = STAIN * (H / 1.75) * Math.min(2.2, Math.sqrt(w[4] || 1));
  return out;
}

// One more wound on a list: one close to another runs into it (the two one larger stain), and at most MOST_WOUNDS.
export function addWound(list, w) {
  if (!w) return list;
  for (const o of list) {
    if (o[0] !== w[0]) continue;
    const d = Math.hypot(o[1] - w[1], o[2] - w[2], o[3] - w[3]);
    if (d < 0.025) { o[4] = Math.min(4, (o[4] || 1) + 0.6); return list; }
  }
  list.push(w);
  while (list.length > MOST_WOUNDS) list.shift();
  return list;
}

// ---- painting them ----

const patched = new WeakSet();
function patch(material) {
  if (patched.has(material)) return material;
  patched.add(material);
  material.userData.wounds = { value: Array.from({ length: MOST_WOUNDS }, () => new THREE.Vector4(0, -1e4, 0, 0)) };
  material.userData.woundCount = { value: 0 };
  const prior = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    if (prior) prior(shader, renderer);
    shader.uniforms.uWounds = material.userData.wounds;
    shader.uniforms.uWoundCount = material.userData.woundCount;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWoundAt;').replace('#include <skinning_vertex>', '#include <skinning_vertex>\n  vWoundAt = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vWoundAt;\nuniform vec4 uWounds[${MOST_WOUNDS}];\nuniform int uWoundCount;`).replace('#include <map_fragment>', `#include <map_fragment>
  for (int i = 0; i < ${MOST_WOUNDS}; i++) {
    if (i >= uWoundCount) break;
    vec4 w = uWounds[i];
    float d = distance(vWoundAt, w.xyz);
    float grain = fract(sin(dot(floor(vWoundAt * 95.0), vec3(12.9898, 78.233, 37.719))) * 43758.5453);
    float k = 1.0 - smoothstep(w.w * (0.45 + 0.35 * grain), w.w, d);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.26, 0.012, 0.018) * (0.75 + 0.3 * grain), k * 0.9);
  }`);
  };
  const key = material.customProgramCacheKey ? material.customProgramCacheKey.bind(material) : null;
  material.customProgramCacheKey = () => `${key ? key() : ''}|wounds`;
  material.needsUpdate = true;
  return material;
}

// Paints `list` on `rig` this frame (an empty list: as it always is, its own material back).
const place = [0, 0, 0, 0];
export function paintWounds(rig, list) {
  const mesh = rig && rig.mesh;
  if (!mesh || !mesh.material || Array.isArray(mesh.material)) return false;
  if (!list || !list.length) {
    if (rig.woundMaterial) { mesh.material = rig.woundMaterial.original; rig.woundMaterial.copy.dispose(); rig.woundMaterial = null; }
    return false;
  }
  if (!rig.woundMaterial) {
    const original = mesh.material;
    const copy = original.clone();
    // (the copy draws as the original does: the same shader pieces where the original has its own)
    if (original.onBeforeCompile) copy.onBeforeCompile = original.onBeforeCompile;
    if (original.customProgramCacheKey) copy.customProgramCacheKey = original.customProgramCacheKey;
    rig.woundMaterial = { original, copy: patch(copy) };
    mesh.material = copy;
  }
  const mat = rig.woundMaterial.copy;
  let n = 0;
  for (const w of list) {
    if (n >= MOST_WOUNDS) break;
    if (!woundPlace(rig, w, place)) continue;
    mat.userData.wounds.value[n].set(place[0], place[1], place[2], place[3]);
    n += 1;
  }
  mat.userData.woundCount.value = n;
  return n > 0;
}
