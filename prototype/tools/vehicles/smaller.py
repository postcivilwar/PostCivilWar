"""A 1024-pixel and a 512-pixel set of each car's and motorcycle's pictures (18 October 2026): what a phone draws them
with on the road, and what everyone draws them with across a showroom (src/client/budget.js). Made from the 2048 set,
which was made from the supplied pictures; the supplied files are not read or changed.

    python3 tools/vehicles/smaller.py            writes <id>-<picture>-1k.<jpg|webp> and -512 beside the 2k set, and
                                                 names them in cars.json and bikes.json; then cars.py --js and bikes.py --js
"""
import io, json, os
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))


def smaller(src, dst, fmt, size):
    im = Image.open(src)
    if im.mode not in ('RGB', 'RGBA'): im = im.convert('RGB')
    if im.mode == 'RGBA': im = im.convert('RGB')
    im = im.resize((size, size), Image.LANCZOS)
    buf = io.BytesIO()
    if fmt == 'jpg': im.save(buf, 'JPEG', quality=88, optimize=True, progressive=True)
    else: im.save(buf, 'WEBP', quality=88, method=6)
    open(dst, 'wb').write(buf.getvalue())


for kind in ('cars', 'bikes'):
    base = os.path.join(ROOT, 'assets', 'vehicles', kind)
    path = os.path.join(base, f'{kind}.json')
    manifest = json.load(open(path))
    for vid, m in sorted(manifest.items()):
        files = m['files']
        for name in ('color', 'normal', 'rm'):
            two = files.get(f'{name}2k')
            if not two: continue
            fmt = 'jpg' if name == 'color' else 'webp'
            for tag, size in (('1k', 1024), ('512', 512)):
                one = f'{vid}-{name}-{tag}.{fmt}'
                smaller(os.path.join(base, 'game', two), os.path.join(base, 'game', one), fmt, size)
                files[f'{name}{tag}'] = one
        print(kind, vid, sorted(k for k in files if k.endswith('1k') or k.endswith('512')), flush=True)
    json.dump(dict(sorted(manifest.items())), open(path, 'w'), indent=1)
