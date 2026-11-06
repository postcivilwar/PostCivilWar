"""Where the dials are in each car with a cabin of its own (6 November 2026, the owner's brief, part 3: "The 10 cars whose
models already have their own cabins ...: keep their own seats and steering wheels exactly as made; add ... only what's
missing (the doors' insides, lit dials), in the same style").

Their dashboards are the models' own, painted: the dials the game lights at night are put on them where the driver
looks at them. From where the driver's eyes are (over the hips, as tools/vehicles/driver_seats.py measured them) lines
are drawn through the wheel's upper half, from near its middle out toward its rim, and the one nearest halfway up whose
view is clear (nothing of the wheel, its hub or its spokes in the way, for a hand's width either side) is followed on
until it meets the model's surface beyond the wheel, within a third of a metre: the dashboard there (a car's glass, now
glass, is looked through). The dials go a few millimetres in front of it, facing the eyes; where no line is clear, or
none meets anything within reach, none.

    python3 tools/vehicles/dials.py         reads assets/vehicles/cars/game/ and cars.json, writes src/client/car-dials.js

Written in the model's own units (as the car's `driver`): `at`, the middle of the dials; `facing`, the way they face
(toward the eyes, a unit vector); `size`, how wide (their height a third of it).
"""
import json, os
import numpy as np
from driver_seats import ROOT, SRC, lengths, load

OUT = os.path.join(ROOT, 'src', 'client', 'car-dials.js')
EYE_UP, EYE_BACK = 0.66, 0.06     # metres: the eyes over the hips, and back from them
WIDE = 0.22                       # metres: the dials' width


def first_hit(P, tris, o, d, far):
    """Where the ray from o along d first meets the model, within `far`; or None."""
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
    s = (q * e2).sum(1) * inv
    hit = ok & (u >= 0) & (v >= 0) & (u + v <= 1) & (s > 1e-6) & (s < far)
    return float(s[hit].min()) if hit.any() else None


def main():
    cars = json.load(open(os.path.join(SRC, 'cars.json')))
    real = lengths()
    out = {}
    for cid in sorted(cars):
        c = cars[cid]; d = c.get('driver')
        if not d or not d.get('seen') or cid not in real: continue
        m = c['length'] / real[cid]                # the model's units in a metre
        P, body = load(c)
        # (a car whose painted windows are glass now: its glass is looked through, windows.py)
        bits = os.path.join(SRC, 'game', f'{cid}-glass.bin')
        if os.path.exists(bits):
            glass = np.unpackbits(np.frombuffer(open(bits, 'rb').read(), np.uint8), bitorder='little')[:len(body)].astype(bool)
            body = body[~glass]
        hip, wheel, r, tilt = np.array(d['hip']), np.array(d['wheel']), d.get('radius', 0.038), d.get('tilt', 0.38)
        eye = hip + np.array([0, EYE_UP * m, -EYE_BACK * m])
        upward = np.array([0, np.cos(tilt), -np.sin(tilt)])
        found = None
        # (through the wheel's upper half, nearest halfway up first, where the dials are seen between its spokes)
        for f in sorted(np.arange(0.3, 0.86, 0.05), key=lambda v: abs(v - 0.55)):
            through = wheel + upward * f * r
            ray = through - eye; reach = np.linalg.norm(ray); ray /= reach
            # (a clear view: from the eyes, the first thing met on this line, and on lines a hand's width either side
            # of it, is past the wheel, its rim and its column, 6 cm on)
            clear = True
            for dx in (-0.05 * m, 0.0, 0.05 * m):
                q = through + np.array([dx, 0, 0]) - eye; ql = np.linalg.norm(q); q /= ql
                s = first_hit(P, body, eye, q, ql + 0.34 * m)
                if s is None or s < ql + 0.06 * m: clear = False; break
            if not clear: continue
            s = first_hit(P, body, eye, ray, reach + 0.34 * m)
            found = (f, eye + ray * (s - 0.008 * m), -ray, (s - reach) / m)
            break
        if found is None:
            print(cid, 'no clear view of a dashboard within a third of a metre beyond the wheel'); continue
        f, at, facing, beyond = found
        out[cid] = {'at': [round(float(v), 5) for v in at], 'facing': [round(float(v), 4) for v in facing], 'size': round(WIDE * m, 5)}
        print(cid, 'dials', round(beyond, 3), 'm beyond the wheel, seen through it', round(float(f), 2), 'of the way up', out[cid])
    lines = ',\n'.join(f' {json.dumps(k)}: {json.dumps(v, separators=(",", ":"))}' for k, v in out.items())
    open(OUT, 'w').write(
        '// Written by tools/vehicles/dials.py from the game\'s own copies of the cars (6 November 2026). Do not edit by hand.\n'
        '// For each car with a cabin of its own: where its dials are drawn, lit at night (the model\'s own units): their middle,\n'
        '// the way they face (toward the driver\'s eyes), how wide.\n'
        f'export const CAR_DIALS = Object.freeze({{\n{lines}\n}});\n')
    print('written', OUT, len(out), 'cars')


if __name__ == '__main__':
    main()
