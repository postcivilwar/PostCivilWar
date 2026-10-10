# Vehicles

Every keke and every coach in the game is one of the two supplied designs.
The shapes are never redrawn. What differs from one vehicle to the next is
paint, cloth, markings, plate, a small accessory, and how worn and dusty it is.

## What is here

| Path | What |
| --- | --- |
| `keke/canonical_keke.glb` | The supplied keke with square lamps ("modern"). **Master: read-only, never edited** |
| `keke/canonical_keke_classic.glb`, `keke/canonical_keke_tvs.glb` | The same keke with the other two supplied fronts. Masters |
| `bus/canonical_ivm_bus.glb` | The supplied coach. Master. The file keeps the name it was supplied under; the name appears nowhere in the game |
| `*/SOURCE-README.md`, `*/reference/` | The notes and renders the models arrived with |
| `*/lod/` | Each level of detail as its own GLB, with the masters' node names (written by the bake) |
| `keke/textures/` | The textures inside the keke masters, pulled out, and the two wear maps made from them. The coach's only textures were two logos, which are not extracted |
| `*/materials/materials.json` | Each surface: which supplied material it is, its colour, roughness and metalness |
| `*/variants/variants.json` | The catalogue of colours and markings (a copy; the source is `src/sim/vehicle-looks.js`) |
| `manifest.json` | Checksums of the masters, triangle counts of every part and level |

`test/vehicles.test.mjs` fails if a master's checksum changes.

## What the supplied models are

| | Keke | Coach |
| --- | --- | --- |
| Size (width × height × length) | 1.63 × 1.92 × 2.58 m; the tub is 1.22 m wide | 2.62 m body, 3.41 m over the mirrors × 3.82 × 11.57 m |
| Triangles | 57,292 (57,828 with round lamps); 46,764 of them are the three wheels | 170,704; 56,688 in the wheels, about 43,000 in seats and curtains |
| Built from | 383 separate pieces (90 in the body), 240 of them boxes with bevelled edges | 1,085 pieces (707 in the body), 793 of them bevelled boxes of 188 triangles each |
| Units, axes | metres, Y up, faces +Z, wheels on the ground at y = 0 | the same |
| Wheels | 3, radius 0.25 m, wheelbase 1.84 m, rear track 1.08 m | 6 tyres on 4 pivots (twins at the back), radius 0.49 m, wheelbase 6.96 m, track 2.26 m |
| Pivots | `Steering_Pivot` (the fork and mudguard turn with it), `Wheel_Front`, `Wheel_Rear_Left`, `Wheel_Rear_Right` | `Steering_Pivot`, `Steering_Pivot_Right`, `Wheel_Front_Left/Right`, `Wheel_Rear_Left/Right` |
| Clips | `Wheel_Roll`, `Steering_Sweep` (demonstrations; the game turns the pivots itself) | the same |
| Materials | 12, one per kind of surface | 16 |
| Textures | paint wear, canopy weave | two small photographed logos (not used) |
| Inside | driver's seat, rear bench, floor | 36 passenger seats, driver's seat, dashboard, curtains, racks, cabin lights |
| Doors | open sides | one, modelled shut, not animated |
| Supplied without | collision shapes, levels of detail | the same |

Three things to know:

- **The three kekes are one keke.** Canopy, tub, seats, windscreen, floor,
  chassis, wheels and tail are the same in all three files, piece for piece
  (77 shared pieces). Only the front differs: lamps, indicators, trim and the
  mudguard. The bake stores the body once and each front separately.
- **The coach is right-hand drive.** Its driver's seat and steering wheel are
  on the vehicle's right (−X) and its door and steps on the left (+X). Nigeria
  drives on the right, so a Nigerian coach is the other way round. The model is
  used as supplied. (Its wheel nodes are named `Left` on the −X side, which is
  the vehicle's right.)
- **The coach is unbranded in the game.** The supplied model carries a real
  maker's name and logos: raised lettering front and rear (14 pieces), a
  photographed badge on the nose and the steering wheel, and a logo on each of
  the 36 seat backs. `tools/vehicles/bake.py` finds those 52 pieces and leaves
  them out of everything it writes: the kit the page loads, the level-of-detail
  files in `bus/lod/` and the material list. The two logo images are not
  extracted or shipped. Nothing else about the coach is changed. Where the
  name stood, a coach shows its invented operator's name (on the bar between
  the head lamps and above the back window). The "CNG BUS" lettering on the
  sides names a fuel, not a maker, and stays. The master file and the renders
  in `bus/reference/` are kept as supplied, for reference only.
  `test/vehicles.test.mjs` fails if a logo slot, logo texture, a piece where a
  letter stood, or the maker's name in any source file comes back.

## Levels of detail

Made by `tools/vehicles/lod.py`, piece by piece, because reducing a model
built of hundreds of separate boxes as one surface destroys it:

- a box with bevelled edges becomes the same box with one chamfer per edge
  (44 triangles) or, farther off, a plain box (12);
- anything else (tyres, hubs, posts, the canopy, curved glass) is reduced by
  quadric edge collapse;
- pieces too small to see at that distance are left out.

Where a piece sits, how big it is and which way it faces never change.

| Level | Keke | Coach | What changes | Used |
| --- | --- | --- | --- | --- |
| Master | 57,292 | 170,704 | nothing | kept in this folder; not shipped in the page |
| Near | 22,420 | 50,244 | **Keke:** body and fork are the master, triangle for triangle (less 480 triangles of no area); tread blocks become plain boxes and wheel bolts are reduced. **Coach:** paint, bodywork, lamps and fittings are the master; window frames, chassis members and seats become chamfered boxes; curtain pleats, glass and tread blocks plain boxes | the keke being driven; a keke within 9 m; a coach within 14 m |
| Middle | 3,978 | 12,096 | plain boxes, reduced curves, no tread or bolts; lettering kept | to 34 m (keke), 60 m (coach) |
| Far | 1,670 | 3,531 | one still piece with its wheels; no cabin, darkened glass on the coach | beyond |

The page ships near, middle and far. The master is 4 MB of geometry for the
coach alone; the near level is what a browser can reasonably carry and draw.
The shadow of a vehicle is cast by its far shape at every level.

## Colours and markings

`src/sim/vehicle-looks.js` is the catalogue. A look is plain data:

```js
{ model: 'keke', trim: 'classic', paint: 'green', canopy: 'black', seat: 'brown', floor: 'green',
  wear: 0.3, dirt: 0.4, slogan: "GOD'S TIME", number: '214', extras: ['curtains'] }
{ model: 'bus', livery: 'blue', cabin: 'maroon', wear: 0.2, dirt: 0.3,
  operator: 'OGBARU LINE', route: 'ATANI · ONITSHA', number: '47', advert: null, extras: ['flaps'] }
```

- **Keke**: 3 fronts × 7 paints (blue, green, red, yellow, white, black,
  orange) × canopy, seat and floor colours; a slogan on the back flap; a number
  on the tub; rolled rain covers under the canopy.
- **Coach**: 7 liveries (blue, green, red, white, yellow, silver, dark), each a
  lower colour, an upper colour and a lettering colour; 4 cabin trims; an
  operator's name on the band, across the top of the windscreen, on the nose
  and above the back window; a fleet
  number; a route on the back; an advert along the side; mud flaps.
- **Wear** fades the paint and roughens it and brings up the specks in the
  keke's own paint texture. **Dirt** is red dust, thickest low down and on the
  wheels.
- Operators, routes and slogans are invented. Adverts name businesses of the
  town the coach stands in and are set in the town's file, not in the rules.

All vehicles of a kind share one set of geometry. A vehicle's colours are a
small table handed to one shared shader, so a new colour costs no geometry and
no new program.

## Collision

The game never collides against the drawn mesh.

- Someone on foot walks round a parked vehicle's footprint: 1.44 × 2.64 m for
  a keke, 2.9 × 11.8 m for a coach, turned to its heading. The mirrors
  overhang it.
- A driven keke is a circle of radius 1.15 m against buildings, trees, parked
  vehicles and other kekes, checked by the simulation on every step.

## Rebuilding

```bash
python3 tools/vehicles/bake.py            # about 20 s; needs numpy, scipy, Pillow
node tools/vehicles/write_variants.mjs
node build.mjs
node --test test/vehicles.test.mjs
```

To look at a supplied file before anything is done with it:

```bash
python3 -I tools/vehicles/inspect_vehicle.py path/to/file.glb
```

## Not done

- No vehicle but the keke can be driven, and nothing drives itself: the game
  has no traffic. The coaches and the townspeople's kekes are parked.
- The coach cannot be entered; its door does not open.
- No suspension, no body roll, no brake or indicator lights in use.
- Reflections come from a plain painted sky, not from the town around the vehicle.
