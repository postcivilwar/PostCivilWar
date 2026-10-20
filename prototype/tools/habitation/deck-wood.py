"""The wood of the habitation's boardwalks, bridges, jetty and stairs, taken from the owner's own boardwalk model
(assets/habitation/woodenboardwalk3dmodel.glb, read only: it stays exactly as he sent it).

The paths' boardwalks and bridges are laid plank by plank along them (render-habitation.js buildDecks), since his one
boardwalk is a single curved piece with a round platform at its end; their planks, posts and rails wear his
boardwalk's own weathered wood. This cuts a run of its planks out of the model's picture where they lie nearly
straight, turns it so that the grain runs along u, and makes it repeat without a seam either way (each edge faded into
the opposite one), at two sizes: a computer's (512 x 256) and a phone's (256 x 128). Written beside the dressed copies
(assets/habitation-dressed/deck-wood.full.webp, .lite.webp), and noted in made.json under "decks" with the MD5 of the
file it was made from (build.mjs refuses to send a copy made from another file).

    python3 tools/habitation/deck-wood.py
"""
import hashlib, io, json, os, sys
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import glbio  # noqa: E402

ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))
SOURCE = 'woodenboardwalk3dmodel.glb'
OUT = os.path.join(ROOT, 'assets', 'habitation-dressed')
# where in his picture (as shares of its width and height) a run of planks lies nearly straight, and the angle of
# their grain there (degrees, turned to lie along u)
REGION = (0.785, 0.165, 0.875, 0.245)
GRAIN = 31.0


def seamless(a, fade):
    """Each edge faded into the opposite one, so that the picture repeats without a seam (a: float array h x w x 3)."""
    h, w, _ = a.shape
    out = a.copy()
    for k in range(fade):
        t = (k + 0.5) / fade
        out[:, k] = a[:, k] * t + a[:, w - fade + k] * (1 - t)
    out = out[:, :w - fade]
    h, w, _ = out.shape
    res = out.copy()
    for k in range(fade):
        t = (k + 0.5) / fade
        res[k] = out[k] * t + out[h - fade + k] * (1 - t)
    return res[:h - fade]


def main():
    path = os.path.join(ROOT, 'assets', 'habitation', SOURCE)
    raw = open(path, 'rb').read()
    md5 = hashlib.md5(raw).hexdigest()
    model = glbio.read(path)
    Image.MAX_IMAGE_PIXELS = None
    pic = Image.open(io.BytesIO(model['image'])).convert('RGB')
    W, H = pic.size
    x0, y0, x1, y1 = (int(REGION[0] * W), int(REGION[1] * H), int(REGION[2] * W), int(REGION[3] * H))
    cut = pic.crop((x0, y0, x1, y1)).rotate(GRAIN, resample=Image.BICUBIC, expand=False)
    # (the corners the turn brought in are cut away: the middle, two to one)
    cw, ch = cut.size
    keep_w, keep_h = int(cw * 0.7), int(cw * 0.35)
    keep_h = min(keep_h, int(ch * 0.62))
    cut = cut.crop(((cw - keep_w) // 2, (ch - keep_h) // 2, (cw + keep_w) // 2, (ch + keep_h) // 2))
    a = np.asarray(cut.resize((1152, 576), Image.LANCZOS)).astype(np.float64)
    a = seamless(a, 128)
    tile = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
    made_path = os.path.join(OUT, 'made.json')
    made = json.load(open(made_path))
    made.setdefault('decks', {})
    for name, size in (('deck-wood.full', (512, 256)), ('deck-wood.lite', (256, 128))):
        out = tile.resize(size, Image.LANCZOS)
        buf = io.BytesIO(); out.save(buf, 'WEBP', quality=86, method=6)
        open(os.path.join(OUT, f'{name}.webp'), 'wb').write(buf.getvalue())
        made['decks'][name] = {'source': SOURCE, 'md5': md5, 'size': list(size), 'bytes': len(buf.getvalue()), 'region': list(REGION), 'grain': GRAIN}
        print(name, size, len(buf.getvalue()), 'bytes')
    open(made_path, 'w').write(json.dumps(made, indent=1) + '\n')


if __name__ == '__main__':
    main()
