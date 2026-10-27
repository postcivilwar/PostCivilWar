"""A skeleton for an NPC model that came without one (the owner, 26 October 2026: "add skeleton to the ... models that
doesn't have skeleton"): a rigged copy, his file unchanged.

    python3 -I tools/npcs/rig.py <his model.glb> <a rigged model.glb> <out.glb> [--report out.json]

The skeleton is the rigged model's own (his police officer's for a woman, his security guard's for a man: Tripo's
65-bone Mixamo skeleton, the one every rigged figure of his has), each bone kept turned exactly as it is there and moved
to where that joint is in this body: so every move made for that skeleton plays on this one as it does on his own
rigged figures. Where each joint is, is read off the body itself (both are made a unit tall, standing with their arms
out along z, facing +x): the crotch, the arms' line and their ends, each leg's and arm's middle at the joint's height or
reach; the spine and head kept in proportion between them.

How much each bone moves each point of the body (its skin weights) is taken from the rigged model's own: its body is
first drawn into this one's proportions by its own skeleton (each bone's part moved and stretched to its new joints),
then each point here takes the weights of the nearest points there that face the same way, and they are smoothed a
little over the surface. Four bones a point at most, as glTF and the game want.

What is written: his mesh, its picture(s) and material byte for byte, its points in the skeleton's frame (his node's
own place applied: a rigged mesh is drawn in its skeleton's frame), and JOINTS_0 / WEIGHTS_0; the skeleton's nodes and
inverse bind matrices. No moves: the game plays its own on every figure with this skeleton.
"""
import json
import struct
import sys

import numpy as np
from scipy.spatial import cKDTree

COMP = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
NUM = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


def read_glb(path):
    b = open(path, 'rb').read()
    assert b[:4] == b'glTF'
    at, js, binc = 12, None, b''
    while at < len(b):
        ln, ty = struct.unpack_from('<II', b, at)
        if ty == 0x4E4F534A:
            js = json.loads(b[at + 8:at + 8 + ln])
        elif ty == 0x004E4942:
            binc = b[at + 8:at + 8 + ln]
        at += 8 + ln
    return js, binc


def accessor(js, binc, i):
    a = js['accessors'][i]
    v = js['bufferViews'][a['bufferView']]
    dt = np.dtype(COMP[a['componentType']]).newbyteorder('<')
    n = NUM[a['type']]
    stride = v.get('byteStride') or dt.itemsize * n
    off = v.get('byteOffset', 0) + a.get('byteOffset', 0)
    raw = np.frombuffer(binc, dtype=np.uint8, count=stride * (a['count'] - 1) + dt.itemsize * n, offset=off)
    out = np.lib.stride_tricks.as_strided(raw, shape=(a['count'], dt.itemsize * n), strides=(stride, 1)).copy().view(dt).reshape(a['count'], n)
    if a.get('normalized'):
        out = out.astype(np.float64) / np.iinfo(dt).max
    return out


def quat_mat(q):
    x, y, z, w = q
    return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                     [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                     [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])


def local(n):
    if 'matrix' in n:
        return np.array(n['matrix'], dtype=np.float64).reshape(4, 4).T
    M = np.eye(4)
    M[:3, :3] = quat_mat(n.get('rotation', [0, 0, 0, 1])) * np.array(n.get('scale', [1, 1, 1]))
    M[:3, 3] = n.get('translation', [0, 0, 0])
    return M


def worlds(js):
    nodes = js['nodes']
    parent = {}
    for i, n in enumerate(nodes):
        for c in n.get('children', []):
            parent[c] = i
    W = [None] * len(nodes)

    def w(i):
        if W[i] is None:
            W[i] = (w(parent[i]) if i in parent else np.eye(4)) @ local(nodes[i])
        return W[i]
    for i in range(len(nodes)):
        w(i)
    return W, parent


def the_mesh(js, binc):
    k = next(i for i, n in enumerate(js['nodes']) if 'mesh' in n)
    p = js['meshes'][js['nodes'][k]['mesh']]['primitives'][0]
    out = {'node': k, 'prim': p, 'pos': accessor(js, binc, p['attributes']['POSITION']).astype(np.float64),
           'idx': accessor(js, binc, p['indices']).reshape(-1, 3).astype(np.int64)}
    out['nrm'] = accessor(js, binc, p['attributes']['NORMAL']).astype(np.float64) if 'NORMAL' in p['attributes'] else None
    return out


def vertex_normals(pos, idx):
    n = np.zeros_like(pos)
    f = np.cross(pos[idx[:, 1]] - pos[idx[:, 0]], pos[idx[:, 2]] - pos[idx[:, 0]])
    for c in range(3):
        np.add.at(n, idx[:, c], f)
    return n / np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-12)


def samples(pos, idx, per=3):
    """the surface as points: every vertex and points inside every triangle (a mesh's vertices crowd where it is
    detailed)"""
    a, b, c = pos[idx[:, 0]], pos[idx[:, 1]], pos[idx[:, 2]]
    rng = np.random.default_rng(7)
    out = [pos]
    for _ in range(per):
        u, v = rng.random(len(idx)), rng.random(len(idx))
        f = u + v > 1
        u[f], v[f] = 1 - u[f], 1 - v[f]
        out.append(a + (b - a) * u[:, None] + (c - a) * v[:, None])
    return np.concatenate(out)


class Body:
    """what is read off a body standing a unit tall, arms out along z, facing +x"""

    def __init__(self, pts):
        self.p = pts
        self.y0 = pts[:, 1].min()
        self.H = pts[:, 1].max() - self.y0
        y = (pts[:, 1] - self.y0) / self.H
        self.y = y
        # the crotch: the lowest height above which nothing is between the legs (|z| small), within reason
        mid = np.abs(pts[:, 2]) < 0.012
        gap = None
        for h in np.arange(0.30, 0.56, 0.005):
            band = (y > h) & (y < h + 0.01)
            if band.sum() < 20:
                continue
            if (band & mid).sum() > 3:
                gap = h
                break
        self.crotch = float(np.clip(gap if gap is not None else 0.47, 0.40, 0.54))
        # the arms' line: points beyond the torso and above the chest, out along z
        arms = y > 0.62
        self.tip = {}
        self.arm_at = {}
        for side in (1, -1):
            s = arms & (pts[:, 2] * side > 0)
            zz = pts[s, 2] * side
            self.tip[side] = float(np.percentile(zz, 99.8))
            self.arm_at[side] = (pts[s], zz)
        # the shoulders' height: where the arms' line is, a third of the way out
        band = arms & (np.abs(pts[:, 2]) > 0.22) & (np.abs(pts[:, 2]) < 0.30)
        self.arm_y = float(np.median(y[band])) if band.sum() > 20 else 0.80
        # the torso's half width at the chest, below the armpits: out from the middle until there is a gap (the arm,
        # if it hangs there, is beyond it)
        chest = (y > self.arm_y - 0.15) & (y < self.arm_y - 0.11)
        az = np.abs(pts[chest, 2])
        edge = 0.0
        for z in np.arange(0.0, 0.3, 0.004):
            if ((az >= z) & (az < z + 0.004)).sum() == 0:
                break
            edge = z + 0.004
        self.half = float(edge) if edge > 0.04 else 0.10

    def Y(self, h):
        return self.y0 + h * self.H

    def leg_middle(self, h, side, wid=0.012):
        s = (np.abs(self.y - h) < wid) & (self.p[:, 2] * side > 0)
        if s.sum() < 8:
            return None
        q = self.p[s]
        return np.array([(q[:, 0].min() + q[:, 0].max()) / 2, (q[:, 2].min() + q[:, 2].max()) / 2])

    def arm_middle(self, reach, side, wid=0.012):
        q, zz = self.arm_at[side]
        s = np.abs(zz - reach) < wid
        if s.sum() < 8:
            return None
        q = q[s]
        return np.array([(q[:, 0].min() + q[:, 0].max()) / 2, (q[:, 1].min() + q[:, 1].max()) / 2])

    def torso_middle(self, h, wid=0.012):
        s = (np.abs(self.y - h) < wid) & (np.abs(self.p[:, 2]) < self.half * 0.6)
        if s.sum() < 8:
            return None
        q = self.p[s]
        return np.array([(q[:, 0].min() + q[:, 0].max()) / 2, 0.0])


LEG = ['UpLeg', 'Leg', 'Foot', 'ToeBase', 'Toe_End']
ARM = ['Shoulder', 'Arm', 'ForeArm', 'Hand']
SPINE = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'HeadTop_End']


def short(name):
    return name.split(':')[-1]


def fit_joints(ref_P, names, R, T):
    """each joint of the reference's skeleton (where it is in the reference's body R) put where it falls in this body T"""
    out = {}
    hR = lambda p: (p[1] - R.y0) / R.H
    # (the side of a Left/Right joint: by where it is in the reference)
    for j, nm in enumerate(names):
        s = short(nm)
        p = ref_P[j]
        side = 1 if p[2] > 0 else -1
        h = hR(p)
        if s == 'Hips' or s in SPINE:
            # heights: in proportion below the crotch, between the crotch and the arms' line, above it to the top
            if h <= R.crotch:
                ht = h * T.crotch / R.crotch
            elif h <= R.arm_y:
                ht = T.crotch + (h - R.crotch) * (T.arm_y - T.crotch) / (R.arm_y - R.crotch)
            else:
                ht = T.arm_y + (h - R.arm_y) * (1 - T.arm_y) / (1 - R.arm_y)
            mt, mr = T.torso_middle(min(ht, T.arm_y - 0.02)), R.torso_middle(min(h, R.arm_y - 0.02))
            x = (mt[0] + (p[0] - mr[0])) if (mt is not None and mr is not None) else p[0]
            out[j] = np.array([x, T.Y(ht), p[2] * (T.half / R.half)])
        elif any(s == side_name + leg for leg in LEG for side_name in ('Left', 'Right')):
            ht = h * T.crotch / R.crotch if h <= R.crotch else T.crotch + (h - R.crotch)
            leg = s[4:] if s.startswith('Left') else s[5:]
            if leg in ('UpLeg', 'Leg'):
                mt, mr = T.leg_middle(ht, side), R.leg_middle(h, side)
                if leg == 'UpLeg':
                    # (the hip joint: its sideways place in proportion to the body's width at the hips)
                    mt2, mr2 = T.leg_middle(max(ht - 0.06, 0.05), side), R.leg_middle(max(h - 0.06, 0.05), side)
                    mt, mr = mt2, mr2
                if mt is not None and mr is not None:
                    out[j] = np.array([mt[0] + (p[0] - mr[0]), T.Y(ht), mt[1] + (p[2] - mr[1])])
                else:
                    out[j] = np.array([p[0], T.Y(ht), p[2]])
            else:
                out[j] = None    # the foot: placed from the leg below
        elif any(s.startswith(side_name + a) for a in ARM for side_name in ('Left', 'Right')) or 'Hand' in s:
            reach = abs(p[2])
            # (reach out along the arm: in proportion between the torso's side and the arm's end)
            if reach <= R.half:
                rt = reach * T.half / R.half
            else:
                rt = T.half + (reach - R.half) * (T.tip[side] - T.half) / (R.tip[side] - R.half)
            ht_line = T.Y(T.arm_y) + (p[1] - R.Y(R.arm_y)) * (T.H / R.H)
            mt, mr = T.arm_middle(rt, side), R.arm_middle(reach, side)
            if mt is not None and mr is not None and s.split('Hand')[0] in ('Left', 'Right') and 'Hand' in s and s.endswith('Hand'):
                out[j] = np.array([mt[0] + (p[0] - mr[0]), mt[1] + (p[1] - mr[1]), side * rt])
            elif mt is not None and mr is not None and ('Arm' in s or 'ForeArm' in s):
                out[j] = np.array([mt[0] + (p[0] - mr[0]), mt[1] + (p[1] - mr[1]), side * rt])
            else:
                out[j] = np.array([p[0], ht_line, side * rt])
        else:
            out[j] = np.array([p[0], T.Y(h), p[2]])
    return out


def main():
    src, rigged, dst = sys.argv[1], sys.argv[2], sys.argv[3]
    report_at = sys.argv[sys.argv.index('--report') + 1] if '--report' in sys.argv else None
    tj, tb = read_glb(src)
    rj, rb = read_glb(rigged)
    # this body, its node's own place applied (its mesh is drawn in the skeleton's frame once rigged)
    tm = the_mesh(tj, tb)
    TW, _ = worlds(tj)
    M = TW[tm['node']]
    tpos = tm['pos'] @ M[:3, :3].T + M[:3, 3]
    tnrm = vertex_normals(tpos, tm['idx'])
    # the reference: its body as bound, its skeleton as bound
    rm = the_mesh(rj, rb)
    rpos = rm['pos']
    rnrm = vertex_normals(rpos, rm['idx'])
    skin = rj['skins'][0]
    joints = skin['joints']
    names = [rj['nodes'][k]['name'] for k in joints]
    ibm = accessor(rj, rb, skin['inverseBindMatrices']).reshape(-1, 4, 4).transpose(0, 2, 1).astype(np.float64)
    bind = np.linalg.inv(ibm)                     # each joint's world as bound
    RJ = accessor(rj, rb, rm['prim']['attributes']['JOINTS_0']).astype(np.int64)
    RWt = accessor(rj, rb, rm['prim']['attributes']['WEIGHTS_0']).astype(np.float64)
    RWt /= np.maximum(RWt.sum(1, keepdims=True), 1e-12)
    R = Body(samples(rpos, rm['idx']))
    T = Body(samples(tpos, tm['idx']))
    refP = bind[:, :3, 3]
    fit = fit_joints(refP, names, R, T)
    idx_of = {short(n): j for j, n in enumerate(names)}
    # the feet: from the ankle (the Foot joint) down, kept as the reference's, the ankle at the leg's foot
    for side_name in ('Left', 'Right'):
        a = idx_of[side_name + 'Foot']
        side = 1 if refP[a][2] > 0 else -1
        h = (refP[a][1] - R.y0) / R.H
        mt, mr = T.leg_middle(h, side), R.leg_middle(h, side)
        base = np.array([mt[0] + (refP[a][0] - mr[0]), T.Y(h), mt[1] + (refP[a][2] - mr[1])]) if mt is not None and mr is not None else refP[a]
        fit[a] = base
        for tail in ('ToeBase', 'Toe_End'):
            k = idx_of[side_name + tail]
            fit[k] = base + (refP[k] - refP[a])
    # the fingers: as the reference's about the hand, the hand at its new place (its length in proportion to the arm's)
    for side_name in ('Left', 'Right'):
        hnd = idx_of[side_name + 'Hand']
        side = 1 if refP[hnd][2] > 0 else -1
        armk = (T.tip[side] - T.half) / (R.tip[side] - R.half)
        for j, nm in enumerate(names):
            s = short(nm)
            if s.startswith(side_name + 'Hand') and s != side_name + 'Hand':
                fit[j] = fit[hnd] + (refP[j] - refP[hnd]) * armk
    newP = np.array([fit[j] for j in range(len(names))])

    # the reference's body drawn into this one's proportions by its own skeleton: each joint's part moved with it (a
    # bone's points stretched along it to its new length), blended by the reference's own weights
    parent_of = {}
    for i, n in enumerate(rj['nodes']):
        for c in n.get('children', []):
            parent_of[c] = i
    jpos = {k: j for j, k in enumerate(joints)}
    child = {}
    for j, k in enumerate(joints):
        p = parent_of.get(k)
        if p in jpos:
            child.setdefault(jpos[p], []).append(j)

    def carry(j, pts):
        # a point of joint j's part: along the bone to its (first) child stretched to the new length, the rest moved
        base_r, base_t = refP[j], newP[j]
        kids = child.get(j)
        if kids:
            c = kids[0]
            d_r, d_t = refP[c] - base_r, newP[c] - base_t
            lr, lt = np.linalg.norm(d_r), np.linalg.norm(d_t)
            if lr > 1e-6 and lt > 1e-6:
                u = d_r / lr
                along = (pts - base_r) @ u
                across = (pts - base_r) - along[:, None] * u
                v = d_t / lt
                return base_t + along[:, None] * (lt / lr) * v + across
        return base_t + (pts - base_r)
    warped = np.zeros_like(rpos)
    for k in range(4):
        for j in np.unique(RJ[:, k]):
            s = RJ[:, k] == j
            warped[s] += RWt[s, k:k + 1] * carry(j, rpos[s])
    # (the arms and legs' girth: each point's distance from its bone's line scaled as the two bodies differ there
    # would be finer; the nearest surface facing the same way is enough at these proportions)
    tree = cKDTree(warped)
    dense = np.zeros((len(rpos), len(names)))
    for k in range(4):
        dense[np.arange(len(rpos)), RJ[:, k]] += RWt[:, k]
    K = 8
    d, nb = tree.query(tpos, k=K)
    agree = np.einsum('ij,ikj->ik', tnrm, rnrm[nb])
    w = np.where(agree > 0.1, 1.0, 0.05) / np.maximum(d, 1e-5)
    w /= w.sum(1, keepdims=True)
    W = np.einsum('ik,ikj->ij', w, dense[nb])
    # smoothed a little over the surface
    n = len(tpos)
    nbrs = [[] for _ in range(n)]
    for a, b, c in tm['idx']:
        nbrs[a] += [b, c]; nbrs[b] += [a, c]; nbrs[c] += [a, b]
    rows = np.repeat(np.arange(n), [len(x) for x in nbrs])
    cols = np.concatenate([np.array(x, dtype=np.int64) for x in nbrs])
    from scipy.sparse import csr_matrix
    A = csr_matrix((np.ones(len(rows)), (rows, cols)), shape=(n, n))
    deg = np.asarray(A.sum(1)).ravel()
    deg[deg == 0] = 1
    # Below the crotch, a point to one side of the middle goes with its own leg only: wide trousers stand far out from
    # the reference's slim legs, and their points took weights from the other leg too, tearing between the legs as
    # they parted (26 October, the first poses). Near the middle (a skirt's front and back) both, as taken.
    crotch_y = T.Y(T.crotch)
    hz = newP[idx_of['Hips']][2]
    below = tpos[:, 1] < crotch_y
    left_z = 1 if newP[idx_of['LeftUpLeg']][2] > hz else -1      # (which way a figure's left is in its frame)
    for side_name, side in (('Left', left_z), ('Right', -left_z)):
        other = 'Right' if side_name == 'Left' else 'Left'
        mine = below & ((tpos[:, 2] - hz) * side > 0.02)
        for n_ in ('UpLeg', 'Leg', 'Foot', 'ToeBase', 'Toe_End'):
            W[mine, idx_of[side_name + n_]] += W[mine, idx_of[other + n_]]
            W[mine, idx_of[other + n_]] = 0
    # what is above the ankle goes with the leg, never with the foot: a wide trouser's hem or a skirt's, taking its
    # weights from the shoe beside it, was dragged out with the toes as the foot turned
    def feet_to_legs(W):
        for side_name in ('Left', 'Right'):
            leg = idx_of[side_name + 'Leg']
            ankle_y = newP[idx_of[side_name + 'Foot']][1] + 0.012
            up = tpos[:, 1] > ankle_y
            for tail in ('Foot', 'ToeBase', 'Toe_End'):
                k = idx_of[side_name + tail]
                W[up, leg] += W[up, k]
                W[up, k] = 0
        return W
    W = feet_to_legs(W)
    for _ in range(3):
        W = 0.5 * W + 0.5 * (A @ W) / deg[:, None]
    W = feet_to_legs(W)
    # four bones a point at most
    top = np.argsort(-W, axis=1)[:, :4]
    tw = np.take_along_axis(W, top, 1)
    tw /= np.maximum(tw.sum(1, keepdims=True), 1e-12)

    # the skeleton's nodes: the reference's tree, each joint kept turned as it is there and moved to its new place
    nodes = json.loads(json.dumps(rj['nodes']))
    RW, rparent = worlds(rj)
    newW = {}
    order = []

    def visit(i):
        order.append(i)
        for c in rj['nodes'][i].get('children', []):
            visit(c)
    for r in rj['scenes'][rj.get('scene', 0)]['nodes']:
        visit(r)
    for i in order:
        L = local(rj['nodes'][i])
        P = newW[rparent[i]] if i in rparent else np.eye(4)
        if i in jpos:
            # (its world turned as the reference's, at its new place: the local translation that puts it there)
            Wr = RW[i].copy()
            Wr[:3, 3] = newP[jpos[i]]
            Ln = np.linalg.inv(P) @ Wr
            n_ = nodes[i]
            n_.pop('matrix', None)
            n_['translation'] = [float(v) for v in Ln[:3, 3]]
            newW[i] = P @ local(n_)
        else:
            newW[i] = P @ L
    new_ibm = np.array([np.linalg.inv(newW[k]) for k in joints])

    # the file: his mesh in the skeleton's frame, his material and pictures as they are, the skeleton
    out = {'asset': {'version': '2.0', 'generator': 'PostCivilWar tools/npcs/rig.py (his Tripo model, rigged)'}}
    blob = bytearray()
    views, accs = [], []

    def put(arr, ctype, typ, target=None, minmax=False, normalized=False):
        a = np.ascontiguousarray(arr)
        while len(blob) % 4:
            blob.append(0)
        off = len(blob)
        blob.extend(a.tobytes())
        v = {'buffer': 0, 'byteOffset': off, 'byteLength': a.nbytes}
        if target:
            v['target'] = target
        views.append(v)
        acc = {'bufferView': len(views) - 1, 'componentType': ctype, 'count': int(a.shape[0]), 'type': typ}
        if normalized:
            acc['normalized'] = True
        if minmax:
            acc['min'] = [float(x) for x in a.min(0)]
            acc['max'] = [float(x) for x in a.max(0)]
        accs.append(acc)
        return len(accs) - 1
    attrs = {'POSITION': put(tpos.astype('<f4'), 5126, 'VEC3', 34962, True)}
    tn = tm['nrm']
    attrs['NORMAL'] = put(((tn @ M[:3, :3].T) / np.maximum(np.linalg.norm(tn @ M[:3, :3].T, axis=1, keepdims=True), 1e-12)).astype('<f4') if tn is not None else tnrm.astype('<f4'), 5126, 'VEC3', 34962)
    for key in ('TEXCOORD_0', 'TEXCOORD_1', 'COLOR_0'):
        if key in tm['prim']['attributes']:
            a = tj['accessors'][tm['prim']['attributes'][key]]
            arr = accessor(tj, tb, tm['prim']['attributes'][key])
            attrs[key] = put(arr.astype(arr.dtype.newbyteorder('<')), a['componentType'], a['type'], 34962, normalized=bool(a.get('normalized')))
    attrs['JOINTS_0'] = put(top.astype('<u1' if len(names) < 256 else '<u2'), 5121 if len(names) < 256 else 5123, 'VEC4', 34962)
    attrs['WEIGHTS_0'] = put(tw.astype('<f4'), 5126, 'VEC4', 34962)
    indices = put(tm['idx'].reshape(-1).astype('<u4' if len(tpos) > 65535 else '<u2'), 5125 if len(tpos) > 65535 else 5123, 'SCALAR', 34963)
    ibm_acc = put(new_ibm.transpose(0, 2, 1).reshape(-1, 16).astype('<f4'), 5126, 'MAT4')
    # his pictures, byte for byte
    images = []
    for im in tj.get('images', []):
        v = tj['bufferViews'][im['bufferView']]
        data = tb[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']]
        while len(blob) % 4:
            blob.append(0)
        off = len(blob)
        blob.extend(data)
        views.append({'buffer': 0, 'byteOffset': off, 'byteLength': len(data)})
        images.append({'bufferView': len(views) - 1, 'mimeType': im.get('mimeType', 'image/png')})
    mesh_node = len(nodes)
    nodes.append({'name': tj['nodes'][tm['node']].get('name', 'body'), 'mesh': 0, 'skin': 0})
    # (the skeleton's roots and the body, in one scene)
    out['scene'] = 0
    out['scenes'] = [{'nodes': list(rj['scenes'][rj.get('scene', 0)]['nodes']) + [mesh_node]}]
    # (the reference's own mesh node, if in its tree, emptied: only his body is drawn)
    for i, n in enumerate(nodes[:-1]):
        n.pop('mesh', None)
        n.pop('skin', None)
    out['nodes'] = nodes
    prim = {'attributes': attrs, 'indices': indices, 'material': 0}
    out['meshes'] = [{'name': 'body', 'primitives': [prim]}]
    out['materials'] = [tj['materials'][tm['prim'].get('material', 0)]]
    out['textures'] = tj.get('textures', [])
    out['samplers'] = tj.get('samplers', [])
    out['images'] = images
    out['skins'] = [{'joints': joints, 'inverseBindMatrices': ibm_acc, 'skeleton': skin.get('skeleton', joints[0])}]
    if out['skins'][0]['skeleton'] is None:
        out['skins'][0].pop('skeleton')
    out['accessors'] = accs
    out['bufferViews'] = views
    while len(blob) % 4:
        blob.append(0)
    out['buffers'] = [{'byteLength': len(blob)}]
    jb = json.dumps(out, separators=(',', ':')).encode()
    jb += b' ' * ((4 - len(jb) % 4) % 4)
    total = 12 + 8 + len(jb) + 8 + len(blob)
    with open(dst, 'wb') as f:
        f.write(struct.pack('<III', 0x46546C67, 2, total))
        f.write(struct.pack('<II', len(jb), 0x4E4F534A)); f.write(jb)
        f.write(struct.pack('<II', len(blob), 0x004E4942)); f.write(bytes(blob))
    rep = {'from': src.split('/')[-1], 'skeleton': rigged.split('/')[-1], 'joints': len(names), 'points': int(len(tpos)),
           'crotch': [round(R.crotch, 3), round(T.crotch, 3)], 'arms': [round(R.arm_y, 3), round(T.arm_y, 3)],
           'reach': [[round(R.tip[1], 3), round(R.tip[-1], 3)], [round(T.tip[1], 3), round(T.tip[-1], 3)]],
           'chest': [round(R.half, 3), round(T.half, 3)], 'moved': {short(names[j]): [round(float(x), 3) for x in newP[j] - refP[j]] for j in (idx_of['Hips'], idx_of['Head'], idx_of['LeftHand'], idx_of['LeftFoot'])}}
    if report_at:
        json.dump(rep, open(report_at, 'w'), indent=1)
    print(json.dumps(rep))


if __name__ == '__main__':
    main()
