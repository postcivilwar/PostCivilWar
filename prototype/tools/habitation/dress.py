"""The habitation's plants and things made realistic, from the owner's own models (assets/habitation/*.glb, which
this never changes): each written as a new GLB beside the others, for the game to draw.

What is done depends on what the model is (its `kind`, models.json):

  palm      the trunk kept as it is (with the relief of its bark, from its own picture); each frond, found in the
            model where it is, how long and wide, how it rises and droops, and its own greens from tip to base, made
            again as a rib with its leaflets either side and the air between them (leaves.py's frond picture),
            folded as a palm frond is, moving in the wind from its tip;
  banana    the model as it is, each leaf torn from its edge toward its midrib as banana leaves are by the wind (the
            tears cut out of its picture, so the light comes through them), and moving in the wind;
  shrub     the model's own leaves kept; its round mass, which shows as a smooth ball, covered in sprays of leaves the
            shape and colour of its own, so that it is a bush of leaves with the light and the air in it;
  wood, rock, structure
            the model as it is, with the relief of its surface (bark, rock, moss, planks, rope), made from its own picture,
            and how glossy each part is, so that it is lit as wood or stone is.

    python3 tools/habitation/dress.py <model.glb> <out.glb> <kind> [most=2048] [leaves=sheet.webp]
"""
import json, math, sys, io, os
import numpy as np
from PIL import Image, ImageFilter
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import glbio, leaves

# ------------------------------------------------------------------------------------------------ colours --

def hsv(col):
    mx = col.max(1); mn = col.min(1)
    sat = (mx - mn) / np.maximum(mx, 1e-6)
    r, g, b = col.T
    hue = np.degrees(np.arctan2(np.sqrt(3) * (g - b), 2 * r - g - b)) % 360
    return hue, sat, mx

def linear(c):
    """sRGB colours (0..1) as linear light."""
    c = np.asarray(c, dtype=np.float64)
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)

def leafy(col):
    """Which colours are a leaf's: green to yellow-green, not brown, grey or straw."""
    hue, sat, val = hsv(col)
    return (hue >= 48) & (hue <= 175) & (sat >= 0.3)

# --------------------------------------------------------------------------------------- relief and gloss --

def relief(im, strength=2.2, fine=1.0):
    """A normal map from a picture: dark is low, light is high (bark's furrows, the gaps between planks, the cracks in
    rock), in glTF's convention (+X right, +Y up in the picture's own directions), and how rough each part is."""
    a = np.asarray(im.convert('L'), dtype=np.float32) / 255.0
    h, w = a.shape
    # the relief at two scales: the fine grain and the larger shapes
    big = np.asarray(Image.fromarray(np.uint8(a * 255)).filter(ImageFilter.GaussianBlur(max(1.0, w / 512))), dtype=np.float32) / 255.0
    small = np.asarray(Image.fromarray(np.uint8(a * 255)).filter(ImageFilter.GaussianBlur(max(0.6, w / 2048) * fine)), dtype=np.float32) / 255.0
    height = 0.65 * small + 0.35 * big
    gx = (np.roll(height, -1, 1) - np.roll(height, 1, 1)) * 0.5 * (w / 1024) * strength * 6
    gy = (np.roll(height, -1, 0) - np.roll(height, 1, 0)) * 0.5 * (h / 1024) * strength * 6
    n = np.stack([-gx, gy, np.ones_like(gx)], -1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    rgb = np.uint8(np.clip((n * 0.5 + 0.5) * 255, 0, 255))
    return Image.fromarray(rgb, 'RGB')

def hollows(im, depth=0.35):
    """The picture with its hollows darkened (cracks between stones, the shade under a ledge), as light reaches less
    into them: from how much darker each part is than what is round it."""
    a = np.asarray(im.convert('L'), dtype=np.float32) / 255.0
    w = a.shape[1]
    around = np.asarray(Image.fromarray(np.uint8(a * 255)).filter(ImageFilter.GaussianBlur(max(2.0, w / 256))), dtype=np.float32) / 255.0
    cavity = np.clip((around - a) * 3.0, 0, 1)
    shade = 1 - depth * cavity
    rgb = np.asarray(im.convert('RGB'), dtype=np.float32) * shade[..., None]
    return Image.fromarray(np.uint8(np.clip(rgb, 0, 255)))

def gloss(im, base=0.82, spread=0.14):
    """How rough each part is (glTF's metallic-roughness picture: green the roughness, blue the metal, none here):
    the darker hollows rougher, the light worn faces a little smoother."""
    a = np.asarray(im.convert('L'), dtype=np.float32) / 255.0
    rough = np.clip(base + spread * (0.5 - a) * 2, 0.45, 1.0)
    out = np.stack([np.full_like(a, 1.0), rough, np.zeros_like(a)], -1)
    return Image.fromarray(np.uint8(out * 255), 'RGB')

# ------------------------------------------------------------------------------------------------ palms --

def frame(t):
    """Two directions square to a direction t."""
    t = t / (np.linalg.norm(t) or 1)
    up = np.array([0.0, 1.0, 0.0]) if abs(t[1]) < 0.9 else np.array([1.0, 0.0, 0.0])
    a = np.cross(up, t); a /= np.linalg.norm(a)
    b = np.cross(t, a)
    return a, b

def palm(m, col, opts):
    P, F = m['P'], m['F']
    n = len(P)
    H = np.ptp(P[:, 1])
    k, lab = glbio.components(F, n)
    hue, sat, val = hsv(col)
    # a palm's own colours: its fronds green to yellow-green (their undersides grey-green), its trunk and the old
    # fronds' bases brown to tan
    leaf_v = (hue >= 48) & (hue <= 180) & (sat >= 0.06)
    share = np.bincount(lab, weights=leaf_v, minlength=k) / np.maximum(np.bincount(lab, minlength=k), 1)
    # the trunk: the tall pieces that are not leaf; the crown's heart is at their top
    ymin = np.full(k, 9.0); ymax = np.full(k, -9.0)
    np.minimum.at(ymin, lab, P[:, 1]); np.maximum.at(ymax, lab, P[:, 1])
    tall = ((ymax - ymin) > 0.2 * H) & (share < 0.5) & (ymin < P[:, 1].min() + 0.35 * H)   # (from the ground up)
    tv = tall[lab]
    if opts.get('base'):
        # a fern: no trunk; its fronds rise from its heart at the ground
        tall[:] = False
        tv = np.zeros(n, bool)
        low = P[:, 1] < P[:, 1].min() + 0.12 * H
        C = np.array([np.median(P[low, 0]), P[:, 1].min() + 0.04 * H, np.median(P[low, 2])])
    else:
        if tv.sum() < 10:
            tv = (~leaf_v) & (P[:, 1] < np.percentile(P[:, 1], 40))
        top_y = P[tv, 1].max()
        near_top = tv & (P[:, 1] > top_y - 0.04 * H)
        C = np.array([P[near_top, 0].mean(), top_y, P[near_top, 2].mean()])
    # the fronds: every piece that is mostly leaf, but not the small round ones at the heart of the crown (its
    # coconuts, the new frond's spear): those are kept as they are
    rel = P - C
    d = np.linalg.norm(rel, axis=1)
    reach = np.zeros(k); np.maximum.at(reach, lab, d)
    extent = np.zeros(k)
    for axis in range(3):
        lo = np.full(k, 9.0); hi = np.full(k, -9.0)
        np.minimum.at(lo, lab, P[:, axis]); np.maximum.at(hi, lab, P[:, axis])
        extent = np.maximum(extent, hi - lo)
    heart = (reach < opts.get('heart', 0.14) * H) & (extent < 0.08 * H) & (not opts.get('base'))
    # (a thin flat piece by the crown is part of a frond whatever its colour, its grey underside say; a round one is a
    # coconut, kept)
    flat = np.zeros(k, bool)
    for c_ in np.where(~tall & (reach < 0.3 * H))[0]:
        q = P[lab == c_]
        if len(q) < 4:
            flat[c_] = True; continue
        ev = np.linalg.eigvalsh(np.cov((q - q.mean(0)).T))
        flat[c_] = np.sqrt(max(ev[0], 0)) < 0.3 * np.sqrt(max(ev[-1], 1e-12))
    foliage = ((share[lab] >= 0.5) | flat[lab]) & ~tv & ~(heart & ~flat)[lab]
    from sklearn.cluster import DBSCAN
    # each frond's tip: the outer leaf, grouped by the way it lies from the heart of the crown
    dmax = d[foliage].max()
    outer = np.where(foliage & (d > 0.55 * dmax))[0]
    u = rel[outer] / d[outer][:, None]
    groups = DBSCAN(eps=opts.get('eps', 0.12), min_samples=8).fit(u).labels_
    fronds = []
    for g_ in range(groups.max() + 1):
        idx = outer[groups == g_]
        if len(idx) < 12:
            continue
        far = idx[d[idx] >= np.percentile(d[idx], 85)]
        T = P[far].mean(0)
        # the frond's line: from the heart of the crown, out and up, then over and down to its tip, as fronds grow
        span = T - C
        L = np.linalg.norm(span)
        if L < 0.08 * H:
            continue
        horiz = np.array([span[0], 0.0, span[2]]); hl = np.linalg.norm(horiz)
        out_dir = horiz / hl if hl > 1e-6 else np.array([1.0, 0.0, 0.0])
        lift = opts.get('lift', 0.32) * L
        K = C + out_dir * hl * 0.42 + np.array([0, max(span[1], 0) * 0.75 + lift, 0])
        ts = np.linspace(0, 1, 10)
        spine = ((1 - ts) ** 2)[:, None] * C + (2 * (1 - ts) * ts)[:, None] * K + (ts ** 2)[:, None] * T
        side = np.cross(np.array([0.0, 1.0, 0.0]), out_dir); side /= np.linalg.norm(side) or 1
        # its width: how far its outer leaf spreads to either side of its line (the model's own frond)
        off = (rel[idx] - np.outer(rel[idx] @ out_dir, out_dir)) @ side
        width = 2 * np.percentile(np.abs(off - np.median(off)), 80)
        # its colours, base to tip: the leaf nearest the line at each step along it
        near_tree = None
        colours = []
        for t_ in np.linspace(0.08, 0.95, 6):
            q = spine[int(round(t_ * 9))]
            dd = np.linalg.norm(P[foliage] - q, axis=1)
            sel = np.argsort(dd)[:60]
            c = col[foliage][sel]
            lum = c @ np.array([0.3, 0.55, 0.15])
            colours.append(np.median(c[lum >= np.percentile(lum, 15)], 0))      # (the leaf's own colour, not its deepest shadow)
        # (a palm frond's leaflets reach a third of its length to either side: never narrower than that, as the model's are)
        width = float(np.clip(width * 1.3, opts.get('narrow', 0.5) * L, opts.get('widest', 0.75) * L))
        fronds.append(dict(spine=spine, width=np.full(len(spine), width), colours=np.array(colours), across=side, length=L))
    # where two neighbouring fronds are far apart round the crown, one more between them (a palm's crown is full: the
    # model's thick leaves stood for more fronds than there are of them)
    if opts.get('fill', 1) and len(fronds) >= 3:
        az_ = np.array([np.arctan2(*(f_['spine'][-1] - C)[[2, 0]]) for f_ in fronds])
        order = np.argsort(az_)
        extra = []
        for i in range(len(order)):
            fa, fb = fronds[order[i]], fronds[order[(i + 1) % len(order)]]
            gap = (az_[order[(i + 1) % len(order)]] - az_[order[i]]) % (2 * np.pi)
            if gap > np.radians(opts.get('gap', 24)):
                sp = (fa['spine'] + fb['spine']) / 2
                # (lying between them round the crown, at their mean reach, a little shorter: a younger frond)
                rel_ = sp - C
                ang = az_[order[i]] + gap / 2
                hr = np.hypot(rel_[:, 0], rel_[:, 2])
                sp = C + np.stack([np.cos(ang) * hr * 0.9, rel_[:, 1] * 0.9 + 0.02 * H * np.sin(np.linspace(0, np.pi, len(hr))), np.sin(ang) * hr * 0.9], 1)
                side = np.array([-np.sin(ang), 0.0, np.cos(ang)])
                extra.append(dict(spine=sp, width=(fa['width'] + fb['width']) / 2 * 0.92, colours=(fa['colours'] + fb['colours']) / 2, across=side, length=(fa['length'] + fb['length']) / 2 * 0.9))
        fronds += extra
    # new fronds: a rib along each frond's own line, its leaflets either side hanging a little (a shallow V), as wide as
    # the model's frond, coloured as the model's frond is from its base to its tip
    kind = opts.get('frond', 'coconut')
    u0, v0, u1, v1 = leaves.place(kind)
    Pn, Nn, UVn, Cn, Sw, Fn = [], [], [], [], [], []
    steps = 16
    rng_f = np.random.default_rng(opts.get('seed', 5))
    for fr in fronds:
        sp = fr['spine']
        seg = np.linalg.norm(np.diff(sp, axis=0), axis=1)
        tt = np.concatenate([[0], np.cumsum(seg)]); tt /= tt[-1]
        ts = np.linspace(0, 1, steps + 1)
        line = np.stack([np.interp(ts, tt, sp[:, i]) for i in range(3)], 1)
        wid = np.interp(ts, tt, fr['width'])
        # a frond is narrow at its base, widest past its middle, pointed at its tip; never narrower than its leaflets
        shape = np.sin(np.pi * np.clip(0.05 + ts * 0.96, 0, 1)) ** 0.45
        wid = wid * shape * opts.get('wide', 1.0)
        cc = fr['colours']
        cols = np.stack([np.interp(ts, np.linspace(0.08, 0.95, len(cc)), cc[:, i]) for i in range(3)], 1)
        # each frond a shade of its own; darker toward the heart of the crown, where the light reaches less
        cols = cols * rng_f.uniform(0.9, 1.08) * (0.62 + 0.38 * np.clip(ts / 0.35, 0, 1))[:, None]
        base = len(Pn)
        for i, t in enumerate(ts):
            tan = line[min(i + 1, steps)] - line[max(i - 1, 0)]
            tan /= np.linalg.norm(tan) or 1
            a = fr['across'] - tan * (fr['across'] @ tan); a /= np.linalg.norm(a) or 1
            up = np.cross(tan, a)
            if up[1] < 0: up = -up
            fold = 0.42                                       # the leaflets hang this far below the rib, for their reach
            half = wid[i] / 2
            left = line[i] - a * half - up * half * fold
            right = line[i] + a * half - up * half * fold
            v = v1 - (v1 - v0) * t
            nl = up * 0.85 - a * 0.5; nl /= np.linalg.norm(nl)
            nr = up * 0.85 + a * 0.5; nr /= np.linalg.norm(nr)
            for p_, n_, u_ in ((left, nl, u0), (line[i], up, (u0 + u1) / 2), (right, nr, u1)):
                Pn.append(p_); Nn.append(n_); UVn.append((u_, v)); Cn.append(cols[i]); Sw.append(t ** 1.6)
        for i in range(steps):
            a0 = base + i * 3; b0 = base + (i + 1) * 3
            # (wound so that the frond's top is its front: seen from above it is lit as its top)
            Fn += [(a0, b0 + 1, a0 + 1), (a0, b0, b0 + 1), (a0 + 1, b0 + 2, a0 + 2), (a0 + 1, b0 + 1, b0 + 2)]
    # what is kept of the model: everything that is not a frond (the trunk, the old fronds' bases at the crown, its
    # coconuts); nothing above the heart of the crown but the fronds
    above = P[:, 1] > C[1] + 0.03 * H
    keepF = F[~(foliage[F].any(1)) & ~(above[F].all(1))]
    # The colours as the graphics card takes them (a vertex's colour is linear light, a picture's is not), and raised
    # to make up for the frond picture's leaflets, grey to white (linear 0.66 on the whole): the frond is then the
    # model's own green where the light falls on it as it fell on the model.
    colour = np.clip(linear(np.array(Cn)) / 0.66, 0, 1)
    return dict(kept=keepF, fronds=dict(P=np.array(Pn), N=np.array(Nn), UV=np.array(UVn), colour=colour, sway=np.array(Sw), F=np.array(Fn)),
                notes=dict(crown=C.tolist(), fronds=len(fronds), kept_triangles=int(len(keepF)), frond_triangles=len(Fn)))

# ------------------------------------------------------------------------------------------------ bananas --

def raster_leaf_tears(alpha, UV, F, s, t, tears, edge_seed):
    """Cuts a leaf's tears out of the picture's see-through (alpha, H x W, 1 = solid): for each of the leaf's triangles,
    the pixels it covers, with where each is on the leaf (s along it from its base, t across it from the midrib, -1 to
    1), and see-through where a tear is. `tears`: [(side, s0, depth, width)]."""
    h, w = alpha.shape
    rng = np.random.default_rng(edge_seed)
    for tri in F:
        uv = UV[tri] * np.array([w, h])
        x0, y0 = np.floor(uv.min(0)).astype(int); x1, y1 = np.ceil(uv.max(0)).astype(int)
        x0 = max(x0, 0); y0 = max(y0, 0); x1 = min(x1, w - 1); y1 = min(y1, h - 1)
        if x1 < x0 or y1 < y0:
            continue
        xs, ys = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
        (ax, ay), (bx, by), (cx, cy) = uv
        den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
        if abs(den) < 1e-12:
            continue
        l0 = ((by - cy) * (xs - cx) + (cx - bx) * (ys - cy)) / den
        l1 = ((cy - ay) * (xs - cx) + (ax - cx) * (ys - cy)) / den
        l2 = 1 - l0 - l1
        inside = (l0 >= -0.02) & (l1 >= -0.02) & (l2 >= -0.02)
        if not inside.any():
            continue
        ss = l0 * s[tri[0]] + l1 * s[tri[1]] + l2 * s[tri[2]]
        tt = l0 * t[tri[0]] + l1 * t[tri[1]] + l2 * t[tri[2]]
        cut = np.zeros_like(inside)
        at = np.abs(tt)
        for side, s0, depth, width in tears:
            on = (np.sign(tt) == side) & (at > depth)
            # a tear follows the leaf's veins: from the midrib out to the edge, leaning a little toward the tip; it
            # opens wider toward the edge
            centre = s0 + 0.035 * (at - depth)
            half = width * (0.35 + 0.65 * (at - depth) / max(1e-3, 1 - depth))
            cut |= on & (np.abs(ss - centre) < half)
        # a ragged edge: small bites out of the very edge of the blade
        ragged = (at > 0.93 + 0.05 * np.sin(ss * 157.0 + edge_seed) * np.sin(ss * 61.0))
        cut |= ragged
        sub = alpha[y0:y1 + 1, x0:x1 + 1]
        sub[inside & cut] = 0
        alpha[y0:y1 + 1, x0:x1 + 1] = sub

def banana(m, col, opts, size):
    P, F, UV = m['P'], m['F'], m['UV']
    n = len(P)
    H = np.ptp(P[:, 1])
    k, lab = glbio.components(F, n)
    hue, sat, val = hsv(col)
    leaf_v = (hue >= 48) & (hue <= 180) & (sat >= 0.2)
    share = np.bincount(lab, weights=leaf_v, minlength=k) / np.maximum(np.bincount(lab, minlength=k), 1)
    tris = np.bincount(lab[F[:, 0]], minlength=k)
    # the plant's middle: its pseudostem, where the leaves grow from
    low = P[:, 1] < P[:, 1].min() + 0.25 * H
    axis = np.array([np.median(P[low, 0]), 0.0, np.median(P[low, 2])])
    alpha = np.full((size, size), 255, np.uint8)
    sway = np.zeros(n)
    leafF = np.zeros(len(F), bool)
    rng = np.random.default_rng(opts.get('seed', 7))
    leaves_cut = 0
    for c in range(k):
        if share[c] < 0.75 or tris[c] < opts.get('min_tris', 24):
            continue
        idx = np.where(lab == c)[0]
        q = P[idx]
        centre = q.mean(0)
        cov = np.cov((q - centre).T)
        wv, vv = np.linalg.eigh(cov)
        e1, e2 = vv[:, 2], vv[:, 1]
        a1 = (q - centre) @ e1
        # the base is the end nearer the plant's middle
        d_lo = np.linalg.norm((q[a1 < np.percentile(a1, 10)] - axis)[:, [0, 2]], axis=1).mean()
        d_hi = np.linalg.norm((q[a1 > np.percentile(a1, 90)] - axis)[:, [0, 2]], axis=1).mean()
        if d_hi < d_lo:
            e1 = -e1; a1 = -a1
        s_ = (a1 - a1.min()) / max(np.ptp(a1), 1e-9)
        a2 = (q - centre) @ e2
        # the midrib and the half-width at each step along the leaf
        nb = 12
        bins = np.minimum((s_ * nb).astype(int), nb - 1)
        mid = np.array([np.median(a2[bins == b]) if (bins == b).any() else 0.0 for b in range(nb)])
        half = np.array([np.percentile(np.abs(a2[bins == b] - mid[b]), 95) if (bins == b).sum() > 2 else 0.0 for b in range(nb)])
        half = np.maximum(half, 0.15 * half.max() + 1e-6)
        t_ = (a2 - mid[bins]) / half[bins]
        t_ = np.clip(t_, -1.2, 1.2)
        s_full = np.zeros(n); t_full = np.zeros(n)
        s_full[idx] = s_; t_full[idx] = t_
        # the tears: more on an old leaf (the outer and lower ones) than a young one
        tears = []
        for side in (-1, 1):
            k_ = rng.integers(opts.get('fewest', 5), opts.get('most_tears', 12))
            for s0 in np.sort(rng.uniform(0.12, 0.96, k_)):
                depth = rng.uniform(0.04, 0.6) if rng.random() < 0.7 else rng.uniform(0.6, 0.9)
                tears.append((side, s0, depth, rng.uniform(0.002, 0.007)))
        fl = np.where(lab[F[:, 0]] == c)[0]
        raster_leaf_tears(alpha, UV, F[fl], s_full, t_full, tears, edge_seed=c)
        leafF[fl] = True
        sway[idx] = np.clip(s_, 0, 1)
        leaves_cut += 1
    return dict(alpha=alpha, leafF=leafF, sway=sway, notes=dict(leaves=leaves_cut, axis=axis.tolist()))

# ------------------------------------------------------------------------------------------------ shrubs --

def sprays_over(P, F, N_count, size, colours, spray, rng, lift=0.25, normals_out=None, centre=None):
    """Cards of leaves over a surface (the triangles F of P): N_count of them, each `size` across, its face along the
    surface's way out (from `centre`), turned and tipped at random; each lit as the round mass it is part of."""
    tri = P[F]
    area = 0.5 * np.linalg.norm(np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0]), axis=1)
    pick = rng.choice(len(F), N_count, p=area / area.sum())
    r1 = np.sqrt(rng.random(N_count)); r2 = rng.random(N_count)
    pts = tri[pick, 0] * (1 - r1)[:, None] + tri[pick, 1] * (r1 * (1 - r2))[:, None] + tri[pick, 2] * (r1 * r2)[:, None]
    out = pts - centre
    out /= np.linalg.norm(out, axis=1, keepdims=True)
    u0, v0, u1, v1 = leaves.place(spray)
    Pn, Nn, UVn, Cn, Sw, Fn = [], [], [], [], [], []
    for i in range(N_count):
        nrm = out[i]
        c = pts[i] + nrm * size * lift
        a, b = frame(nrm)
        ang = rng.uniform(0, 2 * np.pi)
        a2 = a * np.cos(ang) + b * np.sin(ang)
        b2 = np.cross(nrm, a2)
        tilt = rng.uniform(-0.6, 0.6)
        b2 = b2 * np.cos(tilt) + nrm * np.sin(tilt)
        sz = size * rng.uniform(0.75, 1.25)
        corners = [c - a2 * sz / 2 - b2 * sz / 2, c + a2 * sz / 2 - b2 * sz / 2, c + a2 * sz / 2 + b2 * sz / 2, c - a2 * sz / 2 + b2 * sz / 2]
        uvs = [(u0, v1), (u1, v1), (u1, v0), (u0, v0)]
        # lit as the mass is: lighter on top and toward the outside, darker beneath
        shade = (0.78 + 0.22 * (nrm[1] + 1) / 2) * rng.uniform(0.88, 1.12)
        colr = colours[rng.integers(len(colours))] * shade
        base = len(Pn)
        for j in range(4):
            Pn.append(corners[j]); Nn.append(nrm * 0.8 + np.array([0, 0.2, 0])); UVn.append(uvs[j]); Cn.append(colr); Sw.append(0.35 + 0.65 * max(0.0, (c[1] - centre[1]) / max(1e-6, np.ptp(P[:, 1]))))
        Fn += [(base, base + 1, base + 2), (base, base + 2, base + 3)]
    return dict(P=np.array(Pn), N=np.array(Nn), UV=np.array(UVn), colour=np.array(Cn), sway=np.array(Sw), F=np.array(Fn))

def shrub(m, col, opts):
    P, F = m['P'], m['F']
    n = len(P)
    H = np.ptp(P[:, 1])
    k, lab = glbio.components(F, n)
    hue, sat, val = hsv(col)
    # its round mass: the dark blue-green the model's leaves sit on
    mass_v = (hue >= 150) & (hue <= 215) & (sat >= 0.35)
    share = np.bincount(lab, weights=mass_v, minlength=k) / np.maximum(np.bincount(lab, minlength=k), 1)
    mass = share[lab] >= 0.6
    massF = mass[F].all(1)
    leafF = ~massF
    # its leaves' own colours (the model's leaves), from which the sprays take theirs
    own = col[~mass]
    lum = own @ np.array([0.3, 0.55, 0.15])
    pal = own[(lum > np.percentile(lum, 20)) & (lum < np.percentile(lum, 95))]
    rng = np.random.default_rng(opts.get('seed', 3))
    picks = pal[rng.integers(len(pal), size=24)]
    # (a living leaf's green is a little quieter than a model's paint: a fifth of the way toward it, the hue kept)
    picks = picks * 0.8 + np.array([0.24, 0.40, 0.12]) * 0.2
    colours = linear(picks) / 0.66
    centre = np.array([np.median(P[mass, 0]), np.percentile(P[mass, 1], 45), np.median(P[mass, 2])]) if mass.any() else P.mean(0)
    size = opts.get('spray', 0.22) * H
    tri = P[F[massF]]
    area = 0.5 * np.linalg.norm(np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0]), axis=1).sum()
    count = int(np.clip(area / (size * size) * opts.get('density', 3.2), 80, 520))
    sp = sprays_over(P, F[massF], count, size, colours, opts.get('kind', 'long'), rng, lift=0.15, centre=centre)
    # the mass itself: the shade inside a bush, a little smaller so the leaves cover it
    inner = (P - centre) * 0.93 + centre
    deep = linear(np.median(pal, 0)) * 0.16
    return dict(massF=massF, leafF=leafF, inner=inner, deep=deep, sprays=sp, notes=dict(sprays=count, mass_triangles=int(massF.sum()), leaf_triangles=int(leafF.sum())))

# ------------------------------------------------------------------------------------------------ bridges --

def box_mesh(centre, ax, ay, az, sx, sy, sz, uvscale=(1.0, 1.0)):
    """A box: centre, its three directions (unit), its three sizes; with picture coordinates along ax on the top and
    sides (the grain of a plank runs along it)."""
    P, N, UV, F = [], [], [], []
    faces = [(ay, ax, az, sy, sx, sz), (-ay, ax, -az, sy, sx, sz), (az, ax, ay, sz, sx, sy), (-az, ax, -ay, sz, sx, sy), (ax, az, ay, sx, sz, sy), (-ax, -az, ay, sx, sz, sy)]
    for n, u, v, dn, du, dv in faces:
        base = len(P)
        c = centre + n * dn / 2
        for i, j in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
            P.append(c + u * du / 2 * i + v * dv / 2 * j); N.append(n)
            UV.append(((i + 1) / 2 * uvscale[0], (j + 1) / 2 * uvscale[1]))
        # (wound so that its outside is its front)
        if np.dot(np.cross(u, v), n) > 0:
            F += [(base, base + 1, base + 2), (base, base + 2, base + 3)]
        else:
            F += [(base, base + 2, base + 1), (base, base + 3, base + 2)]
    return P, N, UV, F

def tube(points, radius, sides=6, uv_len=1.0):
    """A rope along a line of points: a tube of `sides` faces, its picture's width along it."""
    P, N, UV, F = [], [], [], []
    points = np.asarray(points)
    seg = np.linalg.norm(np.diff(points, axis=0), axis=1)
    along = np.concatenate([[0], np.cumsum(seg)])
    for i, p in enumerate(points):
        t = points[min(i + 1, len(points) - 1)] - points[max(i - 1, 0)]
        a, b = frame(t)
        for j in range(sides + 1):
            ang = 2 * np.pi * j / sides
            n = a * np.cos(ang) + b * np.sin(ang)
            P.append(p + n * radius); N.append(n); UV.append((along[i] / uv_len, j / sides))
    for i in range(len(points) - 1):
        for j in range(sides):
            a0 = i * (sides + 1) + j; b0 = (i + 1) * (sides + 1) + j
            F += [(a0, b0, b0 + 1), (a0, b0 + 1, a0 + 1)]
    return P, N, UV, F

def bridge(m, col, opts):
    """A footbridge: its towers and gates at each end kept as the model has them; between them, its span built again as
    such a bridge is: planks across it with gaps between them, laid on the span's own sag, a rope rail either side at
    the height of the model's, the hangers that hold the deck from it, and a rope along each edge of the deck."""
    P, F = m['P'], m['F']
    xz = P[:, [0, 2]]
    c = xz.mean(0)
    w_, v_ = np.linalg.eigh(np.cov((xz - c).T))
    d2 = v_[:, 1]; p2 = np.array([-d2[1], d2[0]])
    a = (xz - c) @ d2; b = (xz - c) @ p2
    Lm = np.ptp(a)
    real = opts.get('length', 16.0)                       # metres, as the bridge is placed in the habitation
    unit = Lm / real                                      # model units in a metre
    # the span: between the ends, where the model is the bridge's trough, not its towers
    nb = 60
    edges = np.linspace(a.min(), a.max(), nb + 1)
    counts = np.array([((a >= edges[i]) & (a < edges[i + 1])).sum() for i in range(nb)])
    floor = np.array([np.percentile(P[(a >= edges[i]) & (a < edges[i + 1]), 1], 10) if counts[i] > 2 else np.nan for i in range(nb)])
    lo_b = np.array([b[(a >= edges[i]) & (a < edges[i + 1])].min() if counts[i] > 2 else np.nan for i in range(nb)])
    hi_b = np.array([b[(a >= edges[i]) & (a < edges[i + 1])].max() if counts[i] > 2 else np.nan for i in range(nb)])
    a0 = a.min() + opts.get('ends', 0.06) * Lm
    a1 = a.max() - opts.get('ends_far', 0.18) * Lm
    mids = (edges[:-1] + edges[1:]) / 2
    span = (mids > a0) & (mids < a1) & ~np.isnan(floor)
    # the deck's sag: a curve through the span's floor (a parabola, as a hanging deck is)
    coef = np.polyfit(mids[span], floor[span], 2)
    deck_y = lambda x: np.polyval(coef, x)
    width = np.median((hi_b - lo_b)[span]) * 0.92
    centre_b = np.median(((hi_b + lo_b) / 2)[span])
    dir3 = np.array([d2[0], 0.0, d2[1]]); side3 = np.array([p2[0], 0.0, p2[1]]); up3 = np.array([0.0, 1.0, 0.0])
    point = lambda x, off, y: np.array([c[0], 0.0, c[1]]) + dir3 * x + side3 * off + up3 * y
    # what is kept of the model: all but the span's trough (every piece of it, even where it runs into the gates: a
    # piece mostly over the span goes whole)
    tri_a = a[F].mean(1)
    k_, lab_ = glbio.components(F, len(P))
    inside = (a > a0) & (a < a1)
    share_in = np.bincount(lab_, weights=inside, minlength=k_) / np.maximum(np.bincount(lab_, minlength=k_), 1)
    keep = ~((tri_a > a0 + 0.004 * Lm) & (tri_a < a1 - 0.004 * Lm)) & ~(share_in[lab_[F[:, 0]]] > 0.5)
    # the planks: 22 cm across, 4 cm thick, 3 cm apart, their ends a little uneven
    rng = np.random.default_rng(opts.get('seed', 11))
    plank_d, gap, thick = 0.2 * unit, 0.035 * unit, 0.045 * unit
    Pp, Np, Up, Fp, Cp = [], [], [], [], []
    deck_col = np.median(col[(np.abs(a - (a0 + a1) / 2) < 0.3 * Lm)], 0)
    x = a0
    while x < a1:
        xm = x + plank_d / 2
        y = deck_y(xm)
        slope = np.polyval(np.polyder(coef), xm)
        along = dir3 + up3 * slope; along /= np.linalg.norm(along)
        nrm = np.cross(side3, along); nrm = nrm if nrm[1] > 0 else -nrm
        wobble = rng.uniform(-0.02, 0.02) * unit
        cen = point(xm, centre_b + wobble, y) + nrm * thick / 2
        # (each a little turned, and of its own shade)
        turn = rng.uniform(-0.025, 0.025)
        ax = side3 * np.cos(turn) + along * np.sin(turn); az = along * np.cos(turn) - side3 * np.sin(turn)
        bp, bn, bu, bf = box_mesh(cen, ax, nrm, az, width * rng.uniform(0.97, 1.03), thick, plank_d, uvscale=(1.0, 0.12))
        o = len(Pp); Pp += bp; Np += bn
        uo, vo = rng.random(), rng.random()
        Up += [(u * 0.9 + uo * 0.1, v + vo) for u, v in bu]
        Fp += [(i + o, j + o, k + o) for i, j, k in bf]
        Cp += [rng.uniform(0.82, 1.1)] * len(bp)
        x += plank_d + gap * rng.uniform(0.7, 1.3)
    plank_colour = np.clip(np.outer(Cp, linear(deck_col) / 0.36), 0, 1)
    # the ropes: the rails at the model's height, the edges of the deck, the hangers between them
    rail_h = opts.get('rail', 1.05) * unit
    Pr, Nr, Ur, Fr = [], [], [], []
    def add(tp):
        o = len(Pr); Pr.extend(tp[0]); Nr.extend(tp[1]); Ur.extend(tp[2]); Fr.extend([(i + o, j + o, k + o) for i, j, k in tp[3]])
    xs = np.linspace(a0, a1, 40)
    for sgn in (-1, 1):
        off = centre_b + sgn * width / 2
        rail = [point(x_, off, deck_y(x_) + rail_h) for x_ in xs]
        edge = [point(x_, off, deck_y(x_) + thick * 1.2) for x_ in xs]
        add(tube(rail, 0.022 * unit, 6, 0.6 * unit))
        add(tube(edge, 0.016 * unit, 5, 0.6 * unit))
        for x_ in np.arange(a0 + 0.6 * unit, a1, 1.1 * unit):
            add(tube([point(x_, off, deck_y(x_) + thick), point(x_, off, deck_y(x_) + rail_h)], 0.01 * unit, 4, 0.6 * unit))
    rope_col = np.array([0.55, 0.47, 0.34])
    return dict(keep=keep, planks=dict(P=np.array(Pp), N=np.array(Np), UV=np.array(Up), F=np.array(Fp), colour=plank_colour),
                ropes=dict(P=np.array(Pr), N=np.array(Nr), UV=np.array(Ur), F=np.array(Fr), colour=np.tile(np.clip(linear(rope_col) / 0.42, 0, 1), (len(Pr), 1))),
                notes=dict(length_m=real, width_m=float(width / unit), planks=int(len(Pp) // 24), sag_m=float((deck_y(a0) - deck_y((a0 + a1) / 2)) / unit),
                           deck=dict(start=point(a0, centre_b, deck_y(a0)).tolist(), end=point(a1, centre_b, deck_y(a1)).tolist(), coef=coef.tolist(), axis=dir3.tolist(), side=side3.tolist(), centre=[float(c[0]), float(c[1])], offset=float(centre_b), width=float(width), rail=float(rail_h))))

# ------------------------------------------------------------------------------------------------- trees --

def tree(m, col, opts):
    """A tree: its trunk, roots and branches kept as the model has them (with their bark's relief); its crown, which in
    the model is clumps of solid leaf, made a crown of leaves: each clump's surface covered in sprays of leaves the
    colour of its own (the shape each kind of tree has: small, long, broad or round), the clump itself kept inside,
    darker, as the shade within a crown is."""
    P, F = m['P'], m['F']
    n = len(P)
    H = np.ptp(P[:, 1])
    k, lab = glbio.components(F, n)
    hue, sat, val = hsv(col)
    leaf_v = (hue >= 50) & (hue <= 190) & (sat >= opts.get('leaf_sat', 0.18))
    share = np.bincount(lab, weights=leaf_v, minlength=k) / np.maximum(np.bincount(lab, minlength=k), 1)
    foliage = share[lab] >= 0.5
    leafF = foliage[F].all(1)
    if leafF.sum() < 10:
        return None
    # the leaves' own colours
    own = col[foliage]
    lum = own @ np.array([0.3, 0.55, 0.15])
    pal = own[(lum > np.percentile(lum, 15)) & (lum < np.percentile(lum, 97))]
    rng = np.random.default_rng(opts.get('seed', 13))
    picks = pal[rng.integers(len(pal), size=32)]
    picks = picks * 0.85 + np.array([0.22, 0.38, 0.12]) * 0.15
    colours = linear(picks) / 0.66
    # each clump: its own middle, so its sprays face out of it
    centres = np.zeros((k, 3)); counts = np.bincount(lab, minlength=k).astype(float)
    for a_ in range(3): centres[:, a_] = np.bincount(lab, weights=P[:, a_], minlength=k) / np.maximum(counts, 1)
    size = opts.get('spray', 0.09) * H
    tri = P[F[leafF]]
    area = 0.5 * np.linalg.norm(np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0]), axis=1)
    count = int(np.clip(area.sum() / (size * size) * opts.get('density', 1.6), 120, opts.get('most', 900)))
    pick = rng.choice(len(area), count, p=area / area.sum())
    r1 = np.sqrt(rng.random(count)); r2 = rng.random(count)
    fl = F[leafF][pick]
    pts_ = P[fl[:, 0]] * (1 - r1)[:, None] + P[fl[:, 1]] * (r1 * (1 - r2))[:, None] + P[fl[:, 2]] * (r1 * r2)[:, None]
    mids = centres[lab[fl[:, 0]]]
    # (a clump much flatter than it is wide faces up: a tier of an almond, a leaf of a buttress tree)
    out = pts_ - mids
    out[:, 1] += 0.35 * np.linalg.norm(out, axis=1)
    out /= np.maximum(np.linalg.norm(out, axis=1, keepdims=True), 1e-9)
    u0, v0, u1, v1 = leaves.place(opts.get('leaf', 'small'))
    Pn, Nn, UVn, Cn, Sw, Fn = [], [], [], [], [], []
    top = P[:, 1].max()
    for i in range(count):
        nrm = out[i]
        c = pts_[i] + nrm * size * 0.18
        a, b = frame(nrm)
        ang = rng.uniform(0, 2 * np.pi)
        a2 = a * np.cos(ang) + b * np.sin(ang); b2 = np.cross(nrm, a2)
        tilt = rng.uniform(-0.7, 0.7)
        b2 = b2 * np.cos(tilt) + nrm * np.sin(tilt)
        sz = size * rng.uniform(0.75, 1.3)
        corners = [c - a2 * sz / 2 - b2 * sz / 2, c + a2 * sz / 2 - b2 * sz / 2, c + a2 * sz / 2 + b2 * sz / 2, c - a2 * sz / 2 + b2 * sz / 2]
        uvs = [(u0, v1), (u1, v1), (u1, v0), (u0, v0)]
        # lit as the crown is: light on its top and outside, darker beneath and within
        height = (c[1] - P[:, 1].min()) / max(H, 1e-6)
        shade = (0.72 + 0.28 * (nrm[1] + 1) / 2) * (0.85 + 0.15 * height) * rng.uniform(0.88, 1.12)
        colr = colours[rng.integers(len(colours))] * shade
        base = len(Pn)
        for j in range(4):
            Pn.append(corners[j]); Nn.append(nrm * 0.75 + np.array([0, 0.25, 0])); UVn.append(uvs[j]); Cn.append(colr)
            Sw.append(np.clip(0.25 + 0.75 * height, 0, 1))
        Fn += [(base, base + 1, base + 2), (base, base + 2, base + 3)]
    # the clumps themselves, inside: a little smaller (toward their own middles), dark
    inner = P.copy()
    fv = foliage
    inner[fv] = centres[lab[fv]] + (P[fv] - centres[lab[fv]]) * opts.get('inner', 0.9)
    deep = linear(np.median(pal, 0)) * opts.get('deep', 0.22)
    return dict(leafF=leafF, inner=inner, deep=deep, sprays=dict(P=np.array(Pn), N=np.array(Nn), UV=np.array(UVn), colour=np.clip(np.array(Cn), 0, 1), sway=np.array(Sw), F=np.array(Fn)),
                notes=dict(sprays=count, crown_triangles=int(leafF.sum()), wood_triangles=int((~leafF).sum())))

# ------------------------------------------------------------------------------------------------ herbs --

def herb(m, col, opts):
    """A plant whose own leaves are as they should be (a monstera's split leaves, an elephant ear's, a bird's nest
    fern's): kept as they are, given a leaf's light and the wind; its stems and soil as the rest."""
    P, F = m['P'], m['F']
    n = len(P)
    k, lab = glbio.components(F, n)
    hue, sat, val = hsv(col)
    leaf_v = (hue >= 50) & (hue <= 190) & (sat >= opts.get('leaf_sat', 0.2))
    share = np.bincount(lab, weights=leaf_v, minlength=k) / np.maximum(np.bincount(lab, minlength=k), 1)
    foliage = share[lab] >= 0.5
    leafF = foliage[F].all(1)
    H = np.ptp(P[:, 1])
    sway = np.clip((P[:, 1] - P[:, 1].min()) / max(H, 1e-6), 0, 1) ** 1.2
    return dict(leafF=leafF, sway=sway, notes=dict(leaf_triangles=int(leafF.sum()), other_triangles=int((~leafF).sum())))

# ------------------------------------------------------------------------------------------- the model out --

def compact(P, N, UV, F):
    """Only the vertices the triangles use."""
    used = np.unique(F)
    remap = np.full(len(P), -1); remap[used] = np.arange(len(used))
    return P[used], (N[used] if N is not None else None), UV[used], remap[F]

def dress(src, out, kind, most=2048, sheet=None, opts=None):
    opts = opts or {}
    m = glbio.read(src)
    im = glbio.picture(m, most)
    col = glbio.sample(glbio.picture(m, 1024), m['UV'])
    prims = []
    notes = dict(source=os.path.basename(src), kind=kind)
    if kind in ('cliff', 'rock'):
        im = hollows(im, opts.get('hollows', 0.45))
    if opts.get('drop_above') is not None:
        # (stray bits left floating above a model by the program that made it: the bench's: not drawn)
        keep = ~(m['P'][m['F'], 1] > float(opts['drop_above'])).all(1)
        m['F'] = m['F'][keep]
    # (the relief at half the picture's size: it is fine detail, and half the memory; how rough: one figure for the
    # whole surface, its picture not sent)
    half = im.resize((max(64, im.size[0] // 2),) * 2, Image.LANCZOS)
    wood_mat = dict(name='surface', picture=glbio.encode(im, 'webp', 84), normal=glbio.encode(relief(half, opts.get('relief', 2.2)), 'webp', 86),
                    roughness=opts.get('roughness', 0.86), metallic=0.0, double=True, extras=dict(part='surface'))
    if kind in ('palm', 'fern'):
        if kind == 'fern': opts = dict(opts, base=1)
        r = palm(m, col, opts)
        P, N, UV, F = compact(m['P'], m['N'], m['UV'], r['kept'])
        prims.append(dict(P=P, N=N, UV=UV, F=F, material=wood_mat))
        fr = r['fronds']
        leaf_mat = dict(name='leaves', picture=sheet, alpha='MASK', cutoff=0.4, double=True, roughness=0.75, metallic=0.0, extras=dict(part='leaves'))
        prims.append(dict(P=fr['P'], N=fr['N'], UV=fr['UV'], F=fr['F'], colour=fr['colour'], sway=fr['sway'], material=leaf_mat))
        notes.update(r['notes'])
    elif kind == 'banana':
        size = im.size[0]
        r = banana(m, col, opts, size)
        rgba = im.convert('RGBA'); rgba.putalpha(Image.fromarray(r['alpha']))
        pic = glbio.encode(rgba, 'webp', 84)
        stem_mat = dict(wood_mat); stem_mat['picture'] = pic
        F = m['F']
        P, N, UV, Fk = compact(m['P'], m['N'], m['UV'], F[~r['leafF']])
        prims.append(dict(P=P, N=N, UV=UV, F=Fk, material=stem_mat))
        used = np.unique(F[r['leafF']]); remap = np.full(len(m['P']), -1); remap[used] = np.arange(len(used))
        leaf_mat = dict(name='leaves', picture=pic, alpha='MASK', cutoff=0.5, double=True, roughness=0.7, metallic=0.0, extras=dict(part='leaves', sway=opts.get('sway', 0.03)))
        # (the leaves are the model's own colour: their picture carries it, the vertex colour is white)
        prims.append(dict(P=m['P'][used], N=m['N'][used], UV=m['UV'][used], F=remap[F[r['leafF']]], colour=np.ones((len(used), 3)), sway=r['sway'][used], material=leaf_mat))
        notes.update(r['notes'])
    elif kind == 'shrub':
        r = shrub(m, col, opts)
        F = m['F']
        sheet_mat = dict(name='leaves', picture=sheet, alpha='MASK', cutoff=0.42, double=True, roughness=0.75, metallic=0.0, extras=dict(part='leaves', sway=opts.get('sway', 0.02)))
        own_mat = dict(name='own-leaves', picture=glbio.encode(im, 'webp', 84), double=True, roughness=0.75, metallic=0.0, extras=dict(part='leaves', sway=opts.get('sway', 0.02)))
        # the mass, dark, without its picture
        P, N, UV, Fk = compact(r['inner'], m['N'], m['UV'], F[r['massF']])
        deep = np.tile(np.clip(r['deep'], 0, 1), (len(P), 1))
        prims.append(dict(P=P, N=N, UV=UV, F=Fk, colour=deep, material=dict(name='inside', double=True, roughness=1.0, metallic=0.0, extras=dict(part='inside'))))
        # the model's own leaves, as they are, moving in the wind
        P, N, UV, Fk = compact(m['P'], m['N'], m['UV'], F[r['leafF']])
        prims.append(dict(P=P, N=N, UV=UV, F=Fk, colour=np.ones((len(P), 3)), sway=np.full(len(P), 0.8), material=own_mat))
        sp = r['sprays']
        prims.append(dict(P=sp['P'], N=sp['N'], UV=sp['UV'], F=sp['F'], colour=np.clip(sp['colour'], 0, 1), sway=sp['sway'], material=sheet_mat))
        notes.update(r['notes'])
    elif kind == 'bridge':
        r = bridge(m, col, opts)
        here = os.path.dirname(os.path.abspath(__file__))
        import surfaces
        wood_c, wood_n = surfaces.wood(512)
        rope_c, rope_n = surfaces.rope(256)
        P, N, UV, Fk = compact(m['P'], m['N'], m['UV'], m['F'][r['keep']])
        prims.append(dict(P=P, N=N, UV=UV, F=Fk, material=wood_mat))
        pl = r['planks']
        prims.append(dict(P=pl['P'], N=pl['N'], UV=pl['UV'], F=pl['F'], colour=pl['colour'], material=dict(name='planks', picture=glbio.encode(wood_c, 'jpeg', 88), normal=glbio.encode(wood_n, 'jpeg', 92), roughness=0.85, metallic=0.0, double=False, extras=dict(part='planks'))))
        ro = r['ropes']
        prims.append(dict(P=ro['P'], N=ro['N'], UV=ro['UV'], F=ro['F'], colour=ro['colour'], material=dict(name='rope', picture=glbio.encode(rope_c, 'jpeg', 88), normal=glbio.encode(rope_n, 'jpeg', 92), roughness=0.95, metallic=0.0, double=False, extras=dict(part='rope'))))
        notes.update(r['notes'])
    elif kind == 'tree':
        r = tree(m, col, opts)
        F = m['F']
        if r is None:
            prims.append(dict(P=m['P'], N=m['N'], UV=m['UV'], F=F, material=wood_mat))
        else:
            P, N, UV, Fk = compact(m['P'], m['N'], m['UV'], F[~r['leafF']])
            prims.append(dict(P=P, N=N, UV=UV, F=Fk, material=wood_mat))
            P, N, UV, Fk = compact(r['inner'], m['N'], m['UV'], F[r['leafF']])
            prims.append(dict(P=P, N=N, UV=UV, F=Fk, colour=np.tile(np.clip(r['deep'], 0, 1), (len(P), 1)), material=dict(name='inside', double=True, roughness=1.0, metallic=0.0, extras=dict(part='inside'))))
            sp = r['sprays']
            prims.append(dict(P=sp['P'], N=sp['N'], UV=sp['UV'], F=sp['F'], colour=sp['colour'], sway=sp['sway'], material=dict(name='leaves', picture=sheet, alpha='MASK', cutoff=0.42, double=True, roughness=0.75, metallic=0.0, extras=dict(part='leaves', sway=opts.get('sway', 0.012)))))
            notes.update(r['notes'])
    elif kind == 'herb':
        r = herb(m, col, opts)
        F = m['F']
        pic = glbio.encode(im, 'webp', 84)
        stem = dict(wood_mat); stem['picture'] = pic
        P, N, UV, Fk = compact(m['P'], m['N'], m['UV'], F[~r['leafF']])
        if len(Fk): prims.append(dict(P=P, N=N, UV=UV, F=Fk, material=stem))
        used = np.unique(F[r['leafF']]); remap = np.full(len(m['P']), -1); remap[used] = np.arange(len(used))
        prims.append(dict(P=m['P'][used], N=m['N'][used], UV=m['UV'][used], F=remap[F[r['leafF']]], colour=np.ones((len(used), 3)), sway=r['sway'][used], material=dict(name='leaves', picture=pic, double=True, roughness=0.7, metallic=0.0, extras=dict(part='leaves', sway=opts.get('sway', 0.03)))))
        notes.update(r['notes'])
    else:
        prims.append(dict(P=m['P'], N=m['N'], UV=m['UV'], F=m['F'], material=wood_mat))
    size = glbio.write(out, prims, extras=dict(dressed=notes))
    notes['bytes'] = size
    return notes

if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if '=' not in a]
    kw = dict(a.split('=', 1) for a in sys.argv[1:] if '=' in a)
    most = int(kw.get('most', 2048))
    sheet = None
    if 'leaves' in kw:
        sheet = (open(kw['leaves'], 'rb').read(), 'image/webp' if kw['leaves'].endswith('.webp') else 'image/png')
    opts = {k: (float(v) if v.replace('.', '', 1).isdigit() else v) for k, v in kw.items() if k not in ('most', 'leaves')}
    notes = dress(args[0], args[1], args[2], most, sheet, opts)
    print(json.dumps(notes))
