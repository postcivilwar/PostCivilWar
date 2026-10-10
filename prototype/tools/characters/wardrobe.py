"""The wardrobe: every generated garment, body part, shoe and accessory.

Each is drawn on the skeleton in the natural pose from a handful of
measurements: where the hem falls, how much ease, how long the sleeve.
Colours are not chosen here. A garment marks its cloth as colour a, b, c or d
and the game gives each a colour, or a print, when someone puts it on.
"""
import numpy as np
import meshkit as mk
from loft import tube, circle, ellipse, lerp, smoothstep, disc, strip, profile
from tailor import Tailor, paint, TRUNK, NECK, SKIN, A, B, C, D


# ---------------------------------------------------------------- necklines --

def scoop(width=0.078, depth=0.06):
    def f(P):
        v = 1 - np.sqrt((P[:, 0] / width) ** 2 + ((NECK[0] + 0.004 - P[:, 1]) / depth) ** 2)
        return np.where((P[:, 2] > 0.035) & (P[:, 1] > 1.30), v * 0.03, -0.03)
    return f


def vee(width=0.06, depth=0.11, top=NECK[0] + 0.006):
    def f(P):
        v = width * (P[:, 1] - (top - depth)) / depth - np.abs(P[:, 0])
        return np.where((P[:, 2] > 0.035) & (P[:, 1] < top + 0.01), v, -0.03)
    return f


def front_strip(half, y0, y1):
    def f(P):
        v = np.minimum(half - np.abs(P[:, 0]), np.minimum(P[:, 1] - y0, y1 - P[:, 1]))
        return np.where(P[:, 2] > 0.03, v, -0.03)
    return f


# -------------------------------------------------------------------- tops --

def tee(T):
    body = T.column(0.895, ease_fn=lambda y: 0.019 if y < 1.12 else 0.013, slot=A)
    return mk.merge([body, T.arms(end=0.55, ease=0.013, ease_end=0.022, slot=A), T.collar(stand=0.008, slot=B)])


def polo(T):
    body = T.column(0.89, ease_fn=lambda y: 0.019 if y < 1.12 else 0.014, slot=A)
    body = paint(body, front_strip(0.014, 1.36, 1.53), B, detail=0.02)
    return mk.merge([body, T.arms(end=0.5, ease=0.014, ease_end=0.02, slot=A, cuff=(0.012, 0.001, B)), T.collar(height=0.03, spread=0.014, slot=B, open_front=0.012),
                     T.buttons([1.40, 1.45], ease=0.016, r=0.005, slot=C)])


def shirt(T, sleeve=1.9, pockets=1):
    body = T.column(0.875, ease_fn=lambda y: 0.021 if y < 1.12 else 0.015, slot=A)
    body = paint(body, front_strip(0.013, 0.87, 1.53), A, detail=0.03)          # the placket: a clean edge, shaded below
    body['shade'] = np.where((np.abs(body['pos'][:, 0]) < 0.0135) & (body['pos'][:, 2] > 0.03), 0.93, body['shade'])
    parts = [body, T.arms(end=sleeve, ease=0.014, ease_end=0.012 if sleeve > 1 else 0.022, slot=A, cuff=(0.035, 0.003, A) if sleeve > 1 else None),
             T.collar(height=0.034, spread=0.013, slot=A, open_front=0.010, shade=0.96), T.buttons([0.95, 1.06, 1.17, 1.28, 1.39, 1.47], ease=0.018, r=0.005, slot=C)]
    if pockets and not T.coarse: parts.append(T.patch(1.27, 1.345, 0.055, 0.125, ease=0.017, slot=A, shade=0.92, nx=2, ny=2))
    return mk.merge(parts)


def uniform(T):
    """A uniform shirt: short sleeves, shoulder straps, two chest pockets, a belt."""
    body = T.column(0.92, ease_fn=lambda y: 0.019 if y < 1.12 else 0.015, slot=A)
    parts = [body, T.arms(end=0.55, ease=0.014, ease_end=0.022, slot=A), T.collar(height=0.034, spread=0.013, slot=A, open_front=0.010, shade=0.95),
             T.buttons([1.10, 1.21, 1.32, 1.43], ease=0.018, r=0.005, slot=C), T.band(0.925, 0.04, ease=0.022, slot=B)]
    if not T.coarse:
        for sx in (-1, 1):
            parts.append(T.patch(1.27, 1.345, 0.05 * sx, 0.125 * sx, ease=0.017, slot=A, shade=0.9, nx=2, ny=2))
            S = T.side['L' if sx > 0 else 'R']['S']
            a = np.array([[S[0] * 0.55, 1.498, 0.035], [S[0] * 1.08, 1.482, 0.035]]); b = a - [0, 0, 0.05]
            parts.append(strip(a, b, T.w(Chest=1), slot=B, nbones=T.nb))
    return mk.merge(parts)


def singlet(T):
    body = T.column(0.89, ease=0.011, slot=A)
    body = paint(body, scoop(0.085, 0.085), SKIN, detail=0.02)
    arm_hole = lambda P: np.where(P[:, 1] > 1.33, (np.abs(P[:, 0]) - 0.118) + (P[:, 1] - 1.40) * 0.55, -0.03)
    return paint(body, arm_hole, SKIN, detail=0.025)


def blouse(T):
    body = T.column(0.905, ease=0.013, slot=A, flare=0.03, flare_from=1.06, folds=(6, 0.05))
    body = paint(body, scoop(0.082, 0.066), SKIN, detail=0.02)
    return mk.merge([body, T.arms(end=0.42, ease=0.02, ease_end=0.034, slot=A, cuff=(0.012, -0.012, B))])


def buba(T, sleeve=1.5):
    """A loose pull-over top with wide sleeves: the buba of iro and buba, and under an agbada."""
    body = T.column(0.84, ease=0.03, slot=A, square=0.92)
    body = paint(body, scoop(0.074, 0.03), SKIN, detail=0.02)
    return mk.merge([body, T.arms(end=sleeve, ease=0.028, ease_end=0.058, slot=A)])


def senator(T):
    """A long tunic with a short buttoned neck: a senator, worn over matching trousers."""
    body = T.column(0.60, ease=0.019, slot=A, flare=0.012, flare_from=1.0, free=0.35)
    body = paint(body, front_strip(0.017, 1.30, 1.53), B, detail=0.02)
    return mk.merge([body, T.arms(end=1.9, ease=0.015, ease_end=0.012, slot=A, cuff=(0.03, 0.003, A)), T.collar(stand=0.016, slot=A),
                     T.buttons([1.33, 1.39, 1.45], ease=0.021, r=0.0055, slot=C), None if T.coarse else T.patch(1.27, 1.335, 0.06, 0.12, ease=0.021, slot=A, shade=0.92, nx=2, ny=2)])


def isiagu(T):
    """An isi agu: a roomy pull-over tunic in a lion's-head print, gold at the neck."""
    body = T.column(0.76, ease=0.024, slot=A, free=0.4)
    body = paint(body, front_strip(0.016, 1.34, 1.53), B, detail=0.02)
    return mk.merge([body, T.arms(end=1.3, ease=0.022, ease_end=0.034, slot=A), T.collar(stand=0.012, slot=B), T.buttons([1.37, 1.42, 1.47], ease=0.026, r=0.006, slot=B)])


def kaftan(T):
    """A long kaftan to the shin, embroidered at the chest."""
    body = T.column(0.25, ease=0.024, slot=A, flare=0.03, flare_from=0.95, folds=(7, 0.035), free=0.3)
    body = paint(body, front_strip(0.04, 1.30, 1.53), B, detail=0.025)
    return mk.merge([body, T.arms(end=1.9, ease=0.022, ease_end=0.03, slot=A)])


def agbada(T):
    """An agbada or babban riga: a wide robe to the shin with great open sleeves, embroidered on the chest."""
    body = T.column(0.27, ease=0.04, slot=A, flare=0.075, flare_from=1.25, flare_z=0.03, folds=(6, 0.06), free=0.6, wide_shoulder=0.02)
    yoke = lambda P: np.where(P[:, 2] > 0.03, np.minimum(0.085 - np.abs(P[:, 0]) - 0.25 * np.maximum(0, 1.33 - P[:, 1]), P[:, 1] - 1.19), -0.03)
    body = paint(body, yoke, B, detail=0.025)
    sleeves = []
    for s in ('L', 'R'):
        sleeves.append(T.arm(s, end=1.62, ease=0.045, ease_end=0.135, slot=A, steps=[0.0, 0.2, 0.45, 0.75, 1.05, 1.35, 1.62], flat=0.62))
    return mk.merge([body] + sleeves)


def coat(T):
    """A doctor's white coat, open at the neck over a shirt and tie."""
    body = T.column(0.57, ease=0.025, slot=A, flare=0.012, flare_from=1.0, free=0.5)
    body = paint(body, vee(0.062, 0.30), B, detail=0.02, inset=0.004)
    body = paint(body, lambda P: np.where((P[:, 2] > 0.03) & (body_is(P, B)), np.minimum(0.013 - np.abs(P[:, 0]), P[:, 1] - 1.235), -0.03), C, detail=0.012)
    parts = [body, T.arms(end=1.9, ease=0.021, ease_end=0.018, slot=A), T.collar(height=0.05, spread=0.02, slot=A, open_front=0.03, shade=0.95), T.buttons([1.0, 1.1, 1.19], ease=0.027, r=0.007, slot=D, x=0.012)]
    if not T.coarse:
        for sx in (-1, 1): parts.append(T.patch(0.80, 0.93, 0.045 * sx, 0.135 * sx, ease=0.027, slot=A, shade=0.92, nx=2, ny=2))
        parts.append(T.patch(1.27, 1.345, 0.06, 0.125, ease=0.027, slot=A, shade=0.92, nx=2, ny=2))
    return mk.merge(parts)


def body_is(P, slot):
    return np.ones(len(P), dtype=bool)


def tunic(T):
    """A health worker's tunic: short sleeves, a small V at the neck, trimmed in a second colour."""
    body = T.column(0.86, ease=0.019, slot=A)
    body = paint(body, vee(0.045, 0.075), SKIN, detail=0.02)
    parts = [body, T.arms(end=0.55, ease=0.016, ease_end=0.024, slot=A, cuff=(0.016, 0.001, B)), T.collar(stand=0.006, slot=B)]
    if not T.coarse: parts += [T.patch(1.27, 1.34, 0.06, 0.125, ease=0.021, slot=A, shade=0.92, nx=2, ny=2), T.patch(0.90, 0.99, 0.05, 0.13, ease=0.021, slot=A, shade=0.92, nx=2, ny=2), T.patch(0.90, 0.99, -0.13, -0.05, ease=0.021, slot=A, shade=0.92, nx=2, ny=2)]
    return mk.merge(parts)


def nurse_dress(T):
    """A nurse's dress to the knee: collar, cuffs and belt in a second colour."""
    body = T.column(0.50, ease=0.016, slot=A, flare=0.03, flare_from=1.0, folds=(6, 0.03), free=0.3)
    return mk.merge([body, T.arms(end=0.5, ease=0.016, ease_end=0.022, slot=A, cuff=(0.018, 0.001, B)), T.collar(height=0.036, spread=0.016, slot=B, open_front=0.012),
                     T.band(1.055, 0.035, ease=0.02, slot=B), T.buttons([1.14, 1.24, 1.34, 1.44], ease=0.018, r=0.005, slot=C)])


def cassock(T):
    """A cassock: black to the ankle, close in the body, buttoned down the front, with a white tab at the collar."""
    body = T.column(0.085, ease=0.015, slot=A, flare=0.045, flare_from=1.02, folds=(9, 0.035), free=0.25)
    neck = T.collar(stand=0.024, slot=A)
    neck = paint(neck, lambda P: np.where(P[:, 2] > 0.04, 0.014 - np.abs(P[:, 0]), -0.03), B, detail=0.006)
    ys = list(np.linspace(0.30, 1.47, 14))
    return mk.merge([body, T.arms(end=1.92, ease=0.012, ease_end=0.012, slot=A, cuff=(0.03, 0.003, A)), neck, T.buttons(ys, ease=0.017, r=0.0052, slot=C)])


def chasuble(T):
    """A chasuble for Mass: a broad vestment hanging from the shoulders front and back, with a band down the middle."""
    body = T.column(0.42, ease=0.035, slot=A, flare=0.09, flare_from=1.40, flare_z=0.012, folds=(4, 0.03), free=0.8, wide_shoulder=0.045)
    body = paint(body, lambda P: 0.03 - np.abs(P[:, 0]), B, detail=0.03)
    sleeves = [T.arm(s, end=0.95, ease=0.05, ease_end=0.085, slot=A, steps=[0.0, 0.3, 0.62, 0.95], flat=0.6) for s in ('L', 'R')]
    return mk.merge([body] + sleeves + [T.collar(stand=0.012, slot=B)])


def gown(T, hem=0.43):
    """A dress: fitted above the waist, flaring to the hem."""
    body = T.column(hem, ease=0.014, slot=A, flare=0.06, flare_from=1.05, folds=(8, 0.045), free=0.35)
    body = paint(body, scoop(0.08, 0.062), SKIN, detail=0.02)
    return mk.merge([body, T.arms(end=0.42, ease=0.016, ease_end=0.026, slot=A), T.band(1.06, 0.03, ease=0.018, slot=B)])


def long_dress(T):
    """A long dress to the ankle with long sleeves."""
    body = T.column(0.095, ease=0.02, slot=A, flare=0.055, flare_from=1.10, folds=(8, 0.045), free=0.3)
    return mk.merge([body, T.arms(end=1.9, ease=0.02, ease_end=0.032, slot=A), T.collar(stand=0.01, slot=B)])


def boubou(T):
    """A woman's boubou: a wide gown to the ankle with open sleeves."""
    body = T.column(0.10, ease=0.035, slot=A, flare=0.07, flare_from=1.25, flare_z=0.035, folds=(7, 0.05), free=0.6)
    body = paint(body, scoop(0.08, 0.05), SKIN, detail=0.02)
    body = paint(body, lambda P: np.where((P[:, 2] > 0.03) & (P[:, 1] < 1.52), 0.012 - np.abs(np.sqrt((P[:, 0] / 0.095) ** 2 + ((1.516 - P[:, 1]) / 0.068) ** 2) - 1) * 0.09, -0.03), B, detail=0.02)
    sleeves = [T.arm(s, end=1.25, ease=0.04, ease_end=0.10, slot=A, steps=[0.0, 0.25, 0.55, 0.9, 1.25], flat=0.65) for s in ('L', 'R')]
    return mk.merge([body] + sleeves)


def hivis(T):
    """A high-visibility vest worn over a shirt."""
    body = T.column(0.90, ease=0.03, slot=A)
    # the armholes and the neck are cut away cleanly, then the two reflective bands are sewn on
    cut_away = lambda P: np.maximum(np.where(P[:, 1] > 1.30, (np.abs(P[:, 0]) - 0.122) + (P[:, 1] - 1.40) * 0.5, -0.03), np.where(P[:, 2] > 0.03, 0.062 * (P[:, 1] - 1.34) / 0.17 - np.abs(P[:, 0]), -0.03))
    body = paint(body, cut_away, D, detail=0.025)
    body = mk.take(body, (body['slot'][body['idx']] != D).all(axis=1))
    for y0, y1 in ((1.02, 1.07), (1.22, 1.27)):
        body = paint(body, lambda P, y0=y0, y1=y1: np.minimum(P[:, 1] - y0, y1 - P[:, 1]), B, detail=0.03)
    return body


# ----------------------------------------------------------------- bottoms --

def trousers(T, ease=0.015, hem_ease=0.024):
    return mk.merge([T.seat(waist=1.045, ease=0.009, slot=A, band=(0.03, B)), T.legs(ease=ease, ease_end=hem_ease, slot=A)])


def shorts(T):
    return mk.merge([T.seat(waist=1.045, ease=0.009, slot=A, band=(0.03, B)), T.legs(end=0.9, ease=0.02, ease_end=0.03, slot=A)])


def wrapper(T, hem=0.10, ease=0.012, top=1.075):
    """A wrapper tied at the waist. The free edge shows as a line down the front."""
    body = T.column(hem, top=top, ease=ease, slot=A, flare=0.004, flare_from=0.9, folds=(5, 0.025), free=0.12)
    edge = (np.abs(body['pos'][:, 0] - 0.055) < 0.012) & (body['pos'][:, 2] > 0.03)
    body['shade'] = np.where(edge, 0.82, body['shade'])
    return mk.merge([body, T.band(top - 0.012, 0.03, ease=ease + 0.008, slot=A, shade=0.92)])


def skirt(T, hem=0.47):
    body = T.column(hem, top=1.06, ease=0.012, slot=A, flare=0.035, flare_from=0.96, folds=(6, 0.03), free=0.3)
    return mk.merge([body, T.band(1.045, 0.025, ease=0.016, slot=B)])


# -------------------------------------------------------------------- body --

def bare_arms(T, start=0.0):
    return T.arms(start=start, end=2.0, slot=SKIN, cap=start <= 0)


def bare_legs(T, start=0.55):
    return T.legs(start=start, end=2.0, slot=SKIN)


FOOT = [(-0.058, 0.03, 0.04), (-0.05, 0.062, 0.058), (-0.02, 0.07, 0.078), (0.015, 0.072, 0.07), (0.06, 0.082, 0.05), (0.105, 0.092, 0.036), (0.14, 0.09, 0.027), (0.172, 0.07, 0.02), (0.186, 0.03, 0.012)]
SHOE = [(-0.066, 0.03, 0.045), (-0.058, 0.07, 0.074), (-0.025, 0.08, 0.10), (0.015, 0.082, 0.092), (0.055, 0.09, 0.072), (0.098, 0.098, 0.06), (0.135, 0.096, 0.052), (0.168, 0.082, 0.044), (0.19, 0.045, 0.026)]
BOOT = [(-0.07, 0.03, 0.05), (-0.062, 0.076, 0.12), (-0.025, 0.088, 0.165), (0.02, 0.088, 0.15), (0.06, 0.094, 0.078), (0.105, 0.103, 0.062), (0.145, 0.1, 0.055), (0.185, 0.085, 0.045), (0.208, 0.04, 0.025)]


def bare_feet(T):
    return mk.merge([T.foot_loft(s, FOOT, SKIN, y0=0.012) for s in ('L', 'R')])


def shoes(T):
    out = []
    for s in ('L', 'R'):
        out.append(T.foot_loft(s, SHOE, A, y0=0.02)); out.append(T.sole(s, SHOE, thick=0.022, slot=B))
    return mk.merge(out)


def boots(T):
    out = []
    for s in ('L', 'R'):
        out.append(T.foot_loft(s, BOOT, A, y0=0.026)); out.append(T.sole(s, BOOT, thick=0.03, slot=B, welt=0.006))
    return mk.merge(out)


def sandals(T, thong=False):
    """A sole with straps, worn on bare feet."""
    out = []
    for s in ('L', 'R'):
        A_, f, right = T.foot_frame(s)
        out.append(T.sole(s, FOOT, thick=0.012, slot=A, welt=0.006))
        w = T.w(**{f'Foot_{s}': 1})
        base = np.array([A_[0], 0, A_[2]])

        def arc(dist, width, height, half=0.011):
            ts = np.linspace(0, np.pi, 6)
            a = [base + f * (dist - half) + right * np.cos(t) * (width / 2 + 0.004) + np.array([0, 0.012 + np.sin(t) * height, 0]) for t in ts]
            b = [p + f * 2 * half for p in a]
            return strip(a, b, w, slot=B, nbones=T.nb)
        if thong:
            toe = base + f * 0.15 + np.array([0, 0.014, 0])
            for side in (-1, 1):
                a = [toe, base + f * 0.09 + right * side * 0.03 + [0, 0.05, 0], base + f * 0.04 + right * side * 0.047 + [0, 0.02, 0]]
                b = [p + np.array([0, 0.0, 0]) + f * 0.012 for p in a]
                out.append(strip(a, b, w, slot=B, nbones=T.nb))
        else:
            out.append(arc(0.11, 0.092, 0.04)); out.append(arc(0.035, 0.075, 0.075, half=0.009))
    return mk.merge(out)


# ------------------------------------------------------------- accessories --

def beads(T, drop=0.085, r=0.0075, slot=A):
    """A string of beads round the neck, lying on the chest."""
    n = 20 if not T.coarse else 10
    ts = np.linspace(0, 2 * np.pi, n + 1)
    path = []
    for t in ts:
        c = np.cos(t)                                # 1 at the front
        y = 1.485 - drop * (0.5 + 0.5 * c) ** 1.5
        rx, zf, zb, cz = profile(TRUNK, min(y, 1.474))
        rx = min(rx + 0.016, 0.09 + 0.02 * (0.5 + 0.5 * c)); rz = (zf if c >= 0 else zb) + 0.018
        path.append([np.sin(t) * rx, y, cz + c * rz])
    path = np.array(path)
    rings = []
    for k in range(n + 1):
        d = path[(k + 1) % n] - path[(k - 1) % n]
        rings.append(circle(path[k], d, r * (1.0 if k % 2 else 0.72), K=5))
    rings[-1] = rings[0]
    return tube(rings, [T.w(Chest=1)] * len(rings), slot=slot, nbones=T.nb)


def stethoscope(T):
    """A stethoscope hung round the neck."""
    pts = []
    for t in np.linspace(-1, 1, 13):
        a = t * 2.35                                   # round the back of the neck and down both sides of the chest
        c = np.cos(a)
        y = 1.488 if abs(t) < 0.5 else 1.488 - (abs(t) - 0.5) * 0.52
        rx, zf, zb, cz = profile(TRUNK, min(y, 1.474))
        if abs(t) < 0.5: p = [np.sin(a * 1.3) * 0.078, y, 0.02 - 0.062 * np.cos(a * 1.3)]
        else: p = [np.sign(t) * (0.07 - (abs(t) - 0.5) * 0.06), y, cz + zf * np.sqrt(max(0, 1 - (0.06 / rx) ** 2)) + 0.03]
        pts.append(p)
    pts = np.array(pts)
    rings = []
    for k in range(len(pts)):
        d = pts[min(k + 1, len(pts) - 1)] - pts[max(k - 1, 0)]
        rings.append(circle(pts[k], d, 0.0055, K=5))
    tubing = tube(rings, [T.w(Chest=1)] * len(rings), slot=A, nbones=T.nb)
    head = disc(pts[-1] + [0, -0.012, 0.004], (0, 0, 1), 0.02, K=8, slot=B, weights=T.w(Chest=1), nbones=T.nb)
    return mk.merge([tubing, head])


def apron(T):
    """A trader's apron: a bib and skirt tied at the waist."""
    front = T.patch(0.58, 1.27, -0.10, 0.10, ease=0.03, slot=A, nx=6, ny=8, lift=0.004)
    # below the hips it hangs with the legs
    I = T.rig.index
    Wd = mk.dense_weights(front, T.nb)
    low = front['pos'][:, 1] < 0.955
    hang = T.hang_w(front['pos'][low], 0.4)
    Wd[low] = hang
    mk.set_weights(front, Wd, T.nb)
    return mk.merge([front, T.band(1.05, 0.03, ease=0.032, slot=B)])


def bangles(T, slot=A):
    out = []
    for s in ('L', 'R'):
        for u in ((1.84, 1.88), (1.9, 1.93)) if s == 'L' else ((1.86, 1.9),):
            out.append(T.arm(s, start=u[0], end=u[1], ease=0.006, slot=slot, cap=False, steps=[u[0], u[1]]))
    return mk.merge(out)


def watch(T, slot=A):
    return T.arm('L', start=1.84, end=1.9, ease=0.005, slot=slot, cap=False, steps=[1.84, 1.9])


def belt(T, slot=A):
    return mk.merge([T.band(1.012, 0.034, ease=0.021, slot=slot), T.patch(1.014, 1.044, -0.018, 0.018, ease=0.023, slot=B, nx=1, ny=1, lift=0.003)])


def sash(T, slot=A):
    """A broad sash round the waist, as worn with a cassock."""
    return T.band(1.04, 0.075, ease=0.019, slot=slot)


def shoulder_cloth(T, slot=A):
    """A folded cloth laid over one shoulder: an ipele, or a stole."""
    front = [[0.105, y, profile(TRUNK, y)[3] + profile(TRUNK, y)[1] * 0.86 + 0.024] for y in (1.06, 1.2, 1.34, 1.44)]
    over = [[0.118, 1.502, 0.03], [0.118, 1.498, -0.03]]
    back = [[0.105, y, profile(TRUNK, y)[3] - profile(TRUNK, y)[2] * 0.86 - 0.024] for y in (1.44, 1.34, 1.2, 1.1)]
    a = np.array(front + over + back); b = a + [0.062, 0, 0]
    b[:, 1] -= 0.006
    w = np.array([T.trunk_w(p[1]) for p in a])
    return strip(a, b, w, slot=slot, nbones=T.nb)


def handbag(T, slot=A):
    """A handbag on the left forearm."""
    I = T.rig.index; w = T.w(Forearm_L=1)
    c = T.arm_point('L', 1.55) + np.array([0.03, -0.17, 0.02])
    rings = [ellipse(c[1] + dy, rx, rz, cz=c[2], cx=c[0], K=8, square=0.7) for dy, rx, rz in ((-0.075, 0.085, 0.035), (-0.02, 0.095, 0.042), (0.055, 0.085, 0.03))]
    bag = tube(rings, [w] * 3, slot=slot, cap_start=True, cap_end=True, nbones=T.nb)
    top = c + [0, 0.055, 0]
    ts = np.linspace(0, np.pi, 7)
    a = np.array([top + [np.cos(t) * 0.05, np.sin(t) * 0.115, 0.0] for t in ts]); b = a + [0, 0, 0.014]
    return mk.merge([bag, strip(a, b, w, slot=B, nbones=T.nb)])


def tie(T, slot=A):
    return T.patch(1.10, 1.49, -0.017, 0.017, ease=0.019, slot=slot, nx=1, ny=5, lift=0.003)


def catalogue(T):
    """Every generated part, by name, drawn in the natural pose."""
    return {
        'top.tee': tee(T), 'top.polo': polo(T), 'top.shirt': shirt(T), 'top.shirt.short': shirt(T, sleeve=0.58), 'top.uniform': uniform(T), 'top.singlet': singlet(T),
        'top.blouse': blouse(T), 'top.buba': buba(T), 'top.senator': senator(T), 'top.isiagu': isiagu(T), 'top.kaftan': kaftan(T), 'top.agbada': agbada(T),
        'top.coat': coat(T), 'top.tunic': tunic(T), 'top.cassock': cassock(T), 'top.chasuble': chasuble(T),
        'dress.nurse': nurse_dress(T), 'dress.gown': gown(T), 'dress.long': long_dress(T), 'dress.boubou': boubou(T),
        'bottom.trousers': trousers(T), 'bottom.shorts': shorts(T), 'bottom.wrapper': wrapper(T), 'bottom.wrapper.over': wrapper(T, hem=0.54, ease=0.022, top=1.085), 'bottom.skirt': skirt(T),
        'body.arms': bare_arms(T), 'body.arms.lower': bare_arms(T, 0.36), 'body.arms.fore': bare_arms(T, 1.2), 'body.legs': bare_legs(T, 0.6), 'body.legs.lower': bare_legs(T, 1.0), 'body.legs.ankle': bare_legs(T, 1.55), 'body.feet': bare_feet(T),
        'shoe.shoes': shoes(T), 'shoe.boots': boots(T), 'shoe.sandals': sandals(T), 'shoe.slippers': sandals(T, thong=True),
        'acc.beads': beads(T), 'acc.stethoscope': stethoscope(T), 'acc.apron': apron(T), 'acc.bangles': bangles(T), 'acc.watch': watch(T), 'acc.belt': belt(T), 'acc.sash': sash(T),
        'acc.shouldercloth': shoulder_cloth(T), 'acc.handbag': handbag(T), 'acc.tie': tie(T), 'acc.hivis': hivis(T),
    }
