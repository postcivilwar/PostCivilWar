"""Where the driver sits in each of the owner's cars, and where their hands hold the wheel (18 October 2026, the
owner's brief: a car's driver is seen in it, both hands on the wheel, one of them taking the phone when it is used).

    python3 tools/vehicles/driver_seats.py      reads assets/vehicles/cars/game/ and cars.json, writes each car's
                                                `driver` into cars.json; then cars.py --js puts it in car-parts.js

What can be seen of a driver depends on the model. Most of the supplied cars are a closed shell, their windows painted
on, with nothing inside: no one in them can be seen from anywhere, and the game does not draw a driver there (`seen`
false). Ten can be looked into: the five with their tops down, the classic saloon whose window openings are empty, the
hypercar with its doors raised, the winged supercar, and the two big four-by-fours whose windows are open. Which, is
found here, not listed: a way out from where the driver's head is, out of the car through no surface of it.

Those ten have their cabins modelled, and in them the seat and the wheel are the model's own: each was read from
the model's cross-sections through the driver's seat (every surface over the driver's line, drawn and measured by
eye, 18 October 2026), MEASURED below: the hips a hand's breadth in front of the seat back and a little above the
cushion, the middle of the steering wheel. In the closed shells the seat is placed by the shape of the car (a little
over half the wheelbase back from the front axle, at a seat height that leaves the head room under the roof).

The cars drive on the right, so the driver sits on the left (+x, as the car faces +z). Every height and distance in
the table is in metres; what is written is in the model's own units (each car's file, as the game has it: facing +z,
on the ground), as its lamps are.
    hip     [x, y, z]  where the hips are
    wheel   [x, y, z]  the middle of the steering wheel; radius, and tilt (radians the rim leans back from upright)
    feet    [[x, y, z] left, right]  on the pedals
    roof    the height of the underside of the roof over the head (null when there is none over it)
    seen    whether anything inside can be seen from outside
"""
import json, os, sys, re
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))
SRC = os.path.join(ROOT, 'assets', 'vehicles', 'cars')

# Read from each cabin's cross-sections (metres): the hips (z, y), the middle of the wheel (z, y) and its radius, the
# floor of the footwell
MEASURED = {
    'white-roadster':          {'hip': (-0.35, 0.48), 'wheel': (0.04, 0.80), 'r': 0.17, 'floor': 0.27},
    'yellow-classic-roadster': {'hip': (-0.66, 0.62), 'wheel': (-0.20, 0.93), 'r': 0.19, 'floor': 0.40},
    'black-grand-convertible': {'hip': (-0.18, 0.64), 'wheel': (0.32, 0.98), 'r': 0.17, 'floor': 0.40},
    'pearl-convertible':       {'hip': (-0.33, 0.55), 'wheel': (0.15, 0.88), 'r': 0.17, 'floor': 0.37},
    'bronze-spyder':           {'hip': (-0.13, 0.53), 'wheel': (0.37, 0.80), 'r': 0.17, 'floor': 0.30},
    'gold-hypercar':           {'hip': (-0.26, 0.58), 'wheel': (0.08, 0.97), 'r': 0.16, 'floor': 0.40},
    'red-winged-supercar':     {'hip': (0.02, 0.37), 'wheel': (0.50, 0.68), 'r': 0.15, 'floor': 0.25},
    'classic-two-tone':        {'hip': (0.45, 0.66), 'wheel': (0.84, 0.97), 'r': 0.20, 'floor': 0.31},
    'peach-suv':               {'hip': (0.11, 0.89), 'wheel': (0.45, 1.20), 'r': 0.17, 'floor': 0.63},
    'white-square-suv':        {'hip': (-0.04, 0.99), 'wheel': (0.32, 1.28), 'r': 0.17, 'floor': 0.73},
}
SITTING_HEAD = 0.81             # metres from the hips to the top of the head, sitting back in a car seat
ROOF = 0.07                     # a roof's thickness
TILT = 0.38                     # radians a steering wheel's rim leans back from upright


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


def escapes(P, tris, o, d):
    """Does the ray from o along d leave the model without meeting any of its triangles?"""
    A, B, C = P[tris[:, 0]], P[tris[:, 1]], P[tris[:, 2]]
    e1, e2 = B - A, C - A
    p = np.cross(d, e2)
    det = (e1 * p).sum(1)
    ok = np.abs(det) > 1e-12
    inv = np.where(ok, 1.0 / np.where(ok, det, 1), 0)
    t = o - A
    u = (t * p).sum(1) * inv
    q = np.cross(t, e1)
    v = (q * d).sum(1) * inv
    w = (q * e2).sum(1) * inv
    return not (ok & (u >= 0) & (v >= 0) & (u + v <= 1) & (w > 1e-6)).any()


# the ways out from the driver's head that someone outside could look in along: up, out of the side, and between
SIGHT = [(0, 1, 0), (1, 0, 0), (1, 1, 0), (0, 1, -1), (1, 0.25, 0), (1, 0.3, 0.6), (1, 0.3, -0.6), (-1, 0.2, 0),
         (0, 0.3, 1), (0, 0.6, 1), (0, 0.45, -1), (0.5, 0.5, -1), (0.6, 0.6, 1)]


def seat_of(cid, c, real_length):
    s = c['length'] / real_length                        # model units in a metre
    P, body = load(c)
    zf = sum(w['z'] for w in c['wheels'][:2]) / 2; zr = sum(w['z'] for w in c['wheels'][2:]) / 2
    x = 0.205 * c['body']
    m = MEASURED.get(cid)
    if m:
        z, hip = m['hip'][0] * s, m['hip'][1] * s
        wheel = [x, m['wheel'][1] * s, m['wheel'][0] * s]
        r, floor = m['r'] * s, m['floor'] * s
    else:
        # a closed shell: the hips a little over half the wheelbase back from the front axle, as high as the head room
        # under the roof allows (a tall car's seat is higher), between 30 and 95 cm
        z = zf - 0.56 * (zf - zr)
        tops = [heights_at(P, body, xx, z - 0.1 * s) for xx in (x, 0.0)]
        roof_m = min(t[-1] for t in tops) / s if all(len(t) for t in tops) else 1.45
        room = 0.1 + 0.08 * min(1, max(0, (roof_m - 1.2) / 0.7))
        hip = min(max(roof_m - ROOF - room - SITTING_HEAD, 0.30), 0.95) * s
        wheel = [x, hip + 0.33 * s, z + 0.44 * s]
        r = 0.18 * s
        floor = max(hip - 0.30 * s, 0.2 * s)
    # the roof over the head (its underside), if there is one: the lowest surface over the head's place, above the
    # shoulders
    # (only what spans the car as a roof does, over its middle line too: not a seat back or a roll hoop behind the head)
    over = [h[h > hip + 0.5 * s] for h in (heights_at(P, body, x, z - 0.1 * s), heights_at(P, body, 0.0, z - 0.1 * s))]
    roof = float(over[0][0]) if len(over[0]) and len(over[1]) and abs(over[0][0] - over[1][0]) < 0.25 * s else None
    # can anything inside be seen from outside: a way out from where the head is, through no surface of the model, and
    # wide enough to look through (every one of a bundle of lines a few centimetres apart gets out: a crack between
    # two of a model's pieces lets one through, not all)
    seen = False
    for up in (0.55, 0.72):
        for d in SIGHT:
            d = np.array(d, float); d /= np.linalg.norm(d)
            if all(escapes(P, body, np.array([x + dx * s, hip + (up + dy) * s, z + (dz - 0.05) * s]), d)
                   for dx, dy, dz in ((0, 0, 0), (0, 0.05, 0), (0, -0.05, 0), (0, 0, 0.05), (0, 0, -0.05), (-0.04, 0, 0))):
                seen = True; break
        if seen: break
    # the feet on the pedals: on the footwell's floor, as far ahead of the hips as the legs reach from that height
    reach = min(max(0.95 - (hip - floor) / s, 0.55), 0.85) * s
    feet = [[x + 0.1 * s, floor + 0.08 * s, z + reach], [x - 0.1 * s, floor + 0.08 * s, z + reach]]
    r5 = lambda v: round(float(v), 5)
    return {'hip': [r5(x), r5(hip), r5(z)], 'wheel': [r5(v) for v in wheel], 'radius': r5(r), 'tilt': TILT,
            'feet': [[r5(v) for v in f] for f in feet], 'roof': r5(roof) if roof is not None else None, 'seen': seen}


if __name__ == '__main__':
    path = os.path.join(SRC, 'cars.json')
    manifest = json.load(open(path))
    L = lengths()
    for cid in sorted(manifest):
        manifest[cid]['driver'] = d = seat_of(cid, manifest[cid], L[cid])
        s = manifest[cid]['length'] / L[cid]
        m = lambda v: round(v / s, 2)
        print(f"{cid:24s} {'seen' if d['seen'] else '    '}  hip {[m(v) for v in d['hip']]}  wheel {[m(v) for v in d['wheel']]}  roof {m(d['roof']) if d['roof'] else '-'}  "
              f"head room {m(d['roof'] - d['hip'][1]) if d['roof'] else '-'} m", flush=True)
    json.dump(dict(sorted(manifest.items())), open(path, 'w'), indent=1)
