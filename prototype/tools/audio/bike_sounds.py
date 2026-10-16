"""The owner's motorcycle recordings (16 October 2026), made ready for the game. The supplied files are kept as they
are in assets/vehicles/bikes/sound/original/ (byte for byte; their checksums are in sounds.json); nothing here
writes to them.

    python3 tools/audio/bike_sounds.py      writes assets/vehicles/bikes/sound/game/*.wav and sounds.json

None of the files says what it is (their names were cut short where they were made, "A_hyper-realistic_re_1" ...
and "gp_motor_powerbikes_3/4", and their only tag is the encoder's), so each was listened to by measuring it:
when it is silent and when it sounds, how the engine's firing frequency (its pitch) moves, and how bright it is.
What each is, read that way:

    re1-start-stop   silence, then an engine catching with two stutters, idling with a few blips of the
                     throttle, then switched off and running down          the start, and the switching off
    re1-steady       a loud, steady low engine (about 46 firing a second) rising to about 70 and back
    re2-shutdown     a deep idle (about 33) that dies away over its last five seconds
    re2-idle         a steady deep idle (about 40)
    re3-blips        an idle with short blips of the throttle
    re3-letoff       revs held high and let fall
    re4-cruise       a steady mid-revs run that fades in and out (about 55)
    re4-revs         the throttle opened twice, the revs sweeping up (to about 110) and down
    gp3-gears        a high-revving sports bike accelerating hard, up through its gears (about 140 to 250)
    gp4-flat-out     a sports bike held at high revs (about 85, very bright)

The nine "A_hyper-realistic" files are a big, slow, deep twin (a cruiser); the two "gp_motor_powerbikes" are a
screaming high-revving sports bike. No file is a horn, so the horn stays the one the game makes (bike-audio.js).

From them, for each of the two kinds of engine, three seamless loops (idle, middle and high revs: a stretch whose
pitch holds steady, its end blended into its start so that it repeats without a seam), and for both the start and
the switching off. The game plays the loops together, faded into one another and sped up with the revs, so that
the engine climbs and falls smoothly with the bike (bike-audio.js). Each is 48 kHz stereo WAV as supplied.
"""
import hashlib, json, os, wave
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))
SRC = os.path.join(ROOT, 'assets', 'vehicles', 'bikes', 'sound', 'original')
OUT = os.path.join(ROOT, 'assets', 'vehicles', 'bikes', 'sound', 'game')

# what each supplied file is (see above), by its checksum's start
NAMES = {
    '9cbdaea0': 're1-start-stop', '099296e7': 're1-steady', 'dc2c5cec': 're2-shutdown', 'd121bac8': 're2-idle',
    '1379c0bd': 're3-blips', '333a7e15': 're3-letoff', 'e03ee453': 're4-cruise', '6a5add90': 're4-revs',
    '8fcac2ce': 'gp3-gears', 'b90360e0': 'gp4-flat-out',
}
# the loops: (kind, layer) -> (file, search from, to, seconds long)
LOOPS = {
    ('twin', 'idle'): ('re2-idle', 0.5, 6.0, 3.0),
    ('twin', 'mid'): ('re4-cruise', 5.0, 15.0, 3.0),
    ('twin', 'high'): ('re4-revs', 7.6, 10.2, 1.6),
    ('sport', 'idle'): ('re1-steady', 1.0, 9.0, 3.0),
    ('sport', 'mid'): ('gp4-flat-out', 1.0, 12.5, 3.0),
    ('sport', 'high'): ('gp3-gears', 0.5, 12.8, 1.4),
}
# the start (from the moment it catches) and the switching off (from just before it is cut)
ONE_SHOTS = {'start': ('re1-start-stop', 0.80, 3.20), 'stop': ('re1-start-stop', 18.70, 21.48)}
BLEND = 0.18          # seconds of a loop's end blended into its start


def read(path):
    w = wave.open(path)
    sr, ch, n = w.getframerate(), w.getnchannels(), w.getnframes()
    a = np.frombuffer(w.readframes(n), np.int16).reshape(-1, ch).astype(np.float64) / 32768
    return a, sr


def write(path, a, sr):
    b = np.clip(np.round(a * 32767), -32768, 32767).astype('<i2')
    w = wave.open(path, 'wb'); w.setnchannels(a.shape[1]); w.setsampwidth(2); w.setframerate(sr); w.writeframes(b.tobytes()); w.close()


def pitch(mono, sr):
    """The engine's firing frequency in a stretch (harmonic product spectrum, 18 to 300 a second)."""
    sp = np.abs(np.fft.rfft(mono * np.hanning(len(mono)), 4 * len(mono)))
    fr = np.fft.rfftfreq(4 * len(mono), 1 / sr)
    hps = sp.copy()
    for k in (2, 3, 4): hps[:len(sp) // k] *= sp[::k][:len(sp) // k]
    m = (fr > 18) & (fr < 300)
    return float(fr[m][np.argmax(hps[m])])


def steadiest(a, sr, start, end, length):
    """The stretch of `length` seconds between `start` and `end` whose loudness and pitch hold most steady, and
    whose end sounds most like its start (so that the blend is not heard)."""
    mono = a.mean(1)
    best = None
    for t in np.arange(start, end - length - BLEND, 0.05):
        i, j = int(t * sr), int((t + length + BLEND) * sr)
        seg = mono[i:j]
        parts = np.array_split(seg, 8)
        rms = np.array([np.sqrt(np.mean(p ** 2)) for p in parts])
        f0 = np.array([pitch(p, sr) for p in parts[::2]])
        head, tail = seg[:int(BLEND * sr)], seg[-int(BLEND * sr):]
        like = np.corrcoef(np.abs(np.fft.rfft(head))[:2000], np.abs(np.fft.rfft(tail))[:2000])[0, 1]
        score = rms.std() / (rms.mean() + 1e-9) + f0.std() / (f0.mean() + 1e-9) - 0.3 * like
        if best is None or score < best[0]: best = (score, float(t), float(np.median(f0)), float(rms.mean()))
    return best


def looped(a, sr, t, length):
    """`length` seconds from `t`, with the BLEND that follows it laid over its start (equal power): it repeats
    without a seam."""
    i, n, x = int(t * sr), int(length * sr), int(BLEND * sr)
    seg = a[i:i + n + x].copy()
    k = np.linspace(0, 1, x)[:, None]
    seg[:x] = seg[:x] * np.sqrt(k) + seg[n:n + x] * np.sqrt(1 - k)
    return seg[:n]


def main():
    os.makedirs(OUT, exist_ok=True)
    files = {}
    for f in sorted(os.listdir(SRC)):
        if not f.endswith('.wav'): continue
        raw = open(os.path.join(SRC, f), 'rb').read()
        h = hashlib.sha256(raw).hexdigest()
        files[NAMES.get(h[:8], f[:-4])] = {'file': f, 'sha256': h, 'bytes': len(raw)}
    out = {'originals': files, 'loops': {}, 'oneShots': {}}
    for (kind, layer), (name, s, e, length) in LOOPS.items():
        a, sr = read(os.path.join(SRC, files[name]['file']))
        score, t, f0, rms = steadiest(a, sr, s, e, length)
        loop = looped(a, sr, t, length)
        # every loop brought to the same loudness, so that one fades into the next without a jump
        loop = loop * (0.25 / (np.sqrt(np.mean(loop ** 2)) + 1e-9))
        loop = loop * min(1, 0.98 / np.abs(loop).max())
        path = f'{kind}-{layer}.wav'
        write(os.path.join(OUT, path), loop, sr)
        out['loops'][f'{kind}-{layer}'] = {'file': path, 'from': name, 'at': round(t, 2), 'seconds': length, 'firing': round(f0, 1)}
        print(kind, layer, name, round(t, 2), 'firing', round(f0, 1))
    for key, (name, s, e) in ONE_SHOTS.items():
        a, sr = read(os.path.join(SRC, files[name]['file']))
        seg = a[int(s * sr):int(e * sr)].copy()
        f = int(0.015 * sr); seg[:f] *= np.linspace(0, 1, f)[:, None]; seg[-f:] *= np.linspace(1, 0, f)[:, None]
        path = f'{key}.wav'
        write(os.path.join(OUT, path), seg, sr)
        out['oneShots'][key] = {'file': path, 'from': name, 'at': s, 'seconds': round(e - s, 2)}
    json.dump(out, open(os.path.join(ROOT, 'assets', 'vehicles', 'bikes', 'sound', 'sounds.json'), 'w'), indent=1)


if __name__ == '__main__':
    main()
