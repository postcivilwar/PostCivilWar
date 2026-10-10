// The camera: several ways of looking at the player, moving smoothly from one
// to the next and never ending up inside a wall.
//
// On foot:        behind, close, over the shoulder, from above, from the side
// In a vehicle:   close behind, further behind, from above, and from the bonnet looking ahead
//                 (the views from the side, at the driver's side and from inside the seat were taken
//                 out: in a keke the canopy and the driver's own body filled them)
//
// Each view is a few numbers (how far back, how high, turned how far, set off
// to which side). Changing view only changes the numbers the camera is
// heading for; it glides there. Dragging still turns the camera in every
// view; in the views that follow the player's heading the drag springs back.

export const CAMERA_VIEWS = Object.freeze({
  foot: Object.freeze(['behind', 'close', 'shoulder', 'high', 'side']),
  vehicle: Object.freeze(['chase', 'far', 'high', 'bonnet']),
});

// dist/pitch null: whatever the player has set by dragging and zooming
export const CAMERA_VIEW = Object.freeze({
  behind: Object.freeze({ name: 'Behind', dist: null, scale: 1, pitch: null, turn: 0, shift: 0, lift: 0, follow: false }),
  close: Object.freeze({ name: 'Close', dist: 4.4, pitch: 0.2, turn: 0, shift: 0, lift: 0, follow: false }),
  shoulder: Object.freeze({ name: 'Over the shoulder', dist: 2.7, pitch: 0.1, turn: 0, shift: 0.6, lift: 0.12, follow: true }),
  high: Object.freeze({ name: 'From above', dist: null, scale: 1.7, pitch: 1.02, turn: 0, shift: 0, lift: 0, follow: false }),
  side: Object.freeze({ name: 'From the side', dist: 8.5, pitch: 0.14, turn: Math.PI / 2, shift: 0, lift: 0, follow: true }),
  driver: Object.freeze({ name: 'Driver\'s side', dist: 4.6, pitch: 0.16, turn: 0.5, shift: -0.7, lift: 0.1, follow: true }),
  seat: Object.freeze({ name: 'From the seat', seat: true, follow: true }),
  chase: Object.freeze({ name: 'Close behind', dist: 6.2, pitch: 0.22, turn: 0, shift: 0, lift: -0.1, follow: true }),
  far: Object.freeze({ name: 'Far behind', dist: 10.5, pitch: 0.3, turn: 0, shift: 0, lift: 0, follow: true }),
  bonnet: Object.freeze({ name: 'From the bonnet', seat: true, ahead: 1.3, rise: -0.35, follow: true }),
});

// Closer than this, the camera would be inside or against the player's own figure.
const NEAR = 1.6;
// How much room behind the player the camera looks for before it rises over what is in the way.
const RISE_WANT = 3.2;
const angleGap = (a, b) => { let d = (a - b) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };

// The next view in the cycle for where the player is.
export function nextView(current, where) {
  const list = CAMERA_VIEWS[where] || CAMERA_VIEWS.foot;
  const at = list.indexOf(current);
  return list[(at + 1) % list.length];
}
// A view that exists where the player now is: the same one if it does, otherwise the first.
export const viewFor = (current, where) => ((CAMERA_VIEWS[where] || CAMERA_VIEWS.foot).includes(current) ? current : (CAMERA_VIEWS[where] || CAMERA_VIEWS.foot)[0]);

// `blocked(x, z, y)` says whether a point is inside something solid, or above a low roof that
// would hide whoever stands under it.
export function createCameraRig(camera, { blocked, wallHeight = 4.2 } = {}) {
  const live = { dist: 8, pitch: 0.27, turn: 0, shift: 0, lift: 0, seat: 0, yaw: Math.PI, look: 0, arm: 8, rise: 0 };
  const eye = new THREE.Vector3(), aim = new THREE.Vector3();
  let view = 'behind';
  let hidden = false;
  let close = false;

  // How far along the line from the target a camera can stand before it is inside something.
  function clearance(tx, ty, tz, dx, dy, dz, dist) {
    if (!blocked) return dist;
    const steps = Math.max(2, Math.ceil(dist / 0.45));
    for (let i = 2; i <= steps; i += 1) {
      const d = (dist * i) / steps;
      if (ty + dy * d > wallHeight) break;                     // above the eaves: nothing up there to be inside
      if (blocked(tx + dx * d, tz + dz * d, ty + dy * d)) return Math.max(0.2, (dist * (i - 1)) / steps - 0.25);
    }
    return dist;
  }

  // Places the camera for this frame.
  //   cam      { yaw, pitch, dist }: what the player has set by dragging and zooming
  //   target   { x, y, z }: what is looked at
  //   heading  which way the player or vehicle faces
  //   indoors  null, or { pitch, dist }: limits while under a roof
  //   dragged  seconds since the player last dragged the view
  function update(dt, { cam, target, heading, indoors = null, dragged = 99, eyeHeight = 1.55 }) {
    const v = CAMERA_VIEW[view] || CAMERA_VIEW.behind;
    const ease = Math.min(1, dt * 5);
    let wantDist = v.dist === null || v.dist === undefined ? cam.dist * (v.scale || 1) : v.dist;
    let wantPitch = v.pitch === null || v.pitch === undefined ? cam.pitch : v.pitch;
    if (indoors && !v.seat) { wantPitch = Math.max(wantPitch, indoors.pitch); wantDist = Math.min(wantDist, indoors.dist); }
    live.dist += (wantDist - live.dist) * ease;
    live.pitch += (wantPitch - live.pitch) * ease;
    live.turn += ((v.turn || 0) - live.turn) * ease;
    live.shift += ((v.shift || 0) - live.shift) * ease;
    live.lift += ((v.lift || 0) - live.lift) * ease;
    live.seat += ((v.seat ? 1 : 0) - live.seat) * Math.min(1, dt * 6);
    // In a view that follows the heading, a drag looks about and then lets go.
    if (v.follow) {
      if (dragged > 1.2) live.look += (0 - live.look) * Math.min(1, dt * 3);
      const want = heading + live.turn + live.look;
      live.yaw += angleGap(want, live.yaw) * Math.min(1, dt * 7);
      cam.yaw = live.yaw - live.turn;                           // so that walking stays relative to what is seen
    } else { live.look = 0; live.yaw += angleGap(cam.yaw + live.turn, live.yaw) * Math.min(1, dt * 14); }

    const yaw = live.yaw;
    // the point looked at, set off to one side for the over-the-shoulder views
    const rightX = -Math.cos(yaw), rightZ = Math.sin(yaw);
    const tx = target.x + rightX * live.shift, ty = target.y + live.lift, tz = target.z + rightZ * live.shift;
    // With a wall, a bus or a low roof behind, the camera does not come down into the player's head (where the
    // figure had to be left undrawn, and the player seemed to have vanished): it rises over what is in the way,
    // looking down, as high as it needs and no higher, and comes back down when the way is clear.
    // (not under a roof: there the camera keeps below the eaves, as before)
    const roofed = !!blocked && (blocked(tx, tz, ty + 1.0) || blocked(tx, tz, ty + 2.4));
    if (!v.seat && !roofed) {
      const clearAt = (p) => { const c = Math.cos(p); return clearance(tx, ty, tz, -Math.sin(yaw) * c, Math.sin(p), -Math.cos(yaw) * c, live.dist); };
      let need = 0;
      if (clearAt(live.pitch) < Math.min(live.dist, RISE_WANT)) {
        need = Math.max(0, 1.45 - live.pitch);
        for (const step of [0.25, 0.5, 0.75, 1.0, 1.2]) { const p = Math.min(1.45, live.pitch + step); if (clearAt(p) >= Math.min(live.dist, RISE_WANT)) { need = p - live.pitch; break; } }
      }
      live.rise += (need - live.rise) * Math.min(1, dt * (need > live.rise ? 6 : 1.5));
    } else live.rise += (0 - live.rise) * Math.min(1, dt * 6);
    const pitch = live.pitch + live.rise;
    const cosP = Math.cos(pitch);
    const dx = -Math.sin(yaw) * cosP, dy = Math.sin(pitch), dz = -Math.cos(yaw) * cosP;
    // With something solid close behind, the camera comes in along its own line: quickly, so it is never
    // inside the wall, and out again slowly. Closer than arm's length it would be pressed against the back
    // of the player's head, so from there it sees with the player's eyes and the figure is not drawn.
    const room = v.seat ? live.dist : clearance(tx, ty, tz, dx, dy, dz, live.dist);
    // In, it eases over a few frames rather than jumping, but is never left more than a hand's width inside
    // whatever is in the way; out, it takes its time, so a post passing behind does not make the view pump.
    live.arm = room < live.arm ? Math.max(room, Math.min(room + 0.12, live.arm + (room - live.arm) * Math.min(1, dt * 24))) : live.arm + (room - live.arm) * Math.min(1, dt * 2.5);
    close = live.arm < (close ? NEAR + 0.5 : NEAR);          // a little slack, so it does not flicker at the edge
    // on foot the figure is always drawn: where even the view from above is blocked (a doorway), the camera
    // stays at arm's length, never inside the head. Only a view from a seat sees with the player's own eyes.
    const near = close && !!v.seat;
    const dist = near ? Math.min(live.arm, 0.25) : Math.max(live.arm, v.seat ? 0 : 1.1);
    eye.set(tx + dx * dist, Math.max(0.5, ty + dy * dist), tz + dz * dist);
    aim.set(tx, ty, tz);
    if (live.seat > 0.002) {
      // from the seat: the eye is the player's own, looking where they face (and a little about, if dragged)
      const sy = heading + live.look;
      // (from the bonnet: the same, set forward past the front of the vehicle and a little lower)
      const ahead = v.ahead || 0.18;
      const sx = target.x + Math.sin(heading) * ahead, sz = target.z + Math.cos(heading) * ahead;
      const seatEye = new THREE.Vector3(sx, target.y + (eyeHeight - 1.55) + 0.05 + (v.rise || 0), sz);
      const seatAim = new THREE.Vector3(sx + Math.sin(sy) * 6, seatEye.y - 0.5, sz + Math.cos(sy) * 6);
      eye.lerp(seatEye, live.seat); aim.lerp(seatAim, live.seat);
    }
    camera.position.copy(eye);
    camera.lookAt(aim);
    camera.updateMatrixWorld();
    hidden = (live.seat > 0.6 && !v.ahead) || near;
  }

  return {
    update,
    get view() { return view; },
    set view(next) { if (CAMERA_VIEW[next]) view = next; },
    // a drag: in a following view it looks about; otherwise the caller turns the camera itself
    drag(dyaw) { const v = CAMERA_VIEW[view]; if (v && v.follow) { live.look = Math.max(-1.6, Math.min(1.6, live.look + dyaw)); return true; } return false; },
    // should the player's own figure be left undrawn? (the eye is inside its head)
    get hidesPlayer() { return hidden; },
    get live() { return live; },
    snap(cam) { live.dist = cam.dist; live.pitch = cam.pitch; live.yaw = cam.yaw; live.turn = 0; live.shift = 0; live.lift = 0; live.seat = 0; live.look = 0; live.arm = cam.dist; },
  };
}
