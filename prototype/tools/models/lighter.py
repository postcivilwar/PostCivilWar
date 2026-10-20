"""Lighter copies of the owner's single-mesh models (his buildings, the town's vehicles, the market's watch), made by
the build (20 October 2026, the owner's brief: "No 8K picture is ever sent to any device"; "My original GLB files
stay in the repository exactly as supplied, byte for byte, untouched. What the phone downloads may be a lighter copy
MADE FROM each original by the build").

Each of these files is almost all one colour picture of 8192 pixels square (10 to 17 MB of a 10 to 18 MB file), which
the game has never drawn larger than 2048 on a computer or 1024 on a phone (src/client/budget.js): every device
fetched all of it and made it smaller itself, a quarter of a gigabyte for each picture while it did. A copy here is the
original with each picture larger than the size it is drawn at made that size, and nothing else changed: the same
shapes byte for byte, the same materials, the same everything but the pictures' bytes. A picture already no larger is
copied as it is. JPEG stays JPEG, PNG stays PNG; each is made smaller the way a careful photo editor does it (Lanczos),
from the whole picture, with its colour profile kept.

    python3 tools/models/lighter.py JOBS.json      JOBS: [{"source": path, "out": path, "most": 2048}, ...]
    python3 tools/models/lighter.py SOURCE OUT MOST

Each copy is checked once it is written: read back, every part but the pictures equal to the original's, byte for
byte, and every picture the size it should be.
"""
import io
import json
import struct
import sys

from PIL import Image, JpegImagePlugin

TOOL = 'lighter.py 1'


def read_glb(data):
    magic, version, length = struct.unpack('<III', data[:12])
    if magic != 0x46546C67 or version != 2:
        raise ValueError('not a GLB file of version 2')
    at, json_part, bin_part = 12, None, b''
    while at < length:
        size, kind = struct.unpack('<II', data[at:at + 8])
        chunk = data[at + 8:at + 8 + size]
        if kind == 0x4E4F534A:
            json_part = json.loads(chunk.decode('utf8'))
        elif kind == 0x004E4942:
            bin_part = chunk
        at += 8 + size
    if json_part is None:
        raise ValueError('no description in the file')
    return json_part, bin_part


def view_bytes(js, binary, index):
    bv = js['bufferViews'][index]
    if bv.get('buffer', 0) != 0:
        raise ValueError('a part of the file is not in the file itself')
    start = bv.get('byteOffset', 0)
    return binary[start:start + bv['byteLength']]


def smaller(raw, mime, most):
    """The picture no larger than `most` across, in its own format; None where it is no larger already."""
    image = Image.open(io.BytesIO(raw))
    w, h = image.size
    if max(w, h) <= most:
        return None, (w, h)
    k = most / max(w, h)
    size = (max(1, round(w * k)), max(1, round(h * k)))
    icc = image.info.get('icc_profile')
    out = io.BytesIO()
    if mime == 'image/jpeg':
        sampling = JpegImagePlugin.get_sampling(image)          # 0 4:4:4, 1 4:2:2, 2 4:2:0 (as the original was)
        image = image.convert('RGB') if image.mode not in ('RGB', 'L') else image
        made = image.resize(size, Image.LANCZOS)
        options = {'quality': 90, 'optimize': True}
        if sampling in (0, 1, 2):
            options['subsampling'] = sampling
        if icc:
            options['icc_profile'] = icc
        made.save(out, 'JPEG', **options)
    elif mime == 'image/png':
        mode = image.mode
        if mode == 'P':
            image = image.convert('RGBA')
        elif mode not in ('RGB', 'RGBA', 'L', 'LA', 'I;16', 'I'):
            image = image.convert('RGBA')
        made = image.resize(size, Image.LANCZOS)
        options = {'optimize': True}
        if icc:
            options['icc_profile'] = icc
        made.save(out, 'PNG', **options)
    else:
        raise ValueError(f'a picture of a kind this does not make smaller: {mime}')
    return out.getvalue(), size


def lighter(source, out, most):
    data = open(source, 'rb').read()
    js, binary = read_glb(data)
    if len(js.get('buffers', [])) != 1 or js['buffers'][0].get('uri'):
        raise ValueError('the file has parts outside itself')
    # a picture's part of the file is made smaller only where nothing else reads that part
    readers = {}
    for a in js.get('accessors', []):
        if 'bufferView' in a:
            readers[a['bufferView']] = readers.get(a['bufferView'], 0) + 1
    for im in js.get('images', []):
        if 'bufferView' in im:
            readers[im['bufferView']] = readers.get(im['bufferView'], 0) + 1
    replaced, report = {}, []
    for i, im in enumerate(js.get('images', [])):
        if 'bufferView' not in im:
            raise ValueError(f'picture {i} is not in the file')
        raw = view_bytes(js, binary, im['bufferView'])
        mime = im.get('mimeType', 'image/jpeg')
        made, size = smaller(raw, mime, most) if readers[im['bufferView']] == 1 else (None, Image.open(io.BytesIO(raw)).size)
        if made is not None:
            replaced[im['bufferView']] = made
        report.append({'image': i, 'mime': mime, 'was': list(Image.open(io.BytesIO(raw)).size), 'now': list(size), 'bytes': [len(raw), len(made) if made is not None else len(raw)]})
    # the file put together again: every part in its own order, each on a four-byte boundary
    parts, at = [], 0
    for index, bv in enumerate(js['bufferViews']):
        chunk = replaced.get(index, view_bytes(js, binary, index))
        pad = (-at) % 4
        if pad:
            parts.append(b'\0' * pad)
            at += pad
        bv['byteOffset'] = at
        bv['byteLength'] = len(chunk)
        parts.append(chunk)
        at += len(chunk)
    new_bin = b''.join(parts)
    new_bin += b'\0' * ((-len(new_bin)) % 4)
    js['buffers'][0]['byteLength'] = len(new_bin)
    text = json.dumps(js, separators=(',', ':'), ensure_ascii=False).encode('utf8')
    text += b' ' * ((-len(text)) % 4)
    total = 12 + 8 + len(text) + 8 + len(new_bin)
    glb = struct.pack('<III', 0x46546C67, 2, total) + struct.pack('<II', len(text), 0x4E4F534A) + text + struct.pack('<II', len(new_bin), 0x004E4942) + new_bin
    check(data, glb, most)
    with open(out, 'wb') as fh:
        fh.write(glb)
    return {'bytes': [len(data), len(glb)], 'pictures': report}


def check(original, copy, most):
    """Every part of the copy but the pictures is the original's, byte for byte; every picture is no larger than `most`
    and is as large as the original's where that was no larger."""
    a_js, a_bin = read_glb(original)
    b_js, b_bin = read_glb(copy)
    pictures = {im['bufferView'] for im in a_js.get('images', []) if 'bufferView' in im}
    if len(a_js['bufferViews']) != len(b_js['bufferViews']):
        raise AssertionError('the copy has a different number of parts')
    for index in range(len(a_js['bufferViews'])):
        if index in pictures:
            continue
        if view_bytes(a_js, a_bin, index) != view_bytes(b_js, b_bin, index):
            raise AssertionError(f'part {index} of the copy is not the original\'s')
    strip = lambda js: json.dumps({k: v for k, v in js.items() if k not in ('bufferViews', 'buffers')}, sort_keys=True)
    if strip(a_js) != strip(b_js):
        raise AssertionError('the copy\'s description differs from the original\'s beyond where its parts are')
    for key in ('buffer', 'byteStride', 'target', 'name', 'extensions', 'extras'):
        for x, y in zip(a_js['bufferViews'], b_js['bufferViews']):
            if x.get(key) != y.get(key):
                raise AssertionError(f'a part\'s {key} changed')
    for im_a, im_b in zip(a_js.get('images', []), b_js.get('images', [])):
        wa = Image.open(io.BytesIO(view_bytes(a_js, a_bin, im_a['bufferView']))).size
        wb = Image.open(io.BytesIO(view_bytes(b_js, b_bin, im_b['bufferView'])))
        wb.load()
        if max(wb.size) > most or (max(wa) <= most and wb.size != wa):
            raise AssertionError(f'a picture is {wb.size}, from {wa}, with at most {most}')


def main(argv):
    if len(argv) == 2:
        jobs = json.load(open(argv[1]))
    elif len(argv) == 4:
        jobs = [{'source': argv[1], 'out': argv[2], 'most': int(argv[3])}]
    else:
        print(__doc__)
        return 2
    results = []
    for job in jobs:
        made = lighter(job['source'], job['out'], int(job['most']))
        results.append({'out': job['out'], **made})
        print(f"{job['out']}: {made['bytes'][0] / 1048576:.1f} MB -> {made['bytes'][1] / 1048576:.1f} MB", flush=True)
    print(json.dumps({'tool': TOOL, 'made': results}))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
