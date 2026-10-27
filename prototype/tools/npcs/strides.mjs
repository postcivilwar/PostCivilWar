// How fast each of the town's people's walks goes over the ground, played as it was made (27 October 2026), so that the
// game moves each figure at the pace its feet are going and they do not slide (the owner's brief: "no sliding feet").
// The walks are made in place: the hips stay where they are and the planted foot goes back under the body. So the walk's
// pace is how fast the planted foot (whichever is lowest) goes back, measured through the whole walk on each family's
// own skeleton (npc-figures.js `family`: every figure of one family takes the same borrowed moves, borrow.mjs) and
// given for a figure drawn 1.7 m tall (a taller figure's stride is longer in proportion).
//   node tools/npcs/strides.mjs            prints { family: { walk: metres a second } } as animated.js has it
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { parseGLB, boneName } from '../../src/client/glb.js';
import { NPC_FIGURES } from '../../src/sim/npc-figures.js';
import { MOVES_B64 } from '../../src/client/figure-borrowed.js';

const THREE = createRequire(import.meta.url)('../../vendor/three.min.js');
const MOVES = JSON.parse(Buffer.from(MOVES_B64, 'base64').toString('utf8'));
const WALKS = ['stroll', 'catwalk', 'swagger', 'walk', 'run', 'scared'];
const families = new Map();
for (const f of Object.values(NPC_FIGURES)) if (!families.has(f.family)) families.set(f.family, NPC_FIGURES[f.family] || f);

function clipOf(b) {
  const all = new Int16Array(Uint8Array.from(Buffer.from(b.data, 'base64')).buffer);
  const times = new Float32Array(b.frames);
  for (let i = 0; i < b.frames; i += 1) times[i] = (b.duration * i) / (b.frames - 1);
  return new THREE.AnimationClip('m', b.duration, b.bones.map((bone, k) => {
    const values = new Float32Array(b.frames * 4);
    for (let i = 0; i < b.frames; i += 1) for (let c = 0; c < 4; c += 1) values[i * 4 + c] = all[(i * b.bones.length + k) * 4 + c] / 32767;
    return new THREE.QuaternionKeyframeTrack(`${boneName(bone)}.quaternion`, times, values);
  }));
}

const out = {};
for (const [family, f] of families) {
  const bytes = readFileSync(new URL(`../../assets/characters/${f.source}`, import.meta.url));
  const parsed = parseGLB(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  const { json } = parsed;
  const objects = json.nodes.map((n) => { const o = new THREE.Object3D(); o.name = boneName(n.name || ''); if (n.matrix) new THREE.Matrix4().fromArray(n.matrix).decompose(o.position, o.quaternion, o.scale); if (n.translation) o.position.fromArray(n.translation); if (n.rotation) o.quaternion.fromArray(n.rotation); if (n.scale) o.scale.fromArray(n.scale); return o; });
  json.nodes.forEach((n, i) => { for (const c of n.children || []) objects[i].add(objects[c]); });
  const root = new THREE.Object3D();
  for (const r of json.scenes[json.scene || 0].nodes) root.add(objects[r]);
  root.updateMatrixWorld(true);
  const by = new Map(objects.map((o) => [o.name, o]));
  const find = (re) => objects.find((o) => re.test(o.name));
  const feet = [find(/LeftToeBase$|ball_l$/) || find(/LeftFoot$|foot_l$/), find(/RightToeBase$|ball_r$/) || find(/RightFoot$|foot_r$/)];
  // the body's height as drawn: its mesh, top to bottom, where it is in the scene
  const meshNode = json.nodes.findIndex((n) => n.mesh !== undefined);
  const acc = json.accessors[json.meshes[json.nodes[meshNode].mesh].primitives[0].attributes.POSITION];
  const s = new THREE.Vector3(); objects[meshNode].matrixWorld.decompose(new THREE.Vector3(), new THREE.Quaternion(), s);
  const tall = (acc.max[1] - acc.min[1]) * s.y;
  const fileName = f.file;
  out[family] = {};
  for (const walk of WALKS) {
    const b = MOVES.borrowed[fileName] && MOVES.borrowed[fileName][walk];
    if (!b) continue;
    const mixer = new THREE.AnimationMixer(root);
    mixer.clipAction(clipOf(b)).play();
    const N = 400, dt = b.duration / N, v = new THREE.Vector3();
    const speeds = [];
    let last = null;
    for (let k = 0; k <= N; k += 1) {
      mixer.setTime(k * dt); root.updateMatrixWorld(true);
      const at = feet.map((o) => o.getWorldPosition(new THREE.Vector3()));
      const low = at[0].y < at[1].y ? 0 : 1;
      if (last && last.low === low && Math.abs(at[0].y - at[1].y) > 0.004 * tall) speeds.push(Math.hypot(at[low].x - last.at[low].x, at[low].z - last.at[low].z) / dt);
      last = { low, at };
    }
    speeds.sort((a, b2) => a - b2);
    // the planted foot's pace, from the middle of its time on the ground (a foot landing or lifting is not planted)
    const mid = speeds.slice(Math.floor(speeds.length * 0.25), Math.ceil(speeds.length * 0.75));
    const pace = mid.reduce((a, b2) => a + b2, 0) / Math.max(1, mid.length);
    out[family][walk] = Number(((pace / tall) * 1.7).toFixed(2));
    mixer.stopAllAction();
  }
}
console.log(JSON.stringify(out, null, 1));
