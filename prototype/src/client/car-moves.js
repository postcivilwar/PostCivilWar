// The owner's Mixamo moves for cars (5 November 2026: "I have supplied the Entering Car animation, Exiting Car animation,
// Driving animation, Sitting Idle animation, Sitting Talking animations. Use it. I also supplied pull from car seat
// animation, also use it to redesign the current pull from car seat animation"), as the game's own copy has them:
// `figures/car-moves.json`, made from his files by tools/characters/car-moves.mjs (his files are not changed). Each move
// is kept as motion any figure can be given: for each frame how the hips are turned from how they stand bound, the way
// every other bone of the body points (to the next joint along it), and where the hips are. Here a move is carried onto
// a figure's own bones the first time that figure needs it (as falls.js carries the falls): each keeps its own bone
// lengths, so a short figure's hands still reach its own wheel.
//
// His moves, as they were made: `enter` walks up to a car's door with the car to its right, opens it, turns left and
// sits, its back to the door's hinge side, and pulls the door shut (5.5 s); `exit` from sitting swings its legs out to
// its left, stands and walks off (5.8 s); `drive` seated with both hands on a wheel (5 s, round again); `sit` and `talk`
// seated with the hands in the lap, still or talking (4.3 s and 44 s); `pulled` seated, dragged out to its right and down
// onto the ground (4.7 s). Each can be had mirrored, left for right: the same move from the other side of the car.
//
//   await loadCarMoves(fetchFile)                 once: the file fetched and read
//   carMove(rig, 'enter', mirrored)               a figure's own copy of a move (made the first time), or null until the
//                                                 file has come: { fps, duration, frames: [Float32Array], hips }
//   poseCarMove(rig, move, t, { loop })           the figure's body bones set to the move at t seconds; gives where its
//                                                 hips are then, in the move's own frame (metres)

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
// (each bone's other side, for a move mirrored)
const OTHER = CAR_MOVE_BONES.map((n) => CAR_MOVE_BONES.indexOf(n.endsWith('_l') ? `${n.slice(0, -2)}_r` : n.endsWith('_r') ? `${n.slice(0, -2)}_l` : n));
// The hips' height in the moves standing, for a figure of another height (Mixamo's Y Bot, his files' figure)
export const MOVES_HIPS = 1.034;

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
    file = { moves, mirrored: {} };
    return file;
  })();
  loading.catch(() => { loading = null; });
  return loading;
}
export const carMovesLoaded = () => !!file;

// A move mirrored, left for right (across the figure's own middle): each bone given its other side's motion, every
// direction and the hips' place with its left and right swapped, the hips' turn the other way about.
function mirroredMove(name) {
  if (file.mirrored[name]) return file.mirrored[name];
  const m = file.moves[name];
  const width = 4 + (CAR_MOVE_BONES.length - 1) * 3;
  const frames = m.frames.map((fr) => {
    const out = new Float32Array(width);
    // the hips' turn: mirrored across the plane x = 0 (x stays, y and z turn the other way)
    out[0] = fr[0]; out[1] = -fr[1]; out[2] = -fr[2]; out[3] = fr[3];
    for (let k = 1; k < CAR_MOVE_BONES.length; k += 1) {
      const from = 4 + (OTHER[k] - 1) * 3, to = 4 + (k - 1) * 3;
      out[to] = -fr[from]; out[to + 1] = fr[from + 1]; out[to + 2] = fr[from + 2];
    }
    return out;
  });
  const hips = Float32Array.from(m.hips, (v, i) => (i % 3 === 0 ? -v : v));
  return (file.mirrored[name] = { fps: m.fps, duration: m.duration, frames, hips });
}

// How a figure is bound (its bones' turns from their parents' as its skin was made), once for each figure.
function bindOf(rig) {
  if (rig.carBind) return rig.carBind;
  const skeleton = rig.skeleton || (rig.mesh && rig.mesh.skeleton);
  if (!skeleton || !rig.bones || !rig.root) return null;
  const bindWorld = new Map(), bindLocal = new Map();
  skeleton.bones.forEach((b, i) => { const q = new THREE.Quaternion(); skeleton.boneInverses[i].clone().invert().decompose(new THREE.Vector3(), q, new THREE.Vector3()); bindWorld.set(b, q); });
  for (const n of CAR_MOVE_BONES) {
    const b = rig.bones.get(n);
    if (!b || !bindWorld.has(b)) continue;
    const parentQ = b.parent && bindWorld.has(b.parent) ? bindWorld.get(b.parent).clone() : new THREE.Quaternion();
    bindLocal.set(n, parentQ.invert().multiply(bindWorld.get(b)));
  }
  const pelvis = rig.bones.get('pelvis');
  return (rig.carBind = { bindLocal, pelvisBind: pelvis && bindWorld.has(pelvis) ? bindWorld.get(pelvis) : new THREE.Quaternion() });
}

// A figure's own copy of a move (made once from the file; null until it has come, or for a figure not yet loaded).
// `rig`: an animated figure (animated.js), its bones by name, its root and its skeleton; its body is set to how it is
// bound while it is worked out, and put back as it was after.
let T = null;
export function carMove(rig, name, mirrored = false) {
  if (!file || !rig || !rig.bones || !rig.root || !file.moves[name]) return null;
  if (!T) T = { rootQ: new THREE.Quaternion(), w: new THREE.Quaternion(), pq: new THREE.Quaternion(), turn: new THREE.Quaternion(), a: new THREE.Vector3(), c: new THREE.Vector3(), want: new THREE.Vector3(), inv: new THREE.Matrix4() };
  const key = mirrored ? `${name}~` : name;
  rig.carMoves = rig.carMoves || {};
  if (rig.carMoves[key]) return rig.carMoves[key];
  const bind = bindOf(rig);
  if (!bind) return null;
  const src = mirrored ? mirroredMove(name) : file.moves[name];
  const root = rig.root, bones = rig.bones;
  const was = new Map(CAR_MOVE_BONES.map((n) => { const b = bones.get(n); return [n, b ? b.quaternion.clone() : null]; }));
  const one = (frame) => {
    for (const n of CAR_MOVE_BONES) { const b = bones.get(n); if (b && bind.bindLocal.has(n)) b.quaternion.copy(bind.bindLocal.get(n)); }
    root.updateMatrixWorld(true);
    T.inv.copy(root.matrixWorld).invert();
    root.getWorldQuaternion(T.rootQ); const rootInv = T.rootQ.clone().invert();
    const out = new Float32Array(CAR_MOVE_BONES.length * 4);
    CAR_MOVE_BONES.forEach((n, k) => {
      const d = bones.get(n);
      if (!d || !d.parent) return;
      if (k === 0) {
        T.w.set(frame[0], frame[1], frame[2], frame[3]).normalize().multiply(bind.pelvisBind);
      } else {
        const at = 4 + (k - 1) * 3, next = bones.get(NEXT[n]);
        T.want.set(frame[at], frame[at + 1], frame[at + 2]);
        d.getWorldQuaternion(T.w); T.w.premultiply(rootInv);
        if (next && T.want.lengthSq() > 0.25) {
          T.a.setFromMatrixPosition(d.matrixWorld).applyMatrix4(T.inv); T.c.setFromMatrixPosition(next.matrixWorld).applyMatrix4(T.inv);
          T.turn.setFromUnitVectors(T.c.sub(T.a).normalize(), T.want.normalize());
          T.w.premultiply(T.turn);
        }
      }
      d.parent.getWorldQuaternion(T.pq); T.pq.premultiply(rootInv);
      d.quaternion.copy(T.pq.invert().multiply(T.w));
      d.updateMatrixWorld(true);
      d.quaternion.toArray(out, k * 4);
    });
    return out;
  };
  const carried = { name, mirrored, fps: src.fps, duration: src.duration, frames: src.frames.map(one), hips: src.hips };
  for (const n of CAR_MOVE_BONES) { const b = bones.get(n); if (b && was.get(n)) b.quaternion.copy(was.get(n)); }
  root.updateMatrixWorld(true);
  rig.carMoves[key] = carried;
  return carried;
}

// The figure's body bones set to a move at `t` seconds (between its frames, turned part of the way), held at its last
// frame after its end unless `loop`. Gives where the hips are then, in the move's own frame (metres: x the figure's
// left, y up, z ahead as it starts), into `out`.
let qa = null, qb = null;
export function poseCarMove(rig, move, t, { loop = false, out = [0, 0, 0] } = {}) {
  if (!rig || !rig.bones || !move) return null;
  if (!qa) { qa = new THREE.Quaternion(); qb = new THREE.Quaternion(); }
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
  out[0] = h[i * 3] + (h[j * 3] - h[i * 3]) * e; out[1] = h[i * 3 + 1] + (h[j * 3 + 1] - h[i * 3 + 1]) * e; out[2] = h[i * 3 + 2] + (h[j * 3 + 2] - h[i * 3 + 2]) * e;
  return out;
}
