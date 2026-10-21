// The camera: several ways of looking at the player, moving smoothly from one
// to the next and never ending up inside a wall.
//
// On foot:        on the street (close behind, the first and the one the game starts with), further back,
//                 over the shoulder, from above
// In a vehicle:   close behind, further behind, from above, and from the bonnet looking ahead
//                 (the views from the side, at the driver's side and from inside the seat were taken
//                 out: in a keke the canopy and the driver's own body filled them)
//
// Each view is a few numbers (how far back, how high, turned how far, set off
// to which side, how wide it sees). Changing view only changes the numbers the camera is
// heading for; it glides there. Dragging still turns the camera in every
// view; in the views that follow the player's heading the drag springs back.
//
// On the street (19 October 2026, the owner's brief and his video of the classic open-world game on a phone): the
// camera stands a few metres behind the player at about the height of their head, looking a little down past them,
// so that the figure fills the lower middle of the picture with the road and the town ahead above it. It goes where
// they go, unhurried (main.js swings it round behind the way they walk or run, never round toward someone running at
// the screen), comes a little closer and lower at a run, swings out a little on a turn and settles again, and comes
// in toward the player rather than through a wall. Every easing is by the time passed (an exponential), so it moves
// the same at 20 frames a second as at 60.

export const CAMERA_VIEWS = Object.freeze({
  foot: Object.freeze(['street', 'behind', 'shoulder', 'high']),
  vehicle: Object.freeze(['chase', 'far', 'high', 'bonnet']),
});

// dist/pitch null: whatever the player has set by dragging and zooming (`cam.dist`, `cam.pitch`), times `scale`
// and plus `pitchAdd`. `fov` is how wide it sees, top to bottom, in degrees (55 where it says nothing).
// `riseWant`: how much room behind the player the view needs before it rises over what is in the way rather than
// coming in toward them. `run`: on foot at a run, how much closer (a share of the distance) and lower it comes.
export const CAMERA_VIEW = Object.freeze({
  street: Object.freeze({ name: 'On the street', dist: null, scale: 1, pitch: null, turn: 0, shift: 0, lift: -0.12, fov: 60, follow: false, riseWant: 1.1, run: Object.freeze({ closer: 0.2, lower: 0.025 }), sway: true }),
  behind: Object.freeze({ name: 'Further back', dist: null, scale: 2.1, pitch: null, pitchAdd: 0.17, turn: 0, shift: 0, lift: 0, follow: false }),
  close: Object.freeze({ name: 'Close', dist: 4.4, pitch: 0.2, turn: 0, shift: 0, lift: 0, follow: false }),
  shoulder: Object.freeze({ name: 'Over the shoulder', dist: 2.7, pitch: 0.1, turn: 0, shift: 0.6, lift: 0.12, fov: 58, follow: true, riseWant: 1.4 }),
  high: Object.freeze({ name: 'From above', dist: null, scale: 3.0, pitch: 1.02, turn: 0, shift: 0, lift: 0, follow: false }),
  side: Object.freeze({ name: 'From the side', dist: 8.5, pitch: 0.14, turn: Math.PI / 2, shift: 0, lift: 0, follow: true }),
  driver: Object.freeze({ name: 'Driver\'s side', dist: 4.6, pitch: 0.16, turn: 0.5, shift: -0.7, lift: 0.1, follow: true }),
  seat: Object.freeze({ name: 'From the seat', seat: true, follow: true }),
  chase: Object.freeze({ name: 'Close behind', dist: 6.2, pitch: 0.22, turn: 0, shift: 0, lift: -0.1, follow: true }),
  far: Object.freeze({ name: 'Far behind', dist: 10.5, pitch: 0.3, turn: 0, shift: 0, lift: 0, follow: true }),
  bonnet: Object.freeze({ name: 'From the bonnet', seat: true, ahead: 1.3, rise: -0.35, follow: true }),
});
// where the player is put on the street view when they come into the town, and how far it may be pinched in
export const STREET = Object.freeze({ dist: 3.9, pitch: 0.1, nearest: 2.4 });

// Closer than this, the camera would be inside or against the player's own figure.
const NEAR = 1.6;
// How much room behind the player the camera looks for before it rises over what is in the way.
const RISE_WANT = 3.2;
// How much higher it tries, in turn, for that room: the least that gives it (in small steps, so that a wall close
// behind tips the view down only as far as it must, and the street ahead stays in it; 19 October 2026, a tall wall a
// step behind the player sent it to looking straight down)
const RISE_STEPS = Object.freeze([0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 1.05, 1.2, 1.35]);
const BASE_FOV = 55;
const angleGap = (a, b) => { let d = (a - b) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
// how far toward where it is going something gets in `dt` seconds, at `rate` (per second): the same at any frame rate
const toward = (rate, dt) => 1 - Math.exp(-rate * dt);

// The next view in the cycle for where the player is.
export function nextView(current, where) {
  const list = CAMERA_VIEWS[where] || CAMERA_VIEWS.foot;
  const at = list.indexOf(current);
  return list[(at + 1) % list.length];
}
// A view that exists where the player now is: the same one if it does, otherwise the first.
export const viewFor = (current, where) => ((CAMERA_VIEWS[where] || CAMERA_VIEWS.foot).includes(current) ? current : (CAMERA_VIEWS[where] || CAMERA_VIEWS.foot)[0]);

// `blocked(x, z, y)` says whether a point is inside something solid, or above a low roof that
// would hide whoever stands under it. `tall(x, z)`, if given, is how high a building far taller than the
// eaves stands there (0 where there is none): up to its top, it is solid too. `ground(x, z)`, if given, is the
// height of the ground: the eye keeps above it.
export function createCameraRig(camera, { blocked, wallHeight = 4.2, tall = null, ground = null, terrain = null } = {}) {
  const live = { dist: 8, pitch: 0.27, turn: 0, shift: 0, lift: 0, seat: 0, yaw: Math.PI, look: 0, arm: 8, rise: 0, fov: BASE_FOV, run: 0, swing: 0, sway: 0, rate: 0, bob: 0 };
  const eye = new THREE.Vector3(), aim = new THREE.Vector3();
  let view = 'street';
  let hidden = false;
  let close = false;

  // How far along the line from the target a camera can stand before it is inside something.
  // (`blocked` already keeps a camera's width off what is solid; it stands OFF_WALL nearer still. Where the line first
  // meets something is found to a few centimetres, between the last step that was clear and the first that was not:
  // 19 October 2026, the steps alone put it up to half a metre short, so that a wall a step behind sent the view up
  // over the player's head when there was room behind them)
  const OFF_WALL = 0.1;
  function clearance(tx, ty, tz, dx, dy, dz, dist) {
    if (!blocked && !terrain) return dist;
    const hit = (d) => {
      const x = tx + dx * d, y = ty + dy * d, z = tz + dz * d;
      // land rising between the player and the eye (a cliff, a slope, the side of a gorge: the habitation's hills),
      // whatever its height: the eye comes in short of it, or rises over it
      if (terrain) { const g = terrain(x, z); if (Number.isFinite(g) && y < g + 0.3) return true; }
      // above the eaves: nothing up there to be inside, but a tower
      if (y > wallHeight && (!tall || y > tall(x, z))) return false;
      return blocked(x, z, y);
    };
    const steps = Math.max(2, Math.ceil(dist / 0.45));
    for (let i = 2; i <= steps; i += 1) {
      const d = (dist * i) / steps;
      if (!hit(d)) continue;
      let clear = (dist * (i - 1)) / steps, met = d;
      for (let k = 0; k < 4; k += 1) { const mid = (clear + met) / 2; if (hit(mid)) met = mid; else clear = mid; }
      return Math.max(0.2, clear - OFF_WALL);
    }
    return dist;
  }
  // How far along the line from the target a camera can stand and still be inside a room it may not leave
  // (`room`: { x0, z0, x1, z1, top }), a little off its walls.
  function inRoom(room, tx, ty, tz, dx, dy, dz, dist) {
    if (!room) return dist;
    const m = 0.3;
    let d = dist;
    if (dx > 1e-6) d = Math.min(d, (room.x1 - m - tx) / dx); else if (dx < -1e-6) d = Math.min(d, (room.x0 + m - tx) / dx);
    if (dz > 1e-6) d = Math.min(d, (room.z1 - m - tz) / dz); else if (dz < -1e-6) d = Math.min(d, (room.z0 + m - tz) / dz);
    if (dy > 1e-6) d = Math.min(d, (room.top - m - ty) / dy);
    return Math.max(0.2, d);
  }

  // Places the camera for this frame.
  //   cam      { yaw, pitch, dist }: what the player has set by dragging and zooming
  //   target   { x, y, z }: what is looked at
  //   heading  which way the player or vehicle faces
  //   indoors  null, or { pitch, dist, maxPitch }: limits while under a roof
  //   room     null, or { x0, z0, x1, z1, top }: a hall the camera stays inside (it looks from within it)
  //   dragged  seconds since the player last dragged the view
  //   bonnet   null, or { ahead, height }: for a vehicle of its own size (a car), where the view from the bonnet is:
  //            metres ahead of the middle, and above the ground
  //   longer   metres a vehicle is longer than a keke (a car's): the views behind it stand that much further back
  //   running  on foot, how much of a run the player is going at (0 standing or walking, 1 at a full run)
  function update(dt, { cam, target, heading, indoors = null, room = null, dragged = 99, eyeHeight = 1.55, bonnet = null, longer = 0, running = 0 }) {
    const v = CAMERA_VIEW[view] || CAMERA_VIEW.street;
    const ease = toward(5, dt);
    live.run += ((v.run ? Math.max(0, Math.min(1, running)) : 0) - live.run) * toward(2.2, dt);
    let wantDist = v.dist === null || v.dist === undefined ? cam.dist * (v.scale || 1) : v.dist + (v.follow && !v.seat && CAMERA_VIEWS.vehicle.includes(view) ? longer : 0);
    let wantPitch = (v.pitch === null || v.pitch === undefined ? cam.pitch : v.pitch) + (v.pitchAdd || 0);
    if (v.run) { wantDist *= 1 - v.run.closer * live.run; wantPitch -= v.run.lower * live.run; }
    if (indoors && !v.seat) { wantPitch = Math.max(wantPitch, indoors.pitch); if (indoors.maxPitch !== undefined) wantPitch = Math.min(wantPitch, indoors.maxPitch); wantDist = Math.min(wantDist, indoors.dist); }
    live.dist += (wantDist - live.dist) * ease;
    live.pitch += (wantPitch - live.pitch) * ease;
    live.turn += ((v.turn || 0) - live.turn) * ease;
    live.shift += ((v.shift || 0) - live.shift) * ease;
    live.lift += ((v.lift || 0) - live.lift) * ease;
    live.seat += ((v.seat ? 1 : 0) - live.seat) * toward(6, dt);
    // how wide it sees: wider on the street, as the game it is modelled on does, without the stretch of a wide lens; in a
    // showroom's hall as it was (the hall's own views were made for it, and a wider lens there only draws more of it)
    const wantFov = room ? BASE_FOV : v.fov || BASE_FOV;
    live.fov += (wantFov - live.fov) * toward(4, dt);
    if (camera.isPerspectiveCamera && Math.abs(camera.fov - live.fov) > 0.01) { camera.fov = live.fov; camera.updateProjectionMatrix(); }
    // In a view that follows the heading, a drag looks about and then lets go.
    const before = live.yaw;
    if (v.follow) {
      if (dragged > 1.2) live.look += (0 - live.look) * toward(3, dt);
      const want = heading + live.turn + live.look;
      live.yaw += angleGap(want, live.yaw) * toward(7, dt);
      cam.yaw = live.yaw - live.turn;                           // so that walking stays relative to what is seen
    } else { live.look = 0; live.yaw += angleGap(cam.yaw + live.turn, live.yaw) * toward(v.sway ? 9 : 14, dt); }
    // a turn's sway: as the view comes round, it swings a little to the outside of the turn and settles back as the
    // turn ends (a few centimetres to a quarter of a metre; none when standing still, none in a vehicle)
    live.rate += ((dt > 0 ? angleGap(live.yaw, before) / dt : 0) - live.rate) * toward(6, dt);
    // (the yaw growing turns the view to its left, whose outside is its right: `rightX, rightZ` below)
    const wantSway = v.sway ? Math.max(-0.22, Math.min(0.22, live.rate * 0.16)) : 0;
    live.sway += (wantSway - live.sway) * toward(3.5, dt);
    // and at a run, the slightest rise and fall with the stride (a centimetre)
    live.bob += dt * 2 * Math.PI * 2.6;
    const bob = Math.sin(live.bob) * 0.01 * live.run;

    const yaw = live.yaw;
    // the point looked at, set off to one side for the over-the-shoulder views
    const rightX = -Math.cos(yaw), rightZ = Math.sin(yaw);
    const tx = target.x + rightX * live.shift, ty = target.y + live.lift, tz = target.z + rightZ * live.shift;
    // With a wall, a bus or a low roof behind, the camera does not come down into the player's head (where the
    // figure had to be left undrawn, and the player seemed to have vanished): it rises over what is in the way,
    // looking down, as high as it needs and no higher, and comes back down when the way is clear. On the street it
    // first comes in toward the player, as far as an arm's length and a little more, and only rises past that.
    // (not under a roof: there the camera keeps below the eaves, as before)
    // (in a hall the camera keeps inside: it comes in toward the player rather than rising through the ceiling)
    const riseWant = v.riseWant || RISE_WANT;
    const roofed = !!room || (!!blocked && (blocked(tx, tz, ty + 1.0) || blocked(tx, tz, ty + 2.4)));
    if (!v.seat && !roofed) {
      const clearAt = (p) => { const c = Math.cos(p); return clearance(tx, ty, tz, -Math.sin(yaw) * c, Math.sin(p), -Math.cos(yaw) * c, live.dist); };
      let need = 0;
      if (clearAt(live.pitch) < Math.min(live.dist, riseWant)) {
        need = Math.max(0, 1.45 - live.pitch);
        for (const step of RISE_STEPS) { const p = Math.min(1.45, live.pitch + step); if (clearAt(p) >= Math.min(live.dist, riseWant)) { need = p - live.pitch; break; } }
      }
      live.rise += (need - live.rise) * toward(need > live.rise ? 6 : 1.5, dt);
    } else live.rise += (0 - live.rise) * toward(6, dt);
    const pitch = live.pitch + live.rise;
    const cosP = Math.cos(pitch);
    const dx = -Math.sin(yaw) * cosP, dy = Math.sin(pitch), dz = -Math.cos(yaw) * cosP;
    // With something solid close behind, the camera comes in along its own line: quickly, so it is never
    // inside the wall, and out again slowly. Closer than arm's length it would be pressed against the back
    // of the player's head, so from there it sees with the player's eyes and the figure is not drawn.
    const space = v.seat ? live.dist : Math.min(clearance(tx, ty, tz, dx, dy, dz, live.dist), inRoom(room, tx, ty, tz, dx, dy, dz, live.dist));
    // In, it eases over a few frames rather than jumping, but is never left more than a hand's width inside
    // whatever is in the way; out, it takes its time, so a post passing behind does not make the view pump.
    live.arm = space < live.arm ? Math.max(space, Math.min(space + 0.12, live.arm + (space - live.arm) * toward(24, dt))) : live.arm + (space - live.arm) * toward(2.5, dt);
    close = live.arm < (close ? NEAR + 0.5 : NEAR);          // a little slack, so it does not flicker at the edge
    // on foot the figure is always drawn: where even the view from above is blocked (a doorway), the camera
    // stays at arm's length, never inside the head. Only a view from a seat sees with the player's own eyes.
    const near = close && !!v.seat;
    const dist = near ? Math.min(live.arm, 0.25) : Math.max(live.arm, v.seat ? 0 : 1.1);
    // (the sway moves the eye only, so the player stays where they are in the picture while the town swings past)
    const sway = live.sway * Math.min(1, live.arm / 2);
    eye.set(tx + dx * dist + rightX * sway, Math.max(0.5, ty + dy * dist + bob), tz + dz * dist + rightZ * sway);
    // never below the ground it stands over (a slope or a kerb behind)
    if (ground && !v.seat) { const g = ground(eye.x, eye.z); if (Number.isFinite(g)) eye.y = Math.max(eye.y, g + 0.35); }
    // (kept inside the hall's walls even at arm's length)
    if (room) { eye.x = Math.max(room.x0 + 0.15, Math.min(room.x1 - 0.15, eye.x)); eye.z = Math.max(room.z0 + 0.15, Math.min(room.z1 - 0.15, eye.z)); eye.y = Math.min(room.top - 0.15, eye.y); }
    aim.set(tx, ty, tz);
    if (live.seat > 0.002) {
      // from the seat: the eye is the player's own, looking where they face (and a little about, if dragged)
      const sy = heading + live.look;
      // (from the bonnet: the same, set forward past the front of the vehicle and a little lower)
      const own = bonnet && v.ahead ? bonnet : null;
      const ahead = own ? own.ahead : v.ahead || 0.18;
      const sx = target.x + Math.sin(heading) * ahead, sz = target.z + Math.cos(heading) * ahead;
      const seatEye = new THREE.Vector3(sx, own ? target.y - 1.55 + own.height : target.y + (eyeHeight - 1.55) + 0.05 + (v.rise || 0), sz);
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
    snap(cam) { live.dist = cam.dist; live.pitch = cam.pitch; live.yaw = cam.yaw; live.turn = 0; live.shift = 0; live.lift = 0; live.seat = 0; live.look = 0; live.arm = cam.dist; live.sway = 0; live.rate = 0; },
  };
}
