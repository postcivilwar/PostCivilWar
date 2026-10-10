"""Lower levels of detail for a hard-surface vehicle, made piece by piece.

The supplied vehicles are assembled from hundreds of separate closed pieces,
most of them boxes with rounded edges (about 190 triangles each). Reducing
such a model as one surface destroys it, so each piece is reduced on its own:

  - a box with rounded edges becomes the same box with one chamfer per edge
    (44 triangles) or, farther off, a plain box (12);
  - anything else (tyres, hubs, posts, the canopy, curved glass) is reduced
    by quadric edge collapse;
  - pieces too small to see at that distance are left out.

Where a piece sits, how big it is and which way it faces never change.
"""
import os, sys
sys.path.append(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'characters'))
import numpy as np
import meshkit as mk


def pieces(m):
    """The separate pieces of a mesh, each with its box and size."""
    k, lab = mk.components(m)
    order = np.argsort(lab, kind='stable')
    bounds = np.r_[0, np.cumsum(np.bincount(lab, minlength=k))]
    out = []
    for c in range(k):
        tri = m['idx'][order[bounds[c]:bounds[c + 1]]]
        used = np.unique(tri)
        remap = np.zeros(len(m['pos']), dtype=np.int64); remap[used] = np.arange(len(used))
        p = {key: m[key][used] for key in mk.VERTEX_KEYS}
        p['idx'] = remap[tri]
        lo = p['pos'].min(0); hi = p['pos'].max(0)
        out.append({'mesh': p, 'lo': lo, 'hi': hi, 'diag': float(np.linalg.norm(hi - lo)), 'tris': len(tri)})
    return out


def box_fit(p):
    """The box a piece fills, if it is a box with bevelled or square edges: (centre, axes, half sizes, bevel width) or None.

    A bevelled box has vertices only near its eight corners, the bevel is the
    same width on every edge, and it fills most of its own bounds.
    """
    pos, idx = p['pos'], p['idx']
    if len(idx) < 12: return None
    fn, area = mk.face_normals(pos, idx)
    if area.sum() < 1e-12: return None
    big = int(np.argmax(area))
    n1 = fn[big]
    # the largest face is a rectangle cut in two: its two short edges are the box's other directions
    tri = pos[idx[big]]
    edges = sorted((tri[(k + 1) % 3] - tri[k] for k in range(3)), key=lambda e: e @ e)
    n2 = edges[1] - (edges[1] @ n1) * n1
    if np.linalg.norm(n2) < 1e-9 or abs(edges[0] @ edges[1]) > 0.05 * np.linalg.norm(edges[0]) * np.linalg.norm(edges[1]): return None
    n2 /= np.linalg.norm(n2)
    n3 = np.cross(n1, n2)
    R = np.stack([n1, n2, n3])
    q = pos @ R.T
    lo = q.min(0); hi = q.max(0); h = (hi - lo) / 2; c = (lo + hi) / 2
    if h.min() < 1e-4: return None
    w = h - np.abs(q - c).min(0)                     # how far in from each pair of faces the vertices reach
    bevel = float(w.max())
    if bevel > h.min() + 1e-4: return None
    if bevel > 1e-4 and (w.max() - w.min()) > 0.2 * bevel + 2e-4: return None
    a, b, cc = pos[idx[:, 0]], pos[idx[:, 1]], pos[idx[:, 2]]
    volume = abs((a * np.cross(b, cc)).sum() / 6.0)
    if volume < 0.7 * 8 * h.prod(): return None
    return c @ R, R, h, bevel


def make_box(fit, like, chamfer=True):
    """A box for a fitted piece: chamfered edges (44 triangles) or plain (12)."""
    centre, R, h, r = fit
    slot = int(like['slot'][0]); uv = like['uv'].mean(0)
    c = min(0.65 * r, 0.9 * h.min()) if chamfer else 0.0
    pts = []; nrm = []
    for k in range(3):
        i, j = (k + 1) % 3, (k + 2) % 3
        for s in (-1, 1):
            for a in (-1, 1):
                for b in (-1, 1):
                    v = np.zeros(3); v[k] = s * h[k]; v[i] = a * (h[i] - c); v[j] = b * (h[j] - c)
                    n = np.zeros(3); n[k] = s
                    pts.append(v); nrm.append(n)
    pts = np.array(pts); nrm = np.array(nrm)
    tris = []
    def quad(a, b, cc, d, n):
        # a b cc d in order round the quad; wound so that it faces along n
        if np.cross(pts[b] - pts[a], pts[cc] - pts[a]) @ n < 0: a, b, cc, d = d, cc, b, a
        tris.append((a, b, cc)); tris.append((a, cc, d))
    V = lambda k, s, a, b: k * 8 + (0 if s < 0 else 4) + (0 if a < 0 else 2) + (0 if b < 0 else 1)
    for k in range(3):
        for s in (-1, 1):
            n = np.zeros(3); n[k] = s
            quad(V(k, s, -1, -1), V(k, s, 1, -1), V(k, s, 1, 1), V(k, s, -1, 1), n)
    if c > 1e-6:
        # one quad along each edge, between the two faces that meet there
        for k in range(3):
            i, j = (k + 1) % 3, (k + 2) % 3
            for s in (-1, 1):
                for a in (-1, 1):
                    # edge between face (k, s) and face (i, a), running along j
                    p0 = V(k, s, a, -1); p1 = V(k, s, a, 1)
                    # on face i its own axes are (j, k): a point with j = b and k = s
                    q0 = V(i, a, -1, s); q1 = V(i, a, 1, s)
                    n = np.zeros(3); n[k] = s; n[i] = a
                    quad(p0, p1, q1, q0, n)
        # and a triangle at each corner
        for s0 in (-1, 1):
            for s1 in (-1, 1):
                for s2 in (-1, 1):
                    a = V(0, s0, s1, s2); b = V(1, s1, s2, s0); cc = V(2, s2, s0, s1)
                    n = np.array([s0, s1, s2], dtype=float)
                    if np.cross(pts[b] - pts[a], pts[cc] - pts[a]) @ n < 0: b, cc = cc, b
                    tris.append((a, b, cc))
    out = mk.make(pts @ R + centre, np.array(tris), slot=slot, uv=np.tile(uv, (len(pts), 1)), nrm=nrm @ R)
    return out


def tagged(m, **tags):
    """The pieces of a mesh, each carrying the given tags (slot name, where it hangs, and so on)."""
    out = pieces(m)
    for p in out: p.update(tags)
    return out


def reduce(parts, rule):
    """A list of pieces at a lower level of detail.

    rule(piece) says what happens to each: 'keep', 'drop', 'chamfer' or
    'plain' (a box, if the piece is one; otherwise it falls through to the
    rule's 'else'), or ('qem', share of triangles kept, fewest allowed).
    A rule may give two answers, (first, otherwise), for pieces that turn
    out not to be boxes.
    """
    out = []; note = {'pieces': 0, 'dropped': 0, 'boxes': 0, 'reduced': 0, 'kept': 0}
    for p in parts:
        note['pieces'] += 1
        act = rule(p); other = 'keep'
        if isinstance(act, tuple) and act[0] in ('chamfer', 'plain'): act, other = act
        if act in ('chamfer', 'plain'):
            fit = box_fit(p['mesh']) if p['tris'] > (44 if act == 'chamfer' else 12) else None
            if fit is not None:
                out.append(make_box(fit, p['mesh'], chamfer=act == 'chamfer' and fit[3] > 1e-4)); note['boxes'] += 1; continue
            act = other
        if act == 'drop': note['dropped'] += 1; continue
        if isinstance(act, tuple) and act[0] == 'qem':
            target = max(act[2], int(round(p['tris'] * act[1])))
            if p['tris'] > target:
                out.append(mk.decimate(p['mesh'], target, slot_seams=False)); note['reduced'] += 1; continue
        out.append(p['mesh']); note['kept'] += 1
    return (mk.merge(out) if out else None), note
