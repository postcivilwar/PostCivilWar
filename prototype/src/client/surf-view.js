// Surfing on the waves along the town's bank, drawn (31 October 2026, stage 4 of the owner's brief of 30 October:
// "incorporate a realistic surf feature for certain characters in bikinis"; surf.js says where the waves are, surfing.js
// what the surfer may do):
//   the waves   the water where they come in, east of the jetty, raised into each wave as the town has it at this moment
//               (every player sees the same): a long gentle back, a steeper face, white along its lip as it stands up to
//               break, and foam running in to the bank after; the flat water between left to the river itself
//   the board   the owner's surfboard (sports-model.js), afloat on the water as it is there, rising and falling with each
//               wave, pitched along its slope, rolled as the surfer leans
//   the surfer  lying on it, chest on the deck, head up, the arms paddling in turn (in, pull back along the board, out
//               and forward again), the legs together behind; up on a wave, standing across it side on, the left foot
//               forward, knees well bent, the body low, the arms out for balance, leaning into a turn along the wave
//
//   const surf = createSurfView(scene, { lite });
//   surf.update(dt, { t, from, own, peers, colour });   each frame (t: the waves' clock, view.waves carried on)
//   surf.seat(me, key)                                  after the surfer's figure is posed for the frame
import { loadSport } from './sports-model.js';
import { reach } from './animated.js';
import { bonesOf } from './own-bike-view.js';
import { SPORTS_PARTS } from './sports-parts.js';
import { WATER } from '../sim/zone.js';
import { SURF, wavesAt, waveAt, surfHeight } from '../sim/surf.js';

// The water drawn raised: its reach (grid metres), how fine (a computer's, a phone's), and from how far it is drawn.
export const SURF_DRAWN = Object.freeze({ x0: SURF.x0 - 4, x1: SURF.x1 + 4, z0: 141, z1: SURF.from + 2, step: Object.freeze({ full: Object.freeze([1.25, 0.7]), lite: Object.freeze([2.2, 1.2]) }), sight: 260 });
// How a surfer is on the board (metres, in the board's own frame: +z to its nose, +x to its left):
//   lie     the figure's feet this far behind the board's middle and up off its deck (the chest on it); a stroke of each arm
//           takes `stroke` seconds, the two arms half a stroke apart; the hand in the water this far out and ahead, pulled
//           back to here
//   stand   the feet on the board's middle line (the left forward), how far the knees bend and the body comes forward
export const SURFER = Object.freeze({
  lie: Object.freeze({ feet: -1.12, up: 0.11, stroke: 1.1, reachOut: 0.36, ahead: 0.62, back: -0.3, dip: 0.22, lift: 0.16, head: 0.55 }),
  stand: Object.freeze({ feet: Object.freeze([0.26, -0.44]), yaw: -Math.PI / 2, footYaw: Object.freeze([0.35, -0.15]), crouch: 0.24, bend: 0.32, arms: 1.15 }),
  float: Object.freeze({ lie: 0.19, ride: 0.16 }),   // how far below the water the board's lowest point is, lying and riding
});
const SIGHT = 120, PEER_MOST = 4;
const tmp = { up: new THREE.Vector3(0, 1, 0), q: new THREE.Quaternion(), d: new THREE.Vector3() };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// ---- the waves ----
// (worked out a column at a time along the bank: each wave's crest, height and state there once, then each point down
// the column from those, its facing from its neighbours; nothing made anew each frame)
const shoreZ = (x) => 150 + 5 * Math.sin(x / 37) + 3 * Math.sin(x / 11 + 1);       // as zoneShoreZ (atani.js)
function createWaves(scene, lite) {
  const D = SURF_DRAWN, [sx, sz] = lite ? D.step.lite : D.step.full;
  const nx = Math.ceil((D.x1 - D.x0) / sx) + 1, nz = Math.ceil((D.z1 - D.z0) / sz) + 1;
  const pos = new Float32Array(nx * nz * 3), col = new Float32Array(nx * nz * 4), nor = new Float32Array(nx * nz * 3);
  const height = new Float32Array(nx * nz);
  const index = [];
  for (let i = 0; i < nx - 1; i += 1) for (let j = 0; j < nz - 1; j += 1) { const a = i * nz + j, b = a + 1, c = a + nz, d = c + 1; index.push(a, b, c, b, d, c); }
  for (let i = 0; i < nx; i += 1) for (let j = 0; j < nz; j += 1) { const k = i * nz + j; pos[k * 3] = D.x0 + i * sx; pos[k * 3 + 1] = WATER; pos[k * 3 + 2] = D.z0 + j * sz; nor[k * 3 + 1] = 1; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('color', new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage));
  g.setIndex(index);
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, roughness: 0.24, metalness: 0.3, depthWrite: false });
  const mesh = new THREE.Mesh(g, material);
  mesh.name = 'surf-waves'; mesh.frustumCulled = false; mesh.renderOrder = 1; mesh.visible = false;
  scene.add(mesh);
  const water = new THREE.Color(0x7d8a62), FOAM = [0.9, 0.93, 0.92];
  const stats = { frames: 0, highest: 0, foam: 0, vertices: nx * nz };
  const back = SURF.wide, front = SURF.wide / 3;
  const cols = [];
  return {
    mesh, stats,
    // the waves at time t (seconds, the town's clock), coloured as the river is now
    update(t, colour) {
      if (colour) water.copy(colour);
      const waves = wavesAt(t);
      let highest = 0, foamy = 0;
      for (let i = 0; i < nx; i += 1) {
        const x = D.x0 + i * sx, shore = shoreZ(x);
        // (the stretch's ends fade out, as surf.js has them; nothing outside it)
        const ends = x <= SURF.x0 || x >= SURF.x1 ? 0 : Math.max(0, Math.min(1, (x - SURF.x0) / 18, (SURF.x1 - x) / 18));
        cols.length = 0;
        for (const w of waves) { const a = waveAt(w, x); cols.push(shore + a.toBank, a.height, a.state === 'face' ? 1 : a.state === 'foam' ? 2 : 0); }
        for (let j = 0; j < nz; j += 1) {
          const k = i * nz + j, z = D.z0 + j * sz;
          let h = 0, white = 0;
          if (ends > 0 && z > shore - SURF.run && z < SURF.from + 1) {
            for (let w = 0; w < cols.length; w += 3) {
              const d = z - cols[w], hw = cols[w + 1], state = cols[w + 2];
              if (d <= back && d >= -front) { const c = d >= 0 ? Math.cos((d / back) * Math.PI / 2) : Math.cos((-d / front) * Math.PI / 2); h += hw * c * c; }
              // white: along the lip of a wave standing up to break, and over the foam of one broken, fading behind it
              if (state === 1 && d > -0.8 && d < 0.6) white = Math.max(white, 0.55 * (1 - Math.abs(d + 0.1) / 0.7));
              else if (state === 2 && d > -front && d < 2.5) white = Math.max(white, 0.85 * clamp(1 - Math.max(0, d) / 2.5, 0, 1) * clamp(hw / 0.25, 0, 1));
            }
            h *= ends; white = clamp(white, 0, 1) * ends;
          }
          height[k] = h;
          pos[k * 3 + 1] = WATER + h + 0.012;
          col[k * 4] = water.r + (FOAM[0] - water.r) * white; col[k * 4 + 1] = water.g + (FOAM[1] - water.g) * white; col[k * 4 + 2] = water.b + (FOAM[2] - water.b) * white;
          // (flat water: the river itself shows; the raised water and the foam over it)
          col[k * 4 + 3] = clamp(Math.max(h * 6, white * 1.2), 0, 0.96);
          if (h > highest) highest = h;
          if (white > 0.3) foamy += 1;
        }
      }
      // each point's facing, from its neighbours' heights
      for (let i = 0; i < nx; i += 1) for (let j = 0; j < nz; j += 1) {
        const k = i * nz + j;
        const dx = (height[(i < nx - 1 ? i + 1 : i) * nz + j] - height[(i > 0 ? i - 1 : i) * nz + j]) / ((i > 0 && i < nx - 1 ? 2 : 1) * sx);
        const dz = (height[i * nz + (j < nz - 1 ? j + 1 : j)] - height[i * nz + (j > 0 ? j - 1 : j)]) / ((j > 0 && j < nz - 1 ? 2 : 1) * sz);
        const l = Math.hypot(dx, 1, dz);
        nor[k * 3] = -dx / l; nor[k * 3 + 1] = 1 / l; nor[k * 3 + 2] = -dz / l;
      }
      g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true; g.attributes.normal.needsUpdate = true;
      mesh.visible = true;
      stats.frames += 1; stats.highest = highest; stats.foam = foamy;
    },
    hide() { mesh.visible = false; },
    dispose() { scene.remove(mesh); g.dispose(); material.dispose(); },
  };
}

export function createSurfView(scene, { lite = false, base = 'sports/', onError = () => {}, priority } = {}) {
  const waves = createWaves(scene, lite);
  const shown = new Map();         // key -> { model, loading, failed, base, lean, phase, mode, swap }
  const frozen = new Set();
  const tier = lite ? '1k' : '2k';
  const spec = SPORTS_PARTS.surfboard;
  let waveT = 0;

  function entry(key) {
    let e = shown.get(key);
    if (!e) {
      e = { model: null, loading: true, failed: false, base: new THREE.Group(), lean: new THREE.Group(), phase: 0, mode: 'lie', up: 0 };
      e.base.add(e.lean);
      shown.set(key, e);
      loadSport('surfboard', { base, tier: key === 'own' ? tier : '512', priority, afloat: true }).then((m) => {
        if (shown.get(key) !== e) { m.dispose(); return; }
        e.model = m; e.loading = false; scene.add(m.group);
      }, (error) => { e.loading = false; e.failed = true; onError(error); });
    }
    return e;
  }
  const drop = (e) => { if (e.model) e.model.dispose(); };
  const water = (x, z) => WATER + surfHeight(x, z, waveT);

  // The board where it is (s: { x, z, h, mode, lean, speed, phase }): afloat on the water there, pitched along the slope
  // of the wave under it, rolled with the surfer's lean.
  function place(e, s, dt, own) {
    e.mode = s.mode;
    // (the stroke goes on here between words for another surfer; one's own is as its paddling says)
    if (own) e.phase = s.phase || 0; else if (s.mode === 'lie' && (s.speed || 0) > 0.1) e.phase = (e.phase + dt / SURFER.lie.stroke) % 2;
    e.up += ((s.mode === 'ride' ? 1 : 0) - e.up) * Math.min(1, dt * 4);
    const fx = Math.sin(s.h), fz = Math.cos(s.h);
    const y = water(s.x, s.z);
    const slope = Math.atan2(water(s.x + fx * 0.8, s.z + fz * 0.8) - water(s.x - fx * 0.8, s.z - fz * 0.8), 1.6);
    const sink = SURFER.float.lie + (SURFER.float.ride - SURFER.float.lie) * e.up;
    e.base.position.set(s.x, y - sink, s.z);
    e.base.rotation.set(-slope, s.h, 0, 'YXZ');
    e.lean.rotation.set(0, 0, (s.lean || 0) * (0.25 + 0.75 * e.up));
    e.base.updateMatrixWorld(true);
    if (!e.model) return;
    const g = e.model.group;
    g.position.copy(e.base.position); g.quaternion.copy(e.lean.getWorldQuaternion(tmp.q)); g.visible = true;
    g.updateMatrixWorld(true);
  }

  // own: { x, z, h, mode, lean, speed, phase } or null (this player's); peers: [{ key, ...the same }] (others', near)
  function update(dt, { t = 0, from = { x: 0, z: 0 }, own = null, peers = [], colour = null }) {
    for (const f of frozen) f.freeze = false;
    frozen.clear();
    waveT = t;
    // the waves, while the player is near enough to see them
    const D = SURF_DRAWN;
    const away = Math.max(0, D.x0 - from.x, from.x - D.x1) + Math.max(0, D.z0 - from.z, from.z - D.z1);
    if (away < D.sight) waves.update(t, colour); else waves.hide();
    const wanted = new Set();
    if (own) { wanted.add('own'); place(entry('own'), own, dt, true); }
    const dist = (q) => Math.hypot(q.x - from.x, q.z - from.z);
    for (const p of peers.filter((q) => dist(q) < SIGHT).sort((a, b) => dist(a) - dist(b)).slice(0, PEER_MOST)) { const key = `peer:${p.key}`; wanted.add(key); place(entry(key), p, dt, false); }
    for (const [key, e] of shown) if (!wanted.has(key)) { drop(e); shown.delete(key); }
  }

  // ---- the surfer on it ----
  const dirOf = (me, x, y, z) => tmp.d.set(x, y, z).applyQuaternion(me.group.getWorldQuaternion(tmp.q)).normalize().clone();
  function turnBone(bone, axisWorld, angle) {
    if (!bone || !angle) return;
    const parentQ = bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
    bone.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(axisWorld.clone().applyQuaternion(parentQ).normalize(), angle));
    bone.updateMatrixWorld(true);
  }
  function flatFoot(foot, rest, frameQ, yaw) {
    if (!foot || !rest) return;
    const want = frameQ.clone().multiply(new THREE.Quaternion().setFromAxisAngle(tmp.up, yaw)).multiply(rest);
    foot.quaternion.copy(foot.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(want));
    foot.updateMatrixWorld(true);
  }
  const local = (e, x, y, z) => e.lean.localToWorld(new THREE.Vector3(x, y, z));
  const deckAt = (z) => spec.deck + Math.max(0, z - 0.35) * 0.09;     // (the nose turned up a little)

  // Lying on it, paddling: the figure turned face down along the board, its chest on the deck, the head up to look ahead,
  // each arm in turn reaching forward into the water beside the board and pulling back along it, then out and forward.
  function lie(me, e, bones) {
    const L = SURFER.lie;
    me.group.quaternion.copy(e.lean.getWorldQuaternion(tmp.q)).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2));
    me.group.position.copy(local(e, 0, spec.deck + L.up, L.feet));
    me.group.updateMatrixWorld(true);
    if (!me.animated) { me.freeze = true; frozen.add(me); }
    // (the head up, looking ahead over the nose)
    const across = dirOf(me, 1, 0, 0);
    const neck = bones.get('neck_01'), head = bones.get('head'), spine = bones.get('spine_03') || bones.get('spine_02');
    turnBone(spine, across, -0.18);
    turnBone(neck, across, -L.head);
    turnBone(head, across, -0.2);
    // the arms: a stroke each, half a stroke apart; in the water from `ahead` back to `back`, then lifted out and forward
    for (const [s, side, offset] of [['l', 1, 0], ['r', -1, 1]]) {
      const u = bones.get(`upperarm_${s}`), l = bones.get(`lowerarm_${s}`), h = bones.get(`hand_${s}`);
      if (!u || !l || !h) continue;
      const k = ((e.phase + offset) % 2) / 2;      // 0..1 round the stroke
      const pull = k < 0.6, a = pull ? k / 0.6 : (k - 0.6) / 0.4;
      const along = pull ? L.ahead + (L.back - L.ahead) * a : L.back + (L.ahead - L.back) * a;
      const y = pull ? -L.dip * Math.sin(Math.PI * Math.min(1, a * 1.2)) : L.lift * Math.sin(Math.PI * a);
      const target = local(e, side * L.reachOut, spec.deck + y, along);
      reach(u, l, h, target, dirOf(me, side * 0.9, 0, -0.4));
    }
    // (the legs together, the feet a little up off the water)
    for (const s of ['l', 'r']) { const calf = bones.get(`calf_${s}`); turnBone(calf, across, 0.35); }
  }

  // Up on a wave: standing across the board side on (the left foot forward), knees well bent, the body low and forward,
  // the arms out for balance (the front one toward the nose), leaning into the turn.
  function standUp(me, e, s, bones) {
    const S = SURFER.stand;
    const pelvis = bones.get('pelvis');
    if (!pelvis) return;
    me.group.quaternion.copy(e.lean.getWorldQuaternion(tmp.q)).multiply(new THREE.Quaternion().setFromAxisAngle(tmp.up, S.yaw));
    me.group.position.copy(local(e, 0, 0, 0));
    me.group.updateMatrixWorld(true);
    if (!me.animated) { me.freeze = true; frozen.add(me); }
    const figQ = me.group.quaternion.clone();
    const hips = me.group.worldToLocal(pelvis.getWorldPosition(new THREE.Vector3()));
    const rest = {};
    let ankle = 0.08 * (me.scale || 1);
    for (const k of ['l', 'r']) { const f = bones.get(`foot_${k}`); if (!f) continue; rest[k] = figQ.clone().invert().multiply(f.getWorldQuaternion(new THREE.Quaternion())); ankle = Math.max(0.03, Math.min(0.14, me.group.worldToLocal(f.getWorldPosition(new THREE.Vector3())).y)); }
    // the hips over the middle of the stance, low
    const mid = (S.feet[0] + S.feet[1]) / 2;
    const want = local(e, 0, deckAt(mid) + hips.y - S.crouch, mid);
    me.group.position.add(want.sub(me.group.localToWorld(hips.clone())));
    me.group.updateMatrixWorld(true);
    const across = dirOf(me, 1, 0, 0), ahead = dirOf(me, 0, 0, 1), upward = dirOf(me, 0, 1, 0);
    const spine = bones.get('spine_01') || bones.get('spine_02');
    turnBone(spine, across, S.bend);
    turnBone(spine, ahead, -(s.lean || 0) * 0.6);
    // the legs: each ankle on the deck where its foot stands, the knees forward and out
    const frameQ = e.lean.getWorldQuaternion(new THREE.Quaternion()).multiply(new THREE.Quaternion().setFromAxisAngle(tmp.up, S.yaw));
    for (const [k, side, i] of [['l', 1, 0], ['r', -1, 1]]) {
      const t = bones.get(`thigh_${k}`), c = bones.get(`calf_${k}`), f = bones.get(`foot_${k}`);
      if (!t || !c || !f) continue;
      const z = S.feet[i];
      reach(t, c, f, local(e, 0, deckAt(z) + ankle, z), dirOf(me, side * 0.45, 0.1, 1));
      flatFoot(f, rest[k], frameQ, S.footYaw[i]);
    }
    // the arms out: up from the sides, the front one (the left, toward the nose) a little forward, the back one back
    for (const [k, side] of [['l', 1], ['r', -1]]) {
      const u = bones.get(`upperarm_${k}`), l = bones.get(`lowerarm_${k}`);
      if (!u) continue;
      turnBone(u, ahead, side * S.arms);
      turnBone(u, upward, -side * 0.3);
      if (l) turnBone(l, across, -0.2);
    }
    // the head turned to look along the wave, the way the board goes
    const neck = bones.get('neck_01');
    if (neck) turnBone(neck, upward, Math.PI / 2 - 0.3);
  }

  // The surfer on their board. Called after the figure is posed for the frame (standing). Gives false while the board
  // is still being fetched.
  function seat(me, key = 'own') {
    const e = shown.get(key);
    if (!e || !e.model || !me || !me.bones) return false;
    const bones = bonesOf(me);
    if (e.mode === 'ride') standUp(me, e, { lean: e.lean.rotation.z }, bones); else lie(me, e, bones);
    return true;
  }

  return {
    update, seat, waves: waves.stats,
    ready: (key = 'own') => { const e = shown.get(key); return !!(e && e.model); },
    model: (key = 'own') => { const e = shown.get(key); return e ? e.model : null; },
    keys: () => [...shown.keys()],
    waterAt: water,
    dispose() { for (const e of shown.values()) drop(e); shown.clear(); waves.dispose(); },
  };
}
