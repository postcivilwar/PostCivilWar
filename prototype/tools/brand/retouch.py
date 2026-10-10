"""Takes the Biafran flag out of the two story slides that carry one.

The owner asked for the flag to be removed from the opening's pictures without
changing how many pictures there are. Two of the five supplied slides show it:
a flag on a stand on the desk in the first, and a patch on a soldier's sleeve
in the second. The supplied files in assets/brand/slides are left exactly as
they came. This writes retouched copies to assets/brand/slides/retouched,
and tools/brand/bake.py uses a retouched copy wherever there is one.

    python3 tools/brand/retouch.py

What it does, so that it can be checked or redone:
  slide 1  the flag, its staff and finial are masked and filled in from the
           uniform round them; the belt and the shoulder strap that the flag
           hid are then drawn back across the gap in their own colours, with
           the picture's own dark outline.
  slide 2  the patch is masked and filled in from the sleeve round it.
"""
import os

import cv2
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))
SRC = os.path.join(ROOT, 'assets', 'brand', 'slides')
OUT = os.path.join(SRC, 'retouched')
INK = (16, 18, 20)          # the linework's near-black, as BGR


def median_colour(img, box):
    x0, y0, x1, y1 = box
    return tuple(int(v) for v in np.median(img[y0:y1, x0:x1].reshape(-1, 3), axis=0))


def poly(mask, points, value=255):
    cv2.fillPoly(mask, [np.array(points, dtype=np.int32)], value)


def lay_flat(img, mask, colour, rim=7):
    """Lays one flat colour into the middle of a masked area, leaving a narrow rim where it meets what is round it.

    The pictures are drawn in flat colour with dark outlines. An area filled in from its edges alone comes
    out as a smear of whatever was nearest, which is exactly what a retouch looks like; flat colour does not.
    """
    core = cv2.erode(mask, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (rim, rim)))
    weight = cv2.GaussianBlur(core, (0, 0), rim / 3.0).astype(np.float32)[..., None] / 255.0
    flat = np.zeros_like(img)
    flat[:] = colour
    return (img * (1 - weight) + flat * weight).astype(np.uint8)


def grain(img, mask, seed=7):
    """The supplied pictures carry a little JPEG grain; a perfectly clean patch would show. This matches it."""
    rng = np.random.default_rng(seed)
    noise = rng.normal(0, 1.6, img.shape[:2]).astype(np.float32)
    noise = cv2.GaussianBlur(noise, (0, 0), 0.8)[..., None]
    weight = cv2.GaussianBlur(mask, (0, 0), 2).astype(np.float32)[..., None] / 255.0
    return np.clip(img.astype(np.float32) + noise * weight, 0, 255).astype(np.uint8)


def first_slide():
    img = cv2.imread(os.path.join(SRC, '01_the_war_ended_1080p.jpg'))
    flag = np.zeros(img.shape[:2], np.uint8)
    # the flag itself, its finial and the top of the staff, the staff along the hoist, and the stick below down to the desk
    poly(flag, [(1383, 708), (1494, 928), (1368, 1014), (1288, 858), (1352, 756)])
    poly(flag, [(1376, 690), (1412, 688), (1414, 716), (1390, 726), (1370, 712)])
    poly(flag, [(1352, 752), (1368, 760), (1304, 862), (1288, 852)])
    poly(flag, [(1338, 978), (1362, 990), (1352, 1080), (1322, 1080)])
    mask = cv2.dilate(flag, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (13, 13)))
    belt = median_colour(img, (1300, 786, 1330, 806))
    strap = median_colour(img, (1300, 660, 1322, 690))
    upper = median_colour(img, (1424, 736, 1450, 762))      # the shirt above the belt, in the light
    lower = median_colour(img, (1500, 900, 1540, 960))      # and below it
    shade = median_colour(img, (1238, 960, 1262, 1000))     # a fold in shadow
    out = cv2.inpaint(img, mask, 5, cv2.INPAINT_TELEA)
    above = mask.copy(); above[800:, :] = 0
    below = mask.copy(); below[:800, :] = 0
    out = lay_flat(out, above, upper)
    out = lay_flat(out, below, lower)
    # two folds of the shirt in shadow, as the folds beside them are drawn
    for points in ([(1300, 838), (1372, 842), (1422, 1006), (1396, 1014), (1344, 940)], [(1330, 990), (1368, 1000), (1360, 1080), (1318, 1080)]):
        fold = np.zeros(img.shape[:2], np.uint8)
        poly(fold, points)
        weight = cv2.GaussianBlur(fold, (0, 0), 1.0).astype(np.float32)[..., None] / 255.0
        dark = np.zeros_like(out)
        dark[:] = shade
        out = (out * (1 - weight) + dark * weight).astype(np.uint8)
    cv2.line(out, (1372, 842), (1422, 1006), INK, 4, cv2.LINE_AA)
    cv2.line(out, (1300, 838), (1344, 940), INK, 3, cv2.LINE_AA)
    cv2.line(out, (1448, 846), (1472, 966), INK, 3, cv2.LINE_AA)
    cv2.line(out, (1398, 726), (1432, 700), INK, 3, cv2.LINE_AA)
    # the shoulder strap, carried on down to the belt
    cv2.fillPoly(out, [np.array([(1334, 740), (1368, 736), (1400, 786), (1362, 790)], np.int32)], strap, cv2.LINE_AA)
    cv2.line(out, (1334, 740), (1362, 790), INK, 5, cv2.LINE_AA)
    cv2.line(out, (1368, 736), (1400, 786), INK, 5, cv2.LINE_AA)
    # the belt, across the gap
    cv2.fillPoly(out, [np.array([(1326, 776), (1444, 780), (1446, 827), (1326, 816)], np.int32)], belt, cv2.LINE_AA)
    cv2.line(out, (1322, 776), (1446, 780), INK, 5, cv2.LINE_AA)
    cv2.line(out, (1322, 816), (1448, 827), INK, 5, cv2.LINE_AA)
    return grain(out, mask)


def second_slide():
    img = cv2.imread(os.path.join(SRC, '02_home_had_changed_1080p.jpg'))
    mask = np.zeros(img.shape[:2], np.uint8)
    poly(mask, [(480, 596), (566, 592), (570, 674), (482, 678)])
    mask = cv2.dilate(mask, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
    sleeve = median_colour(img, (500, 690, 560, 710))
    out = cv2.inpaint(img, mask, 4, cv2.INPAINT_TELEA)
    out = lay_flat(out, mask, sleeve, rim=5)
    # the sleeve's own creases ran under the patch: two short strokes carry them through
    cv2.line(out, (556, 590), (572, 664), INK, 3, cv2.LINE_AA)
    cv2.line(out, (486, 668), (540, 684), INK, 3, cv2.LINE_AA)
    return grain(out, mask)


def main():
    os.makedirs(OUT, exist_ok=True)
    for name, make in (('01_the_war_ended_1080p.jpg', first_slide), ('02_home_had_changed_1080p.jpg', second_slide)):
        cv2.imwrite(os.path.join(OUT, name), make(), [cv2.IMWRITE_JPEG_QUALITY, 93])
        print('retouched', name)


if __name__ == '__main__':
    main()
