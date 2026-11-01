// Levels (31 October 2026, Oganiru City's flyovers: "a vehicle or a person always stays on the level it is on, never
// popping up or dropping through"). Where a flyover passes over a road, a point on the map has two surfaces: the road
// and the deck. What a player stands on, or drives, is the surface they were already on, carried on from step to step
// (zone.js zoneSurfaceY: the highest under them no more than a step above where they were). The town keeps, for each
// player and each thing they move, where it last knew their level (`lv`: the place and the height there); somewhere
// else entirely (put there: arrived, brought round, taken to the station) it is the ground.
import { zoneWalkable, zoneSurfaceY, zoneGroundY } from './zone.js';

// How far something may have moved from where its level was last known and still be carried on from it (beyond this it
// was put somewhere, not moved there: the ground).
export const LEVEL_CARRY = 6;

// The height of the surface `o` stands on ({ x, z, lv }).
export function levelAt(o) {
  if (!o) return 0;
  const lv = o.lv;
  if (lv && Number.isFinite(lv.y) && Math.hypot(o.x - lv.x, o.z - lv.z) <= LEVEL_CARRY) return zoneSurfaceY(o.x, o.z, lv.y);
  return zoneGroundY(o.x, o.z);
}
// Keep where `o` is now as its known level.
export function keepLevel(o, y) { o.lv = { x: o.x, z: o.z, y: Number.isFinite(y) ? y : levelAt(o) }; return o.lv.y; }

// Every step of the way from (x0, z0), standing at height y0, to (x1, z1), open to something of `radius` keeping to its
// level: the height it ends at, or null where the way is shut. `step`: how far apart the steps are looked at.
export function walkLevel(x0, z0, y0, x1, z1, boxes = [], radius = 0.4, step = 0.4) {
  const gap = Math.hypot(x1 - x0, z1 - z0);
  const n = Math.max(1, Math.ceil(gap / step));
  let y = Number.isFinite(y0) ? y0 : zoneGroundY(x0, z0);
  for (let i = 1; i <= n; i += 1) {
    const x = x0 + ((x1 - x0) * i) / n, z = z0 + ((z1 - z0) * i) / n;
    if (!zoneWalkable(x, z, boxes, radius, y)) return null;
    y = zoneSurfaceY(x, z, y);
  }
  return y;
}
