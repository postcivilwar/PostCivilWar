"""Bakes the owner's supplied figures (assets/characters/figures/supplied/*.glb) into playable characters.

    python3 tools/characters/figures.py [--only F1,M2] [--preview DIR]

The supplied files are shapes only: one grey material, no textures, no colours, no skeleton, each in
its own pose and scaled to a height of one. They are read and never written. For each figure this:

  1. takes out what the figure was holding (a bag, a rose, a phone, a cane), by the boxes in
     figure_fits.py, so that every hand is empty;
  2. fits the game's skeleton into the figure as it stands, from the joints in figure_fits.py;
  3. weights every vertex to the bones by distance over the surface, so a hand resting on a hip
     still belongs to the hand;
  4. moves the figure, bone by bone, into the skeleton's ordinary standing pose (a seated figure
     stands up), keeping its own proportions above the hips; the legs take the skeleton's lengths
     so that the walk's planted feet stay planted;
  5. marks each part of the surface with what colours it (skin, hair, top, bottom, shoes, hat) so
     that the player chooses those colours and nothing else changes;
  6. carries it back to the skeleton's bind pose and writes it, with lighter copies for distance,
     to src/client/figure-data.js in the same packed form as the character kit.

Nothing here invents a shape: every vertex written is one of the supplied figure's, moved.
"""
import os, sys, json, struct, time, argparse
import numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import dijkstra
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from glb import Glb, skeleton
from rig import Rig, rotation_between, unit, mat_to_quat
import meshkit as mk
from kit import Kit, SLOTS
from figure_fits import FITS, TARGET_HEIGHT

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
BASE = os.path.join(ROOT, 'assets/characters/base/streetwear_character_rigged.glb')
SUPPLIED = os.path.join(ROOT, 'assets/characters/figures/supplied')
OUT = os.path.join(ROOT, 'src/client/figure-data.js')

# what paints each region: the kit's colour slots
REGION_SLOT = {'skin': SLOTS['skin'], 'hair': SLOTS['hair'], 'top': SLOTS['a'], 'bottom': SLOTS['b'], 'shoes': SLOTS['c'], 'hat': SLOTS['d']}
# (how far off the bone a surface still belongs to it, in metres; how much of it goes to the hips beyond that)
# how far from its bone a surface may start that bone's spread (metres): a hand's own surface, not a coat beside it
REACH = {'Hand': 0.07, 'Forearm': 0.09}
NECK_REACH = 0.075
LOOSE_PIECE = 400          # triangles: a piece this small hangs from the body rather than being a part of it
LOOSE = {'Thigh': (0.13, 0.75), 'Shin': (0.11, 0.6)}
LEG_BONES = ('Root', 'Hips', 'Thigh_L', 'Shin_L', 'Foot_L', 'Toe_L', 'Thigh_R', 'Shin_R', 'Foot_R', 'Toe_R')


# ------------------------------------------------------------------ reading --

def load_shape(path):
    """The supplied figure as a welded triangle mesh: positions and triangles only."""
    g = Glb(path)
    p = g.json['meshes'][0]['primitives'][0]
    pos = g.accessor(p['attributes']['POSITION']).astype(np.float64)
    idx = g.accessor(p['indices']).astype(np.int64).reshape(-1, 3)
    ids = mk.position_ids(pos, 1e-6)
    first = np.full(ids.max() + 1, -1)
    for i in range(len(pos) - 1, -1, -1): first[ids[i]] = i
    keep = np.unique(first)
    remap = np.full(len(first), -1); remap[np.arange(len(first))] = np.searchsorted(keep, first)
    idx = remap[ids[idx]]
    idx = idx[(idx[:, 0] != idx[:, 1]) & (idx[:, 1] != idx[:, 2]) & (idx[:, 0] != idx[:, 2])]
    return mk.make(pos[keep], idx)


def inside(P, box):
    x0, x1, y0, y1, z0, z1 = box
    return (P[:, 0] >= x0) & (P[:, 0] <= x1) & (P[:, 1] >= y0) & (P[:, 1] <= y1) & (P[:, 2] >= z0) & (P[:, 2] <= z1)


def boundary_loops(idx):
    """The open edges of a mesh, chained into loops of vertex indices."""
    from collections import defaultdict
    count = defaultdict(int)
    for t in idx:
        for a, b in ((t[0], t[1]), (t[1], t[2]), (t[2], t[0])): count[(min(a, b), max(a, b))] += 1
    nxt = {}
    for t in idx:
        for a, b in ((t[0], t[1]), (t[1], t[2]), (t[2], t[0])):
            if count[(min(a, b), max(a, b))] == 1: nxt[b] = a          # walk the open edge backwards, so a fill faces outward
    loops = []; seen = set()
    for start in list(nxt):
        if start in seen: continue
        loop = []; v = start
        while v not in seen and v in nxt:
            seen.add(v); loop.append(v); v = nxt[v]
        if len(loop) >= 3 and v == start: loops.append(loop)
    return loops


def mend(m, box, most=400):
    """Closes the holes a cut left: each open loop lying within the cut's reach is filled from its middle.
    Only where something was taken out; the figure's own openings (sleeves, hems) are left open."""
    grow = np.array(box) + np.array([-0.02, 0.02] * 3)
    P = list(m['pos']); tris = list(m['idx'])
    for loop in boundary_loops(m['idx']):
        pts = m['pos'][loop]
        if len(loop) > most or not inside(pts, grow).all(): continue
        c = len(P); P.append(pts.mean(0))
        for a, b in zip(loop, loop[1:] + loop[:1]): tris.append([a, b, c])
    out = mk.make(np.array(P), np.array(tris))
    return out


def empty_hands(m, ops):
    """Takes out held things. Each op is a box (in the supplied file's units) and how to treat it:
    'pieces' removes every separate piece mostly inside it; 'cut' removes the triangles inside it."""
    if not ops: return m, 0
    tri = np.ones(len(m['idx']), bool)
    labels = mk.components(m)[1]
    cent = m['pos'][m['idx']].mean(1)
    for op in ops:
        box = op['box']
        if op.get('how', 'cut') == 'pieces':
            hit = inside(cent, box)
            for lab in np.unique(labels[hit]):
                mine = labels == lab
                if hit[mine].mean() >= op.get('share', 0.6): tri &= ~mine
        else:
            tri &= ~inside(cent, box)
    removed = int((~tri).sum())
    m = mk.take(m, tri)
    for op in ops:
        if op.get('how', 'cut') == 'cut' and op.get('mend', True): m = mend(m, op['box'])
    # anything left floating and small after a cut (a strap end, a stalk) goes too
    labels = mk.components(m)[1]
    sizes = np.bincount(labels)
    for op in ops:
        if op.get('how', 'cut') != 'cut': continue
        cent = m['pos'][m['idx']].mean(1)
        near = inside(cent, np.array(op['box']) + np.array([-0.03, 0.03] * 3))
        for lab in np.unique(labels[near]):
            if sizes[lab] < op.get('orphan', 60): near |= labels == lab
        tri = ~(np.isin(labels, [lab for lab in np.unique(labels[near]) if sizes[lab] < op.get('orphan', 60)]))
        if (~tri).any():
            removed += int((~tri).sum()); m = mk.take(m, tri); labels = mk.components(m)[1]; sizes = np.bincount(labels)
    return m, removed


# ------------------------------------------------------------------ fitting --

def bone_chain(rig):
    """Head joint and tail joint names, in figure_fits.py's vocabulary, for every bone."""
    c = {'Root': (None, None), 'Hips': ('pelvis', 'spine'), 'Spine': ('spine', 'chest'), 'Chest': ('chest', 'neck'),
         'Neck': ('neck', 'head'), 'Head': ('head', 'top')}
    for s in ('L', 'R'):
        c[f'Clavicle_{s}'] = ('neck', f'shoulder_{s}')
        c[f'UpperArm_{s}'] = (f'shoulder_{s}', f'elbow_{s}')
        c[f'Forearm_{s}'] = (f'elbow_{s}', f'wrist_{s}')
        c[f'Hand_{s}'] = (f'wrist_{s}', f'hand_{s}')
        c[f'Thigh_{s}'] = (f'hip_{s}', f'knee_{s}')
        c[f'Shin_{s}'] = (f'knee_{s}', f'ankle_{s}')
        c[f'Foot_{s}'] = (f'ankle_{s}', f'toe_{s}')
        c[f'Toe_{s}'] = (f'toe_{s}', None)
    return c


def frame(up, lateral):
    """An orthonormal frame with y along `up` and x as near to `lateral` as it can be."""
    y = unit(up)
    x = np.asarray(lateral, float) - y * (np.asarray(lateral, float) @ y)
    x = unit(x); z = np.cross(x, y)
    return np.c_[x, y, z]


def rot_about_y(deg):
    a = np.radians(deg); c, s = np.cos(a), np.sin(a)
    return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])


def fit(rig, fitdef):
    """The figure's skeleton twice: as it stands in the supplied file (F) and standing naturally (N).

    Both are world matrices per bone. Returns them with the scale that gives the legs the skeleton's length."""
    J = {k: np.asarray(v, float) for k, v in fitdef['joints'].items()}
    legs = [np.linalg.norm(J[f'knee_{s}'] - J[f'hip_{s}']) + np.linalg.norm(J[f'ankle_{s}'] - J[f'knee_{s}']) for s in ('L', 'R')]
    rig_leg = np.linalg.norm(rig.joint('Shin_L') - rig.joint('Thigh_L')) + np.linalg.norm(rig.joint('Foot_L') - rig.joint('Shin_L'))
    s = rig_leg / np.mean(legs)
    J = {k: v * s for k, v in J.items()}
    I = rig.index; chain = bone_chain(rig)
    Nr = rig.natural['world']
    n = rig.n
    F = np.zeros((n, 4, 4)); N = Nr.copy()

    # --- standing naturally: the legs as the skeleton has them; above the hips, the figure's own measures ---
    def L(a, b): return float(np.linalg.norm(J[b] - J[a]))
    hips = Nr[I['Hips']][:3, 3].copy()
    up = np.array([0, 1, 0.0])
    spine = hips + up * L('pelvis', 'spine')
    chest = spine + up * L('spine', 'chest')
    neck = chest + up * L('chest', 'neck')
    head = neck + up * L('neck', 'head')
    # the shoulders: how far out, up and forward of the neck they sit, measured across the figure's own chest
    chest_frame = frame(J['neck'] - J['chest'], J['shoulder_L'] - J['shoulder_R'])
    pos = {'Hips': hips, 'Spine': spine, 'Chest': chest, 'Neck': neck, 'Head': head}
    for side, sign in (('L', 1), ('R', -1)):
        off = chest_frame.T @ (J[f'shoulder_{side}'] - J['neck'])
        shoulder = neck + np.array([abs(off[0]) * sign, off[1], off[2]])
        du = Nr[I[f'UpperArm_{side}']][:3, 1]; df = Nr[I[f'Forearm_{side}']][:3, 1]
        elbow = shoulder + unit(Nr[I[f'Forearm_{side}']][:3, 3] - Nr[I[f'UpperArm_{side}']][:3, 3]) * L(f'shoulder_{side}', f'elbow_{side}')
        wrist = elbow + unit(Nr[I[f'Hand_{side}']][:3, 3] - Nr[I[f'Forearm_{side}']][:3, 3]) * L(f'elbow_{side}', f'wrist_{side}')
        pos[f'Clavicle_{side}'] = neck.copy(); pos[f'UpperArm_{side}'] = shoulder; pos[f'Forearm_{side}'] = elbow; pos[f'Hand_{side}'] = wrist
    for name, p in pos.items():
        N[I[name]] = Nr[I[name]].copy(); N[I[name]][:3, 3] = p

    # natural direction of each bone (head to tail) and its tail position, in N
    def tail_nat(name):
        kids = [i for i, b in enumerate(rig.bones) if b['parent'] == I[name]]
        h, t = chain[name]
        if name == 'Head': return N[I[name]][:3, 3] + up * L('head', 'top')
        if name == 'Toe_L' or name == 'Toe_R': return None
        if name.startswith('Clavicle'): return N[I['UpperArm_' + name[-1]]][:3, 3]
        if name == 'Chest': return N[I['Neck']][:3, 3]
        k = {'Hips': 'Spine', 'Spine': 'Chest', 'Neck': 'Head'}.get(name)
        if k: return N[I[k]][:3, 3]
        nxt = {'UpperArm': 'Forearm', 'Forearm': 'Hand', 'Thigh': 'Shin', 'Shin': 'Foot', 'Foot': 'Toe'}
        base, side = name.split('_')
        if base == 'Hand':
            return N[I[name]][:3, 3] + unit(N[I[name]][:3, 3] - N[I['Forearm_' + side]][:3, 3]) * L(f'wrist_{side}', f'hand_{side}')
        return N[I[f'{nxt[base]}_{side}']][:3, 3]

    # --- as it stands in the file: each bone's frame turned from the natural one ---
    Q = {}
    yaw_head = rot_about_y(fitdef.get('head_yaw', 0.0))
    for i, b in enumerate(rig.bones):
        name = b['name']; h, t = chain[name]
        R_nat = N[i][:3, :3]
        if name == 'Root':
            q = np.eye(3); head_pos = np.array([J['pelvis'][0], 0.0, J['pelvis'][2]])
        elif name in ('Hips', 'Spine', 'Chest', 'Neck', 'Head'):
            lateral = J['hip_L'] - J['hip_R'] if name == 'Hips' else J['shoulder_L'] - J['shoulder_R']
            # a turned head is turned back by the head; a collar round the neck stays with the body
            if name == 'Neck': lateral = rot_about_y(fitdef.get('neck_yaw', 0.0)) @ lateral
            if name == 'Head': lateral = yaw_head @ lateral
            B_asset = frame(J[t] - J[h], lateral)
            B_nat = frame(tail_nat(name) - N[i][:3, 3], [1, 0, 0])
            q = B_asset @ B_nat.T; head_pos = J[h]
        else:
            parent = b['parent']; qp = Q[rig.names[parent]]
            if name.startswith('Toe'):
                q = Q['Foot_' + name[-1]]; head_pos = J[h]
            else:
                d_nat = qp @ unit(tail_nat(name) - N[i][:3, 3])
                q = rotation_between(d_nat, J[t] - J[h]) @ qp; head_pos = J[h]
        Q[name] = q
        F[i] = np.eye(4); F[i][:3, :3] = q @ R_nat; F[i][:3, 3] = head_pos
    # an arm whose hand rests on the body (hands held together, a hand at the throat) keeps its pose, carried with the chest:
    # pulled straight it would tear the hand from what it touches
    C = I['Chest']
    for side in fitdef.get('keep_arms', ()):
        for b in ('UpperArm', 'Forearm', 'Hand'):
            i = I[f'{b}_{side}']
            N[i] = N[C] @ np.linalg.inv(F[C]) @ F[i]
            # bones carry no scale
            for k in range(3): N[i][:3, k] /= np.linalg.norm(N[i][:3, k])
    return {'F': F, 'N': N, 'scale': s, 'joints': J, 'Q': Q}


def segments(rig, J):
    """The line each bone runs along, in the figure as it stands, for weighting."""
    chain = bone_chain(rig); out = {}
    for name, (h, t) in chain.items():
        if h is None: continue
        if t is None:
            side = name[-1]; d = J[f'toe_{side}'] - J[f'ankle_{side}']
            out[name] = (J[h], J[h] + unit(d) * 0.05)
        else: out[name] = (J[h], J[t])
    return out


def seg_dist(P, a, b):
    ab = b - a; t = np.clip(((P - a) @ ab) / max(ab @ ab, 1e-12), 0, 1)
    return np.linalg.norm(P - (a + t[:, None] * ab), axis=1), t


def weigh(rig, m, J, fitdef):
    """Skin weights by distance over the surface from each bone's own part of it."""
    P = m['pos']; n = len(P)
    seg = segments(rig, J)
    names = list(seg)
    E = np.stack([seg_dist(P, *seg[k])[0] for k in names], 1)          # (n, bones) straight-line distance
    nearest = None
    reach = fitdef.get('reach', {})
    # a vertex starts its bone's spread only if it is clearly that bone's: close to it, and closer than to any other by a margin
    srt = np.sort(E, 1)
    seed_ok = (srt[:, 1] - srt[:, 0] > 0.012)
    # and it faces away from its bone: a sleeve or a shirt that a hand rests on faces the hand, not away from it
    Nv = m['nrm']
    facing = np.zeros((n, len(names)))
    for k, name in enumerate(names):
        a_, b_ = seg[name]; ab = b_ - a_
        t = np.clip(((P - a_) @ ab) / max(ab @ ab, 1e-12), 0, 1)
        r = P - (a_ + t[:, None] * ab); r /= np.linalg.norm(r, axis=1, keepdims=True) + 1e-12
        facing[:, k] = (r * Nv).sum(1)
    # a bone's nearest surfaces are the ones that face away from it; the others are someone else's
    Ef = np.where(facing > 0.2, E, np.inf)
    nearest = Ef.argmin(1)
    srt = np.sort(Ef, 1)
    seed_ok = (srt[:, 1] - srt[:, 0] > 0.012) & np.isfinite(srt[:, 0])
    T = m['idx']
    rows = np.r_[T[:, 0], T[:, 1], T[:, 2]]; cols = np.r_[T[:, 1], T[:, 2], T[:, 0]]
    w = np.linalg.norm(P[rows] - P[cols], axis=1) + 1e-6
    A = coo_matrix((np.r_[w, w], (np.r_[rows, cols], np.r_[cols, rows])), shape=(n, n)).tocsr()
    G = np.full((n, len(names)), np.inf)
    for k, name in enumerate(names):
        seeds = np.where((nearest == k) & seed_ok & (facing[:, k] > 0.2) & (E[:, k] < reach.get(name.split('_')[0], REACH.get(name.split('_')[0], 0.2))))[0]
        if name.startswith('Hand') and fitdef.get('hands_from_wrist'):
            # hands that hold each other: each hand spreads only from its own wrist
            seeds = np.where(np.linalg.norm(P - J['wrist_' + name[-1]], axis=1) < fitdef['hands_from_wrist'])[0]
        if not len(seeds): continue
        G[:, k] = dijkstra(A, directed=False, indices=seeds, min_only=True)
    # pieces the surface never reaches (loose strands of hair, a separate collar) go by straight-line distance
    lost = ~np.isfinite(G).any(1)
    G[lost] = E[lost]
    G = np.where(np.isfinite(G), G, 9.0)
    g0 = G.min(1, keepdims=True)
    band = 0.035
    Wd = np.exp(-((G - g0) / band) ** 2) * (G - g0 < 2.5 * band)
    table = np.zeros((n, rig.n))
    for k, name in enumerate(names): table[:, rig.index[name]] = Wd[:, k]
    table /= table.sum(1, keepdims=True)
    # the neck is a narrow thing: a bun, a ponytail or a collar standing off it goes with the head or the chest
    ni = rig.index['Neck']; k = names.index('Neck')
    off = E[:, k] > NECK_REACH
    up = P[:, 1] > (J['neck'][1] + J['head'][1]) / 2
    moved = table[:, ni] * off
    table[:, ni] -= moved
    table[:, rig.index['Head']] += moved * up; table[:, rig.index['Chest']] += moved * ~up
    # a coat or a skirt hangs from the hips: where the surface stands well off a leg, the leg moves it less
    hips = rig.index['Hips']
    for k, name in enumerate(names):
        base = name.split('_')[0]
        loose = {**LOOSE, **fitdef.get('loose', {})}
        if base not in loose: continue
        r, most = loose[base]
        f = np.clip((E[:, k] - r) / 0.08, 0, 1) * most
        j = rig.index[name]
        moved = table[:, j] * f
        table[:, j] -= moved; table[:, hips] += moved
    mk.set_weights(m, table, rig.n)
    mk.smooth_weights(m, rig.n, rounds=3, strength=0.5)
    # a vertex belongs to one leg or the other, never both: where legs touch, a blend of the two would stretch between them
    dense = mk.dense_weights(m, rig.n)
    sides = {sd: [rig.index[f'{b}_{sd}'] for b in ('Thigh', 'Shin', 'Foot', 'Toe')] for sd in ('L', 'R')}
    wl = dense[:, sides['L']].sum(1); wr = dense[:, sides['R']].sum(1)
    lose = np.where(wl >= wr, 'R', 'L')
    both = (wl > 0) & (wr > 0)
    for sd in ('L', 'R'):
        rows = both & (lose == sd)
        dense[np.ix_(rows, sides[sd])] = 0
    dense /= dense.sum(1, keepdims=True)
    mk.set_weights(m, dense, rig.n)
    # an arm kept in its own pose moves as one with itself: what is mostly that arm is only that arm
    for side in fitdef.get('keep_arms', ()):
        arm = [rig.index[f'{b}_{side}'] for b in ('UpperArm', 'Forearm', 'Hand')]
        dense = mk.dense_weights(m, rig.n)
        share = dense[:, arm].sum(1)
        mostly = share >= 0.4
        for b in ('Forearm', 'Hand'):
            mostly |= E[:, names.index(f'{b}_{side}')] < (0.06 if b == 'Hand' else 0.045)
        dense[mostly & (share < 1e-6), rig.index[f'Hand_{side}']] = 1.0
        share = dense[:, arm].sum(1)
        keep = np.zeros_like(dense); keep[:, arm] = dense[:, arm]
        dense[mostly] = keep[mostly] / share[mostly, None]
        mk.set_weights(m, dense, rig.n)
    # small loose pieces (a chain, a strand of hair, an earring) move whole with the part of the body they hang from:
    # the bone most of their neighbours belong to, and an arm only if nearly all of them are an arm's
    from scipy.spatial import cKDTree
    labels = mk.components(m)[1]
    vlab = np.full(n, -1); 
    for c in range(3): vlab[m['idx'][:, c]] = labels
    sizes = np.bincount(labels)
    arm = {rig.index[f'{b}_{s}'] for b in ('UpperArm', 'Forearm', 'Hand') for s in ('L', 'R')}
    for lab in np.where(sizes < LOOSE_PIECE)[0]:
        mine = np.where(vlab == lab)[0]
        others = np.where((vlab != lab) & (vlab >= 0))[0]
        if not len(mine) or not len(others): continue
        _, near = cKDTree(P[others]).query(P[mine])
        bones = m['J'][others[near], 0]
        votes = np.bincount(bones, minlength=rig.n)
        body_votes = votes.copy(); body_votes[list(arm)] = 0
        pick = votes.argmax() if (votes[list(arm)].sum() > 0.85 * len(mine) or body_votes.sum() == 0) else body_votes.argmax()
        m['J'][mine] = 0; m['W'][mine] = 0; m['J'][mine, 0] = pick; m['W'][mine, 0] = 1.0
    return m


def blend(M, m):
    out = np.zeros((len(m['pos']), 4, 4))
    for k in range(4): out += m['W'][:, k, None, None] * M[m['J'][:, k]]
    return out


def apply(Mv, P):
    return np.einsum('nij,nj->ni', Mv[:, :3, :3], P) + Mv[:, :3, 3]


def stand(rig, m, f):
    """Moves the figure from its own pose into the natural one: each vertex by its bones."""
    move = np.einsum('bij,bjk->bik', f['N'], np.linalg.inv(f['F']))
    out = mk.copy(m)
    out['pos'] = apply(blend(move, m), m['pos'])
    return out


# ------------------------------------------------------------------ regions --

def paint(rig, m, rules, J_nat, N=None):
    """Every triangle gets the region of the first rule it meets. Rules are evaluated in the natural pose,
    in metres, so the same words fit every figure: heights, the bone a triangle belongs to, and so on."""
    P = m['pos']; T = m['idx']
    cent = P[T].mean(1)
    dom = m['J'][T, 0]                           # heaviest bone of each corner
    dom = np.array([np.bincount(r, minlength=rig.n).argmax() for r in dom])
    names = np.array(rig.names)[dom]
    labels = mk.components(m)[1]
    sizes = np.bincount(labels)
    region = np.array(['top'] * len(T), dtype=object)
    done = np.zeros(len(T), bool)
    head = J_nat['head']
    # a head left turned looks another way than +z: the face rules are read in the head's own turn
    hc = cent.copy()
    if J_nat.get('face_yaw'):
        hc = head + (cent - head) @ rot_about_y(-J_nat['face_yaw']).T
    # how far each triangle stands off the bone that moves it, standing naturally
    off = np.zeros(len(T))
    if N is not None:
        kids = {}
        for i, b in enumerate(rig.bones):
            if b['parent'] >= 0: kids.setdefault(b['parent'], i)
        for j in np.unique(dom):
            sel = dom == j
            a_ = N[j][:3, 3]; b_ = N[kids[j]][:3, 3] if j in kids else a_ + N[j][:3, 1] * 0.08
            off[sel] = seg_dist(cent[sel], a_, b_)[0]
    for rule in rules:
        sel = np.ones(len(T), bool)
        if 'bones' in rule: sel &= np.isin([n.split('_')[0] for n in names], rule['bones'])
        if 'above' in rule: sel &= cent[:, 1] >= rule['above']
        if 'above_head' in rule: sel &= cent[:, 1] >= head[1] + rule['above_head']
        if 'below_head' in rule: sel &= cent[:, 1] < head[1] + rule['below_head']
        if 'below' in rule: sel &= cent[:, 1] < rule['below']
        if 'front' in rule: sel &= cent[:, 2] >= rule['front']
        if 'behind' in rule: sel &= cent[:, 2] < rule['behind']
        if 'out' in rule: sel &= np.abs(cent[:, 0]) >= rule['out']
        if 'within' in rule: sel &= np.abs(cent[:, 0]) < rule['within']
        if 'small_pieces' in rule: sel &= sizes[labels] <= rule['small_pieces']
        if 'head_radius' in rule:
            d = np.linalg.norm((cent - head) * np.array([1, 0.8, 1]), axis=1); sel &= d >= rule['head_radius']
        if 'skull' in rule:
            # below a hairline that is high at the brow and low at the nape, and not out at the sides
            front_top, back_top, half = rule['skull']
            t = np.clip((hc[:, 2] - head[2] + 0.04) / 0.10, 0, 1)
            line = head[1] + back_top + (front_top - back_top) * t
            sel &= (hc[:, 1] < line) & (np.abs(hc[:, 0]) < half) & (hc[:, 2] > head[2] - 0.065)
        if 'face' in rule:
            # the face: in front of the head's centre, below the hairline
            fz, top = rule['face']
            sel &= (hc[:, 2] >= head[2] + fz) & (hc[:, 1] < head[1] + top)
        if 'hand_from' in rule:
            sel &= np.isin(names, ['Hand_L', 'Hand_R'])
        if 'box' in rule: sel &= inside(cent, rule['box'])
        if 'ears' in rule:
            ax = np.abs(hc[:, 0])
            sel &= (ax > 0.058) & (ax < 0.088) & (hc[:, 1] > head[1] - 0.005) & (hc[:, 1] < head[1] + 0.065) & (np.abs(hc[:, 2] - head[2] - 0.0) < 0.04)
        if 'tight' in rule: sel &= off < rule['tight']
        if 'near_head' in rule: sel &= np.linalg.norm(cent - head, axis=1) < rule['near_head']
        if 'far' in rule: sel &= off >= rule['far']
        pick = sel & ~done
        region[pick] = rule['region']; done |= pick
    return region


# ------------------------------------------------------------------ the bake --

def shade_of(m):
    """A little darkness in creases and under overhangs, as the supplied figures have no texture to show their folds."""
    P = m['pos']; Nn = m['nrm']
    ids = mk.position_ids(P)
    T = m['idx']
    n = len(P)
    rows = np.r_[T[:, 0], T[:, 1], T[:, 2]]; cols = np.r_[T[:, 1], T[:, 2], T[:, 0]]
    A = coo_matrix((np.ones(len(rows) * 2), (np.r_[rows, cols], np.r_[cols, rows])), shape=(n, n)).tocsr()
    A.data[:] = 1
    deg = np.maximum(np.asarray(A.sum(1)).ravel(), 1)
    avg = (A @ P) / deg[:, None]
    conc = ((avg - P) * Nn).sum(1)                       # > 0 where the neighbours stand out in front: a crease
    c = np.clip(conc / 0.004, 0, 1)
    for _ in range(2): c = 0.5 * c + 0.5 * (A @ c) / deg
    up = np.clip(Nn[:, 1], -1, 1)
    return np.clip(1.0 - 0.22 * c - 0.06 * np.clip(-up, 0, 1), 0.68, 1.0)


def bake_one(rig, fid, fitdef, preview=None):
    m = load_shape(os.path.join(SUPPLIED, fitdef['file']))
    # turned to face +z first, when it was made facing another way; everything else in figure_fits.py is in this turned frame
    if fitdef.get('yaw'): m['pos'] = m['pos'] @ rot_about_y(fitdef['yaw']).T
    m, removed = empty_hands(m, fitdef.get('remove'))
    f = fit(rig, fitdef)
    s = f['scale']
    m['pos'] = m['pos'] * s
    mk.smooth_normals(m)
    weigh(rig, m, f['joints'], fitdef)
    nat = stand(rig, m, f)
    if fitdef.get('trim_stretched'):
        # standing up a seated figure pulls the cloth that lay between the legs and the seat out into sheets: those are let go
        T = m['idx']
        def longest(P): return np.max([np.linalg.norm(P[T[:, a]] - P[T[:, b]], axis=1) for a, b in ((0, 1), (1, 2), (2, 0))], axis=0)
        before = longest(m['pos']); after = longest(nat['pos'])
        bad = (after > fitdef['trim_stretched'] * before) & (after > 0.05)
        keep = ~bad
        m = mk.take(m, keep); nat = mk.take(nat, keep)
        labels = mk.components(nat)[1]; sizes = np.bincount(labels)
        keep = sizes[labels] >= 60
        m = mk.take(m, keep); nat = mk.take(nat, keep)
        removed += int((~bad).size - bad.sum() - keep.sum()) + int(bad.sum())
    mk.smooth_normals(nat)
    J_nat = {'head': f['N'][rig.index['Head']][:3, 3], 'neck': f['N'][rig.index['Neck']][:3, 3], 'face_yaw': fitdef.get('face_yaw', 0.0)}
    region = paint(rig, nat, fitdef['regions'], J_nat, f['N'])
    # each region's triangles get their own vertices, so a colour stops at the edge of its region
    parts = []
    for r in np.unique(region):
        piece = mk.take(nat, region == r)
        piece['slot'][:] = REGION_SLOT[r]
        parts.append(piece)
    nat = mk.merge(parts)
    mk.smooth_normals(nat)
    nat['shade'] = shade_of(nat)
    # natural pose -> bind pose, with this figure's own skeleton
    skin = np.einsum('bij,bjk->bik', f['N'], rig.ibm)
    Mv = blend(skin, nat)
    Mi = np.linalg.inv(Mv)
    bind = mk.copy(nat)
    bind['pos'] = apply(Mi, nat['pos'])
    nb = np.einsum('nij,nj->ni', Mi[:, :3, :3], nat['nrm']); bind['nrm'] = nb / np.maximum(np.linalg.norm(nb, axis=1), 1e-20)[:, None]
    # the skeleton's own pieces of the natural pose, for the client: local translations of the bones above the hips
    bones = {}
    for i, b in enumerate(rig.bones):
        if b['name'] in LEG_BONES: continue
        par = b['parent']
        Lm = np.linalg.inv(f['N'][par]) @ f['N'][i]
        R = Lm[:3, :3].copy()
        for k in range(3): R[:, k] /= np.linalg.norm(R[:, k])
        bones[b['name']] = {'t': [round(float(x), 5) for x in Lm[:3, 3]], 'q': [round(float(x), 6) for x in mat_to_quat(R)]}
    top = float(nat['pos'][:, 1].max())
    head_top = float(f['N'][rig.index['Head']][1, 3] + np.linalg.norm(f['joints']['top'] - f['joints']['head']))
    info = {'headJoint': [round(float(x), 3) for x in J_nat['head']], 'removed': removed, 'scale': round(s, 4), 'vertices': len(bind['pos']), 'triangles': len(bind['idx']), 'top': round(top, 3), 'headTop': round(head_top, 3),
            'regions': sorted(set(region)), 'counts': {r: int((region == r).sum()) for r in sorted(set(region))}}
    return {'bind': bind, 'nat': nat, 'asset': m, 'fit': f, 'bones': bones, 'info': info, 'region': region}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--only'); ap.add_argument('--preview'); ap.add_argument('--nowrite', action='store_true')
    a = ap.parse_args()
    t0 = time.time()
    rig = Rig(skeleton(Glb(BASE)))
    # a kept arm sits far from where the bind pose puts an arm, so the figures are packed in a larger box than the kit
    import kit as kit_module
    kit_module.POS_RANGE = 2.0
    kit = Kit(rig.bones)
    meta = {}
    for fid, fitdef in FITS.items():
        if a.only and fid not in a.only.split(','): continue
        r = bake_one(rig, fid, fitdef)
        b = r['bind']
        # the whole figure near (the player, other players, the selection screen), a light one far off; nothing in between, to keep the page small
        kit.add(f'fig.{fid}', b, lod=0, group='figure')
        kit.add(f'fig.{fid}', b, lod=1, group='figure')
        far = fitdef.get('far', 1600)
        kit.add(f'fig.{fid}', mk.decimate(b, far) if len(b['idx']) > far else b, lod=2, group='figure')
        height = TARGET_HEIGHT[fitdef['gender']]
        import hashlib
        src = open(os.path.join(SUPPLIED, fitdef['file']), 'rb').read()
        meta[fid] = {'file': fitdef['file'], 'md5': hashlib.md5(src).hexdigest(), 'removed': r['info']['removed'], 'suppliedTriangles': int(len(load_shape(os.path.join(SUPPLIED, fitdef['file']))['idx'])),
                     'bones': r['bones'], 'stillArms': list(fitdef.get('keep_arms', ())), 'scale': round(height / r['info']['headTop'], 4), 'regions': r['info']['regions']}
        print(fid, json.dumps(r['info']), f"lods {[kit.parts['fig.' + fid]['lods'][i]['t'] for i in range(3)]}", flush=True)
        if a.preview:
            import figure_preview
            figure_preview.sheet(rig, r, os.path.join(a.preview, f'{fid}.png'))
    if a.nowrite: return
    kit.extra = {'figures': meta}
    m = kit.manifest()
    text = '// Generated by tools/characters/figures.py from assets/characters/figures/supplied. Do not edit by hand.\n'
    m['posRange'] = kit_module.POS_RANGE
    text += 'export const FIGURE_META = ' + json.dumps({k: v for k, v in m.items() if k in ('version', 'posRange', 'posLift', 'uvScale', 'shadeOne', 'parts', 'figures', 'bytes')}, separators=(',', ':')) + ';\n'
    import base64
    text += "export const FIGURE_B64 = '" + base64.b64encode(bytes(kit.blob)).decode('ascii') + "';\n"
    open(OUT, 'w').write(text)
    print(f'wrote {os.path.relpath(OUT, ROOT)}: {len(meta)} figures, {len(kit.blob) / 1024:.0f} KB packed, {time.time() - t0:.0f} s')


if __name__ == '__main__':
    main()
