// The habitation's drawn ground as a file, made by the build (26 October 2026, the owner's brief: the game hung on his
// phones): render-habitation.js's own groundData (every point's height, colour and which way it faces), in the form its
// readGroundFile takes, gzipped (about 0.55 MB). Sent beside the page as habitation/ground.bin; the game unzips it as it
// comes (DecompressionStream) instead of working the 101,000 points out (8 seconds of this machine; 25 to 35 on a
// phone's settings here). Worked out afresh at each build, so it is always the build's own ground.
//   node tools/habitation/ground-file.mjs [out file]   (the build calls makeGroundFile)
import { createRequire } from 'node:module';
import { gzipSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export async function makeGroundFile() {
  const require = createRequire(import.meta.url);
  if (!globalThis.THREE) globalThis.THREE = require('../../vendor/three.min.js');
  const { groundData, groundFileBytes } = await import('../../src/client/render-habitation.js');
  return gzipSync(groundFileBytes(groundData()), { level: 9 });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const bytes = await makeGroundFile();
  if (process.argv[2]) writeFileSync(process.argv[2], bytes);
  console.log(`the habitation's ground: ${bytes.length} bytes`);
}
