"""The light copies of the owner's police and NPC models (tools/characters/light.py's own `make`, the same copies as
his player figures get): the same skeleton, skinning, triangles and moves; positions 16-bit; the pictures as WebP files
of their own, 1024 for a phone and 2048 for a computer; gzip'd. Written to assets/characters/npcs/light/, with
made.json naming what each was made from (its MD5). Made again only when that has changed.

    python3 -I tools/npcs/light_npcs.py [--all]

From: his two police (assets/characters/police/), his four NPC models that came rigged, and the copies of the others
given a skeleton (assets/characters/npcs/rigged/, tools/npcs/rig_all.py).
"""
import hashlib
import json
import os
import struct
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '../..'))
sys.path.insert(0, os.path.join(ROOT, 'tools', 'characters'))
import light  # noqa: E402  (tools/characters/light.py)

# (27 October 2026: the townspeople's colour picture also at 512, which a phone draws them with: twenty-five of them,
# each its own picture, came to 30 to 45 MB more on a phone's graphics card at the busiest places than the police alone
# did; the police, five to a picture, keep 1024. A computer's stays 2048.)
light.PICTURES = {**light.PICTURES, 'c': {**light.PICTURES['c'], 'sizes': (512, 1024, 2048)}}
light.TOOL = light.TOOL + ' (npc: colour 512 too)'

NPCS = os.path.join(ROOT, 'assets/characters/npcs')
OUT = os.path.join(NPCS, 'light')


def sources():
    out = {}
    pol = os.path.join(ROOT, 'assets/characters/police')
    for f in sorted(os.listdir(pol)):
        if f.endswith('.glb'):
            out['police__' + f[:-4]] = os.path.join(pol, f)
    for f in sorted(os.listdir(NPCS)):
        if not f.endswith('.glb'):
            continue
        p = os.path.join(NPCS, f)
        with open(p, 'rb') as fh:
            head = fh.read(20)
            ln = struct.unpack_from('<I', head, 12)[0]
            b = head + fh.read(ln)
        try:
            rigged = bool(json.loads(b[20:20 + ln]).get('skins'))
        except Exception:
            rigged = False
        r = os.path.join(NPCS, 'rigged', f)
        if rigged:
            out['npc__' + f[:-4]] = p
        elif os.path.exists(r):
            out['npc__' + f[:-4]] = r
    return out


def main(argv):
    os.makedirs(OUT, exist_ok=True)
    made_at = os.path.join(OUT, 'made.json')
    made = json.load(open(made_at)) if os.path.exists(made_at) else {}
    for stem, src in sources().items():
        md5 = hashlib.md5(open(src, 'rb').read()).hexdigest()
        entry = made.get(stem)
        if '--all' not in argv and entry and entry.get('md5') == md5 and entry.get('tool') == light.TOOL and all(os.path.exists(os.path.join(OUT, n)) for n in entry['files']):
            continue
        t0 = time.time()
        md5, size, files, report, glb = light.make(src, stem)
        oj, ob = light.read_glb(open(src, 'rb').read())
        moved, shape = light.check(oj, ob, glb)
        if entry:
            for n in entry['files']:
                if n not in files and os.path.exists(os.path.join(OUT, n)):
                    os.remove(os.path.join(OUT, n))
        for name, body in files.items():
            open(os.path.join(OUT, name), 'wb').write(body)
        made[stem] = {'tool': light.TOOL, 'from': os.path.relpath(src, ROOT), 'md5': md5, 'bytes': size, 'files': {n: {'bytes': len(b), 'sha256': hashlib.sha256(b).hexdigest()} for n, b in sorted(files.items())}, 'moved': moved, 'shape': shape}
        json.dump(made, open(made_at, 'w'), indent=1, sort_keys=True)
        phone = sum(len(b) for n, b in files.items() if n.endswith('.glb.gz') or '1024' in n)
        print(f'{stem:40s} {size / 1048576:5.1f} MB -> phone {phone / 1048576:.2f} MB; moved {moved * 1000:.3f}; shape {shape * 1000:.4f}; {time.time() - t0:.0f} s', flush=True)
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
