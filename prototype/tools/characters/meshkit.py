"""Mesh tools for the character bake. Numpy and scipy only.

A mesh here is a dict of arrays over its vertices:
  pos (n,3)   nrm (n,3)   uv (n,2)   J (n,4) bone indices   W (n,4) weights
  slot (n,) which colour of the character paints this vertex
  shade (n,) a multiplier on that colour, 1 = unchanged
and idx (m,3), its triangles.
"""
import heapq
import numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components

VERTEX_KEYS = ('pos', 'nrm', 'uv', 'J', 'W', 'slot', 'shade')


def make(pos, idx, J=None, W=None, slot=0, shade=1.0, uv=None, nrm=None):
    n = len(pos)
    m = {'pos': np.asarray(pos, dtype=np.float64), 'idx': np.asarray(idx, dtype=np.int64).reshape(-1, 3)}
    m['J'] = np.zeros((n, 4), dtype=np.int64) if J is None else np.asarray(J, dtype=np.int64)
    m['W'] = np.tile([1.0, 0, 0, 0], (n, 1)) if W is None else np.asarray(W, dtype=np.float64)
    m['slot'] = np.full(n, slot, dtype=np.int64) if np.isscalar(slot) else np.asarray(slot, dtype=np.int64)
    m['shade'] = np.full(n, shade, dtype=np.float64) if np.isscalar(shade) else np.asarray(shade, dtype=np.float64)
    m['uv'] = np.zeros((n, 2)) if uv is None else np.asarray(uv, dtype=np.float64)
    m['nrm'] = np.zeros((n, 3)) if nrm is None else np.asarray(nrm, dtype=np.float64)
    if nrm is None: smooth_normals(m)
    return m


def copy(m):
    return {k: v.copy() for k, v in m.items()}


def merge(meshes):
    meshes = [m for m in meshes if m is not None and len(m['idx'])]
    out = {k: np.concatenate([m[k] for m in meshes]) for k in VERTEX_KEYS}
    off = np.cumsum([0] + [len(m['pos']) for m in meshes[:-1]])
    out['idx'] = np.concatenate([m['idx'] + o for m, o in zip(meshes, off)])
    return out


def take(m, tri_mask):
    """The sub-mesh made of the chosen triangles."""
    idx = m['idx'][tri_mask]
    used = np.unique(idx)
    remap = np.full(len(m['pos']), -1, dtype=np.int64)
    remap[used] = np.arange(len(used))
    out = {k: m[k][used] for k in VERTEX_KEYS}
    out['idx'] = remap[idx]
    return out


def position_ids(pos, tol=2e-5):
    key = np.round(pos / tol).astype(np.int64)
    _, inv = np.unique(key, axis=0, return_inverse=True)
    return inv.ravel()


def components(m):
    """Triangle labels of the pieces that hang together, joined by position."""
    ids = position_ids(m['pos'])
    T = ids[m['idx']]
    n = ids.max() + 1
    A = coo_matrix((np.ones(len(T) * 3), (np.r_[T[:, 0], T[:, 1], T[:, 2]], np.r_[T[:, 1], T[:, 2], T[:, 0]])), shape=(n, n))
    k, lab = connected_components(A, directed=False)
    return k, lab[T[:, 0]]


def weld(m, by=('pos',), tol=2e-5):
    """Joins vertices that agree on the named attributes; the first one's values are kept."""
    cols = []
    for k in by:
        a = m[k].reshape(len(m['pos']), -1)
        cols.append(np.round(a / (tol if k == 'pos' else 1e-4)).astype(np.int64))
    key = np.concatenate(cols, axis=1)
    _, first, inv = np.unique(key, axis=0, return_index=True, return_inverse=True)
    inv = inv.ravel()
    out = {k: m[k][first] for k in VERTEX_KEYS}
    idx = inv[m['idx']]
    ok = (idx[:, 0] != idx[:, 1]) & (idx[:, 1] != idx[:, 2]) & (idx[:, 0] != idx[:, 2])
    out['idx'] = idx[ok]
    return out


def face_normals(pos, idx):
    a, b, c = pos[idx[:, 0]], pos[idx[:, 1]], pos[idx[:, 2]]
    n = np.cross(b - a, c - a)
    area = np.linalg.norm(n, axis=1)
    return n / np.maximum(area, 1e-20)[:, None], area / 2


def smooth_normals(m):
    fn, area = face_normals(m['pos'], m['idx'])
    n = np.zeros_like(m['pos'])
    for k in range(3): np.add.at(n, m['idx'][:, k], fn * area[:, None])
    ln = np.linalg.norm(n, axis=1)
    n[ln < 1e-20] = [0, 1, 0]
    m['nrm'] = n / np.maximum(ln, 1e-20)[:, None]
    return m


def crease_normals(m, angle=50.0):
    """Smooth normals that break across edges sharper than `angle` degrees. Vertices are split where they must be."""
    m = weld(m, by=('pos', 'slot'))
    pos, idx = m['pos'], m['idx']
    fn, area = face_normals(pos, idx)
    cosmin = np.cos(np.radians(angle))
    faces_of = [[] for _ in range(len(pos))]
    for f, tri in enumerate(idx):
        for v in tri: faces_of[v].append(f)
    corner_n = np.zeros((len(idx), 3, 3))
    for f, tri in enumerate(idx):
        for k, v in enumerate(tri):
            fs = faces_of[v]
            near = [g for g in fs if fn[g] @ fn[f] >= cosmin]
            n = (fn[near] * area[near][:, None]).sum(0)
            ln = np.linalg.norm(n)
            corner_n[f, k] = n / ln if ln > 1e-20 else fn[f]
    out = {k: m[k][idx.ravel()] for k in VERTEX_KEYS}
    out['nrm'] = corner_n.reshape(-1, 3)
    out['idx'] = np.arange(len(idx) * 3).reshape(-1, 3)
    return weld(out, by=('pos', 'nrm', 'slot', 'uv'))


def tri_count(m):
    return len(m['idx'])


def transform(m, M):
    out = copy(m)
    out['pos'] = m['pos'] @ M[:3, :3].T + M[:3, 3]
    N = np.linalg.inv(M[:3, :3]).T
    n = m['nrm'] @ N.T
    out['nrm'] = n / np.maximum(np.linalg.norm(n, axis=1), 1e-20)[:, None]
    if np.linalg.det(M[:3, :3]) < 0: out['idx'] = out['idx'][:, ::-1]
    return out


def clean_weights(m, keep=4):
    """Sorts each vertex's influences, heaviest first, and makes them sum to one."""
    order = np.argsort(-m['W'], axis=1)
    m['W'] = np.take_along_axis(m['W'], order, axis=1)
    m['J'] = np.take_along_axis(m['J'], order, axis=1)
    m['W'][:, keep:] = 0
    m['W'][m['W'] < 0.004] = 0
    m['J'][m['W'] == 0] = 0
    s = m['W'].sum(1)
    m['W'] /= np.maximum(s, 1e-9)[:, None]
    return m


def set_weights(m, table, nbones):
    """`table` is (n, nbones) dense weights; keeps the four heaviest."""
    order = np.argsort(-table, axis=1)[:, :4]
    m['J'] = order
    m['W'] = np.take_along_axis(table, order, axis=1)
    return clean_weights(m)


def dense_weights(m, nbones):
    t = np.zeros((len(m['pos']), nbones))
    for k in range(4): np.add.at(t, (np.arange(len(t)), m['J'][:, k]), m['W'][:, k])
    return t


def smooth_weights(m, nbones, rounds=2, strength=0.5):
    """Blends each vertex's weights with its neighbours', so a joint bends over a few rings and does not crease."""
    ids = position_ids(m['pos'])
    n = ids.max() + 1
    t = np.zeros((n, nbones)); cnt = np.zeros(n)
    d = dense_weights(m, nbones)
    np.add.at(t, ids, d); np.add.at(cnt, ids, 1)
    t /= cnt[:, None]
    T = ids[m['idx']]
    rows = np.r_[T[:, 0], T[:, 1], T[:, 2], T[:, 1], T[:, 2], T[:, 0]]
    cols = np.r_[T[:, 1], T[:, 2], T[:, 0], T[:, 0], T[:, 1], T[:, 2]]
    A = coo_matrix((np.ones(len(rows)), (rows, cols)), shape=(n, n)).tocsr()
    A.data[:] = 1
    deg = np.maximum(np.asarray(A.sum(1)).ravel(), 1)
    for _ in range(rounds):
        t = (1 - strength) * t + strength * (A @ t) / deg[:, None]
    return set_weights(m, t[ids], nbones)


# ------------------------------------------------------------ decimation --

def decimate(m, target, lock_boundary=3.0, slot_seams=True, flip=0.15):
    """Quadric edge collapse onto existing vertices, so skin weights and colours stay true.

    The mesh is joined by position first and comes back with smooth normals.
    """
    m = weld(m, by=('pos', 'slot') if slot_seams else ('pos',))
    pos = m['pos']; idx = m['idx'].copy()
    nv = len(pos); nf = len(idx)
    if nf <= target: return crease_normals(m)
    fn, area = face_normals(pos, idx)
    Q = np.zeros((nv, 4, 4))
    d = -(fn * pos[idx[:, 0]]).sum(1)
    planes = np.c_[fn, d]
    K = planes[:, :, None] * planes[:, None, :] * area[:, None, None]
    for k in range(3): np.add.at(Q, idx[:, k], K)
    vfaces = [set() for _ in range(nv)]
    for f, tri in enumerate(idx):
        for v in tri: vfaces[v].add(f)
    alive_f = np.ones(nf, dtype=bool)
    # open edges are held in place by a plane through each, square to its face
    edge_count = {}
    for f, tri in enumerate(idx):
        for a, b in ((tri[0], tri[1]), (tri[1], tri[2]), (tri[2], tri[0])):
            key = (a, b) if a < b else (b, a)
            edge_count.setdefault(key, []).append(f)
    boundary = np.zeros(nv, dtype=bool)
    for (a, b), fs in edge_count.items():
        if len(fs) == 1:
            boundary[a] = boundary[b] = True
            e = pos[b] - pos[a]; n = np.cross(e, fn[fs[0]]); ln = np.linalg.norm(n)
            if ln < 1e-12: continue
            n /= ln; p = np.r_[n, -(n @ pos[a])]
            Kb = np.outer(p, p) * (e @ e) * lock_boundary
            Q[a] += Kb; Q[b] += Kb
    slot = m['slot']
    stamp = np.zeros(nv, dtype=np.int64)
    alive_v = np.ones(nv, dtype=bool)

    def cost(u, v):
        p = np.r_[pos[v], 1.0]
        return float(p @ (Q[u] + Q[v]) @ p)

    def neighbours(u):
        out = set()
        for f in vfaces[u]: out.update(idx[f])
        out.discard(u)
        return out

    heap = []
    def push(u):
        for v in neighbours(u):
            if slot_seams and slot[u] != slot[v]: continue
            if boundary[u] and not boundary[v]: continue
            heapq.heappush(heap, (cost(u, v), int(u), int(v), int(stamp[u]), int(stamp[v])))
    for u in range(nv): push(u)
    left = nf
    while left > target and heap:
        c, u, v, su, sv = heapq.heappop(heap)
        if not alive_v[u] or not alive_v[v] or stamp[u] != su or stamp[v] != sv: continue
        shared = vfaces[u] & vfaces[v]
        if not shared: continue
        # moving u onto v must not turn any of u's other faces over
        ok = True
        for f in vfaces[u] - shared:
            tri = idx[f]
            p = [pos[v] if w == u else pos[w] for w in tri]
            n = np.cross(p[1] - p[0], p[2] - p[0]); ln = np.linalg.norm(n)
            if ln < 1e-14 or (n / ln) @ fn[f] < flip: ok = False; break
        if not ok: continue
        # and must not fold the surface onto itself: u and v may share only the two far corners
        nu = neighbours(u); nv_ = neighbours(v)
        if len((nu & nv_)) > len(shared) and not (boundary[u] or boundary[v]): continue
        for f in shared:
            alive_f[f] = False; left -= 1
            for w in idx[f]: vfaces[w].discard(f)
        for f in list(vfaces[u]):
            tri = idx[f]; tri[tri == u] = v
            vfaces[v].add(f)
            p0, p1, p2 = pos[tri[0]], pos[tri[1]], pos[tri[2]]
            n = np.cross(p1 - p0, p2 - p0); ln = np.linalg.norm(n)
            if ln > 1e-14: fn[f] = n / ln
        vfaces[u] = set()
        alive_v[u] = False
        Q[v] += Q[u]
        boundary[v] = boundary[v] or boundary[u]
        stamp[v] += 1
        touched = neighbours(v); touched.add(v)
        for w in touched:
            stamp[w] += 1
        for w in touched: push(w)
    out = {k: m[k] for k in VERTEX_KEYS}
    out['idx'] = idx[alive_f]
    out = take(out, np.ones(len(out['idx']), dtype=bool))
    return crease_normals(out)


# -------------------------------------------------------------- clipping --

def split_by(m, value, level=0.5, refine=None):
    """Cuts every triangle that crosses value == level, so the line between two colours is a clean edge.

    `value` is per vertex. `refine(a_index, b_index, t)` may return a better t for where an edge crosses.
    Returns the mesh and a per-triangle flag: True where the triangle lies on the high side.
    """
    pos = m['pos']; idx = m['idx']
    new = {k: [m[k]] for k in VERTEX_KEYS}
    cache = {}
    count = [len(pos)]

    def cut(a, b):
        key = (a, b) if a < b else (b, a)
        if key in cache: return cache[key]
        a, b = key
        t = (level - value[a]) / (value[b] - value[a])
        if refine: t = refine(a, b, t)
        t = min(0.98, max(0.02, t))
        for k in VERTEX_KEYS:
            if k == 'J': continue
            if k == 'slot': new[k].append(m[k][a:a + 1]); continue
            if k == 'W': continue
            new[k].append(((1 - t) * m[k][a] + t * m[k][b])[None])
        # weights: union of both ends' influences, blended
        infl = {}
        for j, w in zip(m['J'][a], m['W'][a]): infl[j] = infl.get(j, 0) + (1 - t) * w
        for j, w in zip(m['J'][b], m['W'][b]): infl[j] = infl.get(j, 0) + t * w
        top = sorted(infl.items(), key=lambda kv: -kv[1])[:4]
        top += [(0, 0.0)] * (4 - len(top))
        new['J'].append(np.array([[j for j, _ in top]])); new['W'].append(np.array([[w for _, w in top]]))
        cache[key] = count[0]; count[0] += 1
        return cache[key]

    tris = []; high = []
    for tri in idx:
        hi = value[tri] >= level
        n = hi.sum()
        if n == 0 or n == 3: tris.append(tri); high.append(n == 3); continue
        # rotate so the odd corner comes first
        k = int(np.argmax(hi)) if n == 1 else int(np.argmin(hi))
        a, b, c = tri[k], tri[(k + 1) % 3], tri[(k + 2) % 3]
        ab = cut(a, b); ac = cut(a, c)
        tris.append([a, ab, ac]); high.append(n == 1)
        tris.append([ab, b, c]); high.append(n != 1)
        tris.append([ab, c, ac]); high.append(n != 1)
    out = {k: np.concatenate(v) for k, v in new.items()}
    out['idx'] = np.array(tris, dtype=np.int64)
    ln = np.linalg.norm(out['nrm'], axis=1)
    out['nrm'] = out['nrm'] / np.maximum(ln, 1e-20)[:, None]
    return out, np.array(high, dtype=bool)


def split_slots(m, high, slot_high):
    """Gives the triangles flagged `high` their own vertices, painted `slot_high`."""
    a = take(m, ~high); b = take(m, high)
    b['slot'][:] = slot_high
    return merge([a, b])


def _midpoint(m, new, a, b):
    for k in VERTEX_KEYS:
        if k in ('J', 'W'): continue
        if k == 'slot': new[k].append(m[k][a:a + 1]); continue
        new[k].append(((m[k][a] + m[k][b]) / 2)[None])
    infl = {}
    for j, w in zip(m['J'][a], m['W'][a]): infl[j] = infl.get(j, 0) + 0.5 * w
    for j, w in zip(m['J'][b], m['W'][b]): infl[j] = infl.get(j, 0) + 0.5 * w
    top = sorted(infl.items(), key=lambda kv: -kv[1])[:4]
    top += [(0, 0.0)] * (4 - len(top))
    new['J'].append(np.array([[j for j, _ in top]])); new['W'].append(np.array([[w for _, w in top]]))


def refine(m, field, max_edge, passes=3):
    """Halves the long edges that a painted shape would otherwise fall between.

    `field(pos)` is positive inside the shape. An edge longer than `max_edge` is halved if it crosses the
    shape's outline, or if the shape passes between its ends. Neighbours are split to match, so no cracks open.
    """
    for _ in range(passes):
        pos = m['pos']; idx = m['idx']
        f = field(pos)
        E = np.r_[idx[:, [0, 1]], idx[:, [1, 2]], idx[:, [2, 0]]]
        E = np.unique(np.sort(E, axis=1), axis=0)
        length = np.linalg.norm(pos[E[:, 0]] - pos[E[:, 1]], axis=1)
        fm = field((pos[E[:, 0]] + pos[E[:, 1]]) / 2)
        fa, fb = f[E[:, 0]], f[E[:, 1]]
        want = (length > max_edge) & (((fa > 0) != (fb > 0)) | ((fm > 0) & (fa <= 0) & (fb <= 0)) | ((fm <= 0) & (fa > 0) & (fb > 0)))
        if not want.any(): break
        marked = set(map(tuple, E[want]))
        new = {k: [m[k]] for k in VERTEX_KEYS}
        cache = {}; count = len(pos)
        tris = []
        for tri in idx:
            mids = []
            for e in range(3):
                a, b = int(tri[e]), int(tri[(e + 1) % 3])
                key = (a, b) if a < b else (b, a)
                if key in marked:
                    if key not in cache:
                        _midpoint(m, new, key[0], key[1]); cache[key] = count; count += 1
                    mids.append(cache[key])
                else: mids.append(-1)
            n = sum(1 for x in mids if x >= 0)
            a, b, c = int(tri[0]), int(tri[1]), int(tri[2]); ab, bc, ca = mids
            if n == 0: tris.append([a, b, c])
            elif n == 3: tris += [[a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]]
            elif n == 1:
                if ab >= 0: tris += [[a, ab, c], [ab, b, c]]
                elif bc >= 0: tris += [[a, b, bc], [a, bc, c]]
                else: tris += [[a, b, ca], [ca, b, c]]
            else:
                if ab < 0: tris += [[a, b, bc], [a, bc, ca], [ca, bc, c]]
                elif bc < 0: tris += [[a, ab, ca], [ab, b, c], [ab, c, ca]]
                else: tris += [[a, ab, c], [ab, bc, c], [ab, b, bc]]
        m = {k: np.concatenate(v) for k, v in new.items()}
        m['idx'] = np.array(tris, dtype=np.int64)
        ln = np.linalg.norm(m['nrm'], axis=1)
        m['nrm'] = m['nrm'] / np.maximum(ln, 1e-20)[:, None]
    return m
