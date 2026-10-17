// The owner's vehicles of 17 October 2026, each where it belongs: the General Hospital's ambulance, a private jet on a
// stand at Asaba Airport, the red box truck at Nwosu Building Materials and the heavy truck at Udeh Block Industry.
//
// Each is the supplied model exactly as it is, drawn at one uniform scale (render-supplied.js). None of them was
// modelled facing the way the game's vehicles face (+z): `front` is the way its front faces in its own file, in
// radians from +z toward +x, measured from the model (its long axis, and which end of it is low: a cab, a nose);
// `length` is how long it is drawn, front to back, which sets its scale. `width` is how wide it then is, mirrors
// and all (the jet's: its wings). The ambulance is driven by the simulation (care.js); the other three stand where
// they are put, solid, square to the grid, so that the boxes someone walks round are exact.
//
// This file is content, read by the simulation (what is in the way) and by the drawing.

const deg = (d) => (d * Math.PI) / 180;
const box = (x0, z0, x1, z1) => Object.freeze({ x0, z0, x1, z1 });

const supplied = (id, name, file, source, front, length, width, height, more = {}) => Object.freeze({ id, name, file, source, front, length, width, height, ...more });
export const SUPPLIED_VEHICLES = Object.freeze({
  // a box-bodied ambulance in the hospital's white with the red check, PostCivilWar on its sides and its lamps on the roof
  ambulance: supplied('ambulance', 'Ambulance', 'vehicle-ambulance.glb', 'ambulance3dmodel.glb', deg(90.24), 5.7, 2.44, 3.09),
  // a business jet in the PostCivilWar livery, nose to the terminal on the middle stand, its nose wheel at the stop bar
  jet: supplied('jet', 'Private jet', 'vehicle-jet.glb', 'privatejet3dmodel.glb', deg(31.11), 20, 19.5, 6.5, { x: -845, z: -269.5, heading: 0, reach: 700 }),
  // the store's delivery truck, parked beside it, its lettered side to the market
  boxTruck: supplied('boxTruck', 'Red box truck', 'vehicle-box-truck.glb', 'red_box_truck_3d_model.glb', deg(-42.7), 7.2, 2.58, 2.87, { x: 47, z: 5, heading: -Math.PI / 2, reach: 320 }),
  // the block yard's lorry, inside its gate beside the way in, standing ready to go out to the road (clear of the way
  // to the moulds and the shed, and of where the yard's people work)
  heavyTruck: supplied('heavyTruck', 'Heavy truck', 'vehicle-heavy-truck.glb', 'heavytruck3dmodel.glb', deg(67.1), 7.0, 2.87, 3.51, { x: -104, z: -152, heading: 0, reach: 320 }),
});

// What each parked one takes up. The trucks are boxes; the jet is its fuselage, its wings (low enough to walk into)
// and its engines beside the tail; under the tailplane, high up, there is room.
function parkedBoxes(v) {
  const along = Math.abs(Math.sin(v.heading)) > 0.5;
  const half = (l, w) => (along ? [l / 2, w / 2] : [w / 2, l / 2]);
  if (v.id !== 'jet') { const [hx, hz] = half(v.length, v.width); return [box(v.x - hx, v.z - hz, v.x + hx, v.z + hz)]; }
  // (the jet faces +z: its nose at z + length/2)
  const tail = v.z - v.length / 2, wings = tail + v.length * 0.25;
  return [
    box(v.x - 1.4, tail, v.x + 1.4, v.z + v.length / 2),                 // the fuselage
    box(v.x - v.width / 2, wings, v.x + v.width / 2, wings + v.length * 0.25),   // the wings
    box(v.x - 2.2, tail, v.x + 2.2, tail + v.length * 0.25),            // the engines
  ];
}
export const SUPPLIED_VEHICLE_COLLIDERS = Object.freeze(['jet', 'boxTruck', 'heavyTruck'].flatMap((id) => parkedBoxes(SUPPLIED_VEHICLES[id])));
