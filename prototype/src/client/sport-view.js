// The things from the sports mall in the town, ridden (31 October 2026, the owner's brief: "Ensure each NPC realistically
// pedals, balances, and maneuvers their equipment, with smooth wheel rotation and realistic motions ... the player must
// pedal and control the bike"): the one the player rides, under them (or on their feet), the others they left standing,
// and other players' as they ride them; and the rider on it, as such a thing is ridden:
//   bicycle     sitting on its saddle, hands on its grips, feet on its pedals going round with its cranks (standing still,
//               the left foot down on the road and the bike leaning a little onto it)
//   skateboard  standing across it, the left foot over the front truck and the right over the back one, knees bent,
//               the head turned to look down the road; pushing, the body turns to face forward and the right foot goes
//               down to the road beside the board and sweeps back, again and again, and back onto the board
//   skates      one on each foot; skating, a stride out to the side and back with one leg while the other glides
//               under the body, then the other, the arms swinging with them; gliding, the feet together under the body
//   e-scooter   standing on its deck, one foot before the other, hands on its grips
//   hoverboard  a foot on each of its pads, the knees soft, leaning forward to go
//   e-unicycle  a foot on each of its pedals, the legs against its shell, leaning forward to go, the arms out a little
//               for balance (more when slow)
// Each is the owner's model (sports-model.js): its wheels turn as it rolls, its bars and front wheel turn as it is
// steered, a bicycle's cranks go round as it is pedalled, a skateboard's trucks turn under it as it is leaned, and it
// leans into a turn with its rider (and the rider with it).
//
//   const sports = createSportView(scene, { lite });
//   sports.update(dt, { ridden, rides, parked, groundY, from });   each frame
//   sports.seat(me, ridden, groundY)                               after the rider's figure is posed for the frame
import { loadSport } from './sports-model.js';
import { reach } from './animated.js';
import { bonesOf } from './own-bike-view.js';
import { SPORTS_PARTS } from './sports-parts.js';
import { SPORT_HANDLING } from '../sim/sport-ride.js';

const SIGHT = 60;                     // metres within which a thing of the player's left standing is drawn
const PEER_SIGHT = 120, PEER_MOST = 4;  // another player's, ridden: drawn within this, the nearest few
const STOPPED = 0.3;                  // m/s: slower than this a cyclist puts a foot down
// How each stands when left (radians over to its left, as a bicycle on its stand; one lying on its side), and when it
// came down in a crash (on its side)
const PARKED_TILT = Object.freeze({ bicycle: -0.09, 'e-scooter': -0.08, skateboard: 0, 'inline-skates': 0, hoverboard: 0, 'e-unicycle': -1.42 });
const FALLEN_TILT = Object.freeze({ bicycle: -1.33, 'e-scooter': -1.38, skateboard: 0, 'inline-skates': 0, hoverboard: 0, 'e-unicycle': -1.42 });
// how a rider stands on each (metres and radians, in the thing's own frame: +z ahead, +x to its left):
//   feet [left, right] where each foot stands ([x, z]); yaw the rider's turn from the way it goes (the skateboard: side
//   on, the left side ahead); footYaw each foot's own turn; hips where the hips are over ([x, z]); crouch how far the hips
//   come down from standing, the knees bending; bend the body forward from the waist
export const STANCE = Object.freeze({
  skateboard: Object.freeze({ feet: [[0.0, 0.25], [0.0, -0.31]], yaw: -Math.PI / 2, footYaw: [0.25, -0.05], hips: [0.02, -0.03], crouch: 0.07, bend: 0.12 }),
  'inline-skates': Object.freeze({ feet: [[0.1, 0.04], [-0.1, -0.04]], yaw: 0, footYaw: [0.08, -0.08], hips: [0, -0.04], crouch: 0.11, bend: 0.3 }),
  'e-scooter': Object.freeze({ feet: [[0.03, 0.1], [-0.04, -0.2]], yaw: 0, footYaw: [0.05, -0.35], hips: [0, -0.1], crouch: 0.03, bend: 0.05 }),
  hoverboard: Object.freeze({ feet: [[0.139, 0], [-0.139, 0]], yaw: 0, footYaw: [0.12, -0.12], hips: [0, -0.02], crouch: 0.045, bend: 0.06 }),
  'e-unicycle': Object.freeze({ feet: [[0.152, 0.0], [-0.152, 0.0]], yaw: 0, footYaw: [0.05, -0.05], hips: [0, -0.03], crouch: 0.03, bend: 0.06 }),
});
// a skater's stride and a skateboarder's push, in their own time (`phase`, sport-ride.js): how far out and back the foot
// goes, and how high it is lifted coming back
export const STRIDE = Object.freeze({ out: 0.32, back: 0.3, lift: 0.07, turn: 0.42, sway: 0.06, arms: 0.45 });
export const PUSH = Object.freeze({ side: -0.26, ahead: 0.16, behind: -0.5, lift: 0.11, turn: 1.3, down: 0.08 });
// a cyclist: forward from the waist, into a turn with the body; where the ankle is from the pedal it stands on
export const PEDAL = Object.freeze({ forward: 0.32, ankleUp: 0.075, ankleBack: 0.06, footDown: 0.11 });

const tmp = { a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3(), d: new THREE.Vector3(), q: new THREE.Quaternion(), q2: new THREE.Quaternion(), q3: new THREE.Quaternion(), up: new THREE.Vector3(0, 1, 0) };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (t) => { const u = clamp(t, 0, 1); return u * u * (3 - 2 * u); };

// (`priority`: how the files of one not yet here are asked for; another player's after what is nearer to hand)
// (`most`, `sight`: how many ridden by others are drawn, and within how far: the nearest)
export function createSportView(scene, { lite = false, base = 'sports/', onError = () => {}, priority, most = PEER_MOST, sight = PEER_SIGHT } = {}) {
  const shown = new Map();          // key -> an entry: { id, tier, models, loading, failed, travelled, ... }
  const frozen = new Set();         // figures whose bones seat() set by hand this frame
  const TIERS = { ride: lite ? '1k' : '2k', peer: lite ? '512' : '1k', park: lite ? '512' : '1k' };

  function entry(key, id, tier) {
    let e = shown.get(key);
    if (e && (e.id !== id || e.tier !== tier)) { drop(e); shown.delete(key); e = null; }
    if (!e) {
      // (the skates are a pair: the left one the right one's mirror image)
      e = { id, tier, models: null, loading: true, failed: false, travelled: 0, wheel: { left: 0, right: 0 }, phase: 0, push: 0, down: 0, lastH: null, spin: 0, pitch: 0, base: new THREE.Group(), lean: new THREE.Group() };
      e.base.add(e.lean);
      shown.set(key, e);
      const wanted = id === 'inline-skates' ? [loadSport(id, { base, tier, priority }), loadSport(id, { base, tier, priority, mirror: true })] : [loadSport(id, { base, tier, priority })];
      Promise.allSettled(wanted).then((done) => {
        const models = done.filter((d) => d.status === 'fulfilled').map((d) => d.value);
        if (shown.get(key) !== e || models.length !== done.length) { for (const m of models) m.dispose(); if (shown.get(key) === e) { e.loading = false; e.failed = true; onError(done.find((d) => d.status === 'rejected').reason); } return; }
        e.models = models; e.loading = false;
        for (const m of models) scene.add(m.group);
      });
    }
    return e;
  }
  const drop = (e) => { if (e.models) for (const m of e.models) m.dispose(); e.models = null; };

  // The thing's own frame, where it is: on the ground at (x, z), turned to h, pitched forward by `pitch` (the electric
  // unicycle and the hoverboard, leaning to go), and leaned over by `lean` about the line it stands on.
  function frameAt(e, x, y, z, h, lean, pitch = 0) {
    e.base.position.set(x, y, z);
    e.base.rotation.set(pitch, h, 0, 'YXZ');
    e.lean.rotation.set(0, 0, lean);
    e.base.updateMatrixWorld(true);
  }
  const local = (e, x, y, z) => e.lean.localToWorld(new THREE.Vector3(x, y, z));
  // the model drawn in the frame
  function put(m, e) { m.group.position.copy(e.base.position); m.group.rotation.copy(e.base.rotation); m.group.visible = true; }

  // How far along it is in what the rider does over and over: the pedals, the push, the stride. The player's own is as
  // their riding says (sport-ride.js); another player's goes on here at the pace their speed asks, between the words that
  // come from their game, and is brought to what the last word said.
  function advance(e, ride, dt, own) {
    const h = SPORT_HANDLING[e.id];
    const speed = Math.abs(ride.speed || 0);
    e.travelled += (ride.speed || 0) * dt;
    // (turning on the spot, the hoverboard's wheels go opposite ways; and every wheel rolls as it goes)
    if (e.lastH !== null) { let dh = ride.h - e.lastH; while (dh > Math.PI) dh -= Math.PI * 2; while (dh < -Math.PI) dh += Math.PI * 2; e.spin = dt > 0 ? dh / dt : 0; }
    e.lastH = ride.h;
    e.wheel.left += ((ride.speed || 0) - e.spin * 0.25) * dt;
    e.wheel.right += ((ride.speed || 0) + e.spin * 0.25) * dt;
    if (own || !h) { e.phase = ride.phase || 0; }
    else {
      if (h.drive === 'pedals') { if ((ride.throttle || 0) > 0 && !ride.brake) e.phase = (e.phase + (speed / h.gear) * Math.PI * 2 * dt) % (Math.PI * 2); }
      else if (h.drive === 'push' || h.drive === 'stride') {
        const going = (ride.throttle || 0) > 0 && !ride.brake && speed < h.top * 0.98;
        if (going || e.phase % 1 > 1e-6) { let next = e.phase + dt / (h.stride * (1 - 0.35 * Math.min(1, speed / h.top))); if (!going && Math.floor(next) !== Math.floor(e.phase)) next = Math.floor(next); e.phase = next % 2; }
      }
      // (and drawn to where their own game last said, a little at a time: put there if far out)
      if (Number.isFinite(ride.phase)) {
        const span = h.drive === 'pedals' ? Math.PI * 2 : 2;
        const d = ((((ride.phase - e.phase) % span) + span * 1.5) % span) - span / 2;
        if (Math.abs(d) > span * 0.3) e.phase = ride.phase; else e.phase = (e.phase + d * Math.min(1, dt * 3) + span) % span;
      }
    }
    const pushing = !!h && (h.drive === 'push' || h.drive === 'stride') && e.phase % 1 > 0.001;
    e.push += ((pushing ? 1 : 0) - e.push) * Math.min(1, dt * (pushing ? 7 : 3.5));
    // (a cyclist stopped puts a foot down, and the bike leans onto it)
    e.down += ((e.id === 'bicycle' && speed < STOPPED && !((ride.throttle || 0) > 0) ? 1 : 0) - e.down) * Math.min(1, dt * 5);
    // (leaning forward to go: the unicycle and the hoverboard, by how hard they are driven; back, braking)
    const want = e.id === 'e-unicycle' ? 0.03 + 0.09 * Math.min(1, speed / 8) * (ride.brake ? -1 : 1) : e.id === 'hoverboard' ? (ride.brake ? -0.03 : 0.05 * (ride.throttle || 0)) : 0;
    e.pitch += (want - e.pitch) * Math.min(1, dt * 4);
  }

  // How far over it leans as drawn: as ridden, and onto the foot put down (the bicycle).
  const leanOf = (e, ride) => (ride.lean || 0) * (1 - e.down) - 0.1 * e.down;

  function place(e, ride, groundY) {
    const lean = leanOf(e, ride);
    frameAt(e, ride.x, groundY(ride.x, ride.z), ride.z, ride.h, lean, e.pitch);
    if (!e.models) return;
    const steer = ride.steer || 0;
    for (const m of e.models) {
      if (e.id === 'inline-skates') { m.pose({ travelled: e.travelled }); continue; }    // (on the feet: seat() puts them)
      put(m, e);
      m.pose({ travelled: e.travelled, steer, crank: e.phase, tilt: lean, truck: -(ride.lean || 0) * 1.4, wheels: { left: e.wheel.left, right: e.wheel.right } });
      m.group.updateMatrixWorld(true);
    }
    // (no rider drawn on them yet: the skates stand together where the rider is)
    if (e.id === 'inline-skates') standPair(e, e.base.position.x, e.base.position.y, e.base.position.z, ride.h);
  }
  function standPair(e, x, y, z, h) {
    if (!e.models) return;
    // (the owner's right skate on the right, its mirror on the left; their wheels as far round as they have rolled)
    e.models.forEach((m, k) => { const side = k === 0 ? -0.09 : 0.09; m.group.position.set(x + Math.cos(h) * side, y, z - Math.sin(h) * side); m.group.rotation.set(0, h, 0); m.group.visible = true; m.pose({ travelled: e.travelled, tilt: 0 }); });
  }

  // One left standing, or lying where it came down: as the town says, at its place (a bicycle on its stand, a little
  // over to its left; one that came down, on its side).
  function placeParked(e, p, groundY, now) {
    if (!e.models) return;
    if (p.fallen && !e.fallenAt) e.fallenAt = e.seenAt === undefined ? -10 : now;
    if (!p.fallen) e.fallenAt = 0;
    e.seenAt = now;
    const t = !p.fallen ? 10 : Number.isFinite(p.ago) ? p.ago : e.fallenAt > 0 ? Math.max(0, now - e.fallenAt) : 10;
    const k = smooth(t / 0.55);
    const tilt = p.fallen ? PARKED_TILT[e.id] + (FALLEN_TILT[e.id] - PARKED_TILT[e.id]) * k : PARKED_TILT[e.id];
    const y = groundY(p.x, p.z);
    if (e.id === 'inline-skates') { standPair(e, p.x, y, p.z, p.h); return; }
    frameAt(e, p.x, y, p.z, p.h, tilt);
    for (const m of e.models) { put(m, e); m.pose({ travelled: e.travelled, steer: e.id === 'bicycle' || e.id === 'e-scooter' ? 0.3 : 0, tilt }); }
  }

  // ridden: { id, x, z, h, lean, speed, steer, phase, throttle, brake } or null (this player's);
  // rides: [{ key, ...the same }] (other players', near enough to see); parked: [{ item, x, z, h, fallen, ago }];
  // groundY(x, z); from: { x, z }; now (seconds)
  function update(dt, { ridden = null, rides = [], parked = [], parkedMost = 3, groundY = () => 0, from = { x: 0, z: 0 }, now = 0 }) {
    for (const f of frozen) f.freeze = false;
    frozen.clear();
    const wanted = new Set();
    const dist = (q) => Math.hypot(q.x - from.x, q.z - from.z);
    if (ridden && SPORTS_PARTS[ridden.id]) {
      wanted.add('ride');
      const e = entry('ride', ridden.id, TIERS.ride);
      advance(e, ridden, dt, true);
      place(e, ridden, groundY);
    }
    for (const r of rides.filter((q) => SPORT_HANDLING[q.id] && dist(q) <= sight).sort((a, b) => dist(a) - dist(b)).slice(0, most)) {
      const key = `peer:${r.key}`;
      wanted.add(key);
      const e = entry(key, r.id, TIERS.peer);
      advance(e, r, dt, false);
      place(e, r, groundY);
    }
    for (const p of parked.filter((q) => SPORT_HANDLING[q.item] && dist(q) <= SIGHT).sort((a, b) => dist(a) - dist(b)).slice(0, parkedMost)) {
      const key = p.key || `park:${p.item}`;
      wanted.add(key);
      placeParked(entry(key, p.item, TIERS.park), p, groundY, now);
    }
    for (const [key, e] of shown) if (!wanted.has(key)) { drop(e); shown.delete(key); }
  }

  // ---- the rider ----

  // The figure turned and put as the thing's frame says, `yaw` more about its own upright; its own bones as its pose
  // left them. Gives what is measured of it standing: its hips and its ankles in its own frame.
  function setFigure(me, e, yaw) {
    const g = me.group;
    e.lean.getWorldQuaternion(tmp.q);
    g.quaternion.copy(tmp.q).multiply(tmp.q2.setFromAxisAngle(tmp.up, yaw));
    g.position.copy(e.base.position);
    g.updateMatrixWorld(true);
    // (the game's own figure poses its bones each time it is placed: posed now, then held as this sets them, until the
    // next frame's update lets it go)
    if (!me.animated) { me.freeze = true; frozen.add(me); }
  }
  // a direction in the figure's frame (unit length), in the world; and a distance in it (metres), in the world
  const dirOf = (me, x, y, z) => tmp.d.set(x, y, z).applyQuaternion(me.group.getWorldQuaternion(tmp.q3)).normalize().clone();
  const offOf = (me, x, y, z) => tmp.d.set(x, y, z).applyQuaternion(me.group.getWorldQuaternion(tmp.q3)).clone();
  // a bone turned about an axis given in the world
  function turnBone(bone, axisWorld, angle) {
    if (!bone || !angle) return;
    const parentQ = bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
    bone.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(axisWorld.clone().applyQuaternion(parentQ).normalize(), angle));
    bone.updateMatrixWorld(true);
  }
  // A foot put flat (on a deck, a pedal, the road), turned `yaw` from the figure's own way: as it was standing (its turn
  // from the figure, `rest`), carried with the frame given.
  function flatFoot(foot, rest, frameQ, yaw) {
    if (!foot || !rest) return;
    const want = frameQ.clone().multiply(new THREE.Quaternion().setFromAxisAngle(tmp.up, yaw)).multiply(rest);
    foot.quaternion.copy(foot.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(want));
    foot.updateMatrixWorld(true);
  }
  // the figure's limbs by side
  function limbs(bones) {
    const leg = (s) => ({ thigh: bones.get(`thigh_${s}`), calf: bones.get(`calf_${s}`), foot: bones.get(`foot_${s}`) });
    const arm = (s) => ({ u: bones.get(`upperarm_${s}`), l: bones.get(`lowerarm_${s}`), h: bones.get(`hand_${s}`) });
    return { leg: { l: leg('l'), r: leg('r') }, arm: { l: arm('l'), r: arm('r') } };
  }

  // Standing on it (all but the bicycle).
  function stand(me, e, ride, bones) {
    const id = e.id, st = STANCE[id], spec = SPORTS_PARTS[id];
    const pelvis = bones.get('pelvis');
    if (!st || !pelvis) return false;
    const L = limbs(bones);
    const deck = id === 'skateboard' ? spec.deck : id === 'e-scooter' ? spec.deck : id === 'hoverboard' ? spec.deck : id === 'e-unicycle' ? spec.pedals[0][1] : id === 'inline-skates' ? spec.boot.sole : 0;
    const t = e.phase % 1, which = Math.floor(e.phase) % 2;           // (the skater's stride: the left leg, then the right)
    const push = e.push;
    // the rider's turn from the way it goes: the skateboarder side on, turning to face forward to push
    const yaw = st.yaw + (id === 'skateboard' ? (Math.PI / 2 - 0.3) * push : 0);
    setFigure(me, e, yaw);
    const figQ = me.group.quaternion.clone();
    // what is measured of the figure standing: its hips, its ankles' height, how its feet are turned from it
    const hips = me.group.worldToLocal(pelvis.getWorldPosition(new THREE.Vector3()));
    const rest = {};
    let ankle = 0.08 * (me.scale || 1);
    for (const s of ['l', 'r']) {
      const f = L.leg[s].foot;
      if (!f) continue;
      rest[s] = figQ.clone().invert().multiply(f.getWorldQuaternion(new THREE.Quaternion()));
      ankle = Math.max(0.03, Math.min(0.14, me.group.worldToLocal(f.getWorldPosition(new THREE.Vector3())).y));
    }
    // where each foot goes, in the thing's frame
    const feet = { l: { x: st.feet[0][0], z: st.feet[0][1], y: deck, yaw: st.footYaw[0] }, r: { x: st.feet[1][0], z: st.feet[1][1], y: deck, yaw: st.footYaw[1] } };
    let hipX = st.hips[0], hipZ = st.hips[1], crouch = st.crouch, sway = 0;
    if (id === 'skateboard') {
      // pushing: the front foot turned to point ahead, the back foot down on the road beside the board, sweeping back
      // while it is down, lifted and brought forward again, and at the end back on the board
      feet.l.yaw = st.footYaw[0] + (Math.PI / 2 - 0.3) * 0.85 * push;
      const down = t < 0.55, k = down ? t / 0.55 : (t - 0.55) / 0.45;
      const z = down ? PUSH.ahead + (PUSH.behind - PUSH.ahead) * smooth(k) : PUSH.behind + (PUSH.ahead - PUSH.behind) * smooth(k);
      const lift = down ? 0 : Math.sin(Math.PI * k) * PUSH.lift;
      const ground = { x: PUSH.side, z, y: lift };
      // (on its way between the board and the road, the foot is lifted over the board's edge)
      feet.r = { x: feet.r.x + (ground.x - feet.r.x) * push, z: feet.r.z + (ground.z - feet.r.z) * push, y: deck + (ground.y - deck) * push + Math.sin(Math.PI * clamp(push, 0, 1)) * 0.08, yaw: feet.r.yaw + (Math.PI / 2 - 0.3 - feet.r.yaw) * push };
      hipZ += 0.12 * push; hipX += -0.06 * push;
      crouch += PUSH.down * push * (down ? 0.6 + 0.4 * Math.sin(Math.PI * k) : 0.6);
    } else if (id === 'inline-skates') {
      // the stride: the pushing leg out to the side and back, the skate turned out; lifted coming back; the body over
      // the gliding foot
      const s = which === 0 ? 'l' : 'r', o = which === 0 ? 'r' : 'l', side = which === 0 ? 1 : -1;
      const down = t < 0.55, k = down ? t / 0.55 : (t - 0.55) / 0.45;
      const out = down ? smooth(k) : 1 - smooth(k);
      feet[s] = { x: feet[s].x + side * STRIDE.out * out * push, z: feet[s].z - STRIDE.back * out * push, y: deck + (down ? 0 : Math.sin(Math.PI * k) * STRIDE.lift * push), yaw: feet[s].yaw + side * STRIDE.turn * out * push };
      feet[o] = { ...feet[o], x: feet[o].x * (1 - 0.6 * push) };
      sway = -side * STRIDE.sway * push * Math.sin(Math.PI * Math.min(1, t / 0.8));
      hipX += sway;
      crouch += 0.04 * push;
    }
    // the hips: over where the rider stands, as far above the deck as standing has them, less the bend of the knees
    const want = local(e, hipX, deck + hips.y - crouch, hipZ);
    me.group.position.add(want.sub(me.group.localToWorld(hips.clone())));
    me.group.updateMatrixWorld(true);
    // the body forward from the waist (a skater low, more so striding)
    const spine = bones.get('spine_01') || bones.get('spine_02');
    const across = dirOf(me, 1, 0, 0), ahead = dirOf(me, 0, 0, 1), upward = dirOf(me, 0, 1, 0);
    turnBone(spine, across, st.bend + (id === 'inline-skates' ? 0.1 * push : id === 'skateboard' ? 0.18 * push : 0) + (id === 'e-unicycle' ? e.pitch * 0.5 : 0));
    if (sway) turnBone(spine, ahead, -sway * 2.2);
    // the legs: each ankle where its foot stands, the knee forward (and out a little); then the foot flat, turned
    const frameQ = e.lean.getWorldQuaternion(new THREE.Quaternion()).multiply(new THREE.Quaternion().setFromAxisAngle(tmp.up, st.yaw));
    for (const s of ['l', 'r']) {
      const leg = L.leg[s];
      if (!leg.thigh || !leg.calf || !leg.foot) continue;
      const f = feet[s], side = s === 'l' ? 1 : -1;
      const target = local(e, f.x, f.y + ankle, f.z);
      // (the ankle is a little behind the ball of the foot, where it is turned)
      const back = id === 'e-unicycle' ? 0 : 0.03;
      target.add(dirOf(me, 0, 0, -1).multiplyScalar(back));
      const pole = id === 'e-unicycle' ? dirOf(me, side * 0.05, 0.2, 1) : dirOf(me, side * 0.35, 0.15, 1);
      reach(leg.thigh, leg.calf, leg.foot, target, pole);
      flatFoot(leg.foot, rest[s], frameQ, f.yaw);
    }
    // the arms
    if (id === 'e-scooter' && e.models && e.models[0]) {
      // hands on the grips, carried round with the bars as they turn
      const m = e.models[0];
      for (const s of ['l', 'r']) {
        const a = L.arm[s];
        if (!a.u || !a.l || !a.h) continue;
        const side = s === 'l' ? 1 : -1;
        const g = gripWorld(m, spec.grip, side).add(offOf(me, 0, 0.012, -0.045));
        reach(a.u, a.l, a.h, g, dirOf(me, side * 0.8, -0.6, -0.3));
      }
    } else {
      // out a little for balance (the unicycle's rider more, and more when slow), or swinging with the strides
      const speed = Math.abs(ride.speed || 0);
      for (const s of ['l', 'r']) {
        const a = L.arm[s];
        if (!a.u) continue;
        const side = s === 'l' ? 1 : -1;
        const outward = id === 'e-unicycle' ? 0.55 - 0.35 * Math.min(1, speed / 6) : id === 'hoverboard' ? 0.22 : id === 'skateboard' ? 0.28 + 0.1 * (1 - push) : 0.16;
        turnBone(a.u, ahead, side * outward);
        if (id === 'inline-skates' && push > 0.01) {
          // (the arm on the side that pushes swings back as the leg goes out, the other forward)
          const swing = STRIDE.arms * push * Math.sin(Math.PI * Math.min(1, t / 0.55)) * (which === 0 ? 1 : -1) * side;
          turnBone(a.u, across, swing);
        }
        if (id === 'skateboard' && push > 0.01) turnBone(a.u, across, 0.35 * push * Math.sin(Math.PI * 2 * t) * side);
        if (a.l) turnBone(a.l, across, -0.25);
      }
    }
    // the head: looking where it goes (the skateboarder over the left shoulder)
    const neck = bones.get('neck_01'), head = bones.get('head');
    if (neck) {
      if (id === 'skateboard') turnBone(neck, upward, (Math.PI / 2 - 0.25) * (1 - push) * 0.75);
      turnBone(neck, across, -0.08 - (spine ? st.bend * 0.6 : 0));
      if (head) turnBone(head, ahead, -(ride.lean || 0) * 0.5);
    }
    // the skates: one under each foot, turned as it is (the owner's is a right skate; its mirror, the left)
    if (id === 'inline-skates' && e.models) {
      e.models.forEach((m, k) => {
        const s = k === 0 ? 'r' : 'l', f = feet[s];
        const at = local(e, f.x, f.y - deck, f.z);
        m.group.position.copy(at);
        m.group.quaternion.copy(e.lean.getWorldQuaternion(new THREE.Quaternion())).multiply(new THREE.Quaternion().setFromAxisAngle(tmp.up, f.yaw));
        // (the heel under the ankle: the skate a little ahead of where the ankle is put)
        m.group.position.add(new THREE.Vector3(0, 0, 0.035).applyQuaternion(m.group.quaternion));
        m.group.visible = true;
      });
    }
    return true;
  }

  // Where a grip is in the world: carried round with the bars as they turn.
  function gripWorld(m, grip, side) {
    const at = new THREE.Vector3(side * grip[0], grip[1], grip[2]);
    return m.steerer ? m.steerer.localToWorld(at) : m.frame.localToWorld(at);
  }
  // Where a pedal is in the world, as the cranks have turned (`left`: the left one).
  function pedalWorld(m, spec, left) {
    const c = spec.crank;
    // (the two pedals as far out either side: the file's are a little uneven)
    const out = (Math.abs(c.pedalX) + Math.abs(c.rightX)) / 2, x = left ? out : -out;
    const at = new THREE.Vector3(x, c.c[1] + (left ? c.r : -c.r), c.c[2]);
    return m.crankGroup ? m.crankGroup.localToWorld(at.sub(new THREE.Vector3(0, c.c[1], c.c[2]))) : m.frame.localToWorld(at);
  }

  // Sitting on the bicycle: the hips on its saddle, leaning forward from the waist until the grips are in reach, the
  // hands on them, the feet on the pedals (and the left one down on the road when it stands still).
  function cycle(me, e, ride, bones) {
    const m = e.models && e.models[0];
    const pelvis = bones.get('pelvis');
    if (!m || !pelvis) return false;
    const spec = SPORTS_PARTS.bicycle;
    setFigure(me, e, 0);
    const figQ = me.group.quaternion.clone();
    const L = limbs(bones);
    const rest = {};
    for (const s of ['l', 'r']) if (L.leg[s].foot) rest[s] = figQ.clone().invert().multiply(L.leg[s].foot.getWorldQuaternion(new THREE.Quaternion()));
    const hips = me.group.worldToLocal(pelvis.getWorldPosition(new THREE.Vector3()));
    const want = local(e, spec.seat[0], spec.seat[1] + 0.07, spec.seat[2] - 0.02);
    me.group.position.add(want.sub(me.group.localToWorld(hips.clone())));
    me.group.updateMatrixWorld(true);
    m.group.updateMatrixWorld(true);
    let ankle = 0.08 * (me.scale || 1);
    // stopped: forward off the saddle onto the top tube, as low as the left foot needs to reach the road (a rider's leg
    // is not as long as from the saddle to the road), at most a hand's breadth or so
    if (e.down > 0.01 && L.leg.l.thigh && L.leg.l.calf && L.leg.l.foot) {
      const leg = L.leg.l;
      const hip = leg.thigh.getWorldPosition(new THREE.Vector3()), knee = leg.calf.getWorldPosition(new THREE.Vector3()), foot = leg.foot.getWorldPosition(new THREE.Vector3());
      const length = hip.distanceTo(knee) + knee.distanceTo(foot);
      const ground = e.base.localToWorld(new THREE.Vector3(0.36, ankle, -0.02));
      const drop = Math.min(0.17, Math.max(0, hip.distanceTo(ground) - length * 0.97) * 1.15) * smooth(e.down);
      if (drop > 0) { me.group.position.add(offOf(me, 0, -drop, drop * 0.7)); me.group.updateMatrixWorld(true); }
    }
    const across = dirOf(me, 1, 0, 0), ahead = dirOf(me, 0, 0, 1), upward = dirOf(me, 0, 1, 0);
    const spine = bones.get('spine_02') || bones.get('spine_01');
    const grips = { l: () => gripWorld(m, spec.grip, 1).add(offOf(me, 0, 0.012, -0.05)), r: () => gripWorld(m, spec.grip, -1).add(offOf(me, 0, 0.012, -0.05)) };
    const armLength = (a) => (a.u && a.l && a.h ? a.u.getWorldPosition(new THREE.Vector3()).distanceTo(a.l.getWorldPosition(new THREE.Vector3())) + a.l.getWorldPosition(new THREE.Vector3()).distanceTo(a.h.getWorldPosition(new THREE.Vector3())) : 0);
    const reachL = armLength(L.arm.l), reachR = armLength(L.arm.r);
    if (spine && reachL && reachR) {
      // forward from the waist, more at speed; into a turn with the body
      const pace = Math.min(1, Math.abs(ride.speed || 0) / 8);
      turnBone(spine, across, PEDAL.forward * (0.7 + 0.3 * pace));
      if (Math.abs(ride.lean || 0) > 1e-3) turnBone(spine, ahead, 0.3 * (ride.lean || 0));
      // then on, a little at a time, while that brings the grips nearer (the bars are low on this one)
      const short = () => Math.max(L.arm.l.u.getWorldPosition(new THREE.Vector3()).distanceTo(grips.l()) - reachL * 0.97, L.arm.r.u.getWorldPosition(new THREE.Vector3()).distanceTo(grips.r()) - reachR * 0.97);
      let gap = short();
      for (let i = 0; i < 18 && gap > 0; i += 1) { turnBone(spine, across, 0.06); const now = short(); if (now >= gap - 1e-4) { turnBone(spine, across, -0.06); break; } gap = now; }
      // (still short of them, as someone with shorter arms on a long bike is: forward on the saddle, onto its nose, until
      // the hands are on the grips; 22 cm at most: the shortest-armed of the town's riders needs about that, 31 October)
      gap = short();
      if (gap > 0) { me.group.position.add(dirOf(me, 0, 0, 1).multiplyScalar(Math.min(0.22, gap * 1.15))); me.group.updateMatrixWorld(true); }
    }
    for (const s of ['l', 'r']) {
      const a = L.arm[s];
      if (!a.u || !a.l || !a.h) continue;
      const side = s === 'l' ? 1 : -1;
      reach(a.u, a.l, a.h, grips[s](), dirOf(me, side * 0.9, -0.5, -0.3));
    }
    // the head up to look down the road, and into the turn
    const neck = bones.get('neck_01'), head = bones.get('head');
    if (neck) { turnBone(neck, across, -PEDAL.forward * 0.8); turnBone(neck, upward, -0.4 * (ride.lean || 0)); }
    if (head) turnBone(head, ahead, -0.5 * (ride.lean || 0));
    // the feet: on the pedals, as the cranks have them; stopped, the left one down on the road beside the bike
    const frameQ = e.lean.getWorldQuaternion(new THREE.Quaternion());
    for (const s of ['l', 'r']) {
      const leg = L.leg[s];
      if (!leg.thigh || !leg.calf || !leg.foot) continue;
      const side = s === 'l' ? 1 : -1;
      let target = pedalWorld(m, spec, s === 'l').add(offOf(me, 0, PEDAL.ankleUp, -PEDAL.ankleBack));
      if (s === 'l' && e.down > 0.01) {
        const ground = e.base.localToWorld(new THREE.Vector3(0.36, ankle, -0.02));
        target = target.lerp(ground.add(new THREE.Vector3(0, Math.sin(Math.PI * e.down) * 0.06, 0)), smooth(e.down));
      }
      reach(leg.thigh, leg.calf, leg.foot, target, dirOf(me, side * 0.2, 0.25, 1));
      flatFoot(leg.foot, rest[s], frameQ, 0);
    }
    return true;
  }

  // The rider on the thing they ride. Called after the figure has been posed for the frame (seated for the bicycle,
  // standing for the rest). Gives false while it is still being fetched.
  function seat(me, ride, groundY, key = 'ride') {
    const e = shown.get(key);
    if (!e || !e.models || !ride || !me || !me.bones) return false;
    const bones = bonesOf(me);
    const done = e.id === 'bicycle' ? cycle(me, e, ride, bones) : stand(me, e, ride, bones);
    return done;
  }

  return {
    update, seat,
    // is the one ridden drawn yet (it is fetched the first time it is ridden)
    ready: (key = 'ride') => { const e = shown.get(key); return !!(e && e.models); },
    // the models of the one ridden (sports-model.js), and what is worked out for it, for the tests
    ridden: (key = 'ride') => { const e = shown.get(key); return e && e.models ? e.models : null; },
    stateOf: (key = 'ride') => { const e = shown.get(key); return e ? { id: e.id, phase: e.phase, push: e.push, down: e.down, pitch: e.pitch, travelled: e.travelled, spin: e.spin } : null; },
    failed: (key = 'ride') => { const e = shown.get(key); return !!(e && e.failed); },
    count: () => shown.size,
    keys: () => [...shown.keys()],
    // where a pedal and a grip are now (the tests: are the feet on them)
    pedals: (key = 'ride') => { const e = shown.get(key); return e && e.models && e.id === 'bicycle' ? [pedalWorld(e.models[0], SPORTS_PARTS.bicycle, true), pedalWorld(e.models[0], SPORTS_PARTS.bicycle, false)] : null; },
    // where a rider's hands, feet (ankles) and hips are (the tests: are they where they should be)
    limbs: (me) => { if (!me || !me.bones) return null; const b = bonesOf(me); const at = (n) => { const bone = b.get(n); return bone ? bone.getWorldPosition(new THREE.Vector3()) : null; }; return { hands: [at('hand_l'), at('hand_r')], feet: [at('foot_l'), at('foot_r')], pelvis: at('pelvis') }; },
    grips: (key = 'ride') => { const e = shown.get(key); const s = e && SPORTS_PARTS[e.id]; return e && e.models && s && s.grip ? [gripWorld(e.models[0], s.grip, 1), gripWorld(e.models[0], s.grip, -1)] : null; },
    dispose() { for (const e of shown.values()) drop(e); shown.clear(); },
  };
}
