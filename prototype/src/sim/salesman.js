// The salesman of PostCivilWar PowerBike: where he walks and whom he faces, worked out the same way on every
// player's device from what they all share (who is in the hall and where, who is asking about which motorcycle,
// and the time of day by the clock), so that everyone in the showroom sees him do the same thing.
//
//   nobody in the hall              he waits at his desk
//   one or two customers            he keeps with one of them (the active customer: whoever is asking about a
//                                   motorcycle, otherwise the one he is with, otherwise the nearer), a step to
//                                   their side; when they stop at a motorcycle he comes round beside it to them
//   three or more                   he walks the floor, stopping now and then with whoever is near; he goes to
//                                   whoever asks about a motorcycle and stays with them while they talk
//
// Someone asking about a motorcycle (`talking`) has the phone's conversation open with him about it: he stands with
// them by it, facing them. Pure: no drawing, no page; the town's walls and stands come from the zone.
//
//   const s = createSalesman();
//   s.step(dt, { now, customers: [{ id, x, z, heading, talking: 'red-superbike' | null, since }] });
//   s.state   { x, z, heading, speed, mode, with, facing, talking }

import { POWERBIKE, inPowerbikeHall, powerbikeDisplayNear, zoneWalkable } from './zone.js';

export const SALESMAN = Object.freeze({
  name: POWERBIKE.salesman,
  walk: 1.25,                 // m/s, about the floor
  hurry: 1.7,                 // m/s, catching up with a customer who has gone on ahead
  turn: 5.5,                  // rad/s at most
  side: 1.45,                 // how far from a customer he stands
  radius: 0.34,               // how much room he takes, for the walls and the stands
  roamEvery: 9,               // seconds at each point of his walk round the floor, when the floor is busy
});

const CELL = 0.4;
const wrap = (a) => { let d = a % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };

// The floor as a grid, and the way across it between two points round the stands (A*, then cut short where a
// straight line is clear).
function createFloor() {
  const h = POWERBIKE.hall;
  const nx = Math.floor((h.x1 - h.x0) / CELL), nz = Math.floor((h.z1 - h.z0) / CELL);
  const open = new Uint8Array(nx * nz);
  const xOf = (i) => h.x0 + (i + 0.5) * CELL, zOf = (j) => h.z0 + (j + 0.5) * CELL;
  for (let j = 0; j < nz; j += 1) for (let i = 0; i < nx; i += 1) open[j * nx + i] = zoneWalkable(xOf(i), zOf(j), [], SALESMAN.radius) ? 1 : 0;
  const cellOf = (x, z) => [Math.max(0, Math.min(nx - 1, Math.floor((x - h.x0) / CELL))), Math.max(0, Math.min(nz - 1, Math.floor((z - h.z0) / CELL)))];
  const isOpen = (x, z) => { if (!inPowerbikeHall(x, z, SALESMAN.radius)) return false; const [i, j] = cellOf(x, z); return open[j * nx + i] === 1; };
  // the nearest open cell to a point (a target that falls on a stand is moved off it)
  function nearestOpen(x, z) {
    if (isOpen(x, z)) return { x, z };
    const [ci, cj] = cellOf(x, z);
    for (let r = 1; r < 12; r += 1) {
      let best = null;
      for (let dj = -r; dj <= r; dj += 1) for (let di = -r; di <= r; di += 1) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const i = ci + di, j = cj + dj;
        if (i < 0 || j < 0 || i >= nx || j >= nz || !open[j * nx + i]) continue;
        const d = Math.hypot(xOf(i) - x, zOf(j) - z);
        if (!best || d < best.d) best = { x: xOf(i), z: zOf(j), d };
      }
      if (best) return { x: best.x, z: best.z };
    }
    return { x: POWERBIKE.home.x, z: POWERBIKE.home.z };
  }
  function clearLine(ax, az, bx, bz) {
    const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / (CELL * 0.5)));
    for (let k = 1; k <= steps; k += 1) if (!isOpen(ax + ((bx - ax) * k) / steps, az + ((bz - az) * k) / steps)) return false;
    return true;
  }
  function route(ax, az, bx, bz) {
    const goal = nearestOpen(bx, bz);
    if (clearLine(ax, az, goal.x, goal.z)) return [goal];
    const from = nearestOpen(ax, az);
    const [si, sj] = cellOf(from.x, from.z), [gi, gj] = cellOf(goal.x, goal.z);
    const start = sj * nx + si, end = gj * nx + gi;
    const g = new Float32Array(nx * nz).fill(Infinity), came = new Int32Array(nx * nz).fill(-1), done = new Uint8Array(nx * nz);
    const heap = [];
    const push = (n, f) => { heap.push([f, n]); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
    const pop = () => { const top = heap[0]; const last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
    const hDist = (n) => Math.hypot((n % nx) - gi, Math.floor(n / nx) - gj);
    g[start] = 0; push(start, hDist(start));
    while (heap.length) {
      const [, n] = pop();
      if (done[n]) continue;
      done[n] = 1;
      if (n === end) break;
      const i = n % nx, j = Math.floor(n / nx);
      for (let dj = -1; dj <= 1; dj += 1) for (let di = -1; di <= 1; di += 1) {
        if (!di && !dj) continue;
        const a = i + di, b = j + dj;
        if (a < 0 || b < 0 || a >= nx || b >= nz) continue;
        const m = b * nx + a;
        if (!open[m] || done[m]) continue;
        if (di && dj && (!open[j * nx + a] || !open[b * nx + i])) continue;          // no corner cut past a stand
        const cost = g[n] + (di && dj ? Math.SQRT2 : 1);
        if (cost < g[m]) { g[m] = cost; came[m] = n; push(m, cost + hDist(m)); }
      }
    }
    if (came[end] < 0 && end !== start) return [goal];                                    // (no way round: straight at it)
    const cells = [];
    for (let n = end; n !== -1 && n !== start; n = came[n]) cells.push(n);
    cells.reverse();
    const points = cells.map((n) => ({ x: xOf(n % nx), z: zOf(Math.floor(n / nx)) }));
    points[points.length - 1] = goal;
    // cut corners where the straight way is clear
    const out = [];
    let ax0 = ax, az0 = az, k = 0;
    while (k < points.length) {
      let far = k;
      for (let m = points.length - 1; m > k; m -= 1) if (clearLine(ax0, az0, points[m].x, points[m].z)) { far = m; break; }
      out.push(points[far]);
      ax0 = points[far].x; az0 = points[far].z; k = far + 1;
    }
    return out;
  }
  return { route, nearestOpen, isOpen };
}

// Where to stand with customer `c`: a step to their side, the side nearer the motorcycle they are looking at if they
// are at one (so that they, he and it are together), otherwise the side nearer to where he is now.
function besideOf(c, floor, from) {
  const near = powerbikeDisplayNear(c.x, c.z, 2.2);
  const towardBike = near ? Math.atan2(near.display.x - c.x, near.display.z - c.z) : c.heading;
  let best = null;
  for (const off of [1.05, -1.05, 1.55, -1.55, 0.55, -0.55, 2.2, -2.2]) {
    const a = towardBike + off;
    const x = c.x + Math.sin(a) * SALESMAN.side, z = c.z + Math.cos(a) * SALESMAN.side;
    if (!floor.isOpen(x, z)) continue;
    const d = Math.hypot(x - from.x, z - from.z) + Math.abs(off) * 0.6;
    if (!best || d < best.d) best = { x, z, d };
  }
  return best || floor.nearestOpen(c.x + Math.sin(c.heading + 1.2) * SALESMAN.side, c.z + Math.cos(c.heading + 1.2) * SALESMAN.side);
}

export function createSalesman() {
  const floor = createFloor();
  const home = POWERBIKE.home;
  const state = { x: home.x, z: home.z, heading: home.heading, speed: 0, mode: 'home', with: null, facing: home.heading, talking: null, placed: true };
  let path = [], goal = null, routedAt = -1e9, chooseAt = -1e9;

  function setGoal(x, z, now, force = false) {
    const moved = !goal || Math.hypot(goal.x - x, goal.z - z) > 0.7;
    if (!moved && !force && now - routedAt < 2) return;
    goal = { x, z };
    routedAt = now;
    path = Math.hypot(x - state.x, z - state.z) < 0.25 ? [] : floor.route(state.x, state.z, x, z);
  }

  // `now`: the clock's seconds (the same on every device); `customers`: everyone in the hall, this player included
  function step(dt, { now, customers = [] }) {
    const inside = customers.filter((c) => inPowerbikeHall(c.x, c.z));
    const byId = new Map(inside.map((c) => [c.id, c]));
    // (ties are broken by where people stand, which every device sees alike: each knows the others by its own names)
    const talkers = inside.filter((c) => c.talking).sort((a, b) => (a.since || 0) - (b.since || 0) || a.x - b.x || a.z - b.z);
    let face = null, hurry = false;
    if (!inside.length) {
      state.mode = 'home'; state.with = null; state.talking = null;
      setGoal(home.x, home.z, now);
      face = home.heading;
    } else if (talkers.length) {
      // with whoever began asking first, at the motorcycle they are asking about
      const c = talkers[0];
      state.mode = 'talk'; state.with = c.id; state.talking = c.talking;
      const spot = besideOf(c, floor, state);
      setGoal(spot.x, spot.z, now);
      face = Math.atan2(c.x - state.x, c.z - state.z);
      hurry = Math.hypot(c.x - state.x, c.z - state.z) > 4;
    } else if (inside.length <= 2) {
      // the active customer: the one he is with, unless the other has been the nearer by some way for a while
      let c = byId.get(state.with) || null;
      if (!c || now - chooseAt > 4) {
        const nearest = [...inside].sort((a, b) => Math.hypot(a.x - state.x, a.z - state.z) - Math.hypot(b.x - state.x, b.z - state.z) || a.x - b.x || a.z - b.z)[0];
        if (!c || Math.hypot(nearest.x - state.x, nearest.z - state.z) + 3 < Math.hypot(c.x - state.x, c.z - state.z)) c = nearest;
        chooseAt = now;
      }
      state.with = c.id; state.talking = null;
      const atBike = powerbikeDisplayNear(c.x, c.z, 1.2);
      state.mode = atBike ? 'assist' : 'follow';
      const spot = besideOf(c, floor, state);
      setGoal(spot.x, spot.z, now);
      face = Math.atan2(c.x - state.x, c.z - state.z);
      hurry = Math.hypot(c.x - state.x, c.z - state.z) > 5;
    } else {
      // a busy floor: round it, a point at a time, the same point on every device at the same time; a little while at
      // each, with whoever is nearest, if anyone is
      state.mode = 'roam'; state.talking = null;
      const k = Math.floor(now / SALESMAN.roamEvery) % POWERBIKE.round.length;
      const p = POWERBIKE.round[k];
      setGoal(p.x, p.z, now);
      const near = inside.map((c) => ({ c, d: Math.hypot(c.x - state.x, c.z - state.z) })).sort((a, b) => a.d - b.d)[0];
      state.with = near && near.d < 4 ? near.c.id : null;
      face = state.with ? Math.atan2(near.c.x - state.x, near.c.z - state.z) : null;
    }

    // someone coming into a hall where others already are sees him where he is for everyone (`rejoin`), not walking
    // over from his desk; someone coming into an empty hall sees him come to them from it
    if (!state.placed) {
      state.placed = true;
      if (inside.length && goal) { state.x = goal.x; state.z = goal.z; path = []; if (face !== null) state.heading = face; }
    }

    // along the way
    let want = 0;
    if (path.length) {
      const next = path[0];
      const dx = next.x - state.x, dz = next.z - state.z, d = Math.hypot(dx, dz);
      if (d < 0.18) path.shift();
      else {
        const left = path.length > 1 ? d + 1 : d;
        const top = hurry ? SALESMAN.hurry : SALESMAN.walk;
        want = Math.min(top, Math.max(0.35, left * 1.4));
        const headTo = Math.atan2(dx, dz);
        state.heading += Math.max(-SALESMAN.turn * dt, Math.min(SALESMAN.turn * dt, wrap(headTo - state.heading)));
        // he goes along the clear line to the next point (never off it, into a stand), turning to face the way he
        // goes, and more slowly while he is still turning a corner
        const go = want * Math.max(0.25, Math.cos(wrap(headTo - state.heading)));
        const stepLen = Math.min(d, go * dt);
        state.x += (dx / d) * stepLen; state.z += (dz / d) * stepLen;
      }
    }
    state.speed += (want - state.speed) * Math.min(1, dt * 6);
    // standing: he turns to whoever he is with
    if (!path.length && face !== null) state.heading += Math.max(-SALESMAN.turn * dt * 0.6, Math.min(SALESMAN.turn * dt * 0.6, wrap(face - state.heading)));
    state.heading = wrap(state.heading);
    state.facing = face === null ? state.heading : face;
    return state;
  }

  return {
    state, step, floor,
    // the next step puts him straight where he would be by now (a player coming into a hall others are in)
    rejoin() { state.placed = false; path = []; goal = null; },
    // back at his desk, as when the showroom opens (a player coming into an empty hall)
    home() { state.x = home.x; state.z = home.z; state.heading = home.heading; state.speed = 0; state.with = null; state.placed = true; path = []; goal = null; },
  };
}
