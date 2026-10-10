"""A small software renderer, for looking at parts while they are being made.

Orthographic, z-buffered, lit from the front-left. Not used by the game.
"""
import numpy as np
from PIL import Image

PALETTE = {0: (118, 83, 58), 1: (30, 26, 24), 2: (94, 58, 44), 3: (240, 238, 230), 4: (20, 18, 16), 5: (150, 110, 90), 6: (30, 26, 24), 8: (198, 206, 183), 9: (74, 168, 20), 10: (40, 60, 150), 11: (200, 60, 40)}


def render(mesh, view='front', box=None, size=600, palette=None, light=(0.35, 0.5, 0.8), background=(150, 158, 168), wire=False):
    """`box` is (x0, y0, x1, y1) in the view's own axes, in metres."""
    pal = dict(PALETTE); pal.update(palette or {})
    P = mesh['pos']; N = mesh['nrm']
    if view == 'front': X, Y, Z = P[:, 0], P[:, 1], P[:, 2]; n3 = N
    elif view == 'back': X, Y, Z = -P[:, 0], P[:, 1], -P[:, 2]; n3 = N * [-1, 1, -1]
    elif view == 'left': X, Y, Z = -P[:, 2], P[:, 1], P[:, 0]; n3 = np.c_[-N[:, 2], N[:, 1], N[:, 0]]
    elif view == 'right': X, Y, Z = P[:, 2], P[:, 1], -P[:, 0]; n3 = np.c_[N[:, 2], N[:, 1], -N[:, 0]]
    elif view == 'top': X, Y, Z = P[:, 0], -P[:, 2], P[:, 1]; n3 = np.c_[N[:, 0], -N[:, 2], N[:, 1]]
    else: raise ValueError(view)
    if box is None:
        pad = 0.03; box = (X.min() - pad, Y.min() - pad, X.max() + pad, Y.max() + pad)
    x0, y0, x1, y1 = box
    scale = size / max(x1 - x0, y1 - y0)
    w = int(np.ceil((x1 - x0) * scale)); h = int(np.ceil((y1 - y0) * scale))
    sx = (X - x0) * scale; sy = (y1 - Y) * scale
    L = np.array(light, dtype=float); L /= np.linalg.norm(L)
    col = np.array([pal.get(int(s), (128, 128, 128)) for s in mesh['slot']], dtype=float) * mesh['shade'][:, None]
    # two-sided lighting: cloth is seen from inside as well
    lit = 0.38 + 0.62 * np.abs(n3 @ L)
    col = col * lit[:, None]
    img = np.tile(np.array(background, dtype=float), (h, w, 1))
    zbuf = np.full((h, w), -1e9)
    for a, b, c in mesh['idx']:
        xs = sx[[a, b, c]]; ys = sy[[a, b, c]]
        minx = max(int(np.floor(xs.min())), 0); maxx = min(int(np.ceil(xs.max())), w - 1)
        miny = max(int(np.floor(ys.min())), 0); maxy = min(int(np.ceil(ys.max())), h - 1)
        if minx > maxx or miny > maxy: continue
        den = (ys[1] - ys[2]) * (xs[0] - xs[2]) + (xs[2] - xs[1]) * (ys[0] - ys[2])
        if abs(den) < 1e-12: continue
        gx, gy = np.meshgrid(np.arange(minx, maxx + 1) + 0.5, np.arange(miny, maxy + 1) + 0.5)
        w0 = ((ys[1] - ys[2]) * (gx - xs[2]) + (xs[2] - xs[1]) * (gy - ys[2])) / den
        w1 = ((ys[2] - ys[0]) * (gx - xs[2]) + (xs[0] - xs[2]) * (gy - ys[2])) / den
        w2 = 1 - w0 - w1
        inside = (w0 >= -1e-6) & (w1 >= -1e-6) & (w2 >= -1e-6)
        if not inside.any(): continue
        z = w0 * Z[a] + w1 * Z[b] + w2 * Z[c]
        sub = zbuf[miny:maxy + 1, minx:maxx + 1]
        win = inside & (z > sub)
        if not win.any(): continue
        sub[win] = z[win]
        c3 = w0[..., None] * col[a] + w1[..., None] * col[b] + w2[..., None] * col[c]
        if wire:
            edge = np.minimum(np.minimum(w0, w1), w2) < 0.04
            c3 = np.where(edge[..., None], c3 * 0.55, c3)
        img[miny:maxy + 1, minx:maxx + 1][win] = c3[win]
    return Image.fromarray(np.clip(img, 0, 255).astype(np.uint8))


def sheet(images, cols=None, pad=6, background=(40, 42, 54)):
    cols = cols or len(images)
    rows = (len(images) + cols - 1) // cols
    w = max(i.width for i in images); h = max(i.height for i in images)
    out = Image.new('RGB', (cols * (w + pad) + pad, rows * (h + pad) + pad), background)
    for k, im in enumerate(images):
        out.paste(im, (pad + (k % cols) * (w + pad), pad + (k // cols) * (h + pad)))
    return out
