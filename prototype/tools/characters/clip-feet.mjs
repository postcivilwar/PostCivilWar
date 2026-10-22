// How high a figure's feet are, and its hips, through one of its clips: for fitting a jump's rise and fall to the
// clip it plays (the supplied clips are made in place: the hips do not leave the spot).
//   node tools/characters/clip-feet.mjs <file in assets/characters/figures/animated> <clip> [samples=30]
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { parseGLB, boneName } from '../../src/client/glb.js';
const THREE = createRequire(import.meta.url)('../../vendor/three.min.js');
const [file, clipName, samples = '30'] = process.argv.slice(2);
const b = readFileSync(new URL(`../../assets/characters/figures/animated/${file}`, import.meta.url));
const parsed = parseGLB(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
const { json } = parsed;
const objects = json.nodes.map((n) => { const o = new THREE.Object3D(); o.name = boneName(n.name || ''); if (n.translation) o.position.fromArray(n.translation); if (n.rotation) o.quaternion.fromArray(n.rotation); if (n.scale) o.scale.fromArray(n.scale); return o; });
json.nodes.forEach((n, i) => { for (const c of n.children || []) objects[i].add(objects[c]); });
const root = new THREE.Object3D();
for (const r of json.scenes[json.scene || 0].nodes) root.add(objects[r]);
root.updateMatrixWorld(true);
const by = new Map(objects.map((o) => [o.name, o]));
const mixamo = json.nodes.some((n) => /^mixamorig:/.test(n.name || ''));
const bone = (ue, mx) => by.get(mixamo ? boneName(`mixamorig:${mx}`) : ue);
const feet = [bone('foot_l', 'LeftFoot'), bone('foot_r', 'RightFoot')], toes = [bone('ball_l', 'LeftToeBase'), bone('ball_r', 'RightToeBase')], hips = bone('pelvis', 'Hips'), head = bone('head', 'Head');
const tracks = parsed.animations.find((a) => a.name === clipName);
if (!tracks) { console.log('no clip', clipName, parsed.animations.map((a) => a.name).join(', ')); process.exit(1); }
const clip = new THREE.AnimationClip(tracks.name, tracks.length, tracks.tracks.map((t) => t.path === 'rotation' ? new THREE.QuaternionKeyframeTrack(`${boneName(t.node)}.quaternion`, t.times, t.values) : t.path === 'translation' ? new THREE.VectorKeyframeTrack(`${boneName(t.node)}.position`, t.times, t.values) : null).filter(Boolean));
const mixer = new THREE.AnimationMixer(root); mixer.clipAction(clip).play();
const v = new THREE.Vector3();
const lowFoot = () => Math.min(...[...feet, ...toes].filter(Boolean).map((o) => o.getWorldPosition(v).y));
mixer.setTime(0); root.updateMatrixWorld(true);
const height = head.getWorldPosition(v).y;
const rest = lowFoot();
console.log(`${file} ${clipName}: ${tracks.length.toFixed(2)} s; head ${height.toFixed(3)} (model units), lowest foot at start ${rest.toFixed(3)}`);
for (let i = 0; i <= +samples; i += 1) {
  const t = (tracks.length * i) / +samples;
  mixer.setTime(t); root.updateMatrixWorld(true);
  const f = lowFoot() - rest, h = hips.getWorldPosition(v).y;
  console.log(`t ${t.toFixed(2)}  lowest foot ${(f / height).toFixed(3)} of its height   hips ${(h / height).toFixed(3)}  ${'#'.repeat(Math.max(0, Math.round(f / height * 100)))}`);
}
