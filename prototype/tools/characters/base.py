"""Takes the supplied base character apart into named parts.

The GLB groups its geometry by material, not by garment, so each mesh is
split into the pieces that hang together and each piece is recognised by
where it sits. Nothing is moved or reshaped here.
"""
import io
import numpy as np
from PIL import Image
import meshkit as mk
from kit import SLOTS

A, B, C, D = SLOTS['a'], SLOTS['b'], SLOTS['c'], SLOTS['d']


def _load(g, i, slot):
    m = g.mesh(i)
    out = mk.make(m['pos'], m['idx'], J=m['joints'], W=m['weights'], slot=slot, uv=m['uv'], nrm=m['nrm'])
    return mk.clean_weights(out)


def _pieces(m):
    """The connected pieces of a mesh, each with its box."""
    k, lab = mk.components(m)
    out = []
    for c in range(k):
        mask = lab == c
        piece = mk.take(m, mask)
        out.append((piece, piece['pos'].min(0), piece['pos'].max(0)))
    return out


def _where(pieces, test):
    hit = [p for p, lo, hi in pieces if test(lo, hi, len(p['idx']))]
    assert hit, 'a piece of the base character was not found where it was expected'
    return mk.merge(hit)


def _paint(m, slot):
    m = mk.copy(m); m['slot'][:] = slot
    return m


def base_parts(g):
    parts = {}

    # --- skin: the head with its neck and shoulders, and the two hands ---
    skin = _pieces(_load(g, 12, SLOTS['skin']))
    parts['head'] = _where(skin, lambda lo, hi, n: lo[1] > 1.3)
    parts['hands'] = _where(skin, lambda lo, hi, n: hi[1] < 1.3)
    parts['beard'] = _load(g, 10, SLOTS['hair'])

    # --- on the head ---
    black = _pieces(_load(g, 0, A))
    dome = _where(black, lambda lo, hi, n: n > 500 and hi[0] - lo[0] > 0.2)
    brim = _where(black, lambda lo, hi, n: n == 48)
    seam = _load(g, 1, B)
    parts['cap'] = mk.merge([dome, brim, seam])
    frame = _where(black, lambda lo, hi, n: n <= 32)
    parts['glasses'] = mk.merge([frame, _load(g, 11, B)])
    cups = _paint(_where(black, lambda lo, hi, n: n > 500 and hi[0] - lo[0] < 0.2), B)
    white = _pieces(_load(g, 4, A))
    shells = _where(white, lambda lo, hi, n: lo[1] > 1.5)
    parts['headphones'] = mk.merge([shells, cups])
    piping = _paint(_where(white, lambda lo, hi, n: hi[1] < 1.0), B)

    # --- the hoodie: cotton body, lime panel and ribbing, dark green beads ---
    panel = _load(g, 2, A)
    panel = _split_panel(g, panel)
    cotton = _load(g, 7, A)
    rib = _load(g, 5, B)
    motif = _load(g, 3, C)
    parts['hoodie'] = mk.merge([panel, cotton, rib, motif])

    # --- legs and feet ---
    parts['joggers'] = mk.merge([_load(g, 6, A), piping])
    parts['sneakers'] = mk.merge([_load(g, 9, A), _load(g, 8, B)])
    return parts


def _split_panel(g, panel):
    """The hoodie's two colours are a picture. Cut the cloth along the line between them, so it can be two colours of thread instead."""
    im = Image.open(io.BytesIO(g.image(1))).convert('RGB')
    px = np.asarray(im).astype(np.float64)
    lime = np.clip((px[:, :, 1] - px[:, :, 0]) / 90.0, 0, 1)          # 1 where the picture is green, 0 where it is pale
    h, w = lime.shape

    def sample(uv):
        x = np.clip(uv[..., 0] * w - 0.5, 0, w - 1.001); y = np.clip(uv[..., 1] * h - 0.5, 0, h - 1.001)
        x0 = np.floor(x).astype(int); y0 = np.floor(y).astype(int); fx = x - x0; fy = y - y0
        return (lime[y0, x0] * (1 - fx) + lime[y0, x0 + 1] * fx) * (1 - fy) + (lime[y0 + 1, x0] * (1 - fx) + lime[y0 + 1, x0 + 1] * fx) * fy

    value = sample(panel['uv'])

    def refine(a, b, t):
        lo, hi = 0.0, 1.0
        va = value[a] >= 0.5
        for _ in range(18):
            mid = (lo + hi) / 2
            v = sample((1 - mid) * panel['uv'][a] + mid * panel['uv'][b]) >= 0.5
            if v == va: lo = mid
            else: hi = mid
        return (lo + hi) / 2

    cut, high = mk.split_by(panel, value, 0.5, refine)
    return mk.split_slots(cut, high, B)
