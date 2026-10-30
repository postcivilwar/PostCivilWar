// Buildings people can walk into.
//
// A zone describes a building in a line or two: where it stands, which way
// it faces and what its rooms are for. The functions here turn that into
// what the simulation and the renderer both need: wall segments with door
// gaps (which are colliders), furniture, and named spots where people sit,
// stand and lie. Nothing here knows about any particular town.
//
// Positions inside a building are worked out in its own frame: `u` runs
// along the building and `v` runs in from the door side.

export const WALL = 0.25;        // wall thickness, metres
export const DOOR = 1.9;         // a doorway
export const VERANDA = 2.2;

const FRAMES = {
  s: (r) => ({ ox: r.x0, oz: r.z1, ax: 1, az: 0, nx: 0, nz: -1, length: r.x1 - r.x0, depth: r.z1 - r.z0 }),
  n: (r) => ({ ox: r.x0, oz: r.z0, ax: 1, az: 0, nx: 0, nz: 1, length: r.x1 - r.x0, depth: r.z1 - r.z0 }),
  e: (r) => ({ ox: r.x1, oz: r.z0, ax: 0, az: 1, nx: -1, nz: 0, length: r.z1 - r.z0, depth: r.x1 - r.x0 }),
  w: (r) => ({ ox: r.x0, oz: r.z0, ax: 0, az: 1, nx: 1, nz: 0, length: r.z1 - r.z0, depth: r.x1 - r.x0 }),
};

const round2 = (n) => Math.round(n * 100) / 100;

function framer(f) {
  const at = (u, v) => [round2(f.ox + f.ax * u + f.nx * v), round2(f.oz + f.az * u + f.nz * v)];
  const box = (u0, v0, u1, v1) => {
    const [ax, az] = at(u0, v0);
    const [bx, bz] = at(u1, v1);
    return { x0: Math.min(ax, bx), z0: Math.min(az, bz), x1: Math.max(ax, bx), z1: Math.max(az, bz) };
  };
  // the heading of someone facing (du along, dv inward)
  const dir = (du, dv) => Math.atan2(f.ax * du + f.nx * dv, f.az * du + f.nz * dv);
  return { at, box, dir };
}

// Collects what one building holds.
function shell(f) {
  const F = framer(f);
  const out = { walls: [], doors: [], items: [], spots: [] };
  const put = (kind, u, v, du, dv, h, facing = 0, solid = true, more = null) => {
    const [x, z] = F.at(u, v);
    const item = { kind, x, z, sx: round2(Math.abs(f.ax) * du + Math.abs(f.nx) * dv), sz: round2(Math.abs(f.az) * du + Math.abs(f.nz) * dv), h, facing: round2(facing), solid };
    if (more) Object.assign(item, more);
    out.items.push(item);
    return item;
  };
  const spot = (room, slot, u, v, facing, pose = 'stand', via = null) => {
    const [x, z] = F.at(u, v);
    const s = { room, slot, x, z, facing: round2(facing), pose };
    if (via) s.via = via.map(([a, b]) => F.at(a, b));
    out.spots.push(s);
    return s;
  };
  return { F, out, put, spot };
}

// ---------------------------------------------------------------- rooms --

// What goes in a room of each kind. `r` has u0, u1 (its span along the
// building), d (depth) and mid (the door's position along the building).
const FURNISH = {
  classroom({ F, put, spot }, r) {
    const cv = r.d / 2;
    put('board', r.u0 + 0.22, cv, 0.08, Math.min(3.4, r.d - 2), 1.3, F.dir(1, 0), false);
    put('table', r.u0 + 1.7, r.d - 1.5, 0.7, 1.3, 0.76, F.dir(1, 0));
    spot(r.i, 'teacher', r.u0 + 1.25, cv - 0.6, F.dir(1, 0), 'stand', [[r.u0 + 2.2, 1.15]]);
    for (let u = r.u0 + 3.0; u <= r.u1 - 0.85; u += 1.1) {
      for (let v = 2.05; v <= r.d - 1.0; v += 1.5) {
        put('desk', u, v, 0.42, 1.15, 0.7, F.dir(-1, 0));
        put('bench', u + 0.46, v, 0.26, 1.15, 0.42, F.dir(-1, 0), false);
        // a pupil walks along the door wall, then down between the rows
        for (const side of [-0.29, 0.29]) spot(r.i, 'seat', u + 0.46, v + side, F.dir(-1, 0), 'sit', [[u + 0.46, 1.1]]);
      }
    }
  },
  lecture({ F, put, spot }, r) {
    const cv = r.d / 2;
    put('board', r.u0 + 0.22, cv, 0.08, Math.min(4.6, r.d - 2), 1.4, F.dir(1, 0), false);
    put('lectern', r.u0 + 1.8, cv + 1.4, 0.5, 0.6, 1.1, F.dir(1, 0));
    spot(r.i, 'teacher', r.u0 + 1.5, cv - 0.4, F.dir(1, 0), 'stand', [[r.u0 + 2.7, 1.2]]);
    for (let u = r.u0 + 4.0; u <= r.u1 - 0.9; u += 1.15) {
      for (const [v0, v1] of [[1.9, cv - 0.55], [cv + 0.55, r.d - 0.6]]) {
        if (v1 - v0 < 1) continue;
        put('desk', u, (v0 + v1) / 2, 0.34, v1 - v0, 0.72, F.dir(-1, 0));
        put('bench', u + 0.42, (v0 + v1) / 2, 0.26, v1 - v0, 0.42, F.dir(-1, 0), false);
        for (let v = v0 + 0.32; v <= v1 - 0.28; v += 0.66) spot(r.i, 'seat', u + 0.42, v, F.dir(-1, 0), 'sit', [[u + 0.42, 1.3]]);
      }
    }
  },
  lab({ F, put, spot }, r) {
    const cv = r.d / 2 + 0.3;
    put('shelf', (r.u0 + r.u1) / 2, r.d - 0.42, Math.min(5, r.u1 - r.u0 - 2), 0.4, 1.9, F.dir(0, -1));
    spot(r.i, 'teacher', r.u0 + 1.1, cv, F.dir(1, 0), 'stand', [[r.u0 + 1.1, 1.3]]);
    for (let u = r.u0 + 2.8; u <= r.u1 - 1.4; u += 2.4) {
      put('labbench', u, cv, 0.85, Math.min(3.4, r.d - 3.4), 0.9, F.dir(1, 0));
      for (const dv of [-1.1, 0, 1.1]) {
        spot(r.i, 'seat', u - 0.78, cv + dv, F.dir(1, 0), 'stand', [[u - 0.78, 1.3]]);
        spot(r.i, 'seat', u + 0.78, cv + dv, F.dir(-1, 0), 'stand', [[u + 0.78, 1.3]]);
      }
    }
  },
  office({ F, put, spot }, r) {
    const desks = r.u1 - r.u0 >= 8.5 ? [(r.u0 * 2 + r.u1) / 3 - 0.4, (r.u0 + r.u1 * 2) / 3 + 0.4] : [(r.u0 + r.u1) / 2 + 0.9];
    for (const u of desks) {
      put('table', u, r.d - 2.0, 1.5, 0.75, 0.76, F.dir(0, -1));
      spot(r.i, 'desk', u, r.d - 1.38, F.dir(0, -1), 'sit', [[u + 1.1, r.d - 2.6], [u + 1.1, r.d - 1.38]]);
      spot(r.i, 'visitor', u - 0.1, r.d - 2.95, F.dir(0, 1), 'sit');
    }
    put('cabinet', r.u0 + 0.75, r.d - 0.5, 0.9, 0.45, 1.8, F.dir(0, -1));
  },
  staffroom({ F, put, spot }, r) {
    const cu = (r.u0 + r.u1) / 2;
    const len = Math.min(4.4, r.u1 - r.u0 - 3);
    const cv = r.d / 2 + 0.6;
    put('table', cu, cv, len, 1.2, 0.76, F.dir(0, -1));
    for (let u = cu - len / 2 + 0.5; u <= cu + len / 2 - 0.4; u += 0.95) {
      spot(r.i, 'seat', u, cv - 0.95, F.dir(0, 1), 'sit');
      spot(r.i, 'seat', u, cv + 0.95, F.dir(0, -1), 'sit', [[cu - len / 2 - 0.6, cv - 0.9], [cu - len / 2 - 0.6, cv + 0.95]]);
    }
    put('cabinet', r.u1 - 0.75, r.d - 0.5, 0.9, 0.45, 1.8, F.dir(0, -1));
  },
  reception({ F, put, spot }, r) {
    const cv = r.d / 2 + 0.5;
    put('counter', r.u0 + 2.3, cv, 0.6, 3.2, 1.05, F.dir(1, 0));
    for (const dv of [-0.8, 0.8]) spot(r.i, 'desk', r.u0 + 1.45, cv + dv, F.dir(1, 0), 'sit', [[r.u0 + 1.2, 1.3]]);
    spot(r.i, 'queue', r.u0 + 3.25, cv - 0.6, F.dir(-1, 0));
    spot(r.i, 'queue', r.u0 + 3.25, cv + 0.7, F.dir(-1, 0));
    for (let u = r.u0 + 5.4; u <= r.u1 - 1.0; u += 1.45) {
      for (const v of [2.5, r.d - 1.5]) {
        if (v > r.d - 1.2) continue;
        put('bench', u, v, 0.42, 2.1, 0.44, F.dir(-1, 0), false);
        for (const dv of [-0.68, 0, 0.68]) spot(r.i, 'wait', u, v + dv, F.dir(-1, 0), 'sit');
      }
    }
  },
  consulting({ F, put, spot }, r) {
    const cu = (r.u0 + r.u1) / 2;
    put('table', cu + 0.7, r.d - 2.2, 1.4, 0.7, 0.76, F.dir(0, -1));
    spot(r.i, 'desk', cu + 0.7, r.d - 1.6, F.dir(0, -1), 'sit', [[cu + 1.8, r.d - 2.8], [cu + 1.8, r.d - 1.6]]);
    spot(r.i, 'patient', cu - 0.5, r.d - 2.3, F.dir(1, 0), 'sit');
    put('bed', r.u0 + 1.25, r.d - 0.8, 1.9, 0.75, 0.6, F.dir(1, 0), true, { style: 'couch' });
    spot(r.i, 'couch', r.u0 + 1.25, r.d - 0.8, F.dir(-1, 0), 'lie');
  },
  ward({ F, put, spot }, r) {
    // beds along the back wall, and along the front wall either side of the door
    for (let u = r.u0 + 1.3; u <= r.u1 - 1.0; u += 2.25) {
      put('bed', u, r.d - 1.3, 0.95, 2.0, 0.55, F.dir(0, -1), true, { style: 'ward' });
      spot(r.i, 'bed', u, r.d - 1.3, F.dir(0, 1), 'lie');
      spot(r.i, 'bedside', u + 0.85, r.d - 1.7, F.dir(-1, 0.3), 'stand', [[u + 0.85, r.d - 2.8]]);
      if (Math.abs(u - r.mid) > 2.2) {
        put('bed', u, 1.35, 0.95, 2.0, 0.55, F.dir(0, 1), true, { style: 'ward' });
        spot(r.i, 'bed', u, 1.35, F.dir(0, -1), 'lie');
        spot(r.i, 'bedside', u + 0.85, 1.75, F.dir(-1, -0.3), 'stand', [[r.mid, 2.9], [u + 0.85, 2.9]]);
      }
    }
    put('table', r.mid + 2.2, r.d / 2, 1.2, 0.6, 0.76, F.dir(0, -1));
    spot(r.i, 'desk', r.mid + 2.2, r.d / 2 + 0.55, F.dir(0, -1), 'sit', [[r.mid + 1.2, r.d / 2 + 0.55]]);
  },
  emergency({ F, put, spot }, r) {
    for (let u = r.u0 + 1.5; u <= r.u1 - 1.2 && u < r.u0 + 8; u += 2.6) {
      put('bed', u, r.d - 1.3, 0.9, 2.0, 0.75, F.dir(0, -1), true, { style: 'trolley' });
      spot(r.i, 'bed', u, r.d - 1.3, F.dir(0, 1), 'lie');
      spot(r.i, 'bedside', u + 0.85, r.d - 1.7, F.dir(-1, 0.3), 'stand', [[u + 0.85, r.d - 2.8]]);
    }
    put('cabinet', r.u1 - 0.75, r.d - 0.5, 0.9, 0.45, 1.8, F.dir(0, -1));
    put('table', r.u1 - 1.5, 1.8, 1.2, 0.6, 0.76, F.dir(-1, 0));
    spot(r.i, 'desk', r.u1 - 1.5, 2.5, F.dir(0, -1), 'sit', [[r.u1 - 2.7, 2.5]]);
  },
  pharmacy({ F, put, spot }, r) {
    const cu = (r.u0 + r.u1) / 2;
    const len = r.u1 - r.u0 - 1.4;
    put('counter', cu, r.d * 0.48, len, 0.55, 1.05, F.dir(0, -1));
    put('shelf', cu, r.d - 0.42, len, 0.4, 2.0, F.dir(0, -1), true, { style: 'medicine' });
    spot(r.i, 'desk', cu + 0.6, r.d * 0.48 + 0.8, F.dir(0, -1), 'stand', [[r.u0 + 0.36, r.d * 0.48 - 0.7], [r.u0 + 0.36, r.d * 0.48 + 0.8]]);
    spot(r.i, 'customer', cu - 0.2, r.d * 0.48 - 0.85, F.dir(0, 1));
    spot(r.i, 'customer', cu + 1.0, r.d * 0.48 - 0.95, F.dir(0, 1));
  },
  toilet({ put, F }, r) {
    for (let u = r.u0 + 1.0; u <= r.u1 - 0.8; u += 1.3) put('cubicle', u, r.d - 1.0, 1.1, 1.5, 1.9, F.dir(0, -1));
  },
  library({ F, put, spot }, r) {
    put('table', r.u0 + 1.6, 2.1, 1.4, 0.7, 0.76, F.dir(1, 0));
    spot(r.i, 'desk', r.u0 + 1.6, 2.7, F.dir(0, -1), 'sit', [[r.u0 + 2.7, 1.5], [r.u0 + 2.7, 2.7]]);
    let u = r.u0 + 1.4;
    for (let k = 0; k < 4 && u < r.u1 - 8; k += 1, u += 1.7) put('shelf', u, r.d - 2.3, 0.42, 3.4, 2.0, F.dir(1, 0), true, { style: 'books' });
    for (u += 1.6; u <= r.u1 - 1.7; u += 3.3) {
      for (const v of [2.6, r.d - 2.2]) {
        put('table', u, v, 2.3, 1.0, 0.76, F.dir(0, -1));
        // round the end of the table, not across it
        for (const du of [-0.6, 0.6]) for (const dv of [-0.85, 0.85]) spot(r.i, 'seat', u + du, v + dv, F.dir(0, -dv), 'sit', v + dv < 2 ? null : [[u + 1.65, 1.5], [u + 1.65, v + dv]]);
      }
    }
  },
  workshop({ F, put, spot }, r) {
    spot(r.i, 'teacher', r.u0 + 1.4, r.d / 2, F.dir(1, 0), 'stand', [[r.u0 + 1.4, 1.4]]);
    let n = 0;
    for (let u = r.u0 + 3.4; u <= r.u1 - 1.6; u += 3.0) {
      for (const v of [2.8, r.d - 2.2]) {
        put(n % 3 === 2 ? 'machine' : 'workbench', u, v, 1.7, 0.8, 0.9, F.dir(0, -1));
        spot(r.i, 'seat', u - 0.4, v - 0.85, F.dir(0, 1), 'stand', v - 0.85 < 2.1 ? null : [[u - 1.5, 1.5], [u - 1.5, v - 0.85]]);
        spot(r.i, 'seat', u + 0.5, v + 0.85, F.dir(0, -1), 'stand', [[u + 1.5, 1.5], [u + 1.5, v + 0.85]]);
        n += 1;
      }
    }
  },
  cafeteria({ F, put, spot }, r) {
    const cv = r.d / 2 + 0.4;
    put('counter', r.u0 + 2.3, cv, 0.6, Math.min(4.2, r.d - 3), 1.05, F.dir(1, 0), true, { style: 'food' });
    spot(r.i, 'desk', r.u0 + 1.4, cv, F.dir(1, 0), 'stand', [[r.u0 + 1.2, 1.3]]);
    spot(r.i, 'queue', r.u0 + 3.25, cv, F.dir(-1, 0), 'stand', [[r.u0 + 3.6, 1.4]]);
    for (let u = r.u0 + 5.6; u <= r.u1 - 1.3; u += 2.6) {
      for (const v of [2.6, r.d - 2.0]) {
        put('table', u, v, 1.5, 0.8, 0.76, F.dir(0, -1));
        for (const du of [-0.4, 0.4]) for (const dv of [-0.72, 0.72]) spot(r.i, 'seat', u + du, v + dv, F.dir(0, -dv), 'sit', v + dv < 2 ? null : [[u + 1.3, 1.5], [u + 1.3, v + dv]]);
      }
    }
  },
  hall({ F, put, spot }, r) {
    spot(r.i, 'teacher', r.u0 + 1.4, r.d / 2, F.dir(1, 0));
    for (let u = r.u0 + 3.6; u <= r.u1 - 0.9; u += 1.2) {
      for (const v of [2.4, r.d - 1.7]) {
        if (r.d - 1.7 - 2.4 < 1.5 && v > 2.4) continue;
        put('bench', u, v, 0.34, 2.0, 0.44, F.dir(-1, 0), false);
        for (const dv of [-0.66, 0, 0.66]) spot(r.i, 'seat', u, v + dv, F.dir(-1, 0), 'sit');
      }
    }
  },
};

// A block: a row of rooms under one roof, each with its own door onto a
// veranda along the `face` side. `rooms` is a list of [kind, name, length];
// the last room takes whatever length is left.
export function makeBlock({ id, name, sign = '', x0, z0, x1, z1, face, rooms, h = 3.4, wall = 0xe9dfc8, roof = 0x7a2f22, storeys = 1 }) {
  const f = FRAMES[face]({ x0, z0, x1, z1 });
  const kit = shell(f);
  const { F, out } = kit;
  const made = [];
  let u = 0;
  rooms.forEach(([kind, roomName, length], i) => {
    const u0 = u;
    const u1 = i === rooms.length - 1 ? f.length : Math.min(f.length, u + length);
    u = u1;
    const mid = (u0 + u1) / 2;
    const [dx, dz] = F.at(mid, WALL / 2);
    const r = { i, id: `${id}.${i}`, kind, name: roomName, u0: u0 + WALL / 2, u1: u1 - WALL / 2, d: f.depth - WALL, mid, door: { x: dx, z: dz, alongX: f.ax !== 0, width: DOOR }, in: F.at(mid, 1.05), out: F.at(mid, -1.25), ...F.box(u0, 0, u1, f.depth) };
    made.push(r);
    out.doors.push(r.door);
    if (i > 0) out.walls.push(F.box(u0 - WALL / 2, 0, u0 + WALL / 2, f.depth));
    // the front wall of this room, either side of its door
    out.walls.push(F.box(u0, 0, mid - DOOR / 2, WALL));
    out.walls.push(F.box(mid + DOOR / 2, 0, u1, WALL));
    if (FURNISH[kind]) FURNISH[kind](kit, r);
  });
  out.walls.push(F.box(0, f.depth - WALL, f.length, f.depth));        // back
  out.walls.push(F.box(0, 0, WALL, f.depth));                           // ends
  out.walls.push(F.box(f.length - WALL, 0, f.length, f.depth));
  // the veranda walk, from just past one end to just past the other
  const walk = [F.at(-1.4, -1.25), ...made.map((r) => r.out), F.at(f.length + 1.4, -1.25)];
  return { id, kind: 'block', name, sign, x0, z0, x1, z1, face, h, wall, roof, storeys, frame: f, rooms: made, walk, veranda: F.box(0, -VERANDA, f.length, 0), ...out };
}

// A church: a long nave with the main door in the front end, pews either side
// of a centre aisle, a raised sanctuary with the altar at the far end, an apse
// behind it and a bell tower beside the front. `front` is the side the main
// door is on.
const CHURCH_FRAMES = {
  s: (r) => ({ ox: r.x0, oz: r.z1, ax: 0, az: -1, nx: 1, nz: 0, length: r.z1 - r.z0, depth: r.x1 - r.x0 }),
  n: (r) => ({ ox: r.x1, oz: r.z0, ax: 0, az: 1, nx: -1, nz: 0, length: r.z1 - r.z0, depth: r.x1 - r.x0 }),
  e: (r) => ({ ox: r.x1, oz: r.z1, ax: -1, az: 0, nx: 0, nz: -1, length: r.x1 - r.x0, depth: r.z1 - r.z0 }),
  w: (r) => ({ ox: r.x0, oz: r.z0, ax: 1, az: 0, nx: 0, nz: 1, length: r.x1 - r.x0, depth: r.z1 - r.z0 }),
};

export function makeChurch({ id, name, sign = '', x0, z0, x1, z1, front, style = 'catholic', tower = 'left', h = 6.4, wall = 0xefe6d2, roof = 0x7a2f22 }) {
  const f = CHURCH_FRAMES[front]({ x0, z0, x1, z1 });
  const kit = shell(f);
  const { F, out, put, spot } = kit;
  const L = f.length;
  const W = f.depth;
  const c = W / 2;
  const mainDoor = 2.6;
  const pewEnd = L * 0.66;
  const sideAt = pewEnd + 1.1;
  // walls: front with the main door, two sides (one with a side door), the back
  out.walls.push(F.box(0, 0, WALL, c - mainDoor / 2), F.box(0, c + mainDoor / 2, WALL, W));
  out.walls.push(F.box(0, 0, L, WALL));
  out.walls.push(F.box(0, W - WALL, sideAt - DOOR / 2, W), F.box(sideAt + DOOR / 2, W - WALL, L, W));
  out.walls.push(F.box(L - WALL, 0, L, W));
  const [mx, mz] = F.at(WALL / 2, c);
  const [sx, sz] = F.at(sideAt, W - WALL / 2);
  out.doors.push({ x: mx, z: mz, alongX: f.nx !== 0, width: mainDoor, arched: true }, { x: sx, z: sz, alongX: f.ax !== 0, width: DOOR });

  // pews, with a clear aisle up the middle
  const half = c - 1.25 - 0.8;
  const aisles = [];
  for (let u = 3.6; u <= pewEnd; u += 1.45) {
    aisles.push(u);
    for (const side of [-1, 1]) {
      const cv = c + side * (1.25 + half / 2);
      put('pew', u, cv, 0.5, half, 0.9, F.dir(1, 0));
      for (let k = 0; k * 0.72 + 0.4 < half; k += 1) spot(0, 'pew', u - 0.08, c + side * (1.45 + k * 0.72), F.dir(1, 0), 'sit', [[u - 0.72, c], [u - 0.72, c + side * (1.45 + k * 0.72)]]);
    }
  }
  // the sanctuary: a dais, the altar, the ambo, the tabernacle
  const dais = L * 0.74;
  put('dais', (dais + L - WALL) / 2, c, L - WALL - dais, W - WALL * 2, 0.3, F.dir(-1, 0), false);
  put('altar', L * 0.85, c, 1.0, 2.6, 1.0, F.dir(-1, 0), true, { style });
  spot(0, 'priest', L * 0.85 + 1.0, c, F.dir(-1, 0), 'stand', [[dais - 0.6, c], [dais + 0.4, c + 2.2], [L * 0.85 + 1.0, c + 2.2]]);
  put('ambo', dais + 0.9, c - 3.0, 0.6, 0.7, 1.25, F.dir(-1, 0));
  spot(0, 'lector', dais + 1.55, c - 3.0, F.dir(-1, 0), 'stand', [[dais - 0.6, c], [dais + 0.4, c - 1.8]]);
  put(style === 'catholic' ? 'tabernacle' : 'cross-table', L - 0.75, c, 0.6, 0.9, 1.5, F.dir(-1, 0), true, { style });
  for (let k = 0; k < 8; k += 1) spot(0, 'choir', pewEnd + 1.3 + Math.floor(k / 4) * 0.9, 1.2 + (k % 4) * 0.75, F.dir(0.6, 1), 'stand', [[pewEnd + 1.1, c]]);
  for (let k = 0; k < 4; k += 1) spot(0, 'kneel', dais - 0.7, c - 1.5 + k * 1.0, F.dir(1, 0), 'stand', [[dais - 1.3, c]]);
  put('font', 2.0, W - 1.6, 0.8, 0.8, 1.0, F.dir(1, 0));
  if (style === 'catholic') put('confessional', L * 0.3, 0.95, 1.6, 1.1, 2.2, F.dir(0, 1));
  spot(0, 'door', 1.6, c + 2.0, F.dir(-1, -0.4));
  // standing room at the back and down the sides, for a full church
  for (let k = 0; k < 10; k += 1) spot(0, 'stand', 2.3 + (k % 2) * 0.8, c + (k < 5 ? -1 : 1) * (1.7 + Math.floor((k % 5)) * 0.8), F.dir(1, 0));
  for (let u = 4.3; u <= pewEnd; u += 2.9) for (const side of [-1, 1]) if (side > 0 || style !== 'catholic' || Math.abs(u - L * 0.3) > 1.6) spot(0, 'stand', u, c + side * (c - 0.62), F.dir(1, side * -0.25));

  // the tower stands beside the front, outside the nave
  const t = 4.4;
  const towerBox = tower === 'left' ? F.box(-0.3, -t, t - 0.3, 0) : F.box(-0.3, W, t - 0.3, W + t);
  const bell = tower === 'left' ? F.at(-1.3, -t / 2) : F.at(-1.3, W + t / 2);
  const apse = F.box(L, c - W * 0.3, L + 3.2, c + W * 0.3);
  const room = { i: 0, id: `${id}.0`, kind: 'nave', name, in: F.at(1.5, c), out: F.at(-2.4, c), aisle: F.at(sideAt, c), side: { in: F.at(sideAt, W - 1.4), out: F.at(sideAt, W + 1.5) }, x0, z0, x1, z1 };
  out.spots.push({ room: 0, slot: 'bell', x: bell[0], z: bell[1], facing: F.dir(-1, 0), pose: 'stand', outside: true });
  return { id, kind: 'church', name, sign, style, x0, z0, x1, z1, front, h, wall, roof, frame: f, rooms: [room], tower: { ...towerBox, h: h + 7.5, side: tower }, apse, walk: [room.out], pewRows: aisles.length, ...out };
}

// A compound wall with gates. `gates` are [side, at, width]: the side of the
// rectangle, the position along it, and the opening.
export function makeFence({ x0, z0, x1, z1 }, gates, thick = 0.3) {
  const walls = [];
  const openings = [];
  const run = (side, a, b, fixed) => {
    const cuts = gates.filter((g) => g[0] === side).map((g) => [g[1] - g[2] / 2, g[1] + g[2] / 2]).sort((p, q) => p[0] - q[0]);
    let from = a;
    const seg = (p, q) => { if (q - p > 0.2) walls.push(side === 'n' || side === 's' ? { x0: p, x1: q, z0: fixed - thick / 2, z1: fixed + thick / 2 } : { x0: fixed - thick / 2, x1: fixed + thick / 2, z0: p, z1: q }); };
    for (const [c0, c1] of cuts) { seg(from, c0); from = c1; }
    seg(from, b);
    for (const g of gates.filter((g2) => g2[0] === side)) openings.push(side === 'n' || side === 's' ? { x: g[1], z: fixed, alongX: true, width: g[2], side } : { x: fixed, z: g[1], alongX: false, width: g[2], side });
  };
  run('n', x0, x1, z0);
  run('s', x0, x1, z1);
  run('w', z0, z1, x0);
  run('e', z0, z1, x1);
  return { walls, gates: openings };
}

// The bench by a plain house's door, where its people sit out in the evening (render-town.js draws it here; the town's
// spots seat one of them on it): its middle, which way it runs (along x or along z), and how high its seat is.
export function houseBench(hs) {
  const [ox, oz] = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] }[hs.door];
  const alongX = oz !== 0;
  const fx = hs.x + ox * hs.w / 2, fz = hs.z + oz * hs.d / 2;
  return { x: fx + (alongX ? 1.9 : ox * 0.5), z: fz + (alongX ? oz * 0.5 : 1.9), alongX, length: 1.5, depth: 0.35, top: 0.45 };
}

// A plain house: a box with one door, which is where its people come and go.
export function houseDoor(hs) {
  const out = 1.6;
  if (hs.door === 's') return { x: hs.x, z: hs.z + hs.d / 2 + out, facing: 0 };
  if (hs.door === 'n') return { x: hs.x, z: hs.z - hs.d / 2 - out, facing: Math.PI };
  if (hs.door === 'e') return { x: hs.x + hs.w / 2 + out, z: hs.z, facing: Math.PI / 2 };
  return { x: hs.x - hs.w / 2 - out, z: hs.z, facing: -Math.PI / 2 };
}
