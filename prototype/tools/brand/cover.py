#!/usr/bin/env python3
"""The game's cover, taken apart so that it fits any screen.

The cover is one supplied illustration (assets/brand/cover/cover-master.jpg): the name and the rising sun at the
left, a painted PLAY button under them, two figures on a quay, four lines of words at the top right. On a wide
screen that is the whole picture. On a tall one it cannot be: the name and the figures do not fit side by side.

So the picture is separated into the things in it, and the page puts them back where the screen has room:

  plate    the picture with the name, the words and the painted button taken out (sky and water filled in)
  logo     the sun and the name, cut out
  words    the four lines, cut out
  play     the painted button itself, cut out: the page makes it a real button

Nothing is redrawn: every pixel of the name, the words and the button is the supplied one, and on a 16:9 screen
the page puts them back exactly where they were.

Writes assets/brand/cover/{plate.jpg,logo.png,words.png,play.png} and cover.json (where each thing was).
Run:  python3 tools/brand/cover.py
"""
import json, os
import numpy as np
import cv2
from scipy import ndimage as ndi

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DIR = os.path.join(ROOT, 'assets', 'brand', 'cover')

def main():
    bgr = cv2.imread(os.path.join(DIR, 'cover-master.jpg'), cv2.IMREAD_COLOR)
    H, W = bgr.shape[:2]
    f = bgr.astype(np.int32)
    drawn = (f[..., 1] - f[..., 2]) < 8          # green minus red (the array is blue, green, red)

    def pieces(box, keep):
        x0, y0, x1, y1 = box
        lab, n = ndi.label(drawn[y0:y1, x0:x1])
        mask = np.zeros((H, W), bool)
        for i, sl in enumerate(ndi.find_objects(lab), 1):
            ys, xs = sl
            if keep(xs.start + x0, ys.start + y0, xs.stop + x0, ys.stop + y0):
                mask[y0:y1, x0:x1][sl] |= (lab[sl] == i)
        return mask

    # the sun and the name: everything drawn in their corner that is not the cranes or the yacht behind them
    logo = pieces((150, 0, 1000, 950), lambda a, b, c, d: a >= 228 and d <= 832 and c <= 880 and (c - a) * (d - b) > 30)
    words = pieces((2100, 30, W, 420), lambda a, b, c, d: (c - a) * (d - b) > 12)
    # the painted button, with its border and the shadow under it
    bx0, by0, bx1, by1 = 238, 1116, 856, 1266

    # ---- the plate ----
    grow = lambda m, r: ndi.binary_dilation(m, structure=np.ones((3, 3), bool), iterations=r)
    hole = grow(logo, 6) | grow(words, 6)
    plate = cv2.inpaint(bgr, hole.astype(np.uint8) * 255, 7, cv2.INPAINT_TELEA)
    # the water behind the button: the water at the left of it, the same rows, laid across mirror on mirror (its
    # long flat waves stay level), eased towards the darker water at the right, and softened where it joins
    hx0, hy0, hx1, hy1 = bx0 - 12, by0 - 12, bx1 + 12, by1 + 13
    plate = plate.astype(np.float32)
    left = plate[hy0:hy1, 6:hx0]
    tiles, flip, wide = [], True, hx1 - hx0
    while sum(t.shape[1] for t in tiles) < wide:
        tiles.append(left[:, ::-1] if flip else left); flip = not flip
    fill = np.hstack(tiles)[:, :wide]
    right = plate[hy0:hy1, hx1:hx1 + 10].mean(1)
    off = right - fill[:, -10:].mean(1)
    off[right[:, 2] > right[:, 0]] = 0                       # (a row that ends on the quay, not on water)
    off = cv2.blur(off.reshape(-1, 1, 3), (1, 9)).reshape(-1, 3)
    fill = fill + off[:, None, :] * (np.linspace(0, 1, wide) ** 2)[None, :, None]
    quay = plate[hy0:hy1, hx0:hx1].copy()
    isquay = (quay[..., 2] > quay[..., 0] + 12) & (quay[..., 2] > 170)      # the corner of the quay under the button stays
    isquay[:by1 + 5 - hy0] = False
    fill[isquay] = quay[isquay]
    plate[hy0:hy1, hx0:hx1] = np.clip(fill, 0, 255)
    k = np.zeros((H, W), np.float32)
    k[hy0 - 3:hy0 + 3, hx0:hx1] = 1; k[hy1 - 3:hy1 + 3, hx0:hx1] = 1; k[hy0:hy1, hx1 - 5:hx1 + 5] = 1
    k = cv2.GaussianBlur(k, (0, 0), 5)[..., None]
    plate = np.clip(plate * (1 - k) + cv2.GaussianBlur(plate, (0, 0), 4) * k, 0, 255).astype(np.uint8)

    # ---- the cut-outs ----
    def cut(mask, name, pad=6):
        ys, xs = np.where(mask)
        x0, x1, y0, y1 = xs.min() - pad, xs.max() + 1 + pad, ys.min() - pad, ys.max() + 1 + pad
        m = mask[y0:y1, x0:x1]
        src = bgr[y0:y1, x0:x1].astype(np.float32)
        back = plate[y0:y1, x0:x1].astype(np.float32)
        inner = ndi.binary_erosion(m, iterations=2)
        outer = ndi.binary_dilation(m, iterations=2)
        # the colour of the thing itself at its edge: that of the nearest pixel safely inside it
        idx = ndi.distance_transform_edt(~inner, return_distances=False, return_indices=True)
        own = src[idx[0], idx[1]]
        diff, span = src - back, own - back
        alpha = np.clip((diff * span).sum(2) / np.maximum((span * span).sum(2), 1), 0, 1)
        alpha[inner] = 1; alpha[~outer] = 0
        colour = np.where(inner[..., None], src, own)
        out = np.dstack([colour, alpha * 255]).astype(np.uint8)
        cv2.imwrite(os.path.join(DIR, name), out, [cv2.IMWRITE_PNG_COMPRESSION, 9])
        return [int(x0), int(y0), int(x1 - x0), int(y1 - y0)]

    where = {'size': [W, H], 'logo': cut(logo, 'logo.png'), 'words': cut(words, 'words.png')}

    # the button: a rounded rectangle, cut on its own outline (the gold border), corners clear
    pad = 6
    x0, y0, x1, y1 = bx0 - pad, by0 - pad, bx1 + pad, by1 + pad
    g = bgr[y0:y1, x0:x1].astype(np.int32)
    # inside the border: the dark face or the gold line. Outside: water, which is bluer than it is red.
    body = (g[..., 0] - g[..., 2]) < 18
    lab, n = ndi.label(body)
    big = 1 + int(np.argmax(ndi.sum(body, lab, range(1, n + 1))))
    body = ndi.binary_opening(ndi.binary_fill_holes(lab == big), iterations=2)
    ys, xs = np.where(body)
    cx0, cy0, cx1, cy1 = x0 + xs.min() - 2, y0 + ys.min() - 2, x0 + xs.max() + 3, y0 + ys.max() + 3
    alpha = cv2.GaussianBlur(body.astype(np.float32), (0, 0), 0.9)[cy0 - y0:cy1 - y0, cx0 - x0:cx1 - x0]
    cv2.imwrite(os.path.join(DIR, 'play.png'), np.dstack([bgr[cy0:cy1, cx0:cx1], np.clip(alpha * 255, 0, 255)]).astype(np.uint8), [cv2.IMWRITE_PNG_COMPRESSION, 9])
    where['play'] = [int(cx0), int(cy0), int(cx1 - cx0), int(cy1 - cy0)]
    # where the two figures stand, so that a narrow screen keeps them in view
    where['figures'] = [1300, 30, 790, 1400]
    where['sky'] = [int(v) for v in plate[2, W // 2][::-1]]

    cv2.imwrite(os.path.join(DIR, 'plate.jpg'), plate, [cv2.IMWRITE_JPEG_QUALITY, 92])
    with open(os.path.join(DIR, 'cover.json'), 'w') as fh: json.dump(where, fh, indent=1)
    print(json.dumps(where))

    # a check for the eye: the pieces put back where they were, beside the original
    back = plate.astype(np.float32)
    for name in ('logo', 'words'):
        x, y, w, h = where[name]
        piece = cv2.imread(os.path.join(DIR, name + '.png'), cv2.IMREAD_UNCHANGED).astype(np.float32)
        al = piece[..., 3:] / 255
        back[y:y + h, x:x + w] = piece[..., :3] * al + back[y:y + h, x:x + w] * (1 - al)
    x, y, w, h = where['play']
    piece = cv2.imread(os.path.join(DIR, 'play.png'), cv2.IMREAD_UNCHANGED).astype(np.float32)
    al = piece[..., 3:] / 255
    back[y:y + h, x:x + w] = piece[..., :3] * al + back[y:y + h, x:x + w] * (1 - al)
    err = np.abs(back - bgr.astype(np.float32)).mean()
    print('put back together, mean difference from the original (0..255):', round(float(err), 3))
    if os.environ.get('COVER_CHECK'):
        cv2.imwrite(os.environ['COVER_CHECK'], np.clip(back, 0, 255).astype(np.uint8))

if __name__ == '__main__':
    main()
