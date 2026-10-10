"""Hair and everything worn on the head, fitted to the base character's own skull.

Hair is the scalp of the head mesh itself, lifted off the skin by the depth
of the hair, so it follows the head exactly. Caps, head ties and veils are
rings drawn round a measured outline of the head.
"""
import numpy as np
import meshkit as mk
from loft import tube, circle, smoothstep, lerp, strip
from kit import SLOTS

HAIR = SLOTS['hair']
A, B, C = SLOTS['a'], SLOTS['b'], SLOTS['c']
ZC = 0.052                  # the head's own vertical axis sits this far in front of the neck's
TOP = 1.7794


def azimuth(P):
    """Degrees round the head from straight ahead, 0 to 180 either side."""
    return np.degrees(np.abs(np.arctan2(P[:, 0], P[:, 2] - ZC)))


# Where the hair stops, as height against the angle round the head.
HAIRLINES = {
    'full':    [(0, 1.736), (28, 1.733), (48, 1.716), (62, 1.690), (76, 1.668), (92, 1.672), (104, 1.652), (120, 1.622), (150, 1.596), (180, 1.588)],
    'high':    [(0, 1.746), (28, 1.744), (48, 1.728), (62, 1.700), (76, 1.676), (92, 1.676), (104, 1.656), (120, 1.626), (150, 1.600), (180, 1.592)],
    'receded': [(0, 1.770), (25, 1.772), (45, 1.756), (60, 1.716), (76, 1.676), (92, 1.674), (104, 1.652), (120, 1.622), (150, 1.596), (180, 1.588)],
    'crown':   [(0, 1.90), (40, 1.90), (58, 1.742), (70, 1.700), (80, 1.676), (92, 1.674), (104, 1.652), (120, 1.622), (150, 1.596), (180, 1.588)],
}


def hairline(P, kind='full'):
    """Positive where there is hair."""
    t = np.array(HAIRLINES[kind], float)
    az = azimuth(P)
    line = np.interp(az, t[:, 0], t[:, 1])
    f = P[:, 1] - line
    if kind == 'crown':
        # bald on top: hair only round the sides and back
        top = (P[:, 1] > 1.752 - 0.012 * np.clip((az - 60) / 120, 0, 1))
        f = np.where(top, -0.01, f)
    return f


def beard_field(P, style='full'):
    """Positive where a beard grows: along the jaw and round the mouth, not on the lips."""
    from face import lip_field, MOUTH_Y
    az = azimuth(P); y = P[:, 1]; x = np.abs(P[:, 0])
    top = np.interp(az, [0, 18, 34, 55, 75, 90], [1.571, 1.572, 1.586, 1.604, 1.626, 1.648])
    under = np.interp(az, [0, 40, 90], [1.528, 1.532, 1.575])
    f = np.minimum(top - y, y - under)
    if style == 'goatee': f = np.minimum(f, 0.034 - x)
    moustache = np.minimum(np.minimum(y - (MOUTH_Y + 0.0105), (MOUTH_Y + 0.024) - y), 0.031 - x)
    moustache = np.where(P[:, 2] > 0.13, moustache, -0.01)
    f = np.maximum(f, moustache)
    f = np.where(lip_field(P) > -0.0015, -0.01, f)
    return np.where((az < 92) & (P[:, 2] > 0.0), f, -0.01)


def beard(bare, depth=0.0035, style='full'):
    """A short beard and moustache, grown from the face's own surface like the hair."""
    m = mk.weld(bare)
    field = lambda P: beard_field(P, style)
    m = mk.refine(m, field, 0.008, passes=2)
    cut, high = mk.split_by(m, field(m['pos']), 0.0)
    s = mk.take(cut, high)
    mk.smooth_normals(s)
    P = s['pos']
    edge = smoothstep(0.0, 0.007, field(P))
    s['pos'] = P + s['nrm'] * (depth * (0.35 + 0.65 * edge))[:, None]
    s['slot'][:] = HAIR
    s['shade'] = lerp(0.9, 1.06, 0.5 + 0.5 * noise3(P, 180.0, 4))
    mk.smooth_normals(s)
    return s


def noise3(P, scale, seed=0):
    """A repeatable scatter in -1..1 from position."""
    v = np.sin(P @ np.array([12.9898, 78.233, 37.719]) * scale + seed * 3.1) * 43758.5453
    return (v - np.floor(v)) * 2 - 1


def scalp(bare, kind='full'):
    """The part of the bare head that carries hair, joined up smooth."""
    m = mk.weld(bare)
    m = mk.refine(m, lambda P: hairline(P, kind), 0.012, passes=2)
    cut, high = mk.split_by(m, hairline(m['pos'], kind), 0.0)
    s = mk.take(cut, high)
    # ears are skin, whatever the hairline says
    ear = (np.abs(s['pos'][:, 0]) > 0.0815) & (s['pos'][:, 1] < 1.70)
    s = mk.take(s, ~ear[s['idx']].any(axis=1))
    mk.smooth_normals(s)
    return s


def hair(bare, depth, kind='full', top=None, round_to=0.0, rough=0.0015, rows=0, seed=1, shade=(0.9, 1.08)):
    """Hair as a layer over the scalp.

    `depth` is how thick, in metres. `top` thickens the crown (a high-top). `round_to` pulls the outside toward a
    ball, for an afro. `rows` cuts that many furrows front to back (cornrows).
    """
    s = scalp(bare, kind)
    P = s['pos']; N = s['nrm']
    edge = smoothstep(0.0, 0.014, hairline(P, kind))             # thins to nothing at the hairline
    d = np.full(len(P), depth)
    if top:
        up = smoothstep(1.715, 1.765, P[:, 1])
        d = d + (top - depth) * up
    out = P + N * (d * edge)[:, None]
    if round_to:
        c = np.array([0.0, 1.69, ZC - 0.004])
        v = out - c; r = np.linalg.norm(v, axis=1)
        target = c + v / r[:, None] * round_to
        k = edge * 0.75 * smoothstep(1.60, 1.68, P[:, 1])
        out = out + (target - out) * k[:, None]
    if rows:
        furrow = 0.5 + 0.5 * np.cos(P[:, 0] * rows * np.pi / 0.085)
        out = out - N * (depth * 0.55 * (1 - furrow) * edge)[:, None]
        s['shade'] = 0.78 + 0.3 * furrow
    else:
        s['shade'] = lerp(shade[0], shade[1], 0.5 + 0.5 * noise3(P, 180.0, seed))
    if rough: out = out + N * (noise3(P, 95.0, seed + 5) * rough * edge)[:, None]
    s['pos'] = out
    s['slot'][:] = HAIR
    mk.smooth_normals(s)
    s['uv'] = np.c_[P[:, 0], P[:, 1]] * 3.2
    return s


def ball(centre, r, bone, nb, slot=HAIR, K=8, squash=(1, 1, 1), shade=1.0):
    """A bun, a puff or a bobble."""
    w = np.zeros(nb); w[bone] = 1
    rings = []
    for phi in np.linspace(0.02, np.pi - 0.02, 6):
        rings.append(circle(np.asarray(centre) + np.array([0, np.cos(phi) * r * squash[1], 0]), (0, 1, 0), max(np.sin(phi) * r, 1e-4), K=K) * [1, 1, 1])
    m = tube(rings, [w] * len(rings), slot=slot, shade=shade, cap_start=True, cap_end=True, nbones=nb)
    c = np.asarray(centre)
    m['pos'] = c + (m['pos'] - c) * [squash[0], 1, squash[2]]
    mk.smooth_normals(m)
    return m


def braids(rig, count=14, length=0.20, seed=3):
    """Braids hanging from the back and sides of the head to the shoulders."""
    I = rig.index; nb = rig.n
    out = []
    for k in range(count):
        az = np.radians(lerp(72, 288, k / (count - 1)))                  # round the back, ear to ear
        r0 = 0.084 if 95 < np.degrees(az) < 265 else 0.086
        x = np.sin(az) * r0; z = ZC + np.cos(az) * r0 * 1.06
        top_y = 1.66 if abs(np.degrees(az) - 180) > 70 else 1.625
        ln = length * (0.86 + 0.25 * ((k * 7 + seed) % 5) / 4)
        pts = []; ws = []
        for j, t in enumerate((0.0, 0.34, 0.68, 1.0)):
            y = top_y - ln * t
            out_r = 1 + 0.10 * np.sin(np.pi * t) + (0.16 if y < 1.52 else 0.0) * t
            pts.append(np.array([x * out_r, y, ZC + (z - ZC) * out_r - 0.006 * t]))
            w = np.zeros(nb)
            if y > 1.58: w[I['Head']] = 1
            elif y > 1.50: w[I['Head']] = 0.5; w[I['Neck']] = 0.5
            else: w[I['Neck']] = 0.35; w[I['Chest']] = 0.65
            ws.append(w)
        rings = [circle(p, (0, -1, 0), 0.0075 - 0.002 * (j / 3), K=4) for j, p in enumerate(pts)]
        out.append(tube(rings, ws, slot=HAIR, shade=0.88 + 0.06 * (k % 3), cap_end=True, nbones=nb))
    return mk.merge(out)


# -------------------------------------------------------------- outline --

class Outline:
    """How far the head reaches at each height and angle, ears left out. Hats are drawn round this."""

    def __init__(self, bare):
        P = bare['pos']
        P = P[(np.abs(P[:, 0]) < 0.0805) | (P[:, 1] > 1.70)]
        self.ys = np.arange(1.50, 1.790, 0.01)
        self.az = np.arange(0, 181, 15.0)
        r = np.hypot(P[:, 0], P[:, 2] - ZC); a = azimuth(P)
        self.table = np.zeros((len(self.ys), len(self.az)))
        for i, y in enumerate(self.ys):
            for j, t in enumerate(self.az):
                sel = (np.abs(P[:, 1] - y) < 0.012) & (np.abs(a - t) < 13)
                self.table[i, j] = r[sel].max() if sel.any() else 0.0
        # fill gaps, then smooth a little round the head
        for i in range(len(self.ys)):
            row = self.table[i]; ok = row > 0
            if ok.any(): self.table[i] = np.interp(self.az, self.az[ok], row[ok])
        self.table = (self.table + np.roll(self.table, 1, axis=1) * 0 + self.table) / 2

    def r(self, y, az_deg):
        az = np.abs(((np.asarray(az_deg) + 180) % 360) - 180)
        y = np.clip(y, self.ys[0], self.ys[-1])
        i = np.clip(np.searchsorted(self.ys, y) - 1, 0, len(self.ys) - 2)
        t = (y - self.ys[i]) / (self.ys[i + 1] - self.ys[i])
        lo = np.interp(az, self.az, self.table[i]); hi = np.interp(az, self.az, self.table[i + 1])
        return lo + (hi - lo) * t


def _ring(outline, y_fn, off, K, scale=1.0, shift=(0, 0), squash_z=1.0):
    """A ring round the head. y_fn(az) is its height at each angle; `off` its distance off the skin."""
    az = (np.arange(K + 1) * 360.0 / K + 180) % 360        # starts at the back
    pts = []
    for a in az:
        y = y_fn(a)
        r = (outline.r(min(y, 1.772), a) + off) * scale
        t = np.radians(a)
        pts.append([np.sin(t) * r + shift[0], y, ZC + np.cos(t) * r * squash_z + shift[1]])
    pts = np.array(pts); pts[-1] = pts[0]
    return pts


def wrap(rig, outline, front=1.728, back=1.640, height=0.03, off=0.006, bulge=0.0, K=16, slot=A, crown_slot=None, lean=(0.0, 0.0), flat_top=0.0,
         flare=0.0, shade_fn=None, slouch=0.0, cover_ears=False, steps=None, closed=True, squash=1.0):
    """A cap or wrap: rises from an edge that runs from `front` on the forehead to `back` on the nape.

    `height` is how far its top stands above the top of the head. `bulge` fattens the middle. `flat_top` (0..1) squares
    the crown off, `flare` widens it toward the top, `lean` (x, z) shifts the top, `slouch` lets it sag to one side.
    """
    nb = rig.n; w = np.zeros(nb); w[rig.index['Head']] = 1

    def edge(a):
        c = np.cos(np.radians(a))
        y = lerp(back, front, (c + 1) / 2)
        if cover_ears: return y
        # an ordinary cap lifts over the ears
        side = np.exp(-((np.abs(((a + 180) % 360) - 180) - 92) / 24.0) ** 2)
        return y + max(0.0, 1.700 - y) * side
    top_y = TOP + height
    base = _ring(outline, edge, off, K)
    # the widest the head gets above the edge, so the cloth clears it all the way up
    reach = _ring(outline, lambda a: max(edge(a), 1.70), off, K)
    steps = steps or [0.0, 0.16, 0.34, 0.54, 0.72, 0.86, 0.95]
    power = 2.0 + 7.0 * flat_top
    rings = []; shades = []; slots = []
    for s in steps:
        close = max(0.0, 1 - s ** power) ** (1.0 / power) if s > 0 else 1.0
        swell = 1 + (bulge / 0.085) * np.sin(np.pi * min(s * 1.1, 1.0)) + flare * s
        ring = base.copy()
        out = np.maximum(np.hypot(base[:, 0], base[:, 2] - ZC), np.hypot(reach[:, 0], reach[:, 2] - ZC) * min(1.0, s * 6))
        ang = np.arctan2(base[:, 0], base[:, 2] - ZC)
        k = close * swell
        rise = s ** (1.0 - 0.5 * flat_top)
        ring[:, 1] = base[:, 1] + (top_y - base[:, 1]) * rise - slouch * 0.03 * s * s * (0.5 + 0.5 * np.sin(ang))
        # never inside the head: where the skull is wider than the cloth would be, the cloth lies on it
        azd = np.degrees(ang)
        skull = np.array([outline.r(min(y, 1.772), a) + off * 0.8 if y < 1.776 else 0.0 for y, a in zip(ring[:, 1], azd)])
        rr = np.maximum(out * k, skull)
        ring[:, 0] = np.sin(ang) * rr + lean[0] * s + slouch * 0.035 * s * s
        ring[:, 2] = ZC + np.cos(ang) * rr * squash + lean[1] * s
        ring[-1] = ring[0]
        rings.append(ring); shades.append(shade_fn(s) if shade_fn else 1.0)
        slots.append(crown_slot if (crown_slot is not None and s > 0.8) else slot)
    return tube(rings, [w] * len(rings), slot=slots, shade=shades, cap_end=closed, nbones=nb)


def gele(rig, outline, K=18, slot=A, height=0.105, spread=1.8):
    """A gele: bound close over the head, with a broad pleated fan standing up and out above the brow."""
    nb = rig.n; w = np.zeros(nb); w[rig.index['Head']] = 1
    under = wrap(rig, outline, front=1.730, back=1.628, height=0.018, bulge=0.010, K=K, slot=slot)

    def edge(a):
        return lerp(1.700, 1.742, (np.cos(np.radians(a)) + 1) / 2)
    base = _ring(outline, edge, 0.012, K)
    ang = np.arctan2(base[:, 0], base[:, 2] - ZC)
    r0 = np.maximum(np.hypot(base[:, 0], base[:, 2] - ZC), 0.088)
    rows = [  # how far up, how wide, how deep, lean back, depth of the pleats
        (0.00, 1.00, 1.00, 0.000, 0.00), (0.30, 1.22, 1.06, 0.000, 0.03), (0.66, spread * 0.86, 1.02, -0.006, 0.06), (1.00, spread, 0.92, -0.016, 0.08),
        (0.90, spread * 0.72, 0.70, -0.014, 0.04), (0.62, 0.62, 0.55, -0.008, 0.0)]
    rings = []; shades = []
    for n, (up, wide, deep, back, fold) in enumerate(rows):
        ring = base.copy()
        ripple = 1 + fold * np.cos(ang * 8)
        ring[:, 0] = np.sin(ang) * r0 * wide * ripple
        ring[:, 2] = ZC + np.cos(ang) * r0 * deep * ripple + back
        ring[:, 1] = base[:, 1] + height * up * (1 + 0.18 * np.cos(ang))        # a little higher at the front
        ring[-1] = ring[0]
        rings.append(ring); shades.append(0.86 if n >= 4 else 1.0)
    fan = tube(rings, [w] * len(rings), slot=slot, shade=shades, cap_end=True, nbones=nb)
    return mk.merge([under, fan])


def veil(rig, outline, hem=1.20, off=0.011, K=18, slot=A, face=(1.560, 1.726, 58.0)):
    """A hijab: over the head, round the face, down over the shoulders to `hem`."""
    from tailor import TRUNK
    from loft import profile
    I = rig.index; nb = rig.n
    chin, brow, half = face
    rows = [1.802, 1.792, 1.772, 1.745, 1.726, 1.70, 1.67, 1.64, 1.61, 1.585, 1.560, 1.535, 1.51, 1.485, 1.455, 1.42, 1.37, 1.31, 1.25, hem]
    grid = []; W = []
    for y in rows:
        # how wide the opening for the face is at this height
        t = (y - chin) / (brow - chin)
        phi = half * np.sqrt(max(0.0, 1 - (2 * t - 1) ** 2)) ** 0.8 if 0 < t < 1 else 0.0
        az = np.linspace(phi, 360 - phi, K + 1)
        row = []
        for a in az:
            rad = np.radians(a)
            if y > 1.50:
                top = np.sqrt(max(0.0, 1 - ((y - 1.772) / 0.032) ** 2)) if y > 1.772 else 1.0
                ear = 0.012 * np.exp(-((abs(((a + 180) % 360) - 180) - 92) / 28.0) ** 2) * np.exp(-((y - 1.635) / 0.045) ** 2)
                r = (outline.r(min(y, 1.772), a) + off + ear) * top
                under = smoothstep(1.60, 1.52, y)            # under the chin the cloth falls straight, it does not follow the jaw
                r = lerp(r, 0.092 + 0.02 * under, under * 0.85)
                p = [np.sin(rad) * r, y, ZC * (1 - under * 0.55) + np.cos(rad) * r]
            else:
                rx, zf, zb, cz = profile(TRUNK, max(y, 1.20))
                drape = smoothstep(1.50, 1.43, y)
                rx = lerp(0.095, max(rx + 0.03, 0.225), drape) + 0.012 * smoothstep(1.40, 1.22, y)
                rz = lerp(0.095, (zf if np.cos(rad) >= 0 else zb) + 0.032, drape)
                # the hem hangs lower in front and behind than over the arms
                yy = y - (0.07 * np.cos(rad) ** 2 - 0.035) * smoothstep(1.33, hem, y) if y < 1.33 else y
                p = [np.sin(rad) * rx, yy, lerp(ZC * 0.45, cz, drape) + np.cos(rad) * rz]
            row.append(p)
        w = np.zeros(nb)
        if y > 1.56: w[I['Head']] = 1
        elif y > 1.50: w[I['Head']] = 0.5; w[I['Neck']] = 0.5
        elif y > 1.44: w[I['Neck']] = 0.4; w[I['Chest']] = 0.6
        else: w[I['Chest']] = 1
        grid.append(np.array(row)); W.append(w)
    return tube(grid, W, slot=slot, nbones=nb)


def brim(rig, outline, y=1.722, width=0.07, droop=0.012, K=16, slot=A, tilt=0.0, front_only=False):
    """The brim of a hat: a flat ring standing out from the head."""
    nb = rig.n; w = np.zeros(nb); w[rig.index['Head']] = 1

    def at(a): return y + tilt * np.cos(np.radians(a))
    inner = _ring(outline, at, 0.004, K)
    outer = inner.copy()
    for k in range(K + 1):
        v = inner[k] - [0, inner[k][1], ZC]; r = np.linalg.norm(v)
        wd = width
        if front_only:
            a = np.degrees(np.arctan2(inner[k][0], inner[k][2] - ZC))
            wd = width * max(0.0, np.cos(np.radians(a) * 1.25)) ** 1.6 if abs(a) < 72 else 0.0
        outer[k] = inner[k] + v / r * wd - [0, droop * (wd / max(width, 1e-6)), 0]
    return tube([inner, outer], [w, w], slot=slot, nbones=nb)


def catalogue(rig, b, coarse=False):
    """Every kind of hair and headwear, by name, fitted to the bare head `b`."""
    HEAD = rig.index['Head']
    out = Outline(b)
    K = 10 if coarse else 16
    H = {
        'hair.low': hair(b, 0.004), 'hair.fade': hair(b, 0.0025, top=0.013, kind='high'), 'hair.afro': hair(b, 0.03, round_to=0.128, rough=0.004),
        'hair.hightop': hair(b, 0.003, top=0.038, kind='high'), 'hair.receded': hair(b, 0.004, kind='receded'), 'hair.crown': hair(b, 0.004, kind='crown'),
        'hair.cornrows': mk.merge([hair(b, 0.007, rows=7), braids(rig, 8 if coarse else 12, 0.13)]),
        'hair.braids': mk.merge([hair(b, 0.006, rows=9), braids(rig, 10 if coarse else 16, 0.26)]),
        'hair.bun': mk.merge([hair(b, 0.005), ball((0, 1.765, -0.02), 0.045, HEAD, rig.n, K=6 if coarse else 8)]),
        'hair.puff': mk.merge([hair(b, 0.005), ball((0, 1.80, 0.0), 0.075, HEAD, rig.n, squash=(1.15, 0.8, 1.1), K=6 if coarse else 8)]),
        'hair.beard': beard(b), 'hair.goatee': beard(b, style='goatee'),
        'hat.headtie': mk.merge([wrap(rig, out, front=1.730, back=1.625, height=0.035, bulge=0.016, K=K), ball((0.045, 1.775, 0.105), 0.042, HEAD, rig.n, slot=8, squash=(1.5, 0.7, 0.45), K=6)]),
        'hat.scarf': wrap(rig, out, front=1.735, back=1.60, height=0.012, bulge=0.004, off=0.006, cover_ears=True, K=K),
        'hat.gele': gele(rig, out, K=12 if coarse else 18),
        'hat.fila': wrap(rig, out, front=1.738, back=1.705, height=0.062, off=0.010, flat_top=0.7, slouch=0.5, lean=(0.03, 0.0), K=K),
        'hat.hula': wrap(rig, out, front=1.738, back=1.708, height=0.045, off=0.010, flat_top=1.0, K=K, crown_slot=9),
        'hat.knit': mk.merge([wrap(rig, out, front=1.730, back=1.66, height=0.05, off=0.010, bulge=0.006, slouch=0.5, K=K), ball((0.03, 1.826, 0.05), 0.018, HEAD, rig.n, slot=9, K=6)]),
        'hat.hijab': veil(rig, out, K=12 if coarse else 18),
        'hat.straw': mk.merge([wrap(rig, out, front=1.738, back=1.712, height=0.04, off=0.010, flat_top=0.45, K=K), brim(rig, out, y=1.726, width=0.085, droop=0.022, K=K)]),
        'hat.helmet': mk.merge([wrap(rig, out, front=1.738, back=1.705, height=0.03, off=0.014, flat_top=0.15, K=K), brim(rig, out, y=1.729, width=0.05, droop=0.008, front_only=True, K=K)]),
        'hat.beret': wrap(rig, out, front=1.740, back=1.70, height=0.022, off=0.010, bulge=0.016, flat_top=0.5, lean=(0.03, 0.0), K=K),
    }
    return H
