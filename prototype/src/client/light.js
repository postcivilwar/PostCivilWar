// Light, in three.js's units. Since r155 three.js measures light as it is measured in the world (the game moved from
// r128 to r186 on 23 October 2026): a surface in a sun of strength 1 is lit a π-th of what it was, and a lamp's light
// falls away with distance as real light does unless it is told otherwise. Every light in the game was set by eye in
// the old units; here they are in the new, so that the town looks as it did.

// The sun, the sky's light all round, and the lights of the studios where models' pictures are taken: their old
// strengths, times this.
export const LIGHT = Math.PI;

// The lamps: their strength, their reach and how they fall away, worked out (tools/three/fit-lights.mjs) to light a
// surface as the old ones did over the distances where each is seen: on average within 3 to 5 per cent of each lamp's
// brightest.
// The street lamps nearest the player (r128: 1.25 at night, reaching 30 m, falling away by 1.6).
export const STREET_LAMP = Object.freeze({ intensity: 6.23, distance: 27, decay: 0.48 });
// A headlamp (r128: a car's 2.8, a motorcycle's 2.2, reaching 38 m, falling away by 1.6).
export const HEADLAMP_LIGHT = Object.freeze({ car: 10.96, bike: 8.62, distance: 32.3, decay: 0.32 });
// A phone's torch (r128: 3.4, reaching 30 m, falling away by 1.7).
export const TORCH_LIGHT = Object.freeze({ intensity: 11.45, distance: 24.45, decay: 0.29 });
// The glow of a phone's screen on whoever holds it (r128: reaching 1.5 m, falling away by 2): its old strength times
// `times`.
export const SCREEN_GLOW = Object.freeze({ times: 1.147, distance: 1.18, decay: 0.41 });
