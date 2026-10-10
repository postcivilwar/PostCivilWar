// National coordinate frame.
//
// Every position in the simulation is in one frame that covers the whole
// country: game metres east (x) and south (z) of a reference point south-west
// of Nigeria, at 1:10 linear scale. A slice is just a region of that frame,
// so adding another town or state adds content, not a new coordinate system.
// Renderers subtract a local origin so their numbers stay small.

export const WORLD_SCALE = 10;      // one game metre stands for ten real metres
export const CELL_SIZE = 100;       // streaming cell edge in game metres

const REF_LAT = 4.0;
const REF_LON = 2.5;
const MID_LAT = 9.0;
const M_PER_DEG_LAT = 110_574;
const M_PER_DEG_LON = 111_320 * Math.cos((MID_LAT * Math.PI) / 180);

export function geoToWorld(lat, lon) {
  return {
    x: ((lon - REF_LON) * M_PER_DEG_LON) / WORLD_SCALE,
    z: (-(lat - REF_LAT) * M_PER_DEG_LAT) / WORLD_SCALE,
  };
}

export function worldToGeo(x, z) {
  return {
    lat: REF_LAT + (-z * WORLD_SCALE) / M_PER_DEG_LAT,
    lon: REF_LON + (x * WORLD_SCALE) / M_PER_DEG_LON,
  };
}

export function cellOf(x, z) {
  return { cx: Math.floor(x / CELL_SIZE), cz: Math.floor(z / CELL_SIZE) };
}

export function cellKey(x, z) {
  const { cx, cz } = cellOf(x, z);
  return `${cx}:${cz}`;
}

export function distance(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

// A zone may be drawn on a site grid that is turned from true north, the way
// a surveyor's site plan is. `bearingDeg` is the true bearing of grid north,
// clockwise. These convert an offset between grid (x across, z down the
// page) and true (e east, s south) metres.
export function gridToTrue(x, z, bearingDeg = 0) {
  const a = (bearingDeg * Math.PI) / 180;
  return { e: x * Math.cos(a) - z * Math.sin(a), s: x * Math.sin(a) + z * Math.cos(a) };
}

export function trueToGrid(e, s, bearingDeg = 0) {
  const a = (bearingDeg * Math.PI) / 180;
  return { x: e * Math.cos(a) + s * Math.sin(a), z: -e * Math.sin(a) + s * Math.cos(a) };
}
