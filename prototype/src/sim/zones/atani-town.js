// Atani, the wider town: the hospital, the schools, the campuses, the
// churches, the housing quarters and the lanes between them.
//
// Like atani.js this is content. It is original and schematic: none of these
// institutions is a real one, and the layout is not a survey.
// Positions are site-grid metres (see atani.js for which way the grid lies).

import { makeBlock, makeChurch, makeFence } from '../layout.js';

const road = (id, name, x0, z0, x1, z1, surface) => Object.freeze({ id, name, x0, z0, x1, z1, surface });
export const TOWN_ROADS = Object.freeze([
  road('college', 'College Road', -5, -470, 5, -216, 'asphalt'),
  road('campus', 'Campus Road', -150, -345, 240, -337, 'laterite'),
  road('lane-w', 'Umuoga Lane', -237, 65.5, -83, 68.5, 'path'),
  road('lane-wx', 'Umuoga Lane', -86, 68.5, -83, 108, 'path'),
  road('lane-wn', 'Umuoga Lane', -86, -35, -83, 65.5, 'path'),
  road('lane-e', 'Odekpe Lane', 86, 65.5, 237, 68.5, 'path'),
  road('lane-en', 'Odekpe Lane', 86, -35, 89, 65.5, 'path'),
  road('lane-ex', 'Odekpe Lane', 86, 68.5, 89, 108, 'path'),
  road('lane-n1', 'Ochuche Lane', -150, -392, -5, -389, 'path'),
  road('lane-n2', 'Akili Lane', -150, -437, -5, -434, 'path'),
  road('lane-ne', 'Ossomala Lane', 168, -462, 171, -345, 'path'),
  road('lane-ne1', 'Ossomala Lane', 171, -392, 238, -389, 'path'),
  road('lane-ne2', 'Ossomala Lane', 171, -437, 238, -434, 'path'),
  road('farm', 'Farm Path', -215, -342.5, -150, -339.5, 'path'),
  road('farm-n', 'Farm Path', -203, -440, -200, -342.5, 'path'),
]);

// ---------------------------------------------------------------- houses --

const WALLS = [0xdcc9a8, 0xc9d6c3, 0xe6d3b8, 0xd6c2c2, 0xcfd9df, 0xe3d6a8, 0xd9c7b0, 0xe8dcc6, 0xbfcfb6, 0xe2c9a6, 0xd4d9c4, 0xf0e2c4];
const ROOFS = [0x7d7f83, 0x8b4a33, 0x5f6a72, 0x7a2f22, 0x355e3b, 0x6e5a4a, 0x4f6272, 0x8a5a3a];
function buildHouses() {
  const list = [];
  const add = (quarter, x, z, door) => {
    const n = list.length;
    list.push(Object.freeze({ id: `house-${String(n + 1).padStart(3, '0')}`, quarter, x, z, w: 8 + (n % 3), d: 6.5 + ((n * 7) % 3) * 0.5, h: 2.9 + ((n * 5) % 3) * 0.15, door, wall: WALLS[(n * 5) % WALLS.length], roof: ROOFS[(n * 3) % ROOFS.length] }));
  };
  for (const x of [-105, -135, -165, -195, -225]) add('Umuoga', x, 96, 's');
  for (let k = 0; k < 10; k += 1) add('Umuoga', -230 + k * 15, 76, 'n');
  for (let k = 0; k < 10; k += 1) add('Umuoga', -230 + k * 15, 58, 's');
  for (const x of [105, 135, 165, 195, 225]) add('Odekpe', x, 96, 's');
  for (let k = 0; k < 10; k += 1) add('Odekpe', 95 + k * 15, 76, 'n');
  for (let k = 0; k < 10; k += 1) add('Odekpe', 95 + k * 15, 58, 's');
  for (const [z, door] of [[-378, 'n'], [-402, 's'], [-423, 'n'], [-448, 's']]) {
    for (let k = 0; k < 9; k += 1) add(z > -410 ? 'Ochuche' : 'Akili', -140 + k * 15, z, door);
    for (let k = 0; k < 4; k += 1) add('Ossomala', 182 + k * 15, z, door);
  }
  return Object.freeze(list);
}
export const TOWN_HOUSES = buildHouses();

// Larger buildings people go into and are not seen in: `beds` is how many
// people one sleeps.
const big = (id, kind, sign, x, z, w, d, h, door, wall, roof, more = {}) => Object.freeze({ id, kind, sign, x, z, w, d, h, door, wall, roof, ...more });
export const TOWN_BUILDINGS = Object.freeze([
  big('mosque', 'service', 'CENTRAL MOSQUE', -100, 20, 11, 9, 3.6, 's', 0xf1efe4, 0x2f6f4f, { dome: 0x2f6f4f }),
  big('hostel-a', 'hostel', 'UNITY HALL', 212, -250, 36, 9, 6.6, 'n', 0xe6dcc4, 0x6e5a4a, { beds: 30 }),
  big('hostel-b', 'hostel', 'RIVER HALL', 212, -314, 36, 9, 6.6, 's', 0xe6dcc4, 0x6e5a4a, { beds: 30 }),
]);

// Roadside kiosks and sheds where trades are plied: open at the front, with
// room for the people who work there. `trade` is who works in it.
const shed = (id, trade, sign, x, z, w, d, face) => Object.freeze({ id, trade, sign, x, z, w, d, face });
export const TOWN_SHEDS = Object.freeze([
  shed('shed-tailor-1', 'tailor', 'GOD\'S TIME TAILORS', -14, 2, 4.4, 3.6, 'e'),
  shed('shed-tailor-2', 'tailor', 'ADA FASHION', -14, 11, 4.4, 3.6, 'e'),
  shed('shed-barber-1', 'barber', 'SMART CUTS', -14, 20, 4.4, 3.6, 'e'),
  shed('shed-barber-2', 'barber', 'CHI-CHI HAIR', -14, 29, 4.4, 3.6, 'e'),
  shed('shed-baker', 'baker', 'GOLDEN LOAF BREAD', -14, 38, 4.4, 3.6, 'e'),
  shed('shed-mech', 'mechanic', 'OBI MOTORS', -104, 127, 7, 4.5, 'n'),
  shed('shed-wood', 'carpenter', 'SURE WOOD FURNITURE', 104, 127, 7, 4.5, 'n'),
  shed('shed-weld', 'welder', 'IRON CITY WELDING', 152, 127, 6, 4.5, 'n'),
  shed('shed-food-1', 'foodvendor', 'MAMA EBERE FOOD', -155, -32, 5, 3.2, 'n'),
  shed('shed-food-2', 'foodvendor', 'IYA BASIRA FOOD', 138, -32, 5, 3.2, 'n'),
  shed('shed-food-3', 'foodvendor', 'CAMPUS BUKA', 12, -268, 5, 3.2, 'w'),
  shed('shed-food-4', 'foodvendor', 'PARK CANTEEN', -68, 104.5, 5, 3.2, 's'),
  shed('shed-food-5', 'foodvendor', 'SWEET MOTHER KITCHEN', 176, -51, 5, 3.2, 's'),
]);

// ------------------------------------------------------------- compounds --
// An institution is a walled compound: a gate, buildings, and what stands in
// the yard. `spine` is the path people walk from the gate.

const R = (x0, z0, x1, z1) => ({ x0, z0, x1, z1 });
const compound = (id, kind, name, sign, rect, gates, buildings, spine, yard, more = {}) => Object.freeze({ id, kind, name, sign, ...rect, fence: makeFence(rect, gates), buildings: Object.freeze(buildings), spine: Object.freeze(spine), yard: Object.freeze(yard), ...more });

const HOSPITAL_WALL = 0xf2f0ea;
const HOSPITAL_ROOF = 0x2f6f73;
const SCHOOL_WALL = 0xf0d9a4;
const SCHOOL_ROOF = 0x8a4b2a;
const CAMPUS_WALL = 0xe8e0d0;
const CAMPUS_ROOF = 0x4a5d6e;

export const TOWN_COMPOUNDS = Object.freeze([
  compound('hospital', 'hospital', 'Asaba General Hospital', 'ASABA GENERAL HOSPITAL', R(-225, -27, -125, 48), [['n', -175, 7], ['s', -162.5, 4]], [
    makeBlock({ id: 'hosp-main', name: 'Out-patients', sign: 'OUT-PATIENTS', x0: -215, z0: 8, x1: -161, z1: 17, face: 'n', wall: HOSPITAL_WALL, roof: HOSPITAL_ROOF, rooms: [['reception', 'Reception and waiting', 14], ['consulting', 'Consulting room 1', 5.5], ['consulting', 'Consulting room 2', 5.5], ['pharmacy', 'Pharmacy', 7], ['lab', 'Laboratory', 7.5], ['office', 'Medical records', 6.5], ['office', 'Medical director', 8]] }),
    makeBlock({ id: 'hosp-emergency', name: 'Accident and emergency', sign: 'EMERGENCY', x0: -155, z0: 8, x1: -133, z1: 17, face: 'n', wall: HOSPITAL_WALL, roof: 0xa3261e, rooms: [['emergency', 'Emergency room', 13], ['consulting', 'Treatment room', 9]] }),
    makeBlock({ id: 'hosp-ward', name: 'Wards', sign: 'WARDS', x0: -215, z0: 30, x1: -161, z1: 39, face: 'n', wall: HOSPITAL_WALL, roof: HOSPITAL_ROOF, rooms: [['ward', 'Male ward', 18], ['ward', 'Female ward', 18], ['ward', 'Children\'s ward', 12], ['office', 'Nurses\' station', 6]] }),
    makeBlock({ id: 'hosp-toilets', name: 'Toilets', x0: -152, z0: 32, x1: -140, z1: 37, face: 'n', h: 2.8, wall: HOSPITAL_WALL, roof: HOSPITAL_ROOF, rooms: [['toilet', 'Toilets (men)', 6], ['toilet', 'Toilets (women)', 6]] }),
  ], [
    [[-175, -40], [-175, -27], [-175, -10], [-175, 3]],
    [[-217, 3], [-175, 3], [-158, 3], [-130, 3]],
    [[-158, 3], [-158, 25], [-217, 25]],
    [[-158, 25], [-146, 25], [-130, 25]],
    [[-162.5, 67], [-162.5, 48], [-162.5, 43.5], [-157.5, 43.5], [-157.5, 25]],
  ], [
    { kind: 'parking', x0: -221, z0: -23, x1: -186, z1: -5, bays: 6 },
    { kind: 'vehicle', vehicle: 'ambulance', x: -138, z: -4, heading: 0 },
    { kind: 'vehicle', vehicle: 'car', x: -215, z: -14, heading: Math.PI / 2, colour: 0x5f6a72 },
    { kind: 'vehicle', vehicle: 'car', x: -203, z: -14, heading: Math.PI / 2, colour: 0x8a1f1f },
    { kind: 'flag', x: -168, z: -18 },
    { kind: 'generator', x: -131, z: 42 },
    { kind: 'tank', x: -220, z: 44 },
    { kind: 'board', x: -181, z: -20, text: ['ASABA GENERAL HOSPITAL', 'Out-patients 8 to 4 · Emergency always open'] },
  ], { ambience: 'hospital' }),

  compound('primary', 'primary', 'Central Primary School', 'CENTRAL PRIMARY SCHOOL', R(100, -27, 215, 48), [['n', 150, 6], ['s', 162.5, 4]], [
    makeBlock({ id: 'pri-a', name: 'Block A', x0: 108, z0: 6, x1: 168, z1: 13.5, face: 'n', wall: SCHOOL_WALL, roof: SCHOOL_ROOF, rooms: [['classroom', 'Primary 1', 9.5], ['classroom', 'Primary 2', 9.5], ['classroom', 'Primary 3', 9.5], ['office', 'Head teacher', 6], ['staffroom', 'Staff room', 9], ['office', 'Bursar and store', 16.5]] }),
    makeBlock({ id: 'pri-b', name: 'Block B', x0: 108, z0: 26, x1: 146, z1: 33.5, face: 'n', wall: SCHOOL_WALL, roof: SCHOOL_ROOF, rooms: [['classroom', 'Primary 4', 9.5], ['classroom', 'Primary 5', 9.5], ['classroom', 'Primary 6', 9.5], ['toilet', 'Toilets', 9.5]] }),
  ], [
    [[150, -40], [150, -27], [150, -12], [150, 2]],
    [[106, 2], [150, 2], [170, 2]],
    [[170, 2], [170, 21], [106, 21]],
    [[170, 21], [170, 40], [162.5, 44], [162.5, 48], [162.5, 67]],
    [[170, 21], [190, 21]],
  ], [
    { kind: 'assembly', x0: 132, z0: -22, x1: 168, z1: -4 },
    { kind: 'flag', x: 157, z: -23.5 },
    { kind: 'pitch', x0: 176, z0: -20, x1: 210, z1: 14, goals: 'z' },
    { kind: 'swing', x: 158, z: 40 },
    { kind: 'slide', x: 166, z: 30 },
    { kind: 'seesaw', x: 152, z: 31 },
    { kind: 'tank', x: 104, z: 44 },
    { kind: 'bell', x: 166.5, z: 3.2 },
  ], { ambience: 'school', hours: [7.5, 14] }),

  compound('secondary', 'secondary', 'Government Secondary School', 'GOVERNMENT SECONDARY SCHOOL', R(85, -128, 235, -55), [['s', 160, 6]], [
    makeBlock({ id: 'sec-a', name: 'Junior block', x0: 95, z0: -88, x1: 152, z1: -80.5, face: 's', wall: 0xdfe6ee, roof: 0x24364f, rooms: [['classroom', 'JSS 1', 9.5], ['classroom', 'JSS 2', 9.5], ['classroom', 'JSS 3', 9.5], ['office', 'Principal', 6.5], ['staffroom', 'Staff room', 9.5], ['office', 'Vice principal and bursar', 12.5]] }),
    makeBlock({ id: 'sec-b', name: 'Senior block', x0: 95, z0: -112, x1: 152, z1: -104.5, face: 's', wall: 0xdfe6ee, roof: 0x24364f, rooms: [['classroom', 'SS 1', 9.5], ['classroom', 'SS 2', 9.5], ['classroom', 'SS 3', 9.5], ['lab', 'Science laboratory', 12.5], ['library', 'Library', 16]] }),
  ], [
    [[160, -40], [160, -55], [160, -66], [160, -76.5]],
    [[92, -76.5], [160, -76.5]],
    [[160, -76.5], [160, -100.5], [92, -100.5]],
    [[160, -100.5], [180, -100.5]],
  ], [
    { kind: 'assembly', x0: 164, z0: -76, x1: 196, z1: -59 },
    { kind: 'flag', x: 180, z: -57.5 },
    { kind: 'pitch', x0: 168, z0: -124, x1: 230, z1: -84, goals: 'x', track: true },
    { kind: 'tank', x: 90, z: -124 },
    { kind: 'bell', x: 154.5, z: -78.8 },
  ], { ambience: 'school', hours: [7.5, 15] }),

  compound('catholic', 'church', 'St. Michael\'s Catholic Church', 'ST. MICHAEL\'S CATHOLIC CHURCH', R(-118, -130, -64, -55), [['s', -91, 6]], [
    makeChurch({ id: 'catholic-church', name: 'St. Michael\'s Catholic Church', x0: -99, z0: -120, x1: -83, z1: -84, front: 's', style: 'catholic', tower: 'left', h: 6.6, wall: 0xefe6d2, roof: 0x7a2f22 }),
    makeBlock({ id: 'parish-house', name: 'Parish house', sign: 'PARISH OFFICE', x0: -76, z0: -116, x1: -69, z1: -94, face: 'w', h: 3.2, wall: 0xefe6d2, roof: 0x7a2f22, rooms: [['office', 'Parish office', 6.5], ['office', 'Priests\' parlour', 6.5], ['hall', 'Catechism room', 9]] }),
  ], [
    [[-91, -40], [-91, -55], [-91, -70], [-91, -81.6]],
    [[-91, -70], [-80.5, -70], [-80.5, -92.5], [-80.5, -117.4]],
  ], [
    { kind: 'grotto', x: -110, z: -66 },
    { kind: 'board', x: -85.5, z: -58, text: ['ST. MICHAEL\'S CATHOLIC CHURCH', 'Mass: weekdays 6.30 · Sundays 6.30, 8.00 and 9.45'] },
    { kind: 'tank', x: -114, z: -126 },
  ], { ambience: 'church', faith: 'catholic' }),

  compound('anglican', 'church', 'All Saints Anglican Church', 'ALL SAINTS ANGLICAN CHURCH', R(-236, -118, -166, -55), [['s', -206, 6]], [
    makeChurch({ id: 'anglican-church', name: 'All Saints Anglican Church', x0: -213, z0: -114, x1: -199, z1: -82, front: 's', style: 'anglican', tower: 'right', h: 5.8, wall: 0xe4e0d6, roof: 0x355e3b }),
    makeBlock({ id: 'vicarage', name: 'Vicarage', sign: 'VICARAGE', x0: -187, z0: -106, x1: -180, z1: -88, face: 'w', h: 3.2, wall: 0xe4e0d6, roof: 0x355e3b, rooms: [['office', 'Vicar\'s office', 7], ['hall', 'Sunday school', 11]] }),
  ], [
    [[-206, -40], [-206, -55], [-206, -68], [-206, -79.6]],
    [[-206, -68], [-191.5, -68], [-191.5, -86.6], [-191.5, -107.4]],
  ], [
    { kind: 'board', x: -200.5, z: -58, text: ['ALL SAINTS ANGLICAN CHURCH', 'Sunday services 7.30 and 10.00 · Bible study Wednesday 5.00'] },
  ], { ambience: 'church', faith: 'anglican' }),

  compound('university', 'university', 'Niger Valley University', 'NIGER VALLEY UNIVERSITY', R(20, -330, 235, -232), [['w', -282, 7]], [
    makeBlock({ id: 'uni-senate', name: 'Senate building', sign: 'SENATE BUILDING', x0: 60, z0: -255, x1: 110, z1: -246, face: 'n', h: 3.8, wall: CAMPUS_WALL, roof: CAMPUS_ROOF, rooms: [['office', 'Vice-chancellor', 8], ['office', 'Registry', 9], ['office', 'Bursary', 9], ['staffroom', 'Senate chamber', 11], ['office', 'Student affairs', 13]] }),
    makeBlock({ id: 'uni-lecture', name: 'Lecture theatres', sign: 'LECTURE THEATRES', x0: 124, z0: -256, x1: 160, z1: -246, face: 'n', h: 4.2, wall: CAMPUS_WALL, roof: CAMPUS_ROOF, rooms: [['lecture', 'Lecture theatre 1', 18], ['lecture', 'Lecture theatre 2', 18]] }),
    makeBlock({ id: 'uni-science', name: 'Faculty of Science', sign: 'FACULTY OF SCIENCE', x0: 60, z0: -318, x1: 110, z1: -309, face: 's', h: 3.8, wall: CAMPUS_WALL, roof: CAMPUS_ROOF, rooms: [['lab', 'Chemistry laboratory', 12.5], ['lab', 'Biology laboratory', 12.5], ['classroom', 'Seminar room', 11], ['office', 'Dean and lecturers', 14]] }),
    makeBlock({ id: 'uni-library', name: 'University library', sign: 'LIBRARY', x0: 124, z0: -319, x1: 160, z1: -309, face: 's', h: 4.2, wall: CAMPUS_WALL, roof: CAMPUS_ROOF, rooms: [['library', 'Reading room', 28], ['office', 'Librarian', 8]] }),
    makeBlock({ id: 'uni-buttery', name: 'Buttery', sign: 'STUDENTS\' BUTTERY', x0: 170, z0: -292, x1: 196, z1: -283, face: 's', h: 3.4, wall: 0xe8c8a0, roof: 0x8a4b2a, rooms: [['cafeteria', 'Buttery', 26]] }),
  ], [
    [[0, -282], [20, -282], [40, -282], [52, -282]],
    [[52, -260.5], [52, -282], [52, -304.5]],
    [[52, -260.5], [115, -260.5], [165, -260.5], [212, -260.5]],
    [[52, -304.5], [115, -304.5], [165, -304.5], [212, -304.5]],
    [[115, -260.5], [115, -282], [115, -304.5]],
    [[165, -260.5], [165, -279], [165, -304.5]],
    [[212, -260.5], [212, -256.5]],
    [[212, -304.5], [212, -307.5]],
  ], [
    { kind: 'arch', x: 20, z: -282, side: 'w', text: 'NIGER VALLEY UNIVERSITY' },
    { kind: 'lawn', x0: 58, z0: -300, x1: 110, z1: -265 },
    { kind: 'lawn', x0: 120, z0: -300, x1: 160, z1: -265 },
    { kind: 'flag', x: 46, z: -276 },
    { kind: 'tank', x: 228, z: -282 },
    { kind: 'generator', x: 226, z: -272 },
  ], { ambience: 'campus' }),

  compound('polytechnic', 'polytechnic', 'Asaba Polytechnic', 'ASABA POLYTECHNIC', R(-150, -330, -18, -232), [['e', -282, 7]], [
    makeBlock({ id: 'poly-admin', name: 'Administration', sign: 'ADMINISTRATION', x0: -78, z0: -255, x1: -30, z1: -246, face: 'n', h: 3.6, wall: 0xe9e2c8, roof: 0x7a2f22, rooms: [['office', 'Rector', 8], ['office', 'Registry and bursary', 10], ['staffroom', 'Staff room', 11], ['classroom', 'Drawing studio', 19]] }),
    makeBlock({ id: 'poly-workshop', name: 'Engineering workshops', sign: 'ENGINEERING WORKSHOPS', x0: -142, z0: -258, x1: -90, z1: -246, face: 'n', h: 4.4, wall: 0xcfcabb, roof: 0x55585c, rooms: [['workshop', 'Mechanical workshop', 21], ['workshop', 'Electrical workshop', 21], ['office', 'Workshop store', 10]] }),
    makeBlock({ id: 'poly-lecture', name: 'Lecture block', sign: 'SCHOOL OF TECHNOLOGY', x0: -142, z0: -318, x1: -84, z1: -309, face: 's', h: 3.6, wall: 0xe9e2c8, roof: 0x7a2f22, rooms: [['classroom', 'ND 1', 12], ['classroom', 'ND 2', 12], ['lab', 'Computer laboratory', 13], ['lecture', 'Main hall', 21]] }),
  ], [
    [[0, -282], [-18, -282], [-24, -282]],
    [[-24, -262.5], [-24, -282], [-24, -304.5]],
    [[-24, -262.5], [-84, -262.5], [-146, -262.5]],
    [[-24, -304.5], [-80, -304.5], [-146, -304.5]],
    [[-84, -262.5], [-80, -304.5]],
  ], [
    { kind: 'arch', x: -18, z: -282, side: 'e', text: 'ASABA POLYTECHNIC' },
    { kind: 'lawn', x0: -74, z0: -300, x1: -30, z1: -268 },
    { kind: 'flag', x: -28, z: -274 },
    { kind: 'generator', x: -146, z: -282 },
  ], { ambience: 'campus' }),

  compound('college', 'college', 'Oshimili College of Education', 'OSHIMILI COLLEGE OF EDUCATION', R(20, -465, 160, -352), [['s', 90, 7]], [
    makeBlock({ id: 'coe-admin', name: 'Administration', sign: 'ADMINISTRATION', x0: 30, z0: -374, x1: 72, z1: -365, face: 's', h: 3.6, wall: 0xe6e9d6, roof: 0x355e3b, rooms: [['office', 'Provost', 8], ['office', 'Registry', 9], ['staffroom', 'Staff room', 11], ['library', 'College library', 14]] }),
    makeBlock({ id: 'coe-lecture', name: 'Lecture block', sign: 'SCHOOL OF EDUCATION', x0: 82, z0: -402, x1: 152, z1: -393, face: 's', h: 3.6, wall: 0xe6e9d6, roof: 0x355e3b, rooms: [['classroom', 'NCE 1', 12], ['classroom', 'NCE 2', 12], ['classroom', 'NCE 3', 12], ['lecture', 'Lecture hall', 19], ['staffroom', 'Lecturers\' room', 15]] }),
    makeBlock({ id: 'coe-demo', name: 'Demonstration block', sign: 'MICRO-TEACHING', x0: 30, z0: -432, x1: 72, z1: -424.5, face: 's', h: 3.4, wall: 0xe6e9d6, roof: 0x355e3b, rooms: [['classroom', 'Micro-teaching room 1', 9.5], ['classroom', 'Micro-teaching room 2', 9.5], ['lab', 'Science methods laboratory', 12.5], ['office', 'Teaching practice office', 10.5]] }),
  ], [
    [[90, -341], [90, -352], [90, -360.5]],
    [[26, -360.5], [90, -360.5], [156, -360.5]],
    [[76, -360.5], [76, -388.5], [76, -420]],
    [[76, -388.5], [156, -388.5]],
    [[26, -420], [76, -420]],
    [[76, -420], [100, -420]],
  ], [
    { kind: 'arch', x: 90, z: -352, side: 's', text: 'OSHIMILI COLLEGE OF EDUCATION' },
    { kind: 'flag', x: 96, z: -356 },
    { kind: 'pitch', x0: 92, z0: -458, x1: 152, z1: -416, goals: 'x' },
    { kind: 'tank', x: 26, z: -458 },
  ], { ambience: 'campus' }),
]);

// The farmland beyond the polytechnic: mounds of yam and rows of cassava.
export const TOWN_FARMLAND = Object.freeze({ x0: -240, z0: -470, x1: -160, z1: -348 });

// --------------------------------------------------------- outdoor spots --
// Places in the open where people stand, sit, trade and gather. Each entry
// is [venue, slot, x, z, facing, pose]. `ring` and `row` make several.

const spots = [];
const one = (venue, slot, x, z, facing = 0, pose = 'stand', ctx = null) => { spots.push({ venue, slot, x: Math.round(x * 100) / 100, z: Math.round(z * 100) / 100, facing: Math.round(facing * 100) / 100, pose, ctx }); };
// people standing round a point, facing in
const ring = (venue, slot, cx, cz, n, radius = 1.3, pose = 'stand', ctx = null) => { for (let i = 0; i < n; i += 1) { const a = (i / n) * Math.PI * 2 + cx * 0.37; one(venue, slot, cx + Math.sin(a) * radius, cz + Math.cos(a) * radius, a + Math.PI, pose, ctx); } };
const row = (venue, slot, x0, z0, x1, z1, n, facing, pose = 'stand', ctx = null) => { for (let i = 0; i < n; i += 1) { const t = n === 1 ? 0.5 : i / (n - 1); one(venue, slot, x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, facing, pose, ctx); } };
const grid = (venue, slot, x0, z0, x1, z1, nx, nz, facing, ctx = null) => { for (let i = 0; i < nx; i += 1) for (let j = 0; j < nz; j += 1) one(venue, slot, x0 + ((x1 - x0) * (i + 0.5)) / nx, z0 + ((z1 - z0) * (j + 0.5)) / nz, facing, 'stand', ctx); };

// The market: who trades at which stall is in atani.js for the three named
// traders; these are the rest. A trader stands on the aisle side of a stall.
const STALL_SPOTS = [];
for (const [z, tz, facing] of [[32, 34.4, 0], [44, 46.4, 0], [76, 73.6, Math.PI], [88, 85.6, Math.PI]]) {
  for (const x of [18, 30, 56, 68]) STALL_SPOTS.push({ x, z, tz, facing });
}
for (const s of STALL_SPOTS) {
  const named = (s.x === 30 && s.z === 44) || (s.x === 56 && s.z === 44) || (s.x === 56 && s.z === 76);
  if (!named) one('market', 'trader', s.x, s.tz, s.facing, 'stand', 'market');
  const away = s.facing === 0 ? 1 : -1;
  one('market', 'customer', s.x - 0.8, s.tz + away * 1.9, s.facing + Math.PI, 'stand', 'market');
  one('market', 'customer', s.x + 0.9, s.tz + away * 2.2, s.facing + Math.PI, 'stand', 'market');
}
// petty traders sit along the middle aisle with their wares on the ground
for (let i = 0; i < 20; i += 1) {
  const x = 15 + i * 3.2;
  if (Math.abs(x - 43) < 2.5) continue;
  one('market', 'petty', x, 56.4, 0, 'sit', 'market');
  one('market', 'petty', x + 1.6, 63.6, Math.PI, 'sit', 'market');
  if (i % 2 === 0) { one('market', 'customer', x + 0.3, 58.1, Math.PI, 'stand', 'market'); one('market', 'customer', x + 1.9, 61.9, 0, 'stand', 'market'); }
}
row('market', 'petty', 12, 52, 12, 44, 4, Math.PI / 2, 'sit', 'market');
row('market', 'petty', 12, 68, 12, 78, 5, Math.PI / 2, 'sit', 'market');
row('market', 'stroll', 24, 60, 70, 60, 8, Math.PI / 2, 'stand', 'market');

// the motor park
row('park', 'wait', -53.5, 64.5, -46.2, 64.5, 6, Math.PI, 'stand', 'park');
ring('park', 'hang', -56, 92, 6, 1.5, 'stand', 'park');
ring('park', 'hang', -64, 74, 5, 1.4, 'stand', 'park');
row('park', 'hawk', -30, 106.2, -16, 106.2, 4, Math.PI, 'stand', 'park');
row('park', 'driver', -61.5, 80, -61.5, 86, 3, Math.PI / 2, 'stand', 'park');

// the waterside
row('shore', 'fish', 30, 140, 62, 140, 5, 0, 'stand', 'shore');
row('shore', 'fish', -62, 140, -26, 140, 6, 0, 'stand', 'shore');
ring('shore', 'mend', 36, 136, 5, 1.4, 'sit', 'shore');
ring('shore', 'mend', -44, 137, 4, 1.3, 'sit', 'shore');
row('shore', 'jetty', 19.4, 150, 19.4, 172, 5, Math.PI / 2, 'stand', 'shore');
row('shore', 'wash', 72, 140, 92, 140, 4, 0, 'stand', 'shore');

// the farms
for (let i = 0; i < 12; i += 1) for (let j = 0; j < 4; j += 1) one('farm', 'field', -232 + j * 7.5 + (i % 2) * 3, -356 - i * 9.5, (i * 7 + j * 3) % 6, 'stand', 'farm');
for (let i = 0; i < 4; i += 1) one('farm', 'field', -196 + (i % 2) * 20, -356 - i * 26, i * 2, 'stand', 'farm');
ring('farm', 'rest', -206, -346, 5, 1.4, 'sit', 'farm');

// the block yard and the building sites
row('yard', 'work', -84, -160, -70, -158, 5, Math.PI, 'stand', 'street');
ring('yard', 'work', -78, -178, 5, 3.2, 'stand', 'street');
ring('yard', 'work', -104, -168, 4, 1.4, 'stand', 'street');
ring('yard', 'site', 100, -214.5, 4, 1.3, 'stand', 'street');
ring('yard', 'site', 60, -143.5, 4, 1.2, 'stand', 'street');
ring('yard', 'site', 150, -214.5, 4, 1.3, 'stand', 'street');

// corners where people with time on their hands gather
ring('street', 'hang', 9.5, 103, 5, 1.4, 'stand', 'street');
ring('street', 'hang', -9, -29, 5, 1.4, 'stand', 'street');
ring('street', 'hang', 30, 131, 5, 1.4, 'sit', 'street');
ring('street', 'hang', -9.5, -134.6, 4, 1.2, 'stand', 'street');
ring('street', 'hang', 9.5, -332, 5, 1.4, 'stand', 'street');
ring('street', 'hang', -79.5, 63, 4, 1.3, 'sit', 'street');
ring('street', 'hang', 83.7, 62.5, 4, 1.2, 'sit', 'street');
ring('street', 'hang', -10, -396, 4, 1.3, 'sit', 'street');
ring('street', 'hang', 178, -350, 4, 1.3, 'sit', 'street');
ring('street', 'hang', -78, 112.5, 4, 1.2, 'stand', 'street');
// where hawkers stop to sell along the roads
for (const [x, z, f] of [[-7.5, 96, Math.PI / 2], [7.5, 30, -Math.PI / 2], [7.5, -24, -Math.PI / 2], [-146, -33.5, Math.PI], [60, -33.5, Math.PI], [130, -46.5, 0], [-7.5, -60, Math.PI / 2], [7.5, -180, -Math.PI / 2], [-7.5, -240, Math.PI / 2], [7.5, -300, -Math.PI / 2], [60, -335.5, Math.PI], [-60, -335.5, Math.PI], [-120, 119.5, 0], [70, 119.5, 0], [150, 106.5, Math.PI], [-170, 106.5, Math.PI], [-7.5, -360, Math.PI / 2], [-169, -46.5, 0], [-80, -46.5, 0], [120, 70, 0], [-150, 70, 0], [-60, -387.5, Math.PI], [200, -387.5, Math.PI], [-7.5, -430, Math.PI / 2], [100, -346.5, 0]]) one('street', 'hawk', x, z, f, 'stand', 'street');
// police beats
for (const [x, z, f] of [[6, 110, -Math.PI / 2], [10, 62, Math.PI / 2], [-30, 100, 1], [6, -34, -Math.PI / 2], [-36, -24, 0.4], [-44, -24, -0.4]]) one('police', 'beat', x, z, f, 'stand', 'street');

// the institutions: gates, yards, assembly grounds, playing fields
one('hospital', 'gate', -171, -25.2, Math.PI, 'stand', 'hospital');
one('hospital', 'gate', -179, -25.2, Math.PI, 'stand', 'hospital');
ring('hospital', 'yard', -190, 0.5, 4, 1.3, 'stand', 'hospital');
ring('hospital', 'yard', -150, 22, 3, 1.2, 'stand', 'hospital');
row('hospital', 'sweep', -210, -2, -135, 22, 4, 0, 'stand', 'hospital');
one('hospital', 'ambulance', -140.6, -4, Math.PI / 2, 'stand', 'hospital');

one('primary', 'gate', 146.2, -25.2, Math.PI, 'stand', 'school');
grid('primary', 'assembly', 134, -20, 166, -6, 16, 10, Math.PI, 'school');
row('primary', 'assembly-front', 140, -22.6, 160, -22.6, 8, 0, 'stand', 'school');
for (let i = 0; i < 40; i += 1) one('primary', 'play', 178 + ((i * 37) % 30), -18 + ((i * 53) % 30), (i * 1.7) % 6.28, 'stand', 'play');
ring('primary', 'play', 158, 36, 6, 1.9, 'stand', 'play');
ring('primary', 'play', 164, 28, 5, 2.2, 'stand', 'play');
ring('primary', 'play', 152, 27, 4, 1.7, 'stand', 'play');
ring('primary', 'play', 185, 30, 6, 1.4, 'stand', 'play');
ring('primary', 'play', 198, 38, 6, 1.5, 'stand', 'play');
ring('primary', 'play', 120, -16, 6, 1.5, 'stand', 'play');
row('primary', 'sweep', 112, 0.5, 164, 0.5, 3, 0, 'stand', 'school');

one('secondary', 'gate', 163.8, -56.8, 0, 'stand', 'school');
grid('secondary', 'assembly', 165, -75, 195, -61, 15, 8, 0, 'school');
row('secondary', 'assembly-front', 170, -58.6, 190, -58.6, 8, Math.PI, 'stand', 'school');
for (let i = 0; i < 40; i += 1) one('secondary', 'play', 172 + ((i * 41) % 54), -120 + ((i * 29) % 32), (i * 1.3) % 6.28, 'stand', 'play');
ring('secondary', 'play', 120, -94, 6, 1.5, 'stand', 'school');
ring('secondary', 'play', 140, -95, 6, 1.5, 'stand', 'school');
ring('secondary', 'play', 100, -68, 6, 1.5, 'stand', 'school');
ring('secondary', 'play', 128, -66, 6, 1.5, 'stand', 'school');
row('secondary', 'sweep', 100, -78, 150, -101, 3, 0, 'stand', 'school');

ring('catholic', 'yard', -91, -62, 5, 1.4, 'stand', 'church');
ring('catholic', 'yard', -104, -76, 4, 1.3, 'stand', 'church');
row('catholic', 'grotto', -112.5, -63.6, -107.5, -63.6, 4, Math.PI, 'stand', 'church');
row('catholic', 'sweep', -96, -74, -72, -88, 3, 0, 'stand', 'church');
ring('anglican', 'yard', -206, -62, 5, 1.4, 'stand', 'church');
ring('anglican', 'yard', -220, -74, 4, 1.3, 'stand', 'church');
row('anglican', 'sweep', -218, -72, -196, -74, 2, 0, 'stand', 'church');

one('university', 'gate', 22, -277, -Math.PI / 2, 'stand', 'campus');
one('university', 'gate', 22, -287, -Math.PI / 2, 'stand', 'campus');
for (const [x, z] of [[70, -270], [96, -270], [70, -294], [96, -294], [84, -282], [132, -270], [150, -270], [132, -294], [150, -294], [141, -282], [180, -270], [200, -272], [186, -300], [44, -268], [44, -296]]) ring('university', 'quad', x, z, 5, 1.4, x % 4 < 2 ? 'sit' : 'stand', 'campus');
one('polytechnic', 'gate', -20, -277, Math.PI / 2, 'stand', 'campus');
for (const [x, z] of [[-40, -274], [-62, -292], [-44, -294], [-100, -282], [-124, -280], [-110, -296], [-66, -270]]) ring('polytechnic', 'quad', x, z, 5, 1.4, x % 4 < -2 ? 'sit' : 'stand', 'campus');
one('college', 'gate', 86, -354, 0, 'stand', 'campus');
for (const [x, z] of [[50, -356.5], [120, -356.5], [100, -378], [130, -380], [50, -410], [60, -386], [110, -412]]) ring('college', 'quad', x, z, 5, 1.4, 'stand', 'campus');
for (let i = 0; i < 16; i += 1) one('college', 'play', 98 + ((i * 37) % 48), -452 + ((i * 23) % 30), (i * 1.9) % 6.28, 'stand', 'play');

export const TOWN_SPOTS = Object.freeze(spots.map(Object.freeze));

// Where okada riders wait for fares: [id, x, z, heading, how many, name].
export const TOWN_RANKS = Object.freeze([
  Object.freeze({ id: 'rank-park', name: 'the motor park', x: -24, z: 102.5, heading: 0, slots: 7, dx: 1.5, dz: 0 }),
  Object.freeze({ id: 'rank-market', name: 'the market gate', x: 7.8, z: 70, heading: -Math.PI / 2, slots: 5, dx: 0, dz: 1.5 }),
  Object.freeze({ id: 'rank-hospital', name: 'the General Hospital', x: -168, z: -32.5, heading: Math.PI, slots: 4, dx: 1.5, dz: 0 }),
  Object.freeze({ id: 'rank-school', name: 'the secondary school gate', x: 166, z: -48.5, heading: 0, slots: 4, dx: 1.5, dz: 0 }),
  Object.freeze({ id: 'rank-campus', name: 'the university gate', x: 8.2, z: -290, heading: -Math.PI / 2, slots: 6, dx: 0, dz: -1.5 }),
  Object.freeze({ id: 'rank-college', name: 'the College of Education', x: 97, z: -347, heading: 0, slots: 4, dx: 1.5, dz: 0 }),
]);

// Where a passenger can ask to be taken: a name and the point on the road.
export const TOWN_STOPS = Object.freeze([
  ['park', 'Motor park', -40, 113], ['market', 'Market gate', 0, 60], ['jetty', 'Jetty', 21, 113], ['registry', 'Lands Registry', 48, -40],
  ['hospital', 'General Hospital', -175, -40], ['primary', 'Central Primary School', 150, -40], ['secondary', 'Government Secondary School', 160, -40],
  ['catholic', 'St. Michael\'s Church', -91, -40], ['yard', 'Block yard', -95, -141], ['layout', 'Niger View Layout', 100, -212],
  ['university', 'Niger Valley University', 0, -282], ['college', 'College of Education', 90, -341], ['umuoga', 'Umuoga quarter', -84.5, 67], ['odekpe', 'Odekpe quarter', 87.5, 67], ['ochuche', 'Ochuche quarter', -75, -390.5],
].map(([id, name, x, z]) => Object.freeze({ id, name, x, z })));

// Sound that belongs to a place: music from a loudspeaker, a generator, a bell.
export const TOWN_SOUNDS = Object.freeze([
  Object.freeze({ id: 'dj-market', kind: 'music', style: 'afrobeat', name: 'A DJ at the market', x: 44, z: 22, from: 8, to: 19, reach: 70 }),
  Object.freeze({ id: 'radio-park', kind: 'music', style: 'highlife', name: 'A radio at the motor park', x: -50, z: 70, from: 6.5, to: 20, reach: 55 }),
  Object.freeze({ id: 'radio-kitchen', kind: 'music', style: 'palmwine', name: 'A radio in the kitchen', x: 64, z: 9, from: 7, to: 20, reach: 32 }),
  Object.freeze({ id: 'radio-barber', kind: 'music', style: 'highlife', name: 'A radio at the barber\'s', x: -14, z: 20, from: 8, to: 19.5, reach: 30 }),
  Object.freeze({ id: 'buttery', kind: 'music', style: 'afrobeat', name: 'Speakers at the buttery', x: 183, z: -288, from: 11, to: 21, reach: 50 }),
  Object.freeze({ id: 'gen-store', kind: 'generator', x: 38, z: 1, from: 18, to: 21, reach: 45 }),
  Object.freeze({ id: 'gen-hospital', kind: 'generator', x: -131, z: 42, from: 0, to: 24, reach: 50 }),
  Object.freeze({ id: 'gen-campus', kind: 'generator', x: 226, z: -272, from: 18, to: 23, reach: 50 }),
  Object.freeze({ id: 'gen-poly', kind: 'generator', x: -146, z: -282, from: 9, to: 16, reach: 45 }),
]);

// Public notices. Each is read out at its hour on the weekdays given
// (0 is Sunday), under the name of the body that issued it.
export const TOWN_NOTICES = Object.freeze([
  Object.freeze({ id: 'levy', hour: 8, days: [1, 2, 3, 4, 5, 6], from: 'local', text: 'Market levy is collected at the stalls today. Ask for your receipt.' }),
  Object.freeze({ id: 'sanitation', hour: 17, days: [5], from: 'state', text: 'Environmental sanitation is tomorrow from 7 to 10. Clear the drains in front of your house.' }),
  Object.freeze({ id: 'immunisation', hour: 9, days: [2, 4], from: 'state', text: 'Immunisation for children under five is at the General Hospital this morning. It is free.' }),
  Object.freeze({ id: 'river', hour: 6.5, days: [0, 1, 2, 3, 4, 5, 6], from: 'local', wet: true, text: 'The river is high after the rain. Keep children away from the bank.' }),
]);
