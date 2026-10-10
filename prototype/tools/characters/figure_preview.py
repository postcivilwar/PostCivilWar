"""Pictures of a baked figure, for checking the fit by eye: the supplied pose with the fitted skeleton
drawn over it, the figure standing naturally painted by region, and which bone moves each part."""
import numpy as np
from PIL import Image, ImageDraw
from preview import render, sheet as tile

REGION_COLOUR = {'skin': (150, 104, 74), 'hair': (40, 34, 30), 'top': (60, 120, 170), 'bottom': (200, 170, 70), 'shoes': (170, 50, 50), 'hat': (90, 160, 90)}
BONE_COLOUR = [(200, 200, 200), (230, 80, 80), (230, 150, 60), (220, 210, 70), (120, 200, 90), (60, 170, 160), (70, 120, 220), (150, 90, 220), (40, 90, 40), (20, 90, 90), (20, 40, 120), (90, 20, 90), (240, 120, 200), (250, 250, 250), (90, 220, 220), (60, 140, 250), (40, 60, 160), (20, 20, 90), (250, 160, 120), (200, 90, 60), (130, 50, 30), (70, 20, 10)]
VIEW = {'front': (0, 1), 'right': (2, 1), 'back': (0, 1)}


def _mesh(m, vertex_slot, palette):
    """preview.render colours and lights by vertex."""
    P = m['pos']; T = m['idx']
    fn = np.cross(P[T[:, 1]] - P[T[:, 0]], P[T[:, 2]] - P[T[:, 0]])
    vn = np.zeros_like(P)
    for k in range(3): np.add.at(vn, T[:, k], fn)
    vn /= np.linalg.norm(vn, axis=1, keepdims=True) + 1e-12
    return {'pos': P, 'nrm': vn, 'idx': T, 'slot': vertex_slot, 'shade': np.ones(len(P))}, palette


def _project(p, view, box, size):
    x0, y0, x1, y1 = box; sc = size / max(x1 - x0, y1 - y0)
    if view == 'front': X, Y = p[0], p[1]
    elif view == 'right': X, Y = p[2], p[1]
    else: X, Y = -p[0], p[1]
    return ((X - x0) * sc, (y1 - Y) * sc)


def sheet(rig, r, path, size=520):
    ims = []
    asset = r['asset']; f = r['fit']
    h = max(asset['pos'][:, 1].max(), 1.0) + 0.05
    w = max(np.abs(asset['pos'][:, [0, 2]]).max() + 0.05, h / 2)
    box = (-w, -0.05, w, h)
    m, pal = _mesh(asset, np.zeros(len(asset['pos']), int), {0: (215, 212, 205)})
    names = rig.names
    for view in ('front', 'right'):
        im = render(m, view, box=box, size=size, palette=pal, background=(248, 248, 246))
        d = ImageDraw.Draw(im)
        for i, b in enumerate(rig.bones):
            if b['parent'] < 0: continue
            a = _project(f['F'][b['parent']][:3, 3], view, box, size); c = _project(f['F'][i][:3, 3], view, box, size)
            if names[b['parent']] != 'Root': d.line([a, c], fill=(220, 30, 30), width=2)
        for k, p in f['joints'].items():
            x, y = _project(p, view, box, size); d.ellipse([x - 3, y - 3, x + 3, y + 3], fill=(20, 60, 220))
        d.text((6, 6), f'supplied pose, {view}', fill=(0, 0, 0))
        ims.append(im)
    nat = r['nat']
    keys = sorted(REGION_COLOUR)
    # region per face of the painted mesh: re-derive from slot numbers of the merged mesh
    from kit import SLOTS
    inv = {SLOTS['skin']: 'skin', SLOTS['hair']: 'hair', SLOTS['a']: 'top', SLOTS['b']: 'bottom', SLOTS['c']: 'shoes', SLOTS['d']: 'hat'}
    slot = np.array([keys.index(inv[int(x)]) for x in nat['slot']])
    pal = {i: REGION_COLOUR[k] for i, k in enumerate(keys)}
    mm, _ = _mesh(nat, slot, pal)
    mm['shade'] = nat['shade']
    box2 = (-0.6, -0.05, 0.6, 2.05)
    for view in ('front', 'right', 'back'):
        im = render(mm, view, box=box2, size=size, palette=pal, background=(248, 248, 246))
        d = ImageDraw.Draw(im)
        for i, b in enumerate(rig.bones):
            if b['parent'] < 1: continue
            a = _project(f['N'][b['parent']][:3, 3], view, box2, size); c = _project(f['N'][i][:3, 3], view, box2, size)
            d.line([a, c], fill=(255, 255, 255), width=1)
        d.text((6, 6), f'standing, {view}', fill=(0, 0, 0))
        ims.append(im)
    hj = f['N'][rig.index['Head']][:3, 3]
    hb = (-0.2, hj[1] - 0.3, 0.2, hj[1] + 0.32)
    for view in ('front', 'right'):
        box3 = hb if view == 'front' else (hj[2] - 0.2, hb[1], hj[2] + 0.2, hb[3])
        im = render(mm, view, box=box3, size=size, palette=pal, background=(248, 248, 246))
        ImageDraw.Draw(im).text((6, 6), f'head, {view}', fill=(0, 0, 0)); ims.append(im)
    # which bone moves each part, in the supplied pose
    dom = asset['J'][:, 0]
    mb, _ = _mesh(asset, dom, {i: c for i, c in enumerate(BONE_COLOUR)})
    for view in ('front', 'right'):
        im = render(mb, view, box=box, size=size, palette={i: c for i, c in enumerate(BONE_COLOUR)}, background=(248, 248, 246))
        ImageDraw.Draw(im).text((6, 6), f'bones, {view}', fill=(0, 0, 0))
        ims.append(im)
    tile(ims, cols=4, background=(255, 255, 255)).save(path)
    # the standing views and the head on their own, for a quick look
    tile([ims[2], ims[3], ims[4], ims[5], ims[6]], cols=5, background=(255, 255, 255)).save(path.replace('.png', '_s.png'))
