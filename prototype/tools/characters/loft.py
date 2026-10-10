"""Surfaces made by joining rings: the way every generated garment and body part is built.

A ring is K+1 points round a centre (the last repeats the first, so a print
can wrap without a seam showing). A tube joins a list of rings. Everything is
drawn in the natural pose, in metres, y up, the person facing +z.
"""
import numpy as np
import meshkit as mk

TILES = 3.2           # repeats of a print per metre of cloth


def ellipse(y, rx, rzf, rzb=None, cx=0.0, cz=0.0, K=16, square=1.0, tilt=0.0, folds=None):
    """A level ring. Starts at the back and goes round by the person's right, front, left.

    rzf and rzb are the depths in front of and behind the centre. `square` below 1
    boxes the ring. `tilt` raises the front (radians). `folds` = (count, depth) ripples it.
    """
    rzb = rzf if rzb is None else rzb
    t = np.pi + np.arange(K + 1) * 2 * np.pi / K
    s, c = np.sin(t), np.cos(t)
    if square != 1.0:
        s = np.sign(s) * np.abs(s) ** square; c = np.sign(c) * np.abs(c) ** square
    k = 1.0
    if folds: k = 1 + folds[1] * np.cos(folds[0] * t)
    x = cx + rx * s * k                 # going round by the right (-x) first
    z = cz + np.where(c >= 0, rzf, rzb) * c * k
    yy = y + tilt * (z - cz)
    pts = np.c_[x, np.full(K + 1, 0.0) + yy, z]
    pts[-1] = pts[0]
    return pts


def circle(centre, axis, r, K=10, front=(0, 0, 1), rb=None, flat=1.0, twist=0.0):
    """A ring square to `axis`. `front` fixes where it starts; `flat` squeezes it front to back; `rb` is the radius behind."""
    axis = np.asarray(axis, float); axis = axis / np.linalg.norm(axis)
    f = np.asarray(front, float); f = f - (f @ axis) * axis
    if np.linalg.norm(f) < 1e-6: f = np.array([1.0, 0, 0]) - axis[0] * axis
    f /= np.linalg.norm(f)
    side = np.cross(axis, f)
    t = np.pi + twist + np.arange(K + 1) * 2 * np.pi / K
    s, c = np.sin(t), np.cos(t)
    rr = np.where(c >= 0, r, r if rb is None else rb) * flat
    pts = np.asarray(centre, float) + np.outer(r * s, side) + np.outer(rr * c, f)
    pts[-1] = pts[0]
    return pts


def tube(rings, weights, slot=8, shade=1.0, cap_start=False, cap_end=False, v0=0.0, tiles=TILES, flip=False, nbones=22):
    """Joins rings into a surface.

    `weights` is one dense row per ring, or per ring a (K+1, nbones) array.
    Slot and shade may be single values, per ring, or per ring per point.
    """
    R = len(rings); K1 = len(rings[0])
    pos = np.concatenate(rings)
    W = np.zeros((R * K1, nbones))
    for i, w in enumerate(weights):
        w = np.asarray(w, float)
        W[i * K1:(i + 1) * K1] = w if w.ndim == 2 else np.tile(w, (K1, 1))

    def spread(value, dtype):
        if np.isscalar(value): return np.full(R * K1, value, dtype=dtype)
        out = np.zeros(R * K1, dtype=dtype)
        for i, v in enumerate(value): out[i * K1:(i + 1) * K1] = v
        return out
    slots = spread(slot, np.int64); shades = spread(shade, np.float64)
    # texture coordinates: round the ring, and along the surface
    girth = np.array([np.linalg.norm(np.diff(r, axis=0), axis=1).sum() for r in rings])
    around = max(1, round(girth.max() * tiles))
    uv = np.zeros((R * K1, 2))
    v = v0
    for i in range(R):
        if i: v += np.linalg.norm(rings[i] - rings[i - 1], axis=1).mean() * tiles
        uv[i * K1:(i + 1) * K1, 0] = np.linspace(0, around, K1)
        uv[i * K1:(i + 1) * K1, 1] = v
    idx = []
    for i in range(R - 1):
        for k in range(K1 - 1):
            a = i * K1 + k; b = a + 1; c = b + K1; d = a + K1
            idx += [[a, b, c], [a, c, d]]
    m = mk.make(pos, np.array(idx), slot=slots, shade=shades, uv=uv)
    # whichever way the rings were listed, the surface faces away from its own middle
    centres = np.repeat(np.array([r[:-1].mean(0) for r in rings]), K1, axis=0)
    if ((m['nrm'] * (pos - centres)).sum(1).mean() < 0) != flip:
        m['idx'] = m['idx'][:, ::-1].copy(); mk.smooth_normals(m)
    mk.set_weights(m, W, nbones)
    _seam_normals(m, R, K1)
    parts = [m]
    for want, ring_i, rev in ((cap_start, 0, True), (cap_end, R - 1, False)):
        if not want: continue
        ring = rings[ring_i][:-1]; centre = ring.mean(0)
        cpos = np.r_[ring, centre[None]]
        n = len(ring)
        cidx = [[k, (k + 1) % n, n] for k in range(n)]
        w = np.asarray(weights[ring_i], float)
        cw = np.r_[w[:-1] if w.ndim == 2 else np.tile(w, (n, 1)), (w[:-1].mean(0) if w.ndim == 2 else w)[None]]
        sl = slots[ring_i * K1]; sh = shades[ring_i * K1]
        cap = mk.make(cpos, np.array(cidx), slot=sl, shade=sh, uv=np.c_[cpos[:, 0], cpos[:, 2]] * tiles)
        # a cap faces away from the rest of the tube
        away = centre - np.concatenate(rings).mean(0)
        if (cap['nrm'].mean(0) @ away) < 0: cap['idx'] = cap['idx'][:, ::-1].copy(); mk.smooth_normals(cap)
        mk.set_weights(cap, cw, nbones)
        parts.append(cap)
    return mk.merge(parts) if len(parts) > 1 else m


def _seam_normals(m, R, K1):
    """The first and last point of each ring are the same place; give them the same normal."""
    n = m['nrm']
    for i in range(R):
        a = i * K1; b = a + K1 - 1
        if np.linalg.norm(m['pos'][a] - m['pos'][b]) > 1e-6: continue
        s = n[a] + n[b]; ln = np.linalg.norm(s)
        if ln > 1e-9: n[a] = n[b] = s / ln


def lerp(a, b, t):
    return a + (b - a) * t


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def profile(table, y):
    """Reads a table of rows (y, v1, v2, ...) at height y, straight between rows."""
    table = np.asarray(table, float)
    return np.array([np.interp(y, table[:, 0], table[:, k]) for k in range(1, table.shape[1])])


def disc(centre, normal, r, K=8, slot=10, shade=1.0, weights=None, nbones=22, lift=0.003, dome=0.4):
    """A small round thing lying on a surface: a button, a bead, a stud."""
    normal = np.asarray(normal, float); normal /= np.linalg.norm(normal)
    ring = circle(np.asarray(centre) + normal * lift, normal, r, K=K, front=(0, 1, 0))[:-1]
    top = np.asarray(centre) + normal * (lift + r * dome)
    pos = np.r_[ring, top[None]]
    idx = [[k, (k + 1) % K, K] for k in range(K)]
    m = mk.make(pos, np.array(idx), slot=slot, shade=shade)
    mk.set_weights(m, np.tile(weights, (K + 1, 1)), nbones)
    return m


def strip(points_a, points_b, weights, slot=8, shade=1.0, nbones=22, tiles=TILES):
    """A band between two lines of points, such as a strap or a sash."""
    A = np.asarray(points_a, float); B = np.asarray(points_b, float); n = len(A)
    pos = np.r_[A, B]
    idx = []
    for k in range(n - 1): idx += [[k, k + 1, n + k + 1], [k, n + k + 1, n + k]]
    run = np.r_[0, np.cumsum(np.linalg.norm(np.diff(A, axis=0), axis=1))]
    uv = np.r_[np.c_[run * tiles, np.zeros(n)], np.c_[run * tiles, np.linalg.norm(B - A, axis=1) * tiles]]
    m = mk.make(pos, np.array(idx), slot=slot, shade=shade, uv=uv)
    w = np.asarray(weights, float)
    mk.set_weights(m, np.r_[w, w] if w.ndim == 2 else np.tile(w, (2 * n, 1)), nbones)
    return m
