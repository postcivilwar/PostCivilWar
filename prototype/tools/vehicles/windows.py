"""Where each car's windows are painted, made into real glass (5 November 2026, the owner's brief, part 2: "Our 20
showroom cars are single shells made by Tripo, their windows painted on ... find each car's painted windows on its
picture and shape, cut them out of the body cleanly along the painted edge (no ragged triangles), and draw real glass in
their place, curved as the car's own glass is").

Only the game's own copies of the cars are read (assets/vehicles/cars/game: each car's shape and colour picture, made by
cars.py); the owner's files are never opened. Every point of the colour picture that the body covers is given its place
on the car and the way the surface faces there. The car is then looked at from its sides, from above and from in front
and behind (each look a picture of the body's points, nearest kept, in their colours); in each, the painted glass is
found by growing regions from points over the band of the car where glass is (between the belt line and the roof), by
colour, stopped at the painted edges, and keeping those that are glass (not the paint's colour, or for the windscreen and
the back window leaning back as glass does), within the shapes this file's settings allow (windows.json). Where a car's
glass is painted nearly its own colour (the Black Luxury SUV: black on black) its panes are given there as shapes, each
drawn round the painted pane in the look it faces, and taken in to the painted edges where they are seen.

Written, beside the car's other files:
  <id>-windows-1k.png, <id>-windows-512.png   the glass on the colour picture's layout (white where glass), its edge
                                              eased over a point so that the cut is smooth however near it is seen, and
                                              carried out past the picture's pieces so that none shows a seam;
  <id>-glass.bin                              one bit for each of the body's triangles (in the shape's own order): set
                                              where any of it is glass, the glass drawn with those alone;
and src/client/car-windows.js: for each car done, those files, how low its side glass comes (for the dust along it)
and whether its glass behind the front doors is privacy glass.

    python3 tools/vehicles/windows.py <car> [<car> ...] [--sheet <folder>]
    python3 tools/vehicles/windows.py --js          only car-windows.js, from the files already made

--sheet: each car drawn from eight sides with its glass in red (<folder>/<car>-windows-8.png), and the five looks the
glass is found in (<folder>/<car>-look-<side>.png), for the owner's eight sides and for setting windows.json.
"""
import json, os, sys
import numpy as np
from collections import deque
from PIL import Image
from scipy import ndimage

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
# (the owner's ambulance and trucks, 6 November 2026, read as tools/vehicles/supplied_cars.py writes them: their shapes
# and measures from PCW_WINDOWS_GAME and PCW_WINDOWS_SPECS, their glass's files written to PCW_WINDOWS_OUT, the list of
# them to PCW_WINDOWS_JS as PCW_WINDOWS_NAME; by default, the cars')
GAME = os.environ.get('PCW_WINDOWS_GAME') or os.path.join(ROOT, 'assets', 'vehicles', 'cars', 'game')
OUTDIR = os.environ.get('PCW_WINDOWS_OUT') or GAME
SPECS = os.environ.get('PCW_WINDOWS_SPECS') or os.path.join(ROOT, 'assets', 'vehicles', 'cars', 'cars.json')
SETTINGS = os.path.join(os.path.dirname(__file__), 'windows.json')
JS = os.environ.get('PCW_WINDOWS_JS') or os.path.join(ROOT, 'src', 'client', 'car-windows.js')
NAME = os.environ.get('PCW_WINDOWS_NAME') or 'CAR_WINDOWS'
R = 2048                       # the colour picture's layout, at this size, for finding the glass (twice the largest
                               # written: each point of that one the share of its four here that is glass, so that the
                               # cut runs smoothly between its points rather than along them in steps)
AT = R // 1024                 # (how many of these points to one of a 1024 picture's, for the tidying's reaches)
OUT = {'1k': 1024, '512': 512}  # the sizes written
# privacy glass behind the front doors (the brief: "the back side windows and the back window darker on the SUVs, the
# State Limousine and the luxury cars")
PRIVACY = {'black-luxury-suv', 'white-square-suv', 'black-square-suv', 'peach-suv', 'state-limousine', 'camo-expedition', 'grey-grand-tourer', 'midnight-saloon'}


def spec_of(car):
    return json.load(open(SPECS))[car]


def load(car):
    """The car's points (the model's units: +z ahead, +x its left, y up from the ground), their places on the colour
    picture, and the body's triangles (its first part)."""
    spec = spec_of(car)
    n, tris = spec['vertices'], spec['triangles']
    buf = open(os.path.join(GAME, spec['files']['mesh']), 'rb').read()
    at = 0
    pos = np.frombuffer(buf, np.float32, n * 3, at).reshape(-1, 3).astype(np.float64); at += n * 12
    at += n * 6 + (n % 2) * 2
    uv = np.frombuffer(buf, np.float32, n * 2, at).reshape(-1, 2).astype(np.float64); at += n * 8
    idx = np.frombuffer(buf, np.uint32, tris * 3, at).reshape(-1, 3)
    return spec, pos, uv, idx[:spec['parts'][0]]


def raster(pos, uv, body, size=R):
    """Every point of the colour picture (at `size`) that a body triangle covers: where it is on the car, which way
    the surface faces there, and which triangle it is."""
    P = np.full((size, size, 3), np.nan); N = np.zeros((size, size, 3)); T = np.full((size, size), -1, np.int64)
    A = pos[body]; U = uv[body] * size
    e1 = A[:, 1] - A[:, 0]; e2 = A[:, 2] - A[:, 0]
    nn = np.cross(e1, e2); nn /= (np.linalg.norm(nn, axis=1, keepdims=True) + 1e-12)
    for t in range(len(body)):
        u = U[t, :, 0]; v = U[t, :, 1]
        c0, c1 = int(max(0, np.floor(u.min()))), int(min(size - 1, np.ceil(u.max())))
        r0, r1 = int(max(0, np.floor(v.min()))), int(min(size - 1, np.ceil(v.max())))
        if c1 < c0 or r1 < r0: continue
        cs, rs = np.meshgrid(np.arange(c0, c1 + 1) + 0.5, np.arange(r0, r1 + 1) + 0.5)
        d = (v[1] - v[2]) * (u[0] - u[2]) + (u[2] - u[1]) * (v[0] - v[2])
        if abs(d) < 1e-14: continue
        l1 = ((v[1] - v[2]) * (cs - u[2]) + (u[2] - u[1]) * (rs - v[2])) / d
        l2 = ((v[2] - v[0]) * (cs - u[2]) + (u[0] - u[2]) * (rs - v[2])) / d
        l3 = 1 - l1 - l2
        inside = (l1 >= -1e-6) & (l2 >= -1e-6) & (l3 >= -1e-6)
        if not inside.any(): continue
        rr = (rs[inside] - 0.5).astype(int); cc = (cs[inside] - 0.5).astype(int)
        P[rr, cc] = (l1[inside, None] * A[t, 0] + l2[inside, None] * A[t, 1] + l3[inside, None] * A[t, 2])
        N[rr, cc] = nn[t]; T[rr, cc] = t
    return P, N, T


def look(P, N, C, eye, px=1000, mask=None, face=0.05, extra=None):
    """The body's points seen from `eye` (a direction from the car), as a picture: nearest kept, the gaps between points
    filled from those round them. Gives the picture, each pixel's depth along the eye, how the picture lies (for
    `project`) and, with `extra` (a value for each point of the colour picture), that value under each pixel."""
    e = np.asarray(eye, float); e /= np.linalg.norm(e)
    up = np.array([0.0, 1.0, 0.0])
    hx = np.cross(up, e)
    if np.linalg.norm(hx) < 1e-6: hx = np.array([0.0, 0.0, 1.0])
    hx /= np.linalg.norm(hx); vy = np.cross(e, hx)
    ok = ~np.isnan(P[..., 0]) & ((N @ e) > face)
    rr, cc = np.nonzero(ok)
    p = P[rr, cc]
    hv = p @ hx; vv = p @ vy; dd = p @ e
    allp = P[~np.isnan(P[..., 0])]
    lo_h, hi_h = (allp @ hx).min(), (allp @ hx).max(); lo_v, hi_v = (allp @ vy).min(), (allp @ vy).max()
    s = (px - 20) / max(hi_h - lo_h, hi_v - lo_v)
    W_, H_ = int((hi_h - lo_h) * s) + 20, int((hi_v - lo_v) * s) + 20
    x = ((hv - lo_h) * s + 10).astype(int); y = (H_ - 10 - (vv - lo_v) * s).astype(int)
    img = np.full((H_, W_, 3), 255, np.uint8); depth = np.full((H_, W_), -np.inf)
    ex = None if extra is None else np.full((H_, W_, extra.shape[-1]), np.nan, np.float32)
    exv = None if extra is None else extra[rr, cc]
    order = np.argsort(dd)
    col = C[rr, cc].copy()
    if mask is not None:
        m = mask[rr, cc]
        col[m] = (col[m] * 0.35 + np.array([255, 30, 30]) * 0.65).astype(np.uint8)
    for dy in (0, 1):
        for dx in (0, 1):
            yy = np.clip(y[order] + dy, 0, H_ - 1); xx = np.clip(x[order] + dx, 0, W_ - 1)
            img[yy, xx] = col[order]; depth[yy, xx] = dd[order]
            if ex is not None: ex[yy, xx] = exv[order]
    have = depth > -np.inf
    for _ in range(3):
        n = ndimage.uniform_filter(have.astype(np.float32), 3) * 9
        gap = ~have & (n >= 3)
        if not gap.any(): break
        f = img.astype(np.float32) * have[..., None]
        s3 = np.stack([ndimage.uniform_filter(f[..., k], 3) * 9 for k in range(3)], axis=-1)
        img[gap] = (s3[gap] / n[gap][:, None]).astype(np.uint8)
        dsum = ndimage.uniform_filter(np.where(have, depth, 0), 3) * 9
        depth[gap] = dsum[gap] / n[gap]
        if ex is not None:
            for k in range(ex.shape[-1]):
                es = ndimage.uniform_filter(np.where(have, np.nan_to_num(ex[..., k]), 0), 3) * 9
                ex[gap, k] = es[gap] / n[gap]
        have = have | gap
    frame = (hx, vy, e, lo_h, lo_v, s, H_)
    return (img, depth, frame, ex) if extra is not None else (img, depth, frame)


def project(P, frame):
    hx, vy, e, lo_h, lo_v, s, H_ = frame
    return ((P @ hx - lo_h) * s + 10), (H_ - 10 - (P @ vy - lo_v) * s), P @ e


def grow(img, seed, tol=26.0, edge=60.0, most=400000, allowed=None):
    """The region of `img` round `seed` (x, y) whose colour stays near the region's own, not across a sharp edge."""
    H, W, _ = img.shape
    f = img.astype(np.float32)
    lum = f @ np.array([0.299, 0.587, 0.114], np.float32)
    gy, gx = np.gradient(lum)
    grad = np.hypot(gx, gy)
    white = (f.min(axis=2) > 250)
    sx, sy = seed
    if not (0 <= sx < W and 0 <= sy < H) or white[sy, sx]: return np.zeros((H, W), bool)
    if allowed is not None and not allowed[sy, sx]: return np.zeros((H, W), bool)
    mask = np.zeros((H, W), bool)
    mean = f[sy, sx].copy(); n = 1
    q = deque([(sy, sx)]); mask[sy, sx] = True
    while q and n < most:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            yy, xx = y + dy, x + dx
            if yy < 0 or yy >= H or xx < 0 or xx >= W or mask[yy, xx] or white[yy, xx]: continue
            if allowed is not None and not allowed[yy, xx]: continue
            if grad[yy, xx] > edge: continue
            if np.abs(f[yy, xx] - mean).max() > tol: continue
            mask[yy, xx] = True; q.append((yy, xx))
            mean += (f[yy, xx] - mean) / (n + 1); n += 1
    return mask


def inside(poly, a, b):
    """Whether each point (a, b) is inside the polygon (a list of [a, b] corners)."""
    poly = np.asarray(poly, float)
    res = np.zeros(np.shape(a), bool)
    j = len(poly) - 1
    for i in range(len(poly)):
        ai, bi = poly[i]; aj, bj = poly[j]
        cross = ((bi > b) != (bj > b)) & (a < (aj - ai) * (b - bi) / ((bj - bi) + 1e-12) + ai)
        res ^= cross
        j = i
    return res


# the looks the glass is found in: (direction from the car, which coordinates its shapes in windows.json are given in)
LOOKS = {
    'left': ((1, 0, 0), (2, 1)),       # from the car's left: its length (z) across, height (y) up
    'right': ((-1, 0, 0), (2, 1)),
    'top': ((0, 1, 0), (2, 0)),        # from above: its length (z) and width (x)
    'front': ((0, 0.25, 1), (0, 1)),   # from in front, a little above: its width (x) and height (y)
    'back': ((0, 0.25, -1), (0, 1)),
}


def find(car, cfg, sheet=None):
    spec, pos, uv, body = load(car)
    P, N, T = raster(pos, uv, body)
    tex = np.asarray(Image.open(os.path.join(GAME, f'{car}-color-2k.jpg')).convert('RGB').resize((R, R), Image.BILINEAR))
    covered = ~np.isnan(P[..., 0])
    L, H, B = spec['length'], spec['height'], spec['body']
    d = spec['driver']; hip, roof, wheel = d['hip'], d['roof'], d['wheel']
    # (an open car has no roof: its windscreen's top, as its settings give it, or the car's height)
    if roof is None: roof = cfg.get('roof', spec['height'])
    # the paint: the commonest colour of the sides at the doors' height
    side = covered & (np.abs(N[..., 0]) > 0.75) & (P[..., 1] > 0.3 * H) & (P[..., 1] < 0.5 * H)
    q = (tex[side] // 16).astype(np.int32); key = q[:, 0] * 256 + q[:, 1] * 16 + q[:, 2]
    paint = np.median(tex[side][key == np.bincount(key).argmax()], axis=0)
    belt = hip[1] + cfg.get('belt', 0.4) * (roof - hip[1])
    top = roof + cfg.get('above', 0.03) * H
    tol, edge = cfg.get('tol', 30.0), cfg.get('edge', 70.0)
    print(car, 'paint', paint.astype(int), 'belt', round(belt, 4), 'roof', round(roof, 4))
    glass = np.zeros((R, R), bool)
    zs = np.linspace(min(L * 0.48, wheel[2] + 0.35 * L), -0.48 * L, 40)
    seeds = {
        'left': [(B / 2, y, z) for z in zs for y in np.linspace(belt + 0.01, roof - 0.005, 6)],
        'right': [(-B / 2, y, z) for z in zs for y in np.linspace(belt + 0.01, roof - 0.005, 6)],
        'top': [(x, H, z) for z in zs for x in np.linspace(-0.25, 0.25, 7) * B],
        'front': [(x, y, L / 2) for x in np.linspace(-0.3, 0.3, 7) * B for y in np.linspace(belt, roof, 5)],
        'back': [(x, y, -L / 2) for x in np.linspace(-0.3, 0.3, 7) * B for y in np.linspace(belt, roof, 5)],
    }
    found = {}
    for name, (eye, (ca, cb)) in LOOKS.items():
        if name in cfg.get('skip', []): continue
        extra = np.concatenate([P, N], axis=-1).astype(np.float32)
        img, depth, frame, ex = look(P, N, tex, eye, px=1400, extra=extra)
        carpx = int((depth > -np.inf).sum())
        e = np.asarray(eye, float); e /= np.linalg.norm(e)
        ok = covered & ((N @ e) > 0.2)
        rr, cc = np.nonzero(ok)
        x, y, dd = project(P[rr, cc], frame)
        xi = np.clip(x.astype(int), 0, depth.shape[1] - 1); yi = np.clip(y.astype(int), 0, depth.shape[0] - 1)
        vis = dd >= depth[yi, xi] - 0.004
        X, Y, Z, nx, ny, nz = (ex[..., k] for k in range(6))
        coord = (X, Y, Z)
        # where in this look glass may be: the band, and the shapes windows.json allows (`zones`), less those it rules
        # out (`not`): each a polygon in this look's two coordinates
        allowed = ~np.isnan(Y) & (Y >= belt - 0.01) & (Y <= top)
        if name in ('left', 'right', 'front', 'back'): allowed &= np.abs(X) <= B / 2 + 0.002
        zones = cfg.get('zones', {}).get(name)
        if zones:
            inz = np.zeros(Y.shape, bool)
            for poly in zones: inz |= inside(poly, coord[ca], coord[cb])
            allowed &= inz
        for poly in cfg.get('not', {}).get(name, []): allowed &= ~inside(poly, coord[ca], coord[cb])
        region = np.zeros(depth.shape, bool); tried = np.zeros(depth.shape, bool)
        kept = 0
        if name == 'top':
            fwd_ok = lambda f: (nz * f > (0.2 if f > 0 else 0.15)) & (ny < 0.99)
        # (`grow`: false where the glass is found by no colour at all, the panes alone; or the looks it is found by
        # colour in, the rest given as panes)
        growing = cfg.get('grow', True)
        growing = (name in growing) if isinstance(growing, list) else bool(growing)
        for p3 in (seeds[name] if growing else []) + [tuple(s) for s in cfg.get('seeds', {}).get(name, [])]:
            sx, sy_, _ = project(np.array([p3], float), frame)
            sx, sy_ = int(sx[0]), int(sy_[0])
            if not (0 <= sy_ < depth.shape[0] and 0 <= sx < depth.shape[1]) or depth[sy_, sx] == -np.inf or tried[sy_, sx]: continue
            if not allowed[sy_, sx]: continue
            allow = allowed
            if name == 'top':
                fwd = 1 if p3[2] > hip[2] else -1
                allow = allowed & fwd_ok(fwd)
                if not allow[sy_, sx]: continue
            m = grow(img, (sx, sy_), tol=tol, edge=edge, allowed=allow)
            tried |= m
            n = int(m.sum())
            if os.environ.get('WVERBOSE') and n > 50: print('     try', name, [round(float(v), 3) for v in p3], 'n', n, 'of', carpx, 'colour', img[m].mean(axis=0).astype(int) if n else None)
            if n < 200 or n > 0.2 * carpx: continue
            c = img[m].mean(axis=0)
            if name in ('left', 'right'):
                if np.abs(c - paint).max() < cfg.get('paint', 18): continue
            elif name == 'top':
                if np.abs(c - paint).max() < cfg.get('paintTop', 40): continue
            else:
                zs_, ys_ = nz[m], ny[m]; good = ~np.isnan(zs_)
                if not good.any(): continue
                tilt = np.mean((np.abs(zs_[good]) > 0.3) & (ys_[good] > 0.3) & (ys_[good] < 0.95))
                if tilt < 0.8: continue
            region |= m; kept += 1
        # panes given as shapes (glass painted nearly the paint's own colour): the shape, where the surface seen faces
        # this look as the glass does (the sides out to their side; from above, leaning, not the flat roof; in front and
        # behind, facing that way)
        for poly in cfg.get('panes', {}).get(name, []):
            pane = inside(poly, coord[ca], coord[cb]) & ~np.isnan(Y) & (depth > -np.inf)
            if name in ('left', 'right'): pane &= (nx * (1 if name == 'left' else -1)) > 0.35
            elif name == 'top': pane &= (ny < 0.99) & (np.abs(nz) > 0.2)
            else: pane &= (nz * (1 if name == 'front' else -1)) > 0.4
            region |= pane; kept += 1
        if region.any():
            region = ndimage.binary_fill_holes(ndimage.binary_closing(region, iterations=cfg.get('close', 3)))
            hit = vis & region[yi, xi]
            glass[rr[hit], cc[hit]] = True
        found[name] = (img, frame, kept, int(region.sum()))
        print('  ', name, 'regions', kept, 'pixels', int(region.sum()))
    # the mirrors' glass is a mirror, not a window; nothing outside the body's width
    glass &= covered & (np.abs(np.nan_to_num(P[..., 0])) <= B / 2 + 0.002)
    # tidied: specks gone, pin holes filled, the edge eased
    lab, nlab = ndimage.label(glass)
    if nlab:
        sizes = ndimage.sum(glass, lab, range(1, nlab + 1))
        glass = np.isin(lab, 1 + np.nonzero(sizes >= cfg.get('speck', 30) * AT * AT)[0])
    g = glass.copy()
    for _ in range(2 * AT):
        pad = np.pad(g, 1)
        nb = sum(pad[1 + dy:1 + dy + R, 1 + dx:1 + dx + R] for dy in (-1, 0, 1) for dx in (-1, 0, 1) if dy or dx)
        g = (g | (nb >= 5)) & covered
    glass = g
    print('glass points', int(glass.sum()), 'of', int(covered.sum()))
    return spec, pos, uv, body, P, N, T, tex, covered, glass, found


def write(car, spec, uv, body, T, covered, glass):
    """The glass's pictures and the list of its triangles."""
    # (carried out past the picture's pieces: each point no triangle covers takes the nearest covered point's value, so
    # that a point read across a piece's edge is that piece's own)
    _, (iy, ix) = ndimage.distance_transform_edt(~covered, return_indices=True)
    full = glass[iy, ix].astype(np.float32)
    for name, size in OUT.items():
        im = Image.fromarray((full * 255).astype(np.uint8), 'L').resize((size, size), Image.BOX)
        # (the edge eased over about a point of the smaller picture)
        a = ndimage.gaussian_filter(np.asarray(im).astype(np.float32), 0.6 if size >= 1024 else 0.45)
        Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), 'L').save(os.path.join(OUTDIR, f'{car}-windows-{name}.png'), optimize=True)
    # the triangles any of whose glass is drawn: any covering a point near the glass, or with a corner or its middle on
    # the glass (one too small to cover a point of the picture)
    near = ndimage.binary_dilation(glass, iterations=2 * AT)
    tri = np.zeros(len(body), bool)
    owners = T[near & covered]
    tri[owners[owners >= 0]] = True
    U = uv[body]
    for pts in (U[:, 0], U[:, 1], U[:, 2], U.mean(axis=1)):
        c = np.clip((pts[:, 0] * R).astype(int), 0, R - 1); r = np.clip((pts[:, 1] * R).astype(int), 0, R - 1)
        tri |= near[r, c]
    bits = np.packbits(tri.astype(np.uint8), bitorder='little')
    open(os.path.join(OUTDIR, f'{car}-glass.bin'), 'wb').write(bits.tobytes())
    print('  glass triangles', int(tri.sum()), 'of', len(body))
    return int(tri.sum())


def sheet(car, P, N, tex, glass, found, folder):
    os.makedirs(folder, exist_ok=True)
    views = {'front': (0, 0.3, 1), 'front-left': (1, 0.35, 1), 'left': (1, 0.15, 0), 'back-left': (1, 0.35, -1), 'back': (0, 0.3, -1), 'back-right': (-1, 0.35, -1), 'right': (-1, 0.15, 0), 'front-right': (-1, 0.35, 1)}
    tiles = [Image.fromarray(look(P, N, tex, dv, px=640, mask=glass)[0]) for dv in views.values()]
    w = max(t.width for t in tiles); h = max(t.height for t in tiles)
    out = Image.new('RGB', (w * 4, h * 2), (255, 255, 255))
    for i, t in enumerate(tiles): out.paste(t, ((i % 4) * w, (i // 4) * h))
    out.save(os.path.join(folder, f'{car}-windows-8.png'))
    for name, (img, frame, kept, n) in found.items():
        Image.fromarray(img).save(os.path.join(folder, f'{car}-look-{name}.png'))
        # (and how each look lies: for reading a shape's corners off it, in the model's units)
        hx, vy, e, lo_h, lo_v, s, H_ = frame
        json.dump({'hx': list(hx), 'vy': list(vy), 'lo_h': lo_h, 'lo_v': lo_v, 's': s, 'H': H_}, open(os.path.join(folder, f'{car}-look-{name}.json'), 'w'))


def fit_of(spec, pos, body, n_z=33, n_y=19):
    """How much room the shell leaves inside, for fitting a cabin to it (the brief's part 3: "Fitted so nothing pokes
    through the body or the glass"): cut across at `n_z` places along the car, at each of `n_y` heights (and more near
    the roof), how far out its side is (the nearer side's, from the middle line: a half width); how high its top is
    over the middle line (the roof, the glass, the bonnet: `top`), and the lowest that is across the middle two fifths
    of its width (`low`: a curved bonnet or windscreen lower at its sides than at its middle); and how high the top is
    at nine places across from the middle line out to the body's side (`roof`: for a lining that follows the roof's
    curve down to its edges). The model's units; null where the cut finds nothing.
    Each of the body's triangles that the cut crosses is a short line across it; the side at a height is read along
    those lines where they cross that height: the skin nearest the middle line of the surface that faces out sideways
    to its own side (the doors and the side glass; not a mirror, a flared arch or a sill further out, nor the roof, the
    glass over the cabin or the floor, which cross a height near the middle line, nor a roof rail's inner face)."""
    A = pos[body]
    L, H, B = spec['length'], spec['height'], spec['body']
    nrm = np.cross(A[:, 1] - A[:, 0], A[:, 2] - A[:, 0]); nrm /= (np.linalg.norm(nrm, axis=1, keepdims=True) + 1e-12)
    # (heights a twentieth of the car's apart, and closer near the roof, where the shell rounds in to it)
    zs = np.linspace(-0.48 * L, 0.48 * L, n_z); ys = np.unique(np.round(np.concatenate([np.linspace(0.1 * H, H, n_y), np.linspace(0.84 * H, H, 17)]), 6))
    lo = A[:, :, 2].min(axis=1); hi = A[:, :, 2].max(axis=1)
    half, top, low, roof = [], [], [], []
    for z in zs:
        on = (lo <= z) & (hi >= z)
        T, F = A[on], nrm[on, 0]
        # (each triangle's line across the cut: where two of its edges cross it)
        ends = []
        for i, j in ((0, 1), (1, 2), (2, 0)):
            p, q = T[:, i], T[:, j]
            dz = q[:, 2] - p[:, 2]
            ok = (np.minimum(p[:, 2], q[:, 2]) <= z) & (np.maximum(p[:, 2], q[:, 2]) >= z) & (np.abs(dz) > 1e-12)
            t = np.where(ok, (z - p[:, 2]) / np.where(ok, dz, 1.0), np.nan)
            ends.append(p + (q - p) * t[:, None])
        E = np.stack(ends, axis=1)                         # (triangles, 3 edges, xyz), nan where an edge does not cross
        good = ~np.isnan(E[..., 0])
        first = np.argmax(good, axis=1); last = 2 - np.argmax(good[:, ::-1], axis=1)
        two = good.sum(axis=1) >= 2
        P0 = E[np.arange(len(E)), first][two]; P1 = E[np.arange(len(E)), last][two]; Fs = F[two]
        side = np.abs(Fs) > 0.45
        row = []
        for y in ys:
            a0, a1, f = P0[side], P1[side], Fs[side]
            y0, y1 = a0[:, 1], a1[:, 1]
            span = (np.minimum(y0, y1) <= y) & (np.maximum(y0, y1) >= y) & (np.abs(y1 - y0) > 1e-9)
            k = (y - y0[span]) / (y1[span] - y0[span])
            xs = a0[span, 0] + (a1[span, 0] - a0[span, 0]) * k
            fs = f[span]
            # (and the nearly flat lines at this height, at their ends)
            flat = (np.abs(y1 - y0) <= 1e-9) & (np.abs(y0 - y) < 0.004 * H)
            xs = np.concatenate([xs, a0[flat, 0], a1[flat, 0]]); fs = np.concatenate([fs, f[flat], f[flat]])
            # (each side's skin faces out to that side: a roof rail's or a mirror's inner face does not)
            l, r = xs[(xs > 0) & (fs > 0)], xs[(xs < 0) & (fs < 0)]
            row.append(round(float(min(l.min(), -r.max())), 4) if len(l) and len(r) else None)
        half.append(row)
        # (the top: the highest point of the lines over the middle line, and over each of a few lines across the middle
        # two fifths, the lowest of those)
        def highest(x0, w):
            ys_ = []
            for P_, Q_ in ((P0, P1), (P1, P0)):
                near = np.abs(P_[:, 0] - x0) < w
                ys_.append(P_[near, 1])
            # (a line crossing x0: its height there)
            dx = P1[:, 0] - P0[:, 0]
            cross = (np.minimum(P0[:, 0], P1[:, 0]) <= x0) & (np.maximum(P0[:, 0], P1[:, 0]) >= x0) & (np.abs(dx) > 1e-9)
            k = (x0 - P0[cross, 0]) / dx[cross]
            ys_.append(P0[cross, 1] + (P1[cross, 1] - P0[cross, 1]) * k)
            v = np.concatenate(ys_)
            return float(v.max()) if len(v) else None
        mid = highest(0.0, 0.08 * B)
        top.append(round(mid, 4) if mid is not None else None)
        tops = [h for h in (highest(x, 0.01 * B) for x in np.linspace(-B / 5, B / 5, 9)) if h is not None]
        low.append(round(min(tops), 4) if tops else None)
        # (the roof across: how high it is at nine places out from the middle line to the body's side, the lower of
        # either side's)
        across = []
        for x in np.linspace(0, B / 2, 9):
            a_, b_ = highest(x, 0.01 * B), highest(-x, 0.01 * B)
            across.append(round(min(a_, b_), 4) if a_ is not None and b_ is not None else None)
        roof.append(across)
    return {'z': [round(float(v), 4) for v in zs], 'y': [round(float(v), 4) for v in ys], 'half': half, 'top': top, 'low': low, 'roof': roof, 'roofX': [round(float(v), 4) for v in np.linspace(0, B / 2, 9)]}


def belt_of(spec, P, glass):
    """How low the side glass comes (the model's units), for the dust along it."""
    side = glass & (np.abs(np.nan_to_num(P[..., 0])) > 0.3 * spec['body'])
    ys = P[side, 1]
    return round(float(np.percentile(ys, 3)), 4) if len(ys) else None


def write_js(entries):
    # (a car a line, its numbers close together: twelve cars' room inside, laid out a number a line, was 230 KB of the
    # game's script, 6 November 2026)
    lines = ',\n'.join(f' {json.dumps(k)}: {json.dumps(entries[k], separators=(",", ":"))}' for k in sorted(entries))
    open(JS, 'w').write(
        '// Written by tools/vehicles/windows.py from the game\'s own copies of the cars (5 November 2026). Do not edit by hand.\n'
        '// For each car whose windows are glass: its pictures of where the glass is (white), the list of the body\'s triangles\n'
        '// any of whose glass is drawn (a bit each), how low its side glass comes (the model\'s units), whether its glass behind\n'
        '// the front doors is privacy glass; and for a car given a cabin of the game\'s, the room inside its shell (`fit`).\n'
        f'export const {NAME} = Object.freeze({{\n{lines}\n}});\n')


def main():
    args = sys.argv[1:]
    folder = None
    if '--sheet' in args:
        i = args.index('--sheet'); folder = args[i + 1]; del args[i:i + 2]
    settings = json.load(open(SETTINGS)) if os.path.exists(SETTINGS) else {}
    made = {}
    if os.path.exists(JS):
        text = open(JS).read()
        made = json.loads(text[text.index('Object.freeze(') + 14:text.rindex(');')])
    if args == ['--js']:
        write_js(made); return
    for car in args:
        cfg = settings.get(car, {})
        spec, pos, uv, body, P, N, T, tex, covered, glass, found = find(car, cfg)
        count = write(car, spec, uv, body, T, covered, glass)
        made[car] = {'masks': {k: f'{car}-windows-{k}.png' for k in OUT}, 'tris': f'{car}-glass.bin', 'count': count,
                     'belt': belt_of(spec, P, glass), 'privacy': car in PRIVACY}
        # (a car with a cabin of its own keeps it: no room measured for one of ours)
        if not spec['driver'].get('seen'): made[car]['fit'] = fit_of(spec, pos, body)
        # (the owner's ambulance and trucks: their measures and their cabs' with them, drawn from their own files)
        if NAME != 'CAR_WINDOWS': made[car].update({k: round(spec[k], 5) for k in ('length', 'height', 'body')}, driver=spec['driver'])
        if folder: sheet(car, P, N, tex, glass, found, folder)
    write_js(made)


if __name__ == '__main__':
    main()
