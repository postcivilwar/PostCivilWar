# The town's voices (28 October 2026): the light copies the game plays, made from the recordings as they were made
# (assets/voices/original/<line id>.mp3, kept byte for byte and never sent to the page).
#
# Each copy: one channel, the silence at its two ends taken off, its loudness evened out with the others (so that no
# voice is much louder than the rest), at 24 kHz and 48 kbit/s MP3, which every browser plays: about 20 to 40 KB for
# a line of two to eight seconds. Written to assets/voices/game/<line id>.mp3, with every copy's length in seconds in
# _lengths.json (tools/voices/data.mjs reads it) and what was found in _report.json: lines too short, too long, too
# quiet, or spoken too fast for their words.
#   python3 tools/voices/game_copies.py
import csv, json, os, re, subprocess, sys

root = os.path.normpath(os.path.join(os.path.dirname(__file__), '..', '..'))
src = os.path.join(root, 'assets', 'voices', 'original')
out = os.path.join(root, 'assets', 'voices', 'game')
os.makedirs(out, exist_ok=True)
script = {r['line ID (file name)']: r for r in csv.DictReader(open(os.path.join(root, 'assets', 'voices', 'script.csv'), encoding='utf-8-sig'))}


def probe(path):
    seconds = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path], capture_output=True, text=True).stdout.strip() or 0)
    vol = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', path, '-af', 'volumedetect', '-f', 'null', '-'], capture_output=True, text=True).stderr
    mean = re.search(r'mean_volume: (-?[\d.]+)', vol)
    peak = re.search(r'max_volume: (-?[\d.]+)', vol)
    return seconds, float(mean.group(1)) if mean else -99.0, float(peak.group(1)) if peak else -99.0


lengths, report = {}, {}
names = sorted(n for n in os.listdir(src) if n.endswith('.mp3')) if os.path.isdir(src) else []
for name in names:
    lid = name[:-4]
    if lid not in script:
        report[lid] = {'problems': ['not in the script']}
        continue
    original = os.path.join(src, name)
    game = os.path.join(out, name)
    if not os.path.exists(game) or os.path.getmtime(game) < os.path.getmtime(original):
        subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', original, '-af',
                        'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05,areverse,'
                        'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.15,areverse,'
                        'loudnorm=I=-18:TP=-2:LRA=9',
                        '-ac', '1', '-ar', '24000', '-c:a', 'libmp3lame', '-b:a', '48k', '-map_metadata', '-1', game], check=True)
    seconds, mean, peak = probe(original)
    game_seconds, _, _ = probe(game)
    words = len(re.sub(r'\[[^\]]*\]', '', script[lid]['text to paste in ElevenLabs']).split())
    problems = []
    if game_seconds < 1.0: problems.append('too short')
    if game_seconds > 9.0: problems.append('too long')
    if mean < -42 or peak < -22: problems.append('too quiet')
    if words / max(game_seconds, 0.1) > 5.5: problems.append('too fast for its words, or cut short')
    if words / max(game_seconds, 0.1) < 0.8: problems.append('much longer than its words need')
    lengths[lid] = round(game_seconds, 3)
    report[lid] = {'seconds': round(seconds, 2), 'game_seconds': round(game_seconds, 2), 'kb': round(os.path.getsize(game) / 1024, 1), 'mean_db': mean, 'problems': problems}

json.dump(lengths, open(os.path.join(out, '_lengths.json'), 'w'), indent=0, sort_keys=True)
json.dump(report, open(os.path.join(out, '_report.json'), 'w'), indent=1, sort_keys=True)
missing = [l for l in script if l not in lengths]
bad = {l: r['problems'] for l, r in report.items() if r['problems']}
kb = [r['kb'] for r in report.values() if 'kb' in r]
print(f'recorded {len(lengths)} of {len(script)}; missing {len(missing)}; with a problem {len(bad)}')
if kb: print('game copies: %.1f KB on average, %.1f to %.1f KB, %.1f MB in all' % (sum(kb) / len(kb), min(kb), max(kb), sum(kb) / 1024))
for l, p in bad.items(): print(' ', l, ', '.join(p))
if '--missing' in sys.argv:
    for l in missing: print('missing', l)
