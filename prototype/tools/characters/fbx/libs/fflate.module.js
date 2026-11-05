// The one function three.js's FBXLoader takes from fflate, by Node's own zlib (tools/characters/car-moves.mjs reads the
// owner's Mixamo files with it in Node; the game never loads this).
import { inflateSync } from 'node:zlib';
export const unzlibSync = (data) => new Uint8Array(inflateSync(data));
