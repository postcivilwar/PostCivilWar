// Levels (31 October 2026, Oganiru City's flyovers: "a vehicle or a person always stays on the level it is on, never
// popping up or dropping through"). Where a flyover passes over a road, a point on the map has two surfaces: the road
// and the deck. What a player stands on, or drives, is the surface they were already on, carried on from step to step
// (zone.js zoneSurfaceY: the highest under them no more than a step above where they were). The town keeps, for each
// player and each thing they move, where it last knew their level (`lv`: the place and the height there); somewhere
// else entirely (put there: arrived, brought round, taken to the station) it is the ground.
import { zoneWalkable, zoneSurfaceY, zoneGroundY, zoneDeckHeights } from './zone.js';

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

// Out of a level that is not open where something stands (4 November 2026, the owner's video: a car of the town's taken
// while it stood on a slip road was put at the ground under it, inside the bank the slip road is built on, and neither
// the car nor its thief could move again; the bank's walls, seen from inside, let the sky through). Where `o` cannot be
// at the level it has (`fits(y)` false there), and the road of a deck over it can (`fits` at that height), it is on that
// deck: its level is kept there. Returns the height it is now at, or null where nothing was changed.
export function unstuck(o, fits) {
  const y = levelAt(o);
  if (fits(y)) return null;
  for (const h of zoneDeckHeights(o.x, o.z)) if (h > y + 0.2 && fits(h)) { keepLevel(o, h); return h; }
  return null;
}
// For someone on foot: open to a body of `radius`, with `boxes` in the way.
export const unstuckOnFoot = (o, boxes = [], radius = 0.4) => unstuck(o, (y) => zoneWalkable(o.x, o.z, boxes, radius, y));

// Every step of the way from (x0, z0), standing at height y0, to (x1, z1), open to something of `radius` keeping to its
// level: the height it ends at, or null where the way is shut. `step`: how far apart the steps are looked at.
export function walkLevel(x0, z0, y0, x1, z1, boxes = [], radius = 0.4, step = 0.4) {
  const gap = Math.hypot(x1 - x0, z1 - z0);
  const n = Math.max(1, Math.ceil(gap / step));
  let y = Number.isFinite(y0) ? y0 : zoneGroundY(x0, z0);
  // (one who is already inside something solid, put there, may step out of it: only where the step ends need be open;
  // 4 November 2026, nobody is to be held for good where they were put by mistake)
  const inside = !zoneWalkable(x0, z0, boxes, radius, y);
  for (let i = 1; i <= n; i += 1) {
    const x = x0 + ((x1 - x0) * i) / n, z = z0 + ((z1 - z0) * i) / n;
    if (!zoneWalkable(x, z, boxes, radius, y)) { if (inside && i < n) continue; return null; }
    y = zoneSurfaceY(x, z, y);
  }
  return y;
}
