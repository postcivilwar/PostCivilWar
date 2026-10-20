// Finding the way: the zone's walking graph, with every route worked out
// once and remembered.
//
// A thousand people ask for routes all day. Each first question from a
// starting point builds the whole tree of shortest paths from it; after that
// a route is a walk back along the tree. `road` routes keep to roads and
// lanes, which is where motorcycles go.

import { ZONE_NODES, ZONE_EDGES, ZONE_ROADS, BOULEVARD } from './zone.js';

const NAMES = Object.keys(ZONE_NODES);
const INDEX = new Map(NAMES.map((name, i) => [name, i]));
const COUNT = NAMES.length;
const X = new Float32Array(COUNT);
const Z = new Float32Array(COUNT);
NAMES.forEach((name, i) => { X[i] = ZONE_NODES[name][0]; Z[i] = ZONE_NODES[name][1]; });

const onRoad = (x, z) => ZONE_ROADS.some((r) => x >= r.x0 - 0.6 && x <= r.x1 + 0.6 && z >= r.z0 - 0.6 && z <= r.z1 + 0.6);
const inBoulevard = (x, z) => x >= BOULEVARD.x0 && x <= BOULEVARD.x1 && z >= BOULEVARD.z0 + 12 && z <= BOULEVARD.z1 - 12;
const alongBoulevard = (ax, az, bx, bz) => Math.abs(bz - az) > 20 && inBoulevard((ax + bx) / 2, (az + bz) / 2);
const ROAD_NODE = new Uint8Array(COUNT);
for (let i = 0; i < COUNT; i += 1) ROAD_NODE[i] = onRoad(X[i], Z[i]) ? 1 : 0;
// people keep to one side of an open path; in a doorway they walk the middle
const OPEN_NODE = new Uint8Array(COUNT);
NAMES.forEach((name, i) => { OPEN_NODE[i] = name.includes(':') ? 0 : 1; });

const ALL = Array.from({ length: COUNT }, () => []);
const ROADS = Array.from({ length: COUNT }, () => []);
for (const [a, b] of ZONE_EDGES) {
  const i = INDEX.get(a);
  const j = INDEX.get(b);
  const length = Math.hypot(X[i] - X[j], Z[i] - Z[j]);
  // (along the middle of a city boulevard is the traffic's way: someone walking takes the pavement beside it, and
  // crosses it only where it has to be crossed)
  const walk = alongBoulevard(X[i], Z[i], X[j], Z[j]) ? length * 4 : length;
  ALL[i].push([j, walk]);
  ALL[j].push([i, walk]);
  if (ROAD_NODE[i] && ROAD_NODE[j] && onRoad((X[i] + X[j]) / 2, (Z[i] + Z[j]) / 2)) { ROADS[i].push([j, length]); ROADS[j].push([i, length]); }
}

const trees = [new Map(), new Map()];
// The heap the nearest node is taken from: costs and nodes side by side in typed arrays, grown as needed (until
// 20 October 2026 each entry was an array of its own, made and thrown away by the hundred thousand while the town
// was first worked out, before PLAY could appear). Taken from and added to exactly as before, so that among ways of
// the same length the same one is found.
let heapCost = new Float64Array(1024), heapNode = new Int32Array(1024);
function treeFrom(source, roads) {
  const cache = trees[roads ? 1 : 0];
  let tree = cache.get(source);
  if (tree) return tree;
  const adjacency = roads ? ROADS : ALL;
  const dist = new Float64Array(COUNT).fill(Infinity);
  const prev = new Int16Array(COUNT).fill(-1);
  let size = 1;
  heapCost[0] = 0; heapNode[0] = source;
  dist[source] = 0;
  while (size) {
    // pop the nearest
    const d = heapCost[0], node = heapNode[0];
    size -= 1;
    if (size) {
      heapCost[0] = heapCost[size]; heapNode[0] = heapNode[size];
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < size && heapCost[l] < heapCost[m]) m = l;
        if (r < size && heapCost[r] < heapCost[m]) m = r;
        if (m === i) break;
        const c = heapCost[i], n = heapNode[i];
        heapCost[i] = heapCost[m]; heapNode[i] = heapNode[m];
        heapCost[m] = c; heapNode[m] = n;
        i = m;
      }
    }
    if (d > dist[node]) continue;
    for (const [next, length] of adjacency[node]) {
      const cost = d + length;
      if (cost < dist[next]) {
        dist[next] = cost;
        prev[next] = node;
        if (size === heapCost.length) {
          const c = new Float64Array(size * 2); c.set(heapCost); heapCost = c;
          const n = new Int32Array(size * 2); n.set(heapNode); heapNode = n;
        }
        heapCost[size] = cost; heapNode[size] = next;
        let i = size;
        size += 1;
        while (i > 0) {
          const p = (i - 1) >> 1;
          if (heapCost[p] <= heapCost[i]) break;
          const c = heapCost[i], n = heapNode[i];
          heapCost[i] = heapCost[p]; heapNode[i] = heapNode[p];
          heapCost[p] = c; heapNode[p] = n;
          i = p;
        }
      }
    }
  }
  tree = { dist, prev };
  cache.set(source, tree);
  return tree;
}

export const graphIndex = (name) => INDEX.get(name);
export const graphName = (index) => NAMES[index];
export const graphPoint = (index) => [X[index], Z[index]];
export const graphIsRoad = (index) => ROAD_NODE[index] === 1;
export const graphIsOpen = (index) => OPEN_NODE[index] === 1;
export const graphSize = () => COUNT;

// The nodes of the shortest way from one node to another, as indices, or null.
export function graphRoute(from, to, roads = false) {
  if (from === to) return [from];
  const { dist, prev } = treeFrom(from, roads);
  if (dist[to] === Infinity) return null;
  const route = [to];
  let at = to;
  while (at !== from) { at = prev[at]; route.push(at); }
  return route.reverse();
}

export function graphDistance(from, to, roads = false) {
  return treeFrom(from, roads).dist[to];
}

export function graphNearest(x, z, roads = false) {
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < COUNT; i += 1) {
    if (roads && (!ROAD_NODE[i] || ROADS[i].length === 0)) continue;
    const d = (X[i] - x) * (X[i] - x) + (Z[i] - z) * (Z[i] - z);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

// By name, for the code that still thinks in names.
export function shortestRoute(from, to) {
  const route = graphRoute(INDEX.get(from), INDEX.get(to));
  return route ? route.map((i) => NAMES[i]) : null;
}

export function nearestNode(x, z) {
  return NAMES[graphNearest(x, z)];
}
