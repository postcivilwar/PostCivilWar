"""Finishes the base character's head so it can be seen without sunglasses.

The supplied head is one colour all over, and where the eyes and the inside
of the mouth should be it has empty pockets (the sunglasses and the beard hid
them). This takes the pockets out, sets eyes in the sockets, and marks the
lips and brows as their own colours. The shape of the face is not changed.
"""
import numpy as np
import meshkit as mk
from loft import circle, tube
from kit import SLOTS

SKIN, HAIR, LIPS, WHITE, DARK, BROW, IRIS = SLOTS['skin'], SLOTS['hair'], SLOTS['lips'], SLOTS['eyewhite'], SLOTS['dark'], SLOTS['brow'], SLOTS['iris']

NECK_CUT = 1.503            # below this the supplied skin is the shoulders, which clothes replace
EYE = np.array([0.0345, 1.6530, 0.1332])
EYE_R = 0.0125
MOUTH_Y = 1.5818


def split_neck(head):
    """The head and neck, and separately the yoke of shoulder skin under it."""
    cut, high = mk.split_by(head, head['pos'][:, 1], NECK_CUT)
    return mk.take(cut, high), mk.take(cut, ~high)


def _in_eye_pocket(P):
    return (np.abs(np.abs(P[:, 0]) - 0.0345) < 0.0165) & (P[:, 1] > 1.6425) & (P[:, 1] < 1.6625) & (P[:, 2] < 0.1415) & (P[:, 2] > 0.09)


def _in_mouth_pocket(P):
    return (np.abs(P[:, 0]) < 0.031) & (P[:, 1] > 1.562) & (P[:, 1] < 1.602) & (P[:, 2] < 0.139) & (P[:, 2] > 0.02)


def remove_pockets(head):
    P = head['pos']
    inside = _in_eye_pocket(P) | _in_mouth_pocket(P)
    keep = ~inside[head['idx']].all(axis=1)
    return mk.take(head, keep)


def eyes(head_bone, nb, K=12):
    """Two eyes: a white, an iris and a pupil, looking straight ahead."""
    w = np.zeros(nb); w[head_bone] = 1
    out = []
    for sign in (1, -1):
        c = EYE * [sign, 1, 1]
        ax = np.array([0.0, 0.0, 1.0])

        def ring(phi):
            return circle(c + ax * EYE_R * np.cos(phi), ax, max(EYE_R * np.sin(phi), 1e-5), K=K, front=(0, 1, 0))
        zones = [((0.0, 0.2), DARK), ((0.2, 0.47), IRIS), ((0.47, 0.8, 1.15, 1.5), WHITE)]
        for phis, slot in zones:
            rings = [ring(p) for p in phis]
            out.append(tube(rings, [w] * len(rings), slot=slot, nbones=nb))
        # the dark behind the eye, so the corners of the socket read as lashes and not as a hole
        back = [circle(c + [0, 0, -0.004], ax, 0.0185, K=K, front=(0, 1, 0), flat=0.62), circle(c + [0, 0, -0.0045], ax, 1e-5, K=K, front=(0, 1, 0))]
        out.append(tube(back, [w, w], slot=DARK, nbones=nb))
    return mk.merge(out)


def mouth_backing(head_bone, nb):
    """A dark strip behind the line of the lips."""
    w = np.zeros(nb); w[head_bone] = 1
    xs = np.linspace(-0.029, 0.029, 7)
    z = 0.139 + 0.019 * (1 - (xs / 0.031) ** 2)
    top = np.c_[xs, np.full(7, MOUTH_Y + 0.004), z]; bottom = np.c_[xs, np.full(7, MOUTH_Y - 0.004), z]
    idx = []
    for k in range(6): idx += [[k, k + 1, 7 + k + 1], [k, 7 + k + 1, 7 + k]]
    m = mk.make(np.r_[top, bottom], np.array(idx), slot=DARK)
    mk.set_weights(m, np.tile(w, (14, 1)), nb)
    return m


def lip_field(P):
    x = np.abs(P[:, 0]); y = P[:, 1]
    hu = 0.0108 * np.clip(1 - (x / 0.0275) ** 2, 0, 1) ** 0.6 - 0.0018 * np.exp(-(x / 0.0045) ** 2)
    hl = 0.0118 * np.clip(1 - (x / 0.0255) ** 2, 0, 1) ** 0.7
    f = np.minimum(y - (MOUTH_Y - hl), (MOUTH_Y + hu) - y)
    f = np.where((P[:, 2] > 0.139) & (x < 0.0275), f, -0.01)
    return f


def brow_field(P):
    x = np.abs(P[:, 0]); y = P[:, 1]
    t = np.clip((x - 0.0105) / 0.046, 0, 1)
    centre = 1.6660 + 0.0042 * np.sin(np.pi * t ** 0.8) - 0.0028 * t
    half = 0.0040 * np.sin(np.pi * np.clip(t, 0.0, 1.0) ** 0.55) ** 0.5 * (1 - 0.5 * t)
    f = half - np.abs(y - centre)
    return np.where((P[:, 2] > 0.105) & (x > 0.0105) & (x < 0.0565), f, -0.01)


def paint_face(head, detail=0.004):
    from tailor import paint
    head = paint(head, lip_field, LIPS, detail=detail * 1.5)
    head = paint(head, brow_field, BROW, detail=detail)
    return head


def finish_head(head, nb, head_bone, target=None):
    """Head and neck, ready to wear: pockets out, thinned to `target` triangles if asked, painted, eyes in."""
    head = remove_pockets(head)
    if target and len(head['idx']) > target: head = mk.decimate(head, target, slot_seams=False)
    bare = mk.copy(head)
    head = paint_face(head, 0.004 if not target else 0.006 if target > 1200 else 0.011)
    return mk.merge([head, eyes(head_bone, nb, K=12 if not target or target > 1200 else 8), mouth_backing(head_bone, nb)]), bare
