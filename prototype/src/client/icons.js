// The game's pictograms: one set, drawn here, for every action a button can stand for.
//
// All are on a 24 by 24 grid, drawn here; nothing is taken from an icon library.

// Solid, one family (10 October 2026): every pictogram is white filled shapes and thick round-ended limbs on the
// same 24 by 24 grid, drawn to sit on a dark translucent disc. A part is one of:
//   'M…'              a filled shape (holes cut by the even-odd rule)
//   [cx, cy, r]       a filled circle
//   { s: 'M…', w }    a limb: a thick line with round ends (w, its width, defaults to 2.8)
//   { ring: [cx, cy, r], w }   a circle drawn as a thick ring
const FACE = 'M12 2.8a9.2 9.2 0 1 0 0 18.4a9.2 9.2 0 1 0 0-18.4z';
const EYES = ' M7.9 9.4a1.45 1.45 0 1 0 2.9 0a1.45 1.45 0 1 0 -2.9 0z M13.2 9.4a1.45 1.45 0 1 0 2.9 0a1.45 1.45 0 1 0 -2.9 0z';
const FIST = 'M6.2 10.6V8.4a1.8 1.8 0 0 1 3.6 0v-.7a1.8 1.8 0 0 1 3.6 0v.5a1.8 1.8 0 0 1 3.6 0v1.7a1.9 1.9 0 0 1 2.4 1.8v3.1c0 3.6-2.8 6.4-6.6 6.4h-1.6c-3 0-5-1.9-5-4.7z M9.6 8.6h.7v3.6h-.7z M13.2 8.4h.7v3.8h-.7z M7 13.4h9.4v.8H7z';
const PALM = 'M6.9 12.4h11.4v2.6c0 3.4-2.6 6.2-6 6.2-2.3 0-3.7-1-4.9-2.8l-2.6-3.8a1.4 1.4 0 0 1 2.2-1.7z';
const FINGERS = [{ s: 'M8.4 12.6V7.8', w: 2.6 }, { s: 'M11.2 11.6V5.4', w: 2.6 }, { s: 'M14 11.6V6.2', w: 2.6 }, { s: 'M16.8 12.4V8.4', w: 2.6 }];
const FIG = (head, ...limbs) => [head, ...limbs.map((d) => ({ s: d, w: 2.9 }))];

export const ICONS = Object.freeze({
  // what the large button does, by what is in front of the player
  act: [{ ring: [12, 12, 7.6], w: 2.6 }, [12, 12, 3.1]],
  talk: ['M12 3.4c-5 0-9.1 3.3-9.1 7.5 0 2.3 1.2 4.4 3.2 5.8L5.4 21l4.7-2.6c.6.1 1.2.2 1.9.2 5 0 9.1-3.4 9.1-7.6S17 3.4 12 3.4z M6.9 11a1.35 1.35 0 1 0 2.7 0a1.35 1.35 0 1 0 -2.7 0z M10.65 11a1.35 1.35 0 1 0 2.7 0a1.35 1.35 0 1 0 -2.7 0z M14.4 11a1.35 1.35 0 1 0 2.7 0a1.35 1.35 0 1 0 -2.7 0z'],
  enter: ['M6.4 3.4h11.2v17.6H6.4z M14 11.4a1.15 1.15 0 1 0 2.3 0a1.15 1.15 0 1 0 -2.3 0z', { s: 'M3.4 21.2h17.2', w: 2.4 }],
  drive: [{ ring: [12, 12, 8.2], w: 2.7 }, [12, 12, 2.7], { s: 'M4.6 10.8h5', w: 2.7 }, { s: 'M14.4 10.8h5', w: 2.7 }, { s: 'M12 14.7v5', w: 2.7 }],
  wheel: [{ ring: [12, 12, 9], w: 2.4 }, [12, 12, 3], { s: 'M3.6 11h5.4', w: 2.6 }, { s: 'M15 11h5.4', w: 2.6 }, { s: 'M12 15v5.6', w: 2.6 }],
  getout: ['M3.6 3.6h9.4v16.8H3.6z M10.4 11.4a1.05 1.05 0 1 0 2.1 0a1.05 1.05 0 1 0 -2.1 0z', { s: 'M15 12h6.2', w: 2.7 }, { s: 'M18.2 8.8l3.2 3.2-3.2 3.2', w: 2.7 }],
  ride: [{ ring: [5.6, 16.4, 3.3], w: 2.5 }, { ring: [18.4, 16.4, 3.3], w: 2.5 }, 'M7.9 15.8l3.2-6h4.8l2.9 4.6-1.9 1.2-2.4-3.2h-2.1l-2.7 4.6z', { s: 'M14.8 7.8h3.4', w: 2.4 }],
  getoff: ['M13 3.4h5.4a2.2 2.2 0 0 1 2.2 2.2v12.8a2.2 2.2 0 0 1-2.2 2.2H13z', { s: 'M10.4 7.8L6.2 12l4.2 4.2', w: 2.8 }, { s: 'M6.4 12h8.6', w: 2.8 }],
  sit: ['M6.6 3.4h3.2v8.2h7.8v3.2H6.6z M6.6 14.4h2.8v6.8H6.6z M14.8 14.4h2.8v6.8h-2.8z'],
  sleep: ['M20.6 14.6A8.7 8.7 0 1 1 9.4 3.4a7 7 0 0 0 11.2 11.2z'],
  look: ['M12 5C6 5 2 12 2 12s4 7 10 7 10-7 10-7-4-7-10-7z M12 8.2a3.8 3.8 0 1 0 0 7.6a3.8 3.8 0 1 0 0-7.6z', [12, 12, 1.9]],
  read: ['M2.6 5.2c3.2-.6 6.3-.2 8.6 1.4V20.2c-2.3-1.4-5.4-1.8-8.6-1.2z M12.8 6.6c2.3-1.6 5.4-2 8.6-1.4v13.8c-3.2-.6-6.3-.2-8.6 1.2z'],
  load: ['M4 10.4l8-3.8 8 3.8v7.4L12 21.6 4 17.8z M4.9 10.9l7.1 3.4 7.1-3.4-.6-.3-6.5 3.1-6.5-3.1z', { s: 'M12 1.6v3', w: 2.4 }, { s: 'M10 3.2l2-1.8 2 1.8', w: 2.2 }],
  unload: ['M4 10.4l8-3.8 8 3.8v7.4L12 21.6 4 17.8z M4.9 10.9l7.1 3.4 7.1-3.4-.6-.3-6.5 3.1-6.5-3.1z', { s: 'M12 1.4v3.2', w: 2.4 }, { s: 'M10 3l2 2 2-2', w: 2.2 }],
  work: ['M12.2 2.8l5.6 5.6-2.8 2.8-5.6-5.6z', { s: 'M11.6 9.4L4.2 16.8', w: 3.4 }, { s: 'M15 7.8l4.6-4.6', w: 2.4 }],
  // moving about
  run: FIG([15.8, 4.2, 2.2], 'M14.2 8.2l-2.8 5.6', 'M14.2 8.6l3.6 2.2 2.4-1.6', 'M13.8 8.4l-3.8.4-2.2 2.8', 'M11.4 13.8l3.6 2.4-.7 4.8', 'M11.4 13.8L8.9 17.2l-4.4.4'),
  camera: ['M2.8 8h3.8L8.5 5.2h7L17.4 8h3.8v11.6H2.8z M12 9.6a4 4 0 1 0 0 8a4 4 0 1 0 0-8z', [12, 13.6, 2.1]],
  phone: ['M6.6 2.8h3.1l1.8 4.8-2.4 1.6a11.4 11.4 0 0 0 5.7 5.7l1.6-2.4 4.8 1.8v3.1a2.4 2.4 0 0 1-2.4 2.4C10.4 19.8 4.2 13.6 4.2 5.2a2.4 2.4 0 0 1 2.4-2.4z'],
  chat: ['M12 3.4c-5 0-9.1 3.3-9.1 7.5 0 2.3 1.2 4.4 3.2 5.8L5.4 21l4.7-2.6c.6.1 1.2.2 1.9.2 5 0 9.1-3.4 9.1-7.6S17 3.4 12 3.4z'],
  // a fight
  fight: [FIST],
  punch: [FIST],
  heavy: [FIST, { s: 'M2.6 5.2l2 2', w: 2.2 }, { s: 'M2 10h2.6', w: 2.2 }, { s: 'M6.6 2.4l.6 2.6', w: 2.2 }],
  kick: FIG([7.6, 4.2, 2.2], 'M8 7.8l1.2 5.6', 'M8.2 9l3.6-1.2', 'M8 9l-3.2 2.2', 'M9.2 13.4L8 17.2l.6 3.8', 'M9.2 13.4l5-.8 5.6-3'),
  block: ['M12 2.4l8 3.3v5.5c0 5.4-3.4 8.9-8 11-4.6-2.1-8-5.6-8-11V5.7z'],
  dodge: [...FIG([15.4, 4.6, 2.2], 'M14.2 8.4l-4 5.6', 'M10.2 14l2.2 5.6', 'M10.2 14l-4.4 3.6', 'M13.6 9.2l3.6 2.6'), { s: 'M2.4 7.6h4.4', w: 2.2 }, { s: 'M2 11.6h3.4', w: 2.2 }],
  shove: [PALM, ...FINGERS, { s: 'M2.2 6h3.2', w: 2.2 }, { s: 'M2.2 9.6h2.4', w: 2.2 }],
  grab: ['M6.4 13.6c0-1 .8-1.4 1.6-.8l1.4 1.2V6.8a1.5 1.5 0 0 1 3 0v-1a1.5 1.5 0 0 1 3 0v1a1.5 1.5 0 0 1 3 0v8.4c0 3.4-2.6 6-6 6-2.3 0-3.7-1-4.9-2.8z'],
  leave: ['M13 3.4h5.4a2.2 2.2 0 0 1 2.2 2.2v12.8a2.2 2.2 0 0 1-2.2 2.2H13z', { s: 'M10.4 7.8L6.2 12l4.2 4.2', w: 2.8 }, { s: 'M6.4 12h8.6', w: 2.8 }],
  // on the wrong side of the law
  take: ['M7.6 12.2a4.6 4.6 0 1 0 0 9.2a4.6 4.6 0 1 0 0-9.2z M7.6 14.9a1.9 1.9 0 1 0 0 3.8a1.9 1.9 0 1 0 0-3.8z', { s: 'M10.9 13.4l9-9', w: 2.8 }, { s: 'M16.4 7.8l2.6 2.6', w: 2.6 }, { s: 'M13.7 10.5l2 2', w: 2.6 }],
  steal: ['M3 7.6h15.2a2.6 2.6 0 0 1 2.6 2.6v8a2.6 2.6 0 0 1-2.6 2.6H5.6A2.6 2.6 0 0 1 3 18.2z M15.2 12.4h5.6v3.6h-5.6z', 'M3.6 7l10.8-3.8v3.6z'],
  surrender: FIG([12, 6.6, 2.2], 'M12 9.8v5.6', 'M12 11L7.6 4.6', 'M12 11l4.4-6.4', 'M12 15.4l-2.8 5.6', 'M12 15.4l2.8 5.6'),
  custody: ['M12 2.4l8 3.3v5.5c0 5.4-3.4 8.9-8 11-4.6-2.1-8-5.6-8-11V5.7z M12 7.6l1.3 2.7 2.9.4-2.1 2 .5 2.9L12 14.2l-2.6 1.4.5-2.9-2.1-2 2.9-.4z'],
  cancel: [{ s: 'M6 6l12 12', w: 3.2 }, { s: 'M18 6L6 18', w: 3.2 }],
  // hurt
  ambulance: ['M12 2.8a9.2 9.2 0 1 0 0 18.4a9.2 9.2 0 1 0 0-18.4z M10.3 6.8h3.4v3.5h3.5v3.4h-3.5v3.5h-3.4v-3.5H6.8v-3.4h3.5z'],
  // at the wheel
  horn: ['M3 9.4h3.6l6.4-4.6v14.4l-6.4-4.6H3z', { s: 'M16.2 9a4.2 4.2 0 0 1 0 6', w: 2.5 }, { s: 'M19 6.4a8 8 0 0 1 0 11.2', w: 2.5 }],
  gas: ['M8.4 2.4h7.2a1.6 1.6 0 0 1 1.6 1.7l-1 14.6a2.6 2.6 0 0 1-2.6 2.5h-3.2a2.6 2.6 0 0 1-2.6-2.5L6.8 4.1a1.6 1.6 0 0 1 1.6-1.7z M9.2 6.4h5.6v1.6H9.2z M9.4 10.2h5.2v1.6H9.4z M9.6 14h4.8v1.6H9.6z'],
  // a power bike's two steering arrows: solid, pointing out to their own side
  steerleft: ['M15.6 3.6v16.8L4.2 12z'],
  steerright: ['M8.4 3.6v16.8L19.8 12z'],
  // the action buttons of 16 October 2026 (the owner's screenshots): steering chevrons, and the two pedals drawn
  // as the screenshots draw them, inside a button that is itself the pedal's outline (ICON_BOX gives their shape)
  chevleft: [{ s: 'M11.6 5.6L5.2 12l6.4 6.4 M18.4 5.6L12 12l6.4 6.4', w: 2.6 }],
  chevright: [{ s: 'M12.4 5.6L18.8 12l-6.4 6.4 M5.6 5.6L12 12l-6.4 6.4', w: 2.6 }],
  pedalgas: [{ ring: [12, 5.2, 1.7], w: 1.6 }, { ring: [12, 34.8, 1.7], w: 1.6 }, 'M6.2 25.6l11.6-11.6v4.4L6.2 30z M6.2 17.6L17.8 6v4.4L6.2 22z'],
  pedalbrake: [{ ring: [10.5, 4.6, 1.7], w: 1.6 }, { ring: [29.5, 4.6, 1.7], w: 1.6 }, 'M5.2 9.2h3.6L5.2 15.4z M9.6 21.6l9.2-12.4h3.6l-9.2 12.4z M15.8 21.6L25 9.2h3.6l-9.2 12.4z M28.6 21.6c0-5.4 2.4-9.6 6.2-11.6v11.6z'],
  brake: ['M4.4 6.6h15.2a1.6 1.6 0 0 1 1.6 1.8l-.9 8.3a2.4 2.4 0 0 1-2.4 2.1H6.1a2.4 2.4 0 0 1-2.4-2.1L2.8 8.4a1.6 1.6 0 0 1 1.6-1.8z M7.4 9.6h1.6v6H7.4z M11.2 9.6h1.6v6h-1.6z M15 9.6h1.6v6H15z'],
  // in the river
  hand: [PALM, ...FINGERS, { s: 'M3 22.2c1.5-.9 3-.9 4.5 0s3 .9 4.5 0 3-.9 4.5 0 3 .9 4.5 0', w: 1.8 }],
  swim: [[16.8, 6.6, 2.3], { s: 'M3.6 12.2l5-3.2 3.6 2.6 3.4-1.8', w: 2.8 }, { s: 'M8.6 9l2.4-3.6 4.2 1', w: 2.8 }, { s: 'M2.4 16.4c1.6-1 3.2-1 4.8 0s3.2 1 4.8 0 3.2-1 4.8 0 3.2 1 4.8 0', w: 2.2 }, { s: 'M2.4 20.4c1.6-1 3.2-1 4.8 0s3.2 1 4.8 0 3.2-1 4.8 0 3.2 1 4.8 0', w: 2.2 }],
  climb: ['M3 21.4v-3.6h5.6v-3.6h5.6v-3.6h5.6v10.8z', { s: 'M14.6 7.6V2.6', w: 2.6 }, { s: 'M12.2 4.8l2.4-2.4 2.4 2.4', w: 2.6 }],
  // the skills: what the body can do, and what each kind of skill looks like
  skills: ['M12.00 1.80 L13.91 7.38 L19.21 4.79 L16.62 10.09 L22.20 12.00 L16.62 13.91 L19.21 19.21 L13.91 16.62 L12.00 22.20 L10.09 16.62 L4.79 19.21 L7.38 13.91 L1.80 12.00 L7.38 10.09 L4.79 4.79 L10.09 7.38Z M12 8.6 L13.2 10.8 L15.4 12 L13.2 13.2 L12 15.4 L10.8 13.2 L8.6 12 L10.8 10.8Z'],
  dance: FIG([12.6, 3.8, 2.2], 'M12.4 7.2l-.8 6.6', 'M12.2 8.6L7.4 5.4', 'M12.2 8.6l4.4 2.4 1.8-2.8', 'M11.6 13.8l-3.8 3 1.2 4', 'M11.6 13.8l3.6 3.2-2 3.6'),
  laugh: [FACE + EYES + ' M7.2 12.8h9.6a4.8 4.8 0 0 1-9.6 0z'],
  sad: [FACE + EYES + ' M7.9 17.6a4.3 3.2 0 0 1 8.2 0h-1.9a2.4 1.8 0 0 0-4.4 0z M16.7 11.3c.9 1.3 1.4 2.1 1.4 2.8a1.4 1.4 0 0 1-2.8 0c0-.7.5-1.5 1.4-2.8z'],
  scared: [FACE + EYES + ' M10.1 15.4a1.9 2.3 0 1 0 3.8 0a1.9 2.3 0 1 0 -3.8 0z'],
  think: [FACE + EYES + ' M8.4 14.8h7.2v1.8H8.4z'],
  greet: [PALM, ...FINGERS, { s: 'M3.2 7.6c.4-1.8 1.4-3 3-3.8', w: 2.2 }, { s: 'M20.8 7.6c-.4-1.8-1.4-3-3-3.8', w: 2.2 }],
  clap: [{ s: 'M6.6 19.2l5-9.4', w: 5 }, { s: 'M17.4 19.2l-5-9.4', w: 5 }, { s: 'M12 2.6v2.4', w: 2.2 }, { s: 'M8.2 3.8l1.2 1.8', w: 2.2 }, { s: 'M15.8 3.8l-1.2 1.8', w: 2.2 }],
  cheer: FIG([12, 5, 2.2], 'M12 8.4v6.2', 'M12 9.8L7.4 4.4', 'M12 9.8l4.6-5.4', 'M12 14.6l-3 6.2', 'M12 14.6l3 6.2'),
  heart: ['M12 20.8S3.2 15.4 3.2 9.4a4.8 4.8 0 0 1 8.8-2.7 4.8 4.8 0 0 1 8.8 2.7c0 6-8.8 11.4-8.8 11.4z'],
  jump: [...FIG([12, 3.8, 2.2], 'M12 7.2v6', 'M12 8.6L7.6 6.4', 'M12 8.6l4.4-2.2', 'M12 13.2l-3.6 1.2 1.2 3.6', 'M12 13.2l3.6 1.2-1.2 3.6'), { s: 'M5 21.4h14', w: 2.2 }],
  ball: ['M12 2.8a9.2 9.2 0 1 0 0 18.4a9.2 9.2 0 1 0 0-18.4z M12 7.6l3.4 2.5-1.3 4h-4.2l-1.3-4z'],
  lift: [{ s: 'M6.4 12h11.2', w: 2.6 }, { s: 'M5 8.2v7.6', w: 3.6 }, { s: 'M19 8.2v7.6', w: 3.6 }, { s: 'M2.4 10v4', w: 2.6 }, { s: 'M21.6 10v4', w: 2.6 }],
  agree: ['M3 10.4h3.2v9.8H3z M7.6 10.4h2.2l3.3-6.4a1.9 1.9 0 0 1 3.5 1.4l-.9 3.4h4.2a2.1 2.1 0 0 1 2.1 2.5l-1.4 6.8a2.5 2.5 0 0 1-2.5 2H9.4a1.8 1.8 0 0 1-1.8-1.8z'],
  turn: [{ s: 'M18.6 8.6A7.6 7.6 0 1 0 19.6 13.4', w: 2.8 }, 'M21.2 3.6v6.8h-6.8z'],
  sing: [{ s: 'M10.4 17.6V5.6l9-2.2v11.8', w: 2.6 }, [7.6, 17.6, 3], [16.6, 15.4, 3]],
  fall: FIG([5.4, 15.8, 2.2], 'M8.6 15l6-2.4', 'M10.2 14.2l1-4.6', 'M10.4 14.4l3.4 4', 'M14.6 12.6l4-2.6 1.6 2.4', 'M14.6 12.6l3.8 3.4 2.6-.4'),
  bow: FIG([8.4, 7.6, 2.2], 'M11.4 8.6l4.2 3', 'M15.6 11.6v9.4', 'M12.6 9.6l-1 5', 'M15.6 16.2l-2.6 4.8'),
  phonecall: ['M6.6 2.8h3.1l1.8 4.8-2.4 1.6a11.4 11.4 0 0 0 5.7 5.7l1.6-2.4 4.8 1.8v3.1a2.4 2.4 0 0 1-2.4 2.4C10.4 19.8 4.2 13.6 4.2 5.2a2.4 2.4 0 0 1 2.4-2.4z', { s: 'M15 3.4a6 6 0 0 1 5.6 5.6', w: 2 }],
  surf: [{ s: 'M3 18.6c3-1.4 6-1.4 9 0s6 1.4 9 0', w: 2.4 }, 'M4.6 15.4c4.2-2.4 10.6-2.4 14.8 0z', ...FIG([12.6, 4.2, 2.1], 'M12.4 7.4l-.6 4.4', 'M12.2 8.6l-4 1.4', 'M12.2 8.6l4 1.2', 'M11.8 11.8l-2.4 2.4', 'M11.8 11.8l2.4 2.4').slice(0)],
  // the opening
  sound: ['M3 9.4h3.6l6.4-4.6v14.4l-6.4-4.6H3z', { s: 'M16.2 9a4.2 4.2 0 0 1 0 6', w: 2.5 }, { s: 'M19 6.4a8 8 0 0 1 0 11.2', w: 2.5 }],
  muted: ['M3 9.4h3.6l6.4-4.6v14.4l-6.4-4.6H3z', { s: 'M16.4 9.4l5 5', w: 2.5 }, { s: 'M21.4 9.4l-5 5', w: 2.5 }],
  next: [{ s: 'M9 5l7 7-7 7', w: 3 }],
});

// What the large button shows for each thing the player can do to what is in front of them (see findPrompt in main.js).
export const PROMPT_ICON = Object.freeze({
  Talk: 'talk', Enter: 'enter', Drive: 'drive', 'Get out': 'getout', 'Get off': 'getoff', 'Get down': 'getoff', Ride: 'ride',
  Sit: 'sit', Sleep: 'sleep', Look: 'look', Read: 'read', Load: 'load', Unload: 'unload', Deliver: 'unload', Mould: 'work', Work: 'work',
});

const NS = 'http://www.w3.org/2000/svg';
// drawings that are not square: the two pedals
const ICON_BOX = Object.freeze({ pedalgas: '0 0 24 40', pedalbrake: '0 0 40 26' });
export function icon(id) {
  const parts = ICONS[id] || ICONS.act;
  const el = document.createElementNS(NS, 'svg');
  el.setAttribute('viewBox', ICON_BOX[id] || '0 0 24 24');
  if (ICON_BOX[id]) el.dataset.box = id;
  el.setAttribute('aria-hidden', 'true');
  el.setAttribute('class', 'ico');
  for (const part of parts) {
    let node;
    if (typeof part === 'string') { node = document.createElementNS(NS, 'path'); node.setAttribute('d', part); node.setAttribute('fill-rule', 'evenodd'); node.setAttribute('class', 'f'); }
    else if (Array.isArray(part)) { node = document.createElementNS(NS, 'circle'); node.setAttribute('cx', part[0]); node.setAttribute('cy', part[1]); node.setAttribute('r', part[2]); node.setAttribute('class', 'f'); }
    else if (part.ring) { node = document.createElementNS(NS, 'circle'); node.setAttribute('cx', part.ring[0]); node.setAttribute('cy', part.ring[1]); node.setAttribute('r', part.ring[2]); node.setAttribute('class', 's'); node.setAttribute('stroke-width', part.w || 2.8); }
    else { node = document.createElementNS(NS, 'path'); node.setAttribute('d', part.s); node.setAttribute('class', 's'); node.setAttribute('stroke-width', part.w || 2.8); }
    el.append(node);
  }
  return el;
}
