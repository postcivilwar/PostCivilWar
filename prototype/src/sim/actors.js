// Townspeople taken out of their day for a while.
//
// Everyone in town follows a plan for the day. When something happens to
// them (they are struck and run, they see a fight and back away, a police
// officer is sent to a call) they are taken out of the plan and moved here,
// a step at a time, until they are let go and walk back to wherever their
// day says they should be. Nobody is ever moved in a jump.

import { ZONE_SPOTS, zoneWalkable } from './zone.js';
import { graphNearest, graphRoute, graphPoint, graphSize } from './graph.js';
import { POSE } from './population.js';

export const PACE = Object.freeze({ walk: 1.7, hurry: 3.2, run: 4.6, sprint: 5.2 });

// Is the straight line between two points clear of buildings and water?
export function clearLine(x0, z0, x1, z1, radius = 0.3) {
  const gap = Math.hypot(x1 - x0, z1 - z0);
  const steps = Math.max(1, Math.ceil(gap / 0.7));
  for (let i = 1; i <= steps; i += 1) if (!zoneWalkable(x0 + ((x1 - x0) * i) / steps, z0 + ((z1 - z0) * i) / steps, [], radius)) return false;
  return true;
}

// The way on foot from one point to another: straight if the line is clear,
// otherwise along the town's paths. Returns the points to pass through.
export function wayBetween(x0, z0, x1, z1) {
  if (clearLine(x0, z0, x1, z1)) return [[x1, z1]];
  const a = graphNearest(x0, z0), b = graphNearest(x1, z1);
  const nodes = graphRoute(a, b) || [b];
  const points = nodes.map((n) => graphPoint(n));
  // do not walk back to the first path node if the second can be reached directly, nor past the last one
  while (points.length > 1 && clearLine(x0, z0, points[1][0], points[1][1])) points.shift();
  while (points.length > 1 && clearLine(points[points.length - 2][0], points[points.length - 2][1], x1, z1)) points.pop();
  points.push([x1, z1]);
  return points;
}

export function wayLength(x0, z0, points) {
  let length = 0, x = x0, z = z0;
  for (const [px, pz] of points) { length += Math.hypot(px - x, pz - z); x = px; z = pz; }
  return length;
}

export function createActors({ state, population }) {
  if (!state.actors) state.actors = { list: {} };
  const list = state.actors.list;
  const people = population.people;
  const probe = {};

  const has = (i) => list[i] !== undefined;
  const get = (i) => list[i] || null;

  // Takes charge of someone from where they stand now (or from `from`, for someone indoors coming out of a door).
  function take(i, t, from = null) {
    if (list[i]) return list[i];
    const at = population.locate(i, t, probe);
    const indoors = at.pose === POSE.hidden;
    const start = from || (indoors ? null : at);
    if (!start) return null;
    list[i] = { i, x: start.x, z: start.z, h: at.h || 0, pose: POSE.stand, mode: 'hold', speed: 0, path: [], act: '', until: 0, follow: null, keep: 0, goal: null, moving: false, home: false, replan: 0 };
    return list[i];
  }

  function walkTo(i, x, z, speed = PACE.walk, act = '') {
    const m = list[i];
    if (!m) return null;
    if (m.dead) return m;
    m.path = wayBetween(m.x, m.z, x, z);
    m.goal = { x, z };
    m.speed = speed; m.mode = 'go'; m.follow = null; m.home = false;
    if (act) m.act = act;
    return m;
  }

  // Keeps `keep` metres from a moving target: `target()` gives { x, z } or null when there is nothing left to follow.
  function follow(i, who, keep = 1.4, speed = PACE.run, act = '') {
    const m = list[i];
    if (!m) return null;
    if (m.dead) return m;
    m.follow = who; m.keep = keep; m.speed = speed; m.mode = 'follow'; m.home = false; m.replan = 0;
    if (act) m.act = act;
    return m;
  }

  function hold(i, act = '', pose = POSE.stand, until = 0) {
    const m = list[i];
    if (!m) return null;
    if (m.dead) return m;
    m.mode = 'hold'; m.path = []; m.follow = null; m.pose = pose; m.until = until; m.home = false;
    if (act) m.act = act;
    return m;
  }

  // Runs from a point: to somewhere on the paths that is well away from it and not far from here.
  function flee(i, fromX, fromZ, speed = PACE.run, act = 'Running away', distance = 24) {
    const m = list[i];
    if (!m) return null;
    if (m.dead) return m;
    const ax = m.x - fromX, az = m.z - fromZ;
    const len = Math.hypot(ax, az) || 1;
    let best = null, bestScore = -Infinity;
    for (let n = 0; n < graphSize(); n += 1) {
      const [x, z] = graphPoint(n);
      const d = Math.hypot(x - m.x, z - m.z);
      if (d < distance * 0.5 || d > distance * 1.6) continue;
      // away from the danger, and not across it
      const away = ((x - m.x) * ax + (z - m.z) * az) / (len * d);
      const score = away * 2 - Math.abs(d - distance) / distance;
      if (score > bestScore) { bestScore = score; best = [x, z]; }
    }
    if (!best) best = [m.x + (ax / len) * 6, m.z + (az / len) * 6];
    walkTo(i, best[0], best[1], speed, act);
    return m;
  }

  // Lets someone go: they walk back to where their day has them, and are their own again when they get there.
  function release(i, act = '') {
    const m = list[i];
    if (!m || m.dead) return;
    m.home = true; m.follow = null; m.mode = 'go'; m.speed = PACE.walk; m.path = []; m.goal = null; m.replan = 0; m.pose = POSE.stand;
    m.act = act || 'Going back';
  }
  function drop(i) { if (list[i] && list[i].dead) return; delete list[i]; }
  // Someone killed: they lie where they fell, and nothing moves them, until they are taken away; after that
  // they are gone from the town for good (`gone`). Their day no longer has them anywhere.
  function kill(i, act = 'Dead') { const m = list[i]; if (!m) return null; m.mode = 'hold'; m.path = []; m.follow = null; m.pose = POSE.lie; m.until = 0; m.home = false; m.act = act; m.dead = true; m.moving = false; return m; }
  function remove(i) { const m = list[i]; if (!m || !m.dead) return; m.pose = POSE.hidden; m.act = 'Taken to the mortuary'; m.gone = true; }
  const dead = (i) => !!(list[i] && list[i].dead);

  function advance(m, budget) {
    let moved = false;
    while (budget > 0 && m.path.length) {
      const [tx, tz] = m.path[0];
      const dx = tx - m.x, dz = tz - m.z;
      const gap = Math.hypot(dx, dz);
      if (gap <= budget) { m.x = tx; m.z = tz; budget -= gap; m.path.shift(); if (gap > 0.001) moved = true; } else { m.x += (dx / gap) * budget; m.z += (dz / gap) * budget; m.h = Math.atan2(dx, dz); budget = 0; moved = true; }
    }
    return moved;
  }

  function tick(dt, t, real) {
    for (const key of Object.keys(list)) {
      const m = list[key];
      m.moving = false;
      if (m.dead) continue;
      if (m.mode === 'hold') { if (m.until && real >= m.until) release(m.i); continue; }
      if (m.mode === 'follow') {
        const target = m.follow && typeof m.follow === 'object' ? m.follow : null;
        const at = target ? resolve(target) : null;
        if (!at) { hold(m.i); continue; }
        const d = Math.hypot(at.x - m.x, at.z - m.z);
        m.h = d > 0.05 ? Math.atan2(at.x - m.x, at.z - m.z) : m.h;
        if (d <= m.keep) { m.path = []; continue; }
        m.replan -= dt;
        if (m.replan <= 0 || !m.path.length) {
          m.path = wayBetween(m.x, m.z, at.x, at.z);
          m.replan = 0.6;
        }
        // stop `keep` short of them
        const room = Math.max(0, wayLength(m.x, m.z, m.path) - m.keep);
        m.moving = advance(m, Math.min(m.speed * dt, room));
        continue;
      }
      // going somewhere
      if (m.home) {
        m.replan -= dt;
        if (m.replan <= 0) {
          const plan = population.planned(m.i, t, probe);
          if (Math.hypot(plan.x - m.x, plan.z - m.z) < 1.6) { drop(m.i); continue; }
          m.path = wayBetween(m.x, m.z, plan.x, plan.z);
          m.replan = plan.moving ? 1.5 : 6;
        }
      }
      m.moving = advance(m, m.speed * dt);
      if (!m.path.length) {
        if (m.home) { m.replan = 0; continue; }
        m.mode = 'hold'; m.arrived = real;
      }
    }
  }

  // who or what is being followed, as a point
  let resolver = () => null;
  const resolve = (target) => resolver(target);

  // Tells the population where someone in our charge is.
  function hook(i, t, out) {
    const m = list[i];
    if (!m) return false;
    population.planned(i, t, out);          // their spot and the rest, as their day has it
    out.x = m.x; out.z = m.z; out.h = m.h;
    out.pose = m.moving ? POSE.walk : m.pose;
    out.moving = m.moving;
    out.leg = null;
    out.act = m.act || out.act;
    if (!ZONE_SPOTS[out.spot]) out.spot = people[i].homeSpot;
    return true;
  }
  population.addHook(hook, true);

  return {
    take, has, get, walkTo, follow, hold, flee, release, drop, tick, hook, kill, remove, dead,
    // how to find the thing an actor is following: ({ kind, id }) => { x, z } | null
    setResolver(fn) { resolver = fn; },
    count: () => Object.keys(list).length,
    all: () => Object.values(list),
  };
}
