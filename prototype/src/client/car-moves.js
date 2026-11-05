// The owner's Mixamo moves for cars (5 November 2026: "I have supplied the Entering Car animation, Exiting Car animation,
// Driving animation, Sitting Idle animation, Sitting Talking animations. Use it. I also supplied pull from car seat
// animation, also use it to redesign the current pull from car seat animation"), as the game's own copy has them:
// `figures/car-moves.json`, made from his files by tools/characters/car-moves.mjs (his files are not changed). Each move
// is kept as motion any figure can be given: for each frame how the hips are turned from how they stand bound, the way
// every other bone of the body points (to the next joint along it), and where the hips are. Here it is carried onto a
// figure's own bones the first time that figure needs it (as falls.js carries the falls): each keeps its own bone
// lengths, so a short figure's hands still reach its own wheel.
//
//   await loadCarMoves(fetchFile)                    once: the file fetched and read
//   const moves = carryCarMoves(rig)                 a figure's own: { enter, exit, drive, sit, talk, pulled }, each
//                                                    { fps, duration, frames: [Float32Array (bones x 4)], hips: [x, y, z] x frames }
//   poseCarMove(rig, moves.drive, t, { loop: true }) the figure's body bones set to the move at t seconds

export const CAR_MOVE_BONES = Object.freeze([
  'pelvis', 'spine_01', 'spine_02', 'spine_03', 'neck_01', 'head',
  'clavicle_l', 'upperarm_l', 'lowerarm_l', 'hand_l', 'clavicle_r', 'upperarm_r', 'lowerarm_r', 'hand_r',
  'thigh_l', 'calf_l', 'foot_l', 'ball_l', 'thigh_r', 'calf_r', 'foot_r', 'ball_r',
]);
// (each bone's next joint, by the game's own names: falls.js has the same)
const NEXT = {
  pelvis: 'spine_01', spine_01: 'spine_02', spine_02: 'spine_03', spine_03: 'neck_01', neck_01: 'head',
  clavicle_l: 'upperarm_l', upperarm_l: 'lowerarm_l', lowerarm_l: 'hand_l', hand_l: 'middle_01_l',
  clavicle_r: 'upperarm_r', upperarm_r: 'lowerarm_r', lowerarm_r: 'hand_r', hand_r: 'middle_01_r',
  thigh_l: 'calf_l', calf_l: 'foot_l', foot_l: 'ball_l', thigh_r: 'calf_r', calf_r: 'foot_r', foot_r: 'ball_r',
};

let file = null, loading = null;
// The file, fetched once and read: each move's frames as numbers (-1 to 1 for each direction and turn) and the hips'
// place in metres.
export function loadCarMoves(fetchFile = (path) => fetch(path)) {
  if (file) return Promise.resolve(file);
  if (loading) return loading;
  loading = (async () => {
    const res = await fetchFile('figures/car-moves.json');
    if (!res.ok) throw new Error(`car moves: ${res.status}`);
    const json = await res.json();
    if (JSON.stringify(json.bones) !== JSON.stringify(CAR_MOVE_BONES)) throw new Error('car moves: not the bones expected');
    const bytes = (b64) => { const raw = atob(b64); const out = new Uint8Array(raw.length); for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i); return out; };
    const width = 4 + (CAR_MOVE_BONES.length - 1) * 3;
    const moves = {};
    for (const [name, m] of Object.entries(json.moves)) {
      const ints = new Int16Array(bytes(m.data).buffer);
      const hips = new Int32Array(bytes(m.hips).buffer);
      const frames = [];
      for (let f = 0; f < m.frames; f += 1) frames.push(Float32Array.from(ints.subarray(f * width, (f + 1) * width), (v) => v / 32767));
      moves[name] = { fps: m.fps, duration: m.duration, frames, hips: Float32Array.from(hips, (v) => v / 10000) };
    }
    file = { moves };
    return file;
  })();
  loading.catch(() => { loading = null; });
  return loading;
}
export const carMovesLoaded = () => !!file;

// A figure's own copy of the moves, made once from the file (null until it has come). `rig`: an animated figure
// (animated.js), its bones by name, its root and its skeleton; its body is set to how it is bound while it is worked
// out, and put back as it was after.
export function carryCarMoves(rig) {
  if (!file || !rig || !rig.bones || !rig.root) return null;
  if (rig.carMoves) return rig.carMoves;
  const skeleton = rig.skeleton || (rig.mesh && rig.mesh.skeleton);
  if (!skeleton) return null;
  const root = rig.root, bones = rig.bones;
  const was = new Map(CAR_MOVE_BONES.map((n) => { const b = bones.get(n); return [n, b ? b.quaternion.clone() : null]; }));
  // how each bone is bound: its turn from its parent's as the skin was made
  const bindWorld = new Map(), bindLocal = new Map();
  skeleton.bones.forEach((b, i) => { const q = new THREE.Quaternion(); skeleton.boneInverses[i].clone().invert().decompose(new THREE.Vector3(), q, new THREE.Vector3()); bindWorld.set(b, q); });
  for (const n of CAR_MOVE_BONES) {
    const b = bones.get(n);
    if (!b || !bindWorld.has(b)) continue;
    const parentQ = b.parent && bindWorld.has(b.parent) ? bindWorld.get(b.parent).clone() : new THREE.Quaternion();
    bindLocal.set(n, parentQ.invert().multiply(bindWorld.get(b)));
  }
  const rootQ = new THREE.Quaternion(), w = new THREE.Quaternion(), pq = new THREE.Quaternion(), turn = new THREE.Quaternion();
  const a = new THREE.Vector3(), c = new THREE.Vector3(), want = new THREE.Vector3(), inv = new THREE.Matrix4();
  const pelvis = bones.get('pelvis');
  const pelvisBind = pelvis && bindWorld.has(pelvis) ? bindWorld.get(pelvis) : new THREE.Quaternion();
  const one = (frame) => {
    for (const n of CAR_MOVE_BONES) { const b = bones.get(n); if (b && bindLocal.has(n)) b.quaternion.copy(bindLocal.get(n)); }
    root.updateMatrixWorld(true);
    inv.copy(root.matrixWorld).invert();
    root.getWorldQuaternion(rootQ); const rootInv = rootQ.clone().invert();
    const out = new Float32Array(CAR_MOVE_BONES.length * 4);
    CAR_MOVE_BONES.forEach((n, k) => {
      const d = bones.get(n);
      if (!d) return;
      if (k === 0) {
        w.set(frame[0], frame[1], frame[2], frame[3]).normalize().multiply(pelvisBind);
      } else {
        const at = 4 + (k - 1) * 3, next = bones.get(NEXT[n]);
        want.set(frame[at], frame[at + 1], frame[at + 2]);
        d.getWorldQuaternion(w); w.premultiply(rootInv);
        if (next && want.lengthSq() > 0.25) {
          a.setFromMatrixPosition(d.matrixWorld).applyMatrix4(inv); c.setFromMatrixPosition(next.matrixWorld).applyMatrix4(inv);
          turn.setFromUnitVectors(c.sub(a).normalize(), want.normalize());
          w.premultiply(turn);
        }
      }
      d.parent.getWorldQuaternion(pq); pq.premultiply(rootInv);
      d.quaternion.copy(pq.invert().multiply(w));
      d.updateMatrixWorld(true);
      d.quaternion.toArray(out, k * 4);
    });
    return out;
  };
  const carried = {};
  for (const [name, m] of Object.entries(file.moves)) carried[name] = { fps: m.fps, duration: m.duration, frames: m.frames.map(one), hips: m.hips };
  for (const n of CAR_MOVE_BONES) { const b = bones.get(n); if (b && was.get(n)) b.quaternion.copy(was.get(n)); }
  root.updateMatrixWorld(true);
  rig.carMoves = carried;
  return carried;
}

// The figure's body bones set to a move at `t` seconds (between its frames, turned part of the way), held at its last
// frame after its end unless `loop`. Gives where the hips are then, in the move's own frame (metres: x the figure's
// left, y up, z ahead as it starts), for placing the figure.
const qa = new THREE.Quaternion(), qb = new THREE.Quaternion();
export function poseCarMove(rig, move, t, { loop = false } = {}) {
  if (!rig || !rig.bones || !move) return null;
  const n = move.frames.length;
  let f = Math.max(0, t) * move.fps;
  if (loop) f %= n - 1; else f = Math.min(f, n - 1);
  const i = Math.floor(f), j = Math.min(n - 1, i + 1), e = f - i;
  const A = move.frames[i], B = move.frames[j];
  CAR_MOVE_BONES.forEach((name, k) => {
    const b = rig.bones.get(name);
    if (!b) return;
    qa.fromArray(A, k * 4); qb.fromArray(B, k * 4);
    if (qa.lengthSq() < 0.5) return;
    b.quaternion.copy(qa.slerp(qb, e));
  });
  const h = move.hips;
  return [h[i * 3] + (h[j * 3] - h[i * 3]) * e, h[i * 3 + 1] + (h[j * 3 + 1] - h[i * 3 + 1]) * e, h[i * 3 + 2] + (h[j * 3 + 2] - h[i * 3 + 2]) * e];
}
