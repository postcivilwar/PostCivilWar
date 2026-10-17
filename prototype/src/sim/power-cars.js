// Cars: the owner's supplied car models, sold new at the Post Civil War Car Showroom (17 October 2026) and driven by
// whoever owns one, round the town and out along the Kwale road, the way a motorcycle is ridden (own-cars.js).
//
// The cars are the owner's twenty models (assets/vehicles/cars/, drawn as supplied: see src/client/car-model.js and
// tools/vehicles/cars.py). A car whose model is a real maker's car is sold under a plain name of the game's own: the
// game shows no maker's name or badge. Each is sold new at its price; a player may own one of each.
//
// The price follows the car's class, read from how it looks, as the motorcycles' does: from about 2,000 TR (the
// owner's word) for an everyday saloon, up through the classics, the pickups and off-roaders, the SUVs, the luxury
// cars and the sports cars, to the supercars. Nothing is claimed about any car's engine: the files say nothing of it,
// and neither does the game. Its top speed and how hard it pulls follow its class.
//
// An entry:
//   id                  how the game knows it (and its model, assets/vehicles/cars/<id>.glb)
//   name                what a player sees
//   class               saloon, classic, pickup, offroad, suv, luxury, limousine, sports, super
//   price               TR, new from the showroom
//   kmh                 its top speed on tar
//   length              metres, nose to tail, that the model is drawn at
//   width, height       metres: its body's width at its wheels (what it takes up on the road), and its height, both
//                       the model's own proportions at that length (cars.py measures them)
//   tone                its engine, made by the game (no recording of a car's engine has been supplied)
//   blurb               a line for the market

// How each class of car goes, in metres, seconds and radians: top speed off the tar, how hard it pulls from a
// standstill, how hard it brakes, how much it grips before it runs wide, its wheelbase and how far its wheels turn.
const CLASSES = Object.freeze({
  saloon: Object.freeze({ rough: 11, accel: 3.6, brake: 9, grip: 7.6, wheelbase: 2.8, steerMax: 0.6 }),
  classic: Object.freeze({ rough: 10, accel: 3.0, brake: 7.5, grip: 6.6, wheelbase: 2.9, steerMax: 0.56 }),
  pickup: Object.freeze({ rough: 17, accel: 3.4, brake: 8.5, grip: 7.0, wheelbase: 3.5, steerMax: 0.58 }),
  offroad: Object.freeze({ rough: 22, accel: 3.8, brake: 8.8, grip: 7.2, wheelbase: 2.9, steerMax: 0.6 }),
  suv: Object.freeze({ rough: 18, accel: 4.4, brake: 9.5, grip: 8.0, wheelbase: 2.95, steerMax: 0.6 }),
  luxury: Object.freeze({ rough: 11, accel: 5.0, brake: 10, grip: 8.8, wheelbase: 3.0, steerMax: 0.58 }),
  limousine: Object.freeze({ rough: 10, accel: 3.8, brake: 9, grip: 7.6, wheelbase: 3.7, steerMax: 0.52 }),
  sports: Object.freeze({ rough: 10, accel: 6.8, brake: 12, grip: 10.5, wheelbase: 2.6, steerMax: 0.6 }),
  super: Object.freeze({ rough: 9, accel: 8.4, brake: 13, grip: 12, wheelbase: 2.6, steerMax: 0.6 }),
});
export const CAR_CLASSES = CLASSES;

// What every car has in common: going backwards, coasting, the air, how quickly the wheels are turned.
export const CAR_HANDLING = Object.freeze({
  reverse: 5,             // m/s at most, in reverse
  coast: 0.9,             // m/s² lost with neither throttle nor brake (the engine and the road)
  drag: 0.00045,          // and the air, by the square of the speed
  steerRate: 2.6,         // radians a second the front wheels turn, towards what is asked
});

// Its engine as the game makes it: how many cylinders, its idle and red line (revolutions a minute), how rough
// its note is, and how loud.
const ENGINES = Object.freeze({
  four: Object.freeze({ cyl: 4, idle: 800, redline: 6500, rasp: 0.12, level: 0.42 }),
  six: Object.freeze({ cyl: 6, idle: 750, redline: 6800, rasp: 0.1, level: 0.45 }),
  v8: Object.freeze({ cyl: 8, idle: 650, redline: 6500, rasp: 0.18, level: 0.5, lope: 0.25 }),
  bigv8: Object.freeze({ cyl: 8, idle: 600, redline: 5600, rasp: 0.2, level: 0.52, lope: 0.4 }),
  v12: Object.freeze({ cyl: 12, idle: 700, redline: 7200, rasp: 0.08, level: 0.46 }),
  flat6: Object.freeze({ cyl: 6, idle: 900, redline: 8500, rasp: 0.16, level: 0.5 }),
  sportv8: Object.freeze({ cyl: 8, idle: 1000, redline: 8500, rasp: 0.16, level: 0.55 }),
  diesel: Object.freeze({ cyl: 6, idle: 700, redline: 4200, rasp: 0.26, level: 0.5, clatter: 0.3 }),
});

const car = (id, name, cls, price, kmh, length, width, height, engine, blurb) => Object.freeze({
  id, name, class: cls, price, kmh, length, width, height, blurb, tone: ENGINES[engine], engine,
});

// The cars on sale, cheapest first. (width and height are the model's own, measured by cars.py at the length given.)
export const POWER_CARS = Object.freeze(Object.fromEntries([
  car('grey-saloon', 'Grey Saloon', 'saloon', 2000, 170, 4.85, 2.1, 1.59, 'four', 'A modern grey saloon with a fastback roof: easy, comfortable, and the place to start.'),
  car('classic-two-tone', 'Classic Two-Tone', 'classic', 2500, 145, 5.0, 1.95, 1.68, 'v8', 'A long fifties saloon in black and white, chrome bumpers, a big grille and tail fins.'),
  car('black-pickup', 'Black Pickup', 'pickup', 3000, 165, 5.6, 2.2, 2.25, 'v8', 'A full-size black pickup with a hard top over its load bed: works all week, still looks sharp.'),
  car('yellow-classic-roadster', 'Yellow Classic Roadster', 'classic', 3500, 200, 4.5, 2.0, 1.32, 'six', 'A classic open roadster in pale yellow, long bonnet, chrome and white-wall tyres.'),
  car('blue-off-roader', 'Blue Off-Roader', 'offroad', 4000, 175, 4.6, 2.3, 1.92, 'v8', 'A wild blue off-roader on huge tyres, roof rack and lamps: built for the bush tracks.'),
  car('black-square-suv', 'Black Square SUV', 'suv', 4500, 190, 4.7, 2.2, 2.12, 'v8', 'A square-cut black SUV, boxy and tough, with a wide stance and dark wheels.'),
  car('camo-expedition', 'Camo Expedition SUV', 'offroad', 5000, 165, 5.0, 2.25, 2.55, 'diesel', 'An expedition SUV in camouflage, a tent box on its roof, spot lamps and a snorkel.'),
  car('mint-sports-coupe', 'Mint Sports Coupé', 'sports', 5000, 260, 4.5, 2.1, 1.24, 'six', 'A low mint-green sports coupé with a dark roof: light, quick and sharp in the turns.'),
  car('white-roadster', 'White Roadster', 'sports', 5500, 250, 4.5, 2.1, 1.31, 'six', 'A white two-seat convertible, roof down, red-trimmed wheels and a sculpted tail.'),
  car('peach-suv', 'Peach Luxury SUV', 'suv', 6000, 220, 5.0, 2.2, 1.97, 'six', 'A tall luxury SUV in peach, its wheels painted to match, smooth as a saloon on the road.'),
  car('black-luxury-suv', 'Black Luxury SUV', 'suv', 6500, 200, 5.2, 2.4, 2.13, 'bigv8', 'A full-size black luxury SUV, three rows, a chrome grille and room for everyone.'),
  car('white-square-suv', 'White Square SUV', 'suv', 7000, 220, 4.85, 2.2, 2.12, 'bigv8', 'A white square-cut SUV with a black bonnet, a spare wheel on its back door and a bull bar.'),
  car('grey-grand-tourer', 'Grey Grand Tourer', 'luxury', 7500, 300, 4.9, 2.2, 1.55, 'v12', 'A grey grand tourer coupé: long, low and fast, for crossing the country in comfort.'),
  car('black-grand-convertible', 'Black Grand Convertible', 'luxury', 8000, 250, 5.3, 2.0, 1.56, 'v12', 'A black grand convertible with white leather and white wheels: quiet, stately, roof down.'),
  car('pearl-convertible', 'Pearl Convertible', 'luxury', 8500, 290, 4.7, 1.9, 1.42, 'sportv8', 'A pearl-white luxury convertible with a dark bonnet and black wheels.'),
  car('midnight-saloon', 'Midnight Saloon', 'luxury', 10000, 250, 5.1, 2.2, 1.67, 'v12', 'A midnight-blue grand saloon, chrome on its grille and its flanks: the quietest car on the floor.'),
  car('state-limousine', 'State Limousine', 'limousine', 12000, 180, 5.8, 2.4, 2.0, 'diesel', 'A black armoured state limousine with flags on its wings: heavy, slow to stop, and impressive.'),
  car('bronze-spyder', 'Bronze Spyder', 'super', 12000, 330, 4.55, 1.95, 1.27, 'sportv8', 'A bronze open supercar, low and wide, with flying buttresses behind its seats.'),
  car('red-winged-supercar', 'Red Winged Supercar', 'super', 14000, 320, 4.4, 1.92, 1.17, 'sportv8', 'A legend in red: a low wedge of a supercar with a great wing across its tail.'),
  car('gold-hypercar', 'Gold Hypercar', 'super', 18000, 350, 4.7, 2.2, 1.6, 'v12', 'A gold hypercar with its doors raised to the sky: the crown of the showroom, and the fastest car in town.'),
].map((c) => [c.id, c])));

// How a car goes: its class's handling, at its own top speed (m/s on tar).
export const carHandlingOf = (c) => Object.freeze({ ...CAR_HANDLING, ...(c ? CLASSES[c.class] : CLASSES.saloon), top: Math.round(((c ? c.kmh : 160) / 3.6) * 100) / 100 });
export const CAR_FASTEST = Math.max(...Object.values(POWER_CARS).map((c) => carHandlingOf(c).top));
export const topKmhOf = (c) => c.kmh;

// The room a car takes where it stands, for walls and kerbs: a row of circles down its length, each as wide as the
// car, near enough together that nothing slips in between them; and, for what walks round it, a square inside each.
// (x, z) is its middle; h its heading (0 faces +z).
export function carCircles(spec, x, z, h) {
  const L = spec ? spec.length : 4.6, W = spec ? spec.width : 1.9;
  const r = W / 2, reach = Math.max(0, L / 2 - r);
  const n = 1 + Math.ceil((2 * reach) / r);
  const ux = Math.sin(h), uz = Math.cos(h), out = [];
  for (let i = 0; i < n; i += 1) { const t = n === 1 ? 0 : -reach + (2 * reach * i) / (n - 1); out.push({ x: x + ux * t, z: z + uz * t, r }); }
  return out;
}
export const carBoxes = (spec, x, z, h) => carCircles(spec, x, z, h).map((c) => { const k = c.r * 0.72; return { x0: c.x - k, z0: c.z - k, x1: c.x + k, z1: c.z + k }; });

// One step of a car being driven.
//   state  { speed, steer, heading }   (changed in place; returned)
//   input  { steer: -1..1 (left negative), throttle: 0..1, brake: 0..1 }
//   onTar  whether the road under it is tarred; wet: whether it is raining
// The front wheels turn towards what is asked, at a rate; the car turns about its back axle as a car does (at a
// speed v with the wheels at δ it turns at v·tanδ/wheelbase), and no harder than its tyres grip: fast, the same
// turn of the wheel turns it less, and it runs wide rather than spinning round. Braking stops it; held when it has
// stopped, the brake takes it backwards (reverse), slowly.
export function stepPowerCar(state, input, dt, { handling = carHandlingOf(null), onTar = true, wet = false } = {}) {
  const h = handling;
  const steer = Math.max(-1, Math.min(1, input.steer || 0));
  const throttle = Math.max(0, Math.min(1, input.throttle || 0));
  const brake = Math.max(0, Math.min(1, input.brake || 0));
  const top = (onTar ? h.top : h.rough) * (wet ? 0.85 : 1);
  let v = state.speed;
  if (brake > 0 && v > 0.05) v = Math.max(0, v - h.brake * (wet ? 0.75 : 1) * brake * dt);
  else if (brake > 0 && v <= 0.05) v = Math.max(-h.reverse, v - 2.2 * brake * dt);
  else if (throttle > 0) {
    if (v < 0) v = Math.min(0, v + h.brake * dt);
    else v += h.accel * throttle * Math.max(0.06, 1 - (v / top) ** 2) * dt;
  } else v -= Math.sign(v) * Math.min(Math.abs(v), (h.coast + h.drag * v * v) * dt);
  if (v > top) v = Math.max(top, v - h.brake * 0.5 * dt);
  // the front wheels: towards what is asked; at speed the steering is quicker to straighten than to turn in
  const want = steer * h.steerMax;
  const rate = h.steerRate * (Math.abs(want) < Math.abs(state.steer) ? 1.6 : 1);
  state.steer += Math.max(-rate * dt, Math.min(rate * dt, want - state.steer));
  // the turn, and no more than the tyres' grip allows (wet roads grip less)
  let yaw = (v * Math.tan(state.steer)) / h.wheelbase;
  const most = (h.grip * (wet ? 0.7 : 1)) / Math.max(1, Math.abs(v));
  if (Math.abs(yaw) > most) yaw = Math.sign(yaw) * most;
  state.heading -= yaw * dt;
  state.speed = Math.abs(v) < 0.02 && !throttle ? 0 : v;
  return state;
}

// How hard the engine is working, 0 (idle) to 1 (the red line): what its sound follows. An automatic box of six
// gears: each takes the revs up and drops them back as it changes up; the last runs out at the top speed.
export function carRevs(speed, throttle, handling = carHandlingOf(null), gears = 6) {
  const share = Math.max(0, Math.min(1, Math.abs(speed) / handling.top));
  const gear = Math.min(gears - 1, Math.floor(share * gears));
  const inGear = share * gears - gear;
  const low = gear === 0 ? 0 : 0.32 + 0.1 * ((gear - 1) / Math.max(1, gears - 2));
  const high = 0.72 + 0.12 * (gear / (gears - 1));
  return Math.max(0, Math.min(1, low + inGear * (high - low) + Math.max(0, Math.min(1, throttle)) * 0.08));
}

export { car as defineCar };
