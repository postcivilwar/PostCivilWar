// The owner's gun recordings (22 October 2026, sent with his rifle; 25 October 2026: "Use my supplied WAV gunshot sound"),
// by the gun they are for: each file as he supplied it, in assets/weapons/<gun>/sound/ and, on the website, beside the
// page in guns/sound/ (build.mjs). Each of the four is one second of fast automatic fire from the same rifle, a burst of
// eight to thirteen rounds and its echo dying away; gun-audio.js finds the rounds in them and plays one for each round
// fired, never the same twice running, and the echo of the last as the firing stops.
//
// He sent no recording of a reload, an empty gun or a round striking something: those few sounds are made in the game
// (gun-audio.js), and he is told so.
export const GUN_SOUNDS = Object.freeze({
  rifle: Object.freeze([
    'maching_gun_sound_an_1-1792669414074.wav',
    'maching_gun_sound_an_2-1792669445724.wav',
    'maching_gun_sound_an_3-1792669437458.wav',
    'maching_gun_sound_an_4-1792669421962.wav',
  ]),
});
