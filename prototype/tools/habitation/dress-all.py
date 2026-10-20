"""Every habitation model made real (dress.py), a computer's copy and a phone's, from the owner's files as supplied
(never changed), kept in assets/habitation-dressed/ with made.json (each copy's source fingerprint and the tool's
version): a copy is made again only when its source or the tool has changed. The leaves' sheet (leaves.py) and the
rocks (rocks.py) are made here too.

    python3 tools/habitation/dress-all.py [names...]
"""
import hashlib, json, os, sys, time
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import dress, leaves, rocks, glbio

ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
SRC = os.path.join(ROOT, 'assets', 'habitation')
OUT = os.path.join(ROOT, 'assets', 'habitation-dressed')
TOOL = 'dress 4'           # (raised whenever dress.py, leaves.py, rocks.py or surfaces.py change what they make)
LEAVES = {'full': 2048, 'lite': 1024}

def md5(path):
    return hashlib.md5(open(path, 'rb').read()).hexdigest()

def main(names):
    os.makedirs(OUT, exist_ok=True)
    spec = json.load(open(os.path.join(HERE, 'models.json')))
    made_path = os.path.join(OUT, 'made.json')
    made = json.load(open(made_path)) if os.path.exists(made_path) else {'copies': {}}
    if made.get('tool') != TOOL:
        made = {'tool': TOOL, 'copies': {}}
    # the leaves' sheets
    for dev, size in LEAVES.items():
        path = os.path.join(OUT, f'leaves.{dev}.webp')
        if not os.path.exists(path) or made.get('leaves') != TOOL:
            leaves.sheet(size).save(path, 'WEBP', quality=88, method=6)
    made['leaves'] = TOOL
    # the rocks: four kinds, three of each, a computer's and a phone's
    for dev, most in (('full', 512), ('lite', 256)):
        for kind in rocks.KINDS:
            for n in range(3):
                path = os.path.join(OUT, f'rock-{kind}-{n}.{dev}.glb')
                if os.path.exists(path) and made.get('rocks') == TOOL:
                    continue
                prims = rocks.boulder(kind, 100 + n * 17 + list(rocks.KINDS).index(kind) * 5, most, level=4 if dev == 'full' else 3)
                glbio.write(path, prims, extras=dict(dressed=dict(kind='rock', stone=kind, made='tools/habitation/rocks.py')))
    made['rocks'] = TOOL
    for name, m in spec['models'].items():
        if names and name not in names and name.replace('3dmodel', '').replace('.glb', '') not in names:
            continue
        src = os.path.join(SRC, name)
        sig = md5(src)
        for dev in ('full', 'lite'):
            most = spec['kinds'][m['kind']][dev]
            stem = name.replace('3dmodel', '').replace('.glb', '')
            out = os.path.join(OUT, f'{stem}.{dev}.glb')
            key = f'{stem}.{dev}'
            prior = made['copies'].get(key)
            if prior and prior.get('md5') == sig and prior.get('most') == most and os.path.exists(out):
                continue
            t = time.time()
            sheet = (f'leaves.{dev}.webp', 'uri')
            notes = dress.dress(src, out, m['kind'], most, sheet, dict(m.get('opts', {})))
            made['copies'][key] = dict(source=name, md5=sig, kind=m['kind'], most=most, bytes=os.path.getsize(out), seconds=round(time.time() - t, 1), notes={k: v for k, v in notes.items() if k not in ('deck',)})
            print(f'{key}: {os.path.getsize(out) / 1e6:.2f} MB in {time.time() - t:.1f} s', flush=True)
            json.dump(made, open(made_path, 'w'), indent=1)
    json.dump(made, open(made_path, 'w'), indent=1)

if __name__ == '__main__':
    main(sys.argv[1:])
