// The crowd: a thousand townspeople, the okadas, and other players.
//
// Who is drawn how depends on how far away they are:
//   near     a full jointed figure with a face (a small pool of them)
//   further  a simple figure, drawn with every other simple figure in a
//            handful of draw calls, its limbs moved to walk, sit or lie
//   beyond   not sent by the simulation at all
// The simulation says where people are ten times a second; between those
// reports each figure is eased towards where it was last said to be.
// THREE is the global from three.min.js.

import { Batch, place, linear, surface } from './render-kit.js';
import { softShadowPicture, FIGURE_PATCH } from './soft-patch.js';
import { makeCharacter, animateCharacter, seatCharacter, standCharacter, showName, layCharacter, reactionLength } from './render-people.js';
import { poseFighter } from './combat-view.js';
import { zoneGroundY, habitationClimbing } from '../sim/zone.js';
import { vehicleMeta } from './vehicle-kit.js';
import { fallTime, flightAt } from './falls.js';

const KEKE_SEAT = vehicleMeta('keke').seats.driver;    // where a keke's driver sits, in its own frame
const SEATED = 0.845;                                  // a seated figure's seat above its feet, for a figure of height 1

const POSE = { stand: 0, walk: 1, sit: 2, lie: 3, hidden: 4, ride: 5 };
const MAX_FIGURES = 520;
// Full figures are made for people within `take` metres and let go beyond `drop`. Within `close` they are
// remade at the near level of detail; beyond `far` they go back to the middle one.
const RIG = { take: 24, drop: 30, close: 7.5, far: 10.5 };
// Making a full figure takes several milliseconds on a fast device and several
// times that on a phone, so they are made one at a time with a pause between
// (in real time, not in frames: on a fast device two frames is no pause at
// all), and a figure that has been made is kept for a while after it is let
// go, because the same people come back into view as the player walks about.
const BUILD_PAUSE = 0.11;        // seconds between one figure being made and the next
const WARDROBE = 36;             // made figures kept ready, beyond those on show
const angleGap = (a, b) => { let d = (a - b) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };

// ------------------------------------------------------- simple figures --

// Each part is its own instanced mesh, with its joint at the origin.
function figureParts() {
  const lambert = () => new THREE.MeshLambertMaterial();
  const make = (geometry) => { const mesh = new THREE.InstancedMesh(geometry, lambert(), MAX_FIGURES); mesh.frustumCulled = false; mesh.count = 0; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_FIGURES * 3), 3); mesh.instanceColor.setUsage(THREE.DynamicDrawUsage); return mesh; };
  const down = (top, bottom, length, segments = 6) => { const g = new THREE.CylinderGeometry(top, bottom, length, segments, 1); g.translate(0, -length / 2, 0); return g; };
  const torso = new THREE.CylinderGeometry(0.2, 0.165, 0.56, 8, 1);
  torso.translate(0, 0.28, 0);
  torso.scale(1, 1, 0.62);
  const head = new THREE.IcosahedronGeometry(0.118, 1);
  head.translate(0, 0.15, 0);
  const hair = new THREE.SphereGeometry(0.125, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.55);
  hair.translate(0, 0.16, -0.008);
  const shin = down(0.055, 0.045, 0.42);
  const foot = new THREE.BoxGeometry(0.09, 0.06, 0.22);
  foot.translate(0, -0.43, 0.05);
  const skirt = new THREE.CylinderGeometry(0.17, 0.21, 1, 8, 1, true);
  skirt.translate(0, -0.5, 0);
  skirt.scale(1, 1, 0.8);
  const blob = new THREE.CircleGeometry(0.38, 10);
  blob.rotateX(-Math.PI / 2);
  const parts = {
    torso: make(torso), head: make(head), hair: make(hair), skirt: make(skirt),
    armL: make(down(0.048, 0.036, 0.56)), armR: make(down(0.048, 0.036, 0.56)),
    thighL: make(down(0.075, 0.058, 0.44)), thighR: make(down(0.075, 0.058, 0.44)),
    shinL: make(mergeTwo(shin, foot)), shinR: make(mergeTwo(shin, foot)),
  };
  // (soft, darkest under the feet: the contact shadow, at every level; soft-patch.js)
  const shade = new THREE.InstancedMesh(blob, new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: softShadowPicture(), transparent: true, opacity: FIGURE_PATCH, depthWrite: false }), MAX_FIGURES);
  shade.frustumCulled = false;
  shade.count = 0;
  shade.renderOrder = 1;
  // Further off, a person is three plain shapes: a body, a head and the legs
  // or wrapper. About a ninth of the triangles, and at that size it reads the same.
  const body = new THREE.BoxGeometry(0.38, 0.56, 0.22);
  body.translate(0, 0.28, 0);
  const far = { body: make(body), head: make((() => { const g = new THREE.IcosahedronGeometry(0.125, 0); g.translate(0, 0.15, 0); return g; })()), legs: make((() => { const g = new THREE.BoxGeometry(0.3, 0.9, 0.2); g.translate(0, -0.45, 0); return g; })()) };
  return { parts, shade, far };
}

function mergeTwo(a, b) {
  const A = a.toNonIndexed(), B = b.toNonIndexed();
  const g = new THREE.BufferGeometry();
  for (const name of ['position', 'normal']) { const merged = new Float32Array(A.attributes[name].array.length + B.attributes[name].array.length); merged.set(A.attributes[name].array, 0); merged.set(B.attributes[name].array, A.attributes[name].array.length); g.setAttribute(name, new THREE.BufferAttribute(merged, 3)); }
  return g;
}

// ---------------------------------------------------------------- okada --

const BIKE_COLOURS = [0xb3261e, 0x1f4e8c, 0x1b1b1e, 0x2e7d4f, 0xd9a441];
const bikeGeometry = new Map();
function bikeMesh(material, variant) {
  if (!bikeGeometry.has(variant)) {
    const B = new Batch();
    const body = BIKE_COLOURS[variant % BIKE_COLOURS.length];
    for (const z of [0.68, -0.64]) {
      B.round(new THREE.TorusGeometry(0.27, 0.07, 7, 16), place(0, 0.33, z, Math.PI / 2), 0x18181a);
      B.round(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 12), place(0, 0.33, z, 0, 1, 1, 1, 0, Math.PI / 2), 0xa9adb2);
      B.round(new THREE.CylinderGeometry(0.3, 0.3, 0.13, 12, 1, true, 0, Math.PI), place(0, 0.35, z, 0, 1, 1, 1, 0, Math.PI / 2), body, 0.9);
    }
    B.box(0.16, 0.14, 1.1, place(0, 0.5, 0), 0x2a2b2f);                                       // frame
    B.round(new THREE.SphereGeometry(0.2, 10, 8), place(0, 0.78, 0.3, 0, 0.75, 0.62, 1.25), body);   // tank
    B.box(0.26, 0.09, 0.78, place(0, 0.8, -0.3), 0x1b1b1e);                                   // long seat
    B.box(0.3, 0.26, 0.34, place(0, 0.46, 0.08), 0x6e7378);                                   // engine
    B.round(new THREE.CylinderGeometry(0.035, 0.045, 0.8, 8), place(0.15, 0.36, -0.42, 0, 1, 1, 1, Math.PI / 2 - 0.08, 0), 0xc9ccd0);   // exhaust
    B.round(new THREE.CylinderGeometry(0.025, 0.025, 0.78, 6), place(0, 0.72, 0.62, 0, 1, 1, 1, -0.42, 0), 0x8a8f96);                  // forks
    B.round(new THREE.CylinderGeometry(0.02, 0.02, 0.66, 6), place(0, 1.06, 0.46, 0, 1, 1, 1, 0, Math.PI / 2), 0x2a2b2f);               // handlebar
    B.round(new THREE.SphereGeometry(0.09, 10, 8), place(0, 0.95, 0.6, 0, 1, 1, 0.7), 0xfff2c4);                                        // lamp
    B.box(0.22, 0.03, 0.34, place(0, 0.84, -0.82), 0x55585c);                                 // carrier
    B.box(0.14, 0.09, 0.02, place(0, 0.62, -0.93), 0xb3261e);
    B.box(0.3, 0.11, 0.02, place(0, 0.5, -0.97), 0xf3ecdc);                                   // plate
    bikeGeometry.set(variant, B.build(material).geometry);
  }
  return new THREE.Mesh(bikeGeometry.get(variant), material);
}

// ---------------------------------------------------------------- crowd --

export function createCrowd(scene) {
  const { parts, shade, far } = figureParts();
  for (const mesh of [...Object.values(parts), ...Object.values(far)]) scene.add(mesh);
  scene.add(shade);
  const bikeMaterial = surface({ vertexColors: true, roughness: 0.6, metalness: 0.25 });
  const actors = new Map();        // townspeople in view, by their number
  const bikes = new Map();
  const others = new Map();        // other players
  const mounted = new Map();       // full figures of people on motorcycles near the player, by their number
  const peerOkadas = new Map();    // the okadas other players ride (each copy of the town has its own), by player
  const rigs = new Set();
  let lastRows = null;
  let lastOkadas = null;
  let stamp = 0;
  const NONE = new Set();
  let fallen = NONE;               // townspeople lying on the ground where a vehicle left them
  let building = 0;                // seconds until the next figure may be made
  let seating = 0;                 // and until the next rider's
  const stats = { figures: 0, simple: 0, rigs: 0, bikes: 0, players: 0, made: 0, reused: 0, kept: 0, madeMs: 0, slowestMs: 0 };
  const wardrobe = new Map();      // figures let go but kept ready, by person and level of detail; oldest first

  // A full figure of someone: one kept ready if there is one, otherwise a new one.
  function dress(i, info, lod, label = true) {
    const key = `${i}|${lod}|${label ? 1 : 0}`;
    let rig = wardrobe.get(key);
    if (rig) { wardrobe.delete(key); stats.reused += 1; stats.kept = wardrobe.size; rig.blob.visible = true; return rig; }
    const t = performance.now();
    rig = makeCharacter(info.look, label ? info.short : null, false, lod);
    rig.lod = lod; rig.key = key;
    const took = performance.now() - t;
    stats.made += 1; stats.madeMs += took; if (took > stats.slowestMs) stats.slowestMs = took;
    return rig;
  }
  // Puts a figure away. It is thrown out only when the wardrobe is full.
  function undress(rig) {
    scene.remove(rig.group);
    if (!rig.key) { rig.dispose(); return; }
    wardrobe.set(rig.key, rig);
    while (wardrobe.size > WARDROBE) { const [oldest, old] = wardrobe.entries().next().value; wardrobe.delete(oldest); old.dispose(); }
    stats.kept = wardrobe.size;
  }

  // scratch
  const M = new THREE.Matrix4(), L = new THREE.Matrix4(), J = new THREE.Matrix4(), K = new THREE.Matrix4();
  const P = new THREE.Vector3(), S = new THREE.Vector3(1, 1, 1), Q = new THREE.Quaternion(), E = new THREE.Euler(0, 0, 0, 'YXZ');
  const C = new THREE.Color();
  const colourCache = new Map();
  const colourOf = (hex) => { let c = colourCache.get(hex); if (!c) { c = linear(hex); colourCache.set(hex, c); } return c; };
  let n = 0;
  const joint = (out, parent, x, y, z, rx, sx = 1, sy = 1, sz = 1) => { E.set(rx, 0, 0); Q.setFromEuler(E); P.set(x, y, z); S.set(sx, sy, sz); L.compose(P, Q, S); out.multiplyMatrices(parent, L); return out; };
  const put = (mesh, matrix, hex) => { mesh.setMatrixAt(n, matrix); const c = colourOf(hex); mesh.instanceColor.setXYZ(n, c.r, c.g, c.b); };
  const HIDE = new THREE.Matrix4().makeScale(0, 0, 0);

  // Writes one simple figure. `pose` is how the body is held; `walk` is the
  // phase of the stride; (x, y, z, h) is where the feet are.
  function figure(fig, x, y, z, h, pose, walk, armsOut = 0) {
    if (n >= MAX_FIGURES) return;
    const s = fig.scale || 1;
    const seated = pose === POSE.sit || pose === POSE.ride;
    E.set(pose === POSE.lie ? -Math.PI / 2 : 0, h, 0);
    Q.setFromEuler(E);
    const lift = pose === POSE.lie ? 0.72 : 0;
    const back = pose === POSE.lie ? 0.85 * s : 0;
    P.set(x + Math.sin(h) * back, y + lift + zoneGroundY(x, z), z + Math.cos(h) * back);
    S.set(s * (fig.wide || 1), s, s * (fig.wide || 1));
    M.compose(P, Q, S);
    const hip = seated ? 0.46 : 0.9;
    const stride = pose === POSE.walk ? Math.sin(walk) * 0.55 : 0;
    const lean = pose === POSE.walk ? 0.05 : 0;
    put(parts.torso, joint(J, M, 0, hip, 0, lean), fig.top);
    put(parts.head, joint(K, J, 0, 0.56, 0, -lean), fig.skin);
    const hat = fig.hat;
    put(parts.hair, joint(K, J, 0, 0.56, 0, -lean, hat === 4 ? 2.0 : hat === 2 ? 1.22 : hat === 3 ? 1.12 : 1.02, hat === 4 ? 0.35 : hat === 2 ? 1.5 : hat === 3 ? 1.1 : 1, hat === 4 ? 2.0 : hat === 2 ? 1.2 : hat === 3 ? 1.14 : 1.02), fig.hair);
    const arm = seated ? -0.5 - armsOut : 0;
    put(parts.armL, joint(K, J, -0.225, 0.5, 0, arm - stride * 0.8), fig.arm);
    put(parts.armR, joint(K, J, 0.225, 0.5, 0, arm + stride * 0.8), fig.arm);
    const thigh = seated ? -1.45 : 0;
    const kneeL = seated ? 1.4 : pose === POSE.walk ? Math.max(0, -Math.cos(walk)) * 0.8 : 0;
    const kneeR = seated ? 1.4 : pose === POSE.walk ? Math.max(0, Math.cos(walk)) * 0.8 : 0;
    const upper = fig.skirt ? fig.legs : fig.bottom;
    put(parts.thighL, joint(J, M, -0.09, hip, 0, thigh + stride), upper);
    put(parts.shinL, joint(K, J, 0, -0.44, 0, kneeL), fig.legs);
    put(parts.thighR, joint(J, M, 0.09, hip, 0, thigh - stride), upper);
    put(parts.shinR, joint(K, J, 0, -0.44, 0, kneeR), fig.legs);
    if (fig.skirt) put(parts.skirt, joint(K, M, 0, hip + 0.04, seated ? 0.12 : 0, seated ? -1.2 : 0, 1, seated ? 0.5 : fig.skirt === 1 ? 0.5 : 0.82, 1), fig.bottom);
    else parts.skirt.setMatrixAt(n, HIDE);
    if (pose === POSE.lie || pose === POSE.ride) shade.setMatrixAt(n, HIDE); else { P.set(x, 0.06 + zoneGroundY(x, z), z); Q.identity(); S.set(s, 1, s); L.compose(P, Q, S); shade.setMatrixAt(n, L); }
    n += 1;
  }

  // The same person further off: no arms, no stride, no shade.
  let m = 0;
  const putFar = (mesh, matrix, hex) => { mesh.setMatrixAt(m, matrix); const c = colourOf(hex); mesh.instanceColor.setXYZ(m, c.r, c.g, c.b); };
  function farFigure(fig, x, z, h, pose) {
    if (m >= MAX_FIGURES) return;
    const s = fig.scale || 1;
    const seated = pose === POSE.sit || pose === POSE.ride;
    E.set(pose === POSE.lie ? -Math.PI / 2 : 0, h, 0);
    Q.setFromEuler(E);
    const back = pose === POSE.lie ? 0.85 * s : 0;
    P.set(x + Math.sin(h) * back, (pose === POSE.lie ? 0.72 : 0) + zoneGroundY(x, z), z + Math.cos(h) * back);
    S.set(s * (fig.wide || 1), s, s * (fig.wide || 1));
    M.compose(P, Q, S);
    const hip = seated ? 0.46 : 0.9;
    putFar(far.body, joint(J, M, 0, hip, 0, 0), fig.top);
    putFar(far.head, joint(K, J, 0, 0.56, 0, 0), fig.skin);
    putFar(far.legs, joint(K, M, 0, hip, 0, seated ? -1.3 : 0, 1, seated ? 0.52 : 1, 1), fig.bottom);
    m += 1;
  }

  function release(actor) {
    if (!actor.rig) return;
    undress(actor.rig);
    rigs.delete(actor);
    actor.rig = null;
  }

  function poseRig(actor, dt, moving) {
    const rig = actor.rig;
    const g = rig.group;
    const s = rig.scale;
    g.rotation.order = 'YXZ';
    if (actor.pose === POSE.lie && fallen.has(actor.i)) {
      // knocked down by a vehicle: they go over the way the player does (character.js layCharacter), quickly,
      // and lie where they fell
      g.rotation.set(0, actor.h, 0);
      g.position.set(actor.x, 0, actor.z);
      standCharacter(rig);
      actor.fall = (actor.fall || 0) + (1 - (actor.fall || 0)) * Math.min(1, dt * 12);
      layCharacter(rig, actor.fall);
      rig.blob.visible = false;
      return;
    }
    if (actor.pose === POSE.lie) {
      g.rotation.set(-Math.PI / 2, actor.h, 0);
      // in a hospital bed
      g.position.set(actor.x + Math.sin(actor.h) * 0.85 * s, 0.74, actor.z + Math.cos(actor.h) * 0.85 * s);
      rig.blob.visible = false;
      return;
    }
    g.rotation.set(0, actor.h, 0);
    // (on the ground where they are: up on a pavement, where it stands above the road)
    g.position.set(actor.x + (actor.ox || 0), zoneGroundY(actor.x, actor.z), actor.z + (actor.oz || 0));
    // the legs keep the pace the person is really going at, so the feet hold the ground
    const went = rig.atX === undefined ? 0 : Math.hypot(actor.x - rig.atX, actor.z - rig.atZ);
    rig.atX = actor.x; rig.atZ = actor.z;
    rig.pace = (rig.pace === undefined ? 1.35 : rig.pace) + (Math.min(2.4, went / Math.max(dt, 0.001)) - (rig.pace === undefined ? 1.35 : rig.pace)) * Math.min(1, dt * 3);
    animateCharacter(rig, dt, moving ? Math.max(0.7, rig.pace) : 0, false);
    if (actor.pose === POSE.sit) { seatCharacter(rig); g.position.y = -0.44 * s; rig.armL.shoulder.rotation.x = -0.35; rig.armR.shoulder.rotation.x = -0.35; rig.armL.elbow.rotation.x = -0.9; rig.armR.elbow.rotation.x = -0.9; } else standCharacter(rig);
    // getting up again after a fall: more slowly than going down
    if (actor.fall) { actor.fall += (0 - actor.fall) * Math.min(1, dt * 4); if (actor.fall < 0.002) actor.fall = 0; layCharacter(rig, actor.fall); }
  }

  // Nobody is drawn inside anybody. Where two townspeople, or a townsperson and a player, would overlap on
  // screen, each is eased aside a little from where their day has them, and drifts back once there is room.
  // (Where people are is the simulation's; this only keeps their bodies from passing through one another as
  // they go. A player cannot step into a townsperson at all: src/sim/impact.js.)
  const APART = 0.62, MOST = 0.9;
  const cells = new Map();
  function keepApart(frame, dt) {
    const eye = frame.eye;
    const bodies = [];
    cells.clear();
    for (const a of actors.values()) {
      if (a.ox === undefined) { a.ox = 0; a.oz = 0; a.px = 0; a.pz = 0; }
      a.px = 0; a.pz = 0;
      if (a.pose === POSE.lie || a.pose === POSE.sit || a.pose === POSE.ride || a.pose === POSE.hidden) { a.ox *= 0.8; a.oz *= 0.8; continue; }
      if (Math.abs(a.x - eye.x) > 40 || Math.abs(a.z - eye.z) > 40) continue;
      bodies.push(a);
      const key = `${Math.floor((a.x + a.ox) / 1.2)},${Math.floor((a.z + a.oz) / 1.2)}`;
      let list = cells.get(key); if (!list) { list = []; cells.set(key, list); } list.push(a);
    }
    // players: this one, and the others in view
    const players = [{ x: eye.x, z: eye.z }];
    for (const q of frame.players || []) if (q && Number.isFinite(q.x) && !q.driving) players.push(q);
    for (const a of bodies) {
      const ax = a.x + a.ox, az = a.z + a.oz;
      const cx = Math.floor(ax / 1.2), cz = Math.floor(az / 1.2);
      for (let i = -1; i <= 1; i += 1) for (let j = -1; j <= 1; j += 1) {
        const list = cells.get(`${cx + i},${cz + j}`); if (!list) continue;
        for (const b of list) {
          if (b === a || b.i < a.i) continue;
          let dx = (b.x + b.ox) - ax, dz = (b.z + b.oz) - az; let d = Math.hypot(dx, dz);
          if (d >= APART) continue;
          if (d < 1e-4) { dx = Math.sin(a.i); dz = Math.cos(a.i); d = 1; }
          const push = (APART - d) / 2;
          a.px -= (dx / d) * push; a.pz -= (dz / d) * push; b.px += (dx / d) * push; b.pz += (dz / d) * push;
        }
      }
      for (const q of players) {
        let dx = ax - q.x, dz = az - q.z; const d = Math.hypot(dx, dz);
        if (d >= APART || d < 1e-4) continue;
        a.px += (dx / d) * (APART - d); a.pz += (dz / d) * (APART - d);
      }
    }
    const k = Math.min(1, dt * 8), back = Math.min(1, dt * 1.5);
    for (const a of bodies) {
      if (a.px || a.pz) { a.ox += a.px * k * 1.5; a.oz += a.pz * k * 1.5; } else { a.ox -= a.ox * back; a.oz -= a.oz * back; }
      const o = Math.hypot(a.ox, a.oz); if (o > MOST) { a.ox *= MOST / o; a.oz *= MOST / o; }
    }
  }

  // A townsperson's reaction (src/sim/reactions.js): the clip fades in, plays, and fades out. While they walk or
  // run, or sit, only the body above the hips plays it, so the legs keep the ground.
  let clockNow = 0;
  function react(actor, entry, dt) {
    const rig = actor.rig;
    if (!rig || rig.animated) return;
    if (entry && (!actor.react || actor.react.name !== entry[1] || Math.abs((clockNow - actor.react.start) - entry[2]) > 1.5)) actor.react = { name: entry[1], start: clockNow - entry[2], loop: !!entry[4], upperOnly: !!entry[3] };
    const r = actor.react;
    if (!r) { if (rig.reaction) rig.reaction.weight = Math.max(0, rig.reaction.weight - dt * 3.5); return; }
    const time = clockNow - r.start;
    const length = reactionLength(r.name) || 1;
    let weight = Math.min(1, time / 0.25);
    if (!r.loop) weight = Math.min(weight, Math.max(0, (length - time) / 0.3));
    if (!entry) { r.fade = (r.fade === undefined ? 1 : r.fade) - dt * 3.5; weight = Math.min(weight, Math.max(0, r.fade)); if (weight <= 0) actor.react = null; }
    const moving = actor.pose === POSE.walk || actor.pose === POSE.sit;
    rig.reaction = { name: r.name, time, weight, loop: r.loop || !entry, upper: r.upperOnly || moving };
  }

  // `frame` is { dt, rows, okadas, players, known, eye, clock, maxRigs, hide }
  function update(frame) {
    fallen = frame.fallen ? new Set(frame.fallen) : NONE;
    const { dt, rows, known, eye } = frame;
    stamp += 1;
    if (rows !== lastRows) {
      lastRows = rows;
      for (const [i, x, z, h, pose] of rows) {
        let actor = actors.get(i);
        if (!actor) { actor = { i, x, z, h, tx: x, tz: z, th: h, pose, walk: (i * 1.7) % 6.28, rig: null, seen: 0, speed: 0 }; actors.set(i, actor); }
        // someone who sits down, or is suddenly far from where they were, is put there
        if (Math.hypot(actor.x - x, actor.z - z) > 9 || (pose !== POSE.walk && actor.pose === POSE.walk && Math.hypot(actor.x - x, actor.z - z) < 0.6)) { actor.x = x; actor.z = z; }
        actor.tx = x; actor.tz = z; actor.th = h; actor.pose = pose; actor.seen = stamp;
      }
      for (const [i, actor] of actors) if (actor.seen !== stamp) { release(actor); actors.delete(i); }
    }

    keepApart(frame, dt);
    clockNow += Math.min(0.25, frame.real === undefined ? dt : frame.real);
    const reacting = new Map((frame.reacts || []).map((r) => [r[0], r]));
    n = 0;
    m = 0;
    const detail = frame.detail || 60;
    // counted in real seconds, however long or short the frames are
    const real = Math.min(0.25, frame.real === undefined ? dt : frame.real);
    // a phone asks for a longer pause; and a frame that is already late is no time to make anyone
    const pause = (frame.pause || BUILD_PAUSE) * (real > 0.045 ? 2 : 1);
    building -= real;
    seating -= real;
    let closest = null;
    let closestD = RIG.take;
    // one name plate at a time: whoever is near enough to speak to
    let named = null;
    let namedD = 4.5;
    for (const actor of actors.values()) {
      const gx = actor.tx - actor.x, gz = actor.tz - actor.z;
      const gap = Math.hypot(gx, gz);
      const moving = actor.pose === POSE.walk && gap > 0.03;
      if (gap > 0.005) { const step = Math.min(gap, (1.7 + gap * 2.2) * dt); actor.x += (gx / gap) * step; actor.z += (gz / gap) * step; }
      const want = moving ? Math.atan2(gx, gz) : actor.th;
      actor.h += angleGap(want, actor.h) * Math.min(1, dt * (moving ? 9 : 6));
      if (moving) actor.walk += dt * 6.2;
      const d = Math.hypot(actor.x - eye.x, actor.z - eye.z);
      actor.d = d;
      const info = known.get(actor.i);
      if (!info) continue;
      if (actor.rig && (d > RIG.drop || rigs.size > frame.maxRigs)) release(actor);
      if (!actor.rig && d < closestD && rigs.size < frame.maxRigs) { closestD = d; closest = actor; }
      if (actor.rig && building <= 0 && ((actor.rig.lod === 2 && d < RIG.close) || (actor.rig.lod === 1 && d > RIG.far))) {
        // someone has come close, or gone off again: the same person, at another level of detail
        const lod = actor.rig.lod === 2 ? 1 : 2;
        const before = stats.made;
        const fresh = dress(actor.i, info, lod);
        fresh.phase = actor.rig.phase; fresh.speed = actor.rig.speed; fresh.idleTime = actor.rig.idleTime; fresh.pace = actor.rig.pace; fresh.gait.hipY = actor.rig.gait.hipY;
        undress(actor.rig);
        actor.rig = fresh; scene.add(fresh.group);
        if (stats.made !== before) building = pause;
      }
      if (actor.rig) { poseRig(actor, dt, moving); react(actor, reacting.get(actor.i), dt); if (actor.rig.strike || actor.guard) poseFighter(actor.rig, frame.clock || 0, { guard: !!actor.guard }); showName(actor.rig, actor.rig.named === true, dt); actor.rig.named = false; if (d < namedD && actor.pose !== POSE.lie && !frame.riding) { namedD = d; named = actor; } continue; }
      if (d > detail) farFigure(info.fig, actor.x + (actor.ox || 0), actor.z + (actor.oz || 0), actor.h, actor.pose);
      else figure(info.fig, actor.x + (actor.ox || 0), moving ? Math.abs(Math.cos(actor.walk)) * 0.025 : 0, actor.z + (actor.oz || 0), actor.h, moving ? POSE.walk : actor.pose === POSE.walk ? POSE.stand : actor.pose, actor.walk);
    }
    if (named) named.rig.named = true;       // the one nearest, and only within a few steps: see showName
    // one new full figure at a time, the nearest first, so a crowd does not stall the frame
    if (closest && building <= 0) {
      const info = known.get(closest.i);
      const lod = closestD < RIG.close ? 1 : 2;
      const before = stats.made;
      closest.rig = dress(closest.i, info, lod);
      closest.rig.group.position.set(closest.x, 0, closest.z);
      scene.add(closest.rig.group);
      rigs.add(closest);
      if (stats.made !== before) building = pause;
    }

    // okadas: the machine, its rider, and whoever is on the back
    const okadas = frame.okadas;
    if (okadas !== lastOkadas) {
      lastOkadas = okadas;
      for (const o of okadas) {
        let bike = bikes.get(o.n);
        if (!bike) { bike = { n: o.n, mesh: bikeMesh(bikeMaterial, o.n), x: o.x, z: o.z, h: o.h, seen: 0, speed: 0 }; scene.add(bike.mesh); bikes.set(o.n, bike); }
        if (Math.hypot(bike.x - o.x, bike.z - o.z) > 14) { bike.x = o.x; bike.z = o.z; bike.h = o.h; }
        bike.truth = o; bike.seen = stamp;
      }
      for (const [key, bike] of bikes) if (bike.seen !== stamp) { scene.remove(bike.mesh); bikes.delete(key); }
    }
    const own = frame.own || null;       // the machine the player is riding themselves: { n, x, z, h, lean, speed }
    const tug = frame.tug || null;       // a rider being pulled off his machine: { n, amount (0 to 1), side }
    for (const bike of bikes.values()) {
      const o = bike.truth;
      if (own && own.n === bike.n) {
        // it goes where the player's own driving has put it, with no waiting for the simulation's word
        bike.x = own.x; bike.z = own.z; bike.h = own.h; bike.speed = own.speed;
        E.set(0, bike.h, own.lean);
        bike.mesh.quaternion.setFromEuler(E);
        bike.mesh.position.set(bike.x, zoneGroundY(bike.x, bike.z), bike.z);      // (up on the bridge's deck, where it is on it)
        continue;
      }
      const gx = o.x - bike.x, gz = o.z - bike.z;
      const gap = Math.hypot(gx, gz);
      const before = bike.x * 1000 + bike.z;
      if (gap > 0.005) { const step = Math.min(gap, (o.moving ? 7.2 : 2) * dt + gap * dt * 2.5); bike.x += (gx / gap) * step; bike.z += (gz / gap) * step; }
      bike.speed = Math.abs(bike.x * 1000 + bike.z - before) > 0.01 ? Math.min(8, gap / Math.max(dt, 0.001) * 0.2 + (o.moving ? 6 : 0)) : 0;
      bike.h += angleGap(o.moving && gap > 0.3 ? Math.atan2(gx, gz) : o.h, bike.h) * Math.min(1, dt * 7);
      // a parked machine leans on its stand
      E.set(0, bike.h, o.moving ? 0 : 0.12);
      bike.mesh.quaternion.setFromEuler(E);
      bike.mesh.position.set(bike.x, 0, bike.z);
      if (typeof o.person !== 'number') continue;        // nobody on it: taken from its rider, or left standing
      const rider = known.get(o.person);
      const fx = Math.sin(bike.h), fz = Math.cos(bike.h);
      const near = Math.hypot(bike.x - eye.x, bike.z - eye.z) < RIG.take * 0.8;
      // close by, the rider and whoever is behind him are full figures in the saddle; further off, simple ones
      const seat = (index, who, back, driving) => {
        let rig = mounted.get(index);
        if (!rig && near && mounted.size < 10 && seating <= 0) { const before = stats.made; rig = dress(index, who, 2, false); scene.add(rig.group); mounted.set(index, rig); if (stats.made !== before) seating = pause; }
        if (!rig || !near) { figure(who.fig, bike.x - fx * back, driving ? 0.36 : 0.38, bike.z - fz * back, bike.h, POSE.ride, 0, driving ? 0.55 : 0); return; }
        rig.seen = stamp;
        animateCharacter(rig, dt, 0, false);
        seatCharacter(rig);
        if (!driving) { rig.armL.shoulder.rotation.x = -0.4; rig.armR.shoulder.rotation.x = -0.4; rig.armL.elbow.rotation.x = -0.8; rig.armR.elbow.rotation.x = -0.8; }
        rig.group.position.set(bike.x - fx * (back + 0.12), -0.15 * rig.scale, bike.z - fz * (back + 0.12));
        rig.group.rotation.y = bike.h;
        // someone has hold of him: he is dragged sideways out of the saddle
        if (driving && tug && tug.n === bike.n) {
          const side = tug.side || 1, a = tug.amount;
          rig.group.position.x += Math.cos(bike.h) * side * 0.55 * a; rig.group.position.z -= Math.sin(bike.h) * side * 0.55 * a;
          rig.group.position.y += 0.1 * a;
          rig.torso.rotation.y = -0.5 * a * side; rig.torso.rotation.x = 0.04 - 0.2 * a;
          rig.armL.shoulder.rotation.x = -0.95 - 0.5 * a; rig.armR.shoulder.rotation.x = -0.95 - 0.5 * a;
        }
      };
      if (rider) seat(o.person, rider, 0.05, true);
      if (typeof o.passenger === 'number') { const who = known.get(o.passenger); if (who) seat(o.passenger, who, 0.5, false); }
    }
    for (const [index, rig] of mounted) if (rig.seen !== stamp) { undress(rig); mounted.delete(index); }

    // other players
    const seen = new Set();
    for (const q of frame.players) {
      seen.add(q.id);
      let other = others.get(q.id);
      if (!other) { other = { rig: makeCharacter(q.look, q.name, false, 1), x: q.x, z: q.z, h: q.heading }; scene.add(other.rig.group); others.set(q.id, other); }
      const gx = q.x - other.x, gz = q.z - other.z;
      let gap = Math.hypot(gx, gz);
      // in or on a vehicle: where their game says the vehicle is, carried on between words at its speed (main.js),
      // so it is not left trailing behind as someone walking would be; and facing the way the vehicle faces
      const vh = q.vehicle || null, seated = !!vh || !!q.ride || !!q.car;
      // knocked down, thrown from a motorcycle or killed (19 October 2026): from their game (`down`, link.js), or from
      // this town if they are in it (a stance): they fall the way the blow sent them, from where it began, lie and get
      // up as they do on their own screen (falls.js); they are not walked from where they were struck to where they lay
      const st0 = frame.others ? frame.others[q.id] : null;
      // (how long ago it began, carried on to this frame from the town's last word, so that the fall flows)
      const pd0 = q.down ? q.down : st0 && (st0.down || st0.rising || st0.dead) && Number.isFinite(st0.fallAge) ? { kind: st0.kind || (st0.dead ? 'dead' : 'knock'), age: st0.fallAge, lie: st0.lie, rise: st0.rise, push: st0.fell, hard: st0.hard, from: null } : null;
      const pd = pd0 && Number.isFinite(pd0.age) ? { ...pd0, age: pd0.age + (frame.ahead || 0) } : pd0;
      let fallPlace = null;
      if (pd) {
        if (other.fallFacing === null || other.fallFacing === undefined) other.fallFacing = other.h;
        // (where they lie: as their game said at the first word of the fall; they may be up and away on their own
        // screen while the getting up is still shown here)
        const lies = pd.at && Number.isFinite(pd.at.x) ? pd.at : { x: q.x, z: q.z };
        const ds = { ...pd, facing: other.fallFacing, to: lies, lie: pd.kind === 'dead' ? 1e6 : pd.lie || 2.4, rise: pd.kind === 'dead' ? 0 : pd.rise || 2.7, thrown: pd.from ? Math.hypot(lies.x - pd.from.x, lies.z - pd.from.z) : 1 };
        other.rig.downState = ds;
        if (pd.from && pd.kind !== 'dead' && ds.age < fallTime(ds)) {
          if (pd.kind === 'crash') fallPlace = flightAt(ds, ds.age, zoneGroundY(pd.from.x, pd.from.z));
          else { const u = Math.min(1, ds.age / fallTime(ds)), e = u * u * (3 - 2 * u); fallPlace = { x: pd.from.x + (lies.x - pd.from.x) * e, z: pd.from.z + (lies.z - pd.from.z) * e }; }
        }
        const at = fallPlace || lies;
        other.x = at.x; other.z = at.z; gap = 0;
      } else { other.fallFacing = null; other.rig.downState = null; }
      if (pd) { /* where the fall has them */ } else if (seated) { other.x = q.x; other.z = q.z; other.h += angleGap(q.heading, other.h) * Math.min(1, dt * 12); gap = 0; }
      else {
        if (gap > 20) { other.x = q.x; other.z = q.z; } else if (gap > 0.01) { const step = Math.min(gap, (2.4 + gap * 3) * dt); other.x += (gx / gap) * step; other.z += (gz / gap) * step; }
        // (with a gun out they face where they aim, whichever way they go: gun-pose.js turns their legs to it)
        const aimed = q.gun && q.gun.out && Number.isFinite(q.gun.yaw) ? q.gun.yaw : null;
        other.h += angleGap(aimed !== null ? aimed : gap > 0.25 ? Math.atan2(gx, gz) : q.heading, other.h) * Math.min(1, dt * (aimed !== null ? 14 : 8));
      }
      other.rig.group.position.set(other.x, other.rig.swimming ? other.rig.group.position.y : fallPlace && fallPlace.y !== undefined ? fallPlace.y : zoneGroundY(other.x, other.z), other.z);
      // (all three: in a car they are turned with its body as it pitches and rolls, car-view.js)
      other.rig.group.rotation.set(0, other.h, 0);
      const stance = frame.others ? frame.others[q.id] : null;
      // another player in the river swims, with their own figure's swim, floating at the surface
      other.rig.swimming = !!(stance && stance.swimming);
      // a skill another player is playing: their own figure's clip, from its start; a figure on the game's own
      // skeleton plays the carried-over clip of the same name, if there is one
      const em = stance && stance.emote;
      if (em && (!other.emote || other.emote.name !== em.name || em.ago < other.emote.ago - 0.5)) { if (other.rig.animated) other.rig.emote(em.name); other.emoteStart = clockNow - em.ago; }
      other.emote = em || null;
      // a jump another player has made: their figure's own, from where it has got to in it
      const jp = stance && stance.jump !== null && stance.jump !== undefined ? stance.jump : q.jump !== null && q.jump !== undefined ? q.jump : null;
      if (jp !== null && jp !== undefined && other.rig.animated && (other.jumpFrom === undefined || Math.abs(clockNow - jp - other.jumpFrom) > 0.4)) { other.jumpFrom = clockNow - jp; other.rig.jump(jp); }
      // (going up the habitation's stairs: their figure's own climb up them)
      other.rig.climbing = !!other.rig.animated && !seated && gap > 0.12 && habitationClimbing(other.x, other.z, other.h);
      if (!other.rig.animated) {
        const len = em ? reactionLength(em.name) : 0;
        const t = em ? clockNow - other.emoteStart : 0;
        if (em && len && t < len) other.rig.reaction = { name: em.name, time: t, weight: Math.min(1, t / 0.25, (len - t) / 0.3), loop: false, upper: false };
        else if (other.rig.reaction) other.rig.reaction.weight = Math.max(0, other.rig.reaction.weight - dt * 4);
      }
      // badly hurt (their own game says 20 or less): a limp (animated.js)
      other.rig.limp = Number.isFinite(q.health) && q.health <= 20 && !seated && !other.rig.swimming;
      animateCharacter(other.rig, dt, seated ? 0 : other.rig.swimming ? Math.min(2, gap * 4) : gap > 0.12 ? Math.min(5.6, gap * 4 + 1.5) : 0, false);
      // another player's name shows only to someone near them
      showName(other.rig, Math.hypot(other.x - frame.eye.x, other.z - frame.eye.z) < 12, dt);
      // knocked down, or dead: on the ground; getting up: on the way back (and flat in the water, for a figure with no swim of its own)
      const flat = !!(stance && (stance.down || stance.dead)) || (other.rig.swimming && !other.rig.animated);
      other.fall = (other.fall || 0) + ((flat ? 1 : 0) - (other.fall || 0)) * Math.min(1, dt * (flat ? 12 : 4));
      // (a supplied figure falls with its own fall: the harder one when killed or bowled over on the move)
      if (!other.rig.fallDriver) layCharacter(other.rig, other.fall, (stance && stance.dead) || other.rig.speed > 1.5 ? 'hard' : 'soft');
      if (other.rig.swimming) other.rig.group.position.y = other.rig.animated ? -(other.rig.spec.height * 0.58) - 0.22 : -0.5; else if (other.wasSwimming) other.rig.group.position.y = zoneGroundY(other.x, other.z);
      other.wasSwimming = other.rig.swimming;
      if (other.rig.strike || (stance && stance.fighting)) poseFighter(other.rig, frame.clock || 0, { guard: !!(stance && stance.fighting), block: !!(stance && stance.blocking) });
      // at the wheel of a keke (the keke is drawn by main.js): on its driver's seat
      if (vh && vh.kind === 'keke') {
        const fx = Math.sin(other.h), fz = Math.cos(other.h);
        seatCharacter(other.rig);
        other.rig.group.position.set(other.x + fx * KEKE_SEAT[2], zoneGroundY(other.x, other.z) + KEKE_SEAT[1] - SEATED * other.rig.scale, other.z + fz * KEKE_SEAT[2]);
      }
      // on an okada: the machine under them, and them in its saddle; on the back of one, its rider in front of them
      if (vh && vh.kind === 'okada') {
        let bike = peerOkadas.get(q.id);
        if (!bike) { bike = { mesh: bikeMesh(bikeMaterial, `p:${q.id}`), x: other.x, z: other.z, was: { x: other.x, z: other.z } }; scene.add(bike.mesh); peerOkadas.set(q.id, bike); }
        bike.seen = stamp;
        const gy = zoneGroundY(other.x, other.z), fx = Math.sin(other.h), fz = Math.cos(other.h);
        const moving = Math.hypot(other.x - bike.was.x, other.z - bike.was.z) > 0.002;
        bike.was.x = other.x; bike.was.z = other.z;
        E.set(0, other.h, moving ? 0 : 0.12);
        bike.mesh.quaternion.setFromEuler(E);
        bike.mesh.position.set(other.x, gy, other.z);
        seatCharacter(other.rig);
        const back = vh.back ? 0.5 + 0.12 : 0.17;
        other.rig.group.position.set(other.x - fx * back, gy + (vh.back ? -0.04 : -0.15 * other.rig.scale), other.z - fz * back);
        if (vh.back) {
          other.rig.armL.shoulder.rotation.x = -0.4; other.rig.armR.shoulder.rotation.x = -0.4; other.rig.armL.elbow.rotation.x = -0.8; other.rig.armR.elbow.rotation.x = -0.8;
          // the okada's own rider (one of the town's people, the same in every copy of the town)
          const who = typeof vh.driver === 'number' ? known.get(vh.driver) : null;
          if (who) figure(who.fig, other.x - fx * 0.05, 0.36, other.z - fz * 0.05, other.h, POSE.ride, 0, 0.55);
        }
      }
    }
    for (const [id, bike] of peerOkadas) if (bike.seen !== stamp) { scene.remove(bike.mesh); peerOkadas.delete(id); }
    for (const [id, other] of others) if (!seen.has(id)) { scene.remove(other.rig.group); other.rig.dispose(); others.delete(id); }

    for (const mesh of Object.values(parts)) { mesh.count = n; mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true; }
    for (const mesh of Object.values(far)) { mesh.count = m; mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true; }
    shade.count = n;
    shade.instanceMatrix.needsUpdate = true;
    stats.figures = n + m; stats.simple = m; stats.rigs = rigs.size; stats.bikes = bikes.size; stats.players = others.size;
  }

  // Where a speaker's head is, for the speech bubble: 'n:12', 'p:p-0002', 'v:abc'.
  function anchor(key, known) {
    if (key.startsWith('n:')) {
      const i = Number(key.slice(2));
      const actor = actors.get(i);
      const info = known.get(i);
      if (actor) return { x: actor.x, y: (actor.pose === POSE.sit ? 1.36 : actor.pose === POSE.lie ? 1.2 : 1.86) * (info ? info.fig.scale : 1), z: actor.z };
      for (const bike of bikes.values()) if (bike.truth.person === i || bike.truth.passenger === i) return { x: bike.x, y: 1.9, z: bike.z };
      return null;
    }
    const other = others.get(key.startsWith('p:') ? key.slice(2) : key);
    return other ? { x: other.x, y: 1.9, z: other.z } : null;
  }

  return {
    update, anchor, stats,
    bike: (riderNumber) => bikes.get(riderNumber) || null,
    bikes: () => bikes.values(),
    // how many other players' okadas are drawn (for the tests)
    peerOkadas: () => peerOkadas.size,
    figureAt: (i) => actors.get(i) || null,
    // the full figure of a townsperson or of another player, if one is on show: for a blow struck or taken
    rigOf: (key) => { if (key.startsWith('n:')) { const a = actors.get(Number(key.slice(2))); return a && a.rig ? a.rig : null; } const o = others.get(key.slice(2)); return o ? o.rig : null; },
    // marks townspeople who have their hands up (defending themselves)
    setGuards(set) { for (const actor of actors.values()) actor.guard = set.has(actor.i); },
    actors: () => actors.values(),
  };
}
