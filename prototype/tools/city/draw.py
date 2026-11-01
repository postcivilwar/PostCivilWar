"""Draws the Step 0 plan (plan.py) over the game's map: north up, east right."""
import math
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon, Rectangle, Circle, FancyBboxPatch
from matplotlib.lines import Line2D
import matplotlib.patheffects as pe
import plan as P

Z = P.Z
COL = dict(
    land='#efe9da', town='#ddd5c3', river='#9fc8e6', anambra='#e7e3d6', habitation='#cfe5c2', airport='#e2e1dc',
    runway='#8d8f93', compound='#e5dac6', oldroad='#8e9095', laterite='#b9805a', path='#cdb991', oldfence='#8c7d64',
    exp='#34363b', avenue='#55585e', street='#6c7077', median='#86b35f', trees='#24642a', raised='#f08c2e',
    upper='#d6312b', cut='#7b4fa3', ramp0='#6c7077', tower='#1d3557', towerEdge='#9fb3cf', gold='#e3a800',
    fence='#5b4a35', closed='#c62828', text='#1f1f1f', muted='#6d6455',
)
WIDTH = dict(expressway=36, avenue=22, street=16, link=12, ramp=8)


class Map:
    def __init__(self, ax, ppm, scale=1.0):
        self.ax, self.ppm, self.k = ax, ppm, scale

    def lw(self, metres):
        return max(0.4, metres * self.ppm)

    def line(self, pts, metres, colour, z, ls='-', cap='butt', alpha=1, dashes=None, join='round'):
        xs = [p[1] for p in pts]; ys = [p[0] for p in pts]
        ln, = self.ax.plot(xs, ys, color=colour, lw=self.lw(metres), solid_capstyle=cap, solid_joinstyle=join, zorder=z, alpha=alpha, ls=ls)
        if dashes: ln.set_dashes(dashes)
        return ln

    def rect(self, x0, z0, x1, z1, fc, ec='none', z=1, lw=0.6, alpha=1, ls='-', hatch=None):
        r = Rectangle((min(z0, z1), min(x0, x1)), abs(z1 - z0), abs(x1 - x0), fc=fc, ec=ec, lw=lw, zorder=z, alpha=alpha, ls=ls, hatch=hatch)
        self.ax.add_patch(r); return r

    def poly(self, pts, fc, ec='none', z=1, lw=0.6, alpha=1, ls='-'):
        p = Polygon([(b, a) for a, b in pts], closed=True, fc=fc, ec=ec, lw=lw, zorder=z, alpha=alpha, ls=ls)
        self.ax.add_patch(p); return p

    def text(self, x, z, s, size, colour=None, z_=30, rot=0, weight='normal', style='normal', ha='center', va='center', halo=True, alpha=1, box=False):
        t = self.ax.text(z, x, s, fontsize=size * self.k, color=colour or COL['text'], rotation=rot, ha=ha, va=va, zorder=z_, fontweight=weight, fontstyle=style, alpha=alpha, clip_on=True,
                         bbox=dict(boxstyle='round,pad=0.3', fc='white', ec='none', alpha=0.82) if box else None)
        if halo and not box: t.set_path_effects([pe.withStroke(linewidth=2.6 * self.k, foreground='white', alpha=0.85)])
        return t


def segment(pts, frm, to, along_x):
    """The part of a straight road between two values along it."""
    (ax_, az), (bx, bz) = pts[0], pts[-1]
    lo, hi = min(frm, to), max(frm, to)
    if along_x:
        return [(lo, az), (hi, az)]
    return [(ax_, lo), (ax_, hi)]


def draw_existing(m, detail):
    ax = m.ax
    # the river and the land across it
    xs = [(-1700 + i * 10) for i in range(int((534 + 1700) / 10) + 1)]
    shore = [(x, 150 + 5 * math.sin(x / 37) + 3 * math.sin(x / 11 + 1)) for x in xs]
    m.poly([(x, 900) for x in xs[::-1]] + [(xs[0], 300), (xs[-1], 300)][::-1] + [], COL['anambra'], z=1)
    m.rect(-1700, 300, 1300, 900, COL['anambra'], z=1)
    m.poly(shore + [(534, 300), (-1700, 300)], COL['river'], z=2)
    # the habitation
    hb = Z['HABITATION']['bounds']
    m.rect(290, -262, 1060, 552, COL['habitation'], ec='#7aa56a', z=2, lw=0.8)
    # the town
    m.rect(-248.6, -478.6, 248.6, 150, COL['town'], z=3)
    for r in Z['ZONE_ROADS']:
        c = COL['oldroad'] if r['surface'] == 'asphalt' else COL['laterite'] if r['surface'] == 'laterite' else COL['path']
        m.rect(r['x0'], r['z0'], r['x1'], r['z1'], c, z=4)
    for b in Z['TOWER_BOXES']:
        m.rect(b['x0'], b['z0'], b['x1'], b['z1'], '#7d8796', z=5)
    # the Kwale road, the airport, the showrooms, the sports mall, the bridge, the far bank, the habitation's road
    for r in Z['OUTSKIRT_ROADS']:
        m.rect(r['x0'], r['z0'], r['x1'], r['z1'], COL['oldroad'] if not r.get('bays') else '#a3a5a9', z=4)
    a = Z['AIRPORT']
    m.rect(-1158.6, -508.6, -561.4, -21.4, COL['airport'], ec=COL['oldfence'], z=3, lw=0.6)
    m.rect(a['runway']['x0'], a['runway']['z0'], a['runway']['x1'], a['runway']['z1'], COL['runway'], z=4)
    m.rect(a['taxiway']['x0'], a['taxiway']['z0'], a['taxiway']['x1'], a['taxiway']['z1'], '#a3a5a9', z=4)
    for l in a['links']:
        m.rect(l['x0'], l['z0'], l['x1'], l['z1'], '#a3a5a9', z=4)
    m.rect(a['apron']['x0'], a['apron']['z0'], a['apron']['x1'], a['apron']['z1'], '#b7b8bb', z=4)
    m.rect(a['terminal']['x0'], a['terminal']['z0'], a['terminal']['x1'], a['terminal']['z1'], '#9a8f80', z=5)
    m.rect(-560, -212, -275, -70, COL['compound'], ec='#9a8a70', z=3, lw=0.8)
    m.rect(-702, -182, -588, -72, COL['compound'], ec='#9a8a70', z=3, lw=0.8)
    for u in (Z['UPRIVER']['road'], Z['UPRIVER']['park']):
        m.rect(u['x0'], u['z0'], u['x1'], u['z1'], COL['oldroad'], z=4)
    m.rect(-212, 118, -198, 384, '#7d7f84', z=5)
    m.rect(-235, 322, -175, 384, COL['compound'], z=3)
    # the fences round what is built now
    for e in Z['EDGE_LINES']:
        m.line([(e['a']['x'], e['a']['z']), (e['b']['x'], e['b']['z'])], 1.2, COL['oldfence'], 6, dashes=(3, 2))
    # labels
    s = 1.0 if not detail else 1.15
    m.text(-120, -160, 'THE TOWN', 15 * s, COL['muted'], weight='bold')
    m.text(-150, -160, 'unchanged', 10 * s, COL['muted'], style='italic')
    m.text(95, -30, 'motor park', 8.5 * s, COL['muted'], style='italic')
    m.text(60, 48, 'market', 8.5 * s, COL['muted'], style='italic')
    if not detail:
        m.text(-850, -300, 'AIRPORT', 12, COL['muted'], weight='bold')
        m.text(-417, -141, 'car\nshowroom', 9, COL['muted'], style='italic')
        m.text(-645, -127, 'sports\nmall', 9, COL['muted'], style='italic')
        m.text(-985, -40, 'Asaba–Kwale Road', 8.5, COL['muted'], style='italic')
        m.text(650, 145, 'THE HABITATION', 13, '#4d7a43', weight='bold')
        m.text(-600, 225, 'River Niger', 13, '#3d6f94', style='italic', rot=90)
        m.text(-250, 430, 'Anambra side\n(across the river)', 10, COL['muted'], style='italic')
        m.text(-205, 260, 'bridge', 8.5, COL['muted'], style='italic', rot=90)
    else:
        m.text(-150, -395, 'Umuaji and Ugbomanta lanes', 8, COL['muted'], style='italic')


def draw_new(m, detail):
    # districts
    for (_id, name, what, outline, colour) in P.DISTRICTS:
        m.poly(outline, colour, z=2.5, alpha=0.10)
        m.poly(outline, 'none', ec=colour, z=2.6, lw=1.2, alpha=0.6, ls='--')
    # the stretches raised or sunk: casings under the road
    by_id = {r['id']: r for r in P.ROADS}
    for (rid, frm, to, level, _note) in P.LEVELS:
        r = by_id[rid]
        along_x = abs(r['pts'][0][0] - r['pts'][-1][0]) > abs(r['pts'][0][1] - r['pts'][-1][1])
        seg = segment(r['pts'], frm, to, along_x)
        colour = COL['raised'] if level == 1 else COL['cut']
        m.line(seg, WIDTH[r['kind']] + 16, colour, 7)
    # ramps under the roads they leave (their casings by level)
    for rp in P.RAMPS:
        if rp['level'] >= 1:
            m.line(rp['pts'], 15, COL['raised'] if rp['level'] == 1 else COL['upper'], 7.5 + rp['level'] * 2)
        m.line(rp['pts'], 7, COL['avenue'], 7.6 + rp['level'] * 2)
    # roads
    for r in P.ROADS:
        w = WIDTH[r['kind']]
        if r['kind'] == 'expressway':
            m.line(r['pts'], w, COL['exp'], 8)
            m.line(r['pts'], 1.2, '#d9d9d9', 8.2)
        elif r['kind'] == 'avenue':
            m.line(r['pts'], w, COL['avenue'], 8)
            m.line(r['pts'], 5, COL['median'], 8.2)
            if r['trees']:
                m.line(r['pts'], 3.2, COL['trees'], 8.3, dashes=(0.6, 1.4) if not detail else (0.9, 1.6))
        elif r['kind'] == 'street':
            m.line(r['pts'], w, COL['street'], 7.9)
        else:
            m.line(r['pts'], w, COL['avenue'], 8)
    # the flyovers' decks again on top where they cross (so the raised road is seen over the one below)
    for (rid, frm, to, level, _note) in P.LEVELS:
        if level != 1: continue
        r = by_id[rid]
        along_x = abs(r['pts'][0][0] - r['pts'][-1][0]) > abs(r['pts'][0][1] - r['pts'][-1][1])
        seg = segment(r['pts'], frm, to, along_x)
        m.line(seg, WIDTH[r['kind']] + 16, COL['raised'], 9)
        m.line(seg, WIDTH[r['kind']], COL['exp'] if r['kind'] == 'expressway' else COL['avenue'], 9.1)
        if r['kind'] == 'avenue':
            m.line(seg, 2.0, '#bdbdbd', 9.2)
    # upper ramps on top of everything
    for rp in P.RAMPS:
        if rp['level'] == 2:
            m.line(rp['pts'], 15, COL['upper'], 11)
            m.line(rp['pts'], 7, COL['avenue'], 11.1)
    # roundabouts
    for (_id, name, x, z, r) in P.ROUNDABOUTS:
        m.ax.add_patch(Circle((z, x), r + 6, fc=COL['avenue'], ec='none', zorder=10))
        m.ax.add_patch(Circle((z, x), r - 6, fc=COL['median'], ec='none', zorder=10.1))
    # towers
    for i, (x, z, w, d, kind) in enumerate(P.TOWERS):
        stage1 = i in P.STAGE1_TOWERS
        ec = COL['gold'] if stage1 else COL['towerEdge']
        if kind == 'round':
            m.ax.add_patch(Circle((z, x), w / 2, fc=COL['tower'], ec=ec, lw=1.4 if stage1 else 0.6, zorder=12))
        else:
            fc = {'glass': '#1d3557', 'ribbed': '#5e6b7d', 'stone': '#6b5a48', 'office': '#2c6e8f'}[kind]
            m.rect(x - d / 2, z - w / 2, x + d / 2, z + w / 2, fc, ec=ec, z=12, lw=1.4 if stage1 else 0.6)
    # the edge of the built land: fenced
    m.line(P.FENCE, 2.5, COL['fence'], 13, dashes=(5, 3))
    m.line(P.FENCE_POCKET, 2.5, COL['fence'], 13, dashes=(5, 3))
    # roads closed for now (a roadblock): a red bar across the road's end
    for (_id, x, z, along_x) in P.CLOSED:
        if along_x:
            m.line([(x, z - 18), (x, z + 18)], 6, COL['closed'], 14)
        else:
            m.line([(x - 18, z), (x + 18, z)], 6, COL['closed'], 14)
    # the Stage 1 sample
    xs = [p[0] for p in P.STAGE1]; zs = [p[1] for p in P.STAGE1]
    m.ax.add_patch(FancyBboxPatch((min(zs), min(xs)), max(zs) - min(zs), max(xs) - min(xs), boxstyle='round,pad=0,rounding_size=40', fc='none', ec=COL['gold'], lw=2.2, ls=(0, (6, 3)), zorder=15))


def badge(m, x, z, label, colour, size=8.5, r=None):
    (z0, z1), (x0, x1) = m.ax.get_xlim(), m.ax.get_ylim()
    if not (z0 + 15 < z < z1 - 15 and x0 + 15 < x < x1 - 15):
        return None
    t = m.ax.text(z, x, label, fontsize=size * m.k, color='white', fontweight='bold', ha='center', va='center', zorder=40, clip_on=True,
                  bbox=dict(boxstyle='circle,pad=0.25' if len(label) <= 2 else 'round,pad=0.25', fc=colour, ec='white', lw=1.0))
    return t


def draw_labels(m, detail):
    k = 1.0
    # districts
    for (_id, name, what, outline, colour) in P.DISTRICTS:
        xs = [p[0] for p in outline]; zs = [p[1] for p in outline]
        if _id == 'central':
            cx, cz = -300, -745
            if detail: cx, cz = 300, -1000
        elif _id == 'anwuli':
            cx, cz = 860, -720
        elif _id == 'ihuoma':
            cx, cz = -1010, -960
        else:
            cx, cz = 810, -1380
        if detail and _id in ('ihuoma', 'ugwuoma'):
            if _id == 'ugwuoma': cx, cz = 300, -1400
            else: continue
        boxed = _id == 'central'
        m.text(cx, cz, name, 15 if not detail else 15, colour, weight='bold', z_=35, box=boxed)
        m.text(cx - (40 if not detail else 26), cz, what, 9.5, colour, style='italic', z_=35, box=boxed)
    # road names
    def along(r, at, offset=0, size=8.5, rot=None):
        (ax_, az), (bx, bz) = r['pts'][0], r['pts'][-1]
        if abs(ax_ - bx) > abs(az - bz):    # north-south: the name standing up
            m.text(at, az + offset, r['name'], size, rot=90 if rot is None else rot, z_=33)
        else:
            m.text(ax_ + offset, at, r['name'], size, rot=0 if rot is None else rot, z_=33)
    R = {r['id']: r for r in P.ROADS}
    if not detail:
        along(R['expressway'], 240, -50, 10.5)
        along(R['expressway'], -560, -50, 10.5)
        along(R['unity'], -1390, 34, 9)
        along(R['harmony'], -350, 30, 9)
        along(R['harmony'], -1420, 30, 9)
        along(R['peace'], -1350, 30, 9)
        along(R['campus-link'], 450, 30, 8.5)
        along(R['hope'], -1390, 30, 8.5)
        along(R['gateway'], -1000, -34, 8.5)
        along(R['gateway'], 450, 34, 8.5)
        along(R['independence'], -1050, 34, 8.5)
        along(R['independence'], 300, 34, 8.5)
        along(R['sunrise'], -400, 34, 8.5)
        along(R['sunrise'], 300, 34, 8.5)
    else:
        along(R['expressway'], 560, -44, 10.5)
        along(R['expressway'], -330, -44, 10.5)
        along(R['unity'], -630, 26, 10)
        along(R['unity'], -1340, -40, 10)
        along(R['peace'], -640, 26, 10)
        along(R['peace'], -1380, 26, 10)
        along(R['gateway'], -100, -26, 9.5)
        along(R['gateway'], 330, -26, 9.5)
        along(R['independence'], -330, 26, 9.5)
        along(R['independence'], 470, 26, 9.5)
        along(R['exchange'], -620, 18, 9)
        along(R['council'], -620, 18, 9)
        along(R['charter'], -620, 18, 9)
        along(R['commerce'], -620, 18, 9)
        along(R['union'], 300, 0, 9)
        along(R['union'], -300, 0, 9)
        along(R['tower'], 300, 0, 9)
        along(R['tower'], -300, 0, 9)
        along(R['sunrise'], 300, 26, 9.5)
        along(R['campus-link'], 450, 24, 9.5)
        m.text(-50, -1000, 'Interchange Park\n(the ramps among lawns)', 9, '#2e6e3a', style='italic', z_=36)
        m.text(150, -515, 'Gateway Green', 9, '#2e6e3a', style='italic', z_=36)
    # flyovers, roundabouts, joins
    for (n, name, x, z, what) in P.FLYOVERS:
        dx, dz = {'F1': (110, 60), 'F2': (100, 70), 'F3': (75, 60), 'F4': (0, 70), 'F5': (55, 60),
                  'F6': (60, 45), 'F7': (60, 45), 'F8': (60, 45), 'F9': (60, 45)}[n]
        if detail: dx, dz = dx * 0.8, dz * 0.8
        if detail and n == 'F4':
            for xx in (-400, 400):
                badge(m, xx + 30, z + 60, n, COL['upper'], 9)
            continue
        badge(m, x + dx, z + dz, n, COL['upper'], 9 if not detail else 10)
    for (n, name, x, z, r) in P.ROUNDABOUTS:
        badge(m, x - 48, z + 44, n, '#3b7d3b', 8 if not detail else 9.5)
    for (n, at, x, z, how) in P.JOINS:
        m.ax.plot([z], [x], marker='*', ms=17 * m.k if not detail else 22, mfc=COL['gold'], mec='black', mew=0.8, zorder=41)
        badge(m, x + (42 if n != 'J2' else 0), z + (40 if n != 'J2' else -60), n, '#9c6b00', 9 if not detail else 10)


def scalebar(m, x, z, metres=500):
    m.line([(x, z), (x, z - metres)], 4, 'black', 50, cap='butt')
    for f in (0, 0.5, 1):
        m.line([(x - 12, z - metres * f), (x + 12, z - metres * f)], 2, 'black', 50)
    m.text(x + 32, z - metres / 2, f'{metres} m', 10, z_=51)


def north(m, x, z):
    m.ax.annotate('', xy=(z, x + 110), xytext=(z, x), arrowprops=dict(arrowstyle='-|>,head_width=0.6,head_length=1.2', lw=2.4, color='black'), zorder=52)
    m.text(x + 150, z, 'N', 14, weight='bold', z_=52)


def legend(fig, rect, detail):
    ax = fig.add_axes(rect); ax.set_axis_off(); ax.set_xlim(0, 100); ax.set_ylim(0, 100)
    y = 96
    def sw_line(y, colour, w, casing=None, dots=False, dashes=None):
        if casing: ax.plot([2, 9], [y, y], color=casing, lw=w + 5, solid_capstyle='butt')
        ln, = ax.plot([2, 9], [y, y], color=colour, lw=w, solid_capstyle='butt')
        if dashes: ln.set_dashes(dashes)
        if dots: ax.plot([2, 9], [y, y], color=COL['trees'], lw=2.4, dashes=(0.8, 1.6))
    items = [
        (lambda y: sw_line(y, COL['exp'], 9), f'{P.CITY} Expressway: 3 lanes each way, a barrier, hard shoulders'),
        (lambda y: (sw_line(y, COL['avenue'], 7), ax.plot([2, 9], [y, y], color=COL['median'], lw=2.2), ax.plot([2, 9], [y, y], color=COL['trees'], lw=2.2, dashes=(0.8, 1.6))), 'Main road, 2 lanes each way: grass middle strip, a row of slim trees'),
        (lambda y: (sw_line(y, COL['avenue'], 7), ax.plot([2, 9], [y, y], color=COL['median'], lw=2.2)), 'Main road, 2 lanes each way: grass middle strip, street lights only'),
        (lambda y: sw_line(y, COL['street'], 5), 'Downtown street: 2 lanes each way, wide pavements'),
        (lambda y: sw_line(y, COL['avenue'], 4, casing=COL['raised']), 'Raised: a bridge, flyover or ramp, about 7.5 m up, 5.5 m clear under'),
        (lambda y: sw_line(y, COL['avenue'], 4, casing=COL['upper']), 'Upper flyover ramp, about 15 m up'),
        (lambda y: sw_line(y, COL['exp'], 6, casing=COL['cut']), 'Below street level: in a cutting with retaining walls'),
        (lambda y: (ax.add_patch(Rectangle((3.5, y - 1.3), 2.6, 2.6, fc=COL['tower'], ec=COL['towerEdge'])), ax.add_patch(Rectangle((6.6, y - 1.3), 2.6, 2.6, fc=COL['tower'], ec=COL['gold'], lw=1.6))), 'High-rise: a first idea of where (Stage 3 places them). Gold: Stage 1'),
        (lambda y: ax.plot([5.5], [y], marker='*', ms=15, mfc=COL['gold'], mec='black'), 'Where a new road joins one of the town\'s roads (J1, J2, J3)'),
        (lambda y: ax.plot([3.5, 7.5], [y, y], color=COL['closed'], lw=5), 'Road not finished yet: closed with a roadblock'),
        (lambda y: sw_line(y, COL['fence'], 2, dashes=(5, 3)), 'Edge of the built land, fenced as now (thin dashes: fences there now)'),
        (lambda y: ax.add_patch(FancyBboxPatch((2.5, y - 1.6), 6, 3.2, boxstyle='round,pad=0,rounding_size=0.8', fc='none', ec=COL['gold'], lw=2, ls=(0, (4, 2)))), 'Stage 1 sample (the first part built, for your yes)'),
    ]
    step = 7.6
    for i, (draw, label) in enumerate(items):
        yy = y - i * step
        draw(yy)
        ax.text(11, yy, label, fontsize=10.5, va='center')
    # the flyovers, roundabouts, joins
    ax2x = 54
    ax.text(ax2x, 97, 'The flyovers (9)', fontsize=12, fontweight='bold', va='center')
    yy = 92
    for (n, name, x, z, what) in P.FLYOVERS:
        ax.text(ax2x, yy, n, fontsize=10, color='white', fontweight='bold', va='center', ha='center', bbox=dict(boxstyle='round,pad=0.2', fc=COL['upper'], ec='none'))
        ax.text(ax2x + 3, yy, f'{name}: {what}', fontsize=9.8, va='center', wrap=True)
        yy -= 5.0
    yy -= 1.5
    ax.text(ax2x, yy, 'Roundabouts', fontsize=12, fontweight='bold', va='center'); yy -= 5
    ax.text(ax2x, yy, '   '.join(f'{n} {name}' for (n, name, *_r) in P.ROUNDABOUTS[:3]), fontsize=9.8, va='center'); yy -= 4.6
    ax.text(ax2x, yy, '   '.join(f'{n} {name}' for (n, name, *_r) in P.ROUNDABOUTS[3:]), fontsize=9.8, va='center'); yy -= 6.5
    ax.text(ax2x, yy, 'How the new roads join the town', fontsize=12, fontweight='bold', va='center'); yy -= 5
    for (n, at, x, z, how) in P.JOINS:
        ax.text(ax2x, yy, f'{n}  {at[0].upper() + at[1:]}: {how}', fontsize=9.8, va='center'); yy -= 4.6
    return ax


def draw_map(out, extent, fig_w=14.0, legend_h=7.6, detail=False, title='', subtitle=''):
    zmin, zmax, xmin, xmax = extent
    map_h = fig_w * (xmax - xmin) / (zmax - zmin)
    top = 1.2
    fig_h = map_h + legend_h + top
    fig = plt.figure(figsize=(fig_w, fig_h), dpi=120)
    ax = fig.add_axes([0, (legend_h) / fig_h, 1, map_h / fig_h])
    ax.set_xlim(zmin, zmax); ax.set_ylim(xmin, xmax); ax.set_aspect('equal'); ax.set_axis_off()
    ax.add_patch(Rectangle((zmin, xmin), zmax - zmin, xmax - xmin, fc=COL['land'], ec='none', zorder=0))
    ppm = fig_w * 72 / (zmax - zmin)
    m = Map(ax, ppm, 1.0)
    draw_existing(m, detail)
    draw_new(m, detail)
    draw_labels(m, detail)
    if not detail:
        scalebar(m, -1440, 520, 500); north(m, 880, 470)
    else:
        scalebar(m, -448, -1250, 250); north(m, 560, -500)
    fig.text(0.012, 1 - 0.45 / fig_h, title, fontsize=17, fontweight='bold', va='center')
    fig.text(0.012, 1 - 0.95 / fig_h, subtitle, fontsize=11, va='center', color='#444')
    legend(fig, [0.01, 0.005, 0.98, (legend_h - 0.2) / fig_h], detail)
    fig.savefig(out, dpi=120, facecolor='white')
    plt.close(fig)
    print('wrote', out)


def draw_all():
    here = P.HERE
    draw_map(str(here / 'plan-overview.png'), (-1720, 560, -1520, 1080), title=f'The new city: {P.CITY} City, on the free land west of the town (Step 0 plan)',
             subtitle='North is up. Grey = what is in the game now, unchanged. Coloured = new. Names are made up; rename any of them.')
    draw_map(str(here / 'plan-core.png'), (-1520, -420, -470, 730), fig_w=14.0, detail=True,
             title=f'Closer: {P.CITY} Central, the Unity Interchange and where Unity Avenue leaves the town',
             subtitle='North is up. The gold dashed box is the Stage 1 sample.')
