"""Every NPC model of the owner's that came without a skeleton, given one (tools/npcs/rig.py), into
assets/characters/npcs/rigged/<name>.glb, with made.json saying from which file (its SHA-256) and with whose skeleton
each was made. A copy is made again only when its file has changed. His files are only read.

    python3 -I tools/npcs/rig_all.py

The skeleton: his police officer's for a woman, his security guard's for a man (MEN below). The very heavy one
(streetwear_model_3d_model, 551,552 triangles) is left until a lighter copy of it has been shown to him (the standing
rule: nothing made lighter before he has seen it side by side).
"""
import hashlib
import json
import os
import struct
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '../..'))
NPCS = os.path.join(ROOT, 'assets/characters/npcs')
POLICE = os.path.join(ROOT, 'assets/characters/police')
OUT = os.path.join(NPCS, 'rigged')
MEN = {'character3dmodel', 'humanfigure3dmodel1'}
LATER = {'streetwear_model_3d_model'}


def sha(path):
    return hashlib.sha256(open(path, 'rb').read()).hexdigest()


def rigged_already(path):
    b = open(path, 'rb').read(32 * 1024 * 1024)
    ln = struct.unpack_from('<I', b, 12)[0]
    return bool(json.loads(b[20:20 + ln]).get('skins'))


def main():
    os.makedirs(OUT, exist_ok=True)
    made_at = os.path.join(OUT, 'made.json')
    made = json.load(open(made_at)) if os.path.exists(made_at) else {}
    for f in sorted(os.listdir(NPCS)):
        if not f.endswith('.glb'):
            continue
        name = f[:-4]
        src = os.path.join(NPCS, f)
        if name in LATER or rigged_already(src):
            continue
        ref = 'securityguard3dmodel.glb' if name in MEN else 'policeofficerfigure3dmodel.glb'
        dst = os.path.join(OUT, f)
        want = {'from': f, 'sha256': sha(src), 'skeleton': ref, 'skeleton_sha256': sha(os.path.join(POLICE, ref)), 'tool': sha(os.path.join(HERE, 'rig.py'))}
        if made.get(name) == want and os.path.exists(dst):
            continue
        subprocess.run([sys.executable, '-I', os.path.join(HERE, 'rig.py'), src, os.path.join(POLICE, ref), dst], check=True, stdout=subprocess.DEVNULL)
        made[name] = want
        print('rigged', name, 'with', ref)
    json.dump(made, open(made_at, 'w'), indent=1, sort_keys=True)


if __name__ == '__main__':
    main()
