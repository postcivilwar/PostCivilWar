// How large a picture the graphics card is given, for each kind of thing the game draws from the owner's models, on a
// computer and on a phone or tablet (18 October 2026, the owner's brief: the game crashed on phones, lagged on
// computers, and sometimes froze or closed).
//
// Measured before this (a session through the town, the showrooms, a ride and a drive, counting every texture the
// page handed the graphics card): on a computer the graphics memory climbed past 1.8 GB and never came back down.
// One picture alone, PowerBike's tower, was 8192 pixels square: 341 MB once its smaller copies were made. Each of the
// car showroom's buildings, each figure and each car was 4096: 85 MB a picture, three pictures a car. A phone's browser
// is given a small part of that before it gives up the page.
//
// Every supplied file stays whole; only what is handed to the graphics card is smaller. What a picture is drawn at is
// chosen for how close it is ever seen: a building or a tower from the street, a figure from a few metres behind, a
// car or a motorcycle on the road. The one thing looked at up close, a car or a motorcycle in its showroom with the
// player standing at it, is given its full picture (`inspect`).
//
// vehicle: the set of pictures a car or a motorcycle is drawn with on the road and across a showroom ('1k', '2k' or
// '4k': tools/vehicles/smaller.py writes the 1k set); near: the few nearest in a showroom; inspect: the one the
// player stands at in a showroom.
export const PICTURES = Object.freeze({
  full: Object.freeze({ figure: 2048, building: 2048, tower: 2048, supplied: 2048, vehicle: '2k', near: '2k', inspect: '4k' }),
  lite: Object.freeze({ figure: 1024, building: 1024, tower: 1024, supplied: 1024, vehicle: '1k', near: '1k', inspect: '2k' }),
});

// The kind of device: a phone or tablet ('lite') draws the lighter way. The address ending in #lite asks for it on
// any device and #full refuses it (as main.js decides).
export function deviceKind() {
  try {
    const hash = String(location.hash || '');
    if (hash.includes('full')) return 'full';
    if (hash.includes('lite')) return 'lite';
    return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches ? 'lite' : 'full';
  } catch (error) { return 'full'; }
}

// The size a picture of this kind is drawn at here, never larger than the graphics card takes.
export function pictureSize(kind, { lite = deviceKind() === 'lite', most = Infinity } = {}) {
  const want = PICTURES[lite ? 'lite' : 'full'][kind];
  return typeof want === 'number' ? Math.min(want, most || want) : want;
}
