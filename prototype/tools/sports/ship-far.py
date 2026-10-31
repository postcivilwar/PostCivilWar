"""A lighter copy of the owner's naval ship, for drawing a ship that is far away (31 October 2026, the owner's request:
"prepare a side-by-side of your ship next to a lighter copy, to use only when a ship is far away. My original file
stays untouched."). Nothing here writes to his file or to the game's full copy of it.

    python3 tools/sports/ship-far.py                 writes assets/sports/game/naval-ship-far.bin and naval-ship-far.json
    python3 tools/sports/ship-far.py --share 0.3     keeps another share of the triangles (a quarter if not given)
    python3 tools/sports/ship-far.py --out DIR       writes the two files to DIR instead (for trying things out)

It starts from the game's full copy of his ship (assets/sports/game/naval-ship.bin, which sports.py made: every
triangle of his file, turned to face +Z, stood on y = 0, 120 m long; the river draws it at half that) and keeps about a
quarter of its triangles:

  - Every point of the light copy is one of his points, with its own normal and its own place on the colour picture:
    nothing is moved, smoothed or added. Triangles are taken away by joining one point onto a neighbouring point (the
    two triangles between them go), cheapest first: the cost of a join is how far it would move the surface (each
    point carries the planes of the triangles it has gathered, and the cost is the sum of the squared distances to
    them: the "quadric error" of Garland and Heckbert, 1997), and a little more where the two points' normals differ
    (BEND), so that the ship's light and shade change as little as its shape.
  - His colour picture is in 854 small islands. Where two islands meet on the ship, the same point has two places on
    the picture, one for each side. Such a point is only joined along the line where the islands meet, onto the next
    point on that line, and each of its two places goes to that point's place on the same side: so the colours on both
    sides stay where they were, and the two sides never come apart. A point where three or more islands meet is never
    moved. A join may straighten a line between islands by at most UV_TOL on the picture (one pixel of the 512 picture,
    the one a phone draws a far ship with), so no triangle reaches into the dark gaps between the islands.
  - No join may turn a triangle over (or by more than 60 degrees) on the ship or on the picture, or fold the surface
    onto itself. The few open edges of the surface (a hole's rim) move only along themselves.
  - Pieces too small to see from 150 m (under half a metre across at the ship's size on the river: at 150 m on a phone
    800 pixels wide, held sideways, a pixel is about 0.4 m) are left out.

(The characters' decimation, tools/characters/meshkit.py, and the vehicles' piece-by-piece reduction, tools/vehicles/
lod.py, were tried first. Both join points by where they are, whatever their places on the picture, and his ship has
no boxes for lod.py to rebuild: a quarter of the triangles of either copy took their colours from the wrong island, and
streaks of other colours ran along the lines between islands, plain to see from 60 m.)

The light copy is written in the layout src/client/sports-model.js reads (points, normals, places on the picture, then
triangles; one part, `body`), to be drawn with the ship's own colour pictures (the 1024 or the 512). naval-ship-far.json
holds its numbers, which the game needs to read it (as sports-parts.js holds the full copy's), and which files it was
made from. The game does not use it yet: that waits for the owner's word on the pictures comparing the two.

Those pictures (31 October 2026: the game's own loader and light, the ship at its size on the river, both copies from the
same cameras) show the two the same from about 150 m on a phone 800 pixels wide held sideways (370 pixels tall); from 120 m
only a pixel here and there differs. The game's view is 55 degrees from top to bottom on any screen, so on a taller
picture (a phone held upright, a computer's window) the ship is drawn bigger at the same distance, and the two look the
same from about 150 m times the picture's height over 370 pixels.
"""
import hashlib, heapq, json, math, os, sys, time
import numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))
SRC = os.path.join(ROOT, 'assets', 'sports')
GAME = os.path.join(SRC, 'game')

TOOL = 'ship-far.py 1'
ITEM = 'naval-ship'
SHARE = 0.25                          # of the full copy's triangles kept
DRAWN = 0.5                           # the river draws the ship at half the full copy's size (NAVAL.scale, src/sim/naval.js)
SMALLEST = 0.5                        # metres across, at the size drawn: smaller pieces are left out
UV_TOL = 1.0 / 512                    # how far (on the picture) a line between islands may be straightened by a join
TURN = math.cos(math.radians(60))     # a join may turn no triangle by more than this
EDGE = 0.3                            # how firmly a hole's rim and a line between islands hold their places
BEND = 0.2                            # what a change of shading costs (m2 of surface moved per m2 shaded otherwise)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def read_full():
    """The game's full copy of the ship, as sports-model.js reads it: its points (metres), normals (as stored), places
    on the picture and triangles; its entry in sports.json; and the file's bytes."""
    spec = json.load(open(os.path.join(SRC, 'sports.json')))[ITEM]
    master = open(os.path.join(SRC, spec['master']), 'rb').read()
    if sha(master) != spec['sha256']:
        sys.exit(f"{spec['master']} is not the file the game's copy was made from: run python3 tools/sports/sports.py first")
    raw = open(os.path.join(GAME, spec['files']['mesh']), 'rb').read()
    n, t = spec['vertices'], spec['triangles']
    at = 0
    pos = np.frombuffer(raw, np.float32, n * 3, at).reshape(n, 3); at += n * 12
    nrm = np.frombuffer(raw, np.int16, n * 3, at).reshape(n, 3); at += n * 6 + (n % 2) * 2
    uv = np.frombuffer(raw, np.float32, n * 2, at).reshape(n, 2); at += n * 8
    wide = spec['index'] == 32
    idx = np.frombuffer(raw, np.uint32 if wide else np.uint16, t * 3, at).reshape(t, 3).astype(np.int64)
    at += t * 3 * (4 if wide else 2)
    if at != len(raw): sys.exit(f"{spec['files']['mesh']} does not hold what sports.json says")
    return pos, nrm, uv, idx, spec, raw, master


def places(pos):
    """The places on the ship: one for each set of the copy's points that are at the same place (the points of two
    islands of the picture that meet there). Gives each point's place and where each place is."""
    _, first, pid = np.unique(pos, axis=0, return_index=True, return_inverse=True)
    pid = pid.ravel()
    return pid, pos[first].astype(np.float64)


def small_pieces(P, T, drawn=DRAWN, smallest=SMALLEST):
    """Each triangle: whether its piece (the triangles that hang together) is smaller across than `smallest` metres
    at the size drawn; and how many such pieces there are."""
    n = len(P)
    A = coo_matrix((np.ones(T.size), (T.ravel(), T[:, [1, 2, 0]].ravel())), shape=(n, n))
    k, lab = connected_components(A, directed=False)
    lo = np.full((k, 3), np.inf); hi = np.full((k, 3), -np.inf)
    np.minimum.at(lo, lab, P); np.maximum.at(hi, lab, P)
    used = np.zeros(k, bool); used[lab[T[:, 0]]] = True
    tiny = (np.linalg.norm(hi - lo, axis=1) * drawn < smallest) & used
    return tiny[lab[T[:, 0]]], int(tiny.sum())


def simplify(P, pid, UV, F, target, normals=None, bend=BEND, uv_tol=UV_TOL, turn=TURN, edge=EDGE):
    """Joins points onto neighbouring points, cheapest first, until `target` triangles are left (or no join is allowed).

    P: where each place on the ship is; pid: each point's place; UV: each point's place on the picture; F: the
    triangles, as the copy's own points. Gives the triangles left, as the copy's own points."""
    nv, nf = len(P), len(F)
    Fw = [list(map(int, f)) for f in F]                  # each triangle's corners: the copy's own points
    Fp = [[int(pid[w]) for w in f] for f in Fw]          # and the places they are at
    vf = [set() for _ in range(nv)]                      # the triangles at each place
    for f, (a, b, c) in enumerate(Fp):
        vf[a].add(f); vf[b].add(f); vf[c].add(f)
    face = [True] * nf
    here = [True] * nv
    Fa, Wa = np.asarray(Fp), np.asarray(Fw)

    # each triangle's plane, weighted by its area, gathered at its corners
    A, B, C = P[Fa[:, 0]], P[Fa[:, 1]], P[Fa[:, 2]]
    N = np.cross(B - A, C - A); twice = np.linalg.norm(N, axis=1)
    N = N / np.maximum(twice, 1e-30)[:, None]

    def planes(n, p, w):
        d = -(n * p).sum(1)
        x, y, z = n[:, 0], n[:, 1], n[:, 2]
        return np.stack([x * x, x * y, x * z, x * d, y * y, y * z, y * d, z * z, z * d, d * d], 1) * w[:, None]
    Q = np.zeros((nv, 10))
    K = planes(N, A, twice / 2)
    for k in range(3): np.add.at(Q, Fa[:, k], K)
    # (and a third of each triangle's area: the surface each place shades)
    S = np.zeros(nv)
    for k in range(3): np.add.at(S, Fa[:, k], twice / 6)

    # the edges: a hole's rim (one triangle), a line between islands of the picture (two triangles whose points differ
    # there), or more than two triangles (left where it is)
    e0, e1 = Fa.T.ravel(), Fa[:, [1, 2, 0]].T.ravel()
    w0, w1 = Wa.T.ravel(), Wa[:, [1, 2, 0]].T.ravel()
    tri = np.tile(np.arange(nf), 3)
    lo, hi = np.minimum(e0, e1), np.maximum(e0, e1)
    wlo, whi = np.where(e0 < e1, w0, w1), np.where(e0 < e1, w1, w0)
    order = np.argsort(lo * nv + hi, kind='stable')
    _, start, count = np.unique((lo * nv + hi)[order], return_index=True, return_counts=True)
    rim = order[start[count == 1]]
    pair = start[count == 2]
    i1, i2 = order[pair], order[pair + 1]
    seam = np.where((wlo[i1] != wlo[i2]) | (whi[i1] != whi[i2]))[0]
    many = order[start[count > 2]]
    # (a hole's rim and a line between islands hold to a plane through them, square to the surface)
    for ends, normal in ((rim, N[tri[rim]]), (i1[seam], N[tri[i1[seam]]] + N[tri[i2[seam]]])):
        e = P[hi[ends]] - P[lo[ends]]
        n = np.cross(e, normal); ln = np.linalg.norm(n, axis=1); ok = ln > 1e-12
        K = planes(n[ok] / ln[ok, None], P[lo[ends][ok]], (e[ok] ** 2).sum(1) * edge)
        np.add.at(Q, lo[ends][ok], K); np.add.at(Q, hi[ends][ok], K)
    border = np.zeros(nv, bool); border[lo[rim]] = True; border[hi[rim]] = True
    points_at = np.bincount(pid, minlength=nv)            # how many of the copy's points each place has
    fixed = np.zeros(nv, bool); fixed[lo[many]] = True; fixed[hi[many]] = True
    fixed |= points_at >= 3                               # where three or more islands meet
    fixed |= border & (points_at >= 2)                    # where a line between islands meets a hole's rim
    border = border.tolist(); fixed = fixed.tolist()
    Q = Q.tolist()
    S = S.tolist()
    Nl = [tuple(n) for n in np.asarray(normals, np.float64).tolist()] if normals is not None and bend > 0 else None
    Pl = [tuple(p) for p in P.tolist()]
    UVl = [tuple(t) for t in np.asarray(UV, np.float64).tolist()]
    stamp = [0] * nv
    heap = []
    uv_tol2 = uv_tol * uv_tol

    def cost(u, v):
        q, r = Q[u], Q[v]
        x, y, z = Pl[v]
        return ((q[0] + r[0]) * x * x + 2 * (q[1] + r[1]) * x * y + 2 * (q[2] + r[2]) * x * z + 2 * (q[3] + r[3]) * x
                + (q[4] + r[4]) * y * y + 2 * (q[5] + r[5]) * y * z + 2 * (q[6] + r[6]) * y
                + (q[7] + r[7]) * z * z + 2 * (q[8] + r[8]) * z + q[9] + r[9]
                + (bend * S[u] * (1.0 - dot(Nl[u], Nl[v])) if Nl else 0.0))

    def push(u, v):
        if not fixed[u]: heapq.heappush(heap, (cost(u, v), u, v, stamp[u], stamp[v]))

    def ring(u):
        out = set()
        for f in vf[u]: out.update(Fp[f])
        out.discard(u)
        return out

    def point(f, p):
        fp = Fp[f]
        return Fw[f][0 if fp[0] == p else 1 if fp[1] == p else 2]

    def across(u, y):
        """Whether the edge u-y is a hole's rim or a line between islands (or neither)."""
        fs = vf[u] & vf[y]
        if len(fs) == 1: return True
        if len(fs) != 2: return None
        f, g = fs
        return point(f, u) != point(g, u) or point(f, y) != point(g, y)

    def allowed(u, v):
        """How u's points go onto v's if u is joined onto v, or None if it may not be."""
        mine = vf[u]
        shared = mine & vf[v]
        if not shared or len(shared) > 2 or border[u] != (len(shared) == 1): return None
        onto = {}
        for f in shared:
            a, b = point(f, u), point(f, v)
            if onto.setdefault(a, b) != b: return None
        rest = mine - shared
        for f in rest:
            if point(f, u) not in onto: return None
        far = set()
        for f in shared: far.update(Fp[f])
        far.discard(u); far.discard(v)
        if ring(u) & ring(v) != far: return None
        pv = Pl[v]
        for f in rest:
            fp, fw = Fp[f], Fw[f]
            i = 0 if fp[0] == u else 1 if fp[1] == u else 2
            a, b, c = Pl[fp[0]], Pl[fp[1]], Pl[fp[2]]
            n0 = cross(a, b, c)
            if i == 0: a = pv
            elif i == 1: b = pv
            else: c = pv
            n1 = cross(a, b, c)
            l0, l1 = dot(n0, n0), dot(n1, n1)
            if l1 < 1e-18 or dot(n0, n1) < turn * math.sqrt(l0 * l1): return None
            s, t, r = UVl[fw[0]], UVl[fw[1]], UVl[fw[2]]
            s0 = flat(s, t, r)
            w = onto[fw[i]]
            if i == 0: s = UVl[w]
            elif i == 1: t = UVl[w]
            else: r = UVl[w]
            s1 = flat(s, t, r)
            if s0 * s1 <= 0 or abs(s1) < 1e-14: return None
        if len(onto) == 2 or border[u]:
            # u is on a line between islands (or a hole's rim): the line goes on from u to one other point x, and
            # x-v must stay within uv_tol of u on the picture, on each side
            x = None
            for y in ring(u):
                if y == v: continue
                k = across(u, y)
                if k is None: return None
                if k:
                    if x is not None: return None
                    x = y
            if x is None: return None
            fx = vf[u] & vf[x]
            for a, b in onto.items():
                wx = next((point(f, x) for f in fx if point(f, u) == a), None)
                if wx is None or off_line2(UVl[a], UVl[wx], UVl[b]) > uv_tol2: return None
        return onto

    def join(u, v, onto):
        shared = vf[u] & vf[v]
        for f in shared:
            face[f] = False
            for p in Fp[f]:
                if p != u: vf[p].discard(f)
        for f in vf[u] - shared:
            fp = Fp[f]
            i = fp.index(u)
            fp[i] = v
            Fw[f][i] = onto[Fw[f][i]]
            vf[v].add(f)
        vf[u] = set()
        here[u] = False
        q, r = Q[u], Q[v]
        Q[v] = [r[k] + q[k] for k in range(10)]
        S[v] += S[u]
        stamp[v] += 1
        around = ring(v)
        for x in around: push(v, x)
        for w in around:
            for x in ring(w): push(w, x)
        return len(shared)

    for u in range(nv):
        for v in ring(u): push(u, v)
    left = nf
    while left > target and heap:
        _, u, v, su, sv = heapq.heappop(heap)
        if not (here[u] and here[v]) or stamp[u] != su or stamp[v] != sv: continue
        onto = allowed(u, v)
        if onto is not None: left -= join(u, v, onto)
    return np.array([Fw[f] for f in range(nf) if face[f]], dtype=np.int64)


def cross(a, b, c):
    ux, uy, uz = b[0] - a[0], b[1] - a[1], b[2] - a[2]
    vx, vy, vz = c[0] - a[0], c[1] - a[1], c[2] - a[2]
    return (uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx)


def dot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def flat(a, b, c):
    """Twice the area of a triangle on the picture, signed by which way round it goes."""
    return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])


def off_line2(p, a, b):
    """The squared distance of p from the line from a to b (on the picture)."""
    dx, dy = b[0] - a[0], b[1] - a[1]
    L = dx * dx + dy * dy
    t = 0.0 if L < 1e-30 else max(0.0, min(1.0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L))
    ex, ey = p[0] - a[0] - t * dx, p[1] - a[1] - t * dy
    return ex * ex + ey * ey


def write(out_dir, pos, nrm, uv, tris, spec, raw, master, note):
    """The light copy in the full copy's layout (sports-model.js), and its numbers."""
    used, tris = np.unique(tris, return_inverse=True)
    tris = tris.reshape(-1, 3)
    n = len(used)
    wide = n > 65535
    P, Nn, T = pos[used], nrm[used], uv[used]
    blob = (P.astype(np.float32).tobytes() + Nn.astype(np.int16).tobytes() + (b'\0\0' * (n % 2))
            + T.astype(np.float32).tobytes() + tris.astype(np.uint32 if wide else np.uint16).tobytes())
    os.makedirs(out_dir, exist_ok=True)
    mesh = f'{ITEM}-far.bin'
    open(os.path.join(out_dir, mesh), 'wb').write(blob)
    ext = P.max(0) - P.min(0)
    made = {
        'tool': TOOL, 'from': spec['files']['mesh'], 'fromSha256': sha(raw), 'master': spec['master'], 'masterSha256': sha(master),
        'vertices': n, 'triangles': int(len(tris)), 'index': 32 if wide else 16, 'parts': ['body'], 'counts': [int(len(tris))],
        'share': round(len(tris) / spec['triangles'], 4), 'fullTriangles': spec['triangles'],
        'size': [round(float(v), 5) for v in ext], **note,
        'files': {'mesh': mesh, 'color1k': spec['files']['color1k'], 'color512': spec['files']['color512']},
        'bytes': len(blob), 'sha256': sha(blob),
    }
    json.dump(made, open(os.path.join(out_dir, f'{ITEM}-far.json'), 'w'), indent=1)
    return made


def main(args):
    share, out_dir, bend = SHARE, GAME, BEND
    if '--share' in args: share = float(args[args.index('--share') + 1])
    if '--bend' in args: bend = float(args[args.index('--bend') + 1])
    if '--out' in args: out_dir = os.path.abspath(args[args.index('--out') + 1])
    pos, nrm, uv, idx, spec, raw, master = read_full()
    pid, P = places(pos)
    # (each place's normal: his points at one place differ only in their places on the picture)
    normals = np.zeros((len(P), 3)); normals[pid] = nrm / 32767.0
    normals /= np.maximum(np.linalg.norm(normals, axis=1, keepdims=True), 1e-9)
    T = pid[idx]
    tiny, pieces = small_pieces(P, T)
    F = idx[~tiny]
    target = int(round(spec['triangles'] * share))
    t0 = time.time()
    tris = simplify(P, pid, uv, F, target, normals=normals, bend=bend)
    note = {'leftOut': {'pieces': pieces, 'triangles': int(tiny.sum()), 'under': SMALLEST}}
    made = write(out_dir, pos, nrm, uv, tris, spec, raw, master, note)
    print(f"{ITEM}-far: {made['triangles']} triangles of {spec['triangles']} ({made['share']:.0%}), {made['vertices']} points; "
          f"{pieces} pieces under {SMALLEST} m left out ({int(tiny.sum())} triangles); {time.time() - t0:.0f} s; "
          f"{made['bytes'] / 1e3:.0f} kB -> {out_dir}", flush=True)
    return made


if __name__ == '__main__':
    main(sys.argv[1:])
