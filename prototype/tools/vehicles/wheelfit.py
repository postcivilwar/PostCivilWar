"""Each wheel of the owner's cars and motorcycles found as it really is in the model, and the triangles that turn with
it sorted out again (18 October 2026, the owner's brief: four wheels turning and steering correctly, no wobble, no
tyre left behind, nothing else turning with a wheel).

    python3 tools/vehicles/wheelfit.py cars [id ...]       re-sorts each car's parts in assets/vehicles/cars/game/
    python3 tools/vehicles/wheelfit.py bikes [id ...]      the same for the motorcycles (assets/vehicles/bikes/game/)

then `cars.py --js` and `bikes.py --js` write the numbers into the game's code. Nothing here reads or writes a supplied
file: it reads the game's own copy of each mesh (written by cars.py and bikes.py, every triangle of the supplied mesh,
turned to face +Z) and writes it again with its triangles in a new order. No point, normal or texture place is changed.

Why. The first sort (cars.py, bikes.py) took each wheel to be a drum lined up with the vehicle's own axis across, and
its tyre to be a set width; a triangle's middle inside the drum made it part of the wheel. Measured, that was wrong for
many of the models (they are each one piece, wheels and body fused, so the wheel can only be told apart by where it
is):
  - six cars have their front wheels already turned in the file (the way a car is photographed), 9 to 18 degrees;
    turned about the car's axis instead of their own, those wheels wobbled, and the part of the tyre outside the drum
    stood still while the rest turned;
  - wide tyres (the off-roaders', the SUVs') were wider than the drum: their inner half stood still;
  - on the motorcycles, a bar of the fork, the bottom of a pannier, pieces of a mudguard lay inside a wheel's drum and
    went round with it.

How a wheel is found now (each from the first sort's place for it):
  - its axle: the way the flat faces of the tyre and the rim look (their normals, along the axle), averaged;
  - its round: a circle fitted to the tread (points whose normals point out from the axle), any that are not on it
    (a mudguard, the arch) set aside;
  - its width: how far the tyre's sides reach along the axle;
  - a triangle goes round with it only if every one of its corners is inside that drum.
The game turns each wheel about its own axle, after first turning it straight (a wheel turned in the file is put
straight, and then steered by the game). A motorcycle's steering is everything that turns with its bars: the fork,
the mudguard, the bars themselves (bikes below).
"""
import json, os, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))


def load(kind, vid):
    base = os.path.join(ROOT, 'assets', 'vehicles', kind)
    manifest = json.load(open(os.path.join(base, f'{kind}.json')))
    m = manifest[vid]
    path = os.path.join(base, 'game', m['files']['mesh'])
    buf = open(path, 'rb').read()
    n = m['vertices']; at = 0
    P = np.frombuffer(buf, np.float32, n * 3, at).reshape(n, 3).astype(np.float64); at += n * 12
    N16 = np.frombuffer(buf, np.int16, n * 3, at).reshape(n, 3); at += n * 6 + (n % 2) * 2
    at += n * 8
    idx = np.frombuffer(buf, np.uint32, m['triangles'] * 3, at).reshape(-1, 3).astype(np.int64)
    N = N16.astype(np.float64) / 32767.0
    N /= np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-9)
    return manifest, m, path, buf, P, N, idx


def write_sorted(path, buf, m, idx, part):
    """The same file, its triangles in the order of their parts (body first); the counts of each part."""
    order = np.argsort(part, kind='stable')
    n = m['vertices']
    head = n * 12 + n * 6 + (n % 2) * 2 + n * 8
    out = buf[:head] + idx[order].astype(np.uint32).tobytes()
    assert len(out) == len(buf)
    open(path, 'wb').write(out)
    return [int((part == k).sum()) for k in range(int(part.max()) + 1)]


def basis(a):
    """Two directions across the axle a, at right angles to it and to each other."""
    t = np.array([0.0, 1.0, 0.0]) if abs(a[1]) < 0.9 else np.array([0.0, 0.0, 1.0])
    b1 = np.cross(a, t); b1 /= np.linalg.norm(b1)
    b2 = np.cross(a, b1)
    return b1, b2


def circle(u, v, tol, tries=400, seed=1):
    """A circle through most of the points (u, v): RANSAC over three points at a time, then fitted to those on it."""
    rng = np.random.default_rng(seed)
    n = len(u)
    best = None
    if n < 8: return None
    for _ in range(tries):
        i = rng.choice(n, 3, replace=False)
        x1, y1, x2, y2, x3, y3 = u[i[0]], v[i[0]], u[i[1]], v[i[1]], u[i[2]], v[i[2]]
        d = 2 * (x1 * (y2 - y3) + x2 * (y3 - y1) + x3 * (y1 - y2))
        if abs(d) < 1e-12: continue
        cx = ((x1 * x1 + y1 * y1) * (y2 - y3) + (x2 * x2 + y2 * y2) * (y3 - y1) + (x3 * x3 + y3 * y3) * (y1 - y2)) / d
        cy = ((x1 * x1 + y1 * y1) * (x3 - x2) + (x2 * x2 + y2 * y2) * (x1 - x3) + (x3 * x3 + y3 * y3) * (x2 - x1)) / d
        r = np.hypot(x1 - cx, y1 - cy)
        on = np.abs(np.hypot(u - cx, v - cy) - r) < tol
        # (the circle must go round: points on it in most directions from its middle)
        ang = np.arctan2(v[on] - cy, u[on] - cx)
        spread = len(np.unique((ang // (np.pi / 9)).astype(int)))
        score = spread * 100000 + on.sum()
        if best is None or score > best[0]: best = (score, on)
    if best is None: return None
    on = best[1]
    A = np.c_[2 * u[on], 2 * v[on], np.ones(on.sum())]
    b = u[on] ** 2 + v[on] ** 2
    sol = np.linalg.lstsq(A, b, rcond=None)[0]
    cx, cy = sol[0], sol[1]
    return cx, cy, float(np.sqrt(sol[2] + cx * cx + cy * cy)), int(on.sum())


def fit(P, N, c0, r0, h0=None, rounds=3, tol=0.012, turn=None, lower=False, axle=None):
    """One wheel: its centre, axle (pointing to +x), radius and half-width, from a first guess of its centre and size.
    `turn`: about how far it is turned in its file (TURNED), or nothing for a wheel that is straight there; `axle`:
    which way its axle points, where that is already known (a motorcycle's front wheel turned with its bars)."""
    c = np.array(c0, float); r = float(r0)
    a = np.array([1.0, 0.0, 0.0]) if axle is None else np.array(axle, float)
    h = float(h0) if h0 else 0.35 * r
    near = np.linalg.norm(P - c, axis=1) < 1.45 * r
    Q, M = P[near], N[near]
    for _ in range(rounds):
        if turn: c, a = turned(Q, M, c, r, h, turn)
        b1, b2 = basis(a)
        d = Q - c; t = d @ a
        radial = d - np.outer(t, a); rho = np.linalg.norm(radial, axis=1)
        unit = radial / np.maximum(rho[:, None], 1e-12)
        # the tread: normals pointing out from the axle, at about the tyre's radius, between its faces, all the way
        # round (the underside of the arch over it faces in, towards the axle; its top, out, is further off than a tyre
        # reaches; and the circle taken is the one most of the points lie on)
        tread = (np.abs(M @ a) < 0.35) & (np.einsum('ij,ij->i', M, unit) > 0.55) & (rho > 0.72 * r) & (rho < 1.15 * r) & (np.abs(t) < 2.0 * h)
        # (a motorcycle's mudguard hugs the top of its tyre, out from the axle like the tread: there, the lower half only)
        if lower: tread &= -unit[:, 1] > np.cos(np.radians(80))
        if tread.sum() >= 12:
            u, v = d[tread] @ b1, d[tread] @ b2
            got = circle(u, v, tol * r)
            if got:
                cu, cv, R, n_on = got
                if 0.75 * r < R < 1.3 * r:
                    c = c + cu * b1 + cv * b2; r = R
        # the width: how far the tyre reaches either way along its axle, from straight below the axle (within fifty
        # degrees of straight down there is nothing but the tyre: the arch, the mudguard, the fork and the swing arm
        # are all above or beside it), its outer part (in from it are the rim and the brake)
        d = Q - c; t = d @ a
        radial = d - np.outer(t, a); rho = np.linalg.norm(radial, axis=1)
        down = -radial[:, 1] / np.maximum(rho, 1e-12)
        bottom = (down > np.cos(np.radians(50))) & (rho > 0.6 * r) & (rho < 1.08 * r) & (np.abs(t) < 0.6 * r)
        if bottom.sum() > 20:
            lo, hi = np.percentile(t[bottom], [1, 99])
            if hi > lo:
                c = c + a * (lo + hi) / 2
                h = max((hi - lo) / 2, 0.08 * r)
    # how far the tyre reaches from its axle: its tread's lugs, not its carcass (an off-roader's lugs stand well proud
    # of the round the tread is fitted to). Read straight below the axle, where there is nothing but the tyre.
    d = Q - c; t = d @ a
    radial = d - np.outer(t, a); rho = np.linalg.norm(radial, axis=1)
    down = -radial[:, 1] / np.maximum(rho, 1e-12)
    bottom = (down > np.cos(np.radians(50))) & (np.abs(t) <= 1.05 * h) & (rho < 1.35 * r)
    ro = max(r, float(np.percentile(rho[bottom], 99.7))) if bottom.sum() > 20 else r
    return {'c': c, 'a': a, 'r': r, 'h': h, 'ro': ro}


# The cars whose front wheels are turned in their files, and by about how much (degrees, to the car's left), read by eye
# from a level slice through the lower part of each front tyre seen from above (the slice is a long narrow shape the
# way the tyre rolls); every other car's wheels are straight in its file. The angle used is measured from the slice,
# within ten degrees of this.
TURNED = {'black-luxury-suv': 20, 'camo-expedition': 25, 'classic-two-tone': 20, 'grey-grand-tourer': 30, 'midnight-saloon': 14, 'white-square-suv': 35}


def turned(Q, M, c, r, h, about):
    """A turned front wheel: the level axle (within eight degrees of `about`) about which most of the tyre's tread is
    one round (its tread is a cylinder about its own axle: the points whose surface faces out from that axle and lie on
    one circle about it are most), and that circle's centre."""
    d0 = Q - c
    dist = np.linalg.norm(d0, axis=1)
    near = (d0[:, 1] < -0.15 * r) & (dist > 0.6 * r) & (dist < 1.3 * r)
    S, SM = Q[near], M[near]
    best = None
    for yaw in np.radians(np.arange(about - 8, about + 8.01, 0.5)):
        a = np.array([np.cos(yaw), 0.0, np.sin(yaw)])
        b1, b2 = basis(a)
        d = S - c; t = d @ a
        radial = d - np.outer(t, a); rho = np.linalg.norm(radial, axis=1)
        unit = radial / np.maximum(rho[:, None], 1e-12)
        tread = (np.abs(SM @ a) < 0.3) & (np.einsum('ij,ij->i', SM, unit) > 0.6) & (np.abs(t) < 0.6 * r)
        if tread.sum() < 12: continue
        got = circle(d[tread] @ b1, d[tread] @ b2, 0.008 * r, tries=300)
        if not got: continue
        cu, cv, R, n_on = got
        if not (0.8 * r < R < 1.25 * r): continue
        if best is None or n_on > best[0]: best = (n_on, yaw, c + cu * b1 + cv * b2)
    if best is None: return c, np.array([np.cos(np.radians(about)), 0.0, np.sin(np.radians(about))])
    return best[2], np.array([np.cos(best[1]), 0.0, np.sin(best[1])])


def drum(w, grow=1.015, wide=0.12):
    """A wheel's drum as a function of points: at or below 0 inside (out to its tyre's furthest reach, and between its
    faces with a little room), above 0 outside."""
    c, a, R, T = w['c'], w['a'], w['ro'] * grow, w['h'] * (1 + wide) + 0.002 * w['ro']
    def g(X):
        d = X - c; t = d @ a
        rho = np.linalg.norm(d - np.outer(t, a), axis=1)
        return np.maximum(rho / R - 1.0, np.abs(t) / T - 1.0)
    return g


def split(P, N, uv, idx, part, k, g):
    """Gives the triangles inside g (all three corners at or below 0) to part k. A triangle part inside and part out is
    cut where g crosses 0, along its edges: the piece inside goes to k, the rest stays where it was. A new corner on a
    cut is a point on the triangle's own edge, its normal and texture place between the edge's two ends, so the surface
    is exactly as it was; only now it comes apart there. Returns the new P, N, uv, idx, part."""
    gv = g(P)
    inside_v = gv <= 0
    free = np.nonzero(part == 0)[0]
    T = idx[free]
    ins = inside_v[T]
    n_in = ins.sum(1)
    part[free[n_in == 3]] = k
    mixed = free[(n_in == 1) | (n_in == 2)]
    if not len(mixed): return P, N, uv, idx, part
    Tm = idx[mixed]; In = inside_v[Tm]
    # every edge of those that crosses, once each (so that the two triangles beside it share the new corner)
    ea = np.concatenate([Tm[:, 0], Tm[:, 1], Tm[:, 2]]); eb = np.concatenate([Tm[:, 1], Tm[:, 2], Tm[:, 0]])
    cross = inside_v[ea] != inside_v[eb]
    lo_, hi_ = np.minimum(ea[cross], eb[cross]), np.maximum(ea[cross], eb[cross])
    keys = np.unique(np.stack([lo_, hi_], 1), axis=0)
    a_, b_ = keys[:, 0], keys[:, 1]
    # from the end inside to the end outside, halved until it is found
    inn = np.where(inside_v[a_], a_, b_); out = np.where(inside_v[a_], b_, a_)
    lo = np.zeros(len(keys)); hi = np.ones(len(keys))
    for _ in range(30):
        mid = (lo + hi) / 2
        X = P[inn] + (P[out] - P[inn]) * mid[:, None]
        gin = g(X) <= 0
        lo = np.where(gin, mid, lo); hi = np.where(gin, hi, mid)
    s = (lo + hi) / 2
    Pn = P[inn] + (P[out] - P[inn]) * s[:, None]
    Nn = N[inn] + (N[out] - N[inn]) * s[:, None]; Nn /= np.maximum(np.linalg.norm(Nn, axis=1, keepdims=True), 1e-9)
    Un = uv[inn] + (uv[out] - uv[inn]) * s[:, None]
    base = len(P)
    P = np.concatenate([P, Pn]); N = np.concatenate([N, Nn]); uv = np.concatenate([uv, Un])
    lookup = {(int(x), int(y)): base + i for i, (x, y) in enumerate(keys)}
    at = lambda x, y: lookup[(min(int(x), int(y)), max(int(x), int(y)))]
    new_tris, new_parts = [], []
    for t_i, tri, flags in zip(mixed, Tm, In):
        was = part[t_i]
        if flags.sum() == 1:
            p = int(np.argmax(flags)); i, j, kk = tri[p], tri[(p + 1) % 3], tri[(p + 2) % 3]
            xij, xik = at(i, j), at(i, kk)
            new_tris += [(i, xij, xik), (xij, j, kk), (xij, kk, xik)]; new_parts += [k, was, was]
        else:
            q = int(np.argmin(flags)); i, j, kk = tri[(q + 1) % 3], tri[(q + 2) % 3], tri[q]
            xjk, xki = at(j, kk), at(kk, i)
            new_tris += [(i, j, xjk), (i, xjk, xki), (xjk, kk, xki)]; new_parts += [k, k, was]
    keep = np.ones(len(idx), bool); keep[mixed] = False
    idx = np.concatenate([idx[keep], np.array(new_tris, dtype=np.int64)])
    part = np.concatenate([part[keep], np.array(new_parts, dtype=part.dtype)])
    return P, N, uv, idx, part


def inside(P, w, grow=1.02, wide=0.12):
    """Which points are inside a wheel's drum (radius, and its faces with a little room)."""
    d = P - w['c']; t = d @ w['a']
    rho = np.linalg.norm(d - np.outer(t, w['a']), axis=1)
    return (rho <= w['r'] * grow) & (np.abs(t) <= w['h'] * (1 + wide) + 0.002)


def describe(w, scale=1.0):
    r4 = lambda v: round(float(v), 5)
    a = w['a']
    return {'c': [r4(v) for v in w['c']], 'axle': [r4(v) for v in a], 'r': r4(w.get('ro', w['r'])), 'tread': r4(w['r']), 'half': r4(w['h']),
            'yaw': round(float(np.degrees(np.arctan2(a[2], a[0]))), 2), 'camber': round(float(np.degrees(np.arcsin(max(-1, min(1, a[1]))))), 2)}


# ------------------------------------------------------------------------------------------------- cars --

def car_parts(P, N, uv, idx, guesses, vid):
    """A car's five parts: its four wheels found as they are (from cars.py's first guesses: each wheel's x, y, z, r,
    outer, inner) and cut out of it, the body the rest. Gives the new points, normals, texture places, the triangles
    sorted by part, each part's count, and each wheel's numbers for the game."""
    wheels = []
    for k, w in enumerate(guesses):
        f = fit(P, N, [w['x'], w['y'], w['z']], w['r'], h0=(w['outer'] - w['inner']) / 2, turn=TURNED.get(vid) if k < 2 else None)
        wheels.append(f)
    # the two of an axle are one size: each keeps its own place and axle; the radius is theirs together
    for i, j in ((0, 1), (2, 3)):
        for key in ('r', 'ro'):
            wheels[i][key] = wheels[j][key] = (wheels[i][key] + wheels[j][key]) / 2
    part = np.zeros(len(idx), np.int8)
    for k, w in enumerate(wheels):
        P, N, uv, idx, part = split(P, N, uv, idx, part, k + 1, drum(w))
    order = np.argsort(part, kind='stable')
    idx, part = idx[order], part[order]
    counts = [int((part == k).sum()) for k in range(5)]
    specs = [{**describe(w), 'x': round(float(w['c'][0]), 5), 'y': round(float(w['c'][1]), 5), 'z': round(float(w['c'][2]), 5),
              'outer': round(float(abs(w['c'][0]) + w['h']), 5), 'inner': round(float(abs(w['c'][0]) - w['h']), 5)} for w in wheels]
    return P, N, uv, idx, counts, specs


# ---------------------------------------------------------------------------------------------- motorcycles --

# What turns with a motorcycle's bars, beyond its front wheel: its mudguard and the fork up to the bars, and the bars
# with their grips and levers. Bikes whose fairing is fixed to the frame (`faired`) keep the fairing, the screen and
# the headlamp still: there only the fork below the fairing and the bars turn. (`top`: how far up the fork, as a share
# of the way from the axle to the grips, the turning part goes on a faired bike.)
STEER = {
    'red-superbike': {'faired': True}, 'purple-sport': {'faired': True}, 'black-gold-superbike': {'faired': True},
    'white-sport': {'faired': True}, 'civil-war-tourer': {'faired': True}, 'yellow-adventure': {'faired': True},
    # the tourer's batwing fairing is held on its fork, as such fairings are: it turns with the bars, whole (cut by
    # the bars alone, its top went round and the rest stayed). `fairing`: everything ahead of a line `s` behind the
    # fork's (clear of the tank's front, measured: the model has next to nothing there) and above `below` wheel radii
    # over the front axle (the lower panels before the engine stay with the frame)
    'gold-tourer': {'fairing': {'s': -0.075, 'below': 1.3}},
    # the streetfighter's radiator shrouds wrap round its fork up to its lamp's cowl, all of it one piece in the model:
    # cut round the fork they tore as the bars turned. Its cowl and lamp are kept with the frame (as on a bike whose
    # cowl is held on the frame), its fork turns below them (`top`: up to that share of the way to the grips), its bars
    # and their mirrors (`mirrors`) turn above them; and what turns is kept narrow round its fork's legs (`fork_x`, out from
    # the middle: its legs are 6 out) and round its bars (`bars_y`, `bars_z`: up and down, and back and forth, of them)
    'streetfighter': {'faired': True, 'top': 0.6, 'mirrors': True, 'fork_x': 0.075, 'bars_y': 0.025, 'bars_z': 0.025},
}
# Wheels whose model is not round all the way (the rest of the tyre is under a pannier, fused into it; or a show
# machine's twin wheels behind solid covers): they would show the gap as they turned, so they do not turn.
STILL = {'gold-tourer': ['rear'], 'chrome-concept': ['front', 'rear']}


def fork_line(P, F, rake0):
    """The fork's line from the side (where its two legs run, above the tyre): a point on it at the axle's height and
    how far it leans back from upright (radians). Its legs are the points either side of the tyre (an inch or two out
    from the middle) between the top of the tyre and well below the bars."""
    R = F['r']
    D = np.array([0.0, np.cos(rake0), -np.sin(rake0)])
    rel = P - np.array([0.0, F['y'], F['z']])
    t = rel @ D
    s = rel[:, 2] * np.cos(rake0) + rel[:, 1] * np.sin(rake0)          # ahead of the line (+), behind it (-)
    legs = (np.abs(P[:, 0]) > 0.02) & (np.abs(P[:, 0]) < 0.1) & (t > 1.15 * R) & (t < 2.3 * R) & (np.abs(s) < 0.07)
    if legs.sum() < 30: return F['z'], rake0
    y, z = P[legs, 1], P[legs, 2]
    # the middle of the legs at each height, then a line through those
    bins = np.linspace(y.min(), y.max(), 12)
    mids = [(float(np.median(z[(y >= a) & (y < b)])), (a + b) / 2) for a, b in zip(bins[:-1], bins[1:]) if ((y >= a) & (y < b)).sum() > 5]
    if len(mids) < 4: return F['z'], rake0
    zz, yy = np.array([m[0] for m in mids]), np.array([m[1] for m in mids])
    k, z0 = np.polyfit(yy - F['y'], zz, 1)                                # z = z0 + k (y - Fy)
    rake = float(np.arctan(-k))
    if not (0.2 < rake < 0.8): return F['z'], rake0
    return float(z0), rake


def steering(F, an, rake, z_axis, cfg):
    """What turns with the bars (besides the front wheel), as a function of points (at or below 0 inside)."""
    R = F['r']
    c = np.array([F.get('x', 0.0), F['y'], z_axis])
    D = np.array([0.0, np.cos(rake), -np.sin(rake)])
    gx, gy, gz = an['grip']
    top = (gy - F['y']) / np.cos(rake)                                    # along the fork, from the axle to the bars
    faired = cfg.get('faired', False)
    upto = top * cfg.get('top', 0.55 if faired else 1.05)
    def g(X):
        rel = X - c
        t = rel @ D
        s = rel[:, 2] * np.cos(rake) + rel[:, 1] * np.sin(rake)
        x = np.abs(X[:, 0] - c[0])
        side = np.hypot(rel[:, 1], rel[:, 2])
        # the mudguard and the bottom of the fork: round the front wheel, between the legs, not far behind the fork
        low = np.maximum.reduce([side / (1.42 * R) - 1, x / 0.115 - 1, -(s + 0.62 * R) / R, (t - 1.25 * R) / R])
        # the fork's legs and what joins them, up towards the bars (on a faired bike, only below the fairing)
        fork = np.maximum.reduce([np.abs(s) / 0.05 - 1, x / cfg.get('fork_x', 0.105) - 1, (t - upto) / R, -(t - 0.8 * R) / R])
        # the bars: at the grips' height, from one grip to the other, from the top of the fork back to the grips
        zlo, zhi = min(gz, c[2] - np.sin(rake) * top) - cfg.get('bars_z', 0.06), max(gz, c[2] - np.sin(rake) * top) + cfg.get('bars_z', 0.05)
        bars = np.maximum.reduce([np.abs(X[:, 1] - gy) / cfg.get('bars_y', 0.045) - 1, x / (gx + 0.035) - 1, (zlo - X[:, 2]) / 0.05, (X[:, 2] - zhi) / 0.05,
                                  # (in the middle, nothing behind the top of the fork: there is the tank, or the screen)
                                  np.where(x < 0.055, -(s + 0.035) / 0.03, -1.0)])
        # the mirrors, on bikes without a fairing: on stalks from the bars, outboard, above the grips
        mirrors = np.maximum.reduce([(gy - 0.02 - X[:, 1]) / 0.03, (X[:, 1] - gy - 0.17) / 0.03, (0.55 * gx - x) / 0.02, x / (gx + 0.06) - 1,
                                     (zlo - 0.04 - X[:, 2]) / 0.05, (X[:, 2] - zhi - 0.04) / 0.05]) if (not faired or cfg.get('mirrors')) else np.full(len(X), 1.0)
        # the headlamp, on bikes without a fairing: held on the fork, ahead of it (its glass, its shell behind that and
        # the little cowl round it), at its own height
        lamp = np.full(len(X), 1.0)
        if not faired and an.get('head'):
            hy, hz = an['head'][1], an['head'][2]
            lamp = np.maximum.reduce([x / cfg.get('lamp_x', 0.62 * R) - 1, np.abs(X[:, 1] - hy) / (0.55 * R) - 1, (X[:, 2] - hz - 0.012) / 0.02,
                                      (hz - 0.95 * R - X[:, 2]) / 0.02, (0.012 - s) / 0.02])
        # a fairing held on the fork (a batwing): all of it, from its back to its nose, above the mudguard
        held = np.full(len(X), 1.0)
        if cfg.get('fairing'):
            fc = cfg['fairing']
            held = np.maximum.reduce([(fc['s'] - s) / 0.01, (F['y'] + fc['below'] * R - X[:, 1]) / 0.01, x / 0.3 - 1])
        return np.minimum.reduce([low, fork, bars, mirrors, lamp, held])
    return g


def settle(P, idx, part, R, whole=0.15, small=0.8):
    """What turns with the bars, made of whole pieces of the model. The cut round the steering (`steering`) is exact,
    but it is cut by place: a piece of the model it only clips (a lever's tip, the end of a mirror's stalk, the rim of
    a lamp, the edge of a fairing the bars pass behind) goes whole with the side most of it is on, so that nothing is
    left hanging in the air when the bars turn, nor torn off what does not turn; and a small loose piece (a lens, a
    reflector, a bolt's head) that sits against one part and nothing else goes with that part. A piece of the model
    is the triangles joined corner to corner (corners at the same place count as joined); the pieces the size of the
    whole bike (the models that are one piece throughout) are left cut where they were. Only the body (0) and what
    turns with the bars (1) are changed here; the wheels are not. Gives the parts again."""
    from scipy.sparse import coo_matrix
    from scipy.sparse.csgraph import connected_components
    from scipy.spatial import cKDTree
    sel = np.nonzero(part <= 1)[0]
    T = idx[sel]
    _, weld = np.unique(np.round(P / 1e-6).astype(np.int64), axis=0, return_inverse=True)
    weld = weld.ravel()
    t = weld[T]
    nv = int(weld.max()) + 1
    a = np.concatenate([t[:, 0], t[:, 1]]); b = np.concatenate([t[:, 1], t[:, 2]])
    _, lab = connected_components(coo_matrix((np.ones(len(a), np.int8), (a, b)), shape=(nv, nv)), directed=False)
    comp = lab[t[:, 0]]
    area = 0.5 * np.linalg.norm(np.cross(P[T[:, 1]] - P[T[:, 0]], P[T[:, 2]] - P[T[:, 0]]), axis=1)
    pk = part[sel].astype(np.int64)
    n = int(lab.max()) + 1
    A0 = np.bincount(comp, weights=area * (pk == 0), minlength=n)
    A1 = np.bincount(comp, weights=area * (pk == 1), minlength=n)
    total = A0 + A1
    clipped = (np.minimum(A0, A1) > 0) & (np.minimum(A0, A1) < whole * total) & (total < 0.2 * total.sum())
    move = clipped[comp]
    pk[move] = (A1 > A0)[comp[move]].astype(np.int64)
    moved_clipped = int(move.sum())
    # small pieces of one part (joined within that part alone) that sit against the other part and against nothing
    # else of their own: a lever's tip or a stalk's end the cut took off a model made in one piece, a lens, a reflector
    Pw = np.zeros((nv, 3)); Pw[weld] = P                                       # (each welded corner's place)
    moved_loose = 0
    for side in (0, 1):
        mine = pk == side
        tt = t[mine]
        if not len(tt) or mine.all(): continue
        a = np.concatenate([tt[:, 0], tt[:, 1]]); b = np.concatenate([tt[:, 1], tt[:, 2]])
        _, lw = connected_components(coo_matrix((np.ones(len(a), np.int8), (a, b)), shape=(nv, nv)), directed=False)
        pc = lw[tt[:, 0]]                                                     # each of its triangles' piece
        m = int(lw.max()) + 1
        lo, hi = np.full((m, 3), np.inf), np.full((m, 3), -np.inf)
        for k in range(3):
            np.minimum.at(lo, pc, Pw[tt[:, k]]); np.maximum.at(hi, pc, Pw[tt[:, k]])
        size = np.linalg.norm(hi - lo, axis=1)
        own_w = np.unique(tt.ravel()); other_w = np.unique(t[~mine].ravel())
        own_tree, other_tree = cKDTree(Pw[own_w]), cKDTree(Pw[other_w])
        rows = np.nonzero(mine)[0]
        for c in np.unique(pc[size[pc] < small * R]):
            ws = np.unique(tt[pc == c].ravel())
            d_other = float(other_tree.query(Pw[ws])[0].min())
            if d_other > 0.02 * R: continue
            dd, ii = own_tree.query(Pw[ws], k=min(32, len(own_w)))
            d_own = float(np.where(lw[own_w[ii]] != c, dd, np.inf).min())
            if d_own > max(0.03 * R, 3 * d_other):
                pk[rows[pc == c]] = 1 - side; moved_loose += 1
    part = part.copy(); part[sel] = pk.astype(part.dtype)
    return part, moved_clipped, moved_loose


# Motorcycles whose bars are turned in their files, and about how far (degrees about the steering's line; read by eye
# from a slab of each front tyre seen from below): the front end is put straight by the game, then steered.
BIKE_TURNED = {'black-cruiser': 32, 'white-sport': 9}

# How far each bike's fork leans back from upright (radians): read by eye from each model seen from the side, its fork's
# legs against lines drawn through the front axle at angles a few hundredths apart (18 October 2026). Measured from
# the legs (`fork_line`) these came out as much as 0.3 too upright on the cruisers with long or covered forks (the
# chopper's 0.32 for 0.63): the cut round the fork then left its top and the bars' risers behind, and the bars came
# apart as they turned.
RAKE = {
    'black-bobber': 0.55, 'midnight-cruiser': 0.55, 'chopper': 0.63, 'gold-roadster': 0.54, 'olive-cruiser': 0.64, 'power-cruiser': 0.77,
    'white-sport': 0.50, 'civil-war-tourer': 0.37, 'black-cruiser': 0.43, 'black-gold-superbike': 0.46, 'cafe-racer': 0.43, 'gold-tourer': 0.45,
    'purple-sport': 0.42, 'red-superbike': 0.41, 'streetfighter': 0.47, 'yellow-adventure': 0.42,
}


def about_axis(s, ang):
    """The turn by `ang` about the unit direction s (a 3 by 3 matrix)."""
    s = np.asarray(s, float); K = np.array([[0, -s[2], s[1]], [s[2], 0, -s[0]], [-s[1], s[0], 0]])
    return np.eye(3) + np.sin(ang) * K + (1 - np.cos(ang)) * (K @ K)


def bars_turned(P, F, rake, about):
    """How far a turned front end is turned about the steering's line (radians): the turn at which the slab of the front
    tyre under its axle is thinnest across its own axle."""
    s = np.array([0.0, np.cos(rake), -np.sin(rake)])
    c = np.array([0.0, F['y'], F['z']]); r = F['r']
    d = P - c
    S = d[(d[:, 1] < -0.45 * r) & (np.abs(d[:, 0]) < 0.15) & (np.abs(d[:, 2]) < 1.1 * r)]
    best = None
    for sign in (1, -1):
        for deg in np.arange(about - 12, about + 12.01, 0.25):
            a = about_axis(s, np.radians(sign * deg)) @ np.array([1.0, 0.0, 0.0])
            lo, hi = np.percentile(S @ a, [2, 98])
            if best is None or hi - lo < best[0]: best = (hi - lo, np.radians(sign * deg))
    return best[1]


def bike_parts(P, N, uv, idx, front, rear, an, rake0, bid, anchors_of=None):
    """A motorcycle's four parts: body, what turns with the bars, the front wheel, the back wheel. Each wheel found as
    it is (from bikes.py's first guesses) and cut out exactly; then what turns with the bars, cut out round them. A front
    end turned in its file (BIKE_TURNED) is measured where it is: the game puts it straight (`steered`). Gives the new
    arrays, the counts, both wheels' numbers, the fork's lean, how far the front end is turned, and where a rider's
    hands, seat and feet go, read from the bike with its front end straight (`anchors_of`)."""
    B = fit(P, N, [0.0, rear['y'], rear['z']], rear['r'], h0=rear['half'], lower=True)
    B['a'] = np.array([1.0, 0.0, 0.0])          # (its middle where it is: some bikes' wheels are not on their middle line)
    rake0 = RAKE.get(bid, rake0)
    steered = 0.0
    if bid in BIKE_TURNED:
        steered = bars_turned(P, front, rake0, BIKE_TURNED[bid])
        s = np.array([0.0, np.cos(rake0), -np.sin(rake0)])
        F = fit(P, N, [0.0, front['y'], front['z']], front['r'], h0=front['half'], lower=True, axle=about_axis(s, steered) @ np.array([1.0, 0.0, 0.0]))
    else:
        F = fit(P, N, [0.0, front['y'], front['z']], front['r'], h0=front['half'], lower=True)
        F['a'] = np.array([1.0, 0.0, 0.0])
    fw = {'x': float(F['c'][0]), 'z': float(F['c'][2]), 'y': float(F['c'][1]), 'r': float(F['ro'])}
    rake = rake0 if (steered or bid in RAKE) else fork_line(P, fw, rake0)[1]
    s = np.array([0.0, np.cos(rake), -np.sin(rake)])
    pivot = np.array([fw['x'], fw['y'], fw['z']])
    straight = about_axis(s, -steered)
    unturn = (lambda X: (X - pivot) @ straight.T + pivot) if steered else (lambda X: X)
    cfg = STEER.get(bid, {})
    # what turns with the bars, read with the front end straight: first from where the hands are found on the bike as
    # it is, then again from where they are on the bike made straight (all of the front above the wheel and ahead of
    # the fork made straight for that, so that the lamp is found straight too)
    g0 = steering(fw, {k: v for k, v in an.items() if k != 'head'}, rake, fw['z'], cfg)
    if steered and anchors_of:
        rel = unturn(P) - pivot
        ahead = rel[:, 2] * np.cos(rake) + rel[:, 1] * np.sin(rake)
        front_end = (ahead > -0.01) & (rel[:, 1] > 0.9 * fw['r']) & (rel[:, 1] < an['grip'][1] - fw['y'] + 0.06) & (np.abs(rel[:, 0]) < 0.12)
        if cfg.get('faired'): front_end[:] = False          # (a fairing is fixed to the frame: not turned in the file)
        inside_v = (g0(unturn(P)) <= 0) | (drum(F)(P) <= 0) | front_end
        Ps = P.copy(); Ps[inside_v] = unturn(P[inside_v])
        Ns = N.copy(); Ns[inside_v] = N[inside_v] @ straight.T
        an = anchors_of(Ps, Ns, fw)
    elif anchors_of:
        # (read again with the front wheel as it is now found: the first guess at it is a little small on some bikes,
        # and the top of a mudguard was taken for the headlamp)
        an = anchors_of(P, N, fw)
    g = steering(fw, an, rake, fw['z'], cfg)
    gs = (lambda X: g(unturn(X))) if steered else g
    part = np.zeros(len(idx), np.int8)
    P, N, uv, idx, part = split(P, N, uv, idx, part, 2, drum(F))
    P, N, uv, idx, part = split(P, N, uv, idx, part, 3, drum(B))
    P, N, uv, idx, part = split(P, N, uv, idx, part, 1, gs)
    part, clipped, loose = settle(P, idx, part, fw['r'])
    # whether the headlamp's glass is on what turns (the part of the model nearest it, of the body and the steering)
    from scipy.spatial import cKDTree
    head = (np.array(an['head']) - pivot) @ straight + pivot          # (where the glass is in the file: turned back)
    near = idx[part <= 1]
    vs = np.unique(near.ravel())
    vpart = np.zeros(len(P), np.int64)
    for k in range(3): vpart[near[:, k]] = part[part <= 1]
    _, nearest = cKDTree(P[vs]).query(head, k=12)
    lamp_turns = bool(np.mean(vpart[vs[nearest]] == 1) > 0.5)
    print(f'   {bid}: whole pieces kept together {clipped} triangles, loose pieces {loose}; lamp turns {lamp_turns}', flush=True)
    order = np.argsort(part, kind='stable')
    idx, part = idx[order], part[order]
    counts = [int((part == k).sum()) for k in range(4)]
    r5 = lambda v: round(float(v), 5)
    still = STILL.get(bid, [])
    spec = lambda w, name: {'x': r5(w['c'][0]), 'z': r5(w['c'][2]), 'y': r5(w['c'][1]), 'r': r5(w['ro']), 'tread': r5(w['r']), 'half': r5(w['h']), **({'still': True} if name in still else {})}
    return P, N, uv, idx, counts, spec(F, 'front'), spec(B, 'rear'), round(rake, 4), round(float(steered), 4), an, lamp_turns


if __name__ == '__main__':
    raise SystemExit('used by cars.py and bikes.py: python3 tools/vehicles/cars.py --mesh, python3 tools/vehicles/bikes.py --mesh')
