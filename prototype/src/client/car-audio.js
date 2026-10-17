// The engine and the horn of a car of the player's own (src/sim/power-cars.js).
//
// No recording of a car's engine was supplied, so each car's engine is made here, the way a power bike's is when its
// recordings cannot be fetched (bike-audio.js, createBikeEngine): the beat of its cylinders firing (revs / 60 ×
// cylinders / 2 a second), with the rasp of its exhaust and the ring of its pipe, the revs following the throttle and
// the gears (power-cars.js, carRevs). Each car sounds as its kind of engine does in the game (`tone`: how many
// cylinders beat, its idle and its red line, how rough it is); nothing here is said to the player about it.
//
// Its horn is made here too: two notes together, deeper on the big cars, higher on the sports cars.
//
// Everything plays into the game's own vehicle sound (audio.js), so the volume and mute settings govern it like
// every other engine.

// The overtones of each kind of engine's beat: more cylinders, a smoother beat whose higher overtones carry further.
const HARMONICS = Object.freeze({
  4: [1, 0.55, 0.46, 0.34, 0.26, 0.18, 0.12, 0.08],
  6: [1, 0.62, 0.5, 0.38, 0.3, 0.22, 0.16, 0.11, 0.07],
  8: [1, 0.78, 0.58, 0.44, 0.32, 0.24, 0.17, 0.12, 0.08],
  12: [1, 0.5, 0.44, 0.36, 0.3, 0.24, 0.2, 0.16, 0.12, 0.09, 0.06],
});

// A car's engine as the engine-maker of bike-audio.js takes it.
export function carProfile(car) {
  const t = (car && car.tone) || { cyl: 4, idle: 800, redline: 6500, rasp: 0.12, level: 0.42 };
  const cyl = t.cyl;
  return Object.freeze({
    name: car ? car.name : 'car',
    cylinders: cyl, idle: t.idle, redline: t.redline,
    harmonics: HARMONICS[cyl >= 12 ? 12 : cyl >= 8 ? 8 : cyl >= 6 ? 6 : 4],
    // (an eight's beat lopes a little at idle; a diesel's clatters)
    lope: t.lope || 0.03, rasp: t.rasp + (t.clatter || 0) * 0.3,
    pipe: cyl >= 8 ? 105 : cyl >= 6 ? 140 : 170, pipeQ: 1.4, intake: t.clatter ? 0.03 : 0.07,
    // a car's engine is under its bonnet and the driver is inside: a little quieter than a bike's under its rider
    level: t.level * 0.8,
    crackle: t.clatter ? 0.05 : cyl >= 8 ? 0.3 : 0.15,
  });
}

export const CAR_HORNS = Object.freeze({
  // a saloon's or a luxury car's: two notes a third apart
  town: Object.freeze({ notes: [400, 500], length: 0.5 }),
  // the big ones (pickups, off-roaders, SUVs, the limousine): deeper
  big: Object.freeze({ notes: [330, 415], length: 0.55 }),
  // the classics: a little brassy
  classic: Object.freeze({ notes: [355, 445], length: 0.55 }),
  // the sports cars and the supercars: higher and short
  sport: Object.freeze({ notes: [500, 630], length: 0.4 }),
});
const HORN_OF_CLASS = Object.freeze({ saloon: 'town', luxury: 'town', limousine: 'big', pickup: 'big', offroad: 'big', suv: 'big', classic: 'classic', sports: 'sport', super: 'sport' });
export const carHornOf = (car) => CAR_HORNS[(car && HORN_OF_CLASS[car.class]) || 'town'];
