"""Each habitation model's own measures, in its own units (the owner's files are made one unit across or high): its
height, how far its trunk or base spreads at the ground (what is solid there), how far its crown spreads, and whether
it stands on a base of its own (a mound, a patch of grass): for placing it at its real size (habitation-scene.js).

    python3 tools/habitation/facts.py > tools/habitation/facts.json
"""
import json, os, sys
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import glbio
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
spec = json.load(open(os.path.join(ROOT, 'tools/habitation/models.json')))
out = {}
for name, m in spec['models'].items():
    g = glbio.read(os.path.join(ROOT, 'assets/habitation', name))
    P = g['P']
    k, lab = glbio.components(g['F'], len(P))
    # (stray bits far from the rest, such as the bench's: left out of its measures)
    sizes = np.bincount(lab)
    centre = np.median(P, 0)
    d = np.linalg.norm(P - centre, axis=1)
    keep = d < np.percentile(d, 99.5) * 1.05
    Q = P[keep]
    y0, y1 = Q[:, 1].min(), Q[:, 1].max()
    H = y1 - y0
    low = Q[Q[:, 1] < y0 + 0.06 * H]
    base_c = np.median(low[:, [0, 2]], 0)
    base_r = float(np.percentile(np.linalg.norm(low[:, [0, 2]] - base_c, axis=1), 80)) if len(low) > 4 else 0.02
    mid = Q[(Q[:, 1] > y0 + 0.08 * H) & (Q[:, 1] < y0 + 0.25 * H)]
    trunk_r = float(np.percentile(np.linalg.norm(mid[:, [0, 2]] - np.median(mid[:, [0, 2]], 0), axis=1), 60)) if len(mid) > 4 else base_r
    crown_r = float(np.percentile(np.linalg.norm(Q[:, [0, 2]] - base_c, axis=1), 95))
    xz = np.ptp(Q[:, [0, 2]], 0)
    out[name] = dict(kind=m['kind'], height=round(float(H), 4), base=[round(float(base_c[0]), 4), round(float(y0), 4), round(float(base_c[1]), 4)],
                     base_r=round(base_r, 4), trunk_r=round(trunk_r, 4), crown_r=round(crown_r, 4), across=[round(float(xz[0]), 4), round(float(xz[1]), 4)])
print(json.dumps(out, indent=1))
