"""Cuts cloth and skin to the skeleton.

Everything here is drawn round the body in the natural pose: a table of the
trunk's girth at each height, and the radius of each limb along its bone.
A garment is that body plus ease, to a length, with sleeves or legs to match.
"""
import numpy as np
import meshkit as mk
from loft import ellipse, circle, tube, profile, smoothstep, lerp, disc, strip
from kit import SLOTS

SKIN = SLOTS['skin']
A, B, C, D = SLOTS['a'], SLOTS['b'], SLOTS['c'], SLOTS['d']

# The trunk: height, half-width, depth in front, depth behind, centre front-to-back.
TRUNK = np.array([
    (0.84, 0.148, 0.092, 0.104, -0.004),
    (0.90, 0.162, 0.100, 0.118, -0.006),
    (0.96, 0.166, 0.104, 0.120, -0.005),
    (1.02, 0.156, 0.106, 0.106, 0.000),
    (1.09, 0.147, 0.106, 0.097, 0.003),
    (1.17, 0.152, 0.110, 0.098, 0.006),
    (1.25, 0.163, 0.118, 0.104, 0.008),
    (1.33, 0.173, 0.118, 0.108, 0.008),
    (1.39, 0.181, 0.108, 0.106, 0.008),
    (1.44, 0.187, 0.090, 0.094, 0.009),
    (1.474, 0.176, 0.074, 0.080, 0.012),
    (1.496, 0.122, 0.060, 0.066, 0.017),
    (1.512, 0.070, 0.054, 0.052, 0.024),
])
NECK = (1.512, 0.070, 0.054, 0.052, 0.024)

# How far out the legs reach at each height, for anything that hangs round both.
LEGS_REACH = np.array([(0.05, 0.142, 0.085, 0.075), (0.13, 0.136, 0.080, 0.070), (0.32, 0.150, 0.082, 0.085), (0.50, 0.152, 0.085, 0.078), (0.70, 0.160, 0.094, 0.094), (0.88, 0.164, 0.100, 0.114), (0.96, 0.166, 0.104, 0.120)])


class Tailor:
    def __init__(self, rig, coarse=False):
        self.rig = rig
        self.nb = rig.n
        # how many points round a trunk, an arm and a leg; fewer for the copies seen from further off
        self.coarse = coarse
        self.KT, self.KA, self.KL = (10, 6, 6) if coarse else (18, 10, 12)
        j = rig.joint
        self.side = {}
        for s, sign in (('L', 1), ('R', -1)):
            S = j(f'UpperArm_{s}'); E = j(f'Forearm_{s}'); Wj = j(f'Hand_{s}')
            # the hand's wrist opening sits a little way up the forearm from the joint
            rim = Wj + np.array([-0.026 * sign, 0.022, -0.025])
            H = j(f'Thigh_{s}'); Kn = j(f'Shin_{s}'); An = j(f'Foot_{s}'); Toe = j(f'Toe_{s}')
            self.side[s] = dict(sign=sign, S=S, E=E, Wj=Wj, rim=rim, H=H, K=Kn, A=An, T=Toe)

    # ------------------------------------------------------------ weights --
    def w(self, **named):
        return self.rig.weights(**named)

    def trunk_w(self, y):
        """Whose bone a point of the trunk at height y belongs to."""
        a = smoothstep(0.99, 1.11, y); b = smoothstep(1.15, 1.31, y)
        w = np.zeros(self.nb); I = self.rig.index
        w[I['Hips']] = 1 - a; w[I['Spine']] = a * (1 - b); w[I['Chest']] = a * b
        return w

    def hang_w(self, ring, free=0.0):
        """Weights for cloth hanging round both legs: each side follows its own leg. `free` leaves that share on the hips."""
        I = self.rig.index
        out = np.zeros((len(ring), self.nb))
        for k, p in enumerate(ring):
            y = p[1]
            if y >= 0.955: out[k] = self.trunk_w(y); continue
            hips = max(free, smoothstep(0.78, 0.955, y))
            left = smoothstep(-0.075, 0.075, p[0])
            shin = 1 - smoothstep(0.40, 0.58, y)
            legs = 1 - hips
            out[k, I['Hips']] = hips
            out[k, I['Thigh_L']] = legs * left * (1 - shin); out[k, I['Thigh_R']] = legs * (1 - left) * (1 - shin)
            out[k, I['Shin_L']] = legs * left * shin; out[k, I['Shin_R']] = legs * (1 - left) * shin
        return out

    # -------------------------------------------------------------- trunk --
    def body_ring(self, y, ease=0.0, K=None, extra_x=0.0, extra_zf=0.0, extra_zb=0.0, square=1.0, folds=None, tilt=0.0, legs=True, cz_shift=0.0):
        """The trunk's outline at height y, let out by `ease`. Below the hips it is the outline round both legs."""
        K = K or self.KT
        if y >= 0.96 or not legs:
            rx, zf, zb, cz = profile(TRUNK, max(y, TRUNK[0, 0]))
        else:
            rx, zf, zb = profile(LEGS_REACH, y); cz = 0.004
        return ellipse(y, rx + ease + extra_x, zf + ease + extra_zf, zb + ease + extra_zb, cz=cz + cz_shift, K=K, square=square, folds=folds, tilt=tilt)

    def column(self, hem, top=1.512, ease=0.012, K=None, slot=A, flare=0.0, flare_from=1.0, flare_z=None, folds=None, stations=None, shoulder=0.0, neck=None,
               free=0.0, tiles=None, ease_fn=None, square=1.0, hem_tilt=0.0, shade_fn=None, wide_shoulder=0.0, slot_fn=None):
        """A garment's main piece: a column of cloth round the trunk from `hem` up to `top`.

        `flare` lets it out toward the hem, starting at `flare_from`. `shoulder` raises and widens the shoulder line
        for stiff or roomy cloth. `neck` = (rx, rzf, rzb) of the neck opening. `free` is how far the cloth below the
        hips ignores the legs (0 follows them, 1 hangs from the hips).
        """
        K = K or self.KT
        ys = stations or self._stations(hem, top, self.coarse)
        rings = []; weights = []; shades = []; slots = []
        for y in ys:
            e = ease_fn(y) if ease_fn else ease
            out = max(0.0, (flare_from - y) / max(flare_from - hem, 1e-6)) if y < flare_from else 0.0
            fx = flare * out; fz = (flare if flare_z is None else flare_z) * out
            f = None
            if folds and y < flare_from: f = (folds[0], folds[1] * out)
            ex = fx; ezf = fz; ezb = fz
            if y > 1.40:
                k = smoothstep(1.40, 1.47, y) * (1 - smoothstep(1.485, 1.512, y))
                ex += (shoulder + wide_shoulder) * k; ezf += shoulder * 0.4 * k; ezb += shoulder * 0.4 * k
            ring = self.body_ring(y, e, K=K, extra_x=ex, extra_zf=ezf, extra_zb=ezb, square=square, folds=f, tilt=hem_tilt if y == ys[0] else 0.0)
            if y >= 1.505 and neck:
                ring = ellipse(y, neck[0], neck[1], neck[2], cz=NECK[4], K=K)
            rings.append(ring)
            weights.append(self.hang_w(ring, free) if y < 0.955 else self.trunk_w(y))
            shades.append(shade_fn(y) if shade_fn else 1.0)
            slots.append(slot_fn(y) if slot_fn else slot)
        kw = {'tiles': tiles} if tiles else {}
        return tube(rings, weights, slot=slots, shade=shades, nbones=self.nb, **kw)

    @staticmethod
    def _stations(hem, top, coarse=False):
        marks = [0.06, 0.13, 0.22, 0.32, 0.42, 0.50, 0.58, 0.66, 0.74, 0.82, 0.88, 0.92, 0.96, 1.00, 1.045, 1.09, 1.13, 1.17, 1.21, 1.25, 1.29, 1.33, 1.365, 1.40, 1.44, 1.474, 1.496, 1.512]
        if coarse: marks = [0.13, 0.32, 0.50, 0.70, 0.88, 0.96, 1.09, 1.25, 1.39, 1.474, 1.496, 1.512]
        ys = [hem] + [m for m in marks if hem + 0.025 < m < top - 0.008] + [top]
        return ys

    # --------------------------------------------------------------- arms --
    def arm_point(self, s, u):
        """A point down the arm: u = 0 at the shoulder, 1 at the elbow, 2 at the wrist opening of the hand."""
        d = self.side[s]
        return lerp(d['S'], d['E'], u) if u <= 1 else lerp(d['E'], d['rim'], u - 1)

    def arm_axis(self, s, u):
        d = self.side[s]
        a = d['E'] - d['S']; b = d['rim'] - d['E']
        a /= np.linalg.norm(a); b /= np.linalg.norm(b)
        k = smoothstep(0.8, 1.2, u)
        v = lerp(a, b, k); return v / np.linalg.norm(v)

    def arm_w(self, s, u):
        I = self.rig.index; w = np.zeros(self.nb)
        chest = 0.55 * (1 - smoothstep(0.0, 0.28, u))
        fore = smoothstep(0.84, 1.16, u)
        hand = 0.5 * smoothstep(1.86, 2.0, u)
        w[I['Chest']] = chest; w[I[f'UpperArm_{s}']] = (1 - chest) * (1 - fore)
        w[I[f'Forearm_{s}']] = (1 - chest) * fore * (1 - hand); w[I[f'Hand_{s}']] = (1 - chest) * fore * hand
        return w

    @staticmethod
    def arm_radius(u):
        """The bare arm's radius down its length."""
        return float(np.interp(u, [0, 0.25, 0.7, 1.0, 1.25, 1.6, 2.0], [0.052, 0.049, 0.042, 0.039, 0.041, 0.035, 0.0285]))

    def arm(self, s, start=0.0, end=2.0, ease=0.0, ease_end=None, K=None, slot=A, cap=True, steps=None, shade=1.0, cuff=None, end_closed=False, flat=0.92, slot_fn=None):
        """A sleeve or a bare arm from `start` to `end` (see arm_point). `cuff` = (length, extra radius, slot) ends it in a band."""
        ease_end = ease if ease_end is None else ease_end
        K = K or self.KA
        us = steps or [u for u in ([0.0, 0.3, 0.7, 1.0, 1.3, 1.7, 2.0] if self.coarse else [0.0, 0.14, 0.3, 0.5, 0.7, 0.86, 1.0, 1.14, 1.3, 1.5, 1.7, 1.86, 2.0]) if start - 1e-6 <= u <= end + 1e-6]
        if us[0] > start + 1e-6: us = [start] + us
        if us[-1] < end - 1e-6: us = us + [end]
        rings = []; weights = []; slots = []
        sign = self.side[s]['sign']
        front = np.array([0.0, 0.0, 1.0])
        if cap and start <= 0.0:
            S = self.side[s]['S']; r0 = self.arm_radius(0) + ease * 0.45
            up = np.array([0.62 * sign, 0.78, 0.0]); up /= np.linalg.norm(up)
            for h, k in ((0.70, 0.34), (0.50, 0.72), (0.22, 0.95)):
                rings.append(circle(S + up * r0 * h + np.array([0.004 * sign, 0, 0]), -up, r0 * k, K=K, front=front, flat=1.0))
                weights.append(self.w(Chest=0.6, **{f'UpperArm_{s}': 0.4})); slots.append(slot)
        for u in us:
            t = 0.0 if end == start else (u - start) / (end - start)
            # a sleeve is set in close at the shoulder and takes its ease below it
            r = self.arm_radius(u) + lerp(ease, ease_end, t) * (0.45 + 0.55 * smoothstep(0.0, 0.32, u))
            rings.append(circle(self.arm_point(s, u), self.arm_axis(s, u), r, K=K, front=front, flat=flat if u > 1.1 else 1.0))
            weights.append(self.arm_w(s, u)); slots.append(slot_fn(u) if slot_fn else slot)
        if cuff:
            length, extra, cslot = cuff
            u = us[-1]; ax = self.arm_axis(s, u); p = self.arm_point(s, u); r = self.arm_radius(u) + ease_end + extra
            for dd in (0.0, length):
                rings.append(circle(p + ax * dd, ax, r, K=K, front=front, flat=flat if u > 1.1 else 1.0)); weights.append(self.arm_w(s, u)); slots.append(cslot)
        return tube(rings, weights, slot=slots, shade=shade, cap_start=cap and start <= 0.0, cap_end=end_closed, nbones=self.nb)

    def arms(self, **kw):
        return mk.merge([self.arm('L', **kw), self.arm('R', **kw)])

    # --------------------------------------------------------------- legs --
    def leg_point(self, s, u):
        """A point down the leg: u = 0 at the hip, 1 at the knee, 2 at the ankle."""
        d = self.side[s]
        return lerp(d['H'], d['K'], u) if u <= 1 else lerp(d['K'], d['A'], u - 1)

    def leg_axis(self, s, u):
        d = self.side[s]
        a = d['K'] - d['H']; b = d['A'] - d['K']
        a /= np.linalg.norm(a); b /= np.linalg.norm(b)
        v = lerp(a, b, smoothstep(0.85, 1.15, u)); return v / np.linalg.norm(v)

    def leg_w(self, s, u):
        I = self.rig.index; w = np.zeros(self.nb)
        hips = 0.5 * (1 - smoothstep(0.02, 0.24, u))
        shin = smoothstep(0.88, 1.12, u)
        foot = 0.5 * smoothstep(1.9, 2.02, u)
        w[I['Hips']] = hips; w[I[f'Thigh_{s}']] = (1 - hips) * (1 - shin)
        w[I[f'Shin_{s}']] = (1 - hips) * shin * (1 - foot); w[I[f'Foot_{s}']] = (1 - hips) * shin * foot
        return w

    @staticmethod
    def leg_radius(u):
        return float(np.interp(u, [0.0, 0.12, 0.5, 0.9, 1.0, 1.1, 1.35, 1.7, 2.0], [0.084, 0.086, 0.074, 0.058, 0.056, 0.055, 0.058, 0.046, 0.039]))

    def leg(self, s, start=0.12, end=2.0, ease=0.0, ease_end=None, K=None, slot=A, shade=1.0, steps=None, cuff=None, slot_fn=None, end_closed=False):
        ease_end = ease if ease_end is None else ease_end
        K = K or self.KL
        us = steps or [u for u in ([0.12, 0.5, 0.86, 1.0, 1.14, 1.55, 2.0] if self.coarse else [0.12, 0.3, 0.5, 0.7, 0.86, 1.0, 1.14, 1.35, 1.55, 1.75, 1.92, 2.0]) if start - 1e-6 <= u <= end + 1e-6]
        if us[0] > start + 1e-6: us = [start] + us
        if us[-1] < end - 1e-6: us = us + [end]
        rings = []; weights = []; slots = []
        sign = self.side[s]['sign']
        for u in us:
            t = 0.0 if end == start else (u - start) / (end - start)
            # a trouser leg starts close under the seat and takes its ease below it, so it stays inside a shirt worn over it
            r = self.leg_radius(u) + lerp(ease, ease_end, t) * (0.3 + 0.7 * smoothstep(0.16, 0.5, u))
            c = self.leg_point(s, u)
            if u < 0.3:
                # the top of the thigh leans into the hips, so it is hidden inside the seat
                c = c + np.array([0.004 * sign, 0, -0.004]) * (0.3 - u) / 0.3
            rings.append(circle(c, self.leg_axis(s, u), r, K=K, front=(0, 0, 1), rb=r * (1.08 if u < 0.6 else 1.0)))
            weights.append(self.leg_w(s, u)); slots.append(slot_fn(u) if slot_fn else slot)
        if cuff:
            length, extra, cslot = cuff
            u = us[-1]; ax = self.leg_axis(s, u); p = self.leg_point(s, u); r = self.leg_radius(u) + ease_end + extra
            for dd in (0.0, length):
                rings.append(circle(p + ax * dd, ax, r, K=K, front=(0, 0, 1))); weights.append(self.leg_w(s, u)); slots.append(cslot)
        return tube(rings, weights, slot=slots, shade=shade, cap_end=end_closed, nbones=self.nb)

    def legs(self, **kw):
        return mk.merge([self.leg('L', **kw), self.leg('R', **kw)])

    def seat(self, waist=1.04, ease=0.012, K=None, slot=A, band=None):
        """The part of trousers or shorts round the hips, from the waist down to where the legs part."""
        K = K or self.KT
        ys = [0.865, 0.90, 0.94, 0.98, 1.02, waist] if waist > 1.03 else [0.865, 0.90, 0.94, 0.98, waist]
        rings = []; weights = []; slots = []
        for y in ys:
            ring = self.body_ring(y, ease, K=K, legs=False)
            if y < 0.89:
                ring[:, 0] *= 0.93          # closes in under the seat
            rings.append(ring)
            w = self.trunk_w(y) if y >= 0.95 else self._seat_w(ring, y)
            weights.append(w); slots.append(slot)
        if band:
            rings.append(self.body_ring(waist + band[0], ease + 0.002, K=K, legs=False)); weights.append(self.trunk_w(waist)); slots.append(band[1])
            slots[-2] = band[1]
        return tube(rings, weights, slot=slots, cap_start=True, nbones=self.nb)

    def _seat_w(self, ring, y):
        I = self.rig.index; out = np.zeros((len(ring), self.nb))
        legs = 0.5 * (1 - smoothstep(0.86, 0.95, y))
        for k, p in enumerate(ring):
            left = smoothstep(-0.06, 0.06, p[0])
            out[k, I['Hips']] = 1 - legs; out[k, I['Thigh_L']] = legs * left; out[k, I['Thigh_R']] = legs * (1 - left)
        return out

    # --------------------------------------------------------------- feet --
    def foot_frame(self, s):
        d = self.side[s]
        f = d['T'] - d['A']; f[1] = 0; f /= np.linalg.norm(f)
        right = np.cross([0, 1, 0], f)
        return d['A'], f, right

    def foot_loft(self, s, stations, slot, y0=0.0, K=None, shade=1.0, close=True, lift=0.0):
        """A shape drawn along the foot: stations are (distance forward of the ankle, width, height). Flat underneath."""
        K = K or (6 if self.coarse else 10)
        A_, f, right = self.foot_frame(s)
        rings = []
        for dist, wdt, hgt in stations:
            c = np.array([A_[0], y0 + lift, A_[2]]) + f * dist
            t = np.linspace(0, 2 * np.pi, K + 1)
            x = np.cos(t) * wdt / 2
            y = np.where(np.sin(t) >= 0, np.sin(t) * hgt, np.sin(t) * 0.0)
            ring = c + np.outer(x, right) + np.outer(y, [0, 1, 0])
            ring[-1] = ring[0]
            rings.append(ring)
        w = self.w(**{f'Foot_{s}': 1})
        return tube(rings, [w] * len(rings), slot=slot, shade=shade, cap_start=close, cap_end=close, nbones=self.nb)

    def sole(self, s, stations, thick=0.022, slot=B, welt=0.004, y0=0.0, K=14):
        """A slab under the foot following its outline."""
        A_, f, right = self.foot_frame(s)
        n = len(stations)
        left_edge = [np.array([A_[0], 0, A_[2]]) + f * d + right * (w / 2 + welt) for d, w, _ in stations]
        right_edge = [np.array([A_[0], 0, A_[2]]) + f * d - right * (w / 2 + welt) for d, w, _ in stations]
        loop = np.array(left_edge + right_edge[::-1] + [left_edge[0]])
        rings = []
        for y in (y0, y0 + thick):
            r = loop.copy(); r[:, 1] = y; rings.append(r)
        w = self.w(**{f'Foot_{s}': 1})
        return tube(rings, [w, w], slot=slot, cap_start=True, cap_end=True, nbones=self.nb)

    # ------------------------------------------------------------ details --
    def on_front(self, y, x=0.0, ease=0.012, extra=0.0):
        """The point on the front of a garment's column at height y and offset x, and the outward direction there."""
        rx, zf, zb, cz = profile(TRUNK, y) if y >= 0.96 else (*profile(LEGS_REACH, y), 0.004)
        rx += ease + extra; zf += ease + extra
        x = np.clip(x, -rx * 0.98, rx * 0.98)
        z = cz + zf * np.sqrt(max(0.0, 1 - (x / rx) ** 2))
        n = np.array([x / (rx * rx), 0.0, (z - cz) / (zf * zf)]); n /= np.linalg.norm(n)
        return np.array([x, y, z]), n

    def buttons(self, ys, x=0.0, ease=0.012, r=0.007, slot=C, extra=0.0):
        if self.coarse: return None
        out = []
        for y in ys:
            p, n = self.on_front(y, x, ease, extra)
            out.append(disc(p, n, r, slot=slot, weights=self.trunk_w(y) if y >= 0.955 else self.w(Hips=1), nbones=self.nb))
        return mk.merge(out)

    def patch(self, y0, y1, x0, x1, ease=0.012, slot=B, lift=0.004, nx=4, ny=3, shade=1.0, extra=0.0):
        """A piece of cloth lying on the front of a garment: a pocket, a panel of embroidery, a badge."""
        pts = []; W = []
        for j in range(ny + 1):
            y = lerp(y0, y1, j / ny)
            for i in range(nx + 1):
                p, n = self.on_front(y, lerp(x0, x1, i / nx), ease, extra)
                pts.append(p + n * lift); W.append(self.trunk_w(y) if y >= 0.955 else self.w(Hips=1))
        idx = []
        for j in range(ny):
            for i in range(nx):
                a = j * (nx + 1) + i; b = a + 1; c = b + nx + 1; d = a + nx + 1
                idx += [[a, b, c], [a, c, d]]
        pts = np.array(pts)
        m = mk.make(pts, np.array(idx), slot=slot, shade=shade, uv=np.c_[pts[:, 0], pts[:, 1]] * 3.2)
        mk.set_weights(m, np.array(W), self.nb)
        if m['nrm'][:, 2].mean() < 0: m['idx'] = m['idx'][:, ::-1].copy(); mk.smooth_normals(m)
        return m

    def band(self, y, height, ease=0.014, slot=B, K=None, shade=1.0):
        """A belt, a sash or a waistband: a short ring of cloth round the trunk."""
        K = K or self.KT
        rings = [self.body_ring(y, ease, K=K, legs=False), self.body_ring(y + height, ease, K=K, legs=False)]
        return tube(rings, [self.trunk_w(y), self.trunk_w(y + height)], slot=slot, shade=shade, nbones=self.nb)

    def collar(self, height=0.03, spread=0.012, slot=A, K=None, stand=0.0, open_front=0.0, shade=1.0):
        """A collar round the neck. `stand` > 0 makes it stand up (a band); otherwise it folds down and out."""
        K = K or (8 if self.coarse else 16)
        y, rx, zf, zb, cz = NECK
        if stand > 0:
            rings = [ellipse(y - 0.004, rx + 0.004, zf + 0.004, zb + 0.004, cz=cz, K=K), ellipse(y + stand, rx - 0.006, zf - 0.004, zb - 0.002, cz=cz + 0.002, K=K)]
        else:
            rings = [ellipse(y + 0.012, rx - 0.004, zf - 0.002, zb, cz=cz, K=K), ellipse(y + 0.004, rx + spread * 0.6, zf + spread * 0.5, zb + spread * 0.4, cz=cz, K=K), ellipse(y - height, rx + spread * 1.6, zf + spread * 1.3, zb + spread * 0.8, cz=cz, K=K)]
        w = self.w(Chest=0.7, Neck=0.3)
        m = tube(rings, [w] * len(rings), slot=slot, shade=shade, nbones=self.nb)
        if open_front > 0:
            keep = ~((np.abs(m['pos'][m['idx']][:, :, 0]).max(1) < open_front) & (m['pos'][m['idx']][:, :, 2].min(1) > cz))
            m = mk.take(m, keep)
        return m


def paint(m, test, slot, inset=0.0, detail=None):
    """Repaints the part of a mesh where test(pos) > 0, with a clean edge. `inset` sinks it a little below the rest.

    `detail` is the longest edge allowed near the edge of the paint; a coarse mesh is made finer there first,
    so that a thin stroke is not lost between its points.
    """
    if detail: m = mk.refine(m, test, detail)
    value = test(m['pos'])
    cut, high = mk.split_by(m, value, 0.0)
    out = mk.split_slots(cut, high, slot)
    if inset:
        sel = out['slot'] == slot
        out['pos'][sel] -= out['nrm'][sel] * inset
    return out
