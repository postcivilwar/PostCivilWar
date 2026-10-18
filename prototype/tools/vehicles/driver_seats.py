"""Where the driver sits in each of the owner's cars, and where their hands hold the wheel (18 October 2026, the
owner's brief: a car's driver is seen in it, both hands on the wheel, one of them taking the phone when it is used).

    python3 tools/vehicles/driver_seats.py      reads assets/vehicles/cars/game/ and cars.json, writes each car's
                                                `driver` into cars.json; then cars.py --js puts it in car-parts.js

The models are each one piece, and most have no cabin inside them: the seat and the wheel are placed by the shape of
a car, measured from each model. The cars drive on the right, so the driver sits on the left (+x, as the car faces
+z), a little inside the side of the body, a little over half the wheelbase back from the front axle. They sit at a
car's ordinary seat height, lower in a low car, and never so high that their head would come through the roof: the
model's own roof over where their head is, read from the model (its highest surface there, less the roof's
thickness). In a car with no roof (OPEN: the five convertibles and roadsters) the head is over the windscreen's top,
as in one. The wheel is in front of the driver's chest, its rim at a forearm's reach, leaning back; the hands hold it
at ten to two.

All in the model's own units (each car's file, as the game has it: facing +z, on the ground); `scale` turns metres
into them, from the car's real length (prototype/src/sim/power-cars.js).
"""
import json, os, sys, re
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))
SRC = os.path.join(ROOT, 'assets', 'vehicles', 'cars')

# the cars with no roof over the driver
OPEN = {'white-roadster', 'black-grand-convertible', 'pearl-convertible', 'yellow-classic-roadster', 'bronze-spyder'}
# a person of the game's own height, sitting (metres): from the hips to the top of the head, and to the shoulders
SITTING_HEAD, SITTING_SHOULDER = 0.86, 0.56
ROOF = 0.07                      # the roof's thickness, and room under it


def lengths():
    """Each car's real length, from the game's own list (power-cars.js), read as text."""
    text = open(os.path.join(ROOT, 'src', 'sim', 'power-cars.js')).read()
    out = {}
    for m in re.finditer(r"car\('([\w-]+)', '[^']*', '\w+', \d+, \d+, ([\d.]+),", text):
        out[m.group(1)] = float(m.group(2))
    return out


def load(c):
    buf = open(os.path.join(SRC, 'game', c['files']['mesh']), 'rb').read()
    n = c['vertices']
    P = np.frombuffer(buf, np.float32, n * 3, 0).reshape(n, 3).astype(np.float64)
    at = n * 12 + n * 6 + (n % 2) * 2 + n * 8
    idx = np.frombuffer(buf, np.uint32, c['triangles'] * 3, at).reshape(-1, 3)
    body = idx[:c['parts'][0]]
    return P, body


def heights_at(P, tris, x, z):
    """Every height at which the model's surface crosses the upright line through (x, z): its triangles seen from
    above, each one that the line passes through, and where on it (a cabin's floor, a seat, the roof inside and out)."""
    A, B, C = P[tris[:, 0]], P[tris[:, 1]], P[tris[:, 2]]
    v0x, v0z = B[:, 0] - A[:, 0], B[:, 2] - A[:, 2]
    v1x, v1z = C[:, 0] - A[:, 0], C[:, 2] - A[:, 2]
    v2x, v2z = x - A[:, 0], z - A[:, 2]
    den = v0x * v1z - v1x * v0z
    ok = np.abs(den) > 1e-12
    den = np.where(ok, den, 1.0)
    b = (v2x * v1z - v1x * v2z) / den
    c = (v0x * v2z - v2x * v0z) / den
    a = 1 - b - c
    hit = ok & (a >= -1e-6) & (b >= -1e-6) & (c >= -1e-6)
    return np.sort((a * A[:, 1] + b * B[:, 1] + c * C[:, 1])[hit])


def seat_of(cid, c, real_length):
    s = c['length'] / real_length                        # model units in a metre
    P, body = load(c)
    front = [w for w in c['wheels'][:2]]; rear = [w for w in c['wheels'][2:]]
    zf = sum(w['z'] for w in front) / 2; zr = sum(w['z'] for w in rear) / 2
    H = c['height']
    x = 0.205 * c['body']
    z = zf - 0.56 * (zf - zr)
    # its seat height: a car's ordinary one (a third of its height, between 30 and 52 cm), lower if the roof asks
    hip = min(max(0.30 * s, H * 0.33), 0.52 * s)
    roof = None
    if cid not in OPEN:
        # the roof over the head: the top of the model where the head is (a little ahead of the hips), and no higher
        # than its top on the car's middle line there (a door raised over the car, the hypercar's, is not its roof;
        # nor is anything inside a cabin, which is under the roof)
        tops = [heights_at(P, body, xx, z + 0.1 * s) for xx in (x, 0.0)]
        if all(len(t) for t in tops):
            roof = min(t[-1] for t in tops)
            hip = min(hip, roof - ROOF * s - SITTING_HEAD * s)
            hip = max(hip, 0.16 * s)
    # the wheel: in front of the chest, its rim a forearm's reach away, leaning back by a quarter of a right angle
    wheel = [x, hip + 0.34 * s, z + 0.46 * s]
    r = 0.19 * s
    tilt = 0.42
    u = np.array([0.0, np.cos(tilt), -np.sin(tilt)])           # up the rim, leaning back towards the driver
    left = np.array([1.0, 0.0, 0.0])
    c_ = np.array(wheel)
    hands = [c_ + r * (left * np.sin(np.radians(60)) + u * np.cos(np.radians(60))), c_ + r * (-left * np.sin(np.radians(60)) + u * np.cos(np.radians(60)))]
    feet = [[x + 0.09 * s, 0.10 * s + 0.0, z + 0.86 * s], [x - 0.09 * s, 0.10 * s, z + 0.86 * s]]
    r5 = lambda v: round(float(v), 5)
    return {'hip': [r5(x), r5(hip), r5(z)], 'wheel': [r5(v) for v in wheel], 'radius': r5(r), 'tilt': tilt, 'hands': [[r5(v) for v in h] for h in hands],
            'feet': [[r5(v) for v in f] for f in feet], 'open': cid in OPEN, 'roof': r5(roof) if roof is not None else None}


if __name__ == '__main__':
    path = os.path.join(SRC, 'cars.json')
    manifest = json.load(open(path))
    L = lengths()
    for cid in sorted(manifest):
        manifest[cid]['driver'] = seat_of(cid, manifest[cid], L[cid])
        d = manifest[cid]['driver']; s = manifest[cid]['length'] / L[cid]
        print(f"{cid:24s} hip {[round(v / s, 2) for v in d['hip']]} m  roof {round(d['roof'] / s, 2) if d['roof'] else '-'} m  height {round(manifest[cid]['height'] / s, 2)} m", flush=True)
    json.dump(dict(sorted(manifest.items())), open(path, 'w'), indent=1)
