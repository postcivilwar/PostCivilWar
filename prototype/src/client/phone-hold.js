// The phone in the character's hand.
//
// When the player takes out the phone the figure does it too: the right hand goes down to the pocket, comes up
// with the handset and holds it in front of the chest, the head tips down to look at it, and the screen lights
// the hand and the face. Putting it away is the same thing backwards. The figure can walk while it holds it:
// the legs and body keep their own animation and only the right arm and the head are held.
//
// Nothing in the supplied figure is changed. Its arm is posed each frame, after its own animation has been
// played, by the same reaching used to put its hands on a steering wheel (animated.js). The handset is a small
// thing made here; the supplied files have no phone and no animation of using one.
//
// The grip. The handset is held by the hand, not near it: it is placed in the hand's own frame, worked out
// from the figure's own bones (where the knuckles are, which way the fingers run, which side the palm is), so
// it sits in the same place in the palm for either figure at any size, and stays there as the arm moves. The
// wrist is turned so the palm faces the face with the fingers lying across the back of the handset, the four
// fingers are bent round its far edge and the thumb is laid along its near one. As the hand comes up out of
// the pocket the grip is eased in; as it goes back it is eased out, and the fingers are left as the figure's
// own animation has them.
//
// The light: on a desktop one small lamp at the screen, always in the scene and simply dark when the phone is
// away (a lamp that came and went would make every surface in town be worked out again). On a phone or tablet,
// which draws no lamps at all, the glow is painted: a soft patch at the screen and a fainter one on the face.
// Either way it is stronger at night than at noon.

import { reach } from './animated.js';

const OUT_SECONDS = 0.85;        // from the press to the phone held up
const AWAY_SECONDS = 0.6;
const POCKET = 0.42;             // the part of the way out at which the hand is in the pocket
// what the screen is showing, as the colour of the light it throws: [r, g, b] in 0..1
const SCREENS = Object.freeze({ home: [1, 0.78, 0.6], camera: [0.75, 0.86, 1], music: [1, 0.55, 0.5], deal: [0.55, 0.95, 0.8], page: [0.8, 0.86, 1] });

const smooth = (t) => { const u = Math.max(0, Math.min(1, t)); return u * u * (3 - 2 * u); };

// How far each joint of a finger is bent round the handset's far edge (radians from the line of the palm,
// towards the glass): the first lies along the back, the second turns the corner, the third rests on the front.
const CURL = Object.freeze({ index: [0.10, 0.95, 1.5], middle: [0.12, 1.0, 1.55], ring: [0.14, 1.0, 1.55], pinky: [0.16, 0.95, 1.5] });

// The hand's own frame, read once from a figure's bones: in the hand bone's own space, which way the fingers
// run (wrist to middle knuckle), which way lies across the palm (little finger to forefinger) and which way the
// palm faces. They are the same whatever the hand is doing, since the knuckles do not move in the hand.
const grips = new WeakMap();
function gripOf(rig, hand) {
  if (grips.has(rig)) return grips.get(rig);
  const bone = (name) => rig.bones.get(name);
  const middle = bone('middle_01_r'), index = bone('index_01_r'), pinky = bone('pinky_01_r');
  let grip = null;
  if (middle && index && pinky) {
    hand.updateMatrixWorld(true);
    const at = (b) => hand.worldToLocal(b.getWorldPosition(new THREE.Vector3()));
    const f = at(middle).normalize();
    const side = at(index).sub(at(pinky));
    side.addScaledVector(f, -side.dot(f)).normalize();
    const n = new THREE.Vector3().crossVectors(side, f).normalize();      // a right hand: across, then along, gives the way the palm faces
    const local = new THREE.Matrix4().makeBasis(f, side, n);
    const chain = (name) => [1, 2, 3].map((i) => bone(`${name}_0${i}_r`)).filter(Boolean);
    grip = { toLocal: local.clone().transpose(), fingers: Object.keys(CURL).map((name) => ({ name, bones: chain(name) })).filter((c) => c.bones.length === 3), thumb: chain('thumb') };
  }
  grips.set(rig, grip);
  return grip;
}

export function createPhoneHold({ scene, lite }) {
  const prop = new THREE.Group();
  prop.visible = false;
  // a modern handset at its real size: 71 by 147 by 8 mm, the glass a little inside the frame
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.071, 0.147, 0.008), new THREE.MeshBasicMaterial({ color: 0x1b1c1f }));
  const art = document.createElement('canvas'); art.width = 32; art.height = 64;
  const texture = new THREE.CanvasTexture(art);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.065, 0.141), new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }));
  glass.position.z = 0.0042;
  const back = new THREE.Mesh(new THREE.PlaneGeometry(0.022, 0.022), new THREE.MeshBasicMaterial({ color: 0x0a0a0b }));
  back.position.set(0.018, 0.052, -0.0042); back.rotation.y = Math.PI;      // the camera plate
  prop.add(body, glass, back);
  scene.add(prop);

  const patch = (size) => {
    const c = document.createElement('canvas'); c.width = size; c.height = size;
    const g = c.getContext('2d'); const fall = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    fall.addColorStop(0, 'rgba(255,255,255,1)'); fall.addColorStop(0.4, 'rgba(255,255,255,0.35)'); fall.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = fall; g.fillRect(0, 0, size, size);
    return new THREE.CanvasTexture(c);
  };
  const glowMap = patch(64);
  const glowOf = () => new THREE.Sprite(new THREE.SpriteMaterial({ map: glowMap, color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, toneMapped: false, fog: false }));
  const screenGlow = glowOf(), faceGlow = glowOf();
  screenGlow.visible = false; faceGlow.visible = false;
  scene.add(screenGlow, faceGlow);
  const lamp = lite ? null : new THREE.PointLight(0xffffff, 0, 1.5, 2);
  if (lamp) scene.add(lamp);

  let shown = '';
  function paint(kind) {
    if (kind === shown) return;
    shown = kind;
    const g = art.getContext('2d');
    const [r, gr, b] = SCREENS[kind] || SCREENS.home;
    const fill = g.createLinearGradient(0, 0, 0, 64);
    const c = (k) => `rgb(${Math.round(r * 255 * k)},${Math.round(gr * 255 * k)},${Math.round(b * 255 * k)})`;
    fill.addColorStop(0, c(0.55)); fill.addColorStop(0.55, c(1)); fill.addColorStop(1, c(0.6));
    g.fillStyle = fill; g.fillRect(0, 0, 32, 64);
    texture.needsUpdate = true;
  }
  paint('home');

  let out = 0;                    // 0 away .. 1 held up
  let hidden = null;
  let raise = 0;                  // 0 held to read .. 1 held up to take a picture
  const v = { hand: new THREE.Vector3(), from: new THREE.Vector3(), pocket: new THREE.Vector3(), hold: new THREE.Vector3(), target: new THREE.Vector3(), pole: new THREE.Vector3(), head: new THREE.Vector3(), zero: new THREE.Vector3(), up: new THREE.Vector3(), eye: new THREE.Vector3(), look: new THREE.Vector3() };
  const q = { a: new THREE.Quaternion(), w: new THREE.Quaternion(), p: new THREE.Quaternion(), m: new THREE.Matrix4() };
  const hide = () => { prop.visible = false; screenGlow.visible = false; faceGlow.visible = false; if (lamp) lamp.intensity = 0; release(); };
  const grp = { f: new THREE.Vector3(), side: new THREE.Vector3(), n: new THREE.Vector3(), left: new THREE.Vector3(), palm: new THREE.Vector3(), a: new THREE.Vector3(), b: new THREE.Vector3(), want: new THREE.Vector3(), m: new THREE.Matrix4(), q: new THREE.Quaternion(), parent: new THREE.Quaternion(), world: new THREE.Quaternion(), grip: new THREE.Quaternion(), flat: new THREE.Quaternion() };

  // A bone this file turns keeps a note of how the figure's own animation had it. Where an animation moves the
  // bone every frame, that is simply how it is found; where none does (the fingers, in most), it is what was
  // there before the phone came out, and it is put back when the phone goes away.
  const posed = new Map();          // bone -> { base, set }
  function baseOf(bone) {
    let note = posed.get(bone);
    if (!note) { note = { base: bone.quaternion.clone(), set: new THREE.Quaternion(NaN, 0, 0, 1) }; posed.set(bone, note); }
    else if (!bone.quaternion.equals(note.set)) note.base.copy(bone.quaternion);      // the animation has moved it since
    bone.quaternion.copy(note.base);
    return note;
  }
  // Turns a bone, by `weight`, from how its animation has it towards the turn `world` (in the scene's frame).
  function turnTo(bone, world, weight) {
    const note = baseOf(bone);
    bone.parent.getWorldQuaternion(grp.parent);
    grp.q.copy(grp.parent).invert().multiply(world);
    bone.quaternion.slerp(grp.q, weight);
    note.set.copy(bone.quaternion);
    bone.updateMatrixWorld(true);
  }
  // Points a bone along `want` (from its own joint to the next), by `weight`.
  function pointAt(bone, next, want, weight) {
    const note = baseOf(bone);
    bone.updateMatrixWorld(true);
    bone.getWorldPosition(grp.a); next.getWorldPosition(grp.b);
    grp.b.sub(grp.a).normalize();
    grp.q.setFromUnitVectors(grp.b, want);
    bone.getWorldQuaternion(grp.world);
    grp.world.premultiply(grp.q);
    bone.parent.getWorldQuaternion(grp.parent);
    grp.q.copy(grp.parent).invert().multiply(grp.world);
    bone.quaternion.slerp(grp.q, weight);
    note.set.copy(bone.quaternion);
    bone.updateMatrixWorld(true);
  }
  function release() {
    for (const [bone, note] of posed) if (bone.quaternion.equals(note.set)) bone.quaternion.copy(note.base);
    posed.clear();
  }

  // rig: the player's figure (animated.js). use: is the phone out. able: is the figure standing or walking (not
  // at a wheel, in the water, on the ground). night: 0 at noon .. 1 in the dark. screen: what the phone shows.
  function update(dt, rig, { use, able, night = 0, screen = 'home' }) {
    const want = use && able ? 1 : 0;
    out += Math.max(-dt / AWAY_SECONDS, Math.min(dt / OUT_SECONDS, want - out));
    if (!able) out = 0;
    if (out <= 0.001 || !rig || !rig.animated || !rig.bones || !rig.group.visible) { hide(); return; }
    const holder = rig.body;
    const H = rig.spec.height;
    const upper = rig.bones.get('upperarm_r'), lower = rig.bones.get('lowerarm_r'), hand = rig.bones.get('hand_r'), head = rig.bones.get('head'), neck = rig.bones.get('neck_01');
    if (!upper || !lower || !hand || !head) { hide(); return; }
    holder.updateMatrixWorld(true);
    // where the animation has the hand now, where the pocket is and where the phone is held, in the figure's own
    // frame (it faces +z and its right is -x), sized to the figure
    hand.getWorldPosition(v.from);
    holder.worldToLocal(v.from);
    v.pocket.set(-0.118 * H, 0.5 * H, 0.03 * H);
    // to read: in front of the chest. To take a picture: up at the eyes, at arm's length
    raise += ((screen === 'camera' ? 1 : 0) - raise) * Math.min(1, dt * 6);
    // (the wrist: the handset itself lies across the fingers, a hand's breadth further in towards the middle of the body)
    v.hold.set((-0.085 - 0.02 * raise) * H, (0.71 + 0.18 * raise) * H, (0.19 + 0.12 * raise) * H);
    if (out < POCKET) v.target.lerpVectors(v.from, v.pocket, smooth(out / POCKET));
    else {
      const u = smooth((out - POCKET) / (1 - POCKET));
      v.target.lerpVectors(v.pocket, v.hold, u);
      v.target.x -= Math.sin(u * Math.PI) * 0.05 * H;       // out of the pocket and round, not through the hip
    }
    const held = smooth((out - POCKET) / (1 - POCKET));
    holder.localToWorld(v.hand.copy(v.target));
    holder.localToWorld(v.pole.set(-0.7, -1, -0.5)).sub(holder.localToWorld(v.zero.set(0, 0, 0)));
    reach(upper, lower, hand, v.hand, v.pole);
    hand.getWorldPosition(v.hand);
    head.getWorldPosition(v.head);

    // the handset: from the moment the hand is in the pocket
    prop.visible = out >= POCKET * 0.9;
    holder.localToWorld(v.up.set(0, 1, 0)).sub(holder.localToWorld(v.zero.set(0, 0, 0))).normalize();
    const grip = gripOf(rig, hand);
    if (grip && held > 0.001) {
      // The palm's frame, as it should be with the handset in it: the palm to the eyes, the fingers running
      // across the body towards its other side and a little upward, the forefinger's side of the hand on top.
      holder.localToWorld(grp.left.set(1, 0, 0)).sub(holder.localToWorld(v.zero.set(0, 0, 0))).normalize();
      v.eye.copy(v.head).addScaledVector(v.up, 0.06 * H);
      grp.n.copy(v.eye).sub(v.hand).normalize();
      grp.f.copy(grp.left).multiplyScalar(Math.cos(0.42)).addScaledVector(v.up, Math.sin(0.42));
      grp.f.addScaledVector(grp.n, -grp.f.dot(grp.n)).normalize();
      grp.side.crossVectors(grp.f, grp.n).normalize();
      grp.m.makeBasis(grp.f, grp.side, grp.n).multiply(grip.toLocal);
      grp.grip.setFromRotationMatrix(grp.m);
      turnTo(hand, grp.grip, held);
      // the four fingers lie along the back of the handset and bend round its far edge; the thumb lies up its near one
      for (const finger of grip.fingers) {
        const [b1, b2, b3] = finger.bones;
        const curl = CURL[finger.name];
        const tip = b3.children.find((c) => c.isBone) || null;
        const ends = [b2, b3, tip];
        for (let i = 0; i < 3; i += 1) {
          grp.want.copy(grp.f).multiplyScalar(Math.cos(curl[i])).addScaledVector(grp.n, Math.sin(curl[i]));
          if (ends[i]) pointAt(finger.bones[i], ends[i], grp.want, held);
        }
      }
      if (grip.thumb.length === 3) {
        const [t1, t2, t3] = grip.thumb;
        // (the thumb comes up the near edge and its tip rests on the front, at the edge of the glass)
        pointAt(t1, t2, grp.want.copy(grp.side).multiplyScalar(0.78).addScaledVector(grp.f, 0.52).addScaledVector(grp.n, 0.34).normalize(), held);
        pointAt(t2, t3, grp.want.copy(grp.side).multiplyScalar(0.8).addScaledVector(grp.f, 0.55).addScaledVector(grp.n, 0.22).normalize(), held);
        const end = t3.children.find((c) => c.isBone);
        if (end) pointAt(t3, end, grp.want.copy(grp.side).multiplyScalar(0.6).addScaledVector(grp.f, 0.8).addScaledVector(grp.n, 0.02).normalize(), held);
      }
      hand.getWorldPosition(v.hand);
    }
    if (prop.visible) {
      const size = Math.max(0.6, rig.scale || 1) * (H / 1.75);
      prop.scale.setScalar(size);
      // in the pocket: flat against the leg, where the hand is
      holder.localToWorld(v.look.set(-0.118 * H - 1, 0.5 * H, 0.03 * H));
      q.m.lookAt(v.look, v.hand, v.up);          // the glass (+z) faces what it looks at
      grp.flat.setFromRotationMatrix(q.m);
      if (grip && held > 0.001) {
        // in the hand: its back on the fingers just beyond the knuckles, its near edge against the base of the
        // thumb, its length up the hand and past the forefinger; the glass faces the way the palm does
        const knuckle = grip.fingers.length ? grip.fingers[Math.min(1, grip.fingers.length - 1)].bones[0] : null;
        const reachOut = knuckle ? knuckle.getWorldPosition(grp.a).distanceTo(v.hand) : 0.09 * size;
        grp.palm.copy(v.hand).addScaledVector(grp.f, reachOut * 1.02).addScaledVector(grp.side, reachOut * 0.42).addScaledVector(grp.n, reachOut * 0.2 + 0.004 * size);
        grp.a.crossVectors(grp.side, grp.n);            // the handset's width runs along the fingers
        grp.m.makeBasis(grp.a, grp.side, grp.n);
        grp.world.setFromRotationMatrix(grp.m);
        prop.position.copy(v.hand).lerp(grp.palm, held);
        prop.quaternion.copy(grp.flat).slerp(grp.world, held);
      } else {
        // (a figure whose hand has no fingers to read: held just above the hand, its glass to the eyes)
        prop.position.copy(v.hand).addScaledVector(v.up, 0.055 * held);
        v.eye.copy(v.head).addScaledVector(v.up, 0.06 * H);
        v.look.lerp(v.eye, held);
        q.m.lookAt(v.look, prop.position, v.up);
        prop.quaternion.setFromRotationMatrix(q.m);
      }
    }

    // the head tips down to the screen, by the shortest turn from straight ahead
    if (held > 0.01) {
      holder.localToWorld(v.look.set(0, 0, 1)).sub(holder.localToWorld(v.zero.set(0, 0, 0))).normalize();
      v.eye.copy(prop.position).sub(v.head).normalize();
      q.a.setFromUnitVectors(v.look, v.eye);
      for (const [bone, share] of [[neck, 0.3], [head, 0.45]]) {
        if (!bone) continue;
        q.w.identity().slerp(q.a, share * held);
        bone.getWorldQuaternion(q.p.identity());
        const world = q.w.multiply(q.p);
        bone.parent.getWorldQuaternion(q.p);
        bone.quaternion.copy(q.p.invert().multiply(world));
        bone.updateMatrixWorld(true);
      }
    }

    // the light of the screen
    paint(screen);
    const [r, g, b] = SCREENS[screen] || SCREENS.home;
    const strength = held * (0.3 + 0.7 * night);
    screenGlow.visible = faceGlow.visible = held > 0.02;
    if (screenGlow.visible) {
      head.getWorldPosition(v.head);
      v.eye.copy(v.head).sub(prop.position).normalize();
      screenGlow.position.copy(prop.position).addScaledVector(v.eye, 0.02);
      screenGlow.scale.setScalar(0.2 * H);
      screenGlow.material.color.setRGB(r, g, b); screenGlow.material.opacity = 0.16 + 0.34 * strength;
      // on the face: just in front of it, on the side the phone is
      faceGlow.position.copy(v.head).addScaledVector(v.up, 0.055 * H).addScaledVector(v.eye, -0.1 * H);
      faceGlow.scale.setScalar(0.26 * H);
      faceGlow.material.color.setRGB(r, g, b); faceGlow.material.opacity = 0.05 + 0.4 * strength * strength;
    }
    if (lamp) {
      lamp.position.copy(prop.position).addScaledVector(v.eye, 0.12);
      lamp.color.setRGB(r, g, b);
      lamp.intensity = held * (0.12 + 1.5 * night);
    }
  }

  return {
    update,
    get out() { return out; },
    // where the handset is and which way its glass faces, for the phone's own camera
    get prop() { return prop; },
    get ready() { return out > 0.97; },
    get raised() { return raise; },
    // while the phone's own camera takes its picture, neither the handset nor its glow is in it
    hideForPicture(on) { if (on) { hidden = [screenGlow.visible, faceGlow.visible]; prop.visible = false; screenGlow.visible = false; faceGlow.visible = false; } else if (hidden) { [screenGlow.visible, faceGlow.visible] = hidden; hidden = null; } },
    dispose() { scene.remove(prop, screenGlow, faceGlow); if (lamp) scene.remove(lamp); },
  };
}
