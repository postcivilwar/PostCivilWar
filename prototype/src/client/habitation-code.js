// The habitation's own drawing (render-habitation.js, render-habitation-life.js, habitation-plants.js): on the website a
// script of its own beside the page (build.mjs writes it as habitation-code.js), not part of the game's script, so
// that the opening does not wait for it (21 October 2026: in the game's script it made PLAY a second later on a slow
// phone connection). main.js asks for it once the town is up, or at once for someone on the road north, and finds
// what it needs here. (The page copied to a disk carries it inside, after the game's script.)
import { createHabitation } from './render-habitation.js';
import { createHabitationLife } from './render-habitation-life.js';
import { habitationWind, setHabitationWind, readDressed, decodePicture, PICTURE_OPTIONS } from './habitation-plants.js';
import { letGoOnceDrawn, decodeAtMost } from './glb.js';

// (and how its plants are read and their leaves moved, for the slim trees down Oganiru City's middle strips, which are
// the habitation's slim tree: render-oganiru.js, 31 October 2026)
window.__pcwHabitationCode = Object.freeze({ createHabitation, createHabitationLife, habitationWind, plants: Object.freeze({ readDressed, decodePicture, PICTURE_OPTIONS, letGoOnceDrawn, decodeAtMost, setHabitationWind }) });
