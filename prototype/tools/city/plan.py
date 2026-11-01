"""The new city with flyovers: Step 0 plan (31 October 2026).

Everything in the game's site grid (metres): x = true north (up the map), z = true east (right on the map). The town,
the river, the airport, the showrooms, the sports mall and the habitation are read from the game's own map data
(zone.json, dumped from src/sim/zone.js); the new city is laid out here, only on land the game does not use yet.

    node tools/city/dump.mjs tools/city/zone.json && python3 tools/city/draw.py
                               draws plan-overview.png and plan-core.png here, and writes plan.json (zone.json, the
                               dump, and what is drawn are not kept in the repository)
"""
import json, math
from pathlib import Path

HERE = Path(__file__).resolve().parent
Z = json.loads((HERE / 'zone.json').read_text())

# ------------------------------------------------------------------------------------------------ the plan --
EXP_Z = -1130            # the expressway's centre line (it runs north-south)
NB_Z, SB_Z = EXP_Z + 12, EXP_Z - 12
CITY = 'Oganiru'         # Igbo: progress

def bez(p0, p1, p2, p3, n=48):
    out = []
    for i in range(n + 1):
        t = i / n; a = (1 - t) ** 3; b = 3 * (1 - t) ** 2 * t; c = 3 * (1 - t) * t * t; d = t ** 3
        out.append((a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]))
    return out

def spline(pts, n=14):
    """Catmull-Rom through the points (x, z)."""
    out = []
    P = [pts[0]] + list(pts) + [pts[-1]]
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        for k in range(n):
            t = k / n; t2 = t * t; t3 = t2 * t
            out.append(tuple(0.5 * ((2 * p1[j]) + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3) for j in (0, 1)))
    out.append(pts[-1])
    return out

def loop(cx, cz, r, a0, a1, n=60):
    """An arc round (cx, cz), from angle a0 to a1 (degrees, measured on the map: 0 = east, 90 = north)."""
    return [(cx + r * math.sin(math.radians(a0 + (a1 - a0) * i / n)), cz + r * math.cos(math.radians(a0 + (a1 - a0) * i / n))) for i in range(n + 1)]

# kinds of road: (width in metres, how drawn)
#   expressway: 3 lanes each way (3.5 m) + hard shoulders + a concrete barrier: 36 m
#   avenue: dual carriageway, 2 lanes each way + a raised grass middle strip 5 m: 20 m (+ verges and walkways)
#   street: downtown, 2 lanes each way, wide pavements: 16 m between kerbs
#   ramp: one or two lanes: 8 m
ROADS = []
def road(id, name, kind, pts, trees=False, note=''):
    ROADS.append(dict(id=id, name=name, kind=kind, pts=[tuple(map(float, p)) for p in pts], trees=trees, note=note))

# The expressway, from its south end at the Harmony Interchange to its north end (road works beyond)
road('expressway', f'{CITY} Expressway', 'expressway', [(-1215, EXP_Z), (900, EXP_Z)], note='3 lanes each way')
# Main roads (dual carriageways)
road('unity', 'Unity Avenue', 'avenue', [(0, -478.6), (0, -1640)], trees=True, note='from College Road')
road('harmony', 'Harmony Avenue', 'avenue', [(-1290, -68), (-1290, -1620)], trees=True, note='from the Kwale road')
road('peace', 'Peace Avenue', 'avenue', [(650, -369), (650, -1550)], trees=True)
road('campus-link', 'Campus Link', 'avenue', [(248.6, -341), (622, -341)], note='from Campus Road')
road('hope', 'Hope Avenue', 'avenue', [(-850, -560), (-850, -1550)])
road('gateway', 'Gateway Boulevard', 'avenue', [(-1262, -560), (650, -560)])
road('independence', 'Independence Boulevard', 'avenue', [(-1290, -780), (650, -780)])
road('sunrise', 'Sunrise Boulevard', 'avenue', [(-1290, -1550), (650, -1550)], trees=True)
road('kwale-on', 'Asaba–Kwale Road (on to the roundabout)', 'link', [(-1190, -40), (-1262, -40)])
road('kwale-south', 'Asaba–Kwale Road (south: road works)', 'link', [(-1318, -40), (-1390, -40)])
# Downtown streets
road('exchange', 'Exchange Street', 'street', [(-400, -560), (-400, -1550)])
road('council', 'Council Street', 'street', [(-200, -560), (-200, -900)])
road('charter', 'Charter Street', 'street', [(200, -560), (200, -900)])
road('commerce', 'Commerce Street', 'street', [(400, -560), (400, -1550)])
road('union', 'Union Street', 'street', [(-400, -670), (400, -670)])
road('tower', 'Tower Street', 'street', [(-400, -900), (400, -900)])

# Ramps of the interchanges: (id, name, level, points) — level 0 ground, 1 raised (~7.5 m), 2 upper (~15 m)
RAMPS = []
def ramp(id, level, pts, note=''):
    RAMPS.append(dict(id=id, level=level, pts=[tuple(map(float, p)) for p in pts], note=note))

# F1 Unity Interchange (the expressway raised over Unity Avenue; loops NE and SW; flyovers for EB->NB and WB->SB)
ramp('u-loop-ne', 1, [(20, NB_Z + 2), (45, -1106)] + loop(67, -1050, 55, 180, -90), 'north-bound to west-bound: loop')
ramp('u-loop-sw', 1, [(-20, SB_Z - 2), (-45, -1154)] + loop(-67, -1210, 55, 0, -270), 'south-bound to east-bound: loop')
ramp('u-ne', 1, bez((10, -975), (60, -978), (165, -995), (255, NB_Z + 6)), 'west-bound to north-bound')
ramp('u-se', 1, bez((-250, NB_Z + 10), (-150, -1102), (-30, -1060), (-10, -990)), 'north-bound to east-bound')
ramp('u-nw', 1, bez((250, SB_Z - 10), (150, -1158), (30, -1200), (10, -1270)), 'south-bound to west-bound')
ramp('u-sw', 1, bez((-10, -1290), (-60, -1305), (-185, -1292), (-255, SB_Z - 6)), 'east-bound to south-bound')
ramp('u-fly-en', 2, spline([(-12, -1450), (-24, -1385), (-12, -1325), (40, -1268), (120, -1210), (200, -1152), (262, -1104), (330, -1094), (430, NB_Z + 4)]), 'east-bound to north-bound: flyover')
ramp('u-fly-ws', 2, spline([(12, -930), (24, -990), (10, -1050), (-40, -1082), (-118, -1112), (-200, -1140), (-262, -1160), (-345, -1168), (-465, SB_Z - 4)]), 'west-bound to south-bound: flyover')
# F2 Harmony Interchange (the expressway's south end; a three-legged interchange whose two curved ramps cross one above
# the other: south-bound to east-bound on the lower, east-bound to north-bound on the upper, about 15 m up)
ramp('h-sb-wb', 0, bez((-1200, SB_Z), (-1240, -1160), (-1275, -1230), (-1279, -1305)), 'south-bound to west-bound')
ramp('h-wb-nb', 0, bez((-1279, -985), (-1262, -1010), (-1232, -1080), (-1200, NB_Z + 4)), 'west-bound to north-bound')
ramp('h-sb-eb', 1, spline([(-1210, SB_Z), (-1260, -1142), (-1310, -1146), (-1360, -1132), (-1380, -1090), (-1356, -1030), (-1302, -985)]), 'south-bound to east-bound: flyover')
ramp('h-eb-nb', 2, spline([(-1302, -1390), (-1322, -1300), (-1305, -1222), (-1255, -1168), (-1200, -1112), (-1120, -1100), (-1040, NB_Z + 4)]), 'east-bound to north-bound: upper flyover')
# F3 Peace Interchange (Peace Avenue bridges the expressway; four slip roads)
ramp('p-nb-off', 1, bez((530, NB_Z + 4), (590, -1100), (620, -1094), (636, -1090)))
ramp('p-nb-on', 1, bez((664, -1090), (700, -1094), (760, -1100), (850, NB_Z + 4)))
ramp('p-sb-off', 1, bez((850, SB_Z - 4), (760, -1160), (700, -1166), (664, -1170)))
ramp('p-sb-on', 1, bez((636, -1170), (620, -1166), (590, -1160), (530, SB_Z - 4)))

# Raised and sunk stretches of the main roads: (road id, along from, along to, level, name)
#   along = x for a north-south road, z for an east-west one
LEVELS = [
    ('expressway', -470, 760, 1, 'raised on pillars through downtown and over Peace Avenue, about 8 m up'),
    ('expressway', -1000, -790, -1, 'in a cutting with retaining walls, about 7 m below street level'),
    ('independence', -155, 155, 1, 'Independence Boulevard over Unity Avenue'),
    ('peace', -635, -925, 1, 'Peace Avenue over Independence Boulevard'),
    ('harmony', -635, -925, 1, 'Harmony Avenue over Independence Boulevard'),
    ('hope', -635, -925, 1, 'Hope Avenue over Independence Boulevard'),
]

FLYOVERS = [
    # (number, name, x, z, what it is)
    ('F1', 'Unity Interchange', 0, EXP_Z, 'big, two levels: the expressway raised over Unity Avenue, two loops, two curved flyovers about 15 m up'),
    ('F2', 'Harmony Interchange', -1290, EXP_Z, "big, two levels: the expressway's south end; its two curved flyovers cross one above the other, the upper about 15 m up"),
    ('F3', 'Peace Interchange', 650, EXP_Z, 'the expressway bridges Peace Avenue; slip roads down to traffic lights on the avenue'),
    ('F4', 'The downtown viaduct', 340, EXP_Z, 'the expressway on pillars for 1.2 km, over Exchange Street, Unity Avenue, Commerce Street and Peace Avenue'),
    ('F5', 'Hope Avenue bridge', -850, EXP_Z, 'Hope Avenue over the expressway, which runs below street level there'),
    ('F6', 'Independence Flyover', 0, -780, 'Independence Boulevard over Unity Avenue'),
    ('F7', 'Peace Flyover', 650, -780, 'Peace Avenue over Independence Boulevard'),
    ('F8', 'Harmony Flyover', -1290, -780, 'Harmony Avenue over Independence Boulevard'),
    ('F9', 'Hope Flyover', -850, -780, 'Hope Avenue over Independence Boulevard'),
]

ROUNDABOUTS = [
    ('R1', 'Gate Roundabout', 0, -560, 28),
    ('R2', 'Airport Roundabout', -1290, -560, 28),
    ('R3', 'Southgate Roundabout', -1290, -40, 28),
    ('R4', 'Campus Roundabout', 650, -341, 28),
    ('R5', 'Sunrise Roundabout', 0, -1550, 28),
]

JOINS = [
    ('J1', "College Road's west end", 0, -472, 'becomes Unity Avenue at the Gate Roundabout'),
    ('J2', "the Kwale road's end", -1190, -40, 'on to the Southgate Roundabout and Harmony Avenue'),
    ('J3', "Campus Road's north end", 241.5, -341, 'becomes Campus Link, on to Peace Avenue'),
]

CLOSED = [  # roads not finished yet: closed with a roadblock (x, z, facing along x?)
    ('unity-west', 0, -1640, False), ('harmony-west', -1290, -1620, False), ('kwale-south', -1390, -40, True),
    ('expressway-north', 900, EXP_Z, True),
]

DISTRICTS = [
    ('central', f'{CITY} Central', 'downtown: 20 to 40 high-rises', [(-430, -575), (430, -575), (430, -1100), (-430, -1100)], '#3f6db3'),
    ('anwuli', 'Anwuli Gardens', 'north: tree-lined avenues', [(255, -300), (920, -300), (920, -1100), (430, -1100), (430, -575), (255, -575)], '#3c9a4a'),
    ('ihuoma', 'Ihuoma Park', 'south, beside the airport', [(-1250, -575), (-430, -575), (-430, -1100), (-1250, -1100)], '#d38b2c'),
    ('ugwuoma', 'Ugwuoma Heights', 'west of the expressway: land for later', [(-1250, -1175), (920, -1175), (920, -1610), (-1250, -1610)], '#8a5bb5'),
]

FENCE = [(248.6, -290), (950, -290), (950, -1660), (-1420, -1660), (-1420, -21.4), (-1190.6, -21.4)]
FENCE_POCKET = [(-561.4, -508.6), (-248.6, -508.6), (-248.6, -478.6)]   # closes the land between the airport, the showroom and the town, as now

STAGE1 = [(-300, -478), (300, -478), (300, -1480), (-300, -1480)]

# Towers: an indicative layout of 32 (Stage 3 places them for real). (x, z, width, depth, kind)
TOWERS = []
def towers():
    import random
    rnd = random.Random(1970)
    blocks = []
    for (z0, z1) in [(-560, -670), (-670, -780), (-780, -900)]:
        for (x0, x1) in [(-400, -200), (-200, 0), (0, 200), (200, 400)]:
            blocks.append((x0, x1, z0, z1))
    for (x0, x1) in [(-400, -200), (200, 400)]:
        blocks.append((x0, x1, -900, -1095))
    kinds = ['glass', 'glass', 'ribbed', 'stone', 'glass', 'office', 'glass', 'ribbed', 'stone', 'office']
    k = 0
    for (x0, x1, z0, z1) in blocks:
        # along the block's sides that face Unity Avenue, Independence Boulevard or the expressway
        spots = []
        if x0 == 0 or x1 == 0:   # beside Unity Avenue
            xs = 22 + 18 if x0 == 0 else -22 - 18
            spots += [(xs, z0 - 30), (xs, z1 + 30)]
        if z0 == -780 or z1 == -780:
            zs = -780 + (-40 if z0 == -780 else 40)
            spots += [((x0 + x1) / 2 + (25 if x0 >= 0 else -25), zs)]
        if z1 == -1095:
            spots += [((x0 + x1) / 2 - 45, -1060), ((x0 + x1) / 2 + 45, -1060)]
        if not spots:
            spots = [((x0 + x1) / 2, (z0 + z1) / 2)]
        if len(spots) < 2:
            spots.append(((x0 + x1) / 2 + rnd.uniform(-40, 40), (z0 + z1) / 2 + rnd.uniform(-20, 20)))
        for (sx, sz) in spots:
            w = rnd.uniform(28, 42); dd = rnd.uniform(26, 40)
            kind = kinds[k % len(kinds)]; k += 1
            if k in (7, 19): kind = 'round'
            TOWERS.append((sx, sz, w, dd, kind))
towers()
STAGE1_TOWERS = [i for i, t in enumerate(TOWERS) if -780 <= t[1] <= -670 and abs(t[0]) <= 200][:6]

# ------------------------------------------------------------------------------------------------ the data --
def write_json():
    plan = dict(
        note='Step 0 plan for the new city (31 October 2026). Site grid metres: x = true north, z = true east.',
        city=CITY, expressway_z=EXP_Z,
        roads=ROADS, ramps=RAMPS, levels=[dict(road=a, frm=b, to=c, level=d, note=e) for a, b, c, d, e in LEVELS],
        flyovers=[dict(id=a, name=b, x=c, z=d, what=e) for a, b, c, d, e in FLYOVERS],
        roundabouts=[dict(id=a, name=b, x=c, z=d, r=e) for a, b, c, d, e in ROUNDABOUTS],
        joins=[dict(id=a, at=b, x=c, z=d, how=e) for a, b, c, d, e in JOINS],
        closed=[dict(id=a, x=b, z=c) for a, b, c, _ in CLOSED],
        districts=[dict(id=a, name=b, what=c, outline=d) for a, b, c, d, _ in DISTRICTS],
        fence=FENCE, fence_pocket=FENCE_POCKET, stage1=STAGE1,
        towers=[dict(x=round(a, 1), z=round(b, 1), w=round(c, 1), d=round(dd, 1), kind=e) for a, b, c, dd, e in TOWERS],
    )
    (HERE / 'plan.json').write_text(json.dumps(plan, indent=1))

if __name__ == '__main__':
    write_json()
    from draw import draw_all
    draw_all()
