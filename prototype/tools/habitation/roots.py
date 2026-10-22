"""Where each of the owner's trees is wood at a walker's height (21 October 2026): its buttresses, its roots arching up,
a mangrove's prop roots, its trunk. A walker is stopped there, not only at the trunk's middle (the owner: free to go
anywhere, as long as nothing stands in the way; the big trees' buttresses reach out 5 to 14 m and were walked through).

For each tree, palm and banana model (the owner's file as supplied, read, never changed): its surface between 0.9 m (a
root lower than that is stepped over, as a step of the ground is) and head height (1.8 m), above its foot at its usual
size, not its leaves (their colour: green to yellow-green),
sampled every 10 cm; each half-metre square where there is at least 0.05 m^2 of it is wood. The squares are written
for its usual size, about the middle of its foot, before it is turned (habitation.js scales and turns them for each
copy, and leaves out any on a path or a deck: a root never closes a way).

    python3 -I tools/habitation/roots.py         writes src/sim/zones/habitation-roots.js
"""
import json, math, os, sys
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import glbio

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
spec = json.load(open(os.path.join(ROOT, 'tools/habitation/models.json')))['models']
facts = json.load(open(os.path.join(ROOT, 'tools/habitation/facts.json')))
CELL, LOW, HIGH, LEAST, STEP = 0.5, 0.9, 1.8, 0.05, 0.1

def hsv(col):
    mx, mn = col.max(1), col.min(1)
    d = mx - mn
    hue = np.zeros(len(col))
    r, g, b = col[:, 0], col[:, 1], col[:, 2]
    k = d > 1e-6
    i = k & (mx == r); hue[i] = (60 * ((g[i] - b[i]) / d[i])) % 360
    i = k & (mx == g); hue[i] = 60 * ((b[i] - r[i]) / d[i]) + 120
    i = k & (mx == b); hue[i] = 60 * ((r[i] - g[i]) / d[i]) + 240
    sat = np.where(mx > 1e-6, d / np.maximum(mx, 1e-6), 0)
    return hue, sat, mx

out = {}
for name, m in spec.items():
    if m['kind'] not in ('tree', 'palm', 'banana'):
        continue
    stem = name.replace('3dmodel', '').replace('.glb', '')
    f = facts[name]
    g = glbio.read(os.path.join(ROOT, 'assets/habitation', name))
    P, F, UV = g['P'], g['F'], g['UV']
    ref = float(m['height'])
    unit = ref / f['height']                     # metres to one of its own units, at its usual size
    y0 = P[:, 1].min()
    Q = np.column_stack([(P[:, 0] - f['base'][0]) * unit, (P[:, 1] - y0) * unit, (P[:, 2] - f['base'][2]) * unit])
    A, B, C = Q[F[:, 0]], Q[F[:, 1]], Q[F[:, 2]]
    lo, hi = np.minimum(np.minimum(A[:, 1], B[:, 1]), C[:, 1]), np.maximum(np.maximum(A[:, 1], B[:, 1]), C[:, 1])
    # (its leaves are not wood: the colour of each triangle's middle)
    col = glbio.sample(glbio.picture(g, 512), (UV[F[:, 0]] + UV[F[:, 1]] + UV[F[:, 2]]) / 3)
    hue, sat, _ = hsv(col)
    leaf = (hue >= 48) & (hue <= 180) & (sat >= 0.06)
    keep = (hi > LOW) & (lo < HIGH) & ~leaf
    A, B, C = A[keep], B[keep], C[keep]
    area = 0.5 * np.linalg.norm(np.cross(B - A, C - A), axis=1)
    wood = {}
    for a, b, c, s in zip(A, B, C, area):
        n = max(1, int(math.ceil(math.sqrt(s) / STEP)))
        # points spread evenly over the triangle (a grid in its own two directions), each standing for its share of it
        u, v = np.meshgrid(np.arange(n) + 0.5, np.arange(n) + 0.5)
        u, v = u.ravel() / n, v.ravel() / n
        inside = u + v <= 1
        u, v = u[inside], v[inside]
        if not len(u):
            u, v = np.array([1 / 3]), np.array([1 / 3])
        p = a + np.outer(u, b - a) + np.outer(v, c - a)
        p = p[(p[:, 1] >= LOW) & (p[:, 1] <= HIGH)]
        if not len(p):
            continue
        each = s / len(u)
        for i, j in zip(np.floor(p[:, 0] / CELL).astype(int), np.floor(p[:, 2] / CELL).astype(int)):
            wood[(i, j)] = wood.get((i, j), 0) + each
    cells = sorted([k for k, v in wood.items() if v >= LEAST])
    out[stem] = dict(ref=ref, cells=[[int(i), int(j)] for i, j in cells])
    reach = max((math.hypot((i + 0.5) * CELL, (j + 0.5) * CELL) for i, j in cells), default=0)
    print(f'{stem:24s} {m["kind"]:7s} {ref:5.1f} m: {len(cells):4d} squares of wood at a walker\'s height, out to {reach:4.1f} m', file=sys.stderr)

body = ',\n'.join(f'  {json.dumps(k)}: {{ ref: {v["ref"]}, cells: {json.dumps(v["cells"], separators=(",", ":"))} }}' for k, v in sorted(out.items()))
open(os.path.join(ROOT, 'src/sim/zones/habitation-roots.js'), 'w').write(f"""// Where each of the owner's trees, palms and bananas is wood at a walker's height (0.9 to 1.8 m above its foot): its
// trunk, its buttresses, its roots arching up, a mangrove's prop roots; not its leaves. Half-metre squares, for the model
// at its usual size (ref, metres high), about the middle of its foot, before it is turned. Made by
// tools/habitation/roots.py from the owner's files as supplied; not edited by hand.
export const HABITATION_ROOT_CELL = {CELL};
export const HABITATION_ROOTS = Object.freeze({{
{body},
}});
""")
