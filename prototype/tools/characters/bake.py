"""Bakes the character kit.

    python3 tools/characters/bake.py [--preview out.png]

Reads assets/characters/base/streetwear_character_rigged.glb, takes it apart,
finishes the head, makes lighter copies of every part for people further
away, generates the clothing, hair, headwear, shoes and accessories that are
fitted to its skeleton, and writes src/client/character-kit-data.js.
Needs numpy, scipy and Pillow. Takes about a minute.

Three levels of detail are kept for every part:
  0  everything, for the player and for close-ups
  1  near: a few thousand triangles a person
  2  middle distance: under two thousand
"""
import os, sys, time
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from glb import Glb, skeleton
from kit import Kit
from rig import Rig
import meshkit as mk
from base import base_parts
import face
import headwear as hw
import wardrobe as wd
from tailor import Tailor

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SOURCE = os.path.join(ROOT, 'assets/characters/base/streetwear_character_rigged.glb')
OUT = os.path.join(ROOT, 'src/client/character-kit-data.js')

# Triangles kept from each supplied part at the near and middle levels.
BUDGET = {'hands': (900, 260), 'beard': (520, 170), 'cap': (300, 110), 'glasses': (300, 90), 'headphones': (460, 130), 'hoodie': (2600, 760), 'joggers': (560, 240), 'sneakers': (760, 240), 'yoke': (304, 120)}


def idle_clip(g, samples=16):
    """The supplied Idle clip, as a few rotations per bone, and the chest's breath."""
    j = g.json; a = j['animations'][0]
    tracks = {}; breath = None; length = 4.0
    for c in a['channels']:
        s = a['samplers'][c['sampler']]; node = j['nodes'][c['target']['node']]; path = c['target']['path']
        t = g.accessor(s['input']).astype(float); v = g.accessor(s['output']).astype(float)
        length = float(t[-1] - t[0])
        if path == 'rotation':
            rest = np.array(node.get('rotation', [0, 0, 0, 1]))
            if np.degrees(2 * np.arccos(np.clip(np.abs((v * rest).sum(1)), 0, 1))).max() < 0.05: continue
            pick = np.linspace(0, len(v) - 1, samples, endpoint=False).round().astype(int)
            tracks[node['name']] = [round(float(x), 5) for x in v[pick].ravel()]
        elif path == 'scale' and node['name'] == 'Chest':
            pick = np.linspace(0, len(v) - 1, samples, endpoint=False).round().astype(int)
            breath = [round(float(x), 5) for x in v[pick][:, 0]]
    return {'length': round(length, 3), 'tracks': tracks, 'breath': breath}


def main():
    t0 = time.time()
    g = Glb(SOURCE)
    bones = skeleton(g)
    rig = Rig(bones)
    kit = Kit(bones)
    HEAD = rig.index['Head']
    raw = base_parts(g)
    head_raw, yoke = face.split_neck(raw.pop('head'))
    raw['yoke'] = yoke

    # --- the head, at three weights, and the bare skull hair and hats are fitted to ---
    bare = {}
    for lod, target in enumerate((None, 2000, 650)):
        mesh, bare[lod] = face.finish_head(head_raw, rig.n, HEAD, target)
        kit.add('base.head', mesh, lod=lod, group='head')
    print(f"head: {[kit.parts['base.head']['lods'][i]['t'] for i in range(3)]} triangles", flush=True)

    # --- the supplied clothing and accessories, thinned for distance ---
    for name, mesh in raw.items():
        kit.add('base.' + name, mesh, lod=0, group='base')
        near, mid = BUDGET[name]
        for lod, target in ((1, near), (2, mid)):
            kit.add('base.' + name, mk.decimate(mesh, target) if len(mesh['idx']) > target else mesh, lod=lod, group='base')
        print(f"base.{name:11s} {[kit.parts['base.' + name]['lods'][i]['t'] for i in range(3)]}", flush=True)

    # --- hair and headwear ---
    fine = hw.catalogue(rig, bare[1], False); coarse = hw.catalogue(rig, bare[2], True)
    for name in fine:
        group = name.split('.')[0]
        kit.add(name, fine[name], lod=0, group=group); kit.add(name, fine[name], lod=1, group=group); kit.add(name, coarse[name], lod=2, group=group)
    print(f"hair and headwear: {len(fine)} parts", flush=True)

    # --- the wardrobe, drawn in the natural pose and carried back to the bind pose ---
    cat_fine = wd.catalogue(Tailor(rig)); cat_coarse = wd.catalogue(Tailor(rig, coarse=True))
    for name in cat_fine:
        group = name.split('.')[0]
        a = rig.to_bind(cat_fine[name]); b = rig.to_bind(cat_coarse[name])
        kit.add(name, a, lod=0, group=group); kit.add(name, a, lod=1, group=group); kit.add(name, b, lod=2, group=group)
    print(f"wardrobe: {len(cat_fine)} parts", flush=True)

    meta = kit.manifest()
    meta['poses'] = {'natural': {'t': [[round(float(x), 6) for x in t] for t in rig.natural['t']], 'q': [[round(float(x), 6) for x in q] for q in rig.natural['q']]}}
    meta['idle'] = idle_clip(g)
    kit.extra = {'poses': meta['poses'], 'idle': meta['idle']}
    meta = kit.write(OUT)
    tris = lambda lod: sum(p['lods'][lod]['t'] for p in meta['parts'].values())
    print(f"wrote {os.path.relpath(OUT, ROOT)}: {len(meta['parts'])} parts, {meta['bytes'] / 1024:.0f} KB packed, {time.time() - t0:.0f} s")
    return kit, rig


if __name__ == '__main__':
    main()
